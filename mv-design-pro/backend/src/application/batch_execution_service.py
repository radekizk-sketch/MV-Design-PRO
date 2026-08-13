"""Serwis serii przebiegów (wsadu) — karta BATCH-ROUTER.

Orkiestracja SERII biegów kanonicznych nad scenariuszami zwarciowymi jednego
przypadku obliczeniowego. Każdy element serii to ZWYKŁY bieg kanoniczny
(`enm.canonical_analysis.create_run` + `execute_run`) — ten sam tor, którym
idzie pojedynczy bieg ze scenariusza (`POST /api/execution/fault-scenarios/
{id}/runs` + `POST /api/execution/runs/{id}/execute`). Seria niczego nie
liczy sama (NOT-A-SOLVER) i nie przechowuje wyników — wyniki żyją w
artefaktach biegów kanonicznych, dostępnych istniejącymi końcówkami
(`GET /api/execution/runs/{run_id}/results`).

HISTORIA (pomiar karty BATCH-ROUTER, 2026-08-07): poprzednia wersja tego
serwisu (PR-20) NIE wołała żadnego solvera — `execute_batch` kończyła biegi
wynikami z ŻĄDANIA klienta (`solver_input["expected_results"]`) przez
`ExecutionEngineService.complete_run`, a rejestr przypadków sprawdzała w
pamięci silnika, której produkcja nigdy nie zasila. Wpięcie takiej końcówki
byłoby fabrykacją wyników (fantom). Obecna wersja wykonuje KAŻDY scenariusz
realnym torem kanonicznym.

INWARIANTY:
- Wykonanie SEKWENCYJNE w porządku posortowanych identyfikatorów scenariuszy
  (determinizm; zero równoległości).
- Zero ponowień; pierwszy nieudany scenariusz kończy serię stanem FAILED
  (biegi ukończone przed awarią pozostają — są zwykłymi biegami kanonicznymi).
- PREDYKATY PARAMI: odcisk treści scenariusza jest przypinany przy TWORZENIU
  serii i weryfikowany przy WYKONANIU z tego samego źródła prawdy
  (`compute_scenario_content_hash`); scenariusz zmieniony lub usunięty po
  utworzeniu serii = uczciwa odmowa, nigdy cichy bieg innej treści.
- Wejście solvera per scenariusz buduje `solver_input_for_scenario` — TO SAMO
  źródło, którego używa ścieżka pojedynczego biegu (KLASA, NIE INSTANCJA).
- `batch_input_hash` deterministyczny (domena `batch_job`, SHA-256).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from uuid import UUID

from application.fault_scenario_service import (
    FaultScenarioNotFoundError,
    FaultScenarioService,
    solver_input_for_scenario,
)
from domain.batch_job import BatchJob, BatchJobStatus, new_batch_job
from domain.execution import ExecutionAnalysisType
from domain.fault_scenario import FaultScenario, compute_scenario_content_hash
from enm.canonical_analysis import CanonicalRun
from enm.canonical_analysis import create_run as _create_canonical_run
from enm.canonical_analysis import execute_run as _execute_canonical_run

logger = logging.getLogger(__name__)


class BatchExecutionError(Exception):
    """Błąd bazowy orkiestracji serii przebiegów."""


class BatchNotFoundError(BatchExecutionError):
    """Seria przebiegów nie istnieje."""

    def __init__(self, batch_id: str) -> None:
        super().__init__(f"Seria przebiegów nie istnieje: {batch_id}")
        self.batch_id = batch_id


class BatchNotPendingError(BatchExecutionError):
    """Seria przebiegów nie jest w stanie PENDING."""

    def __init__(self, batch_id: str, status: str) -> None:
        super().__init__(f"Seria {batch_id} ma status {status} — wymagany PENDING")
        self.batch_id = batch_id
        self.status = status


#: Sygnatury wołań toru kanonicznego (wstrzykiwalne w testach kontraktowych).
CreateRunFn = Callable[..., CanonicalRun]
ExecuteRunFn = Callable[[UUID], CanonicalRun]


class BatchExecutionService:
    """Orkiestracja serii biegów kanonicznych nad scenariuszami zwarciowymi.

    Serwis trzyma WYŁĄCZNIE metadane orkiestracji (rekordy `BatchJob`
    w pamięci — spójnie z `FaultScenarioService`, którego scenariusze
    orkiestruje). Biegi i ich wyniki żyją w repozytorium biegów
    kanonicznych — seria nie tworzy równoległego magazynu wyników.
    """

    def __init__(
        self,
        scenario_service: FaultScenarioService,
        *,
        create_canonical_run: CreateRunFn = _create_canonical_run,
        execute_canonical_run: ExecuteRunFn = _execute_canonical_run,
    ) -> None:
        self._scenario_service = scenario_service
        self._create_canonical_run = create_canonical_run
        self._execute_canonical_run = execute_canonical_run
        self._batches: dict[UUID, BatchJob] = {}
        self._case_batches: dict[UUID, list[UUID]] = {}
        #: Odciski treści scenariuszy przypięte przy tworzeniu serii
        #: (para z weryfikacją przy wykonaniu — jedno źródło prawdy).
        self._pinned_hashes: dict[UUID, dict[UUID, str]] = {}

    # ------------------------------------------------------------------
    # Tworzenie serii
    # ------------------------------------------------------------------

    def create_batch(
        self,
        *,
        study_case_id: UUID,
        scenario_ids: list[UUID],
    ) -> BatchJob:
        """Utwórz serię przebiegów (PENDING) nad scenariuszami przypadku.

        Walidacje (polskie komunikaty — kontrakt API):
        - lista scenariuszy niepusta i bez duplikatów,
        - każdy scenariusz istnieje (`FaultScenarioNotFoundError` → 404),
        - każdy scenariusz należy do wskazanego przypadku,
        - wszystkie scenariusze mają TEN SAM typ analizy (domena `BatchJob`
          niesie jeden `analysis_type` — seria mieszana to dwie serie).

        Odcisk treści każdego scenariusza jest przypinany TERAZ i stanowi
        warunek wykonania (przewidywalność: seria wykonuje dokładnie tę
        treść, którą widział projektant przy jej tworzeniu).
        """
        if not scenario_ids:
            raise ValueError("Seria przebiegów wymaga co najmniej jednego scenariusza")

        scenarios: list[FaultScenario] = []
        for scenario_id in scenario_ids:
            scenario = self._scenario_service.get_scenario(scenario_id)
            if scenario.study_case_id != study_case_id:
                raise ValueError(
                    f"Scenariusz {scenario_id} nie należy do przypadku {study_case_id}"
                )
            scenarios.append(scenario)

        analysis_types = {scenario.analysis_type for scenario in scenarios}
        if len(analysis_types) > 1:
            posortowane = ", ".join(sorted(t.value for t in analysis_types))
            raise ValueError(
                "Wszystkie scenariusze serii muszą mieć ten sam typ analizy "
                f"(otrzymano: {posortowane})"
            )
        analysis_type: ExecutionAnalysisType = analysis_types.pop()

        content_hashes = [scenario.content_hash for scenario in scenarios]
        batch = new_batch_job(
            study_case_id=study_case_id,
            analysis_type=analysis_type,
            scenario_ids=scenario_ids,
            scenario_content_hashes=content_hashes,
        )

        self._batches[batch.batch_id] = batch
        self._case_batches.setdefault(study_case_id, []).append(batch.batch_id)
        self._pinned_hashes[batch.batch_id] = {
            scenario.scenario_id: scenario.content_hash for scenario in scenarios
        }

        logger.info(
            "Utworzono serię %s dla przypadku %s (%d scenariuszy, odcisk=%s)",
            batch.batch_id,
            study_case_id,
            len(batch.scenario_ids),
            batch.batch_input_hash[:16],
        )
        return batch

    # ------------------------------------------------------------------
    # Wykonanie serii
    # ------------------------------------------------------------------

    def execute_batch(self, batch_id: UUID) -> BatchJob:
        """Wykonaj serię sekwencyjnie torem kanonicznym.

        Dla każdego scenariusza (w porządku posortowanych identyfikatorów):
        1. pobierz scenariusz i zweryfikuj odcisk treści względem przypiętego
           przy tworzeniu serii (usunięty/zmieniony scenariusz = odmowa),
        2. brama uprawnień scenariusza (`check_scenario_eligibility` — ta sama
           brama co pojedynczy bieg),
        3. utwórz bieg kanoniczny (`create_run` — walidacja ENM u źródła),
        4. wykonaj bieg (`execute_run` — realny solver, WHITE BOX),
        5. powiąż bieg ze scenariuszem (`register_run` — parytet z pojedynczym
           biegiem).

        Pierwsza awaria kończy serię stanem FAILED z polskim komunikatem;
        biegi ukończone wcześniej pozostają dostępne jak zwykłe biegi.
        """
        batch = self._get_batch(batch_id)
        if batch.status != BatchJobStatus.PENDING:
            raise BatchNotPendingError(str(batch_id), batch.status.value)

        batch = batch.mark_running()
        self._batches[batch_id] = batch

        pinned = self._pinned_hashes.get(batch_id, {})
        collected_run_ids: list[UUID] = []

        for scenario_id in batch.scenario_ids:
            try:
                scenario = self._pobierz_zweryfikowany_scenariusz(scenario_id, pinned)
                self._brama_uprawnien(scenario)
                run = self._create_canonical_run(
                    case_id=str(batch.study_case_id),
                    project_id=None,
                    analysis_type="short_circuit_sn",
                    options=solver_input_for_scenario(scenario),
                )
                run = self._execute_canonical_run(run.id)
                if run.status != "FINISHED":
                    collected_run_ids.append(run.id)
                    raise BatchExecutionError(
                        run.error_message or "Bieg zakończył się niepowodzeniem"
                    )
                self._scenario_service.register_run(scenario_id, run.id)
                collected_run_ids.append(run.id)
            except Exception as exc:
                komunikat = f"Scenariusz {scenario_id}: {exc}"
                logger.warning("Seria %s FAILED na scenariuszu %s: %s", batch_id, scenario_id, exc)
                batch = batch.mark_failed(
                    errors=(komunikat,),
                    run_ids=tuple(collected_run_ids),
                    result_set_ids=tuple(collected_run_ids),
                )
                self._batches[batch_id] = batch
                return batch

        batch = batch.mark_done(
            run_ids=tuple(collected_run_ids),
            # Zestaw wyników biegu kanonicznego jest adresowany identyfikatorem
            # biegu (`GET /api/execution/runs/{run_id}/results`).
            result_set_ids=tuple(collected_run_ids),
        )
        self._batches[batch_id] = batch
        logger.info("Seria %s DONE: %d biegów", batch_id, len(collected_run_ids))
        return batch

    def _pobierz_zweryfikowany_scenariusz(
        self, scenario_id: UUID, pinned: dict[UUID, str]
    ) -> FaultScenario:
        """Scenariusz o treści IDENTYCZNEJ z przypiętą przy tworzeniu serii."""
        try:
            scenario = self._scenario_service.get_scenario(scenario_id)
        except FaultScenarioNotFoundError as exc:
            raise BatchExecutionError(
                "Scenariusz został usunięty po utworzeniu serii — utwórz serię ponownie"
            ) from exc
        przypiety = pinned.get(scenario_id)
        if przypiety is not None and compute_scenario_content_hash(scenario) != przypiety:
            raise BatchExecutionError(
                "Scenariusz został zmieniony po utworzeniu serii — utwórz serię ponownie"
            )
        return scenario

    def _brama_uprawnien(self, scenario: FaultScenario) -> None:
        """Ta sama brama uprawnień, którą przechodzi pojedynczy bieg."""
        eligibility = self._scenario_service.check_scenario_eligibility(scenario.scenario_id)
        if eligibility.status.value == "INELIGIBLE":
            blokady = "; ".join(b.message_pl for b in eligibility.blockers)
            raise BatchExecutionError(f"Analiza zablokowana: {blokady}")

    # ------------------------------------------------------------------
    # Odczyt
    # ------------------------------------------------------------------

    def get_batch(self, batch_id: UUID) -> BatchJob:
        """Seria po identyfikatorze (`BatchNotFoundError` gdy brak)."""
        return self._get_batch(batch_id)

    def list_batches(self, study_case_id: UUID) -> list[BatchJob]:
        """Serie przypadku, najnowsze pierwsze."""
        batch_ids = self._case_batches.get(study_case_id, [])
        batches = [self._batches[bid] for bid in batch_ids if bid in self._batches]
        return list(reversed(batches))

    def _get_batch(self, batch_id: UUID) -> BatchJob:
        batch = self._batches.get(batch_id)
        if batch is None:
            raise BatchNotFoundError(str(batch_id))
        return batch

    # ------------------------------------------------------------------
    # Testy / izolacja stanu
    # ------------------------------------------------------------------

    def reset(self) -> None:
        """Wyczyść stan orkiestracji (izolacja testów — parytet z resetami
        pozostałych serwisów pamięciowych w `tests/`)."""
        self._batches.clear()
        self._case_batches.clear()
        self._pinned_hashes.clear()
