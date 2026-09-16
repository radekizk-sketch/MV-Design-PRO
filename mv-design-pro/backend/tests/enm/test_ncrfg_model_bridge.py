"""Karta S-3 (W6-0): most model → wejście solvera NC RfG i trasa zgodności przypadku.

JEDNA implementacja zgodności NC RfG: `GET /api/ncrfg-tests/cases/{case_id}/compliance`
buduje `NcRfgPtpireeModuleInput` z committed ENM (most `model_bridge.py`) i uruchamia
TEN SAM `NcRfgPtpireeSolver`, co bieg macierzy `POST /api/ncrfg-tests/run`; odpowiedź
= kontrakt biegu macierzy (z polami dowodowymi karty S-1) opakowany per przypadek.

Iloczyn cech (KLASA NIE INSTANCJA, §2 karty): model z {0, 1, N} DER × operator
{znany, nieznany → 404} × dane {kompletne, niekompletne → no_data, certyfikat PTPiREE}
+ parytet `/run` vs `/compliance` dla tego samego DER + pin numeracji T01–T20 (zero
literałów `T1`…`T9` bez wiodącego zera) + pin kompletności mostu wobec kontraktu solvera.
"""

from __future__ import annotations

import re

import pytest
from application.ncrfg_compliance import (
    NcRfgCaseComplianceResponse,
    build_ncrfg_module_input_from_generator,
    build_ncrfg_module_inputs_from_enm,
    certificate_status_z_tabliczki,
    model_bridge,
    zgodnosc_ncrfg_przypadku,
)
from catalog.profiles.nc_rfg import list_available_operators
from enm.domain_ops_models import AddConverterSourcePayload
from enm.models import GEN_TYPES_PRZEKSZTALTNIKOWE, EnergyNetworkModel, ENMHeader, Generator
from network_model.solvers.ncrfg_ptpiree import NcRfgPtpireeModuleInput
from network_model.solvers.ncrfg_ptpiree.engine import TEST_CATALOG

_OPERATOR = list_available_operators()[0]

#: Tabliczka urządzenia POWIĄZANEGO z wykazem PTPiREE — kształt kluczy 1:1 z
#: `annotate_with_ptpiree_status` (`network_model/catalog/mv_ptpiree_catalog.py`).
_TABLICZKA_POWIAZANA = {
    "catalog_item_id": "conv-pv-card-huawei-sun2000-215ktl",
    "ptpiree_status": "POWIAZANY",
    "ptpiree_certificate_ref": "ptpiree-wipwc-1-2-row-3254-huawei-technologies-co-ltd-pv-sun2000-215ktl-h3",
    "ptpiree_document_number": "TC-GCC-DNVGL-SE-0124-07526-1",
    "ptpiree_wipwc_version": "1.2",
}

#: Dane KOMPLETNE dla klasy B (moduł 1–50 MW): każdy test wymagany klasy B
#: (T05/T09/T10/T11/T14/T15/T16/T17 + warunkowe T12/T13 bez certyfikatu) dostaje
#: w modelu to, co most potrafi z niego wyprowadzić; reszta jest deklaracją
#: projektanta (BRAK w modelu → no_data) — patrz `test_dane_niekompletne_daja_no_data`.
_META_KOMPLETNE = {
    "has_lvrt_curve": True,
    "has_hvrt_curve": True,
    "frequency_droop_percent": 5.0,
    "lfsm_deadband_hz": 0.2,
    "qu_slope_pu_per_pu": 2.0,
    "control_mode": "Q_OD_U",
    "cos_phi": 0.95,
    "q_min_mvar": -0.66,
    "q_max_mvar": 0.66,
}


def _generator(
    meta: dict,
    *,
    ref_id: str = "DER1",
    p_mw: float = 2.0,
    gen_type: str = "pv_inverter",
    bus_ref: str = "BUS_SN",
    tabliczka: dict | None = None,
) -> Generator:
    return Generator.model_validate(
        {
            "ref_id": ref_id,
            "name": f"Blok {ref_id}",
            "bus_ref": bus_ref,
            "p_mw": p_mw,
            "gen_type": gen_type,
            "meta": meta,
            "materialized_params": tabliczka,
        }
    )


def _model(generators: list[Generator]) -> EnergyNetworkModel:
    return EnergyNetworkModel.model_validate(
        {
            "header": ENMHeader(name="ncrfg-s3").model_dump(),
            "buses": [{"ref_id": "BUS_SN", "name": "Szyna", "voltage_kv": 15.0}],
            "generators": [g.model_dump(mode="json") for g in generators],
        }
    )


# ---------------------------------------------------------------------------
# Kompletność mostu wobec kontraktu solvera (KLASA, NIE INSTANCJA)
# ---------------------------------------------------------------------------


def test_most_nazywa_kazde_pole_wejscia_solvera() -> None:
    """Inwentarz w docstringu `model_bridge.py` wymienia KAŻDE pole
    `NcRfgPtpireeModuleInput` — nowe pole kontraktu solvera bez wiersza „skąd w
    modelu" jest czerwone tutaj, nie cichym `False`/`None` bez uzasadnienia."""
    docstring = model_bridge.__doc__ or ""
    nazwane = set(re.findall(r"``([a-z_]+)``", docstring))
    brakuje = sorted(set(NcRfgPtpireeModuleInput.model_fields) - nazwane)
    assert brakuje == [], brakuje


def test_kazdy_typ_przeksztaltnikowy_ma_rodzaj_modulu() -> None:
    """`_DER_KIND_Z_GEN_TYPE` pokrywa DOKŁADNIE `GEN_TYPES_PRZEKSZTALTNIKOWE`
    (jedno źródło predykatu DER) — typ bez wiersza dawałby `OTHER` po cichu."""
    assert set(model_bridge._DER_KIND_Z_GEN_TYPE) == set(GEN_TYPES_PRZEKSZTALTNIKOWE)


def test_most_buduje_kontrakt_solvera_bez_fabrykacji() -> None:
    """Brak danej w modelu = False/None w wejściu (nigdy wartość domyślna)."""
    wejscie = build_ncrfg_module_input_from_generator(
        _generator({}), voltage_kv=15.0, operator_id=_OPERATOR
    )
    assert isinstance(wejscie, NcRfgPtpireeModuleInput)
    assert wejscie.der_ref == "DER1"
    assert wejscie.der_name == "Blok DER1"
    assert wejscie.der_kind == "PV"
    assert wejscie.module_family == "PPM"
    assert wejscie.operator_id == _OPERATOR
    assert wejscie.p_max_kw == 2000.0
    assert wejscie.voltage_kv == 15.0
    assert wejscie.certificate_status == "unknown"
    flagi = {
        "has_lvrt_curve",
        "has_hvrt_curve",
        "has_pf_droop",
        "has_qu_curve",
        "has_dynamic_model",
        "has_scada_communication",
        "has_disturbance_recorder",
        "active_power_control_enabled",
        "stop_generation_enabled",
        "reduction_generation_enabled",
        "island_operation_required",
        "island_operation_capable",
        "black_start_required",
        "black_start_capable",
        "power_oscillation_damping_required",
        "power_oscillation_damping_enabled",
    }
    assert all(getattr(wejscie, flaga) is False for flaga in flagi)
    liczby = {
        "p_min_kw",
        "droop_percent",
        "dead_band_hz",
        "ramp_rate_pct_per_min",
        "cos_phi_min",
        "q_range_pct_pn_min",
        "q_range_pct_pn_max",
        "reactive_current_gain",
        "p_recovery_time_s",
        "harmonic_thdu_percent",
    }
    assert all(getattr(wejscie, pole) is None for pole in liczby)


# ---------------------------------------------------------------------------
# Źródła pól w modelu — deklaracja kreatora OZE × wiązania konfiguratora DER
# ---------------------------------------------------------------------------


def test_payload_carries_frt_capability_flags() -> None:
    payload = AddConverterSourcePayload(
        source_technology="PV",
        connection_variant="nn_side",
        station_ref="ST1",
        bus_nn_ref="BUS_NN",
        has_lvrt_curve=True,
        has_hvrt_curve=False,
    )
    assert payload.has_lvrt_curve is True
    assert payload.has_hvrt_curve is False


@pytest.mark.parametrize(
    ("meta", "tabliczka", "lvrt", "hvrt"),
    [
        ({"has_lvrt_curve": True, "has_hvrt_curve": True}, None, True, True),
        ({}, {"profiles": {"lvrt_curve_ref": "enea"}}, True, False),
        ({}, {"profiles": {"hvrt_curve_ref": "enea"}}, False, True),
        ({"has_lvrt_curve": False}, {"profiles": {"lvrt_curve_ref": ""}}, False, False),
        ({"has_lvrt_curve": "tak"}, None, False, False),  # nie-bool NIE jest deklaracją
    ],
)
def test_frt_z_deklaracji_kreatora_lub_wiazania_profilu(
    meta: dict, tabliczka: dict | None, lvrt: bool, hvrt: bool
) -> None:
    wejscie = build_ncrfg_module_input_from_generator(
        _generator(meta, tabliczka=tabliczka), voltage_kv=15.0, operator_id=_OPERATOR
    )
    assert (wejscie.has_lvrt_curve, wejscie.has_hvrt_curve) == (lvrt, hvrt)


def test_pf_droop_z_wartosci_statyzmu_lub_profilu_pf() -> None:
    z_wartosci = build_ncrfg_module_input_from_generator(
        _generator({"frequency_droop_percent": 4.0, "lfsm_deadband_hz": 0.1}),
        voltage_kv=15.0,
        operator_id=_OPERATOR,
    )
    z_profilu = build_ncrfg_module_input_from_generator(
        _generator({}, tabliczka={"profiles": {"pf_curve_ref": "enea"}}),
        voltage_kv=15.0,
        operator_id=_OPERATOR,
    )
    bez = build_ncrfg_module_input_from_generator(
        _generator({"frequency_droop_percent": 0.0}), voltage_kv=15.0, operator_id=_OPERATOR
    )
    assert (z_wartosci.has_pf_droop, z_wartosci.droop_percent, z_wartosci.dead_band_hz) == (
        True,
        4.0,
        0.1,
    )
    assert (z_profilu.has_pf_droop, z_profilu.droop_percent) == (True, None)
    assert (bez.has_pf_droop, bez.droop_percent) == (False, None)


def test_qu_z_nachylenia_lub_trybu_regulacji() -> None:
    by_slope = build_ncrfg_module_input_from_generator(
        _generator({"qu_slope_pu_per_pu": 2.0}), voltage_kv=15.0, operator_id=_OPERATOR
    )
    by_mode = build_ncrfg_module_input_from_generator(
        _generator({"control_mode": "Q_OD_U"}), voltage_kv=15.0, operator_id=_OPERATOR
    )
    none = build_ncrfg_module_input_from_generator(
        _generator({"control_mode": "STALY_COS_PHI"}), voltage_kv=15.0, operator_id=_OPERATOR
    )
    assert (by_slope.has_qu_curve, by_mode.has_qu_curve, none.has_qu_curve) == (True, True, False)


def test_cos_phi_i_zakres_q_w_bazie_pn() -> None:
    wejscie = build_ncrfg_module_input_from_generator(
        _generator({"cos_phi": 0.95, "q_min_mvar": -0.66, "q_max_mvar": 0.66}, p_mw=2.0),
        voltage_kv=15.0,
        operator_id=_OPERATOR,
    )
    assert wejscie.cos_phi_min == 0.95
    assert wejscie.q_range_pct_pn_min == pytest.approx(-0.33)
    assert wejscie.q_range_pct_pn_max == pytest.approx(0.33)
    bez = build_ncrfg_module_input_from_generator(
        _generator({"cos_phi": 0.0, "q_min_mvar": "brak"}), voltage_kv=15.0, operator_id=_OPERATOR
    )
    assert (bez.cos_phi_min, bez.q_range_pct_pn_min, bez.q_range_pct_pn_max) == (None, None, None)


@pytest.mark.parametrize(
    ("tabliczka", "oczekiwany"),
    [
        ({"ptpiree_status": "POWIAZANY"}, "ptpiree_verified"),
        ({"ptpiree_certificate_ref": "ptpiree-wipwc-1-2-row-3254"}, "ptpiree_verified"),
        ({"ptpiree_status": "NIEPOWIAZANY", "ptpiree_certificate_ref": None}, "unknown"),
        ({}, "unknown"),
    ],
)
def test_certyfikat_ptpiree_z_tabliczki(tabliczka: dict, oczekiwany: str) -> None:
    assert certificate_status_z_tabliczki(tabliczka) == oczekiwany
    wejscie = build_ncrfg_module_input_from_generator(
        _generator({}, tabliczka=tabliczka), voltage_kv=15.0, operator_id=_OPERATOR
    )
    assert wejscie.certificate_status == oczekiwany


def test_model_dynamiczny_z_wiazania_katalogu() -> None:
    z_modelem = build_ncrfg_module_input_from_generator(
        _generator({}, tabliczka={"dynamic_model_ref": "default_pv_gfl"}),
        voltage_kv=15.0,
        operator_id=_OPERATOR,
    )
    bez = build_ncrfg_module_input_from_generator(
        _generator({}, tabliczka={"dynamic_model_ref": None}),
        voltage_kv=15.0,
        operator_id=_OPERATOR,
    )
    assert (z_modelem.has_dynamic_model, bez.has_dynamic_model) == (True, False)


@pytest.mark.parametrize(
    ("gen_type", "der_kind"),
    [
        ("pv_inverter", "PV"),
        ("bess", "BESS"),
        ("wind_inverter", "FW"),
        ("fw_pmsg", "FW"),
        ("fw_dfig", "FW"),
        ("fw_scig", "FW"),
    ],
)
def test_rodzaj_modulu_z_gen_type(gen_type: str, der_kind: str) -> None:
    wejscie = build_ncrfg_module_input_from_generator(
        _generator({}, gen_type=gen_type), voltage_kv=15.0, operator_id=_OPERATOR
    )
    assert (wejscie.der_kind, wejscie.module_family) == (der_kind, "PPM")


# ---------------------------------------------------------------------------
# Lista z modelu: pominięcia z nazwanym powodem, kolejność, determinizm
# ---------------------------------------------------------------------------


def test_lista_z_enm_pomija_nie_falownik_i_nazywa_der_bez_mocy_lub_szyny() -> None:
    enm = _model(
        [
            _generator({"has_hvrt_curve": True}, ref_id="DER1"),
            _generator({}, ref_id="SYN1", gen_type="synchronous"),
            _generator({}, ref_id="DER_ORPHAN", bus_ref="BRAK"),
            _generator({}, ref_id="DER_ZERO", p_mw=0.0),
        ]
    )
    wejscia = build_ncrfg_module_inputs_from_enm(enm, operator_id=_OPERATOR)
    assert [m.der_ref for m in wejscia.modules] == ["DER1"]
    assert wejscia.modules[0].has_hvrt_curve is True
    assert [(p.der_ref, p.powod) for p in wejscia.pominiete] == [
        ("DER_ORPHAN", "brak_napiecia"),
        ("DER_ZERO", "brak_mocy"),
    ]
    assert all(p.powod_pl for p in wejscia.pominiete)


def test_bridge_is_deterministic() -> None:
    gen = _generator({"has_lvrt_curve": True, "qu_slope_pu_per_pu": 2.0})
    first = build_ncrfg_module_input_from_generator(gen, voltage_kv=15.0, operator_id=_OPERATOR)
    second = build_ncrfg_module_input_from_generator(gen, voltage_kv=15.0, operator_id=_OPERATOR)
    assert first.model_dump() == second.model_dump()


# ---------------------------------------------------------------------------
# Serwis zgodności przypadku: {0, 1, N} DER × dane {kompletne, niekompletne, certyfikat}
# ---------------------------------------------------------------------------


def test_zero_der_daje_uczciwy_stan_zerowy_bez_biegu() -> None:
    odpowiedz = zgodnosc_ncrfg_przypadku(_model([]), operator_id=_OPERATOR, case_id="case-0")
    assert isinstance(odpowiedz, NcRfgCaseComplianceResponse)
    assert (odpowiedz.der_count, odpowiedz.pominiete, odpowiedz.bieg) == (0, [], None)


def test_tylko_pominiete_der_daje_der_count_zero_i_liste_powodow() -> None:
    odpowiedz = zgodnosc_ncrfg_przypadku(
        _model([_generator({}, ref_id="DER_ZERO", p_mw=0.0)]),
        operator_id=_OPERATOR,
        case_id="case-0",
    )
    assert odpowiedz.der_count == 0
    assert odpowiedz.bieg is None
    assert [p.powod for p in odpowiedz.pominiete] == ["brak_mocy"]


def test_jeden_der_dane_niekompletne_daja_no_data_na_testach_wymaganych() -> None:
    odpowiedz = zgodnosc_ncrfg_przypadku(
        _model([_generator({})]), operator_id=_OPERATOR, case_id="case-1"
    )
    assert odpowiedz.der_count == 1 and odpowiedz.bieg is not None
    modul = odpowiedz.bieg.modules[0]
    assert modul.module_type == "B"
    assert modul.overall_status == "brak_danych"
    assert modul.no_data_count > 0
    werdykty = {t.test_id: t.verdict for t in modul.tests}
    # T14 LVRT wymagany dla B; bez krzywej/modelu dynamicznego = no_data (nie fabrykacja).
    assert werdykty["T14"] == "no_data"
    assert set(werdykty.values()) <= {"pass", "fail", "no_data", "not_required"}
    assert all(re.fullmatch(r"T\d{2}", test_id) for test_id in werdykty)


def test_jeden_der_dane_kompletne_daja_werdykty_pass_bez_no_data_na_polach_modelu() -> None:
    odpowiedz = zgodnosc_ncrfg_przypadku(
        _model([_generator(_META_KOMPLETNE, tabliczka={"dynamic_model_ref": "default_pv_gfl"})]),
        operator_id=_OPERATOR,
        case_id="case-1",
    )
    assert odpowiedz.bieg is not None
    modul = odpowiedz.bieg.modules[0]
    werdykty = {t.test_id: t.verdict for t in modul.tests}
    # Zdolności wyprowadzone Z MODELU: FRT (T14/T15), zakres Q (T09), cosφ (T08), PMAX (T10).
    assert werdykty["T14"] == "pass"
    assert werdykty["T15"] == "pass"
    assert werdykty["T09"] == "pass"
    assert werdykty["T10"] == "pass"
    # Deklaracje projektanta BEZ nośnika w modelu (rampa P, K_FRT, czas odbudowy P)
    # zostają no_data — model ich nie niesie, więc most ich nie wymyśla.
    assert werdykty["T05"] == "no_data"
    assert werdykty["T16"] == "no_data"
    assert werdykty["T17"] == "no_data"
    assert modul.overall_status == "brak_danych"


def test_certyfikat_ptpiree_z_tabliczki_zwalnia_z_testow_warunkowych_i_niesie_dowod() -> None:
    bez_cert = zgodnosc_ncrfg_przypadku(
        _model([_generator({})]), operator_id=_OPERATOR, case_id="case-1"
    )
    z_cert = zgodnosc_ncrfg_przypadku(
        _model([_generator({}, tabliczka=_TABLICZKA_POWIAZANA)]),
        operator_id=_OPERATOR,
        case_id="case-1",
    )
    assert bez_cert.bieg is not None and z_cert.bieg is not None
    m_bez, m_z = bez_cert.bieg.modules[0], z_cert.bieg.modules[0]
    assert (m_bez.certificate_status, m_z.certificate_status) == ("unknown", "ptpiree_verified")
    # T12/T13 wymagane dla klasy B TYLKO bez certyfikatu (reguła solvera `_is_required`).
    wymagane_bez = {t.test_id for t in m_bez.tests if t.required}
    wymagane_z = {t.test_id for t in m_z.tests if t.required}
    assert {"T12", "T13"} <= wymagane_bez
    assert not ({"T12", "T13"} & wymagane_z)
    # Dowód certyfikatu z tabliczki TEGO modelu (nie z magazynu, nie z żądania).
    dowod = z_cert.bieg.certificate_evidence[0]
    assert dowod.der_ref == "DER1"
    assert dowod.document_number == _TABLICZKA_POWIAZANA["ptpiree_document_number"]
    assert bez_cert.bieg.certificate_evidence[0].document_number is None


def test_n_der_w_kolejnosci_modelu_z_polami_dowodowymi_s1() -> None:
    enm = _model(
        [
            _generator(_META_KOMPLETNE, ref_id="PV_A", tabliczka=_TABLICZKA_POWIAZANA),
            _generator({}, ref_id="BESS_B", gen_type="bess", p_mw=1.5),
            _generator({}, ref_id="FW_C", gen_type="fw_pmsg", p_mw=3.0),
        ]
    )
    odpowiedz = zgodnosc_ncrfg_przypadku(enm, operator_id=_OPERATOR, case_id="case-n")
    assert odpowiedz.der_count == 3 and odpowiedz.bieg is not None
    assert [m.der_ref for m in odpowiedz.bieg.modules] == ["PV_A", "BESS_B", "FW_C"]
    assert [m.der_name for m in odpowiedz.bieg.modules] == ["Blok PV_A", "Blok BESS_B", "Blok FW_C"]
    bieg = odpowiedz.bieg
    assert bieg.reporting_status in {"reportable", "not_reportable"}
    assert bieg.proof_status in {"complete", "incomplete"}
    assert set(bieg.evidence_per_module) == {"PV_A", "BESS_B", "FW_C"}
    assert set(bieg.evidence_by_test) == {"PV_A", "BESS_B", "FW_C"}
    assert set(bieg.evidence_by_test["PV_A"]) == {d.test_id for d in TEST_CATALOG}
    assert [d.der_ref for d in bieg.certificate_evidence] == ["PV_A", "BESS_B", "FW_C"]


def test_serwis_jest_deterministyczny() -> None:
    enm = _model([_generator(_META_KOMPLETNE, tabliczka=_TABLICZKA_POWIAZANA)])
    a = zgodnosc_ncrfg_przypadku(enm, operator_id=_OPERATOR, case_id="case-d")
    b = zgodnosc_ncrfg_przypadku(enm, operator_id=_OPERATOR, case_id="case-d")
    assert a.model_dump() == b.model_dump()


# ---------------------------------------------------------------------------
# Trasa HTTP: operator {znany, nieznany}, przypadek realny, parytet /run vs /compliance
# ---------------------------------------------------------------------------


def _nowy_przypadek(client) -> str:
    """Utwórz REALNY projekt + przypadek przez API; zwróć `case_id`.

    CV-1-W: przypadek bez wiersza w bazie dostaje 404 z magazynu ENM
    (inwariant I-2) — testy tego pliku potrzebują prawdziwej pary
    projekt+przypadek zamiast dowolnego UUID-a.
    """
    project_resp = client.post("/api/projects", json={"name": "NC RfG jeden tor — test"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    case_resp = client.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek testu"}
    )
    assert case_resp.status_code == 201, case_resp.text
    return str(case_resp.json()["id"])


def _model_z_der() -> EnergyNetworkModel:
    return _model(
        [
            _generator(_META_KOMPLETNE, ref_id="DER1", tabliczka=_TABLICZKA_POWIAZANA),
            _generator({}, ref_id="DER_ZERO", p_mw=0.0),
        ]
    )


def test_compliance_endpoint_runs_from_model_with_run_contract() -> None:
    from api.main import app
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.store import reset_enm_store, set_enm
    from fastapi.testclient import TestClient

    reset_enm_store()

    # CV-1-W: `TestClient(app)` bez `with` NIE uruchamia lifespan — `with` wymusza
    # świeży lifespan związany z `DATABASE_URL` ustawionym przez ten test.
    with TestClient(app) as client:
        case_id = _nowy_przypadek(client)
        klucz = klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)
        set_enm(klucz, _model_z_der())

        resp = client.get(
            f"/api/ncrfg-tests/cases/{case_id}/compliance", params={"operator_id": _OPERATOR}
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert set(body) == {"case_id", "operator_id", "der_count", "pominiete", "bieg"}
        assert body["case_id"] == case_id
        assert body["der_count"] == 1
        assert [(p["der_ref"], p["powod"]) for p in body["pominiete"]] == [
            ("DER_ZERO", "brak_mocy")
        ]
        bieg = body["bieg"]
        assert bieg["contract"] == "NcRfgPtpireeTestResultV1"
        assert bieg["modules"][0]["der_ref"] == "DER1"
        assert bieg["modules"][0]["certificate_status"] == "ptpiree_verified"
        assert bieg["certificate_evidence"][0]["document_number"] == (
            _TABLICZKA_POWIAZANA["ptpiree_document_number"]
        )
        assert {"reporting_status", "proof_status", "evidence_limitations", "evidence_by_test"} <= (
            set(bieg)
        )
        # Dawny kontrakt drugiego silnika ZNIKA — bez aliasów (zero kompatybilności wstecznej).
        assert not ({"reports", "overall_pass", "passed_count", "no_module_count"} & set(body))
        assert "no_module" not in resp.text


def test_compliance_endpoint_zero_der_returns_no_run() -> None:
    from api.main import app
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.store import reset_enm_store, set_enm
    from fastapi.testclient import TestClient

    reset_enm_store()
    with TestClient(app) as client:
        case_id = _nowy_przypadek(client)
        klucz = klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)
        set_enm(klucz, _model([]))

        resp = client.get(
            f"/api/ncrfg-tests/cases/{case_id}/compliance", params={"operator_id": _OPERATOR}
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == {
            "case_id": case_id,
            "operator_id": _OPERATOR,
            "der_count": 0,
            "pominiete": [],
            "bieg": None,
        }


def test_compliance_endpoint_rejects_unknown_operator() -> None:
    from api.main import app
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.store import reset_enm_store, set_enm
    from fastapi.testclient import TestClient

    reset_enm_store()
    with TestClient(app) as client:
        case_id = _nowy_przypadek(client)
        klucz = klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)
        set_enm(klucz, _model_z_der())

        resp = client.get(
            f"/api/ncrfg-tests/cases/{case_id}/compliance", params={"operator_id": "nieistnieje"}
        )
        assert resp.status_code == 404
        # Przypina WŁAŚCIWY powód (operator, nie tłumaczenie case_id) — bez
        # tego dwa różne 404 (case bez projektu vs. nieznany operator) byłyby
        # nierozróżnialne dla tego testu (test maskujący defekt).
        assert "nieistnieje" in resp.json()["detail"]


def test_parytet_run_i_compliance_dla_tego_samego_der() -> None:
    """Ten sam DER przez `/run` (wejście zbudowane mostem i wysłane jawnie) i przez
    `/compliance` (z modelu) daje IDENTYCZNY moduł wyniku, identyczne pola dowodowe
    S-1 i identyczny odcisk wejścia — jeden solver, jedna koperta."""
    from api.main import app
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.store import reset_enm_store, set_enm
    from fastapi.testclient import TestClient

    reset_enm_store()
    enm = _model([_generator(_META_KOMPLETNE, ref_id="DER1", tabliczka=_TABLICZKA_POWIAZANA)])
    with TestClient(app) as client:
        case_id = _nowy_przypadek(client)
        klucz = klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)
        set_enm(klucz, enm)

        z_modelu = client.get(
            f"/api/ncrfg-tests/cases/{case_id}/compliance", params={"operator_id": _OPERATOR}
        )
        assert z_modelu.status_code == 200, z_modelu.text
        wejscia = build_ncrfg_module_inputs_from_enm(enm, operator_id=_OPERATOR)
        reczny = client.post(
            "/api/ncrfg-tests/run",
            params={"case_id": case_id},
            json={"modules": [m.model_dump(mode="json") for m in wejscia.modules]},
        )
        assert reczny.status_code == 200, reczny.text

    bieg_z_modelu = z_modelu.json()["bieg"]
    bieg_reczny = reczny.json()
    assert bieg_z_modelu["modules"] == bieg_reczny["modules"]
    assert bieg_z_modelu["input_hash"] == bieg_reczny["input_hash"]
    assert bieg_z_modelu["deterministic_hash"] == bieg_reczny["deterministic_hash"]
    assert bieg_z_modelu["white_box_trace"] == bieg_reczny["white_box_trace"]
    for pole in (
        "reporting_status",
        "proof_status",
        "evidence_limitations",
        "evidence_note_pl",
        "evidence_per_module",
        "evidence_by_test",
        "certificate_evidence",
    ):
        assert bieg_z_modelu[pole] == bieg_reczny[pole], pole
    modul = bieg_z_modelu["modules"][0]
    assert modul["pass_count"] > 0 and modul["required_count"] > 0
