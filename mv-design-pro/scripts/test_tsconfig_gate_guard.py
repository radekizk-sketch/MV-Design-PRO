"""Testy guardu zasięgu bramki typów (karta TYPY-POZA-BRAMKA).

Testy są SZYBKIE i IZOLOWANE: ćwiczą regułę i czytanie konfiguracji, nie
uruchamiają `tsc` (pełny pomiar trwa ~100 s i wymaga `node_modules` — to robota
guarda w CI, nie jego testu jednostkowego).

POKRYCIE — ILOCZYN CECH, nie przykład z karty
---------------------------------------------
{plik w `src` · w `scripts` · w `e2e` · w korzeniu frontendu}
  x {zwykły moduł · plik `*.test.ts(x)` · plik pod `__tests__/`}
  x {ścieżka z segmentem wyglądającym jak komentarz (`/**/`) · zwykła}

KOMBINACJE ŚWIADOMIE NIEPOKRYTE (i dlaczego):
  * {pomiar `tsc`} x {cokolwiek} — wymaga `node_modules` i minuty czasu; ćwiczy
    go bezpośrednio bieg guarda w CI. Testowane jest za to PARSOWANIE wyjścia
    (`WZORZEC_BLEDU`) i klasyfikacja pliku do/spoza bramki, czyli cała logika,
    którą guard nakłada na to wyjście.
  * {plik `.mjs` w `scripts/`} — zadeklarowany w nagłówku guarda jako forma
    NIEWYKRYWALNA; test `test_pliki_mjs_sa_poza_skanem` PRZYPINA tę granicę,
    żeby nikt nie uwierzył w szerszą obietnicę.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Guard i jego test leżą w `scripts/`, który nie jest pakietem. Przy uruchomieniu
# RAZEM z suitą backendu pytest nie dokłada tego katalogu do `sys.path`.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import tsconfig_gate_guard as guard  # noqa: E402

# ---------------------------------------------------------------------------
# Czytanie konfiguracji (JSONC)
# ---------------------------------------------------------------------------


def test_jsonc_nie_zjada_globa_wygladajacego_jak_komentarz(tmp_path: Path) -> None:
    """REGRESJA ZMIERZONA: `src/**/__tests__/**/*` zawiera `/**/`, czyli poprawny
    komentarz blokowy. Pierwsza wersja guarda zdejmowała komentarze wyrażeniem
    regularnym i meldowała, że z `exclude` zniknęły wpisy, które w pliku stały —
    czyli wyrocznia kłamała o dokumencie, który czytała."""
    plik = tmp_path / "tsconfig.json"
    plik.write_text(
        """{
  // komentarz liniowy
  "include": ["src", "scripts"],
  /* komentarz blokowy */
  "exclude": ["src/**/__tests__/**/*", "src/**/*.test.ts"]
}""",
        encoding="utf-8",
    )
    konfiguracja = guard.wczytaj_jsonc(plik)
    assert konfiguracja["exclude"] == ["src/**/__tests__/**/*", "src/**/*.test.ts"]
    assert konfiguracja["include"] == ["src", "scripts"]


def test_jsonc_nie_zdejmuje_ukosnikow_z_napisow(tmp_path: Path) -> None:
    """Napis `https://…` niesie `//`, a nie komentarz."""
    plik = tmp_path / "tsconfig.json"
    plik.write_text('{"a": "https://example.test/x", "b": 1}', encoding="utf-8")
    assert guard.wczytaj_jsonc(plik)["a"] == "https://example.test/x"


# ---------------------------------------------------------------------------
# Klasyfikacja pliku do / spoza bramki — iloczyn {korzeń} x {rodzaj pliku}
# ---------------------------------------------------------------------------


def test_w_bramce_zwykle_moduly_src_i_scripts() -> None:
    assert guard.w_bramce("src/ui/sld/v3/scene/buildScene.ts")
    assert guard.w_bramce("scripts/render_schemat10_r2.tsx")


def test_poza_bramka_testy_niezaleznie_od_zapisu() -> None:
    assert not guard.w_bramce("src/ui/sld/v3/scene/__tests__/buildScene.sheetRows.test.ts")
    assert not guard.w_bramce("src/ui/proof/TraceViewer.test.tsx")
    # Fikstura BEZ przyrostka `.test.` — poza bramką WYŁĄCZNIE dzięki katalogowi.
    assert not guard.w_bramce("src/ui/sld/v3/scene/__tests__/fixtures/w1MatrixVariants.ts")


def test_poza_bramka_e2e_i_korzen_frontendu() -> None:
    assert not guard.w_bramce("e2e/critical-run-flow.spec.ts")
    assert not guard.w_bramce("playwright.config.ts")
    assert not guard.w_bramce("vite.config.ts")


# ---------------------------------------------------------------------------
# Parsowanie wyjścia `tsc`
# ---------------------------------------------------------------------------


def test_wzorzec_bledu_lapie_sciezke_i_pomija_szum() -> None:
    dopasowanie = guard.WZORZEC_BLEDU.match(
        "src/ui/sld/core/layoutPipeline.ts(1318,30): error TS2454: Variable used."
    )
    assert dopasowanie is not None
    assert dopasowanie.group("plik") == "src/ui/sld/core/layoutPipeline.ts"
    # Wiersz kontynuacji komunikatu NIE jest osobnym błędem.
    assert guard.WZORZEC_BLEDU.match("  Type 'undefined' is not assignable.") is None
    assert guard.WZORZEC_BLEDU.match("Found 604 errors in 162 files.") is None


# ---------------------------------------------------------------------------
# Zgodność zamrożeń guarda z realnym `tsconfig.json` repozytorium
# ---------------------------------------------------------------------------


def test_zamrozenia_zgadzaja_sie_z_plikiem_repozytorium() -> None:
    """Guard i `tsconfig.json` MUSZĄ mówić to samo — dwa niezależne źródła prawdy,
    które „dziś się zgadzają”, są defektem czekającym na dane brzegowe
    (CLAUDE.md, KLASA-NIE-INSTANCJA pkt 3)."""
    konfiguracja = guard.wczytaj_jsonc(guard.TSCONFIG)
    assert sorted(konfiguracja["include"]) == sorted(guard.WYMAGANY_INCLUDE)
    assert sorted(konfiguracja["exclude"]) == sorted(guard.DOPUSZCZONE_WYKLUCZENIA)
    for nazwa, oczekiwana in guard.WYMAGANE_OPCJE.items():
        assert konfiguracja["compilerOptions"][nazwa] == oczekiwana


def test_kazdy_korzen_zrodel_jest_objety_albo_odstawiony() -> None:
    """Ta sama reguła co w guardzie, ale sprawdzana BEZ uruchamiania `tsc` —
    dzięki temu klasa „nowy katalog poza include” zapala się już w `pytest`."""
    korzenie = guard.korzenie_zrodel(guard.pliki_zrodlowe())
    assert korzenie, "PUSTY SKAN JEST BLEDEM"
    nieobjete = sorted(k for k in korzenie if k not in guard.WYMAGANY_INCLUDE)
    assert nieobjete == sorted(guard.POZA_BRAMKA)


def test_odstawione_maja_uzasadnienie_merytoryczne() -> None:
    """Deklaracja bez treści jest fałszywą pewnością (CLAUDE.md, KLASA pkt 4)."""
    for korzen, powod in guard.POZA_BRAMKA.items():
        assert len(powod) > 80, f"{korzen}: uzasadnienie za krótkie, by cokolwiek znaczyć"
        assert "poza zakresem" not in powod.lower()


# ---------------------------------------------------------------------------
# Granice zadeklarowane w nagłówku guarda — PRZYPIĘTE, nie obiecane
# ---------------------------------------------------------------------------


def test_pliki_mjs_sa_poza_skanem() -> None:
    """Nagłówek guarda deklaruje formę 3: `.mjs` w `scripts/` NIE jest sprawdzany.
    Ten test przypina tę granicę — obietnica bez testu jest groźniejsza niż sam
    defekt, bo wyłącza czujność."""
    pliki = guard.pliki_zrodlowe()
    assert all(p.suffix in (".ts", ".tsx") for p in pliki)
    mjs = list((guard.FRONTEND / "scripts").glob("*.mjs"))
    assert mjs, "skrypty .mjs zniknely — zaktualizuj nagłówek guarda (forma 3)"
    assert not any(p.suffix == ".mjs" for p in pliki)


def test_katalogi_narzedziowe_nie_wchodza_do_skanu() -> None:
    pliki = guard.pliki_zrodlowe()
    assert not any("node_modules" in p.parts for p in pliki)
    assert len(pliki) >= guard.MIN_PLIKOW_ZRODLOWYCH
