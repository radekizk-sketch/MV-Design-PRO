"""Metatest `lv_domain_projection_guard.py` — slice E (kasacja martwego legacy
`StationInternalView`/panelu wynikow odplywu nN + guard architektury domeny nN).

Wzorzec `test_ui_no_physics_guard.py` (zaladowanie skryptu jak modulu,
`main()`/`check_*` wolane bezposrednio zamiast subprocess) + wzorzec
`test_guardy_z_ci.py` (pusty skan JEST bledem, nie cisza zielona zgoda).

KAZDA regula R1-R5 ma WLASNA iniekcje: kopia minimalnego drzewa w tmp_path z
JEDNYM naruszeniem tej reguly, guard wolany z podmienionym korzeniem skanu
(kazda funkcja `check_r*` przyjmuje sciezke jako parametr — nie ma globalnego
stanu do monkeypatchowania), oczekywana czerwien z etykieta reguly w komunikacie.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = PROJECT_ROOT / "scripts"


def _load_script(module_name: str):
    script_path = SCRIPTS_DIR / f"{module_name}.py"
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load script module: {script_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


guard = _load_script("lv_domain_projection_guard")


# ---------------------------------------------------------------------------
# Guard zielony na HEAD repozytorium (wszystkie reguly, domyslne sciezki)
# ---------------------------------------------------------------------------


def test_guard_main_returns_zero_on_repo() -> None:
    assert guard.main() == 0


def test_each_rule_is_clean_on_repo() -> None:
    for label, check_fn in guard.RULES:
        assert check_fn() == [], f"regula {label} nie jest czysta na HEAD"


# ---------------------------------------------------------------------------
# R1 — zero importow martwych modulow slice E w frontend/src/** (poza testami)
# ---------------------------------------------------------------------------


def test_r1_wykrywa_import_martwego_modulu(tmp_path: Path) -> None:
    plik = tmp_path / "Widget.tsx"
    plik.write_text(
        "import { StationInternalView } from './StationInternalView';\n",
        encoding="utf-8",
    )
    naruszenia = guard.check_r1(frontend_src=tmp_path)
    assert any("[R1]" in n and "StationInternalView" in n for n in naruszenia)


def test_r1_ignoruje_import_w_pliku_testowym(tmp_path: Path) -> None:
    # Plik PRODUKCYJNY bez naruszenia — bez niego katalog po odfiltrowaniu
    # testow bylby pusty i zapadka [pusty-skan] przykryłaby wlasciwa asercje.
    (tmp_path / "Inny.ts").write_text("export const x = 1;\n", encoding="utf-8")
    testy = tmp_path / "__tests__"
    testy.mkdir()
    (testy / "Widget.test.tsx").write_text(
        "import { StationInternalView } from '../StationInternalView';\n",
        encoding="utf-8",
    )
    assert guard.check_r1(frontend_src=tmp_path) == []


def test_r1_wykrywa_kazdy_zakazany_token() -> None:
    """Kazdy z omiu zakazanych tokenow (R1) MUSI byc lapany osobno — test
    jako iloczyn cech (KLASA, nie INSTANCJA), reguła CLAUDE.md 2026-08-01."""
    for token in guard.R1_BANNED_MODULE_TOKENS:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "X.ts").write_text(f"import x from './{token}';\n", encoding="utf-8")
            naruszenia = guard.check_r1(frontend_src=root)
            assert naruszenia, f"token {token!r} nie zostal wykryty przez R1"


def test_r1_pusty_skan_jest_bledem(tmp_path: Path) -> None:
    naruszenia = guard.check_r1(frontend_src=tmp_path)
    assert any("pusty-skan" in n for n in naruszenia)


def test_r1_brakujacy_katalog_jest_bledem(tmp_path: Path) -> None:
    naruszenia = guard.check_r1(frontend_src=tmp_path / "nie-ma-takiego")
    assert any("brak-katalogu" in n for n in naruszenia)


# ---------------------------------------------------------------------------
# R2 — LvDomainViewProps: dokladnie jeden prop danych `projection`
# ---------------------------------------------------------------------------


def _write_view(tmp_path: Path, interface_body: str) -> Path:
    plik = tmp_path / "LvDomainView.tsx"
    plik.write_text(
        "export interface LvDomainViewProps {\n" + interface_body + "\n}\n",
        encoding="utf-8",
    )
    return plik


def test_r2_ok_gdy_wylacznie_projection(tmp_path: Path) -> None:
    plik = _write_view(
        tmp_path,
        "  readonly projection: LvDomainProjectionV1;\n"
        "  readonly width?: number;\n"
        "  readonly height?: number;\n",
    )
    assert guard.check_r2(view_file=plik) == []


def test_r2_wykrywa_kazdy_zakazany_prop() -> None:
    """Test jako iloczyn cech: kazdy z pieciu zakazanych propow osobno."""
    for prop in guard.R2_BANNED_PROPS:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            plik = _write_view(
                root,
                "  readonly projection: LvDomainProjectionV1;\n" f"  readonly {prop}: unknown;\n",
            )
            naruszenia = guard.check_r2(view_file=plik)
            assert any(prop in n for n in naruszenia), f"prop {prop!r} nie zostal wykryty przez R2"


def test_r2_wykrywa_brak_propa_projection(tmp_path: Path) -> None:
    plik = _write_view(tmp_path, "  readonly width?: number;\n")
    naruszenia = guard.check_r2(view_file=plik)
    assert any("projection" in n for n in naruszenia)


def test_r2_brakujacy_plik_jest_bledem(tmp_path: Path) -> None:
    naruszenia = guard.check_r2(view_file=tmp_path / "nie-ma.tsx")
    assert any("brak-pliku" in n for n in naruszenia)


# ---------------------------------------------------------------------------
# R3 — zero fetch( poza projectionApi.ts; ten ma DOKLADNIE jeden fetch(
# ---------------------------------------------------------------------------


def test_r3_wykrywa_fetch_poza_projection_api(tmp_path: Path) -> None:
    (tmp_path / "projectionApi.ts").write_text(
        "export async function f() { return fetch('/x'); }\n", encoding="utf-8"
    )
    (tmp_path / "LvDomainView.tsx").write_text(
        "function g() { return fetch('/inny'); }\n", encoding="utf-8"
    )
    naruszenia = guard.check_r3(
        lv_domain_dir=tmp_path, projection_api_file=tmp_path / "projectionApi.ts"
    )
    assert any("[R3]" in n and "LvDomainView.tsx" in n for n in naruszenia)


def test_r3_wykrywa_zero_fetch_w_projection_api(tmp_path: Path) -> None:
    (tmp_path / "projectionApi.ts").write_text("export const x = 1;\n", encoding="utf-8")
    naruszenia = guard.check_r3(
        lv_domain_dir=tmp_path, projection_api_file=tmp_path / "projectionApi.ts"
    )
    assert any("projectionApi.ts" in n and "0" in n for n in naruszenia)


def test_r3_wykrywa_dwa_fetch_w_projection_api(tmp_path: Path) -> None:
    (tmp_path / "projectionApi.ts").write_text("fetch('/a'); fetch('/b');\n", encoding="utf-8")
    naruszenia = guard.check_r3(
        lv_domain_dir=tmp_path, projection_api_file=tmp_path / "projectionApi.ts"
    )
    assert any("projectionApi.ts" in n and "2" in n for n in naruszenia)


def test_r3_ok_gdy_jeden_fetch_wylacznie_w_projection_api(tmp_path: Path) -> None:
    (tmp_path / "projectionApi.ts").write_text(
        "export async function f() { return fetch('/x'); }\n", encoding="utf-8"
    )
    (tmp_path / "LvDomainView.tsx").write_text("export const x = 1;\n", encoding="utf-8")
    naruszenia = guard.check_r3(
        lv_domain_dir=tmp_path, projection_api_file=tmp_path / "projectionApi.ts"
    )
    assert naruszenia == []


# ---------------------------------------------------------------------------
# R4 — zero rekonstrukcji topologii z ENM w lv-domain/**
# ---------------------------------------------------------------------------


def test_r4_wykrywa_import_types_enm(tmp_path: Path) -> None:
    (tmp_path / "x.ts").write_text(
        "import type { EnergyNetworkModel } from '../../../types/enm';\n", encoding="utf-8"
    )
    naruszenia = guard.check_r4(lv_domain_dir=tmp_path)
    assert any("[R4]" in n and "types/enm" in n for n in naruszenia)


def test_r4_wykrywa_snapshot_branches(tmp_path: Path) -> None:
    (tmp_path / "x.ts").write_text("const b = snapshot.branches;\n", encoding="utf-8")
    naruszenia = guard.check_r4(lv_domain_dir=tmp_path)
    assert any("snapshot.branches" in n for n in naruszenia)


def test_r4_wykrywa_snapshot_buses(tmp_path: Path) -> None:
    (tmp_path / "x.ts").write_text("const b = snapshot.buses;\n", encoding="utf-8")
    naruszenia = guard.check_r4(lv_domain_dir=tmp_path)
    assert any("snapshot.buses" in n for n in naruszenia)


def test_r4_projection_graph_jest_dozwolony(tmp_path: Path) -> None:
    (tmp_path / "x.ts").write_text("const g = projection.graph;\n", encoding="utf-8")
    assert guard.check_r4(lv_domain_dir=tmp_path) == []


# ---------------------------------------------------------------------------
# R5 — SldCanvasV3Workspace.tsx: zero importow legacy, zero fetch bezposredni
# ---------------------------------------------------------------------------


def test_r5_wykrywa_import_legacy(tmp_path: Path) -> None:
    plik = tmp_path / "SldCanvasV3Workspace.tsx"
    plik.write_text("import { useSwzOverlay } from './useSwzOverlay';\n", encoding="utf-8")
    naruszenia = guard.check_r5(workspace_file=plik)
    assert any("[R5]" in n and "useSwzOverlay" in n for n in naruszenia)


def test_r5_wykrywa_fetch_swz(tmp_path: Path) -> None:
    plik = tmp_path / "SldCanvasV3Workspace.tsx"
    plik.write_text("fetch(`/api/v1/apparatus/${ref}/swz`);\n", encoding="utf-8")
    naruszenia = guard.check_r5(workspace_file=plik)
    assert any("swz" in n for n in naruszenia)


def test_r5_wykrywa_fetch_lv_domain(tmp_path: Path) -> None:
    plik = tmp_path / "SldCanvasV3Workspace.tsx"
    plik.write_text("fetch('/api/v1/lv-domain/projection');\n", encoding="utf-8")
    naruszenia = guard.check_r5(workspace_file=plik)
    assert any("lv-domain" in n for n in naruszenia)


def test_r5_ok_gdy_fetch_przez_inny_endpoint(tmp_path: Path) -> None:
    plik = tmp_path / "SldCanvasV3Workspace.tsx"
    plik.write_text("fetch('/api/v1/network-model');\n", encoding="utf-8")
    assert guard.check_r5(workspace_file=plik) == []


def test_r5_brakujacy_plik_jest_bledem(tmp_path: Path) -> None:
    naruszenia = guard.check_r5(workspace_file=tmp_path / "nie-ma.tsx")
    assert any("brak-pliku" in n for n in naruszenia)
