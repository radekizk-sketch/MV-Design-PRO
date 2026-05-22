"""
Semantic rules — walidacja semantyki sieci SN po operacjach domenowych.

Komplementarna do `NetworkValidator` (statyczna walidacja przed solverem)
oraz inline blockers w `domain_operations.py` (preflight per-operation).

`validate_semantic(enm)` jest uruchamiana jako post-hook w
`execute_domain_operation()` — zwraca listę naruszeń (ValidationIssue)
dotyczących CAŁEGO ENM po zastosowaniu operacji. Konsumenci (frontend
`SemanticIssuesBanner`) wyświetlają je użytkownikowi.

Reguły startowe (PR-C konsolidacji UI):
1. CableCannotStartFromPole — kabel SN nie może wychodzić ze słupa
   rozgałęźnego (branch_pole jest punktem na linii napowietrznej).
2. OverheadCannotStartFromZksn — linia napowietrzna nie może wychodzić
   z ZKSN (zlaczka kablowa SN to punkt na kablu).
3. DerMustMatchBayType — generator OZE musi być na polu o typie zgodnym
   z jego rodzajem (PV/wiatr/BESS w pole DER, nie w pole obce).

Każda reguła to czysta funkcja: enm_dict -> list[ValidationIssue].
Reguły są pure — bez mutacji ENM, bez stanu globalnego.
"""

from collections.abc import Callable

from .validator import Severity, ValidationIssue

SemanticRule = Callable[[dict], list[ValidationIssue]]


def _branch_points(enm: dict) -> list[dict]:
    return enm.get("branch_points") or []


def _branches(enm: dict) -> list[dict]:
    return enm.get("branches") or []


def _generators(enm: dict) -> list[dict]:
    return enm.get("generators") or []


def _bays(enm: dict) -> list[dict]:
    return enm.get("bays") or []


def _segment_type_by_id(enm: dict) -> dict[str, str]:
    """Mapuje segment_id → segment type (cable / line_overhead / ...)."""
    out: dict[str, str] = {}
    for br in _branches(enm):
        seg_id = br.get("id") or br.get("ref_id")
        if seg_id:
            out[seg_id] = br.get("type", "")
    return out


def rule_cable_cannot_start_from_pole(enm: dict) -> list[ValidationIssue]:
    """
    Słup rozgałęźny (branch_pole) jest punktem na linii NAPOWIETRZNEJ.
    Jeśli parent_segment_id wskazuje na kabel — naruszenie.

    Zachowanie komplementarne do inline check w domain_operations.py
    (linia ~735), ale walidacja całościowa, nie preflight per-op.
    """
    issues: list[ValidationIssue] = []
    seg_types = _segment_type_by_id(enm)
    for bp in _branch_points(enm):
        if bp.get("branch_point_type") != "branch_pole":
            continue
        parent_seg_id = bp.get("parent_segment_id")
        if not parent_seg_id:
            continue
        seg_type = seg_types.get(parent_seg_id)
        if seg_type and seg_type != "line_overhead":
            issues.append(
                ValidationIssue(
                    code="semantic.cable_cannot_start_from_pole",
                    message=(
                        f"Słup rozgałęźny '{bp.get('ref_id')}' jest osadzony na segmencie "
                        f"typu '{seg_type}', a wymaga linii napowietrznej."
                    ),
                    severity=Severity.ERROR,
                    element_id=bp.get("ref_id"),
                    field="parent_segment_id",
                    suggested_fix="Zmień segment nadrzędny słupa na linię napowietrzną.",
                )
            )
    return issues


def rule_overhead_cannot_start_from_zksn(enm: dict) -> list[ValidationIssue]:
    """
    ZKSN (złączka kablowa SN) jest punktem na KABLU.
    Jeśli parent_segment_id wskazuje na linię napowietrzną — naruszenie.

    Zachowanie komplementarne do inline check w domain_operations.py
    (linia ~744), ale walidacja całościowa.
    """
    issues: list[ValidationIssue] = []
    seg_types = _segment_type_by_id(enm)
    for bp in _branch_points(enm):
        if bp.get("branch_point_type") != "zksn":
            continue
        parent_seg_id = bp.get("parent_segment_id")
        if not parent_seg_id:
            continue
        seg_type = seg_types.get(parent_seg_id)
        if seg_type and seg_type != "cable":
            issues.append(
                ValidationIssue(
                    code="semantic.overhead_cannot_host_zksn",
                    message=(
                        f"ZKSN '{bp.get('ref_id')}' jest osadzona na segmencie typu "
                        f"'{seg_type}', a wymaga kabla."
                    ),
                    severity=Severity.ERROR,
                    element_id=bp.get("ref_id"),
                    field="parent_segment_id",
                    suggested_fix="Zmień segment nadrzędny ZKSN na kabel.",
                )
            )
    return issues


def _bay_role_for_generator_gen_type(gen_type: str) -> set[str]:
    """
    Mapuje gen_type generatora na dopuszczalne typy pola SN.
    DER musi siedzieć w polu o roli "der_*" zgodnej z jego typem.
    """
    if gen_type in ("PV", "BESS", "WIND", "FW"):
        # Wszystkie OZE/BESS akceptowane w polu der_*
        return {"der", "der_pv", "der_bess", "der_wind", "customer_oze", "feeder"}
    if gen_type in ("INVERTER", "CONVERTER"):
        return {"der", "der_inverter", "customer_oze", "feeder"}
    # Inne (genset, UPS) — szeroka tolerancja
    return {"feeder", "customer", "der", "auxiliary"}


def rule_der_must_match_bay_type(enm: dict) -> list[ValidationIssue]:
    """
    Generator OZE/BESS musi być w polu o typie zgodnym z jego rodzajem.
    Sprawdzane przez bay_ref → bay.bay_role / bay_kind.

    Nowa reguła — nie ma odpowiednika inline w domain_operations.py.
    """
    issues: list[ValidationIssue] = []
    bays_by_id = {b.get("ref_id"): b for b in _bays(enm)}
    for gen in _generators(enm):
        bay_ref = gen.get("bay_ref")
        if not bay_ref:
            continue
        bay = bays_by_id.get(bay_ref)
        if not bay:
            continue
        gen_type = gen.get("gen_type") or gen.get("source_kind") or ""
        bay_role = bay.get("bay_role") or bay.get("bay_kind") or ""
        if not gen_type or not bay_role:
            continue
        allowed = _bay_role_for_generator_gen_type(gen_type)
        if bay_role not in allowed:
            issues.append(
                ValidationIssue(
                    code="semantic.der_bay_type_mismatch",
                    message=(
                        f"Generator '{gen.get('ref_id')}' typu '{gen_type}' jest w polu "
                        f"'{bay_ref}' o roli '{bay_role}'. Wymagane pole o roli zgodnej "
                        f"z typem źródła."
                    ),
                    severity=Severity.ERROR,
                    element_id=gen.get("ref_id"),
                    field="bay_ref",
                    suggested_fix=(
                        f"Przenieś generator do pola o roli {sorted(allowed)} lub zmień rolę pola."
                    ),
                )
            )
    return issues


SEMANTIC_RULES: list[SemanticRule] = [
    rule_cable_cannot_start_from_pole,
    rule_overhead_cannot_start_from_zksn,
    rule_der_must_match_bay_type,
]
