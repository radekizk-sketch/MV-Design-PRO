import pytest
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    GroundingConfig,
    Source,
    SwitchBranch,
    Transformer,
)
from enm.v2_projection import compute_v2_projection_hash, project_enm_v1_to_v2


def _sample_enm() -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(
            name="V12 projection",
            revision=7,
            created_at="2024-01-01T00:00:00Z",
            updated_at="2024-01-01T00:00:00Z",
        ),
        buses=[
            Bus(
                id="00000000-0000-0000-0000-000000120001",
                ref_id="bus_a",
                name="Szyna A",
                voltage_kv=15.0,
            ),
            Bus(
                id="00000000-0000-0000-0000-000000120002",
                ref_id="bus_b",
                name="Szyna B",
                voltage_kv=15.0,
                grounding=GroundingConfig(type="petersen_coil", x_ohm=120.0),
            ),
        ],
        branches=[
            Cable(
                id="00000000-0000-0000-0000-000000120003",
                ref_id="cable_1",
                name="Kabel 1",
                from_bus_ref="bus_a",
                to_bus_ref="bus_b",
                length_km=2.4,
                r_ohm_per_km=0.21,
                x_ohm_per_km=0.08,
                r0_ohm_per_km=0.63,
                x0_ohm_per_km=0.24,
                catalog_ref="cable.xlpe.120",
                catalog_namespace="mv_cables",
            ),
            SwitchBranch(
                id="00000000-0000-0000-0000-000000120004",
                ref_id="sw_1",
                name="Rozlacznik 1",
                from_bus_ref="bus_a",
                to_bus_ref="bus_b",
                type="disconnector",
                status="open",
            ),
        ],
        transformers=[
            Transformer(
                id="00000000-0000-0000-0000-000000120005",
                ref_id="tr_1",
                name="Transformator 1",
                hv_bus_ref="bus_a",
                lv_bus_ref="bus_b",
                sn_mva=1.0,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=6.0,
                pk_kw=10.0,
                vector_group="Dyn11",
                hv_neutral=GroundingConfig(type="resistor_grounded", r_ohm=20.0),
                catalog_ref="trafo.1000",
            )
        ],
        sources=[
            Source(
                id="00000000-0000-0000-0000-000000120006",
                ref_id="src_1",
                name="GPZ",
                bus_ref="bus_a",
                model="short_circuit_power",
                sk3_mva=250.0,
                rx_ratio=0.1,
                r0_ohm=0.1,
                x0_ohm=0.8,
                catalog_ref="gpz.source",
            )
        ],
        generators=[
            Generator(
                id="00000000-0000-0000-0000-000000120007",
                ref_id="gen_fw_1",
                name="Farma wiatrowa",
                bus_ref="bus_b",
                p_mw=3.0,
                q_mvar=0.0,
                gen_type="wind_inverter",
            ),
            Generator(
                id="00000000-0000-0000-0000-000000120008",
                ref_id="gen_fw_pmsg_1",
                name="Farma wiatrowa PMSG",
                bus_ref="bus_b",
                p_mw=5.0,
                q_mvar=0.0,
                gen_type="fw_pmsg",
                catalog_ref="fw.pmsg.5mw",
                catalog_namespace="wind_generators",
                materialized_params={
                    "operator_profile": {
                        "ref_id": "operator_profile.osd_a",
                        "name": "Profil operatora OSD A",
                    },
                    "source_profile": {
                        "generator_model": {"type": "PMSG"},
                        "frt": {"points": [{"u_pu": 0.15, "min_duration_ms": 150.0}]},
                        "q_u": {"points": [{"u_pu": 1.0, "q_pu": 0.0}]},
                        "cos_phi_p": {"points": [{"p_pu": 1.0, "cos_phi": 0.95}]},
                    },
                },
            ),
        ],
    )


def test_projection_sets_v2_header_and_preserves_ref_ids():
    projection = project_enm_v1_to_v2(_sample_enm())

    assert projection.header.enm_version == "2.0"
    assert projection.header.source_enm_version == "1.0"
    assert projection.summary.buses == 2

    refs = {item.ref_id for item in projection.element_refs}
    assert {
        "bus_a",
        "bus_b",
        "cable_1",
        "sw_1",
        "tr_1",
        "src_1",
        "gen_fw_1",
        "gen_fw_pmsg_1",
    } <= refs


def test_projection_keeps_ref_id_when_user_name_changes():
    enm = _sample_enm()
    enm.buses[0].name = "Nowa nazwa uzytkowa"

    projection = project_enm_v1_to_v2(enm)
    bus_ref = next(item for item in projection.element_refs if item.ref_id == "bus_a")

    assert bus_ref.name == "Nowa nazwa uzytkowa"
    assert bus_ref.ref_id == "bus_a"
    assert bus_ref.id == "00000000-0000-0000-0000-000000120001"


def test_projection_creates_base_variant_and_switching_snapshot():
    projection = project_enm_v1_to_v2(_sample_enm())

    assert projection.operating_variants[0].ref_id == "variant.uklad_normalny"
    assert projection.switching_state_snapshots[0].ref_id == "switching.uklad_normalny.base"
    assert projection.switching_state_snapshots[0].switch_states[0].device_ref == "sw_1"
    assert projection.switching_state_snapshots[0].switch_states[0].state == "open"


def test_projection_extracts_zero_sequence_configs():
    projection = project_enm_v1_to_v2(_sample_enm())

    by_ref = {config.element_ref: config for config in projection.zero_sequence_configs}
    assert by_ref["cable_1"].quality_status == "pelna"
    assert by_ref["src_1"].x0 == 0.8
    assert by_ref["tr_1"].grounding_type == "resistor_grounded"
    assert by_ref["bus_b"].grounding_type == "petersen_coil"


def test_projection_warns_about_legacy_wind_type_and_missing_catalog():
    projection = project_enm_v1_to_v2(_sample_enm())

    codes = {warning.code for warning in projection.migration_warnings}
    assert "V12-MIG-GEN-001" in codes
    assert "V12-MIG-GEN-002" in codes


def test_projection_materializes_v12_source_profiles_and_precise_wind_type():
    projection = project_enm_v1_to_v2(_sample_enm())

    assert projection.header.projection_version == "v12xx.m2.0"
    assert projection.summary.source_profiles == 2
    assert projection.summary.frt_profiles == 2
    assert projection.summary.q_u_profiles == 2
    assert projection.summary.cos_phi_p_profiles == 2
    assert projection.summary.operator_profiles == 1

    profiles_by_source = {profile["source_ref"]: profile for profile in projection.source_profiles}
    precise_profile = profiles_by_source["gen_fw_pmsg_1"]

    assert precise_profile["source_type"] == "FW_PMSG"
    assert precise_profile["quality_status"] == "pelna"
    assert precise_profile["generator_model"]["type"] == "PMSG"

    frt_by_source = {profile["source_ref"]: profile for profile in projection.frt_profiles}
    assert frt_by_source["gen_fw_pmsg_1"]["quality_status"] == "pelna"
    assert frt_by_source["gen_fw_1"]["quality_status"] == "czesciowa"


# ---------------------------------------------------------------------------
# Karta W3-I (2026-09-09): `_converter_generator_types()` (kopia lokalna,
# 6 pozycji pokrywających się z `enm/models.py::GEN_TYPES_PRZEKSZTALTNIKOWE`,
# pytanie „czy DER") skasowana — generator przekształtnikowy w SENSIE
# ZWARCIOWYM czyta teraz `catalog.governance.wymagalnosc_katalogu`, który
# importuje `enm/mapping.py::FULL_CONVERTER_SC_GEN_TYPES` (4 pozycje, BEZ
# `fw_dfig`/`fw_scig` — maszyny wirujące, nie bounded-current-source). Testy
# poniżej przypinają tę różnicę jako iloczyn cech (gen_type × catalog_ref):
# regresja (podstawienie złego zbioru z powrotem) poczerwieni JEDEN z nich.
# ---------------------------------------------------------------------------


def _enm_z_generatorem(gen_type: str, *, catalog_ref: str | None) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="W3-I gen_type"),
        buses=[Bus(ref_id="bus_gen", name="Szyna generatora", voltage_kv=0.4)],
        generators=[
            Generator(
                ref_id="gen_pod_testem",
                name="Generator",
                bus_ref="bus_gen",
                p_mw=0.1,
                gen_type=gen_type,
                catalog_ref=catalog_ref,
            )
        ],
    )


def test_projection_full_converter_bez_katalogu_dostaje_ostrzezenie_i_wymaga_uzupelnienia():
    """`pv_inverter` (pełny przekształtnik, IEC 60909 §6.7) bez `catalog_ref` —
    ostrzeżenie V12-MIG-GEN-002 I `readiness_status == "wymaga_uzupelnienia"`."""
    projection = project_enm_v1_to_v2(_enm_z_generatorem("pv_inverter", catalog_ref=None))

    kody = {w.code for w in projection.migration_warnings}
    assert "V12-MIG-GEN-002" in kody

    ref = next(r for r in projection.element_refs if r.ref_id == "gen_pod_testem")
    assert ref.readiness_status == "wymaga_uzupelnienia"


@pytest.mark.parametrize("gen_type", ["fw_dfig", "fw_scig"])
def test_projection_maszyna_wirujaca_bez_katalogu_nie_dostaje_ostrzezenia_generatora(
    gen_type: str,
):
    """`fw_dfig`/`fw_scig` — maszyny WIRUJĄCE w klasyfikacji zwarciowej
    (`enm.mapping.FULL_CONVERTER_SC_GEN_TYPES` ich NIE zawiera), mimo że
    `enm.models.GEN_TYPES_PRZEKSZTALTNIKOWE` (INNE pytanie: czy DER) je
    zawiera — bez `catalog_ref` NIE dostają V12-MIG-GEN-002 ani
    `readiness_status == "wymaga_uzupelnienia"` z tego powodu (naprawa karty
    W3-I: PRZED nią `_converter_generator_types()` mylił oba zbiory)."""
    projection = project_enm_v1_to_v2(_enm_z_generatorem(gen_type, catalog_ref=None))

    kody = {w.code for w in projection.migration_warnings}
    assert "V12-MIG-GEN-002" not in kody

    ref = next(r for r in projection.element_refs if r.ref_id == "gen_pod_testem")
    assert ref.readiness_status == "gotowy"


def test_projection_synchroniczny_bez_katalogu_nie_dostaje_ostrzezenia_generatora():
    """Generator synchroniczny (`gen_type="synchronous"`) — nigdy nie jest
    przekształtnikowy w żadnym sensie; bez `catalog_ref` nie dostaje
    ostrzeżenia migracji generatora."""
    projection = project_enm_v1_to_v2(_enm_z_generatorem("synchronous", catalog_ref=None))

    kody = {w.code for w in projection.migration_warnings}
    assert "V12-MIG-GEN-002" not in kody


def test_projection_blocks_precise_wind_type_when_profile_model_mismatches():
    enm = _sample_enm()
    enm.generators[1].materialized_params["source_profile"]["generator_model"] = {"type": "DFIG"}

    projection = project_enm_v1_to_v2(enm)

    warnings = {
        (warning.code, warning.element_ref): warning for warning in projection.migration_warnings
    }
    assert ("V12-MIG-GEN-003", "gen_fw_pmsg_1") in warnings
    assert warnings[("V12-MIG-GEN-003", "gen_fw_pmsg_1")].severity == "blokada_migracji"


def test_projection_hash_is_deterministic_and_excludes_own_hash_field():
    first = project_enm_v1_to_v2(_sample_enm())
    second = project_enm_v1_to_v2(_sample_enm())

    assert first.projection_hash_sha256 == second.projection_hash_sha256

    first.projection_hash_sha256 = "changed"
    assert compute_v2_projection_hash(first) == second.projection_hash_sha256
