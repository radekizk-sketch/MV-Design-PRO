"""Nowe pola `Bay` (karta W5-B) są ADDYTYWNE w odcisku modelu.

Wzorzec `tests/enm/test_hash_pola_addytywne.py`: rekord pola bez nowych wartości haszuje
jak przed kartą (migawki `bays` istniejące przed W5-B — stacja końca ciągu, `add_sn_bay` —
nie dostają nowego odcisku, więc wyniki nie są oznaczane jako nieaktualne); podana wartość
jest treścią modelu i zmienia odcisk. Iloczyn: {każde nowe pole} × {nienadane, nadane} ×
{trzy funkcje odcisku}.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm.hash import (
    _POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE,
    compute_enm_hash,
    compute_input_hash,
    hash_migawki_enm,
)
from enm.models import Bay, Bus, EnergyNetworkModel, ENMHeader, Substation

NOWE_POLA_BAY = _POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE["bays"]

WARTOSCI: dict[str, Any] = {
    "field_role": "LINIA_IN",
    "terminal_bus_ref": "zacisk",
    "funkcja_pomiaru": "UKLAD_ENERGII",
    "rodzaj_pomiaru": "PODSTAWOWY",
    "switchgear_family_ref": "rodzina",
    "manufacturer_ref": "producent",
    "apparatus_catalog_ref": "aparat",
    "config_id": "cfg",
    "catalog_bindings": {"catalog_item_id": "x"},
    "wybor_bloku": {"factory_configuration_ref": "blok", "factory_unit_index": 1},
    "metadane_pochodzenia": {"bay_kind": "liniowe_doplywowe"},
    "surge_arresters": [{"device_ref": "ogr"}],
}


def _enm(**pola: Any) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="hash-w5b"),
        buses=[Bus(ref_id="b", name="B", voltage_kv=15.0)],
        substations=[Substation(ref_id="s", name="S", station_type="mv_lv", bus_refs=["b"])],
        bays=[Bay(ref_id="p", name="P", bay_role="IN", substation_ref="s", bus_ref="b", **pola)],
    )


def _sprzed_karty(enm: EnergyNetworkModel) -> dict[str, Any]:
    dane = enm.model_dump(mode="json")
    for pole in NOWE_POLA_BAY:
        dane["bays"][0].pop(pole, None)
    return dane


def test_rejestr_nazywa_kazde_nowe_pole_bay() -> None:
    assert set(NOWE_POLA_BAY) == set(WARTOSCI) | {"branch_point_ref", "branch_point_port_id"}


def test_rekord_bez_nowych_wartosci_haszuje_jak_przed_karta() -> None:
    enm = _enm()
    sprzed = _sprzed_karty(enm)
    assert hash_migawki_enm(enm.model_dump(mode="json")) == hash_migawki_enm(copy.deepcopy(sprzed))
    assert compute_enm_hash(enm) == hash_migawki_enm(sprzed)
    assert compute_input_hash(enm) == compute_input_hash(EnergyNetworkModel.model_validate(sprzed))


@pytest.mark.parametrize("pole", sorted(WARTOSCI))
def test_nadana_wartosc_zmienia_odcisk(pole: str) -> None:
    bez, z_wartoscia = _enm(), _enm(**{pole: WARTOSCI[pole]})
    assert compute_enm_hash(bez) != compute_enm_hash(z_wartoscia)
    assert hash_migawki_enm(bez.model_dump(mode="json")) != hash_migawki_enm(
        z_wartoscia.model_dump(mode="json")
    )
