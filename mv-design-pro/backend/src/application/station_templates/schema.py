"""StationTemplate schema dataclasses — K30-16 fully editable template library.

User K30-15.4 demand: "te template muszą być edytwoalne w zakresie wszystkich
parametrów tj np liczby falowników rozdzauj zabezpieczen, typu rodzielnicy,
mocy/typu TR, wszytko konfikguraowalne".

Schema covers:
- Transformer: type + count + tap (catalog options)
- SN switchgear: manufacturer + bays count + per-pole apparatus
- nN feeders: count (1-8) + per-feeder CB + loads
- DER: count + kind + power + connection variant + NC RfG profile
- Protection: per-pole relay + settings template
- Measurements: CT/VT/energy meter per pole
"""

from __future__ import annotations

import math
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from domain.generator_validation import (
    moc_czynna_jednostki_mw,
    moc_pozorna_wymagana_mva,
    moc_pozorna_z_nastawy_mva,
)
from enm.rola_pola_sn import nazwa_roli_pola_sn_z_okresleniem
from enm.slownik_komunikatow import pole
from network_model.pochodne import (
    kw_na_mw,
    moc_pozorna_z_czynnej_i_biernej_mva,
    mva_na_kva,
    mw_na_kw,
)


class TemplateCategory(StrEnum):
    """15 kategorii templates per use-case (V12T-016: +5 rola A/C/E)."""

    TYPOWA_SN_NN = "typowa_sn_nn"  # Dystrybucyjne 100-2500 kVA
    SLUPOWA = "slupowa"  # Stacje słupowe ZSP
    ZKSN_WNETRZOWA = "zksn_wnetrzowa"  # ZKSN wnętrzowe
    PROSUMENT_PV = "prosument_pv"  # μPV 8-250 kW
    FARMA_PV = "farma_pv"  # Farmy PV SN 0,66-4,95 MW
    BESS = "bess"  # Magazyny energii
    HYBRYDOWA = "hybrydowa"  # PV + BESS
    PRZEMYSLOWA = "przemyslowa"  # Odbiorcze przemysłowe
    WIATROWA = "wiatrowa"  # OZE wiatrowe
    SEKCYJNA = "sekcyjna"  # Sekcyjne / pętlowe
    # V12T-016 (rejestr długu, rola A "Zasilanie sieci" — licznik ZERO przed tą kartą):
    GPZ_110_SN = "gpz_110_sn"  # GPZ 110/SN — WN/SN, sekcje szyn, mostek
    ROZDZIELNIA_SIECIOWA = "rozdzielnia_sieciowa"  # RS/RSM — bez TR, pola liniowe + sprzęgło
    # V12T-016 (rola C — delta obok istniejącej PRZEMYSLOWA):
    STACJA_ABONENCKA = "stacja_abonencka"  # Odbiorcza SN z układem pomiarowym (CT/VT)
    # V12T-016 (rola E — delta obok istniejącej SEKCYJNA):
    KOMPENSACJA = "kompensacja"  # Bateria kondensatorów SN (kompensacja mocy biernej)
    REZERWA_ZASILANIA = "rezerwa_zasilania"  # Pole rezerwowe / zasilanie SZR


#: Etykieta PL kategorii = pole strukturalne "zastosowanie" (KARTA-UI2 §1 p. 12:
#: kontrakt dostaje pola strukturalne zastosowania/mocy/napięcia, nie parsuje
#: `name_pl`). `category` jest ISTNIEJĄCYM polem `StationTemplate` (`to_dict`
#: zwraca `category.value`) — front dotąd nie miał etykiety PL dla filtra.
#: Promowane z `api/station_templates.py::_CATEGORY_LABELS` (ISTNIEJĄCY słownik
#: dotąd używany WYŁĄCZNIE przez `/categories`, treść bez zmian) — warstwa
#: schematu jest właściwym miejscem (API importuje z domeny, nie odwrotnie);
#: `api/station_templates.py` importuje stąd zamiast trzymać drugą kopię.
TEMPLATE_CATEGORY_LABELS_PL: dict[TemplateCategory, str] = {
    TemplateCategory.TYPOWA_SN_NN: "Typowe stacje SN/nN",
    TemplateCategory.SLUPOWA: "Stacje słupowe ZSP",
    TemplateCategory.ZKSN_WNETRZOWA: "Stacje ZKSN wnętrzowe",
    TemplateCategory.PROSUMENT_PV: "Mikroinstalacje PV prosument",
    TemplateCategory.FARMA_PV: "Farmy PV SN",
    TemplateCategory.BESS: "Magazyny BESS",
    TemplateCategory.HYBRYDOWA: "Hybrydy PV + BESS",
    TemplateCategory.PRZEMYSLOWA: "Przemysłowe odbiorcze",
    TemplateCategory.WIATROWA: "Stacje OZE wiatrowe",
    TemplateCategory.SEKCYJNA: "Stacje sekcyjne / pętlowe",
    TemplateCategory.GPZ_110_SN: "GPZ 110/SN",
    TemplateCategory.ROZDZIELNIA_SIECIOWA: "Rozdzielnie sieciowe RS/RSM",
    TemplateCategory.STACJA_ABONENCKA: "Stacje abonenckie SN z pomiarem",
    TemplateCategory.KOMPENSACJA: "Kompensacja mocy biernej",
    TemplateCategory.REZERWA_ZASILANIA: "Rezerwa zasilania",
}


@dataclass(frozen=True)
class TemplateParamInt:
    """Editable integer parameter z range constraints."""

    default: int
    min_value: int
    max_value: int
    step: int = 1
    label_pl: str = ""


@dataclass(frozen=True)
class TemplateParamFloat:
    """Editable float parameter."""

    default: float
    min_value: float
    max_value: float
    step: float = 0.01
    unit: str = ""
    label_pl: str = ""


def obciazenie_odplywu_param(obciazenie_kw: float = 50.0) -> TemplateParamFloat:
    """Parametr „Obciążenie per odpływ" szablonu z domyślną wartością `obciazenie_kw` —
    szablon małej stacji ustawia ją tak, żeby domyślne odbiory mieściły się w obiecanym
    transformatorze (`rozstrzygnij_transformator_stacji` odmawia przy niedoborze)."""
    return TemplateParamFloat(
        default=obciazenie_kw,
        min_value=0.0,
        max_value=2000.0,
        unit="kW",
        label_pl="Obciążenie per odpływ",
    )


@dataclass(frozen=True)
class CatalogChoice:
    """Catalog option dla dropdown (np. typ TR 100/250/630 kVA)."""

    catalog_ref: str
    label_pl: str
    namespace: str  # CatalogNamespace
    default: bool = False
    badge_pl: str | None = None  # e.g. "PTPiRE certyfikat"


@dataclass(frozen=True)
class BayRoleSpec:
    """Rola pola SN w szablonie stacji (IN/OUT/FEEDER/TR/MEASUREMENT/COUPLER).

    Etykieta pola NIE jest wolnym tekstem szablonu: to nazwa roli z kanonu słownictwa ról pól
    (`enm.rola_pola_sn`, karta #141) + określenie, które odróżnia pole w tym szablonie
    („(sekcja A)", „sekcyjnego (mostek H5)", „rezerwowe"). Rola i jej nazwa pochodzą z jednego
    źródła, więc szablon nie może nazwać pola innym słowem niż reszta produktu.
    """

    role: str  # 'IN' | 'OUT' | 'FEEDER' | 'TR' | 'MEASUREMENT' | 'COUPLER'
    okreslenie_pl: str = ""
    apparatus_options: tuple[CatalogChoice, ...] = ()  # CB/DS/LS choices

    @property
    def label_pl(self) -> str:
        return nazwa_roli_pola_sn_z_okresleniem(self.role, self.okreslenie_pl)


@dataclass(frozen=True)
class DanaProjektuSzablonu:
    """Pole wejścia, które szablon WYMAGA od projektanta i którego NIE wypełnia (karta GPZ-H5,
    wpis 7 koordynacji pkt 6): stan normalny łącznika szyn 110 kV, tryb rezerwy, tory zasilania.

    `klucz` — ścieżka pola ładunku operacji `operacja` (np. ``hv_coupler.normal_state``);
    nazwa pola pochodzi ze słownika nazw pól operacji (`enm.slownik_komunikatow.pole`), więc
    formularz i komunikat odmowy nazywają je tym samym słowem. `wartosci` — dozwolone wartości
    z nazwą (pusta krotka = dana złożona albo tekst). Brak wartości domyślnej jest cechą
    kontraktu: szablon nie ma pola `default`. `warunek_pl` — kiedy dana jest wymagana
    (pusty = zawsze)."""

    klucz: str
    podpowiedz_pl: str
    podstawa_pl: str
    operacja: str = "add_grid_source_sn"
    wartosci: tuple[tuple[str, str], ...] = ()
    warunek_pl: str = ""

    @property
    def label_pl(self) -> str:
        return pole(self.klucz, self.operacja)

    @property
    def klucz_ladunku(self) -> str:
        """Klucz najwyższego poziomu ładunku operacji, pod którym leży dana."""
        return self.klucz.split(".", 1)[0]


@dataclass(frozen=True)
class DerKindSpec:
    """DER inverter kind option."""

    kind: str  # 'PV' | 'BESS' | 'FW'
    label_pl: str
    catalog_options: tuple[CatalogChoice, ...]
    default_count: int = 1
    default_p_mw_each: float = 0.5
    connection_variant_options: tuple[str, ...] = ("nn_side", "block_transformer")


def typ_modulu_nc_rfg_skladu(
    der_options: tuple[DerKindSpec, ...], napiecie_przylaczenia_kv: float
) -> str | None:
    """Typ modułu NC RfG szablonu ze SKŁADU (Σ liczba · moc jednostki) — ta sama reguła
    progów co walidacja generatora, solver PTPiREE i API (`klasyfikuj_modul`), a nie
    wpisana ręcznie litera. Pomiar 2026-10-15: dawne ręczne „C" i „D" dla farm 3–5 MW
    i hybryd przeczyły progom warstwy WOS (typ C od 10 MW)."""
    from catalog.profiles.nc_rfg.loader import klasyfikuj_modul

    moc_mw = sum(spec.default_count * spec.default_p_mw_each for spec in der_options)
    return klasyfikuj_modul(mw_na_kw(moc_mw), napiecie_przylaczenia_kv)


@dataclass(frozen=True)
class ProtectionRelaySpec:
    """Protection relay option per bay."""

    device_catalog_ref: str
    label_pl: str
    vendor: str  # ELEKTROMETAL/SIEMENS/ABB/SCHNEIDER/SEL/GE/ZPAS/ELESTER/etc.
    settings_template_id: str
    badge_pl: str | None = None  # e.g. "PTPiREE / NC RfG"


@dataclass(frozen=True)
class TemplateSchema:
    """Editable parameters dla template — wszystko configurable."""

    # Transformer
    transformer_options: tuple[CatalogChoice, ...]
    transformer_count: TemplateParamInt = field(
        default_factory=lambda: TemplateParamInt(
            default=1, min_value=1, max_value=2, label_pl="Liczba transformatorów"
        )
    )

    # SN switchgear
    sn_switchgear_manufacturers: tuple[str, ...] = (
        "ZPUE_WLOSZCZOWA",
        "ELEKTROMETAL",
        "ABB",
        "SIEMENS",
        "SCHNEIDER",
    )
    sn_switchgear_default: str = "ZPUE_WLOSZCZOWA"
    sn_bays_count: TemplateParamInt = field(
        default_factory=lambda: TemplateParamInt(
            default=2, min_value=1, max_value=8, label_pl="Liczba pól SN"
        )
    )
    sn_bay_roles: tuple[BayRoleSpec, ...] = ()
    sn_bay_protection_options: tuple[ProtectionRelaySpec, ...] = ()
    sn_bay_apparatus_options: tuple[CatalogChoice, ...] = ()
    """Aparatura pól SN dostępna w szablonie (APARAT_SN) — B-12.

    Wskazanie aparatu należy do szablonu/projektanta; operacja domenowa NIE
    dobiera go sama. Rola z własnymi `apparatus_options` ma pierwszeństwo przed
    tą listą wspólną. Pusta lista ⇒ szablon nie da się zastosować bez jawnego
    `params_override['sn_bay_apparatus_ref']` (jawny błąd, nie domysł)."""

    # nN side
    nn_feeders_count: TemplateParamInt = field(
        default_factory=lambda: TemplateParamInt(
            default=2, min_value=1, max_value=8, label_pl="Liczba odpływów nN"
        )
    )
    nn_feeder_cb_options: tuple[CatalogChoice, ...] = ()
    nn_load_default_kw: TemplateParamFloat = field(default_factory=obciazenie_odplywu_param)

    # DER
    der_options: tuple[DerKindSpec, ...] = ()
    der_total_count: TemplateParamInt = field(
        default_factory=lambda: TemplateParamInt(
            default=0, min_value=0, max_value=20, label_pl="Liczba modułów DER"
        )
    )

    # Protection
    protection_settings_default: str | None = None  # Template ID

    # Measurements
    ct_options: tuple[CatalogChoice, ...] = ()
    vt_options: tuple[CatalogChoice, ...] = ()
    energy_meter_options: tuple[CatalogChoice, ...] = ()

    # Catalog cascade
    manufacturer_profile_default: str = "ZPUE_WLOSZCZOWA"

    # Kompensacja mocy biernej (V12T-016, rola E) — bateria kondensatorów SN
    # (KOMPENSATOR_SN) dołączana do szyny SN stacji podczas `apply`. Pusta
    # krotka (domyślnie) = szablon nie niesie kompensatora — addytywne pole,
    # istniejące 57+ szablonów mają `()` bez zmiany zachowania.
    shunt_capacitor_options: tuple[CatalogChoice, ...] = ()

    # Warunki zasilania GPZ (V12T-016, rola A) — równoważnik systemowy
    # (ZRODLO_SN) widziany z szyny SN GPZ, użyty WYŁĄCZNIE przez
    # `apply.py::_zastosuj_gpz_pod_blokada` (droga `add_grid_source_sn`, nie
    # `insert_station_on_segment_sn`). Pusta krotka dla wszystkich pozostałych
    # kategorii — addytywne pole.
    grid_source_options: tuple[CatalogChoice, ...] = ()

    # Układ GPZ (karta GPZ-H5) — `GPZ_UKLAD_H5`: strona 110 kV w modelu (dwa tory zasilania
    # L1/L2 z danych projektu, transformatory 110/SN z `transformer_options` przypisane jawnie
    # sekcja 110 kV → sekcja SN); `GPZ_UKLAD_ROWNOWAZNIK_SN`: równoważnik z katalogu
    # (`grid_source_options`) na KAŻDEJ sekcji SN. `None` dla pozostałych kategorii.
    gpz_uklad: str | None = None

    # Dane projektu wymagane przez szablon i NIE wypełniane przez niego (karta GPZ-H5) —
    # pola wejścia z podpowiedzią i podstawą. Pusta krotka dla szablonów bez takich danych.
    dane_projektu: tuple[DanaProjektuSzablonu, ...] = ()


#: Układ ENEA H5 (ENEA Operator, Zeszyt 1 „Stacje 110 kV” §11.1): dwie linie 110 kV, dwa pola
#: transformatorowe, jedno pole łącznika szyn — strona 110 kV jest w modelu obliczeniowym.
GPZ_UKLAD_H5 = "H5"
#: GPZ z równoważnikiem sieci z katalogu na każdej sekcji SN (granica modelu = szyny SN).
GPZ_UKLAD_ROWNOWAZNIK_SN = "ROWNOWAZNIK_SN"
GPZ_UKLADY: tuple[str, ...] = (GPZ_UKLAD_H5, GPZ_UKLAD_ROWNOWAZNIK_SN)


def transformer_voltages_kv(transformer_ref: str | None) -> tuple[float | None, float | None]:
    """Katalogowe napięcia GN/DN wybranego transformatora [kV] — z REALNEGO
    rekordu katalogu (nie z tokenu id ani z `name_pl`): jedna prawda napięć,
    ta sama którą waliduje `station.insert`
    (`_validate_transformer_voltage_compatibility`). `(None, None)` gdy brak
    referencji/rekordu/katalogu (moduł katalogu niezaimportowany w środowisku
    — uczciwy brak, nie fabrykowana wartość).

    Promowane z `apply.py::_transformer_lv_voltage_kv` (KARTA-UI2 §1 p. 12) —
    ta sama logika, teraz w warstwie schematu i publiczna, żeby `StationTemplate
    .to_dict()` mógł jej użyć bez importu z modułu apply (odwrotny kierunek
    zależności — schema jest WEJŚCIEM apply, nie odwrotnie).
    """
    if not isinstance(transformer_ref, str) or not transformer_ref.strip():
        return None, None
    from network_model.catalog import get_default_mv_catalog

    catalog = get_default_mv_catalog()
    item = catalog.get_transformer_type(transformer_ref)
    if item is None:
        return None, None

    def _pole(*nazwy: str) -> float | None:
        for nazwa in nazwy:
            wartosc = getattr(item, nazwa, None)
            if wartosc is None:
                continue
            try:
                parsed = float(wartosc)
            except (TypeError, ValueError):
                continue
            if parsed > 0:
                return parsed
        return None

    return _pole("voltage_hv_kv", "uhv_kv"), _pole("voltage_lv_kv", "ulv_kv")


def catalog_choice_rated_kva(option: Any) -> tuple[int | None, str | None]:
    """Moc pozorna [kVA] zakodowana w typoszeregu `catalog_ref` (np.
    ``tr_sn_nn_630kva_dyn11`` → 630, ``conv_pv_3p15mva_...`` → 3150 przez MVA).
    `(None, ref)` gdy `catalog_ref` nie koduje mocy; `(None, None)` gdy
    `option` nie niesie `catalog_ref` wcale.

    Promowane z `apply.py::_catalog_choice_rating_kva` (KARTA-UI2 §1 p. 12) —
    ten sam token, teraz publiczny w schema.py.
    """
    ref = getattr(option, "catalog_ref", None)
    if not isinstance(ref, str):
        return None, None
    mva_match = re.search(r"-(\d+(?:p\d+)?)mva-", ref.lower())
    if mva_match is not None:
        return int(round(mva_na_kva(float(mva_match.group(1).replace("p", "."))))), ref
    match = re.search(r"-(\d+)kva-", ref.lower())
    if match is None:
        return None, ref
    return int(match.group(1)), ref


def _domyslna_opcja(opcje: tuple[CatalogChoice, ...]) -> CatalogChoice | None:
    """Opcja oznaczona `default=True`, w jej braku pierwsza z listy; `None` dla pustej."""
    for opcja in opcje:
        if opcja.default:
            return opcja
    return opcje[0] if opcje else None


def _domyslna_opcja_transformatora(schema: TemplateSchema) -> CatalogChoice | None:
    """Wybrana domyślnie opcja transformatora szablonu (`default=True`),
    albo pierwsza z listy gdy żadna nie jest oznaczona; `None` gdy szablon
    nie niesie żadnej opcji transformatora (np. czysty punkt DER bez TR
    dedykowanego)."""
    for opcja in schema.transformer_options:
        if opcja.default:
            return opcja
    return schema.transformer_options[0] if schema.transformer_options else None


def moc_z_tokenu_identyfikatora_kva(template_id: str) -> int | None:
    """Moc transformatora [kVA], którą obiecuje TOKEN identyfikatora szablonu: `_630kva`,
    `_2x1000kva` (moc JEDNOSTKOWA przy liczbie transformatorów w szablonie), `_1mva_`
    (MVA → kVA). `None`, gdy identyfikator nie koduje mocy transformatora
    (`_1mw_` to moc źródła, `_0v6mvar_` — moc baterii, nie transformatora).

    Historyczny token `_50kva` wskazuje typoszereg 63 kVA (50 kVA nie istnieje w katalogu)."""
    identyfikator = template_id.lower()
    kva = re.search(r"(?:_|x)(\d+)kva(?:_|$)", identyfikator)
    if kva is not None:
        moc = int(kva.group(1))
        return 63 if moc == 50 else moc
    mva = re.search(r"(?:_|x)(\d+)mva(?:_|$)", identyfikator)
    if mva is not None:
        return int(round(mva_na_kva(float(mva.group(1)))))
    return None


def _opcja_transformatora_wg_tokenu_id(
    transformer_options: tuple[CatalogChoice, ...], template_id: str
) -> CatalogChoice | None:
    """Opcja transformatora o mocy obiecanej tokenem identyfikatora szablonu
    (`moc_z_tokenu_identyfikatora_kva`) — porównanie mocy KATALOGOWEJ opcji
    (`catalog_choice_rated_kva`), nie podłańcucha referencji. `None` gdy identyfikator nie
    koduje mocy albo żadna opcja jej nie ma.

    JEDNO źródło prawdy dla wyświetlania (`structural_fields`) i materializacji
    (`apply.py`) — przed promowaniem (2026-09) obie ścieżki liczyły „domyślną" opcję dwiema
    różnymi regułami. Korekta 2026-10-15: dawny wzorzec `_(\\d+)kva` nie widział tokenów
    `_2x1000kva` (szablon „2×1000 kVA" materializował opcję domyślną 630 kVA), a token
    `_1mva_`/`_2mva_` szukał podłańcucha `-1mva-` w referencjach kodujących moc w kVA
    (szablony „1 MVA" i „2 MVA" dostawały 630 i 1600 kVA)."""
    moc_kva = moc_z_tokenu_identyfikatora_kva(template_id)
    if moc_kva is None:
        return None
    for opcja in transformer_options:
        if catalog_choice_rated_kva(opcja)[0] == moc_kva:
            return opcja
    return None


def _opcje_transformatora_wg_mocy(
    transformer_options: tuple[CatalogChoice, ...],
) -> list[tuple[int, CatalogChoice]]:
    """Opcje z mocą katalogową [kVA], rosnąco (deterministycznie: moc, potem referencja)."""
    return sorted(
        (
            (rating, opcja)
            for opcja in transformer_options
            for rating, ref in [catalog_choice_rated_kva(opcja)]
            if rating is not None and ref is not None
        ),
        key=lambda item: (item[0], item[1].catalog_ref),
    )


def _tabliczka_der(kind: str, catalog_ref: object) -> Mapping[str, Any] | None:
    """Tabliczka pozycji katalogu DER z materializacji toru tworzenia źródła (decyzja
    O-53: selektor i kontrola operacji czytają TĘ SAMĄ tabliczkę); `None` gdy brak refu
    albo pozycja nie ma kompletnej tabliczki."""
    if not isinstance(catalog_ref, str) or not catalog_ref.strip():
        return None
    from enm.domain_operations_v2 import tabliczka_zrodla_przeksztaltnikowego

    return tabliczka_zrodla_przeksztaltnikowego(kind, catalog_ref)


def _der_catalog_for_power(der_spec: Any, p_mw_each: float) -> str | None:
    """Domyślna pozycja katalogowa DER dobrana do mocy JEDNOSTKOWEJ szablonu.

    Decyzja O-53 (predykaty parami): moc jednostki pozycji to P_max,jedn z jej
    tabliczki (`domain.generator_validation.moc_czynna_jednostki_mw`) — ta sama
    wielkość, z którą tor tworzenia porównuje nastawę (`converter.setpoint_above_rating`).
    Dawny odczyt tokenu mocy z nazwy pozycji (`-3mw`) nie widział pozycji nazwanych
    `-0p5mw-`/`-50kw-` — selektor zwracał wtedy pozycję domyślną i operacja odmawiała.
    Kolejność: dokładne dopasowanie mocy, inaczej NAJMNIEJSZA pozycja, która tę moc
    wyda, inaczej największa (nastawa zostanie nazwana odmową przy materializacji);
    brak pozycji z tabliczką ⇒ `None`.

    Promowane z `apply.py` (2026-09, przegląd V12T-016) — współdzielony prymityw dla
    obu ścieżek (wyświetlanie i materializacja)."""
    options = getattr(der_spec, "catalog_options", ()) or ()
    kind = str(getattr(der_spec, "kind", ""))
    parsed: list[tuple[float, str]] = []
    for option in options:
        ref = getattr(option, "catalog_ref", None)
        tabliczka = _tabliczka_der(kind, ref)
        if tabliczka is None or not isinstance(ref, str):
            continue
        moc_jednostki = moc_czynna_jednostki_mw(kind, tabliczka)
        if moc_jednostki is not None:
            parsed.append((moc_jednostki, ref))
    if not parsed:
        return None
    exact = [ref for power, ref in parsed if abs(power - p_mw_each) < 1e-9]
    if exact:
        return exact[0]
    wystarczajace = [item for item in parsed if item[0] >= p_mw_each - 1e-9]
    if wystarczajace:
        return min(wystarczajace, key=lambda item: (item[0], item[1]))[1]
    return max(parsed, key=lambda item: (item[0], item[1]))[1]


def _moc_wymagana_jednostki_der_mva(
    kind: str, catalog_ref: object, p_mw_each: float
) -> float | None:
    """Moc wymagana JEDNEJ jednostki DER szablonu [MVA] — `max(S_n,jedn, |P|/cosφ)`
    z `domain.generator_validation.moc_pozorna_wymagana_mva` na tabliczce pozycji
    (n = 1: szablon tworzy każdą jednostkę osobnym źródłem; cosφ z karty, bo szablon
    nie podaje jawnego; bez współczynnika jednoczesności — dobór na jednoczesną pracę
    wszystkich jednostek). Pozycja bez tabliczki — sam człon nastawy |P|. Ta sama
    reguła, którą tor tworzenia sprawdza z transformatorem (decyzja O-53)."""
    return moc_pozorna_wymagana_mva(
        technologia=kind,
        tabliczka=_tabliczka_der(kind, catalog_ref) or {},
        liczba_jednostek=1,
        moc_czynna_mw=p_mw_each,
        cos_phi=None,
    )


class NieprawidlowyParametrSzablonuError(ValueError):
    """Odmowa przyjęcia parametru szablonu podanego przez projektanta (liczba pól, odpływów,
    transformatorów, obciążenie odpływu, długość odgałęzienia, skład DER) — komunikat po
    polsku. JEDNA klasa odmów dla podglądu (`api/station_templates.py`, HTTP 422) i
    zastosowania (`apply.py`, `TemplateApplyError` PRZED odczytem modelu); `kod` jest
    kodem błędu odpowiedzi. Zastępuje dawne ciche `int(...)`/`float(...)` (obcięcie 2,7 → 2,
    wyjątek 500 dla tekstu, wartość spoza zakresu szablonu bez sygnału)."""

    kod = "template.param_invalid"


class NieprawidlowySkladDerError(NieprawidlowyParametrSzablonuError):
    """Odmowa rozstrzygnięcia składu DER szablonu (kod `template.der_mix_invalid`)."""

    kod = "template.der_mix_invalid"


class NiedoborTransformatoraStacjiError(NieprawidlowyParametrSzablonuError):
    """Żaden transformator stacji dopuszczalny dla szablonu nie pokrywa mocy wymaganej przez
    odbiory i źródła po stronie nN (kod `template.transformer_capacity_insufficient`).

    Bezpiecznik WYŁĄCZNIE dla danych projektanta spoza szablonu (więcej odpływów, większe
    obciążenie, wskazany mniejszy transformator) — żaden szablon z domyślnymi parametrami go
    nie wyzwala (przypięte testem po wszystkich szablonach). Zastępuje dawny cichy wybór
    NAJWIĘKSZEJ opcji, gdy żadna nie wystarczała."""

    kod = "template.transformer_capacity_insufficient"


@dataclass(frozen=True)
class JednostkaDer:
    """Jedna jednostka DER, którą szablon zmaterializuje: technologia (specyfikacja szablonu),
    nastawa mocy czynnej jednostki [MW] i pozycja katalogu. Ten sam rekord czytają podgląd,
    dobór transformatora i materializacja (`apply.py`), więc nie mogą się rozjechać."""

    spec: DerKindSpec
    p_mw_each: float
    catalog_ref: str | None

    @property
    def kind(self) -> str:
        return self.spec.kind


def _first_default_choice(options: tuple[Any, ...] | list[Any]) -> str | None:
    """`catalog_ref` opcji oznaczonej jako domyślna, a bez oznaczenia — pierwszej."""
    if not options:
        return None
    for o in options:
        if getattr(o, "default", False):
            return getattr(o, "catalog_ref", None)
    return getattr(options[0], "catalog_ref", None)


def liczba_calkowita_parametru(
    wartosc: object,
    nazwa_pl: str,
    *,
    klasa_bledu: type[NieprawidlowyParametrSzablonuError] = NieprawidlowyParametrSzablonuError,
) -> int:
    """Liczba całkowita z nadpisania projektanta — bez cichego obcięcia (`int(2.7)` = 2)
    i bez `bool` (w Pythonie `True` jest liczbą 1). Tekst cyfr jest przyjmowany (formularz),
    każdy inny — odmowa `klasa_bledu`."""
    if isinstance(wartosc, bool):
        raise klasa_bledu(f"{nazwa_pl} musi być liczbą całkowitą.")
    if isinstance(wartosc, int):
        return wartosc
    if isinstance(wartosc, float) and math.isfinite(wartosc) and wartosc.is_integer():
        return int(wartosc)
    if isinstance(wartosc, str) and re.fullmatch(r"\s*-?\d+\s*", wartosc):
        return int(wartosc)
    raise klasa_bledu(f"{nazwa_pl} musi być liczbą całkowitą (podano: {wartosc!r}).")


def liczba_rzeczywista_parametru(wartosc: object, nazwa_pl: str, jednostka: str) -> float:
    """Skończona liczba z nadpisania projektanta (tekst liczby przyjmowany, `bool`, NaN,
    nieskończoność i tekst nieliczbowy — odmowa)."""
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float | str):
        raise NieprawidlowyParametrSzablonuError(
            f"{nazwa_pl} musi być liczbą w {jednostka} (podano: {wartosc!r})."
        )
    try:
        liczba = float(wartosc)
    except ValueError as exc:
        raise NieprawidlowyParametrSzablonuError(
            f"{nazwa_pl} musi być liczbą w {jednostka} (podano: {wartosc!r})."
        ) from exc
    if not math.isfinite(liczba):
        raise NieprawidlowyParametrSzablonuError(
            f"{nazwa_pl} musi być skończoną liczbą w {jednostka} (podano: {wartosc!r})."
        )
    return liczba


#: Parametry całkowite szablonu, których projektant może nadpisać — klucz nadpisania =
#: nazwa pola `TemplateSchema` (granice i etykieta z pola szablonu).
PARAMETRY_CALKOWITE_SZABLONU = ("sn_bays_count", "nn_feeders_count", "transformer_count")


def parametr_calkowity_szablonu(
    template: StationTemplate, overrides: Mapping[str, Any] | None, klucz: str
) -> int:
    """Wartość parametru całkowitego szablonu (`sn_bays_count`, `nn_feeders_count`,
    `transformer_count`): nadpisanie projektanta albo domyślna szablonu, sprawdzona co do
    typu i ZAKRESU szablonu (`TemplateParamInt.min_value`–`max_value`). Jedna funkcja dla
    podglądu i zastosowania — dawne `int(...)` w obu miejscach obcinało ułamek po cichu
    i przepuszczało wartości spoza zakresu."""
    granice: TemplateParamInt = getattr(template.schema, klucz)
    nazwa_pl = granice.label_pl or klucz
    surowa = (overrides or {}).get(klucz, granice.default)
    wartosc = liczba_calkowita_parametru(surowa, nazwa_pl)
    if not granice.min_value <= wartosc <= granice.max_value:
        raise NieprawidlowyParametrSzablonuError(
            f"{nazwa_pl} ({wartosc}) jest poza zakresem szablonu "
            f"{granice.min_value}–{granice.max_value}."
        )
    return wartosc


def obciazenie_odplywu_kw(template: StationTemplate, overrides: Mapping[str, Any] | None) -> float:
    """Obciążenie jednego odpływu nN [kW] (`nn_load_default_kw`): nadpisanie albo domyślna,
    skończona i w zakresie szablonu (`TemplateParamFloat`)."""
    granice = template.schema.nn_load_default_kw
    nazwa_pl = granice.label_pl or "Obciążenie odpływu nN"
    surowa = (overrides or {}).get("nn_load_default_kw", granice.default)
    wartosc = liczba_rzeczywista_parametru(surowa, nazwa_pl, "kW")
    if not granice.min_value <= wartosc <= granice.max_value:
        raise NieprawidlowyParametrSzablonuError(
            f"{nazwa_pl} ({wartosc:g} kW) jest poza zakresem szablonu "
            f"{granice.min_value:g}–{granice.max_value:g} kW."
        )
    return wartosc


def _liczba_calkowita_skladu(wartosc: object, nazwa_pl: str) -> int:
    """`liczba_calkowita_parametru` z odmową składu DER (`template.der_mix_invalid`)."""
    return liczba_calkowita_parametru(wartosc, nazwa_pl, klasa_bledu=NieprawidlowySkladDerError)


def _moc_jednostki_skladu(wartosc: object, kind: str) -> float:
    """Nastawa mocy czynnej jednostki [MW] — skończona liczba dodatnia."""
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float | str):
        raise NieprawidlowySkladDerError(
            f"Moc jednostki {kind} musi być liczbą w MW (podano: {wartosc!r})."
        )
    try:
        moc = float(wartosc)
    except ValueError as exc:
        raise NieprawidlowySkladDerError(
            f"Moc jednostki {kind} musi być liczbą w MW (podano: {wartosc!r})."
        ) from exc
    if not math.isfinite(moc) or moc <= 0.0:
        raise NieprawidlowySkladDerError(
            f"Moc jednostki {kind} musi być dodatnia i skończona (podano: {wartosc!r} MW)."
        )
    return moc


def _liczebnosci_der(
    template: StationTemplate, params: Mapping[str, Any]
) -> list[tuple[DerKindSpec, int]]:
    """Liczba jednostek każdej technologii szablonu.

    Szablon jednej technologii: liczba = `der_total_count` (opcjonalne `der_{kind}_count`
    musi się z nią zgadzać). Szablon kilku technologii: liczebności `der_{kind}_count`
    (domyślnie `default_count` specyfikacji) są JEDYNĄ prawdą — suma jest z nich
    wyprowadzona, a podane `der_total_count` musi być jej równe (dawniej suma była dzielona
    naprzemiennie między technologie i hybryda „PV 2 MW + BESS 1 MW” dostawała 3 PV + 2 BESS).
    """
    specs = template.schema.der_options
    granice = template.schema.der_total_count
    podana_suma = params.get("der_total_count")
    if len(specs) == 1:
        spec = specs[0]
        suma = _liczba_calkowita_skladu(
            podana_suma if podana_suma is not None else granice.default,
            "Liczba modułów DER",
        )
        zadeklarowana = params.get(f"der_{spec.kind}_count")
        if (
            zadeklarowana is not None
            and _liczba_calkowita_skladu(zadeklarowana, f"Liczba jednostek {spec.kind}") != suma
        ):
            raise NieprawidlowySkladDerError(
                f"Liczba jednostek {spec.kind} nie zgadza się z łączną liczbą modułów DER ({suma})."
            )
        liczebnosci = [(spec, suma)]
    else:
        liczebnosci = [
            (
                spec,
                _liczba_calkowita_skladu(
                    params.get(f"der_{spec.kind}_count", spec.default_count),
                    f"Liczba jednostek {spec.kind}",
                ),
            )
            for spec in specs
        ]
        suma = sum(liczba for _, liczba in liczebnosci)
        if podana_suma is not None:
            podana = _liczba_calkowita_skladu(podana_suma, "Liczba modułów DER")
            if podana != suma:
                opis = " + ".join(f"{liczba} {spec.kind}" for spec, liczba in liczebnosci)
                raise NieprawidlowySkladDerError(
                    f"Łączna liczba modułów DER ({podana}) nie jest równa sumie liczb jednostek "
                    f"poszczególnych technologii ({opis} = {suma}); określ liczby jawnie."
                )
    for spec, liczba in liczebnosci:
        if liczba < 0:
            raise NieprawidlowySkladDerError(f"Liczba jednostek {spec.kind} nie może być ujemna.")
    if not granice.min_value <= suma <= granice.max_value:
        raise NieprawidlowySkladDerError(
            f"Łączna liczba modułów DER ({suma}) jest poza zakresem szablonu "
            f"{granice.min_value}–{granice.max_value}."
        )
    return liczebnosci


def rozstrzygnij_sklad_der(
    template: StationTemplate,
    overrides: Mapping[str, Any] | None = None,
) -> tuple[JednostkaDer, ...]:
    """JEDNO źródło prawdy o składzie DER szablonu: liczba jednostek każdej technologii,
    nastawa mocy jednostki i pozycja katalogu — dla podglądu (`api/station_templates.py`),
    doboru transformatora stacji (`wymagania_transformatora_stacji`), doboru toru jednostek SN i materializacji (`apply.py`).

    Kolejność jednostek: technologie w kolejności `der_options`, w obrębie technologii
    kolejne jednostki (deterministyczna — od niej zależą identyfikatory tworzonych źródeł).
    Pozycja katalogu: wskazanie projektanta `der_{kind}_ref`, inaczej najmniejsza pozycja
    wydająca nastawę (`_der_catalog_for_power`), inaczej opcja domyślna. Niespójne wejście
    kończy się `NieprawidlowySkladDerError` — nigdy cichą zmianą składu.
    """
    if not template.schema.der_options:
        return ()
    params: Mapping[str, Any] = overrides or {}
    jednostki: list[JednostkaDer] = []
    for spec, liczba in _liczebnosci_der(template, params):
        p_mw_each = _moc_jednostki_skladu(
            params.get(f"der_{spec.kind}_p_mw_each", spec.default_p_mw_each), spec.kind
        )
        wskazana = params.get(f"der_{spec.kind}_ref")
        if wskazana is not None and not (isinstance(wskazana, str) and wskazana.strip()):
            raise NieprawidlowySkladDerError(
                f"Pozycja katalogu {spec.kind} musi być identyfikatorem pozycji "
                f"(podano: {wskazana!r})."
            )
        catalog_ref = (
            wskazana.strip()
            if isinstance(wskazana, str)
            else _der_catalog_for_power(spec, p_mw_each)
            or _first_default_choice(spec.catalog_options)
        )
        jednostki.extend(JednostkaDer(spec, p_mw_each, catalog_ref) for _ in range(liczba))
    return tuple(jednostki)


#: cosφ odbioru nN tworzonego przez szablon, gdy projektant nie poda ani cosφ
#: (`nn_load_cos_phi`), ani mocy biernej (`nn_load_default_kvar`) — ta sama wartość trafia
#: do operacji `add_nn_load` (`apply.py`) i do mocy wymaganej transformatora stacji.
COS_PHI_ODBIORU_NN_SZABLONU = 0.95


@dataclass(frozen=True)
class WymaganiaTransformatoraStacji:
    """Moc, którą musi pokryć transformator stacji szablonu [kVA] — WHITE BOX składników.

    Transformator stacji zasila odbiory nN szablonu i przyjmuje moc źródeł przyłączonych po
    stronie nN (`connection_variant` „nn_side"). Źródła przyłączone po stronie SN mają
    WŁASNE transformatory blokowe (`dobor_toru_jednostki_der_sn`) — moc nie płynie przez
    transformator stacji, więc nie wchodzi do tej sumy."""

    moc_odbiorow_kva: float
    liczba_odbiorow: int
    moc_zrodel_nn_kva: float
    liczba_zrodel_nn: int

    @property
    def wymagana_kva(self) -> float:
        """Odbiory i źródła nN nie pracują przeciwko sobie w doborze: transformator musi
        przenieść większą z dwóch mocy (pobór przy braku generacji, oddanie przy braku
        poboru)."""
        return max(self.moc_odbiorow_kva, self.moc_zrodel_nn_kva)


def _moc_odbioru_nn_mva(overrides: Mapping[str, Any], moc_czynna_kw: float) -> float:
    """Moc pozorna jednego odbioru nN szablonu [MVA] — ta sama dana, którą dostaje
    `add_nn_load`: jawna moc bierna ma pierwszeństwo przed cosφ (reguła operacji)."""
    moc_czynna_mw = kw_na_mw(moc_czynna_kw)
    kvar = overrides.get("nn_load_default_kvar")
    if kvar is not None:
        moc_bierna_mvar = kw_na_mw(
            liczba_rzeczywista_parametru(kvar, "Moc bierna odbioru nN", "kvar")
        )
        return moc_pozorna_z_czynnej_i_biernej_mva(moc_czynna_mw, moc_bierna_mvar)
    cos_phi = liczba_rzeczywista_parametru(
        overrides.get("nn_load_cos_phi", COS_PHI_ODBIORU_NN_SZABLONU), "cosφ odbioru nN", "p.u."
    )
    if not 0.0 < cos_phi <= 1.0:
        raise NieprawidlowyParametrSzablonuError(
            f"cosφ odbioru nN musi należeć do przedziału (0; 1] (podano: {cos_phi:g})."
        )
    return moc_pozorna_z_nastawy_mva(moc_czynna_mw, cos_phi)


def wymagania_transformatora_stacji(
    template: StationTemplate, overrides: Mapping[str, Any] | None = None
) -> WymaganiaTransformatoraStacji:
    """Moc wymagana transformatora stacji z odbiorów nN (liczba odpływów × obciążenie
    odpływu, każdy odpływ dostaje jeden odbiór — `apply.py`) i źródeł nN (reguła O-53
    `max(S_n,jedn, |P|/cosφ)` po jednostkach `rozstrzygnij_sklad_der`, n = 1)."""
    params: Mapping[str, Any] = overrides or {}
    liczba_odplywow = parametr_calkowity_szablonu(template, params, "nn_feeders_count")
    obciazenie_kw = obciazenie_odplywu_kw(template, params)
    liczba_odbiorow = liczba_odplywow if obciazenie_kw > 0 else 0
    moc_odbiorow_mva = (
        liczba_odbiorow * _moc_odbioru_nn_mva(params, obciazenie_kw) if liczba_odbiorow else 0.0
    )
    moc_zrodel_mva = 0.0
    liczba_zrodel = 0
    for jednostka in rozstrzygnij_sklad_der(template, params):
        if jednostka.spec.connection_variant_options[0] != "nn_side":
            continue
        liczba_zrodel += 1
        moc_zrodel_mva += (
            _moc_wymagana_jednostki_der_mva(
                jednostka.kind, jednostka.catalog_ref, jednostka.p_mw_each
            )
            or 0.0
        )
    return WymaganiaTransformatoraStacji(
        moc_odbiorow_kva=mva_na_kva(moc_odbiorow_mva),
        liczba_odbiorow=liczba_odbiorow,
        moc_zrodel_nn_kva=mva_na_kva(moc_zrodel_mva),
        liczba_zrodel_nn=liczba_zrodel,
    )


def _opis_wymagan(wymagania: WymaganiaTransformatoraStacji) -> str:
    return (
        f"odbiory nN {wymagania.moc_odbiorow_kva:.0f} kVA ({wymagania.liczba_odbiorow} odpływów), "
        f"źródła po stronie nN {wymagania.moc_zrodel_nn_kva:.0f} kVA "
        f"({wymagania.liczba_zrodel_nn} jednostek)"
    )


def sprawdz_transformator_stacji(
    template: StationTemplate,
    catalog_ref: str,
    *,
    liczba_transformatorow: int,
    wymagania: WymaganiaTransformatoraStacji,
) -> None:
    """Odmowa `NiedoborTransformatoraStacjiError`, gdy wskazany transformator (× liczba
    transformatorów szablonu) nie pokrywa mocy wymaganej. Pozycja bez mocy w katalogu —
    odmowa (brak danej ≠ wystarcza)."""
    moc_kva = _moc_katalogowa_transformatora_kva(catalog_ref)
    if moc_kva is None:
        raise NiedoborTransformatoraStacjiError(
            f"Szablon „{template.name_pl}”: transformator {catalog_ref} nie ma mocy "
            "znamionowej w katalogu — nie da się sprawdzić, czy pokrywa odbiory i źródła nN."
        )
    if moc_kva * liczba_transformatorow + 1e-6 < wymagania.wymagana_kva:
        raise NiedoborTransformatoraStacjiError(
            f"Szablon „{template.name_pl}”: transformator {catalog_ref} "
            f"({liczba_transformatorow} × {moc_kva:.0f} kVA) nie pokrywa mocy wymaganej "
            f"{wymagania.wymagana_kva:.0f} kVA ({_opis_wymagan(wymagania)}). Wskaż większy "
            "transformator z katalogu albo zmniejsz obciążenie."
        )


def _moc_katalogowa_transformatora_kva(catalog_ref: str) -> float | None:
    """Moc znamionowa [kVA] z REKORDU katalogu (nie z tokenu referencji)."""
    from network_model.catalog import get_default_mv_catalog

    item = get_default_mv_catalog().get_transformer_type(catalog_ref)
    moc_mva = getattr(item, "rated_power_mva", None) if item is not None else None
    if not isinstance(moc_mva, int | float) or moc_mva <= 0:
        return None
    return mva_na_kva(float(moc_mva))


def rozstrzygnij_transformator_stacji(
    template: StationTemplate, overrides: Mapping[str, Any] | None = None
) -> CatalogChoice | None:
    """Opcja transformatora stacji, którą szablon zmaterializuje bez wskazania projektanta —
    JEDNO źródło dla wyświetlania (`structural_fields`, `sn_voltage_kv`), podglądu
    i zastosowania (`apply.py::_resolve_transformer_ref_for_template` po sprawdzeniu
    wskazania jawnego i profilu producenta).

    Kolejność: (1) moc obiecana tokenem identyfikatora (`_630kva`, `_2x1000kva`, `_1mva_`)
    — tożsamość szablonu; (2) opcja domyślna szablonu, jeśli pokrywa moc wymaganą;
    (3) najmniejsza opcja, która ją pokrywa. Moc opcji liczona × `transformer_count`.
    Gdy wybrana opcja nie pokrywa mocy wymaganej (dane projektanta spoza szablonu) —
    `NiedoborTransformatoraStacjiError`, nigdy cichy wybór największej opcji.
    `None` — szablon bez transformatora."""
    opcje = template.schema.transformer_options
    if not opcje:
        return None
    params: Mapping[str, Any] = overrides or {}
    liczba = parametr_calkowity_szablonu(template, params, "transformer_count")
    wymagania = wymagania_transformatora_stacji(template, params)
    wg_tokenu = _opcja_transformatora_wg_tokenu_id(opcje, template.id)
    if wg_tokenu is not None:
        sprawdz_transformator_stacji(
            template, wg_tokenu.catalog_ref, liczba_transformatorow=liczba, wymagania=wymagania
        )
        return wg_tokenu
    domyslna = _domyslna_opcja_transformatora(template.schema)
    wg_mocy = _opcje_transformatora_wg_mocy(opcje)
    kandydaci = ([domyslna] if domyslna is not None else []) + [opcja for _, opcja in wg_mocy]
    for opcja in kandydaci:
        moc_kva = _moc_katalogowa_transformatora_kva(opcja.catalog_ref)
        if moc_kva is not None and moc_kva * liczba + 1e-6 >= wymagania.wymagana_kva:
            return opcja
    najwieksza = wg_mocy[-1][1] if wg_mocy else opcje[0]
    sprawdz_transformator_stacji(
        template, najwieksza.catalog_ref, liczba_transformatorow=liczba, wymagania=wymagania
    )
    return najwieksza


def resolve_template_default_transformer_choice(template: StationTemplate) -> CatalogChoice | None:
    """Opcja transformatora szablonu bez nadpisań projektanta (`rozstrzygnij_transformator_
    stacji` z pustymi nadpisaniami). `None` gdy szablon nie niesie `transformer_options`."""
    return rozstrzygnij_transformator_stacji(template)


#: Wariant przyłączenia jednostki DER szablonu przez WŁASNY transformator blokowy nN/SN
#: (tor DER-SN: szyna nN producenta → TR blokowy → kabel SN → pole źródłowe SN stacji).
WARIANT_TORU_DER_SN = "block_transformer"


class OdmowaDoboruToruDerSnError(NieprawidlowyParametrSzablonuError):
    """Kaskada doboru toru jednostki DER-SN nie znalazła elementu w katalogu (kod kroku
    silnika doboru, np. `converter.der_sn.dobor_tr_brak_kandydata`) albo pozycja jednostki
    nie niesie napięcia. Bezpiecznik dla danych projektanta — żadna opcja żadnego szablonu
    go nie wyzwala (przypięte testem po wszystkich szablonach i opcjach katalogu)."""

    def __init__(self, kod: str, komunikat_pl: str) -> None:
        super().__init__(komunikat_pl)
        self.kod = kod


@dataclass(frozen=True)
class TorJednostkiDerSn:
    """Elementy toru jednej jednostki DER-SN z kaskady doboru
    (`application.analyses.dobor_toru_der_sn.dobierz_tor_der_sn`) — te same refy pokazuje
    podgląd i materializuje `apply.py` (operacja `add_converter_source` z `der_topology`)."""

    napiecie_falownika_kv: float
    moc_wymagana_mva: float
    transformator_ref: str
    transformator_nazwa: str
    transformator_sn_mva: float
    kabel_ref: str
    aparat_ref: str
    rodzaj_aparatu: str
    dlugosc_kabla_km: float

    @property
    def lacznik_pola(self) -> str:
        """Łącznik pola źródłowego SN dla operacji domenowej (`switching_device`)."""
        return "LBS" if self.rodzaj_aparatu == "LOAD_SWITCH" else "CB"


def _odmowa_kroku_doboru(
    jednostka: JednostkaDer, kod: str | None, komunikat: str | None
) -> OdmowaDoboruToruDerSnError:
    """Odmowa kroku kaskady doboru z KODEM silnika (`converter.der_sn.dobor_*`). Kontrakt
    silnika: brak propozycji ⇔ kod i komunikat — ich brak to zerwany kontrakt (błąd
    programu), a nie miejsce na zapasowy kod spoza rejestru."""
    if kod is None or komunikat is None:
        raise RuntimeError("Krok doboru toru DER-SN bez propozycji nie niesie kodu odmowy.")
    return OdmowaDoboruToruDerSnError(
        kod, f"Jednostka {jednostka.kind} {jednostka.p_mw_each:g} MW: {komunikat}"
    )


def dobor_toru_jednostki_der_sn(
    jednostka: JednostkaDer, napiecie_sn_kv: float
) -> TorJednostkiDerSn:
    """Dobór toru jednostki przyłączonej po stronie SN: moc wymagana z reguły O-53 na
    tabliczce pozycji (n = 1), napięcie falownika z tabliczki, kaskada TR blokowy → kabel
    SN → aparat pola z katalogu (tolerancje napięć D1). Brak kandydata na którymkolwiek
    kroku — `OdmowaDoboruToruDerSnError` z kodem kroku, nigdy domysł."""
    from application.analyses.dobor_toru_der_sn import dobierz_tor_der_sn
    from domain.generator_validation import JawneWejsciaKontroliMocy
    from enm.domain_operations_v2 import DLUGOSC_KABLA_PRZYLACZENIOWEGO_DER_SN_KM

    tabliczka = _tabliczka_der(jednostka.kind, jednostka.catalog_ref) or {}
    napiecie_falownika = tabliczka.get("un_kv")
    if not isinstance(napiecie_falownika, int | float) or napiecie_falownika <= 0:
        raise OdmowaDoboruToruDerSnError(
            "converter.un_kv_missing",
            f"Pozycja {jednostka.catalog_ref} ({jednostka.kind}) nie niesie napięcia "
            "znamionowego — nie da się dobrać transformatora blokowego.",
        )
    moc_mva = _moc_wymagana_jednostki_der_mva(
        jednostka.kind, jednostka.catalog_ref, jednostka.p_mw_each
    )
    if moc_mva is None or moc_mva <= 0:
        raise OdmowaDoboruToruDerSnError(
            "generator.power_missing",
            f"Jednostka {jednostka.kind} ({jednostka.catalog_ref}) nie ma mocy wymaganej.",
        )
    wynik = dobierz_tor_der_sn(
        moc_pozorna_mva=moc_mva,
        napiecie_sn_kv=napiecie_sn_kv,
        napiecie_falownika_kv=float(napiecie_falownika),
        dlugosc_kabla_km=DLUGOSC_KABLA_PRZYLACZENIOWEGO_DER_SN_KM,
        nosnik_cos_phi=JawneWejsciaKontroliMocy(),
    )
    tr = wynik.transformator
    if tr.proposal is None:
        raise _odmowa_kroku_doboru(jednostka, tr.error_code, tr.error_pl)
    kabel, aparat = wynik.kabel, wynik.aparat_pola
    if kabel is None or aparat is None:
        # Kontrakt `dobierz_tor_der_sn`: przy propozycji transformatora kaskada kabla i pola
        # zawsze się wykonuje — brak wyniku kroku to zerwany kontrakt, nie odmowa danych.
        raise RuntimeError("Kaskada doboru toru DER-SN nie zwróciła kroku kabla lub pola SN.")
    if kabel.proposal is None:
        raise _odmowa_kroku_doboru(jednostka, kabel.error_code, kabel.error_pl)
    if aparat.proposal is None:
        raise _odmowa_kroku_doboru(jednostka, aparat.error_code, aparat.error_pl)
    return TorJednostkiDerSn(
        napiecie_falownika_kv=float(napiecie_falownika),
        moc_wymagana_mva=moc_mva,
        transformator_ref=tr.proposal.catalog_ref,
        transformator_nazwa=tr.proposal.name,
        transformator_sn_mva=tr.proposal.sn_mva,
        kabel_ref=kabel.proposal.catalog_ref,
        aparat_ref=aparat.proposal.catalog_ref,
        rodzaj_aparatu=aparat.proposal.equipment_kind,
        dlugosc_kabla_km=DLUGOSC_KABLA_PRZYLACZENIOWEGO_DER_SN_KM,
    )


def dobor_torow_der_sn(
    sklad: tuple[JednostkaDer, ...], napiecie_sn_kv: float
) -> tuple[TorJednostkiDerSn | None, ...]:
    """Tor każdej jednostki składu (pozycyjnie): dobór dla jednostek wariantu SN
    (`WARIANT_TORU_DER_SN`), `None` dla jednostek po stronie nN. Jednostki identyczne
    (technologia, pozycja, nastawa) dzielą jeden wynik doboru (deterministyczny)."""
    pamiec: dict[tuple[str, str | None, float], TorJednostkiDerSn] = {}
    tory: list[TorJednostkiDerSn | None] = []
    for jednostka in sklad:
        if jednostka.spec.connection_variant_options[0] != WARIANT_TORU_DER_SN:
            tory.append(None)
            continue
        klucz = (jednostka.kind, jednostka.catalog_ref, jednostka.p_mw_each)
        if klucz not in pamiec:
            pamiec[klucz] = dobor_toru_jednostki_der_sn(jednostka, napiecie_sn_kv)
        tory.append(pamiec[klucz])
    return tuple(tory)


def resolve_template_default_shunt_choice(template: StationTemplate) -> CatalogChoice | None:
    """Opcja baterii kondensatorów, którą `apply()` zmaterializuje dla TEGO
    szablonu bez nadpisania projektanta (`overrides["shunt_capacitor_ref"]`):
    oznaczona `default=True`, w jej braku pierwsza z listy. `None` gdy szablon
    nie niesie `shunt_capacitor_options` wcale.

    JEDNO źródło reguły dla wyświetlania (`structural_fields`) i materializacji
    (`apply.py` krok 6) — bez tego strona wyświetlająca mogłaby zapowiadać inną
    baterię niż ta, którą apply faktycznie wstawi (reguła KLASA NIE INSTANCJA
    pkt 3: predykat wejścia i wyjścia z jednego źródła prawdy).
    """
    for opcja in template.schema.shunt_capacitor_options:
        if opcja.default:
            return opcja
    return (
        template.schema.shunt_capacitor_options[0]
        if template.schema.shunt_capacitor_options
        else None
    )


def shunt_capacitor_rated_kv(shunt_ref: str | None) -> float | None:
    """Napięcie znamionowe baterii kondensatorów [kV] z REALNEGO rekordu
    katalogu (`KOMPENSATOR_SN`), nie z tokenu w `catalog_ref` ani z etykiety.
    `None` gdy brak referencji/rekordu/katalogu — uczciwy brak, nie domyślona
    liczba.

    To ta sama wielkość, którą przy materializacji porównuje z napięciem szyny
    `enm/domain_operations_v2.py` (odmowa `shunt.voltage_mismatch`): strona
    wyświetlająca i strona wykonująca czytają JEDNO pole katalogu.
    """
    if not isinstance(shunt_ref, str) or not shunt_ref.strip():
        return None
    from network_model.catalog import get_default_mv_catalog

    item = get_default_mv_catalog().get_shunt_capacitor_type(shunt_ref)
    if item is None:
        return None
    rated_kv = getattr(item, "rated_kv", None)
    if not isinstance(rated_kv, int | float) or float(rated_kv) <= 0.0:
        return None
    return float(rated_kv)


def grid_source_voltage_kv(source_ref: str | None) -> float | None:
    """Napięcie znamionowe [kV] równoważnika systemowego GPZ (`ZRODLO_SN`) — z REALNEGO
    rekordu katalogu (`SourceSystemType.voltage_rating_kv`), tej samej liczby, którą
    materializuje `add_grid_source_sn`. `None` przy braku referencji/rekordu."""
    if not isinstance(source_ref, str) or not source_ref.strip():
        return None
    from network_model.catalog import get_default_mv_catalog

    item = get_default_mv_catalog().get_source_system_type(source_ref)
    if item is None:
        return None
    napiecie = getattr(item, "voltage_rating_kv", None)
    if not isinstance(napiecie, int | float) or float(napiecie) <= 0.0:
        return None
    return float(napiecie)


def sn_voltage_kv(template: StationTemplate) -> float | None:
    """Napięcie SN [kV], na którym szablon pracuje — wyprowadzone z jego własnej
    zawartości, nie z nazwy ani z kategorii:

    1. szablon GPZ (niesie `grid_source_options`, droga `add_grid_source_sn`)
       TWORZY szynę SN — jego napięciem SN jest napięcie znamionowe domyślnego
       równoważnika sieci na szynach SN (`grid_source_voltage_kv`; transformatory
       110/SN są poza modelem — granica zasilania SN, karta GPZ-MODEL), a szablon
       GPZ H5 (`gpz_uklad == GPZ_UKLAD_H5`) — napięcie strony DOLNEJ domyślnego
       transformatora 110/SN;
    2. szablon wpinany w segment magistrali (`insert_station_on_segment_sn`)
       WYMAGA szyny o napięciu strony GÓRNEJ swojego transformatora SN/nN;
    3. szablon bez transformatora, za to z baterią kondensatorów (kompensacja)
       wymaga napięcia znamionowego rekordu `KOMPENSATOR_SN`;
    4. `None` = szablon napięciowo obojętny (ani transformatora, ani baterii —
       rozdzielnia sieciowa, rezerwa zasilania): wchodzi na szynę SN o dowolnym
       napięciu, bo nie wnosi żadnego elementu wiążącego napięcie.

    POWÓD (pomiar 2026-09-17, czerwony `industrial-template-mass-flow` na CI):
    przed tym polem kontrakt szablonu niósł napięcie WYŁĄCZNIE jako dane
    transformatora (`voltage_hv_kv`), więc szablon kompensacji 20 kV wyglądał w
    przeglądarce na pasujący do sieci 15 kV, a backend odrzucał go — słusznie —
    dopiero przy zastosowaniu (`shunt.voltage_mismatch`). Pole zamyka lukę:
    wymaganie napięciowe jest częścią oferty, a nie niespodzianką po kliknięciu.
    Pomiar rozkładu na 73 szablonach (2026-09-17): 15 kV — 64, 20 kV — 3
    (GPZ 20 kV — od karty GPZ-MODEL `tpl_gpz_sn_20_2s_4p`, napięcie z domyślnego
    równoważnika sieci szablonu —, `tpl_kompensacja_1v8mvar_20kv`,
    `tpl_abonencka_630kva_pomiar_20kv`), napięciowo obojętne — 6 (3 rozdzielnie
    sieciowe + 3 warianty rezerwy zasilania). Pomiar 2026-10-15 po wycofaniu 2 szablonów
    wiatrowych 15 kV: 71 szablonów, 15 kV — 62. Pomiar 2026-10-22 (karta GPZ-H5-BACKEND, dwa
    wzorce GPZ ENEA H5): 73 szablony, 15 kV — 63, 20 kV — 4, obojętne — 6 (pin:
    `test_napiecie_sn_szablonu`).
    """
    if template.schema.gpz_uklad == GPZ_UKLAD_H5:
        # GPZ H5 TWORZY szyny SN po stronie DOLNEJ swoich transformatorów 110/SN.
        transformator_h5 = resolve_template_default_transformer_choice(template)
        if transformator_h5 is None:
            return None
        return transformer_voltages_kv(transformator_h5.catalog_ref)[1]
    if template.schema.grid_source_options:
        zrodlo = _domyslna_opcja(template.schema.grid_source_options)
        return grid_source_voltage_kv(zrodlo.catalog_ref if zrodlo is not None else None)
    transformator = resolve_template_default_transformer_choice(template)
    if transformator is not None:
        napiecie_gn_kv, _napiecie_dn_kv = transformer_voltages_kv(transformator.catalog_ref)
        if napiecie_gn_kv is not None:
            return napiecie_gn_kv
    bateria = resolve_template_default_shunt_choice(template)
    if bateria is not None:
        return shunt_capacitor_rated_kv(bateria.catalog_ref)
    return None


KATEGORIE_KORZENIA_MODELU: frozenset[TemplateCategory] = frozenset({TemplateCategory.GPZ_110_SN})
"""Kategorie szablonów, które SĄ korzeniem modelu (źródło zasilania sieci), a nie
stacja wstawiana w istniejący odcinek magistrali."""


def kategoria_wchodzi_w_segment(category: TemplateCategory) -> bool:
    """Ta sama regula na poziomie KATEGORII — dla kroku „wybierz kategorie" w
    kreatorze wciecia (kontrakt `GET /api/station-templates/categories`)."""
    return category not in KATEGORIE_KORZENIA_MODELU


def template_wchodzi_w_segment(template: StationTemplate) -> bool:
    """Czy szablon wstawia sie w ISTNIEJACY odcinek magistrali SN (`target_segment_id`),
    czy jest korzeniem modelu budowanym bez odcinka.

    JEDNO zrodlo prawdy dla trzech konsumentow (regula KLASA NIE INSTANCJA pkt 3,
    predykaty parami z jednego zrodla): (1) `apply.py` — wymaganie odcinka i odmowa
    dla korzenia ze wskazanym odcinkiem oraz wybor drogi budowy; (2) kontrakt listy
    i szczegolu (`structural_fields` -> pole `wchodzi_w_segment`), z ktorego kreator
    wciecia i planer masowy filtruja oferte; (3) niezmienniki e2e.

    POWOD (pomiar 2026-09-17): reguła zyla w trzech miejscach jako niezalezne
    porownania z `TemplateCategory.GPZ_110_SN` — dwa w backendzie i lista kategorii
    zaszyta w kodzie frontu. Zgadzaly sie dzis, ale kazda nowa kategoria korzenia
    (np. stacja zasilajaca innego napiecia) rozjechalaby je po cichu: UI nadal
    oferowalby szablon, ktory backend odrzuci.
    """
    return kategoria_wchodzi_w_segment(template.category)


def structural_fields(template: StationTemplate) -> dict[str, Any]:
    """Pola strukturalne (moc/napięcie/zastosowanie/kategorie ról) wspólne dla
    `StationTemplate.to_dict()` (pełny szczegół) i podsumowania listy
    (`api/station_templates.py::_to_summary`) — JEDNO źródło obliczenia,
    żeby lista i szczegół nigdy nie rozjechały się dla tego samego szablonu
    (reguła KLASA NIE INSTANCJA pkt 3: predykaty z jednego źródła prawdy).
    Zob. `StationTemplate.to_dict` po znaczenie `None`/`[]`.
    """
    domyslny_tr = resolve_template_default_transformer_choice(template)
    moc_kva, _ = catalog_choice_rated_kva(domyslny_tr) if domyslny_tr is not None else (None, None)
    napiecie_gn_kv, napiecie_dn_kv = (
        transformer_voltages_kv(domyslny_tr.catalog_ref)
        if domyslny_tr is not None
        else (None, None)
    )
    return {
        "category_label_pl": TEMPLATE_CATEGORY_LABELS_PL.get(
            template.category, template.category.value
        ),
        "rated_power_kva": moc_kva,
        "voltage_hv_kv": napiecie_gn_kv,
        "voltage_lv_kv": napiecie_dn_kv,
        "bay_role_categories": sorted({rola.role for rola in template.schema.sn_bay_roles}),
        "sn_voltage_kv": sn_voltage_kv(template),
        "wchodzi_w_segment": template_wchodzi_w_segment(template),
    }


@dataclass(frozen=True)
class StationTemplate:
    """Single station template definition."""

    id: str  # 'tpl_sn_nn_630kva'
    name_pl: str  # "Stacja SN/nN 630 kVA z RMU 3-pole"
    category: TemplateCategory
    description_pl: str
    use_case_pl: str  # "Standardowa dystrybucyjna w terenie wiejskim"
    nc_rfg_type: str | None  # 'A' | 'B' | 'C' | 'D' | None
    schema: TemplateSchema
    tags: tuple[str, ...] = ()  # Searchable tags
    icon: str = "station-default"  # Frontend icon hint

    def to_dict(self) -> dict:
        """Serialize to JSON dict dla API.

        KARTA-UI2 §1 p. 12 (zamknięcie): `rated_power_kva`/`voltage_hv_kv`/
        `voltage_lv_kv`/`bay_role_categories`/`category_label_pl` są polami
        STRUKTURALNYMI (moc/napięcie/zastosowanie/kategorie ról) dodanymi na
        żądanie karty — źródłem jest KATALOG (`transformer_voltages_kv`) i
        token identyfikatora (`catalog_choice_rated_kva`), NIGDY parsowanie
        `name_pl`. `None`/`[]` = dana niedostarczona (katalog niedostępny w
        środowisku, szablon bez dedykowanego transformatora) — front pokazuje
        uczciwy brak, nie fabrykuje liczby.
        """
        return {
            "id": self.id,
            "name_pl": self.name_pl,
            "category": self.category.value,
            "description_pl": self.description_pl,
            "use_case_pl": self.use_case_pl,
            "nc_rfg_type": self.nc_rfg_type,
            "schema": _schema_to_dict(self.schema),
            "tags": list(self.tags),
            "icon": self.icon,
            **structural_fields(self),
        }


def _schema_to_dict(schema: TemplateSchema) -> dict:
    """Convert dataclass to plain dict dla JSON serialization."""
    return {
        "transformer_options": [_choice_to_dict(c) for c in schema.transformer_options],
        "transformer_count": _param_int_to_dict(schema.transformer_count),
        "sn_switchgear_manufacturers": list(schema.sn_switchgear_manufacturers),
        "sn_switchgear_default": schema.sn_switchgear_default,
        "sn_bays_count": _param_int_to_dict(schema.sn_bays_count),
        "sn_bay_roles": [_bay_role_to_dict(r) for r in schema.sn_bay_roles],
        "sn_bay_protection_options": [
            _protection_to_dict(p) for p in schema.sn_bay_protection_options
        ],
        "sn_bay_apparatus_options": [_choice_to_dict(c) for c in schema.sn_bay_apparatus_options],
        "nn_feeders_count": _param_int_to_dict(schema.nn_feeders_count),
        "nn_feeder_cb_options": [_choice_to_dict(c) for c in schema.nn_feeder_cb_options],
        "nn_load_default_kw": _param_float_to_dict(schema.nn_load_default_kw),
        "der_options": [_der_spec_to_dict(d) for d in schema.der_options],
        "der_total_count": _param_int_to_dict(schema.der_total_count),
        "protection_settings_default": schema.protection_settings_default,
        "ct_options": [_choice_to_dict(c) for c in schema.ct_options],
        "vt_options": [_choice_to_dict(c) for c in schema.vt_options],
        "energy_meter_options": [_choice_to_dict(c) for c in schema.energy_meter_options],
        "manufacturer_profile_default": schema.manufacturer_profile_default,
        "shunt_capacitor_options": [_choice_to_dict(c) for c in schema.shunt_capacitor_options],
        "grid_source_options": [_choice_to_dict(c) for c in schema.grid_source_options],
        "gpz_uklad": schema.gpz_uklad,
        "dane_projektu": [_dana_projektu_to_dict(d) for d in schema.dane_projektu],
    }


def _dana_projektu_to_dict(d: DanaProjektuSzablonu) -> dict:
    return {
        "klucz": d.klucz,
        "operacja": d.operacja,
        "label_pl": d.label_pl,
        "podpowiedz_pl": d.podpowiedz_pl,
        "podstawa_pl": d.podstawa_pl,
        "wartosci": [{"wartosc": w, "label_pl": n} for w, n in d.wartosci],
        "warunek_pl": d.warunek_pl,
    }


def _choice_to_dict(c: CatalogChoice) -> dict:
    return {
        "catalog_ref": c.catalog_ref,
        "label_pl": c.label_pl,
        "namespace": c.namespace,
        "default": c.default,
        "badge_pl": c.badge_pl,
    }


def _param_int_to_dict(p: TemplateParamInt) -> dict:
    return {
        "default": p.default,
        "min_value": p.min_value,
        "max_value": p.max_value,
        "step": p.step,
        "label_pl": p.label_pl,
    }


def _param_float_to_dict(p: TemplateParamFloat) -> dict:
    return {
        "default": p.default,
        "min_value": p.min_value,
        "max_value": p.max_value,
        "step": p.step,
        "unit": p.unit,
        "label_pl": p.label_pl,
    }


def _bay_role_to_dict(r: BayRoleSpec) -> dict:
    return {
        "role": r.role,
        "label_pl": r.label_pl,
        "apparatus_options": [_choice_to_dict(c) for c in r.apparatus_options],
    }


def _protection_to_dict(p: ProtectionRelaySpec) -> dict:
    return {
        "device_catalog_ref": p.device_catalog_ref,
        "label_pl": p.label_pl,
        "vendor": p.vendor,
        "settings_template_id": p.settings_template_id,
        "badge_pl": p.badge_pl,
    }


def _der_spec_to_dict(d: DerKindSpec) -> dict:
    return {
        "kind": d.kind,
        "label_pl": d.label_pl,
        "catalog_options": [_choice_to_dict(c) for c in d.catalog_options],
        "default_count": d.default_count,
        "default_p_mw_each": d.default_p_mw_each,
        # Pozycja katalogu, którą zastosowanie szablonu wybierze BEZ wskazania projektanta
        # (dobór do mocy jednostki — ta sama reguła co `rozstrzygnij_sklad_der`). Kreator
        # pokazuje ją jako bieżący wybór; dawniej pokazywał pierwszą opcję listy (np. BESS
        # 0,5 MW), a model dostawał jednostkę 1 MW.
        "default_catalog_ref": _der_catalog_for_power(d, d.default_p_mw_each)
        or _first_default_choice(d.catalog_options),
        "connection_variant_options": list(d.connection_variant_options),
    }
