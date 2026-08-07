"""Pin sprawdzenia `check_sld_audit_row_status` w `docs_guard` (2026-08-07).

INTENCJA. Dokument przekazania nadzoru definiuje „100% uruchomienia" i w pkt 3
deklaruje: żaden wiersz znaleziska audytu SLD nie zostaje bez statusu. Do
2026-08-07 była to deklaracja bez sprawdzenia — pomiar znalazł DZIEWIĘĆ wierszy
bez znacznika (wszystkie okazały się obserwacjami pozytywnymi, więc nie było
czego zamykać) oraz DWA wiersze niosące status w zapisie bez polskich znaków,
przez co wyszukanie formy kanonicznej ich nie znajdowało. Przy 46 wierszach nikt
nie przejdzie tabeli ręcznie drugi raz, a deklaracja bez strażnika wyłącza
czujność (reguła KLASA §4: deklaracja bez testu = fałszywa pewność).

Ten plik przypina OBA końce sprawdzenia: że jest zielone na HEAD i że REAGUJE.
Sam zielony wynik nie odróżnia „wszystkie wiersze mają status" od „skan nic nie
widzi", dlatego druga i trzecia asercja wstrzykują regresję.
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


def _audyt(tresc: str, katalog: Path) -> Path:
    """Kopia dokumentu audytu pod ścieżką, której szuka guard."""
    docelowy = katalog / guard.SLD_AUDIT_DOC
    docelowy.parent.mkdir(parents=True, exist_ok=True)
    docelowy.write_text(tresc, encoding="utf-8")
    return docelowy


def test_audyt_na_head_ma_status_w_kazdym_wierszu() -> None:
    """Stan faktyczny repozytorium: 0 wierszy znaleziska bez statusu."""
    assert guard.check_sld_audit_row_status() == []


def test_wiersz_bez_statusu_jest_wskazany_po_identyfikatorze(tmp_path: Path) -> None:
    """Regresja: znalezisko dopisane bez znacznika -> naruszenie z nazwą wiersza.

    Wiersze wypełniające do progu MIN mają status, więc czerwień pochodzi
    WYŁĄCZNIE od wiersza `X-99` — a nie od zapadki na pusty skan.
    """
    wypelniacz = "\n".join(
        f"| C-{i} | **[ZAMKNIĘTE 2026-08-07]** cokolwiek | pomiar | CAD | **1** | wniosek |"
        for i in range(guard.SLD_AUDIT_MIN_ROWS)
    )
    _audyt(
        f"{wypelniacz}\n| X-99 | **Coś się psuje.** Bez znacznika. | pomiar | CAD | **3** | wniosek |\n",
        tmp_path,
    )
    naruszenia = guard.check_sld_audit_row_status(tmp_path)
    assert len(naruszenia) == 1
    assert "X-99" in naruszenia[0]
    assert "bez statusu" in naruszenia[0]


def test_status_w_kolumnie_wniosku_nie_liczy_sie_za_status_wiersza(tmp_path: Path) -> None:
    """Status MUSI stać w opisie znaleziska, nie gdziekolwiek w wierszu.

    Dokładnie ta pułapka przewróciła pierwszy, ręczny przegląd tabeli: skan po
    całym wierszu uznał za zamknięte dwa wiersze, w których słowo „ZAMKNIĘTE"
    stało w kolumnie wniosku, a opis znaleziska statusu nie miał.
    """
    wypelniacz = "\n".join(
        f"| C-{i} | **[ZAMKNIĘTE 2026-08-07]** cokolwiek | pomiar | CAD | **1** | wniosek |"
        for i in range(guard.SLD_AUDIT_MIN_ROWS)
    )
    _audyt(
        f"{wypelniacz}\n| X-98 | **Opis bez statusu.** | pomiar | CAD | **3** | ZAMKNIĘTE kartą S9-5 |\n",
        tmp_path,
    )
    naruszenia = guard.check_sld_audit_row_status(tmp_path)
    assert len(naruszenia) == 1
    assert "X-98" in naruszenia[0]


def test_zmiana_formatu_tabeli_jest_bledem_a_nie_cisza(tmp_path: Path) -> None:
    """Zapadka: skan, który przestał widzieć wiersze, melduje to zamiast milczeć."""
    _audyt("| znalezisko C-1 | opis bez znacznika | pomiar | CAD | **3** | wniosek |\n", tmp_path)
    naruszenia = guard.check_sld_audit_row_status(tmp_path)
    assert len(naruszenia) == 1
    assert "0 wierszy" in naruszenia[0]


def test_brak_dokumentu_audytu_jest_naruszeniem(tmp_path: Path) -> None:
    """Usunięcie dokumentu nie może przechodzić jako „zero naruszeń"."""
    naruszenia = guard.check_sld_audit_row_status(tmp_path)
    assert len(naruszenia) == 1
    assert "nie da się odczytać" in naruszenia[0]
