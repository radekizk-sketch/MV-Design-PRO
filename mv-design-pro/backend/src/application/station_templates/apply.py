"""Station Template Apply orchestrator — K30-20.

Translates a template (z editable schema) + user param overrides into
sequence of domain operations applied via execute_domain_operation.

Operation sequence:
1. insert_station_on_segment_sn (creates station + bays + transformer)
2. add_nn_outgoing_field × N (additional feeders beyond default)
3. add_converter_source × M (DER inverters per kind + count)

Returns: { created_element_refs, snapshot, readiness }
"""

from __future__ import annotations

import logging
from typing import Any

from application.station_templates.schema import (
    StationTemplate,
    TemplateCategory,
    _der_catalog_for_power,
    _moc_wymagana_jednostki_der_mva,
    _opcja_transformatora_dla_wymaganej_mocy,
    _opcja_transformatora_wg_tokenu_id,
    resolve_template_default_shunt_choice,
    template_wchodzi_w_segment,
    transformer_voltages_kv,
)
from enm.domain_operations import execute_domain_operation, nazwa_roli_pola_sn
from enm.models import EnergyNetworkModel
from enm.rola_pola_sn import kanoniczna_rola_pola_sn
from enm.slownik_komunikatow import nazwa_rodzaju_galezi, opis_obiektu, opis_pozycji_katalogu
from enm.store import blokada_twin
from network_model.pochodne import mva_na_kva

logger = logging.getLogger(__name__)


class TemplateApplyError(Exception):
    """Apply pipeline failure."""

    def __init__(self, code: str, message_pl: str) -> None:
        super().__init__(message_pl)
        self.code = code
        self.message_pl = message_pl


def apply_template_to_case(
    *,
    template: StationTemplate,
    klucz_twin: str,
    target_segment_id: str | None = None,
    insert_at_ratio: float = 0.5,
    params_override: dict[str, Any] | None = None,
    catalog_profile: str | None = None,
) -> dict[str, Any]:
    """Apply template do active ENM. Returns aggregated result.

    `klucz_twin` — klucz magazynu ENM (Canonical Project Twin, CV-1-W),
    przetlumaczony z `case_id` na granicy API (`api/station_templates.py`).

    Flow:
    1. Load case ENM
    2. Build insert_station_on_segment_sn payload z template defaults + overrides
    3. Apply op (creates station + bays + transformer atomically)
    4. Chain additional nN feeders (jeśli nn_feeders_count > default)
    5. Chain DER additions per template.schema.der_options
    6. Persist final ENM

    `target_segment_id` jest `None` WYŁĄCZNIE dla `category == GPZ_110_SN`
    (V12T-016, rola A): GPZ jest KORZENIEM modelu — nie wstawia się „w
    segment", bo żadnego jeszcze nie ma (`add_grid_source_sn`, nie
    `insert_station_on_segment_sn`). Dla pozostałych kategorii `None` kończy
    się jawnym błędem PRZED jakąkolwiek mutacją modelu (addytywne pole
    kontraktu API — `ApplyTemplateRequest.target_segment_id` przyjmuje `None`
    tylko dla tej jednej kategorii, sprawdzone w `api/station_templates.py`).

    WSPOLBIEZNOSC (defekt D4 audytu 2026-08-01). Koncowka `POST
    /api/station-templates/{id}/apply` jest zdefiniowana jako `def`, wiec Starlette
    wykonuje ja w PULI WATKOW — dwa zatwierdzenia szablonu na tym samym przypadku
    biegly naprawde rownolegle. Kroki 1-6 czytaja model raz i zapisuja go na koncu,
    wiec bez serializacji drugi zapis nadpisywal caly dorobek pierwszego (zmierzone:
    4 zadania po HTTP 200, w modelu przybywala JEDNA stacja). Blokada obejmuje CALY
    cykl, a nie samo `set_enm` — blokada zalozona dopiero na zapisie nie pomaga, bo
    stary model zostal odczytany wczesniej. Zamiana `def` na `async def` NIE jest
    naprawa: chowa wyscig za petla zdarzen zamiast go usunac.

    Blokada jest per przypadek obliczeniowy — zastosowania szablonu na ROZNYCH
    przypadkach nadal biegna rownolegle.
    """
    if template_wchodzi_w_segment(template) and not target_segment_id:
        raise TemplateApplyError(
            code="template.target_segment_required",
            message_pl=(
                f"Szablon „{template.name_pl}” wstawia się w istniejący odcinek SN — "
                "wskaż odcinek magistrali, w który ma zostać wstawiona stacja."
            ),
        )
    if not template_wchodzi_w_segment(template) and target_segment_id:
        # DEFEKT ZNALEZIONY PRZEZ NIEZMIENNIK E2E (2026-09-17): żądanie mówiło
        # „wstaw w odcinek X", a produkt budował NOWY korzeń modelu (GPZ tworzy
        # własną wyspę przez `add_grid_source_sn`) i milczał o tej różnicy —
        # projektant wybierający szablon GPZ w kreatorze wcięcia w magistralę
        # 15 kV dostawał osobną wyspę 20 kV zamiast stacji w swojej magistrali.
        # Ciche rozejście się żądania z wykonaniem jest zakazane: odmowa NAZWANA
        # zamiast domysłu, a kreator wcięcia nie oferuje już tej kategorii.
        raise TemplateApplyError(
            code="template.korzen_modelu_nie_wchodzi_w_segment",
            message_pl=(
                f"Szablon „{template.name_pl}” to stacja zasilająca (GPZ 110/SN) — "
                "jest korzeniem modelu, a nie stacją wstawianą w istniejący "
                "odcinek magistrali. Zbuduj ją jako źródło zasilania sieci "
                "(bez wskazywania odcinka)."
            ),
        )
    with blokada_twin(klucz_twin):
        if not template_wchodzi_w_segment(template):
            return _zastosuj_gpz_pod_blokada(
                template=template,
                klucz=klucz_twin,
                params_override=params_override,
                catalog_profile=catalog_profile,
            )
        # Zawężenie typu dla mypy: odrzucone wyżej dla WSZYSTKICH kategorii
        # poza GPZ_110_SN (obsłużoną w gałęzi powyżej) — w tym miejscu
        # `target_segment_id` jest zawsze niepustym `str`.
        assert target_segment_id
        return _zastosuj_szablon_pod_blokada(
            template=template,
            klucz=klucz_twin,
            target_segment_id=target_segment_id,
            insert_at_ratio=insert_at_ratio,
            params_override=params_override,
            catalog_profile=catalog_profile,
        )


#: GPZ 2-sekcyjny (układ H5 + mostek) — sekcje FIXED na 2 dla WSZYSTKICH
#: szablonów `GPZ_110_SN` (V12T-016): to definiująca cecha tej kategorii
#: (nazwa/opis KAŻDEGO szablonu obiecuje „2-sekcyjny"), nie parametr do
#: nadpisania — `add_grid_source_sn` buduje sprzęgło międzysekcyjne
#: automatycznie dla `sections_count >= 2`.
_GPZ_SECTIONS_COUNT = 2


def _zastosuj_gpz_pod_blokada(
    *,
    template: StationTemplate,
    klucz: str,
    params_override: dict[str, Any] | None,
    catalog_profile: str | None,
) -> dict[str, Any]:
    """Zastosuj szablon GPZ (rola A, V12T-016) — `add_grid_source_sn`, KORZEŃ
    modelu, nie wcięcie w segment.

    Impedancja układu WN/SN NIE dubluje się (patrz `templates/gpz_110_sn.py`
    docstring): równoważnik systemowy (`grid_source_options`, ZRODLO_SN) niesie
    Sk3/R/X widziane z szyny SN, transformator(y) WN/SN materializują się OBOK
    (tabliczka + SLD). Uziemienie punktu neutralnego: `isolated` — jedyny
    wybór bez fabrykowanego R/X (najczęstszy w sieciach SN 15/20 kV).
    """
    overrides = params_override or {}

    from api.enm import _get_enm, _set_enm

    enm = _get_enm(klucz)
    enm_dict: dict[str, Any] = enm.model_dump(mode="json")

    transformer_ref = _resolve_transformer_ref_for_template(
        template, overrides=overrides, catalog_profile=catalog_profile
    )
    if not transformer_ref:
        raise TemplateApplyError(
            code="template.transformer_catalog_missing",
            message_pl=f"Szablon „{template.name_pl}” nie wskazuje transformatora WN/SN.",
        )
    source_ref = overrides.get("grid_source_ref") or _cascade_manufacturer_choice(
        template.schema.grid_source_options, catalog_profile
    )
    if not source_ref:
        raise TemplateApplyError(
            code="template.grid_source_catalog_missing",
            message_pl=(
                f"Szablon „{template.name_pl}” nie wskazuje warunków zasilania GPZ (typ z katalogu "
                "źródeł zasilania SN)."
            ),
        )
    apparatus_ref = overrides.get("sn_bay_apparatus_ref") or _cascade_manufacturer_choice(
        template.schema.sn_bay_apparatus_options, catalog_profile
    )
    if not apparatus_ref:
        raise TemplateApplyError(
            code="template.sn_bay_apparatus_missing",
            message_pl=f"Szablon „{template.name_pl}” nie wskazuje aparatu pól liniowych GPZ.",
        )
    transformer_count = int(
        overrides.get("transformer_count", template.schema.transformer_count.default)
    )
    line_fields_per_section = int(
        overrides.get("sn_bays_count", template.schema.sn_bays_count.default)
    )
    voltage_kv = transformer_voltages_kv(transformer_ref)[1]
    if voltage_kv is None:
        raise TemplateApplyError(
            code="template.transformer_catalog_missing",
            message_pl=(
                f"Szablon „{template.name_pl}”: katalog nie ma napięcia dolnego strony "
                f"transformatora ({opis_pozycji_katalogu(transformer_ref, None, 'typ')})."
            ),
        )

    payload = {
        "name_pl": template.name_pl,
        "source_name": template.name_pl,
        "voltage_kv": voltage_kv,
        "catalog_ref": source_ref,
        "sections_count": _GPZ_SECTIONS_COUNT,
        "transformer_count": transformer_count,
        "transformer_catalog_ref": transformer_ref,
        "line_fields_count": line_fields_per_section,
        "gpz_line_field_apparatus": {
            "catalog_ref": apparatus_ref,
            "apparatus_kind": "BREAKER",
        },
        # Sieć izolowana — najczęstszy wybór polskich sieci SN 15/20 kV, bez
        # fabrykowanego R/X rezystora/dławika (katalog produkcyjny go nie niesie).
        "grounding": {"type": "isolated"},
    }
    result = execute_domain_operation(
        enm_dict=enm_dict, op_name="add_grid_source_sn", payload=payload
    )
    if result.get("error"):
        raise TemplateApplyError(
            code=result.get("error_code", "template.gpz_insert_failed"),
            message_pl=result.get("error") or "Utworzenie GPZ z szablonu nie powiodło się.",
        )
    enm_dict = result.get("snapshot") or enm_dict
    created_refs = (result.get("changes") or {}).get("created_element_ids") or []
    station_ref = _ref_wyboru(result)
    operations_log = [{"op": "add_grid_source_sn", "created": created_refs}]

    try:
        new_enm = EnergyNetworkModel.model_validate(enm_dict)
        saved = _set_enm(klucz, new_enm)
        enm_dict = saved.model_dump(mode="json")
    except Exception as exc:
        logger.exception("Zapis modelu po zastosowaniu szablonu '%s' nie powiódł się", template.id)
        raise TemplateApplyError(
            code="template.persist_failed",
            message_pl=(
                "Nie udało się zapisać modelu sieci po zastosowaniu szablonu — "
                "model pozostał bez zmian. Powtórz operację; jeśli błąd wraca, "
                "zgłoś go administratorowi (szczegóły są w dzienniku serwera)."
            ),
        ) from exc

    return {
        "template_id": template.id,
        "template_name_pl": template.name_pl,
        "station_ref": station_ref,
        "created_element_refs": created_refs,
        "operations_log": operations_log,
        "catalog_profile_applied": catalog_profile,
        "snapshot_hash": enm_dict.get("header", {}).get("hash_sha256"),
    }


def _zastosuj_szablon_pod_blokada(
    *,
    template: StationTemplate,
    klucz: str,
    target_segment_id: str,
    insert_at_ratio: float,
    params_override: dict[str, Any] | None,
    catalog_profile: str | None,
) -> dict[str, Any]:
    overrides = params_override or {}

    # Avoid circular import — import here
    from api.enm import _get_enm, _set_enm

    enm = _get_enm(klucz)
    enm_dict: dict[str, Any] = enm.model_dump(mode="json")

    created_refs: list[str] = []
    operations_log: list[dict[str, Any]] = []

    # Step 1: insert_station_on_segment_sn payload
    sn_bays_count = int(overrides.get("sn_bays_count", template.schema.sn_bays_count.default))
    nn_feeders_default = int(template.schema.nn_feeders_count.default)
    nn_feeders_requested = int(overrides.get("nn_feeders_count", nn_feeders_default))
    # K30-26: manufacturer cascade — uses catalog_profile gdy user nie override TR
    transformer_ref = _resolve_transformer_ref_for_template(
        template,
        overrides=overrides,
        catalog_profile=catalog_profile,
    )

    sn_bay_roles = _resolve_sn_bay_roles(template, sn_bays_count)
    # B-12: aparat pola SN pochodzi z JAWNEGO wskazania (override projektanta →
    # opcje roli → wspólne opcje szablonu). Brak wskazania = błąd szablonu,
    # nigdy zaszyty typ.
    sn_field_specs = _resolve_sn_field_specs(
        template,
        bay_roles=sn_bay_roles,
        overrides=overrides,
        catalog_profile=catalog_profile,
    )
    cb_catalog = overrides.get("nn_feeder_cb_ref") or _cascade_manufacturer_choice(
        template.schema.nn_feeder_cb_options, catalog_profile
    )
    nn_feeder_specs = [
        {
            "feeder_role": "ODPLYW_NN",
            "catalog_bindings": _catalog_binding("APARAT_NN", cb_catalog),
        }
        for _ in range(max(0, nn_feeders_requested))
    ]

    nn_voltage_kv = transformer_voltages_kv(transformer_ref)[1] or 0.4
    station_spec = {
        "name_pl": template.name_pl,
        # BEZ `sn_voltage_kv` jawnego (KLASA NIE INSTANCJA, V12T-016): sztywne
        # `15` przesłaniało topologiczne dziedziczenie napięcia z segmentu
        # (`insert_station_on_segment_sn`: „Napięcia — topologiczne
        # dziedziczenie z segmentu, brak domyślnych" — `station.get(
        # "sn_voltage_kv")` wygrywa z dziedziczeniem, gdy jest liczbą > 0).
        # Zmierzone przy budowie szablonów 20 kV (STACJA_ABONENCKA/
        # KOMPENSACJA): wstawienie na magistrali 20 kV materializowało nową
        # szynę SN na 15 kV, więc transformator/bateria o napięciu 20 kV
        # odrzucały się jako niezgodne z WŁASNĄ, błędnie wymuszoną szyną.
        # Istniejące migawki 15 kV dają TĘ SAMĄ wartość dziedziczoną z
        # segmentu (żaden dzisiejszy projekt referencyjny nie jest inny niż
        # 15 kV) — determinizm testów regresji zachowany.
        #
        # Strona nN PODĄŻA za katalogową stroną dolną WYBRANEGO
        # transformatora (nie stała 0.4): blok falownikowy turbiny pracuje
        # na napięciu generatora (np. 0.69 kV) — sztywne 0.4 wywalało
        # `station.insert.transformer_voltage_mismatch` dla poprawnie
        # dobranego TR 3.15 MVA (tpl_wiatr_3mw).
        "nn_voltage_kv": nn_voltage_kv,
    }
    transformer_spec: dict[str, Any] = {"transformer_catalog_ref": transformer_ref}
    if not template.schema.transformer_options:
        # Szablon BEZ transformatora (rola A "rozdzielnia sieciowa"/E
        # "kompensacja"/"rezerwa zasilania", V12T-016): węzeł czysto
        # przełączeniowy — `insert_station_on_segment_sn` DOMYŚLNIE wymaga
        # katalogu transformatora (`transformer.create=True`); bez tej flagi
        # operacja odrzucałaby KAŻDY szablon bez `transformer_options` błędem
        # `catalog.ref_required`, mimo że `transformer_ref` jest jawnie `None`
        # z zamierzenia szablonu (nie brakiem danych). Ten sam, już
        # przetestowany kontrakt operacji co „złącze pętlowe" bez TR
        # (`tests/enm/test_catalog_gate.py::
        # test_station_without_create_transformer_passes`).
        transformer_spec["create"] = False
    nn_block_spec = {
        "outgoing_feeders_nn_count": max(0, nn_feeders_requested),
        "outgoing_feeders_nn": nn_feeder_specs,
    }

    # KLASA PRZYŁĄCZENIA decyduje o DRODZE zabudowy (kontrakt
    # `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md` §3): stacja abonencka z układem
    # pomiarowo-rozliczeniowym (klasa B) wisi w ODGAŁĘZIENIU, bo pomiar mierzy
    # CAŁY i TYLKO pobór klienta — tranzyt magistrali nie może iść przez jego
    # rozdzielnicę. Stacja dystrybucyjna (A) i złącze z pętlą OSD (C) zostają
    # przy wcięciu w odcinek.
    klasa = _klasa_przylaczenia(sn_bay_roles)
    if klasa == "B":
        enm_dict, station_ref, nn_bus_ref, new_ids = _zabuduj_stacje_w_odgalezieniu(
            enm_dict=enm_dict,
            template=template,
            target_segment_id=target_segment_id,
            insert_at_ratio=insert_at_ratio,
            overrides=overrides,
            station_spec=station_spec,
            transformer_spec=transformer_spec,
            sn_field_specs=sn_field_specs,
            nn_block_spec=nn_block_spec,
            operations_log=operations_log,
        )
    else:
        station_payload = {
            "segment_id": target_segment_id,
            "insert_at": {"mode": "RATIO", "value": insert_at_ratio},
            "station": {**station_spec, "station_type": _resolve_station_type(template)},
            "transformer": transformer_spec,
            "sn_fields": sn_field_specs,
            "nn_block": nn_block_spec,
        }

        insert_result = execute_domain_operation(
            enm_dict=enm_dict,
            op_name="insert_station_on_segment_sn",
            payload=station_payload,
        )

        if insert_result.get("error"):
            raise TemplateApplyError(
                code=insert_result.get("error_code", "template.insert_failed"),
                message_pl=insert_result.get("error") or "Wstawienie stacji nie powiodło się.",
            )

        enm_dict = insert_result.get("snapshot") or enm_dict
        changes = insert_result.get("changes") or {}
        new_ids = changes.get("created_element_ids") or []
        operations_log.append({"op": "insert_station_on_segment_sn", "created": new_ids})
        station_ref = _ref_wyboru(insert_result)
        nn_bus_ref = _szyna_nn_stacji(enm_dict, station_ref, nn_voltage_kv)

    created_refs.extend(new_ids)

    # Step 2: chain additional nN feeders if the domain insert did not materialize all of them.
    nn_feeder_refs = _station_nn_feeder_refs(enm_dict, station_ref, nn_bus_ref)
    extra_feeders = max(0, nn_feeders_requested - len(nn_feeder_refs))

    if station_ref and nn_bus_ref and extra_feeders > 0:
        for i in range(extra_feeders):
            feeder_result = execute_domain_operation(
                enm_dict=enm_dict,
                op_name="add_nn_outgoing_field",
                payload={
                    "bus_nn_ref": nn_bus_ref,
                    "station_ref": station_ref,
                    "field_role": "OUTGOING",
                    "field_name": f"Odpływ nN {i + 2}",
                    "catalog_ref": cb_catalog or "cb_nn_400a",
                },
            )
            if feeder_result.get("error"):
                raise TemplateApplyError(
                    code=feeder_result.get("error_code", "template.nn_feeder_failed"),
                    message_pl=feeder_result.get("error")
                    or "Materializacja odpływu nN z szablonu nie powiodła się.",
                )
            enm_dict = feeder_result.get("snapshot") or enm_dict
            new_feeder_ids = (feeder_result.get("changes") or {}).get("created_element_ids") or []
            created_refs.extend(new_feeder_ids)
            operations_log.append(
                {
                    "op": "add_nn_outgoing_field",
                    "created": new_feeder_ids,
                }
            )
        nn_feeder_refs = _station_nn_feeder_refs(enm_dict, station_ref, nn_bus_ref)

    # Step 3: materialize catalog-bound nN loads for every outgoing feeder.
    load_kw = float(overrides.get("nn_load_default_kw", template.schema.nn_load_default_kw.default))
    if station_ref and nn_bus_ref and load_kw > 0 and nn_feeder_refs:
        load_catalog_ref = overrides.get("nn_load_catalog_ref") or _resolve_load_ref_for_template(
            template,
            load_kw=load_kw,
        )
        reactive_power_kvar = overrides.get("nn_load_default_kvar")
        for index, feeder_ref in enumerate(nn_feeder_refs, start=1):
            load_result = execute_domain_operation(
                enm_dict=enm_dict,
                op_name="add_nn_load",
                payload={
                    "station_ref": station_ref,
                    "bus_nn_ref": nn_bus_ref,
                    "feeder_ref": feeder_ref,
                    "catalog_ref": load_catalog_ref,
                    "load_kind": "SKUPIONY",
                    "connection_type": "TROJFAZOWY",
                    "active_power_kw": load_kw,
                    "reactive_power_kvar": reactive_power_kvar,
                    "cos_phi": overrides.get("nn_load_cos_phi", 0.95),
                    "load_name": f"Odbiór nN {index}",
                },
            )
            if load_result.get("error"):
                raise TemplateApplyError(
                    code=load_result.get("error_code", "template.nn_load_failed"),
                    message_pl=load_result.get("error")
                    or "Materializacja odbioru nN z szablonu nie powiodła się.",
                )
            enm_dict = load_result.get("snapshot") or enm_dict
            new_load_ids = (load_result.get("changes") or {}).get("created_element_ids") or []
            created_refs.extend(new_load_ids)
            operations_log.append(
                {
                    "op": "add_nn_load",
                    "created": new_load_ids,
                    "feeder_ref": feeder_ref,
                    "catalog_ref": load_catalog_ref,
                }
            )

    # Step 4: chain DER additions
    der_total = int(overrides.get("der_total_count", template.schema.der_total_count.default))
    if station_ref and der_total > 0 and template.schema.der_options:
        for i in range(der_total):
            der_spec = template.schema.der_options[i % len(template.schema.der_options)]
            der_p_mw_each = float(
                overrides.get(f"der_{der_spec.kind}_p_mw_each", der_spec.default_p_mw_each)
            )
            der_catalog = (
                overrides.get(f"der_{der_spec.kind}_ref")
                or _der_catalog_for_power(der_spec, der_p_mw_each)
                or _first_default_choice(der_spec.catalog_options)
            )
            if not der_catalog:
                raise TemplateApplyError(
                    code="template.der_catalog_missing",
                    message_pl=(
                        "Szablon stacji wskazuje źródło przekształtnikowe, "
                        "ale nie ma pełnej pozycji katalogowej dla tego wariantu."
                    ),
                )
            connection_variant = der_spec.connection_variant_options[0]
            der_payload = {
                "source_technology": der_spec.kind,
                "catalog_ref": der_catalog,
                "connection_variant": connection_variant,
                "station_ref": station_ref,
                "power_setpoint_mw": float(
                    overrides.get(
                        f"der_{der_spec.kind}_p_mw_each",
                        der_spec.default_p_mw_each,
                    )
                ),
                "quantity": 1,
            }
            if connection_variant == "nn_side" and nn_bus_ref:
                der_payload["bus_nn_ref"] = nn_bus_ref
            der_result = execute_domain_operation(
                enm_dict=enm_dict,
                op_name="add_converter_source",
                payload=der_payload,
            )
            if der_result.get("error"):
                raise TemplateApplyError(
                    code=der_result.get("error_code", "template.der_failed"),
                    message_pl=der_result.get("error")
                    or "Materializacja źródła przekształtnikowego z szablonu nie powiodła się.",
                )
            enm_dict = der_result.get("snapshot") or enm_dict
            new_der_ids = (der_result.get("changes") or {}).get("created_element_ids") or []
            created_refs.extend(new_der_ids)
            operations_log.append(
                {
                    "op": "add_converter_source",
                    "kind": der_spec.kind,
                    "created": new_der_ids,
                }
            )

    # Step 5: materialize CT/VT on the MEASUREMENT field (rewizja V12T-016 —
    # KLASA NIE INSTANCJA: `ct_options`/`vt_options` istniały w schemacie 41
    # szablonów z rolą MEASUREMENT od dawna, ale `apply()` nigdy ich nie
    # materializował — pole pomiarowe powstawało bez CT/VT mimo deklaracji
    # szablonu „pole pomiarowe (CT/VT)". Naprawa obejmuje WSZYSTKIE takie
    # szablony, nie tylko nowe STACJA_ABONENCKA, dla której karta ją zażądała.
    measurement_field_ref = _measurement_field_ref(enm_dict, station_ref)
    if measurement_field_ref and (template.schema.ct_options or template.schema.vt_options):
        ct_catalog_ref = overrides.get("ct_ref") or _first_default_choice(
            template.schema.ct_options
        )
        vt_catalog_ref = overrides.get("vt_ref") or _first_default_choice(
            template.schema.vt_options
        )
        if ct_catalog_ref:
            ct_ratio = _ct_ratio_from_catalog(ct_catalog_ref)
            if ct_ratio is None:
                raise TemplateApplyError(
                    code="template.ct_catalog_missing",
                    message_pl=(
                        f"Szablon „{template.name_pl}” wskazuje przekładnik prądowy (CT), "
                        "którego katalog nie ma."
                    ),
                )
            ct_result = execute_domain_operation(
                enm_dict=enm_dict,
                op_name="add_ct",
                payload={
                    "field_ref": measurement_field_ref,
                    "catalog_ref": ct_catalog_ref,
                    "ratio_primary_a": ct_ratio[0],
                    "ratio_secondary_a": ct_ratio[1],
                    "purpose": "metering",
                },
            )
            if ct_result.get("error"):
                raise TemplateApplyError(
                    code=ct_result.get("error_code", "template.ct_failed"),
                    message_pl=ct_result.get("error")
                    or "Materializacja przekładnika CT z szablonu nie powiodła się.",
                )
            enm_dict = ct_result.get("snapshot") or enm_dict
            new_ct_ids = (ct_result.get("changes") or {}).get("created_element_ids") or []
            created_refs.extend(new_ct_ids)
            operations_log.append({"op": "add_ct", "created": new_ct_ids})
        if vt_catalog_ref:
            vt_ratio = _vt_ratio_from_catalog(vt_catalog_ref)
            if vt_ratio is None:
                raise TemplateApplyError(
                    code="template.vt_catalog_missing",
                    message_pl=(
                        f"Szablon „{template.name_pl}” wskazuje przekładnik napięciowy (VT), "
                        "którego katalog nie ma."
                    ),
                )
            vt_result = execute_domain_operation(
                enm_dict=enm_dict,
                op_name="add_vt",
                payload={
                    "field_ref": measurement_field_ref,
                    "catalog_ref": vt_catalog_ref,
                    "ratio_primary_v": vt_ratio[0],
                    "ratio_secondary_v": vt_ratio[1],
                    "purpose": "metering",
                },
            )
            if vt_result.get("error"):
                raise TemplateApplyError(
                    code=vt_result.get("error_code", "template.vt_failed"),
                    message_pl=vt_result.get("error")
                    or "Materializacja przekładnika VT z szablonu nie powiodła się.",
                )
            enm_dict = vt_result.get("snapshot") or enm_dict
            new_vt_ids = (vt_result.get("changes") or {}).get("created_element_ids") or []
            created_refs.extend(new_vt_ids)
            operations_log.append({"op": "add_vt", "created": new_vt_ids})

    # Step 6: kompensacja mocy biernej (rola E, V12T-016) — bateria
    # kondensatorów SN na szynie SN stacji, gdy szablon ją niesie.
    if station_ref and template.schema.shunt_capacitor_options:
        sn_bus_ref = _szyna_sn_stacji_dla_szablonu(enm_dict, station_ref, nn_bus_ref)
        # Domyślny wybór baterii idzie przez `schema.resolve_template_default_shunt_choice`
        # — TĘ SAMĄ regułę pokazuje `structural_fields()` w `required_sn_voltage_kv`,
        # więc oferta i materializacja nie mogą się rozjechać.
        domyslna_bateria = resolve_template_default_shunt_choice(template)
        shunt_catalog_ref = overrides.get("shunt_capacitor_ref") or (
            domyslna_bateria.catalog_ref if domyslna_bateria is not None else None
        )
        if sn_bus_ref and shunt_catalog_ref:
            shunt_result = execute_domain_operation(
                enm_dict=enm_dict,
                op_name="add_shunt_compensator_sn",
                payload={"bus_ref": sn_bus_ref, "catalog_ref": shunt_catalog_ref},
            )
            if shunt_result.get("error"):
                raise TemplateApplyError(
                    code=shunt_result.get("error_code", "template.shunt_failed"),
                    message_pl=shunt_result.get("error")
                    or "Materializacja baterii kondensatorów z szablonu nie powiodła się.",
                )
            enm_dict = shunt_result.get("snapshot") or enm_dict
            new_shunt_ids = (shunt_result.get("changes") or {}).get("created_element_ids") or []
            created_refs.extend(new_shunt_ids)
            operations_log.append({"op": "add_shunt_compensator_sn", "created": new_shunt_ids})

    # Persist final snapshot
    try:
        new_enm = EnergyNetworkModel.model_validate(enm_dict)
        saved = _set_enm(klucz, new_enm)
        enm_dict = saved.model_dump(mode="json")
    except Exception as exc:
        # Szczegol techniczny (typ wyjatku, sciezka pliku) idzie do dziennika
        # serwera, a NIE do komunikatu inzyniera: dotychczasowe `f"...{exc}"`
        # wypychalo na ekran bezwzgledna sciezke systemu plikow backendu.
        # Komunikat mowi to, co dla projektanta jest istotne: model pozostal
        # nietkniety, wiec operacje mozna powtorzyc bez sprzatania po niej.
        logger.exception("Zapis modelu po zastosowaniu szablonu '%s' nie powiódł się", template.id)
        raise TemplateApplyError(
            code="template.persist_failed",
            message_pl=(
                "Nie udało się zapisać modelu sieci po zastosowaniu szablonu — "
                "model pozostał bez zmian. Powtórz operację; jeśli błąd wraca, "
                "zgłoś go administratorowi (szczegóły są w dzienniku serwera)."
            ),
        ) from exc

    return {
        "template_id": template.id,
        "template_name_pl": template.name_pl,
        "station_ref": station_ref,
        "created_element_refs": created_refs,
        "operations_log": operations_log,
        "catalog_profile_applied": catalog_profile,
        "snapshot_hash": enm_dict.get("header", {}).get("hash_sha256"),
    }


# Helpers


def _klasa_przylaczenia(bay_roles: list[str]) -> str:
    """Klasa przyłączenia (A/B/C) dla ról pól WYNIKAJĄCYCH z szablonu.

    Klasę liczy operacja domenowa (`enm.domain_operations.klasa_przylaczenia_sn`)
    — TA SAMA funkcja bramkuje wcięcie w odcinek. Warstwa aplikacyjna nie ma
    własnej kopii reguły: dwa niezależne warunki, które „dziś się zgadzają", są
    defektem czekającym na dane brzegowe (np. stację abonencką z polem
    REZERWOWYM za pomiarem — zbiorowy test obecności roli odpływowej uznałby ją
    za pętlę OSD).

    Klasa wynika z zestawu ról, który zostanie ZBUDOWANY — nie z nazwy szablonu
    ani jego kategorii (nazwa kłamie, kategoria jest metadaną biblioteki).
    """
    from enm.domain_operations import klasa_przylaczenia_sn

    return klasa_przylaczenia_sn(bay_roles)


def _ref_wyboru(wynik_operacji: dict[str, Any]) -> str | None:
    """Ref elementu wskazanego przez operację domenową (`selection_hint`).

    JEDNO źródło ref stacji dla OBU dróg zabudowy — dawne dopasowanie po fragmencie
    identyfikatora (`"/station" in ref`) działa wyłącznie dla wcięcia w odcinek:
    stacja na końcu ciągu ma ref `sub/…/substation`.
    """
    hint = wynik_operacji.get("selection_hint")
    if isinstance(hint, dict):
        element_id = hint.get("element_id")
        if isinstance(element_id, str) and element_id.strip():
            return element_id
    return None


def _szyna_nn_stacji(
    enm_dict: dict[str, Any],
    station_ref: str | None,
    nn_voltage_kv: float,
) -> str | None:
    """Szyna nN stacji — szyna stacji o napięciu strony dolnej transformatora.

    Wyprowadzona z MODELU (napięcie szyny), nie z fragmentu identyfikatora: obie
    operacje zabudowy wpisują szynę nN do `substation.bus_refs`, ale nadają jej
    różne identyfikatory (`stn/…/nn_bus` vs `bus/…/nn`).
    """
    if not station_ref:
        return None
    substation = next(
        (
            s
            for s in enm_dict.get("substations", [])
            if isinstance(s, dict) and s.get("ref_id") == station_ref
        ),
        None,
    )
    if substation is None:
        return None
    bus_refs = [ref for ref in substation.get("bus_refs") or [] if isinstance(ref, str)]
    for bus in enm_dict.get("buses", []):
        if not isinstance(bus, dict) or bus.get("ref_id") not in bus_refs:
            continue
        surowe_napiecie = bus.get("voltage_kv")
        if surowe_napiecie is None:
            continue
        try:
            napiecie = float(surowe_napiecie)
        except (TypeError, ValueError):
            continue
        if abs(napiecie - nn_voltage_kv) < 1e-9:
            return str(bus.get("ref_id"))
    return None


#: Domyślna długość odcinka odgałęzienia [m]. Wzorzec UDOKUMENTOWANY w kreatorze
#: odgałęzienia (`frontend/src/ui2/kreatory/odgalezienie/odgaleznieModel.ts`,
#: `DANE_DOMYSLNE.dlugosc_km = 1`) — ta sama wartość, jedno źródło zwyczaju.
#: Projektant nadpisuje ją parametrem `branch_length_m`.
_DOMYSLNA_DLUGOSC_ODGALEZIENIA_M = 1000


def _zabuduj_stacje_w_odgalezieniu(
    *,
    enm_dict: dict[str, Any],
    template: StationTemplate,
    target_segment_id: str,
    insert_at_ratio: float,
    overrides: dict[str, Any],
    station_spec: dict[str, Any],
    transformer_spec: dict[str, Any],
    sn_field_specs: list[dict[str, Any]],
    nn_block_spec: dict[str, Any],
    operations_log: list[dict[str, Any]],
) -> tuple[dict[str, Any], str | None, str | None, list[str]]:
    """Stacja abonencka (klasa B) jako ODGAŁĘZIENIE od wskazanego odcinka.

    Trzy istniejące operacje domenowe, zero nowej fizyki i zero nowej topologii:

    1. punkt odgałęzienia na odcinku — ZKSN dla kabla, słup rozgałęźny dla linii
       napowietrznej (operacja domenowa sama pilnuje tej pary: „ZKSN wyłącznie na
       odcinku kablowym", „słup rozgałęźny wyłącznie na linii napowietrznej");
    2. `start_branch_segment_sn` z portu BRANCH tego punktu — pierwszy odcinek
       gałęzi klienta;
    3. `append_station_on_endpoint` na końcu gałęzi — stacja KOŃCOWA (zacisk
       końcowy staje się szyną SN stacji, tranzyt nie ma dokąd iść dalej).

    Skutek kontraktowy: magistrala OSD biegnie przez punkt odgałęzienia, a NIE
    przez rozdzielnicę klienta — pomiar rozliczeniowy leży w szeregu z gałęzią
    klienta i mierzy wyłącznie jego pobór.
    """
    segment = next(
        (
            b
            for b in enm_dict.get("branches", [])
            if isinstance(b, dict) and b.get("ref_id") == target_segment_id
        ),
        None,
    )
    if segment is None:
        raise TemplateApplyError(
            code="template.branch_segment_missing",
            message_pl=(
                "Wskazany odcinek nie istnieje w modelu — "
                "nie ma od czego poprowadzić odgałęzienia do stacji klienta."
            ),
        )
    seg_type = str(segment.get("type") or "")
    if seg_type not in ("cable", "line_overhead"):
        raise TemplateApplyError(
            code="template.branch_segment_not_sn",
            message_pl=(
                f"{opis_obiektu(segment, 'Odcinek')} nie jest odcinkiem SN "
                f"(rodzaj: {nazwa_rodzaju_galezi(seg_type)}), więc nie można z niego "
                "wyprowadzić odgałęzienia do stacji abonenckiej."
            ),
        )

    kablowy = seg_type == "cable"
    op_punktu = "insert_zksn_on_segment_sn" if kablowy else "insert_branch_pole_on_segment_sn"
    punkt_catalog_ref = overrides.get("branch_point_catalog_ref") or _domyslny_punkt_odgalezienia(
        kablowy=kablowy
    )
    if not punkt_catalog_ref:
        raise TemplateApplyError(
            code="template.branch_point_catalog_missing",
            message_pl=(
                "Katalog punktów rozgałęzienia nie ma pozycji dla tego rodzaju "
                "odcinka. Wskaż pozycję punktu rozgałęzienia (słup rozgałęźny albo ZKSN) "
                "w parametrach szablonu."
            ),
        )

    created: list[str] = []
    wynik_punktu = _wykonaj_operacje(
        enm_dict,
        op_punktu,
        {
            "segment_id": target_segment_id,
            "insert_at": {"mode": "RATIO", "value": insert_at_ratio},
            "catalog_ref": punkt_catalog_ref,
        },
        kod_bledu="template.branch_point_failed",
        komunikat="Utworzenie punktu odgałęzienia na magistrali nie powiodło się.",
    )
    enm_dict = wynik_punktu.get("snapshot") or enm_dict
    ids_punktu = (wynik_punktu.get("changes") or {}).get("created_element_ids") or []
    created.extend(ids_punktu)
    operations_log.append({"op": op_punktu, "created": ids_punktu})

    punkt_ref = _ref_wyboru(wynik_punktu)
    if not punkt_ref:
        raise TemplateApplyError(
            code="template.branch_point_failed",
            message_pl="Operacja punktu odgałęzienia nie wskazała utworzonego elementu.",
        )
    port_id = "BRANCH_1" if kablowy else "BRANCH"

    dlugosc_m = int(overrides.get("branch_length_m", _DOMYSLNA_DLUGOSC_ODGALEZIENIA_M))
    if dlugosc_m <= 0:
        raise TemplateApplyError(
            code="template.branch_length_invalid",
            message_pl="Długość odgałęzienia do stacji klienta musi być większa od zera.",
        )
    # Typ kabla/linii gałęzi: wskazanie projektanta, inaczej TEN SAM typ, co odcinek
    # macierzysty — wzorzec kreatora odgałęzienia (`initial_catalog_ref` z
    # `segment.catalog_binding` źródła). Zero zgadywania: gdy odcinek macierzysty
    # nie ma pozycji katalogowej, operacja kończy się błędem z prośbą o wskazanie.
    odcinek_catalog_ref = overrides.get("branch_segment_catalog_ref") or segment.get("catalog_ref")
    if not odcinek_catalog_ref:
        raise TemplateApplyError(
            code="template.branch_segment_catalog_missing",
            message_pl=(
                "Brak pozycji katalogowej odcinka odgałęzienia. Odcinek magistrali "
                "nie ma wiązania katalogowego, więc wskaż typ kabla/linii gałęzi "
                "w parametrach szablonu."
            ),
        )

    wynik_galezi = _wykonaj_operacje(
        enm_dict,
        "start_branch_segment_sn",
        {
            "from_ref": f"{punkt_ref}.{port_id}",
            "segment": {
                "rodzaj": "KABEL" if kablowy else "LINIA",
                "dlugosc_m": dlugosc_m,
                "catalog_binding": _catalog_binding(
                    "KABEL_SN" if kablowy else "LINIA_SN", str(odcinek_catalog_ref)
                ),
            },
        },
        kod_bledu="template.branch_segment_failed",
        komunikat="Utworzenie odcinka odgałęzienia do stacji klienta nie powiodło się.",
    )
    enm_dict = wynik_galezi.get("snapshot") or enm_dict
    ids_galezi = (wynik_galezi.get("changes") or {}).get("created_element_ids") or []
    created.extend(ids_galezi)
    operations_log.append({"op": "start_branch_segment_sn", "created": ids_galezi})

    odcinek_ref = _ref_wyboru(wynik_galezi)
    koniec_galezi = next(
        (
            b.get("to_bus_ref")
            for b in enm_dict.get("branches", [])
            if isinstance(b, dict) and b.get("ref_id") == odcinek_ref
        ),
        None,
    )
    if not koniec_galezi:
        raise TemplateApplyError(
            code="template.branch_segment_failed",
            message_pl="Odcinek odgałęzienia powstał bez zacisku końcowego dla stacji.",
        )

    wynik_stacji = _wykonaj_operacje(
        enm_dict,
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": koniec_galezi,
            # Stacja KOŃCOWA — wynika z topologii (koniec gałęzi), nie z kategorii
            # szablonu: za rozdzielnicą klienta nie ma dokąd prowadzić tranzytu.
            "station": {**station_spec, "name": template.name_pl, "station_type": "terminal"},
            "transformer": transformer_spec,
            "sn_fields": sn_field_specs,
            "nn_block": nn_block_spec,
        },
        kod_bledu="template.branch_station_failed",
        komunikat="Utworzenie stacji abonenckiej na końcu odgałęzienia nie powiodło się.",
    )
    enm_dict = wynik_stacji.get("snapshot") or enm_dict
    ids_stacji = (wynik_stacji.get("changes") or {}).get("created_element_ids") or []
    created.extend(ids_stacji)
    operations_log.append({"op": "append_station_on_endpoint", "created": ids_stacji})

    station_ref = _ref_wyboru(wynik_stacji)
    nn_bus_ref = _szyna_nn_stacji(
        enm_dict, station_ref, float(station_spec.get("nn_voltage_kv") or 0.4)
    )
    return enm_dict, station_ref, nn_bus_ref, created


def _wykonaj_operacje(
    enm_dict: dict[str, Any],
    op_name: str,
    payload: dict[str, Any],
    *,
    kod_bledu: str,
    komunikat: str,
) -> dict[str, Any]:
    """Wykonaj operację domenową; błąd operacji = błąd zastosowania szablonu.

    Komunikat operacji domenowej ma PIERWSZEŃSTWO — mówi projektantowi, co
    konkretnie odrzuciła domena (np. zajęty port odgałęzienia).
    """
    wynik = execute_domain_operation(enm_dict=enm_dict, op_name=op_name, payload=payload)
    if wynik.get("error"):
        raise TemplateApplyError(
            code=wynik.get("error_code", kod_bledu),
            message_pl=wynik.get("error") or komunikat,
        )
    return wynik


def _domyslny_punkt_odgalezienia(*, kablowy: bool) -> str | None:
    """Deterministyczny wybór pozycji katalogu punktów rozgałęzienia.

    Reguła: spośród pozycji o ZGODNYM ośrodku (kabel / linia napowietrzna) —
    najmniejsza liczba portów odgałęźnych, przy remisie pierwsza wg identyfikatora.
    Obie wskazane w ten sposób pozycje są w katalogu opisane jako REFERENCYJNE dla
    swojego ośrodka. To wybór POZYCJI, nie parametrów: fizykę i tak materializuje
    katalog.
    """
    from network_model.catalog.mv_branch_point_catalog import get_all_branch_point_types

    osrodek = "CABLE" if kablowy else "LINE_OVERHEAD"
    kandydaci = [
        record
        for record in get_all_branch_point_types()
        if (record.get("params") or {}).get("medium") == osrodek
    ]
    if not kandydaci:
        return None
    najlepszy = min(
        kandydaci,
        key=lambda record: (
            int((record.get("params") or {}).get("branch_ports_count") or 1),
            str(record.get("id") or ""),
        ),
    )
    identyfikator = najlepszy.get("id")
    return str(identyfikator) if identyfikator else None


def _catalog_binding(namespace: str, item_id: str | None) -> dict[str, Any] | None:
    if not isinstance(item_id, str) or not item_id.strip():
        return None
    return {
        "catalog_namespace": namespace,
        "catalog_item_id": item_id.strip(),
        "catalog_item_version": "2024.1",
        "materialize": True,
        "snapshot_mapping_version": "1.0",
    }


def _station_nn_feeder_refs(
    enm_dict: dict[str, Any],
    station_ref: str | None,
    nn_bus_ref: str | None,
) -> list[str]:
    if not station_ref or not nn_bus_ref:
        return []
    for substation in enm_dict.get("substations", []):
        if not isinstance(substation, dict) or substation.get("ref_id") != station_ref:
            continue
        meta = substation.get("meta")
        if not isinstance(meta, dict):
            return []
        refs: list[str] = []
        raw_specs = meta.get("nn_field_specs")
        if not isinstance(raw_specs, list):
            return refs
        for spec in raw_specs:
            if not isinstance(spec, dict):
                continue
            if spec.get("bay_role") != "FEEDER" or spec.get("bus_ref") != nn_bus_ref:
                continue
            field_ref = spec.get("field_ref")
            if isinstance(field_ref, str) and field_ref.strip():
                refs.append(field_ref)
        return refs
    return []


def _measurement_field_ref(enm_dict: dict[str, Any], station_ref: str | None) -> str | None:
    """`field_ref` pola SN o roli `MEASUREMENT` stacji (Step 5 — CT/VT).

    Czyta `meta.field_specs` — TĘ SAMĄ tablicę, którą wypełniają OBIE drogi
    zabudowy (`insert_station_on_segment_sn` i `append_station_on_endpoint`,
    „parytet" udokumentowany przy tworzeniu pola SN), więc działa niezależnie
    od klasy przyłączenia. `None` gdy stacja nie ma pola pomiarowego (szablon
    bez roli MEASUREMENT) — uczciwy brak, Step 5 wtedy nic nie robi."""
    if not station_ref:
        return None
    for substation in enm_dict.get("substations", []):
        if not isinstance(substation, dict) or substation.get("ref_id") != station_ref:
            continue
        meta = substation.get("meta")
        if not isinstance(meta, dict):
            return None
        raw_specs = meta.get("field_specs")
        if not isinstance(raw_specs, list):
            return None
        for spec in raw_specs:
            if not isinstance(spec, dict) or spec.get("bay_role") != "MEASUREMENT":
                continue
            field_ref = spec.get("field_ref")
            if isinstance(field_ref, str) and field_ref.strip():
                return field_ref
        return None
    return None


def _szyna_sn_stacji_dla_szablonu(
    enm_dict: dict[str, Any],
    station_ref: str | None,
    nn_bus_ref: str | None,
) -> str | None:
    """Szyna SN stacji (Step 6 — kompensacja): pierwsza szyna stacji różna od
    szyny nN. Dla stacji BEZ transformatora `nn_bus_ref` jest szyną-widmem
    (`insert_station_on_segment_sn` tworzy ją bezwarunkowo, patrz
    `transformer.create=False` wyżej) — to WŁAŚNIE ją trzeba wykluczyć, żeby
    bateria kondensatorów nie trafiła na nieużywaną szynę 0,4 kV."""
    if not station_ref:
        return None
    for substation in enm_dict.get("substations", []):
        if not isinstance(substation, dict) or substation.get("ref_id") != station_ref:
            continue
        bus_refs = [ref for ref in substation.get("bus_refs") or [] if isinstance(ref, str)]
        for ref in bus_refs:
            if ref != nn_bus_ref:
                return ref
        return None
    return None


def _ct_ratio_from_catalog(catalog_ref: str) -> tuple[float, float] | None:
    """Przekładnia CT (`ratio_primary_a`, `ratio_secondary_a`) z REALNEGO
    rekordu katalogu — zero fabrykacji: `add_ct` odrzuca payload, którego
    przekładnia nie zgadza się z pozycją katalogową, więc liczby muszą
    pochodzić z TEGO SAMEGO źródła, które sprawdzi operacja domenowa."""
    try:
        from network_model.catalog import get_default_mv_catalog
    except ImportError:
        return None
    item = get_default_mv_catalog().get_ct_type(catalog_ref)
    if item is None:
        return None
    return float(item.ratio_primary_a), float(item.ratio_secondary_a)


def _vt_ratio_from_catalog(catalog_ref: str) -> tuple[float, float] | None:
    """Przekładnia VT (`ratio_primary_v`, `ratio_secondary_v`) z REALNEGO
    rekordu katalogu — jak `_ct_ratio_from_catalog`."""
    try:
        from network_model.catalog import get_default_mv_catalog
    except ImportError:
        return None
    item = get_default_mv_catalog().get_vt_type(catalog_ref)
    if item is None:
        return None
    return float(item.ratio_primary_v), float(item.ratio_secondary_v)


def _resolve_load_ref_for_template(template: StationTemplate, *, load_kw: float) -> str:
    category_value = getattr(template.category, "value", str(template.category))
    if category_value == "przemyslowa" or load_kw >= 60:
        return "load_przem_75kw"
    if load_kw >= 25:
        return "load_uslugi_30kw"
    return "load_mieszk_15kw"


def _first_default_choice(options: tuple[Any, ...] | list[Any]) -> str | None:
    """Return catalog_ref of default option, or first if no default flagged."""
    if not options:
        return None
    for o in options:
        if getattr(o, "default", False):
            return getattr(o, "catalog_ref", None)
    return getattr(options[0], "catalog_ref", None)


def _cascade_manufacturer_choice(
    options: tuple[Any, ...] | list[Any],
    manufacturer: str | None,
) -> str | None:
    """K30-26: manufacturer cascade — prefer catalog entry matching profile.

    Returns first option whose catalog_ref contains manufacturer hint
    (case-insensitive substring match). Falls back do default if no match.
    """
    if not options:
        return None
    if manufacturer:
        normalized = manufacturer.lower().replace(" ", "-").replace("_", "-")
        for o in options:
            ref = (getattr(o, "catalog_ref", "") or "").lower()
            # Match manufacturer hints (zpue, wzl, elektrometal, abb, siemens, etc.)
            if any(token in ref for token in normalized.split("-") if len(token) > 2):
                return getattr(o, "catalog_ref", None)
    return _first_default_choice(options)


def _resolve_transformer_ref_for_template(
    template: StationTemplate,
    *,
    overrides: dict[str, Any],
    catalog_profile: str | None,
) -> str | None:
    """Resolve a template transformer to an existing catalog item.

    Szablony kodują moc w identyfikatorze (`..._630kva`). Używamy jej przed
    fallbackiem, żeby stacja 100 kVA nie dostała pierwszej pozycji z listy
    wspólnych opcji. Token ID i selektor „najmniejsza opcja >= wymaganej mocy
    DER" są WSPÓLNE ze `schema.py::resolve_template_default_transformer_choice`
    (KLASA NIE INSTANCJA pkt 3, 2026-09 — przed tym promowaniem obie ścieżki
    liczyły „domyślną" opcję dwiema różnymi regułami i rozjeżdżały się dla 34
    z 73 szablonów: kafel przeglądarki pokazywał moc, której `apply()` wcale
    by nie zmaterializował).
    """
    explicit = overrides.get("transformer_ref")
    if isinstance(explicit, str) and explicit.strip():
        return explicit

    manufacturer_match = _cascade_manufacturer_choice(
        template.schema.transformer_options,
        catalog_profile,
    )
    if catalog_profile and manufacturer_match:
        return manufacturer_match

    wg_id = _opcja_transformatora_wg_tokenu_id(template.schema.transformer_options, template.id)
    if wg_id is not None:
        return wg_id.catalog_ref

    der_required_kva = _template_der_required_kva(template, overrides)
    if der_required_kva is not None:
        wg_der = _opcja_transformatora_dla_wymaganej_mocy(
            template.schema.transformer_options, der_required_kva
        )
        if wg_der is not None:
            return wg_der.catalog_ref

    return manufacturer_match or _first_default_choice(template.schema.transformer_options)


def _template_der_required_kva(
    template: StationTemplate,
    overrides: dict[str, Any],
) -> int | None:
    """Return apparent catalog size hint from template DER defaults/overrides.

    This is only a deterministic catalog selector. Network physics still lives
    in solver/domain code and uses materialized catalog data. `_der_catalog_
    for_power`/`_moc_wymagana_jednostki_der_mva` są WSPÓLNYMI prymitywami ze
    `schema.py` (2026-09, przegląd V12T-016) — czyste, bez zależności od
    `overrides`, więc bez ryzyka rozjazdu z wersją wyświetlania (`schema.py::
    _wymagana_moc_der_domyslna_kva`, ta sama logika z `overrides={}`).
    """
    der_specs = template.schema.der_options
    if not der_specs:
        return None

    der_total = int(overrides.get("der_total_count", template.schema.der_total_count.default))
    if der_total <= 0:
        return None

    total_mva = 0.0
    for i in range(der_total):
        spec = der_specs[i % len(der_specs)]
        override_key = f"der_{spec.kind}_p_mw_each"
        p_mw_each = float(overrides.get(override_key, spec.default_p_mw_each))
        # Jedna prawda mocy (decyzja O-53): tor tworzenia sprawdza
        # `converter.transformer_capacity_exceeded` regułą `max(S_n,jedn·n, P/cosφ)·k_j`
        # na tabliczce pozycji — selektor transformatora liczy TĘ SAMĄ wielkość tą samą
        # funkcją (`_moc_wymagana_jednostki_der_mva`), inaczej dobierałby TR po innej
        # mocy niż ta, którą operacja potem odrzuca (np. Vestas 3 MW: S_n = 3,3 MVA,
        # nie 3,0 MW — 3300 > 3150 kVA).
        catalog_ref = overrides.get(f"der_{spec.kind}_ref") or _der_catalog_for_power(
            spec, p_mw_each
        )
        total_mva += _moc_wymagana_jednostki_der_mva(spec.kind, catalog_ref, p_mw_each) or 0.0

    if total_mva <= 0:
        return None
    return int(round(mva_na_kva(total_mva)))


def _resolve_sn_field_specs(
    template: StationTemplate,
    *,
    bay_roles: list[str],
    overrides: dict[str, Any],
    catalog_profile: str | None,
) -> list[dict[str, Any]]:
    """Pola SN szablonu z JAWNYM aparatem per pole (B-12).

    Kolejność wyboru aparatu: `params_override['sn_bay_apparatus_ref']` →
    `apparatus_options` roli (kaskada producenta) → wspólne
    `sn_bay_apparatus_options` szablonu (kaskada producenta). Brak wskazania ⇒
    `TemplateApplyError` — operacja domenowa nie zgaduje aparatu.
    """
    override_ref = overrides.get("sn_bay_apparatus_ref")
    role_specs = {r.role: r for r in template.schema.sn_bay_roles}
    specs: list[dict[str, Any]] = []
    for role in bay_roles:
        apparatus_ref: str | None = None
        if isinstance(override_ref, str) and override_ref.strip():
            apparatus_ref = override_ref.strip()
        else:
            role_spec = role_specs.get(role)
            role_options = getattr(role_spec, "apparatus_options", ()) if role_spec else ()
            apparatus_ref = _cascade_manufacturer_choice(
                role_options, catalog_profile
            ) or _cascade_manufacturer_choice(
                template.schema.sn_bay_apparatus_options, catalog_profile
            )
        if not apparatus_ref:
            raise TemplateApplyError(
                code="template.sn_bay_apparatus_missing",
                message_pl=(
                    f"Szablon „{template.name_pl}” nie wskazuje aparatu dla pola "
                    f"„{nazwa_roli_pola_sn(role)}”. Uzupełnij listę aparatury szablonu albo "
                    "wskaż aparat pola SN w parametrach szablonu."
                ),
            )
        spec: dict[str, Any] = {
            # Kod roli szablonu → rola kanoniczna operacji: ten sam słownik aliasów, z którego
            # pole dostaje nazwę (`enm.rola_pola_sn`, karta #141); rola spoza słownika przechodzi
            # bez zmiany (operacja decyduje, co z nią zrobić).
            "field_role": kanoniczna_rola_pola_sn(role),
            "apparatus_catalog_ref": apparatus_ref,
        }
        # Pomiar JAWNIE (kontrakt POMIAR_ROZLICZENIOWY_SN_V1 §5, V12K-335
        # pkt 2 + korekta V12K-336): szablon deklarujący pole POMIAROWE opisuje
        # przyłącze KLIENTA (§3 reguła 1), więc jego pomiar jest UKŁADEM
        # POMIAROWYM ENERGII o rodzaju PODSTAWOWYM ([E-UP] pkt 3 — układ
        # podstawowy jest obowiązkowym układem punktu rozliczeniowego).
        # Deklaracja w JEDNYM miejscu obejmuje KAŻDY szablon biblioteki
        # (klasa, nie instancja) — domyślna reguła operacji nie jest tu
        # potrzebna.
        if spec["field_role"] == "POMIAROWE":
            spec["funkcja_pomiaru"] = "UKLAD_ENERGII"
            spec["rodzaj_pomiaru"] = "PODSTAWOWY"
        specs.append(spec)
    return specs


def _resolve_sn_bay_roles(template: StationTemplate, count: int) -> list[str]:
    """Map sn_bays_count → list of bay role codes (IN/OUT/TR/MEASUREMENT/...).

    Reguła keep-TR (V12K-330): szablony deklarują pole pomiarowe PRZED polem
    TR (standard układów pomiarowych OSD — pomiar pierwszy od kierunku
    zasilania), więc obcięcie sekwencji do `count` mogłoby wyciąć pole TR,
    zostawiając stację z transformatorem bez pola transformatorowego (model
    sprzeczny). Gdy szablon deklaruje TR, a obcięta sekwencja go nie ma —
    OSTATNIA pozycja staje się TR (deterministycznie: wypada ostatnia rola
    nie-TR, nigdy pole transformatorowe).

    Reguła keep-POMIAR (POMIAR-ODGAŁĘZIENIE, kontrakt
    `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md`): pole POMIAROWE jest dla stacji
    abonenckiej równie nieusuwalne jak pole TR — to ono decyduje o KLASIE
    przyłączenia (odgałęzienie zamiast wcięcia w tranzyt). Obcięcie liczby pól
    NIE MOŻE go wyciąć: szablon „1000 kVA + pomiary" zredukowany do 2 pól dawał
    [IN, TR] — stację bez układu pomiarowego, którą aplikacja klasyfikowałaby
    jako zwykłą dystrybucyjną i wcięła w magistralę. Gdy `count` nie mieści
    zestawu nieusuwalnego, operacja KOŃCZY SIĘ BŁĘDEM z podaniem minimum —
    nigdy cichym obcięciem.
    """
    declared = [r.role for r in template.schema.sn_bay_roles]
    if not declared:
        # Fallback: IN, OUT, TR default
        fallback = ["IN", "OUT", "TR"]
        return (fallback + ["OUT"] * count)[:count]

    # Role nieusuwalne — po JEDNYM polu każdej z nich (indeks PIERWSZEGO wystąpienia
    # w deklaracji szablonu). Pomiar chroniony wyłącznie tam, gdzie szablon go ma.
    kody_nieusuwalne = ("IN", "MEASUREMENT", "TR") if "MEASUREMENT" in declared else ("TR",)
    wymagane = [declared.index(kod) for kod in kody_nieusuwalne if kod in declared]
    if "MEASUREMENT" in declared and count < len(wymagane):
        raise TemplateApplyError(
            code="template.sn_bays_count_below_minimum",
            message_pl=(
                f"Szablon „{template.name_pl}” opisuje przyłącze klienta z układem "
                f"pomiarowo-rozliczeniowym, więc wymaga co najmniej {len(wymagane)} "
                f"pól SN ({', '.join(nazwa_roli_pola_sn(declared[i]) for i in sorted(wymagane))}). "
                f"Żądano {count}. Zwiększ liczbę pól albo wybierz szablon stacji "
                "dystrybucyjnej (bez pomiaru rozliczeniowego)."
            ),
        )

    # Wybór pól = pierwsze `count` pozycji deklaracji; brakujące role nieusuwalne
    # wypierają OSTATNIE pozycje usuwalne. Wynik idzie w kolejności DEKLARACJI —
    # ta sama kolejność ląduje na rysunku (V12K-330).
    wybrane = list(range(min(count, len(declared))))
    for idx in wymagane:
        if idx in wybrane:
            continue
        usuwalne = [i for i in wybrane if i not in wymagane]
        if not usuwalne:
            break
        wybrane[wybrane.index(usuwalne[-1])] = idx
    result = [declared[i] for i in sorted(wybrane)]
    while len(result) < count:
        result.append("OUT")
    return result


def _resolve_station_type(template: StationTemplate) -> str:
    """Map template category → station_type string."""
    if template.category == TemplateCategory.SLUPOWA:
        return "terminal"
    if template.category in (
        TemplateCategory.SEKCYJNA,
        TemplateCategory.ROZDZIELNIA_SIECIOWA,
        TemplateCategory.REZERWA_ZASILANIA,
    ):
        # Dwusekcyjne, ze sprzęgłem (V12T-016: RS/RSM i rezerwa zasilania
        # mają rolę COUPLER w `sn_bay_roles`, tak jak SEKCYJNA).
        return "sectional"
    return "inline"
