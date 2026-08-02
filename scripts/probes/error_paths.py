#!/usr/bin/env python3
"""Ordinary mistakes must return ordinary errors.

Every unit test in this repo uses fresh, unique inputs. Nobody tests doing the
same thing twice, or fumbling a token — which is exactly what real users do.
A 4xx is a product decision; a 5xx is a bug wearing an outage costume.

Run against the DEPLOYED app. A probe against localhost tests your laptop.

    python3 scripts/probes/error_paths.py --selftest
    python3 scripts/probes/error_paths.py --base-url https://<host>

Exit 1 if any ordinary mistake returns 5xx, or if fewer checks ran than
expected — a green run with a low assertion count is a failed run.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

TIMEOUT = 30


def request(method: str, url: str, body: bytes | None = None, headers: dict | None = None):
    """Return (status, text). Never raises for HTTP status — that IS the result."""
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, r.read(2000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read(2000).decode("utf-8", "replace")
    except Exception as e:  # network/DNS — not a status, and must not read as pass
        return 0, f"{type(e).__name__}: {e}"


# (label, method, path, body, headers, what a correct service does)
def checks(base: str):
    j = {"Content-Type": "application/json"}
    return [
        ("share link with a garbage token", "GET", "/p/not-a-real-token", None, None),
        ("share link with a token-shaped lie", "GET", "/p/" + "a" * 64, None, None),
        ("stripe webhook, no signature", "POST", "/api/stripe/webhook", b"{}", j),
        ("stripe webhook, forged signature", "POST", "/api/stripe/webhook", b"{}",
         {**j, "stripe-signature": "t=1,v1=deadbeef"}),
        ("stripe webhook, malformed body", "POST", "/api/stripe/webhook", b"not json",
         {**j, "stripe-signature": "t=1,v1=deadbeef"}),
        ("zernio webhook, no signature", "POST", "/api/webhooks/zernio", b"{}", j),
        ("cron worker, no bearer token", "POST", "/api/jobs/storyboard-animate", b"", None),
        ("cron worker, wrong bearer token", "POST", "/api/jobs/storyboard-animate", b"",
         {"Authorization": "Bearer nope"}),
        ("a route that does not exist", "GET", "/definitely-not-a-page", None, None),
    ]


def run(base: str) -> int:
    base = base.rstrip("/")
    rows, failures, ran = [], 0, 0

    for label, method, path, body, headers in checks(base):
        status, text = request(method, base + path, body, headers)
        ran += 1
        if status == 0:
            verdict = "UNREACHABLE"
            failures += 1
        elif status >= 500:
            verdict = "FAIL 5xx"
            failures += 1
        elif status == 0:
            verdict = "FAIL"
            failures += 1
        else:
            verdict = "ok"
        rows.append((verdict, status, label, text[:90].replace("\n", " ")))

    # CONTROL: the app must actually be up, or every 4xx above is meaningless.
    home_status, _ = request("GET", base + "/")
    control_ok = home_status == 200
    if not control_ok:
        failures += 1

    width = max(len(r[2]) for r in rows)
    for verdict, status, label, snippet in rows:
        mark = "  " if verdict == "ok" else "! "
        print(f"{mark}{status:>3}  {label:<{width}}  {verdict}")
        if verdict != "ok":
            print(f"       {snippet}")

    print()
    print(f"  CONTROL  app root returns 200: {'yes' if control_ok else 'NO — results above are meaningless'}")
    print(f"  RESULT: {ran} checks ran, {failures} failed")

    expected = len(checks(base))
    if ran < expected:
        print(f"  ONLY {ran}/{expected} CHECKS RAN — treat this run as failed")
        return 1
    return 1 if failures else 0


# --- selftest ---------------------------------------------------------------
# Known-bad fixtures: the probe must catch a 5xx and must catch a dead host.

def selftest() -> int:
    import http.server
    import threading

    class H(http.server.BaseHTTPRequestHandler):
        def _go(self):
            if self.path == "/":
                self.send_response(200)
            elif self.path == "/boom":
                self.send_response(500)  # the failure the probe exists to catch
            else:
                self.send_response(404)
            self.end_headers()
            self.wfile.write(b"x")

        do_GET = do_POST = _go

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"

    passed = failed = 0

    def check(name, cond):
        nonlocal passed, failed
        if cond:
            passed += 1
            print(f"  PASS  {name}")
        else:
            failed += 1
            print(f"  FAIL  {name}")

    status, _ = request("GET", base + "/boom")
    check("catches a 5xx", status == 500)

    status, _ = request("GET", base + "/missing")
    check("a 404 is not treated as a failure", status == 404)

    status, body = request("GET", "http://127.0.0.1:1/nope")
    check("an unreachable host is status 0, never a pass", status == 0)

    status, _ = request("GET", base + "/")
    check("control request works", status == 200)

    srv.shutdown()
    status, _ = request("GET", base + "/")
    check("a dead server does not report 200", status != 200)

    print(f"\n  RESULT: {passed} passed, {failed} failed")
    return 1 if failed else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if not a.base_url:
        print("need --base-url (the DEPLOYED host) or --selftest", file=sys.stderr)
        return 2
    return run(a.base_url)


if __name__ == "__main__":
    raise SystemExit(main())
