"""Testy jednego zrodla prawdy kryteriow napieciowych (karta W3-J, 2026-09-16).

Reguła KLASA-NIE-INSTANCJA (CLAUDE.md): testy jako ILOCZYN CECH, nie
pojedynczy przyklad z karty. Cechy pokrywane w tym pliku:
  - {kazdy konsument backendu} x {ostrzezenie, przekroczenie, wiarygodnosc}
    -> parytet liczbowy (pin rownosci z jednego zrodla).
  - wartosc kryterium x {w pasmie, na granicy, poza} dla `pasmo_pu`.
  - kazda stala x obecnosc uczciwie nazwanej `podstawa_pl` (nie pusty tekst).
  - `zbuduj_kryteria_napiecia().to_dict()` x dokladny ksztalt pol z karty §0.3.
"""

from __future__ import annotations

from analysis.energy_validation.models import EnergyValidationConfig
from analysis.normative.kryteria_napiecia import (
    KRYTERIUM_OSTRZEZENIE_PODSTAWA_PL,
    KRYTERIUM_OSTRZEZENIE_PROCENT,
    KRYTERIUM_PRZEKROCZENIE_PODSTAWA_PL,
    KRYTERIUM_PRZEKROCZENIE_PROCENT,
    PASMO_WIARYGODNOSCI_PODSTAWA_PL,
    PASMO_WIARYGODNOSCI_PROCENT,
    KryteriaNapieciowe,
    pasmo_pu,
    zbuduj_kryteria_napiecia,
)
from analysis.normative.models import NormativeConfig
from analysis.reactive_adequacy.models import DEFAULT_U_MAX_PU, DEFAULT_U_MIN_PU
from analysis.sanity_bounds.power_flow_bounds import (
    NORMA_NAPIECIA_PL,
    PASMO_NAPIECIA_PROCENT,
)

# =============================================================================
# Wartosci kryteriow — nie zmieniamy liczb (karta ujednolica ZRODLO), tylko
# pinujemy, ze pozostaly te same PO konwergencji.
# =============================================================================


def test_wartosci_kryteriow_bez_zmian() -> None:
    assert PASMO_WIARYGODNOSCI_PROCENT == 10.0
    assert KRYTERIUM_OSTRZEZENIE_PROCENT == 5.0
    assert KRYTERIUM_PRZEKROCZENIE_PROCENT == 10.0


# =============================================================================
# pasmo_pu — iloczyn cech: kazdy prog x {w pasmie / na granicy / poza}
# =============================================================================


def test_pasmo_pu_ostrzezenie() -> None:
    min_pu, max_pu = pasmo_pu(KRYTERIUM_OSTRZEZENIE_PROCENT)
    assert min_pu == 0.95
    assert max_pu == 1.05
    # w pasmie
    assert min_pu < 1.0 < max_pu
    # poza pasmem
    assert 0.9 < min_pu
    assert 1.1 > max_pu


def test_pasmo_pu_przekroczenie() -> None:
    min_pu, max_pu = pasmo_pu(KRYTERIUM_PRZEKROCZENIE_PROCENT)
    assert min_pu == 0.9
    assert max_pu == 1.1


def test_pasmo_pu_zero_procent_daje_punkt() -> None:
    """Przypadek brzegowy: 0 % daje przedzial zdegenerowany do jednego punktu."""
    min_pu, max_pu = pasmo_pu(0.0)
    assert min_pu == max_pu == 1.0


def test_pasmo_pu_symetryczne_wokol_jednosci() -> None:
    for procent in (1.0, 5.0, 10.0, 25.0):
        min_pu, max_pu = pasmo_pu(procent)
        assert min_pu + max_pu == 2.0  # symetria wokol 1.0 pu


# =============================================================================
# Podstawy normatywne — kazda stala x obecnosc uczciwie nazwanej podstawy.
# Wiarygodnosc i przekroczenie DZIELA te sama podstawe normatywna (PN-EN
# 50160), ostrzezenie ma WLASNA, INNA podstawe (projektowa/IRiESD) — to
# rozroznienie jest CELEM tej karty, wiec test pinuje je wprost.
# =============================================================================


def test_podstawy_normatywne_nazwane_i_niepuste() -> None:
    assert PASMO_WIARYGODNOSCI_PODSTAWA_PL.strip() != ""
    assert KRYTERIUM_OSTRZEZENIE_PODSTAWA_PL.strip() != ""
    assert KRYTERIUM_PRZEKROCZENIE_PODSTAWA_PL.strip() != ""


def test_podstawa_wiarygodnosci_i_przekroczenia_cytuje_pn_en_50160() -> None:
    assert "PN-EN 50160" in PASMO_WIARYGODNOSCI_PODSTAWA_PL
    assert "PN-EN 50160" in KRYTERIUM_PRZEKROCZENIE_PODSTAWA_PL


def test_podstawa_ostrzezenia_nie_udaje_pn_en_50160() -> None:
    """Uczciwosc: podstawa kryterium ostrzezenia (5 %) MOZE wspominac PN-EN
    50160 jako CEL, ktory margines projektowy chroni (kontekst), ale NIE MOZE
    przypisywac normie WLASNEJ liczby 5 % — dawny blad frontendu
    (`ui2/wyniki/rozplyw/strings.ts` cytowal "EN 50160 / IRiESD ±5 %", myslac
    PROJEKTOWY margines 5 % z zapisem samej normy). Test pinuje: zadna z
    dwoch falszywych par ("50160 ± 5", "50160 ±5") nie wystepuje, a podstawa
    jawnie nazywa siebie NIE-normatywna."""
    assert "50160 ± 5 " not in KRYTERIUM_OSTRZEZENIE_PODSTAWA_PL
    assert "50160 ±5" not in KRYTERIUM_OSTRZEZENIE_PODSTAWA_PL
    assert "NIE jest zapis PN-EN 50160 wprost" in KRYTERIUM_OSTRZEZENIE_PODSTAWA_PL
    assert "projektow" in KRYTERIUM_OSTRZEZENIE_PODSTAWA_PL.lower()


def test_podstawa_wiarygodnosci_i_przekroczenia_ta_sama_norma_inne_pytanie() -> None:
    """Ta sama liczba (10 %) i ta sama podstawa normatywna dla DWOCH roznych
    kryteriow (wiarygodnosc wyniku solvera vs przekroczenie projektowe) —
    celowo, patrz docstring modulu `power_flow_bounds.py`."""
    assert PASMO_WIARYGODNOSCI_PODSTAWA_PL == KRYTERIUM_PRZEKROCZENIE_PODSTAWA_PL
    assert PASMO_WIARYGODNOSCI_PROCENT == KRYTERIUM_PRZEKROCZENIE_PROCENT == 10.0


# =============================================================================
# zbuduj_kryteria_napiecia() — ksztalt z karty §0.3, dokladnie.
# =============================================================================


def test_zbuduj_kryteria_napiecia_ksztalt() -> None:
    kryteria = zbuduj_kryteria_napiecia()
    assert isinstance(kryteria, KryteriaNapieciowe)
    assert kryteria.ostrzezenie_pct == 5.0
    assert kryteria.przekroczenie_pct == 10.0
    assert kryteria.ostrzezenie_min_pu == 0.95
    assert kryteria.ostrzezenie_max_pu == 1.05
    assert kryteria.przekroczenie_min_pu == 0.9
    assert kryteria.przekroczenie_max_pu == 1.1
    assert kryteria.pasmo_wiarygodnosci_pct == 10.0
    assert kryteria.podstawa_ostrzezenie_pl == KRYTERIUM_OSTRZEZENIE_PODSTAWA_PL
    assert kryteria.podstawa_przekroczenie_pl == KRYTERIUM_PRZEKROCZENIE_PODSTAWA_PL


def test_zbuduj_kryteria_napiecia_to_dict_pola_dokladnie_z_karty() -> None:
    """Karta W3-J §0.3: ksztalt odpowiedzi API — DOKLADNIE te 9 pol, nic
    wiecej, nic mniej."""
    slownik = zbuduj_kryteria_napiecia().to_dict()
    assert set(slownik.keys()) == {
        "ostrzezenie_pct",
        "przekroczenie_pct",
        "ostrzezenie_min_pu",
        "ostrzezenie_max_pu",
        "przekroczenie_min_pu",
        "przekroczenie_max_pu",
        "podstawa_ostrzezenie_pl",
        "podstawa_przekroczenie_pl",
        "pasmo_wiarygodnosci_pct",
    }


def test_zbuduj_kryteria_napiecia_deterministyczne() -> None:
    """Wywolanie wielokrotne daje identyczny wynik (konfiguracja, nie
    losowosc/zegar) — determinizm wymagany przez CLAUDE.md."""
    a = zbuduj_kryteria_napiecia().to_dict()
    b = zbuduj_kryteria_napiecia().to_dict()
    assert a == b


# =============================================================================
# PARYTET — iloczyn cech {kazdy konsument backendu} x {ostrzezenie,
# przekroczenie, wiarygodnosc}: rownosc liczb z JEDNEGO zrodla (pin).
# =============================================================================


def test_parytet_normative_config() -> None:
    config = NormativeConfig()
    assert config.voltage_warn_pct == KRYTERIUM_OSTRZEZENIE_PROCENT
    assert config.voltage_fail_pct == KRYTERIUM_PRZEKROCZENIE_PROCENT


def test_parytet_energy_validation_config() -> None:
    config = EnergyValidationConfig()
    assert config.voltage_warn_pct == KRYTERIUM_OSTRZEZENIE_PROCENT
    assert config.voltage_fail_pct == KRYTERIUM_PRZEKROCZENIE_PROCENT


def test_parytet_normative_config_i_energy_validation_config_ta_sama_liczba() -> None:
    """Druga kopia tej samej pary liczb (przed karta: dwie NIEZALEZNE kopie
    5.0/10.0) — po konwergencji obie CZYTAJA to samo zrodlo, wiec sa sobie
    rowne z definicji, nie z przypadku."""
    a = NormativeConfig()
    b = EnergyValidationConfig()
    assert a.voltage_warn_pct == b.voltage_warn_pct
    assert a.voltage_fail_pct == b.voltage_fail_pct


def test_parytet_reactive_adequacy() -> None:
    oczekiwany_min, oczekiwany_max = pasmo_pu(KRYTERIUM_OSTRZEZENIE_PROCENT)
    assert DEFAULT_U_MIN_PU == oczekiwany_min
    assert DEFAULT_U_MAX_PU == oczekiwany_max


def test_parytet_sanity_bounds_wiarygodnosc() -> None:
    """`sanity_bounds` czyta `PASMO_WIARYGODNOSCI_PROCENT` — nazwa pola
    (`PASMO_NAPIECIA_PROCENT`) i wynik bit w bit bez zmian (karta §0.1)."""
    assert PASMO_NAPIECIA_PROCENT == PASMO_WIARYGODNOSCI_PROCENT
    assert PASMO_NAPIECIA_PROCENT == 10.0
    # Cytat normy sanity_bounds pozostaje wlasny (tresc dluzsza, uzywana w
    # komunikatach why_pl) — ale niesie te sama norme co ten modul.
    assert "PN-EN 50160" in NORMA_NAPIECIA_PL


def test_parytet_power_flow_interpretation() -> None:
    from analysis.power_flow_interpretation.builder import (
        VOLTAGE_INFO_MAX_PCT,
        VOLTAGE_WARN_MAX_PCT,
    )

    assert VOLTAGE_INFO_MAX_PCT == KRYTERIUM_OSTRZEZENIE_PROCENT
    assert VOLTAGE_WARN_MAX_PCT == KRYTERIUM_PRZEKROCZENIE_PROCENT
