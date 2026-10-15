"""Samotest `kolory_pod_motyw_guard.py` (karta KOLORY-ZASZYTE-POD-MOTYW, 2026-10-15).

Dowód czułości jako ILOCZYN CECH: każdy z trzech wzorców × każda rodzina barw ×
każdy odcień zakazany × z wariantem i bez (``hover:``, ``focus:``, ``md:``) ×
z przezroczystością i bez — jest łapany; klasy dozwolone (tokeny motywu, pełny
przycisk z białym napisem, jasne tło z ciemnym tuszem, rodziny neutralne,
komentarz) — nie. Skan katalogu przechodzi przez realne pliki w katalogu
tymczasowym (pomijanie ``__tests__`` i ``*.test.*``), a nie przez atrapę.
Deklaracje docstringu strażnika (kontrast białego napisu na pełnym przycisku,
nieczytelność tuszu 400 na białym panelu) są przypięte pomiarem (CLAUDE.md, reguła KLASA NIE INSTANCJA pkt 4).
"""

from __future__ import annotations

from pathlib import Path

import kolory_pod_motyw_guard as guard
import pytest

WARIANTY = ("", "hover:", "focus:", "md:", "group-hover:")


class TestWzorzecJasnegoTuszu:
    @pytest.mark.parametrize("rodzina", guard.RODZINY)
    @pytest.mark.parametrize("odcien", (50, 100, 200, 300, 400))
    @pytest.mark.parametrize("wariant", WARIANTY)
    def test_lapie(self, rodzina: str, odcien: int, wariant: str) -> None:
        klasa = f"{wariant}text-{rodzina}-{odcien}"
        assert [k for _n, k, _w in guard.naruszenia_tekstu(f'<p className="x {klasa}" />')] == [
            klasa
        ]

    @pytest.mark.parametrize("rodzina", guard.RODZINY)
    def test_lapie_z_przezroczystoscia(self, rodzina: str) -> None:
        assert guard.naruszenia_tekstu(f"'text-{rodzina}-100/80'")

    @pytest.mark.parametrize("odcien", (500, 600, 700, 800, 900))
    def test_ciemny_tusz_nie_jest_tym_wzorcem(self, odcien: int) -> None:
        assert guard.naruszenia_tekstu(f"'text-red-{odcien}'") == []


class TestWzorzecPolprzezroczystejPlamy:
    @pytest.mark.parametrize("rodzina", guard.RODZINY)
    @pytest.mark.parametrize("odcien", (400, 500, 600))
    @pytest.mark.parametrize("wariant", WARIANTY)
    def test_lapie(self, rodzina: str, odcien: int, wariant: str) -> None:
        klasa = f"{wariant}bg-{rodzina}-{odcien}/10"
        assert [k for _n, k, _w in guard.naruszenia_tekstu(f"'{klasa}'")] == [klasa]

    @pytest.mark.parametrize("odcien", (400, 500, 600))
    def test_pelne_tlo_nie_jest_tym_wzorcem(self, odcien: int) -> None:
        assert guard.naruszenia_tekstu(f"'bg-amber-{odcien}'") == []


class TestWzorzecCiemnegoTla:
    @pytest.mark.parametrize("rodzina", guard.RODZINY)
    @pytest.mark.parametrize(
        "klasa", ("bg-{r}-900", "bg-{r}-950", "bg-{r}-900/40", "bg-{r}-950/25", "bg-{r}-800/30")
    )
    def test_lapie(self, rodzina: str, klasa: str) -> None:
        tekst = klasa.format(r=rodzina)
        assert [k for _n, k, _w in guard.naruszenia_tekstu(f"'hover:{tekst}'")] == [
            f"hover:{tekst}"
        ]

    def test_pelne_tlo_800_przycisku_nie_jest_tym_wzorcem(self) -> None:
        # `active:bg-blue-800` na przycisku z białym napisem (RunButton).
        assert guard.naruszenia_tekstu("'bg-blue-600 text-white active:bg-blue-800'") == []


class TestKlasyDozwolone:
    @pytest.mark.parametrize(
        "tekst",
        [
            "'border-sygnal-info/45 bg-sygnal-info-tlo text-sygnal-info-tusz'",
            "'text-sygnal-blokada'",
            "'bg-scada-sn/10 text-scada-sn'",
            "'bg-blue-600 text-white hover:bg-blue-700'",
            "'bg-amber-50 text-amber-900 border-amber-200'",
            "'text-slate-300 bg-slate-900 text-zinc-200 bg-zinc-950/40'",
            "'border-red-400/30 ring-cyan-500 accent-cyan-400'",
            "'text-red-1000 text-redx-300 xtext-red-300'",
        ],
    )
    def test_nie_lapie(self, tekst: str) -> None:
        assert guard.naruszenia_tekstu(tekst) == []

    @pytest.mark.parametrize(
        "wiersz",
        [
            " * dawne `text-cyan-100` na `bg-cyan-500/10`",
            "  // text-amber-200 było nieczytelne",
            "/* bg-red-950/30 */",
            "      {/* text-emerald-300 */}",
        ],
    )
    def test_wiersz_komentarza_jest_pomijany(self, wiersz: str) -> None:
        assert guard.naruszenia_tekstu(wiersz) == []

    def test_numer_wiersza_i_kolejnosc_sa_deterministyczne(self) -> None:
        tekst = "a\n'bg-red-950 text-red-200'\nb\n'text-cyan-300'\n"
        assert [(n, k) for n, k, _w in guard.naruszenia_tekstu(tekst)] == [
            (2, "bg-red-950"),
            (2, "text-red-200"),
            (4, "text-cyan-300"),
        ]


def _zapisz(katalog: Path, nazwa: str, tresc: str) -> Path:
    sciezka = katalog / nazwa
    sciezka.parent.mkdir(parents=True, exist_ok=True)
    sciezka.write_text(tresc, encoding="utf-8")
    return sciezka


class TestSkanKatalogu:
    def test_komponent_z_naruszeniem_jest_czerwony(self, tmp_path: Path) -> None:
        _zapisz(tmp_path, "ui/panel/A.tsx", "const x = 'bg-cyan-500/10 text-cyan-100';\n")
        _zapisz(tmp_path, "ui/panel/b.ts", "export const T = { ok: 'text-emerald-300' };\n")
        liczba, meldunki = guard.sprawdz((tmp_path,))
        assert liczba == 2
        assert len(meldunki) == 3
        assert any("A.tsx:1: text-cyan-100" in m for m in meldunki)
        assert any("b.ts:1: text-emerald-300" in m for m in meldunki)

    def test_testy_i_specy_sa_pomijane(self, tmp_path: Path) -> None:
        _zapisz(tmp_path, "ui/__tests__/A.test.tsx", "'text-cyan-100'\n")
        _zapisz(tmp_path, "ui/panel/B.test.tsx", "'text-cyan-100'\n")
        _zapisz(tmp_path, "ui/panel/C.spec.ts", "'text-cyan-100'\n")
        _zapisz(tmp_path, "ui/panel/D.css", ".x { color: red; } /* text-cyan-100 */\n")
        assert guard.sprawdz((tmp_path,)) == (0, [])

    def test_czysty_katalog_jest_zielony(self, tmp_path: Path) -> None:
        _zapisz(tmp_path, "ui/A.tsx", "'bg-sygnal-uwaga-tlo text-sygnal-uwaga-tusz'\n")
        assert guard.sprawdz((tmp_path,)) == (1, [])

    def test_lista_dozwolona_jest_pusta(self) -> None:
        assert guard.DOZWOLONE == {}


class TestWzorzecBialegoNapisu:
    @pytest.mark.parametrize(
        "wiersz,klasa",
        [
            ("'bg-blue-500 text-white hover:bg-blue-700'", "bg-blue-500"),
            ("'bg-blue-600 text-white hover:bg-blue-500'", "hover:bg-blue-500"),
            ("'text-white bg-green-600'", "bg-green-600"),
            ("'bg-amber-600 text-white'", "bg-amber-600"),
            ("'bg-red-500 text-white'", "bg-red-500"),
            ("'bg-sky-100 text-white'", "bg-sky-100"),
        ],
    )
    def test_lapie(self, wiersz: str, klasa: str) -> None:
        assert [k for _n, k, _w in guard.naruszenia_tekstu(wiersz)] == [klasa]

    @pytest.mark.parametrize(
        "wiersz",
        [
            "'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'",
            "'bg-red-700 text-white hover:bg-red-600'",
            "'bg-green-700 text-white hover:bg-green-800'",
            "'bg-cyan-700 text-white'",
            # Bez białego napisu pełne tło nie jest tym wzorcem (kropka stanu).
            "'h-2 w-2 rounded-full bg-amber-400'",
            # Tło półprzezroczyste łapie wzorzec 2, nie 4 (jedno naruszenie, nie dwa).
        ],
    )
    def test_nie_lapie(self, wiersz: str) -> None:
        assert guard.naruszenia_tekstu(wiersz) == []

    def test_plama_z_bialym_napisem_jest_jednym_naruszeniem(self) -> None:
        wynik = guard.naruszenia_tekstu("'bg-blue-500/10 text-white'")
        assert [(k, w) for _n, k, w in wynik] == [
            ("bg-blue-500/10", "półprzezroczysta plama nasyconej barwy")
        ]


class TestTabelaPalety:
    @pytest.mark.parametrize(
        "rodzina,odcien,oczekiwany",
        [("blue", 600, 5.17), ("cyan", 700, 5.36), ("green", 700, 5.02), ("blue", 500, 3.68)],
    )
    def test_kontrast_bialego_zgodny_z_pomiarem(
        self, rodzina: str, odcien: int, oczekiwany: float
    ) -> None:
        assert guard.kontrast_bialego(rodzina, odcien) == pytest.approx(oczekiwany, abs=0.01)

    def test_tabela_pokrywa_kazda_rodzine_i_odcien(self) -> None:
        assert set(guard.PALETA) == set(guard.RODZINY)
        for rodzina, odcienie in guard.PALETA.items():
            assert sorted(odcienie) == [300, 400, 500, 600, 700, 800], rodzina

    @pytest.mark.parametrize("rodzina", guard.RODZINY)
    def test_odcien_400_jako_tekst_na_bialym_panelu_jest_nieczytelny(self, rodzina: str) -> None:
        """Deklaracja docstringu (wzorzec 1): tusz 400 na białym panelu ≤ 2,98:1."""
        assert guard.kontrast_bialego(rodzina, 400) < 3.0

    @pytest.mark.parametrize("rodzina", guard.RODZINY)
    @pytest.mark.parametrize("odcien", (700, 800))
    def test_pelne_tlo_700_800_niesie_bialy_napis(self, rodzina: str, odcien: int) -> None:
        """Wyłączenie pełnych przycisków 700/800 z białym napisem jest uczciwe:
        kontrast ≥ 4,5:1 niezależnie od motywu."""
        assert guard.kontrast_bialego(rodzina, odcien) >= 4.5


def test_repozytorium_jest_zielone() -> None:
    """Front repozytorium: skan nie jest pusty i zero naruszeń."""
    liczba, meldunki = guard.sprawdz()
    assert liczba > 500
    assert meldunki == []
