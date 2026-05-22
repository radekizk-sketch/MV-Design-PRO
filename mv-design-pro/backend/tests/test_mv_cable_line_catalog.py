"""
Testy katalogu kabli SN i linii napowietrznych.

Weryfikuje:
1. Kompletność danych elektrycznych i cieplnych
2. Poprawność mapowania typów producentów na typy bazowe
3. Deterministyczność katalogu
4. Integrację z analizą I>> (dane cieplne)
5. Wykrywanie typów niekompletnych
"""

import sys
from pathlib import Path

import pytest

backend_src = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(backend_src))

from network_model.catalog import (
    ParameterSource,
    get_default_mv_catalog,
    resolve_thermal_params,
)
from network_model.catalog.mv_cable_line_catalog import (
    JTH_AL_ST_OHL,
    JTH_AL_XLPE,
    JTH_CU_XLPE,
    get_all_cable_types,
    get_all_line_types,
    get_base_cable_type_ids,
    get_base_line_type_ids,
    get_catalog_statistics,
    get_manufacturer_cable_type_ids,
)


class TestCatalogCompleteness:
    """Testy kompletności danych w katalogu."""

    def test_cable_types_have_required_fields(self) -> None:
        """Wszystkie typy kabli mają wymagane pola elektryczne."""
        catalog = get_default_mv_catalog()
        cables = catalog.list_cable_types()

        assert len(cables) > 0, "Katalog kabli jest pusty"

        for cable in cables:
            assert cable.id, f"Kabel bez ID: {cable}"
            assert cable.name, f"Kabel bez nazwy: {cable.id}"
            assert cable.r_ohm_per_km > 0, f"Kabel {cable.id}: R20 <= 0"
            assert cable.x_ohm_per_km > 0, f"Kabel {cable.id}: X <= 0"
            assert cable.cross_section_mm2 > 0, f"Kabel {cable.id}: przekrój <= 0"
            assert cable.conductor_material in (
                "CU",
                "AL",
            ), f"Kabel {cable.id}: nieznany materiał {cable.conductor_material}"
            assert cable.insulation_type in (
                "XLPE",
                "EPR",
            ), f"Kabel {cable.id}: nieznana izolacja {cable.insulation_type}"
            assert cable.number_of_cores in (
                1,
                3,
            ), f"Kabel {cable.id}: nieprawidłowa liczba żył {cable.number_of_cores}"

    def test_line_types_have_required_fields(self) -> None:
        """Wszystkie typy linii mają wymagane pola elektryczne."""
        catalog = get_default_mv_catalog()
        lines = catalog.list_line_types()

        assert len(lines) > 0, "Katalog linii jest pusty"

        for line in lines:
            assert line.id, f"Linia bez ID: {line}"
            assert line.name, f"Linia bez nazwy: {line.id}"
            assert line.r_ohm_per_km > 0, f"Linia {line.id}: R20 <= 0"
            assert line.x_ohm_per_km > 0, f"Linia {line.id}: X <= 0"
            assert line.cross_section_mm2 > 0, f"Linia {line.id}: przekrój <= 0"
            assert line.conductor_material in (
                "AL",
                "AL_ST",
            ), f"Linia {line.id}: nieznany materiał {line.conductor_material}"


    def test_production_cables_have_zero_sequence_parameters(self) -> None:
        """Produkcyjne typy kabli SN mają katalogowe R0/X0 do zwarć doziemnych."""
        catalog = get_default_mv_catalog()

        for cable in catalog.list_cable_types():
            if "incomplete" in cable.id:
                continue
            assert cable.r0_ohm_per_km is not None, f"Kabel {cable.id}: brak R0"
            assert cable.x0_ohm_per_km is not None, f"Kabel {cable.id}: brak X0"
            assert cable.r0_ohm_per_km > 0, f"Kabel {cable.id}: R0 <= 0"
            assert cable.x0_ohm_per_km > 0, f"Kabel {cable.id}: X0 <= 0"

    def test_production_lines_have_zero_sequence_parameters(self) -> None:
        """Produkcyjne typy linii napowietrznych SN mają katalogowe R0/X0."""
        catalog = get_default_mv_catalog()

        for line in catalog.list_line_types():
            if "incomplete" in line.id:
                continue
            assert line.r0_ohm_per_km is not None, f"Linia {line.id}: brak R0"
            assert line.x0_ohm_per_km is not None, f"Linia {line.id}: brak X0"
            assert line.r0_ohm_per_km > 0, f"Linia {line.id}: R0 <= 0"
            assert line.x0_ohm_per_km > 0, f"Linia {line.id}: X0 <= 0"


class TestThermalDataCompleteness:
    """Testy kompletności danych cieplnych."""

    def test_base_cable_types_have_thermal_data(self) -> None:
        """Typy bazowe kabli mają kompletne dane cieplne."""
        catalog = get_default_mv_catalog()
        base_ids = set(get_base_cable_type_ids())

        for cable_id in base_ids:
            cable = catalog.get_cable_type(cable_id)
            assert cable is not None, f"Brak typu bazowego kabla: {cable_id}"
            assert (
                cable.dane_cieplne_kompletne
            ), f"Typ bazowy kabla {cable_id} ma niekompletne dane cieplne"
            # Sprawdź czy jth jest ustawione (bazowe używają jth)
            assert (
                cable.jth_1s_a_per_mm2 is not None and cable.jth_1s_a_per_mm2 > 0
            ), f"Typ bazowy kabla {cable_id}: brak jth_1s_a_per_mm2"

    def test_base_line_types_have_thermal_data(self) -> None:
        """Typy bazowe linii mają kompletne dane cieplne."""
        catalog = get_default_mv_catalog()
        base_ids = set(get_base_line_type_ids())

        for line_id in base_ids:
            line = catalog.get_line_type(line_id)
            assert line is not None, f"Brak typu bazowego linii: {line_id}"
            assert (
                line.dane_cieplne_kompletne
            ), f"Typ bazowy linii {line_id} ma niekompletne dane cieplne"
            # Sprawdź czy jth jest ustawione (bazowe używają jth)
            assert (
                line.jth_1s_a_per_mm2 is not None and line.jth_1s_a_per_mm2 > 0
            ), f"Typ bazowy linii {line_id}: brak jth_1s_a_per_mm2"

    def test_manufacturer_cable_types_have_thermal_data(self) -> None:
        """Typy producentów kabli mają kompletne dane cieplne."""
        catalog = get_default_mv_catalog()
        manufacturer_ids = set(get_manufacturer_cable_type_ids())

        for cable_id in manufacturer_ids:
            cable = catalog.get_cable_type(cable_id)
            assert cable is not None, f"Brak typu producenta kabla: {cable_id}"
            assert (
                cable.dane_cieplne_kompletne
            ), f"Typ producenta kabla {cable_id} ma niekompletne dane cieplne"

    def test_incomplete_types_detected(self) -> None:
        """Typy niekompletne są poprawnie wykrywane."""
        catalog = get_default_mv_catalog()

        # Typ niekompletny kabla
        incomplete_cable = catalog.get_cable_type("cable-incomplete-test")
        assert incomplete_cable is not None, "Brak typu testowego niekompletnego kabla"
        assert (
            not incomplete_cable.dane_cieplne_kompletne
        ), "Typ niekompletny kabla powinien mieć dane_cieplne_kompletne=False"
        assert (
            incomplete_cable.ith_1s_a is None
        ), "Typ niekompletny kabla powinien mieć ith_1s_a=None"
        assert (
            incomplete_cable.jth_1s_a_per_mm2 is None
        ), "Typ niekompletny kabla powinien mieć jth_1s_a_per_mm2=None"

        # Typ niekompletny linii
        incomplete_line = catalog.get_line_type("line-incomplete-test")
        assert incomplete_line is not None, "Brak typu testowego niekompletnej linii"
        assert (
            not incomplete_line.dane_cieplne_kompletne
        ), "Typ niekompletny linii powinien mieć dane_cieplne_kompletne=False"

    def test_ith_calculation_from_jth(self) -> None:
        """Ith jest poprawnie obliczane z jth × przekrój."""
        catalog = get_default_mv_catalog()

        # Kabel XLPE Al 150 mm² - jth = 94 A/mm²
        cable = catalog.get_cable_type("cable-base-xlpe-al-1c-150")
        assert cable is not None
        assert cable.jth_1s_a_per_mm2 == JTH_AL_XLPE
        assert cable.cross_section_mm2 == 150
        expected_ith = JTH_AL_XLPE * 150  # 94 * 150 = 14100 A
        assert cable.get_ith_1s() == pytest.approx(expected_ith, rel=0.01)

        # Linia AFL 120 mm² - jth = 88 A/mm²
        line = catalog.get_line_type("line-base-al-st-120")
        assert line is not None
        assert line.jth_1s_a_per_mm2 == JTH_AL_ST_OHL
        assert line.cross_section_mm2 == 120
        expected_ith_line = JTH_AL_ST_OHL * 120  # 88 * 120 = 10560 A
        assert line.get_ith_1s() == pytest.approx(expected_ith_line, rel=0.01)


class TestManufacturerTypeMapping:
    """Testy mapowania typów producentów na typy bazowe."""

    def test_manufacturer_types_have_base_type_id(self) -> None:
        """Typy producentów mają ustawione base_type_id."""
        catalog = get_default_mv_catalog()
        manufacturer_ids = set(get_manufacturer_cable_type_ids())

        for cable_id in manufacturer_ids:
            cable = catalog.get_cable_type(cable_id)
            assert cable is not None, f"Brak typu producenta: {cable_id}"
            assert cable.base_type_id is not None, f"Typ producenta {cable_id} nie ma base_type_id"
            # Sprawdź czy base_type_id wskazuje na istniejący typ bazowy
            base_type = catalog.get_cable_type(cable.base_type_id)
            assert (
                base_type is not None
            ), f"Typ bazowy {cable.base_type_id} dla {cable_id} nie istnieje"

    def test_nkt_cable_types_exist(self) -> None:
        """Typy kabli NKT są dostępne w katalogu."""
        catalog = get_default_mv_catalog()

        nkt_types = [c for c in catalog.list_cable_types() if c.manufacturer == "NKT"]
        assert len(nkt_types) >= 2, "Brak wystarczającej liczby typów NKT"

        for nkt in nkt_types:
            assert nkt.trade_name is not None, f"Typ NKT {nkt.id} bez trade_name"
            assert nkt.dane_cieplne_kompletne, f"Typ NKT {nkt.id} ma niekompletne dane cieplne"

    def test_telefonika_cable_types_exist(self) -> None:
        """Typy kabli Tele-Fonika są dostępne w katalogu."""
        catalog = get_default_mv_catalog()

        tfk_types = [c for c in catalog.list_cable_types() if c.manufacturer == "Tele-Fonika Kable"]
        assert len(tfk_types) >= 2, "Brak wystarczającej liczby typów Tele-Fonika"

        for tfk in tfk_types:
            assert tfk.trade_name is not None, f"Typ TFK {tfk.id} bez trade_name"

    def test_enea_operator_standard_cables_are_first_and_marked_partial(self) -> None:
        """Priorytetowa lista kabli dla projektanta zaczyna sie od standardow ENEA."""
        records = get_all_cable_types()

        assert [record["id"] for record in records[:4]] == [
            "cable-enea-operator-xruhakxs-1x120",
            "cable-enea-operator-xruhakxs-1x240",
            "cable-enea-operator-na2xs2y-1x150",
            "cable-enea-operator-na2xs2y-1x240",
        ]
        assert all(record["params"]["manufacturer"] == "ENEA Operator" for record in records[:4])
        assert all(
            record["params"]["verification_status"] == "CZESCIOWO_ZWERYFIKOWANY"
            for record in records[:4]
        )
        assert all("ENEA Operator" in record["params"]["source_reference"] for record in records[:4])

        catalog = get_default_mv_catalog()
        assert [str(item.id) for item in catalog.list_cable_types()[:4]] == [
            "cable-enea-operator-na2xs2y-1x150",
            "cable-enea-operator-na2xs2y-1x240",
            "cable-enea-operator-xruhakxs-1x120",
            "cable-enea-operator-xruhakxs-1x240",
        ]


class TestCatalogDeterminism:
    """Testy deterministyczności katalogu."""

    def test_cable_list_order_is_deterministic(self) -> None:
        """Lista kabli jest deterministyczna."""
        catalog1 = get_default_mv_catalog()
        catalog2 = get_default_mv_catalog()

        cables1 = [c.id for c in catalog1.list_cable_types()]
        cables2 = [c.id for c in catalog2.list_cable_types()]

        assert cables1 == cables2, "Kolejność kabli nie jest deterministyczna"

    def test_line_list_order_is_deterministic(self) -> None:
        """Lista linii jest deterministyczna."""
        catalog1 = get_default_mv_catalog()
        catalog2 = get_default_mv_catalog()

        lines1 = [line.id for line in catalog1.list_line_types()]
        lines2 = [line.id for line in catalog2.list_line_types()]

        assert lines1 == lines2, "Kolejność linii nie jest deterministyczna"

    def test_catalog_data_functions_are_deterministic(self) -> None:
        """Funkcje danych katalogu są deterministyczne."""
        cables1 = get_all_cable_types()
        cables2 = get_all_cable_types()

        assert [c["id"] for c in cables1] == [c["id"] for c in cables2]

        lines1 = get_all_line_types()
        lines2 = get_all_line_types()

        assert [line["id"] for line in lines1] == [line["id"] for line in lines2]


class TestCatalogStatistics:
    """Testy statystyk katalogu."""

    def test_catalog_has_expected_counts(self) -> None:
        """Katalog ma oczekiwane liczby typów."""
        stats = get_catalog_statistics()

        # Typy bazowe kabli: 7 przekrojów × (Cu + Al) × (1C + 3C) × XLPE = 28
        # + EPR typy (mniejszy zakres) = dodatkowe
        assert (
            stats["liczba_kabli_bazowych"] >= 28
        ), f"Za mało typów bazowych kabli: {stats['liczba_kabli_bazowych']}"

        # Typy bazowe linii: 7 przekrojów × 2 materiały = 14
        assert (
            stats["liczba_linii_bazowych"] >= 14
        ), f"Za mało typów bazowych linii: {stats['liczba_linii_bazowych']}"

        # Typy producentów
        assert (
            stats["liczba_kabli_producentow"] >= 3
        ), f"Za mało typów producentów: {stats['liczba_kabli_producentow']}"

        # Typy niekompletne (do testów)
        assert stats["liczba_kabli_niekompletnych"] >= 1
        assert stats["liczba_linii_niekompletnych"] >= 1

    def test_catalog_has_expected_cross_sections(self) -> None:
        """Katalog zawiera oczekiwane przekroje."""
        stats = get_catalog_statistics()

        cable_sections = stats["przekroje_kabli_mm2"]
        assert 70 in cable_sections
        assert 150 in cable_sections
        assert 240 in cable_sections
        assert 400 in cable_sections

        line_sections = stats["przekroje_linii_mm2"]
        assert 25 in line_sections
        assert 70 in line_sections
        assert 120 in line_sections
        assert 150 in line_sections


class TestThermalParamsResolver:
    """Testy rozwiązywania danych cieplnych przez resolver."""

    def test_resolve_thermal_params_for_cable(self) -> None:
        """Resolver poprawnie rozwiązuje dane cieplne dla kabla."""
        catalog = get_default_mv_catalog()

        result = resolve_thermal_params(
            type_ref="cable-base-xlpe-al-1c-150",
            is_cable=True,
            catalog=catalog,
        )

        assert result is not None
        assert result.dane_cieplne_kompletne is True
        assert result.jth_1s_a_per_mm2 == JTH_AL_XLPE
        assert result.cross_section_mm2 == 150
        assert result.conductor_material == "AL"
        assert result.source == ParameterSource.TYPE_REF
        assert result.type_id == "cable-base-xlpe-al-1c-150"
        assert result.is_manufacturer_type is False

    def test_resolve_thermal_params_for_manufacturer_type(self) -> None:
        """Resolver rozpoznaje typ producenta."""
        catalog = get_default_mv_catalog()

        result = resolve_thermal_params(
            type_ref="cable-nkt-n2xs2y-1x150",
            is_cable=True,
            catalog=catalog,
        )

        assert result is not None
        assert result.is_manufacturer_type is True
        assert result.base_type_id == "cable-base-xlpe-al-1c-150"
        assert result.dane_cieplne_kompletne is True

    def test_resolve_thermal_params_for_line(self) -> None:
        """Resolver poprawnie rozwiązuje dane cieplne dla linii."""
        catalog = get_default_mv_catalog()

        result = resolve_thermal_params(
            type_ref="line-base-al-st-120",
            is_cable=False,
            catalog=catalog,
        )

        assert result is not None
        assert result.dane_cieplne_kompletne is True
        assert result.jth_1s_a_per_mm2 == JTH_AL_ST_OHL
        assert result.cross_section_mm2 == 120
        assert result.conductor_material == "AL_ST"

    def test_resolve_thermal_params_for_incomplete_type(self) -> None:
        """Resolver poprawnie zwraca niekompletne dane cieplne."""
        catalog = get_default_mv_catalog()

        result = resolve_thermal_params(
            type_ref="cable-incomplete-test",
            is_cable=True,
            catalog=catalog,
        )

        assert result is not None
        assert result.dane_cieplne_kompletne is False
        assert result.get_ith_1s() is None

    def test_resolve_thermal_params_nonexistent_type(self) -> None:
        """Resolver zwraca None dla nieistniejącego typu."""
        catalog = get_default_mv_catalog()

        result = resolve_thermal_params(
            type_ref="nonexistent-type",
            is_cable=True,
            catalog=catalog,
        )

        assert result is None

    def test_resolve_thermal_params_no_catalog(self) -> None:
        """Resolver zwraca None gdy brak katalogu."""
        result = resolve_thermal_params(
            type_ref="cable-base-xlpe-al-1c-150",
            is_cable=True,
            catalog=None,
        )

        assert result is None

    def test_thermal_params_trace_dict(self) -> None:
        """Trace dict zawiera wszystkie wymagane pola."""
        catalog = get_default_mv_catalog()

        result = resolve_thermal_params(
            type_ref="cable-nkt-n2xs2y-1x150",
            is_cable=True,
            catalog=catalog,
        )

        assert result is not None
        trace = result.to_trace_dict()

        assert "ith_1s_a" in trace
        assert "jth_1s_a_per_mm2" in trace
        assert "cross_section_mm2" in trace
        assert "conductor_material" in trace
        assert "dane_cieplne_kompletne" in trace
        assert "computed_ith_1s_a" in trace
        assert "source" in trace
        assert "type_id" in trace
        assert "type_name" in trace
        assert "is_manufacturer_type" in trace
        assert "base_type_id" in trace


class TestCableTypeProperties:
    """Testy właściwości typu CableType."""

    def test_cable_type_b_us_per_km_calculation(self) -> None:
        """Susceptance jest poprawnie obliczane z pojemności."""
        catalog = get_default_mv_catalog()
        cable = catalog.get_cable_type("cable-base-xlpe-al-1c-150")

        assert cable is not None
        # B = 2 * π * 50 * C * 1e-3, gdzie C w nF/km
        expected_b = 2 * 3.14159 * 50 * cable.c_nf_per_km * 1e-3
        assert cable.b_us_per_km == pytest.approx(expected_b, rel=0.01)

    def test_cable_type_to_dict(self) -> None:
        """CableType.to_dict() zawiera wszystkie pola."""
        catalog = get_default_mv_catalog()
        cable = catalog.get_cable_type("cable-nkt-n2xs2y-1x150")

        assert cable is not None
        d = cable.to_dict()

        assert d["id"] == "cable-nkt-n2xs2y-1x150"
        assert d["manufacturer"] == "NKT"
        assert d["conductor_material"] == "AL"
        assert d["insulation_type"] == "XLPE"
        assert d["cross_section_mm2"] == 150
        assert d["number_of_cores"] == 1
        assert d["jth_1s_a_per_mm2"] == JTH_AL_XLPE
        assert d["dane_cieplne_kompletne"] is True
        assert d["base_type_id"] == "cable-base-xlpe-al-1c-150"
        assert d["trade_name"] == "N2XS2Y 1x150/25"
        assert d["return_conductor_cross_section_mm2"] == 25
        assert d["return_conductor_material"] == "CU"
        assert d["return_conductor_r_ohm_per_km_20c"] == pytest.approx(17.241 / 25)
        assert d["return_conductor_jth_1s_a_per_mm2"] == pytest.approx(JTH_CU_XLPE)
        assert d["return_conductor_ith_1s_a"] == pytest.approx(JTH_CU_XLPE * 25)

    def test_catalog_designation_selects_return_conductor_section(self) -> None:
        """Przekroj zyly powrotnej pochodzi z oznaczenia typu katalogowego."""
        catalog = get_default_mv_catalog()

        cable_150_25 = catalog.get_cable_type("cable-enea-operator-na2xs2y-1x150")
        cable_120_16 = catalog.get_cable_type("cable-tfk-yakxs-3x120")

        assert cable_150_25 is not None
        assert cable_120_16 is not None
        assert cable_150_25.return_conductor_cross_section_mm2 == 25
        assert cable_120_16.return_conductor_cross_section_mm2 == 16
        assert cable_150_25.get_return_conductor_ith_1s() == pytest.approx(JTH_CU_XLPE * 25)
        assert cable_120_16.get_return_conductor_ith_1s() == pytest.approx(JTH_CU_XLPE * 16)

    def test_catalog_designation_feeds_zero_sequence_model(self) -> None:
        """R0 kabla katalogowego uwzględnia przekrój żyły powrotnej z oznaczenia."""
        catalog = get_default_mv_catalog()
        cable = catalog.get_cable_type("cable-enea-operator-na2xs2y-1x150")

        assert cable is not None
        assert cable.return_conductor_r_ohm_per_km_20c == pytest.approx(17.241 / 25)
        assert cable.r0_ohm_per_km == pytest.approx(
            cable.r_ohm_per_km + cable.return_conductor_r_ohm_per_km_20c,
            rel=1e-6,
        )
        assert cable.x0_ohm_per_km == pytest.approx(3.0 * cable.x_ohm_per_km, rel=1e-6)

    def test_line_type_to_dict(self) -> None:
        """LineType.to_dict() zawiera wszystkie pola."""
        catalog = get_default_mv_catalog()
        line = catalog.get_line_type("line-base-al-st-120")

        assert line is not None
        d = line.to_dict()

        assert d["id"] == "line-base-al-st-120"
        assert d["conductor_material"] == "AL_ST"
        assert d["cross_section_mm2"] == 120
        assert d["jth_1s_a_per_mm2"] == JTH_AL_ST_OHL
        assert d["dane_cieplne_kompletne"] is True
        assert d["r0_ohm_per_km"] == pytest.approx(3.0 * line.r_ohm_per_km)
        assert d["x0_ohm_per_km"] == pytest.approx(3.0 * line.x_ohm_per_km)


class TestCatalogCoverage:
    """Testy pokrycia typów w katalogu."""

    def test_xlpe_cu_1c_coverage(self) -> None:
        """Pełne pokrycie XLPE Cu 1-żyłowych."""
        catalog = get_default_mv_catalog()
        expected_sections = [70, 120, 150, 185, 240, 300, 400]

        for section in expected_sections:
            cable_id = f"cable-base-xlpe-cu-1c-{section}"
            cable = catalog.get_cable_type(cable_id)
            assert cable is not None, f"Brak kabla XLPE Cu 1C {section}mm²"
            assert cable.cross_section_mm2 == section

    def test_xlpe_al_1c_coverage(self) -> None:
        """Pełne pokrycie XLPE Al 1-żyłowych."""
        catalog = get_default_mv_catalog()
        expected_sections = [70, 120, 150, 185, 240, 300, 400]

        for section in expected_sections:
            cable_id = f"cable-base-xlpe-al-1c-{section}"
            cable = catalog.get_cable_type(cable_id)
            assert cable is not None, f"Brak kabla XLPE Al 1C {section}mm²"
            assert cable.cross_section_mm2 == section

    def test_al_line_coverage(self) -> None:
        """Pełne pokrycie linii Al."""
        catalog = get_default_mv_catalog()
        expected_sections = [25, 35, 50, 70, 95, 120, 150]

        for section in expected_sections:
            line_id = f"line-base-al-{section}"
            line = catalog.get_line_type(line_id)
            assert line is not None, f"Brak linii Al {section}mm²"
            assert line.cross_section_mm2 == section

    def test_al_st_line_coverage(self) -> None:
        """Pełne pokrycie linii Al/St (AFL)."""
        catalog = get_default_mv_catalog()
        expected_sections = [25, 35, 50, 70, 95, 120, 150]

        for section in expected_sections:
            line_id = f"line-base-al-st-{section}"
            line = catalog.get_line_type(line_id)
            assert line is not None, f"Brak linii AFL {section}mm²"
            assert line.cross_section_mm2 == section
