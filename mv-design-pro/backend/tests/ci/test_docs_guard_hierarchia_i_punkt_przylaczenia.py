"""Pin sprawdzeń K-19 i K-20 w `docs_guard` (karta ZAPIS-DECYZJI, 2026-09-30).

INTENCJA. Decyzja O-63 (rejestr planu A/B §2.3) uczyniła z tabeli „Document
Hierarchy" w `CLAUDE.md` i listy „Hierarchia kanonu" w `docs/INDEX.md` JEDNĄ
listę — do 2026-09-30 istniały niezależnie (6 wobec 10 pozycji o różnej treści),
a program konwergencji (`docs/architecture/*`) nie miał miejsca w żadnej (K-20,
V12K-339). Decyzja O-60 przepisała kontrakty SLD, które nakazywały termin
„BoundaryNode ZAWSZE" i tłumaczyły punkt przyłączenia jako „Point of Common
Coupling" wbrew Core Rule 5 i ADR-027 (K-19, V12K-347).

Reguła KLASA §4: deklaracja bez testu = fałszywa pewność. Ten plik przypina OBA
końce każdego sprawdzenia: zielone na HEAD i REAGUJĄCE na wstrzykniętą regresję.
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


guard = _load_script("docs_guard")


# --------------------------------------------------------------------------
# K-19 — zakazane wzorce punktu przyłączenia w kontraktach SLD/zwarciowych
# --------------------------------------------------------------------------


def test_k19_kontrakty_na_head_bez_zakazanych_wzorcow() -> None:
    """Stan repozytorium po kartach K-19 + G-15(a): 0 trafień w docs/ui i docs/sld."""
    assert guard.check_k19_connection_point_terms() == []


def test_k19_wstrzykniety_wzorzec_jest_wskazany_po_pliku_i_linii(tmp_path: Path) -> None:
    """Regresja: kontrakt SLD z „Point of Common Coupling" -> naruszenie z plik:linia."""
    doc = tmp_path / "docs" / "ui" / "SLD_X_CONTRACT.md"
    doc.parent.mkdir(parents=True)
    doc.write_text(
        "# Kontrakt\n\n| BoundaryNode | Węzeł (Point of Common Coupling) |\n",
        encoding="utf-8",
    )
    naruszenia = guard.check_k19_connection_point_terms(tmp_path)
    assert len(naruszenia) == 1
    assert "docs/ui/SLD_X_CONTRACT.md:3" in naruszenia[0]
    assert "Point of Common Coupling" in naruszenia[0]


def test_k19_nakaz_boundarynode_zawsze_jest_zakazany_takze_w_docs_sld(tmp_path: Path) -> None:
    """Klasa, nie instancja: docs/sld/SLD_*.md podlega temu samemu zakazowi."""
    doc = tmp_path / "docs" / "sld" / "SLD_TARGET.md"
    doc.parent.mkdir(parents=True)
    doc.write_text("ZAWSZE używaj terminu BoundaryNode\n", encoding="utf-8")
    naruszenia = guard.check_k19_connection_point_terms(tmp_path)
    assert len(naruszenia) == 1
    assert "docs/sld/SLD_TARGET.md:1" in naruszenia[0]


def test_k19_dokument_spoza_klasy_nie_jest_skanowany(tmp_path: Path) -> None:
    """Rejestr konfliktów cytuje dawne brzmienie — nie należy do klasy kontraktów."""
    doc = tmp_path / "docs" / "v12xx" / "REJESTR_KONFLIKTOW.md"
    doc.parent.mkdir(parents=True)
    doc.write_text("| V12K-347 | Point of Common Coupling — dawne brzmienie |\n", encoding="utf-8")
    assert guard.check_k19_connection_point_terms(tmp_path) == []


# --------------------------------------------------------------------------
# K-20 — jedna hierarchia w CLAUDE.md i docs/INDEX.md
# --------------------------------------------------------------------------


def _repo(tmp_path: Path, claude_rows: str, index_rows: str, files: tuple[str, ...]) -> Path:
    """Kopia minimalnego repo: <tmp>/CLAUDE.md + <tmp>/mv-design-pro/docs/INDEX.md."""
    project = tmp_path / "mv-design-pro"
    (project / "docs").mkdir(parents=True)
    for rel in files:
        target = project / rel
        if rel.endswith("/"):
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("x\n", encoding="utf-8")
    (tmp_path / "CLAUDE.md").write_text(
        "# CLAUDE\n\n## Document Hierarchy (BINDING)\n\nAuthority order:\n\n"
        "| Priority | Document | Purpose |\n|---|---|---|\n" + claude_rows + "\n## Next\n",
        encoding="utf-8",
    )
    (project / "docs" / "INDEX.md").write_text(
        "# Index\n\n> **Hierarchia kanonu** (opis):\n" + index_rows + "\n---\n",
        encoding="utf-8",
    )
    return project


def test_k20_hierarchia_na_head_jest_jedna_lista_z_istniejacymi_sciezkami() -> None:
    """Stan faktyczny: CLAUDE.md i docs/INDEX.md zgodne, każda ścieżka istnieje."""
    assert guard.check_k20_hierarchy() == []


def test_k20_listy_identyczne_i_sciezki_istniejace_sa_zielone(tmp_path: Path) -> None:
    project = _repo(
        tmp_path,
        "| 1 | `mv-design-pro/docs/v12xx/KANON.md` + registries | kanon |\n"
        "| 1b | `mv-design-pro/docs/architecture/A.md` + `mv-design-pro/docs/architecture/B.md` | prawo programu |\n"
        "| 2 | `mv-design-pro/docs/system/SPEC_*.md` | specy |\n"
        "| — | `mv-design-pro/docs/twin/` | NOT canon — see `REJESTR.md` |\n",
        "> 1. `docs/v12xx/KANON.md` — kanon\n"
        "> 1b. `docs/architecture/A.md`, `docs/architecture/B.md` — prawo programu → `docs/v12xx/REJESTR.md`\n"
        "> 2. `docs/system/SPEC_*.md` — specy\n"
        "> —. `docs/twin/` — NIE kanon\n",
        (
            "docs/v12xx/KANON.md",
            "docs/architecture/A.md",
            "docs/architecture/B.md",
            "docs/system/SPEC_1.md",
            "docs/twin/",
        ),
    )
    assert guard.check_k20_hierarchy(project) == []


def test_k20_rozna_sciezka_na_tym_samym_poziomie_jest_naruszeniem(tmp_path: Path) -> None:
    """Regresja: docs/INDEX.md wskazuje inny plik na poziomie 1b niż CLAUDE.md."""
    project = _repo(
        tmp_path,
        "| 1 | `mv-design-pro/docs/v12xx/KANON.md` | kanon |\n"
        "| 1b | `mv-design-pro/docs/architecture/A.md` | prawo |\n",
        "> 1. `docs/v12xx/KANON.md` — kanon\n> 1b. `docs/architecture/B.md` — prawo\n",
        ("docs/v12xx/KANON.md", "docs/architecture/A.md", "docs/architecture/B.md"),
    )
    naruszenia = guard.check_k20_hierarchy(project)
    assert len(naruszenia) == 1
    assert "poziom 1b" in naruszenia[0]
    assert "docs/architecture/A.md" in naruszenia[0] and "docs/architecture/B.md" in naruszenia[0]


def test_k20_poziom_obecny_tylko_w_jednym_pliku_jest_naruszeniem(tmp_path: Path) -> None:
    project = _repo(
        tmp_path,
        "| 1 | `mv-design-pro/docs/v12xx/KANON.md` | kanon |\n"
        "| 1b | `mv-design-pro/docs/architecture/A.md` | prawo |\n",
        "> 1. `docs/v12xx/KANON.md` — kanon\n",
        ("docs/v12xx/KANON.md", "docs/architecture/A.md"),
    )
    naruszenia = guard.check_k20_hierarchy(project)
    assert naruszenia == ["  poziom 1b: jest w CLAUDE.md, brak w docs/INDEX.md"]


def test_k20_nieistniejaca_sciezka_jest_naruszeniem(tmp_path: Path) -> None:
    """Obie listy zgodne, ale ścieżka nie istnieje w repo (widmo dokumentu)."""
    project = _repo(
        tmp_path,
        "| 1 | `mv-design-pro/docs/v12xx/KANON.md` | kanon |\n",
        "> 1. `docs/v12xx/KANON.md` — kanon\n",
        (),
    )
    naruszenia = guard.check_k20_hierarchy(project)
    assert naruszenia == ["  poziom 1: ścieżka nie istnieje -> docs/v12xx/KANON.md"]


def test_k20_pusty_skan_jest_bledem_a_nie_cisza(tmp_path: Path) -> None:
    """Zapadka na zmianę formatu: brak wierszy w tabeli nie może przejść jako zgodność."""
    project = _repo(tmp_path, "", "", ())
    naruszenia = guard.check_k20_hierarchy(project)
    assert len(naruszenia) == 1
    assert "pusty skan" in naruszenia[0]
