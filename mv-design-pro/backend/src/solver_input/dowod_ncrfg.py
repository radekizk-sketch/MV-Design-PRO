"""Ocena dowodowa biegu NC RfG/PTPiREE (karta S-1, W6-0).

Warstwa APPLICATION/API (poza solverem FROZEN — `network_model/solvers/
ncrfg_ptpiree/**`, B-01, NIE DOTKNIETY ani jedna linia). Ten modul CYTUJE
gotowy wynik solvera (`NcRfgPtpireeRunResult`) i doklada TRZECIA OS
proweniencji (`solver_input.provenance.EvidenceTier`/`ClaimKind`/
`CapabilityEvidence`) — czy dany test WYMAGANY opiera sie na zdolnosci
dopuszczalnej jako dowod regulacyjny. Werdykt testu (pass/fail/no_data/
not_required) NIE wchodzi do tej oceny: „nie spelnia" jest wynikiem
wykazanym i raportowalnym, „brak dowodu" to inny stan.

`TEST_ZDOLNOSC` mapuje KAZDY test_id T01-T20 kanonu PTPiREE na
(capability_id, ClaimKind) — rejestr dowodowy w `solver_input.provenance`
klasyfikuje `capability_id` na `EvidenceTier` (fail-closed: nieznany
identyfikator = UNVALIDATED_MODEL). Test kompletnosci ITERUJE PO
`TEST_CATALOG` solvera (nie po liscie zaszytej w tescie) — brak wpisu w tej
tabeli dla ktoregokolwiek test_id = BRAK_KLASYFIKACJI = nieprzydatny
dowodowo (nigdy „w porzadku"), patrz `testy_bez_klasyfikacji`.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import TYPE_CHECKING, Any, Literal

from solver_input.provenance import (
    BRAK_DOWODU_PL,
    CapabilityEvidence,
    ClaimKind,
    classify_dynamic_capability,
)

if TYPE_CHECKING:
    from network_model.solvers.ncrfg_ptpiree.contracts import (
        NcRfgPtpireeModuleResult,
        NcRfgPtpireeRunResult,
    )

ReportingStatus = Literal["reportable", "not_reportable"]
ProofStatus = Literal["complete", "incomplete"]

#: Mapowanie test_id kanonu PTPiREE (T01-T20, `network_model/solvers/
#: ncrfg_ptpiree/engine.py::TEST_CATALOG`) na zdolnosc dowodowa. Zyje POZA
#: solverem (karta S-1 §0.2, rozstrzygniecie A-2): solver FROZEN nie niesie
#: `capability_id` — mapowanie jest wylacznie w tej warstwie.
#:
#: Karta AB-1a R-6 (2026-09-23): T05/T12/T13 (regulacja P, zaprzestanie i
#: zmniejszenie generacji) to twierdzenia o ZACHOWANIU w czasie →
#: `zachowanie_zadeklarowane` (DECLARATION + DYNAMIC_PERFORMANCE, niedopuszczalne);
#: T10 (tautologia `p_max_kw > 0`) → `test_bez_tresci` (NOT_SIMULATED); T20 (THD_U
#: sieci z limitem zaszytym w solverze) → DYNAMIC_PERFORMANCE. `claim_kind` tej
#: tabeli jest RÓWNY `claim_kind` wpisu rejestru — test parowy
#: `test_claim_kind_testu_rowny_rejestrowi` (bez rozjazdu, ktory `replace` nizej
#: po cichu by wygladzil).
TEST_ZDOLNOSC: dict[str, tuple[str, ClaimKind]] = {
    "T01": ("ncrfg_ptpiree.frequency_response", ClaimKind.DYNAMIC_PERFORMANCE),
    "T02": ("ncrfg_ptpiree.frequency_response", ClaimKind.DYNAMIC_PERFORMANCE),
    "T03": ("ncrfg_ptpiree.frequency_response", ClaimKind.DYNAMIC_PERFORMANCE),
    "T04": ("ncrfg_ptpiree.frequency_response", ClaimKind.DYNAMIC_PERFORMANCE),
    "T05": ("ncrfg_ptpiree.zachowanie_zadeklarowane", ClaimKind.DYNAMIC_PERFORMANCE),
    "T06": ("ncrfg_ptpiree.reactive_voltage_mode", ClaimKind.DECLARED_CONFIGURATION),
    "T07": ("ncrfg_ptpiree.reactive_voltage_mode", ClaimKind.DECLARED_CONFIGURATION),
    "T08": ("ncrfg_ptpiree.reactive_voltage_mode", ClaimKind.DECLARED_CONFIGURATION),
    "T09": ("ncrfg_ptpiree.reactive_voltage_mode", ClaimKind.DECLARED_CONFIGURATION),
    "T10": ("ncrfg_ptpiree.test_bez_tresci", ClaimKind.DYNAMIC_PERFORMANCE),
    "T11": ("ncrfg_ptpiree.declared_configuration", ClaimKind.DECLARED_CONFIGURATION),
    "T12": ("ncrfg_ptpiree.zachowanie_zadeklarowane", ClaimKind.DYNAMIC_PERFORMANCE),
    "T13": ("ncrfg_ptpiree.zachowanie_zadeklarowane", ClaimKind.DYNAMIC_PERFORMANCE),
    "T14": ("ncrfg_ptpiree.ride_through", ClaimKind.DYNAMIC_PERFORMANCE),
    "T15": ("ncrfg_ptpiree.ride_through", ClaimKind.DYNAMIC_PERFORMANCE),
    "T16": ("ncrfg_ptpiree.p_recovery", ClaimKind.DYNAMIC_PERFORMANCE),
    "T17": ("ncrfg_ptpiree.reactive_current_frt", ClaimKind.DYNAMIC_PERFORMANCE),
    "T18": ("ncrfg_ptpiree.extended_dynamic_capability", ClaimKind.DYNAMIC_PERFORMANCE),
    "T19": ("ncrfg_ptpiree.declared_configuration", ClaimKind.DECLARED_CONFIGURATION),
    "T20": ("ncrfg_ptpiree.power_quality_declared", ClaimKind.DYNAMIC_PERFORMANCE),
}

#: Etykieta BRAK_KLASYFIKACJI (test_id bez wpisu w TEST_ZDOLNOSC) — jawny brak,
#: NIGDY ciche pominiecie. Uzyta w formacie ograniczenia "{test_id}:BRAK_KLASYFIKACJI".
BRAK_KLASYFIKACJI = "BRAK_KLASYFIKACJI"


def testy_bez_klasyfikacji() -> tuple[str, ...]:
    """test_id z `TEST_CATALOG` solvera bez wpisu w `TEST_ZDOLNOSC` (musi byc puste).

    Iteruje po REALNYM katalogu solvera (nie po liscie zaszytej tutaj ani w
    tescie) — reguła KLASA NIE INSTANCJA: dodanie nowego testu do solvera bez
    dopisania klasyfikacji dowodowej jest wykrywalne automatycznie.
    """
    from network_model.solvers.ncrfg_ptpiree.engine import TEST_CATALOG

    return tuple(
        sorted(d.test_id for d in TEST_CATALOG if d.test_id not in TEST_ZDOLNOSC)
    )


def ocena_dowodowa_testu(test_id: str) -> CapabilityEvidence | None:
    """Klasyfikacja dowodowa pojedynczego testu NC RfG.

    Zwraca ``None``, gdy `test_id` nie ma wpisu w `TEST_ZDOLNOSC`
    (BRAK_KLASYFIKACJI) — wolajacy traktuje to jako nieprzydatne dowodowo,
    nigdy jako "w porzadku" (patrz `testy_bez_klasyfikacji` dla pinu w obie
    strony).

    `claim_kind` deklarowany w `TEST_ZDOLNOSC` jest AUTORYTATYWNY dla tego
    testu (podmieniany przez `dataclasses.replace`, gdyby kiedykolwiek
    rozjechal sie z domyslnym `claim_kind` rejestru `classify_dynamic_
    capability`) — jedno zrodlo prawdy per test, bez cichego rozjazdu miedzy
    dwoma niezaleznymi deklaracjami tego samego faktu.
    """
    wpis = TEST_ZDOLNOSC.get(test_id)
    if wpis is None:
        return None
    capability_id, claim_kind = wpis
    ewidencja = classify_dynamic_capability(capability_id)
    if ewidencja.claim_kind is not claim_kind:
        ewidencja = replace(ewidencja, claim_kind=claim_kind)
    return ewidencja


def _slownik_dowodu_testu(test_id: str) -> dict[str, Any]:
    """`CapabilityEvidence.to_dict()` dla `test_id`, albo slownik BRAK_KLASYFIKACJI."""
    ewidencja = ocena_dowodowa_testu(test_id)
    if ewidencja is not None:
        return ewidencja.to_dict()
    return {
        "capability_id": None,
        "tier": BRAK_KLASYFIKACJI,
        "tier_pl": "brak klasyfikacji",
        "claim_kind": None,
        "claim_kind_pl": None,
        "regulatory_evidence_eligible": False,
        "rationale_pl": (
            f"Test {test_id} nie ma wpisu w rejestrze dowodowym TEST_ZDOLNOSC "
            "— nieprzydatny dowodowo (fail-closed)."
        ),
        "audit_ref": "karta_s1_s4_dowod.md §0.2 (kompletnosc mapowania)",
    }


def _etykieta_ograniczenia(test_id: str) -> str:
    """Format `"{test_id}:{tier}"` / `"{test_id}:BRAK_KLASYFIKACJI"` (karta S-1 §0.3)."""
    ewidencja = ocena_dowodowa_testu(test_id)
    if ewidencja is None:
        return f"{test_id}:{BRAK_KLASYFIKACJI}"
    return f"{test_id}:{ewidencja.tier.value}"


def _nota_pl(ograniczenia: tuple[str, ...]) -> str:
    if not ograniczenia:
        return (
            "Wszystkie wymagane testy oparte sa o stopien dowodowy dopuszczalny "
            "do zgloszenia."
        )
    return f"{BRAK_DOWODU_PL} dla testow: " + ", ".join(ograniczenia) + "."


@dataclass(frozen=True)
class OcenaDowodowaModulu:
    """Ocena dowodowa jednego modulu (DER) biegu NC RfG.

    Kryterium jest JEDNO: czy ktorys test WYMAGANY tego modulu opiera sie na
    zdolnosci nieprzydatnej dowodowo. Werdykt pass/fail testu NIE wchodzi do
    tej oceny.
    """

    der_ref: str
    reporting_status: ReportingStatus
    proof_status: ProofStatus
    evidence_limitations: tuple[str, ...] = field(default_factory=tuple)
    evidence_note_pl: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "der_ref": self.der_ref,
            "reporting_status": self.reporting_status,
            "proof_status": self.proof_status,
            "evidence_limitations": list(self.evidence_limitations),
            "evidence_note_pl": self.evidence_note_pl,
        }


@dataclass(frozen=True)
class OcenaDowodowaBiegu:
    """Ocena dowodowa calego biegu NC RfG — zlozenie ocen per modul.

    `reporting_status`/`proof_status` biegu sa FAIL-CLOSED: `reportable`/
    `complete` wylacznie, gdy KAZDY modul jest `reportable`/`complete`.
    """

    reporting_status: ReportingStatus
    proof_status: ProofStatus
    evidence_limitations: tuple[str, ...]
    evidence_note_pl: str
    per_module: dict[str, OcenaDowodowaModulu]
    evidence_by_test: dict[str, dict[str, dict[str, Any]]]

    def to_dict(self) -> dict[str, Any]:
        return {
            "reporting_status": self.reporting_status,
            "proof_status": self.proof_status,
            "evidence_limitations": list(self.evidence_limitations),
            "evidence_note_pl": self.evidence_note_pl,
            "per_module": {
                der_ref: ocena.to_dict()
                for der_ref, ocena in sorted(self.per_module.items())
            },
            "evidence_by_test": {
                der_ref: dict(sorted(testy.items()))
                for der_ref, testy in sorted(self.evidence_by_test.items())
            },
        }


def _ocena_modulu(module: NcRfgPtpireeModuleResult) -> OcenaDowodowaModulu:
    ograniczenia: list[str] = []
    for test in module.tests:
        if not test.required:
            continue
        ewidencja = ocena_dowodowa_testu(test.test_id)
        if ewidencja is None or not ewidencja.regulatory_evidence_eligible:
            ograniczenia.append(_etykieta_ograniczenia(test.test_id))
    ograniczenia_posortowane = tuple(sorted(set(ograniczenia)))
    if ograniczenia_posortowane:
        return OcenaDowodowaModulu(
            der_ref=module.der_ref,
            reporting_status="not_reportable",
            proof_status="incomplete",
            evidence_limitations=ograniczenia_posortowane,
            evidence_note_pl=_nota_pl(ograniczenia_posortowane),
        )
    return OcenaDowodowaModulu(
        der_ref=module.der_ref,
        reporting_status="reportable",
        proof_status="complete",
        evidence_limitations=(),
        evidence_note_pl=_nota_pl(()),
    )


def ocena_dowodowa_biegu(result: NcRfgPtpireeRunResult) -> OcenaDowodowaBiegu:
    """Zbuduj ocene dowodowa calego biegu z gotowego wyniku solvera (READ-ONLY).

    Solver FROZEN pozostaje nietkniety — ta funkcja WYLACZNIE interpretuje
    `result.modules[*].tests[*].test_id`/`required` przez rejestr
    `TEST_ZDOLNOSC` + `solver_input.provenance.classify_dynamic_capability`.
    Uzywana identycznie przez `api/ncrfg_ptpiree_tests.py` (bieg macierzy),
    `application/analyses/certyfikat_zgodnosci.py` (bramka dowodowa
    certyfikatu) i tranzytywnie przez `wniosek_osd.py` (deleguje do
    certyfikatu) — jedna funkcja, jedno zrodlo prawdy.
    """
    per_module: dict[str, OcenaDowodowaModulu] = {}
    evidence_by_test: dict[str, dict[str, dict[str, Any]]] = {}
    for module in result.modules:
        per_module[module.der_ref] = _ocena_modulu(module)
        evidence_by_test[module.der_ref] = {
            test.test_id: _slownik_dowodu_testu(test.test_id) for test in module.tests
        }

    wszystkie_ograniczenia = tuple(
        sorted(
            {og for ocena in per_module.values() for og in ocena.evidence_limitations}
        )
    )
    reportable = all(
        ocena.reporting_status == "reportable" for ocena in per_module.values()
    )
    complete = all(ocena.proof_status == "complete" for ocena in per_module.values())

    return OcenaDowodowaBiegu(
        reporting_status="reportable" if reportable else "not_reportable",
        proof_status="complete" if complete else "incomplete",
        evidence_limitations=wszystkie_ograniczenia,
        evidence_note_pl=_nota_pl(wszystkie_ograniczenia),
        per_module=per_module,
        evidence_by_test=evidence_by_test,
    )
