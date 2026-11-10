#!/usr/bin/env python3
"""Can user B reach user A's data?

Row-level security is a claim until someone tries it with a real second session.
This provisions two throwaway users against the DEPLOYED Supabase project, puts
a unique marker in A's workspace, then attempts to reach it as B — over HTTP,
with B's real JWT, the way an attacker would.

SCOPE: the PostgREST/RPC layer. It does NOT cover page-fragment or CDN caching
of rendered HTML, which needs an authenticated browser session; that remains
unprobed and is called out in the output rather than quietly implied.

    python3 scripts/probes/cross_user.py --selftest
    python3 scripts/probes/cross_user.py --env-file .env.local

Exit 1 on any leak, on any failed CONTROL (a probe whose positive case does not
work proves nothing), or if fewer assertions ran than expected.
"""

from __future__ import annotations

import argparse
import json
import secrets
import sys
import urllib.error
import urllib.request

TIMEOUT = 30


def call(method, url, token=None, apikey=None, body=None, extra=None):
    headers = {"Content-Type": "application/json"}
    if apikey:
        headers["apikey"] = apikey
    if token:
        headers["Authorization"] = f"Bearer {token}"
    headers.update(extra or {})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            raw = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(raw) if raw.strip() else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"


class Probe:
    def __init__(self):
        self.passed = self.failed = 0
        self.notes = []

    def check(self, kind, name, cond, detail=""):
        tag = {"CONTROL": "CONTROL", "LEAK": "ISOLATION"}.get(kind, kind)
        if cond:
            self.passed += 1
            print(f"  PASS  [{tag}] {name}")
        else:
            self.failed += 1
            print(f"  FAIL  [{tag}] {name}")
            if detail:
                print(f"          {detail}")

    def summary(self, expected):
        total = self.passed + self.failed
        print()
        for n in self.notes:
            print(f"  NOTE  {n}")
        print(f"  RESULT: {self.passed} passed, {self.failed} failed ({total} assertions)")
        if total < expected:
            print(f"  ONLY {total}/{expected} ASSERTIONS RAN — treat this run as failed")
            return 1
        return 1 if self.failed else 0


def load_env(path):
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def run(env) -> int:
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    anon = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
    srk = env["SUPABASE_SERVICE_ROLE_KEY"]
    p = Probe()
    marker = f"probe-{secrets.token_hex(6)}"
    users, workspaces = [], []

    def admin(method, path, body=None):
        return call(method, url + path, token=srk, apikey=srk, body=body)

    try:
        # --- provision two real users ------------------------------------
        creds = []
        for who in ("a", "b"):
            email = f"probe-{who}-{secrets.token_hex(4)}@example.com"
            pw = f"Probe-{secrets.token_hex(8)}!"
            st, u = admin("POST", "/auth/v1/admin/users",
                          {"email": email, "password": pw, "email_confirm": True})
            if st != 200 or not isinstance(u, dict) or "id" not in u:
                print(f"  SETUP FAILED creating user {who}: {st} {u}")
                return 1
            users.append(u["id"])
            creds.append((email, pw))

        # A workspace for each, A's carrying the marker.
        for i, uid in enumerate(users):
            st, w = admin("POST", "/rest/v1/workspaces",
                          {"owner_user_id": uid,
                           "name": f"{marker}-{'A' if i == 0 else 'B'}",
                           "credits": 100})
            if st not in (200, 201):
                print(f"  SETUP FAILED creating workspace: {st} {w}")
                return 1
        st, rows = admin("GET", f"/rest/v1/workspaces?name=like.{marker}*&select=id,name,owner_user_id")
        workspaces = rows if isinstance(rows, list) else []
        if len(workspaces) != 2:
            print(f"  SETUP FAILED: expected 2 workspaces, got {len(workspaces)}")
            return 1
        ws_a = next(w for w in workspaces if w["name"].endswith("-A"))

        # Sign both in for real JWTs.
        tokens = []
        for email, pw in creds:
            st, t = call("POST", f"{url}/auth/v1/token?grant_type=password",
                         apikey=anon, body={"email": email, "password": pw})
            if st != 200 or "access_token" not in (t or {}):
                print(f"  SETUP FAILED signing in {email}: {st} {t}")
                return 1
            tokens.append(t["access_token"])
        tok_a, tok_b = tokens

        # --- CONTROLS: without these, every negative below is vacuous -----
        st, got = call("GET", f"{url}/rest/v1/workspaces?select=id,name", token=tok_a, apikey=anon)
        p.check("CONTROL", "A can read A's own workspace (the read path works at all)",
                st == 200 and isinstance(got, list) and any(marker in r["name"] for r in got),
                f"status={st} rows={got}")

        st, got = admin("GET", f"/rest/v1/workspaces?id=eq.{ws_a['id']}&select=name")
        p.check("CONTROL", "the marker really is stored (not a phantom absence)",
                st == 200 and isinstance(got, list) and len(got) == 1 and marker in got[0]["name"],
                f"status={st} rows={got}")

        # --- ISOLATION ----------------------------------------------------
        st, got = call("GET", f"{url}/rest/v1/workspaces?select=id,name", token=tok_b, apikey=anon)
        leaked = [r for r in (got or []) if isinstance(r, dict) and r.get("name", "").endswith("-A")]
        p.check("LEAK", "B's workspace list does not contain A's workspace",
                st == 200 and not leaked, f"status={st} leaked={leaked}")

        st, got = call("GET", f"{url}/rest/v1/workspaces?id=eq.{ws_a['id']}&select=id,name",
                       token=tok_b, apikey=anon)
        p.check("LEAK", "B cannot fetch A's workspace by explicit id",
                st == 200 and got == [], f"status={st} body={got}")

        st, got = call("GET", f"{url}/rest/v1/credit_transactions?select=id&workspace_id=eq.{ws_a['id']}",
                       token=tok_b, apikey=anon)
        p.check("LEAK", "B cannot read A's credit ledger",
                st == 200 and got == [], f"status={st} body={got}")

        # The 0023 guard, over HTTP this time rather than by SQL impersonation.
        st, got = call("POST", f"{url}/rest/v1/rpc/consume_credits", token=tok_b, apikey=anon,
                       body={"p_workspace_id": ws_a["id"], "p_amount": 1, "p_reason": "dm_triage"})
        p.check("LEAK", "B cannot spend A's credits via consume_credits",
                st >= 400, f"status={st} body={got}")

        # 0025: nobody signed in may increase a balance, not even their own.
        st, got = call("POST", f"{url}/rest/v1/rpc/grant_credits", token=tok_b, apikey=anon,
                       body={"p_workspace_id": ws_a["id"], "p_amount": 999999, "p_reason": "refund"})
        p.check("LEAK", "B cannot credit any workspace via grant_credits",
                st >= 400, f"status={st} body={got}")

        # Balance must be untouched by all of the above.
        st, got = admin("GET", f"/rest/v1/workspaces?id=eq.{ws_a['id']}&select=credits")
        p.check("CONTROL", "A's balance is unchanged after every attempt",
                st == 200 and got and got[0]["credits"] == 100, f"status={st} body={got}")

        p.notes.append("HTML/page-fragment caching is NOT covered by this probe — it needs an "
                       "authenticated browser session. Treat page caching as unverified.")
        return p.summary(expected=8)

    finally:
        for w in workspaces:
            admin("DELETE", f"/rest/v1/workspaces?id=eq.{w['id']}")
        for uid in users:
            admin("DELETE", f"/auth/v1/admin/users/{uid}")


# --- selftest ---------------------------------------------------------------

def selftest() -> int:
    """The probe must fail on a leak and must not pass when controls are broken."""
    passed = failed = 0

    def check(name, cond):
        nonlocal passed, failed
        if cond:
            passed += 1
            print(f"  PASS  {name}")
        else:
            failed += 1
            print(f"  FAIL  {name}")

    p = Probe()
    p.check("LEAK", "leak detected", False)
    check("a leaking assertion is counted as failed", p.failed == 1)

    p2 = Probe()
    p2.check("CONTROL", "control ok", True)
    check("a passing control is counted", p2.passed == 1)

    # A run that asserts less than expected is a failure even with 0 fails.
    p3 = Probe()
    p3.check("CONTROL", "only one thing ran", True)
    check("under-count is reported as failure", p3.summary(expected=8) == 1)

    p4 = Probe()
    for i in range(8):
        p4.check("LEAK", f"x{i}", True)
    check("a full clean run passes", p4.summary(expected=8) == 0)

    st, body = call("GET", "http://127.0.0.1:1/nope")
    check("an unreachable host is status 0, never mistaken for a 200", st == 0)

    print(f"\n  RESULT: {passed} passed, {failed} failed")
    return 1 if failed else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--env-file", default=".env.local")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    env = load_env(a.env_file)
    missing = [k for k in ("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
                           "SUPABASE_SERVICE_ROLE_KEY") if k not in env]
    if missing:
        print(f"missing from {a.env_file}: {', '.join(missing)}", file=sys.stderr)
        return 2
    return run(env)


if __name__ == "__main__":
    raise SystemExit(main())
