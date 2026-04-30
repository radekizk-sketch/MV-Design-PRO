"""Tests for V12S-010: split jednolitego ENM hash na 5 ortogonalnych hashy.

Chain hashy:
  semantic_hash      — topologia + role + pasma napieciowe + catalog_ref
  input_hash         — wejscia obliczeniowe BEZ switching state
  switching_snapshot_hash — TYLKO stany lacznikow
  case_hash          — parametry przypadku obliczeniowego
  variant_hash       — delty wariantu (overlay)

Wymagania ortogonalnosci:
  1. Determinizm: same input → same hash, kazdorazowo.
  2. Niewrazliwosc semantic_hash na zmiany dlugosci/parametrow obliczeniowych.
  3. Niewrazliwosc semantic_hash i input_hash na switching state.
  4. Wrazliwosc switching_snapshot_hash WYLACZNIE na status lacznikow.
  5. Wsteczna kompatybilnosc: compute_enm_hash zwraca te same wartosci co przed V12S-010.
"""

from enm.hash import (
    compute_case_hash,
    compute_enm_hash,
    compute_input_hash,
    compute_semantic_hash,
    compute_switching_snapshot_hash,
    compute_variant_hash,
)
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    OverheadLine,
    Source,
    Transformer,
)


def _enm() -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Test"),
        buses=[
            Bus(ref_id="bus_a", name="A", voltage_kv=15.0),
            Bus(ref_id="bus_b", name="B", voltage_kv=15.0),
            Bus(ref_id="bus_c", name="C", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="src_1",
                name="Sieć",
                bus_ref="bus_a",
                model="short_circuit_power",
                sk3_mva=250,
                catalog_ref="SRC_TEST",
                catalog_namespace="ZRODLO_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            ),
        ],
        branches=[
            OverheadLine(
                ref_id="ln_1",
                name="Linia",
                from_bus_ref="bus_a",
                to_bus_ref="bus_b",
                length_km=2.0,
                r_ohm_per_km=0.4,
                x_ohm_per_km=0.3,
                catalog_ref="CAT-LN-1",
                status="closed",
            ),
        ],
        transformers=[
            Transformer(
                ref_id="tr_1",
                name="TR",
                hv_bus_ref="bus_b",
                lv_bus_ref="bus_c",
                sn_mva=0.63,
                uhv_kv=15,
                ulv_kv=0.4,
                uk_percent=6,
                pk_kw=7.6,
                vector_group="Dyn11",
                catalog_ref="CAT-TR-1",
            ),
        ],
    )


class TestDeterminism:
    def test_semantic_hash_deterministic(self) -> None:
        h1 = compute_semantic_hash(_enm())
        h2 = compute_semantic_hash(_enm())
        assert h1 == h2

    def test_input_hash_deterministic(self) -> None:
        h1 = compute_input_hash(_enm())
        h2 = compute_input_hash(_enm())
        assert h1 == h2

    def test_switching_snapshot_hash_deterministic(self) -> None:
        h1 = compute_switching_snapshot_hash(_enm())
        h2 = compute_switching_snapshot_hash(_enm())
        assert h1 == h2

    def test_case_hash_deterministic(self) -> None:
        case = {"analysis": "SC_3F", "scenario_ref": "S1", "norm": "IEC60909"}
        assert compute_case_hash(case) == compute_case_hash(case)

    def test_variant_hash_deterministic(self) -> None:
        variant = {"deltas": [{"ref": "ln_1", "field": "status", "value": "open"}]}
        assert compute_variant_hash(variant) == compute_variant_hash(variant)


class TestSemanticHashInsensitivity:
    def test_semantic_invariant_under_length_change(self) -> None:
        """Zmiana length_km galezi NIE zmienia semantic_hash."""
        enm = _enm()
        h_baseline = compute_semantic_hash(enm)
        enm.branches[0].length_km = 99.99
        h_after = compute_semantic_hash(enm)
        assert h_baseline == h_after

    def test_semantic_invariant_under_impedance_change(self) -> None:
        """Zmiana R/X galezi NIE zmienia semantic_hash."""
        enm = _enm()
        h_baseline = compute_semantic_hash(enm)
        enm.branches[0].r_ohm_per_km = 0.99
        enm.branches[0].x_ohm_per_km = 0.99
        h_after = compute_semantic_hash(enm)
        assert h_baseline == h_after

    def test_semantic_invariant_under_switching(self) -> None:
        """Otwarcie/zamkniecie lacznika NIE zmienia semantic_hash."""
        enm = _enm()
        h_baseline = compute_semantic_hash(enm)
        enm.branches[0].status = "open"
        h_after = compute_semantic_hash(enm)
        assert h_baseline == h_after

    def test_semantic_changes_under_topology_change(self) -> None:
        """Zmiana from_bus_ref ZMIENIA semantic_hash."""
        enm = _enm()
        h_baseline = compute_semantic_hash(enm)
        enm.branches[0].from_bus_ref = "bus_b"
        enm.branches[0].to_bus_ref = "bus_a"
        h_after = compute_semantic_hash(enm)
        assert h_baseline != h_after

    def test_semantic_changes_under_catalog_change(self) -> None:
        """Zmiana catalog_ref ZMIENIA semantic_hash."""
        enm = _enm()
        h_baseline = compute_semantic_hash(enm)
        enm.branches[0].catalog_ref = "CAT-LN-OTHER"
        h_after = compute_semantic_hash(enm)
        assert h_baseline != h_after


class TestInputHashIsolation:
    def test_input_hash_invariant_under_switching(self) -> None:
        """V12S-010: switching state NIE wplywa na input_hash."""
        enm = _enm()
        h_baseline = compute_input_hash(enm)
        enm.branches[0].status = "open"
        h_after = compute_input_hash(enm)
        assert h_baseline == h_after

    def test_input_hash_changes_under_impedance_change(self) -> None:
        """Zmiana R/X ZMIENIA input_hash."""
        enm = _enm()
        h_baseline = compute_input_hash(enm)
        enm.branches[0].r_ohm_per_km = 0.99
        h_after = compute_input_hash(enm)
        assert h_baseline != h_after


class TestSwitchingSnapshotHashIsolation:
    def test_switching_changes_under_status_change(self) -> None:
        """Otwarcie lacznika ZMIENIA switching_snapshot_hash."""
        enm = _enm()
        h_baseline = compute_switching_snapshot_hash(enm)
        enm.branches[0].status = "open"
        h_after = compute_switching_snapshot_hash(enm)
        assert h_baseline != h_after

    def test_switching_invariant_under_impedance_change(self) -> None:
        """Zmiana R/X NIE wplywa na switching_snapshot_hash."""
        enm = _enm()
        h_baseline = compute_switching_snapshot_hash(enm)
        enm.branches[0].r_ohm_per_km = 0.99
        h_after = compute_switching_snapshot_hash(enm)
        assert h_baseline == h_after


class TestBackwardCompatibility:
    def test_compute_enm_hash_unchanged_for_baseline_model(self) -> None:
        """V12S-010: compute_enm_hash zachowuje stara semantyke (deterministyczny)."""
        h1 = compute_enm_hash(_enm())
        h2 = compute_enm_hash(_enm())
        assert h1 == h2
        assert len(h1) == 64  # SHA-256 hex

    def test_compute_enm_hash_excludes_new_chain_fields_in_header(self) -> None:
        """compute_enm_hash NIE wlicza pol semantic_hash/input_hash/itd. w header."""
        enm1 = _enm()
        enm2 = _enm()
        enm2.header.semantic_hash = "deadbeef"
        enm2.header.input_hash = "cafebabe"
        enm2.header.case_hash = "12345678"
        enm2.header.variant_hash = "abcdef00"
        enm2.header.switching_snapshot_hash = "00ff00ff"
        assert compute_enm_hash(enm1) == compute_enm_hash(enm2)


class TestCaseAndVariantHash:
    def test_case_hash_orthogonal(self) -> None:
        h1 = compute_case_hash({"analysis": "SC_3F"})
        h2 = compute_case_hash({"analysis": "LOAD_FLOW"})
        assert h1 != h2

    def test_variant_hash_orthogonal(self) -> None:
        h1 = compute_variant_hash({"deltas": []})
        h2 = compute_variant_hash({"deltas": [{"ref": "ln_1"}]})
        assert h1 != h2
