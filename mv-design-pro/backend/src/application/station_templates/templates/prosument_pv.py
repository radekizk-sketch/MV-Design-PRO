"""Stacje prosumenta PV — 6 templates (5-250 kW, NC RfG typ A-C)."""

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
            sn_bays_count=TemplateParamInt(
                default=2, min_value=2, max_value=3, label_pl="Liczba pól SN"
            ),
            # POLE TRANSFORMATOROWE (rola TR) — zmierzony brak, nie kosmetyka.
            # Stacja z transformatorem przyłączonym do szyny SN BEZ pola roli
            # `TR` jest konfiguracją niekompletną: domena melduje `W041`
            # (`enm/pole_transformatorowe.py` — jedno źródło predykatu), a
            # bramka dokumentacji wykonawczej ją odrzuca. Odejście od szyny
            # rozdzielni realizuje się POLEM, bo bez aparatu w polu nie da się
            # ani odłączyć transformatora do prac, ani zbudować selektywności
            # między nim a szyną.
            #
            # POMIAR 2026-09-11 (apply każdego z 57 szablonów przez API,
            # `engineering-readiness`): W041 dotyczył 15 szablonów w trzech
            # kategoriach — `prosument_pv` (6), `slupowa` (6), `sekcyjna` (3).
            # Pozostałe 42 mają pole TR albo transformator blokowy toru DER
            # (`Generator.blocking_transformer_ref` — jawna, zmierzona granica
            # reguły, nie cichy wyjątek).
            sn_bay_roles=(
                BayRoleSpec(role="IN", label_pl="Pole liniowe IN"),
                BayRoleSpec(role="TR", label_pl="Pole transformatorowe"),
            ),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            sn_bay_apparatus_options=SN_APPARATUS_OPTIONS,
            nn_feeders_count=TemplateParamInt(
                default=2, min_value=1, max_value=4, label_pl="Liczba odpływów nN"
            ),
            nn_feeder_cb_options=NN_CB_OPTIONS,
            der_options=(
                replace(DER_PV_NN, default_p_mw_each=pv_p_kw_each / 1000.0, default_count=pv_count),
            ),
            der_total_count=TemplateParamInt(
                default=pv_count, min_value=1, max_value=10, label_pl="Liczba falowników PV"
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
        "tpl_pv_prosument_5kw",
        "Mikroinstalacja PV 5 kW (Fronius, NC RfG typ A)",
        "Pojedyncza mikroinstalacja PV 5 kW 1-fazowa, Fronius/SMA falownik.",
        pv_count=1,
        pv_p_kw_each=5.0,
        nc_rfg_type="A",
    ),
    _prosument(
        "tpl_pv_prosument_10kw",
        "PV 10 kW prosument 1-fazowy",
        "Standardowa prosumencka 10 kW (1-fazowa, typ A).",
        pv_count=1,
        pv_p_kw_each=10.0,
        nc_rfg_type="A",
    ),
    _prosument(
        "tpl_pv_prosument_30kw",
        "PV 30 kW prosument 3-fazowy (typ A)",
        "PV 30 kW 3-fazowy, NC RfG typ A.",
        pv_count=1,
        pv_p_kw_each=30.0,
        nc_rfg_type="A",
    ),
    _prosument(
        "tpl_pv_prosument_50kw",
        "PV 50 kW prosument graniczna typ A",
        "Graniczny limit typu A: PV 50 kW (NC RfG).",
        pv_count=1,
        pv_p_kw_each=50.0,
        nc_rfg_type="A",
    ),
    _prosument(
        "tpl_pv_prosument_100kw",
        "PV 100 kW (typ B, wymaga uzgodnień)",
        "Większa instalacja 100 kW: NC RfG typ B z obowiązkiem zgłoszenia OSD.",
        pv_count=2,
        pv_p_kw_each=50.0,
        nc_rfg_type="B",
    ),
    _prosument(
        "tpl_pv_prosument_250kw",
        "PV 250 kW (typ B-C, pełne uzgodnienia)",
        "Duża instalacja 250 kW: NC RfG typ B-C z pełnymi uzgodnieniami.",
        pv_count=5,
        pv_p_kw_each=50.0,
        nc_rfg_type="B",
    ),
)
