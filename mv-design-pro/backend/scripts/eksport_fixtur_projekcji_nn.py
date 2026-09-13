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

# Precyzja zapisu liczb w fixturze — ile cyfr znaczących przeżywa zapis.
#
# POWÓD (pomiar, nie założenie). Projekcja niesie liczby z dwóch ścieżek
# numerycznych, obu wrażliwych na środowisko:
#
# 1. Zwarcia i pętla zwarcia — `np.linalg.inv(y_bus)` w
#    `short_circuit_core.build_zbus`. LAPACK/BLAS dobiera blokowanie i kolejność
#    redukcji do liczby wątków i do mikroarchitektury, a dodawanie
#    zmiennoprzecinkowe nie jest łączne. Pomiar na tych 18 scenariuszach
#    (2026-09-13, TA SAMA maszyna, różnica wyłącznie w `OPENBLAS_NUM_THREADS=1`
#    wobec `=4`): 9081 wartości, 26 różnic, maksimum 2 ULP (3,242e-16 względnie).
#    W obrębie jednej konfiguracji wynik jest powtarzalny co do bitu.
# 2. Rozpływ mocy (`16_stale_result`) — solver iteracyjny, więc wartość jest
#    określona najwyżej do ścieżki zbieżności. Dziennik CI dla `4c0ab856`
#    (inny procesor niż deweloperski) pokazał na tej ścieżce różnice do
#    **5,3e-12 względnie** (2,346974077487094 wobec 2,3469740774995858) — czyli
#    o cztery rzędy większe niż szum BLAS ścieżki zwarciowej.
#
# Wniosek: porównanie „bajt w bajt" surowych liczb podwójnej precyzji NIE JEST
# kontraktem możliwym do dotrzymania między maszynami, a SHA-256 nad surowym
# `repr(float)` zamienia jeden ostatni bit w zupełnie inny `projection_hash`.
# Fixtura zapisuje więc liczby z JAWNIE ZADEKLAROWANĄ precyzją, a odcisk liczy
# się z postaci już skwantowanej.
#
# Dlaczego 5 cyfr znaczących — z POMIARU MARGINESU, nie z rachunku
# prawdopodobieństwa. Kwantyzacja chroni tylko wtedy, gdy wartość nie leży przy
# granicy zaokrąglenia. Zmierzony najmniejszy względny margines do granicy w
# całym korpusie (2026-09-13):
#
#     4 cyfry → 1,298e-07      6 cyfr → 1,558e-09
#     5 cyfr → 2,816e-08       7 cyfr → 8,393e-11
#
# Przy 5 cyfrach najciaśniejsza wartość leży 2,816e-08 od granicy, czyli
# **5300 razy dalej** niż największy zmierzony szum międzymaszynowy (5,3e-12).
# Przy 6 cyfrach zapas spada do 294, przy 7 — do 16, czyli do poziomu, na którym
# pojedynczy inny procesor znów przerzuca odcisk. 5 cyfr znaczących to dla prądu
# 23,748 A rozdzielczość 0,001 A — o rzędy wielkości poniżej dokładności
# jakiegokolwiek pomiaru i poniżej tego, co pokazuje UI.
#
# Grubiej NIE znaczy bezpieczniej — i to też jest pomiar, nie intuicja. Przy
# 3 cyfrach znaczących wartość katalogowa 0,022150000000000003 Ω
# (`13_loads_via_fields/.../r_ohm`) leży DOKŁADNIE na granicy między 0,0221 a
# 0,0222: margines 9,2e-17, czyli zero. Okrągła liczba z katalogu trafia w węzeł
# zgrubnej siatki częściej niż wynik obliczenia. Precyzję wybiera więc pomiar
# marginesu na konkretnym korpusie, a nie reguła „im mniej cyfr, tym lepiej".
#
# Faktyczny margines jest PRZYPIĘTY testem
# (`test_scenariusze_nn.py::TestKwantyzacjaFixtur`), a nie zadeklarowany: gdyby
# model zaczął produkować wartość siedzącą przy granicy, test pada natychmiast,
# a nie losowo w CI.
CYFRY_ZNACZACE_FIXTURY = 5

# Największa zmierzona różnica względna TEJ SAMEJ wielkości między maszynami
# (ścieżka rozpływu, dziennik CI `4c0ab856`). Punkt odniesienia dla marginesu
# kwantyzacji — nie próg do podkręcania, tylko zapisany pomiar.
SZUM_MIEDZYMASZYNOWY_WZGLEDNY = 5.3e-12


def kwantyzuj(wartosc: float) -> float:
    """Zaokrąglij do `CYFRY_ZNACZACE_FIXTURY` cyfr znaczących, deterministycznie.

    Formatowanie dziesiętne CPythona jest poprawnie zaokrąglone i niezależne od
    platformy — w przeciwieństwie do drogi przez `math.log10`, która sama może
    chybić o 1 ULP przy potędze dziesiątki i wybrać inny wykładnik.
    """
    if not math.isfinite(wartosc):
        return wartosc
    return float(f"{wartosc:.{CYFRY_ZNACZACE_FIXTURY - 1}e}")


def kwantyzuj_liczby(obiekt: Any) -> Any:
    """Ta sama kwantyzacja w każdym zakamarku ładunku (klasa, nie instancja).

    `bool` jest podklasą `int`, ale nie `float` — wartości logiczne i całkowite
    przechodzą nietknięte; kwantyzacji podlegają WYŁĄCZNIE liczby
    zmiennoprzecinkowe.
    """
    if isinstance(obiekt, dict):
        return {klucz: kwantyzuj_liczby(wartosc) for klucz, wartosc in obiekt.items()}
    if isinstance(obiekt, list):
        return [kwantyzuj_liczby(element) for element in obiekt]
    if isinstance(obiekt, float):
        return kwantyzuj(obiekt)
    return obiekt


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
    # Kwantyzacja PRZED odciskiem: hash liczy się z dokładnie tych liczb, które
    # trafiają do pliku — inaczej odcisk obiecywałby stabilność, której ładunek
    # obok niego nie ma.
    wynik = kwantyzuj_liczby(wynik)
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
