"""ENEA IRiESD v2.3 I.5.2-4 — rejestr magazynów energii."""
from __future__ import annotations

from datetime import date
import pytest
from application.ncrfg_compliance.bess_enea_registry import (
    DaneMagazynuDoRejestru, oceń_rejestr_magazynu
)


def info(p: float, **other):
    return DaneMagazynuDoRejestru(moc_zainstalowana_kw=p,**other)


def test_registry_boundaries_50kw_and_10mw() -> None:
    assert oceń_rejestr_magazynu(info(50),na_dzien=date(2026,11,10))["wymagany_wpis"]=="POZA_ZAKRESEM_WPISU_I5_2"
    assert oceń_rejestr_magazynu(info(50.001),na_dzien=date(2026,11,10))["wymagany_wpis"]=="WPIS_WYMAGANY_I5_2"
    assert oceń_rejestr_magazynu(info(10000),na_dzien=date(2026,11,10))["wymagany_wpis"]=="WPIS_WYMAGANY_I5_2"
    assert "ODREBNEJ_OCENY" in oceń_rejestr_magazynu(info(10000.001),na_dzien=date(2026,11,10))["wymagany_wpis"]


def test_sized_storage_with_generation_requires_seven_day_notice() -> None:
    got=oceń_rejestr_magazynu(info(
        75,w_instalacji_wytworczej_lub_odbiorczej=True,
        oddano_do_eksploatacji="2026-11-01",
        identyfikator_zrodla="Protokół SAT 1"
    ),na_dzien=date(2026,11,10))
    assert got["wymagany_wpis"]=="WPIS_WYMAGANY_I5_2"
    assert got["termin_informacji_7dni"]=="2026-11-08"
    assert got["obowiazek_informacji_posiadacza"]=="TERMIN_MINAL"
    assert got["status_kompletnosci_zgodnosci"]=="NIE_OCENIONO"


def test_owner_not_operator_has_seven_day_notification_deadline() -> None:
    got=oceń_rejestr_magazynu(info(
        100,w_instalacji_wytworczej_lub_odbiorczej=True,
        oddano_do_eksploatacji="2026-11-01",
        data_przekazania_informacji_osd="2026-11-09",
        identyfikator_zrodla="Potwierdzenie e-doręczenia"
    ),na_dzien=date(2026,11,10))
    assert got["obowiazek_informacji_posiadacza"]=="PRZEKAZANO_PO_TERMINIE"
    assert got["termin_operatora_i5_3_dni"]==14


def test_standalone_storage_no_assumed_notification_i5_4() -> None:
    got=oceń_rejestr_magazynu(info(
        1000,w_instalacji_wytworczej_lub_odbiorczej=False
    ),na_dzien=date(2026,11,10))
    assert got["obowiazek_informacji_posiadacza"]=="NIE_DOTYCZY_I5_4"
    assert got["wymagany_wpis"]=="WPIS_WYMAGANY_I5_2"


def test_unknown_topology_no_automatic_exemption() -> None:
    got=oceń_rejestr_magazynu(info(100),na_dzien=date(2026,11,10))
    assert got["obowiazek_informacji_posiadacza"]=="NIEUSTALONE"


def test_no_source_rejects_commissioning_date() -> None:
    with pytest.raises(ValueError,match="źródła dokumentowego"):
        info(100,oddano_do_eksploatacji="2026-11-01")


def test_no_epoch_date_or_inverter_p_mw_as_proxy() -> None:
    with pytest.raises(ValueError):
        info(100,oddano_do_eksploatacji=1735689600,identyfikator_zrodla="foo")
    with pytest.raises(ValueError):
        info(-100)
