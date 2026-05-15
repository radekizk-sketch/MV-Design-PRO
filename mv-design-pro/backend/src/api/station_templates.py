"""Station Templates API — K30-16 user-requested 57+ templates.

REST endpoints:
- GET /api/station-templates — list all 57 templates
- GET /api/station-templates?category=<cat> — filter by category
- GET /api/station-templates/{template_id} — full schema + editable params
- GET /api/station-templates/categories — list 10 categories with counts
"""

from __future__ import annotations

from typing import Any

from application.station_templates import (
    StationTemplate,
    TemplateCategory,
    get_template,
    list_templates,
    list_templates_by_category,
)
from application.station_templates.service import count_by_category
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/station-templates", tags=["station-templates"])


@router.get("")
def list_station_templates(
    category: str | None = Query(default=None, description="Filter by TemplateCategory value"),
) -> dict[str, Any]:
    """Return list of templates (optionally filtered by category)."""
    if category is not None:
        try:
            cat_enum = TemplateCategory(category)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown category '{category}'. Valid: {[c.value for c in TemplateCategory]}",
            ) from exc
        templates = list_templates_by_category(cat_enum)
    else:
        templates = list_templates()

    return {
        "templates": [_to_summary(t) for t in templates],
        "total": len(templates),
    }


@router.get("/categories")
def list_categories() -> dict[str, Any]:
    """Return 10 categories z counts dla wizard step 1 (Kategoria)."""
    counts = count_by_category()
    return {
        "categories": [
            {
                "id": cat.value,
                "label_pl": _CATEGORY_LABELS[cat],
                "icon": _CATEGORY_ICONS[cat],
                "description_pl": _CATEGORY_DESCRIPTIONS[cat],
                "template_count": counts.get(cat.value, 0),
            }
            for cat in TemplateCategory
        ],
        "total_templates": sum(counts.values()),
    }


@router.get("/{template_id}")
def get_station_template(template_id: str) -> dict[str, Any]:
    """Full template definition z editable schema."""
    template = get_template(template_id)
    if template is None:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")
    return template.to_dict()


def _to_summary(t: StationTemplate) -> dict[str, Any]:
    """Lightweight summary dla list endpoint (no schema details)."""
    return {
        "id": t.id,
        "name_pl": t.name_pl,
        "category": t.category.value,
        "description_pl": t.description_pl,
        "use_case_pl": t.use_case_pl,
        "nc_rfg_type": t.nc_rfg_type,
        "tags": list(t.tags),
        "icon": t.icon,
    }


_CATEGORY_LABELS: dict[TemplateCategory, str] = {
    TemplateCategory.TYPOWA_SN_NN: "Typowe stacje SN/nN",
    TemplateCategory.SLUPOWA: "Stacje słupowe ZSP",
    TemplateCategory.ZKSN_WNETRZOWA: "Stacje ZKSN wnętrzowe",
    TemplateCategory.PROSUMENT_PV: "Mikroinstalacje PV prosument",
    TemplateCategory.FARMA_PV: "Farmy PV SN",
    TemplateCategory.BESS: "Magazyny BESS",
    TemplateCategory.HYBRYDOWA: "Hybrydy PV + BESS",
    TemplateCategory.PRZEMYSLOWA: "Przemysłowe odbiorcze",
    TemplateCategory.WIATROWA: "Stacje OZE wiatrowe",
    TemplateCategory.SEKCYJNA: "Stacje sekcyjne / pętlowe",
}

_CATEGORY_ICONS: dict[TemplateCategory, str] = {
    TemplateCategory.TYPOWA_SN_NN: "station-distribution",
    TemplateCategory.SLUPOWA: "station-pole",
    TemplateCategory.ZKSN_WNETRZOWA: "station-indoor",
    TemplateCategory.PROSUMENT_PV: "station-pv-prosument",
    TemplateCategory.FARMA_PV: "station-pv-farm",
    TemplateCategory.BESS: "station-bess",
    TemplateCategory.HYBRYDOWA: "station-hybrid",
    TemplateCategory.PRZEMYSLOWA: "station-industrial",
    TemplateCategory.WIATROWA: "station-wind",
    TemplateCategory.SEKCYJNA: "station-sectional",
}

_CATEGORY_DESCRIPTIONS: dict[TemplateCategory, str] = {
    TemplateCategory.TYPOWA_SN_NN: "Standardowe stacje dystrybucyjne 100-2500 kVA",
    TemplateCategory.SLUPOWA: "Stacje słupowe ZSP (50-400 kVA, wieś)",
    TemplateCategory.ZKSN_WNETRZOWA: "Stacje wnętrzowe z RMU (630-2500 kVA, miasto)",
    TemplateCategory.PROSUMENT_PV: "Mikroinstalacje PV 5-250 kW (NC RfG typ A-C)",
    TemplateCategory.FARMA_PV: "Farmy PV SN 0.5-5 MW z block transformer",
    TemplateCategory.BESS: "Magazyny BESS 0.5-5 MW z usługami systemowymi",
    TemplateCategory.HYBRYDOWA: "Farmy hybrydowe PV + BESS",
    TemplateCategory.PRZEMYSLOWA: "Stacje przemysłowe odbiorcze (zakłady, silniki)",
    TemplateCategory.WIATROWA: "Stacje OZE wiatrowe (Vestas V90/V112)",
    TemplateCategory.SEKCYJNA: "Stacje sekcyjne/pętlowe z NOP/SZR",
}
