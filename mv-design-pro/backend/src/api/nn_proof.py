"""API sekcji nN raportu obwodu (karta P0.10 §0.4).

Pakiet dowodowy weryfikacji obwodu nN NIE jest tu składany: dawne trasy
``POST /api/nn-proof/circuit/pack`` i ``/circuit/preview`` przyjmowały ręcznie wpisane
parametry (P, Q, Iz, ΔU, Ik″max) i syntetyczny identyfikator biegu — skasowane kartą
OBIEKT-KABEL-NN. Dowód obwodu powstaje z modelu i biegu:
``GET /api/cases/{case_id}/enm/nn-cable/dowod?cable_ref=…`` (`api/kabel_nn.py`).
"""

from __future__ import annotations

from typing import Any

from api.klucz_twin_dep import klucz_twin_z_sciezki
from enm.store import get_enm
from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/nn-proof", tags=["nn-proof"])


class LVCircuitReportRequest(BaseModel):
    """Sekcje nN raportu (karta P0.10 §0.4, zakres minimalny P0).

    Provenance (``run_id``/``revision_id``/``przypadek_decydujacy``) jest
    PARAMETREM WEJŚCIOWYM — analizy nN nie są persystowane jako ``AnalysisRun``
    (zob. docstring ``build_nn_circuit_report_section``), więc nie ma obiektu
    przebiegu, z którego dałoby się je odczytać.
    """

    case_id: str
    station_ref: str
    bus_ref: str
    breaker_ref: str
    run_id: str
    revision_id: str
    przypadek_decydujacy: str
    ib_a: float | None = None
    iz_prime_a: float | None = None
    ik_max_ka: float | None = None
    vdrop_u_source_kv: float | None = None
    vdrop_delta_u_total_kv: float | None = None


@router.post("/circuit/report")
def build_lv_circuit_report(payload: LVCircuitReportRequest, request: Request) -> dict[str, Any]:
    """Sekcje nN raportu dla obwodu (dane źródłowe, TR, odcinki, ΔU, Ik max/min,
    SWZ, dobór) — zakres minimalny P0 (karta P0.10 §0.4, pełny spis §63 w P1).
    """
    from api.analysis_run_exports import build_nn_circuit_report_section

    klucz = klucz_twin_z_sciezki(payload.case_id, request)
    enm = get_enm(klucz)
    return build_nn_circuit_report_section(
        enm=enm,
        station_ref=payload.station_ref,
        bus_ref=payload.bus_ref,
        breaker_ref=payload.breaker_ref,
        run_id=payload.run_id,
        revision_id=payload.revision_id,
        przypadek_decydujacy=payload.przypadek_decydujacy,
        ib_a=payload.ib_a,
        iz_prime_a=payload.iz_prime_a,
        ik_max_ka=payload.ik_max_ka,
        vdrop_u_source_kv=payload.vdrop_u_source_kv,
        vdrop_delta_u_total_kv=payload.vdrop_delta_u_total_kv,
    )
