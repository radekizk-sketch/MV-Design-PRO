"""P1: niezależny dowodowo przegląd B 499kW, brak fałszywego PASS."""
from __future__ import annotations

from datetime import date

from application.ncrfg_compliance.requirement_gaps import analiza_brakow_przypadku
from enm.wydarzenia_regulacyjne import WydarzeniaRegulacyjne
from tests import ncrfg_fabryki as f


def _wos2025_pgm_b():
    gen = f.generator(p_mw=0.499, modul_istniejacy=False,
        wydarzenia_regulacyjne=WydarzeniaRegulacyjne(
            data_wydania_warunkow="2026-01-15",
            data_oswiadczenia_gotowosci_przylaczenia="2026-02-15",
            zrodlo_pl="warunki W-10 i oświadczenie PGM",
        ),
    )
    return f.model(gen)


def test_b_499_kw_requirements_pcc_and_cert_never_auto_pass() -> None:
    report = analiza_brakow_przypadku(
        _wos2025_pgm_b(),operator_id="enea",data_oceny=date(2026,11,10)
    )
    module = report["wyniki"][0]
    rows = {x["zdolnosc"]:x for x in module["wymagania"]}
    assert module["typ"]=="B"
    assert module["wos_wybrany"]=="2025"
    assert module["ptpiree_wybrana"]=="3.0"
    assert rows["LFSM_O"]["wipwc"]=="CERT_REQUIRED"
    assert rows["LFSM_O"]["status_wykazania"]=="BRAK_ZWERYFIKOWANEGO_CERTYFIKATU"
    assert rows["REACTIVE_CAPABILITY"]["test_wg_ptpiree_3"]=="TEST"
    assert rows["REACTIVE_CAPABILITY"]["status_wykazania"]=="BRAK_PROTOKOLU_PROBY"
    assert "DO_USTALENIA_REALIZACJA_LFSM_O_PPC" in module["braki"]
    assert "PGMD" in module["dokumenty"]
    assert not report["gotowosc_zgodnosci"]


def test_old_or_missing_procedure_does_not_invent_ptpiree_v3_test() -> None:
    report = analiza_brakow_przypadku(
        f.model(f.generator()),operator_id="enea",data_oceny=date(2026,11,10)
    )
    mod=report["wyniki"][0]
    assert mod["ptpiree_wybrana"] is None
    assert "BRAK_POTWIERDZONEJ_PROCEDURY_TESTOWANIA" in mod["braki"]
    row=next(x for x in mod["wymagania"] if x["zdolnosc"]=="REACTIVE_CAPABILITY")
    assert row["test_wg_ptpiree_3"]=="BRAK_POTWIERDZONEJ_METODY"


def test_standalone_bess_requires_separate_legal_profile() -> None:
    report=analiza_brakow_przypadku(
        f.model(f.generator(gen_type="bess",p_mw=0.5)),
        operator_id="enea",data_oceny=date(2026,11,10)
    )
    mod=report["wyniki"][0]
    assert mod["status"]=="POZA_NC_RFG_MAGAZYN"
    assert not mod["wymagania"]


def test_historical_data_does_not_gain_pass_from_synthetic_registry_record() -> None:
    report=analiza_brakow_przypadku(
        f.model(f.generator(p_mw=2.0)),
        operator_id="enea",data_oceny=date(2027,1,1)
    )
    assert not report["gotowosc_zgodnosci"]
    assert all(
        x["status_wykazania"]!="SPELNIA"
        for x in report["wyniki"][0]["wymagania"]
    )
