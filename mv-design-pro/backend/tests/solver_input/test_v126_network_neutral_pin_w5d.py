"""Karta W5-D p. 12 (OD-24): wejście V12.6 koordynacji izolacji ZAWSZE niesie kategorię
punktu neutralnego Z MODELU, nigdy podstawionej.

Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 1: kategoria szyny SN pochodzi z JEDNEJ prawdy
o uziemieniu sieci (`enm.uziemienie_sekcji` przez `v126_contracts._doziemienie_szyny_izolacji`) —
punkt neutralny uzwojenia transformatora z drogą prądu zerowego po stronie SN albo zespół
uziemiający. Intencja W5-D zostaje: kategorii, której model nie wyznacza, NIE podstawia się.
Zmienia się tylko to, co znaczy „model nie wyznacza": sieć SN bez żadnego punktu uziemienia
(uzwojenia SN w trójkącie, brak zespołu) jest siecią IZOLOWANĄ wyprowadzoną z modelu (ta sama
odpowiedź co składowa zerowa — brak drogi), a brakiem jest zespół uziemiający bez elementu
w punkcie neutralnym (nazwana odmowa E-ZU-02).

Iloczyn cech: {źródło danej: punkt neutralny transformatora po stronie LV, po stronie
HV} × {directly_grounded → "bezposrednie", resistor_grounded → "rezystor", petersen_coil →
"kompensowany", isolated → "izolowany"} (warunek odbioru 2026-10-29: każdy tryb osobno — dawne
„earthed" zrównywało rezystor z uziemieniem bezpośrednim) + {uzwojenie SN w trójkącie → sieć izolowana z modelu} + {zespół bez elementu →
brak wiersza, szyna nazwana, gotowość koordynacji izolacji z warunkiem blokującym
`ograniczniki.uziemienie_sieci_nieznane`}.
"""

from __future__ import annotations

import pytest
from application.analyses.v126_gotowosc import ocen_gotowosc_v126
from enm.models import EnergyNetworkModel, ENMHeader, GroundingConfig, ZespolUziemiajacy
from solver_input.v126_contracts import (
    V126AnalysisType,
    build_v126_input_from_enm,
    build_v126_insulation_from_enm,
    ograniczniki_bez_uziemienia_sieci,
)

_ARRESTER_ID = "arrester-abb-polim-d-24kv-10ka"


def _model(
    *,
    strona: str,
    uziemienie: GroundingConfig | None,
    grupa: str = "YNyn0",
    zespoly: list[ZespolUziemiajacy] | None = None,
) -> EnergyNetworkModel:
    """Ogranicznik na szynie SN 15 kV; punkt neutralny deklaruje transformator 110/15
    (`strona="lv"`) albo transformator 15/0,4 (`strona="hv"`) — obie drogi
    `_resolve_network_neutral` (szyna sama nie niesie uziemienia)."""
    neutral = None if uziemienie is None else uziemienie.model_dump(mode="json")
    if strona == "lv":
        trafo: dict = {
            "ref_id": "TR_HV_SN",
            "name": "TR 110/15",
            "hv_bus_ref": "BUS_HV",
            "lv_bus_ref": "BUS_SN",
            "sn_mva": 25.0,
            "uhv_kv": 110.0,
            "ulv_kv": 15.0,
            "uk_percent": 12.0,
            "pk_kw": 120.0,
            "vector_group": grupa,
            "lv_neutral": neutral,
        }
    else:
        trafo = {
            "ref_id": "TR_SN_NN",
            "name": "TR 15/0,4",
            "hv_bus_ref": "BUS_SN",
            "lv_bus_ref": "BUS_NN",
            "sn_mva": 0.63,
            "uhv_kv": 15.0,
            "ulv_kv": 0.4,
            "uk_percent": 4.5,
            "pk_kw": 6.5,
            "vector_group": grupa,
            "hv_neutral": neutral,
        }
    return EnergyNetworkModel.model_validate(
        {
            "header": ENMHeader(name="w5d-p12").model_dump(),
            "buses": [
                {"ref_id": "BUS_HV", "name": "110 kV", "voltage_kv": 110.0},
                {"ref_id": "BUS_SN", "name": "Szyna SN", "voltage_kv": 15.0},
                {"ref_id": "BUS_NN", "name": "Szyna nN", "voltage_kv": 0.4},
            ],
            "transformers": [trafo],
            "zespoly_uziemiajace": [z.model_dump(mode="json") for z in zespoly or []],
            "substations": [
                {"ref_id": "ST1", "name": "Stacja", "station_type": "mv_lv", "bus_refs": ["BUS_SN"]}
            ],
            "bays": [
                {
                    "ref_id": "POLE-IN",
                    "name": "Pole liniowe",
                    "bay_role": "IN",
                    "substation_ref": "ST1",
                    "bus_ref": "BUS_SN",
                    "primary_devices": [
                        {
                            "device_ref": "QA1",
                            "symbol_ref": "surge_arrester_10ka",
                            "kind": "SURGE_ARRESTER",
                            "placement": "GROUND_BRANCH",
                            "catalog_ref": _ARRESTER_ID,
                        }
                    ],
                }
            ],
        }
    )


@pytest.mark.parametrize("strona", ["lv", "hv"])
@pytest.mark.parametrize(
    ("uziemienie", "oczekiwane"),
    [
        (GroundingConfig(type="directly_grounded"), "bezposrednie"),
        (GroundingConfig(type="resistor_grounded", r_ohm=40.0), "rezystor"),
        (GroundingConfig(type="petersen_coil", x_ohm=120.0), "kompensowany"),
        (GroundingConfig(type="isolated"), "izolowany"),
    ],
)
def test_kategoria_punktu_neutralnego_zawsze_z_modelu(
    strona: str, uziemienie: GroundingConfig, oczekiwane: str
) -> None:
    model = _model(strona=strona, uziemienie=uziemienie)
    rows = build_v126_insulation_from_enm(model)
    assert [r.location_bus_ref for r in rows] == ["BUS_SN"]
    assert rows[0].network_neutral == oczekiwane
    assert ograniczniki_bez_uziemienia_sieci(model) == ()
    # Ta sama wartość w pełnym wejściu akademickim (jedna droga, `build_v126_input_from_enm`).
    assert build_v126_input_from_enm(model).insulation[0].network_neutral == oczekiwane


@pytest.mark.parametrize(("strona", "grupa"), [("lv", "YNd11"), ("hv", "Dyn11")])
def test_siec_sn_bez_punktu_uziemienia_jest_izolowana_z_modelu(strona: str, grupa: str) -> None:
    """Uzwojenie po stronie SN w trójkącie, brak zespołu: sieć SN nie ma drogi prądu
    zerowego — tryb „izolowany" WYPROWADZONY z modelu (ta sama prawda co Ik1: brak
    drogi), nie podstawiona domyślnie."""
    model = _model(strona=strona, uziemienie=None, grupa=grupa)
    rows = build_v126_insulation_from_enm(model)
    assert [(r.location_bus_ref, r.network_neutral) for r in rows] == [("BUS_SN", "izolowany")]
    assert ograniczniki_bez_uziemienia_sieci(model) == ()


@pytest.mark.parametrize(("strona", "grupa"), [("lv", "YNd11"), ("hv", "Dyn11")])
def test_zespol_bez_elementu_nie_fabrykuje_kategorii(strona: str, grupa: str) -> None:
    zespol = ZespolUziemiajacy(ref_id="ZU1", name="ZU 1", bus_ref="BUS_SN")
    model = _model(strona=strona, uziemienie=None, grupa=grupa, zespoly=[zespol])
    assert build_v126_insulation_from_enm(model) == []
    assert ograniczniki_bez_uziemienia_sieci(model) == ("BUS_SN",)
    gotowosc = ocen_gotowosc_v126(model, V126AnalysisType.INSULATION_COORDINATION)
    warunek = next(w for w in gotowosc.warunki if w.kod == "ograniczniki.uziemienie_sieci_nieznane")
    assert warunek.spelniony is False and warunek.blokujacy is True
    assert warunek.elementy == ("BUS_SN",)
    assert gotowosc.gotowosc != "POTWIERDZONA"
    # Karta W5-B (predykaty parami): ten sam stan modelu nie może jednocześnie meldować
    # „model nie zawiera ograniczników" — ogranicznik JEST, nie wchodzi do wejścia koordynacji
    # z powodu braku uziemienia sieci (warunek wyżej).
    ograniczniki = next(w for w in gotowosc.warunki if w.kod == "model.ograniczniki")
    assert ograniczniki.spelniony is False
    assert "nie zawiera" not in ograniczniki.opis_pl
    assert "1 miejsc" in ograniczniki.opis_pl and "uziemienia" in ograniczniki.opis_pl
