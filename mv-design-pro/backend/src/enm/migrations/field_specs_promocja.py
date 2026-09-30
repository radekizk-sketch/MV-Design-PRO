"""Automigracja W5-B: `meta.field_specs` / `meta.nn_field_specs` / `switchgear_field_specs` → `bays`.

DLACZEGO (karta W5 §1 pkt 5, `docs/plan/KARTA_W5_MODEL_FAZOWY_I_UZIEMIENIE_2026-09.md`).
Do karty W5-B pola rozdzielnicy żyły w trzech nietypowanych słownikach migawki:
`Substation.meta.field_specs` (pola SN i GPZ), `Substation.meta.nn_field_specs` (pola nN)
i `BranchPointSN.materialized_params.switchgear_field_specs` (pola rozdzielnicy odgałęźnej
ZKSN), a operacja stacji końca ciągu dopisywała obok tego rekord `bays` tego samego pola
pod inną referencją. Od W5-B JEDYNYM nośnikiem jest typowana kolekcja `bays`
(`enm.models.Bay`); ten moduł jest JEDYNYM miejscem w `backend/src`, któremu wolno czytać
dawne klucze (strażnik wskrzeszenia `scripts/meta_field_specs_resurrection_guard.py`).

KIEDY BIEGNIE. Przy każdym wejściu surowej migawki do magazynu (`enm/store.py::
przygotuj_model_po_odczycie` — PRZED promocją aparatów nN, która czyta już rekordy `bays`)
oraz przy imporcie archiwum/pliku. Zapis do magazynu modelu, który nadal niesie dawne
klucze, jest odmową (`enm.store.LegacyFieldSpecsError`) — nie ma trybu zgodności.

WŁASNOŚCI:
- **idempotentna** — model bez dawnych kluczy wraca TYM SAMYM obiektem (bez podbicia rewizji);
- **deterministyczna** — kolejność rekordów = kolejność wpisów w migawce (stacje w kolejności
  listy, w stacji najpierw `field_specs`, potem `nn_field_specs`; potem punkty rozgałęzienia);
- **bezstratna albo głośna** — każdy klucz wpisu ma nazwane przeznaczenie (pole typowane
  `Bay`, klucz `meta`, klucz skasowany jako martwy). Klucz spoza zamkniętej listy
  `KLUCZE_WPISU` = `BladMigracjiPol` z nazwą klucza, nigdy ciche porzucenie (pydantic
  ignorowałby go po cichu);
- **scala dubel stacji końca ciągu** — wpis z `bay_ref` wskazującym istniejący rekord `bays`
  staje się JEDNYM rekordem o `ref_id = field_ref` wpisu; odwołania do dawnego `bay/…`
  (`generators[].bay_ref`, `measurements[].bay_ref`, `protection_assignments[].bay_ref`,
  `branches[].meta.bay_ref`) są przepisywane na nowy identyfikator.

Nazwa wpisu bez nazwy: reguła `enm.pola.nazwa_domyslna_pola` (ta sama, którą stosuje
builder) — dawniej nazwę roli podstawiał każdy czytelnik osobno.
"""

from __future__ import annotations

import copy
from collections.abc import Mapping
from typing import Any

from enm.models import EnergyNetworkModel
from enm.pola import (
    KLUCZE_META_ZAKAZANE,
    czy_pole_nn,
    napiecia_szyn,
    pola_zksn_z_portow,
    waliduj_rekord_pola,
    zbuduj_pole,
)
from enm.rola_pola_sn import kanoniczna_rola_pola_sn

MIGRATION_VERSION = "field_specs_promocja_001"

KLUCZ_FIELD_SPECS = "field_specs"
KLUCZ_NN_FIELD_SPECS = "nn_field_specs"
KLUCZ_SWITCHGEAR_FIELD_SPECS = "switchgear_field_specs"
KLUCZE_STACJI: tuple[str, ...] = (KLUCZ_FIELD_SPECS, KLUCZ_NN_FIELD_SPECS)

#: ZAMKNIĘTA lista kluczy top-level dawnego wpisu pola i ich przeznaczenie:
#: `pole` — pole typowane `Bay` o tej nazwie; `ref_id` — identyfikator; `pochodzenie` /
#: `blok` — składowa struktury typowanej; `martwy` — klucz bez czytelnika, kasowany.
KLUCZE_WPISU: dict[str, str] = {
    "field_ref": "ref_id",
    "bay_ref": "scalenie",
    "field_role": "pole",
    "name": "pole",
    "bay_role": "pole",
    "bus_ref": "pole",
    "equipment_refs": "pole",
    "protection_ref": "pole",
    "tags": "pole",
    "meta": "meta",
    "gpz_section_id": "pole",
    "funkcja_pomiaru": "pole",
    "rodzaj_pomiaru": "pole",
    "protection_codes": "pole",
    "bay_template_ref": "pole",
    "switchgear_family_ref": "pole",
    "manufacturer_ref": "pole",
    "apparatus_catalog_ref": "pole",
    "config_id": "pole",
    "catalog_bindings": "pole",
    "primary_devices": "pole",
    "surge_arresters": "pole",
    "bay_kind": "pochodzenie",
    "source_status": "pochodzenie",
    "source_refs": "pochodzenie",
    "factory_configuration_ref": "blok",
    "factory_unit_index": "blok",
    "terminal_bus_ref": "pole",
    "field_terminal_bus_ref": "pole",
    "station_ref": "martwy",
}

#: Klucze `meta` wpisu przenoszone na pole typowane (`meta.<klucz>` → `Bay.<pole>`).
KLUCZE_META_NA_POLE: dict[str, str] = {
    "field_role": "field_role",
    "terminal_bus_ref": "terminal_bus_ref",
    "field_terminal_bus_ref": "terminal_bus_ref",
    "gpz_section_id": "gpz_section_id",
    "catalog_bindings": "catalog_bindings",
    "apparatus_catalog_ref": "apparatus_catalog_ref",
}
#: Klucze `meta` wpisu kasowane jako martwe (dubel `ref_id`/`bay_ref`, dawny rekord).
KLUCZE_META_MARTWE: frozenset[str] = frozenset({"bay_ref", "field_ref", "sn_field_template"})

#: Kolekcje, w których element wskazuje pole przez `bay_ref` (przepisanie po scaleniu).
_KOLEKCJE_Z_BAY_REF: tuple[str, ...] = ("generators", "measurements", "protection_assignments")


class BladMigracjiPol(ValueError):
    """Wpis pola, którego migracja nie umie odwzorować bez utraty (klucz spoza listy,
    brak identyfikatora albo szyny). Błąd danych nazwany, nie ciche porzucenie."""


def wymaga_migracji(enm: EnergyNetworkModel) -> bool:
    for substation in enm.substations:
        meta = substation.meta if isinstance(substation.meta, dict) else {}
        if any(klucz in meta for klucz in KLUCZE_STACJI):
            return True
    for punkt in enm.branch_points:
        for nosnik in (punkt.materialized_params, punkt.runtime_inputs):
            if isinstance(nosnik, dict) and KLUCZ_SWITCHGEAR_FIELD_SPECS in nosnik:
                return True
    return False


def _napis(wartosc: object) -> str | None:
    return wartosc.strip() if isinstance(wartosc, str) and wartosc.strip() else None


def rekord_z_wpisu(
    wpis: Mapping[str, Any],
    *,
    substation_ref: str,
    poziom_nn: bool,
    rekord_scalany: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Rekord `Bay` z dawnego wpisu pola stacji. `rekord_scalany` — dawny rekord `bays`, na
    który wpis wskazywał `bay_ref` (stacja końca ciągu); jego `name`, `protection_codes`,
    `tags`, `equipment_refs` i `meta` uzupełniają wpis tam, gdzie wpis milczy."""
    nieznane = sorted(set(wpis) - set(KLUCZE_WPISU))
    if nieznane:
        raise BladMigracjiPol(
            f"wpis pola {wpis.get('field_ref')!r} stacji {substation_ref!r}: klucze spoza listy "
            f"migracji: {', '.join(nieznane)}"
        )
    field_ref = _napis(wpis.get("field_ref"))
    bus_ref = _napis(wpis.get("bus_ref"))
    if field_ref is None or bus_ref is None:
        raise BladMigracjiPol(
            f"wpis pola stacji {substation_ref!r} bez identyfikatora albo szyny: "
            f"{wpis.get('field_ref')!r} / {wpis.get('bus_ref')!r}"
        )
    scalany: dict[str, Any] = dict(rekord_scalany) if rekord_scalany else {}
    meta_wpisu = dict(wpis.get("meta") or {})
    meta_scalanego = dict(scalany.get("meta") or {})
    meta: dict[str, Any] = {}
    for zrodlo in (meta_scalanego, meta_wpisu):
        for klucz, wartosc in zrodlo.items():
            if klucz in KLUCZE_META_MARTWE or klucz in KLUCZE_META_NA_POLE:
                continue
            meta[klucz] = copy.deepcopy(wartosc)
    z_meta: dict[str, Any] = {}
    for zrodlo in (meta_scalanego, meta_wpisu):
        for klucz, pole_docelowe in KLUCZE_META_NA_POLE.items():
            wartosc = zrodlo.get(klucz)
            if wartosc is not None and wartosc != "" and wartosc != {}:
                z_meta[pole_docelowe] = wartosc

    def _z_wpisu(klucz: str) -> Any:
        wartosc = wpis.get(klucz)
        if wartosc is None or wartosc == "" or wartosc == [] or wartosc == {}:
            wartosc = scalany.get(klucz)
        return wartosc

    equipment = list(wpis.get("equipment_refs") or [])
    for ref in scalany.get("equipment_refs") or []:
        if ref not in equipment:
            equipment.append(ref)
    tags = list(wpis.get("tags") or [])
    for tag in scalany.get("tags") or []:
        if tag not in tags:
            tags.append(tag)
    rola = _napis(wpis.get("field_role")) or _napis(z_meta.get("field_role"))
    zacisk = (
        _napis(wpis.get("terminal_bus_ref"))
        or _napis(wpis.get("field_terminal_bus_ref"))
        or _napis(z_meta.get("terminal_bus_ref"))
    )
    return zbuduj_pole(
        ref_id=field_ref,
        bay_role=str(_z_wpisu("bay_role") or ""),
        bus_ref=bus_ref,
        substation_ref=substation_ref,
        name=_napis(_z_wpisu("name")),
        poziom_nn=poziom_nn,
        field_role=kanoniczna_rola_pola_sn(rola) if rola else None,
        terminal_bus_ref=zacisk,
        gpz_section_id=_napis(_z_wpisu("gpz_section_id")) or _napis(z_meta.get("gpz_section_id")),
        equipment_refs=equipment,
        protection_ref=_napis(_z_wpisu("protection_ref")),
        protection_codes=list(_z_wpisu("protection_codes") or []),
        bay_template_ref=_napis(_z_wpisu("bay_template_ref")),
        switchgear_family_ref=_napis(_z_wpisu("switchgear_family_ref")),
        manufacturer_ref=_napis(_z_wpisu("manufacturer_ref")),
        apparatus_catalog_ref=_napis(_z_wpisu("apparatus_catalog_ref"))
        or _napis(z_meta.get("apparatus_catalog_ref")),
        config_id=_napis(_z_wpisu("config_id")),
        catalog_bindings=(
            wpis.get("catalog_bindings")
            if isinstance(wpis.get("catalog_bindings"), Mapping)
            else (
                z_meta.get("catalog_bindings")
                if isinstance(z_meta.get("catalog_bindings"), Mapping)
                else None
            )
        ),
        primary_devices=list(_z_wpisu("primary_devices") or []),
        tags=tags,
        meta=meta,
        funkcja_pomiaru=_napis(_z_wpisu("funkcja_pomiaru")),
        rodzaj_pomiaru=_napis(_z_wpisu("rodzaj_pomiaru")),
        wybor_bloku={
            "factory_configuration_ref": wpis.get("factory_configuration_ref"),
            "factory_unit_index": wpis.get("factory_unit_index"),
        },
        metadane_pochodzenia={
            "bay_kind": wpis.get("bay_kind"),
            "source_status": wpis.get("source_status"),
            "source_refs": wpis.get("source_refs") or [],
        },
        surge_arresters=list(_z_wpisu("surge_arresters") or []),
        bay_number=_napis(scalany.get("bay_number")),
        feeder_short_name=_napis(scalany.get("feeder_short_name")),
        outgoing_destination_ref=_napis(scalany.get("outgoing_destination_ref")),
    )


def _liczba_odgalezien_zksn(punkt: Mapping[str, Any], dawne_pola: list[Any] | None) -> int:
    """Liczba portów odgałęzień ZKSN — z dawnej listy pól (wpisy `bay_role == "BRANCH"`),
    a bez niej z portów punktu (`ports.BRANCH`) albo z parametrów katalogu
    (`materialized_params.branch_ports_count`). Brak wszystkich trzech = błąd nazwany."""
    if dawne_pola:
        odgalezne = [
            w for w in dawne_pola if isinstance(w, Mapping) and w.get("bay_role") == "BRANCH"
        ]
        if odgalezne:
            return len(odgalezne)
    porty = punkt.get("ports")
    if isinstance(porty, Mapping) and isinstance(porty.get("BRANCH"), list) and porty["BRANCH"]:
        return len(porty["BRANCH"])
    parametry = punkt.get("materialized_params")
    if isinstance(parametry, Mapping):
        liczba = parametry.get("branch_ports_count")
        if isinstance(liczba, int) and not isinstance(liczba, bool) and liczba > 0:
            return liczba
    raise BladMigracjiPol(
        f"punkt rozgałęzienia ZKSN {punkt.get('ref_id')!r}: nieznana liczba portów odgałęzień "
        "(brak dawnych pól, portów BRANCH i branch_ports_count)"
    )


def _przepisz_bay_ref(dane: dict[str, Any], stary: str, nowy: str) -> None:
    for klucz in _KOLEKCJE_Z_BAY_REF:
        for element in dane.get(klucz) or []:
            if isinstance(element, dict) and element.get("bay_ref") == stary:
                element["bay_ref"] = nowy
    for galaz in dane.get("branches") or []:
        meta = galaz.get("meta") if isinstance(galaz, dict) else None
        if isinstance(meta, dict) and meta.get("bay_ref") == stary:
            meta["bay_ref"] = nowy


def _oczysc_meta_rekordu(rekord: dict[str, Any]) -> dict[str, Any]:
    """Istniejący rekord `bays` (bez wpisu do scalenia) — klucze `meta` z typowanym
    odpowiednikiem przechodzą na pole typowane, martwe znikają; potem walidacja kontraktem."""
    meta = rekord.get("meta") if isinstance(rekord.get("meta"), dict) else {}
    if not (set(meta) & (KLUCZE_META_ZAKAZANE)):
        return waliduj_rekord_pola(rekord)
    nowe_meta: dict[str, Any] = {}
    for klucz, wartosc in meta.items():
        if klucz in KLUCZE_META_MARTWE:
            continue
        pole_docelowe = KLUCZE_META_NA_POLE.get(klucz)
        if pole_docelowe is not None:
            if rekord.get(pole_docelowe) in (None, "", [], {}):
                if klucz == "field_role":
                    rekord[pole_docelowe] = kanoniczna_rola_pola_sn(wartosc) or None
                else:
                    rekord[pole_docelowe] = wartosc
            continue
        nowe_meta[klucz] = wartosc
    rekord["meta"] = nowe_meta
    return waliduj_rekord_pola(rekord)


def migruj(enm: EnergyNetworkModel) -> tuple[EnergyNetworkModel, bool]:
    """Przenieś dawne wpisy pól do `bays` i usuń dawne klucze. Zwraca (model, czy_zmieniono);
    przy braku zmian — TEN SAM obiekt (wołający nie podbija rewizji bez powodu)."""
    if not wymaga_migracji(enm):
        return enm, False

    dane = enm.model_dump(mode="json")
    napiecia = napiecia_szyn(dane)
    istniejace: dict[str, dict[str, Any]] = {}
    for rekord in dane.get("bays") or []:
        if isinstance(rekord, dict) and isinstance(rekord.get("ref_id"), str):
            istniejace[rekord["ref_id"]] = rekord
    nowe_rekordy: list[dict[str, Any]] = []
    scalone: set[str] = set()

    for stacja in dane.get("substations") or []:
        meta = stacja.get("meta")
        if not isinstance(meta, dict):
            continue
        for klucz in KLUCZE_STACJI:
            wpisy = meta.pop(klucz, None)
            if not isinstance(wpisy, list):
                continue
            for wpis in wpisy:
                if not isinstance(wpis, Mapping):
                    continue
                bay_ref = _napis(wpis.get("bay_ref"))
                scalany = istniejace.get(bay_ref) if bay_ref else None
                rekord = rekord_z_wpisu(
                    wpis,
                    substation_ref=str(stacja.get("ref_id")),
                    poziom_nn=(klucz == KLUCZ_NN_FIELD_SPECS) or czy_pole_nn(dane, wpis, napiecia),
                    rekord_scalany=scalany,
                )
                if scalany is not None and bay_ref is not None:
                    scalone.add(bay_ref)
                    if bay_ref != rekord["ref_id"]:
                        _przepisz_bay_ref(dane, bay_ref, rekord["ref_id"])
                nowe_rekordy.append(rekord)

    pozostale = [
        _oczysc_meta_rekordu(rekord) for ref, rekord in istniejace.items() if ref not in scalone
    ]
    znane_ref = {r["ref_id"] for r in pozostale}
    for rekord in nowe_rekordy:
        if rekord["ref_id"] in znane_ref:
            raise BladMigracjiPol(
                f"pole {rekord['ref_id']!r}: wpis stacji i rekord `bays` o tym samym "
                "identyfikatorze bez `bay_ref` — migracja nie zgaduje, który jest prawdą"
            )
        znane_ref.add(rekord["ref_id"])
    bays = pozostale + nowe_rekordy

    for punkt in dane.get("branch_points") or []:
        if not isinstance(punkt, dict):
            continue
        dawne_pola: list[Any] | None = None
        for nosnik in ("materialized_params", "runtime_inputs"):
            slownik = punkt.get(nosnik)
            if isinstance(slownik, dict):
                zdjete = slownik.pop(KLUCZ_SWITCHGEAR_FIELD_SPECS, None)
                if dawne_pola is None and isinstance(zdjete, list):
                    dawne_pola = zdjete
        if punkt.get("branch_point_type") != "zksn":
            continue
        if any(r.get("branch_point_ref") == punkt.get("ref_id") for r in bays):
            continue
        liczba = _liczba_odgalezien_zksn(punkt, dawne_pola)
        bays.extend(
            pola_zksn_z_portow(
                branch_point_ref=str(punkt.get("ref_id")),
                bus_ref=str(punkt.get("bus_ref")),
                branch_ports_count=liczba,
            )
        )

    dane["bays"] = bays
    return EnergyNetworkModel.model_validate(dane), True
