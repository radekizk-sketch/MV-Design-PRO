"""Stacje przemysłowe odbiorcze — 5 templates."""

from __future__ import annotations

from application.station_templates._choices import (
    CT_OPTIONS,
    NN_CB_OPTIONS,
    PROT_FEEDER_OPTIONS,
    TR_OPTIONS_LARGE,
    TR_OPTIONS_MEDIUM,
    VT_OPTIONS,
)
from application.station_templates.schema import (
    BayRoleSpec,
    StationTemplate,
    TemplateCategory,
    TemplateParamInt,
    TemplateSchema,
)


def _przemyslowa(
    tpl_id: str, name_pl: str, description_pl: str, *,
    tr_options: tuple, tr_count: int, feeders: int, bays: int,
    use_case: str,
) -> StationTemplate:
    return StationTemplate(
        id=tpl_id, name_pl=name_pl,
        category=TemplateCategory.PRZEMYSLOWA,
        description_pl=description_pl,
        use_case_pl=use_case,
        nc_rfg_type=None,
        icon="station-industrial",
        tags=("przemysłowa", "odbiorca", "duża moc"),
        schema=TemplateSchema(
            transformer_options=tr_options,
            transformer_count=TemplateParamInt(default=tr_count, min_value=1, max_value=3, label_pl="Liczba TR"),
            sn_bays_count=TemplateParamInt(default=bays, min_value=2, max_value=10, label_pl="Liczba pól SN"),
            sn_bay_roles=(
                BayRoleSpec(role="IN", label_pl="Pole IN (przyłącze OSD)"),
                BayRoleSpec(role="MEASUREMENT", label_pl="Pole pomiarowe (taryfa B21)"),
                BayRoleSpec(role="TR", label_pl="Pole TR"),
                BayRoleSpec(role="OUT", label_pl="Pole rezerwowe OUT"),
            ),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            nn_feeders_count=TemplateParamInt(default=feeders, min_value=2, max_value=20, label_pl="Liczba odpływów nN"),
            nn_feeder_cb_options=NN_CB_OPTIONS,
            ct_options=CT_OPTIONS,
            vt_options=VT_OPTIONS,
            protection_settings_default="tpl_industrial_typowa",
        ),
    )


PRZEMYSLOWE_TEMPLATES = (
    _przemyslowa(
        "tpl_przemyslowa_1mva_4odplywy",
        "Stacja przemysłowa 1 MVA, 4 odpływy nN",
        "Średnia stacja zakładowa 1 MVA z 4 grupami odbiorów.",
        tr_options=TR_OPTIONS_MEDIUM, tr_count=1, feeders=4, bays=3,
        use_case="Średni zakład produkcyjny, taryfa B21.",
    ),
    _przemyslowa(
        "tpl_przemyslowa_2mva_silnik",
        "Stacja przemysłowa 2 MVA z silnikiem rozruchowym",
        "Stacja 2 MVA z dużym silnikiem (motor protection 51+50+46+49).",
        tr_options=TR_OPTIONS_LARGE, tr_count=1, feeders=6, bays=4,
        use_case="Zakład z dużymi silnikami (młyn, sprężarka, wentylator).",
    ),
    _przemyslowa(
        "tpl_przemyslowa_2x630_redundancja",
        "Stacja przemysłowa 2× TR 630 kVA redundancja N+1",
        "Redundancja N+1: 2 transformatory 630 kVA, automatyka SZR.",
        tr_options=TR_OPTIONS_MEDIUM, tr_count=2, feeders=8, bays=5,
        use_case="Zakład wymagający ciągłości zasilania (food, pharma).",
    ),
    _przemyslowa(
        "tpl_przemyslowa_dual_feed",
        "Stacja przemysłowa podwójnie zasilona (rezerwa)",
        "Dwie linie zasilające (kierunki A i B), bus coupler do automatyki SZR.",
        tr_options=TR_OPTIONS_LARGE, tr_count=2, feeders=10, bays=6,
        use_case="Zakład klasy I (krytyczna ciągłość) — szpital, data center.",
    ),
    _przemyslowa(
        "tpl_przemyslowa_punkt_graniczny_audyt",
        "Stacja przemysłowa z polem pomiarowym granicznym + analizatory",
        "Stacja z polem granicznym (taryfa) i analizatorami jakości EN 50160.",
        tr_options=TR_OPTIONS_LARGE, tr_count=1, feeders=6, bays=5,
        use_case="Zakład z wymaganiami jakości zasilania (audyt EN 50160).",
    ),
)
