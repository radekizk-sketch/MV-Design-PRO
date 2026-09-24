"""Rozdzielnie sieciowe RS/RSM — rola A ("Zasilanie sieci"), 3 templates.

V12T-016 (rejestr długu `docs/v12xx/REJESTR_DLUGU.md`): rola A miała ZERO
szablonów — projektant zaczynający od rozdzielni sieciowej (czysty węzeł
przełączeniowy magistrali SN, BEZ transformatora SN/nN — w odróżnieniu od
stacji RMU kategorii SEKCYJNA, które łączą sprzęgło Z lokalnym odbiorem)
nie miał od czego zacząć.

Droga zabudowy: `transformer_options=()` (pusta) → `apply.py` wysyła
`transformer: {"create": False}` do `insert_station_on_segment_sn` — DOKŁADNIE
ten sam, już przetestowany kontrakt operacji domenowej, którego dziś używa
„złącze pętlowe" bez TR (`tests/enm/test_rodzaj_pomiaru.py::
test_add_sn_bay_przyjmuje_uklad_energii_za_czysta_petla_osd`,
`tests/enm/test_catalog_gate.py::test_station_without_create_transformer_passes`).
Żadnej nowej fizyki, żadnego nowego typu elementu — węzeł SN dwusekcyjny ze
sprzęgłem (`station_type="sectional"`), bez strony nN.
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


def _rozdzielnia(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    feeder_roles: tuple[BayRoleSpec, ...],
    bays: int,
    use_case: str,
) -> StationTemplate:
    return StationTemplate(
        id=tpl_id,
        name_pl=name_pl,
        category=TemplateCategory.ROZDZIELNIA_SIECIOWA,
        description_pl=description_pl,
        use_case_pl=use_case,
        nc_rfg_type=None,
        icon="station-switching",
        tags=("rozdzielnia sieciowa", "RS", "RSM", "bez transformatora"),
        schema=TemplateSchema(
            # BRAK transformatora — węzeł czysto przełączeniowy magistrali SN
            # (`apply.py::_zastosuj_szablon_pod_blokada` wysyła
            # `transformer.create=False`, gdy `transformer_options` jest puste).
            transformer_options=(),
            transformer_count=TemplateParamInt(
                default=0, min_value=0, max_value=0, label_pl="Bez transformatora"
            ),
            sn_bays_count=TemplateParamInt(
                default=bays, min_value=3, max_value=8, label_pl="Liczba pól SN"
            ),
            sn_bay_roles=feeder_roles,
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            sn_bay_apparatus_options=SN_APPARATUS_OPTIONS,
            # Bez strony nN — rozdzielnia sieciowa nie zasila bezpośrednio odbiorów.
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


ROZDZIELNIA_SIECIOWA_TEMPLATES = (
    _rozdzielnia(
        "tpl_rs_2pola_sprzeglo",
        "Rozdzielnia sieciowa RS 2 pola liniowe + sprzęgło",
        "Węzeł przełączeniowy magistrali SN: dwie sekcje szyn, dwa pola liniowe "
        "(wejściowe i wyjściowe) i sprzęgło sekcyjne — bez transformatora SN/nN.",
        feeder_roles=(
            BayRoleSpec(role="IN", okreslenie_pl="(sekcja A)"),
            BayRoleSpec(role="OUT", okreslenie_pl="(sekcja B)"),
            BayRoleSpec(role="COUPLER", okreslenie_pl="sekcyjnego"),
        ),
        bays=3,
        use_case="Węzeł magistrali SN dzielący sieć na sekcje bez lokalnego odbioru — "
        "manewry łączeniowe, izolacja odcinków przy awarii/pracach.",
    ),
    _rozdzielnia(
        "tpl_rsm_4pola_2wyjscia",
        "Rozdzielnia sieciowa RSM 4 pola, 2 wyjścia magistralne",
        "Rozdzielnia sieciowa mała (RSM): dwie sekcje szyn ze sprzęgłem i po "
        "jednym dodatkowym polu odgałęźnym na sekcję (rozgałęzienie magistrali).",
        feeder_roles=(
            BayRoleSpec(role="IN", okreslenie_pl="(sekcja A)"),
            BayRoleSpec(role="FEEDER", okreslenie_pl="(sekcja A)"),
            BayRoleSpec(role="OUT", okreslenie_pl="(sekcja B)"),
            BayRoleSpec(role="COUPLER", okreslenie_pl="sekcyjnego"),
        ),
        bays=4,
        use_case="Punkt rozgałęzienia magistrali SN z manewrem sekcyjnym — węzeł "
        "sieciowy OSD zasilający dwa kierunki dystrybucji.",
    ),
    _rozdzielnia(
        "tpl_rs_6pola_wezel_petlowy",
        "Rozdzielnia sieciowa RS 6 pól — węzeł pętlowy N-1",
        "Rozdzielnia sieciowa większa: dwie sekcje szyn, sprzęgło, trzy pola "
        "odgałęźne na sekcji A i pole liniowe wyjściowe prowadzące do sekcji B — "
        "węzeł pętli SN z rezerwą N-1.",
        feeder_roles=(
            BayRoleSpec(role="IN", okreslenie_pl="(sekcja A)"),
            BayRoleSpec(role="FEEDER", okreslenie_pl="1 (sekcja A)"),
            BayRoleSpec(role="FEEDER", okreslenie_pl="2 (sekcja A)"),
            BayRoleSpec(role="FEEDER", okreslenie_pl="3 (sekcja A)"),
            BayRoleSpec(role="OUT", okreslenie_pl="(sekcja B)"),
            BayRoleSpec(role="COUPLER", okreslenie_pl="sekcyjnego"),
        ),
        bays=6,
        use_case="Węzeł pętli SN z wieloma odgałęzieniami dystrybucyjnymi i "
        "rezerwą N-1 przez sprzęgło sekcyjne.",
    ),
)
