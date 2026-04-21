"""
Hash parity test: BE SHA-256 == FE SHA-256 na wspolnym fixture.

RUN #3I COMMIT N1:
- Wczytaj fixture JSON (identyczny w frontend/__tests__/fixtures/).
- Oblicz hash w BE (compute_config_hash, SHA-256).
- Porownaj z zamrozonym expectedHash.
"""

import json
from pathlib import Path

from domain.field_device import AparatTypeV1, DeviceTypeV1, FieldRoleV1, PoleTypeV1
from domain.switchgear_config import (
    CatalogBindingV1,
    DeviceConfigV1,
    FieldConfigV1,
    ProtectionBindingV1,
    SwitchgearConfigV1,
    compute_config_hash,
)

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "switchgear_config_fixture_01.json"


def _load_fixture() -> dict:
    with open(FIXTURE_PATH, encoding="utf-8") as f:
        return json.load(f)


def _fixture_to_config(raw: dict) -> SwitchgearConfigV1:
    c = raw["config"]
    return SwitchgearConfigV1(
        config_version=c["configVersion"],
        station_id=c["stationId"],
        fields=tuple(
            FieldConfigV1(
                field_id=f["fieldId"],
                pole_type=PoleTypeV1(f["poleType"]),
                field_role=FieldRoleV1(f["fieldRole"]),
                bus_section_id=f.get("busSectionId"),
            )
            for f in c["fields"]
        ),
        devices=tuple(
            DeviceConfigV1(
                device_id=d["deviceId"],
                field_id=d["fieldId"],
                device_type=DeviceTypeV1(d["deviceType"]),
                aparat_type=AparatTypeV1(d["aparatType"]),
            )
            for d in c["devices"]
        ),
        catalog_bindings=tuple(
            CatalogBindingV1(
                device_id=b["deviceId"],
                catalog_id=b["catalogId"],
                catalog_name=b["catalogName"],
                manufacturer=b.get("manufacturer"),
                catalog_version=b.get("catalogVersion"),
            )
            for b in c["catalogBindings"]
        ),
        protection_bindings=tuple(
            ProtectionBindingV1(
                relay_device_id=p["relayDeviceId"],
                cb_device_id=p["cbDeviceId"],
            )
            for p in c["protectionBindings"]
        ),
    )


class TestHashParity:
    """BE SHA-256 hash matches frozen expected hash (shared with FE)."""

    def test_hash_matches_expected(self) -> None:
        raw = _load_fixture()
        config = _fixture_to_config(raw)
        be_hash = compute_config_hash(config)
        assert be_hash == raw["expectedHash"]

    def test_hash_is_64_hex(self) -> None:
        raw = _load_fixture()
        config = _fixture_to_config(raw)
        be_hash = compute_config_hash(config)
        assert len(be_hash) == 64
        assert all(c in "0123456789abcdef" for c in be_hash)

    def test_hash_stable_50x(self) -> None:
        raw = _load_fixture()
        config = _fixture_to_config(raw)
        reference = compute_config_hash(config)
        for _ in range(50):
            assert compute_config_hash(config) == reference
