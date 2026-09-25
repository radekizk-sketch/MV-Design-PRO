"""Tests for K30-16/V12T-016 station templates library — 73+ templates across
15 categories (57 K30-16 + 16 V12T-016 delta: role A GPZ_110_SN/
ROZDZIELNIA_SIECIOWA, role C STACJA_ABONENCKA, role E KOMPENSACJA/
REZERWA_ZASILANIA)."""

from __future__ import annotations

import json

import pytest
from application.station_templates import (
    TEMPLATE_CATEGORY_LABELS_PL,
    TemplateCategory,
    get_template,
    list_templates,
    list_templates_by_category,
)
from application.station_templates.service import count_by_category


def test_total_template_count_matches_plan() -> None:
    """K30-16 + V12T-016 plan: 73 templates total across 15 categories."""
    templates = list_templates()
    assert len(templates) >= 73, f"Expected 73+ templates, got {len(templates)}"


def test_all_15_categories_present() -> None:
    """Plan: 15 distinct categories must be populated (K30-16's 10 + V12T-016's
    5: rola A GPZ_110_SN/ROZDZIELNIA_SIECIOWA, rola C STACJA_ABONENCKA, rola E
    KOMPENSACJA/REZERWA_ZASILANIA — rejestr długu V12T-016)."""
    counts = count_by_category()
    expected_categories = {c.value for c in TemplateCategory}
    actual_categories = set(counts.keys())
    assert (
        actual_categories == expected_categories
    ), f"Missing categories: {expected_categories - actual_categories}"


def test_category_breakdown_per_plan() -> None:
    """Per K30-16 plan: 10/6/8/6/5/5/5/5/4/3; V12T-016 delta: 3/3/4/3/3."""
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
    assert counts[TemplateCategory.GPZ_110_SN.value] == 3
    assert counts[TemplateCategory.ROZDZIELNIA_SIECIOWA.value] == 3
    assert counts[TemplateCategory.STACJA_ABONENCKA.value] == 4
    assert counts[TemplateCategory.KOMPENSACJA.value] == 3
    assert counts[TemplateCategory.REZERWA_ZASILANIA.value] == 3


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
    """User K30-15.4: 'wszystko konfikguraowalne' — schema musi expose editable params.

    KLASA NIE INSTANCJA (V12T-016): szablony BEZ transformatora (rola A
    „rozdzielnia sieciowa"/E „kompensacja"/„rezerwa zasilania" — węzły czysto
    przełączeniowe, bez strony nN z definicji) są jedynym uczciwym wyjątkiem —
    predykat wynika WPROST ze schematu (`transformer_options` puste), nie z
    nazwy kategorii, żeby żaden przyszły szablon nie „wpadł" w wyjątek po cichu."""
    for t in list_templates():
        schema = t.schema
        bez_transformatora = not schema.transformer_options
        if not bez_transformatora:
            assert len(schema.transformer_options) > 0, f"{t.id}: no transformer options"
        # nN feeders count must be editable z range
        assert schema.nn_feeders_count.min_value >= 0
        assert schema.nn_feeders_count.max_value >= schema.nn_feeders_count.default
        # SN bays count editable
        assert schema.sn_bays_count.max_value >= schema.sn_bays_count.default


def test_templates_are_complete_catalog_solution_packages() -> None:
    """Każdy szablon stacji jest kompletnym pakietem katalogowym, nie stanem do
    dopinania w UI.

    KLASA NIE INSTANCJA (V12T-016): dwa NIEZALEŻNE, schematowo wyprowadzone
    wyjątki (predykaty parami z jednego źródła prawdy — `TemplateSchema`, nie
    kategoria):
    - `transformer_options` puste ⇒ szablon jest węzłem BEZ transformatora
      (rola A/E) — nic do wymagania w typoszeregu transformatorów.
    - `nn_feeders_count.max_value == 0` ⇒ szablon nie ma strony nN wcale
      (GPZ — zasila sieć SN, nie odbiorców bezpośrednio) — wymaganie aparatów
      odpływów nN/CT/VT byłoby fabrykacją danej dla nieistniejącej strony.
    """
    for template in list_templates():
        schema = template.schema
        bez_transformatora = not schema.transformer_options
        bez_strony_nn = schema.nn_feeders_count.max_value == 0
        if not bez_transformatora:
            assert schema.transformer_options, f"{template.id}: brak typoszeregu transformatorów"
        assert schema.sn_bay_roles, f"{template.id}: brak ról pól SN"
        assert schema.sn_bay_protection_options, f"{template.id}: brak zabezpieczeń pól SN"
        if not bez_strony_nn:
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


def test_structural_fields_present_for_every_template() -> None:
    """TODO-UI2 §1 p. 12: pola strukturalne (moc/napięcie/zastosowanie/role)
    z KATALOGU, nie z parsowania `name_pl` — iloczyn cech: WSZYSTKIE 73+
    szablony × wszystkie pola. `rated_power_kva`/`voltage_hv_kv`/
    `voltage_lv_kv` mogą być `None` gdy katalog niedostępny w środowisku (nie
    ten test — patrz test_apply_odgalezienie.py, który już dowodzi dostępności
    katalogu w tym środowisku testowym) ALBO szablon bez `transformer_options`
    — jedyny uczciwy taki przypadek to węzły BEZ transformatora (V12T-016,
    rola A „rozdzielnia sieciowa"/E „kompensacja"/„rezerwa zasilania" —
    zmierzone niżej: dokładnie te 3 kategorie, 9 szablonów)."""
    templates = list_templates()
    assert len(templates) >= 73
    bez_tr_kategorie = {
        TemplateCategory.ROZDZIELNIA_SIECIOWA,
        TemplateCategory.KOMPENSACJA,
        TemplateCategory.REZERWA_ZASILANIA,
    }
    policzone_bez_tr = 0
    for t in templates:
        d = t.to_dict()
        for pole in (
            "category_label_pl",
            "rated_power_kva",
            "voltage_hv_kv",
            "voltage_lv_kv",
            "bay_role_categories",
        ):
            assert pole in d, f"{t.id}: brak pola strukturalnego {pole!r}"
        assert d["category_label_pl"] == TEMPLATE_CATEGORY_LABELS_PL[t.category], t.id
        assert d["bay_role_categories"] == sorted({r.role for r in t.schema.sn_bay_roles}), t.id
        bez_transformatora = not t.schema.transformer_options
        assert bez_transformatora == (t.category in bez_tr_kategorie), (
            f"{t.id}: brak transformer_options poza zamkniętym zbiorem kategorii "
            f"BEZ transformatora ({[c.value for c in bez_tr_kategorie]})"
        )
        if bez_transformatora:
            policzone_bez_tr += 1
            assert d["rated_power_kva"] is None, f"{t.id}: rated_power_kva fabrykowane bez TR"
            assert d["voltage_hv_kv"] is None, f"{t.id}: voltage_hv_kv fabrykowane bez TR"
            assert d["voltage_lv_kv"] is None, f"{t.id}: voltage_lv_kv fabrykowane bez TR"
            continue
        assert (
            d["rated_power_kva"] is not None
        ), f"{t.id}: rated_power_kva=None mimo transformer_options"
        assert (
            d["voltage_hv_kv"] is not None
        ), f"{t.id}: voltage_hv_kv=None mimo transformer_options"
        assert (
            d["voltage_lv_kv"] is not None
        ), f"{t.id}: voltage_lv_kv=None mimo transformer_options"
        assert d["rated_power_kva"] > 0
        assert d["voltage_hv_kv"] > d["voltage_lv_kv"] > 0
    assert policzone_bez_tr == 9, f"Oczekiwano 9 szablonów bez TR, zmierzono {policzone_bez_tr}"


def test_structural_fields_parity_list_vs_detail() -> None:
    """Reguła KLASA NIE INSTANCJA pkt 3 (predykaty parami z jednego źródła
    prawdy): pola strukturalne w podsumowaniu listy (`_to_summary`, przez
    `count_by_category`/API) muszą być IDENTYCZNE z `to_dict()` pełnego
    szczegółu dla TEGO SAMEGO szablonu — inaczej filtr przeglądarki (czyta
    listę) i karta szczegółu pokazywałyby różne liczby dla tego samego obiektu."""
    from application.station_templates.schema import structural_fields

    for t in list_templates():
        pelny = t.to_dict()
        podsumowanie = structural_fields(t)
        for pole in podsumowanie:
            assert pelny[pole] == podsumowanie[pole], f"{t.id}: rozjazd pola {pole!r}"


def test_catalog_choice_rated_kva_parses_kva_and_mva_tokens() -> None:
    """Token identyfikatora (NIE label_pl/name_pl) koduje moc, delimiter '-'
    (konwencja realnego katalogu — zob. `tr-sn-nn-15-04-630kva-dyn11` w
    `tpl_sn_nn_630kva`, zweryfikowane empirycznie): jednostka kVA wprost, MVA
    z separatorem 'p' jako przecinek dziesiętny."""
    from application.station_templates.schema import CatalogChoice, catalog_choice_rated_kva

    kva, ref = catalog_choice_rated_kva(
        CatalogChoice(
            catalog_ref="tr-sn-nn-15-04-630kva-dyn11",
            label_pl="TR 630 kVA",
            namespace="mv_transformers",
        )
    )
    assert (kva, ref) == (630, "tr-sn-nn-15-04-630kva-dyn11")

    kva_mva, ref_mva = catalog_choice_rated_kva(
        CatalogChoice(
            catalog_ref="conv-pv-3p15mva-block", label_pl="3,15 MVA", namespace="mv_converters"
        )
    )
    assert kva_mva == 3150
    assert ref_mva == "conv-pv-3p15mva-block"

    brak_tokenu, ref_brak = catalog_choice_rated_kva(
        CatalogChoice(catalog_ref="tr-bez-moc-w-id", label_pl="X", namespace="mv_transformers")
    )
    assert brak_tokenu is None
    assert ref_brak == "tr-bez-moc-w-id"

    assert catalog_choice_rated_kva(object()) == (None, None)


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
    """Para do reguł keep-TR i keep-POMIAR w `_resolve_sn_bay_roles`
    (V12K-330/333, karta POMIAR-ODGAŁĘZIENIE).

    INTENCJA (bez zmian): obcięcie liczby pól nie może wyciąć pola
    transformatorowego — stacja z transformatorem bez pola TR to model sprzeczny.

    KANON ZMIENIONY (POMIAR-ODGAŁĘZIENIE): pole POMIAROWE jest tak samo
    nieusuwalne jak TR, bo to ono decyduje o KLASIE przyłączenia (kontrakt
    `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md`). Dawny wynik `count=2 →
    ["IN", "TR"]` po cichu robił ze stacji abonenckiej stację dystrybucyjną,
    którą aplikacja wcięłaby w tranzyt magistrali — dokładnie ten defekt, przed
    którym broni kontrakt. Zamiast cichego obcięcia: JAWNY błąd z minimum.
    """
    from application.station_templates.apply import TemplateApplyError, _resolve_sn_bay_roles

    template = get_template("tpl_sn_nn_1000kva")
    assert template is not None
    assert _resolve_sn_bay_roles(template, 4) == ["IN", "MEASUREMENT", "TR", "OUT"]
    assert _resolve_sn_bay_roles(template, 3) == ["IN", "MEASUREMENT", "TR"]
    with pytest.raises(TemplateApplyError) as wyjatek:
        _resolve_sn_bay_roles(template, 2)
    assert wyjatek.value.code == "template.sn_bays_count_below_minimum"

    # Szablon BEZ pomiaru zachowuje dotychczasowe zachowanie keep-TR co do joty.
    dystrybucyjna = get_template("tpl_sn_nn_630kva")
    assert dystrybucyjna is not None
    assert _resolve_sn_bay_roles(dystrybucyjna, 3) == ["IN", "OUT", "TR"]
    assert _resolve_sn_bay_roles(dystrybucyjna, 2) == ["IN", "TR"]
    assert _resolve_sn_bay_roles(dystrybucyjna, 1) == ["TR"]


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


def test_structural_power_zgadza_sie_z_transformatorem_ktory_zmaterializuje_apply() -> None:
    """KLASA NIE INSTANCJA pkt 3/4 (przegląd V12T-016, 2026-09): PRZED tą
    kartą `structural_fields()` (kafel/filtr przeglądarki) i
    `apply.py::_resolve_transformer_ref_for_template` (materializacja)
    liczyły „domyślną" opcję transformatora DWIEMA NIEZALEŻNYMI regułami
    (flaga `default=True`/pierwsza opcja, kontra token mocy z ID szablonu) —
    zmierzone: 34 z 73 szablonów pokazywały moc/napięcie, których `apply()`
    wcale by nie zmaterializował (np. `tpl_sn_nn_1000kva` pokazywał 630 kVA
    zamiast 1000). Iloczyn cech: KAŻDY szablon z `transformer_options`
    niepustym × obie ścieżki muszą wskazać TĘ SAMĄ pozycję katalogu."""
    from application.station_templates.apply import _resolve_transformer_ref_for_template
    from application.station_templates.schema import (
        catalog_choice_rated_kva,
        resolve_template_default_transformer_choice,
    )

    zbadane = 0
    for t in list_templates():
        if not t.schema.transformer_options:
            continue
        zbadane += 1
        wyswietlana_opcja = resolve_template_default_transformer_choice(t)
        assert wyswietlana_opcja is not None, t.id
        zmaterializowany_ref = _resolve_transformer_ref_for_template(
            t, overrides={}, catalog_profile=None
        )
        assert wyswietlana_opcja.catalog_ref == zmaterializowany_ref, (
            f"{t.id}: kafel pokazuje '{wyswietlana_opcja.catalog_ref}', "
            f"apply() materializuje '{zmaterializowany_ref}'"
        )
        moc_kafla, _ = catalog_choice_rated_kva(wyswietlana_opcja)
        assert moc_kafla is not None and moc_kafla > 0, t.id
    assert zbadane == 64, f"Oczekiwano 64 szablonów z TR (73 - 9 bez TR), zmierzono {zbadane}"
