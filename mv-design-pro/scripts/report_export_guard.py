#!/usr/bin/env python3
"""Guard: raport musi mieć roboczy flow, checklistę i jawne eksporty.

Ten guard jest celowo statyczny. Nie sprawdza fizyki ani wyników solvera,
tylko chroni UI raportu przed powrotem do martwych kafli bez akcji.
"""

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "frontend" / "src" / "ui" / "workspace" / "WorkspaceSurfaceRouter.tsx"
COMPONENTS = ROOT / "frontend" / "src" / "ui" / "workspace" / "routerCardComponents.tsx"


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    sys.exit(1)


def require(text: str, needle: str, context: str) -> None:
    if needle not in text:
        fail(f"missing {context}: {needle}")


def main() -> int:
    if not ROUTER.exists():
        fail(f"missing router file: {ROUTER}")
    if not COMPONENTS.exists():
        fail(f"missing shared report components: {COMPONENTS}")

    router = ROUTER.read_text(encoding="utf-8")
    components = COMPONENTS.read_text(encoding="utf-8")

    report_start = router.find("function ReportSurface(")
    report_end = router.find("\n// resolveLatestCompletedRun", report_start)
    if report_start < 0 or report_end < 0:
        fail("cannot isolate ReportSurface")
    report = router[report_start:report_end]

    require(components, "export function ActionableEngineeringTable", "actionable engineering table")
    require(components, "export function ReportChapterChecklist", "report chapter checklist")
    require(components, "export function EmptyEngineeringState", "actionable empty state")

    require(report, 'testId="report-workflow-stage-table"', "report workflow stage table")
    require(report, "<StationBatchPlanner", "station batch planner for 50+ flow")
    require(report, "<ReportChapterChecklist", "report chapter checklist usage")
    require(report, 'testId="report-blockers-table"', "report blockers table")
    require(report, 'format="PDF"', "PDF export")
    require(report, 'format="DOCX"', "DOCX export")
    require(report, 'format="JSON"', "JSON export")
    require(report, 'format="LaTeX"', "LaTeX proof export")

    if "<KeyValueGrid" in report:
        fail("ReportSurface still renders KeyValueGrid dead-card layout")

    print("PASS: report export/workflow guard")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
