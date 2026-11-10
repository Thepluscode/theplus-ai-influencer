#!/usr/bin/env python3
"""Generate PROJECT_STATE.json — the countable state, never hand-written.

Four blocks, because they rot at different rates and a session must not confuse
them:

  repository_reproducible  identical in any clone at this commit
  local_only_operational   true of THIS machine — deps, builds, env files
  distribution             what is on the remote, and what is waiting on a branch
  runtime                  when this ran, and against what

The distribution block is the interesting one here: two pull requests have been
open for weeks and main lacks what they carry, so "unpushed commits" is the
wrong question. What matters is how far main is BEHIND its own branches.

Env files are reported by name and ignored-status only. Never contents.

PROJECT_STATE.json is gitignored. A committed state file records the commit
before the one that added it and is stale on arrival.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP = {".git", "node_modules", ".next", "coverage", "__pycache__", "graphify-out"}
SRC = ROOT / "src"


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _git(root: Path, *args: str) -> str:
    out = subprocess.run(["git", "-C", str(root), *args],
                         capture_output=True, text=True, timeout=60)
    return out.stdout.strip() if out.returncode == 0 else ""


def _walk(base: Path, pattern: str) -> list[Path]:
    if not base.exists():
        return []
    return [p for p in base.rglob(pattern) if not SKIP & set(p.parts)]


def repository_reproducible(root: Path) -> dict:
    lib = SRC / "lib"
    migrations = sorted(p.name for p in (root / "supabase" / "migrations").glob("*.sql")) \
        if (root / "supabase" / "migrations").is_dir() else []

    def _ver(name: str) -> int:
        m = re.match(r"(\d+)", name)
        return int(m.group(1)) if m else -1

    # `server-only` discipline: a module holding a secret must declare it, or an
    # accidental client import ships the key to the browser. Counted, not assumed.
    server_only = [p.relative_to(root).as_posix() for p in _walk(lib, "*.ts")
                   if "server-only" in _read(p)]

    return {
        "routes": len(_walk(SRC / "app", "page.tsx")),
        "server_action_files": len(_walk(SRC / "app", "actions.ts")),
        "lib_modules": sorted(p.name for p in lib.glob("*.ts")) if lib.is_dir() else [],
        "test_files": len(_walk(SRC, "*.test.ts") + _walk(SRC, "*.test.tsx")),
        "migrations": sorted(migrations, key=_ver),
        "highest_migration": sorted(migrations, key=_ver)[-1] if migrations else None,
        "server_only_modules": sorted(server_only),
        "safety_gate_present": (lib / "publish-safety.ts").exists()
        and (lib / "brand-safety.ts").exists(),
        "pre_push_hook": _read(root / ".husky" / "pre-push").strip().splitlines()[-1:]
        if (root / ".husky" / "pre-push").exists() else [],
        "probes": sorted(p.name for p in (root / "scripts" / "probes").glob("*.py"))
        if (root / "scripts" / "probes").is_dir() else [],
    }


def local_only_operational(root: Path) -> dict:
    env_files = sorted(p.name for p in root.glob(".env*"))
    exposed = [n for n in env_files
               if n != ".env.example"
               and subprocess.run(["git", "-C", str(root), "check-ignore", "-q", n],
                                  capture_output=True).returncode != 0]
    return {
        "env_files_present": env_files,
        "env_files_not_ignored": exposed,      # must stay empty
        "deps_installed": (root / "node_modules").is_dir(),
        "next_build_present": (root / ".next").is_dir(),
        "coverage_present": (root / "coverage").is_dir(),
    }


def distribution(root: Path) -> dict:
    """How far main is behind its own open branches."""
    branch = _git(root, "rev-parse", "--abbrev-ref", "HEAD")
    branches = [b.strip() for b in _git(root, "branch", "--format=%(refname:short)").splitlines()
                if b.strip() and b.strip() != "main"]
    behind = {}
    for b in branches:
        n = _git(root, "rev-list", "--count", f"main..{b}")
        if n.isdigit() and int(n) > 0:
            behind[b] = int(n)
    return {
        "branch": branch or "UNKNOWN",
        "on_default_branch": branch == "main",
        "unpushed_commits": int(_git(root, "rev-list", "--count", "HEAD", "--not", "--remotes") or 0),
        "commits_waiting_on_branches": behind,
        "remote": _git(root, "remote", "get-url", "origin") or "UNKNOWN",
        "last_commit_date": _git(root, "log", "-1", "--format=%cs") or "UNKNOWN",
    }


def runtime_state(root: Path) -> dict:
    from datetime import datetime, timezone
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "git_head": _git(root, "rev-parse", "HEAD") or "UNKNOWN",
        "git_dirty": len([l for l in _git(root, "status", "--porcelain").splitlines() if l]),
    }


def snapshot(root: Path = ROOT) -> dict:
    return {
        "repository_reproducible": repository_reproducible(root),
        "local_only_operational": local_only_operational(root),
    }


def write(root: Path = ROOT) -> dict:
    state = snapshot(root)
    state["distribution"] = distribution(root)
    state["runtime"] = runtime_state(root)
    (root / "PROJECT_STATE.json").write_text(
        json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return state


if __name__ == "__main__":
    json.dump(write(), sys.stdout, indent=2, sort_keys=True)
    print()
