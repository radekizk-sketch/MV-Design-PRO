"""
Tests for ProtectionConfig domain model (P14c).

Tests:
- Serialization/deserialization (deterministic)
- ProtectionConfig creation
- StudyCase integration
"""

from datetime import UTC, datetime
from uuid import uuid4

from domain.study_case import (
    ProtectionConfig,
    StudyCase,
    new_study_case,
)


def test_protection_config_to_dict():
    """Test ProtectionConfig serialization."""
    now = datetime.now(UTC)
    config = ProtectionConfig(
        template_ref="template-123",
        template_fingerprint="abc123",
        library_manifest_ref={"library_id": "lib-1", "revision": "1.0"},
        overrides={"I>": {"value": 100, "unit": "A"}},
        bound_at=now,
    )

    data = config.to_dict()

    assert data["template_ref"] == "template-123"
    assert data["template_fingerprint"] == "abc123"
    assert data["library_manifest_ref"] == {"library_id": "lib-1", "revision": "1.0"}
    assert data["overrides"] == {"I>": {"value": 100, "unit": "A"}}
    assert data["bound_at"] == now.isoformat()


def test_protection_config_from_dict():
    """Test ProtectionConfig deserialization."""
    now = datetime.now(UTC)
    data = {
        "template_ref": "template-123",
        "template_fingerprint": "abc123",
        "library_manifest_ref": {"library_id": "lib-1", "revision": "1.0"},
        "overrides": {"I>": {"value": 100, "unit": "A"}},
        "bound_at": now.isoformat(),
    }

    config = ProtectionConfig.from_dict(data)

    assert config.template_ref == "template-123"
    assert config.template_fingerprint == "abc123"
    assert config.library_manifest_ref == {"library_id": "lib-1", "revision": "1.0"}
    assert config.overrides == {"I>": {"value": 100, "unit": "A"}}
    assert config.bound_at == now


def test_protection_config_default():
    """Test ProtectionConfig with defaults."""
    config = ProtectionConfig()

    assert config.template_ref is None
    assert config.template_fingerprint is None
    assert config.library_manifest_ref is None
    assert config.overrides == {}
    assert config.bound_at is None


def test_study_case_with_protection_config():
    """Test StudyCase with ProtectionConfig."""
    project_id = uuid4()
    case = new_study_case(project_id, "Test Case")

    # Initially empty protection config
    assert case.protection_config.template_ref is None
    assert case.protection_config.overrides == {}

    # Update protection config
    now = datetime.now(UTC)
    new_config = ProtectionConfig(
        template_ref="template-123",
        template_fingerprint="abc123",
        library_manifest_ref={"library_id": "lib-1", "revision": "1.0"},
        overrides={"I>": {"value": 100, "unit": "A"}},
        bound_at=now,
    )

    updated_case = case.with_protection_config(new_config)

    assert updated_case.protection_config.template_ref == "template-123"
    assert updated_case.protection_config.template_fingerprint == "abc123"
    assert updated_case.protection_config.overrides == {"I>": {"value": 100, "unit": "A"}}
    assert updated_case.revision == case.revision + 1


def test_study_case_clone_copies_protection_config():
    """Test that cloning a case copies protection config."""
    project_id = uuid4()
    case = new_study_case(project_id, "Test Case")

    now = datetime.now(UTC)
    protection_config = ProtectionConfig(
        template_ref="template-123",
        template_fingerprint="abc123",
        library_manifest_ref={"library_id": "lib-1", "revision": "1.0"},
        overrides={"I>": {"value": 100, "unit": "A"}},
        bound_at=now,
    )

    case_with_protection = case.with_protection_config(protection_config)
    cloned_case = case_with_protection.clone("Cloned Case")

    # Protection config should be copied
    assert cloned_case.protection_config.template_ref == "template-123"
    assert cloned_case.protection_config.template_fingerprint == "abc123"
    assert cloned_case.protection_config.overrides == {"I>": {"value": 100, "unit": "A"}}

    # But result status should be NONE
    assert cloned_case.result_status.value == "NONE"


def test_study_case_serialization_with_protection_config():
    """Test StudyCase serialization includes protection_config."""
    project_id = uuid4()
    case = new_study_case(project_id, "Test Case")

    now = datetime.now(UTC)
    protection_config = ProtectionConfig(
        template_ref="template-123",
        template_fingerprint="abc123",
        library_manifest_ref={"library_id": "lib-1", "revision": "1.0"},
        overrides={"I>": {"value": 100, "unit": "A"}},
        bound_at=now,
    )

    case_with_protection = case.with_protection_config(protection_config)
    data = case_with_protection.to_dict()

    assert "protection_config" in data
    assert data["protection_config"]["template_ref"] == "template-123"
    assert data["protection_config"]["template_fingerprint"] == "abc123"
    assert data["protection_config"]["overrides"] == {"I>": {"value": 100, "unit": "A"}}

    # Deserialize and check
    restored_case = StudyCase.from_dict(data)
    assert restored_case.protection_config.template_ref == "template-123"
    assert restored_case.protection_config.template_fingerprint == "abc123"
    assert restored_case.protection_config.overrides == {"I>": {"value": 100, "unit": "A"}}
