#!/usr/bin/env python3
"""Testy wlasne `ui_math_guard.py` (karta V12.7 §0.11/§0.12).

Pokrywaja: piec wzorcow ASCII-matematyki osobno (pozytyw/negatyw), dwie
poprawki precyzji skanu (usuniecie interpolacji `${...}` z template literali
TS, wylaczenie docstringow Pythona), mechanizm `WYJATKI_ZNANE` (wylaczenie z
PIN + zapadke swiezosci — ten sam wzorzec co
`no_raw_ids_in_ui_guard.check_excluded_relative_files_freshness`) oraz brzegi
`main()` (PIN przekroczony/dotrzymany, brakujacy katalog/plik).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ui_math_guard as guard  # noqa: E402

# ---------------------------------------------------------------------------
# _usun_interpolacje — kod JS/TS w `${...}` znika, balansujac klamry.
# ---------------------------------------------------------------------------


def test_usun_interpolacje_usuwa_prosty_kod() -> None:
    assert guard._usun_interpolacje("${v * 100} %") == " %"


def test_usun_interpolacje_balansuje_zagniezdzone_klamry() -> None:
    wejscie = "wartosc: ${foo({a: 1, b: 2})} koniec"
    assert guard._usun_interpolacje(wejscie) == "wartosc:  koniec"


def test_usun_interpolacje_bez_interpolacji_jest_noop() -> None:
    assert guard._usun_interpolacje("zwykly tekst bez kodu") == "zwykly tekst bez kodu"


def test_usun_interpolacje_wiele_segmentow() -> None:
    wejscie = "${a} · ${b} kV"
    assert guard._usun_interpolacje(wejscie) == " ·  kV"


# ---------------------------------------------------------------------------
# _jest_juz_latex — komenda `\...` albo pelne `$...$`/`$$...$$`.
# ---------------------------------------------------------------------------


def test_jest_juz_latex_wykrywa_komende() -> None:
    assert guard._jest_juz_latex(r"\mathrm{THD}_U \leq 8\%") is True


def test_jest_juz_latex_wykrywa_dolar_inline() -> None:
    assert guard._jest_juz_latex("$x^2$") is True


def test_jest_juz_latex_wykrywa_dolar_block() -> None:
    assert guard._jest_juz_latex("$$I^2 t \\le k^2 S^2$$") is True


def test_jest_juz_latex_odrzuca_proze() -> None:
    assert guard._jest_juz_latex("zwykly opis bez formuly") is False


# ---------------------------------------------------------------------------
# _dopasowania — piec wzorcow, kazdy osobno (pozytyw), plus negatyw dla LaTeX.
# ---------------------------------------------------------------------------


def test_dopasowania_wykrywa_nierownosc_ascii() -> None:
    trafienia = guard._dopasowania("U_dot <= U_dop")
    assert any("<='/'>='" in t or "<=" in t for t in trafienia)


def test_dopasowania_wykrywa_sqrt_ascii() -> None:
    trafienia = guard._dopasowania("wynik = sqrt(x)")
    assert any("sqrt(" in t for t in trafienia)


def test_dopasowania_wykrywa_potege_ascii_poza_latex() -> None:
    trafienia = guard._dopasowania("wspolczynnik x^2 bez oznaczenia")
    assert any("^2" in t for t in trafienia)


def test_dopasowania_nie_wykrywa_potegi_w_latex() -> None:
    assert guard._dopasowania(r"\mathrm{I}^2\,t") == []


def test_dopasowania_wykrywa_mnozenie_ascii() -> None:
    trafienia = guard._dopasowania("wynik = a * b")
    assert any("cdot" in t for t in trafienia)


def test_dopasowania_nie_wykrywa_mnozenia_w_latex() -> None:
    assert guard._dopasowania(r"A \cdot B = C") == []


def test_dopasowania_wykrywa_indeks_bez_mathrm() -> None:
    trafienia = guard._dopasowania("U_dot,dop = wartosc")
    assert any("mathrm" in t for t in trafienia)


def test_dopasowania_nie_wykrywa_indeksu_w_mathrm() -> None:
    assert guard._dopasowania(r"U_{\mathrm{dot,dop}}") == []


def test_dopasowania_czysta_proza_bez_trafien() -> None:
    assert guard._dopasowania("w kazdym wezle modelu, dla sieci SN i nN") == []


def test_dopasowania_nierownosc_sprawdzana_nawet_w_latex() -> None:
    # `<=`/`>=` NIGDY nie sa poprawnym LaTeX-em — sprawdzane zawsze, nawet gdy
    # string ma juz komende `\...` obok (linia mieszana, zdarza sie w prozie).
    trafienia = guard._dopasowania(r"\mathrm{X} <= \mathrm{Y}")
    assert any("<=" in t for t in trafienia)


# ---------------------------------------------------------------------------
# skanuj_ts — plik na dysku (tmp_path), w tym dwie poprawki precyzji.
# ---------------------------------------------------------------------------


def test_skanuj_ts_wykrywa_ascii_w_zwyklym_stringu(tmp_path: Path) -> None:
    plik = tmp_path / "Przyklad.tsx"
    plik.write_text("const opis = 'U_dot <= U_dot,dop';\n", encoding="utf-8")

    wyniki = guard.skanuj_ts(plik)

    assert len(wyniki) >= 1


def test_skanuj_ts_ignoruje_kod_w_interpolacji_template_literal(tmp_path: Path) -> None:
    plik = tmp_path / "Przyklad.tsx"
    plik.write_text(
        "const etykieta = `${Math.round(v * 100)} %`;\n",
        encoding="utf-8",
    )

    wyniki = guard.skanuj_ts(plik)

    assert wyniki == []


def test_skanuj_ts_wykrywa_ascii_w_czesci_literalnej_template_literal(tmp_path: Path) -> None:
    plik = tmp_path / "Przyklad.tsx"
    plik.write_text(
        "const opis = `wartosc ${x} spelnia U_dot <= U_dot,dop`;\n",
        encoding="utf-8",
    )

    wyniki = guard.skanuj_ts(plik)

    assert len(wyniki) >= 1


def test_skanuj_ts_pomija_linie_komentarza(tmp_path: Path) -> None:
    plik = tmp_path / "Przyklad.tsx"
    plik.write_text(
        "// przyklad w komentarzu: 'U_dot <= U_dot,dop'\n" "const x = 1;\n",
        encoding="utf-8",
    )

    wyniki = guard.skanuj_ts(plik)

    assert wyniki == []


# ---------------------------------------------------------------------------
# skanuj_py — plik na dysku, w tym wylaczenie docstringow.
# ---------------------------------------------------------------------------


def test_skanuj_py_ignoruje_docstring_modulu(tmp_path: Path) -> None:
    plik = tmp_path / "przyklad.py"
    plik.write_text(
        '"""Opis z ASCII: U_dot <= U_dot,dop w komentarzu modulu."""\n' "wartosc = 1\n",
        encoding="utf-8",
    )

    wyniki = guard.skanuj_py(plik)

    assert wyniki == []


def test_skanuj_py_ignoruje_docstring_funkcji(tmp_path: Path) -> None:
    plik = tmp_path / "przyklad.py"
    plik.write_text(
        "def f() -> None:\n"
        '    """Zapas: U_dot <= U_dot,dop (komentarz, nie tekst UI)."""\n'
        "    return None\n",
        encoding="utf-8",
    )

    wyniki = guard.skanuj_py(plik)

    assert wyniki == []


def test_skanuj_py_wykrywa_zwykly_literal_string(tmp_path: Path) -> None:
    plik = tmp_path / "przyklad.py"
    plik.write_text(
        "def f() -> str:\n" "    return 'U_dot <= U_dot,dop'\n",
        encoding="utf-8",
    )

    wyniki = guard.skanuj_py(plik)

    assert len(wyniki) >= 1


def test_skanuj_py_nie_wybucha_na_niedomknietym_stringu(tmp_path: Path) -> None:
    # `tokenize.generate_tokens` zglasza `tokenize.TokenError` na niedomknietym
    # literale — regresja nazwy wyjatku (`TokenizeError` nie istnieje w module
    # `tokenize`, mypy: "Module has no attribute") kiedys zamieniala ten
    # przypadek w AttributeError zamiast pustego wyniku.
    plik = tmp_path / "zepsuty.py"
    plik.write_text("wartosc = 'niedomkniety string\n", encoding="utf-8")

    assert guard.skanuj_py(plik) == []


def test_skanuj_py_docstring_nie_maskuje_zwyklego_literalu_pod_nim(tmp_path: Path) -> None:
    plik = tmp_path / "przyklad.py"
    plik.write_text(
        '"""Docstring modulu bez ASCII-matematyki."""\n' "wartosc = 'U_dot <= U_dot,dop'\n",
        encoding="utf-8",
    )

    wyniki = guard.skanuj_py(plik)

    assert len(wyniki) >= 1


# ---------------------------------------------------------------------------
# WYJATKI_ZNANE — wylaczenie z PIN + zapadka swiezosci (osierocenie).
# ---------------------------------------------------------------------------


def test_wyjatki_znane_zaden_wpis_nie_jest_osierocony() -> None:
    # Kazdy wpis realny musi ISTNIEC i nadal PRODUKOWAC trafienie w swojej linii —
    # inaczej jest martwy i nalezy go usunac. 2026-09-23: jedyny wpis
    # (v126_katalog.py:444, symbol karty SSCI) zniknal z wycofana karta — zbior pusty
    # jest stanem zmierzonym, nie cichym wylaczeniem testu.
    assert guard.WYJATKI_ZNANE == frozenset()
    assert guard.wyjatki_osierocone(guard.ROOT) == []


def test_wyjatki_osierocone_wykrywa_brakujacy_plik(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(guard, "WYJATKI_ZNANE", frozenset({("nigdy/nieistniejacy.py", 1)}))

    problemy = guard.wyjatki_osierocone(tmp_path)

    assert len(problemy) == 1
    assert "nieistniejacy.py" in problemy[0]
    assert "juz nie ma w repo" in problemy[0]


def test_wyjatki_osierocone_wykrywa_linie_bez_trafienia(monkeypatch, tmp_path: Path) -> None:
    plik = tmp_path / "czysty.py"
    plik.write_text("wartosc = 'zwykla proza bez ASCII-matematyki'\n", encoding="utf-8")
    monkeypatch.setattr(guard, "WYJATKI_ZNANE", frozenset({("czysty.py", 1)}))

    problemy = guard.wyjatki_osierocone(tmp_path)

    assert len(problemy) == 1
    assert "juz nie produkuje zadnego trafienia" in problemy[0]


def test_wyjatki_znane_wylaczaja_trafienie_z_pin(monkeypatch, tmp_path: Path) -> None:
    frontend_ui2 = tmp_path / "frontend" / "src" / "ui2"
    frontend_ui2.mkdir(parents=True)
    plik = frontend_ui2 / "Plik.tsx"
    plik.write_text("const opis = 'U_dot <= U_dot,dop';\n", encoding="utf-8")
    backend_plik = tmp_path / "backend.py"
    backend_plik.write_text("wartosc = 1\n", encoding="utf-8")

    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "FRONTEND_UI2", frontend_ui2)
    monkeypatch.setattr(guard, "BACKEND_PLIKI", (backend_plik,))
    monkeypatch.setattr(guard, "WYJATKI_ZNANE", frozenset({("frontend/src/ui2/Plik.tsx", 1)}))
    monkeypatch.setattr(guard, "PIN", 0)

    assert guard.main() == 0


# ---------------------------------------------------------------------------
# main() — brzegi: brakujacy katalog/plik, PIN przekroczony/dotrzymany.
# ---------------------------------------------------------------------------


def test_main_zwraca_1_gdy_brak_katalogu_frontendowego(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(guard, "FRONTEND_UI2", tmp_path / "nigdy-nie-istnieje")

    assert guard.main() == 1


def test_main_zwraca_1_gdy_brak_pliku_backendowego(monkeypatch, tmp_path: Path) -> None:
    frontend_ui2 = tmp_path / "frontend" / "src" / "ui2"
    frontend_ui2.mkdir(parents=True)
    monkeypatch.setattr(guard, "FRONTEND_UI2", frontend_ui2)
    monkeypatch.setattr(guard, "BACKEND_PLIKI", (tmp_path / "nigdy.py",))

    assert guard.main() == 1


def test_main_zwraca_1_gdy_pin_przekroczony(monkeypatch, tmp_path: Path) -> None:
    frontend_ui2 = tmp_path / "frontend" / "src" / "ui2"
    frontend_ui2.mkdir(parents=True)
    plik = frontend_ui2 / "Plik.tsx"
    plik.write_text("const opis = 'U_dot <= U_dot,dop';\n", encoding="utf-8")
    backend_plik = tmp_path / "backend.py"
    backend_plik.write_text("wartosc = 1\n", encoding="utf-8")

    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "FRONTEND_UI2", frontend_ui2)
    monkeypatch.setattr(guard, "BACKEND_PLIKI", (backend_plik,))
    monkeypatch.setattr(guard, "WYJATKI_ZNANE", frozenset())
    monkeypatch.setattr(guard, "PIN", 0)

    assert guard.main() == 1


def test_main_zwraca_0_gdy_pin_dotrzymany(monkeypatch, tmp_path: Path) -> None:
    frontend_ui2 = tmp_path / "frontend" / "src" / "ui2"
    frontend_ui2.mkdir(parents=True)
    plik = frontend_ui2 / "Plik.tsx"
    plik.write_text("const opis = 'zwykly tekst bez ASCII-matematyki';\n", encoding="utf-8")
    backend_plik = tmp_path / "backend.py"
    backend_plik.write_text("wartosc = 1\n", encoding="utf-8")

    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "FRONTEND_UI2", frontend_ui2)
    monkeypatch.setattr(guard, "BACKEND_PLIKI", (backend_plik,))
    monkeypatch.setattr(guard, "WYJATKI_ZNANE", frozenset())
    monkeypatch.setattr(guard, "PIN", 0)

    assert guard.main() == 0


def test_main_pomija_pliki_z_wylaczonych_wzorcow(monkeypatch, tmp_path: Path) -> None:
    frontend_ui2 = tmp_path / "frontend" / "src" / "ui2"
    katalog_testow = frontend_ui2 / "__tests__"
    katalog_testow.mkdir(parents=True)
    plik = katalog_testow / "fixture.test.tsx"
    plik.write_text("const opis = 'U_dot <= U_dot,dop';\n", encoding="utf-8")
    backend_plik = tmp_path / "backend.py"
    backend_plik.write_text("wartosc = 1\n", encoding="utf-8")

    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "FRONTEND_UI2", frontend_ui2)
    monkeypatch.setattr(guard, "BACKEND_PLIKI", (backend_plik,))
    monkeypatch.setattr(guard, "WYJATKI_ZNANE", frozenset())
    monkeypatch.setattr(guard, "PIN", 0)

    assert guard.main() == 0


# ---------------------------------------------------------------------------
# Pomiar realny — dokumentuje intencje PIN (zapadka, nie liczba magiczna).
# ---------------------------------------------------------------------------


def test_pin_odzwierciedla_biezacy_pomiar_na_tym_drzewie() -> None:
    assert guard.main() == 0


if __name__ == "__main__":
    import pytest

    sys.exit(pytest.main([__file__, "-v"]))
