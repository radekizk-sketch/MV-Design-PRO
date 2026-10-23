"""Samotest `slad_proza_bez_latex_guard.py` (karta DOWOD-CIEPLNY, 2026-09-25).

Dowód czułości: predykat ŁAPIE każdy znacznik z kontraktu (``$$``, ``$…$``,
``\\mathrm``, ``\\frac``, ``\\cdot``, ``\\sqrt``, ``\\left``, ``_{``, ``^{``) w każdym
polu prozy, a NIE łapie prozy inżynierskiej ze znakami Unicode ani pól ``*_latex``.
Skan korpusu (JSON i moduł GENERATED TS) przechodzi przez realne pliki w katalogu
tymczasowym, a nie przez atrapę funkcji skanu. Deklaracja bez testu jest fałszywą
pewnością (CLAUDE.md, reguła KLASA NIE INSTANCJA pkt 4).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import slad_proza_bez_latex_guard as guard


class TestPredykatZnacznikow:
    @pytest.mark.parametrize(
        "tekst",
        [
            "$$t_k = 1\\ \\mathrm{s}$$",
            "Warunek $I \\le I_z$ spełniony",
            "\\mathrm{A}",
            "\\frac{1}{2}",
            "0.95 \\cdot 1.05",
            "\\sqrt{3}",
            "\\left(0.1 + j 0.4\\right)",
            "P_{st,i}",
            "e^{-3}",
        ],
    )
    def test_lapie_kazdy_znacznik_kontraktu(self, tekst: str) -> None:
        assert guard.znaczniki_latex(tekst)

    @pytest.mark.parametrize(
        "tekst",
        [
            "Aparat Sprzęgło Q1 nie ma przypisanego zabezpieczenia; przyjęto 1 s.",
            "I_th ≤ I_th(1s) / √t",
            "P_st_i = 0.3 · 0.215 / 37.9713 MVA",
            "i_inj[3] = -1 (pu); V = Z_bus @ i_inj",
            "Σ = 1234.5 ≈ 1234.6",
            "S = √3 · U · I / 10^6",
            "Koszt 5 $ za sztukę",
        ],
    )
    def test_nie_lapie_prozy_inzynierskiej(self, tekst: str) -> None:
        assert guard.znaczniki_latex(tekst) == []


class TestKlasyfikacjaPol:
    @pytest.mark.parametrize(
        "pole", ["substitution", "notes", "title", "unit_check", "symbol", "substitution_pl"]
    )
    def test_pola_prozy(self, pole: str) -> None:
        assert guard.jest_polem_prozy(pole)

    @pytest.mark.parametrize("pole", ["formula_latex", "substitution_latex", "formula", "key"])
    def test_pola_nie_prozy(self, pole: str) -> None:
        assert not guard.jest_polem_prozy(pole)

    @pytest.mark.parametrize("pole", ["substitution", "notes", "title", "result_pl", "symbol"])
    def test_latex_w_kazdym_polu_prozy_to_naruszenie(self, pole: str) -> None:
        krok = {"formula_latex": "x", pole: "\\frac{1}{2}"}
        assert [p for p, _ in guard.naruszenia_kroku(krok)] == [pole]

    def test_latex_w_polu_latex_nie_jest_naruszeniem(self) -> None:
        krok = {"formula_latex": "I_{th} \\le I_{dop}", "substitution_latex": "\\frac{1}{2}"}
        assert guard.naruszenia_kroku(krok) == []

    @pytest.mark.parametrize("pole", ["formula_latex", "substitution_latex"])
    def test_ogranicznik_w_polu_latex_to_naruszenie(self, pole: str) -> None:
        krok = {"formula_latex": "x", pole: "$$x = 1$$"}
        assert [p for p, _ in guard.naruszenia_kroku(krok)] == [pole]


class TestRozpoznanieKroku:
    def test_krok_rozpoznany_po_polu_kroku_takze_zagniezdzony(self) -> None:
        dane = {"a": [{"x": {"substitution": "\\cdot"}}], "b": {"notes": "\\cdot"}}
        sciezki = [s for s, _ in guard.kroki_sladu(dane)]
        # `b` nie ma pola kroku — to nie jest krok śladu (np. rekord werdyktu z prozą
        # zawierającą wzory inline renderowane przez `TekstZWzorami`).
        assert sciezki == ["/a[0]/x"]


def _zapisz(katalog: Path, nazwa: str, tresc: str) -> Path:
    sciezka = katalog / nazwa
    sciezka.parent.mkdir(parents=True, exist_ok=True)
    sciezka.write_text(tresc, encoding="utf-8")
    return sciezka


class TestSkanKorpusu:
    def test_json_z_naruszeniem_jest_czerwony(self, tmp_path: Path) -> None:
        _zapisz(
            tmp_path,
            "gen/a.json",
            json.dumps({"kroki": [{"substitution": "$$t_k = 1\\ \\mathrm{s}$$"}]}),
        )
        dokumenty, kroki, meldunki = guard.sprawdz((tmp_path,))
        assert (dokumenty, kroki) == (1, 1)
        assert len(meldunki) == 1 and "substitution" in meldunki[0]

    def test_json_z_bom_jest_czytany(self, tmp_path: Path) -> None:
        sciezka = tmp_path / "bom.json"
        sciezka.write_bytes(b"\xef\xbb\xbf" + json.dumps({"substitution": "ok"}).encode())
        assert guard.sprawdz((tmp_path,))[:2] == (1, 1)

    def test_modul_generated_ts_jest_skanowany(self, tmp_path: Path) -> None:
        literal = json.dumps({"T1": {"trace": [{"key": "Ikss", "substitution": "\\frac{1}{2}"}]}})
        _zapisz(
            tmp_path,
            "companions/sc.ts",
            "/**\n * GENERATED — DO NOT EDIT BY HAND.\n */\n"
            f"export const X: Readonly<Record<string, unknown>> = {literal};\n",
        )
        _dokumenty, kroki, meldunki = guard.sprawdz((tmp_path,))
        assert kroki == 1 and len(meldunki) == 1

    def test_zwykly_modul_ts_jest_pomijany(self, tmp_path: Path) -> None:
        _zapisz(tmp_path, "a.ts", "export const substitution = '\\\\frac{1}{2}';\n")
        assert guard.sprawdz((tmp_path,)) == (0, 0, [])

    def test_czysty_korpus_jest_zielony(self, tmp_path: Path) -> None:
        _zapisz(
            tmp_path,
            "a.json",
            json.dumps(
                {"substitution_latex": "t_k = 1\\ \\mathrm{s}", "notes": "Założenie przypadku."}
            ),
        )
        assert guard.sprawdz((tmp_path,)) == (1, 1, [])

    def test_lista_dozwolona_jest_pusta(self) -> None:
        assert guard.DOZWOLONE == frozenset()


def test_regula_znacznikow_frontu_jest_ta_sama_co_straznika() -> None:
    """Predykaty parami z jednego źródła: bramka treści specy zrzutowych
    (`frontend/e2e/trescMatematyczna.ts`) i ten strażnik muszą łapać TE SAME znaczniki —
    inaczej ekran przepuści zapis, który strażnik fikstur by zatrzymał (albo odwrotnie).
    """
    import re

    zrodlo = (guard.FRONTEND / "e2e" / "trescMatematyczna.ts").read_text(encoding="utf-8")
    dopasowanie = re.search(r"export const ZNACZNIKI_LATEX = /(.+)/;", zrodlo)
    assert dopasowanie is not None
    assert dopasowanie.group(1) == guard.ZNACZNIKI_LATEX.pattern


def test_repozytorium_jest_zielone() -> None:
    """Korpus repozytorium: kroki istnieją (skan nie jest pusty) i zero naruszeń."""
    _dokumenty, kroki, meldunki = guard.sprawdz()
    assert kroki > 0
    assert meldunki == []
