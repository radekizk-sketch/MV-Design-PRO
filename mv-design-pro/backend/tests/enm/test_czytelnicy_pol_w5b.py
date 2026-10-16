"""Czytelnicy pól na rekordach `bays` (karta W5-B/B) — iloczyn cech konsumentów.

Każdy konsument czyta TEN SAM rekord pola przez `enm/pola.py`. Testy budują modele wprost
z rekordów `bays` (bez operacji domenowych), więc pilnują reguł czytelników niezależnie od
dróg budowy pola. Iloczyn: {poziom pola: SN, nN, ZKSN} × {konsument: zajętość pól, szyny
stacji (tor pola), reguły referencyjne rozdzielnicy SN, gotowość (I003/E022/W061), wejście
koordynacji izolacji V12.6}.
"""

from __future__ import annotations

from typing import Any

from enm.models import EnergyNetworkModel
from enm.tor_pola import szyny_stacji
from enm.validator import ENMValidator
from enm.zajetosc_pol import zajetosc_pol
from reference_engine.compliance import _sorted_bays
from solver_input.v126_contracts import ograniczniki_bez_uziemienia_sieci


def _pole(ref: str, szyna: str, rola: str = "OUT", **dane: Any) -> dict[str, Any]:
    wlasciciel = (
        {"branch_point_ref": "bp", "branch_point_port_id": "MAIN_IN"}
        if dane.pop("zksn", False)
        else {"substation_ref": dane.pop("stacja", "st")}
    )
    return {"ref_id": ref, "name": f"Pole {ref}", "bay_role": rola, "bus_ref": szyna} | (
        wlasciciel | dane
    )


def _kabel(ref: str, a: str, b: str, **meta: Any) -> dict[str, Any]:
    return {
        "ref_id": ref,
        "name": ref,
        "type": "cable",
        "from_bus_ref": a,
        "to_bus_ref": b,
        "length_km": 0.1,
        "r_ohm_per_km": 0.2,
        "x_ohm_per_km": 0.1,
    }


def _model(**kolekcje: Any) -> dict[str, Any]:
    baza: dict[str, Any] = {
        "header": {"name": "czytelnicy W5-B"},
        "buses": [
            {"ref_id": "sn", "name": "SN", "voltage_kv": 15.0},
            {"ref_id": "nn", "name": "nN", "voltage_kv": 0.4},
            {"ref_id": "bp-bus", "name": "ZKSN", "voltage_kv": 15.0},
        ],
        "substations": [
            {"ref_id": "st", "name": "Stacja", "station_type": "mv_lv", "bus_refs": ["sn", "nn"]}
        ],
    }
    return baza | kolekcje


def test_zajetosc_pol_obejmuje_wylacznie_pola_sn_stacji() -> None:
    """Zajętość pól liniowych SN: pole nN z zaciskiem i pole ZKSN nie są polami liniowymi
    rozdzielnicy SN stacji, choć leżą w tej samej kolekcji `bays`."""
    enm = _model(
        bays=[
            _pole("sn-out", "sn", terminal_bus_ref="sn-z"),
            _pole("nn-odp", "nn", "FEEDER", terminal_bus_ref="nn-z"),
            _pole("zksn-we", "bp-bus", "IN", zksn=True, terminal_bus_ref="bp-z"),
        ],
        branches=[_kabel("k1", "sn-z", "x"), _kabel("k2", "nn-z", "y"), _kabel("k3", "bp-z", "z")],
    )
    wynik = zajetosc_pol(enm)
    assert list(wynik) == ["sn-out"]
    assert wynik["sn-out"].odcinki_fizyczne == ("k1",)


def test_szyny_stacji_aparat_pola_nn_wylacznie_z_rekordu_pola() -> None:
    """Przynależność aparatu pola nN do stacji: rekord pola (`equipment_refs`); znacznik
    gałęzi bez rekordu nie wnosi szyny, rekord bez znacznika — wnosi. Pole SN wnosi własny
    zacisk; pole ZKSN nie należy do stacji."""
    enm = _model(
        bays=[
            _pole("sn-out", "sn", terminal_bus_ref="sn-z"),
            _pole("nn-odp", "nn", "FEEDER", equipment_refs=["ap-rekord"]),
            _pole("zksn-we", "bp-bus", "IN", zksn=True, terminal_bus_ref="bp-z"),
        ],
        branches=[
            {
                "ref_id": "ap-rekord",
                "name": "Q",
                "type": "breaker",
                "from_bus_ref": "nn",
                "to_bus_ref": "odp",
            },
            {
                "ref_id": "ap-znacznik",
                "name": "Q",
                "type": "breaker",
                "from_bus_ref": "nn",
                "to_bus_ref": "sierota",
                "meta": {"nn_field_migrowany_z": "nn-odp"},
            },
        ],
    )
    stacja = enm["substations"][0]
    assert szyny_stacji(enm, stacja) == frozenset({"sn", "nn", "sn-z", "odp"})
    model = EnergyNetworkModel.model_validate(enm)
    assert szyny_stacji(model, model.substations[0]) == szyny_stacji(enm, stacja)


def test_reguly_referencyjne_rozdzielnicy_sn_czytaja_pola_sn_stacji_i_zksn() -> None:
    """Pakiety referencyjne (profile IEC 62271, rodziny SN, standard OSD) oceniają pola
    rozdzielnic SN — stacji i ZKSN; pole nN nie jest przez nie oceniane."""
    model = EnergyNetworkModel.model_validate(
        _model(
            bays=[
                _pole("sn-out", "sn"),
                _pole("nn-odp", "nn", "FEEDER"),
                _pole("zksn-we", "bp-bus", "IN", zksn=True),
            ]
        )
    )
    assert [b.ref_id for b in _sorted_bays(model)] == ["sn-out", "zksn-we"]


def test_gotowosc_i003_e022_w061_z_rekordu_pola() -> None:
    """I003: stacja z samym polem nN MA pola; E022: nazwa pola z rekordu; W061: nazwa pola
    nN i stacji z rekordu wskazującego aparat — aparat ze znacznikiem bez rekordu nie
    dostaje nazwy pola (znacznik nie jest źródłem przynależności)."""
    enm = _model(
        substations=[
            {
                "ref_id": "st",
                "name": "Stacja Sady",
                "station_type": "mv_lv",
                "bus_refs": ["sn", "nn"],
            },
            {"ref_id": "st-nn", "name": "Stacja nN", "station_type": "mv_lv", "bus_refs": ["nn2"]},
            {"ref_id": "st-pusta", "name": "Pusta", "station_type": "mv_lv", "bus_refs": []},
        ],
        buses=[
            {"ref_id": "sn", "name": "SN", "voltage_kv": 15.0},
            {"ref_id": "nn", "name": "nN", "voltage_kv": 0.4},
            {"ref_id": "nn2", "name": "nN 2", "voltage_kv": 0.4},
            {"ref_id": "x", "name": "x", "voltage_kv": 15.0},
            {"ref_id": "y", "name": "y", "voltage_kv": 15.0},
            {"ref_id": "sn-z", "name": "zacisk", "voltage_kv": 15.0},
            {"ref_id": "odp", "name": "odp", "voltage_kv": 0.4},
            {"ref_id": "odp2", "name": "odp2", "voltage_kv": 0.4},
        ],
        bays=[
            _pole("sn-out", "sn", terminal_bus_ref="sn-z", name="Pole Lipowa"),
            _pole("nn-odp", "nn", "FEEDER", equipment_refs=["ap-1"], name="Odpływ Sady"),
            _pole("nn-2", "nn2", "FEEDER", stacja="st-nn"),
        ],
        branches=[
            _kabel("k1", "sn-z", "x"),
            _kabel("k2", "sn-z", "y"),
            {
                "ref_id": "ap-1",
                "name": "Q1",
                "type": "breaker",
                "from_bus_ref": "nn",
                "to_bus_ref": "odp",
                "meta": {
                    "nn_field_migrowany_z": "nn-odp",
                    "nn_promocja_bez_wiazania_katalogowej": True,
                },
            },
            {
                "ref_id": "ap-2",
                "name": "Q2",
                "type": "breaker",
                "from_bus_ref": "nn",
                "to_bus_ref": "odp2",
                "meta": {
                    "nn_field_migrowany_z": "nn-odp",
                    "nn_promocja_bez_wiazania_katalogowej": True,
                },
            },
        ],
    )
    issues = ENMValidator().validate(EnergyNetworkModel.model_validate(enm)).issues
    i003 = {i.element_refs[0] for i in issues if i.code == "I003"}
    assert i003 == {"st-pusta"}
    e022 = [i for i in issues if i.code == "E022"]
    assert len(e022) == 1 and e022[0].message_pl.startswith("Pole Lipowa")
    w061 = {i.element_refs[0]: i for i in issues if i.code == "W061"}
    assert "„Odpływ Sady”" in w061["ap-1"].message_pl
    assert "„Stacja Sady”" in w061["ap-1"].message_pl
    assert w061["ap-1"].fix_action.payload_hint["field_ref"] == "nn-odp"
    assert "Odpływ Sady" not in w061["ap-2"].message_pl
    assert w061["ap-2"].fix_action.payload_hint["field_ref"] is None


def test_wejscie_izolacji_v126_czyta_ograniczniki_typowane_pola() -> None:
    """Ogranicznik przepięć pola (`Bay.surge_arresters`) trafia do wejścia koordynacji
    izolacji — bez uziemienia sieci jako nazwany brak (szyna pola)."""
    model = EnergyNetworkModel.model_validate(
        _model(bays=[_pole("sn-out", "sn", surge_arresters=[{"device_ref": "ogr-1"}])])
    )
    assert ograniczniki_bez_uziemienia_sieci(model) == ("sn",)
    bez = EnergyNetworkModel.model_validate(_model(bays=[_pole("sn-out", "sn")]))
    assert ograniczniki_bez_uziemienia_sieci(bez) == ()


def test_szyny_stacji_w_starej_kolejnosci_argumentow_to_blad_a_nie_puste_zero() -> None:
    """Karta W5-B zmieniła sygnaturę `szyny_stacji`/`szyna_glowna_stacji` na `(enm, stacja)`.
    Wołanie w dawnej kolejności `(stacja, gałęzie)` zwracało po cichu pusty zbiór (zmierzone:
    scena koordynacji harnessu bez ani jednego zabezpieczenia) — teraz to błąd programu."""
    import pytest
    from enm.tor_pola import szyna_glowna_stacji, szyny_stacji

    stacja = {"ref_id": "st", "bus_refs": ["sn"]}
    with pytest.raises(TypeError):
        szyny_stacji(stacja, [])  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        szyna_glowna_stacji(stacja, [], "sn")  # type: ignore[arg-type]
    assert szyny_stacji({"substations": [stacja], "bays": []}, stacja) == frozenset({"sn"})
