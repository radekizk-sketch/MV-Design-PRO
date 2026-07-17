"""BESS magazyny energii — 5 templates (0.5-5 MW / 1-10 MWh, różne usługi)."""

from __future__ import annotations

from dataclasses import replace

from application.station_templates._choices import (
    CT_OPTIONS,
    DER_BESS_SN,
    NN_CB_OPTIONS,
    PROT_FEEDER_OPTIONS,
    TR_BLOCK_BESS_OPTIONS,
    VT_OPTIONS,
)
from application.station_templates.schema import (
    BayRoleSpec,
    StationTemplate,
    TemplateCategory,
    TemplateParamInt,
    TemplateSchema,
)


def _bess(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    bess_count: int,
    bess_p_mw_each: float,
    use_case: str,
    nc_rfg_type: str = "B",
) -> StationTemplate:
    return StationTemplate(
        id=tpl_id,
        name_pl=name_pl,
        category=TemplateCategory.BESS,
        description_pl=description_pl,
        use_case_pl=use_case,
        nc_rfg_type=nc_rfg_type,
        icon="station-bess",
        tags=("BESS", "magazyn", "OZE", f"NC_RfG_{nc_rfg_type}"),
        schema=TemplateSchema(
            transformer_options=TR_BLOCK_BESS_OPTIONS,
            sn_bays_count=TemplateParamInt(default=2, min_value=1, max_value=4, label_pl="Liczba pól SN"),
            sn_bay_roles=(
                BayRoleSpec(role="IN", label_pl="Pole liniowe IN"),
                BayRoleSpec(role="MEASUREMENT", label_pl="Pole pomiarowe + analizator"),
            ),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            nn_feeders_count=TemplateParamInt(default=0, min_value=0, max_value=2, label_pl="Liczba odpływów nN"),
            nn_feeder_cb_options=NN_CB_OPTIONS,
            der_options=(replace(DER_BESS_SN, default_p_mw_each=bess_p_mw_each, default_count=bess_count),),
            der_total_count=TemplateParamInt(
                default=bess_count, min_value=1, max_value=10, label_pl="Liczba kontenerów BESS"
            ),
            ct_options=CT_OPTIONS,
            vt_options=VT_OPTIONS,
            protection_settings_default="tpl_der_bess",
        ),
    )


# 2026-07-17 (spójność elektryczna): moc jednostkowa i liczba kontenerów są
# PROPAGOWANE do DerKindSpec (wcześniej gubione — każdy szablon wychodził z
# domyślnym 1.0 MW). Warianty 5 MW modelowane jako 2 kontenery po 2,5 MW
# (standard przemysłowy; pojedynczy blok 5 MW przez TR SN/nN 0.4 kV nie
# istnieje w typoszeregu i byłby fizycznie wątpliwy).
BESS_TEMPLATES = (
    _bess(
        "tpl_bess_500kw_1mwh",
        "BESS 0.5 MW / 1 MWh (C-rate 0.5, peak shaving)",
        "Mały magazyn 500 kW/1 MWh do peak shaving zakładu.",
        bess_count=1, bess_p_mw_each=0.5,
        use_case="Peak shaving zakładu przemysłowego, redukcja mocy szczytowej.",
    ),
    _bess(
        "tpl_bess_1mw_2mwh",
        "BESS 1 MW / 2 MWh (arbitrage)",
        "Standardowy magazyn 1 MW/2 MWh do arbitrażu cenowego.",
        bess_count=1, bess_p_mw_each=1.0,
        use_case="Arbitraż cenowy (kup tanio, sprzedaj drogo).",
    ),
    _bess(
        "tpl_bess_2mw_4mwh",
        "BESS 2 MW / 4 MWh (voltage support)",
        "BESS 2 MW/4 MWh do stabilizacji napięcia + Q services.",
        bess_count=1, bess_p_mw_each=2.0,
        use_case="Voltage support, regulacja Q dla OSD.",
        nc_rfg_type="C",
    ),
    _bess(
        "tpl_bess_5mw_10mwh_fcr_n",
        "BESS 5 MW / 10 MWh (FCR_N services)",
        "Duży magazyn 5 MW/10 MWh do usług FCR_N (rezerwa pierwotna) — 2 kontenery po 2,5 MW.",
        bess_count=2, bess_p_mw_each=2.5,
        use_case="FCR_N — automatyczna rezerwa pierwotna częstotliwości.",
        nc_rfg_type="D",
    ),
    _bess(
        "tpl_bess_5mw_5mwh_afrr",
        "BESS 5 MW / 5 MWh (C-rate 1.0, aFRR services)",
        "Magazyn 5 MW/5 MWh (C=1) do aFRR (rezerwa wtórna automatyczna) — 2 kontenery po 2,5 MW.",
        bess_count=2, bess_p_mw_each=2.5,
        use_case="aFRR — automatyczna rezerwa wtórna częstotliwości (PSE).",
        nc_rfg_type="D",
    ),
)
