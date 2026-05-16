"""Station templates service — public API for template registry access."""

from __future__ import annotations

from application.station_templates.schema import StationTemplate, TemplateCategory


def list_templates() -> list[StationTemplate]:
    """Return all 57 templates sorted by category + id."""
    from application.station_templates.templates import ALL_TEMPLATES
    return sorted(ALL_TEMPLATES, key=lambda t: (t.category.value, t.id))


def list_templates_by_category(category: TemplateCategory) -> list[StationTemplate]:
    """Filter templates by category."""
    return [t for t in list_templates() if t.category == category]


def get_template(template_id: str) -> StationTemplate | None:
    """Find single template by id."""
    for t in list_templates():
        if t.id == template_id:
            return t
    return None


def count_by_category() -> dict[str, int]:
    """Stats: count templates per category."""
    counts: dict[str, int] = {}
    for t in list_templates():
        counts[t.category.value] = counts.get(t.category.value, 0) + 1
    return counts
