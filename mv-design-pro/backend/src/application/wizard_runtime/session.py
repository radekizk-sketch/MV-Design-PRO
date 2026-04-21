from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Final
from uuid import UUID

from network_model.core.snapshot import NetworkSnapshot


class WizardSessionStatus:
    OPEN: Final[str] = "OPEN"
    COMMITTED: Final[str] = "COMMITTED"
    ABORTED: Final[str] = "ABORTED"


@dataclass
class WizardSession:
    wizard_session_id: UUID
    project_id: UUID
    base_snapshot_id: str
    working_snapshot_id: str | None
    status: str = WizardSessionStatus.OPEN
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    working_snapshot: NetworkSnapshot | None = None
    action_ids: list[str] = field(default_factory=list)
    last_action_created_at: str | None = None

    def mark_working_snapshot(self, snapshot: NetworkSnapshot) -> None:
        self.working_snapshot = snapshot
        self.working_snapshot_id = snapshot.meta.snapshot_id
