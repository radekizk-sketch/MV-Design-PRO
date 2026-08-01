"""Kontrakt miedzy straznikami: konsumenci `_main_included_routers` musza dzialac.

DLACZEGO TEN TEST ISTNIEJE (V12K-300, 2026-08-01)
-------------------------------------------------
Karta KD-9 (V12K-296) rozszerzyla `api_lifecycle_guard._main_included_routers()`
z krotek 2-elementowych do 3-elementowych (modul, symbol, prefiks), zeby straznik
widzial routery o nazwach innych niz `router`. `legacy_public_path_guard`
rozpakowywal wynik po staremu i wywracal sie na `ValueError: too many values to
unpack` — CZTERY kolejne szczyty galezi mialy czerwony workflow "P0 Extended
Guards", mimo ze KAZDY straznik uruchamiany pojedynczo w bramkach odbioru byl
zielony. Powod: zaden lancuch bramek nie uruchamial `legacy_public_path_guard`,
bo nie byl on w zestawie kart, ktore wtedy odbieralem.

Test przypina WSPOLDZIALANIE, nie implementacje: wola realna funkcje konsumenta,
ktora przed naprawa rzucala wyjatek. Gdyby ktos znow zmienil ksztalt krotki bez
aktualizacji konsumentow, ten test zapali sie w `pytest tests/ci` — czyli w
bramce, ktora KAZDA karta uruchamia.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[3] / "scripts"


def _zaladuj(nazwa: str):
    """Laduje straznika ze `scripts/` (katalog poza pakietami zrodlowymi)."""
    sciezka = SCRIPTS_DIR / f"{nazwa}.py"
    spec = importlib.util.spec_from_file_location(nazwa, sciezka)
    assert spec and spec.loader, f"nie da sie zaladowac {sciezka}"
    modul = importlib.util.module_from_spec(spec)
    sys.modules[nazwa] = modul
    spec.loader.exec_module(modul)
    return modul


def test_krotka_routera_ma_trzy_pola_z_nazwami_modulu_symbolu_i_prefiksu() -> None:
    """Ksztalt kontraktu: (modul, symbol, prefiks) — zmiana wymaga aktualizacji konsumentow."""
    guard = _zaladuj("api_lifecycle_guard")
    routery = guard._main_included_routers()
    assert routery, "main.py wpina co najmniej jeden router"
    for wpis in routery:
        assert len(wpis) == 3, f"krotka routera zmienila ksztalt: {wpis!r}"
        assert all(
            isinstance(pole, str) for pole in wpis
        ), f"pola musza byc tekstem: {wpis!r}"


def test_straznik_sciezek_zastanych_konsumuje_kontrakt_bez_wyjatku() -> None:
    """Realny konsument: przed naprawa V12K-300 rzucal ValueError przy rozpakowaniu."""
    legacy = _zaladuj("legacy_public_path_guard")
    moduly = legacy.active_api_module_paths()
    assert moduly, "aktywne moduly API sa odnajdywane po kontrakcie routerow"
    assert all(sciezka.suffix == ".py" for sciezka in moduly)


def test_straznik_sciezek_zastanych_przechodzi_na_biezacym_drzewie() -> None:
    """Bramka merytoryczna: brak importow warstwy zastanej w aktywnym API."""
    legacy = _zaladuj("legacy_public_path_guard")
    assert legacy.check_legacy_public_paths() == []
