"""Tabela metryk krojów schematu SLD v3 (karta UX-04/POLE-LINIOWE-WZORZEC, decyzje §11.7 pkt 7
i pkt 5): posuwy znaków (szerokość) i zasięgi pionowe (wznoszenie, zejście, tusz glifów).

Przypina: (1) świeżość ``frontend/src/ui/sld/v3/core/metrykiKroju.json`` względem plików kroju
(generator ``scripts/metryki_kroju_sld.py --sprawdz``; pliki z pakietu ``fonts-liberation``,
obecnego na obrazach CI ``ubuntu-latest`` jako zależność przeglądarki), (2) czytnik TTF na
znanych posuwach Liberation Sans (zgodnych metrycznie z Arial), (3) JEDNO źródło metryk:
importer symboli QET czyta tę samą tabelę i ten sam krój, a pomiar tekstu kanwy
(``core/text.ts``) i zawijanie etykiet widoku domeny nN (``lv-domain/visualGrammar.ts``) nie
niosą stałego szacunku szerokości znaku, (4) zachowanie fail-closed generatora na brakującym
pliku kroju.
"""

from __future__ import annotations

import importlib.util
import json
import re
import shutil
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = PROJECT_ROOT / "scripts"
FRONTEND_SLD = PROJECT_ROOT / "frontend" / "src" / "ui" / "sld"


def _load_script(module_name: str):
    script_path = SCRIPTS_DIR / f"{module_name}.py"
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load script module: {script_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


metryki = _load_script("metryki_kroju_sld")
qet = _load_script("import_qet_pole_sn")


def test_tabela_w_repozytorium_zgodna_z_plikami_kroju(capsys):
    assert metryki.main(["--sprawdz"]) == 0, capsys.readouterr().out


def test_tabela_generowana_deterministycznie():
    assert metryki.tekst_tabeli(metryki.zbuduj_tabele()) == metryki.tekst_tabeli(
        metryki.zbuduj_tabele()
    )


def test_czytnik_ttf_zna_posuwy_arial():
    """Posuwy Liberation Sans Regular = Arial (jednostki 2048): spacja 569, cyfry 1139, „W” 1933."""
    jednostki, posuwy = metryki.posuwy_kroju(metryki.KATALOG_KROJU / "LiberationSans-Regular.ttf")
    assert jednostki == 2048
    assert posuwy[ord(" ")] == 569
    assert {posuwy[ord(c)] for c in "0123456789"} == {1139}
    assert posuwy[ord("W")] == 1933
    assert posuwy[ord("ł")] == 455


def test_mono_staly_posuw():
    _, posuwy = metryki.posuwy_kroju(metryki.KATALOG_KROJU / "LiberationMono-Regular.ttf")
    assert {posuwy[ord(c)] for c in "0123456789AWMiłż·"} == {1229}


def test_importer_qet_czyta_te_sama_tabele_i_kroj():
    assert qet.TABELA_KROJU == metryki.WYJSCIE
    tabela = metryki.wczytaj_tabele()
    kroj = tabela["kroje"][qet.KROJ_TEKSTU_QET]
    assert kroj["kroj"] == "Liberation Sans"
    posuwy = kroj["posuwy"][qet.WAGA_TEKSTU_QET]
    for znak, posuw in zip(kroj["znaki"], posuwy, strict=True):
        assert qet.SZEROKOSC_ZNAKU_EM[znak] == posuw / tabela["jednostkiEm"]
    # Pion z tej samej tabeli: linia centralna (wznoszenie − zejście)/2 i tusz glifów.
    pion = kroj["pionowe"][qet.WAGA_TEKSTU_QET]
    em = tabela["jednostkiEm"]
    assert qet.LINIA_CENTRALNA_EM == (pion["wznoszenie"] - pion["zejscie"]) / 2 / em
    for znak, dol, gora in zip(kroj["znaki"], pion["tuszDol"], pion["tuszGora"], strict=True):
        assert qet.TUSZ_ZNAKU_EM[znak] == (dol / em, gora / em)


def test_czytnik_ttf_zna_zasiegi_pionowe_liberation_sans():
    """``hhea`` Liberation Sans (= Arial): wznoszenie 1854, zejście 434; tusz cyfry „3” (zwykła)
    sięga 1430 nad linię bazową, „M” 1409 (wysokość wersalików), spacja bez tuszu."""
    (wznoszenie, zejscie), zasiegi = metryki.zasiegi_pionowe_kroju(
        metryki.KATALOG_KROJU / "LiberationSans-Regular.ttf"
    )
    assert (wznoszenie, zejscie) == (1854, 434)
    assert zasiegi[ord("3")][1] == 1430
    assert zasiegi[ord("M")] == (0, 1409)
    assert zasiegi[ord(" ")] == (0, 0)
    assert zasiegi[ord("p")][0] < 0


def test_importer_qet_mierzy_odmiane_rysowana():
    """Renderer rysuje litery symboli wagą CSS 600 → odmiana 700 (CSS Fonts 4 §5.2); importer
    liczy obwiednię i środek litery tą odmianą i zapisuje ją do pliku TS."""
    cad = (FRONTEND_SLD / "v3" / "cad" / "CadSymbol.tsx").read_text(encoding="utf-8")
    assert "export const WAGA_LITERY_SYMBOLU = 600;" in cad
    assert qet.WAGA_TEKSTU_QET == "700"
    wyjscie = (FRONTEND_SLD / "v3" / "cad" / "qet" / "qetPoleSn.ts").read_text(encoding="utf-8")
    assert "export const QET_ODMIANA_KROJU_LITER = '700';" in wyjscie


def test_pomiar_tekstu_bez_stalego_szacunku_szerokosci_znaku():
    """Kanwa i domena nN mierzą tabelą — żadnego „0,62 em na znak” ani limitu znaków z ułamka em."""
    text_ts = (FRONTEND_SLD / "v3" / "core" / "text.ts").read_text(encoding="utf-8")
    assert "import metrykiKroju from './metrykiKroju.json';" in text_ts
    zakazane = re.compile(
        r"AVG_GLYPH_WIDTH_FACTOR|CHAR_WIDTH_RATIO|limitZnakow|labelCharWidthFactor"
    )
    naruszenia = []
    for plik in sorted(FRONTEND_SLD.rglob("*.ts*")):
        if "__tests__" in plik.parts or plik.name.endswith((".test.ts", ".test.tsx")):
            continue
        for nr, linia in enumerate(plik.read_text(encoding="utf-8").splitlines(), start=1):
            if zakazane.search(linia):
                naruszenia.append(f"{plik.relative_to(PROJECT_ROOT)}:{nr}: {linia.strip()}")
    assert naruszenia == []


def test_generator_przerywa_bez_pliku_kroju(tmp_path):
    for nazwa in ("LiberationSans-Regular.ttf", "LiberationSans-Bold.ttf"):
        shutil.copy(metryki.KATALOG_KROJU / nazwa, tmp_path / nazwa)
    with pytest.raises(metryki.BladKroju, match="LiberationMono-Regular.ttf"):
        metryki.zbuduj_tabele(tmp_path)


def test_generator_przerywa_na_uszkodzonym_kroju(tmp_path):
    for nazwa in {n for _, _, pliki in metryki.KROJE.values() for n in pliki.values()}:
        shutil.copy(metryki.KATALOG_KROJU / nazwa, tmp_path / nazwa)
    plik = tmp_path / "LiberationSans-Bold.ttf"
    dane = bytearray(plik.read_bytes())
    indeks = dane.find(b"hmtx")
    assert indeks > 0
    dane[indeks : indeks + 4] = b"xxxx"
    plik.write_bytes(bytes(dane))
    with pytest.raises(metryki.BladKroju, match="hmtx"):
        metryki.zbuduj_tabele(tmp_path)


def test_tabela_json_zgodna_z_odczytem():
    tabela = json.loads(metryki.WYJSCIE.read_text(encoding="utf-8"))
    assert set(tabela["kroje"]) == {"sans", "mono"}
    for dane in tabela["kroje"].values():
        n = len(dane["znaki"])
        assert {waga: len(p) for waga, p in dane["posuwy"].items()} == {"400": n, "700": n}
        assert set(dane["pionowe"]) == {"400", "700"}
        for pion in dane["pionowe"].values():
            assert pion["wznoszenie"] > 0 and pion["zejscie"] > 0
            assert len(pion["tuszDol"]) == n and len(pion["tuszGora"]) == n
            assert all(d <= g for d, g in zip(pion["tuszDol"], pion["tuszGora"], strict=True))
