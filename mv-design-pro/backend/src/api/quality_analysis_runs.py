"""Końcówki API jakości wyników dla gotowych przebiegów (fundament okna W-607).

- ``GET /api/quality/sanity-bounds?run_id=`` — wiarygodność Ik'' per węzeł na
  bazie przebiegu zwarciowego (``short_circuit_sn``),
- ``GET /api/quality/energy-validation?run_id=`` — walidacja energetyczna
  (obciążenia, odchylenia napięć, budżet strat, bilans Q) na bazie przebiegu
  rozpływu (``PF``),
- ``GET /api/quality/flicker?run_id=`` — ocena migotania (Pst/Plt) i szybkich
  zmian napięcia źródeł falownikowych wg IEC/TR 61000-3-7 na bazie przebiegu
  zwarciowego (``short_circuit_sn``),
- ``POST /api/quality/as-built-compliance`` — raport zgodności powykonawczej:
  porównanie pomiarów z obiektu (lista JSON lub tekst CSV w body) z wynikiem
  FROZEN rozpływu (``PF``) i jawnymi tolerancjami (POST — jedyna końcówka rodziny
  z body, uzasadnione rozmiarem danych pomiarowych),
- ``GET /api/quality/design-verdict?case_id=`` — agregat werdyktu projektowego:
  rejestr kryteriów projektu (E1–E6) sklejony z gotowych widoków analiz obu
  biegów i danych modelu; JEDYNA końcówka rodziny parametryzowana PRZYPADKIEM,
  bo werdykt z definicji obejmuje więcej niż jeden przebieg,
- ``GET /api/quality/state-estimation/requirements?run_id=`` — wymagane wejścia
  estymacji stanu WLS (mapa węzeł→indeks, slack, minimalna liczba pomiarów),
- ``POST /api/quality/state-estimation`` — estymacja stanu metodą ważonych
  najmniejszych kwadratów (WLS) na bazie przebiegu rozpływu (``PF``): Y-bus z
  grafu + pomiary telemetryczne (SCADA/PMU) w body → estymowany stan (|V|, kąty),
  rezydua, χ² oraz detekcja złych danych. Solver liczy fizykę; API mapuje i
  serializuje. Bez pomiarów estymacja jest niemożliwa (422 — nie zmyślamy).

Warstwa PREZENTACJI/API: ładuje przebieg (404 gdy brak), deleguje mapowanie i
serializację do serwisów aplikacyjnych (ZERO fizyki) i zwraca zserializowany
widok. Zły rodzaj przebiegu / błąd danych → 422 z komunikatem w języku polskim.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import UUID

from application.analyses.arc_flash_view import build_arc_flash_view
from application.analyses.energy_validation.service import build_energy_validation_view
from application.analyses.migotanie import build_migotanie_view
from application.analyses.sanity_bounds import build_sanity_bounds_view
from application.analyses.state_estimation import (
    build_state_estimation_requirements,
    build_state_estimation_view,
)
from application.analyses.warunki_przylaczenia import build_warunki_przylaczenia_view
from application.analyses.werdykt_projektowy import build_werdykt_projektowy_view
from application.analyses.wytrzymalosc_cieplna_przewodow import build_wytrzymalosc_cieplna_view
from application.analyses.zgodnosc_powykonawcza import (
    build_zgodnosc_powykonawcza_view,
    parse_measurements_csv,
)
from enm.canonical_analysis import CanonicalRun
from enm.canonical_analysis import get_run as get_canonical_run
from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel

if TYPE_CHECKING:
    from analysis.reporting.arc_flash_report import ArcFlashReportContext

router = APIRouter(tags=["quality-analysis"])


class PomiarWejscie(BaseModel):
    """Pojedynczy pomiar z obiektu (rejestrator/pomiar odbiorowy)."""

    element_ref: str
    wielkosc: str
    wartosc: float
    jednostka: str


class TolerancjeWejscie(BaseModel):
    """Jawne tolerancje odbioru [%] (No-Heuristics — bez wartości domyślnych)."""

    napiecie_pct: float | None = None
    moc_pct: float | None = None


class ZgodnoscZadanie(BaseModel):
    """Żądanie raportu zgodności powykonawczej."""

    run_id: UUID
    pomiary: list[PomiarWejscie] | None = None
    csv: str | None = None
    tolerancje: TolerancjeWejscie | None = None


class ArcFlashZadanie(BaseModel):
    """Żądanie analizy Arc Flash (IEEE 1584-2018) dla gotowego przebiegu zwarciowego.

    Ik'' i napięcie węzła pochodzą z przebiegu; parametry projektowe (odległość robocza,
    odstęp elektrod, czas wyłączenia, konfiguracja elektrod, typ obudowy) — z żądania.
    """

    run_id: UUID
    working_distance_mm: float | None = None
    conductor_gap_mm: float | None = None
    arc_time_s: float | None = None
    electrode_config: str = "VCB"
    enclosure_type: str = "Typical"


class PomiarWLS(BaseModel):
    """Pojedynczy pomiar telemetryczny dla estymatora stanu WLS.

    Wartości w jednostkach względnych (pu) na tej samej bazie mocy co Y-bus.
    ``bus_ref``/``bus_j_ref`` to identyfikatory węzłów grafu (patrz końcówka
    ``/api/quality/state-estimation/requirements``).
    """

    meas_type: str
    bus_ref: str
    value: float
    sigma: float
    bus_j_ref: str | None = None
    label: str | None = None


class StanWLSZadanie(BaseModel):
    """Żądanie estymacji stanu WLS dla gotowego przebiegu rozpływu (PF)."""

    run_id: UUID
    pomiary: list[PomiarWLS] | None = None
    alpha: float = 0.01
    lnr_threshold: float = 3.0
    include_trace: bool = True


def _require_run(run_id: UUID) -> CanonicalRun:
    run = get_canonical_run(run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Przebieg {run_id} nie istnieje.",
        )
    return run


@router.get("/api/quality/sanity-bounds")
def get_sanity_bounds(run_id: UUID = Query(...)) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_sanity_bounds_view(run)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/quality/energy-validation")
def get_energy_validation(run_id: UUID = Query(...)) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_energy_validation_view(run)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/quality/flicker")
def get_flicker(run_id: UUID = Query(...)) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_migotanie_view(run)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/quality/conductor-thermal-withstand")
def get_conductor_thermal_withstand(run_id: UUID = Query(...)) -> dict[str, Any]:
    """Wytrzymalosc zwarciowa przewodow dla przebiegu zwarciowego (karta F-K1 faza 3).

    Kryterium IEC 60949 (I_th <= I_th(1s)/sqrt(t)) per galaz: czy przekroj wytrzyma
    prad zwarciowy przez czas wylaczenia. Brak danych daje pozycje NIESPRAWDZONA z
    kodem gotowosci — nigdy milczacego PASS.
    """
    run = _require_run(run_id)
    try:
        return build_wytrzymalosc_cieplna_view(run)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/quality/connection-conditions")
def get_connection_conditions(run_id: UUID = Query(...)) -> dict[str, Any]:
    """Ocena warunkow przylaczenia OSD wobec wyniku rozplywu (karta F-K2).

    Domyka lancuch E1 -> E5 -> E7: moc przylaczeniowa i wymagany cosfi z dokumentu
    OSD staja sie kryterium oceny mocy i cosfi RZECZYWISCIE wymienianych w punkcie
    przylaczenia. Brak danych daje pozycje NIESPRAWDZONA z kodem gotowosci — nigdy
    milczacego PASS.
    """
    run = _require_run(run_id)
    try:
        return build_warunki_przylaczenia_view(run)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.post("/api/quality/as-built-compliance")
def post_as_built_compliance(zadanie: ZgodnoscZadanie) -> dict[str, Any]:
    run = _require_run(zadanie.run_id)
    try:
        if zadanie.csv is not None and zadanie.csv.strip():
            pomiary: list[dict[str, Any]] = parse_measurements_csv(zadanie.csv)
        elif zadanie.pomiary:
            pomiary = [pomiar.model_dump() for pomiar in zadanie.pomiary]
        else:
            raise ValueError("Brak pomiarów: podaj listę 'pomiary' albo tekst 'csv' w żądaniu.")
        tolerancje = zadanie.tolerancje.model_dump() if zadanie.tolerancje else {}
        return build_zgodnosc_powykonawcza_view(run, pomiary, tolerancje)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/quality/state-estimation/requirements")
def get_state_estimation_requirements(run_id: UUID = Query(...)) -> dict[str, Any]:
    """Wymagane wejścia estymacji stanu WLS: mapa węzeł→indeks, slack, min. pomiarów.

    Publikuje identyfikatory węzłów (``bus_ref``), którymi muszą posługiwać się
    pomiary, oraz minimalną liczbę pomiarów dla obserwowalności. ZERO fizyki.
    """
    run = _require_run(run_id)
    try:
        return build_state_estimation_requirements(run)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.post("/api/quality/state-estimation")
def post_state_estimation(zadanie: StanWLSZadanie) -> dict[str, Any]:
    """Estymacja stanu WLS na gotowym przebiegu rozpływu (PF) z pomiarów telemetrii.

    Solver WLS liczy estymowany stan (|V|, kąty), rezydua, χ² i detekcję złych
    danych. Warstwa API tylko ładuje przebieg (404 gdy brak), deleguje mapowanie i
    serializację (ZERO fizyki). Brak pomiarów / zły przebieg / nieznany węzeł /
    układ nieobserwowalny → 422 z komunikatem po polsku.
    """
    run = _require_run(zadanie.run_id)
    try:
        pomiary = [pomiar.model_dump() for pomiar in (zadanie.pomiary or [])]
        return build_state_estimation_view(
            run,
            pomiary,
            alpha=zadanie.alpha,
            lnr_threshold=zadanie.lnr_threshold,
            include_trace=zadanie.include_trace,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.post("/api/quality/arc-flash")
def post_arc_flash(zadanie: ArcFlashZadanie) -> dict[str, Any]:
    run = _require_run(zadanie.run_id)
    try:
        return build_arc_flash_view(
            run,
            working_distance_mm=zadanie.working_distance_mm,
            conductor_gap_mm=zadanie.conductor_gap_mm,
            arc_time_s=zadanie.arc_time_s,
            electrode_config=zadanie.electrode_config,
            enclosure_type=zadanie.enclosure_type,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


class ArcFlashReportZadanie(ArcFlashZadanie):
    """Żądanie raportu Arc Flash: parametry analizy + metadane raportu.

    Raport TYLKO interpretuje policzony widok arc flash (ZERO fizyki w warstwie
    raportu) — solver liczy energię incydentu / AFB / kategorię ŚOI.
    """

    project_name: str = ""
    station_id: str = ""
    operator_pl: str = ""
    generated_at_iso: str = "1970-01-01T00:00:00Z"
    formats: list[str] = ["json", "text_pl", "latex"]


def _arc_flash_report_context(zadanie: ArcFlashReportZadanie) -> ArcFlashReportContext:
    from analysis.reporting.arc_flash_report import ArcFlashReportContext

    run = _require_run(zadanie.run_id)
    view = build_arc_flash_view(
        run,
        working_distance_mm=zadanie.working_distance_mm,
        conductor_gap_mm=zadanie.conductor_gap_mm,
        arc_time_s=zadanie.arc_time_s,
        electrode_config=zadanie.electrode_config,
        enclosure_type=zadanie.enclosure_type,
    )
    station_id = zadanie.station_id or str(view.get("analysis_id") or zadanie.run_id)
    return ArcFlashReportContext(
        project_name=zadanie.project_name or str(zadanie.run_id),
        station_id=station_id,
        arc_flash_view_dict=view,
        operator_pl=zadanie.operator_pl,
        generated_at_iso=zadanie.generated_at_iso,
    )


@router.post("/api/quality/arc-flash/report")
def post_arc_flash_report(zadanie: ArcFlashReportZadanie) -> dict[str, Any]:
    """Raport arc flash w wybranych formatach strukturalnych (json/text_pl/latex).

    PDF i DOCX dostępne przez `/api/quality/arc-flash/report.pdf` i `.docx`.
    """
    from analysis.reporting.arc_flash_report import (
        render_arc_flash_report_json,
        render_arc_flash_report_latex,
        render_arc_flash_report_text,
    )

    try:
        ctx = _arc_flash_report_context(zadanie)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    out: dict[str, Any] = {}
    if "json" in zadanie.formats:
        out["json"] = render_arc_flash_report_json(ctx)
    if "text_pl" in zadanie.formats:
        out["text_pl"] = render_arc_flash_report_text(ctx)
    if "latex" in zadanie.formats:
        out["latex"] = render_arc_flash_report_latex(ctx)
    return out


@router.post("/api/quality/arc-flash/report.pdf")
def post_arc_flash_report_pdf(zadanie: ArcFlashReportZadanie) -> Response:
    from analysis.reporting.arc_flash_report import render_arc_flash_report_pdf

    try:
        ctx = _arc_flash_report_context(zadanie)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return Response(
        content=render_arc_flash_report_pdf(ctx),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="raport_arc_flash.pdf"'},
    )


@router.post("/api/quality/arc-flash/report.docx")
def post_arc_flash_report_docx(zadanie: ArcFlashReportZadanie) -> Response:
    from analysis.reporting.arc_flash_report import render_arc_flash_report_docx

    try:
        ctx = _arc_flash_report_context(zadanie)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return Response(
        content=render_arc_flash_report_docx(ctx),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="raport_arc_flash.docx"'},
    )


@router.get("/api/quality/design-verdict")
def get_design_verdict(case_id: str = Query(...)) -> dict[str, Any]:
    """Agregat werdyktu projektowego dla przypadku obliczeniowego (karta F-K3).

    JEDYNA koncowka tej rodziny parametryzowana PRZYPADKIEM, nie przebiegiem — i
    tak byc musi: werdykt zestawia kryteria z ROZNYCH biegow (rozplyw + zwarcia) z
    danymi modelu, wiec pojedynczy ``run_id`` bylby z definicji za waski.

    Werdykt niesie trzy stany (spelnione / naruszone / niesprawdzone) oraz jawny
    zakres kryteriow, ktorych system NIE sprawdza automatycznie. Bieg nieaktualny
    wobec biezacego modelu daje NIESPRAWDZONE (regula 4 kanonu), nigdy spelnienie.
    """
    return build_werdykt_projektowy_view(case_id)
