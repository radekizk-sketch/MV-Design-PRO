"""Self-test guarda grep-zero (W5-A): czerwona iniekcja na kopii drzewa + zielone realne drzewo.

Uruchomienie (z `mv-design-pro`): `python scripts/test_grep_zero_guard.py`.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import re  # noqa: E402

import pytest  # noqa: E402
from grep_zero_guard import GRUPY, ROOT, load_config_lines, sprawdz, wymagany_literal  # noqa: E402

INIEKCJE_KOD: tuple[tuple[str, str], ...] = (
    ("backend/src/enm/x.py", 'system = sub.meta["nn_earthing_system"]\n'),
    ("backend/src/enm/y.py", "if bus.grounding is not None:\n    pass\n"),
    ("backend/src/application/z.py", '_DEFAULT_SYSTEM = "TN-C-S"\n'),
    ("frontend/src/ui/a.ts", "const g = bus?.grounding ?? null;\n"),
    ("frontend/src/ui/b.ts", "export type GpzGroundingType = 'solid_grounded';\n"),
    ("frontend/src/ui/c.tsx", "import { EarthingBadge } from './EarthingBadge';\n"),
    ("backend/tests/t.py", "fakty(neutral_grounding_mode='cewka_petersena')\n"),
)


def _drzewo_z_konfiguracja(tmp: Path) -> None:
    (tmp / "config").mkdir()
    for grupa in GRUPY:
        for nazwa in ("patterns", "active_paths", "allowlist"):
            src = ROOT / "config" / f"grep_zero_{grupa}{nazwa}.txt"
            (tmp / "config" / src.name).write_text(
                src.read_text(encoding="utf-8"), encoding="utf-8"
            )
    for rel in (
        (ROOT / "config" / "grep_zero_kod_active_paths.txt")
        .read_text(encoding="utf-8")
        .splitlines()
    ):
        rel = rel.strip()
        if rel and not rel.startswith("#"):
            (tmp / rel).mkdir(parents=True, exist_ok=True)
    for rel in (
        (ROOT / "config" / "grep_zero_active_paths.txt").read_text(encoding="utf-8").splitlines()
    ):
        rel = rel.strip()
        if rel and not rel.startswith("#"):
            cel = tmp / rel
            cel.parent.mkdir(parents=True, exist_ok=True)
            cel.write_text("czysto\n", encoding="utf-8")


def test_czerwona_iniekcja_kazdego_wzorca() -> None:
    with tempfile.TemporaryDirectory() as katalog:
        tmp = Path(katalog)
        _drzewo_z_konfiguracja(tmp)
        assert sprawdz(tmp, "kod_") == [], "czyste drzewo ma być zielone"
        for rel, tresc in INIEKCJE_KOD:
            plik = tmp / rel
            plik.parent.mkdir(parents=True, exist_ok=True)
            plik.write_text(tresc, encoding="utf-8")
            naruszenia = sprawdz(tmp, "kod_")
            assert any(
                rel in n for n in naruszenia
            ), f"iniekcja {rel!r} nie została wykryta: {naruszenia}"
            plik.unlink()
        # Allowlista: moduł migracji MOŻE znać stary klucz.
        plik = tmp / "backend/src/enm/uziemienie.py"
        plik.write_text(
            'KLUCZ = "nn_earthing_system"\nmeta["nn_earthing_system"]\n', encoding="utf-8"
        )
        assert sprawdz(tmp, "kod_") == []
        plik.unlink()
        # Iniekcja spoza allowlisty na tej samej ścieżce-rodzicu jest czerwona.
        plik = tmp / "backend/src/enm/uziemienie_2.py"
        plik.write_text('meta["nn_earthing_system"]\n', encoding="utf-8")
        assert sprawdz(tmp, "kod_")
        plik.unlink()


def test_czerwona_iniekcja_w61() -> None:
    """Karta W6-1 SS0 p.8: iniekcja skasowanego `load_profile_ref` jest czerwona,
    a trzy fixtury SLD na allowliście zostają zielone (uzasadnienie w pliku
    allowlisty)."""
    with tempfile.TemporaryDirectory() as katalog:
        tmp = Path(katalog)
        _drzewo_z_konfiguracja(tmp)
        assert sprawdz(tmp, "w61_") == [], "czyste drzewo ma być zielone"

        plik = tmp / "backend/src/enm/domain_operations_v3.py"
        plik.parent.mkdir(parents=True, exist_ok=True)
        plik.write_text('"load_profile_ref": payload.get("load_profile_ref"),\n', encoding="utf-8")
        naruszenia = sprawdz(tmp, "w61_")
        assert any(
            "domain_operations_v3.py" in n for n in naruszenia
        ), f"iniekcja nie została wykryta: {naruszenia}"
        plik.unlink()

        # Allowlista: fixtury SLD sprzed kasacji zostają zielone.
        plik = tmp / "frontend/src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json"
        plik.parent.mkdir(parents=True, exist_ok=True)
        plik.write_text('{"meta": {"load_profile_ref": null}}\n', encoding="utf-8")
        assert sprawdz(tmp, "w61_") == []
        plik.unlink()


@pytest.mark.parametrize(
    ("wzorzec", "literal"),
    [
        # literal najwyzszego poziomu, przed nim i za nim elementy nieliteralne
        (r"\bload_profile_ref\b", "load_profile_ref"),
        # grupa opcjonalna z literalem — jej tresc NIE jest wymagana
        (r"\b(ab_|cd_)?pole_x\s*[:=]", "pole_x"),
        # powtorzenie: `\??` i `x*` nie sa wymagane, `\.` jest literalem kropki
        (r"\b(bus|b)\??\.grounding\b", ".grounding"),
        (r"abx*cd", "ab"),
        # alternatywa na najwyzszym poziomie — zaden literal nie jest wymagany
        (r"alfa|beta", None),
        (r"(alfa|beta)", None),
        # klasa znakow i dowolny znak przerywaja ciag
        (r"ab[cd]efg", "efg"),
        (r"ab.cdef", "cdef"),
        # bez rozroznienia wielkosci liter literal nie jest filtrem
        (r"(?i)load_profile_ref", None),
        (r"\w+", None),
    ],
)
def test_wymagany_literal(wzorzec: str, literal: str | None) -> None:
    assert wymagany_literal(wzorzec) == literal


_POLA = "field" + "_specs"

#: Teksty dopasowan z iloczynu cech: kazda galaz alternatywy wzorcow konfiguracji, opcjonalny
#: przedrostek obecny/nieobecny, cudzyslow pojedynczy/podwojny, odstep przed `=`/`:`.
_DOPASOWANIA = (
    *INIEKCJE_KOD,
    # nazwa dawnego nosnika pol skladana z czesci — pilnuje jej `meta_field_specs_resurrection_guard`
    ("x", 'meta["' + _POLA + '"]'),
    ("x", "meta['nn_" + _POLA + "']"),
    ("x", '"switchgear_' + _POLA + '" : 1'),
    ("x", "nn_" + _POLA + " = 1"),
    ("x", "obj.switchgear_" + _POLA),
    ("x", "szynaSN?.grounding"),
    ("x", "b.grounding"),
    ("x", "neutral_grounding_mode = 'rezystor'"),
    ("x", "collect_bays ("),
    ("x", "_auto_populate_types"),
    ("x", "AutoPopulateX"),
    ("x", "/api/catalog/auto-populate"),
    ("x", " inverter-types"),
    ("x", "'nn_earthing_system':"),
    ("x", "nn_earthing_system = 1"),
)


def test_kazde_dopasowanie_wzorca_zawiera_jego_literal() -> None:
    """Filtr literalu jest warunkiem KONIECZNYM: kazde dopasowanie kazdego wzorca
    konfiguracji (wszystkie grupy) zawiera literal wyznaczony dla wzorca — inaczej
    `sprawdz` pominalby plik z naruszeniem. Kazdy wzorzec z literalem ma tu dopasowanie."""
    wzorce = [
        w
        for grupa in GRUPY
        for w in load_config_lines(ROOT / "config" / f"grep_zero_{grupa}patterns.txt")
    ]
    bez_przykladu = []
    for wzorzec in wzorce:
        literal = wymagany_literal(wzorzec)
        if literal is None:
            continue
        trafienia = [m.group(0) for _, tekst in _DOPASOWANIA for m in re.finditer(wzorzec, tekst)]
        if not trafienia and not re.search(wzorzec, literal):
            bez_przykladu.append(wzorzec)
        for trafienie in trafienia + ([literal] if re.search(wzorzec, literal) else []):
            assert literal in trafienie, (wzorzec, literal, trafienie)
    # wzorce literalne bez przykladu w `_DOPASOWANIA` dopasowuja sam swoj literal (nazwa
    # pliku, symbol) — ten przypadek pokrywa `re.search(wzorzec, literal)` wyzej
    assert bez_przykladu == [], bez_przykladu


def test_realne_drzewo_jest_zielone() -> None:
    for grupa in GRUPY:
        naruszenia = sprawdz(ROOT, grupa)
        assert naruszenia == [], "\n".join(naruszenia)


if __name__ == "__main__":
    test_czerwona_iniekcja_kazdego_wzorca()
    test_czerwona_iniekcja_w61()
    test_realne_drzewo_jest_zielone()
    print("test_grep_zero_guard: OK")
