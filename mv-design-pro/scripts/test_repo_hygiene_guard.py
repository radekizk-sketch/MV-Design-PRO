"""Self-testy `repo_hygiene_guard.check_todo_fixme` (karta TODO-UI2, 2026-09-16).

Karta §0.4(i): zapadka TODO/FIXME zeszła z 9 wybranych ścieżek na CAŁY
`backend/src` + `frontend/src` (bez `__tests__`/`.test.`/`.spec.`), bo wąski
wykaz przepuszczał 50+ znaczników `TODO-KARTA` poza dziewięcioma katalogami —
WSZYSTKIE siedziały w `frontend/src/ui2/**`. Testy: iniekcja czerwona (klasa
znaczników, nie jeden przykład z karty) + wyjątek pliku-kanonu (fałszywe
trafienie, nie instancja długu) + brak fałszywego trafienia na testach.
"""

from __future__ import annotations

from pathlib import Path

import repo_hygiene_guard as guard


def _drzewo(tmp_path: Path) -> tuple[Path, Path]:
    backend_src = tmp_path / "backend" / "src"
    frontend_src = tmp_path / "frontend" / "src"
    backend_src.mkdir(parents=True)
    frontend_src.mkdir(parents=True)
    return backend_src, frontend_src


def test_flags_todo_karta_marker_anywhere_in_frontend_src(tmp_path: Path) -> None:
    """Iniekcja czerwona — znacznik KLASY (TODO-KARTA), nie tylko dosłowne 'TODO'."""
    _backend_src, frontend_src = _drzewo(tmp_path)
    plik = frontend_src / "ui2" / "wyniki" / "przyklad" / "Model.ts"
    plik.parent.mkdir(parents=True)
    plik.write_text(
        "// TODO-KARTA: brak zdolności, karta §2\nexport const x = 1;\n",
        encoding="utf-8",
    )

    naruszenia = guard.check_todo_fixme(root=tmp_path)

    assert any("TODO-KARTA" in v.rule or "TODO marker" in v.rule for v in naruszenia)
    assert any(v.line_no == 1 for v in naruszenia)


def test_flags_fixme_in_backend_src(tmp_path: Path) -> None:
    """Ten sam wzorzec w backendzie — zapadka nie jest tylko frontendowa."""
    backend_src, _frontend_src = _drzewo(tmp_path)
    plik = backend_src / "api" / "cos.py"
    plik.parent.mkdir(parents=True)
    plik.write_text("# FIXME: brakuje walidacji\nx = 1\n", encoding="utf-8")

    naruszenia = guard.check_todo_fixme(root=tmp_path)

    assert any(v.rule == "FIXME marker" for v in naruszenia)


def test_flags_bare_todo_word_without_colon_anywhere_in_line(tmp_path: Path) -> None:
    """Wzorzec `\\bTODO\\b` łapie 'TODO E9.x' (bez dwukropka) — węższy grep karty
    (`TODO-KARTA|TODO:|FIXME`) by to pominął; realny przypadek repo:
    `rozplywAdapter.ts` niósł 'TODO E9.x w DowodPrzebiegu' bez dwukropka."""
    _backend_src, frontend_src = _drzewo(tmp_path)
    plik = frontend_src / "ui2" / "wyniki" / "adapters" / "adapter.ts"
    plik.parent.mkdir(parents=True)
    plik.write_text("// pod fokus kroku (TODO E9.x w DowodPrzebiegu)\n", encoding="utf-8")

    naruszenia = guard.check_todo_fixme(root=tmp_path)

    assert any(v.rule == "TODO marker" for v in naruszenia)


def test_ignores_test_files(tmp_path: Path) -> None:
    """`__tests__`/`.test.`/`.spec.` wyłączone — ten sam znacznik w teście milczy."""
    _backend_src, frontend_src = _drzewo(tmp_path)
    plik = frontend_src / "ui2" / "wyniki" / "__tests__" / "model.test.ts"
    plik.parent.mkdir(parents=True)
    plik.write_text("// TODO-KARTA: nie powinno się zapalić\n", encoding="utf-8")

    assert guard.check_todo_fixme(root=tmp_path) == []


def test_exempts_canonical_forbidden_word_list_file(tmp_path: Path) -> None:
    """`ui/canon/labelGuards.ts` DEFINIUJE słowo 'TODO' jako wzorzec dla innego
    guarda — dopasowanie do własnej definicji kanonu jest fałszywym trafieniem,
    nie instancją długu. Wyjątek jest PER PLIK, nie osłabieniem `TODO_PATTERNS`."""
    _backend_src, frontend_src = _drzewo(tmp_path)
    plik = frontend_src / "ui" / "canon" / "labelGuards.ts"
    plik.parent.mkdir(parents=True)
    plik.write_text(
        "export const FORBIDDEN = [\n  'TODO',\n  'Placeholder',\n];\n",
        encoding="utf-8",
    )

    assert guard.check_todo_fixme(root=tmp_path) == []


def test_exemption_is_scoped_to_the_named_file_only(tmp_path: Path) -> None:
    """Predykat parami: wyjątek działa WYŁĄCZNIE dla ścieżki z listy — identyczna
    zawartość pod INNĄ ścieżką nadal jest naruszeniem (zero osłabienia klasy)."""
    _backend_src, frontend_src = _drzewo(tmp_path)
    plik = frontend_src / "ui2" / "spaces" / "cos" / "innyPlik.ts"
    plik.parent.mkdir(parents=True)
    plik.write_text("export const FORBIDDEN = [\n  'TODO',\n];\n", encoding="utf-8")

    naruszenia = guard.check_todo_fixme(root=tmp_path)

    assert any(v.path.endswith("ui2/spaces/cos/innyPlik.ts") for v in naruszenia)


def test_clean_tree_is_green(tmp_path: Path) -> None:
    _backend_src, frontend_src = _drzewo(tmp_path)
    plik = frontend_src / "ui2" / "wyniki" / "czysty.ts"
    plik.parent.mkdir(parents=True)
    plik.write_text("export const x = 1;\n", encoding="utf-8")

    assert guard.check_todo_fixme(root=tmp_path) == []


def test_todo_a_owned_paths_are_clean_on_real_repo() -> None:
    """Pin ODPOWIEDZIALNOŚCI (nie całego repo — sub-karta B kończy równolegle
    swoje pliki w tym samym drzewie): `ui2/wyniki/**`, `ui2/freshness/**`,
    `ui2/spaces/wyniki/**` i `api/canonical_run_views.py` (TODO-A, karta §1) są
    czyste NA REALNYM repo po tej karcie — bez znaczników klasy TODO-KARTA."""
    wlasne = [
        "frontend/src/ui2/wyniki",
        "frontend/src/ui2/freshness",
        "frontend/src/ui2/spaces/wyniki",
        "backend/src/api/canonical_run_views.py",
    ]
    naruszenia = guard.scan_targets(
        guard.PROJECT_ROOT,
        wlasne,
        guard.TODO_PATTERNS,
        skip_comment_lines=False,
    )
    naruszenia = [v for v in naruszenia if v.path not in guard.TODO_FIXME_FILE_EXEMPTIONS]
    assert naruszenia == [], [f"{v.path}:{v.line_no}: {v.context}" for v in naruszenia]
