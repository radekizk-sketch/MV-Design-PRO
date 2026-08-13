"""Bramka przeciw dryfowi materialu oceny: strona pokazuje ZAWARTOSC KATALOGU (KD-13).

DLACZEGO. `docs/audit/visual/generuj_strone_oceny.py` osadzal SZESC zrzutow wskazanych
w kodzie na sztywno, podczas gdy w `docs/audit/visual/**` lezalo 299 plikow w 9 seriach —
cala seria `flow-ekspert` (116 plikow, komplet ekranow biezacego programu kart) byla dla
strony NIEWIDOCZNA. Wlasciciel ocenia ekrany wlasnie na tej stronie (dyrektywa nr 8), wiec
zrzut poza strona jest praca, ktorej nikt nie zobaczy. Przyczyna zrodlowa to nie „brakujace
wpisy", tylko LISTA W KODZIE: dryfuje po cichu przy kazdym nowym zrzucie.

CO TA BRAMKA ROBI. Generuje strone do katalogu tymczasowego i sprawdza, ze KAZDY plik `.png`
z `docs/audit/visual/**` jest z niej osiagalny. Czerwony test nazywa konkretne pliki, ktore
wypadly — bez tego komunikat („strona niekompletna") nie prowadzilby do naprawy.

DLACZEGO TU, A NIE W `scripts/`. `scripts/` trzyma STRAZNIKOW repo wolanych z workflowow;
tu chodzi o test kontraktu jednego generatora dokumentacji — to samo miejsce, co
`test_docs_count_consistency_guard.py`. `tests/ci` biegnie w `python-tests.yml` przez
`poetry run pytest -q`, wiec bramka wykonuje sie w CI od pierwszego dnia (guard, ktorego
nikt nie wola, jest gorszy niz jego brak).

CZULOSC — sprawdzona, nie zalozona. Dolozenie jednego tymczasowego PNG do serii
(kopia katalogu + przywrocenie bajtowe) daje czerwony z nazwa tego pliku; po usunieciu
zielony. Pomiar w meldunku karty KD-13.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

MV = Path(__file__).resolve().parents[3]
WIZUALNE = MV / "docs" / "audit" / "visual"
GENERATOR = WIZUALNE / "generuj_strone_oceny.py"

_spec = importlib.util.spec_from_file_location("generator_strony_oceny", GENERATOR)
assert _spec is not None and _spec.loader is not None
generator = importlib.util.module_from_spec(_spec)
sys.modules["generator_strony_oceny"] = generator
_spec.loader.exec_module(generator)

#: Data przekazywana z zewnatrz — tresc porownywana testem nie moze zalezec od zegara.
DATA = "2026-08-01"


def _zrzuty(katalog: Path) -> list[str]:
    return sorted(p.relative_to(katalog).as_posix() for p in katalog.rglob("*.png"))


def _nieosiagalne(strona: str, katalog: Path) -> list[str]:
    """Pliki, ktorych strona nie osiaga — ani sciezka, ani podpis z ta sciezka."""
    return [zrzut for zrzut in _zrzuty(katalog) if zrzut not in strona]


def test_strona_osiaga_kazdy_zrzut_w_repozytorium(tmp_path: Path) -> None:
    """Bramka wlasciwa: zaden zrzut z `docs/audit/visual/**` nie wypada ze strony."""
    strona = generator.zbuduj_strone(WIZUALNE, DATA)
    (tmp_path / "ocena.html").write_text(strona, encoding="utf-8")

    brakujace = _nieosiagalne(strona, WIZUALNE)
    assert brakujace == [], (
        f"strona oceny nie pokazuje {len(brakujace)} zrzutow z docs/audit/visual/** — "
        "wlasciciel ich nie zobaczy. Pliki: " + ", ".join(brakujace[:20])
    )


def test_strona_osiaga_zrzuty_takze_w_trybie_osadzonym() -> None:
    """Tryb `--osadz` zamienia `src` na data URI, ale sciezka zostaje w podpisie.

    Bez tego publikacja jako artefakt (gdzie odwolania zewnetrzne sa zakazane) omijalaby
    bramke: obraz bylby na stronie, a plik formalnie „nieosiagalny".
    """
    strona = generator.zbuduj_strone(WIZUALNE, DATA, frozenset({"fk7"}))
    assert "data:image/" in strona, "tryb osadzony nie osadzil ani jednego obrazu"
    assert _nieosiagalne(strona, WIZUALNE) == []


def test_naglowek_nie_klamie_o_liczbach() -> None:
    """Liczba serii i zrzutow w naglowku pochodzi z pomiaru, nie z tekstu wpisanego recznie."""
    serie = generator.serie_katalogu(WIZUALNE)
    strona = generator.zbuduj_strone(WIZUALNE, DATA)
    assert f"serii: {len(serie)}" in strona
    assert f"zrzutów: {len(_zrzuty(WIZUALNE))}" in strona
    assert DATA in strona


def test_ta_sama_zawartosc_daje_bajtowo_ta_sama_strone() -> None:
    """Determinizm: kolejnosc serii z mapy, kolejnosc kadrow z sortowania nazw."""
    assert generator.zbuduj_strone(WIZUALNE, DATA) == generator.zbuduj_strone(WIZUALNE, DATA)


def test_seria_spoza_mapy_etykiet_nie_znika(tmp_path: Path) -> None:
    """Katalog bez wpisu w `MAPA_SERII` dostaje etykiete z nazwy — NIGDY pominiecie."""
    (tmp_path / "nowa-seria").mkdir()
    (tmp_path / "nowa-seria" / "ekran-light.png").write_bytes(b"x")

    strona = generator.zbuduj_strone(tmp_path, DATA)
    assert "nowa-seria/ekran-light.png" in strona
    assert "nowa-seria" in strona
    assert "MAPA_SERII" in strona, "brak wskazowki, gdzie dopisac opis serii"


def test_para_motywow_stoi_w_jednym_kaflu(tmp_path: Path) -> None:
    """Para `-light`/`-dark` = jeden kafel z dwoma kadrami; zrzut bez pary = kafel osobny."""
    kafle = generator.kafle_serii(
        [
            "s/ekran-dark.png",
            "s/ekran-light.png",
            "s/sam-dark.png",
            "s/bez-motywu.png",
        ]
    )
    podpisy = {kafel.podpis: kafel for kafel in kafle}
    assert len(kafle) == 3
    assert [kadr.motyw for kadr in podpisy["ekran"].kadry] == ["motyw jasny", "motyw ciemny"]
    assert [kadr.motyw for kadr in podpisy["sam"].kadry] == ["motyw ciemny"]
    assert podpisy["bez-motywu"].kadry[0].motyw == ""


def test_rozny_rozdzielnik_nie_sklei_pary() -> None:
    """`a-dark.png` i `a_light.png` to dwa rozne materialy — para wymaga tego samego znaku."""
    kafle = generator.kafle_serii(["s/a-dark.png", "s/a_light.png"])
    assert len(kafle) == 2
    assert all(len(kafel.kadry) == 1 for kafel in kafle)
