"""
Tests for Phase 1 — Extended catalog type system.

Validates:
1. All new catalog types can be instantiated
2. CatalogRepository accepts new type collections
3. Materialization contracts exist for all namespaces
4. CatalogBinding round-trips through to_dict/from_dict
5. Deterministic sorting for new types
"""

from network_model.catalog.repository import CatalogRepository
from network_model.catalog.types import (
    MATERIALIZATION_CONTRACTS,
    BESSInverterType,
    CatalogBinding,
    CatalogNamespace,
    CTType,
    LoadType,
    LVApparatusType,
    LVCableType,
    MaterializationContract,
    MVApparatusType,
    PVInverterType,
    SourceSystemType,
    VTType,
)


class TestCatalogNamespace:
    def test_all_namespaces_defined(self):
        expected = {
            "KABEL_SN",
            "LINIA_SN",
            "TRAFO_SN_NN",
            "APARAT_SN",
            "APARAT_NN",
            "KABEL_NN",
            "APARAT_NN_MCB",
            "WKLADKA_NN",
            "CT",
            "VT",
            "OBCIAZENIE",
            "ZRODLO_NN_PV",
            "ZRODLO_NN_BESS",
            "ZRODLO_SN",
            "ZABEZPIECZENIE",
            "NASTAWY_ZABEZPIECZEN",
            "CONVERTER",
            "INVERTER",
            "OGRANICZNIK_SN",
            "KOMPENSATOR_SN",
            "PTPIREE_CERTYFIKAT_GENERATORA",
        }
        actual = {ns.value for ns in CatalogNamespace}
        assert actual == expected


class TestCatalogBinding:
    def test_round_trip(self):
        binding = CatalogBinding(
            catalog_namespace="KABEL_SN",
            catalog_item_id="kab_sn_240_al_15kv",
            catalog_item_version="2026.02",
            materialize=True,
            snapshot_mapping_version="1.0",
        )
        d = binding.to_dict()
        restored = CatalogBinding.from_dict(d)
        assert restored.catalog_namespace == binding.catalog_namespace
        assert restored.catalog_item_id == binding.catalog_item_id
        assert restored.catalog_item_version == binding.catalog_item_version
        assert restored.materialize is True

    def test_frozen(self):
        binding = CatalogBinding(
            catalog_namespace="KABEL_SN",
            catalog_item_id="test",
            catalog_item_version="1.0",
        )
        try:
            binding.catalog_item_id = "other"  # type: ignore[misc]
            raise AssertionError("Should raise FrozenInstanceError")
        except AttributeError:
            pass


class TestLVCableType:
    def test_creation(self):
        t = LVCableType(
            id="kab_nn_4x120_al",
            name="YAKY 4x120 mm²",
            u_n_kv=0.4,
            r_ohm_per_km=0.253,
            x_ohm_per_km=0.069,
            i_max_a=240.0,
            conductor_material="AL",
            insulation_type="PVC",
            cross_section_mm2=120.0,
            number_of_cores=4,
        )
        assert t.id == "kab_nn_4x120_al"
        assert t.u_n_kv == 0.4
        d = t.to_dict()
        assert d["r_ohm_per_km"] == 0.253

    def test_from_dict(self):
        t = LVCableType.from_dict(
            {
                "id": "test",
                "name": "Test LV Cable",
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.1,
                "x_ohm_per_km": 0.05,
            }
        )
        assert t.name == "Test LV Cable"


class TestLoadType:
    def test_creation(self):
        t = LoadType(
            id="load_mieszk_15kw",
            name="Obciążenie mieszkaniowe 15 kW",
            model="PQ",
            p_kw=15.0,
            cos_phi=0.95,
            cos_phi_mode="IND",
        )
        assert t.p_kw == 15.0
        assert t.cos_phi == 0.95


class TestSourceSystemType:
    def test_creation(self):
        t = SourceSystemType(
            id="src_gpz_15_250",
            name="Zasilanie GPZ 15 kV / 250 MVA",
            voltage_rating_kv=15.0,
            sk3_mva=250.0,
            rx_ratio=0.1,
        )
        assert t.voltage_rating_kv == 15.0
        assert t.sk3_mva == 250.0


class TestMVApparatusType:
    def test_creation(self):
        t = MVApparatusType(
            id="cb_sn_630a",
            name="Wyłącznik SN 630 A",
            device_kind="WYLACZNIK",
            u_n_kv=15.0,
            i_n_a=630.0,
            breaking_capacity_ka=25.0,
        )
        assert t.device_kind == "WYLACZNIK"
        assert t.breaking_capacity_ka == 25.0


class TestLVApparatusType:
    def test_creation(self):
        t = LVApparatusType(
            id="cb_nn_1000a",
            name="Wyłącznik główny nN 1000 A",
            device_kind="WYLACZNIK_GLOWNY",
            u_n_kv=0.4,
            i_n_a=1000.0,
            breaking_capacity_ka=50.0,
        )
        assert t.device_kind == "WYLACZNIK_GLOWNY"


class TestCTType:
    def test_creation(self):
        t = CTType(
            id="ct_400_5_5p20",
            name="CT 400/5 A kl. 5P20",
            ratio_primary_a=400.0,
            ratio_secondary_a=5.0,
            accuracy_class="5P20",
            burden_va=15.0,
        )
        assert t.ratio_primary_a == 400.0


class TestVTType:
    def test_creation(self):
        t = VTType(
            id="vt_15kv_100v",
            name="VT 15 kV / 100 V",
            ratio_primary_v=15000.0,
            ratio_secondary_v=100.0,
            accuracy_class="0.5",
        )
        assert t.ratio_primary_v == 15000.0


class TestPVInverterType:
    def test_creation(self):
        t = PVInverterType(
            id="pv_inv_50kva",
            name="Falownik PV 50 kVA",
            s_n_kva=50.0,
            p_max_kw=50.0,
            cos_phi_min=0.9,
            cos_phi_max=1.0,
        )
        assert t.s_n_kva == 50.0


class TestBESSInverterType:
    def test_creation(self):
        t = BESSInverterType(
            id="bess_50kw_100kwh",
            name="BESS 50 kW / 100 kWh",
            p_charge_kw=50.0,
            p_discharge_kw=50.0,
            e_kwh=100.0,
            s_n_kva=55.0,
        )
        assert t.e_kwh == 100.0


class TestMaterializationContracts:
    def test_all_namespaces_have_contracts(self):
        """Every non-legacy namespace must have a materialization contract."""
        required = {
            "KABEL_SN",
            "LINIA_SN",
            "TRAFO_SN_NN",
            "APARAT_SN",
            "APARAT_NN",
            "KABEL_NN",
            "APARAT_NN_MCB",
            "WKLADKA_NN",
            "CT",
            "VT",
            "OBCIAZENIE",
            "ZRODLO_SN",
            "ZRODLO_NN_PV",
            "ZRODLO_NN_BESS",
            "ZABEZPIECZENIE",
            "NASTAWY_ZABEZPIECZEN",
        }
        actual = set(MATERIALIZATION_CONTRACTS.keys())
        missing = required - actual
        assert not missing, f"Missing materialization contracts: {missing}"

    def test_contract_structure(self):
        for ns, contract in MATERIALIZATION_CONTRACTS.items():
            assert isinstance(contract, MaterializationContract)
            assert contract.namespace == ns
            assert len(contract.solver_fields) > 0
            assert len(contract.ui_fields) > 0

    def test_to_dict(self):
        c = MATERIALIZATION_CONTRACTS["KABEL_SN"]
        d = c.to_dict()
        assert d["namespace"] == "KABEL_SN"
        assert len(d["solver_fields"]) > 0
        assert all("field" in uf and "label_pl" in uf for uf in d["ui_fields"])


class TestExtendedCatalogRepository:
    def test_empty_extended_collections(self):
        """CatalogRepository can be created with empty extended collections."""
        repo = CatalogRepository.from_records(
            line_types=[],
            cable_types=[],
            transformer_types=[],
        )
        assert repo.list_lv_cable_types() == []
        assert repo.list_load_types() == []
        assert repo.list_mv_apparatus_types() == []
        assert repo.list_lv_apparatus_types() == []
        assert repo.list_ct_types() == []
        assert repo.list_vt_types() == []
        assert repo.list_source_system_types() == []
        assert repo.list_pv_inverter_types() == []
        assert repo.list_bess_inverter_types() == []

    def test_with_records(self):
        repo = CatalogRepository.from_records(
            line_types=[],
            cable_types=[],
            transformer_types=[],
            lv_cable_types=[
                {
                    "id": "lv1",
                    "name": "YAKY 4x120",
                    "params": {
                        "u_n_kv": 0.4,
                        "r_ohm_per_km": 0.253,
                        "x_ohm_per_km": 0.069,
                    },
                },
            ],
            load_types=[
                {"id": "ld1", "name": "Obciążenie 15 kW", "params": {"p_kw": 15.0}},
            ],
            mv_apparatus_types=[
                {
                    "id": "cb1",
                    "name": "Wyłącznik SN 630A",
                    "params": {
                        "device_kind": "WYLACZNIK",
                        "u_n_kv": 15.0,
                        "i_n_a": 630.0,
                    },
                },
            ],
            ct_types=[
                {
                    "id": "ct1",
                    "name": "CT 400/5",
                    "params": {
                        "ratio_primary_a": 400.0,
                        "ratio_secondary_a": 5.0,
                    },
                },
            ],
            source_system_types=[
                {
                    "id": "src1",
                    "name": "GPZ 15 kV / 250 MVA",
                    "params": {
                        "voltage_rating_kv": 15.0,
                        "sk3_mva": 250.0,
                        "rx_ratio": 0.1,
                    },
                },
            ],
        )
        assert len(repo.list_lv_cable_types()) == 1
        assert len(repo.list_load_types()) == 1
        assert len(repo.list_mv_apparatus_types()) == 1
        assert len(repo.list_ct_types()) == 1
        assert len(repo.list_source_system_types()) == 1

    def test_get_by_id(self):
        repo = CatalogRepository.from_records(
            line_types=[],
            cable_types=[],
            transformer_types=[],
            pv_inverter_types=[
                {
                    "id": "pv1",
                    "name": "PV 50kVA",
                    "params": {
                        "s_n_kva": 50.0,
                        "p_max_kw": 50.0,
                    },
                },
            ],
        )
        pv = repo.get_pv_inverter_type("pv1")
        assert pv is not None
        assert pv.s_n_kva == 50.0
        assert repo.get_pv_inverter_type("nonexistent") is None

    def test_deterministic_sort(self):
        repo = CatalogRepository.from_records(
            line_types=[],
            cable_types=[],
            transformer_types=[],
            lv_cable_types=[
                {
                    "id": "c",
                    "name": "Zebra",
                    "params": {"u_n_kv": 0.4, "r_ohm_per_km": 0.1, "x_ohm_per_km": 0.05},
                },
                {
                    "id": "a",
                    "name": "Alpha",
                    "params": {"u_n_kv": 0.4, "r_ohm_per_km": 0.2, "x_ohm_per_km": 0.06},
                },
                {
                    "id": "b",
                    "name": "Alpha",
                    "params": {"u_n_kv": 0.4, "r_ohm_per_km": 0.3, "x_ohm_per_km": 0.07},
                },
            ],
        )
        types = repo.list_lv_cable_types()
        assert [t.id for t in types] == ["a", "b", "c"]
