"""Zacisk gałęzi, przy którym stoi zabezpieczenie — JEDEN resolver (decyzja O-51, wariant (b)).

DLACZEGO. Gałąź z susceptancją albo z przekładnią ma na końcach RÓŻNE prądy (klasa P9),
więc prąd w miejscu zabezpieczenia to prąd zacisku, przy którym zabezpieczenie stoi — nie
prąd strony `from` z konwencji rdzenia rozpływu. Pakiet nastaw (orientacja całego pakietu:
„początek" odcinka = zacisk zabezpieczenia, „koniec" = drugi zacisk, kolejna strefa za
końcem, prąd obciążenia w miejscu zabezpieczenia) i prąd roboczy urządzeń koordynacji
czytają zacisk WYŁĄCZNIE stąd.

REGUŁA MODELU — KCL NA ŁAŃCUCHU SZEREGOWYM. Przekładnik prądowy przy wyłączniku mierzy
prąd zacisku gałęzi tylko wtedy, gdy wyłącznik stoi z tym zaciskiem W SZEREGU: od
wyłącznika idzie się przez węzły stopnia 2 (w węźle dokładnie dwa elementy mocy) i przez
elementy łączeniowe bez impedancji (łącznik, wyłącznik, odłącznik, łącznik szyn,
bezpiecznik) aż do pierwszego elementu niełączeniowego. Jest nim zacisk tej gałęzi —
zacisk wskazany (I prawo Kirchhoffa: w węźle stopnia 2 prąd wpływający = wypływający).
Cokolwiek innego (transformator, inna gałąź z impedancją, źródło, odbiór, generator,
bateria kondensatorów) albo węzeł z trzecim elementem mocy (szyna zbiorcza) kończy
łańcuch — model o tej gałęzi MILCZY. Stan łącznika (otwarty/zamknięty) nie ma znaczenia:
liczy się struktura, nie stan ruchowy. Pomiar na sieci GN_02 z jednym przypięciem przy
wyłączniku pola odgałęzienia: reguła „szyna wspólna z zaciskiem" przypisywała to
zabezpieczenie trzem liniom (w tym dwóm odcinkom magistrali wpiętym wprost w szynę
stacji obok trzech pól), reguła szeregowa — jednej (odgałęzieniu).

HIERARCHIA (bez domysłu):
1. MODEL — przypięcia (`ProtectionAssignment.breaker_ref`) urządzeń, które pakiet nastawia:
   typ katalogowy deklaruje co najmniej jedną z funkcji `FUNKCJE_PAKIETU_NASTAW`, a typ bez
   danych o funkcjach liczy się jako kandydat (bez zgadywania). Przypięcie w szeregu z
   jednym zaciskiem rozstrzyga ten zacisk; wskazanie zgodne jest zbędne, sprzeczne = odmowa.
2. Przypięcia w szeregu z OBOMA zaciskami (gałąź zasilana dwustronnie, pierścień) — wybór
   należy do inżyniera: wskazanie wybiera jedno z nich, brak wskazania = odmowa.
3. Model milczy — wymagane jawne wskazanie (`od` / `do`); brak = odmowa.
4. Wyłącznik w szeregu z oboma zaciskami TEJ SAMEJ gałęzi (pętla) = odmowa zawsze.

MIEJSCE URZĄDZENIA KOORDYNACJI (`miejsce_urzadzenia`, decyzja O-51 pkt 7): ta sama reguła
dla urządzenia wskazanego w przypadku obliczeniowym — łącznik jako miejsce urządzenia daje
gałąź i zacisk z łańcucha szeregowego (model), gałąź jako miejsce wymaga wskazania zacisku,
szyna nie ma zacisków. Prąd roboczy urządzenia = prąd TEGO zacisku z tabeli gałęzi.

Zakaz wnioskowania z topologii o „stronie zasilania" czy kierunku przepływu mocy — to
heurystyka (`protection_no_heuristics_guard`). Kody odmów są w kanonie kodów gotowości
(`domain/canonical_operations.py::READINESS_CODES`) — po jednym na przyczynę.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from application.analyses.protection.catalog.catalog_store import load_device_capability
from domain.canonical_operations import READINESS_CODES
from enm.nazwy_elementow import SPOZA_MODELU, nazwa_po_identyfikatorze
from enm.slownik_komunikatow import opis_nazwy
from network_model.catalog.repository import get_default_mv_catalog
from network_model.nazwy import nazwa_nadana

Zacisk = Literal["od", "do"]
ZrodloZacisku = Literal["model", "wskazanie"]

#: Oba zaciski gałęzi w kolejności kanonicznej (odpowiedzi API, listy kandydatów).
ZACISKI: tuple[Zacisk, ...] = ("od", "do")

KOD_BRAK_WSKAZANIA = "protection.relay_terminal_indication_missing"
KOD_WYBOR_ZACISKU = "protection.relay_terminal_choice_missing"
KOD_SPRZECZNY_Z_MODELEM = "protection.relay_terminal_contradicts_model"
KOD_PETLA_WYLACZNIKA = "protection.relay_terminal_breaker_loop"
KOD_LACZNIK_POZA_SZEREGIEM = "protection.device_breaker_not_in_series"

#: Rodzaje gałęzi ENM bez impedancji — elementy łączeniowe łańcucha szeregowego.
RODZAJE_LACZNIKOW: frozenset[str] = frozenset(
    {"breaker", "switch", "disconnector", "bus_coupler", "fuse"}
)

#: Kolekcje ENM, których elementy są ELEMENTAMI MOCY przyłączonymi do szyn. Każde pole
#: `EnergyNetworkModel` jest sklasyfikowane tu albo w `KOLEKCJE_BEZ_ELEMENTOW_MOCY`
#: (test przypina komplet — nowa kolekcja bez klasyfikacji czerwieni test, zamiast cicho
#: wypaść z reguły szeregowej).
KOLEKCJE_GALEZI_MOCY: tuple[tuple[str, str, str], ...] = (
    ("branches", "from_bus_ref", "to_bus_ref"),
    ("transformers", "hv_bus_ref", "lv_bus_ref"),
)
KOLEKCJE_WEZLOWE_MOCY: tuple[str, ...] = (
    "sources",
    "loads",
    "generators",
    "shunt_capacitors",
)
KOLEKCJE_BEZ_ELEMENTOW_MOCY: tuple[str, ...] = (
    "header",
    "buses",
    "substations",
    "bays",
    "junctions",
    "corridors",
    "measurements",
    "protection_assignments",
    "branch_points",
    "line_runs",
    "connection_nodes",
    "katalog_projektu",
)

#: Funkcje, które pakiet nastaw nastawia: stopnie FAZOWE I> (51) i I>> (50) metody Hoppela —
#: ziemnozwarciowych 50N/51N silnik nie wyznacza (`mapper.wymaganie_z_nastaw`).
FUNKCJE_PAKIETU_NASTAW: frozenset[str] = frozenset({"50", "51"})

#: Przestrzeń katalogu, w której `ProtectionAssignment.catalog_ref` wskazuje typ urządzenia.
PRZESTRZEN_KATALOGU_ZABEZPIECZEN = "ZABEZPIECZENIE"


@dataclass(frozen=True)
class ZaciskiGalezi:
    """Oba zaciski gałęzi z modelu: szyny i etykiety z nazwami szyn (dla interfejsu)."""

    galaz_ref: str
    szyna_od_ref: str
    szyna_do_ref: str
    etykieta_od_pl: str
    etykieta_do_pl: str

    def szyna(self, zacisk: Zacisk) -> str:
        return self.szyna_od_ref if zacisk == "od" else self.szyna_do_ref

    def to_dict(self) -> dict[str, dict[str, str]]:
        return {
            "od": {"szyna_ref": self.szyna_od_ref, "etykieta_pl": self.etykieta_od_pl},
            "do": {"szyna_ref": self.szyna_do_ref, "etykieta_pl": self.etykieta_do_pl},
        }


@dataclass(frozen=True)
class ZaciskZabezpieczenia:
    """Rozstrzygnięty zacisk zabezpieczenia i jego źródło (model albo wskazanie)."""

    zacisk: Zacisk
    zrodlo: ZrodloZacisku
    szyna_zacisku_ref: str
    szyna_przeciwna_ref: str


@dataclass(frozen=True)
class OdmowaZacisku:
    """Odmowa nazwana: kod z kanonu kodów i powód po polsku (z rejestru + szczegół)."""

    kod: str
    powod_pl: str

    def to_dict(self) -> dict[str, str]:
        return {"kod": self.kod, "powod_pl": self.powod_pl}


@dataclass(frozen=True)
class _Przylaczenie:
    element_ref: str
    laczeniowy: bool
    druga_szyna: str | None


def _odmowa(kod: str, szczegol: str) -> OdmowaZacisku:
    return OdmowaZacisku(kod=kod, powod_pl=f"{READINESS_CODES[kod].message_pl} — {szczegol}")


def _nazwy_szyn(snapshot: dict[str, Any]) -> dict[str, str]:
    """Szyna → nazwa w etykiecie zacisku: nazwa z modelu albo „bez nazwy" — nigdy
    identyfikator szyny (karta NAZWY-JEDNO-ZRODLO, klasa karty #144)."""
    return {
        szyna["ref_id"]: nazwa_nadana(szyna.get("name")) or "bez nazwy"
        for szyna in snapshot.get("buses") or []
        if isinstance(szyna, dict) and isinstance(szyna.get("ref_id"), str)
    }


def zaciski_galezi(snapshot: dict[str, Any] | None, galaz_ref: str) -> ZaciskiGalezi | None:
    """Zaciski gałęzi (linia, kabel, łącznik) albo transformatora z migawki ENM.

    Transformator: zacisk `od` = szyna GN, `do` = szyna DN — ta sama definicja co graf
    obliczeniowy (`enm/mapping.py`: `from_node_id = hv_bus_ref`). Gałęzi nie ma = `None`.
    """
    migawka = snapshot or {}
    nazwy = _nazwy_szyn(migawka)
    for galaz in migawka.get("branches") or []:
        if isinstance(galaz, dict) and galaz.get("ref_id") == galaz_ref:
            od, do = galaz.get("from_bus_ref"), galaz.get("to_bus_ref")
            if isinstance(od, str) and isinstance(do, str):
                return _zaciski(galaz_ref, od, do, nazwy)
            return None
    for transformator in migawka.get("transformers") or []:
        if isinstance(transformator, dict) and transformator.get("ref_id") == galaz_ref:
            gn, dn = transformator.get("hv_bus_ref"), transformator.get("lv_bus_ref")
            if isinstance(gn, str) and isinstance(dn, str):
                return _zaciski(galaz_ref, gn, dn, nazwy)
            return None
    return None


def _zaciski(galaz_ref: str, od: str, do: str, nazwy: dict[str, str]) -> ZaciskiGalezi:
    return ZaciskiGalezi(
        galaz_ref=galaz_ref,
        szyna_od_ref=od,
        szyna_do_ref=do,
        etykieta_od_pl=f"Zacisk początkowy — szyna {nazwy.get(od, SPOZA_MODELU)}",
        etykieta_do_pl=f"Zacisk końcowy — szyna {nazwy.get(do, SPOZA_MODELU)}",
    )


def _przylaczenia(snapshot: dict[str, Any]) -> dict[str, list[_Przylaczenie]]:
    """Szyna → elementy mocy przyłączone do niej (z drugą szyną elementu dwuwęzłowego)."""
    wezly: dict[str, list[_Przylaczenie]] = {}
    for kolekcja, pole_a, pole_b in KOLEKCJE_GALEZI_MOCY:
        for element in snapshot.get(kolekcja) or []:
            if not isinstance(element, dict) or not isinstance(element.get("ref_id"), str):
                continue
            a, b = element.get(pole_a), element.get(pole_b)
            laczeniowy = kolekcja == "branches" and element.get("type") in RODZAJE_LACZNIKOW
            for szyna, druga in ((a, b), (b, a)):
                if isinstance(szyna, str):
                    wezly.setdefault(szyna, []).append(
                        _Przylaczenie(
                            element_ref=element["ref_id"],
                            laczeniowy=laczeniowy,
                            druga_szyna=druga if isinstance(druga, str) else None,
                        )
                    )
    for kolekcja in KOLEKCJE_WEZLOWE_MOCY:
        for element in snapshot.get(kolekcja) or []:
            if isinstance(element, dict) and isinstance(element.get("bus_ref"), str):
                wezly.setdefault(element["bus_ref"], []).append(
                    _Przylaczenie(
                        element_ref=str(element.get("ref_id")),
                        laczeniowy=False,
                        druga_szyna=None,
                    )
                )
    return wezly


def _koniec_lancucha(
    wezly: dict[str, list[_Przylaczenie]], szyna: str, skad_ref: str
) -> tuple[_Przylaczenie, str] | None:
    """Idź łańcuchem szeregowym od `szyna` (wejście elementem `skad_ref`) — pierwszy
    element NIEłączeniowy na końcu łańcucha i szyna, na której się go spotkało, albo
    `None` (węzeł z trzecim elementem mocy, węzeł końcowy, pętla samych łączników)."""
    odwiedzone = {skad_ref}
    while True:
        inne = [p for p in wezly.get(szyna, []) if p.element_ref != skad_ref]
        if len(inne) != 1:
            return None  # węzeł końcowy albo węzeł z trzecim elementem mocy (szyna zbiorcza)
        nastepny = inne[0]
        if not nastepny.laczeniowy:
            return nastepny, szyna
        if nastepny.element_ref in odwiedzone or nastepny.druga_szyna is None:
            return None  # pętla samych łączników — nie prowadzi do elementu mocy
        odwiedzone.add(nastepny.element_ref)
        skad_ref, szyna = nastepny.element_ref, nastepny.druga_szyna


def _zacisk_na_koncu_lancucha(
    wezly: dict[str, list[_Przylaczenie]],
    szyna: str,
    skad_ref: str,
    zaciski: ZaciskiGalezi,
) -> Zacisk | None:
    """Zacisk gałęzi `zaciski` na końcu łańcucha szeregowego albo `None` (łańcuch kończy
    się czymś innym)."""
    koniec = _koniec_lancucha(wezly, szyna, skad_ref)
    if koniec is None or koniec[0].element_ref != zaciski.galaz_ref:
        return None
    return "od" if koniec[1] == zaciski.szyna_od_ref else "do"


def zacisk_lacznika_w_szeregu(
    snapshot: dict[str, Any] | None, lacznik_ref: str, zaciski: ZaciskiGalezi
) -> Zacisk | None | OdmowaZacisku:
    """Zacisk gałęzi `zaciski`, z którym łącznik `lacznik_ref` stoi W SZEREGU (KCL).

    `None` — łącznik nie stoi w szeregu z żadnym zaciskiem tej gałęzi (albo nie jest
    elementem łączeniowym modelu). Odmowa — łącznik w szeregu z OBOMA zaciskami (pętla).
    """
    migawka = snapshot or {}
    return _zacisk_lacznika(migawka, _przylaczenia(migawka), lacznik_ref, zaciski)


def _zacisk_lacznika(
    migawka: dict[str, Any],
    wezly: dict[str, list[_Przylaczenie]],
    lacznik_ref: str,
    zaciski: ZaciskiGalezi,
) -> Zacisk | None | OdmowaZacisku:
    lacznik = next(
        (
            g
            for g in migawka.get("branches") or []
            if isinstance(g, dict)
            and g.get("ref_id") == lacznik_ref
            and g.get("type") in RODZAJE_LACZNIKOW
        ),
        None,
    )
    if lacznik is None:
        return None
    trafione = {
        zacisk
        for szyna in (lacznik.get("from_bus_ref"), lacznik.get("to_bus_ref"))
        if isinstance(szyna, str)
        and (zacisk := _zacisk_na_koncu_lancucha(wezly, szyna, lacznik_ref, zaciski)) is not None
    }
    if len(trafione) > 1:
        return _odmowa(
            KOD_PETLA_WYLACZNIKA,
            f"łącznik {lacznik_ref} stoi w szeregu z oboma zaciskami gałęzi {zaciski.galaz_ref}.",
        )
    return next(iter(trafione), None)


def funkcje_typu_zabezpieczenia(
    catalog_ref: str | None, catalog_namespace: str | None
) -> tuple[str, ...] | None:
    """Funkcje zadeklarowane przez typ katalogowy urządzenia albo `None` (brak danych).

    Droga: katalog MV (przestrzeń `ZABEZPIECZENIE`) → `analytical_library_ref` → biblioteka
    analityczna (`functions_supported`). Brak referencji, typ spoza katalogu, typ bez
    powiązania z biblioteką, powiązanie zerwane albo pusta lista = `None` (brak danych,
    nie domysł).
    """
    if not catalog_ref or catalog_namespace not in (
        None,
        PRZESTRZEN_KATALOGU_ZABEZPIECZEN,
    ):
        return None
    typ = get_default_mv_catalog().get_protection_device_type(catalog_ref)
    if typ is None or not typ.analytical_library_ref:
        return None
    zdolnosc = load_device_capability(typ.analytical_library_ref)
    if zdolnosc is None or not zdolnosc.functions_supported:
        return None
    return tuple(zdolnosc.functions_supported)


def _urzadzenie_pakietu(przypisanie: dict[str, Any]) -> bool:
    """Czy przypięte urządzenie jest nastawiane przez pakiet (filtr funkcji z katalogu):
    typ deklaruje funkcję z `FUNKCJE_PAKIETU_NASTAW` albo nie ma danych o funkcjach."""
    catalog_ref = przypisanie.get("catalog_ref")
    przestrzen = przypisanie.get("catalog_namespace")
    funkcje = funkcje_typu_zabezpieczenia(
        catalog_ref if isinstance(catalog_ref, str) else None,
        przestrzen if isinstance(przestrzen, str) else None,
    )
    return funkcje is None or not FUNKCJE_PAKIETU_NASTAW.isdisjoint(funkcje)


def zaciski_z_przypiec(
    snapshot: dict[str, Any] | None, zaciski: ZaciskiGalezi
) -> frozenset[Zacisk] | OdmowaZacisku:
    """Zaciski gałęzi wskazane przez przypięcia urządzeń pakietu (łańcuch szeregowy).

    Pusty zbiór — model milczy. Odmowa — któryś wyłącznik z przypięciem stoi w szeregu z
    oboma zaciskami gałęzi (pętla).
    """
    migawka = snapshot or {}
    wezly = _przylaczenia(migawka)
    wskazane: set[Zacisk] = set()
    for przypisanie in migawka.get("protection_assignments") or []:
        if not isinstance(przypisanie, dict) or not isinstance(przypisanie.get("breaker_ref"), str):
            continue
        if not _urzadzenie_pakietu(przypisanie):
            continue
        zacisk = _zacisk_lacznika(migawka, wezly, przypisanie["breaker_ref"], zaciski)
        if isinstance(zacisk, OdmowaZacisku):
            return zacisk
        if zacisk is not None:
            wskazane.add(zacisk)
    return frozenset(wskazane)


def rozstrzygnij_zacisk(
    snapshot: dict[str, Any] | None,
    galaz_ref: str,
    wskazanie: Zacisk | None,
) -> ZaciskZabezpieczenia | OdmowaZacisku:
    """JEDNO rozstrzygnięcie zacisku zabezpieczenia gałęzi: model → wskazanie → odmowa."""
    zaciski = zaciski_galezi(snapshot, galaz_ref)
    if zaciski is None:
        return _odmowa(KOD_BRAK_WSKAZANIA, f"gałęzi {galaz_ref} nie ma w migawce modelu.")
    z_przypiec = zaciski_z_przypiec(snapshot, zaciski)
    if isinstance(z_przypiec, OdmowaZacisku):
        return z_przypiec
    if not z_przypiec:
        if wskazanie is None:
            return _odmowa(
                KOD_BRAK_WSKAZANIA,
                f"gałąź {galaz_ref}: {zaciski.etykieta_od_pl} albo {zaciski.etykieta_do_pl}.",
            )
        return _rozstrzygniety(zaciski, wskazanie, "wskazanie")
    if wskazanie is None:
        if len(z_przypiec) == 1:
            return _rozstrzygniety(zaciski, next(iter(z_przypiec)), "model")
        return _odmowa(
            KOD_WYBOR_ZACISKU,
            f"gałąź {galaz_ref}: {zaciski.etykieta_od_pl} albo {zaciski.etykieta_do_pl}.",
        )
    if wskazanie not in z_przypiec:
        (zacisk_modelu,) = tuple(z_przypiec)
        return _odmowa(
            KOD_SPRZECZNY_Z_MODELEM,
            f"zabezpieczenie gałęzi {galaz_ref} stoi w szeregu z zaciskiem {zacisk_modelu} "
            f"({zaciski.szyna(zacisk_modelu)}), wskazano {wskazanie}.",
        )
    return _rozstrzygniety(zaciski, wskazanie, "model" if len(z_przypiec) == 1 else "wskazanie")


def _rozstrzygniety(
    zaciski: ZaciskiGalezi, zacisk: Zacisk, zrodlo: ZrodloZacisku
) -> ZaciskZabezpieczenia:
    przeciwny: Zacisk = "do" if zacisk == "od" else "od"
    return ZaciskZabezpieczenia(
        zacisk=zacisk,
        zrodlo=zrodlo,
        szyna_zacisku_ref=zaciski.szyna(zacisk),
        szyna_przeciwna_ref=zaciski.szyna(przeciwny),
    )


# ---------------------------------------------------------------------------
# Miejsce urządzenia koordynacji (przypadek obliczeniowy) — ten sam resolver
# ---------------------------------------------------------------------------

RodzajLokalizacji = Literal["galaz", "lacznik", "szyna", "brak"]


@dataclass(frozen=True)
class MiejsceUrzadzenia:
    """Gałąź i jej zacisk, których prąd płynie przez urządzenie koordynacji (KCL)."""

    galaz_ref: str
    zacisk: Zacisk
    zrodlo: ZrodloZacisku
    zaciski: ZaciskiGalezi


def rodzaj_lokalizacji(snapshot: dict[str, Any] | None, lokalizacja_ref: str) -> RodzajLokalizacji:
    """Rola elementu wskazanego jako lokalizacja urządzenia: gałąź z impedancją (linia,
    kabel, transformator), łącznik (wyłącznik, łącznik, odłącznik, łącznik szyn,
    bezpiecznik), szyna albo brak elementu w modelu."""
    migawka = snapshot or {}
    for galaz in migawka.get("branches") or []:
        if isinstance(galaz, dict) and galaz.get("ref_id") == lokalizacja_ref:
            return "lacznik" if galaz.get("type") in RODZAJE_LACZNIKOW else "galaz"
    for transformator in migawka.get("transformers") or []:
        if isinstance(transformator, dict) and transformator.get("ref_id") == lokalizacja_ref:
            return "galaz"
    for szyna in migawka.get("buses") or []:
        if isinstance(szyna, dict) and szyna.get("ref_id") == lokalizacja_ref:
            return "szyna"
    return "brak"


def miejsce_urzadzenia(
    snapshot: dict[str, Any] | None,
    lokalizacja_ref: str,
    wskazanie: Zacisk | None,
) -> MiejsceUrzadzenia | OdmowaZacisku | None:
    """Miejsce prądu urządzenia koordynacji wskazanego w przypadku — TA SAMA hierarchia co
    pakiet nastaw (decyzja O-51, pkt 7).

    - Lokalizacja = ŁĄCZNIK: gałąź i zacisk z MODELU — łańcuch szeregowy od łącznika
      (reguła KCL, `_koniec_lancucha`) kończy się zaciskiem gałęzi z impedancją; wskazanie
      jest zbędne, sprzeczne = odmowa; łańcuch bez zacisku gałęzi (szyna zbiorcza,
      odbiór, źródło) = odmowa; oba końce łańcucha na TEJ SAMEJ gałęzi = pętla. Oba końce
      na RÓŻNYCH gałęziach niosą ten sam prąd (węzły stopnia 2 — I prawo Kirchhoffa),
      więc rozstrzyga koniec strony `from` łącznika (kolejność deterministyczna).
    - Lokalizacja = GAŁĄŹ (linia, kabel, transformator): model nie wie, przy którym końcu
      stoi urządzenie — wymagane jawne wskazanie, brak = odmowa.
    - Lokalizacja = szyna albo element spoza modelu: `None` (brak zacisków — prąd gałęzi
      nie dotyczy tej lokalizacji).
    """
    migawka = snapshot or {}
    rodzaj = rodzaj_lokalizacji(migawka, lokalizacja_ref)
    if rodzaj in ("szyna", "brak"):
        return None
    if rodzaj == "galaz":
        zaciski = zaciski_galezi(migawka, lokalizacja_ref)
        if zaciski is None:
            return None
        if wskazanie is None:
            return _odmowa(
                KOD_BRAK_WSKAZANIA,
                f"gałąź {lokalizacja_ref}: {zaciski.etykieta_od_pl} albo "
                f"{zaciski.etykieta_do_pl}.",
            )
        return MiejsceUrzadzenia(
            galaz_ref=lokalizacja_ref,
            zacisk=wskazanie,
            zrodlo="wskazanie",
            zaciski=zaciski,
        )
    lacznik = next(
        g
        for g in migawka.get("branches") or []
        if isinstance(g, dict) and g.get("ref_id") == lokalizacja_ref
    )
    wezly = _przylaczenia(migawka)
    konce: list[tuple[str, Zacisk, ZaciskiGalezi]] = []
    for szyna in (lacznik.get("from_bus_ref"), lacznik.get("to_bus_ref")):
        if not isinstance(szyna, str):
            continue
        koniec = _koniec_lancucha(wezly, szyna, lokalizacja_ref)
        if koniec is None:
            continue
        zaciski_konca = zaciski_galezi(migawka, koniec[0].element_ref)
        if zaciski_konca is None:
            continue  # koniec łańcucha nie jest gałęzią z impedancją (odbiór, źródło…)
        zacisk: Zacisk = "od" if koniec[1] == zaciski_konca.szyna_od_ref else "do"
        konce.append((koniec[0].element_ref, zacisk, zaciski_konca))
    if not konce:
        return _odmowa(
            KOD_LACZNIK_POZA_SZEREGIEM,
            f"łącznik {lokalizacja_ref}: po obu stronach szyna z innymi przyłączeniami, "
            "odbiór albo źródło.",
        )
    if len(konce) == 2 and konce[0][0] == konce[1][0]:
        return _odmowa(
            KOD_PETLA_WYLACZNIKA,
            f"łącznik {lokalizacja_ref} stoi w szeregu z oboma zaciskami gałęzi {konce[0][0]}.",
        )
    galaz_ref, zacisk_modelu, zaciski_modelu = konce[0]
    if wskazanie is not None and wskazanie != zacisk_modelu:
        return _odmowa(
            KOD_SPRZECZNY_Z_MODELEM,
            f"łącznik {lokalizacja_ref} stoi w szeregu z zaciskiem {zacisk_modelu} gałęzi "
            f"{galaz_ref} ({zaciski_modelu.szyna(zacisk_modelu)}), wskazano {wskazanie}.",
        )
    return MiejsceUrzadzenia(
        galaz_ref=galaz_ref,
        zacisk=zacisk_modelu,
        zrodlo="model",
        zaciski=zaciski_modelu,
    )


def opis_miejsca_urzadzenia(
    snapshot: dict[str, Any] | None,
    lokalizacja_ref: str,
    wskazanie: Zacisk | None,
) -> dict[str, Any]:
    """Rekord rozstrzygnięcia miejsca urządzenia dla interfejsu i API (etykiety zacisków
    z nazwami szyn, odmowa nazwana) — bez własnej logiki: wynik `miejsce_urzadzenia`."""
    rodzaj = rodzaj_lokalizacji(snapshot, lokalizacja_ref)
    wynik = miejsce_urzadzenia(snapshot, lokalizacja_ref, wskazanie)
    zaciski_lokalizacji = zaciski_galezi(snapshot, lokalizacja_ref) if rodzaj == "galaz" else None
    if isinstance(wynik, MiejsceUrzadzenia):
        zaciski_opisu: ZaciskiGalezi | None = wynik.zaciski
    else:
        zaciski_opisu = zaciski_lokalizacji
    return {
        "lokalizacja_ref": lokalizacja_ref,
        "rodzaj_lokalizacji": rodzaj,
        "zaciski": zaciski_opisu.to_dict() if zaciski_opisu is not None else None,
        "galaz_ref": wynik.galaz_ref if isinstance(wynik, MiejsceUrzadzenia) else None,
        "zacisk": wynik.zacisk if isinstance(wynik, MiejsceUrzadzenia) else None,
        "zrodlo_zacisku": (wynik.zrodlo if isinstance(wynik, MiejsceUrzadzenia) else None),
        "wymaga_wskazania_zacisku": rodzaj == "galaz",
        "odmowa_zacisku": wynik.to_dict() if isinstance(wynik, OdmowaZacisku) else None,
    }


def zaciski_galezi_migawki(snapshot: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    """Etykiety obu zacisków KAŻDEJ gałęzi z impedancją (linia, kabel, transformator)
    migawki — ta sama definicja zacisków co resolver (`zaciski_galezi`); dla formularzy,
    w których inżynier wskazuje zacisk (np. miejsce pomiaru mocy gałęzi)."""
    migawka = snapshot or {}
    refy = [
        g["ref_id"]
        for g in migawka.get("branches") or []
        if isinstance(g, dict)
        and isinstance(g.get("ref_id"), str)
        and g.get("type") not in RODZAJE_LACZNIKOW
    ] + [
        t["ref_id"]
        for t in migawka.get("transformers") or []
        if isinstance(t, dict) and isinstance(t.get("ref_id"), str)
    ]
    wynik: dict[str, dict[str, Any]] = {}
    for ref in sorted(refy):
        zaciski = zaciski_galezi(migawka, ref)
        if zaciski is not None:
            wynik[ref] = zaciski.to_dict()
    return wynik


def szyny_zwarcia_lokalizacji(
    snapshot: dict[str, Any] | None,
    urzadzenia: list[tuple[str, Zacisk | None]],
) -> tuple[dict[str, str], dict[str, str]]:
    """Szyna, na której leży prąd zwarciowy urządzenia koordynacji — szyna ZACISKU gałęzi
    rozstrzygniętego przez `miejsce_urzadzenia` (decyzja O-51 pkt 7; TO SAMO rozstrzygnięcie,
    z którego ekran koordynacji czyta prąd zwarciowy i roboczy urządzenia).

    Wiersze biegu zwarciowego są per szyna, a kontrakt koordynacji kluczuje prądy
    lokalizacją urządzenia — dla urządzenia na gałęzi albo łączniku prąd zwarciowy
    lokalizacji to prąd szyny jego zacisku. Zwraca `(szyny, odmowy)`:
    - `szyny[lokalizacja]` — szyna zacisku (lokalizacja-gałąź ze wskazaniem, łącznik
      rozstrzygnięty przez model),
    - `odmowy[lokalizacja]` — powód, dla którego lokalizacja NIE ma szyny zwarcia: odmowa
      resolvera (brak wskazania, sprzeczność, łącznik poza szeregiem, pętla) albo dwa
      urządzenia w tej samej lokalizacji przy RÓŻNYCH szynach (jedna lokalizacja nie
      może nieść dwóch prądów zwarciowych).
    Lokalizacja-szyna i element spoza modelu nie trafiają do żadnego słownika (prąd
    zwarciowy lokalizacji = prąd tej lokalizacji w biegu)."""
    szyny: dict[str, str] = {}
    odmowy: dict[str, str] = {}
    for lokalizacja, wskazanie in urzadzenia:
        if lokalizacja in odmowy:
            continue
        wynik = miejsce_urzadzenia(snapshot, lokalizacja, wskazanie)
        if wynik is None:
            continue
        if isinstance(wynik, OdmowaZacisku):
            szyny.pop(lokalizacja, None)
            odmowy[lokalizacja] = wynik.powod_pl
            continue
        szyna = wynik.zaciski.szyna(wynik.zacisk)
        poprzednia = szyny.get(lokalizacja)
        if poprzednia is not None and poprzednia != szyna:
            del szyny[lokalizacja]
            odmowy[lokalizacja] = (
                f"lokalizacja {lokalizacja}: urządzenia przy dwóch różnych zaciskach "
                f"(szyny {min(poprzednia, szyna)} i {max(poprzednia, szyna)}) — prąd "
                "zwarciowy jest kluczowany lokalizacją, więc jedna lokalizacja nie może "
                "nieść dwóch prądów; wskaż urządzenia przez łączniki pól."
            )
            continue
        szyny[lokalizacja] = szyna
    return szyny, odmowy


#: Prefiks kluczy urządzeń koordynacji w `ProtectionConfig.overrides` przypadku — ten sam,
#: którym zapisuje je ekran koordynacji (`frontend/…/nastawyPrzypadku.ts`).
PREFIKS_URZADZENIA_KOORDYNACJI = "coordination_device:"


def odmowy_zaciskow_urzadzen(
    snapshot: dict[str, Any] | None, overrides: dict[str, Any]
) -> list[str]:
    """Powody odrzucenia zapisu urządzeń koordynacji przypadku (walidacja ADDYTYWNA pola
    `zacisk`, decyzja O-51 pkt 7): zacisk spoza {`od`, `do`}, zacisk przy lokalizacji bez
    zacisków (szyna, element spoza modelu), zacisk sprzeczny z modelem, łącznik poza
    łańcuchem szeregowym albo pętla. Urządzenie bez pola `zacisk` nie jest sprawdzane —
    brak wskazania nie blokuje zapisu (prąd roboczy zostaje wtedy nazwanym brakiem).
    `snapshot` = `None` (przypadek bez modelu) — sprawdzany jest wyłącznie literał."""
    powody: list[str] = []
    for klucz in sorted(overrides):
        urzadzenie = overrides[klucz]
        if not klucz.startswith(PREFIKS_URZADZENIA_KOORDYNACJI) or not isinstance(urzadzenie, dict):
            continue
        zacisk = urzadzenie.get("zacisk")
        if zacisk is None:
            continue
        # Urządzenie nazywa jego nazwa z ekranu koordynacji albo opis braku — nigdy klucz
        # urządzenia w nastawach przypadku (karta NAZWY-JEDNO-ZRODLO).
        urzadzenie_pl = opis_nazwy(urzadzenie.get("name"), "Urządzenie")
        if zacisk not in ZACISKI:
            powody.append(f"{urzadzenie_pl}: zacisk {zacisk!r} — dozwolone 'od' albo 'do'.")
            continue
        if snapshot is None:
            continue
        lokalizacja = urzadzenie.get("location_element_id")
        wynik = (
            miejsce_urzadzenia(snapshot, lokalizacja, zacisk)
            if isinstance(lokalizacja, str)
            else None
        )
        if wynik is None:
            powody.append(
                f"{urzadzenie_pl}: zacisk podany dla lokalizacji bez zacisków "
                f"({nazwa_po_identyfikatorze(lokalizacja, snapshot)}) — zacisk dotyczy gałęzi "
                "albo łącznika."
            )
        elif isinstance(wynik, OdmowaZacisku):
            powody.append(f"{urzadzenie_pl}: {wynik.powod_pl}")
    return powody


__all__ = [
    "FUNKCJE_PAKIETU_NASTAW",
    "KOD_BRAK_WSKAZANIA",
    "KOD_LACZNIK_POZA_SZEREGIEM",
    "KOD_PETLA_WYLACZNIKA",
    "KOD_SPRZECZNY_Z_MODELEM",
    "KOD_WYBOR_ZACISKU",
    "KOLEKCJE_BEZ_ELEMENTOW_MOCY",
    "KOLEKCJE_GALEZI_MOCY",
    "KOLEKCJE_WEZLOWE_MOCY",
    "MiejsceUrzadzenia",
    "OdmowaZacisku",
    "PREFIKS_URZADZENIA_KOORDYNACJI",
    "RODZAJE_LACZNIKOW",
    "RodzajLokalizacji",
    "ZACISKI",
    "Zacisk",
    "ZaciskZabezpieczenia",
    "ZaciskiGalezi",
    "ZrodloZacisku",
    "funkcje_typu_zabezpieczenia",
    "miejsce_urzadzenia",
    "odmowy_zaciskow_urzadzen",
    "opis_miejsca_urzadzenia",
    "rodzaj_lokalizacji",
    "rozstrzygnij_zacisk",
    "szyny_zwarcia_lokalizacji",
    "zacisk_lacznika_w_szeregu",
    "zaciski_galezi",
    "zaciski_galezi_migawki",
    "zaciski_z_przypiec",
]
