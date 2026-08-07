#!/usr/bin/env python3
"""
Unit tests for no_codenames_guard.py

Verifies that the guard correctly:
- Detects codenames (p7, P20, P11, etc.) in string literals
- Ignores codenames in comments
- Ignores P0 (technical parameter)
- Respects // no-codenames-ignore directive
"""

import tempfile
from pathlib import Path

import pytest

# Import functions from guard
from no_codenames_guard import (
    ALLOWED_TECHNICAL_TOKENS,
    CODENAME_PATTERN,
    find_codenames_in_strings,
    is_comment_line,
    scan_backend_file,
    scan_file,
)


class TestCodenamePattern:
    """Test the regex pattern for codenames."""

    def test_detects_p7(self):
        """Should detect p7."""
        assert CODENAME_PATTERN.search("p7")

    def test_detects_p20_codename(self):
        """Should detect P20."""
        assert CODENAME_PATTERN.search("P20")

    def test_detects_p11_codename(self):
        """Should detect P11."""
        assert CODENAME_PATTERN.search("P11")

    def test_ignores_p0(self):
        """Should NOT detect P0 (technical parameter for transformer losses)."""
        match = CODENAME_PATTERN.search("P0")
        assert match is None

    def test_ignores_p0_kw(self):
        """Should NOT detect p0 in p0_kw."""
        text = "p0_kw"
        match = CODENAME_PATTERN.search(text)
        # p0 is excluded, but make sure no false match
        assert match is None or match.group() != "p0"

    def test_allows_percentile_metrics(self):
        """Should treat percentile metrics as technical tokens, not codenames."""
        assert "p95" in ALLOWED_TECHNICAL_TOKENS


class TestFindCodenamesInStrings:
    """Test detection of codenames inside string literals."""

    def test_finds_codename_in_single_quotes(self):
        """Should find P11 in single-quoted string."""
        line = "const label = 'Task P11 done';"
        matches = find_codenames_in_strings(line)
        assert "P11" in matches

    def test_finds_codename_in_double_quotes(self):
        """Should find P20 in double-quoted string."""
        line = 'const msg = "This is P20 feature";'
        matches = find_codenames_in_strings(line)
        assert "P20" in matches

    def test_finds_codename_in_template_literal(self):
        """Should find p7 in template literal."""
        line = "const x = `Feature p7 enabled`;"
        matches = find_codenames_in_strings(line)
        assert "p7" in matches

    def test_ignores_codename_outside_string(self):
        """Should NOT find codename in variable name."""
        line = "const p7_enabled = true;"
        matches = find_codenames_in_strings(line)
        assert len(matches) == 0

    def test_multiple_codenames(self):
        """Should find multiple codenames in one line."""
        line = 'const x = "P11, P14, P17";'
        matches = find_codenames_in_strings(line)
        assert "P11" in matches
        assert "P14" in matches
        assert "P17" in matches

    def test_ignores_percentile_metric_token(self):
        """Should NOT flag percentile metrics like p95 inside strings."""
        line = "const stats = `mean=10ms median=9ms p95=14ms`;"
        matches = find_codenames_in_strings(line)
        assert matches == []


class TestIsCommentLine:
    """Test comment line detection."""

    def test_single_line_comment(self):
        """Should detect // comment."""
        assert is_comment_line("// This is a comment")
        assert is_comment_line("  // Indented comment")

    def test_block_comment_start(self):
        """Should detect /* comment start."""
        assert is_comment_line("/* Block comment")

    def test_jsdoc_continuation(self):
        """Should detect * JSDoc continuation."""
        assert is_comment_line(" * This is JSDoc")

    def test_not_comment(self):
        """Should NOT detect regular code."""
        assert not is_comment_line("const x = 1;")
        assert not is_comment_line("  const y = 2;")


class TestScanFile:
    """Test full file scanning."""

    def test_detects_violation_in_string(self):
        """Should detect codename in string literal."""
        content = """
const label = "Feature P11";
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".ts", delete=False) as f:
            f.write(content)
            f.flush()
            path = Path(f.name)

        violations = scan_file(path)
        path.unlink()

        assert len(violations) == 1
        assert violations[0].match == "P11"

    def test_ignores_comment_line(self):
        """Should NOT detect codename in comment."""
        content = """
// This is P11 feature documentation
const x = 1;
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".ts", delete=False) as f:
            f.write(content)
            f.flush()
            path = Path(f.name)

        violations = scan_file(path)
        path.unlink()

        assert len(violations) == 0

    def test_respects_ignore_directive(self):
        """Should respect // no-codenames-ignore directive."""
        content = """
const regex = /P11|P14/g; // no-codenames-ignore
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".ts", delete=False) as f:
            f.write(content)
            f.flush()
            path = Path(f.name)

        violations = scan_file(path)
        path.unlink()

        assert len(violations) == 0

    def test_ignores_p0_parameter(self):
        """Should NOT detect P0 (technical transformer parameter)."""
        content = """
const losses = "Straty jałowe P0";
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".ts", delete=False) as f:
            f.write(content)
            f.flush()
            path = Path(f.name)

        violations = scan_file(path)
        path.unlink()

        assert len(violations) == 0


class TestSkanBackendu:
    """Skan backendowych pól tekstu użytkownika (`*_pl`) — zamknięcie KLASY.

    Kontekst: do 2026-08-07 guard skanował wyłącznie `frontend/`, więc kodenamy
    w polskich komunikatach i tytułach dowodów produkowanych przez backend były
    NIEWIDZIALNE. Odbiór karty PACK-DOWODY zastał pięć takich tytułów czytanych
    przez projektanta (np. „Dowód: Load Flow i spadki napięć (P32)"). Te testy
    pilnują, żeby skan nie zniknął ani nie rozlał się na kod techniczny.
    """

    def _skan(self, tresc: str) -> list:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False, encoding="utf-8") as f:
            f.write(tresc)
            f.flush()
            sciezka = Path(f.name)
        try:
            return scan_backend_file(sciezka)
        finally:
            sciezka.unlink()

    def test_kodename_w_komunikacie_uzytkownika_jest_naruszeniem(self):
        naruszenia = self._skan('    message_pl="P12 MVP: brak podstawy."\n')
        assert len(naruszenia) == 1
        assert naruszenia[0].match == "P12"

    def test_kodename_w_tytule_dowodu_jest_naruszeniem(self):
        naruszenia = self._skan('    title_pl="Dowód: rozpływ mocy (P32)"\n')
        assert len(naruszenia) == 1

    def test_kodename_w_slowniku_z_kluczem_pl_jest_naruszeniem(self):
        naruszenia = self._skan('    dane = {"opis_pl": "wariant P15"}\n')
        assert len(naruszenia) == 1

    def test_nazwa_klasy_technicznej_nie_jest_naruszeniem(self):
        """Kod techniczny zostaje nietknięty — guard pilnuje treści, nie słownictwa."""
        assert self._skan("class P14PowerFlowProof:\n    pass\n") == []

    def test_string_bez_pola_uzytkownika_nie_jest_naruszeniem(self):
        assert self._skan('    solver_id = "P18"\n') == []

    def test_komentarz_nie_jest_naruszeniem(self):
        assert self._skan('    # historia: message_pl="P12 MVP"\n') == []


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
