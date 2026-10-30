"""Werdykt projektowy: wynik niesie WYŁĄCZNIE rekord werdyktu — kod statusu dostawcy nie decyduje.

Dawny agregat miał mapy „status dostawcy → wynik" (po jednej na dostawcę) i domyślną wartość
`SPELNIA` dla statusu spoza mapy wiarygodności. Karta WERDYKT-MIGRACJA-190 usuwa mapy: każdy
wiersz dostawcy niesie rekord K/W pakietu `werdykt` (``ocena``), wynik elementu jest projekcją
rekordu (reguła ``rozstrzygniecie``), a pozycja i werdykt całościowy — projekcją rekordów
wszystkich składowych, z REKORDEM ROZSTRZYGAJĄCYM i jego wyjaśnieniem.

Iloczyn cech:
  {dostawca: warunki przyłączenia, walidacja energetyczna, wytrzymałość cieplna, wiarygodność
  Ik'', dobory DER-SN} × {status rekordu: SPELNIA, NIE_SPELNIA, NIEJEDNOZNACZNY, NIE_OCENIONO,
  BRAK_PODSTAWY, NIE_DOTYCZY} × {kod statusu dostawcy: najlepszy, najgorszy} — wynik elementu,
  stan pozycji i wyjaśnienie pozycji pochodzą z rekordu, kod dostawcy jest bez znaczenia;
  {dostawca wieloelementowy} × {liczba elementów 1–3} × {statusy rekordów} — pozycja jest stanem
  NAJGORSZEJ składowej, a jej rekord rozstrzygający ma ten sam wynik (predykaty parami);
  {niejednoznaczność × brak podstawy × brak danych × naruszenie} — werdykt całościowy jest
  stanem najgorszej pozycji, a jego wyjaśnienie to wyjaśnienie pierwszej takiej pozycji;
  {ostrzeżenie dostawcy × rekord spełniony / naruszony / nieoceniony} — uwaga i licznik
  ostrzeżeń wyłącznie przy rekordzie spełnionym.
"""

from __future__ import annotations

import dataclasses
import functools
import itertools
from collections.abc import Callable
from typing import Any

import pytest
from analysis.sanity_bounds.short_circuit_bounds import CREDIBLE, OUT_OF_RANGE
from application.analyses.werdykt_projektowy import (
    KRYTERIUM_NAPIECIE,
    KRYTERIUM_PWP_MOC,
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
)
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    Niepewnosc,
    OcenaKryterium,
    OdnosnikSladu,
    Przedmiot,
    Wielkosc,
    ZakresWaznosci,
)
from werdykt.decyzja import jednostka_marginesu
from werdykt.porownanie import Porownanie, ocena_porownania, podstawa_zalozenia

#: Wyrocznia NIEZALEŻNA od modułu: kolejność §2.3 kontraktu werdyktu (pkt 4–7), od najgorszego.
_KOLEJNOSC_2_3 = (STAN_NARUSZONE, STAN_NIEJEDNOZNACZNE, STAN_NIESPRAWDZONE, STAN_SPELNIONE)

#: Wyrocznia: wynik elementu dla statusu rekordu (kontrakt §2.1 — brak danych ≠ spełnia).
_WYNIK_REKORDU = {
    "SPELNIA": WYNIK_SPELNIA,
    "NIE_SPELNIA": WYNIK_NIE_SPELNIA,
    "NIEJEDNOZNACZNY": WYNIK_NIEJEDNOZNACZNY,
    "NIE_OCENIONO": WYNIK_BRAK_PODSTAW,
    "BRAK_PODSTAWY": WYNIK_BRAK_PODSTAW,
    "NIE_DOTYCZY": WYNIK_BRAK_PODSTAW,
}
_STAN_REKORDU = {
    "SPELNIA": STAN_SPELNIONE,
    "NIE_SPELNIA": STAN_NARUSZONE,
    "NIEJEDNOZNACZNY": STAN_NIEJEDNOZNACZNE,
    "NIE_OCENIONO": STAN_NIESPRAWDZONE,
    "BRAK_PODSTAWY": STAN_NIESPRAWDZONE,
    "NIE_DOTYCZY": STAN_NIE_DOTYCZY,
}
_WYNIK_TESTOWY = {"SPELNIA": 50.0, "NIE_SPELNIA": 150.0, "NIEJEDNOZNACZNY": 99.0}


def _najgorszy(stany: list[str]) -> str:
    return min(stany, key=_KOLEJNOSC_2_3.index)


@functools.cache
def _rekord(status: str, nr: int = 0) -> OcenaKryterium:
    """Rekord K o żądanym statusie, zbudowany REGUŁĄ pakietu (nie podrobiony słownik);
    rekord jest niezmienny, więc pamięć podręczna tylko skraca bieg iloczynu."""
    wynik = 50.0 if status == "BRAK_PODSTAWY" else _WYNIK_TESTOWY.get(status)
    porownanie = Porownanie(
        kryterium_id=f"test.kryterium_{nr}",
        opis_pl="Wielkość testowa nie większa od granicy",
        warunek_latex=r"x \le x_{\text{max}}",
        relacja="NIE_WIECEJ",
        wielkosc_pl="wielkość testowa",
        symbol_latex="x",
        jednostka="%",
        wynik=wynik,
        limit=None if status == "BRAK_PODSTAWY" else 100.0,
        limit_pl="granica testowa",
        braki=("wielkości nie wyznaczono w biegu",) if status == "NIE_OCENIONO" else (),
        dotyczy=status != "NIE_DOTYCZY",
        powod_stosowalnosci_pl=(
            "element poza zakresem kryterium" if status == "NIE_DOTYCZY" else "dotyczy obiektu"
        ),
    )
    ocena = ocena_porownania(
        porownanie,
        przedmiot=Przedmiot(element_ref=None, nazwa_pl=f"Element {nr}", opis_pl="Element testowy"),
        podstawa=podstawa_zalozenia("Dokument testowy", "granica testowa"),
        zdolnosc=classify_dynamic_capability("werdykt.projektowy"),
        zakres=ZakresWaznosci(rodzaj_analizy="POWER_FLOW", opis_pl="Bieg testowy"),
        slad=((OdnosnikSladu(krok="test", opis_pl="Wywód testowy"),) if wynik is not None else ()),
        niepewnosc=(
            Niepewnosc(
                wartosc=Wielkosc(wartosc=5.0, jednostka=jednostka_marginesu("%")),
                metoda_pl="pasmo niepewności testowe",
            )
            if status == "NIEJEDNOZNACZNY"
            else Niepewnosc(nie_dotyczy=True, powod_pl="wzór zamknięty")
        ),
    )
    assert ocena.status_maszynowy == status
    return ocena


def _json(rekord: OcenaKryterium) -> dict[str, Any]:
    return rekord.model_dump(mode="json")


# --- Dostawcy: wiersz widoku z rekordem i DOWOLNYM kodem statusu --------------------------


def _energia(rekordy: list[OcenaKryterium], kod: str) -> PozycjaWerdyktu:
    widok = {
        "items": [
            {
                "check_type": "VOLTAGE_DEVIATION",
                "target_id": f"b{nr}",
                "status": kod,
                "observed_value": 4.0,
                "limit_warn": 3.0,
                "limit_fail": 5.0,
                "margin_pct": -1.0,
                "unit": "%",
                "ocena": _json(rekord),
            }
            for nr, rekord in enumerate(rekordy)
        ]
    }
    return next(
        p
        for p in _pozycje_walidacji_energetycznej(widok, run_id="run-pf")
        if p.definicja.kryterium_id == KRYTERIUM_NAPIECIE
    )


def _warunki(rekordy: list[OcenaKryterium], kod: str) -> PozycjaWerdyktu:
    (rekord,) = rekordy
    widok = {
        "ocena": {
            "punkt_przylaczenia": "bus-pcc",
            "pozycje": [
                {
                    "kryterium": "moc_w_punkcie_przylaczenia",
                    "status": kod,
                    "wartosc": 1.0,
                    "wymagana": 2.0,
                    "jednostka": "MW",
                    "opis_pl": "Moc w punkcie przyłączenia.",
                    "ocena": _json(rekord),
                }
            ],
        }
    }
    return next(
        p
        for p in _pozycje_warunkow_przylaczenia(widok, run_id="run-pf")
        if p.definicja.kryterium_id == KRYTERIUM_PWP_MOC
    )


def _cieplna(rekordy: list[OcenaKryterium], kod: str) -> PozycjaWerdyktu:
    widok = {
        "ocena": {
            "items": [
                {
                    "branch_id": f"cab-{nr}",
                    "status": kod,
                    "i2t_a2s": 1.0e6,
                    "i2t_dopuszczalne_a2s": 2.0e6,
                    "ocena": _json(rekord),
                }
                for nr, rekord in enumerate(rekordy)
            ]
        }
    }
    return _pozycja_cieplna(widok, run_id="run-sc")


def _wiarygodnosc(rekordy: list[OcenaKryterium], kod: str) -> PozycjaWerdyktu:
    widok = {
        "items": [
            {
                "target_id": f"b{nr}",
                "element_id": f"b{nr}",
                "status": kod,
                "ikss_ka": 8.0,
                "upper_ka": 50.0,
                "lower_ka": 0.1,
                "ocena": _json(rekord),
            }
            for nr, rekord in enumerate(rekordy)
        ]
    }
    return _pozycja_wiarygodnosci(widok, run_id="run-sc")


def _der(rekordy: list[OcenaKryterium], kod: str) -> PozycjaWerdyktu:
    return _pozycja_der_sn(
        {
            "source_ref": "gen-pv",
            "source_name": "PV 1",
            "pozycje": [
                {
                    "check_id": f"napiecie_sn_{nr}",
                    "kategoria": "walidacja_D1",
                    "status": kod,
                    "code": "der_sn.test",
                    "message_pl": "Kontrola doborowa toru.",
                    "ocena": _json(rekord),
                }
                for nr, rekord in enumerate(rekordy)
            ],
        }
    )


_Fabryka = Callable[[list[OcenaKryterium], str], PozycjaWerdyktu]

#: Dostawca → (fabryka pozycji, kod najlepszy, kod najgorszy) — kody zastane dostawcy.
_DOSTAWCY: dict[str, tuple[_Fabryka, str, str]] = {
    "walidacja_energetyczna": (_energia, "PASS", "FAIL"),
    "warunki_przylaczenia": (_warunki, "PASS", "FAIL"),
    "wytrzymalosc_cieplna": (_cieplna, "PASS", "FAIL"),
    "wiarygodnosc_ik": (_wiarygodnosc, CREDIBLE, OUT_OF_RANGE),
    "dobory_der_sn": (_der, "PASS", "FAIL"),
}


@pytest.mark.parametrize("kod_najlepszy", [True, False], ids=["kod_najlepszy", "kod_najgorszy"])
@pytest.mark.parametrize("status", sorted(_WYNIK_REKORDU))
@pytest.mark.parametrize("dostawca", sorted(_DOSTAWCY))
def test_wynik_elementu_i_pozycji_to_projekcja_rekordu_nie_kodu_dostawcy(
    dostawca: str, status: str, kod_najlepszy: bool
) -> None:
    fabryka, najlepszy, najgorszy = _DOSTAWCY[dostawca]
    rekord = _rekord(status)
    pozycja = fabryka([rekord], najlepszy if kod_najlepszy else najgorszy)

    (element,) = pozycja.elementy
    assert element.wynik == _WYNIK_REKORDU[status]
    assert element.ocena == rekord
    assert element.wniosek_pl == rekord.wyjasnienie.zdanie_pl
    assert pozycja.stan == _STAN_REKORDU[status]
    # Rekord rozstrzygający pozycji JEST rekordem elementu, wyjaśnienie — jego wyjaśnieniem.
    assert pozycja.ocena is element.ocena
    assert pozycja.wyjasnienie == rekord.wyjasnienie
    slownik = pozycja.to_dict()
    assert slownik["wyjasnienie"] == rekord.wyjasnienie.model_dump(mode="json")
    assert slownik["elementy"][0]["ocena"] == _json(rekord)


@pytest.mark.parametrize(
    "statusy",
    [
        kombinacja
        for dlugosc in (1, 2, 3)
        for kombinacja in itertools.product(
            ("SPELNIA", "NIE_SPELNIA", "NIEJEDNOZNACZNY", "NIE_OCENIONO"), repeat=dlugosc
        )
    ],
    ids=lambda statusy: "+".join(statusy),
)
@pytest.mark.parametrize(
    "dostawca",
    ["walidacja_energetyczna", "wytrzymalosc_cieplna", "wiarygodnosc_ik", "dobory_der_sn"],
)
def test_pozycja_nigdy_lepsza_niz_najgorszy_element(
    dostawca: str, statusy: tuple[str, ...]
) -> None:
    fabryka, najlepszy, _ = _DOSTAWCY[dostawca]
    pozycja = fabryka([_rekord(s, nr) for nr, s in enumerate(statusy)], najlepszy)

    oczekiwany = _najgorszy([_STAN_REKORDU[s] for s in statusy])
    assert pozycja.stan == oczekiwany, statusy
    # Predykaty parami: rekord rozstrzygający ma wynik pozycji i należy do jej elementów.
    assert any(e.ocena is pozycja.ocena for e in pozycja.elementy)
    assert _STAN_REKORDU[pozycja.ocena.status_maszynowy] == oczekiwany
    assert pozycja.liczba_niejednoznacznych == statusy.count("NIEJEDNOZNACZNY")
    assert pozycja.liczba_naruszen == statusy.count("NIE_SPELNIA")
    assert pozycja.liczba_niesprawdzonych == statusy.count("NIE_OCENIONO")
    assert pozycja.liczba_ocenionych == len(statusy) - statusy.count("NIE_OCENIONO")


def test_pozycja_odrzuca_rekord_rozstrzygajacy_niezgodny_z_elementami() -> None:
    """Rekord rozstrzygający o innym wyniku niż pozycja albo spoza jej elementów = błąd."""
    pozycja = _energia([_rekord("SPELNIA", 0), _rekord("NIE_SPELNIA", 1)], "PASS")
    spelniony = next(e for e in pozycja.elementy if e.wynik == WYNIK_SPELNIA)
    with pytest.raises(AssertionError, match="różni się od wyniku pozycji"):
        dataclasses.replace(pozycja, ocena=spelniony.ocena)
    with pytest.raises(AssertionError, match="nie jest rekordem żadnego elementu"):
        dataclasses.replace(pozycja, ocena=_rekord("NIE_SPELNIA", 7))


@pytest.mark.parametrize(
    ("status", "uwaga", "ostrzezenia"),
    [("SPELNIA", True, 1), ("NIE_SPELNIA", False, 0), ("NIE_OCENIONO", False, 0)],
)
def test_ostrzezenie_dostawcy_tylko_przy_rekordzie_spelnionym(
    status: str, uwaga: bool, ostrzezenia: int
) -> None:
    pozycja = _energia([_rekord(status)], "WARNING")
    (element,) = pozycja.elementy
    assert (element.uwaga_pl is not None) is uwaga
    assert pozycja.liczba_ostrzezen == ostrzezenia


# ---------------------------------------------------------------------------
# Iloczyn: niejednoznaczność × brak podstawy × brak danych × naruszenie (§2.3 kontraktu)
# ---------------------------------------------------------------------------


def _pozycja_spelniona() -> PozycjaWerdyktu:
    return _energia([_rekord("SPELNIA")], "PASS")


def _pozycja_niejednoznaczna() -> PozycjaWerdyktu:
    return _der([_rekord("NIEJEDNOZNACZNY")], "PASS")


def _pozycja_bez_podstawy() -> PozycjaWerdyktu:
    return _warunki([_rekord("BRAK_PODSTAWY")], "PASS")


def _pozycja_bez_danych() -> PozycjaWerdyktu:
    """Wytrzymałość cieplna bez żadnej gałęzi w biegu — pozycja bez elementów (brak danych)."""
    return _pozycja_cieplna({"ocena": {"items": []}}, run_id="run-sc")


def _pozycja_naruszona() -> PozycjaWerdyktu:
    return _cieplna([_rekord("NIE_SPELNIA")], "PASS")


@pytest.mark.parametrize(
    ("niejednoznacznosc", "brak_podstawy", "brak_danych", "naruszenie"),
    list(itertools.product((False, True), repeat=4)),
    ids=lambda flaga: "T" if flaga else "F",
)
def test_werdykt_calosciowy_nigdy_lepszy_niz_najgorsza_pozycja(
    niejednoznacznosc: bool, brak_podstawy: bool, brak_danych: bool, naruszenie: bool
) -> None:
    pozycje = [_pozycja_spelniona()]
    if niejednoznacznosc:
        pozycje.append(_pozycja_niejednoznaczna())
    if brak_podstawy:
        pozycje.append(_pozycja_bez_podstawy())
    if brak_danych:
        pozycje.append(_pozycja_bez_danych())
    if naruszenie:
        pozycje.append(_pozycja_naruszona())
    oczekiwane_stany = {
        _pozycja_niejednoznaczna: STAN_NIEJEDNOZNACZNE,
        _pozycja_bez_podstawy: STAN_NIESPRAWDZONE,
        _pozycja_bez_danych: STAN_NIESPRAWDZONE,
        _pozycja_naruszona: STAN_NARUSZONE,
    }
    for fabryka, stan in oczekiwane_stany.items():
        assert fabryka().stan == stan, fabryka.__name__

    werdykt = WerdyktProjektowy(
        case_id="c-iloczyn", model_hash="hash", pozycje=tuple(pozycje), zrodla=()
    )
    oczekiwany = _najgorszy([p.stan for p in pozycje])
    assert werdykt.werdykt == oczekiwany
    if naruszenie:
        assert werdykt.werdykt == STAN_NARUSZONE
    elif niejednoznacznosc:
        assert werdykt.werdykt == STAN_NIEJEDNOZNACZNE
    elif brak_podstawy or brak_danych:
        assert werdykt.werdykt == STAN_NIESPRAWDZONE
    else:
        assert werdykt.werdykt == STAN_SPELNIONE
    # Wyjaśnienie werdyktu = wyjaśnienie PIERWSZEJ pozycji o stanie werdyktu (rejestr).
    pierwsza = next(p for p in pozycje if p.stan == oczekiwany)
    assert werdykt.pozycja_rozstrzygajaca is pierwsza
    assert werdykt.wyjasnienie == pierwsza.wyjasnienie
    slownik = werdykt.to_dict()
    assert slownik["kryterium_rozstrzygajace"] == pierwsza.definicja.kryterium_id
    assert slownik["wyjasnienie"] == pierwsza.wyjasnienie.model_dump(mode="json")

    podsumowanie = werdykt.podsumowanie
    assert podsumowanie["niejednoznaczne"] == int(niejednoznacznosc)
    assert podsumowanie["naruszone"] == int(naruszenie)
    assert podsumowanie["niesprawdzone"] == int(brak_podstawy) + int(brak_danych)
    assert podsumowanie["spelnione"] == 1
    ocena = werdykt.ocena
    elementy = [element for pozycja in pozycje for element in pozycja.elementy]
    assert ocena["niejednoznaczny"] == int(niejednoznacznosc)
    assert ocena["oceniono"] + ocena["brak_podstaw"] == len(elementy)
    assert ocena["oceniono"] == ocena["spelnia"] + ocena["nie_spelnia"] + ocena["niejednoznaczny"]


def test_komplet_pozycji_nie_dotyczy_to_brak_podstawy_nie_spelnienie() -> None:
    pozycja = _pozycja_der_sn(None)
    assert pozycja.stan == STAN_NIE_DOTYCZY
    assert pozycja.ocena.status_maszynowy == "NIE_DOTYCZY"
    assert pozycja.wyjasnienie.zdanie_pl.strip()
    sam = WerdyktProjektowy(case_id="c", model_hash="h", pozycje=(pozycja,), zrodla=())
    assert sam.werdykt == STAN_NIESPRAWDZONE
    assert sam.wyjasnienie == pozycja.wyjasnienie
    spelniona = _pozycja_spelniona()
    z_spelniona = WerdyktProjektowy(
        case_id="c", model_hash="h", pozycje=(pozycja, spelniona), zrodla=()
    )
    assert z_spelniona.werdykt == STAN_SPELNIONE
    assert z_spelniona.wyjasnienie == spelniona.wyjasnienie
