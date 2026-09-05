"""Wspolbieznosc koncowek API — miara „done" osi wspolbieznosci programu 10x.

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

DRUGA, MOCNIEJSZA MIARA: NAKLADANIE SIE OKIEN. Kazde zadanie melduje wlasny
znacznik wejscia i wyjscia; przy prawdziwej rownoleglosci okna czasowe zadan
zachodza na siebie. Serializacja na petli zdarzen daje okna ROZLACZNE — i to
wykrywa nawet wtedy, gdy stosunek czasow zmiesci sie w marginesie (np. gdy
maszyna ma jeden rdzen, a GIL i tak przeplata watki).

CZEGO TU NIE MA I DLACZEGO — ZADNEGO KWANTYLA OPOZNIENIA (pomiar 2026-08-08,
320 pomiarow: kod poprawny i kod z COFNIETYM offloadem, maszyna bezczynna i
przeciazona 6 procesami na 4 rdzeniach). Kwantyl opoznienia lekkiego zadania NIE
ODROZNIA blokady petli od rywalizacji o procesor, i to w obie strony:
  * przy DZIALAJACYM offloadzie ogon jest nieograniczony — sonda rywalizuje o
    GIL z K watkami solvera, wiec pojedyncze zapytanie potrafi staknac na
    setki ms (zmierzone maksimum 588 ms), mimo ze system obsluguje ja caly czas;
  * przy ZABLOKOWANEJ petli proba KURCZY SIE do 1-4 zapytan, wiec kwantyl
    liczony jest z trzech liczb i bywa NISKI (zmierzona mediana 1,35x
    odniesienia) — kwantyl z takiej proby nie znaczy nic.
Zmierzone nakladanie rozkladow: kazdy wariant ilorazu opoznienia (p50/p95 wobec
odniesienia bez obciazenia w min/p10/p25/p50) mylil sie na 19-25 pomiarach na
160. Odniesienie BEZ obciazenia zostalo zmierzone i ODRZUCONE POMIAREM: jest
samo w sobie wielkoscia rzedu 2 ms, wiec jego wlasny szum (1,8-8,7 ms) jest
wiekszy niz sygnal, ktory mialoby normowac.

CO ROZDZIELA TE DWA SWIATY: LICZBA OBSLUZONYCH ZADAN, NIE ICH CZAS. Blokada
petli ogranicza liczbe okazji do obslugi (jedno oproznienie kolejki = jedna
okazja) NIEZALEZNIE od predkosci maszyny i dlugosci partii; offload daje ich
tyle, ile zmiesci sie w oknie. To wielkosc BEZWYMIAROWA — czas partii wyrazony
w jednostkach wlasnego okresu obslugi sondy, mierzonych w tych samych warunkach
— wiec predkosc maszyny skraca sie w niej tak samo jak w ilorazie czasow.
"""

from __future__ import annotations

import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from api.main import app
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_source_record

#: Liczba rownoleglych zadan w miarze „done" (§3 planu 10x).
K_ROWNOLEGLYCH = 10

#: Ile lekkich zadan musi zostac obsluzonych OD POCZATKU DO KONCA w czasie, gdy
#: co najmniej jeden ciezki bieg jest w locie.
#:
#: GRANICA WYPROWADZONA Z POMIARU, NIE Z GLOWY (2026-08-08, 120 pomiarow: 60 na
#: kodzie poprawnym i 60 na kodzie z cofnietym offloadem; kazda polowa zebrana
#: na maszynie bezczynnej ORAZ przeciazonej 6 procesami liczacymi na 4 rdzeniach,
#: dla obu rodzajow biegu):
#:   * offload dziala: najgorszy pomiar 8, piaty percentyl 9, mediana 16;
#:   * offload cofniety: 57 z 60 pomiarow dalo 0, pozostale 1, 1 i 3 (najgorszy
#:     przypadek 3).
#: Rozkłady sa ROZLACZNE (0 nakladan na 120). Granica 5 to srednia geometryczna
#: skrajnych obserwacji (3 i 8, pierwiastek z 24 = 4,9): zapas 1,6x do
#: najgorszego pomiaru poprawnego kodu i 1,67x do najlepszego pomiaru kodu z
#: blokada. Zapas jest symetryczny, bo rozrzut po obu stronach jest podobny.
PROG_OBSLUZONYCH_W_LOCIE = 5

#: Ile prob wykonuje pomiar porzadku zakonczen (patrz docstring testu).
PROB_PORZADKU = 15


def _reset_backend_state() -> None:
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    reset_canonical_runs()
    reset_enm_store()


def _model_sn(nazwa: str) -> dict:
    """Maly, kompletny model SN — zrodlo GPZ, kabel, odbior.

    Rozmiar dobrany tak, zeby bieg trwal MIERZALNIE (kilkadziesiat ms), ale nie
    wydluzal suity: miara jest wzgledna, wiec nie potrzebuje duzej sieci.
    """
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
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000000301",
                "ref_id": "bus-main",
                "name": "Szyna glowna",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000000302",
                "ref_id": "bus-load",
                "name": "Szyna odbioru",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
                "phase_system": "3ph",
            },
        ],
        "branches": [
            {
                "id": "00000000-0000-0000-0000-000000000303",
                "ref_id": "branch-load",
                "name": "Kabel odbioru",
                "tags": [],
                "meta": {},
                "type": "cable",
                "from_bus_ref": "bus-main",
                "to_bus_ref": "bus-load",
                "status": "closed",
                "catalog_ref": "KABEL_SN_TEST",
                "parameter_source": "CATALOG",
                "length_km": 0.5,
                "r_ohm_per_km": 0.253,
                "x_ohm_per_km": 0.073,
                "b_siemens_per_km": 2.6e-07,
                "rating": {"in_a": 270.0},
            }
        ],
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
        "loads": [
            {
                "id": "00000000-0000-0000-0000-000000000305",
                "ref_id": "load-1",
                "name": "Odbior SN",
                "tags": [],
                "meta": {},
                "bus_ref": "bus-load",
                "p_mw": 1.2,
                "q_mvar": 0.35,
                "catalog_ref": "LOAD_TEST",
                "parameter_source": "OVERRIDE",
            }
        ],
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


def _odcisk(payload: dict, klucz_wyniku: str) -> str:
    """Odcisk WYNIKU FIZYKI — bez pol z natury zmiennych miedzy biegami.

    `run_id` (losowy UUID) i `enm_revision` (rosnie przy kazdym zapisie modelu)
    NIE sa wynikiem solvera; ich udzial w odcisku zamienilby test determinizmu w
    test generatora UUID. To samo dotyczy `proof_ref` ZAGNIEZDZONEGO w wyniku —
    jest liczony z `run_id`, wiec niesie tozsamosc biegu, a nie jego fizyke.
    Porownujemy to, co ma byc identyczne: prady, napiecia, moce, straty, slady
    White Box i hash modelu wejsciowego.
    """
    return json.dumps(
        {
            "enm_hash": payload["enm_hash"],
            "input_hash": payload["input_hash"],
            "wynik": _bez_tozsamosci_biegu(payload[klucz_wyniku]),
        },
        sort_keys=True,
        ensure_ascii=False,
    )


def _odcisk_rozplywu(payload: dict) -> str:
    return _odcisk(payload, "result")


def _odcisk_zwarcia(payload: dict) -> str:
    return _odcisk(payload, "results")


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


def _uruchom_bieg(client: TestClient, case_id: str, sciezka: str):
    """Jedno wywolanie biegu — `short-circuit` czyta cialo zadania, `power-flow` nie."""
    if sciezka == "short-circuit":
        return client.post(f"/api/cases/{case_id}/runs/{sciezka}", json={})
    return client.post(f"/api/cases/{case_id}/runs/{sciezka}")


def _odcisk_dla(sciezka: str, payload: dict) -> str:
    return _odcisk_zwarcia(payload) if sciezka == "short-circuit" else _odcisk_rozplywu(payload)


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

    # --- Odniesienie: ten sam zestaw zadan wykonany SZEREGOWO ---------------
    wzorce: dict[str, str] = {}
    start_szeregowo = time.perf_counter()
    for case_id, sciezka in zip(przypadki, sciezki, strict=False):
        odp = _uruchom_bieg(client, case_id, sciezka)
        assert odp.status_code == 200, odp.text
        wzorce[case_id] = _odcisk_dla(sciezka, odp.json())
        assert client.get(f"/api/cases/{case_id}/enm/readiness").status_code == 200
    czas_szeregowo = time.perf_counter() - start_szeregowo

    # --- Pomiar wlasciwy: te same zadania ROWNOLEGLE ------------------------
    wyniki: dict[str, str] = {}
    zamek = threading.Lock()

    def zadanie(para: tuple[str, str]) -> int:
        case_id, sciezka = para
        odp = _uruchom_bieg(client, case_id, sciezka)
        odcisk = _odcisk_dla(sciezka, odp.json()) if odp.status_code == 200 else ""
        odczyt = client.get(f"/api/cases/{case_id}/enm/readiness")
        with zamek:
            wyniki[case_id] = odcisk
        assert odczyt.status_code == 200, odczyt.text
        return odp.status_code

    start_rownolegle = time.perf_counter()
    with ThreadPoolExecutor(max_workers=K_ROWNOLEGLYCH) as pula:
        kody = list(pula.map(zadanie, list(zip(przypadki, sciezki, strict=False))))
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


@pytest.mark.parametrize(("rodzaj", "sciezka"), RODZAJE_BIEGOW)
def test_lekkie_zadanie_przechodzi_w_trakcie_biegow(
    client: TestClient, rodzaj: str, sciezka: str
) -> None:
    """MIARA „DONE" wprost z §3 planu 10x: lekkie zadanie zyje przy K=10 biegach.

    Podczas gdy K=10 ciezkich biegow JEDNEGO rodzaju jest w locie, sonda wysyla
    trywialne `GET /api/health`. Pytanie brzmi: czy lekkie zadanie DA SIE
    obsluzyc, kiedy system liczy — bo to jest to, co projektant widzi jako „UI
    zyje" albo „UI zamarlo".

    DLACZEGO PER RODZAJ: koncowka, ktorej offload cofnieto, blokuje petle zdarzen
    niezaleznie od tego, ze druga koncowka jest poprawna. Pomiar zbiorczy tego nie
    widzi (druga koncowka oddaje sterowanie i sonda przechodzi). Parametryzacja
    sprawia, ze KAZDA koncowka odpowiada za siebie.

    ASERCJA LICZY ZDARZENIA, NIE MILISEKUNDY. Liczymy sondy, ktorych CALE okno —
    wyslanie i odpowiedz — miesci sie w oknie jakiegos biegu, czyli obsluzone
    DOKLADNIE WTEDY, gdy solver liczyl. Warunek na POCZATEK jest tu nosny:
    zapytanie, ktore czekalo juz zanim biegi ruszyly, i doczekalo sie odpowiedzi
    dopiero po ich zakonczeniu, nie jest dowodem obslugi w trakcie liczenia —
    jest dowodem przeciwnym. Wlasnie tak wyglada zablokowana petla: sonda staje
    w kolejce za wszystkimi biegami i wraca dopiero po ostatnim z nich.

    CZEGO TA ASERCJA ZASTAPILA (karta CHWIEJNY-WSPOLBIEZNOSC, 2026-08-08).
    Poprzednia postac brzmiala `p95 sondy < polowa czasu partii` i byla CHWIEJNA:
    odniesieniem byl czas partii, a ten skrocil sie okolo czterokrotnie wobec
    stanu, dla ktorego prog kalibrowano (bieg zwarciowy na tej sieci: 91,3 ms w
    momencie wprowadzenia offloadu, 25 ms po pozniejszych przyspieszeniach —
    m.in. memoizacji katalogu). Ogon opoznien sondy nie skrocil sie razem z nim,
    bo wyznaczaja go kwanty GIL i wywlaszczenia planisty, a nie czas partii.
    Zmierzony skutek: 13 falszywych zapalen na 160 pomiarow (a przy sieci
    wiekszej — takze na maszynie BEZCZYNNEJ). Nie podniesiono progu, bo prog nie
    byl przyczyna: mierzona wielkosc nie odrozniala blokady od rywalizacji o
    procesor (uzasadnienie i liczby — docstring modulu).

    ZMIERZONA MOC DETEKCYJNA nowej postaci (iniekcja: cofniecie offloadu na obu
    koncowkach — `run_short_circuit` liczy w petli zamiast w puli, `run_power_flow`
    z `def` na `async def`): 57 z 60 pomiarow dalo ZERO obsluzonych w locie,
    najgorszy 3, wobec najgorszego 8 na kodzie poprawnym.
    """
    przypadki = [_nowy_przypadek(client) for _ in range(K_ROWNOLEGLYCH)]
    for i, case_id in enumerate(przypadki):
        _zasiej(case_id, f"Siec SN {rodzaj} {i}")
        # Rozgrzewka: pierwszy odczyt modelu wykonuje migracje i uzupelnia dane
        # katalogowe, wiec jest jednorazowo drozszy — nie ma go w pomiarze.
        assert client.get(f"/api/cases/{case_id}/enm/readiness").status_code == 200

    okna_sondy: list[tuple[float, float]] = []
    okna_biegow: list[tuple[float, float]] = []
    zamek = threading.Lock()
    stop = threading.Event()

    def sonda() -> None:
        while not stop.is_set():
            start = time.perf_counter()
            odp = client.get("/api/health")
            koniec = time.perf_counter()
            if odp.status_code == 200:
                with zamek:
                    okna_sondy.append((start, koniec))
            time.sleep(0.002)

    def wykonaj_bieg(case_id: str) -> int:
        start = time.perf_counter()
        kod = _uruchom_bieg(client, case_id, sciezka).status_code
        with zamek:
            okna_biegow.append((start, time.perf_counter()))
        return kod

    watek_sondy = threading.Thread(target=sonda, daemon=True)
    watek_sondy.start()
    start_partii = time.perf_counter()
    try:
        with ThreadPoolExecutor(max_workers=K_ROWNOLEGLYCH) as pula:
            kody = list(pula.map(wykonaj_bieg, przypadki))
        czas_partii = time.perf_counter() - start_partii
    finally:
        stop.set()
        watek_sondy.join(timeout=10)

    assert kody == [200] * K_ROWNOLEGLYCH, kody

    obsluzone_w_locie = [
        (start, koniec)
        for start, koniec in okna_sondy
        if any(
            poczatek_biegu <= start and koniec <= koniec_biegu
            for poczatek_biegu, koniec_biegu in okna_biegow
        )
    ]
    assert len(obsluzone_w_locie) >= PROG_OBSLUZONYCH_W_LOCIE, (
        f"W trakcie partii biegow '{rodzaj}' ({czas_partii * 1000:.0f} ms) lekkie "
        f"zadanie zostalo obsluzone od poczatku do konca tylko "
        f"{len(obsluzone_w_locie)} raz(y) — wymagane co najmniej "
        f"{PROG_OBSLUZONYCH_W_LOCIE}. Sonda wykonala lacznie {len(okna_sondy)} "
        "zapytan, wiec reszta czekala w kolejce za biegami: te biegi blokuja "
        "obsluge innych zadan."
    )


@pytest.mark.parametrize(("rodzaj", "sciezka"), RODZAJE_BIEGOW)
def test_odczyt_nie_czeka_na_bieg_analizy(client: TestClient, rodzaj: str, sciezka: str) -> None:
    """Trywialny odczyt konczy sie ZANIM skonczy sie rownolegly bieg analizy.

    Najostrzejsza postac celu inzynierskiego osi, sprawdzana dla KAZDEJ koncowki
    biegu osobno, przy K=1 (test wyzej robi to samo przy K=10). Gdy bieg blokuje
    petle zdarzen, `GET /api/health` czeka na jego koniec — okno odczytu lezy
    wtedy CALE po zakonczeniu biegu.

    WERDYKT Z CZESTOSCI, NIE Z JEDNEJ PROBY. Porzadek zakonczen dwoch zdarzen
    trwajacych rzedy milisekund jest z natury stochastyczny: pojedyncze
    wywlaszczenie watku odczytu odwraca go bez zadnej regresji. Ale ODWRACA GO
    RZADKO, a blokada petli odwraca go PRAWIE ZAWSZE — i wlasnie ta roznica
    czestosci jest mierzalna stabilnie, w przeciwienstwie do pojedynczego
    porownania. Dlatego test wykonuje `PROB_PORZADKU` prob i pyta o WIEKSZOSC.

    ZMIERZONE CZESTOSCI (2026-08-08, 4 rdzenie, po 80 prob na rodzaj i stan):
    offload dziala — 79/80 na maszynie bezczynnej i 79/80 pod obciazeniem
    (98,75%); offload cofniety — 3/80 (3,75%). Przy 15 probach i progu „wiecej
    niz polowa" prawdopodobienstwo pomylki w OBIE strony jest rzedu 1e-8: falszywe
    zapalenie wymagaloby spadku czestosci ponizej ~70%, a falszywa zielen —
    wzrostu z 3,75% do ponad 50%.

    CO TA POSTAC ZASTAPILA (karta CHWIEJNY-WSPOLBIEZNOSC, 2026-08-08). Poprzednia
    wersja rozstrzygala JEDNA probe na runde i miala furtke „bieg krotszy niz
    50 ms => zagrozenie ograniczone, uznaj runde za zdana". Furtka byla progiem
    BEZWZGLEDNYM, a bieg na tej sieci przyspieszyl do 16-55 ms — wiec zmierzone
    79 na 80 prob konczylo sie furtka. Skutek byl gorszy niz chwiejnosc: przy
    ZABLOKOWANEJ petli test przechodzil na zielono w 79 na 80 prob, bo bieg
    miescil sie pod progiem, zanim ktokolwiek zdazyl sprawdzic porzadek. Bramka
    przestala pilnowac czegokolwiek na szybkiej maszynie, a na wolnej zaczynala
    rozstrzygac rzutem moneta. Furtki nie przeliczono na wielkosc wzgledna, bo
    przeliczona odtwarzalaby te sama dziure — usunieto ja razem z pojedyncza
    proba, a jej role (odpornosc na szum krotkich zdarzen) przejela czestosc.
    """
    case_id = _nowy_przypadek(client)
    _zasiej(case_id, f"Siec SN — responsywnosc {rodzaj}")
    # Rozgrzewka poza pomiarem (migracje + dane katalogowe przy pierwszym odczycie).
    assert client.get(f"/api/cases/{case_id}/enm/readiness").status_code == 200

    def probka() -> tuple[bool, bool]:
        """(czy okna sie nalozyly, czy odczyt skonczyl sie przed biegiem)."""
        znaczniki: dict[str, tuple[float, float]] = {}

        def bieg() -> int:
            start = time.perf_counter()
            odp = _uruchom_bieg(client, case_id, sciezka)
            znaczniki["bieg"] = (start, time.perf_counter())
            return odp.status_code

        def odczyt() -> int:
            # Bez zwloki: odczyt startuje rownoczesnie z biegiem, wiec nalozenie
            # okien jest gwarantowane tak dlugo, jak bieg trwa dluzej niz start
            # watku. Zwloka tylko zmniejszalaby szanse na nalozenie.
            start = time.perf_counter()
            odp = client.get("/api/health")
            znaczniki["odczyt"] = (start, time.perf_counter())
            return odp.status_code

        with ThreadPoolExecutor(max_workers=2) as pula:
            przyszly_bieg = pula.submit(bieg)
            przyszly_odczyt = pula.submit(odczyt)
            assert przyszly_bieg.result() == 200
            assert przyszly_odczyt.result() == 200
        _, koniec_biegu = znaczniki["bieg"]
        poczatek_odczytu, koniec_odczytu = znaczniki["odczyt"]
        return poczatek_odczytu <= koniec_biegu, koniec_odczytu < koniec_biegu

    proby = [probka() for _ in range(PROB_PORZADKU)]
    # Proba bez nalozenia okien nie niesie informacji o porzadku (bieg skonczyl
    # sie zanim odczyt ruszyl) — nie liczy sie ani na korzysc, ani na niekorzysc.
    rozstrzygajace = [porzadek for nalozenie, porzadek in proby if nalozenie]
    assert len(rozstrzygajace) > PROB_PORZADKU // 2, (
        f"Tylko {len(rozstrzygajace)} z {PROB_PORZADKU} prob dalo nalozenie okien "
        f"biegu '{rodzaj}' i odczytu — pomiar nie mial czego rozstrzygac. To nie "
        "jest werdykt o blokadzie, tylko brak pomiaru."
    )

    przed_biegiem = sum(rozstrzygajace)
    assert przed_biegiem > len(rozstrzygajace) // 2, (
        f"Odczyt /api/health skonczyl sie przed biegiem '{rodzaj}' tylko "
        f"{przed_biegiem} raz(y) na {len(rozstrzygajace)} prob rozstrzygajacych — "
        "wiekszosc lekkich odczytow czekala na koniec biegu, czyli ten bieg "
        "blokuje petle zdarzen. Przy dzialajacym offloadzie zmierzono 98,75%."
    )
