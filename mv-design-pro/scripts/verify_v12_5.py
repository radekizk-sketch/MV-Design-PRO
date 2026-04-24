from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT / "frontend"
BACKEND_DIR = ROOT / "backend"
REPORT_PATH = ROOT / "verification_v12_5.md"
PERF_TEST_PATH = Path("src/ui/workspace/__tests__/v125.performance.test.tsx")

BACKEND_V125_SCOPE_PATHS = [
    Path("src/api/analysis_case_context.py"),
    Path("src/api/analysis_run_exports.py"),
    Path("src/api/canonical_run_views.py"),
    Path("src/api/power_flow_runs.py"),
    Path("src/api/v125_contracts.py"),
    Path("src/application/field_read_model.py"),
    Path("src/enm/canonical_analysis.py"),
    Path("src/infrastructure/persistence/repositories/canonical_run_repository.py"),
    Path("tests/api/test_analysis_run_report_exports.py"),
    Path("tests/application/analysis_run/test_analysis_run_service.py"),
    Path("tests/enm/test_enm_field_view_api.py"),
    Path("tests/test_canonical_analysis_api.py"),
    Path("tests/test_execution_api.py"),
    Path("tests/test_production_canonical_only_api.py"),
]

BACKEND_V125_TEST_PATHS = [
    Path("tests/application/analysis_run/test_analysis_run_service.py"),
    Path("tests/test_canonical_analysis_api.py"),
    Path("tests/test_execution_api.py"),
    Path("tests/test_production_canonical_only_api.py"),
    Path("tests/enm/test_enm_field_view_api.py"),
    Path("tests/api/test_analysis_run_report_exports.py"),
]


@dataclass
class Step:
    name: str
    cwd: Path
    command: list[str]
    env: dict[str, str] | None = None


@dataclass
class StepResult:
    step: Step
    exit_code: int
    stdout_tail: str
    stderr_tail: str
    duration_seconds: float

    @property
    def ok(self) -> bool:
        return self.exit_code == 0


@dataclass
class PerformanceRun:
    profile: str
    output_path: Path


def detect_package_manager(frontend_dir: Path) -> str:
    if (frontend_dir / "pnpm-lock.yaml").exists():
        return "pnpm"
    if (frontend_dir / "yarn.lock").exists():
        return "yarn"
    return "npm"


def run_script_command(
    package_manager: str, script: str, extra_args: list[str] | None = None
) -> list[str]:
    extra_args = extra_args or []
    if package_manager == "yarn":
        return [package_manager, script, *extra_args]
    return [package_manager, "run", script, *extra_args]


def tail(text: str | None, limit: int = 30) -> str:
    if not text:
        return ""
    lines = [line.rstrip() for line in text.strip().splitlines() if line.strip()]
    return "\n".join(lines[-limit:])


def run_step(step: Step) -> StepResult:
    command = step.command
    if sys.platform.startswith("win"):
        command = ["cmd", "/d", "/s", "/c", subprocess.list2cmdline(step.command)]
    env = os.environ.copy()
    if step.env:
        env.update(step.env)
    started_at = perf_counter()
    try:
        completed = subprocess.run(
            command,
            cwd=step.cwd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
        )
    except OSError as error:
        return StepResult(
            step=step,
            exit_code=127,
            stdout_tail="",
            stderr_tail=tail(str(error), limit=10),
            duration_seconds=perf_counter() - started_at,
        )
    return StepResult(
        step=step,
        exit_code=completed.returncode,
        stdout_tail=tail(completed.stdout),
        stderr_tail=tail(completed.stderr),
        duration_seconds=perf_counter() - started_at,
    )


def _backend_scope_args(paths: list[Path]) -> list[str]:
    return [str(path) for path in paths]


def resolve_performance_run(args: argparse.Namespace) -> PerformanceRun | None:
    if args.backend_only or args.skip_performance:
        return None
    profile = "quick" if args.quick else "full"
    output_path = (
        Path(tempfile.gettempdir()) / f"mv_design_pro_v125_perf_{profile}.json"
    )
    if output_path.exists():
        output_path.unlink()
    return PerformanceRun(profile=profile, output_path=output_path)


def build_performance_step(
    package_manager: str, performance_run: PerformanceRun
) -> Step:
    return Step(
        name=f"Frontend V12.5 performance harness ({performance_run.profile})",
        cwd=FRONTEND_DIR,
        command=run_script_command(
            package_manager,
            "test",
            ["--", "--run", str(PERF_TEST_PATH).replace("\\", "/")],
        ),
        env={
            "V125_PERF_PROFILE": performance_run.profile,
            "V125_PERF_OUTPUT": str(performance_run.output_path),
        },
    )


def build_repo_guard_steps() -> list[Step]:
    return [
        Step(
            name="UI terminology guard",
            cwd=ROOT,
            command=[sys.executable, str(ROOT / "scripts/ui_terminology_guard.py")],
        ),
        Step(
            name="UTF-8 mojibake guard",
            cwd=ROOT,
            command=[sys.executable, str(ROOT / "scripts/utf8_mojibake_guard.py")],
        ),
        Step(
            name="Docs archive guard",
            cwd=ROOT,
            command=[sys.executable, str(ROOT / "scripts/docs_archive_guard.py")],
        ),
        Step(
            name="Import graph guard",
            cwd=ROOT,
            command=[sys.executable, str(ROOT / "scripts/import_graph_guard.py")],
        ),
        Step(
            name="Grep-zero guard",
            cwd=ROOT,
            command=[sys.executable, str(ROOT / "scripts/grep_zero_guard.py")],
        ),
    ]


def verification_label() -> str:
    if REPORT_PATH.stem.endswith("v12_5_1"):
        return "V12.5.1"
    return "V12.5"


def build_steps(
    package_manager: str,
    args: argparse.Namespace,
    performance_run: PerformanceRun | None,
) -> list[Step]:
    if args.performance_only:
        if performance_run is None:
            raise RuntimeError("performance-only mode requires the performance harness")
        return [build_performance_step(package_manager, performance_run)]

    if args.quick:
        steps = [
            *build_repo_guard_steps(),
            Step(
                name="Frontend type-check",
                cwd=FRONTEND_DIR,
                command=run_script_command(package_manager, "type-check"),
            ),
            Step(
                name="Frontend lint",
                cwd=FRONTEND_DIR,
                command=run_script_command(package_manager, "lint"),
            ),
            Step(
                name="Backend V12.5 lint (ruff)",
                cwd=BACKEND_DIR,
                command=[
                    "poetry",
                    "run",
                    "ruff",
                    "check",
                    *_backend_scope_args(BACKEND_V125_SCOPE_PATHS),
                ],
            ),
            Step(
                name="Backend V12.5 format check (black)",
                cwd=BACKEND_DIR,
                command=[
                    "poetry",
                    "run",
                    "python",
                    "-m",
                    "black",
                    "--check",
                    "--diff",
                    *_backend_scope_args(BACKEND_V125_SCOPE_PATHS),
                ],
            ),
            Step(
                name="Backend targeted V12.5 tests",
                cwd=BACKEND_DIR,
                command=[
                    "poetry",
                    "run",
                    "pytest",
                    *_backend_scope_args(BACKEND_V125_TEST_PATHS),
                ],
            ),
            Step(
                name="Frontend V12.5 surface tests",
                cwd=FRONTEND_DIR,
                command=[
                    package_manager,
                    "run",
                    "test",
                    "--",
                    "--run",
                    "src/ui/layout/__tests__/index.test.ts",
                    "src/ui/navigation/__tests__/routes.test.ts",
                    "src/ui/navigation/urlState.test.ts",
                    "src/__tests__/App.routes.test.tsx",
                    "src/ui/workspace/__tests__/workspaceShellV125.test.tsx",
                    "src/ui/network-build/__tests__/networkBuildStore.test.ts",
                    "src/ui/network-build/__tests__/gpzAddSnBayFamilyFlow.test.ts",
                    "src/ui/network-build/__tests__/networkBuildStore.routeSurfaces.test.ts",
                    "src/ui/context-menu/__tests__/catalogGate.test.ts",
                    "src/ui/protection-results/__tests__/ProtectionResultsInspectorPage.test.tsx",
                    "src/ui/network-build/__tests__/contextMenuConverterEntry.test.ts",
                    "src/ui/network-build/__tests__/converterSourceEntryPoints.test.tsx",
                    "src/ui/network-build/__tests__/cardEditActions.test.tsx",
                    "src/ui/network-build/__tests__/StartBranchForm.test.tsx",
                    "src/ui/protection-diagnostics/__tests__/ProtectionDiagnosticsPanelContainer.test.tsx",
                    "src/ui/protection-coordination/__tests__/ProtectionSettingsEditor.test.tsx",
                    "src/ui/protection-coordination/__tests__/TracePanel.test.tsx",
                    "src/ui/protection-engine-v1/__tests__/ProtectionSettingsPage.test.tsx",
                    "src/ui/engineering-readiness/__tests__",
                    "src/ui/active-case-bar/__tests__",
                    "src/ui/notifications/__tests__",
                    "src/ui/proof/__tests__",
                    "src/ui/inspector/__tests__",
                ],
            ),
            Step(
                name="Golden tests",
                cwd=FRONTEND_DIR,
                command=run_script_command(package_manager, "test:golden"),
            ),
        ]
        if performance_run is not None:
            steps.append(build_performance_step(package_manager, performance_run))
        return steps

    steps: list[Step] = []
    steps.extend(build_repo_guard_steps())

    if not args.skip_backend:
        steps.extend(
            [
                Step(
                    name="Backend V12.5 lint (ruff)",
                    cwd=BACKEND_DIR,
                    command=[
                        "poetry",
                        "run",
                        "ruff",
                        "check",
                        *_backend_scope_args(BACKEND_V125_SCOPE_PATHS),
                    ],
                ),
                Step(
                    name="Backend V12.5 format check (black)",
                    cwd=BACKEND_DIR,
                    command=[
                        "poetry",
                        "run",
                        "python",
                        "-m",
                        "black",
                        "--check",
                        "--diff",
                        *_backend_scope_args(BACKEND_V125_SCOPE_PATHS),
                    ],
                ),
                Step(
                    name="Backend targeted V12.5 tests",
                    cwd=BACKEND_DIR,
                    command=[
                        "poetry",
                        "run",
                        "pytest",
                        *_backend_scope_args(BACKEND_V125_TEST_PATHS),
                    ],
                ),
            ]
        )

    if not args.skip_vulture:
        steps.append(
            Step(
                name="Vulture guard",
                cwd=ROOT,
                command=[sys.executable, str(ROOT / "scripts/vulture_guard.py")],
            )
        )

    if not args.backend_only:
        steps.extend(
            [
                Step(
                    name="Frontend lint",
                    cwd=FRONTEND_DIR,
                    command=run_script_command(package_manager, "lint"),
                ),
                Step(
                    name="Frontend type-check",
                    cwd=FRONTEND_DIR,
                    command=run_script_command(package_manager, "type-check"),
                ),
            ]
        )

    if not args.skip_frontend_tests and not args.backend_only:
        steps.append(
            Step(
                name="Frontend tests",
                cwd=FRONTEND_DIR,
                command=run_script_command(package_manager, "test"),
            )
        )

    if performance_run is not None:
        steps.append(build_performance_step(package_manager, performance_run))

    if not args.skip_golden and not args.backend_only:
        steps.append(
            Step(
                name="Golden tests",
                cwd=FRONTEND_DIR,
                command=run_script_command(package_manager, "test:golden"),
            )
        )

    if not args.skip_e2e and not args.backend_only:
        steps.append(
            Step(
                name="E2E tests",
                cwd=FRONTEND_DIR,
                command=run_script_command(package_manager, "test:e2e"),
            )
        )

    return steps


def load_performance_report(performance_run: PerformanceRun | None) -> dict | None:
    if performance_run is None or not performance_run.output_path.exists():
        return None
    try:
        return json.loads(performance_run.output_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return {"_error": str(error)}


def _format_step_environment(step: Step) -> str | None:
    if not step.env:
        return None
    return ", ".join(f"{key}={value}" for key, value in step.env.items())


def _summarize_failed_step(result: StepResult) -> str:
    for source in (result.stderr_tail, result.stdout_tail):
        for line in source.splitlines():
            candidate = line.strip()
            if candidate:
                return candidate
    return "No output captured."


def build_performance_report_lines(
    performance_run: PerformanceRun | None,
    performance_report: dict | None,
) -> list[str]:
    lines = [
        "",
        "## Performance Report",
        "",
    ]

    if performance_run is None:
        lines.append("- Performance harness skipped for this run.")
        return lines

    if performance_report is None:
        lines.append(
            f"- Performance harness profile `{performance_run.profile}` did not produce a readable report."
        )
        return lines

    if performance_report.get("_error"):
        lines.append(
            f"- Performance harness profile `{performance_run.profile}` produced an unreadable report: "
            f"`{performance_report['_error']}`"
        )
        return lines

    warmups = performance_report.get("warmups", "?")
    samples = performance_report.get("samples", "?")
    measured_at = performance_report.get("measuredAt", "unknown")
    lines.extend(
        [
            f"- Profile: `{performance_report.get('profile', performance_run.profile)}`",
            f"- Measured at: `{measured_at}`",
            f"- Harness: `frontend/{PERF_TEST_PATH.as_posix()}`",
            f"- Methodology: `{warmups}` warm-up run(s) + `{samples}` measured run(s) per target.",
            "",
            "| Target | Kind | Mean [ms] | Median [ms] | P95 [ms] | Max [ms] | Samples [ms] |",
            "|---|---|---:|---:|---:|---:|---|",
        ]
    )

    for target in performance_report.get("targets", []):
        sample_values = ", ".join(
            f"{float(value):.2f}" for value in target.get("sampleMs", [])
        )
        lines.append(
            "| {target} | {kind} | {mean:.2f} | {median:.2f} | {p95:.2f} | {max:.2f} | {samples} |".format(
                target=target.get("label", target.get("targetId", "unknown")),
                kind=target.get("measurementKind", "mount"),
                mean=float(target.get("meanMs", 0.0)),
                median=float(target.get("medianMs", 0.0)),
                p95=float(target.get("p95Ms", 0.0)),
                max=float(target.get("maxMs", 0.0)),
                samples=sample_values or "<empty>",
            )
        )

    return lines


def write_report(
    package_manager: str,
    results: list[StepResult],
    performance_run: PerformanceRun | None,
    performance_report: dict | None,
) -> None:
    generated_at = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%SZ")
    label = verification_label()
    lines = [
        f"# Verification {label}",
        "",
        f"- Generated at: `{generated_at}`",
        f"- Package manager: `{package_manager}`",
        f"- Total steps: `{len(results)}`",
        f"- Passed: `{sum(1 for result in results if result.ok)}`",
        f"- Failed: `{sum(1 for result in results if not result.ok)}`",
        "",
        "| Step | Status | Exit code | Duration [s] |",
        "|---|---|---:|---:|",
    ]

    for result in results:
        status = "PASS" if result.ok else "FAIL"
        lines.append(
            f"| {result.step.name} | {status} | {result.exit_code} | {result.duration_seconds:.2f} |"
        )

    failed_results = [result for result in results if not result.ok]
    lines.extend(["", "## Outcome", ""])
    if failed_results:
        lines.append("- Verification completed with failing steps:")
        for result in failed_results:
            lines.append(f"  - `{result.step.name}`: {_summarize_failed_step(result)}")
    else:
        lines.append("- Verification passed without failing steps.")

    for result in results:
        lines.extend(
            [
                "",
                f"## {result.step.name}",
                "",
                f"- CWD: `{result.step.cwd}`",
                f"- Command: `{subprocess.list2cmdline(result.step.command)}`",
            ]
        )
        env_text = _format_step_environment(result.step)
        if env_text:
            lines.append(f"- Environment: `{env_text}`")
        lines.extend(
            [
                f"- Status: `{'PASS' if result.ok else 'FAIL'}`",
                "",
                "### stdout tail",
                "",
                "```text",
                result.stdout_tail or "<empty>",
                "```",
                "",
                "### stderr tail",
                "",
                "```text",
                result.stderr_tail or "<empty>",
                "```",
            ]
        )

    lines.extend(build_performance_report_lines(performance_run, performance_report))

    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run V12.5 verification gates.")
    parser.add_argument(
        "--quick", action="store_true", help="Run a quick canonical smoke verification."
    )
    parser.add_argument(
        "--performance-only",
        action="store_true",
        help="Run only the V12.5 frontend performance harness and write the report.",
    )
    parser.add_argument(
        "--backend-only",
        action="store_true",
        help="Run only backend-owned V12.5 checks plus repo guards.",
    )
    parser.add_argument(
        "--skip-backend",
        action="store_true",
        help="Skip backend lint/format/test steps.",
    )
    parser.add_argument(
        "--skip-frontend-tests", action="store_true", help="Skip frontend vitest suite."
    )
    parser.add_argument("--skip-golden", action="store_true", help="Skip golden tests.")
    parser.add_argument("--skip-e2e", action="store_true", help="Skip E2E tests.")
    parser.add_argument(
        "--skip-vulture", action="store_true", help="Skip vulture dead-code guard."
    )
    parser.add_argument(
        "--skip-performance",
        action="store_true",
        help="Skip the V12.5 frontend performance harness.",
    )
    args = parser.parse_args()
    if args.performance_only and args.skip_performance:
        parser.error("--performance-only cannot be combined with --skip-performance.")
    if args.performance_only and args.backend_only:
        parser.error("--performance-only cannot be combined with --backend-only.")
    return args


def main() -> int:
    args = parse_args()
    package_manager = detect_package_manager(FRONTEND_DIR)
    performance_run = resolve_performance_run(args)
    steps = build_steps(package_manager, args, performance_run)
    results = [run_step(step) for step in steps]
    performance_report = load_performance_report(performance_run)
    write_report(package_manager, results, performance_run, performance_report)

    failed = [result for result in results if not result.ok]
    if failed:
        print(f"{verification_label()} verification failed. See {REPORT_PATH.name} for details.")
        return 1

    print(f"{verification_label()} verification passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
