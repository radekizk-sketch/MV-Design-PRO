"""
Project Archive Service — P31.

Serwis eksportu i importu projektów MV-DESIGN PRO.

KANON:
- Import/Export = NOT-A-SOLVER
- Zero nowych obliczeń
- Determinizm absolutny
- Read-only restore (bez przeliczania)
"""

from __future__ import annotations

import io
import json
import zipfile
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from domain.project_archive import (
    ARCHIVE_FORMAT_ID,
    ARCHIVE_SCHEMA_VERSION,
    ArchiveError,
    ArchiveImportResult,
    ArchiveImportStatus,
    CasesSection,
    EnmSection,
    InterpretationsSection,
    IssuesSection,
    NetworkModelSection,
    ProjectArchive,
    ProjectMeta,
    ProofsSection,
    ResultsSection,
    RunsSection,
    SldSection,
    archive_to_dict,
    compute_archive_fingerprints,
    compute_hash,
    dict_to_archive,
    verify_archive_integrity,
)
from enm.klucz_twin import klucz_twin_projektu
from enm.store import get_enm, has_enm, migruj_klucz_przypadku_do_projektu, restore_enm
from network_model.catalog.governance import wymaga_referencji_katalogowej
from sqlalchemy import select
from sqlalchemy.orm import Session

if TYPE_CHECKING:
    pass

from infrastructure.persistence.models import (
    AnalysisRunIndexORM,
    AnalysisRunORM,
    DesignEvidenceORM,
    DesignProposalORM,
    DesignSpecORM,
    NetworkBranchORM,
    NetworkLoadORM,
    NetworkNodeORM,
    NetworkSnapshotORM,
    NetworkSourceORM,
    OperatingCaseORM,
    ProjectORM,
    ProjectSettingsORM,
    SldAnnotationORM,
    SldBranchSymbolORM,
    SldDiagramORM,
    SldNodeSymbolORM,
    StudyCaseORM,
    StudyResultORM,
    StudyRunORM,
    SwitchingStateORM,
)


class ProjectArchiveService:
    """
    Serwis eksportu i importu projektów.

    Odpowiedzialność:
    - Export: zbierz wszystkie dane projektu → ProjectArchive → ZIP
    - Import: ZIP → ProjectArchive → walidacja → zapis do DB
    """

    def __init__(self, session: Session) -> None:
        self._session = session

    # ========================================================================
    # EXPORT
    # ========================================================================

    def export_project(self, project_id: UUID) -> bytes:
        """
        Eksportuj projekt do archiwum ZIP.

        Args:
            project_id: ID projektu do eksportu

        Returns:
            Bajty archiwum ZIP

        Raises:
            ArchiveError: gdy projekt nie istnieje lub eksport się nie powiódł
        """
        # Pobierz projekt
        project = self._session.get(ProjectORM, project_id)
        if project is None:
            raise ArchiveError(f"Projekt o ID {project_id} nie istnieje")

        # Zbierz wszystkie dane
        archive = self._collect_project_data(project)

        # Konwertuj do JSON
        archive_dict = archive_to_dict(archive)
        archive_json = json.dumps(
            archive_dict, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        )

        # Utwórz ZIP
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("project.json", archive_json)
            # Dodaj manifest
            manifest = {
                "format_id": ARCHIVE_FORMAT_ID,
                "schema_version": ARCHIVE_SCHEMA_VERSION,
                "project_name": project.name,
                "exported_at": datetime.now(UTC).isoformat(),
                "archive_hash": archive.fingerprints.archive_hash,
            }
            zf.writestr(
                "manifest.json",
                json.dumps(manifest, sort_keys=True, indent=2, ensure_ascii=False),
            )

        return zip_buffer.getvalue()

    def _collect_project_data(self, project: ProjectORM) -> ProjectArchive:
        """Zbierz wszystkie dane projektu."""
        project_id = project.id

        # Metadane projektu (bez exported_at - dla determinizmu)
        project_meta_dict = {
            "id": str(project.id),
            "name": project.name,
            "description": project.description,
            "schema_version": project.schema_version,
            "active_network_snapshot_id": project.active_network_snapshot_id,
            "connection_node_id": (
                str(project.connection_node_id) if project.connection_node_id else None
            ),
            "sources": project.sources_jsonb,
            "created_at": project.created_at.isoformat(),
            "updated_at": project.updated_at.isoformat(),
        }

        # Model sieci
        network_model_dict = self._collect_network_model(project_id)

        # SLD
        sld_dict = self._collect_sld(project_id)

        # Cases
        cases_dict = self._collect_cases(project_id)

        # Runs
        runs_dict = self._collect_runs(project_id)

        # Results
        results_dict = self._collect_results(project_id)

        # Proofs
        proofs_dict = self._collect_proofs(project_id)

        # Interpretations (placeholder)
        interpretations_dict: dict[str, Any] = {"cached": []}

        # Issues (placeholder - generowane dynamicznie)
        issues_dict: dict[str, Any] = {"snapshot": []}

        # ENM (model EnergyNetworkModel projektu, wpis per przypadek — N-D1, CV-1-W)
        enm_dict = self._collect_enm(project_id, cases_dict)

        # Oblicz fingerprints
        fingerprints = compute_archive_fingerprints(
            project_meta=project_meta_dict,
            network_model=network_model_dict,
            sld=sld_dict,
            cases=cases_dict,
            runs=runs_dict,
            results=results_dict,
            proofs=proofs_dict,
            interpretations=interpretations_dict,
            issues=issues_dict,
            enm=enm_dict,
        )

        # Utwórz archiwum
        return ProjectArchive(
            schema_version=ARCHIVE_SCHEMA_VERSION,
            format_id=ARCHIVE_FORMAT_ID,
            project_meta=ProjectMeta(
                id=str(project.id),
                name=project.name,
                description=project.description,
                schema_version=project.schema_version,
                active_network_snapshot_id=project.active_network_snapshot_id,
                connection_node_id=(
                    str(project.connection_node_id) if project.connection_node_id else None
                ),
                sources=project.sources_jsonb,
                created_at=project.created_at.isoformat(),
                updated_at=project.updated_at.isoformat(),
            ),
            network_model=NetworkModelSection(
                nodes=network_model_dict["nodes"],
                branches=network_model_dict["branches"],
                sources=network_model_dict["sources"],
                loads=network_model_dict["loads"],
                snapshots=network_model_dict["snapshots"],
            ),
            sld_diagrams=SldSection(
                diagrams=sld_dict["diagrams"],
                node_symbols=sld_dict["node_symbols"],
                branch_symbols=sld_dict["branch_symbols"],
                annotations=sld_dict["annotations"],
            ),
            cases=CasesSection(
                study_cases=cases_dict["study_cases"],
                operating_cases=cases_dict["operating_cases"],
                switching_states=cases_dict["switching_states"],
                settings=cases_dict["settings"],
            ),
            runs=RunsSection(
                analysis_runs=runs_dict["analysis_runs"],
                analysis_runs_index=runs_dict["analysis_runs_index"],
                study_runs=runs_dict["study_runs"],
            ),
            results=ResultsSection(
                study_results=results_dict["study_results"],
            ),
            proofs=ProofsSection(
                design_specs=proofs_dict["design_specs"],
                design_proposals=proofs_dict["design_proposals"],
                design_evidence=proofs_dict["design_evidence"],
            ),
            interpretations=InterpretationsSection(
                cached=interpretations_dict["cached"],
            ),
            issues=IssuesSection(
                snapshot=issues_dict["snapshot"],
            ),
            enm=EnmSection(
                models=enm_dict["models"],
            ),
            fingerprints=fingerprints,
        )

    def _collect_enm(self, project_id: UUID, cases_dict: dict[str, Any]) -> dict[str, Any]:
        """Zbierz model ENM projektu i zapisz go pod KAŻDYM jego przypadkiem (N-D1, CV-1-W).

        CV-1-W: magazyn ENM (enm/store.py) jest kluczowany kluczem Canonical
        Project Twin (`projekt:<uuid>`) — WSZYSTKIE przypadki jednego projektu
        czytają JEDEN model, więc model czytamy RAZ, pod kluczem PROJEKTU (nie
        per przypadek). Kontrakt sekcji `EnmSection` (`domain/project_archive.
        py`) i test round-trip (`tests/application/project_archive/
        test_enm_archive_section.py`) niosą jednak WPIS PER `case_id` — ten
        kształt zostaje NIETKNIĘTY (addytywny import/eksport, zero migracji
        schematu archiwum): każdy przypadek dostaje wpis z TĄ SAMĄ treścią
        modelu projektu. Brak modelu (projekt jeszcze bez ENM) → pusta lista,
        zero fabrykacji.
        """
        case_ids: set[str] = set()
        for case_data in cases_dict.get("study_cases", []):
            case_ids.add(str(case_data["id"]))
        for case_data in cases_dict.get("operating_cases", []):
            case_ids.add(str(case_data["id"]))

        klucz_projektu = klucz_twin_projektu(project_id)
        models: list[dict[str, Any]] = []
        if has_enm(klucz_projektu):
            snapshot = get_enm(klucz_projektu).model_dump(mode="json")
            for case_id in sorted(case_ids):
                models.append({"case_id": case_id, "snapshot": snapshot})
        return {"models": models}

    def _collect_network_model(self, project_id: UUID) -> dict[str, Any]:
        """Zbierz model sieci."""
        # Nodes - sortowane po ID dla determinizmu
        nodes_query = (
            select(NetworkNodeORM)
            .where(NetworkNodeORM.project_id == project_id)
            .order_by(NetworkNodeORM.id)
        )
        nodes = self._session.execute(nodes_query).scalars().all()
        nodes_data = [
            {
                "id": str(n.id),
                "name": n.name,
                "node_type": n.node_type,
                "base_kv": n.base_kv,
                "attrs_jsonb": n.attrs_jsonb,
            }
            for n in nodes
        ]

        # Branches
        branches_query = (
            select(NetworkBranchORM)
            .where(NetworkBranchORM.project_id == project_id)
            .order_by(NetworkBranchORM.id)
        )
        branches = self._session.execute(branches_query).scalars().all()
        branches_data = [
            {
                "id": str(b.id),
                "name": b.name,
                "branch_type": b.branch_type,
                "from_node_id": str(b.from_node_id),
                "to_node_id": str(b.to_node_id),
                "in_service": b.in_service,
                "params_jsonb": b.params_jsonb,
            }
            for b in branches
        ]

        # Sources
        sources_query = (
            select(NetworkSourceORM)
            .where(NetworkSourceORM.project_id == project_id)
            .order_by(NetworkSourceORM.id)
        )
        sources = self._session.execute(sources_query).scalars().all()
        sources_data = [
            {
                "id": str(s.id),
                "node_id": str(s.node_id),
                "source_type": s.source_type,
                "payload_jsonb": s.payload_jsonb,
                "in_service": s.in_service,
            }
            for s in sources
        ]

        # Loads
        loads_query = (
            select(NetworkLoadORM)
            .where(NetworkLoadORM.project_id == project_id)
            .order_by(NetworkLoadORM.id)
        )
        loads = self._session.execute(loads_query).scalars().all()
        loads_data = [
            {
                "id": str(lo.id),
                "node_id": str(lo.node_id),
                "payload_jsonb": lo.payload_jsonb,
                "in_service": lo.in_service,
            }
            for lo in loads
        ]

        # Snapshots
        snapshots_query = select(NetworkSnapshotORM).order_by(NetworkSnapshotORM.created_at)
        snapshots = self._session.execute(snapshots_query).scalars().all()
        # Filtruj snapshoty należące do tego projektu (sprawdzając network_model_id)
        snapshots_data = [
            {
                "snapshot_id": s.snapshot_id,
                "parent_snapshot_id": s.parent_snapshot_id,
                "created_at": s.created_at.isoformat(),
                "schema_version": s.schema_version,
                "network_model_id": s.network_model_id,
                "fingerprint": s.fingerprint,
                "snapshot_json": s.snapshot_json,
            }
            for s in snapshots
            if s.network_model_id == str(project_id)
        ]

        return {
            "nodes": nodes_data,
            "branches": branches_data,
            "sources": sources_data,
            "loads": loads_data,
            "snapshots": snapshots_data,
        }

    def _collect_sld(self, project_id: UUID) -> dict[str, Any]:
        """Zbierz diagramy SLD."""
        # Diagrams
        diagrams_query = (
            select(SldDiagramORM)
            .where(SldDiagramORM.project_id == project_id)
            .order_by(SldDiagramORM.id)
        )
        diagrams = self._session.execute(diagrams_query).scalars().all()
        diagrams_data = [
            {
                "id": str(d.id),
                "name": d.name,
                "sld_jsonb": d.sld_jsonb,
                "dirty_flag": d.dirty_flag,
                "created_at": d.created_at.isoformat(),
                "updated_at": d.updated_at.isoformat(),
            }
            for d in diagrams
        ]

        diagram_ids = [d.id for d in diagrams]

        # Node symbols
        node_symbols_data = []
        if diagram_ids:
            node_symbols_query = (
                select(SldNodeSymbolORM)
                .where(SldNodeSymbolORM.diagram_id.in_(diagram_ids))
                .order_by(SldNodeSymbolORM.id)
            )
            node_symbols = self._session.execute(node_symbols_query).scalars().all()
            node_symbols_data = [
                {
                    "id": str(ns.id),
                    "diagram_id": str(ns.diagram_id),
                    "node_id": str(ns.node_id),
                    "x": ns.x,
                    "y": ns.y,
                    "label": ns.label,
                    "is_connection_node": ns.is_connection_node,
                }
                for ns in node_symbols
            ]

        # Branch symbols
        branch_symbols_data = []
        if diagram_ids:
            branch_symbols_query = (
                select(SldBranchSymbolORM)
                .where(SldBranchSymbolORM.diagram_id.in_(diagram_ids))
                .order_by(SldBranchSymbolORM.id)
            )
            branch_symbols = self._session.execute(branch_symbols_query).scalars().all()
            branch_symbols_data = [
                {
                    "id": str(bs.id),
                    "diagram_id": str(bs.diagram_id),
                    "branch_id": str(bs.branch_id),
                    "from_node_id": str(bs.from_node_id),
                    "to_node_id": str(bs.to_node_id),
                    "points_jsonb": bs.points_jsonb,
                }
                for bs in branch_symbols
            ]

        # Annotations
        annotations_data = []
        if diagram_ids:
            annotations_query = (
                select(SldAnnotationORM)
                .where(SldAnnotationORM.diagram_id.in_(diagram_ids))
                .order_by(SldAnnotationORM.id)
            )
            annotations = self._session.execute(annotations_query).scalars().all()
            annotations_data = [
                {
                    "id": str(a.id),
                    "diagram_id": str(a.diagram_id),
                    "text": a.text,
                    "x": a.x,
                    "y": a.y,
                }
                for a in annotations
            ]

        return {
            "diagrams": diagrams_data,
            "node_symbols": node_symbols_data,
            "branch_symbols": branch_symbols_data,
            "annotations": annotations_data,
        }

    def _collect_cases(self, project_id: UUID) -> dict[str, Any]:
        """Zbierz przypadki obliczeniowe."""
        # Study cases
        study_cases_query = (
            select(StudyCaseORM)
            .where(StudyCaseORM.project_id == project_id)
            .order_by(StudyCaseORM.id)
        )
        study_cases = self._session.execute(study_cases_query).scalars().all()
        study_cases_data = [
            {
                "id": str(sc.id),
                "name": sc.name,
                "description": sc.description,
                "network_snapshot_id": sc.network_snapshot_id,
                "study_jsonb": sc.study_jsonb,
                "is_active": sc.is_active,
                "result_status": sc.result_status,
                "result_refs_jsonb": sc.result_refs_jsonb,
                "revision": sc.revision,
                "created_at": sc.created_at.isoformat(),
                "updated_at": sc.updated_at.isoformat(),
            }
            for sc in study_cases
        ]

        # Operating cases
        operating_cases_query = (
            select(OperatingCaseORM)
            .where(OperatingCaseORM.project_id == project_id)
            .order_by(OperatingCaseORM.id)
        )
        operating_cases = self._session.execute(operating_cases_query).scalars().all()
        operating_cases_data = [
            {
                "id": str(oc.id),
                "name": oc.name,
                "case_jsonb": oc.case_jsonb,
                "project_design_mode": oc.project_design_mode,
                "created_at": oc.created_at.isoformat(),
                "updated_at": oc.updated_at.isoformat(),
            }
            for oc in operating_cases
        ]

        operating_case_ids = [oc.id for oc in operating_cases]

        # Switching states
        switching_states_data = []
        if operating_case_ids:
            switching_states_query = (
                select(SwitchingStateORM)
                .where(SwitchingStateORM.case_id.in_(operating_case_ids))
                .order_by(SwitchingStateORM.id)
            )
            switching_states = self._session.execute(switching_states_query).scalars().all()
            switching_states_data = [
                {
                    "id": str(ss.id),
                    "case_id": str(ss.case_id),
                    "element_id": str(ss.element_id),
                    "element_type": ss.element_type,
                    "in_service": ss.in_service,
                }
                for ss in switching_states
            ]

        # Project settings
        settings_orm = self._session.get(ProjectSettingsORM, project_id)
        settings_data = None
        if settings_orm:
            settings_data = {
                "connection_node_id": (
                    str(settings_orm.connection_node_id)
                    if settings_orm.connection_node_id
                    else None
                ),
                "active_case_id": (
                    str(settings_orm.active_case_id) if settings_orm.active_case_id else None
                ),
                "grounding_jsonb": settings_orm.grounding_jsonb,
                "limits_jsonb": settings_orm.limits_jsonb,
            }

        return {
            "study_cases": study_cases_data,
            "operating_cases": operating_cases_data,
            "switching_states": switching_states_data,
            "settings": settings_data,
        }

    def _collect_runs(self, project_id: UUID) -> dict[str, Any]:
        """Zbierz wykonania analiz."""
        # Analysis runs
        analysis_runs_query = (
            select(AnalysisRunORM)
            .where(AnalysisRunORM.project_id == project_id)
            .order_by(AnalysisRunORM.created_at)
        )
        analysis_runs = self._session.execute(analysis_runs_query).scalars().all()
        analysis_runs_data = [
            {
                "id": str(ar.id),
                "operating_case_id": str(ar.operating_case_id),
                "analysis_type": ar.analysis_type,
                "status": ar.status,
                "result_status": ar.result_status,
                "created_at": ar.created_at.isoformat(),
                "started_at": ar.started_at.isoformat() if ar.started_at else None,
                "finished_at": ar.finished_at.isoformat() if ar.finished_at else None,
                "input_snapshot": ar.input_snapshot,
                "input_hash": ar.input_hash,
                "result_summary": ar.result_summary,
                "trace_json": ar.trace_json,
                "white_box_trace": ar.white_box_trace,
                "error_message": ar.error_message,
            }
            for ar in analysis_runs
        ]

        # Analysis runs index
        run_ids = [str(ar.id) for ar in analysis_runs]
        analysis_runs_index_data = []
        if run_ids:
            index_query = (
                select(AnalysisRunIndexORM)
                .where(AnalysisRunIndexORM.run_id.in_(run_ids))
                .order_by(AnalysisRunIndexORM.created_at_utc)
            )
            index_entries = self._session.execute(index_query).scalars().all()
            analysis_runs_index_data = [
                {
                    "run_id": ie.run_id,
                    "analysis_type": ie.analysis_type,
                    "case_id": ie.case_id,
                    "base_snapshot_id": ie.base_snapshot_id,
                    "primary_artifact_type": ie.primary_artifact_type,
                    "primary_artifact_id": ie.primary_artifact_id,
                    "fingerprint": ie.fingerprint,
                    "created_at_utc": ie.created_at_utc.isoformat(),
                    "status": ie.status,
                    "meta_json": ie.meta_json,
                }
                for ie in index_entries
            ]

        # Study runs
        study_runs_query = (
            select(StudyRunORM)
            .where(StudyRunORM.project_id == project_id)
            .order_by(StudyRunORM.started_at)
        )
        study_runs = self._session.execute(study_runs_query).scalars().all()
        study_runs_data = [
            {
                "id": str(sr.id),
                "case_id": str(sr.case_id),
                "analysis_type": sr.analysis_type,
                "input_hash": sr.input_hash,
                "network_snapshot_id": sr.network_snapshot_id,
                "solver_version_hash": sr.solver_version_hash,
                "result_state": sr.result_state,
                "status": sr.status,
                "started_at": sr.started_at.isoformat(),
                "finished_at": sr.finished_at.isoformat() if sr.finished_at else None,
            }
            for sr in study_runs
        ]

        return {
            "analysis_runs": analysis_runs_data,
            "analysis_runs_index": analysis_runs_index_data,
            "study_runs": study_runs_data,
        }

    def _collect_results(self, project_id: UUID) -> dict[str, Any]:
        """Zbierz wyniki."""
        results_query = (
            select(StudyResultORM)
            .where(StudyResultORM.project_id == project_id)
            .order_by(StudyResultORM.created_at)
        )
        results = self._session.execute(results_query).scalars().all()
        results_data = [
            {
                "id": str(r.id),
                "run_id": str(r.run_id),
                "result_type": r.result_type,
                "result_jsonb": r.result_jsonb,
                "created_at": r.created_at.isoformat(),
            }
            for r in results
        ]

        return {"study_results": results_data}

    def _collect_proofs(self, project_id: UUID) -> dict[str, Any]:
        """Zbierz dowody (design specs, proposals, evidence)."""
        # Najpierw pobierz operating case IDs dla tego projektu
        operating_cases_query = select(OperatingCaseORM.id).where(
            OperatingCaseORM.project_id == project_id
        )
        operating_case_ids = [row[0] for row in self._session.execute(operating_cases_query).all()]

        design_specs_data = []
        design_proposals_data = []
        design_evidence_data = []

        if operating_case_ids:
            # Design specs
            specs_query = (
                select(DesignSpecORM)
                .where(DesignSpecORM.case_id.in_(operating_case_ids))
                .order_by(DesignSpecORM.created_at)
            )
            specs = self._session.execute(specs_query).scalars().all()
            design_specs_data = [
                {
                    "id": str(s.id),
                    "case_id": str(s.case_id),
                    "base_snapshot_id": s.base_snapshot_id,
                    "spec_json": s.spec_json,
                    "created_at": s.created_at.isoformat(),
                    "updated_at": s.updated_at.isoformat(),
                }
                for s in specs
            ]

            # Design proposals
            proposals_query = (
                select(DesignProposalORM)
                .where(DesignProposalORM.case_id.in_(operating_case_ids))
                .order_by(DesignProposalORM.created_at)
            )
            proposals = self._session.execute(proposals_query).scalars().all()
            design_proposals_data = [
                {
                    "id": str(p.id),
                    "case_id": str(p.case_id),
                    "input_snapshot_id": p.input_snapshot_id,
                    "proposal_json": p.proposal_json,
                    "status": p.status,
                    "created_at": p.created_at.isoformat(),
                    "updated_at": p.updated_at.isoformat(),
                }
                for p in proposals
            ]

            # Design evidence
            evidence_query = (
                select(DesignEvidenceORM)
                .where(DesignEvidenceORM.case_id.in_(operating_case_ids))
                .order_by(DesignEvidenceORM.created_at)
            )
            evidence = self._session.execute(evidence_query).scalars().all()
            design_evidence_data = [
                {
                    "id": str(e.id),
                    "case_id": str(e.case_id),
                    "snapshot_id": e.snapshot_id,
                    "evidence_json": e.evidence_json,
                    "created_at": e.created_at.isoformat(),
                }
                for e in evidence
            ]

        return {
            "design_specs": design_specs_data,
            "design_proposals": design_proposals_data,
            "design_evidence": design_evidence_data,
        }

    # ========================================================================
    # IMPORT
    # ========================================================================

    def import_project(
        self,
        archive_bytes: bytes,
        new_project_name: str | None = None,
        verify_integrity: bool = True,
    ) -> ArchiveImportResult:
        """
        Importuj projekt z archiwum ZIP.

        Args:
            archive_bytes: Bajty archiwum ZIP
            new_project_name: Opcjonalna nowa nazwa projektu (None = użyj oryginalnej)
            verify_integrity: Czy weryfikować integralność archiwum

        Returns:
            Wynik importu z informacjami o statusie
        """
        warnings: list[str] = []

        try:
            # Rozpakuj ZIP
            zip_buffer = io.BytesIO(archive_bytes)
            with zipfile.ZipFile(zip_buffer, "r") as zf:
                if "project.json" not in zf.namelist():
                    return ArchiveImportResult(
                        status=ArchiveImportStatus.FAILED,
                        project_id=None,
                        errors=["Archiwum nie zawiera pliku project.json"],
                    )

                project_json = zf.read("project.json").decode("utf-8")

            # Parsuj JSON
            archive_dict = json.loads(project_json)
            archive = dict_to_archive(archive_dict)

            # Weryfikacja integralności
            if verify_integrity:
                integrity_errors = verify_archive_integrity(archive)
                if integrity_errors:
                    return ArchiveImportResult(
                        status=ArchiveImportStatus.FAILED,
                        project_id=None,
                        errors=integrity_errors,
                    )

            # Sprawdź wersję (dla ostrzeżeń o migracji)
            migrated_from = None
            if archive.schema_version != ARCHIVE_SCHEMA_VERSION:
                migrated_from = archive.schema_version
                warnings.append(
                    f"Zmigrowano z wersji {archive.schema_version} do {ARCHIVE_SCHEMA_VERSION}"
                )

            # Zapisz do bazy danych
            project_id = self._restore_project(archive, new_project_name)

            # Bramka katalogowa po imporcie — sprawdz elementy bez catalog_ref
            elements_no_catalog = _find_elements_without_catalog(archive)
            catalog_mapping_needed = len(elements_no_catalog) > 0

            if catalog_mapping_needed:
                warnings.append(
                    f"Import wymaga mapowania katalogowego: "
                    f"{len(elements_no_catalog)} element(ów) bez katalogu"
                )

            final_status = (
                ArchiveImportStatus.CATALOG_MAPPING_REQUIRED
                if catalog_mapping_needed
                else ArchiveImportStatus.SUCCESS
            )

            return ArchiveImportResult(
                status=final_status,
                project_id=str(project_id),
                warnings=warnings,
                migrated_from_version=migrated_from,
                elements_without_catalog=elements_no_catalog,
                catalog_mapping_required=catalog_mapping_needed,
            )

        except ArchiveError as e:
            return ArchiveImportResult(
                status=ArchiveImportStatus.FAILED,
                project_id=None,
                errors=[str(e)],
            )
        except json.JSONDecodeError as e:
            return ArchiveImportResult(
                status=ArchiveImportStatus.FAILED,
                project_id=None,
                errors=[f"Błąd parsowania JSON: {e}"],
            )
        except zipfile.BadZipFile:
            return ArchiveImportResult(
                status=ArchiveImportStatus.FAILED,
                project_id=None,
                errors=["Nieprawidłowy format archiwum ZIP"],
            )

    def _restore_project(self, archive: ProjectArchive, new_project_name: str | None) -> UUID:
        """Przywróć projekt z archiwum do bazy danych."""
        # Mapowanie starych ID na nowe (dla zachowania referencji)
        id_map: dict[str, UUID] = {}

        # Generuj nowe ID projektu
        new_project_id = uuid4()
        id_map[archive.project_meta.id] = new_project_id

        now = datetime.now(UTC)

        # 1. Projekt
        project_orm = ProjectORM(
            id=new_project_id,
            name=new_project_name or archive.project_meta.name,
            description=archive.project_meta.description,
            schema_version=archive.project_meta.schema_version,
            active_network_snapshot_id=None,  # Ustawimy później
            connection_node_id=None,  # Ustawimy później
            sources_jsonb=archive.project_meta.sources,
            created_at=now,
            updated_at=now,
        )
        self._session.add(project_orm)
        self._session.flush()

        # 2. Network nodes - najpierw musimy utworzyć wszystkie węzły
        for node_data in archive.network_model.nodes:
            old_id = node_data["id"]
            new_id = uuid4()
            id_map[old_id] = new_id

            node_orm = NetworkNodeORM(
                id=new_id,
                project_id=new_project_id,
                name=node_data["name"],
                node_type=node_data["node_type"],
                base_kv=node_data["base_kv"],
                attrs_jsonb=node_data["attrs_jsonb"],
            )
            self._session.add(node_orm)

        self._session.flush()

        # Aktualizuj connection_node_id jeśli był ustawiony
        if archive.project_meta.connection_node_id:
            connection_new_id = id_map.get(archive.project_meta.connection_node_id)
            if connection_new_id:
                project_orm.connection_node_id = connection_new_id

        # 3. Network branches
        for branch_data in archive.network_model.branches:
            old_id = branch_data["id"]
            new_id = uuid4()
            id_map[old_id] = new_id

            branch_orm = NetworkBranchORM(
                id=new_id,
                project_id=new_project_id,
                name=branch_data["name"],
                branch_type=branch_data["branch_type"],
                from_node_id=id_map[branch_data["from_node_id"]],
                to_node_id=id_map[branch_data["to_node_id"]],
                in_service=branch_data["in_service"],
                params_jsonb=branch_data["params_jsonb"],
            )
            self._session.add(branch_orm)

        # 4. Network sources
        for source_data in archive.network_model.sources:
            old_id = source_data["id"]
            new_id = uuid4()
            id_map[old_id] = new_id

            source_orm = NetworkSourceORM(
                id=new_id,
                project_id=new_project_id,
                node_id=id_map[source_data["node_id"]],
                source_type=source_data["source_type"],
                payload_jsonb=source_data["payload_jsonb"],
                in_service=source_data["in_service"],
            )
            self._session.add(source_orm)

        # 5. Network loads
        for load_data in archive.network_model.loads:
            old_id = load_data["id"]
            new_id = uuid4()
            id_map[old_id] = new_id

            load_orm = NetworkLoadORM(
                id=new_id,
                project_id=new_project_id,
                node_id=id_map[load_data["node_id"]],
                payload_jsonb=load_data["payload_jsonb"],
                in_service=load_data["in_service"],
            )
            self._session.add(load_orm)

        # 6. Network snapshots (przechowaj mapowanie snapshot_id)
        snapshot_id_map: dict[str, str] = {}
        for snapshot_data in archive.network_model.snapshots:
            old_snapshot_id = snapshot_data["snapshot_id"]
            # Generuj nowy snapshot_id (hash + timestamp)
            new_snapshot_id = compute_hash(
                {"old": old_snapshot_id, "new_project": str(new_project_id), "ts": now.isoformat()}
            )[:64]
            snapshot_id_map[old_snapshot_id] = new_snapshot_id

            # Aktualizuj snapshot_json z nowymi ID
            updated_snapshot_json = self._remap_snapshot_json(
                snapshot_data["snapshot_json"], id_map
            )

            snapshot_orm = NetworkSnapshotORM(
                snapshot_id=new_snapshot_id,
                parent_snapshot_id=(
                    snapshot_id_map.get(snapshot_data["parent_snapshot_id"])
                    if snapshot_data["parent_snapshot_id"]
                    else None
                ),
                created_at=now,
                schema_version=snapshot_data["schema_version"],
                network_model_id=str(new_project_id),
                fingerprint=snapshot_data["fingerprint"],
                snapshot_json=updated_snapshot_json,
            )
            self._session.add(snapshot_orm)

        # Aktualizuj active_network_snapshot_id
        if archive.project_meta.active_network_snapshot_id:
            new_active_snapshot_id = snapshot_id_map.get(
                archive.project_meta.active_network_snapshot_id
            )
            if new_active_snapshot_id:
                project_orm.active_network_snapshot_id = new_active_snapshot_id

        self._session.flush()

        # 7. Operating cases
        for oc_data in archive.cases.operating_cases:
            old_id = oc_data["id"]
            new_id = uuid4()
            id_map[old_id] = new_id

            oc_orm = OperatingCaseORM(
                id=new_id,
                project_id=new_project_id,
                name=oc_data["name"],
                case_jsonb=oc_data["case_jsonb"],
                project_design_mode=oc_data.get("project_design_mode"),
                created_at=now,
                updated_at=now,
            )
            self._session.add(oc_orm)

        self._session.flush()

        # 8. Study cases
        for sc_data in archive.cases.study_cases:
            old_id = sc_data["id"]
            new_id = uuid4()
            id_map[old_id] = new_id

            sc_orm = StudyCaseORM(
                id=new_id,
                project_id=new_project_id,
                name=sc_data["name"],
                description=sc_data["description"],
                network_snapshot_id=(
                    snapshot_id_map.get(sc_data["network_snapshot_id"])
                    if sc_data["network_snapshot_id"]
                    else None
                ),
                study_jsonb=sc_data["study_jsonb"],
                is_active=sc_data["is_active"],
                result_status=sc_data["result_status"],
                result_refs_jsonb=sc_data["result_refs_jsonb"],
                revision=sc_data["revision"],
                created_at=now,
                updated_at=now,
            )
            self._session.add(sc_orm)

        # 9. Switching states
        for ss_data in archive.cases.switching_states:
            old_case_id = ss_data["case_id"]
            new_case_id = id_map.get(old_case_id)
            if not new_case_id:
                continue

            ss_orm = SwitchingStateORM(
                id=uuid4(),
                case_id=new_case_id,
                element_id=id_map.get(ss_data["element_id"], UUID(ss_data["element_id"])),
                element_type=ss_data["element_type"],
                in_service=ss_data["in_service"],
            )
            self._session.add(ss_orm)

        # 10. Project settings
        if archive.cases.settings:
            settings = archive.cases.settings
            settings_orm = ProjectSettingsORM(
                project_id=new_project_id,
                connection_node_id=(
                    id_map.get(settings["connection_node_id"])
                    if settings.get("connection_node_id")
                    else None
                ),
                active_case_id=(
                    id_map.get(settings["active_case_id"])
                    if settings.get("active_case_id")
                    else None
                ),
                grounding_jsonb=settings.get("grounding_jsonb", {}),
                limits_jsonb=settings.get("limits_jsonb", {}),
            )
            self._session.add(settings_orm)

        self._session.flush()

        # 11. SLD diagrams
        for diag_data in archive.sld_diagrams.diagrams:
            old_id = diag_data["id"]
            new_id = uuid4()
            id_map[old_id] = new_id

            diag_orm = SldDiagramORM(
                id=new_id,
                project_id=new_project_id,
                name=diag_data["name"],
                sld_jsonb=diag_data["sld_jsonb"],
                dirty_flag=diag_data["dirty_flag"],
                created_at=now,
                updated_at=now,
            )
            self._session.add(diag_orm)

        self._session.flush()

        # 12. SLD node symbols
        for ns_data in archive.sld_diagrams.node_symbols:
            old_diagram_id = ns_data["diagram_id"]
            new_diagram_id = id_map.get(old_diagram_id)
            if not new_diagram_id:
                continue

            ns_orm = SldNodeSymbolORM(
                id=uuid4(),
                diagram_id=new_diagram_id,
                node_id=id_map.get(ns_data["node_id"], UUID(ns_data["node_id"])),
                x=ns_data["x"],
                y=ns_data["y"],
                label=ns_data.get("label"),
                is_connection_node=ns_data.get("is_connection_node", False),
            )
            self._session.add(ns_orm)

        # 13. SLD branch symbols
        for bs_data in archive.sld_diagrams.branch_symbols:
            old_diagram_id = bs_data["diagram_id"]
            new_diagram_id = id_map.get(old_diagram_id)
            if not new_diagram_id:
                continue

            bs_orm = SldBranchSymbolORM(
                id=uuid4(),
                diagram_id=new_diagram_id,
                branch_id=id_map.get(bs_data["branch_id"], UUID(bs_data["branch_id"])),
                from_node_id=id_map.get(bs_data["from_node_id"], UUID(bs_data["from_node_id"])),
                to_node_id=id_map.get(bs_data["to_node_id"], UUID(bs_data["to_node_id"])),
                points_jsonb=bs_data["points_jsonb"],
            )
            self._session.add(bs_orm)

        # 14. SLD annotations
        for ann_data in archive.sld_diagrams.annotations:
            old_diagram_id = ann_data["diagram_id"]
            new_diagram_id = id_map.get(old_diagram_id)
            if not new_diagram_id:
                continue

            ann_orm = SldAnnotationORM(
                id=uuid4(),
                diagram_id=new_diagram_id,
                text=ann_data["text"],
                x=ann_data["x"],
                y=ann_data["y"],
            )
            self._session.add(ann_orm)

        # 15. Study runs
        for sr_data in archive.runs.study_runs:
            old_id = sr_data["id"]
            new_id = uuid4()
            id_map[old_id] = new_id

            sr_orm = StudyRunORM(
                id=new_id,
                project_id=new_project_id,
                case_id=id_map.get(sr_data["case_id"], UUID(sr_data["case_id"])),
                analysis_type=sr_data["analysis_type"],
                input_hash=sr_data["input_hash"],
                network_snapshot_id=(
                    snapshot_id_map.get(sr_data["network_snapshot_id"])
                    if sr_data.get("network_snapshot_id")
                    else None
                ),
                solver_version_hash=sr_data.get("solver_version_hash"),
                result_state=sr_data["result_state"],
                status=sr_data["status"],
                started_at=datetime.fromisoformat(sr_data["started_at"]),
                finished_at=(
                    datetime.fromisoformat(sr_data["finished_at"])
                    if sr_data.get("finished_at")
                    else None
                ),
            )
            self._session.add(sr_orm)

        self._session.flush()

        # 16. Analysis runs
        for ar_data in archive.runs.analysis_runs:
            old_id = ar_data["id"]
            new_id = uuid4()
            id_map[old_id] = new_id

            ar_orm = AnalysisRunORM(
                id=new_id,
                project_id=new_project_id,
                operating_case_id=id_map.get(
                    ar_data["operating_case_id"], UUID(ar_data["operating_case_id"])
                ),
                analysis_type=ar_data["analysis_type"],
                status=ar_data["status"],
                result_status=ar_data["result_status"],
                created_at=datetime.fromisoformat(ar_data["created_at"]),
                started_at=(
                    datetime.fromisoformat(ar_data["started_at"])
                    if ar_data.get("started_at")
                    else None
                ),
                finished_at=(
                    datetime.fromisoformat(ar_data["finished_at"])
                    if ar_data.get("finished_at")
                    else None
                ),
                input_snapshot=ar_data["input_snapshot"],
                input_hash=ar_data["input_hash"],
                result_summary=ar_data["result_summary"],
                trace_json=ar_data.get("trace_json"),
                white_box_trace=ar_data.get("white_box_trace"),
                error_message=ar_data.get("error_message"),
            )
            self._session.add(ar_orm)

        self._session.flush()

        # 17. Analysis runs index
        for idx_data in archive.runs.analysis_runs_index:
            old_run_id = idx_data["run_id"]
            # Mapuj run_id - sprawdź czy to UUID czy string hash
            new_run_id = str(id_map.get(old_run_id, old_run_id))

            idx_orm = AnalysisRunIndexORM(
                run_id=new_run_id,
                analysis_type=idx_data["analysis_type"],
                case_id=(
                    str(id_map.get(idx_data["case_id"], idx_data["case_id"]))
                    if idx_data.get("case_id")
                    else None
                ),
                base_snapshot_id=(
                    snapshot_id_map.get(idx_data["base_snapshot_id"])
                    if idx_data.get("base_snapshot_id")
                    else None
                ),
                primary_artifact_type=idx_data["primary_artifact_type"],
                primary_artifact_id=idx_data["primary_artifact_id"],
                fingerprint=idx_data["fingerprint"],
                created_at_utc=datetime.fromisoformat(idx_data["created_at_utc"]),
                status=idx_data["status"],
                meta_json=idx_data.get("meta_json"),
            )
            self._session.add(idx_orm)

        # 18. Study results
        for res_data in archive.results.study_results:
            # U5: osobna zmienna UUID — reużycie `new_run_id: str` z pętli #17
            # dawało niezgodność typów (UUID | None przypisywane do str).
            mapped_result_run_id = id_map.get(res_data["run_id"])
            if mapped_result_run_id is None:
                continue

            res_orm = StudyResultORM(
                id=uuid4(),
                run_id=mapped_result_run_id,
                project_id=new_project_id,
                result_type=res_data["result_type"],
                result_jsonb=res_data["result_jsonb"],
                created_at=datetime.fromisoformat(res_data["created_at"]),
            )
            self._session.add(res_orm)

        # 19. Design specs
        for spec_data in archive.proofs.design_specs:
            old_case_id = spec_data["case_id"]
            new_case_id = id_map.get(old_case_id)
            if not new_case_id:
                continue

            spec_orm = DesignSpecORM(
                id=uuid4(),
                case_id=new_case_id,
                base_snapshot_id=snapshot_id_map.get(spec_data["base_snapshot_id"])
                or spec_data["base_snapshot_id"],
                spec_json=spec_data["spec_json"],
                created_at=datetime.fromisoformat(spec_data["created_at"]),
                updated_at=datetime.fromisoformat(spec_data["updated_at"]),
            )
            self._session.add(spec_orm)

        # 20. Design proposals
        for prop_data in archive.proofs.design_proposals:
            old_case_id = prop_data["case_id"]
            new_case_id = id_map.get(old_case_id)
            if not new_case_id:
                continue

            prop_orm = DesignProposalORM(
                id=uuid4(),
                case_id=new_case_id,
                input_snapshot_id=snapshot_id_map.get(prop_data["input_snapshot_id"])
                or prop_data["input_snapshot_id"],
                proposal_json=prop_data["proposal_json"],
                status=prop_data["status"],
                created_at=datetime.fromisoformat(prop_data["created_at"]),
                updated_at=datetime.fromisoformat(prop_data["updated_at"]),
            )
            self._session.add(prop_orm)

        # 21. Design evidence
        for evid_data in archive.proofs.design_evidence:
            old_case_id = evid_data["case_id"]
            new_case_id = id_map.get(old_case_id)
            if not new_case_id:
                continue

            evid_orm = DesignEvidenceORM(
                id=uuid4(),
                case_id=new_case_id,
                snapshot_id=snapshot_id_map.get(evid_data["snapshot_id"])
                or evid_data["snapshot_id"],
                evidence_json=evid_data["evidence_json"],
                created_at=datetime.fromisoformat(evid_data["created_at"]),
            )
            self._session.add(evid_orm)

        # flush to ensure IDs are available; commit handled by UnitOfWork
        self._session.flush()

        # 22. Model(e) ENM (N-D1, CV-1-W) — magazyn jest kluczowany kluczem
        # PROJEKTU, więc przywracamy JEDEN model projektu, nie po jednym per
        # przypadek. Archiwa wyeksportowane PO tej karcie niosą IDENTYCZNĄ
        # treść pod każdym `case_id` (jeden odczyt przy eksporcie — patrz
        # `_collect_enm`), więc "pierwszy" i "reszta" są bajtowo tym samym
        # modelem. Archiwa SPRZED tej karty mogły nieść RÓŻNE snapshoty per
        # przypadek (każdy przypadek miał wtedy własny model) — nic nie może
        # zniknąć: pierwszy wpis (aktywny przypadek archiwum, w jego braku
        # pierwszy w porządku `case_id` — ta sama reguła co migracja legacy w
        # `application/twin_key.migruj_projekt_z_legacy`) staje się modelem
        # PROJEKTU pod jego kluczem twin bez bumpu rewizji (round-trip
        # zachowuje hashe); pozostałe wpisy idą przez `store.migruj_klucz_
        # przypadku_do_projektu` do `legacy_przypadki/` z wierszem manifestu
        # (ZGODNY dla duplikatu treści, ROZBIEZNY dla realnej rozbieżności).
        entries_by_old_case: dict[str, dict[str, Any]] = {
            str(entry.get("case_id") or ""): entry["snapshot"]
            for entry in archive.enm.models
            if isinstance(entry.get("snapshot"), dict)
        }
        if entries_by_old_case:
            old_active_case_id = next(
                (
                    str(sc["id"])
                    for sc in archive.cases.study_cases
                    if sc.get("is_active") and str(sc["id"]) in entries_by_old_case
                ),
                None,
            )
            kolejnosc_starych = [old_active_case_id] if old_active_case_id else []
            kolejnosc_starych.extend(
                cid for cid in sorted(entries_by_old_case) if cid not in kolejnosc_starych
            )
            klucz_projektu_docelowy = klucz_twin_projektu(new_project_id)
            for indeks, old_case_id in enumerate(kolejnosc_starych):
                new_case_id = id_map.get(old_case_id)
                if new_case_id is None:
                    continue
                snapshot = entries_by_old_case[old_case_id]
                if indeks == 0:
                    restore_enm(klucz_projektu_docelowy, snapshot)
                else:
                    # Zapis TYMCZASOWY pod kluczem nowego przypadku — jedyny
                    # sposób, żeby `migruj_klucz_przypadku_do_projektu` (który
                    # czyta model spod klucza przypadku) mógł porównać hashem
                    # i odłożyć bez utraty danych.
                    restore_enm(str(new_case_id), snapshot)
                    migruj_klucz_przypadku_do_projektu(
                        str(new_case_id),
                        klucz_projektu_docelowy,
                        przyjmij_jako_model_projektu=False,
                    )

        return new_project_id

    def _remap_snapshot_json(
        self, snapshot_json: dict[str, Any], id_map: dict[str, UUID]
    ) -> dict[str, Any]:
        """Przemapuj ID w snapshot_json na nowe wartości."""

        # Głęboka kopia i podmiana ID
        def remap_value(value: Any) -> Any:
            if isinstance(value, str):
                # Sprawdź czy to UUID do przemapowania
                if value in id_map:
                    return str(id_map[value])
                return value
            if isinstance(value, dict):
                return {k: remap_value(v) for k, v in value.items()}
            if isinstance(value, list):
                return [remap_value(item) for item in value]
            return value

        return remap_value(snapshot_json)

    # ========================================================================
    # PREVIEW (dla UI)
    # ========================================================================

    def preview_archive(self, archive_bytes: bytes) -> dict[str, Any]:
        """
        Podgląd zawartości archiwum bez importu.

        Returns:
            Słownik z podsumowaniem zawartości archiwum
        """
        try:
            zip_buffer = io.BytesIO(archive_bytes)
            with zipfile.ZipFile(zip_buffer, "r") as zf:
                if "manifest.json" in zf.namelist():
                    json.loads(zf.read("manifest.json").decode("utf-8"))
                else:
                    pass

                if "project.json" not in zf.namelist():
                    return {
                        "valid": False,
                        "error": "Archiwum nie zawiera pliku project.json",
                    }

                project_json = zf.read("project.json").decode("utf-8")
                archive_dict = json.loads(project_json)
                archive = dict_to_archive(archive_dict)

                # Get exported_at from manifest (not in project.json for determinism)
                exported_at = None
                if "manifest.json" in zf.namelist():
                    manifest_data = json.loads(zf.read("manifest.json").decode("utf-8"))
                    exported_at = manifest_data.get("exported_at")

            # Zbuduj podsumowanie
            return {
                "valid": True,
                "format_id": archive.format_id,
                "schema_version": archive.schema_version,
                "project_name": archive.project_meta.name,
                "project_description": archive.project_meta.description,
                "exported_at": exported_at,
                "archive_hash": archive.fingerprints.archive_hash,
                "summary": {
                    "nodes_count": len(archive.network_model.nodes),
                    "branches_count": len(archive.network_model.branches),
                    "sources_count": len(archive.network_model.sources),
                    "loads_count": len(archive.network_model.loads),
                    "snapshots_count": len(archive.network_model.snapshots),
                    "sld_diagrams_count": len(archive.sld_diagrams.diagrams),
                    "study_cases_count": len(archive.cases.study_cases),
                    "operating_cases_count": len(archive.cases.operating_cases),
                    "analysis_runs_count": len(archive.runs.analysis_runs),
                    "study_runs_count": len(archive.runs.study_runs),
                    "results_count": len(archive.results.study_results),
                    "proofs_count": (
                        len(archive.proofs.design_specs)
                        + len(archive.proofs.design_proposals)
                        + len(archive.proofs.design_evidence)
                    ),
                },
            }

        except ArchiveError as e:
            return {"valid": False, "error": str(e)}
        except json.JSONDecodeError as e:
            return {"valid": False, "error": f"Błąd parsowania JSON: {e}"}
        except zipfile.BadZipFile:
            return {"valid": False, "error": "Nieprawidłowy format archiwum ZIP"}


def _find_elements_without_catalog(archive: ProjectArchive) -> list[str]:
    """Znajdz elementy techniczne bez referencji katalogowej.

    Sprawdza branches (segmenty SN) z network_model.branches
    oraz szuka transformatorow w snapshotach.
    Zwraca liste ref_id elementow bez catalog_ref.
    """
    elements_no_catalog: list[str] = []
    seen: set[str] = set()

    # Typy branchow wymagajace katalogu — predykat wspolny dla WSZYSTKICH drog
    # wejscia modelu (archiwum ZIP i import XLSX), zeby bramka katalogowa nie
    # rozjechala sie miedzy importerami (`catalog.governance`).

    # Sprawdz branches z modelu sieci
    for branch in archive.network_model.branches:
        branch_type = branch.get("type", "")
        ref_id = branch.get("ref_id", branch.get("id", ""))
        if wymaga_referencji_katalogowej(branch_type) and ref_id not in seen:
            if not branch.get("catalog_ref"):
                elements_no_catalog.append(ref_id)
                seen.add(ref_id)

    # Sprawdz snapshoty (dla transformatorow i dodatkowych branchow)
    for snapshot in archive.network_model.snapshots:
        graph = snapshot.get("graph", {}) if isinstance(snapshot, dict) else {}
        if not graph:
            continue

        for branch in graph.get("branches", []):
            branch_type = branch.get("type", "")
            ref_id = branch.get("ref_id", "")
            if wymaga_referencji_katalogowej(branch_type) and ref_id not in seen:
                if not branch.get("catalog_ref"):
                    elements_no_catalog.append(ref_id)
                    seen.add(ref_id)

        for device in graph.get("devices", []):
            device_type = device.get("device_type", "")
            ref_id = device.get("ref_id", "")
            if device_type == "transformer" and ref_id not in seen:
                if not device.get("catalog_ref"):
                    elements_no_catalog.append(ref_id)
                    seen.add(ref_id)

    return elements_no_catalog
