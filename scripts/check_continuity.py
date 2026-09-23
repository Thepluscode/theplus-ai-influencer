#!/usr/bin/env python3
"""The continuity contract, enforced.

A session reconstructs this project from the repository, not from memory. That
only holds if the authority files exist, say what they must say, and still match
the code.

Two assertions matter most here, because both failures are silent:

  * A module holding an SDK secret that does not import 'server-only' compiles,
    runs, and ships the key into the browser bundle.
  * A publish path that skips the brand-safety gate posts successfully. Nothing
    fails; something just goes out unchecked, to a real connected account.

And one is about honesty rather than health: main is behind two open pull
requests. The check does not demand they be merged — that is review work. It
demands the repository SAY main is behind while it is.

Run:  python3 scripts/check_continuity.py
Exits 0 on PASS, 1 on FAIL. Prints every failure, not just the first.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
LIB = SRC / "lib"
FAILURES: list[tuple[str, str]] = []
CHECKS = 0


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def check(label: str, ok: bool, detail: str = "") -> None:
    global CHECKS
    CHECKS += 1
    if not ok:
        FAILURES.append((label, detail))


SERVER_ONLY_IMPORT = re.compile(r"^\s*import\s+['\"]server-only['\"]\s*;?\s*$", re.M)


def declares_server_only(body: str) -> bool:
    """An ACTIVE import statement, not the substring.

    `// import 'server-only';` still contains "server-only", so a substring test
    stayed green with the guard commented out — the module was unguarded and the
    check could not tell."""
    return SERVER_ONLY_IMPORT.search(body) is not None


def phrase(text: str, words: str) -> bool:
    """Match across a line wrap, ignoring case. Never spanning inline markup —
    a phrase crossing a backtick can never match however true the sentence is."""
    return re.search(r"\s+".join(map(re.escape, words.split())),
                     text, re.IGNORECASE) is not None


CHARTER = _read(ROOT / "AGENT_CONTEXT.md")
BOOTSTRAP = _read(ROOT / "CLAUDE.md")
OPERATING = _read(ROOT / "CLAUDE-OPERATING.md")
ACTIVE_RAW = _read(ROOT / "ACTIVE_WORK.yaml")


# ---------------------------------------------------------------- authority files

check("charter exists", bool(CHARTER))
check("charter states the mission", phrase(CHARTER, "AI influencer content platform"))
check("charter states it posts in public and spends money",
      phrase(CHARTER, "spends money and it posts in public"))
check("charter states the brand-safety gate is mandatory",
      phrase(CHARTER, "must go through the brand-safety gate first"))
check("charter forbids swallowing DemoModeBlockedError",
      phrase(CHARTER, "Never catch and swallow it"))
check("charter states demo mode fail-closes in production",
      phrase(CHARTER, "fail-closes when"))
check("charter states the server-only rule",
      phrase(CHARTER, "must") and "server-only" in CHARTER)
check("charter states pre-push is the only gate",
      phrase(CHARTER, "There is no remote CI"))

check("bootstrap routes through the charter", "AGENT_CONTEXT.md" in BOOTSTRAP)
check("bootstrap routes through the active task", "ACTIVE_WORK.yaml" in BOOTSTRAP)
check("bootstrap routes through preflight", "preflight" in BOOTSTRAP)
check("bootstrap names the state generator", "project_state.py" in BOOTSTRAP)
check("bootstrap points at the operating file", "CLAUDE-OPERATING.md" in BOOTSTRAP)
check("bootstrap carries the recent-context rule",
      phrase(BOOTSTRAP, "Discovery is not authorisation"))
check("bootstrap warns pre-push is the only gate",
      phrase(BOOTSTRAP, "only gate that exists"))
check("operating file survived the rename",
      phrase(OPERATING, "Repository shape") and "Next.js 16" in OPERATING)

for name, text in (("AGENT_CONTEXT.md", CHARTER), ("CLAUDE.md", BOOTSTRAP)):
    check(f"{name} holds no commit SHA",
          not re.search(r"\b[0-9a-f]{7,40}\b", text))


# ------------------------------------------------------- the gates, in the code

ZERNIO = _read(LIB / "zernio.ts")
DEMO = _read(LIB / "demo-mode.ts")

check("the zernio client was read", len(ZERNIO) > 3000,
      f"{len(ZERNIO)} bytes; an empty read and a broken read look identical")

check("DemoModeBlockedError exists", "class DemoModeBlockedError" in ZERNIO)
# The guard must run BEFORE the request is built, not merely exist somewhere.
for method in ("createPost", "deletePost"):
    m = re.search(rf"async {method}\([^)]*\)[^{{]*{{\s*assertNotDemoMode\(", ZERNIO)
    check(f"{method} asserts demo mode before doing anything", m is not None,
          "a guard after the network call is not a guard")
check("the demo-mode assertion throws rather than returning",
      re.search(r"function assertNotDemoMode[\s\S]{0,200}?throw new DemoModeBlockedError",
                ZERNIO) is not None)
check("demo mode fail-closes in production",
      re.search(r"NODE_ENV\s*!==\s*['\"]production['\"]", DEMO) is not None,
      "the flag must not be able to turn a production deployment into a demo")

check("the brand-safety gate modules exist",
      (LIB / "publish-safety.ts").exists() and (LIB / "brand-safety.ts").exists())
# The gate is only a gate if the publish paths call it.
callers = [p.relative_to(ROOT).as_posix() for p in (SRC / "app").rglob("actions.ts")
           if "runPublishBrandSafetyGate" in _read(p)]
check("publish paths call the brand-safety gate", len(callers) >= 2,
      f"callers: {callers}")

# server-only discipline: a secret-holding module that omits it leaks the key
# into the client bundle at build time, silently.
# Computed, not a ratio. "Most modules declare server-only" protects nothing
# in particular; what matters is that every module touching a SECRET declares
# it. A ratio also disagreed with itself at 40/49 and 48/49 depending on whether
# the walk was recursive.
SECRET_ENV = re.compile(r"SERVICE_ROLE_KEY|_SECRET_KEY|_API_KEY|WEBHOOK_SECRET|CRON_SECRET")
# Two different things, kept apart on purpose.
#   BY DESIGN: env.ts names every secret in its Zod schema but is the boundary
#   module itself. It also exports publicEnv, which exists to be imported from
#   client code — a server-only guard here would defeat the serverEnv/publicEnv
#   split the whole convention rests on.
#   stripe.ts was the one real gap; guarded 2026-09-23 (see PARKING_LOT.md).
EXEMPT_BY_DESIGN = {"env.ts"}
KNOWN_UNGUARDED: set[str] = set()

lib_modules = [p for p in LIB.rglob("*.ts") if "__tests__" not in p.parts]
check("lib modules were read", len(lib_modules) >= 20, f"{len(lib_modules)} found")

touches_secret = {p.relative_to(LIB).as_posix(): _read(p) for p in lib_modules
                  if SECRET_ENV.search(_read(p))}
unguarded = sorted(n for n, body in touches_secret.items()
                   if not declares_server_only(body))
check("secret-touching modules were found at all", len(touches_secret) >= 3,
      f"{len(touches_secret)}; an empty read and a broken read look identical")
gaps = set(unguarded) - EXEMPT_BY_DESIGN
check("every module touching a secret declares server-only, except the known gap",
      gaps <= KNOWN_UNGUARDED,
      f"unguarded and not exempt: {sorted(gaps)}; known and recorded: "
      f"{sorted(KNOWN_UNGUARDED)}")
check("the known gap has not been closed without updating this check",
      gaps == KNOWN_UNGUARDED or not gaps,
      f"gaps are now {sorted(gaps)} — if stripe.ts was fixed, remove it from "
      f"KNOWN_UNGUARDED and from PARKING_LOT.md")

check("env access is centralised", (LIB / "env.ts").exists())
check("the env module validates with Zod", "zod" in _read(LIB / "env.ts").lower())


# ------------------------------------------------------------- the only gate

HOOK = _read(ROOT / ".husky" / "pre-push")
check("the pre-push hook exists", bool(HOOK.strip()))
for step in ("typecheck", "lint", "test"):
    check(f"pre-push runs {step}", step in HOOK)
gated = {s for s in ("typecheck", "lint", "test")
         if re.search(rf"pnpm {s}\b[^\n]*\|\|\s*exit 1", HOOK)}
check("EVERY pre-push step fails the push, not just one",
      gated == {"typecheck", "lint", "test"},
      f"gated: {sorted(gated)}; a substring check for 'exit 1' stayed green "
      f"with one step downgraded, because the other two still had it")


# ---------------------------------------------- main's position, as honesty

def _behind(branch: str) -> int:
    n = subprocess.run(["git", "-C", str(ROOT), "rev-list", "--count", f"main..{branch}"],
                       capture_output=True, text=True).stdout.strip()
    return int(n) if n.isdigit() else 0


branches = [b.strip() for b in subprocess.run(
    ["git", "-C", str(ROOT), "branch", "--format=%(refname:short)"],
    capture_output=True, text=True).stdout.splitlines() if b.strip() and b.strip() != "main"]
waiting = {b: _behind(b) for b in branches if _behind(b) > 0}

if waiting:
    # NOT "everything is merged" — that would be red until review happens, and a
    # gate red for outstanding review work is a gate people learn to skip.
    declared = ""
    try:
        import yaml
        declared = str((((yaml.safe_load(ACTIVE_RAW) or {}).get("active")
                         or {}).get("status") or "")).strip().lower()
    except Exception:
        declared = ""
    check("main is behind open branches AND ACTIVE_WORK says so",
          declared == "stalled" and phrase(ACTIVE_RAW, "Land the two open pull requests"),
          f"{sum(waiting.values())} commits waiting on {len(waiting)} branch(es) and "
          f"ACTIVE_WORK declares '{declared}'")


# ---------------------------------------------------------------- active work

try:
    import yaml
except ImportError:
    ACTIVE = None
    print("note: PyYAML absent — ACTIVE_WORK.yaml structure unchecked", file=sys.stderr)
else:
    try:
        ACTIVE = yaml.safe_load(ACTIVE_RAW)
    except yaml.YAMLError as exc:
        ACTIVE = None
        check("ACTIVE_WORK.yaml parses", False, str(exc).replace("\n", " ")[:160])

if ACTIVE is not None:
    check("exactly one active task", isinstance(ACTIVE.get("active"), dict))
    active = ACTIVE.get("active") or {}
    check("active task names its authoritative source", bool(active.get("source")))
    check("active task is corroborated", bool(active.get("corroborated_by")))
    check("claim level is one of the four",
          active.get("claim_level") in
          ("implemented", "tested", "production-observed", "customer-validated"))
    check("switch conditions are the portfolio four",
          set(ACTIVE.get("task_switch_requires") or []) == {
              "FOUNDER_OVERRIDE", "CURRENT_TASK_COMPLETED",
              "RELEASE_CONDITION_MET", "VERIFIED_P0_P1_INTERRUPT"})
    check("the only-gate situation is recorded as a standing fact",
          bool((ACTIVE.get("gates") or {}).get("consequence")))
    check("what main is missing is enumerated, not summarised",
          len(active.get("what_main_is_missing") or []) >= 3)
    forbidden = " ".join(str(f) for f in active.get("forbidden") or [])
    check("--no-verify is forbidden", "no-verify" in forbidden)
    check("skipping the brand-safety gate is forbidden", "brand-safety" in forbidden)
    check("swallowing DemoModeBlockedError is forbidden", "DemoModeBlockedError" in forbidden)
    for entry in ACTIVE.get("history") or []:
        for field in ("reason", "evidence", "approved_by"):
            check(f"history entry {entry.get('date')} records {field}",
                  bool(entry.get(field)))
    for item in ACTIVE.get("parked") or []:
        check(f"parked {item.get('id')} says what would unpark it",
              bool(item.get("unparks_when")))


# ---------------------------------------------------------------- generated state

check("state file is gitignored, not committed",
      subprocess.run(["git", "-C", str(ROOT), "ls-files", "--error-unmatch",
                      "PROJECT_STATE.json"],
                     capture_output=True, text=True).returncode != 0)

sys.path.insert(0, str(ROOT / "scripts"))
try:
    import project_state

    check("snapshot is reproducible",
          project_state.snapshot(ROOT) == project_state.snapshot(ROOT))
    check("volatile facts stay out of the deterministic snapshot",
          "runtime" not in project_state.snapshot(ROOT))
    state = project_state.snapshot(ROOT)["repository_reproducible"]
    check("routes were counted", state["routes"] >= 15)
    check("tests were counted", state["test_files"] >= 15)
    check("migrations were counted", len(state["migrations"]) >= 10)
    # Sorted by number, not lexically — 0010 must not sort before 0009.
    nums = [int(re.match(r"(\d+)", m).group(1)) for m in state["migrations"]]
    check("the highest migration is the numerically highest",
          state["highest_migration"].startswith(f"{max(nums):04d}"),
          f"reported {state['highest_migration']}, max is {max(nums):04d}")
    check("the generator sees the safety gate too", state["safety_gate_present"])
    # Two independent paths to the same fact. One alone would be shared-source.
    check("generator and contract agree on what is waiting on branches",
          state and project_state.distribution(ROOT)["commits_waiting_on_branches"] == waiting,
          f"generator {project_state.distribution(ROOT)['commits_waiting_on_branches']} "
          f"vs contract {waiting}")
except Exception as exc:  # pragma: no cover - reported, not swallowed
    check("state generator imports and runs", False, repr(exc))


# ---------------------------------------------------------------- report

print(f"continuity: {CHECKS - len(FAILURES)}/{CHECKS} checks passed")
if FAILURES:
    print()
    for label, detail in FAILURES:
        ident = re.sub(r"[^A-Za-z0-9_./-]", "_", label.replace(" ", "_"))
        print(f"FAILED continuity::{ident}" + (f"  — {detail}" if detail else ""))
    sys.exit(1)
print("PASS")
