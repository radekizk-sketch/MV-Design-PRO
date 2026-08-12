"""Testy zapadki `verification_phantom_paths_guard` (karta SUITA-BEZ-WYWOLANIA, 2026-08-12).

Ostrosc dowiedziona w OBIE STRONY dla kazdego z trzech zakresow (A/B/C):
drzewo bez widma -> RC=0 (`[]` z funkcji sprawdzajacej), drzewo Z widmem ->
RC=1 z nazwanym plikiem-winowajca. Dodatkowo: regresja na REALNYM tekscie
skasowanych `verify_v12_5.py`/`verify_v12_6.py` (karta ktora ten guard
wprowadzila) — dowod, ze gdyby te dwa pliki wrocily bez naprawy, guard by je
zlapal, a nie tylko "wygladal, jakby lapal".
"""

from __future__ import annotations

import json

import verification_phantom_paths_guard as guard

# ---------------------------------------------------------------------------
# Zakres A: package.json scripts.*
# ---------------------------------------------------------------------------


def test_a_czysty_skrypt_npm_nie_daje_naruszenia(tmp_path) -> None:
    frontend = tmp_path / "frontend"
    (frontend / "src" / "ui" / "__tests__").mkdir(parents=True)
    test_file = frontend / "src" / "ui" / "__tests__" / "przyklad.test.ts"
    test_file.write_text("export {};\n", encoding="utf-8")

    package_json = tmp_path / "package.json"
    package_json.write_text(
        json.dumps({"scripts": {"test:x": "vitest run src/ui/__tests__/przyklad.test.ts"}}),
        encoding="utf-8",
    )

    assert guard.check_npm_scripts(package_json, frontend) == []


def test_a_widmowy_skrypt_npm_daje_naruszenie_z_nazwa_pliku(tmp_path) -> None:
    frontend = tmp_path / "frontend"
    frontend.mkdir()

    package_json = tmp_path / "package.json"
    package_json.write_text(
        json.dumps(
            {
                "scripts": {
                    "test:golden": (
                        "vitest run --no-file-parallelism "
                        "src/ui/sld/core/__tests__/goldenNetworkE2E.test.ts"
                    )
                }
            }
        ),
        encoding="utf-8",
    )

    naruszenia = guard.check_npm_scripts(package_json, frontend)

    assert len(naruszenia) == 1
    assert "test:golden" in naruszenia[0]
    assert "src/ui/sld/core/__tests__/goldenNetworkE2E.test.ts" in naruszenia[0]


def test_a_brak_package_json_jest_bledem_nie_cichym_pominieciem(tmp_path) -> None:
    naruszenia = guard.check_npm_scripts(tmp_path / "nie_ma.json", tmp_path)
    assert len(naruszenia) == 1
    assert "brak pliku package.json" in naruszenia[0]


# ---------------------------------------------------------------------------
# Zakres B: scripts/*.py — literal "scripts/....py"
# ---------------------------------------------------------------------------


def test_b_realny_guard_istnieje_wiec_referencja_jest_czysta(tmp_path) -> None:
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    (scripts_dir / "realny_guard.py").write_text("print('OK')\n", encoding="utf-8")
    (scripts_dir / "agregator.py").write_text(
        'STEP = [sys.executable, "scripts/realny_guard.py"]\n', encoding="utf-8"
    )

    assert guard.check_verification_scripts(scripts_dir, tmp_path) == []


def test_b_widmowy_krok_guarda_daje_naruszenie(tmp_path) -> None:
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    (scripts_dir / "agregator.py").write_text(
        'STEP = [sys.executable, "scripts/cable_leaves_from_head_guard.py"]\n',
        encoding="utf-8",
    )

    naruszenia = guard.check_verification_scripts(scripts_dir, tmp_path)

    assert len(naruszenia) == 1
    assert "agregator.py" in naruszenia[0]
    assert "scripts/cable_leaves_from_head_guard.py" in naruszenia[0]


def test_b_src_bez_markera_poetry_ani_npm_nie_jest_sprawdzane(tmp_path) -> None:
    """Granica zakresu nazwana wprost testem (regula KLASA §4 — bez tego test
    by nie odroznil "nie sprawdzam" od "sprawdzilem i jest OK")."""
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    (scripts_dir / "delta_guard.py").write_text(
        'BACKEND_SRC = ROOT / "backend/src"\nTARGET = BACKEND_SRC / "api/enm.py"\n'
        'X = "src/nie_ma_takiego_pliku.py"\n',
        encoding="utf-8",
    )

    assert guard.check_verification_scripts(scripts_dir, tmp_path) == []


def test_b_src_z_markerem_poetry_widmowy_daje_naruszenie(tmp_path) -> None:
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    (scripts_dir / "agregator_backend.py").write_text(
        'CMD = ["poetry", "run", "pytest", "tests/test_widmowy.py"]\n',
        encoding="utf-8",
    )

    naruszenia = guard.check_verification_scripts(scripts_dir, tmp_path)

    assert len(naruszenia) == 1
    assert "tests/test_widmowy.py" in naruszenia[0]
    assert "backend/" in naruszenia[0]


def test_b_src_z_markerem_npm_widmowy_daje_naruszenie(tmp_path) -> None:
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    (scripts_dir / "agregator_front.py").write_text(
        'CMD = ["npm", "run", "test", "--", "--run", "src/ui/widmowy.test.ts"]\n',
        encoding="utf-8",
    )

    naruszenia = guard.check_verification_scripts(scripts_dir, tmp_path)

    assert len(naruszenia) == 1
    assert "src/ui/widmowy.test.ts" in naruszenia[0]
    assert "frontend/" in naruszenia[0]


def test_b_pliki_test_i_wlasny_plik_guarda_sa_pominiete(tmp_path) -> None:
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    (scripts_dir / "test_cokolwiek.py").write_text(
        'FIXTURE = "scripts/widmowy_w_tescie.py"\n', encoding="utf-8"
    )
    (scripts_dir / guard._SELF_NAME).write_text(
        'PRZYKLAD = "scripts/widmowy_w_sobie.py"\n', encoding="utf-8"
    )

    assert guard.check_verification_scripts(scripts_dir, tmp_path) == []


# ---------------------------------------------------------------------------
# Zakres C: *_contract_text_guard.py — dowolny prefiks repo-relatywny
# ---------------------------------------------------------------------------


def test_c_kontrakt_text_guard_widmowy_plik_daje_naruszenie(tmp_path) -> None:
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    (scripts_dir / "przyklad_contract_text_guard.py").write_text(
        'FILES = (ROOT / "frontend/src/ui/workspace/surfaces/Widmo.tsx",)\n',
        encoding="utf-8",
    )

    naruszenia = guard.check_verification_scripts(scripts_dir, tmp_path)

    assert len(naruszenia) == 1
    assert "frontend/src/ui/workspace/surfaces/Widmo.tsx" in naruszenia[0]


def test_c_kontrakt_text_guard_istniejacy_plik_jest_czysty(tmp_path) -> None:
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    (tmp_path / "backend" / "src").mkdir(parents=True)
    (tmp_path / "backend" / "src" / "realny.py").write_text("x = 1\n", encoding="utf-8")
    (scripts_dir / "przyklad_contract_text_guard.py").write_text(
        'FILES = (ROOT / "backend/src/realny.py",)\n', encoding="utf-8"
    )

    assert guard.check_verification_scripts(scripts_dir, tmp_path) == []


# ---------------------------------------------------------------------------
# Regresja na drzewie realnym + na historycznej tresci karty
# ---------------------------------------------------------------------------


def test_realne_drzewo_repo_jest_dzis_zielone() -> None:
    assert guard.run() == 0


def test_regresja_historyczna_verify_v12_5_zostalby_zlapany(tmp_path) -> None:
    """Rekonstrukcja WYCINKA skasowanego verify_v12_5.py (karta SUITA-BEZ-WYWOLANIA).

    Gdyby ten ksztalt kodu wrocil bez naprawy, guard MUSI go zlapac — inaczej
    zapadka jest dekoracja, nie ochrona.
    """
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    (scripts_dir / "verify_v12_5_odtworzony.py").write_text(
        "STEP_GOLDEN = [\n"
        '    "npm", "run", "test", "--", "--run",\n'
        '    "src/ui/sld/core/__tests__/goldenNetworkE2E.test.ts",\n'
        '    "src/ui/protection-results/__tests__/ProtectionResultsInspectorPage.test.tsx",\n'
        "]\n",
        encoding="utf-8",
    )

    naruszenia = guard.check_verification_scripts(scripts_dir, tmp_path)

    assert len(naruszenia) == 2


def test_regresja_historyczna_verify_v12_6_zostalby_zlapany(tmp_path) -> None:
    """Rekonstrukcja wycinka skasowanego verify_v12_6.py: 5 widmowych guardow SLD."""
    scripts_dir = tmp_path / "scripts"
    scripts_dir.mkdir()
    (scripts_dir / "verify_v12_6_odtworzony.py").write_text(
        "STEPS = [\n"
        '    "scripts/cable_leaves_from_head_guard.py",\n'
        '    "scripts/label_overlap_guard.py",\n'
        '    "scripts/lod_hysteresis_guard.py",\n'
        '    "scripts/layout_readability_guard.py",\n'
        '    "scripts/enm_adapter_consistency_guard.py",\n'
        "]\n",
        encoding="utf-8",
    )

    naruszenia = guard.check_verification_scripts(scripts_dir, tmp_path)

    assert len(naruszenia) == 5
