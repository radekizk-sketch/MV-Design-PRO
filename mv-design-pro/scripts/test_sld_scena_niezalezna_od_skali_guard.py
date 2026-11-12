"""Samotest strażnika „scena SLD niezależna od skali" (karta SLD-SKALA-I-NAWIGACJA).

Strażnik czyta ścieżki ze stałych modułu w chwili wywołania `main()`, więc test buduje
drzewo tymczasowe z KOPII realnych plików repozytorium (nie z atrap), sprawdza, że na
nim strażnik jest zielony, a potem wstrzykuje po jednej regresji z każdej klasy, której
strażnik pilnuje, i żąda czerwonego wyniku z właściwym numerem strażnika. Iloczyn cech:
{sygnatura budowy sceny, import kamery w module sceny, identyfikator dawnego poziomu
szczegółu w źródle / e2e / skrypcie, skrócony kontrakt klas toru, tor mocy w warstwie,
próg czytelności poza napisem, workflow bez strażnika}.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

import pytest
import sld_scena_niezalezna_od_skali_guard as guard

REAL_FRONTEND = guard.FRONTEND
REAL_WORKFLOW = guard.WORKFLOW
V3 = Path("src") / "ui" / "sld" / "v3"
COPIED = [
    V3 / "scene" / "ciagloscToru.ts",
    V3 / "scene" / "__tests__" / "ciagloscToru.test.ts",
    V3 / "scene" / "buildScene.ts",
    V3 / "scene" / "scenaSld.ts",
    V3 / "symbols" / "defs.ts",
    V3 / "canvas" / "layers.ts",
    V3 / "canvas" / "gestoscInformacji.ts",
    V3 / "canvas" / "labelLegibility.ts",
]


@pytest.fixture
def drzewo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    frontend = tmp_path / "frontend"
    for rel in COPIED:
        cel = frontend / rel
        cel.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(REAL_FRONTEND / rel, cel)
    (frontend / "e2e").mkdir()
    (frontend / "scripts").mkdir()
    workflow = tmp_path / "sld-determinism.yml"
    shutil.copyfile(REAL_WORKFLOW, workflow)
    monkeypatch.setattr(guard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(guard, "FRONTEND", frontend)
    monkeypatch.setattr(guard, "WORKFLOW", workflow)
    return tmp_path


def _uruchom(capsys: pytest.CaptureFixture[str]) -> tuple[int, str]:
    kod = guard.main()
    return kod, capsys.readouterr().out


def _podmien(path: Path, stare: str, nowe: str) -> None:
    tresc = path.read_text(encoding="utf-8")
    assert stare in tresc, f"brak wzorca iniekcji w {path}: {stare!r}"
    path.write_text(tresc.replace(stare, nowe, 1), encoding="utf-8")


def test_realne_drzewo_jest_zielone(drzewo: Path, capsys: pytest.CaptureFixture[str]) -> None:
    kod, out = _uruchom(capsys)
    assert kod == 0, out


def test_prawdziwe_repo_jest_zielone(capsys: pytest.CaptureFixture[str]) -> None:
    assert guard.main() == 0, capsys.readouterr().out


def test_budowa_sceny_z_parametrem_skali_jest_czerwona(
    drzewo: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    plik = drzewo / "frontend" / V3 / "scene" / "buildScene.ts"
    tresc = plik.read_text(encoding="utf-8")
    m = re.search(r"export function buildSceneV3\s*\(([^)]*)\)", tresc)
    assert m, "brak deklaracji buildSceneV3"
    plik.write_text(
        tresc[: m.start(1)] + m.group(1).rstrip() + ", lod: number" + tresc[m.end(1) :],
        encoding="utf-8",
    )
    kod, out = _uruchom(capsys)
    assert kod == 1
    assert "GUARD 3: `buildSceneV3` przyjmuje 2 parametry" in out


def test_import_kamery_w_module_sceny_jest_czerwony(
    drzewo: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    plik = drzewo / "frontend" / V3 / "scene" / "ciagloscToru.ts"
    plik.write_text(
        "import { MIN_SCALE } from '../canvas/camera';\n" + plik.read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    kod, out = _uruchom(capsys)
    assert kod == 1
    assert "GUARD 3: moduł sceny importuje kamerę" in out


@pytest.mark.parametrize("katalog", ["src", "e2e", "scripts"])
@pytest.mark.parametrize("identyfikator", ["lodOverride", "stationCollapsed", "data-scene-lod"])
def test_identyfikator_dawnego_poziomu_szczegolu_jest_czerwony(
    drzewo: Path, capsys: pytest.CaptureFixture[str], katalog: str, identyfikator: str
) -> None:
    plik = drzewo / "frontend" / katalog / "wstrzykniety.ts"
    plik.write_text(f"export const x = '{identyfikator}';\n", encoding="utf-8")
    kod, out = _uruchom(capsys)
    assert kod == 1
    assert f"GUARD 6: identyfikator dawnych poziomów szczegółu `{identyfikator}`" in out


def test_skrocony_kontrakt_klas_toru_jest_czerwony(
    drzewo: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    _podmien(
        drzewo / "frontend" / V3 / "scene" / "ciagloscToru.ts",
        "PreviewSegmentKind[] = [\n  'snTrunk',",
        "PreviewSegmentKind[] = [",
    )
    kod, out = _uruchom(capsys)
    assert kod == 1
    assert "GUARD 1: klasy odcinków toru prądowego USUNIĘTE z kontraktu — snTrunk" in out


def test_tor_mocy_w_przelaczalnej_warstwie_jest_czerwony(
    drzewo: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    plik = drzewo / "frontend" / V3 / "canvas" / "layers.ts"
    tresc = plik.read_text(encoding="utf-8")
    m = re.search(r"const STATIONS_APPARATUS_KINDS[^=]*=\s*new Set\(\[", tresc)
    assert m, "brak deklaracji STATIONS_APPARATUS_KINDS"
    plik.write_text(tresc[: m.end()] + "'segment', " + tresc[m.end() :], encoding="utf-8")
    kod, out = _uruchom(capsys)
    assert kod == 1
    assert "GUARD 4: tor mocy (elementKind 'segment') przypięty do warstwy" in out


def test_prog_czytelnosci_poza_napisem_jest_czerwony(
    drzewo: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    plik = drzewo / "frontend" / V3 / "canvas" / "wstrzykniety.ts"
    plik.write_text("const widacAparat = czytelnyNaEkranie(16, skala);\n", encoding="utf-8")
    kod, out = _uruchom(capsys)
    assert kod == 1
    assert "GUARD 5: próg czytelności użyty poza kontekstem napisu" in out


def test_workflow_bez_straznika_jest_czerwony(
    drzewo: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    workflow = drzewo / "sld-determinism.yml"
    tresc = workflow.read_text(encoding="utf-8")
    assert "sld_scena_niezalezna_od_skali_guard.py" in tresc
    workflow.write_text(
        tresc.replace("sld_scena_niezalezna_od_skali_guard.py", "inny_guard.py"), encoding="utf-8"
    )
    kod, out = _uruchom(capsys)
    assert kod == 1
    assert "GUARD 7: strażnik nie jest uruchamiany w sld-determinism.yml" in out
