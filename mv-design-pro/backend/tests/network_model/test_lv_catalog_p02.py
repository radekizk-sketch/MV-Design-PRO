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
        # Kanon rundy 5 uzgodnień: wkładka ZAWSZE niesie breaking_capacity_ka
        # (intencja pierwotna testu — round-trip schematu — zachowana; default
        # None przestał być legalny, patrz test zapadki niżej).
        t = LVFuseLinkType(
            id="fuse_test",
            name="gG NH00 63A",
            in_a=63.0,
            fuse_class="gG",
            size="NH00",
            breaking_capacity_ka=120.0,
        )
        assert t.in_a == 63.0
        assert t.fuse_class == "gG"
        assert t.size == "NH00"
        assert t.i2t_prearc_a2s is None

        d = t.to_dict()
        assert d["i2t_prearc_a2s"] is None
        assert d["breaking_capacity_ka"] == 120.0
        restored = LVFuseLinkType.from_dict(d)
        assert restored.to_dict() == d

    def test_zapadka_wkladka_bez_zdolnosci_wylaczania_czerwona(self) -> None:
        """Zapadka rundy 5 (odpowiedź nadzoru na rundę 3): wkładka bez
        `breaking_capacity_ka` (albo z wartością <=0) = BŁĄD DANYCH katalogu
        podnoszony STRUKTURALNIE przy konstrukcji — nigdy ciche None, żeby
        dowód wytrzymałości nN nie odziedziczył SN-owego NIE_DOTYCZY."""
        for zly in (None, 0.0, -1.0):
            with pytest.raises(ValueError, match="zdolności wyłączania"):
                LVFuseLinkType(
                    id="fuse_bad",
                    name="gG NH00 63A",
                    in_a=63.0,
                    fuse_class="gG",
                    size="NH00",
                    breaking_capacity_ka=zly,
                )

    def test_zapadka_caly_katalog_wkladek_zasilony(self) -> None:
        """Iloczyn cech, nie przykład: KAŻDY rekord WKLADKA_NN w katalogu
        domyślnym niesie dodatnią zdolność wyłączania (zapadka + dane spójne)."""
        catalog = get_default_mv_catalog()
        wkladki = catalog.list_lv_fuse_link_types()
        assert wkladki
        for w in wkladki:
            assert w.breaking_capacity_ka is not None and w.breaking_capacity_ka > 0

    def test_frozen(self) -> None:
        t = LVFuseLinkType(
            id="a", name="a", in_a=25.0, fuse_class="gG", size="NH00", breaking_capacity_ka=120.0
        )
        with pytest.raises(AttributeError):
            t.size = "NH1"  # type: ignore[misc]

    def test_breaking_capacity_ka_round_trip(self) -> None:
        """Karta P0.7 — pole NOWE (zdolność wyłączania wkładki, IEC 60269-1/-2)."""
        t = LVFuseLinkType(
            id="fuse_test_bc",
            name="gG NH00 63A",
            in_a=63.0,
            fuse_class="gG",
            size="NH00",
            breaking_capacity_ka=120.0,
        )
        assert t.breaking_capacity_ka == 120.0
        d = t.to_dict()
        assert d["breaking_capacity_ka"] == 120.0
        restored = LVFuseLinkType.from_dict(d)
        assert restored.breaking_capacity_ka == 120.0
        assert restored.to_dict() == d


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
        assert t.return_conductor_x_ohm_per_km is None
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

    def test_round_trip_with_return_conductor_reactance(self) -> None:
        """Karta P0.6 (G-05): reaktancja żyły powrotnej — pole NOWE, brakujące
        w całym repozytorium przed tą kartą (petla zwarcia L-PE/L-PEN)."""
        from network_model.catalog.types import LVCableType

        t = LVCableType(
            id="x",
            name="x",
            u_n_kv=0.4,
            r_ohm_per_km=0.1,
            x_ohm_per_km=0.05,
            return_conductor_cross_section_mm2=25.0,
            return_conductor_r_ohm_per_km_20c=0.727,
            return_conductor_x_ohm_per_km=0.09,
        )
        d = t.to_dict()
        assert d["return_conductor_x_ohm_per_km"] == 0.09
        restored = LVCableType.from_dict(d)
        assert restored.to_dict() == d
        assert restored.return_conductor_x_ohm_per_km == 0.09


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
        assert t.conditional_sc_current_ka is None  # default — karta P0.7

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

    def test_conditional_sc_current_ka_round_trip(self) -> None:
        """Karta P0.7, „Stanowisko nN runda 3" — warunkowy prąd zwarciowy
        KOMBINACJI rozłącznik+wkładka, osobne od `i_cu_ka`."""
        from network_model.catalog.types import LVApparatusType

        t = LVApparatusType(
            id="rb_test",
            name="Rozłącznik bezpiecznikowy test",
            device_kind="ROZLACZNIK_BEZPIECZNIKOWY",
            i_cu_ka=None,
            conditional_sc_current_ka=50.0,
        )
        assert t.i_cu_ka is None
        assert t.conditional_sc_current_ka == 50.0
        d = t.to_dict()
        assert d["conditional_sc_current_ka"] == 50.0
        assert d["i_cu_ka"] is None
        restored = LVApparatusType.from_dict(d)
        assert restored.conditional_sc_current_ka == 50.0
        assert restored.i_cu_ka is None
        assert restored.to_dict() == d


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

        fuse = LVFuseLinkType(
            id="b", name="b", in_a=25.0, fuse_class="gG", size="NH00", breaking_capacity_ka=120.0
        )
        fuse_dict = fuse.to_dict()
        for field_name in MATERIALIZATION_CONTRACTS[
            CatalogNamespace.WKLADKA_NN.value
        ].solver_fields:
            assert field_name in fuse_dict

    def test_kabel_nn_contract_includes_return_conductor_fields(self) -> None:
        """Karta P0.6 (G-05) — regresja defektu KLASA NIE INSTANCJA: kontrakt
        materializacji KABEL_SN niósł pola żyły powrotnej od karty F-K1, ale
        KABEL_NN — ten sam rodzaj danych, ten sam kabel-z-katalogu — NIE (P0.2
        dodał pola do `LVCableType`, ale nikt nie dopisał ich do kontraktu
        materializacji, więc ginęły po drodze katalog → materialized_params →
        Cable). Bez tej listy petla zwarcia P0.6 nie miałaby danych żyły
        powrotnej dla ŻADNEGO kabla nN związanego z katalogiem."""
        # NIE obejmuje "return_conductor_material" — `LVCableType` (w odróżnieniu
        # od SN `CableType`) NIE MA tego pola; dodanie go do solver_fields byłoby
        # martwym wpisem (zawsze None), patrz komentarz przy kontrakcie w
        # network_model/catalog/types.py.
        contract = MATERIALIZATION_CONTRACTS[CatalogNamespace.KABEL_NN.value]
        for field_name in (
            "return_conductor_cross_section_mm2",
            "return_conductor_r_ohm_per_km_20c",
            "return_conductor_x_ohm_per_km",
        ):
            assert field_name in contract.solver_fields, (
                f"KABEL_NN solver_fields brakuje '{field_name}' — dane żyły "
                "powrotnej z katalogu nie dotrą do materialized_params."
            )
        assert "return_conductor_material" not in contract.solver_fields

    def test_kabel_nn_solver_fields_exist_on_lv_cable_type(self) -> None:
        from network_model.catalog.types import LVCableType

        t = LVCableType(
            id="x",
            name="x",
            u_n_kv=0.4,
            r_ohm_per_km=0.1,
            x_ohm_per_km=0.05,
            return_conductor_cross_section_mm2=25.0,
            return_conductor_r_ohm_per_km_20c=0.727,
            return_conductor_x_ohm_per_km=0.09,
        )
        t_dict = t.to_dict()
        for field_name in MATERIALIZATION_CONTRACTS[CatalogNamespace.KABEL_NN.value].solver_fields:
            assert field_name in t_dict

    def test_kabel_nn_materialization_end_to_end_carries_return_conductor(self) -> None:
        """Dowód end-to-end (nie tylko deklaracja kontraktu): katalog →
        materialize_catalog_binding → materialized_params NIESIE R i X żyły
        powrotnej. Reprodukuje ROZLIŚLIWY defekt sprzed karty P0.6 (bez
        fix'u ten test failuje z solver_fields[...] == None mimo
        success=True — materializacja `success` nie gwarantowała
        KOMPLETNOŚCI pól, tylko że binding wskazuje istniejący rekord)."""
        from network_model.catalog.materialization import materialize_catalog_binding
        from network_model.catalog.repository import CatalogRepository
        from network_model.catalog.types import CatalogBinding, LVCableType

        item = LVCableType(
            id="test-kabel-nn-return-conductor",
            name="Test YKY 4x25",
            u_n_kv=0.4,
            r_ohm_per_km=0.727,
            x_ohm_per_km=0.08,
            return_conductor_cross_section_mm2=25.0,
            return_conductor_r_ohm_per_km_20c=0.727,
            return_conductor_x_ohm_per_km=0.08,
        )
        record = {"id": item.id, "name": item.name, "params": item.to_dict()}
        repo = CatalogRepository.from_records(
            line_types=[], cable_types=[], transformer_types=[], lv_cable_types=[record]
        )
        binding = CatalogBinding(
            catalog_namespace="KABEL_NN",
            catalog_item_id=item.id,
            catalog_item_version="2026.01",
            materialize=True,
        )
        result = materialize_catalog_binding(binding, repo)
        assert result.success
        assert result.solver_fields["return_conductor_cross_section_mm2"] == 25.0
        assert result.solver_fields["return_conductor_r_ohm_per_km_20c"] == 0.727
        assert result.solver_fields["return_conductor_x_ohm_per_km"] == 0.08


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
        # Karta P0.7 — flip-to-verified: zdolność wyłączania ZASILONA (120 kA,
        # dwa niezależne źródła — patrz mv_auxiliary_catalog.py).
        assert all(item.breaking_capacity_ka == 120.0 for item in items)

    def test_rozlacznik_bezpiecznikowy_seed_uses_conditional_sc_current(self) -> None:
        """Karta P0.7 runda 3 — i_cu_ka „nie dotyczy" (rozłącznik SAM nie ma
        zdolności wyłączania), conditional_sc_current_ka niesie wartość
        KOMBINACJI (Jean Muller NH, 50 kA)."""
        repo = get_default_mv_catalog()
        rozlaczniki = [
            a
            for a in repo.list_lv_apparatus_types()
            if a.device_kind == "ROZLACZNIK_BEZPIECZNIKOWY"
        ]
        assert len(rozlaczniki) == 3
        for a in rozlaczniki:
            assert a.i_cu_ka is None
            assert a.conditional_sc_current_ka == 50.0

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
