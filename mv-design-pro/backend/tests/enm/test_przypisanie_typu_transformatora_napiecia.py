"""Przypisanie typu ISTNIEJĄCEMU transformatorowi: napięcia uzwojeń typu = napięcia jego szyn.

DEFEKT (zmierzony 2026-10-28). Tory TWORZENIA transformatora odmawiają typu o napięciach innych
niż szyny (stacja SN/nN — `station.insert.transformer_voltage_mismatch`, GPZ 110/SN —
`source.hv_voltage_mismatch` / `source.lv_voltage_mismatch`, transformator dedykowany DER —
`_resolve_sn_connection_bus`), a `assign_catalog_to_element` przepuszczał każdy typ: 20/0,4 kV
transformatorowi stacji 15 kV bez słowa (walidator E023 porównuje PASMEM — 20 i 15 kV to to samo
pasmo SN), 15/0,4 kV transformatorowi GPZ 110/15 kV dopiero jako bloker gotowości. Przekładnia
z napięć, których sieć nie ma, wchodziła do rozpływu i zwarć (IEC 60909-0 §6.3.3). Teraz
przypisanie stosuje tę samą równość danych (`to_samo_napiecie_znamionowe`) co tory tworzenia.

ILOCZYN CECH: transformator {stacja SN/nN 15/0,4 kV, GPZ 110/15 kV} × typ {napięcia równe
szynom, inne napięcie górne w tym samym paśmie, inne napięcie dolne w tym samym paśmie, napięcia
z innego pasma} × skutek {odmowa nazwana z kodem i treścią bez identyfikatorów, model bez zmian
(skrót migawki), przyjęcie z napięciami typu w elemencie}.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.domain_operations import KOD_NAPIECIA_TYPU_TRANSFORMATORA, execute_domain_operation
from enm.hash import compute_enm_hash
from enm.models import EnergyNetworkModel

from tests.enm.test_canonical_sc_c_per_pasmo import N1, N2, _build_mv_lv_enm
from tests.enm.test_walidator_e023_pasmo_uzwojenia import _gpz
from tests.reference_networks.budowa_przez_api import TRANSFORMATOR_WN_SN


def _stacja() -> dict[str, Any]:
    return _build_mv_lv_enm("Sieć").model_dump(mode="json")


def _przypisz(migawka: dict[str, Any], trafo_ref: str, typ: str) -> dict[str, Any]:
    return execute_domain_operation(
        migawka,
        "assign_catalog_to_element",
        {
            "element_ref": trafo_ref,
            "catalog_binding": {
                "catalog_namespace": "TRAFO_SN_NN",
                "catalog_item_id": typ,
                "catalog_item_version": "2024.1",
            },
        },
    )


#: (tor, typ, odmowa, strona odmowy w treści)
PRZYPADKI: list[tuple[str, str, bool, str | None]] = [
    ("stacja", "tr-sn-nn-15-04-630kva-dyn11", False, None),
    ("stacja", "tr-sn-nn-15-04-630kva-yd11", False, None),
    ("stacja", "tr-sn-nn-20-04-630kva-dyn11", True, "górnego"),
    ("stacja", "tr-sn-nn-15-0p69-0p5mva-dyn11-inverter", True, "dolnego"),
    ("stacja", TRANSFORMATOR_WN_SN, True, "górnego"),
    ("gpz", TRANSFORMATOR_WN_SN, False, None),
    ("gpz", "tr-sn-nn-15-04-630kva-dyn11", True, "górnego"),
    ("gpz", "tr-sn-nn-20-04-630kva-dyn11", True, "górnego"),
]


@pytest.mark.parametrize(("tor", "typ", "odmowa", "strona"), PRZYPADKI)
def test_przypisanie_typu_transformatora_wobec_napiec_szyn(
    tor: str, typ: str, odmowa: bool, strona: str | None
) -> None:
    migawka = _stacja() if tor == "stacja" else _gpz()
    trafo = migawka["transformers"][0]
    skrot_przed = compute_enm_hash(EnergyNetworkModel.model_validate(migawka))
    wynik = _przypisz(migawka, trafo["ref_id"], typ)
    if not odmowa:
        assert not wynik.get("error"), wynik
        po = next(t for t in wynik["snapshot"]["transformers"] if t["ref_id"] == trafo["ref_id"])
        napiecia = {b["ref_id"]: b["voltage_kv"] for b in wynik["snapshot"]["buses"]}
        assert po["uhv_kv"] == napiecia[trafo["hv_bus_ref"]]
        assert po["ulv_kv"] == napiecia[trafo["lv_bus_ref"]]
        return
    assert wynik.get("error_code") == KOD_NAPIECIA_TYPU_TRANSFORMATORA, wynik
    komunikat = str(wynik.get("error"))
    assert f"strony {strona} napięcia typu" in komunikat
    for identyfikator in (trafo["ref_id"], trafo["hv_bus_ref"], trafo["lv_bus_ref"], N1, N2):
        assert identyfikator not in komunikat, komunikat
    assert compute_enm_hash(EnergyNetworkModel.model_validate(migawka)) == skrot_przed
