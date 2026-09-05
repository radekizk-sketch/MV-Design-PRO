"""Odczyt katalogu zabezpieczeń (szablon nastaw / krzywa / typ urządzenia).

CV-3.3-B: wydzielone z (usuniętego) `ProtectionAnalysisService._get_template` /
`_get_curve` / `_get_device_type`, żeby bieg zabezpieczeń kanoniczny
(`enm.canonical_analysis._execute_protection`) i test tych trzech odczytów
mogły dzielić JEDNĄ implementację zamiast prywatnych metod martwej klasy.

Kolejność odczytu (bez zmiany wobec poprzedniego serwisu): repozytorium
katalogu przypięte do bieżącej sesji (`uow.session`) → domyślny katalog
referencyjny (`get_default_mv_catalog`), gdy sesja niedostępna albo wpis
nie istnieje w bazie.
"""

from __future__ import annotations

from typing import Any

from network_model.catalog.types import (
    ProtectionCurve,
    ProtectionDeviceType,
    ProtectionSettingTemplate,
)


def get_protection_template(uow: Any, template_ref: str | None) -> ProtectionSettingTemplate | None:
    """Szablon nastaw zabezpieczenia z katalogu."""
    if template_ref is None:
        return None
    try:
        from network_model.catalog import CatalogRepository

        catalog = CatalogRepository(uow.session)
        template = catalog.get_protection_setting_template(template_ref)
        if template is not None:
            return template
    except Exception:
        pass

    from network_model.catalog.repository import get_default_mv_catalog

    return get_default_mv_catalog().get_protection_setting_template(template_ref)


def get_protection_curve(uow: Any, curve_ref: str | None) -> ProtectionCurve | None:
    """Krzywa zabezpieczenia z katalogu."""
    if curve_ref is None:
        return None
    try:
        from network_model.catalog import CatalogRepository

        catalog = CatalogRepository(uow.session)
        curve = catalog.get_protection_curve(curve_ref)
        if curve is not None:
            return curve
    except Exception:
        pass

    from network_model.catalog.repository import get_default_mv_catalog

    return get_default_mv_catalog().get_protection_curve(curve_ref)


def get_protection_device_type(
    uow: Any, device_type_ref: str | None
) -> ProtectionDeviceType | None:
    """Typ urządzenia zabezpieczającego z katalogu."""
    if device_type_ref is None:
        return None
    try:
        from network_model.catalog import CatalogRepository

        catalog = CatalogRepository(uow.session)
        device_type = catalog.get_protection_device_type(device_type_ref)
        if device_type is not None:
            return device_type
    except Exception:
        pass

    from network_model.catalog.repository import get_default_mv_catalog

    return get_default_mv_catalog().get_protection_device_type(device_type_ref)
