"""Odczyt normatywnego zakresu badań PTPiREE 3.0 wyłącznie po kwalifikacji ENM."""
from __future__ import annotations

from enm.wydarzenia_regulacyjne import WydarzeniaRegulacyjne
from application.ncrfg_compliance.test_scope import zakres_badan_z_modelu
from tests import ncrfg_fabryki as f


def _events(ready: str) -> WydarzeniaRegulacyjne:
    return WydarzeniaRegulacyjne(
        data_wydania_warunkow="2026-02-01",
        data_oswiadczenia_gotowosci_przylaczenia=ready,
        zrodlo_pl="Warunki W/123; oświadczenie G/2",
    )


def test_type_b_ppm_3_has_reactive_site_test() -> None:
    model = f.model(f.generator(
        ref_id="pv-b-1", p_mw=0.499,
        modul_istniejacy=False,
        wydarzenia_regulacyjne=_events("2026-02-15"),
    ))
    report = zakres_badan_z_modelu(model, operator_id="enea")
    row = report["wyniki"][0]
    assert row["typ"] == "B"
    assert row["status"] == "ZAKRES_TESTOW_NIE_ICH_WYKONANIE"
    assert report["wynik_formalny"] == "NIE_OCENIONO"
    q = next(x for x in row["punkty"] if x["zdolnosc"] == "REACTIVE_CAPABILITY")
    assert q["status"] == "TEST"


def test_before_2026_does_not_use_3_0_scope() -> None:
    model = f.model(f.generator(
        modul_istniejacy=False,
        wydarzenia_regulacyjne=_events("2025-12-31"),
    ))
    report = zakres_badan_z_modelu(model, operator_id="enea")
    assert report["wyniki"][0]["status"] == "NIEUSTALONA_PODSTAWA_PROGRAMU_BADAN"
    assert "punkty" not in report["wyniki"][0]


def test_missing_legal_event_cannot_invent_compliance() -> None:
    model = f.model(f.generator())
    report = zakres_badan_z_modelu(model, operator_id="enea")
    assert report["wyniki"][0]["status"] == "NIEUSTALONA_PODSTAWA_PROGRAMU_BADAN"


def test_standalone_bess_outside_rfg_field_test_requirement() -> None:
    model = f.model(f.generator(
        gen_type="bess", p_mw=0.5,
        wydarzenia_regulacyjne=_events("2026-02-01"),
    ))
    report = zakres_badan_z_modelu(model, operator_id="enea")
    assert report["wyniki"][0]["status"] == "POZA_NC_RFG_MAGAZYN"
    assert "punkty" not in report["wyniki"][0]
