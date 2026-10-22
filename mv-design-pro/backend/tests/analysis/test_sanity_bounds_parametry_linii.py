"""Pasma wiarygodności parametrów linii 110 kV (warstwa interpretacji, karta LINIA-110).

Iloczyn cech: parametr {R′1, X′1, B′1, R′0, X′0/X′1, B′0/B′1} × położenie {w paśmie, poniżej,
powyżej, granica, brak wartości} oraz parametry z solvera dla przewodów katalogu × geometria
{projekt, robocza} × przewód odgromowy {jest, brak} — wszystkie w paśmie. Absurd typowy dla
błędu danych (odwrócony GMR/GMD, geometria w milimetrach) wypada poza pasmo.
"""

from __future__ import annotations

import itertools
import math

import pytest
from analysis.sanity_bounds.parametry_linii_bounds import (
    PASMA_LINII_110KV,
    PODSTAWA_PASM_PL,
    ocen_parametry_linii_110kv,
)
from analysis.sanity_bounds.short_circuit_bounds import CREDIBLE, INCOMPLETE, OUT_OF_RANGE
from enm.parametry_linii_wn import dane_przewodu
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.wartosci_robocze import (
    FAZY_SLUPA_TYPOWEGO_M,
    ODGROMOWE_SLUPA_TYPOWEGO_M,
    PRZEWOD_ODGROMOWY_ROBOCZY_REF,
)
from network_model.solvers.parametry_linii_napowietrznej import (
    GeometriaLinii,
    PolozeniePrzewodu,
    WejscieParametrowLinii,
    oblicz_parametry_linii,
)

#: Linia typowa w paśmie (AFL-6 240 na słupie roboczym, ρ = 100 Ω·m).
TYPOWE = {
    "r1_ohm_per_km": 0.119,
    "x1_ohm_per_km": 0.409,
    "b1_s_per_km": 2.786e-6,
    "r0_ohm_per_km": 0.307,
    "x0_ohm_per_km": 1.016,
    "b0_s_per_km": 1.677e-6,
}


def _oceny(**zmiany: float) -> dict[str, object]:
    return {o.parametr: o for o in ocen_parametry_linii_110kv(**{**TYPOWE, **zmiany})}


def test_linia_typowa_w_pasmie_z_podstawa_i_wyjasnieniem() -> None:
    oceny = ocen_parametry_linii_110kv(**TYPOWE)
    assert [o.parametr for o in oceny] == [p.parametr for p in PASMA_LINII_110KV]
    for ocena in oceny:
        assert ocena.w_pasmie
        assert ocena.ocena_wiarygodnosci == CREDIBLE
        assert ocena.podstawa_pl == PODSTAWA_PASM_PL
        assert "mieści się w paśmie" in ocena.wyjasnienie_pl


def _wartosci_dla(parametr: str, wartosc: float) -> dict[str, float]:
    """Dane wejściowe dające wskazaną wartość ocenianego parametru (stosunki przez licznik)."""
    if parametr == "b1_us_per_km":
        return {"b1_s_per_km": wartosc * 1e-6, "b0_s_per_km": wartosc * 1e-6 * 0.6}
    # Mianownik stosunku jest potęgą dwójki: mnożenie i dzielenie są dokładne w float, więc
    # wartość na granicy pasma jest dokładnie granicą (bez fałszywego „poza pasmem").
    if parametr == "x0_do_x1":
        return {"x1_ohm_per_km": 0.25, "x0_ohm_per_km": wartosc * 0.25}
    if parametr == "b0_do_b1":
        return {"b1_s_per_km": 2.0**-18, "b0_s_per_km": wartosc * 2.0**-18}
    return {parametr: wartosc}


@pytest.mark.parametrize(
    ("pasmo", "polozenie"),
    list(itertools.product(PASMA_LINII_110KV, ["ponizej", "powyzej", "dolna", "gorna"])),
    ids=lambda v: getattr(v, "parametr", v),
)
def test_kazde_pasmo_po_obu_stronach_i_na_granicach(pasmo, polozenie: str) -> None:
    wartosc = {
        "ponizej": pasmo.dolna * 0.9,
        "powyzej": pasmo.gorna * 1.1,
        "dolna": pasmo.dolna,
        "gorna": pasmo.gorna,
    }[polozenie]
    ocena = _oceny(**_wartosci_dla(pasmo.parametr, wartosc))[pasmo.parametr]
    assert ocena.wartosc == pytest.approx(wartosc, rel=1e-12)
    if polozenie in ("dolna", "gorna"):
        assert ocena.w_pasmie and ocena.ocena_wiarygodnosci == CREDIBLE
    else:
        assert not ocena.w_pasmie
        assert ocena.ocena_wiarygodnosci == OUT_OF_RANGE
        kierunek = "poniżej" if polozenie == "ponizej" else "powyżej"
        assert f"leży {kierunek} pasma" in ocena.wyjasnienie_pl
        assert "sprawdź geometrię słupa" in ocena.wyjasnienie_pl


@pytest.mark.parametrize("wartosc", [math.nan, math.inf])
def test_wartosc_nieskonczona_to_ocena_niekompletna(wartosc: float) -> None:
    ocena = _oceny(r1_ohm_per_km=wartosc)["r1_ohm_per_km"]
    assert ocena.ocena_wiarygodnosci == INCOMPLETE
    assert ocena.wartosc is None
    assert not ocena.w_pasmie


def test_stosunek_przy_zerowym_mianowniku_to_ocena_niekompletna() -> None:
    oceny = _oceny(x1_ohm_per_km=0.0, b1_s_per_km=0.0)
    assert oceny["x0_do_x1"].ocena_wiarygodnosci == INCOMPLETE
    assert oceny["b0_do_b1"].ocena_wiarygodnosci == INCOMPLETE


def test_odwrocony_gmr_gmd_wypada_poza_pasmo() -> None:
    """X′1 = (ωμ0/2π)·ln(GMR/GMD) przy zamianie — ujemna reaktancja, poza pasmem."""
    ocena = _oceny(x1_ohm_per_km=-TYPOWE["x1_ohm_per_km"])["x1_ohm_per_km"]
    assert ocena.ocena_wiarygodnosci == OUT_OF_RANGE


@pytest.mark.parametrize(
    ("przewod", "geometria", "odgromowy"),
    list(
        itertools.product(
            [
                "przewod-wn-184-al1-30-st1a",
                "przewod-wn-243-al1-39-st1a",
                "przewod-wn-304-al1-49-st1a",
            ],
            ["projekt", "robocza"],
            [True, False],
        )
    ),
)
def test_parametry_solvera_dla_katalogu_mieszcza_sie_w_pasmach(
    przewod: str, geometria: str, odgromowy: bool
) -> None:
    katalog = get_default_mv_catalog()

    def dane(ref: str):
        typ = katalog.get_overhead_conductor_type(ref)
        assert typ is not None
        return dane_przewodu(typ.to_dict(), nazwa=typ.name)

    fazy, odgromowe = (
        (((-4.5, 16.0), (0.0, 16.0), (4.5, 16.0)), ((0.0, 22.0),))
        if geometria == "projekt"
        else (FAZY_SLUPA_TYPOWEGO_M, ODGROMOWE_SLUPA_TYPOWEGO_M)
    )
    f = tuple(PolozeniePrzewodu(x, y) for x, y in fazy)
    wynik = oblicz_parametry_linii(
        WejscieParametrowLinii(
            przewod_fazowy=dane(przewod),
            geometria=GeometriaLinii(
                fazy=(f[0], f[1], f[2]),
                odgromowe=(
                    tuple(PolozeniePrzewodu(x, y) for x, y in odgromowe) if odgromowy else ()
                ),
            ),
            rezystywnosc_gruntu_ohm_m=100.0,
            czestotliwosc_hz=50.0,
            temperatura_przewodu_c=80.0,
            przewod_odgromowy=(dane(PRZEWOD_ODGROMOWY_ROBOCZY_REF) if odgromowy else None),
        )
    )
    oceny = ocen_parametry_linii_110kv(
        r1_ohm_per_km=wynik.r1_ohm_per_km,
        x1_ohm_per_km=wynik.x1_ohm_per_km,
        b1_s_per_km=wynik.b1_s_per_km,
        r0_ohm_per_km=wynik.r0_ohm_per_km,
        x0_ohm_per_km=wynik.x0_ohm_per_km,
        b0_s_per_km=wynik.b0_s_per_km,
    )
    assert all(o.w_pasmie for o in oceny), [o.wyjasnienie_pl for o in oceny if not o.w_pasmie]
