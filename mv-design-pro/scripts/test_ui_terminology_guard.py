#!/usr/bin/env python3

import tempfile
from pathlib import Path

import pytest
from ui_terminology_guard import extract_ui_strings, find_banned_terms, scan_file


def write_temp(content: str) -> Path:
    handle = tempfile.NamedTemporaryFile(mode="w", suffix=".tsx", delete=False, encoding="utf-8")
    handle.write(content)
    handle.flush()
    handle.close()
    return Path(handle.name)


def test_extracts_ui_property_strings() -> None:
    fragments = extract_ui_strings(
        "const spec = { title: 'Proof panel', description: 'Feeder map' };"
    )
    assert "Proof panel" in fragments
    assert "Feeder map" in fragments


def test_extracts_jsx_text() -> None:
    fragments = extract_ui_strings("<button>Open Proof</button>")
    assert "Open Proof" in fragments


def test_finds_banned_terms_in_user_copy() -> None:
    assert "Proof" in find_banned_terms("Open Proof trace")
    assert "Stacja A" in find_banned_terms("Stacja A")


def test_ignores_internal_strings_outside_ui_context() -> None:
    path = write_temp("const mode = 'RESULT_VIEW';\nconst state = 'case';\n")
    try:
        assert scan_file(path) == []
    finally:
        path.unlink(missing_ok=True)


def test_detects_banned_term_in_ui_property_assignment() -> None:
    path = write_temp("const panel = { title: 'Proof trace', description: 'Feeder map' };\n")
    try:
        violations = scan_file(path)
    finally:
        path.unlink(missing_ok=True)

    assert {violation.token for violation in violations} == {"Proof", "Feeder"}


def test_respects_ignore_directive() -> None:
    path = write_temp("const panel = { title: 'Proof trace' }; // ui-terminology-ignore\n")
    try:
        violations = scan_file(path)
    finally:
        path.unlink(missing_ok=True)

    assert violations == []


def test_ui2_wzor_latex_nie_jest_identyfikatorem_kodowym_a_proza_obok_tak(tmp_path: Path) -> None:
    """Iloczyn cech: {symbol w `$...$` (`$t_b$`, `$\\cos\\varphi_n$`), identyfikator snake_case
    poza wzorem} × {ta sama linia}. Wzór LaTeX składa KaTeX — nie jest kodem; surowy
    identyfikator obok wzoru nadal jest naruszeniem."""
    katalog = tmp_path / "ui2" / "wyniki"
    katalog.mkdir(parents=True)
    plik = katalog / "parametry.ts"
    plik.write_text(
        "const a = { etykieta: 'Czas $t_b$ i $\\\\cos\\\\varphi_n$' };\n"
        "const b = { etykieta: 'Wzór $t_b$ z pola run_id' };\n",
        encoding="utf-8",
    )
    naruszenia = scan_file(plik)
    assert [(n.line_number, n.token) for n in naruszenia] == [(2, "identyfikator-kodowy")]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
