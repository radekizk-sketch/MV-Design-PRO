"""
Cloud Backup Infrastructure — przechowywanie archiwów w chmurze.

Obsługiwane backendy:
- Amazon S3
- Google Cloud Storage (GCS)
- Lokalny system plików (fallback/test)

KANON:
- Infrastructure layer — zero logiki biznesowej
- NOT-A-SOLVER
- Deterministyczny upload (hash verification)
- 100% PL messages
"""

from __future__ import annotations

import hashlib
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path
from typing import Any

logger = logging.getLogger("mv_design_pro.cloud_backup")


# ============================================================================
# BŁĘDY
# ============================================================================


class CloudBackupError(Exception):
    """Bazowy błąd kopii zapasowej w chmurze."""

    pass


class CloudBackupConfigError(CloudBackupError):
    """Błąd konfiguracji kopii zapasowej."""

    pass


class CloudBackupUploadError(CloudBackupError):
    """Błąd przesyłania archiwum do chmury."""

    pass


class CloudBackupDownloadError(CloudBackupError):
    """Błąd pobierania archiwum z chmury."""

    pass


class CloudBackupNotFoundError(CloudBackupError):
    """Kopia zapasowa nie została znaleziona."""

    pass


class CloudBackupPermissionError(CloudBackupError):
    """Brak uprawnień do operacji na kopii zapasowej."""

    pass


class CloudBackupIntegrityError(CloudBackupError):
    """Błąd integralności kopii zapasowej (hash mismatch)."""

    pass


# ============================================================================
# TYPY
# ============================================================================


class CloudBackendType(str, Enum):
    """Typ backendu chmurowego."""

    S3 = "S3"
    GCS = "GCS"
    LOCAL = "LOCAL"


# ============================================================================
# KONFIGURACJA (FROZEN)
# ============================================================================


@dataclass(frozen=True)
class CloudBackupConfig:
    """
    Konfiguracja kopii zapasowej w chmurze.

    Immutable — każda zmiana wymaga nowej instancji.
    """

    backend: CloudBackendType
    bucket_name: str
    prefix: str = "backups"
    credentials_path: str | None = None
    region: str | None = None
    endpoint_url: str | None = None  # Dla S3-compatible (MinIO)

    def __post_init__(self) -> None:
        if not self.bucket_name:
            raise CloudBackupConfigError("Nazwa bucket'a nie może być pusta.")
        if self.backend == CloudBackendType.S3 and not self.region:
            raise CloudBackupConfigError("Region jest wymagany dla backendu S3.")


# ============================================================================
# WYNIK OPERACJI (FROZEN)
# ============================================================================


@dataclass(frozen=True)
class CloudBackupResult:
    """
    Wynik operacji kopii zapasowej.

    Immutable — reprezentuje zakończoną operację.
    """

    success: bool
    url: str | None = None
    hash: str | None = None
    timestamp: str | None = None  # ISO 8601
    size_bytes: int | None = None
    error_pl: str | None = None


@dataclass(frozen=True)
class CloudBackupEntry:
    """
    Wpis kopii zapasowej na liście.

    Reprezentuje pojedynczą kopię zapasową w chmurze.
    """

    backup_id: str
    project_id: str
    archive_hash: str
    timestamp: str  # ISO 8601
    size_bytes: int
    url: str
    key: str  # Pełna ścieżka/klucz w storage


# ============================================================================
# NARZĘDZIA
# ============================================================================


def compute_file_hash(data: bytes) -> str:
    """Oblicz SHA-256 hash danych binarnych."""
    return hashlib.sha256(data).hexdigest()


def generate_backup_key(
    prefix: str,
    project_id: str,
    timestamp: str,
    archive_hash: str,
) -> str:
    """
    Generuj deterministyczny klucz kopii zapasowej.

    Format: {prefix}/{project_id}/{timestamp}_{archive_hash[:12]}.mvdp.zip
    """
    safe_timestamp = timestamp.replace(":", "-").replace("+", "p")
    hash_short = archive_hash[:12]
    return f"{prefix}/{project_id}/{safe_timestamp}_{hash_short}.mvdp.zip"


def _normalize_key(key: str) -> str:
    """
    Znormalizuj klucz storage do formatu POSIX (separator '/').

    Zamienia backslashe (Windows) na slash, redukuje wielokrotne '//'.
    Przenośna normalizacja — identyczny wynik na Windows i Linux.
    """
    normalized = key.replace("\\", "/")
    while "//" in normalized:
        normalized = normalized.replace("//", "/")
    return normalized


def extract_backup_id_from_key(key: str) -> str:
    """Wyodrębnij backup_id z klucza storage."""
    key = _normalize_key(key)
    filename = key.rsplit("/", maxsplit=1)[-1]
    return filename.removesuffix(".mvdp.zip")


def extract_project_id_from_key(key: str) -> str:
    """Wyodrębnij project_id z klucza storage."""
    parts = key.split("/")
    if len(parts) >= 3:
        return parts[-2]
    return ""


# ============================================================================
# INTERFEJS DOSTAWCY (ABC)
# ============================================================================


class CloudBackupProvider(ABC):
    """
    Abstrakcyjny interfejs dostawcy kopii zapasowych.

    Każdy dostawca (S3, GCS, LOCAL) implementuje ten kontrakt.
    """

    @abstractmethod
    def upload(
        self,
        archive_bytes: bytes,
        project_id: str,
        archive_hash: str,
        timestamp: str | None = None,
        metadata: dict[str, str] | None = None,
    ) -> CloudBackupResult:
        """
        Prześlij archiwum do chmury.

        Args:
            archive_bytes: Bajty archiwum ZIP
            project_id: ID projektu
            archive_hash: Hash archiwum (SHA-256)
            timestamp: Znacznik czasu (ISO 8601), domyślnie teraz
            metadata: Dodatkowe metadane

        Returns:
            CloudBackupResult z URL i weryfikacją hash
        """
        ...

    @abstractmethod
    def download(self, backup_id: str, project_id: str) -> bytes:
        """
        Pobierz archiwum z chmury.

        Args:
            backup_id: ID kopii zapasowej
            project_id: ID projektu

        Returns:
            Bajty archiwum ZIP

        Raises:
            CloudBackupNotFoundError: Kopia nie istnieje
            CloudBackupDownloadError: Błąd pobierania
        """
        ...

    @abstractmethod
    def list_backups(self, project_id: str) -> list[CloudBackupEntry]:
        """
        Lista kopii zapasowych dla projektu.

        Args:
            project_id: ID projektu

        Returns:
            Lista wpisów posortowana wg timestamp (malejąco)
        """
        ...

    @abstractmethod
    def delete_backup(self, backup_id: str, project_id: str) -> CloudBackupResult:
        """
        Usuń kopię zapasową.

        Args:
            backup_id: ID kopii zapasowej
            project_id: ID projektu

        Returns:
            CloudBackupResult z informacją o powodzeniu
        """
        ...

    def _make_timestamp(self, timestamp: str | None) -> str:
        """Utwórz timestamp ISO 8601 (UTC)."""
        if timestamp is not None:
            return timestamp
        return datetime.now(UTC).isoformat()

    def _verify_hash(
        self,
        data: bytes,
        expected_hash: str,
    ) -> None:
        """
        Weryfikuj hash po upload/download.

        Raises:
            CloudBackupIntegrityError: Hash nie zgadza się
        """
        actual_hash = compute_file_hash(data)
        if actual_hash != expected_hash:
            raise CloudBackupIntegrityError(
                f"Błąd integralności kopii zapasowej: "
                f"oczekiwano {expected_hash}, otrzymano {actual_hash}"
            )


# ============================================================================
# DOSTAWCA LOKALNY (FALLBACK / TEST)
# ============================================================================


class LocalBackupProvider(CloudBackupProvider):
    """
    Dostawca kopii zapasowych na lokalnym systemie plików.

    Używany jako fallback w środowisku deweloperskim i w testach.
    """

    def __init__(self, config: CloudBackupConfig) -> None:
        if config.backend != CloudBackendType.LOCAL:
            raise CloudBackupConfigError("LocalBackupProvider wymaga backendu LOCAL.")
        self._config = config
        self._root = Path(config.bucket_name)

    def upload(
        self,
        archive_bytes: bytes,
        project_id: str,
        archive_hash: str,
        timestamp: str | None = None,
        metadata: dict[str, str] | None = None,
    ) -> CloudBackupResult:
        ts = self._make_timestamp(timestamp)

        # Weryfikuj hash danych wejściowych
        actual_hash = compute_file_hash(archive_bytes)
        if actual_hash != archive_hash:
            return CloudBackupResult(
                success=False,
                error_pl=(
                    f"Hash archiwum nie zgadza się: "
                    f"oczekiwano {archive_hash}, otrzymano {actual_hash}"
                ),
            )

        key = generate_backup_key(
            prefix=self._config.prefix,
            project_id=project_id,
            timestamp=ts,
            archive_hash=archive_hash,
        )
        file_path = self._root / key

        try:
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_bytes(archive_bytes)
        except PermissionError as exc:
            raise CloudBackupPermissionError(f"Brak uprawnień do zapisu: {file_path}") from exc
        except OSError as exc:
            raise CloudBackupUploadError(f"Błąd zapisu pliku kopii zapasowej: {exc}") from exc

        # Weryfikuj hash po zapisie
        written_data = file_path.read_bytes()
        self._verify_hash(written_data, archive_hash)

        # Zapisz metadane jako sidecar JSON
        if metadata:
            import json

            meta_path = file_path.with_suffix(".meta.json")
            meta_path.write_text(
                json.dumps(metadata, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

        url = f"file://{file_path.resolve()}"
        logger.info(
            "Kopia zapasowa przesłana: project=%s, key=%s, hash=%s",
            project_id,
            key,
            archive_hash[:12],
        )

        return CloudBackupResult(
            success=True,
            url=url,
            hash=archive_hash,
            timestamp=ts,
            size_bytes=len(archive_bytes),
        )

    def download(self, backup_id: str, project_id: str) -> bytes:
        key = self._find_key(backup_id, project_id)
        if key is None:
            raise CloudBackupNotFoundError(
                f"Kopia zapasowa nie znaleziona: " f"project={project_id}, backup={backup_id}"
            )
        file_path = self._root / key

        try:
            data = file_path.read_bytes()
        except PermissionError as exc:
            raise CloudBackupPermissionError(f"Brak uprawnień do odczytu: {file_path}") from exc
        except OSError as exc:
            raise CloudBackupDownloadError(f"Błąd odczytu pliku kopii zapasowej: {exc}") from exc

        logger.info(
            "Kopia zapasowa pobrana: project=%s, backup=%s",
            project_id,
            backup_id,
        )
        return data

    def list_backups(self, project_id: str) -> list[CloudBackupEntry]:
        project_dir = self._root / self._config.prefix / project_id
        if not project_dir.exists():
            return []

        entries: list[CloudBackupEntry] = []
        for file_path in sorted(project_dir.glob("*.mvdp.zip"), reverse=True):
            stat = file_path.stat()
            key = _normalize_key(str(file_path.relative_to(self._root)))
            backup_id = extract_backup_id_from_key(key)

            # Odczytaj hash z nazwy pliku
            parts = backup_id.rsplit("_", maxsplit=1)
            archive_hash_short = parts[-1] if len(parts) >= 2 else ""
            # Odtwórz timestamp z nazwy
            ts_part = parts[0] if len(parts) >= 2 else backup_id

            entries.append(
                CloudBackupEntry(
                    backup_id=backup_id,
                    project_id=project_id,
                    archive_hash=archive_hash_short,
                    timestamp=ts_part.replace("-", ":", 2).replace("p", "+"),
                    size_bytes=stat.st_size,
                    url=f"file://{file_path.resolve()}",
                    key=key,
                )
            )

        return entries

    def delete_backup(self, backup_id: str, project_id: str) -> CloudBackupResult:
        key = self._find_key(backup_id, project_id)
        if key is None:
            raise CloudBackupNotFoundError(
                f"Kopia zapasowa nie znaleziona: " f"project={project_id}, backup={backup_id}"
            )
        file_path = self._root / key

        try:
            file_path.unlink()
        except PermissionError as exc:
            raise CloudBackupPermissionError(f"Brak uprawnień do usunięcia: {file_path}") from exc
        except OSError as exc:
            raise CloudBackupUploadError(f"Błąd usuwania pliku kopii zapasowej: {exc}") from exc

        # Usuń sidecar metadanych jeśli istnieje
        meta_path = file_path.with_suffix(".meta.json")
        if meta_path.exists():
            meta_path.unlink(missing_ok=True)

        logger.info(
            "Kopia zapasowa usunięta: project=%s, backup=%s",
            project_id,
            backup_id,
        )

        return CloudBackupResult(
            success=True,
            timestamp=datetime.now(UTC).isoformat(),
        )

    def _find_key(self, backup_id: str, project_id: str) -> str | None:
        """Znajdź klucz pliku na podstawie backup_id.

        Akceptuje backup_id z separatorem '\\' lub '/' (przenośność Windows/Linux).
        Zawsze zwraca klucz z separatorem '/' (format POSIX/kanoniczny).
        """
        # Normalizuj wejście — na Windows list_backups może zwrócić backslashe
        backup_id = _normalize_key(backup_id)

        project_dir = self._root / self._config.prefix / project_id
        if not project_dir.exists():
            return None

        target_filename = f"{backup_id}.mvdp.zip"
        candidate = project_dir / target_filename
        if candidate.exists():
            return _normalize_key(str(candidate.relative_to(self._root)))

        return None


# ============================================================================
# DOSTAWCA S3
# ============================================================================


class S3BackupProvider(CloudBackupProvider):
    """
    Dostawca kopii zapasowych Amazon S3.

    Wymaga boto3. W testach jednostkowych użyj LocalBackupProvider.
    """

    def __init__(
        self,
        config: CloudBackupConfig,
        s3_client: Any | None = None,
    ) -> None:
        if config.backend != CloudBackendType.S3:
            raise CloudBackupConfigError("S3BackupProvider wymaga backendu S3.")
        self._config = config

        if s3_client is not None:
            self._client = s3_client
        else:
            self._client = self._create_client()

    def _create_client(self) -> Any:
        """Utwórz klienta boto3 S3."""
        try:
            import boto3
        except ImportError as exc:
            raise CloudBackupConfigError(
                "Biblioteka boto3 jest wymagana dla backendu S3. " "Zainstaluj: pip install boto3"
            ) from exc

        kwargs: dict[str, Any] = {
            "region_name": self._config.region,
        }
        if self._config.endpoint_url:
            kwargs["endpoint_url"] = self._config.endpoint_url

        return boto3.client("s3", **kwargs)

    def upload(
        self,
        archive_bytes: bytes,
        project_id: str,
        archive_hash: str,
        timestamp: str | None = None,
        metadata: dict[str, str] | None = None,
    ) -> CloudBackupResult:
        ts = self._make_timestamp(timestamp)

        # Weryfikuj hash danych wejściowych
        actual_hash = compute_file_hash(archive_bytes)
        if actual_hash != archive_hash:
            return CloudBackupResult(
                success=False,
                error_pl=(
                    f"Hash archiwum nie zgadza się: "
                    f"oczekiwano {archive_hash}, "
                    f"otrzymano {actual_hash}"
                ),
            )

        key = generate_backup_key(
            prefix=self._config.prefix,
            project_id=project_id,
            timestamp=ts,
            archive_hash=archive_hash,
        )

        try:
            extra_args: dict[str, Any] = {
                "ContentType": "application/zip",
            }
            if metadata:
                extra_args["Metadata"] = metadata

            self._client.put_object(
                Bucket=self._config.bucket_name,
                Key=key,
                Body=archive_bytes,
                **extra_args,
            )
        except self._client.exceptions.NoSuchBucket:
            raise CloudBackupNotFoundError(f"Bucket nie istnieje: {self._config.bucket_name}")
        except Exception as exc:
            exc_name = type(exc).__name__
            if "AccessDenied" in exc_name or "Forbidden" in str(exc):
                raise CloudBackupPermissionError(
                    f"Brak uprawnień do bucket'a: " f"{self._config.bucket_name}"
                ) from exc
            raise CloudBackupUploadError(f"Błąd przesyłania do S3: {exc}") from exc

        url = f"s3://{self._config.bucket_name}/{key}"

        logger.info(
            "Kopia zapasowa S3: project=%s, key=%s",
            project_id,
            key,
        )

        return CloudBackupResult(
            success=True,
            url=url,
            hash=archive_hash,
            timestamp=ts,
            size_bytes=len(archive_bytes),
        )

    def download(self, backup_id: str, project_id: str) -> bytes:
        key = self._build_key_from_id(backup_id, project_id)

        try:
            response = self._client.get_object(
                Bucket=self._config.bucket_name,
                Key=key,
            )
            data = response["Body"].read()
        except self._client.exceptions.NoSuchKey:
            raise CloudBackupNotFoundError(
                f"Kopia zapasowa nie znaleziona w S3: " f"project={project_id}, backup={backup_id}"
            )
        except Exception as exc:
            raise CloudBackupDownloadError(f"Błąd pobierania z S3: {exc}") from exc

        return data

    def list_backups(self, project_id: str) -> list[CloudBackupEntry]:
        list_prefix = f"{self._config.prefix}/{project_id}/"

        try:
            response = self._client.list_objects_v2(
                Bucket=self._config.bucket_name,
                Prefix=list_prefix,
            )
        except Exception as exc:
            raise CloudBackupDownloadError(f"Błąd listowania kopii S3: {exc}") from exc

        entries: list[CloudBackupEntry] = []
        for obj in response.get("Contents", []):
            key = obj["Key"]
            if not key.endswith(".mvdp.zip"):
                continue

            backup_id = extract_backup_id_from_key(key)
            parts = backup_id.rsplit("_", maxsplit=1)
            archive_hash_short = parts[-1] if len(parts) >= 2 else ""
            ts_part = parts[0] if len(parts) >= 2 else backup_id

            entries.append(
                CloudBackupEntry(
                    backup_id=backup_id,
                    project_id=project_id,
                    archive_hash=archive_hash_short,
                    timestamp=ts_part.replace("-", ":", 2).replace("p", "+"),
                    size_bytes=obj.get("Size", 0),
                    url=f"s3://{self._config.bucket_name}/{key}",
                    key=key,
                )
            )

        # Sortuj wg timestamp malejąco
        entries.sort(key=lambda e: e.timestamp, reverse=True)
        return entries

    def delete_backup(self, backup_id: str, project_id: str) -> CloudBackupResult:
        key = self._build_key_from_id(backup_id, project_id)

        try:
            self._client.delete_object(
                Bucket=self._config.bucket_name,
                Key=key,
            )
        except Exception as exc:
            raise CloudBackupUploadError(f"Błąd usuwania z S3: {exc}") from exc

        return CloudBackupResult(
            success=True,
            timestamp=datetime.now(UTC).isoformat(),
        )

    def _build_key_from_id(self, backup_id: str, project_id: str) -> str:
        """Zbuduj klucz S3 z backup_id."""
        return f"{self._config.prefix}/{project_id}/" f"{backup_id}.mvdp.zip"


# ============================================================================
# DOSTAWCA GCS
# ============================================================================


class GCSBackupProvider(CloudBackupProvider):
    """
    Dostawca kopii zapasowych Google Cloud Storage.

    Wymaga google-cloud-storage.
    W testach jednostkowych użyj LocalBackupProvider.
    """

    def __init__(
        self,
        config: CloudBackupConfig,
        storage_client: Any | None = None,
    ) -> None:
        if config.backend != CloudBackendType.GCS:
            raise CloudBackupConfigError("GCSBackupProvider wymaga backendu GCS.")
        self._config = config

        if storage_client is not None:
            self._client = storage_client
        else:
            self._client = self._create_client()

        self._bucket = self._client.bucket(config.bucket_name)

    def _create_client(self) -> Any:
        """Utwórz klienta Google Cloud Storage."""
        try:
            from google.cloud import storage
        except ImportError as exc:
            raise CloudBackupConfigError(
                "Biblioteka google-cloud-storage jest wymagana "
                "dla backendu GCS. "
                "Zainstaluj: pip install google-cloud-storage"
            ) from exc

        kwargs: dict[str, Any] = {}
        if self._config.credentials_path:
            kwargs["credentials"] = self._config.credentials_path

        return storage.Client(**kwargs)

    def upload(
        self,
        archive_bytes: bytes,
        project_id: str,
        archive_hash: str,
        timestamp: str | None = None,
        metadata: dict[str, str] | None = None,
    ) -> CloudBackupResult:
        ts = self._make_timestamp(timestamp)

        # Weryfikuj hash danych wejściowych
        actual_hash = compute_file_hash(archive_bytes)
        if actual_hash != archive_hash:
            return CloudBackupResult(
                success=False,
                error_pl=(
                    f"Hash archiwum nie zgadza się: "
                    f"oczekiwano {archive_hash}, "
                    f"otrzymano {actual_hash}"
                ),
            )

        key = generate_backup_key(
            prefix=self._config.prefix,
            project_id=project_id,
            timestamp=ts,
            archive_hash=archive_hash,
        )

        try:
            blob = self._bucket.blob(key)
            blob.content_type = "application/zip"
            if metadata:
                blob.metadata = metadata
            blob.upload_from_string(
                archive_bytes,
                content_type="application/zip",
            )
        except Exception as exc:
            exc_str = str(exc)
            if "403" in exc_str or "Forbidden" in exc_str:
                raise CloudBackupPermissionError(
                    f"Brak uprawnień do bucket'a GCS: " f"{self._config.bucket_name}"
                ) from exc
            if "404" in exc_str or "Not Found" in exc_str:
                raise CloudBackupNotFoundError(
                    f"Bucket GCS nie istnieje: " f"{self._config.bucket_name}"
                ) from exc
            raise CloudBackupUploadError(f"Błąd przesyłania do GCS: {exc}") from exc

        url = f"gs://{self._config.bucket_name}/{key}"

        logger.info(
            "Kopia zapasowa GCS: project=%s, key=%s",
            project_id,
            key,
        )

        return CloudBackupResult(
            success=True,
            url=url,
            hash=archive_hash,
            timestamp=ts,
            size_bytes=len(archive_bytes),
        )

    def download(self, backup_id: str, project_id: str) -> bytes:
        key = self._build_key_from_id(backup_id, project_id)

        try:
            blob = self._bucket.blob(key)
            data = blob.download_as_bytes()
        except Exception as exc:
            exc_str = str(exc)
            if "404" in exc_str or "Not Found" in exc_str:
                raise CloudBackupNotFoundError(
                    f"Kopia zapasowa nie znaleziona w GCS: "
                    f"project={project_id}, backup={backup_id}"
                )
            raise CloudBackupDownloadError(f"Błąd pobierania z GCS: {exc}") from exc

        return data

    def list_backups(self, project_id: str) -> list[CloudBackupEntry]:
        list_prefix = f"{self._config.prefix}/{project_id}/"

        try:
            blobs = self._client.list_blobs(
                self._config.bucket_name,
                prefix=list_prefix,
            )
        except Exception as exc:
            raise CloudBackupDownloadError(f"Błąd listowania kopii GCS: {exc}") from exc

        entries: list[CloudBackupEntry] = []
        for blob in blobs:
            key = blob.name
            if not key.endswith(".mvdp.zip"):
                continue

            backup_id = extract_backup_id_from_key(key)
            parts = backup_id.rsplit("_", maxsplit=1)
            archive_hash_short = parts[-1] if len(parts) >= 2 else ""
            ts_part = parts[0] if len(parts) >= 2 else backup_id

            entries.append(
                CloudBackupEntry(
                    backup_id=backup_id,
                    project_id=project_id,
                    archive_hash=archive_hash_short,
                    timestamp=ts_part.replace("-", ":", 2).replace("p", "+"),
                    size_bytes=blob.size or 0,
                    url=f"gs://{self._config.bucket_name}/{key}",
                    key=key,
                )
            )

        # Sortuj wg timestamp malejąco
        entries.sort(key=lambda e: e.timestamp, reverse=True)
        return entries

    def delete_backup(self, backup_id: str, project_id: str) -> CloudBackupResult:
        key = self._build_key_from_id(backup_id, project_id)

        try:
            blob = self._bucket.blob(key)
            blob.delete()
        except Exception as exc:
            exc_str = str(exc)
            if "404" in exc_str or "Not Found" in exc_str:
                raise CloudBackupNotFoundError(
                    f"Kopia zapasowa nie znaleziona w GCS: "
                    f"project={project_id}, backup={backup_id}"
                )
            raise CloudBackupUploadError(f"Błąd usuwania z GCS: {exc}") from exc

        return CloudBackupResult(
            success=True,
            timestamp=datetime.now(UTC).isoformat(),
        )

    def _build_key_from_id(self, backup_id: str, project_id: str) -> str:
        """Zbuduj klucz GCS z backup_id."""
        return f"{self._config.prefix}/{project_id}/" f"{backup_id}.mvdp.zip"


# ============================================================================
# FABRYKA
# ============================================================================


def create_backup_provider(
    config: CloudBackupConfig,
    *,
    s3_client: Any | None = None,
    gcs_client: Any | None = None,
) -> CloudBackupProvider:
    """
    Utwórz dostawcę kopii zapasowych na podstawie konfiguracji.

    Args:
        config: Konfiguracja backendu
        s3_client: Opcjonalny klient S3 (do testów / DI)
        gcs_client: Opcjonalny klient GCS (do testów / DI)

    Returns:
        CloudBackupProvider odpowiedni dla podanego backendu

    Raises:
        CloudBackupConfigError: Nieobsługiwany typ backendu
    """
    if config.backend == CloudBackendType.LOCAL:
        return LocalBackupProvider(config)
    elif config.backend == CloudBackendType.S3:
        return S3BackupProvider(config, s3_client=s3_client)
    elif config.backend == CloudBackendType.GCS:
        return GCSBackupProvider(config, storage_client=gcs_client)
    else:
        raise CloudBackupConfigError(f"Nieobsługiwany typ backendu: {config.backend}")
