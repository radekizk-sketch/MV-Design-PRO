"""Stacje słupowe ZSP — 6 templates (50-400 kVA, opcja prosument).

Stacje słupowe (poletowe) używane w terenach wiejskich. Konfiguracja
zazwyczaj prostsza: 1 pole liniowe IN, 2-4 odpływy nN.
"""

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
    obciazenie_odplywu_param,
    typ_modulu_nc_rfg_skladu,
)


def _slupowa(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    default_feeders: int,
    obciazenie_odplywu_kw: float = 50.0,
    pv_count: int = 0,
) -> StationTemplate:
    # Prosument: falowniki SMA Sunny Tripower 10.0 (karta producenta) — moc = liczba × 10 kW.
    der_options = (replace(DER_PV_NN, default_count=pv_count),) if pv_count else ()
    nc_rfg_type = typ_modulu_nc_rfg_skladu(der_options, 0.4) if der_options else None
    der_count = TemplateParamInt(
        default=pv_count,
        min_value=0,
        max_value=10,
        label_pl="Liczba falowników PV",
    )
    return StationTemplate(
        id=tpl_id,
        name_pl=name_pl,
        category=TemplateCategory.SLUPOWA,
        description_pl=description_pl,
        use_case_pl="Stacja słupowa terenowa, niska gęstość odbiorów.",
        nc_rfg_type=nc_rfg_type,
        icon="station-pole",
        # Znacznik typu modułu jak w pozostałych szablonach z DER (jedna prawda z `nc_rfg_type`).
        tags=("słupowa", "ZSP", "wiejska", *((f"NC_RfG_{nc_rfg_type}",) if nc_rfg_type else ())),
        schema=TemplateSchema(
            transformer_options=TR_OPTIONS_SMALL,
            sn_switchgear_manufacturers=("ZPUE_WLOSZCZOWA", "ELEKTROMETAL"),
            sn_switchgear_default="ZPUE_WLOSZCZOWA",
            sn_bays_count=TemplateParamInt(
                default=1, min_value=1, max_value=2, label_pl="Liczba pól SN"
            ),
            sn_bay_roles=(BayRoleSpec(role="IN"),),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            sn_bay_apparatus_options=SN_APPARATUS_OPTIONS,
            nn_feeders_count=TemplateParamInt(
                default=default_feeders, min_value=1, max_value=4, label_pl="Liczba odpływów nN"
            ),
            nn_feeder_cb_options=NN_CB_OPTIONS,
            nn_load_default_kw=obciazenie_odplywu_param(obciazenie_odplywu_kw),
            der_options=der_options,
            der_total_count=der_count,
            ct_options=CT_OPTIONS,
            vt_options=VT_OPTIONS,
            protection_settings_default="tpl_feeder_15kv_typowa",
        ),
    )


SLUPOWE_TEMPLATES = (
    _slupowa(
        "tpl_slupowa_50kva",
        "Stacja słupowa 50 kVA, 1 pole, 2 odpływy",
        "Mała wieś / kolonia (50 kVA) — słup pojedynczy.",
        default_feeders=2,
        # Transformator 63 kVA (typoszereg 50 kVA nie istnieje w katalogu): 2 × 20 kW przy
        # cosφ 0,95 = 42 kVA. Dawne 2 × 50 kW (105 kVA) przekraczały transformator, który
        # szablon obiecuje nazwą (pomiar 2026-10-15).
        obciazenie_odplywu_kw=20.0,
    ),
    _slupowa(
        "tpl_slupowa_100kva",
        "Stacja słupowa 100 kVA, 1 pole, 2 odpływy",
        "Standardowa wieś (100 kVA).",
        default_feeders=2,
        # 2 × 45 kW przy cosφ 0,95 = 95 kVA ≤ 100 kVA (dawne 2 × 50 kW = 105 kVA).
        obciazenie_odplywu_kw=45.0,
    ),
    _slupowa(
        "tpl_slupowa_160kva",
        "Stacja słupowa 160 kVA, 1 pole, 3 odpływy",
        "Wieś 160 kVA z odpływami w 3 kierunkach.",
        default_feeders=3,
    ),
    _slupowa(
        "tpl_slupowa_250kva",
        "Stacja słupowa 250 kVA z platformą, 3 odpływy",
        "Większa wieś 250 kVA, słup z platformą.",
        default_feeders=3,
    ),
    _slupowa(
        "tpl_slupowa_400kva",
        "Stacja słupowa 400 kVA wzmocniona, 4 odpływy",
        "Wieś o wysokiej gęstości odbiorów (400 kVA, słup wzmocniony).",
        default_feeders=4,
    ),
    _slupowa(
        "tpl_slupowa_400kva_prosument",
        "Stacja słupowa 400 kVA + PV prosument 50 kW",
        "400 kVA z instalacją prosumencką PV 50 kW: 5 falowników SMA Sunny Tripower 10.0 "
        "(10 kVA, 0,4 kV).",
        default_feeders=4,
        pv_count=5,
    ),
)
