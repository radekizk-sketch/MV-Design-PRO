"""Testy oceny warunkow przylaczenia OSD (karta F-K2, znalezisko Z2 audytu FLOW).

METODA: wartosci oczekiwane z niezaleznego rachunku zapisanego w tescie
(cosfi = abs(P)/hypot(P,Q)), nigdy z liczby utrwalonej po uruchomieniu kodu.
"""

from __future__ import annotations

import math

import pytest
from application.analyses.warunki_przylaczenia import (
    KIERUNEK_ODDAWANIE,
    KIERUNEK_POBOR,
    KRYTERIUM_COS_PHI,
    KRYTERIUM_MOC,
    READINESS_CONNECTION_COS_PHI_MISSING,
    READINESS_CONNECTION_FLOW_MISSING,
    READINESS_CONNECTION_LIMIT_MISSING,
    STATUS_FAIL,
    STATUS_PASS,
    STATUS_UNAVAILABLE,
    ocen_warunki_przylaczenia,
)


def _wynik(p_mw: float, q_mvar: float, *, converged: bool = True, slack: str = "BUS-PWP") -> dict:
    """Minimalny PowerFlowResultV1.to_dict() z jedna szyna — punktem przylaczenia."""
    return {
        "converged": converged,
        "slack_bus_id": slack,
        "bus_results": [
            {
                "bus_id": slack,
                "v_pu": 1.0,
                "angle_deg": 0.0,
                "p_injected_mw": p_mw,
                "q_injected_mvar": q_mvar,
                "status": "solved",
            }
        ],
    }


def _pozycja(ocena, kryterium):
    return next(p for p in ocena.pozycje if p.kryterium == kryterium)


def test_przekroczony_limit_mocy_oddawanej_daje_fail() -> None:
    """Przypadek z audytu: limit OSD 5 MW, instalacja oddaje 6,2 MW => FAIL.

    Znak: P < 0 = oddawanie do sieci; limit dotyczy modulu.
    Rachunek: |P| = 6,2 MW > 5,0 MW.
    """
    ocena = ocen_warunki_przylaczenia(
        connection_conditions={"moc_przylaczeniowa_mw": 5.0},
        result_v1=_wynik(-6.2, 0.0),
    )
    pozycja = _pozycja(ocena, KRYTERIUM_MOC)
    assert pozycja.status == STATUS_FAIL
    assert pozycja.wartosc == pytest.approx(6.2)
    assert pozycja.wymagana == pytest.approx(5.0)
    assert ocena.kierunek == KIERUNEK_ODDAWANIE
    assert ocena.status_ogolny == STATUS_FAIL
    assert "PRZEKROCZONY" in pozycja.opis_pl


def test_limit_dotrzymany_w_obu_kierunkach() -> None:
    """Ten sam limit ogranicza pobor i oddawanie — modul mocy, nie wartosc ze znakiem."""
    oddawanie = ocen_warunki_przylaczenia(
        connection_conditions={"moc_przylaczeniowa_mw": 5.0},
        result_v1=_wynik(-4.5, 0.0),
    )
    pobor = ocen_warunki_przylaczenia(
        connection_conditions={"moc_przylaczeniowa_mw": 5.0},
        result_v1=_wynik(4.5, 0.0),
    )
    assert _pozycja(oddawanie, KRYTERIUM_MOC).status == STATUS_PASS
    assert _pozycja(pobor, KRYTERIUM_MOC).status == STATUS_PASS
    assert oddawanie.kierunek == KIERUNEK_ODDAWANIE
    assert pobor.kierunek == KIERUNEK_POBOR
    # Ta sama wartosc kryterialna (modul) dla obu kierunkow.
    assert _pozycja(oddawanie, KRYTERIUM_MOC).wartosc == _pozycja(pobor, KRYTERIUM_MOC).wartosc


def test_rowna_moc_limitowi_jest_dotrzymaniem() -> None:
    """Granica: |P| = limit spelnia warunek (nierownosc nieostra)."""
    ocena = ocen_warunki_przylaczenia(
        connection_conditions={"moc_przylaczeniowa_mw": 5.0},
        result_v1=_wynik(-5.0, 0.0),
    )
    assert _pozycja(ocena, KRYTERIUM_MOC).status == STATUS_PASS


def test_cos_phi_ponizej_wymaganego_daje_fail() -> None:
    """Rachunek niezalezny: P = 4 MW, Q = 3 Mvar => S = 5 MVA, cosfi = 4/5 = 0,8.

    Wymagane 0,95 => 0,8 < 0,95 => NIEDOTRZYMANY.
    """
    assert math.hypot(4.0, 3.0) == pytest.approx(5.0)
    ocena = ocen_warunki_przylaczenia(
        connection_conditions={"moc_przylaczeniowa_mw": 10.0, "wymagany_cos_phi": 0.95},
        result_v1=_wynik(4.0, 3.0),
    )
    pozycja = _pozycja(ocena, KRYTERIUM_COS_PHI)
    assert pozycja.status == STATUS_FAIL
    assert pozycja.wartosc == pytest.approx(0.8)
    assert ocena.s_mva == pytest.approx(5.0)
    assert ocena.cos_phi == pytest.approx(0.8)
    # Moc miesci sie w limicie, wiec werdykt ogolny FAIL pochodzi WYLACZNIE z cosfi.
    assert _pozycja(ocena, KRYTERIUM_MOC).status == STATUS_PASS
    assert ocena.status_ogolny == STATUS_FAIL


def test_cos_phi_powyzej_wymaganego_daje_pass() -> None:
    """P = 4,8 MW, Q = 1,4 Mvar => S = 5,0 MVA, cosfi = 0,96 >= 0,95."""
    s = math.hypot(4.8, 1.4)
    assert 4.8 / s == pytest.approx(0.96, rel=1e-3)
    ocena = ocen_warunki_przylaczenia(
        connection_conditions={"moc_przylaczeniowa_mw": 10.0, "wymagany_cos_phi": 0.95},
        result_v1=_wynik(4.8, 1.4),
    )
    assert _pozycja(ocena, KRYTERIUM_COS_PHI).status == STATUS_PASS
    assert ocena.status_ogolny == STATUS_PASS


def test_cos_phi_liczony_bez_wzgledu_na_kierunek_mocy() -> None:
    """Dla P = -4 MW i P = +4 MW przy tym samym Q cosfi jest identyczny.

    cosfi = |P|/S nie zalezy od kierunku przeplywu mocy czynnej — to wielkosc
    opisujaca stosunek mocy, nie kierunek.
    """
    oddawanie = ocen_warunki_przylaczenia(
        connection_conditions={"wymagany_cos_phi": 0.95},
        result_v1=_wynik(-4.0, 3.0),
    )
    pobor = ocen_warunki_przylaczenia(
        connection_conditions={"wymagany_cos_phi": 0.95},
        result_v1=_wynik(4.0, 3.0),
    )
    assert oddawanie.cos_phi == pobor.cos_phi == pytest.approx(0.8)


@pytest.mark.parametrize(
    ("warunki", "wynik", "kryterium", "oczekiwany_kod"),
    [
        # Brak limitu w warunkach OSD — nie ma z czym porownac mocy.
        ({}, _wynik(-6.2, 0.0), KRYTERIUM_MOC, READINESS_CONNECTION_LIMIT_MISSING),
        # Brak wymaganego cosfi w warunkach OSD.
        (
            {"moc_przylaczeniowa_mw": 5.0},
            _wynik(-1.0, 0.5),
            KRYTERIUM_COS_PHI,
            READINESS_CONNECTION_COS_PHI_MISSING,
        ),
        # Brak biegu rozplywu — nie ma zmierzonej wielkosci.
        ({"moc_przylaczeniowa_mw": 5.0}, None, KRYTERIUM_MOC, READINESS_CONNECTION_FLOW_MISSING),
        # Bieg niezbiezny nie daje podstawy do oceny.
        (
            {"moc_przylaczeniowa_mw": 5.0},
            _wynik(-6.2, 0.0, converged=False),
            KRYTERIUM_MOC,
            READINESS_CONNECTION_FLOW_MISSING,
        ),
    ],
)
def test_brak_danej_daje_niesprawdzone_a_nie_pass(
    warunki: dict, wynik: dict | None, kryterium: str, oczekiwany_kod: str
) -> None:
    """Zero fabrykacji: brak danej => UNAVAILABLE + kod, NIGDY milczace PASS."""
    ocena = ocen_warunki_przylaczenia(connection_conditions=warunki, result_v1=wynik)
    pozycja = _pozycja(ocena, kryterium)
    assert pozycja.status == STATUS_UNAVAILABLE
    assert oczekiwany_kod in pozycja.readiness_codes
    assert pozycja.wartosc is None
    assert pozycja.wymagana is None
    assert pozycja.is_conclusive is False


def test_brak_wszystkich_danych_daje_werdykt_niesprawdzony() -> None:
    """Zaden ocenialny warunek => status ogolny UNAVAILABLE, nie PASS.

    To jest istota trzeciego stanu: projekt bez warunkow OSD i bez biegu NIE JEST
    zgodny — jest NIEOCENIONY.
    """
    ocena = ocen_warunki_przylaczenia(connection_conditions=None, result_v1=None)
    assert ocena.status_ogolny == STATUS_UNAVAILABLE
    assert all(p.status == STATUS_UNAVAILABLE for p in ocena.pozycje)
    assert READINESS_CONNECTION_LIMIT_MISSING in ocena.readiness_codes
    assert READINESS_CONNECTION_COS_PHI_MISSING in ocena.readiness_codes
    assert READINESS_CONNECTION_FLOW_MISSING in ocena.readiness_codes
    # Kody bez duplikatow, mimo ze brak biegu dotyka obu kryteriow.
    assert len(ocena.readiness_codes) == len(set(ocena.readiness_codes))


def test_wartosci_niedodatnie_w_warunkach_traktowane_jak_brak() -> None:
    """Limit 0 MW albo cosfi 0 nie sa kryterium — to brak danej, nie zero."""
    ocena = ocen_warunki_przylaczenia(
        connection_conditions={"moc_przylaczeniowa_mw": 0.0, "wymagany_cos_phi": 0.0},
        result_v1=_wynik(-1.0, 0.5),
    )
    assert _pozycja(ocena, KRYTERIUM_MOC).status == STATUS_UNAVAILABLE
    assert _pozycja(ocena, KRYTERIUM_COS_PHI).status == STATUS_UNAVAILABLE


def test_punkt_przylaczenia_domyslnie_z_wezla_bilansujacego() -> None:
    ocena = ocen_warunki_przylaczenia(
        connection_conditions={"moc_przylaczeniowa_mw": 5.0},
        result_v1=_wynik(-1.0, 0.0, slack="BUS-GPZ-SN"),
    )
    assert ocena.punkt_przylaczenia == "BUS-GPZ-SN"


def test_jawny_punkt_przylaczenia_ma_pierwszenstwo() -> None:
    """Wskazany wezel jest uzywany zamiast bilansujacego; nieznany => brak danych."""
    wynik = _wynik(-1.0, 0.0, slack="BUS-GPZ-SN")
    wynik["bus_results"].append(
        {
            "bus_id": "BUS-INNY",
            "v_pu": 0.99,
            "angle_deg": -1.0,
            "p_injected_mw": -3.3,
            "q_injected_mvar": 0.4,
            "status": "solved",
        }
    )
    ocena = ocen_warunki_przylaczenia(
        connection_conditions={"moc_przylaczeniowa_mw": 5.0},
        result_v1=wynik,
        punkt_przylaczenia="BUS-INNY",
    )
    assert ocena.punkt_przylaczenia == "BUS-INNY"
    assert ocena.p_mw == pytest.approx(-3.3)

    nieznany = ocen_warunki_przylaczenia(
        connection_conditions={"moc_przylaczeniowa_mw": 5.0},
        result_v1=wynik,
        punkt_przylaczenia="BUS-NIE-MA",
    )
    assert _pozycja(nieznany, KRYTERIUM_MOC).status == STATUS_UNAVAILABLE
    assert READINESS_CONNECTION_FLOW_MISSING in nieznany.readiness_codes


def test_szyna_nierozwiazana_nie_daje_podstawy_do_oceny() -> None:
    """Szyna poza wyspa slacka (status not_solved) — brak danych, nie zero."""
    wynik = _wynik(-6.2, 0.0)
    wynik["bus_results"][0]["status"] = "not_solved"
    ocena = ocen_warunki_przylaczenia(
        connection_conditions={"moc_przylaczeniowa_mw": 5.0}, result_v1=wynik
    )
    assert _pozycja(ocena, KRYTERIUM_MOC).status == STATUS_UNAVAILABLE


def test_wynik_jest_deterministyczny_i_serializowalny() -> None:
    argumenty = {
        "connection_conditions": {"moc_przylaczeniowa_mw": 5.0, "wymagany_cos_phi": 0.95},
        "result_v1": _wynik(4.0, 3.0),
    }
    pierwszy = ocen_warunki_przylaczenia(**argumenty).to_dict()
    drugi = ocen_warunki_przylaczenia(**argumenty).to_dict()
    assert pierwszy == drugi
    # Kolejnosc pozycji stala: najpierw moc, potem cosfi.
    assert [p["kryterium"] for p in pierwszy["pozycje"]] == [KRYTERIUM_MOC, KRYTERIUM_COS_PHI]
