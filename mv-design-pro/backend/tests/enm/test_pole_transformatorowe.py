"""Predykat „transformator bez pola transformatorowego SN" — karta KOMPLETNOSC-POLA-TR.

Testy chodzą po WSPÓLNEJ tablicy decyzyjnej
`backend/schemas/pole_transformatorowe_parytet_v1.json` — tej samej, którą czyta
vitest rysunku (`frontend/src/ui/sld/v3/layout/__tests__/parytetPolaTr.test.ts`).
Rozjazd predykatu bramki i predykatu markera wywraca test po OBU stronach.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from application.dokumentacja_wykonawcza import ocen_gotowosc_dokumentacji_wykonawczej
from domain.canonical_operations import READINESS_CODES, ReadinessLevel
from domain.readiness_bridge import ODWZOROWANIE_WALIDATOR_NA_KANON, opis_kanoniczny
from enm.models import EnergyNetworkModel
from enm.pole_transformatorowe import (
    PASMO_NN_MAX_KV,
    PASMO_SN_MAX_KV,
    pasmo_napieciowe,
    transformatory_bez_pola_sn,
)
from enm.validator import ENMValidator

TABLICA_PARYTETU = (
    Path(__file__).resolve().parents[2] / "schemas" / "pole_transformatorowe_parytet_v1.json"
)


def _wiersze_tablicy() -> list[dict[str, Any]]:
    dane = json.loads(TABLICA_PARYTETU.read_text(encoding="utf-8"))
    return list(dane["wiersze"])


def _migawka_z_wiersza(wiersz: dict[str, Any]) -> dict[str, Any]:
    """Migawka ENM ODWZOROWUJĄCA wiersz tablicy — bez żadnych dodatków.

    Kształt minimalny i JAWNY: co wiersz deklaruje, to migawka niesie. Dzięki
    temu czerwony test wskazuje na regułę, a nie na przypadkowy element
    fixture'u.
    """
    stacja = wiersz["stacja"]
    buses: list[dict[str, Any]] = [
        {"ref_id": "bus-sn", "name": "Szyna SN", "voltage_kv": stacja["sn_bus_kv"]}
    ]
    bus_refs = ["bus-sn"]
    if stacja["nn_bus_kv"] is not None:
        buses.append({"ref_id": "bus-nn", "name": "Szyna nN", "voltage_kv": stacja["nn_bus_kv"]})
        bus_refs.append("bus-nn")

    field_specs = [
        {
            "field_ref": f"pole-{index:03d}",
            "name": f"Pole {rola}",
            "bay_role": rola,
            "bus_ref": "bus-sn",
        }
        for index, rola in enumerate(stacja["role_pol"])
    ]

    transformers: list[dict[str, Any]] = []
    generators: list[dict[str, Any]] = []
    transformer_refs: list[str] = []
    opis_tr = wiersz["transformator"]
    if opis_tr is not None:
        mapa_szyn = {"sn": "bus-sn", "nn": "bus-nn", "obca": None}
        hv = mapa_szyn[opis_tr["hv"]] or "bus-der-sn"
        lv = mapa_szyn[opis_tr["lv"]] or "bus-der-nn"
        if hv == "bus-der-sn":
            buses.append({"ref_id": hv, "name": "Szyna przyłączeniowa DER", "voltage_kv": 15.0})
        if lv == "bus-der-nn":
            buses.append({"ref_id": lv, "name": "Szyna producenta", "voltage_kv": 0.8})
        transformers.append(
            {
                "ref_id": "tr-1",
                "name": "Transformator",
                "hv_bus_ref": hv,
                "lv_bus_ref": lv,
                "sn_mva": 0.63,
                "uhv_kv": 15.0,
                "ulv_kv": 0.4,
                "uk_percent": 6.0,
                "pk_kw": 6.5,
            }
        )
        if stacja["deklaruje_transformator"]:
            transformer_refs.append("tr-1")
        if opis_tr.get("blokowy_der"):
            generators.append(
                {
                    "ref_id": "gen-pv",
                    "name": "PV",
                    "bus_ref": lv,
                    "gen_type": "pv_inverter",
                    "p_mw": 0.4,
                    "blocking_transformer_ref": "tr-1",
                }
            )

    return {
        "buses": buses,
        "transformers": transformers,
        "generators": generators,
        "bays": [],
        "substations": [
            {
                "ref_id": "stn-1",
                "name": "Stacja testowa",
                "station_type": "mv_lv",
                "bus_refs": bus_refs,
                "transformer_refs": transformer_refs,
                "meta": {"field_specs": field_specs},
            }
        ],
    }


@pytest.mark.parametrize("wiersz", _wiersze_tablicy(), ids=lambda w: w["id"])
def test_predykat_zgodny_z_tablica_parytetu(wiersz: dict[str, Any]) -> None:
    """Predykat backendu odpowiada DOKŁADNIE tak, jak deklaruje wspólna tablica."""
    znaleziska = transformatory_bez_pola_sn(_migawka_z_wiersza(wiersz))
    assert bool(znaleziska) is wiersz["oczekiwane_znalezisko"], wiersz["opis_pl"]
    if wiersz["oczekiwane_znalezisko"]:
        assert znaleziska[0].transformer_ref == "tr-1"
        assert znaleziska[0].station_ref == "stn-1"
        assert znaleziska[0].hv_bus_ref == "bus-sn"


def test_tablica_parytetu_pokrywa_iloczyn_cech() -> None:
    """Tablica MUSI nieść pełny iloczyn cech wymagany kartą (§0 pkt 4).

    Deklaracja bez testu byłaby fałszywą pewnością: gdyby ktoś usunął z tablicy
    wiersz „pola TR nie ma", obie strony parytetu nadal byłyby zielone, a
    najważniejszy przypadek przestałby być sprawdzany.
    """
    wiersze = _wiersze_tablicy()
    cechy = {(w["cecha_pole_tr"], w["cecha_transformator"]) for w in wiersze}
    assert ("jest", "jest") in cechy
    assert ("brak", "jest") in cechy
    assert ("jest", "brak") in cechy
    assert ("brak", "brak") in cechy
    # Werdykty muszą być obu rodzajów — tablica z samymi „false" przechodziłaby
    # przy predykacie, który nigdy niczego nie zgłasza.
    werdykty = {w["oczekiwane_znalezisko"] for w in wiersze}
    assert werdykty == {True, False}


def test_pole_tr_w_rekordzie_bay_tez_domyka_konfiguracje() -> None:
    """Kanał `Bay.bay_role` (operacja `add_sn_bay`) liczy się tak samo jak field_specs.

    Adapter rysunku czyta OBA kanały — predykat, który zna tylko jeden, zapaliłby
    ostrzeżenie dla stacji, na której marker już zgasł (albo odwrotnie).
    """
    migawka = _migawka_z_wiersza(
        {
            "stacja": {
                "sn_bus_kv": 15.0,
                "nn_bus_kv": 0.4,
                "role_pol": ["IN", "OUT"],
                "deklaruje_transformator": True,
            },
            "transformator": {"hv": "sn", "lv": "nn"},
        }
    )
    assert transformatory_bez_pola_sn(migawka), "bez pola TR luka MUSI być zgłoszona"

    migawka["bays"] = [
        {
            "ref_id": "bay-tr",
            "name": "Pole transformatorowe",
            "bay_role": "TR",
            "substation_ref": "stn-1",
            "bus_ref": "bus-sn",
        }
    ]
    assert not transformatory_bez_pola_sn(migawka), "pole TR w `bays[]` domyka konfigurację"


def test_walidator_zglasza_w041_jako_ostrzezenie_a_nie_blokade() -> None:
    """W041 nie może blokować obliczeń (karta: „NIE blokuje obliczeń")."""
    migawka = _migawka_z_wiersza(
        {
            "stacja": {
                "sn_bus_kv": 15.0,
                "nn_bus_kv": 0.4,
                "role_pol": ["IN", "OUT"],
                "deklaruje_transformator": True,
            },
            "transformator": {"hv": "sn", "lv": "nn"},
        }
    )
    migawka["header"] = {"name": "test"}
    enm = EnergyNetworkModel.model_validate(migawka)
    wynik = ENMValidator().validate(enm)

    zgloszenia = [i for i in wynik.issues if i.code == "W041"]
    assert len(zgloszenia) == 1
    assert zgloszenia[0].severity == "IMPORTANT"
    assert "nie posiada kompletnej konfiguracji pola" in zgloszenia[0].message_pl
    assert zgloszenia[0].element_refs == ["tr-1", "stn-1"]

    gotowosc = ENMValidator().readiness(wynik)
    assert all(blocker.code != "W041" for blocker in gotowosc.blockers)


def test_w041_ma_kanoniczna_tresc_ostrzezenia() -> None:
    """Most kanonu: W041 → `transformer.bay_missing` (poziom WARNING)."""
    assert ODWZOROWANIE_WALIDATOR_NA_KANON["W041"] == "transformer.bay_missing"
    assert READINESS_CODES["transformer.bay_missing"].level is ReadinessLevel.WARNING
    kanon = opis_kanoniczny("W041")
    assert kanon is not None
    assert kanon["canonical_code"] == "transformer.bay_missing"
    assert kanon["canonical_level"] == "WARNING"


def test_pasma_napieciowe_maja_jedno_zrodlo() -> None:
    """Walidator i predykat pytają o TO SAMO pasmo (regula KLASA §3)."""
    from enm import validator as modul_walidatora

    assert modul_walidatora._VOLTAGE_BAND_NN_MAX == PASMO_NN_MAX_KV
    assert modul_walidatora._VOLTAGE_BAND_SN_MAX == PASMO_SN_MAX_KV
    assert modul_walidatora._voltage_band is pasmo_napieciowe
    assert pasmo_napieciowe(0.4) == "nN"
    assert pasmo_napieciowe(15.0) == "SN"
    assert pasmo_napieciowe(110.0) == "WN"


@pytest.mark.parametrize("wiersz", _wiersze_tablicy(), ids=lambda w: w["id"])
def test_brama_dokumentacji_wykonawczej_idzie_za_predykatem(wiersz: dict[str, Any]) -> None:
    """T10: brak pola TR ⇒ projekt NIE jest gotowy do dokumentacji wykonawczej."""
    werdykt = ocen_gotowosc_dokumentacji_wykonawczej(_migawka_z_wiersza(wiersz))
    assert werdykt.gotowy is (not wiersz["oczekiwane_znalezisko"]), wiersz["opis_pl"]
    if not werdykt.gotowy:
        assert werdykt.blokady[0].code == "transformer.bay_missing"
        assert werdykt.blokady[0].element_refs == ("tr-1", "stn-1")
