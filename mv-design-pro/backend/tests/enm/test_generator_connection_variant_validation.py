"""Tests for V12S-008: Generator.connection_variant cross-field validation.

Pydantic v2 model_validator(mode='after') wymusza tabele prawdy:

  LV_BEHIND_STATION_TRANSFORMER → station_ref WYMAGANY,
                                  blocking_transformer_ref WYMAGANY
  DEDICATED_MV_CONNECTION       → station_ref ZABRONIONY,
                                  blocking_transformer_ref opcjonalny
  nn_side                       → station_ref WYMAGANY,
                                  blocking_transformer_ref ZABRONIONY
  block_transformer             → blocking_transformer_ref WYMAGANY,
                                  station_ref opcjonalny
  SOURCE_CONNECTION_STATION     → permisywne (legacy)
  None                          → permisywne (przed migracja)
"""

import pytest
from enm.models import Generator
from pydantic import ValidationError


def _gen(**overrides) -> Generator:
    """Helper: minimalna konfiguracja Generatora z mozliwymi nadpisaniami."""
    base = {
        "ref_id": "gen_1",
        "name": "Generator",
        "bus_ref": "bus_1",
        "p_mw": 1.0,
        "gen_type": "pv_inverter",
    }
    base.update(overrides)
    return Generator(**base)


class TestVariantNoneAndLegacy:
    def test_variant_none_is_permissive(self) -> None:
        """Brak connection_variant → bez walidacji (dane legacy)."""
        gen = _gen(connection_variant=None)
        assert gen.connection_variant is None

    def test_source_connection_station_is_permissive(self) -> None:
        """SOURCE_CONNECTION_STATION → permisywne (legacy bus-only)."""
        gen = _gen(connection_variant="SOURCE_CONNECTION_STATION")
        assert gen.connection_variant == "SOURCE_CONNECTION_STATION"


class TestLvBehindStationTransformer:
    def test_valid_with_both_refs(self) -> None:
        gen = _gen(
            connection_variant="LV_BEHIND_STATION_TRANSFORMER",
            station_ref="sub_1",
            blocking_transformer_ref="tr_1",
        )
        assert gen.station_ref == "sub_1"
        assert gen.blocking_transformer_ref == "tr_1"

    def test_missing_station_ref_raises(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            _gen(
                connection_variant="LV_BEHIND_STATION_TRANSFORMER",
                blocking_transformer_ref="tr_1",
            )
        assert "station_ref" in str(exc_info.value)

    def test_missing_blocking_transformer_ref_raises(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            _gen(
                connection_variant="LV_BEHIND_STATION_TRANSFORMER",
                station_ref="sub_1",
            )
        assert "blocking_transformer_ref" in str(exc_info.value)


class TestDedicatedMvConnection:
    def test_valid_without_station_ref(self) -> None:
        gen = _gen(
            connection_variant="DEDICATED_MV_CONNECTION",
            blocking_transformer_ref="tr_block",
        )
        assert gen.station_ref is None
        assert gen.blocking_transformer_ref == "tr_block"

    def test_valid_without_either_ref(self) -> None:
        gen = _gen(connection_variant="DEDICATED_MV_CONNECTION")
        assert gen.station_ref is None
        assert gen.blocking_transformer_ref is None

    def test_with_station_ref_raises(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            _gen(
                connection_variant="DEDICATED_MV_CONNECTION",
                station_ref="sub_1",
            )
        assert "DEDICATED_MV_CONNECTION" in str(exc_info.value)


class TestNnSide:
    def test_valid_with_station_ref_only(self) -> None:
        gen = _gen(
            connection_variant="nn_side",
            station_ref="sub_1",
        )
        assert gen.station_ref == "sub_1"
        assert gen.blocking_transformer_ref is None

    def test_missing_station_ref_raises(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            _gen(connection_variant="nn_side")
        assert "station_ref" in str(exc_info.value)

    def test_with_blocking_transformer_ref_raises(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            _gen(
                connection_variant="nn_side",
                station_ref="sub_1",
                blocking_transformer_ref="tr_1",
            )
        assert "blocking_transformer_ref" in str(exc_info.value)


class TestBlockTransformer:
    def test_valid_with_blocking_transformer_ref(self) -> None:
        gen = _gen(
            connection_variant="block_transformer",
            blocking_transformer_ref="tr_block",
        )
        assert gen.blocking_transformer_ref == "tr_block"

    def test_missing_blocking_transformer_ref_raises(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            _gen(connection_variant="block_transformer")
        assert "blocking_transformer_ref" in str(exc_info.value)

    def test_with_optional_station_ref_is_valid(self) -> None:
        gen = _gen(
            connection_variant="block_transformer",
            blocking_transformer_ref="tr_block",
            station_ref="sub_1",
        )
        assert gen.station_ref == "sub_1"
