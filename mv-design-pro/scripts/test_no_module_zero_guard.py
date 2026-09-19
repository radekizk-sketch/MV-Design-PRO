"""Testy własne no_module_zero_guard.py (karta S-4, W6-0).

Iloczyn cech (KLASA NIE INSTANCJA, CLAUDE.md): drzewo (backend/frontend) x
miejsce (allowlisted / poza allowlistą / test) x forma (literał string /
podciąg nazwy pola / komentarz) — nie tylko przykład z karty.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from no_module_zero_guard import (  # noqa: E402
    _ALLOWLIST_BACKEND,
    _ALLOWLIST_FRONTEND,
    _is_allowlisted,
    _is_frontend_test,
    main,
    scan,
)

# ---------------------------------------------------------------------------
# scan() na prawdziwym repo — musi być czysty po karcie S-4.
# ---------------------------------------------------------------------------


def test_scan_prawdziwego_repo_jest_czysty() -> None:
    violations, stale = scan()
    assert violations == [], violations
    assert stale == [], stale


def test_main_zwraca_zero_na_prawdziwym_repo() -> None:
    assert main() == 0


# ---------------------------------------------------------------------------
# _is_allowlisted — dopasowanie dokładne i po prefiksie katalogu.
# ---------------------------------------------------------------------------


def test_is_allowlisted_dopasowanie_dokladne_pliku() -> None:
    assert _is_allowlisted("application/analyses/frt_trajektorie.py", _ALLOWLIST_BACKEND)


def test_drugi_silnik_ncrfg_nie_jest_na_liscie_po_s3() -> None:
    """Karta S-3 (2026-09-16): odroczenie karty S-4 (checker.py + trasa `/compliance`
    + lustro FE) ZAMKNIĘTE kasacją silnika — żadne z trzech miejsc nie wraca na
    listę; frontend nie ma ANI JEDNEGO dozwolonego miejsca."""
    assert not _is_allowlisted("application/ncrfg_compliance/checker.py", _ALLOWLIST_BACKEND)
    assert not _is_allowlisted("api/ncrfg_ptpiree_tests.py", _ALLOWLIST_BACKEND)
    assert _ALLOWLIST_FRONTEND == ()


def test_is_allowlisted_dopasowanie_po_prefiksie_katalogu() -> None:
    assert _is_allowlisted("network_model/solvers/stability_rms/contracts.py", _ALLOWLIST_BACKEND)
    assert _is_allowlisted("network_model/solvers/frt_hvrt/engine.py", _ALLOWLIST_BACKEND)


def test_is_allowlisted_odrzuca_plik_spoza_listy() -> None:
    assert not _is_allowlisted("domain/der_readiness.py", _ALLOWLIST_BACKEND)
    assert not _is_allowlisted(
        "network_model/solvers/short_circuit_iec60909.py", _ALLOWLIST_BACKEND
    )


def test_is_allowlisted_frontend_pusta_lista_odrzuca_kazdy_plik() -> None:
    assert not _is_allowlisted("ui/ncrfg-tests/api.ts", _ALLOWLIST_FRONTEND)
    assert not _is_allowlisted("ui2/oze/api.ts", _ALLOWLIST_FRONTEND)


# ---------------------------------------------------------------------------
# _is_frontend_test — wykluczenie testów (poza testami, karta S-4 §1).
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "rel_path",
    [
        "ui2/oze/frt/__tests__/strings.test.ts",
        "ui/network-build/station-der/__tests__/readiness.test.ts",
        "ui2/oze/api.test.ts",
        "ui2/oze/api.test.tsx",
        "ui2/oze/api.spec.ts",
        "ui2/oze/api.spec.tsx",
    ],
)
def test_is_frontend_test_wykrywa_kazdy_wzorzec(rel_path: str) -> None:
    assert _is_frontend_test(rel_path)


def test_is_frontend_test_nie_lapie_zwyklego_pliku() -> None:
    assert not _is_frontend_test("ui2/oze/api.ts")
    assert not _is_frontend_test("ui2/oze/frt/EkranFrt.tsx")


# ---------------------------------------------------------------------------
# scan() na syntetycznym drzewie — wykrywa naruszenie i pomija dozwolone
# miejsca oraz testy (przez monkeypatch korzeni skanu).
# ---------------------------------------------------------------------------


def test_scan_wykrywa_naruszenie_w_nowym_pliku_backend(tmp_path, monkeypatch) -> None:
    import no_module_zero_guard as guard

    backend_src = tmp_path / "backend_src"
    (backend_src / "application").mkdir(parents=True)
    (backend_src / "application" / "zly_plik.py").write_text(
        'status = "no_module"\n', encoding="utf-8"
    )
    monkeypatch.setattr(guard, "BACKEND_SRC", backend_src)
    monkeypatch.setattr(guard, "FRONTEND_SRC", tmp_path / "brak_frontendu")
    violations, stale = guard.scan()
    assert any("zly_plik.py" in v for v in violations)
    # Wszystkie wpisy allowlisty sa "martwe" na tym syntetycznym drzewie
    # (nie zawieraja realnie no_module) - to oczekiwane, nie testowane tutaj.
    assert stale


def test_scan_pomija_plik_w_allowlisted_katalogu(tmp_path, monkeypatch) -> None:
    import no_module_zero_guard as guard

    backend_src = tmp_path / "backend_src"
    solver_dir = backend_src / "network_model" / "solvers" / "frt_hvrt"
    solver_dir.mkdir(parents=True)
    (solver_dir / "contracts.py").write_text('STATUS = "no_module"\n', encoding="utf-8")
    monkeypatch.setattr(guard, "BACKEND_SRC", backend_src)
    monkeypatch.setattr(guard, "FRONTEND_SRC", tmp_path / "brak_frontendu")
    violations, _stale = guard.scan()
    assert violations == []


def test_scan_pomija_plik_testowy_na_frontendzie(tmp_path, monkeypatch) -> None:
    import no_module_zero_guard as guard

    frontend_src = tmp_path / "frontend_src"
    tests_dir = frontend_src / "ui2" / "oze" / "__tests__"
    tests_dir.mkdir(parents=True)
    (tests_dir / "api.test.ts").write_text("const s = 'no_module';\n", encoding="utf-8")
    monkeypatch.setattr(guard, "BACKEND_SRC", tmp_path / "brak_backendu")
    monkeypatch.setattr(guard, "FRONTEND_SRC", frontend_src)
    violations, _stale = guard.scan()
    assert violations == []
