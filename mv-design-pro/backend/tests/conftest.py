from __future__ import annotations

import importlib.util
import inspect
import os
import pwd
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest

# Add backend/src to path for imports
backend_src = Path(__file__).parents[1] / "src"
sys.path.insert(0, str(backend_src))

# Magazyny plikowe poza drzewem repo — DLA CALEJ SESJI (odpowiednik V12K-267
# dla magazynow katalogowych). ``enm/store.py``, ``enm/dziennik_zmian.py``
# i ``application/station_templates/user_store.py`` rozwiazuja katalog przez
# ``os.getenv(...)`` z domyslna sciezka WEWNATRZ repo (``backend/.enm_store``,
# ``.station_templates``) — ta sama, na ktorej pracuje ZYWY serwer uruchomiony
# z tego katalogu. Testy wolajace ``reset_enm_store()`` kasowaly wtedy pliki
# robocze ``*.tmp`` rownolegle biegnacego backendu (zmierzony skutek 2026-08-13:
# ``FileNotFoundError`` przy atomowym ``replace()`` w ``dziennik_zmian.zatwierdz``
# i HTTP ``template.persist_failed`` w suicie e2e biegnacej obok pytest).
# Relokacja jest sesyjna, nie per-test: semantyka wspoldzielenia magazynu miedzy
# testami (i jawne resety) zostaje DOKLADNIE ta sama, zmienia sie tylko katalog.
# Testy ustawiajace te zmienne wlasnym ``monkeypatch`` nadal wygrywaja.
# Warunek ``not in os.environ`` honoruje katalog wskazany jawnie z zewnatrz.
if "ENM_STORE_DIR" not in os.environ:
    os.environ["ENM_STORE_DIR"] = tempfile.mkdtemp(prefix="enm-store-pytest-")
if "STATION_USER_TEMPLATES_DIR" not in os.environ:
    os.environ["STATION_USER_TEMPLATES_DIR"] = tempfile.mkdtemp(prefix="szablony-pytest-")

# Korzen backendu na sciezce — WYMAGANY przez tryb importu `importlib`
# (pyproject: `[tool.pytest.ini_options] addopts = "--import-mode=importlib"`;
# tryb NIE ma wlasnego klucza ini, wiec wchodzi przez addopts). Tryb `importlib` celowo
# NIE dopisuje niczego do `sys.path` (to wlasnie ta samowolka powodowala
# cieniowanie pakietow zrodlowych przez testowe), a 58 modulow testowych importuje
# wspoldzielone budowniczki przez `from tests.<pakiet> import ...`. Dopisujemy
# wiec dokladnie JEDEN katalog — korzen backendu — zamiast pozwalac pytestowi
# wstrzykiwac katalog bazowy kazdego modulu testowego z osobna.
backend_root = Path(__file__).parents[1]
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))


def _install_httpx_testclient_compat() -> None:
    """Bridge starlette<=0.27 TestClient onto httpx>=0.28 for backend tests."""
    if importlib.util.find_spec("httpx") is None:
        return

    import httpx

    if getattr(httpx.Client.__init__, "_backend_test_compat", False):
        return
    if "app" in inspect.signature(httpx.Client.__init__).parameters:
        return

    original_init = httpx.Client.__init__

    def _compat_init(self, *args, app=None, **kwargs):
        return original_init(self, *args, **kwargs)

    _compat_init._backend_test_compat = True  # type: ignore[attr-defined]
    httpx.Client.__init__ = _compat_init


_install_httpx_testclient_compat()

_MISSING_DEPS = {
    name for name in ("sqlalchemy", "numpy", "networkx") if importlib.util.find_spec(name) is None
}


def pytest_ignore_collect(collection_path, config):
    if not _MISSING_DEPS:
        return False
    path_str = str(collection_path)
    if "tests/proof_engine" in path_str:
        return False
    return True


@pytest.fixture(autouse=True)
def _izolowana_baza_przebiegow(tmp_path, monkeypatch):
    """Każdy test dostaje WŁASNĄ bazę przebiegów kanonicznych (V12K-267).

    DEFEKT, KTÓRY TO USUWA. ``canonical_run_repository`` rozwiązuje adres bazy
    przez ``os.getenv("DATABASE_URL", "sqlite+pysqlite:///./mv_design_pro.db")``
    i CACHUJE silnik w zmiennej modułu. Testy, które nie ustawiły ``DATABASE_URL``
    same (a robiło to 12 plików na kilkaset), pisały do JEDNEGO pliku w katalogu
    roboczym — wspólnego dla całej sesji testowej i TRWAŁEGO MIĘDZY URUCHOMIENIAMI
    (plik urósł do 15 MB). Skutek zmierzony: sporadyczne
    ``sqlalchemy.orm.exc.StaleDataError: UPDATE statement on table 'canonical_runs'
    expected to update 1 row(s); 0 were matched`` — raz w
    ``test_dowod_v12k040``, raz w ``test_odpowiedz_osd_service``, przy kolejnych
    przebiegach zielono. Test, który przechodzi albo nie w zależności od tego, co
    zostawił po sobie POPRZEDNI przebieg, nie jest bramką: mógł tak samo
    przepuścić prawdziwą regresję. Łamie to też regułę determinizmu kanonu
    („to samo wejście = ten sam wynik").

    Fixture jest ``autouse``, bo izolacja nie może zależeć od tego, czy autor
    testu o niej pamiętał. Testy ustawiające ``DATABASE_URL`` własnym
    ``monkeypatch`` nadal wygrywają — nadpisują tę samą zmienną po nas.
    """
    if importlib.util.find_spec("sqlalchemy") is None:
        yield
        return

    monkeypatch.setenv(
        "DATABASE_URL",
        # Baza W PAMIĘCI ze wspólnym cache: izolacja bez kosztu tworzenia schematu
        # na dysku (pomiar: 29 s wobec 80 s dla pliku tymczasowego, przy tym samym
        # zestawie 531 testów). Nazwa bierze się z katalogu tymczasowego pytest,
        # który jest unikalny per test — NIE z `id()` obiektu, bo identyfikatory
        # bywają ponownie użyte po zwolnieniu pamięci i dwa testy mogłyby trafić
        # na tę samą bazę. Baza znika, gdy zamknie się ostatnie połączenie
        # (robi to `wyczysc_cache` w teardownie).
        f"sqlite+pysqlite:///file:przebiegi-{tmp_path.name}" "?mode=memory&cache=shared&uri=true",
    )

    from infrastructure.persistence.repositories import canonical_run_repository as repo

    def wyczysc_cache() -> None:
        if repo._cached_engine is not None:
            repo._cached_engine.dispose()
        repo._cached_engine = None
        repo._cached_session_factory = None
        repo._cached_database_url = None

    wyczysc_cache()
    yield
    wyczysc_cache()


# ---------------------------------------------------------------------------
# Dialekt PRODUKCYJNY (PostgreSQL) — jedna fikstura, dwa tryby
# ---------------------------------------------------------------------------
# DLUG, KTORY TO ZAMYKA (karta PG-DIALEKT). `docker-compose.yml` uruchamia backend
# na `postgresql+psycopg://` (DT-13: „Postgres docelowo, SQLite dev/test"), a
# `_izolowana_baza_przebiegow` wyzej wymusza SQLite dla KAZDEGO testu. Niezmienniki
# transakcyjne persystencji (`UPDATE ... WHERE status NOT IN (...)` + `rowcount`,
# zamiatanie osieroconych biegow, dokladanie kolumn addytywnych) byly wiec
# dowiedzione WYLACZNIE na dialekcie, ktory nie jest produkcyjny. Test dialektu
# produkcyjnego istnial, ale byl POMIJANY, dopoki ktos recznie nie wskazal bazy
# zmienna `MV_TEST_POSTGRES_URL` — czyli praktycznie nigdy. „Wykluczenie != naprawa":
# skip znika przez URUCHOMIENIE testu, nie przez zlagodzenie asercji.
#
# Fikstura ma DWA tryby i ZERO cichych przejsc:
#   (a) `MV_TEST_POSTGRES_URL` ustawione  -> uzywamy tej bazy bez zmian (CI, cudzy serwer),
#   (b) sa binaria `initdb`/`pg_ctl`/`createdb` -> podnosimy EFEMERYCZNY klaster w katalogu
#       tymczasowym sesji i kasujemy go w teardownie,
#   (c) nie ma ani URL-a, ani binariow -> SKIP nazywajacy BRAK BINARIOW.
# Kazda inna awaria (initdb/pg_ctl/createdb konczy sie bledem) to BLAD z diagnostyka
# ze stderr, nie skip: inaczej wracamy do stanu „test, ktorego nikt nie widzi".

#: Konta systemowe bez uprawnien, na ktore schodzimy, gdy pytest biegnie jako root.
#: `initdb` i `postgres` ODMAWIAJA startu z konta root (zabezpieczenie serwera przed
#: uruchomieniem z pelnymi uprawnieniami), wiec bez zejscia z roota tryb (b) bylby
#: martwy dokladnie na tych maszynach, na ktorych PostgreSQL jest zainstalowany.
_KONTA_BEZ_UPRAWNIEN: tuple[str, ...] = ("postgres", "nobody")

#: Nazwa bazy tworzonej w klastrze efemerycznym i uzytkownik-superuzytkownik w nim.
_BAZA_EFEMERYCZNA = "mvtest"
_UZYTKOWNIK_EFEMERYCZNY = "postgres"


#: Narzedzia, ktorych KOMPLET jest potrzebny do podniesienia klastra efemerycznego.
_NARZEDZIA_KLASTRA: tuple[str, ...] = ("initdb", "pg_ctl", "createdb")

#: Korzen ukladu Debiana/Ubuntu: `/usr/lib/postgresql/<wersja>/bin`. Tam `initdb`
#: i `pg_ctl` NIE trafiaja do PATH, choc `psql` i `createdb` tak.
_KORZEN_BINARIOW_POSTGRESA = Path("/usr/lib/postgresql")


def _katalog_binariow_postgresa(korzen: Path = _KORZEN_BINARIOW_POSTGRESA) -> Path | None:
    """Katalog z KOMPLETEM `initdb`/`pg_ctl`/`createdb` albo ``None``.

    Kolejnosc szukania: PATH, potem `<korzen>/<wersja>/bin`. Wersja wybierana
    deterministycznie: NAJWYZSZA numerycznie, zeby ten sam katalog wychodzil przy
    kazdym uruchomieniu. Zwrocone ``None`` oznacza dla fikstury SKIP nazywajacy brak
    binariow — jedyna dozwolona droga do pominiecia testu dialektu produkcyjnego.
    """
    z_path = [shutil.which(nazwa) for nazwa in _NARZEDZIA_KLASTRA]
    if all(z_path):
        katalogi = {Path(sciezka).parent for sciezka in z_path if sciezka is not None}
        if len(katalogi) == 1:
            return katalogi.pop()

    kandydaci = [
        katalog
        for katalog in korzen.glob("*/bin")
        if all((katalog / nazwa).exists() for nazwa in _NARZEDZIA_KLASTRA)
    ]
    if not kandydaci:
        return None

    def wersja(katalog: Path) -> tuple[tuple[int, ...], str]:
        liczby = tuple(int(czesc) for czesc in re.findall(r"\d+", katalog.parent.name))
        return (liczby or (0,), str(katalog))

    return sorted(kandydaci, key=wersja)[-1]


def _konto_bez_uprawnien() -> pwd.struct_passwd | None:
    """Konto, na ktore schodzi klaster, gdy pytest biegnie jako root (inaczej ``None``)."""
    if os.geteuid() != 0:
        return None
    for nazwa in _KONTA_BEZ_UPRAWNIEN:
        try:
            return pwd.getpwnam(nazwa)
        except KeyError:
            continue
    raise RuntimeError(
        "pytest biegnie jako root, a `initdb` odmawia startu z konta root; w systemie nie ma "
        f"zadnego z kont {_KONTA_BEZ_UPRAWNIEN}, na ktore mozna zejsc. Wskaz gotowa baze "
        "zmienna MV_TEST_POSTGRES_URL albo zaloz konto bez uprawnien."
    )


def _udostepnij_przejscie(katalog: Path) -> None:
    """Dodaj prawo PRZEJSCIA dla „innych" na sciezce do katalogu klastra.

    Katalog tymczasowy pytest (`/tmp/pytest-of-root`) ma prawa `0700`, wiec konto
    bez uprawnien nie przeszloby do katalogu danych, nawet gdy sam katalog nalezy
    juz do niego. Dokladamy WYLACZNIE bit `x` dla innych (przejscie), nigdy `r`
    ani `w` — zawartosc pozostaje niewidoczna dla listowania.
    """
    for przodek in [katalog, *katalog.parents]:
        if przodek == Path(przodek.root):
            break
        tryb = przodek.stat().st_mode
        if not tryb & 0o001:
            przodek.chmod(tryb | 0o001)


def _wolny_port() -> int:
    """Numer portu WOLNEGO w tej chwili — pytamy system, nie zgadujemy."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as gniazdo:
        gniazdo.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        gniazdo.bind(("127.0.0.1", 0))
        return int(gniazdo.getsockname()[1])


@pytest.fixture(scope="session")
def klaster_postgres(tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    """Serwer PostgreSQL dla testow dialektu produkcyjnego (adres bazy bazowej).

    Zwraca adres SQLAlchemy serwera. Klaster jest podnoszony RAZ na sesje pytest
    (nie per test) i zatrzymywany w teardownie razem z katalogiem danych.
    Izolacje per test daje `postgres_url` nizej.
    """
    z_zewnatrz = os.environ.get("MV_TEST_POSTGRES_URL")
    if z_zewnatrz:
        yield z_zewnatrz
        return

    binaria = _katalog_binariow_postgresa()
    if binaria is None:
        pytest.skip(
            "brak binariow PostgreSQL (initdb/pg_ctl/createdb) w PATH ani w "
            "/usr/lib/postgresql/*/bin — dialekt produkcyjny mozna wskazac zmienna "
            "MV_TEST_POSTGRES_URL"
        )

    katalog = tmp_path_factory.mktemp("klaster-postgres")
    dane = katalog / "dane"
    gniazda = katalog / "gniazda"
    gniazda.mkdir()
    dziennik = katalog / "postgres.log"
    dziennik.touch()

    konto = _konto_bez_uprawnien()
    if konto is not None:
        _udostepnij_przejscie(katalog)
        for sciezka in (katalog, gniazda, dziennik):
            os.chown(sciezka, konto.pw_uid, konto.pw_gid)

    def uruchom(argv: list[str], opis: str) -> subprocess.CompletedProcess[str]:
        def zejdz_z_roota() -> None:  # pragma: no cover — wykonuje sie w potomku
            assert konto is not None
            os.setgid(konto.pw_gid)
            os.setuid(konto.pw_uid)

        wynik = subprocess.run(  # noqa: S603 — argumenty budujemy sami, bez powloki
            argv,
            capture_output=True,
            text=True,
            env={**os.environ, "HOME": str(katalog), "PGUSER": _UZYTKOWNIK_EFEMERYCZNY},
            preexec_fn=zejdz_z_roota if konto is not None else None,
        )
        if wynik.returncode != 0:
            raise RuntimeError(
                f"{opis} zakonczone kodem {wynik.returncode}\n"
                f"polecenie: {' '.join(argv)}\n"
                f"stdout: {wynik.stdout.strip()}\n"
                f"stderr: {wynik.stderr.strip()}\n"
                f"dziennik serwera: {dziennik.read_text(encoding='utf-8', errors='replace')}"
            )
        return wynik

    uruchom(
        [
            str(binaria / "initdb"),
            "-D",
            str(dane),
            "-U",
            _UZYTKOWNIK_EFEMERYCZNY,
            "-A",
            "trust",
            "--encoding=UTF8",
            "--locale=C",
        ],
        "initdb klastra testowego",
    )
    port = _wolny_port()
    # `-F` = bez fsync. To baza TESTOWA, ktora ginie razem z katalogiem — trwalosc
    # po awarii zasilania nie jest tu niczyim wymaganiem, a koszt zapisu spada.
    # `trust` na loopbacku: klaster slucha wylacznie 127.0.0.1 i zyje minuty.
    uruchom(
        [
            str(binaria / "pg_ctl"),
            "-D",
            str(dane),
            "-l",
            str(dziennik),
            "-w",
            "-o",
            f"-p {port} -k {gniazda} -h 127.0.0.1 -F",
            "start",
        ],
        "start klastra testowego",
    )
    try:
        uruchom(
            [
                str(binaria / "createdb"),
                "-h",
                "127.0.0.1",
                "-p",
                str(port),
                "-U",
                _UZYTKOWNIK_EFEMERYCZNY,
                _BAZA_EFEMERYCZNA,
            ],
            "utworzenie bazy testowej",
        )
        yield (
            f"postgresql+psycopg://{_UZYTKOWNIK_EFEMERYCZNY}@127.0.0.1:{port}/{_BAZA_EFEMERYCZNA}"
        )
    finally:
        uruchom(
            [str(binaria / "pg_ctl"), "-D", str(dane), "-m", "fast", "-w", "stop"],
            "zatrzymanie klastra testowego",
        )
        # `pg_ctl status` oddaje 3, gdy serwer NIE dziala — po sesji nie zostaje
        # proces-sierota. Sprawdzamy stan zamiast mu ufac (i bez `pgrep -f`, ktory
        # dopasowalby wlasny proces).
        stan = subprocess.run(  # noqa: S603 — argumenty budujemy sami, bez powloki
            [str(binaria / "pg_ctl"), "-D", str(dane), "status"],
            capture_output=True,
            text=True,
        )
        if stan.returncode == 0:
            raise RuntimeError(
                "klaster testowy nadal dziala po `pg_ctl stop -m fast`: " + stan.stdout.strip()
            )
        shutil.rmtree(katalog, ignore_errors=True)


@pytest.fixture()
def postgres_url(klaster_postgres: str) -> Iterator[str]:
    """Adres PUSTEJ, wlasnej przestrzeni nazw na serwerze PostgreSQL — jedna na test.

    Odpowiednik izolacji, ktora dla SQLite daje plik w `tmp_path`: bez niej testy
    dzielilyby tabele (`fail_orphaned_running` zamiata KAZDY wiersz RUNNING w bazie,
    wiec pozostalosc po sasiednim tescie zmieniala by wynik). Schemat jest tanszy od
    osobnej bazy, a izoluje tak samo: `search_path` wskazuje wylacznie jego, wiec
    `create_all` i kazde niekwalifikowane zapytanie trafiaja do niego.
    """
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url

    nazwa = f"mv_test_{uuid.uuid4().hex}"
    administracyjny = create_engine(klaster_postgres, isolation_level="AUTOCOMMIT", future=True)
    try:
        with administracyjny.connect() as polaczenie:
            polaczenie.execute(text(f'CREATE SCHEMA "{nazwa}"'))
        yield str(
            make_url(klaster_postgres).update_query_dict({"options": f"-csearch_path={nazwa}"})
        )
    finally:
        with administracyjny.connect() as polaczenie:
            # Limit czekania na blokade: gdyby test zostawil otwarte polaczenie do
            # tego schematu, DROP ma PADAC z nazwanym bledem, a nie wisiec bez konca.
            polaczenie.execute(text("SET lock_timeout = '10s'"))
            polaczenie.execute(text(f'DROP SCHEMA IF EXISTS "{nazwa}" CASCADE'))
        administracyjny.dispose()


@pytest.fixture()
def db_engine(tmp_path):
    if importlib.util.find_spec("sqlalchemy") is None:
        pytest.skip("SQLAlchemy not available in test environment.")

    from infrastructure.persistence.db import (
        create_engine_from_url,
        init_db,
    )

    db_path = tmp_path / "test.db"
    engine = create_engine_from_url(f"sqlite+pysqlite:///{db_path}")
    init_db(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def db_session_factory(db_engine):
    from infrastructure.persistence.db import create_session_factory

    return create_session_factory(db_engine)


@pytest.fixture()
def uow_factory(db_session_factory):
    from infrastructure.persistence.unit_of_work import build_uow_factory

    return build_uow_factory(db_session_factory)


@pytest.fixture()
def test_db_session(db_session_factory):
    """Provide a test database session for integration tests."""
    session = db_session_factory()
    yield session
    session.rollback()
    session.close()
