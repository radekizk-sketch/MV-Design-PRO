"""P0: w obecnym stanie rejestru nie wolno wystawić formalnego PASS."""
from __future__ import annotations

from application.ncrfg_compliance.source_audit import (
    audyt_zrodel,
    blokery_aktywacji_podstaw,
)
from application.ncrfg_compliance.regulatory_effectivity import (
    WejscieOcenyPodstaw,
    ocen_podstawy,
)
from enm.wydarzenia_regulacyjne import WydarzeniaRegulacyjne


def test_source_audit_reports_unverified_programme_and_wos() -> None:
    report = audyt_zrodel("enea")
    codes = {item["kod"] for item in report["blokery"]}
    assert "WOS_2025_NIE_W_PROFILU" in codes
    assert "PROGRAM_TESTOW_NIEKOMPLETNY" in codes
    assert "PROGI_TESTOW_NIEZWERYFIKOWANE" in codes
    assert "OSD_ZRODLO_NIEZWERYFIKOWANE" in codes
    assert not report["gotowosc_do_formalnego_potwierdzenia_zgodnosci"]


def test_selected_wos2025_is_not_silently_active_in_legacy_engine() -> None:
    result = ocen_podstawy(WejscieOcenyPodstaw(
        typ_mwe="B", modul_istniejacy=False,
        wydarzenia=WydarzeniaRegulacyjne(
            data_wydania_warunkow="2026-01-01",
            data_oswiadczenia_gotowosci_przylaczenia="2026-02-01",
            zrodlo_pl="Warunki oraz oświadczenie testowe",
        ),
    ))
    blockers = blokery_aktywacji_podstaw("enea", result)
    assert result.wos.wydanie == "2025"
    assert "WOS_WYDANIE_NIEZGODNE_Z_AKTYWNYM_PROFILEM" in blockers
    assert "PROGRAM_TESTOW_NIEKOMPLETNY" in blockers
