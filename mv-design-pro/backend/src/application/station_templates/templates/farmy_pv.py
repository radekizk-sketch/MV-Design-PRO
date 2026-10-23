"""Farmy PV SN — 5 szablonów (0,66–4,95 MW, falowniki z kartą producenta, każdy z własnym
transformatorem blokowym nN/SN).

Przeprojektowanie 2026-10-15 (decyzja właściciela): skład = liczba falowników × moc z karty
producenta, bez jednostek pracujących poniżej mocy znamionowej. Dawne „500 kW / 1 / 2 / 3 /
5 MW" składały się z pozycji referencyjnej 0,5 MW bez karty; katalog z kartami ma Huawei
SUN2000-330KTL-H1 (330 kVA) i SMA Sunny Central 2200 / 2475 (2,2 / 2,475 MVA), więc moce
szablonów są wielokrotnościami tych kart. Typ modułu NC RfG wynika ze składu
(`schema.typ_modulu_nc_rfg_skladu`)."""

from __future__ import annotations

from dataclasses import replace

from application.station_templates._choices import (
    CT_OPTIONS,
    DER_PV_SN,
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
    typ_modulu_nc_rfg_skladu,
)


def _farma(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    pv_count: int,
    pv_p_mw_each: float,
) -> StationTemplate:
    der_options = (replace(DER_PV_SN, default_p_mw_each=pv_p_mw_each, default_count=pv_count),)
    nc_rfg_type = typ_modulu_nc_rfg_skladu(der_options, 15.0)
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
            transformer_options=TR_OPTIONS_POTRZEBY_WLASNE,
            sn_bays_count=TemplateParamInt(
                default=2, min_value=1, max_value=4, label_pl="Liczba pól SN"
            ),
            sn_bay_roles=(
                BayRoleSpec(role="IN", okreslenie_pl="(kierunek OSD)"),
                BayRoleSpec(role="MEASUREMENT", okreslenie_pl="(taryfa)"),
            ),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            sn_bay_apparatus_options=SN_APPARATUS_OPTIONS,
            nn_feeders_count=TemplateParamInt(
                default=0, min_value=0, max_value=2, label_pl="Liczba odpływów nN (usługi)"
            ),
            nn_feeder_cb_options=NN_CB_OPTIONS,
            der_options=der_options,
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
        "tpl_farma_pv_0p66mw",
        "Farma PV 0,66 MW, 2× Huawei SUN2000-330KTL-H1",
        "Mała farma 0,66 MW: 2 falowniki Huawei SUN2000-330KTL-H1 (330 kVA, 0,8 kV), każdy "
        "z własnym transformatorem blokowym nN/SN.",
        pv_count=2,
        pv_p_mw_each=0.33,
    ),
    _farma(
        "tpl_farma_pv_0p99mw",
        "Farma PV 0,99 MW, 3× Huawei SUN2000-330KTL-H1",
        "Farma 0,99 MW: 3 falowniki Huawei SUN2000-330KTL-H1 (330 kVA, 0,8 kV), każdy z własnym "
        "transformatorem blokowym nN/SN.",
        pv_count=3,
        pv_p_mw_each=0.33,
    ),
    _farma(
        "tpl_farma_pv_2p2mw",
        "Farma PV 2,2 MW, SMA Sunny Central 2200",
        "Farma 2,2 MW: falownik centralny SMA Sunny Central 2200 (2,2 MVA, 0,385 kV) "
        "z transformatorem blokowym nN/SN.",
        pv_count=1,
        pv_p_mw_each=2.2,
    ),
    _farma(
        "tpl_farma_pv_4p4mw",
        "Farma PV 4,4 MW, 2× SMA Sunny Central 2200",
        "Farma 4,4 MW: 2 falowniki centralne SMA Sunny Central 2200 (2,2 MVA, 0,385 kV), każdy "
        "z własnym transformatorem blokowym nN/SN.",
        pv_count=2,
        pv_p_mw_each=2.2,
    ),
    _farma(
        "tpl_farma_pv_4p95mw",
        "Farma PV 4,95 MW, 2× SMA Sunny Central 2475",
        "Farma 4,95 MW: 2 falowniki centralne SMA Sunny Central 2475 (2,475 MVA, 0,434 kV), "
        "każdy z własnym transformatorem blokowym nN/SN.",
        pv_count=2,
        pv_p_mw_each=2.475,
    ),
)
