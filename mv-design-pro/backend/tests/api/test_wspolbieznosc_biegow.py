"""Wspolbieznosc koncowek API — miara „done" osi wspolbieznosci programu 10x.

KARTA CV-4.3-A4 (K5.1, 2026-09-06). Plik mierzyl pierwotnie `POST /api/cases/
{id}/runs/{power-flow,short-circuit}` (`api/enm.py`) — trasy skasowane
procedura siedmiu krokow (0 konsumentow produkcyjnych; ZNALEZISKO PRZY OKAZJI
tej samej karty: ten plik NIE zostal policzony w pierwotnym pomiarze
konsumentow testowych karty, bo adres koncowki budowal Sie Z ZMIENNEJ
parametryzacji [`f"/api/cases/{{case_id}}/runs/{{sciezka}}"`], nie z literalu —
grep po literalnym `runs/short-circuit`/`runs/power-flow` go nie widzial; pelny
`pytest` zlapal luke, ktorej grep nie mogl). Wlasnosc pod pomiarem (koncowka z
BLOKUJACYM wnetrzem nie moze dusic petli zdarzen) przenosi sie WPROST na tor
kanoniczny: `execute_run` (`api/execution_runs.py`) jest funkcja PLAIN `def`
(nie `async def`) — FastAPI sam odklada taka funkcje do puli watkow (ten sam
mechanizm bazowy, z ktorego korzystala `run_power_flow` PRZED karta; `run_
short_circuit` byla `async def` z RECZNYM `run_in_threadpool` w srodku, bo
potrzebowala `await request.json()` — `execute_run` nie czyta ciala zadania,
wiec nie ma tego ograniczenia). Fizyka solvera zyje WYLACZNIE w kroku
`execute` (`create_run` tylko waliduje migawke i liczy hash — bez solvera),
wiec TO WLASNIE `execute` jest oknem pomiaru; `create_run` jest przygotowaniem
poza oknem, analogicznie do `_zasiej`.

CO TEN TEST PILNUJE. Projektant w JEDNEJ sesji odpala kilka analiz rownolegle
(rozplyw + zwarcia) i czyta model — UI ma pozostac responsywne. Koncowka
zdefiniowana jako `async def` z BLOKUJACYM wnetrzem (solver CPU, sync
SQLAlchemy, IO pliku modelu) zajmuje petle zdarzen na caly czas swojej pracy,
wiec K rownoleglych zadan wykonuje sie SZEREGOWO — laczny czas rosnie liniowo z
K, a kazde inne zadanie (nawet trywialny odczyt) czeka na koniec biegu.

MIARA JEST WZGLEDNA, NIE MILISEKUNDOWA. Progi bezwzgledne (np. „ponizej 800 ms")
sa zrodlem flakow: ten sam kod na wolniejszym runnerze CI przekracza kazdy
sensowny prog. Mierzymy wiec ZYSK rownoleglosci wzgledem tego samego biegu
wykonanego szeregowo, w tym samym procesie i na tej samej maszynie — stosunek
jest odporny na predkosc maszyny.

DRUGA MIARA — RESPONSYWNOSC — JEST DETERMINISTYCZNA, NIE CZASOWA (karta
CI-WSPOLBIEZNOSC, 2026-09-16). Test responsywnosci PARKUJE biegi w oknie solvera
na spotkaniu (`threading.Event` wstrzykniete w JEDYNY dyspozytor fizyki
`enm.canonical_analysis._wykonaj_analize_biegu`), wysyla lekkie zadanie i pyta,
czy zostalo obsluzone, ZANIM biegi zwolniono. Petla zdarzen zablokowana biegiem
nie obsluzy niczego do konca biegu — sonda wraca dopiero po zwolnieniu, werdykt
jest czerwony bez zadnego zegara. Petla wolna (bieg w puli watkow) obsluguje
sonde w milisekundach, bo zaparkowane biegi NIE LICZA — nie ma rywalizacji o
GIL, ktora psula pomiary czasowe. Po zwolnieniu biegi licza NAPRAWDE (200 i
wynik z solvera) — sciezka uzytkownika jest ta sama, tylko zatrzymana na
chwile w polowie.

DLACZEGO NIE POMIAR CZASOWY — TRZY POKOLENIA CHWIEJNOSCI, WSZYSTKIE ZMIERZONE:
  1. `p95 sondy < polowa czasu partii` (do 2026-08-08): odniesienie (czas
     partii) skrocilo sie 4x po przyspieszeniach solvera, ogon opoznien sondy
     (kwanty GIL, wywlaszczenia planisty) nie — 13 falszywych zapalen na 160
     pomiarow. Kwantyl opoznienia NIE ODROZNIA blokady petli od rywalizacji o
     procesor, i to w obie strony: przy dzialajacym offloadzie pojedyncze
     zapytanie potrafi staknac na setki ms (zmierzone maksimum 588 ms), a przy
     zablokowanej petli proba kurczy sie do 1-4 zapytan i kwantyl z trzech
     liczb bywa NISKI (zmierzona mediana 1,35x odniesienia). Odniesienie bez
     obciazenia (~2 ms) ma wlasny szum (1,8-8,7 ms) wiekszy niz sygnal.
  2. Licznik sond obsluzonych OD POCZATKU DO KONCA w oknie jakiegos biegu, prog
     5 z pomiaru 120 prob (karta CHWIEJNY-WSPOLBIEZNOSC, 2026-08-08): rozklady
     byly ROZLACZNE na maszynie pomiarowej (poprawny kod: najgorzej 8, mediana
     16; cofniety offload: 57 z 60 dalo 0, najgorzej 3). Zalozenie, ze liczba
     sond w partii jest bezwymiarowa (czas partii w jednostkach okresu sondy
     mierzonego w tych samych warunkach), UPADLO NA CI: run 34451122681
     (Python tests 4946, 2026-09-10, commit 20890e88) — partia rozplywu 191 ms,
     sonda zdazyla wyslac 5 zapytan, 3 obsluzone w locie < 5; bieg PR (4947)
     tego samego commitu zielony. Okres sondy pod obciazeniem K watkow solvera
     NIE skaluje sie z czasem partii jednakowo na kazdej maszynie (lokalnie
     6-14 zapytan na partie, na runnerze CI 5). Korekta W1 (2026-09-09)
     powiekszyla model do 24 szyn, zeby przywrocic rezim pomiaru — naprawa
     INSTANCJI (dobor rozmiaru sieci pod maszyne), nie klasy.
  3. Porzadek zakonczen przy K=1 z werdyktem z czestosci (15 prob, wiekszosc):
     stabilny w pomiarze (98,75 % wobec 3,75 %), ale nadal STOCHASTYCZNY — te
     same czestosci na innej maszynie nie sa niczym gwarantowane. Zastapiony ta
     sama bramka deterministyczna przy K=1.
Klasa wspolna trzech pokolen: kazda miara porownywala DWA CZASY zmierzone pod
rywalizacja o procesor, a rywalizacja o procesor nie jest tym, co test ma
wykrywac. Spotkanie w oknie solvera usuwa czas z werdyktu w ogole.

CZEGO SPOTKANIE NIE MIERZY: przepustowosci (mierzy ja test determinizmu:
iloraz partii rownoleglej i szeregowej z podloga bezwzgledna) ani blokad POZA
oknem solvera (np. zapis wyniku wykonany na petli zdarzen przy koncowce
`async def` z offloadem samego solvera) — dzis nie ma takiej sciezki:
`execute_run` jest funkcja `def`, wiec CALA obsluga zadania idzie w puli
watkow, a spotkanie siedzi wewnatrz tej obslugi.
"""

from __future__ import annotations

import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import pytest
from api.main import app
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_source_record
from tests.utils.biegi import wykonaj_bieg

#: Liczba rownoleglych zadan w miarze „done" (§3 planu 10x).
K_ROWNOLEGLYCH = 10

#: Liczba szyn promieniowego lancucha modelu pomiarowego (patrz `_model_sn`) —
#: dobrana pomiarem 2026-09-09 tak, zeby bieg szeregowy trwal kilkadziesiat ms.
_LICZBA_SZYN_LANCUCHA = 24

#: Czas, w ktorym WSZYSTKIE biegi partii musza wejsc w okno solvera (parking na
#: spotkaniu). Przy dzialajacym offloadzie K biegow wchodzi w ciagu milisekund
#: (kazdy `execute_run` to odczyt biegu + jeden UPDATE przejecia, potem od razu
#: dyspozytor); przy zablokowanej petli zdarzen drugi bieg nie wejdzie NIGDY,
#: dopoki pierwszy nie wyjdzie — limit sluzy WYLACZNIE temu, zeby czerwony test
#: skonczyl sie w skonczonym czasie z nazwana przyczyna, a nie zawisl.
CZAS_NA_WEJSCIE_BIEGOW_S = 30.0

#: Czas na obsluge lekkiego zadania, gdy biegi stoja w oknie solvera. Przy
#: dzialajacym offloadzie petla zdarzen jest WOLNA, a zaparkowane biegi nie
#: licza (czekaja na zdarzenie), wiec `GET /api/health` wraca w milisekundach
#: na kazdej maszynie — nie ma rywalizacji o GIL, ktora psula pomiary czasowe.
#: Limit placi wylacznie sciezka czerwona (zablokowana petla).
CZAS_NA_SONDE_S = 10.0

#: Zawor bezpieczenstwa spotkania: bieg zaparkowany w oknie solvera rusza sam po
#: tym czasie, gdyby test nie zdazyl go zwolnic (wyjatek poza `finally`), zeby
#: pula watkow klienta nigdy nie zawisla na zawsze. Dluzszy niz suma pozostalych
#: limitow, wiec NIE decyduje o werdykcie ani w zielonym, ani w czerwonym biegu.
ZAWOR_SPOTKANIA_S = 120.0


def _reset_backend_state() -> None:
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    reset_canonical_runs()
    reset_enm_store()


def _model_sn(nazwa: str) -> dict:
    """Model SN o rozmiarze MIERZALNYM — zrodlo GPZ, promieniowy lancuch kabli, odbiory.

    Rozmiar dobrany tak, zeby JEDEN bieg trwal kilkadziesiat ms (nie kilka), ale
    nie wydluzal suity: test determinizmu i przepustowosci mierzy ILORAZ dwoch
    partii w tym samym procesie, wiec nie potrzebuje duzej sieci, a test
    responsywnosci (spotkanie w oknie solvera) od rozmiaru nie zalezy wcale.

    HISTORIA ROZMIARU. Pierwotny model (2 szyny, 1 kabel, 1 odbior) dawal bieg
    ~15 ms szeregowo; korekta W1 (2026-09-09) powiekszyla lancuch do
    `_LICZBA_SZYN_LANCUCHA` szyn, zeby przywrocic rezim pomiaru licznika sond w
    locie (bieg kilkadziesiat ms). Ta miara odeszla (karta CI-WSPOLBIEZNOSC,
    docstring modulu), rozmiar zostal: kazda zmiana przesuwa czasy partii testu
    przepustowosci bez zadnego zysku. Nazwy `bus-main`/`bus-load`/`branch-load`/
    `load-1`/`src-grid` zachowane (pierwsze ogniwa lancucha), reszta ogniw
    numerowana.
    """
    szyny: list[dict] = []
    galezie: list[dict] = []
    odbiory: list[dict] = []
    nazwy_szyn = ["bus-main", "bus-load"] + [
        f"bus-{i:02d}" for i in range(3, _LICZBA_SZYN_LANCUCHA + 1)
    ]
    for numer, ref in enumerate(nazwy_szyn, start=1):
        szyny.append(
            {
                "id": f"00000000-0000-0000-0001-{numer:012d}",
                "ref_id": ref,
                "name": "Szyna glowna" if ref == "bus-main" else f"Szyna {ref}",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
                "phase_system": "3ph",
            }
        )
    for numer, (od, do) in enumerate(zip(nazwy_szyn, nazwy_szyn[1:], strict=False), start=1):
        galezie.append(
            {
                "id": f"00000000-0000-0000-0002-{numer:012d}",
                "ref_id": "branch-load" if numer == 1 else f"branch-{numer:02d}",
                "name": f"Kabel {od} - {do}",
                "tags": [],
                "meta": {},
                "type": "cable",
                "from_bus_ref": od,
                "to_bus_ref": do,
                "status": "closed",
                "catalog_ref": "KABEL_SN_TEST",
                "parameter_source": "CATALOG",
                "length_km": 0.5,
                "r_ohm_per_km": 0.253,
                "x_ohm_per_km": 0.073,
                "b_siemens_per_km": 2.6e-07,
                "rating": {"in_a": 270.0},
            }
        )
    for numer, ref in enumerate(nazwy_szyn[1:], start=1):
        odbiory.append(
            {
                "id": f"00000000-0000-0000-0003-{numer:012d}",
                "ref_id": "load-1" if numer == 1 else f"load-{numer:02d}",
                "name": f"Odbior SN {ref}",
                "tags": [],
                "meta": {},
                "bus_ref": ref,
                "p_mw": 0.12,
                "q_mvar": 0.035,
                "catalog_ref": "LOAD_TEST",
                "parameter_source": "OVERRIDE",
            }
        )
    return {
        "header": {
            "name": nazwa,
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": szyny,
        "branches": galezie,
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000000304",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="src-grid",
                    name="Zasilanie GPZ",
                    bus_ref="bus-main",
                    voltage_kv=15.0,
                    sk3_mva=250.0,
                    rx_ratio=0.10,
                ),
            }
        ],
        "loads": odbiory,
        "transformers": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [],
    }


def _nowy_przypadek(client: TestClient) -> str:
    """Utwórz REALNY projekt + przypadek przez API; zwróć `case_id`.

    CV-1-W: przypadek bez wiersza w bazie dostaje teraz 404 z magazynu ENM
    (inwariant I-2) — testy tego pliku potrzebują prawdziwej pary
    projekt+przypadek zamiast dowolnego UUID-a.
    """
    project_resp = client.post("/api/projects", json={"name": "Wspolbieznosc biegow — test"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    case_resp = client.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek testu"}
    )
    assert case_resp.status_code == 201, case_resp.text
    return str(case_resp.json()["id"])


def _zasiej(case_id: str, nazwa: str) -> None:
    """Zasiej model pod kluczem PROJEKTU przypadku (CV-1: tam mieszka model).

    CV-2-W: wczesniejsza wersja zasiewala surowym kluczem `case_id` i liczyla na
    to, ze PIERWSZE przetlumaczone dotkniecie przypadku nastapi POZNIEJ (migracja
    `migruj_projekt_z_legacy` adoptowala wtedy plik przypadku). Zalozenie padlo:
    kazda odpowiedz API z przypadkiem wylicza status wynikow, wiec tlumaczy
    `case_id` juz przy `POST /api/study-cases`.
    """
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    from tests.test_execution_api import _klucz_modelu

    set_enm(_klucz_modelu(case_id), EnergyNetworkModel.model_validate(_model_sn(nazwa)))


@pytest.fixture
def client(monkeypatch, tmp_path) -> TestClient:
    """Klient na bazie PLIKOWEJ — tej samej konfiguracji co tor produkcyjny.

    DLACZEGO NIE DOMYSLNA FIKSTURA IZOLACJI. `tests/conftest.py` daje kazdemu
    testowi baze SQLite W PAMIECI ze wspolnym cache (`mode=memory&cache=shared`)
    — swiadomy skrot na czas suity (zmierzone tam: 29 s wobec 80 s dla pliku).
    Wspolny cache przelacza jednak SQLite na blokady NA POZIOMIE TABELI, a
    `busy_timeout` ich NIE OBEJMUJE: rownolegli pisarze dostaja natychmiastowe
    `sqlite3.OperationalError: database table is locked` zamiast poczekac
    (zmierzone przy K=10). Produkcja tej konfiguracji nigdy nie uzywa — tam jest
    plik z WAL i 30-sekundowym budzetem oczekiwania.

    Test MIERZACY WSPOLBIEZNOSC nie moze biec na silniku, ktorego produkcja nie
    ma: mierzylby ograniczenie skrotu testowego, a nie zachowanie systemu.
    Fikstura z conftestu jawnie dopuszcza nadpisanie (`monkeypatch` testu wygrywa).
    """
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{tmp_path / 'biegi.db'}")
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))

    from infrastructure.persistence.repositories import canonical_run_repository as repo

    def wyczysc_cache_silnika() -> None:
        if repo._cached_engine is not None:
            repo._cached_engine.dispose()
        repo._cached_engine = None
        repo._cached_session_factory = None
        repo._cached_database_url = None

    wyczysc_cache_silnika()
    _reset_backend_state()
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        wyczysc_cache_silnika()


#: Klucze wyprowadzone z TOZSAMOSCI biegu, nie z jego fizyki. `proof_ref`
#: powstaje z `run_id` (losowy UUID4 na bieg — `_short_circuit_proof_ref`), wiec
#: rozni sie miedzy DOWOLNYMI dwoma biegami, takze dwoma szeregowymi. Zostawienie
#: go w odcisku zamienialoby test determinizmu w test generatora UUID.
_KLUCZE_TOZSAMOSCI_BIEGU = frozenset({"proof_ref"})


def _bez_tozsamosci_biegu(wartosc: object) -> object:
    """Usun rekurencyjnie klucze niosace tozsamosc biegu, zostaw cala fizyke."""
    if isinstance(wartosc, dict):
        return {
            klucz: _bez_tozsamosci_biegu(podwartosc)
            for klucz, podwartosc in wartosc.items()
            if klucz not in _KLUCZE_TOZSAMOSCI_BIEGU
        }
    if isinstance(wartosc, list):
        return [_bez_tozsamosci_biegu(element) for element in wartosc]
    return wartosc


def _odcisk(payload: dict) -> str:
    """Odcisk WYNIKU FIZYKI — bez pol z natury zmiennych miedzy biegami.

    `proof_ref` ZAGNIEZDZONY w wierszach jest liczony z `run.id` (losowy UUID4
    nadawany przez `create_run` kazdemu biegowi, niezaleznie od tego, czy bieg
    jest szeregowy czy rownolegly), wiec niesie tozsamosc biegu, a nie jego
    fizyke — zostawienie go zamienialoby test determinizmu w test generatora
    UUID. Porownujemy to, co ma byc identyczne: prady, napiecia, moce, straty,
    slady White Box.
    """
    return json.dumps(_bez_tozsamosci_biegu(payload), sort_keys=True, ensure_ascii=False)


#: Rodzaje biegow objete offloadem — kazdy MUSI udowodnic wspolbieznosc OSOBNO.
#:
#: Regula KLASA, NIE INSTANCJA zastosowana do testu: pomiar zbiorczy („cokolwiek
#: bieglo rownolegle") przechodzi takze wtedy, gdy offload cofnieto na JEDNEJ
#: koncowce, bo druga wciaz go ma. Iniekcja karty (cofniecie offloadu na
#: `run_power_flow`) wlasnie tak przeszla przez pomiar zbiorczy — dopiero rozbicie
#: na rodzaje ja zlapalo.
RODZAJE_BIEGOW = (
    ("rozplyw", "power-flow"),
    ("zwarcie", "short-circuit"),
)


#: `sciezka` ("power-flow"/"short-circuit", nazwy zachowane po skasowanej
#: trasie dla czytelnosci parametryzacji) -> `analysis_type` toru kanonicznego.
_TYP_ANALIZY = {"power-flow": "LOAD_FLOW", "short-circuit": "SC_3F"}


def _stworz_bieg(client: TestClient, case_id: str, sciezka: str) -> str:
    """Utworz bieg (create) — POZA oknem pomiaru.

    `create_run` waliduje migawke i liczy hash; fizyka solvera zyje WYLACZNIE
    w `execute_run` (`_wykonaj_analize_biegu`) — to `execute` jest krokiem pod
    pomiarem tego pliku, nie `create`.
    """
    odp = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": _TYP_ANALIZY[sciezka]},
    )
    assert odp.status_code == 201, odp.text
    return odp.json()["id"]


def _wykonaj_bieg(client: TestClient, run_id: str):
    """Wykonaj bieg — TO JEST okno pomiaru (jedyne miejsce, gdzie solver liczy).

    Karta DYNAMIKA-W-TLE: `POST …/execute` zleca bieg wykonawcy w tle (202) — okno
    pomiaru obejmuje odpytywanie do stanu koncowego (`tests.utils.biegi.wykonaj_bieg`).
    """
    return wykonaj_bieg(client, run_id)


def _wyniki_biegu(client: TestClient, run_id: str, sciezka: str) -> dict:
    """Pobierz wynik fizyki UKONCZONEGO biegu — POZA oknem pomiaru (czyste
    odczyty juz policzonych danych, bez solvera)."""
    if sciezka == "short-circuit":
        odp = client.get(f"/api/analysis-runs/{run_id}/results/short-circuit")
        assert odp.status_code == 200, odp.text
        return odp.json()["rows"]
    odp = client.get(f"/api/power-flow-runs/{run_id}/results")
    assert odp.status_code == 200, odp.text
    return odp.json()


def test_biegi_rownolegle_sa_deterministyczne(client: TestClient) -> None:
    """K=10 mieszanych zadan rownolegle: wszystkie 200 i ten sam wynik fizyki.

    ZADANIA MIESZANE, bo o to chodzi w praktyce: rozplyw i zwarcie to praca CPU
    solvera, a odczyty modelu to IO pliku — jedno i drugie blokowalo petle
    zdarzen, wiec jedno i drugie musi byc w pomiarze.

    CZEGO TEN TEST NIE MIERZY: samej wspolbieznosci. Okno czasowe widziane przez
    KLIENTA obejmuje czas oczekiwania w kolejce, wiec zadania zakolejkowane i
    wykonane szeregowo maja okna zachodzace na siebie tak samo jak wykonane
    naprawde rownolegle — taki pomiar nie potrafi rozroznic tych dwoch sytuacji i
    zostal stad usuniety zamiast udawac bramke. Wspolbieznosc mierzy sonda w
    `test_lekkie_zadanie_przechodzi_w_trakcie_biegow`.
    """
    przypadki = [_nowy_przypadek(client) for _ in range(K_ROWNOLEGLYCH)]
    for i, case_id in enumerate(przypadki):
        _zasiej(case_id, f"Siec SN {i}")

    sciezki = [RODZAJE_BIEGOW[i % 2][1] for i in range(K_ROWNOLEGLYCH)]

    # Bieg wykonuje sie DOKLADNIE RAZ (execute jest idempotentny — drugie
    # wywolanie na tym samym run_id nie liczy solvera ponownie), a test
    # potrzebuje DWOCH niezaleznych wykonan tej samej sieci (raz szeregowo, raz
    # rownolegle) — stad DWA `create_run` na przypadek, oba POZA oknem pomiaru
    # (`_stworz_bieg` nie dotyka solvera, patrz docstring modulu).
    biegi_szeregowe = [
        _stworz_bieg(client, case_id, sciezka)
        for case_id, sciezka in zip(przypadki, sciezki, strict=False)
    ]
    biegi_rownolegle = [
        _stworz_bieg(client, case_id, sciezka)
        for case_id, sciezka in zip(przypadki, sciezki, strict=False)
    ]

    # --- Odniesienie: ten sam zestaw zadan wykonany SZEREGOWO ---------------
    wzorce: dict[str, str] = {}
    start_szeregowo = time.perf_counter()
    for case_id, sciezka, run_id in zip(przypadki, sciezki, biegi_szeregowe, strict=False):
        odp = _wykonaj_bieg(client, run_id)
        assert odp.status_code == 200, odp.text
        wzorce[case_id] = _odcisk(_wyniki_biegu(client, run_id, sciezka))
        assert client.get(f"/api/cases/{case_id}/enm/readiness").status_code == 200
    czas_szeregowo = time.perf_counter() - start_szeregowo

    # --- Pomiar wlasciwy: te same zadania ROWNOLEGLE ------------------------
    wyniki: dict[str, str] = {}
    zamek = threading.Lock()

    def zadanie(trojka: tuple[str, str, str]) -> int:
        case_id, sciezka, run_id = trojka
        odp = _wykonaj_bieg(client, run_id)
        odcisk = _odcisk(_wyniki_biegu(client, run_id, sciezka)) if odp.status_code == 200 else ""
        odczyt = client.get(f"/api/cases/{case_id}/enm/readiness")
        with zamek:
            wyniki[case_id] = odcisk
        assert odczyt.status_code == 200, odczyt.text
        return odp.status_code

    start_rownolegle = time.perf_counter()
    with ThreadPoolExecutor(max_workers=K_ROWNOLEGLYCH) as pula:
        kody = list(
            pula.map(zadanie, list(zip(przypadki, sciezki, biegi_rownolegle, strict=False)))
        )
    czas_rownolegle = time.perf_counter() - start_rownolegle

    # (a) wszystkie 200
    assert kody == [200] * K_ROWNOLEGLYCH, kody

    # (b) determinizm: rownolegly bieg daje CO DO ZNAKU ten sam wynik fizyki
    for case_id in przypadki:
        assert wyniki[case_id] == wzorce[case_id], (
            f"Wynik przypadku {case_id} rozni sie miedzy biegiem szeregowym a "
            "rownoleglym — solver zalezy od watku."
        )

    # (c) PRZEPUSTOWOSC — prog swiadomie luzny, i to jest WYNIK POMIARU,
    #     nie ustepstwo.
    #
    #     Offload do puli watkow NIE PRZYSPIESZA partii zadan obciazajacych
    #     procesor w czystym Pythonie i przyspieszyc jej nie moze: GIL dopuszcza
    #     JEDEN watek wykonujacy bajtkod naraz, wiec K watkow dokłada wylacznie
    #     koszt przelaczania. Zmierzone (4 rdzenie): partia rownolegla jest
    #     ~1,8x WOLNIEJSZA od szeregowej — tak samo dla biegow solvera, dla
    #     odczytow modelu i nawet dla trywialnego `/api/health` (1,23x), co
    #     wyklucza rywalizacje o baze jako przyczyne.
    #
    #     Offload kupuje RESPONSYWNOSC (lekkie zadanie nie czeka za ciezkim), a
    #     nie przepustowosc. Zrownoleglenie samego liczenia wymagaloby procesow —
    #     osobna decyzja, poza ta osia.
    #
    #     Prog 3,0x lapie REGRESJE STRUKTURALNE, ktore z GIL nie maja nic
    #     wspolnego: konwoj na blokadzie, ponawianie transakcji po zakleszczeniu,
    #     przypadkowa globalna sekcja krytyczna wokol biegu.
    #
    #     PODLOGA BEZWZGLEDNA (lekcja z czerwonego biegu CI na commicie czysto
    #     dokumentacyjnym): przy PODsekundowej partii szeregowej iloraz mierzy
    #     szum planisty, nie strukture — na 2-rdzeniowym runnerze zmierzono
    #     0,674 s vs 0,146 s (4,6x) przy zielonych asercjach determinizmu.
    #     Regresje strukturalne, ktore ten prog ma lapac (busy_timeout,
    #     ponawianie po zakleszczeniu), kosztuja SEKUNDY — podloga +2 s
    #     zachowuje pelna moc detekcyjna, a odbiera ilorazowi wladze nad
    #     szumem malych liczb.
    #
    #     DLACZEGO KARTA CHWIEJNY-WSPOLBIEZNOSC ZOSTAWILA TEN PROG (2026-08-08).
    #     Przegladajac cala rodzine, zmierzono takze ten prog: zapas do niego
    #     wynosi 4,4-6,9x na maszynie bezczynnej i 2,5-8,7x pod obciazeniem
    #     6 procesami liczacymi na 4 rdzeniach (po 10 pomiarow). W przeciwienstwie
    #     do usunietego progu p95 ta miara jest ILORAZEM DWOCH PARTII zmierzonych
    #     w TYM SAMYM biegu i tym samym procesie, wiec predkosc maszyny skraca
    #     sie w niej z definicji, a skladnik bezwzgledny (+2 s) moze prog tylko
    #     ROZSZERZYC. Zadnego falszywego zapalenia nie zaobserwowano.
    prog_rownoleglosci = max(czas_szeregowo * 3.0, czas_szeregowo + 2.0)
    assert czas_rownolegle <= prog_rownoleglosci, (
        f"Partia rownolegla ({czas_rownolegle:.3f} s) przekracza prog "
        f"{prog_rownoleglosci:.3f} s (szeregowo {czas_szeregowo:.3f} s) — to juz "
        "nie koszt GIL ani szum planisty, tylko konwoj na blokadzie albo "
        "ponawianie transakcji."
    )


@pytest.mark.parametrize("liczba_biegow", (1, K_ROWNOLEGLYCH), ids=("K=1", f"K={K_ROWNOLEGLYCH}"))
@pytest.mark.parametrize(("rodzaj", "sciezka"), RODZAJE_BIEGOW)
def test_lekkie_zadanie_obsluzone_gdy_bieg_stoi_w_oknie_solvera_a_reszta_czeka_w_kolejce(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    rodzaj: str,
    sciezka: str,
    liczba_biegow: int,
) -> None:
    """Lekkie zadanie jest obslugiwane, gdy bieg STOI w oknie solvera, a K-1 biegow
    czeka w kolejce wykonawcy z JAWNYM stanem QUEUED (karta DYNAMIKA-W-TLE).

    MIARA „DONE" OSI WSPOLBIEZNOSCI (§3 planu 10x) BEZ ZEGARA. Projektant w jednej
    sesji odpala kilka analiz i czyta model — UI ma zyc. Od karty DYNAMIKA-W-TLE bieg
    NIE liczy sie w zadnym zadaniu HTTP: `POST …/execute` przyjmuje bieg do kolejki
    wykonawcy w tle (202, QUEUED) i wraca natychmiast, a wykonawca liczy JEDEN ciezki
    bieg naraz (O-57 pkt 2). Test odtwarza te sytuacje deterministycznie:

      1. K biegow (create POZA oknem pomiaru — bez solvera) jest zlecanych ROWNOLEGLE
         przez REALNA koncowke `POST /api/execution/runs/{id}/execute` — kazde zlecenie
         wraca z 202 od razu (zero czekania na solver).
      2. W JEDYNYM dyspozytorze fizyki (`_wykonaj_analize_biegu`) PIERWSZY bieg melduje
         wejscie i PARKUJE na zdarzeniu `zwolnij` — jest „w locie" w watku wykonawcy,
         w tym samym miejscu, w ktorym normalnie liczy solver, tylko nie zuzywa CPU.
      3. Gdy bieg stoi w oknie, test wysyla `GET /api/health` z osobnego watku i czeka
         najwyzej `CZAS_NA_SONDE_S`; rownoczesnie czyta stan KAZDEGO biegu: dokladnie
         jeden RUNNING, pozostale QUEUED (kolejka, nie wyscig).
      4. Zwalnia biegi. Biegi licza NAPRAWDE, SZEREGOWO (dyspozytor nigdy nie jest w
         srodku dwa razy naraz), kazdy konczy sie DONE z wynikiem solvera.

    WERDYKT: sonda musi wrocic PRZED zwolnieniem biegow, stany w kolejce musza byc
    jawne, a wykonanie szeregowe. Dawna wersja tego testu (2026-09-16) wymagala, zeby
    WSZYSTKIE K biegow stanelo w oknie solvera NARAZ (offload do puli watkow FastAPI);
    od DYNAMIKA-W-TLE rownolegle liczenie K biegow na 4 rdzeniach z nadsubskrypcja
    watkow BLAS jest defektem (pomiar WATKI-BLAS-E2E: 866 s zamiast 6 s), wiec
    intencja testu — „UI zyje, gdy bieg liczy" — zostaje, a ksztalt kolejki jest nowym
    kontraktem, ktory ten test przypina.
    """
    from enm import canonical_analysis

    przypadki = [_nowy_przypadek(client) for _ in range(liczba_biegow)]
    biegi: list[str] = []
    for i, case_id in enumerate(przypadki):
        _zasiej(case_id, f"Siec SN {rodzaj} {i}")
        # Rozgrzewka: pierwszy odczyt modelu wykonuje migracje i uzupelnia dane
        # katalogowe, wiec jest jednorazowo drozszy — nie ma go w pomiarze.
        assert client.get(f"/api/cases/{case_id}/enm/readiness").status_code == 200
        # `create_run` (bez solvera) POZA oknem pomiaru — patrz docstring modulu.
        biegi.append(_stworz_bieg(client, case_id, sciezka))

    oryginalny_dyspozytor = canonical_analysis._wykonaj_analize_biegu
    zamek = threading.Lock()
    w_oknie: list[str] = []
    w_srodku = 0
    max_w_srodku = 0
    pierwszy_w_oknie = threading.Event()
    zwolnij = threading.Event()

    def dyspozytor_ze_spotkaniem(
        run: Any, graf: Any = None, uow_factory: Any = None, kontekst: Any = None
    ) -> None:
        """Ten sam dyspozytor: pierwszy bieg parkuje na progu okna solvera do
        zwolnienia; kazdy bieg liczy liczbe rownoczesnych wejsc (musi byc 1)."""
        nonlocal w_srodku, max_w_srodku
        with zamek:
            w_srodku += 1
            max_w_srodku = max(max_w_srodku, w_srodku)
            w_oknie.append(str(run.id))
            pierwszy = len(w_oknie) == 1
        if pierwszy:
            pierwszy_w_oknie.set()
            zwolnij.wait(timeout=ZAWOR_SPOTKANIA_S)
        try:
            oryginalny_dyspozytor(run, graf, uow_factory, kontekst)
        finally:
            with zamek:
                w_srodku -= 1

    monkeypatch.setattr(canonical_analysis, "_wykonaj_analize_biegu", dyspozytor_ze_spotkaniem)

    def zlec_bieg(run_id: str) -> int:
        return client.post(f"/api/execution/runs/{run_id}/execute").status_code

    obsluzona_przed_zwolnieniem = False
    with ThreadPoolExecutor(max_workers=liczba_biegow + 1) as pula:
        zlecenia = [pula.submit(zlec_bieg, run_id) for run_id in biegi]
        try:
            kody_zlecen = [z.result(timeout=CZAS_NA_WEJSCIE_BIEGOW_S) for z in zlecenia]
            assert kody_zlecen == [202] * liczba_biegow, kody_zlecen
            assert pierwszy_w_oknie.wait(timeout=CZAS_NA_WEJSCIE_BIEGOW_S), (
                f"Zaden bieg '{rodzaj}' nie wszedl w okno solvera w "
                f"{CZAS_NA_WEJSCIE_BIEGOW_S:.0f} s — wykonawca w tle nie wystartowal."
            )
            stany = {
                run_id: client.get(f"/api/execution/runs/{run_id}").json()["status"]
                for run_id in biegi
            }
            sonda = pula.submit(client.get, "/api/health")
            try:
                odp_sondy = sonda.result(timeout=CZAS_NA_SONDE_S)
                obsluzona_przed_zwolnieniem = True
            except TimeoutError:
                obsluzona_przed_zwolnieniem = False
        finally:
            zwolnij.set()
        if not obsluzona_przed_zwolnieniem:
            odp_sondy = sonda.result(timeout=ZAWOR_SPOTKANIA_S)

    assert odp_sondy.status_code == 200, odp_sondy.text
    assert obsluzona_przed_zwolnieniem, (
        f"Sonda `GET /api/health` nie wrocila przez {CZAS_NA_SONDE_S:.0f} s, gdy bieg "
        f"'{rodzaj}' stal w oknie solvera bez liczenia, a wrocila dopiero po jego "
        "zwolnieniu — bieg blokuje petle zdarzen: kazde inne zadanie czeka do konca biegu."
    )
    # Kolejka z JAWNYM stanem: dokladnie jeden bieg RUNNING, reszta QUEUED.
    assert sorted(stany.values()) == sorted(["RUNNING"] + ["QUEUED"] * (liczba_biegow - 1)), stany
    # Po zwolnieniu kazdy bieg konczy sie wynikiem — szeregowo (jeden ciezki bieg naraz).
    for run_id in biegi:
        koncowy = wykonaj_bieg(client, run_id)
        assert koncowy.status_code == 200, koncowy.text
        assert koncowy.json()["status"] == "DONE", koncowy.json()
    assert len(w_oknie) == liczba_biegow, w_oknie
    assert max_w_srodku == 1, (
        f"Dyspozytor fizyki byl w srodku {max_w_srodku} razy naraz — wykonawca w tle "
        "ma liczyc jeden ciezki bieg naraz (O-57 pkt 2)."
    )
