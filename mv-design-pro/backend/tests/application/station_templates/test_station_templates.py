"""Tests for K30-16 station templates library — 57+ templates across 10 categories."""

from __future__ import annotations

import json

from application.station_templates import (
    TemplateCategory,
    get_template,
    list_templates,
    list_templates_by_category,
)
from application.station_templates.service import count_by_category


def test_total_template_count_matches_plan() -> None:
    """K30-16 plan: 57 templates total across 10 categories."""
    templates = list_templates()
    assert len(templates) >= 57, f"Expected 57+ templates, got {len(templates)}"


def test_all_10_categories_present() -> None:
    """Plan: 10 distinct categories must be populated."""
    counts = count_by_category()
    expected_categories = {c.value for c in TemplateCategory}
    actual_categories = set(counts.keys())
    assert (
        actual_categories == expected_categories
    ), f"Missing categories: {expected_categories - actual_categories}"


def test_category_breakdown_per_plan() -> None:
    """Per K30-16 plan: 10/6/8/6/5/5/5/5/4/3 templates per category."""
    counts = count_by_category()
    assert counts[TemplateCategory.TYPOWA_SN_NN.value] == 10
    assert counts[TemplateCategory.SLUPOWA.value] == 6
    assert counts[TemplateCategory.ZKSN_WNETRZOWA.value] == 8
    assert counts[TemplateCategory.PROSUMENT_PV.value] == 6
    assert counts[TemplateCategory.FARMA_PV.value] == 5
    assert counts[TemplateCategory.BESS.value] == 5
    assert counts[TemplateCategory.HYBRYDOWA.value] == 5
    assert counts[TemplateCategory.PRZEMYSLOWA.value] == 5
    assert counts[TemplateCategory.WIATROWA.value] == 4
    assert counts[TemplateCategory.SEKCYJNA.value] == 3


def test_each_template_has_required_fields() -> None:
    """Every template must have id, name_pl, category, schema."""
    for t in list_templates():
        assert t.id, "Template missing id"
        assert t.id.startswith("tpl_"), f"Template id must start with 'tpl_': {t.id}"
        assert t.name_pl, f"Template {t.id} missing name_pl"
        assert t.description_pl, f"Template {t.id} missing description_pl"
        assert t.use_case_pl, f"Template {t.id} missing use_case_pl"
        assert t.schema is not None


def test_all_template_ids_unique() -> None:
    templates = list_templates()
    ids = [t.id for t in templates]
    assert len(ids) == len(set(ids)), "Duplicate template IDs detected"


def test_templates_have_editable_params() -> None:
    """User K30-15.4: 'wszystko konfikguraowalne' — schema musi expose editable params."""
    for t in list_templates():
        schema = t.schema
        # Transformer options must be non-empty
        assert len(schema.transformer_options) > 0, f"{t.id}: no transformer options"
        # nN feeders count must be editable z range
        assert schema.nn_feeders_count.min_value >= 0
        assert schema.nn_feeders_count.max_value >= schema.nn_feeders_count.default
        # SN bays count editable
        assert schema.sn_bays_count.max_value >= schema.sn_bays_count.default


def test_templates_are_complete_catalog_solution_packages() -> None:
    """Każdy szablon stacji jest kompletnym pakietem katalogowym, nie stanem do dopinania w UI."""
    for template in list_templates():
        schema = template.schema
        assert schema.transformer_options, f"{template.id}: brak typoszeregu transformatorów"
        assert schema.sn_bay_roles, f"{template.id}: brak ról pól SN"
        assert schema.sn_bay_protection_options, f"{template.id}: brak zabezpieczeń pól SN"
        assert schema.ct_options, f"{template.id}: brak przekładników CT"
        assert schema.vt_options, f"{template.id}: brak przekładników VT"
        assert schema.nn_feeder_cb_options, f"{template.id}: brak aparatów odpływów nN"
        for role in schema.sn_bay_roles:
            assert role.role and role.label_pl, f"{template.id}: niekompletna rola pola SN"


def test_der_templates_have_inverter_count_editable() -> None:
    """DER templates: liczba falowników musi być editable per user demand."""
    der_categories = (
        TemplateCategory.PROSUMENT_PV,
        TemplateCategory.FARMA_PV,
        TemplateCategory.BESS,
        TemplateCategory.HYBRYDOWA,
        TemplateCategory.WIATROWA,
    )
    for cat in der_categories:
        for t in list_templates_by_category(cat):
            assert len(t.schema.der_options) > 0, f"{t.id}: no DER options"
            assert t.schema.der_total_count.max_value >= t.schema.der_total_count.default
            assert t.schema.der_total_count.default >= 1


def test_get_template_returns_full_definition() -> None:
    t = get_template("tpl_sn_nn_630kva")
    assert t is not None
    assert t.category == TemplateCategory.TYPOWA_SN_NN
    assert "630" in t.name_pl


def test_get_template_returns_none_for_unknown() -> None:
    assert get_template("tpl_nonexistent") is None


def test_template_dict_serialization() -> None:
    """to_dict() must produce JSON-serializable structure."""
    t = get_template("tpl_farma_pv_2mw")
    assert t is not None
    d = t.to_dict()
    # Must be JSON-serializable
    json_str = json.dumps(d, ensure_ascii=False)
    assert "2 MW" in json_str
    # Schema must expose DER options
    assert "der_options" in d["schema"]
    assert len(d["schema"]["der_options"]) > 0


def test_nc_rfg_type_set_for_oze_templates() -> None:
    """OZE templates must declare NC RfG type (A/B/C/D)."""
    oze_categories = (
        TemplateCategory.PROSUMENT_PV,
        TemplateCategory.FARMA_PV,
        TemplateCategory.BESS,
        TemplateCategory.HYBRYDOWA,
        TemplateCategory.WIATROWA,
    )
    for cat in oze_categories:
        for t in list_templates_by_category(cat):
            assert t.nc_rfg_type in (
                "A",
                "B",
                "C",
                "D",
            ), f"{t.id} ({cat.value}): NC RfG type missing"


def test_protection_options_use_e2tango_or_known_vendors() -> None:
    """Protection options must reference real device IDs (K30-16 catalog)."""
    valid_vendors = {
        "ELEKTROMETAL",
        "SIEMENS",
        "ABB",
        "SCHNEIDER",
        "SEL",
        "GE",
        "ZPAS",
        "ELESTER",
        "ENERGOTEST",
        "ZIAD",
    }
    for t in list_templates():
        for prot in t.schema.sn_bay_protection_options:
            assert prot.vendor in valid_vendors, f"{t.id}: unknown vendor '{prot.vendor}'"
