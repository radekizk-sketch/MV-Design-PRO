"""
Deterministic SHA-256 hashing for EnergyNetworkModel.

Canonical JSON: sorted keys, no whitespace, exclude mutable header fields.

V12S-010 — Chain hashy:
  semantic_hash      — topologia + role + pasma napieciowe + catalog_ref
  input_hash         — wejscia obliczeniowe (R, X, B, Z0, Z2, dlugosci, ratingi,
                       sk3_mva, rx_ratio, vector_group, uk_percent)
  switching_snapshot_hash — TYLKO stany lacznikow (status open/closed)
  case_hash          — parametry przypadku obliczeniowego (analysis kind, scenario)
  variant_hash       — delty wariantu jako overlay (NIE oddzielny model)

Stary compute_enm_hash zostaje jako alias compute_input_hash dla wstecznej
kompatybilnosci (jednorazowy alias, deprecation w docstring, BEZ runtime warning,
zeby zachowac determinizm).

Kazda funkcja konsumuje TYLKO swoja krotke pol modelu — hashe sa ortogonalne.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from .models import EnergyNetworkModel

# ---------------------------------------------------------------------------
# Helper canonical dump
# ---------------------------------------------------------------------------

_ELEMENT_KEYS = (
    "buses",
    "branches",
    "transformers",
    "sources",
    "loads",
    "generators",
    "shunt_capacitors",
    "substations",
    "bays",
    "junctions",
    "corridors",
    "branch_points",
    "measurements",
    "protection_assignments",
)


#: Pola elementow DODANE PO ZAMROZENIU odciskow, ktore w postaci kanonicznej hasha
#: wystepuja WYLACZNIE, gdy niosa wartosc (kontrakt „addytywnie, `exclude_none`" —
#: dyrektywa wlasciciela 2026-07-19 pkt 11: nowe pole nie moze przestawic odciskow
#: istniejacych modeli; ten sam wzorzec, co `connection_conditions` w naglowku).
#: `None` = dana zadeklarowana jako NIEZNANA, wiec nie jest trescia modelu; wartosc
#: zmienia wynik biegu (Z_Qmin), wiec zmienia odcisk. Kazdy wpis z karta i powodem;
#: przypiete testem `tests/enm/test_hash_pola_addytywne.py` (odcisk bez danych MIN
#: rowny odciskowi postaci sprzed karty; z danymi MIN — inny; trzy funkcje hasha zgodne).
_POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE: dict[str, tuple[str, ...]] = {
    # CV-4.3 K7: dane zwarciowe scenariusza MIN zrodla sieciowego (IEC 60909-0 eq. 6 z c_min).
    # + napięcie zadane szyny bilansującej (bliźniaki literatury ze slackiem ≠ 1,0 p.u.).
    # + W5-A: opis punktu neutralnego sieci SN zasilanej z równoważnika (jedyny
    # nośnik po kasacji `Bus.grounding`; migawki bez opisu haszują jak przed kartą).
    # + karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: tolerancja napięcia sieci nN źródła przyłączonego
    # wprost do szyny nN (wiersz nN tabeli 1 IEC 60909-0) — podana zmienia c i Z_Q.
    "sources": (
        "sk3_min_mva",
        "ik3_min_ka",
        "rx_ratio_min",
        "u_set_pu",
        "neutral_grounding",
        "lv_voltage_tolerance",
    ),
    # Karta W5-D (F-1): fazy przylaczenia odbioru. `None` = odbior trojfazowy
    # symetryczny (jedyne znaczenie, jakie `Load` mial przed karta) — poza odciskiem;
    # wskazana faza zmienia wynik rozplywu niesymetrycznego, wiec zmienia odcisk.
    # + karta modeli odbiorow (O-56): blok modelu dynamicznego odbioru `Load.dynamika` —
    # kopia profilu katalogu `load_dynamic`. `None` = odbior bez modelu dynamicznego
    # (dzisiejsze biegi SC/PF go nie czytaja); podany blok zmienia wejscie biegu
    # `dynamika_rms`, wiec zmienia odcisk.
    # + karta W5-E-TTIT: uziom instalacji odbiorczej R_A (`None` = dana nieobecna, poza
    # odciskiem; podana wartość zmienia wynik pętli TT/IT, więc zmienia odcisk).
    "loads": ("phases", "dynamika", "earth_electrode_r_ohm"),
    # W5-A: układ sieci nN typowany na transformatorze (w miejsce
    # dawnego klucza meta stacji) i układ uziemienia ekranu kabla.
    # + karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: tolerancja napięcia sieci nN (wiersz nN tabeli 1
    # IEC 60909-0) — podana zmienia c węzłów nN i K_T, więc zmienia odcisk.
    "transformers": ("lv_earthing_system", "lv_voltage_tolerance"),
    # + karta LINIA-110: geometria słupa linii 110 kV i proweniencja parametrów z geometrii
    # (`None` = linia bez obliczenia z geometrii — każda linia SN sprzed karty).
    # + W5-C: pozycja normalna łącznika (punkt normalnie otwarty). `None` =
    # niezadeklarowana — poza odciskiem (gałęzie sprzed karty haszują jak przed nią);
    # zadeklarowana jest treścią modelu i stanem łączeniowym (odcisk przełączeń).
    # + UX-04/POLE-LINIOWE-WZORZEC: stan obiektu łącznika ISTNIEJACY/PROJEKTOWANY (`None` =
    # gałąź sprzed atrybutu — poza odciskiem; nadany stan jest treścią modelu, bo rozstrzyga
    # zakaz gazów fluorowanych).
    "branches": (
        "screen_bonding",
        "geometria_slupa",
        "parametry_z_geometrii",
        "normal_state",
        "stan_obiektu",
    ),
    # Karta W5-B: pola typowane rekordu pola rozdzielnicy (dawne klucze wpisu
    # dawny słownik pól SN w `meta` stacji). `None`/pusta lista = dana nienadana — poza odciskiem, zeby rekordy
    # `bays` istniejace przed karta (stacja konca ciagu) haszowaly jak przed nia; wartosc
    # (zacisk, rola kanoniczna, pomiar, powiazania producenckie) jest trescia modelu.
    "bays": (
        "branch_point_ref",
        "branch_point_port_id",
        "field_role",
        "terminal_bus_ref",
        "funkcja_pomiaru",
        "rodzaj_pomiaru",
        "switchgear_family_ref",
        "manufacturer_ref",
        "apparatus_catalog_ref",
        "config_id",
        "catalog_bindings",
        "wybor_bloku",
        "metadane_pochodzenia",
        "surge_arresters",
        # Karta UX-04/POLE-LINIOWE-WZORZEC (korekta właściciela 2026-10-28): stan obiektu
        # ISTNIEJACY/PROJEKTOWANY. `None` = rekord sprzed atrybutu (stan nieustalony) — poza
        # odciskiem; nadany stan jest treścią modelu (rozstrzyga zakaz gazów fluorowanych).
        "stan_obiektu",
        # Ta sama karta (rozszerzenie 2): klasa pola liniowego (IRiESD II.4.5.4.2). `None` =
        # klasa nieustalona — poza odciskiem; zadeklarowana jest treścią modelu.
        "klasa_pola",
        # Ta sama karta (decyzja właściciela 2026-10-29): powiązanie źródła napięcia zerowego
        # 3U₀ pola. `None` = źródło niepowiązane — poza odciskiem; powiązanie jest treścią
        # modelu (rozstrzyga przypisanie funkcji 67N).
        "zrodlo_u0_ref",
    ),
    # Karta W6-1: parametry dynamiczne zrodla (kontrakt czasu RMS/DAE, unia
    # dyskryminowana `ParametryDynamiczne`). `None` = brak wejscia zdefiniowanego
    # dla przyszlego solvera W6-2 (jeszcze nie istnieje) — nie jest trescia modelu
    # dzisiejszych biegow SC/PF; podana wartosc zmieni tylko przyszly bieg
    # dynamika_rms, wiec dopiero wtedy zmienia odcisk.
    # + karta AB-H0 §0.7.6: modele widmowe zmaterializowane z kart widmowych. `None` =
    # brak modelu widmowego (sekcja harmonic UNKNOWN) — nie jest trescia modelu dzisiejszych
    # biegow; wiazanie karty zmienia wejscie analiz czestotliwosciowych, wiec zmienia odcisk.
    # + karta AB-1a Pakiet C (plan AB O-31, O-32): status modulu istniejacego (art. 4),
    # data umowy przylaczeniowej (resolver wersji warstw profilu) i nastawy zabezpieczen
    # modulu. `None` = dana nieustalona (ocena wymagan nazywa brak) — nie jest trescia
    # modelu; podana wartosc zmienia wynik oceny zgodnosci NC RfG, wiec zmienia odcisk.
    # + odbior Pakietu C (plan AB O-50): deklaracje modulu dla testow NC RfG — to samo prawo.
    "generators": (
        "dynamika",
        "modele_widmowe",
        "modul_istniejacy",
        "data_umowy_przylaczeniowej",
        "nastawy_zabezpieczen",
        "deklaracje_modulu",
    ),
    # Karta UX-04/POLE-LINIOWE-WZORZEC (rozszerzenie 4 pkt 3): rdzenie CT i uzwojenia VT jako
    # listy. `None` = tabliczka niedostarczona (każdy przekładnik sprzed karty) — poza odciskiem;
    # podana lista jest treścią modelu (dobór obciążenia obwodów wtórnych).
    "measurements": ("rdzenie", "uzwojenia"),
    # + karta UX-04/POLE-BKR-MODEL: parametry baterii kondensatorów nadane na elemencie
    # (układ połączeń, stopnie, tolerancja pojemności, dławik ograniczający, rezystory
    # rozładowcze). `None` = parametr nienadany przez projektanta (rozstrzyga typ katalogowy
    # albo wartość robocza rejestru) — poza odciskiem, żeby bateria sprzed karty haszowała
    # jak przed nią; podany zmienia wynik rozpływu (stopnie, dławik) albo zwarcia
    # doziemnego (układ), więc zmienia odcisk.
    "shunt_capacitors": (
        "uklad_polaczen",
        "liczba_stopni",
        "stopnie_zalaczone",
        "tolerancja_pojemnosci_min_proc",
        "tolerancja_pojemnosci_max_proc",
        "dlawik_ograniczajacy",
        "dlawik_indukcyjnosc_mh",
        "rezystory_rozladowcze_wewnetrzne",
    ),
}

#: W5-A: pola SKASOWANE z modelu, ktore odcisk ZACHOWUJE jako `null`. Przed kasacja
#: `model_dump` wypisywal `"grounding": null` na KAZDEJ szynie i ten `null` wchodzil
#: do odcisku; zniknięcie klucza zmieniloby odcisk kazdej migawki z szyna, a rewizje
#: (`enm/rewizje.py`) weryfikuja tresc hashem — cala historia stalaby sie
#: „uszkodzona". Odciski modeli sa zamrozone (Determinism Rule), wiec kanoniczna
#: postac elementu pod hash niesie skasowany klucz jako `null`. Szyna, ktora MIALA
#: wartosc, zmienia odcisk (wartosc przeniesiona na `Source.neutral_grounding`) —
#: to zmiana swiadoma, nazwana w raporcie migracji (`enm/uziemienie.py`).
#: Przypiete testem `tests/enm/test_hash_w5_uziemienie.py`.
#: W5-C: `Corridor.no_point_ref` skasowane (punkt podziału = `SwitchBranch.normal_state`) —
#: ta sama zasada; magistrala bez punktu podziału haszuje jak przed kartą, magistrala,
#: która go wskazywała, zmienia odcisk (pozycja przeniesiona na łącznik — raport
#: `enm/stan_normalny.py`). Przypięte testem `tests/enm/test_stan_normalny_lacznikow.py`.
#: `BranchPointSN.switch_state` skasowane tak samo (kopia stanu łączników portów); punkt
#: rozgałęzienia z wartością (dawne uzupełnianie wpisywało „closed" domyślnie) zmienia
#: odcisk — usunięcie kopii nazywa raport migracji.
_POLA_SKASOWANE_W_ODCISKU: dict[str, tuple[str, ...]] = {
    "buses": ("grounding",),
    "corridors": ("no_point_ref",),
    "branch_points": ("switch_state",),
    # Karta UX-04/POLE-LINIOWE-WZORZEC: `Measurement.ct_cores` (sama liczba rdzeni) skasowane —
    # rdzenie opisuje lista `rdzenie`. Przekładnik bez liczby haszuje jak przed kasacją;
    # przekładnik, który ją miał, zmienia odcisk (liczba zastąpiona listą rdzeni).
    "measurements": ("ct_cores",),
}

#: W5-C: pola SKASOWANE z kolekcji `line_runs` — kolekcja stoi poza `_ELEMENT_KEYS`
#: (jej `id` wchodzi do odcisku, pin `tests/enm/test_polityka_hash_kolekcji.py`), więc
#: osobny wpis tej samej reguły „skasowane jako `null`": `LineRun.nop_station_ref` była
#: martwą kopią punktu podziału (zawsze `null` w zapisie, bo ciąg powstaje z nowej
#: magistrali), a jej zniknięcie nie może przestawić odcisku żadnej migawki z ciągiem.
_POLA_SKASOWANE_W_ODCISKU_CIAGOW: tuple[str, ...] = ("nop_station_ref",)

#: Karta W5-B: pola-LISTY rekordu pola dodane po zamrozeniu odciskow, ktorych wartosc
#: domyslna to pusta lista (nie `None`). Pusta lista = dana nienadana — poza odciskiem
#: (rekordy `bays` sprzed karty haszuja jak przed nia); lista niepusta jest trescia
#: modelu. Osobny slownik, a nie rozszerzenie reguly `None`: pola z listy wyzej moga
#: miec legalna pusta liste jako tresc zamrozona w odciskach sprzed karty.
#: Przypiete testem `tests/enm/test_hash_w5b_bays.py`.
_POLA_ADDYTYWNE_POZA_HASHEM_GDY_PUSTE: dict[str, tuple[str, ...]] = {
    "bays": ("surge_arresters",),
    # Karta UX-04/POLE-BKR-MODEL: transformatory, których wyłączenie wyłącza baterię
    # (IRiESD II.4.5.4.4.2). Pusta lista = powiązanie nienadane — poza odciskiem.
    "shunt_capacitors": ("wylaczenie_od_transformatorow",),
}

#: Karta UX-04/POLE-LINIOWE-WZORZEC: pola-LISTY ELEMENTÓW ZAGNIEŻDŻONYCH rekordu (aparat pola
#: `Bay.primary_devices[*]`) dodane po zamrożeniu odcisków, z wartością domyślną pustej listy.
#: Pusta lista portów = porty nienadane (aparat sprzed karty) — poza odciskiem, żeby migawki
#: z aparatami pól sprzed karty haszowały jak przed nią; porty podane są treścią modelu
#: (połączenia aparatów pola). Przypięte testem `tests/enm/test_pole_liniowe_gpz_szablony.py`
#: (`test_odcisk_pustych_list_jak_brak_pola`).
_POLA_ZAGNIEZDZONE_POZA_HASHEM_GDY_PUSTE: dict[str, dict[str, tuple[str, ...]]] = {
    # Poprawki P0 2026-10-29: powiązania obwodów wtórnych wzorca na aparacie (funkcje EAZ
    # mierzące z przekładnika, działające na wyłącznik) — pusta lista = aparat bez powiązań.
    "bays": {
        "primary_devices": (
            "ports",
            "rdzenie",
            "uzwojenia",
            "funkcje_eaz_zasilane",
            "funkcje_eaz_wylaczajace",
        )
    },
}

#: Ta sama karta (korekta właściciela 2026-10-28): pola ELEMENTÓW ZAGNIEŻDŻONYCH o wartości
#: domyślnej `None` — stan obiektu instancji aparatu pola (`BayPrimaryDevice.stan_obiektu`).
#: `None` = aparat sprzed atrybutu — poza odciskiem; nadany stan jest treścią modelu.
#: Uzupełnienie właściciela 2026-10-29 (wzorzec pola Z.10/Z.11.1): przekładnia przekładnika
#: Ferrantiego (`BayPrimaryDevice.przekladnia`) — to samo prawo; test odcisku:
#: `tests/enm/test_pole_liniowe_gpz_szablony.py::test_odcisk_pustych_list_jak_brak_pola`.
_POLA_ZAGNIEZDZONE_POZA_HASHEM_GDY_NONE: dict[str, dict[str, tuple[str, ...]]] = {
    # Poprawki P0 2026-10-29: napęd wyłącznika wykonawczego wzorca (`BayPrimaryDevice.naped`).
    "bays": {"primary_devices": ("stan_obiektu", "odgalezienie", "przekladnia", "naped")},
}

#: Pola SKASOWANE z modelu, ktore odcisk PELNY (trzy hashe pelne, nie projekcja
#: semantyczna — tam ich nigdy nie bylo) zachowuje jako `null`, wedlug tej samej zasady co
#: `_POLA_SKASOWANE_W_ODCISKU`. Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: `Source.c_max`/`c_min`
#: (fantom — zapisywane, nigdy nieczytane; c dobiera wyłącznie `voltage_factor`) — kazda
#: migawka ze zrodlem niosla `"c_max": null, "c_min": null`. Zrodlo, ktore MIALO wartosc,
#: zmienia odcisk (wartosc nie wchodzila do zadnego obliczenia). Przypiete testem
#: `tests/enm/test_wspolczynnik_c_jeden_nosnik.py`.
_POLA_SKASOWANE_W_ODCISKU_PELNYM: dict[str, tuple[str, ...]] = {"sources": ("c_max", "c_min")}


def _postac_kanoniczna_elementu(item: dict[str, Any], key: str, *, pelna: bool = True) -> None:
    """JEDNA regula postaci elementu pod odcisk (trzy hashe pelne + semantyczny):
    bez `id`, bez pol addytywnych o wartosci `None` (i pustej liście dla pol-list z
    `_POLA_ADDYTYWNE_POZA_HASHEM_GDY_PUSTE`), ze skasowanymi polami jako `null`
    (pola skasowane spoza projekcji semantycznej — wylacznie w postaci pelnej)."""
    item.pop("id", None)
    for pole in _POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE.get(key, ()):
        if pole in item and item[pole] is None:
            del item[pole]
    for pole in _POLA_ADDYTYWNE_POZA_HASHEM_GDY_PUSTE.get(key, ()):
        if pole in item and item[pole] == []:
            del item[pole]
    zagniezdzone_puste = _POLA_ZAGNIEZDZONE_POZA_HASHEM_GDY_PUSTE.get(key, {})
    zagniezdzone_none = _POLA_ZAGNIEZDZONE_POZA_HASHEM_GDY_NONE.get(key, {})
    for lista in sorted(set(zagniezdzone_puste) | set(zagniezdzone_none)):
        elementy = item.get(lista)
        if isinstance(elementy, list):
            pola_puste = zagniezdzone_puste.get(lista, ())
            pola_none = zagniezdzone_none.get(lista, ())
            # Nowa lista nowych słowników — elementy zagnieżdżone należą do migawki wołającego
            # (`_kopia_pod_hash` kopiuje elementy kolekcji płytko).
            item[lista] = [
                (
                    {
                        k: v
                        for k, v in el.items()
                        if not ((k in pola_puste and v == []) or (k in pola_none and v is None))
                    }
                    if isinstance(el, dict)
                    else el
                )
                for el in elementy
            ]
    for pole in _POLA_SKASOWANE_W_ODCISKU.get(key, ()):
        item.setdefault(pole, None)
    if pelna:
        for pole in _POLA_SKASOWANE_W_ODCISKU_PELNYM.get(key, ()):
            item.setdefault(pole, None)


def _strip_uuids(payload: dict[str, Any]) -> dict[str, Any]:
    """Postac kanoniczna elementow pod hash: bez losowych `id` (UUID — `ref_id` jest
    tozsamoscia), bez pol addytywnych o wartosci `None`
    (`_POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE`) i ze skasowanymi polami jako `null`
    (`_POLA_SKASOWANE_W_ODCISKU`). JEDYNE miejsce tej reguly — wolaja ja
    `compute_enm_hash`, `_input_payload` i `hash_migawki_enm`, wiec trzy odciski
    nie moga sie rozjechac."""
    # W1: sekcja `katalog_projektu` jest addytywna — brak sekcji i `None` to ten sam
    # model (odciski sprzed pola bajtowo niezmienione); obecna sekcja wchodzi do hasha.
    if payload.get("katalog_projektu") is None:
        payload.pop("katalog_projektu", None)
    elif isinstance(payload["katalog_projektu"], dict):
        # Karta AB-H0 §0.7.3: karty widmowe projektu — lista addytywna; pusta lista to
        # ten sam katalog projektu co przed kartą (odcisk bajtowo niezmieniony). Nowy słownik
        # zamiast mutacji: `hash_migawki_enm` nie kopiuje sekcji, a migawki wołającego
        # nie wolno dotknąć.
        if not payload["katalog_projektu"].get("karty_widmowe"):
            payload["katalog_projektu"] = {
                klucz: wartosc
                for klucz, wartosc in payload["katalog_projektu"].items()
                if klucz != "karty_widmowe"
            }
    for key in _ELEMENT_KEYS:
        if key in payload and isinstance(payload[key], list):
            for item in payload[key]:
                if isinstance(item, dict):
                    _postac_kanoniczna_elementu(item, key)
    if isinstance(payload.get("line_runs"), list):
        for ciag in payload["line_runs"]:
            if isinstance(ciag, dict):
                for pole in _POLA_SKASOWANE_W_ODCISKU_CIAGOW:
                    ciag.setdefault(pole, None)
    return payload


def _canonical_sha256(payload: dict[str, Any]) -> str:
    """Determinizm SHA-256 nad kanonicznym JSON (sorted keys, no whitespace)."""
    canonical = json.dumps(
        payload,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _strip_keys(payload: dict[str, Any], keys: tuple[str, ...]) -> None:
    """Usun klucze rekurencyjnie z elementow listy 'value'."""
    for k in keys:
        payload.pop(k, None)


# ---------------------------------------------------------------------------
# Field projections per hash
# ---------------------------------------------------------------------------

# semantic_hash: topologia, role, pasma napieciowe, catalog_ref
# Excluded: parametry obliczeniowe (R/X/B/Z0/Z2), dlugosci, ratingi, switching state
_SEMANTIC_INCLUDE_BUS = ("ref_id", "name", "voltage_kv", "zone")
_SEMANTIC_INCLUDE_BRANCH = (
    "ref_id",
    "name",
    "type",
    "from_bus_ref",
    "to_bus_ref",
    "catalog_ref",
    "catalog_namespace",
)
_SEMANTIC_INCLUDE_TRANSFORMER = (
    "ref_id",
    "name",
    "hv_bus_ref",
    "lv_bus_ref",
    "catalog_ref",
    "catalog_namespace",
    "vector_group",
)
_SEMANTIC_INCLUDE_SOURCE = (
    "ref_id",
    "name",
    "bus_ref",
    "model",
    "catalog_ref",
    "catalog_namespace",
    "gpz_section_id",
    # W5-A: sposób pracy punktu neutralnego sieci SN jest semantyką sieci (przed
    # kartą niósł ją klucz `grounding` szyny w tej samej projekcji).
    "neutral_grounding",
)
_SEMANTIC_INCLUDE_GENERATOR = (
    "ref_id",
    "name",
    "bus_ref",
    "gen_type",
    "connection_variant",
    "blocking_transformer_ref",
    "station_ref",
    "catalog_ref",
)
_SEMANTIC_INCLUDE_LOAD = ("ref_id", "name", "bus_ref", "model", "catalog_ref")
_SEMANTIC_INCLUDE_SHUNT_CAPACITOR = (
    "ref_id",
    "name",
    "bus_ref",
    "catalog_ref",
    "catalog_namespace",
)
_SEMANTIC_INCLUDE_BAY = (
    "ref_id",
    "name",
    "bay_role",
    "substation_ref",
    "bus_ref",
    "gpz_section_id",
)
_SEMANTIC_INCLUDE_SUBSTATION = (
    "ref_id",
    "name",
    "station_type",
    "bus_refs",
    "transformer_refs",
    "entry_point_ref",
    # P0.1 nN (karta P0.1 pkt 7): sekcje rozdzielnicy nN sa TOPOLOGIA (ktora szyna
    # nalezy do ktorej sekcji, sprzeglo) — pominiecie byloby cicha dziura w
    # inwalidacji semantycznej (zmiana sekcjonowania RGnN nie zmieniłaby
    # semantic_hash mimo zmiany struktury sieci).
    "nn_sections",
)


def _project(item: dict[str, Any], include: tuple[str, ...], key: str) -> dict[str, Any]:
    """Projekcja semantyczna elementu + ta sama postac kanoniczna co hashe pelne
    (W5-A: `Bus.grounding` skasowane → w projekcji jako `null`, jak przed karta;
    `Source.neutral_grounding` = `None` → poza projekcja, jak kazde pole addytywne)."""
    wynik = {k: item[k] for k in include if k in item}
    _postac_kanoniczna_elementu(wynik, key, pelna=False)
    return wynik


def _semantic_payload(enm: EnergyNetworkModel) -> dict[str, Any]:
    raw = enm.model_dump(mode="json", exclude={"header"})
    return {
        "buses": [_project(b, _SEMANTIC_INCLUDE_BUS, "buses") for b in raw.get("buses", [])],
        "branches": [
            _project(b, _SEMANTIC_INCLUDE_BRANCH, "branches") for b in raw.get("branches", [])
        ],
        "transformers": [
            _project(t, _SEMANTIC_INCLUDE_TRANSFORMER, "transformers")
            for t in raw.get("transformers", [])
        ],
        "sources": [
            _project(s, _SEMANTIC_INCLUDE_SOURCE, "sources") for s in raw.get("sources", [])
        ],
        "generators": [
            _project(g, _SEMANTIC_INCLUDE_GENERATOR, "generators")
            for g in raw.get("generators", [])
        ],
        "loads": [_project(ld, _SEMANTIC_INCLUDE_LOAD, "loads") for ld in raw.get("loads", [])],
        "shunt_capacitors": [
            _project(sc, _SEMANTIC_INCLUDE_SHUNT_CAPACITOR, "shunt_capacitors")
            for sc in raw.get("shunt_capacitors", [])
        ],
        "bays": [_project(b, _SEMANTIC_INCLUDE_BAY, "bays") for b in raw.get("bays", [])],
        "substations": [
            _project(s, _SEMANTIC_INCLUDE_SUBSTATION, "substations")
            for s in raw.get("substations", [])
        ],
    }


def _input_payload(enm: EnergyNetworkModel) -> dict[str, Any]:
    """Pelny model bez header.{updated_at, created_at, hash_sha256, *_hash}
    i bez UUID, BEZ pol switching state (status branch).
    """
    data = enm.model_dump(
        mode="json",
        exclude={
            "header": {
                "updated_at",
                "created_at",
                "hash_sha256",
                "semantic_hash",
                "input_hash",
                "case_hash",
                "variant_hash",
                "switching_snapshot_hash",
            }
        },
    )
    _strip_uuids(data)
    # Switching state nie powinno wplywac na input_hash (V12S-010 ortogonalnosc).
    # W5-C: pozycja normalna lacznika jest stanem laczeniowym tak samo jak `status`.
    for branch in data.get("branches", []):
        if isinstance(branch, dict):
            branch.pop("status", None)
            branch.pop("normal_state", None)
    return data


def _switching_snapshot_payload(enm: EnergyNetworkModel) -> dict[str, Any]:
    """TYLKO stany lacznikow — galezie z polem 'status' (open/closed).

    W5-C (ADR-017: odcisk przelaczen z PELNEGO stanu lacznikow): zadeklarowana
    pozycja normalna (`normal_state`) wchodzi do odcisku obok `status`; `None` poza
    odciskiem (gałęzie sprzed karty haszuja jak przed nia).
    """
    raw = enm.model_dump(mode="json", exclude={"header"})
    galezie: list[dict[str, Any]] = []
    for b in raw.get("branches", []):
        if "status" not in b:
            continue
        rekord = {"ref_id": b.get("ref_id"), "status": b.get("status")}
        if b.get("normal_state") is not None:
            rekord["normal_state"] = b["normal_state"]
        galezie.append(rekord)
    return {"branches": galezie}


# ---------------------------------------------------------------------------
# Public hash API
# ---------------------------------------------------------------------------


def compute_semantic_hash(enm: EnergyNetworkModel) -> str:
    """V12S-010: hash topologii + rol + pasm napieciowych + catalog_ref.

    Niewrazliwy na: zmiany dlugosci, R/X/B/Z0/Z2, ratingi, sk3_mva, switching state.
    """
    return _canonical_sha256(_semantic_payload(enm))


def compute_input_hash(enm: EnergyNetworkModel) -> str:
    """V12S-010: hash pelnych wejsc obliczeniowych BEZ switching state.

    Wrazliwy na: parametry (R, X, B, Z0, Z2, dlugosci, ratingi, sk3_mva, rx_ratio,
    uk_percent, vector_group). Niewrazliwy na: stany lacznikow.

    Backward-compat: zachowuje semantyke poprzedniego compute_enm_hash poza
    wykluczeniem switching state (zmiana intencjonalna pod V12S-010).
    """
    return _canonical_sha256(_input_payload(enm))


def compute_switching_snapshot_hash(enm: EnergyNetworkModel) -> str:
    """V12S-010: hash TYLKO stanow lacznikow (status open/closed na galeziach)."""
    return _canonical_sha256(_switching_snapshot_payload(enm))


def compute_case_hash(case_payload: dict[str, Any]) -> str:
    """V12S-010: hash parametrow przypadku obliczeniowego.

    case_payload zawiera np. analysis_type, scenario_ref, normy, fault_location
    — wszystko poza ENM samym w sobie.
    """
    return _canonical_sha256(case_payload)


def compute_variant_hash(variant_payload: dict[str, Any]) -> str:
    """V12S-010: hash delty wariantu (overlay).

    Wariant to tylko delta nakladana na model — NIE oddzielny model
    (V12S-010 mityguje ryzyko Single Model rule).
    """
    return _canonical_sha256(variant_payload)


#: Pola naglowka wykluczane z hasha modelu — JEDNA lista dla `compute_enm_hash`
#: (hash z obiektu) i `hash_migawki_enm` (hash ze slownika `model_dump`): oba
#: odciski musza byc rowne co do bitu dla tej samej tresci (przypiete testem
#: `tests/enm/test_scenariusze.py::test_hash_migawki_rowny_hashowi_modelu`).
_POLA_NAGLOWKA_POZA_HASHEM = (
    "updated_at",
    "created_at",
    "hash_sha256",
    # Warunki przyłączenia OSD (dane WEJŚCIOWE dokumentu, czytane w warstwie
    # interpretacji — nie przez solver). Wykluczone jak pozostałe pola zmienne
    # nagłówka: deklaracja pola w ENMHeader (naprawa defektu utrwalania, karta
    # POMIAR-RODZAJ) nie może przestawić odcisków istniejących modeli.
    "connection_conditions",
)


def hash_migawki_enm(snapshot: dict[str, Any]) -> str:
    """Hash modelu policzony ze SLOWNIKA migawki (`EnergyNetworkModel.model_dump(mode="json")`).

    Ta sama regula co `compute_enm_hash` (te same wykluczenia naglowka, te same
    usuniete UUID elementow, ten sam kanoniczny JSON), ale bez odtwarzania obiektu
    modelu — dla migawek efektywnych scenariuszy (CV-3.1, `enm/scenariusze.py`),
    ktore powstaja jako slowniki z narzuconymi nadpisaniami i sa hashowane
    setki razy (sondy zdolnosci przylaczeniowej). Rownosc z `compute_enm_hash`
    dla migawki bez nadpisan jest przypieta testem; migawka przekazana przez
    wolajacego NIE jest modyfikowana (praca na glebokiej kopii).
    """
    data = _kopia_pod_hash(snapshot)
    _strip_uuids(data)
    return _canonical_sha256(data)


#: Kolekcje opisujące WYŁĄCZNIE zabezpieczenia i ich przekładniki — nie wchodzą do żadnego
#: obliczenia rozpływu ani zwarcia (solver nie czyta ani nastaw, ani przekładni).
_KOLEKCJE_ZABEZPIECZEN = ("protection_assignments", "measurements")
#: Pola nagłówka zmieniane przez KAŻDĄ edycję (rewizja) albo będące etykietą (nazwa, opis) —
#: nie są treścią sieci liczonej przez solver.
_POLA_NAGLOWKA_POZA_SIECIA = ("revision", "name", "description")


def hash_sieci_bez_zabezpieczen(snapshot: dict[str, Any]) -> str:
    """Odcisk SIECI liczonej przez solver — migawka bez zabezpieczeń i przekładników.

    Karta BIEG-ZABEZPIECZEN-Z-MODELU (D-21): nastawy żyją w modelu, więc ich edycja zmienia
    migawkę i rewizję modelu, ale NIE zmienia sieci, którą policzył bieg zwarciowy. Ocena
    zabezpieczeń czyta nastawy z BIEŻĄCEGO modelu, a topologię i rozpływ prądu zwarciowego z
    biegu źródłowego — wolno jej to zrobić wyłącznie wtedy, gdy oba opisują TĘ SAMĄ sieć. Ten
    odcisk jest jedynym kryterium tej równości (stany łączników WCHODZĄ do odcisku — zmieniają
    rozpływ). Migawka wołającego nie jest modyfikowana.
    """
    data = _kopia_pod_hash(snapshot)
    for klucz in _KOLEKCJE_ZABEZPIECZEN:
        data.pop(klucz, None)
    naglowek = data.get("header")
    if isinstance(naglowek, dict):
        data["header"] = {k: v for k, v in naglowek.items() if k not in _POLA_NAGLOWKA_POZA_SIECIA}
    _strip_uuids(data)
    return _canonical_sha256(data)


def siec_biegu_zgodna_z_modelem(
    snapshot_biegu: dict[str, Any] | None, snapshot_modelu: dict[str, Any]
) -> bool:
    """Czy bieg (migawka ``snapshot_biegu``) policzono dla TEJ SAMEJ sieci co model?

    JEDYNY predykat zgodności sieci biegu zwarciowego z modelem dla oceny zabezpieczeń — wołają
    go: tworzenie biegu ``protection_sn`` (``canonical_analysis._validate_protection_sc_reference``),
    świeżość wyniku tego biegu (``api/protection_runs._swiezosc_wyniku``) i koordynacja E-28
    (``coordination/z_biegow._sprawdz_siec``). Wejście i wyjście tej samej decyzji z jednego
    źródła: wynik, który tworzenie przepuściło, nie może zostać uznany za nieaktualny innym
    kryterium (i odwrotnie). Bieg bez migawki nie jest zgodny z żadną siecią.
    """
    if snapshot_biegu is None:
        return False
    return hash_sieci_bez_zabezpieczen(snapshot_biegu) == hash_sieci_bez_zabezpieczen(
        snapshot_modelu
    )


def _kopia_pod_hash(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Kopia migawki dokladnie tak gleboka, jak siegaja mutacje hashowania:
    naglowek bez pol zmiennych, elementy list skopiowane plytko (z nich znika
    wylacznie `id`). Zadna struktura wolajacego nie jest dotykana."""
    data: dict[str, Any] = {}
    for klucz, wartosc in snapshot.items():
        if klucz == "header" and isinstance(wartosc, dict):
            data[klucz] = {k: v for k, v in wartosc.items() if k not in _POLA_NAGLOWKA_POZA_HASHEM}
        elif (klucz in _ELEMENT_KEYS or klucz == "line_runs") and isinstance(wartosc, list):
            data[klucz] = [dict(item) if isinstance(item, dict) else item for item in wartosc]
        else:
            data[klucz] = wartosc
    return data


def compute_enm_hash(enm: EnergyNetworkModel) -> str:
    """DEPRECATED w docstring (BEZ runtime warning — determinizm zachowany).

    Zachowuje DOKLADNIE oryginalna semantyke sprzed V12S-010 (switching state
    wlaczone w hash) dla wstecznej kompatybilnosci z istniejacymi stored hashes.

    Nowy kod powinien uzywac jednej z funkcji ortogonalnych:

      compute_semantic_hash           — topologia + role + pasma + catalog_ref
      compute_input_hash              — wejscia obliczeniowe BEZ switching
      compute_switching_snapshot_hash — TYLKO stany lacznikow
      compute_case_hash               — parametry przypadku
      compute_variant_hash            — delty wariantu
    """
    data = enm.model_dump(mode="json", exclude={"header": set(_POLA_NAGLOWKA_POZA_HASHEM)})
    _strip_uuids(data)
    return _canonical_sha256(data)
