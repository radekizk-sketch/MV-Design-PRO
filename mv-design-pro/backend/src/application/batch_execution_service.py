"""Serwis serii przebiegów (wsadu) — karta CV-3.3-C (R2, trwały rejestr).

Orkiestracja SERII biegów kanonicznych nad scenariuszami zwarciowymi jednego
przypadku obliczeniowego. Każdy element serii to ZWYKŁY bieg kanoniczny
(`enm.canonical_analysis.create_run` + `execute_run`) — ten sam tor, którym
idzie pojedynczy bieg ze scenariusza (`POST /api/execution/fault-scenarios/
{id}/runs` + `POST /api/execution/runs/{id}/execute`). Seria niczego nie
liczy sama (NOT-A-SOLVER) i nie przechowuje wyników — wyniki żyją w
artefaktach biegów kanonicznych, dostępnych istniejącymi końcówkami
(`GET /api/execution/runs/{run_id}/results`).

TRWAŁOŚĆ (karta CV-3.3-C, 2026-09-05). Poprzednia wersja tego serwisu (karta
BATCH-ROUTER) trzymała serie w TRZECH słownikach modułu instancji
(`_batches`/`_case_batches`/`_pinned_hashes`) — seria ginęła z procesem
backendu, choć KAŻDY bieg pozycji jest trwały w R1 (`canonical_runs`).
Konstytucja (docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md §B.2): R1 =
jedyny rejestr biegów, E4 → `run_batches`. Serwis jest odtąd BEZSTANOWY —
DOKŁADNIE tak samo, jak `FaultScenarioService` (karta C6-PERSIST): żadna
metoda nie trzyma treści serii w atrybucie instancji, wszystko żyje w
`infrastructure.persistence.repositories.run_batch_repository`.

WYKONANIE CIĄGŁE (karta §0 C2). Poprzednia wersja zatrzymywała serię na
PIERWSZEJ awarii — pozostałe scenariusze NIGDY nie były próbowane. Odtąd
KAŻDA pozycja jest próbowana niezależnie (kolejność deterministyczna —
`position`); awaria jednej pozycji nie zatrzymuje pozostałych. Status serii
jest WYPROWADZANY z pozycji (`domain.run_batch.finalize_batch_status`):
FINISHED gdy wszystkie FINISHED, FAILED gdy wszystkie FAILED, PARTIAL gdy
mieszanka — NIGDY cicho FINISHED. `stop_on_failure` NIE istnieje w kontrakcie
API (sprawdzone przy tej karcie) — nie ma go jak zażądać, więc serwis nie
wystawia takiej opcji (zero fantomu).

INWARIANTY:
- Wykonanie SEKWENCYJNE w porządku `position` (determinizm; zero równoległości).
- Zero ponowień; każda pozycja jest próbowana DOKŁADNIE raz.
- PREDYKATY PARAMI: odcisk treści scenariusza jest przypinany przy TWORZENIU
  serii (`RunBatchItem.options_hash`) i weryfikowany przy WYKONANIU z tego
  samego źródła prawdy (`compute_scenario_content_hash`); scenariusz zmieniony
  lub usunięty po utworzeniu serii = uczciwa odmowa TEJ pozycji, nigdy cichy
  bieg innej treści.
- Wejście solvera per scenariusz buduje `solver_input_for_scenario` — TO SAMO
  źródło, którego używa ścieżka pojedynczego biegu (KLASA, NIE INSTANCJA).
- `batch_input_hash` deterministyczny (domena `batch_job`, SHA-256).
- Seria NIE kopiuje migawki modelu do pozycji (karta C5): koperta zapisana na
  serii jest WYŁĄCZNIE informacyjna (stan modelu z chwili utworzenia); każda
  pozycja czyta model NA WŁASNY RACHUNEK przy wykonaniu przez `create_run`,
  dokładnie jak pojedynczy bieg (`scenario_copy_guard.py` R2/R3/R4: zero
  konstrukcji `CanonicalRun` poza fabryką, zero kopii migawki).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from application.fault_scenario_service import (
    FaultScenarioNotFoundError,
    FaultScenarioService,
    solver_input_for_scenario,
)
from domain.execution import ExecutionAnalysisType
from domain.fault_scenario import FaultScenario, compute_scenario_content_hash
from domain.run_batch import (
    ITEM_STATUS_FAILED,
    ITEM_STATUS_FINISHED,
    RunBatch,
    RunBatchItem,
    RunBatchStatus,
    compute_batch_input_hash,
    new_run_batch,
)
from enm.canonical_analysis import CanonicalRun
from enm.canonical_analysis import create_run as _create_canonical_run
from enm.canonical_analysis import execute_run as _execute_canonical_run
from enm.envelope import zbuduj_koperte
from enm.hash import compute_enm_hash
from enm.klucz_twin import czy_klucz_projektu, project_id_z_klucza
from enm.scenariusze import OperatingScenario
from enm.store import get_enm
from infrastructure.persistence.repositories.run_batch_repository import (
    run_batch_repository_scope,
)
from network_model.catalog.odcisk import odcisk_katalogu_domyslnego

logger = logging.getLogger(__name__)


class BatchExecutionError(Exception):
    """Błąd bazowy orkiestracji serii przebiegów."""


class BatchNotFoundError(BatchExecutionError):
    """Seria przebiegów nie istnieje."""

    def __init__(self, batch_id: str) -> None:
        super().__init__(f"Seria przebiegów nie istnieje: {batch_id}")
        self.batch_id = batch_id


class BatchNotPendingError(BatchExecutionError):
    """Seria przebiegów nie jest w stanie CREATED."""

    def __init__(self, batch_id: str, status: str) -> None:
        super().__init__(f"Seria {batch_id} ma status {status} — wymagany CREATED")
        self.batch_id = batch_id
        self.status = status


#: Sygnatury wołań toru kanonicznego (wstrzykiwalne w testach kontraktowych).
CreateRunFn = Callable[..., CanonicalRun]
ExecuteRunFn = Callable[[UUID], CanonicalRun]

#: Rodzaj analizy kanonicznej dla KAŻDEGO biegu pozycji serii — serie działają
#: WYŁĄCZNIE nad scenariuszami zwarciowymi (walidacja `create_batch`: wszystkie
#: scenariusze tego samego `ExecutionAnalysisType`, mapowanego na jeden rodzaj
#: analizy kanonicznej). Ta sama stała, co pojedynczy bieg ze scenariusza
#: (`api/fault_scenarios.py`).
_RODZAJ_ANALIZY_KANONICZNEJ = "short_circuit_sn"


def reset_run_batches() -> None:
    """Wyczyść rejestr serii (izolacja testów — parytet z `reset_canonical_runs`/
    `reset_enm_store`)."""
    with run_batch_repository_scope() as repo:
        repo.clear_all()


class BatchExecutionService:
    """Orkiestracja serii biegów kanonicznych nad scenariuszami zwarciowymi.

    BEZSTANOWY (karta CV-3.3-C, wzorzec `FaultScenarioService`): żadna metoda
    nie trzyma treści serii w atrybucie instancji — treść żyje wyłącznie w
    rejestrze `run_batches` (`infrastructure.persistence.repositories.
    run_batch_repository`), adresowanym identyfikatorem przekazanym jawnie do
    każdej metody. Biegi i ich wyniki żyją w repozytorium biegów kanonicznych
    (R1) — seria nie tworzy równoległego magazynu wyników.
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

    # ------------------------------------------------------------------
    # Tworzenie serii
    # ------------------------------------------------------------------

    def create_batch(
        self,
        *,
        klucz: str,
        study_case_id: UUID,
        scenario_ids: list[UUID],
        name: str | None = None,
    ) -> RunBatch:
        """Utwórz serię przebiegów (CREATED) nad scenariuszami przypadku.

        `name` — nazwa serii nadana przez projektanta (karta C1; `None` = bez
        nazwy). Wołający (API) normalizuje pusty napis do `None`.

        Walidacje (polskie komunikaty — kontrakt API):
        - lista scenariuszy niepusta i bez duplikatów,
        - każdy scenariusz istnieje (`FaultScenarioNotFoundError` → 404),
        - każdy scenariusz należy do wskazanego przypadku,
        - wszystkie scenariusze mają TEN SAM typ analizy (domena `RunBatch`
          niesie jeden `analysis_type` — seria mieszana to dwie serie).

        Odcisk treści każdego scenariusza jest przypinany TERAZ
        (`RunBatchItem.options_hash`) i stanowi warunek wykonania
        (przewidywalność: seria wykonuje dokładnie tę treść, którą widział
        projektant przy jej tworzeniu).

        Koperta rewizji modelu jest budowana TERAZ z modelu BIEŻĄCEGO —
        zapis WYŁĄCZNIE informacyjny (karta C5: seria nie kopiuje migawki do
        pozycji, każda pozycja czyta model na własny rachunek przy wykonaniu).

        `klucz` — klucz magazynu scenariuszy (Canonical Project Twin) przypadku
        serii, przetłumaczony przez wołającego (`api/batch_execution.py`,
        `klucz_twin_dep.klucz_twin_z_sciezki`).
        """
        if not scenario_ids:
            raise ValueError("Seria przebiegów wymaga co najmniej jednego scenariusza")

        scenarios: list[FaultScenario] = []
        for scenario_id in scenario_ids:
            scenario = self._scenario_service.get_scenario(klucz, scenario_id)
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
        envelope = self._zbuduj_koperte_serii(
            klucz=klucz,
            analysis_type=analysis_type,
            scenario_ids=scenario_ids,
            content_hashes=content_hashes,
        )
        project_id_koperty: str | None = envelope["project_id"]
        batch = new_run_batch(
            project_id=project_id_koperty,
            case_id=study_case_id,
            analysis_type=analysis_type,
            scenario_ids=scenario_ids,
            scenario_content_hashes=content_hashes,
            envelope=envelope,
            name=name,
        )

        with run_batch_repository_scope() as repo:
            repo.create(batch)

        logger.info(
            "Utworzono serię %s dla przypadku %s (%d scenariuszy, odcisk=%s)",
            batch.id,
            study_case_id,
            len(batch.scenario_ids),
            batch.batch_input_hash[:16],
        )
        return batch

    def _zbuduj_koperte_serii(
        self,
        *,
        klucz: str,
        analysis_type: ExecutionAnalysisType,
        scenario_ids: list[UUID],
        content_hashes: list[str],
    ) -> dict[str, Any]:
        """Koperta rewizji Z CHWILI UTWORZENIA serii — TA SAMA funkcja
        (`enm.envelope.zbuduj_koperte`), którą buduje `create_run` dla
        pojedynczego biegu; `scenario_ref=None` bo seria niesie WIELE
        scenariuszy, nie jeden (`options_hash` = tożsamość CAŁEJ serii).
        """
        project_id = str(project_id_z_klucza(klucz)) if czy_klucz_projektu(klucz) else None
        enm = get_enm(klucz)
        batch_input_hash = compute_batch_input_hash(
            analysis_type=analysis_type,
            scenario_ids=tuple(scenario_ids),
            scenario_content_hashes=tuple(content_hashes),
        )
        koperta = zbuduj_koperte(
            project_id=project_id,
            model_revision=enm.header.revision,
            snapshot_hash=compute_enm_hash(enm),
            catalog_fingerprint=odcisk_katalogu_domyslnego(),
            options_hash=batch_input_hash,
        )
        return koperta.to_dict()

    # ------------------------------------------------------------------
    # Wykonanie serii
    # ------------------------------------------------------------------

    def execute_batch(self, batch_id: UUID, *, klucz_twin: str) -> RunBatch:
        """Wykonaj serię sekwencyjnie torem kanonicznym.

        Dla KAŻDEJ pozycji (w porządku `position`), NIEZALEŻNIE od wyniku
        poprzednich:
        1. pobierz scenariusz i zweryfikuj odcisk treści względem przypiętego
           przy tworzeniu serii (usunięty/zmieniony scenariusz = odmowa TEJ
           pozycji),
        2. brama uprawnień scenariusza (`check_scenario_eligibility` — ta sama
           brama co pojedynczy bieg),
        3. utwórz bieg kanoniczny (`create_run(scenariusz=...)` — walidacja ENM
           u źródła, koperta niesie referencję scenariusza — TEN SAM mechanizm,
           co pojedynczy bieg, KLASA NIE INSTANCJA: „ma powiązane biegi" jest
           wyprowadzane z koperty dla OBU ścieżek),
        4. wykonaj bieg (`execute_run` — realny solver, WHITE BOX).

        Awaria jednej pozycji NIE zatrzymuje pozostałych (karta §0 C2) — status
        serii jest rozstrzygany DOPIERO po próbie wszystkich pozycji
        (`domain.run_batch.finalize_batch_status`).

        `klucz_twin` — klucz magazynu ENM (Canonical Project Twin) projektu
        przypadku serii. Serwis jest bezstanowy wobec bazy danych domenowej
        (brak `uow_factory` w zasięgu), więc tłumaczenie `case_id -> klucz`
        dzieje się WYŁĄCZNIE u wołającego (`api/batch_execution.py`).
        """
        batch = self._get_batch(batch_id)
        if batch.status != RunBatchStatus.CREATED:
            raise BatchNotPendingError(str(batch_id), batch.status.value)

        batch = batch.mark_running()
        self._zapisz(batch)

        for pozycja in batch.sorted_items():
            zaktualizowana = self._wykonaj_pozycje(klucz_twin, batch, pozycja)
            batch = batch.with_item(zaktualizowana)
            self._zapisz(batch)

        batch = batch.finalize(finished_at=datetime.now(UTC))
        self._zapisz(batch)
        logger.info(
            "Seria %s %s: %d/%d pozycji zakończonych",
            batch_id,
            batch.status.value,
            sum(1 for p in batch.items if p.status == ITEM_STATUS_FINISHED),
            len(batch.items),
        )
        return batch

    def _wykonaj_pozycje(
        self, klucz_twin: str, batch: RunBatch, pozycja: RunBatchItem
    ) -> RunBatchItem:
        """Wykonaj JEDNĄ pozycję — zawsze zwraca pozycję w stanie KOŃCOWYM
        (FINISHED/FAILED), nigdy nie podnosi wyjątku (awaria = FAILED, zero
        przerwania pętli wołającego — karta §0 C2)."""
        try:
            wpis = self._pobierz_zweryfikowany_scenariusz(klucz_twin, pozycja)
            scenario = wpis.fault_spec
            assert scenario is not None  # gwarantowane przez get_scenario_ze_wpisem
            self._brama_uprawnien(klucz_twin, pozycja.scenario_id)
            run = self._create_canonical_run(
                case_id=str(batch.case_id),
                klucz_twin=klucz_twin,
                project_id=None,
                analysis_type=_RODZAJ_ANALIZY_KANONICZNEJ,
                options=solver_input_for_scenario(scenario),
                # Koperta niesie `scenario_ref=(scenario_id, revision)` — BEZ
                # tego `FaultScenarioService.has_associated_runs` (wyprowadzone
                # z koperty) nie widziałby biegów serii i pozwoliłby usunąć
                # scenariusz z aktywnym biegiem serii.
                scenariusz=wpis,
            )
            run = self._execute_canonical_run(run.id)
            if run.status != "FINISHED":
                return RunBatchItem(
                    position=pozycja.position,
                    scenario_id=pozycja.scenario_id,
                    analysis_type=pozycja.analysis_type,
                    options_hash=pozycja.options_hash,
                    canonical_run_id=run.id,
                    status=ITEM_STATUS_FAILED,
                    error_message=run.error_message or "Bieg zakończył się niepowodzeniem",
                )
            return RunBatchItem(
                position=pozycja.position,
                scenario_id=pozycja.scenario_id,
                analysis_type=pozycja.analysis_type,
                options_hash=pozycja.options_hash,
                canonical_run_id=run.id,
                status=ITEM_STATUS_FINISHED,
                error_message=None,
            )
        except Exception as exc:
            logger.warning(
                "Seria %s: pozycja %d (scenariusz %s) FAILED: %s",
                batch.id,
                pozycja.position,
                pozycja.scenario_id,
                exc,
            )
            return RunBatchItem(
                position=pozycja.position,
                scenario_id=pozycja.scenario_id,
                analysis_type=pozycja.analysis_type,
                options_hash=pozycja.options_hash,
                canonical_run_id=None,
                status=ITEM_STATUS_FAILED,
                error_message=f"Scenariusz {pozycja.scenario_id}: {exc}",
            )

    def _pobierz_zweryfikowany_scenariusz(
        self, klucz: str, pozycja: RunBatchItem
    ) -> OperatingScenario:
        """Scenariusz (KOMPLETNY wpis magazynu) o treści IDENTYCZNEJ z przypiętą
        przy tworzeniu serii (`pozycja.options_hash`)."""
        try:
            wpis = self._scenario_service.get_scenario_ze_wpisem(klucz, pozycja.scenario_id)
        except FaultScenarioNotFoundError as exc:
            raise BatchExecutionError(
                "Scenariusz został usunięty po utworzeniu serii — utwórz serię ponownie"
            ) from exc
        scenario = wpis.fault_spec
        assert scenario is not None  # gwarantowane przez get_scenario_ze_wpisem
        if compute_scenario_content_hash(scenario) != pozycja.options_hash:
            raise BatchExecutionError(
                "Scenariusz został zmieniony po utworzeniu serii — utwórz serię ponownie"
            )
        return wpis

    def _brama_uprawnien(self, klucz: str, scenario_id: UUID) -> None:
        """Ta sama brama uprawnień, którą przechodzi pojedynczy bieg."""
        eligibility = self._scenario_service.check_scenario_eligibility(klucz, scenario_id)
        if eligibility.status.value == "INELIGIBLE":
            blokady = "; ".join(b.message_pl for b in eligibility.blockers)
            raise BatchExecutionError(f"Analiza zablokowana: {blokady}")

    # ------------------------------------------------------------------
    # Odczyt
    # ------------------------------------------------------------------

    def get_batch(self, batch_id: UUID) -> RunBatch:
        """Seria po identyfikatorze (`BatchNotFoundError` gdy brak)."""
        return self._get_batch(batch_id)

    def list_batches(self, study_case_id: UUID) -> list[RunBatch]:
        """Serie przypadku, najnowsze pierwsze (kolejność z repozytorium —
        `ORDER BY created_at DESC, id DESC`)."""
        with run_batch_repository_scope() as repo:
            return repo.list_by_case(str(study_case_id))

    def _get_batch(self, batch_id: UUID) -> RunBatch:
        with run_batch_repository_scope() as repo:
            batch = repo.get(batch_id)
        if batch is None:
            raise BatchNotFoundError(str(batch_id))
        return batch

    def _zapisz(self, batch: RunBatch) -> None:
        with run_batch_repository_scope() as repo:
            repo.save(batch)
