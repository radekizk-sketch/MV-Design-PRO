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
from .complete_mv_bay_template import BayKind, CompleteMvBayTemplate

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
        template.model_copy(update={"manufacturer_ref": manufacturer_ref})
        for template in fallbacks
    ]
