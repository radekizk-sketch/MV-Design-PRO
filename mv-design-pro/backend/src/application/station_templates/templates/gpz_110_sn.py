"""GPZ (rola A, „Zasilanie sieci") — 3 szablony z równoważnikiem sieci na szynach SN.

V12T-016 (rejestr długu): rola A miała ZERO szablonów — projektant zaczynający
projekt od Głównego Punktu Zasilania (źródło sieci SN, korzeń modelu) nie miał
gotowego pakietu katalogowego, mimo że maszyneria domenowa istniała
(`enm/domain_operations.py::add_grid_source_sn`, „pierwszy krok budowy sieci SN")
i katalog równoważników systemowych SN (`mv_source_catalog.py::SOURCE_SYSTEM_TYPES`,
„Warunki przyłączenia / standard OSD") był w katalogu produkcyjnym.

Droga zabudowy JEST INNA niż pozostałych kategorii: GPZ jest KORZENIEM modelu
(nie wstawia się „w segment", bo żadnego segmentu jeszcze nie ma), więc
`apply.py` rozpoznaje `category == GPZ_110_SN` i woła `add_grid_source_sn`
zamiast `insert_station_on_segment_sn`.

Układ: dwie sekcje szyn SN ze sprzęgłem międzysekcyjnym (`bus_coupler`, powstaje
automatycznie dla `sections_count >= 2`).

GRANICA ZASILANIA SN (karta GPZ-MODEL, rozstrzygnięcie architekta §0.2): równoważnik
systemowy z katalogu (`ZRODLO_SN`) jest podany „z warunków przyłączenia" — Sk3/R/X
WIDZIANE z szyny SN GPZ, więc już zawiera impedancję transformatorów 110/SN.
Granicą modelu są wtedy szyny SN GPZ: transformatory 110/SN NIE są elementami modelu
obliczeniowego i szablon ich nie tworzy (dawne szablony „2×16 MVA / 2×25 MVA"
materializowały transformatory OBOK równoważnika — rysunek sugerował zasilanie przez
transformatory, którego obliczenie nie miało). Równoważnik stoi na sekcji 1; sekcja 2
jest zasilana przez sprzęgło (otwarte sprzęgło = blokada gotowości E065 „sekcja GPZ
bez zasilania"). GPZ z transformatorami 110/SN buduje kreator źródła zasilania
z równoważnikiem po stronie 110 kV.

Uziemienie punktu neutralnego: `isolated` (sieć izolowana) — najczęstszy,
bezparametrowy wybór dla polskich sieci SN 15/20 kV (nie wymaga fabrykowania
R/X rezystora/dławika, którego katalog produkcyjny nie niesie).
"""

from __future__ import annotations

from application.station_templates._choices import (
    GPZ_SOURCE_OPTIONS_15,
    GPZ_SOURCE_OPTIONS_20,
    PROT_FEEDER_OPTIONS,
    SN_APPARATUS_OPTIONS,
)
from application.station_templates.schema import (
    BayRoleSpec,
    CatalogChoice,
    StationTemplate,
    TemplateCategory,
    TemplateParamFloat,
    TemplateParamInt,
    TemplateSchema,
)


def _gpz(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    source_options: tuple[CatalogChoice, ...],
    line_fields_per_section: int,
    use_case: str,
) -> StationTemplate:
    return StationTemplate(
        id=tpl_id,
        name_pl=name_pl,
        category=TemplateCategory.GPZ_110_SN,
        description_pl=description_pl,
        use_case_pl=use_case,
        nc_rfg_type=None,
        icon="station-gpz",
        tags=("GPZ", "zasilanie sieci", "korzeń modelu", "równoważnik na szynach SN"),
        schema=TemplateSchema(
            # Granica zasilania SN: transformatory 110/SN poza modelem (docstring modułu).
            transformer_options=(),
            transformer_count=TemplateParamInt(
                default=0,
                min_value=0,
                max_value=0,
                label_pl="Transformatory 110/SN poza modelem (równoważnik na szynach SN)",
            ),
            sn_bays_count=TemplateParamInt(
                default=line_fields_per_section,
                min_value=2,
                max_value=12,
                label_pl="Liczba pól liniowych na sekcję",
            ),
            sn_bay_roles=(
                BayRoleSpec(role="FEEDER", okreslenie_pl="(sekcja A)"),
                BayRoleSpec(role="FEEDER", okreslenie_pl="(sekcja B)"),
                BayRoleSpec(role="COUPLER", okreslenie_pl="sekcyjnego (mostek H5)"),
            ),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            sn_bay_apparatus_options=SN_APPARATUS_OPTIONS,
            grid_source_options=source_options,
            # GPZ zasila sieć SN — bez własnej strony nN.
            nn_feeders_count=TemplateParamInt(
                default=0, min_value=0, max_value=0, label_pl="Bez odpływów nN"
            ),
            nn_feeder_cb_options=(),
            nn_load_default_kw=TemplateParamFloat(
                default=0.0, min_value=0.0, max_value=0.0, unit="kW", label_pl="Bez odbioru nN"
            ),
            protection_settings_default="tpl_feeder_15kv_sectional",
        ),
    )


GPZ_110_SN_TEMPLATES = (
    _gpz(
        "tpl_gpz_sn_15_2s_4p",
        "GPZ 15 kV, dwie sekcje SN ze sprzęgłem, 4 pola liniowe na sekcję",
        "Główny Punkt Zasilania zasilany równoważnikiem sieci na szynach SN 15 kV "
        "(warunki przyłączenia OSD): dwie sekcje szyn SN, sprzęgło międzysekcyjne, "
        "po 4 pola liniowe na sekcji. Transformatory 110/SN są zawarte w równoważniku "
        "i nie są elementami modelu.",
        source_options=GPZ_SOURCE_OPTIONS_15,
        line_fields_per_section=4,
        use_case="Średniej wielkości GPZ zasilający obszar dystrybucyjny SN 15 kV "
        "(miasto powiatowe, kilka magistrali wiejskich).",
    ),
    _gpz(
        "tpl_gpz_sn_15_2s_6p",
        "GPZ 15 kV, dwie sekcje SN ze sprzęgłem, 6 pól liniowych na sekcję",
        "Duży Główny Punkt Zasilania zasilany równoważnikiem sieci na szynach SN 15 kV: "
        "dwie sekcje szyn SN, sprzęgło międzysekcyjne, po 6 pól liniowych na sekcji. "
        "Transformatory 110/SN są zawarte w równoważniku i nie są elementami modelu.",
        source_options=GPZ_SOURCE_OPTIONS_15,
        line_fields_per_section=6,
        use_case="Duży GPZ obszaru miejskiego/przemysłowego SN 15 kV z wieloma "
        "magistralami odpływowymi.",
    ),
    _gpz(
        "tpl_gpz_sn_20_2s_4p",
        "GPZ 20 kV, dwie sekcje SN ze sprzęgłem, 4 pola liniowe na sekcję",
        "Główny Punkt Zasilania zasilany równoważnikiem sieci na szynach SN 20 kV: "
        "dwie sekcje szyn SN, sprzęgło międzysekcyjne, po 4 pola liniowe na sekcji. "
        "Transformatory 110/SN są zawarte w równoważniku i nie są elementami modelu.",
        source_options=GPZ_SOURCE_OPTIONS_20,
        line_fields_per_section=4,
        use_case="Średniej wielkości GPZ zasilający obszar dystrybucyjny SN 20 kV.",
    ),
)
