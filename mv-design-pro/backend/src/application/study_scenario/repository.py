from __future__ import annotations

from collections.abc import Iterable
from dataclasses import asdict
from uuid import UUID

from application.study_scenario.models import Run, Scenario, Snapshot, Study


class StudyScenarioRepository:
    """In-memory repository for Study/Scenario orchestration (read-only workflow layer)."""

    def __init__(self) -> None:
        self._studies: dict[UUID, Study] = {}
        self._scenarios: dict[UUID, Scenario] = {}
        self._runs: dict[UUID, Run] = {}
        self._snapshots: dict[UUID, Snapshot] = {}

    def add_study(self, study: Study) -> Study:
        existing = self._studies.get(study.study_id)
        if existing and existing != study:
            raise ValueError("Study ID collision with different payload")
        self._studies[study.study_id] = study
        return study

    def add_scenario(self, scenario: Scenario) -> Scenario:
        existing = self._scenarios.get(scenario.scenario_id)
        if existing and existing != scenario:
            raise ValueError("Scenario ID collision with different payload")
        self._scenarios[scenario.scenario_id] = scenario
        return scenario

    def add_run(self, run: Run) -> Run:
        existing = self._runs.get(run.run_id)
        if existing and existing != run:
            raise ValueError("Run ID collision with different payload")
        self._runs[run.run_id] = run
        return run

    def add_snapshot(self, snapshot: Snapshot) -> Snapshot:
        existing = self._snapshots.get(snapshot.snapshot_id)
        if existing and existing != snapshot:
            raise ValueError("Snapshot ID collision with different payload")
        self._snapshots[snapshot.snapshot_id] = snapshot
        return snapshot

    def get_study(self, study_id: UUID) -> Study | None:
        return self._studies.get(study_id)

    def get_scenario(self, scenario_id: UUID) -> Scenario | None:
        return self._scenarios.get(scenario_id)

    def get_run(self, run_id: UUID) -> Run | None:
        return self._runs.get(run_id)

    def get_snapshot(self, snapshot_id: UUID) -> Snapshot | None:
        return self._snapshots.get(snapshot_id)

    def list_studies(self) -> list[Study]:
        return sorted(
            self._studies.values(), key=lambda study: (study.name.lower(), study.study_id)
        )

    def list_scenarios(self, study_id: UUID) -> list[Scenario]:
        scenarios = [
            scenario for scenario in self._scenarios.values() if scenario.study_id == study_id
        ]
        return sorted(
            scenarios,
            key=lambda scenario: (
                not scenario.is_base,
                scenario.name.lower(),
                scenario.scenario_id,
            ),
        )

    def list_runs(self, scenario_id: UUID) -> list[Run]:
        runs = [run for run in self._runs.values() if run.scenario_id == scenario_id]
        return sorted(runs, key=lambda run: (run.created_at, run.run_id))

    def list_snapshots(self) -> list[Snapshot]:
        return sorted(
            self._snapshots.values(), key=lambda snap: (snap.created_at, snap.snapshot_id)
        )

    def export_state(self) -> dict[str, list[dict]]:
        return {
            "studies": [asdict(study) for study in self.list_studies()],
            "scenarios": [asdict(scenario) for scenario in self._scenarios.values()],
            "runs": [asdict(run) for run in self._runs.values()],
            "snapshots": [asdict(snapshot) for snapshot in self._snapshots.values()],
        }

    def list_base_scenarios(self, study_id: UUID) -> Iterable[Scenario]:
        return [
            scenario
            for scenario in self._scenarios.values()
            if scenario.study_id == study_id and scenario.is_base
        ]
