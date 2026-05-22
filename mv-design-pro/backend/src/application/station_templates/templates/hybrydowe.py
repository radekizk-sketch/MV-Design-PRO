"""Hybrydowe PV+BESS — 5 templates (różne kombinacje)."""

from __future__ import annotations

from application.station_templates._choices import (
    CT_OPTIONS,
    DER_BESS_SN,
    DER_PV_SN,
    NN_CB_OPTIONS,
    PROT_FEEDER_OPTIONS,
    TR_BLOCK_PV_OPTIONS,
    VT_OPTIONS,
)
from application.station_templates.schema import (
    BayRoleSpec,
    StationTemplate,
    TemplateCategory,
    TemplateParamInt,
    TemplateSchema,
)


def _hybrid(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    pv_count: int,
    bess_count: int,
    nc_rfg_type: str = "C",
) -> StationTemplate:
    return StationTemplate(
        id=tpl_id,
        name_pl=name_pl,
        category=TemplateCategory.HYBRYDOWA,
        description_pl=description_pl,
        use_case_pl="Farma hybrydowa PV + BESS (firmness + arbitrage).",
        nc_rfg_type=nc_rfg_type,
        icon="station-hybrid",
        tags=("hybrydowa", "PV+BESS", "OZE", f"NC_RfG_{nc_rfg_type}"),
        schema=TemplateSchema(
            transformer_options=TR_BLOCK_PV_OPTIONS,
            sn_bays_count=TemplateParamInt(default=3, min_value=2, max_value=6, label_pl="Liczba pól SN"),
            sn_bay_roles=(
                BayRoleSpec(role="IN", label_pl="Pole liniowe IN"),
                BayRoleSpec(role="MEASUREMENT", label_pl="Pole pomiarowe + EMS"),
                BayRoleSpec(role="OUT", label_pl="Pole wyjściowe do BESS"),
            ),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            nn_feeders_count=TemplateParamInt(default=0, min_value=0, max_value=2, label_pl="Liczba odpływów nN"),
            nn_feeder_cb_options=NN_CB_OPTIONS,
            der_options=(DER_PV_SN, DER_BESS_SN),
            der_total_count=TemplateParamInt(
                default=pv_count + bess_count,
                min_value=2, max_value=20,
                label_pl="Liczba modułów DER (PV + BESS)",
            ),
            ct_options=CT_OPTIONS,
            vt_options=VT_OPTIONS,
            protection_settings_default="tpl_der_hybrid",
        ),
    )


HYBRYDOWE_TEMPLATES = (
    _hybrid("tpl_hybrid_pv05_bess05",
            "Hybryda PV 0.5 MW + BESS 0.5 MW/1 MWh",
            "Mała hybryda 0.5+0.5 MW dla samobilansowania.",
            pv_count=1, bess_count=1, nc_rfg_type="B"),
    _hybrid("tpl_hybrid_pv1_bess1",
            "Hybryda PV 1 MW + BESS 1 MW/2 MWh",
            "Standardowa hybryda 1+1 MW.",
            pv_count=2, bess_count=1, nc_rfg_type="C"),
    _hybrid("tpl_hybrid_pv2_bess1",
            "Hybryda PV 2 MW + BESS 1 MW/2 MWh (P>E ratio)",
            "Hybryda z większą mocą PV niż BESS.",
            pv_count=4, bess_count=1, nc_rfg_type="C"),
    _hybrid("tpl_hybrid_pv3_bess2",
            "Hybryda PV 3 MW + BESS 2 MW/4 MWh",
            "Średnia hybryda 3+2 MW dla pełnego firmness.",
            pv_count=6, bess_count=1, nc_rfg_type="C"),
    _hybrid("tpl_hybrid_pv5_bess3",
            "Hybryda PV 5 MW + BESS 3 MW/6 MWh",
            "Duża hybryda flagship 5+3 MW z grid services.",
            pv_count=10, bess_count=1, nc_rfg_type="D"),
)
