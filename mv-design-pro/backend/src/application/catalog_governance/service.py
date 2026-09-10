"""
Zarządzanie biblioteką zabezpieczeń (P14b): deterministyczny eksport z odciskiem oraz
import scal/zastąp z wykrywaniem konfliktów i walidacją odwołań szablonów.

W1 (mapa domknięcia §9): część „biblioteka typów” (P13b — eksport/import typów linii,
kabli, transformatorów i łączników przechowywanych w TABELACH bazy `line_types`/…) została
SKASOWANA razem z tymi tabelami: typy producenta żyją w katalogu statycznym
(`network_model/catalog`), a typy z danych inżyniera — w sekcji `katalog_projektu` modelu
(`enm/katalog_projektu.py`). Trzecia prawda katalogu w bazie nie ma już żadnego konsumenta
(0 wołań z frontendu, 0 elementów modelu wiązanych `type_ref` z bazy).

Biblioteka zabezpieczeń zostaje: jej rekordy (`{id, name_pl, params}`) czyta tor biegu
zabezpieczeń (`protection_analysis/catalog_lookup`) i `/api/catalog/protection/*`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from application.analyses.protection.catalog.catalog_store import (
    list_devices as list_analytical_protection_devices,
)
from network_model.catalog.governance import (
    ImportMode,
    ProtectionImportConflict,
    ProtectionImportReport,
    ProtectionLibraryExport,
    ProtectionLibraryManifest,
    compute_protection_fingerprint,
    sort_protection_types_deterministically,
)


def _serialize_analytical_protection_device_for_export(device: Any) -> dict[str, Any]:
    meta = dict(device.meta or {})
    notes: list[str] = []
    source_ref = meta.get("source_ref")
    if source_ref:
        notes.append(str(source_ref))
    if meta.get("unverified"):
        notes.append(
            "Rekord analityczny: dane urzadzenia nie sa jeszcze zweryfikowane produkcyjnie."
        )
    if meta.get("unverified_ranges"):
        notes.append("Zakresy nastaw pochodza z katalogu analitycznego i wymagaja weryfikacji.")
    verification_status = "NIEWERYFIKOWANY" if meta.get("unverified") else "CZESCIOWO_ZWERYFIKOWANY"

    return {
        "id": device.device_id,
        "name_pl": f"{device.vendor} {device.model}",
        "params": {
            "vendor": device.vendor,
            "model": device.model,
            "series": str(meta.get("series") or device.model),
            "revision": "v0",
            "rated_current_a": float(meta["rated"]) if meta.get("rated") is not None else None,
            "notes_pl": " ".join(notes) if notes else None,
            "source_catalog": "backend/src/application/analyses/protection/catalog/data/devices_v0.json",
            "unverified": bool(meta.get("unverified", False)),
            "unverified_ranges": bool(meta.get("unverified_ranges", False)),
            "source_reference": str(source_ref or "devices_v0.json / katalog analityczny ochrony"),
            "verification_status": verification_status,
            "catalog_status": "ANALITYCZNY_V1",
            "contract_version": "2.0",
            "verification_note": (
                "Zakres ochrony pochodzi z katalogu analitycznego; rekord nie jest promowany do katalogu produkcyjnego."
                if meta.get("unverified") or meta.get("unverified_ranges")
                else "Rekord analityczny zachowany poza torem produkcyjnym."
            ),
            "functions_supported": list(device.functions_supported),
            "curves_supported": list(device.curves_supported),
            "i_pickup_51_a_min": device.i_pickup_51_a_min,
            "i_pickup_51_a_max": device.i_pickup_51_a_max,
            "tms_51_min": device.tms_51_min,
            "tms_51_max": device.tms_51_max,
            "i_inst_50_a_min": device.i_inst_50_a_min,
            "i_inst_50_a_max": device.i_inst_50_a_max,
            "i_pickup_51n_a_min": device.i_pickup_51n_a_min,
            "i_pickup_51n_a_max": device.i_pickup_51n_a_max,
            "tms_51n_min": device.tms_51n_min,
            "tms_51n_max": device.tms_51n_max,
            "i_inst_50n_a_min": device.i_inst_50n_a_min,
            "i_inst_50n_a_max": device.i_inst_50n_a_max,
        },
    }


class CatalogGovernanceService:
    """Eksport/import biblioteki zabezpieczeń (P14b) na repozytorium `protection_catalog`."""

    def __init__(self, uow_factory: Any):
        self.uow_factory = uow_factory

    def export_protection_library(
        self,
        *,
        library_name_pl: str = "Biblioteka zabezpieczeń",
        vendor: str = "MV-DESIGN-PRO",
        series: str = "Standard",
        revision: str = "1.0",
        description_pl: str = "",
    ) -> dict[str, Any]:
        """
        Export protection library with deterministic fingerprint.

        Returns canonical JSON export with manifest and all protection types.
        Deterministic ordering: types sorted by (name_pl, id).

        Args:
            library_name_pl: Polish name of the library.
            vendor: Vendor/manufacturer name.
            series: Product series/line.
            revision: Revision string.
            description_pl: Optional Polish description.

        Returns:
            ProtectionLibraryExport dictionary.
        """
        with self.uow_factory() as uow:
            # Fetch all protection types (already deterministically sorted by repository)
            device_types_list = uow.protection_catalog.list_protection_device_types()
            curves_list = uow.protection_catalog.list_protection_curves()
            templates_list = uow.protection_catalog.list_protection_setting_templates()

            # Rekordy repozytorium mają już kształt eksportu ({id, name_pl, params}).
            device_types = list(device_types_list)
            curves = list(curves_list)
            templates = list(templates_list)
            if not device_types:
                device_types = [
                    _serialize_analytical_protection_device_for_export(device)
                    for device in list_analytical_protection_devices()
                ]

            # Sort types deterministically (name_pl → id)
            sorted_device_types = sort_protection_types_deterministically(device_types)
            sorted_curves = sort_protection_types_deterministically(curves)
            sorted_templates = sort_protection_types_deterministically(templates)

            # Create export structure (without fingerprint first)
            export = ProtectionLibraryExport(
                manifest=ProtectionLibraryManifest(
                    library_id=str(uuid4()),
                    name_pl=library_name_pl,
                    vendor=vendor,
                    series=series,
                    revision=revision,
                    schema_version="1.0",
                    created_at=datetime.utcnow().isoformat(),
                    fingerprint="",  # Will be computed below
                    description_pl=description_pl,
                ),
                device_types=sorted_device_types,
                curves=sorted_curves,
                templates=sorted_templates,
            )

            # Compute fingerprint
            fingerprint = compute_protection_fingerprint(export)

            # Rebuild manifest with fingerprint
            manifest_with_fingerprint = ProtectionLibraryManifest(
                library_id=export.manifest.library_id,
                name_pl=export.manifest.name_pl,
                vendor=export.manifest.vendor,
                series=export.manifest.series,
                revision=export.manifest.revision,
                schema_version=export.manifest.schema_version,
                created_at=export.manifest.created_at,
                fingerprint=fingerprint,
                description_pl=export.manifest.description_pl,
            )

            # Final export with fingerprint
            final_export = ProtectionLibraryExport(
                manifest=manifest_with_fingerprint,
                device_types=sorted_device_types,
                curves=sorted_curves,
                templates=sorted_templates,
            )

            return final_export.to_dict()

    def import_protection_library(
        self,
        data: dict[str, Any],
        mode: ImportMode = ImportMode.MERGE,
    ) -> dict[str, Any]:
        """
        Import protection library with conflict detection and reference validation.

        Modes:
        - MERGE (default): Add new types, skip existing (immutability check).
        - REPLACE: Replace entire library (blocked if types are in use).

        Conflict rules:
        - Existing type_id with different parameters → 409 Conflict.
        - REPLACE mode with types in use → 409 Conflict (blocked).
        - Template references non-existent device_type/curve → 422 Validation Error.

        Args:
            data: ProtectionLibraryExport dictionary.
            mode: Import mode (MERGE or REPLACE).

        Returns:
            ProtectionImportReport dictionary.

        Raises:
            ValueError: If import data is invalid or conflicts detected.
        """
        # Parse import data
        export = ProtectionLibraryExport.from_dict(data)
        report = ProtectionImportReport(mode=mode)

        # Build reference maps for validation
        imported_device_type_ids = {item["id"] for item in export.device_types}
        imported_curve_ids = {item["id"] for item in export.curves}

        # Validate template references
        validation_errors = []
        for template_data in export.templates:
            device_type_ref = template_data.get("device_type_ref")
            curve_ref = template_data.get("curve_ref")

            # Check device_type_ref (if present)
            if device_type_ref and device_type_ref not in imported_device_type_ids:
                validation_errors.append(
                    ProtectionImportConflict(
                        kind="template",
                        id=template_data["id"],
                        name_pl=template_data.get("name_pl", ""),
                        reason_code="device_type_ref_missing",
                    )
                )

            # Check curve_ref (if present)
            if curve_ref and curve_ref not in imported_curve_ids:
                validation_errors.append(
                    ProtectionImportConflict(
                        kind="template",
                        id=template_data["id"],
                        name_pl=template_data.get("name_pl", ""),
                        reason_code="curve_ref_missing",
                    )
                )

        # If validation errors, report and fail
        if validation_errors:
            report.conflicts.extend(validation_errors)
            report.success = False
            raise ValueError(
                f"Validation failed: {len(validation_errors)} template(s) have missing references. "
                "Import blocked."
            )

        with self.uow_factory() as uow:
            # Fetch existing protection types
            existing_device_types_list = uow.protection_catalog.list_protection_device_types()
            existing_curves_list = uow.protection_catalog.list_protection_curves()
            existing_templates_list = uow.protection_catalog.list_protection_setting_templates()

            existing_device_types = {item["id"]: item for item in existing_device_types_list}
            existing_curves = {item["id"]: item for item in existing_curves_list}
            existing_templates = {item["id"]: item for item in existing_templates_list}

            # REPLACE mode: check if any types are in use (NOT IMPLEMENTED - P14b is library only)
            # For now, REPLACE is allowed since protection library has no bindings yet
            if mode == ImportMode.REPLACE:
                # Future: check if protection instances reference these types
                # For P14b: no instances yet, so replace is safe
                pass

            # MERGE mode: add new types, check immutability
            if mode == ImportMode.MERGE:
                # Process device types
                for type_data in export.device_types:
                    type_id = type_data["id"]
                    if type_id in existing_device_types:
                        # Check immutability (same ID must have same data)
                        existing = existing_device_types[type_id]
                        if existing != type_data:
                            # Conflict: same ID, different data
                            report.conflicts.append(
                                ProtectionImportConflict(
                                    kind="device_type",
                                    id=type_id,
                                    name_pl=type_data.get("name_pl", ""),
                                    reason_code="exists_different",
                                )
                            )
                            report.success = False
                        else:
                            # Skip: identical data
                            report.skipped.append(
                                ProtectionImportConflict(
                                    kind="device_type",
                                    id=type_id,
                                    name_pl=type_data.get("name_pl", ""),
                                    reason_code="exists_identical",
                                )
                            )
                    else:
                        # Add new type
                        uow.protection_catalog.upsert_protection_device_type(
                            type_data, commit=False
                        )
                        report.added.append(
                            ProtectionImportConflict(
                                kind="device_type",
                                id=type_id,
                                name_pl=type_data.get("name_pl", ""),
                                reason_code="added",
                            )
                        )

                # Process curves
                for type_data in export.curves:
                    type_id = type_data["id"]
                    if type_id in existing_curves:
                        existing = existing_curves[type_id]
                        if existing != type_data:
                            report.conflicts.append(
                                ProtectionImportConflict(
                                    kind="curve",
                                    id=type_id,
                                    name_pl=type_data.get("name_pl", ""),
                                    reason_code="exists_different",
                                )
                            )
                            report.success = False
                        else:
                            report.skipped.append(
                                ProtectionImportConflict(
                                    kind="curve",
                                    id=type_id,
                                    name_pl=type_data.get("name_pl", ""),
                                    reason_code="exists_identical",
                                )
                            )
                    else:
                        uow.protection_catalog.upsert_protection_curve(type_data, commit=False)
                        report.added.append(
                            ProtectionImportConflict(
                                kind="curve",
                                id=type_id,
                                name_pl=type_data.get("name_pl", ""),
                                reason_code="added",
                            )
                        )

                # Process templates
                for type_data in export.templates:
                    type_id = type_data["id"]
                    if type_id in existing_templates:
                        existing = existing_templates[type_id]
                        if existing != type_data:
                            report.conflicts.append(
                                ProtectionImportConflict(
                                    kind="template",
                                    id=type_id,
                                    name_pl=type_data.get("name_pl", ""),
                                    reason_code="exists_different",
                                )
                            )
                            report.success = False
                        else:
                            report.skipped.append(
                                ProtectionImportConflict(
                                    kind="template",
                                    id=type_id,
                                    name_pl=type_data.get("name_pl", ""),
                                    reason_code="exists_identical",
                                )
                            )
                    else:
                        uow.protection_catalog.upsert_protection_setting_template(
                            type_data, commit=False
                        )
                        report.added.append(
                            ProtectionImportConflict(
                                kind="template",
                                id=type_id,
                                name_pl=type_data.get("name_pl", ""),
                                reason_code="added",
                            )
                        )

            # REPLACE mode: clear and insert all
            elif mode == ImportMode.REPLACE:
                # Check if safe to replace (no items in use)
                # For P14b: no usage tracking yet, so REPLACE is always allowed
                # Future: add usage check here

                # Clear existing types
                uow.protection_catalog.clear_all_protection_types(commit=False)

                # Insert all imported types
                for type_data in export.device_types:
                    uow.protection_catalog.upsert_protection_device_type(type_data, commit=False)
                    report.added.append(
                        ProtectionImportConflict(
                            kind="device_type",
                            id=type_data["id"],
                            name_pl=type_data.get("name_pl", ""),
                            reason_code="replaced",
                        )
                    )

                for type_data in export.curves:
                    uow.protection_catalog.upsert_protection_curve(type_data, commit=False)
                    report.added.append(
                        ProtectionImportConflict(
                            kind="curve",
                            id=type_data["id"],
                            name_pl=type_data.get("name_pl", ""),
                            reason_code="replaced",
                        )
                    )

                for type_data in export.templates:
                    uow.protection_catalog.upsert_protection_setting_template(
                        type_data, commit=False
                    )
                    report.added.append(
                        ProtectionImportConflict(
                            kind="template",
                            id=type_data["id"],
                            name_pl=type_data.get("name_pl", ""),
                            reason_code="replaced",
                        )
                    )

            # Raise if conflicts
            if not report.success:
                uow.rollback()
                raise ValueError(
                    f"Import failed: {len(report.conflicts)} conflict(s) detected. "
                    "See report for details."
                )

            uow.commit()

        return report.to_dict()
