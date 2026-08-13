"""P0.2 katalog nN — MCB (IEC 60898-1), wkładki gG (IEC 60269-1), pola cieplne kabli nN.

Karta P0.2 (docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.2, luki G-08/G-D1...G-D5 —
docs/nn/G_MACIERZ_LUK_BACKENDU_NN.md).

Zakres:
1. Schema nowych klas (LVBreakerMcbType, LVFuseLinkType) + pola addytywne
   LVCableType/LVApparatusType (round-trip to_dict/from_dict).
2. Kontrakty materializacji APARAT_NN_MCB/WKLADKA_NN kompletne.
3. Seedy ladują się przez CatalogRepository: MCB 30 rekordów, gG 30 rekordów.
4. Uzupelnienia pol cieplnych 17 kabli nN — spojnosc temperatur z izolacja;
   jth_1s_a_per_mm2 krzyzowo zweryfikowany wobec derive_k_iec60949 (±0,6%).
5. API routes /lv-breaker-mcb-types i /lv-fuse-link-types zwracają rekordy.
6. Determinizm — podwojne wywolanie get_default_mv_catalog() daje identyczne dane.
7. Rejestry tablic korekt Iz' nN (lv_ampacity_iec60364_5_52) — DANE zasilone kartą
   P0.5a (G-08/G-D1). Modul jest od P0.5a WYLACZNIE nosnikiem danych (fizyka —
   `cable_ampacity_derating` — testowana osobno w
   `tests/network_model/solvers/test_cable_ampacity_derating.py`).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from network_model.catalog import (
    MATERIALIZATION_CONTRACTS,
    CatalogNamespace,
    LVBreakerMcbType,
    LVFuseLinkType,
    get_default_mv_catalog,
)
from network_model.catalog.lv_ampacity_iec60364_5_52 import (
    TABLICA_GRUPOWANIA_GRUNTU_NN,
    TABLICA_GRUPOWANIA_POWIETRZE_NN,
    TABLICA_REZYSTYWNOSCI_GRUNTU_NN,
    TABLICA_TEMPERATURY_GRUNTU_NN,
    TABLICA_TEMPERATURY_POWIETRZE_NN,
    WpisNormyNN,
)
from network_model.solvers.conductor_thermal_withstand import derive_k_iec60949

# ---------------------------------------------------------------------------
# 1. Schema nowych klas
# ---------------------------------------------------------------------------


class TestLVBreakerMcbTypeSchema:
    def test_creation_and_round_trip(self) -> None:
        t = LVBreakerMcbType(
            id="mcb_test_c16",
            name="MCB C16",
            in_a=16.0,
            curve_class="C",
            icn_ka=6.0,
            poles=1,
        )
        assert t.in_a == 16.0
        assert t.curve_class == "C"
        assert t.icn_ka == 6.0
        assert t.u_n_kv == 0.4

        d = t.to_dict()
        assert d["in_a"] == 16.0
        assert d["curve_class"] == "C"
        assert d["icn_ka"] == 6.0
        assert d["verification_status"]
        assert d["source_reference"]
        assert d["catalog_status"]
        assert d["contract_version"]

        restored = LVBreakerMcbType.from_dict(d)
        assert restored.to_dict() == d

    def test_frozen(self) -> None:
        t = LVBreakerMcbType(id="a", name="a", in_a=6.0, curve_class="B", icn_ka=6.0)
        with pytest.raises(AttributeError):
            t.in_a = 10.0  # type: ignore[misc]


class TestLVFuseLinkTypeSchema:
    def test_creation_and_round_trip(self) -> None:
        t = LVFuseLinkType(
            id="fuse_test",
            name="gG NH00 63A",
            in_a=63.0,
            fuse_class="gG",
            size="NH00",
        )
        assert t.in_a == 63.0
        assert t.fuse_class == "gG"
        assert t.size == "NH00"
        assert t.i2t_prearc_a2s is None

        d = t.to_dict()
        assert d["i2t_prearc_a2s"] is None
        restored = LVFuseLinkType.from_dict(d)
        assert restored.to_dict() == d

    def test_frozen(self) -> None:
        t = LVFuseLinkType(id="a", name="a", in_a=25.0, fuse_class="gG", size="NH00")
        with pytest.raises(AttributeError):
            t.size = "NH1"  # type: ignore[misc]


class TestLVCableTypeAdditiveFields:
    def test_defaults_are_none(self) -> None:
        from network_model.catalog.types import LVCableType

        t = LVCableType(id="x", name="x", u_n_kv=0.4, r_ohm_per_km=0.1, x_ohm_per_km=0.05)
        assert t.r0_ohm_per_km is None
        assert t.x0_ohm_per_km is None
        assert t.ith_1s_a is None
        assert t.jth_1s_a_per_mm2 is None
        assert t.max_temperature_c is None
        assert t.short_circuit_temperature_c is None
        assert t.core_functions is None
        assert t.return_conductor_cross_section_mm2 is None
        assert t.return_conductor_r_ohm_per_km_20c is None
        assert t.standard is None

    def test_round_trip_with_thermal_fields(self) -> None:
        from network_model.catalog.types import LVCableType

        t = LVCableType(
            id="x",
            name="x",
            u_n_kv=0.4,
            r_ohm_per_km=0.1,
            x_ohm_per_km=0.05,
            conductor_material="CU",
            insulation_type="PVC",
            number_of_cores=4,
            core_functions="3L+PEN",
            max_temperature_c=70.0,
            short_circuit_temperature_c=160.0,
            jth_1s_a_per_mm2=114.84,
            standard="IEC 60502-1",
        )
        d = t.to_dict()
        restored = LVCableType.from_dict(d)
        assert restored.to_dict() == d
        assert restored.core_functions == "3L+PEN"
        assert restored.jth_1s_a_per_mm2 == 114.84


class TestLVApparatusTypeAdditiveFields:
    def test_defaults_are_none(self) -> None:
        from network_model.catalog.types import LVApparatusType

        t = LVApparatusType(id="x", name="x")
        assert t.ics_ka is None
        assert t.icw_ka is None
        assert t.poles is None
        assert t.trip_unit is None
        assert t.curve_ref is None
        assert t.ir_range is None
        assert t.isd_range is None
        assert t.ii_range is None
        assert t.tr_range is None
        assert t.tsd_range is None

    def test_round_trip_with_ranges(self) -> None:
        from network_model.catalog.types import LVApparatusType

        t = LVApparatusType(
            id="x",
            name="x",
            trip_unit="ELECTRONIC",
            curve_ref="curve_iec_normal_inverse",
            ir_range=(0.4, 1.0),
            isd_range=(2.0, 10.0),
            ii_range=(2.0, 15.0),
            tr_range=(1.0, 20.0),
            tsd_range=(0.1, 0.4),
        )
        d = t.to_dict()
        assert d["ir_range"] == [0.4, 1.0]
        restored = LVApparatusType.from_dict(d)
        assert restored.ir_range == (0.4, 1.0)
        assert restored.isd_range == (2.0, 10.0)
        assert restored.to_dict() == d

    def test_inverted_range_rejected(self) -> None:
        from network_model.catalog.types import LVApparatusType

        with pytest.raises(ValueError):
            LVApparatusType(id="x", name="x", ir_range=(1.0, 0.4))


# ---------------------------------------------------------------------------
# 2. Kontrakty materializacji
# ---------------------------------------------------------------------------


class TestMaterializationContracts:
    def test_aparat_nn_mcb_contract_exists(self) -> None:
        contract = MATERIALIZATION_CONTRACTS[CatalogNamespace.APARAT_NN_MCB.value]
        assert contract.solver_fields == ("u_n_kv", "in_a", "curve_class", "icn_ka")
        assert len(contract.ui_fields) > 0

    def test_wkladka_nn_contract_exists(self) -> None:
        contract = MATERIALIZATION_CONTRACTS[CatalogNamespace.WKLADKA_NN.value]
        assert contract.solver_fields == ("u_n_kv", "in_a", "fuse_class")
        assert len(contract.ui_fields) > 0

    def test_contract_solver_fields_exist_on_type_class(self) -> None:
        mcb = LVBreakerMcbType(id="a", name="a", in_a=16.0, curve_class="B", icn_ka=6.0)
        mcb_dict = mcb.to_dict()
        for field_name in MATERIALIZATION_CONTRACTS[
            CatalogNamespace.APARAT_NN_MCB.value
        ].solver_fields:
            assert field_name in mcb_dict

        fuse = LVFuseLinkType(id="b", name="b", in_a=25.0, fuse_class="gG", size="NH00")
        fuse_dict = fuse.to_dict()
        for field_name in MATERIALIZATION_CONTRACTS[
            CatalogNamespace.WKLADKA_NN.value
        ].solver_fields:
            assert field_name in fuse_dict


# ---------------------------------------------------------------------------
# 3. Seedy przez repository
# ---------------------------------------------------------------------------


class TestSeedsLoadThroughRepository:
    def test_mcb_seed_has_30_records(self) -> None:
        repo = get_default_mv_catalog()
        items = repo.list_lv_breaker_mcb_types()
        assert len(items) == 30

    def test_mcb_seed_covers_currents_and_curves(self) -> None:
        repo = get_default_mv_catalog()
        items = repo.list_lv_breaker_mcb_types()
        currents = {item.in_a for item in items}
        curves = {item.curve_class for item in items}
        assert currents == {6.0, 10.0, 13.0, 16.0, 20.0, 25.0, 32.0, 40.0, 50.0, 63.0}
        assert curves == {"B", "C", "D"}
        assert all(item.icn_ka == 6.0 for item in items)
        assert all(item.u_n_kv == 0.4 for item in items)

    def test_gg_seed_has_30_records(self) -> None:
        repo = get_default_mv_catalog()
        items = repo.list_lv_fuse_link_types()
        assert len(items) == 30

    def test_gg_seed_covers_sizes_and_currents(self) -> None:
        repo = get_default_mv_catalog()
        items = repo.list_lv_fuse_link_types()
        sizes = {item.size for item in items}
        currents = {item.in_a for item in items}
        assert sizes == {"NH00", "NH1", "NH2"}
        assert currents == {
            25.0,
            35.0,
            50.0,
            63.0,
            80.0,
            100.0,
            125.0,
            160.0,
            200.0,
            250.0,
        }
        assert all(item.fuse_class == "gG" for item in items)
        # G-D2: zero fabrykacji bramek I-t — pole zostaje jawnie puste.
        assert all(item.i2t_prearc_a2s is None for item in items)

    def test_seed_records_are_referencyjny(self) -> None:
        repo = get_default_mv_catalog()
        for item in repo.list_lv_breaker_mcb_types() + repo.list_lv_fuse_link_types():
            d = item.to_dict()
            assert d["verification_status"] == "REFERENCYJNY"
            assert d["catalog_status"] == "REFERENCYJNY_V1"
            assert d["source_reference"]

    def test_get_by_id(self) -> None:
        repo = get_default_mv_catalog()
        mcb = repo.get_lv_breaker_mcb_type("mcb_nn_c16a")
        assert mcb is not None
        assert mcb.in_a == 16.0
        assert mcb.curve_class == "C"
        assert repo.get_lv_breaker_mcb_type("nonexistent") is None

        fuse = repo.get_lv_fuse_link_type("fuse_nn_gg_nh00_63a")
        assert fuse is not None
        assert fuse.in_a == 63.0
        assert repo.get_lv_fuse_link_type("nonexistent") is None

    def test_ids_are_unique(self) -> None:
        repo = get_default_mv_catalog()
        mcb_ids = [item.id for item in repo.list_lv_breaker_mcb_types()]
        assert len(mcb_ids) == len(set(mcb_ids))
        fuse_ids = [item.id for item in repo.list_lv_fuse_link_types()]
        assert len(fuse_ids) == len(set(fuse_ids))


# ---------------------------------------------------------------------------
# 4. Uzupelnienia pol cieplnych kabli nN
# ---------------------------------------------------------------------------


class TestLvCableThermalFieldsConsistency:
    def test_all_17_records_present(self) -> None:
        repo = get_default_mv_catalog()
        assert len(repo.list_lv_cable_types()) == 17

    def test_core_functions_matches_number_of_cores(self) -> None:
        repo = get_default_mv_catalog()
        for item in repo.list_lv_cable_types():
            if item.number_of_cores == 5:
                assert item.core_functions == "3L+N+PE", item.id
            elif item.number_of_cores == 4:
                assert item.core_functions == "3L+PEN", item.id

    def test_temperatures_match_insulation_type(self) -> None:
        repo = get_default_mv_catalog()
        expected = {"PVC": (70.0, 160.0), "XLPE": (90.0, 250.0)}
        for item in repo.list_lv_cable_types():
            assert item.insulation_type in expected, item.id
            max_t, sc_t = expected[item.insulation_type]
            assert item.max_temperature_c == max_t, item.id
            assert item.short_circuit_temperature_c == sc_t, item.id

    def test_jth_cross_checked_against_derive_k_iec60949(self) -> None:
        repo = get_default_mv_catalog()
        for item in repo.list_lv_cable_types():
            if item.jth_1s_a_per_mm2 is None:
                continue
            derivation = derive_k_iec60949(
                conductor_material=item.conductor_material,
                temp_operating_c=item.max_temperature_c,
                temp_short_circuit_c=item.short_circuit_temperature_c,
            )
            assert derivation is not None, item.id
            relative_error = abs(derivation.k_a_s05_per_mm2 - item.jth_1s_a_per_mm2) / (
                derivation.k_a_s05_per_mm2
            )
            assert relative_error <= 0.006, (
                item.id,
                derivation.k_a_s05_per_mm2,
                item.jth_1s_a_per_mm2,
            )

    def test_r0_x0_and_return_conductor_left_none(self) -> None:
        """Brak danych producenta pozostaje jawny — zero fabrykacji (P0.2 §0.4)."""
        repo = get_default_mv_catalog()
        for item in repo.list_lv_cable_types():
            assert item.r0_ohm_per_km is None, item.id
            assert item.x0_ohm_per_km is None, item.id
            assert item.return_conductor_cross_section_mm2 is None, item.id
            assert item.return_conductor_r_ohm_per_km_20c is None, item.id

    def test_standard_field_populated(self) -> None:
        repo = get_default_mv_catalog()
        for item in repo.list_lv_cable_types():
            assert item.standard == "IEC 60502-1", item.id


# ---------------------------------------------------------------------------
# 5. API routes
# ---------------------------------------------------------------------------


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    db_path = tmp_path / "lv-catalog-p02-api.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")

    from api.main import app

    with TestClient(app) as test_client:
        yield test_client


class TestApiRoutes:
    def test_lv_breaker_mcb_types_route(self, client: TestClient) -> None:
        response = client.get("/api/catalog/lv-breaker-mcb-types")
        assert response.status_code == 200
        payload = response.json()
        assert isinstance(payload, list)
        assert len(payload) == 30
        assert any(item["id"] == "mcb_nn_c16a" for item in payload)

    def test_lv_fuse_link_types_route(self, client: TestClient) -> None:
        response = client.get("/api/catalog/lv-fuse-link-types")
        assert response.status_code == 200
        payload = response.json()
        assert isinstance(payload, list)
        assert len(payload) == 30
        assert any(item["id"] == "fuse_nn_gg_nh00_63a" for item in payload)

    def test_lv_cable_types_route_exposes_thermal_fields(self, client: TestClient) -> None:
        response = client.get("/api/catalog/lv-cable-types")
        assert response.status_code == 200
        payload = response.json()
        item = next(item for item in payload if item["id"] == "kab_nn_4x120_al")
        assert item["core_functions"] == "3L+PEN"
        assert item["max_temperature_c"] == 70.0
        assert item["short_circuit_temperature_c"] == 160.0
        assert item["jth_1s_a_per_mm2"] == 76.09


# ---------------------------------------------------------------------------
# 6. Determinizm
# ---------------------------------------------------------------------------


class TestDeterminism:
    def test_double_invocation_identical(self) -> None:
        repo_a = get_default_mv_catalog()
        repo_b = get_default_mv_catalog()

        mcb_a = [item.to_dict() for item in repo_a.list_lv_breaker_mcb_types()]
        mcb_b = [item.to_dict() for item in repo_b.list_lv_breaker_mcb_types()]
        assert mcb_a == mcb_b

        fuse_a = [item.to_dict() for item in repo_a.list_lv_fuse_link_types()]
        fuse_b = [item.to_dict() for item in repo_b.list_lv_fuse_link_types()]
        assert fuse_a == fuse_b

        cable_a = [item.to_dict() for item in repo_a.list_lv_cable_types()]
        cable_b = [item.to_dict() for item in repo_b.list_lv_cable_types()]
        assert cable_a == cable_b

    def test_deterministic_sort_order(self) -> None:
        repo = get_default_mv_catalog()
        items = repo.list_lv_breaker_mcb_types()
        expected_order = sorted(items, key=lambda item: (str(item.name), str(item.id)))
        assert items == expected_order


# ---------------------------------------------------------------------------
# 7. Rejestry tablic korekt Iz' nN (G-08/G-D1) — modul jest CZYSTYM nosnikiem
#    DANYCH od karty P0.5a (regula KLASA NIE INSTANCJA — patrz docstring modulu
#    `lv_ampacity_iec60364_5_52`); fizyka (mnozenie, sklad) zyje WYLACZNIE w
#    `network_model.solvers.cable_ampacity_derating`, testowana osobno.
# ---------------------------------------------------------------------------


class TestLvAmpacityRejestryDanych:
    _WSZYSTKIE_TABLICE = (
        TABLICA_TEMPERATURY_POWIETRZE_NN,
        TABLICA_TEMPERATURY_GRUNTU_NN,
        TABLICA_REZYSTYWNOSCI_GRUNTU_NN,
        TABLICA_GRUPOWANIA_POWIETRZE_NN,
        TABLICA_GRUPOWANIA_GRUNTU_NN,
    )

    def test_rejestry_zasilone_kartaP0_5a(self) -> None:
        """G-D1: karta P0.5a zasiliła rejestry wartościami zweryfikowanymi w 2 źródłach."""
        assert len(TABLICA_TEMPERATURY_POWIETRZE_NN) == 10  # PVC(4) + XLPE(6)
        assert len(TABLICA_TEMPERATURY_GRUNTU_NN) == 10  # PVC(5) + XLPE(5)
        assert len(TABLICA_REZYSTYWNOSCI_GRUNTU_NN) == 7
        assert len(TABLICA_GRUPOWANIA_POWIETRZE_NN) == 5  # n=1,2,3,4,6 (n=5 poza zakresem)
        assert len(TABLICA_GRUPOWANIA_GRUNTU_NN) == 4  # n=1,2,3,4 (n=5,6 poza zakresem)

    def test_kazdy_wpis_jest_wpisnormynn_z_wartoscia_i_podstawa(self) -> None:
        for tablica in self._WSZYSTKIE_TABLICE:
            for wpis in tablica.values():
                assert isinstance(wpis, WpisNormyNN)
                assert 0.0 < wpis.wartosc <= 1.3
                assert "PN-HD 60364-5-52" in wpis.podstawa

    def test_referencje_normy_dają_wspolczynnik_1_0(self) -> None:
        assert TABLICA_TEMPERATURY_POWIETRZE_NN[("PVC", 30)].wartosc == 1.0
        assert TABLICA_TEMPERATURY_POWIETRZE_NN[("XLPE", 30)].wartosc == 1.0
        assert TABLICA_TEMPERATURY_GRUNTU_NN[("PVC", 20)].wartosc == 1.0
        assert TABLICA_TEMPERATURY_GRUNTU_NN[("XLPE", 20)].wartosc == 1.0
        assert TABLICA_REZYSTYWNOSCI_GRUNTU_NN[2.5].wartosc == 1.0
        assert TABLICA_GRUPOWANIA_POWIETRZE_NN[1].wartosc == 1.0
        assert TABLICA_GRUPOWANIA_GRUNTU_NN[1].wartosc == 1.0

    def test_wpis_poza_zakresem_odrzucony(self) -> None:
        with pytest.raises(ValueError, match="zakresie"):
            WpisNormyNN(wartosc=1.31, podstawa="test")

    def test_wpis_bez_podstawy_odrzucony(self) -> None:
        with pytest.raises(ValueError, match="podstawy"):
            WpisNormyNN(wartosc=1.0, podstawa="")

    def test_modul_nie_ma_wlasnej_implementacji_liczacej(self) -> None:
        """Regula KLASA NIE INSTANCJA: modul danych nie eksportuje `obciazalnosc_skorygowana`
        ani `iloczyn` — mnożenie żyje wyłącznie w warstwie solvera (cable_ampacity_derating)."""
        import network_model.catalog.lv_ampacity_iec60364_5_52 as modul_danych

        assert not hasattr(modul_danych, "obciazalnosc_skorygowana")
        assert not hasattr(modul_danych, "iloczyn")
        assert not hasattr(WpisNormyNN, "iloczyn")
