"""Station Templates module — K30-16 user-requested 57+ template library.

Templates definiują kompletne konfiguracje stacji SN/nN per use-case:
- 10 kategorii (dystrybucyjna, słupowa, ZKSN, prosument PV, farmy PV, BESS,
  hybrydowe PV+BESS, przemysłowe, wiatrowe, sekcyjne)
- 57+ szablonów łącznie
- Każdy template w pełni edytowalny w wizardzie (transformer, switchgear,
  bays, nN feeders, DER, protection, measurements)

Public API:
- `list_templates()` — wszystkie templates
- `list_templates_by_category(category)` — filter
- `get_template(template_id)` — pełna definicja z editable schema
"""

from application.station_templates.apply import (
    TemplateApplyError,
    apply_template_to_case,
)
from application.station_templates.schema import (
    TEMPLATE_CATEGORY_LABELS_PL,
    StationTemplate,
    TemplateCategory,
    TemplateSchema,
    catalog_choice_rated_kva,
    kategoria_wchodzi_w_segment,
    structural_fields,
    template_wchodzi_w_segment,
    transformer_voltages_kv,
)
from application.station_templates.service import (
    get_template,
    list_templates,
    list_templates_by_category,
)

__all__ = [
    "TEMPLATE_CATEGORY_LABELS_PL",
    "StationTemplate",
    "TemplateApplyError",
    "TemplateCategory",
    "TemplateSchema",
    "apply_template_to_case",
    "catalog_choice_rated_kva",
    "get_template",
    "list_templates",
    "list_templates_by_category",
    "kategoria_wchodzi_w_segment",
    "structural_fields",
    "template_wchodzi_w_segment",
    "transformer_voltages_kv",
]
