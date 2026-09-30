"""Self-testy `ui2_dead_handler_guard` (karta TODO-UI2, 2026-09-16, §0.4(iii)).

Klasa: `on<Prop>={() => undefined}` / `on<Prop>={() => {}}` / `on<Prop>={void 0}`
/ `on<Prop>={noop}` w `frontend/src/ui2/**` — precedens realny: `AppRoot.tsx:463`
+ 9 dalszych instancje wykryte przy budowie tego guarda (`EkranKontyngencji`,
`EkranFrt`+`WynikSekwencji`+`SekcjaSekwencjiZapadow`, `EkranKompensacji`+
`WynikKompensacji`, `EkranKrzywych`+`WynikPokrycia`, `EkranLom`+`WynikLom`,
`EkranObszaruPQ`+`WynikObszaru`, `EkranOsd`+`WynikOsd`, `KreatorStudium`+
`PrzegladStudium`) — WSZYSTKIE naprawione w tej karcie poza `AppRoot.tsx`
(TODO-B, §0.3 karty).
"""

from __future__ import annotations

from pathlib import Path

import ui2_dead_handler_guard as guard


def _plik_ui2(
    tmp_path: Path, tresc: str, wzgledna: str = "frontend/src/ui2/wyniki/Ekran.tsx"
) -> Path:
    sciezka = tmp_path / wzgledna
    sciezka.parent.mkdir(parents=True, exist_ok=True)
    sciezka.write_text(tresc, encoding="utf-8")
    return sciezka


def test_flags_arrow_returning_undefined(tmp_path: Path) -> None:
    _plik_ui2(tmp_path, "<Foo onOtworzDowod={() => undefined} />\n")
    naruszenia = guard.check_dead_handlers(root=tmp_path)
    assert any("() => undefined" in v.rule for v in naruszenia)


def test_flags_arrow_returning_undefined_with_trailing_comment(tmp_path: Path) -> None:
    """Przypadek realny repo (`AppRoot.tsx:463`): komentarz MIĘDZY `undefined`
    a zamykającym `}` propsa nie maskuje trafienia."""
    _plik_ui2(
        tmp_path,
        "onOtworzDowod={() => undefined /* TODO-KARTA: przestrzeń Wyniki (E9) */}\n",
    )
    naruszenia = guard.check_dead_handlers(root=tmp_path)
    assert any("() => undefined" in v.rule for v in naruszenia)


def test_flags_empty_arrow_body(tmp_path: Path) -> None:
    """Przypadek realny repo (`EkranKontyngencji.tsx`, naprawiony w tej karcie)."""
    _plik_ui2(tmp_path, "onOtworzDowod={() => {}}\n")
    naruszenia = guard.check_dead_handlers(root=tmp_path)
    assert any("() => {}" in v.rule for v in naruszenia)


def test_flags_void_zero(tmp_path: Path) -> None:
    _plik_ui2(tmp_path, "onZamknij={void 0}\n")
    naruszenia = guard.check_dead_handlers(root=tmp_path)
    assert any("void 0" in v.rule for v in naruszenia)


def test_flags_noop_constant(tmp_path: Path) -> None:
    _plik_ui2(tmp_path, "onWybierzWiersz={noop}\n")
    naruszenia = guard.check_dead_handlers(root=tmp_path)
    assert any("noop" in v.rule for v in naruszenia)


def test_flags_pattern_split_across_lines(tmp_path: Path) -> None:
    """Prop sformatowany przez prettier na kilku liniach (spacja/nowa linia
    między tokenami wzorca) — `\\s*` łapie też `\\n`."""
    _plik_ui2(
        tmp_path,
        "onOtworzDowod={\n  () =>\n    undefined\n}\n",
    )
    naruszenia = guard.check_dead_handlers(root=tmp_path)
    assert any("() => undefined" in v.rule for v in naruszenia)


def test_ignores_files_outside_ui2(tmp_path: Path) -> None:
    """Ta sama linia POZA `ui2/**` (np. `ui/`) jest poza zakresem TEGO guarda —
    klasa jest scoped kartą do `ui2/**` (§0.4(iii))."""
    _plik_ui2(
        tmp_path,
        "onOtworzDowod={() => undefined}\n",
        wzgledna="frontend/src/ui/results-inspector/Ekran.tsx",
    )
    assert guard.check_dead_handlers(root=tmp_path) == []


def test_ignores_test_files(tmp_path: Path) -> None:
    _plik_ui2(
        tmp_path,
        "render(<Foo onOtworzDowod={() => undefined} />);\n",
        wzgledna="frontend/src/ui2/wyniki/__tests__/Ekran.test.tsx",
    )
    assert guard.check_dead_handlers(root=tmp_path) == []


def test_real_handler_with_body_is_silent(tmp_path: Path) -> None:
    """Realny dostawca — nawet jednolinijkowy — nie jest martwym uchwytem."""
    _plik_ui2(tmp_path, "onOtworzDowod={(ref) => otworzDowod(ref)}\n")
    assert guard.check_dead_handlers(root=tmp_path) == []


def test_clean_tree_is_green(tmp_path: Path) -> None:
    _plik_ui2(tmp_path, "<Foo onOtworzDowod={otworzDowod} trybZaawansowania={tryb} />\n")
    assert guard.check_dead_handlers(root=tmp_path) == []


def test_real_repo_todo_a_owned_paths_are_clean() -> None:
    """Pin ODPOWIEDZIALNOŚCI (TODO-A): `ui2/wyniki/**`, `ui2/freshness/**`,
    `ui2/spaces/wyniki/**` są czyste na realnym repo po tej karcie. NIE pinuje
    całego `ui2/**` — `AppRoot.tsx:463` zostaje dla sub-karty B (§0.3 karty)."""
    wszystkie = guard.check_dead_handlers()
    wlasne_prefiksy = (
        "frontend/src/ui2/wyniki/",
        "frontend/src/ui2/freshness/",
        "frontend/src/ui2/spaces/wyniki/",
    )
    wlasne = [v for v in wszystkie if v.path.startswith(wlasne_prefiksy)]
    assert wlasne == [], [v.render() for v in wlasne]


def test_real_repo_only_known_todo_b_instance_remains() -> None:
    """Dowód, że guard jest wpięty poprawnie na CAŁYM `ui2/**` (nie tylko na
    plikach TODO-A): jedyne pozostałe naruszenie na realnym repo to
    `AppRoot.tsx:463`, jawnie przypisane sub-karcie B."""
    wszystkie = guard.check_dead_handlers()
    sciezki = {v.path for v in wszystkie}
    assert sciezki <= {"frontend/src/ui2/AppRoot.tsx"}, sciezki
