#!/usr/bin/env python3
"""Eksport atrap harnessu scen (`creator-harness.html`) z BACKENDU do frontendu.

DLACZEGO (E2E-FULL-FIX-3, 2026-09-10). Harness scen podmienia `window.fetch`
atrapami o kształcie 1:1 z kontraktami backendu. Dwie końcówki czytają STAN
przypadku (committed ENM + rejestr przebiegów), którego harness nie ma —
zgodność przekrojowa NC RfG (`GET /api/ncrfg-tests/cases/{id}/compliance`)
i werdykt projektowy (`GET /api/quality/design-verdict`). Ręczna kopia payloadu
dryfowała już dwukrotnie (katalog NC RfG, klasy modułów sprzed OD-5), więc te
atrapy NIE są pisane ręcznie: liczy je ten skrypt DOKŁADNIE tymi funkcjami,
które wołają końcówki (`NcRfgComplianceChecker.check` + `model_dump`,
`zbuduj_werdykt_projektowy`), i zapisuje JSON do
`frontend/src/harness-fixtures/generated/<nazwa>.json`.

Dane wejściowe = zasiew sceny harnessu (jedno miejsce prawdy tu, sprawdzane
w biegu: atrapa sceny `macierz` porównuje `der_ref`/moc/napięcie raportów z
modułami zasianymi w `useStationDerStore` i odmawia przy rozjeździe).
Test `tests/ci/test_fixtury_harnessu.py` porównuje JSON w repo ze świeżo
policzonym (rozjazd = czerwony test, nie cicha rozbieżność).

Użycie (z katalogu `backend`):
    poetry run python scripts/eksport_fixtur_harnessu.py [--sprawdz]

`--sprawdz` nie zapisuje — kończy kodem 1, gdy którykolwiek JSON różni się od
świeżo policzonej odpowiedzi.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR / "src"))
sys.path.insert(0, str(BACKEND_DIR))

from application.analyses.werdykt_projektowy import (  # noqa: E402
    zbuduj_werdykt_projektowy,
)
from application.ncrfg_compliance.checker import (  # noqa: E402
    DerDataForCompliance,
    NcRfgComplianceChecker,
)
from enm.hash import compute_enm_hash  # noqa: E402
from enm.models import EnergyNetworkModel, ENMHeader  # noqa: E402

FIXTURES_DIR = BACKEND_DIR.parent / "frontend" / "src" / "harness-fixtures" / "generated"

#: Identyfikator przypadku zasiewu globalnego harnessu (`useAppStateStore`).
CASE_ID_HARNESSU = "case-demo"

#: Scena `macierz` (creator-harness-main.tsx): dwa moduły DER przyłączone przez
#: transformator blokowy do szyny 15 kV — klasa B wg progów OD-5 (1 MW / 50 MW).
#: Zdolności odwzorowują most model → zgodność (`model_bridge.py`) dla tabliczek
#: zasianych w scenie: krzywa LVRT z profilu `lvrt_curve_ref`, model dynamiczny
#: z `dynamic_model_ref`; brak droop/Q(U)/cos φ w tabliczce = brak (nie zgadywanie).
MODULY_SCENY_MACIERZ: tuple[DerDataForCompliance, ...] = (
    DerDataForCompliance(
        der_ref="bess-1",
        p_max_kw=1500.0,
        voltage_kv=15.0,
        has_lvrt_curve=False,
        has_hvrt_curve=False,
        has_pf_droop=False,
        has_qu_curve=False,
        has_dynamic_model=False,
        has_scada_communication=False,
        has_disturbance_recorder=False,
        cos_phi_min=None,
    ),
    DerDataForCompliance(
        der_ref="pv-1",
        p_max_kw=1935.0,
        voltage_kv=15.0,
        has_lvrt_curve=True,
        has_hvrt_curve=False,
        has_pf_droop=False,
        has_qu_curve=False,
        has_dynamic_model=True,
        has_scada_communication=False,
        has_disturbance_recorder=False,
        cos_phi_min=None,
    ),
)
OPERATOR_SCENY_MACIERZ = "enea"


def zgodnosc_przekrojowa_sceny_macierz() -> dict[str, Any]:
    """Odpowiedź `GET /api/ncrfg-tests/cases/{id}/compliance` — ten sam kształt
    co `api/ncrfg_ptpiree_tests.py::run_ncrfg_compliance_from_model`."""
    checker = NcRfgComplianceChecker()
    reports = [checker.check(OPERATOR_SCENY_MACIERZ, der) for der in MODULY_SCENY_MACIERZ]
    return {
        "case_id": CASE_ID_HARNESSU,
        "operator_id": OPERATOR_SCENY_MACIERZ,
        "der_count": len(reports),
        "reports": [
            {
                **report.model_dump(mode="json"),
                "overall_pass": report.overall_pass,
                "total_tests": report.total_tests,
                "passed_count": report.passed_count,
                "no_module_count": report.no_module_count,
            }
            for report in reports
        ],
    }


def werdykt_projektowy_sceny_uwaga() -> dict[str, Any]:
    """Odpowiedź `GET /api/quality/design-verdict?case_id=` dla przypadku BEZ
    przebiegów w rejestrze backendu — ten sam agregat co `build_werdykt_projektowy_view`.

    Scena `uwaga` zasiewa wynik rozpływu WYŁĄCZNIE po stronie klienta
    (`usePowerFlowResultsStore`); backend biegu takiego nie zna, więc uczciwy
    werdykt to „niesprawdzone — brak biegu" (kolektor rejestru bierze wtedy
    przekroczenia ze store'u, a nie z werdyktu)."""
    enm = EnergyNetworkModel(header=ENMHeader(name="Projekt demonstracyjny"))
    return zbuduj_werdykt_projektowy(
        case_id=CASE_ID_HARNESSU,
        model_hash=compute_enm_hash(enm),
        bieg_pf=None,
        bieg_sc=None,
        enm_snapshot=enm.model_dump(mode="json"),
    ).to_dict()


#: Nazwa pliku → funkcja licząca odpowiedź (kolejność = kolejność eksportu).
FIXTURY: dict[str, Any] = {
    "ncrfg_zgodnosc_przekrojowa_scena_macierz": zgodnosc_przekrojowa_sceny_macierz,
    "werdykt_projektowy_scena_uwaga": werdykt_projektowy_sceny_uwaga,
}


def _json(dane: dict[str, Any]) -> str:
    return json.dumps(dane, ensure_ascii=False, indent=2, sort_keys=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sprawdz", action="store_true", help="tylko porównaj z repo")
    args = parser.parse_args(argv)

    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    rozjazdy: list[str] = []
    for nazwa, funkcja in FIXTURY.items():
        sciezka = FIXTURES_DIR / f"{nazwa}.json"
        tresc = _json(funkcja())
        if args.sprawdz:
            if not sciezka.exists() or sciezka.read_text(encoding="utf-8") != tresc:
                rozjazdy.append(nazwa)
                print(f"[rozjazd] {sciezka}")
            else:
                print(f"[ok] {sciezka}")
            continue
        sciezka.write_text(tresc, encoding="utf-8")
        print(f"[zapisano] {sciezka}")
    return 1 if rozjazdy else 0


if __name__ == "__main__":
    sys.exit(main())
