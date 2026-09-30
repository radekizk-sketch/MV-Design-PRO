"""Pola rozdzielnicy w modelu ENM — JEDEN akcesor, JEDEN builder, JEDEN pisarz (karta W5-B).

DLACZEGO. Do karty W5-B pole rozdzielnicy żyło w trzech nietypowanych słownikach
(`Substation.meta.field_specs`, `Substation.meta.nn_field_specs`,
`BranchPointSN.materialized_params.switchgear_field_specs`) i w typowanej kolekcji `bays`
naraz. Każdy czytelnik (operacje, walidator, zajętość pól, tor pola, kompilator grafu,
read-model pola, ocena LoM, SLD) składał te kanały po swojemu, z własną kolejnością
pierwszeństwa i własnym zbiorem kluczy; rekord pola `bays` był dopisywany obok wpisu tego
samego pola (stacja końca ciągu liczyła każde pole dwa razy). Od W5-B pole ma JEDEN nośnik —
rekord `enm.bays` (`enm.models.Bay`) — a ten moduł jest jedynym miejscem, które zna jego
kształt: budowa (`zbuduj_pole`), zapis (`dodaj_pole`/`zmien_pole`/`usun_pole`) i odczyty
(`pola_stacji`, `pola_wg_szyny`, `pole`, `czy_pole_nn`, `zacisk_pola`).

Pracuje na DWÓCH postaciach modelu bez duplikowania reguł: słowniku migawki
(`EnergyNetworkModel.model_dump(mode="json")`, na którym działają operacje domenowe) i na
modelu Pydantic (warstwa aplikacji, walidator). Każdy odczyt pól idzie tędy — druga kopia
którejkolwiek z tych reguł jest naruszeniem karty (strażnik wskrzeszenia
`scripts/meta_field_specs_resurrection_guard.py`).

Moduł-LIŚĆ warstwy ENM: importuje wyłącznie `enm.models`, `enm.rola_pola_sn`,
`network_model.nazwy` i `network_model.pochodne.pasma_napieciowe` (pasmo nN/SN — JEDNA
granica w backendzie). Nie importuje operacji domenowych ani magazynu.
"""

from __future__ import annotations

import copy
from collections.abc import Iterable, Mapping
from typing import Any

from network_model.nazwy import nazwa_nadana
from network_model.pochodne.pasma_napieciowe import w_pasmie_nn

from .models import Bay, EnergyNetworkModel
from .rola_pola_sn import kanoniczna_rola_pola_sn, nazwa_roli_pola_sn

#: Kolejność ról przy grupowaniu pól po szynie — pola liniowe wyjściowe przed odgałęźnymi,
#: te przed wejściowymi (kolejność wyboru wolnego pola startu ciągu; ta sama, którą miała
#: dawna funkcja `_field_specs_by_bus` operacji domenowych).
_RANGA_ROLI_NA_SZYNIE: dict[str, int] = {"OUT": 0, "FEEDER": 1, "IN": 2}

#: Klucze `Bay.meta`, które MAJĄ typowany odpowiednik na rekordzie pola albo są martwe —
#: nie wolno ich pisać do `meta` (pisarz odmawia; migracja przenosi). Lista ZAMKNIĘTA,
#: przypięta testem `tests/enm/test_pola.py`.
KLUCZE_META_ZAKAZANE: frozenset[str] = frozenset(
    {
        "field_role",
        "terminal_bus_ref",
        "field_terminal_bus_ref",
        "gpz_section_id",
        "bay_ref",
        "catalog_bindings",
        "apparatus_catalog_ref",
        "sn_field_template",
        "field_ref",
    }
)

#: Nazwy domyślne pól nN wg roli modelu — TA SAMA reguła dla buildera (pole bez nazwy
#: projektanta) i migracji wpisów historycznych bez nazwy. Pole odpływowe nN rozróżnia
#: odpływ odbiorczy od pola źródła po `meta.feeder_role` (`ZRODLO_NN_*`).
_NAZWA_ROLI_POLA_NN_PL: dict[str, str] = {
    "IN": "Wyłącznik główny nN",
    "FEEDER": "Odpływ nN",
    "OZE": "Pole źródła nN",
    "TR": "Pole transformatorowe nN",
    "COUPLER": "Sprzęgło nN",
    "MEASUREMENT": "Pole pomiarowe nN",
    "OUT": "Odpływ nN",
}
_NAZWA_POLA_ZRODLA_NN_PL = "Pole źródła nN"
_PRZEDROSTEK_ROLI_ZRODLA_NN = "ZRODLO_NN"


class BladPola(ValueError):
    """Odmowa zapisu rekordu pola: kształt spoza kontraktu `Bay`, dubel identyfikatora albo
    klucz `meta` z typowanym odpowiednikiem. Błąd programu wołającego, nie danych projektanta."""


# ---------------------------------------------------------------------------
# Dostęp do dwóch postaci modelu (słownik migawki / model Pydantic)
# ---------------------------------------------------------------------------


def _kolekcja(enm: Mapping[str, Any] | EnergyNetworkModel, klucz: str) -> list[Any]:
    if isinstance(enm, Mapping):
        wartosc = enm.get(klucz)
        return [x for x in wartosc if isinstance(x, Mapping)] if isinstance(wartosc, list) else []
    return list(getattr(enm, klucz, []) or [])


def _pole_rekordu(rekord: Any, klucz: str) -> Any:
    if isinstance(rekord, Mapping):
        return rekord.get(klucz)
    return getattr(rekord, klucz, None)


def _napis(wartosc: object) -> str | None:
    return wartosc.strip() if isinstance(wartosc, str) and wartosc.strip() else None


# ---------------------------------------------------------------------------
# Odczyty
# ---------------------------------------------------------------------------


def pola(enm: Mapping[str, Any] | EnergyNetworkModel) -> list[Any]:
    """Wszystkie rekordy pól modelu w kolejności zapisu (deterministycznej)."""
    return _kolekcja(enm, "bays")


def pole(enm: Mapping[str, Any] | EnergyNetworkModel, ref_id: object) -> Any | None:
    """Rekord pola o identyfikatorze `ref_id` (`None`, gdy nie ma)."""
    szukany = _napis(ref_id)
    if szukany is None:
        return None
    for rekord in pola(enm):
        if _pole_rekordu(rekord, "ref_id") == szukany:
            return rekord
    return None


def pole_istnieje(enm: Mapping[str, Any] | EnergyNetworkModel, ref_id: object) -> bool:
    return pole(enm, ref_id) is not None


def pola_stacji(enm: Mapping[str, Any] | EnergyNetworkModel, substation_ref: object) -> list[Any]:
    """Pola stacji (SN i nN) w kolejności zapisu."""
    stacja = _napis(substation_ref)
    if stacja is None:
        return []
    return [r for r in pola(enm) if _pole_rekordu(r, "substation_ref") == stacja]


def pola_zksn(enm: Mapping[str, Any] | EnergyNetworkModel, branch_point_ref: object) -> list[Any]:
    """Pola rozdzielnicy odgałęźnej ZKSN wskazanego punktu rozgałęzienia."""
    punkt = _napis(branch_point_ref)
    if punkt is None:
        return []
    return [r for r in pola(enm) if _pole_rekordu(r, "branch_point_ref") == punkt]


def stacja_pola(enm: Mapping[str, Any] | EnergyNetworkModel, ref_id: object) -> Any | None:
    """Stacja, do której należy pole (`None` dla pola ZKSN albo pola nieznanego)."""
    rekord = pole(enm, ref_id)
    if rekord is None:
        return None
    wlasciciel = _napis(_pole_rekordu(rekord, "substation_ref"))
    if wlasciciel is None:
        return None
    for stacja in _kolekcja(enm, "substations"):
        if _pole_rekordu(stacja, "ref_id") == wlasciciel:
            return stacja
    return None


def napiecia_szyn(enm: Mapping[str, Any] | EnergyNetworkModel) -> dict[str, float | None]:
    """`bus_ref` → napięcie znamionowe szyny [kV] (brak = `None`)."""
    wynik: dict[str, float | None] = {}
    for szyna in _kolekcja(enm, "buses"):
        ref = _napis(_pole_rekordu(szyna, "ref_id"))
        if ref is None:
            continue
        napiecie = _pole_rekordu(szyna, "voltage_kv")
        wynik[ref] = float(napiecie) if isinstance(napiecie, int | float) else None
    return wynik


def czy_pole_nn(
    enm: Mapping[str, Any] | EnergyNetworkModel,
    rekord: Any,
    napiecia: Mapping[str, float | None] | None = None,
) -> bool:
    """Czy pole leży na szynie nN — JEDYNY predykat poziomu pola (dawna przynależność wpisu do
    kolekcji `nn_field_specs`). Rozstrzyga pasmo napięcia szyny `bus_ref`
    (`pasma_napieciowe.w_pasmie_nn`: 0 < Uₙ ≤ 1 kV); szyna nieznana albo bez napięcia = NIE nN."""
    mapa = napiecia if napiecia is not None else napiecia_szyn(enm)
    szyna = _napis(_pole_rekordu(rekord, "bus_ref"))
    if szyna is None:
        return False
    return w_pasmie_nn(mapa.get(szyna))


def pola_sn_stacji(
    enm: Mapping[str, Any] | EnergyNetworkModel, substation_ref: object
) -> list[Any]:
    napiecia = napiecia_szyn(enm)
    return [r for r in pola_stacji(enm, substation_ref) if not czy_pole_nn(enm, r, napiecia)]


def pola_nn_stacji(
    enm: Mapping[str, Any] | EnergyNetworkModel, substation_ref: object
) -> list[Any]:
    napiecia = napiecia_szyn(enm)
    return [r for r in pola_stacji(enm, substation_ref) if czy_pole_nn(enm, r, napiecia)]


def pola_nn(enm: Mapping[str, Any] | EnergyNetworkModel) -> list[Any]:
    """Wszystkie pola nN modelu (kolejność zapisu)."""
    napiecia = napiecia_szyn(enm)
    return [r for r in pola(enm) if czy_pole_nn(enm, r, napiecia)]


def pola_wg_szyny(
    enm: Mapping[str, Any] | EnergyNetworkModel,
) -> dict[str, list[Any]]:
    """Pola stacji pogrupowane po szynie `bus_ref`, w kolejności wyboru pola startu ciągu
    (OUT, FEEDER, IN, pozostałe; w obrębie roli po `ref_id`). Pola ZKSN nie wchodzą —
    obsługuje je punkt rozgałęzienia, nie stacja."""
    wg_szyny: dict[str, list[Any]] = {}
    for rekord in pola(enm):
        if _napis(_pole_rekordu(rekord, "substation_ref")) is None:
            continue
        szyna = _napis(_pole_rekordu(rekord, "bus_ref"))
        if szyna is None:
            continue
        wg_szyny.setdefault(szyna, []).append(rekord)
    for lista in wg_szyny.values():
        lista.sort(
            key=lambda r: (
                _RANGA_ROLI_NA_SZYNIE.get(str(_pole_rekordu(r, "bay_role") or "").upper(), 99),
                str(_pole_rekordu(r, "ref_id") or ""),
            )
        )
    return wg_szyny


def zacisk_pola(rekord: Any) -> str | None:
    """Własny zacisk pola (szyna za aparatem pola) — `terminal_bus_ref`, jedyny nośnik."""
    if rekord is None:
        return None
    return _napis(_pole_rekordu(rekord, "terminal_bus_ref"))


def punkt_przylaczenia_pola(rekord: Any) -> str | None:
    """Szyna, na której pole przyłącza element, któremu służy: własny zacisk, a bez zacisku —
    szyna pola (POLA-W-TORZE)."""
    return zacisk_pola(rekord) or _napis(_pole_rekordu(rekord, "bus_ref"))


def rola_kanoniczna_pola(rekord: Any) -> str:
    """Rola kanoniczna pola: `field_role`, a bez niej alias `bay_role` przez kanon."""
    return kanoniczna_rola_pola_sn(
        _pole_rekordu(rekord, "field_role") or _pole_rekordu(rekord, "bay_role")
    )


# ---------------------------------------------------------------------------
# Nazwy
# ---------------------------------------------------------------------------


def nazwa_domyslna_pola(
    *,
    bay_role: object,
    field_role: object = None,
    poziom_nn: bool = False,
    feeder_role: object = None,
) -> str:
    """Nazwa pola, gdy projektant jej nie nadał — z kanonu ról (SN: `enm.rola_pola_sn`;
    nN: słownik tego modułu). Nigdy identyfikator pola (karta #144). TA SAMA reguła dla
    buildera i migracji wpisów historycznych."""
    if poziom_nn:
        rola_odplywu = str(feeder_role or "").strip().upper()
        if rola_odplywu.startswith(_PRZEDROSTEK_ROLI_ZRODLA_NN):
            return _NAZWA_POLA_ZRODLA_NN_PL
        return _NAZWA_ROLI_POLA_NN_PL.get(str(bay_role or "").strip().upper(), "Pole nN")
    return nazwa_roli_pola_sn(field_role or bay_role)


# ---------------------------------------------------------------------------
# Builder i pisarze — jedyny kształt rekordu pola
# ---------------------------------------------------------------------------


def waliduj_rekord_pola(rekord: Mapping[str, Any]) -> dict[str, Any]:
    """Rekord pola po walidacji kontraktem `Bay` (postać `model_dump(mode="json")`).
    Klucz spoza kontraktu = błąd (pydantic domyślnie IGNORUJE nadmiarowe klucze — dana
    zniknęłaby po cichu przy `model_validate` całego modelu); klucz `meta` z typowanym
    odpowiednikiem = błąd."""
    nieznane = sorted(set(rekord) - set(Bay.model_fields))
    if nieznane:
        raise BladPola(
            f"pole {rekord.get('ref_id')!r}: klucze spoza kontraktu Bay: {', '.join(nieznane)}"
        )
    meta = rekord.get("meta")
    if isinstance(meta, Mapping):
        zakazane = sorted(set(meta) & KLUCZE_META_ZAKAZANE)
        if zakazane:
            raise BladPola(
                f"pole {rekord.get('ref_id')!r}: klucze meta z typowanym odpowiednikiem: "
                f"{', '.join(zakazane)}"
            )
    try:
        model = Bay.model_validate(dict(rekord))
    except ValueError as blad:
        raise BladPola(f"pole {rekord.get('ref_id')!r}: {blad}") from blad
    return model.model_dump(mode="json")


def zbuduj_pole(
    *,
    ref_id: str,
    bay_role: str,
    bus_ref: str,
    substation_ref: str | None = None,
    branch_point_ref: str | None = None,
    branch_point_port_id: str | None = None,
    name: str | None = None,
    poziom_nn: bool = False,
    field_role: str | None = None,
    terminal_bus_ref: str | None = None,
    gpz_section_id: str | None = None,
    equipment_refs: Iterable[str] | None = None,
    protection_ref: str | None = None,
    protection_codes: Iterable[str] | None = None,
    bay_template_ref: str | None = None,
    switchgear_family_ref: str | None = None,
    manufacturer_ref: str | None = None,
    apparatus_catalog_ref: str | None = None,
    config_id: str | None = None,
    catalog_bindings: Mapping[str, Any] | None = None,
    primary_devices: Iterable[Mapping[str, Any]] | None = None,
    tags: Iterable[str] | None = None,
    meta: Mapping[str, Any] | None = None,
    funkcja_pomiaru: str | None = None,
    rodzaj_pomiaru: str | None = None,
    wybor_bloku: Mapping[str, Any] | None = None,
    metadane_pochodzenia: Mapping[str, Any] | None = None,
    surge_arresters: Iterable[Mapping[str, Any]] | None = None,
    bay_number: str | None = None,
    feeder_short_name: str | None = None,
    outgoing_destination_ref: str | None = None,
) -> dict[str, Any]:
    """JEDYNY builder rekordu pola — wszystkie drogi budowy pola (GPZ, wcięcie stacji, stacja
    końca ciągu, operacja katalogowa pola, pola nN, pole źródłowe DER, pola ZKSN).

    Argumenty są 1:1 polami `Bay`; struktury zagnieżdżone kopiowane GŁĘBOKO (builder jest
    właścicielem tego, co zapisuje — wołający nie trzyma uchwytu do wnętrza migawki).
    Nazwa: nadana przez projektanta albo domyślna z kanonu ról (`nazwa_domyslna_pola`).
    `wybor_bloku` bez referencji bloku = brak wyboru (numer jednostki bez bloku nie jedzie sam);
    `metadane_pochodzenia` bez żadnej wartości = brak metadanych.
    """
    meta_kopia: dict[str, Any] = copy.deepcopy(dict(meta)) if meta else {}
    rola_kanoniczna = kanoniczna_rola_pola_sn(field_role) if field_role else None
    wybor: dict[str, Any] | None = None
    if wybor_bloku and _napis(wybor_bloku.get("factory_configuration_ref")):
        wybor = {"factory_configuration_ref": str(wybor_bloku["factory_configuration_ref"]).strip()}
        numer = wybor_bloku.get("factory_unit_index")
        if isinstance(numer, int) and not isinstance(numer, bool):
            wybor["factory_unit_index"] = numer
    pochodzenie: dict[str, Any] | None = None
    if metadane_pochodzenia:
        kandydat = {
            "bay_kind": _napis(metadane_pochodzenia.get("bay_kind")),
            "source_status": _napis(metadane_pochodzenia.get("source_status")),
            "source_refs": [str(r) for r in (metadane_pochodzenia.get("source_refs") or [])],
        }
        if kandydat["bay_kind"] or kandydat["source_status"] or kandydat["source_refs"]:
            pochodzenie = kandydat
    rekord: dict[str, Any] = {
        "ref_id": ref_id,
        "name": nazwa_nadana(name)
        or nazwa_domyslna_pola(
            bay_role=bay_role,
            field_role=rola_kanoniczna,
            poziom_nn=poziom_nn,
            feeder_role=meta_kopia.get("feeder_role"),
        ),
        "tags": [str(t) for t in (tags or [])],
        "meta": meta_kopia,
        "bay_role": bay_role,
        "substation_ref": _napis(substation_ref),
        "branch_point_ref": _napis(branch_point_ref),
        "branch_point_port_id": _napis(branch_point_port_id),
        "bus_ref": bus_ref,
        "field_role": rola_kanoniczna or None,
        "terminal_bus_ref": _napis(terminal_bus_ref),
        "gpz_section_id": _napis(gpz_section_id),
        "equipment_refs": [str(r) for r in (equipment_refs or [])],
        "protection_ref": _napis(protection_ref),
        "protection_codes": [str(k) for k in (protection_codes or [])],
        "bay_template_ref": _napis(bay_template_ref),
        "switchgear_family_ref": _napis(switchgear_family_ref),
        "manufacturer_ref": _napis(manufacturer_ref),
        "apparatus_catalog_ref": _napis(apparatus_catalog_ref),
        "config_id": _napis(config_id),
        "catalog_bindings": copy.deepcopy(dict(catalog_bindings)) if catalog_bindings else None,
        "primary_devices": [copy.deepcopy(dict(d)) for d in (primary_devices or [])],
        "funkcja_pomiaru": _napis(funkcja_pomiaru),
        "rodzaj_pomiaru": _napis(rodzaj_pomiaru),
        "wybor_bloku": wybor,
        "metadane_pochodzenia": pochodzenie,
        "surge_arresters": [copy.deepcopy(dict(o)) for o in (surge_arresters or [])],
        "bay_number": _napis(bay_number),
        "feeder_short_name": _napis(feeder_short_name),
        "outgoing_destination_ref": _napis(outgoing_destination_ref),
    }
    return waliduj_rekord_pola(rekord)


def _wszystkie_ref_id(enm: Mapping[str, Any]) -> set[str]:
    """Identyfikatory zajęte w migawce — te same kolekcje, co `topology_ops._all_refs_set`
    (lustro utrzymywane testem parytetu; `pola` nie importuje operacji, żeby zostać liściem)."""
    refs: set[str] = set()
    for klucz in (
        "buses",
        "branches",
        "transformers",
        "sources",
        "loads",
        "generators",
        "substations",
        "bays",
        "junctions",
        "corridors",
        "measurements",
        "protection_assignments",
        "branch_points",
    ):
        for elem in _kolekcja(enm, klucz):
            ref = _napis(elem.get("ref_id"))
            if ref:
                refs.add(ref)
    return refs


def dodaj_pole(enm: dict[str, Any], rekord: Mapping[str, Any]) -> dict[str, Any]:
    """JEDYNY pisarz nowego pola do migawki: waliduje kontraktem, odmawia dubla identyfikatora,
    dopisuje do `bays` (kolejność zapisu = kolejność listy). Zwraca zapisany rekord."""
    zwalidowany = waliduj_rekord_pola(rekord)
    if zwalidowany["ref_id"] in _wszystkie_ref_id(enm):
        raise BladPola(f"pole {zwalidowany['ref_id']!r}: identyfikator już zajęty w modelu")
    lista = enm.get("bays")
    if not isinstance(lista, list):
        lista = []
        enm["bays"] = lista
    lista.append(zwalidowany)
    return zwalidowany


def zmien_pole(enm: dict[str, Any], ref_id: str, **zmiany: Any) -> dict[str, Any]:
    """Zmiana pól rekordu (walidowana kontraktem); `meta` podane w `zmiany` ZASTĘPUJE meta
    rekordu (wołający składa nową wartość jawnie). Nieznane pole = błąd."""
    for i, rekord in enumerate(pola(enm)):
        if rekord.get("ref_id") != ref_id:
            continue
        kandydat = {**rekord, **zmiany}
        zwalidowany = waliduj_rekord_pola(kandydat)
        enm["bays"][i] = zwalidowany
        return zwalidowany
    raise BladPola(f"pole {ref_id!r}: nie istnieje w modelu")


def usun_pole(enm: dict[str, Any], ref_id: str) -> dict[str, Any]:
    """Usunięcie rekordu pola; zwraca usunięty rekord. Zależności pola (aparaty, przekładniki,
    zabezpieczenia, źródła wskazujące pole) sprawdza operacja domenowa, nie ten pisarz."""
    lista = enm.get("bays")
    if isinstance(lista, list):
        for i, rekord in enumerate(lista):
            if isinstance(rekord, Mapping) and rekord.get("ref_id") == ref_id:
                return lista.pop(i)
    raise BladPola(f"pole {ref_id!r}: nie istnieje w modelu")


# ---------------------------------------------------------------------------
# Pola rozdzielnicy odgałęźnej ZKSN — jedno źródło (dawne trzy kopie `_zksn_*field_specs`)
# ---------------------------------------------------------------------------

PORT_ZKSN_WEJSCIE = "MAIN_IN"
PORT_ZKSN_WYJSCIE = "MAIN_OUT"
PORT_ZKSN_ODGALEZIENIE = "BRANCH"


def port_odgalezienia_zksn(indeks: int, liczba_odgalezien: int) -> str:
    """Identyfikator portu odgałęzienia ZKSN — `BRANCH` przy jednym odgałęzieniu, `BRANCH_n`
    przy wielu (ta sama reguła, którą stosują porty trasy punktu rozgałęzienia)."""
    return f"{PORT_ZKSN_ODGALEZIENIE}_{indeks}" if liczba_odgalezien > 1 else PORT_ZKSN_ODGALEZIENIE


def ref_pola_zksn(branch_point_ref: str, port_id: str) -> str:
    return f"{branch_point_ref}/pole/{port_id}"


def pola_zksn_z_portow(
    *, branch_point_ref: str, bus_ref: str, branch_ports_count: int
) -> list[dict[str, Any]]:
    """Rekordy pól rozdzielnicy ZKSN wyprowadzone z liczby portów odgałęzień: pole liniowe
    wejściowe (WE), wyjściowe (WY) i po jednym polu odgałęźnym na port (ODG n). Deterministyczne
    (ta sama liczba portów = te same identyfikatory)."""
    liczba = max(int(branch_ports_count), 0)
    rekordy = [
        zbuduj_pole(
            ref_id=ref_pola_zksn(branch_point_ref, PORT_ZKSN_WEJSCIE),
            name="WE",
            bay_role="IN",
            field_role="LINIA_IN",
            bus_ref=bus_ref,
            branch_point_ref=branch_point_ref,
            branch_point_port_id=PORT_ZKSN_WEJSCIE,
        ),
        zbuduj_pole(
            ref_id=ref_pola_zksn(branch_point_ref, PORT_ZKSN_WYJSCIE),
            name="WY",
            bay_role="OUT",
            field_role="LINIA_OUT",
            bus_ref=bus_ref,
            branch_point_ref=branch_point_ref,
            branch_point_port_id=PORT_ZKSN_WYJSCIE,
        ),
    ]
    for indeks in range(1, liczba + 1):
        port = port_odgalezienia_zksn(indeks, liczba)
        rekordy.append(
            zbuduj_pole(
                ref_id=ref_pola_zksn(branch_point_ref, port),
                name=f"ODG {indeks}",
                bay_role="OUT",
                field_role="LINIA_ODG",
                bus_ref=bus_ref,
                branch_point_ref=branch_point_ref,
                branch_point_port_id=port,
            )
        )
    return rekordy
