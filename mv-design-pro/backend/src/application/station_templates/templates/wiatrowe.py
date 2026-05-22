"""Stacje OZE wiatrowe — 4 templates (1-3 MW turbiny + farma)."""

from __future__ import annotations

from application.station_templates._choices import (
    CT_OPTIONS,
    DER_FW,
    NN_CB_OPTIONS,
    PROT_FEEDER_OPTIONS,
    TR_BLOCK_FW_OPTIONS,
    VT_OPTIONS,
)
from application.station_templates.schema import (
    BayRoleSpec,
    StationTemplate,
    TemplateCategory,
    TemplateParamInt,
    TemplateSchema,
)


def _wiatr(
    tpl_id: str, name_pl: str, description_pl: str, *,
    fw_count: int, fw_p_mw_each: float, nc_rfg_type: str,
) -> StationTemplate:
    return StationTemplate(
        id=tpl_id, name_pl=name_pl,
        category=TemplateCategory.WIATROWA,
        description_pl=description_pl,
        use_case_pl="Stacja przyłączeniowa turbin wiatrowych.",
        nc_rfg_type=nc_rfg_type,
        icon="station-wind",
        tags=("wiatr", "FW", "OZE", "Vestas", f"NC_RfG_{nc_rfg_type}"),
        schema=TemplateSchema(
            transformer_options=TR_BLOCK_FW_OPTIONS,
            sn_bays_count=TemplateParamInt(default=2, min_value=1, max_value=8, label_pl="Liczba pól SN"),
            sn_bay_roles=(
                BayRoleSpec(role="IN", label_pl="Pole IN (kolektor SN)"),
                BayRoleSpec(role="MEASUREMENT", label_pl="Pole pomiarowe"),
            ),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            nn_feeders_count=TemplateParamInt(default=0, min_value=0, max_value=2, label_pl="Liczba odpływów nN"),
            nn_feeder_cb_options=NN_CB_OPTIONS,
            der_options=(DER_FW,),
            der_total_count=TemplateParamInt(
                default=fw_count, min_value=1, max_value=20, label_pl="Liczba turbin"
            ),
            ct_options=CT_OPTIONS,
            vt_options=VT_OPTIONS,
            protection_settings_default="tpl_der_fw",
        ),
    )


WIATROWE_TEMPLATES = (
    _wiatr("tpl_wiatr_1mw_pojedyncza",
           "Turbina wiatrowa 1 MW (Vestas V90)",
           "Pojedyncza turbina 1 MW z block TR.",
           fw_count=1, fw_p_mw_each=1.0, nc_rfg_type="B"),
    _wiatr("tpl_wiatr_2mw",
           "Turbina wiatrowa 2 MW (Vestas V90-2MW)",
           "Turbina 2 MW NC RfG typ B.",
           fw_count=1, fw_p_mw_each=2.0, nc_rfg_type="B"),
    _wiatr("tpl_wiatr_3mw",
           "Turbina wiatrowa 3 MW (Vestas V112-3MW)",
           "Turbina 3 MW NC RfG typ C-D z usługami systemowymi.",
           fw_count=1, fw_p_mw_each=3.0, nc_rfg_type="C"),
    _wiatr("tpl_wiatr_farma_5x2mw",
           "Farma wiatrowa 5× 2 MW kolektor SN",
           "Farma 10 MW (5 turbin × 2 MW) z kolektorem SN.",
           fw_count=5, fw_p_mw_each=2.0, nc_rfg_type="D"),
)
