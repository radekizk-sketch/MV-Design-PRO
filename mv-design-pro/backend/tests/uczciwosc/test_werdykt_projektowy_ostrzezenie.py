"""Werdykt projektowy: ostrzeżenie dostawcy i status nieznany NIGDY nie dają SPEŁNIA.

Dawny agregat miał JEDNĄ mapę „status dostawcy → wynik" dla czterech dostawców o RÓŻNEJ
semantyce ostrzeżenia i domyślną wartość `SPELNIA` dla statusu spoza mapy wiarygodności:
  - raport doborów toru DER-SN melduje `WARN` dla BRAKU DANYCH (powiązanie katalogowe
    aparatu pola — `kaskada_prad_pole_brak`), dla odstępstwa od propozycji i dla biegu
    w toku — to nie jest sprawdzenie dotrzymanego kryterium;
  - wiarygodność Ik'' zamieniała każdy status spoza {poza zakresem, dane niekompletne}
    w SPEŁNIA.
Rozstrzygnięcie zarządcy 2026-09-23 (kontrakt werdyktu §2.1/§2.3): `WARN` dostawcy to
NIEJEDNOZNACZNY w ocenie elementu (agregat nie interpretuje treści ostrzeżenia — powód
niesie komunikat dostawcy), a agregat — pozycja i werdykt całościowy — NIGDY nie jest lepszy
niż najgorsza składowa (kolejność §2.3: naruszenie → niejednoznaczność → brak podstaw →
spełnienie). Walidacja energetyczna `WARNING` ma INNĄ semantykę: dostawca policzył wartość
i sam stwierdza, że granica jest dotrzymana („zbliża się do limitu") — tam SPEŁNIA z uwagą
jest prawdą (kontrakt §2.1: kryterium sprawdzone i dotrzymane) i zostaje.

Iloczyn cech: {dostawca: warunki przyłączenia, walidacja energetyczna, wytrzymałość cieplna,
wiarygodność Ik'', dobory DER-SN} × {status: zaliczony, ostrzeżenie, naruszony, brak podstawy,
nieznany} — dla każdej pary wynik elementu i stan pozycji pochodzą z JEDNEJ mapy dostawcy;
{ostrzeżenie × brak podstawy × brak danych × naruszenie} — w każdej kombinacji składowych
pozycja i werdykt całościowy są stanem NAJGORSZEJ składowej (predykaty parami).
"""

from __future__ import annotations

import itertools
from typing import Any

import pytest
from analysis.sanity_bounds.short_circuit_bounds import CREDIBLE, INCOMPLETE, OUT_OF_RANGE
from application.analyses.werdykt_projektowy import (
    KRYTERIUM_NAPIECIE,
    STAN_NARUSZONE,
    STAN_NIE_DOTYCZY,
    STAN_NIEJEDNOZNACZNE,
    STAN_NIESPRAWDZONE,
    STAN_SPELNIONE,
    WYNIK_BRAK_PODSTAW,
    WYNIK_NIE_SPELNIA,
    WYNIK_NIEJEDNOZNACZNY,
    WYNIK_SPELNIA,
    PozycjaWerdyktu,
    WerdyktProjektowy,
    _pozycja_cieplna,
    _pozycja_der_sn,
    _pozycja_wiarygodnosci,
    _pozycje_walidacji_energetycznej,
    _pozycje_warunkow_przylaczenia,
    _werdykt_calosciowy,
)

#: Wyrocznia NIEZALEŻNA od modułu: kolejność §2.3 kontraktu werdyktu (pkt 4–7), od najgorszego.
_KOLEJNOSC_2_3 = (STAN_NARUSZONE, STAN_NIEJEDNOZNACZNE, STAN_NIESPRAWDZONE, STAN_SPELNIONE)


def _najgorszy(stany: list[str]) -> str:
    return min(stany, key=_KOLEJNOSC_2_3.index)


def _raport_der(*pozycje: dict[str, Any]) -> dict[str, Any]:
    return {
        "source_ref": "gen-pv",
        "source_name": "PV 1",
        "pozycje": list(pozycje),
        "podsumowanie": {
            "fail": sum(1 for p in pozycje if p["status"] == "FAIL"),
            "warn": sum(1 for p in pozycje if p["status"] == "WARN"),
            "pass": sum(1 for p in pozycje if p["status"] == "PASS"),
        },
    }


_KASKADA_POLE_BRAK = {
    "check_id": "converter.der_sn.kaskada_prad_pole_brak",
    "kategoria": "kaskada_pradowa",
    "status": "WARN",
    "code": "converter.der_sn.kaskada_prad_pole_brak",
    "message_pl": "⚠️ Brak danych kaskady prądowej pola SN (aparat bez powiązania katalogowego).",
}
_ZGODNE = {
    "check_id": "napiecie_sn",
    "kategoria": "walidacja_D1",
    "status": "PASS",
    "code": "der_sn.ok.napiecie_sn",
    "message_pl": "✓ Strona SN TR blokowego zgodna z napięciem szyny SN.",
}


def test_ostrzezenie_brak_danych_kaskady_pradowej_to_wynik_niejednoznaczny() -> None:
    pozycja = _pozycja_der_sn(_raport_der(_ZGODNE, _KASKADA_POLE_BRAK))
    wyniki = {e.element_nazwa: e.wynik for e in pozycja.elementy}
    element = next(e for e in pozycja.elementy if "kaskada" in (e.element_nazwa or ""))
    assert element.wynik == WYNIK_NIEJEDNOZNACZNY, wyniki
    assert element.wynik != WYNIK_SPELNIA
    assert "Brak danych kaskady prądowej" in (element.uzasadnienie_pl or "")
    assert element.wniosek_pl.startswith("Wynik niejednoznaczny — wymaga weryfikacji: ")
    # Uwaga należy wyłącznie do wyniku SPEŁNIA — ostrzeżenie niesie wynik, nie dopisek.
    assert element.uwaga_pl is None
    # Predykaty parami: element niejednoznaczny ⇒ pozycja nie jest SPEŁNIONA.
    assert pozycja.stan == STAN_NIEJEDNOZNACZNE
    assert pozycja.liczba_niejednoznacznych == 1
    assert pozycja.liczba_niesprawdzonych == 0
    assert pozycja.to_dict()["liczba_niejednoznacznych"] == 1


@pytest.mark.parametrize(
    ("status", "oczekiwany_wynik", "oczekiwany_stan"),
    [
        ("PASS", WYNIK_SPELNIA, STAN_SPELNIONE),
        ("WARN", WYNIK_NIEJEDNOZNACZNY, STAN_NIEJEDNOZNACZNE),
        ("FAIL", WYNIK_NIE_SPELNIA, STAN_NARUSZONE),
        ("NIEZNANY_STATUS", WYNIK_BRAK_PODSTAW, STAN_NIESPRAWDZONE),
    ],
)
def test_dobory_der_sn_status_x_wynik(
    status: str, oczekiwany_wynik: str, oczekiwany_stan: str
) -> None:
    pozycja = _pozycja_der_sn(_raport_der({**_ZGODNE, "status": status}))
    assert [e.wynik for e in pozycja.elementy] == [oczekiwany_wynik]
    assert pozycja.stan == oczekiwany_stan


@pytest.mark.parametrize(
    ("status", "oczekiwany_wynik", "oczekiwany_stan"),
    [
        (CREDIBLE, WYNIK_SPELNIA, STAN_SPELNIONE),
        (OUT_OF_RANGE, WYNIK_NIE_SPELNIA, STAN_NARUSZONE),
        (INCOMPLETE, WYNIK_BRAK_PODSTAW, STAN_NIESPRAWDZONE),
        ("zweryfikowany", WYNIK_BRAK_PODSTAW, STAN_NIESPRAWDZONE),
        ("NIEZNANY_STATUS", WYNIK_BRAK_PODSTAW, STAN_NIESPRAWDZONE),
    ],
)
def test_wiarygodnosc_ik_status_x_wynik(
    status: str, oczekiwany_wynik: str, oczekiwany_stan: str
) -> None:
    widok = {
        "items": [
            {
                "target_id": "b1",
                "element_id": "b1",
                "status": status,
                "ikss_ka": 8.0,
                "upper_ka": 50.0,
                "lower_ka": 0.1,
            }
        ],
        "summary": {
            "out_of_range_count": 1 if status == OUT_OF_RANGE else 0,
            "incomplete_count": 1 if status == INCOMPLETE else 0,
        },
    }
    pozycja = _pozycja_wiarygodnosci(widok, run_id="run-sc")
    assert [e.wynik for e in pozycja.elementy] == [oczekiwany_wynik]
    assert pozycja.stan == oczekiwany_stan


@pytest.mark.parametrize(
    ("status", "oczekiwany_wynik", "oczekiwany_stan"),
    [
        ("PASS", WYNIK_SPELNIA, STAN_SPELNIONE),
        # WARNING walidacji energetycznej = granica dotrzymana, mały zapas (semantyka dostawcy).
        ("WARNING", WYNIK_SPELNIA, STAN_SPELNIONE),
        ("FAIL", WYNIK_NIE_SPELNIA, STAN_NARUSZONE),
        ("NOT_COMPUTED", WYNIK_BRAK_PODSTAW, STAN_NIESPRAWDZONE),
        ("NIEZNANY_STATUS", WYNIK_BRAK_PODSTAW, STAN_NIESPRAWDZONE),
    ],
)
def test_walidacja_energetyczna_status_x_wynik(
    status: str, oczekiwany_wynik: str, oczekiwany_stan: str
) -> None:
    widok = {
        "items": [
            {
                "check_type": "VOLTAGE_DEVIATION",
                "target_id": "b1",
                "status": status,
                "observed_value": 4.0,
                "limit_warn": 3.0,
                "limit_fail": 5.0,
                "margin_pct": -1.0,
                "unit": "%",
            }
        ]
    }
    pozycja = next(
        p
        for p in _pozycje_walidacji_energetycznej(widok, run_id="run-pf")
        if p.definicja.kryterium_id.endswith("napiecie") or p.elementy
    )
    assert [e.wynik for e in pozycja.elementy] == [oczekiwany_wynik]
    assert pozycja.stan == oczekiwany_stan


@pytest.mark.parametrize(
    ("status", "oczekiwany_wynik", "oczekiwany_stan"),
    [
        ("PASS", WYNIK_SPELNIA, STAN_SPELNIONE),
        ("FAIL", WYNIK_NIE_SPELNIA, STAN_NARUSZONE),
        ("UNAVAILABLE", WYNIK_BRAK_PODSTAW, STAN_NIESPRAWDZONE),
        ("WARN", WYNIK_BRAK_PODSTAW, STAN_NIESPRAWDZONE),
        ("NIEZNANY_STATUS", WYNIK_BRAK_PODSTAW, STAN_NIESPRAWDZONE),
    ],
)
def test_wytrzymalosc_cieplna_status_x_wynik(
    status: str, oczekiwany_wynik: str, oczekiwany_stan: str
) -> None:
    widok = {
        "ocena": {
            "items": [
                {
                    "branch_id": "cab-1",
                    "status": status,
                    "i2t_a2s": 1.0e6,
                    "i2t_dopuszczalne_a2s": 2.0e6,
                }
            ]
        }
    }
    pozycja = _pozycja_cieplna(widok, run_id="run-sc")
    assert [e.wynik for e in pozycja.elementy] == [oczekiwany_wynik]
    assert pozycja.stan == oczekiwany_stan


@pytest.mark.parametrize(
    ("status", "oczekiwany_wynik", "oczekiwany_stan"),
    [
        ("PASS", WYNIK_SPELNIA, STAN_SPELNIONE),
        ("FAIL", WYNIK_NIE_SPELNIA, STAN_NARUSZONE),
        ("UNAVAILABLE", WYNIK_BRAK_PODSTAW, STAN_NIESPRAWDZONE),
        ("WARN", WYNIK_BRAK_PODSTAW, STAN_NIESPRAWDZONE),
        ("NIEZNANY_STATUS", WYNIK_BRAK_PODSTAW, STAN_NIESPRAWDZONE),
    ],
)
def test_warunki_przylaczenia_status_x_wynik(
    status: str, oczekiwany_wynik: str, oczekiwany_stan: str
) -> None:
    widok = {
        "ocena": {
            "punkt_przylaczenia": "bus-pcc",
            "pozycje": [
                {
                    "kryterium": "moc_w_punkcie_przylaczenia",
                    "status": status,
                    "wartosc": 1.0,
                    "wymagana": 2.0,
                    "jednostka": "MW",
                    "opis_pl": "Moc w punkcie przyłączenia.",
                }
            ],
        }
    }
    pozycja = next(p for p in _pozycje_warunkow_przylaczenia(widok, run_id="run-pf") if p.elementy)
    assert [e.wynik for e in pozycja.elementy] == [oczekiwany_wynik]
    assert pozycja.stan == oczekiwany_stan


# ---------------------------------------------------------------------------
# Iloczyn: ostrzeżenie × brak podstawy × brak danych × naruszenie (§2.3 kontraktu)
# ---------------------------------------------------------------------------

#: Stan pozycji, jaki niesie JEDEN element danego statusu raportu DER-SN (wyrocznia testu).
_STAN_ELEMENTU_DER = {
    "PASS": STAN_SPELNIONE,
    "WARN": STAN_NIEJEDNOZNACZNE,
    "FAIL": STAN_NARUSZONE,
    "NIEZNANY_STATUS": STAN_NIESPRAWDZONE,
}


@pytest.mark.parametrize(
    "statusy",
    [
        kombinacja
        for dlugosc in (1, 2, 3)
        for kombinacja in itertools.product(sorted(_STAN_ELEMENTU_DER), repeat=dlugosc)
    ],
    ids=lambda statusy: "+".join(statusy),
)
def test_pozycja_der_sn_nigdy_lepsza_niz_najgorszy_element(statusy: tuple[str, ...]) -> None:
    pozycja = _pozycja_der_sn(
        _raport_der(
            *({**_ZGODNE, "check_id": f"k{nr}", "status": s} for nr, s in enumerate(statusy))
        )
    )
    oczekiwany = _najgorszy([_STAN_ELEMENTU_DER[s] for s in statusy])
    assert pozycja.stan == oczekiwany, statusy
    for status in statusy:
        # Agregat nigdy nie jest lepszy niż KAŻDA składowa.
        assert _KOLEJNOSC_2_3.index(pozycja.stan) <= _KOLEJNOSC_2_3.index(
            _STAN_ELEMENTU_DER[status]
        )
    assert pozycja.liczba_niejednoznacznych == statusy.count("WARN")
    assert pozycja.liczba_niesprawdzonych == statusy.count("NIEZNANY_STATUS")
    assert pozycja.liczba_naruszen == statusy.count("FAIL")
    assert pozycja.liczba_ocenionych == len(statusy) - statusy.count("NIEZNANY_STATUS")


def _pozycja_spelniona() -> PozycjaWerdyktu:
    """Walidacja energetyczna z wierszem PASS — pozycja SPEŁNIONA (tło kombinacji)."""
    widok = {
        "items": [
            {
                "check_type": "VOLTAGE_DEVIATION",
                "target_id": "b-ok",
                "status": "PASS",
                "observed_value": 1.0,
                "limit_warn": 3.0,
                "limit_fail": 5.0,
                "margin_pct": 4.0,
                "unit": "%",
            }
        ]
    }
    pozycja = next(
        p
        for p in _pozycje_walidacji_energetycznej(widok, run_id="run-pf")
        if p.definicja.kryterium_id == KRYTERIUM_NAPIECIE
    )
    assert pozycja.stan == STAN_SPELNIONE
    return pozycja


def _pozycja_ostrzezenia() -> PozycjaWerdyktu:
    """Dobory DER-SN z ostrzeżeniem dostawcy (odstępstwo) — pozycja NIEJEDNOZNACZNA."""
    return _pozycja_der_sn(
        _raport_der(
            {**_ZGODNE, "check_id": "d2.moc", "status": "WARN", "message_pl": "⚠️ Odstępstwo."}
        )
    )


def _pozycja_bez_podstawy() -> PozycjaWerdyktu:
    """Warunki przyłączenia: dostawca nie ma podstawy (UNAVAILABLE) — element BRAK_PODSTAW."""
    widok = {
        "ocena": {
            "punkt_przylaczenia": "bus-pcc",
            "pozycje": [
                {
                    "kryterium": "moc_w_punkcie_przylaczenia",
                    "status": "UNAVAILABLE",
                    "wartosc": None,
                    "wymagana": None,
                    "jednostka": "MW",
                    "opis_pl": "Brak warunków OSD w nagłówku modelu.",
                }
            ],
        }
    }
    return next(p for p in _pozycje_warunkow_przylaczenia(widok, run_id="run-pf") if p.elementy)


def _pozycja_bez_danych() -> PozycjaWerdyktu:
    """Wytrzymałość cieplna bez żadnej gałęzi w biegu — pozycja bez elementów (brak danych)."""
    return _pozycja_cieplna({"ocena": {"items": []}}, run_id="run-sc")


def _pozycja_naruszona() -> PozycjaWerdyktu:
    """Wytrzymałość cieplna z gałęzią FAIL — pozycja NARUSZONA."""
    widok = {
        "ocena": {
            "items": [
                {
                    "branch_id": "cab-1",
                    "status": "FAIL",
                    "i2t_a2s": 3.0e6,
                    "i2t_dopuszczalne_a2s": 2.0e6,
                }
            ]
        }
    }
    return _pozycja_cieplna(widok, run_id="run-sc")


@pytest.mark.parametrize(
    ("ostrzezenie", "brak_podstawy", "brak_danych", "naruszenie"),
    list(itertools.product((False, True), repeat=4)),
    ids=lambda flaga: "T" if flaga else "F",
)
def test_werdykt_calosciowy_nigdy_lepszy_niz_najgorsza_pozycja(
    ostrzezenie: bool, brak_podstawy: bool, brak_danych: bool, naruszenie: bool
) -> None:
    pozycje = [_pozycja_spelniona()]
    if ostrzezenie:
        pozycje.append(_pozycja_ostrzezenia())
    if brak_podstawy:
        pozycje.append(_pozycja_bez_podstawy())
    if brak_danych:
        pozycje.append(_pozycja_bez_danych())
    if naruszenie:
        pozycje.append(_pozycja_naruszona())
    oczekiwane_stany = {
        _pozycja_ostrzezenia: STAN_NIEJEDNOZNACZNE,
        _pozycja_bez_podstawy: STAN_NIESPRAWDZONE,
        _pozycja_bez_danych: STAN_NIESPRAWDZONE,
        _pozycja_naruszona: STAN_NARUSZONE,
    }
    for fabryka, stan in oczekiwane_stany.items():
        assert fabryka().stan == stan, fabryka.__name__

    werdykt = WerdyktProjektowy(
        werdykt=_werdykt_calosciowy(pozycje),
        case_id="c-iloczyn",
        model_hash="hash",
        pozycje=tuple(pozycje),
        zrodla=(),
    )
    oczekiwany = _najgorszy([p.stan for p in pozycje])
    assert werdykt.werdykt == oczekiwany
    if naruszenie:
        assert werdykt.werdykt == STAN_NARUSZONE
    elif ostrzezenie:
        assert werdykt.werdykt == STAN_NIEJEDNOZNACZNE
    elif brak_podstawy or brak_danych:
        assert werdykt.werdykt == STAN_NIESPRAWDZONE
    else:
        assert werdykt.werdykt == STAN_SPELNIONE

    podsumowanie = werdykt.podsumowanie
    assert podsumowanie["niejednoznaczne"] == int(ostrzezenie)
    assert podsumowanie["naruszone"] == int(naruszenie)
    assert podsumowanie["niesprawdzone"] == int(brak_podstawy) + int(brak_danych)
    assert podsumowanie["spelnione"] == 1
    ocena = werdykt.ocena
    elementy = [element for pozycja in pozycje for element in pozycja.elementy]
    assert ocena["niejednoznaczny"] == int(ostrzezenie)
    assert ocena["oceniono"] + ocena["brak_podstaw"] == len(elementy)
    assert ocena["oceniono"] == ocena["spelnia"] + ocena["nie_spelnia"] + ocena["niejednoznaczny"]


def test_komplet_pozycji_nie_dotyczy_to_brak_podstawy_nie_spelnienie() -> None:
    pozycja = _pozycja_der_sn(None)
    assert pozycja.stan == STAN_NIE_DOTYCZY
    assert _werdykt_calosciowy([pozycja]) == STAN_NIESPRAWDZONE
    assert _werdykt_calosciowy([pozycja, _pozycja_spelniona()]) == STAN_SPELNIONE
