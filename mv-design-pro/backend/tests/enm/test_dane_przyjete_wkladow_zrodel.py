"""Wynik z wkładami źródeł niesie dane przyjęte i stan danych z TEGO SAMEGO wiersza biegu.

DLACZEGO. Partia 2 integracji (karty LINIA-110 i PODSTAWA-Q na szczycie partii zwarć, kontrakt
werdyktu §3, zasada nr 4 pkt 5): prąd I″k punktu liczony na wartości roboczej — tolerancji
sieci nN bez deklaracji, impedancji linii 110 kV bez geometrii słupa projektu albo parametru
maszyny wirującej bez tabliczki — jest wynikiem na DANEJ PRZYJĘTEJ (jakość ``ESTIMATED``, stan
danych ``UNVALIDATED_INPUT``, kompletność ``NIEPELNY``). Wkłady źródeł do tego prądu są jego
rozkładem: jeden wynik, jedno źródło kompletności. Przed partią 2 rozpływ punktu
(``GET …/short-circuit/rozplyw``) nie niósł żadnej danej przyjętej, a wkłady punktu
(``POST /api/proof/sc3f/contributions``) wyłącznie wpisy maszyn — ten sam I″k miał w widoku
łuku elektrycznego zastrzeżenie, a w rozkładzie na źródła nie.

ŹRÓDŁO PRAWDY: trzy znaczniki wiersza biegu (``tolerancja_nn_robocza``, gałęzie z wartością
roboczą impedancji, ``parametry_robocze_maszyn``) — rozpływ czyta je z wiersza zapisanego
biegu, wkłady z tych samych założeń wejścia obliczenia punktu (``graf_i_dobor_c_punktu``).

ILOCZYN CECH:
* sieć z linią 110 kV: geometria słupa {projekt, wartość robocza} × punkt {przy źródle, koniec
  linii} × odpowiedź {rozpływ, wkłady};
* sieć SN+nN z maszyną nN: tolerancja sieci nN {deklaracja +6 %, brak — wartość robocza}
  × maszyna {synchroniczna, asynchroniczna} × dane maszyny {tabliczka, propozycja rejestru}
  × punkt {szyna GPZ, szyna SN stacji, szyna nN, koniec obwodu nN} × odpowiedź {rozpływ, wkłady}.
PREDYKATY PARAMI: dane przyjęte rozpływu punktu = dane przyjęte tego punktu w widoku łuku
elektrycznego (niezależny konsument tego samego wiersza); dane wkładów bez maszyn = dane
rozpływu bez maszyn (te same znaczniki, ta sama kolejność); brak danej przyjętej ⇒ brak
kluczy ``status_danych`` i ``dane_przyjete`` (odpowiedź bit w bit jak przed partią 2).
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any
from uuid import UUID

import pytest
from api.main import app
from application.analyses.arc_flash_view import build_arc_flash_view
from enm.canonical_analysis import get_run
from enm.mapping import ref_to_graph_id
from enm.models import EnergyNetworkModel
from fastapi.testclient import TestClient
from network_model.catalog.wartosci_robocze import WIELKOSCI_ZWARCIOWE

from tests.application.test_parametry_robocze_maszyn import (
    NAZWA_B,
    _liczba_wpisow_b,
    _siec_b,
)
from tests.application.test_tolerancja_nn_dane_przyjete_konsumentow import (
    ZNACZNIK as ZNACZNIK_TOLERANCJI,
)
from tests.application.test_tolerancja_nn_dane_przyjete_konsumentow import _z_tolerancja
from tests.enm.test_canonical_sc_c_per_pasmo import N1, N2, N3
from tests.enm.test_linia_110kv_dane_przyjete_werdyktow import GEOMETRIE, _migawka
from tests.utils.biegi import wykonaj_bieg

#: Wspólny fragment nazwy danej przyjętej linii 110 kV (nazwa linii modelu sieci testowej).
ZNACZNIK_LINII = "(Linia 110 kV A–B)"
#: Wspólny fragment nazwy danej przyjętej maszyny sieci SN+nN.
ZNACZNIK_MASZYNY = f"maszyny „{NAZWA_B}”"


@pytest.fixture
def client() -> Iterator[TestClient]:
    from api.power_flow_runs import _interpretation_cache
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    _interpretation_cache.clear()
    reset_canonical_runs()
    reset_enm_store()
    with TestClient(app) as test_client:
        yield test_client
    reset_canonical_runs()
    reset_enm_store()


def _bieg_przez_api(client: TestClient, enm: EnergyNetworkModel) -> str:
    """Projekt i przypadek przez API, model w magazynie przypadku, bieg zwarciowy 3F MAX."""
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.store import set_enm

    projekt = client.post("/api/projects", json={"name": "Dane przyjęte wkładów"})
    assert projekt.status_code == 201, projekt.text
    przypadek = client.post(
        "/api/study-cases", json={"project_id": projekt.json()["id"], "name": "Przypadek"}
    )
    assert przypadek.status_code == 201, przypadek.text
    case_id = str(przypadek.json()["id"])
    set_enm(klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory), enm)
    utworz = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "SC_3F", "solver_input": {"scenario": "max"}},
    )
    assert utworz.status_code == 201, utworz.text
    run_id = str(utworz.json()["id"])
    wykonanie = wykonaj_bieg(client, run_id)
    assert wykonanie.status_code == 200 and wykonanie.json()["status"] == "DONE", wykonanie.text
    return run_id


def _dane(odpowiedz: dict[str, Any]) -> list[dict[str, Any]]:
    """Dane przyjęte odpowiedzi; stan danych ``UNVALIDATED_INPUT`` ⇔ lista niepusta."""
    dane = list(odpowiedz.get("dane_przyjete") or [])
    if dane:
        assert odpowiedz["status_danych"] == "UNVALIDATED_INPUT"
        assert all(d["jakosc"] == "ESTIMATED" for d in dane), dane
    else:
        assert "status_danych" not in odpowiedz and "dane_przyjete" not in odpowiedz
    return dane


def _ile(dane: list[dict[str, Any]], znacznik: str) -> int:
    return sum(znacznik in d["nazwa_pl"] for d in dane)


def _bez_maszyn(dane: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [d for d in dane if ZNACZNIK_MASZYNY not in d["nazwa_pl"]]


def _odpowiedzi_punktow(
    client: TestClient, run_id: str, enm: EnergyNetworkModel
) -> dict[str, tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]]:
    """Węzeł → (dane rozpływu, dane wkładów, dane widoku łuku) dla KAŻDEGO wiersza biegu."""
    run = get_run(UUID(run_id))
    assert run is not None
    luk = build_arc_flash_view(
        run, working_distance_mm=455.0, conductor_gap_mm=25.0, arc_time_s=0.2
    )
    luk_punktu = {str(w["bus_ref"]): w for w in luk["results"]}
    wiersze = client.get(f"/api/analysis-runs/{run_id}/results/short-circuit").json()["rows"]
    wynik = {}
    for wiersz in wiersze:
        wezel = str(wiersz["target_id"])
        rozplyw = client.get(
            f"/api/analysis-runs/{run_id}/results/short-circuit/rozplyw",
            params={"target_id": wezel},
        )
        assert rozplyw.status_code == 200, rozplyw.text
        wklady = client.post(
            "/api/proof/sc3f/contributions",
            json={
                "snapshot": enm.model_dump(mode="json"),
                "fault_node_id": wezel,
                "scenariusz": "MAX",
                "t_min_s": 0.1,
            },
        )
        assert wklady.status_code == 200, wklady.text
        wynik[wezel] = (
            _dane(rozplyw.json()),
            _dane(wklady.json()),
            list(luk_punktu[wezel].get("dane_przyjete") or []),
        )
    return wynik


# =============================================================================
# 1. Sieć z linią 110 kV — geometria słupa projektu albo wartość robocza
# =============================================================================


@pytest.mark.parametrize(("opis", "geometria", "robocza"), GEOMETRIE)
def test_linia_110kv_dane_przyjete_rozplywu_i_wkladow(
    client: TestClient, opis: str, geometria: dict[str, Any] | None, robocza: bool
) -> None:
    enm = EnergyNetworkModel.model_validate(_migawka(geometria))
    run_id = _bieg_przez_api(client, enm)
    punkty = _odpowiedzi_punktow(client, run_id, enm)
    # Oba punkty (przy źródle i na końcu linii) leżą w wyspie linii — I″k obu zależy od Z_L.
    assert set(punkty) == {ref_to_graph_id("A"), ref_to_graph_id("B")}
    for wezel, (rozplyw, wklady, luk) in punkty.items():
        assert (_ile(rozplyw, ZNACZNIK_LINII) > 0) is robocza, (opis, wezel, rozplyw)
        assert len(rozplyw) == _ile(rozplyw, ZNACZNIK_LINII)
        assert rozplyw == luk, wezel
        assert wklady == rozplyw, wezel


# =============================================================================
# 2. Sieć SN+nN z maszyną nN — tolerancja sieci nN × maszyna × dane maszyny
# =============================================================================

TOLERANCJE = [("deklaracja", "PLUS_6"), ("robocza", None)]
MASZYNY_B = ("synchroniczna", "asynchroniczna")
DANE_MASZYNY = ("tabliczka", "propozycja")


@pytest.mark.parametrize("dane_maszyny", DANE_MASZYNY)
@pytest.mark.parametrize("maszyna", MASZYNY_B)
@pytest.mark.parametrize(("opis_tolerancji", "tolerancja"), TOLERANCJE)
def test_siec_nn_z_maszyna_dane_przyjete_rozplywu_i_wkladow(
    client: TestClient,
    opis_tolerancji: str,
    tolerancja: str | None,
    maszyna: str,
    dane_maszyny: str,
) -> None:
    enm = _z_tolerancja(_siec_b(maszyna, dane_maszyny), tolerancja)
    run_id = _bieg_przez_api(client, enm)
    punkty = _odpowiedzi_punktow(client, run_id, enm)
    wezly_nn = {ref_to_graph_id(N2), ref_to_graph_id(N3)}
    # Punkty SN (szyna GPZ i szyna SN stacji) oraz oba punkty nN — wszystkie w wyspie maszyny.
    assert {ref_to_graph_id(N1)} | wezly_nn < set(punkty)

    n_ikss = _liczba_wpisow_b(maszyna, dane_maszyny, "ikss")
    n_wszystkie = _liczba_wpisow_b(maszyna, dane_maszyny, WIELKOSCI_ZWARCIOWE)
    for wezel, (rozplyw, wklady, luk) in punkty.items():
        punkt_nn = wezel in wezly_nn
        n_tolerancji = int(tolerancja is None and punkt_nn)
        kontekst = (opis_tolerancji, maszyna, dane_maszyny, wezel)
        # Rozpływ punktu (I″k): tolerancja sieci nN punktu nN + wpisy maszyny wpływające na I″k.
        assert _ile(rozplyw, ZNACZNIK_TOLERANCJI) == n_tolerancji, kontekst
        assert _ile(rozplyw, ZNACZNIK_MASZYNY) == n_ikss, kontekst
        assert len(rozplyw) == n_tolerancji + n_ikss, kontekst
        # Predykat parą z niezależnym konsumentem TEGO SAMEGO wiersza (łuk elektryczny: I_bf).
        assert rozplyw == luk, kontekst
        # Wkłady punktu (I″k, i_p, I_b przy t_min, I_th): ten sam znacznik tolerancji, wpisy
        # maszyny wg wszystkich wielkości zwarciowych (p maszyny nN zmienia wyłącznie I_b).
        assert _bez_maszyn(wklady) == _bez_maszyn(rozplyw), kontekst
        assert _ile(wklady, ZNACZNIK_MASZYNY) == n_wszystkie, kontekst
