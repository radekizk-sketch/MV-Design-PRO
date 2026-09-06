from __future__ import annotations

from typing import Any
from uuid import UUID

from api.klucz_twin_dep import KluczTwin
from application.analyses.ssci_stability import build_ssci_stability_view
from domain.canonical_operations import READINESS_CODES
from enm.canonical_analysis import create_run as _create_canonical_run
from enm.canonical_analysis import execute_run as _execute_canonical_run
from enm.canonical_analysis import get_run as _get_canonical_run
from enm.store import get_enm
from fastapi import APIRouter, HTTPException, status
from network_model.solvers.v126_academic import V126AcademicSolver
from pydantic import BaseModel
from solver_input.moc_bierna_wytworcy import moc_bierna_wytworcy
from solver_input.v126_contracts import (
    V126AcademicInput,
    V126AnalysisType,
    V126ConverterInput,
    V126EarthingInput,
    V126HarmonicSourceInput,
    V126InsulationInput,
    V126MotorInput,
    V126RunRequest,
    build_v126_input_from_enm,
)

router = APIRouter(prefix="/api", tags=["v12.6-academic"])


class V126RunResponse(BaseModel):
    run_id: str
    case_id: str
    analysis_type: V126AnalysisType
    status: str
    result_url: str
    trace_url: str
    proof_url: str
    report_url: str
    deterministic_hash: str


def _require_run(run_id: UUID, analysis_type: V126AnalysisType) -> dict[str, Any]:
    """Bieg V12.6 z rejestru kanonicznego R1 (CV-4.3-A4, K5.2).

    Odtąd WSZYSTKIE typy analiz dzielą JEDEN rejestr biegów (`CanonicalRun`) —
    `run_id` obcy tej rodzinie (np. bieg PF/SC) jest odróżniony po prefiksie
    `analysis_type` ("v126:"), a nie tylko po nieobecności w słowniku, który do
    tej karty istniał WYŁĄCZNIE dla V12.6.
    """
    canonical_run = _get_canonical_run(run_id)
    if (
        canonical_run is None
        or not canonical_run.analysis_type.startswith("v126:")
        or canonical_run.raw_result is None
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Nie znaleziono uruchomienia V12.6."
        )
    run = canonical_run.raw_result
    if run["analysis_type"] != analysis_type.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Typ analizy w ścieżce nie zgadza się z zapisanym uruchomieniem.",
        )
    return run


def _with_parameter_payloads(
    model: V126AcademicInput, parameters: dict[str, Any]
) -> V126AcademicInput:
    update: dict[str, Any] = {"parameters": parameters}
    if isinstance(parameters.get("earthing"), dict):
        update["earthing"] = V126EarthingInput.model_validate(parameters["earthing"])
    if isinstance(parameters.get("insulation"), list):
        update["insulation"] = [
            V126InsulationInput.model_validate(item)
            for item in parameters["insulation"]
            if isinstance(item, dict)
        ]
    if isinstance(parameters.get("motors"), list):
        update["motors"] = [
            V126MotorInput.model_validate(item)
            for item in parameters["motors"]
            if isinstance(item, dict)
        ]
    if isinstance(parameters.get("harmonic_sources"), list):
        update["harmonic_sources"] = [
            V126HarmonicSourceInput.model_validate(item)
            for item in parameters["harmonic_sources"]
            if isinstance(item, dict)
        ]
    if isinstance(parameters.get("converters"), list):
        update["converters"] = [
            V126ConverterInput.model_validate(item)
            for item in parameters["converters"]
            if isinstance(item, dict)
        ]
    return model.model_copy(update=update)


@router.post("/cases/{case_id}/runs/v126/{analysis_type}", response_model=V126RunResponse)
def run_v126_analysis(
    case_id: UUID,
    klucz: KluczTwin,
    analysis_type: V126AnalysisType,
    request: V126RunRequest,
) -> V126RunResponse:
    enm = get_enm(klucz)
    if not enm.buses:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Przypadek nie ma committed ENM z węzłami. V12.6 nie uruchamia obliczeń z draftu UI.",
        )
    model = _with_parameter_payloads(
        build_v126_input_from_enm(enm, parameters=request.parameters), request.parameters
    )
    # Karta FAB-D2 (D2): `_opf_loss_lcc` (network_model/solvers/v126_academic.py)
    # sumuje straty jałowe transformatorów wprost (`p0_kw + pk_kw*0.45**2`) i nie
    # ma własnej ścieżki "brak danej = niedostępne" (solver FROZEN — B-01, nie
    # edytujemy go z tej karty). Brak p0_kw (odkąd `V126TransformerInput.p0_kw`
    # niesie `None` zamiast cichego 0.0) musi więc zablokować URUCHOMIENIE tej
    # jednej analizy tutaj, zanim payload trafi do solvera — inne typy analizy
    # V12.6 (SSCI, uziemienie, izolacja, rozruch silnika...) nie czytają p0_kw
    # i pozostają dostępne bez zmian.
    if analysis_type == V126AnalysisType.OPF_LOSS_LCC:
        bez_strat_jalowych = [t.ref for t in model.transformers if t.p0_kw is None]
        if bez_strat_jalowych:
            spec = READINESS_CODES["transformer.loss_data_missing"]
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"{spec.message_pl} (transformer.loss_data_missing) — "
                    f"transformatory bez strat jałowych: {', '.join(bez_strat_jalowych)}"
                ),
            )
    # Karta FAB-H (H2): `_branch_current_a` (network_model/solvers/v126_academic.py,
    # solver FROZEN — B-01, nie edytujemy go z tej karty) czyta
    # `bus.generation_mvar`, agregat zbudowany w `build_v126_input_from_enm` z Q
    # generatorów — a przy Q nieznanym kontrakt podstawia 0,0 jako strukturalne
    # wypełnienie (ten sam agregat karmi też analizy, które Q w ogóle nie
    # czytają). Tylko RELIABILITY_CONTINGENCY i OPF_LOSS_LCC faktycznie
    # konsumują `_branch_current_a`, więc tylko one są tu blokowane — wzorzec
    # identyczny z bramką p0_kw powyżej (karta FAB-D2).
    if analysis_type in (
        V126AnalysisType.RELIABILITY_CONTINGENCY,
        V126AnalysisType.OPF_LOSS_LCC,
    ):
        bez_mocy_biernej = [
            gen.ref_id
            for gen in enm.generators
            if moc_bierna_wytworcy(gen, gen.materialized_params).brak
        ]
        if bez_mocy_biernej:
            spec = READINESS_CODES["generator.q_missing"]
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"{spec.message_pl} (generator.q_missing) — "
                    f"generatory bez mocy biernej: {', '.join(bez_mocy_biernej)}"
                ),
            )
    # Karta FAB-H (domkniecie, B-01): `_z_conv_components` w solverze FROZEN liczy
    # punkt pracy z `converter.q_mvar or 0.0` — Q nieznane weszloby jako 0,0. Solver
    # nie jest edytowany (B-01), wiec analiza SSCI jest blokowana TUTAJ dla
    # przeksztaltnika, ktory solver by wybral (`_ssci_select_converter` — ta sama
    # regula wyboru, bez duplikatu), gdy jego Q jest nieznane (ten sam predykat
    # `moc_bierna_wytworcy` co wyzej, przeniesiony do `V126ConverterInput.q_mvar`).
    if analysis_type == V126AnalysisType.SSCI_IMPEDANCE:
        przeksztaltnik = V126AcademicSolver()._ssci_select_converter(model)
        if przeksztaltnik is not None and przeksztaltnik.q_mvar is None:
            spec = READINESS_CODES["generator.q_missing"]
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"{spec.message_pl} (generator.q_missing) — przeksztaltnik analizy "
                    f"SSCI bez mocy biernej: {przeksztaltnik.ref}"
                ),
            )
    # CV-4.3-A4 (K5.2, 2026-09-06): bieg V12.6 trafia do rejestru kanonicznego
    # R1 (`CanonicalRun`) zamiast słownika `_runs` w pamięci procesu — przeżywa
    # odtąd restart procesu i jest widoczny każdemu workerowi (`tests/test_v126_
    # canonical_run_persistence.py`). `analysis_type` istniejącego słownika
    # (`create_run`) rozszerzony o prefiks "v126:<typ>" — NIE nowy rejestr, NIE
    # nowa tabela. Model już zbudowany powyżej (ENM + parametry przypadku)
    # wędruje w `options["model"]`; wykonawca `_execute_v126`
    # (`enm/canonical_analysis.py`) go odtwarza i woli TEN SAM solver FROZEN.
    run = _create_canonical_run(
        case_id=str(case_id),
        klucz_twin=klucz,
        analysis_type=f"v126:{analysis_type.value}",
        options={"model": model.model_dump(mode="json")},
    )
    run = _execute_canonical_run(run.id)
    if run.status == "FAILED" or run.raw_result is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=run.error_message or "Bieg V12.6 nie powiódł się.",
        )
    result = run.raw_result["result"]
    return V126RunResponse(
        run_id=str(run.id),
        case_id=str(case_id),
        analysis_type=analysis_type,
        status="FINISHED",
        result_url=f"/api/analysis-runs/{run.id}/results/v126/{analysis_type.value}",
        trace_url=f"/api/analysis-runs/{run.id}/results/v126/{analysis_type.value}/trace",
        proof_url=f"/api/analysis-runs/{run.id}/results/v126/{analysis_type.value}/proof",
        report_url=f"/api/analysis-runs/{run.id}/results/v126/{analysis_type.value}/report",
        deterministic_hash=result["deterministic_hash"],
    )


@router.get("/analysis-runs/{run_id}/results/v126/{analysis_type}")
def get_v126_result(run_id: UUID, analysis_type: V126AnalysisType) -> dict[str, Any]:
    run = _require_run(run_id, analysis_type)
    return {
        "run_id": run["run_id"],
        "case_id": run["case_id"],
        "analysis_type": run["analysis_type"],
        "status": run["status"],
        "created_at": run["created_at"],
        "result": run["result"],
        "proof_ref": run["proof"]["proof_id"],
        "report_ref": run["report"]["report_id"],
    }


@router.get("/analysis-runs/{run_id}/results/v126/{analysis_type}/trace")
def get_v126_trace(run_id: UUID, analysis_type: V126AnalysisType) -> dict[str, Any]:
    run = _require_run(run_id, analysis_type)
    result = run["result"]
    return {
        "run_id": run["run_id"],
        "analysis_type": run["analysis_type"],
        "trace_version": "AcademicWhiteBoxTraceV1",
        "deterministic_hash": result["deterministic_hash"],
        "steps": result["white_box_trace"],
    }


@router.get("/analysis-runs/{run_id}/results/v126/ssci_impedance/stability")
def get_v126_ssci_stability(run_id: UUID) -> dict[str, Any]:
    """Werdykt stabilności SSCI (kryterium impedancyjne Nyquista) dla gotowego
    przebiegu ``ssci_impedance``.

    Warstwa analizy (Sun 2011 / Wen 2016) odczytuje tablice Z_grid(f)/Z_conv(f)/L(f)
    z przebiegu i wydaje werdykt (stabilny / ryzyko SSCI / niestabilny / brak danych)
    z metrykami (max|L|, margines różnicy faz, częstotliwość winna, bliskość −1,
    okrążenia) i wywodem White Box. ZERO fizyki w API — analiza tylko interpretuje
    gotowy wynik solvera. Uczciwy stan zerowy: brak przekształtnika/DER lub braki
    karty falownika → werdykt „brak danych" (bez fabrykacji).

    404 gdy przebieg nie istnieje; 409 gdy rodzaj przebiegu to nie ``ssci_impedance``;
    422 gdy przebieg nie niesie payloadu solvera SSCI.
    """
    run = _require_run(run_id, V126AnalysisType.SSCI_IMPEDANCE)
    try:
        return build_ssci_stability_view(run)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/analysis-runs/{run_id}/results/v126/{analysis_type}/proof")
def get_v126_proof(run_id: UUID, analysis_type: V126AnalysisType) -> dict[str, Any]:
    run = _require_run(run_id, analysis_type)
    return run["proof"]


@router.get("/analysis-runs/{run_id}/results/v126/{analysis_type}/report")
def get_v126_report(run_id: UUID, analysis_type: V126AnalysisType) -> dict[str, Any]:
    run = _require_run(run_id, analysis_type)
    return run["report"]


@router.get("/catalog/v126/{namespace}")
def get_v126_catalog(namespace: str) -> dict[str, Any]:
    catalogs: dict[str, Any] = {
        "analysis-types": [item.value for item in V126AnalysisType],
        "harmonic-limits": {
            "thdu_pnen50160_percent": 8.0,
            "thdu_ieee519_percent": 5.0,
            "tdd_ieee519_default_percent": 5.0,
            "individual_percent": {"5": 6.0, "7": 5.0, "11": 3.5, "13": 3.0},
        },
        "insulation-levels": [
            {"u_m_kv": 12.0, "bil_kv": 75.0, "short_duration_50hz_kv": 28.0},
            {"u_m_kv": 17.5, "bil_kv": 95.0, "short_duration_50hz_kv": 38.0},
            {"u_m_kv": 24.0, "bil_kv": 125.0, "short_duration_50hz_kv": 50.0},
            {"u_m_kv": 36.0, "bil_kv": 170.0, "short_duration_50hz_kv": 70.0},
        ],
        "reliability-defaults": [
            {"element": "linia_napowietrzna_sn", "lambda_per_km_year": 0.08, "mttr_h": 3.5},
            {"element": "kabel_sn", "lambda_per_km_year": 0.015, "mttr_h": 12.0},
            {"element": "transformator_sn_nn", "lambda_per_year": 0.008, "mttr_h": 48.0},
            {"element": "pole_sn", "lambda_per_year": 0.015, "mttr_h": 4.0},
        ],
        "converter-modes": ["GFL", "GFM_droop", "VSM", "Grid_Supporting"],
    }
    if namespace not in catalogs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nieznany katalog V12.6.")
    return {"namespace": namespace, "items": catalogs[namespace]}
