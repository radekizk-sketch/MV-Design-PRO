#!/usr/bin/env python3

import tempfile
from pathlib import Path

from utf8_mojibake_guard import (
    _PARAMETR_ZAPYTANIA,
    ZNAK_ZASTEPCZY_W_SLOWIE,
    is_exempt,
    should_scan,
)


def _zapala_regule(linia: str) -> bool:
    """Czy linia zapala regułę znaku zastępczego (tak jak w skanie guardu)."""
    return bool(ZNAK_ZASTEPCZY_W_SLOWIE.search(_PARAMETR_ZAPYTANIA.sub(" ", linia)))


def test_should_scan_supported_source_files() -> None:
    assert should_scan(Path("sample.tsx"))
    assert should_scan(Path("sample.py"))
    assert should_scan(Path("sample.md"))


def test_should_skip_unsupported_files() -> None:
    assert not should_scan(Path("sample.svg"))
    assert not should_scan(Path("sample.bin"))


def test_is_exempt_for_tests_and_build_outputs() -> None:
    assert is_exempt(Path("frontend/src/ui/__tests__/view.test.tsx"))
    assert is_exempt(Path("frontend/dist/assets/index.js"))
    assert not is_exempt(Path("frontend/src/ui/sld/SLDView.tsx"))


def test_detects_typical_mojibake_fragment() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        file_path = Path(tmp) / "bad.tsx"
        mojibake_fragment = "\u00c4\u2026"
        file_path.write_text(
            f'const label = "Zażółć gęślą jaźń {mojibake_fragment}";\n',
            encoding="utf-8",
        )
        text = file_path.read_text(encoding="utf-8")
        assert "\u00c4\u2026" in text


# ---------------------------------------------------------------------------
# Klasa 2: polska litera zamieniona na ASCII '?' (V12K-283, karta KD-2)
# ---------------------------------------------------------------------------


def test_wykrywa_litere_zastapiona_znakiem_zapytania() -> None:
    """Realne przypadki z repo \u2014 komunikaty operacji domenowych i etykieta UI."""
    znak = "?"
    assert _zapala_regule(f'return _error_response("Dost{znak}pne rekordy: 3.")')
    assert _zapala_regule(f'"Brak napi{znak}cia znamionowego SN"')
    assert _zapala_regule(f"const pusty = 'Brak wynik{znak}w diagnostyki';")


def test_nie_zapala_sie_na_poprawnym_tekscie_polskim() -> None:
    assert not _zapala_regule('"Brak napi\u0119cia znamionowego SN: podaj voltage_kv"')
    assert not _zapala_regule("Za\u017c\u00f3\u0142\u0107 g\u0119\u015bl\u0105 ja\u017a\u0144 \u2014 pe\u0142ny zestaw znak\u00f3w")


def test_nie_zapala_sie_na_adresie_z_parametrem_zapytania() -> None:
    """Dokumentacja ko\u0144c\u00f3wek API nie jest uszkodzonym tekstem."""
    assert not _zapala_regule("- ``GET /api/quality/flicker?run_id=`` \u2014 ocena migotania")
    assert not _zapala_regule("- GET /api/station-templates?category=<cat> \u2014 filter by category")
    assert not _zapala_regule("GET /api/oze-analysis/pq-area?run_id=&bus_ref=")


def test_nie_zapala_sie_na_pytaniu_ani_skladni_typescript() -> None:
    """Zdanie pytaj\u0105ce i operatory TS to normalna tre\u015b\u0107, nie uszkodzenie."""
    assert not _zapala_regule("Czy rozp\u0142yw jest dost\u0119pny? Sprawd\u017a flag\u0119 wiersza.")
    assert not _zapala_regule("const wynik = warunek ? pierwszy : drugi;")
    assert not _zapala_regule("interface Pole { etykieta?: string }")
    assert not _zapala_regule("const nazwa = element?.meta?.nazwa ?? null;")
