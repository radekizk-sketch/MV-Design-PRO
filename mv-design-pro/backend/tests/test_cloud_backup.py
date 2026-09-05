"""
Testy Cloud Backup Infrastructure.

Pokrycie:
- LocalBackupProvider: upload, download, list, delete
- Generowanie klucza — deterministyczność
- Weryfikacja hash po upload
- Walidacja konfiguracji
- Funkcja fabrykująca create_backup_provider
- Obsługa błędów (bucket not found, permission denied)
- Roundtrip: upload → download → verify hash

Wyłącznie LocalBackupProvider (zero chmury w testach).
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import pytest

# Ensure backend/src on path
backend_src = Path(__file__).parents[1] / "src"
sys.path.insert(0, str(backend_src))

from infrastructure.cloud_backup import (
    CloudBackendType,
    CloudBackupConfig,
    CloudBackupConfigError,
    CloudBackupEntry,
    CloudBackupNotFoundError,
    CloudBackupResult,
    GCSBackupProvider,
    LocalBackupProvider,
    S3BackupProvider,
    compute_file_hash,
    create_backup_provider,
    extract_backup_id_from_key,
    generate_backup_key,
)

# ============================================================================
# FIXTURES
# ============================================================================


@pytest.fixture()
def local_config(tmp_path: Path) -> CloudBackupConfig:
    """Konfiguracja lokalna z tymczasowym katalogiem."""
    return CloudBackupConfig(
        backend=CloudBackendType.LOCAL,
        bucket_name=str(tmp_path / "test-bucket"),
        prefix="backups",
    )


@pytest.fixture()
def local_provider(local_config: CloudBackupConfig) -> LocalBackupProvider:
    """Dostawca lokalny do testów."""
    return LocalBackupProvider(local_config)


@pytest.fixture()
def sample_archive() -> bytes:
    """Przykładowe dane archiwum (symulacja ZIP)."""
    # Nie musi to być prawdziwy ZIP — testujemy infrastrukturę
    return b"PK\x03\x04" + b"test-archive-content-" * 100


@pytest.fixture()
def sample_hash(sample_archive: bytes) -> str:
    """Hash przykładowego archiwum."""
    return compute_file_hash(sample_archive)


@pytest.fixture()
def sample_project_id() -> str:
    """Przykładowe ID projektu."""
    return "proj-00000000-1111-2222-3333-444444444444"


@pytest.fixture()
def fixed_timestamp() -> str:
    """Stały timestamp do testów deterministycznych."""
    return "2026-01-15T10:30:00+00:00"


# ============================================================================
# TEST: GENEROWANIE KLUCZA
# ============================================================================


class TestKeyGeneration:
    """Testy deterministycznego generowania kluczy."""

    def test_generate_backup_key_format(self) -> None:
        """Klucz ma oczekiwany format."""
        key = generate_backup_key(
            prefix="backups",
            project_id="proj-abc",
            timestamp="2026-01-15T10:30:00+00:00",
            archive_hash="aabbccddee112233445566778899aabb",
        )
        assert key == ("backups/proj-abc/" "2026-01-15T10-30-00p00-00_aabbccddee11.mvdp.zip")

    def test_generate_backup_key_deterministic(self) -> None:
        """Ten sam input = ten sam klucz."""
        args = {
            "prefix": "backups",
            "project_id": "proj-123",
            "timestamp": "2026-02-01T00:00:00+00:00",
            "archive_hash": "deadbeef" * 8,
        }
        key_a = generate_backup_key(**args)
        key_b = generate_backup_key(**args)
        assert key_a == key_b

    def test_generate_backup_key_different_inputs(self) -> None:
        """Różne inputy = różne klucze."""
        base = {
            "prefix": "backups",
            "project_id": "proj-123",
            "timestamp": "2026-01-01T00:00:00+00:00",
            "archive_hash": "aabb" * 16,
        }
        key_a = generate_backup_key(**base)
        key_b = generate_backup_key(**{**base, "project_id": "proj-456"})
        assert key_a != key_b

    def test_extract_backup_id_from_key(self) -> None:
        """Wyodrębnianie backup_id z klucza."""
        key = "backups/proj-abc/2026-01-15T10-30-00p00-00_aabbccddee11.mvdp.zip"
        backup_id = extract_backup_id_from_key(key)
        assert backup_id == "2026-01-15T10-30-00p00-00_aabbccddee11"


# ============================================================================
# TEST: COMPUTE FILE HASH
# ============================================================================


class TestComputeFileHash:
    """Testy hashowania plików."""

    def test_hash_deterministic(self) -> None:
        """Ten sam input = ten sam hash."""
        data = b"test data for hashing"
        h1 = compute_file_hash(data)
        h2 = compute_file_hash(data)
        assert h1 == h2

    def test_hash_different_data(self) -> None:
        """Różne dane = różny hash."""
        h1 = compute_file_hash(b"data_a")
        h2 = compute_file_hash(b"data_b")
        assert h1 != h2

    def test_hash_is_sha256(self) -> None:
        """Hash jest SHA-256 (64 znaki hex)."""
        h = compute_file_hash(b"test")
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)


# ============================================================================
# TEST: KONFIGURACJA
# ============================================================================


class TestCloudBackupConfig:
    """Testy walidacji konfiguracji."""

    def test_local_config_valid(self, tmp_path: Path) -> None:
        """Poprawna konfiguracja lokalna."""
        config = CloudBackupConfig(
            backend=CloudBackendType.LOCAL,
            bucket_name=str(tmp_path),
            prefix="backups",
        )
        assert config.backend == CloudBackendType.LOCAL
        assert config.prefix == "backups"

    def test_empty_bucket_raises(self) -> None:
        """Pusta nazwa bucket'a powoduje błąd."""
        with pytest.raises(CloudBackupConfigError, match="pusta"):
            CloudBackupConfig(
                backend=CloudBackendType.LOCAL,
                bucket_name="",
            )

    def test_s3_without_region_raises(self) -> None:
        """S3 bez regionu powoduje błąd."""
        with pytest.raises(CloudBackupConfigError, match="Region"):
            CloudBackupConfig(
                backend=CloudBackendType.S3,
                bucket_name="my-bucket",
            )

    def test_s3_with_region_valid(self) -> None:
        """S3 z regionem jest poprawna."""
        config = CloudBackupConfig(
            backend=CloudBackendType.S3,
            bucket_name="my-bucket",
            region="eu-central-1",
        )
        assert config.region == "eu-central-1"

    def test_config_is_frozen(self, tmp_path: Path) -> None:
        """Konfiguracja jest immutable."""
        config = CloudBackupConfig(
            backend=CloudBackendType.LOCAL,
            bucket_name=str(tmp_path),
        )
        with pytest.raises(AttributeError):
            config.bucket_name = "other"  # type: ignore[misc]


# ============================================================================
# TEST: LOCAL PROVIDER — UPLOAD
# ============================================================================


class TestLocalProviderUpload:
    """Testy uploadu LocalBackupProvider."""

    def test_upload_success(
        self,
        local_provider: LocalBackupProvider,
        sample_archive: bytes,
        sample_hash: str,
        sample_project_id: str,
        fixed_timestamp: str,
    ) -> None:
        """Upload kończy się sukcesem i zwraca poprawny wynik."""
        result = local_provider.upload(
            archive_bytes=sample_archive,
            project_id=sample_project_id,
            archive_hash=sample_hash,
            timestamp=fixed_timestamp,
        )
        assert result.success is True
        assert result.hash == sample_hash
        assert result.timestamp == fixed_timestamp
        assert result.size_bytes == len(sample_archive)
        assert result.url is not None
        assert result.url.startswith("file://")
        assert result.error_pl is None

    def test_upload_creates_file(
        self,
        local_provider: LocalBackupProvider,
        local_config: CloudBackupConfig,
        sample_archive: bytes,
        sample_hash: str,
        sample_project_id: str,
        fixed_timestamp: str,
    ) -> None:
        """Upload tworzy plik na dysku."""
        local_provider.upload(
            archive_bytes=sample_archive,
            project_id=sample_project_id,
            archive_hash=sample_hash,
            timestamp=fixed_timestamp,
        )
        key = generate_backup_key(
            prefix=local_config.prefix,
            project_id=sample_project_id,
            timestamp=fixed_timestamp,
            archive_hash=sample_hash,
        )
        file_path = Path(local_config.bucket_name) / key
        assert file_path.exists()
        assert file_path.read_bytes() == sample_archive

    def test_upload_wrong_hash_fails(
        self,
        local_provider: LocalBackupProvider,
        sample_archive: bytes,
        sample_project_id: str,
    ) -> None:
        """Upload z nieprawidłowym hashem kończy się błędem."""
        result = local_provider.upload(
            archive_bytes=sample_archive,
            project_id=sample_project_id,
            archive_hash="0000000000000000000000000000000000000000" "000000000000000000000000",
        )
        assert result.success is False
        assert result.error_pl is not None
        assert "nie zgadza się" in result.error_pl

    def test_upload_with_metadata(
        self,
        local_provider: LocalBackupProvider,
        local_config: CloudBackupConfig,
        sample_archive: bytes,
        sample_hash: str,
        sample_project_id: str,
        fixed_timestamp: str,
    ) -> None:
        """Upload z metadanymi tworzy sidecar JSON."""
        local_provider.upload(
            archive_bytes=sample_archive,
            project_id=sample_project_id,
            archive_hash=sample_hash,
            timestamp=fixed_timestamp,
            metadata={"source": "test"},
        )
        key = generate_backup_key(
            prefix=local_config.prefix,
            project_id=sample_project_id,
            timestamp=fixed_timestamp,
            archive_hash=sample_hash,
        )
        meta_path = (Path(local_config.bucket_name) / key).with_suffix(".meta.json")
        assert meta_path.exists()


# ============================================================================
# TEST: LOCAL PROVIDER — DOWNLOAD
# ============================================================================


class TestLocalProviderDownload:
    """Testy pobierania LocalBackupProvider."""

    def test_download_success(
        self,
        local_provider: LocalBackupProvider,
        sample_archive: bytes,
        sample_hash: str,
        sample_project_id: str,
        fixed_timestamp: str,
    ) -> None:
        """Pobranie istniejącego archiwum."""
        local_provider.upload(
            archive_bytes=sample_archive,
            project_id=sample_project_id,
            archive_hash=sample_hash,
            timestamp=fixed_timestamp,
        )

        key = generate_backup_key(
            prefix="backups",
            project_id=sample_project_id,
            timestamp=fixed_timestamp,
            archive_hash=sample_hash,
        )
        backup_id = extract_backup_id_from_key(key)

        data = local_provider.download(
            backup_id=backup_id,
            project_id=sample_project_id,
        )
        assert data == sample_archive

    def test_download_not_found(
        self,
        local_provider: LocalBackupProvider,
        sample_project_id: str,
    ) -> None:
        """Pobranie nieistniejącej kopii powoduje błąd."""
        with pytest.raises(CloudBackupNotFoundError, match="nie znaleziona"):
            local_provider.download(
                backup_id="nonexistent_backup_id",
                project_id=sample_project_id,
            )


# ============================================================================
# TEST: LOCAL PROVIDER — LIST
# ============================================================================


class TestLocalProviderList:
    """Testy listowania LocalBackupProvider."""

    def test_list_empty(
        self,
        local_provider: LocalBackupProvider,
        sample_project_id: str,
    ) -> None:
        """Pusta lista dla projektu bez kopii."""
        entries = local_provider.list_backups(sample_project_id)
        assert entries == []

    def test_list_after_upload(
        self,
        local_provider: LocalBackupProvider,
        sample_archive: bytes,
        sample_hash: str,
        sample_project_id: str,
        fixed_timestamp: str,
    ) -> None:
        """Lista zawiera przesłane kopie."""
        local_provider.upload(
            archive_bytes=sample_archive,
            project_id=sample_project_id,
            archive_hash=sample_hash,
            timestamp=fixed_timestamp,
        )

        entries = local_provider.list_backups(sample_project_id)
        assert len(entries) == 1
        assert entries[0].project_id == sample_project_id
        assert entries[0].size_bytes == len(sample_archive)

    def test_list_multiple_sorted_desc(
        self,
        local_provider: LocalBackupProvider,
        sample_project_id: str,
    ) -> None:
        """Wiele kopii posortowanych malejąco wg timestamp."""
        timestamps = [
            "2026-01-01T00:00:00+00:00",
            "2026-01-02T00:00:00+00:00",
            "2026-01-03T00:00:00+00:00",
        ]
        for ts in timestamps:
            data = f"archive-{ts}".encode()
            h = compute_file_hash(data)
            local_provider.upload(
                archive_bytes=data,
                project_id=sample_project_id,
                archive_hash=h,
                timestamp=ts,
            )

        entries = local_provider.list_backups(sample_project_id)
        assert len(entries) == 3
        # Posortowane malejąco — najnowsze pierwsze
        assert entries[0].backup_id > entries[1].backup_id
        assert entries[1].backup_id > entries[2].backup_id


# ============================================================================
# TEST: LOCAL PROVIDER — DELETE
# ============================================================================


class TestLocalProviderDelete:
    """Testy usuwania LocalBackupProvider."""

    def test_delete_success(
        self,
        local_provider: LocalBackupProvider,
        sample_archive: bytes,
        sample_hash: str,
        sample_project_id: str,
        fixed_timestamp: str,
    ) -> None:
        """Usunięcie istniejącej kopii."""
        local_provider.upload(
            archive_bytes=sample_archive,
            project_id=sample_project_id,
            archive_hash=sample_hash,
            timestamp=fixed_timestamp,
        )

        key = generate_backup_key(
            prefix="backups",
            project_id=sample_project_id,
            timestamp=fixed_timestamp,
            archive_hash=sample_hash,
        )
        backup_id = extract_backup_id_from_key(key)

        result = local_provider.delete_backup(
            backup_id=backup_id,
            project_id=sample_project_id,
        )
        assert result.success is True

        # Potwierdzenie usunięcia
        entries = local_provider.list_backups(sample_project_id)
        assert len(entries) == 0

    def test_delete_not_found(
        self,
        local_provider: LocalBackupProvider,
        sample_project_id: str,
    ) -> None:
        """Usunięcie nieistniejącej kopii powoduje błąd."""
        with pytest.raises(CloudBackupNotFoundError, match="nie znaleziona"):
            local_provider.delete_backup(
                backup_id="nonexistent",
                project_id=sample_project_id,
            )


# ============================================================================
# TEST: HASH VERIFICATION ON UPLOAD
# ============================================================================


class TestHashVerification:
    """Testy weryfikacji hash po upload."""

    def test_upload_verifies_input_hash(
        self,
        local_provider: LocalBackupProvider,
        sample_project_id: str,
    ) -> None:
        """Upload odrzuca dane z nieprawidłowym hashem."""
        data = b"some archive data"
        wrong_hash = "a" * 64

        result = local_provider.upload(
            archive_bytes=data,
            project_id=sample_project_id,
            archive_hash=wrong_hash,
        )
        assert result.success is False
        assert "nie zgadza się" in (result.error_pl or "")

    def test_upload_accepts_correct_hash(
        self,
        local_provider: LocalBackupProvider,
        sample_archive: bytes,
        sample_hash: str,
        sample_project_id: str,
    ) -> None:
        """Upload akceptuje dane z prawidłowym hashem."""
        result = local_provider.upload(
            archive_bytes=sample_archive,
            project_id=sample_project_id,
            archive_hash=sample_hash,
        )
        assert result.success is True
        assert result.hash == sample_hash


# ============================================================================
# TEST: FACTORY FUNCTION
# ============================================================================


class TestCloudBackupEntrySizeBytesOptional:
    """FAB-E (E1): size_bytes nieznany (np. GCS Blob.size=None) to None, nigdy
    fabrykowane 0 B (wygladaloby jak pusty/uszkodzony plik kopii). Zero
    chmury tutaj — konstrukcja dataclass/pydantic wprost, zgodnie z
    konwencja tego pliku ("Wyłącznie LocalBackupProvider (zero chmury w
    testach)")."""

    def test_cloud_backup_entry_accepts_none_size_bytes(self) -> None:
        entry = CloudBackupEntry(
            backup_id="20240101-000000+0000_abcd1234",
            project_id="proj-1",
            archive_hash="abcd1234",
            timestamp="2024-01-01T00:00:00+00:00",
            size_bytes=None,
            url="gs://bucket/key.mvdp.zip",
            key="backups/proj-1/20240101-000000+0000_abcd1234.mvdp.zip",
        )
        assert entry.size_bytes is None

    def test_backup_entry_response_accepts_none_size_bytes(self) -> None:
        from api.cloud_backup import BackupEntryResponse

        response = BackupEntryResponse(
            backup_id="20240101-000000+0000_abcd1234",
            project_id="proj-1",
            archive_hash="abcd1234",
            timestamp="2024-01-01T00:00:00+00:00",
            size_bytes=None,
            url="gs://bucket/key.mvdp.zip",
        )
        assert response.size_bytes is None


class TestCreateBackupProvider:
    """Testy funkcji fabrykującej."""

    def test_create_local_provider(self, tmp_path: Path) -> None:
        """Fabryka tworzy LocalBackupProvider."""
        config = CloudBackupConfig(
            backend=CloudBackendType.LOCAL,
            bucket_name=str(tmp_path),
        )
        provider = create_backup_provider(config)
        assert isinstance(provider, LocalBackupProvider)

    def test_create_s3_provider_with_mock_client(self) -> None:
        """Fabryka tworzy S3BackupProvider z mock klientem."""
        config = CloudBackupConfig(
            backend=CloudBackendType.S3,
            bucket_name="test-bucket",
            region="us-east-1",
        )

        class MockS3Client:
            pass

        provider = create_backup_provider(config, s3_client=MockS3Client())
        assert isinstance(provider, S3BackupProvider)

    def test_create_gcs_provider_with_mock_client(self) -> None:
        """Fabryka tworzy GCSBackupProvider z mock klientem."""
        config = CloudBackupConfig(
            backend=CloudBackendType.GCS,
            bucket_name="test-bucket",
        )

        class MockBucket:
            pass

        class MockGCSClient:
            def bucket(self, name: str) -> MockBucket:
                return MockBucket()

        provider = create_backup_provider(config, gcs_client=MockGCSClient())
        assert isinstance(provider, GCSBackupProvider)

    def test_wrong_backend_for_local_raises(self, tmp_path: Path) -> None:
        """LocalBackupProvider odrzuca konfigurację S3."""
        config = CloudBackupConfig(
            backend=CloudBackendType.S3,
            bucket_name=str(tmp_path),
            region="us-east-1",
        )
        with pytest.raises(CloudBackupConfigError, match="LOCAL"):
            LocalBackupProvider(config)


# ============================================================================
# TEST: ROUNDTRIP
# ============================================================================


class TestRoundtrip:
    """Test cyklu: upload → download → verify hash."""

    def test_full_roundtrip(
        self,
        local_provider: LocalBackupProvider,
        sample_archive: bytes,
        sample_hash: str,
        sample_project_id: str,
        fixed_timestamp: str,
    ) -> None:
        """Pełny cykl: upload → list → download → verify."""
        # 1. Upload
        upload_result = local_provider.upload(
            archive_bytes=sample_archive,
            project_id=sample_project_id,
            archive_hash=sample_hash,
            timestamp=fixed_timestamp,
        )
        assert upload_result.success is True

        # 2. List
        entries = local_provider.list_backups(sample_project_id)
        assert len(entries) == 1
        backup_id = entries[0].backup_id

        # 3. Download
        downloaded = local_provider.download(
            backup_id=backup_id,
            project_id=sample_project_id,
        )

        # 4. Verify hash
        downloaded_hash = compute_file_hash(downloaded)
        assert downloaded_hash == sample_hash

        # 5. Verify content
        assert downloaded == sample_archive

    def test_roundtrip_multiple_archives(
        self,
        local_provider: LocalBackupProvider,
        sample_project_id: str,
    ) -> None:
        """Roundtrip z wieloma archiwami — każde zachowuje integralność."""
        archives: list[tuple[bytes, str, str]] = []
        for i in range(3):
            data = f"archive-content-{i}-{'x' * 500}".encode()
            h = compute_file_hash(data)
            ts = f"2026-01-0{i + 1}T12:00:00+00:00"
            archives.append((data, h, ts))

            local_provider.upload(
                archive_bytes=data,
                project_id=sample_project_id,
                archive_hash=h,
                timestamp=ts,
            )

        entries = local_provider.list_backups(sample_project_id)
        assert len(entries) == 3

        for entry in entries:
            downloaded = local_provider.download(
                backup_id=entry.backup_id,
                project_id=sample_project_id,
            )
            downloaded_hash = compute_file_hash(downloaded)
            # Znajdź oryginalne archiwum
            originals = [(d, h) for d, h, _ in archives if h[:12] == entry.archive_hash]
            assert len(originals) == 1
            assert downloaded == originals[0][0]
            assert downloaded_hash == originals[0][1]

    def test_upload_delete_roundtrip(
        self,
        local_provider: LocalBackupProvider,
        sample_archive: bytes,
        sample_hash: str,
        sample_project_id: str,
        fixed_timestamp: str,
    ) -> None:
        """Upload → delete → list (pusta)."""
        local_provider.upload(
            archive_bytes=sample_archive,
            project_id=sample_project_id,
            archive_hash=sample_hash,
            timestamp=fixed_timestamp,
        )

        entries = local_provider.list_backups(sample_project_id)
        assert len(entries) == 1

        local_provider.delete_backup(
            backup_id=entries[0].backup_id,
            project_id=sample_project_id,
        )

        entries_after = local_provider.list_backups(sample_project_id)
        assert len(entries_after) == 0


# ============================================================================
# TEST: ERROR HANDLING
# ============================================================================


class TestErrorHandling:
    """Testy obsługi błędów."""

    def test_download_from_nonexistent_project(
        self,
        local_provider: LocalBackupProvider,
    ) -> None:
        """Pobieranie z nieistniejącego projektu."""
        with pytest.raises(CloudBackupNotFoundError):
            local_provider.download(
                backup_id="some-id",
                project_id="nonexistent-project",
            )

    def test_delete_from_nonexistent_project(
        self,
        local_provider: LocalBackupProvider,
    ) -> None:
        """Usuwanie z nieistniejącego projektu."""
        with pytest.raises(CloudBackupNotFoundError):
            local_provider.delete_backup(
                backup_id="some-id",
                project_id="nonexistent-project",
            )

    def test_result_is_frozen(self) -> None:
        """CloudBackupResult jest immutable."""
        result = CloudBackupResult(
            success=True,
            url="file:///tmp/test",
            hash="abc123",
        )
        with pytest.raises(AttributeError):
            result.success = False  # type: ignore[misc]

    def test_entry_is_frozen(self) -> None:
        """CloudBackupEntry jest immutable."""
        entry = CloudBackupEntry(
            backup_id="id",
            project_id="proj",
            archive_hash="abc",
            timestamp="2026-01-01T00:00:00+00:00",
            size_bytes=100,
            url="file:///tmp/test",
            key="backups/proj/test.mvdp.zip",
        )
        with pytest.raises(AttributeError):
            entry.backup_id = "other"  # type: ignore[misc]

    def test_upload_auto_timestamp(
        self,
        local_provider: LocalBackupProvider,
        sample_archive: bytes,
        sample_hash: str,
        sample_project_id: str,
    ) -> None:
        """Upload bez timestamp generuje automatyczny."""
        result = local_provider.upload(
            archive_bytes=sample_archive,
            project_id=sample_project_id,
            archive_hash=sample_hash,
            # timestamp=None (default)
        )
        assert result.success is True
        assert result.timestamp is not None
        # Powinien być parsowany jako ISO 8601
        dt = datetime.fromisoformat(result.timestamp)
        assert dt.tzinfo is not None
