"""Karta GPZ-H5-APARATURA: wejście koordynacji izolacji V12.6 a dziedzina tablicy poziomów
izolacji solvera (rdzeń FROZEN ``v126_academic._insulation``: IEC 60071-1 do U_m = 36 kV,
powyżej solver podstawia wartości dla 36 kV — B-01, rdzeń nietknięty).

Dwie deklaracje ``solver_input/v126_contracts.py`` przypięte testem:

1. ``_nearest_standard_um_kv`` czyta szereg Uₙ → U_m z JEDNEGO źródła
   (``pochodne.pasma_napieciowe.NAPIECIE_NAJWYZSZE_SIECI_KV``, IEC 60038 tabele 3 i 4); dawny
   własny szereg 12/17,5/24/36 kV dawał sieci 6 kV napięcie 12 kV zamiast 7,2 kV, a szynie
   110 kV — 36 kV.
2. Ogranicznik na szynie sieci o U_m powyżej 36 kV (sieć 35 kV, szyna WN) NIE dostaje wiersza
   wejścia (wynik wobec poziomu izolacji sieci SN byłby fabrykacją) — trafia do
   ``ograniczniki_poza_dziedzina_koordynacji``, a gotowość mówi to warunkiem nieblokującym.

Iloczyn cech: {napięcie szyny: 3, 6, 10, 15, 20, 30, 35, 110 kV} × {ogranicznik z katalogu,
ogranicznik bez pozycji katalogu} × {uziemienie punktu neutralnego sieci w modelu: jest,
brak}. Kolejność bramek jest cechą: szyna poza dziedziną NIE jest meldowana jako „brak
uziemienia" (jedna przyczyna na miejsce).
"""

from __future__ import annotations

import pytest
from application.analyses.v126_gotowosc import ocen_gotowosc_v126
from enm.models import EnergyNetworkModel, ENMHeader
from network_model.pochodne.pasma_napieciowe import NAPIECIE_NAJWYZSZE_SIECI_KV
from solver_input.v126_contracts import (
    UM_MAX_DZIEDZINY_KOORDYNACJI_KV,
    V126AnalysisType,
    _nearest_standard_um_kv,
    build_v126_insulation_from_enm,
    ograniczniki_bez_uziemienia_sieci,
    ograniczniki_poza_dziedzina_koordynacji,
)

_ARRESTER_ID = "arrester-abb-polim-d-24kv-10ka"

#: Uₙ szyny → (U_m sieci z szeregu IEC 60038, czy w dziedzinie tablicy solvera).
_NAPIECIA: dict[float, tuple[float, bool]] = {
    3.0: (3.6, True),
    6.0: (7.2, True),
    10.0: (12.0, True),
    15.0: (17.5, True),
    20.0: (24.0, True),
    30.0: (36.0, True),
    35.0: (40.5, False),
    110.0: (123.0, False),
}


def _model(napiecie_kv: float, *, katalog: bool, uziemienie: bool) -> EnergyNetworkModel:
    """Szyna o napięciu ``napiecie_kv`` z polem niosącym ogranicznik; punkt neutralny sieci
    deklaruje (albo nie) źródło przyłączone do tej szyny."""
    zrodlo: dict = {
        "ref_id": "SRC",
        "name": "Sieć zasilająca",
        "bus_ref": "BUS",
        "model": "short_circuit_power",
        "sk3_mva": 500.0,
        "rx_ratio": 0.1,
    }
    if uziemienie:
        zrodlo["neutral_grounding"] = {"type": "resistor_grounded", "r_ohm": 40.0}
    aparat: dict = {
        "device_ref": "QA1",
        "symbol_ref": "surge_arrester_10ka",
        "kind": "SURGE_ARRESTER",
        "placement": "GROUND_BRANCH",
    }
    if katalog:
        aparat["catalog_ref"] = _ARRESTER_ID
    return EnergyNetworkModel.model_validate(
        {
            "header": ENMHeader(name="v126-dziedzina").model_dump(),
            "buses": [{"ref_id": "BUS", "name": "Szyna", "voltage_kv": napiecie_kv}],
            "sources": [zrodlo],
            "substations": [
                {"ref_id": "ST1", "name": "Stacja", "station_type": "mv_lv", "bus_refs": ["BUS"]}
            ],
            "bays": [
                {
                    "ref_id": "POLE",
                    "name": "Pole",
                    "bay_role": "IN",
                    "substation_ref": "ST1",
                    "bus_ref": "BUS",
                    "primary_devices": [aparat],
                }
            ],
        }
    )


@pytest.mark.parametrize(("u_n", "u_m"), sorted(NAPIECIE_NAJWYZSZE_SIECI_KV.items()))
def test_napiecie_najwyzsze_z_jednego_szeregu(u_n: float, u_m: float) -> None:
    assert _nearest_standard_um_kv(u_n) == u_m


@pytest.mark.parametrize(
    ("u_n", "u_m"),
    [(0.69, 3.6), (4.0, 7.2), (11.0, 12.0), (22.0, 24.0), (33.0, 36.0), (400.0, 245.0)],
)
def test_napiecie_spoza_szeregu_najmniejsze_nie_mniejsze(u_n: float, u_m: float) -> None:
    """Spoza szeregu — najmniejsze U_m szeregu nie mniejsze od Uₙ (powyżej szeregu — górny
    wpis szeregu, a dziedzina koordynacji i tak wyklucza taką szynę)."""
    assert _nearest_standard_um_kv(u_n) == u_m


@pytest.mark.parametrize("uziemienie", [True, False], ids=["uziemienie", "bez_uziemienia"])
@pytest.mark.parametrize("katalog", [True, False], ids=["z_katalogu", "bez_katalogu"])
@pytest.mark.parametrize("u_n", sorted(_NAPIECIA))
def test_dziedzina_koordynacji_izolacji(u_n: float, katalog: bool, uziemienie: bool) -> None:
    u_m_sieci, w_dziedzinie = _NAPIECIA[u_n]
    assert (u_m_sieci <= UM_MAX_DZIEDZINY_KOORDYNACJI_KV) is w_dziedzinie
    model = _model(u_n, katalog=katalog, uziemienie=uziemienie)
    wiersze = build_v126_insulation_from_enm(model)
    poza = ograniczniki_poza_dziedzina_koordynacji(model)
    bez_uziemienia = ograniczniki_bez_uziemienia_sieci(model)

    if not w_dziedzinie:
        # Jedna przyczyna na miejsce: poza dziedziną, nie „brak uziemienia".
        assert wiersze == []
        assert poza == ("BUS",)
        assert bez_uziemienia == ()
    elif not uziemienie:
        assert wiersze == []
        assert poza == ()
        assert bez_uziemienia == ("BUS",)
    else:
        assert poza == () and bez_uziemienia == ()
        assert [w.location_bus_ref for w in wiersze] == ["BUS"]
        # U_m wiersza: z karty ogranicznika, a bez karty — napięcie najwyższe sieci szyny.
        assert wiersze[0].u_m_kv == (24.0 if katalog else u_m_sieci)

    gotowosc = ocen_gotowosc_v126(model, V126AnalysisType.INSULATION_COORDINATION)
    warunek = next(
        (w for w in gotowosc.warunki if w.kod == "ograniczniki.poza_dziedzina_koordynacji"),
        None,
    )
    if w_dziedzinie:
        assert warunek is None
    else:
        assert warunek is not None
        assert warunek.spelniony is False and warunek.blokujacy is False
        assert warunek.elementy == ("BUS",)
        assert "36 kV" in warunek.opis_pl
        ograniczniki = next(w for w in gotowosc.warunki if w.kod == "model.ograniczniki")
        assert "nie zawiera" not in ograniczniki.opis_pl
        assert "poza dziedziną koordynacji" in ograniczniki.opis_pl
