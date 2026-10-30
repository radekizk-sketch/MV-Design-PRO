#!/usr/bin/env python3
"""Testy wlasne `ui_math_guard.py` (karta V12.7 §0.11/§0.12).

Pokrywaja: piec wzorcow ASCII-matematyki osobno (pozytyw/negatyw), poprawki
precyzji skanu (literaly TS z parsera kompilatora — interpolacja `${...}` jest kodem,
literal zagniezdzony i wielowierszowy sa widoczne; wylaczenie docstringow Pythona),
zakres `ui/**` + `ui2/**`, teksty JSX, polecenie LaTeX z pojedynczym ukosnikiem,
mechanizm `WYJATKI_ZNANE` (wylaczenie z
PIN + zapadke swiezosci — ten sam wzorzec co
`no_raw_ids_in_ui_guard.check_excluded_relative_files_freshness`) oraz brzegi
`main()` (PIN przekroczony/dotrzymany, brakujacy katalog/plik).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import guard_parsowanie  # noqa: E402
import ui_math_guard as guard  # noqa: E402

# ---------------------------------------------------------------------------
# wpisy_ts — literaly i teksty JSX z parsera kompilatora TypeScript.
# ---------------------------------------------------------------------------


def _literaly(plik: Path) -> list[tuple[int, str]]:
    return [
        (int(wpis["linia"]), str(wpis["wartosc"]))
        for wpis in guard.wpisy_ts([plik]).get(plik, [])
        if wpis["rodzaj"] == "literal"
    ]


def test_wpisy_ts_szablon_bez_kodu_interpolacji(tmp_path: Path) -> None:
    plik = tmp_path / "a.ts"
    plik.write_text("const t = `wartosc: ${foo({a: 1, b: 2})} koniec`;\n", encoding="utf-8")
    assert _literaly(plik) == [(1, "wartosc:  koniec")]


def test_wpisy_ts_literal_zagniezdzony_w_interpolacji_jest_osobnym_wpisem(tmp_path: Path) -> None:
    # Wewnetrzny backtick konczyl dopasowanie zewnetrznego literalu w skanie wierszy.
    plik = tmp_path / "a.tsx"
    plik.write_text("const t = `wklad ${x} kA${ok ? ` · i_b=${y} kA` : ''}`;\n", encoding="utf-8")
    assert _literaly(plik) == [(1, "wklad  kA"), (1, " · i_b= kA"), (1, "")]


def test_wpisy_ts_literal_wielowierszowy_widoczny(tmp_path: Path) -> None:
    plik = tmp_path / "a.ts"
    plik.write_text("const t = `pierwszy wiersz\n  drugi U_f`;\n", encoding="utf-8")
    assert _literaly(plik) == [(1, "pierwszy wiersz\n  drugi U_f")]


def test_wpisy_ts_kod_nie_jest_tekstem(tmp_path: Path) -> None:
    """Specyfikator modulu, typ literalowy, nazwa wlasciwosci i argument dostepu indeksowego
    sa kodem — nie trafiaja do skanu; wartosc tej samej wlasciwosci trafia."""
    plik = tmp_path / "a.ts"
    plik.write_text(
        "import x from './U_f';\n"
        "type R = 'I_A' | 'U_B';\n"
        "const o = { 'Load.p_mw': 'wartosc' };\n"
        "const v = o['Load.p_mw'];\n",
        encoding="utf-8",
    )
    assert _literaly(plik) == [(3, "wartosc")]


def test_wpisy_ts_brak_node_to_blad_zrodla(monkeypatch, tmp_path: Path) -> None:
    plik = tmp_path / "a.ts"
    plik.write_text("const t = 'x';\n", encoding="utf-8")
    monkeypatch.setattr(guard.shutil, "which", lambda _nazwa: None)
    with pytest.raises(guard_parsowanie.BladZrodla):
        guard.wpisy_ts([plik])


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
    # przypadek w AttributeError. Kanon GUARD-BLAD-SKLADNI: plik nieparsowalny to
    # KONTROLOWANA czerwien (`BladZrodla` z plikiem i linia), nie pusty wynik.
    plik = tmp_path / "zepsuty.py"
    plik.write_text("wartosc = 'niedomkniety string\n", encoding="utf-8")

    with pytest.raises(guard_parsowanie.BladZrodla) as wyjatek:
        guard.skanuj_py(plik)
    assert "zepsuty.py:1:" in str(wyjatek.value)


def test_skanuj_py_docstring_nie_maskuje_zwyklego_literalu_pod_nim(tmp_path: Path) -> None:
    plik = tmp_path / "przyklad.py"
    plik.write_text(
        '"""Docstring modulu bez ASCII-matematyki."""\n' "wartosc = 'U_dot <= U_dot,dop'\n",
        encoding="utf-8",
    )

    wyniki = guard.skanuj_py(plik)

    assert len(wyniki) >= 1


def _pusty_ui(tmp_path: Path) -> Path:
    """Katalog `frontend/src/ui` drzewa testowego (pusty, jesli test nie dopisze plikow)."""
    katalog = tmp_path / "frontend" / "src" / "ui"
    katalog.mkdir(parents=True, exist_ok=True)
    return katalog


# ---------------------------------------------------------------------------
# WYJATKI_ZNANE — wylaczenie z PIN + zapadka swiezosci (osierocenie).
# ---------------------------------------------------------------------------


def test_wyjatki_znane_jedyny_wpis_nie_jest_osierocony() -> None:
    # Wpis realny (v126_katalog.py:458) musi ISTNIEC i nadal PRODUKOWAC
    # trafienie w tej linii — inaczej jest martwy i nalezy go usunac.
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
    monkeypatch.setattr(guard, "FRONTEND_UI", _pusty_ui(tmp_path))
    monkeypatch.setattr(guard, "BACKEND_PLIKI", (backend_plik,))
    monkeypatch.setattr(guard, "WYJATKI_ZNANE", frozenset({("frontend/src/ui2/Plik.tsx", 1)}))
    monkeypatch.setattr(guard, "PIN", 0)

    assert guard.main() == 0


# ---------------------------------------------------------------------------
# main() — brzegi: brakujacy katalog/plik, PIN przekroczony/dotrzymany.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("katalog", ["FRONTEND_UI", "FRONTEND_UI2"])
def test_main_zwraca_1_gdy_brak_katalogu_frontendowego(
    monkeypatch, tmp_path: Path, katalog: str
) -> None:
    monkeypatch.setattr(guard, katalog, tmp_path / "nigdy-nie-istnieje")

    assert guard.main() == 1


def test_main_zwraca_1_gdy_brak_pliku_backendowego(monkeypatch, tmp_path: Path) -> None:
    frontend_ui2 = tmp_path / "frontend" / "src" / "ui2"
    frontend_ui2.mkdir(parents=True)
    monkeypatch.setattr(guard, "FRONTEND_UI2", frontend_ui2)
    monkeypatch.setattr(guard, "FRONTEND_UI", _pusty_ui(tmp_path))
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
    monkeypatch.setattr(guard, "FRONTEND_UI", _pusty_ui(tmp_path))
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
    monkeypatch.setattr(guard, "FRONTEND_UI", _pusty_ui(tmp_path))
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
    monkeypatch.setattr(guard, "FRONTEND_UI", _pusty_ui(tmp_path))
    monkeypatch.setattr(guard, "BACKEND_PLIKI", (backend_plik,))
    monkeypatch.setattr(guard, "WYJATKI_ZNANE", frozenset())
    monkeypatch.setattr(guard, "PIN", 0)

    assert guard.main() == 0


# ---------------------------------------------------------------------------
# Goły indeks symbolu (decyzja architekta 2026-10-30, karta UX-04/ZU): `U_f`, `I_C`, `Z_0`
# w tekście UI poza wzorem `$...$`/`*_latex`. Iloczyn cech: alfabet litery (łaciński/grecki) ×
# postać indeksu (litery, cyfry, Unicode, klamry) × kontekst (proza, wzór `$...$`, LaTeX,
# identyfikator kodu, stała kodu w/poza kontekstem tekstu UI) × język pliku (TS/Python).
# ---------------------------------------------------------------------------

GOLY = "goly indeks symbolu"


@pytest.mark.parametrize(
    "tekst",
    [
        "Napięcie fazy doziemionej U_f",
        "I_C",
        "impedancja Z_0 transformatora",
        "Czułość (I_k2min/I>)",
        "Prąd różnicowy I_Δn",
        "Sprawność η_n",
        "cos φ_r",
        "Moc zwarciowa S_k''",
        "Z_{grid}(f)",
        "× I_n",
    ],
)
def test_goly_indeks_wykryty_w_prozie(tekst: str) -> None:
    assert any(GOLY in t for t in guard._dopasowania(tekst)), tekst


@pytest.mark.parametrize(
    "tekst",
    [
        "Napięcie fazy doziemionej $U_f$",
        "$I_C$",
        r"impedancja $Z_{0,\mathrm{TU}}$ transformatora",
        r"$I_{\Delta n}$ i $\eta_n$",
        r"I_{\mathrm{res}}",
        "bus_ref",
        "u_pu@",
        "nn.brak_r_a",
        "kod SC_1F i NO_TRIP",
        "zwykły tekst bez symbolu",
    ],
)
def test_goly_indeks_nie_wykryty_we_wzorze_i_w_kodzie(tekst: str) -> None:
    assert not any(GOLY in t for t in guard._dopasowania(tekst)), tekst


def test_stala_kodu_jest_kodem_tylko_poza_kontekstem_tekstu_ui() -> None:
    # Predykat parami: ta sama wartość jest kodem albo etykietą — decyduje kontekst, nie treść.
    assert not any(GOLY in t for t in guard._dopasowania("I_A", stala_kodu_dozwolona=True))
    assert any(GOLY in t for t in guard._dopasowania("I_A", stala_kodu_dozwolona=False))
    assert not any(GOLY in t for t in guard._dopasowania("V_MAGNITUDE", stala_kodu_dozwolona=True))
    # Proza ze spacją nigdy nie jest stałą kodu.
    assert any(GOLY in t for t in guard._dopasowania("Prąd I_A", stala_kodu_dozwolona=True))


def test_skanuj_ts_stala_kodu_poza_modulem_tekstow_przechodzi(tmp_path: Path) -> None:
    plik = tmp_path / "api.ts"
    plik.write_text(
        "export type Rodzaj =\n  | 'V_MAGNITUDE'\n  | 'P_FLOW';\n"
        "const kod = { meas_type: 'V_MAGNITUDE' };\n",
        encoding="utf-8",
    )
    assert guard.skanuj_ts(plik) == []


def test_skanuj_ts_ta_sama_stala_w_module_tekstow_jest_etykieta(tmp_path: Path) -> None:
    plik = tmp_path / "strings.ts"
    # Klucz `rnKolIA` nie pasuje do `KLUCZ_TEKSTU_UI_RE` — rozstrzyga sam moduł `strings.ts`.
    plik.write_text("export const S = {\n  rnKolIA: 'I_A',\n};\n", encoding="utf-8")
    wyniki = guard.skanuj_ts(plik)
    assert [(n, GOLY in powod) for n, _l, powod in wyniki] == [(2, True)]


def test_skanuj_ts_stala_jako_wartosc_wlasciwosci_tekstowej_jest_etykieta(tmp_path: Path) -> None:
    plik = tmp_path / "model.ts"
    plik.write_text(
        "const k = { klucz: 'u', etykieta: 'U_m', jednostka: 'kV' };\n", encoding="utf-8"
    )
    wyniki = guard.skanuj_ts(plik)
    assert len(wyniki) == 1 and GOLY in wyniki[0][2]


def test_skanuj_ts_wlasciwosc_latex_pominieta_a_tekstowa_obok_wykryta(tmp_path: Path) -> None:
    """Para cech: {wlasciwosc LaTeX `symbolLatex:`/`formula_latex:`, wlasciwosc tekstowa} ×
    {ta sama linia, osobne linie}. Wartosc pola LaTeX jest zrodlem `MathInline` (jak `*_latex`
    w Pythonie), etykieta z gołym indeksem w tej samej linii pozostaje wykryta."""
    plik = tmp_path / "parametry.ts"
    plik.write_text(
        "const a = { symbol: 'Isc', symbolLatex: 'I_{sc}' };\n"
        "const b = { formula_latex: 'P_{st} = c_i' };\n"
        "const c = { symbolLatex: 'I_{th}', etykieta: 'I_th aparatu' };\n",
        encoding="utf-8",
    )
    wyniki = guard.skanuj_ts(plik)
    assert [numer for numer, _linia, _powod in wyniki] == [3]
    assert GOLY in wyniki[0][2]


def test_skanuj_ts_pomija_komentarz_blokowy(tmp_path: Path) -> None:
    plik = tmp_path / "Plik.tsx"
    plik.write_text("/** Etykieta: `nazwa · I_Δn w mA`. */\nconst x = 1;\n", encoding="utf-8")
    assert guard.skanuj_ts(plik) == []


def test_skanuj_py_pola_latex_i_identyfikator_symbolu_w_parze_pominiete(tmp_path: Path) -> None:
    plik = tmp_path / "katalog.py"
    plik.write_text(
        "from dataclasses import dataclass\n"
        "@dataclass(frozen=True)\n"
        "class Wielkosc:\n"
        "    symbol: str\n"
        "    nazwa_pl: str\n"
        "    symbol_latex: str\n"
        "A = Wielkosc('R_g', 'Rezystancja uziomu', r'R_g')\n"
        "B = Wielkosc(symbol='U_c', nazwa_pl='Napięcie', symbol_latex=r'U_c')\n"
        "C = {'symbol': 'I_C', 'symbol_latex': 'I_C'}\n",
        encoding="utf-8",
    )
    assert guard.skanuj_py(plik) == []


def test_skanuj_py_identyfikator_bez_pary_i_proza_wykryte(tmp_path: Path) -> None:
    plik = tmp_path / "katalog.py"
    plik.write_text(
        "from dataclasses import dataclass\n"
        "@dataclass(frozen=True)\n"
        "class Parametr:\n"
        "    symbol: str\n"
        "    jednostka: str\n"
        "A = Parametr('I_k', 'kA')\n"
        "B = Parametr(symbol='t_b', jednostka='× I_n')\n"
        "C = ('Prąd ' 'I_n' ' na rząd')\n",
        encoding="utf-8",
    )
    linie = sorted({n for n, _l, powod in guard.skanuj_py(plik) if GOLY in powod})
    assert linie == [6, 7, 8]


def test_iniekcja_golego_indeksu_w_kopii_realnego_modulu_czerwieni_main(
    monkeypatch, tmp_path: Path
) -> None:
    """Iniekcja na kopii REALNYCH plików ze skanu: drzewo czyste (main == 0), a jeden goły
    indeks dopisany do kopii modułu tekstów i do kopii katalogu backendu czerwieni strażnika
    każdy osobno (main == 1)."""
    zrodlo_ts = guard.FRONTEND_UI2 / "wyniki" / "stan-fazowy" / "strings.ts"
    frontend_ui2 = tmp_path / "frontend" / "src" / "ui2"
    frontend_ui2.mkdir(parents=True)
    kopia_ts = frontend_ui2 / "strings.ts"
    kopia_ts.write_text(zrodlo_ts.read_text(encoding="utf-8"), encoding="utf-8")
    kopie_py = []
    for zrodlo_py in guard.BACKEND_PLIKI:
        kopia = tmp_path / zrodlo_py.name
        kopia.write_text(zrodlo_py.read_text(encoding="utf-8"), encoding="utf-8")
        kopie_py.append(kopia)
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "FRONTEND_UI2", frontend_ui2)
    monkeypatch.setattr(guard, "FRONTEND_UI", _pusty_ui(tmp_path))
    monkeypatch.setattr(guard, "BACKEND_PLIKI", tuple(kopie_py))
    monkeypatch.setattr(guard, "WYJATKI_ZNANE", frozenset())
    monkeypatch.setattr(guard, "PIN", 0)
    assert guard.main() == 0

    oryginal_ts = kopia_ts.read_text(encoding="utf-8")
    kopia_ts.write_text(
        oryginal_ts.replace("rnKolUA: '$U_A$',", "rnKolUA: 'U_A',"), encoding="utf-8"
    )
    assert kopia_ts.read_text(encoding="utf-8") != oryginal_ts
    assert guard.main() == 1
    kopia_ts.write_text(oryginal_ts, encoding="utf-8")

    oryginal_py = kopie_py[0].read_text(encoding="utf-8")
    kopie_py[0].write_text(
        oryginal_py.replace('"% $I_n$ na rząd"', '"% I_n na rząd"'), encoding="utf-8"
    )
    assert kopie_py[0].read_text(encoding="utf-8") != oryginal_py
    assert guard.main() == 1


# ---------------------------------------------------------------------------
# Teksty JSX, polecenie LaTeX z pojedynczym ukosnikiem, klasa CSS — iloczyn cech:
# miejsce tekstu (literal JS, napis atrybutu JSX, tekst JSX) × zapis (goly indeks, `$...$`,
# polecenie z jednym/dwoma ukosnikami) × kontekst (proza, pole LaTeX).
# ---------------------------------------------------------------------------

UKOSNIK = "pojedynczym ukosnikiem"


def test_skanuj_plik_frontu_tekst_jsx_goly_indeks_i_dolary(tmp_path: Path) -> None:
    plik = tmp_path / "Pole.tsx"
    plik.write_text(
        "export const P = () => (\n"
        "  <div>\n"
        "    <label>Rezystancja R_f [Ω]</label>\n"
        "    <span>Czas $t_k$</span>\n"
        '    <span>Czas <MathInline latex="t_k" /> [s]</span>\n'
        "  </div>\n"
        ");\n",
        encoding="utf-8",
    )
    wyniki = guard.skanuj_plik_frontu(plik)
    assert [(n, GOLY in p_ or "dolarami" in p_) for n, _l, p_ in wyniki] == [(3, True), (4, True)]


@pytest.mark.parametrize(
    ("zrodlo", "oczekiwane"),
    [
        ("const a = '$\\\\Delta U$';\n", False),
        ("const a = '$\\Delta U$';\n", True),
        ("const a = `$\\varphi$ = ${x}`;\n", True),
        ("const a = { formula_latex: '\\frac{a}{b}' };\n", True),
        ("const a = { formula_latex: '\\\\frac{a}{b}' };\n", False),
        ("const a = 'proza z \\n nowym wierszem';\n", False),
        ("const a = '$I_{\\u0394}$';\n", False),
        ('const a = <MathInline latex="\\Delta U" />;\n', False),
    ],
)
def test_skanuj_ts_polecenie_latex_z_pojedynczym_ukosnikiem(
    tmp_path: Path, zrodlo: str, oczekiwane: bool
) -> None:
    plik = tmp_path / "a.tsx"
    plik.write_text(zrodlo, encoding="utf-8")
    trafione = any(UKOSNIK in powod for _n, _l, powod in guard.skanuj_ts(plik))
    assert trafione is oczekiwane, zrodlo


@pytest.mark.parametrize(
    ("wartosc", "lista_klas"),
    [
        ("bg-[url(I_k.png)] w-4", True),
        ("[mask_type:I_k] p-2", True),
        ("Prąd I_k zwarcia", False),
        ("Prąd wytrzymywany I_th [kA]", False),
        ("Current I_th [kA]", False),
        ("w-4 h-4", False),
    ],
)
def test_lista_klas_css_odroznia_od_prozy_z_jednostka(wartosc: str, lista_klas: bool) -> None:
    assert guard._jest_lista_klas_css(wartosc) is lista_klas, wartosc


def _drzewo_z_kopiami(monkeypatch, tmp_path: Path, wzgledne: list[str]) -> dict[str, Path]:
    """Drzewo testowe z kopiami REALNYCH plikow frontu (sciezki wzgledem `frontend/src`)."""
    frontend_src = tmp_path / "frontend" / "src"
    (frontend_src / "ui").mkdir(parents=True)
    (frontend_src / "ui2").mkdir(parents=True)
    kopie: dict[str, Path] = {}
    for wzgledna in wzgledne:
        zrodlo = guard.ROOT / "frontend" / "src" / wzgledna
        kopia = frontend_src / wzgledna
        kopia.parent.mkdir(parents=True, exist_ok=True)
        kopia.write_text(zrodlo.read_text(encoding="utf-8"), encoding="utf-8")
        kopie[wzgledna] = kopia
    backend_plik = tmp_path / "backend.py"
    backend_plik.write_text("wartosc = 1\n", encoding="utf-8")
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "FRONTEND_UI", frontend_src / "ui")
    monkeypatch.setattr(guard, "FRONTEND_UI2", frontend_src / "ui2")
    monkeypatch.setattr(guard, "BACKEND_PLIKI", (backend_plik,))
    monkeypatch.setattr(guard, "WYJATKI_ZNANE", frozenset())
    monkeypatch.setattr(guard, "PIN", 0)
    return kopie


@pytest.mark.parametrize(
    ("wzgledna", "przed", "po"),
    [
        # Literal w `ui/**` (zakres rozszerzony decyzja architekta 2026-10-30).
        (
            "ui/catalog/TypeLibraryBrowser.tsx",
            "'Prąd wytrzymywany krótkotrwale $I_{th}$ [kA]'",
            "'Prąd wytrzymywany krótkotrwale I_th [kA]'",
        ),
        # Polecenie LaTeX z pojedynczym ukosnikiem (`\v` to znak sterujacy w literale).
        (
            "ui/catalog/TypeLibraryBrowser.tsx",
            "'Współczynnik mocy $\\\\cos\\\\varphi$'",
            "'Współczynnik mocy $\\\\cos\\varphi$'",
        ),
        # Tekst JSX `ui/**`.
        (
            "ui/network-build/station-configurator/cards/StationConfigTransformerCard.tsx",
            '<MathInline latex="u_k" /> [%]',
            "u_k [%]",
        ),
        # Literal szablonowy zagniezdzony w interpolacji (niewidoczny dla skanu wierszy).
        (
            "ui/sld/v2/station-rozdzielnia/OzeSourceArchetype.tsx",
            "` · $i_b$ = ${contrib.ib_contribution_ka.toFixed(3)} kA`",
            "` · i_b=${contrib.ib_contribution_ka.toFixed(3)} kA`",
        ),
        # Tekst JSX `ui2/**`.
        (
            "ui2/inspector/SekcjaPetlaZwarcia.tsx",
            'Pojemność doziemna sieci <MathInline latex="C_e" />',
            "Pojemność doziemna sieci C_e",
        ),
    ],
)
def test_iniekcja_w_kopii_realnego_pliku_frontu_czerwieni_main(
    monkeypatch, tmp_path: Path, wzgledna: str, przed: str, po: str
) -> None:
    """Kopia realnego pliku jest czysta (main == 0); jedna iniekcja klasy czerwieni
    straznika (main == 1). `przed` musi wystepowac w pliku dokladnie raz — inaczej iniekcja
    nie sprawdza tego, co deklaruje."""
    kopia = _drzewo_z_kopiami(monkeypatch, tmp_path, [wzgledna])[wzgledna]
    assert guard.main() == 0
    oryginal = kopia.read_text(encoding="utf-8")
    assert oryginal.count(przed) == 1, przed
    kopia.write_text(oryginal.replace(przed, po), encoding="utf-8")
    assert guard.main() == 1


# ---------------------------------------------------------------------------
# Pomiar realny — dokumentuje intencje PIN (zapadka, nie liczba magiczna).
# ---------------------------------------------------------------------------


def test_pin_odzwierciedla_biezacy_pomiar_na_tym_drzewie() -> None:
    assert guard.main() == 0


if __name__ == "__main__":
    import pytest

    sys.exit(pytest.main([__file__, "-v"]))
