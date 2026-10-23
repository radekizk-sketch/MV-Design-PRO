#!/usr/bin/env python3
"""BRAMA PEŁNA — jedno polecenie pełnej bramki lokalnej, współbieżnie tam, gdzie to bezpieczne.

PO CO (karta SZYBKIE-TESTY-DOKONCZENIE, dyrektywa właściciela 2026-10-21). Pełna bramka
lokalna integratora szła szeregowo i na 4 vCPU trwała ok. 2 h: pytest backendu ok. 32 min, 102
guardy po kolei ok. 9 min, samotesty guardów ok. 11 min jednym procesem, vitest pełny
`--no-file-parallelism` jednym procesem > 40 min, e2e (realny backend, `workers: 1`) kilkadziesiąt
minut. Ten skrypt uruchamia TE SAME zbiory co dotąd, ale w jednej puli zadań z budżetem
rdzeni, a tam, gdzie zbiór da się podzielić bez zmiany semantyki, dzieli go na shardy:

* pytest backendu: `-m "not pandapower and not andes" -n <N> --dist loadfile` (jak CI);
* samotesty guardów (`pytest ../scripts`) pod pytest-xdist;
* guardy, lint i kroki npm z CI: DOKŁADNIE te same wywołania co `guardy_z_ci.py` (jedno źródło
  prawdy: definicje workflowów), każde jako osobny krok puli — nie ma drugiej listy;
* vitest: `vitest run --no-file-parallelism --shard=k/n` (każdy shard nadal jednym plikiem naraz —
  determinizm w obrębie procesu bez zmian), potem krok budżetów czasu procesora
  (`--mode budzety`) SAM, gdy nic innego nie biegnie (mierzy czas procesora, więc cisza ma
  znaczenie);
* e2e: pliki speców dzieli `e2e_shardy.py` (LPT wg `czasy_specow.json`); KAŻDY shard dostaje
  własny backend, własny port backendu i frontendu oraz własną bazę (katalog biegu Playwrighta —
  `playwright.config.ts` tworzy go per proces) i własny katalog pamięci podręcznej Vite
  (`MVD_VITE_CACHE_DIR`, `vite.config.ts`).

DOWÓD KOMPLETNOŚCI. Podział nie może zmniejszyć zbioru: po biegu skrypt porównuje zbiór
plików vitest z raportów shardów z pełnym zbiorem kroku (rozłączność i równość), liczbę testów
e2e z raportów shardów z listą `playwright test --list` całego zbioru, a liczbę wywołań guardów
z definicją workflowów. Każda rozbieżność to czerwień biegu.

WYNIK. `<logi>/wynik.txt` i `<logi>/wynik.json`: kod wyjścia, czas ścienny i czas procesora
każdego kroku, dowód kompletności. Kod wyjścia całości: 0 = każdy krok zielony i zbiór kompletny;
1 = co najmniej jeden krok czerwony albo zbiór niekompletny; 2 = błąd użycia.

Uruchamiaj interpreterem venv backendu (guardy i samotesty importują jego zależności; systemowy
Python daje fałszywe czerwienie). Katalog logów POZA drzewem repozytorium (strażnik drzewa e2e
zgłasza każdy nowy plik nieśledzony):

    cd mv-design-pro/backend
    <venv>/bin/python ../scripts/brama_pelna.py --logi <katalog poza drzewem>

e2e wymaga Chromium (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`); interpreter backendu e2e to ten sam
interpreter, którym uruchomiono skrypt.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import e2e_shardy  # noqa: E402
import guardy_z_ci  # noqa: E402

PROJEKT = Path(__file__).resolve().parent.parent
BACKEND = PROJEKT / "backend"
FRONTEND = PROJEKT / "frontend"
POMOCNIK_VITEST = FRONTEND / "scripts" / "vitest_wplyw.mjs"

#: Selekcja markerów 1:1 z kroku `Run pytest` w `python-tests.yml`.
MARKERY_CI = "not pandapower and not andes"

#: Pierwszy port, od którego przydzielane są porty serwerów e2e (zajęte są pomijane).
PIERWSZY_PORT_E2E = 23100

#: Szacunki czasu [s] — WYŁĄCZNIE do ustawienia kolejności startu (najdłuższe pierwsze, żeby nie
#: wydłużały ogona biegu); nie wpływają na wynik. Źródło: pomiary z karty (4 vCPU).
SZACUNEK_PYTEST_S = 1900.0
SZACUNEK_VITEST_S = 2400.0  # całość; shard = całość / liczba shardów
SZACUNEK_SAMOTESTY_S = 660.0
SZACUNEK_TSC_S = 150.0
SZACUNEK_ESLINT_S = 200.0
SZACUNEK_KROK_KROTKI_S = 5.0

#: Krok o szacunku co najmniej tyle sekund, który nie mieści się w wolnym budżecie, RAMIĄ blokuje
#: start kroków za sobą w kolejce (rezerwacja): bez tego strumień lekkich kroków zajmowałby każdy
#: zwolniony rdzeń i krok ciężki (np. shard e2e o wadze 1,5) czekałby do końca kolejki
#: (zmierzone w pierwszym biegu: shardy e2e ruszyły dopiero po 3 377 s). Krótsze kroki
#: wypełniają luki bez rezerwacji.
PROG_REZERWACJI_S = 60.0

#: Wolne miejsce [MB], którego wymaga start kroku e2e (baza biegu bywa rzędu gigabajtów).
WYMAGANE_DYSKU_E2E_MB = 1500


@dataclass(frozen=True)
class Krok:
    """Jedno zadanie puli: polecenie, katalog, waga w rdzeniach, szacunek (kolejność startu)."""

    nazwa: str
    grupa: str
    polecenie: tuple[str, ...]
    katalog: Path
    waga: float = 1.0
    szacunek_s: float = SZACUNEK_KROK_KROTKI_S
    srodowisko: tuple[tuple[str, str], ...] = ()
    #: Nazwy zmiennych środowiska, którym przy starcie kroku przydzielany jest wolny port.
    zmienne_portow: tuple[str, ...] = ()
    #: Krok biegnie sam: dopiero gdy wszystkie pozostałe się skończyły i nic nie biegnie.
    wylacznie: bool = False
    wymagane_dysku_mb: int = 0


@dataclass
class Wynik:
    krok: Krok
    rc: int | None = None
    start_s: float = 0.0
    koniec_s: float = 0.0
    cpu_s: float = 0.0
    log: Path | None = None
    porty: dict[str, int] = field(default_factory=dict)

    @property
    def czas_s(self) -> float:
        return self.koniec_s - self.start_s


# --- plan -------------------------------------------------------------------------------------


def podziel_vitest(liczba_shardow: int) -> list[str]:
    """Argumenty `--shard=k/n` dla n shardów (k = 1..n)."""
    if liczba_shardow < 1:
        raise ValueError("liczba shardow vitest musi byc >= 1")
    return [f"--shard={k}/{liczba_shardow}" for k in range(1, liczba_shardow + 1)]


def kroki_guardow() -> list[Krok]:
    """Guardy, lint i kroki npm — te same obiekty co w `guardy_z_ci.py` (jedno źródło prawdy)."""
    zadania_guardow, _brakujace = guardy_z_ci._zadania_guardow()
    zadania_lintu = guardy_z_ci._zadania_lintu()
    zadania_npm, _czerwone = guardy_z_ci._zadania_npm()
    kroki: list[Krok] = []
    for grupa, zadania in (
        ("npm", zadania_npm),
        ("lint", zadania_lintu),
        ("guardy", zadania_guardow),
    ):
        for z in zadania:
            szacunek = SZACUNEK_KROK_KROTKI_S
            if z.etykieta == "npm run type-check":
                szacunek = SZACUNEK_TSC_S
            elif z.etykieta == "npm run lint":
                szacunek = SZACUNEK_ESLINT_S
            kroki.append(
                Krok(
                    nazwa=z.etykieta,
                    grupa=grupa,
                    polecenie=z.polecenie,
                    katalog=z.katalog,
                    szacunek_s=szacunek,
                )
            )
    return kroki


def kroki_pytest(logi: Path, procesy_backend: int, procesy_samotesty: int) -> list[Krok]:
    tmp = logi / "tmp"
    backend = Krok(
        nazwa="pytest backendu",
        grupa="pytest",
        polecenie=(
            sys.executable,
            "-m",
            "pytest",
            "-q",
            "-p",
            "no:cacheprovider",
            "-m",
            MARKERY_CI,
            f"--basetemp={tmp / 'pytest_backend'}",
            "-n",
            str(procesy_backend),
            "--dist",
            "loadfile",
        ),
        katalog=BACKEND,
        waga=float(procesy_backend),
        szacunek_s=SZACUNEK_PYTEST_S,
    )
    samotesty = Krok(
        nazwa="samotesty guardow",
        grupa="pytest",
        polecenie=(
            sys.executable,
            "-m",
            "pytest",
            "-q",
            "-p",
            "no:cacheprovider",
            f"--basetemp={tmp / 'pytest_skrypty'}",
            "-n",
            str(procesy_samotesty),
            str(guardy_z_ci.SCRIPTS_DIR),
        ),
        katalog=BACKEND,
        waga=float(procesy_samotesty),
        szacunek_s=SZACUNEK_SAMOTESTY_S,
    )
    return [backend, samotesty]


def kroki_vitest(logi: Path, liczba_shardow: int) -> list[Krok]:
    tmp = logi / "tmp"
    kroki: list[Krok] = []
    for k, shard in enumerate(podziel_vitest(liczba_shardow), start=1):
        nazwa = f"vitest shard {k}/{liczba_shardow}"
        kroki.append(
            Krok(
                nazwa=nazwa,
                grupa="vitest",
                polecenie=(
                    "npx",
                    "vitest",
                    "run",
                    "--no-file-parallelism",
                    shard,
                    "--reporter=default",
                    "--reporter=json",
                    f"--outputFile.json={logi / 'raporty' / f'vitest_{k}.json'}",
                ),
                katalog=FRONTEND,
                waga=1.0,
                szacunek_s=SZACUNEK_VITEST_S / liczba_shardow,
                srodowisko=(("MVD_VITE_CACHE_DIR", str(tmp / f"vite_vitest_{k}")),),
            )
        )
    kroki.append(
        Krok(
            nazwa="vitest budzety",
            grupa="vitest",
            polecenie=(
                "npx",
                "vitest",
                "run",
                "--mode",
                "budzety",
                "--reporter=default",
                "--reporter=json",
                f"--outputFile.json={logi / 'raporty' / 'vitest_budzety.json'}",
            ),
            katalog=FRONTEND,
            waga=1.0,
            szacunek_s=15.0,
            srodowisko=(("MVD_VITE_CACHE_DIR", str(tmp / "vite_budzety")),),
            wylacznie=True,
        )
    )
    return kroki


def kroki_e2e(logi: Path, liczba_shardow: int) -> list[Krok]:
    """Shardy e2e: podział LPT z `e2e_shardy.py`, każdy z własnym backendem, portami i bazą."""
    pliki = e2e_shardy.speki()
    wagi, _bez_pomiaru, bez_pliku = e2e_shardy.wagi(pliki, e2e_shardy.wczytaj_czasy())
    if bez_pliku:
        raise SystemExit(
            "BLAD: czasy_specow.json mierzy speki, ktorych nie ma: " + ", ".join(bez_pliku)
        )
    shardy = e2e_shardy.przydziel(wagi, liczba_shardow)
    tmp = logi / "tmp"
    kroki: list[Krok] = []
    for k, shard in enumerate(shardy, start=1):
        kroki.append(
            Krok(
                nazwa=f"e2e shard {k}/{liczba_shardow}",
                grupa="e2e",
                polecenie=(
                    "node",
                    "./scripts/playwright-run-real.mjs",
                    "--reporter=line,json",
                    *shard,
                ),
                katalog=FRONTEND,
                waga=1.5,
                szacunek_s=sum(wagi[p] for p in shard),
                srodowisko=(
                    ("PLAYWRIGHT_JSON_OUTPUT_NAME", str(logi / "raporty" / f"e2e_{k}.json")),
                    ("PLAYWRIGHT_BACKEND_PYTHON", sys.executable),
                    ("MVD_VITE_CACHE_DIR", str(tmp / f"vite_e2e_{k}")),
                ),
                zmienne_portow=("PLAYWRIGHT_BACKEND_PORT", "PLAYWRIGHT_FRONTEND_PORT"),
                wymagane_dysku_mb=WYMAGANE_DYSKU_E2E_MB,
            )
        )
    return kroki


def zbuduj_plan(
    logi: Path,
    procesy_backend: int,
    procesy_samotesty: int,
    shardy_vitest: int,
    shardy_e2e: int,
) -> list[Krok]:
    """Pełny plan bramki: kolejność w liście to kolejność w meldunku."""
    return [
        *kroki_pytest(logi, procesy_backend, procesy_samotesty),
        *kroki_vitest(logi, shardy_vitest),
        *kroki_e2e(logi, shardy_e2e),
        *kroki_guardow(),
    ]


# --- porty ------------------------------------------------------------------------------------

_BLOKADA_PORTOW = threading.Lock()
_PRZYDZIELONE_PORTY: set[int] = set()


def _port_wolny(port: int) -> bool:
    for adres in ("127.0.0.1", "0.0.0.0"):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as gniazdo:
            try:
                gniazdo.bind((adres, port))
            except OSError:
                return False
    return True


def zajmij_porty(liczba: int, od: int = PIERWSZY_PORT_E2E) -> list[int]:
    """`liczba` portów wolnych w chwili wołania i jeszcze nieprzydzielonych w tym procesie."""
    with _BLOKADA_PORTOW:
        wynik: list[int] = []
        port = od
        while len(wynik) < liczba:
            if port > 65000:
                raise RuntimeError("brak wolnych portow dla serwerow e2e")
            if port not in _PRZYDZIELONE_PORTY and _port_wolny(port):
                _PRZYDZIELONE_PORTY.add(port)
                wynik.append(port)
            port += 1
        return wynik


# --- wykonanie --------------------------------------------------------------------------------

_PIDY_WLASNE: set[int] = set()
_BLOKADA_PIDOW = threading.Lock()
_PRZERWANO = threading.Event()


def _nazwa_pliku(nazwa: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", nazwa).strip("_")[:120] or "krok"


def _uruchom_krok(krok: Krok, logi: Path, t0: float) -> Wynik:
    """Uruchom krok jako własną grupę procesów; log łączny stdout+stderr; czas procesora z wait4."""
    wynik = Wynik(krok=krok)
    katalog_logu = logi / krok.grupa
    katalog_logu.mkdir(parents=True, exist_ok=True)
    wynik.log = katalog_logu / f"{_nazwa_pliku(krok.nazwa)}.log"
    srodowisko = dict(os.environ)
    srodowisko.update(dict(krok.srodowisko))
    if krok.zmienne_portow:
        for nazwa, port in zip(
            krok.zmienne_portow, zajmij_porty(len(krok.zmienne_portow)), strict=True
        ):
            srodowisko[nazwa] = str(port)
            wynik.porty[nazwa] = port
    wynik.start_s = time.monotonic() - t0
    with open(wynik.log, "wb") as plik_logu:
        plik_logu.write(f"$ {' '.join(krok.polecenie)}\n(cwd {krok.katalog})\n".encode())
        plik_logu.flush()
        try:
            proces = subprocess.Popen(
                list(krok.polecenie),
                cwd=krok.katalog,
                env=srodowisko,
                stdout=plik_logu,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                start_new_session=True,
            )
        except OSError as blad:
            plik_logu.write(f"BLAD STARTU: {blad}\n".encode())
            wynik.rc = 127
            wynik.koniec_s = time.monotonic() - t0
            return wynik
        with _BLOKADA_PIDOW:
            _PIDY_WLASNE.add(proces.pid)
        _pid, status, uzycie = os.wait4(proces.pid, 0)
        with _BLOKADA_PIDOW:
            _PIDY_WLASNE.discard(proces.pid)
    wynik.rc = os.waitstatus_to_exitcode(status)
    if wynik.rc < 0:
        wynik.rc = 128 - wynik.rc
    wynik.cpu_s = uzycie.ru_utime + uzycie.ru_stime
    wynik.koniec_s = time.monotonic() - t0
    return wynik


def zatrzymaj_wlasne_procesy() -> None:
    """Zatrzymaj WYŁĄCZNIE grupy procesów uruchomione przez ten skrypt (po PID, nigdy po wzorcu)."""
    with _BLOKADA_PIDOW:
        pidy = list(_PIDY_WLASNE)
    for pid in pidy:
        try:
            os.killpg(pid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass


def wolne_dysku_mb(sciezka: Path) -> float:
    uzycie = shutil.disk_usage(sciezka)
    return uzycie.free / (1024 * 1024)


def wykonaj(
    kroki: Sequence[Krok],
    budzet: float,
    logi: Path,
    uruchom: Callable[[Krok, Path, float], Wynik] = _uruchom_krok,
    wolne_dysku: Callable[[], float] | None = None,
    komunikat: Callable[[str], None] = lambda tekst: print(tekst, flush=True),
) -> list[Wynik]:
    """Pula kroków z budżetem rdzeni. Wyniki w KOLEJNOŚCI PLANU (nie zakończenia).

    * start: z kolejki posortowanej malejąco wg szacunku (najdłuższe pierwsze) pierwszy krok, którego
      waga mieści się w wolnym budżecie; krok ciężki (szacunek >= `PROG_REZERWACJI_S`), który się
      nie mieści, rezerwuje budżet i wstrzymuje kroki za sobą (brak głodzenia); gdy nic nie
      biegnie, startuje pierwszy z kolejki nawet przy wadze ponad budżet (brak zakleszczenia);
    * krok `wylacznie` startuje dopiero, gdy żaden inny nie biegnie i żaden nie czeka;
    * krok z `wymagane_dysku_mb` czeka na wolne miejsce, o ile cokolwiek biegnie (zwolni je);
    * pula nie pomija żadnego kroku: po zakończeniu każdy krok ma wynik.
    """
    t0 = time.monotonic()
    oczekujace = sorted(
        range(len(kroki)), key=lambda i: (kroki[i].wylacznie, -kroki[i].szacunek_s, i)
    )
    wyniki: dict[int, Wynik] = {}
    biegnace: dict[int, float] = {}
    warunek = threading.Condition()
    sprawdz_dysk = wolne_dysku or (lambda: wolne_dysku_mb(logi))

    def watek(indeks: int) -> None:
        krok = kroki[indeks]
        try:
            wynik = uruchom(krok, logi, t0)
        except BaseException as blad:  # krok z wyjątkiem to czerwień z przyczyną, nie zawieszenie
            wynik = Wynik(krok=krok, rc=125, start_s=time.monotonic() - t0)
            wynik.koniec_s = wynik.start_s
            komunikat(f"[BLAD KROKU] {krok.nazwa}: {blad!r}")
        with warunek:
            wyniki[indeks] = wynik
            del biegnace[indeks]
            warunek.notify_all()
        komunikat(
            f"[{time.monotonic() - t0:7.1f} s] KONIEC {krok.nazwa}: RC={wynik.rc}, "
            f"{wynik.czas_s:.1f} s (procesor {wynik.cpu_s:.1f} s)"
        )

    watki: list[threading.Thread] = []
    with warunek:
        while oczekujace or biegnace:
            wybrany: int | None = None
            uzyte = sum(biegnace.values())
            for indeks in oczekujace:
                krok = kroki[indeks]
                if _PRZERWANO.is_set():
                    break
                if krok.wylacznie:
                    if not biegnace and all(kroki[i].wylacznie for i in oczekujace):
                        wybrany = indeks
                    continue
                if biegnace and uzyte + krok.waga > budzet:
                    if krok.szacunek_s >= PROG_REZERWACJI_S:
                        break
                    continue
                if biegnace and krok.wymagane_dysku_mb and sprawdz_dysk() < krok.wymagane_dysku_mb:
                    if krok.szacunek_s >= PROG_REZERWACJI_S:
                        break
                    continue
                wybrany = indeks
                break
            if _PRZERWANO.is_set() and not biegnace:
                break
            if wybrany is None:
                warunek.wait(timeout=5.0)
                continue
            oczekujace.remove(wybrany)
            biegnace[wybrany] = kroki[wybrany].waga
            komunikat(
                f"[{time.monotonic() - t0:7.1f} s] START {kroki[wybrany].nazwa} "
                f"(waga {kroki[wybrany].waga:g}, biegnie {len(biegnace)})"
            )
            w = threading.Thread(target=watek, args=(wybrany,), daemon=True)
            watki.append(w)
            w.start()
    for w in watki:
        w.join()
    nieuruchomione = [kroki[i] for i in oczekujace]
    for krok in nieuruchomione:
        wyniki[kroki.index(krok)] = Wynik(krok=krok, rc=None)
    return [wyniki[i] for i in range(len(kroki))]


# --- dowód kompletności -----------------------------------------------------------------------


def zbior_plikow_vitest(raport: dict) -> tuple[list[str], dict[str, int]]:
    """Pliki testów z raportu JSON vitest oraz liczby testów (`total`, `passed`, `failed`,
    `skipped`)."""
    pliki = [wpis["name"] for wpis in raport.get("testResults", [])]
    liczby = {
        "total": int(raport.get("numTotalTests", 0)),
        "passed": int(raport.get("numPassedTests", 0)),
        "failed": int(raport.get("numFailedTests", 0)),
        "skipped": int(raport.get("numPendingTests", 0)) + int(raport.get("numTodoTests", 0)),
    }
    return pliki, liczby


def sprawdz_shardy_vitest(
    raporty: Sequence[dict], pelny_zbior: Sequence[str], etykieta: str
) -> tuple[list[str], list[str]]:
    """(dowody, bledy): shardy vitest są rozłączne i razem dają dokładnie `pelny_zbior`."""
    bledy: list[str] = []
    widziane: dict[str, int] = {}
    suma = {"total": 0, "passed": 0, "failed": 0, "skipped": 0}
    for numer, raport in enumerate(raporty, start=1):
        pliki, liczby = zbior_plikow_vitest(raport)
        for plik in pliki:
            if plik in widziane:
                bledy.append(
                    f"{etykieta}: plik w dwoch shardach ({widziane[plik]} i {numer}): {plik}"
                )
            widziane[plik] = numer
        for klucz, wartosc in liczby.items():
            suma[klucz] += wartosc
    pelny = set(pelny_zbior)
    brakuje = sorted(pelny - set(widziane))
    nadmiar = sorted(set(widziane) - pelny)
    for plik in brakuje:
        bledy.append(f"{etykieta}: plik pelnego zbioru nie wykonany w zadnym shardzie: {plik}")
    for plik in nadmiar:
        bledy.append(f"{etykieta}: plik spoza pelnego zbioru w shardzie: {plik}")
    dowod = (
        f"{etykieta}: {len(widziane)} plikow w {len(raporty)} raportach = {len(pelny)} plikow "
        f"pelnego zbioru; testow {suma['total']} (zielone {suma['passed']}, "
        f"czerwone {suma['failed']}, pominiete/todo {suma['skipped']})"
    )
    return [dowod], bledy


def testy_playwright(raport: dict) -> tuple[int, dict[str, int], set[str]]:
    """(liczba testów, liczby wg statusu, pliki speców) z raportu JSON Playwrighta."""
    liczby: dict[str, int] = {}
    pliki: set[str] = set()

    def przejdz(suite: dict, plik: str | None) -> None:
        plik = suite.get("file") or plik
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                status = test.get("status") or "nieznany"
                liczby[status] = liczby.get(status, 0) + 1
                if plik:
                    pliki.add(f"e2e/{plik}")
        for podrzedny in suite.get("suites", []):
            przejdz(podrzedny, plik)

    for suite in raport.get("suites", []):
        przejdz(suite, None)
    return sum(liczby.values()), liczby, pliki


def sprawdz_shardy_e2e(
    raporty: Sequence[dict], lista_pelna: dict, pliki_pelne: Sequence[str]
) -> tuple[list[str], list[str]]:
    """(dowody, bledy): liczba testów i zbiór speców shardów = pełny zbiór z `--list`."""
    bledy: list[str] = []
    razem = 0
    suma_statusow: dict[str, int] = {}
    pliki: set[str] = set()
    for numer, raport in enumerate(raporty, start=1):
        liczba, statusy, pliki_shardu = testy_playwright(raport)
        razem += liczba
        for status, ile in statusy.items():
            suma_statusow[status] = suma_statusow.get(status, 0) + ile
        podwojne = pliki & pliki_shardu
        for plik in sorted(podwojne):
            bledy.append(f"e2e: spec w wiecej niz jednym shardzie (powtorzony w {numer}): {plik}")
        pliki |= pliki_shardu
    oczekiwane, _status, pliki_listy = testy_playwright(lista_pelna)
    if razem != oczekiwane:
        bledy.append(f"e2e: testow w shardach {razem}, w pelnej liscie {oczekiwane}")
    if pliki != set(pliki_pelne):
        for plik in sorted(set(pliki_pelne) - pliki):
            bledy.append(f"e2e: spec bez wykonanego testu w zadnym shardzie: {plik}")
        for plik in sorted(pliki - set(pliki_pelne)):
            bledy.append(f"e2e: spec spoza pelnego zbioru: {plik}")
    if pliki_listy != set(pliki_pelne):
        bledy.append("e2e: lista Playwrighta i katalog e2e/*.spec.ts roznia sie zbiorem plikow")
    statusy_tekst = ", ".join(f"{k} {v}" for k, v in sorted(suma_statusow.items()))
    dowod = (
        f"e2e: {razem} testow w {len(raporty)} raportach shardow = {oczekiwane} testow pelnej "
        f"listy; {len(pliki)} speckow z {len(pliki_pelne)} plikow katalogu; statusy: {statusy_tekst}"
    )
    return [dowod], bledy


# --- raport ------------------------------------------------------------------------------------


def _wczytaj_json(plik: Path) -> dict | None:
    try:
        return json.loads(plik.read_text(encoding="utf-8"))  # type: ignore[no-any-return]
    except (OSError, ValueError):
        return None


def pelna_lista_vitest(tryb: str, plik: Path) -> list[str]:
    """Komplet plików kroku vitest (`test` albo `budzety`) z pomocnika `vitest_wplyw.mjs`."""
    wynik = subprocess.run(
        ["node", str(POMOCNIK_VITEST), str(plik), tryb],
        cwd=FRONTEND,
        capture_output=True,
        text=True,
        check=False,
    )
    if wynik.returncode != 0:
        raise SystemExit(
            f"BLAD: lista plikow vitest [{tryb}] kod {wynik.returncode}\n{wynik.stderr}"
        )
    dane = json.loads(plik.read_text(encoding="utf-8"))
    lista: list[str] = dane["lista"]
    if len(lista) != dane["wszystkich"]:
        raise SystemExit("BLAD: lista plikow vitest niespojna z liczba wszystkich")
    return lista


def pelna_lista_e2e(plik: Path) -> dict:
    """Pełna lista testów e2e (`playwright test --list`) — wzorzec dla sumy shardów."""
    srodowisko = dict(os.environ)
    srodowisko["PLAYWRIGHT_JSON_OUTPUT_NAME"] = str(plik)
    wynik = subprocess.run(
        ["node", "./scripts/playwright-run-real.mjs", "--list", "--reporter=json"],
        cwd=FRONTEND,
        env=srodowisko,
        capture_output=True,
        text=True,
        check=False,
    )
    dane = _wczytaj_json(plik)
    if wynik.returncode != 0 or dane is None:
        raise SystemExit(f"BLAD: lista testow e2e kod {wynik.returncode}\n{wynik.stderr[-2000:]}")
    return dane


def ostatnie_linie(plik: Path | None, ile: int = 12) -> list[str]:
    if plik is None or not plik.exists():
        return []
    return plik.read_text(encoding="utf-8", errors="replace").splitlines()[-ile:]


def podsumuj(
    wyniki: Sequence[Wynik],
    dowody: Sequence[str],
    bledy_kompletnosci: Sequence[str],
    czas_calosci_s: float,
    rdzenie: int,
) -> tuple[str, dict, int]:
    """(tekst, słownik JSON, kod wyjścia) całej bramki."""
    czerwone = [w for w in wyniki if w.rc != 0]
    cpu = sum(w.cpu_s for w in wyniki)
    linie = ["=== WYNIK BRAMY PELNEJ ==="]
    for w in wyniki:
        znak = "ZIELONY " if w.rc == 0 else ("NIE URUCHOMIONY" if w.rc is None else "CZERWONY")
        linie.append(
            f"{znak:8} [{w.krok.grupa}] {w.krok.nazwa}: RC={w.rc}, {w.czas_s:.1f} s "
            f"(start {w.start_s:.0f} s, procesor {w.cpu_s:.1f} s)"
        )
    linie.append("")
    grupy: dict[str, list[Wynik]] = {}
    for w in wyniki:
        grupy.setdefault(w.krok.grupa, []).append(w)
    for grupa, lista in grupy.items():
        linie.append(
            f"grupa {grupa}: {len(lista)} krokow, czerwone {sum(1 for w in lista if w.rc != 0)}, "
            f"suma czasow krokow {sum(w.czas_s for w in lista):.0f} s, "
            f"procesor {sum(w.cpu_s for w in lista):.0f} s"
        )
    linie.append("")
    linie.append("DOWOD KOMPLETNOSCI ZBIORU:")
    linie.extend(f"  {d}" for d in dowody)
    linie.extend(f"  BLAD: {b}" for b in bledy_kompletnosci)
    linie.append("")
    linie.append(
        f"Czas scienny calosci: {czas_calosci_s:.0f} s; suma czasu procesora krokow: {cpu:.0f} s "
        f"(dolna granica scienna na {rdzenie} rdzeniach: {cpu / max(rdzenie, 1):.0f} s)"
    )
    kod = 0 if not czerwone and not bledy_kompletnosci else 1
    if czerwone:
        linie.append("CZERWONE: " + ", ".join(f"{w.krok.nazwa} (RC={w.rc})" for w in czerwone))
    linie.append("BRAMA PELNA: " + ("KOMPLET ZIELONY." if kod == 0 else "CZERWONA."))
    dane = {
        "kod_wyjscia": kod,
        "czas_calosci_s": round(czas_calosci_s, 1),
        "czas_procesora_s": round(cpu, 1),
        "rdzenie": rdzenie,
        "dowod_kompletnosci": list(dowody),
        "bledy_kompletnosci": list(bledy_kompletnosci),
        "kroki": [
            {
                "nazwa": w.krok.nazwa,
                "grupa": w.krok.grupa,
                "rc": w.rc,
                "czas_s": round(w.czas_s, 1),
                "start_s": round(w.start_s, 1),
                "czas_procesora_s": round(w.cpu_s, 1),
                "porty": w.porty,
                "log": str(w.log) if w.log else None,
            }
            for w in wyniki
        ],
    }
    return "\n".join(linie) + "\n", dane, kod


def zbierz_dowody(
    wyniki: Sequence[Wynik], logi: Path, wzorce: dict[str, object]
) -> tuple[list[str], list[str]]:
    """Dowód kompletności z raportów shardów i wzorców zebranych przed biegiem."""
    dowody: list[str] = []
    bledy: list[str] = []
    raporty = logi / "raporty"

    def raporty_grupy(prefiks: str, liczba: int) -> list[dict] | None:
        zebrane = [_wczytaj_json(raporty / f"{prefiks}_{k}.json") for k in range(1, liczba + 1)]
        if any(r is None for r in zebrane):
            brak = [k for k, r in enumerate(zebrane, start=1) if r is None]
            bledy.append(f"{prefiks}: brak raportu JSON shardow {brak} (shard nie dotarl do konca)")
            return None
        return [r for r in zebrane if r is not None]

    vitest_shardow = sum(1 for w in wyniki if w.krok.nazwa.startswith("vitest shard"))
    e2e_shardow = sum(1 for w in wyniki if w.krok.nazwa.startswith("e2e shard"))
    lista_test = wzorce.get("vitest_test")
    if vitest_shardow and isinstance(lista_test, list):
        r = raporty_grupy("vitest", vitest_shardow)
        if r is not None:
            d, b = sprawdz_shardy_vitest(r, lista_test, "vitest (bieg glowny)")
            dowody += d
            bledy += b
    lista_budzety = wzorce.get("vitest_budzety")
    if isinstance(lista_budzety, list):
        rb = _wczytaj_json(raporty / "vitest_budzety.json")
        if rb is None:
            bledy.append("vitest budzety: brak raportu JSON")
        else:
            d, b = sprawdz_shardy_vitest([rb], lista_budzety, "vitest (budzety czasu)")
            dowody += d
            bledy += b
    lista_e2e = wzorce.get("e2e_lista")
    if e2e_shardow and isinstance(lista_e2e, dict):
        r = raporty_grupy("e2e", e2e_shardow)
        if r is not None:
            d, b = sprawdz_shardy_e2e(r, lista_e2e, e2e_shardy.speki())
            dowody += d
            bledy += b
    oczekiwane_guardy = len(guardy_z_ci.wywolania_z_workflowow())
    wykonane = sum(1 for w in wyniki if w.krok.grupa == "guardy")
    dowody.append(
        f"guardy: {wykonane} wywolan wykonanych = {oczekiwane_guardy} wywolan w workflowach CI"
    )
    if wykonane != oczekiwane_guardy:
        bledy.append(f"guardy: wykonano {wykonane}, workflowy wolaja {oczekiwane_guardy}")
    for nazwa in ("pytest backendu", "samotesty guardow"):
        for w in wyniki:
            if w.krok.nazwa == nazwa:
                koncowka = [x for x in ostatnie_linie(w.log, 3) if x.strip()]
                dowody.append(f"{nazwa}: {koncowka[-1].strip() if koncowka else '(brak wyjscia)'}")
    return dowody, bledy


def main(argv: list[str] | None = None) -> int:
    procesory = os.cpu_count() or 1
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--logi", required=True, type=Path, help="katalog logow (poza drzewem repo)"
    )
    parser.add_argument(
        "--budzet",
        type=float,
        default=procesory * 1.5,
        help="budzet wag krokow naraz (domyslnie 1,5 x rdzenie: e2e i vitest nie zajmuja rdzenia "
        "w calosci)",
    )
    parser.add_argument("--procesy-backend", type=int, default=max(2, procesory - 1))
    parser.add_argument("--procesy-samotesty", type=int, default=max(2, procesory // 2))
    parser.add_argument("--shardy-vitest", type=int, default=procesory)
    parser.add_argument("--shardy-e2e", type=int, default=procesory)
    parser.add_argument("--tylko-plan", action="store_true", help="wypisz plan i zakoncz")
    argumenty = parser.parse_args(argv)

    logi = argumenty.logi.resolve()
    repo = PROJEKT.parent.resolve()
    if logi == repo or repo in logi.parents:
        print(
            f"BLAD: katalog logow {logi} lezy w drzewie repozytorium — strazniki drzewa e2e "
            "zglosilyby kazdy nowy plik; podaj katalog poza drzewem.",
            file=sys.stderr,
        )
        return 2
    if (
        min(argumenty.procesy_backend, argumenty.procesy_samotesty) < 1
        or min(argumenty.shardy_vitest, argumenty.shardy_e2e) < 1
    ):
        print("BLAD: liczby procesow i shardow musza byc >= 1", file=sys.stderr)
        return 2

    if not guardy_z_ci.WORKFLOWS_DIR.is_dir():
        print(f"BLAD: brak katalogu workflowow: {guardy_z_ci.WORKFLOWS_DIR}", file=sys.stderr)
        return 1
    if len(guardy_z_ci.guardy_z_workflowow()) < guardy_z_ci.MIN_GUARDOW:
        print("BLAD: skan workflowow guardow zwrocil za malo guardow (pusty skan)", file=sys.stderr)
        return 1
    _zad, brakujace = guardy_z_ci._zadania_guardow()
    if brakujace:
        print(
            "BLAD: workflow wola guardy, ktorych nie ma: " + ", ".join(brakujace), file=sys.stderr
        )
        return 1
    if not (FRONTEND / "node_modules").is_dir():
        print("BLAD: frontend/node_modules nieobecne (npm ci albo dowiazanie)", file=sys.stderr)
        return 1

    (logi / "raporty").mkdir(parents=True, exist_ok=True)
    (logi / "tmp").mkdir(parents=True, exist_ok=True)
    plan = zbuduj_plan(
        logi,
        argumenty.procesy_backend,
        argumenty.procesy_samotesty,
        argumenty.shardy_vitest,
        argumenty.shardy_e2e,
    )
    print(
        f"Plan: {len(plan)} krokow, budzet {argumenty.budzet:g}, rdzenie {procesory} "
        f"(pytest -n {argumenty.procesy_backend}, samotesty -n {argumenty.procesy_samotesty}, "
        f"vitest {argumenty.shardy_vitest} shardow, e2e {argumenty.shardy_e2e} shardow)"
    )
    if argumenty.tylko_plan:
        for krok in plan:
            print(
                f"  [{krok.grupa}] {krok.nazwa} (waga {krok.waga:g}, szacunek {krok.szacunek_s:.0f} s)"
            )
        return 0

    t0 = time.monotonic()
    wzorce: dict[str, object] = {
        "vitest_test": pelna_lista_vitest("test", logi / "raporty" / "lista_vitest_test.json"),
        "vitest_budzety": pelna_lista_vitest(
            "budzety", logi / "raporty" / "lista_vitest_budzety.json"
        ),
        "e2e_lista": pelna_lista_e2e(logi / "raporty" / "lista_e2e.json"),
    }
    print(f"Wzorce zbiorow gotowe po {time.monotonic() - t0:.1f} s.", flush=True)

    def przy_sygnale(_numer: int, _ramka: object) -> None:
        _PRZERWANO.set()
        zatrzymaj_wlasne_procesy()

    signal.signal(signal.SIGINT, przy_sygnale)
    signal.signal(signal.SIGTERM, przy_sygnale)

    t_start = time.monotonic()
    wyniki = wykonaj(plan, argumenty.budzet, logi)
    czas = time.monotonic() - t_start
    dowody, bledy = zbierz_dowody(wyniki, logi, wzorce)
    tekst, dane, kod = podsumuj(wyniki, dowody, bledy, czas, procesory)
    (logi / "wynik.txt").write_text(tekst, encoding="utf-8")
    (logi / "wynik.json").write_text(
        json.dumps(dane, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    shutil.rmtree(logi / "tmp", ignore_errors=True)
    print("\n" + tekst)
    for w in wyniki:
        if w.rc != 0:
            print(f"--- ogon logu czerwonego kroku {w.krok.nazwa} ({w.log}) ---", file=sys.stderr)
            for linia in ostatnie_linie(w.log):
                print(f"    {linia}", file=sys.stderr)
    return kod


if __name__ == "__main__":
    sys.exit(main())
