"""F11.3 (dyrektywa D2, finał F9.6b): tryb pracy źródła z REALNEGO kanału
`Generator.meta['operating_mode']` (operacja `set_source_operating_mode`),
NIE ze stałej. Przed naprawą `_build_source_endpoint` wpisywał "gotowosc"
dla KAŻDEGO generatora, ignorując zapisaną daną (fabrykacja jednolitego
stanu — znalezisko F10.6, luka 7)."""

from src.application.field_read_model import _generator_operating_mode
from src.enm.models import Generator


def _make_generator(meta: dict | None) -> Generator:
    return Generator(
        ref_id="gen/test/1",
        name="PV testowe",
        gen_type="pv_inverter",
        bus_ref="bus/test/1",
        station_ref="stn/test/1",
        p_mw=0.1,
        meta=meta or {},
    )


def test_operating_mode_read_from_meta() -> None:
    # Realny kanał: operacja domenowa zapisała tryb — read-model MUSI go czytać.
    for mode in ("praca_sieciowa", "ladowanie", "rozladowanie", "gotowosc", "odstawione"):
        gen = _make_generator({"operating_mode": mode})
        assert _generator_operating_mode(gen) == mode


def test_operating_mode_absent_falls_back_to_model_default() -> None:
    # Brak danych → default MODELU (semantyka BaySourceEndpoint), nie zgadywanie.
    assert _generator_operating_mode(_make_generator(None)) == "gotowosc"
    assert _generator_operating_mode(_make_generator({})) == "gotowosc"


def test_operating_mode_invalid_value_rejected() -> None:
    # Wartość spoza słownika (korupcja/literówka) NIE przecieka do read-modelu.
    assert _generator_operating_mode(_make_generator({"operating_mode": "AWARIA?!"})) == "gotowosc"
    assert _generator_operating_mode(_make_generator({"operating_mode": 42})) == "gotowosc"
