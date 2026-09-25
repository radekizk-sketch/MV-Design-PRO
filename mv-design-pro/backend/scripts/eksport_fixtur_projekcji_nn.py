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

`--sprawdz` nie zapisuje — kończy kodem 1, gdy generator zapisałby inne bajty niż leżą
w repo (reguła zapisu liczb ``tests/golden/zapis_fikstur`` + kotwica w szumie
``tresc_do_zapisu``: różnica wyłącznie w tolerancji międzymaszynowej nie przepisuje pliku).
"""

from __future__ import annotations

import argparse
import json
import math
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
from tests.golden.zapis_fikstur import json_fikstury, zaokraglij_liczby  # noqa: E402

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
                # CV-1-W: magazyn ENM kluczowany kluczem projektu — ten skrypt
                # nie ma bazy danych (fixtury liczone w izolacji), więc klucz
                # magazynu jest TYM SAMYM surowym identyfikatorem, pod którym
                # `set_enm` powyżej faktycznie zapisał model.
                klucz_twin=case_id,
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
    # Każdy wiersz profilu powtarza znacznik czasu i identyfikator przebiegu
    # (kontrakt widoku profilu) — te same podmiany co dla kontekstu.
    wiersze = profil.get("rows") if isinstance(profil, dict) else None
    for wiersz in wiersze or []:
        if isinstance(wiersz, dict):
            if wiersz.get("run_id"):
                wiersz["run_id"] = f"przebieg-{slug}"
            if wiersz.get("run_timestamp"):
                wiersz["run_timestamp"] = ZNACZNIK_CZASU_FIXTURY
    wynik.pop("projection_hash", None)
    # Reguła zapisu liczb PRZED odciskiem: odcisk fixtury jest skrótem liczb, które w niej
    # leżą (spójność sprawdza test tą samą funkcją co backend).
    wynik = zaokraglij_liczby(wynik)
    wynik["projection_hash"] = _canonical_hash(wynik)
    return wynik


#: Tolerancja względna liczb projekcji MIĘDZY MASZYNAMI. Wartości rozpływu (Newton,
#: tolerancja zbieżności 1e-8) i Z-bus (LAPACK) nie są bitowo identyczne między
#: procesorami — ścieżka SIMD biblioteki zmienia ostatnie bity i drogę zbieżności
#: (precedens: pin jakobianu, commit 98580f24). Zmierzone odchylenie runner CI vs
#: kontener deweloperski: max 2,1e-10 względnie (Q kabla w 16_stale_result).
#: 1e-9 leży rząd wielkości ponad pomiarem i siedem rzędów pod dokładnością
#: prezentowaną inżynierowi. Struktura, klucze, teksty, stany i identyfikatory
#: porównywane są DOKŁADNIE; odcisk `projection_hash` (skrót liczb) — przez
#: spójność fixtury z jej własną treścią.
TOLERANCJA_WZGLEDNA_MIEDZY_MASZYNAMI = 1e-9


def roznice_z_tolerancja(repo: object, backend: object, sciezka: str = "$") -> list[str]:
    """Ścieżki, na których fixtura różni się od projekcji backendu poza tolerancją.

    JEDEN predykat dla testu (``test_scenariusze_nn``: lista pusta = fixtura aktualna)
    i dla zapisu (``tresc_do_zapisu``: lista pusta = plik zostaje bajt w bajt)."""
    if isinstance(repo, bool) or isinstance(backend, bool):
        ok = type(repo) is type(backend) and repo == backend
        return [] if ok else [f"{sciezka}: {repo!r} != {backend!r}"]
    if isinstance(repo, int | float) and isinstance(backend, int | float):
        ok = math.isclose(
            repo, backend, rel_tol=TOLERANCJA_WZGLEDNA_MIEDZY_MASZYNAMI, abs_tol=1e-15
        )
        return [] if ok else [f"{sciezka}: {repo!r} != {backend!r}"]
    if isinstance(repo, dict) and isinstance(backend, dict):
        if set(repo) != set(backend):
            return [f"{sciezka}: klucze {set(repo) ^ set(backend)}"]
        return [
            r
            for klucz in repo
            if klucz != "projection_hash"
            for r in roznice_z_tolerancja(repo[klucz], backend[klucz], f"{sciezka}/{klucz}")
        ]
    if isinstance(repo, list) and isinstance(backend, list):
        if len(repo) != len(backend):
            return [f"{sciezka}: długość {len(repo)} != {len(backend)}"]
        return [
            r
            for i, (a, b) in enumerate(zip(repo, backend, strict=True))
            for r in roznice_z_tolerancja(a, b, f"{sciezka}[{i}]")
        ]
    return [] if repo == backend else [f"{sciezka}: {repo!r} != {backend!r}"]


def tresc_do_zapisu(sciezka: Path, projekcja: dict[str, Any]) -> str:
    """Treść pliku fixtury — KOTWICA W SZUMIE (ten sam wzorzec co harness scen).

    Gdy świeża projekcja różni się od pliku na dysku wyłącznie w tolerancji
    międzymaszynowej (``roznice_z_tolerancja`` — predykat testu), zapisywane są LICZBY Z
    DYSKU przepuszczone przez regułę zapisu: regeneracja na innej maszynie nie wnosi do
    repo szumu ostatnich cyfr, a plik będący punktem stałym reguły zostaje bajt w bajt."""
    tresc = json_fikstury(projekcja)
    if not sciezka.exists():
        return tresc
    na_dysku = sciezka.read_text(encoding="utf-8")
    if na_dysku == tresc:
        return tresc
    zapisana = json.loads(na_dysku)
    if not roznice_z_tolerancja(zapisana, projekcja):
        return json_fikstury(zapisana)
    return tresc


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sprawdz", action="store_true", help="tylko porównaj z plikami w repo")
    args = parser.parse_args(argv)

    rozjazdy: list[str] = []
    for scenariusz in SCENARIUSZE:
        projekcja = normalizuj_projekcje(zbuduj_projekcje_scenariusza(scenariusz), scenariusz.slug)
        sciezka = FIXTURES_DIR / f"{scenariusz.slug}.json"
        tresc = tresc_do_zapisu(sciezka, projekcja)
        if args.sprawdz:
            if not sciezka.exists():
                rozjazdy.append(f"{scenariusz.slug}: brak pliku {sciezka}")
            elif sciezka.read_text(encoding="utf-8") != tresc:
                rozjazdy.append(f"{scenariusz.slug}: JSON w repo różni się od odpowiedzi backendu")
            continue
        FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
        sciezka.write_text(tresc, encoding="utf-8")
        print(f"zapisano {sciezka.relative_to(BACKEND_DIR.parent)}  status={projekcja['status']}")
    if rozjazdy:
        print("\n".join(rozjazdy))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
