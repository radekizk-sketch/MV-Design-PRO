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

import pytest
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
                "protection_catalog_ref": "REF-OC-200",
                "ct_catalog_ref": "ct_200_5_5p10_10va_abb",
                "vt_catalog_ref": "vt_10kv_100v_05_abb",
                "fault_current_data_ref": "fc_pv_500",
                # Karta FAB-K: `dynamic_model_ref` MA teraz katalog (der_dynamic) —
                # musi byc identyfikatorem realnym, nie dowolnym lancuchem.
                "dynamic_model_ref": "default_pv_gfl",
            }
        )

        assert wynik.get("error") is None
        params = _params(wynik)
        assert params["protection_catalog_ref"] == "REF-OC-200"
        assert params["ct_catalog_ref"] == "ct_200_5_5p10_10va_abb"
        assert params["vt_catalog_ref"] == "vt_10kv_100v_05_abb"
        assert params["fault_current_data_ref"] == "fc_pv_500"
        assert params["dynamic_model_ref"] == "default_pv_gfl"
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

    def test_fault_current_data_ref_bez_katalogu_w_backendzie_przechodzi_z_zapisanym_dlugiem(
        self,
    ) -> None:
        # `fault_current_data_ref` NIE MA katalogu po stronie backendu (jawny dlug,
        # rejestr V12K), wiec NIE jest sprawdzany. Udawanie walidacji byloby gorsze
        # niz jej brak — ten test utrwala granice, zeby nie zniknela po cichu.
        wynik = _wykonaj(
            {
                "generator_ref": "gen_pv_1",
                "fault_current_data_ref": "fc_dowolne",
            }
        )

        assert wynik.get("error") is None

    def test_dynamic_model_ref_MA_katalog_od_karty_fab_k_dowolny_string_odrzucony(
        self,
    ) -> None:
        # Karta FAB-K (R2): `dynamic_model_ref` dostal dostawce
        # (`network_model.catalog.der_dynamic`, konsumowany przez solvery RMS/FRT-HVRT
        # — patrz `resolve_der_dynamic_profile`) — od tej karty JEST sprawdzany, tak
        # samo jak ct/vt/protection_catalog_ref.
        wynik = _wykonaj(
            {
                "generator_ref": "gen_pv_1",
                "dynamic_model_ref": "dyn_dowolne",
            }
        )

        assert wynik.get("error_code") == "der_bindings.catalog_ref_unknown"
        assert "dynamic_model_ref=dyn_dowolne" in (wynik.get("error") or "")

    def test_dynamic_model_ref_realny_profil_der_dynamic_przechodzi(self) -> None:
        wynik = _wykonaj(
            {
                "generator_ref": "gen_pv_1",
                "dynamic_model_ref": "default_pv_gfm",
            }
        )

        assert wynik.get("error") is None
        assert _params(wynik)["dynamic_model_ref"] == "default_pv_gfm"

    def test_dynamic_model_ref_jawny_null_NIE_jest_walidowany_bo_usuwa_dana(self) -> None:
        enm = _enm_z_wytworca()
        enm["generators"][0]["materialized_params"]["dynamic_model_ref"] = "default_pv_gfl"
        wynik = _wykonaj({"generator_ref": "gen_pv_1", "dynamic_model_ref": None}, enm)

        assert wynik.get("error") is None
        assert "dynamic_model_ref" not in _params(wynik)


def test_urzadzenie_z_listy_pickera_daje_sie_ZAPISAC(tmp_path=None) -> None:
    """V12K-248: walidacja wiazan pyta o katalog, ktory widzi projektant.

    POMIAR: repozytorium katalogu MV ma 12 urzadzen zabezpieczeniowych (5 profili
    referencyjnych bez marki + 7 Elektrometal e2TANGO), a katalog analityczny — 51
    rekordow producenckich; to jego wystawia
    `/api/catalog/protection/device-types`, z ktorego wybiera picker. Sprawdzanie samego
    repozytorium MV odrzucalo **39 z 51** urzadzen widocznych na liscie: projektant
    wybieral realny przekaznik ABB i dostawal „typ katalogowy nie istnieje".
    """
    from application.analyses.protection.catalog.catalog_store import list_devices
    from enm.domain_operations_v2 import _nieznane_referencje_katalogowe

    analityczne = [u.device_id for u in list_devices()]
    assert "ABB_REF615" in analityczne, "test stoi na realnym wpisie katalogu"

    # Urzadzenie z listy pickera przechodzi…
    assert _nieznane_referencje_katalogowe({"protection_catalog_ref": "ABB_REF615"}) == []
    # …a wymyslony identyfikator nadal NIE (bramka nie zostala rozmontowana).
    assert _nieznane_referencje_katalogowe(
        {"protection_catalog_ref": "REL_KTORY_NIE_ISTNIEJE"}
    ) == ["protection_catalog_ref=REL_KTORY_NIE_ISTNIEJE"]


# =============================================================================
# Karta FAB-K (§0 R1) — parytet NAZW kluczy FE ↔ BE + round-trip (iloczyn cech)
# =============================================================================
#
# `DER_BINDING_KEYS`/`DER_PROFILE_KEYS` (`enm/domain_operations_v2.py`) SĄ
# JEDYNĄ definicją — front czyta z lustra `zModelu.ts::DER_MATERIALIZED_
# BINDING_KEYS`/`DER_MATERIALIZED_PROFILE_KEYS` (test frontowy
# `zModelu.test.ts::DER_MATERIALIZED_BINDING_KEYS — parytet z backendem`
# przypina te SAME nazwy w tej SAMEJ kolejności). Dwa języki nie dzielą
# jednego importu, więc „jedno źródło" oznacza tu: KAŻDY z dwóch testów
# importuje SWOJĄ realną definicję (nie ręcznie przepisaną kopię) i przypina
# ją do jawnej, identycznej listy — rozjazd między backendem a frontem staje
# się WIDOCZNY jako czerwony test po jednej albo drugiej stronie, nie cichy.


def test_der_binding_profile_keys_pin_parytet_fe_be() -> None:
    """Przypięcie nazw kluczy — zmiana wymaga świadomej aktualizacji obu stron."""
    from enm.domain_operations_v2 import DER_BINDING_KEYS, DER_PROFILE_KEYS

    assert DER_BINDING_KEYS == (
        "protection_catalog_ref",
        "ct_catalog_ref",
        "vt_catalog_ref",
        "fault_current_data_ref",
        "dynamic_model_ref",
    )
    assert DER_PROFILE_KEYS == (
        "nc_rfg_profile_ref",
        "lvrt_curve_ref",
        "hvrt_curve_ref",
        "pf_curve_ref",
    )


#: Wartości REALNE (te same, którymi posługują się testy wyżej w tym pliku) —
#: `ct`/`vt`/`protection`/`dynamic_model_ref` są WALIDOWANE względem katalogu
#: backendu (`_KATALOGI_WIAZAN_DER` + walidacja osobna dla `dynamic_model_ref`),
#: więc wartość musi być realną pozycją, nie dowolnym łańcuchem.
_WARTOSC_DLA_KLUCZA: dict[str, str] = {
    "protection_catalog_ref": "REF-OC-200",
    "ct_catalog_ref": "ct_200_5_5p10_10va_abb",
    "vt_catalog_ref": "vt_10kv_100v_05_abb",
    "fault_current_data_ref": "fc_pv_500",
    "dynamic_model_ref": "default_pv_gfl",
    "nc_rfg_profile_ref": "pse",
    "lvrt_curve_ref": "lvrt_pse_b",
    "hvrt_curve_ref": "hvrt_pse_b",
    "pf_curve_ref": "pf_pse_2024",
}


def _wartosc_wynikowa(wynik: dict, klucz: str) -> object:
    """Odczyt wartości klucza z odpowiedzi — profile idą do podsłownika ``profiles``."""
    from enm.domain_operations_v2 import DER_PROFILE_KEYS

    params = _params(wynik)
    if klucz in DER_PROFILE_KEYS:
        return params.get("profiles", {}).get(klucz)
    return params.get(klucz)


def _wszystkie_klucze() -> tuple[str, ...]:
    from enm.domain_operations_v2 import DER_BINDING_KEYS, DER_PROFILE_KEYS

    return DER_BINDING_KEYS + DER_PROFILE_KEYS


@pytest.mark.parametrize("klucz", _wszystkie_klucze())
def test_round_trip_zapis_klucza(klucz: str) -> None:
    """Karta FAB-K (§0 R1), iloczyn cech, gałąź „zapis": KAŻDY klucz z
    ``DER_BINDING_KEYS``/``DER_PROFILE_KEYS`` (nie tylko przykład z audytu)
    zapisuje się w ``materialized_params`` (płasko) albo ``materialized_params
    .profiles`` (profile) i wraca w odpowiedzi PATCH dokładnie z tą wartością —
    ta sama ścieżka, którą czyta front (`derZGeneratora`) po GET snapshotu.
    """
    wartosc = _WARTOSC_DLA_KLUCZA[klucz]
    wynik = _wykonaj({"generator_ref": "gen_pv_1", klucz: wartosc})

    assert wynik.get("error") is None, f"zapis klucza {klucz} odrzucony: {wynik.get('error')}"
    assert _wartosc_wynikowa(wynik, klucz) == wartosc


@pytest.mark.parametrize("klucz", _wszystkie_klucze())
def test_round_trip_wyczyszczenie_klucza(klucz: str) -> None:
    """Karta FAB-K (§0 R1), iloczyn cech, gałąź „wyczyszczenie": KAŻDY klucz,
    zapisany raz, znika CAŁKOWICIE z modelu po jawnym ``null`` (reguła
    gotowości musi znów widzieć BRAK danej, nie pustą wartość) — nie tylko
    ``ct_catalog_ref``/``nc_rfg_profile_ref`` z dwóch istniejących przykładów.
    """
    from enm.domain_operations_v2 import DER_PROFILE_KEYS

    enm = _enm_z_wytworca()
    if klucz in DER_PROFILE_KEYS:
        enm["generators"][0]["materialized_params"]["profiles"] = {
            klucz: _WARTOSC_DLA_KLUCZA[klucz]
        }
    else:
        enm["generators"][0]["materialized_params"][klucz] = _WARTOSC_DLA_KLUCZA[klucz]

    wynik = _wykonaj({"generator_ref": "gen_pv_1", klucz: None}, enm)

    assert (
        wynik.get("error") is None
    ), f"wyczyszczenie klucza {klucz} odrzucone: {wynik.get('error')}"
    assert _wartosc_wynikowa(wynik, klucz) is None
