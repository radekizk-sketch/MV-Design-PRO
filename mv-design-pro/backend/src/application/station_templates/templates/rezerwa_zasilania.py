"""Rezerwa zasilania SN (pole rezerwowe) — rola E ("Specjalne"), 3 templates.

V12T-016 (rejestr długu): rola E miała wyłącznie `SEKCYJNA` (stacje sekcyjne
Z transformatorem — RMU łączące sprzęgło z lokalnym odbiorem, np.
`tpl_petla_szr` w `sekcyjne.py`). Brakowało wariantu BEZ transformatora: węzeł
SN dający dodatkowe, zasilane z DRUGIEGO kierunku pole (rezerwa) — węzeł
sieciowy dla SZR (samoczynne załączenie rezerwy), bez lokalnego odbioru.

Struktura jak `ROZDZIELNIA_SIECIOWA` (dwusekcyjna, sprzęgło, bez TR —
`transformer.create=False`), ale pole drugiego dopływu jest jawnie oznaczone
jako REZERWOWE (normalnie otwarte, zasilanie z innego kierunku sieci) —
distinct od RS/RSM, który jest ogólnym węzłem przełączeniowym magistrali.
"""

from __future__ import annotations

from application.station_templates._choices import (
    PROT_FEEDER_OPTIONS,
    SN_APPARATUS_OPTIONS,
)
from application.station_templates.schema import (
    BayRoleSpec,
    StationTemplate,
    TemplateCategory,
    TemplateParamFloat,
    TemplateParamInt,
    TemplateSchema,
)


def _rezerwa(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    bay_roles: tuple[BayRoleSpec, ...],
    bays: int,
    use_case: str,
) -> StationTemplate:
    return StationTemplate(
        id=tpl_id,
        name_pl=name_pl,
        category=TemplateCategory.REZERWA_ZASILANIA,
        description_pl=description_pl,
        use_case_pl=use_case,
        nc_rfg_type=None,
        icon="station-reserve",
        tags=("rezerwa zasilania", "SZR", "pole rezerwowe", "bez transformatora"),
        schema=TemplateSchema(
            # BRAK transformatora — węzeł rezerwy zasilania jest czysto
            # przełączeniowy (jak ROZDZIELNIA_SIECIOWA).
            transformer_options=(),
            transformer_count=TemplateParamInt(
                default=0, min_value=0, max_value=0, label_pl="Bez transformatora"
            ),
            sn_bays_count=TemplateParamInt(
                default=bays, min_value=3, max_value=6, label_pl="Liczba pól SN"
            ),
            sn_bay_roles=bay_roles,
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            sn_bay_apparatus_options=SN_APPARATUS_OPTIONS,
            nn_feeders_count=TemplateParamInt(
                default=0, min_value=0, max_value=0, label_pl="Bez odpływów nN"
            ),
            nn_feeder_cb_options=(),
            nn_load_default_kw=TemplateParamFloat(
                default=0.0, min_value=0.0, max_value=0.0, unit="kW", label_pl="Bez odbioru nN"
            ),
            protection_settings_default="tpl_feeder_15kv_sectional",
        ),
    )


REZERWA_ZASILANIA_TEMPLATES = (
    _rezerwa(
        "tpl_rezerwa_2kierunki_sprzeglo",
        "Rezerwa zasilania — dwa kierunki + sprzęgło",
        "Węzeł SN z dwoma niezależnymi kierunkami zasilania (podstawowy i "
        "rezerwowy) i sprzęgłem sekcyjnym — gotowy punkt pod automatykę SZR, "
        "bez transformatora.",
        bay_roles=(
            BayRoleSpec(role="IN", label_pl="Pole liniowe IN — zasilanie podstawowe"),
            BayRoleSpec(role="OUT", label_pl="Pole liniowe OUT — zasilanie rezerwowe"),
            BayRoleSpec(role="COUPLER", label_pl="Pole sprzęgła (SZR)"),
        ),
        bays=3,
        use_case="Punkt sieci wymagający ciągłości zasilania (szpital, oczyszczalnia, "
        "obiekt użyteczności publicznej) zasilany dwustronnie z automatyką SZR.",
    ),
    _rezerwa(
        "tpl_rezerwa_2kierunki_1odplyw",
        "Rezerwa zasilania — dwa kierunki + 1 odpływ",
        "Węzeł SN z dwoma kierunkami zasilania, sprzęgłem sekcyjnym i jednym "
        "dodatkowym polem odpływowym dla odbiorcy krytycznego.",
        bay_roles=(
            BayRoleSpec(role="IN", label_pl="Pole liniowe IN — zasilanie podstawowe"),
            BayRoleSpec(role="FEEDER", label_pl="Pole odpływowe (odbiorca krytyczny)"),
            BayRoleSpec(role="OUT", label_pl="Pole liniowe OUT — zasilanie rezerwowe"),
            BayRoleSpec(role="COUPLER", label_pl="Pole sprzęgła (SZR)"),
        ),
        bays=4,
        use_case="Zasilanie dwustronne obiektu krytycznego z odgałęzieniem odbioru "
        "na jednej z sekcji.",
    ),
    _rezerwa(
        "tpl_rezerwa_2kierunki_2odplywy",
        "Rezerwa zasilania — dwa kierunki + 2 odpływy",
        "Rozbudowany węzeł SN z dwoma kierunkami zasilania, sprzęgłem "
        "sekcyjnym i dwoma dodatkowymi polami odpływowymi na sekcji "
        "podstawowej (sekcja A).",
        bay_roles=(
            BayRoleSpec(role="IN", label_pl="Pole liniowe IN — zasilanie podstawowe"),
            BayRoleSpec(role="FEEDER", label_pl="Pole odpływowe 1 (sekcja A)"),
            BayRoleSpec(role="FEEDER", label_pl="Pole odpływowe 2 (sekcja A)"),
            BayRoleSpec(role="OUT", label_pl="Pole liniowe OUT — zasilanie rezerwowe"),
            BayRoleSpec(role="COUPLER", label_pl="Pole sprzęgła (SZR)"),
        ),
        bays=5,
        use_case="Węzeł zasilania rezerwowego obsługujący kilku odbiorców "
        "krytycznych na sekcji zasilania podstawowego.",
    ),
)
