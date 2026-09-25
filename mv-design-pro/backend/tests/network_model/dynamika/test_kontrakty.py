"""Kontrakty rdzenia dynamiki: kody odmow, nastawy, brak domyslek liczbowych."""

from __future__ import annotations

import pytest
from network_model.solvers.dynamika.kontrakty import (
    KOD_NASTAWY_SPRZECZNE,
    KODY_ODMOW,
    NastawySolvera,
    OdmowaDynamiki,
    odmowa_braku_pola,
)

from tests.network_model.dynamika.uklady import nastawy


def test_kody_odmow_zamkniete_i_posortowane() -> None:
    """Rejestr kodow jest ZAMKNIETY — kod spoza niego konczy sie bledem programisty.

    Deklaracja „rejestr zamkniety" bez testu bylaby obietnica bez pokrycia
    (CLAUDE.md: deklaracja bez testu = falszywa pewnosc).
    """
    assert KODY_ODMOW == tuple(sorted(KODY_ODMOW))
    assert len(set(KODY_ODMOW)) == len(KODY_ODMOW)
    with pytest.raises(AssertionError, match="spoza rejestru"):
        OdmowaDynamiki("dynamika.kod_ktorego_nie_ma", "proba")


def test_odmowa_niesie_kod_i_pomiar() -> None:
    odmowa = OdmowaDynamiki(KOD_NASTAWY_SPRZECZNE, "komunikat", residuum=0.5, t_s=1.25)
    assert odmowa.kod == KOD_NASTAWY_SPRZECZNE
    assert odmowa.szczegoly == {"residuum": 0.5, "t_s": 1.25}
    assert "dynamika.nastawy_sprzeczne" in str(odmowa)


def test_odmowa_braku_pola_ma_ksztalt_z_karty() -> None:
    """Brak danej wejsciowej to `dynamika.<pole>_missing`, nie domyslka."""
    odmowa = odmowa_braku_pola("punkt_pracy_napiecie", "brak napiecia wezla")
    assert odmowa.kod == "dynamika.punkt_pracy_napiecie_missing"
    assert odmowa.szczegoly["pole"] == "punkt_pracy_napiecie"


@pytest.mark.parametrize(
    ("zmiana", "fragment"),
    [
        ({"dt_s": 0.01, "dt_min_s": 0.001, "dt_max_s": 0.005}, "poza granicami"),
        ({"tolerancja": 0.0}, "musi byc dodatnie"),
        ({"eps_init": -1.0}, "musi byc dodatnie"),
        ({"max_iteracji_newtona": 0}, "max_iteracji_newtona"),
        ({"max_nawrotow": -1}, "max_nawrotow"),
        ({"krok_wyjscia_s": 5.0, "horyzont_s": 1.0}, "krok_wyjscia_s"),
        ({"tolerancja_lokalizacji_zdarzen_s": 0.0}, "musi byc dodatnia"),
        ({"tolerancja_lokalizacji_zdarzen_s": -1e-9}, "musi byc dodatnia"),
    ],
)
def test_nastawy_sprzeczne_sa_odmawiane(zmiana: dict[str, float], fragment: str) -> None:
    """Kazda wewnetrzna sprzecznosc nastaw konczy sie odmowa NAZWANA, nie biegiem."""
    pola = {
        "dt_s": 0.001,
        "dt_min_s": 0.001,
        "dt_max_s": 0.001,
        "tolerancja": 1e-10,
        "tolerancja_kroku": 1e-6,
        "eps_init": 1e-8,
        "max_iteracji_newtona": 30,
        "max_nawrotow": 20,
        "horyzont_s": 1.0,
        "krok_wyjscia_s": 0.01,
        "integrator": "trapez_niejawny",
        "tolerancja_lokalizacji_zdarzen_s": None,
    }
    pola.update(zmiana)
    with pytest.raises(OdmowaDynamiki) as blad:
        NastawySolvera(**pola)  # type: ignore[arg-type]
    assert blad.value.kod == KOD_NASTAWY_SPRZECZNE
    assert fragment in str(blad.value)


def test_krok_staly_rozpoznany_z_granic() -> None:
    assert nastawy(dt_s=0.002).krok_staly is True
    assert nastawy(dt_s=0.002, dt_min_s=0.0005, dt_max_s=0.004).krok_staly is False


def test_nastawy_nie_maja_zadnej_domyslki() -> None:
    """Zero fabrykacji: KAZDE pole nastaw jest wymagane (brak = blad konstruktora)."""
    with pytest.raises(TypeError):
        NastawySolvera()  # type: ignore[call-arg]
