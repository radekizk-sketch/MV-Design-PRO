"""Audyt katalogu wykrywa braki, ale nie fabrykuje danych i nie blokuje UI."""
from __future__ import annotations

from types import SimpleNamespace

from network_model.catalog.audyt_luk_technicznych import (
    ocena_pozycji,
    zbuduj_raport_luk_technicznych,
)
from network_model.catalog.repository import get_default_mv_catalog


def _typ(**params: object) -> SimpleNamespace:
    return SimpleNamespace(id="test-1", catalog_status="REFERENCYJNY_V1", **params)


def _pola(rodzina: str, obj: object) -> set[str]:
    return {x.pole for x in ocena_pozycji(rodzina, obj)}


def test_ct_200_5_bez_przelaczania_i_jednym_rdzeniem() -> None:
    ct = _typ(ratio_primary_a=200.0, ratio_secondary_a=5.0,
              accuracy_class="0.2S", core_count=1, burden_va=5.0,
              ith_ka_1s=None, idyn_ka_peak=None, rct_ohm=None,
              primary_taps_a=None)
    luki = _pola("ct_types", ct)
    assert "primary_taps_a" not in luki
    assert "secondary_cores" not in luki
    assert "rct_ohm" not in luki  # nie wymagamy nasycenia EAZ od pomiarowego rdzenia
    assert {"ith_ka_1s", "idyn_ka_peak"} <= luki


def test_ct_wielordzeniowy_rct_potrzebne_tylko_do_zaawansowanej_eaz() -> None:
    ct = _typ(ratio_primary_a=400, ratio_secondary_a=1,
              accuracy_class="0.2S", core_count=2, burden_va=5,
              ith_ka_1s=25, idyn_ka_peak=62.5,
              rct_ohm=None,
              secondary_cores=(
                  {"role": "METERING", "accuracy_class": "0.2S"},
                  {"role": "PROTECTION", "accuracy_class": "5P20"},
              ))
    luki = ocena_pozycji("ct_types", ct)
    assert {x.pole for x in luki} == {"rct_ohm"}
    assert luki[0].analiza == "szczegółowa ocena nasycenia rdzenia EAZ"


def test_kabel_r0_x0_zalezne_od_konfiguracji_ekranow() -> None:
    kabel = _typ(r_ohm_per_km=0.125, x_ohm_per_km=0.079,
                  c_nf_per_km=160, rated_current_a=385,
                  voltage_rating_kv=18, cross_section_mm2=240,
                  max_temperature_c=90, short_circuit_temperature_c=250,
                  ith_1s_a=18000, return_conductor_cross_section_mm2=None,
                  r0_ohm_per_km=None, x0_ohm_per_km=None,
                  z0_reference_bonding=None)
    assert {"r0_ohm_per_km", "x0_ohm_per_km"}.isdisjoint(
        _pola("cable_types", kabel))
    kabel.z0_reference_bonding = "both_ends"
    assert {"r0_ohm_per_km", "x0_ohm_per_km"} <= _pola("cable_types", kabel)


def test_nie_wymagamy_zdolnosci_wylaczalnej_od_odlacznika() -> None:
    aparat = _typ(equipment_kind="DISCONNECTOR", u_m_kv=None,
                   un_kv=17.5, in_a=630, icw_ka=20, i_cu_ka=None)
    luki = _pola("switch_equipment_types", aparat)
    assert "i_cu_ka" not in luki
    assert "u_m_kv" in luki


def test_warunki_gpzu_sa_danymi_projektu() -> None:
    dane = _typ(voltage_rating_kv=15.0, sk3_mva=None, ik3_ka=None,
                rx_ratio=None)
    luki = ocena_pozycji("source_system_types", dane)
    assert {x.pole for x in luki} == {"sk3_mva", "ik3_ka", "rx_ratio"}
    assert all(x.rodzaj == "DANE_PROJEKTU" for x in luki)


def test_testowe_nie_zanieczyszczaja_pomiaru() -> None:
    assert ocena_pozycji("ct_types", _typ(ratio_primary_a=None,
                                         ratio_secondary_a=None,
                                         accuracy_class=None,
                                         ith_ka_1s=None,
                                         idyn_ka_peak=None,
                                         burden_va=None,
                                         core_count=2,
                                         secondary_cores=None,
                                         rct_ohm=None,
                                         verification_status="REFERENCYJNY"))
    # Referencyjne wpisy pozostają w raporcie, a benchmarki nie.
    typ = SimpleNamespace(id="bench_any", catalog_status="TESTOWY")
    assert ocena_pozycji("ct_types", typ) == []


def test_raport_rzeczywistego_repo_nie_uznaje_etykiet_za_braki() -> None:
    repo = get_default_mv_catalog()
    raport = zbuduj_raport_luk_technicznych(repo)
    assert raport["liczba_pozycji"] >= 8000
    assert raport["liczba_brakow_technicznych"] >= 78
    assert raport["braki_szablonow"] >= 78
    assert raport["liczba_brakow_technicznych"] == (
        raport["braki_techniczne_poza_szablonami"] + raport["braki_szablonow"]
    )
    assert any(x["rodzaj_pozycji"] == "SZABLON_PROJEKTOWY"
               for x in raport["macierz"])
    assert raport["liczba_pustych_pol"] == (
        raport["liczba_brakow_technicznych"] + raport["liczba_danych_projektu"]
    )
    assert raport["liczba_zerowych_do_weryfikacji"] >= 0
    assert raport["macierz"] == sorted(
        raport["macierz"],
        key=lambda x: (x["rodzina"], x["rodzaj_pozycji"], x["pole"],
                       x["rodzaj"], x["analiza"])
    )
    assert not any(x["pole"] == "primary_taps_a" for x in raport["pozycje"])
    assert "136" in raport["uwaga"]  # etykiety UI, nie brak 136 parametrów


def test_podejrzane_zero_to_osobny_przeglad_a_nie_pusta_wartosc() -> None:
    kabel = _typ(r_ohm_per_km=0.0, x_ohm_per_km=0.08,
                  c_nf_per_km=160, rated_current_a=385,
                  voltage_rating_kv=18, cross_section_mm2=240,
                  max_temperature_c=90, short_circuit_temperature_c=250,
                  ith_1s_a=18000, return_conductor_cross_section_mm2=None)
    raport = ocena_pozycji("cable_types", kabel)
    zero = [x for x in raport if x.rodzaj == "ZERO_DO_WERYFIKACJI"]
    assert len(zero) == 1
    assert zero[0].pole == "r_ohm_per_km"


def test_szablon_ct_nie_liczy_sie_jako_karta_producenta() -> None:
    ct = SimpleNamespace(
        id="ct-project-sn-200-1-0p2s-5va-5p20-15va",
        catalog_status="REFERENCYJNY_V1",
        ratio_primary_a=200, ratio_secondary_a=1,
        accuracy_class="0.2S", core_count=2,
        secondary_cores=(
            {"role": "METERING", "accuracy_class": "0.2S"},
            {"role": "PROTECTION", "accuracy_class": "5P20"},
        ),
        ith_ka_1s=None, idyn_ka_peak=None, rct_ohm=None,
    )
    luki = ocena_pozycji("ct_types", ct)
    assert luki
    assert all(x.rodzaj_pozycji == "SZABLON_PROJEKTOWY" for x in luki)
