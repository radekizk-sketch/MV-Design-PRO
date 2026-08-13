"""
Testy katalogu wyposazenia SN: transformatory, aparatura laczeniowa, konwertery OZE.

Sprawdza:
- Kompletnosc danych katalogowych
- Poprawnosc parametrow (zakresy fizyczne)
- Poprawnosc ladowania do CatalogRepository
- Determinizm listowan
"""

from network_model.catalog.mv_converter_catalog import (
    get_all_converter_types,
    get_bess_types,
    get_converter_catalog_statistics,
    get_pv_types,
    get_wind_types,
)
from network_model.catalog.mv_switch_catalog import (
    get_all_switch_equipment_types,
    get_circuit_breakers,
    get_reclosers,
    get_switch_catalog_statistics,
)
from network_model.catalog.mv_transformer_catalog import (
    get_all_transformer_types,
    get_sn_nn_transformer_types,
    get_transformer_catalog_statistics,
    get_wn_sn_transformer_types,
)
from network_model.catalog.repository import get_default_mv_catalog
from network_model.core.switch import SwitchType

# =============================================================================
# TESTY KATALOGU TRANSFORMATOROW
# =============================================================================


class TestTransformerCatalog:
    def test_all_transformer_types_count(self):
        """Katalog zawiera co najmniej 20 typow transformatorow."""
        types = get_all_transformer_types()
        assert len(types) >= 20

    def test_wn_sn_transformer_types(self):
        """Transformatory WN/SN: co najmniej 8 typow (110/15 + 110/20)."""
        types = get_wn_sn_transformer_types()
        assert len(types) >= 8

    def test_sn_nn_transformer_types(self):
        """Transformatory SN/nN: co najmniej 12 typow (Dyn11 + Yd11)."""
        types = get_sn_nn_transformer_types()
        assert len(types) >= 12

    def test_wn_sn_voltage_levels(self):
        """Transformatory WN/SN maja poprawne napiecia."""
        for t in get_wn_sn_transformer_types():
            p = t["params"]
            assert p["voltage_hv_kv"] == 110.0
            assert p["voltage_lv_kv"] in (15.0, 20.0)

    def test_sn_nn_voltage_levels(self):
        """Transformatory SN/nN maja poprawne napiecia."""
        allowed_lv_levels = {0.4, 0.5, 0.69, 0.8, 1.0, 3.15, 6.0, 6.3}
        for t in get_sn_nn_transformer_types():
            p = t["params"]
            assert p["voltage_hv_kv"] in (15.0, 20.0)
            assert p["voltage_lv_kv"] in allowed_lv_levels

    def test_transformer_uk_positive(self):
        """Wszystkie transformatory maja uk% > 0."""
        for t in get_all_transformer_types():
            assert t["params"]["uk_percent"] > 0, f"{t['id']}: uk% must be > 0"

    def test_transformer_rated_power_positive(self):
        """Wszystkie transformatory maja moc znamionowa > 0."""
        for t in get_all_transformer_types():
            assert t["params"]["rated_power_mva"] > 0, f"{t['id']}: Sn must be > 0"

    def test_transformer_vector_groups(self):
        """Grupy polaczen sa poprawne."""
        valid_groups = {"Yd11", "Dyn11", "Yd5", "YNd11"}
        for t in get_all_transformer_types():
            vg = t["params"]["vector_group"]
            assert vg in valid_groups, f"{t['id']}: invalid vector group {vg}"

    def test_transformer_uk_range(self):
        """uk% w zakresie fizycznym (3-15%)."""
        for t in get_all_transformer_types():
            uk = t["params"]["uk_percent"]
            assert 3.0 <= uk <= 15.0, f"{t['id']}: uk%={uk} out of range"

    def test_transformer_ids_unique(self):
        """ID transformatorow sa unikalne."""
        types = get_all_transformer_types()
        ids = [t["id"] for t in types]
        assert len(ids) == len(set(ids)), "Duplicate transformer IDs found"

    def test_transformer_statistics(self):
        """Statystyki katalogu sa poprawne."""
        stats = get_transformer_catalog_statistics()
        assert stats["liczba_transformatorow_ogolem"] >= 20
        assert stats["liczba_wn_sn"] >= 8
        assert stats["liczba_sn_nn"] >= 12
        assert "Yd11" in stats["grupy_polaczen"]
        assert "Dyn11" in stats["grupy_polaczen"]

    def test_golden_network_transformers_available(self):
        """Transformatory wymagane przez Golden Network sa w katalogu."""
        types = get_all_transformer_types()
        ids = {t["id"] for t in types}
        assert "tr-wn-sn-110-15-25mva-yd11" in ids
        assert "tr-sn-nn-15-04-160kva-dyn11" in ids
        assert "tr-sn-nn-15-04-400kva-dyn11" in ids
        assert "tr-sn-nn-15-04-630kva-dyn11" in ids
        assert "tr-sn-nn-15-04-63kva-dyn11" in ids
        assert "tr-sn-nn-15-04-100kva-dyn11" in ids
        assert "tr-sn-nn-15-04-250kva-dyn11" in ids
        assert "tr-sn-nn-15-04-1000kva-dyn11" in ids


# =============================================================================
# TESTY KATALOGU APARATURY LACZENIOWEJ
# =============================================================================


class TestSwitchCatalog:
    def test_all_switch_types_count(self):
        """Katalog zawiera co najmniej 20 typow aparatury."""
        types = get_all_switch_equipment_types()
        assert len(types) >= 20

    def test_circuit_breakers_count(self):
        """Co najmniej 5 wylacznikow."""
        assert len(get_circuit_breakers()) >= 5

    def test_reclosers_count(self):
        """Co najmniej 2 reklozery."""
        assert len(get_reclosers()) >= 2

    def test_circuit_breaker_ik_positive(self):
        """Wylaczniki maja zdolnosc laczeniowa > 0."""
        for t in get_circuit_breakers():
            assert t["params"]["ik_ka"] > 0, f"{t['id']}: ik_ka must be > 0"

    def test_recloser_ik_positive(self):
        """Reklozery maja zdolnosc laczeniowa > 0."""
        for t in get_reclosers():
            assert t["params"]["ik_ka"] > 0, f"{t['id']}: ik_ka must be > 0"

    def test_switch_equipment_kind_valid(self):
        """Rodzaje aparatury sa poprawne."""
        valid_kinds = {
            "CIRCUIT_BREAKER",
            "DISCONNECTOR",
            "LOAD_SWITCH",
            "FUSE",
            "RECLOSER",
            "EARTH_SWITCH",
        }
        for t in get_all_switch_equipment_types():
            kind = t["params"]["equipment_kind"]
            assert kind in valid_kinds, f"{t['id']}: invalid kind {kind}"

    def test_switch_ids_unique(self):
        """ID aparatury sa unikalne."""
        types = get_all_switch_equipment_types()
        ids = [t["id"] for t in types]
        assert len(ids) == len(set(ids)), "Duplicate switch IDs found"

    def test_switch_un_positive(self):
        """Napiecie znamionowe > 0 (z wyjatkiem uziemnikow)."""
        for t in get_all_switch_equipment_types():
            assert t["params"]["un_kv"] >= 0, f"{t['id']}: un_kv must be >= 0"

    def test_switch_statistics(self):
        """Statystyki katalogu sa poprawne."""
        stats = get_switch_catalog_statistics()
        assert stats["liczba_aparatury_ogolem"] >= 20
        assert stats["liczba_wylacznikow"] >= 5
        assert stats["liczba_reklozerow"] >= 2


# =============================================================================
# TESTY KATALOGU KONWERTEROW OZE
# =============================================================================


class TestConverterCatalog:
    def test_all_converter_types_count(self):
        """Katalog zawiera co najmniej 10 typow konwerterow."""
        types = get_all_converter_types()
        assert len(types) >= 10

    def test_pv_types(self):
        """Co najmniej 3 typy farm PV."""
        assert len(get_pv_types()) >= 3

    def test_wind_types(self):
        """Co najmniej 2 typy turbin wiatrowych."""
        assert len(get_wind_types()) >= 2

    def test_bess_types(self):
        """Co najmniej 3 typy magazynow energii."""
        assert len(get_bess_types()) >= 3

    def test_bess_has_energy(self):
        """Magazyny energii maja pojemnosc e_kwh > 0."""
        for t in get_bess_types():
            assert t["params"]["e_kwh"] > 0, f"{t['id']}: BESS must have e_kwh > 0"

    def test_converter_power_positive(self):
        """Wszystkie konwertery maja moc > 0."""
        for t in get_all_converter_types():
            assert t["params"]["pmax_mw"] > 0, f"{t['id']}: pmax_mw must be > 0"
            assert t["params"]["sn_mva"] > 0, f"{t['id']}: sn_mva must be > 0"

    def test_converter_cosphi_range(self):
        """cos(phi) w zakresie [0.8, 1.0]."""
        for t in get_all_converter_types():
            p = t["params"]
            if p.get("cosphi_min") is not None:
                assert 0.8 <= p["cosphi_min"] <= 1.0
            if p.get("cosphi_max") is not None:
                assert 0.8 <= p["cosphi_max"] <= 1.0

    def test_converter_ids_unique(self):
        """ID konwerterow sa unikalne."""
        types = get_all_converter_types()
        ids = [t["id"] for t in types]
        assert len(ids) == len(set(ids)), "Duplicate converter IDs found"

    def test_converter_statistics(self):
        """Statystyki katalogu sa poprawne."""
        stats = get_converter_catalog_statistics()
        assert stats["liczba_konwerterow_ogolem"] >= 10
        assert stats["liczba_pv"] >= 3
        assert stats["liczba_bess"] >= 3

    def test_golden_network_pv_available(self):
        """Farma PV 2 MW (Golden Network) jest w katalogu."""
        types = get_all_converter_types()
        ids = {t["id"] for t in types}
        assert "conv-pv-2mw-15kv" in ids

    def test_golden_network_bess_available(self):
        """BESS 1 MW / 2 MWh (Golden Network) jest w katalogu."""
        types = get_all_converter_types()
        ids = {t["id"] for t in types}
        assert "conv-bess-1mw-2mwh-15kv" in ids


# =============================================================================
# TESTY SWITCH TYPE ENUM (RECLOSER + EARTH_SWITCH)
# =============================================================================


class TestSwitchTypeEnum:
    def test_recloser_in_switch_type(self):
        """SwitchType zawiera RECLOSER."""
        assert SwitchType.RECLOSER.value == "RECLOSER"

    def test_earth_switch_in_switch_type(self):
        """SwitchType zawiera EARTH_SWITCH."""
        assert SwitchType.EARTH_SWITCH.value == "EARTH_SWITCH"

    def test_all_switch_types(self):
        """SwitchType ma 6 wartosci."""
        assert len(SwitchType) == 6


# =============================================================================
# TESTY INTEGRACJI Z CatalogRepository
# =============================================================================


class TestCatalogIntegration:
    def test_default_catalog_loads(self):
        """Domyslny katalog laduje sie bez bledow."""
        catalog = get_default_mv_catalog()
        assert catalog is not None

    def test_default_catalog_has_transformers(self):
        """Domyslny katalog zawiera transformatory."""
        catalog = get_default_mv_catalog()
        transformers = catalog.list_transformer_types()
        assert len(transformers) >= 20

    def test_default_catalog_has_switches(self):
        """Domyslny katalog zawiera aparature laczeniowa."""
        catalog = get_default_mv_catalog()
        switches = catalog.list_switch_equipment_types()
        assert len(switches) >= 20

    def test_default_catalog_has_converters(self):
        """Domyslny katalog zawiera konwertery OZE."""
        catalog = get_default_mv_catalog()
        converters = catalog.list_converter_types()
        assert len(converters) >= 10

    def test_default_catalog_has_cables_lines(self):
        """Domyslny katalog nadal zawiera kable i linie."""
        catalog = get_default_mv_catalog()
        cables = catalog.list_cable_types()
        lines = catalog.list_line_types()
        assert len(cables) >= 40
        assert len(lines) >= 15

    def test_catalog_get_transformer_by_id(self):
        """Pobranie transformatora po ID."""
        catalog = get_default_mv_catalog()
        tr = catalog.get_transformer_type("tr-wn-sn-110-15-25mva-yd11")
        assert tr is not None
        assert tr.rated_power_mva == 25.0
        assert tr.voltage_hv_kv == 110.0
        assert tr.voltage_lv_kv == 15.0
        assert tr.uk_percent == 11.0
        assert tr.vector_group == "Yd11"

    def test_catalog_get_switch_by_id(self):
        """Pobranie aparatury po ID."""
        catalog = get_default_mv_catalog()
        sw = catalog.get_switch_equipment_type("sw-cb-abb-vd4-12kv-630a")
        assert sw is not None
        assert sw.equipment_kind == "CIRCUIT_BREAKER"
        assert sw.in_a == 630.0

    def test_catalog_get_converter_by_id(self):
        """Pobranie konwertera po ID."""
        catalog = get_default_mv_catalog()
        conv = catalog.get_converter_type("conv-pv-2mw-15kv")
        assert conv is not None
        assert conv.pmax_mw == 2.0

    def test_catalog_deterministic_listing(self):
        """Listowanie jest deterministyczne (dwa wywolania daja ten sam wynik)."""
        catalog = get_default_mv_catalog()
        list1 = [t.id for t in catalog.list_transformer_types()]
        list2 = [t.id for t in catalog.list_transformer_types()]
        assert list1 == list2

    def test_catalog_total_count(self):
        """Katalog ma lacznie >= 100 typow wyposazenia."""
        catalog = get_default_mv_catalog()
        total = (
            len(catalog.list_cable_types())
            + len(catalog.list_line_types())
            + len(catalog.list_transformer_types())
            + len(catalog.list_switch_equipment_types())
            + len(catalog.list_converter_types())
        )
        assert total >= 100, f"Total catalog entries: {total} (expected >= 100)"
