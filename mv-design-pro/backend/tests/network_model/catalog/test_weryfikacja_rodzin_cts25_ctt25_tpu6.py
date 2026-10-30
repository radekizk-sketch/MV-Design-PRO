"""Źródła producentów i granice rodzin CT: nie wytwarzać fikcyjnego SKU."""
from network_model.catalog.mv_instrument_manufacturer_families_pl import (
    get_all_instrument_transformer_manufacturer_families_pl,
)


def _rodzina(nazwa: str, producent: str) -> dict:
    return next(x for x in get_all_instrument_transformer_manufacturer_families_pl()
                if x["model_family"] == nazwa and x["manufacturer"] == producent)


def test_kpb_cts25_karta_2203_4_rdzenie_i_pelny_zakres() -> None:
    f = _rodzina("CTS 25", "KPB Intra")
    assert f["um_kv"] == 25
    assert (f["primary_a_min"], f["primary_a_max"]) == (5, 3200)
    assert f["secondary_current_options_a"] == [1, 5]
    assert f["core_count_max"] == 4
    assert f["ith_range_ka"] == [2, 80]
    assert f["burden_options_va"][0] == 2.5
    assert f["fs_options"] == [5, 10]
    assert f["alf_options"] == [5, 10, 15, 20]
    assert f["primary_reconnection_supported"] is True
    assert f["secondary_reconnection_supported"] is True
    assert "k_kat_cts_25" in f["source_reference"]
    assert "secondary_cores" not in f
    assert "ith_ka_1s" not in f
    assert "rct_ohm" not in f


def test_kpb_ctt25_przepustowy_tylko_wtorne_odczepy() -> None:
    f = _rodzina("CTT 25", "KPB Intra")
    assert f["mounting"] == "INDOOR_BUSHING"
    assert (f["primary_a_min"], f["primary_a_max"]) == (100, 2500)
    assert f["secondary_current_options_a"] == [1, 5]
    assert f["core_count_max"] == 3
    assert f["primary_reconnection_supported"] is False
    assert f["secondary_reconnection_supported"] is True
    assert f["fs_options"] == [5, 10]
    assert f["alf_options"] == [5, 10, 15, 20]
    assert f.get("ith_range_ka") is None  # producent nie podał na stronie


def test_abb_tpu6_rodzina_z_dtr_bez_fikcyjnych_zaczepow() -> None:
    f = _rodzina("TPU 6x.xx", "ABB")
    assert f["um_options_kv"] == [24, 25]
    assert f["secondary_current_options_a"] == [1, 5]
    assert (f["primary_a_min"], f["primary_a_max"]) == (10, 3200)
    assert f["core_count_max"] == 6
    assert f["number_of_secondaries_max_depends_on_design"] is True
    assert f["ith_range_ka"] == [2, 100]
    assert f["primary_reconnection_supported"] is True
    assert f["secondary_reconnection_supported"] is True
    assert f["record_kind"] == "MANUFACTURER_FAMILY_NOT_SKU"
    assert "1VLC000502" in f["source_reference"]
    assert "primary_taps_a" not in f
    assert "ratio_primary_a" not in f
    assert "secondary_cores" not in f
