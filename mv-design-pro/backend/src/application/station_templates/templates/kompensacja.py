"""Kompensacja mocy biernej SN — rola E ("Specjalne"), 3 templates.

V12T-016 (rejestr długu): rola E miała wyłącznie `SEKCYJNA`. Bateria
kondensatorów SN (kompensacja mocy biernej) nie miała żadnego szablonu, choć
katalog (`KOMPENSATOR_SN`, `mv_shunt_capacitor_catalog.py`, 5 rekordów
referencyjnych) i operacja domenowa materializująca ją do ENM
(`enm/domain_operations_v2.py::add_shunt_compensator_sn`, solver PF czyta
`shunt_capacitors` wprost) ISTNIAŁY już od dawna — brakowało wyłącznie
szablonu wiążącego je w gotowy do zastosowania pakiet.

Struktura: węzeł przelotowy magistrali SN (BEZ transformatora — jak
`ROZDZIELNIA_SIECIOWA`, `transformer.create=False`), z dodatkowym polem
odpływowym pod baterię kondensatorów. `apply.py` dokłada baterię
(`add_shunt_compensator_sn`) na szynę SN stacji PO utworzeniu stacji, w tej
samej migawce co pozostałe kroki — ten sam wzorzec co DER (krok 4).
"""

from __future__ import annotations

from application.station_templates._choices import (
    KOMPENSATOR_OPTIONS_15,
    KOMPENSATOR_OPTIONS_20,
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


def _kompensacja(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    shunt_options: tuple,
    use_case: str,
) -> StationTemplate:
    return StationTemplate(
        id=tpl_id,
        name_pl=name_pl,
        category=TemplateCategory.KOMPENSACJA,
        description_pl=description_pl,
        use_case_pl=use_case,
        nc_rfg_type=None,
        icon="station-capacitor",
        tags=("kompensacja", "bateria kondensatorów", "moc bierna", "bez transformatora"),
        schema=TemplateSchema(
            # BRAK transformatora — bateria kondensatorów dołącza się wprost
            # do szyny SN węzła przelotowego (`add_shunt_compensator_sn`).
            transformer_options=(),
            transformer_count=TemplateParamInt(
                default=0, min_value=0, max_value=0, label_pl="Bez transformatora"
            ),
            sn_bays_count=TemplateParamInt(
                default=3, min_value=3, max_value=4, label_pl="Liczba pól SN"
            ),
            sn_bay_roles=(
                BayRoleSpec(role="IN"),
                BayRoleSpec(role="OUT"),
                BayRoleSpec(role="FEEDER", okreslenie_pl="(bateria kondensatorów)"),
            ),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            sn_bay_apparatus_options=SN_APPARATUS_OPTIONS,
            nn_feeders_count=TemplateParamInt(
                default=0, min_value=0, max_value=0, label_pl="Bez odpływów nN"
            ),
            nn_feeder_cb_options=(),
            nn_load_default_kw=TemplateParamFloat(
                default=0.0, min_value=0.0, max_value=0.0, unit="kW", label_pl="Bez odbioru nN"
            ),
            shunt_capacitor_options=shunt_options,
            protection_settings_default="tpl_feeder_15kv_typowa",
        ),
    )


KOMPENSACJA_TEMPLATES = (
    _kompensacja(
        "tpl_kompensacja_0v6mvar_15kv",
        "Kompensacja mocy biernej 0,6 Mvar (15 kV)",
        "Węzeł przelotowy magistrali SN 15 kV z baterią kondensatorów 0,6 Mvar "
        "na polu odgałęźnym — kompensacja lokalna mocy biernej.",
        shunt_options=(KOMPENSATOR_OPTIONS_15[0],),  # 0,6 Mvar
        use_case="Kompensacja mocy biernej w odległym punkcie magistrali wiejskiej "
        "z niskim współczynnikiem mocy.",
    ),
    _kompensacja(
        "tpl_kompensacja_1v2mvar_15kv",
        "Kompensacja mocy biernej 1,2 Mvar (15 kV)",
        "Węzeł przelotowy magistrali SN 15 kV z baterią kondensatorów 1,2 Mvar "
        "na polu odgałęźnym — kompensacja środkowej wielkości.",
        shunt_options=KOMPENSATOR_OPTIONS_15,
        use_case="Standardowa kompensacja mocy biernej węzła dystrybucyjnego 15 kV.",
    ),
    _kompensacja(
        "tpl_kompensacja_1v8mvar_20kv",
        "Kompensacja mocy biernej 1,8 Mvar (20 kV)",
        "Węzeł przelotowy magistrali SN 20 kV z baterią kondensatorów 1,8 Mvar "
        "na polu odgałęźnym — kompensacja lokalna mocy biernej.",
        shunt_options=KOMPENSATOR_OPTIONS_20,
        use_case="Kompensacja mocy biernej węzła dystrybucyjnego w sieci 20 kV.",
    ),
)
