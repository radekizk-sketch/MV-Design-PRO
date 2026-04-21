"""Tests for ENM canonical JSON hashing — determinism, sort keys, hash stability."""

from datetime import UTC

from enm.hash import compute_enm_hash
from enm.models import Bus, EnergyNetworkModel, ENMHeader


def _make_enm(name: str = "Test", buses=None, sources=None) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name=name),
        buses=buses or [],
        sources=sources or [],
    )


class TestENMHash:
    def test_identical_enm_same_hash(self):
        enm1 = _make_enm("Project A")
        enm2 = _make_enm("Project A")
        assert compute_enm_hash(enm1) == compute_enm_hash(enm2)

    def test_different_name_different_hash(self):
        h1 = compute_enm_hash(_make_enm("A"))
        h2 = compute_enm_hash(_make_enm("B"))
        assert h1 != h2

    def test_hash_excludes_updated_at(self):
        from datetime import datetime, timedelta

        enm1 = _make_enm("X")
        enm2 = _make_enm("X")
        enm2.header.updated_at = datetime.now(UTC) + timedelta(hours=1)
        assert compute_enm_hash(enm1) == compute_enm_hash(enm2)

    def test_hash_excludes_hash_field(self):
        enm1 = _make_enm("X")
        enm2 = _make_enm("X")
        enm2.header.hash_sha256 = "something_different"
        assert compute_enm_hash(enm1) == compute_enm_hash(enm2)

    def test_hash_is_sha256_hex(self):
        h = compute_enm_hash(_make_enm("test"))
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_hash_stable_with_buses(self):
        buses = [
            Bus(ref_id="bus_a", name="A", voltage_kv=15),
            Bus(ref_id="bus_b", name="B", voltage_kv=15),
        ]
        h1 = compute_enm_hash(_make_enm(buses=buses))
        h2 = compute_enm_hash(_make_enm(buses=buses))
        assert h1 == h2
