#!/usr/bin/env python3
"""Migrate ENM v12s endpoint ports — CLI runner.

Reads an ENM JSON file, runs the conservative endpoint-port automigration
(:mod:`enm.migrations.endpoint_ports`), writes the migrated model back, and
emits a JSON report next to the output file.

Usage::

    poetry run python backend/scripts/migrate_v12s_endpoint_ports.py \
        --input enm.json --output enm.migrated.json --report report.json

    poetry run python backend/scripts/migrate_v12s_endpoint_ports.py \
        --input enm.json --dry-run

The migration is idempotent: re-running yields ``connections_already_complete``
counts but produces no new assignments. Ambiguous endpoints (0 or ≥2 candidate
ports) are left as ``None`` so the ENM validator emits the E030 blocker and the
operator can resolve them via E-12 (segment SN).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Make `enm` importable when running from repo root.
_BACKEND_SRC = Path(__file__).resolve().parents[1] / "src"
if str(_BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(_BACKEND_SRC))

from enm import models as enm_models  # noqa: E402
from enm.migrations.endpoint_ports import migrate, needs_migration  # noqa: E402


def _load_model(path: Path) -> enm_models.EnergyNetworkModel:
    with path.open("r", encoding="utf-8") as fh:
        payload = json.load(fh)
    return enm_models.EnergyNetworkModel.model_validate(payload)


def _save_model(path: Path, model: enm_models.EnergyNetworkModel) -> None:
    payload = model.model_dump(mode="json")
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2, sort_keys=True)


def _save_report(path: Path, report_payload: dict) -> None:
    with path.open("w", encoding="utf-8") as fh:
        json.dump(report_payload, fh, ensure_ascii=False, indent=2, sort_keys=True)


def _build_argparser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Konserwatywna migracja endpoint_a_port / endpoint_b_port w ENM."
    )
    parser.add_argument("--input", required=True, type=Path, help="ścieżka do pliku ENM JSON")
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="ścieżka wynikowa (gdy pominięta i nie --dry-run: nadpisuje --input)",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=None,
        help="ścieżka raportu JSON (gdy pominięta: <output>.migration_report.json)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="nie zapisuj pliku wyjściowego; jedynie raport (do stdout / --report)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="ogranicz logi do błędów",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_argparser().parse_args(argv)

    input_path: Path = args.input
    if not input_path.exists():
        print(f"BŁĄD: plik wejściowy nie istnieje: {input_path}", file=sys.stderr)
        return 2

    model = _load_model(input_path)
    initial_needs = needs_migration(model)
    _, report = migrate(model)

    report_payload = {
        "input_file": str(input_path),
        "needs_migration_before": initial_needs,
        "needs_migration_after": needs_migration(model),
        **report.to_dict(),
    }

    if args.dry_run:
        json.dump(report_payload, sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
        sys.stdout.write("\n")
        return 0

    output_path = args.output or input_path
    _save_model(output_path, model)

    report_path = args.report or output_path.with_suffix(
        output_path.suffix + ".migration_report.json"
    )
    _save_report(report_path, report_payload)

    if not args.quiet:
        scanned = report.connections_scanned
        assigned = report.endpoints_assigned
        unassigned = report.endpoints_left_unassigned
        complete = report.connections_already_complete
        print(
            "Migracja zakończona: "
            f"połączenia={scanned}, kompletne_przed={complete}, "
            f"przypisane_porty={assigned}, niedoprzypisane={unassigned}, "
            f"wynik={output_path}, raport={report_path}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
