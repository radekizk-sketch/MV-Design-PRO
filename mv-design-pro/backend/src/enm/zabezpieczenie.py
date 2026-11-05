"""Sterownik zabezpieczeń pola — JEDYNE akcesory odczytu i pisarz z szablonu pola.

Karta OCHRONA-JEDNO-ZRODLO (dyrektywa właściciela 2026-11-04: „jedna konfiguracja w całym
systemie; zmiana nastawy w karcie pola musi aktualizować obliczenia, SLD, ocenę wytrzymałości
i raport — bez osobnych kopii i ręcznej synchronizacji"). Dane zabezpieczenia żyją WYŁĄCZNIE
w `enm.models.ProtectionAssignment` (sterownik). Każdy konsument czyta je przez funkcje tego
modułu:

* kody funkcji pola (blok przekaźnika na schemacie, karta pola, ocena pola liniowego GPZ,
  walidator) — `kody_funkcji_pola`;
* aparaty, na które działa funkcja (czas wyłączenia, kaskada usuwania, koordynacja) —
  `aparaty_funkcji`, `aparaty_sterownika`;
* nastawy funkcji w grupie efektywnej (ocena nadprądowa, czas zadziałania, LoM, raporty) —
  `numer_grupy_efektywnej`, `nastawy_funkcji`;
* dostępność wejść pomiarowych i funkcje mierzące z aparatu (schemat, ocena) —
  `wejscia_dostepne`, `brakujace_wejscia`, `funkcje_zasilane_z_aparatu`,
  `funkcje_wylaczajace_aparat`;
* przekładnia przekładnika prądowego dla nastaw (zaczep z karty UX-04) —
  `przekladnik_pradowy`.

Pisarz `ustaw_funkcje_pola` zakłada albo aktualizuje sterownik pola z zestawu funkcji szablonu
(budowa pola, zmiana szablonu albo klasy pola, powiązanie źródła 3U₀) — jedna droga dla każdego
pisarza rekordu pola (`enm.pola.dodaj_pole`, `enm.pola.zmien_pole`).

Akcesory przyjmują rekord jako model albo słownik migawki (operacje domenowe pracują na
słownikach) — jedna reguła dla obu postaci. Zero fizyki: przekładnia to dana tabliczki,
przeliczenie nastawy na stronę pierwotną robi warstwa analiz (`network_model.pochodne`).
"""

from __future__ import annotations

import re
from collections.abc import Collection, Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from network_model.catalog.funkcje_eaz import FUNKCJE_EAZ, FunkcjaEaz
from network_model.catalog.obwody_wtorne_pola import (
    RODZAJ_APARATU_WEJSCIA,
    ObwodyWtornePola,
)
from network_model.catalog.przekladniki import zaczepy_przekladnika
from network_model.catalog.wartosci_robocze import rozstrzygnij_zaczep_przekladnika

if TYPE_CHECKING:
    from enm.models import ObwodWtorny

__all__ = [
    "ODNOSNIK_STEROWNIKA_POLA",
    "PrzekladnikPradowy",
    "aparaty_funkcji",
    "aparaty_sterownika",
    "brakujace_wejscia",
    "funkcje_wylaczajace_aparat",
    "funkcje_zasilane_z_aparatu",
    "kody_funkcji_pola",
    "kody_funkcji_sterownika",
    "nazwa_sterownika",
    "nastawy_funkcji",
    "numer_grupy_efektywnej",
    "przekladnik_pradowy",
    "ref_aparatu_wyzwalanego",
    "referencja_sterownika_pola",
    "sterownik_pola",
    "sterowniki",
    "ustaw_funkcje_pola",
    "ustaw_zestaw_funkcji",
    "zapisz_nastawy_funkcji",
    "pochodzenie_nastaw_funkcji",
    "funkcja_rejestru",
    "ref_zrodla_u0_pola",
    "ZACHOWAJ_ZRODLO_U0",
    "wejscia_dostepne",
    "wejscia_funkcji_w_aparacie",
    "naruszenia_referencji_sterownika",
    "IndeksReferencjiSterownikow",
    "RODZAJE_APARATU_WYZWALANEGO",
    "RODZAJE_WEJSCIA_STEROWNIKA",
    "indeks_referencji_sterownikow",
    "NARUSZENIE_APARAT",
    "NARUSZENIE_DRUGI_STEROWNIK",
    "NARUSZENIE_POLE",
    "NARUSZENIE_PRZEKLADNIK",
]

#: Sufiks identyfikatora sterownika pola zakładanego z szablonu (`<bay_ref>/sterownik`) —
#: deterministyczny: ta sama budowa pola daje ten sam identyfikator.
ODNOSNIK_STEROWNIKA_POLA = "sterownik"


def _pole(obiekt: object, nazwa: str, domyslna: object = None) -> object:
    if isinstance(obiekt, Mapping):
        return obiekt.get(nazwa, domyslna)
    return getattr(obiekt, nazwa, domyslna)


def _lista(obiekt: object, nazwa: str) -> Sequence[object]:
    """Pole-lista obu postaci modelu (pusta krotka: brak pola albo wartość nie-lista)."""
    wartosc = _pole(obiekt, nazwa)
    return wartosc if isinstance(wartosc, list | tuple) else ()


def _liczba(wartosc: object) -> float | None:
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    return float(wartosc)


def _obwod_wtorny(wartosc: object) -> ObwodWtorny | None:
    """Obwód wtórny przekładnika w postaci modelu (słownik migawki walidowany kontraktem)."""
    from enm.models import ObwodWtorny

    if wartosc is None or isinstance(wartosc, ObwodWtorny):
        return wartosc
    return ObwodWtorny.model_validate(wartosc)


def _napis(wartosc: object) -> str | None:
    return wartosc.strip() if isinstance(wartosc, str) and wartosc.strip() else None


def sterowniki(enm: object) -> list[Any]:
    """Sterowniki modelu w kolejności identyfikatorów (determinizm)."""
    lista = _lista(enm, "protection_assignments")
    return sorted(lista, key=lambda s: str(_pole(s, "ref_id") or ""))


def domyslna_nazwa_sterownika_pola(pole: Mapping[str, Any]) -> str:
    """Domyślna nazwa sterownika pola — JEDNA reguła dla pisarza z szablonu pola
    (`enm.pola.zapisz_sterownik_pola`) i dla doboru urządzenia (`add_relay`): nazwa pola
    z jedynego słownika nazw (`enm.nazwy_elementow.nazwa_elementu`), nigdy identyfikator.
    """
    # Import leniwy: słownik nazw czyta pakiet `enm` (cykl przy imporcie modułu).
    from enm.nazwy_elementow import nazwa_elementu

    return f"Sterownik pola {nazwa_elementu(pole, 'bays')}"


def referencja_sterownika_pola(bay_ref: str) -> str:
    """Identyfikator sterownika zakładanego dla pola (pisarz z szablonu, `add_relay`)."""
    return f"{bay_ref}/{ODNOSNIK_STEROWNIKA_POLA}"


#: Rodzaj w domyślnej nazwie sterownika pola (``domyslna_nazwa_sterownika_pola``).
_PRZEDROSTEK_STEROWNIKA_POLA = "Sterownik pola "
_SLOWO_POLE = re.compile(r"pole(?=$|[\s·,;:()/-])", re.IGNORECASE)


def _bez_powtorzenia_rodzaju(nazwa: str) -> str:
    """Nazwa sterownika bez powtórzenia rodzaju zawartego w nazwie pola.

    Domyślna nazwa sterownika pola to „Sterownik pola <nazwa pola>”, a nazwy pól same zaczynają
    się rodzajem („Pole liniowe GPZ 1.2”) — wyjaśnienia mówiły wtedy „Sterownik pola Pole
    liniowe GPZ 1.2”. Rodzaj pada raz: „Sterownik · Pole liniowe GPZ 1.2” (wzorzec „rodzaj ·
    nazwa” reguły opisu bez powtórzeń frontu, ``ui/shared/opisBezPowtorzen.ts``). Nazwa zapisana
    w modelu zostaje bez zmian (zmiana dotyczy zapisu w wyjaśnieniach, ocenach i raportach);
    nazwa nadana przez projektanta, która nie powtarza rodzaju, przechodzi bez zmian."""
    if not nazwa.startswith(_PRZEDROSTEK_STEROWNIKA_POLA):
        return nazwa
    reszta = nazwa[len(_PRZEDROSTEK_STEROWNIKA_POLA) :]
    if _SLOWO_POLE.match(reszta) is None:
        return nazwa
    return f"Sterownik · {reszta}"


def nazwa_sterownika(enm: object, sterownik: object) -> str:
    """Nazwa sterownika w wyjaśnieniach, ocenach i raportach: nazwa z modelu, a sterownika pola
    stacji — z nazwą stacji (``<nazwa> — <stacja>``).

    Nazwy pól są jednoznaczne wyłącznie w obrębie stacji („Pole liniowe wejściowe 1" jest
    w każdej stacji magistrali), więc domyślna nazwa sterownika pola powtarza się między
    stacjami i raport koordynacji pokazywałby dwa nieodróżnialne wiersze. Stacja pochodzi
    z modelu (pole → ``substation_ref``) w chwili odczytu — nazwa zapisana w modelu zostaje
    bez zmian, a nazwa, która już zawiera nazwę stacji, nie dostaje jej drugi raz. Sterownik
    wyłącznika liniowego (bez pola) i pole bez stacji w modelu — sama nazwa z modelu.
    """
    from enm.models import EnergyNetworkModel
    from enm.nazwy_elementow import nazwa_elementu
    from enm.pola import stacja_pola

    nazwa = _bez_powtorzenia_rodzaju(nazwa_elementu(sterownik, "protection_assignments"))
    bay_ref = _napis(_pole(sterownik, "bay_ref"))
    stacja = (
        stacja_pola(enm, bay_ref)
        if bay_ref and isinstance(enm, Mapping | EnergyNetworkModel)
        else None
    )
    if stacja is None:
        return nazwa
    nazwa_stacji = nazwa_elementu(stacja, "substations")
    return nazwa if nazwa_stacji in nazwa else f"{nazwa} — {nazwa_stacji}"


def sterownik_pola(enm: object, bay_ref: str | None) -> Any | None:
    """Sterownik pola (najwyżej jeden — walidator modelu odrzuca drugi) albo ``None``."""
    if not bay_ref:
        return None
    # Wybór bez sortowania całej kolekcji (pisarze pól pytają o sterownik każdego pola przy
    # każdej operacji): przy niedozwolonym drugim sterowniku wygrywa najmniejszy identyfikator —
    # ten sam, który dałaby kolejność `sterowniki`.
    pola = [s for s in _lista(enm, "protection_assignments") if _pole(s, "bay_ref") == bay_ref]
    return min(pola, key=lambda s: str(_pole(s, "ref_id") or ""), default=None)


def _funkcje(sterownik: object) -> list[Any]:
    return list(_lista(sterownik, "funkcje"))


def kody_funkcji_sterownika(sterownik: object, *, tylko_wlaczone: bool = True) -> list[str]:
    """Kody funkcji sterownika w kolejności zapisu, bez powtórzeń (dwa stopnie tej samej
    funkcji dają jeden kod)."""
    kody: list[str] = []
    for funkcja in _funkcje(sterownik):
        if tylko_wlaczone and not _pole(funkcja, "wlaczona", True):
            continue
        kod = str(_pole(funkcja, "kod"))
        if kod not in kody:
            kody.append(kod)
    return kody


def kody_funkcji_pola(
    enm: object, bay_ref: str | None, *, tylko_wlaczone: bool = True
) -> list[str]:
    """Kody funkcji zabezpieczeń i automatyki POLA — z jego sterownika (pusta lista: pole bez
    sterownika). Jedyne źródło bloku przekaźnika, karty pola, oceny pola i walidatora.
    """
    sterownik = sterownik_pola(enm, bay_ref)
    return kody_funkcji_sterownika(sterownik, tylko_wlaczone=tylko_wlaczone) if sterownik else []


def aparaty_funkcji(sterownik: object, funkcja_ref: str) -> tuple[str, ...]:
    """Aparaty, na które działa funkcja (macierz wyzwoleń); pusta krotka = funkcja nie
    wyzwala (alarm, blokada, automatyka bez wyjścia na wyłącznik)."""
    for wiersz in _lista(sterownik, "macierz_wyzwolen"):
        if _pole(wiersz, "funkcja_ref") == funkcja_ref:
            return tuple(str(a) for a in _lista(wiersz, "aparat_refs"))
    return ()


def aparaty_sterownika(sterownik: object) -> tuple[str, ...]:
    """Wszystkie aparaty z macierzy wyzwoleń sterownika (posortowane, bez powtórzeń)."""
    wynik: set[str] = set()
    for wiersz in _lista(sterownik, "macierz_wyzwolen"):
        wynik.update(str(a) for a in _lista(wiersz, "aparat_refs"))
    return tuple(sorted(wynik))


def numer_grupy_efektywnej(sterownik: object, wybor_przypadku: int | None = None) -> int:
    """Numer grupy nastaw, którą czyta ocena: wybór przypadku (delta scenariusza, ADR-022),
    inaczej aktywna grupa bazowa sterownika."""
    if wybor_przypadku is not None:
        return int(wybor_przypadku)
    return aktywna_grupa_sterownika(sterownik)


def aktywna_grupa_sterownika(sterownik: object) -> int:
    """Aktywna grupa bazowa sterownika (pole wymagane `ProtectionAssignment.aktywna_grupa`).

    Brak pola to sprzeczność zapisu, nie grupa 1 — zastępcza liczba wskazałaby po cichu inną
    grupę nastaw, niż projektant wybrał."""
    numer = _pole(sterownik, "aktywna_grupa")
    if not isinstance(numer, int) or isinstance(numer, bool):
        raise ValueError(f"sterownik bez aktywnej grupy nastaw (odczytano {numer!r})")
    return numer


def nastawy_funkcji(
    sterownik: object, funkcja_ref: str, numer_grupy: int | None = None
) -> dict[str, Any]:
    """Nastawy funkcji w grupie (domyślnie aktywnej) — klucz schematu → wartość.

    Pusty słownik = funkcja bez nastaw w tej grupie (nazwany brak ocenia warstwa analiz).
    """
    numer = numer_grupy_efektywnej(sterownik, numer_grupy)
    for grupa in _lista(sterownik, "grupy_nastaw"):
        if _pole(grupa, "numer") != numer:
            continue
        for wpis in _lista(grupa, "funkcje"):
            if _pole(wpis, "funkcja_ref") == funkcja_ref:
                return {
                    str(_pole(n, "klucz")): _pole(n, "wartosc") for n in _lista(wpis, "nastawy")
                }
    return {}


def pochodzenie_nastaw_funkcji(
    sterownik: object, funkcja_ref: str, numer_grupy: int | None = None
) -> dict[str, str]:
    """Pochodzenie każdej nastawy funkcji w grupie (PROJEKTANT / DOBOR / WARTOSC_ROBOCZA)."""
    numer = numer_grupy_efektywnej(sterownik, numer_grupy)
    for grupa in _lista(sterownik, "grupy_nastaw"):
        if _pole(grupa, "numer") != numer:
            continue
        for wpis in _lista(grupa, "funkcje"):
            if _pole(wpis, "funkcja_ref") == funkcja_ref:
                return {
                    str(_pole(n, "klucz")): str(_pole(n, "pochodzenie") or "PROJEKTANT")
                    for n in _lista(wpis, "nastawy")
                }
    return {}


def wejscia_funkcji_w_aparacie(wejscia: object) -> dict[str, tuple[str, ...]]:
    """Wejście funkcji → aparaty, z których je zrealizowano (JEDNA reguła układów)."""
    ct = _napis(_pole(wejscia, "ct_ref"))
    vt = _napis(_pole(wejscia, "vt_ref"))
    wynik: dict[str, tuple[str, ...]] = {}
    if ct:
        wynik["I"] = (ct,)
    if vt:
        wynik["U"] = (vt,)
    i0 = _pole(wejscia, "i0_uklad")
    if i0 == "HOLMGREEN" and ct:
        wynik["3I0"] = (ct,)
    elif i0 == "FERRANTI" and _napis(_pole(wejscia, "i0_ct_ref")):
        wynik["3I0"] = (str(_napis(_pole(wejscia, "i0_ct_ref"))),)
    u0 = _pole(wejscia, "u0_uklad")
    if u0 == "OTWARTY_TROJKAT" and _napis(_pole(wejscia, "u0_vt_ref")):
        wynik["3U0"] = (str(_napis(_pole(wejscia, "u0_vt_ref"))),)
    elif u0 == "Z_NAPIEC_FAZOWYCH" and vt:
        wynik["3U0"] = (vt,)
    strona_2 = tuple(str(r) for r in _lista(wejscia, "ct_strony_2_refs") if _napis(r))
    if strona_2:
        wynik["I_STRONY_2"] = strona_2
    return wynik


def wejscia_dostepne(sterownik: object) -> frozenset[str]:
    """Wejścia sterownika zrealizowane przekładnikami (sygnał binarny ``SYGNAL`` jest
    wejściem logicznym sterownika — zawsze dostępny)."""
    return frozenset(wejscia_funkcji_w_aparacie(_pole(sterownik, "wejscia") or {})) | {"SYGNAL"}


def brakujace_wejscia(sterownik: object, kod: str) -> tuple[str, ...]:
    """Wymagane wejścia funkcji (rejestr), których sterownik nie ma przypiętych."""
    wpis = FUNKCJE_EAZ.get(kod)
    if wpis is None:
        return ()
    dostepne = wejscia_dostepne(sterownik)
    return tuple(w for w in wpis.wejscia_wymagane if w not in dostepne)


def funkcje_zasilane_z_aparatu(sterownik: object, device_ref: str) -> list[str]:
    """Kody włączonych funkcji, które mierzą z aparatu (przekładnik przypięty do ich wejścia)."""
    wejscia = wejscia_funkcji_w_aparacie(_pole(sterownik, "wejscia") or {})
    z_aparatu = {w for w, aparaty in wejscia.items() if device_ref in aparaty}
    kody: list[str] = []
    for kod in kody_funkcji_sterownika(sterownik):
        wpis = FUNKCJE_EAZ.get(kod)
        if wpis is None:
            continue
        if z_aparatu & set(wpis.wejscia_wymagane + wpis.wejscia_opcjonalne) and kod not in kody:
            kody.append(kod)
    return kody


def funkcje_wylaczajace_aparat(sterownik: object, device_ref: str | None) -> list[str]:
    """Kody włączonych funkcji, które działają na aparat (macierz wyzwoleń; ``device_ref`` —
    wynik `ref_aparatu_wyzwalanego` aparatu pola albo identyfikator gałęzi wyłącznika).
    """
    if not device_ref:
        return []
    # Kolejność = kolejność funkcji sterownika (jak `funkcje_zasilane_z_aparatu`), nie kolejność
    # wierszy macierzy — dwa odczyty tego samego sterownika mówią tym samym porządkiem.
    dzialajace = {
        str(_pole(w, "funkcja_ref"))
        for w in _lista(sterownik, "macierz_wyzwolen")
        if device_ref in (_lista(w, "aparat_refs"))
    }
    kody: list[str] = []
    for f in _funkcje(sterownik):
        kod = str(_pole(f, "kod"))
        if _pole(f, "wlaczona", True) and str(_pole(f, "ref")) in dzialajace and kod not in kody:
            kody.append(kod)
    return kody


# ---------------------------------------------------------------------------
# Przekładnik prądowy wejścia I — jedno rozstrzygnięcie przekładni dla nastaw
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PrzekladnikPradowy:
    """Przekładnik prądowy wejścia ``I`` sterownika: przekładnia dla nastaw i jej źródło.

    ``zrodlo`` — ``POMIAR`` (encja `measurements`) albo ``APARAT_POLA`` (aparat pola rodzaju
    CT; przekładnia pierwotna = wybrany zaczep albo zaczep roboczy, karta UX-04);
    ``zaczep_roboczy`` — przekładnia pierwotna jest wartością roboczą (zasada nr 4: dana
    przyjęta ``ESTIMATED`` w wyjaśnieniu oceny).
    """

    ref: str
    nazwa: str
    zrodlo: str
    ratio_primary: float
    ratio_secondary: float
    accuracy_class: str | None
    burden_va: float | None
    catalog_ref: str | None
    zaczep_roboczy: bool = False
    obwod_wtorny: ObwodWtorny | None = None


def _przekladnia_rdzenia(przekladnia: str) -> tuple[float, float] | None:
    """„200-400/5" → (400, 5) dla zapisu jednej przekładni albo None (zapis nierozpoznany)."""
    try:
        pierwotna, wtorna = przekladnia.split("/")
        return float(pierwotna.split("-")[-1]), float(wtorna)
    except (ValueError, IndexError):
        return None


def przekladnik_pradowy(enm: object, ref: str | None) -> PrzekladnikPradowy | None:
    """Przekładnik prądowy o referencji ``ref`` — z `measurements` albo z aparatów pól.

    ``None`` — referencji nie ma w modelu, wskazuje inny rodzaj aparatu albo tabliczka nie
    pozwala ustalić przekładni (wołający nazywa brak, nigdy nie zgaduje przekładni).
    """
    if not ref:
        return None
    # Import leniwy: słownik nazw czyta pakiet `enm` (cykl przy imporcie modułu).
    from enm.nazwy_elementow import nazwa_elementu

    for pomiar in _lista(enm, "measurements"):
        if _pole(pomiar, "ref_id") != ref:
            continue
        if _pole(pomiar, "measurement_type") != "CT":
            return None
        rating = _pole(pomiar, "rating") or {}
        pierwotny_a = _liczba(_pole(rating, "ratio_primary"))
        wtorny_a = _liczba(_pole(rating, "ratio_secondary"))
        if pierwotny_a is None or wtorny_a is None:
            return None
        return PrzekladnikPradowy(
            ref=ref,
            nazwa=nazwa_elementu(pomiar, "measurements"),
            zrodlo="POMIAR",
            ratio_primary=pierwotny_a,
            ratio_secondary=wtorny_a,
            accuracy_class=_napis(_pole(rating, "accuracy_class")),
            burden_va=_liczba(_pole(rating, "burden_va")),
            catalog_ref=_napis(_pole(pomiar, "catalog_ref")),
            obwod_wtorny=_obwod_wtorny(_pole(pomiar, "obwod_wtorny")),
        )
    for pole in _lista(enm, "bays"):
        for aparat in _lista(pole, "primary_devices"):
            if _pole(aparat, "device_ref") != ref:
                continue
            if _pole(aparat, "kind") != "CT":
                return None
            rdzenie = list(_lista(aparat, "rdzenie"))
            if not rdzenie:
                return None
            ochronny = next(
                (r for r in rdzenie if "P" in str(_pole(r, "klasa") or "").upper()),
                rdzenie[0],
            )
            przekladnie = [str(_pole(r, "przekladnia")) for r in rdzenie]
            zaczep = rozstrzygnij_zaczep_przekladnika(
                zaczepy_przekladnika(przekladnie),
                _liczba(_pole(aparat, "zaczep_pierwotny_a")),
            )
            rdzen = _przekladnia_rdzenia(str(_pole(ochronny, "przekladnia")))
            if rdzen is None:
                return None
            pierwotna = zaczep.wartosc if zaczep is not None else rdzen[0]
            return PrzekladnikPradowy(
                ref=ref,
                nazwa=str(
                    _pole(aparat, "designation")
                    or f"przekładnik prądowy pola {nazwa_elementu(pole, 'bays')}"
                ),
                zrodlo="APARAT_POLA",
                ratio_primary=float(pierwotna),
                ratio_secondary=rdzen[1],
                accuracy_class=_napis(_pole(ochronny, "klasa")),
                burden_va=_liczba(_pole(ochronny, "moc_va")),
                catalog_ref=_napis(_pole(aparat, "catalog_ref")),
                zaczep_roboczy=bool(zaczep is not None and zaczep.robocza),
            )
    return None


def przekladnik_pradu_zerowego(enm: object, sterownik: object) -> PrzekladnikPradowy | None:
    """Przekładnik wejścia ``3I0`` sterownika — przekładnia prądu zerowego dla nastaw funkcji
    ziemnozwarciowych (karta EWALUATORY-ZIEMNOZWARCIOWE).

    Układ Holmgreena: przekładnia przekładników fazowych ``ct_ref`` (suma prądów wtórnych).
    Przekładnik Ferrantiego: ``i0_ct_ref`` — encja ``measurements`` (przekładnik prądowy)
    albo aparat pola rodzaju ``CORE_BALANCE_CT`` z przekładnią ``przekladnia`` („100/1").
    ``None`` — wejście nieprzypięte albo przekładnia nieustalona (wołający nazywa brak).
    """
    from enm.nazwy_elementow import nazwa_elementu

    wejscia = _pole(sterownik, "wejscia") or {}
    aparaty = wejscia_funkcji_w_aparacie(wejscia).get("3I0")
    if not aparaty:
        return None
    ref = aparaty[0]
    if _pole(wejscia, "i0_uklad") == "HOLMGREEN":
        return przekladnik_pradowy(enm, ref)
    z_pomiaru = przekladnik_pradowy(enm, ref)
    if z_pomiaru is not None:
        return z_pomiaru
    for pole in _lista(enm, "bays"):
        for aparat in _lista(pole, "primary_devices"):
            if _pole(aparat, "device_ref") != ref or _pole(aparat, "kind") != "CORE_BALANCE_CT":
                continue
            przekladnia = _napis(_pole(aparat, "przekladnia"))
            rdzen = _przekladnia_rdzenia(przekladnia) if przekladnia else None
            if rdzen is None:
                return None
            return PrzekladnikPradowy(
                ref=ref,
                nazwa=str(
                    _pole(aparat, "designation")
                    or f"przekładnik Ferrantiego pola {nazwa_elementu(pole, 'bays')}"
                ),
                zrodlo="APARAT_POLA",
                ratio_primary=rdzen[0],
                ratio_secondary=rdzen[1],
                accuracy_class=None,
                burden_va=None,
                catalog_ref=_napis(_pole(aparat, "catalog_ref")),
            )
    return None


# ---------------------------------------------------------------------------
# Pisarz: sterownik pola z zestawu funkcji szablonu
# ---------------------------------------------------------------------------


def ref_aparatu_wyzwalanego(aparat: object) -> str | None:
    """Identyfikator wyłącznika w macierzy wyzwoleń — JEDNA reguła dla pisarzy i odczytu.

    Wyłącznik pola wskazujący gałąź modelu (``linked_ref`` — gałąź ``breaker``, której stan
    i pozycję katalogu czytają rozpływ, zwarcia i czas własny) wchodzi do macierzy
    identyfikatorem tej gałęzi; wyłącznik pola bez gałęzi — identyfikatorem aparatu pola.
    Wyłącznik liniowy bez pola jest gałęzią, więc jego identyfikator jest tym samym kluczem.
    """
    return _napis(_pole(aparat, "linked_ref")) or _napis(_pole(aparat, "device_ref"))


def _aparaty_rodzaju(aparaty: Sequence[Mapping[str, Any]], rodzaj: str) -> list[str]:
    if rodzaj == "CB":
        return [
            str(ref_aparatu_wyzwalanego(a))
            for a in aparaty
            if a.get("kind") == "CB" and ref_aparatu_wyzwalanego(a)
        ]
    return [
        str(a["device_ref"]) for a in aparaty if a.get("kind") == rodzaj and a.get("device_ref")
    ]


def _wiazania_z_obwodow(
    aparaty: Sequence[Mapping[str, Any]],
    obwody: ObwodyWtornePola | None,
    kody: Collection[str],
) -> tuple[dict[str, Any], dict[str, list[str]]]:
    """Wejścia sterownika i macierz wyzwoleń (kod → aparaty) z obwodów wtórnych wzorca pola.

    Wejście funkcji wskazuje aparat pola po OZNACZENIU i RODZAJU (`RODZAJ_APARATU_WEJSCIA`),
    wyłącznik wykonawczy — wyłącznik (`CB`) o oznaczeniu powiązania. Pole bez obwodów wzorca:
    jedyny przekładnik danego rodzaju pola jest wejściem, jedyny wyłącznik pola — aparatem
    wyzwalanym funkcji zabezpieczeniowych (pole z dwoma aparatami tego samego rodzaju bez
    wzorca nie dostaje wiązania — brak nazywa ocena, nie domysł)."""
    po_oznaczeniu: dict[tuple[str, str], str] = {}
    for a in aparaty:
        if a.get("designation") and a.get("device_ref"):
            ref = ref_aparatu_wyzwalanego(a) if a.get("kind") == "CB" else a["device_ref"]
            po_oznaczeniu[(str(a["designation"]), str(a.get("kind")))] = str(ref)
    wejscia: dict[str, Any] = {}
    wyzwolenia: dict[str, list[str]] = {}
    obecne = set(kody)
    if obwody is not None:
        for p in obwody.powiazania:
            if p.funkcja not in obecne:
                continue
            if p.wylacznik is not None:
                wylacznik_obwodu = po_oznaczeniu.get((p.wylacznik, "CB"))
                if wylacznik_obwodu is not None:
                    wyzwolenia.setdefault(p.funkcja, []).append(wylacznik_obwodu)
            zerowe = "3I0" in FUNKCJE_EAZ[p.funkcja].wejscia_wymagane
            for w in p.wejscia:
                if w.aparat is None:
                    continue
                ref = po_oznaczeniu.get((w.aparat, RODZAJ_APARATU_WEJSCIA[w.rodzaj]))
                if ref is None:
                    continue
                if w.rodzaj == "RDZEN_CT":
                    wejscia.setdefault("ct_ref", ref)
                    if zerowe:
                        wejscia.setdefault("i0_uklad", "HOLMGREEN")
                elif w.rodzaj == "PRZEKLADNIK_FERRANTIEGO":
                    wejscia["i0_uklad"] = "FERRANTI"
                    wejscia["i0_ct_ref"] = ref
                elif w.rodzaj == "UZWOJENIE_VT":
                    wejscia.setdefault("vt_ref", ref)
        return wejscia, wyzwolenia
    ct = _aparaty_rodzaju(aparaty, "CT")
    vt = _aparaty_rodzaju(aparaty, "VT")
    ferranti = _aparaty_rodzaju(aparaty, "CORE_BALANCE_CT")
    cb = _aparaty_rodzaju(aparaty, "CB")
    if len(ct) == 1:
        wejscia["ct_ref"] = ct[0]
    if len(vt) == 1:
        wejscia["vt_ref"] = vt[0]
    zerowe = any("3I0" in FUNKCJE_EAZ[k].wejscia_wymagane for k in obecne if k in FUNKCJE_EAZ)
    if zerowe and len(ferranti) == 1:
        wejscia["i0_uklad"] = "FERRANTI"
        wejscia["i0_ct_ref"] = ferranti[0]
    elif zerowe and "ct_ref" in wejscia:
        wejscia["i0_uklad"] = "HOLMGREEN"
    if len(cb) == 1:
        for kod in kody:
            if kod in FUNKCJE_EAZ and FUNKCJE_EAZ[kod].rodzaj == "ZABEZPIECZENIE":
                wyzwolenia[kod] = [cb[0]]
    return wejscia, wyzwolenia


# ---------------------------------------------------------------------------
# Pisarze struktury sterownika — JEDNA reguła dla operacji domenowych i pisarza z szablonu
# ---------------------------------------------------------------------------


def ustaw_zestaw_funkcji(
    sterownik: dict[str, Any],
    kody: Iterable[str],
    *,
    wyzwolenia: Mapping[str, Sequence[str]] | None = None,
) -> None:
    """Zestaw funkcji sterownika = ``kody`` (kolejność podana, bez powtórzeń).

    Funkcja, która zostaje, zachowuje identyfikator, stan włączenia, nastawy we wszystkich
    grupach i wiersz macierzy wyzwoleń; funkcja usunięta znika razem z nastawami i wierszem
    (predykat parami: zbiór funkcji, zbiór nastaw i zbiór wierszy macierzy wyznacza JEDNA
    lista ``funkcje``). ``wyzwolenia`` (kod → aparaty) dopisuje wiersz funkcji, która go
    jeszcze nie ma — wiersz zapisany wcześniej ma pierwszeństwo."""
    lista: list[str] = []
    for kod in kody:
        if str(kod) not in lista:
            lista.append(str(kod))
    stare = {str(f["kod"]): f for f in sterownik.get("funkcje") or []}
    funkcje = [
        dict(stare[kod]) if kod in stare else {"ref": kod, "kod": kod, "wlaczona": True}
        for kod in lista
    ]
    refy = {f["ref"] for f in funkcje}
    sterownik["funkcje"] = funkcje
    sterownik["grupy_nastaw"] = [
        {
            **g,
            "funkcje": [n for n in g.get("funkcje") or [] if n.get("funkcja_ref") in refy],
        }
        for g in sterownik.get("grupy_nastaw") or []
    ]
    macierz = [w for w in sterownik.get("macierz_wyzwolen") or [] if w.get("funkcja_ref") in refy]
    zapisane = {w["funkcja_ref"] for w in macierz}
    for funkcja in funkcje:
        aparaty_kodu = (wyzwolenia or {}).get(funkcja["kod"])
        if aparaty_kodu and funkcja["ref"] not in zapisane:
            macierz.append({"funkcja_ref": funkcja["ref"], "aparat_refs": list(aparaty_kodu)})
    sterownik["macierz_wyzwolen"] = macierz


def zapisz_nastawy_funkcji(
    sterownik: dict[str, Any],
    *,
    numer_grupy: int,
    funkcja_ref: str,
    nastawy: Mapping[str, Any],
    pochodzenie: str = "PROJEKTANT",
) -> None:
    """Zastąp nastawy funkcji w grupie (``None`` = nastawa zdjęta — nazwany brak).

    Grupy nieistniejącej przybywa (numer 1–4 sprawdza reguła `bledy_sterownika`); grupy
    trzymane w kolejności numerów (determinizm migawki)."""
    grupy = [dict(g) for g in sterownik.get("grupy_nastaw") or []]
    grupa = next((g for g in grupy if g.get("numer") == numer_grupy), None)
    if grupa is None:
        grupa = {"numer": numer_grupy, "funkcje": []}
        grupy.append(grupa)
    wpisy = [dict(w) for w in grupa.get("funkcje") or [] if w.get("funkcja_ref") != funkcja_ref]
    lista = [
        {"klucz": str(k), "wartosc": v, "pochodzenie": pochodzenie}
        for k, v in sorted(nastawy.items())
        if v is not None
    ]
    if lista:
        wpisy.append({"funkcja_ref": funkcja_ref, "nastawy": lista})
    porzadek = {str(f.get("ref")): i for i, f in enumerate(sterownik.get("funkcje") or [])}
    grupa["funkcje"] = sorted(wpisy, key=lambda w: porzadek.get(str(w["funkcja_ref"]), 10**6))
    sterownik["grupy_nastaw"] = sorted(grupy, key=lambda g: int(g["numer"]))


#: Rodzaje aparatu pola, które przerywają prąd zwarciowy — cel macierzy wyzwoleń (wyłącznik).
RODZAJE_APARATU_WYZWALANEGO: frozenset[str] = frozenset({"CB"})

#: Wejście sterownika → rodzaje przekładnika, którym można je zrealizować (aparat pola
#: `BayPrimaryDevice.kind` albo pomiar `Measurement`: CT → ``CT``, CT w układzie Ferrantiego →
#: ``CORE_BALANCE_CT``, VT → ``VT``). JEDNA reguła dla walidatora modelu
#: (`naruszenia_referencji_sterownika`) i pisarza z szablonu (`ustaw_funkcje_pola`): wejście
#: wskazujące aparat innego rodzaju jest naruszeniem, a pisarz go nie zachowuje.
RODZAJE_WEJSCIA_STEROWNIKA: Mapping[str, frozenset[str]] = {
    "ct_ref": frozenset({"CT"}),
    "i0_ct_ref": frozenset({"CORE_BALANCE_CT"}),
    "vt_ref": frozenset({"VT", "PHASE_TO_PHASE_VT"}),
    "u0_vt_ref": frozenset({"VT"}),
    "ct_strony_2_refs": frozenset({"CT"}),
}


def _rodzaj_pomiaru(pomiar: object) -> str | None:
    rodzaj = _pole(pomiar, "measurement_type")
    if rodzaj == "CT":
        return "CORE_BALANCE_CT" if _pole(pomiar, "ct_arrangement") == "ferranti" else "CT"
    return "VT" if rodzaj == "VT" else None


def _referencje_aparatow(
    enm: object, aparaty: Iterable[Any] = ()
) -> tuple[set[str], dict[str, str]]:
    """Wyłączniki (gałąź ``breaker`` albo aparat pola rodzaju wyłącznika, regułą
    `ref_aparatu_wyzwalanego`) oraz rodzaj każdego aparatu pola i pomiaru (referencja →
    rodzaj; wejście sprawdza rodzaj regułą `RODZAJE_WEJSCIA_STEROWNIKA`) modelu i ``aparaty``.
    """
    wylaczniki = {
        str(_pole(g, "ref_id"))
        for g in _lista(enm, "branches")
        if _pole(g, "type") == "breaker" and _pole(g, "ref_id")
    }
    przekladniki: dict[str, str] = {}
    for m in _lista(enm, "measurements"):
        rodzaj = _rodzaj_pomiaru(m)
        if rodzaj is not None and _pole(m, "ref_id"):
            przekladniki[str(_pole(m, "ref_id"))] = rodzaj
    wszystkie = [a for pole in _lista(enm, "bays") for a in _lista(pole, "primary_devices")]
    for aparat in [*wszystkie, *aparaty]:
        rodzaj = _napis(_pole(aparat, "kind"))
        if rodzaj in RODZAJE_APARATU_WYZWALANEGO and (cel := ref_aparatu_wyzwalanego(aparat)):
            wylaczniki.add(cel)
        if rodzaj:
            for klucz in ("device_ref", "linked_ref"):
                if _pole(aparat, klucz):
                    przekladniki[str(_pole(aparat, klucz))] = str(rodzaj)
    return wylaczniki, przekladniki


def _niezgodne_wejscia(
    wejscia: Mapping[str, Any], przekladniki: Mapping[str, str]
) -> list[tuple[str, str]]:
    """Wejścia ``(klucz, ref)`` wskazujące aparat, którego nie ma albo który nie jest
    przekładnikiem rodzaju dopuszczonego dla wejścia (`RODZAJE_WEJSCIA_STEROWNIKA`)."""
    wynik: list[tuple[str, str]] = []
    for klucz, dopuszczone in RODZAJE_WEJSCIA_STEROWNIKA.items():
        wartosc = _pole(wejscia, klucz)
        refy = wartosc if isinstance(wartosc, list | tuple) else [wartosc]
        for ref in refy:
            if _napis(ref) and przekladniki.get(str(ref)) not in dopuszczone:
                wynik.append((klucz, str(ref)))
    return wynik


#: Znacznik „źródło 3U₀ bez zmian" pisarza `ustaw_funkcje_pola` (zmiana szablonu albo aparatów
#: nie dotyka deklaracji projektanta).
ZACHOWAJ_ZRODLO_U0: object = object()


def ustaw_funkcje_pola(
    enm: dict[str, Any],
    *,
    bay_ref: str,
    kody: Iterable[str] | None,
    aparaty: Sequence[Mapping[str, Any]],
    obwody: ObwodyWtornePola | None,
    zrodlo_u0_ref: str | None | object = ZACHOWAJ_ZRODLO_U0,
    nazwa_domyslna: str,
    aparaty_wymienione: Iterable[str] = (),
) -> dict[str, Any] | None:
    """Załóż albo zaktualizuj sterownik pola z zestawu funkcji szablonu — JEDYNY pisarz.

    Funkcje sterownika = ``kody`` (kolejność szablonu). Funkcja, która zostaje, zachowuje swój
    identyfikator, stan włączenia i nastawy we wszystkich grupach; funkcja usunięta znika
    razem z nastawami i wierszem macierzy wyzwoleń. Wiązania wejść i wiersze macierzy
    wyzwoleń funkcji z szablonu pochodzą z obwodów wtórnych wzorca (`_wiazania_z_obwodow`);
    wiązanie nadane wcześniej (dobór urządzenia `add_relay`) ma pierwszeństwo przed
    wiązaniem z szablonu, dopóki wskazuje ten sam aparat: wiązanie do aparatu wymienionego
    (``aparaty_wymienione`` — `enm.pola._aparaty_wymienione`) albo do aparatu, którego rodzaj
    nie pasuje do wejścia (`RODZAJE_WEJSCIA_STEROWNIKA`), wraca z wzorca. ``zrodlo_u0_ref`` —
    przekładnik napięciowy z otwartym trójkątem (źródło 3U₀ potwierdzone przez projektanta,
    `enm.zrodlo_napiecia_zerowego`). Pozycji katalogu urządzenia ten pisarz nie nadaje — dobór
    urządzenia to wyłącznie `add_relay` (brama katalogowa).

    ``kody=None`` — zestaw bez zmian (zmiana aparatów albo szablonu przelicza wyłącznie
    wiązania).

    Pusty zestaw bez źródła 3U₀ i brak sterownika — nic (pole bez funkcji nie dostaje pustego
    sterownika); pusty zestaw przy istniejącym sterowniku — sterownik zostaje bez funkcji
    (urządzenie z katalogu nie znika przez zmianę szablonu). Zwraca rekord sterownika albo
    ``None``.
    """
    lista = enm.setdefault("protection_assignments", [])
    sterownik = next((s for s in lista if s.get("bay_ref") == bay_ref), None)
    lista_kodow: list[str] = []
    zrodlo_kodow = (
        kody
        if kody is not None
        else [str(f.get("kod")) for f in (sterownik or {}).get("funkcje") or []]
    )
    for kod in zrodlo_kodow:
        if str(kod) not in lista_kodow:
            lista_kodow.append(str(kod))
    if zrodlo_u0_ref is ZACHOWAJ_ZRODLO_U0:
        zrodlo_u0_ref = ref_zrodla_u0_pola(enm, bay_ref)
    if sterownik is None and not lista_kodow and not zrodlo_u0_ref:
        return None
    wejscia_szablonu, wyzwolenia = _wiazania_z_obwodow(aparaty, obwody, lista_kodow)
    if zrodlo_u0_ref:
        wejscia_szablonu["u0_uklad"] = "OTWARTY_TROJKAT"
        wejscia_szablonu["u0_vt_ref"] = zrodlo_u0_ref
    if sterownik is None:
        sterownik = {
            "ref_id": referencja_sterownika_pola(bay_ref),
            "name": nazwa_domyslna,
            "bay_ref": bay_ref,
            "wejscia": {},
            "funkcje": [],
            "grupy_nastaw": [],
            "aktywna_grupa": 1,
            "macierz_wyzwolen": [],
            "is_enabled": True,
        }
        lista.append(sterownik)
    wylaczniki, przekladniki = _referencje_aparatow(enm, aparaty)
    wymienione = set(aparaty_wymienione)
    wylaczniki -= wymienione
    for ref in wymienione:
        przekladniki.pop(ref, None)
    # Wiersz macierzy wskazujący aparat, którego już nie ma albo który nie jest wyłącznikiem
    # (wymiana wyposażenia pola — identyfikator aparatu z numeru kolejnego może wskazać teraz
    # inny aparat), traci ten aparat; pusty wiersz znika i — gdy wzorzec wiąże funkcję — wraca
    # z aparatem wzorca.
    macierz: list[dict[str, Any]] = []
    for wiersz in sterownik.get("macierz_wyzwolen") or []:
        refy = [r for r in wiersz.get("aparat_refs") or [] if r in wylaczniki]
        if refy:
            macierz.append({**wiersz, "aparat_refs": refy})
    sterownik["macierz_wyzwolen"] = macierz
    ustaw_zestaw_funkcji(sterownik, lista_kodow, wyzwolenia=wyzwolenia)
    # Wejście wskazujące aparat, którego nie ma albo który nie jest przekładnikiem rodzaju
    # wejścia (ta sama reguła co walidator modelu), nie zostaje — wraca wiązanie wzorca.
    wejscia = dict(sterownik.get("wejscia") or {})
    for klucz, ref in _niezgodne_wejscia(wejscia, przekladniki):
        wartosc = wejscia.get(klucz)
        if isinstance(wartosc, list):
            wejscia[klucz] = [r for r in wartosc if r != ref]
        else:
            wejscia.pop(klucz, None)
    if not wejscia.get("ct_strony_2_refs"):
        wejscia.pop("ct_strony_2_refs", None)
    if wejscia.get("i0_uklad") == "FERRANTI" and not wejscia.get("i0_ct_ref"):
        wejscia.pop("i0_uklad")
    if wejscia.get("u0_uklad") == "OTWARTY_TROJKAT" and not wejscia.get("u0_vt_ref"):
        wejscia.pop("u0_uklad")
    for klucz, wartosc in wejscia_szablonu.items():
        if not wejscia.get(klucz):
            wejscia[klucz] = wartosc
    if zrodlo_u0_ref:
        # Deklaracja projektanta (albo bieżąca, gdy bez zmian) wygrywa z wcześniejszym
        # wiązaniem — zmiana źródła 3U₀ przepina wejście.
        wejscia["u0_uklad"] = "OTWARTY_TROJKAT"
        wejscia["u0_vt_ref"] = zrodlo_u0_ref
    if zrodlo_u0_ref is None and wejscia.get("u0_uklad") == "OTWARTY_TROJKAT":
        # Źródło 3U₀ zdjęte przez projektanta — wiązanie znika razem z deklaracją.
        wejscia.pop("u0_uklad", None)
        wejscia.pop("u0_vt_ref", None)
    sterownik["wejscia"] = wejscia
    return sterownik


def ref_zrodla_u0_pola(enm: object, bay_ref: str | None) -> str | None:
    """Przekładnik napięciowy otwartego trójkąta przypięty do wejścia 3U₀ sterownika pola."""
    sterownik = sterownik_pola(enm, bay_ref)
    if sterownik is None:
        return None
    wejscia = _pole(sterownik, "wejscia") or {}
    if _pole(wejscia, "u0_uklad") != "OTWARTY_TROJKAT":
        return None
    return _napis(_pole(wejscia, "u0_vt_ref"))


def funkcja_rejestru(kod: str) -> FunkcjaEaz | None:
    """Wpis rejestru funkcji (``None`` — kod spoza rejestru)."""
    return FUNKCJE_EAZ.get(kod)


#: Rodzaje naruszeń referencji sterownika wobec modelu (`naruszenia_referencji_sterownika`).
NARUSZENIE_POLE = "POLE_NIEISTNIEJACE"
NARUSZENIE_DRUGI_STEROWNIK = "DRUGI_STEROWNIK_POLA"
NARUSZENIE_APARAT = "APARAT_NIEISTNIEJACY"
NARUSZENIE_PRZEKLADNIK = "PRZEKLADNIK_NIEISTNIEJACY"


_OPIS_WEJSCIA_PL: Mapping[str, str] = {
    "ct_ref": "prądowe",
    "i0_ct_ref": "prądu zerowego (układ Ferrantiego)",
    "vt_ref": "napięciowe",
    "u0_vt_ref": "napięcia zerowego (otwarty trójkąt)",
    "ct_strony_2_refs": "prądowe drugiej strony",
}
_OPIS_RODZAJU_WEJSCIA_PL: Mapping[str, str] = {
    "ct_ref": "przekładnik prądowy",
    "i0_ct_ref": "przekładnik Ferrantiego",
    "vt_ref": "przekładnik napięciowy",
    "u0_vt_ref": "przekładnik napięciowy",
    "ct_strony_2_refs": "przekładnik prądowy",
}


@dataclass(frozen=True)
class IndeksReferencjiSterownikow:
    """Zbiory referencji modelu, wobec których sprawdza się sterownik — liczone RAZ na migawkę
    (walidator sprawdza wszystkie sterowniki, operacja jeden; obie drogi czytają ten indeks).
    """

    pola: frozenset[str]
    sterowniki_pol: Mapping[str, tuple[str, ...]]
    wylaczniki: frozenset[str]
    przekladniki: Mapping[str, str]  # referencja aparatu pola albo pomiaru → rodzaj


def indeks_referencji_sterownikow(enm: object) -> IndeksReferencjiSterownikow:
    """Indeks referencji: pola, sterowniki per pole, wyłączniki (gałąź ``breaker`` albo aparat
    pola rodzaju wyłącznika, wskazany regułą `ref_aparatu_wyzwalanego`), przekładniki (pomiar
    albo aparat pola rodzaju przekładnika)."""
    pola = list(_lista(enm, "bays"))
    sterowniki_pol: dict[str, list[str]] = {}
    for s in sterowniki(enm):
        bay = _napis(_pole(s, "bay_ref"))
        if bay is not None:
            sterowniki_pol.setdefault(bay, []).append(str(_pole(s, "ref_id") or ""))
    wylaczniki, przekladniki = _referencje_aparatow(enm)
    return IndeksReferencjiSterownikow(
        pola=frozenset(str(_pole(b, "ref_id")) for b in pola),
        sterowniki_pol={k: tuple(v) for k, v in sterowniki_pol.items()},
        wylaczniki=frozenset(wylaczniki),
        przekladniki=dict(przekladniki),
    )


def naruszenia_referencji_sterownika(
    enm: object, sterownik: object, *, indeks: IndeksReferencjiSterownikow | None = None
) -> list[tuple[str, str, str]]:
    """Sterownik wobec MODELU — JEDNA reguła operacji (`attach_protection`, `update_protection`)
    i walidatora (E064): pole istnieje i nie ma drugiego sterownika, macierz wyzwoleń wskazuje
    wyłączniki (gałąź ``breaker`` albo aparat pola rodzaju wyłącznika), wejścia — istniejące
    przekładniki (pomiar albo aparat pola rodzaju przekładnika). Zwraca ``(rodzaj, komunikat_pl,
    ref)``; pusta lista — spójny. ``indeks`` — zbiory referencji migawki liczone raz
    (`indeks_referencji_sterownikow`); bez niego liczony dla tego wywołania."""
    from .slownik_komunikatow import opis_elementu

    ind = indeks if indeks is not None else indeks_referencji_sterownikow(enm)
    wynik: list[tuple[str, str, str]] = []
    ref_id = str(_pole(sterownik, "ref_id") or "")
    bay_ref = _napis(_pole(sterownik, "bay_ref"))
    if bay_ref is not None:
        if bay_ref not in ind.pola:
            wynik.append(
                (
                    NARUSZENIE_POLE,
                    "Sterownik zabezpieczeń wskazuje pole rozdzielnicy, którego nie ma w modelu "
                    "sieci.",
                    bay_ref,
                )
            )
        drugi = next((r for r in ind.sterowniki_pol.get(bay_ref, ()) if r != ref_id), None)
        if drugi is not None:
            wynik.append(
                (
                    NARUSZENIE_DRUGI_STEROWNIK,
                    f"{opis_elementu(enm, bay_ref, 'Pole')} ma już "
                    f"{opis_elementu(enm, drugi, 'sterownik zabezpieczeń')} — "
                    "pole ma jeden sterownik; funkcje dodaje się w nim.",
                    bay_ref,
                )
            )
    for aparat in aparaty_sterownika(sterownik):
        if aparat not in ind.wylaczniki:
            wynik.append(
                (
                    NARUSZENIE_APARAT,
                    "Macierz wyzwoleń wskazuje aparat, którego nie ma w modelu sieci albo który "
                    "nie jest wyłącznikiem.",
                    aparat,
                )
            )
    wejscia_sterownika = _pole(sterownik, "wejscia")
    for klucz, ref in _niezgodne_wejscia(
        wejscia_sterownika if isinstance(wejscia_sterownika, Mapping) else {},
        ind.przekladniki,
    ):
        przyczyna = (
            "aparat, którego nie ma w modelu sieci"
            if ref not in ind.przekladniki
            else "aparat innego rodzaju"
        )
        wynik.append(
            (
                NARUSZENIE_PRZEKLADNIK,
                f"Wejście {_OPIS_WEJSCIA_PL[klucz]} sterownika wymaga, by wskazany aparat był "
                f"{_OPIS_RODZAJU_WEJSCIA_PL[klucz]} — wskazuje {przyczyna}.",
                ref,
            )
        )
    return wynik
