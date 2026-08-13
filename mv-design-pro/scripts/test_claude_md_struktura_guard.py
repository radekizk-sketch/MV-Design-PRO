"""Testy zapadki zgodnosci `CLAUDE.md` z repozytorium.

Sprawdzamy OSTROSC w obie strony (modul widmo ORAZ modul przemilczany), bo tylko
para daje gwarancje: guard, ktory widzi wylacznie nadmiar, przepusci przemilczana
warstwe `ui2/` — a wlasnie tak ten defekt przezyl trzy fale audytu.

Nie testujemy trafnosci opisu po `#` — guard jej nie sprawdza i mowi to wprost.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import claude_md_struktura_guard as guard  # noqa: E402


def _dokument(naglowek_ui: str, moduly_ui: list[str], moduly_ui2: list[str]) -> str:
    """Minimalne drzewo w formacie `CLAUDE.md` — z `docs/ui/` PRZED blokiem frontendu.

    Ten wczesniejszy `ui/` jest w fiksturze CELOWO: pierwsza wersja guarda
    kotwiczyla sie po samej nazwie i trafiala wlasnie w niego, meldujac pusty
    blok. Bez tego wiersza test nie odroznilby kotwicy dobrej od zlej.
    """
    linie = [
        "```",
        "MV-Design-PRO/",
        "├── docs/",
        "│   ├── ui/                    # UI contracts (root-level)",
        "│   └── sld/",
        "├── mv-design-pro/",
        "│   ├── frontend/",
        "│   │   ├── src/",
        f"│   │   │   ├── ui/               # {naglowek_ui}",
    ]
    linie += [f"│   │   │   │   ├── {m}/" for m in moduly_ui]
    linie.append("│   │   │   └── ui2/              # Warstwa UI programu 2026-07 — N modulow")
    linie += [f"│   │   │       ├── {m}/" for m in moduly_ui2]
    linie += ["│   │   └── e2e/", "```"]
    return "\n".join(linie)


def test_kotwica_omija_wczesniejszy_blok_ui_w_dokumentach() -> None:
    """Znacznik, nie sama nazwa — inaczej mierzymy `docs/ui/` zamiast frontendu."""
    tekst = _dokument("React components — 2 moduly", ["sld", "proof"], ["wyniki"])
    assert guard.moduly_z_dokumentu(tekst, "ui", "React components —") == {"sld", "proof"}
    assert guard.moduly_z_dokumentu(tekst, "ui2", "Warstwa UI programu") == {"wyniki"}


def test_blok_konczy_sie_na_powrocie_drzewa_na_wyzszy_poziom() -> None:
    """`ui2/` nie moze wpasc do listy modulow `ui/` — to rodzenstwo, nie dziecko."""
    tekst = _dokument("React components — 1 modul", ["sld"], ["wyniki", "kreatory"])
    assert "ui2" not in guard.moduly_z_dokumentu(tekst, "ui", "React components —")


def test_katalogi_testowe_sa_pomijane_po_obu_stronach() -> None:
    tekst = _dokument("React components — 2 moduly", ["sld", "__tests__"], ["wyniki"])
    assert guard.moduly_z_dokumentu(tekst, "ui", "React components —") == {"sld"}


def test_brak_znacznika_jest_bledem_a_nie_pustym_zbiorem() -> None:
    """Zmiana opisu warstwy ma ZATRZYMAC guarda, nie uczynic go slepym."""
    tekst = _dokument("Zupelnie inny opis", ["sld"], ["wyniki"])
    with pytest.raises(SystemExit) as e:
        guard.moduly_z_dokumentu(tekst, "ui", "React components —")
    assert "brak-bloku" in str(e.value)


def test_moduly_z_repo_czyta_git_a_nie_dysk() -> None:
    """Zrodlem prawdy jest `git ls-files` — katalog bez plikow sledzonych nie liczy sie."""
    moduly = guard.moduly_z_repo("mv-design-pro/frontend/src/ui2")
    assert "wyniki" in moduly and "kreatory" in moduly
    assert "__tests__" not in moduly
    # Katalogi skasowane w fali 2026-08 nie moga wracac przez odczyt z dysku.
    assert "results-workspace" not in guard.moduly_z_repo("mv-design-pro/frontend/src/ui")


def test_stan_repozytorium_jest_zgodny_z_dokumentem() -> None:
    """Pin wlasciwy: na HEAD guard musi byc ZIELONY (RC=0)."""
    assert guard.main() == 0


@pytest.mark.parametrize(
    ("opis", "moduly_ui", "oczekiwany_kod"),
    [
        ("modul widmo w dokumencie", ["sld", "modul-ktorego-nie-ma"], "modul-widmo"),
        ("modul przemilczany w repo", ["sld"], "modul-przemilczany"),
    ],
)
def test_ostrosc_w_obie_strony(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    opis: str,
    moduly_ui: list[str],
    oczekiwany_kod: str,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Nadmiar i niedobor MUSZA dawac RC=1 — jedna strona pary to polowa straznika."""
    falszywy = tmp_path / "CLAUDE.md"
    falszywy.write_text(_dokument("React components — N", moduly_ui, ["wyniki"]), encoding="utf-8")
    monkeypatch.setattr(guard, "CLAUDE_MD", falszywy)
    monkeypatch.setattr(
        guard,
        "SLEDZONE_WARSTWY",
        {"mv-design-pro/frontend/src/ui": ("ui", "React components —")},
    )
    monkeypatch.setattr(guard, "moduly_z_repo", lambda _b: {"sld", "proof"})

    assert guard.main() == 1, opis
    assert oczekiwany_kod in capsys.readouterr().out, opis
