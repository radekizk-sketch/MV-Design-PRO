from __future__ import annotations

from typing import Any, Literal
from uuid import NAMESPACE_URL, uuid5

from enm.canonical_analysis import list_runs_for_case
from enm.models import (
    Bay,
    BayBaseModel,
    BayCanonicalModel,
    BayControlSurface,
    BayEarthFaultPath,
    BayEnergizationSafetyState,
    BayInterlockSet,
    BayMeasurementChain,
    BayMeasurements,
    BayMeasurementSet,
    BayOperatingState,
    BayPowerFlowSourceContribution,
    BayPrimaryDevice,
    BayProjectResults,
    BayProofBinding,
    BayProtectionControlUnit,
    BayRuntimeState,
    BaySecondaryArchitecture,
    BaySecondaryUnitRef,
    BayShortCircuitSourceContribution,
    BaySourceEndpoint,
    BaySwitchState,
    BayVerificationResult,
    Branch,
    EnergyNetworkModel,
    Generator,
    GroundingConfig,
    InterlockEntry,
    Measurement,
    ProtectionAssignment,
    ProtectionFunctionState,
    ProtectionSetting,
    ProtectionSettingValue,
    Source,
    SwitchBranch,
    Transformer,
)

CANONICAL_BAY_ROLE_MAP: dict[str, str] = {
    "IN": "LINIA_IN",
    "OUT": "LINIA_OUT",
    "TR": "TRANSFORMATOROWE",
    "COUPLER": "SPRZEGLO",
    "FEEDER": "LINIA_ODG",
    "MEASUREMENT": "POMIAROWE",
}

BRANCH_KIND_MAP: dict[str, tuple[str, str, bool]] = {
    "breaker": ("CB", "MIDSTREAM", True),
    "bus_coupler": ("CB", "MIDSTREAM", True),
    "disconnector": ("DS", "UPSTREAM", True),
    "switch": ("LOAD_SWITCH", "MIDSTREAM", True),
    "fuse": ("FUSE", "DOWNSTREAM", False),
    "cable": ("CABLE_HEAD", "DOWNSTREAM", False),
}

FUNCTION_TYPE_MAP: dict[str, dict[str, Any]] = {
    "overcurrent_50": {
        "code": "50",
        "required_inputs": ["ct"],
        "execution_mode": "wyzwolenie",
    },
    "overcurrent_51": {
        "code": "51",
        "required_inputs": ["ct"],
        "execution_mode": "wyzwolenie",
    },
    "earth_fault_50N": {
        "code": "50N",
        "required_inputs": ["3i0"],
        "execution_mode": "wyzwolenie",
    },
    "earth_fault_51N": {
        "code": "51N",
        "required_inputs": ["3i0"],
        "execution_mode": "wyzwolenie",
    },
    "directional_67": {
        "code": "67",
        "required_inputs": ["ct", "vt"],
        "execution_mode": "wyzwolenie",
    },
    "directional_67N": {
        "code": "67N",
        "required_inputs": ["3i0", "3u0"],
        "execution_mode": "wyzwolenie",
    },
    # D10 (addytywnie): funkcje ochrony od pracy wyspowej (LoM).
    "rocof_81R": {
        "code": "81R",
        "required_inputs": ["vt"],
        "execution_mode": "wyzwolenie",
    },
    "vector_shift_78": {
        "code": "78",
        "required_inputs": ["vt"],
        "execution_mode": "wyzwolenie",
    },
    "underfrequency_81U": {
        "code": "81U",
        "required_inputs": ["vt"],
        "execution_mode": "wyzwolenie",
    },
    "overfrequency_81O": {
        "code": "81O",
        "required_inputs": ["vt"],
        "execution_mode": "wyzwolenie",
    },
}


def build_field_read_model(case_id: str, enm: EnergyNetworkModel) -> dict[str, Any]:
    branches = {branch.ref_id: branch for branch in enm.branches}
    bays = _collect_bays(enm)
    measurements = {measurement.ref_id: measurement for measurement in enm.measurements}
    measurements_by_bay = _group_measurements_by_bay(enm.measurements)
    protection_by_ref = {assignment.ref_id: assignment for assignment in enm.protection_assignments}
    {transformer.ref_id: transformer for transformer in enm.transformers}
    transformers_by_bus = _group_transformers_by_bus(enm.transformers)
    sources_by_bus = _group_sources_by_bus(enm.sources)
    generators_by_bus = _group_generators_by_bus(enm.generators)

    finished_runs = [run for run in list_runs_for_case(case_id) if run.status == "FINISHED"]
    latest_sc_run = next(
        (run for run in finished_runs if run.analysis_type == "short_circuit_sn"), None
    )
    latest_pf_run = next((run for run in finished_runs if run.analysis_type == "PF"), None)

    items: list[dict[str, Any]] = []
    migrated_count = 0
    requires_completion_count = 0
    source_fields_count = 0
    coupler_fields_count = 0
    fields_with_results_count = 0

    for bay in bays:
        canonical_role = _resolve_canonical_bay_role(bay, generators_by_bus)
        primary_devices = _build_primary_devices(
            bay=bay,
            canonical_role=canonical_role,
            branches=branches,
            measurements_by_bay=measurements_by_bay,
            transformers_by_bus=transformers_by_bus,
            generators_by_bus=generators_by_bus,
        )
        measurement_chain = _build_measurement_chain(bay, measurements_by_bay)
        source_endpoint = _build_source_endpoint(bay, generators_by_bus)
        protection_config = _build_protection_config(
            bay=bay,
            protection_by_ref=protection_by_ref,
        )
        secondary_units = _build_secondary_units(
            measurement_chain=measurement_chain,
            protection_config=protection_config,
        )
        secondary_architecture = _build_secondary_architecture(
            measurement_chain=measurement_chain,
            protection_config=protection_config,
        )
        control_surface = _build_control_surface(primary_devices)
        runtime_state = _build_runtime_state(
            enm=enm,
            bay=bay,
            primary_devices=primary_devices,
            measurement_chain=measurement_chain,
            protection_config=protection_config,
            sources_by_bus=sources_by_bus,
            generators_by_bus=generators_by_bus,
        )
        interlocks = _build_interlocks(
            control_surface=control_surface,
            runtime_state=runtime_state,
        )
        integrity_status = _resolve_integrity_status(
            canonical_role=canonical_role,
            primary_devices=primary_devices,
            measurement_chain=measurement_chain,
            source_endpoint=source_endpoint,
        )

        bay_meta = bay.meta if isinstance(bay.meta, dict) else {}
        switchgear_family_ref = bay_meta.get("switchgear_family_ref")
        base_model = BayBaseModel(
            bay_ref=bay.ref_id,
            bay_role=canonical_role,
            specialization="BRAK",
            substation_ref=bay.substation_ref,
            gpz_section_id=bay.gpz_section_id,
            primary_devices=primary_devices,
            measurement_chain=measurement_chain,
            secondary_units=secondary_units,
            secondary_architecture=secondary_architecture,
            protection_config=protection_config,
            control_surface=control_surface,
            interlocks=interlocks,
            source_endpoint=source_endpoint,
            bay_template_ref=bay.bay_template_ref,
            switchgear_family_ref=(
                switchgear_family_ref if isinstance(switchgear_family_ref, str) else None
            ),
        )

        project_results = _build_project_results(
            bay=bay,
            canonical_role=canonical_role,
            branches=branches,
            measurements=measurements,
            measurements_by_bay=measurements_by_bay,
            transformers_by_bus=transformers_by_bus,
            sources_by_bus=sources_by_bus,
            generators_by_bus=generators_by_bus,
            latest_sc_run_id=str(latest_sc_run.id) if latest_sc_run is not None else None,
            latest_pf_run_id=str(latest_pf_run.id) if latest_pf_run is not None else None,
            measurement_chain=measurement_chain,
        )

        canonical_model = BayCanonicalModel(
            created_from="migracja",
            integrity_status=integrity_status,
            audit_trail_ref=f"bay:{bay.ref_id}",
            base_model=base_model,
            runtime_state=runtime_state,
            scenario_state=None,
            project_results_ref=project_results.run_ref if project_results is not None else None,
        )

        migrated_count += 1
        if integrity_status == "wymaga_uzupelnienia":
            requires_completion_count += 1
        if canonical_role in {"PV_SN", "BESS_SN", "FW_SN"}:
            source_fields_count += 1
        if canonical_role == "SPRZEGLO":
            coupler_fields_count += 1
        if project_results is not None:
            fields_with_results_count += 1

        items.append(
            {
                "bay_id": str(bay.id),
                "bay_ref": bay.ref_id,
                "bay_name": bay.name,
                "canonical_model": canonical_model.model_dump(mode="json"),
                "project_results": (
                    project_results.model_dump(mode="json") if project_results is not None else None
                ),
            }
        )

    has_field_data = bool(items)
    return {
        "case_id": case_id,
        "enm_revision": enm.header.revision,
        "view_status": {
            "data_source": "ENM_FIELD_READ_MODEL",
            "result_state": "FRESH" if has_field_data else "NONE",
            "has_field_data": has_field_data,
        },
        "summary": {
            "total_fields": len(items),
            "migrated_count": migrated_count,
            "requires_completion_count": requires_completion_count,
            "source_fields_count": source_fields_count,
            "coupler_fields_count": coupler_fields_count,
            "fields_with_results_count": fields_with_results_count,
        },
        "fields": items,
    }


def _collect_bays(enm: EnergyNetworkModel) -> list[Bay]:
    bays_by_ref = {bay.ref_id: bay for bay in enm.bays}

    for substation in enm.substations:
        for spec in _iter_field_specs(substation):
            field_ref = spec.get("field_ref")
            bus_ref = spec.get("bus_ref")
            bay_role = spec.get("bay_role")
            if (
                not isinstance(field_ref, str)
                or not field_ref
                or field_ref in bays_by_ref
                or not isinstance(bus_ref, str)
                or not bus_ref
                or not isinstance(bay_role, str)
                or not bay_role
            ):
                continue

            spec_meta = dict(spec.get("meta") or {})
            # Powiązania producenckie z field_spec (konwencja kreatora stacji) —
            # dostępne w read-modelu pola (E-27/E-11) i przez Bay.bay_template_ref
            # dla dalszych konsumentów (SLD internal_layout, Reference Engine).
            switchgear_family_ref = spec.get("switchgear_family_ref")
            manufacturer_ref = spec.get("manufacturer_ref")
            if switchgear_family_ref and "switchgear_family_ref" not in spec_meta:
                spec_meta["switchgear_family_ref"] = switchgear_family_ref
            if manufacturer_ref and "manufacturer_ref" not in spec_meta:
                spec_meta["manufacturer_ref"] = manufacturer_ref
            # G-STK-8: ograniczniki przepięć pola (add_surge_arrester_sn) — kanał
            # field_spec. Przenieś na Bay.meta, aby _build_primary_devices
            # zaprojektował je na aparaty SURGE_ARRESTER (glif SLD).
            spec_arresters = spec.get("surge_arresters")
            if isinstance(spec_arresters, list) and "surge_arresters" not in spec_meta:
                spec_meta["surge_arresters"] = spec_arresters
            bays_by_ref[field_ref] = Bay(
                id=uuid5(NAMESPACE_URL, field_ref),
                ref_id=field_ref,
                name=spec.get("name") or field_ref,
                tags=list(spec.get("tags") or []),
                meta=spec_meta,
                bay_role=bay_role,
                substation_ref=substation.ref_id,
                bus_ref=bus_ref,
                gpz_section_id=spec.get("gpz_section_id"),
                equipment_refs=list(spec.get("equipment_refs") or []),
                protection_ref=spec.get("protection_ref"),
                protection_codes=list(spec.get("protection_codes") or []),
                bay_template_ref=spec.get("bay_template_ref"),
                # W1 (RECENZJA_L2 §1/§12.1, V12K-145): aparaty pierwotne pola
                # zmaterializowane z szablonu kreatora na field_spec — przenieś na
                # snapshot Bay, aby konsumenci Bay.primary_devices (read-model pola,
                # reference_engine/compliance, interlock W034) i adapter SLD widzieli
                # TĘ SAMĄ konfigurację. Puste = brak danych (ścieżka konwencji).
                primary_devices=list(spec.get("primary_devices") or []),
            )

    return sorted(bays_by_ref.values(), key=lambda item: (item.substation_ref, item.ref_id))


def _iter_field_specs(substation: Any) -> list[dict[str, Any]]:
    meta = getattr(substation, "meta", None)
    if isinstance(meta, dict):
        collected: list[dict[str, Any]] = []
        for key in ("field_specs", "nn_field_specs"):
            raw_specs = meta.get(key)
            if isinstance(raw_specs, list):
                collected.extend(spec for spec in raw_specs if isinstance(spec, dict))
        if collected:
            return collected

    gpz_sections = getattr(substation, "gpz_sections", None) or []
    synthesized: list[dict[str, Any]] = []
    for section in gpz_sections:
        field_ref = f"{substation.ref_id}:section:{section.section_id}:field"
        synthesized.append(
            {
                "field_ref": field_ref,
                "name": section.line_field_name or f"Pole GPZ {section.order + 1}",
                "bay_role": "FEEDER",
                "bus_ref": section.bus_ref,
                "gpz_section_id": section.section_id,
                "equipment_refs": [],
                "protection_ref": None,
                "tags": ["gpz_line_field"],
                "meta": {
                    "gpz_section_id": section.section_id,
                    "gpz_section_order": section.order,
                },
            }
        )
    return synthesized


def _group_measurements_by_bay(measurements: list[Measurement]) -> dict[str, list[Measurement]]:
    grouped: dict[str, list[Measurement]] = {}
    for measurement in measurements:
        if not measurement.bay_ref:
            continue
        grouped.setdefault(measurement.bay_ref, []).append(measurement)
    for items in grouped.values():
        items.sort(key=lambda item: item.ref_id)
    return grouped


def _group_transformers_by_bus(transformers: list[Transformer]) -> dict[str, list[Transformer]]:
    grouped: dict[str, list[Transformer]] = {}
    for transformer in transformers:
        grouped.setdefault(transformer.hv_bus_ref, []).append(transformer)
        grouped.setdefault(transformer.lv_bus_ref, []).append(transformer)
    for items in grouped.values():
        items.sort(key=lambda item: item.ref_id)
    return grouped


def _group_sources_by_bus(sources: list[Source]) -> dict[str, list[Source]]:
    grouped: dict[str, list[Source]] = {}
    for source in sources:
        grouped.setdefault(source.bus_ref, []).append(source)
    for items in grouped.values():
        items.sort(key=lambda item: item.ref_id)
    return grouped


def _group_generators_by_bus(generators: list[Generator]) -> dict[str, list[Generator]]:
    grouped: dict[str, list[Generator]] = {}
    for generator in generators:
        grouped.setdefault(generator.bus_ref, []).append(generator)
    for items in grouped.values():
        items.sort(key=lambda item: item.ref_id)
    return grouped


def _resolve_canonical_bay_role(
    bay: Bay,
    generators_by_bus: dict[str, list[Generator]],
) -> str:
    if bay.bay_role == "OZE":
        generators = generators_by_bus.get(bay.bus_ref, [])
        generator_types = {str(generator.gen_type).upper() for generator in generators}
        if {"BESS", "BESS_INVERTER"} & generator_types:
            return "BESS_SN"
        if {"WIND_INVERTER", "FW_PMSG", "FW_DFIG", "FW_SCIG"} & generator_types:
            return "FW_SN"
        return "PV_SN"
    return CANONICAL_BAY_ROLE_MAP.get(bay.bay_role, "LINIA_OUT")


def _build_primary_devices(
    *,
    bay: Bay,
    canonical_role: str,
    branches: dict[str, Branch],
    measurements_by_bay: dict[str, list[Measurement]],
    transformers_by_bus: dict[str, list[Transformer]],
    generators_by_bus: dict[str, list[Generator]],
) -> list[BayPrimaryDevice]:
    # W1 (RECENZJA_L2 §12.1, V12K-145): PRYMAT DANYCH nad przeliczeniem — jeśli
    # pole niesie już zmaterializowane aparaty pierwotne (szablon kreatora,
    # `_collect_bays`), użyj ICH (schemat = odwzorowanie konfiguracji kreatora),
    # zamiast wnioskować z equipment. Puste = przelicz z equipment jak dotąd.
    if bay.primary_devices:
        return list(bay.primary_devices)
    devices: list[BayPrimaryDevice] = []
    for ref in sorted(bay.equipment_refs):
        branch = branches.get(ref)
        if branch is None:
            continue
        mapped = _branch_to_primary_device(branch)
        if mapped is not None:
            devices.append(mapped)

    for measurement in measurements_by_bay.get(bay.ref_id, []):
        devices.append(_measurement_to_primary_device(measurement))

    if canonical_role == "TRANSFORMATOROWE":
        transformers = transformers_by_bus.get(bay.bus_ref, [])
        if transformers:
            transformer = transformers[0]
            devices.append(
                BayPrimaryDevice(
                    device_ref=transformer.ref_id,
                    linked_ref=transformer.ref_id,
                    catalog_ref=transformer.catalog_ref,
                    symbol_ref="symbol:transformer_device",
                    kind="TRANSFORMER_DEVICE",
                    placement="DOWNSTREAM",
                    is_controllable=False,
                    render_variant="kanoniczny",
                )
            )

    generators = generators_by_bus.get(bay.bus_ref, [])
    generator = generators[0] if generators else None
    if canonical_role == "PV_SN" and generator is not None:
        devices.append(
            BayPrimaryDevice(
                device_ref=generator.ref_id,
                linked_ref=generator.ref_id,
                catalog_ref=generator.catalog_ref,
                symbol_ref="symbol:generator_pv",
                kind="GENERATOR_PV",
                placement="DOWNSTREAM",
                is_controllable=False,
                render_variant="kanoniczny",
            )
        )
    if canonical_role == "BESS_SN" and generator is not None:
        devices.append(
            BayPrimaryDevice(
                device_ref=generator.ref_id,
                linked_ref=generator.ref_id,
                catalog_ref=generator.catalog_ref,
                symbol_ref="symbol:generator_bess",
                kind="GENERATOR_BESS",
                placement="DOWNSTREAM",
                is_controllable=False,
                render_variant="kanoniczny",
            )
        )
    if canonical_role == "FW_SN" and generator is not None:
        devices.append(
            BayPrimaryDevice(
                device_ref=generator.ref_id,
                linked_ref=generator.ref_id,
                catalog_ref=generator.catalog_ref,
                symbol_ref="symbol:generator_fw",
                kind="GENERATOR_FW",
                placement="DOWNSTREAM",
                is_controllable=False,
                render_variant="kanoniczny",
            )
        )

    # G-STK-8: ograniczniki przepięć z field_spec (Bay.meta["surge_arresters"]).
    # Aparat gałęzi uziemiającej (GROUND_BRANCH, earthing_role=surge_ground) —
    # rysowany na SLD (glif surge_arrester_10ka) i czytany przez most koordynacji
    # izolacji IEC 60071. Zero domysłu: tylko gdy dane obecne.
    bay_meta = bay.meta if isinstance(bay.meta, dict) else {}
    raw_arresters = bay_meta.get("surge_arresters")
    if isinstance(raw_arresters, list):
        for item in raw_arresters:
            if not isinstance(item, dict):
                continue
            device_ref = item.get("device_ref")
            if not isinstance(device_ref, str) or not device_ref:
                continue
            catalog_ref = item.get("catalog_ref")
            devices.append(
                BayPrimaryDevice(
                    device_ref=device_ref,
                    catalog_ref=catalog_ref if isinstance(catalog_ref, str) else None,
                    symbol_ref="symbol:surge_arrester_10ka",
                    kind="SURGE_ARRESTER",
                    placement="GROUND_BRANCH",
                    is_controllable=False,
                    render_variant="kanoniczny",
                    earthing_role="surge_ground",
                )
            )

    devices.sort(key=lambda item: (item.placement, item.device_ref))

    if canonical_role == "SPRZEGLO":
        _assign_coupler_sides(devices)

    return devices


def _branch_to_primary_device(branch: Branch) -> BayPrimaryDevice | None:
    mapped = BRANCH_KIND_MAP.get(getattr(branch, "type", ""))
    if mapped is None:
        return None
    kind, placement, controllable = mapped
    switch_state = _build_switch_state_from_branch(branch) if controllable else None
    operating_state = _build_operating_state_from_switch_state(switch_state)
    return BayPrimaryDevice(
        device_ref=branch.ref_id,
        linked_ref=branch.ref_id,
        catalog_ref=getattr(branch, "catalog_ref", None),
        symbol_ref=f"symbol:{kind.lower()}",
        kind=kind,
        placement=placement,
        is_controllable=controllable,
        render_variant="kanoniczny",
        switch_state=switch_state,
        operating_state=operating_state,
    )


def _measurement_to_primary_device(measurement: Measurement) -> BayPrimaryDevice:
    kind = "CT" if measurement.measurement_type == "CT" else "VT"
    placement = "MIDSTREAM" if kind == "CT" else "OFF_PATH"
    return BayPrimaryDevice(
        device_ref=measurement.ref_id,
        linked_ref=measurement.ref_id,
        catalog_ref=measurement.catalog_ref,
        symbol_ref=f"symbol:{kind.lower()}",
        kind=kind,
        placement=placement,
        is_controllable=False,
        render_variant="kanoniczny",
    )


def _build_switch_state_from_branch(branch: Branch) -> BaySwitchState | None:
    if not isinstance(branch, SwitchBranch):
        return None
    actual_state = "zamkniety" if branch.status == "closed" else "otwarty"
    return BaySwitchState(
        actual_state=actual_state,
        commanded_state=None,
        control_mode="zdalne",
        armed_for_close=True,
        armed_for_open=True,
        communication_ok=True,
        interlock_blocked=False,
        cause_code=None,
    )


def _build_operating_state_from_switch_state(
    switch_state: BaySwitchState | None,
) -> BayOperatingState | None:
    if switch_state is None:
        return None
    current_position = (
        "zamkniety"
        if switch_state.actual_state in {"zamkniety", "zamkniety_naped_rozbrojony"}
        else (
            "otwarty"
            if switch_state.actual_state in {"otwarty", "otwarty_naped_rozbrojony"}
            else "nieznany"
        )
    )
    normal_position = "zamkniety" if current_position == "zamkniety" else "otwarty"
    return BayOperatingState(
        normal_position=normal_position,
        current_position=current_position,
        discrepancy_alarm=False,
    )


def _assign_coupler_sides(devices: list[BayPrimaryDevice]) -> None:
    controllable = [device for device in devices if device.is_controllable]
    if not controllable:
        return
    if len(controllable) == 1:
        controllable[0].section_side = "CENTER"
        return
    if len(controllable) == 2:
        controllable[0].section_side = "LEFT"
        controllable[1].section_side = "RIGHT"
        return
    controllable[0].section_side = "LEFT"
    controllable[-1].section_side = "RIGHT"
    for device in controllable[1:-1]:
        device.section_side = "CENTER"


def _build_measurement_chain(
    bay: Bay,
    measurements_by_bay: dict[str, list[Measurement]],
) -> BayMeasurementChain | None:
    measurements = measurements_by_bay.get(bay.ref_id, [])
    if not measurements:
        return None
    ct_measurements = [
        measurement for measurement in measurements if measurement.measurement_type == "CT"
    ]
    ct_refs = [measurement.ref_id for measurement in ct_measurements]
    vt_refs = [
        measurement.ref_id for measurement in measurements if measurement.measurement_type == "VT"
    ]
    uses_3i0 = bool(ct_refs)
    uses_3u0 = any(
        measurement.connection == "delta"
        for measurement in measurements
        if measurement.measurement_type == "VT"
    )
    topology = "ct_vt" if ct_refs and vt_refs else "ct_only" if ct_refs else "vt_only"
    if uses_3u0 and topology == "ct_vt":
        topology = "ct_vt_3u0"
    # F10.6 (SLD_CAD_SPEC_V3 §18.3, D3): wyczyszczenie heurystyki —
    # dawniej `"suma_ct" if uses_3i0 else "brak"` ZAWSZE zgadywało 3×CT
    # sumujące, nigdy przekładnik Ferrantiego, dla KAŻDEGO pola z jakimkolwiek
    # CT. Teraz czytamy `Measurement.ct_arrangement` (dana projektowa); brak
    # danych o układzie = uczciwe "brak", NIE zgadywanie (WHITE BOX,
    # domain_no_guessing_guard).
    if any(m.ct_arrangement == "ferranti" for m in ct_measurements):
        zero_sequence_current_source: Literal[
            "suma_ct", "przekladnik_ferrantiego", "zewnetrzne", "brak"
        ] = "przekladnik_ferrantiego"
    elif any(m.ct_arrangement == "3xCT" for m in ct_measurements):
        zero_sequence_current_source = "suma_ct"
    else:
        zero_sequence_current_source = "brak"
    return BayMeasurementChain(
        chain_ref=f"measurement-chain:{bay.ref_id}",
        ct_refs=ct_refs,
        vt_refs=vt_refs,
        uses_3i0=uses_3i0,
        uses_3u0=uses_3u0,
        zero_sequence_current_source=zero_sequence_current_source,
        zero_sequence_voltage_source="otwarty_trojkat_vt" if uses_3u0 else "brak",
        topology=topology,
        measurement_sets=[
            BayMeasurementSet(
                side="pole",
                values=BayMeasurements(
                    frequency_hz=50.0,
                ),
            )
        ],
    )


def _build_secondary_units(
    *,
    measurement_chain: BayMeasurementChain | None,
    protection_config: BayProtectionControlUnit | None,
) -> list[BaySecondaryUnitRef]:
    units: list[BaySecondaryUnitRef] = []
    if protection_config is not None:
        units.append(
            BaySecondaryUnitRef(
                unit_ref=protection_config.unit_ref,
                unit_kind="zabezpieczenie",
                shared_with_bay_refs=[],
            )
        )
    if measurement_chain is not None:
        units.append(
            BaySecondaryUnitRef(
                unit_ref=measurement_chain.chain_ref,
                unit_kind="pomiar",
                shared_with_bay_refs=[],
            )
        )
    return units


def _build_secondary_architecture(
    *,
    measurement_chain: BayMeasurementChain | None,
    protection_config: BayProtectionControlUnit | None,
) -> BaySecondaryArchitecture:
    if protection_config is not None and measurement_chain is not None:
        return BaySecondaryArchitecture(
            type="zintegrowane_zabezpieczenie_i_sterownik",
            measurement_provider="zabezpieczenie",
        )
    if protection_config is not None:
        return BaySecondaryArchitecture(
            type="tylko_zabezpieczenie",
            measurement_provider="brak",
        )
    if measurement_chain is not None:
        return BaySecondaryArchitecture(
            type="brak_urzadzenia_wtornego",
            measurement_provider="osobny_uklad_pomiarowy",
        )
    return BaySecondaryArchitecture(
        type="brak_urzadzenia_wtornego",
        measurement_provider="brak",
    )


def _build_protection_config(
    *,
    bay: Bay,
    protection_by_ref: dict[str, ProtectionAssignment],
) -> BayProtectionControlUnit | None:
    if not bay.protection_ref:
        return None
    assignment = protection_by_ref.get(bay.protection_ref)
    if assignment is None:
        return None
    functions = [
        _setting_to_function_state(setting, assignment.breaker_ref)
        for setting in assignment.settings
    ]
    return BayProtectionControlUnit(
        unit_ref=assignment.ref_id,
        manufacturer=None,
        model=assignment.device_type,
        functions=functions,
        measurement_inputs={
            "uses_ct": assignment.ct_ref is not None,
            "uses_vt": assignment.vt_ref is not None,
            "uses_3i0": assignment.ct_ref is not None,
            "uses_3u0": assignment.vt_ref is not None,
        },
        automation_features={
            "synchrocheck_enabled": any(function.code == "25" for function in functions),
            "arc_protection_enabled": False,
            "breaker_failure_enabled": any(function.code == "50BF" for function in functions),
        },
        spz=None,
        alarms=[],
        events=[],
        settings_mode="reczne",
        settings_ref=f"settings:{assignment.ref_id}",
    )


def _setting_to_function_state(
    setting: ProtectionSetting,
    breaker_ref: str,
) -> ProtectionFunctionState:
    meta = FUNCTION_TYPE_MAP.get(setting.function_type, {})
    threshold_value = setting.threshold_a
    time_delay_value = setting.time_delay_s
    settings: list[ProtectionSettingValue] = []
    if threshold_value is not None:
        settings.append(
            ProtectionSettingValue(
                key="prog",
                value=threshold_value,
                unit="A",
                quality="reczne",
            )
        )
    if time_delay_value is not None:
        settings.append(
            ProtectionSettingValue(
                key="zwloka",
                value=time_delay_value,
                unit="s",
                quality="reczne",
            )
        )
    if setting.curve_type is not None:
        settings.append(
            ProtectionSettingValue(
                key="krzywa",
                value=setting.curve_type,
                unit=None,
                quality="reczne",
            )
        )
    # D10 (addytywnie): nastawy funkcji LoM (df/dt, przesunięcie wektora, próg f).
    if setting.threshold_hz_s is not None:
        settings.append(
            ProtectionSettingValue(
                key="df_dt",
                value=setting.threshold_hz_s,
                unit="Hz/s",
                quality="reczne",
            )
        )
    if setting.threshold_deg is not None:
        settings.append(
            ProtectionSettingValue(
                key="przesuniecie_wektora",
                value=setting.threshold_deg,
                unit="deg",
                quality="reczne",
            )
        )
    if setting.threshold_hz is not None:
        settings.append(
            ProtectionSettingValue(
                key="prog_czestotliwosci",
                value=setting.threshold_hz,
                unit="Hz",
                quality="reczne",
            )
        )
    return ProtectionFunctionState(
        code=meta.get("code", setting.function_type),
        available=True,
        enabled=True,
        picked_up=False,
        tripped=False,
        blocked=False,
        required_inputs=list(meta.get("required_inputs", [])),
        optional_inputs=[],
        missing_input_policy="ostrzezenie",
        settings_ref=f"setting:{setting.function_type}",
        settings=settings,
        execution_mode=meta.get("execution_mode", "tylko_alarm"),
        execution_device_ref=breaker_ref,
        starts_spz=False,
        blocks_reclose=False,
        operator_ack_required_after_trip=False,
    )


def _build_control_surface(primary_devices: list[BayPrimaryDevice]) -> BayControlSurface:
    controllable = [device.device_ref for device in primary_devices if device.is_controllable]
    return BayControlSurface(
        controllable_device_refs=controllable,
        open_requires_confirmation=False,
        close_requires_confirmation=True,
        kas_available=False,
        local_remote_transfer_supported=bool(controllable),
    )


def _build_runtime_state(
    *,
    enm: EnergyNetworkModel,
    bay: Bay,
    primary_devices: list[BayPrimaryDevice],
    measurement_chain: BayMeasurementChain | None,
    protection_config: BayProtectionControlUnit | None,
    sources_by_bus: dict[str, list[Source]],
    generators_by_bus: dict[str, list[Generator]],
) -> BayRuntimeState:
    has_secondary = protection_config is not None or measurement_chain is not None
    primary_device_states = {
        device.device_ref: device.switch_state
        for device in primary_devices
        if device.switch_state is not None
    }
    communication_status = "degraded" if has_secondary else "offline"
    measurement_availability = "czesciowe" if measurement_chain is not None else "niedostepne"
    control_availability = (
        "czesciowo_dostepne"
        if any(device.is_controllable for device in primary_devices) and has_secondary
        else "niedostepne"
    )
    energization = _build_energization_state(
        bay=bay,
        primary_devices=primary_devices,
        sources_by_bus=sources_by_bus,
        generators_by_bus=generators_by_bus,
    )
    return BayRuntimeState(
        secondary_communication_status=communication_status,
        last_good_update_at=enm.header.updated_at if has_secondary else None,
        control_availability=control_availability,
        measurement_availability=measurement_availability,
        primary_device_states=primary_device_states,
        active_alarms=[],
        pending_command=None,
        energization_and_safety=energization,
    )


def _build_energization_state(
    *,
    bay: Bay,
    primary_devices: list[BayPrimaryDevice],
    sources_by_bus: dict[str, list[Source]],
    generators_by_bus: dict[str, list[Generator]],
) -> BayEnergizationSafetyState:
    energized_from_bus_side = bool(sources_by_bus.get(bay.bus_ref))
    energized_from_feeder_side = bool(generators_by_bus.get(bay.bus_ref))
    grounded = any(
        device.kind == "ES"
        and device.switch_state is not None
        and device.switch_state.actual_state == "zamkniety"
        for device in primary_devices
    )
    visible_isolation_gap = any(
        device.kind in {"DS", "LOAD_SWITCH"}
        and device.switch_state is not None
        and device.switch_state.actual_state == "otwarty"
        for device in primary_devices
    )
    safe_to_work = (
        not energized_from_bus_side
        and not energized_from_feeder_side
        and (grounded or visible_isolation_gap)
    )
    unsafe_reason = None
    if not safe_to_work:
        unsafe_reason = "Brak potwierdzonego stanu beznapięciowego lub uziemienia pola."
    return BayEnergizationSafetyState(
        energized_from_bus_side=energized_from_bus_side,
        energized_from_feeder_side=energized_from_feeder_side,
        grounded=grounded,
        visible_isolation_gap=visible_isolation_gap,
        safe_to_work=safe_to_work,
        unsafe_reason_pl=unsafe_reason,
    )


def _build_interlocks(
    *,
    control_surface: BayControlSurface,
    runtime_state: BayRuntimeState | None,
) -> BayInterlockSet:
    entries: list[InterlockEntry] = []
    if (
        runtime_state is not None
        and runtime_state.secondary_communication_status == "offline"
        and control_surface.controllable_device_refs
    ):
        entries.append(
            InterlockEntry(
                code="BRAK_LACZNOSCI_WTORNEJ",
                active=True,
                reason="Sterowanie zablokowane z powodu braku łączności urządzenia wtórnego.",
                blocking_device_refs=list(control_surface.controllable_device_refs),
            )
        )
    return BayInterlockSet(entries=entries)


def _resolve_integrity_status(
    *,
    canonical_role: str,
    primary_devices: list[BayPrimaryDevice],
    measurement_chain: BayMeasurementChain | None,
    source_endpoint: BaySourceEndpoint | None,
) -> str:
    controllable_count = sum(1 for device in primary_devices if device.is_controllable)
    has_vt = any(device.kind == "VT" for device in primary_devices)
    if canonical_role == "SPRZEGLO":
        return "po_migracji" if controllable_count >= 2 else "wymaga_uzupelnienia"
    if canonical_role == "POMIAROWE":
        return "po_migracji" if measurement_chain is not None and has_vt else "wymaga_uzupelnienia"
    if canonical_role in {"PV_SN", "BESS_SN", "FW_SN"}:
        if source_endpoint is None or measurement_chain is None:
            return "wymaga_uzupelnienia"
        if source_endpoint.requires_vt and not has_vt:
            return "wymaga_uzupelnienia"
        return "po_migracji"
    if controllable_count == 0:
        return "wymaga_uzupelnienia"
    return "po_migracji"


_OPERATING_MODES = {"praca_sieciowa", "ladowanie", "rozladowanie", "gotowosc", "odstawione"}


def _generator_operating_mode(generator: Generator) -> str:
    """F11.3 (dyrektywa D2, finał F9.6b): tryb pracy źródła z REALNEGO kanału
    danych — `Generator.meta['operating_mode']`, zapisywanego operacją
    domenową `set_source_operating_mode` (domain_operations_v2.py). Poprzednio
    ta funkcja wpisywała stałą "gotowosc" IGNORUJĄC istniejącą daną (fabrykacja
    jednolitego stanu — znalezisko F10.6). Wartość spoza słownika/nieobecna →
    default modelu "gotowosc" (deklarowany default Pydantic `BaySourceEndpoint.
    operating_mode`, semantyka modelu — nie zgadywanie read-modelu)."""
    meta = getattr(generator, "meta", None) or {}
    mode = meta.get("operating_mode")
    if isinstance(mode, str) and mode in _OPERATING_MODES:
        return mode
    return "gotowosc"


def _build_source_endpoint(
    bay: Bay,
    generators_by_bus: dict[str, list[Generator]],
) -> BaySourceEndpoint | None:
    generators = generators_by_bus.get(bay.bus_ref, [])
    if not generators:
        return None
    generator = generators[0]
    operating_mode = _generator_operating_mode(generator)
    if generator.gen_type == "bess":
        return BaySourceEndpoint(
            source_kind="BESS",
            inverter_ref=generator.ref_id,
            storage_ref=generator.ref_id,
            block_transformer_ref=generator.blocking_transformer_ref,
            requires_vt=True,
            requires_synchrocheck=False,
            operating_mode=operating_mode,
        )
    if generator.gen_type in {"wind_inverter", "fw_pmsg", "fw_dfig", "fw_scig"}:
        return BaySourceEndpoint(
            source_kind="FW",
            turbine_ref=generator.ref_id,
            block_transformer_ref=generator.blocking_transformer_ref,
            requires_vt=True,
            requires_synchrocheck=True,
            operating_mode=operating_mode,
        )
    return BaySourceEndpoint(
        source_kind="PV",
        inverter_ref=generator.ref_id,
        block_transformer_ref=generator.blocking_transformer_ref,
        requires_vt=True,
        requires_synchrocheck=False,
        operating_mode=operating_mode,
    )


def _build_project_results(
    *,
    bay: Bay,
    canonical_role: str,
    branches: dict[str, Branch],
    measurements: dict[str, Measurement],
    measurements_by_bay: dict[str, list[Measurement]],
    transformers_by_bus: dict[str, list[Transformer]],
    sources_by_bus: dict[str, list[Source]],
    generators_by_bus: dict[str, list[Generator]],
    latest_sc_run_id: str | None,
    latest_pf_run_id: str | None,
    measurement_chain: BayMeasurementChain | None,
) -> BayProjectResults | None:
    run_ref = latest_pf_run_id or latest_sc_run_id
    if run_ref is None:
        return None
    result_state, result_message = _resolve_project_result_state(
        latest_sc_run_id=latest_sc_run_id,
        latest_pf_run_id=latest_pf_run_id,
    )

    sc_contributions = _build_short_circuit_contributions(
        bay=bay,
        branches=branches,
        sources_by_bus=sources_by_bus,
        generators_by_bus=generators_by_bus,
        transformers_by_bus=transformers_by_bus,
    )
    pf_contributions = _build_power_flow_contributions(
        bay=bay,
        branches=branches,
        sources_by_bus=sources_by_bus,
        generators_by_bus=generators_by_bus,
        transformers_by_bus=transformers_by_bus,
    )
    earth_fault_path = _build_earth_fault_path(
        bay=bay,
        measurement_chain=measurement_chain,
        sources_by_bus=sources_by_bus,
        transformers_by_bus=transformers_by_bus,
    )
    proof_binding = BayProofBinding(
        proof_ref=f"proof:{bay.ref_id}:{run_ref}",
        primary_result_refs=[
            ref for ref in [latest_sc_run_id, latest_pf_run_id] if ref is not None
        ],
        secondary_result_refs=[],
        source_contribution_refs=[f"sc:{item.source_ref}" for item in sc_contributions]
        + [f"pf:{item.source_ref}" for item in pf_contributions],
        formula_refs=[],
        input_data_refs=sorted(
            bay.equipment_refs
            + [measurement.ref_id for measurement in measurements_by_bay.get(bay.ref_id, [])]
            + ([bay.protection_ref] if bay.protection_ref else [])
        ),
    )
    return BayProjectResults(
        run_ref=run_ref,
        result_state=result_state,
        result_message_pl=result_message,
        main_short_circuit_results_ref=latest_sc_run_id,
        main_power_flow_results_ref=latest_pf_run_id,
        source_contributions_sc=sc_contributions,
        source_contributions_pf=pf_contributions,
        verification=BayVerificationResult(
            ct_ok=True if measurement_chain and measurement_chain.ct_refs else None,
            vt_ok=True if measurement_chain and measurement_chain.vt_refs else None,
            cable_head_ok=None,
            whole_power_path_ok=bool(bay.equipment_refs),
        ),
        earth_fault_path=earth_fault_path,
        proof_binding=proof_binding,
    )


def _resolve_project_result_state(
    *,
    latest_sc_run_id: str | None,
    latest_pf_run_id: str | None,
) -> tuple[str, str | None]:
    if latest_sc_run_id and latest_pf_run_id:
        return "pelny", "Dostepne sa wyniki zwarciowe i rozplywowe pola."
    if latest_sc_run_id or latest_pf_run_id:
        return "czesciowy", "Dostepny jest czesciowy zestaw wynikow pola."
    return "bledny", "Brak poprawnych wynikow projektowych pola."


def _build_short_circuit_contributions(
    *,
    bay: Bay,
    branches: dict[str, Branch],
    sources_by_bus: dict[str, list[Source]],
    generators_by_bus: dict[str, list[Generator]],
    transformers_by_bus: dict[str, list[Transformer]],
) -> list[BayShortCircuitSourceContribution]:
    contributions: list[BayShortCircuitSourceContribution] = []
    reference_bus_refs = _collect_reference_bus_refs(bay, branches)
    for bus_ref in reference_bus_refs:
        for source in sources_by_bus.get(bus_ref, []):
            contributions.append(
                BayShortCircuitSourceContribution(
                    source_ref=source.ref_id,
                    source_kind="GPZ",
                    reference_point=bus_ref,
                    fault_type="3F",
                )
            )
        for generator in generators_by_bus.get(bus_ref, []):
            contributions.append(
                BayShortCircuitSourceContribution(
                    source_ref=generator.ref_id,
                    source_kind=_generator_source_kind(generator),
                    reference_point=bus_ref,
                    fault_type="3F",
                )
            )
        for transformer in transformers_by_bus.get(bus_ref, []):
            contributions.append(
                BayShortCircuitSourceContribution(
                    source_ref=transformer.ref_id,
                    source_kind="TRANSFORMATOR",
                    reference_point=bus_ref,
                    fault_type="3F",
                )
            )
    contributions.sort(key=lambda item: (item.source_kind, item.source_ref, item.reference_point))
    return _dedupe_contributions(contributions)


def _build_power_flow_contributions(
    *,
    bay: Bay,
    branches: dict[str, Branch],
    sources_by_bus: dict[str, list[Source]],
    generators_by_bus: dict[str, list[Generator]],
    transformers_by_bus: dict[str, list[Transformer]],
) -> list[BayPowerFlowSourceContribution]:
    contributions: list[BayPowerFlowSourceContribution] = []
    reference_bus_refs = _collect_reference_bus_refs(bay, branches)
    for bus_ref in reference_bus_refs:
        for source in sources_by_bus.get(bus_ref, []):
            contributions.append(
                BayPowerFlowSourceContribution(
                    source_ref=source.ref_id,
                    source_kind="GPZ",
                    reference_point=bus_ref,
                )
            )
        for generator in generators_by_bus.get(bus_ref, []):
            contributions.append(
                BayPowerFlowSourceContribution(
                    source_ref=generator.ref_id,
                    source_kind=_generator_source_kind(generator),
                    reference_point=bus_ref,
                    p_mw=generator.p_mw,
                    q_mvar=generator.q_mvar,
                    s_mva=generator.p_mw,
                )
            )
        for transformer in transformers_by_bus.get(bus_ref, []):
            contributions.append(
                BayPowerFlowSourceContribution(
                    source_ref=transformer.ref_id,
                    source_kind="TRANSFORMATOR",
                    reference_point=bus_ref,
                )
            )
    contributions.sort(key=lambda item: (item.source_kind, item.source_ref, item.reference_point))
    return _dedupe_pf_contributions(contributions)


def _collect_reference_bus_refs(
    bay: Bay,
    branches: dict[str, Branch],
) -> list[str]:
    refs = {bay.bus_ref}
    for ref in bay.equipment_refs:
        branch = branches.get(ref)
        if branch is None:
            continue
        refs.add(branch.from_bus_ref)
        refs.add(branch.to_bus_ref)
    return sorted(refs)


def _dedupe_contributions(
    contributions: list[BayShortCircuitSourceContribution],
) -> list[BayShortCircuitSourceContribution]:
    unique: dict[tuple[str, str, str], BayShortCircuitSourceContribution] = {}
    for item in contributions:
        unique[(item.source_ref, item.source_kind, item.reference_point)] = item
    return list(unique.values())


def _dedupe_pf_contributions(
    contributions: list[BayPowerFlowSourceContribution],
) -> list[BayPowerFlowSourceContribution]:
    unique: dict[tuple[str, str, str], BayPowerFlowSourceContribution] = {}
    for item in contributions:
        unique[(item.source_ref, item.source_kind, item.reference_point)] = item
    return list(unique.values())


def _generator_source_kind(generator: Generator) -> str:
    if generator.gen_type == "bess":
        return "BESS"
    if generator.gen_type == "wind_inverter":
        return "FW"
    if generator.gen_type == "pv_inverter":
        return "PV"
    return "INNE"


def _build_earth_fault_path(
    *,
    bay: Bay,
    measurement_chain: BayMeasurementChain | None,
    sources_by_bus: dict[str, list[Source]],
    transformers_by_bus: dict[str, list[Transformer]],
) -> BayEarthFaultPath | None:
    if measurement_chain is None and not sources_by_bus.get(bay.bus_ref):
        return None
    transformers = transformers_by_bus.get(bay.bus_ref, [])
    return BayEarthFaultPath(
        neutral_grounding_mode=_resolve_neutral_grounding_mode(
            sources=sources_by_bus.get(bay.bus_ref, []),
            transformers=transformers,
        ),
        zero_sequence_current_source=(
            measurement_chain.zero_sequence_current_source
            if measurement_chain is not None
            else "brak"
        ),
        zero_sequence_voltage_source=(
            measurement_chain.zero_sequence_voltage_source
            if measurement_chain is not None
            else "brak"
        ),
        closure_path_elements=sorted(
            [bay.bus_ref]
            + [source.ref_id for source in sources_by_bus.get(bay.bus_ref, [])]
            + [transformer.ref_id for transformer in transformers]
        ),
        transformer_contribution_ref=transformers[0].ref_id if transformers else None,
        grounding_device_ref=None,
    )


def _resolve_neutral_grounding_mode(
    *,
    sources: list[Source],
    transformers: list[Transformer],
) -> str:
    for transformer in transformers:
        if transformer.hv_neutral is not None:
            return _map_grounding_type(transformer.hv_neutral)
        if transformer.lv_neutral is not None:
            return _map_grounding_type(transformer.lv_neutral)
    # V12K-246: brak danych o punkcie neutralnym to „nieznany", NIE „bezposrednio
    # uziemiony". Poprzedni domysl zamienial BRAK DANEJ w najmniej ostrozny werdykt:
    # w sieci bezposrednio uziemionej prad zwarcia doziemnego jest duzy i mierzalny
    # kryterium nadpradowym, wiec dobor zabezpieczen NIE zglaszal potrzeby kryterium
    # kierunkowego — a polskie sieci SN sa w wiekszosci kompensowane albo uziemione
    # przez rezystor. Obecnosc zrodla na szynie nie mowi NIC o sposobie uziemienia.
    return "nieznany"


def _map_grounding_type(grounding: GroundingConfig) -> str:
    mapping = {
        "isolated": "izolowany",
        "petersen_coil": "cewka_petersena",
        "resistor_grounded": "rezystor",
        "directly_grounded": "bezposrednio_uziemiony",
    }
    return mapping.get(grounding.type, "nieznany")
