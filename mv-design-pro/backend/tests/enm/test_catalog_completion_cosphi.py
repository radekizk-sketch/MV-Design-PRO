"""Domyślne odbiory nN stacji: moc bierna z tabliczki katalogowej (defekt D7).

Do naprawy `complete_station_loads_from_nn_feeders` dokładał do każdego odpływu
nN stacji odbiór z pozycji katalogowej `load_uslugi_30kw` (cosφ = 0,92) i
zapisywał mu `q_mvar = 0.0`. Rekord twierdził „parametry z katalogu" i niósł
cosφ 0,92 w `materialized_params` oraz `meta`, a do rozpływu szło cosφ = 1,0 —
mapowanie ENM→solver czyta wyłącznie `Load.q_mvar`. Skutek: spadek napięcia na
szynie nN zaniżony ~2,6× na KAŻDEJ stacji z kreatora. To ta sama klasa defektu,
którą V12K-050 nazwał „phantom cosφ" i zamknął dla `add_nn_load`.

Testy pilnują trzech rzeczy naraz:
  * arytmetyki tabliczkowej (hierarchia źródeł Q: jawne q_kvar → cosφ → brak),
  * śladu WHITE BOX (skąd Q się wzięło — widoczne w `materialized_params`),
  * skutku liczbowego w kanonicznym rozpływie na sieci referencyjnej audytu.
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from enm.canonical_analysis import (
    _graph_id_from_ref,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.catalog_completion import (
    DEFAULT_LOAD_CATALOG_REF,
    DEFAULT_LOAD_COS_PHI,
    DEFAULT_LOAD_KW,
    Q_SOURCE_CATALOG_COS_PHI,
    Q_SOURCE_CATALOG_NO_REACTIVE,
    Q_SOURCE_CATALOG_Q_KVAR,
    _catalog_load_reactive_power,
    complete_catalog_defaults,
    complete_station_loads_from_nn_feeders,
)
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.store import get_enm, reset_enm_store, set_enm
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import LoadType

from tests.utils.determinism import fingerprint, scrub_dynamic

CATALOG_LINE_70 = "line-base-al-st-70"
CATALOG_TRAFO_630 = "tr-sn-nn-15-04-630kva-dyn11"
CATALOG_ZRODLO_250 = "src-gpz-15kv-250mva-rx010"
CATALOG_FIELD_APPARATUS = "sw-cb-abb-vd4-17kv-630a"

#: Wartość zmierzona sondą audytu na sieci referencyjnej PO wyprowadzeniu Q z
#: katalogowego cosφ (AUDYT_SZCZYTU_2026-08-01, defekt D7, pomiar kontrolny).
V_PU_SZYNY_NN_OCZEKIWANE = 0.99516
#: Wartość SPRZED naprawy (Q = 0) — musi być nieosiągalna, inaczej regresja
#: phantomu przeszłaby niezauważona.
V_PU_SZYNY_NN_SPRZED_NAPRAWY = 0.99813
TOLERANCJA_V_PU = 1e-4


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch: pytest.MonkeyPatch, tmp_path: Any) -> Any:
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
    reset_enm_store()
    reset_canonical_runs()
    yield
    reset_enm_store()
    reset_canonical_runs()


# ---------------------------------------------------------------------------
# Sieć referencyjna audytu: GPZ → 2 odcinki magistrali → stacja SN/nN z 3 odpływami
# ---------------------------------------------------------------------------


def _op(snap: dict[str, Any], name: str, payload: dict[str, Any]) -> dict[str, Any]:
    result = execute_domain_operation(snap, name, payload)
    assert not result.get("error"), (
        f"Operacja '{name}' zwróciła błąd: {result.get('error')} "
        f"(code={result.get('error_code')})"
    )
    return result["snapshot"]


def _siec_referencyjna(nazwa: str, *, liczba_odplywow_nn: int = 3) -> dict[str, Any]:
    snap = EnergyNetworkModel(
        header=ENMHeader(name=nazwa, defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")
    snap = _op(
        snap,
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": CATALOG_ZRODLO_250},
    )
    for _ in range(2):
        snap = _op(
            snap,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "LINIA_NAPOWIETRZNA",
                    "dlugosc_m": 500.0,
                    "catalog_ref": CATALOG_LINE_70,
                }
            },
        )
    segment_id = next(b["ref_id"] for b in snap["branches"] if b.get("type") == "line_overhead")
    return _op(
        snap,
        "insert_station_on_segment_sn",
        {
            "segment_id": segment_id,
            "field_apparatus_catalog_ref": CATALOG_FIELD_APPARATUS,
            "station": {"name": "Stacja S1", "station_type": "inline", "nn_voltage_kv": 0.4},
            "transformer": {"transformer_catalog_ref": CATALOG_TRAFO_630},
            "nn_voltage_kv": 0.4,
            "nn_block": {"outgoing_feeders_nn_count": liczba_odplywow_nn},
        },
    )


def _model_z_odbiorami(nazwa: str) -> EnergyNetworkModel:
    enm = EnergyNetworkModel.model_validate(_siec_referencyjna(nazwa))
    completed, changed = complete_catalog_defaults(enm)
    assert changed, "Migracja katalogowa nie dołożyła odbiorów nN — sieć referencyjna nietrafiona."
    return completed


def _szyna_nn(enm: EnergyNetworkModel) -> str:
    szyny = [b.ref_id for b in enm.buses if b.voltage_kv is not None and b.voltage_kv < 1.0]
    assert len(szyny) == 1, f"Oczekiwano jednej szyny nN, jest {szyny}."
    return szyny[0]


def _v_pu(run: Any, bus_ref: str) -> float:
    assert run.status == "FINISHED", run.error_message
    wyniki = {b["bus_id"]: b for b in run.raw_result["result_v1"]["bus_results"]}
    return float(wyniki[_graph_id_from_ref(bus_ref)]["v_pu"])


# ---------------------------------------------------------------------------
# (a) Arytmetyka tabliczkowa — hierarchia źródeł mocy biernej
# ---------------------------------------------------------------------------


def test_pozycja_katalogowa_trzyma_deklarowany_parytet_p_i_cos_phi() -> None:
    """Moduł i katalog muszą mówić to samo o tabliczce domyślnego odbioru.

    Intencja: cosφ nie może znów zacząć żyć w dwóch miejscach naraz — to z tego
    rozjazdu wziął się defekt D7. Wartością roboczą jest katalog, a ta bramka
    pilnuje, że deklaracja modułu (`DEFAULT_LOAD_*`) za nim nadąża.
    """
    load_type = get_default_mv_catalog().get_load_type(DEFAULT_LOAD_CATALOG_REF)

    assert load_type is not None
    assert load_type.p_kw == DEFAULT_LOAD_KW
    assert load_type.cos_phi == DEFAULT_LOAD_COS_PHI


def test_moc_bierna_wyprowadzona_z_katalogowego_cos_phi() -> None:
    """Q = P·tan(arccos cosφ) — dokładnie, bez zaokrągleń i bez heurystyk."""
    p_mw = DEFAULT_LOAD_KW / 1000.0
    load_type = get_default_mv_catalog().get_load_type(DEFAULT_LOAD_CATALOG_REF)
    assert load_type is not None
    assert load_type.q_kvar is None, "Pozycja katalogowa nie może podawać Q jawnie w tym teście."
    assert load_type.cos_phi == 0.92

    rozwiazanie = _catalog_load_reactive_power(load_type, p_mw)

    assert rozwiazanie is not None
    q_mvar, zrodlo = rozwiazanie
    assert q_mvar == pytest.approx(p_mw * math.tan(math.acos(0.92)), abs=1e-9)
    assert q_mvar > 0.0, "Odbiór indukcyjny pobiera moc bierną — Q musi być dodatnie."
    assert zrodlo == Q_SOURCE_CATALOG_COS_PHI


def test_jawne_q_kvar_katalogu_wygrywa_nad_wyprowadzeniem_z_cos_phi() -> None:
    """Pozycja z jawnym Q (np. `load_przem_75kw`: 28 kvar) nie jest przeliczana."""
    load_type = get_default_mv_catalog().get_load_type("load_przem_75kw")
    assert load_type is not None
    assert load_type.q_kvar == 28.0
    assert load_type.cos_phi == 0.94

    rozwiazanie = _catalog_load_reactive_power(load_type, 0.075)

    assert rozwiazanie is not None
    q_mvar, zrodlo = rozwiazanie
    assert q_mvar == pytest.approx(0.028, abs=1e-12)
    assert q_mvar != pytest.approx(0.075 * math.tan(math.acos(0.94)), abs=1e-6)
    assert zrodlo == Q_SOURCE_CATALOG_Q_KVAR


def test_jawny_kanon_katalogu_bez_mocy_biernej_daje_zero() -> None:
    """`cos_phi_mode == "BRAK"` to JAWNA deklaracja katalogu, nie cisza."""
    load_type = LoadType(id="probny", name="Probny", p_kw=30.0, cos_phi=None, cos_phi_mode="BRAK")

    rozwiazanie = _catalog_load_reactive_power(load_type, 0.03)

    assert rozwiazanie == (0.0, Q_SOURCE_CATALOG_NO_REACTIVE)


def test_brak_q_i_cos_phi_nie_daje_cichego_zera() -> None:
    """Brak kanonu katalogu ⇒ brak rozstrzygnięcia (None), nigdy Q = 0."""
    assert _catalog_load_reactive_power(None, 0.03) is None
    bez_danych = LoadType(id="probny", name="Probny", p_kw=30.0, cos_phi=None, cos_phi_mode="IND")
    assert _catalog_load_reactive_power(bez_danych, 0.03) is None
    zly_cos_phi = LoadType(id="probny", name="Probny", p_kw=30.0, cos_phi=0.0, cos_phi_mode="IND")
    assert _catalog_load_reactive_power(zly_cos_phi, 0.03) is None


def test_odbior_nie_powstaje_gdy_katalog_nie_rozstrzyga_mocy_biernej(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Zamiast fabrykować Q = 0, migracja nie dokłada odbioru w ogóle."""
    enm = EnergyNetworkModel.model_validate(_siec_referencyjna("bez-kanonu-katalogu"))
    assert not enm.loads

    bez_mocy_biernej = LoadType(
        id=DEFAULT_LOAD_CATALOG_REF, name="Bez Q", p_kw=30.0, cos_phi=None, cos_phi_mode="IND"
    )
    katalog = get_default_mv_catalog()
    monkeypatch.setattr(
        type(katalog), "get_load_type", lambda self, type_id: bez_mocy_biernej, raising=True
    )

    completed, changed = complete_station_loads_from_nn_feeders(enm)

    assert changed is False
    assert completed.loads == []


def test_odbiory_stacji_dostaja_moc_bierna_z_katalogu() -> None:
    """Trzy odpływy nN ⇒ trzy odbiory, każdy z Q wyprowadzonym z cosφ 0,92."""
    completed = _model_z_odbiorami("odbiory-stacji")

    assert len(completed.loads) == 3
    oczekiwane_q = (DEFAULT_LOAD_KW / 1000.0) * math.tan(math.acos(0.92))
    for load in completed.loads:
        assert load.catalog_ref == DEFAULT_LOAD_CATALOG_REF
        assert load.p_mw == pytest.approx(0.03, abs=1e-12)
        assert load.q_mvar == pytest.approx(oczekiwane_q, abs=1e-9)
        assert load.meta["cos_phi_mode"] == "IND"


# ---------------------------------------------------------------------------
# (c) Ślad WHITE BOX materializacji
# ---------------------------------------------------------------------------


def test_materialized_params_pokazuje_skad_wzielo_sie_q() -> None:
    completed = _model_z_odbiorami("slad-materializacji")

    load = completed.loads[0]
    materialized = load.materialized_params or {}
    assert materialized["catalog_item_id"] == DEFAULT_LOAD_CATALOG_REF
    assert materialized["p_kw"] == DEFAULT_LOAD_KW
    assert materialized["cos_phi"] == 0.92
    assert materialized["cos_phi_mode"] == "IND"
    assert materialized["q_source"] == Q_SOURCE_CATALOG_COS_PHI
    assert materialized["q_kvar"] == pytest.approx(load.q_mvar * 1000.0, abs=1e-9)


# ---------------------------------------------------------------------------
# (b) Skutek liczbowy w kanonicznym rozpływie — sieć referencyjna audytu
# ---------------------------------------------------------------------------


def test_rozplyw_na_sieci_referencyjnej_daje_pelny_spadek_napiecia_nn() -> None:
    completed = _model_z_odbiorami("rozplyw-referencyjny")
    bus_nn = _szyna_nn(completed)
    set_enm("case-d7-pf", completed)

    run = execute_run(create_run(case_id="case-d7-pf", analysis_type="PF").id)
    v_pu = _v_pu(run, bus_nn)

    assert v_pu == pytest.approx(V_PU_SZYNY_NN_OCZEKIWANE, abs=TOLERANCJA_V_PU)
    # Regresja phantomu: wartość sprzed naprawy (rachunek z cosφ = 1,0) musi być
    # poza pasmem tolerancji — inaczej test przechodziłby dla obu zachowań.
    assert abs(v_pu - V_PU_SZYNY_NN_SPRZED_NAPRAWY) > TOLERANCJA_V_PU


def test_szyna_nn_pobiera_moc_bierna_odbiorow() -> None:
    completed = _model_z_odbiorami("rozplyw-moc-bierna")
    set_enm("case-d7-q", completed)

    run = execute_run(create_run(case_id="case-d7-q", analysis_type="PF").id)
    wyniki = {b["bus_id"]: b for b in run.raw_result["result_v1"]["bus_results"]}

    # P0.1 nN (LV-INV-12): `create_run` czyta model przez `get_enm`, który
    # promuje KAŻDY wpis `nn_field_specs` do WŁASNEGO aparatu odpływowego —
    # trzy odbiory dołożone migracją katalogową (defekt D7) NIE SĄ już
    # zagregowane na jednej szynie stacji: każdy przenosi się za SWÓJ aparat,
    # na WŁASNĄ (nową) szynę odpływu. Sumujemy moc wstrzykiwaną na tych trzech
    # szynach — fizyka odbiorów (P, Q z katalogowego cosφ) jest identyczna,
    # zmieniła się WYŁĄCZNIE topologia (bus_ref odbioru), którą sprawdza
    # `tests/enm/test_nn_field_specs_promocja.py`.
    promowany = get_enm("case-d7-q")
    assert (
        len(promowany.loads) == 3
    ), "Oczekiwano trzech odbiorów nN dołożonych migracją katalogową."
    szyny_odbiorow_graph_id = {_graph_id_from_ref(load.bus_ref) for load in promowany.loads}
    assert len(szyny_odbiorow_graph_id) == 3, "Odbiory powinny trafić na TRZY różne szyny odpływów."

    p_calkowite = sum(float(wyniki[gid]["p_injected_mw"]) for gid in szyny_odbiorow_graph_id)
    q_calkowite = sum(float(wyniki[gid]["q_injected_mvar"]) for gid in szyny_odbiorow_graph_id)

    assert p_calkowite == pytest.approx(-0.09, abs=1e-9)
    assert q_calkowite == pytest.approx(
        -3 * (DEFAULT_LOAD_KW / 1000.0) * math.tan(math.acos(0.92)), abs=1e-9
    )


# ---------------------------------------------------------------------------
# (d) Determinizm: dwukrotny bieg SC + PF na tej samej sieci
# ---------------------------------------------------------------------------


def test_dwukrotny_bieg_sc_i_pf_daje_identyczne_odciski() -> None:
    completed = _model_z_odbiorami("determinizm")
    set_enm("case-d7-det", completed)

    # `proof_ref` to skrót zawierający `run_id` (canonical_analysis
    # `_power_flow_proof_ref`), więc jest tożsamością BIEGU, nie wyniku —
    # czyścimy go razem ze znacznikami czasu i identyfikatorami.
    klucze_biegu = ("created_at", "created_at_utc", "timestamp", "id", "run_id", "proof_ref")

    odciski: list[tuple[str, str]] = []
    for _ in range(2):
        pf = execute_run(create_run(case_id="case-d7-det", analysis_type="PF").id)
        sc = execute_run(create_run(case_id="case-d7-det", analysis_type="short_circuit_sn").id)
        assert pf.status == "FINISHED", pf.error_message
        assert sc.status == "FINISHED", sc.error_message
        odciski.append(
            (
                fingerprint(scrub_dynamic(pf.raw_result, keys=klucze_biegu)),
                fingerprint(scrub_dynamic(sc.raw_result, keys=klucze_biegu)),
            )
        )

    assert odciski[0] == odciski[1]


def test_materializacja_odbiorow_jest_powtarzalna() -> None:
    pierwszy = _model_z_odbiorami("powtarzalnosc-1")
    drugi = _model_z_odbiorami("powtarzalnosc-1")

    assert [(load.ref_id, load.p_mw, load.q_mvar) for load in pierwszy.loads] == [
        (load.ref_id, load.p_mw, load.q_mvar) for load in drugi.loads
    ]
