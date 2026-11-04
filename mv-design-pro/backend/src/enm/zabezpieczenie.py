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

from collections.abc import Collection, Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from network_model.catalog.funkcje_eaz import FUNKCJE_EAZ, FunkcjaEaz
from network_model.catalog.obwody_wtorne_pola import (
    RODZAJ_APARATU_WEJSCIA,
    ObwodyWtornePola,
)
from network_model.catalog.przekladniki import zaczepy_przekladnika
from network_model.catalog.wartosci_robocze import rozstrzygnij_zaczep_przekladnika

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
    "nastawy_funkcji",
    "numer_grupy_efektywnej",
    "przekladnik_pradowy",
    "referencja_sterownika_pola",
    "sterownik_pola",
    "sterowniki",
    "ustaw_funkcje_pola",
    "wejscia_dostepne",
    "wejscia_funkcji_w_aparacie",
]

#: Sufiks identyfikatora sterownika pola zakładanego z szablonu (`<bay_ref>/sterownik`) —
#: deterministyczny: ta sama budowa pola daje ten sam identyfikator.
ODNOSNIK_STEROWNIKA_POLA = "sterownik"


def _pole(obiekt: Any, nazwa: str, domyslna: Any = None) -> Any:
    if isinstance(obiekt, Mapping):
        return obiekt.get(nazwa, domyslna)
    return getattr(obiekt, nazwa, domyslna)


def _napis(wartosc: object) -> str | None:
    return wartosc.strip() if isinstance(wartosc, str) and wartosc.strip() else None


def sterowniki(enm: Any) -> list[Any]:
    """Sterowniki modelu w kolejności identyfikatorów (determinizm)."""
    lista = _pole(enm, "protection_assignments") or []
    return sorted(lista, key=lambda s: str(_pole(s, "ref_id") or ""))


def referencja_sterownika_pola(bay_ref: str) -> str:
    """Identyfikator sterownika zakładanego dla pola (pisarz z szablonu, `add_relay`)."""
    return f"{bay_ref}/{ODNOSNIK_STEROWNIKA_POLA}"


def sterownik_pola(enm: Any, bay_ref: str | None) -> Any | None:
    """Sterownik pola (najwyżej jeden — walidator modelu odrzuca drugi) albo ``None``."""
    if not bay_ref:
        return None
    return next((s for s in sterowniki(enm) if _pole(s, "bay_ref") == bay_ref), None)


def _funkcje(sterownik: Any) -> list[Any]:
    return list(_pole(sterownik, "funkcje") or [])


def kody_funkcji_sterownika(sterownik: Any, *, tylko_wlaczone: bool = True) -> list[str]:
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


def kody_funkcji_pola(enm: Any, bay_ref: str | None, *, tylko_wlaczone: bool = True) -> list[str]:
    """Kody funkcji zabezpieczeń i automatyki POLA — z jego sterownika (pusta lista: pole bez
    sterownika). Jedyne źródło bloku przekaźnika, karty pola, oceny pola i walidatora."""
    sterownik = sterownik_pola(enm, bay_ref)
    return kody_funkcji_sterownika(sterownik, tylko_wlaczone=tylko_wlaczone) if sterownik else []


def aparaty_funkcji(sterownik: Any, funkcja_ref: str) -> tuple[str, ...]:
    """Aparaty, na które działa funkcja (macierz wyzwoleń); pusta krotka = funkcja nie
    wyzwala (alarm, blokada, automatyka bez wyjścia na wyłącznik)."""
    for wiersz in _pole(sterownik, "macierz_wyzwolen") or []:
        if _pole(wiersz, "funkcja_ref") == funkcja_ref:
            return tuple(str(a) for a in _pole(wiersz, "aparat_refs") or [])
    return ()


def aparaty_sterownika(sterownik: Any) -> tuple[str, ...]:
    """Wszystkie aparaty z macierzy wyzwoleń sterownika (posortowane, bez powtórzeń)."""
    wynik: set[str] = set()
    for wiersz in _pole(sterownik, "macierz_wyzwolen") or []:
        wynik.update(str(a) for a in _pole(wiersz, "aparat_refs") or [])
    return tuple(sorted(wynik))


def numer_grupy_efektywnej(sterownik: Any, wybor_przypadku: int | None = None) -> int:
    """Numer grupy nastaw, którą czyta ocena: wybór przypadku (delta scenariusza, ADR-022),
    inaczej aktywna grupa bazowa sterownika."""
    if wybor_przypadku is not None:
        return int(wybor_przypadku)
    return int(_pole(sterownik, "aktywna_grupa", 1) or 1)


def nastawy_funkcji(
    sterownik: Any, funkcja_ref: str, numer_grupy: int | None = None
) -> dict[str, Any]:
    """Nastawy funkcji w grupie (domyślnie aktywnej) — klucz schematu → wartość.

    Pusty słownik = funkcja bez nastaw w tej grupie (nazwany brak ocenia warstwa analiz).
    """
    numer = numer_grupy_efektywnej(sterownik, numer_grupy)
    for grupa in _pole(sterownik, "grupy_nastaw") or []:
        if _pole(grupa, "numer") != numer:
            continue
        for wpis in _pole(grupa, "funkcje") or []:
            if _pole(wpis, "funkcja_ref") == funkcja_ref:
                return {
                    str(_pole(n, "klucz")): _pole(n, "wartosc")
                    for n in _pole(wpis, "nastawy") or []
                }
    return {}


def pochodzenie_nastaw_funkcji(
    sterownik: Any, funkcja_ref: str, numer_grupy: int | None = None
) -> dict[str, str]:
    """Pochodzenie każdej nastawy funkcji w grupie (PROJEKTANT / DOBOR / WARTOSC_ROBOCZA)."""
    numer = numer_grupy_efektywnej(sterownik, numer_grupy)
    for grupa in _pole(sterownik, "grupy_nastaw") or []:
        if _pole(grupa, "numer") != numer:
            continue
        for wpis in _pole(grupa, "funkcje") or []:
            if _pole(wpis, "funkcja_ref") == funkcja_ref:
                return {
                    str(_pole(n, "klucz")): str(_pole(n, "pochodzenie") or "PROJEKTANT")
                    for n in _pole(wpis, "nastawy") or []
                }
    return {}


def wejscia_funkcji_w_aparacie(wejscia: Any) -> dict[str, tuple[str, ...]]:
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
    strona_2 = tuple(r for r in (_pole(wejscia, "ct_strony_2_refs") or []) if _napis(r))
    if strona_2:
        wynik["I_STRONY_2"] = strona_2
    return wynik


def wejscia_dostepne(sterownik: Any) -> frozenset[str]:
    """Wejścia sterownika zrealizowane przekładnikami (sygnał binarny ``SYGNAL`` jest
    wejściem logicznym sterownika — zawsze dostępny)."""
    return frozenset(wejscia_funkcji_w_aparacie(_pole(sterownik, "wejscia") or {})) | {"SYGNAL"}


def brakujace_wejscia(sterownik: Any, kod: str) -> tuple[str, ...]:
    """Wymagane wejścia funkcji (rejestr), których sterownik nie ma przypiętych."""
    wpis = FUNKCJE_EAZ.get(kod)
    if wpis is None:
        return ()
    dostepne = wejscia_dostepne(sterownik)
    return tuple(w for w in wpis.wejscia_wymagane if w not in dostepne)


def funkcje_zasilane_z_aparatu(sterownik: Any, device_ref: str) -> list[str]:
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


def funkcje_wylaczajace_aparat(sterownik: Any, device_ref: str) -> list[str]:
    """Kody włączonych funkcji, które działają na aparat (macierz wyzwoleń)."""
    wlaczone = {
        str(_pole(f, "ref")): str(_pole(f, "kod"))
        for f in _funkcje(sterownik)
        if _pole(f, "wlaczona", True)
    }
    kody: list[str] = []
    for wiersz in _pole(sterownik, "macierz_wyzwolen") or []:
        kod = wlaczone.get(str(_pole(wiersz, "funkcja_ref")))
        if kod and device_ref in (_pole(wiersz, "aparat_refs") or []) and kod not in kody:
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
    obwod_wtorny: Any = None


def _przekladnia_rdzenia(przekladnia: str) -> tuple[float, float] | None:
    """„200-400/5" → (400, 5) dla zapisu jednej przekładni albo None (zapis nierozpoznany)."""
    try:
        pierwotna, wtorna = przekladnia.split("/")
        return float(pierwotna.split("-")[-1]), float(wtorna)
    except (ValueError, IndexError):
        return None


def przekladnik_pradowy(enm: Any, ref: str | None) -> PrzekladnikPradowy | None:
    """Przekładnik prądowy o referencji ``ref`` — z `measurements` albo z aparatów pól.

    ``None`` — referencji nie ma w modelu, wskazuje inny rodzaj aparatu albo tabliczka nie
    pozwala ustalić przekładni (wołający nazywa brak, nigdy nie zgaduje przekładni).
    """
    if not ref:
        return None
    for pomiar in _pole(enm, "measurements") or []:
        if _pole(pomiar, "ref_id") != ref:
            continue
        if _pole(pomiar, "measurement_type") != "CT":
            return None
        rating = _pole(pomiar, "rating") or {}
        return PrzekladnikPradowy(
            ref=ref,
            nazwa=str(_pole(pomiar, "name") or ref),
            zrodlo="POMIAR",
            ratio_primary=float(_pole(rating, "ratio_primary")),
            ratio_secondary=float(_pole(rating, "ratio_secondary")),
            accuracy_class=_pole(rating, "accuracy_class"),
            burden_va=_pole(rating, "burden_va"),
            catalog_ref=_pole(pomiar, "catalog_ref"),
            obwod_wtorny=_pole(pomiar, "obwod_wtorny"),
        )
    for pole in _pole(enm, "bays") or []:
        for aparat in _pole(pole, "primary_devices") or []:
            if _pole(aparat, "device_ref") != ref:
                continue
            if _pole(aparat, "kind") != "CT":
                return None
            rdzenie = list(_pole(aparat, "rdzenie") or [])
            if not rdzenie:
                return None
            ochronny = next(
                (r for r in rdzenie if "P" in str(_pole(r, "klasa") or "").upper()),
                rdzenie[0],
            )
            przekladnie = [str(_pole(r, "przekladnia")) for r in rdzenie]
            zaczep = rozstrzygnij_zaczep_przekladnika(
                zaczepy_przekladnika(przekladnie), _pole(aparat, "zaczep_pierwotny_a")
            )
            rdzen = _przekladnia_rdzenia(str(_pole(ochronny, "przekladnia")))
            if rdzen is None:
                return None
            pierwotna = zaczep.wartosc if zaczep is not None else rdzen[0]
            return PrzekladnikPradowy(
                ref=ref,
                nazwa=str(_pole(aparat, "designation") or ref),
                zrodlo="APARAT_POLA",
                ratio_primary=float(pierwotna),
                ratio_secondary=rdzen[1],
                accuracy_class=_pole(ochronny, "klasa"),
                burden_va=_pole(ochronny, "moc_va"),
                catalog_ref=_pole(aparat, "catalog_ref"),
                zaczep_roboczy=bool(zaczep is not None and zaczep.robocza),
            )
    return None


# ---------------------------------------------------------------------------
# Pisarz: sterownik pola z zestawu funkcji szablonu
# ---------------------------------------------------------------------------


def _aparaty_rodzaju(aparaty: Sequence[Mapping[str, Any]], rodzaj: str) -> list[str]:
    return [str(a["device_ref"]) for a in aparaty if a.get("kind") == rodzaj and a.get("device_ref")]


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
            po_oznaczeniu[(str(a["designation"]), str(a.get("kind")))] = str(a["device_ref"])
    wejscia: dict[str, Any] = {}
    wyzwolenia: dict[str, list[str]] = {}
    obecne = set(kody)
    if obwody is not None:
        for p in obwody.powiazania:
            if p.funkcja not in obecne:
                continue
            if p.wylacznik is not None:
                cb = po_oznaczeniu.get((p.wylacznik, "CB"))
                if cb is not None:
                    wyzwolenia.setdefault(p.funkcja, []).append(cb)
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


def ustaw_funkcje_pola(
    enm: dict[str, Any],
    *,
    bay_ref: str,
    kody: Iterable[str],
    aparaty: Sequence[Mapping[str, Any]],
    obwody: ObwodyWtornePola | None,
    zrodlo_u0_ref: str | None = None,
    nazwa_pola: str | None = None,
) -> dict[str, Any] | None:
    """Załóż albo zaktualizuj sterownik pola z zestawu funkcji szablonu — JEDYNY pisarz.

    Funkcje sterownika = ``kody`` (kolejność szablonu). Funkcja, która zostaje, zachowuje swój
    identyfikator, stan włączenia i nastawy we wszystkich grupach; funkcja usunięta znika
    razem z nastawami i wierszem macierzy wyzwoleń. Wiązania wejść i wiersze macierzy
    wyzwoleń funkcji z szablonu pochodzą z obwodów wtórnych wzorca (`_wiazania_z_obwodow`);
    wiązanie nadane wcześniej (katalog sterownika, `add_relay`) ma pierwszeństwo przed
    wiązaniem z szablonu. ``zrodlo_u0_ref`` — przekładnik napięciowy z otwartym trójkątem
    (źródło 3U₀ potwierdzone przez projektanta, `enm.zrodlo_napiecia_zerowego`).

    Pusty zestaw i brak sterownika — nic (pole bez funkcji nie dostaje pustego sterownika);
    pusty zestaw przy istniejącym sterowniku — sterownik zostaje bez funkcji (urządzenie
    z katalogu nie znika przez zmianę szablonu). Zwraca rekord sterownika albo ``None``.
    """
    lista_kodow: list[str] = []
    for kod in kody:
        if kod not in lista_kodow:
            lista_kodow.append(str(kod))
    lista = enm.setdefault("protection_assignments", [])
    sterownik = next((s for s in lista if s.get("bay_ref") == bay_ref), None)
    if sterownik is None and not lista_kodow:
        return None
    wejscia_szablonu, wyzwolenia = _wiazania_z_obwodow(aparaty, obwody, lista_kodow)
    if zrodlo_u0_ref:
        wejscia_szablonu["u0_uklad"] = "OTWARTY_TROJKAT"
        wejscia_szablonu["u0_vt_ref"] = zrodlo_u0_ref
    if sterownik is None:
        sterownik = {
            "ref_id": referencja_sterownika_pola(bay_ref),
            "name": f"Sterownik pola {nazwa_pola or bay_ref}",
            "bay_ref": bay_ref,
            "wejscia": {},
            "funkcje": [],
            "grupy_nastaw": [],
            "aktywna_grupa": 1,
            "macierz_wyzwolen": [],
            "is_enabled": True,
        }
        lista.append(sterownik)
    stare = {str(f["kod"]): f for f in sterownik.get("funkcje") or []}
    funkcje = [
        dict(stare[kod]) if kod in stare else {"ref": kod, "kod": kod, "wlaczona": True}
        for kod in lista_kodow
    ]
    refy = {f["ref"] for f in funkcje}
    sterownik["funkcje"] = funkcje
    sterownik["grupy_nastaw"] = [
        {**g, "funkcje": [n for n in g.get("funkcje") or [] if n.get("funkcja_ref") in refy]}
        for g in sterownik.get("grupy_nastaw") or []
    ]
    macierz = [w for w in sterownik.get("macierz_wyzwolen") or [] if w.get("funkcja_ref") in refy]
    zapisane = {w["funkcja_ref"] for w in macierz}
    for funkcja in funkcje:
        aparaty_kodu = wyzwolenia.get(funkcja["kod"])
        if aparaty_kodu and funkcja["ref"] not in zapisane:
            macierz.append({"funkcja_ref": funkcja["ref"], "aparat_refs": list(aparaty_kodu)})
    sterownik["macierz_wyzwolen"] = macierz
    istniejace = {str(a.get("device_ref")) for a in aparaty} | {
        str(m.get("ref_id")) for m in enm.get("measurements") or []
    } | {
        str(a.get("device_ref"))
        for pole in enm.get("bays") or []
        for a in pole.get("primary_devices") or []
    }
    wejscia = {
        k: v
        for k, v in dict(sterownik.get("wejscia") or {}).items()
        if not (k.endswith("_ref") and isinstance(v, str) and v not in istniejace)
    }
    if wejscia.get("i0_uklad") == "FERRANTI" and not wejscia.get("i0_ct_ref"):
        wejscia.pop("i0_uklad")
    if wejscia.get("u0_uklad") == "OTWARTY_TROJKAT" and not wejscia.get("u0_vt_ref"):
        wejscia.pop("u0_uklad")
    for klucz, wartosc in wejscia_szablonu.items():
        if not wejscia.get(klucz):
            wejscia[klucz] = wartosc
    if zrodlo_u0_ref is None and wejscia.get("u0_uklad") == "OTWARTY_TROJKAT":
        # Źródło 3U₀ zdjęte przez projektanta — wiązanie znika razem z deklaracją.
        wejscia.pop("u0_uklad", None)
        wejscia.pop("u0_vt_ref", None)
    sterownik["wejscia"] = wejscia
    return sterownik


def zrodlo_u0_pola(enm: Any, bay_ref: str | None) -> str | None:
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
