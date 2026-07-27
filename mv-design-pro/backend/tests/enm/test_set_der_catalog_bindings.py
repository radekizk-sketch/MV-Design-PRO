"""V12K-238: wiązania wytwórcy (DER) mają operację domenową i trafiają do modelu.

POMIAR, KTÓRY TO WYMUSIŁ (V12K-237). Kreator DER woła backend RAZ, przy tworzeniu, i
wysyła wtedy katalog urządzenia, baterii i transformatora blokowego. Katalog
zabezpieczeń, przekładniki CT/VT, dane prądu zwarciowego, model dynamiczny i profile
zgodności są wybierane PÓŹNIEJ, w konfiguratorze — a dla tych wyborów nie istniała ŻADNA
operacja domenowa: `updateDerCatalogs` pisał wyłącznie do store przeglądarki. Sześć osi
gotowości (zabezpieczenia, selektywność, SC1F, SC2FG, FRT, HVRT) opierało więc werdykt na
danych, których model nie zna, które przepadały po odświeżeniu strony i nie wchodziły do
eksportu projektu.

Nazwy kluczy są CELOWO te same, których szuka odczyt ENM na froncie
(`buildDerFromGenerator` czyta je z `materialized_params`/`meta`) — ścieżka powrotna była
gotowa i czekała na dane.
"""

from __future__ import annotations

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader


def _enm_z_wytworca() -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="der-bindings-test", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")
    enm["generators"] = [
        {
            "id": "gen_pv_1",
            "ref_id": "gen_pv_1",
            "name": "Falownik PV",
            "tags": [],
            "meta": {},
            "bus_ref": "bus_nn_1",
            "p_mw": 0.5,
            "gen_type": "pv_inverter",
            "catalog_ref": "pv_inv_huawei_185",
            "materialized_params": {"un_kv": 0.4, "rated_power_ac_kw": 500.0},
        }
    ]
    return enm


def _wykonaj(payload: dict, enm: dict | None = None) -> dict:
    return execute_domain_operation(
        enm_dict=enm if enm is not None else _enm_z_wytworca(),
        op_name="set_der_catalog_bindings",
        payload=payload,
    )


def _params(wynik: dict) -> dict:
    return wynik["snapshot"]["generators"][0]["materialized_params"]


class TestWiazaniaTrafiajaDoModelu:
    def test_wiazania_zabezpieczeniowe_i_modelowe_sa_zapisane(self) -> None:
        wynik = _wykonaj(
            {
                "generator_ref": "gen_pv_1",
                "protection_catalog_ref": "ACME_REX200_v1",
                "ct_catalog_ref": "ct_200_5_5p10_10va_abb",
                "vt_catalog_ref": "vt_10kv_100v_05_abb",
                "fault_current_data_ref": "fc_pv_500",
                "dynamic_model_ref": "dyn_pv_wecc",
            }
        )

        assert wynik.get("error") is None
        params = _params(wynik)
        assert params["protection_catalog_ref"] == "ACME_REX200_v1"
        assert params["ct_catalog_ref"] == "ct_200_5_5p10_10va_abb"
        assert params["vt_catalog_ref"] == "vt_10kv_100v_05_abb"
        assert params["fault_current_data_ref"] == "fc_pv_500"
        assert params["dynamic_model_ref"] == "dyn_pv_wecc"
        # Dane materializacji katalogowej urządzenia zostają nietknięte.
        assert params["un_kv"] == 0.4
        assert params["rated_power_ac_kw"] == 500.0

    def test_profile_zgodnosci_ida_do_podslownika_profiles(self) -> None:
        # Odczyt frontu szuka profili w `materialized_params.profiles` — zapis musi trafić
        # dokładnie tam, inaczej dana istnieje w modelu i nadal nie dociera do reguły.
        wynik = _wykonaj(
            {
                "generator_ref": "gen_pv_1",
                "nc_rfg_profile_ref": "pse",
                "lvrt_curve_ref": "lvrt_pse_b",
                "hvrt_curve_ref": "hvrt_pse_b",
                "pf_curve_ref": "pf_pse_2024",
            }
        )

        assert wynik.get("error") is None
        profile = _params(wynik)["profiles"]
        assert profile == {
            "nc_rfg_profile_ref": "pse",
            "lvrt_curve_ref": "lvrt_pse_b",
            "hvrt_curve_ref": "hvrt_pse_b",
            "pf_curve_ref": "pf_pse_2024",
        }

    def test_wytworca_wskazany_przez_id_a_nie_ref_id(self) -> None:
        enm = _enm_z_wytworca()
        enm["generators"][0]["ref_id"] = "inny_ref"
        wynik = _wykonaj(
            {"generator_ref": "gen_pv_1", "ct_catalog_ref": "ct_150_1_0_5_10va_abb"}, enm
        )

        assert wynik.get("error") is None
        assert _params(wynik)["ct_catalog_ref"] == "ct_150_1_0_5_10va_abb"


class TestZeroFabrykacji:
    def test_klucz_nieobecny_w_payloadzie_nie_dopisuje_niczego(self) -> None:
        # Kontrola kluczowa dla determinizmu: aktualizacja JEDNEGO wiązania nie może
        # wpisać `null` w pozostałe, bo puste pole udające wartość jest gorsze niż brak.
        wynik = _wykonaj({"generator_ref": "gen_pv_1", "ct_catalog_ref": "ct_150_1_0_5_10va_abb"})

        params = _params(wynik)
        assert params["ct_catalog_ref"] == "ct_150_1_0_5_10va_abb"
        for klucz in (
            "protection_catalog_ref",
            "vt_catalog_ref",
            "fault_current_data_ref",
            "dynamic_model_ref",
            "profiles",
        ):
            assert klucz not in params

    def test_jawny_null_USUWA_wiazanie_zamiast_zostawiac_puste_pole(self) -> None:
        enm = _enm_z_wytworca()
        enm["generators"][0]["materialized_params"]["ct_catalog_ref"] = "ct_150_1_0_5_10va_abb"
        wynik = _wykonaj({"generator_ref": "gen_pv_1", "ct_catalog_ref": None}, enm)

        assert wynik.get("error") is None
        # Reguła gotowości musi znów widzieć BRAK DANEJ, nie pustą wartość.
        assert "ct_catalog_ref" not in _params(wynik)

    def test_usuniecie_ostatniego_profilu_kasuje_pusty_podslownik(self) -> None:
        enm = _enm_z_wytworca()
        enm["generators"][0]["materialized_params"]["profiles"] = {"nc_rfg_profile_ref": "enea"}
        wynik = _wykonaj({"generator_ref": "gen_pv_1", "nc_rfg_profile_ref": None}, enm)

        assert wynik.get("error") is None
        assert "profiles" not in _params(wynik)

    def test_payload_bez_zadnego_wiazania_jest_odrzucony(self) -> None:
        # Operacja bez treści nie może „przejść" — cicha zgoda na puste żądanie
        # zostawiłaby wywołującego w przekonaniu, że coś zapisał.
        wynik = _wykonaj({"generator_ref": "gen_pv_1"})

        assert wynik.get("error_code") == "der_bindings.payload_empty"


class TestGranice:
    def test_brak_identyfikatora_wytworcy(self) -> None:
        wynik = _wykonaj({"ct_catalog_ref": "ct_150_1_0_5_10va_abb"})
        assert wynik.get("error_code") == "der_bindings.generator_missing"

    def test_wytworca_nieobecny_w_modelu_jest_bledem_a_nie_cichym_zapisem(self) -> None:
        wynik = _wykonaj({"generator_ref": "gen_nie_ma", "ct_catalog_ref": "ct_150_1_0_5_10va_abb"})
        assert wynik.get("error_code") == "der_bindings.generator_not_found"

    def test_operacja_jest_na_kanonicznej_bialej_liscie(self) -> None:
        # Kontrola odwrotna do V12K-191: operacja poza białą listą jest martwa,
        # więc wpis musi istnieć, a nie tylko handler.
        from domain.canonical_operations import CANONICAL_OPERATIONS
        from enm.domain_operations import CANONICAL_OPS

        assert "set_der_catalog_bindings" in CANONICAL_OPS
        assert "set_der_catalog_bindings" in CANONICAL_OPERATIONS

    def test_determinizm_dwa_identyczne_wywolania_daja_ten_sam_model(self) -> None:
        payload = {
            "generator_ref": "gen_pv_1",
            "ct_catalog_ref": "ct_200_5_5p10_10va_abb",
            "nc_rfg_profile_ref": "pse",
        }
        pierwszy = _wykonaj(dict(payload))
        drugi = _wykonaj(dict(payload))

        assert _params(pierwszy) == _params(drugi)


class TestWiazanieMusiIstniecWKatalogu:
    """V12K-241 (przeglad kodu serii): sciezka AKTUALIZACJI nie moze byc slabsza niz
    sciezka TWORZENIA, ktora przechodzi przez polityke wiazania katalogowego."""

    def test_nieistniejacy_typ_jest_odrzucony_zamiast_zapisany(self) -> None:
        # POMIAR PRZED NAPRAWA: operacja zwracala error=None i zapisywala do modelu
        # dowolny lancuch, wiec literowka stawala sie dana projektowa nieodrozninalna
        # od „jeszcze nie wybrano".
        wynik = _wykonaj(
            {"generator_ref": "gen_pv_1", "ct_catalog_ref": "ct_TYP_KTORY_NIE_ISTNIEJE"}
        )

        assert wynik.get("error_code") == "der_bindings.catalog_ref_unknown"
        assert "ct_TYP_KTORY_NIE_ISTNIEJE" in (wynik.get("error") or "")

    def test_realny_typ_katalogu_przechodzi(self) -> None:
        wynik = _wykonaj({"generator_ref": "gen_pv_1", "ct_catalog_ref": "ct_200_5_5p10_10va_abb"})

        assert wynik.get("error") is None
        assert _params(wynik)["ct_catalog_ref"] == "ct_200_5_5p10_10va_abb"

    def test_jawny_null_NIE_jest_walidowany_bo_usuwa_dana(self) -> None:
        # Kontrola granicy: `null` to usuniecie wiazania, nie wskazanie typu — nie wolno
        # go odrzucic jako „nieznanej referencji".
        enm = _enm_z_wytworca()
        enm["generators"][0]["materialized_params"]["ct_catalog_ref"] = "ct_200_5_5p10_10va_abb"
        wynik = _wykonaj({"generator_ref": "gen_pv_1", "ct_catalog_ref": None}, enm)

        assert wynik.get("error") is None
        assert "ct_catalog_ref" not in _params(wynik)

    def test_wiazania_bez_katalogu_w_backendzie_przechodza_z_zapisanym_dlugiem(self) -> None:
        # `fault_current_data_ref` i `dynamic_model_ref` NIE maja katalogu po stronie
        # backendu, wiec nie sa sprawdzane. Udawanie walidacji byloby gorsze niz jej
        # brak — ten test utrwala granice, zeby nie zniknela po cichu.
        wynik = _wykonaj(
            {
                "generator_ref": "gen_pv_1",
                "fault_current_data_ref": "fc_dowolne",
                "dynamic_model_ref": "dyn_dowolne",
            }
        )

        assert wynik.get("error") is None
