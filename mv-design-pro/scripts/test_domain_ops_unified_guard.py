#!/usr/bin/env python3
"""Testy `domain_ops_unified_guard.py`: wzorzec adresu i zapadka `EXCLUDED_RELATIVE_FILES`.

Korekta 2026-10-28: wzorzec łapie adres endpointa w KAŻDEJ postaci zapisu (literal,
szablon z interpolacją, sklejanie). Dawny wzorzec widział tylko pojedynczy literal, przez co
drugi klient HTTP z adresem z interpolacji (`stacjaPodglad.ts`) był niewidoczny, a kanoniczny
klient (`domainApi.ts`) nie dawał trafienia i zapadka wykluczenia musiała być minimalna.
Teraz zapadka jest pełna: kanoniczny klient MUSI dawać trafienie.

Iloczyn cech: postać zapisu adresu {literal, szablon, sklejanie, wariant v1} × miejsce
{kod, linia komentarza, linia z markerem ignore} × plik {zwykły, wykluczony po roli}.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import domain_ops_unified_guard as guard  # noqa: E402


def test_freshness_is_green_on_repo() -> None:
    assert guard.check_excluded_relative_files_freshness(guard.REPO_ROOT) == []


def test_excluded_relative_files_entry_exists() -> None:
    for rel_path in guard.EXCLUDED_RELATIVE_FILES:
        assert (guard.REPO_ROOT / rel_path).is_file(), f"brak pliku {rel_path!r}"


def test_canonical_client_matches_endpoint_pattern() -> None:
    """Kanoniczny klient buduje adres endpointa — trafienie jest WARUNKIEM wykluczenia."""
    domain_api = guard.REPO_ROOT / "frontend" / "src" / "ui" / "topology" / "domainApi.ts"
    assert domain_api.is_file()
    assert guard.scan_file(domain_api) != []


ZAPISY_ADRESU = (
    "fetch('/api/cases/x/enm/domain-ops');",
    "fetch(`${API_BASE}/${encodeURIComponent(caseId)}/enm/domain-ops`, {",
    "fetch('/api/cases/' + id + '/enm/domain-ops')",
    "fetch('/api/v1/domain-operations')",
    "fetch(`/api/v1/domain-ops`)",
)


def _plik(tmp_path, tresc: str):
    sciezka = tmp_path / "frontend" / "src" / "modul.ts"
    sciezka.parent.mkdir(parents=True, exist_ok=True)
    sciezka.write_text(tresc, encoding="utf-8")
    return sciezka


@pytest.mark.parametrize("linia", ZAPISY_ADRESU)
def test_kazda_postac_zapisu_adresu_w_kodzie_jest_naruszeniem(tmp_path, linia: str) -> None:
    naruszenia = guard.scan_file(_plik(tmp_path, f"const a = 1;\n{linia}\n"), tmp_path)
    assert [n.line_number for n in naruszenia] == [2]


@pytest.mark.parametrize("linia", ZAPISY_ADRESU)
@pytest.mark.parametrize("prefiks", ("// ", " * ", "/* "))
def test_linia_komentarza_nie_jest_kodem(tmp_path, linia: str, prefiks: str) -> None:
    assert guard.scan_file(_plik(tmp_path, f"{prefiks}{linia}\n"), tmp_path) == []


@pytest.mark.parametrize("linia", ZAPISY_ADRESU)
def test_marker_ignore_zwalnia_linie(tmp_path, linia: str) -> None:
    assert guard.scan_file(_plik(tmp_path, f"{linia} // domain-ops-ignore\n"), tmp_path) == []


def test_adres_z_kanonicznego_klienta_nie_jest_naruszeniem(tmp_path) -> None:
    tresc = "expect(url).toBe(domainOpsEndpoint('case-1'));\n"
    assert guard.scan_file(_plik(tmp_path, tresc), tmp_path) == []


def test_wykluczony_plik_bez_adresu_jest_osierocony(tmp_path, monkeypatch) -> None:
    rel = "frontend/src/ui/topology/domainApi.ts"
    sciezka = tmp_path / rel
    sciezka.parent.mkdir(parents=True)
    sciezka.write_text("export const x = 1;\n", encoding="utf-8")
    monkeypatch.setattr(guard, "EXCLUDED_RELATIVE_FILES", {rel})
    naruszenia = guard.check_excluded_relative_files_freshness(tmp_path)
    assert len(naruszenia) == 1
    assert "nie buduje juz adresu" in naruszenia[0]


def test_freshness_catches_missing_file(monkeypatch) -> None:
    monkeypatch.setattr(
        guard, "EXCLUDED_RELATIVE_FILES", {"frontend/src/ui/nigdy/nieistniejacy.ts"}
    )

    violations = guard.check_excluded_relative_files_freshness(guard.REPO_ROOT)

    assert len(violations) == 1
    assert "[domain-ops-wykluczenie-osierocone]" in violations[0]
    assert "nieistniejacy.ts" in violations[0]


def test_main_returns_1_when_entry_is_orphaned(monkeypatch) -> None:
    monkeypatch.setattr(
        guard, "EXCLUDED_RELATIVE_FILES", {"frontend/src/ui/nigdy/nieistniejacy.ts"}
    )

    assert guard.main() == 1


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
