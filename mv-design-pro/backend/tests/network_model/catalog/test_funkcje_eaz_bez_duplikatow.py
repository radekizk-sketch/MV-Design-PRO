"""Każda funkcja EAZ raz, jedna nomenklatura — słownik i KAŻDY zestaw funkcji szablonów pól.

Decyzja architekta 2026-10-30 (karta UX-04/POLE-LINIOWE-WZORZEC): blok przekaźnika pola Z.10
pokazywał „79 · SCO" i „SPZ/SCO" — SPZ (79) i SCO po dwa razy, w dwóch nomenklaturach (numer
IEEE obok skrótu krajowego tej samej funkcji). Deduplikacja ma być u ŹRÓDŁA — w słowniku
`funkcje_eaz` i w zestawach szablonów — nie w renderze.

Inwentarz klasy (ten sam mechanizm „jedna funkcja pod kilkoma kodami" w danych profilu EAZ):
* kod złożony z oznaczeń innych funkcji („SPZ/SCO" = SPZ 79 + SCO) — Z.10, Z.11, Z.11.1 (po trzy
  wykonania łączników), Z.17;
* kod-agregat kryteriów stojący obok tych kryteriów („anti-islanding" = 27/59/81U/81O/81R) —
  pola źródłowe PV, FW, BESS;
* klucz-nazwa funkcji, która ma numer IEEE („Buchholz" 63, „temp" 26, „ciśnienie" 63P) — pole
  transformatorowe.

Iloczyn cech: KAŻDY szablon rejestru × KAŻDA klasa pola (brak, odbiorcze, mieszane, dedykowane)
× KAŻDY stan warunku funkcji (bez i ze źródłem 3U₀) + zestawy ról bez szablonu i pola pomiaru
napięcia Z.17. Detektor duplikatów przypięty iniekcjami na danych syntetycznych (dawne kody).
"""

from __future__ import annotations

import itertools
import re

import pytest
from network_model.catalog.bay_templates import (
    FUNKCJE_EAZ_POLA_POMIARU_NAPIECIA_Z17,
    FUNKCJE_EAZ_ROLI_BEZ_SZABLONU,
    KLASY_POLA_LINIOWEGO,
    WARUNEK_ZRODLA_U0,
    funkcje_eaz_szablonu,
    list_bay_templates,
)
from network_model.catalog.funkcje_eaz import FUNKCJE_EAZ, FunkcjaEaz
from network_model.catalog.obwody_wtorne_pola import OBWODY_WTORNE_WYKONANIA_POLA

#: Rozdzielacze nazwy złożonej: „SPZ/SCO", „SPZ po SCO".
_ROZDZIELACZ_ZLOZENIA = re.compile(r"\s*/\s*|\s+po\s+")


def _czesci(tekst: str) -> list[str]:
    return [c for c in _ROZDZIELACZ_ZLOZENIA.split(tekst.strip()) if c]


def duplikaty_semantyczne(
    kody: list[str] | tuple[str, ...], slownik: dict[str, FunkcjaEaz]
) -> list[str]:
    """Pary kodów jednego zestawu, które nazywają tę samą funkcję: ten sam kod dwa razy, ten sam
    numer IEEE, to samo oznaczenie z rysunku, albo kod/oznaczenie złożone (z „/" lub „po")
    z kodu lub oznaczenia innej funkcji zestawu (dawne „SPZ/SCO" obok 79 i SCO)."""
    wynik: list[str] = []
    for kod in sorted({k for k in kody if list(kody).count(k) > 1}):
        wynik.append(f"{kod}: powtórzony kod")
    wpisy = [slownik[k] for k in dict.fromkeys(kody)]
    for a, b in itertools.combinations(wpisy, 2):
        if a.ansi is not None and a.ansi == b.ansi:
            wynik.append(f"{a.kod}↔{b.kod}: ten sam numer IEEE {a.ansi}")
        if a.oznaczenie_pl == b.oznaczenie_pl:
            wynik.append(f"{a.kod}↔{b.kod}: to samo oznaczenie {a.oznaczenie_pl!r}")
        for zlozony, inny in ((a, b), (b, a)):
            nazwy_innego = {inny.kod, inny.oznaczenie_pl}
            for tekst in (zlozony.kod, zlozony.oznaczenie_pl):
                czesci = _czesci(tekst)
                if len(czesci) > 1 and nazwy_innego & set(czesci):
                    wynik.append(f"{inny.kod}↔{zlozony.kod}: {tekst!r} zawiera {inny.kod}")
    return sorted(set(wynik))


def _zestawy_szablonow() -> list[tuple[str, list[str]]]:
    zestawy: list[tuple[str, list[str]]] = []
    for szablon in list_bay_templates():
        klasy: tuple[str | None, ...] = (
            (None, *KLASY_POLA_LINIOWEGO) if szablon.wykonanie_pola is not None else (None,)
        )
        for klasa, warunki in itertools.product(klasy, (frozenset(), {WARUNEK_ZRODLA_U0})):
            kody = funkcje_eaz_szablonu(szablon.template_id, klasa, warunki)
            assert kody is not None
            opis_warunku = "ze źródłem 3U₀" if warunki else "bez źródła 3U₀"
            zestawy.append((f"{szablon.template_id} × {klasa} × {opis_warunku}", kody))
        zestawy.append((f"{szablon.template_id} × zestaw rysunku", list(szablon.funkcje_eaz)))
    for rola, kody in sorted(FUNKCJE_EAZ_ROLI_BEZ_SZABLONU.items()):
        zestawy.append((f"rola bez szablonu {rola}", list(kody)))
    zestawy.append(("pole pomiaru napięcia Z.17", list(FUNKCJE_EAZ_POLA_POMIARU_NAPIECIA_Z17)))
    return zestawy


ZESTAWY = _zestawy_szablonow()


def test_iloczyn_obejmuje_kazdy_szablon_i_kazda_klase() -> None:
    """Warunek wstępny iloczynu: każdy szablon rejestru i każda klasa pola liniowego GPZ."""
    nazwy = [n for n, _ in ZESTAWY]
    for szablon in list_bay_templates():
        assert any(n.startswith(f"{szablon.template_id} × ") for n in nazwy), szablon.template_id
    pola_gpz = [s for s in list_bay_templates() if s.wykonanie_pola is not None]
    assert len(pola_gpz) == 9  # Z.10, Z.11.1, Z.11 × trzy wykonania łączników
    for klasa in KLASY_POLA_LINIOWEGO:
        assert sum(f"× {klasa} ×" in n for n in nazwy) == 2 * len(pola_gpz)


@pytest.mark.parametrize("nazwa,kody", ZESTAWY, ids=[n for n, _ in ZESTAWY])
def test_zestaw_szablonu_bez_duplikatow_semantycznych(nazwa: str, kody: list[str]) -> None:
    assert all(k in FUNKCJE_EAZ for k in kody), (nazwa, kody)
    assert duplikaty_semantyczne(kody, FUNKCJE_EAZ) == [], nazwa


def naruszenie_nomenklatury(wpis: FunkcjaEaz) -> str | None:
    """Kod = numer IEEE C37.2, gdy funkcja go ma; bez numeru — skrót krajowy, który jest
    słowem oznaczenia z rysunku. Kod spoza tych dwóch postaci (klucz-nazwa przy numerze, kod
    złożony z oznaczeń innych funkcji, kod-agregat o innej nazwie niż oznaczenie) — naruszenie."""
    if wpis.ansi is not None:
        return None if wpis.kod == wpis.ansi else f"{wpis.kod}: kod inny niż numer {wpis.ansi}"
    if wpis.kod in re.split(r"[\s/]+", wpis.oznaczenie_pl):
        return None
    return f"{wpis.kod}: kod nie jest skrótem z oznaczenia {wpis.oznaczenie_pl!r}"


def test_slownik_jedna_nomenklatura() -> None:
    assert [n for w in FUNKCJE_EAZ.values() if (n := naruszenie_nomenklatury(w))] == []


@pytest.mark.parametrize(
    "wpis",
    [
        # Dawne wpisy słownika sprzed decyzji 2026-10-30 — każdy jest naruszeniem.
        FunkcjaEaz("Buchholz", "Buchholz", "63", "n", "TECHNOLOGICZNE", "p"),
        FunkcjaEaz("temp", "temperatura", "26", "n", "TECHNOLOGICZNE", "p"),
        FunkcjaEaz("ciśnienie", "ciśnienie", "63P", "n", "TECHNOLOGICZNE", "p"),
        FunkcjaEaz("anti-islanding", "LoM", None, "n", "ZABEZPIECZENIE", "p"),
        FunkcjaEaz("SPZ/SCO", "SPZ po SCO", None, "n", "AUTOMATYKA", "p"),
    ],
    ids=["Buchholz", "temp", "ciśnienie", "anti-islanding", "SPZ/SCO"],
)
def test_nomenklatura_odrzuca_dawne_klucze(wpis: FunkcjaEaz) -> None:
    assert naruszenie_nomenklatury(wpis) is not None


def test_slownik_bez_duplikatow_semantycznych() -> None:
    """Cały słownik jak jeden zestaw: żaden wpis nie powtarza numeru, oznaczenia ani nie jest
    złożeniem innych wpisów."""
    assert duplikaty_semantyczne(list(FUNKCJE_EAZ), FUNKCJE_EAZ) == []


def test_obwody_wtorne_jedno_powiazanie_na_funkcje() -> None:
    """Obwody wtórne wzorców: funkcja raz (dawne osobne powiązanie „SPZ/SCO" obok „SCO")."""
    for wykonanie, obwody in OBWODY_WTORNE_WYKONANIA_POLA.items():
        funkcje = [p.funkcja for p in obwody.powiazania]
        assert len(funkcje) == len(set(funkcje)), wykonanie
        assert duplikaty_semantyczne(funkcje, FUNKCJE_EAZ) == [], wykonanie
        sco = next(p for p in obwody.powiazania if p.funkcja == "SCO")
        # Jedna funkcja SCO niesie trzy obwody okrężne rysunku: SCO1, SCO2 i SCO/SPZ.
        assert [w.sygnal for w in sco.wejscia] == ["SCO1", "SCO2", "SCO/SPZ"], wykonanie
        assert "ZW" in sco.wyjscia, wykonanie


def test_spz_i_spze_to_dwie_funkcje_rysunku() -> None:
    """79 (SPZ, tSPZ) i SPZE (tE) to dwa osobne bloki rysunku s.90/s.91 o różnych pobudzeniach —
    nie duplikat: SPZ po wyłączeniu od zabezpieczeń linii, SPZE po wyłączeniu od zabezpieczeń
    transformatora (obwód „Wył. od zab. TR")."""
    for wykonanie in ("Z11_1", "Z11"):
        obwody = {p.funkcja: p for p in OBWODY_WTORNE_WYKONANIA_POLA[wykonanie].powiazania}
        assert obwody["79"].blok_rysunku != obwody["SPZE"].blok_rysunku
        assert {w.sygnal for w in obwody["79"].wejscia} == {"Odstawienie SPZ"}
        assert {w.sygnal for w in obwody["SPZE"].wejscia} == {"Wył. od zab. TR"}


def _wpis(kod: str, oznaczenie: str, ansi: str | None) -> FunkcjaEaz:
    return FunkcjaEaz(kod, oznaczenie, ansi, "nazwa", "AUTOMATYKA", "podstawa")


@pytest.mark.parametrize(
    "dodatki,kody,oczekiwane",
    [
        # Dawny kod złożony obok obu funkcji, z których się składał (79↔SPZ, SCO).
        (
            [_wpis("SPZ/SCO", "SPZ po SCO", None)],
            ["79", "SCO", "SPZ/SCO"],
            {"79↔SPZ/SCO", "SCO↔SPZ/SCO"},
        ),
        # Ten sam numer IEEE pod kluczem-nazwą („Buchholz") i pod numerem.
        ([_wpis("Buchholz", "Buchholz", "63")], ["63", "Buchholz"], {"63↔Buchholz"}),
        # To samo oznaczenie z rysunku pod dwoma kodami (dawne „df/dt" obok 81R).
        ([_wpis("df/dt", "df/dt", None)], ["81R", "df/dt"], {"81R↔df/dt"}),
        # Powtórzony kod.
        ([], ["79", "79"], {"79"}),
    ],
)
def test_detektor_wykrywa_dawne_duplikaty(
    dodatki: list[FunkcjaEaz], kody: list[str], oczekiwane: set[str]
) -> None:
    slownik = {**FUNKCJE_EAZ, **{w.kod: w for w in dodatki}}
    znalezione = {d.split(":")[0] for d in duplikaty_semantyczne(kody, slownik)}
    assert oczekiwane <= znalezione, znalezione


def test_zestawy_archetypow_harnessu_jedna_nomenklatura() -> None:
    """Dane profilu EAZ archetypów stacji OZE (harness `station-rozdzielnia`,
    `tests/reference_networks/station_archetype_substrate.py`) to ten sam mechanizm co szablony
    pól: zestaw interfejsu KAŻDEGO typu maszyny × słownik i brak duplikatów semantycznych. Dawne
    zestawy niosły „df/dt" (= 81R) i agregat „anti-islanding" (= 27/59/81U/81O/81R) obok kryteriów.
    Zestawy z rysunku wykonawczego Buk 1 (dok. 1.18) niosą oznaczenia krajowe tego dokumentu
    i nie są zestawami kodów słownika — ich spójność przypina test towarzysza
    (`ozeGates.test.tsx`, iloczyn archetyp × pole)."""
    from tests.reference_networks.station_archetype_substrate import _PROTECTION_BY_MACHINE

    assert set(_PROTECTION_BY_MACHINE) == {"IBG", "SYNCHRONOUS", "ASYNCHRONOUS", "MIXED", "DFIG"}
    for typ, kody in _PROTECTION_BY_MACHINE.items():
        assert [k for k in kody if k not in FUNKCJE_EAZ] == [], typ
        assert duplikaty_semantyczne(kody, FUNKCJE_EAZ) == [], typ
        # Ochrona od pracy wyspowej = kryteria w zestawie (LoM rozpoznaje 81R).
        assert {"27", "59", "81U", "81O", "81R"} <= set(kody), typ
