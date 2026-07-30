"""Typowe stacje dystrybucyjne SN/nN — 10 templates (100-2500 kVA).

Standardowe dystrybucyjne dla DSO, OSD, gospodarstw wiejskich i miejskich.
Dyn11 vector group, 15/0.4 kV, ZPUE Rotoblok RMU domyślnie.
"""

from __future__ import annotations

from application.station_templates._choices import (
    CT_OPTIONS,
    NN_CB_OPTIONS,
    PROT_FEEDER_OPTIONS,
    SN_APPARATUS_OPTIONS,
    TR_OPTIONS_LARGE,
    TR_OPTIONS_MEDIUM,
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


def _base_bay_roles() -> tuple[BayRoleSpec, ...]:
    return (
        BayRoleSpec(role="IN", label_pl="Pole liniowe IN"),
        BayRoleSpec(role="OUT", label_pl="Pole liniowe OUT"),
        BayRoleSpec(role="TR", label_pl="Pole transformatorowe"),
    )


def _typowa(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    tr_options: tuple,
    default_feeders: int,
    default_bays: int,
    max_feeders: int = 8,
    icon: str = "station-distribution",
    use_case: str = "Standardowa dystrybucyjna terenowa.",
) -> StationTemplate:
    return StationTemplate(
        id=tpl_id,
        name_pl=name_pl,
        category=TemplateCategory.TYPOWA_SN_NN,
        description_pl=description_pl,
        use_case_pl=use_case,
        nc_rfg_type=None,
        icon=icon,
        tags=("dystrybucyjna", "typowa", "15kV"),
        schema=TemplateSchema(
            transformer_options=tr_options,
            transformer_count=TemplateParamInt(
                default=1, min_value=1, max_value=2, label_pl="Liczba transformatorów"
            ),
            sn_bays_count=TemplateParamInt(
                default=default_bays, min_value=1, max_value=8, label_pl="Liczba pól SN"
            ),
            sn_bay_roles=_base_bay_roles(),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            sn_bay_apparatus_options=SN_APPARATUS_OPTIONS,
            nn_feeders_count=TemplateParamInt(
                default=default_feeders,
                min_value=1,
                max_value=max_feeders,
                label_pl="Liczba odpływów nN",
            ),
            nn_feeder_cb_options=NN_CB_OPTIONS,
            ct_options=CT_OPTIONS,
            vt_options=VT_OPTIONS,
            protection_settings_default="tpl_feeder_15kv_typowa",
        ),
    )


TYPOWE_SN_NN_TEMPLATES = (
    _typowa(
        "tpl_sn_nn_100kva",
        "Stacja SN/nN 100 kVA, 1 pole, 2 odpływy",
        "Mała stacja terenowa 100 kVA z pojedynczym polem liniowym IN.",
        tr_options=TR_OPTIONS_SMALL,
        default_feeders=2,
        default_bays=1,
    ),
    _typowa(
        "tpl_sn_nn_160kva",
        "Stacja SN/nN 160 kVA, 2 pola, 2 odpływy",
        "Standardowa 160 kVA z polami IN/OUT (przelot).",
        tr_options=TR_OPTIONS_SMALL,
        default_feeders=2,
        default_bays=2,
    ),
    _typowa(
        "tpl_sn_nn_250kva",
        "Stacja SN/nN 250 kVA, 2 pola, 3 odpływy",
        "Standardowa wiejska 250 kVA, 3 grupy odbiorów.",
        tr_options=TR_OPTIONS_SMALL,
        default_feeders=3,
        default_bays=2,
    ),
    _typowa(
        "tpl_sn_nn_400kva",
        "Stacja SN/nN 400 kVA, 3 pola, 3 odpływy",
        "Dystrybucyjna 400 kVA z dodatkowym polem TR.",
        tr_options=TR_OPTIONS_SMALL,
        default_feeders=3,
        default_bays=3,
    ),
    _typowa(
        "tpl_sn_nn_630kva",
        "Stacja SN/nN 630 kVA z RMU 3-pole, 4 odpływy",
        "Najbardziej typowa dystrybucyjna 630 kVA, ZPUE Rotoblok RMU.",
        tr_options=TR_OPTIONS_MEDIUM,
        default_feeders=4,
        default_bays=3,
    ),
    _typowa(
        "tpl_sn_nn_1000kva",
        "Stacja SN/nN 1000 kVA, RMU 4-pole + pomiary, 4 odpływy",
        "1000 kVA z polem pomiarowym i 4 odpływami.",
        tr_options=TR_OPTIONS_MEDIUM,
        default_feeders=4,
        default_bays=4,
    ),
    _typowa(
        "tpl_sn_nn_1250kva",
        "Stacja SN/nN 1250 kVA, RMU 5-pole, 5 odpływów",
        "1250 kVA z większą rozdzielnią + 5 grup odbiorów.",
        tr_options=TR_OPTIONS_MEDIUM,
        default_feeders=5,
        default_bays=5,
    ),
    _typowa(
        "tpl_sn_nn_1600kva",
        "Stacja SN/nN 1600 kVA z VT, RMU 5-pole, 6 odpływów",
        "1600 kVA wnętrzowa, z polem pomiarowym VT + 6 odpływów.",
        tr_options=TR_OPTIONS_MEDIUM,
        default_feeders=6,
        default_bays=5,
    ),
    _typowa(
        "tpl_sn_nn_2000kva",
        "Stacja SN/nN 2000 kVA, dual TR option, 8 odpływów",
        "Duża stacja przemysłowa 2000 kVA, możliwość dual-TR (N+1 redundancja).",
        tr_options=TR_OPTIONS_LARGE,
        default_feeders=8,
        default_bays=6,
        max_feeders=8,
    ),
    _typowa(
        "tpl_sn_nn_2500kva",
        "Stacja SN/nN 2500 kVA, RMU 6-pole + coupler, 8 odpływów",
        "Flagship 2500 kVA z 6-polową rozdzielnią + busbar coupler.",
        tr_options=TR_OPTIONS_LARGE,
        default_feeders=8,
        default_bays=6,
        max_feeders=8,
    ),
)
