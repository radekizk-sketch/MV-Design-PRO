"""Jedno źródło granic pasm napięciowych (karta PASMO-1KV).

Po co: produkt klasyfikował szynę 1,0 kV raz jako SN (`voltage_kv < 1.0` ⇒ nN), raz jako nN
(`> 1.0` ⇒ SN), a górną granicę SN trzymał na 60 kV bez podstawy. Granice wg IEC 60038
tab. 1/3 i rozporządzenia w sprawie szczegółowych warunków funkcjonowania systemu
elektroenergetycznego (zał. 1 cz. I pkt 2.2/3.2): nN ⇔ 0 < U ≤ 1 kV, SN ⇔ 1 kV < U < 110 kV,
WN ⇔ U ≥ 110 kV — jedno źródło `network_model/pochodne/pasma_napieciowe.py`.

Iloczyn cech (KLASA, NIE INSTANCJA):
- napięcie {brak, 0, −0,4, NaN, ∞, 0,23, 0,4, 0,69, 0,999, 1,0, 1,001, 6, 15, 60, 66, 109,999,
  110, 220} × predykat źródła {pasmo, w paśmie nN, powyżej nN, szyna poza SN, poziom};
- konsumenci poza bramkami nN (te pokrywa `tests/application/analyses/fault_loop/
  test_bramka_pasma_nn.py`) × {1,0 kV, 1,001 kV}: walidator (E020 rozjazd pasm, E062
  mieszanie poziomów nN, E029 falownik na szynie powyżej nN), współczynnik c IEC 60909,
  rezystancja fikcyjna maszyn IEC 60909 §6.3/§6.7, katalog transformatorów blokowych (moce
  wg strony dolnej), transformator dedykowany SN/SN, wiarygodność Ik'' per poziom, szyny SN
  stacji w operacjach domenowych, pre-kontrola trasy kablowej nN.
Tablica parytetu z frontem: `backend/schemas/pasmo_nn_parytet_v1.json` (vitest:
`frontend/src/ui2/model/__tests__/pasmaNapieciowe.test.ts`).
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import pytest
from analysis.sanity_bounds import evaluate_short_circuit_current
from enm.domain_operations import _sn_bus_refs_for_substation
from enm.models import Bus, Cable, EnergyNetworkModel, ENMDefaults, ENMHeader, Generator
from enm.validator import ENMValidator
from network_model.catalog.mv_transformer_catalog import (
    _INVERTER_TR_POWER_MVA_LOW_LV,
    _INVERTER_TR_POWER_MVA_MEDIUM_LV,
    _build_inverter_transformer_types,
)
from network_model.core.machine import _asynchronous_r_over_x, _synchronous_r_over_x
from network_model.core.voltage_factor import c_for_node
from network_model.pochodne import pasma_napieciowe as zrodlo
from network_model.pochodne.pasma_napieciowe import (
    OPIS_PASMA_NN,
    PASMO_NN_MAX_KV,
    PASMO_WN_MIN_KV,
    pasmo_napieciowe,
    powyzej_pasma_nn,
    poziom_napiecia,
    szyna_poza_pasmem_sn,
    w_pasmie_nn,
)

_TABLICA = Path(__file__).resolve().parents[2] / "schemas" / "pasmo_nn_parytet_v1.json"


def _wiersze() -> list[dict[str, Any]]:
    return list(json.loads(_TABLICA.read_text(encoding="utf-8"))["wiersze"])


# ---------------------------------------------------------------------------
# Źródło — granice i predykaty
# ---------------------------------------------------------------------------


def test_granice_z_podstawa_normowa() -> None:
    assert PASMO_NN_MAX_KV == 1.0
    assert PASMO_WN_MIN_KV == 110.0
    assert OPIS_PASMA_NN == "napięcie znamionowe do 1 kV włącznie"
    dokumentacja = zrodlo.__doc__ or ""
    for podstawa in (
        "IEC 60038",
        "1 000 V inclusive",
        "Dz.U. 2023 poz. 819",
        "wyższe niż 1 kV i niższe niż 110 kV",
        "równe 1 kV lub niższe",
        "IEC 60364-1",
    ):
        assert podstawa in dokumentacja, podstawa


def test_tablica_parytetu_obejmuje_obie_strony_kazdej_granicy() -> None:
    napiecia = {w["napiecie_kv"] for w in _wiersze()}
    assert {None, 0.0, -0.4, 0.999, 1.0, 1.001, 60.0, 66.0, 109.999, 110.0} <= napiecia


@pytest.mark.parametrize("wiersz", _wiersze(), ids=lambda w: str(w["napiecie_kv"]))
def test_predykaty_zgodne_z_tablica_parytetu(wiersz: dict[str, Any]) -> None:
    napiecie = wiersz["napiecie_kv"]
    assert pasmo_napieciowe(napiecie) == wiersz["pasmo"]
    assert w_pasmie_nn(napiecie) is wiersz["w_pasmie_nn"]
    assert powyzej_pasma_nn(napiecie) is wiersz["powyzej_pasma_nn"]
    assert szyna_poza_pasmem_sn(napiecie) is wiersz["szyna_poza_pasmem_sn"]


@pytest.mark.parametrize("napiecie", [math.nan, math.inf, -math.inf])
def test_wartosci_niefizyczne_nie_leza_w_zadnym_pasmie(napiecie: float) -> None:
    assert pasmo_napieciowe(napiecie) is None
    assert poziom_napiecia(napiecie) is None
    assert not w_pasmie_nn(napiecie)
    assert not powyzej_pasma_nn(napiecie)
    assert szyna_poza_pasmem_sn(napiecie)


@pytest.mark.parametrize(
    ("napiecie", "poziom"),
    [(1.0, "nN"), (1.001, "SN"), (109.999, "SN"), (110.0, "WN"), (219.999, "WN"), (220.0, "NN")],
)
def test_poziom_rozporzadzenia(napiecie: float, poziom: str) -> None:
    assert poziom_napiecia(napiecie) == poziom


# ---------------------------------------------------------------------------
# Walidator ENM
# ---------------------------------------------------------------------------


def _enm(*szyny: Bus) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="pasmo", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=list(szyny),
    )


def _kody(enm: EnergyNetworkModel) -> set[str]:
    return {i.code for i in ENMValidator().validate(enm).issues}


@pytest.mark.parametrize(("napiecie", "nn"), [(1.0, True), (1.001, False)])
def test_walidator_rozjazd_pasm_i_mieszanie_poziomow_nn(napiecie: float, nn: bool) -> None:
    """Kabel 0,4 kV ↔ X: dla X = 1,0 kV oba końce w paśmie nN (E062 — różne poziomy
    WEWNĄTRZ pasma nN, bez E020); dla X = 1,001 kV kabel łączy pasma nN i SN (E020)."""
    enm = _enm(
        Bus(ref_id="a", name="Szyna A", voltage_kv=0.4),
        Bus(ref_id="b", name="Szyna B", voltage_kv=napiecie),
    )
    enm.branches.append(
        Cable(
            ref_id="c",
            name="Kabel",
            from_bus_ref="a",
            to_bus_ref="b",
            length_km=0.1,
            r_ohm_per_km=0.2,
            x_ohm_per_km=0.08,
        )
    )
    kody = _kody(enm)
    assert ("E062" in kody) is nn, kody
    assert ("E020" in kody) is (not nn), kody


@pytest.mark.parametrize(("napiecie", "odmowa"), [(0.999, False), (1.0, False), (1.001, True)])
def test_walidator_e029_falownik_na_szynie_powyzej_pasma_nn(napiecie: float, odmowa: bool) -> None:
    enm = _enm(Bus(ref_id="b", name="Szyna", voltage_kv=napiecie))
    enm.generators.append(
        Generator(
            ref_id="g",
            name="Falownik PV",
            bus_ref="b",
            p_mw=0.1,
            gen_type="pv_inverter",
            connection_variant="nn_side",
            station_ref="st",
        )
    )
    assert ("E029" in _kody(enm)) is odmowa


# ---------------------------------------------------------------------------
# Konsumenci w warstwie modelu sieci (network_model/core, catalog)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("napiecie", "c_max", "c_min"), [(1.0, 1.05, 0.95), (1.001, 1.10, 1.00), (0.0, 1.05, 0.95)]
)
def test_wspolczynnik_c_iec60909_z_granicy_pasma(
    napiecie: float, c_max: float, c_min: float
) -> None:
    assert c_for_node(napiecie, "MAX") == c_max
    assert c_for_node(napiecie, "MIN") == c_min


@pytest.mark.parametrize(("napiecie", "nn"), [(1.0, True), (1.001, False)])
def test_rezystancja_fikcyjna_maszyn_z_granicy_pasma(napiecie: float, nn: bool) -> None:
    assert _synchronous_r_over_x(napiecie, 10.0) == (0.15 if nn else 0.07)
    assert _asynchronous_r_over_x(napiecie, 0.5) == (0.42 if nn else 0.15)


@pytest.mark.parametrize(("napiecie", "nn"), [(1.0, True), (1.001, False)])
def test_katalog_transformatorow_blokowych_z_granicy_pasma(napiecie: float, nn: bool) -> None:
    moce = tuple(
        r["params"]["rated_power_mva"] for r in _build_inverter_transformer_types(15.0, napiecie)
    )
    oczekiwane = _INVERTER_TR_POWER_MVA_LOW_LV if nn else _INVERTER_TR_POWER_MVA_MEDIUM_LV
    assert moce == oczekiwane


@pytest.mark.parametrize(
    ("napiecie", "poziom", "gorna_ka"),
    [
        (1.0, "nN", 150.0),
        (1.001, "SN", 50.0),
        (66.0, "SN", 50.0),
        (109.999, "SN", 50.0),
        (110.0, "WN", 63.0),
        (220.0, "NN", 80.0),
    ],
)
def test_wiarygodnosc_ikss_z_poziomu_rozporzadzenia(
    napiecie: float, poziom: str, gorna_ka: float
) -> None:
    werdykt = evaluate_short_circuit_current(napiecie, 10.0)
    assert werdykt.voltage_band == poziom
    assert werdykt.upper_ka == gorna_ka


# ---------------------------------------------------------------------------
# Operacje domenowe — szyny SN stacji
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(("napiecie", "sn"), [(1.0, False), (1.001, True)])
def test_szyny_sn_stacji_z_granicy_pasma(napiecie: float, sn: bool) -> None:
    enm = {
        "buses": [
            {"ref_id": "nn", "voltage_kv": 0.4},
            {"ref_id": "x", "voltage_kv": napiecie},
        ]
    }
    stacja = {"bus_refs": ["nn", "x"]}
    wynik = _sn_bus_refs_for_substation(enm, stacja)
    # Brak szyny SN ⇒ pierwsza szyna stacji (istniejący, jawny zapas funkcji).
    assert wynik == (["x"] if sn else ["nn"])
