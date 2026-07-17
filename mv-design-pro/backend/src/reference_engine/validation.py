"""Reference Engine V1 — walidacja referencyjna NA ŻYWO (spec §6).

Most do walidatora ENM: `reference_validation_issues(enm)` zwraca lekkie
znaleziska (`LiveReferenceFinding`), które `enm/validator.py::_check_warnings`
mapuje na `ValidationIssue` (severity IMPORTANT + FixAction BayModal).
Kierunek zależności: enm.validator → reference_engine (import leniwy w
walidatorze); ten moduł NIE importuje walidatora.

JEDNA implementacja sprawdzeń (pkt 10/12 dyrektywy): znaleziska wyprowadzane
z TYCH SAMYCH sprawdzeń silnika zgodności (`compliance.evaluate_enm`) przez
mapowanie rule_code → kod walidatora. Zasady na żywo (spec §6):

- tylko ścieżka danych (`bay.primary_devices` niepuste),
- blokada uziemnika POMINIĘTA (W034 już ostrzega na żywo — zero duplikatów),
- pakiety producenckie tylko dla pól ZWIĄZANYCH z rodziną
  (`bay.bay_template_ref` z prefiksem `<FAMILY_REF>__`).
"""

from __future__ import annotations

from enm.models import EnergyNetworkModel
from pydantic import BaseModel

from .compliance import evaluate_enm
from .registry import FIELD_PROFILE_PACK_ID, family_for_pack, list_reference_packs


class LiveReferenceFinding(BaseModel):
    """Znalezisko walidacji referencyjnej na żywo (spec §6)."""

    code: str
    message_pl: str
    element_ref: str
    suggested_fix: str


# rule_code (silnik zgodności) → kod walidatora ENM (spec §6).
_RULE_CODE_TO_ISSUE_CODE: list[tuple[str, str]] = [
    ("profile.required.", "reference.bays.missing_required_apparatus"),
    ("profile.one_of.", "reference.bays.missing_switching_function"),
    ("profile.forbidden", "reference.bays.forbidden_apparatus"),
    ("profile.order", "reference.bays.apparatus_order_mismatch"),
    ("profile.lateral_placement.", "reference.bays.earth_switch_in_main_path"),
    ("family.", "reference.bays.family_mismatch"),
]

_SUGGESTED_FIX_PL = (
    "Uzupełnij aparaty pola (Bay.primary_devices) zgodnie z profilem "
    "referencyjnym (REFERENCE_ENGINE_SPEC_V1 §4) albo skoryguj dane pola."
)


def _issue_code_for_rule(rule_code: str) -> str | None:
    for prefix, issue_code in _RULE_CODE_TO_ISSUE_CODE:
        if rule_code.startswith(prefix):
            return issue_code
    return None


def reference_validation_issues(enm: EnergyNetworkModel) -> list[LiveReferenceFinding]:
    """Znaleziska referencyjne dla walidacji na żywo (deterministyczne)."""
    findings: list[LiveReferenceFinding] = []

    # Normy: profile pól (iec62271) — wszystkie pola ze ścieżką danych.
    report = evaluate_enm(enm, pack_ids=[FIELD_PROFILE_PACK_ID])
    for pack_report in report.packs:
        for check in pack_report.checks:
            if check.status != "fail":
                continue
            if check.rule_code == "iec62271.interlock.es_vs_main":
                continue  # W034 ostrzega na żywo — zero duplikatów (spec §6)
            issue_code = _issue_code_for_rule(check.rule_code)
            if issue_code is None:
                continue
            findings.append(
                LiveReferenceFinding(
                    code=issue_code,
                    message_pl=f"Pole '{check.element_ref}': {check.message_pl}",
                    element_ref=check.element_ref,
                    suggested_fix=_SUGGESTED_FIX_PL,
                )
            )

    # Producenci: tylko pola związane z rodziną przez bay_template_ref.
    family_packs = [
        (pack, family)
        for pack in list_reference_packs()
        if pack.kind == "manufacturer" and (family := family_for_pack(pack)) is not None
    ]
    bound_pack_ids = sorted(
        {
            pack.pack_id
            for pack, family in family_packs
            for bay in enm.bays
            if bay.bay_template_ref
            and bay.bay_template_ref.startswith(f"{family.switchgear_family_ref}__")
        }
    )
    if bound_pack_ids:
        bound_families = {
            pack.pack_id: family.switchgear_family_ref
            for pack, family in family_packs
            if pack.pack_id in bound_pack_ids
        }
        bound_bay_refs = {
            pack_id: {
                bay.ref_id
                for bay in enm.bays
                if bay.bay_template_ref
                and bay.bay_template_ref.startswith(f"{bound_families[pack_id]}__")
            }
            for pack_id in bound_pack_ids
        }
        family_report = evaluate_enm(enm, pack_ids=bound_pack_ids)
        for pack_report in family_report.packs:
            for check in pack_report.checks:
                if check.status != "fail":
                    continue
                if check.element_ref not in bound_bay_refs.get(pack_report.pack_id, set()):
                    continue
                issue_code = _issue_code_for_rule(check.rule_code)
                if issue_code is None:
                    continue
                findings.append(
                    LiveReferenceFinding(
                        code=issue_code,
                        message_pl=f"Pole '{check.element_ref}': {check.message_pl}",
                        element_ref=check.element_ref,
                        suggested_fix=_SUGGESTED_FIX_PL,
                    )
                )

    findings.sort(key=lambda f: (f.element_ref, f.code, f.message_pl))
    return findings
