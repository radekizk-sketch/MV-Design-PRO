"""Test tożsamości PRZED/PO — karta W3-C2, rozszerzenie `protection_settings/engine.py`.

Karta W3-C2 §0.2 wymaga: "istniejące liczby I>, I>>, cieplne, SPZ dla
dotychczasowych wejść — bit w bit". Ten test to udowadnia LITERALNIE, nie przez
argument — ładuje RZECZYWISTĄ wersję `engine.py` sprzed karty (baza `a16f8d2b`,
`git show`) jako osobny moduł Pythona i porównuje jej wynik z wynikiem bieżącej
(rozszerzonej) wersji, dla tego samego zestawu wejść. Rozszerzenie jest
ADDYTYWNE (nowe pola `local_generation`/`setting_window`, nowe klucze
`generacja_lokalna`/`okno_nastaw` w `to_dict()`) — więc porównywane są
WYŁĄCZNIE bloki, które istniały PRZED kartą: `delayed`, `instantaneous`,
`thermal`, `spz`, `overall_valid`, `summary_notes`.

Baza `a16f8d2b` jest stałym punktem odniesienia tej karty (worktree zresetowany
do niej jako pierwszy krok) — pozostaje w historii gałęzi jako przodek, więc
`git show a16f8d2b:<ścieżka>` jest trwale rozwiązywalne z tego repozytorium.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

BASE_SHA = "a16f8d2b"
REPO_ROOT = Path(__file__).resolve().parents[3]  # katalog repo git (worktree root)
ENGINE_RELATIVE_PATH = "mv-design-pro/backend/src/application/protection_settings/engine.py"


def _wczytaj_modul_z_bazy(tmp_path: Path) -> ModuleType:
    """Wczytaj `engine.py` z bazowego commita jako niezależny moduł."""
    wynik = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "show", f"{BASE_SHA}:{ENGINE_RELATIVE_PATH}"],
        capture_output=True,
        text=True,
        check=True,
    )
    plik_bazowy = tmp_path / "engine_przed_w3c2.py"
    plik_bazowy.write_text(wynik.stdout, encoding="utf-8")

    spec = importlib.util.spec_from_file_location("engine_przed_w3c2", plik_bazowy)
    assert spec is not None and spec.loader is not None
    modul = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = modul
    spec.loader.exec_module(modul)
    return modul


@pytest.fixture(scope="module")
def modul_przed(tmp_path_factory: pytest.TempPathFactory) -> ModuleType:
    return _wczytaj_modul_z_bazy(tmp_path_factory.mktemp("w3c2_baza"))


# Iloczyn cech reprezentatywnych dla dotychczasowej metodyki: materiał
# przewodu (wszystkie 4 z THERMAL_DENSITY) x ważność okna I>> (poprawne /
# sprzeczne) x SPZ (włączone / wyłączone) x stopniowanie czasowe z/bez
# t_upstream. Zestaw wejść z `tests/test_protection_settings.py::_make_input`
# (domyślne wartości linii SN 15 kV) i `tests/test_proof_protection_settings.py`
# (drugi, niezależnie dobrany zestaw liczb).
WEJSCIA_REPREZENTATYWNE: dict[str, dict[str, Any]] = {
    "domyslne_test_protection_settings": {
        "line_id": "L-001",
        "line_name": "Linia SN nr 1",
        "cross_section_mm2": 120.0,
        "conductor_material": "Al",
        "length_km": 5.0,
        "i_nominal_a": 300.0,
        "ik3_max_beginning_a": 8000.0,
        "ik3_min_beginning_a": 5000.0,
        "ik3_max_end_a": 4000.0,
        "ik3_min_end_a": 2500.0,
        "ik2_min_end_a": 2000.0,
        "ik_max_next_bus_a": 3000.0,
        "i_load_max_a": 200.0,
        "delta_t_s": 0.3,
        "k_b": 1.2,
        "k_bth": 1.1,
        "t_upstream_s": 0.0,
        "spz_enabled": True,
        "spz_pause_s": 0.5,
    },
    "zestaw_proof_protection_settings": {
        "line_id": "L1",
        "line_name": "Linia SN 15kV",
        "cross_section_mm2": 120.0,
        "conductor_material": "Al",
        "length_km": 5.0,
        "i_nominal_a": 300.0,
        "ik3_max_beginning_a": 8000.0,
        "ik3_min_beginning_a": 5000.0,
        "ik3_max_end_a": 4000.0,
        "ik3_min_end_a": 2500.0,
        "ik2_min_end_a": 2100.0,
        "ik_max_next_bus_a": 3000.0,
        "i_load_max_a": 180.0,
    },
    "przewod_miedziany_spz_wylaczone": {
        "line_id": "L-002",
        "line_name": "Linia SN nr 2 (Cu, bez SPZ)",
        "cross_section_mm2": 95.0,
        "conductor_material": "Cu",
        "length_km": 3.2,
        "i_nominal_a": 260.0,
        "ik3_max_beginning_a": 9500.0,
        "ik3_min_beginning_a": 6200.0,
        "ik3_max_end_a": 4800.0,
        "ik3_min_end_a": 3100.0,
        "ik2_min_end_a": 2700.0,
        "ik_max_next_bus_a": 2200.0,
        "i_load_max_a": 150.0,
        "delta_t_s": 0.5,
        "k_b": 1.25,
        "k_bth": 1.05,
        "t_upstream_s": 0.2,
        "spz_enabled": False,
        "spz_pause_s": 0.5,
    },
    "przewod_alfe_okno_sprzeczne": {
        "line_id": "L-003",
        "line_name": "Linia SN nr 3 (AlFe, okno sprzeczne)",
        "cross_section_mm2": 70.0,
        "conductor_material": "AlFe",
        "length_km": 8.0,
        "i_nominal_a": 210.0,
        "ik3_max_beginning_a": 6000.0,
        "ik3_min_beginning_a": 5000.0,
        "ik3_max_end_a": 3000.0,
        "ik3_min_end_a": 2000.0,
        "ik2_min_end_a": 1800.0,
        "ik_max_next_bus_a": 10000.0,  # bardzo wysoki -> i_min_sel > i_max_sens
        "i_load_max_a": 120.0,
        "delta_t_s": 0.3,
        "k_b": 1.2,
        "k_bth": 1.1,
        "t_upstream_s": 0.0,
        "spz_enabled": True,
        "spz_pause_s": 0.8,
    },
    "przewod_acsr_wysoki_prad": {
        "line_id": "L-004",
        "line_name": "Linia SN nr 4 (ACSR, wysoki prad zwarciowy)",
        "cross_section_mm2": 50.0,
        "conductor_material": "ACSR",
        "length_km": 12.0,
        "i_nominal_a": 170.0,
        "ik3_max_beginning_a": 20000.0,
        "ik3_min_beginning_a": 15000.0,
        "ik3_max_end_a": 9000.0,
        "ik3_min_end_a": 6000.0,
        "ik2_min_end_a": 5200.0,
        "ik_max_next_bus_a": 5000.0,
        "i_load_max_a": 90.0,
        "delta_t_s": 0.3,
        "k_b": 1.15,
        "k_bth": 1.2,
        "t_upstream_s": 0.6,
        "spz_enabled": True,
        "spz_pause_s": 0.5,
    },
    "czulosc_i_delayed_niespelniona": {
        "line_id": "L-005",
        "line_name": "Linia SN nr 5 (I> niska czulosc)",
        "cross_section_mm2": 120.0,
        "conductor_material": "Al",
        "length_km": 5.0,
        "i_nominal_a": 300.0,
        "ik3_max_beginning_a": 8000.0,
        "ik3_min_beginning_a": 5000.0,
        "ik3_max_end_a": 4000.0,
        "ik3_min_end_a": 2500.0,
        "ik2_min_end_a": 300.0,  # bardzo niski -> k_cz < 1.5
        "ik_max_next_bus_a": 3000.0,
        "i_load_max_a": 200.0,
    },
}


def _wynik_do_dict_wspolny(wynik: Any) -> dict[str, Any]:
    """Wytnij TYLKO bloki istniejące przed kartą W3-C2 z `to_dict()`."""
    dane = wynik.to_dict()
    return {
        "line_id": dane["line_id"],
        "line_name": dane["line_name"],
        "delayed": dane["delayed"],
        "instantaneous": dane["instantaneous"],
        "thermal": dane["thermal"],
        "spz": dane["spz"],
        "overall_valid": dane["overall_valid"],
        "summary_notes": dane["summary_notes"],
    }


@pytest.mark.parametrize("nazwa_wejscia", sorted(WEJSCIA_REPREZENTATYWNE))
def test_tozsamosc_przed_po_dla_istniejacych_wejsc(
    modul_przed: ModuleType, nazwa_wejscia: str
) -> None:
    """`ProtectionSettingsEngine.calculate()` — te same liczby PRZED i PO W3-C2."""
    from application.protection_settings.engine import (
        ProtectionSettingsEngine as SilnikPo,
    )
    from application.protection_settings.engine import (
        ProtectionSettingsInput as WejscieDoPo,
    )

    kwargs = WEJSCIA_REPREZENTATYWNE[nazwa_wejscia]

    wejscie_przed = modul_przed.ProtectionSettingsInput(**kwargs)
    wynik_przed = modul_przed.ProtectionSettingsEngine.calculate(wejscie_przed)

    wejscie_po = WejscieDoPo(**kwargs)
    wynik_po = SilnikPo.calculate(wejscie_po)

    assert _wynik_do_dict_wspolny(wynik_przed) == _wynik_do_dict_wspolny(wynik_po), (
        f"Rozbieznosc PRZED/PO dla wejscia '{nazwa_wejscia}' — rozszerzenie W3-C2 "
        "zmienilo istniejaca liczbe zamiast byc czysto addytywne."
    )


def test_po_ma_nowe_bloki_ktorych_przed_nie_mial() -> None:
    """Potwierdzenie, ze rozszerzenie faktycznie DODAJE, a nie tylko nie psuje."""
    from application.protection_settings.engine import ProtectionSettingsEngine as SilnikPo
    from application.protection_settings.engine import ProtectionSettingsInput as WejscieDoPo

    wejscie = WejscieDoPo(**WEJSCIA_REPREZENTATYWNE["domyslne_test_protection_settings"])
    dane = SilnikPo.calculate(wejscie).to_dict()

    assert "generacja_lokalna" in dane
    assert "okno_nastaw" in dane
    # Bloki PRZED zostaja nietkniete co do zbioru kluczy.
    for klucz in ("delayed", "instantaneous", "thermal", "spz", "overall_valid", "summary_notes"):
        assert klucz in dane
