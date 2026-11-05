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

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import guard_parsowanie  # noqa: E402
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


def test_skanuj_ts_wykrywa_ascii_w_czesci_literalnej_template_literal(
    tmp_path: Path,
) -> None:
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


@pytest.mark.parametrize(
    ("literal", "trafienie"),
    [
        # Stała kodu Pythona (wielkie litery) — identyfikator, nie proza.
        ('"Z_POL"', False),
        ('"A_WTORNY"', False),
        # Symbol wielkości z małą literą w indeksie — proza z gołym indeksem (karta KD6).
        ('"czas wyłączenia t_b"', True),
        ('"I_b"', True),
        ('"prąd I_sc aparatu"', True),
        # Proza słowami — czysta.
        ('"znamionowy prąd wyłączalny zwarciowy"', False),
    ],
)
def test_skanuj_py_stala_kodu_a_symbol_w_prozie(
    tmp_path: Path, literal: str, trafienie: bool
) -> None:
    """Iloczyn: stała kodu / symbol w prozie / proza słowami (karta KD6)."""
    plik = tmp_path / "przyklad.py"
    plik.write_text(f"wartosc = {literal}\n", encoding="utf-8")

    wyniki = guard.skanuj_py(plik)

    assert bool(wyniki) is trafienie


def test_skan_backendu_obejmuje_cale_src() -> None:
    """Skan backendu to CAŁE `backend/src` (karta PROZA-BEZ-SYMBOLI-ASCII) — także moduły prozy
    aparatury pól (karta KD6) i rdzenie B-01; żadnej listy plików wyłączonych."""
    wzgledne = {
        p.relative_to(guard.BACKEND_SRC).as_posix() for p in guard.pliki_backendu()
    }
    wszystkie = {
        p.relative_to(guard.BACKEND_SRC).as_posix()
        for p in guard.BACKEND_SRC.rglob("*.py")
        if "__pycache__" not in p.parts
    }
    assert wzgledne == wszystkie
    assert {
        "application/analyses/wytrzymalosc_aparatury_pol.py",
        "application/equipment_proof/wielkosc_wylaczania.py",
        "application/analyses/protection/czas_wylaczenia_pola.py",
        "network_model/core/czas_wylaczenia.py",
        "network_model/solvers/short_circuit_iec60909.py",
    } <= wzgledne


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


def test_skanuj_py_docstring_nie_maskuje_zwyklego_literalu_pod_nim(
    tmp_path: Path,
) -> None:
    plik = tmp_path / "przyklad.py"
    plik.write_text(
        '"""Docstring modulu bez ASCII-matematyki."""\n'
        "wartosc = 'U_dot <= U_dot,dop'\n",
        encoding="utf-8",
    )

    wyniki = guard.skanuj_py(plik)

    assert len(wyniki) >= 1


# ---------------------------------------------------------------------------
# WYJATKI_ZNANE — wylaczenie z PIN + zapadka swiezosci (osierocenie).
# ---------------------------------------------------------------------------


def test_wyjatki_znane_jedyny_wpis_nie_jest_osierocony() -> None:
    # Wpis realny (v126_katalog.py:458) musi ISTNIEC i nadal PRODUKOWAC
    # trafienie w tej linii — inaczej jest martwy i nalezy go usunac.
    assert guard.wyjatki_osierocone(guard.ROOT) == []


def test_wyjatki_osierocone_wykrywa_brakujacy_plik(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(
        guard, "WYJATKI_ZNANE", frozenset({("nigdy/nieistniejacy.py", 1)})
    )

    problemy = guard.wyjatki_osierocone(tmp_path)

    assert len(problemy) == 1
    assert "nieistniejacy.py" in problemy[0]
    assert "juz nie ma w repo" in problemy[0]


def test_wyjatki_osierocone_wykrywa_linie_bez_trafienia(
    monkeypatch, tmp_path: Path
) -> None:
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
    backend_src = tmp_path / "backend" / "src"
    backend_src.mkdir(parents=True)
    (backend_src / "modul.py").write_text("wartosc = 1\n", encoding="utf-8")

    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "FRONTEND_UI2", frontend_ui2)
    monkeypatch.setattr(guard, "BACKEND_SRC", backend_src)
    monkeypatch.setattr(guard, "PINY_BACKENDU", {})
    monkeypatch.setattr(
        guard, "WYJATKI_ZNANE", frozenset({("frontend/src/ui2/Plik.tsx", 1)})
    )
    monkeypatch.setattr(guard, "PIN", 0)

    assert guard.main() == 0


# ---------------------------------------------------------------------------
# main() — brzegi: brakujacy katalog/plik, PIN przekroczony/dotrzymany.
# ---------------------------------------------------------------------------


def test_main_zwraca_1_gdy_brak_katalogu_frontendowego(
    monkeypatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(guard, "FRONTEND_UI2", tmp_path / "nigdy-nie-istnieje")

    assert guard.main() == 1


def test_main_zwraca_1_gdy_brak_katalogu_backendu(monkeypatch, tmp_path: Path) -> None:
    frontend_ui2 = tmp_path / "frontend" / "src" / "ui2"
    frontend_ui2.mkdir(parents=True)
    monkeypatch.setattr(guard, "FRONTEND_UI2", frontend_ui2)
    monkeypatch.setattr(guard, "BACKEND_SRC", tmp_path / "nigdy")

    assert guard.main() == 1


def test_main_zwraca_1_gdy_pin_przekroczony(monkeypatch, tmp_path: Path) -> None:
    frontend_ui2 = tmp_path / "frontend" / "src" / "ui2"
    frontend_ui2.mkdir(parents=True)
    plik = frontend_ui2 / "Plik.tsx"
    plik.write_text("const opis = 'U_dot <= U_dot,dop';\n", encoding="utf-8")
    backend_src = tmp_path / "backend" / "src"
    backend_src.mkdir(parents=True)
    (backend_src / "modul.py").write_text("wartosc = 1\n", encoding="utf-8")

    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "FRONTEND_UI2", frontend_ui2)
    monkeypatch.setattr(guard, "BACKEND_SRC", backend_src)
    monkeypatch.setattr(guard, "PINY_BACKENDU", {})
    monkeypatch.setattr(guard, "WYJATKI_ZNANE", frozenset())
    monkeypatch.setattr(guard, "PIN", 0)

    assert guard.main() == 1


def test_main_zwraca_0_gdy_pin_dotrzymany(monkeypatch, tmp_path: Path) -> None:
    frontend_ui2 = tmp_path / "frontend" / "src" / "ui2"
    frontend_ui2.mkdir(parents=True)
    plik = frontend_ui2 / "Plik.tsx"
    plik.write_text(
        "const opis = 'zwykly tekst bez ASCII-matematyki';\n", encoding="utf-8"
    )
    backend_src = tmp_path / "backend" / "src"
    backend_src.mkdir(parents=True)
    (backend_src / "modul.py").write_text("wartosc = 1\n", encoding="utf-8")

    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "FRONTEND_UI2", frontend_ui2)
    monkeypatch.setattr(guard, "BACKEND_SRC", backend_src)
    monkeypatch.setattr(guard, "PINY_BACKENDU", {})
    monkeypatch.setattr(guard, "WYJATKI_ZNANE", frozenset())
    monkeypatch.setattr(guard, "PIN", 0)

    assert guard.main() == 0


def test_main_pomija_pliki_z_wylaczonych_wzorcow(monkeypatch, tmp_path: Path) -> None:
    frontend_ui2 = tmp_path / "frontend" / "src" / "ui2"
    katalog_testow = frontend_ui2 / "__tests__"
    katalog_testow.mkdir(parents=True)
    plik = katalog_testow / "fixture.test.tsx"
    plik.write_text("const opis = 'U_dot <= U_dot,dop';\n", encoding="utf-8")
    backend_src = tmp_path / "backend" / "src"
    backend_src.mkdir(parents=True)
    (backend_src / "modul.py").write_text("wartosc = 1\n", encoding="utf-8")

    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "FRONTEND_UI2", frontend_ui2)
    monkeypatch.setattr(guard, "BACKEND_SRC", backend_src)
    monkeypatch.setattr(guard, "PINY_BACKENDU", {})
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
    assert not any(
        GOLY in t for t in guard._dopasowania("I_A", stala_kodu_dozwolona=True)
    )
    assert any(GOLY in t for t in guard._dopasowania("I_A", stala_kodu_dozwolona=False))
    assert not any(
        GOLY in t for t in guard._dopasowania("V_MAGNITUDE", stala_kodu_dozwolona=True)
    )
    # Proza ze spacją nigdy nie jest stałą kodu.
    assert any(
        GOLY in t for t in guard._dopasowania("Prąd I_A", stala_kodu_dozwolona=True)
    )


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


def test_skanuj_ts_stala_jako_wartosc_wlasciwosci_tekstowej_jest_etykieta(
    tmp_path: Path,
) -> None:
    plik = tmp_path / "model.ts"
    plik.write_text(
        "const k = { klucz: 'u', etykieta: 'U_m', jednostka: 'kV' };\n",
        encoding="utf-8",
    )
    wyniki = guard.skanuj_ts(plik)
    assert len(wyniki) == 1 and GOLY in wyniki[0][2]


def test_skanuj_ts_wlasciwosc_latex_pominieta_a_tekstowa_obok_wykryta(
    tmp_path: Path,
) -> None:
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
    plik.write_text(
        "/** Etykieta: `nazwa · I_Δn w mA`. */\nconst x = 1;\n", encoding="utf-8"
    )
    assert guard.skanuj_ts(plik) == []


def test_skanuj_py_pola_latex_i_identyfikator_symbolu_w_parze_pominiete(
    tmp_path: Path,
) -> None:
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
    backend_src = tmp_path / "backend" / "src"
    kopie_py = []
    for wzgledna in ("application/analyses/v126_katalog.py",):
        kopia = backend_src / wzgledna
        kopia.parent.mkdir(parents=True)
        kopia.write_text(
            (guard.BACKEND_SRC / wzgledna).read_text(encoding="utf-8"), encoding="utf-8"
        )
        kopie_py.append(kopia)
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "FRONTEND_UI2", frontend_ui2)
    monkeypatch.setattr(guard, "BACKEND_SRC", backend_src)
    monkeypatch.setattr(guard, "PINY_BACKENDU", {})
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
# Pomiar realny — dokumentuje intencje PIN (zapadka, nie liczba magiczna).
# ---------------------------------------------------------------------------


def test_pin_odzwierciedla_biezacy_pomiar_na_tym_drzewie() -> None:
    assert guard.main() == 0


if __name__ == "__main__":
    import pytest

    sys.exit(pytest.main([__file__, "-v"]))


# ---------------------------------------------------------------------------
# Karta PROZA-BEZ-SYMBOLI-ASCII: skan całego `backend/src`, pola wzorów z adnotacji
# `ZapisLatex`, identyfikatory z mocy składni i zapadka per plik.
# ---------------------------------------------------------------------------

_MODUL_TYPOW = (
    "from dataclasses import dataclass\n"
    "from werdykt.zapis_latex import ZapisLatex\n"
    "@dataclass\n"
    "class Wielkosc:\n"
    "    symbol: ZapisLatex\n"
    "    opis: str\n"
    "    klucze: dict[ZapisLatex, str]\n"
    "    @classmethod\n"
    "    def create(cls, symbol: ZapisLatex, opis: str) -> 'Wielkosc':\n"
    "        return cls(symbol, opis, {})\n"
)


def _src_z_modulami(monkeypatch, tmp_path: Path, **moduly: str) -> Path:
    src = tmp_path / "backend" / "src"
    src.mkdir(parents=True)
    for nazwa, tresc in moduly.items():
        (src / f"{nazwa}.py").write_text(tresc, encoding="utf-8")
    monkeypatch.setattr(guard, "BACKEND_SRC", src)
    return src


@pytest.mark.parametrize(
    ("wywolanie", "trafienia"),
    [
        # pole ZapisLatex: pozycyjnie, nazwanie, przez metodę klasy — wzór, nie proza
        ("Wielkosc('I_k', 'prąd', {})", 0),
        ("Wielkosc(symbol='I_k', opis='prąd', klucze={})", 0),
        ("Wielkosc.create('I_k', 'prąd')", 0),
        # pole prozy (`opis`) z gołym symbolem — trafienie, niezależnie od sposobu przekazania
        ("Wielkosc('I_k', 'prąd I_k', {})", 1),
        ("Wielkosc.create(symbol='I_k', opis='prąd I_k')", 1),
        # dict[ZapisLatex, str]: klucze są wzorami, wartości prozą
        ("Wielkosc('I_k', 'prąd', {'I_k': 'ikss_ka'})", 0),
        ("Wielkosc('I_k', 'prąd', {'I_k': 'prąd I_b'})", 1),
        ("Wielkosc('I_k', 'prąd', {'I_k': 'a'} | {'Z_f': 'b'})", 0),
        ("Wielkosc('I_k', 'prąd', {**({'Z_f': 'b'} if x else {})})", 0),
    ],
)
def test_adnotacja_zapis_latex_z_innego_modulu(
    monkeypatch, tmp_path: Path, wywolanie: str, trafienia: int
) -> None:
    """Iloczyn: {pole wzoru · pole prozy · klucze/wartości słownika wzorów} × {pozycyjnie ·
    nazwanie · metoda klasy · złożenie słowników} — sygnatura z INNEGO modułu (indeks całego
    `backend/src`)."""
    src = _src_z_modulami(
        monkeypatch,
        tmp_path,
        typy=_MODUL_TYPOW,
        uzycie=f"from typy import Wielkosc\nx = 1\nw = {wywolanie}\n",
    )
    assert len(guard.skanuj_py(src / "uzycie.py")) == trafienia


@pytest.mark.parametrize(
    ("kod", "trafienia"),
    [
        # zmienna z adnotacją przed rozgałęzieniem — każde przypisanie niesie wzór
        (
            "def f(a):\n    s: ZapisLatex\n    if a:\n        s = 'I_k'\n    else:\n        s = 'I_b'\n",
            0,
        ),
        ("def f(a):\n    s = 'I_k'\n", 1),
        # krotka celów: wszystkie z adnotacją — wzór; jeden bez — proza
        (
            "def f():\n    r: ZapisLatex\n    x: ZapisLatex\n    r, x = ('R_k', 'X_k')\n",
            0,
        ),
        ("def f():\n    r: ZapisLatex\n    r, x = ('R_k', 'X_k')\n", 2),
        # wartość zwracana funkcji `-> ZapisLatex`; zagnieżdżona funkcja ma własny typ zwrotu
        ("def f() -> ZapisLatex:\n    return 'I_k'\n", 0),
        (
            "def f() -> ZapisLatex:\n    def g() -> str:\n        return 'prąd I_k'\n    return 'I_k'\n",
            1,
        ),
        # parametr funkcji zagnieżdżonej i wartość domyślna parametru
        ("def f():\n    def g(s: ZapisLatex) -> None: ...\n    g('I_k')\n", 0),
        ("def f(s: ZapisLatex = 'I_k') -> None: ...\n", 0),
        ("def f(s: str = 'I_k') -> None: ...\n", 1),
    ],
)
def test_adnotacja_zapis_latex_zmiennych_i_zwrotu(
    monkeypatch, tmp_path: Path, kod: str, trafienia: int
) -> None:
    src = _src_z_modulami(
        monkeypatch,
        tmp_path,
        modul="from werdykt.zapis_latex import ZapisLatex\n" + kod,
    )
    assert len(guard.skanuj_py(src / "modul.py")) == trafienia


@pytest.mark.parametrize(
    ("kod", "trafienia"),
    [
        ("x = d['I_k']\n", 0),
        ("x = d.get('I_k')\n", 0),
        ("x = a == 'Q_max'\n", 0),
        ("x = a in ('I_k', 'I_b')\n", 0),
        ("x = getattr(o, 'I_k')\n", 0),
        # ten sam napis jako argument zwykłego wywołania albo wartość słownika — proza; klucz
        # zwykłego słownika też (bywa nagłówkiem kolumny eksportu) — wyłącza go tylko adnotacja
        ("x = print('I_k')\n", 1),
        ("x = {'I_k': 'prąd I_k'}\n", 2),
    ],
)
def test_identyfikator_z_mocy_skladni(
    monkeypatch, tmp_path: Path, kod: str, trafienia: int
) -> None:
    src = _src_z_modulami(monkeypatch, tmp_path, modul=kod)
    assert len(guard.skanuj_py(src / "modul.py")) == trafienia


@pytest.mark.parametrize(
    ("literal", "trafienie"),
    [
        ("'Energia $I_{th}^2 \\\\cdot t$ zwarcia'", False),
        ("'Energia I^2 zwarcia'", True),
        ("'Wzór $a * b$ w segmencie'", False),
        ("'Iloczyn a * b w prozie'", True),
    ],
)
def test_wzorce_skladni_sprawdzane_na_prozie_poza_segmentem(
    tmp_path: Path, literal: str, trafienie: bool
) -> None:
    plik = tmp_path / "przyklad.py"
    plik.write_text(f"wartosc = {literal}\n", encoding="utf-8")
    assert bool(guard.skanuj_py(plik)) is trafienie


@pytest.mark.parametrize(
    ("piny", "oczekiwany_kod", "znacznik"),
    [
        ({"modul.py": 1}, 0, None),
        ({}, 1, "[ui-math-nowe]"),
        ({"modul.py": 2}, 1, "[ui-math-pin-nieaktualny]"),
        ({"modul.py": 1, "nie_ma.py": 3}, 1, "[ui-math-pin-osierocony]"),
    ],
)
def test_zapadka_backendu_per_plik_w_obie_strony(
    monkeypatch,
    tmp_path: Path,
    capsys,
    piny: dict[str, int],
    oczekiwany_kod: int,
    znacznik,
) -> None:
    """Zapadka per plik: pomiar = pin (zielono); nowe trafienie, pin zawyżony i wpis osierocony
    — każde czerwieni strażnika z nazwanym powodem."""
    frontend_ui2 = tmp_path / "frontend" / "src" / "ui2"
    frontend_ui2.mkdir(parents=True)
    _src_z_modulami(monkeypatch, tmp_path, modul="x = 'prąd I_k w punkcie'\n")
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "FRONTEND_UI2", frontend_ui2)
    monkeypatch.setattr(guard, "WYJATKI_ZNANE", frozenset())
    monkeypatch.setattr(guard, "PINY_BACKENDU", piny)
    assert guard.main() == oczekiwany_kod
    if znacznik is not None:
        assert znacznik in capsys.readouterr().out


def test_piny_backendu_rdzeni_b01_oznaczone_i_w_pomiarze() -> None:
    """Każdy wpis zapadki leży w `backend/src`; rdzenie B-01 nie są wyłączone ze skanu —
    ich trafienia stoją w pinach jawnie (do decyzji architekta), a nie poza pomiarem."""
    from rdzenie_b01 import jest_rdzeniem_b01

    pomiar = guard.zmierz_backend()
    assert guard.problemy_pinow_backendu(pomiar) == []
    for wzgledna in guard.PINY_BACKENDU:
        assert (guard.BACKEND_SRC / wzgledna).is_file()
    assert any(jest_rdzeniem_b01(w) for w in guard.PINY_BACKENDU) == any(
        jest_rdzeniem_b01(w) for w in pomiar
    )


def test_skanuj_py_klucz_struktury_danych_jest_identyfikatorem(tmp_path: Path) -> None:
    """Klucz słownika, którego wartością jest obiekt albo lista (`{"I_dyn": {...}}`), to nazwa
    pola zapisu JSON — poza skanem; ten sam klucz z wartością tekstową (opis wielkości) i sama
    wartość tekstowa z symbolem ASCII są skanowane (iloczyn: wartość dict/list/str × klucz/proza).
    """
    plik = tmp_path / "eksport.py"
    plik.write_text(
        "A = {'I_dyn': {'symbol_latex': 'I_{dyn}'}, 'I_th': [1, 2], 'I_k': ({'a': 1},)}\n"
        "B = {'I_dyn': 'Prąd dynamiczny'}\n"
        "C = {'opis': {'k': 'prąd I_th aparatu'}}\n",
        encoding="utf-8",
    )
    assert [numer for numer, _linia, _powod in guard.skanuj_py(plik)] == [2, 3]


_MODUL_IDENTYFIKATOROW = (
    "from dataclasses import dataclass\n"
    "from werdykt.zapis_latex import IdentyfikatorKontraktu\n"
    "@dataclass\n"
    "class Krok:\n"
    "    symbol: IdentyfikatorKontraktu\n"
    "    opis: str\n"
    "KOLUMNY: dict[IdentyfikatorKontraktu, type] = {'I_k_ka': float}\n"
    "KODY: tuple[IdentyfikatorKontraktu, ...] = ('pole_I_k',)\n"
)


@pytest.mark.parametrize(
    ("uzycie", "trafienia"),
    [
        # identyfikator kontraktu (klucz wyniku, kolumna, kod) — czytany maszynowo, poza prozą
        ("from typy import Krok\nk = Krok('I_k', 'prąd zwarciowy')\n", 0),
        ("from typy import Krok\nk = Krok(symbol='I_k', opis='prąd zwarciowy')\n", 0),
        # pole prozy obok identyfikatora — skanowane
        ("from typy import Krok\nk = Krok('I_k', 'prąd I_k w punkcie')\n", 1),
        # zmienna z adnotacją identyfikatora i dopisanie do niej (AugAssign)
        (
            "from werdykt.zapis_latex import IdentyfikatorKontraktu\n"
            "def f():\n    k: IdentyfikatorKontraktu = 'I_k'\n    k += 'I_b'\n    return k\n",
            0,
        ),
        # dopisanie do zmiennej bez adnotacji — proza, trafienie
        ("def f():\n    k = 'prąd'\n    k += ' I_k'\n    return k\n", 1),
    ],
)
def test_adnotacja_identyfikatora_kontraktu(
    monkeypatch, tmp_path: Path, uzycie: str, trafienia: int
) -> None:
    """Iloczyn: {pole/zmienna z `IdentyfikatorKontraktu` · pole prozy obok} × {pozycyjnie ·
    nazwanie · przypisanie z dopisaniem} — adnotacja wyłącza identyfikatory jak `ZapisLatex`
    wzory, a proza w sąsiednim polu nadal jest skanowana."""
    src = _src_z_modulami(
        monkeypatch, tmp_path, typy=_MODUL_IDENTYFIKATOROW, uzycie=uzycie
    )
    assert len(guard.skanuj_py(src / "typy.py")) == 0
    assert len(guard.skanuj_py(src / "uzycie.py")) == trafienia


@pytest.mark.parametrize(
    ("literal", "trafienie"),
    [
        # cały literał jest adresem URL albo instrukcją SQL — nie jest prozą dla inżyniera
        ("'https://example.org/norma?a_b=1&c_d=2'", False),
        ("'SELECT run_id, I_k_ka FROM wyniki WHERE a_b = 1'", False),
        # adres wewnątrz zdania nie wyłącza prozy z symbolem
        ("'Patrz https://example.org — prąd I_k'", True),
        # słowo kluczowe SQL nie na początku literału — proza
        ("'Wybierz SELECT dla I_k'", True),
    ],
)
def test_adres_url_i_instrukcja_sql_poza_proza(
    tmp_path: Path, literal: str, trafienie: bool
) -> None:
    plik = tmp_path / "przyklad.py"
    plik.write_text(f"wartosc = {literal}\n", encoding="utf-8")
    assert bool(guard.skanuj_py(plik)) is trafienie


@pytest.mark.parametrize(
    ("linia", "trafienia"),
    [
        # klucz wzoru w cudzysłowie (dane generowane) i właściwość JSX `latex` — wzór, nie proza
        ('  "formula_latex": "Z_k = Z_1",\n', 0),
        ('<FormulaBlock label="Zapis" latex="Z_k = Z_1" />\n', 0),
        ("<FormulaBlock latex={`Z_1 = ${z}`} />\n", 0),
        # klucz obiektu (nazwa pola) — kod; ta sama wartość w ternarnym wyrażeniu — tekst ekranu
        ("  'Load.p_mw': [requiredNumber],\n", 0),
        ("const e = ok ? 'Prąd I_k' : 'Prąd I_b';\n", 2),
        # `_slowo,` w napisie bez odstępów (klasa CSS) — kod; w zdaniu — proza
        ("const k = 'bg-[radial-gradient(circle_at_top_left,rgba(1,2,3,0.1))]';\n", 0),
        ("const t = 'Rejestr solver_capability_registry, wynik';\n", 1),
    ],
)
def test_skanuj_ts_klucze_wzoru_klucze_obiektu_i_kod_css(
    tmp_path: Path, linia: str, trafienia: int
) -> None:
    """Iloczyn: {klucz wzoru w cudzysłowie · właściwość JSX `latex` · klucz obiektu · wartość
    ternarna · napis bez odstępów · zdanie} — wyłączenia działają tylko na kod i wzór.
    """
    plik = tmp_path / "Komponent.tsx"
    plik.write_text(linia, encoding="utf-8")
    assert len(guard.skanuj_ts(plik)) == trafienia


def test_skan_frontendu_obejmuje_ui_i_ui2(monkeypatch, tmp_path: Path, capsys) -> None:
    """Warstwa `ui/**` (sąsiad `ui2/**`) jest skanowana z tym samym pinem: goły symbol w etykiecie
    `ui/` czerwieni strażnika tak samo jak w `ui2/`."""
    ui2 = tmp_path / "frontend" / "src" / "ui2"
    ui = tmp_path / "frontend" / "src" / "ui"
    ui2.mkdir(parents=True)
    ui.mkdir(parents=True)
    (ui / "Etykieta.tsx").write_text(
        "const e = { label: 'Prąd I_th [kA]' };\n", encoding="utf-8"
    )
    _src_z_modulami(monkeypatch, tmp_path, modul="x = 1\n")
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    monkeypatch.setattr(guard, "FRONTEND_UI2", ui2)
    monkeypatch.setattr(guard, "WYJATKI_ZNANE", frozenset())
    monkeypatch.setattr(guard, "PINY_BACKENDU", {})
    assert [p.name for p in guard.pliki_frontendu()] == ["Etykieta.tsx"]
    assert guard.main() == 1
    assert "frontend/src/ui/Etykieta.tsx" in capsys.readouterr().out


@pytest.mark.parametrize(
    ("tresc", "trafienia"),
    [
        # tekst JSX w jednej linii i rozpisany na linie — renderowany wprost, skanowany
        ("<dt>Prąd zwarciowy I_th</dt>\n", 1),
        ("<label>\n  Czas trwania zwarcia t_k [s]\n</label>\n", 1),
        # wzór przez komponent (literał z segmentem `$…$`) i słowa — czyste
        ('<dt><TekstZWzorami tekst="Prąd $I_{th}$" /></dt>\n', 0),
        ("<dt>Prąd zwarciowy cieplny</dt>\n", 0),
        # kod w ciele JSX: wywołanie, wywołanie opcjonalne, ternarne gałęzie, komentarz blokowy
        ("<b>\n  fetchX(a.b_c, d)\n</b>\n", 0),
        ("<b>\n  onRowClick?.(x.up_id, x.down_id)\n</b>\n", 0),
        ("{ok\n  ? x.k_sc.toFixed(2)\n  : '—'}\n", 0),
        ("{/* ślad Z_Q wyżej,\n   oba scenariusze c_max/c_min */}\n", 0),
    ],
)
def test_skanuj_ts_tekst_jsx(tmp_path: Path, tresc: str, trafienia: int) -> None:
    """Iloczyn: {tekst w linii · tekst rozpisany} × {goły symbol · wzór `$…$` · słowa} oraz kod
    w ciele JSX (wywołania, ternarne gałęzie, komentarz) — tekst JSX nie jest literałem napisu,
    więc bez osobnego skanu goła etykieta `<dt>Prąd I_th</dt>` przechodziła niezauważona.
    """
    plik = tmp_path / "Komponent.tsx"
    plik.write_text(tresc, encoding="utf-8")
    assert len(guard.skanuj_ts(plik)) == trafienia
    # ten sam tekst w module `.ts` (bez JSX) nie jest skanowany jako tekst JSX
    plik_ts = tmp_path / "modul.ts"
    plik_ts.write_text(tresc, encoding="utf-8")
    assert len(guard.skanuj_ts(plik_ts)) <= trafienia


@pytest.mark.parametrize(
    ("literal", "trafiony"),
    [
        # podstawa jednoliterowa × {odstęp, bez odstępu}: proza i krótki napis są skanowane
        ("prąd I_k zwarcia", True),
        ("I_k", True),
        # podstawa wieloliterowa × odstęp: symbol w prozie
        ("współczynnik ALF_eff przekładnika", True),
        ("kolumna RX_min arkusza", True),
        # podstawa wieloliterowa × bez odstępu: identyfikator (źródło, klucz), nie proza
        ("norma:NC_RfG;std:DFIG_converter", False),
        ("RX_min", False),
        # podstawa wieloliterowa × indeks w klamrach: fragment segmentu `$…$` rozciętego f-stringiem
        ("$ALF_{eff} = ", False),
    ],
)
def test_goly_indeks_wieloliterowy_tylko_w_prozie(literal: str, trafiony: bool) -> None:
    """Iloczyn: podstawa {jedno-, wieloliterowa} × {literał z odstępem, bez odstępu} × {indeks
    goły, w klamrach}. Reguła wieloliterowa łapie `ALF_eff` w zdaniu, ale nie identyfikator
    źródła `std:DFIG_converter` (fałszywy alarm z towarzysza stacji SLD, 2026-11-05)."""
    powody = guard._dopasowania(literal)
    assert any("goly indeks" in p for p in powody) is trafiony, (literal, powody)
