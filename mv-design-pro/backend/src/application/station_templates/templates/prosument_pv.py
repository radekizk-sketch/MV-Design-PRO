"""Stacje prosumenta PV — 6 szablonów (8–250 kW).

Przeprojektowanie 2026-10-15 (decyzja właściciela): falowniki z kartą producenta SMA Sunny
Tripower 8.0 / 10.0 (0,4 kV), moc = liczba × moc z karty. Dawne pozycje 5/10/30 kW nie
istniały w katalogu (brak karty falownika 5 kW i 30 kW), a 50 kW jest modelem referencyjnym;
szablon 5 kW zastąpił szablon 8 kW (najmniejsza karta 3-fazowa w katalogu). Typ modułu
NC RfG wynika ze składu (`schema.typ_modulu_nc_rfg_skladu`, przyłączenie po stronie nN)."""

from __future__ import annotations

from dataclasses import replace

from application.station_templates._choices import (
    CT_OPTIONS,
    DER_PV_NN,
    NN_CB_OPTIONS,
    PROT_FEEDER_OPTIONS,
    SN_APPARATUS_OPTIONS,
    TR_OPTIONS_SMALL,
    VT_OPTIONS,
)
from application.station_templates.schema import (
    BayRoleSpec,
    StationTemplate,
    TemplateCategory,
    TemplateParamInt,
    TemplateSchema,
    typ_modulu_nc_rfg_skladu,
)
from network_model.pochodne import kw_na_mw


def _prosument(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    pv_count: int,
    pv_p_kw_each: float,
) -> StationTemplate:
    der_options = (
        replace(DER_PV_NN, default_p_mw_each=kw_na_mw(pv_p_kw_each), default_count=pv_count),
    )
    nc_rfg_type = typ_modulu_nc_rfg_skladu(der_options, 0.4)
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
            sn_bays_count=TemplateParamInt(
                default=1, min_value=1, max_value=2, label_pl="Liczba pól SN"
            ),
            sn_bay_roles=(BayRoleSpec(role="IN"),),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            sn_bay_apparatus_options=SN_APPARATUS_OPTIONS,
            nn_feeders_count=TemplateParamInt(
                default=2, min_value=1, max_value=4, label_pl="Liczba odpływów nN"
            ),
            nn_feeder_cb_options=NN_CB_OPTIONS,
            der_options=der_options,
            der_total_count=TemplateParamInt(
                default=pv_count, min_value=1, max_value=30, label_pl="Liczba falowników PV"
            ),
            ct_options=CT_OPTIONS,
            vt_options=VT_OPTIONS,
            protection_settings_default=(
                "tpl_der_pv_nc_rfg_a" if nc_rfg_type == "A" else "tpl_der_pv_nc_rfg_b"
            ),
        ),
    )


PROSUMENT_PV_TEMPLATES = (
    _prosument(
        "tpl_pv_prosument_8kw",
        "Mikroinstalacja PV 8 kW (SMA Sunny Tripower 8.0)",
        "Mikroinstalacja PV 8 kW: falownik 3-fazowy SMA Sunny Tripower 8.0 (8 kVA, 0,4 kV).",
        pv_count=1,
        pv_p_kw_each=8.0,
    ),
    _prosument(
        "tpl_pv_prosument_10kw",
        "Mikroinstalacja PV 10 kW (SMA Sunny Tripower 10.0)",
        "Mikroinstalacja PV 10 kW: falownik 3-fazowy SMA Sunny Tripower 10.0 (10 kVA, 0,4 kV).",
        pv_count=1,
        pv_p_kw_each=10.0,
    ),
    _prosument(
        "tpl_pv_prosument_30kw",
        "PV 30 kW, 3× SMA Sunny Tripower 10.0",
        "Instalacja PV 30 kW: 3 falowniki SMA Sunny Tripower 10.0 (10 kVA, 0,4 kV).",
        pv_count=3,
        pv_p_kw_each=10.0,
    ),
    _prosument(
        "tpl_pv_prosument_50kw",
        "PV 50 kW, 5× SMA Sunny Tripower 10.0",
        "Instalacja PV 50 kW: 5 falowników SMA Sunny Tripower 10.0 (10 kVA, 0,4 kV).",
        pv_count=5,
        pv_p_kw_each=10.0,
    ),
    _prosument(
        "tpl_pv_prosument_100kw",
        "PV 100 kW, 10× SMA Sunny Tripower 10.0",
        "Instalacja PV 100 kW: 10 falowników SMA Sunny Tripower 10.0 (10 kVA, 0,4 kV).",
        pv_count=10,
        pv_p_kw_each=10.0,
    ),
    _prosument(
        "tpl_pv_prosument_250kw",
        "PV 250 kW, 25× SMA Sunny Tripower 10.0",
        "Instalacja PV 250 kW: 25 falowników SMA Sunny Tripower 10.0 (10 kVA, 0,4 kV), "
        "NC RfG typ B z obowiązkiem zgłoszenia OSD.",
        pv_count=25,
        pv_p_kw_each=10.0,
    ),
)
