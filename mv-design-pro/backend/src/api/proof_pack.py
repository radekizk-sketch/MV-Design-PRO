from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from datetime import datetime
from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from application.proof_engine.packs.sc_asymmetrical import (
    SCAsymmetricalPackInput,
    SCAsymmetricalProofPack,
)
from application.proof_engine.packs.sc_symmetrical import SC3FPackInput, SC3FProofPack
from application.proof_engine.proof_pack import ProofPackContext, resolve_mv_design_pro_version
from fastapi import APIRouter, Depends, HTTPException, Response, status
from infrastructure.persistence.unit_of_work import UnitOfWork
from pydantic import BaseModel

router = APIRouter(prefix="/api/proof", tags=["proof-pack"])


class SCAsymmetricalPackRequest(BaseModel):
    project_id: str
    case_id: str
    run_id: str
    snapshot_id: str
    project_name: str
    case_name: str
    fault_node_id: str
    run_timestamp: datetime
    solver_version: str
    u_n_kv: float
    c_factor: float
    u_prefault_kv: float
    z1_re_ohm: float
    z1_im_ohm: float
    z2_re_ohm: float
    z2_im_ohm: float
    z0_re_ohm: float
    z0_im_ohm: float
    a_re: float
    a_im: float
    tk_s: float = 1.0
    m_factor: float = 1.0
    n_factor: float = 0.0


@router.get("/{project_id}/{case_id}/{run_id}/pack")
def download_proof_pack(
    project_id: UUID,
    case_id: UUID,
    run_id: UUID,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> Response:
    _ = project_id, case_id, run_id, uow_factory
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "Legacy proof-pack GET oparty o AnalysisRun/OperatingCase został wycofany z toru "
            "produkcyjnego V12.xx. Użyj kanonicznych eksportów i proof dla StudyCase."
        ),
    )


def _extract_snapshot_id(payload: dict) -> str:
    snapshot_id = payload.get("snapshot_id")
    if snapshot_id:
        return str(snapshot_id)
    active_snapshot = payload.get("active_snapshot_id")
    if active_snapshot:
        return str(active_snapshot)
    return "unknown"


@router.post("/sc-asymmetrical/pack")
def download_sc_asymmetrical_pack(payload: SCAsymmetricalPackRequest) -> Response:
    context = ProofPackContext(
        project_id=payload.project_id,
        case_id=payload.case_id,
        run_id=payload.run_id,
        snapshot_id=payload.snapshot_id,
        mv_design_pro_version=resolve_mv_design_pro_version(),
    )
    pack_input = SCAsymmetricalPackInput(
        project_name=payload.project_name,
        case_name=payload.case_name,
        fault_node_id=payload.fault_node_id,
        run_timestamp=payload.run_timestamp,
        solver_version=payload.solver_version,
        u_n_kv=payload.u_n_kv,
        c_factor=payload.c_factor,
        u_prefault_kv=payload.u_prefault_kv,
        z1_ohm=complex(payload.z1_re_ohm, payload.z1_im_ohm),
        z2_ohm=complex(payload.z2_re_ohm, payload.z2_im_ohm),
        z0_ohm=complex(payload.z0_re_ohm, payload.z0_im_ohm),
        a_operator=complex(payload.a_re, payload.a_im),
        tk_s=payload.tk_s,
        m_factor=payload.m_factor,
        n_factor=payload.n_factor,
    )
    packs = SCAsymmetricalProofPack.generate_zip(pack_input, context)
    content = SCAsymmetricalProofPack.zbuduj_zip_zbiorczy(packs)
    headers = {
        "Content-Disposition": (
            f'attachment; filename="pakiet_dowodowy_sc_asymetryczne__{payload.run_id}.zip"'
        )
    }
    return Response(content=content, media_type="application/zip", headers=headers)


class SC3FPackRequest(BaseModel):
    project_id: str
    case_id: str
    run_id: str
    snapshot_id: str
    project_name: str
    case_name: str
    fault_node_id: str
    run_timestamp: datetime
    solver_version: str
    # Kanoniczny snapshot ENM — fizyka (I″k + rozbicie maszynowe μ/q/i_b) liczona
    # po stronie serwera, ZERO fizyki w UI (G-SCM F2, V12K-054).
    snapshot: dict[str, Any]
    c_factor: float = 1.10
    tk_s: float = 1.0


class SCContributionsRequest(BaseModel):
    """Zadanie wkladow zwarciowych per punkt (R3-B / K3-G3, FLOW EKSPERT+).

    Kanoniczny snapshot ENM + punkt zwarcia — fizyka (rozbicie maszynowe
    mu/q/i_b, IEC 60909-0:2016 §6.6) liczona po stronie serwera przez ten sam
    solver co pakiet dowodowy SC3F (`compute_machine_contributions`).
    ZERO fizyki w UI; odpowiedz JSON zawiera slad WHITE BOX solvera.
    """

    snapshot: dict[str, Any]
    fault_node_id: str
    c_factor: float = 1.10
    t_min_s: float = 0.10


# Odwolania normowe sekcji wywodu (ZWARCIA-PRO F3 pkt 8).
_NORMA_IEC_60909 = "IEC 60909-0:2016"
_NORMA_IEC_60909_66 = "IEC 60909-0:2016 §6.6"


def _krok_reguly_malych_silnikow(result: Any) -> dict[str, Any]:
    """PELNY krok reguly malych silnikow (ZWARCIA-PRO F3 pkt 9, par. 6.6).

    Tresc reguly + wymaganie normy (suma I''k,M <= 0.05*I''k) + wartosc graniczna
    + wartosc obliczona + werdykt SPELNIONA/NIESPELNIONA + wplyw na wynik (Ib).
    Czysty formatter: liczby z white_box solvera (`ikss_async_machines_a`,
    `small_motor_limit_a`, `ikss_total_a`); jedyna operacja = skala A -> kA.
    """
    werdykt = "SPELNIONA" if result.motors_negligible else "NIESPELNIONA"
    wplyw = "silniki pomijalne w Ib" if result.motors_negligible else "silniki niepomijalne w Ib"
    ikss_total_a = result.white_box.get("ikss_total_a")
    async_a = result.white_box.get("ikss_async_machines_a")
    limit_a = result.white_box.get("small_motor_limit_a")
    if ikss_total_a is None or async_a is None or limit_a is None:
        # Wynik bez maszyn (white_box bez liczb) — uczciwy krok bez podstawien.
        return {
            "tekst": (
                "Regula malych silnikow (par. 6.6): pomijalne gdy suma I''k,M <= 0.05 * I''k — "
                f"{werdykt} ({wplyw})"
            ),
            "latex": None,
        }
    rel_tekst = "<=" if result.motors_negligible else ">"
    rel_latex = r"\le" if result.motors_negligible else ">"
    return {
        "tekst": (
            "Regula malych silnikow (par. 6.6): wymaganie suma I''k,M <= 0.05 * I''k; "
            f"wartosc graniczna 0.05 * I''k = {limit_a / 1000.0:.3f} kA; "
            f"wartosc obliczona suma I''k,M = {async_a / 1000.0:.3f} kA "
            f"({async_a / 1000.0:.3f} {rel_tekst} {limit_a / 1000.0:.3f}) -> "
            f"{werdykt} ({wplyw})"
        ),
        "latex": (
            rf"\sum_m I''_{{k,M}} = {async_a / 1000.0:.3f}\;\mathrm{{kA}} \;{rel_latex}\; "
            rf"0.05 \cdot I''_k = 0.05 \cdot {ikss_total_a / 1000.0:.3f}\;\mathrm{{kA}} "
            rf"= {limit_a / 1000.0:.3f}\;\mathrm{{kA}} "
            rf"\;\Rightarrow\; \text{{{werdykt}}}"
        ),
    }


def _wywod_sekcje_wkladow(result: Any) -> list[dict[str, Any]]:
    """Wywod sekcyjny wkladow (ZWARCIA-PRO F3 pkt 8) — ADDYTYWNIE obok `wywod`.

    Ta sama tresc co plaska lista `_wywod_wkladow`, pogrupowana w sekcje
    {tytul, kroki, norma}: „Dane wejściowe i model" (naglowek), per maszyna
    „Wkład: {nazwa}" (kroki solvera), „Suma wkładów i reguły" (suma + regula 5%).
    Czysty formatter: ZERO arytmetyki poza skala A -> kA (prezentacja).
    """
    naglowek: list[dict[str, Any]] = [
        {
            "tekst": "Model: IEC 60909-0:2016 par. 6.6 — prady czesciowe maszyn + zanik (mu, q)",
            "latex": None,
        },
    ]
    ikss_total_a = result.white_box.get("ikss_total_a")
    if ikss_total_a is not None:
        naglowek.append(
            {
                "tekst": (
                    f"Punkt zwarcia: I''k (calkowity, z Z-bus) = "
                    f"{ikss_total_a / 1000.0:.3f} kA, c = {result.c_factor:.2f}, "
                    f"t_min = {result.t_min_s:.2f} s"
                ),
                "latex": None,
            }
        )
    sekcje: list[dict[str, Any]] = [
        {"tytul": "Dane wejściowe i model", "kroki": naglowek, "norma": _NORMA_IEC_60909},
    ]
    # Pelny wywod dyplomowy per maszyna — kroki budowane W SOLVERZE (WHITE BOX,
    # zasada 2026-07-22: wzor ogolny -> podstawienie liczbowe -> wynik).
    for c in result.contributions:
        sekcje.append(
            {
                "tytul": f"Wkład: {c.source_name}",
                "kroki": [dict(krok) for krok in c.wywod],
                "norma": _NORMA_IEC_60909_66,
            }
        )
    sekcje.append(
        {
            "tytul": "Suma wkładów i reguły",
            "kroki": [
                {
                    "tekst": (
                        f"Suma wkladow maszyn: I''k,M = {result.ikss_machines_a / 1000.0:.3f} kA, "
                        f"I_b,M = {result.ib_machines_a / 1000.0:.3f} kA"
                    ),
                    "latex": r"I''_{k,M} = \sum_m I''_{k,m}, \qquad I_{b,M} = \sum_m I_{b,m}",
                },
                _krok_reguly_malych_silnikow(result),
            ],
            "norma": _NORMA_IEC_60909_66,
        }
    )
    return sekcje


def _wywod_wkladow(result: Any, sekcje: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Wywod prezentacyjny wkladow — kroki {tekst, latex} (zasada KaTeX).

    Plaska lista (kompatybilnosc: naglowek + separatory „— maszyna —" + kroki
    per maszyna + suma + regula) budowana 1:1 z sekcji `_wywod_sekcje_wkladow`
    — wspolne zrodlo gwarantuje identyczna tresc obu pol odpowiedzi.
    """
    kroki: list[dict[str, Any]] = list(sekcje[0]["kroki"])
    for c, sekcja in zip(result.contributions, sekcje[1:-1], strict=True):
        kroki.append({"tekst": f"— {c.source_name} ({c.machine_type}) —", "latex": None})
        kroki.extend(sekcja["kroki"])
    kroki.extend(sekcje[-1]["kroki"])
    return kroki


def _walidacja_iec(result: Any, input_hash: str) -> list[dict[str, str]]:
    """Panel walidacji metody IEC 60909 (ZWARCIA-PRO F3 pkt 10) — checklista.

    Pozycje budowane WYLACZNIE z realnych wlasnosci biegu (zero fabrykacji):
    stale metody (norma, Z-bus) = INFO; realne sprawdzenia (maszyny, regula 5%,
    input_hash) = PASS/FAIL wprost z wyniku solvera. Kolejnosc stala (determinizm).
    """
    wb = result.white_box
    n_async = int(wb.get("n_asynchronous", 0))
    async_a = wb.get("ikss_async_machines_a")
    limit_a = wb.get("small_motor_limit_a")
    if result.motors_negligible:
        regula_status = "PASS"
        regula_wartosc = "SPELNIONA — silniki pomijalne w Ib"
    else:
        regula_status = "FAIL"
        regula_wartosc = "NIESPELNIONA — silniki niepomijalne, wklady uwzglednione w Ib"
    if async_a is not None and limit_a is not None:
        regula_wartosc += (
            f" (suma I''k,M = {async_a / 1000.0:.3f} kA, prog = {limit_a / 1000.0:.3f} kA)"
        )
    return [
        {
            "pozycja_pl": "Norma bazowa metody",
            "wartosc_pl": "IEC 60909-0:2016",
            "status": "INFO",
        },
        {
            "pozycja_pl": "Współczynnik napięciowy c",
            "wartosc_pl": f"c = {result.c_factor:.2f} (z tego przebiegu)",
            "status": "INFO",
        },
        {
            "pozycja_pl": "Metoda obliczenia wkładów",
            "wartosc_pl": "superpozycja Z-bus (prądy częściowe maszyn)",
            "status": "INFO",
        },
        {
            "pozycja_pl": "Maszyny asynchroniczne",
            "wartosc_pl": (
                f"uwzględnione: {n_async} szt." if n_async > 0 else "nieobecne w modelu"
            ),
            "status": "PASS" if n_async > 0 else "INFO",
        },
        {
            "pozycja_pl": "Reguła małych silników (5%)",
            "wartosc_pl": regula_wartosc,
            "status": regula_status,
        },
        {
            "pozycja_pl": "Determinizm kontraktu (input_hash)",
            "wartosc_pl": f"obecny: {input_hash[:12]}...",
            "status": "PASS",
        },
    ]


def _input_hash_wkladow(payload: SCContributionsRequest) -> str:
    """Deterministyczny SHA-256 kanonicznego wejscia wkladow (kontrakt determinizmu)."""
    encoded = json.dumps(
        {
            "snapshot": payload.snapshot,
            "fault_node_id": payload.fault_node_id,
            "c_factor": payload.c_factor,
            "t_min_s": payload.t_min_s,
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


@router.post("/sc3f/contributions")
def sc3f_contributions(payload: SCContributionsRequest) -> dict[str, Any]:
    """Wklady zwarciowe zrodel (maszyny/DER) w punkcie zwarcia — JSON.

    Dostawca danych sekcji „Wklady" ekranu zwarc (dotad pass-through bez
    dostawcy). Deterministyczny: siec bez maszyn → pusta lista wkladow.
    """
    from enm.mapping import _ref_to_uuid, map_enm_to_network_graph
    from enm.models import EnergyNetworkModel
    from network_model.solvers.machine_sc_iec60909 import compute_machine_contributions

    try:
        enm = EnergyNetworkModel.model_validate(payload.snapshot)
        graph = map_enm_to_network_graph(enm)
        # Tozsamosc punktu: UI zna ref ENM szyny (target_id wyniku SC), solver
        # id wezla grafu (= deterministyczny UUID z ref). Przyjmujemy oba.
        fault_node_id = payload.fault_node_id
        if fault_node_id not in graph.nodes:
            fault_node_id = _ref_to_uuid(payload.fault_node_id)
        result = compute_machine_contributions(
            graph,
            fault_node_id,
            c_factor=payload.c_factor,
            t_min_s=payload.t_min_s,
        )
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Nie udalo sie wyznaczyc wkladow zwarciowych: {exc}",
        ) from exc
    # Addytywnie: wywod prezentacyjny {tekst, latex} (zasada KaTeX) obok
    # surowego sladu WHITE BOX solvera — bez zmiany istniejacych pol.
    # ZWARCIA-PRO F3 (pkt 8-10): wywod_sekcje (ta sama tresc pogrupowana),
    # walidacja_iec (checklista metody) i input_hash — rowniez addytywnie.
    sekcje = _wywod_sekcje_wkladow(result)
    input_hash = _input_hash_wkladow(payload)
    return {
        **result.to_dict(),
        "wywod": _wywod_wkladow(result, sekcje),
        "wywod_sekcje": sekcje,
        "walidacja_iec": _walidacja_iec(result, input_hash),
        "input_hash": input_hash,
    }


@router.post("/sc3f/pack")
def download_sc3f_pack(payload: SC3FPackRequest) -> Response:
    """Pakiet dowodowy zwarcia trójfazowego (IEC 60909) z rozbiciem maszynowym.

    Domyka lukę: 3F nie miało pakietu dowodowego. Rozbicie per-maszyna (μ/q/i_b)
    dołączane, gdy sieć zawiera maszyny wirujące / DER (G-SCM F1/F2).
    """
    context = ProofPackContext(
        project_id=payload.project_id,
        case_id=payload.case_id,
        run_id=payload.run_id,
        snapshot_id=payload.snapshot_id,
        mv_design_pro_version=resolve_mv_design_pro_version(),
    )
    pack_input = SC3FPackInput(
        project_name=payload.project_name,
        case_name=payload.case_name,
        snapshot=payload.snapshot,
        fault_node_id=payload.fault_node_id,
        run_timestamp=payload.run_timestamp,
        solver_version=payload.solver_version,
        c_factor=payload.c_factor,
        tk_s=payload.tk_s,
    )
    try:
        content = SC3FProofPack.generate_zip(pack_input, context)
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Nie udało się zbudować pakietu dowodowego SC3F: {exc}",
        ) from exc
    headers = {
        "Content-Disposition": (
            f'attachment; filename="pakiet_dowodowy_sc3f__{payload.run_id}.zip"'
        )
    }
    return Response(content=content, media_type="application/zip", headers=headers)
