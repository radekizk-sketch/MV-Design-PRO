"""PR-6: Unified AnalysisDispatchService.

Single entry point for dispatching all analysis kinds:
  dispatch(analysis_kind, study_case_id, options) -> AnalysisRunSummary

Pipeline:
  1. Load StudyCase + ENM snapshot/hash
  2. Preflight gate (validation)
  3. Compute input_hash
  4. Dedup lookup
  5. If no dedup → run solver via existing service methods (NO solver changes)
  6. Store result in existing location
  7. Register/update AnalysisRun status
  8. Return unified AnalysisRunSummary
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from application.analysis_dispatch.summary import AnalysisRunSummary
from application.twin_key import klucz_twin_dla_projektu
from domain.analysis_kind import AnalysisKind
from domain.analysis_run import AnalysisRun
from infrastructure.persistence.unit_of_work import UnitOfWork

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Input hash computation — deterministic, canonical
# ---------------------------------------------------------------------------

_DETERMINISTIC_LIST_KEYS = {"nodes", "branches", "sources", "loads"}


def _canonicalize(value: Any, *, current_key: str | None = None) -> Any:
    """Recursively canonicalize a value for deterministic hashing."""
    if isinstance(value, dict):
        return {key: _canonicalize(value[key], current_key=key) for key in sorted(value.keys())}
    if isinstance(value, list):
        items = [_canonicalize(item, current_key=current_key) for item in value]
        if current_key in _DETERMINISTIC_LIST_KEYS:
            return sorted(items, key=_stable_list_key)
        return items
    return value


def _stable_list_key(item: Any) -> str:
    if isinstance(item, dict):
        for key in ("id", "node_id", "branch_id"):
            if key in item and item[key] is not None:
                return str(item[key])
    return str(item)


def compute_dispatch_input_hash(
    analysis_kind: AnalysisKind,
    study_case_id: UUID,
    enm_hash: str,
    solver_options: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
) -> str:
    """Build deterministic input_hash for deduplication.

    Components:
    - analysis_kind
    - study_case_id
    - enm_hash (canonical hash of the ENM/snapshot)
    - canonicalized solver options
    - extra (e.g. fault_spec for SC, protection_config_fingerprint for protection)
    """
    payload = {
        "analysis_kind": analysis_kind.value,
        "study_case_id": str(study_case_id),
        "enm_hash": enm_hash,
        "solver_options": _canonicalize(solver_options or {}),
    }
    if extra:
        payload["extra"] = _canonicalize(extra)
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# AnalysisDispatchService
# ---------------------------------------------------------------------------


class AnalysisDispatchService:
    """Unified dispatcher for all analysis kinds.

    Wraps existing AnalysisRunService and ProtectionAnalysisService.
    Does NOT change solver logic — only orchestrates dispatch.
    """

    def __init__(self, uow_factory: Callable[[], UnitOfWork]) -> None:
        self._uow_factory = uow_factory

    def dispatch(
        self,
        analysis_kind: AnalysisKind,
        project_id: UUID,
        study_case_id: UUID | None = None,
        options: dict[str, Any] | None = None,
    ) -> AnalysisRunSummary:
        """Unified dispatch entry point.

        Args:
            analysis_kind: Which analysis to run.
            project_id: Project UUID.
            study_case_id: Study case UUID (if None, uses active case).
            options: Solver-specific options dict.

        Returns:
            AnalysisRunSummary with unified shape.
        """
        if analysis_kind == AnalysisKind.SHORT_CIRCUIT:
            return self._dispatch_short_circuit(project_id, study_case_id, options)
        if analysis_kind == AnalysisKind.POWER_FLOW:
            return self._dispatch_power_flow(project_id, study_case_id, options)
        if analysis_kind == AnalysisKind.PROTECTION:
            return self._dispatch_protection(project_id, study_case_id, options)
        if analysis_kind == AnalysisKind.FAULT_LOOP_NN:
            return self._dispatch_fault_loop_nn(project_id, study_case_id, options)
        if analysis_kind == AnalysisKind.SWZ_NN:
            return self._dispatch_swz_nn(project_id, study_case_id, options)
        raise ValueError(f"Unsupported analysis_kind: {analysis_kind}")

    # ------------------------------------------------------------------
    # SHORT CIRCUIT
    # ------------------------------------------------------------------

    def _dispatch_short_circuit(
        self,
        project_id: UUID,
        study_case_id: UUID | None,
        options: dict[str, Any] | None,
    ) -> AnalysisRunSummary:
        from application.analysis_run.service import AnalysisRunService

        service = AnalysisRunService(self._uow_factory)
        opts = dict(options or {})
        fault_spec = opts.pop("fault_spec", None)
        if fault_spec is None:
            raise ValueError("fault_spec is required for SHORT_CIRCUIT dispatch")

        # Step 1-2: resolve case, build snapshot (done inside service)
        # Step 3: compute dispatch-level input_hash for dedup
        enm_hash = self._get_enm_hash(project_id, study_case_id)
        resolved_case_id = self._resolve_case_id(project_id, study_case_id)
        dispatch_hash = compute_dispatch_input_hash(
            analysis_kind=AnalysisKind.SHORT_CIRCUIT,
            study_case_id=resolved_case_id,
            enm_hash=enm_hash,
            solver_options=opts,
            extra={"fault_spec": fault_spec},
        )

        # Step 4: dedup lookup
        dedup_run = self._find_dedup_candidate(
            project_id,
            resolved_case_id,
            "short_circuit_sn",
            dispatch_hash,
        )
        if dedup_run is not None:
            return self._build_summary_from_run(
                dedup_run,
                AnalysisKind.SHORT_CIRCUIT,
                enm_hash,
                deduplicated=True,
            )

        # Step 5-7: create + execute
        run = service.create_short_circuit_run(
            project_id=project_id,
            operating_case_id=study_case_id,
            fault_spec=fault_spec,
            options=opts or None,
        )
        executed = service.execute_run(run.id)

        return self._build_summary_from_run(
            executed,
            AnalysisKind.SHORT_CIRCUIT,
            enm_hash,
            deduplicated=False,
        )

    # ------------------------------------------------------------------
    # POWER FLOW
    # ------------------------------------------------------------------

    def _dispatch_power_flow(
        self,
        project_id: UUID,
        study_case_id: UUID | None,
        options: dict[str, Any] | None,
    ) -> AnalysisRunSummary:
        from application.analysis_run.service import AnalysisRunService

        service = AnalysisRunService(self._uow_factory)
        opts = dict(options or {})
        if "trace_level" not in opts:
            opts["trace_level"] = "summary"

        enm_hash = self._get_enm_hash(project_id, study_case_id)
        resolved_case_id = self._resolve_case_id(project_id, study_case_id)
        dispatch_hash = compute_dispatch_input_hash(
            analysis_kind=AnalysisKind.POWER_FLOW,
            study_case_id=resolved_case_id,
            enm_hash=enm_hash,
            solver_options=opts,
        )

        # Dedup lookup
        dedup_run = self._find_dedup_candidate(
            project_id,
            resolved_case_id,
            "PF",
            dispatch_hash,
        )
        if dedup_run is not None:
            return self._build_summary_from_run(
                dedup_run,
                AnalysisKind.POWER_FLOW,
                enm_hash,
                deduplicated=True,
            )

        # create + execute (PF create already has internal dedup, but we add
        # dispatch-level dedup as well for consistency)
        run = service.create_power_flow_run(
            project_id=project_id,
            operating_case_id=study_case_id,
            options=opts,
        )
        # If the PF create already deduped and the run is FINISHED, skip execute
        if run.status != "FINISHED":
            run = service.execute_run(run.id)

        return self._build_summary_from_run(
            run,
            AnalysisKind.POWER_FLOW,
            enm_hash,
            deduplicated=False,
        )

    # ------------------------------------------------------------------
    # PROTECTION
    # ------------------------------------------------------------------

    def _dispatch_protection(
        self,
        project_id: UUID,
        study_case_id: UUID | None,
        options: dict[str, Any] | None,
    ) -> AnalysisRunSummary:
        from application.protection_analysis.service import ProtectionAnalysisService

        service = ProtectionAnalysisService(self._uow_factory)
        opts = dict(options or {})
        sc_run_id = opts.pop("sc_run_id", None)
        protection_case_id_str = opts.pop("protection_case_id", None)

        if sc_run_id is None:
            raise ValueError("sc_run_id is required for PROTECTION dispatch")
        if protection_case_id_str is None:
            raise ValueError("protection_case_id is required for PROTECTION dispatch")

        protection_case_id = UUID(str(protection_case_id_str))

        # Protection doesn't use ENM hash directly — it uses SC run as input
        enm_hash = f"sc_run:{sc_run_id}"

        run = service.create_run(
            project_id=project_id,
            sc_run_id=str(sc_run_id),
            protection_case_id=protection_case_id,
        )

        # Execute if not already finished (create_run may return cached)
        from domain.protection_analysis import ProtectionRunStatus

        if run.status not in {ProtectionRunStatus.FINISHED, ProtectionRunStatus.FAILED}:
            run = service.execute_run(run.id)

        return AnalysisRunSummary(
            run_id=str(run.id),
            analysis_kind=AnalysisKind.PROTECTION.value,
            status=run.status.value if hasattr(run.status, "value") else str(run.status),
            created_at=run.created_at,
            finished_at=run.finished_at,
            input_hash=run.input_hash,
            enm_hash=enm_hash,
            results_valid=True,
            deduplicated=False,
            result_location=f"/api/protection-runs/{run.id}/results",
            error_message=run.error_message,
        )

    # ------------------------------------------------------------------
    # FAULT_LOOP_NN (karta G-22)
    # ------------------------------------------------------------------

    def _dispatch_fault_loop_nn(
        self,
        project_id: UUID,
        study_case_id: UUID | None,
        options: dict[str, Any] | None,
    ) -> AnalysisRunSummary:
        """Pętla zwarcia nN (IEC 60364-4-41) — woła WPROST istniejące funkcje
        serwisowe P0.6 (`application.analyses.fault_loop.service`), zero
        kopii fizyki (§0.3 karty G-22).

        Model nN żyje w ``enm.store`` (magazyn plikowy kluczowany
        ``case_id: str`` — TA SAMA przestrzeń identyfikatorów, której
        używają WSZYSTKIE endpointy nN pod ``/api/cases/{case_id}/...``,
        `api/enm.py`), NIE w migawce ``OperatingCase``/``NetworkGraph``,
        z której korzystają SHORT_CIRCUIT/POWER_FLOW/PROTECTION powyżej —
        te dwie warstwy sieciowe współistnieją w repo (zob. inwentarz w
        raporcie karty). ``study_case_id`` rozwiązujemy przez ISTNIEJĄCY
        ``_resolve_case_id`` (ta sama rezolucja "None → aktywny przypadek"
        co pozostałe rodzaje) i używamy wyniku jako ``case_id`` — bez
        wymyślania nowej przestrzeni identyfikatorów ani mostu do
        ``NetworkGraph``.

        Wynik NIE jest persystowany jako ``AnalysisRun`` — fault_loop to
        odczyt/przeliczenie na BIEŻĄCYM modelu ENM (jak pozostałe endpointy
        `api/enm.py`), nie długotrwały bieg solvera z historią do
        deduplikacji. ``run_id``/``input_hash`` to deterministyczny odcisk
        wejścia (ten sam wzorzec co ``compute_dispatch_input_hash``), a
        ``result_location`` wskazuje ISTNIEJĄCY endpoint odczytu, żeby
        wywołujący mógł dociągnąć pełny ślad obliczeniowy.
        """
        from application.analyses.fault_loop.service import (
            build_fault_loop_view_at_point,
            build_feeder_fault_loop_view,
        )
        from enm.store import get_enm

        opts = dict(options or {})
        station_ref = opts.pop("station_ref", None)
        if not station_ref:
            raise ValueError("station_ref is required for FAULT_LOOP_NN dispatch")
        bus_ref = opts.pop("bus_ref", None)

        resolved_case_id = self._resolve_case_id(project_id, study_case_id)
        case_id_str = str(resolved_case_id)
        # CV-1-W: model ENM zyje pod kluczem projektu, nie surowym case_id.
        # `project_id` jest juz jawnym, zweryfikowanym argumentem `dispatch()`
        # (`_resolve_case_id` powyzej odrzuca `study_case_id` nienalezacy do
        # `project_id`), wiec klucz magazynu budujemy WPROST z `project_id` —
        # BEZ posredniego `klucz_twin_dla_przypadku` (zapytanie o StudyCase).
        # `resolved_case_id` jest identyfikatorem OperatingCase (ta sama
        # przestrzen, ktorej uzywaja `_resolve_case_id`/`_get_enm_hash` dla
        # WSZYSTKICH rodzajow analiz w tej klasie — `uow.cases.get_operating_case`),
        # NIE StudyCase: zapytanie o StudyCase o tym id zawsze zwroci `None`
        # (dwie oddzielne tabele, `infrastructure/persistence/repositories/
        # case_repository.py`), wiec `klucz_twin_dla_przypadku` tutaj zawsze
        # konczyloby sie `PrzypadekBezProjektuError`, niezaleznie od tego, czy
        # przypadek istnieje.
        # ADRES PROJEKTU IDZIE PRZEZ `klucz_twin_dla_projektu`, nie przez czysty
        # `klucz_twin_projektu` (przeglad adwersaryjny CV-1): ta sciezka bywa
        # PIERWSZYM dostepem do magazynu w procesie, a czysta funkcja klucza nie
        # uruchamia migracji zastanych plikow per przypadek — `get_enm` tworzylby
        # wtedy PUSTY model domyslny i realny model projektanta ladowalby pozniej
        # w `legacy_przypadki/` jako ROZBIEZNY.
        klucz_twin = klucz_twin_dla_projektu(project_id, self._uow_factory)
        enm = get_enm(klucz_twin)

        if bus_ref:
            result = build_fault_loop_view_at_point(enm, station_ref, bus_ref)
            result_location = (
                f"/api/cases/{case_id_str}/enm/fault-loop-point"
                f"?station_ref={station_ref}&bus_ref={bus_ref}"
            )
        else:
            result = build_feeder_fault_loop_view(enm, station_ref)
            result_location = (
                f"/api/cases/{case_id_str}/enm/fault-loop-feeders?station_ref={station_ref}"
            )

        dispatch_hash = compute_dispatch_input_hash(
            analysis_kind=AnalysisKind.FAULT_LOOP_NN,
            study_case_id=resolved_case_id,
            enm_hash=enm.header.hash_sha256,
            solver_options=opts,
            extra={"station_ref": station_ref, "bus_ref": bus_ref},
        )

        return self._summary_from_nn_query_result(
            analysis_kind=AnalysisKind.FAULT_LOOP_NN,
            dispatch_hash=dispatch_hash,
            enm_hash=enm.header.hash_sha256,
            result=result,
            result_location=result_location,
        )

    # ------------------------------------------------------------------
    # SWZ_NN (karta G-22)
    # ------------------------------------------------------------------

    def _dispatch_swz_nn(
        self,
        project_id: UUID,
        study_case_id: UUID | None,
        options: dict[str, Any] | None,
    ) -> AnalysisRunSummary:
        """Werdykt SWZ per obwód nN — woła WPROST
        ``application.analyses.swz.service.build_swz_view`` (P0.6), zero
        kopii logiki. Zob. docstring ``_dispatch_fault_loop_nn`` — ta sama
        przestrzeń identyfikatorów ``case_id`` (``enm.store``), ten sam
        brak persystencji jako ``AnalysisRun``.
        """
        from application.analyses.swz.service import build_swz_view
        from enm.store import get_enm

        opts = dict(options or {})
        station_ref = opts.pop("station_ref", None)
        bus_ref = opts.pop("bus_ref", None)
        breaker_ref = opts.pop("breaker_ref", None)
        if not station_ref:
            raise ValueError("station_ref is required for SWZ_NN dispatch")
        if not bus_ref:
            raise ValueError("bus_ref is required for SWZ_NN dispatch")
        if not breaker_ref:
            raise ValueError("breaker_ref is required for SWZ_NN dispatch")

        resolved_case_id = self._resolve_case_id(project_id, study_case_id)
        case_id_str = str(resolved_case_id)
        # CV-1-W: model ENM zyje pod kluczem projektu — patrz uzasadnienie
        # przy `_dispatch_fault_loop_nn` (ten sam mechanizm, `resolved_case_id`
        # jest identyfikatorem OperatingCase, nie StudyCase; adres projektu idzie
        # przez `klucz_twin_dla_projektu`, zeby migracja plikow zastanych nie
        # zostala pominieta).
        klucz_twin = klucz_twin_dla_projektu(project_id, self._uow_factory)
        enm = get_enm(klucz_twin)

        result = build_swz_view(enm, station_ref, bus_ref, breaker_ref)
        result_location = (
            f"/api/cases/{case_id_str}/enm/swz"
            f"?station_ref={station_ref}&bus_ref={bus_ref}&breaker_ref={breaker_ref}"
        )

        dispatch_hash = compute_dispatch_input_hash(
            analysis_kind=AnalysisKind.SWZ_NN,
            study_case_id=resolved_case_id,
            enm_hash=enm.header.hash_sha256,
            solver_options=opts,
            extra={"station_ref": station_ref, "bus_ref": bus_ref, "breaker_ref": breaker_ref},
        )

        return self._summary_from_nn_query_result(
            analysis_kind=AnalysisKind.SWZ_NN,
            dispatch_hash=dispatch_hash,
            enm_hash=enm.header.hash_sha256,
            result=result,
            result_location=result_location,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _resolve_case_id(self, project_id: UUID, study_case_id: UUID | None) -> UUID:
        """Resolve study_case_id using ActiveCaseService if None."""
        from application.active_case import ActiveCaseService

        svc = ActiveCaseService(self._uow_factory)
        active = svc.get_active_case_id(project_id)
        if active is None:
            raise ValueError(f"No active case set for project {project_id}")
        if study_case_id is not None and study_case_id != active:
            raise ValueError(
                f"Case {study_case_id} is not the active case for project {project_id}"
            )
        return active

    def _get_enm_hash(self, project_id: UUID, study_case_id: UUID | None) -> str:
        """Get the ENM snapshot hash for the current project state.

        Uses the active snapshot ID from the operating case as the ENM identity.
        """
        try:
            resolved_case_id = self._resolve_case_id(project_id, study_case_id)
            with self._uow_factory() as uow:
                case = uow.cases.get_operating_case(resolved_case_id)
                if case is not None:
                    snapshot_id = (case.case_payload or {}).get("active_snapshot_id")
                    if snapshot_id:
                        return str(snapshot_id)
        except Exception:
            pass
        return ""

    def _find_dedup_candidate(
        self,
        project_id: UUID,
        operating_case_id: UUID,
        analysis_type: str,
        dispatch_hash: str,
    ) -> AnalysisRun | None:
        """Look for an existing FINISHED run with matching dispatch_hash.

        Only returns runs where result_status is VALID (not OUTDATED/stale).
        This integrates with PR-5's stale results mechanism.
        """
        with self._uow_factory() as uow:
            # Use the existing repository method to find by deterministic key
            candidate = uow.analysis_runs.get_by_deterministic_key(
                project_id=project_id,
                operating_case_id=operating_case_id,
                analysis_type=analysis_type,
                input_hash=dispatch_hash,
            )
            if candidate is None:
                return None
            # Must be FINISHED and results_valid (PR-5 integration)
            if candidate.status != "FINISHED":
                return None
            if candidate.result_status == "OUTDATED":
                logger.info(
                    "Dedup candidate %s found but results are OUTDATED (stale) — forcing new run",
                    candidate.id,
                )
                return None
            return candidate

    def _build_summary_from_run(
        self,
        run: AnalysisRun,
        analysis_kind: AnalysisKind,
        enm_hash: str,
        *,
        deduplicated: bool,
    ) -> AnalysisRunSummary:
        """Build AnalysisRunSummary from an AnalysisRun domain object."""
        results_valid = run.result_status != "OUTDATED"
        # Adres wyniku jest ADRESEM HTTP, wiec musi byc kanoniczny (`/api/...`)
        # juz w zrodle. Wczesniej trzy miejsca emitowaly go BEZ `/api`, a doklejal
        # go — tylko dla zwarc — jeden konsument (`api/unified_runs.py`). Rozplyw
        # i zabezpieczenia dostawaly adres, ktorego zaden router nie serwowal.
        result_location: str | None = None
        if analysis_kind == AnalysisKind.SHORT_CIRCUIT:
            result_location = f"/api/analysis-runs/{run.id}/results"
        elif analysis_kind == AnalysisKind.POWER_FLOW:
            result_location = f"/api/power-flow-runs/{run.id}/results"

        return AnalysisRunSummary(
            run_id=str(run.id),
            analysis_kind=analysis_kind.value,
            status=run.status,
            created_at=run.created_at,
            finished_at=run.finished_at,
            input_hash=run.input_hash,
            enm_hash=enm_hash,
            results_valid=results_valid,
            deduplicated=deduplicated,
            result_location=result_location,
            error_message=run.error_message,
        )

    @staticmethod
    def _summary_from_nn_query_result(
        *,
        analysis_kind: AnalysisKind,
        dispatch_hash: str,
        enm_hash: str,
        result: dict[str, Any],
        result_location: str,
    ) -> AnalysisRunSummary:
        """Zbuduj ``AnalysisRunSummary`` z odpowiedzi serwisu P0.6 (dict,
        nie ``AnalysisRun``). Mapowanie statusu — status serwisu → status
        dispatchu, JEDNO źródło prawdy dla OBU nowych rodzajów (KLASA NIE
        INSTANCJA: FAULT_LOOP_NN i SWZ_NN dzielą DOKŁADNIE ten sam kształt
        odpowiedzi P0.6, ``{"status": "OK"|"brak danych"|"nie dotyczy", ...}``).

        - "OK": obliczenie kompletne → FINISHED, bez błędu.
        - "nie dotyczy": uczciwa, deterministyczna odpowiedź domenowa (np.
          układ TT/IT — metoda pętli TN nie ma zastosowania) → FINISHED,
          bez błędu; uzasadnienie w ``result_location``, nie fabrykujemy go
          w ``error_message`` (to nie jest błąd).
        - inny status ("brak danych"): obliczenie NIE mogło się wykonać →
          FAILED, ``error_message`` z uczciwym powodem (``reason_pl`` albo
          lista ``missing_data``, nigdy pusty tekst).
        """
        status = result.get("status")
        now = datetime.now(UTC)

        if status in ("OK", "nie dotyczy"):
            return AnalysisRunSummary(
                run_id=dispatch_hash,
                analysis_kind=analysis_kind.value,
                status="FINISHED",
                created_at=now,
                finished_at=now,
                input_hash=dispatch_hash,
                enm_hash=enm_hash,
                results_valid=True,
                deduplicated=False,
                result_location=result_location,
                error_message=None,
            )

        reason = result.get("reason_pl")
        missing = result.get("missing_data")
        if not reason and missing:
            reason = "Brak danych wejściowych: " + ", ".join(missing)
        return AnalysisRunSummary(
            run_id=dispatch_hash,
            analysis_kind=analysis_kind.value,
            status="FAILED",
            created_at=now,
            finished_at=now,
            input_hash=dispatch_hash,
            enm_hash=enm_hash,
            results_valid=False,
            deduplicated=False,
            result_location=result_location,
            error_message=reason or "Brak danych wejściowych do obliczenia.",
        )
