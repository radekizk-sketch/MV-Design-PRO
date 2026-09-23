"""Serializer rekordu werdyktu do bloku dokumentu formalnego (§10) — JEDEN dla raportu,
certyfikatu i wniosku do OSD.

Blok jest listą pozycji (etykieta pozycji, treść) w kolejności §10. Pozycja „Ocena" niesie
etykietę Z REKORDU (wyliczoną przez ``werdykt.etykiety``) — ten moduł nie ma własnego
mapowania statusu na etykietę. Pozycja „Wyjaśnienie" niesie DOSŁOWNIE ``wyjasnienie.zdanie_pl``,
a pozycje „Zastrzeżenia" — dosłownie zastrzeżenia rekordu (T13: interfejs i dokument pokazują to
samo zdanie i te same zastrzeżenia). Pozycja „Dowód" podaje przydatność dowodową właściwą dla
poziomu rekordu (K — ``StatusDowodu.przydatnosc_dowodowa``; W —
``decyzja.przydatnosc_dowodu_wymagania``, dla dowodu łączonego liczona ze składowych) i domenę
walidacji biegu. Pozycje listowe (czego brakuje, zastrzeżenia, powody
niepełności, dane przyjęte, ślad) rozwijają się w jedną pozycję na element, w kolejności rekordu;
pozycje bez treści (np. brak przyczyny dla kryterium spełnionego) są pomijane. Blok wymagania
zawiera po swoich pozycjach bloki ocen składowych, każdy poprzedzony nagłówkiem
„Kryterium składowe".
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from werdykt.decyzja import przydatnosc_dowodu_wymagania
from werdykt.kontrakt import (
    METODY_OBLICZENIOWE,
    SUFIKS_STANU_KONCOWEGO,
    Kryterium,
    LimitKryterium,
    Margines,
    Niepewnosc,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Relacja,
    StatusDowodu,
    Stosowalnosc,
    Tekst,
    WynikKryterium,
    WynikWymagania,
    ZakresWaznosci,
)
from werdykt.wyjasnienie import (
    NAZWA_METODY_PL,
    NAZWA_RODZAJU_PODSTAWY_PL,
    format_liczba,
    format_wielkosc,
    opis_danej,
)

POZYCJA_WYMAGANIE = "Wymaganie"
POZYCJA_PRZEDMIOT = "Przedmiot"
POZYCJA_OCENA = "Ocena"
POZYCJA_STOSOWALNOSC = "Stosowalność"
POZYCJA_SPOSOB_WYKAZANIA = "Sposób wykazania"
POZYCJA_POKRYCIE = "Pokrycie programu badań"
POZYCJA_KRYTERIA_NARUSZONE = "Kryteria naruszone"
POZYCJA_NAJBLIZEJ_GRANICY = "Kryterium najbliżej granicy"
POZYCJA_KRYTERIUM = "Kryterium"
POZYCJA_WARUNEK_LATEX = "Warunek (LaTeX)"
POZYCJA_WARUNEK_WSTEPNY = "Warunek wstępny"
POZYCJA_WYNIK = "Wynik"
POZYCJA_LIMIT = "Limit"
POZYCJA_MARGINES = "Margines"
POZYCJA_DEFINICJA_MARGINESU = "Definicja marginesu (LaTeX)"
POZYCJA_NIEPEWNOSC = "Niepewność"
POZYCJA_STAN_KONCOWY = "Stan końcowy"
POZYCJA_WYJASNIENIE = "Wyjaśnienie"
POZYCJA_PRZYCZYNA = "Przyczyna"
POZYCJA_CZEGO_BRAKUJE = "Czego brakuje"
POZYCJA_ZASTRZEZENIA = "Zastrzeżenia"
POZYCJA_PODSTAWA = "Podstawa"
POZYCJA_DOWOD = "Dowód"
POZYCJA_KOMPLETNOSC = "Kompletność dowodu"
POZYCJA_POWOD_NIEPELNOSCI = "Powód niepełności"
POZYCJA_STATUS_MODELU = "Status modelu"
POZYCJA_STATUS_DANYCH = "Status danych"
POZYCJA_DANA_PRZYJETA = "Dana przyjęta"
POZYCJA_ZAKRES = "Zakres ważności"
POZYCJA_SLAD = "Ślad"
POZYCJA_KRYTERIUM_SKLADOWE = "Kryterium składowe"

_SYMBOL_RELACJI: dict[Relacja, str] = {"NIE_WIECEJ": "≤", "NIE_MNIEJ": "≥"}


class PozycjaBloku(BaseModel):
    """Jedna pozycja bloku dokumentu formalnego: etykieta pozycji i treść."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    etykieta_pl: Tekst
    tresc_pl: Tekst


def _pozycja(etykieta_pozycji: str, tresc: str) -> PozycjaBloku:
    return PozycjaBloku(etykieta_pl=etykieta_pozycji, tresc_pl=tresc)


def _podstawa(podstawa: PodstawaWymagania) -> str:
    czesci = [
        f"dokument: „{podstawa.dokument}”",
        f"wydanie: {podstawa.wydanie if podstawa.wydanie is not None else 'nie wskazano'}",
        "jednostka redakcyjna: "
        + (
            podstawa.jednostka_redakcyjna
            if podstawa.jednostka_redakcyjna is not None
            else "nie wskazano"
        ),
        f"rodzaj: {NAZWA_RODZAJU_PODSTAWY_PL[podstawa.rodzaj]}",
        f"stan źródła: {podstawa.status}",
    ]
    if podstawa.uwagi_pl is not None:
        czesci.append(f"uwagi: {podstawa.uwagi_pl}")
    return "; ".join(czesci)


def _stosowalnosc(stosowalnosc: Stosowalnosc) -> str:
    czesci = [f"{'dotyczy' if stosowalnosc.dotyczy else 'nie dotyczy'}: {stosowalnosc.powod_pl}"]
    if stosowalnosc.typ_modulu is not None:
        czesci.append(f"typ modułu: {stosowalnosc.typ_modulu}")
    if stosowalnosc.technologia is not None:
        czesci.append(f"technologia: {stosowalnosc.technologia}")
    if stosowalnosc.modul_istniejacy is not None:
        czesci.append(f"moduł {'istniejący' if stosowalnosc.modul_istniejacy else 'nowy'} (art. 4)")
    elif stosowalnosc.typ_modulu is not None:
        czesci.append("status nowy/istniejący modułu nieustalony")
    if stosowalnosc.warunek_wstepny_nieuruchomiony:
        czesci.append("warunek wstępny kryterium nie wystąpił w scenariuszu")
    if stosowalnosc.podstawa is not None:
        czesci.append(f"podstawa stosowalności — {_podstawa(stosowalnosc.podstawa)}")
    return "; ".join(czesci)


def _wynik(wynik: WynikKryterium | None, relacja: Relacja) -> str:
    if wynik is None:
        return "nie wyznaczono"
    if relacja == "LOGICZNE":
        tresc = (
            f"{wynik.wielkosc_pl}: {wynik.punkt_krytyczny_pl} "
            f"(wartość logiczna {format_wielkosc(wynik.wartosc)})"
        )
    else:
        tresc = f"{wynik.wielkosc_pl}: {format_wielkosc(wynik.wartosc)}"
        if wynik.punkt_krytyczny_pl is not None:
            tresc += f"; punkt krytyczny: {wynik.punkt_krytyczny_pl}"
    if wynik.chwila_s is not None:
        tresc += f"; chwila t = {format_liczba(wynik.chwila_s)} s"
    return f"{tresc}; metoda: {NAZWA_METODY_PL[wynik.metoda]}"


def _limit(limit: LimitKryterium | None, relacja: Relacja) -> str:
    if relacja == "LOGICZNE":
        return "kryterium logiczne — bez limitu skalarnego (podstawa w pozycji „Podstawa”)"
    if limit is None:
        return "brak limitu i jego podstawy"
    if limit.wartosc is not None:
        wartosc = f"{_SYMBOL_RELACJI.get(relacja, '')} {format_wielkosc(limit.wartosc)}".strip()
    elif limit.pasmo is not None:
        wartosc = f"pasmo od {format_wielkosc(limit.pasmo[0])} do {format_wielkosc(limit.pasmo[1])}"
    else:
        punkty = "; ".join(
            f"t = {format_liczba(p.t_s)} s: {format_liczba(p.wartosc)} {limit.jednostka}"
            for p in limit.obwiednia or ()
        )
        rodzaj = "dolna" if relacja == "OBWIEDNIA_DOLNA" else "górna"
        wartosc = f"obwiednia {rodzaj}: {punkty}"
    czesci = [wartosc, f"podstawa — {_podstawa(limit.podstawa)}"]
    if limit.zakres_stosowalnosci_pl is not None:
        czesci.append(f"zakres stosowalności: {limit.zakres_stosowalnosci_pl}")
    if limit.wersja_profilu is not None:
        czesci.append(f"wersja profilu: {limit.wersja_profilu}")
    return "; ".join(czesci)


def _margines(margines: Margines | None) -> str:
    if margines is None:
        return "nie wyznaczono (brak wyniku albo limitu)"
    if margines.wartosc is None:
        return f"niedefiniowalny — {margines.powod_pl}"
    czesci = [format_wielkosc(margines.wartosc, znak=True)]
    if margines.punkt_pl is not None:
        czesci.append(f"punkt: {margines.punkt_pl}")
    if margines.skala is not None and margines.wzgledny is not None:
        czesci.append(f"skala: {format_wielkosc(margines.skala)} ({margines.skala_rodzaj})")
        czesci.append(f"margines względny: {format_liczba(margines.wzgledny * 100.0, znak=True)} %")
    else:
        czesci.append("margines względny: brak skali")
    return "; ".join(czesci)


def _niepewnosc(niepewnosc: Niepewnosc) -> str:
    if niepewnosc.wartosc is not None:
        return f"±{format_wielkosc(niepewnosc.wartosc)} — {niepewnosc.metoda_pl}"
    return f"nie dotyczy — {niepewnosc.powod_pl}"


def _domena(dowod: StatusDowodu) -> str | None:
    if dowod.metoda not in METODY_OBLICZENIOWE:
        return None
    if dowod.w_domenie_walidacji is None or dowod.domena_pl is None:
        return "domena walidacji: nie zadeklarowano"
    polozenie = "bieg w domenie" if dowod.w_domenie_walidacji else "bieg poza domeną"
    return f"domena walidacji: {dowod.domena_pl} ({polozenie})"


def _dowod(dowod: StatusDowodu, przydatnosc: bool) -> str:
    czesci = [
        f"metoda: {NAZWA_METODY_PL[dowod.metoda]}",
        f"poziom: {dowod.poziom.label_pl}",
        f"rodzaj twierdzenia: {dowod.rodzaj_twierdzenia.label_pl}",
        f"przydatność dowodowa: {'tak' if przydatnosc else 'nie'}",
    ]
    domena = _domena(dowod)
    if domena is not None:
        czesci.append(domena)
    czesci.append(f"odniesienie: {dowod.odniesienie if dowod.odniesienie is not None else 'brak'}")
    return "; ".join(czesci)


def _warunek_wstepny(kryterium: Kryterium) -> str | None:
    if kryterium.warunek_wstepny_pl is None:
        return None
    tresc = kryterium.warunek_wstepny_pl
    if kryterium.warunek_wstepny_podstawa is not None:
        tresc += f"; podstawa — {_podstawa(kryterium.warunek_wstepny_podstawa)}"
    return tresc


def _zakres(zakres: ZakresWaznosci) -> str:
    czesci = [zakres.opis_pl]
    for nazwa, wartosc in (
        ("rodzaj analizy", zakres.rodzaj_analizy),
        ("technologia", zakres.technologia),
        ("model urządzenia", zakres.model_urzadzenia),
        ("symetria zakłócenia", zakres.symetria_zaklocenia),
        ("regulator", zakres.regulator),
    ):
        if wartosc is not None:
            czesci.append(f"{nazwa}: {wartosc}")
    if zakres.parametry_sieci:
        czesci.append(
            "parametry sieci: " + "; ".join(opis_danej(p) for p in zakres.parametry_sieci)
        )
    if zakres.ograniczniki:
        czesci.append(f"ograniczniki: {', '.join(zakres.ograniczniki)}")
    if zakres.wykluczenia:
        czesci.append(f"wykluczenia: {', '.join(zakres.wykluczenia)}")
    return "; ".join(czesci)


def _slad(odnosnik: OdnosnikSladu) -> str:
    tresc = f"{odnosnik.krok}: {odnosnik.opis_pl}"
    if odnosnik.run_id is not None:
        tresc += f"; bieg {odnosnik.run_id}"
    if odnosnik.wersja_silnika is not None:
        tresc += f"; wersja silnika {odnosnik.wersja_silnika}"
    return tresc


def _pozycje_wspolne(
    *,
    przyczyna: str | None,
    czego_brakuje: tuple[str, ...],
    zastrzezenia: tuple[str, ...],
    zdanie: str,
) -> list[PozycjaBloku]:
    pozycje = [_pozycja(POZYCJA_WYJASNIENIE, zdanie)]
    if przyczyna is not None:
        pozycje.append(_pozycja(POZYCJA_PRZYCZYNA, przyczyna))
    pozycje.extend(_pozycja(POZYCJA_CZEGO_BRAKUJE, brak) for brak in czego_brakuje)
    pozycje.extend(_pozycja(POZYCJA_ZASTRZEZENIA, z) for z in zastrzezenia)
    return pozycje


def _pozycje_dowodu(
    dowod: StatusDowodu,
    przydatnosc: bool,
    kompletnosc: str,
    powody: tuple[str, ...],
) -> list[PozycjaBloku]:
    pozycje = [
        _pozycja(POZYCJA_DOWOD, _dowod(dowod, przydatnosc)),
        _pozycja(POZYCJA_KOMPLETNOSC, kompletnosc),
    ]
    pozycje.extend(_pozycja(POZYCJA_POWOD_NIEPELNOSCI, powod) for powod in powody)
    pozycje.append(_pozycja(POZYCJA_STATUS_MODELU, dowod.status_modelu))
    pozycje.append(_pozycja(POZYCJA_STATUS_DANYCH, dowod.status_danych.stan))
    pozycje.extend(
        _pozycja(POZYCJA_DANA_PRZYJETA, opis_danej(dana))
        for dana in dowod.status_danych.dane_przyjete
    )
    return pozycje


def blok_kryterium(rekord: OcenaKryterium) -> list[PozycjaBloku]:
    """Blok dokumentu dla rekordu K w kolejności §10."""
    relacja = rekord.kryterium.relacja
    przedmiot = rekord.przedmiot
    opis_przedmiotu = f"{przedmiot.nazwa_pl} — {przedmiot.opis_pl}"
    if przedmiot.element_ref is not None:
        opis_przedmiotu += f" (element {przedmiot.element_ref})"
    pozycje = [
        _pozycja(POZYCJA_PRZEDMIOT, opis_przedmiotu),
        _pozycja(POZYCJA_OCENA, rekord.etykieta.etykieta_pl),
        _pozycja(POZYCJA_STOSOWALNOSC, _stosowalnosc(rekord.stosowalnosc)),
        _pozycja(
            POZYCJA_KRYTERIUM,
            f"{rekord.kryterium.opis_pl} [{rekord.kryterium_id}]; relacja: {relacja}",
        ),
    ]
    if rekord.kryterium.warunek_latex.strip():
        pozycje.append(_pozycja(POZYCJA_WARUNEK_LATEX, rekord.kryterium.warunek_latex))
    warunek_wstepny = _warunek_wstepny(rekord.kryterium)
    if warunek_wstepny is not None:
        pozycje.append(_pozycja(POZYCJA_WARUNEK_WSTEPNY, warunek_wstepny))
    pozycje.extend(
        (
            _pozycja(POZYCJA_WYNIK, _wynik(rekord.wynik, relacja)),
            _pozycja(POZYCJA_LIMIT, _limit(rekord.limit, relacja)),
            _pozycja(POZYCJA_MARGINES, _margines(rekord.margines)),
        )
    )
    if rekord.margines is not None and rekord.margines.definicja_latex is not None:
        pozycje.append(_pozycja(POZYCJA_DEFINICJA_MARGINESU, rekord.margines.definicja_latex))
    pozycje.append(_pozycja(POZYCJA_NIEPEWNOSC, _niepewnosc(rekord.niepewnosc)))
    wyjasnienie = rekord.wyjasnienie
    pozycje.extend(
        _pozycje_wspolne(
            przyczyna=wyjasnienie.przyczyna_pl,
            czego_brakuje=wyjasnienie.czego_brakuje,
            zastrzezenia=wyjasnienie.zastrzezenia,
            zdanie=wyjasnienie.zdanie_pl,
        )
    )
    pozycje.append(_pozycja(POZYCJA_PODSTAWA, _podstawa(rekord.podstawa)))
    pozycje.extend(
        _pozycje_dowodu(
            rekord.dowod,
            rekord.dowod.przydatnosc_dowodowa,
            rekord.kompletnosc_dowodu,
            rekord.powody_niepelnosci,
        )
    )
    pozycje.append(_pozycja(POZYCJA_ZAKRES, _zakres(rekord.zakres_waznosci)))
    pozycje.extend(_pozycja(POZYCJA_SLAD, _slad(odnosnik)) for odnosnik in rekord.slad)
    return pozycje


def blok_wymagania(rekord: WynikWymagania) -> list[PozycjaBloku]:
    """Blok dokumentu dla rekordu W w kolejności §10, a po nim bloki ocen składowych."""
    pozycje = [
        _pozycja(POZYCJA_WYMAGANIE, f"{rekord.nazwa_pl} [{rekord.wymaganie_id}]"),
        _pozycja(POZYCJA_OCENA, rekord.etykieta.etykieta_pl),
        _pozycja(POZYCJA_STOSOWALNOSC, _stosowalnosc(rekord.stosowalnosc)),
        _pozycja(POZYCJA_SPOSOB_WYKAZANIA, NAZWA_METODY_PL[rekord.sposob_wykazania]),
        _pozycja(POZYCJA_POKRYCIE, f"{rekord.pokrycie_programu} — {rekord.pokrycie_programu_pl}"),
    ]
    if rekord.kryteria_naruszone:
        pozycje.append(_pozycja(POZYCJA_KRYTERIA_NARUSZONE, ", ".join(rekord.kryteria_naruszone)))
    if rekord.kryterium_najblizej_granicy is not None:
        pozycje.append(_pozycja(POZYCJA_NAJBLIZEJ_GRANICY, rekord.kryterium_najblizej_granicy))
    pozycje.extend(
        _pozycja(
            POZYCJA_STAN_KONCOWY,
            f"{ocena.etykieta.etykieta_pl}: {ocena.wyjasnienie.zdanie_pl}",
        )
        for ocena in rekord.oceny_skladowe
        if ocena.kryterium_id.endswith(SUFIKS_STANU_KONCOWEGO)
    )
    wyjasnienie = rekord.wyjasnienie
    pozycje.extend(
        _pozycje_wspolne(
            przyczyna=wyjasnienie.przyczyna_pl,
            czego_brakuje=wyjasnienie.czego_brakuje,
            zastrzezenia=wyjasnienie.zastrzezenia,
            zdanie=wyjasnienie.zdanie_pl,
        )
    )
    pozycje.append(_pozycja(POZYCJA_PODSTAWA, _podstawa(rekord.podstawa)))
    pozycje.extend(
        _pozycje_dowodu(
            rekord.dowod,
            przydatnosc_dowodu_wymagania(rekord.dowod, rekord.oceny_skladowe),
            rekord.kompletnosc_dowodu,
            rekord.powody_niepelnosci,
        )
    )
    pozycje.append(_pozycja(POZYCJA_ZAKRES, _zakres(rekord.zakres_waznosci)))
    pozycje.extend(_pozycja(POZYCJA_SLAD, _slad(odnosnik)) for odnosnik in rekord.slad)
    for ocena in rekord.oceny_skladowe:
        pozycje.append(_pozycja(POZYCJA_KRYTERIUM_SKLADOWE, ocena.kryterium_id))
        pozycje.extend(blok_kryterium(ocena))
    return pozycje
