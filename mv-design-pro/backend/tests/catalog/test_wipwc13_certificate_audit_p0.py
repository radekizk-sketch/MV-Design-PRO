"""WiPWC1.3 cert Annex1 a-v, years and scheme cutoff, no false approvals."""
from __future__ import annotations

from datetime import date
import pytest
from application.ncrfg_compliance.wipwc13_certificate_audit import (
    MetadaneCertyfikatu,audyt_certyfikatu,_max_five_years,
)


def facts(**kwargs):
    return MetadaneCertyfikatu(zrodlo_opisu="kopia certyfikatu ID-1",**kwargs)


def test_no_document_has_21_structural_gaps_and_no_pass() -> None:
    x=audyt_certyfikatu(facts(),typ="B",wersja="1.3",data_oceny=date(2026,11,10))
    assert len(x["kontrole"])==21
    assert "i" in x["brakujace_litery"]
    assert "q" in x["brakujace_litery"]
    assert "u" in x["brakujace_litery"]
    assert "BRAK_DAT_POCZATKOWEJ_KONCOWEJ" in x["naruszenia_dat_i_pochodzenia"]
    assert "NIE_ZWERYFIKOWANO" in x["status_formalny"]


def test_certificate_expiration_max_five_calendar_years() -> None:
    x=audyt_certyfikatu(facts(
       data_wydania="2025-01-01",data_waznosci_do="2030-01-02",
       sha256_pdf="a"*64
    ),typ="B",wersja="1.3",data_oceny=date(2027,1,1))
    assert "OKRES_WAZNOSCI_PONAD_5_LAT" in x["naruszenia_dat_i_pochodzenia"]
    y=audyt_certyfikatu(facts(
       data_wydania="2025-01-01",data_waznosci_do="2030-01-01"
    ),typ="B",wersja="1.3",data_oceny=date(2027,1,1))
    assert "OKRES_WAZNOSCI_PONAD_5_LAT" not in y["naruszenia_dat_i_pochodzenia"]


def test_legacy_wipwc12_deadline_distinct_from_certificate_expiry() -> None:
    x=audyt_certyfikatu(facts(
       data_wydania="2025-01-01",data_waznosci_do="2029-12-31"
    ),typ="B",wersja="1.2",data_oceny=date(2027,1,1))
    assert "WIPWC_12_PO_TERMINIE_AKCEPTACJI" in x["naruszenia_dat_i_pochodzenia"]
    assert "CERTYFIKAT_PO_TERMINIE_WAZNOSCI" not in x["naruszenia_dat_i_pochodzenia"]


def test_bank_nastaw_requirement_applies_only_to_a_b() -> None:
    a=audyt_certyfikatu(facts(),typ="A",wersja="1.3",data_oceny=date(2026,11,10))
    c=audyt_certyfikatu(facts(),typ="C",wersja="1.3",data_oceny=date(2026,11,10))
    assert "k" in a["brakujace_litery"]
    assert "k" not in c["brakujace_litery"]


def test_firmware_without_model_is_not_complete() -> None:
    x=audyt_certyfikatu(facts(firmware="1.1"),typ="B",wersja="1.3",
      data_oceny=date(2026,11,10))
    assert "i" in x["brakujace_litery"]


def test_missing_original_hash_does_not_claim_validity() -> None:
    x=audyt_certyfikatu(facts(data_wydania="2025-10-01",
      data_waznosci_do="2030-10-01"),typ="B",wersja="1.3",
      data_oceny=date(2026,11,10))
    assert "BRAK_ODCISKU_ORYGINALU_SHA256" in x["naruszenia_dat_i_pochodzenia"]
    assert x["status_formalny"]!="ZAAKCEPTOWANO"


@pytest.mark.parametrize("value",[0,1735689600,"2026/11/10"])
def test_date_must_be_iso(value):
    with pytest.raises(ValueError):
        facts(data_wydania=value)


def test_leap_february_calendar() -> None:
    assert _max_five_years(date(2024,2,29))==date(2029,2,28)
