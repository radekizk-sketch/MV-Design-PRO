"""Stacje OZE wiatrowe — 2 szablony (turbina 2 MW, farma 5 × 2 MW).

Korekta 2026-10-15 (karta GPT-478, pkt 7.4): nazwy obiecywały modele producenta
(„Vestas V90/V112"), których pozycje katalogowe nie niosą. Każda turbina jest pozycją po
stronie nN (strona sieciowa przekształtnika pełnej mocy 0,69 kV z tabliczki pozycji — nie
napięcie generatora) z WŁASNYM transformatorem blokowym nN/SN dobieranym
z katalogu (`schema.dobor_toru_jednostki_der_sn`).

Wyjątek wiatrowy (decyzja właściciela 2026-10-15, jawny powód w
`_choices.WYJATKI_POZYCJI_BEZ_KARTY["FW"]`): katalog nie ma turbiny z kartą producenta, więc
szablony wskazują model referencyjny 2 MW. Dwa dawne szablony wycofano jawnie
(`SZABLONY_WIATROWE_WYCOFANE`, przypięte testem): nie da się ich zbudować z katalogu."""

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
    typ_modulu_nc_rfg_skladu,
)

#: Szablony wiatrowe wycofane z katalogu szablonów z powodem — identyfikator → przyczyna.
#: Pin w `test_sklad_der_szablonow_ze_zrodlem`: dopisanie danych katalogu (karta turbiny
#: ok. 1 MW, transformator blokowy > 3150 kVA) zmienia pin i przywraca szablon.
SZABLONY_WIATROWE_WYCOFANE: dict[str, str] = {
    "tpl_wiatr_1mw_pojedyncza": (
        "Katalog nie ma pozycji turbiny wiatrowej poniżej 2 MW (najmniejsza P_max pozycji "
        "WIND to 2 MW), więc szablon turbiny 1 MW zbudowałby turbinę 2 MW nastawioną na "
        "1 MW — ciche niedowymiarowanie, które decyzja właściciela z 2026-10-15 wyklucza."
    ),
    "tpl_wiatr_3mw": (
        "Turbina 3 MW ma S_n 3,3 MVA, a katalog nie ma transformatora blokowego powyżej "
        "3150 kVA (rozporządzenie 548/2014 podaje dla tych mocy tylko PEI, karty producenta "
        "brak) — tor DER-SN odmawia `converter.der_sn.dobor_tr_brak_kandydata`."
    ),
}


def _wiatr(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    fw_count: int,
    fw_p_mw_each: float,
) -> StationTemplate:
    der_options = (replace(DER_FW, default_p_mw_each=fw_p_mw_each, default_count=fw_count),)
    nc_rfg_type = typ_modulu_nc_rfg_skladu(der_options, 15.0)
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
            der_options=der_options,
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
        "tpl_wiatr_2mw",
        "Turbina wiatrowa 2 MW",
        "Turbina 2 MW (przekształtnik pełnej mocy 0,69 kV po stronie sieci, model referencyjny — brak turbiny z kartą producenta) "
        "z własnym transformatorem blokowym nN/SN.",
        fw_count=1,
        fw_p_mw_each=2.0,
    ),
    _wiatr(
        "tpl_wiatr_farma_5x2mw",
        "Farma wiatrowa 5× 2 MW kolektor SN",
        "Farma 10 MW (5 turbin × 2 MW, model referencyjny — brak turbiny z kartą producenta; "
        "każda z własnym transformatorem blokowym) z kolektorem SN.",
        fw_count=5,
        fw_p_mw_each=2.0,
    ),
)
