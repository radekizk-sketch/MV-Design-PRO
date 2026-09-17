"""Pin fikstury dialektu produkcyjnego (`klaster_postgres`/`postgres_url` z conftest).

DEKLARACJA, KTORA TU PRZYPINAMY (regula KLASA pkt 4 — „deklaracja bez testu = falszywa
pewnosc"). Fikstura `klaster_postgres` obiecuje trzy rzeczy naraz:
  (a) adres z `MV_TEST_POSTGRES_URL` wygrywa i jest uzywany BEZ ZMIAN,
  (b) bez tej zmiennej klaster wstaje z binariow systemowych, a wersja jest wybierana
      DETERMINISTYCZNIE (najwyzsza numerycznie) — inaczej dwie maszyny z dwoma
      wersjami PostgreSQL liczylyby ten sam test na roznych silnikach,
  (c) SKIP jest mozliwy WYLACZNIE wtedy, gdy binariow w ogole nie ma; kazda inna
      awaria to blad.
Bez tego pinu punkt (b) bylby zdaniem w docstringu, a punkt (c) — obietnica, ktora
cofa sie do stanu sprzed karty (test dialektu produkcyjnego pomijany po cichu).

Punkt (a) jest sprawdzany PRZEZ SAM BIEG na CI (job `Dialekt produkcyjny (PostgreSQL 16)`
ustawia `MV_TEST_POSTGRES_URL` i ten sam plik testow przechodzi), wiec tutaj pinujemy
wybor binariow — czyli te czesc, ktorej zaden bieg nie pokazuje wprost.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from tests.conftest import _NARZEDZIA_KLASTRA, _katalog_binariow_postgresa, klaster_postgres


def _zbuduj_wersje(korzen: Path, wersja: str, narzedzia: tuple[str, ...]) -> Path:
    katalog = korzen / wersja / "bin"
    katalog.mkdir(parents=True)
    for nazwa in narzedzia:
        (katalog / nazwa).write_text("", encoding="utf-8")
    return katalog


@pytest.fixture()
def bez_path(monkeypatch: pytest.MonkeyPatch) -> None:
    """PATH bez narzedzi klastra — zeby mierzyc WYLACZNIE galaz `<korzen>/<wersja>/bin`."""
    monkeypatch.setattr("tests.conftest.shutil.which", lambda _nazwa: None)


def test_brak_binariow_daje_none_czyli_jedyna_droge_do_skipu(
    bez_path: None, tmp_path: Path
) -> None:
    assert _katalog_binariow_postgresa(tmp_path) is None


def test_wersja_wybierana_jest_najwyzsza_i_deterministyczna(bez_path: None, tmp_path: Path) -> None:
    """Kolejnosc numeryczna, nie leksykograficzna: 9 < 14 < 16 (a nie '14' < '16' < '9')."""
    for wersja in ("9", "14", "16"):
        _zbuduj_wersje(tmp_path, wersja, _NARZEDZIA_KLASTRA)

    wybrany = _katalog_binariow_postgresa(tmp_path)

    assert wybrany == tmp_path / "16" / "bin"
    # Powtorzenie oddaje TEN SAM katalog — wybor nie zalezy od kolejnosci katalogow.
    assert _katalog_binariow_postgresa(tmp_path) == wybrany


@pytest.mark.parametrize("brakujace", sorted(_NARZEDZIA_KLASTRA))
def test_katalog_bez_kompletu_narzedzi_nie_jest_kandydatem(
    bez_path: None, tmp_path: Path, brakujace: str
) -> None:
    """Iloczyn cech: KAZDE z trzech narzedzi z osobna dyskwalifikuje katalog.

    Katalog z `initdb`, ale bez `pg_ctl`, nie podniesie klastra — a wybrany
    „prawie kompletny" katalog konczylby sie bledem w polowie startu zamiast
    uczciwym skipem.
    """
    niepelne = tuple(nazwa for nazwa in _NARZEDZIA_KLASTRA if nazwa != brakujace)
    _zbuduj_wersje(tmp_path, "16", niepelne)

    assert _katalog_binariow_postgresa(tmp_path) is None


def test_wersja_niepelna_ustepuje_pelnej(bez_path: None, tmp_path: Path) -> None:
    """Nowsza wersja bez kompletu narzedzi NIE wypycha starszej, ktora komplet ma."""
    _zbuduj_wersje(tmp_path, "17", ("initdb",))
    pelna = _zbuduj_wersje(tmp_path, "16", _NARZEDZIA_KLASTRA)

    assert _katalog_binariow_postgresa(tmp_path) == pelna


def test_klaster_nie_mieszka_w_katalogu_tymczasowym_pytest() -> None:
    """Katalog klastra NIE moze lezec pod `tmp_path_factory` — pin zmierzonej awarii.

    ZMIERZONE (2026-09-17, pelna regresja backendu, pierwsza wersja fikstury):
    `TempPathFactory.getbasetemp()` przywraca korzeniowi `/tmp/pytest-of-<user>`
    prawa `0700` przy kolejnych zadaniach `tmp_path`, wiec kasuje prawo PRZEJSCIA
    nadane przy starcie klastra. Serwer dzialajacy jako konto bez uprawnien traci
    dostep do wlasnego katalogu danych (`FATAL: could not stat data directory ...
    Permission denied`) i zamyka sie sam, a `pg_ctl stop` w teardownie konczy sie
    bledem — `1 error` przy 15479 zielonych testach.

    Pin jest na ZRODLE, bo defekt jest w WYBORZE KATALOGU, a nie w wyniku pojedynczego
    biegu: bieg na koncie zwyklego uzytkownika (CI) przechodzi z obiema wersjami, wiec
    sama zieleń suity nie obroni tej decyzji przed „porzadkowym" powrotem do
    `tmp_path_factory`.
    """
    import inspect

    zrodlo = inspect.getsource(klaster_postgres)

    assert "tempfile.mkdtemp" in zrodlo, "katalog klastra musi powstawac poza pytest"
    # Sama NAZWA fikstury pytest wystepuje w docstringu (tlumaczy, czemu jej nie ma),
    # wiec pinujemy WYWOLANIE i parametr, nie wzmianke.
    assert "tmp_path_factory.mktemp" not in zrodlo, (
        "katalog klastra wrocil pod `tmp_path_factory` — pytest utwardza swoj korzen "
        "tymczasowy do 0700 w trakcie sesji i odcina serwerowi katalog danych"
    )
    assert "tmp_path_factory" not in inspect.signature(klaster_postgres).parameters
    assert "shutil.rmtree" in zrodlo, "katalog spoza pytest musi byc kasowany przez fiksture"
