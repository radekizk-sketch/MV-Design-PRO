"""Stacje wnętrzowe ZKSN — 8 templates (1-2 transformatory, 2-8 pól).

Stacje wnętrzowe z dedykowanymi pomieszczeniami, ZPUE Rotoblok/Elektrometal
SafeRing/ABB UniGear ZS1 jako standardowe RMU/switchgear.
"""

from __future__ import annotations

from application.station_templates._choices import (
    CT_OPTIONS,
    NN_CB_OPTIONS,
    PROT_FEEDER_OPTIONS,
    PROT_TRANSFORMER_OPTIONS,
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


def _zksn(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    bays: int,
    feeders: int,
    tr_count: int = 1,
    tr_options: tuple = TR_OPTIONS_MEDIUM,
    manufacturer: str = "ZPUE_WLOSZCZOWA",
) -> StationTemplate:
    bay_roles = [
        BayRoleSpec(role="IN", label_pl="Pole liniowe IN"),
        BayRoleSpec(role="OUT", label_pl="Pole liniowe OUT"),
    ]
    for i in range(tr_count):
        bay_roles.append(BayRoleSpec(role="TR", label_pl=f"Pole TR {i+1}"))
    if bays > len(bay_roles):
        bay_roles.append(BayRoleSpec(role="MEASUREMENT", label_pl="Pole pomiarowe"))
    return StationTemplate(
        id=tpl_id,
        name_pl=name_pl,
        category=TemplateCategory.ZKSN_WNETRZOWA,
        description_pl=description_pl,
        use_case_pl="Stacja wnętrzowa kompaktowa, średnie/wysokie obciążenie.",
        nc_rfg_type=None,
        icon="station-indoor",
        tags=("ZKSN", "wnętrzowa", "RMU"),
        schema=TemplateSchema(
            transformer_options=tr_options,
            transformer_count=TemplateParamInt(
                default=tr_count, min_value=1, max_value=2, label_pl="Liczba transformatorów"
            ),
            sn_switchgear_default=manufacturer,
            sn_bays_count=TemplateParamInt(
                default=bays, min_value=2, max_value=10, label_pl="Liczba pól SN"
            ),
            sn_bay_roles=tuple(bay_roles),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            nn_feeders_count=TemplateParamInt(
                default=feeders, min_value=2, max_value=12, label_pl="Liczba odpływów nN"
            ),
            nn_feeder_cb_options=NN_CB_OPTIONS,
            ct_options=CT_OPTIONS,
            vt_options=VT_OPTIONS,
            protection_settings_default="tpl_feeder_15kv_typowa",
        ),
    )


ZKSN_WNETRZOWE_TEMPLATES = (
    _zksn(
        "tpl_zksn_2pole_630kva",
        "ZKSN 2-pole, 630 kVA, ZPUE Rotoblok",
        "Podstawowa ZKSN: 2 pola liniowe + 1 pole TR 630 kVA.",
        bays=3, feeders=4,
    ),
    _zksn(
        "tpl_zksn_3pole_1000kva",
        "ZKSN 3-pole, 1000 kVA, Elektrometal",
        "Średnia ZKSN: 3 pola SN + TR 1000 kVA.",
        bays=4, feeders=5,
        manufacturer="ELEKTROMETAL",
    ),
    _zksn(
        "tpl_zksn_4pole_1600kva",
        "ZKSN 4-pole, 1600 kVA, ABB SafeRing",
        "Duża ZKSN: 4 pola SN + TR 1600 kVA, ABB switchgear.",
        bays=5, feeders=6,
        manufacturer="ABB",
    ),
    _zksn(
        "tpl_zksn_6pole_2x630kva",
        "ZKSN 6-pole, 2× TR 630 kVA równolegle",
        "Redundancja N+1: 2 transformatory 630 kVA pracujące równolegle.",
        bays=6, feeders=8, tr_count=2,
    ),
    _zksn(
        "tpl_zksn_8pole_2x1000kva_coupler",
        "ZKSN 8-pole, 2× TR 1000 kVA z couplerem",
        "Pełna redundancja: 2 TR + bus coupler do automatyki SZR.",
        bays=8, feeders=8, tr_count=2,
    ),
    _zksn(
        "tpl_zksn_pole_pomiarowe",
        "ZKSN z polem pomiarowym (VT 3-phase + CT + licznik)",
        "Pole pomiarowe do rozliczeń z OSD (taryfa A21/B21).",
        bays=5, feeders=5,
    ),
    _zksn(
        "tpl_zksn_pole_lukowe",
        "ZKSN z ogranicznikiem łukowym (arc protection)",
        "Zabezpieczenie łukowe (arc fault) per pole — wymagane PN-EN 62271-200.",
        bays=4, feeders=5,
    ),
    _zksn(
        "tpl_zksn_pole_lacznikowe",
        "ZKSN z polem łącznikowym (bus coupler)",
        "Bus coupler do izolacji sekcji przy konserwacji.",
        bays=6, feeders=6,
    ),
)
