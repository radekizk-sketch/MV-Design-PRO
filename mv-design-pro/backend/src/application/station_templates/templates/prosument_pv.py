"""Stacje prosumenta PV — 6 templates (5-250 kW, NC RfG typ A-C)."""

from __future__ import annotations

from application.station_templates._choices import (
    CT_OPTIONS,
    DER_PV_NN,
    NN_CB_OPTIONS,
    PROT_FEEDER_OPTIONS,
    TR_OPTIONS_SMALL,
    VT_OPTIONS,
)
from application.station_templates.schema import (
    BayRoleSpec,
    StationTemplate,
    TemplateCategory,
    TemplateParamInt,
    TemplateSchema,
)


def _prosument(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    pv_count: int,
    pv_p_kw_each: float,
    nc_rfg_type: str,
) -> StationTemplate:
    return StationTemplate(
        id=tpl_id,
        name_pl=name_pl,
        category=TemplateCategory.PROSUMENT_PV,
        description_pl=description_pl,
        use_case_pl="Mikroinstalacja PV prosumencka.",
        nc_rfg_type=nc_rfg_type,
        icon="station-pv-prosument",
        tags=("prosument", "PV", "mikroinstalacja", f"NC_RfG_{nc_rfg_type}"),
        schema=TemplateSchema(
            transformer_options=TR_OPTIONS_SMALL,
            sn_bays_count=TemplateParamInt(default=1, min_value=1, max_value=2, label_pl="Liczba pól SN"),
            sn_bay_roles=(BayRoleSpec(role="IN", label_pl="Pole liniowe IN"),),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            nn_feeders_count=TemplateParamInt(default=2, min_value=1, max_value=4, label_pl="Liczba odpływów nN"),
            nn_feeder_cb_options=NN_CB_OPTIONS,
            der_options=(DER_PV_NN,),
            der_total_count=TemplateParamInt(
                default=pv_count, min_value=1, max_value=10, label_pl="Liczba falowników PV"
            ),
            ct_options=CT_OPTIONS,
            vt_options=VT_OPTIONS,
            protection_settings_default="tpl_der_pv_nc_rfg_a" if nc_rfg_type == "A" else "tpl_der_pv_nc_rfg_b",
        ),
    )


PROSUMENT_PV_TEMPLATES = (
    _prosument(
        "tpl_pv_prosument_5kw",
        "Mikroinstalacja PV 5 kW (Fronius, NC RfG typ A)",
        "Pojedyncza mikroinstalacja PV 5 kW 1-fazowa, Fronius/SMA falownik.",
        pv_count=1, pv_p_kw_each=5.0, nc_rfg_type="A",
    ),
    _prosument(
        "tpl_pv_prosument_10kw",
        "PV 10 kW prosument 1-fazowy",
        "Standardowa prosumencka 10 kW (1-fazowa, typ A).",
        pv_count=1, pv_p_kw_each=10.0, nc_rfg_type="A",
    ),
    _prosument(
        "tpl_pv_prosument_30kw",
        "PV 30 kW prosument 3-fazowy (typ A)",
        "PV 30 kW 3-fazowy, NC RfG typ A.",
        pv_count=1, pv_p_kw_each=30.0, nc_rfg_type="A",
    ),
    _prosument(
        "tpl_pv_prosument_50kw",
        "PV 50 kW prosument graniczna typ A",
        "Graniczny limit typu A: PV 50 kW (NC RfG).",
        pv_count=1, pv_p_kw_each=50.0, nc_rfg_type="A",
    ),
    _prosument(
        "tpl_pv_prosument_100kw",
        "PV 100 kW (typ B, wymaga uzgodnień)",
        "Większa instalacja 100 kW: NC RfG typ B z obowiązkiem zgłoszenia OSD.",
        pv_count=2, pv_p_kw_each=50.0, nc_rfg_type="B",
    ),
    _prosument(
        "tpl_pv_prosument_250kw",
        "PV 250 kW (typ B-C, pełne uzgodnienia)",
        "Duża instalacja 250 kW: NC RfG typ B-C z pełnymi uzgodnieniami.",
        pv_count=5, pv_p_kw_each=50.0, nc_rfg_type="B",
    ),
)
