"""Kontrakt `resultset_dynamic_v2` — schemat przypiety, pola scisle, dziedzina z mapy.

Karta AB-1b.1 par. 0 pkt 14: v2 zamiast rozszerzenia v1, bo zmiany nie sa addytywne
(probka `None`, powtorzone chwile osi z `strona_probki`). Testy przypinaja trzy
deklaracje modulu kontraktu, ktore bez testu bylyby obietnica:

1. schemat JSON w `backend/schemas/resultset_dynamic_v2_schema.json` jest DOKLADNIE
   schematem modelu (zmiana modelu bez regeneracji schematu wywraca test);
2. model odrzuca pola nieznane i niespojne dlugosci osi/strony/szeregow;
3. dziedzina fizyki pochodzi z jednej mapy produktu (`dziedziny.dziedzina_analizy`),
   a inna wartosc jest odrzucana.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from application.contracts.resultset_dynamic_v2 import (
    RODZAJ_ANALIZY_DYNAMIKI,
    ResultSetDynamicV2,
    dziedzina_fizyki_dynamiki,
    zbuduj_resultset_dynamiczny_v2,
)
from dziedziny import MAPA_DZIEDZIN
from pydantic import ValidationError

SCIEZKA_SCHEMATU = (
    Path(__file__).resolve().parents[2] / "schemas" / "resultset_dynamic_v2_schema.json"
)


def _ladunek(**zmiany: Any) -> dict[str, Any]:
    ladunek: dict[str, Any] = {
        "run_id": "bieg-1",
        "dziedzina_fizyki": list(dziedzina_fizyki_dynamiki()),
        "kanaly": [
            {
                "klucz": "f_hz@b1",
                "przestrzen": "obserwabla",
                "jednostka": "Hz",
                "element_ref": "b1",
                "opis_pl": "Czestotliwosc wezla b1",
            }
        ],
        "os_czasu_s": [0.0, 0.1, 0.1, 0.2],
        "strona_probki": ["C", "L", "P", "C"],
        "probki": {"f_hz@b1": [50.0, None, None, 49.9]},
        "wlasnosci_biegu": {
            "zbiegl": True,
            "kroki": 10,
            "kroki_odrzucone": 0,
            "max_residuum_f": 0.0,
            "max_residuum_g": 1e-12,
            "czas_obliczen_s": 0.01,
            "integrator": "trapez",
            "dt_s": 0.01,
            "tolerancja": 1e-8,
        },
        "tozsamosc": {
            "odcisk_migawki": "a",
            "odcisk_punktu_pracy": "b",
            "odcisk_nastaw_solvera": "c",
            "odcisk_harmonogramu": "d",
            "odcisk_implementacji": "e",
            "wersja_solvera": "DYNAMIKA_RMS_DAE_V1",
        },
    }
    ladunek.update(zmiany)
    return ladunek


def test_schemat_json_jest_dokladnie_schematem_modelu() -> None:
    zapisany = json.loads(SCIEZKA_SCHEMATU.read_text(encoding="utf-8"))
    assert zapisany == ResultSetDynamicV2.model_json_schema(), (
        "schemat kontraktu rozjechal sie z modelem — zregeneruj "
        "backend/schemas/resultset_dynamic_v2_schema.json z ResultSetDynamicV2"
    )
    assert zapisany["additionalProperties"] is False
    assert set(zapisany["required"]) >= {"run_id", "dziedzina_fizyki"}


def test_probka_None_przechodzi_nietknieta_do_serializacji() -> None:
    wynik = ResultSetDynamicV2.model_validate(_ladunek())
    zserializowany = zbuduj_resultset_dynamiczny_v2(wynik, z_probkami=True)
    assert zserializowany["probki"]["f_hz@b1"] == [50.0, None, None, 49.9]
    assert zserializowany["strona_probki"] == ["C", "L", "P", "C"]
    assert zserializowany["kontrakt"] == "resultset_dynamic_v2"


@pytest.mark.parametrize(
    "zmiany",
    [
        {"strona_probki": ["C", "L", "P"]},
        {"probki": {"f_hz@b1": [50.0, None, 49.9]}},
        {"strona_probki": ["C", "L", "X", "C"]},
        {"pole_nieznane": 1},
        {"dziedzina_fizyki": ["POWER_FLOW"]},
        {"dziedzina_fizyki": ["RMS_DYNAMICS", "POWER_FLOW"]},
    ],
    ids=[
        "strona_krotsza",
        "szereg_krotszy",
        "strona_spoza_zbioru",
        "pole_nieznane",
        "dziedzina_inna",
        "dziedzina_nadmiarowa",
    ],
)
def test_kontrakt_odrzuca_niespojnosc(zmiany: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        ResultSetDynamicV2.model_validate(_ladunek(**zmiany))


def test_dziedzina_fizyki_wyprowadzona_z_mapy_produktu() -> None:
    assert dziedzina_fizyki_dynamiki() == MAPA_DZIEDZIN[RODZAJ_ANALIZY_DYNAMIKI]
    assert dziedzina_fizyki_dynamiki() == ("RMS_DYNAMICS",)
