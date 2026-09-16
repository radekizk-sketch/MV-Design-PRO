"""W5-A: magazyn wczytuje zastany zapis, migruje przez walidator modelu i NAZYWA skutek
w dzienniku zmian (nowa rewizja z opisem; utrata `Bus.grounding` bez źródła — w opisie
i w logu), a po zapisie migracja nie biegnie drugi raz (idempotencja przez nośnik).
"""

from __future__ import annotations

import json
import logging

import pytest
from enm.dziennik_zmian import wpis_rewizji
from enm.store import _case_path, get_enm, reset_enm_store


def _zastany_snapshot(z_zrodlem: bool) -> dict:
    return {
        "header": {"name": "zastany", "revision": 3, "hash_sha256": "x" * 64},
        "buses": [
            {
                "ref_id": "b_sn",
                "name": "SN",
                "voltage_kv": 15.0,
                "grounding": {"type": "petersen_coil", "x_ohm": 120.0},
            },
            {"ref_id": "b_nn", "name": "nN", "voltage_kv": 0.4, "grounding": None},
        ],
        "sources": (
            [
                {
                    "ref_id": "src",
                    "name": "GPZ",
                    "bus_ref": "b_sn",
                    "model": "short_circuit_power",
                    "sk3_mva": 250.0,
                }
            ]
            if z_zrodlem
            else []
        ),
        "transformers": [
            {
                "ref_id": "tr",
                "name": "TR",
                "hv_bus_ref": "b_sn",
                "lv_bus_ref": "b_nn",
                "sn_mva": 0.63,
                "uhv_kv": 15.0,
                "ulv_kv": 0.4,
                "uk_percent": 4.5,
                "pk_kw": 6.5,
                "vector_group": "Dyn11",
            }
        ],
        "substations": [
            {
                "ref_id": "st",
                "name": "Stacja",
                "station_type": "mv_lv",
                "bus_refs": ["b_sn", "b_nn"],
                "transformer_refs": ["tr"],
                "meta": {"nn_earthing_system": "TN-C-S", "grounding": None, "zero_sequence": None},
            }
        ],
    }


@pytest.fixture(autouse=True)
def _magazyn(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
    reset_enm_store()
    yield
    reset_enm_store()


def _zapisz_zastany(klucz: str, snapshot: dict) -> None:
    path = _case_path(klucz)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"klucz": klucz, "snapshot": snapshot, "revision": 3}), encoding="utf-8"
    )


def test_wczytanie_migruje_i_pisze_rewizje_z_nazwanym_opisem():
    _zapisz_zastany("w5-a", _zastany_snapshot(z_zrodlem=True))
    enm = get_enm("w5-a")
    assert enm.sources[0].neutral_grounding is not None
    assert enm.sources[0].neutral_grounding.type == "petersen_coil"
    assert enm.transformers[0].lv_earthing_system == "TN-C-S"
    assert enm.substations[0].meta == {}
    assert enm.header.revision == 4
    wpis = wpis_rewizji("w5-a", 4)
    assert wpis is not None and wpis.operacja is None
    assert "Migracja uziemienia" in wpis.opis_pl
    assert "src" in wpis.opis_pl and "TN-C-S" in wpis.opis_pl
    assert "UTRACONE" not in wpis.opis_pl
    # Drugi odczyt (nowy proces symulowany resetem pamięci) nie migruje już niczego.
    reset_enm_store(remove_persisted=False)
    ponownie = get_enm("w5-a")
    assert ponownie.header.revision == 4
    assert wpis_rewizji("w5-a", 5) is None


def test_utrata_bez_zrodla_jest_w_dzienniku_i_w_logu(caplog):
    _zapisz_zastany("w5-b", _zastany_snapshot(z_zrodlem=False))
    with caplog.at_level(logging.WARNING, logger="enm.store"):
        enm = get_enm("w5-b")
    assert enm.sources == []
    wpis = wpis_rewizji("w5-b", enm.header.revision)
    assert wpis is not None and "UTRACONE" in wpis.opis_pl and "b_sn" in wpis.opis_pl
    assert any(
        "migracja_uziemienia" in r.getMessage() and "b_sn" in r.getMessage() for r in caplog.records
    )
