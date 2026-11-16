#!/usr/bin/env python3
"""Validate reports/theplus-creative-studio/execution-report.v2.json (schema 2.0.0).

Structural checks (required sections, enums, unique ids, evidence references, the
immutable T01-T08 registry, P01-P07 and D0-D5 completeness) plus the semantic
rules the report contract states in prose:

- the commercial decision is re-derived from the pilot record and must match;
- a recovery phase (vertical_slice.workflow_steps R0-R5) may be `completed` only
  when every check whose id starts with that phase's prefix (e.g. R1-G..) is PASS;
- every open/mitigated release-blocking risk is listed in decision.unresolved_blocker_ids;
- no authorisation is true without evidence.

Exit codes: 0 valid, 1 invalid, 2 could not run. Prints one JSON object.
Usage: validate_creative_studio_report.py [path] | --selftest
"""
import copy
import json
import sys

WORK = {"not_started", "planned", "in_progress", "blocked", "completed", "aborted"}
CHECK = {"PASS", "FAIL", "NOT_TESTED", "BLOCKED"}
LEVEL = {"unverified", "documented", "implemented", "locally_tested", "provider_verified", "production_verified"}
RISK = {"open", "mitigated", "resolved"}
SEVERITY = {"critical", "high", "medium", "low"}
PARTICIPANT = {"not_started", "in_progress", "technically_accepted", "failed", "abandoned", "withdrawn"}
TERMINAL = {"technically_accepted", "failed", "abandoned", "withdrawn"}
DECISION = {"GO", "CONDITIONAL_GO", "NO_GO", "NOT_EVALUATED"}
GATE = {"SATISFIED", "NOT_SATISFIED", "NOT_EVALUATED", "NOT_APPLICABLE"}
TOP = ["schema_version", "report_id", "generated_at", "project", "execution", "evidence",
       "repository_baseline", "reconciliation", "architecture", "vertical_slice",
       "safety_invariants", "implementation", "verification", "pilot", "risks",
       "decision", "operating_summary"]
REGISTRY = [
    ("T01", "technically_accepted_videos", ">=", 4, "creators", 5),
    ("T02", "independent_completion", ">=", 3, "creators", 5),
    ("T03", "character_consistency", ">=", 0.8, "fraction", None),
    ("T04", "median_elapsed_minutes", "<=", 120, "minutes", None),
    ("T05", "creator_output_approval", ">=", 4, "creators", 5),
    ("T06", "variable_cost_to_price_ratio", "<=", 0.35, "fraction", None),
    ("T07", "qualified_paid_commitments", ">=", 2, "creators", 5),
    ("T08", "critical_incidents", "==", 0, "incidents", None),
]


def derive_decision(r):
    """Sections 6.4/6.7 of the contract, evaluated on the report's own fields."""
    p = r["pilot"]
    if any(i.get("confirmed") for i in p["critical_incidents"]):
        return "NO_GO"
    terminal = [x for x in p["participants"] if x["qualified"] and x["attempt_status"] in TERMINAL]
    if p["status"] != "completed" or len(terminal) != 5 or not p["closed_at"]:
        return "NOT_EVALUATED"
    score = {s["threshold_id"]: s["status"] for s in p["scorecard"]}
    safety = all(c["status"] == "PASS" for c in r["safety_invariants"].values())
    blockers = [k for k in r["risks"] if k["release_blocker"] and k["severity"] == "critical" and k["status"] != "resolved"]
    if not p["plan"]["thresholds_frozen_at"] or not safety or score.get("T08") != "PASS" or blockers:
        return "NOT_EVALUATED"
    if all(score.get(t[0]) == "PASS" for t in REGISTRY):
        return "GO"
    d = r["decision"]
    if any(score.get(t[0]) == "FAIL" for t in REGISTRY[:7]):
        if d["corrective_hypothesis"] and d["retest_experiment_id"]:
            return "CONDITIONAL_GO"
        if d["status"] == "NO_GO":
            return "NO_GO"  # decisiveness is a judgement the report must evidence
    return "NOT_EVALUATED"


def validate(r):
    errs = []
    e = errs.append
    for k in TOP:
        if k not in r:
            e(f"missing top-level field {k}")
    if errs:
        return errs
    extra = set(r) - set(TOP)
    if extra:
        e(f"unknown top-level fields {sorted(extra)}")
    if r["schema_version"] != "2.0.0":
        e("schema_version must be 2.0.0")

    ids = [x["id"] for x in r["evidence"]]
    if len(ids) != len(set(ids)):
        e("duplicate evidence ids")
    known = set(ids)

    def walk(o, path):
        if isinstance(o, dict):
            for k, v in o.items():
                if k.endswith("evidence_ids"):
                    for ref in v:
                        if ref not in known:
                            e(f"{path}.{k}: unknown evidence id {ref}")
                walk(v, f"{path}.{k}")
        elif isinstance(o, list):
            for i, v in enumerate(o):
                walk(v, f"{path}[{i}]")
    walk(r, "$")

    def enum(val, allowed, where):
        if val not in allowed:
            e(f"{where}: {val!r} not in {sorted(allowed)}")

    for sect in ["repository_baseline", "reconciliation", "architecture", "vertical_slice", "implementation", "verification", "pilot"]:
        enum(r[sect]["status"], WORK, f"{sect}.status")
    for c in r["repository_baseline"]["capabilities"]:
        enum(c["evidence_level"], LEVEL, f"capability {c['name']}")
    for s in r["vertical_slice"]["workflow_steps"]:
        enum(s["implementation_status"], WORK, f"workflow_step {s['id']}")
    for name, c in r["safety_invariants"].items():
        enum(c["status"], CHECK, f"safety_invariants.{name}")
    checks = r["verification"]["checks"]
    cids = [c["id"] for c in checks]
    if len(cids) != len(set(cids)):
        e("duplicate verification check ids")
    for c in checks:
        enum(c["status"], CHECK, f"check {c['id']}")
        if c["status"] in ("PASS", "FAIL") and c["exit_code"] is None and c["method"] != "manual":
            e(f"check {c['id']}: {c['status']} without an exit code")
    for k in r["risks"]:
        enum(k["status"], RISK, f"risk {k['id']}")
        enum(k["severity"], SEVERITY, f"risk {k['id']} severity")

    # Recovery phases: completed only when every gate of that phase passed.
    for s in r["vertical_slice"]["workflow_steps"]:
        prefix = s["id"] + "-"
        gates = [c for c in checks if c["id"].startswith(prefix)]
        if s["implementation_status"] == "completed":
            bad = [c["id"] for c in gates if c["status"] != "PASS"]
            if bad:
                e(f"phase {s['id']} is completed but gates are not PASS: {bad}")
    r1 = [c["id"] for c in checks if c["id"].startswith("R1-G")]
    if any(s["id"] == "R1" for s in r["vertical_slice"]["workflow_steps"]):
        want = [f"R1-G{i:02d}" for i in range(1, 11)]
        if sorted(r1) != want:
            e(f"R1 gates must be exactly {want}, found {sorted(r1)}")

    p = r["pilot"]
    reg = [(t["id"], t["metric"], t["operator"], t["target"], t["unit"], t["denominator"]) for t in p["thresholds"]]
    if reg != REGISTRY:
        e("pilot.thresholds differ from the immutable T01-T08 registry")
    if [s["threshold_id"] for s in p["scorecard"]] != [t[0] for t in REGISTRY]:
        e("scorecard must hold T01-T08 once each, in order")
    for s in p["scorecard"]:
        enum(s["status"], CHECK, f"scorecard {s['threshold_id']}")
    if sorted(x["id"] for x in p["preflight"]) != [f"P0{i}" for i in range(1, 8)]:
        e("preflight must hold P01-P07 once each")
    if len(p["participants"]) > 5:
        e("more than five participants in the original cohort")
    for x in p["participants"]:
        enum(x["attempt_status"], PARTICIPANT, f"participant {x['creator_id']}")
    if p["status"] in ("not_started", "planned") and p["participants"]:
        if any(x["attempt_status"] != "not_started" for x in p["participants"]):
            e("pilot not started but a participant attempt has begun")
    eco = p["economics"]
    if eco["accepted_video_count"] in (0, None) and eco["cost_to_price_ratio"] is not None:
        e("cost_to_price_ratio set without accepted videos")

    d = r["decision"]
    enum(d["status"], DECISION, "decision.status")
    if [g["id"] for g in d["gate_results"]] != ["D0", "D1", "D2", "D3", "D4", "D5"]:
        e("decision.gate_results must be D0-D5 once each, in order")
    for g in d["gate_results"]:
        enum(g["status"], GATE, f"gate {g['id']}")
    derived = derive_decision(r)
    if d["status"] != derived:
        e(f"decision.status {d['status']} but the algorithm derives {derived}")
    open_blockers = {k["id"] for k in r["risks"] if k["release_blocker"] and k["status"] != "resolved"}
    missing = open_blockers - set(d["unresolved_blocker_ids"])
    if missing:
        e(f"release blockers not listed in decision.unresolved_blocker_ids: {sorted(missing)}")

    auth = r["execution"]["authorisations"]
    if any(auth[k] for k in auth if k != "evidence_ids") and not auth["evidence_ids"]:
        e("an authorisation is true without evidence")
    return errs


def selftest():
    path = "reports/theplus-creative-studio/execution-report.v2.json"
    base = json.load(open(path, encoding="utf-8"))
    assert validate(base) == [], validate(base)
    mutants = {
        "decision GO with pilot not started": lambda r: r["decision"].update(status="GO"),
        "threshold edited": lambda r: r["pilot"]["thresholds"][0].update(target=3),
        "dangling evidence id": lambda r: r["risks"][0]["evidence_ids"].append("EV-NOPE"),
        "phase completed with a blocked gate": lambda r: next(
            s for s in r["vertical_slice"]["workflow_steps"] if s["id"] == "R1").update(implementation_status="completed"),
        "blocker missing from decision": lambda r: r["decision"].update(unresolved_blocker_ids=[]),
        "unknown enum": lambda r: r["safety_invariants"]["credits_billing"].update(status="OK"),
    }
    caught = {}
    for name, mutate in mutants.items():
        r = copy.deepcopy(base)
        mutate(r)
        caught[name] = bool(validate(r))
    ok = all(caught.values())
    print(json.dumps({"selftest": "PASS" if ok else "FAIL", "baseline_errors": 0, "mutants_caught": caught}))
    return 0 if ok else 1


def main(argv):
    if argv[1:2] == ["--selftest"]:
        return selftest()
    path = argv[1] if len(argv) > 1 else "reports/theplus-creative-studio/execution-report.v2.json"
    try:
        report = json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(json.dumps({"valid": False, "error": f"cannot read {path}: {exc}"}))
        return 2
    errs = validate(report)
    print(json.dumps({"valid": not errs, "path": path, "errors": errs, "derived_decision": derive_decision(report) if not any(e.startswith("missing") for e in errs) else None}, indent=2))
    return 0 if not errs else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
