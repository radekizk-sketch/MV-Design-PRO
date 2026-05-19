"""Farmy PV SN — 5 templates (0.5-5 MW, SN-side block transformer)."""

from __future__ import annotations

from application.station_templates._choices import (
    CT_OPTIONS,
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


def _farma(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    pv_count: int,
    pv_p_mw_each: float,
    nc_rfg_type: str,
) -> StationTemplate:
    return StationTemplate(
        id=tpl_id,
        name_pl=name_pl,
        category=TemplateCategory.FARMA_PV,
        description_pl=description_pl,
        use_case_pl="Farma fotowoltaiczna z przyłączem SN.",
        nc_rfg_type=nc_rfg_type,
        icon="station-pv-farm",
        tags=("farma PV", "OZE", "block_transformer", f"NC_RfG_{nc_rfg_type}"),
        schema=TemplateSchema(
            transformer_options=TR_BLOCK_PV_OPTIONS,
            sn_bays_count=TemplateParamInt(default=2, min_value=1, max_value=4, label_pl="Liczba pól SN"),
            sn_bay_roles=(
                BayRoleSpec(role="IN", label_pl="Pole liniowe IN (kierunek OSD)"),
                BayRoleSpec(role="MEASUREMENT", label_pl="Pole pomiarowe (taryfa)"),
            ),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            nn_feeders_count=TemplateParamInt(default=0, min_value=0, max_value=2, label_pl="Liczba odpływów nN (usługi)"),
            nn_feeder_cb_options=NN_CB_OPTIONS,
            der_options=(DER_PV_SN,),
            der_total_count=TemplateParamInt(
                default=pv_count, min_value=1, max_value=20, label_pl="Liczba falowników PV"
            ),
            ct_options=CT_OPTIONS,
            vt_options=VT_OPTIONS,
            protection_settings_default="tpl_der_pv_farm",
        ),
    )


FARMY_PV_TEMPLATES = (
    _farma(
        "tpl_farma_pv_500kw",
        "Farma PV 500 kW z block TR 0.4/15 kV",
        "Mała farma 500 kW przyłączona z 1 falownikiem PV.",
        pv_count=1, pv_p_mw_each=0.5, nc_rfg_type="B",
    ),
    _farma(
        "tpl_farma_pv_1mw",
        "Farma PV 1 MW, 2× falownik, block TR 1.25 MVA",
        "Standardowa farma 1 MW: 2 falowniki 500 kW.",
        pv_count=2, pv_p_mw_each=0.5, nc_rfg_type="B",
    ),
    _farma(
        "tpl_farma_pv_2mw",
        "Farma PV 2 MW, 4× falownik 500 kW",
        "Średnia farma 2 MW z 4 falownikami.",
        pv_count=4, pv_p_mw_each=0.5, nc_rfg_type="B",
    ),
    _farma(
        "tpl_farma_pv_3mw",
        "Farma PV 3 MW (NC RfG typ C)",
        "Duża farma 3 MW: NC RfG typ C — usługi systemowe wymagane.",
        pv_count=6, pv_p_mw_each=0.5, nc_rfg_type="C",
    ),
    _farma(
        "tpl_farma_pv_5mw",
        "Farma PV 5 MW (typ D, pełne usługi grid)",
        "Bardzo duża farma 5 MW: NC RfG typ D — pełen zakres grid services.",
        pv_count=10, pv_p_mw_each=0.5, nc_rfg_type="D",
    ),
)
