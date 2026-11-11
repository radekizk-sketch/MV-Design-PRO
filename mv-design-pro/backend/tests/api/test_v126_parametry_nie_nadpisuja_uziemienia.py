"""Parametry biegu V12.6 nie nadpisują uziemienia z modelu — odmowa nazwana, nigdy cicha.

Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 4: sposób uziemienia punktu neutralnego sieci SN
wynika wyłącznie z modelu (zespół uziemiający albo punkt neutralny uzwojenia). Parametr
projektanta, który próbuje go podać, jest odmową danych (`OdmowaDanychError` → 422) z polskim
zdaniem nazywającym parametr; wiersz koordynacji izolacji dostaje kategorię przepięć
dorywczych z modelu.

ILOCZYN CECH: {klucz nadpisania: ``neutral_grounding``, ``neutral_earthing_type``,
``insulation[].network_neutral``} × {model z zespołem, bez zespołu} oraz wiersz izolacji ×
{szyna z modelu z zespołem, szyna spoza modelu, wiersz niezgodny z kontraktem}.
"""

from __future__ import annotations

from typing import Any

import pytest
from api.v126_academic import _with_parameter_payloads
from enm.models import EnergyNetworkModel
from network_model.odmowa_danych import OdmowaDanychError
from solver_input.v126_contracts import build_v126_input_from_enm

from tests.cgmes.golden_enm import build_golden_enm
from tests.utils.zespol_uziemiajacy import z_zespolem as _z_zespolem

_SZYNA_SN = "bus_sn_main"
_WIERSZ_IZOLACJI: dict[str, Any] = {"location_bus_ref": _SZYNA_SN, "u_m_kv": 17.5}


def _siec(z_zespolem: bool, element: str = "dlawik") -> EnergyNetworkModel:
    """Sieć złota z zespołem uziemiającym (transformator ZNyn11 z dławikiem gaszącym albo
    rezystorem w punkcie neutralnym — operacja produktu) na szynie SN albo bez zespołu."""
    enm = build_golden_enm().model_copy(deep=True)
    if not z_zespolem:
        return enm
    u_kv = next(b.voltage_kv for b in enm.buses if b.ref_id == _SZYNA_SN)
    return _z_zespolem(
        enm,
        "zu_gpz",
        _SZYNA_SN,
        wariant="dlawik" if element == "dlawik" else "rezystor",
        u_kv=u_kv,
        i_nastawy_a=100.0 if element == "dlawik" else None,
        name="Zespół uziemiający GPZ",
    )


def _z_parametrami(enm: EnergyNetworkModel, parametry: dict[str, Any]):
    return _with_parameter_payloads(build_v126_input_from_enm(enm, parameters={}), parametry, enm)


@pytest.mark.parametrize("z_zespolem", [True, False], ids=["z-zespolem", "bez-zespolu"])
@pytest.mark.parametrize(
    ("parametry", "fraza"),
    [
        ({"neutral_grounding": "solid"}, "„neutral_grounding” nie jest przyjmowany"),
        ({"neutral_earthing_type": "resistor"}, "„neutral_earthing_type” nie jest przyjmowany"),
        # Wiersz koordynacji izolacji: odmowa nazywa parametr słowami (karta BKR — komunikat
        # bez klucza pola); każdy z trzech odrzucanych kluczy wiersza ma swój przypadek.
        (
            {"insulation": [{**_WIERSZ_IZOLACJI, "network_neutral": "earthed"}]},
            "„sposób uziemienia sieci” podany w wierszu nie jest przyjmowany",
        ),
        (
            {"insulation": [{**_WIERSZ_IZOLACJI, "earth_fault_factor": 1.0}]},
            "„współczynnik zwarcia doziemnego” podany w wierszu nie jest przyjmowany",
        ),
        (
            {"insulation": [{**_WIERSZ_IZOLACJI, "earth_fault_factor_zrodlo_pl": "projektant"}]},
            "„źródło współczynnika zwarcia doziemnego” podany w wierszu nie jest przyjmowany",
        ),
    ],
    ids=[
        "neutral_grounding",
        "neutral_earthing_type",
        "network_neutral",
        "earth_fault_factor",
        "earth_fault_factor_zrodlo_pl",
    ],
)
def test_nadpisanie_uziemienia_to_odmowa_nazwana(
    z_zespolem: bool, parametry: dict[str, Any], fraza: str
) -> None:
    with pytest.raises(OdmowaDanychError) as odmowa:
        _z_parametrami(_siec(z_zespolem), parametry)
    assert fraza in str(odmowa.value)


@pytest.mark.parametrize(
    ("z_zespolem", "element", "kategoria"),
    [(True, "rezystor", "rezystor"), (True, "dlawik", "kompensowany"), (False, "-", "izolowany")],
    ids=["rezystor", "dlawik", "bez-zespolu"],
)
def test_wiersz_izolacji_dostaje_kategorie_z_modelu(
    z_zespolem: bool, element: str, kategoria: str
) -> None:
    """Tryb doziemienia sieci (sposób pracy punktu neutralnego) i współczynnik k — z modelu,
    nie z parametru biegu; każdy tryb osobno (warunek odbioru 2026-10-29)."""
    wejscie = _z_parametrami(_siec(z_zespolem, element), {"insulation": [_WIERSZ_IZOLACJI]})
    assert [w.network_neutral for w in wejscie.insulation] == [kategoria]


def test_wiersz_izolacji_na_szynie_spoza_modelu_to_odmowa_nazwana() -> None:
    with pytest.raises(OdmowaDanychError) as odmowa:
        _z_parametrami(
            _siec(z_zespolem=True),
            {"insulation": [{**_WIERSZ_IZOLACJI, "location_bus_ref": "nie-ma-takiej"}]},
        )
    assert "Szyna spoza modelu" in str(odmowa.value)
    assert "nie-ma-takiej" not in str(odmowa.value)


def test_wiersz_izolacji_niezgodny_z_kontraktem_to_odmowa_danych() -> None:
    with pytest.raises(OdmowaDanychError):
        _z_parametrami(
            _siec(z_zespolem=True), {"insulation": [{**_WIERSZ_IZOLACJI, "u_m_kv": -1.0}]}
        )
