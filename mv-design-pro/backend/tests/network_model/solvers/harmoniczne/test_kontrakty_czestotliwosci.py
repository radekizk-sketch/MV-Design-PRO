"""Kontrakty `OsCzestotliwosci` (H-41) i `SupraharmonicBand` (S-54) — karta AB-1d_min.

Przypina: f ∈ ℝ⁺ w Hz jako klucz (interharmoniczne mozliwe), rzad h pochodny,
brak wartosci domyslnych, brak cichych poprawek (sortowania, deduplikacji),
siatki kanoniczne porownywane dokladnie, pasmo bez zaszytych granic, zamkniety
zbior kodow odmow i determinizm rundtripu JSON.
"""

from __future__ import annotations

import dataclasses
import inspect
import json
import math
from pathlib import Path
from typing import Any

import pytest
from network_model.solvers import harmoniczne
from network_model.solvers.harmoniczne import (
    KODY_KONTRAKTU_CZESTOTLIWOSCI,
    KontraktCzestotliwosciError,
    OsCzestotliwosci,
    RodzajOsiCzestotliwosci,
    SupraharmonicBand,
)
from network_model.solvers.harmoniczne.kontrakty import (
    KOD_OS_NIEPOPRAWNA,
    KOD_PASMO_NIEPOPRAWNE,
    POLA_PASMA_SUPRAHARMONICZNEGO,
)
from network_model.solvers.harmoniczne.os_czestotliwosci import (
    POLA_OSI_CZESTOTLIWOSCI,
    siatka_liniowa,
    siatka_logarytmiczna,
)

PASMO: dict[str, Any] = {
    "f_min_hz": 2000.0,
    "f_max_hz": 150000.0,
    "frequency_resolution_hz": 200.0,
    "aggregation_bandwidth_hz": 2000.0,
    "measurement_method": "metoda testowa",
    "source_document": "dokument testowy",
    "version": "1",
}


def _os(**nadpisania: Any) -> dict[str, Any]:
    dane: dict[str, Any] = {
        "rodzaj": "LISTA",
        "f_hz": [75.0, 175.0, 2500.5],
        "f1_hz": 50.0,
        "zrodlo": "test",
    }
    dane.update(nadpisania)
    return dane


def test_pakiet_zawiera_wylacznie_kontrakty_bez_fizyki() -> None:
    """Granica karty: pakiet ma TYLKO `__init__`, `os_czestotliwosci`, `kontrakty`."""
    katalog = Path(harmoniczne.__file__).parent
    pliki = sorted(p.name for p in katalog.glob("*.py"))
    assert pliki == ["__init__.py", "kontrakty.py", "os_czestotliwosci.py"]
    for plik in pliki:
        tekst = (katalog / plik).read_text(encoding="utf-8")
        assert "import numpy" not in tekst and "import scipy" not in tekst, plik


def test_kontrakty_bez_wartosci_domyslnych() -> None:
    for klasa in (OsCzestotliwosci, SupraharmonicBand):
        for pole in dataclasses.fields(klasa):
            assert pole.default is dataclasses.MISSING, (klasa.__name__, pole.name)
            assert pole.default_factory is dataclasses.MISSING, (
                klasa.__name__,
                pole.name,
            )
    assert tuple(pole.name for pole in dataclasses.fields(SupraharmonicBand)) == (
        POLA_PASMA_SUPRAHARMONICZNEGO
    )
    assert set(POLA_OSI_CZESTOTLIWOSCI) == {p.name for p in dataclasses.fields(OsCzestotliwosci)}


def test_interharmoniczne_i_rzad_pochodny() -> None:
    os = OsCzestotliwosci.z_dict(_os())
    assert os.rzedy == (1.5, 3.5, 50.01)
    assert os.to_dict() == _os()


def test_os_harmoniczna_wymaga_calkowitych_wielokrotnosci_dokladnie() -> None:
    OsCzestotliwosci.z_dict(_os(rodzaj="HARMONICZNE", f_hz=[100.0, 250.0, 2500.0]))
    with pytest.raises(KontraktCzestotliwosciError) as exc:
        OsCzestotliwosci.z_dict(_os(rodzaj="HARMONICZNE", f_hz=[100.0, 125.0]))
    assert exc.value.kod == KOD_OS_NIEPOPRAWNA
    # f1 60 Hz — ta sama regula dla innej czestotliwosci studium.
    OsCzestotliwosci.z_dict(_os(rodzaj="HARMONICZNE", f_hz=[180.0, 300.0], f1_hz=60.0))


@pytest.mark.parametrize(
    "zle",
    [
        {"f_hz": []},
        {"f_hz": [0.0]},
        {"f_hz": [-50.0]},
        {"f_hz": [math.inf]},
        {"f_hz": [math.nan]},
        {"f_hz": [True]},
        {"f_hz": ["250"]},
        {"f_hz": [250.0, 150.0]},  # brak cichego sortowania
        {"f_hz": [250.0, 250.0]},  # brak cichej deduplikacji
        {"f_hz": "250"},
        {"f1_hz": 0.0},
        {"f1_hz": None},
        {"zrodlo": ""},
        {"zrodlo": "   "},
        {"rodzaj": "RZEDY"},
    ],
)
def test_os_niepoprawna_to_odmowa_nazwana(zle: dict[str, Any]) -> None:
    with pytest.raises(KontraktCzestotliwosciError) as exc:
        OsCzestotliwosci.z_dict(_os(**zle))
    assert exc.value.kod == KOD_OS_NIEPOPRAWNA


@pytest.mark.parametrize("brakujace", POLA_OSI_CZESTOTLIWOSCI)
def test_os_bez_pola_odmawia(brakujace: str) -> None:
    dane = _os()
    del dane[brakujace]
    with pytest.raises(KontraktCzestotliwosciError) as exc:
        OsCzestotliwosci.z_dict(dane)
    assert brakujace in exc.value.komunikat


def test_os_z_polem_nadmiarowym_odmawia() -> None:
    with pytest.raises(KontraktCzestotliwosciError):
        OsCzestotliwosci.z_dict({**_os(), "rzad_max": 50})


@pytest.mark.parametrize(
    ("rodzaj", "generator"),
    [
        (RodzajOsiCzestotliwosci.SIATKA_LIN, siatka_liniowa),
        (RodzajOsiCzestotliwosci.SIATKA_LOG, siatka_logarytmiczna),
    ],
)
def test_siatki_kanoniczne_dokladnie_i_rundtrip_json(rodzaj: Any, generator: Any) -> None:
    punkty = generator(50.0, 2500.0, 31)
    assert punkty[0] == 50.0 and punkty[-1] == 2500.0
    os = OsCzestotliwosci(rodzaj=rodzaj, f_hz=punkty, f1_hz=50.0, zrodlo="test")
    # Rundtrip przez JSON (opcje biegu) zachowuje bity — determinizm odcisku.
    odtworzona = OsCzestotliwosci.z_dict(json.loads(json.dumps(os.to_dict())))
    assert odtworzona == os
    zaburzone = list(punkty)
    zaburzone[5] = zaburzone[5] * (1 + 1e-9)
    with pytest.raises(KontraktCzestotliwosciError):
        OsCzestotliwosci(rodzaj=rodzaj, f_hz=tuple(zaburzone), f1_hz=50.0, zrodlo="test")


def test_siatka_wymaga_dwoch_punktow() -> None:
    with pytest.raises(KontraktCzestotliwosciError):
        siatka_liniowa(50.0, 100.0, 1)
    with pytest.raises(KontraktCzestotliwosciError):
        OsCzestotliwosci.z_dict(_os(rodzaj="SIATKA_LOG", f_hz=[50.0]))


def test_pasmo_poprawne_rundtrip_i_opis() -> None:
    pasmo = SupraharmonicBand.z_dict(PASMO)
    assert pasmo.to_dict() == PASMO
    assert "dokument testowy" in pasmo.opis_pl()


@pytest.mark.parametrize(
    "zle",
    [
        {"f_min_hz": 0.0},
        {"f_min_hz": 150000.0},  # f_min == f_max
        {"f_max_hz": 1000.0},  # f_max < f_min
        {"frequency_resolution_hz": 0.0},
        {"frequency_resolution_hz": 200000.0},  # szersze niz pasmo
        {"aggregation_bandwidth_hz": -1.0},
        {"aggregation_bandwidth_hz": 200000.0},
        {"measurement_method": ""},
        {"source_document": " "},
        {"version": None},
        {"f_min_hz": "2000"},
    ],
)
def test_pasmo_niepoprawne_to_odmowa_nazwana(zle: dict[str, Any]) -> None:
    with pytest.raises(KontraktCzestotliwosciError) as exc:
        SupraharmonicBand.z_dict({**PASMO, **zle})
    assert exc.value.kod == KOD_PASMO_NIEPOPRAWNE


@pytest.mark.parametrize("brakujace", POLA_PASMA_SUPRAHARMONICZNEGO)
def test_pasmo_bez_pola_odmawia(brakujace: str) -> None:
    dane = {k: v for k, v in PASMO.items() if k != brakujace}
    with pytest.raises(KontraktCzestotliwosciError) as exc:
        SupraharmonicBand.z_dict(dane)
    assert brakujace in exc.value.komunikat


def test_pasmo_nie_ma_zaszytych_granic_2_i_150_khz() -> None:
    """S-54: definicja pasma pochodzi ze zrodla — pasmo 9–95 kHz jest rownie legalne."""
    SupraharmonicBand.z_dict({**PASMO, "f_min_hz": 9000.0, "f_max_hz": 95000.0})
    zrodlo = inspect.getsource(harmoniczne.kontrakty)
    for zakazana in ("150000", "150_000", "2000.0", "2_000"):
        assert zakazana not in zrodlo.split('"""', 2)[2], zakazana


def test_zbior_kodow_zamkniety() -> None:
    assert KODY_KONTRAKTU_CZESTOTLIWOSCI == (KOD_OS_NIEPOPRAWNA, KOD_PASMO_NIEPOPRAWNE)
    with pytest.raises(AssertionError):
        KontraktCzestotliwosciError("czestotliwosc.inny", "x")
