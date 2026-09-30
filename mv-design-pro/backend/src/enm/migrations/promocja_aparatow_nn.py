"""Automigracja: promocja pól nN (rekordy `bays` na szynie nN) do realnych elementów grafu.

DLACZEGO (karta P0.1, C §4.2, LV-INV-12). Przed tą migracją odpływy i pola źródłowe nN
istniały WYŁĄCZNIE jako wpisy pola bez aparatu — solver i SLD musiałyby czytać DWIE
reprezentacje tej samej rzeczy (graf + opis pola), co jest dokładnie tym, czego zakazuje
LV-INV-12 („UI i solver używają TEGO SAMEGO grafu nN"). Migracja daje każdemu polu nN realny
`SwitchBranch` (aparat pola) między szyną nN stacji a NOWĄ szyną odpływu i zapisuje na
rekordzie pola aparat (`equipment_refs`) oraz zacisk (`terminal_bus_ref`) — pole nN ma odtąd
tę samą postać, co pole SN z aparatem w torze (jedna reguła `enm.pola.zacisk_pola`).

Karta W5-B: pola nN czyta się WYŁĄCZNIE z `bays` (predykat poziomu `enm.pola.czy_pole_nn` —
pasmo napięcia szyny pola); dawny słownik `Substation.meta.nn_field_specs` nie istnieje.

WŁASNOŚCI (jak pozostałe automigracje ENM):
- **idempotentna** — sprawdzenie GRANULARNE per pole (istnienie gałęzi z meta-znacznikiem
  `nn_field_migrowany_z == ref_id` pola), NIE znacznik stacji: znacznik stacji
  (`nn_fields_promoted`) jest wyłącznie INFORMACYJNY, a NIE bramą pomijającą kolejne
  przebiegi — pole dopisane PO pierwszej promocji też dostaje aparat (KLASA, nie INSTANCJA).
- **deterministyczna** — ref_id nowych elementów z SHA-256 nad kanonicznymi danymi
  wejściowymi (ten sam wzorzec co `domain_operations._compute_seed`; funkcje NIE są stąd
  importowane, żeby migracja nie zależała od warstwy operacji domenowych).
- **bezstratna** — żadna wartość nie ginie; odbiór/generator dostaje NOWY `bus_ref` (szyna
  odpływu), nie kasację. Dotyczy OBU klas elementów wiszących na polu: `Load.meta.feeder_ref`
  (odpływy) i `Generator.meta.field_ref` (pola źródłowe DER) — różne klucze meta, ten sam
  mechanizm relokacji.

WIĄZANIE KATALOGOWE APARATU. Pole niesie wiązanie wtedy, gdy zapisała je operacja tworząca
(szablon stacji: `Bay.catalog_bindings` odpływów; import, edycja ręczna:
`Bay.meta.catalog_binding`). Migracja przenosi je TĄ SAMĄ operacją, którą projektant naprawia
brak ręcznie — `assign_catalog_to_element` (karta SLD-SUBSTRAT). Gdy wiązania nie ma — albo
operacja je odrzuci — aparat wchodzi do modelu BEZ wiązania i ze znacznikiem
`META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA` (kod odmowy operacji obok, w
`META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA`). Walidator czyta znacznik jako W061.

ZASADA TORU (karta POLA-W-TORZE, §0 pkt 1). Aparat pola nN leży w torze prądowym elementu,
któremu pole służy — promocja PRZEPINA ten element na zacisk pola. Reguły ról
(jedno źródło — `_elementy_toru_pola`):
- odpływ (`FEEDER`, rola odpływu odbiorczego): odbiory z `Load.meta.feeder_ref == ref_id`;
- pole źródła (`FEEDER` z rolą `ZRODLO_NN_PV/BESS/FW` albo `OZE`): źródła z
  `Generator.meta.field_ref == ref_id`, a bez tej relacji — jedyne źródło stacji danej
  technologii na szynie pola;
- wyłącznik główny nN (`IN`): strona dolna transformatora — `meta.transformer_ref` pola, a bez
  tej relacji transformatory stacji ze stroną dolną na szynie pola, gdy pole jest JEDYNYM
  polem `IN` tej szyny.
Przepięcie działa także dla pól promowanych WCZEŚNIEJ (aparat istnieje, element nadal na
szynie stacji) — ta sama reguła, nie druga droga. Tak samo rekord pola promowanego wcześniej
bez zapisanego aparatu/zacisku (migawki sprzed W5-B) dostaje je przy najbliższym odczycie.

SKUTEK DLA HASZY — migracja zmienia model (nowe szyny/gałęzie, przeniesione `bus_ref`),
więc podnosi rewizję (przez `set_enm` w `enm/store.py`). To uczciwa konsekwencja realnej
zmiany reprezentacji, nie błąd.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from enm.models import Bay, Bus, EnergyNetworkModel, Substation, SwitchBranch
from enm.pola import czy_pole_nn, napiecia_szyn
from network_model.nazwy import nazwa_nadana

MIGRATION_VERSION = "promocja_aparatow_nn_002"

#: Klucz meta stacji: znacznik INFORMACYJNY (nie bramka) — „ta stacja miała przebieg
#: promocji". Czytelny dla SLD/inspektora; idempotencja NIE opiera się na tym kluczu.
META_KLUCZ_STACJA_PROMOWANA = "nn_fields_promoted"

#: Klucz meta gałęzi: identyfikator pola nN (`Bay.ref_id`), z którego gałąź powstała.
#: JEDYNE źródło idempotencji per pole oraz parowania odbiorów (Load.meta.feeder_ref)
#: z nową szyną odpływu.
META_KLUCZ_GALAZ_ZRODLO_FIELD_REF = "nn_field_migrowany_z"

#: Klucz meta gałęzi: rola pola źródłowego (`bay_role`) — do celów odczytu/audytu.
META_KLUCZ_GALAZ_ROLA_POLA = "nn_field_migrowana_rola"

#: Klucz meta gałęzi: BRAK wiązania katalogowego W CHWILI MIGRACJI (W061 zamiast E061).
META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA = "nn_promocja_bez_wiazania_katalogowej"

#: Klucz meta gałęzi: kod odmowy `assign_catalog_to_element`, gdy pole NIOSŁO wiązanie,
#: ale operacja go nie przyjęła — brak katalogu ma nazwaną przyczynę.
META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA = "nn_promocja_odmowa_wiazania"

_NAMESPACE_APARAT_NN = "APARAT_NN"

#: Role odpływu nN (`Bay.meta.feeder_role`) pola ŹRÓDŁA → rodzaj generatora
#: (`Generator.gen_type`) źródła stacyjnego, któremu pole służy.
ROLA_POLA_ZRODLA_NA_RODZAJ_GENERATORA: dict[str, str] = {
    "ZRODLO_NN_PV": "pv_inverter",
    "ZRODLO_NN_BESS": "bess",
    "ZRODLO_NN_FW": "wind_inverter",
}


def _canonical_json(data: object) -> str:
    return json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def _compute_seed(parts: dict[str, Any]) -> str:
    canonical = _canonical_json(parts)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


def _pola_nn_stacji(enm: EnergyNetworkModel, substation: Substation) -> list[Bay]:
    """Pola nN stacji w kolejności zapisu (deterministycznie) — rekordy `bays` stacji na
    szynie w paśmie nN."""
    napiecia = napiecia_szyn(enm)
    return [
        bay
        for bay in enm.bays
        if bay.substation_ref == substation.ref_id and czy_pole_nn(enm, bay, napiecia)
    ]


def _aparaty_promowane(enm: EnergyNetworkModel) -> dict[str, SwitchBranch]:
    """`ref_id` pola → aparat pola nN utworzony przez promocję."""
    wynik: dict[str, SwitchBranch] = {}
    for branch in enm.branches:
        znacznik = (branch.meta or {}).get(META_KLUCZ_GALAZ_ZRODLO_FIELD_REF)
        if isinstance(znacznik, str) and znacznik and isinstance(branch, SwitchBranch):
            wynik[znacznik] = branch
    return wynik


def _elementy_toru_pola(
    enm: EnergyNetworkModel, substation: Substation, bay: Bay, szyna_stacji: str
) -> tuple[list[Any], list[Any], list[Any]]:
    """Elementy, którym pole nN służy: (odbiory, źródła, transformatory) — reguły ról z opisu
    modułu. Zwraca wyłącznie elementy wskazane JAWNYMI danymi."""
    field_ref = bay.ref_id
    meta = bay.meta or {}
    rola = str(bay.bay_role or "").upper()
    odbiory = [ld for ld in enm.loads if (ld.meta or {}).get("feeder_ref") == field_ref]
    zrodla = [g for g in enm.generators if (g.meta or {}).get("field_ref") == field_ref]
    rodzaj = ROLA_POLA_ZRODLA_NA_RODZAJ_GENERATORA.get(str(meta.get("feeder_role") or ""))
    if rodzaj is not None and not zrodla:
        kandydaci = [
            g
            for g in enm.generators
            if g.gen_type == rodzaj
            and g.bus_ref == szyna_stacji
            and not (g.meta or {}).get("field_ref")
            and substation.ref_id in (g.station_ref, (g.meta or {}).get("station_ref"))
        ]
        if len(kandydaci) == 1:
            zrodla = kandydaci
    transformatory: list[Any] = []
    if rola == "IN":
        wskazany = meta.get("transformer_ref")
        if isinstance(wskazany, str) and wskazany:
            transformatory = [t for t in enm.transformers if t.ref_id == wskazany]
        else:
            pola_in_szyny = [
                b
                for b in _pola_nn_stacji(enm, substation)
                if str(b.bay_role or "").upper() == "IN" and b.bus_ref == szyna_stacji
            ]
            if len(pola_in_szyny) == 1:
                refy_stacji = set(substation.transformer_refs)
                transformatory = [
                    t
                    for t in enm.transformers
                    if t.ref_id in refy_stacji and t.lv_bus_ref == szyna_stacji
                ]
    return odbiory, zrodla, transformatory


def _do_przepiecia(enm: EnergyNetworkModel) -> list[tuple[Any, str, str, str]]:
    """Elementy leżące jeszcze na szynie stacji, choć ich pole ma aparat: (element, atrybut
    szyny, szyna docelowa, ref_id pola) — deterministycznie."""
    aparaty = _aparaty_promowane(enm)
    wynik: list[tuple[Any, str, str, str]] = []
    for substation in sorted(enm.substations, key=lambda s: s.ref_id):
        for bay in _pola_nn_stacji(enm, substation):
            aparat = aparaty.get(bay.ref_id)
            if aparat is None:
                continue
            odbiory, zrodla, transformatory = _elementy_toru_pola(enm, substation, bay, bay.bus_ref)
            for element in (*odbiory, *zrodla):
                if element.bus_ref == aparat.from_bus_ref:
                    wynik.append((element, "bus_ref", aparat.to_bus_ref, bay.ref_id))
            for transformator in transformatory:
                if transformator.lv_bus_ref == aparat.from_bus_ref:
                    wynik.append((transformator, "lv_bus_ref", aparat.to_bus_ref, bay.ref_id))
    return wynik


def _rekordy_do_uzupelnienia(enm: EnergyNetworkModel) -> list[tuple[Bay, SwitchBranch]]:
    """Pola nN promowane wcześniej, których rekord nie niesie jeszcze aparatu albo zacisku
    (migawki sprzed karty W5-B)."""
    aparaty = _aparaty_promowane(enm)
    wynik: list[tuple[Bay, SwitchBranch]] = []
    napiecia = napiecia_szyn(enm)
    for bay in enm.bays:
        aparat = aparaty.get(bay.ref_id)
        if aparat is None or not czy_pole_nn(enm, bay, napiecia):
            continue
        if aparat.ref_id not in bay.equipment_refs or bay.terminal_bus_ref != aparat.to_bus_ref:
            wynik.append((bay, aparat))
    return wynik


def wymaga_migracji(enm: EnergyNetworkModel) -> bool:
    """Czy istnieje pole nN bez aparatu, rekord pola bez zapisanego aparatu/zacisku albo
    element poza torem aparatu pola."""
    promowane = set(_aparaty_promowane(enm))
    for substation in enm.substations:
        for bay in _pola_nn_stacji(enm, substation):
            if bay.ref_id not in promowane:
                return True
    return bool(_rekordy_do_uzupelnienia(enm)) or bool(_do_przepiecia(enm))


def _wiazanie_z_pola(bay: Bay) -> dict[str, str] | None:
    """Wiązanie aparatu zapisane na polu nN (`catalog_bindings` z szablonu stacji albo
    `meta.catalog_binding` z operacji/importu) w kształcie payloadu
    ``assign_catalog_to_element``; ``None``, gdy pole nie wskazuje pozycji (np. wiązanie źródła
    przekształtnikowego ``catalog_bindings.source_converter`` — to NIE jest aparat pola)."""
    meta: dict[str, Any] = bay.meta if isinstance(bay.meta, dict) else {}
    surowe: Any = meta.get("catalog_binding")
    if surowe is None:
        surowe = bay.catalog_bindings
    if not isinstance(surowe, dict):
        return None
    item_id = surowe.get("catalog_item_id") or surowe.get("catalog_ref") or surowe.get("item_id")
    if not isinstance(item_id, str) or not item_id.strip():
        return None
    wersja = surowe.get("catalog_item_version")
    return {
        "catalog_namespace": _NAMESPACE_APARAT_NN,
        "catalog_item_id": item_id.strip(),
        "catalog_item_version": wersja if isinstance(wersja, str) and wersja else "2024.1",
    }


def _przypisz_wiazania(
    enm: EnergyNetworkModel, wiazania: list[tuple[str, dict[str, str]]]
) -> EnergyNetworkModel:
    """Przypisz wiązania aparatom operacją ``assign_catalog_to_element`` (ta sama operacja
    co akcja naprawcza projektanta). Odmowa operacji (słownik z `error`) zostawia aparat bez
    wiązania, z kodem odmowy operacji w meta (kod ZAWSZE obecny — `_error_response` go
    nadaje), i nie przerywa migracji; wyjątek operacji jest błędem programu i wybucha."""
    # Import leniwy: `enm.domain_operations` importuje ten moduł (klucze meta).
    from enm.domain_operations import assign_catalog_to_element

    dane = enm.model_dump(mode="json")
    for aparat_ref, wiazanie in wiazania:
        wynik = assign_catalog_to_element(
            dane, {"element_ref": aparat_ref, "catalog_binding": wiazanie}
        )
        if wynik.get("error"):
            kod = wynik.get("error_code")
            if not isinstance(kod, str) or not kod:
                raise RuntimeError(
                    f"assign_catalog_to_element odmówiło bez kodu błędu dla {aparat_ref!r}"
                )
            for galaz in dane["branches"]:
                if galaz["ref_id"] == aparat_ref:
                    galaz["meta"][META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA] = kod
            continue
        dane = wynik["snapshot"]
    return EnergyNetworkModel.model_validate(dane)


def _zapisz_aparat_na_polu(bay: Bay, aparat: SwitchBranch) -> None:
    """Rekord pola nN niesie swój aparat i zacisk — jak pole SN z aparatem w torze."""
    if aparat.ref_id not in bay.equipment_refs:
        bay.equipment_refs = [*bay.equipment_refs, aparat.ref_id]
    bay.terminal_bus_ref = aparat.to_bus_ref


def migruj(enm: EnergyNetworkModel) -> tuple[EnergyNetworkModel, bool]:
    """Promuj pola nN do realnych elementów (SwitchBranch + Bus).

    Returns:
        Para (model, czy_zmieniono). Przy braku zmian zwracany jest TEN SAM obiekt.
    """
    if not wymaga_migracji(enm):
        return enm, False

    zmigrowany = enm.model_copy(deep=True)
    bus_by_ref = {bus.ref_id: bus for bus in zmigrowany.buses}
    aparaty = _aparaty_promowane(zmigrowany)
    zmieniono = False
    do_przypisania: list[tuple[str, dict[str, str]]] = []

    for substation in zmigrowany.substations:
        do_promocji = [
            bay for bay in _pola_nn_stacji(zmigrowany, substation) if bay.ref_id not in aparaty
        ]
        if not do_promocji:
            continue

        stacja_zmieniona = False
        for bay in do_promocji:
            field_ref = bay.ref_id
            station_bus = bus_by_ref.get(bay.bus_ref)
            if station_bus is None:
                # Pole osierocone (szyna stacji nie istnieje) — nic bezpiecznego do
                # zbudowania; walidator zgłasza W006 (pole bez szyny).
                continue

            seed = _compute_seed(
                {
                    "op": "nn_field_promocja",
                    "station_ref": substation.ref_id,
                    "field_ref": field_ref,
                }
            )
            downstream_bus_ref = f"nn/{seed}/feeder_bus"
            apparatus_ref = f"nn/{seed}/feeder_device"
            if downstream_bus_ref in bus_by_ref or any(
                b.ref_id == apparatus_ref for b in zmigrowany.branches
            ):
                # Kolizja seedu (teoretyczna — pola o różnych ref_id dają różny seed).
                continue

            nowa_szyna = Bus(
                ref_id=downstream_bus_ref,
                name=nazwa_nadana(bay.name) or "Szyna odpływu nN",
                voltage_kv=station_bus.voltage_kv,
                meta={"visual_role": "NN_FEEDER_BUS", META_KLUCZ_GALAZ_ZRODLO_FIELD_REF: field_ref},
            )
            zmigrowany.buses.append(nowa_szyna)
            bus_by_ref[downstream_bus_ref] = nowa_szyna

            # Aparat powstaje BEZ wiązania (stan identyczny z tym, który naprawia
            # projektant); wiązanie zapisane na polu przypisuje niżej ta sama operacja,
            # która znacznik braku zdejmuje.
            aparat = SwitchBranch(
                ref_id=apparatus_ref,
                name=nazwa_nadana(bay.name) or "Aparat pola nN",
                type="breaker",
                from_bus_ref=station_bus.ref_id,
                to_bus_ref=downstream_bus_ref,
                status="closed",
                source_mode="MIGRACJA",
                meta={
                    META_KLUCZ_GALAZ_ZRODLO_FIELD_REF: field_ref,
                    META_KLUCZ_GALAZ_ROLA_POLA: bay.bay_role,
                    META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA: True,
                },
            )
            zmigrowany.branches.append(aparat)
            _zapisz_aparat_na_polu(bay, aparat)
            wiazanie = _wiazanie_z_pola(bay)
            if wiazanie is not None:
                do_przypisania.append((apparatus_ref, wiazanie))
            aparaty[field_ref] = aparat
            zmieniono = True
            stacja_zmieniona = True

        if stacja_zmieniona:
            meta = dict(substation.meta) if isinstance(substation.meta, dict) else {}
            meta[META_KLUCZ_STACJA_PROMOWANA] = True
            substation.meta = meta

    # Rekordy pól promowanych przed kartą W5-B — aparat i zacisk na rekordzie pola.
    for bay, aparat in _rekordy_do_uzupelnienia(zmigrowany):
        _zapisz_aparat_na_polu(bay, aparat)
        zmieniono = True

    # ZASADA TORU: element, któremu pole służy, przechodzi z szyny stacji na szynę ZA
    # aparatem pola — dla pól promowanych teraz i wcześniej (reguły ról: `_elementy_toru_pola`).
    for element, atrybut, szyna_docelowa, field_ref in _do_przepiecia(zmigrowany):
        setattr(element, atrybut, szyna_docelowa)
        if atrybut == "bus_ref" and element in zmigrowany.generators:
            element.meta = {**(element.meta or {}), "field_ref": field_ref}
        zmieniono = True

    if not zmieniono:
        return enm, False
    if do_przypisania:
        zmigrowany = _przypisz_wiazania(zmigrowany, do_przypisania)
    return zmigrowany, True
