"""E023 — napięcie znamionowe strony transformatora w innym paśmie niż szyna (partia 11).

DLACZEGO. Po scaleniu karty WSPOLCZYNNIK-C-JEDEN-NOSNIK współczynnik korekcyjny K_T
(IEC 60909-0 eq. 12a) bierze c_max z wiersza tabeli 1 strony DOLNEJ transformatora, a pasmo
tej strony wynika z napięcia znamionowego uzwojenia. Krytyczny tok e2e przypisywał pozycję
katalogu SN/nN (15/0,4 kV) TAKŻE transformatorowi GPZ wpiętemu między szyny 110 kV i 15 kV:
model to przyjmował, a bieg zwarciowy odmawiał „braku tolerancji nN" dla sieci, która nie ma
strony nN. Przyczyna leżała w modelu — przekładnia i impedancja transformatora liczyły się
z napięć, których sieć nie ma, i nic tego nie blokowało. E023 blokuje gotowość.

ILOCZYN CECH: {strona górna, strona dolna} × {napięcie w paśmie szyny inne niż szyna (15,75
na 15 kV, 0,42 na 0,4 kV), napięcie z innego pasma} × {model zbudowany wprost, model po
operacji `assign_catalog_to_element`, model po operacji `update_element_parameters`} ×
{treść: nazwa transformatora i szyny, brak identyfikatorów}.
"""

from __future__ import annotations

from typing import Any

import pytest
from domain.readiness_bridge import KODY_WALIDATORA_BEZ_KANONU
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.validator import ENMValidator

from tests.enm.test_canonical_sc_c_per_pasmo import N1, N2, _build_mv_lv_enm
from tests.reference_networks.gpz_h5 import ladunek_gpz_110kv

REF_TRAFO_SN_NN = "tr-sn-nn-15-04-630kva-dyn11"


def _e023(model: EnergyNetworkModel) -> list[Any]:
    return [i for i in ENMValidator().validate(model).issues if i.code == "E023"]


def test_siec_poprawna_nie_ma_e023() -> None:
    assert _e023(_build_mv_lv_enm("Sieć")) == []


@pytest.mark.parametrize(
    ("pole", "napiecie_kv"),
    [("uhv_kv", 15.75), ("uhv_kv", 13.8), ("ulv_kv", 0.42), ("ulv_kv", 0.69)],
)
def test_napiecie_w_pasmie_szyny_nie_blokuje(pole: str, napiecie_kv: float) -> None:
    """Uzwojenie 15,75 kV na szynie 15 kV i 0,42 kV na 0,4 kV to typowe tabliczki."""
    model = _build_mv_lv_enm("Sieć")
    model.transformers[0] = model.transformers[0].model_copy(update={pole: napiecie_kv})
    assert _e023(model) == []


@pytest.mark.parametrize(
    ("pole", "napiecie_kv", "strona", "szyna", "nazwa_szyny"),
    [
        ("uhv_kv", 110.0, "górnego", N1, "Szyna SN stacji"),
        ("uhv_kv", 0.4, "górnego", N1, "Szyna SN stacji"),
        ("ulv_kv", 15.0, "dolnego", N2, "Szyna nN"),
        ("ulv_kv", 6.0, "dolnego", N2, "Szyna nN"),
    ],
)
def test_napiecie_z_innego_pasma_blokuje(
    pole: str, napiecie_kv: float, strona: str, szyna: str, nazwa_szyny: str
) -> None:
    model = _build_mv_lv_enm("Sieć")
    model.transformers[0] = model.transformers[0].model_copy(update={pole: napiecie_kv})
    (blad,) = _e023(model)
    assert blad.severity == "BLOCKER"
    assert blad.element_refs == ["TR1", szyna]
    assert blad.fix_action is not None and blad.fix_action.element_ref == "TR1"
    assert "TR 15/0,4 kV 630 kVA Dyn11" in blad.message_pl
    assert f"strony {strona} napięcia" in blad.message_pl
    assert nazwa_szyny in blad.message_pl
    for identyfikator in ("TR1", N1, N2):
        assert identyfikator not in blad.message_pl, blad.message_pl


def test_obie_strony_poza_pasmem_daja_dwa_bledy() -> None:
    model = _build_mv_lv_enm("Sieć")
    model.transformers[0] = model.transformers[0].model_copy(
        update={"uhv_kv": 110.0, "ulv_kv": 15.0}
    )
    assert [b.element_refs[1] for b in _e023(model)] == [N1, N2]


def test_e023_jest_jawnie_bez_kodu_kanonu() -> None:
    """Most gotowości zna kod walidatora — nie gubi go jako nieznanego."""
    assert "E023" in KODY_WALIDATORA_BEZ_KANONU


# ---------------------------------------------------------------------------
# Pisarze modelu: każda operacja, która zmienia napięcia uzwojeń transformatora.
# ---------------------------------------------------------------------------


def _gpz() -> dict[str, Any]:
    pusty = EnergyNetworkModel(
        header=ENMHeader(name="e023", defaults=ENMDefaults(sn_nominal_kv=15.0))
    ).model_dump(mode="json")
    wynik = execute_domain_operation(
        pusty,
        "add_grid_source_sn",
        # Karta GPZ-H5: GPZ ze stroną 110 kV w kontrakcie jawnym (sekcja 110 kV z torem
        # zasilania, transformator 110/15 kV z katalogu przypisany sekcja 110 kV → sekcja SN).
        {"source_name": "Stacja zasilająca", **ladunek_gpz_110kv(1)},
    )
    assert not wynik.get("error"), wynik
    migawka = wynik["snapshot"]
    assert len(migawka["transformers"]) == 1
    return migawka


def _e023_migawki(migawka: dict[str, Any]) -> list[Any]:
    return _e023(EnergyNetworkModel.model_validate(migawka))


def test_gpz_110_15_nie_ma_e023() -> None:
    assert _e023_migawki(_gpz()) == []


def test_przypisanie_katalogu_sn_nn_transformatorowi_gpz_blokuje() -> None:
    """Dokładnie ścieżka krytycznego toku e2e sprzed partii 11."""
    migawka = _gpz()
    trafo = migawka["transformers"][0]
    wynik = execute_domain_operation(
        migawka,
        "assign_catalog_to_element",
        {
            "element_ref": trafo["ref_id"],
            "catalog_binding": {
                "catalog_namespace": "TRAFO_SN_NN",
                "catalog_item_id": REF_TRAFO_SN_NN,
                "catalog_item_version": "2024.1",
            },
        },
    )
    assert not wynik.get("error"), wynik
    bledy = _e023_migawki(wynik["snapshot"])
    assert {b.element_refs[1] for b in bledy} == {trafo["hv_bus_ref"], trafo["lv_bus_ref"]}


@pytest.mark.parametrize(
    ("parametry", "strona"),
    [({"ulv_kv": 0.4}, "lv_bus_ref"), ({"uhv_kv": 15.0, "ulv_kv": 15.0}, "hv_bus_ref")],
)
def test_zmiana_parametrow_transformatora_gpz_blokuje(
    parametry: dict[str, float], strona: str
) -> None:
    migawka = _gpz()
    trafo = migawka["transformers"][0]
    wynik = execute_domain_operation(
        migawka,
        "update_element_parameters",
        {"element_ref": trafo["ref_id"], "parameters": parametry},
    )
    assert not wynik.get("error"), wynik
    bledy = _e023_migawki(wynik["snapshot"])
    assert [b.element_refs[1] for b in bledy] == [trafo[strona]]
