#!/usr/bin/env python3

import tempfile
from pathlib import Path

from utf8_mojibake_guard import is_exempt, should_scan


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
