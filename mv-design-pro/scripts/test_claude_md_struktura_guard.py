"""Testy zapadki zgodnosci `CLAUDE.md` i `.claude/rules/` z repozytorium.

Sprawdzamy OSTROSC w obie strony (modul widmo ORAZ modul przemilczany), bo tylko
para daje gwarancje: guard, ktory widzi wylacznie nadmiar, przepusci przemilczana
warstwe `ui2/` — a wlasnie tak ten defekt przezyl trzy fale audytu.

Od karty CLAUDE-MD-ANTHROPIC (2026-11-11) drzewa leza w regulach sciezkowych
(`.claude/rules/frontend.md`, `.claude/rules/backend.md`), a guard pilnuje dwoch
nowych par: mapa regul w `CLAUDE.md` == pliki regul na dysku oraz kazdy wzorzec
`paths` trafia w plik sledzony. Iloczyn cech dla par regul: {wpis w mapie: jest,
brak} x {plik reguly: jest, brak} x {frontmatter: brak, `paths` trafny, `paths`
martwy, pole obce, `paths` pusty, niezamkniety}.

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
    assert guard.moduly_z_dokumentu(tekst, "ui", "React components —") == {
        "sld",
        "proof",
    }
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
    falszywy = tmp_path / "frontend.md"
    falszywy.write_text(_dokument("React components — N", moduly_ui, ["wyniki"]), encoding="utf-8")
    monkeypatch.setattr(
        guard,
        "SLEDZONE_WARSTWY",
        {"mv-design-pro/frontend/src/ui": (falszywy, "ui", "React components —")},
    )
    monkeypatch.setattr(guard, "moduly_z_repo", lambda _b: {"sld", "proof"})
    # Pary regul na prawdziwym drzewie sa zielone (pin `test_stan_repozytorium...`),
    # tu izolujemy wylacznie pare drzewa.
    monkeypatch.setattr(guard, "naruszenia_regul", lambda _t, _s: [])

    assert guard.main() == 1, opis
    assert oczekiwany_kod in capsys.readouterr().out, opis


# ---------------------------------------------------------------------------
# Drzewa w regulach sciezkowych (miejsce po karcie CLAUDE-MD-ANTHROPIC)
# ---------------------------------------------------------------------------


def test_drzewa_sa_czytane_z_regul_sciezkowych_a_nie_z_claude_md() -> None:
    """Zmiana miejsca, nie oslabienie: kazda sledzona warstwa ma plik regul z drzewem."""
    pliki = {baza: plik for baza, (plik, _n, _z) in guard.SLEDZONE_WARSTWY.items()}
    assert pliki["mv-design-pro/frontend/src/ui"] == guard.KATALOG_REGUL / "frontend.md"
    assert pliki["mv-design-pro/frontend/src/ui2"] == guard.KATALOG_REGUL / "frontend.md"
    assert pliki["mv-design-pro/backend/src"] == guard.KATALOG_REGUL / "backend.md"
    assert "React components —" not in guard.CLAUDE_MD.read_text(encoding="utf-8")


def test_drzewo_backendu_mowi_o_pakietach_dawniej_przemilczanych() -> None:
    tekst = (guard.KATALOG_REGUL / "backend.md").read_text(encoding="utf-8")
    moduly = guard.moduly_z_dokumentu(tekst, "src", "Kod backendu")
    assert {"werdykt", "dziedziny", "reference_engine", "catalog"} <= moduly
    # Widma sprzed 2026-11-11 nie wracaja; podkatalogi `network_model/` to drugi poziom.
    assert "compliance" not in moduly and "core" not in moduly


# ---------------------------------------------------------------------------
# Para: mapa regul w CLAUDE.md == pliki regul
# ---------------------------------------------------------------------------


def _korzen_z_regulami(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, reguly: dict[str, str]
) -> None:
    katalog = tmp_path / ".claude" / "rules"
    katalog.mkdir(parents=True)
    for nazwa, tresc in reguly.items():
        (katalog / nazwa).parent.mkdir(parents=True, exist_ok=True)
        (katalog / nazwa).write_text(tresc, encoding="utf-8")
    monkeypatch.setattr(guard, "KORZEN", tmp_path)
    monkeypatch.setattr(guard, "KATALOG_REGUL", katalog)
    monkeypatch.setattr(guard, "ignorowane", lambda _s: set())


_SLEDZONE = [
    "mv-design-pro/frontend/src/App.tsx",
    "mv-design-pro/backend/src/api/main.py",
]
_FRONT = '---\npaths:\n  - "mv-design-pro/frontend/**"\n---\n# Front\n'


@pytest.mark.parametrize(
    ("w_mapie", "na_dysku", "oczekiwany_kod"),
    [
        ({"a.md", "b.md"}, {"a.md", "b.md"}, None),
        ({"a.md", "b.md"}, {"a.md"}, "regula-widmo"),
        ({"a.md"}, {"a.md", "b.md"}, "regula-przemilczana"),
        ({"a.md"}, {"a.md", "pod/c.md"}, "regula-przemilczana"),
    ],
)
def test_mapa_regul_w_obie_strony(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    w_mapie: set[str],
    na_dysku: set[str],
    oczekiwany_kod: str | None,
) -> None:
    """Regula w podkatalogu tez jest regula (Claude Code wykrywa `.claude/rules` rekurencyjnie)."""
    _korzen_z_regulami(monkeypatch, tmp_path, {n: "# Regula\n" for n in na_dysku})
    tekst = "\n".join(f"| `.claude/rules/{n}` | zawsze | x |" for n in sorted(w_mapie))
    kody = " ".join(guard.naruszenia_regul(tekst, _SLEDZONE))
    if oczekiwany_kod is None:
        assert kody == ""
    else:
        assert oczekiwany_kod in kody


def test_pusty_katalog_regul_jest_bledem_a_nie_zielenia(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _korzen_z_regulami(monkeypatch, tmp_path, {})
    assert "pusty-skan" in " ".join(guard.naruszenia_regul("", _SLEDZONE))


# ---------------------------------------------------------------------------
# Para: wzorzec `paths` <-> plik sledzony; ksztalt frontmatter
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("tresc", "oczekiwany_kod"),
    [
        ("# Regula bez frontmatter\n", None),
        (_FRONT, None),
        ('---\npaths:\n  - "mv-design-pro/frontend/srcc/**"\n---\n', "martwy-wzorzec"),
        ('---\npaths:\n  - "x/**"\nopis:\n---\n', "pola ['opis']"),
        ("---\npaths:\n---\n", "bez ani jednego wzorca"),
        ('---\npaths:\n  - "mv-design-pro/frontend/**"\n', "bez zamykajacego"),
        ("---\npaths: mv-design-pro/**\n---\n", "nieobslugiwana linia"),
    ],
)
def test_frontmatter_iloczyn_cech(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    tresc: str,
    oczekiwany_kod: str | None,
) -> None:
    _korzen_z_regulami(monkeypatch, tmp_path, {"r.md": tresc})
    kody = " ".join(guard.naruszenia_regul("`.claude/rules/r.md`", _SLEDZONE))
    if oczekiwany_kod is None:
        assert kody == ""
    else:
        assert oczekiwany_kod in kody


@pytest.mark.parametrize(
    ("wzorzec", "sciezka", "pasuje"),
    [
        ("mv-design-pro/frontend/**", "mv-design-pro/frontend/src/App.tsx", True),
        ("mv-design-pro/frontend/**", "mv-design-pro/frontendx/a.ts", False),
        ("mv-design-pro/*.md", "mv-design-pro/PLANS.md", True),
        ("mv-design-pro/*.md", "mv-design-pro/docs/INDEX.md", False),
        ("**/*.ts", "a.ts", True),
        ("**/*.ts", "a/b/c.ts", True),
        ("src/**/*.ts", "src/x.ts", True),
        ("README.md", "README.md", True),
        ("README.md", "mv-design-pro/README.md", False),
        ("a?.md", "ab.md", True),
        ("a?.md", "a/.md", False),
    ],
)
def test_glob_paths_jak_w_claude_code(wzorzec: str, sciezka: str, pasuje: bool) -> None:
    """`*` nie przechodzi przez `/`, `**/` to zero lub wiecej katalogow."""
    assert bool(guard.wzorzec_na_regex(wzorzec).match(sciezka)) is pasuje


def test_regula_ignorowana_przez_gita_jest_naruszeniem(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Prawdziwy `git check-ignore` w tymczasowym repozytorium z `.gitignore` sprzed naprawy."""
    import subprocess

    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    (tmp_path / ".gitignore").write_text(
        ".claude/*\n!.claude/agents/\n!.claude/settings.json\n", encoding="utf-8"
    )
    katalog = tmp_path / ".claude" / "rules"
    katalog.mkdir(parents=True)
    (katalog / "r.md").write_text("# Regula\n", encoding="utf-8")
    monkeypatch.setattr(guard, "KORZEN", tmp_path)
    monkeypatch.setattr(guard, "KATALOG_REGUL", katalog)
    tekst = "`.claude/rules/r.md`"
    assert "regula-ignorowana" in " ".join(guard.naruszenia_regul(tekst, _SLEDZONE))

    (tmp_path / ".gitignore").write_text(
        ".claude/*\n!.claude/agents/\n!.claude/rules/\n", encoding="utf-8"
    )
    assert guard.naruszenia_regul(tekst, _SLEDZONE) == []


def test_kazda_regula_na_head_ma_poprawny_frontmatter_i_wpis_w_mapie() -> None:
    """Pin na prawdziwym drzewie (pary regul osobno od pary drzew)."""
    naruszenia = guard.naruszenia_regul(
        guard.CLAUDE_MD.read_text(encoding="utf-8"), guard.pliki_sledzone()
    )
    assert naruszenia == []
    assert len(guard.reguly_z_dysku(guard.KATALOG_REGUL)) >= 1
