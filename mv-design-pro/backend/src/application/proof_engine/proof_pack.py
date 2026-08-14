from __future__ import annotations

import hashlib
import io
import json
import sys
import zipfile
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid5

from application.proof_engine.proof_inspector.exporters import (
    export_to_json,
    export_to_pdf,
    export_to_tex,
    is_pdf_export_available,
)
from application.proof_engine.types import ProofDocument, ProofType

_FIXED_ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)


@dataclass(frozen=True)
class ProofPackContext:
    project_id: str
    case_id: str
    run_id: str
    snapshot_id: str
    mv_design_pro_version: str | None = None


class ProofPackBuilder:
    def __init__(self, context: ProofPackContext) -> None:
        self._context = context

    def build(self, proof_doc: ProofDocument) -> bytes:
        proof_json = _normalize_newlines(export_to_json(proof_doc)).encode("utf-8")
        proof_tex = _normalize_newlines(export_to_tex(proof_doc)).encode("utf-8")
        proof_pdf = self._maybe_export_pdf(proof_doc)

        file_entries: dict[str, bytes] = {
            "proof_pack/proof.json": proof_json,
            "proof_pack/proof.tex": proof_tex,
        }
        if proof_pdf is not None:
            file_entries["proof_pack/proof.pdf"] = proof_pdf

        manifest = self._build_manifest(proof_doc, file_entries)
        manifest_bytes = _normalize_newlines(
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True)
        ).encode("utf-8")

        signature_bytes = self._build_signature(file_entries, manifest_bytes)

        return self._build_zip(file_entries, manifest_bytes, signature_bytes)

    def _maybe_export_pdf(self, proof_doc: ProofDocument) -> bytes | None:
        if not is_pdf_export_available():
            return None
        try:
            return export_to_pdf(proof_doc)
        except RuntimeError:
            return None

    def _build_manifest(
        self,
        proof_doc: ProofDocument,
        file_entries: dict[str, bytes],
    ) -> dict[str, object]:
        files = []
        for path in sorted(file_entries.keys()):
            payload = file_entries[path]
            files.append(
                {
                    "path": path,
                    "sha256": _sha256_hex(payload),
                    "bytes": len(payload),
                }
            )

        latex_engine = "pdflatex" if "proof_pack/proof.pdf" in file_entries else None

        return {
            "pack_version": "1.0",
            "created_at_utc": _format_datetime_utc(proof_doc.created_at),
            "project_id": self._context.project_id,
            "case_id": self._context.case_id,
            "run_id": self._context.run_id,
            "snapshot_id": self._context.snapshot_id,
            "proof_type": proof_pack_proof_type(proof_doc.proof_type),
            "proof_fingerprint": _sha256_hex(file_entries["proof_pack/proof.json"]),
            "files": files,
            "toolchain": {
                "mv_design_pro_version": self._context.mv_design_pro_version,
                "python_version": _python_version(),
                "latex_engine": latex_engine,
            },
            "determinism": {
                "canonical_json": True,
                "sorted_zip_entries": True,
                "stable_newlines": "LF",
                "notes_pl": ("Pakiet jest deterministyczny dla identycznych wejść i toolchain."),
            },
        }

    def _build_signature(
        self,
        file_entries: dict[str, bytes],
        manifest_bytes: bytes,
    ) -> bytes:
        signature_files = self._signature_files(file_entries, manifest_bytes)
        pack_fingerprint = _pack_fingerprint(signature_files)
        latex_engine = "pdflatex" if "proof_pack/proof.pdf" in file_entries else None

        signature_payload = {
            "schema_version": "1.0",
            "algorithm": "SHA-256",
            "pack_fingerprint": pack_fingerprint,
            "files": signature_files,
            "toolchain": {
                "mv_design_pro_version": self._context.mv_design_pro_version,
                "python_version": sys.version,
                "latex_engine": latex_engine,
            },
            "notes_pl": (
                "Plik signature.json służy wyłącznie do weryfikacji integralności "
                "pakietu. Nie jest podpisem kryptograficznym."
            ),
        }

        return _normalize_newlines(
            json.dumps(signature_payload, ensure_ascii=False, indent=2, sort_keys=True)
        ).encode("utf-8")

    def _signature_files(
        self,
        file_entries: dict[str, bytes],
        manifest_bytes: bytes,
    ) -> list[dict[str, object]]:
        signature_entries = {
            "proof_pack/manifest.json": manifest_bytes,
            **file_entries,
        }
        files: list[dict[str, object]] = []
        for path in sorted(signature_entries.keys()):
            payload = signature_entries[path]
            file_record: dict[str, object] = {
                "path": path,
                "sha256": _sha256_hex(payload),
                "bytes": len(payload),
            }
            if path == "proof_pack/proof.pdf":
                file_record["optional"] = True
            files.append(file_record)
        return files

    def _build_zip(
        self,
        file_entries: dict[str, bytes],
        manifest_bytes: bytes,
        signature_bytes: bytes,
    ) -> bytes:
        entries = {
            "assets/": b"",
            "proof_pack/": b"",
            "proof_pack/manifest.json": manifest_bytes,
            "proof_pack/signature.json": signature_bytes,
            **file_entries,
        }

        buffer = io.BytesIO()
        with zipfile.ZipFile(
            buffer,
            mode="w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=9,
        ) as zf:
            for path in sorted(entries.keys()):
                data = entries[path]
                is_dir = path.endswith("/")
                zip_info = zipfile.ZipInfo(path, date_time=_FIXED_ZIP_TIMESTAMP)
                zip_info.create_system = 0
                if is_dir:
                    zip_info.external_attr = 0o40755 << 16
                else:
                    zip_info.external_attr = 0o100644 << 16
                zf.writestr(zip_info, data)
        return buffer.getvalue()


#: Przestrzeń nazw identyfikatorów artefaktów pakietu dowodowego (stała).
_NAMESPACE_ARTEFAKTU_PAKIETU = UUID("4b1f6a2e-9c53-4a1d-8f7b-2d0c5a6e91d4")


def deterministic_artifact_id(context: ProofPackContext, rozroznik: str = "") -> UUID:
    """Identyfikator artefaktu WYPROWADZONY z tożsamości pakietu (nie losowy).

    DEFEKT, KTÓRY TO ZAMYKA (karta PACK-DOWODY). ``manifest.json`` każdego pakietu
    deklaruje wprost: „Pakiet jest deterministyczny dla identycznych wejść i
    toolchain" — a generatory pakietów, wołane bez jawnego ``artifact_id``,
    podstawiały ``uuid4()``. Ten sam przebieg pobrany dwa razy dawał więc RÓŻNE
    bajty (``proof.json`` → inny ``proof_fingerprint`` → inny ``pack_fingerprint``),
    czyli odcisk integralności nie nadawał się do porównania dwóch pobrań.
    Deklaracja bez strażnika: pin w ``tests/api/test_pakiet_dowodowy_biegu.py``
    (dwa pobrania bajt-w-bajt) i ``tests/api/test_proof_pack_api.py``.

    Tożsamość pakietu = projekt + przypadek + przebieg + wersja modelu. Ta sama
    czwórka ⇒ ten sam identyfikator; inny przebieg albo inna wersja modelu ⇒ inny.

    ``rozroznik`` (karta PACK-BEZ-KONSUMENTA) oddziela DOKUMENTY składane z tego
    samego przebiegu. Pakiet zbiorczy rozpływu niesie trzy dowody (rozpływ, straty,
    spadek napięcia na odcinku) — bez rozróżnika wszystkie trzy dostałyby ten sam
    identyfikator artefaktu, czyli pakiet twierdziłby, że to jeden i ten sam dowód.
    Pusty rozróżnik daje ziarno IDENTYCZNE jak przed dodaniem parametru, więc
    odciski pakietów wydanych dotąd są nietknięte (pin: dwa pobrania bajt-w-bajt).
    """
    czlony = [
        context.project_id,
        context.case_id,
        context.run_id,
        context.snapshot_id,
    ]
    if rozroznik:
        czlony.append(rozroznik)
    return uuid5(_NAMESPACE_ARTEFAKTU_PAKIETU, "|".join(czlony))


def dokument_deterministyczny(
    proof_doc: ProofDocument,
    context: ProofPackContext,
    znacznik_czasu: datetime,
    rozroznik: str = "",
) -> ProofDocument:
    """Dokument dowodowy o TOŻSAMOŚCI wyprowadzonej z pakietu, nie z zegara i losu.

    Ta sama klasa defektu co ``deterministic_artifact_id``, drugi jego koniec:
    ``ProofDocument`` generatorów niesie ``document_id = uuid4()`` i
    ``created_at = datetime.now()``. Oba pola trafiają do ``proof.json``, więc
    ``proof_fingerprint`` i ``pack_fingerprint`` w manifeście zmieniały się przy
    KAŻDYM pobraniu — odcisk integralności nie dawał się porównać między dwoma
    pobraniami tego samego przebiegu, choć manifest to deklaruje.

    ``znacznik_czasu`` = czas PRZEBIEGU (nie „teraz"): dowód dokumentuje obliczenie,
    które już się odbyło. Pin: pakiet pobrany dwa razy jest bajt-w-bajt identyczny.

    ``rozroznik`` jak w ``deterministic_artifact_id``: pusty ⇒ ziarno IDENTYCZNE
    jak przed dodaniem parametru; niepusty ⇒ osobna tożsamość dokumentu w pakiecie
    zbiorczym. Oba miejsca MUSZĄ dostawać ten sam rozróżnik — inaczej pakiet
    miałby dwa niezgodne identyfikatory tego samego dowodu.
    """
    czlony = [
        context.project_id,
        context.case_id,
        context.run_id,
        context.snapshot_id,
    ]
    if rozroznik:
        czlony.append(rozroznik)
    czlony.append("document")
    return replace(
        proof_doc,
        document_id=uuid5(_NAMESPACE_ARTEFAKTU_PAKIETU, "|".join(czlony)),
        created_at=znacznik_czasu,
    )


def zbuduj_zip_zbiorczy(pakiety: dict[str, bytes]) -> bytes:
    """Jeden ZIP zbiorczy z kilku pakietów dowodowych, deterministyczny.

    Kolejność wpisów i znacznik czasu stałe — ten sam zestaw daje bajt-w-bajt ten
    sam plik. Miejsce tej funkcji jest TU (warstwa pakietu), a nie w konkretnym
    generatorze: sięgają po nią pakiet zwarć niesymetrycznych (1F-Z / 2F / 2F-Z)
    ORAZ pakiet rozpływu (rozpływ / straty / spadek napięcia), a warstwie aplikacji
    nie wolno importować z warstwy API.
    """
    buffer = io.BytesIO()
    with zipfile.ZipFile(
        buffer,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as bundle:
        for nazwa in sorted(pakiety.keys()):
            path = f"pakiet_dowodowy/{nazwa}.zip"
            info = zipfile.ZipInfo(path, date_time=_FIXED_ZIP_TIMESTAMP)
            info.create_system = 0
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, pakiety[nazwa])
    return buffer.getvalue()


def resolve_mv_design_pro_version() -> str | None:
    try:
        import tomllib
    except ModuleNotFoundError:
        return None

    for parent in Path(__file__).resolve().parents:
        candidate = parent / "pyproject.toml"
        if not candidate.exists():
            continue
        try:
            data = tomllib.loads(candidate.read_text(encoding="utf-8"))
        except OSError:
            continue
        version = data.get("tool", {}).get("poetry", {}).get("version")
        if version:
            return str(version)
    return None


def proof_pack_proof_type(proof_type: ProofType) -> str:
    if proof_type == ProofType.SC3F_IEC60909:
        return ProofType.SC3F_IEC60909.value
    if proof_type == ProofType.VDROP:
        return ProofType.VDROP.value
    if proof_type == ProofType.Q_U_REGULATION:
        return "QU_REGULATION"
    if proof_type == ProofType.EQUIPMENT_PROOF:
        # Rodzaj dowodu trafia do `manifest.json` pobieranego pakietu, czyli do
        # artefaktu eksportu — obowiązuje go zakaz nazw roboczych projektu
        # (CLAUDE.md reguła 8). Wcześniej stało tu oznaczenie robocze karty.
        return ProofType.EQUIPMENT_PROOF.value
    if proof_type in {
        ProofType.SC1F_IEC60909,
        ProofType.SC2F_IEC60909,
        ProofType.SC2FG_IEC60909,
    }:
        return "SC1_ASYM"
    return proof_type.value


def _format_datetime_utc(value: datetime | None) -> str:
    if value is None:
        return "1970-01-01T00:00:00Z"
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    else:
        value = value.astimezone(UTC)
    return value.isoformat().replace("+00:00", "Z")


def _normalize_newlines(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def _sha256_hex(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _pack_fingerprint(files: list[dict[str, object]]) -> str:
    hashes: list[str] = []
    for file_entry in files:
        sha256_value = file_entry["sha256"]
        # Zawsze str — pochodzi z _sha256_hex() przy budowie wpisu pliku (linie
        # 77/150). Asercja narrowing zamiast zgadywania typu; awaria oznaczałaby
        # regresję kontraktu wpisu manifestu, nie sytuację do cichego pominięcia.
        assert isinstance(sha256_value, str), "wpis manifestu: 'sha256' musi być str"
        hashes.append(sha256_value)
    concatenated_hashes = "".join(hashes)
    return hashlib.sha256(concatenated_hashes.encode("utf-8")).hexdigest()


def _python_version() -> str:
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
