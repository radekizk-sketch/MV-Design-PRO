"""P0: typ/data/istniejący, bez domyślania dat i bez fałszywego compliance."""
from __future__ import annotations

from datetime import date

import pytest
from pydantic import ValidationError

from application.ncrfg_compliance.regulatory_effectivity import (
    WejscieOcenyPodstaw,
    ocen_podstawy,
    wybierz_procedure,
    wybierz_wos,
)
from enm.wydarzenia_regulacyjne import WydarzeniaRegulacyjne


def ev(**kwargs: object) -> WydarzeniaRegulacyjne:
    return WydarzeniaRegulacyjne(zrodlo_pl="Warunki/operator: dokument testowy", **kwargs)


@pytest.mark.parametrize(
    ("typ", "data", "wybor"),
    [
        ("B", "2025-11-30", "2018"),
        ("B", "2025-12-01", "2025"),
        ("C", "2025-12-01", "2025"),
        ("D", "2026-04-01", "2025"),
    ],
)
def test_wos_bcd_data_warunkow(
    typ: str, data: str, wybor: str
) -> None:
    assert wybierz_wos(
        typ, ev(data_wydania_warunkow=data), modul_istniejacy=False
    ).wydanie == wybor


def test_wos_a_or_2027() -> None:
    assert wybierz_wos(
        "A", ev(
            data_wydania_warunkow="2026-12-31",
            data_zgloszenia_przylaczenia="2027-01-01",
        )
    ).wydanie == "2025"
    assert wybierz_wos(
        "A", ev(
            data_wydania_warunkow="2026-12-31",
            data_zgloszenia_przylaczenia="2026-12-31",
        )
    ).wydanie == "2018"


def test_wos_a_missing_other_event_cannot_assume_2018() -> None:
    result = wybierz_wos(
        "A", ev(data_wydania_warunkow="2026-12-31")
    )
    assert result.status == "NIEUSTALONE"
    assert "data_zgloszenia_przylaczenia" in result.dane_brakujace


def test_bcd_missing_conditions_not_promoted() -> None:
    result = wybierz_wos("B", None)
    assert result.wydanie is None
    assert result.status == "NIEUSTALONE"


def test_existing_cd_moderisation_is_partial_scope() -> None:
    full = wybierz_wos(
        "C", ev(
            znaczna_zmiana_umowy=True,
            data_zgloszenia_modernizacji="2025-12-01",
        ), modul_istniejacy=True,
    )
    assert full.status == "USTALONO"
    assert full.zakres == "ZAKRES_MODERNIZACJI"
    assert full.wydanie == "2025"
    absent = wybierz_wos(
        "D", ev(
            data_zgloszenia_modernizacji="2025-12-01",
        ), modul_istniejacy=True,
    )
    assert absent.status == "WYMAGA_OCENY_ART4"
    assert absent.wydanie is None


def test_existing_a_not_auto_new() -> None:
    result = wybierz_wos(
        "A", ev(data_zgloszenia_przylaczenia="2027-02-01"), modul_istniejacy=True,
    )
    assert result.status == "WYMAGA_OCENY_ART4"


@pytest.mark.parametrize("typ", ["A", "B", "C"])
def test_procedure_v3_ready_statement_abc(typ: str) -> None:
    result = wybierz_procedure(
        typ, ev(data_oswiadczenia_gotowosci_przylaczenia="2026-01-01")
    )
    assert result.wydanie == "3.0"


def test_procedure_d_needs_energization_declaration() -> None:
    wrong = wybierz_procedure(
        "D", ev(data_oswiadczenia_gotowosci_przylaczenia="2026-02-01")
    )
    assert wrong.status == "NIEUSTALONE"
    right = wybierz_procedure(
        "D", ev(data_oswiadczenia_gotowosci_przyjecia_napiecia="2026-02-01")
    )
    assert right.wydanie == "3.0"


def test_old_procedure_not_guessed() -> None:
    result = wybierz_procedure(
        "B", ev(data_oswiadczenia_gotowosci_przylaczenia="2025-12-31")
    )
    assert result.wydanie is None
    assert result.status == "NIEUSTALONE"


@pytest.mark.parametrize("value", [0, 20260101, "1735689600", "2026/01/01", "foobar"])
def test_date_strict_not_epoch(value: object) -> None:
    with pytest.raises(ValidationError):
        ev(data_wydania_warunkow=value)


def test_source_required_for_law_events() -> None:
    with pytest.raises(ValidationError, match="źródła dokumentowego"):
        WydarzeniaRegulacyjne(data_wydania_warunkow=date(2025, 12, 1))


def test_optional_blank_events_do_not_fabricate() -> None:
    assert WydarzeniaRegulacyjne().data_wydania_warunkow is None
    assert ocen_podstawy(WejscieOcenyPodstaw(typ_mwe="B")).wos.wydanie is None


def test_regulatory_diagnostic_is_explicitly_not_solver_activation() -> None:
    result = ocen_podstawy(WejscieOcenyPodstaw(
        typ_mwe="B", modul_istniejacy=False,
        wydarzenia=ev(
            data_wydania_warunkow="2026-01-01",
            data_oswiadczenia_gotowosci_przylaczenia="2026-02-01",
        ),
    ))
    assert result.wos.wydanie == "2025"
    assert result.ptpiree.wydanie == "3.0"
    assert result.nie_aktywowane_w_solverze
