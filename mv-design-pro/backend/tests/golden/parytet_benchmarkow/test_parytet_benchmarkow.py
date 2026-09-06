"""Wyrocznia (b) — parytet starego dialektu benchmarków (CV-4.3 K1).

Przypina BIEŻĄCY wynik własnego NR/BFS starego dialektu
(`application/reference_networks/library.py`) w złotym pliku
(`zlote_wyniki.json`, zebranym `harness.py::zbierz_wpisy` PRZED jakąkolwiek
próbą usunięcia tego kodu — karta A2/K2). Czerwony test = albo regresja
starego dialektu (naprawa u źródła — wciąż ŻYWY kod, konsument `computation.py`/
`/api/v1/reference-networks/*validate`), albo świadoma zmiana wymagająca
odświeżenia złotego pliku (`harness.zbierz_wpisy` + `wpis_do_zapisu`).

To NIE jest wyrocznia fizyki (dialekt = REGRESSION_ONLY, `tests/golden/
registry.py` §32) — to zamrożenie świadka PRZED usunięciem, żeby usunięcie
kodu w A2/K2 było świadomą decyzją (kasuje się plik razem z kodem), nie cichą
utratą jedynego dziś zapisu tego, co ta druga fizyka faktycznie liczyła.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tests.golden.parytet_benchmarkow.harness import SIECI_WLASNEGO_NR, porownaj_wpis, zbierz_wpisy

_ZLOTY_PLIK = Path(__file__).parent / "zlote_wyniki.json"


def _zloty_plik() -> dict[str, dict]:
    with open(_ZLOTY_PLIK, encoding="utf-8") as f:
        return json.load(f)


@pytest.mark.parametrize("network_id", [s[0] for s in SIECI_WLASNEGO_NR])
def test_stary_dialekt_zgodny_ze_zlotym_wynikiem(network_id: str) -> None:
    zloty = _zloty_plik()
    teraz = zbierz_wpisy()
    rozbieznosci = porownaj_wpis(zloty[network_id], teraz[network_id])
    assert not rozbieznosci, (
        f"{network_id}: stary dialekt (własny NR/BFS) zmienił wynik względem złotego pliku "
        f"zebranego przed kartą CV-4.3 K1 — {rozbieznosci}"
    )


def test_zloty_plik_pokrywa_dokladnie_zadeklarowane_sieci() -> None:
    """Deklaracja bez testu = fałszywa pewność (reguła KLASA §4) — złoty plik
    musi mieć DOKŁADNIE jeden wpis na sieć `SIECI_WLASNEGO_NR`, nic więcej."""
    zloty = _zloty_plik()
    oczekiwane = {s[0] for s in SIECI_WLASNEGO_NR}
    assert set(zloty) == oczekiwane


def test_zaden_wpis_nie_jest_cicha_odmowa() -> None:
    """`SIECI_WLASNEGO_NR` deklaruje TYLKO sieci, dla których stary dialekt ma
    czym liczyć (moduł wyklucza SC-only i niezbieżny oze_pv_bess jawnym
    komentarzem) — żaden z pozostałych wpisów nie powinien być odmową."""
    zloty = _zloty_plik()
    odmowy = {k: v.get("odmowa") for k, v in zloty.items() if v.get("odmowa") is not None}
    assert not odmowy, f"sieci z niespodziewaną odmową starego dialektu: {odmowy}"
