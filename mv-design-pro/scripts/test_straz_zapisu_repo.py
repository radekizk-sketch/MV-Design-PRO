"""Testy haka straży zapisu w drzewie repozytorium (`scripts/conftest.py`).

Iloczyn cech (reguła KLASA, NIE INSTANCJA): {zapis, utworzenie, usunięcie, zmiana nazwy,
katalog} × {cel w repo, cel w `tmp_path`, `__pycache__` w repo, dowiązanie w `tmp_path`
wskazujące repo}. Wartości oczekiwane wynikają z definicji w docstringu `conftest.py`:
zapis i utworzenie liczą cel po `realpath` samego pliku (przez dowiązanie → repo → odrzucone),
usunięcie i zmiana nazwy liczą WPIS (usunięcie albo przemianowanie samego dowiązania jest
dozwolone), `__pycache__` jest wyjątkiem. Każda odrzucona próba w repo kończy się
sprawdzeniem, że cel NIE powstał (asercja istnienia), a dla usunięcia i zmiany nazwy cel
w repo jest nieistniejący — regresja haka skończyłaby się `FileNotFoundError`, a nie
zniszczeniem pliku.

Osobno (proces potomny z hakiem wczytanym jako wtyczka): odrzucenie połknięte przez
`except Exception` w fazie setup, call, teardown i w czasie kolekcji modułu oblewa
odpowiednio test albo kolekcję — rejestr naruszeń działa niezależnie od wyjątku.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import uuid
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest

KATALOG_SKRYPTOW = Path(__file__).resolve().parent
PLIK_W_REPO = Path(__file__).resolve()

LOKALIZACJE = ("repo", "tmp", "pycache", "dowiazanie")
OPERACJE = ("zapis", "utworzenie", "usuniecie", "zmiana_nazwy", "katalog")

#: Oczekiwanie z definicji haka: True = odrzucone.
ODRZUCONE: dict[tuple[str, str], bool] = {
    ("zapis", "repo"): True,
    ("zapis", "tmp"): False,
    ("zapis", "pycache"): False,
    ("zapis", "dowiazanie"): True,  # zapis przez dowiązanie trafia w plik repo
    ("utworzenie", "repo"): True,
    ("utworzenie", "tmp"): False,
    ("utworzenie", "pycache"): False,
    ("utworzenie", "dowiazanie"): True,  # tmp/dowiązanie-katalogu/nowy → repo
    ("usuniecie", "repo"): True,
    ("usuniecie", "tmp"): False,
    ("usuniecie", "pycache"): False,
    ("usuniecie", "dowiazanie"): False,  # usuwany jest wpis dowiązania w tmp
    ("zmiana_nazwy", "repo"): True,
    ("zmiana_nazwy", "tmp"): False,
    ("zmiana_nazwy", "pycache"): False,
    ("zmiana_nazwy", "dowiazanie"): False,  # przemianowany jest wpis dowiązania w tmp
    ("katalog", "repo"): True,
    ("katalog", "tmp"): False,
    ("katalog", "pycache"): False,
    ("katalog", "dowiazanie"): True,  # tmp/dowiązanie-katalogu/nowy → repo
}


def _unikat() -> str:
    return f"_straz_proba_{uuid.uuid4().hex}"


@pytest.fixture
def pycache(straz_zapisu) -> Iterator[Path]:
    """Prywatny podkatalog w `scripts/__pycache__` (wyjątek haka) — sprzątany po teście."""
    katalog = KATALOG_SKRYPTOW / "__pycache__" / _unikat()
    katalog.mkdir(parents=True)
    yield katalog
    shutil.rmtree(katalog)


@pytest.fixture
def sprzatanie_repo(straz_zapisu) -> Iterator[list[Path]]:
    """Ścieżki w repo, które MOGŁYBY powstać przy regresji haka — usuwane z wyłączoną
    strażą (jedyne legalne użycie `wylaczona`)."""
    sciezki: list[Path] = []
    yield sciezki
    with straz_zapisu.wylaczona():
        for sciezka in sciezki:
            if sciezka.is_dir() and not sciezka.is_symlink():
                shutil.rmtree(sciezka)
            elif sciezka.exists() or sciezka.is_symlink():
                sciezka.unlink()


def _przygotuj(
    operacja: str, lokalizacja: str, tmp_path: Path, pycache: Path, repo: list[Path]
) -> tuple[Callable[[], object], Callable[[], None]]:
    """(działanie, sprawdzenie skutku po dozwolonym działaniu) dla komórki iloczynu."""
    if lokalizacja == "repo":
        baza = KATALOG_SKRYPTOW
    elif lokalizacja == "tmp":
        baza = tmp_path
    elif lokalizacja == "pycache":
        baza = pycache
    else:
        baza = tmp_path / "dowiazanie_katalogu"
        baza.symlink_to(KATALOG_SKRYPTOW, target_is_directory=True)

    nowy = baza / _unikat()
    if lokalizacja in {"repo", "dowiazanie"}:
        repo.append(KATALOG_SKRYPTOW / nowy.name)

    if operacja == "zapis":
        if lokalizacja == "repo":
            cel = PLIK_W_REPO
        elif lokalizacja == "dowiazanie":
            cel = tmp_path / "dowiazanie_pliku"
            cel.symlink_to(PLIK_W_REPO)
        else:
            cel = nowy
            cel.write_text("x", encoding="utf-8")

        def zapis() -> None:
            os.close(os.open(cel, os.O_WRONLY))

        return zapis, lambda: None

    if operacja == "utworzenie":

        def utworzenie() -> None:
            os.close(os.open(nowy, os.O_WRONLY | os.O_CREAT))

        return utworzenie, lambda: _istnieje(nowy)

    if operacja == "usuniecie":
        if lokalizacja == "dowiazanie":
            cel = tmp_path / "dowiazanie_pliku"
            cel.symlink_to(PLIK_W_REPO)

            def sprawdz_dowiazanie() -> None:
                assert not cel.is_symlink()
                assert PLIK_W_REPO.is_file(), "usunięcie dowiązania nie może dotknąć celu"

            return lambda: os.remove(cel), sprawdz_dowiazanie
        if lokalizacja != "repo":
            nowy.write_text("x", encoding="utf-8")
        return lambda: os.remove(nowy), lambda: _nie_istnieje(nowy)

    if operacja == "zmiana_nazwy":
        if lokalizacja == "dowiazanie":
            zrodlo = tmp_path / "dowiazanie_pliku"
            zrodlo.symlink_to(PLIK_W_REPO)
            cel = tmp_path / "dowiazanie_przemianowane"

            def sprawdz_przemianowanie() -> None:
                assert cel.is_symlink() and not zrodlo.is_symlink()
                assert PLIK_W_REPO.is_file()

            return lambda: os.rename(zrodlo, cel), sprawdz_przemianowanie
        drugi = baza / _unikat()
        if lokalizacja == "repo":
            repo.append(drugi)
        else:
            nowy.write_text("x", encoding="utf-8")
        return lambda: os.rename(nowy, drugi), lambda: _istnieje(drugi)

    # katalog
    return lambda: os.mkdir(nowy), lambda: _istnieje(nowy)


def _istnieje(sciezka: Path) -> None:
    assert sciezka.exists(), f"dozwolona operacja nie zostawiła skutku: {sciezka}"


def _nie_istnieje(sciezka: Path) -> None:
    assert not sciezka.exists(), f"dozwolone usunięcie nie usunęło: {sciezka}"


@pytest.mark.parametrize("lokalizacja", LOKALIZACJE)
@pytest.mark.parametrize("operacja", OPERACJE)
def test_iloczyn_operacja_x_polozenie_celu(
    operacja: str,
    lokalizacja: str,
    tmp_path: Path,
    pycache: Path,
    sprzatanie_repo: list[Path],
    straz_zapisu,
) -> None:
    dzialanie, sprawdz = _przygotuj(operacja, lokalizacja, tmp_path, pycache, sprzatanie_repo)
    if ODRZUCONE[(operacja, lokalizacja)]:
        with pytest.raises(straz_zapisu.Wyjatek):
            dzialanie()
        odrzucenia = straz_zapisu.zabierz()
        assert len(odrzucenia) == 1, odrzucenia
        for sciezka in sprzatanie_repo:
            assert not sciezka.exists(), f"odrzucona operacja zostawiła {sciezka}"
    else:
        dzialanie()
        sprawdz()
        assert straz_zapisu.zabierz() == []


def test_iloczyn_jest_kompletny() -> None:
    assert set(ODRZUCONE) == {(o, lok) for o in OPERACJE for lok in LOKALIZACJE}


def test_wyjatek_straznika_nie_jest_bledem_systemu_plikow(straz_zapisu) -> None:
    """`except OSError` (np. `missing_ok`, `ignore_errors`) nie może połknąć odrzucenia."""
    assert not issubclass(straz_zapisu.Wyjatek, OSError)


@pytest.mark.parametrize(
    "dzialanie",
    [
        pytest.param(lambda cel, tmp: open(cel, "w"), id="open-w"),
        pytest.param(lambda cel, tmp: open(cel, "a"), id="open-a"),
        pytest.param(lambda cel, tmp: open(PLIK_W_REPO, "r+"), id="open-r+-istniejacy"),
        pytest.param(lambda cel, tmp: cel.write_text("x"), id="write_text"),
        pytest.param(lambda cel, tmp: cel.write_bytes(b"x"), id="write_bytes"),
        pytest.param(lambda cel, tmp: cel.touch(), id="touch"),
        pytest.param(lambda cel, tmp: os.truncate(cel, 0), id="truncate"),
        pytest.param(lambda cel, tmp: os.rmdir(cel), id="rmdir"),
        pytest.param(lambda cel, tmp: shutil.rmtree(cel), id="rmtree"),
        pytest.param(lambda cel, tmp: os.unlink(cel), id="unlink"),
        pytest.param(lambda cel, tmp: os.replace(tmp / "a", cel), id="replace-do-repo"),
        pytest.param(lambda cel, tmp: os.symlink(tmp / "a", cel), id="symlink-w-repo"),
        pytest.param(lambda cel, tmp: os.link(tmp / "a", cel), id="link-w-repo"),
        pytest.param(lambda cel, tmp: os.link(PLIK_W_REPO, tmp / "twardy"), id="link-z-repo"),
        pytest.param(lambda cel, tmp: shutil.copyfile(tmp / "a", cel), id="copyfile-do-repo"),
        pytest.param(lambda cel, tmp: cel.mkdir(parents=True), id="mkdir-parents"),
    ],
)
def test_kazda_droga_zapisu_do_repo_jest_odrzucona(
    dzialanie: Callable[[Path, Path], object],
    tmp_path: Path,
    sprzatanie_repo: list[Path],
    straz_zapisu,
) -> None:
    (tmp_path / "a").write_text("x", encoding="utf-8")
    cel = KATALOG_SKRYPTOW / _unikat()
    sprzatanie_repo.append(cel)
    tresc_przed = PLIK_W_REPO.read_bytes()
    with pytest.raises(straz_zapisu.Wyjatek):
        dzialanie(cel, tmp_path)
    assert straz_zapisu.zabierz(), "odrzucenie musi trafić do rejestru"
    assert not cel.exists()
    assert not (tmp_path / "twardy").exists()
    assert PLIK_W_REPO.read_bytes() == tresc_przed


def test_polkniete_odrzucenie_zostaje_w_rejestrze(
    sprzatanie_repo: list[Path], straz_zapisu
) -> None:
    cel = KATALOG_SKRYPTOW / _unikat()
    sprzatanie_repo.append(cel)
    try:
        cel.write_text("x", encoding="utf-8")
    except Exception:  # noqa: BLE001 — celowo: symulacja testu połykającego wyjątek
        pass
    assert not cel.exists()
    assert len(straz_zapisu.zabierz()) == 1


_MODUL_FAZ = """
import os
import pytest

CEL = os.environ["CEL_STRAZY"]


def _polknij(przyrostek):
    try:
        open(CEL + przyrostek, "w")
    except Exception:
        pass


@pytest.fixture
def zapis_w_setup():
    _polknij("_setup")
    yield


@pytest.fixture
def zapis_w_teardown():
    yield
    _polknij("_teardown")


def test_zapis_w_call():
    _polknij("_call")


def test_zapis_w_setup(zapis_w_setup):
    pass


def test_zapis_w_teardown(zapis_w_teardown):
    pass


def test_czysty(tmp_path):
    (tmp_path / "a").write_text("x")
"""

_MODUL_KOLEKCJI = """
import os

try:
    open(os.environ["CEL_STRAZY"] + "_kolekcja", "w")
except Exception:
    pass


def test_nic():
    pass
"""


def test_polkniete_odrzucenie_oblewa_kazda_faze_i_kolekcje(
    tmp_path: Path, sprzatanie_repo: list[Path]
) -> None:
    """Proces potomny z hakiem wczytanym jako wtyczka: odrzucenie połknięte w setup, call,
    teardown i w czasie importu modułu testowego oblewa właściwą fazę; czysty test przechodzi.
    """
    przedrostek = KATALOG_SKRYPTOW / _unikat()
    for przyrostek in ("_setup", "_call", "_teardown", "_kolekcja"):
        sprzatanie_repo.append(Path(f"{przedrostek}{przyrostek}"))
    katalog = tmp_path / "przebieg"
    katalog.mkdir()
    (katalog / "test_fazy.py").write_text(_MODUL_FAZ, encoding="utf-8")
    (katalog / "test_kolekcja.py").write_text(_MODUL_KOLEKCJI, encoding="utf-8")
    srodowisko = {
        **os.environ,
        "CEL_STRAZY": str(przedrostek),
        "PYTHONPATH": str(KATALOG_SKRYPTOW),
        "PYTHONDONTWRITEBYTECODE": "1",
    }
    wynik = subprocess.run(  # noqa: S603 — stały, lokalny argv
        [
            sys.executable,
            "-m",
            "pytest",
            "-q",
            "-rfE",
            "--continue-on-collection-errors",
            "-p",
            "no:cacheprovider",
            "-p",
            "conftest",
            f"--basetemp={tmp_path / 'bt'}",
            f"--rootdir={katalog}",
            str(katalog),
        ],
        capture_output=True,
        text=True,
        check=False,
        cwd=katalog,
        env=srodowisko,
    )
    wyjscie = wynik.stdout + wynik.stderr
    assert wynik.returncode == 1, wyjscie
    assert "FAILED test_fazy.py::test_zapis_w_call" in wyjscie
    assert "ERROR test_fazy.py::test_zapis_w_setup" in wyjscie
    assert "ERROR test_fazy.py::test_zapis_w_teardown" in wyjscie
    assert "ERROR test_kolekcja.py" in wyjscie
    assert "1 failed, 2 passed, 3 errors" in wyjscie, wyjscie
    assert wyjscie.count("Zapis w drzewie repozytorium (scripts/conftest.py)") >= 4
    for sciezka in sprzatanie_repo:
        assert not sciezka.exists(), f"odrzucony zapis zostawił {sciezka}"
