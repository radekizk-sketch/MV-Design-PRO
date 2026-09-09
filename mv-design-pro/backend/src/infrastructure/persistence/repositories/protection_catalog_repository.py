"""Repozytorium biblioteki zabezpieczeń w bazie (typy urządzeń, krzywe, szablony nastaw).

W1 (mapa domknięcia §9): wydzielone z kasowanego `NetworkWizardRepository` — repozytorium
kreatora legacy na tabelach `network_*` — jako JEDYNA jego część z żywymi konsumentami:
`api/catalog.py` (`/api/catalog/protection/*`), `application/catalog_governance`
(import/eksport biblioteki zabezpieczeń) i `application/protection_analysis/catalog_lookup`
(bieg zabezpieczeń czyta szablon/krzywą/typ urządzenia przez `CatalogRepository`).

Tabele: `protection_device_types`, `protection_curves`, `protection_setting_templates`
(P14a). Tor biegu jest tylko do odczytu; zapis wyłącznie przez import biblioteki
(`import_protection_library`). Rekord ma kształt `{id, name_pl, params}` — ten sam, który
niesie eksport biblioteki, więc import porównuje rekordy bez tłumaczenia pól.
"""

from __future__ import annotations

from typing import Any

from infrastructure.persistence.models import (
    ProtectionCurveORM,
    ProtectionDeviceTypeORM,
    ProtectionSettingTemplateORM,
)
from sqlalchemy import select
from sqlalchemy.orm import Session


def _rekord(row: Any) -> dict[str, Any]:
    return {"id": row.id, "name_pl": row.name_pl, "params": row.params_jsonb}


class ProtectionCatalogRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    # -- odczyt -----------------------------------------------------------

    def list_protection_device_types(self) -> list[dict[str, Any]]:
        stmt = select(ProtectionDeviceTypeORM).order_by(
            ProtectionDeviceTypeORM.name_pl, ProtectionDeviceTypeORM.id
        )
        return [_rekord(row) for row in self._session.execute(stmt).scalars().all()]

    def list_protection_curves(self) -> list[dict[str, Any]]:
        stmt = select(ProtectionCurveORM).order_by(
            ProtectionCurveORM.name_pl, ProtectionCurveORM.id
        )
        return [_rekord(row) for row in self._session.execute(stmt).scalars().all()]

    def list_protection_setting_templates(self) -> list[dict[str, Any]]:
        stmt = select(ProtectionSettingTemplateORM).order_by(
            ProtectionSettingTemplateORM.name_pl, ProtectionSettingTemplateORM.id
        )
        return [_rekord(row) for row in self._session.execute(stmt).scalars().all()]

    def get_protection_device_type(self, type_id: str) -> dict[str, Any] | None:
        stmt = select(ProtectionDeviceTypeORM).where(ProtectionDeviceTypeORM.id == type_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        return None if row is None else _rekord(row)

    def get_protection_curve(self, curve_id: str) -> dict[str, Any] | None:
        stmt = select(ProtectionCurveORM).where(ProtectionCurveORM.id == curve_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        return None if row is None else _rekord(row)

    def get_protection_setting_template(self, template_id: str) -> dict[str, Any] | None:
        stmt = select(ProtectionSettingTemplateORM).where(
            ProtectionSettingTemplateORM.id == template_id
        )
        row = self._session.execute(stmt).scalar_one_or_none()
        return None if row is None else _rekord(row)

    # -- zapis (wyłącznie import biblioteki) --------------------------------

    def upsert_protection_device_type(
        self, payload: dict[str, Any], *, commit: bool = True
    ) -> None:
        self._upsert(ProtectionDeviceTypeORM, payload, commit=commit)

    def upsert_protection_curve(self, payload: dict[str, Any], *, commit: bool = True) -> None:
        self._upsert(ProtectionCurveORM, payload, commit=commit)

    def upsert_protection_setting_template(
        self, payload: dict[str, Any], *, commit: bool = True
    ) -> None:
        self._upsert(ProtectionSettingTemplateORM, payload, commit=commit)

    def clear_all_protection_types(self, *, commit: bool = True) -> None:
        self._session.query(ProtectionSettingTemplateORM).delete()
        self._session.query(ProtectionCurveORM).delete()
        self._session.query(ProtectionDeviceTypeORM).delete()
        if commit:
            self._session.commit()

    def _upsert(self, orm: type[Any], payload: dict[str, Any], *, commit: bool) -> None:
        stmt = select(orm).where(orm.id == payload["id"])
        row = self._session.execute(stmt).scalar_one_or_none()
        if row is None:
            self._session.add(
                orm(id=payload["id"], name_pl=payload["name_pl"], params_jsonb=payload["params"])
            )
        else:
            row.name_pl = payload["name_pl"]
            row.params_jsonb = payload["params"]
        if commit:
            self._session.commit()
