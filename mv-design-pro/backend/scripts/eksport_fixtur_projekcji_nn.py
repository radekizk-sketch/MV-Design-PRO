#!/usr/bin/env python3
"""Eksport fixtur projekcji nN (kontrakt 3.0.0) z BACKENDU do frontendu.

Jedno źródło prawdy: scenariusze §47 są modelami ENM
(`tests/application/analyses/lv_domain/scenariusze_nn.py`); ten skrypt liczy z
nich `LvDomainProjectionV1` DOKŁADNIE tą samą funkcją, którą woła końcówka
`/projection/v1`, i zapisuje JSON do
`frontend/src/ui/sld/v3/lv-domain/fixtures/generated/<slug>.json`.

Pola ZMIENNE (identyfikatory przebiegów i znaczniki czasu nadawane przy
wykonaniu przebiegu) są NORMALIZOWANE deterministycznie (`normalizuj_projekcje`)
— tą samą funkcją, którą test `test_scenariusze_nn.py` porównuje JSON w repo z
odpowiedzią backendu (rozjazd = czerwony test, nie cicha rozbieżność).

Użycie (z katalogu `backend`):
    poetry run python scripts/eksport_fixtur_projekcji_nn.py [--sprawdz]

`--sprawdz` nie zapisuje — kończy kodem 1, gdy którykolwiek JSON różni się od
świeżo policzonej projekcji.
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

from application.analyses.lv_domain.projection_v1 import (  # noqa: E402
    _canonical_hash,
    build_lv_domain_projection_v1,
)
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs  # noqa: E402
from enm.store import reset_enm_store, set_enm  # noqa: E402

from tests.application.analyses.lv_domain.scenariusze_nn import (  # noqa: E402
    SCENARIUSZE,
    ScenariuszNn,
)

FIXTURES_DIR = (
    BACKEND_DIR.parent
    / "frontend"
    / "src"
    / "ui"
    / "sld"
    / "v3"
    / "lv-domain"
    / "fixtures"
    / "generated"
)
ZNACZNIK_CZASU_FIXTURY = "2026-09-02T00:00:00+00:00"


def zbuduj_projekcje_scenariusza(scenariusz: ScenariuszNn) -> dict[str, Any]:
    """Projekcja scenariusza — z przebiegiem, gdy scenariusz go wymaga."""
    case_id = f"fixture-{scenariusz.slug}"
    enm = scenariusz.budowniczy()
    run = None
    if scenariusz.przebieg is not None:
        reset_canonical_runs()
        reset_enm_store()
        set_enm(case_id, enm)
        run = execute_run(
            create_run(
                case_id=case_id,
                analysis_type=scenariusz.przebieg,
                options=dict(scenariusz.opcje_przebiegu),
            ).id
        )
        if scenariusz.po_przebiegu is not None:
            scenariusz.po_przebiegu(enm)
    return build_lv_domain_projection_v1(enm, case_id, scenariusz.station_ref, run=run)


def normalizuj_projekcje(projekcja: dict[str, Any], slug: str) -> dict[str, Any]:
    """Zastąp pola nadawane przy wykonaniu przebiegu wartościami stałymi i
    przelicz odcisk projekcji z TEJ SAMEJ funkcji co backend."""
    wynik = json.loads(json.dumps(projekcja, ensure_ascii=False))
    result = wynik.get("result_snapshot") or {}
    if result.get("run_id"):
        result["run_id"] = f"przebieg-{slug}"
    if result.get("run_finished_at"):
        result["run_finished_at"] = ZNACZNIK_CZASU_FIXTURY
    if result.get("result_signature"):
        result["result_signature"] = f"sygnatura-{slug}"
    profil = result.get("voltage_profile") or {}
    kontekst = profil.get("context") if isinstance(profil, dict) else None
    if isinstance(kontekst, dict):
        if kontekst.get("run_id"):
            kontekst["run_id"] = f"przebieg-{slug}"
        if kontekst.get("run_timestamp"):
            kontekst["run_timestamp"] = ZNACZNIK_CZASU_FIXTURY
    wynik.pop("projection_hash", None)
    wynik["projection_hash"] = _canonical_hash(wynik)
    return wynik


def zapisz(slug: str, projekcja: dict[str, Any]) -> Path:
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    sciezka = FIXTURES_DIR / f"{slug}.json"
    sciezka.write_text(
        json.dumps(projekcja, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return sciezka


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sprawdz", action="store_true", help="tylko porównaj z plikami w repo")
    args = parser.parse_args(argv)

    rozjazdy: list[str] = []
    for scenariusz in SCENARIUSZE:
        projekcja = normalizuj_projekcje(zbuduj_projekcje_scenariusza(scenariusz), scenariusz.slug)
        if args.sprawdz:
            sciezka = FIXTURES_DIR / f"{scenariusz.slug}.json"
            if not sciezka.exists():
                rozjazdy.append(f"{scenariusz.slug}: brak pliku {sciezka}")
                continue
            if json.loads(sciezka.read_text(encoding="utf-8")) != projekcja:
                rozjazdy.append(f"{scenariusz.slug}: JSON w repo różni się od odpowiedzi backendu")
        else:
            sciezka = zapisz(scenariusz.slug, projekcja)
            print(
                f"zapisano {sciezka.relative_to(BACKEND_DIR.parent)}  status={projekcja['status']}"
            )
    if rozjazdy:
        print("\n".join(rozjazdy))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
