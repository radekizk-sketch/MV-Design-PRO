"""Automigracja: promocja `Substation.meta.nn_field_specs` do realnych elementów.

DLACZEGO (karta P0.1, C §4.2, LV-INV-12). Przed tą migracją odpływy i pola
źródłowe nN istniały WYŁĄCZNIE jako wpisy w `Substation.meta.nn_field_specs`
(worek meta zapisywany przez `add_nn_outgoing_field`) — solver i SLD musiałyby
czytać DWIE reprezentacje tej samej rzeczy (graf + worek meta), co jest
dokładnie tym, czego zakazuje LV-INV-12 („UI i solver używają TEGO SAMEGO
grafu nN"). Migracja przenosi każdy wpis do realnego `SwitchBranch` (aparat
pola) między szyną nN stacji a NOWĄ szyną odpływu — `nn_field_specs` zostaje
odtąd WYŁĄCZNIE projekcją odczytu (SLD/inspektor), źródłem prawdy jest graf.

WŁASNOŚCI (jak pozostałe automigracje ENM):
- **idempotentna** — sprawdzenie GRANULARNE per wpis (istnienie gałęzi z
  meta-znacznikiem `field_ref`), NIE znacznik stacji: znacznik stacji
  (`nn_fields_promoted`) jest wyłącznie INFORMACYJNY (czytelny dla SLD/UI —
  „strona nN tej stacji ma realne elementy"), a NIE bramą pomijającą kolejne
  przebiegi. Gdyby bramą był wyłącznie znacznik stacji, wpis dopisany do
  `nn_field_specs` PO pierwszej promocji (np. przez stary, nieusunięty
  `add_nn_outgoing_field`) nigdy nie zostałby zmigrowany — dokładnie ten sam
  błąd metodyczny, co „INSTANCJA, nie KLASA" z przeglądu 2026-08-01.
- **deterministyczna** — ref_id nowych elementów z SHA-256 nad kanonicznymi
  danymi wejściowymi (ten sam wzorzec co `domain_operations._compute_seed` /
  `_make_id`; funkcje NIE są stąd importowane, żeby migracja nie zależała od
  warstwy operacji domenowych — layering, nie duplikacja przypadkowa).
- **bezstratna** — `nn_field_specs` NIE jest kasowany (zostaje jako projekcja
  odczytu, LV-INV-12); żadna wartość nie ginie, odbiór/generator dostaje NOWY
  `bus_ref` (szyna odpływu), nie kasację. Dotyczy OBU klas elementów wiszących
  na wpisie: `Load.meta.feeder_ref` (odpływy) i `Generator.meta.field_ref`
  (pola źródłowe DER, `add_converter_source` wariant `nn_side`) — różne klucze
  meta, ten sam mechanizm relokacji.

WIĄZANIE KATALOGOWE APARATU. Wpis `nn_field_specs` niesie wiązanie wtedy, gdy
zapisała je operacja tworząca (szablon stacji: `meta.catalog_bindings` odpływów;
import, edycja ręczna: `meta.catalog_binding`). Migracja przenosi je TĄ SAMĄ
operacją, którą projektant naprawia brak ręcznie — `assign_catalog_to_element`
(karta SLD-SUBSTRAT, kontynuacja): dawniej migracja materializowała pozycję
własną ścieżką i wynik różnił się od akcji naprawczej (brak
`meta.catalog_item_version`), czyli dwie drogi tej samej zmiany modelu. Gdy
wiązania nie ma — albo operacja je odrzuci (nieistniejąca pozycja, kategoria
niepasująca do aparatu) — aparat wchodzi do modelu BEZ wiązania i ze znacznikiem
`META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA` (odmowa operacji zapisana obok, w
`META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA`). Walidator (`enm/validator.py`)
czyta znacznik jako W061 — nazwana pozycja gotowości z akcją naprawczą
wskazującą aparat i pole nN, z którego powstał; ręcznie tworzona gałąź nN bez
wiązania zostaje E061. Brak katalogu blokuje analizy, które czytają dane
aparatu nN (bramka kwalifikacji SWZ nN), a nie rysunek.

SKUTEK DLA HASZY — jak przy migracji punktu przyłączenia: migracja zmienia
model (nowe szyny/gałęzie, przeniesione `bus_ref` odbiorów), więc podnosi
rewizję (przez `set_enm` w `enm/store.py`). To uczciwa konsekwencja realnej
zmiany reprezentacji, nie błąd.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from enm.models import Bus, EnergyNetworkModel, Substation, SwitchBranch
from network_model.nazwy import nazwa_nadana

MIGRATION_VERSION = "nn_field_specs_promocja_001"

#: Klucz meta stacji: znacznik INFORMACYJNY (nie bramka) — „ta stacja miała
#: przebieg promocji". Czytelny dla SLD/inspektora; idempotencja migracji NIE
#: opiera się na tym kluczu (patrz docstring modułu).
META_KLUCZ_STACJA_PROMOWANA = "nn_fields_promoted"

#: Klucz meta gałęzi: identyfikator wpisu `nn_field_specs`, z którego gałąź
#: powstała. JEDYNE źródło idempotencji per-wpis (czy TEN field_ref ma już
#: realny aparat) oraz JEDYNE źródło parowania odbiorów (Load.meta.feeder_ref)
#: z nową szyną odpływu.
META_KLUCZ_GALAZ_ZRODLO_FIELD_REF = "nn_field_migrowany_z"

#: Klucz meta gałęzi: rola wpisu źródłowego (`bay_role` z `nn_field_specs`) —
#: przenoszona wyłącznie do celów odczytu/audytu (SLD, raport migracji).
META_KLUCZ_GALAZ_ROLA_POLA = "nn_field_migrowana_rola"

#: Klucz meta gałęzi: BRAK wiązania katalogowego W CHWILI MIGRACJI. Jedyny
#: wyjątek walidatora E061→W061 (`enm/validator.py`) — gałąź nN utworzona
#: RĘCZNIE bez wiązania zostaje BLOCKER, ta z migracji (dane historyczne,
#: których katalog nigdy nie widział) — WARNING.
META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA = "nn_promocja_bez_wiazania_katalogowej"

#: Klucz meta gałęzi: kod odmowy `assign_catalog_to_element`, gdy wpis NIÓSŁ
#: wiązanie, ale operacja go nie przyjęła — brak katalogu ma nazwaną przyczynę,
#: nie jest cichym zerem.
META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA = "nn_promocja_odmowa_wiazania"

_NAMESPACE_APARAT_NN = "APARAT_NN"


def _canonical_json(data: object) -> str:
    return json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def _compute_seed(parts: dict[str, Any]) -> str:
    canonical = _canonical_json(parts)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


def _promotable_specs(substation: Substation) -> list[dict[str, Any]]:
    """Wpisy `nn_field_specs` stacji, w stałej kolejności zapisu (deterministycznie)."""
    meta = substation.meta if isinstance(substation.meta, dict) else {}
    raw = meta.get("nn_field_specs")
    if not isinstance(raw, list):
        return []
    return [spec for spec in raw if isinstance(spec, dict) and spec.get("field_ref")]


def _already_promoted_field_refs(enm: EnergyNetworkModel) -> set[str]:
    """Zbiór `field_ref`, dla których realny aparat JUŻ istnieje w grafie."""
    znane: set[str] = set()
    for branch in enm.branches:
        znacznik = (branch.meta or {}).get(META_KLUCZ_GALAZ_ZRODLO_FIELD_REF)
        if isinstance(znacznik, str) and znacznik:
            znane.add(znacznik)
    return znane


def wymaga_migracji(enm: EnergyNetworkModel) -> bool:
    """Czy istnieje choć jeden wpis `nn_field_specs` bez odpowiadającego aparatu."""
    promowane = _already_promoted_field_refs(enm)
    for substation in enm.substations:
        for spec in _promotable_specs(substation):
            if spec["field_ref"] not in promowane:
                return True
    return False


def _wiazanie_z_wpisu(spec: dict[str, Any]) -> dict[str, str] | None:
    """Wiązanie aparatu zapisane we wpisie pola nN (``meta.catalog_binding`` albo
    ``meta.catalog_bindings``) w kształcie payloadu ``assign_catalog_to_element``;
    ``None``, gdy wpis nie wskazuje pozycji (np. wiązanie źródła przekształtnikowego
    ``catalog_bindings.source_converter`` — to NIE jest aparat pola)."""
    surowe_meta = spec.get("meta")
    meta: dict[str, Any] = surowe_meta if isinstance(surowe_meta, dict) else {}
    surowe = meta.get("catalog_binding")
    if surowe is None:
        surowe = meta.get("catalog_bindings")
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
    """Przypisz wiązania aparatom operacją ``assign_catalog_to_element`` (ta sama
    operacja co akcja naprawcza projektanta). Odmowa operacji zostawia aparat bez
    wiązania, z kodem odmowy w meta — migracja NIGDY nie podnosi wyjątku
    (przebiega przy KAŻDYM odczycie modelu, `enm/store.py`)."""
    # Import leniwy: `enm.domain_operations` importuje ten moduł (klucze meta).
    from enm.domain_operations import assign_catalog_to_element

    dane = enm.model_dump(mode="json")
    for aparat_ref, wiazanie in wiazania:
        wynik = assign_catalog_to_element(
            dane, {"element_ref": aparat_ref, "catalog_binding": wiazanie}
        )
        if wynik.get("error"):
            for galaz in dane["branches"]:
                if galaz["ref_id"] == aparat_ref:
                    galaz["meta"][META_KLUCZ_NN_PROMOCJA_ODMOWA_WIAZANIA] = str(
                        wynik.get("error_code") or "catalog.assign_failed"
                    )
            continue
        dane = wynik["snapshot"]
    return EnergyNetworkModel.model_validate(dane)


def migruj(enm: EnergyNetworkModel) -> tuple[EnergyNetworkModel, bool]:
    """Promuj wpisy `nn_field_specs` do realnych elementów (SwitchBranch + Bus).

    Returns:
        Para (model, czy_zmieniono). Przy braku zmian zwracany jest TEN SAM
        obiekt — wołający nie podbija rewizji bez powodu (wzorzec DER).
    """
    if not wymaga_migracji(enm):
        return enm, False

    zmigrowany = enm.model_copy(deep=True)
    bus_by_ref = {bus.ref_id: bus for bus in zmigrowany.buses}
    promowane = _already_promoted_field_refs(zmigrowany)
    zmieniono = False
    do_przypisania: list[tuple[str, dict[str, str]]] = []

    for substation in zmigrowany.substations:
        specs = _promotable_specs(substation)
        do_promocji = [s for s in specs if s["field_ref"] not in promowane]
        if not do_promocji:
            continue

        stacja_zmieniona = False
        for spec in do_promocji:
            field_ref = spec["field_ref"]
            station_bus_ref = spec.get("bus_ref")
            station_bus = bus_by_ref.get(station_bus_ref) if station_bus_ref else None
            if station_bus is None:
                # Wpis osierocony (szyna stacji, do której się odnosił, już nie
                # istnieje) — nic bezpiecznego do zbudowania, pomijamy wpis.
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
                # Kolizja seedu (teoretyczna — pola z różnymi field_ref dają różny
                # seed) — pomijamy, żeby nie nadpisać istniejącego elementu.
                continue

            nowa_szyna = Bus(
                ref_id=downstream_bus_ref,
                name=nazwa_nadana(spec.get("name")) or "Szyna odpływu nN",
                voltage_kv=station_bus.voltage_kv,
                meta={"visual_role": "NN_FEEDER_BUS", META_KLUCZ_GALAZ_ZRODLO_FIELD_REF: field_ref},
            )
            zmigrowany.buses.append(nowa_szyna)
            bus_by_ref[downstream_bus_ref] = nowa_szyna

            # Aparat powstaje BEZ wiązania (stan identyczny z tym, który naprawia
            # projektant); wiązanie zapisane we wpisie przypisuje niżej ta sama
            # operacja, która znacznik braku zdejmuje.
            aparat = SwitchBranch(
                ref_id=apparatus_ref,
                name=nazwa_nadana(spec.get("name")) or "Aparat pola nN",
                type="breaker",
                from_bus_ref=station_bus.ref_id,
                to_bus_ref=downstream_bus_ref,
                status="closed",
                source_mode="MIGRACJA",
                meta={
                    META_KLUCZ_GALAZ_ZRODLO_FIELD_REF: field_ref,
                    META_KLUCZ_GALAZ_ROLA_POLA: spec.get("bay_role"),
                    META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA: True,
                },
            )
            zmigrowany.branches.append(aparat)
            wiazanie = _wiazanie_z_wpisu(spec)
            if wiazanie is not None:
                do_przypisania.append((apparatus_ref, wiazanie))
            promowane.add(field_ref)
            zmieniono = True
            stacja_zmieniona = True

            # Odbiory podpięte pod ten wpis (Load.meta.feeder_ref == field_ref)
            # przenoszą się z szyny stacji na NOWĄ szynę odpływu — LV-INV-12
            # (odbiór wisi za aparatem odpływowym, nie wprost na szynie stacji).
            for load in zmigrowany.loads:
                if (load.meta or {}).get("feeder_ref") == field_ref:
                    load.bus_ref = downstream_bus_ref

            # KLASA, NIE INSTANCJA (przegląd 2026-08-01): odbiory NIE SĄ jedynym
            # elementem wiszącym na wpisie `nn_field_specs` — źródło przekształtnikowe
            # (`add_converter_source`, wariant `nn_side`) zapisuje TĘ SAMĄ referencję
            # jako `Generator.meta.field_ref` (`_append_converter_field_if_needed`,
            # `enm/domain_operations_v2.py`), pod INNYM kluczem meta (`field_ref`, nie
            # `feeder_ref`). Bez tego bloku migracja zostawiała generator wprost na
            # szynie stacji RÓWNOLEGLE do nowo utworzonego, martwego aparatu pola —
            # graf i deklarowane pole rozjeżdżały się (naruszenie LV-INV-12 dla
            # źródeł, nie tylko odbiorów).
            for generator in zmigrowany.generators:
                if (generator.meta or {}).get("field_ref") == field_ref:
                    generator.bus_ref = downstream_bus_ref

        if stacja_zmieniona:
            meta = dict(substation.meta) if isinstance(substation.meta, dict) else {}
            meta[META_KLUCZ_STACJA_PROMOWANA] = True
            substation.meta = meta

    if not zmieniono:
        return enm, False
    if do_przypisania:
        zmigrowany = _przypisz_wiazania(zmigrowany, do_przypisania)
    return zmigrowany, True
