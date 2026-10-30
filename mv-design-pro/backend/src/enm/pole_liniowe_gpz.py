"""Ocena pola liniowego SN rozdzielni GPZ wg klasy pola (IRiESD ENEA Operator, wersja 2.3,
II.4.5.4.2.1–2.3) — funkcje EAZ, generacja i odbiory za polem, typ modułu, pomiar AJEE.

PO CO (karta UX-04/POLE-LINIOWE-WZORZEC, rozszerzenie 2). Klasa pola (odbiorcze, mieszane,
dedykowane wytwórcy) rozstrzyga, które funkcje zabezpieczeniowe pole MUSI mieć, które są
niedopuszczalne (SCO w linii z generacją, SPZ w polu dedykowanym) i czy pole wymaga przekładnika
napięciowego od strony linii. Bez oceny projektant widział zestaw funkcji z rysunku, a sprzeczność
z siecią za polem (generacja zasilana z pola odbiorczego, odbiorca za polem dedykowanym) nie była
nigdzie nazwana.

JEDNO ŹRÓDŁO DANYCH:

* wymagania funkcji wg klasy — `bay_templates.WYMAGANIA_EAZ_KLASY_POLA` (kod, wymóg, podstawa);
* funkcje pola — `Bay.protection_codes` (deklaracja pola; zapisuje je resolver szablonu i klasy);
* sieć za polem — graf szyn w KONFIGURACJI NORMALNEJ (`topology._graf_konfiguracji_normalnej`:
  punkty normalnie otwarte otwarte), od końca gałęzi aparatu pola przeciwnego szynie sekcji, bez
  przechodzenia przez szyny sekcji GPZ (`topology.szyny_sekcji_gpz`);
* typ modułu wytwarzania — `catalog.profiles.nc_rfg.loader.klasyfikacja_modulu` (jedyne miejsce
  progów klas A–D w produkcie);
* rdzeń rozliczeniowy — rdzenie przekładnika prądowego pola (`BayPrimaryDevice.rdzenie`,
  przeznaczenie ``ROZLICZENIE``).

KLASA OCENY. Klasa zadeklarowana (`Bay.klasa_pola`) ma pierwszeństwo; pole bez klasy jest
oceniane klasą WYNIKAJĄCĄ Z SIECI za polem (brak generacji → odbiorcze; generacja i odbiory →
mieszane; wyłącznie generacja → dedykowane) — jawnie oznaczoną jako przyjęta (ZASADA NR 4:
system proponuje, projektant zmienia).

STATUSY (kontrakt werdyktu wyjaśnialnego): funkcja wymagana obecna → ``SPELNIA`` (kompletność
dowodu ``NIEPELNY`` — dowodem jest deklaracja funkcji pola, nie nastawy przekaźnika), nieobecna →
``NIE_SPELNIA``; funkcja „na żądanie OSD" obecna → ``BRAK_DOWODU`` (wymóg ustala OSD w warunkach
przyłączenia, których model nie niesie), nieobecna → ``NIEJEDNOZNACZNY`` — nigdy ``SPELNIA``;
funkcja dopuszczalna → ``NIE_DOTYCZY``; zakazana obecna → ``NIE_SPELNIA``, nieobecna →
``SPELNIA``; SPZ w linii kablowej → ``NIE_DOTYCZY`` (wymóg dotyczy linii napowietrznych).
Funkcja WARUNKOWA (`bay_templates.WARUNKI_FUNKCJI_EAZ` — 67N: źródło napięcia zerowego 3U₀
i kryterium prądowe I0, decyzja właściciela 2026-10-29) wymagana klasą przy warunku
niespełnionym w modelu → ``NIE_OCENIONO`` z listą braków (`enm.zrodlo_napiecia_zerowego`) —
obecna czy nie: bez źródła U0 funkcja niczego nie mierzy, a brak funkcji nie jest naruszeniem,
dopóki model nie ma jej wejścia. Nigdy ``SPELNIA`` ani ``NIE_SPELNIA`` bez wejścia funkcji.

NIEZGODNOŚCI WALIDATORA (W053–W057) — rekordy z kodem, zdaniem i akcją; walidator modelu
(`enm.validator`) je raportuje, operacje ich nie blokują (zmiana sieci za polem, np. dołożenie
źródła, nie jest odrzucana — projektant poprawia klasę albo wykonanie pola).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from network_model.catalog.bay_templates import (
    BAY_TEMPLATE_REGISTRY,
    KLASY_POLA_Z_GENERACJA,
    NAZWY_KLASY_POLA_PL,
    OPIS_WYMOGU_PL,
    PODSTAWA_KLASY_POLA,
    WARUNEK_ZRODLA_U0,
    WARUNKI_FUNKCJI_EAZ,
    WYMAGANIA_EAZ_KLASY_POLA,
)
from network_model.catalog.funkcje_eaz import opis_funkcji_eaz_pl
from network_model.catalog.obwody_wtorne_pola import (
    RODZAJ_APARATU_WEJSCIA,
    ObwodyWtornePola,
    WejscieFunkcjiEaz,
)
from network_model.pochodne.jednostki import kw_na_mw, mw_na_kw
from werdykt.etykiety import etykieta
from werdykt.kontrakt import Etykieta, StatusWerdyktu, WyjasnienieWerdyktu

from .slownik_komunikatow import opis_elementu
from .topology import _graf_konfiguracji_normalnej, szyny_sekcji_gpz
from .zgodnosc_szablonu_pola import czy_pole_gpz
from .zrodlo_napiecia_zerowego import (
    AKCJA_NAPRAWCZA_ZRODLA_U0_PL,
    PODSTAWA_ZRODLA_U0,
    ZrodloU0Pola,
    zrodlo_u0_pola,
)

__all__ = [
    "AKCJA_NAPRAWCZA_POLA_LINIOWEGO_PL",
    "KOD_AJEE_BRAK_RDZENIA",
    "KOD_GENERACJA_Z_POLA_ODBIORCZEGO",
    "KOD_ODBIORY_ZA_POLEM_DEDYKOWANYM",
    "KOD_SCO_W_POLU_Z_GENERACJA",
    "KOD_SPZ_W_POLU_DEDYKOWANYM",
    "KODY_WALIDATORA_POLA_LINIOWEGO",
    "NapiecieZwrotnePola",
    "NiezgodnoscPolaLiniowego",
    "ObwodFunkcjiPola",
    "OcenaFunkcjiPola",
    "OcenaPolaLiniowego",
    "PROG_AJEE_ODBIORCY_KW",
    "PROG_AJEE_WYTWORCY_KW",
    "klasa_z_sieci",
    "ocena_pola_liniowego",
    "oceny_pol_liniowych",
]

KOD_GENERACJA_Z_POLA_ODBIORCZEGO = "pole.generacja_z_pola_odbiorczego"
KOD_ODBIORY_ZA_POLEM_DEDYKOWANYM = "pole.odbiory_za_polem_dedykowanym"
KOD_SCO_W_POLU_Z_GENERACJA = "pole.sco_w_polu_z_generacja"
KOD_SPZ_W_POLU_DEDYKOWANYM = "pole.spz_w_polu_dedykowanym"
KOD_AJEE_BRAK_RDZENIA = "pole.ajee_brak_rdzenia_rozliczeniowego"

#: Kod niezgodności → kod walidatora modelu (kanon gotowości w `domain.readiness_bridge`).
KODY_WALIDATORA_POLA_LINIOWEGO: dict[str, str] = {
    KOD_GENERACJA_Z_POLA_ODBIORCZEGO: "W053",
    KOD_ODBIORY_ZA_POLEM_DEDYKOWANYM: "W054",
    KOD_SCO_W_POLU_Z_GENERACJA: "W055",
    KOD_SPZ_W_POLU_DEDYKOWANYM: "W056",
    KOD_AJEE_BRAK_RDZENIA: "W057",
}

AKCJA_NAPRAWCZA_POLA_LINIOWEGO_PL: dict[str, str] = {
    KOD_GENERACJA_Z_POLA_ODBIORCZEGO: (
        "ustaw klasę pola mieszane albo dedykowane wytwórcy i wykonanie Z.11.1 albo Z.11"
    ),
    KOD_ODBIORY_ZA_POLEM_DEDYKOWANYM: (
        "zmień klasę pola na mieszane albo przyłącz odbiory z pola odbiorczego"
    ),
    KOD_SCO_W_POLU_Z_GENERACJA: (
        "ustaw klasę pola z generacją — zestaw funkcji zostanie przeliczony bez SCO"
    ),
    KOD_SPZ_W_POLU_DEDYKOWANYM: (
        "ustaw klasę pola dedykowane wytwórcy — zestaw funkcji zostanie przeliczony bez SPZ"
    ),
    KOD_AJEE_BRAK_RDZENIA: (
        "wybierz wykonanie Z.11 (przekładnik prądowy z rdzeniem rozliczeniowym 0,2S)"
    ),
}

#: Progi pomiaru rozliczeniowego i analizatora jakości energii (AJEE) w polu (ENEA Zeszyt 1,
#: Z.11 s.90, objaśnienie rdzenia I): wytwórca o mocy ≥ 200 kW, odbiorca o mocy > 4 MW.
PROG_AJEE_WYTWORCY_KW = 200.0
PROG_AJEE_ODBIORCY_KW = 4000.0
_PODSTAWA_AJEE = "ENEA Zeszyt 1, Z.11 (s.90) — rdzeń I przekładnika prądowego"
_DOWOD_DEKLARACJI = "deklaracja funkcji pola (zestaw funkcji zabezpieczeniowych rekordu pola)"
_KODY_SPZ = frozenset({"79", "SPZE"})
_KODY_SCO = frozenset({"SCO"})


@dataclass(frozen=True)
class OcenaFunkcjiPola:
    """Ocena jednej funkcji EAZ pola wobec wymogu klasy — rekord wyjaśnialny.

    Status maszynowy nigdy nie stoi sam (kontrakt werdyktu wyjaśnialnego): rekord niesie
    wyjaśnienie kanoniczne (`WyjasnienieWerdyktu` — zdanie, przyczyna, czego brakuje,
    zastrzeżenia) i etykietę liczoną w backendzie ze słownika §9 (`werdykt.etykiety`, poziom
    kryterium) — karta pola nie ma własnej mapy „status → tekst”.
    """

    kod: str
    funkcja_pl: str
    wymog: str
    obecna: bool
    status: StatusWerdyktu
    co_oceniono: str
    kryterium: str
    podstawa: str
    dowod: str
    kompletnosc_dowodu: str
    etykieta: Etykieta
    wyjasnienie: WyjasnienieWerdyktu


@dataclass(frozen=True)
class ModulZaPolem:
    """Moduł wytwarzania za polem: moc, napięcie przyłączenia i typ wg progów NC RfG."""

    ref_id: str
    p_kw: float
    napiecie_kv: float | None
    typ: str | None
    powod_pl: str


@dataclass(frozen=True)
class NiezgodnoscPolaLiniowego:
    kod: str
    bay_ref: str
    komunikat_pl: str
    #: Akcja naprawcza (`AKCJA_NAPRAWCZA_POLA_LINIOWEGO_PL`) — jedno źródło dla walidatora
    #: (`suggested_fix` W053–W057) i karty pola (`field-view` → `ocena_pola_liniowego`).
    akcja_pl: str


def _niezgodnosc(kod: str, bay_ref: str, komunikat_pl: str) -> NiezgodnoscPolaLiniowego:
    return NiezgodnoscPolaLiniowego(
        kod, bay_ref, komunikat_pl, AKCJA_NAPRAWCZA_POLA_LINIOWEGO_PL[kod]
    )


@dataclass(frozen=True)
class ObwodFunkcjiPola:
    """Obwód wtórny funkcji EAZ pola wg wzorca (`ObwodyWtornePola`) rozwiązany na aparatach
    TEGO pola: z czego funkcja mierzy (rdzeń, uzwojenie, przekładnik Ferrantiego, sygnał), na
    co działa i ze statusem weryfikacji rysunku. Funkcja zestawu pola bez obwodu na rysunku
    wzorca ma ``blok_rysunku = None`` i zdanie, dlaczego (np. f< w Z.10 — wymóg klasy)."""

    kod: str
    funkcja_pl: str
    obecna: bool
    blok_rysunku: str | None
    wejscia_pl: tuple[str, ...]
    wyjscia_pl: str
    weryfikacja: str
    uwaga: str | None


@dataclass(frozen=True)
class NapiecieZwrotnePola:
    """Napięcie po stronie linii przy otwartym wyłączniku (Z.11.1/Z.11 — „z pomiarem napięcia
    zwrotnego"): czym jest mierzone (obwód funkcji NZ wzorca), czy w polu jest blokada NZ, czy
    za polem są źródła, które mogą je podtrzymać, i stan z pomiaru — WYŁĄCZNIE z rekordu ruchu
    pola (`Bay.runtime_state`, łączność „ok"); bez niego stan jest nieustalony, nie „brak"."""

    pomiar_pl: str
    blokada_nz: bool
    zrodla_za_polem: int
    mozliwe: bool
    wyjasnienie_pl: str
    stan_pomiaru: str
    stan_pomiaru_pl: str


@dataclass(frozen=True)
class OcenaPolaLiniowego:
    bay_ref: str
    klasa_zadeklarowana: str | None
    klasa_z_sieci: str
    klasa_oceny: str
    klasa_przyjeta: bool
    moduly: tuple[ModulZaPolem, ...]
    odbiory: tuple[tuple[str, float], ...]
    linia_napowietrzna: bool
    ajee_wymagany: bool
    ajee_rdzen_obecny: bool
    ajee_przyczyna: str
    oceny_funkcji: tuple[OcenaFunkcjiPola, ...]
    niezgodnosci: tuple[NiezgodnoscPolaLiniowego, ...]
    #: Obwody wtórne wzorca (sygnały do wyłącznika, obwody okrężne, nadrzędne) — dane szablonu
    #: pola (`BayTemplate.obwody_wtorne`); `None` — pole bez szablonu z rysunkiem obwodów.
    obwody_wtorne: ObwodyWtornePola | None
    obwody_funkcji: tuple[ObwodFunkcjiPola, ...]
    napiecie_zwrotne: NapiecieZwrotnePola | None


def _lista(enm: Mapping[str, Any], nazwa: str) -> list[Mapping[str, Any]]:
    return [e for e in enm.get(nazwa) or [] if isinstance(e, Mapping)]


def _liczba(wartosc: object) -> float | None:
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    return float(wartosc)


def _szyny_za_polem(enm: Mapping[str, Any], pole: Mapping[str, Any]) -> frozenset[str]:
    """Szyny zasilane z pola w konfiguracji normalnej — od końców gałęzi aparatu pola
    przeciwnych szynie pola (i od zacisku pola), bez wejścia na szyny sekcji GPZ."""
    _szyny, krawedzie, _konce = _graf_konfiguracji_normalnej(enm)
    sekcje = szyny_sekcji_gpz(enm)
    szyna_pola = pole.get("bus_ref")
    galezie = {str(g.get("ref_id")): g for g in _lista(enm, "branches")}
    start: set[str] = set()
    for ref in pole.get("equipment_refs") or []:
        galaz = galezie.get(str(ref))
        if galaz is None:
            continue
        for koniec in (galaz.get("from_bus_ref"), galaz.get("to_bus_ref")):
            if isinstance(koniec, str) and koniec != szyna_pola:
                start.add(koniec)
    if isinstance(pole.get("terminal_bus_ref"), str):
        start.add(str(pole["terminal_bus_ref"]))
    start -= sekcje
    sasiedzi: dict[str, set[str]] = {}
    for _ref, a, b in krawedzie:
        sasiedzi.setdefault(a, set()).add(b)
        sasiedzi.setdefault(b, set()).add(a)
    odwiedzone = set(start)
    kolejka = sorted(start)
    while kolejka:
        szyna = kolejka.pop()
        for nastepna in sorted(sasiedzi.get(szyna, ())):
            if nastepna in odwiedzone or nastepna in sekcje or nastepna == szyna_pola:
                continue
            odwiedzone.add(nastepna)
            kolejka.append(nastepna)
    return frozenset(odwiedzone)


def _modul(enm: Mapping[str, Any], generator: Mapping[str, Any]) -> ModulZaPolem:
    # Moc modułu: górna granica mocy czynnej (`limits.p_max_mw`), a gdy jej brak — moc
    # czynna modelu (`p_mw`) jako wartość przyjęta.
    granice = generator.get("limits") if isinstance(generator.get("limits"), Mapping) else {}
    p_mw = _liczba(granice.get("p_max_mw")) if granice else None
    if p_mw is None:
        p_mw = _liczba(generator.get("p_mw")) or 0.0
    szyny = {str(b.get("ref_id")): b for b in _lista(enm, "buses")}
    napiecie = _liczba((szyny.get(str(generator.get("bus_ref"))) or {}).get("voltage_kv"))
    ref = str(generator.get("ref_id"))
    if p_mw <= 0.0 or napiecie is None:
        return ModulZaPolem(
            ref, mw_na_kw(p_mw), napiecie, None, "typ modułu nieokreślony — brak mocy albo napięcia"
        )
    from catalog.profiles.nc_rfg.loader import klasyfikacja_modulu

    try:
        klasyfikacja = klasyfikacja_modulu(mw_na_kw(p_mw), napiecie)
    except ValueError as blad:  # rdzeń B-01 odmawia danych spoza dziedziny gołym ValueError
        return ModulZaPolem(ref, mw_na_kw(p_mw), napiecie, None, f"typ modułu nieokreślony: {blad}")
    return ModulZaPolem(ref, mw_na_kw(p_mw), napiecie, klasyfikacja.modul, klasyfikacja.powod_pl)


def klasa_z_sieci(moduly: Iterable[ModulZaPolem], odbiory: Iterable[tuple[str, float]]) -> str:
    """Klasa pola wynikająca z sieci za polem (IRiESD II.4.5.4.2.1–2.3)."""
    jest_generacja = any(m.p_kw > 0.0 for m in moduly)
    jest_odbior = any(p > 0.0 for _ref, p in odbiory)
    if not jest_generacja:
        return "ODBIORCZE"
    return "MIESZANE" if jest_odbior else "DEDYKOWANE_WYTWORCY"


def _ocena_funkcji(
    kod: str,
    wymog: str,
    podstawa: str,
    obecna: bool,
    linia_napowietrzna: bool,
    klasa: str,
    zrodlo_u0: ZrodloU0Pola,
) -> OcenaFunkcjiPola:
    funkcja = opis_funkcji_eaz_pl(kod)
    kryterium = f"funkcja {OPIS_WYMOGU_PL[wymog]} w klasie: {NAZWY_KLASY_POLA_PL[klasa]}"
    status: StatusWerdyktu
    czego_brakuje: tuple[str, ...] = ()
    dowod = _DOWOD_DEKLARACJI
    warunek_niespelniony = (
        WARUNKI_FUNKCJI_EAZ.get(kod) == WARUNEK_ZRODLA_U0 and not zrodlo_u0.potwierdzone
    )
    if wymog in ("OBOWIAZKOWA", "NAPOWIETRZNA", "NA_ZADANIE_OSD") and warunek_niespelniony:
        # Decyzja właściciela 2026-10-29: funkcja bez wejścia w modelu nie jest oceniana —
        # ani „spełnia” (deklaracja bez źródła U0 niczego nie mierzy), ani „naruszona” (brak
        # funkcji wynika z braku jej źródła, nie z wyboru projektanta). Braki nazwane wprost.
        status = "NIE_OCENIONO"
        stan_funkcji = (
            "funkcja zadeklarowana w polu bez wejścia napięcia zerowego"
            if obecna
            else "funkcja nieprzypisana — przypisanie wymaga źródła 3U₀"
        )
        przyczyna = f"{zrodlo_u0.przyczyna_pl}; {stan_funkcji} — {AKCJA_NAPRAWCZA_ZRODLA_U0_PL}"
        czego_brakuje = zrodlo_u0.czego_brakuje
        dowod = f"{_DOWOD_DEKLARACJI}; źródło 3U₀: {PODSTAWA_ZRODLA_U0}"
    elif wymog == "NAPOWIETRZNA" and not linia_napowietrzna:
        status, przyczyna = (
            "NIE_DOTYCZY",
            "za polem nie ma linii napowietrznej — wymóg dotyczy linii napowietrznych "
            "i napowietrzno-kablowych",
        )
    elif wymog in ("OBOWIAZKOWA", "NAPOWIETRZNA"):
        if obecna:
            status, przyczyna = "SPELNIA", "funkcja zadeklarowana w polu"
        else:
            status, przyczyna = "NIE_SPELNIA", "funkcji wymaganej brak w zestawie funkcji pola"
            czego_brakuje = (f"funkcja {funkcja} w zestawie funkcji pola",)
    elif wymog == "NA_ZADANIE_OSD":
        status, przyczyna = (
            (
                "BRAK_DOWODU",
                "funkcja zadeklarowana; wymóg ustala operator w warunkach przyłączenia, "
                "których model nie zawiera",
            )
            if obecna
            else (
                "NIEJEDNOZNACZNY",
                "funkcji brak; operator może jej wymagać — rozstrzygają warunki przyłączenia",
            )
        )
        czego_brakuje = ("warunki przyłączenia operatora systemu dystrybucyjnego",)
    elif wymog == "DOPUSZCZALNA":
        status, przyczyna = "NIE_DOTYCZY", "funkcja dopuszczalna, niewymagana"
    else:
        status, przyczyna = (
            ("NIE_SPELNIA", "funkcja niedopuszczalna w tej klasie pola jest zadeklarowana")
            if obecna
            else ("SPELNIA", "funkcji niedopuszczalnej nie ma w zestawie funkcji pola")
        )
    etykieta_oceny = etykieta(status, "NIEPELNY", "K")
    return OcenaFunkcjiPola(
        kod=kod,
        funkcja_pl=funkcja,
        wymog=wymog,
        obecna=obecna,
        status=status,
        co_oceniono=f"obecność funkcji {funkcja} w polu",
        kryterium=kryterium,
        podstawa=podstawa,
        dowod=dowod,
        kompletnosc_dowodu="NIEPELNY",
        etykieta=etykieta_oceny,
        wyjasnienie=WyjasnienieWerdyktu(
            zdanie_pl=(
                f"Ocena obecności funkcji {funkcja} — {kryterium}: "
                f"{etykieta_oceny.etykieta_pl.lower()}"
            ),
            przyczyna_pl=przyczyna,
            czego_brakuje=czego_brakuje,
            zastrzezenia=(
                "dowodem jest deklaracja funkcji pola, nie nastawy przekaźnika "
                "— kompletność dowodu niepełna",
            ),
        ),
    )


def ocena_pola_liniowego(
    enm: Mapping[str, Any], pole: Mapping[str, Any]
) -> OcenaPolaLiniowego | None:
    """Ocena pola liniowego GPZ (pole sekcji GPZ z szablonem pola liniowego albo z klasą);
    `None` — pole nie jest polem liniowym GPZ."""
    szablon = BAY_TEMPLATE_REGISTRY.get(str(pole.get("bay_template_ref") or ""))
    zadeklarowana = pole.get("klasa_pola")
    if not czy_pole_gpz(pole) or (
        (szablon is None or szablon.wykonanie_pola is None) and zadeklarowana is None
    ):
        return None
    bay_ref = str(pole.get("ref_id") or "")
    opis_pola = opis_elementu(dict(enm), bay_ref, "pola")
    szyny = _szyny_za_polem(enm, pole)
    moduly = tuple(
        _modul(enm, g)
        for g in sorted(_lista(enm, "generators"), key=lambda g: str(g.get("ref_id")))
        if g.get("bus_ref") in szyny
    )
    odbiory = tuple(
        (str(o.get("ref_id")), mw_na_kw(_liczba(o.get("p_mw")) or 0.0))
        for o in sorted(_lista(enm, "loads"), key=lambda o: str(o.get("ref_id")))
        if o.get("bus_ref") in szyny
    )
    linia_napowietrzna = any(
        g.get("type") == "line_overhead"
        and (g.get("from_bus_ref") in szyny or g.get("to_bus_ref") in szyny)
        for g in _lista(enm, "branches")
    )
    z_sieci = klasa_z_sieci(moduly, odbiory)
    klasa = str(zadeklarowana) if zadeklarowana is not None else z_sieci
    kody = [str(k) for k in pole.get("protection_codes") or []]
    zrodlo_u0 = zrodlo_u0_pola(enm, pole)
    oceny = tuple(
        _ocena_funkcji(kod, wymog, podstawa, kod in kody, linia_napowietrzna, klasa, zrodlo_u0)
        for kod, wymog, podstawa in WYMAGANIA_EAZ_KLASY_POLA[klasa]
    )

    rdzen_rozliczeniowy = any(
        "ROZLICZENIE" in (r.get("przeznaczenie") or [])
        for a in pole.get("primary_devices") or []
        if isinstance(a, Mapping) and a.get("kind") == "CT"
        for r in a.get("rdzenie") or []
        if isinstance(r, Mapping)
    )
    wytworcy = [m for m in moduly if m.p_kw >= PROG_AJEE_WYTWORCY_KW]
    odbiorcy = [(r, p) for r, p in odbiory if p > PROG_AJEE_ODBIORCY_KW]
    ajee = bool(wytworcy or odbiorcy)
    if ajee:
        przyczyna_ajee = (
            f"za polem: {len(wytworcy)} moduł(y) wytwarzania o mocy ≥ {PROG_AJEE_WYTWORCY_KW:g} kW, "
            f"{len(odbiorcy)} odbiór(y) o mocy > {kw_na_mw(PROG_AJEE_ODBIORCY_KW):g} MW "
            f"({_PODSTAWA_AJEE})"
        )
    else:
        przyczyna_ajee = (
            f"za polem brak wytwórcy o mocy ≥ {PROG_AJEE_WYTWORCY_KW:g} kW i odbiorcy o mocy "
            f"> {kw_na_mw(PROG_AJEE_ODBIORCY_KW):g} MW ({_PODSTAWA_AJEE})"
        )

    niezgodnosci: list[NiezgodnoscPolaLiniowego] = []
    generacja = any(m.p_kw > 0.0 for m in moduly)
    wykonanie_odbiorcze = szablon is not None and szablon.wykonanie_pola == "Z10"
    if generacja and (
        zadeklarowana == "ODBIORCZE" or (zadeklarowana is None and wykonanie_odbiorcze)
    ):
        nosnik = (
            f"klasę {NAZWY_KLASY_POLA_PL['ODBIORCZE']}"
            if zadeklarowana == "ODBIORCZE"
            else "wykonanie pola odbiorczego ENEA Z.10 bez klasy pola"
        )
        niezgodnosci.append(
            _niezgodnosc(
                KOD_GENERACJA_Z_POLA_ODBIORCZEGO,
                bay_ref,
                f"Za {opis_pola} pracuje {len(moduly)} moduł(y) wytwarzania, a pole ma {nosnik} "
                f"— {PODSTAWA_KLASY_POLA['ODBIORCZE']} dotyczy pola, do którego nie są przyłączone "
                "moduły wytwarzania. Pole z generacją wymaga klasy mieszanej albo dedykowanej "
                "i przekładnika napięciowego od strony linii (Z.11.1/Z.11).",
            )
        )
    if zadeklarowana == "DEDYKOWANE_WYTWORCY" and any(p > 0.0 for _r, p in odbiory):
        niezgodnosci.append(
            _niezgodnosc(
                KOD_ODBIORY_ZA_POLEM_DEDYKOWANYM,
                bay_ref,
                f"Za {opis_pola} — {NAZWY_KLASY_POLA_PL['DEDYKOWANE_WYTWORCY']} — są odbiory "
                f"({len(odbiory)}): {PODSTAWA_KLASY_POLA['DEDYKOWANE_WYTWORCY']} dotyczy pola "
                "współpracującego wyłącznie z modułami wytwarzania (bez SPZ — odbiorcy nie mieliby "
                "samoczynnego ponownego załączenia).",
            )
        )
    if klasa in KLASY_POLA_Z_GENERACJA and _KODY_SCO & set(kody):
        niezgodnosci.append(
            _niezgodnosc(
                KOD_SCO_W_POLU_Z_GENERACJA,
                bay_ref,
                f"{opis_pola[0].upper()}{opis_pola[1:]} ({NAZWY_KLASY_POLA_PL[klasa]}) ma "
                f"samoczynne częstotliwościowe odciążenie ({', '.join(sorted(_KODY_SCO & set(kody)))}) "
                "— IRiESD ENEA Operator (wersja 2.3) II.4.5.4.7.1 pkt 1: SCO nie należy uruchamiać "
                "w liniach z jednostkami wytwórczymi.",
            )
        )
    if klasa == "DEDYKOWANE_WYTWORCY" and _KODY_SPZ & set(kody):
        niezgodnosci.append(
            _niezgodnosc(
                KOD_SPZ_W_POLU_DEDYKOWANYM,
                bay_ref,
                f"{opis_pola[0].upper()}{opis_pola[1:]} ({NAZWY_KLASY_POLA_PL[klasa]}) ma "
                f"samoczynne ponowne załączenie ({', '.join(sorted(_KODY_SPZ & set(kody)))}) — "
                f"{PODSTAWA_KLASY_POLA[klasa]} nie wymienia SPZ dla pola dedykowanego; ponowne "
                "załączenie linii z pracującą generacją grozi załączeniem niezsynchronizowanym.",
            )
        )
    if ajee and not rdzen_rozliczeniowy:
        niezgodnosci.append(
            _niezgodnosc(
                KOD_AJEE_BRAK_RDZENIA,
                bay_ref,
                f"{opis_pola[0].upper()}{opis_pola[1:]} wymaga pomiaru rozliczeniowego "
                f"i analizatora jakości energii — {przyczyna_ajee} — a przekładnik prądowy pola "
                "nie ma rdzenia rozliczeniowego.",
            )
        )
    obwody = szablon.obwody_wtorne if szablon is not None else None
    aparaty = {
        str(a.get("designation")): a
        for a in pole.get("primary_devices") or []
        if isinstance(a, Mapping) and a.get("designation")
    }
    opis_szablonu = (szablon.podstawa or szablon.template_id) if szablon is not None else ""
    return OcenaPolaLiniowego(
        bay_ref=bay_ref,
        klasa_zadeklarowana=str(zadeklarowana) if zadeklarowana is not None else None,
        klasa_z_sieci=z_sieci,
        klasa_oceny=klasa,
        klasa_przyjeta=zadeklarowana is None,
        moduly=moduly,
        odbiory=odbiory,
        linia_napowietrzna=linia_napowietrzna,
        ajee_wymagany=ajee,
        ajee_rdzen_obecny=rdzen_rozliczeniowy,
        ajee_przyczyna=przyczyna_ajee,
        oceny_funkcji=oceny,
        niezgodnosci=tuple(niezgodnosci),
        obwody_wtorne=obwody,
        obwody_funkcji=_obwody_funkcji(obwody, kody, aparaty, opis_szablonu),
        napiecie_zwrotne=_napiecie_zwrotne(obwody, pole, aparaty, kody, moduly),
    )


#: Numer rdzenia/uzwojenia zapisem rysunku standardu (I, II, III).
_RZYMSKIE = {1: "I", 2: "II", 3: "III", 4: "IV"}
_NAZWA_PRZEKLADNIKA_PL = {
    "RDZEN_CT": "przekładnika prądowego",
    "UZWOJENIE_VT": "przekładnika napięciowego",
}
_RODZAJ_OBWODU_PL = {"RDZEN_CT": "rdzeń", "UZWOJENIE_VT": "uzwojenie"}


def _opis_wejscia(wejscie: WejscieFunkcjiEaz, aparaty: Mapping[str, Mapping[str, Any]]) -> str:
    """Wejście funkcji rozwiązane na aparacie pola: tabliczka z rekordu pola (rdzeń CT,
    uzwojenie VT, przekładnia Ferrantiego) albo jawny brak aparatu w polu."""
    if wejscie.rodzaj == "SYGNAL":
        return f"sygnał „{wejscie.sygnal}”"
    aparat = aparaty.get(str(wejscie.aparat))
    if wejscie.rodzaj == "PRZEKLADNIK_FERRANTIEGO":
        if aparat is None or aparat.get("kind") != RODZAJ_APARATU_WEJSCIA[wejscie.rodzaj]:
            return f"przekładnik Ferrantiego {wejscie.aparat} — brak aparatu w polu"
        przekladnia = aparat.get("przekladnia")
        return f"przekładnik Ferrantiego {wejscie.aparat}" + (
            f", przekładnia {przekladnia}" if przekladnia else ", przekładnia nieopisana"
        )
    rodzaj_pl = _RODZAJ_OBWODU_PL[wejscie.rodzaj]
    # Numer obwodu jest wymagany dla rdzenia i uzwojenia (`WejscieFunkcjiEaz`); brak — jawny
    # opis, nie podstawiona liczba.
    numer = (
        "bez numeru" if wejscie.numer is None else _RZYMSKIE.get(wejscie.numer, str(wejscie.numer))
    )
    poczatek = f"{rodzaj_pl} {numer} {_NAZWA_PRZEKLADNIKA_PL[wejscie.rodzaj]} {wejscie.aparat}"
    oczekiwany = RODZAJ_APARATU_WEJSCIA[wejscie.rodzaj]
    if aparat is None or aparat.get("kind") != oczekiwany:
        return f"{poczatek} — brak aparatu w polu"
    tabliczki = aparat.get("rdzenie" if oczekiwany == "CT" else "uzwojenia") or []
    if wejscie.numer is None or wejscie.numer > len(tabliczki):
        return f"{poczatek} — tabliczka aparatu nie opisuje tego obwodu"
    t = tabliczki[wejscie.numer - 1]
    moc_va = _liczba(t.get("moc_va"))
    moc = "moc nieopisana" if moc_va is None else f"{moc_va:g} VA".replace(".", ",")
    return f"{poczatek}: {t.get('przekladnia')}, {moc}, klasa {t.get('klasa')}"


def _obwody_funkcji(
    obwody: ObwodyWtornePola | None,
    kody: list[str],
    aparaty: Mapping[str, Mapping[str, Any]],
    opis_szablonu: str,
) -> tuple[ObwodFunkcjiPola, ...]:
    """Obwody funkcji zestawu pola (kolejność `Bay.protection_codes`) i funkcji wzorca, których
    pole nie ma (``obecna = False`` — projektant widzi, czego brakuje względem rysunku)."""
    if obwody is None:
        return ()
    wg_kodu = {p.funkcja: p for p in obwody.powiazania}
    wynik: list[ObwodFunkcjiPola] = []
    for kod in [*kody, *(k for k in wg_kodu if k not in kody)]:
        p = wg_kodu.get(kod)
        if p is None:
            wynik.append(
                ObwodFunkcjiPola(
                    kod=kod,
                    funkcja_pl=opis_funkcji_eaz_pl(kod),
                    obecna=True,
                    blok_rysunku=None,
                    wejscia_pl=(
                        f"rysunek wzorca ({opis_szablonu}) nie rysuje tej funkcji — obwód "
                        "pomiarowy i wyjście dobiera projektant",
                    ),
                    wyjscia_pl="nieopisane we wzorcu",
                    weryfikacja="ZWERYFIKOWANE_NA_RYSUNKU",
                    uwaga=None,
                )
            )
            continue
        wyjscia = ", ".join(p.wyjscia)
        wynik.append(
            ObwodFunkcjiPola(
                kod=kod,
                funkcja_pl=opis_funkcji_eaz_pl(kod),
                obecna=kod in kody,
                blok_rysunku=p.blok_rysunku,
                wejscia_pl=tuple(_opis_wejscia(w, aparaty) for w in p.wejscia),
                wyjscia_pl=f"{wyjscia} → wyłącznik {p.wylacznik}" if p.wylacznik else wyjscia,
                weryfikacja=p.weryfikacja,
                uwaga=p.uwaga,
            )
        )
    return tuple(wynik)


def _napiecie_zwrotne(
    obwody: ObwodyWtornePola | None,
    pole: Mapping[str, Any],
    aparaty: Mapping[str, Mapping[str, Any]],
    kody: list[str],
    moduly: tuple[ModulZaPolem, ...],
) -> NapiecieZwrotnePola | None:
    """Napięcie zwrotne pola wzorca z blokadą NZ (Z.11.1/Z.11); `None` — wzorzec bez pomiaru."""
    nz = next((p for p in (obwody.powiazania if obwody else []) if p.funkcja == "NZ"), None)
    if nz is None:
        return None
    zrodla = sum(1 for m in moduly if m.p_kw > 0.0)
    if zrodla:
        wyjasnienie = (
            f"za polem pracuje {zrodla} moduł(y) wytwarzania — przy otwartym wyłączniku linia "
            "może pozostać pod napięciem; załączenie blokuje funkcja NZ (sygnał „Blok. ZW”)"
        )
    else:
        wyjasnienie = (
            "w konfiguracji normalnej za polem nie ma modułu wytwarzania — napięcie po stronie "
            "linii przy otwartym wyłączniku może pochodzić wyłącznie z zasilania od drugiego "
            "końca linii"
        )
    ruch = pole.get("runtime_state")
    lacznosc = ruch.get("secondary_communication_status") if isinstance(ruch, Mapping) else None
    if isinstance(ruch, Mapping) and lacznosc == "ok":
        pod = bool((ruch.get("energization_and_safety") or {}).get("energized_from_feeder_side"))
        stan = "POD_NAPIECIEM" if pod else "BEZ_NAPIECIA"
        stan_pl = (
            "pomiar: linia pod napięciem od strony odpływu"
            if pod
            else "pomiar: linia bez napięcia od strony odpływu"
        )
    else:
        stan = "NIEUSTALONY"
        stan_pl = (
            "stan z pomiaru nieustalony — model nie niesie rekordu ruchu pola z łącznością "
            "z urządzeniem polowym"
        )
    return NapiecieZwrotnePola(
        pomiar_pl="; ".join(_opis_wejscia(w, aparaty) for w in nz.wejscia)
        + f" (blok {nz.blok_rysunku}, wyjście „{', '.join(nz.wyjscia)}”)",
        blokada_nz="NZ" in kody,
        zrodla_za_polem=zrodla,
        mozliwe=zrodla > 0,
        wyjasnienie_pl=wyjasnienie,
        stan_pomiaru=stan,
        stan_pomiaru_pl=stan_pl,
    )


def oceny_pol_liniowych(enm: Mapping[str, Any]) -> list[OcenaPolaLiniowego]:
    """Oceny wszystkich pól liniowych GPZ modelu (kolejność rekordów pól — deterministyczna)."""
    wynik: list[OcenaPolaLiniowego] = []
    for pole in _lista(enm, "bays"):
        ocena = ocena_pola_liniowego(enm, pole)
        if ocena is not None:
            wynik.append(ocena)
    return wynik
