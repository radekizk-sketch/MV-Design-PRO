"""Canonical fallback — pełne szablony pól SN bez producenta.

Goal §11A.1 zasada główna: gdy producent ma `status='requires_catalog'`
(brak zweryfikowanych źródeł), UI może użyć szablonu producenta-niezależnego
oznaczonego jako `source_status='canonical_fallback'`. Operator widzi badge
ostrzegawczy „Szablon kanoniczny ogólny (nie producentowy)".

Mapowanie 10 istniejących `BayTemplate` z `bay_templates.py`:
- BAY_TEMPLATE_LINE_IN     → CompleteMvBayTemplate liniowe_doplywowe (IN)
- BAY_TEMPLATE_LINE_OUT    → CompleteMvBayTemplate liniowe_odplywowe (OUT)
- BAY_TEMPLATE_TRANSFORMER → CompleteMvBayTemplate transformatorowe (TR)
- BAY_TEMPLATE_MEASUREMENT → CompleteMvBayTemplate pomiarowe (MEASUREMENT)
- BAY_TEMPLATE_COUPLER     → CompleteMvBayTemplate sprzeglowe_poprzeczne (COUPLER)
- BAY_TEMPLATE_DER_PV      → CompleteMvBayTemplate pv (OZE)
- BAY_TEMPLATE_DER_BESS    → CompleteMvBayTemplate bess (OZE)
- BAY_TEMPLATE_DER_FW      → CompleteMvBayTemplate fw (OZE)
- BAY_TEMPLATE_RESERVE     → CompleteMvBayTemplate rezerwowe (FEEDER)
- BAY_TEMPLATE_AUX         → CompleteMvBayTemplate potrzeb_wlasnych (FEEDER)
"""

from __future__ import annotations

from ..bay_templates import (
    BAY_TEMPLATE_AUX,
    BAY_TEMPLATE_COUPLER,
    BAY_TEMPLATE_DER_BESS,
    BAY_TEMPLATE_DER_FW,
    BAY_TEMPLATE_DER_PV,
    BAY_TEMPLATE_LINE_IN,
    BAY_TEMPLATE_LINE_OUT,
    BAY_TEMPLATE_MEASUREMENT,
    BAY_TEMPLATE_RESERVE,
    BAY_TEMPLATE_TRANSFORMER,
    BayTemplate,
)
from .apparatus_vocabulary import FAMILY_APPARATUS_FOR_TEMPLATE_KIND
from .complete_mv_bay_template import BayKind, CompleteMvBayTemplate
from .families import list_families_for_manufacturer, list_switchgear_families
from .switchgear_family import SwitchgearFamily

# Mapowanie: (base_template, bay_kind, polski_template_ref_suffix)
_CANONICAL_FALLBACK_MAPPING: list[tuple[BayTemplate, BayKind, str]] = [
    (BAY_TEMPLATE_LINE_IN, "liniowe_doplywowe", "line_in"),
    (BAY_TEMPLATE_LINE_OUT, "liniowe_odplywowe", "line_out"),
    (BAY_TEMPLATE_TRANSFORMER, "transformatorowe", "transformer"),
    (BAY_TEMPLATE_MEASUREMENT, "pomiarowe", "measurement"),
    (BAY_TEMPLATE_COUPLER, "sprzeglowe_poprzeczne", "coupler"),
    (BAY_TEMPLATE_DER_PV, "pv", "der_pv"),
    (BAY_TEMPLATE_DER_BESS, "bess", "der_bess"),
    (BAY_TEMPLATE_DER_FW, "fw", "der_fw"),
    (BAY_TEMPLATE_RESERVE, "rezerwowe", "reserve"),
    (BAY_TEMPLATE_AUX, "potrzeb_wlasnych", "aux"),
]


def _build_canonical_template(
    base: BayTemplate, bay_kind: BayKind, suffix: str
) -> CompleteMvBayTemplate:
    template_ref = f"CANONICAL_FALLBACK__{suffix.upper()}"
    template = CompleteMvBayTemplate(
        template_ref=template_ref,
        base_template=base,
        manufacturer_ref=None,
        switchgear_family_ref=None,
        bay_kind=bay_kind,
        bay_role=base.bay_role,
        source_status="canonical_fallback",
        source_refs=[],
        version="1.0",
        notes_pl=(
            "Szablon kanoniczny ogólny (fallback) — nie pochodzi z katalogu "
            "konkretnego producenta. UI ma pokazać badge ostrzegawczy."
        ),
    )
    return template.model_copy(update={"hash": template.compute_hash()})


def _family_filtered_base(base: BayTemplate, family: SwitchgearFamily) -> BayTemplate:
    """Bazowy szablon przefiltrowany do słownika aparatów rodziny.

    Reference Engine V1 (spec §7, pkt 2/4 dyrektywy): kreator nie może
    wygenerować pola z aparatem SPOZA `allowed_apparatus_kinds` rodziny —
    np. rodziny RMU (SafeRing/8DJH) nie mają w słowniku przekładników CT/VT,
    więc szablon rodziny NIE zawiera CT z kanonicznego szablonu
    wyłącznikowego. Aparat bez wpisu w słowniku mapowań (transformator pola)
    leży poza celką — zawsze zachowany. Pusta lista rodziny = brak filtra.
    """
    if not family.allowed_apparatus_kinds:
        return base
    allowed = set(family.allowed_apparatus_kinds)
    devices = [
        device
        for device in base.devices
        if FAMILY_APPARATUS_FOR_TEMPLATE_KIND.get(device.kind) is None
        or FAMILY_APPARATUS_FOR_TEMPLATE_KIND[device.kind] in allowed
    ]
    if len(devices) == len(base.devices):
        return base
    return base.model_copy(update={"devices": devices})


def _build_family_template(
    base: BayTemplate,
    bay_kind: BayKind,
    suffix: str,
    family: SwitchgearFamily,
) -> CompleteMvBayTemplate:
    template = CompleteMvBayTemplate(
        template_ref=f"{family.switchgear_family_ref}__{suffix.upper()}",
        base_template=_family_filtered_base(base, family),
        manufacturer_ref=family.manufacturer_ref,
        switchgear_family_ref=family.switchgear_family_ref,
        bay_kind=bay_kind,
        bay_role=base.bay_role,
        source_status="repo_verified",
        source_refs=family.source_refs or family.source_document_refs,
        version=family.source_version or "repo-verified",
        notes_pl=(
            f"{family.family_name}: kompletne pole SN z układem aparatury, portami "
            "i powiązaniem katalogowym rodziny rozdzielnicy."
        ),
    )
    return template.model_copy(update={"hash": template.compute_hash()})


def _build_registry() -> dict[str, CompleteMvBayTemplate]:
    """Zbuduj rejestr kanonicznych fallbacków (deterministyczny).

    Klucz: `template_ref` (np. "CANONICAL_FALLBACK__LINE_IN").
    """
    return {
        _build_canonical_template(base, kind, suffix).template_ref: _build_canonical_template(
            base, kind, suffix
        )
        for base, kind, suffix in _CANONICAL_FALLBACK_MAPPING
    }


CANONICAL_FALLBACK_REGISTRY: dict[str, CompleteMvBayTemplate] = _build_registry()


def list_canonical_fallback_templates() -> list[CompleteMvBayTemplate]:
    """Lista kanonicznych fallbacków posortowanych po `template_ref`."""
    return sorted(
        CANONICAL_FALLBACK_REGISTRY.values(),
        key=lambda t: t.template_ref,
    )


def get_canonical_fallback_for_bay_kind(bay_kind: BayKind) -> CompleteMvBayTemplate | None:
    """Pobiera kanoniczny fallback dla danego typu pola (None gdy nie ma).

    Używane przez UI BayTemplatePicker gdy operator wybierze producenta o
    statusie `requires_catalog` — wówczas fallback do canonical.
    """
    for template in CANONICAL_FALLBACK_REGISTRY.values():
        if template.bay_kind == bay_kind:
            return template
    return None


def list_canonical_fallback_for_manufacturer(
    manufacturer_ref: str | None,
) -> list[CompleteMvBayTemplate]:
    """Lista canonical fallback templates (manufacturer_ref ignorowany).

    Helper dla API: gdy klient pyta o szablony konkretnego producenta o
    statusie `requires_catalog`, zwracamy listę canonical fallbacks z
    metadanymi `manufacturer_ref=requested` aby UI mógł pokazać badge.
    """
    fallbacks = list_canonical_fallback_templates()
    if manufacturer_ref is None:
        return fallbacks
    return [
        template.model_copy(update={"manufacturer_ref": manufacturer_ref}) for template in fallbacks
    ]


def list_switchgear_solution_templates_for_manufacturer(
    manufacturer_ref: str | None,
) -> list[CompleteMvBayTemplate]:
    """Complete MV bay solution packages bound to verified switchgear families.

    This is the product-facing catalog path. If a UI exposes a switchgear
    family, the endpoint must return complete family-bound bay packages instead
    of surfacing missing-catalog states to the designer.
    """
    families = (
        list_families_for_manufacturer(manufacturer_ref)
        if manufacturer_ref is not None
        else list_switchgear_families()
    )
    templates: list[CompleteMvBayTemplate] = []
    for family in families:
        allowed_kinds = set(family.allowed_bay_kinds)
        for base, bay_kind, suffix in _CANONICAL_FALLBACK_MAPPING:
            if allowed_kinds and bay_kind not in allowed_kinds:
                continue
            templates.append(_build_family_template(base, bay_kind, suffix, family))
    return sorted(
        templates,
        key=lambda template: (
            template.manufacturer_ref or "",
            template.switchgear_family_ref or "",
            template.bay_kind,
            template.template_ref,
        ),
    )
