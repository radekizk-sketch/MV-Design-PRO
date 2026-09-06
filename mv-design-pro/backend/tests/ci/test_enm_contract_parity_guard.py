"""Testy guarda enm_contract_parity_guard (F4, 2026-09-05).

Intencja guarda: `frontend/src/types/enm.ts` jest recznie utrzymywanym lustrem
`backend/src/enm/models.py` — guard sprawdza (1) czy kazde pole pydantic
sprawdzanej encji ma odpowiednik w lustrze (z uwzglednieniem dziedziczenia) i
(2) czy dla pol `Literal[str,...]` zbior wartosci po stronie TS jest ROWNY
zbiorowi literalow pydantic (parytet wartosci unii, nie tylko obecnosc pola).

Ten plik testowy pilnuje SZCZEGOLNIE mechanizmu (2) dla pol dziedziczonych z
bazy WARUNKOWEJ (`BranchBase`) — dokladnie tam, gdzie znaleziono i naprawiono
bledna implementacje przy weryfikacji karty F4: fallback szukajacy wyrazenia
typu pola na bazie testowal przynaleznosc NAZWY INTERFEJSU do zbioru NAZW POL
(`baza`), co bylo ZAWSZE falszywe i cicho wylaczalo sprawdzenie parytetu
literalow dla kazdego pola zadeklarowanego WYLACZNIE na `BranchBase`
(`status`/`parameter_source`/`source_mode` na `Cable`/`FuseBranch`/
`OverheadLine`/`SwitchBranch` — 12 pol). Guard mimo to zglaszal "OK" — dokladnie
klasa bledu "deklaracja bez testu = falszywa pewnosc" (KLASA-NIE-INSTANCJA §4),
ktora TEN guard mial zamykac dla `enm.ts`, a sam ja powielal wewnetrznie.
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


guard = _load_script("enm_contract_parity_guard")


# =============================================================================
# Integracja: guard na HEAD
# =============================================================================


def test_guard_zielony_na_head() -> None:
    """Lustro enm.ts na HEAD zna kazde pole i literal sprawdzanych encji."""
    assert guard.main() == 0


def test_guard_sprawdza_wszystkie_zmapowane_encje(capsys) -> None:
    """Zaden wpis SPRAWDZANE nie jest cicho pomijany (klasa == mapa)."""
    guard.main()
    wyjscie = capsys.readouterr().out
    assert f"encje sprawdzone: {len(guard.SPRAWDZANE)}/{len(guard.SPRAWDZANE)}" in wyjscie


def test_guard_liczy_pola_literalowe_dziedziczone_z_branchbase(capsys) -> None:
    """Regresja wprost: licznik pol Literal[str,...] MUSI objac pola zadeklarowane
    WYLACZNIE na BranchBase (status/parameter_source/source_mode), nie tylko
    pola wlasne encji. Przed naprawa z 2026-09-05 licznik wynosil 103 (12 pol
    cicho pomijanych); po naprawie 115 — patrz docstring modulu."""
    guard.main()
    wyjscie = capsys.readouterr().out
    import re

    dopasowanie = re.search(r"parytet wartosci\): (\d+)", wyjscie)
    assert dopasowanie is not None, wyjscie
    assert int(dopasowanie.group(1)) == 115, (
        "Liczba sprawdzonych pol Literal[str,...] spadla ponizej oczekiwanej — "
        "sprawdz, czy pola dziedziczone z bazy warunkowej (BranchBase) nie sa "
        "znowu cicho pomijane."
    )


# =============================================================================
# _znajdz_wyrazenie_pola_z_baza — dokladny mechanizm naprawionego bledu
# =============================================================================

_SYNTETYCZNY_TS = """
export interface ENMElement {
  id: string;
}

export interface BranchBase extends ENMElement {
  status: 'open' | 'closed';
}

export interface Cable extends BranchBase {
  type: 'cable';
}

export interface Load {
  type: 'load';
}
"""


def test_pole_dziedziczone_z_bazy_warunkowej_gdy_encja_ja_rozszerza() -> None:
    """Cable rozszerza BranchBase (ma to w `rozszerzenia_ts`) -> pole `status`,
    zadeklarowane WYLACZNIE na BranchBase, MUSI zostac znalezione przez fallback.
    To dokladnie ten przypadek, ktory byl cicho pomijany przed naprawa."""
    trafienie = guard._znajdz_wyrazenie_pola_z_baza(
        _SYNTETYCZNY_TS, "Cable", {"BranchBase"}, "status"
    )
    assert trafienie is not None
    zrodlowy_interfejs, wyrazenie = trafienie
    assert zrodlowy_interfejs == "BranchBase"
    assert wyrazenie.strip() == "'open' | 'closed'"


def test_pole_bazy_ktorej_encja_nie_rozszerza_nie_jest_znajdowane() -> None:
    """Load NIE rozszerza BranchBase (`rozszerzenia_ts` puste) — mimo ze pole
    `status` istnieje TEKSTOWO na BranchBase gdzie indziej w pliku, guard NIE
    WOLNO mu go pozyczyc dla encji, ktora go faktycznie nie dziedziczy (to byloby
    OD WROTNA wersja tego samego bledu klasy: falszywe dopasowanie zamiast
    falszywego pominiecia)."""
    trafienie = guard._znajdz_wyrazenie_pola_z_baza(_SYNTETYCZNY_TS, "Load", set(), "status")
    assert trafienie is None


def test_pole_bazy_bezwarunkowej_zawsze_znajdowane() -> None:
    """`ENMElement` (BAZA_BEZWARUNKOWA) obowiazuje NIEZALEZNIE od `rozszerzenia_ts`
    przekazanego przez wywolujacego — Cable dziedziczy `id` posrednio przez
    BranchBase -> ENMElement, ale sama funkcja dostaje `rozszerzenia_ts` encji
    WLASNEJ (Cable), ktore go NIE wymienia wprost — mimo to musi go znalezc,
    bo ENMElement jest zawsze stosowalna."""
    assert "ENMElement" in guard.BAZA_BEZWARUNKOWA
    trafienie = guard._znajdz_wyrazenie_pola_z_baza(_SYNTETYCZNY_TS, "Cable", set(), "id")
    assert trafienie is not None
    zrodlowy_interfejs, wyrazenie = trafienie
    assert zrodlowy_interfejs == "ENMElement"
    assert wyrazenie.strip() == "string"


def test_pole_brakujace_wszedzie_zwraca_none() -> None:
    """Pole, ktorego nie ma ani na encji, ani na zadnej dostepnej bazie -> None
    (zglaszane osobno przez sprawdzenie obecnosci, nie przez ta funkcje)."""
    trafienie = guard._znajdz_wyrazenie_pola_z_baza(
        _SYNTETYCZNY_TS, "Cable", {"BranchBase"}, "nieistniejace_pole"
    )
    assert trafienie is None


def test_rozjazd_wartosci_na_polu_dziedziczonym_jest_wykrywalny() -> None:
    """Iloczyn cech (KLASA §2): pole dziedziczone WARUNKOWO x rozjazd wartosci
    unii. Nie wystarczy, ze pole zostanie ZNALEZIONE na bazie — rozwiazana
    wartosc TS musi tez realnie roznic sie od zbioru pydantic, gdy sa rozne."""
    trafienie = guard._znajdz_wyrazenie_pola_z_baza(
        _SYNTETYCZNY_TS, "Cable", {"BranchBase"}, "status"
    )
    assert trafienie is not None
    _, wyrazenie = trafienie
    wartosci_ts = guard._resolve_ts_literal_type(_SYNTETYCZNY_TS, wyrazenie)
    assert wartosci_ts == {"open", "closed"}
    wartosci_py_z_dodatkowa_wartoscia = {"open", "closed", "fault"}
    assert wartosci_ts != wartosci_py_z_dodatkowa_wartoscia


# =============================================================================
# Pozostale funkcje pomocnicze — pokrycie brzegowych ksztaltow
# =============================================================================


def test_extends_ts_brak_klauzuli() -> None:
    assert guard._extends_ts(_SYNTETYCZNY_TS, "Load") == []


def test_extends_ts_pojedyncza_baza() -> None:
    assert guard._extends_ts(_SYNTETYCZNY_TS, "Cable") == ["BranchBase"]


def test_extends_ts_wielokrotna_baza() -> None:
    zrodlo = "export interface X extends A, B {\n  pole: string;\n}\n"
    assert guard._extends_ts(zrodlo, "X") == ["A", "B"]


def test_py_literal_wartosci_prosty_literal() -> None:
    import typing

    assert guard._py_literal_wartosci(typing.Literal["a", "b"]) == {"a", "b"}


def test_py_literal_wartosci_opcjonalny_literal() -> None:
    import typing

    assert guard._py_literal_wartosci(typing.Literal["a", "b"] | None) == {"a", "b"}


def test_py_literal_wartosci_nie_literal_zwraca_none() -> None:
    assert guard._py_literal_wartosci(str) is None
    assert guard._py_literal_wartosci(int | None) is None


def test_resolve_ts_literal_type_z_null() -> None:
    assert guard._resolve_ts_literal_type(_SYNTETYCZNY_TS, "'a' | 'b' | null") == {"a", "b"}


def test_resolve_ts_literal_type_alias_wieloetapowy() -> None:
    zrodlo = "export type Podstawa = 'a' | 'b';\n" "export type Rozszerzona = Podstawa | 'c';\n"
    assert guard._resolve_ts_literal_type(zrodlo, "Rozszerzona | null") == {"a", "b", "c"}


def test_resolve_ts_literal_type_ksztalt_zlozony_zwraca_none() -> None:
    assert guard._resolve_ts_literal_type(_SYNTETYCZNY_TS, "Record<string, unknown> | null") is None


def test_resolve_ts_literal_type_pomija_komentarz_srodliniowy() -> None:
    wyrazenie = "'a' // komentarz\n  | 'b'"
    assert guard._resolve_ts_literal_type(_SYNTETYCZNY_TS, wyrazenie) == {"a", "b"}
