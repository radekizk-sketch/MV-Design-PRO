"""Stacje abonenckie SN z układem pomiarowym — rola C ("Odbiorcze"), 4 templates.

V12T-016 (rejestr długu): rola C miała WYŁĄCZNIE `PRZEMYSLOWA` (odbiorcy
wielkiej mocy ≥ 1 MVA). Projektant typowego odbiorcy SN (dom wielorodzinny,
mały zakład usługowy, gospodarstwo) nie miał osobnej kategorii — musiał
szukać wśród szablonów dystrybucyjnych OSD (`TYPOWA_SN_NN`), gdzie tylko 2
z 10 wariantów (1000/1600 kVA) niosą pole pomiarowe.

Wzorzec ról [IN, MEASUREMENT, TR, OUT] jest DOKŁADNIE tym samym, sprawdzonym
układem co `tpl_sn_nn_1000kva`/`tpl_sn_nn_1600kva` (V12K-333: pomiar mierzy
CAŁY i TYLKO pobór klienta, więc rozdzielnica klienta NIE prowadzi tranzytu —
`apply.py::_klasa_przylaczenia` klasyfikuje ten zestaw ról jako klasę B i
buduje stację w ODGAŁĘZIENIU, nie wcina jej w magistralę). Różnica: przekładniki
CT/VT są jawnie KLASY POMIAROWEJ (rozliczeniowej, "0.5"), nie ochronnej
("5P…") — `CT_METERING_OPTIONS`/`VT_METERING_OPTIONS` (`_choices.py`).
"""

from __future__ import annotations

from application.station_templates._choices import (
    CT_METERING_OPTIONS,
    NN_CB_OPTIONS,
    PROT_FEEDER_OPTIONS,
    SN_APPARATUS_OPTIONS,
    TR_OPTIONS_MEDIUM,
    TR_OPTIONS_MEDIUM_20KV,
    TR_OPTIONS_SMALL,
    VT_METERING_OPTIONS,
    VT_METERING_OPTIONS_20,
)
from application.station_templates.schema import (
    BayRoleSpec,
    StationTemplate,
    TemplateCategory,
    TemplateParamInt,
    TemplateSchema,
)

#: Kolejność ról DOKŁADNIE jak w `typowe_sn_nn.py` (V12K-329/330/333): pomiar
#: PRZED transformatorem, przed pomiarem WYŁĄCZNIE pole dopływowe (zero pary
#: tranzytowej w rozdzielnicy klienta).
_ROLE_ABONENCKA = (
    BayRoleSpec(role="IN"),
    BayRoleSpec(role="MEASUREMENT", okreslenie_pl="rozliczeniowe (CT/VT)"),
    BayRoleSpec(role="TR"),
    BayRoleSpec(role="OUT", okreslenie_pl="rezerwowe"),
)


def _abonencka(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    tr_options: tuple,
    feeders: int,
    vt_options: tuple = VT_METERING_OPTIONS,
    use_case: str,
) -> StationTemplate:
    return StationTemplate(
        id=tpl_id,
        name_pl=name_pl,
        category=TemplateCategory.STACJA_ABONENCKA,
        description_pl=description_pl,
        use_case_pl=use_case,
        nc_rfg_type=None,
        icon="station-metering",
        tags=("abonencka", "odbiorcza", "pomiar rozliczeniowy"),
        schema=TemplateSchema(
            transformer_options=tr_options,
            transformer_count=TemplateParamInt(
                default=1, min_value=1, max_value=1, label_pl="Liczba transformatorów"
            ),
            sn_bays_count=TemplateParamInt(
                default=4, min_value=3, max_value=6, label_pl="Liczba pól SN"
            ),
            sn_bay_roles=_ROLE_ABONENCKA,
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            sn_bay_apparatus_options=SN_APPARATUS_OPTIONS,
            nn_feeders_count=TemplateParamInt(
                default=feeders, min_value=1, max_value=8, label_pl="Liczba odpływów nN"
            ),
            nn_feeder_cb_options=NN_CB_OPTIONS,
            ct_options=CT_METERING_OPTIONS,
            vt_options=vt_options,
            protection_settings_default="tpl_feeder_15kv_typowa",
        ),
    )


STACJA_ABONENCKA_TEMPLATES = (
    _abonencka(
        "tpl_abonencka_250kva_pomiar",
        "Stacja abonencka SN 250 kVA z pomiarem rozliczeniowym",
        "Mała stacja odbiorcy SN 250 kVA z układem pomiarowo-rozliczeniowym "
        "(CT/VT kl. 0,5) w odgałęzieniu od magistrali OSD.",
        tr_options=TR_OPTIONS_SMALL,
        feeders=2,
        use_case="Gospodarstwo/mały zakład usługowy z własnym transformatorem SN/nN "
        "i rozliczeniem u dostawcy energii na stronie SN.",
    ),
    _abonencka(
        "tpl_abonencka_400kva_pomiar",
        "Stacja abonencka SN 400 kVA z pomiarem rozliczeniowym",
        "Stacja odbiorcy SN 400 kVA z układem pomiarowo-rozliczeniowym (CT/VT "
        "kl. 0,5) w odgałęzieniu od magistrali OSD.",
        tr_options=TR_OPTIONS_SMALL,
        feeders=3,
        use_case="Budynek wielorodzinny/mały zakład produkcyjny z rozliczeniem "
        "energii na stronie SN.",
    ),
    _abonencka(
        "tpl_abonencka_630kva_pomiar",
        "Stacja abonencka SN 630 kVA z pomiarem rozliczeniowym",
        "Standardowa stacja odbiorcy SN 630 kVA z układem pomiarowo-"
        "rozliczeniowym (CT/VT kl. 0,5) w odgałęzieniu od magistrali OSD.",
        tr_options=TR_OPTIONS_MEDIUM,
        feeders=4,
        use_case="Typowy odbiorca SN średniej mocy (osiedle, centrum handlowe, "
        "zakład usługowy) z rozliczeniem na stronie SN.",
    ),
    _abonencka(
        "tpl_abonencka_630kva_pomiar_20kv",
        "Stacja abonencka SN 630 kVA 20 kV z pomiarem rozliczeniowym",
        "Stacja odbiorcy w sieci 20 kV, 630 kVA, z układem pomiarowo-"
        "rozliczeniowym (CT/VT kl. 0,5, wariant 20 kV) w odgałęzieniu od "
        "magistrali OSD.",
        tr_options=TR_OPTIONS_MEDIUM_20KV,
        feeders=4,
        vt_options=VT_METERING_OPTIONS_20,
        use_case="Odbiorca SN średniej mocy w obszarze sieci 20 kV z "
        "rozliczeniem na stronie SN.",
    ),
)
