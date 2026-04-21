"""Deterministic DOCX normalization for binary-identical exports.

This module provides utilities to normalize DOCX files so that identical
input data always produces byte-identical output files (same SHA256).

DOCX files are ZIP archives containing XML files. Non-determinism comes from:
1. ZIP file entry timestamps (modification times)
2. ZIP file entry ordering (filesystem-dependent)
3. Document core properties (created/modified timestamps in docProps/core.xml)

This module addresses all three sources of non-determinism.
"""

from __future__ import annotations

import io
import os
import tempfile
import xml.etree.ElementTree as ElementTree
import zipfile
from pathlib import Path

# Fixed timestamp for ZIP entries (minimum allowed: 1980-01-01 00:00:00)
_FIXED_ZIP_DATETIME: tuple[int, int, int, int, int, int] = (1980, 1, 1, 0, 0, 0)

# Fixed timestamp for XML metadata (ISO 8601 format)
_FIXED_XML_TIMESTAMP: str = "2000-01-01T00:00:00Z"

# Fixed revision number
_FIXED_REVISION: str = "1"

# Namespaces used in docProps/core.xml
_NAMESPACES: dict[str, str] = {
    "cp": "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
    "dc": "http://purl.org/dc/elements/1.1/",
    "dcterms": "http://purl.org/dc/terms/",
    "dcmitype": "http://purl.org/dc/dcmitype/",
    "xsi": "http://www.w3.org/2001/XMLSchema-instance",
}


def _normalize_core_xml(xml_bytes: bytes) -> bytes:
    """Normalize docProps/core.xml to have fixed timestamps and revision.

    Args:
        xml_bytes: Original core.xml content as bytes.

    Returns:
        Normalized core.xml content as bytes with fixed timestamps.
    """
    # Register namespaces to preserve prefixes during serialization
    for prefix, uri in _NAMESPACES.items():
        ElementTree.register_namespace(prefix, uri)

    root = ElementTree.fromstring(xml_bytes)

    # Find and fix dcterms:created
    created = root.find("dcterms:created", _NAMESPACES)
    if created is not None:
        created.text = _FIXED_XML_TIMESTAMP

    # Find and fix dcterms:modified
    modified = root.find("dcterms:modified", _NAMESPACES)
    if modified is not None:
        modified.text = _FIXED_XML_TIMESTAMP

    # Find and fix cp:revision
    revision = root.find("cp:revision", _NAMESPACES)
    if revision is not None:
        revision.text = _FIXED_REVISION

    # Serialize back to bytes with deterministic formatting
    # Use xml_declaration=True and encoding="UTF-8" for consistency
    return ElementTree.tostring(
        root,
        encoding="UTF-8",
        xml_declaration=True,
    )


def make_docx_deterministic(path: Path | str) -> None:
    """Normalize a DOCX file for binary determinism.

    This function rewrites the DOCX (ZIP) archive with:
    - Fixed timestamps on all ZIP entries (1980-01-01 00:00:00)
    - Lexicographically sorted file entries
    - Normalized docProps/core.xml with fixed creation/modification timestamps

    The file is modified in-place atomically (write to temp, then rename).

    Args:
        path: Path to the DOCX file to normalize.

    Raises:
        FileNotFoundError: If the file does not exist.
        zipfile.BadZipFile: If the file is not a valid ZIP archive.
    """
    path = Path(path)

    if not path.exists():
        raise FileNotFoundError(f"DOCX file not found: {path}")

    # Read all entries from the original ZIP
    entries: dict[str, tuple[bytes, zipfile.ZipInfo]] = {}

    with zipfile.ZipFile(path, "r") as zf:
        for info in zf.infolist():
            content = zf.read(info.filename)
            entries[info.filename] = (content, info)

    # Normalize docProps/core.xml if present
    core_xml_path = "docProps/core.xml"
    if core_xml_path in entries:
        original_content, original_info = entries[core_xml_path]
        normalized_content = _normalize_core_xml(original_content)
        entries[core_xml_path] = (normalized_content, original_info)

    # Create a temporary file in the same directory for atomic replace
    tmp_fd, tmp_path = tempfile.mkstemp(
        suffix=".docx.tmp",
        dir=path.parent,
    )
    os.close(tmp_fd)
    tmp_path = Path(tmp_path)

    try:
        # Write normalized ZIP with sorted entries and fixed timestamps
        with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf_out:
            # Sort entries lexicographically by name for deterministic ordering
            for name in sorted(entries.keys()):
                content, original_info = entries[name]

                # Create new ZipInfo with fixed timestamp
                new_info = zipfile.ZipInfo(
                    filename=name,
                    date_time=_FIXED_ZIP_DATETIME,
                )

                # Preserve compression type
                new_info.compress_type = zipfile.ZIP_DEFLATED

                # Preserve external attributes (file permissions) if available
                if original_info.external_attr:
                    new_info.external_attr = original_info.external_attr

                zf_out.writestr(new_info, content)

        # Atomic replace: rename temp file to original path
        tmp_path.replace(path)

    except Exception:
        # Clean up temp file on error
        if tmp_path.exists():
            tmp_path.unlink()
        raise


def make_docx_bytes_deterministic(docx_bytes: bytes) -> bytes:
    """Normalize DOCX bytes for binary determinism.

    This function is the in-memory version of make_docx_deterministic.
    It takes DOCX content as bytes and returns normalized bytes.

    Args:
        docx_bytes: Original DOCX content as bytes.

    Returns:
        Normalized DOCX content as bytes with:
        - Fixed timestamps on all ZIP entries
        - Lexicographically sorted file entries
        - Normalized docProps/core.xml with fixed timestamps

    Raises:
        zipfile.BadZipFile: If the bytes are not a valid ZIP archive.
    """
    # Read all entries from the original ZIP
    entries: dict[str, tuple[bytes, zipfile.ZipInfo]] = {}

    with zipfile.ZipFile(io.BytesIO(docx_bytes), "r") as zf:
        for info in zf.infolist():
            content = zf.read(info.filename)
            entries[info.filename] = (content, info)

    # Normalize docProps/core.xml if present
    core_xml_path = "docProps/core.xml"
    if core_xml_path in entries:
        original_content, original_info = entries[core_xml_path]
        normalized_content = _normalize_core_xml(original_content)
        entries[core_xml_path] = (normalized_content, original_info)

    # Write normalized ZIP to BytesIO
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zf_out:
        # Sort entries lexicographically by name for deterministic ordering
        for name in sorted(entries.keys()):
            content, original_info = entries[name]

            # Create new ZipInfo with fixed timestamp
            new_info = zipfile.ZipInfo(
                filename=name,
                date_time=_FIXED_ZIP_DATETIME,
            )

            # Preserve compression type
            new_info.compress_type = zipfile.ZIP_DEFLATED

            # Preserve external attributes (file permissions) if available
            if original_info.external_attr:
                new_info.external_attr = original_info.external_attr

            zf_out.writestr(new_info, content)

    return output.getvalue()
