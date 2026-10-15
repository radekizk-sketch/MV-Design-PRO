"""Pokrycie przekształtników nN transformatorami blokowymi SN/nN z katalogu.

Intencja (od 40a321beb): każdy przekształtnik nN ma w katalogu transformator SN/nN 15 kV
i 20 kV o napięciu strony dolnej równym napięciu przekształtnika. Karta
KATALOG-KOMPLETNY-PROWENIENCJA (2026-10-15) zastąpiła szacunek transformatorów blokowych
pułapami Tier 2 rozporządzenia UE 548/2014 (tab. I.2, strona dolna do 1,1 kV, moce do
3150 kVA), więc pokrycie liczy się teraz z mocą, a pozycje bez źródła są przypięte jako
ZABLOKOWANE DANYMI (nie znikają po cichu z inwariantu):

* strona dolna SN (3,15 / 6,0 / 6,3 kV) — brak źródła u_k i i0 transformatora SN/SN;
* moc pozorna przekształtnika > 3150 kVA — powyżej tej mocy rozporządzenie podaje tylko
  minimalny PEI (tab. I.5), z którego P0 i Pk osobno nie wynikają.
"""

from network_model.catalog.repository import get_default_mv_catalog

#: Granica tabel I.1/I.2 rozporządzenia 548/2014 dla drugiego uzwojenia (Um ≤ 1,1 kV).
_UM_NN_TIER2_KV = 1.1
#: Największa moc pozycji normatywnej (tabele I.1/I.2 kończą się na 3150 kVA).
_MOC_MAKS_NORMATYWNA_MVA = 3.15
#: Napięcia strony dolnej SN przekształtników referencyjnych — zablokowane danymi.
_NAPIECIA_SN_ZABLOKOWANE_KV = {3.15, 6.0, 6.3}


def _katalog() -> tuple[list[dict], list[dict]]:
    catalog = get_default_mv_catalog()
    transformatory = [item.to_dict() for item in catalog.list_transformer_types()]
    przeksztaltniki = [
        item.to_dict()
        for item in catalog.list_converter_types()
        if item.to_dict()["kind"] in {"PV", "BESS", "WIND"} and item.to_dict()["un_kv"] <= 6.3
    ]
    return transformatory, przeksztaltniki


def _sn(przeksztaltnik: dict) -> float:
    return float(przeksztaltnik.get("sn_mva") or przeksztaltnik["pmax_mw"])


def test_nn_converter_voltages_have_matching_sn_nn_transformers() -> None:
    transformatory, przeksztaltniki = _katalog()
    pokryte = [
        p
        for p in przeksztaltniki
        if p["un_kv"] <= _UM_NN_TIER2_KV and _sn(p) <= _MOC_MAKS_NORMATYWNA_MVA + 1e-9
    ]
    assert pokryte
    for p in pokryte:
        for sn_voltage_kv in (15.0, 20.0):
            assert any(
                abs(t["voltage_hv_kv"] - sn_voltage_kv) < 1e-6
                and abs(t["voltage_lv_kv"] - p["un_kv"]) < 1e-6
                and t["rated_power_mva"] >= _sn(p) - 1e-9
                for t in transformatory
            ), f"{p['id']}: brak TR {sn_voltage_kv:g}/{p['un_kv']:g} kV o S_n >= {_sn(p):g} MVA"


def test_blocked_converter_voltages_have_no_unsourced_transformer() -> None:
    """Pin blokady danymi: strona dolna SN istnieje tylko po stronie przekształtników."""
    transformatory, przeksztaltniki = _katalog()
    napiecia_sn = {p["un_kv"] for p in przeksztaltniki if p["un_kv"] > _UM_NN_TIER2_KV}
    assert napiecia_sn == _NAPIECIA_SN_ZABLOKOWANE_KV
    for napiecie in napiecia_sn:
        assert not any(
            abs(t["voltage_lv_kv"] - napiecie) < 1e-6 for t in transformatory
        ), f"TR strony dolnej {napiecie:g} kV bez źródła u_k/i0"
    assert max(t["rated_power_mva"] for t in transformatory if t["voltage_lv_kv"] <= 1.1) == (
        _MOC_MAKS_NORMATYWNA_MVA
    )


def test_each_converter_family_has_complete_nn_voltage_range() -> None:
    catalog = get_default_mv_catalog()
    converter_types = [item.to_dict() for item in catalog.list_converter_types()]
    expected_voltages = {0.4, 0.5, 0.69, 0.8, 1.0, 3.15, 6.0, 6.3}

    for kind in ("PV", "BESS", "WIND"):
        voltages = {
            item["un_kv"]
            for item in converter_types
            if item["kind"] == kind and item["un_kv"] <= 6.3
        }
        assert expected_voltages <= voltages
