"""Skład DER szablonów stacji wskazuje pozycje katalogu ze źródłem (decyzja właściciela 2026-10-15).

POWÓD (pomiar 2026-10-15 na drzewie scalonym z kartą katalogu z proweniencją): szablony
oferowały wyłącznie modele referencyjne (falowniki PV 0,5/1/2 MW, „PV 50 kW (μPV)”), a część
pozycji nie istniała w katalogu wcale (PV 5/10/30 kW, turbina 1 MW). Moc jednostki szablonu
nie była mocą karty (0,5 MW nastawione na falowniku 0,5 MW referencyjnym, 50 kW na pozycji
50 kW), typ modułu NC RfG był wpisany ręcznie i przeczył klasyfikacji (farmy ≤ 5 MW opisane
jako C/D), a dwa szablony wiatrowe nie dały się zbudować z katalogu (turbina 3 MW bez
transformatora blokowego, turbina 1 MW bez pozycji).

ILOCZYN CECH (KLASA NIE INSTANCJA):
* {każdy szablon z DER} × {każdy rodzaj} × {każda opcja katalogu} → pozycja dopuszczona do
  doboru szablonu (`dopuszczona_do_doboru_szablonu`, JEDNO źródło prawdy z proweniencją pól)
  ALBO rodzaj jest jawnym wyjątkiem `WYJATKI_POZYCJI_BEZ_KARTY` z powodem;
* {rodzaj wyjątku} × {cały katalog przekształtników} → wyjątek jest prawdziwy (zero pozycji
  dopuszczonych tego rodzaju) i rodzaj spoza wyjątków ma choć jedną pozycję dopuszczoną —
  dopisanie karty do katalogu zapala test, zamiast zostawić martwy wyjątek;
* {każdy szablon z DER} × {każdy rodzaj} → moc domyślna jednostki = P_max karty pozycji,
  którą dobór wybierze (bez cichego niedowymiarowania);
* {każdy szablon z DER} → typ modułu NC RfG z wyroczni ręcznej (progi A/B/C) = pole szablonu
  = znacznik `NC_RfG_<typ>`;
* {każdy szablon wycofany} → nieobecny w katalogu szablonów, powód prawdziwy (odmowa toru
  DER-SN z nazwanym kodem; brak pozycji WIND poniżej 2 MW).
"""

from __future__ import annotations

import pytest
from application.station_templates import get_template, list_templates
from application.station_templates._choices import WYJATKI_POZYCJI_BEZ_KARTY
from application.station_templates.apply import TemplateApplyError, rozstrzygnij_parametry_szablonu
from application.station_templates.schema import _der_catalog_for_power
from application.station_templates.templates.wiatrowe import SZABLONY_WIATROWE_WYCOFANE
from domain.generator_validation import moc_czynna_jednostki_mw
from enm.domain_operations_v2 import tabliczka_zrodla_przeksztaltnikowego
from network_model.catalog.mv_converter_catalog import dopuszczona_do_doboru_szablonu
from network_model.catalog.repository import get_default_mv_catalog

_KATALOG = get_default_mv_catalog()
_SZABLONY_Z_DER = tuple(t for t in list_templates() if t.schema.der_options)

#: Technologia szablonu → rodzaj pozycji katalogu przekształtników (`ConverterType.kind`).
_RODZAJ_POZYCJI = {"PV": "PV", "BESS": "BESS", "FW": "WIND"}

_OPCJE = tuple(
    pytest.param(t, spec, opcja, id=f"{t.id}-{spec.kind}-{opcja.catalog_ref}")
    for t in _SZABLONY_Z_DER
    for spec in t.schema.der_options
    for opcja in spec.catalog_options
)

_RODZAJE = tuple(
    pytest.param(t, spec, id=f"{t.id}-{spec.kind}")
    for t in _SZABLONY_Z_DER
    for spec in t.schema.der_options
)


def _dopuszczona(catalog_ref: str) -> bool:
    pozycja = _KATALOG.get_converter_type(catalog_ref)
    assert pozycja is not None, f"pozycja {catalog_ref} nie istnieje w katalogu"
    return dopuszczona_do_doboru_szablonu({"verification_status": pozycja.verification_status})


def _rodzaje_z_pozycja_dopuszczona() -> set[str]:
    return {
        pozycja.kind.value
        for pozycja in _KATALOG.list_converter_types()
        if dopuszczona_do_doboru_szablonu({"verification_status": pozycja.verification_status})
    }


def test_iloczyn_nie_jest_pusty() -> None:
    # Pomiar 2026-10-15: 24 szablony z DER, 29 par (szablon, rodzaj).
    assert len(_SZABLONY_Z_DER) == 24
    assert len(_RODZAJE) == 29


@pytest.mark.parametrize(("szablon", "spec", "opcja"), _OPCJE)
def test_opcja_szablonu_ma_karte_albo_rodzaj_jest_jawnym_wyjatkiem(szablon, spec, opcja) -> None:
    if spec.kind in WYJATKI_POZYCJI_BEZ_KARTY:
        return
    assert _dopuszczona(opcja.catalog_ref), (
        f"{szablon.id}: opcja {opcja.catalog_ref} rodzaju {spec.kind} nie ma karty producenta "
        "(status inny niż ZWERYFIKOWANY), a rodzaj nie jest wyjątkiem z powodem"
    )


def test_wyjatki_sa_prawdziwe_i_zamkniete() -> None:
    dopuszczone_rodzaje = _rodzaje_z_pozycja_dopuszczona()
    rodzaje_szablonow = {spec.kind for t in _SZABLONY_Z_DER for spec in t.schema.der_options}
    bez_karty = {r for r in rodzaje_szablonow if _RODZAJ_POZYCJI[r] not in dopuszczone_rodzaje}
    # Wyjątek dokładnie tam, gdzie katalog nie ma żadnej pozycji z kartą — w obie strony.
    assert set(WYJATKI_POZYCJI_BEZ_KARTY) == bez_karty == {"BESS", "FW"}
    for rodzaj, powod in WYJATKI_POZYCJI_BEZ_KARTY.items():
        assert "ZWERYFIKOWANY" in powod, rodzaj
        assert len(powod) > 80, rodzaj


@pytest.mark.parametrize(("szablon", "spec"), _RODZAJE)
def test_moc_domyslna_jednostki_to_moc_karty_pozycji(szablon, spec) -> None:
    ref = _der_catalog_for_power(spec, spec.default_p_mw_each)
    tabliczka = tabliczka_zrodla_przeksztaltnikowego(spec.kind, ref)
    assert tabliczka is not None, ref
    p_karty = moc_czynna_jednostki_mw(spec.kind, tabliczka)
    assert p_karty == pytest.approx(spec.default_p_mw_each, abs=1e-9), (
        f"{szablon.id}: jednostka {spec.kind} nastawiona na {spec.default_p_mw_each} MW, "
        f"a pozycja {ref} ma P_max {p_karty} MW — ciche niedowymiarowanie"
    )
    assert ref in {opcja.catalog_ref for opcja in spec.catalog_options}


#: Wyrocznia ręczna typu modułu NC RfG (progi PL: A < 200 kW ≤ B < 10 MW ≤ C < 50 MW,
#: napięcie przyłączenia < 110 kV) — suma liczba × moc jednostki z nazwy szablonu.
_TYP_NC_RFG: dict[str, str] = {
    "tpl_bess_500kw_1mwh": "B",
    "tpl_bess_1mw_2mwh": "B",
    "tpl_bess_2mw_4mwh": "B",
    "tpl_bess_5mw_10mwh_fcr_n": "B",
    "tpl_bess_5mw_10mwh_afrr": "B",
    "tpl_farma_pv_0p66mw": "B",
    "tpl_farma_pv_0p99mw": "B",
    "tpl_farma_pv_2p2mw": "B",
    "tpl_farma_pv_4p4mw": "B",
    "tpl_farma_pv_4p95mw": "B",
    "tpl_hybrid_pv0p66_bess0p5": "B",
    "tpl_hybrid_pv0p99_bess1": "B",
    "tpl_hybrid_pv2p2_bess1": "B",
    "tpl_hybrid_pv4p4_bess2": "B",
    "tpl_hybrid_pv4p95_bess3": "B",
    "tpl_pv_prosument_8kw": "A",
    "tpl_pv_prosument_10kw": "A",
    "tpl_pv_prosument_30kw": "A",
    "tpl_pv_prosument_50kw": "A",
    "tpl_pv_prosument_100kw": "A",
    "tpl_pv_prosument_250kw": "B",
    "tpl_slupowa_400kva_prosument": "A",
    "tpl_wiatr_2mw": "B",
    "tpl_wiatr_farma_5x2mw": "C",
}


@pytest.mark.parametrize("szablon", _SZABLONY_Z_DER, ids=lambda t: t.id)
def test_typ_modulu_nc_rfg_wynika_ze_skladu(szablon) -> None:
    assert szablon.nc_rfg_type == _TYP_NC_RFG[szablon.id]
    assert f"NC_RfG_{szablon.nc_rfg_type}" in szablon.tags
    assert [tag for tag in szablon.tags if tag.startswith("NC_RfG_")] == [
        f"NC_RfG_{szablon.nc_rfg_type}"
    ]


def test_wyrocznia_typu_obejmuje_kazdy_szablon_z_der() -> None:
    assert set(_TYP_NC_RFG) == {t.id for t in _SZABLONY_Z_DER}


def test_szablony_wycofane_nieobecne_z_powodem() -> None:
    assert set(SZABLONY_WIATROWE_WYCOFANE) == {"tpl_wiatr_1mw_pojedyncza", "tpl_wiatr_3mw"}
    for tpl_id, powod in SZABLONY_WIATROWE_WYCOFANE.items():
        assert get_template(tpl_id) is None, tpl_id
        assert len(powod) > 60, tpl_id


def test_powod_wycofania_turbiny_3mw_to_odmowa_toru_der_sn() -> None:
    # Turbina 3 MW (S_n 3,3 MVA) przez szablon turbiny wiatrowej — tor DER-SN odmawia,
    # bo katalog nie ma transformatora blokowego powyżej 3150 kVA.
    szablon = get_template("tpl_wiatr_2mw")
    assert szablon is not None
    with pytest.raises(TemplateApplyError) as exc:
        rozstrzygnij_parametry_szablonu(
            szablon, {"der_FW_ref": "conv-wind-nn-3mw-0p69kv", "der_FW_p_mw_each": 3.0}, None
        )
    assert exc.value.code == "converter.der_sn.dobor_tr_brak_kandydata"
    assert exc.value.code in SZABLONY_WIATROWE_WYCOFANE["tpl_wiatr_3mw"]


def test_powod_wycofania_turbiny_1mw_to_brak_pozycji_ponizej_2mw() -> None:
    moce_wind = [p.pmax_mw for p in _KATALOG.list_converter_types() if p.kind.value == "WIND"]
    assert moce_wind
    assert min(moce_wind) == pytest.approx(2.0)
    assert "poniżej 2 MW" in SZABLONY_WIATROWE_WYCOFANE["tpl_wiatr_1mw_pojedyncza"]
