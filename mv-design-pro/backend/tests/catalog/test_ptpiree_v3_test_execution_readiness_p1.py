"""PTPiREE v3 §§5.1–5.2: A/B != C/D, 14d, 1s, PCC, operacyjna zgoda."""
from __future__ import annotations

from datetime import date

import pytest

from application.ncrfg_compliance.test_execution_readiness import (
    PrzygotowanieBadania, audyt_przygotowania
)
from enm.wydarzenia_regulacyjne import WydarzeniaRegulacyjne


def event(typ="C"):
    name=(
      "data_oswiadczenia_gotowosci_przyjecia_napiecia" if typ=="D"
      else "data_oswiadczenia_gotowosci_przylaczenia"
    )
    return WydarzeniaRegulacyjne(**{
       name:"2026-02-01","zrodlo_pl":"Oświadczenie OSD D/001"
    })


def _base(typ="C",**changes):
    args={
       "typ_mwe":typ,"wydarzenia_regulacyjne":event(typ),
       "planned_date":"2026-03-20",
       "detailed_program_agreed_at":"2026-03-01",
       "notification_sent_at":"2026-03-02",
       "operator_date_agreed":True,
       "operator_dispatch_approval":True,
       "operator_witness_required":False,
       "evidence_source":"Potwierdzenie OSD planu"
    }
    args.update(changes)
    return PrzygotowanieBadania(**args)


def codes(result):
    return {x["kod"] for x in result["blokery"]}


def test_cd_plan_14_days_exact_boundary() -> None:
    good=audyt_przygotowania(_base(notification_sent_at="2026-03-06"))
    assert "MNIEJ_NIZ_14_DNI" not in codes(good)
    bad=audyt_przygotowania(_base(notification_sent_at="2026-03-07"))
    assert "MNIEJ_NIZ_14_DNI" in codes(bad)
    assert good["formalny_wynik_testu"]=="NIE_OCENIONO"


def test_cd_programme_agreed_before_notification() -> None:
    bad=audyt_przygotowania(_base(detailed_program_agreed_at="2026-03-10"))
    assert "PROGRAM_UZGODNIONY_PO_ZAWIADOMIENIU" in codes(bad)


def test_cd_witness_requirement_and_operator_dispatch_consent() -> None:
    bad=audyt_przygotowania(_base(
        operator_witness_required=True,operator_witness_possible=False,
        operator_dispatch_approval=False
    ))
    assert "BRAK_UDZIALU_WYMAGANEGO_OSD" in codes(bad)
    assert "BRAK_ZGODY_SLUZB_RUCHOWYCH" in codes(bad)


def test_type_d_uses_energization_statement() -> None:
    p=_base(typ="D")
    assert audyt_przygotowania(p)["procedura_wybrana"]=="3.0"
    no_statement=_base(typ="D",wydarzenia_regulacyjne=event("B"))
    assert "NIEPOTWIERDZONA_PROCEDURA_3_0" in codes(audyt_przygotowania(no_statement))


def test_ab_no_universal_14_day_rule() -> None:
    p=_base(typ="B",notification_sent_at="2026-03-19")
    assert "MNIEJ_NIZ_14_DNI" not in codes(audyt_przygotowania(p))


def test_c_d_test_signals_and_pcc_point_not_inverter_only() -> None:
    good=audyt_przygotowania(_base(
        test_executed_at="2026-03-20",measurements_interval_s=1.0,
        actual_net_p_measured=True,actual_gross_p_measured=True,
        automatic_control_active=True,pmax_pmin_confirmed=True,
        test_protocol_sha256="a"*64,test_report_sha256="b"*64
    ))
    assert "ROZDZIELCZOSC_PONAD_1_S" not in codes(good)
    assert "BRAK_P_NETTO_PCC" not in codes(good)
    assert good["formalny_wynik_testu"]=="NIE_OCENIONO"
    bad=audyt_przygotowania(_base(
        test_executed_at="2026-03-20",measurements_interval_s=2.0,
        actual_net_p_measured=False,actual_gross_p_measured=False,
        automatic_control_active=False,pmax_pmin_confirmed=False,
        test_protocol_sha256="a"*64,test_report_sha256="b"*64
    ))
    assert {
      "ROZDZIELCZOSC_PONAD_1_S","BRAK_P_NETTO_PCC",
      "BRAK_P_BRUTTO_GENERATOR","REGULATORY_W_TRYBIE_RECZNYM",
      "ZMIANA_PMAX_PMIN_POWTORZYC_TESTY"
    }.issubset(codes(bad))


def test_no_evidence_source_denies_event() -> None:
    with pytest.raises(ValueError):
        PrzygotowanieBadania(typ_mwe="C",planned_date="2026-03-01")
