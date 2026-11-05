"""Pakiet dowodowy uziemienia stacji SN przy zwarciu doziemnym (PN-EN 50522).

STATUS: CANONICAL (karta EWALUATORY-ZIEMNOZWARCIOWE, decyzja O-74 pkt 3 — łańcuch P19:
WPIĘCIE z podziałem ról).

PODZIAŁ RÓL. Fizyka — solver doziemień SN (``network_model.solvers.doziemienie_sn``): prąd
zwarcia doziemnego zależny od sposobu pracy punktu neutralnego, prąd odniesienia wiersza
tablicy 1 PN-EN 50522, prąd uziomowy I_E = r·I_odn i napięcie uziomowe U_E = R_E·I_E. Czas
trwania zwarcia t_F — ocena zabezpieczeń ziemnozwarciowych (najszybsza funkcja wyłączająca
zwarcie). Ten moduł wyłącznie przenosi te liczby z zapisanego wyniku biegu zabezpieczeń do
dokumentu dowodu (wzór → dane → podstawienie → wynik → jednostki). Dawny dowód liczący
I_E = U0/Z_E i U_d = I_u·R_u poza solverem oraz most SC_1F → dowód (prąd I″k1 także dla sieci
izolowanej i kompensowanej) zeszły razem — jedna ścieżka prądu uziomowego.

DETERMINIZM. Identyfikator artefaktu = UUID5 z identyfikatora biegu i stacji — ten sam bieg
daje ten sam dokument.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

from application.proof_engine.proof_generator import ProofGenerator
from application.proof_engine.types import EarthingGroundFaultInput, ProofDocument

#: Kryteria rekordów uziemienia, które niosą liczby prądu uziomowego (rekord napięcia krokowego
#: liczby nie ma — model nie niesie geometrii uziomu).
KRYTERIA_Z_PRADEM_UZIOMOWYM: frozenset[str] = frozenset(
    {"NAPIECIE_UZIOMOWE", "REZYSTANCJA_DOPUSZCZALNA"}
)


def wejscie_z_rekordu(
    rekord: Mapping[str, Any],
    *,
    project_name: str,
    case_name: str,
    run_timestamp: datetime,
    solver_version: str,
) -> EarthingGroundFaultInput:
    """Wejście dowodu z rekordu uziemienia stacji zapisanego w wyniku biegu zabezpieczeń
    (``ziemnozwarciowe.uziemienia``) — przepisanie pól, bez obliczeń."""
    return EarthingGroundFaultInput(
        project_name=project_name,
        case_name=case_name,
        run_timestamp=run_timestamp,
        solver_version=solver_version,
        stacja_pl=str(rekord["nazwa_urzadzenia_pl"]),
        punkt_pl=str(rekord["nazwa_punktu_pl"]),
        sposob_pl=str(rekord["sposob_pl"]),
        wzor_pradu_latex=str(rekord["wzor_latex"]),
        prad_zwarcia_a=float(rekord["prad_zwarcia_a"]),
        prad_dlawika_a=rekord["prad_dlawika_a"],
        prad_odniesienia_a=float(rekord["prad_odniesienia_a"]),
        wspolczynnik_r=float(rekord["wspolczynnik_r"]),
        wspolczynnik_r_przyjety=bool(rekord["wspolczynnik_r_przyjety"]),
        prad_uziomowy_a=float(rekord["prad_uziomowy_a"]),
        rezystancja_uziomu_ohm=rekord["rezystancja_uziomu_ohm"],
        napiecie_uziomowe_v=rekord["napiecie_uziomowe_v"],
        czas_trwania_zwarcia_s=rekord["t_f_s"],
    )


def dowody_uziemien_biegu(
    ziemnozwarciowe: Mapping[str, Any],
    *,
    run_id: str,
    project_name: str,
    case_name: str,
    run_timestamp: datetime,
    solver_version: str,
) -> list[ProofDocument]:
    """Dowód uziemienia każdej stacji z wyniku biegu zabezpieczeń (po ``stacja_ref``)."""
    rekordy = sorted(
        (
            r
            for r in ziemnozwarciowe.get("uziemienia", [])
            if r["kryterium"] in KRYTERIA_Z_PRADEM_UZIOMOWYM
        ),
        key=lambda r: str(r["stacja_ref"]),
    )
    return [
        ProofGenerator.generate_earthing_ground_fault_proof(
            wejscie_z_rekordu(
                r,
                project_name=project_name,
                case_name=case_name,
                run_timestamp=run_timestamp,
                solver_version=solver_version,
            ),
            artifact_id=artefakt_uziemienia(run_id, str(r["stacja_ref"])),
        )
        for r in rekordy
    ]


def artefakt_uziemienia(run_id: str, stacja_ref: str) -> UUID:
    """Deterministyczny identyfikator dowodu uziemienia stacji w biegu."""
    return uuid5(NAMESPACE_URL, f"mv-design-pro/dowod-uziemienia/{run_id}/{stacja_ref}")


def serialize_earthing_pack(document: ProofDocument) -> dict[str, Any]:
    """Serializacja dowodu uziemienia do słownika odpowiedzi API."""
    return {
        "pack_type": "EARTHING_GROUND_FAULT_SN",
        "artifact_id": str(document.artifact_id),
        "created_at": document.created_at.isoformat(),
        "title_pl": document.title_pl,
        "proof": document.to_dict(),
        "summary": {
            "total_steps": document.summary.total_steps,
            "proof_type": document.proof_type.value,
        },
    }
