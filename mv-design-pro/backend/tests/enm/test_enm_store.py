from __future__ import annotations

import pytest
from enm.hash import compute_enm_hash
from enm.models import Bus, EnergyNetworkModel, ENMDefaults, ENMHeader, Source
from enm.store import get_enm, reset_enm_store, set_enm


def _minimal_enm() -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Store Test", defaults=ENMDefaults()),
        buses=[Bus(ref_id="bus-main", name="Szyna glowna", voltage_kv=15.0)],
        sources=[
            Source(
                ref_id="src-grid",
                name="Zasilanie GPZ",
                bus_ref="bus-main",
                model="short_circuit_power",
                sk3_mva=250.0,
                rx_ratio=0.1,
            )
        ],
    )


@pytest.fixture(autouse=True)
def _reset_store() -> None:
    reset_enm_store()
    yield
    reset_enm_store()


def test_set_enm_persists_hash_for_effective_revision() -> None:
    saved = set_enm("case-store-1", _minimal_enm())

    assert saved.header.revision == 1
    assert saved.header.hash_sha256 == compute_enm_hash(saved)


def test_set_enm_noops_for_equivalent_snapshot_content() -> None:
    first = set_enm("case-store-2", _minimal_enm())

    equivalent = get_enm("case-store-2").model_copy(deep=True)
    saved = set_enm("case-store-2", equivalent)

    assert saved.header.revision == first.header.revision
    assert saved.header.hash_sha256 == first.header.hash_sha256
