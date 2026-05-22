"""
Semantic validator — uruchamia wszystkie semantic_rules przeciw ENM.

Wywoływane jako post-hook w `execute_domain_operation()` — wynik
trafia do response jako `semantic_issues: list[dict]`.

Pure interpretation — nie modyfikuje ENM, nie wywołuje solvera.
"""

from .semantic_rules import SEMANTIC_RULES
from .validator import ValidationIssue


def validate_semantic(enm: dict) -> list[ValidationIssue]:
    """
    Uruchamia wszystkie zarejestrowane reguły semantyczne na ENM.

    Args:
        enm: ENM jako dict (zwykle po operacji domenowej).

    Returns:
        Lista naruszeń (może być pusta). Każde naruszenie ma kod, polski
        komunikat, severity i sugestię naprawy.
    """
    issues: list[ValidationIssue] = []
    for rule in SEMANTIC_RULES:
        issues.extend(rule(enm))
    return issues


def validate_semantic_as_dicts(enm: dict) -> list[dict]:
    """
    Wariant zwracający listę dict (do serializacji JSON w API response).
    """
    return [issue.to_dict() for issue in validate_semantic(enm)]
