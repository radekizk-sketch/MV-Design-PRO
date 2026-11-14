"""Testy końcówek API estymacji stanu WLS (faza 1 — ekspozycja backendowa).

Kontrakt: gotowy przebieg rozpływu → widok estymacji (|V|/kąt/χ²), determinizm,
404 (brak przebiegu), 422 (zły rodzaj analizy / brak pomiarów), uczciwa detekcja
złych danych (gross error). Pomiary budowane są z Y-bus golden sieci na płaskim,
samospójnym stanie — realna ścieżka endpointu (bez fabrykacji po stronie produktu).
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import numpy as np
import pytest
from enm.canonical_analysis import create_run, execute_run, get_run, reset_canonical_runs
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store, set_enm
from network_model.core.node import NodeType
from network_model.solvers.state_estimation_wls import (
    _h_injection_p,
    _h_injection_q,
    ybus_from_network_graph,
)

from tests.cgmes.golden_enm import build_golden_enm

STATE_ESTIMATION = "/api/quality/state-estimation"
REQUIREMENTS = "/api/quality/state-estimation/requirements"


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _pf_run_id():
    set_enm("c-pf", build_golden_enm())
    return execute_run(create_run(case_id="c-pf", klucz_twin="c-pf", analysis_type="PF").id).id


def _sc_run_id():
    set_enm("c-sc", build_golden_enm())
    return execute_run(
        create_run(case_id="c-sc", klucz_twin="c-sc", analysis_type="short_circuit_sn").id
    ).id


def _flat_measurements(run_id, *, podzial: float = 1.0) -> list[dict[str, Any]]:
    """Zestaw pomiarów samospójny z płaskim stanem (V=1.0 pu, θ=0) dla Y-bus przebiegu.

    |V| na wszystkich węzłach + P,Q iniekcji na węzłach nie-slack ⇒ obserwowalny.
    Wartości P/Q liczone funkcjami pomiarowymi solvera przy płaskim stanie, więc
    estymator odtwarza płaski stan dokładnie (rezydua ≈ 0).

    Indeks Y-bus to węzeł ELEKTRYCZNY (węzły połączone zamkniętym łącznikiem dzielą indeks):
    iniekcja węzła elektrycznego jest sumą iniekcji jego węzłów, więc węzły grupy dostają
    składowe sumujące się do iniekcji indeksu — pierwszy (po identyfikatorze) udział
    `podzial`, kolejne resztę po równo.
    """
    run = get_run(run_id)
    graph = map_enm_to_network_graph(EnergyNetworkModel.model_validate(run.snapshot))
    slack = sorted(nid for nid, n in graph.nodes.items() if n.node_type == NodeType.SLACK)[0]
    ybus, idx = ybus_from_network_graph(graph, 100.0, slack)
    n = ybus.shape[0]
    theta = np.zeros(n)
    v = np.ones(n)
    g = ybus.real
    b = ybus.imag
    slack_index = idx[slack]
    grupy: dict[int, list[str]] = {}
    for node_id in sorted(idx):
        grupy.setdefault(idx[node_id], []).append(node_id)
    out: list[dict[str, Any]] = []
    for node_id in idx:
        out.append({"meas_type": "V_MAGNITUDE", "bus_ref": node_id, "value": 1.0, "sigma": 0.004})
    for node_id, i in idx.items():
        if i == slack_index:
            continue
        grupa = grupy[i]
        if len(grupa) == 1:
            udzial = 1.0
        elif node_id == grupa[0]:
            udzial = podzial
        else:
            udzial = (1.0 - podzial) / (len(grupa) - 1)
        for rodzaj, h in (("P_INJECTION", _h_injection_p), ("Q_INJECTION", _h_injection_q)):
            out.append(
                {
                    "meas_type": rodzaj,
                    "bus_ref": node_id,
                    "value": udzial * h(g, b, v, theta, i),
                    "sigma": 0.008,
                }
            )
    return out


def _grupa_scalona(run_id) -> list[str]:
    """Węzły sieci wzorcowej połączone zamkniętym łącznikiem (wspólny indeks Y-bus)."""
    run = get_run(run_id)
    graph = map_enm_to_network_graph(EnergyNetworkModel.model_validate(run.snapshot))
    slack = sorted(nid for nid, n in graph.nodes.items() if n.node_type == NodeType.SLACK)[0]
    _ybus, idx = ybus_from_network_graph(graph, 100.0, slack)
    grupy: dict[int, list[str]] = {}
    for node_id in sorted(idx):
        grupy.setdefault(idx[node_id], []).append(node_id)
    wielowezlowe = [g for g in grupy.values() if len(g) > 1]
    assert len(wielowezlowe) == 1, "sieć wzorcowa ma jeden zamknięty łącznik między szynami"
    return wielowezlowe[0]


# --------------------------------------------------------------------------
# Wymagane wejścia (mapa węzeł→indeks)
# --------------------------------------------------------------------------


def test_requirements_endpoint_returns_node_index_map(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.get(REQUIREMENTS, params={"run_id": str(run_id)})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["analysis_id"] == str(run_id)
    # Stany = węzły ELEKTRYCZNE (węzły połączone zamkniętym łącznikiem dzielą indeks);
    # lista wymagań wymienia każdy węzeł sieci z indeksem jego węzła elektrycznego.
    assert data["n_buses"] == len({b["index"] for b in data["buses"]})
    assert data["n_states"] == (data["n_buses"] - 1) + data["n_buses"]
    assert data["min_measurements"] == data["n_states"]
    slack_rows = [b for b in data["buses"] if b["is_slack"]]
    assert len(slack_rows) == 1
    assert slack_rows[0]["bus_ref"] == data["slack_bus_ref"]
    assert {"V_MAGNITUDE", "P_INJECTION", "P_FLOW"} <= {
        t["code"] for t in data["measurement_types"]
    }


def test_requirements_wrong_analysis_type_returns_422(app_client) -> None:
    run_id = _sc_run_id()
    resp = app_client.get(REQUIREMENTS, params={"run_id": str(run_id)})
    assert resp.status_code == 422
    assert "rozpływu mocy" in resp.json()["detail"]


def test_requirements_unknown_run_returns_404(app_client) -> None:
    resp = app_client.get(REQUIREMENTS, params={"run_id": str(uuid4())})
    assert resp.status_code == 404


# --------------------------------------------------------------------------
# Estymacja stanu WLS
# --------------------------------------------------------------------------


def test_state_estimation_returns_view(app_client) -> None:
    run_id = _pf_run_id()
    body = {"run_id": str(run_id), "pomiary": _flat_measurements(run_id)}
    resp = app_client.post(STATE_ESTIMATION, json=body)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["analysis_id"] == str(run_id)
    assert data["converged"] is True
    assert data["status"] == "ZBIEZNY"
    # Estymowany stan per węzeł: |V|/kąt. RE-BASELINE 6 → 5 (V12K-184): sieć
    # wzorcowa ma 5 szyn, a szósty węzeł był WIRTUALNĄ ZIEMIĄ źródła, tworzoną
    # przez mapowanie ENM→graf. Zasilanie systemowe jest teraz bocznikiem
    # Y_Q = 1/Z_Q w węźle przyłączenia (IEC 60909-0 §3.2), więc estymator
    # raportuje wyłącznie węzły istniejące w modelu — bez fikcyjnego wiersza.
    assert len(data["buses"]) == 5
    for bus in data["buses"]:
        assert 0.99 <= bus["v_magnitude_pu"] <= 1.01
        assert "v_angle_deg" in bus and "v_angle_rad" in bus
    # χ² i stopnie swobody obecne (audytowalność).
    assert data["objective_j"] < 1e-6
    assert data["degrees_of_freedom"] == data["m_measurements"] - data["n_states"]
    assert data["bad_data"]["chi_square_flag"] is False
    # WHITE BOX: ślad iteracji z Jacobianem H i macierzą zysku G.
    assert data["white_box"]
    assert "h_jacobian" in data["white_box"][0]
    assert "gain_matrix_g" in data["white_box"][0]
    # Jawny znacznik SYNTETYCZNEJ walidacji (nie mylić z SCADA/PMU).
    assert "SYNTETYCZNY" in data["validation_status"]


def test_state_estimation_residual_present_without_trace(app_client) -> None:
    """Rezyduum r per pomiar obecne BEZ śladu WHITE BOX (WLS-S1/S2).

    Kolumna „Rezyduum r" nie może zależeć od włączenia śladu — pochodzi z pola
    wyniku ``final_residuals`` (ten sam wektor co znormalizowane rezydua bad_data).
    """
    run_id = _pf_run_id()
    body = {
        "run_id": str(run_id),
        "pomiary": _flat_measurements(run_id),
        "include_trace": False,
    }
    resp = app_client.post(STATE_ESTIMATION, json=body)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert not data.get("white_box"), "Ślad wyłączony (include_trace=False)"
    # Mimo braku śladu każdy pomiar ma liczbowe rezyduum r (nie None).
    assert data["measurements"]
    for m in data["measurements"]:
        assert m["residual"] is not None
        assert isinstance(m["residual"], int | float)
        assert m["normalized_residual"] is not None


def test_state_estimation_is_deterministic(app_client) -> None:
    run_id = _pf_run_id()
    body = {"run_id": str(run_id), "pomiary": _flat_measurements(run_id)}
    first = app_client.post(STATE_ESTIMATION, json=body).json()
    second = app_client.post(STATE_ESTIMATION, json=body).json()
    assert first == second
    assert first["estimate_id"] == second["estimate_id"]


def test_state_estimation_detects_gross_error(app_client) -> None:
    run_id = _pf_run_id()
    pomiary = _flat_measurements(run_id)
    # Wstrzyknij gross error do pierwszego pomiaru |V| (1.0 → 1.05, ~12.5σ).
    # Uwaga: znormalizowana rezydua "rozmywa się" na pomiary dźwigniowe (efekt
    # smearing WLS), więc nie zakładamy, że podejrzany = wstrzyknięty pomiar.
    pomiary[0] = {**pomiary[0], "value": 1.05}
    resp = app_client.post(STATE_ESTIMATION, json={"run_id": str(run_id), "pomiary": pomiary})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    bad = data["bad_data"]
    assert bad["chi_square_flag"] is True
    assert bad["lnr_flag"] is True
    assert bad["lnr_measurement"] is not None
    # Podejrzany pomiar oznaczony w tabeli pomiarów.
    suspects = [m for m in data["measurements"] if m["suspect"]]
    assert len(suspects) == 1


def test_state_estimation_no_measurements_returns_422(app_client) -> None:
    run_id = _pf_run_id()
    resp = app_client.post(STATE_ESTIMATION, json={"run_id": str(run_id), "pomiary": []})
    assert resp.status_code == 422
    assert "Brak pomiarów" in resp.json()["detail"]


def test_state_estimation_underdetermined_returns_422(app_client) -> None:
    run_id = _pf_run_id()
    # Tylko jeden pomiar |V| — m < n ⇒ nieobserwowalny.
    pomiary = _flat_measurements(run_id)[:1]
    resp = app_client.post(STATE_ESTIMATION, json={"run_id": str(run_id), "pomiary": pomiary})
    assert resp.status_code == 422
    assert "niedookreślony" in resp.json()["detail"] or "obserwowaln" in resp.json()["detail"]


def test_state_estimation_unknown_bus_ref_returns_422(app_client) -> None:
    run_id = _pf_run_id()
    pomiary = [
        {"meas_type": "V_MAGNITUDE", "bus_ref": "nieistniejacy", "value": 1.0, "sigma": 0.01}
    ]
    resp = app_client.post(STATE_ESTIMATION, json={"run_id": str(run_id), "pomiary": pomiary})
    assert resp.status_code == 422
    # Partia integracji 10: identyfikator wskazania w polu strukturalnym `dane`, treść bez niego.
    body = resp.json()
    assert body["detail"] == "Pomiar odnosi się do węzła, którego nie ma w modelu sieci."
    assert body["kod"] == "estymacja.pomiar_wezla_spoza_modelu"
    assert body["dane"] == {"element_ref": "nieistniejacy"}


def test_state_estimation_wrong_analysis_type_returns_422(app_client) -> None:
    run_id = _sc_run_id()
    resp = app_client.post(STATE_ESTIMATION, json={"run_id": str(run_id), "pomiary": []})
    assert resp.status_code == 422
    assert "rozpływu mocy" in resp.json()["detail"]


def test_state_estimation_unknown_run_returns_404(app_client) -> None:
    resp = app_client.post(STATE_ESTIMATION, json={"run_id": str(uuid4()), "pomiary": []})
    assert resp.status_code == 404


# --------------------------------------------------------------------------
# Węzły połączone zamkniętym łącznikiem = jeden węzeł elektryczny (scalenie łączników)
# Cechy iloczynu: rodzaj pomiaru {|V|, iniekcja P/Q, przepływ} × położenie {węzeł zwykły,
# węzeł grupy scalonej, para wewnątrz grupy, para bez gałęzi} × kompletność grupy
# {pełna, częściowa, podwójna}.
# --------------------------------------------------------------------------


def test_requirements_wezly_scalone_dziela_indeks(app_client) -> None:
    run_id = _pf_run_id()
    grupa = _grupa_scalona(run_id)
    data = app_client.get(REQUIREMENTS, params={"run_id": str(run_id)}).json()
    indeksy = {b["bus_ref"]: b["index"] for b in data["buses"]}
    assert len(indeksy) == 5, "każdy węzeł sieci jest na liście wymagań"
    assert len({indeksy[w] for w in grupa}) == 1
    assert data["n_buses"] == len(set(indeksy.values())) == 4


def test_wynik_wymienia_kazdy_wezel_z_napieciem_wezla_elektrycznego(app_client) -> None:
    run_id = _pf_run_id()
    grupa = _grupa_scalona(run_id)
    body = {"run_id": str(run_id), "pomiary": _flat_measurements(run_id, podzial=0.3)}
    data = app_client.post(STATE_ESTIMATION, json=body).json()
    wezly = {b["bus_ref"]: b for b in data["buses"]}
    assert len(wezly) == 5
    pierwszy, drugi = (wezly[w] for w in grupa)
    assert pierwszy["index"] == drugi["index"]
    assert pierwszy["v_magnitude_pu"] == drugi["v_magnitude_pu"]
    assert pierwszy["v_angle_rad"] == drugi["v_angle_rad"]
    assert not data["missing_data"]


def test_iniekcje_grupy_scalonej_to_jeden_pomiar_sumy(app_client) -> None:
    """Podział iniekcji między węzły grupy nie zmienia stanu: estymator widzi sumę.

    Bez sumowania dwie składowe trafiałyby na ten sam indeks jako dwa pomiary tej samej
    iniekcji węzła elektrycznego (0,3·P i 0,7·P zamiast P) — estymacja rozjeżdża się
    z podziałem (wstrzyknięta regresja: test czerwony).
    """
    run_id = _pf_run_id()
    grupa = _grupa_scalona(run_id)
    cala = app_client.post(
        STATE_ESTIMATION,
        json={"run_id": str(run_id), "pomiary": _flat_measurements(run_id, podzial=1.0)},
    ).json()
    czesc = app_client.post(
        STATE_ESTIMATION,
        json={"run_id": str(run_id), "pomiary": _flat_measurements(run_id, podzial=0.3)},
    ).json()
    assert cala["m_measurements"] == czesc["m_measurements"]
    for a, b in zip(cala["buses"], czesc["buses"], strict=True):
        assert a["bus_ref"] == b["bus_ref"]
        assert abs(a["v_magnitude_pu"] - b["v_magnitude_pu"]) < 1e-12
        assert abs(a["v_angle_rad"] - b["v_angle_rad"]) < 1e-12
    assert czesc["objective_j"] < 1e-12
    sumy = [m for m in czesc["measurements"] if m.get("bus_refs_skladowe")]
    assert {m["meas_type"] for m in sumy} == {"P_INJECTION", "Q_INJECTION"}
    for pomiar in sumy:
        assert pomiar["bus_refs_skladowe"] == grupa
        assert pomiar["sigma"] == pytest.approx(0.008 * np.sqrt(2.0), rel=1e-15)


@pytest.mark.parametrize("wada", ["brak_skladowej", "podwojna_skladowa"])
def test_iniekcja_czesci_grupy_scalonej_to_odmowa(app_client, wada: str) -> None:
    run_id = _pf_run_id()
    grupa = _grupa_scalona(run_id)
    pomiary = _flat_measurements(run_id, podzial=0.3)
    pozycja = next(
        i
        for i, p in enumerate(pomiary)
        if p["meas_type"] == "P_INJECTION" and p["bus_ref"] == grupa[1]
    )
    if wada == "brak_skladowej":
        del pomiary[pozycja]
    else:
        pomiary.append(dict(pomiary[pozycja]))
    resp = app_client.post(STATE_ESTIMATION, json={"run_id": str(run_id), "pomiary": pomiary})
    assert resp.status_code == 422, resp.text
    body = resp.json()
    assert body["kod"] == "estymacja.pomiar_iniekcji_czesci_wezla_scalonego"
    assert body["dane"]["rodzaj_pomiaru"] == "P_INJECTION"
    if wada == "brak_skladowej":
        assert body["dane"]["wezly_bez_pomiaru"] == [grupa[1]]
        assert body["dane"]["wezly_z_wieloma_pomiarami"] == []
    else:
        assert body["dane"]["wezly_bez_pomiaru"] == []
        assert body["dane"]["wezly_z_wieloma_pomiarami"] == [grupa[1]]


def _galezie_sieci(run_id) -> list[tuple[str, str]]:
    run = get_run(run_id)
    graph = map_enm_to_network_graph(EnergyNetworkModel.model_validate(run.snapshot))
    return sorted((b.from_node_id, b.to_node_id) for b in graph.branches.values())


def test_przeplyw_galezi_z_wezla_scalonego_przyjety(app_client) -> None:
    """Gałąź z węzła grupy do węzła zwykłego, jedyna między węzłami elektrycznymi: dokładnie."""
    run_id = _pf_run_id()
    grupa = _grupa_scalona(run_id)
    od, do = next(
        (a, b)
        for a, b in _galezie_sieci(run_id)
        if (a in grupa) != (b in grupa)
        and sum(1 for x, y in _galezie_sieci(run_id) if {x, y} & {b} and {x, y} & set(grupa)) == 1
    )
    pomiary = _flat_measurements(run_id)
    for rodzaj in ("P_FLOW", "Q_FLOW"):
        pomiary.append(
            {"meas_type": rodzaj, "bus_ref": do, "bus_j_ref": od, "value": 0.0, "sigma": 0.01}
        )
    resp = app_client.post(STATE_ESTIMATION, json={"run_id": str(run_id), "pomiary": pomiary})
    assert resp.status_code == 200, resp.text
    assert resp.json()["objective_j"] < 1e-6


@pytest.mark.parametrize("przypadek", ["wewnatrz_grupy", "bez_galezi", "inny_czlonek_grupy"])
def test_przeplyw_niebedacy_funkcja_stanu_to_odmowa(app_client, przypadek: str) -> None:
    run_id = _pf_run_id()
    grupa = _grupa_scalona(run_id)
    galezie = _galezie_sieci(run_id)
    if przypadek == "wewnatrz_grupy":
        od, do = grupa
        kod = "estymacja.pomiar_przeplywu_w_wezle_scalonym"
    elif przypadek == "bez_galezi":
        wezly = sorted({w for para in galezie for w in para})
        od, do = next(
            (a, b)
            for a in wezly
            for b in wezly
            if a < b
            and a not in grupa
            and b not in grupa
            and (a, b) not in galezie
            and (b, a) not in galezie
        )
        kod = "estymacja.pomiar_przeplywu_bez_galezi"
    else:
        # Gałąź z członka A grupy do węzła Z; pomiar wskazuje członka B → Z (brak takiej gałęzi).
        a, z = next((x, y) for x, y in galezie if (x in grupa) != (y in grupa))
        czlonek = a if a in grupa else z
        obcy = z if a in grupa else a
        od = next(w for w in grupa if w != czlonek)
        do = obcy
        kod = "estymacja.pomiar_przeplywu_czesci_polaczenia_scalonego"
    pomiary = _flat_measurements(run_id) + [
        {"meas_type": "P_FLOW", "bus_ref": od, "bus_j_ref": do, "value": 0.0, "sigma": 0.01}
    ]
    resp = app_client.post(STATE_ESTIMATION, json={"run_id": str(run_id), "pomiary": pomiary})
    assert resp.status_code == 422, resp.text
    body = resp.json()
    assert body["kod"] == kod
    assert body["dane"] == {"element_ref": od, "element_ref_do": do}


def test_przeplyw_czesci_galezi_rownoleglych_przez_laczniki_to_odmowa() -> None:
    """Dwie gałęzie X–Z i Y–Z, X i Y scalone: pomiar X→Z to część przepływu węzłów I–Z."""
    from application.analyses.state_estimation.service import _parse_measurements
    from network_model.odmowa_danych import OdmowaNazwana

    indeksy = {"X": 0, "Y": 0, "Z": 1}
    galezie = (("X", "Z"), ("Y", "Z"))
    pomiar = {"meas_type": "P_FLOW", "bus_ref": "X", "bus_j_ref": "Z", "value": 0.1}
    with pytest.raises(OdmowaNazwana) as odmowa:
        _parse_measurements([{**pomiar, "sigma": 0.01}], indeksy, galezie)
    assert odmowa.value.kod == "estymacja.pomiar_przeplywu_czesci_polaczenia_scalonego"
    # Ta sama para, gdy jedyną gałęzią węzłów elektrycznych jest X–Z: pomiar przyjęty.
    zestaw, opisy = _parse_measurements([{**pomiar, "sigma": 0.01}], indeksy, (("X", "Z"),))
    assert [m.bus_i for m in zestaw.measurements] == [0]
    assert [m.bus_j for m in zestaw.measurements] == [1]
    assert opisy[0]["bus_ref"] == "X"
