"""Odczyt katalogu zabezpieczeń (szablon nastaw / krzywa / typ urządzenia).

CV-3.3-B: wydzielone z (usuniętego) `ProtectionAnalysisService._get_template` /
`_get_curve` / `_get_device_type`, żeby bieg zabezpieczeń kanoniczny
(`enm.canonical_analysis._execute_protection`) i test tych trzech odczytów
mogły dzielić JEDNĄ implementację zamiast prywatnych metod martwej klasy.

Kolejność odczytu: biblioteka zabezpieczeń projektu w bazie (repozytorium
`uow.protection_catalog`, tabele `protection_*` zapisywane importem biblioteki)
→ domyślny katalog referencyjny (`get_default_mv_catalog`), gdy wpisu nie ma w bazie.

NAPRAWA UKRYTEGO DEFEKTU (karta #151). Do tej karty pierwsza gałąź budowała
`CatalogRepository(uow.session)` — niemutowalny kontener katalogu typów, którego
konstruktor wymaga kilku słowników, a nie sesji — więc KAŻDE wołanie kończyło się
`TypeError`, połykanym przez `except Exception: pass`. Skutek: bieg zabezpieczeń i
walidacja `protection-config` NIGDY nie widziały biblioteki zaimportowanej przez
projektanta, zawsze tylko katalog referencyjny. Odczyt idzie teraz przez żywe
repozytorium bazy; awaria bazy wybucha (bieg FAILED + 500), nie podmienia katalogu.
"""

from __future__ import annotations

from typing import Any

from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import (
    ProtectionCurve,
    ProtectionDeviceType,
    ProtectionSettingTemplate,
)


def _pola_rekordu(rekord: dict[str, Any]) -> dict[str, Any]:
    """Rekord biblioteki `{id, name_pl, params}` → słownik pól typu katalogowego."""
    return {**(rekord.get("params") or {}), "id": rekord["id"], "name_pl": rekord["name_pl"]}


def get_protection_template(uow: Any, template_ref: str | None) -> ProtectionSettingTemplate | None:
    """Szablon nastaw zabezpieczenia z katalogu."""
    if template_ref is None:
        return None
    rekord = uow.protection_catalog.get_protection_setting_template(template_ref)
    if rekord is not None:
        return ProtectionSettingTemplate.from_dict(_pola_rekordu(rekord))
    return get_default_mv_catalog().get_protection_setting_template(template_ref)


def get_protection_curve(uow: Any, curve_ref: str | None) -> ProtectionCurve | None:
    """Krzywa zabezpieczenia z katalogu."""
    if curve_ref is None:
        return None
    rekord = uow.protection_catalog.get_protection_curve(curve_ref)
    if rekord is not None:
        return ProtectionCurve.from_dict(_pola_rekordu(rekord))
    return get_default_mv_catalog().get_protection_curve(curve_ref)


def get_protection_device_type(
    uow: Any, device_type_ref: str | None
) -> ProtectionDeviceType | None:
    """Typ urządzenia zabezpieczającego z katalogu."""
    if device_type_ref is None:
        return None
    rekord = uow.protection_catalog.get_protection_device_type(device_type_ref)
    if rekord is not None:
        return ProtectionDeviceType.from_dict(_pola_rekordu(rekord))
    return get_default_mv_catalog().get_protection_device_type(device_type_ref)
