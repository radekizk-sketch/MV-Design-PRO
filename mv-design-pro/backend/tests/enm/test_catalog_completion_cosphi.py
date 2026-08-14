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
    NN_FIELD_ORIGIN_OPERACJA_DOMENOWA,
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


# ---------------------------------------------------------------------------
# Karta NAPRAWA-B, znalezisko #3 — fantomowy odbiór migracji przy sekwencji
# kreatora P0.9 (`add_nn_outgoing_field` → [odczyt] → `add_nn_load`).
#
# Reprodukcja przez PUBLICZNY TOR domain-ops (`_wykonaj_operacje_przez_store`
# niżej — DOKŁADNIE ta sama para wywołań store, którą robi produkcyjny
# endpoint `POST .../enm/domain-ops`: `get_enm` → `execute_domain_operation` →
# `set_enm`), z JAWNYM odczytem modelu (`get_enm`) MIĘDZY dwoma żądaniami —
# dokładnie to, co robi UI odświeżając snapshot między krokami formularza.
#
# Iloczyn cech na JEDNEJ stacji (nie dwa osobne testy, żeby udowodnić, że
# predykat pochodzenia faktycznie ROZRÓŻNIA, a nie tylko przypadkiem trafia):
#   * odpływ LEGACY (wbudowany starter szablonu stacji, `_build_nn_field_specs`,
#     BEZ znacznika pochodzenia) — MA dostać domyślny odbiór migracji;
#   * odpływ P0.1 (`add_nn_outgoing_field`, ZE znacznikiem pochodzenia) —
#     NIGDY nie dostaje fantomu, ani po odczycie między żądaniami, ani po
#     kolejnych odczytach, gdy zostaje świadomie pusty.
# ---------------------------------------------------------------------------


def _wykonaj_operacje_przez_store(
    case_id: str, nazwa: str, payload: dict[str, Any]
) -> dict[str, Any]:
    """Jedno żądanie kreatora DOKŁADNIE jak produkcyjny endpoint.

    `api.enm._domain_ops_pod_blokada` robi to samo: `get_enm` (odczyt, sam w
    sobie może domigrować model i go ZAPISAĆ), `execute_domain_operation`,
    `set_enm` (zapis). Brama katalogowa HTTP jest tu pominięta świadomie —
    ten test bada WYŁĄCZNIE mechanizm migracji przy odczycie/zapisie modelu,
    nie kontrakt katalogowy (ten ma własne testy w `tests/api/
    test_brama_katalogowa_api_inwentarz.py`).
    """
    enm = get_enm(case_id)
    wynik = execute_domain_operation(enm.model_dump(mode="json"), nazwa, payload)
    assert not wynik.get("error"), f"{nazwa}: {wynik.get('error')} (code={wynik.get('error_code')})"
    nowy = EnergyNetworkModel.model_validate(wynik["snapshot"])
    set_enm(case_id, nowy)
    return wynik


def _szyna_nn_stacji(enm: EnergyNetworkModel, station_ref: str) -> str:
    """Szyna nN STACJI (nie szyna odpływu za aparatem promocji P0.1).

    `_szyna_nn` wyżej zakłada JEDNĄ szynę nN w całym modelu — założenie prawdziwe
    tylko PRZED promocją `nn_field_specs_promocja` (każdy promowany odpływ dostaje
    WŁASNĄ nową szynę, więc po promocji szyn nN jest tyle, ile odpływów + 1).
    Tu wybieramy szynę wprost z `substation.bus_refs`, tak jak robi to
    `application.station_templates.apply._szyna_nn_stacji`.
    """
    substation = next(s for s in enm.substations if s.ref_id == station_ref)
    for bus_ref in substation.bus_refs:
        bus = next((b for b in enm.buses if b.ref_id == bus_ref), None)
        if bus is not None and bus.voltage_kv is not None and bus.voltage_kv < 1.0:
            return bus.ref_id
    raise AssertionError(f"Stacja '{station_ref}' nie ma szyny nN w bus_refs.")


def _feeder_refs_by_origin(enm: EnergyNetworkModel, station_ref: str) -> dict[str, list[str]]:
    """`field_ref` odpływów FEEDER stacji, pogrupowane wg pochodzenia wpisu."""
    substation = next(s for s in enm.substations if s.ref_id == station_ref)
    meta = substation.meta if isinstance(substation.meta, dict) else {}
    specs = meta.get("nn_field_specs") or []
    wynik: dict[str, list[str]] = {"legacy": [], "operacja": []}
    for spec in specs:
        if not isinstance(spec, dict) or spec.get("bay_role") != "FEEDER":
            continue
        field_ref = spec.get("field_ref")
        assert isinstance(field_ref, str)
        pochodzenie = (spec.get("meta") or {}).get("nn_field_origin")
        klucz = "operacja" if pochodzenie == NN_FIELD_ORIGIN_OPERACJA_DOMENOWA else "legacy"
        wynik[klucz].append(field_ref)
    return wynik


def _loads_by_feeder_ref(enm: EnergyNetworkModel) -> dict[str, list[Any]]:
    grupy: dict[str, list[Any]] = {}
    for load in enm.loads:
        feeder_ref = (load.meta or {}).get("feeder_ref")
        if isinstance(feeder_ref, str):
            grupy.setdefault(feeder_ref, []).append(load)
    return grupy


def test_sekwencja_kreatora_p01_nie_zostawia_fantomu_a_legacy_dalej_migruje(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any
) -> None:
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
    reset_enm_store()
    case_id = "case-nb-znalezisko-3"

    # Krok 0: stacja z JEDNYM odpływem LEGACY (starter wbudowany przez
    # `insert_station_on_segment_sn` — dokładnie ten mechanizm, który migracja
    # ma nadal obsługiwać: `_build_nn_field_specs` nigdy nie znaczy wpisu).
    # `set_enm` sam uruchamia `complete_catalog_defaults` (nie tylko odczyt) —
    # więc odpływ legacy dostaje domyślny odbiór JUŻ TUTAJ, zanim kreator
    # wykona choćby jedno żądanie. To jest INTENCJA migracji: legacy ma zostać
    # katalogowo kompletny NIEZALEŻNIE od tego, kiedy projektant po raz
    # pierwszy odczyta model.
    siec = _siec_referencyjna("znalezisko-3", liczba_odplywow_nn=1)
    set_enm(case_id, EnergyNetworkModel.model_validate(siec))

    bazowy = get_enm(case_id)
    # `_siec_referencyjna` tworzy DWIE stacje: GPZ (`add_grid_source_sn`) i
    # stację SN/nN (`insert_station_on_segment_sn`) — szukamy tej drugiej,
    # dokładnie jak robi to sama migracja (`complete_station_loads_from_nn_
    # feeders`: `if substation.station_type == "gpz": continue`).
    station_ref = next(s.ref_id for s in bazowy.substations if s.station_type != "gpz")
    nn_bus_ref = _szyna_nn_stacji(bazowy, station_ref)
    odplywy_przed = _feeder_refs_by_origin(bazowy, station_ref)
    assert len(odplywy_przed["legacy"]) == 1, odplywy_przed
    assert odplywy_przed["operacja"] == []
    feeder_legacy = odplywy_przed["legacy"][0]

    odbiory_bazowe = _loads_by_feeder_ref(bazowy)
    assert len(bazowy.loads) == 1, bazowy.loads
    assert len(odbiory_bazowe.get(feeder_legacy, [])) == 1, (
        "Odpływ LEGACY nie dostał domyślnego odbioru migracji przy `set_enm` — "
        "regresja intencji migracji (szablon bez odbiorów ma pozostać katalogowo "
        "kompletny)."
    )

    # Krok 1 kreatora: `add_nn_outgoing_field` — nowy odpływ P0.1 (K2), payload
    # DOKŁADNIE jak produkcyjny `KreatorPolaNn.tsx` (bez catalog_ref — patrz
    # znalezisko #2 tej samej karty).
    wynik_pola = _wykonaj_operacje_przez_store(
        case_id,
        "add_nn_outgoing_field",
        {
            "station_ref": station_ref,
            "bus_nn_ref": nn_bus_ref,
            "field_role": "FEEDER",
            "field_name": "Odpływ K2",
        },
    )
    feeder_p01 = wynik_pola["changes"]["created_element_ids"][0]
    assert feeder_p01 != feeder_legacy

    # ODCZYT MIĘDZY ŻĄDANIAMI — dokładnie to, co robi UI odświeżając snapshot
    # (np. `useSnapshotStore` po zamknięciu formularza pola). PRZED naprawą:
    # ten pojedynczy odczyt materializował fantom 30 kW na feeder_p01 (i na
    # feeder_legacy — ale ten i tak MA dostać migrację, więc dla legacy to nie
    # był widoczny defekt; widoczny był na feeder_p01, świeżo utworzonym).
    po_odczycie = get_enm(case_id)
    odbiory_po_odczycie = _loads_by_feeder_ref(po_odczycie)

    # Legacy MA dostać migrowany odbiór — intencja migracji zachowana.
    assert feeder_legacy in odbiory_po_odczycie, (
        "Odpływ LEGACY nie dostał domyślnego odbioru migracji — regresja intencji "
        "migracji (szablon bez odbiorów ma pozostać katalogowo kompletny)."
    )
    assert len(odbiory_po_odczycie[feeder_legacy]) == 1

    # P0.1 NIE MOŻE dostać fantomu — to jest znalezisko #3.
    assert feeder_p01 not in odbiory_po_odczycie, (
        f"Fantomowy odbiór na świeżo utworzonym odpływie P0.1 '{feeder_p01}' — "
        "migracja zignorowała znacznik pochodzenia."
    )

    # Krok 2 kreatora: `add_nn_load` na feeder_p01 — DRUGIE, osobne żądanie
    # (dokładnie sekwencja opisana w karcie: dwa żądania, ODCZYT między nimi).
    _wykonaj_operacje_przez_store(
        case_id,
        "add_nn_load",
        {
            "feeder_ref": feeder_p01,
            "active_power_kw": 22.0,
            "cos_phi": 0.86,
            "load_name": "Silnik M1 (realny odbiór projektanta)",
        },
    )

    po_odbiorze = get_enm(case_id)
    odbiory_po_odbiorze = _loads_by_feeder_ref(po_odbiorze)

    # Realny odbiór projektanta powstał — DOKŁADNIE JEDEN (bez fantomu obok).
    assert len(odbiory_po_odbiorze.get(feeder_p01, [])) == 1, (
        f"Odpływ P0.1 '{feeder_p01}' ma {len(odbiory_po_odbiorze.get(feeder_p01, []))} "
        "odbiorów zamiast jednego — podwojona moc (fantom obok realnego odbioru)."
    )
    jedyny = odbiory_po_odbiorze[feeder_p01][0]
    assert jedyny.p_mw == pytest.approx(0.022, abs=1e-12)
    assert jedyny.catalog_ref is None
    assert jedyny.source_mode == "EKSPERCKI_RECZNY"

    # Legacy odbiór jest NADAL dokładnie jeden (migracja nie biegła ponownie
    # na już-zaspokojonym wpisie).
    assert len(odbiory_po_odbiorze[feeder_legacy]) == 1

    # Krok 3 kreatora: DRUGI odpływ P0.1 (K3), CELOWO pozostawiony bez odbioru —
    # kilka kolejnych odczytów modelu (kolejna nawigacja UI) NIE MOŻE dołożyć mu
    # fantomu, mimo że pozostaje pusty na zawsze (poprawny stan końcowy).
    wynik_pola_k3 = _wykonaj_operacje_przez_store(
        case_id,
        "add_nn_outgoing_field",
        {
            "station_ref": station_ref,
            "bus_nn_ref": nn_bus_ref,
            "field_role": "FEEDER",
            "field_name": "Odpływ K3 (celowo pusty)",
        },
    )
    feeder_k3 = wynik_pola_k3["changes"]["created_element_ids"][0]

    for _ in range(3):
        stan = get_enm(case_id)
        odbiory = _loads_by_feeder_ref(stan)
        assert feeder_k3 not in odbiory, (
            f"Odpływ P0.1 '{feeder_k3}', celowo pozostawiony pusty, dostał fantom "
            "po kolejnym odczycie modelu."
        )

    # Całkowita liczba odbiorów stacji: 1 (legacy, zmigrowany) + 1 (P0.1,
    # realny) — feeder_k3 pozostaje bez odbioru. Zamknięcie rachunku mocy.
    finalny = get_enm(case_id)
    assert len(finalny.loads) == 2, [load.ref_id for load in finalny.loads]
