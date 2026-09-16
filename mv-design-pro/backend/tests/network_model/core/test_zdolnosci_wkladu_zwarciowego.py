"""Testy `network_model.core.zdolnosci_wkladu_zwarciowego` (karta S-2 AUTORYTET).

Pilnuje DEKLARACJI Z KARTY (§0 p.2 — „lista pilnowana testem — zamknięta"):
każda wartość `ZdolnoscMiarodajna` ma JAWNĄ klasyfikację zależna/niezależna,
zbiory są ROZŁĄCZNE i wyczerpujące (suma = cały enum).
"""

from __future__ import annotations

from network_model.core.wklad_zwarciowy_przeksztaltnika import (
    K_SC_ZRODLO_DEKLARACJA,
    K_SC_ZRODLO_DOMYSLNE,
    K_SC_ZRODLO_NIEPOPRAWNE,
    K_SC_ZRODLO_POZA_DZIEDZINA,
    K_SC_ZRODLO_PRAD_NIEPOPRAWNY,
)
from network_model.core.zdolnosci_wkladu_zwarciowego import (
    KOD_BLOKADY_K_SC_DOMYSLNY,
    KOD_BLOKADY_K_SC_NIEPOPRAWNY,
    KOD_BLOKADY_K_SC_POZA_DZIEDZINA,
    KOD_BLOKADY_PRAD_ZNAMIONOWY_NIEPOPRAWNY,
    ZDOLNOSCI_NIEZALEZNE_OD_WKLADU_ZWARCIOWEGO,
    ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO,
    ZdolnoscMiarodajna,
    kod_blokady_dla_pochodzenia,
    komunikat_blokady,
    wklad_jest_miarodajny,
    zdolnosc_zalezy_od_wkladu_zwarciowego,
)


def test_kazda_zdolnosc_ma_jawna_klasyfikacje() -> None:
    """Lista ZAMKNIĘTA (§0 p.2 karty): każdy element enuma jest w DOKŁADNIE
    jednym z dwóch zbiorów — nowa zdolność dodana do enuma bez wpisu w żadnym
    zbiorze łamie ten test (fail-closed przy rozbudowie enuma)."""
    wszystkie = set(ZdolnoscMiarodajna)
    sklasyfikowane = (
        ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO | ZDOLNOSCI_NIEZALEZNE_OD_WKLADU_ZWARCIOWEGO
    )
    assert wszystkie == sklasyfikowane, f"Zdolności bez klasyfikacji: {wszystkie - sklasyfikowane}"


def test_zbiory_sa_rozlaczne() -> None:
    assert not (
        ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO & ZDOLNOSCI_NIEZALEZNE_OD_WKLADU_ZWARCIOWEGO
    )


def test_zdolnosci_zalezne_zgodne_z_decyzja_wlasciciela() -> None:
    """§0 p.2 karty: dobór aparatury SN/nN, nastawy i koordynacja zabezpieczeń,
    pakiety dowodowe SC3F/Equipment/Protection są ZALEŻNE."""
    assert ZdolnoscMiarodajna.SHORT_CIRCUIT_3F in ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO
    assert ZdolnoscMiarodajna.SHORT_CIRCUIT_1F in ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO
    assert ZdolnoscMiarodajna.PROTECTION in ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO
    assert ZdolnoscMiarodajna.BREAKING_CAPACITY_SELECTION in ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO
    assert ZdolnoscMiarodajna.PROTECTION_COORDINATION in ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO
    assert ZdolnoscMiarodajna.SC_WITHSTAND_EVIDENCE in ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO
    assert ZdolnoscMiarodajna.REGULATORY_EVIDENCE in ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO


def test_zdolnosci_niezalezne_zgodne_z_decyzja_wlasciciela() -> None:
    """§0 p.2 karty: rozpływ, topologia, SLD, edycja modelu — dostępne."""
    assert ZdolnoscMiarodajna.LOAD_FLOW in ZDOLNOSCI_NIEZALEZNE_OD_WKLADU_ZWARCIOWEGO
    assert ZdolnoscMiarodajna.TOPOLOGY in ZDOLNOSCI_NIEZALEZNE_OD_WKLADU_ZWARCIOWEGO
    assert ZdolnoscMiarodajna.SLD in ZDOLNOSCI_NIEZALEZNE_OD_WKLADU_ZWARCIOWEGO
    assert ZdolnoscMiarodajna.EDITING in ZDOLNOSCI_NIEZALEZNE_OD_WKLADU_ZWARCIOWEGO


def test_zdolnosc_zalezy_od_wkladu_zwarciowego_zgodne_ze_zbiorem() -> None:
    for zdolnosc in ZdolnoscMiarodajna:
        assert zdolnosc_zalezy_od_wkladu_zwarciowego(zdolnosc) == (
            zdolnosc in ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO
        )


def test_wklad_jest_miarodajny_tylko_dla_deklaracji() -> None:
    assert wklad_jest_miarodajny(K_SC_ZRODLO_DEKLARACJA) is True
    for znacznik in (
        K_SC_ZRODLO_DOMYSLNE,
        K_SC_ZRODLO_NIEPOPRAWNE,
        K_SC_ZRODLO_POZA_DZIEDZINA,
        K_SC_ZRODLO_PRAD_NIEPOPRAWNY,
    ):
        assert wklad_jest_miarodajny(znacznik) is False


def test_kod_blokady_dla_pochodzenia_kazdy_znacznik_ma_wlasny_kod() -> None:
    """Cztery znaczniki niemiarodajne -> cztery RÓŻNE kody (osobna naprawa dla
    każdego, §0 karty)."""
    kody = {
        K_SC_ZRODLO_DOMYSLNE: KOD_BLOKADY_K_SC_DOMYSLNY,
        K_SC_ZRODLO_NIEPOPRAWNE: KOD_BLOKADY_K_SC_NIEPOPRAWNY,
        K_SC_ZRODLO_POZA_DZIEDZINA: KOD_BLOKADY_K_SC_POZA_DZIEDZINA,
        K_SC_ZRODLO_PRAD_NIEPOPRAWNY: KOD_BLOKADY_PRAD_ZNAMIONOWY_NIEPOPRAWNY,
    }
    assert len(set(kody.values())) == 4, "kody blokady muszą być parami różne"
    for znacznik, oczekiwany_kod in kody.items():
        assert kod_blokady_dla_pochodzenia(znacznik) == oczekiwany_kod


def test_komunikat_blokady_kazdy_znacznik_ma_wlasny_niepusty_tekst() -> None:
    for znacznik in (
        K_SC_ZRODLO_DOMYSLNE,
        K_SC_ZRODLO_NIEPOPRAWNE,
        K_SC_ZRODLO_POZA_DZIEDZINA,
        K_SC_ZRODLO_PRAD_NIEPOPRAWNY,
    ):
        komunikat = komunikat_blokady(ref_zrodla="INV-1", k_sc_zrodlo=znacznik)
        assert komunikat
        assert "INV-1" in komunikat


def test_komunikat_blokady_teksty_sa_parami_rozne() -> None:
    """Cztery przyczyny -> cztery różne komunikaty (nie jeden generyczny tekst)."""
    teksty = {
        komunikat_blokady(ref_zrodla="X", k_sc_zrodlo=z)
        for z in (
            K_SC_ZRODLO_DOMYSLNE,
            K_SC_ZRODLO_NIEPOPRAWNE,
            K_SC_ZRODLO_POZA_DZIEDZINA,
            K_SC_ZRODLO_PRAD_NIEPOPRAWNY,
        )
    }
    assert len(teksty) == 4
