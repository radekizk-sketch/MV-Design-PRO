"""
Testy sekcji ENM w archiwum projektu (N-D1, plan H P0.0).

Dług naprawiany: archiwum ZIP nie serializowało ENM (flat-file store poza ORM),
więc stacje/transformatory/strona nN znikały przy eksporcie/imporcie projektu.

Testy:
- eksport zawiera sekcję "enm" z modelem przypadku,
- round-trip eksport → import przywraca model 1:1 (rewizja + hash bez zmian),
- determinizm: 2× eksport = identyczny project.json,
- kompatybilność wsteczna: archiwum bez sekcji "enm" importuje się poprawnie.
"""

from __future__ import annotations

import io
import json
import zipfile
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from application.project_archive.service import ProjectArchiveService
from domain.project_archive import ArchiveImportStatus, dict_to_archive
from enm.klucz_twin import klucz_twin_projektu
from enm.models import Bus
from enm.store import get_enm, has_enm, reset_enm_store, set_enm
from infrastructure.persistence.models import ProjectORM, StudyCaseORM


@pytest.fixture
def enm_store_tmp(tmp_path, monkeypatch):
    """Izolowany katalog flat-file store ENM na czas testu."""
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
    reset_enm_store(remove_persisted=False)
    yield
    reset_enm_store(remove_persisted=False)


@pytest.fixture
def project_with_enm_case(test_db_session, enm_store_tmp):
    """Projekt z przypadkiem studium, dla którego istnieje model ENM z szyną nN."""
    project_id = uuid4()
    case_id = uuid4()
    now = datetime.now(UTC)

    project = ProjectORM(
        id=project_id,
        name="Projekt z modelem ENM",
        description="Test sekcji ENM archiwum",
        schema_version="1.0.0",
        active_network_snapshot_id=None,
        connection_node_id=None,
        sources_jsonb=[],
        created_at=now,
        updated_at=now,
    )
    test_db_session.add(project)

    case = StudyCaseORM(
        id=case_id,
        project_id=project_id,
        name="Przypadek z ENM",
        description=None,
        network_snapshot_id=None,
        study_jsonb={"c_factor_max": 1.1, "c_factor_min": 0.95},
        is_active=True,
        result_status="NONE",
        result_refs_jsonb=[],
        revision=1,
        created_at=now,
        updated_at=now,
    )
    test_db_session.add(case)
    test_db_session.commit()

    # Zbuduj nietrywialny model ENM PROJEKTU (szyna nN 0,4 kV) — CV-1-W: magazyn
    # ENM jest kluczowany kluczem projektu, nie surowym case_id (przypadek nie
    # ma już własnego modelu).
    klucz = klucz_twin_projektu(project_id)
    enm = get_enm(klucz)
    model = enm.model_copy(deep=True)
    model.buses.append(Bus(ref_id="BUS-NN-1", name="Szyna nN stacji", voltage_kv=0.4))
    saved = set_enm(klucz, model)

    return project, case, saved


def _project_json_from_zip(archive_bytes: bytes) -> dict:
    with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as zf:
        return json.loads(zf.read("project.json").decode("utf-8"))


def test_export_contains_enm_section(test_db_session, project_with_enm_case) -> None:
    project, case, saved_enm = project_with_enm_case
    service = ProjectArchiveService(test_db_session)

    archive_bytes = service.export_project(project.id)
    data = _project_json_from_zip(archive_bytes)

    assert "enm" in data, "Archiwum musi zawierać sekcję enm"
    models = data["enm"]["models"]
    assert len(models) == 1
    assert models[0]["case_id"] == str(case.id)
    snapshot = models[0]["snapshot"]
    bus_refs = [bus["ref_id"] for bus in snapshot["buses"]]
    assert "BUS-NN-1" in bus_refs
    assert data["fingerprints"]["enm_hash"], "Fingerprint sekcji enm musi być wyliczony"


def test_roundtrip_restores_enm_one_to_one(test_db_session, project_with_enm_case) -> None:
    project, case, saved_enm = project_with_enm_case
    service = ProjectArchiveService(test_db_session)

    archive_bytes = service.export_project(project.id)

    exported_revision = saved_enm.header.revision
    exported_hash = saved_enm.header.hash_sha256

    # Symulacja świeżego środowiska: czyścimy store (pliki + pamięć).
    reset_enm_store(remove_persisted=True)

    result = service.import_project(archive_bytes, new_project_name="Import ENM")
    assert result.status in {
        ArchiveImportStatus.SUCCESS,
        ArchiveImportStatus.CATALOG_MAPPING_REQUIRED,
    }, f"Import nie powiódł się: {result.errors}"

    # Nowy przypadek (id przemapowane) — znajdź go po projekcie.
    from sqlalchemy import select

    new_cases = (
        test_db_session.execute(
            select(StudyCaseORM).where(StudyCaseORM.project_id == result.project_id)
        )
        .scalars()
        .all()
    )
    assert len(new_cases) == 1
    new_case_id = str(new_cases[0].id)
    assert new_case_id != str(case.id), "Import remapuje id przypadku"

    # CV-1-W: model żyje pod kluczem NOWEGO projektu (wszystkie jego przypadki
    # czytają jeden model), nie pod id przypadku.
    nowy_klucz = klucz_twin_projektu(result.project_id)
    assert has_enm(nowy_klucz), "Model ENM musi istnieć pod kluczem nowego projektu"
    restored = get_enm(nowy_klucz)
    assert restored.header.revision == exported_revision, "Rewizja bez bumpu (restore 1:1)"
    assert restored.header.hash_sha256 == exported_hash, "Hash modelu identyczny po round-tripie"
    assert any(bus.ref_id == "BUS-NN-1" for bus in restored.buses)


def test_double_export_identical_project_json(test_db_session, project_with_enm_case) -> None:
    project, _case, _enm = project_with_enm_case
    service = ProjectArchiveService(test_db_session)

    first = _project_json_from_zip(service.export_project(project.id))
    second = _project_json_from_zip(service.export_project(project.id))

    assert first == second, "Eksport z sekcją ENM musi być deterministyczny"


def test_archive_without_enm_section_is_backward_compatible(
    test_db_session, project_with_enm_case
) -> None:
    project, _case, _enm = project_with_enm_case
    service = ProjectArchiveService(test_db_session)

    data = _project_json_from_zip(service.export_project(project.id))

    # Usuń sekcję enm + jej fingerprint (symulacja archiwum sprzed N-D1).
    data.pop("enm")
    data["fingerprints"]["enm_hash"] = ""

    archive = dict_to_archive(data)
    assert archive.enm.models == []

    legacy_json = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("project.json", legacy_json)

    result = service.import_project(zip_buffer.getvalue(), new_project_name="Import legacy")
    assert result.status in {
        ArchiveImportStatus.SUCCESS,
        ArchiveImportStatus.CATALOG_MAPPING_REQUIRED,
    }, f"Import archiwum bez sekcji enm nie powiódł się: {result.errors}"


def test_import_legacy_archive_z_roznymi_snapshotami_per_przypadek_nic_nie_gubi(
    test_db_session, project_with_enm_case
) -> None:
    """CV-1-W: archiwum SPRZED tej karty mogło nieść RÓŻNE modele per przypadek
    (każdy przypadek miał wtedy własny magazyn). Import musi: (1) uczynić model
    przypadku AKTYWNEGO modelem PROJEKTU (bez utraty jego treści), (2) NIE
    zgubić treści przypadku NIEAKTYWNEGO, której model się różni — musi
    wylądować w `legacy_przypadki/` z wierszem manifestu ROZBIEZNY (procedura
    kasacji: nic nie ginie po cichu). Symulujemy archiwum legacy mutując
    sekcję "enm" świeżego eksportu (nowe archiwa niosą identyczną treść pod
    każdym case_id — patrz test_double_export_identical_project_json).
    """
    project, active_case, saved_enm = project_with_enm_case
    service = ProjectArchiveService(test_db_session)

    # Drugi przypadek (NIEaktywny) tego samego projektu.
    inactive_case_id = uuid4()
    now = datetime.now(UTC)
    inactive_case = StudyCaseORM(
        id=inactive_case_id,
        project_id=project.id,
        name="Przypadek nieaktywny",
        description=None,
        network_snapshot_id=None,
        study_jsonb={},
        is_active=False,
        result_status="NONE",
        result_refs_jsonb=[],
        revision=1,
        created_at=now,
        updated_at=now,
    )
    test_db_session.add(inactive_case)
    test_db_session.commit()

    data = _project_json_from_zip(service.export_project(project.id))
    modele = {wpis["case_id"]: wpis for wpis in data["enm"]["models"]}
    assert set(modele) == {str(active_case.id), str(inactive_case_id)}
    # Świeży eksport (CV-1-W): oba wpisy niosą TĘ SAMĄ treść (jeden model projektu).
    assert modele[str(active_case.id)]["snapshot"] == modele[str(inactive_case_id)]["snapshot"]

    # Symulacja archiwum LEGACY: przypadek nieaktywny miał WŁASNY, INNY model.
    model_rozbiezny = saved_enm.model_copy(deep=True)
    model_rozbiezny.buses.append(
        Bus(ref_id="BUS-ROZBIEZNY", name="Szyna tylko przypadku nieaktywnego", voltage_kv=15.0)
    )
    modele[str(inactive_case_id)]["snapshot"] = model_rozbiezny.model_dump(mode="json")

    legacy_json = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("project.json", legacy_json)

    # verify_integrity=False: mutacja treści bez przeliczenia fingerprintów —
    # ten test celuje w migrację ENM, nie w bramkę integralności (osobno testowaną).
    result = service.import_project(
        zip_buffer.getvalue(), new_project_name="Import legacy rozbiezny", verify_integrity=False
    )
    assert result.status in {
        ArchiveImportStatus.SUCCESS,
        ArchiveImportStatus.CATALOG_MAPPING_REQUIRED,
    }, f"Import nie powiódł się: {result.errors}"

    from sqlalchemy import select

    new_project_id = UUID(result.project_id)
    new_cases = (
        test_db_session.execute(
            select(StudyCaseORM).where(StudyCaseORM.project_id == new_project_id)
        )
        .scalars()
        .all()
    )
    assert len(new_cases) == 2
    nowy_aktywny = next(c for c in new_cases if c.is_active)
    nowy_nieaktywny = next(c for c in new_cases if not c.is_active)

    # (1) Model AKTYWNEGO przypadku archiwum staje się modelem PROJEKTU, bez zmian.
    klucz_nowego_projektu = klucz_twin_projektu(new_project_id)
    assert has_enm(klucz_nowego_projektu)
    model_projektu = get_enm(klucz_nowego_projektu)
    assert any(bus.ref_id == "BUS-NN-1" for bus in model_projektu.buses)
    assert not any(bus.ref_id == "BUS-ROZBIEZNY" for bus in model_projektu.buses)

    # (2) Treść przypadku NIEAKTYWNEGO (rozbieżna) NIE ZGINĘŁA — manifest legacy
    # ją nazywa (status ROZBIEZNY), a nie ciche pominięcie.
    from enm.store import wiersze_manifestu_legacy

    wiersze = {w["case_id"]: w for w in wiersze_manifestu_legacy()}
    assert str(nowy_nieaktywny.id) in wiersze, (
        "Model rozbieżnego przypadku nieaktywnego musi trafić do manifestu legacy "
        "— zniknięcie po cichu byłoby utratą danych projektanta"
    )
    assert wiersze[str(nowy_nieaktywny.id)]["status"] == "ROZBIEZNY"
    # Przypadek AKTYWNY archiwum zasila model projektu BEZPOŚREDNIO (jest jego
    # źródłem, nie duplikatem do porównania) — nie trafia do manifestu legacy.
    assert str(nowy_aktywny.id) not in wiersze
