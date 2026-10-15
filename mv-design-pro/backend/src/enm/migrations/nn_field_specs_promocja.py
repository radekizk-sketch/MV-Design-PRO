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

ZASADA TORU (karta POLA-W-TORZE, §0 pkt 1). Aparat pola nN leży w torze prądowym
elementu, któremu pole służy — promocja PRZEPINA ten element na zacisk pola (szynę za
aparatem), zamiast stawiać martwy aparat obok elementu wiszącego na szynie stacji.
Reguły ról (jedno źródło — `_elementy_toru_pola`):
- odpływ (`FEEDER`, rola odpływu odbiorczego): odbiory z `Load.meta.feeder_ref == field_ref`;
- pole źródła (`FEEDER` z rolą `ZRODLO_NN_PV/BESS/FW` albo `OZE`): źródła z
  `Generator.meta.field_ref == field_ref`, a źródło stacyjne bez tej relacji (tor budowy
  stacji z bloku nN) — jedyne źródło stacji danej technologii na szynie pola;
- wyłącznik główny nN (`IN`, pole transformatorowe nN): strona dolna transformatora —
  `meta.transformer_ref` pola, a bez tej relacji transformatory stacji ze stroną dolną na
  szynie pola, gdy pole jest JEDYNYM polem `IN` tej szyny (inaczej przypisanie nie wynika
  z danych i promocja transformatora nie przepina — walidator wskazuje stan).
Przepięcie działa także dla wpisów promowanych WCZEŚNIEJ (aparat istnieje, szyna za nim
pusta, element nadal na szynie stacji) — to ta sama reguła, nie druga droga: element ma
leżeć za aparatem swojego pola, niezależnie od chwili promocji.

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


#: Role odpływu nN (`nn_field_specs[].meta.feeder_role`) pola ŹRÓDŁA → rodzaj generatora
#: (`Generator.gen_type`) źródła stacyjnego, któremu pole służy.
ROLA_POLA_ZRODLA_NA_RODZAJ_GENERATORA: dict[str, str] = {
    "ZRODLO_NN_PV": "pv_inverter",
    "ZRODLO_NN_BESS": "bess",
    "ZRODLO_NN_FW": "wind_inverter",
}


def _aparaty_promowane(enm: EnergyNetworkModel) -> dict[str, SwitchBranch]:
    """`field_ref` wpisu → aparat pola nN utworzony przez promocję."""
    wynik: dict[str, SwitchBranch] = {}
    for branch in enm.branches:
        znacznik = (branch.meta or {}).get(META_KLUCZ_GALAZ_ZRODLO_FIELD_REF)
        if isinstance(znacznik, str) and znacznik and isinstance(branch, SwitchBranch):
            wynik[znacznik] = branch
    return wynik


def _elementy_toru_pola(
    enm: EnergyNetworkModel, substation: Substation, spec: dict[str, Any], szyna_stacji: str
) -> tuple[list[Any], list[Any], list[Any]]:
    """Elementy, którym pole nN służy: (odbiory, źródła, transformatory) — reguły ról z opisu
    modułu. Zwraca wyłącznie elementy wskazane JAWNYMI danymi."""
    field_ref = spec["field_ref"]
    meta = spec.get("meta") or {}
    rola = str(spec.get("bay_role") or "").upper()
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
                s
                for s in _promotable_specs(substation)
                if str(s.get("bay_role") or "").upper() == "IN" and s.get("bus_ref") == szyna_stacji
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
    szyny, szyna docelowa, field_ref) — deterministycznie."""
    aparaty = _aparaty_promowane(enm)
    wynik: list[tuple[Any, str, str, str]] = []
    for substation in sorted(enm.substations, key=lambda s: s.ref_id):
        for spec in _promotable_specs(substation):
            aparat = aparaty.get(spec["field_ref"])
            szyna_stacji = spec.get("bus_ref")
            if aparat is None or not isinstance(szyna_stacji, str):
                continue
            odbiory, zrodla, transformatory = _elementy_toru_pola(
                enm, substation, spec, szyna_stacji
            )
            for element in (*odbiory, *zrodla):
                if element.bus_ref == aparat.from_bus_ref:
                    wynik.append((element, "bus_ref", aparat.to_bus_ref, spec["field_ref"]))
            for transformator in transformatory:
                if transformator.lv_bus_ref == aparat.from_bus_ref:
                    wynik.append(
                        (transformator, "lv_bus_ref", aparat.to_bus_ref, spec["field_ref"])
                    )
    return wynik


def wymaga_migracji(enm: EnergyNetworkModel) -> bool:
    """Czy istnieje wpis `nn_field_specs` bez aparatu albo element poza torem aparatu pola."""
    promowane = _already_promoted_field_refs(enm)
    for substation in enm.substations:
        for spec in _promotable_specs(substation):
            if spec["field_ref"] not in promowane:
                return True
    return bool(_do_przepiecia(enm))


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
    operacja co akcja naprawcza projektanta). Odmowa operacji (słownik z `error`)
    zostawia aparat bez wiązania, z kodem odmowy w meta, i nie przerywa migracji
    (przebiega przy KAŻDYM odczycie modelu, `enm/store.py`); wyjątek operacji jest
    błędem programu i wybucha (karta #151 — dawne `except Exception` w materializacji
    gubiło po cichu wiązanie aparatu, a model szedł dalej bez jego parametrów)."""
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

        if stacja_zmieniona:
            meta = dict(substation.meta) if isinstance(substation.meta, dict) else {}
            meta[META_KLUCZ_STACJA_PROMOWANA] = True
            substation.meta = meta

    # ZASADA TORU: element, któremu pole służy (odbiór odpływu, źródło pola źródłowego,
    # transformator wyłącznika głównego nN), przechodzi z szyny stacji na szynę ZA aparatem
    # pola — dla wpisów promowanych teraz i wcześniej (reguły ról: `_elementy_toru_pola`).
    # KLASA, NIE INSTANCJA (przegląd 2026-08-01): odbiory wiszą na wpisie przez
    # `Load.meta.feeder_ref`, źródła przez `Generator.meta.field_ref`, transformator przez rolę
    # IN pola — jeden mechanizm przepięcia dla wszystkich trzech.
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
