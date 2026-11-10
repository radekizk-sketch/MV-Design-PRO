"""Kontrola śladu zdarzeń i urządzeń w kanonicznym ENM — P0/P1."""
from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from enm.deklaracje_modulu import POLA_NC_RFG_GENERATORA, pola_nc_rfg_generatora
from enm.dowody_urzadzenia import DowodKonfiguracjiUrzadzenia
from enm.hash import compute_enm_hash, compute_input_hash, hash_migawki_enm
from enm.models import EnergyNetworkModel
from enm.wydarzenia_regulacyjne import WydarzeniaRegulacyjne
from tests import ncrfg_fabryki as f


def _model(**kwargs: Any) -> EnergyNetworkModel:
    return f.model(f.generator(**kwargs))


def test_nowe_pola_none_nie_zmieniaja_zamrozonego_hashu() -> None:
    old = _model()
    data = old.model_dump(mode="json")
    for gen in data["generators"]:
        gen.pop("wydarzenia_regulacyjne", None)
        gen.pop("dowod_konfiguracji_urzadzenia", None)
    assert compute_enm_hash(old) == hash_migawki_enm(data)
    assert compute_input_hash(old) == compute_input_hash(EnergyNetworkModel.model_validate(data))


def test_zrodlo_zdarzenia_jest_w_modelu_i_zmienia_hash() -> None:
    old = _model()
    data = old.model_dump(mode="json")
    data["generators"][0]["wydarzenia_regulacyjne"] = WydarzeniaRegulacyjne(
        data_wydania_warunkow="2026-01-01",
        zrodlo_pl="warunki przyłączenia W/42",
    ).model_dump(mode="json")
    new = EnergyNetworkModel.model_validate(data)
    assert compute_enm_hash(old) != compute_enm_hash(new)
    assert compute_input_hash(old) != compute_input_hash(new)


def test_firmware_jest_oddzielnym_dowodem_od_katalogu() -> None:
    old = _model()
    data = old.model_dump(mode="json")
    data["generators"][0]["dowod_konfiguracji_urzadzenia"] = DowodKonfiguracjiUrzadzenia(
        wersja_oprogramowania="1.2.3",
        identyfikator_protokolu="SAT/1",
        zrodlo_pl="protokół rozruchu",
    ).model_dump(mode="json")
    new = EnergyNetworkModel.model_validate(data)
    assert compute_enm_hash(old) != compute_enm_hash(new)
    assert new.generators[0].dowod_konfiguracji_urzadzenia.wersja_oprogramowania == "1.2.3"


def test_pisarz_obsługuje_oba_pola_i_none() -> None:
    params = {
        "wydarzenia_regulacyjne": {
            "data_wydania_warunkow": "2026-01-01",
            "zrodlo_pl": "warunki W/42"
        },
        "dowod_konfiguracji_urzadzenia": {
            "wersja_oprogramowania": "1.2.3",
            "zrodlo_pl": "SAT"
        }
    }
    data, error = pola_nc_rfg_generatora(params)
    assert error is None
    assert data["wydarzenia_regulacyjne"]["data_wydania_warunkow"] == "2026-01-01"
    assert data["dowod_konfiguracji_urzadzenia"]["wersja_oprogramowania"] == "1.2.3"
    assert set(params).issubset(POLA_NC_RFG_GENERATORA)
    cleared, error = pola_nc_rfg_generatora({k: None for k in params})
    assert error is None
    assert all(v is None for v in cleared.values())


@pytest.mark.parametrize("field,invalid", [
    ("wydarzenia_regulacyjne", {"data_wydania_warunkow": "2026-01-01"}),
    ("wydarzenia_regulacyjne", {"data_wydania_warunkow": "1735689600", "zrodlo_pl": "z"}),
    ("dowod_konfiguracji_urzadzenia", {"wersja_oprogramowania": "1.0"}),
])
def test_pisarz_odrzuca_brak_zrodla_lub_nieprawidlowa_date(
    field: str, invalid: dict[str, Any]
) -> None:
    values, error = pola_nc_rfg_generatora({field: invalid})
    assert values == {}
    assert error is not None
    assert error[1].startswith("generator.")


def test_podany_generator_nie_konwertuje_liczby_na_date() -> None:
    with pytest.raises(ValidationError):
        WydarzeniaRegulacyjne(
            data_oswiadczenia_gotowosci_przylaczenia=1735689600,
            zrodlo_pl="oświadczenie"
        )
