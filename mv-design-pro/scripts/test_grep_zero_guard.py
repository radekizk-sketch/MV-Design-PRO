"""Self-test guarda grep-zero (W5-A): czerwona iniekcja na kopii drzewa + zielone realne drzewo.

Uruchomienie (z `mv-design-pro`): `python scripts/test_grep_zero_guard.py`.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from grep_zero_guard import GRUPY, ROOT, sprawdz  # noqa: E402

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


def test_realne_drzewo_jest_zielone() -> None:
    for grupa in GRUPY:
        naruszenia = sprawdz(ROOT, grupa)
        assert naruszenia == [], "\n".join(naruszenia)


if __name__ == "__main__":
    test_czerwona_iniekcja_kazdego_wzorca()
    test_realne_drzewo_jest_zielone()
    print("test_grep_zero_guard: OK")
