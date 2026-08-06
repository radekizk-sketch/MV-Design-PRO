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


def test_nazwa_obiecujaca_pomiar_deklaruje_role_measurement() -> None:
    """Szablon-fantom (V12K-329, dyrektywa zero-fabrykacji, 2026-08-06).

    KLASA, nie instancja: KAŻDY szablon, którego nazwa lub opis obiecuje pole
    pomiarowe („pomiar…"/„VT"), musi deklarować rolę MEASUREMENT w obrębie
    domyślnej liczby pól — inaczej materializacja dopełnia OUT i stacja
    powstaje BEZ pola pomiarowego, choć nazwa je obiecuje (wykryte na
    `tpl_sn_nn_1000kva` „RMU 4-pole + pomiary" przy audycie sieci pokazowej;
    ta sama wada była w `tpl_sn_nn_1600kva` „z VT").
    """
    from application.station_templates.apply import _resolve_sn_bay_roles

    zbadane = 0
    for template in list_templates():
        tekst = f"{template.name_pl} {template.description_pl}".lower()
        obiecuje_pomiar = "pomiar" in tekst or " vt" in tekst or "vt," in tekst
        if not obiecuje_pomiar:
            continue
        schema = template.schema
        if schema.sn_bays_count is None:
            continue
        zbadane += 1
        role = _resolve_sn_bay_roles(template, schema.sn_bays_count.default)
        assert "MEASUREMENT" in role, (
            f"Szablon '{template.id}' ({template.name_pl!r}) obiecuje pomiar/VT, "
            f"a domyślne role pól to {role} — brak MEASUREMENT (szablon-fantom)."
        )
    assert zbadane >= 2, f"Test ma objąć co najmniej 1000kVA i 1600kVA (objęte: {zbadane})"


def test_pomiar_degraduje_przed_polem_tr_przy_obnizonej_liczbie_pol() -> None:
    """Predykaty parami (V12K-329): kolejność deklaracji ról gwarantuje, że
    obniżenie liczby pól przez użytkownika degraduje NAJPIERW pole pomiarowe,
    NIGDY pole transformatorowe (stacja z TR bez pola TR = model sprzeczny)."""
    from application.station_templates.apply import _resolve_sn_bay_roles

    template = get_template("tpl_sn_nn_1000kva")
    assert template is not None
    for count in (3, 4):
        role = _resolve_sn_bay_roles(template, count)
        assert "TR" in role, f"count={count}: pole TR wypadło przed pomiarowym ({role})"


def test_pole_pomiarowe_przed_polem_tr_w_kazdym_szablonie() -> None:
    """Standard układów pomiarowych OSD (dyrektywa właściciela 2026-08-06,
    V12K-330): pole pomiarowe leży PIERWSZE od kierunku zasilania — przed
    częścią transformatorową. KLASA, nie instancja: sprawdzamy KAŻDY szablon
    deklarujący jednocześnie MEASUREMENT i TR (wykryte naruszenia: typowe
    1000/1600 kVA po V12K-329 oraz zastane zksn_wnetrzowe, gdzie pomiar był
    doklejany ZA polami TR)."""
    zbadane = 0
    for template in list_templates():
        role = [r.role for r in template.schema.sn_bay_roles]
        if "MEASUREMENT" not in role or "TR" not in role:
            continue
        zbadane += 1
        assert role.index("MEASUREMENT") < role.index("TR"), (
            f"Szablon '{template.id}': pole pomiarowe (poz. {role.index('MEASUREMENT')}) "
            f"leży ZA polem TR (poz. {role.index('TR')}) — narusza standard układów "
            f"pomiarowych (pomiar pierwszy od kierunku zasilania): {role}"
        )
    assert zbadane >= 4, f"Test ma objąć typowe+przemysłowe+zksn (objęte: {zbadane})"


def test_keep_tr_obniniejsza_liczba_pol_nie_wycina_pola_tr() -> None:
    """Para do reguły keep-TR w `_resolve_sn_bay_roles` (V12K-330/333): skoro
    pomiar stoi PRZED TR, obcięcie liczby pól nie może wyciąć pola
    transformatorowego — wypada ostatnia rola nie-TR."""
    from application.station_templates.apply import _resolve_sn_bay_roles

    template = get_template("tpl_sn_nn_1000kva")
    assert template is not None
    assert _resolve_sn_bay_roles(template, 4) == ["IN", "MEASUREMENT", "TR", "OUT"]
    assert _resolve_sn_bay_roles(template, 3) == ["IN", "MEASUREMENT", "TR"]
    assert _resolve_sn_bay_roles(template, 2) == ["IN", "TR"]


def test_pomiar_rozliczeniowy_nie_lezy_w_torze_tranzytu() -> None:
    """Kontrakt `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md` §3 (V12K-333,
    korekta właściciela: pomiar mierzy CAŁY i TYLKO pobór klienta — klienci
    wiszą w odgałęzieniu od toru; standard Enei: przekładniki pola
    pomiarowego 5/5–15/5 A to prądy przyłącza, nie magistrali).

    KLASA, nie instancja — dla KAŻDEGO szablonu z polem POMIAROWYM:
    - klasa B (stacja abonencka): przed pomiarem WYŁĄCZNIE pole dopływowe
      (IN) — zero pary tranzytowej w rozdzielnicy klienta;
    - klasa C (złącze kablowe ZK-SN): przed pomiarem pętla OSD (IN, OUT) —
      pomiar jest polem odpływowym gałęzi klienta;
    - w obu: żadne pole TR przed pomiarem (część kliencka ZA pomiarem).
    """
    from application.station_templates import TemplateCategory

    zbadane = 0
    for template in list_templates():
        role = [r.role for r in template.schema.sn_bay_roles]
        if "MEASUREMENT" not in role:
            continue
        zbadane += 1
        przed = role[: role.index("MEASUREMENT")]
        assert "TR" not in przed, (
            f"Szablon '{template.id}': pole TR przed pomiarem ({role}) — część "
            "kliencka musi leżeć ZA układem pomiarowym."
        )
        if template.category == TemplateCategory.ZKSN_WNETRZOWA:
            assert przed in (["IN"], ["IN", "OUT"]), (
                f"Złącze '{template.id}': przed pomiarem dopuszczalna wyłącznie "
                f"pętla OSD (IN[, OUT]), jest {przed}."
            )
        else:
            assert all(r == "IN" for r in przed), (
                f"Szablon '{template.id}' (klasa B — stacja abonencka): przed "
                f"pomiarem wyłącznie pole dopływowe, jest {przed} — para "
                "tranzytowa w rozdzielnicy klienta oznacza pomiar w torze "
                "tranzytu magistrali (zakaz kontraktu §1)."
            )
    assert zbadane >= 7, f"Test ma objąć wszystkie rodziny z pomiarem (objęte: {zbadane})"
