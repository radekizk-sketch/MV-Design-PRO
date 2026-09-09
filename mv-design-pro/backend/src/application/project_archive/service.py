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

from application.migracja_legacy import OdmowaMigracji, graf_z_modelu_legacy
from application.twin_key import (
    kolejnosc_promocji,
    migruj_projekt_z_legacy_z_repozytorium,
)
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
    ProjectArchive,
    ProjectMeta,
    ResultsSection,
    RunsSection,
    archive_to_dict,
    compute_archive_fingerprints,
    dict_to_archive,
    verify_archive_integrity,
)
from enm.canonical_analysis import odtworz_bieg_z_archiwum
from enm.kompilator_grafu import BenchmarkBuildError, BladGrafuWejsciowego, kompiluj_graf
from enm.models import EnergyNetworkModel
from enm.store import (
    ZrodloZmiany,
    get_enm,
    has_enm,
    migruj_klucz_przypadku_do_projektu,
    restore_enm,
    set_enm,
)
from infrastructure.persistence.repositories.canonical_run_repository import (
    CanonicalRunRepository,
)
from infrastructure.persistence.repositories.case_repository import CaseRepository
from network_model.catalog.governance import wymaga_referencji_katalogowej
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

if TYPE_CHECKING:
    pass

from infrastructure.persistence.models import (
    AnalysisRunIndexORM,
    CanonicalRunORM,
    OperatingCaseORM,
    ProjectORM,
    ProjectSettingsORM,
    StudyCaseORM,
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
        """Zbierz wszystkie dane projektu.

        W1-B-ARCH: format 3.0.0 nie niesie już sekcji `network_model`/
        `sld_diagrams`/`proofs` — tabele ORM, które je zasilały, skasował W1.
        Sieć projektu (jedyny nośnik: ENM) zbiera `_collect_enm` niżej.
        """
        project_id = project.id

        # Metadane projektu (bez exported_at - dla determinizmu)
        project_meta_dict = {
            "id": str(project.id),
            "name": project.name,
            "description": project.description,
            "schema_version": project.schema_version,
            "connection_node_id": (
                str(project.connection_node_id) if project.connection_node_id else None
            ),
            "sources": project.sources_jsonb,
            "created_at": project.created_at.isoformat(),
            "updated_at": project.updated_at.isoformat(),
        }

        # Cases
        cases_dict = self._collect_cases(project_id)

        # Runs
        runs_dict = self._collect_runs(project_id)

        # Results
        results_dict = self._collect_results(project_id)

        # Interpretations (placeholder)
        interpretations_dict: dict[str, Any] = {"cached": []}

        # Issues (placeholder - generowane dynamicznie)
        issues_dict: dict[str, Any] = {"snapshot": []}

        # ENM (model EnergyNetworkModel projektu, wpis per przypadek — N-D1, CV-1-W)
        enm_dict = self._collect_enm(project_id, cases_dict)

        # Oblicz fingerprints
        fingerprints = compute_archive_fingerprints(
            project_meta=project_meta_dict,
            cases=cases_dict,
            runs=runs_dict,
            results=results_dict,
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
                connection_node_id=(
                    str(project.connection_node_id) if project.connection_node_id else None
                ),
                sources=project.sources_jsonb,
                created_at=project.created_at.isoformat(),
                updated_at=project.updated_at.isoformat(),
            ),
            cases=CasesSection(
                study_cases=cases_dict["study_cases"],
                operating_cases=cases_dict["operating_cases"],
                settings=cases_dict["settings"],
            ),
            runs=RunsSection(
                canonical_runs=runs_dict["canonical_runs"],
                analysis_runs_index=runs_dict["analysis_runs_index"],
            ),
            results=ResultsSection(),
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
        zero fabrykacji. Projekt BEZ ŻADNEGO przypadku (study/operating), ale
        Z modelem (W1-B-ARCH — wykryte przy karcie, klasa nie instancja §4:
        deklaracja „brak modelu → pusta lista" nie miała testu dla „brak
        PRZYPADKU → model") dostaje JEDEN wpis-sentinel `case_id: None` — bez
        niego model istniałby w magazynie, a archiwum wywoziłoby go jako
        nieobecny.
        """
        case_ids: set[str] = set()
        for case_data in cases_dict.get("study_cases", []):
            case_ids.add(str(case_data["id"]))
        for case_data in cases_dict.get("operating_cases", []):
            case_ids.add(str(case_data["id"]))

        # MIGRACJA PRZED ODCZYTEM (przegląd adwersaryjny CV-1). Eksport bywa
        # PIERWSZYM dostępem do magazynu w procesie (restart backendu, worker
        # zadań w tle) — a modele projektów sprzed CV-1 leżą wtedy jeszcze pod
        # kluczami przypadków. Samo `klucz_twin_projektu(project_id)` niczego nie
        # migruje, więc `has_enm` oddawało `False` i archiwum ZIP wychodziło BEZ
        # SIECI: import takiego archiwum tworzył projekt bez modelu, a projektant
        # nie dostawał żadnego sygnału. Lista przypadków i kolejność promocji idą
        # z repozytorium przypadków — tego samego źródła, co migracja wołana z
        # `klucz_twin_dla_przypadku`.
        klucz_projektu = migruj_projekt_z_legacy_z_repozytorium(
            project_id, CaseRepository(self._session)
        ).klucz_projektu
        models: list[dict[str, Any]] = []
        if has_enm(klucz_projektu):
            snapshot = get_enm(klucz_projektu).model_dump(mode="json")
            if case_ids:
                for case_id in sorted(case_ids):
                    models.append({"case_id": case_id, "snapshot": snapshot})
            else:
                # Model ISTNIEJE, ale projekt (jeszcze) nie ma ŻADNEGO przypadku
                # (ani study, ani operating) — bez tego wpisu pętla wyżej nigdy
                # by się nie wykonała i model zniknąłby z archiwum MIMO że
                # `has_enm` mówi „jest" (dokładnie ta sama klasa defektu, którą
                # ta karta naprawia gdzie indziej: model niesiony, a archiwum go
                # nie wywozi). `case_id: None` niesie go WPROST, bez pośrednictwa
                # przypadku — `_restore_project` rozpoznaje sentinel i kładzie
                # go na klucz PROJEKTU wprost, bez prób odnalezienia przypadku.
                models.append({"case_id": None, "snapshot": snapshot})
        return {"models": models}

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
            "settings": settings_data,
        }

    def _collect_runs(self, project_id: UUID) -> dict[str, Any]:
        """Zbierz biegi kanoniczne (R1) i indeks koordynacji zabezpieczeń.

        CV-3.3-B: `analysis_runs` (R2, `AnalysisRunORM`) i `study_runs` (R3,
        `StudyRunORM`) usunięte razem z torem, który je pisał — jedyny rejestr
        biegów projektu to `canonical_runs` (`CanonicalRunORM`), pełny zrzut
        pól (bez `CanonicalRunBranchFlowORM` — rozpływ gałęziowy zwarcia jest
        odtwarzalny na żądanie z tego samego biegu, nie jest tożsamością biegu;
        wyłączony świadomie z zakresu tej karty ze względu na rozmiar — patrz
        `CanonicalRunBranchFlowORM` docstring, „104 punkty zwarcia × 11 506
        wpisów" na sieci 50 stacji).
        """
        canonical_runs_query = (
            select(CanonicalRunORM)
            .where(CanonicalRunORM.project_id == str(project_id))
            .order_by(CanonicalRunORM.created_at)
        )
        canonical_runs = self._session.execute(canonical_runs_query).scalars().all()
        canonical_runs_data = [
            {
                "id": str(cr.id),
                "case_id": cr.case_id,
                "analysis_type": cr.analysis_type,
                "status": cr.status,
                "result_status": cr.result_status,
                "created_at": cr.created_at.isoformat(),
                "started_at": cr.started_at.isoformat() if cr.started_at else None,
                "finished_at": cr.finished_at.isoformat() if cr.finished_at else None,
                "snapshot_hash": cr.snapshot_hash,
                "input_hash": cr.input_hash,
                "snapshot": cr.snapshot_json,
                "validation": cr.validation_json,
                "readiness": cr.readiness_json,
                "options": cr.options_json,
                "error_message": cr.error_message,
                "raw_result": cr.raw_result_json,
                "white_box_trace": cr.white_box_trace_json,
                "power_flow_trace": cr.power_flow_trace_json,
                "envelope": cr.envelope_json,
            }
            for cr in canonical_runs
        ]

        # Analysis runs index — CV-3.3-B: NIEZALEŻNA tabela (koordynacja
        # zabezpieczeń, `application/analyses/protection/{catalog,overcurrent}
        # /pipeline.py`), nie R2. Naprawa u źródła: filtr PO `case_id`
        # (kolumna istnieje na wpisie), nie po członkostwie w R2 `analysis_runs`
        # — poprzedni filtr (`run_id IN (id R2 tego projektu)`) pomijał KAŻDY
        # wpis indeksu zapisany przez ten pipeline, bo jego identyfikatory
        # biegów nigdy nie były wierszami `AnalysisRunORM`.
        case_ids_query = select(StudyCaseORM.id).where(StudyCaseORM.project_id == project_id)
        case_ids = [str(cid) for cid in self._session.execute(case_ids_query).scalars().all()]
        analysis_runs_index_data = []
        if case_ids:
            index_query = (
                select(AnalysisRunIndexORM)
                .where(AnalysisRunIndexORM.case_id.in_(case_ids))
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

        return {
            "canonical_runs": canonical_runs_data,
            "analysis_runs_index": analysis_runs_index_data,
        }

    def _collect_results(self, project_id: UUID) -> dict[str, Any]:
        """CV-3.3-B: `study_results` (R3, `StudyResultORM`) usunięty — wynik
        biegu jest częścią samego `canonical_runs` (`CanonicalRun.raw_result`,
        zbierany w `_collect_runs`), nie osobnym rekordem."""
        return {}

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

            # Parsuj JSON — `archive_dict` to SUROWY słownik (obie wersje formatu);
            # `dict_to_archive` z niego ignoruje sekcje, których 3.0.0 nie ma
            # (`network_model`/`sld_diagrams`/`proofs`) — ale `_restore_project`
            # sięga po `archive_dict` wprost, gdy trzeba skompilować model z
            # danych legacy (archiwum 2.x bez `enm.models`, W1-B-ARCH §0.2).
            archive_dict = json.loads(project_json)
            archive = dict_to_archive(archive_dict)

            # Weryfikacja integralności — NA SUROWYM słowniku (§0.3), dokładna
            # dla obu wersji formatu (3.0.0 i 2.x), nie tylko dla sekcji, które
            # `ProjectArchive` formatu 3.0.0 jeszcze zna.
            if verify_integrity:
                integrity_errors = verify_archive_integrity(archive_dict)
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

            # Zapisz do bazy danych (dopisuje ostrzeżenia — np. model 2.x nie do
            # odtworzenia, W1-B-ARCH §0.2 — nigdy cicho).
            project_id = self._restore_project(archive, archive_dict, new_project_name, warnings)

            # Bramka katalogowa po imporcie — sprawdz elementy modelu ENM (jedynego
            # nośnika sieci, W1-B-ARCH §0.4) bez catalog_ref. Model może nie istnieć
            # (import bez sieci, albo model 2.x nie odtworzony — ostrzeżenie już
            # wyżej) — wtedy bramka jest pusta, nie błędna.
            klucz_projektu = migruj_projekt_z_legacy_z_repozytorium(
                project_id, CaseRepository(self._session)
            ).klucz_projektu
            model_projektu = get_enm(klucz_projektu) if has_enm(klucz_projektu) else None
            elements_no_catalog = _find_elements_without_catalog(model_projektu)
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

    def _restore_project(
        self,
        archive: ProjectArchive,
        raw_archive: dict[str, Any],
        new_project_name: str | None,
        warnings: list[str],
    ) -> UUID:
        """Przywróć projekt z archiwum do bazy danych.

        `raw_archive` — SUROWY słownik `project.json` (przed `dict_to_archive`),
        potrzebny wyłącznie do sekcji `network_model` archiwów 2.x (W1-B-ARCH
        §0.2): `ProjectArchive` formatu 3.0.0 już jej nie niesie. `warnings` —
        akumulator ostrzeżeń wołającego (`import_project`); ta metoda dopisuje
        do niego, gdy model 2.x nie daje się odtworzyć (import kończy się mimo
        to powodzeniem — projekt/przypadki/biegi zostają przywrócone).
        """
        # Mapowanie starych ID na nowe (dla zachowania referencji) — po W1-B-ARCH
        # obejmuje już tylko projekt (nieużywane niżej, ale nieszkodliwe),
        # przypadki obliczeniowe (operating/study) i biegi kanoniczne: węzły/
        # gałęzie/źródła/odbiory/snapshoty modelu sieci nie istnieją od W1 —
        # sieć żyje wyłącznie w ENM, którego kompilator generuje WŁASNE ref_id
        # (nie da się — i nie trzeba — wymusić identycznych dosłownie ID).
        id_map: dict[str, UUID] = {}

        # Generuj nowe ID projektu
        new_project_id = uuid4()
        id_map[archive.project_meta.id] = new_project_id

        now = datetime.now(UTC)

        # 1. Projekt. `connection_node_id` (W1: bez klucza obcego — dawna tabela
        # `network_nodes` skasowana) przechodzi WPROST — nie ma już tabeli węzłów,
        # z której dawny import budował mapowanie stary_id -> nowy_id.
        project_orm = ProjectORM(
            id=new_project_id,
            name=new_project_name or archive.project_meta.name,
            description=archive.project_meta.description,
            schema_version=archive.project_meta.schema_version,
            connection_node_id=(
                UUID(archive.project_meta.connection_node_id)
                if archive.project_meta.connection_node_id
                else None
            ),
            sources_jsonb=archive.project_meta.sources,
            created_at=now,
            updated_at=now,
        )
        self._session.add(project_orm)
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
                study_jsonb=sc_data["study_jsonb"],
                is_active=sc_data["is_active"],
                result_status=sc_data["result_status"],
                result_refs_jsonb=sc_data["result_refs_jsonb"],
                revision=sc_data["revision"],
                created_at=now,
                updated_at=now,
            )
            self._session.add(sc_orm)

        # 10. Project settings. `connection_node_id` przechodzi WPROST (jak w
        # sekcji 1) — nie ma już tabeli węzłów, z której budowałoby się mapowanie.
        if archive.cases.settings:
            settings = archive.cases.settings
            settings_orm = ProjectSettingsORM(
                project_id=new_project_id,
                connection_node_id=(
                    UUID(settings["connection_node_id"])
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

        # 15. Canonical runs (R1) — CV-3.3-B. Dwa przebiegi:
        #   (a) nowe id dla KAŻDEGO biegu + zebranie mapy stary->nowy PRZED
        #       zapisem, bo bieg zabezpieczeń (`options["sc_run_id"]`) może
        #       odwoływać się do biegu zwarciowego, który w archiwum idzie PO
        #       nim (kolejność w archiwum nie jest gwarantowana);
        #   (b) zapis z case_id/project_id/options.sc_run_id przemapowanymi
        #       na nowe identyfikatory.
        # `envelope`/`snapshot` NIE są przemapowywane — to zapis HISTORYCZNY
        # (opisuje stan modelu w chwili eksportu). Przemapowanie `project_id`
        # wewnątrz koperty złamałoby `RevisionEnvelope.spojna` (odcisk
        # semantyczny liczony nad tym polem) i zameldowałoby OUTDATED z
        # przyczyną „koperta niespójna" zamiast uczciwego porównania z
        # bieżącym modelem po imporcie.
        canonical_run_id_map: dict[str, UUID] = {
            cr_data["id"]: uuid4() for cr_data in archive.runs.canonical_runs
        }
        canonical_run_repo = CanonicalRunRepository(self._session)
        for cr_data in archive.runs.canonical_runs:
            new_run_id = canonical_run_id_map[cr_data["id"]]
            options = dict(cr_data.get("options") or {})
            if cr_data["analysis_type"] == "protection_sn" and options.get("sc_run_id"):
                options["sc_run_id"] = str(
                    canonical_run_id_map.get(str(options["sc_run_id"]), options["sc_run_id"])
                )
            run = odtworz_bieg_z_archiwum(
                cr_data,
                run_id=new_run_id,
                case_id=str(id_map.get(cr_data["case_id"], cr_data["case_id"])),
                project_id=str(new_project_id),
                options=options,
            )
            canonical_run_repo.create(run)
            id_map[cr_data["id"]] = new_run_id

        self._session.flush()

        # 16. Analysis runs index — CV-3.3-B: NIEZALEŻNA tabela (koordynacja
        # zabezpieczeń, `application/analyses/protection/{catalog,overcurrent}
        # /pipeline.py` — żywy konsument produkcyjny niezwiązany z R2/R3).
        # `run_id` NIE jest przemapowywany: identyfikatory tego pipeline'u nie
        # są id `CanonicalRun` (własny `AnalysisRunEnvelope`) — przemapowanie
        # przez `id_map` podstawiłoby losowy, niepowiązany identyfikator.
        # `base_snapshot_id` (W1: pole bez klucza obcego, String(64) — nie
        # dosłowny `NetworkSnapshotORM.snapshot_id`, tabela snapshotów już nie
        # istnieje) przechodzi WPROST, bez próby przemapowania.
        for idx_data in archive.runs.analysis_runs_index:
            idx_orm = AnalysisRunIndexORM(
                run_id=idx_data["run_id"],
                analysis_type=idx_data["analysis_type"],
                case_id=(
                    str(id_map.get(idx_data["case_id"], idx_data["case_id"]))
                    if idx_data.get("case_id")
                    else None
                ),
                base_snapshot_id=idx_data.get("base_snapshot_id"),
                primary_artifact_type=idx_data["primary_artifact_type"],
                primary_artifact_id=idx_data["primary_artifact_id"],
                fingerprint=idx_data["fingerprint"],
                created_at_utc=datetime.fromisoformat(idx_data["created_at_utc"]),
                status=idx_data["status"],
                meta_json=idx_data.get("meta_json"),
            )
            self._session.add(idx_orm)

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
        # Klucz docelowy budujemy tą samą drogą co eksport — przez migrację, a
        # nie przez czystą funkcję klucza. Dla ŚWIEŻEGO projektu migracja jest
        # pustym przebiegiem (żaden z nowo utworzonych przypadków nie ma jeszcze
        # pliku w magazynie), ale droga do magazynu ma być JEDNA: „czysty klucz
        # projektu, bo akurat tutaj nie ma czego migrować" jest rozumowaniem,
        # które przestaje być prawdziwe po pierwszej zmianie tej funkcji.
        klucz_projektu_docelowy = migruj_projekt_z_legacy_z_repozytorium(
            new_project_id, CaseRepository(self._session)
        ).klucz_projektu
        if entries_by_old_case:
            old_active_case_id = next(
                (
                    str(sc["id"])
                    for sc in archive.cases.study_cases
                    if sc.get("is_active") and str(sc["id"]) in entries_by_old_case
                ),
                None,
            )
            # Ta sama reguła kolejności co migracja plików zastanych
            # (`application/twin_key.kolejnosc_promocji`) — jedna reguła, trzy
            # źródła listy przypadków (baza, eksport, wpisy archiwum).
            kolejnosc_starych = kolejnosc_promocji(sorted(entries_by_old_case), old_active_case_id)
            for indeks, old_case_id in enumerate(kolejnosc_starych):
                snapshot = entries_by_old_case[old_case_id]
                if not old_case_id:
                    # Sentinel `_collect_enm` (case_id: None) — model istniał,
                    # ale ŻADEN przypadek go nie niósł (projekt bez przypadków
                    # w chwili eksportu). Idzie WPROST na klucz projektu — nie
                    # ma przypadku do wyszukania w `id_map`, więc próba
                    # `id_map.get(old_case_id)` (pusty klucz) zawsze zwracałaby
                    # `None` i po cichu gubiła model (dokładnie ten defekt,
                    # który ten sentinel naprawia).
                    if indeks == 0:
                        restore_enm(klucz_projektu_docelowy, snapshot)
                    continue
                new_case_id = id_map.get(old_case_id)
                if new_case_id is None:
                    continue
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
        else:
            # W1-B-ARCH §0.2: archiwum 2.x BEZ `enm.models` — jedyny ślad sieci
            # jest w surowej sekcji `network_model` (`ProjectArchive` formatu
            # 3.0.0 jej już nie niesie, stąd `raw_archive`, nie `archive`).
            # Kompilacja tym samym kompilatorem grafu co arkusz XLSX i
            # buildery sieci referencyjnych (`enm/kompilator_grafu.py`) —
            # ZERO drugiej implementacji tej samej drogi.
            siec_legacy = raw_archive.get("network_model") or {}
            wezly_legacy = siec_legacy.get("nodes") or []
            if wezly_legacy:
                try:
                    graf = graf_z_modelu_legacy(
                        nazwa=archive.project_meta.name,
                        wezly=wezly_legacy,
                        galezie=siec_legacy.get("branches") or [],
                        zrodla=siec_legacy.get("sources") or [],
                        odbiory=siec_legacy.get("loads") or [],
                        proweniencja=f"archiwum:{archive.project_meta.id}",
                    )
                    wynik_kompilacji = kompiluj_graf(graf)
                    model = EnergyNetworkModel.model_validate(wynik_kompilacji.enm)
                except (
                    OdmowaMigracji,
                    BladGrafuWejsciowego,
                    BenchmarkBuildError,
                    ValidationError,
                ) as blad:
                    # Odmowa nazwana — projekt/przypadki/biegi ZOSTAJĄ przywrócone,
                    # projekt zostaje bez modelu (zero cichego pomijania, §0.2).
                    warnings.append(f"Model sieci z archiwum 2.x nie został odtworzony: {blad}")
                else:
                    set_enm(
                        klucz_projektu_docelowy,
                        model,
                        zrodlo_zmiany=ZrodloZmiany(
                            operacja=None,
                            opis_pl=(
                                "Model odtworzony z archiwum 2.x (sekcja network_model, "
                                "W1-B-ARCH)"
                            ),
                            ladunek={
                                "zrodlo": "import_archiwum_legacy",
                                "archiwum": archive.project_meta.id,
                            },
                            utworzone=_wszystkie_ref_id(wynik_kompilacji.enm),
                        ),
                    )

        return new_project_id

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

            # Zbuduj podsumowanie. W1-B-ARCH: model sieci żyje wyłącznie w ENM
            # (sekcja `enm`) — `network_model`/`sld_diagrams`/`proofs` nie mają
            # już źródła danych, więc podgląd liczy to, co archiwum NAPRAWDĘ
            # niesie (przypadki, biegi, wpisy modelu ENM per przypadek).
            return {
                "valid": True,
                "format_id": archive.format_id,
                "schema_version": archive.schema_version,
                "project_name": archive.project_meta.name,
                "project_description": archive.project_meta.description,
                "exported_at": exported_at,
                "archive_hash": archive.fingerprints.archive_hash,
                "summary": {
                    "study_cases_count": len(archive.cases.study_cases),
                    "operating_cases_count": len(archive.cases.operating_cases),
                    "canonical_runs_count": len(archive.runs.canonical_runs),
                    "enm_models_count": len(archive.enm.models),
                },
            }

        except ArchiveError as e:
            return {"valid": False, "error": str(e)}
        except json.JSONDecodeError as e:
            return {"valid": False, "error": f"Błąd parsowania JSON: {e}"}
        except zipfile.BadZipFile:
            return {"valid": False, "error": "Nieprawidłowy format archiwum ZIP"}


def _find_elements_without_catalog(model: EnergyNetworkModel | None) -> list[str]:
    """Znajdz elementy techniczne bez referencji katalogowej.

    W1-B-ARCH §0.4: liczy się z MODELU ENM (przywróconego z sekcji `enm`, albo
    skompilowanego z danych legacy w `_restore_project`) — jedynego nośnika
    sieci od W1. Sprawdza gałęzie wymagające katalogu (linie/kable — predykat
    wspólny dla WSZYSTKICH dróg wejścia modelu, `catalog.governance`, żeby
    bramka katalogowa nie rozjechała się między importerami) i transformatory
    (katalog wymagany zawsze — jak w bramce importu arkusza XLSX). Model
    nieobecny (import bez sieci, albo model 2.x nie odtworzony — ostrzeżenie
    już nazwane wyżej) → pusta lista, zero fabrykacji.

    Zwraca listę ref_id elementów bez catalog_ref.
    """
    if model is None:
        return []
    elements_no_catalog: list[str] = []
    for branch in model.branches:
        if wymaga_referencji_katalogowej(branch.type) and not branch.catalog_ref:
            elements_no_catalog.append(branch.ref_id)
    for transformer in model.transformers:
        if not transformer.catalog_ref:
            elements_no_catalog.append(transformer.ref_id)
    return elements_no_catalog


def _wszystkie_ref_id(enm_dict: dict[str, Any]) -> tuple[str, ...]:
    """Ref_id KAŻDEGO elementu modelu ENM (surowy słownik) — posortowane dla
    determinizmu. Karmi `ZrodloZmiany.utworzone` przy kompilacji modelu z
    archiwum 2.x (W1-B-ARCH §0.2): dziennik zmian ma nazywać WSZYSTKO, co
    powstało, nie tylko szyny/gałęzie — stąd generyczne przejście po każdej
    liście elementów modelu, a nie wyliczanka pojedynczych kolekcji."""
    ref_idy: list[str] = []
    for klucz, wartosc in enm_dict.items():
        if klucz == "header" or not isinstance(wartosc, list):
            continue
        for element in wartosc:
            if isinstance(element, dict) and "ref_id" in element:
                ref_idy.append(str(element["ref_id"]))
    return tuple(sorted(ref_idy))
