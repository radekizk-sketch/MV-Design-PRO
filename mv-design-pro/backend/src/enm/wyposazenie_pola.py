"""W5-C: wyposażenie pola SN/WN — operacja ``set_bay_equipment`` i trzy stany danych aparatu.

PO CO. Rysunek pola (SLD) i każdy czytelnik aparatów pola (`field_read_model`, blokady
uziemnika, tor zasilania) czyta ``Bay.primary_devices``. Pole bez szablonu dostawało pustą
listę, a renderer rysował wtedy pole „z konwencji" — bez danych, ale bez nazwania tego.
Projektant nie miał operacji, która wyposażenie pola USTAWIA po jego utworzeniu. Ta
operacja ją daje, catalog-first, a stan danych każdego aparatu jest nazwany:

* ``MODEL`` — aparat z pozycją katalogową (``catalog_ref``): dana projektowa z dowodem —
  pozycja katalogu aparatów (tryb ``katalog``) albo szablon aparatu z BOM-u katalogowego
  pola rodziny rozdzielnicy (tryb ``szablon`` z polem producenta,
  ``BayDeviceInstanceTemplate.device_template_ref``);
* ``PROPOZYCJA`` — aparat z szablonu pola albo rodzaju bez katalogu SN (głowica kablowa,
  wkładka bezpiecznikowa, transformator pola): WARTOŚĆ ROBOCZA. Odpowiedź operacji niesie
  ją jako ``DanaPrzyjeta`` z jakością ``ESTIMATED`` (kontrakt werdyktu wyjaśnialnego —
  dana przyjęta bez pełnej walidacji ma nazwę, powód i jakość, nigdy nie jest „pewna");
* ``BRAK_DANYCH`` — pole bez aparatów (``primary_devices == []``).

Stan wyprowadza ``stan_danych_aparatu`` / ``stan_danych_wyposazenia`` z ``catalog_ref``
PROJEKCJI aparatów (``projekcja_aparatow_pola``) — bez nowego pola zapisanego obok.

JEDNA PRAWDA TYPU ŁĄCZNIKA (karta KATALOG-APARATURA-WN). Aparat łączeniowy pola wskazujący
gałąź modelu (``linked_ref``: wyłącznik, rozłącznik, odłącznik) NIE niesie własnej pozycji
katalogowej — jego typem jest wiązanie katalogowe gałęzi (``catalog_ref`` w przestrzeni
``APARAT_SN``), to samo, które czyta materializacja, fizyka i weryfikacja wytrzymałości
(``application/analyses/aparaty_pol``). Rekord pola przechowuje wskazanie gałęzi, a odczyt
(``projekcja_aparatow_pola``) dokłada typ z gałęzi. Pozycja podana w ładunku dla aparatu
z gałęzią jest PRZYPISYWANA GAŁĘZI tą samą operacją, co ``assign_catalog_to_element`` (ta
sama brama katalogowa i materializacja tabliczki) — drugiej kopii nie ma, więc zmiana typu
łącznika jest od razu widoczna w polu i w weryfikacji.

TRZY TRYBY (``mode``):

* ``katalog`` — lista ``devices`` od projektanta. Rodzaj z katalogiem (wyłącznik,
  rozłącznik, odłącznik, uziemnik — APARAT_SN; przekładnik prądowy — CT; przekładnik
  napięciowy — VT; ogranicznik przepięć — OGRANICZNIK_SN) WYMAGA pozycji tej przestrzeni
  (brama istnienia ``domain_operations_v2._pozycja_katalogu``) — w ładunku albo, dla aparatu
  z gałęzią, z wiązania gałęzi — a dla APARAT_SN zgodnego ``device_kind`` pozycji. Rodzaj
  bez katalogu SN nie przyjmuje ``catalog_ref``. Rodzina rozdzielnicy pola
  (``switchgear_family_ref``) zawęża rodzaje do ``allowed_apparatus_kinds``.
* ``szablon`` — aparaty z szablonu pola (``bay_template_ref`` z ładunku albo z rekordu)
  przez TEN SAM resolver, co budowa pola (``pole_katalogowe.aparaty_pola_z_referencji``):
  szablon kanoniczny daje propozycję, katalogowe pole rodziny — aparaty z BOM-u. Szablon
  opisuje pole rozdzielnicy SN — szablon na szynie spoza pasma SN jest odmową.
* ``wyczysc`` — usunięcie wyposażenia (stan ``BRAK_DANYCH``).

KONTROLA NAPIĘCIA (PN-EN 62271-1 p. 5.2). Aparat z pozycją katalogową musi mieć napięcie
znamionowe U_r nie mniejsze niż najwyższe napięcie sieci U_m pola (para IEC 60038 z napięcia
szyny pola) — JEDEN predykat ``pasma_napieciowe.napiecie_aparatu_wystarcza``. Aparat
o zbyt niskim U_r to błąd modelu (aparat innej klasy napięciowej), więc odmowa nazwana
z liczbami; pozycja bez U_r (typy przekładników nie niosą napięcia izolacji) albo pole bez napięcia
szyny dają rekord „nie oceniono" z przyczyną — brak danej nie jest zgodnością.

WYMAGANE STANDARDEM / ZAPROJEKTOWANE / BRAKUJĄCE. Szablon pola (``bay_template_ref`` rekordu
albo ładunku) wyznacza aparaty wymagane standardem (skład pola ze źródłem —
``BayTemplate.podstawa_pl``). Każdy wymagany aparat jest ZAPROJEKTOWANY (pole ma aparat tego
rodzaju) albo BRAKUJĄCY. Każdy aparat pola niesie ``wymagany_standardem``. Pole bez szablonu nie ma listy wymagań — rekord
nazywa to wprost.

GRANICE (nazwane, nie przemilczane). Operacja NIE ocenia doboru prądowego aparatu (I_r ≥
I_obc, I_th/I_dyn ≥ prądy zwarciowe) — to kryteria warstwy analizy (weryfikacja
wytrzymałości aparatury) z wynikiem liczbowym biegu i limitem. Operacja NIE ustawia stanu
łącznika — stan żyje na gałęzi (``status``/``normal_state``, operacje ``open_switch``/
``close_switch``/``set_normal_open_point``), a aparat pola wskazuje ją ``linked_ref``.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from typing import Any, Literal, get_args

from network_model.catalog.bay_templates import BAY_TEMPLATE_REGISTRY
from network_model.catalog.switchgear.apparatus_vocabulary import FAMILY_APPARATUS_FOR_ENM_KIND
from network_model.catalog.switchgear.errors import NiezgodnoscKonfiguracjiError
from network_model.catalog.switchgear.families import SWITCHGEAR_FAMILY_REGISTRY
from network_model.pochodne.pasma_napieciowe import (
    napiecie_aparatu_wystarcza,
    napiecie_najwyzsze_urzadzen_kv,
    pasmo_napieciowe,
)
from pydantic import BaseModel
from werdykt.kontrakt import DanaPrzyjeta
from werdykt.proweniencja import FieldQuality

from .domain_operations import (
    _error_response,
    _konfiguracja_pola,
    _response,
    assign_catalog_to_element,
)
from .katalog_projektu import katalog_biezacy
from .kopia_graniczna import kopia_graniczna_enm
from .models import BayPrimaryDevice, EnergyNetworkModel
from .pola import czy_pole_nn, napiecia_szyn, poziom_pol, zmien_pole
from .pola import pole as pole_modelu
from .pole_katalogowe import aparaty_pola_z_referencji, pole_katalogowe
from .slownik_komunikatow import (
    lista_pl,
    opis_elementu,
    opis_obiektu,
    opis_pozycji_katalogu,
    pole,
)
from .topology import TYPY_LACZNIKOW_ENM

StanDanychAparatu = Literal["MODEL", "PROPOZYCJA", "BRAK_DANYCH"]
TrybWyposazenia = Literal["katalog", "szablon", "wyczysc"]

#: Rodzaj aparatu pierwotnego pola → przestrzeń katalogu SN. JEDYNA tablica tej reguły.
PRZESTRZEN_KATALOGU_APARATU: dict[str, str] = {
    "CB": "APARAT_SN",
    "LOAD_SWITCH": "APARAT_SN",
    "DS": "APARAT_SN",
    "ES": "APARAT_SN",
    "CT": "CT",
    "VT": "VT",
    "SURGE_ARRESTER": "OGRANICZNIK_SN",
}

#: Rodzaj aparatu APARAT_SN (``MVApparatusType.device_kind``) dopuszczony dla rodzaju
#: aparatu pierwotnego pola. Reklozer jest wyłącznikiem z automatyką SPZ; rozłącznik
#: bezpiecznikowy — rozłącznikiem pola transformatorowego (wkładki są jego częścią).
RODZAJE_KATALOGOWE_APARATU: dict[str, frozenset[str]] = {
    "CB": frozenset({"WYLACZNIK", "REKLOZER"}),
    "LOAD_SWITCH": frozenset({"ROZLACZNIK", "ROZLACZNIK_BEZPIECZNIKOWY"}),
    "DS": frozenset({"ODLACZNIK"}),
    "ES": frozenset({"UZIEMNIK"}),
}

#: Rodzaje aparatu pola SN bez katalogu SN w repozytorium — przyjmowane wyłącznie jako
#: wartość robocza (``PROPOZYCJA``), nigdy z ``catalog_ref``.
RODZAJE_BEZ_KATALOGU_SN: frozenset[str] = frozenset({"FUSE", "CABLE_HEAD", "TRANSFORMER_DEVICE"})

#: Rodzaje aparatu wskazujące gałąź łącznikową modelu (``linked_ref``) — ich stan
#: (otwarty/zamknięty) jest stanem tej gałęzi.
RODZAJE_Z_GALEZIA: frozenset[str] = frozenset({"CB", "LOAD_SWITCH", "DS", "FUSE"})
#: Rodzaje z rolą uziemienia (``earthing_role``).
RODZAJE_Z_ROLA_UZIEMIENIA: frozenset[str] = frozenset({"ES", "SURGE_ARRESTER"})
#: Aparaty łączeniowe toru (sterowalne) — ta sama reguła, co szablony pola.
RODZAJE_STEROWALNE: frozenset[str] = frozenset({"CB", "LOAD_SWITCH", "DS"})

_UMIEJSCOWIENIA: frozenset[str] = frozenset(
    get_args(BayPrimaryDevice.model_fields["placement"].annotation)
)

#: Nazwa rodzaju aparatu w zdaniu dla projektanta.
NAZWY_RODZAJOW_APARATU_POLA_PL: dict[str, str] = {
    "CB": "wyłącznik",
    "LOAD_SWITCH": "rozłącznik",
    "DS": "odłącznik",
    "ES": "uziemnik",
    "CT": "przekładnik prądowy",
    "VT": "przekładnik napięciowy",
    "SURGE_ARRESTER": "ogranicznik przepięć",
    "FUSE": "bezpieczniki",
    "CABLE_HEAD": "głowica kablowa",
    "TRANSFORMER_DEVICE": "transformator pola",
}


def stan_danych_aparatu(aparat: Mapping[str, Any] | BayPrimaryDevice) -> StanDanychAparatu:
    """``MODEL`` gdy aparat ma pozycję katalogową, inaczej ``PROPOZYCJA`` (wartość robocza)."""
    ref = aparat.get("catalog_ref") if isinstance(aparat, Mapping) else aparat.catalog_ref
    return "MODEL" if isinstance(ref, str) and ref.strip() else "PROPOZYCJA"


def stan_danych_wyposazenia(
    aparaty: Sequence[Mapping[str, Any]] | Sequence[BayPrimaryDevice],
) -> StanDanychAparatu:
    """Stan danych wyposażenia pola: ``BRAK_DANYCH`` (brak aparatów), ``MODEL`` (każdy
    aparat z katalogu), inaczej ``PROPOZYCJA`` (co najmniej jedna wartość robocza)."""
    if not aparaty:
        return "BRAK_DANYCH"
    stany = {stan_danych_aparatu(a) for a in aparaty}
    return "MODEL" if stany == {"MODEL"} else "PROPOZYCJA"


def dane_przyjete_wyposazenia(aparaty: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Aparaty w stanie ``PROPOZYCJA`` jako dane przyjęte (kontrakt werdyktu, jakość
    ``ESTIMATED``) — w kolejności aparatów pola."""
    wynik: list[dict[str, Any]] = []
    for aparat in aparaty:
        if stan_danych_aparatu(aparat) != "PROPOZYCJA":
            continue
        rodzaj = NAZWY_RODZAJOW_APARATU_POLA_PL.get(str(aparat.get("kind")), "aparat")
        oznaczenie = aparat.get("designation")
        nazwa = f"{rodzaj} {oznaczenie}" if oznaczenie else rodzaj
        powod = (
            "rodzaj aparatu bez katalogu SN — przyjęty z szablonu pola jako wartość robocza"
            if aparat.get("kind") in RODZAJE_BEZ_KATALOGU_SN
            else "aparat z szablonu pola bez pozycji katalogowej — wartość robocza do "
            "zastąpienia wyborem z katalogu"
        )
        wynik.append(
            DanaPrzyjeta(
                nazwa_pl=nazwa,
                wartosc=None,
                powod_pl=powod,
                jakosc=FieldQuality.ESTIMATED,
            ).model_dump(mode="json")
        )
    return wynik


# ---------------------------------------------------------------------------
# Jedna prawda typu łącznika pola — projekcja aparatów z wiązania gałęzi
# ---------------------------------------------------------------------------

#: Przestrzeń katalogu gałęzi łącznikowej pola SN/WN — typ aparatu łączeniowego.
PRZESTRZEN_GALEZI_APARATU = "APARAT_SN"

#: Rodzaje aparatu, których typem jest wiązanie gałęzi (``linked_ref``): rodzaje z gałęzią
#: łącznikową i katalogiem APARAT_SN. Bezpieczniki (FUSE) wskazują gałąź, ale nie mają
#: katalogu SN — ich gałąź nie nadaje im typu.
RODZAJE_Z_TYPEM_GALEZI: frozenset[str] = frozenset(
    rodzaj
    for rodzaj in RODZAJE_Z_GALEZIA
    if PRZESTRZEN_KATALOGU_APARATU.get(rodzaj) == PRZESTRZEN_GALEZI_APARATU
)


def _pole_obiektu(obiekt: object, klucz: str) -> object:
    if isinstance(obiekt, Mapping):
        return obiekt.get(klucz)
    return getattr(obiekt, klucz, None)


def _lista_obiektu(obiekt: object, klucz: str) -> list[object]:
    """Kolekcja obiektu (lista albo krotka) — inna wartość to brak kolekcji."""
    wartosc = _pole_obiektu(obiekt, klucz)
    return list(wartosc) if isinstance(wartosc, list | tuple) else []


def _napis(wartosc: object) -> str | None:
    return wartosc.strip() if isinstance(wartosc, str) and wartosc.strip() else None


def katalog_galezi_lacznikowych(
    enm: Mapping[str, Any] | EnergyNetworkModel,
) -> dict[str, str | None]:
    """Referencja gałęzi łącznikowej → jej pozycja katalogu APARAT_SN (``None`` = gałąź bez
    wiązania aparatu SN). Migawka (słownik) albo model — ten sam wynik."""
    wynik: dict[str, str | None] = {}
    for galaz in _lista_obiektu(enm, "branches"):
        ref = _napis(_pole_obiektu(galaz, "ref_id"))
        if ref is None or _pole_obiektu(galaz, "type") not in TYPY_LACZNIKOW_ENM:
            continue
        przestrzen = _pole_obiektu(galaz, "catalog_namespace")
        catalog_ref = _napis(_pole_obiektu(galaz, "catalog_ref"))
        wynik[ref] = catalog_ref if przestrzen == PRZESTRZEN_GALEZI_APARATU else None
    return wynik


def typ_z_galezi(aparat: Mapping[str, Any]) -> bool:
    """Czy typ aparatu pola pochodzi z wiązania gałęzi — JEDEN predykat zapisu
    (``set_bay_equipment`` nie zapisuje ``catalog_ref``) i odczytu (projekcja go dokłada)."""
    return (
        aparat.get("kind") in RODZAJE_Z_TYPEM_GALEZI
        and _napis(aparat.get("linked_ref")) is not None
    )


def projekcja_aparatow_pola(
    aparaty: Iterable[Mapping[str, Any] | BayPrimaryDevice],
    katalog_galezi: Mapping[str, str | None],
) -> list[dict[str, Any]]:
    """Aparaty pola z typem łącznika z gałęzi modelu (jedna prawda — docstring modułu).

    Aparat z typem z gałęzi dostaje ``catalog_ref`` jej wiązania APARAT_SN (gałąź bez
    wiązania = aparat bez pozycji, stan ``PROPOZYCJA``); każdy inny aparat — bez zmian.
    """
    wynik: list[dict[str, Any]] = []
    for aparat in aparaty:
        rekord = (
            aparat.model_dump(mode="json", exclude_none=True)
            if isinstance(aparat, BaseModel)
            else {k: v for k, v in aparat.items() if v is not None}
        )
        if typ_z_galezi(rekord):
            rekord.pop("catalog_ref", None)
            typ = katalog_galezi.get(str(rekord["linked_ref"]).strip())
            if typ is not None:
                rekord["catalog_ref"] = typ
        wynik.append(rekord)
    return wynik


# ---------------------------------------------------------------------------
# Kontrola napięcia aparatu względem sieci pola (PN-EN 62271-1 p. 5.2)
# ---------------------------------------------------------------------------

PODSTAWA_KONTROLI_NAPIECIA_PL = (
    "PN-EN 62271-1 p. 5.2 (napięcie znamionowe aparatu nie mniejsze niż najwyższe napięcie "
    "sieci) i IEC 60038 tab. 3–5 (najwyższe napięcie urządzeń dla napięcia znamionowego sieci)"
)


def _kv(wartosc: float) -> str:
    return f"{wartosc:g}".replace(".", ",")


def napiecie_znamionowe_pozycji_kv(przestrzen: str | None, catalog_ref: object) -> float | None:
    """Napięcie znamionowe aparatu U_r [kV] z pozycji katalogu (``None`` = pozycja go nie
    podaje). APARAT_SN — ``u_n_kv`` (napięcie znamionowe aparatu, nie sieci); ogranicznik —
    ``u_m_kv`` (najwyższe napięcie urządzenia z karty). Typy przekładników (``CTType``,
    ``VTType``) nie niosą napięcia izolacji — przekładnik daje ``None`` (nie oceniono), a nie
    wartość z domysłu."""
    ref = _napis(catalog_ref)
    if ref is None or przestrzen is None:
        return None
    katalog = katalog_biezacy()
    wartosc: object
    if przestrzen == PRZESTRZEN_GALEZI_APARATU:
        wartosc = getattr(katalog.mv_apparatus_types.get(ref), "u_n_kv", None)
    elif przestrzen == "OGRANICZNIK_SN":
        wartosc = getattr(katalog.surge_arrester_types.get(ref), "u_m_kv", None)
    else:
        return None
    if not isinstance(wartosc, int | float) or wartosc <= 0:
        return None
    return float(wartosc)


def kontrola_napiecia_aparatu(
    aparat: Mapping[str, Any], napiecie_sieci_kv: float | None
) -> dict[str, Any]:
    """Napięcie znamionowe aparatu względem najwyższego napięcia sieci pola — rekord z liczbami,
    limitem, marginesem, podstawą i wyjaśnieniem (``napiecie_wystarcza``: ``None`` = nie
    oceniono, przyczyna w wyjaśnieniu)."""
    przestrzen = PRZESTRZEN_KATALOGU_APARATU.get(str(aparat.get("kind")))
    u_r = napiecie_znamionowe_pozycji_kv(przestrzen, aparat.get("catalog_ref"))
    u_m = napiecie_najwyzsze_urzadzen_kv(napiecie_sieci_kv)
    wystarcza = napiecie_aparatu_wystarcza(u_r, napiecie_sieci_kv)
    if wystarcza is not None and u_r is not None and u_m is not None:
        relacja = "≥" if wystarcza else "<"
        assert napiecie_sieci_kv is not None
        wyjasnienie = (
            f"Napięcie znamionowe aparatu U_r = {_kv(u_r)} kV {relacja} najwyższe napięcie "
            f"sieci U_m = {_kv(u_m)} kV (sieć {_kv(napiecie_sieci_kv)} kV)"
            + ("." if wystarcza else " — aparat innej klasy napięciowej nie może pracować w polu.")
        )
    elif przestrzen is None:
        wyjasnienie = (
            "Nie oceniono: rodzaj aparatu bez katalogu SN — napięcia znamionowego nie ma "
            "z czego odczytać."
        )
    elif _napis(aparat.get("catalog_ref")) is None:
        wyjasnienie = (
            "Nie oceniono: aparat bez pozycji katalogowej (wartość robocza z szablonu) — "
            "napięcie znamionowe poda pozycja wybrana z katalogu."
        )
    elif u_r is None:
        wyjasnienie = (
            "Nie oceniono: pozycja katalogowa nie podaje napięcia znamionowego aparatu "
            "(najwyższego napięcia urządzenia)."
        )
    else:
        wyjasnienie = (
            "Nie oceniono: napięcie szyny pola nieznane albo w paśmie nN — najwyższego "
            "napięcia sieci nie da się wyznaczyć."
        )
    return {
        "u_r_kv": u_r,
        "napiecie_sieci_kv": napiecie_sieci_kv,
        "u_m_sieci_kv": u_m,
        "margines_kv": (u_r - u_m) if u_r is not None and u_m is not None else None,
        "napiecie_wystarcza": wystarcza,
        "podstawa_pl": PODSTAWA_KONTROLI_NAPIECIA_PL,
        "wyjasnienie_pl": wyjasnienie,
    }


def napiecie_sieci_pola(
    enm: Mapping[str, Any] | EnergyNetworkModel,
    rekord: object,
    napiecia: Mapping[str, float | None] | None = None,
) -> float | None:
    """Napięcie znamionowe sieci pola [kV] — napięcie szyny pola (``bus_ref``)."""
    szyna = _napis(_pole_obiektu(rekord, "bus_ref"))
    if szyna is None:
        return None
    return (napiecia if napiecia is not None else napiecia_szyn(enm)).get(szyna)


# ---------------------------------------------------------------------------
# Wymagane standardem / zaprojektowane / brakujące
# ---------------------------------------------------------------------------

StanWymaganegoAparatu = Literal["ZAPROJEKTOWANY", "BRAKUJACY"]


def _opis_wymaganego_aparatu_pl(pozycja: Mapping[str, Any]) -> str:
    """Rodzaj aparatu słowami i jego oznaczenie ze szablonu (np. „odłącznik Q31”)."""
    nazwa = NAZWY_RODZAJOW_APARATU_POLA_PL.get(str(pozycja["kind"]), "aparat")
    oznaczenie = pozycja.get("designation")
    return f"{nazwa} {oznaczenie}" if oznaczenie else nazwa


def wymagania_standardu(
    *,
    bay_ref: str,
    bay_template_ref: object,
    switchgear_family_ref: object,
    aparaty: Sequence[Mapping[str, Any]],
) -> tuple[dict[str, Any], list[bool]]:
    """Aparaty wymagane standardem (szablon pola) × aparaty pola (po projekcji).

    Zwraca rekord wymagań i — w kolejności ``aparaty`` — znacznik ``wymagany_standardem``
    każdego aparatu pola. Dopasowanie po rodzaju w kolejności szablonu (deterministyczne).
    """
    znaczniki = [False] * len(aparaty)
    ref = _napis(bay_template_ref)
    if ref is None:
        return {
            "bay_template_ref": None,
            "podstawa_pl": None,
            "pozycje": [],
            "liczba_wymaganych": 0,
            "liczba_zaprojektowanych": 0,
            "liczba_brakujacych": 0,
            "wyjasnienie_pl": (
                "Pole bez szablonu — lista aparatów wymaganych standardem nieustalona; wskaż "
                "szablon pola, aby porównać wyposażenie z wymaganiami."
            ),
        }, znaczniki
    szablon = BAY_TEMPLATE_REGISTRY.get(ref)
    katalogowy = pole_katalogowe(ref)
    try:
        wymagane = aparaty_pola_z_referencji(
            field_ref=bay_ref,
            bay_template_ref=ref,
            switchgear_family_ref=_napis(switchgear_family_ref),
        )
    except NiezgodnoscKonfiguracjiError as blad:
        return {
            "bay_template_ref": ref,
            "podstawa_pl": None,
            "pozycje": [],
            "liczba_wymaganych": 0,
            "liczba_zaprojektowanych": 0,
            "liczba_brakujacych": 0,
            "wyjasnienie_pl": f"Lista aparatów wymaganych standardem nieustalona: {blad}",
        }, znaczniki
    if szablon is not None:
        podstawa = szablon.podstawa_pl or f"Szablon pola „{szablon.name}” (skład kanoniczny pola)."
    elif katalogowy is not None:
        podstawa = "Skład pola z BOM-u katalogowego pola rodziny rozdzielnicy."
    else:
        podstawa = None
    zuzyte: set[int] = set()
    pozycje: list[dict[str, Any]] = []
    for wymagany in wymagane:
        rodzaj = wymagany.get("kind")
        indeks = next(
            (i for i, a in enumerate(aparaty) if i not in zuzyte and a.get("kind") == rodzaj),
            None,
        )
        if indeks is not None:
            zuzyte.add(indeks)
            znaczniki[indeks] = True
        stan: StanWymaganegoAparatu = "ZAPROJEKTOWANY" if indeks is not None else "BRAKUJACY"
        pozycje.append(
            {
                "kind": rodzaj,
                "designation": wymagany.get("designation"),
                "placement": wymagany.get("placement"),
                "stan": stan,
                "device_ref": aparaty[indeks].get("device_ref") if indeks is not None else None,
            }
        )
    liczby = Counter(p["stan"] for p in pozycje)
    brakujace = [p for p in pozycje if p["stan"] == "BRAKUJACY"]
    return {
        "bay_template_ref": ref,
        "podstawa_pl": podstawa,
        "pozycje": pozycje,
        "liczba_wymaganych": len(pozycje),
        "liczba_zaprojektowanych": liczby["ZAPROJEKTOWANY"],
        "liczba_brakujacych": liczby["BRAKUJACY"],
        "wyjasnienie_pl": (
            "Brakuje aparatów wymaganych standardem: "
            f"{lista_pl([_opis_wymaganego_aparatu_pl(p) for p in brakujace], 'i')}."
            if brakujace
            else (
                "Pole ma każdy aparat wymagany standardem."
                if pozycje
                else "Szablon pola nie wymaga aparatów pierwotnych."
            )
        ),
    }, znaczniki


def opis_wyposazenia_pola(
    enm: Mapping[str, Any] | EnergyNetworkModel,
    rekord: object,
    aparaty: Sequence[Mapping[str, Any] | BayPrimaryDevice],
    *,
    katalog_galezi: Mapping[str, str | None] | None = None,
    napiecia: Mapping[str, float | None] | None = None,
) -> dict[str, Any]:
    """Wyposażenie pola dla projektanta — JEDNO złożenie dla odpowiedzi operacji
    i read-modelu pola: projekcja typu łącznika z gałęzi, stan danych, dane przyjęte, kontrola
    napięcia każdego aparatu i wymagania standardu z szablonu pola.

    ``katalog_galezi`` / ``napiecia`` — zebrane raz przez wołającego, który opisuje wiele pól
    jednego modelu (read-model pola); brak = zebrane z ``enm``."""
    bay_ref = str(_pole_obiektu(rekord, "ref_id"))
    projekcja = projekcja_aparatow_pola(
        aparaty, katalog_galezi if katalog_galezi is not None else katalog_galezi_lacznikowych(enm)
    )
    napiecie = napiecie_sieci_pola(enm, rekord, napiecia)
    wymagania, wymagany = wymagania_standardu(
        bay_ref=bay_ref,
        bay_template_ref=_pole_obiektu(rekord, "bay_template_ref"),
        switchgear_family_ref=_pole_obiektu(rekord, "switchgear_family_ref"),
        aparaty=projekcja,
    )
    return {
        "bay_ref": bay_ref,
        "stan_danych": stan_danych_wyposazenia(projekcja),
        "aparaty": [
            {
                "device_ref": a.get("device_ref"),
                "kind": a.get("kind"),
                "catalog_ref": a.get("catalog_ref"),
                "typ_z_galezi": typ_z_galezi(a),
                "stan_danych": stan_danych_aparatu(a),
                "wymagany_standardem": wymagany[i],
                "kontrola_napiecia": kontrola_napiecia_aparatu(a, napiecie),
            }
            for i, a in enumerate(projekcja)
        ],
        "dane_przyjete": dane_przyjete_wyposazenia(projekcja),
        "wymagania_standardu": wymagania,
    }


def aparaty_za_niskiego_napiecia(
    enm: Mapping[str, Any] | EnergyNetworkModel,
) -> list[dict[str, Any]]:
    """Każdy aparat modelu z pozycją katalogową, którego napięcie znamionowe jest niższe od
    najwyższego napięcia sieci w miejscu zainstalowania — kontrola modelu dla aparatów
    wstawionych operacjami innymi niż ``set_bay_equipment`` (gałąź łącznikowa z wiązaniem
    APARAT_SN, przekładnik ``measurements``, ogranicznik pola, aparat pola bez gałęzi).

    Ta sama kontrola (``kontrola_napiecia_aparatu`` → ``napiecie_aparatu_wystarcza``), którą
    ``set_bay_equipment`` odmawia zapisu — jeden predykat dla odmowy i dla zgłoszenia.
    Wpis: ``element_ref``, ``rodzaj`` (rodzaj aparatu pola; łącznik toru — przestrzeń APARAT_SN
    jak wyłącznik), ``catalog_ref``, ``opis_pl`` (element i pozycja katalogu słowami),
    ``kontrola_napiecia``; kolejność deterministyczna po ``element_ref``."""
    napiecia = napiecia_szyn(enm)
    wynik: dict[str, dict[str, Any]] = {}

    def sprawdz(ref: object, rodzaj: str, catalog_ref: object, szyna: object, opis_pl: str) -> None:
        element = _napis(ref)
        katalog = _napis(catalog_ref)
        if element is None or katalog is None or element in wynik:
            return
        bus = _napis(szyna)
        kontrola = kontrola_napiecia_aparatu(
            {"kind": rodzaj, "catalog_ref": katalog}, napiecia.get(bus) if bus else None
        )
        if kontrola["napiecie_wystarcza"] is False:
            wynik[element] = {
                "element_ref": element,
                "rodzaj": rodzaj,
                "catalog_ref": katalog,
                "opis_pl": (
                    f"{opis_pl} "
                    f"({opis_pozycji_katalogu(katalog, PRZESTRZEN_KATALOGU_APARATU[rodzaj], 'typ')})"
                ),
                "kontrola_napiecia": kontrola,
            }

    for galaz in _lista_obiektu(enm, "branches"):
        if _pole_obiektu(galaz, "catalog_namespace") != PRZESTRZEN_GALEZI_APARATU:
            continue
        # Łącznik łączy szyny tego samego napięcia; kontrola wobec szyny początkowej.
        sprawdz(
            _pole_obiektu(galaz, "ref_id"),
            "CB",
            _pole_obiektu(galaz, "catalog_ref"),
            _pole_obiektu(galaz, "from_bus_ref"),
            opis_obiektu(galaz, "Łącznik"),
        )
    for pomiar in _lista_obiektu(enm, "measurements"):
        rodzaj = _pole_obiektu(pomiar, "measurement_type")
        if rodzaj not in ("CT", "VT"):
            continue
        sprawdz(
            _pole_obiektu(pomiar, "ref_id"),
            str(rodzaj),
            _pole_obiektu(pomiar, "catalog_ref"),
            _pole_obiektu(pomiar, "bus_ref"),
            opis_obiektu(
                pomiar, "Przekładnik prądowy" if rodzaj == "CT" else "Przekładnik napięciowy"
            ),
        )
    for rekord in _lista_obiektu(enm, "bays"):
        szyna = _pole_obiektu(rekord, "bus_ref")
        w_polu = opis_obiektu(rekord, "pole")
        for ogranicznik in _lista_obiektu(rekord, "surge_arresters"):
            sprawdz(
                _pole_obiektu(ogranicznik, "device_ref"),
                "SURGE_ARRESTER",
                _pole_obiektu(ogranicznik, "catalog_ref"),
                szyna,
                f"Ogranicznik przepięć w polu: {w_polu}",
            )
        for aparat in _lista_obiektu(rekord, "primary_devices"):
            rodzaj = _pole_obiektu(aparat, "kind")
            if rodzaj not in PRZESTRZEN_KATALOGU_APARATU or (
                rodzaj in RODZAJE_Z_TYPEM_GALEZI
                and _napis(_pole_obiektu(aparat, "linked_ref")) is not None
            ):
                continue
            nazwa = NAZWY_RODZAJOW_APARATU_POLA_PL.get(str(rodzaj), "aparat").capitalize()
            oznaczenie = _pole_obiektu(aparat, "designation")
            sprawdz(
                _pole_obiektu(aparat, "device_ref"),
                str(rodzaj),
                _pole_obiektu(aparat, "catalog_ref"),
                szyna,
                (
                    f"{nazwa} {oznaczenie} w polu: {w_polu}"
                    if oznaczenie
                    else f"{nazwa} w polu: {w_polu}"
                ),
            )
    return [wynik[ref] for ref in sorted(wynik)]


def laczniki_wn_bez_typu(enm: Mapping[str, Any] | EnergyNetworkModel) -> list[dict[str, Any]]:
    """Łączniki topologii zasilania 110 kV (pasmo WN) bez wiązania katalogowego.

    Strona 110 kV jest granicą zasilania GPZ (decyzja właściciela 2026-10-22): łącznik 110 kV
    wchodzi do modelu wyłącznie jako łącznik topologii ze stanem łączeniowym, a reguła
    wiązania katalogowego wymaga mu typu (katalog ma jeden typ minimalny na rodzaj:
    ``sw-cb-110kv``, ``sw-ds-110kv``). Pole bez wskazanego aparatu jest kanoniczne
    (``add_sn_bay`` przyjmuje je tak samo na szynie SN i 110 kV — aparat dobiera się później),
    a łącznik bez typu wchodzi też z modelu zewnętrznego (import); ta lista jest jednym
    źródłem ostrzeżenia walidatora dla obu dróg. Wpis: ``element_ref``, ``opis_pl``,
    ``napiecie_kv``; kolejność po ``element_ref``."""
    napiecia = napiecia_szyn(enm)
    wynik: list[dict[str, Any]] = []
    for galaz in _lista_obiektu(enm, "branches"):
        if _pole_obiektu(galaz, "type") not in TYPY_LACZNIKOW_ENM:
            continue
        ref = _napis(_pole_obiektu(galaz, "ref_id"))
        szyna = _napis(_pole_obiektu(galaz, "from_bus_ref"))
        napiecie = napiecia.get(szyna) if szyna is not None else None
        if ref is None or napiecie is None or pasmo_napieciowe(napiecie) != "WN":
            continue
        if _napis(_pole_obiektu(galaz, "catalog_ref")) is not None:
            continue
        wynik.append(
            {
                "element_ref": ref,
                "opis_pl": (
                    f"{opis_obiektu(galaz, 'Łącznik')} na szynie {_kv(napiecie)} kV"
                ),
                "napiecie_kv": napiecie,
            }
        )
    return sorted(wynik, key=lambda w: str(w["element_ref"]))


def _odpowiedz(
    nowy: dict[str, Any], bay_ref: str, aparaty: list[dict[str, Any]], galezie: Sequence[str]
) -> dict[str, Any]:
    wynik = _response(
        nowy,
        updated=[bay_ref, *galezie],
        selection_id=bay_ref,
        selection_type="bay",
        events=[{"event_seq": 1, "event_type": "BAY_EQUIPMENT_SET", "element_id": bay_ref}],
    )
    if "error" in wynik:
        return wynik
    rekord = pole_modelu(nowy, bay_ref)
    assert rekord is not None  # pole istnieje — operacja właśnie je zmieniła
    wynik["wyposazenie_pola"] = opis_wyposazenia_pola(nowy, rekord, aparaty)
    return wynik


def _napiecie_szablonu_odmowa(
    enm: dict[str, Any], bay_ref: str, ref: str, napiecie_sieci_kv: float | None
) -> dict[str, Any] | None:
    """Kanoniczny szablon pola opisuje pole rozdzielnicy SN — szablon na szynie spoza pasma
    SN to odmowa (strona 110 kV jest granicą zasilania GPZ, nie przedmiotem projektu pól —
    decyzja właściciela 2026-10-22). Katalogowe pole rodziny ma własną bramę napięcia rodziny
    (``family_validation.czy_rodzina_obsluguje_napiecie``); napięcie szyny nieznane nie
    rozstrzyga."""
    szablon = BAY_TEMPLATE_REGISTRY.get(ref)
    pasmo = pasmo_napieciowe(napiecie_sieci_kv)
    if szablon is None or pasmo is None or napiecie_sieci_kv is None or pasmo == "SN":
        return None
    return _error_response(
        f"Pole {pole('bay_template_ref', 'set_bay_equipment')}: szablon „{szablon.name}” opisuje "
        f"skład pola rozdzielnicy SN, a {opis_elementu(enm, bay_ref, 'pole')} leży na szynie "
        f"{_kv(napiecie_sieci_kv)} kV — szablony pól dotyczą wyłącznie rozdzielnicy SN.",
        "bay_equipment.template_voltage_mismatch",
    )


def _aparaty_z_szablonu(
    enm: dict[str, Any], rekord: dict[str, Any], payload: dict[str, Any]
) -> tuple[list[dict[str, Any]], str] | dict[str, Any]:
    bay_ref = str(rekord["ref_id"])
    ref = payload.get("bay_template_ref") or rekord.get("bay_template_ref")
    if not isinstance(ref, str) or not ref.strip():
        return _error_response(
            f"{opis_elementu(enm, bay_ref, 'Pole')} nie ma szablonu — wskaż szablon pola w "
            f"polu {pole('bay_template_ref', 'set_bay_equipment')}.",
            "bay_equipment.template_missing",
        )
    kanoniczny = BAY_TEMPLATE_REGISTRY.get(ref)
    katalogowy = pole_katalogowe(ref)
    rola = (
        kanoniczny.bay_role
        if kanoniczny is not None
        else katalogowy.bay_role if katalogowy is not None else None
    )
    if rola is None:
        return _error_response(
            f"Pole {pole('bay_template_ref', 'set_bay_equipment')}: katalog nie zna wskazanego "
            "szablonu pola.",
            "bay_equipment.template_unknown",
        )
    if rola != rekord.get("bay_role"):
        return _error_response(
            f"Pole {pole('bay_template_ref', 'set_bay_equipment')}: szablon opisuje pole innej "
            f"funkcji niż {opis_elementu(enm, bay_ref, 'pole')} — wyposażenie z szablonu innej "
            "funkcji nie odpowiada polu w modelu.",
            "bay_equipment.template_role_mismatch",
        )
    odmowa = _napiecie_szablonu_odmowa(enm, bay_ref, ref, napiecie_sieci_pola(enm, rekord))
    if odmowa is not None:
        return odmowa
    aparaty = aparaty_pola_z_referencji(
        field_ref=bay_ref,
        bay_template_ref=ref,
        switchgear_family_ref=rekord.get("switchgear_family_ref"),
    )
    return aparaty, ref


def _sprawdz_aparat(
    enm: dict[str, Any],
    rekord: dict[str, Any],
    indeks: int,
    wpis: object,
    galezie: Mapping[str, str | None],
) -> tuple[dict[str, Any], str | None] | dict[str, Any]:
    """Aparat z ładunku trybu ``katalog`` → (rekord ``BayPrimaryDevice``, pozycja do
    przypisania gałęzi aparatu albo ``None``) albo odmowa (słownik z kluczem ``error``).

    ``galezie`` — gałęzie łącznikowe modelu z ich typem APARAT_SN
    (``katalog_galezi_lacznikowych``)."""
    bay_ref = str(rekord["ref_id"])
    numer = indeks + 1
    if not isinstance(wpis, Mapping):
        return _error_response(
            f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} nie jest opisem "
            "aparatu (rodzaj, umiejscowienie, pozycja katalogowa).",
            "bay_equipment.device_invalid",
        )
    rodzaj = wpis.get("kind")
    if rodzaj not in PRZESTRZEN_KATALOGU_APARATU and rodzaj not in RODZAJE_BEZ_KATALOGU_SN:
        dopuszczalne = lista_pl(
            NAZWY_RODZAJOW_APARATU_POLA_PL[k]
            for k in (*PRZESTRZEN_KATALOGU_APARATU, *sorted(RODZAJE_BEZ_KATALOGU_SN))
        )
        return _error_response(
            f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} ma rodzaj spoza "
            f"aparatów pola SN — dopuszczalne: {dopuszczalne}.",
            "bay_equipment.kind_not_allowed",
        )
    nazwa_rodzaju = NAZWY_RODZAJOW_APARATU_POLA_PL[str(rodzaj)]
    umiejscowienie = wpis.get("placement")
    if umiejscowienie not in _UMIEJSCOWIENIA:
        return _error_response(
            f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} ({nazwa_rodzaju}) "
            "nie ma umiejscowienia w torze pola (od szyny, w torze, od strony linii, poza "
            "torem, odgałęzienie do ziemi).",
            "bay_equipment.placement_invalid",
        )
    rodzina_ref = rekord.get("switchgear_family_ref")
    if isinstance(rodzina_ref, str) and rodzina_ref in SWITCHGEAR_FAMILY_REGISTRY:
        rodzina = SWITCHGEAR_FAMILY_REGISTRY[rodzina_ref]
        aparat_rodziny = FAMILY_APPARATUS_FOR_ENM_KIND.get(str(rodzaj))
        if aparat_rodziny is not None and aparat_rodziny not in rodzina.allowed_apparatus_kinds:
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: rodzina rozdzielnicy "
                f"{opis_elementu(enm, bay_ref, 'pola')} nie przewiduje aparatu „{nazwa_rodzaju}” "
                f"(aparat {numer}).",
                "bay_equipment.family_disallows",
            )

    rola_uziemienia = wpis.get("earthing_role")
    if rola_uziemienia is not None and rodzaj not in RODZAJE_Z_ROLA_UZIEMIENIA:
        return _error_response(
            f"Pole {pole('devices', 'set_bay_equipment')}: rolę uziemienia ma wyłącznie "
            f"uziemnik i ogranicznik przepięć, nie {nazwa_rodzaju} (aparat {numer}).",
            "bay_equipment.earthing_role_not_applicable",
        )
    linked_ref = wpis.get("linked_ref")
    if linked_ref is not None:
        if rodzaj not in RODZAJE_Z_GALEZIA or str(linked_ref) not in galezie:
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} "
                f"({nazwa_rodzaju}) może wskazywać wyłącznie łącznik modelu, a wskazany element "
                "nim nie jest.",
                "bay_equipment.linked_ref_invalid",
            )
        if str(linked_ref) not in (rekord.get("equipment_refs") or []):
            # Aparat pola wskazuje łącznik TEGO pola (`Bay.equipment_refs`) — łącznik innego
            # pola pokazałby w rysunku i w odczycie pola stan cudzego toru.
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} "
                f"({nazwa_rodzaju}) wskazuje {opis_elementu(enm, str(linked_ref), 'łącznik')}, "
                f"który nie należy do {opis_elementu(enm, bay_ref, 'pola')} — wskaż łącznik "
                "z wyposażenia tego pola.",
                "bay_equipment.linked_ref_other_bay",
            )

    catalog_ref = wpis.get("catalog_ref")
    przestrzen = PRZESTRZEN_KATALOGU_APARATU.get(str(rodzaj))
    z_galezi = typ_z_galezi({"kind": rodzaj, "linked_ref": linked_ref})
    typ_galezi = galezie.get(str(linked_ref)) if z_galezi else None
    if przestrzen is None:
        if catalog_ref is not None:
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} ({nazwa_rodzaju}) "
                "nie ma katalogu SN — przyjmowany jest jako wartość robocza bez pozycji "
                "katalogowej.",
                "bay_equipment.catalog_not_applicable",
            )
        typ = None
    else:
        typ = catalog_ref if catalog_ref is not None else typ_galezi
        if not isinstance(typ, str) or not typ.strip():
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} ({nazwa_rodzaju}) "
                "wymaga pozycji katalogowej — wskaż typ z katalogu"
                + (" (typ łącznika modelu, który aparat wskazuje)." if z_galezi else "."),
                "bay_equipment.catalog_ref_missing",
            )
        # Import w funkcji: `domain_operations_v2` rejestruje tę operację (import modułu
        # na swoim szczycie), więc import na szczycie tego modułu zamknąłby cykl. Ta sama
        # brama istnienia i TEN SAM kształt odmowy (przyczyna + akcja naprawcza), co każda
        # operacja V2 wskazująca pozycję katalogu.
        from .domain_operations_v2 import _pozycja_katalogu

        _parametry, blad_pozycji = _pozycja_katalogu(
            namespace=przestrzen,
            catalog_ref=typ,
            opis_pl=f"Aparat {numer} ({nazwa_rodzaju})",
        )
        if blad_pozycji is not None:
            return blad_pozycji
        dozwolone = RODZAJE_KATALOGOWE_APARATU.get(str(rodzaj))
        if dozwolone is not None:
            pozycja = katalog_biezacy().mv_apparatus_types.get(typ)
            rodzaj_katalogu = getattr(pozycja, "device_kind", None)
            if rodzaj_katalogu not in dozwolone:
                return _error_response(
                    f"Pole {pole('devices', 'set_bay_equipment')}: pozycja katalogowa aparatu "
                    f"{numer} opisuje inny rodzaj aparatu niż „{nazwa_rodzaju}”.",
                    "bay_equipment.catalog_kind_mismatch",
                )
        kontrola = kontrola_napiecia_aparatu(
            {"kind": rodzaj, "catalog_ref": typ}, napiecie_sieci_pola(enm, rekord)
        )
        if kontrola["napiecie_wystarcza"] is False:
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} ({nazwa_rodzaju}, "
                f"{opis_pozycji_katalogu(typ, przestrzen, 'typ')}) — "
                f"{kontrola['wyjasnienie_pl']} Wskaż pozycję o napięciu znamionowym co najmniej "
                f"{_kv(float(kontrola['u_m_sieci_kv']))} kV.",
                "bay_equipment.voltage_rating_too_low",
            )
    aparat: dict[str, Any] = {
        "device_ref": f"{bay_ref}::dev::{indeks}",
        "symbol_ref": f"symbol:{str(rodzaj).lower()}",
        "kind": rodzaj,
        "placement": umiejscowienie,
        "is_controllable": rodzaj in RODZAJE_STEROWALNE,
        "render_variant": "kanoniczny",
    }
    for klucz, wartosc in (
        # Typ aparatu z gałęzią żyje na gałęzi (jedna prawda) — rekord pola go nie kopiuje.
        ("catalog_ref", None if z_galezi else typ),
        ("designation", wpis.get("designation")),
        ("earthing_role", rola_uziemienia),
        ("linked_ref", linked_ref),
    ):
        if wartosc is not None:
            aparat[klucz] = wartosc
    przypisanie = typ if z_galezi and typ is not None and typ != typ_galezi else None
    return aparat, przypisanie


def set_bay_equipment(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Ustaw wyposażenie (aparaty pierwotne) pola SN/WN — tryb ``katalog``/``szablon``/
    ``wyczysc``."""
    bay_ref = payload.get("bay_ref")
    if not isinstance(bay_ref, str) or not bay_ref.strip():
        return _error_response(
            f"Uzupełnij pole {pole('bay_ref', 'set_bay_equipment')} — wskaż pole rozdzielnicy.",
            "bay_equipment.bay_ref_missing",
        )
    nowy = kopia_graniczna_enm(enm)
    rekord = pole_modelu(nowy, bay_ref)
    if rekord is None:
        return _error_response(
            "Wskazane pole rozdzielnicy nie istnieje w modelu sieci.",
            "bay_equipment.bay_not_found",
        )
    if czy_pole_nn(nowy, rekord, poziom_pol(nowy)):
        return _error_response(
            f"{opis_elementu(nowy, bay_ref, 'Pole')} jest polem nN — jego aparaty ustawiają "
            "operacje rozdzielnicy nN, nie wyposażenie pola SN.",
            "bay_equipment.bay_not_mv",
        )
    tryb = payload.get("mode")
    if tryb not in get_args(TrybWyposazenia):
        return _error_response(
            f"Uzupełnij pole {pole('mode', 'set_bay_equipment')} — z katalogu, z szablonu pola "
            "albo usunięcie wyposażenia.",
            "bay_equipment.mode_invalid",
        )

    zmiany: dict[str, Any] = {}
    przypisania: list[tuple[str, str]] = []
    if tryb == "wyczysc":
        aparaty: list[dict[str, Any]] = []
    elif tryb == "szablon":
        wynik = _aparaty_z_szablonu(nowy, rekord, payload)
        if isinstance(wynik, dict):
            return wynik
        aparaty, ref_szablonu = wynik
        zmiany["bay_template_ref"] = ref_szablonu
        zmiany["config_id"] = _konfiguracja_pola(ref_szablonu)
    else:
        wpisy = payload.get("devices")
        if not isinstance(wpisy, list) or not wpisy:
            return _error_response(
                f"Uzupełnij pole {pole('devices', 'set_bay_equipment')} — wskaż aparaty pola "
                "(albo usuń wyposażenie).",
                "bay_equipment.devices_missing",
            )
        galezie = katalog_galezi_lacznikowych(nowy)
        aparaty = []
        wskazane_galezie: set[str] = set()
        for indeks, wpis in enumerate(wpisy):
            sprawdzony = _sprawdz_aparat(nowy, rekord, indeks, wpis, galezie)
            if isinstance(sprawdzony, dict):
                return sprawdzony
            aparat, przypisanie = sprawdzony
            linked = aparat.get("linked_ref")
            if linked is not None:
                if linked in wskazane_galezie:
                    return _error_response(
                        f"Pole {pole('devices', 'set_bay_equipment')}: dwa aparaty wskazują "
                        "ten sam łącznik modelu — aparat pola to jeden łącznik.",
                        "bay_equipment.linked_ref_duplicate",
                    )
                wskazane_galezie.add(str(linked))
            if przypisanie is not None:
                przypisania.append((str(linked), przypisanie))
            aparaty.append(aparat)

    # Typ łącznika wskazanego przez aparat pola — przypisanie GAŁĘZI tą samą operacją, co
    # przypisanie katalogu elementowi (brama, materializacja tabliczki). Odmowa przypisania
    # jest odmową całej operacji (model wejściowy nietknięty).
    for galaz_ref, typ in przypisania:
        przypisane = assign_catalog_to_element(
            nowy,
            {
                "element_ref": galaz_ref,
                "catalog_item_id": typ,
                "catalog_namespace": PRZESTRZEN_GALEZI_APARATU,
            },
        )
        if przypisane.get("error"):
            return przypisane
        nowy = przypisane["snapshot"]

    zmien_pole(nowy, bay_ref, primary_devices=aparaty, **zmiany)
    return _odpowiedz(nowy, bay_ref, aparaty, [g for g, _ in przypisania])
