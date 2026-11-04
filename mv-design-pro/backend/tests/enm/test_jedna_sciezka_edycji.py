"""Karta JEDNA-SCIEZKA-EDYCJI — pola edytowane przez `update_element_parameters`.

DLACZEGO. Kontrolki karty odcinka SN, konfiguratora stacji i siatki właściwości trzymały
wartości w stanie lokalnym albo wysyłały klucze, których operacja nie przyjmuje. Każde pole,
które inżynier zmienia, ma teraz JEDNĄ drogę zapisu — tę operację — i jedną bramkę wartości:

* długość odcinka — dziedzina z tworzenia odcinka (> 0), bez górnej granicy z interfejsu;
* warunki ułożenia kabla SN — parser toru DER (`_der_cable_laying_conditions`), zapis do
  `meta.cable_laying_conditions`; kabel nN i linia napowietrzna — odmowa nazwana;
* podzespół zaczepów transformatora — brama `_blad_zaczepow` (wcześniej ta droga zapisywała
  bez kontroli) i materializacja z katalogu przełączników;
* cos φ odbioru — parametr operacji, do modelu trafia Q (ta sama algebra co kreator nN).

ILOCZYN CECH: {długość: dodatnia, zero, ujemna, napis, logiczna} × {kabel, linia};
{warunki: zestaw nazwany, własne, katalogowe (zdjęcie), nieznany} × {kabel SN, kabel nN, linia};
{zaczepy: katalog pasujący, katalog spoza klasy, katalog nieznany, ręczne poza zakresem,
ręczne poprawne, zdjęcie} ; {cos φ: poprawny, 0, > 1, z Q, z P w tej samej zmianie, P = 0}.
Każda odmowa: kod błędu i brak migawki (zero skutku w modelu).
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.domain_operations import (
    PARAMETRY_EDYTOWALNE_WG_KOLEKCJI,
    execute_domain_operation,
)
from enm.kompilator_grafu import (
    _gpz_line_fields,
    dodaj_obciazenie,
    dodaj_transformator,
    dodaj_zrodlo_slack,
    kontynuuj_z_pola,
    pusty_enm,
)
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from network_model.pochodne import moc_bierna_z_czynnej_i_cos_phi

KABEL_SN = "cable-base-xlpe-al-3c-240"
TRAFO = "tr-sn-nn-15-04-630kva-dyn11"
LINIA_SN = "line-base-al-st-70"
PRZELACZNIK_SN_NN = "tc_detc_snnn_5_25"


def _siec() -> dict[str, Any]:
    enm = pusty_enm(name="Jedna ścieżka edycji", sn_nominal_kv=15.0)
    enm, _gpz = dodaj_zrodlo_slack(
        enm, voltage_kv=15.0, sk3_mva=250.0, rx_ratio=0.1, line_fields_count=1
    )
    pole = _gpz_line_fields(enm)[0]["ref_id"]
    enm, szyna_b = kontynuuj_z_pola(
        enm,
        field_ref=pole,
        catalog_ref=KABEL_SN,
        dlugosc_m=850.0,
        rodzaj="KABEL",
        name="K-1",
        bus_name="B",
    )
    enm, szyna_nn = dodaj_transformator(
        enm, hv_bus_ref=szyna_b, catalog_ref=TRAFO, lv_voltage_kv=0.4
    )
    return dodaj_obciazenie(enm, bus_ref=szyna_nn, p_mw=0.2, q_mvar=0.05)


def _zmien(enm: dict[str, Any], ref: str, parametry: dict[str, Any]) -> dict[str, Any]:
    return execute_domain_operation(
        enm, "update_element_parameters", {"element_ref": ref, "parameters": parametry}
    )


def _kabel(enm: dict[str, Any]) -> dict[str, Any]:
    return next(b for b in enm["branches"] if b.get("name") == "K-1")


def _po(odpowiedz: dict[str, Any]) -> dict[str, Any]:
    assert not odpowiedz.get("error"), odpowiedz.get("error")
    return EnergyNetworkModel.model_validate(odpowiedz["snapshot"]).model_dump(mode="json")


def _odmowa(odpowiedz: dict[str, Any], kod: str) -> None:
    assert odpowiedz.get("error_code") == kod, odpowiedz
    assert odpowiedz.get("snapshot") is None


# --- długość odcinka -------------------------------------------------------------------


def test_dlugosc_dodatnia_zapisana_w_modelu() -> None:
    enm = _siec()
    po = _po(_zmien(enm, _kabel(enm)["ref_id"], {"length_km": 1.25}))
    assert _kabel(po)["length_km"] == pytest.approx(1.25)


@pytest.mark.parametrize("wartosc", [0, 0.0, -0.5])
def test_dlugosc_spoza_dziedziny_odmowiona(wartosc: Any) -> None:
    enm = _siec()
    _odmowa(_zmien(enm, _kabel(enm)["ref_id"], {"length_km": wartosc}), "params.invalid_value")


@pytest.mark.parametrize("wartosc", ["850", "abc", True, None])
def test_dlugosc_nie_liczba_to_zlamanie_kontraktu(wartosc: Any) -> None:
    """Napis i wartość logiczna nie są po cichu zamieniane na liczbę (tryb luźny modelu)."""
    enm = _siec()
    _odmowa(
        _zmien(enm, _kabel(enm)["ref_id"], {"length_km": wartosc}),
        "operation.model_contract_violated",
    )


def test_dlugosc_bez_gornej_granicy_interfejsu() -> None:
    """Dawna granica 500 km siatki właściwości nie miała podstawy w modelu ani w operacji."""
    enm = _siec()
    po = _po(_zmien(enm, _kabel(enm)["ref_id"], {"length_km": 750.0}))
    assert _kabel(po)["length_km"] == pytest.approx(750.0)


# --- warunki ułożenia kabla SN ------------------------------------------------------------


def test_warunki_nazwane_zapisane_w_meta() -> None:
    enm = _siec()
    po = _po(
        _zmien(
            enm,
            _kabel(enm)["ref_id"],
            {"cable_laying_conditions": {"set_name": "ziemia_3_kable_warstwa_200mm"}},
        )
    )
    assert _kabel(po)["meta"]["cable_laying_conditions"] == {
        "set_name": "ziemia_3_kable_warstwa_200mm"
    }


def test_warunki_wlasne_niosa_wspolczynniki_i_opis() -> None:
    enm = _siec()
    po = _po(
        _zmien(
            enm,
            _kabel(enm)["ref_id"],
            {
                "cable_laying_conditions": {
                    "set_name": "wlasne",
                    "f_grunt": 0.9,
                    "f_wiazka": 0.8,
                    "f_grupa": 1.0,
                    "opis_pl": "Projekt branżowy, tab. 4",
                }
            },
        )
    )
    zapis = _kabel(po)["meta"]["cable_laying_conditions"]
    assert zapis["set_name"] == "wlasne"
    assert (zapis["f_grunt"], zapis["f_wiazka"], zapis["f_grupa"]) == (0.9, 0.8, 1.0)


@pytest.mark.parametrize("zdjecie", [{"set_name": "warunki_katalogowe"}, None])
def test_warunki_katalogowe_zdejmuja_zapis(zdjecie: Any) -> None:
    enm = _siec()
    ref = _kabel(enm)["ref_id"]
    z_korekta = _po(
        _zmien(enm, ref, {"cable_laying_conditions": {"set_name": "ziemia_3_kable_warstwa_200mm"}})
    )
    po = _po(_zmien(z_korekta, ref, {"cable_laying_conditions": zdjecie}))
    assert "cable_laying_conditions" not in (_kabel(po).get("meta") or {})


def test_warunki_nieznany_zestaw_odmowiony() -> None:
    enm = _siec()
    _odmowa(
        _zmien(enm, _kabel(enm)["ref_id"], {"cable_laying_conditions": {"set_name": "bagno"}}),
        "cable.laying_conditions_invalid",
    )


def test_warunki_na_kablu_nn_kieruja_do_operacji_nn() -> None:
    """Kabel nN ma tablice PN-HD 60364-5-52 i własną operację — tu odmowa, nie drugi parser."""
    enm = EnergyNetworkModel(
        header=ENMHeader(name="nN", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")
    enm = execute_domain_operation(
        enm, "add_nn_distribution_board", {"voltage_kv": 0.4, "name": "RGnN-1"}
    )["snapshot"]
    szyna = next(s for s in enm["substations"] if s.get("station_type") == "rozdzielnica_nn")[
        "bus_refs"
    ][0]
    odpowiedz = execute_domain_operation(
        enm,
        "add_nn_cable_segment",
        {"from_bus_ref": szyna, "length_m": 30.0, "catalog_ref": "kab_nn_4x120_al"},
    )
    enm = _po(odpowiedz)
    kabel_nn = next(b for b in enm["branches"] if b.get("type") == "cable")
    _odmowa(
        _zmien(
            enm,
            kabel_nn["ref_id"],
            {"cable_laying_conditions": {"set_name": "warunki_katalogowe"}},
        ),
        "cable.laying_conditions_nn_segment",
    )


def test_warunki_na_linii_napowietrznej_odmowione() -> None:
    enm = pusty_enm(name="Linia", sn_nominal_kv=15.0)
    enm, _gpz = dodaj_zrodlo_slack(
        enm, voltage_kv=15.0, sk3_mva=250.0, rx_ratio=0.1, line_fields_count=1
    )
    pole = _gpz_line_fields(enm)[0]["ref_id"]
    enm, _b = kontynuuj_z_pola(
        enm, field_ref=pole, catalog_ref=LINIA_SN, dlugosc_m=500.0, name="L-1", bus_name="B"
    )
    linia = next(b for b in enm["branches"] if b.get("name") == "L-1")
    _odmowa(
        _zmien(enm, linia["ref_id"], {"cable_laying_conditions": {"set_name": "wlasne"}}),
        "cable.laying_conditions_not_cable",
    )


def test_klucz_warunkow_ulozenia_w_rejestrze_pol_odcinka() -> None:
    assert "cable_laying_conditions" in PARAMETRY_EDYTOWALNE_WG_KOLEKCJI["branches"]


# --- zaczepy transformatora ---------------------------------------------------------------


def _transformator(enm: dict[str, Any]) -> dict[str, Any]:
    return enm["transformers"][0]


def test_zaczepy_z_katalogu_materializowane() -> None:
    enm = _siec()
    po = _po(
        _zmien(
            enm,
            _transformator(enm)["ref_id"],
            {"tap_changer": {"catalog_ref": PRZELACZNIK_SN_NN}},
        )
    )
    zaczepy = _transformator(po)["tap_changer"]
    assert zaczepy["catalog_ref"] == PRZELACZNIK_SN_NN
    assert zaczepy["regulation_type"] == "DETC"
    assert zaczepy["min_position"] < zaczepy["neutral_position"] < zaczepy["max_position"]


def test_zmiana_pozycji_zaczepu_w_granicach() -> None:
    enm = _siec()
    ref = _transformator(enm)["ref_id"]
    z_przelacznikiem = _po(_zmien(enm, ref, {"tap_changer": {"catalog_ref": PRZELACZNIK_SN_NN}}))
    zaczepy = dict(_transformator(z_przelacznikiem)["tap_changer"])
    zaczepy["current_position"] = zaczepy["max_position"]
    po = _po(_zmien(z_przelacznikiem, ref, {"tap_changer": zaczepy}))
    assert _transformator(po)["tap_changer"]["current_position"] == zaczepy["max_position"]


def test_pozycja_poza_zakresem_odmowiona() -> None:
    enm = _siec()
    ref = _transformator(enm)["ref_id"]
    z_przelacznikiem = _po(_zmien(enm, ref, {"tap_changer": {"catalog_ref": PRZELACZNIK_SN_NN}}))
    zaczepy = dict(_transformator(z_przelacznikiem)["tap_changer"])
    zaczepy["current_position"] = zaczepy["max_position"] + 1
    _odmowa(
        _zmien(z_przelacznikiem, ref, {"tap_changer": zaczepy}), "transformer.tap_changer_invalid"
    )


def test_przelacznik_spoza_klasy_transformatora_odmowiony() -> None:
    enm = _siec()
    _odmowa(
        _zmien(
            enm,
            _transformator(enm)["ref_id"],
            {"tap_changer": {"catalog_ref": "tc_oltc_110sn_19_125"}},
        ),
        "transformer.tap_changer_not_applicable",
    )


def test_przelacznik_nieznany_odmowiony() -> None:
    enm = _siec()
    _odmowa(
        _zmien(enm, _transformator(enm)["ref_id"], {"tap_changer": {"catalog_ref": "brak"}}),
        "transformer.tap_changer_catalog_unknown",
    )


def test_zaczepy_reczne_niekompletne_przechodza_brame_kontraktu() -> None:
    """Regulacja spoza słownika (dawniej zapisywana bez kontroli tą drogą) — odmowa."""
    enm = _siec()
    _odmowa(
        _zmien(enm, _transformator(enm)["ref_id"], {"tap_changer": {"regulation_type": "XYZ"}}),
        "transformer.tap_changer_invalid",
    )


def test_zdjecie_podzespolu_zaczepow() -> None:
    enm = _siec()
    ref = _transformator(enm)["ref_id"]
    z_przelacznikiem = _po(_zmien(enm, ref, {"tap_changer": {"catalog_ref": PRZELACZNIK_SN_NN}}))
    po = _po(_zmien(z_przelacznikiem, ref, {"tap_changer": None}))
    assert _transformator(po).get("tap_changer") is None


# --- cos φ odbioru --------------------------------------------------------------------------


def test_cos_phi_wyznacza_q_odbioru() -> None:
    enm = _siec()
    odbior = enm["loads"][0]
    po = _po(_zmien(enm, odbior["ref_id"], {"cos_phi": 0.9}))
    assert po["loads"][0]["q_mvar"] == pytest.approx(moc_bierna_z_czynnej_i_cos_phi(0.2, 0.9))
    assert "cos_phi" not in po["loads"][0]


def test_cos_phi_z_p_tej_samej_zmiany() -> None:
    enm = _siec()
    odbior = enm["loads"][0]
    po = _po(_zmien(enm, odbior["ref_id"], {"p_mw": 0.4, "cos_phi": 0.95}))
    assert po["loads"][0]["p_mw"] == pytest.approx(0.4)
    assert po["loads"][0]["q_mvar"] == pytest.approx(moc_bierna_z_czynnej_i_cos_phi(0.4, 0.95))


@pytest.mark.parametrize(
    "parametry",
    [{"cos_phi": 0}, {"cos_phi": 1.2}, {"cos_phi": "0,9"}, {"cos_phi": 0.9, "q_mvar": 0.1}],
)
def test_cos_phi_spoza_dziedziny_odmowiony(parametry: dict[str, Any]) -> None:
    enm = _siec()
    _odmowa(_zmien(enm, enm["loads"][0]["ref_id"], parametry), "params.invalid_value")


def test_cos_phi_bez_poboru_mocy_czynnej_odmowiony() -> None:
    enm = _siec()
    _odmowa(
        _zmien(enm, enm["loads"][0]["ref_id"], {"p_mw": 0.0, "cos_phi": 0.9}),
        "params.invalid_value",
    )
