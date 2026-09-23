"""JEDNA lista rodzajow biegow i rodzaje dziedziny czestotliwosci bez solvera (karta AB-1d_min).

Zrodlo: `application/solvers/solver_capability_registry.py::RODZAJE_BIEGOW` (+ jawna
tabela biegow V12.6 `BIEGI_V126`). Na HEAD `8a49a02d` rodzaje biegow zyly w piecu
miejscach (przeglad adwersarialny §5.3) — ten plik przypina, ze kazda pozostala lista
jest WYPROWADZONA z tabeli albo PRZYPIETA do niej testem (regula KLASA, NIE INSTANCJA:
kazdy test iteruje po realnym zbiorze).

Iloczyn cech rodzajow bez solvera: {harmoniczne, skan_czestotliwosciowy,
supraharmoniczne} × {utworzenie: opcje poprawne / brak / sprzeczne} × {wykonanie:
odmowa nazwana z brakiem i kamieniem} × {gotowosc: nigdy `ready`} × {UI: niewidoczne}.
"""

from __future__ import annotations

import dataclasses
import typing
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from api.execution_runs import _canonical_analysis_type
from api.main import app
from api.v125_contracts import build_analysis_case_reproducibility
from api.v126_academic import _ANALIZY_WYCOFANE
from application.analyses.v126_katalog import karta_analizy
from application.calculation_readiness.service import (
    CALCULATION_LABEL_PL,
    TYPY_GOTOWOSCI_BEZ_SOLVERA,
    CalculationReadinessService,
    CalculationType,
)
from application.solvers import solver_capability_registry as rejestr
from application.solvers.solver_capability_registry import (
    BIEGI_V126,
    KOD_SOLVER_NIEOBECNY,
    RODZAJE_BIEGOW,
    RODZAJE_BIEGOW_BEZ_SOLVERA,
    SOLVER_CAPABILITY_REGISTRY,
    PhysicsDomain,
    RodzajBiegu,
    SolverNieobecny,
    SolverNieobecnyError,
    domena_fizyczna_biegu,
    zdolnosci_biegu,
)
from domain import analysis_run
from domain.execution import ExecutionAnalysisType
from enm import biegi_czestotliwosciowe
from enm.canonical_analysis import (
    CanonicalRun,
    _execution_analysis_type_for_run,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.store import reset_enm_store, set_enm
from fastapi import HTTPException
from fastapi.testclient import TestClient
from network_model.solvers.harmoniczne import KontraktCzestotliwosciError
from network_model.solvers.harmoniczne.kontrakty import (
    KOD_OS_NIEPOPRAWNA,
    KOD_PASMO_NIEPOPRAWNE,
)
from solver_input.v126_contracts import V126AnalysisType

from tests.cgmes.golden_enm import build_golden_enm

PROJECT_ROOT = Path(__file__).resolve().parents[3]
FRONTEND_SRC = PROJECT_ROOT / "frontend" / "src"

#: Poprawne opcje biegow bez solvera — kontrakty bez wartosci domyslnych, dane jawne.
OS_HARMONICZNA: dict[str, Any] = {
    "rodzaj": "HARMONICZNE",
    "f_hz": [250.0, 350.0, 550.0, 650.0],
    "f1_hz": 50.0,
    "zrodlo": "decyzja projektanta (test)",
}
PASMO: dict[str, Any] = {
    "f_min_hz": 2000.0,
    "f_max_hz": 150000.0,
    "frequency_resolution_hz": 200.0,
    "aggregation_bandwidth_hz": 2000.0,
    "measurement_method": "metoda z dokumentu testowego",
    "source_document": "dokument testowy",
    "version": "1",
}
OPCJE_POPRAWNE: dict[str, dict[str, Any]] = {
    "harmoniczne": {"os_czestotliwosci": OS_HARMONICZNA},
    "skan_czestotliwosciowy": {"os_czestotliwosci": OS_HARMONICZNA},
    "supraharmoniczne": {"pasmo_supraharmoniczne": PASMO},
}

#: Pin bitowy trzech slownikow `api/v125_contracts.py:330/344/352` z HEAD `8a49a02d`
#: (przed wyprowadzeniem z tabeli) — koperta odtwarzalnosci nie moze sie zmienic.
SLOWNIKI_ODTWARZALNOSCI_BAZY: dict[str, tuple[str, str, str]] = {
    "PF": ("power_flow_newton", "pf_result_v1", "NR_POWER_FLOW"),
    "rozplyw_niesymetryczny": (
        "power_flow_unbalanced_bfs",
        "power_flow_unbalanced_v1",
        "PF_UNBALANCED_BFS_V1",
    ),
    "short_circuit_sn": ("iec60909_short_circuit", "iec60909_v1", "IEC_60909"),
    "phase_state_sn": (
        "phase_state_sn_radial",
        "phase_state_sn_v1",
        "PHASE_STATE_SN_RADIAL_V1",
    ),
    "dynamic_stability": (
        "dynamic_stability_fault_clear",
        "dynamic_stability_fault_clear_v1",
        "DYNAMIC_STABILITY_FAULT_CLEAR_V1",
    ),
    "dynamika_rms": ("dynamika_rms_dae", "resultset_dynamic_v1", "DYNAMIKA_RMS_DAE_V1"),
}


@pytest.fixture(autouse=True)
def _czysty_magazyn() -> Any:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _bieg(analysis_type: str, options: dict[str, Any] | None = None) -> CanonicalRun:
    from datetime import UTC, datetime

    return CanonicalRun(
        id=uuid4(),
        case_id="case-rodzaje",
        project_id=None,
        analysis_type=analysis_type,
        status="FINISHED",
        created_at=datetime(2026, 9, 23, tzinfo=UTC),
        snapshot_hash="sha256:rodzaje",
        input_hash="sha256:rodzaje-opcje",
        snapshot={},
        validation={},
        readiness={},
        options=options or {},
    )


# ---------------------------------------------------------------------------
# Krok 1 — jedna lista zrodlowa, pozostale wyprowadzone albo przypiete
# ---------------------------------------------------------------------------


def test_execution_analysis_type_frozen_przypiety_do_tabeli() -> None:
    """Lista 2 (`domain/execution.py::ExecutionAnalysisType`, FROZEN) — PRZYPIETA:
    kazdy czlon ma DOKLADNIE jeden rodzaj biegu, kazdy typ wykonawczy tabeli jest czlonem.
    """
    typy_tabeli = [typ for rodzaj in RODZAJE_BIEGOW.values() for typ in rodzaj.typy_wykonawcze]
    assert len(typy_tabeli) == len(set(typy_tabeli)), "typ wykonawczy w dwoch rodzajach"
    assert set(typy_tabeli) == {typ.value for typ in ExecutionAnalysisType}


@pytest.mark.parametrize("typ", list(ExecutionAnalysisType), ids=lambda t: t.value)
def test_trasa_wykonawcza_wyprowadza_rodzaj_z_tabeli(
    typ: ExecutionAnalysisType,
) -> None:
    """`api/execution_runs.py::_canonical_analysis_type` — WYPROWADZONA (bez lancucha if)."""
    if typ is ExecutionAnalysisType.PROTECTION:
        # V12K-025: osobna trasa utworzenia — odmowa 400, nie rodzaj.
        with pytest.raises(HTTPException) as exc:
            _canonical_analysis_type(typ)
        assert exc.value.status_code == 400
        return
    rodzaj = _canonical_analysis_type(typ)
    assert typ.value in RODZAJE_BIEGOW[rodzaj].typy_wykonawcze


@pytest.mark.parametrize("analysis_type", sorted(RODZAJE_BIEGOW))
def test_typ_wykonawczy_biegu_wyprowadzony_i_odwracalny(analysis_type: str) -> None:
    """`enm/canonical_analysis.py::_execution_analysis_type_for_run` — z tabeli, w obie strony."""
    typ = _execution_analysis_type_for_run(_bieg(analysis_type))
    assert typ in RODZAJE_BIEGOW[analysis_type].typy_wykonawcze
    assert rejestr.rodzaj_biegu_z_typu_wykonawczego(typ).analysis_type == analysis_type


@pytest.mark.parametrize(
    "analysis_type", sorted(set(RODZAJE_BIEGOW) | set(BIEGI_V126) | {"rodzaj_spoza"})
)
def test_koperta_odtwarzalnosci_bitowo_jak_przed_karta(analysis_type: str) -> None:
    """Lista 3-5 (`api/v125_contracts.py:330/344/352`) — WYPROWADZONE; wartosci bitowo = baza."""
    koperta = build_analysis_case_reproducibility(_bieg(analysis_type))
    oczekiwane = SLOWNIKI_ODTWARZALNOSCI_BAZY.get(
        analysis_type, (analysis_type, "canonical_run_v1", "CANONICAL_ANALYSIS")
    )
    assert (
        koperta["solver_family"],
        koperta["formula_set_version"],
        koperta["standard_basis_ref"],
    ) == oczekiwane


def test_legacy_analysis_type_jest_podzbiorem_tabeli() -> None:
    """Lista 1 (`domain/analysis_run.py:10`, magazyn legacy PF/SC) — PRZYPIETA jako podzbior."""
    legacy = set(typing.get_args(analysis_run.AnalysisType))
    assert legacy == {"PF", "short_circuit_sn"}
    assert legacy <= set(RODZAJE_BIEGOW)


def test_gotowosc_przypieta_do_tabeli() -> None:
    """Lista 6 (gotowosc `CalculationType`): typy bedace rodzajami biegow maja etykiete
    z tabeli; zbior typow bez solvera = zbior rodzajow bez solvera (predykat parami)."""
    typy = set(typing.get_args(CalculationType))
    wspolne = typy & set(RODZAJE_BIEGOW)
    assert wspolne == {"dynamika_rms"} | set(RODZAJE_BIEGOW_BEZ_SOLVERA)
    for typ in wspolne:
        assert CALCULATION_LABEL_PL[typ] == RODZAJE_BIEGOW[typ].etykieta_pl  # type: ignore[index]
    assert set(TYPY_GOTOWOSCI_BEZ_SOLVERA) == set(RODZAJE_BIEGOW_BEZ_SOLVERA)


def test_tabela_bez_wartosci_domyslnych() -> None:
    for pole in dataclasses.fields(RodzajBiegu):
        assert pole.default is dataclasses.MISSING, pole.name
        assert pole.default_factory is dataclasses.MISSING, pole.name
    for pole in dataclasses.fields(SolverNieobecny):
        assert pole.default is dataclasses.MISSING, pole.name


# ---------------------------------------------------------------------------
# Krok 2 — rodzaje dziedziny czestotliwosci bez solvera
# ---------------------------------------------------------------------------


def test_trzy_rodzaje_bez_solvera_z_kamieniami_i_domenami() -> None:
    assert RODZAJE_BIEGOW_BEZ_SOLVERA == {
        "harmoniczne",
        "skan_czestotliwosciowy",
        "supraharmoniczne",
    }
    oczekiwane = {
        "harmoniczne": ("AB-2H", PhysicsDomain.HARMONIC_FREQUENCY_DOMAIN),
        "skan_czestotliwosciowy": ("AB-2H", PhysicsDomain.HARMONIC_FREQUENCY_DOMAIN),
        # Program §6.10: supraharmoniczne odmawiaja do AB-4H, nie AB-2H.
        "supraharmoniczne": ("AB-4H", PhysicsDomain.SUPRAHARMONIC_FREQUENCY_DOMAIN),
    }
    for rodzaj, (kamien, domena) in oczekiwane.items():
        nieobecny = RODZAJE_BIEGOW[rodzaj].solver_nieobecny
        assert nieobecny is not None
        assert nieobecny.kamien == kamien
        assert nieobecny.brak_pl.strip()
        assert domena_fizyczna_biegu(rodzaj) is domena


@pytest.mark.parametrize("analysis_type", sorted(RODZAJE_BIEGOW))
def test_para_odmowa_wtedy_i_tylko_wtedy_gdy_brak_zdolnosci(analysis_type: str) -> None:
    """Predykat parami: rodzaj z odmowa nie ma wpisu zdolnosci, rodzaj bez odmowy go ma."""
    ma_odmowe = RODZAJE_BIEGOW[analysis_type].solver_nieobecny is not None
    assert ma_odmowe is (zdolnosci_biegu(analysis_type) == [])


def test_kazdy_klucz_opcji_ma_kontrakt_i_kazdy_kontrakt_konsumenta() -> None:
    klucze = {klucz for rodzaj in RODZAJE_BIEGOW.values() for klucz in rodzaj.wymagane_opcje}
    assert klucze == set(biegi_czestotliwosciowe.KONTRAKTY_OPCJI)
    for analysis_type, rodzaj in RODZAJE_BIEGOW.items():
        assert bool(rodzaj.wymagane_opcje) is (analysis_type in RODZAJE_BIEGOW_BEZ_SOLVERA)


def _enm_zloty(klucz: str) -> None:
    set_enm(klucz, build_golden_enm())


@pytest.mark.parametrize("analysis_type", sorted(RODZAJE_BIEGOW_BEZ_SOLVERA))
def test_bieg_konczy_sie_odmowa_nazwana_z_brakiem_i_kamieniem(
    analysis_type: str,
) -> None:
    klucz = f"klucz-{analysis_type}-{uuid4()}"
    _enm_zloty(klucz)
    run = create_run(
        case_id=f"case-{analysis_type}",
        klucz_twin=klucz,
        analysis_type=analysis_type,
        options=OPCJE_POPRAWNE[analysis_type],
    )
    assert run.status == "CREATED"
    run = execute_run(run.id)
    assert run.status == "FAILED"
    assert run.raw_result is None
    komunikat = run.error_message or ""
    nieobecny = RODZAJE_BIEGOW[analysis_type].solver_nieobecny
    assert nieobecny is not None
    assert KOD_SOLVER_NIEOBECNY in komunikat
    assert nieobecny.kamien in komunikat
    assert nieobecny.brak_pl in komunikat
    if analysis_type == "supraharmoniczne":
        # Odmowa NAZYWA pasmo (granice, zrodlo definicji) — S-54.
        assert "2000–150000 Hz" in komunikat
        assert "dokument testowy" in komunikat
    else:
        assert "HARMONICZNE" in komunikat
    # Koperta API biegu ma domene z tabeli (fail-closed nie wywraca listy biegow).
    assert run.to_execution_dict()["analysis_type"] in RODZAJE_BIEGOW[analysis_type].typy_wykonawcze


def test_odmowa_jest_wyjatkiem_nazwanym_z_polami() -> None:
    with pytest.raises(SolverNieobecnyError) as exc:
        biegi_czestotliwosciowe.odmow_bieg_bez_solvera(
            "supraharmoniczne", OPCJE_POPRAWNE["supraharmoniczne"]
        )
    assert exc.value.kod == KOD_SOLVER_NIEOBECNY
    assert exc.value.kamien == "AB-4H"
    with pytest.raises(AssertionError):
        biegi_czestotliwosciowe.odmow_bieg_bez_solvera("PF", {})


@pytest.mark.parametrize(
    ("analysis_type", "opcje", "kod"),
    [
        ("harmoniczne", {}, KOD_OS_NIEPOPRAWNA),
        ("skan_czestotliwosciowy", {}, KOD_OS_NIEPOPRAWNA),
        ("supraharmoniczne", {}, KOD_PASMO_NIEPOPRAWNE),
        (
            "harmoniczne",
            {"os_czestotliwosci": {**OS_HARMONICZNA, "f_hz": [260.0]}},
            KOD_OS_NIEPOPRAWNA,
        ),
        (
            "supraharmoniczne",
            {"pasmo_supraharmoniczne": {k: v for k, v in PASMO.items() if k != "version"}},
            KOD_PASMO_NIEPOPRAWNE,
        ),
        # Opcja INNEGO rodzaju nie zastepuje wymaganej (pasmo nie jest osia).
        ("harmoniczne", {"pasmo_supraharmoniczne": PASMO}, KOD_OS_NIEPOPRAWNA),
    ],
)
def test_utworzenie_z_niepoprawnymi_opcjami_odmawia_z_kodem(
    analysis_type: str, opcje: dict[str, Any], kod: str
) -> None:
    klucz = f"klucz-zle-{uuid4()}"
    _enm_zloty(klucz)
    with pytest.raises(KontraktCzestotliwosciError) as exc:
        create_run(
            case_id="case-zle",
            klucz_twin=klucz,
            analysis_type=analysis_type,
            options=opcje,
        )
    assert exc.value.kod == kod


def test_walidacja_opcji_nie_zmienia_opcji_ani_odcisku_wejscia() -> None:
    klucz = f"klucz-hash-{uuid4()}"
    _enm_zloty(klucz)
    opcje = {"os_czestotliwosci": dict(OS_HARMONICZNA)}
    pierwszy = create_run(
        case_id="case-hash",
        klucz_twin=klucz,
        analysis_type="harmoniczne",
        options=opcje,
    )
    drugi = create_run(
        case_id="case-hash",
        klucz_twin=klucz,
        analysis_type="harmoniczne",
        options=opcje,
    )
    assert pierwszy.options["os_czestotliwosci"] == OS_HARMONICZNA
    assert pierwszy.input_hash == drugi.input_hash


def _nowy_przypadek_z_enm(client: TestClient) -> str:
    from application.twin_key import klucz_twin_dla_przypadku

    projekt = client.post("/api/projects", json={"name": "Rodzaje biegow — test"})
    assert projekt.status_code == 201, projekt.text
    przypadek = client.post(
        "/api/study-cases",
        json={"project_id": projekt.json()["id"], "name": "Przypadek"},
    )
    assert przypadek.status_code == 201, przypadek.text
    case_id = str(przypadek.json()["id"])
    set_enm(
        klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory),
        build_golden_enm(),
    )
    return case_id


@pytest.mark.parametrize("analysis_type", sorted(RODZAJE_BIEGOW_BEZ_SOLVERA))
def test_sciezka_api_utworzenie_i_wykonanie_konczy_sie_odmowa(
    analysis_type: str,
) -> None:
    """Natywna sciezka HTTP: POST utworzenia (201) → POST wykonania → FAILED z odmowa;
    brak opcji → 422 z kodem kontraktu (nie 409)."""
    (typ,) = RODZAJE_BIEGOW[analysis_type].typy_wykonawcze
    with TestClient(app) as client:
        case_id = _nowy_przypadek_z_enm(client)
        brak = client.post(
            f"/api/execution/study-cases/{case_id}/runs",
            json={"analysis_type": typ, "solver_input": {}},
        )
        assert brak.status_code == 422, brak.text
        assert brak.json()["detail"]["kod"] in (
            KOD_OS_NIEPOPRAWNA,
            KOD_PASMO_NIEPOPRAWNE,
        )
        utworz = client.post(
            f"/api/execution/study-cases/{case_id}/runs",
            json={"analysis_type": typ, "solver_input": OPCJE_POPRAWNE[analysis_type]},
        )
        assert utworz.status_code == 201, utworz.text
        wykonaj = client.post(f"/api/execution/runs/{utworz.json()['id']}/execute")
    assert wykonaj.status_code == 200, wykonaj.text
    cialo = wykonaj.json()
    assert cialo["status"] == "FAILED"
    assert KOD_SOLVER_NIEOBECNY in cialo["error_message"]


@pytest.mark.parametrize("analysis_type", sorted(RODZAJE_BIEGOW_BEZ_SOLVERA))
def test_gotowosc_nigdy_ready_i_poza_pelna_lista(analysis_type: str) -> None:
    """A-7: gotowosc rodzaju bez solvera NIGDY `ready` — na kompletnym modelu zlotym tez;
    pelna lista `evaluate()` (ostrzezenia widoczne projektantowi) go nie zawiera."""
    serwis = CalculationReadinessService()
    enm = build_golden_enm()
    raport = serwis.evaluate_single(enm, analysis_type)  # type: ignore[arg-type]
    assert raport.status == "blocked"
    nieobecny = RODZAJE_BIEGOW[analysis_type].solver_nieobecny
    assert nieobecny is not None
    assert raport.missing_fields_pl == [nieobecny.brak_pl]
    assert nieobecny.kamien in (raport.recommended_action_pl or "")
    pelna = serwis.evaluate(enm)
    assert analysis_type not in {pozycja.calculation_type for pozycja in pelna.items}


def _pliki_frontu() -> list[Path]:
    return [
        sciezka
        for sciezka in FRONTEND_SRC.rglob("*")
        if sciezka.suffix in {".ts", ".tsx"}
        and "__tests__" not in sciezka.parts
        and "harness-fixtures" not in sciezka.parts
    ]


def test_typ_wykonawczy_frontu_jest_podzbiorem_tabeli_bez_rodzajow_bez_solvera() -> None:
    """Lista 7 (odkryta przy inwentarzu): `frontend/src/ui/study-cases/types.ts::
    ExecutionAnalysisType` — reczne lustro typow, ktore UI oferuje w pickerach
    (`ui2/spaces/obliczenia/UruchomObliczenie.tsx`). PRZYPIETA: kazdy czlon frontu jest
    typem wykonawczym tabeli, a zaden nie nalezy do rodzaju bez solvera."""
    import re

    tekst = (FRONTEND_SRC / "ui" / "study-cases" / "types.ts").read_text(encoding="utf-8")
    blok = tekst.split("export type ExecutionAnalysisType =", 1)[1].split(";", 1)[0]
    typy_frontu = set(re.findall(r"'([A-Z0-9_]+)'", blok))
    assert typy_frontu, "parser unii frontu do poprawy — zobaczyl pustke"
    wszystkie = {typ for rodzaj in RODZAJE_BIEGOW.values() for typ in rodzaj.typy_wykonawcze}
    bez_solvera = {
        typ for nazwa in RODZAJE_BIEGOW_BEZ_SOLVERA for typ in RODZAJE_BIEGOW[nazwa].typy_wykonawcze
    }
    assert typy_frontu <= wszystkie
    assert typy_frontu & bez_solvera == set()


def test_rodzaje_bez_solvera_niewidoczne_w_ui() -> None:
    """ZASADA NR 1: rodzaj bez solvera nie jest oferowany w zadnym pickerze ui2/ui —
    ani kod `analysis_type`, ani typ wykonawczy nie wystepuja w zrodle frontu."""
    pliki = _pliki_frontu()
    assert len(pliki) > 500, "parser plikow frontu do poprawy — zobaczyl za malo"
    tokeny = set()
    for rodzaj in RODZAJE_BIEGOW_BEZ_SOLVERA:
        tokeny.add(f"'{rodzaj}'")
        tokeny |= {f"'{typ}'" for typ in RODZAJE_BIEGOW[rodzaj].typy_wykonawcze}
    trafienia = [
        f"{sciezka.relative_to(FRONTEND_SRC)}: {token}"
        for sciezka in pliki
        for token in tokeny
        if token in sciezka.read_text(encoding="utf-8")
    ]
    assert trafienia == []


# ---------------------------------------------------------------------------
# Krok 3 — wycofanie jednym mechanizmem (`availability="withdrawn"`)
# ---------------------------------------------------------------------------


def _wycofane_v126() -> set[str]:
    return {
        analysis_type.removeprefix("v126:")
        for analysis_type, klucz in BIEGI_V126.items()
        if SOLVER_CAPABILITY_REGISTRY[klucz].availability == "withdrawn"
    }


def test_wycofanie_jednym_mechanizmem_rejestr_api_katalog() -> None:
    """Para: rejestr `withdrawn` ⇔ tresc 410 w API ⇔ karta katalogu nieprezentowana z powodem
    ⇔ gotowosc WYCOFANA (dawna zaszyta krotka hosting/OPF w `v126_gotowosc.py` byla
    osma lista rodzajow wycofanych, rozjechana z rejestrem po wycofaniu harmonicznych)."""
    from application.analyses.v126_gotowosc import (  # noqa: PLC0415
        GOTOWOSC_WYCOFANA,
        ocen_gotowosc_v126,
    )
    from enm.models import EnergyNetworkModel, ENMHeader  # noqa: PLC0415

    wycofane = _wycofane_v126()
    pusty_model = EnergyNetworkModel(header=ENMHeader(name="parytet wycofania"))
    wycofane_w_gotowosci = {
        rodzaj.value
        for rodzaj in V126AnalysisType
        if ocen_gotowosc_v126(pusty_model, rodzaj, {}).gotowosc == GOTOWOSC_WYCOFANA
    }
    assert wycofane_w_gotowosci == wycofane
    assert wycofane == {
        "hosting_capacity",
        "opf_loss_lcc",
        "power_quality_harmonics",
        "ssci_impedance",
    }
    assert wycofane == {rodzaj.value for rodzaj in _ANALIZY_WYCOFANE}
    for kod in wycofane:
        karta = karta_analizy(kod)
        assert karta.prezentowany is False, kod
        assert karta.powod_wycofania_pl, kod


def test_nastepca_harmonicznych_istnieje_w_tabeli_rodzajow() -> None:
    zamiennik = _ANALIZY_WYCOFANE[V126AnalysisType.POWER_QUALITY_HARMONICS]["zamiennik"]
    (trasa,) = (pozycja["trasa"] for pozycja in zamiennik)
    assert "analysis_type=HARMONICZNE" in trasa
    assert "HARMONICZNE" in RODZAJE_BIEGOW["harmoniczne"].typy_wykonawcze
    # Rodzaj badawczy SSCI: bez zamiennika (powrot w AB-5H), powod nazwany.
    assert _ANALIZY_WYCOFANE[V126AnalysisType.SSCI_IMPEDANCE]["zamiennik"] == []


def test_przestrzen_harmonic_limits_usunieta() -> None:
    with TestClient(app) as client:
        odpowiedz = client.get("/api/catalog/v126/harmonic-limits")
        katalog = client.get("/api/catalog/v126/analysis-catalog")
    assert odpowiedz.status_code == 404
    assert "harmonic-limits" not in katalog.text
    assert "thdu_pnen50160_percent" not in katalog.text


@pytest.mark.parametrize(
    "rodzaj",
    [V126AnalysisType.POWER_QUALITY_HARMONICS, V126AnalysisType.SSCI_IMPEDANCE],
)
def test_post_nowego_biegu_wycofanego_rodzaju_410(rodzaj: V126AnalysisType) -> None:
    with TestClient(app) as client:
        case_id = _nowy_przypadek_z_enm(client)
        odpowiedz = client.post(
            f"/api/cases/{case_id}/runs/v126/{rodzaj.value}", json={"parameters": {}}
        )
    assert odpowiedz.status_code == 410, odpowiedz.text
    assert odpowiedz.json()["code"] == "v126.analysis_withdrawn"
