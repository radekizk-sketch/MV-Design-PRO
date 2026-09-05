"""Końcówki API analiz interpretacyjnych OZE dla gotowych przebiegów.

- ``GET /api/oze-analysis/grid-strength?run_id=`` — siła sieci SCR/WSCR na bazie
  przebiegu zwarciowego (``short_circuit_sn``),
- ``GET /api/oze-analysis/reactive-adequacy?run_id=`` — adekwatność mocy biernej
  na bazie przebiegu rozpływu (``PF``),
- ``GET /api/oze-analysis/hosting-capacity?run_id=`` — zdolność przyłączeniowa
  sieci (ile jeszcze OZE zmieści węzeł) jako deterministyczny przegląd scenariuszy
  rozpływu na modelu przebiegu (``PF``),
- ``GET /api/oze-analysis/pq-area?run_id=&bus_ref=`` — obszar bezpiecznej pracy
  P–Q wskazanego węzła jako deterministyczna siatka scenariuszy rozpływu (``PF``),
- ``GET /api/oze-analysis/osd-response?run_id=&source_ref=&command=`` — symulacja
  odpowiedzi źródła na polecenie OSD jako porównanie dwóch biegów rozpływu
  (bazowy + z poleceniem) na modelu przebiegu (``PF``),
- ``GET /api/oze-analysis/compensation-sizing?run_id=&bus_ref=&cos_phi_min=&uwzglednij_noc=``
  — dobór kompensacji mocy biernej z katalogu baterii kondensatorów jako
  deterministyczny przegląd rekordów katalogu (rosnąco po mocy) na modelu przebiegu
  (``PF``).

Dokumenty formalne (każdy w wariancie JSON oraz ``.docx`` i ``.pdf``):
``POST /api/oze-analysis/compliance-certificate``, ``…/osd-application``,
``…/connection-study``. Wszystkie przyjmują opcjonalny ``case_id`` (semantyka jak
``POST /api/ncrfg-tests/run``) — wskazanie przypadku dopina DOWÓD certyfikacji
PTPiREE z tabliczek urządzeń modelu. Bez ``case_id`` widok jest dokładnie taki
jak przed dodaniem dowodu (odciski sekcji i ``input_hash`` bez zmian).

Warstwa PREZENTACJI/API: ładuje przebieg (404 gdy brak), deleguje mapowanie do
serwisów aplikacyjnych (ZERO fizyki) i zwraca zserializowany widok 1:1 z buildera
interpretacji. Zły rodzaj przebiegu → 422 z komunikatem w języku polskim.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from api.document_store import store_generated_document_from_response
from api.klucz_twin_dep import KluczTwin, klucz_twin_z_sciezki
from application.analyses.certyfikat_zgodnosci import (
    CertyfikatBrakiError,
    CertyfikatZgodnosciRequest,
    build_certyfikat_view,
    render_certyfikat_docx,
    render_certyfikat_pdf,
)
from application.analyses.dobor_kompensacji import build_compensation_sizing_view
from application.analyses.dokument_studium import (
    DokumentStudiumBrakiError,
    DokumentStudiumIdentyfikacja,
    build_dokument_studium_view,
    render_dokument_studium_docx,
    render_dokument_studium_pdf,
)
from application.analyses.dowod_certyfikatu import (
    dowody_certyfikatu,
    dowody_certyfikatu_typu,
)
from application.analyses.frt_sekwencja import build_frt_sekwencja_view
from application.analyses.frt_trajektorie import build_frt_trajectories_view
from application.analyses.grid_strength import build_grid_strength_view
from application.analyses.hosting_capacity import (
    DEFAULT_MAX_STEPS,
    DEFAULT_STEP_MW,
    build_hosting_capacity_view,
)
from application.analyses.ochrona_lom import build_ochrona_lom_view
from application.analyses.odpowiedz_osd import (
    DEFAULT_DEADBAND_HZ,
    DEFAULT_F0_HZ,
    build_osd_response_view,
)
from application.analyses.pq_area import (
    DEFAULT_MAX_STEPS_P,
    DEFAULT_MAX_STEPS_Q,
    DEFAULT_STEP_P_MW,
    DEFAULT_STEP_Q_MVAR,
    build_pq_area_view,
)
from application.analyses.pq_coverage import build_pq_coverage_view
from application.analyses.reactive_adequacy import build_reactive_adequacy_view
from application.analyses.wniosek_osd import (
    WniosekOsdBrakiError,
    WniosekOsdIdentyfikacja,
    build_wniosek_osd_view,
    render_wniosek_osd_docx,
    render_wniosek_pdf,
)
from catalog.profiles.nc_rfg.loader import load_nc_rfg_profile
from enm.canonical_analysis import CanonicalRun
from enm.canonical_analysis import get_run as get_canonical_run
from enm.store import get_enm, has_enm
from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import Response
from network_model.catalog.repository import get_default_mv_catalog
from network_model.solvers.ncrfg_ptpiree import NcRfgPtpireeRunRequest, NcRfgPtpireeSolver
from pydantic import BaseModel, Field

router = APIRouter(tags=["oze-analysis"])
_ncrfg_solver = NcRfgPtpireeSolver()


def _require_run(run_id: UUID) -> CanonicalRun:
    run = get_canonical_run(run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Przebieg {run_id} nie istnieje.",
        )
    return run


def _klucz_opcjonalny(case_id: UUID | None, request: Request) -> str | None:
    """Klucz magazynu ENM dla `case_id` OPCJONALNY (dowód certyfikatu PTPiREE).

    `None` zostaje `None` (bez dowodu, jak przed dodaniem tej funkcji);
    podany `case_id` tłumaczy się TĄ SAMĄ funkcją co reszta API (CV-1-W,
    404 gdy przypadek nie należy do żadnego projektu) — patrz
    `api/klucz_twin_dep.py`.
    """
    if case_id is None:
        return None
    return klucz_twin_z_sciezki(str(case_id), request)


@router.get("/api/oze-analysis/lom-protection")
def get_lom_protection(klucz: KluczTwin, case_id: str = Query(...)) -> dict[str, Any]:
    """Weryfikacja ochrony przed pracą wyspową (LoM) dla modułów wytwórczych.

    Ładuje dokument ENM przypadku (404 gdy przypadek nieznany) i deleguje ocenę
    do serwisu interpretacji (ZERO fizyki). 200 z uczciwymi INFO przy brakach danych.
    """
    if not has_enm(klucz):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Przypadek {case_id} nie ma dokumentu ENM.",
        )
    enm = get_enm(klucz)
    return build_ochrona_lom_view(enm)


@router.get("/api/oze-analysis/grid-strength")
def get_grid_strength(run_id: UUID = Query(...)) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_grid_strength_view(run)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/oze-analysis/reactive-adequacy")
def get_reactive_adequacy(run_id: UUID = Query(...)) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_reactive_adequacy_view(run)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/oze-analysis/hosting-capacity")
def get_hosting_capacity(
    run_id: UUID = Query(...),
    candidate_bus_refs: list[str] | None = Query(default=None),
    step_mw: float = Query(default=DEFAULT_STEP_MW),
    max_steps: int = Query(default=DEFAULT_MAX_STEPS),
) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_hosting_capacity_view(
            run,
            candidate_bus_refs=candidate_bus_refs,
            step_mw=step_mw,
            max_steps=max_steps,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/oze-analysis/pq-area")
def get_pq_area(
    run_id: UUID = Query(...),
    bus_ref: str = Query(...),
    step_p_mw: float = Query(default=DEFAULT_STEP_P_MW),
    step_q_mvar: float = Query(default=DEFAULT_STEP_Q_MVAR),
    max_steps_p: int = Query(default=DEFAULT_MAX_STEPS_P),
    max_steps_q: int = Query(default=DEFAULT_MAX_STEPS_Q),
) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_pq_area_view(
            run,
            bus_ref=bus_ref,
            step_p_mw=step_p_mw,
            step_q_mvar=step_q_mvar,
            max_steps_p=max_steps_p,
            max_steps_q=max_steps_q,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/oze-analysis/compensation-sizing")
def get_compensation_sizing(
    run_id: UUID = Query(...),
    bus_ref: str = Query(...),
    cos_phi_min: float = Query(...),
    uwzglednij_noc: bool = Query(default=False),
) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_compensation_sizing_view(
            run,
            bus_ref=bus_ref,
            cos_phi_min=cos_phi_min,
            uwzglednij_noc=uwzglednij_noc,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/oze-analysis/frt-trajectories")
def get_frt_trajectories(
    der_ref: str = Query(...),
    operator_id: str = Query(...),
    test_kind: str = Query(...),
) -> dict[str, Any]:
    converter = get_default_mv_catalog().get_converter_type(der_ref)
    if converter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Moduł DER '{der_ref}' nie istnieje w katalogu przekształtników.",
        )
    try:
        profile = load_nc_rfg_profile(operator_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    try:
        return build_frt_trajectories_view(converter, profile, test_kind)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


def _parse_sekwencja(raw: str) -> list[tuple[float, float]]:
    """Sparsuj parametr ``sekwencja`` (``głębokość:czas`` rozdzielone przecinkami).

    Format API: kropka dziesiętna, np. ``0.05:0.15,0.30:0.20``. Pusty łańcuch daje
    pustą sekwencję (pustość rozstrzyga serwis). Błąd formatu → ``ValueError`` PL.
    """
    if not raw.strip():
        return []
    zapady: list[tuple[float, float]] = []
    for segment in raw.split(","):
        segment = segment.strip()
        parts = segment.split(":")
        if len(parts) != 2:
            raise ValueError(
                f"Zły format sekwencji: segment '{segment}' — oczekiwano pary "
                "'głębokość:czas' (np. 0.05:0.15)."
            )
        try:
            depth = float(parts[0])
            czas = float(parts[1])
        except ValueError as exc:
            raise ValueError(
                f"Zły format sekwencji: segment '{segment}' zawiera niepoprawną liczbę "
                "(oczekiwano wartości dziesiętnych z kropką, np. 0.30:0.20)."
            ) from exc
        zapady.append((depth, czas))
    return zapady


def _resolve_grid_strength_row(run_id: UUID | None, bus_ref: str | None) -> dict[str, Any] | None:
    """Wiersz SCR/WSCR węzła ``bus_ref`` z widoku siły sieci przebiegu ``run_id`` (D1).

    Bez parametrów → ``None`` (uczciwy brak kontekstu). Podanie tylko jednego z pary
    lub węzła spoza wyników → 422 PL. Nieznany przebieg → 404 (``_require_run``).
    """
    if run_id is None and bus_ref is None:
        return None
    if run_id is None or bus_ref is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Kontekst siły sieci wymaga obu parametrów: run_id oraz bus_ref.",
        )
    run = _require_run(run_id)
    try:
        view = build_grid_strength_view(run)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    for entry in view["entries"]:
        if entry.get("bus_ref") == bus_ref:
            return entry
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"Węzeł '{bus_ref}' nie występuje w wynikach siły sieci przebiegu {run_id}.",
    )


@router.get("/api/oze-analysis/frt-sequence")
def get_frt_sequence(
    der_ref: str = Query(...),
    operator_id: str = Query(...),
    sekwencja: str = Query(...),
    run_id: UUID | None = Query(default=None),
    bus_ref: str | None = Query(default=None),
) -> dict[str, Any]:
    converter = get_default_mv_catalog().get_converter_type(der_ref)
    if converter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Moduł DER '{der_ref}' nie istnieje w katalogu przekształtników.",
        )
    try:
        profile = load_nc_rfg_profile(operator_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    try:
        zapady = _parse_sekwencja(sekwencja)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    grid_strength_row = _resolve_grid_strength_row(run_id, bus_ref)
    try:
        return build_frt_sekwencja_view(
            converter, profile, zapady, grid_strength_row=grid_strength_row
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/oze-analysis/pq-coverage")
def get_pq_coverage(
    catalog_item_id: str = Query(...),
    operator_id: str = Query(...),
) -> dict[str, Any]:
    converter = get_default_mv_catalog().get_converter_type(catalog_item_id)
    if converter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Typ katalogowy '{catalog_item_id}' nie istnieje w katalogu przekształtników.",
        )
    try:
        profile = load_nc_rfg_profile(operator_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    try:
        return build_pq_coverage_view(converter, profile)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


def _certyfikat_view(
    request: CertyfikatZgodnosciRequest, klucz_twin: str | None = None
) -> dict[str, Any]:
    """Zbuduj widok certyfikatu tą samą ścieżką co macierz frontendu.

    Uruchamia deterministyczny solver NC RfG/PTPiREE (``POST /api/ncrfg-tests/run``
    używa tego samego solvera), po czym komponuje certyfikat z gotowych werdyktów.
    Nieznany profil operatora → 404 PL; braki kompletności → 422 z listą PL.

    ``klucz_twin`` (semantyka jak ``POST /api/ncrfg-tests/run``, klucz magazynu
    ENM już przetłumaczony z ``case_id`` na granicy API — CV-1-W) dopina dowód
    certyfikacji PTPiREE z tabliczek urządzeń modelu. Bez niego widok jest
    dokładnie taki jak przed dodaniem dowodu.
    """
    try:
        run_result = _ncrfg_solver.run(request.run_request)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    dowody = (
        None
        if klucz_twin is None
        else dowody_certyfikatu(klucz_twin, [module.der_ref for module in run_result.modules])
    )
    try:
        return build_certyfikat_view(
            run_result,
            nazwa_projektu=request.nazwa_projektu,
            nazwa_przypadku=request.nazwa_przypadku,
            dowody=dowody,
        )
    except CertyfikatBrakiError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "komunikat": "Certyfikat nie może powstać — dane zgodności "
                "niekompletne. Uzupełnij braki i powtórz generację.",
                "braki": exc.braki,
            },
        ) from exc


@router.post("/api/oze-analysis/compliance-certificate")
def post_compliance_certificate(
    request: CertyfikatZgodnosciRequest,
    http_request: Request,
    case_id: UUID | None = Query(default=None),
) -> dict[str, Any]:
    return _certyfikat_view(request, _klucz_opcjonalny(case_id, http_request))


@router.post("/api/oze-analysis/compliance-certificate.docx")
def post_compliance_certificate_docx(
    request: CertyfikatZgodnosciRequest,
    http_request: Request,
    case_id: UUID | None = Query(default=None),
) -> Response:
    view = _certyfikat_view(request, _klucz_opcjonalny(case_id, http_request))
    docx_bytes = render_certyfikat_docx(view)
    return Response(
        content=docx_bytes,
        media_type=("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        headers={"Content-Disposition": 'attachment; filename="certyfikat_zgodnosci_ncrfg.docx"'},
    )


@router.post("/api/oze-analysis/compliance-certificate.pdf")
def post_compliance_certificate_pdf(
    request: CertyfikatZgodnosciRequest,
    http_request: Request,
    case_id: UUID | None = Query(default=None),
) -> Response:
    view = _certyfikat_view(request, _klucz_opcjonalny(case_id, http_request))
    pdf_bytes = render_certyfikat_pdf(view)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="certyfikat_zgodnosci_ncrfg.pdf"'},
    )


class WniosekOsdRequest(BaseModel):
    """Wejście generatora wniosku OSD: identyfikacja + odwołania do przebiegów."""

    nazwa_projektu: str = Field(min_length=1)
    nazwa_przypadku: str | None = None
    wnioskodawca: str | None = None
    adres_przylaczenia: str | None = None
    pf_run_id: UUID
    sc_run_id: UUID
    bus_ref: str = Field(min_length=1)
    run_request: NcRfgPtpireeRunRequest


def _wniosek_osd_view(request: WniosekOsdRequest, klucz_twin: str | None = None) -> dict[str, Any]:
    """Zbuduj widok wniosku OSD z gotowych przebiegów i macierzy NC RfG.

    Ładuje przebieg rozpływu i zwarciowy (404 gdy brak), uruchamia deterministyczny
    solver NC RfG (404 gdy nieznany profil operatora), po czym komponuje wniosek.
    Braki kompletności → 422 z listą po polsku (wniosek nie powstaje).

    ``klucz_twin`` (semantyka jak ``POST /api/ncrfg-tests/run``, klucz magazynu
    ENM już przetłumaczony z ``case_id`` na granicy API — CV-1-W) dopina dowód
    certyfikacji PTPiREE z tabliczek urządzeń modelu. Bez niego widok jest
    dokładnie taki jak przed dodaniem dowodu (odciski sekcji bez zmian).
    """
    pf_run = _require_run(request.pf_run_id)
    sc_run = _require_run(request.sc_run_id)
    try:
        ncrfg_run_result = _ncrfg_solver.run(request.run_request)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    dowody = (
        None
        if klucz_twin is None
        else dowody_certyfikatu(klucz_twin, [module.der_ref for module in ncrfg_run_result.modules])
    )
    identyfikacja = WniosekOsdIdentyfikacja(
        nazwa_projektu=request.nazwa_projektu,
        nazwa_przypadku=request.nazwa_przypadku,
        wnioskodawca=request.wnioskodawca,
        adres_przylaczenia=request.adres_przylaczenia,
    )
    try:
        return build_wniosek_osd_view(
            pf_run,
            sc_run,
            ncrfg_run_result,
            bus_ref=request.bus_ref,
            identyfikacja=identyfikacja,
            dowody=dowody,
        )
    except WniosekOsdBrakiError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "komunikat": "Wniosek nie może powstać — dane przyłączeniowe "
                "niekompletne. Uzupełnij braki i powtórz generację.",
                "braki": exc.braki,
            },
        ) from exc


@router.post("/api/oze-analysis/osd-application")
def post_osd_application(
    request: WniosekOsdRequest,
    http_request: Request,
    case_id: UUID | None = Query(default=None),
) -> dict[str, Any]:
    return _wniosek_osd_view(request, _klucz_opcjonalny(case_id, http_request))


@router.post("/api/oze-analysis/osd-application.docx")
def post_osd_application_docx(
    request: WniosekOsdRequest,
    http_request: Request,
    case_id: UUID | None = Query(default=None),
) -> Response:
    view = _wniosek_osd_view(request, _klucz_opcjonalny(case_id, http_request))
    docx_bytes = render_wniosek_osd_docx(view)
    return Response(
        content=docx_bytes,
        media_type=("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        headers={"Content-Disposition": 'attachment; filename="wniosek_osd.docx"'},
    )


@router.post("/api/oze-analysis/osd-application.pdf")
def post_osd_application_pdf(
    request: WniosekOsdRequest,
    http_request: Request,
    case_id: UUID | None = Query(default=None),
) -> Response:
    view = _wniosek_osd_view(request, _klucz_opcjonalny(case_id, http_request))
    pdf_bytes = render_wniosek_pdf(view)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="wniosek_osd.pdf"'},
    )


@router.get("/api/oze-analysis/osd-response")
def get_osd_response(
    run_id: UUID = Query(...),
    source_ref: str = Query(...),
    command: str = Query(...),
    p_limit_pct: float | None = Query(default=None),
    q_mvar: float | None = Query(default=None),
    cos_phi: float | None = Query(default=None),
    q_charakter: str | None = Query(default=None),
    frequency_hz: float | None = Query(default=None),
    droop_pct: float | None = Query(default=None),
    deadband_hz: float = Query(default=DEFAULT_DEADBAND_HZ),
    f0_hz: float = Query(default=DEFAULT_F0_HZ),
) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_osd_response_view(
            run,
            source_ref=source_ref,
            command=command,
            p_limit_pct=p_limit_pct,
            q_mvar=q_mvar,
            cos_phi=cos_phi,
            q_charakter=q_charakter,
            frequency_hz=frequency_hz,
            droop_pct=droop_pct,
            deadband_hz=deadband_hz,
            f0_hz=f0_hz,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


class DokumentStudiumRequest(BaseModel):
    """Wejście generatora dokumentu studium: identyfikacja + parametry sekwencji."""

    nazwa_projektu: str = Field(min_length=1)
    nazwa_przypadku: str | None = None
    wnioskodawca: str | None = None
    adres_przylaczenia: str | None = None
    run_id: UUID
    catalog_item_id: str = Field(min_length=1)
    operator_id: str = Field(min_length=1)
    warianty: list[str] = Field(min_length=1)


def _dokument_studium_view(
    request: DokumentStudiumRequest, klucz_twin: str | None = None
) -> dict[str, Any]:
    """Zbuduj widok dokumentu studium serwerową kompozycją sekwencji kreatora.

    Ładuje przebieg bazowy (404 gdy brak), rozwiązuje typ katalogowy i profil
    operatora (przekazane do bramki braków twardych), po czym komponuje dokument.
    Braki twarde → 422 z listą po polsku (dokument nie powstaje). Błąd pojedynczego
    wariantu jest odnotowany w sekcji wariantu i nie przerywa dokumentu.

    ``klucz_twin`` (semantyka jak ``POST /api/ncrfg-tests/run``, klucz magazynu
    ENM już przetłumaczony z ``case_id`` na granicy API — CV-1-W) dopina dowód
    certyfikacji PTPiREE urządzeń modelu związanych z TYPEM katalogowym dokumentu
    (tożsamość urządzenia w studium to typ przekształtnika, nie moduł biegu — ten
    dokument nie uruchamia macierzy NC RfG). Bez niego widok jest dokładnie taki
    jak przed dodaniem dowodu (odcisk sekcji założeń bez zmian).
    """
    run = _require_run(request.run_id)
    converter = get_default_mv_catalog().get_converter_type(request.catalog_item_id)
    try:
        profile = load_nc_rfg_profile(request.operator_id)
    except FileNotFoundError:
        profile = None
    identyfikacja = DokumentStudiumIdentyfikacja(
        nazwa_projektu=request.nazwa_projektu,
        nazwa_przypadku=request.nazwa_przypadku,
        wnioskodawca=request.wnioskodawca,
        adres_przylaczenia=request.adres_przylaczenia,
    )
    try:
        return build_dokument_studium_view(
            run,
            converter,
            profile,
            catalog_item_id=request.catalog_item_id,
            operator_id=request.operator_id,
            warianty=list(request.warianty),
            identyfikacja=identyfikacja,
            dowody=(
                None
                if klucz_twin is None
                else dowody_certyfikatu_typu(klucz_twin, request.catalog_item_id)
            ),
        )
    except DokumentStudiumBrakiError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "komunikat": "Dokument studium nie może powstać — dane wejściowe "
                "niekompletne. Uzupełnij braki i powtórz generację.",
                "braki": exc.braki,
            },
        ) from exc


@router.post("/api/oze-analysis/connection-study")
def post_connection_study(
    request: DokumentStudiumRequest,
    http_request: Request,
    case_id: UUID | None = Query(default=None),
) -> dict[str, Any]:
    return _dokument_studium_view(request, _klucz_opcjonalny(case_id, http_request))


@router.post("/api/oze-analysis/connection-study.docx")
def post_connection_study_docx(
    request: DokumentStudiumRequest,
    http_request: Request,
    zapisz_do_magazynu: bool = Query(default=False),
    case_id: UUID | None = Query(default=None),
) -> Response:
    view = _dokument_studium_view(request, _klucz_opcjonalny(case_id, http_request))
    docx_bytes = render_dokument_studium_docx(view)
    response = Response(
        content=docx_bytes,
        media_type=("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        headers={"Content-Disposition": 'attachment; filename="dokument_studium.docx"'},
    )
    if zapisz_do_magazynu:
        store_generated_document_from_response(
            response,
            project_ref=_require_run(request.run_id).project_id,
            doc_type="STUDIUM_OZE",
            doc_format="DOCX",
            source="oze-connection-study",
            run_ref=str(request.run_id),
        )
    return response


@router.post("/api/oze-analysis/connection-study.pdf")
def post_connection_study_pdf(
    request: DokumentStudiumRequest,
    http_request: Request,
    zapisz_do_magazynu: bool = Query(default=False),
    case_id: UUID | None = Query(default=None),
) -> Response:
    view = _dokument_studium_view(request, _klucz_opcjonalny(case_id, http_request))
    pdf_bytes = render_dokument_studium_pdf(view)
    response = Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="dokument_studium.pdf"'},
    )
    if zapisz_do_magazynu:
        store_generated_document_from_response(
            response,
            project_ref=_require_run(request.run_id).project_id,
            doc_type="STUDIUM_OZE",
            doc_format="PDF",
            source="oze-connection-study",
            run_ref=str(request.run_id),
        )
    return response
