"""Wkłady źródeł do prądu zwarciowego na ŚCIEŻCE UŻYTKOWNIKA (karta WKLAD-ZRODLA).

Ścieżka: projekt + przypadek przez API → model GPZ H5 (dwa tory zasilania na dwóch
sekcjach, sprzęgło szyn, generator synchroniczny na sekcji B, farma PV na polu) → bieg
zwarciowy `POST …/runs` + wykonanie → wiersze wyniku → rozpływ punktu
`GET …/short-circuit/rozplyw` (obliczenie na żądanie, utrwalane obok biegu).

Iloczyn cech: sprzęgło {otwarte, zamknięte} × rodzaj zwarcia {3F, 1F, 2F, 2F+Z} ×
scenariusz {MAX, MIN} × punkt zwarcia (każda szyna). Asercje: zbiór wpisów = źródła modelu
(odnośniki ENM, nie identyfikatory grafu), źródło z innej sekcji przy otwartym sprzęgle =
0 z przyczyną, bilans fazorowy projekcji = I_k''(Th) kroku bilansu, falownik poza listą
(stoi per źródło w `contributions` wiersza), drugi odczyt punktu identyczny (tabela).
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from api.main import app
from fastapi.testclient import TestClient
from network_model.solvers.short_circuit_contributions import (
    KLASA_WKLADU_ZRODLA,
    KLASA_WKLADU_ZRODLA_INNA_WYSPA,
    PRZYCZYNA_WKLADU_INNA_WYSPA,
    tolerancja_bilansu_a,
)

from tests.utils.biegi import wykonaj_bieg
from tests.utils.siec_h5_wkladow_zrodel import (
    REF_FALOWNIKA,
    REF_GENERATORA,
    REF_ZRODLA_L1,
    REF_ZRODLA_L2,
    enm_h5,
    fazor,
)

SEKCJA_ZRODLA = {REF_ZRODLA_L1: "bus-a", REF_ZRODLA_L2: "bus-b", REF_GENERATORA: "bus-b"}
#: Sekcja szyny przy otwartym sprzęgle (pole jest za kablem z sekcji A).
SEKCJA_SZYNY = {"bus-a": "bus-a", "bus-pole": "bus-a", "bus-b": "bus-b"}


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


def _przypadek(client: TestClient, *, lacznik_zamkniety: bool) -> str:
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.store import set_enm

    projekt = client.post("/api/projects", json={"name": "GPZ H5 wklady zrodel"})
    assert projekt.status_code == 201, projekt.text
    przypadek = client.post(
        "/api/study-cases", json={"project_id": projekt.json()["id"], "name": "Przypadek"}
    )
    assert przypadek.status_code == 201, przypadek.text
    case_id = str(przypadek.json()["id"])
    set_enm(
        klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory),
        enm_h5(lacznik_zamkniety=lacznik_zamkniety, maszyna=True, falownik=True),
    )
    return case_id


@pytest.mark.parametrize("scenariusz", ["max", "min"])
@pytest.mark.parametrize("rodzaj", ["SC_3F", "SC_1F", "SC_2F", "SC_2F_G"])
@pytest.mark.parametrize("lacznik_zamkniety", [False, True], ids=["sprzeglo_otwarte", "zamkniete"])
def test_wklady_zrodel_w_rozplywie_punktu(
    client: TestClient, lacznik_zamkniety: bool, rodzaj: str, scenariusz: str
) -> None:
    case_id = _przypadek(client, lacznik_zamkniety=lacznik_zamkniety)
    utworz = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": rodzaj, "solver_input": {"scenario": scenariusz}},
    )
    assert utworz.status_code == 201, utworz.text
    run_id = utworz.json()["id"]
    wykonanie = wykonaj_bieg(client, run_id)
    assert wykonanie.status_code == 200 and wykonanie.json()["status"] == "DONE", wykonanie.text

    wiersze = client.get(f"/api/analysis-runs/{run_id}/results/short-circuit").json()["rows"]
    assert {w["element_id"] for w in wiersze} == {"bus-a", "bus-b", "bus-pole"}
    for wiersz in wiersze:
        adres = f"/api/analysis-runs/{run_id}/results/short-circuit/rozplyw"
        odpowiedz = client.get(adres, params={"target_id": wiersz["target_id"]})
        assert odpowiedz.status_code == 200, odpowiedz.text
        rozplyw = odpowiedz.json()
        wpisy = rozplyw["wklady_zrodel"]
        assert [w["source_id"] for w in wpisy] == sorted(SEKCJA_ZRODLA)
        assert REF_FALOWNIKA not in {w["source_id"] for w in wpisy}
        for wpis in wpisy:
            assert wpis["node_id"] == SEKCJA_ZRODLA[wpis["source_id"]]
            inna_sekcja = (
                not lacznik_zamkniety
                and SEKCJA_ZRODLA[wpis["source_id"]] != SEKCJA_SZYNY[wiersz["element_id"]]
            )
            if inna_sekcja:
                assert wpis["klasa"] == KLASA_WKLADU_ZRODLA_INNA_WYSPA
                assert (wpis["i_ka"], wpis["kat_deg"]) == (0.0, None)
                assert wpis["przyczyna"] == PRZYCZYNA_WKLADU_INNA_WYSPA
            else:
                assert wpis["klasa"] == KLASA_WKLADU_ZRODLA
                assert wpis["i_ka"] > 0.0 and wpis["przyczyna"] is None

        (bilans,) = (k for k in rozplyw["wklady_zrodel_slad"] if k["key"] == "wklady_zrodel_bilans")
        assert bilans["result"]["bilans_domkniety"] is True
        ik_th = bilans["inputs"]["ik_thevenin_a"]
        suma = sum((fazor(w["i_ka"] * 1000.0, w["kat_deg"]) for w in wpisy), 0j)
        assert abs(suma - ik_th) <= tolerancja_bilansu_a(ik_th)
        # Drugi odczyt punktu (z tabeli rozpływu) — ta sama treść.
        assert client.get(adres, params={"target_id": wiersz["target_id"]}).json() == rozplyw


def test_wklady_zrodel_obu_torow_odpowiadaja_mocom_zwarciowym(client: TestClient) -> None:
    """Sprzęgło otwarte, zwarcie 3F MAX na szynie każdej sekcji: tor L1 (S″k = 300 MVA)
    daje więcej niż L2 (200 MVA); w sekcji A tor L1 niesie cały prąd części Thevenina."""
    case_id = _przypadek(client, lacznik_zamkniety=False)
    utworz = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "SC_3F", "solver_input": {}},
    )
    run_id = utworz.json()["id"]
    assert wykonaj_bieg(client, run_id).json()["status"] == "DONE"
    wiersze = client.get(f"/api/analysis-runs/{run_id}/results/short-circuit").json()["rows"]
    prad_toru: dict[str, float] = {}
    for wiersz in wiersze:
        if wiersz["element_id"] not in {"bus-a", "bus-b"}:
            continue
        rozplyw = client.get(
            f"/api/analysis-runs/{run_id}/results/short-circuit/rozplyw",
            params={"target_id": wiersz["target_id"]},
        ).json()
        tor = REF_ZRODLA_L1 if wiersz["element_id"] == "bus-a" else REF_ZRODLA_L2
        (wpis,) = (w for w in rozplyw["wklady_zrodel"] if w["source_id"] == tor)
        prad_toru[tor] = wpis["i_ka"]
        # Udział = |I_Q,k|/I_k'' (moduły). Sekcję A przy otwartym sprzęgle zasila z sieci
        # sam tor L1 (+ falownik PV za kablem), więc jego udział to I_k''(Th)/I_k''; sekcję B
        # zasilają tor L2 i generator — suma modułów ≥ moduł sumy (I_k''(Th)).
        wszystkie: list[dict[str, Any]] = rozplyw["wklady_zrodel"]
        (bilans,) = (k for k in rozplyw["wklady_zrodel_slad"] if k["key"] == "wklady_zrodel_bilans")
        wejscia = bilans["inputs"]
        udzial_thevenina = wejscia["ik_thevenin_a"] / wejscia["ik_total_a"]
        if wiersz["element_id"] == "bus-a":
            assert wejscia["ik_inverters_a"] > 0.0
            assert wpis["udzial"] == pytest.approx(udzial_thevenina, rel=1e-12)
        else:
            assert 0.0 < wpis["udzial"] < udzial_thevenina
        assert sum(w["udzial"] for w in wszystkie) >= udzial_thevenina * (1.0 - 1e-12)
    assert prad_toru[REF_ZRODLA_L1] > prad_toru[REF_ZRODLA_L2] > 0.0
