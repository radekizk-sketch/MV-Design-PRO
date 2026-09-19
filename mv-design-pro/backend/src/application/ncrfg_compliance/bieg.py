"""Odpowiedź biegu NC RfG / PTPiREE — JEDNA koperta dla macierzy i zgodności przypadku.

Karta S-3 (W6-0, „jeden tor NC RfG"). Dwie trasy uruchamiają TEN SAM solver
kanoniczny ``NcRfgPtpireeSolver`` (``network_model/solvers/ncrfg_ptpiree``,
B-01 — nietknięty) i odsyłają TEN SAM kontrakt biegu:

- ``POST /api/ncrfg-tests/run`` — bieg macierzy per DER z wejść skompletowanych
  przez projektanta w oknie macierzy (``ui2/oze/macierz``);
- ``GET /api/ncrfg-tests/cases/{case_id}/compliance`` — zgodność przekrojowa
  przypadku: wejścia zbudowane Z MODELU (most ``model_bridge.py``), bieg
  opakowany per przypadek (``NcRfgCaseComplianceResponse``).

Koperta biegu (``NcRfgPtpireeRunResponse``) = wynik solvera + dowód certyfikatu
PTPiREE z tabliczek urządzeń (``dowod_certyfikatu``) + stopień dowodowy biegu
(karta S-1: ``ocena_dowodowa_biegu``, TA SAMA funkcja, którą czyta bramka
certyfikatu ``certyfikat_zgodnosci.zbierz_braki``). Składana JEDNĄ funkcją
``odpowiedz_biegu_ncrfg`` — dwie trasy nie mogą się rozjechać w polach dowodowych.

Warstwa APPLICATION: zero fizyki, zero oceny własnej — kompozycja gotowych
werdyktów solvera i gotowych ocen dowodowych.
"""

from __future__ import annotations

from typing import Any

from application.analyses.dowod_certyfikatu import (
    NcRfgCertificateEvidence,
    dowody_certyfikatu_z_enm,
)
from application.ncrfg_compliance.model_bridge import (
    NcRfgDerPominiety,
    build_ncrfg_module_inputs_from_enm,
)
from enm.models import EnergyNetworkModel
from network_model.solvers.ncrfg_ptpiree import (
    NcRfgPtpireeRunRequest,
    NcRfgPtpireeRunResult,
    NcRfgPtpireeSolver,
)
from pydantic import BaseModel
from solver_input.dowod_ncrfg import ocena_dowodowa_biegu

_solver = NcRfgPtpireeSolver()


class NcRfgPtpireeRunResponse(NcRfgPtpireeRunResult):
    """Wynik biegu POSZERZONY o dowód certyfikacji (P2) i stopień dowodowy (S-1).

    Dziedziczy kontrakt solvera w całości — wszystkie istniejące pola zachowują
    nazwy, typy i wartości. Pola ``certificate_evidence``, ``reporting_status``,
    ``proof_status``, ``evidence_limitations``, ``evidence_note_pl``,
    ``evidence_per_module``, ``evidence_by_test`` są ADDYTYWNE. Ocena dowodowa
    liczona ``ocena_dowodowa_biegu`` (``solver_input.dowod_ncrfg``) — TĄ SAMĄ
    funkcją, którą czyta bramka certyfikatu
    (``application/analyses/certyfikat_zgodnosci.py::zbierz_braki``).
    """

    certificate_evidence: list[NcRfgCertificateEvidence] = []
    # Domyślne wartości FAIL-CLOSED (evidence_status_guard): gdyby jakiś inny
    # tor budowy tego modelu pominął wywołanie ocena_dowodowa_biegu, odpowiedź
    # ma stan pesymistyczny — nigdy ciche "reportable"/"complete".
    reporting_status: str = "not_reportable"
    proof_status: str = "incomplete"
    evidence_limitations: list[str] = []
    evidence_note_pl: str = ""
    evidence_per_module: dict[str, dict[str, Any]] = {}
    evidence_by_test: dict[str, dict[str, dict[str, Any]]] = {}


class NcRfgCaseComplianceResponse(BaseModel):
    """Zgodność NC RfG przypadku: bieg solvera na DER modelu, opakowany per przypadek.

    ``bieg`` jest ``None`` DOKŁADNIE wtedy, gdy solver nie miał żadnego modułu do
    objęcia (``der_count == 0``): kontrakt solvera wymaga ≥ 1 modułu, a pusty
    bieg z fabrykowanym odciskiem/raportem byłby fałszem. ``pominiete`` nazywa DER
    modelu, których solver nie objął (brak mocy / brak napięcia przyłączenia) —
    uczciwy stan zerowy per urządzenie, nie cisza.
    """

    case_id: str
    operator_id: str
    der_count: int
    pominiete: list[NcRfgDerPominiety]
    bieg: NcRfgPtpireeRunResponse | None


def odpowiedz_biegu_ncrfg(
    result: NcRfgPtpireeRunResult,
    dowody: list[NcRfgCertificateEvidence],
) -> NcRfgPtpireeRunResponse:
    """Koperta biegu z gotowego wyniku solvera i gotowych dowodów certyfikatu.

    JEDYNE miejsce, w którym pola dowodowe S-1 trafiają do odpowiedzi HTTP —
    obie trasy (macierz i zgodność przypadku) wołają tę funkcję.
    """
    ocena = ocena_dowodowa_biegu(result)
    return NcRfgPtpireeRunResponse(
        **result.model_dump(),
        certificate_evidence=dowody,
        reporting_status=ocena.reporting_status,
        proof_status=ocena.proof_status,
        evidence_limitations=list(ocena.evidence_limitations),
        evidence_note_pl=ocena.evidence_note_pl,
        evidence_per_module={
            der_ref: modul_ocena.to_dict() for der_ref, modul_ocena in ocena.per_module.items()
        },
        evidence_by_test=ocena.evidence_by_test,
    )


def zgodnosc_ncrfg_przypadku(
    enm: EnergyNetworkModel, *, operator_id: str, case_id: str
) -> NcRfgCaseComplianceResponse:
    """Zgodność NC RfG WSZYSTKICH DER modelu dla wskazanego operatora.

    Most ``build_ncrfg_module_inputs_from_enm`` buduje wejścia (zero
    fabrykacji: brak danej = ``False``/``None``), solver kanoniczny liczy
    werdykty, ``odpowiedz_biegu_ncrfg`` dokłada dowód certyfikatu z tabliczek
    TEGO modelu i stopień dowodowy. Wołający (trasa) sprawdza operatora PRZED
    wywołaniem — nieznany profil operatora nie jest stanem tej funkcji.
    Deterministyczne: identyczny model → identyczna odpowiedź (kolejność DER =
    kolejność generatorów w modelu).
    """
    wejscia = build_ncrfg_module_inputs_from_enm(enm, operator_id=operator_id)
    bieg: NcRfgPtpireeRunResponse | None = None
    if wejscia.modules:
        result = _solver.run(NcRfgPtpireeRunRequest(modules=wejscia.modules))
        bieg = odpowiedz_biegu_ncrfg(
            result,
            dowody_certyfikatu_z_enm(enm, [module.der_ref for module in result.modules]),
        )
    return NcRfgCaseComplianceResponse(
        case_id=case_id,
        operator_id=operator_id,
        der_count=len(wejscia.modules),
        pominiete=wejscia.pominiete,
        bieg=bieg,
    )
