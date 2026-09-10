from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from api.klucz_twin_dep import KluczTwin
from application.analyses.ssci_stability import build_ssci_stability_view
from application.analyses.v126_gotowosc import (
    ocen_gotowosc_v126,
    odpowiedz_gotowosci,
    uzupelnij_parametry_z_modelu,
)
from application.analyses.v126_katalog import katalog_do_dict
from enm.canonical_analysis import create_run as _create_canonical_run
from enm.canonical_analysis import execute_run as _execute_canonical_run
from enm.canonical_analysis import get_run as _get_canonical_run
from enm.store import get_enm
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
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
    pominiete_zrodla_v126,
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


class V126ZamiennikTrasy(BaseModel):
    trasa: str
    ekran: str


class V126AnalizaWycofanaResponse(BaseModel):
    """Ciało odmowy 410 dla rodzaju V12.6 zdjętego z powierzchni (karta W3-E).

    Ten sam kształt jedzie DODATKOWO jako pole addytywne `wycofany` na
    czterech końcówkach GET historycznego biegu tego rodzaju (results, trace,
    proof, report) — odtwarzalność zostaje, powierzchnia do NOWYCH biegów nie.
    """

    code: str
    analysis_type: str
    message_pl: str
    zamiennik: list[V126ZamiennikTrasy]
    powod_pl: str


# Karta W3-E (KARTA_W3 §0 rodzina D/F, 5 #8, 9 #7, 9 #10): oba rodzaje
# DUPLIKUJĄ kanon liczony gdzie indziej pełnym rozpływem/rzeczywistymi danymi
# katalogowymi — `_hosting_capacity` (impedancja Thevenina lokalna, Monte
# Carlo per szyna, BEZ sprzężenia sieci) wobec `application/analyses/
# hosting_capacity.py` (pełny rozpływ przez `bieg_wariantu`); `_opf_loss_lcc`
# (β = 0,45 zaszyte, `oltc_tap_position: 0` zawsze, prąd gałęzi z JEDNEJ
# szyny przez `_branch_current_a`) wobec `equipment_checks/transformer_losses.py`
# (β rzeczywisty z karty katalogowej) i badań OLTC (`power_flow_oltc_studies.py`,
# zaczep RZECZYWIŚCIE optymalizowany). LCC (Σ annual_kwh·cena/(1+r)^t) nie ma
# dziś kanonu — ekonomia cyklu życia jest decyzją właściciela OD-16, nie
# odtwarzana gdzie indziej. Solver FROZEN (B-01) NIETKNIĘTY: enum
# `V126AnalysisType` bez zmian, `_hosting_capacity`/`_opf_loss_lcc` zostają
# zdolnością solvera — GET historycznych biegów (trasy niżej) je odtwarza.
_ANALIZY_WYCOFANE: dict[V126AnalysisType, dict[str, Any]] = {
    V126AnalysisType.HOSTING_CAPACITY: {
        "zamiennik": [
            {
                "trasa": "GET /api/oze-analysis/hosting-capacity",
                "ekran": "OZE › Zdolność przyłączeniowa",
            }
        ],
        "powod_pl": ("lokalna impedancja Thevenina bez sprzężenia sieci; " "kanon = pełny rozpływ"),
    },
    V126AnalysisType.OPF_LOSS_LCC: {
        "zamiennik": [
            {
                "trasa": "POST /api/solver/transformer-losses",
                "ekran": "Kryteria › Wyposażenie",
            },
            {
                "trasa": (
                    "POST /api/execution/study-cases/{case_id}/runs "
                    "(analysis_type=LOAD_FLOW, run_options.oltc_*)"
                ),
                "ekran": "Wyniki › OLTC",
            },
        ],
        "powod_pl": (
            "β = 0,45 zaszyte, zaczep 0, prąd gałęzi z jednej szyny; "
            "LCC bez kanonu — decyzja właściciela OD-16"
        ),
    },
}


def _wycofanie_v126(analysis_type: V126AnalysisType) -> dict[str, Any] | None:
    """Ciało wycofania rodzaju V12.6 — JEDNO źródło prawdy dla 410 na POST i
    dla pola addytywnego `wycofany` na czterech końcówkach GET (karta W3-E).
    """
    dane = _ANALIZY_WYCOFANE.get(analysis_type)
    if dane is None:
        return None
    return {
        "code": "v126.analysis_withdrawn",
        "analysis_type": analysis_type.value,
        "message_pl": (
            f"Rodzaj analizy „{analysis_type.value}” zszedł z powierzchni V12.6 "
            "— duplikuje kanon liczony gdzie indziej."
        ),
        "zamiennik": dane["zamiennik"],
        "powod_pl": dane["powod_pl"],
    }


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


@router.post(
    "/cases/{case_id}/runs/v126/{analysis_type}",
    response_model=V126RunResponse,
    responses={
        410: {
            "model": V126AnalizaWycofanaResponse,
            "description": (
                "Rodzaj analizy zszedł z powierzchni V12.6 (duplikuje kanon liczony "
                "gdzie indziej) — karta W3-E."
            ),
        }
    },
)
def run_v126_analysis(
    case_id: UUID,
    klucz: KluczTwin,
    analysis_type: V126AnalysisType,
    request: V126RunRequest,
) -> V126RunResponse | JSONResponse:
    # Karta W3-E: dwa rodzaje V12.6 DUPLIKUJĄ kanon (patrz komentarz przy
    # `_ANALIZY_WYCOFANE`) i nie uruchamiają już NOWYCH biegów — odmowa stoi
    # PRZED logiką TEJ trasy (odczyt ENM, bramki 422 przypadku), bo dotyczy
    # samego rodzaju analizy, nie stanu przypadku: 410 zapada nawet dla
    # przypadku bez committed ENM (`klucz: KluczTwin` powyżej w sygnaturze to
    # zależność WSPÓLNA całego API tłumacząca `case_id` — musi zobaczyć
    # przypadek w bazie, zanim JAKAKOLWIEK trasa, w tym ta, w ogóle się
    # wykona; SS0 pkt 7 zakazuje drugiego miejsca tego tłumaczenia). GET
    # historycznych biegów sprzed tej karty zostaje (odtwarzalność).
    wycofanie = _wycofanie_v126(analysis_type)
    if wycofanie is not None:
        return JSONResponse(status_code=status.HTTP_410_GONE, content=wycofanie)
    enm = get_enm(klucz)
    # Karta B-02 / W3-E (2026-09-10): gotowość JEDNĄ funkcją dla ekranu
    # (`GET …/v126/gotowosc`) i dla uruchomienia — predykaty parami (KLASA §3).
    # Dawne bramki tej trasy (brak węzłów, `generator.q_missing`,
    # `generator.converter_card_missing`, `generator.harmonic_spectrum_missing`)
    # żyją w `application/analyses/v126_gotowosc.py` z tymi samymi kodami i
    # elementami w komunikacie; doszły braki danych, które solver FROZEN
    # zastępował wartościami z powietrza (uziom stacji, TRV, silniki, wyposażenie
    # przekaźnika, ograniczniki, liczba odbiorców). Parametry wyprowadzalne
    # z modelu (najwyższe Un jako napięcie łącznika, sposób uziemienia punktu
    # neutralnego) trafiają do biegu JAWNIE — proweniencja w zapisie wejścia.
    parametry = uzupelnij_parametry_z_modelu(enm, analysis_type, request.parameters)
    gotowosc = ocen_gotowosc_v126(enm, analysis_type, parametry)
    if not gotowosc.potwierdzona:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=gotowosc.komunikat_odmowy(),
        )
    model = _with_parameter_payloads(
        build_v126_input_from_enm(enm, parameters=parametry), parametry
    )
    # Karta W2-C: lista generatorów pominiętych CZĘŚCIOWO (część kandydatów ma
    # dane, część nie) — pole addytywne `pominiete_zrodla` w payloadzie biegu,
    # wyliczone TĄ SAMĄ oceną karty co budowa wejścia (`pominiete_zrodla_v126`,
    # reguła KLASA §3). Puste dla rodzajów, które `harmonic_sources`/`converters`
    # nie czytają (i tam, gdzie wszystkie/żadne kandydaty mają dane — gotowość
    # powyżej już to rozstrzygnęła).
    pominiete_zrodla: list[dict[str, str]] = []
    if analysis_type in (V126AnalysisType.POWER_QUALITY_HARMONICS, V126AnalysisType.SSCI_IMPEDANCE):
        pominiete_zrodla = pominiete_zrodla_v126(enm, parameters=parametry)
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
        options={"model": model.model_dump(mode="json"), "pominiete_zrodla": pominiete_zrodla},
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
    payload: dict[str, Any] = {
        "run_id": run["run_id"],
        "case_id": run["case_id"],
        "analysis_type": run["analysis_type"],
        "status": run["status"],
        "created_at": run["created_at"],
        "result": run["result"],
        "proof_ref": run["proof"]["proof_id"],
        "report_ref": run["report"]["report_id"],
    }
    # Karta W2-C: pola ADDYTYWNE (kontrakt odpowiedzi FROZEN — tylko dołożone
    # klucze, kształt istniejących 8 pól bez zmian). `pominiete_zrodla` —
    # generatory pominięte w wejściu wyliczone przy tworzeniu biegu (stashowane
    # w `run.options`, przeniesione tu przez wykonawcę `_execute_v126`).
    # `zrodla_widma` — proweniencja widma (KATALOG/RECZNE) dla źródeł, które
    # DO wejścia trafiły; wyprowadzona wprost z `run["input"]` (już istniejący,
    # pełny zapis wejścia solvera — zero nowego wyliczenia, zero ryzyka rozjazdu
    # z tym, co solver naprawdę policzył).
    pominiete = run.get("pominiete_zrodla")
    if pominiete:
        payload["pominiete_zrodla"] = pominiete
    zrodla_widma = [
        {"ref": zrodlo["source_ref"], "proweniencja": zrodlo.get("spectrum_provenance", "KATALOG")}
        for zrodlo in run.get("input", {}).get("harmonic_sources", [])
        if isinstance(zrodlo, dict) and isinstance(zrodlo.get("source_ref"), str)
    ]
    if zrodla_widma:
        payload["zrodla_widma"] = zrodla_widma
    # Karta W3-E: pole ADDYTYWNE `wycofany` na biegu HISTORYCZNYM rodzaju zdjętego
    # z powierzchni — kontrakt odpowiedzi FROZEN nietknięty (dołożony klucz),
    # odtwarzalność biegu zostaje, ale front pokazuje stan „analiza wycofana",
    # nie próbuje renderować wyniku jak rodzaju wciąż uruchamialnego.
    wycofanie = _wycofanie_v126(analysis_type)
    if wycofanie is not None:
        payload["wycofany"] = wycofanie
    return payload


@router.get("/analysis-runs/{run_id}/results/v126/{analysis_type}/trace")
def get_v126_trace(run_id: UUID, analysis_type: V126AnalysisType) -> dict[str, Any]:
    run = _require_run(run_id, analysis_type)
    result = run["result"]
    payload: dict[str, Any] = {
        "run_id": run["run_id"],
        "analysis_type": run["analysis_type"],
        "trace_version": "AcademicWhiteBoxTraceV1",
        "deterministic_hash": result["deterministic_hash"],
        "steps": result["white_box_trace"],
    }
    # Karta W3-E: adnotacja addytywna — WHITE BOX (`steps`) zostaje SUROWY i
    # kompletny (auditowalność solvera FROZEN nietknięta), `wycofany` jedzie
    # obok jako informacja o powierzchni, nie jako zmiana śladu.
    wycofanie = _wycofanie_v126(analysis_type)
    if wycofanie is not None:
        payload["wycofany"] = wycofanie
    return payload


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
    proof: dict[str, Any] = run["proof"]
    # Karta W3-E: `wycofany` addytywnie obok pakietu dowodowego — pakiet sam w
    # sobie zostaje NIETKNIĘTY (FROZEN, kroki z `white_box_trace` solvera).
    wycofanie = _wycofanie_v126(analysis_type)
    if wycofanie is not None:
        proof = {**proof, "wycofany": wycofanie}
    return proof


@router.get("/analysis-runs/{run_id}/results/v126/{analysis_type}/report")
def get_v126_report(run_id: UUID, analysis_type: V126AnalysisType) -> dict[str, Any]:
    run = _require_run(run_id, analysis_type)
    report: dict[str, Any] = run["report"]
    # Karta W3-E: `wycofany` addytywnie obok raportu — raport sam w sobie
    # zostaje NIETKNIĘTY (FROZEN, sekcje z wyniku solvera).
    wycofanie = _wycofanie_v126(analysis_type)
    if wycofanie is not None:
        report = {**report, "wycofany": wycofanie}
    return report


@router.get("/catalog/v126/{namespace}")
def get_v126_catalog(namespace: str) -> dict[str, Any]:
    catalogs: dict[str, Any] = {
        "analysis-types": [item.value for item in V126AnalysisType],
        # Karta B-02 / W3-E: katalog analiz z ZNACZENIEM inżynierskim (grupa,
        # pytanie, zakres, wielkości, podstawa oceny, dane wejściowe) —
        # jedno źródło prawdy dla ekranu „Analizy specjalistyczne".
        "analysis-catalog": katalog_do_dict(),
        "harmonic-limits": {
            "thdu_pnen50160_percent": 8.0,
            "thdu_ieee519_percent": 5.0,
            "tdd_ieee519_default_percent": 5.0,
            "individual_percent": {"5": 6.0, "7": 5.0, "11": 3.5, "13": 3.0},
        },
        # Tabela IEC 60071-1 zduplikowana z solverem FROZEN (`_insulation`,
        # `network_model/solvers/v126_academic.py:1653-1658` — B-01, solver
        # nie eksportuje jej, więc nie ma jak wskazać tu jednego źródła).
        # STRAŻNIK PARYTETU: `tests/test_v126_bil_parytet.py` uruchamia
        # `_insulation` przez publiczne wejście solvera (`V126AcademicSolver
        # .run(INSULATION_COORDINATION, …)`) i porównuje `bil_kv`/
        # `short_duration_50hz_kv` każdego wiersza z tabelą poniżej — zmiana w
        # JEDNYM miejscu bez drugiego daje czerwień (karta W3-E, KLASA §4:
        # deklaracja bez testu = fałszywa pewność).
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


@router.get("/cases/{case_id}/v126/gotowosc")
def get_v126_gotowosc(
    case_id: UUID,
    klucz: KluczTwin,
    analysis_type: V126AnalysisType | None = None,
    parametry: str | None = Query(
        default=None,
        description=(
            "Parametry projektanta (JSON, ten sam kształt co `V126RunRequest.parameters`) — "
            "gotowość ocenia DOKŁADNIE to wejście, które trafi do uruchomienia."
        ),
    ),
) -> dict[str, Any]:
    """Gotowość analiz V12.6 na zatwierdzonym modelu przypadku (karta B-02 / W3-E).

    Ta sama funkcja (`odpowiedz_gotowosci` → `ocen_gotowosc_v126`), którą
    `POST …/runs/v126/{rodzaj}` odmawia 422 — ekran pokazuje projektantowi PRZED
    uruchomieniem listę sprawdzonych warunków albo braków, a uruchomienie nie
    może ich ominąć. Bez `analysis_type` zwraca komplet rodzajów (katalog kart);
    z nim — jeden. Kształt odpowiedzi (`case_id`, `model_hash`, `przedmiot`,
    `analizy[]`) jest JEDEN z eksportem fixtur harnessu (§1 karty B02-BE-TESTY).
    """
    try:
        dane = json.loads(parametry) if parametry else {}
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Parametry projektanta nie są poprawnym JSON.",
        ) from exc
    if not isinstance(dane, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Parametry projektanta muszą być obiektem JSON.",
        )
    enm = get_enm(klucz)
    return odpowiedz_gotowosci(str(case_id), enm, analysis_type, dane)
