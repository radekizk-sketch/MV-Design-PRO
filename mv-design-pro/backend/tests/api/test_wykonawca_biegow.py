"""Wykonawca biegów w tle (karta DYNAMIKA-W-TLE) — testy jako ILOCZYN CECH.

Osie: {bieg krótki (rozpływ), bieg długi (bieg czasowy z krokami całkowania)} ×
{zakończony, anulowany przed startem, anulowany w toku, przerwany restartem, błąd
solwera} × {jeden bieg, dwa zlecone naraz}. Każda komórka iloczynu, w której defekt
mógłby się schować, ma tu przypięcie; tam, gdzie kontrakt świadomie odmawia (anulowanie
biegu w toku bez punktów przerwania), przypięta jest ODMOWA z nazwanym powodem.

Determinizm: bieg czasowy przez wykonawcę w tle (nadzorca postępu w rdzeniu) daje wynik
i szeregi czasowe BIT W BIT równe biegowi synchronicznemu `execute_run` bez kontekstu —
jedyna dozwolona różnica to pomiar zegara `czas_obliczen_s` (nie jest wielkością fizyczną
i nie wchodzi do odcisku biegu).
"""

from __future__ import annotations

import inspect
import threading
import time
import uuid
from typing import Any

import pytest
from api.main import app
from application.execution.wykonawca import (
    POWOD_ANULOWANIA_PRZED_STARTEM,
    RODZAJE_Z_PUNKTAMI_PRZERWANIA,
    WykonawcaBiegow,
)
from domain.execution import STANY_KONCOWE_BIEGU, PostepBiegu
from enm import canonical_analysis
from enm.canonical_analysis import (
    POWOD_ANULOWANIA_W_TOKU,
    create_run,
    execute_run,
    get_run,
    reset_canonical_runs,
)
from enm.models import EnergyNetworkModel
from enm.scenariusze import (
    usun_wszystkie_scenariusze,
)
from enm.store import reset_enm_store, set_enm
from fastapi.testclient import TestClient
from infrastructure.persistence.repositories.canonical_run_repository import (
    canonical_run_repository_scope,
)

from tests.golden.enm_builders.dynamika_projektanta import (
    build_dynamika_projektanta_enm,
    refy_sieci,
    scenariusz_zwarcia_w_odcinku,
)
from tests.utils.biegi import poczekaj_na_stan_koncowy, wykonaj_bieg

#: Nastawy sceny harnessu (`scripts/eksport_fixtur_harnessu.py::NASTAWY_SCENY_DYNAMIKA`).
NASTAWY = {
    "dt_s": 0.002,
    "dt_min_s": 0.002,
    "dt_max_s": 0.002,
    "tolerancja": 1.0e-10,
    "tolerancja_kroku": 1.0e-6,
    "eps_init": 1.0e-6,
    "max_iteracji_newtona": 40,
    "max_nawrotow": 30,
    "integrator": "trapez_niejawny",
    "tolerancja_lokalizacji_zdarzen_s": 1.0e-4,
}
#: Horyzont biegu DŁUGIEGO: ~1 500 kroków całkowania (≈ 8–15 s na maszynie CI) — dość,
#: żeby odczytać postęp i anulować bieg między krokami, nie dość, żeby test był kosztem.
HORYZONT_DLUGI_S = 3.0
LIMIT_S = 300.0


def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    usun_wszystkie_scenariusze()


@pytest.fixture
def client() -> Any:
    _reset()
    with TestClient(app) as klient:
        yield klient
    _reset()


def _przypadek(client: TestClient) -> str:
    projekt = client.post("/api/projects", json={"name": "Wykonawca w tle — test"})
    assert projekt.status_code == 201, projekt.text
    przypadek = client.post(
        "/api/study-cases",
        json={"project_id": projekt.json()["id"], "name": "Przypadek", "set_active": True},
    )
    assert przypadek.status_code == 201, przypadek.text
    return str(przypadek.json()["id"])


def _zasiej_siec_dynamiki(client: TestClient, case_id: str) -> dict[str, Any]:
    """Sieć toku pracy dynamiki (ta sama, co sceny harnessu i spec e2e) w magazynie
    przypadku — klucz magazynu jak w `tests/api/test_dynamika_api.py`."""
    from application.twin_key import klucz_twin_dla_przypadku

    enm = build_dynamika_projektanta_enm(z_modelem_pv=True, z_modelem_odbioru=True)
    klucz = klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)
    set_enm(klucz, EnergyNetworkModel.model_validate(enm))
    return enm


def _utworz(client: TestClient, case_id: str, analysis_type: str, **solver_input: Any) -> str:
    odpowiedz = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": analysis_type, "solver_input": solver_input},
    )
    assert odpowiedz.status_code == 201, odpowiedz.text
    return str(odpowiedz.json()["id"])


def _rozplyw_punktu_pracy(client: TestClient, case_id: str) -> str:
    run_id = _utworz(client, case_id, "LOAD_FLOW")
    koniec = wykonaj_bieg(client, run_id)
    assert koniec.json()["status"] == "DONE", koniec.json()
    return run_id


def _scenariusz(client: TestClient, case_id: str, enm: dict[str, Any], horyzont_s: float) -> str:
    refy = refy_sieci(enm)
    harmonogram = scenariusz_zwarcia_w_odcinku(refy.odcinek_zwarcia, szyna_detektora=None)
    harmonogram["horyzont_s"] = horyzont_s
    odpowiedz = client.post(
        f"/api/dynamika/study-cases/{case_id}/scenariusze",
        json={"name": "Zwarcie w odcinku 2", "dynamika": harmonogram},
    )
    assert odpowiedz.status_code in (200, 201), odpowiedz.text
    return str(odpowiedz.json()["scenario_id"])


def _utworz_bieg_dynamiki(
    client: TestClient, case_id: str, pf_run_id: str, scenario_id: str
) -> str:
    odpowiedz = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={
            "analysis_type": "DYNAMIKA_RMS",
            "solver_input": {"pf_run_id": pf_run_id, "nastawy_solvera": NASTAWY},
            "scenario_id": scenario_id,
        },
    )
    assert odpowiedz.status_code == 201, odpowiedz.text
    return str(odpowiedz.json()["id"])


# ---------------------------------------------------------------------------
# Bieg krótki × zakończony × jeden / dwa naraz
# ---------------------------------------------------------------------------


def test_execute_zwraca_202_queued_a_wynik_po_odpytaniu(client: TestClient) -> None:
    case_id = _przypadek(client)
    _zasiej_siec_dynamiki(client, case_id)
    run_id = _utworz(client, case_id, "LOAD_FLOW")

    zlecenie = client.post(f"/api/execution/runs/{run_id}/execute")
    assert zlecenie.status_code == 202, zlecenie.text
    assert zlecenie.json()["status"] in {"QUEUED", "RUNNING", "DONE"}
    assert "postep" in zlecenie.json()

    koniec = poczekaj_na_stan_koncowy(
        client, f"/api/execution/runs/{run_id}", stany_koncowe=frozenset(STANY_KONCOWE_HTTP())
    )
    assert koniec.json()["status"] == "DONE", koniec.json()
    assert koniec.json()["postep"] is None
    wyniki = client.get(f"/api/execution/runs/{run_id}/results")
    assert wyniki.status_code == 200, wyniki.text


def STANY_KONCOWE_HTTP() -> set[str]:
    return {"DONE", "FAILED", "CANCELLED"}


def test_drugie_zlecenie_tego_samego_biegu_nie_liczy_drugi_raz(client: TestClient) -> None:
    case_id = _przypadek(client)
    _zasiej_siec_dynamiki(client, case_id)
    run_id = _utworz(client, case_id, "LOAD_FLOW")
    wejscia = 0
    oryginal = canonical_analysis._wykonaj_analize_biegu

    def liczacy(run: Any, graf: Any = None, uow_factory: Any = None, kontekst: Any = None) -> None:
        nonlocal wejscia
        wejscia += 1
        oryginal(run, graf, uow_factory, kontekst)

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(canonical_analysis, "_wykonaj_analize_biegu", liczacy)
        pierwsze = client.post(f"/api/execution/runs/{run_id}/execute")
        drugie = client.post(f"/api/execution/runs/{run_id}/execute")
        assert pierwsze.status_code == 202 and drugie.status_code == 202
        koniec = wykonaj_bieg(client, run_id)
    assert koniec.json()["status"] == "DONE"
    assert wejscia == 1, "bieg zlecony dwa razy policzył się więcej niż raz"
    trzecie = client.post(f"/api/execution/runs/{run_id}/execute")
    assert trzecie.status_code == 202
    assert trzecie.json()["status"] == "DONE", "zlecenie biegu zakończonego oddaje stan bieżący"
    assert wejscia == 1


def test_dwa_biegi_naraz_konczy_oba_a_w_trakcie_jeden_liczy_drugi_czeka(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    case_id = _przypadek(client)
    _zasiej_siec_dynamiki(client, case_id)
    biegi = [_utworz(client, case_id, "LOAD_FLOW") for _ in range(2)]
    oryginal = canonical_analysis._wykonaj_analize_biegu
    pierwszy_w_oknie = threading.Event()
    zwolnij = threading.Event()
    zamek = threading.Lock()
    w_oknie: list[str] = []

    def parkujacy(
        run: Any, graf: Any = None, uow_factory: Any = None, kontekst: Any = None
    ) -> None:
        with zamek:
            w_oknie.append(str(run.id))
            pierwszy = len(w_oknie) == 1
        if pierwszy:
            pierwszy_w_oknie.set()
            zwolnij.wait(timeout=LIMIT_S)
        oryginal(run, graf, uow_factory, kontekst)

    monkeypatch.setattr(canonical_analysis, "_wykonaj_analize_biegu", parkujacy)
    for run_id in biegi:
        assert client.post(f"/api/execution/runs/{run_id}/execute").status_code == 202
    assert pierwszy_w_oknie.wait(timeout=LIMIT_S)
    stany = sorted(client.get(f"/api/execution/runs/{r}").json()["status"] for r in biegi)
    assert stany == ["QUEUED", "RUNNING"], stany
    zwolnij.set()
    for run_id in biegi:
        assert wykonaj_bieg(client, run_id).json()["status"] == "DONE"
    assert w_oknie == biegi, "kolejka nie jest FIFO"


# ---------------------------------------------------------------------------
# Anulowanie: przed startem (z kolejki), w toku (między krokami), odmowy nazwane
# ---------------------------------------------------------------------------


def test_anulowanie_biegu_w_kolejce_jest_natychmiastowe_a_pierwszy_liczy_do_konca(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    case_id = _przypadek(client)
    _zasiej_siec_dynamiki(client, case_id)
    pierwszy, drugi = (_utworz(client, case_id, "LOAD_FLOW") for _ in range(2))
    oryginal = canonical_analysis._wykonaj_analize_biegu
    w_oknie = threading.Event()
    zwolnij = threading.Event()

    def parkujacy(
        run: Any, graf: Any = None, uow_factory: Any = None, kontekst: Any = None
    ) -> None:
        w_oknie.set()
        zwolnij.wait(timeout=LIMIT_S)
        oryginal(run, graf, uow_factory, kontekst)

    monkeypatch.setattr(canonical_analysis, "_wykonaj_analize_biegu", parkujacy)
    assert client.post(f"/api/execution/runs/{pierwszy}/execute").status_code == 202
    assert w_oknie.wait(timeout=LIMIT_S)
    assert client.post(f"/api/execution/runs/{drugi}/execute").status_code == 202
    assert client.get(f"/api/execution/runs/{drugi}").json()["status"] == "QUEUED"

    anulowanie = client.post(f"/api/execution/runs/{drugi}/cancel")
    assert anulowanie.status_code == 202, anulowanie.text
    assert anulowanie.json()["status"] == "CANCELLED"
    assert anulowanie.json()["error_message"] == POWOD_ANULOWANIA_PRZED_STARTEM
    zwolnij.set()
    assert wykonaj_bieg(client, pierwszy).json()["status"] == "DONE"
    # Bieg zdjęty z kolejki nigdy nie wszedł do dyspozytora i nie ma wyniku.
    assert client.get(f"/api/execution/runs/{drugi}").json()["status"] == "CANCELLED"
    assert client.get(f"/api/execution/runs/{drugi}/results").status_code == 409


def test_anulowanie_biegu_utworzonego_a_niezleconego(client: TestClient) -> None:
    case_id = _przypadek(client)
    _zasiej_siec_dynamiki(client, case_id)
    run_id = _utworz(client, case_id, "LOAD_FLOW")
    anulowanie = client.post(f"/api/execution/runs/{run_id}/cancel")
    assert anulowanie.status_code == 202, anulowanie.text
    assert anulowanie.json()["status"] == "CANCELLED"
    # Bieg anulowany jest stanem końcowym — zlecenie go nie wskrzesza.
    assert client.post(f"/api/execution/runs/{run_id}/execute").json()["status"] == "CANCELLED"


def test_anulowanie_biegu_zakonczonego_to_409_z_powodem(client: TestClient) -> None:
    case_id = _przypadek(client)
    _zasiej_siec_dynamiki(client, case_id)
    run_id = _utworz(client, case_id, "LOAD_FLOW")
    assert wykonaj_bieg(client, run_id).json()["status"] == "DONE"
    odmowa = client.post(f"/api/execution/runs/{run_id}/cancel")
    assert odmowa.status_code == 409, odmowa.text
    assert "zakończony" in odmowa.json()["detail"]
    assert client.post(f"/api/execution/runs/{uuid.uuid4()}/cancel").status_code == 404


def test_anulowanie_rozplywu_w_toku_odmawia_bo_rdzen_nie_ma_punktu_przerwania(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    case_id = _przypadek(client)
    _zasiej_siec_dynamiki(client, case_id)
    run_id = _utworz(client, case_id, "LOAD_FLOW")
    oryginal = canonical_analysis._wykonaj_analize_biegu
    w_oknie = threading.Event()
    zwolnij = threading.Event()

    def parkujacy(
        run: Any, graf: Any = None, uow_factory: Any = None, kontekst: Any = None
    ) -> None:
        w_oknie.set()
        zwolnij.wait(timeout=LIMIT_S)
        oryginal(run, graf, uow_factory, kontekst)

    monkeypatch.setattr(canonical_analysis, "_wykonaj_analize_biegu", parkujacy)
    assert client.post(f"/api/execution/runs/{run_id}/execute").status_code == 202
    assert w_oknie.wait(timeout=LIMIT_S)
    odmowa = client.post(f"/api/execution/runs/{run_id}/cancel")
    assert odmowa.status_code == 409, odmowa.text
    assert "punkt" in odmowa.json()["detail"] and "przerwania" in odmowa.json()["detail"]
    zwolnij.set()
    assert wykonaj_bieg(client, run_id).json()["status"] == "DONE"


def test_bieg_dlugi_pokazuje_postep_i_daje_sie_anulowac_miedzy_krokami(
    client: TestClient,
) -> None:
    """Bieg czasowy: postęp w czasie symulacji rośnie, anulowanie w toku kończy się
    CANCELLED z chwilą przerwania, bez wyniku i bez szeregów czasowych."""
    case_id = _przypadek(client)
    enm = _zasiej_siec_dynamiki(client, case_id)
    pf = _rozplyw_punktu_pracy(client, case_id)
    scenariusz = _scenariusz(client, case_id, enm, HORYZONT_DLUGI_S)
    run_id = _utworz_bieg_dynamiki(client, case_id, pf, scenariusz)
    assert client.post(f"/api/execution/runs/{run_id}/execute").status_code == 202

    postepy: list[dict[str, Any]] = []
    termin = time.monotonic() + LIMIT_S
    while time.monotonic() < termin:
        stan = client.get(f"/api/execution/runs/{run_id}").json()
        if stan["status"] in STANY_KONCOWE_BIEGU or stan["status"] == "DONE":
            pytest.fail(f"bieg skończył się, zanim odczytano postęp: {stan}")
        if stan["postep"] is not None and stan["postep"]["krok"] >= 5:
            postepy.append(stan["postep"])
        if len(postepy) >= 2:
            break
        time.sleep(0.01)
    assert len(postepy) >= 2, "nie odczytano rosnącego postępu biegu w toku"
    assert postepy[0]["jednostka"] == "s symulacji"
    assert postepy[0]["razem"] == pytest.approx(HORYZONT_DLUGI_S)
    assert postepy[-1]["wykonane"] >= postepy[0]["wykonane"]
    assert 0.0 < postepy[-1]["ulamek"] < 1.0

    anulowanie = client.post(f"/api/execution/runs/{run_id}/cancel")
    assert anulowanie.status_code == 202, anulowanie.text
    assert anulowanie.json()["status"] == "RUNNING", "przerwanie zlecone — bieg kończy się sam"

    koniec = poczekaj_na_stan_koncowy(
        client, f"/api/execution/runs/{run_id}", stany_koncowe=frozenset(STANY_KONCOWE_HTTP())
    )
    stan = koniec.json()
    assert stan["status"] == "CANCELLED", stan
    assert stan["error_message"].startswith(POWOD_ANULOWANIA_W_TOKU)
    assert "t = " in stan["error_message"] and "krokach całkowania" in stan["error_message"]
    assert stan["finished_at"] is not None
    assert client.get(f"/api/execution/runs/{run_id}/results").status_code == 409
    assert client.get(f"/api/analysis-runs/{run_id}/results/dynamika").status_code == 404
    assert (
        client.get(f"/api/analysis-runs/{run_id}/results/dynamika/time-series").status_code == 404
    )
    zapisany = get_run(uuid.UUID(run_id))
    assert zapisany is not None and zapisany.raw_result is None


# ---------------------------------------------------------------------------
# Przerwanie restartem procesu × {w kolejce, w toku}
# ---------------------------------------------------------------------------


def test_restart_procesu_zamyka_bieg_w_kolejce_i_w_toku_z_przyczyna() -> None:
    _reset()
    case_id = str(uuid.uuid4())
    set_enm(
        case_id,
        EnergyNetworkModel.model_validate(
            build_dynamika_projektanta_enm(z_modelem_pv=True, z_modelem_odbioru=True)
        ),
    )
    w_kolejce = create_run(case_id=case_id, klucz_twin=case_id, analysis_type="PF")
    w_toku = create_run(case_id=case_id, klucz_twin=case_id, analysis_type="PF")
    with canonical_run_repository_scope() as repo:
        assert repo.claim_for_queue(w_kolejce.id)
        assert repo.claim_for_execution(w_toku.id, started_at=w_toku.created_at)
    # Start procesu API = lifespan: zamiatanie biegów osieroconych w QUEUED/RUNNING.
    with TestClient(app) as klient:
        for run_id in (w_kolejce.id, w_toku.id):
            stan = klient.get(f"/api/execution/runs/{run_id}").json()
            assert stan["status"] == "FAILED", stan
            assert "restart procesu" in stan["error_message"]
            assert stan["finished_at"] is not None
    _reset()


# ---------------------------------------------------------------------------
# Błąd solwera × {krótki, długi} przez wykonawcę
# ---------------------------------------------------------------------------


def test_odmowa_solwera_w_tle_to_failed_z_komunikatem(client: TestClient) -> None:
    case_id = _przypadek(client)
    _zasiej_siec_dynamiki(client, case_id)
    pf = _rozplyw_punktu_pracy(client, case_id)
    # Bieg czasowy bez scenariusza nazwanego = odmowa adaptera (nazwana, po polsku).
    run_id = _utworz(client, case_id, "DYNAMIKA_RMS", pf_run_id=pf, nastawy_solvera=NASTAWY)
    koniec = wykonaj_bieg(client, run_id).json()
    assert koniec["status"] == "FAILED", koniec
    assert koniec["error_message"]
    assert "(kod" in koniec["error_message"], "odmowa nazwana niesie kod"


def test_blad_programu_w_tle_to_failed_z_nazwa_bledu_a_wykonawca_zyje_dalej(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    case_id = _przypadek(client)
    _zasiej_siec_dynamiki(client, case_id)
    wybuchajacy, zdrowy = (_utworz(client, case_id, "LOAD_FLOW") for _ in range(2))
    oryginal = canonical_analysis._wykonaj_analize_biegu

    def dyspozytor(
        run: Any, graf: Any = None, uow_factory: Any = None, kontekst: Any = None
    ) -> None:
        if str(run.id) == wybuchajacy:
            raise KeyError("wstrzyknięty błąd programu")
        oryginal(run, graf, uow_factory, kontekst)

    monkeypatch.setattr(canonical_analysis, "_wykonaj_analize_biegu", dyspozytor)
    # Oba zlecone NARAZ: zdrowy czeka w kolejce, gdy wybuchający kończy wątek roboczy
    # błędem programu — wątek zastępczy ma dokończyć kolejkę bez nowego zlecenia.
    assert client.post(f"/api/execution/runs/{wybuchajacy}/execute").status_code == 202
    assert client.post(f"/api/execution/runs/{zdrowy}/execute").status_code == 202
    zle = wykonaj_bieg(client, wybuchajacy).json()
    assert zle["status"] == "FAILED"
    assert zle["error_message"].startswith("Błąd wewnętrzny programu (KeyError)")
    assert "wstrzyknięty" not in zle["error_message"]
    assert wykonaj_bieg(client, zdrowy).json()["status"] == "DONE"
    # Wykonawca przyjmuje też NOWE zlecenia po błędzie programu (wątek zastępczy żyje).
    kolejny = _utworz(client, case_id, "LOAD_FLOW")
    assert wykonaj_bieg(client, kolejny).json()["status"] == "DONE"


# ---------------------------------------------------------------------------
# Determinizm: bieg w tle == bieg synchroniczny bit w bit
# ---------------------------------------------------------------------------


def _bez_zegara(raw_result: dict[str, Any] | None) -> dict[str, Any]:
    """Wynik bez pomiaru zegara i bez tożsamości biegu (`run_id` jest identyfikatorem
    rekordu, nie wielkością fizyczną) — reszta ma być równa bit w bit."""
    assert raw_result is not None
    kopia = dict(raw_result)
    kopia["wlasnosci_biegu"] = {
        k: v for k, v in dict(kopia["wlasnosci_biegu"]).items() if k != "czas_obliczen_s"
    }
    return kopia


#: Pola TOŻSAMOŚCI biegu (identyfikator rekordu i odciski, które go zawierają) — nie są
#: wielkościami fizycznymi; wszystko poza nimi ma być równe bit w bit.
_POLA_TOZSAMOSCI_BIEGU = frozenset({"run_id", "run_ref", "proof_pack_ref", "result_hash"})


def _roznice(a: Any, b: Any, sciezka: str = "") -> list[str]:
    """Ścieżki, pod którymi dwa ładunki JSON się różnią (diagnoza, nie werdykt)."""
    if isinstance(a, dict) and isinstance(b, dict):
        wynik: list[str] = []
        for klucz in sorted(set(a) | set(b)):
            if klucz in _POLA_TOZSAMOSCI_BIEGU:
                continue
            if klucz not in a or klucz not in b:
                wynik.append(f"{sciezka}/{klucz} (tylko po jednej stronie)")
            else:
                wynik.extend(_roznice(a[klucz], b[klucz], f"{sciezka}/{klucz}"))
        return wynik
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return [f"{sciezka} (długość {len(a)} != {len(b)})"]
        return [
            r
            for i, (x, y) in enumerate(zip(a, b, strict=True))
            for r in _roznice(x, y, f"{sciezka}[{i}]")
        ]
    return [] if a == b else [f"{sciezka}: {a!r} != {b!r}"]


def test_bieg_w_tle_daje_wynik_bit_w_bit_rowny_biegowi_synchronicznemu(
    client: TestClient,
) -> None:
    case_id = _przypadek(client)
    enm = _zasiej_siec_dynamiki(client, case_id)
    pf = _rozplyw_punktu_pracy(client, case_id)
    scenariusz = _scenariusz(client, case_id, enm, 0.3)
    w_tle = _utworz_bieg_dynamiki(client, case_id, pf, scenariusz)
    assert wykonaj_bieg(client, w_tle).json()["status"] == "DONE"

    synchroniczny = _utworz_bieg_dynamiki(client, case_id, pf, scenariusz)
    wynik_sync = execute_run(uuid.UUID(synchroniczny))
    assert wynik_sync.status == "FINISHED", wynik_sync.error_message

    bieg_tle = get_run(uuid.UUID(w_tle))
    assert bieg_tle is not None
    assert bieg_tle.input_hash == wynik_sync.input_hash
    roznice = _roznice(_bez_zegara(bieg_tle.raw_result), _bez_zegara(wynik_sync.raw_result))
    assert roznice == [], f"wynik biegu w tle różni się od synchronicznego: {roznice[:20]}"
    szeregi_tle = client.get(f"/api/analysis-runs/{w_tle}/results/dynamika/time-series").json()
    szeregi_sync = client.get(
        f"/api/analysis-runs/{synchroniczny}/results/dynamika/time-series"
    ).json()
    roznice_szeregow = _roznice(szeregi_tle, szeregi_sync)
    assert roznice_szeregow == [], f"szeregi czasowe różnią się: {roznice_szeregow[:20]}"


# ---------------------------------------------------------------------------
# Piny kontraktu: punkty przerwania × rodzaj analizy; wykonawca jako klasa
# ---------------------------------------------------------------------------


def test_rodzaje_z_punktami_przerwania_to_dokladnie_wykonawcy_czytajacy_kontekst() -> None:
    """Deklaracja `RODZAJE_Z_PUNKTAMI_PRZERWANIA` ma pokrycie w kodzie: dokładnie
    wykonawcy tych rodzajów przyjmują `kontekst` i wołają `punkt_przerwania`."""
    wykonawcy = {
        "dynamika_rms": canonical_analysis._execute_dynamika_rms,
        "short_circuit_sn": canonical_analysis._execute_short_circuit,
        "PF": canonical_analysis._execute_power_flow,
        "phase_state_sn": canonical_analysis._execute_phase_state_sn,
        "protection_sn": canonical_analysis._execute_protection,
        canonical_analysis.ANALYSIS_TYPE_ROZPLYW_NIESYMETRYCZNY: (
            canonical_analysis._execute_power_flow_unbalanced
        ),
    }
    z_kontekstem = {
        rodzaj
        for rodzaj, fn in wykonawcy.items()
        if "kontekst" in inspect.signature(fn).parameters
        and (
            "punkt_przerwania" in inspect.getsource(fn)
            or "_NadzorcaBieguDynamiki" in inspect.getsource(fn)
        )
    }
    assert z_kontekstem == set(RODZAJE_Z_PUNKTAMI_PRZERWANIA)


def test_kontekst_wykonania_jest_jedynym_zrodlem_anulowania_i_postepu() -> None:
    wykonawca = WykonawcaBiegow()
    odczyty: list[PostepBiegu] = []
    zakonczone = threading.Event()

    def zadanie(kontekst: Any) -> None:
        for krok in range(3):
            kontekst.punkt_przerwania(
                PostepBiegu(wykonane=krok, razem=3, jednostka="kroki", krok=krok), wyjasnienie="x"
            )
            odczyty.append(wykonawca.postep("zlecenie"))
        zakonczone.set()

    wykonawca.zlec("zlecenie", zadanie)
    assert zakonczone.wait(timeout=10)
    assert wykonawca.poczekaj_na_pustke(10)
    assert [p.krok for p in odczyty] == [0, 1, 2]
    assert wykonawca.postep("zlecenie") is None, "postęp zlecenia zakończonego nie jest raportowany"
    assert wykonawca.zdejmij_z_kolejki("zlecenie") is False
    assert wykonawca.zazadaj_przerwania("zlecenie") is False
