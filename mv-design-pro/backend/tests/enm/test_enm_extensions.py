"""Testy rozszerzeń ENM — Substation, Bay, Junction, Corridor.

Weryfikują:
- Tworzenie nowych encji
- Serializacja/deserializacja JSON roundtrip
- Walidacja referencji (W005-W008, I003-I005)
- Hash deterministyczny z nowymi kolekcjami
- Kompatybilność wsteczna (istniejące ENM bez nowych kolekcji)
"""

from enm.hash import compute_enm_hash
from enm.models import (
    Bay,
    Bus,
    Corridor,
    EnergyNetworkModel,
    ENMHeader,
    Junction,
    Load,
    OverheadLine,
    Source,
    Substation,
    Transformer,
)
from enm.validator import ENMValidator


def _enm(**kwargs) -> EnergyNetworkModel:
    return EnergyNetworkModel(header=ENMHeader(name="Test"), **kwargs)


def _base_enm() -> EnergyNetworkModel:
    """ENM z minimalnym zestawem elementów dla testów topologicznych."""
    return _enm(
        buses=[
            Bus(ref_id="bus_sn_a", name="Szyna SN A", voltage_kv=15),
            Bus(ref_id="bus_sn_b", name="Szyna SN B", voltage_kv=15),
            Bus(ref_id="bus_nn_1", name="Szyna nn 1", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="src_1",
                name="Grid",
                bus_ref="bus_sn_a",
                model="short_circuit_power",
                sk3_mva=220,
            ),
        ],
        branches=[
            OverheadLine(
                ref_id="line_1",
                name="Linia L1",
                from_bus_ref="bus_sn_a",
                to_bus_ref="bus_sn_b",
                length_km=10.0,
                r_ohm_per_km=0.443,
                x_ohm_per_km=0.340,
            ),
        ],
        transformers=[
            Transformer(
                ref_id="trafo_1",
                name="T1",
                hv_bus_ref="bus_sn_b",
                lv_bus_ref="bus_nn_1",
                sn_mva=0.63,
                uhv_kv=15,
                ulv_kv=0.4,
                uk_percent=4.5,
                pk_kw=6.5,
            ),
        ],
        loads=[
            Load(ref_id="load_1", name="Odbiór 1", bus_ref="bus_nn_1", p_mw=0.2, q_mvar=0.1),
        ],
    )


# ============================================================================
# Testy modeli
# ============================================================================


class TestSubstation:
    def test_create_minimal(self):
        sub = Substation(
            ref_id="sub_gpz",
            name="GPZ Główna",
            station_type="gpz",
            bus_refs=["bus_sn_a"],
        )
        assert sub.station_type == "gpz"
        assert sub.bus_refs == ["bus_sn_a"]
        assert sub.entry_point_ref is None

    def test_create_mv_lv_station(self):
        sub = Substation(
            ref_id="sub_1",
            name="Stacja 1",
            station_type="mv_lv",
            bus_refs=["bus_sn_b", "bus_nn_1"],
            transformer_refs=["trafo_1"],
            entry_point_ref="ep_1",
        )
        assert sub.station_type == "mv_lv"
        assert len(sub.bus_refs) == 2
        assert sub.entry_point_ref == "ep_1"


class TestBay:
    def test_create_bay_in(self):
        bay = Bay(
            ref_id="bay_in_1",
            name="Pole wejściowe 1",
            bay_role="IN",
            substation_ref="sub_1",
            bus_ref="bus_sn_a",
            equipment_refs=["sw_ds_1", "sw_cb_1"],
        )
        assert bay.bay_role == "IN"
        assert len(bay.equipment_refs) == 2

    def test_create_bay_oze(self):
        bay = Bay(
            ref_id="bay_oze_1",
            name="Pole OZE PV",
            bay_role="OZE",
            substation_ref="sub_1",
            bus_ref="bus_nn_1",
        )
        assert bay.bay_role == "OZE"
        assert bay.protection_ref is None


class TestJunction:
    def test_create_t_node(self):
        junc = Junction(
            ref_id="junc_t1",
            name="Węzeł T1",
            connected_branch_refs=["line_1", "line_2", "line_3"],
            junction_type="T_node",
        )
        assert junc.junction_type == "T_node"
        assert len(junc.connected_branch_refs) == 3

    def test_create_no_point(self):
        junc = Junction(
            ref_id="junc_no",
            name="Punkt NO",
            connected_branch_refs=["line_a", "line_b", "line_c"],
            junction_type="NO_point",
        )
        assert junc.junction_type == "NO_point"


class TestCorridor:
    def test_create_radial(self):
        corr = Corridor(
            ref_id="corr_a",
            name="Magistrala A",
            corridor_type="radial",
            ordered_segment_refs=["line_1", "line_2", "line_3"],
        )
        assert corr.corridor_type == "radial"
        assert corr.no_point_ref is None

    def test_create_ring(self):
        corr = Corridor(
            ref_id="corr_b",
            name="Magistrala B",
            corridor_type="ring",
            ordered_segment_refs=["line_4", "line_5"],
            no_point_ref="junc_no",
        )
        assert corr.corridor_type == "ring"
        assert corr.no_point_ref == "junc_no"


# ============================================================================
# Testy ENM z nowymi kolekcjami
# ============================================================================


class TestENMWithExtensions:
    def test_enm_with_all_collections(self):
        enm = _base_enm()
        enm.substations = [
            Substation(
                ref_id="sub_1",
                name="Stacja 1",
                station_type="mv_lv",
                bus_refs=["bus_sn_b", "bus_nn_1"],
                transformer_refs=["trafo_1"],
            ),
        ]
        enm.bays = [
            Bay(
                ref_id="bay_1",
                name="Pole IN",
                bay_role="IN",
                substation_ref="sub_1",
                bus_ref="bus_sn_b",
            ),
        ]
        enm.junctions = [
            Junction(
                ref_id="junc_1",
                name="T1",
                junction_type="T_node",
                connected_branch_refs=["line_1", "line_1", "line_1"],
            ),
        ]
        enm.corridors = [
            Corridor(
                ref_id="corr_1",
                name="Mag A",
                corridor_type="radial",
                ordered_segment_refs=["line_1"],
            ),
        ]
        assert len(enm.substations) == 1
        assert len(enm.bays) == 1
        assert len(enm.junctions) == 1
        assert len(enm.corridors) == 1

    def test_json_roundtrip_with_extensions(self):
        enm = _base_enm()
        enm.substations = [
            Substation(ref_id="sub_gpz", name="GPZ", station_type="gpz", bus_refs=["bus_sn_a"]),
        ]
        enm.bays = [
            Bay(
                ref_id="bay_in",
                name="Pole IN",
                bay_role="IN",
                substation_ref="sub_gpz",
                bus_ref="bus_sn_a",
            ),
        ]

        # Serialize
        data = enm.model_dump(mode="json")
        assert "substations" in data
        assert len(data["substations"]) == 1
        assert data["substations"][0]["station_type"] == "gpz"
        assert "bays" in data
        assert len(data["bays"]) == 1

        # Deserialize
        restored = EnergyNetworkModel.model_validate(data)
        assert len(restored.substations) == 1
        assert restored.substations[0].ref_id == "sub_gpz"
        assert len(restored.bays) == 1
        assert restored.bays[0].bay_role == "IN"

    def test_backward_compatibility_empty_collections(self):
        """ENM bez nowych kolekcji — musi działać jak wcześniej."""
        enm = _enm(
            buses=[Bus(ref_id="b1", name="B1", voltage_kv=15)],
            sources=[
                Source(
                    ref_id="s1", name="S1", bus_ref="b1", model="short_circuit_power", sk3_mva=200
                )
            ],
        )
        assert enm.substations == []
        assert enm.bays == []
        assert enm.junctions == []
        assert enm.corridors == []

        # JSON roundtrip
        data = enm.model_dump(mode="json")
        restored = EnergyNetworkModel.model_validate(data)
        assert restored.substations == []

    def test_backward_compatibility_json_without_new_fields(self):
        """Stary JSON bez nowych kolekcji — musi się sparsować poprawnie."""
        old_json = {
            "header": {"name": "old", "enm_version": "1.0", "revision": 1, "hash_sha256": ""},
            "buses": [{"ref_id": "b1", "name": "B1", "voltage_kv": 15, "tags": [], "meta": {}}],
        }
        enm = EnergyNetworkModel.model_validate(old_json)
        assert len(enm.buses) == 1
        assert enm.substations == []
        assert enm.bays == []


# ============================================================================
# Testy hash z rozszerzeniami
# ============================================================================


class TestHashWithExtensions:
    def test_hash_deterministic_with_new_collections(self):
        enm = _base_enm()
        enm.substations = [
            Substation(ref_id="sub_1", name="S1", station_type="gpz", bus_refs=["bus_sn_a"]),
        ]
        h1 = compute_enm_hash(enm)
        h2 = compute_enm_hash(enm)
        assert h1 == h2

    def test_hash_changes_with_substation(self):
        enm1 = _base_enm()
        enm2 = _base_enm()
        enm2.substations = [
            Substation(ref_id="sub_1", name="S1", station_type="gpz", bus_refs=["bus_sn_a"]),
        ]
        assert compute_enm_hash(enm1) != compute_enm_hash(enm2)

    def test_hash_changes_with_bay(self):
        enm1 = _base_enm()
        enm2 = _base_enm()
        enm2.bays = [
            Bay(
                ref_id="bay_1", name="B1", bay_role="IN", substation_ref="sub_1", bus_ref="bus_sn_a"
            ),
        ]
        assert compute_enm_hash(enm1) != compute_enm_hash(enm2)


# ============================================================================
# Testy walidatora z rozszerzeniami
# ============================================================================


class TestValidatorTopologyEntities:
    def test_valid_enm_with_extensions_passes(self):
        enm = _base_enm()
        enm.substations = [
            Substation(
                ref_id="sub_1",
                name="S1",
                station_type="mv_lv",
                bus_refs=["bus_sn_b", "bus_nn_1"],
                transformer_refs=["trafo_1"],
            ),
        ]
        enm.bays = [
            Bay(
                ref_id="bay_1",
                name="Pole IN",
                bay_role="IN",
                substation_ref="sub_1",
                bus_ref="bus_sn_b",
            ),
        ]
        result = ENMValidator().validate(enm)
        # Nie powinno być W005/W006/W007/W008
        codes = [i.code for i in result.issues]
        assert "W005" not in codes
        assert "W006" not in codes

    def test_w005_substation_invalid_bus_ref(self):
        enm = _base_enm()
        enm.substations = [
            Substation(
                ref_id="sub_1", name="S1", station_type="gpz", bus_refs=["nieistniejaca_szyna"]
            ),
        ]
        result = ENMValidator().validate(enm)
        codes = [i.code for i in result.issues]
        assert "W005" in codes

    def test_w005_substation_invalid_trafo_ref(self):
        enm = _base_enm()
        enm.substations = [
            Substation(
                ref_id="sub_1",
                name="S1",
                station_type="gpz",
                bus_refs=["bus_sn_a"],
                transformer_refs=["nieistniejacy_trafo"],
            ),
        ]
        result = ENMValidator().validate(enm)
        codes = [i.code for i in result.issues]
        assert "W005" in codes

    def test_w006_bay_invalid_substation_ref(self):
        enm = _base_enm()
        enm.bays = [
            Bay(
                ref_id="bay_1",
                name="B1",
                bay_role="IN",
                substation_ref="nieistniejaca_stacja",
                bus_ref="bus_sn_a",
            ),
        ]
        result = ENMValidator().validate(enm)
        codes = [i.code for i in result.issues]
        assert "W006" in codes

    def test_w006_bay_invalid_bus_ref(self):
        enm = _base_enm()
        enm.substations = [
            Substation(ref_id="sub_1", name="S1", station_type="gpz", bus_refs=["bus_sn_a"]),
        ]
        enm.bays = [
            Bay(
                ref_id="bay_1",
                name="B1",
                bay_role="IN",
                substation_ref="sub_1",
                bus_ref="nieistniejaca_szyna",
            ),
        ]
        result = ENMValidator().validate(enm)
        codes = [i.code for i in result.issues]
        assert "W006" in codes

    def test_w007_junction_too_few_branches(self):
        enm = _base_enm()
        enm.junctions = [
            Junction(
                ref_id="junc_1",
                name="J1",
                junction_type="T_node",
                connected_branch_refs=["line_1", "line_1"],
            ),
        ]
        result = ENMValidator().validate(enm)
        codes = [i.code for i in result.issues]
        assert "W007" in codes

    def test_w007_junction_invalid_branch_ref(self):
        enm = _base_enm()
        enm.junctions = [
            Junction(
                ref_id="junc_1",
                name="J1",
                junction_type="T_node",
                connected_branch_refs=["line_1", "brak_1", "brak_2"],
            ),
        ]
        result = ENMValidator().validate(enm)
        codes = [i.code for i in result.issues]
        assert "W007" in codes

    def test_w008_corridor_invalid_segment_ref(self):
        enm = _base_enm()
        enm.corridors = [
            Corridor(
                ref_id="corr_1",
                name="C1",
                corridor_type="radial",
                ordered_segment_refs=["line_1", "brak_segment"],
            ),
        ]
        result = ENMValidator().validate(enm)
        codes = [i.code for i in result.issues]
        assert "W008" in codes

    def test_i003_substation_without_bays(self):
        enm = _base_enm()
        enm.substations = [
            Substation(ref_id="sub_1", name="S1", station_type="gpz", bus_refs=["bus_sn_a"]),
        ]
        # Brak bayów
        result = ENMValidator().validate(enm)
        codes = [i.code for i in result.issues]
        assert "I003" in codes

    def test_i004_empty_corridor(self):
        enm = _base_enm()
        enm.corridors = [
            Corridor(ref_id="corr_1", name="C1", corridor_type="radial", ordered_segment_refs=[]),
        ]
        result = ENMValidator().validate(enm)
        codes = [i.code for i in result.issues]
        assert "I004" in codes

    def test_i005_ring_without_no_point(self):
        enm = _base_enm()
        enm.corridors = [
            Corridor(
                ref_id="corr_1", name="C1", corridor_type="ring", ordered_segment_refs=["line_1"]
            ),
        ]
        result = ENMValidator().validate(enm)
        codes = [i.code for i in result.issues]
        assert "I005" in codes

    def test_no_topology_issues_on_empty_enm(self):
        """Pusty ENM (bez nowych encji) nie powinien generować ostrzeżeń W005-W008."""
        enm = _base_enm()
        result = ENMValidator().validate(enm)
        codes = [i.code for i in result.issues]
        for code in ("W005", "W006", "W007", "W008"):
            assert code not in codes
