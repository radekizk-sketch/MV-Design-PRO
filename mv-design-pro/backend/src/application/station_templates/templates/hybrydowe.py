"""Hybrydowe PV+BESS — 5 szablonów.

Przeprojektowanie 2026-10-15 (decyzja właściciela): część PV z falowników z kartą producenta
(Huawei SUN2000-330KTL-H1, SMA Sunny Central 2200 / 2475), moc PV = liczba × moc z karty.
Część BESS wskazuje modele referencyjne — jawny wyjątek `_choices.WYJATKI_POZYCJI_BEZ_KARTY`
(katalog nie ma pozycji BESS z kartą producenta dopuszczonej do doboru)."""

from __future__ import annotations

from dataclasses import replace

from application.station_templates._choices import (
    CT_OPTIONS,
    DER_BESS_SN,
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


def _hybrid(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    pv_count: int,
    pv_p_mw_each: float,
    bess_count: int,
    bess_p_mw_each: float,
) -> StationTemplate:
    """Hybryda PV + BESS. Liczebności i moce jednostek są JAWNE per szablon — skład
    zapisany w nazwie („PV x MW + BESS y MW / z MWh”) musi wynikać z `pv_count · pv_p_mw_each`
    i `bess_count · bess_p_mw_each` (przypina `test_der_mix_integrity`)."""
    der_options = (
        replace(DER_PV_SN, default_count=pv_count, default_p_mw_each=pv_p_mw_each),
        replace(DER_BESS_SN, default_count=bess_count, default_p_mw_each=bess_p_mw_each),
    )
    nc_rfg_type = typ_modulu_nc_rfg_skladu(der_options, 15.0)
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
            transformer_options=TR_OPTIONS_POTRZEBY_WLASNE,
            sn_bays_count=TemplateParamInt(
                default=3, min_value=2, max_value=6, label_pl="Liczba pól SN"
            ),
            sn_bay_roles=(
                BayRoleSpec(role="IN"),
                BayRoleSpec(role="MEASUREMENT", okreslenie_pl="+ EMS"),
                BayRoleSpec(role="OUT", okreslenie_pl="do BESS"),
            ),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            sn_bay_apparatus_options=SN_APPARATUS_OPTIONS,
            nn_feeders_count=TemplateParamInt(
                default=0, min_value=0, max_value=2, label_pl="Liczba odpływów nN"
            ),
            nn_feeder_cb_options=NN_CB_OPTIONS,
            der_options=der_options,
            der_total_count=TemplateParamInt(
                default=pv_count + bess_count,
                min_value=2,
                max_value=20,
                label_pl="Liczba modułów DER (PV + BESS)",
            ),
            ct_options=CT_OPTIONS,
            vt_options=VT_OPTIONS,
            protection_settings_default="tpl_der_hybrid",
        ),
    )


HYBRYDOWE_TEMPLATES = (
    _hybrid(
        "tpl_hybrid_pv0p66_bess0p5",
        "Hybryda PV 0,66 MW + BESS 0,5 MW/1 MWh",
        "Mała hybryda: 2× Huawei SUN2000-330KTL-H1 (0,66 MW) + BESS 0,5 MW/1 MWh "
        "do samobilansowania.",
        pv_count=2,
        pv_p_mw_each=0.33,
        bess_count=1,
        bess_p_mw_each=0.5,
    ),
    _hybrid(
        "tpl_hybrid_pv0p99_bess1",
        "Hybryda PV 0,99 MW + BESS 1 MW/2 MWh",
        "Hybryda: 3× Huawei SUN2000-330KTL-H1 (0,99 MW) + BESS 1 MW/2 MWh.",
        pv_count=3,
        pv_p_mw_each=0.33,
        bess_count=1,
        bess_p_mw_each=1.0,
    ),
    _hybrid(
        "tpl_hybrid_pv2p2_bess1",
        "Hybryda PV 2,2 MW + BESS 1 MW/2 MWh (P>E ratio)",
        "Hybryda z większą mocą PV niż BESS: SMA Sunny Central 2200 (2,2 MW) + BESS " "1 MW/2 MWh.",
        pv_count=1,
        pv_p_mw_each=2.2,
        bess_count=1,
        bess_p_mw_each=1.0,
    ),
    _hybrid(
        "tpl_hybrid_pv4p4_bess2",
        "Hybryda PV 4,4 MW + BESS 2 MW/4 MWh",
        "Średnia hybryda: 2× SMA Sunny Central 2200 (4,4 MW) + BESS 2× 1 MW/2 MWh.",
        pv_count=2,
        pv_p_mw_each=2.2,
        bess_count=2,
        bess_p_mw_each=1.0,
    ),
    _hybrid(
        "tpl_hybrid_pv4p95_bess3",
        "Hybryda PV 4,95 MW + BESS 3 MW/6 MWh",
        "Duża hybryda: 2× SMA Sunny Central 2475 (4,95 MW) + BESS 3× 1 MW/2 MWh.",
        pv_count=2,
        pv_p_mw_each=2.475,
        bess_count=3,
        bess_p_mw_each=1.0,
    ),
)
