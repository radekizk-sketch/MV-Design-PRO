"""GPZ 110/SN — rola A ("Zasilanie sieci"), 3 templates.

V12T-016 (rejestr długu): rola A miała ZERO szablonów — projektant zaczynający
projekt od Głównego Punktu Zasilania (źródło sieci SN, korzeń modelu) nie miał
gotowego pakietu katalogowego, mimo że cała maszyneria domenowa istniała już
od dawna (`enm/domain_operations.py::add_grid_source_sn`, „pierwszy krok
budowy sieci SN") i katalog transformatorów WN/SN 110/15 kV i 110/20 kV
(`mv_transformer_catalog.py::TRANSFORMER_WN_SN_110_15/_20`, PN-EN 60076-1:2011)
oraz równoważników systemowych SN (`mv_source_catalog.py::SOURCE_SYSTEM_TYPES`,
„Warunki przyłączenia / standard OSD") były od dawna w katalogu produkcyjnym.

Droga zabudowy JEST INNA niż pozostałych kategorii: GPZ jest KORZENIEM modelu
(nie wstawia się „w segment", bo żadnego segmentu jeszcze nie ma), więc
`apply.py` rozpoznaje `category == GPZ_110_SN` i woła `add_grid_source_sn`
zamiast `insert_station_on_segment_sn` — `target_segment_id` jest wtedy
ignorowany (API akceptuje `None`).

Układ H5 + mostek (2-sekcyjny GPZ z transformatorami równoległymi na dwóch
sekcjach szyn SN i sprzęgłem międzysekcyjnym) materializuje się WPROST z
`sections_count=2` operacji domenowej — sprzęgło (`bus_coupler`) powstaje
automatycznie dla `sections_count >= 2` (ten sam mechanizm co GPZ
referencyjne w `tests/application/station_templates/test_apply_odgalezienie.py`
i innych fikstur testowych GPZ).

Impedancja układu WN/SN NIE dubluje się: równoważnik systemowy (`ZRODLO_SN`)
jest podany „z warunków przyłączenia" — Sk3/R/X WIDZIANE z szyny SN GPZ, więc
już zawierają wpływ transformatora(ów). Transformator(y) WN/SN materializują
się OBOK (tabliczka znamionowa + SLD), bez własnego źródła po stronie 110 kV —
zgodnie z kontraktem `add_grid_source_sn` (`source_bus_ref` pozostaje na
szynie SN, chyba że rekord źródła jawnie deklaruje `short_circuit_input_side:
HV_110`, czego rekordy referencyjne SOURCE_SYSTEM_TYPES nie robią).

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
    TR_OPTIONS_WN_SN_110_15,
    TR_OPTIONS_WN_SN_110_20,
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
    tr_options: tuple[CatalogChoice, ...],
    source_options: tuple[CatalogChoice, ...],
    transformer_count: int,
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
        tags=("GPZ", "110 kV", "zasilanie sieci", "korzeń modelu"),
        schema=TemplateSchema(
            transformer_options=tr_options,
            transformer_count=TemplateParamInt(
                default=transformer_count,
                min_value=1,
                max_value=2,
                label_pl="Liczba transformatorów 110/SN",
            ),
            sn_bays_count=TemplateParamInt(
                default=line_fields_per_section,
                min_value=2,
                max_value=12,
                label_pl="Liczba pól liniowych na sekcję",
            ),
            sn_bay_roles=(
                BayRoleSpec(role="FEEDER", label_pl="Pole liniowe odpływowe (sekcja A)"),
                BayRoleSpec(role="FEEDER", label_pl="Pole liniowe odpływowe (sekcja B)"),
                BayRoleSpec(role="COUPLER", label_pl="Pole sprzęgła sekcyjnego (mostek H5)"),
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
        "tpl_gpz_110_15_2x16mva_h5",
        "GPZ 110/15 kV, 2×16 MVA, układ H5 z mostkiem",
        "Główny Punkt Zasilania 110/15 kV: dwie sekcje szyn SN, dwa "
        "transformatory 16 MVA (po jednym na sekcję) i sprzęgło "
        "międzysekcyjne (mostek) — klasyczny układ H5.",
        tr_options=TR_OPTIONS_WN_SN_110_15,
        source_options=GPZ_SOURCE_OPTIONS_15,
        transformer_count=2,
        line_fields_per_section=4,
        use_case="Średniej wielkości GPZ zasilający obszar dystrybucyjny SN 15 kV "
        "(miasto powiatowe, kilka magistrali wiejskich).",
    ),
    _gpz(
        "tpl_gpz_110_15_2x25mva_h5",
        "GPZ 110/15 kV, 2×25 MVA, układ H5 z mostkiem",
        "Duży Główny Punkt Zasilania 110/15 kV: dwie sekcje szyn SN, dwa "
        "transformatory 25 MVA i sprzęgło międzysekcyjne — rozbudowany "
        "układ H5 z większą liczbą pól liniowych odpływowych na sekcję.",
        tr_options=TR_OPTIONS_WN_SN_110_15,
        source_options=GPZ_SOURCE_OPTIONS_15,
        transformer_count=2,
        line_fields_per_section=6,
        use_case="Duży GPZ obszaru miejskiego/przemysłowego SN 15 kV z wieloma "
        "magistralami odpływowymi.",
    ),
    _gpz(
        "tpl_gpz_110_20_2x16mva_h5",
        "GPZ 110/20 kV, 2×16 MVA, układ H5 z mostkiem",
        "Główny Punkt Zasilania 110/20 kV: dwie sekcje szyn SN, dwa "
        "transformatory 16 MVA i sprzęgło międzysekcyjne — układ H5 dla "
        "obszaru sieci 20 kV.",
        tr_options=TR_OPTIONS_WN_SN_110_20,
        source_options=GPZ_SOURCE_OPTIONS_20,
        transformer_count=2,
        line_fields_per_section=4,
        use_case="Średniej wielkości GPZ zasilający obszar dystrybucyjny SN 20 kV.",
    ),
)
