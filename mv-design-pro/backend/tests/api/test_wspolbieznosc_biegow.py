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
"""

from __future__ import annotations

import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from api.main import app
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_source_record

#: Liczba rownoleglych zadan w miarze „done" (§3 planu 10x).
K_ROWNOLEGLYCH = 10


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


def _zasiej(case_id: str, nazwa: str) -> None:
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    set_enm(case_id, EnergyNetworkModel.model_validate(_model_sn(nazwa)))


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
    przypadki = [str(uuid4()) for _ in range(K_ROWNOLEGLYCH)]
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
    assert czas_rownolegle <= czas_szeregowo * 3.0, (
        f"Partia rownolegla ({czas_rownolegle:.3f} s) jest ponad 3x wolniejsza "
        f"od szeregowej ({czas_szeregowo:.3f} s) — to juz nie koszt GIL, tylko "
        "konwoj na blokadzie albo ponawianie transakcji."
    )


@pytest.mark.parametrize(("rodzaj", "sciezka"), RODZAJE_BIEGOW)
def test_lekkie_zadanie_przechodzi_w_trakcie_biegow(
    client: TestClient, rodzaj: str, sciezka: str
) -> None:
    """MIARA „DONE" wprost z §3 planu 10x: stabilne p95 API przy K=10 biegach.

    Podczas gdy K=10 ciezkich biegow JEDNEGO rodzaju jest w locie, sonda wysyla
    trywialne `GET /api/health` i mierzy opoznienie. Pytanie brzmi: czy lekkie
    zadanie DA SIE obsluzyc, kiedy system liczy — bo to jest to, co projektant
    widzi jako „UI zyje" albo „UI zamarlo".

    DLACZEGO PER RODZAJ: koncowka, ktorej offload cofnieto, blokuje petle zdarzen
    niezaleznie od tego, ze druga koncowka jest poprawna. Pomiar zbiorczy tego nie
    widzi (druga koncowka oddaje sterowanie i sonda przechodzi). Parametryzacja
    sprawia, ze KAZDA koncowka odpowiada za siebie.

    PROG WZGLEDNY, odniesiony do czasu trwania CALEJ partii. Gdy biegi trzymaja
    petle zdarzen, sonda nie zostaje zdjeta z gniazda do konca partii — jej
    opoznienie zbiega do czasu reszty partii, wiec p95 lezy tuz pod nia. Offload
    sprawia, ze sonda wchodzi miedzy biegi. Prog p95 < polowa czasu partii
    oddziela te dwa swiaty z zapasem i nie zalezy od predkosci maszyny.

    Zmierzone po naprawie (4 rdzenie, zwarcia): partia 2,15 s, sonda p50 = 17 ms,
    p95 = 295 ms, czyli 0,14 czasu partii.
    """
    przypadki = [str(uuid4()) for _ in range(K_ROWNOLEGLYCH)]
    for i, case_id in enumerate(przypadki):
        _zasiej(case_id, f"Siec SN {rodzaj} {i}")
        # Rozgrzewka: pierwszy odczyt modelu wykonuje migracje i uzupelnia dane
        # katalogowe, wiec jest jednorazowo drozszy — nie ma go w pomiarze.
        assert client.get(f"/api/cases/{case_id}/enm/readiness").status_code == 200

    opoznienia: list[float] = []
    zamek = threading.Lock()
    stop = threading.Event()

    def sonda() -> None:
        while not stop.is_set():
            start = time.perf_counter()
            odp = client.get("/api/health")
            trwanie = time.perf_counter() - start
            if odp.status_code == 200:
                with zamek:
                    opoznienia.append(trwanie)
            time.sleep(0.002)

    watek_sondy = threading.Thread(target=sonda, daemon=True)
    watek_sondy.start()
    start_partii = time.perf_counter()
    try:
        with ThreadPoolExecutor(max_workers=K_ROWNOLEGLYCH) as pula:
            kody = list(
                pula.map(
                    lambda cid: _uruchom_bieg(client, cid, sciezka).status_code,
                    przypadki,
                )
            )
        czas_partii = time.perf_counter() - start_partii
    finally:
        stop.set()
        watek_sondy.join(timeout=10)

    assert kody == [200] * K_ROWNOLEGLYCH, kody
    assert len(opoznienia) >= 5, (
        f"Sonda zdazyla wykonac tylko {len(opoznienia)} zapytan w trakcie partii "
        f"biegow '{rodzaj}' — lekkie zadania nie byly obslugiwane w trakcie liczenia."
    )

    posortowane = sorted(opoznienia)
    p95 = posortowane[min(int(len(posortowane) * 0.95), len(posortowane) - 1)]
    assert p95 < czas_partii / 2, (
        f"p95 lekkiego zadania ({p95 * 1000:.0f} ms) siega czasu calej partii "
        f"biegow '{rodzaj}' ({czas_partii * 1000:.0f} ms) — te biegi blokuja "
        "obsluge innych zadan."
    )


@pytest.mark.parametrize(("rodzaj", "sciezka"), RODZAJE_BIEGOW)
def test_odczyt_nie_czeka_na_bieg_analizy(client: TestClient, rodzaj: str, sciezka: str) -> None:
    """Trywialny odczyt konczy sie ZANIM skonczy sie rownolegly bieg analizy.

    Najostrzejsza postac celu inzynierskiego osi, sprawdzana dla KAZDEJ koncowki
    biegu osobno. Gdy bieg blokuje petle zdarzen, `GET /api/health` czeka na jego
    koniec — okno odczytu lezy wtedy CALE po zakonczeniu biegu.
    """
    case_id = str(uuid4())
    _zasiej(case_id, f"Siec SN — responsywnosc {rodzaj}")
    # Rozgrzewka poza pomiarem (migracje + dane katalogowe przy pierwszym odczycie).
    assert client.get(f"/api/cases/{case_id}/enm/readiness").status_code == 200

    znaczniki: dict[str, tuple[float, float]] = {}

    def bieg() -> int:
        start = time.perf_counter()
        odp = _uruchom_bieg(client, case_id, sciezka)
        znaczniki["bieg"] = (start, time.perf_counter())
        return odp.status_code

    def odczyt() -> int:
        # Krotka zwloka, zeby bieg zdazyl wejsc w faze liczenia.
        time.sleep(0.01)
        start = time.perf_counter()
        odp = client.get("/api/health")
        znaczniki["odczyt"] = (start, time.perf_counter())
        return odp.status_code

    with ThreadPoolExecutor(max_workers=2) as pula:
        przyszly_bieg = pula.submit(bieg)
        przyszly_odczyt = pula.submit(odczyt)
        assert przyszly_bieg.result() == 200
        assert przyszly_odczyt.result() == 200

    poczatek_biegu, koniec_biegu = znaczniki["bieg"]
    poczatek_odczytu, koniec_odczytu = znaczniki["odczyt"]
    assert poczatek_odczytu >= poczatek_biegu
    assert koniec_odczytu < koniec_biegu, (
        f"Odczyt /api/health zakonczyl sie dopiero PO biegu '{rodzaj}' — ten bieg "
        "blokowal petle zdarzen."
    )
