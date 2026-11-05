"""Źródło przekształtnikowe (PV/BESS/FW) — JEDNA droga zapisu (karta JEDNA-SCIEZKA-EDYCJI).

Dawniej zapis wytwórcy miał dwie drogi: operację `add_converter_source` przez
`POST …/enm/domain-ops` (kreator źródła OZE) i osobną końcówkę `POST …/generators`
(kreator DER stacji, formularz szkicu DER) z WŁASNYM tłumaczem ładunku, własnym katalogiem
transformatorów dedykowanych (`btr_*`) i zapisem modelu z pominięciem dziennika zmian. Po
karcie wszystko, co robiła tamta końcówka, robi operacja: szyna nN stacji ustalana z modelu,
nowy transformator dedykowany z katalogu TRAFO_SN_NN na wskazanym punkcie przyłączenia SN,
weryfikacja zadeklarowanego modułu NC RfG, próba `dry_run`, pakiet baterii, pola NC RfG.

Testy są ILOCZYNEM cech, w którym defekt dwóch dróg mógłby się schować: rodzaj źródła
{PV, BESS, FW} × wariant przyłączenia {nN — szyna ustalona z modelu, nN — szyna jawna,
transformator dedykowany z katalogu} × próba {zapis, `dry_run`} × deklaracja modułu NC RfG
{brak, zgodna, niezgodna}. Do tego: kody odmów punktu przyłączenia SN, predykat bramy
katalogowej i operacji z jednego źródła, dziennik zmian i rewizja do cofnięcia, wiązania
wytwórcy tą samą drogą, awaria zapisu.
"""

from __future__ import annotations

import itertools

import pytest

from tests.api.test_generators_api import (
    _create_project_and_case,
    _seed_station_enm,
    _seed_station_z_szyna_110kv,
)

pytest.importorskip("fastapi")

TR_1250 = "tr-sn-nn-15-0p69-1p25mva-dyn11-inverter"
TR_3150 = "tr-sn-nn-15-0p69-3p15mva-dyn11-inverter"
TR_800 = "tr-sn-nn-15-0p69-0p8mva-dyn11-inverter"
TR_1600_04 = "tr-sn-nn-15-04-1600kva-dyn11-tier2-suchy"
BATERIA = "bess_bat_lfp_2880kwh_1230vdc"


def _operacja(app_client, case_id: str, nazwa: str, ladunek: dict):
    return app_client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={"operation": {"name": nazwa, "payload": ladunek}},
    )


def _kod(odpowiedz) -> str | None:
    """Kod odmowy z bramy katalogowej (422) albo z operacji (`error_code`); `None` = przyjęte."""
    if odpowiedz.status_code == 422:
        return odpowiedz.json()["detail"]["code"]
    assert odpowiedz.status_code == 200, odpowiedz.text
    cialo = odpowiedz.json()
    return cialo["error_code"] if cialo.get("error") else None


def _model(app_client, case_id: str) -> dict:
    odpowiedz = app_client.get(f"/api/cases/{case_id}/enm")
    assert odpowiedz.status_code == 200
    return odpowiedz.json()


def _bez_naglowka(model: dict) -> dict:
    return {k: v for k, v in model.items() if k != "header"}


#: Ładunek bazowy per (rodzaj źródła, wariant przyłączenia) i moc transformatora stacji,
#: przy której zapis jest przyjęty. Wartości katalogowe realne (pozycje katalogów).
_ZRODLA: dict[tuple[str, str], tuple[float, dict]] = {
    ("PV", "nn_auto"): (
        0.63,
        {"catalog_ref": "conv-pv-nn-0p5mw-0p4kv", "power_setpoint_mw": 0.5},
    ),
    ("PV", "nn_jawna"): (
        0.63,
        {
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "power_setpoint_mw": 0.5,
            "bus_nn_ref": "station/1/nn_bus",
        },
    ),
    ("PV", "dedykowany"): (
        0.063,
        {
            "catalog_ref": "pv_inv_system_1000",
            "power_setpoint_mw": 1.0,
            "block_transformer_catalog_ref": TR_1250,
            "sn_connection_bus_ref": "station/1/sn_bus",
        },
    ),
    ("BESS", "nn_auto"): (
        0.63,
        {
            "catalog_ref": "conv-bess-nn-0p5mw-0p4kv",
            "power_setpoint_mw": 0.5,
            "battery_catalog_ref": BATERIA,
        },
    ),
    ("BESS", "nn_jawna"): (
        0.63,
        {
            "catalog_ref": "conv-bess-nn-0p5mw-0p4kv",
            "power_setpoint_mw": 0.5,
            "bus_nn_ref": "station/1/nn_bus",
        },
    ),
    ("BESS", "dedykowany"): (
        0.063,
        {
            "catalog_ref": "conv-bess-nn-2mw-0p69kv",
            "power_setpoint_mw": 2.0,
            "block_transformer_catalog_ref": TR_3150,
            "sn_connection_bus_ref": "station/1/sn_bus",
            "battery_catalog_ref": BATERIA,
        },
    ),
    ("FW", "nn_auto"): (
        2.5,
        {"catalog_ref": "conv-wind-nn-2mw-0p4kv", "power_setpoint_mw": 2.0},
    ),
    ("FW", "nn_jawna"): (
        2.5,
        {
            "catalog_ref": "conv-wind-nn-2mw-0p4kv",
            "power_setpoint_mw": 2.0,
            "bus_nn_ref": "station/1/nn_bus",
        },
    ),
}

#: Moduł NC RfG zgodny z klasyfikacją (moc × napięcie punktu przyłączenia; progi WOS: typ B
#: od 200 kW, C od 10 MW) i jeden niezgodny — dla każdego źródła z `_ZRODLA`.
_MODUL_ZGODNY = {"PV": "B", "BESS": "B", "FW": "B"}
_MODUL_NIEZGODNY = "A"

_ILOCZYN = [
    (rodzaj, wariant, proba, modul)
    for (rodzaj, wariant), proba, modul in itertools.product(
        _ZRODLA, (False, True), ("brak", "zgodny", "niezgodny")
    )
]


def _ladunek(rodzaj: str, wariant: str, proba: bool, modul: str) -> dict:
    _, pola = _ZRODLA[(rodzaj, wariant)]
    ladunek = {
        "source_technology": rodzaj,
        "connection_variant": ("block_transformer" if wariant == "dedykowany" else "nn_side"),
        "station_ref": "station/1",
        "source_name": f"{rodzaj} {wariant}",
        **pola,
    }
    if proba:
        ladunek["dry_run"] = True
    if modul == "zgodny":
        ladunek["nc_rfg_module"] = _MODUL_ZGODNY[rodzaj]
    elif modul == "niezgodny":
        ladunek["nc_rfg_module"] = _MODUL_NIEZGODNY
    return ladunek


@pytest.mark.parametrize(("rodzaj", "wariant", "proba", "modul"), _ILOCZYN)
def test_iloczyn_rodzaj_wariant_proba_modul(app_client, rodzaj, wariant, proba, modul) -> None:
    moc_tr, _ = _ZRODLA[(rodzaj, wariant)]
    _, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=moc_tr)
    przed = _model(app_client, case_id)

    odpowiedz = _operacja(
        app_client,
        case_id,
        "add_converter_source",
        _ladunek(rodzaj, wariant, proba, modul),
    )
    kod = _kod(odpowiedz)

    if modul == "niezgodny":
        assert kod == "generator.nc_rfg_module_mismatch"
        komunikat = odpowiedz.json()["error"]
        assert f"„{_MODUL_NIEZGODNY}”" in komunikat
        assert "wymogi ogólnego stosowania (WOS)" in komunikat
        assert _bez_naglowka(_model(app_client, case_id)) == _bez_naglowka(przed)
        return
    assert kod is None, odpowiedz.json().get("error")
    cialo = odpowiedz.json()
    if proba:
        # Próba: te same reguły co zapis, odpowiedź bez migawki, model bez zmian.
        assert cialo["dry_run"] is True
        assert "snapshot" not in cialo
        assert cialo["preview"]["created_refs"]
        assert _model(app_client, case_id) == przed
        return
    model = _model(app_client, case_id)
    (generator,) = model["generators"]
    assert generator["station_ref"] == "station/1"
    assert (
        generator["gen_type"]
        == {"PV": "pv_inverter", "BESS": "bess", "FW": "wind_inverter"}[rodzaj]
    )
    assert generator["catalog_ref"] == _ZRODLA[(rodzaj, wariant)][1]["catalog_ref"]
    # Deklaracja modułu nie jest zapisywana — moduł wynika z klasyfikacji.
    assert "nc_rfg_module" not in generator
    if wariant == "dedykowany":
        tr = next(
            t for t in model["transformers"] if t["ref_id"] == generator["blocking_transformer_ref"]
        )
        assert tr["catalog_namespace"] == "TRAFO_SN_NN"
        assert tr["catalog_ref"] == _ZRODLA[(rodzaj, wariant)][1]["block_transformer_catalog_ref"]
        assert tr["hv_bus_ref"] == "station/1/sn_bus"
        szyna = next(b for b in model["buses"] if b["ref_id"] == tr["lv_bus_ref"])
        assert szyna["voltage_kv"] == tr["ulv_kv"] == 0.69
        # Transformator i szyna urządzenia są elementami utworzonymi przez operację
        # (dziennik zmian je zna — dawna końcówka dopisywała je poza operacją).
        assert tr["ref_id"] in cialo["changes"]["created_element_ids"]
        assert szyna["ref_id"] in cialo["changes"]["created_element_ids"]
        stacja = next(s for s in model["substations"] if s["ref_id"] == "station/1")
        assert tr["ref_id"] in stacja["transformer_refs"]
        assert szyna["ref_id"] in stacja["bus_refs"]
    else:
        assert generator["connection_variant"] == "nn_side"
        assert not generator.get("blocking_transformer_ref")


def test_ten_sam_ladunek_daje_te_same_identyfikatory(app_client) -> None:
    """Determinizm: to samo wejście → te same identyfikatory toru dedykowanego i źródła."""
    wyniki = []
    for _ in range(2):
        _, case_id = _create_project_and_case(app_client)
        _seed_station_enm(case_id, transformer_sn_mva=0.063)
        odpowiedz = _operacja(
            app_client,
            case_id,
            "add_converter_source",
            _ladunek("PV", "dedykowany", False, "brak"),
        )
        assert _kod(odpowiedz) is None
        wyniki.append(odpowiedz.json()["changes"]["created_element_ids"])
    assert wyniki[0] == wyniki[1]


def test_szyna_nn_ustalona_z_modelu_lezy_za_wylacznikiem_glownym(app_client) -> None:
    """Brak `bus_nn_ref`: szyna rozdzielnicy nN stacji z modelu (strona dolna transformatora
    stacji) — dla jednej stacji szyna ustalona = szyna wskazana jawnie."""
    wyniki = {}
    for wariant in ("nn_auto", "nn_jawna"):
        _, case_id = _create_project_and_case(app_client)
        _seed_station_enm(case_id)
        assert (
            _kod(
                _operacja(
                    app_client,
                    case_id,
                    "add_converter_source",
                    _ladunek("PV", wariant, False, "brak"),
                )
            )
            is None
        )
        (generator,) = _model(app_client, case_id)["generators"]
        wyniki[wariant] = generator["meta"]["field_ref"]
    assert wyniki["nn_auto"] == wyniki["nn_jawna"]


def test_szyna_jawna_ma_pierwszenstwo_nad_ustalona(app_client) -> None:
    _, case_id = _create_project_and_case(app_client)
    _seed_station_z_szyna_110kv(case_id)
    ladunek = {
        **_ladunek("PV", "nn_auto", False, "zgodny"),
        "bus_nn_ref": "station/1/nn_bus_2",
    }
    assert _kod(_operacja(app_client, case_id, "add_converter_source", ladunek)) is None
    (generator,) = _model(app_client, case_id)["generators"]
    pole = next(
        b
        for b in _model(app_client, case_id)["bays"]
        if b["ref_id"] == generator["meta"]["field_ref"]
    )
    assert pole["bus_ref"] == "station/1/nn_bus_2"


def test_stacja_bez_szyny_nn_jest_nazwana_odmowa(app_client) -> None:
    _, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)
    from enm.models import EnergyNetworkModel
    from enm.store import get_enm, set_enm

    from tests.test_execution_api import _klucz_modelu

    model = get_enm(_klucz_modelu(case_id)).model_dump(mode="json")
    model["transformers"] = []
    model["buses"] = [b for b in model["buses"] if b["ref_id"] != "station/1/nn_bus"]
    model["substations"][0]["bus_refs"] = ["station/1/sn_bus"]
    model["substations"][0]["transformer_refs"] = []
    set_enm(_klucz_modelu(case_id), EnergyNetworkModel.model_validate(model))

    odpowiedz = _operacja(
        app_client,
        case_id,
        "add_converter_source",
        _ladunek("PV", "nn_auto", False, "brak"),
    )
    assert _kod(odpowiedz) == "station.nn_bus_missing"
    assert "Stacja 1" in odpowiedz.json()["error"]


@pytest.mark.parametrize(
    ("zmiana", "kod"),
    [
        ({"sn_connection_bus_ref": None}, "generator.sn_connection_bus_missing"),
        ({"sn_connection_bus_ref": "nie/ma"}, "generator.sn_connection_bus_unknown"),
        (
            {"sn_connection_bus_ref": "station/1/nn_bus"},
            "generator.sn_bus_voltage_mismatch",
        ),
        (
            {"block_transformer_catalog_ref": None},
            "generator.block_transformer_catalog_missing",
        ),
        (
            {"block_transformer_catalog_ref": TR_800},
            "converter.transformer_capacity_exceeded",
        ),
        (
            {"block_transformer_lv_voltage_tolerance": "PLUS_7"},
            "der.invalid_lv_voltage_tolerance",
        ),
        ({"nc_rfg_module": "Z"}, "payload.invalid_type"),
    ],
)
def test_odmowy_toru_dedykowanego_bez_zmiany_modelu(app_client, zmiana, kod) -> None:
    _, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.063)
    przed = _model(app_client, case_id)
    ladunek = {
        k: v
        for k, v in {**_ladunek("PV", "dedykowany", False, "brak"), **zmiana}.items()
        if v is not None
    }
    for proba in (False, True):
        odpowiedz = _operacja(
            app_client, case_id, "add_converter_source", {**ladunek, "dry_run": proba}
        )
        assert _kod(odpowiedz) == kod, (proba, odpowiedz.text)
    assert _bez_naglowka(_model(app_client, case_id)) == _bez_naglowka(przed)


def test_tolerancja_nn_strony_wtornej_trafia_do_transformatora(app_client) -> None:
    _, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.063)
    ladunek = {
        **_ladunek("PV", "dedykowany", False, "brak"),
        "block_transformer_lv_voltage_tolerance": "PLUS_6",
    }
    assert _kod(_operacja(app_client, case_id, "add_converter_source", ladunek)) is None
    model = _model(app_client, case_id)
    (generator,) = model["generators"]
    tr = next(
        t for t in model["transformers"] if t["ref_id"] == generator["blocking_transformer_ref"]
    )
    assert tr["lv_voltage_tolerance"] == "PLUS_6"


def test_pozycja_spoza_katalogu_trafo_odrzuca_brama(app_client) -> None:
    """Brama katalogowa sprawdza ISTNIENIE pozycji TRAFO_SN_NN (dawny identyfikator `btr_*`
    drugiego katalogu nie jest już pozycją)."""
    _, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.063)
    for ref in ("btr_pv_15_069_1250", "tr-ktorego-nie-ma"):
        ladunek = {
            **_ladunek("PV", "dedykowany", False, "brak"),
            "block_transformer_catalog_ref": ref,
        }
        odpowiedz = _operacja(app_client, case_id, "add_converter_source", ladunek)
        assert odpowiedz.status_code == 422, odpowiedz.text
        assert _model(app_client, case_id)["generators"] == []


def test_brama_i_operacja_jednym_predykatem_istniejacy_transformator(
    app_client,
) -> None:
    """Predykaty parami: przy wskazanym istniejącym transformatorze (`blocking_transformer_ref`)
    operacja nie materializuje transformatora z katalogu — i brama też nie bada pozycji.
    """
    from enm.domain_operations_v2 import tor_z_transformatorem_dedykowanym_z_katalogu

    baza = {
        "connection_variant": "block_transformer",
        "block_transformer_catalog_ref": "x",
    }
    assert tor_z_transformatorem_dedykowanym_z_katalogu(baza)
    assert tor_z_transformatorem_dedykowanym_z_katalogu(
        {**baza, "connection_variant": "DEDICATED_MV_CONNECTION"}
    )
    assert not tor_z_transformatorem_dedykowanym_z_katalogu(
        {**baza, "blocking_transformer_ref": "t"}
    )
    assert not tor_z_transformatorem_dedykowanym_z_katalogu(
        {**baza, "connection_variant": "nn_side"}
    )
    assert not tor_z_transformatorem_dedykowanym_z_katalogu(
        {**baza, "der_topology": {"connection_level": "sn"}}
    )

    _, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.63)
    odpowiedz = _operacja(
        app_client,
        case_id,
        "add_converter_source",
        {
            "source_technology": "PV",
            "connection_variant": "block_transformer",
            "station_ref": "station/1",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "power_setpoint_mw": 0.5,
            "blocking_transformer_ref": "station/1/tr",
            "block_transformer_catalog_ref": "pozycja-ignorowana",
        },
    )
    assert _kod(odpowiedz) is None, odpowiedz.text
    (generator,) = _model(app_client, case_id)["generators"]
    assert generator["blocking_transformer_ref"] == "station/1/tr"


def test_wariant_nn_ignoruje_pola_toru_dedykowanego(app_client) -> None:
    _, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)
    ladunek = {
        **_ladunek("PV", "nn_auto", False, "brak"),
        "block_transformer_catalog_ref": TR_1250,
    }
    assert _kod(_operacja(app_client, case_id, "add_converter_source", ladunek)) is None
    model = _model(app_client, case_id)
    assert len(model["transformers"]) == 1
    assert not model["generators"][0].get("blocking_transformer_ref")


@pytest.mark.parametrize(
    ("moc_mw", "zgodny", "niezgodny"),
    [(0.2, "B", "A"), (0.1999, "A", "B"), (0.0005, None, "A")],
)
def test_prog_klasyfikacji_modulu(app_client, moc_mw, zgodny, niezgodny) -> None:
    """Iloczyn: strona progu mocy × deklaracja {zgodna, niezgodna}; poniżej progu istotności
    moduł nie ma typu — każda deklaracja jest niezgodna."""
    _, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=1.5)

    def _zapis(modul: str):
        return _operacja(
            app_client,
            case_id,
            "add_converter_source",
            {
                **_ladunek("PV", "nn_auto", False, "brak"),
                "power_setpoint_mw": moc_mw,
                "nc_rfg_module": modul,
            },
        )

    odrzucony = _zapis(niezgodny)
    assert _kod(odrzucony) == "generator.nc_rfg_module_mismatch"
    if zgodny is None:
        assert "poniżej progu istotności" in odrzucony.json()["error"]
    else:
        assert _kod(_zapis(zgodny)) is None


def test_modul_toru_dedykowanego_klasyfikowany_wg_strony_sn(app_client) -> None:
    """Punkt przyłączenia toru dedykowanego to strona SN (15 kV), nie szyna urządzenia
    0,69 kV — o module 1 MW decyduje moc (typ B), deklaracja „C” jest niezgodna."""
    _, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.063)
    odpowiedz = _operacja(
        app_client,
        case_id,
        "add_converter_source",
        {**_ladunek("PV", "dedykowany", False, "brak"), "nc_rfg_module": "C"},
    )
    assert _kod(odpowiedz) == "generator.nc_rfg_module_mismatch"


def test_modul_toru_der_sn_tez_weryfikowany() -> None:
    """Tor DER-SN (`der_topology`) to ta sama operacja — ta sama weryfikacja deklaracji."""
    from enm.domain_operations_v2 import _odmowa_deklaracji_modulu_ncrfg

    assert _odmowa_deklaracji_modulu_ncrfg({}, 1.0, 15.0) is None
    assert _odmowa_deklaracji_modulu_ncrfg({"nc_rfg_module": "B"}, 1.0, 15.0) is None
    odmowa = _odmowa_deklaracji_modulu_ncrfg({"nc_rfg_module": "C"}, 1.0, 15.0)
    assert odmowa is not None and odmowa["error_code"] == "generator.nc_rfg_module_mismatch"
    # Brak napięcia punktu przyłączenia: nie ma z czym porównać — bez domysłu, bez blokady.
    assert _odmowa_deklaracji_modulu_ncrfg({"nc_rfg_module": "C"}, 1.0, None) is None
    nieklasyfikowalny = _odmowa_deklaracji_modulu_ncrfg({"nc_rfg_module": "B"}, -1.0, 15.0)
    assert nieklasyfikowalny is not None
    assert nieklasyfikowalny["error_code"] == "generator.nc_rfg_module_unclassifiable"


class TestBateriaBess:
    """Pakiet baterii: obecność pola × rodzaj źródła × istnienie w katalogu."""

    def test_pakiet_materializowany(self, app_client) -> None:
        _, case_id = _create_project_and_case(app_client)
        _seed_station_enm(case_id)
        assert (
            _kod(
                _operacja(
                    app_client,
                    case_id,
                    "add_converter_source",
                    _ladunek("BESS", "nn_auto", False, "brak"),
                )
            )
            is None
        )
        params = _model(app_client, case_id)["generators"][0]["materialized_params"]
        assert params["battery_catalog_ref"] == BATERIA
        assert params["battery"]["capacity_kwh"] == 2880.0
        assert params["battery"]["chemistry"] == "LFP"

    @pytest.mark.parametrize(
        ("rodzaj", "ref", "kod"),
        [
            (
                "BESS",
                "bess_bat_ktorego_nie_ma",
                "converter.battery_catalog_ref_unknown",
            ),
            ("PV", BATERIA, "converter.battery_catalog_not_applicable"),
        ],
    )
    def test_odmowy(self, app_client, rodzaj, ref, kod) -> None:
        _, case_id = _create_project_and_case(app_client)
        _seed_station_enm(case_id)
        ladunek = {
            **_ladunek(rodzaj, "nn_auto", False, "brak"),
            "battery_catalog_ref": ref,
        }
        assert _kod(_operacja(app_client, case_id, "add_converter_source", ladunek)) == kod
        assert _model(app_client, case_id)["generators"] == []

    def test_pominiety_nie_blokuje(self, app_client) -> None:
        _, case_id = _create_project_and_case(app_client)
        _seed_station_enm(case_id)
        assert (
            _kod(
                _operacja(
                    app_client,
                    case_id,
                    "add_converter_source",
                    _ladunek("BESS", "nn_jawna", False, "brak"),
                )
            )
            is None
        )
        assert (
            "battery_catalog_ref"
            not in _model(app_client, case_id)["generators"][0]["materialized_params"]
        )


def test_zapis_trafia_do_dziennika_zmian_i_daje_rewizje_do_cofniecia(
    app_client,
) -> None:
    """Dawna końcówka zapisywała model z pominięciem dziennika: zapis bez przyczyny i bez
    utworzonych elementów toru. Teraz wpis niesie operację, pełny ładunek i transformator
    oraz szynę urządzenia; rewizja sprzed zapisu jest odczytywalna (cofnięcie)."""
    _, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.063)
    rewizja_przed = _model(app_client, case_id)["header"]["revision"]
    ladunek = _ladunek("PV", "dedykowany", False, "brak")
    odpowiedz = _operacja(app_client, case_id, "add_converter_source", ladunek)
    assert _kod(odpowiedz) is None

    dziennik = app_client.get(
        f"/api/cases/{case_id}/enm/dziennik-zmian?od_rewizji={rewizja_przed}"
    ).json()
    # Pierwszy wpis po zapisie to operacja; kolejny (`operacja: null`) to automigracja
    # promocji pola nN przy następnym odczycie magazynu (`enm.store.przygotuj_model_po_odczycie`).
    wpis = dziennik["wpisy"][0]
    assert wpis["operacja"] == "add_converter_source"
    assert wpis["ladunek"] == ladunek
    utworzone = set(wpis["utworzone"])
    assert set(odpowiedz.json()["changes"]["created_element_ids"]) == utworzone
    assert any(ref.endswith("/tr-block") for ref in utworzone)

    poprzednia = app_client.get(f"/api/cases/{case_id}/enm/rewizje/{rewizja_przed}")
    assert poprzednia.status_code == 200, poprzednia.text
    assert poprzednia.json()["snapshot"]["generators"] == []


# ---------------------------------------------------------------------------
# Wiązania wytwórcy — ta sama droga (operacja `set_der_catalog_bindings`)
# ---------------------------------------------------------------------------


def _wytworca(app_client) -> tuple[str, str]:
    _, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)
    odpowiedz = _operacja(
        app_client,
        case_id,
        "add_converter_source",
        _ladunek("PV", "nn_auto", False, "brak"),
    )
    assert _kod(odpowiedz) is None
    return case_id, _model(app_client, case_id)["generators"][0]["ref_id"]


def _wiazania(app_client, case_id: str, ref: str, pola: dict):
    return _operacja(
        app_client, case_id, "set_der_catalog_bindings", {"generator_ref": ref, **pola}
    )


def _params(app_client, case_id: str) -> dict:
    return _model(app_client, case_id)["generators"][0].get("materialized_params") or {}


def test_wiazania_trafiaja_do_modelu(app_client) -> None:
    case_id, ref = _wytworca(app_client)
    odpowiedz = _wiazania(
        app_client,
        case_id,
        ref,
        {
            "protection_catalog_ref": "REF-OC-200",
            "ct_catalog_ref": "ct_200_5_5p10_10va_abb",
            "vt_catalog_ref": "vt_10kv_100v_05_abb",
            "dynamic_model_ref": "default_pv_gfl",
            "nc_rfg_profile_ref": "pse",
            "bess_operation_mode_refs": ["mode_peak_shaving", "mode_self_consumption"],
        },
    )
    assert _kod(odpowiedz) is None, odpowiedz.text
    params = _params(app_client, case_id)
    assert params["protection_catalog_ref"] == "REF-OC-200"
    assert params["ct_catalog_ref"] == "ct_200_5_5p10_10va_abb"
    assert params["vt_catalog_ref"] == "vt_10kv_100v_05_abb"
    assert params["dynamic_model_ref"] == "default_pv_gfl"
    assert params["profiles"]["nc_rfg_profile_ref"] == "pse"
    assert params["profiles"]["bess_operation_mode_refs"] == [
        "mode_peak_shaving",
        "mode_self_consumption",
    ]


def test_wiazania_biale_znaki_to_brak_wyboru(app_client) -> None:
    """Normalizacja dawnej końcówki wiązań żyje w operacji: napis z samych białych znaków
    usuwa wiązanie, otaczające spacje znikają, puste elementy listy trybów odpadają."""
    case_id, ref = _wytworca(app_client)
    assert (
        _kod(
            _wiazania(
                app_client,
                case_id,
                ref,
                {"ct_catalog_ref": "  ct_150_1_0_5_10va_abb  "},
            )
        )
        is None
    )
    assert _params(app_client, case_id)["ct_catalog_ref"] == "ct_150_1_0_5_10va_abb"
    assert (
        _kod(
            _wiazania(
                app_client,
                case_id,
                ref,
                {"bess_operation_mode_refs": [" mode_peak_shaving ", "  "]},
            )
        )
        is None
    )
    assert _params(app_client, case_id)["profiles"]["bess_operation_mode_refs"] == [
        "mode_peak_shaving"
    ]
    assert _kod(_wiazania(app_client, case_id, ref, {"ct_catalog_ref": "   "})) is None
    assert "ct_catalog_ref" not in _params(app_client, case_id)


def test_wiazania_pominiete_zostaja_null_usuwa(app_client) -> None:
    case_id, ref = _wytworca(app_client)
    assert (
        _kod(_wiazania(app_client, case_id, ref, {"ct_catalog_ref": "ct_150_1_0_5_10va_abb"}))
        is None
    )
    assert (
        _kod(_wiazania(app_client, case_id, ref, {"vt_catalog_ref": "vt_10kv_100v_05_abb"})) is None
    )
    assert _params(app_client, case_id)["ct_catalog_ref"] == "ct_150_1_0_5_10va_abb"
    assert _kod(_wiazania(app_client, case_id, ref, {"ct_catalog_ref": None})) is None
    params = _params(app_client, case_id)
    assert "ct_catalog_ref" not in params
    assert params["vt_catalog_ref"] == "vt_10kv_100v_05_abb"


def test_wiazania_odmowy(app_client) -> None:
    case_id, ref = _wytworca(app_client)
    nieznany = _wiazania(
        app_client,
        case_id,
        ref,
        {"bess_operation_mode_refs": ["mode_peak_shaving", "mode_NIE_MA"]},
    )
    assert _kod(nieznany) is not None
    assert "profiles" not in _params(app_client, case_id)
    assert (
        _kod(
            _wiazania(
                app_client,
                case_id,
                "gen_nie_ma",
                {"ct_catalog_ref": "ct_150_1_0_5_10va_abb"},
            )
        )
        is not None
    )
    assert _kod(_wiazania(app_client, case_id, ref, {})) == "der_bindings.payload_empty"


@pytest.mark.parametrize("operacja", ["add_converter_source", "set_der_catalog_bindings"])
@pytest.mark.parametrize("typ", ["OSError", "ValidationError"])
def test_awaria_zapisu_modelu_jest_nazwana_i_model_bez_zmian(
    app_client, monkeypatch, operacja, typ
) -> None:
    import api.enm as modul

    case_id, ref = _wytworca(app_client)
    if operacja == "add_converter_source":
        # Drugie źródło 0,5 MW wymaga transformatora stacji o mocy pokrywającej oba (O-53).
        _seed_station_enm(case_id, transformer_sn_mva=1.6)
    przed = _model(app_client, case_id)

    def _awaria(klucz, enm, **kwargs):
        if typ == "OSError":
            raise OSError(28, "No space left on device")
        from enm.models import EnergyNetworkModel

        EnergyNetworkModel.model_validate({"header": "zly"})

    monkeypatch.setattr(modul, "_set_enm", _awaria)
    if operacja == "add_converter_source":
        odpowiedz = _operacja(
            app_client,
            case_id,
            operacja,
            {**_ladunek("PV", "nn_auto", False, "brak"), "source_name": "drugi"},
        )
    else:
        odpowiedz = _wiazania(app_client, case_id, ref, {"protection_catalog_ref": "REF-OC-200"})
    assert _kod(odpowiedz) == "api.snapshot_validation_failed"
    monkeypatch.undo()
    assert _model(app_client, case_id) == przed


# ---------------------------------------------------------------------------
# Odczyt pozycji transformatora dedykowanego: tożsamość z modelu, nie z wytwórcy
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("rodzaj", "wariant"),
    [
        ("PV", "dedykowany"),
        ("BESS", "dedykowany"),
        ("PV", "nn_auto"),
        ("FW", "nn_auto"),
    ],
)
def test_gotowosc_widzi_transformator_dedykowany_z_modelu(app_client, rodzaj, wariant) -> None:
    """Oś „aparatura" gotowości czyta pozycję katalogu transformatora dedykowanego z JEGO
    rekordu w modelu (`Transformer.catalog_ref` przez `blocking_transformer_ref`).

    DEFEKT, KTÓRY TEN TEST ZAMYKA: reguła czytała `block_transformer_catalog_ref` z
    `materialized_params`/`meta` WYTWÓRCY, czego żadna operacja nie zapisuje (ani dawna
    końcówka `POST …/generators`, ani `add_converter_source`) — każdy wytwórca z
    transformatorem dedykowanym dostawał „Brak transformatora dedykowanego (z katalogu)",
    choć transformator z katalogu stał w modelu. Iloczyn: rodzaj {PV, BESS} × tor
    dedykowany oraz tor nN (bez transformatora dedykowanego — oś tej blokady nie zna).
    """
    moc_tr, _ = _ZRODLA[(rodzaj, wariant)]
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=moc_tr)
    odpowiedz = _operacja(
        app_client,
        case_id,
        "add_converter_source",
        _ladunek(rodzaj, wariant, False, "brak"),
    )
    assert _kod(odpowiedz) is None, odpowiedz.json().get("error")
    (generator,) = odpowiedz.json()["snapshot"]["generators"]

    gotowosc = app_client.get(
        f"/api/projects/{project_id}/cases/{case_id}/generators/{generator['ref_id']}/readiness"
    )
    assert gotowosc.status_code == 200, gotowosc.text
    aparatura = next(o for o in gotowosc.json()["osie"] if o["axis"] == "equipment")
    kody = {b["code"] for b in aparatura["blockers"]}
    assert "der.dedicated_trafo.missing" not in kody, aparatura
    if wariant == "dedykowany":
        assert generator["connection_variant"] == "block_transformer"


def test_gotowosc_nazywa_brak_gdy_transformator_dedykowany_bez_pozycji_katalogu(
    app_client,
) -> None:
    """Para do testu wyżej: transformator dedykowany w modelu BEZ `catalog_ref` (wpisany
    ręcznie) — blokada nazwana, nie zgoda. Ta sama funkcja odczytu dla obu przypadków.
    """
    from enm.models import EnergyNetworkModel
    from enm.store import get_enm, set_enm

    from tests.test_execution_api import _klucz_modelu

    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.063)
    odpowiedz = _operacja(
        app_client,
        case_id,
        "add_converter_source",
        _ladunek("PV", "dedykowany", False, "brak"),
    )
    assert _kod(odpowiedz) is None
    (generator,) = odpowiedz.json()["snapshot"]["generators"]
    klucz = _klucz_modelu(case_id)
    model = get_enm(klucz).model_dump(mode="json")
    for tr in model["transformers"]:
        if tr["ref_id"] == generator["blocking_transformer_ref"]:
            tr["catalog_ref"] = None
    set_enm(klucz, EnergyNetworkModel.model_validate(model))

    gotowosc = app_client.get(
        f"/api/projects/{project_id}/cases/{case_id}/generators/{generator['ref_id']}/readiness"
    )
    aparatura = next(o for o in gotowosc.json()["osie"] if o["axis"] == "equipment")
    assert "der.dedicated_trafo.missing" in {b["code"] for b in aparatura["blockers"]}


#: Próg 87T z podstawą — dana TESTU (żaden profil operatora w repo nie niesie progu,
#: `prog_87t_sn_transformatora: null`). Podmienia odczyt profilu w końcówce, żeby przejść
#: produkcyjną drogę: profil wskazany przez wytwórcę → próg → predykat doboru i gotowości.
def _profil_z_progiem(prog_kva: float):
    from catalog.profiles.nc_rfg import load_nc_rfg_profile
    from werdykt.kontrakt import LimitKryterium, PodstawaWymagania, Wielkosc

    prog = LimitKryterium(
        wartosc=Wielkosc(wartosc=prog_kva, jednostka="kVA"),
        podstawa=PodstawaWymagania(
            rodzaj="OSD",
            dokument="IRiESD testowa",
            wydanie="1",
            jednostka_redakcyjna="pkt 87 (test)",
            status="WSKAZANE",
        ),
    )
    return load_nc_rfg_profile("pse").model_copy(update={"prog_87t_sn_transformatora": prog})


@pytest.mark.parametrize(
    ("profil", "status", "wymagane_87t"),
    [
        ("brak", "BRAK_PODSTAWY", False),
        ("bez_progu", "BRAK_PODSTAWY", False),
        ("prog_ponizej_sn", "SPELNIA", True),
        ("prog_powyzej_sn", "NIE_DOTYCZY", False),
    ],
)
def test_prog_87t_z_profilu_operatora_wytworcy(
    app_client, monkeypatch, profil: str, status: str, wymagane_87t: bool
) -> None:
    """Iloczyn: profil operatora {niewskazany, bez progu, próg < S_n, próg > S_n} × końcówki
    {dobór funkcji, gotowość}. S_n transformatora dedykowanego = 1250 kVA (pozycja TR_1250),
    moc źródła 1000 kW — próg 1100 kVA leży między nimi, więc pomylenie podmiotu (moc
    źródła zamiast S_n) odwróciłoby wynik.
    """
    import api.generators as modul_api

    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.063)
    odpowiedz = _operacja(
        app_client,
        case_id,
        "add_converter_source",
        _ladunek("PV", "dedykowany", False, "brak"),
    )
    assert _kod(odpowiedz) is None, odpowiedz.text
    ref = _model(app_client, case_id)["generators"][0]["ref_id"]
    wiazania: dict = {"ct_catalog_ref": "ct_200_5_5p10_10va_abb"}
    if profil != "brak":
        wiazania["nc_rfg_profile_ref"] = "pse"
    assert _kod(_wiazania(app_client, case_id, ref, wiazania)) is None
    if profil == "prog_ponizej_sn":
        monkeypatch.setattr(modul_api, "load_nc_rfg_profile", lambda _: _profil_z_progiem(1100.0))
    elif profil == "prog_powyzej_sn":
        monkeypatch.setattr(modul_api, "load_nc_rfg_profile", lambda _: _profil_z_progiem(2000.0))

    baza = f"/api/projects/{project_id}/cases/{case_id}/generators/{ref}"
    dobor = app_client.get(f"{baza}/protection-functions")
    assert dobor.status_code == 200, dobor.text
    (ocena,) = dobor.json()["dobor"]["oceny_progow"]
    assert ocena["status_maszynowy"] == status
    assert ocena["wartosc"] == {"wartosc": 1250.0, "jednostka": "kVA"}
    assert ocena["wyjasnienie"]["zdanie_pl"] == ocena["wyjasnienie_pl"]
    kody = [f["kod"] for f in dobor.json()["dobor"]["wymagane"]]
    assert ("87T" in kody) is wymagane_87t
    if profil == "brak":
        assert "nie wskazuje profilu NC RfG operatora" in ocena["wyjasnienie_pl"]
    elif profil == "bez_progu":
        from catalog.profiles.nc_rfg import load_nc_rfg_profile

        assert ocena["limit"] is None
        assert load_nc_rfg_profile("pse").operator_name_pl in ocena["wyjasnienie_pl"]
    else:
        assert ocena["limit"]["podstawa"]["jednostka_redakcyjna"] == "pkt 87 (test)"
        assert "IRiESD testowa, pkt 87 (test)" in ocena["wyjasnienie_pl"]

    gotowosc = app_client.get(f"{baza}/readiness")
    assert gotowosc.status_code == 200, gotowosc.text
    ochrona = next(o for o in gotowosc.json()["osie"] if o["axis"] == "protection")
    kody_blokad = {b["code"] for b in ochrona["blockers"]}
    assert ("der.ct_87t_dual_core.required" in kody_blokad) is wymagane_87t


def test_prog_87t_profil_spoza_katalogu_nazwany() -> None:
    from api.generators import _prog_87t_operatora

    prog, opis = _prog_87t_operatora(
        {"materialized_params": {"profiles": {"nc_rfg_profile_ref": "operator_nieznany"}}}
    )
    assert prog is None
    assert opis is not None and "operator_nieznany" in opis
    assert _prog_87t_operatora({"materialized_params": {}}) == (None, None)
    prog_pse, nazwa_pse = _prog_87t_operatora(
        {"materialized_params": {"profiles": {"nc_rfg_profile_ref": "pse"}}}
    )
    assert prog_pse is None and nazwa_pse
