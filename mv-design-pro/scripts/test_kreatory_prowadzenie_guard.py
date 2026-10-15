"""Samotest `kreatory_prowadzenie_guard.py` (karta PROWADZENIE-KREATORY, 2026-10-15).

Czułość jako ILOCZYN CECH: każda reguła tekstu × (kod / komentarz wierszowy / blok
komentarza), przycisk zapisu × (blokada od zapisu / od kompletności / negacja / inny
przycisk), akcja główna × (z „zablokowana” / bez), rama × (kształt poprawny / pole
„zablokowana” / lista blokad poszerzona). Skan katalogu idzie przez realne pliki
w katalogu tymczasowym (pomijanie ``__tests__`` i ``*.test.*``). Drzewo repo jest
przypięte: strażnik na nim nie zgłasza naruszeń (deklaracja docstringu „lista
dozwolona pusta” ma test — reguła KLASA NIE INSTANCJA pkt 4).
"""

from __future__ import annotations

from pathlib import Path

import kreatory_prowadzenie_guard as guard
import pytest

TEKSTY_ZAKAZANE = (
    "'Uzupełnij wymagane pola, aby zapisać stację.'",
    "'Uzupełnij dane odbioru.'",
    "'Brakuje: wymagane pola formularza'",
    "wartosc: 'Do konfiguracji',",
    "wartosc: 'Do doboru'",
    "'Do uzupełnienia'",
    "`przyjęto: ${kv} (szyna)`",
    "'rozjazd nazywa walidator (W-W5-01).'",
    "'dług B-3 prowadzony osobno'",
    "'standard (V12K-066)'",
)

TEKSTY_DOZWOLONE = (
    "'Wybierz napięcie strony nN — od niego zależy dobór transformatora.'",
    "'Do wskazania na schemacie'",
    "'Przekładnik 5P20 (PN-EN 61869-2)'",
    "'Blok L-L-T'",
    "'Brak certyfikatu = niekompletne dane do badań przyłączeniowych.'",
)


class TestRegulaTekstu:
    @pytest.mark.parametrize("tekst", TEKSTY_ZAKAZANE)
    def test_kod_lapany(self, tekst: str) -> None:
        assert guard.naruszenia_tekstu(f"const T = {{ a: {tekst} }};")

    @pytest.mark.parametrize("tekst", TEKSTY_ZAKAZANE)
    @pytest.mark.parametrize("prefiks", ("// ", " * ", "/* ", "{/* "))
    def test_komentarz_wierszowy_pomijany(self, tekst: str, prefiks: str) -> None:
        assert guard.naruszenia_tekstu(f"{prefiks}{tekst}") == []

    @pytest.mark.parametrize("tekst", TEKSTY_ZAKAZANE)
    def test_blok_komentarza_wielowierszowy_pomijany(self, tekst: str) -> None:
        zrodlo = f"x = 1;\n/* opis historii\n   {tekst}\n*/\ny = 2;"
        assert guard.naruszenia_tekstu(zrodlo) == []

    def test_numer_wiersza_po_bloku_komentarza(self) -> None:
        zrodlo = "/* a\nb */\nconst t = 'Do doboru';"
        assert [nr for nr, _n, _d in guard.naruszenia_tekstu(zrodlo)] == [3]

    @pytest.mark.parametrize("tekst", TEKSTY_DOZWOLONE)
    def test_teksty_dozwolone(self, tekst: str) -> None:
        assert guard.naruszenia_tekstu(f"const T = {{ a: {tekst} }};") == []


class TestZnacznikPochodzenia:
    @pytest.mark.parametrize(
        "zrodlo",
        (
            "<PoleWyboru przyjeto={znacznik('x')} />",
            '<span className="mvd-pole-przyjeto">x</span>',
        ),
    )
    def test_lapany(self, zrodlo: str) -> None:
        assert guard.naruszenia_znacznika(zrodlo)

    def test_zwykle_pole_bez_znacznika(self) -> None:
        assert guard.naruszenia_znacznika("<PoleWyboru wartosc={x} />") == []


class TestAkcjaGlowna:
    def test_zablokowana_lapana(self) -> None:
        zrodlo = (
            "<KreatorRama\n  akcjaGlowna={{\n    etykieta: T.zapisz,\n"
            "    onClick: f,\n    zablokowana: !kompletne,\n  }}\n/>"
        )
        assert guard.naruszenia_akcji_glownej(zrodlo) == [2]

    def test_blokada_z_listy_dozwolona(self) -> None:
        zrodlo = "akcjaGlowna={{ etykieta: T.zapisz, onClick: f, blokada: zapisWToku ? 'zapis_w_toku' : null }}"
        assert guard.naruszenia_akcji_glownej(zrodlo) == []

    def test_krok_dalej_moze_byc_zablokowany(self) -> None:
        zrodlo = "krokDalej={{ etykieta: 'Dalej', onClick: f, zablokowana: ostatni }}"
        assert guard.naruszenia_akcji_glownej(zrodlo) == []


def _przycisk(testid: str, disabled: str | None) -> str:
    atrybut = f"\n  disabled={{{disabled}}}" if disabled is not None else ""
    return (
        f'<button\n  type="button"\n  onClick={{() => void onZapisz()}}{atrybut}\n'
        f"  data-testid={testid}\n>\n  {{T.zapisz}}\n</button>"
    )


class TestPrzyciskZapisu:
    @pytest.mark.parametrize("wyrazenie", ("zapisywanie", "zapisWToku", "zapisywanie || ladowanie"))
    def test_blokada_trwajacego_zapisu_dozwolona(self, wyrazenie: str) -> None:
        assert guard.naruszenia_przycisku_zapisu(_przycisk('"edytor-zapisz"', wyrazenie)) == []

    @pytest.mark.parametrize(
        "wyrazenie",
        ("zapisywanie || !caseId", "!kompletne", "!gotoweWejscie || ladowanie", "brakDanych"),
    )
    @pytest.mark.parametrize("testid", ('"edytor-zapisz"', "{`${testid}-zapisz`}"))
    def test_blokada_od_kompletnosci_lapana(self, wyrazenie: str, testid: str) -> None:
        assert guard.naruszenia_przycisku_zapisu(_przycisk(testid, wyrazenie))

    def test_inny_przycisk_moze_byc_wyszarzony(self) -> None:
        assert guard.naruszenia_przycisku_zapisu(_przycisk('"dobor-zastosuj"', "!moznaZastosowac")) == []

    def test_przycisk_bez_disabled(self) -> None:
        assert guard.naruszenia_przycisku_zapisu(_przycisk('"edytor-zapisz"', None)) == []


RAMA_OK = """export interface AkcjaZapisu {
  readonly etykieta: string;
  readonly onClick: () => void;
  readonly blokada?: BlokadaZapisu | null;
}"""
PROWADZENIE_OK = "export type BlokadaZapisu = 'ladowanie' | 'zapis_w_toku';"


class TestRama:
    def test_poprawny_ksztalt(self) -> None:
        assert guard.naruszenia_ramy(RAMA_OK, PROWADZENIE_OK) == []

    def test_pole_zablokowana_lapane(self) -> None:
        rama = RAMA_OK.replace("  readonly blokada", "  readonly zablokowana?: boolean;\n  readonly blokada")
        assert guard.naruszenia_ramy(rama, PROWADZENIE_OK)

    def test_poszerzona_lista_blokad_lapana(self) -> None:
        prowadzenie = "export type BlokadaZapisu = 'ladowanie' | 'zapis_w_toku' | 'niekompletne';"
        assert guard.naruszenia_ramy(RAMA_OK, prowadzenie)


def _drzewo(tmp_path: Path, plik_kreatora: str) -> Path:
    korzen = tmp_path / "kreatory"
    (korzen / "rama").mkdir(parents=True)
    (korzen / "rama" / "KreatorRama.tsx").write_text(RAMA_OK, encoding="utf-8")
    (korzen / "rama" / "prowadzenie.ts").write_text(PROWADZENIE_OK, encoding="utf-8")
    (korzen / "odbior").mkdir()
    (korzen / "odbior" / "strings.ts").write_text(plik_kreatora, encoding="utf-8")
    (korzen / "odbior" / "__tests__").mkdir()
    (korzen / "odbior" / "__tests__" / "x.test.tsx").write_text("'Do doboru'", encoding="utf-8")
    (korzen / "odbior" / "y.test.ts").write_text("'Do doboru'", encoding="utf-8")
    return korzen


class TestSkanKatalogu:
    def test_naruszenie_w_kreatorze_zgloszone_z_wierszem(self, tmp_path: Path) -> None:
        korzen = _drzewo(tmp_path, "export const T = {\n  a: 'Do doboru',\n};\n")
        naruszenia = guard.sprawdz(korzen)
        assert naruszenia == ["odbior/strings.ts:2: status pracy w toku: „Do doboru”"]

    def test_testy_pomijane(self, tmp_path: Path) -> None:
        korzen = _drzewo(tmp_path, "export const T = { a: 'Wybierz typ — po co' };\n")
        assert guard.sprawdz(korzen) == []

    def test_brak_ramy_zgloszony(self, tmp_path: Path) -> None:
        korzen = tmp_path / "pusto"
        korzen.mkdir()
        assert guard.sprawdz(korzen)


def test_drzewo_repo_bez_naruszen() -> None:
    assert guard.sprawdz() == []
