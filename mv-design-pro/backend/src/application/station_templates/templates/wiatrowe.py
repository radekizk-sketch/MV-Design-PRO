"""Stacje OZE wiatrowe — 4 szablony (turbiny 1–3 MW + farma).

Korekta 2026-10-15 (karta GPT-478, pkt 7.4): nazwy obiecywały modele producenta
(„Vestas V90/V112"), których pozycje katalogowe nie niosą, a szablon „1 MW" tworzył
pozycję 2 MW z nastawą 1 MW. Każda turbina jest pozycją po stronie nN (generator 0,69 kV)
z WŁASNYM transformatorem blokowym nN/SN dobieranym z katalogu (`schema.
dobor_toru_jednostki_der_sn`); pozycja 1 MW pochodzi z katalogu z proweniencją."""

from __future__ import annotations

from dataclasses import replace

from application.station_templates._choices import (
    CT_OPTIONS,
    DER_FW,
    NN_CB_OPTIONS,
    PROT_FEEDER_OPTIONS,
    SN_APPARATUS_OPTIONS,
    TR_OPTIONS_POTRZEBY_WLASNE,
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
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    fw_count: int,
    fw_p_mw_each: float,
    nc_rfg_type: str,
) -> StationTemplate:
    return StationTemplate(
        id=tpl_id,
        name_pl=name_pl,
        category=TemplateCategory.WIATROWA,
        description_pl=description_pl,
        use_case_pl="Stacja przyłączeniowa turbin wiatrowych.",
        nc_rfg_type=nc_rfg_type,
        icon="station-wind",
        tags=("wiatr", "FW", "OZE", "block_transformer", f"NC_RfG_{nc_rfg_type}"),
        schema=TemplateSchema(
            transformer_options=TR_OPTIONS_POTRZEBY_WLASNE,
            sn_bays_count=TemplateParamInt(
                default=2, min_value=1, max_value=8, label_pl="Liczba pól SN"
            ),
            sn_bay_roles=(
                BayRoleSpec(role="IN", okreslenie_pl="(kolektor SN)"),
                BayRoleSpec(role="MEASUREMENT"),
            ),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            sn_bay_apparatus_options=SN_APPARATUS_OPTIONS,
            nn_feeders_count=TemplateParamInt(
                default=0, min_value=0, max_value=2, label_pl="Liczba odpływów nN"
            ),
            nn_feeder_cb_options=NN_CB_OPTIONS,
            der_options=(replace(DER_FW, default_p_mw_each=fw_p_mw_each, default_count=fw_count),),
            der_total_count=TemplateParamInt(
                default=fw_count, min_value=1, max_value=20, label_pl="Liczba turbin"
            ),
            ct_options=CT_OPTIONS,
            vt_options=VT_OPTIONS,
            protection_settings_default="tpl_der_fw",
        ),
    )


WIATROWE_TEMPLATES = (
    _wiatr(
        "tpl_wiatr_1mw_pojedyncza",
        "Turbina wiatrowa 1 MW",
        "Pojedyncza turbina 1 MW (generator 0,69 kV) z własnym transformatorem blokowym nN/SN.",
        fw_count=1,
        fw_p_mw_each=1.0,
        nc_rfg_type="B",
    ),
    _wiatr(
        "tpl_wiatr_2mw",
        "Turbina wiatrowa 2 MW",
        "Turbina 2 MW (generator 0,69 kV) z własnym transformatorem blokowym, NC RfG typ B.",
        fw_count=1,
        fw_p_mw_each=2.0,
        nc_rfg_type="B",
    ),
    _wiatr(
        "tpl_wiatr_3mw",
        "Turbina wiatrowa 3 MW",
        "Turbina 3 MW (generator 0,69 kV) z własnym transformatorem blokowym, NC RfG typ C-D "
        "z usługami systemowymi.",
        fw_count=1,
        fw_p_mw_each=3.0,
        nc_rfg_type="C",
    ),
    _wiatr(
        "tpl_wiatr_farma_5x2mw",
        "Farma wiatrowa 5× 2 MW kolektor SN",
        "Farma 10 MW (5 turbin × 2 MW, każda z własnym transformatorem blokowym) z kolektorem SN.",
        fw_count=5,
        fw_p_mw_each=2.0,
        nc_rfg_type="D",
    ),
)
