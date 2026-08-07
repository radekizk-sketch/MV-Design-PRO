"""Porownanie A/B wynikow zwarciowych PER PUNKT (karta KD-3, pozycja 11).

Koncowka jest cienka: bierze wiersze wynikow OBU przebiegow tym samym budowniczym
co `/analysis-runs/{run_id}/results/short-circuit` i oddaje delty policzone w
domenie (`domain/zwarcia_porownanie.py`). Zero fizyki, zero mutacji, wynik
deterministyczny.

DLACZEGO ISTNIEJE. Tryb zwarciowy ekranu porownan liczyl roznice w warstwie
prezentacji (dlug V12K-290) — dokladnie ta klasa, ktora dla porownan rozplywu
zamknela luka L-13. Teraz UI odczytuje gotowe pola.

DRUGA POSTAC TEGO SAMEGO WYNIKU (karta nakladki roznic, dlug „klient bez
dostawcy" V12K-326): `POST /api/short-circuit-comparisons/sld-overlay` oddaje TO
SAMO porownanie w kontrakcie overlay v1 — jako elementy schematu zamiast wierszy
tabeli. Dzieki temu „pokaz roznice na schemacie" ma realnego dostawce w tej samej
sciezce, ktora zasila tabele (wczesniej klient wolal `/api/execution/comparisons/
{id}/sld-delta-overlay` — trase, ktorej zaden router nie serwuje).
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from api.canonical_run_views import build_short_circuit_results_response
from application.result_mapping.zwarcia_delta_overlay_v1 import (
    RODZAJ_ANALIZY,
    zbuduj_nakladke_roznic,
)
from domain.result_contract_v1 import OverlayElementV1, OverlayLegendV1
from domain.zwarcia_porownanie import zbuduj_porownanie_zwarc
from enm.canonical_analysis import get_run as get_canonical_run
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/short-circuit-comparisons", tags=["short-circuit-comparison"])

#: Wersja kontraktu eksportu porownania zwarciowego. Podbicia MINOR: 1.1.0 —
#: ADDYTYWNE pola `delta_*_percent` liczone w backendzie; 1.2.0 — ADDYTYWNE pole
#: `element_id` (ref punktu na schemacie, potrzebny nakladce roznic); 1.3.0 —
#: ADDYTYWNE metryki `B_*` w nakladce roznic (wartosci bezwzgledne przebiegu B
#: obok delt — karta S9-13, etykieta na schemacie niesie „wartosc B i roznice").
#: Konsument starszej wersji nie widzi zadnej zmiany — pola nieistniejace sa
#: pomijane (`exclude_none`), a nieznane kody metryk ignorowane.
WERSJA_RAPORTU = "1.3.0"


class PunktZwarciowyDiffResponse(BaseModel):
    """Jeden punkt zwarciowy porownania.

    Pola `delta_*_percent` liczy BACKEND — w warstwie prezentacji bylaby to
    arytmetyka na wynikach solvera. Brak wartosci (A = 0 albo punkt bez
    odpowiednika) jest POMIJANY w odpowiedzi, nigdy zerem.
    """

    target_id: str
    target_name: str
    #: „AB" = punkt w obu przebiegach, „A"/„B" = wylacznie w jednym.
    obecny_w: str
    #: Ref elementu SIECI punktu zwarcia — tozsamosc uzywana na schemacie
    #: (`element_id`, przy braku konsument schodzi na `target_id`). Pole
    #: ADDYTYWNE, pomijane gdy nieznane (starszy wynik).
    element_id: str | None = None
    ikss_ka_a: float | None = None
    ikss_ka_b: float | None = None
    delta_ikss_ka: float | None = None
    delta_ikss_percent: float | None = None
    ip_ka_a: float | None = None
    ip_ka_b: float | None = None
    delta_ip_ka: float | None = None
    delta_ip_percent: float | None = None
    ith_ka_a: float | None = None
    ith_ka_b: float | None = None
    delta_ith_ka: float | None = None
    delta_ith_percent: float | None = None
    sk_mva_a: float | None = None
    sk_mva_b: float | None = None
    delta_sk_mva: float | None = None
    delta_sk_percent: float | None = None
    # Pelny bilans IEC 60909 — kolumny trybu eksperckiego ekranu porownan.
    rk_ohm_a: float | None = None
    rk_ohm_b: float | None = None
    delta_rk_ohm: float | None = None
    delta_rk_percent: float | None = None
    xk_ohm_a: float | None = None
    xk_ohm_b: float | None = None
    delta_xk_ohm: float | None = None
    delta_xk_percent: float | None = None
    zk_ohm_a: float | None = None
    zk_ohm_b: float | None = None
    delta_zk_ohm: float | None = None
    delta_zk_percent: float | None = None
    xr_ratio_a: float | None = None
    xr_ratio_b: float | None = None
    delta_xr_ratio: float | None = None
    delta_xr_percent: float | None = None
    i2t_ka2s_a: float | None = None
    i2t_ka2s_b: float | None = None
    delta_i2t_ka2s: float | None = None
    delta_i2t_percent: float | None = None


class ZwarciaPorownanieResponse(BaseModel):
    run_id_a: str
    run_id_b: str
    report_version: str = Field(default=WERSJA_RAPORTU)
    punkty: list[PunktZwarciowyDiffResponse]
    liczba_punktow_wspolnych: int
    liczba_punktow_tylko_a: int
    liczba_punktow_tylko_b: int


class CreateZwarciaPorownanieRequest(BaseModel):
    run_id_a: str = Field(..., description="UUID przebiegu zwarciowego A (odniesienie)")
    run_id_b: str = Field(..., description="UUID przebiegu zwarciowego B (porownywany)")


def _wiersze_zwarciowe(run_id: str) -> list[dict[str, Any]]:
    try:
        identyfikator = UUID(run_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nieprawidłowy identyfikator przebiegu: {run_id}",
        ) from exc

    run = get_canonical_run(identyfikator)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nie znaleziono obliczenia {run_id}",
        )
    payload = build_short_circuit_results_response(run)
    wiersze = payload.get("rows") or payload.get("results") or []
    return [w for w in wiersze if isinstance(w, dict)]


@router.post(
    "",
    response_model=ZwarciaPorownanieResponse,
    response_model_exclude_none=True,
)
def utworz_porownanie_zwarc(
    request: CreateZwarciaPorownanieRequest,
) -> ZwarciaPorownanieResponse:
    """Delty Ik''/ip/Ith/Sk'' per punkt zwarciowy dla pary przebiegow."""
    wynik = zbuduj_porownanie_zwarc(
        run_id_a=request.run_id_a,
        run_id_b=request.run_id_b,
        wiersze_a=_wiersze_zwarciowe(request.run_id_a),
        wiersze_b=_wiersze_zwarciowe(request.run_id_b),
    )
    dane = wynik.to_dict()
    return ZwarciaPorownanieResponse(
        run_id_a=dane["run_id_a"],
        run_id_b=dane["run_id_b"],
        punkty=[PunktZwarciowyDiffResponse(**p) for p in dane["punkty"]],
        liczba_punktow_wspolnych=dane["liczba_punktow_wspolnych"],
        liczba_punktow_tylko_a=dane["liczba_punktow_tylko_a"],
        liczba_punktow_tylko_b=dane["liczba_punktow_tylko_b"],
    )


class NakladkaRoznicResponse(BaseModel):
    """Nakladka roznic A/B gotowa do naniesienia na schemat.

    Ksztalt `elements`/`legend` to KONTRAKT OVERLAY V1 (`result_contract_v1`) —
    ten sam, ktorym warstwa wynikowa schematu karmi sie dla pojedynczego
    przebiegu. Dzieki temu roznice rysuje ta sama warstwa etykiet, bez drugiego
    kanalu renderu.

    Liczniki dziela WSZYSTKIE punkty porownania na cztery rozlaczne grupy;
    punkty bez odpowiednika i bez porownywalnych danych nie sa elementami
    nakladki (roznica dla nich nie istnieje), ale ich liczba jest jawna.
    """

    run_id_a: str
    run_id_b: str
    #: Rodzaj analizy nakladki — prefiks „DELTA_" mowi konsumentowi, ze wartosci
    #: sa ROZNICAMI, nie wielkosciami bezwzglednymi.
    analysis_type: str
    report_version: str = Field(default=WERSJA_RAPORTU)
    elements: dict[str, OverlayElementV1]
    legend: OverlayLegendV1
    #: Odcisk tresci nakladki — ten sam wynik porownania daje ten sam odcisk.
    content_hash: str
    liczba_punktow_zmienionych: int
    liczba_punktow_bez_zmian: int
    liczba_punktow_bez_odpowiednika: int
    liczba_punktow_bez_danych: int


@router.post(
    "/sld-overlay",
    response_model=NakladkaRoznicResponse,
)
def nakladka_roznic_na_schemacie(
    request: CreateZwarciaPorownanieRequest,
) -> NakladkaRoznicResponse:
    """Roznice Ik''/ip/Ith/Sk pary przebiegow w postaci nakladki na schemat.

    TA SAMA para przebiegow i TEN SAM wynik domeny co tabela porownania
    (`POST /api/short-circuit-comparisons`) — koncowka rozni sie wylacznie
    POSTACIA odpowiedzi (elementy schematu zamiast wierszy tabeli). Zero fizyki,
    zero mutacji, wynik deterministyczny.
    """
    porownanie = zbuduj_porownanie_zwarc(
        run_id_a=request.run_id_a,
        run_id_b=request.run_id_b,
        wiersze_a=_wiersze_zwarciowe(request.run_id_a),
        wiersze_b=_wiersze_zwarciowe(request.run_id_b),
    )
    nakladka = zbuduj_nakladke_roznic(porownanie)
    return NakladkaRoznicResponse(
        run_id_a=porownanie.run_id_a,
        run_id_b=porownanie.run_id_b,
        analysis_type=RODZAJ_ANALIZY,
        elements=nakladka.payload.elements,
        legend=nakladka.payload.legend,
        content_hash=nakladka.content_hash(),
        liczba_punktow_zmienionych=nakladka.liczba_punktow_zmienionych,
        liczba_punktow_bez_zmian=nakladka.liczba_punktow_bez_zmian,
        liczba_punktow_bez_odpowiednika=nakladka.liczba_punktow_bez_odpowiednika,
        liczba_punktow_bez_danych=nakladka.liczba_punktow_bez_danych,
    )
