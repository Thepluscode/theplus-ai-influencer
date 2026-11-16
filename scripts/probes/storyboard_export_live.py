#!/usr/bin/env python3
"""Production smoke test for the real storyboard MP4 export path.

Creates two throwaway users and one approved storyboard, uploads the repository's
short fixture clips to a temporary public Supabase bucket, queues the export twice,
and invokes the deployed worker. It verifies the resulting MP4, authorized download,
tenant isolation, and cleanup without calling Luma, OpenAI, or Zernio.

Run with the production Railway environment so the dedicated cron credential is
available without printing it:

    railway run --service web --environment production --no-local \
      python3 scripts/probes/storyboard_export_live.py
"""

from __future__ import annotations

import base64
import concurrent.futures
import json
import os
import secrets
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REQUEST_TIMEOUT = 30
WORKER_TIMEOUT = 150
COOKIE_CHUNK_SIZE = 3180
FIXTURE_DIR = Path(__file__).resolve().parents[2] / "src/test/fixtures/videos"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(
    method,
    url,
    *,
    token=None,
    apikey=None,
    body=None,
    raw=None,
    headers=None,
    follow_redirects=True,
    timeout=REQUEST_TIMEOUT,
):
    request_headers = dict(headers or {})
    if apikey:
        request_headers["apikey"] = apikey
    if token:
        request_headers["Authorization"] = f"Bearer {token}"
    data = raw
    if body is not None:
        data = json.dumps(body).encode()
        request_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=request_headers)
    opener = urllib.request.build_opener() if follow_redirects else urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(req, timeout=timeout) as response:
            payload = response.read()
            return response.status, parse_payload(payload, response.headers), dict(response.headers)
    except urllib.error.HTTPError as error:
        payload = error.read()
        return error.code, parse_payload(payload, error.headers), dict(error.headers)


def parse_payload(payload, headers):
    content_type = headers.get("Content-Type", "")
    if "json" in content_type:
        return json.loads(payload.decode()) if payload else None
    if content_type.startswith("text/"):
        return payload.decode("utf-8", "replace")
    return payload


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def returned_row(payload):
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, list) and len(payload) == 1 and isinstance(payload[0], dict):
        return payload[0]
    raise AssertionError(f"Expected one returned row, got {type(payload).__name__}")


def session_cookie(project_url, auth_payload):
    project_ref = urllib.parse.urlparse(project_url).hostname.split(".")[0]
    session = dict(auth_payload)
    session["expires_at"] = int(time.time()) + int(session["expires_in"])
    encoded = base64.urlsafe_b64encode(
        json.dumps(session, separators=(",", ":")).encode()
    ).decode().rstrip("=")
    value = "base64-" + encoded
    name = f"sb-{project_ref}-auth-token"
    if len(value) <= COOKIE_CHUNK_SIZE:
        return f"{name}={value}"
    chunks = [value[i : i + COOKIE_CHUNK_SIZE] for i in range(0, len(value), COOKIE_CHUNK_SIZE)]
    return "; ".join(f"{name}.{index}={chunk}" for index, chunk in enumerate(chunks))


def dominant_channel(mp4_path, seconds):
    pixel = subprocess.check_output(
        [
            "ffmpeg",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            str(seconds),
            "-i",
            str(mp4_path),
            "-frames:v",
            "1",
            "-vf",
            "scale=1:1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
        ]
    )
    channels = (pixel[0], pixel[1], pixel[2])
    return ("red", "green", "blue")[channels.index(max(channels))]


def probe_mp4(payload):
    with tempfile.NamedTemporaryFile(suffix=".mp4") as output:
        output.write(payload)
        output.flush()
        probe = json.loads(
            subprocess.check_output(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_streams",
                    "-show_format",
                    "-of",
                    "json",
                    output.name,
                ],
                text=True,
            )
        )
        video = next(stream for stream in probe["streams"] if stream["codec_type"] == "video")
        audio = [stream for stream in probe["streams"] if stream["codec_type"] == "audio"]
        duration = float(probe["format"]["duration"])
        require(video["codec_name"] == "h264", f"unexpected codec: {video['codec_name']}")
        require((video["width"], video["height"]) == (720, 1280), "wrong output dimensions")
        require(1.45 <= duration <= 1.70, f"wrong output duration: {duration}")
        require(bool(audio), "output has no audio stream")
        order = [dominant_channel(output.name, second) for second in (0.2, 0.7, 1.2)]
        require(order == ["red", "green", "blue"], f"wrong shot order: {order}")
        return duration, order


def run():
    supabase_url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    anon_key = os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
    service_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    app_url = os.environ["NEXT_PUBLIC_APP_URL"].rstrip("/")
    cron_secret = os.environ["CRON_SECRET"]
    marker = f"storyboard-export-smoke-{secrets.token_hex(6)}"
    bucket = marker
    users = []
    storyboard_id = None
    output_path = None
    cleanup_errors = []
    result = None

    def admin(method, path, **kwargs):
        return request(
            method,
            supabase_url + path,
            token=service_key,
            apikey=service_key,
            **kwargs,
        )

    try:
        status, payload, _ = admin(
            "POST",
            "/storage/v1/bucket",
            body={
                "id": bucket,
                "name": bucket,
                "public": True,
                "file_size_limit": 10_485_760,
                "allowed_mime_types": ["video/mp4"],
            },
        )
        require(status in (200, 201), f"fixture bucket creation failed: {status} {payload}")

        fixture_names = ["01-red-audio.mp4", "02-green-silent.mp4", "03-blue-audio.mp4"]
        fixture_urls = []
        for name in fixture_names:
            fixture_path = FIXTURE_DIR / name
            require(fixture_path.is_file(), f"missing fixture: {fixture_path}")
            object_path = urllib.parse.quote(f"{bucket}/{name}", safe="/")
            status, payload, _ = admin(
                "POST",
                f"/storage/v1/object/{object_path}",
                raw=fixture_path.read_bytes(),
                headers={"Content-Type": "video/mp4", "x-upsert": "true"},
            )
            require(status in (200, 201), f"fixture upload failed: {status} {payload}")
            fixture_urls.append(
                f"{supabase_url}/storage/v1/object/public/{bucket}/{urllib.parse.quote(name)}"
            )

        credentials = []
        for label in ("a", "b"):
            email = f"{marker}-{label}@example.com"
            password = f"Smoke-{secrets.token_hex(10)}!"
            status, user, _ = admin(
                "POST",
                "/auth/v1/admin/users",
                body={"email": email, "password": password, "email_confirm": True},
            )
            require(status == 200 and isinstance(user, dict) and user.get("id"), "user setup failed")
            users.append(user["id"])
            credentials.append((email, password))

        auth_payloads = []
        tokens = []
        workspace_ids = []
        for user_id, (email, password) in zip(users, credentials):
            status, rows, _ = admin(
                "GET",
                f"/rest/v1/workspaces?owner_user_id=eq.{user_id}&select=id&order=created_at.asc&limit=1",
            )
            require(status == 200 and isinstance(rows, list) and len(rows) == 1, "workspace setup failed")
            workspace_ids.append(rows[0]["id"])
            status, auth, _ = request(
                "POST",
                f"{supabase_url}/auth/v1/token?grant_type=password",
                apikey=anon_key,
                body={"email": email, "password": password},
            )
            require(status == 200 and isinstance(auth, dict) and auth.get("access_token"), "sign-in failed")
            auth_payloads.append(auth)
            tokens.append(auth["access_token"])

        shots = [
            {
                "index": index,
                "prompt": f"production smoke shot {index + 1}",
                "imageUrl": "https://example.com/smoke.jpg",
                "hookCaption": "Production smoke fixture",
                "durationMs": 500,
                "videoUrl": video_url,
            }
            for index, video_url in enumerate(fixture_urls)
        ]
        status, created, _ = request(
            "POST",
            f"{supabase_url}/rest/v1/storyboards",
            token=tokens[0],
            apikey=anon_key,
            body={
                "workspace_id": workspace_ids[0],
                "name": marker,
                "brief": "Isolated production MP4 export smoke fixture",
                "format": "portrait",
                "summary": "Temporary fixture; delete after verification.",
                "shots": shots,
            },
            headers={"Prefer": "return=representation"},
        )
        require(status == 201, f"storyboard creation failed: {status} {created}")
        storyboard_id = returned_row(created)["id"]

        status, decision, _ = request(
            "POST",
            f"{supabase_url}/rest/v1/rpc/record_storyboard_review_decision",
            token=tokens[0],
            apikey=anon_key,
            body={
                "p_workspace_id": workspace_ids[0],
                "p_storyboard_id": storyboard_id,
                "p_decision": "approved",
                "p_reviewer_name": "Production smoke probe",
                "p_reviewer_email": "",
                "p_summary": "Approved only for isolated production export verification.",
            },
        )
        require(status == 200 and returned_row(decision).get("id"), "approval failed")

        barrier = threading.Barrier(2)

        def enqueue():
            barrier.wait()
            return request(
                "POST",
                f"{supabase_url}/rest/v1/rpc/enqueue_storyboard_export",
                token=tokens[0],
                apikey=anon_key,
                body={"p_workspace_id": workspace_ids[0], "p_storyboard_id": storyboard_id},
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            enqueued = [future.result() for future in [executor.submit(enqueue), executor.submit(enqueue)]]
        require(all(item[0] == 200 for item in enqueued), "concurrent enqueue failed")
        job_ids = [returned_row(item[1])["id"] for item in enqueued]
        require(job_ids[0] == job_ids[1], f"duplicate jobs returned: {job_ids}")
        job_id = job_ids[0]

        status, rows, _ = admin(
            "GET",
            f"/rest/v1/storyboard_export_jobs?storyboard_id=eq.{storyboard_id}&select=id",
        )
        require(status == 200 and len(rows) == 1, f"expected one job, got {rows}")

        status, worker, _ = request(
            "POST",
            f"{app_url}/api/jobs/storyboard-export",
            token=cron_secret,
            body={},
            timeout=WORKER_TIMEOUT,
        )
        require(status == 200, f"worker failed: {status} {worker}")
        require(worker.get("jobId") == job_id and worker.get("status") == "completed", str(worker))

        cookies = [session_cookie(supabase_url, auth) for auth in auth_payloads]
        status_url = f"{app_url}/api/jobs/storyboard-export/status?storyboardId={storyboard_id}"
        status, owner_status, _ = request("GET", status_url, headers={"Cookie": cookies[0]})
        require(status == 200 and owner_status.get("status") == "completed", "owner status failed")
        require(
            (owner_status.get("width"), owner_status.get("height")) == (720, 1280),
            f"wrong status dimensions: {owner_status}",
        )
        status, other_status, _ = request("GET", status_url, headers={"Cookie": cookies[1]})
        require(status == 200 and other_status == {"status": "none"}, "cross-workspace status leak")

        download_path = f"/api/storyboards/{storyboard_id}/exports/{job_id}/download"
        status, denied, _ = request(
            "GET",
            app_url + download_path,
            headers={"Cookie": cookies[1]},
            follow_redirects=False,
        )
        require(status == 404, f"cross-workspace download was not hidden: {status} {denied}")
        status, _, response_headers = request(
            "GET",
            app_url + download_path,
            headers={"Cookie": cookies[0]},
            follow_redirects=False,
        )
        location = response_headers.get("Location") or response_headers.get("location")
        cache_control = response_headers.get("Cache-Control") or response_headers.get("cache-control")
        require(status == 302 and location, f"authorized download did not redirect: {status}")
        require(cache_control == "private, no-store", f"unsafe cache header: {cache_control}")
        status, mp4, headers = request("GET", location)
        require(status == 200 and isinstance(mp4, bytes) and len(mp4) > 1_000, "signed download failed")
        require("video/mp4" in headers.get("Content-Type", ""), "download is not video/mp4")
        duration, order = probe_mp4(mp4)

        status, jobs, _ = admin(
            "GET",
            f"/rest/v1/storyboard_export_jobs?id=eq.{job_id}&select=output_path,output_bytes,output_duration_ms,output_width,output_height,has_audio,attempts",
        )
        require(status == 200 and len(jobs) == 1, "completed job disappeared")
        job = jobs[0]
        output_path = job["output_path"]
        require(job["attempts"] == 1, f"unexpected attempts: {job['attempts']}")
        require(job["output_bytes"] == len(mp4), "stored output size does not match download")
        require(job["has_audio"] is True, "completed job did not record audio")

        public_output_url = (
            f"{supabase_url}/storage/v1/object/public/storyboard-exports/"
            f"{urllib.parse.quote(output_path, safe='/')}"
        )
        status, _, _ = request("GET", public_output_url, apikey=anon_key)
        require(status >= 400, f"private output was publicly downloadable: {status}")

        result = {
            "job_id": job_id,
            "bytes": len(mp4),
            "duration": duration,
            "order": order,
            "dimensions": "720x1280",
        }
    except Exception as error:
        failure = error
    else:
        failure = None
    finally:
        if output_path:
            status, payload, _ = admin(
                "DELETE",
                f"/storage/v1/object/storyboard-exports/{urllib.parse.quote(output_path, safe='/')}",
            )
            if status not in (200, 204):
                cleanup_errors.append(f"output object: {status} {payload}")
        if storyboard_id:
            status, payload, _ = admin(
                "DELETE", f"/rest/v1/storyboards?id=eq.{storyboard_id}"
            )
            if status not in (200, 204):
                cleanup_errors.append(f"storyboard: {status} {payload}")
        for name in ("01-red-audio.mp4", "02-green-silent.mp4", "03-blue-audio.mp4"):
            status, payload, _ = admin(
                "DELETE",
                f"/storage/v1/object/{urllib.parse.quote(f'{bucket}/{name}', safe='/')}",
            )
            if status not in (200, 204, 404):
                cleanup_errors.append(f"fixture {name}: {status} {payload}")
        status, payload, _ = admin("DELETE", f"/storage/v1/bucket/{bucket}")
        if status not in (200, 204, 404):
            cleanup_errors.append(f"fixture bucket: {status} {payload}")
        for user_id in users:
            status, payload, _ = admin("DELETE", f"/auth/v1/admin/users/{user_id}")
            if status not in (200, 204, 404):
                cleanup_errors.append(f"user: {status} {payload}")

    if failure:
        raise failure
    require(not cleanup_errors, "cleanup failed: " + "; ".join(cleanup_errors))
    status, rows, _ = admin("GET", f"/rest/v1/storyboards?name=eq.{marker}&select=id")
    require(status == 200 and rows == [], f"storyboard residue remains: {rows}")
    print("  PASS  one concurrent pair created one export job")
    print("  PASS  deployed worker rendered and privately stored the MP4")
    print("  PASS  owner received an expiring authorized download")
    print("  PASS  second workspace saw neither status nor download")
    print("  PASS  MP4 is H.264/AAC, 720x1280, with red -> green -> blue order")
    print("  PASS  smoke users, storyboard, files, and fixture bucket were removed")
    print(
        f"  RESULT: bytes={result['bytes']} duration={result['duration']:.3f}s "
        f"dimensions={result['dimensions']} order={','.join(result['order'])}"
    )


if __name__ == "__main__":
    run()
