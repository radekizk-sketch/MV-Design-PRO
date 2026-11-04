"""Reguła spójności sterownika zabezpieczeń w modelu — JEDNA dla każdego pisarza i odczytu.

Karta OCHRONA-JEDNO-ZRODLO (dyrektywa właściciela 2026-11-04: „jedna konfiguracja w całym
systemie"). Sterownik zabezpieczeń pola (`enm.models.ProtectionAssignment`) niesie funkcje
z rejestru (`network_model.catalog.funkcje_eaz`), grupy nastaw 1–4, macierz wyzwoleń i wiązania
wejść pomiarowych. Ta reguła rozstrzyga, czy zapis jest SPÓJNY; woła ją walidator modelu
(każde wczytanie migawki) i każda operacja zapisu (kod odmowy z nazwą przyczyny), więc
odczyt i zapis nie mogą się rozjechać.

Zapis przyjmuje nastawy NIEKOMPLETNE (projektant wpisuje je stopniowo — brak progu,
jednostki, charakterystyki czy zwłoki to nazwany brak gotowości oceny,
``application.analyses.protection.ocena_nadpradowa.rozwiaz_nastawy``), ale odrzuca zapis
SPRZECZNY: kod funkcji spoza rejestru, klucz nastawy spoza schematu funkcji, wartość złego
typu, wartość niedodatnią wielkości dodatniej, próg prądowy bez strony przekładnika (PZ-09),
zwłokę przy charakterystyce zależnej, mnożnik przy czasie niezależnym, powtórzoną funkcję,
grupę spoza 1–4, aktywną grupę, której nie ma, wyzwolenie funkcji, której nie ma, i wiązanie
wejścia sprzeczne z układem (przekładnik Ferrantiego bez przekładnika, otwarty trójkąt bez
przekładnika napięciowego). Sprzeczny zapis nie ma poprawnego odczytu — dawałby wynik zależny
od kolejności czytania pól.

Moduł jest liściem warstwy domeny: czyta wyłącznie rejestr funkcji (stdlib) i słowniki zapisu.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from network_model.catalog.funkcje_eaz import FUNKCJE_EAZ, FunkcjaEaz

#: Numery grup nastaw sterownika (IEC 61850 SGCB: grupy 1…N; typowy sterownik SN — cztery).
NUMERY_GRUP_NASTAW: tuple[int, ...] = (1, 2, 3, 4)

#: Klucze nastaw stopnia prądowego, których sprzeczności pilnuje reguła (PZ-09, rodzina czasu).
_KLUCZ_PROGU = "prog"
_KLUCZ_JEDNOSTKI = "jednostka_progu"
_KLUCZ_KRZYWEJ = "krzywa"
_KLUCZ_TMS = "tms"
_KLUCZ_ZWLOKI = "zwloka_s"


def etykieta_funkcji(kod: object) -> str:
    """Etykieta funkcji dla projektanta: zapis z rysunku i kod w nawiasie (rejestr funkcji)."""
    wpis = FUNKCJE_EAZ.get(str(kod))
    if wpis is None:
        return f"funkcja spoza rejestru ({kod})"
    if wpis.oznaczenie_pl == wpis.kod:
        return wpis.kod
    return f"{wpis.oznaczenie_pl} ({wpis.kod})"


def _liczba(wartosc: object) -> bool:
    return isinstance(wartosc, int | float) and not isinstance(wartosc, bool)


def bledy_wartosci(funkcja: FunkcjaEaz, klucz: str, wartosc: object) -> list[str]:
    """Sprzeczności JEDNEJ nastawy wobec schematu funkcji (puste = wartość dopuszczalna)."""
    etykieta = etykieta_funkcji(funkcja.kod)
    schemat = funkcja.schemat_nastawy(klucz)
    if schemat is None:
        return [f"Funkcja {etykieta} nie ma nastawy „{klucz}” w rejestrze funkcji."]
    if schemat.typ == "LICZBA":
        if not _liczba(wartosc):
            return [f"Funkcja {etykieta}: {schemat.nazwa_pl} musi być liczbą."]
        assert isinstance(wartosc, int | float)
        if schemat.dodatnia and float(wartosc) <= 0:
            return [f"Funkcja {etykieta}: {schemat.nazwa_pl} musi być dodatni."]
        return []
    if schemat.typ == "WYBOR":
        if not isinstance(wartosc, str) or wartosc not in schemat.wartosci:
            return [
                f"Funkcja {etykieta}: {schemat.nazwa_pl} spoza listy wyboru "
                f"({', '.join(schemat.wartosci)})."
            ]
        return []
    if not isinstance(wartosc, bool):
        return [f"Funkcja {etykieta}: {schemat.nazwa_pl} musi być wartością logiczną."]
    return []


def bledy_nastaw_funkcji(funkcja: FunkcjaEaz, nastawy: Mapping[str, object]) -> list[str]:
    """Sprzeczności kompletu nastaw funkcji w jednej grupie (typy + reguły rodziny czasu)."""
    bledy: list[str] = []
    for klucz in sorted(nastawy):
        bledy.extend(bledy_wartosci(funkcja, klucz, nastawy[klucz]))
    etykieta = etykieta_funkcji(funkcja.kod)
    if funkcja.schemat_nastawy(_KLUCZ_JEDNOSTKI) is not None:
        if _KLUCZ_PROGU in nastawy and _KLUCZ_JEDNOSTKI not in nastawy:
            bledy.append(
                f"Funkcja {etykieta}: próg prądowy wymaga jednostki — strona wtórna albo "
                "pierwotna przekładnika."
            )
    if funkcja.schemat_nastawy(_KLUCZ_KRZYWEJ) is not None:
        krzywa = nastawy.get(_KLUCZ_KRZYWEJ)
        if krzywa == "DT" and _KLUCZ_TMS in nastawy:
            bledy.append(
                f"Funkcja {etykieta}: czas niezależny (DT) nie ma mnożnika czasowego — czas "
                "nastawia zwłoka."
            )
        if isinstance(krzywa, str) and krzywa != "DT" and _KLUCZ_ZWLOKI in nastawy:
            bledy.append(
                f"Funkcja {etykieta}: charakterystyka zależna nie ma zwłoki niezależnej — czas "
                "nastawia mnożnik czasowy."
            )
    return bledy


def _napis(wartosc: object) -> str | None:
    return wartosc.strip() if isinstance(wartosc, str) and wartosc.strip() else None


def bledy_wejsc(wejscia: Mapping[str, Any]) -> list[str]:
    """Sprzeczności wiązań wejść pomiarowych sterownika (układ filtru 3I0 i źródło 3U0)."""
    bledy: list[str] = []
    i0 = wejscia.get("i0_uklad")
    if i0 == "FERRANTI" and _napis(wejscia.get("i0_ct_ref")) is None:
        bledy.append(
            "Filtr prądu zerowego w układzie przekładnika Ferrantiego wymaga wskazania tego "
            "przekładnika."
        )
    if i0 != "FERRANTI" and _napis(wejscia.get("i0_ct_ref")) is not None:
        bledy.append(
            "Przekładnik prądu zerowego wskazuje się wyłącznie w układzie przekładnika "
            "Ferrantiego (układ Holmgreena sumuje prądy przekładników fazowych)."
        )
    u0 = wejscia.get("u0_uklad")
    if u0 == "OTWARTY_TROJKAT" and _napis(wejscia.get("u0_vt_ref")) is None:
        bledy.append(
            "Napięcie zerowe z otwartego trójkąta wymaga wskazania przekładnika napięciowego "
            "z uzwojeniem otwartego trójkąta."
        )
    if u0 != "OTWARTY_TROJKAT" and _napis(wejscia.get("u0_vt_ref")) is not None:
        bledy.append(
            "Przekładnik napięcia zerowego wskazuje się wyłącznie w układzie otwartego trójkąta."
        )
    return bledy


def bledy_sterownika(dane: Mapping[str, Any]) -> list[str]:
    """Sprzeczności zapisu sterownika (słownik w kształcie `ProtectionAssignment`).

    Puste = zapis spójny. Zdania po polsku, kolejność deterministyczna.
    """
    bledy: list[str] = []
    funkcje_wpisy = dane.get("funkcje") or []
    if not isinstance(funkcje_wpisy, Sequence) or isinstance(funkcje_wpisy, str):
        return ["Funkcje sterownika muszą być listą."]
    funkcje: dict[str, FunkcjaEaz] = {}
    for wpis in funkcje_wpisy:
        if not isinstance(wpis, Mapping):
            bledy.append("Funkcja sterownika musi być słownikiem pól.")
            continue
        ref = _napis(wpis.get("ref"))
        kod = str(wpis.get("kod") or "")
        if ref is None:
            bledy.append("Funkcja sterownika nie ma identyfikatora.")
            continue
        if ref in funkcje:
            bledy.append(f"Funkcja „{ref}” występuje w sterowniku więcej niż raz.")
            continue
        rejestr = FUNKCJE_EAZ.get(kod)
        if rejestr is None:
            bledy.append(f"Funkcja „{ref}”: kod {kod!r} spoza rejestru funkcji.")
            continue
        funkcje[ref] = rejestr

    grupy = dane.get("grupy_nastaw") or []
    numery: set[int] = set()
    for grupa in grupy:
        if not isinstance(grupa, Mapping):
            bledy.append("Grupa nastaw musi być słownikiem pól.")
            continue
        numer = grupa.get("numer")
        if numer not in NUMERY_GRUP_NASTAW or isinstance(numer, bool):
            bledy.append(f"Grupa nastaw {numer!r} spoza grup 1–4.")
            continue
        if numer in numery:
            bledy.append(f"Grupa nastaw {numer} występuje więcej niż raz.")
            continue
        numery.add(int(numer))
        widziane: set[str] = set()
        for nastawy_funkcji in grupa.get("funkcje") or []:
            funkcja_ref = str(nastawy_funkcji.get("funkcja_ref") or "")
            if funkcja_ref in widziane:
                bledy.append(f"Grupa {numer}: nastawy funkcji „{funkcja_ref}” podano dwa razy.")
                continue
            widziane.add(funkcja_ref)
            funkcja = funkcje.get(funkcja_ref)
            if funkcja is None:
                bledy.append(f"Grupa {numer}: nastawy funkcji „{funkcja_ref}”, której nie ma.")
                continue
            wartosci: dict[str, object] = {}
            for nastawa in nastawy_funkcji.get("nastawy") or []:
                klucz = str(nastawa.get("klucz") or "")
                if klucz in wartosci:
                    bledy.append(
                        f"Grupa {numer}, funkcja {etykieta_funkcji(funkcja.kod)}: nastawa "
                        f"„{klucz}” podana dwa razy."
                    )
                    continue
                wartosci[klucz] = nastawa.get("wartosc")
            bledy.extend(
                f"Grupa {numer}: {blad}" for blad in bledy_nastaw_funkcji(funkcja, wartosci)
            )
    aktywna = dane.get("aktywna_grupa", 1)
    if aktywna not in NUMERY_GRUP_NASTAW or isinstance(aktywna, bool):
        bledy.append(f"Aktywna grupa nastaw {aktywna!r} spoza grup 1–4.")
    elif numery and aktywna not in numery:
        bledy.append(f"Aktywna grupa nastaw {aktywna} nie istnieje w sterowniku.")

    wyzwalane: set[str] = set()
    for wiersz in dane.get("macierz_wyzwolen") or []:
        funkcja_ref = str(wiersz.get("funkcja_ref") or "")
        if funkcja_ref not in funkcje:
            bledy.append(f"Macierz wyzwoleń: funkcja „{funkcja_ref}”, której nie ma.")
            continue
        if funkcja_ref in wyzwalane:
            bledy.append(f"Macierz wyzwoleń: funkcja „{funkcja_ref}” ma dwa wiersze.")
            continue
        wyzwalane.add(funkcja_ref)
        aparaty = [a for a in (wiersz.get("aparat_refs") or []) if _napis(a)]
        if not aparaty:
            bledy.append(f"Macierz wyzwoleń: funkcja „{funkcja_ref}” nie wskazuje aparatu.")
        elif len(set(aparaty)) != len(aparaty):
            bledy.append(f"Macierz wyzwoleń: funkcja „{funkcja_ref}” wskazuje aparat dwa razy.")
    wejscia = dane.get("wejscia")
    if isinstance(wejscia, Mapping):
        bledy.extend(bledy_wejsc(wejscia))
    return bledy


__all__ = [
    "NUMERY_GRUP_NASTAW",
    "bledy_nastaw_funkcji",
    "bledy_sterownika",
    "bledy_wartosci",
    "bledy_wejsc",
    "etykieta_funkcji",
]
