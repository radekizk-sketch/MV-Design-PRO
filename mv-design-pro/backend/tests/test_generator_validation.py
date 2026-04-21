"""Tests for PV/BESS generator connection validation (KROK 2-3)."""

from domain.generator_validation import validate_generator_connections
from domain.readiness import ReadinessAreaV1, ReadinessPriority


def _gen(
    ref_id: str = "gen_1",
    name: str = "PV Farm",
    gen_type: str = "pv_inverter",
    bus_ref: str = "bus_nn",
    catalog_ref: str | None = "CAT-PV-1",
    connection_variant: str | None = None,
    blocking_transformer_ref: str | None = None,
    station_ref: str | None = None,
) -> dict:
    return {
        "ref_id": ref_id,
        "name": name,
        "gen_type": gen_type,
        "bus_ref": bus_ref,
        "catalog_ref": catalog_ref,
        "connection_variant": connection_variant,
        "blocking_transformer_ref": blocking_transformer_ref,
        "station_ref": station_ref,
    }


class TestPVBESSConnectionVariant:
    """PV/BESS zawsze przez transformator — wariant A lub B."""

    def test_oze_without_variant_produces_blocker(self) -> None:
        issues = validate_generator_connections(
            generators=[_gen(connection_variant=None)],
            transformers_by_ref={},
            stations_by_ref={},
        )
        codes = [i.code for i in issues]
        assert "generator.connection_variant_missing" in codes
        blocker = next(i for i in issues if i.code == "generator.connection_variant_missing")
        assert blocker.priority == ReadinessPriority.BLOCKER
        assert blocker.area == ReadinessAreaV1.GENERATORS
        assert blocker.wizard_step == "K6"

    def test_variant_a_nn_side_valid(self) -> None:
        issues = validate_generator_connections(
            generators=[_gen(connection_variant="nn_side", station_ref="sta_1")],
            transformers_by_ref={},
            stations_by_ref={"sta_1": {"ref_id": "sta_1"}},
        )
        gen_issues = [i for i in issues if i.element_id == "gen_1"]
        assert len(gen_issues) == 0

    def test_variant_a_missing_station_ref(self) -> None:
        issues = validate_generator_connections(
            generators=[_gen(connection_variant="nn_side", station_ref=None)],
            transformers_by_ref={},
            stations_by_ref={},
        )
        codes = [i.code for i in issues]
        assert "generator.station_ref_missing" in codes

    def test_variant_a_invalid_station_ref(self) -> None:
        issues = validate_generator_connections(
            generators=[_gen(connection_variant="nn_side", station_ref="nonexistent")],
            transformers_by_ref={},
            stations_by_ref={"sta_1": {}},
        )
        codes = [i.code for i in issues]
        assert "generator.station_ref_invalid" in codes

    def test_variant_b_block_transformer_valid(self) -> None:
        issues = validate_generator_connections(
            generators=[
                _gen(
                    connection_variant="block_transformer",
                    blocking_transformer_ref="tr_block_1",
                )
            ],
            transformers_by_ref={"tr_block_1": {"ref_id": "tr_block_1"}},
            stations_by_ref={},
        )
        gen_issues = [i for i in issues if i.element_id == "gen_1"]
        assert len(gen_issues) == 0

    def test_variant_b_missing_transformer_ref(self) -> None:
        issues = validate_generator_connections(
            generators=[
                _gen(
                    connection_variant="block_transformer",
                    blocking_transformer_ref=None,
                )
            ],
            transformers_by_ref={},
            stations_by_ref={},
        )
        codes = [i.code for i in issues]
        assert "generator.block_transformer_missing" in codes

    def test_variant_b_invalid_transformer_ref(self) -> None:
        issues = validate_generator_connections(
            generators=[
                _gen(
                    connection_variant="block_transformer",
                    blocking_transformer_ref="nonexistent",
                )
            ],
            transformers_by_ref={"tr_1": {}},
            stations_by_ref={},
        )
        codes = [i.code for i in issues]
        assert "generator.block_transformer_invalid" in codes

    def test_invalid_variant_value(self) -> None:
        issues = validate_generator_connections(
            generators=[_gen(connection_variant="direct_sn")],
            transformers_by_ref={},
            stations_by_ref={},
        )
        codes = [i.code for i in issues]
        assert "generator.connection_variant_invalid" in codes


class TestSynchronousGeneratorSkipsVariant:
    """Generatory synchroniczne NIE wymagaja connection_variant."""

    def test_synchronous_no_variant_ok(self) -> None:
        issues = validate_generator_connections(
            generators=[_gen(gen_type="synchronous", connection_variant=None)],
            transformers_by_ref={},
            stations_by_ref={},
        )
        gen_issues = [i for i in issues if i.code.startswith("generator.connection")]
        assert len(gen_issues) == 0


class TestCatalogRefRequired:
    """Brak catalog_ref → FixAction."""

    def test_missing_catalog_ref_blocker(self) -> None:
        issues = validate_generator_connections(
            generators=[_gen(catalog_ref=None, connection_variant="nn_side", station_ref="s")],
            transformers_by_ref={},
            stations_by_ref={"s": {}},
        )
        codes = [i.code for i in issues]
        assert "catalog.ref_missing" in codes
        blocker = next(i for i in issues if i.code == "catalog.ref_missing")
        assert blocker.priority == ReadinessPriority.BLOCKER
        assert blocker.area == ReadinessAreaV1.CATALOGS

    def test_with_catalog_ref_no_issue(self) -> None:
        issues = validate_generator_connections(
            generators=[
                _gen(
                    catalog_ref="CAT-PV",
                    connection_variant="nn_side",
                    station_ref="s",
                )
            ],
            transformers_by_ref={},
            stations_by_ref={"s": {}},
        )
        cat_issues = [i for i in issues if i.code == "catalog.ref_missing"]
        assert len(cat_issues) == 0


class TestBESSGenerator:
    """BESS uses same rules as PV/WIND."""

    def test_bess_requires_variant(self) -> None:
        issues = validate_generator_connections(
            generators=[_gen(gen_type="bess", connection_variant=None)],
            transformers_by_ref={},
            stations_by_ref={},
        )
        codes = [i.code for i in issues]
        assert "generator.connection_variant_missing" in codes

    def test_bess_variant_b_valid(self) -> None:
        issues = validate_generator_connections(
            generators=[
                _gen(
                    gen_type="bess",
                    connection_variant="block_transformer",
                    blocking_transformer_ref="tr_bess",
                )
            ],
            transformers_by_ref={"tr_bess": {}},
            stations_by_ref={},
        )
        gen_issues = [i for i in issues if i.element_id == "gen_1"]
        assert len(gen_issues) == 0


class TestDeterminism:
    """Same input → same output regardless of input order."""

    def test_output_sorted_by_element_id(self) -> None:
        gens = [
            _gen(ref_id="gen_c", connection_variant=None),
            _gen(ref_id="gen_a", connection_variant=None),
            _gen(ref_id="gen_b", connection_variant=None),
        ]
        issues = validate_generator_connections(gens, {}, {})
        gen_issues = [i for i in issues if i.code == "generator.connection_variant_missing"]
        element_ids = [i.element_id for i in gen_issues]
        assert element_ids == ["gen_a", "gen_b", "gen_c"]

    def test_permutation_invariance(self) -> None:
        gens = [
            _gen(ref_id="gen_1", connection_variant="nn_side", station_ref="s"),
            _gen(ref_id="gen_2", connection_variant=None),
        ]
        issues_1 = validate_generator_connections(gens, {}, {"s": {}})
        issues_2 = validate_generator_connections(list(reversed(gens)), {}, {"s": {}})
        codes_1 = [(i.code, i.element_id) for i in issues_1]
        codes_2 = [(i.code, i.element_id) for i in issues_2]
        assert codes_1 == codes_2
