"""Nastawy zabezpieczeń modułu w modelu i pola art. 4 generatora (karta AB-1a Pakiet C, O-31,
O-32).

Iloczyn cech: nazwa pola × słownik Banku Nastaw (parytet w obie strony) × wartość {brak,
podana ze źródłem, podana bez źródła, poza dziedziną} × odcisk modelu {pola ``None``, pola
podane}. Pola art. 4 i nastawy są addytywne poza odciskiem, gdy ``None`` — istniejące modele
nie dostają nowego odcisku (świeżość wyników), a dana podana zmienia odcisk.
"""

from __future__ import annotations

import math
from datetime import date
from typing import Any

import pytest
from application.ncrfg_compliance.model_bridge import build_ncrfg_module_input_from_generator
from catalog.profiles.nc_rfg.loader import JEDNOSTKI_NASTAW
from enm.hash import (
    _POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE,
    compute_enm_hash,
    compute_input_hash,
    hash_migawki_enm,
)
from enm.models import EnergyNetworkModel
from enm.nastawy_modulu import POLA_NASTAW, NastawyZabezpieczenModulu
from pydantic import ValidationError

from tests import ncrfg_fabryki as f

_POLA_ART4 = ("modul_istniejacy", "data_umowy_przylaczeniowej", "nastawy_zabezpieczen")


def test_parytet_nazw_ze_slownikiem_banku_nastaw_w_obie_strony() -> None:
    assert tuple(JEDNOSTKI_NASTAW) == POLA_NASTAW
    pola_modelu = set(NastawyZabezpieczenModulu.model_fields) - {"zrodlo_pl"}
    assert pola_modelu == set(JEDNOSTKI_NASTAW)


def test_brak_nastaw_jest_stanem_nie_wartoscia() -> None:
    nastawy = NastawyZabezpieczenModulu()
    assert all(getattr(nastawy, pole) is None for pole in POLA_NASTAW)
    assert nastawy.zrodlo_pl is None


@pytest.mark.parametrize("pole", POLA_NASTAW)
def test_wartosc_bez_zrodla_jest_odrzucana(pole: str) -> None:
    wartosc = 0.5 if pole.endswith(("_pu", "_czas_s")) else 1.0
    if pole == "f_min_hz" or pole == "f_max_hz":
        wartosc = 49.0
    with pytest.raises(ValidationError, match="zrodlo_pl|źród"):
        NastawyZabezpieczenModulu(**{pole: wartosc})
    NastawyZabezpieczenModulu(**{pole: wartosc}, zrodlo_pl="karta nastaw")


@pytest.mark.parametrize(
    "dane",
    [
        {"u_min_pu": 0.9, "u_max_pu": 0.8},
        {"f_min_hz": 51.0, "f_max_hz": 49.0},
        {"u_min_pu": -0.1},
        {"przesuniecie_fazy_deg": 200.0},
        {"rocof_hz_s": 0.0},
        {"u_min_pu": math.nan},
        {"u_min_czas_s": math.inf},
        {"nieznane_pole": 1.0},
    ],
)
def test_wartosci_poza_dziedzina_sa_odrzucane(dane: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        NastawyZabezpieczenModulu(**dane, zrodlo_pl="karta nastaw")


def test_rejestr_pol_addytywnych_generatora_nazywa_pola_art4() -> None:
    assert set(_POLA_ART4) <= set(_POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE["generators"])


def _model(**pola: Any) -> EnergyNetworkModel:
    return f.model(f.generator(**pola))


def _migawka_bez_pol(enm: EnergyNetworkModel) -> dict[str, Any]:
    dane = enm.model_dump(mode="json")
    for generator in dane["generators"]:
        for pole in _POLA_ART4:
            generator.pop(pole, None)
    return dane


def test_pola_art4_i_nastawy_poza_haszem_gdy_none() -> None:
    enm = _model()
    assert compute_enm_hash(enm) == hash_migawki_enm(_migawka_bez_pol(enm))
    assert compute_input_hash(enm) == compute_input_hash(
        EnergyNetworkModel.model_validate(_migawka_bez_pol(enm))
    )


@pytest.mark.parametrize(
    "pola",
    [
        {"modul_istniejacy": False},
        {"modul_istniejacy": True},
        {"data_umowy": date(2025, 1, 1)},
        {"nastawy_zabezpieczen": NastawyZabezpieczenModulu(u_min_pu=0.8, zrodlo_pl="karta")},
    ],
)
def test_pole_podane_zmienia_odcisk(pola: dict[str, Any]) -> None:
    bez, z = _model(), _model(**pola)
    assert compute_enm_hash(bez) != compute_enm_hash(z)
    assert compute_input_hash(bez) != compute_input_hash(z)


def test_most_przenosi_pola_art4_i_nastawy_jeden_do_jednego() -> None:
    nastawy = NastawyZabezpieczenModulu(u_min_pu=0.8, u_min_czas_s=0.2, zrodlo_pl="karta nastaw")
    generator = f.generator(
        modul_istniejacy=False, data_umowy=date(2025, 3, 1), nastawy_zabezpieczen=nastawy
    )
    wejscie = build_ncrfg_module_input_from_generator(
        generator, voltage_kv=15.0, operator_id=f.OPERATOR
    )
    assert wejscie.modul_istniejacy is False
    assert wejscie.data_umowy_przylaczeniowej == date(2025, 3, 1)
    assert wejscie.nastawy_zabezpieczen_modulu == nastawy
    brak = build_ncrfg_module_input_from_generator(
        f.generator(), voltage_kv=15.0, operator_id=f.OPERATOR
    )
    assert (
        brak.modul_istniejacy,
        brak.data_umowy_przylaczeniowej,
        brak.nastawy_zabezpieczen_modulu,
    ) == (None, None, None)
