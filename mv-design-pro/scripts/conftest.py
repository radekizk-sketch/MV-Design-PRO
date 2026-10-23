"""Straż zapisu w drzewie repozytorium dla autotestów guardów (`scripts/test_*.py`).

PO CO (karta AUTOTESTY-W-DRZEWIE, 2026-09-30). Autotest bramki granicy importów rdzenia
dynamiki wstrzykiwał pliki `_iniekcja_*.py` do PRAWDZIWEGO pakietu
`backend/src/network_model/solvers/dynamika/` i usuwał je w `finally`. W biegu testów rdzenia
dynamiki równoległym do łańcucha guardów padł test powtarzalności biegów: dwa biegi różniły się
wyłącznie odciskiem implementacji (hash wszystkich plików pakietu), bo drugi bieg policzył
odcisk z obcym plikiem w środku. Przerwany proces zostawiłby taki plik na stałe. Klasa
wystąpiła drugi raz (pierwszy raz: próbka mojibake w `backend/tests`, `4199d528`). Naprawa
instancji (autotest na kopii w katalogu tymczasowym) nie chroni przed trzecim razem — dlatego
ten hak pilnuje KLASY w czasie wykonania.

CO ROBI. Hak audytu interpretera (PEP 578, `sys.addaudithook`) jest aktywny w czasie
kolekcji każdego modułu testowego oraz w fazach setup, call i teardown każdego testu (także
w teardownie fikstur o zasięgu modułu i sesji, bo wykonuje się on w teardownie ostatniego
testu). W tym czasie odrzuca operację, której cel leży w drzewie repozytorium (katalog
nadrzędny `mv-design-pro/`, porównanie po `realpath`):

* `open` z flagą zapisu (`O_WRONLY | O_RDWR | O_APPEND | O_CREAT | O_TRUNC` w trzecim
  argumencie zdarzenia) — cel to SAM plik po `realpath`, bo zapis przez dowiązanie
  symboliczne trafia w plik docelowy;
* `os.truncate` — cel jak wyżej;
* `os.remove` (i `os.unlink`), `os.rename` (i `os.replace`, oba końce), `os.mkdir`,
  `os.rmdir`, `shutil.rmtree`, `os.symlink` (nowy wpis) i `os.link` (nowy wpis) — cel to
  WPIS: `realpath` katalogu nadrzędnego + nazwa, bo operacja zmienia wpis katalogu, a nie
  plik, na który wpis wskazuje (usunięcie dowiązania z katalogu tymczasowego do repo jest
  dozwolone, zapis przez nie — nie);
* `os.link` dodatkowo po stronie ŹRÓDŁA: dowiązanie twarde do pliku repo jest zapisywalnym
  aliasem jego treści, którego `realpath` nie wskazuje na repo — zapis przez nie ominąłby
  sprawdzenie `open`, więc samo utworzenie takiego dowiązania jest odrzucane.

Wyjątki: ścieżki z członem `__pycache__` albo `.pytest_cache` (artefakty interpretera
i pytest, nie treść repozytorium). Innych wyjątków nie ma — także katalog `--basetemp`
MUSI leżeć poza drzewem repozytorium, inaczej zapisy do `tmp_path` zostaną odrzucone.

JAK ODRZUCA. Wyjątkiem `ZapisWDrzewieRepozytorium` (podklasa `RuntimeError`, więc
`except OSError` go nie połknie), a każde odrzucenie trafia też do rejestru. Po każdej
fazie testu i po kolekcji każdego modułu rejestr jest opróżniany; niepusty rejestr oblewa
fazę (test pada, nawet jeśli połknął wyjątek przez `except Exception`).

CZEGO NIE OBEJMUJE (świadomie):

* PROCESÓW POTOMNYCH. Hak audytu działa w jednym interpreterze. Pomiar 2026-09-30
  (62 śledzone pliki `scripts/test_*.py`, z nich 11 importuje `subprocess`): procesy
  potomne to guardy w trybie ODCZYTU (bez argumentów, `--zmierz` bez `--zapisz`,
  `--check`, katalog kopii w `tmp_path` jako argument), `git` w katalogu tymczasowym
  i pytest z tym hakiem jako wtyczką (test samego haka). Tryby zapisujące skryptów
  (`--zapisz`, `--init`, generatory) testy wołają w procesie, więc hak je widzi. Nowy
  proces potomny, który pisałby do repo, nie zostanie tu wykryty.
* OPERACJI POZA WYMIENIONYMI ZDARZENIAMI: `os.chmod`, `os.utime`, `os.chown` (zmiana
  metadanych, nie treści ani wpisów) oraz zapisu przez deskryptor otwarty PRZED włączeniem
  haka (np. otwarty na poziomie importu `conftest.py`).
* CZASU POZA KOLEKCJĄ MODUŁÓW I FAZAMI TESTÓW: import samego `conftest.py`,
  `pytest_sessionstart`/`pytest_sessionfinish` oraz wtyczki (np. `cacheprovider` pisze do
  `.pytest_cache`, który i tak jest wyjątkiem).
* OPERACJI Z `dir_fd`, GDY NIE DA SIĘ ODCZYTAĆ `/proc/self/fd/<fd>` (system bez `/proc`):
  cel względny wobec deskryptora katalogu jest wtedy nierozpoznawalny i zostaje przepuszczony.
  `shutil.rmtree` jest mimo to sprawdzany po ścieżce korzenia usuwanego drzewa (zdarzenie
  `shutil.rmtree` niesie pełną ścieżkę), a nie podąża za dowiązaniami.

Test samego haka (iloczyn cech operacja × położenie celu, połknięty wyjątek, fazy setup,
call i teardown): `scripts/test_straz_zapisu_repo.py`.
"""

from __future__ import annotations

import os
import sys
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import pytest

#: Korzeń drzewa repozytorium (katalog zawierający `mv-design-pro/`), po `realpath`.
KORZEN_REPO = os.path.realpath(Path(__file__).resolve().parents[2])

#: Człony ścieżki, pod którymi zapis jest dozwolony (artefakty narzędzi). ZAMKNIĘTE.
WYJATKI: frozenset[str] = frozenset({"__pycache__", ".pytest_cache"})

_FLAGI_ZAPISU = os.O_WRONLY | os.O_RDWR | os.O_APPEND | os.O_CREAT | os.O_TRUNC


class ZapisWDrzewieRepozytorium(RuntimeError):
    """Test próbował zapisać, usunąć albo przemianować coś w drzewie repozytorium."""


_aktywnosc = 0
_rejestr: list[str] = []
_zamek = threading.Lock()
_watek = threading.local()


def _sciezka(argument: Any) -> str | None:
    """Ścieżka tekstowa z argumentu zdarzenia (`None` dla deskryptora albo braku)."""
    if argument is None or isinstance(argument, int):
        return None
    try:
        return os.fsdecode(os.fspath(argument))
    except TypeError:
        return None


def _baza(dir_fd: Any) -> str | None:
    """Katalog, względem którego liczy się ścieżka względna (`None` = nierozpoznawalny)."""
    if dir_fd is None or dir_fd == -1:
        return os.getcwd()
    try:
        return os.readlink(f"/proc/self/fd/{dir_fd}")
    except OSError:
        return None


def _cel_pliku(argument: Any, dir_fd: Any = None) -> str | None:
    """Cel operacji na TREŚCI pliku: sam plik po `realpath` (przez dowiązania)."""
    sciezka = _sciezka(argument)
    if sciezka is None:
        return None
    baza = _baza(dir_fd)
    if baza is None and not os.path.isabs(sciezka):
        return None
    return os.path.realpath(os.path.join(baza or "", sciezka))


def _cel_wpisu(argument: Any, dir_fd: Any = None) -> str | None:
    """Cel operacji na WPISIE katalogu: `realpath` katalogu nadrzędnego + nazwa."""
    sciezka = _sciezka(argument)
    if sciezka is None:
        return None
    baza = _baza(dir_fd)
    if baza is None and not os.path.isabs(sciezka):
        return None
    pelna = os.path.join(baza or "", sciezka.rstrip(os.sep) or os.sep)
    rodzic, nazwa = os.path.split(pelna)
    if nazwa in {"", ".", ".."}:
        return os.path.realpath(pelna)
    return os.path.join(os.path.realpath(rodzic or os.sep), nazwa)


def _cele(zdarzenie: str, a: tuple[Any, ...]) -> list[str | None]:
    """Cele operacji zdarzenia audytu (pusta lista = zdarzenie nie zapisuje)."""
    if zdarzenie == "open":
        if not isinstance(a[2], int) or not a[2] & _FLAGI_ZAPISU:
            return []
        return [_cel_pliku(a[0])]
    if zdarzenie == "os.truncate":
        return [_cel_pliku(a[0])]
    if zdarzenie in {"os.remove", "os.rmdir", "shutil.rmtree"}:
        return [_cel_wpisu(a[0], a[1])]
    if zdarzenie == "os.mkdir":
        return [_cel_wpisu(a[0], a[2])]
    if zdarzenie == "os.rename":
        return [_cel_wpisu(a[0], a[2]), _cel_wpisu(a[1], a[3])]
    if zdarzenie == "os.symlink":
        return [_cel_wpisu(a[1], a[2])]
    if zdarzenie == "os.link":
        return [_cel_pliku(a[0], a[2]), _cel_wpisu(a[1], a[3])]
    return []


_ZDARZENIA = frozenset(
    {
        "open",
        "os.truncate",
        "os.remove",
        "os.rmdir",
        "shutil.rmtree",
        "os.mkdir",
        "os.rename",
        "os.symlink",
        "os.link",
    }
)


def w_drzewie_repozytorium(cel: str) -> bool:
    """Czy cel (już po `realpath`) leży w drzewie repozytorium poza wyjątkami."""
    if cel != KORZEN_REPO and not cel.startswith(KORZEN_REPO + os.sep):
        return False
    return not WYJATKI.intersection(cel[len(KORZEN_REPO) :].split(os.sep))


def _hak(zdarzenie: str, argumenty: tuple[Any, ...]) -> None:
    if not _aktywnosc or zdarzenie not in _ZDARZENIA or getattr(_watek, "w_haku", False):
        return
    _watek.w_haku = True
    try:
        cele = _cele(zdarzenie, argumenty)
    finally:
        _watek.w_haku = False
    for cel in cele:
        if cel is not None and w_drzewie_repozytorium(cel):
            opis = f"{zdarzenie} → {cel}"
            with _zamek:
                _rejestr.append(opis)
            raise ZapisWDrzewieRepozytorium(
                f"test nie może zmieniać drzewa repozytorium ({opis}) — pracuj na kopii "
                "w `tmp_path` i przekaż katalog skanu parametrem"
            )


sys.addaudithook(_hak)


@contextmanager
def _straz() -> Iterator[None]:
    global _aktywnosc
    _aktywnosc += 1
    try:
        yield
    finally:
        _aktywnosc -= 1


def zabierz_naruszenia() -> list[str]:
    """Opróżnij rejestr odrzuceń i zwróć jego zawartość."""
    with _zamek:
        naruszenia = list(_rejestr)
        _rejestr.clear()
    return naruszenia


def _oblej(raport: Any, naruszenia: list[str]) -> None:
    tresc = "Zapis w drzewie repozytorium (scripts/conftest.py):\n" + "\n".join(
        f"  - {opis}" for opis in naruszenia
    )
    if raport.failed:
        raport.sections.append(("zapis w drzewie repozytorium", tresc))
        return
    raport.outcome = "failed"
    raport.longrepr = tresc


@pytest.hookimpl(hookwrapper=True)
def pytest_make_collect_report(collector: pytest.Collector) -> Iterator[None]:
    with _straz():
        wynik = yield
    naruszenia = zabierz_naruszenia()
    if naruszenia:
        _oblej(wynik.get_result(), naruszenia)


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_setup(item: pytest.Item) -> Iterator[None]:
    with _straz():
        yield


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_call(item: pytest.Item) -> Iterator[None]:
    with _straz():
        yield


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_teardown(item: pytest.Item, nextitem: pytest.Item | None) -> Iterator[None]:
    with _straz():
        yield


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item: pytest.Item, call: pytest.CallInfo[None]) -> Iterator[None]:
    wynik = yield
    naruszenia = zabierz_naruszenia()
    if naruszenia:
        _oblej(wynik.get_result(), naruszenia)


class _Straz:
    """Uchwyt dla testów samego haka."""

    Wyjatek = ZapisWDrzewieRepozytorium
    korzen = KORZEN_REPO

    @staticmethod
    def zabierz() -> list[str]:
        return zabierz_naruszenia()

    @staticmethod
    @contextmanager
    def wylaczona() -> Iterator[None]:
        """Wyłącz straż — WYŁĄCZNIE do sprzątania po regresji samego haka."""
        global _aktywnosc
        poprzednia = _aktywnosc
        _aktywnosc = 0
        try:
            yield
        finally:
            _aktywnosc = poprzednia


@pytest.fixture
def straz_zapisu() -> _Straz:
    """Uchwyt straży zapisu (rejestr odrzuceń, typ wyjątku, sprzątanie po regresji)."""
    return _Straz()
