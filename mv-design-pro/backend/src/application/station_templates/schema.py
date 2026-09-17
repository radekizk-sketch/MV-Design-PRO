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

import re
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from network_model.pochodne import mva_na_kva, mw_na_kw


class TemplateCategory(StrEnum):
    """15 kategorii templates per use-case (V12T-016: +5 rola A/C/E)."""

    TYPOWA_SN_NN = "typowa_sn_nn"  # Dystrybucyjne 100-2500 kVA
    SLUPOWA = "slupowa"  # Stacje słupowe ZSP
    ZKSN_WNETRZOWA = "zksn_wnetrzowa"  # ZKSN wnętrzowe
    PROSUMENT_PV = "prosument_pv"  # μPV 5-250 kW
    FARMA_PV = "farma_pv"  # Farmy PV SN 0.5-5 MW
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
    """Bay role definition (IN/OUT/TR/MEASUREMENT/COUPLER)."""

    role: str  # 'IN' | 'OUT' | 'TR' | 'MEASUREMENT' | 'COUPLER'
    label_pl: str
    apparatus_options: tuple[CatalogChoice, ...] = ()  # CB/DS/LS choices


@dataclass(frozen=True)
class DerKindSpec:
    """DER inverter kind option."""

    kind: str  # 'PV' | 'BESS' | 'FW'
    label_pl: str
    catalog_options: tuple[CatalogChoice, ...]
    default_count: int = 1
    default_p_mw_each: float = 0.5
    connection_variant_options: tuple[str, ...] = ("nn_side", "block_transformer")


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
    nn_load_default_kw: TemplateParamFloat = field(
        default_factory=lambda: TemplateParamFloat(
            default=50.0,
            min_value=0.0,
            max_value=2000.0,
            unit="kW",
            label_pl="Obciążenie per odpływ",
        )
    )

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
    try:
        from network_model.catalog import get_default_mv_catalog
    except ImportError:
        return None, None
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


def _domyslna_opcja_transformatora(schema: TemplateSchema) -> CatalogChoice | None:
    """Wybrana domyślnie opcja transformatora szablonu (`default=True`),
    albo pierwsza z listy gdy żadna nie jest oznaczona; `None` gdy szablon
    nie niesie żadnej opcji transformatora (np. czysty punkt DER bez TR
    dedykowanego)."""
    for opcja in schema.transformer_options:
        if opcja.default:
            return opcja
    return schema.transformer_options[0] if schema.transformer_options else None


def _opcja_transformatora_wg_tokenu_id(
    transformer_options: tuple[CatalogChoice, ...], template_id: str
) -> CatalogChoice | None:
    """Opcja transformatora, której moc [kVA] koduje TOKEN identyfikatora
    szablonu (np. `tpl_sn_nn_630kva` → `-630kva-`). `None` gdy identyfikator
    nie koduje mocy albo żadna opcja nie niesie pasującego tokenu.

    JEDNO źródło prawdy dla `resolve_template_default_transformer_choice`
    (wyświetlanie — `structural_fields`) i `apply.py::
    _resolve_transformer_ref_for_template` (materializacja) — promowane stąd
    z apply.py (2026-09, przegląd V12T-016): PRZED tą kartą obie ścieżki
    liczyły niezależnie „domyślną" opcję dwiema RÓŻNYMI regułami
    (`_domyslna_opcja_transformatora` — flaga `default=True`/pierwsza, kontra
    token ID) — dla 34 z 73 szablonów (zmierzone) dawały RÓŻNE wyniki, więc
    kafel przeglądarki pokazywał moc, której `apply()` wcale by nie
    zmaterializował (KLASA NIE INSTANCJA pkt 3: predykaty parami z jednego
    źródła prawdy)."""
    identyfikator = template_id.lower()
    rating_match = re.search(r"_(\d+)kva(?:_|$)", identyfikator)
    if rating_match is not None:
        rating_kva = int(rating_match.group(1))
        if rating_kva == 50:
            # Historyczny typoszereg 50 kVA nie istnieje już w katalogu —
            # najbliższy obecny typoszereg to 63 kVA (parytet z apply.py).
            rating_kva = 63
        token = f"-{rating_kva}kva-"
        for opcja in transformer_options:
            ref = opcja.catalog_ref
            if isinstance(ref, str) and token in ref.lower():
                return opcja
        return None
    # GPZ (110/SN, V12T-016): identyfikator koduje moc jednostkową w MVA, nie
    # kVA (`tpl_gpz_110_15_2x16mva_h5` → 16 MVA, TRANSFORMER_WN_SN_110_15/_20
    # ma typoszereg 10-63 MVA, poniżej progu jednego kVA). Ten sam token co
    # katalog (`-{n}mva-`, `catalog_choice_rated_kva`), tylko wyprowadzony z
    # identyfikatora szablonu zamiast referencji katalogowej.
    mva_match = re.search(r"(\d+)mva(?:_|$)", identyfikator)
    if mva_match is not None:
        token_mva = f"-{int(mva_match.group(1))}mva-"
        for opcja in transformer_options:
            ref = opcja.catalog_ref
            if isinstance(ref, str) and token_mva in ref.lower():
                return opcja
    return None


def _opcja_transformatora_dla_wymaganej_mocy(
    transformer_options: tuple[CatalogChoice, ...], required_kva: int
) -> CatalogChoice | None:
    """Najmniejsza opcja transformatora o mocy >= `required_kva`; gdy żadna nie
    wystarcza — największa dostępna (transformator NIE MOŻE wypaść z pakietu
    szablonu, nawet gdy suma DER przekracza typoszereg). `None` gdy brak opcji
    z mocą zakodowaną w `catalog_ref`.

    Promowane z `apply.py::_resolve_transformer_ref_for_template` (2026-09,
    przegląd V12T-016) — ten sam selektor, teraz współdzielony ze ścieżką
    wyświetlania."""
    rated_options = sorted(
        (
            (rating, opcja)
            for opcja in transformer_options
            for rating, ref in [catalog_choice_rated_kva(opcja)]
            if rating is not None and ref is not None
        ),
        key=lambda item: item[0],
    )
    for rating, opcja in rated_options:
        if rating >= required_kva:
            return opcja
    return rated_options[-1][1] if rated_options else None


def _der_catalog_for_power(der_spec: Any, p_mw_each: float) -> str | None:
    """Domyślna pozycja katalogowa DER dobrana do mocy JEDNOSTKOWEJ szablonu —
    dopasowanie DOKŁADNE mocy zakodowanej w `catalog_ref` (np. `conv-wind-
    3mw-…`), w braku — najbliższe; brak parsowalnych tokenów ⇒ `None`.

    Promowane z `apply.py` (2026-09, przegląd V12T-016) — funkcja jest CZYSTA
    (bez zależności od `overrides`/kontekstu żądania), więc mieszka w schema.py
    jako współdzielony prymityw dla obu ścieżek (wyświetlanie i materializacja)."""
    options = getattr(der_spec, "catalog_options", ()) or ()
    parsed: list[tuple[float, str]] = []
    for option in options:
        ref = getattr(option, "catalog_ref", None)
        if not isinstance(ref, str):
            continue
        match = re.search(r"-(\d+(?:\.\d+)?)mw", ref.lower())
        if match is not None:
            parsed.append((float(match.group(1)), ref))
    if not parsed:
        return None
    exact = [ref for power, ref in parsed if abs(power - p_mw_each) < 1e-9]
    if exact:
        return exact[0]
    return min(parsed, key=lambda item: (abs(item[0] - p_mw_each), item[0]))[1]


def _converter_apparent_power_mva(catalog_ref: object) -> float | None:
    """Katalogowa moc pozorna jednostki przekształtnikowej [MVA] — z REALNEGO
    rekordu katalogu (`ConverterType.sn_mva`); `None` gdy brak refu/rekordu.

    Promowane z `apply.py` (2026-09, przegląd V12T-016) — jak
    `_der_catalog_for_power`, czysty prymityw bez zależności od kontekstu
    żądania."""
    if not isinstance(catalog_ref, str) or not catalog_ref.strip():
        return None
    try:
        from network_model.catalog import get_default_mv_catalog
    except ImportError:
        return None
    item = get_default_mv_catalog().get_converter_type(catalog_ref)
    value = getattr(item, "sn_mva", None) if item is not None else None
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _wymagana_moc_der_domyslna_kva(template: StationTemplate) -> int | None:
    """Moc pozorna [kVA] wymagana przez DOMYŚLNY (bez nadpisań) mix DER
    szablonu — `None` gdy szablon nie niesie DER-ów albo domyślna liczba
    modułów wynosi 0. Odpowiednik `apply.py::_template_der_required_kva` z
    PUSTYMI nadpisaniami (`overrides={}`) — dokładnie stan, który
    `structural_fields()` ma pokazać (szablon BEZ ingerencji projektanta)."""
    der_specs = template.schema.der_options
    if not der_specs:
        return None
    der_total = template.schema.der_total_count.default
    if der_total <= 0:
        return None
    total_mw = 0.0
    for i in range(der_total):
        spec = der_specs[i % len(der_specs)]
        p_mw_each = spec.default_p_mw_each
        catalog_ref = _der_catalog_for_power(spec, p_mw_each)
        apparent_mva = _converter_apparent_power_mva(catalog_ref)
        total_mw += apparent_mva if apparent_mva is not None else p_mw_each
    if total_mw <= 0:
        return None
    return int(round(mw_na_kw(total_mw)))


def resolve_template_default_transformer_choice(template: StationTemplate) -> CatalogChoice | None:
    """Opcja transformatora, którą `apply()` zmaterializuje dla TEGO szablonu
    bez żadnych nadpisań projektanta/kaskady producenta — JEDNO źródło prawdy
    dla `structural_fields()` (wyświetlanie) i `apply.py::
    _resolve_transformer_ref_for_template` (materializacja, ten sam porządek
    reguł PO sprawdzeniu nadpisania/profilu, których strona wyświetlania nie
    ma). `None` gdy szablon nie niesie `transformer_options` wcale."""
    if not template.schema.transformer_options:
        return None
    wg_id = _opcja_transformatora_wg_tokenu_id(template.schema.transformer_options, template.id)
    if wg_id is not None:
        return wg_id
    wymagana_kva = _wymagana_moc_der_domyslna_kva(template)
    if wymagana_kva is not None:
        wg_der = _opcja_transformatora_dla_wymaganej_mocy(
            template.schema.transformer_options, wymagana_kva
        )
        if wg_der is not None:
            return wg_der
    return _domyslna_opcja_transformatora(template.schema)


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
    try:
        from network_model.catalog import get_default_mv_catalog
    except ImportError:
        return None
    item = get_default_mv_catalog().get_shunt_capacitor_type(shunt_ref)
    if item is None:
        return None
    rated_kv = getattr(item, "rated_kv", None)
    if not isinstance(rated_kv, int | float) or float(rated_kv) <= 0.0:
        return None
    return float(rated_kv)


def sn_voltage_kv(template: StationTemplate) -> float | None:
    """Napięcie SN [kV], na którym szablon pracuje — wyprowadzone z jego własnej
    zawartości, nie z nazwy ani z kategorii:

    1. szablon GPZ (niesie `grid_source_options`, droga `add_grid_source_sn`)
       TWORZY szynę SN — jego napięciem SN jest strona DOLNA transformatora
       110/SN (strona górna to sieć 110 kV, a nie napięcie pracy pól SN);
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
    (`tpl_gpz_110_20_2x16mva_h5`, `tpl_kompensacja_1v8mvar_20kv`,
    `tpl_abonencka_630kva_pomiar_20kv`), napięciowo obojętne — 6 (3 rozdzielnie
    sieciowe + 3 warianty rezerwy zasilania).
    """
    transformator = resolve_template_default_transformer_choice(template)
    if transformator is not None:
        napiecie_gn_kv, napiecie_dn_kv = transformer_voltages_kv(transformator.catalog_ref)
        if template.schema.grid_source_options:
            if napiecie_dn_kv is not None:
                return napiecie_dn_kv
        elif napiecie_gn_kv is not None:
            return napiecie_gn_kv
    bateria = resolve_template_default_shunt_choice(template)
    if bateria is not None:
        return shunt_capacitor_rated_kv(bateria.catalog_ref)
    return None


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
        "connection_variant_options": list(d.connection_variant_options),
    }
