"""Stacje sekcyjne / pętlowe — 3 templates."""

from __future__ import annotations

from application.station_templates._choices import (
    CT_OPTIONS,
    NN_CB_OPTIONS,
    PROT_FEEDER_OPTIONS,
    SN_APPARATUS_OPTIONS,
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


def _sekcyjna(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    bays: int,
    feeders: int,
    use_case: str,
) -> StationTemplate:
    return StationTemplate(
        id=tpl_id,
        name_pl=name_pl,
        category=TemplateCategory.SEKCYJNA,
        description_pl=description_pl,
        use_case_pl=use_case,
        nc_rfg_type=None,
        icon="station-sectional",
        tags=("sekcyjna", "pętla", "RMU"),
        schema=TemplateSchema(
            transformer_options=TR_OPTIONS_MEDIUM,
            sn_bays_count=TemplateParamInt(
                default=bays, min_value=2, max_value=8, label_pl="Liczba pól SN"
            ),
            sn_bay_roles=(
                BayRoleSpec(role="IN", label_pl="Pole IN sekcja A"),
                BayRoleSpec(role="OUT", label_pl="Pole OUT sekcja B"),
                BayRoleSpec(role="COUPLER", label_pl="Pole sprzęgła (bus coupler)"),
            ),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            sn_bay_apparatus_options=SN_APPARATUS_OPTIONS,
            nn_feeders_count=TemplateParamInt(
                default=feeders, min_value=2, max_value=8, label_pl="Liczba odpływów nN"
            ),
            nn_feeder_cb_options=NN_CB_OPTIONS,
            ct_options=CT_OPTIONS,
            vt_options=VT_OPTIONS,
            protection_settings_default="tpl_feeder_15kv_sectional",
        ),
    )


SEKCYJNE_TEMPLATES = (
    _sekcyjna(
        "tpl_sekcyjna_rmu_4pole",
        "Stacja sekcyjna RMU 4-pole",
        "Stacja sekcyjna 4-pole z couplerem dla izolacji ringu SN.",
        bays=4,
        feeders=4,
        use_case="Izolacja sekcji ringu SN podczas konserwacji.",
    ),
    _sekcyjna(
        "tpl_petla_zksn_nop",
        "Pętla SN z NOP (Normally Open Point)",
        "Pętla z punktem normalnie otwartym dla redundancji N-1.",
        bays=4,
        feeders=4,
        use_case="Redundancja N-1 w ringu SN, automatyczne przełączenie na rezerwę.",
    ),
    _sekcyjna(
        "tpl_petla_szr",
        "Pętla SN z automatyką SZR (auto restoration)",
        "Automatyczna restoration: SZR wykrywa zwarcie i przełącza zasilanie.",
        bays=6,
        feeders=6,
        use_case="Dystrybucja z wysokim wymogiem ciągłości — auto-restoration <30 s.",
    ),
)
