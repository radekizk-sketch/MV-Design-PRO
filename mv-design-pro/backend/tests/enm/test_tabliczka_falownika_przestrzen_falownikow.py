"""Falownik PV/BESS w przestrzeni falowników — tabliczka bez danych maszyny.

Karta JEDEN-KLUCZ-KATALOGU, decyzja architekta 1: falownik PV (i BESS — ta sama klasa:
przekształtnik materializowany z przestrzeni technologii ``ZRODLO_NN_PV``/``ZRODLO_NN_BESS``)
jest przekształtnikiem, nie maszyną. Tabliczka niesie rzeczywiste dane falownika — moc
znamionową ``sn_mva`` i granice mocy biernej ``qmin_mvar``/``qmax_mvar`` z karty
przekształtnika; pozycja bez nich dostaje wartość roboczą (zasada nr 4: jakość ESTIMATED
w ``card_field_status``, podstawa w ``ODNIESIENIE_TABLICZKI_PRZEKSZTALTNIKA``). Pola toru
maszyny (stojan generatora, ``POLA_TORU_MASZYNY``) nie należą do falownika.

ILOCZYN CECH: technologia {PV, BESS} × pozycja {z granicami Q na karcie, bez granic Q
i bez S_n} × kanał {kontrakt materializacji, tabliczka operacji ``add_converter_source``};
funkcja wartości roboczej: S_n {jest, brak} × Q {jest, brak} × cosφ_min {jest, brak, spoza
(0, 1)} × P_max {jest, brak}.
"""

from __future__ import annotations

import pytest
from enm.domain_operations import execute_domain_operation
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import MATERIALIZATION_CONTRACTS, POLA_TORU_MASZYNY
from network_model.catalog.wartosci_robocze import (
    COS_PHI_ROBOCZY_PRZEKSZTALTNIKA,
    ODNIESIENIE_TABLICZKI_PRZEKSZTALTNIKA,
    tabliczka_przeksztaltnika,
)
from network_model.pochodne import moc_bierna_z_czynnej_i_cos_phi, moc_pozorna_z_czynnej_mva

from tests.enm.test_nn_source_catalog_provenance import (
    _base_enm_with_transformer,
    _converter_payload,
)

#: (technologia, pozycja, granice Q na karcie, S_n na karcie)
POZYCJE = [
    ("PV", "conv-pv-card-huawei-sun2000-215ktl", True, True),
    ("BESS", "bess_pcs_abb_500", True, True),
    # Karta Tesla Megapack nie podaje granic mocy biernej — wartość robocza.
    ("BESS", "conv-bess-nn-tesla-megapack-2xl-4h-c010-0p48kv", False, True),
]


def _tabliczka(technologia: str, pozycja: str) -> dict:
    katalog = get_default_mv_catalog()
    typ = (
        katalog.get_pv_inverter_type(pozycja)
        if technologia == "PV"
        else katalog.get_bess_inverter_type(pozycja)
    )
    assert typ is not None, pozycja
    enm = _base_enm_with_transformer(sn_mva=2.5)
    for szyna in enm["buses"]:
        if szyna["ref_id"] == "bus/nn/1":
            szyna["voltage_kv"] = typ.un_kv
    enm["transformers"][0]["ulv_kv"] = typ.un_kv
    wynik = execute_domain_operation(
        enm,
        "add_converter_source",
        _converter_payload(
            technologia,
            {
                "catalog_binding": {"catalog_item_id": pozycja},
                **({"bess_mode": "GRID_FOLLOWING"} if technologia == "BESS" else {}),
            },
        ),
    )
    assert not wynik.get("error"), wynik.get("error")
    generator = next(g for g in wynik["snapshot"]["generators"] if g.get("catalog_ref") == pozycja)
    assert generator["catalog_namespace"] == f"ZRODLO_NN_{technologia}"
    return generator["materialized_params"]


@pytest.mark.parametrize("przestrzen", ["ZRODLO_NN_PV", "ZRODLO_NN_BESS"])
def test_kontrakt_falownika_niesie_granice_q_i_nie_niesie_toru_maszyny(przestrzen: str) -> None:
    kontrakt = MATERIALIZATION_CONTRACTS[przestrzen]
    assert {"qmin_mvar", "qmax_mvar"} <= set(kontrakt.solver_fields)
    assert not set(kontrakt.solver_fields) & set(POLA_TORU_MASZYNY)


@pytest.mark.parametrize(("technologia", "pozycja", "q_na_karcie", "sn_na_karcie"), POZYCJE)
def test_tabliczka_falownika_technologia_x_pozycja(
    technologia: str, pozycja: str, q_na_karcie: bool, sn_na_karcie: bool
) -> None:
    tabliczka = _tabliczka(technologia, pozycja)
    # Tor maszyny (stojan generatora) nie należy do falownika — żaden kanał go nie niesie.
    assert not set(tabliczka) & set(POLA_TORU_MASZYNY)
    assert tabliczka["sn_mva"] > 0
    assert tabliczka["qmin_mvar"] < 0 < tabliczka["qmax_mvar"]
    status = tabliczka.get("card_field_status") or {}
    katalog = get_default_mv_catalog()
    karta = katalog.converter_types[pozycja]
    if q_na_karcie:
        assert (tabliczka["qmin_mvar"], tabliczka["qmax_mvar"]) == (
            karta.qmin_mvar,
            karta.qmax_mvar,
        )
        assert status.get("qmax_mvar", {}).get("source_ref") != (
            ODNIESIENIE_TABLICZKI_PRZEKSZTALTNIKA
        )
    else:
        q = moc_bierna_z_czynnej_i_cos_phi(tabliczka["pmax_mw"], COS_PHI_ROBOCZY_PRZEKSZTALTNIKA)
        assert tabliczka["qmax_mvar"] == pytest.approx(q)
        assert tabliczka["qmin_mvar"] == pytest.approx(-q)
        for pole in ("qmin_mvar", "qmax_mvar"):
            assert status[pole]["quality"] == "ESTIMATED"
            assert status[pole]["source_ref"] == ODNIESIENIE_TABLICZKI_PRZEKSZTALTNIKA


@pytest.mark.parametrize("pmax", [0.5, None])
@pytest.mark.parametrize("cos_phi_min", [0.8, None, 1.0])
@pytest.mark.parametrize("q", [(-0.1, 0.1), None])
@pytest.mark.parametrize("sn", [0.6, None])
def test_wartosc_robocza_iloczyn(
    sn: float | None, q: tuple[float, float] | None, cos_phi_min: float | None, pmax: float | None
) -> None:
    wynik = tabliczka_przeksztaltnika(
        pmax_mw=pmax,
        sn_mva=sn,
        qmin_mvar=q[0] if q else None,
        qmax_mvar=q[1] if q else None,
        cos_phi_min=cos_phi_min,
    )
    cos = cos_phi_min if cos_phi_min is not None and cos_phi_min < 1.0 else 0.9
    oczekiwane_robocze: set[str] = set()
    if sn is not None:
        assert wynik.sn_mva == sn
    elif pmax is not None:
        assert wynik.sn_mva == pytest.approx(moc_pozorna_z_czynnej_mva(pmax, cos))
        oczekiwane_robocze.add("sn_mva")
    else:
        assert wynik.sn_mva is None
    if q is not None:
        assert (wynik.qmin_mvar, wynik.qmax_mvar) == q
    elif pmax is not None:
        assert wynik.qmax_mvar == pytest.approx(moc_bierna_z_czynnej_i_cos_phi(pmax, cos))
        assert wynik.qmin_mvar == pytest.approx(-wynik.qmax_mvar)
        oczekiwane_robocze |= {"qmin_mvar", "qmax_mvar"}
    else:
        assert wynik.qmin_mvar is None and wynik.qmax_mvar is None
    assert set(wynik.pola_robocze) == oczekiwane_robocze
    assert set(wynik.status_pol) == oczekiwane_robocze
    assert all(v["quality"] == "ESTIMATED" for v in wynik.status_pol.values())
