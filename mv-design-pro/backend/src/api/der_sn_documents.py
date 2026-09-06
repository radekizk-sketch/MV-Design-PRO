"""D4 (RECENZJA_DER_SN_DOBORY_2026-07): API dokumentów toru DER-SN.

- ``GET /api/der-sn/{case_id}/compliance-report`` — raport zgodności ✓/⚠/❌
  (wymaganie 13) ze zmaterializowanego toru DER-SN,
- ``GET /api/der-sn/{case_id}/bom`` — lista materiałowa (BOM) toru DER-SN.

Warstwa PREZENTACJI/API: ładuje dokument ENM przypadku (404 gdy brak), deleguje
złożenie widoku do generatorów warstwy aplikacyjnej (ZERO fizyki), a przy opcji
``zapisz_do_magazynu`` przechwytuje REALNĄ treść dokumentu (JSON) do magazynu
F-E8.3 — dokładnie wzorcem istniejących przechwyceń (``store_generated_document``).
Zapis wymaga ``project_id`` (bez niego magazyn jest addytywnie pomijany).

Odstępstwa od propozycji D2 liczy warstwa API reużyciem istniejących kandydatów
katalogu (``grid_source_preview``) i solvera doboru (``der_selection_preview``) —
solver pozostaje czysty, katalog wiąże API. Brak/niekompletność katalogu ⇒ sekcja
D2 pominięta jawnie (uczciwy brak, nie fabrykacja).
"""

from __future__ import annotations

import json
from typing import Any

from api.document_store import store_generated_document
from api.klucz_twin_dep import KluczTwin
from application.analyses.der_sn_track import extract_der_sn_track, sum_apparent_power_mva
from application.analyses.lista_materialowa import build_bom_view
from application.analyses.raport_zgodnosci import build_compliance_report_from_track
from enm.store import get_enm, has_enm
from fastapi import APIRouter, HTTPException, Query, status

router = APIRouter(tags=["der-sn-documents"])


def _require_enm(case_id: str, klucz: str) -> dict[str, Any]:
    if not has_enm(klucz):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Przypadek {case_id} nie ma dokumentu ENM.",
        )
    return get_enm(klucz).model_dump(mode="json")


def _json_bytes(view: dict[str, Any]) -> bytes:
    """Serializuj deterministycznie (stabilna kolejność kluczy widoku, UTF-8)."""
    return json.dumps(view, ensure_ascii=False, indent=2).encode("utf-8")


def _store(
    *,
    project_id: str | None,
    doc_type: str,
    filename: str,
    view: dict[str, Any],
    source: str,
    run_ref: str | None,
) -> None:
    store_generated_document(
        project_ref=project_id,
        doc_type=doc_type,
        doc_format="JSON",
        filename=filename,
        content=_json_bytes(view),
        source=source,
        run_ref=run_ref,
    )


def _cable_derating_from_model(cable: dict[str, Any]) -> Any:
    """Warunki UŁOŻENIA zapisane przy kablu w modelu → współczynniki doboru (V12K-207).

    Brak zapisu = warunki katalogowe (tory zbudowane przed tą kartą liczą się identycznie
    jak dotąd). Nieznany/uszkodzony zapis też daje warunki katalogowe: sekcja odstępstw
    jest interpretacją, więc nie może wywrócić raportu — a walidacja nazwy stoi tam, gdzie
    dane wchodzą do modelu (`_der_cable_laying_conditions`).
    """
    from network_model.solvers.cable_ampacity_derating import (
        WARUNKI_KATALOGOWE,
        wspolczynniki_z_opisu,
    )

    opis = (cable.get("meta") or {}).get("cable_laying_conditions")
    if not isinstance(opis, dict):
        return WARUNKI_KATALOGOWE
    try:
        return wspolczynniki_z_opisu(
            opis.get("set_name"),
            f_grunt=opis.get("f_grunt"),
            f_wiazka=opis.get("f_wiazka"),
            f_grupa=opis.get("f_grupa"),
            opis_pl=opis.get("opis_pl"),
        )
    except ValueError:
        return WARUNKI_KATALOGOWE


def _zastosowana_wartosc(payload: dict[str, Any], klucz: str, etykieta: str) -> float:
    """Wartość RZECZYWIŚCIE ZASTOSOWANEGO elementu (transformator/kabel) do
    porównania z propozycją D2.

    Brak pola nie może być cichym zerem (FAB-E, E1): fabrykowana wartość 0.0
    zgłosiłaby FAŁSZYWE odstępstwo („zastosowano 0 MVA/mm²") zamiast uczciwego
    pominięcia sekcji, które ta funkcja już robi dla katalogu niekompletnego
    (``except Exception`` w ``_compute_d2_deviations`` poniżej) — podniesienie
    wyjątku tutaj trafia w TĘ SAMĄ, już istniejącą, udokumentowaną ścieżkę.
    """
    wartosc = payload.get(klucz)
    if wartosc is None:
        raise ValueError(
            f"Brak pola {klucz!r} zastosowanego {etykieta} — brak danych do "
            "porównania z propozycją D2."
        )
    return float(wartosc)


def _compute_d2_deviations(track: Any) -> list[dict[str, Any]] | None:
    """Odstępstwa zastosowanego doboru od propozycji D2 (⚠). ``None`` gdy brak danych.

    Reużywa kandydatów katalogu (``grid_source_preview``) i solvera doboru
    (``der_selection_preview``). Porównuje: przekrój kabla, moc TR, grupę połączeń.
    """
    tr = track.block_transformer
    cable = track.mv_cable
    if tr is None or cable is None or track.producer_bus is None or track.mv_bus is None:
        return None
    inverter_kv = track.producer_bus.get("voltage_kv")
    sn_bus_kv = track.mv_bus.get("voltage_kv")
    cable_length_km = cable.get("length_km")
    if not inverter_kv or not sn_bus_kv or not cable_length_km:
        return None

    try:
        from api.grid_source_preview import (
            _block_transformer_candidates,
            _cable_candidates,
        )
        from network_model.solvers.der_selection_preview import (
            BlockTransformerSelectionInput,
            CableSelectionInput,
            propose_block_transformer,
            propose_mv_cable,
        )

        sum_apparent = sum_apparent_power_mva(track)
        if sum_apparent <= 0:
            return None
        tr_result = propose_block_transformer(
            BlockTransformerSelectionInput(
                sum_apparent_power_mva=sum_apparent,
                primary_voltage_kv=float(sn_bus_kv),
                secondary_voltage_kv=float(inverter_kv),
                candidates=_block_transformer_candidates(),
            )
        )
        deviations: list[dict[str, Any]] = []
        if tr_result.proposal is not None:
            applied_sn = _zastosowana_wartosc(tr, "sn_mva", "transformatora")
            deviations.append(
                {
                    "parametr": "moc_transformatora_mva",
                    "zastosowano": round(applied_sn, 3),
                    "propozycja": round(tr_result.proposal.sn_mva, 3),
                    "odstepstwo": abs(applied_sn - tr_result.proposal.sn_mva) > 1e-6,
                }
            )
            applied_group = (tr.get("vector_group") or "").upper()
            proposed_group = (tr_result.proposal.vector_group or "").upper()
            if applied_group and proposed_group:
                deviations.append(
                    {
                        "parametr": "grupa_polaczen",
                        "zastosowano": tr.get("vector_group"),
                        "propozycja": tr_result.proposal.vector_group,
                        "odstepstwo": applied_group != proposed_group,
                    }
                )

        from enm.der_sn_validation import rated_current_a

        tr_current = rated_current_a(
            _zastosowana_wartosc(tr, "sn_mva", "transformatora"), float(sn_bus_kv)
        )
        if tr_current is not None:
            # V12K-207 (F-K7): propozycję trzeba policzyć dla TYCH SAMYCH warunków
            # ułożenia, które przyjęto w doborze — inaczej raport zgłaszałby odstępstwo
            # od propozycji, którą sam liczy przy innym założeniu (fałszywe ⚠).
            cable_result = propose_mv_cable(
                CableSelectionInput(
                    transformer_current_a=tr_current,
                    length_km=float(cable_length_km),
                    line_voltage_v=float(sn_bus_kv) * 1000.0,
                    cos_phi=0.95,
                    candidates=_cable_candidates(),
                    derating=_cable_derating_from_model(cable),
                )
            )
            if cable_result.proposal is not None:
                applied_cross = _zastosowana_wartosc(cable, "cross_section_mm2", "kabla")
                deviations.append(
                    {
                        "parametr": "przekroj_kabla_mm2",
                        "zastosowano": round(applied_cross, 1),
                        "propozycja": round(cable_result.proposal.cross_section_mm2, 1),
                        "odstepstwo": abs(applied_cross - cable_result.proposal.cross_section_mm2)
                        > 1e-6,
                    }
                )
        return deviations or None
    except Exception:
        # Katalog niekompletny/niedostępny — sekcja D2 pominięta jawnie (bez fabrykacji).
        return None


@router.get("/api/der-sn/{case_id}/compliance-report")
def get_der_sn_compliance_report(
    case_id: str,
    klucz: KluczTwin,
    generator_ref: str | None = Query(default=None),
    run_status: str | None = Query(default=None),
    readiness_codes: list[str] | None = Query(default=None),
    project_id: str | None = Query(default=None),
    zapisz_do_magazynu: bool = Query(default=False),
) -> dict[str, Any]:
    """Raport zgodności ✓/⚠/❌ toru DER-SN (wymaganie 13). 404 gdy brak toru."""
    enm = _require_enm(case_id, klucz)
    track = extract_der_sn_track(enm, generator_ref)
    if track is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Brak zmaterializowanego toru DER-SN w modelu przypadku.",
        )
    view = build_compliance_report_from_track(
        track,
        run_status=run_status,
        readiness_codes=readiness_codes,
        d2_deviations=_compute_d2_deviations(track),
    )
    if zapisz_do_magazynu:
        _store(
            project_id=project_id,
            doc_type="RAPORT_ZGODNOSCI",
            filename=f"raport_zgodnosci_{track.source_ref}.json",
            view=view,
            source="der-sn-compliance-report",
            run_ref=track.source_ref,
        )
    return view


@router.get("/api/der-sn/{case_id}/bom")
def get_der_sn_bom(
    case_id: str,
    klucz: KluczTwin,
    generator_ref: str | None = Query(default=None),
    project_id: str | None = Query(default=None),
    zapisz_do_magazynu: bool = Query(default=False),
) -> dict[str, Any]:
    """Lista materiałowa (BOM) toru DER-SN. 404 gdy brak toru."""
    enm = _require_enm(case_id, klucz)
    view = build_bom_view(enm, generator_ref)
    if view is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Brak zmaterializowanego toru DER-SN w modelu przypadku.",
        )
    if zapisz_do_magazynu:
        _store(
            project_id=project_id,
            doc_type="LISTA_MATERIALOWA",
            filename=f"lista_materialowa_{view['source_ref']}.json",
            view=view,
            source="der-sn-bom",
            run_ref=str(view["source_ref"]),
        )
    return view
