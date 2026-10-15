"""Transformator stacji i tory jednostek DER-SN szablonów — jedna reguła, bez cichych wyborów.

POWÓD (karta GPT-478, rozstrzygnięcie architekta 2026-10-15, pomiar przed naprawą):

* jednostki szablonów farm PV, BESS, hybryd i wiatru były pozycjami „15 kV" przyłączanymi
  wariantem „przez transformator blokowy" do JEDYNEGO transformatora stacji 15/0,4 kV;
  operacja stawiała je na szynie SN (strona górna tego transformatora), więc moc źródła
  przez niego nie płynęła, a kontrola O-53 porównywała ją z jego mocą. Transformatory
  `TR_BLOCK_*` były transformatorami stacji opisanymi jako „Block TR 0.4/15 kV";
* przy niedoborze selektor po cichu brał NAJWIĘKSZĄ opcję transformatora;
* transformator stacji dobierano wyłącznie do źródeł — odbiory nN szablonu (2 × 50 kW)
  przekraczały 63/100 kVA stacji słupowych, prosumenckich i „100 kVA";
* token `_2x1000kva` nie był rozpoznawany (stacja „2×1000 kVA" dostawała 630 kVA),
  `_1mva_`/`_2mva_` szukały podłańcucha `-1mva-` w referencjach kVA (630 i 1600 kVA),
  a `transformer_count` był pokazywany i ignorowany;
* `int(...)` w podglądzie i zastosowaniu obcinał 2,7 → 2, a tekst dawał błąd 500.

ILOCZYN CECH (KLASA NIE INSTANCJA):
* {każdy z 71 szablonów} × {parametry domyślne} → brak odmowy, transformator stacji
  pokrywa odbiory i źródła nN × liczba transformatorów, każdy tor DER-SN ma TR blokowy
  o mocy ≥ moc wymagana jednostki (bezpiecznik nie wyzwala się dla żadnego szablonu);
* {każdy szablon z DER-SN} × {każda technologia} × {każda pozycja katalogu opcji} → tor
  kompletny (żadna opcja szablonu nie jest widmem);
* {droga wyboru: token, opcja domyślna, najmniejsza wystarczająca, wskazanie projektanta,
  profil producenta} × {pokrywa / nie pokrywa} → wybór albo odmowa nazwana;
* {parametr: sn_bays_count, nn_feeders_count, transformer_count, nn_load_default_kw,
  branch_length_m} × {ułamek, tekst, logiczna, NaN, nieskończoność, poza zakresem}.
"""

from __future__ import annotations

import math

import pytest
from application.station_templates import get_template, list_templates
from application.station_templates.apply import (
    TemplateApplyError,
    _resolve_transformer_ref_for_template,
    dlugosc_odgalezienia_m,
    rozstrzygnij_parametry_szablonu,
)
from application.station_templates.schema import (
    WARIANT_TORU_DER_SN,
    JednostkaDer,
    NiedoborTransformatoraStacjiError,
    _moc_katalogowa_transformatora_kva,
    _moc_wymagana_jednostki_der_mva,
    dobor_toru_jednostki_der_sn,
    moc_z_tokenu_identyfikatora_kva,
    rozstrzygnij_transformator_stacji,
    transformer_voltages_kv,
    wymagania_transformatora_stacji,
)

_WSZYSTKIE = tuple(list_templates())
_Z_TOREM_SN = tuple(
    t
    for t in _WSZYSTKIE
    if any(s.connection_variant_options[0] == WARIANT_TORU_DER_SN for s in t.schema.der_options)
)


def test_iloczyn_nie_jest_pusty() -> None:
    # Pomiar 2026-10-15 po przeprojektowaniu składów: 71 szablonów (2 wiatrowe wycofane,
    # `wiatrowe.SZABLONY_WIATROWE_WYCOFANE`), 17 z jednostkami po stronie SN.
    assert len(_WSZYSTKIE) == 71
    assert len(_Z_TOREM_SN) == 17
    assert len(_Z_TOREM_SN) >= 1


@pytest.mark.parametrize("template", _WSZYSTKIE, ids=lambda t: t.id)
def test_zaden_szablon_nie_wyzwala_bezpiecznika_niedoboru(template) -> None:
    parametry = rozstrzygnij_parametry_szablonu(template, {}, None)
    if parametry.transformer_ref is not None:
        moc_kva = _moc_katalogowa_transformatora_kva(parametry.transformer_ref)
        assert moc_kva is not None
        wymagania = wymagania_transformatora_stacji(template)
        assert moc_kva * parametry.transformer_count + 1e-6 >= wymagania.wymagana_kva
    for jednostka, tor in zip(parametry.sklad_der, parametry.tory_der_sn, strict=True):
        po_stronie_sn = jednostka.spec.connection_variant_options[0] == WARIANT_TORU_DER_SN
        assert (tor is not None) == po_stronie_sn
        if tor is None:
            continue
        wymagana = _moc_wymagana_jednostki_der_mva(
            jednostka.kind, jednostka.catalog_ref, jednostka.p_mw_each
        )
        assert wymagana is not None and tor.transformator_sn_mva + 1e-9 >= wymagana
        # Transformator blokowy łączy napięcie falownika z napięciem SN stacji — nie jest
        # transformatorem 15/0,4 kV stacji.
        gn, dn = transformer_voltages_kv(tor.transformator_ref)
        assert dn == pytest.approx(tor.napiecie_falownika_kv)
        assert gn == pytest.approx(transformer_voltages_kv(parametry.transformer_ref)[0])
        assert tor.transformator_ref != parametry.transformer_ref


_OPCJE_SN = tuple(
    pytest.param(t, spec, opcja.catalog_ref, id=f"{t.id}-{spec.kind}-{opcja.catalog_ref}")
    for t in _Z_TOREM_SN
    for spec in t.schema.der_options
    if spec.connection_variant_options[0] == WARIANT_TORU_DER_SN
    for opcja in spec.catalog_options
)


@pytest.mark.parametrize(("template", "spec", "catalog_ref"), _OPCJE_SN)
def test_kazda_opcja_jednostki_sn_ma_kompletny_tor(template, spec, catalog_ref) -> None:
    # Moc jednostki = P_max pozycji (nastawa pełna); tor musi istnieć w katalogu.
    from domain.generator_validation import moc_czynna_jednostki_mw
    from enm.domain_operations_v2 import tabliczka_zrodla_przeksztaltnikowego

    tabliczka = tabliczka_zrodla_przeksztaltnikowego(spec.kind, catalog_ref)
    assert tabliczka is not None, f"pozycja {catalog_ref} nie ma tabliczki w katalogu"
    moc = moc_czynna_jednostki_mw(spec.kind, tabliczka)
    assert moc is not None
    napiecie_sn = transformer_voltages_kv(rozstrzygnij_transformator_stacji(template).catalog_ref)[
        0
    ]
    tor = dobor_toru_jednostki_der_sn(JednostkaDer(spec, moc, catalog_ref), napiecie_sn)
    assert tor.transformator_sn_mva > 0
    assert tor.kabel_ref and tor.aparat_ref


def test_pozycja_15kv_wskazana_przez_projektanta_to_odmowa_doboru_tr() -> None:
    # Bezpiecznik danych projektanta: pozycja „15 kV" nie ma transformatora blokowego
    # (strona nN = 15 kV) — odmowa nazwana kodem kroku doboru, nie ciche przyłączenie
    # do szyny SN stacji.
    template = get_template("tpl_hybrid_pv0p99_bess1")
    assert template is not None
    with pytest.raises(TemplateApplyError) as exc:
        rozstrzygnij_parametry_szablonu(template, {"der_BESS_ref": "conv-bess-2mw-4mwh-15kv"}, None)
    assert exc.value.code == "converter.der_sn.dobor_tr_brak_kandydata"


@pytest.mark.parametrize(
    ("template_id", "oczekiwana_kva"),
    [
        ("tpl_sn_nn_630kva", 630),
        ("tpl_zksn_6pole_2x630kva", 630),
        ("tpl_zksn_8pole_2x1000kva_coupler", 1000),
        ("tpl_przemyslowa_1mva_4odplywy", 1000),
        ("tpl_przemyslowa_2mva_silnik", 2000),
        ("tpl_gpz_110_15_2x16mva_h5", 16000),
        ("tpl_slupowa_50kva", 63),
        ("tpl_kompensacja_0v6mvar_15kv", None),
        # Token mocy DER (MW) w identyfikatorze nie jest mocą transformatora stacji.
        ("tpl_wiatr_2mw", None),
        ("tpl_farma_pv_2p2mw", None),
        ("tpl_bess_5mw_10mwh_fcr_n", None),
    ],
)
def test_token_identyfikatora_to_moc_transformatora(template_id, oczekiwana_kva) -> None:
    assert moc_z_tokenu_identyfikatora_kva(template_id) == oczekiwana_kva
    template = get_template(template_id)
    assert template is not None
    if oczekiwana_kva is not None:
        wybor = rozstrzygnij_transformator_stacji(template)
        assert wybor is not None
        assert _moc_katalogowa_transformatora_kva(wybor.catalog_ref) == oczekiwana_kva


@pytest.mark.parametrize(
    "template", [t for t in _WSZYSTKIE if moc_z_tokenu_identyfikatora_kva(t.id)], ids=lambda t: t.id
)
def test_kazdy_szablon_z_tokenem_materializuje_obiecana_moc(template) -> None:
    wybor = rozstrzygnij_transformator_stacji(template)
    assert wybor is not None
    assert _moc_katalogowa_transformatora_kva(wybor.catalog_ref) == moc_z_tokenu_identyfikatora_kva(
        template.id
    )


def test_bez_tokenu_najmniejsza_wystarczajaca_albo_odmowa() -> None:
    template = get_template("tpl_pv_prosument_10kw")  # bez tokenu mocy TR, opcje 63–400 kVA
    assert template is not None
    # 4 odpływy × 50 kW / 0,95 = 211 kVA → 250 kVA (nie domyślne 63, nie największe 400).
    wybor = rozstrzygnij_transformator_stacji(template, {"nn_feeders_count": 4})
    assert wybor is not None and wybor.catalog_ref == "tr-sn-nn-15-04-250kva-dyn11"
    # 4 × 200 kW = 842 kVA > 400 kVA (największa opcja) — odmowa, nie cichy wybór 400 kVA.
    with pytest.raises(NiedoborTransformatoraStacjiError) as exc:
        rozstrzygnij_transformator_stacji(
            template, {"nn_feeders_count": 4, "nn_load_default_kw": 200.0}
        )
    assert exc.value.kod == "template.transformer_capacity_insufficient"
    assert "842 kVA" in str(exc.value)


def test_token_nie_pokrywajacy_danych_projektanta_to_odmowa() -> None:
    template = get_template("tpl_sn_nn_100kva")
    assert template is not None
    with pytest.raises(NiedoborTransformatoraStacjiError):
        rozstrzygnij_transformator_stacji(template, {"nn_load_default_kw": 100.0})


def test_liczba_transformatorow_mnozy_moc_i_trafia_do_wyboru() -> None:
    template = get_template("tpl_zksn_6pole_2x630kva")
    assert template is not None
    # 8 × 100 kW / 0,95 = 842 kVA: 2 × 630 kVA pokrywa, 1 × 630 kVA już nie.
    nadpisanie = {"nn_load_default_kw": 100.0}
    assert rozstrzygnij_transformator_stacji(template, nadpisanie) is not None
    with pytest.raises(NiedoborTransformatoraStacjiError):
        rozstrzygnij_transformator_stacji(template, {**nadpisanie, "transformer_count": 1})


def test_wskazanie_projektanta_i_profil_tym_samym_predykatem() -> None:
    template = get_template("tpl_sn_nn_630kva")
    assert template is not None
    with pytest.raises(NiedoborTransformatoraStacjiError):
        _resolve_transformer_ref_for_template(
            template,
            overrides={"transformer_ref": "tr-sn-nn-15-04-100kva-dyn11"},
            catalog_profile=None,
        )
    # Profil producenta bez dopasowania NIE zastępuje tokenu opcją domyślną (dawniej
    # stacja „100 kVA" z profilem dostawała 63 kVA).
    maly = get_template("tpl_sn_nn_100kva")
    assert maly is not None
    assert (
        _resolve_transformer_ref_for_template(maly, overrides={}, catalog_profile="ZPUE")
        == "tr-sn-nn-15-04-100kva-dyn11"
    )


_ZLE_CALKOWITE = (2.5, "dwa", True, float("nan"), float("inf"), None, 99, -1)


@pytest.mark.parametrize("klucz", ["sn_bays_count", "nn_feeders_count", "transformer_count"])
@pytest.mark.parametrize("wartosc", _ZLE_CALKOWITE, ids=repr)
def test_parametr_calkowity_bez_cichego_obciecia(klucz, wartosc) -> None:
    template = get_template("tpl_sn_nn_630kva")
    assert template is not None
    with pytest.raises(TemplateApplyError) as exc:
        rozstrzygnij_parametry_szablonu(template, {klucz: wartosc}, None)
    assert exc.value.code == "template.param_invalid"


def test_parametr_calkowity_tekst_cyfr_i_liczba_calkowita_przyjete() -> None:
    template = get_template("tpl_sn_nn_630kva")
    assert template is not None
    parametry = rozstrzygnij_parametry_szablonu(
        template, {"nn_feeders_count": "3", "sn_bays_count": 3.0}, None
    )
    assert (parametry.nn_feeders_count, parametry.sn_bays_count) == (3, 3)


@pytest.mark.parametrize(
    "wartosc", ["dużo", float("nan"), math.inf, -1.0, 5000.0, True, None], ids=repr
)
def test_obciazenie_odplywu_bez_cichej_konwersji(wartosc) -> None:
    template = get_template("tpl_sn_nn_630kva")
    assert template is not None
    with pytest.raises(TemplateApplyError) as exc:
        rozstrzygnij_parametry_szablonu(template, {"nn_load_default_kw": wartosc}, None)
    assert exc.value.code == "template.param_invalid"


@pytest.mark.parametrize(
    ("wartosc", "kod"),
    [
        (12.5, "template.param_invalid"),
        ("daleko", "template.param_invalid"),
        (True, "template.param_invalid"),
        (0, "template.branch_length_invalid"),
        (-5, "template.branch_length_invalid"),
    ],
    ids=repr,
)
def test_dlugosc_odgalezienia_bez_cichego_obciecia(wartosc, kod) -> None:
    with pytest.raises(TemplateApplyError) as exc:
        dlugosc_odgalezienia_m({"branch_length_m": wartosc})
    assert exc.value.code == kod
    # Ta sama odmowa z funkcji rozstrzygającej parametry — przed blokadą i modelem.
    template = get_template("tpl_sn_nn_1000kva")
    assert template is not None
    with pytest.raises(TemplateApplyError) as exc2:
        rozstrzygnij_parametry_szablonu(template, {"branch_length_m": wartosc}, None)
    assert exc2.value.code == kod
    assert dlugosc_odgalezienia_m({"branch_length_m": 250}) == 250
