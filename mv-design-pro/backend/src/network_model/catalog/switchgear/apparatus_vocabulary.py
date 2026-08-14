"""Słownik aparatów rodzin rozdzielnic + materializacja wyposażenia pola.

CZĘŚĆ 1 — SŁOWNIK. Jedno mapowanie kindów na
`SwitchgearFamily.allowed_apparatus_kinds` (Reference Engine V1, spec §7).

Dwa wejścia (dwie nomenklatury kindów w repo), jedno wyjście (słownik rodzin):

- `FAMILY_APPARATUS_FOR_ENM_KIND` — kindy `BayPrimaryDevice.kind` (ENM,
  dane użytkownika; konsument: `reference_engine/compliance.py`),
- `FAMILY_APPARATUS_FOR_TEMPLATE_KIND` — kindy `BayDeviceTemplate.kind`
  (szablony kreatora `bay_templates.py`; konsument: `canonical_fallback.py`
  przy budowie szablonów rodzin — kreator nie może wygenerować pola z
  aparatem spoza słownika rodziny, pkt 2/4 dyrektywy).

Udokumentowana aproksymacja: słownik rodzin nie rozróżnia odłącznika od
rozłącznika (jedno `switch_disconnector`). Transformator pola
(`TRANSFORMER_DEVICE`) leży POZA celką rozdzielnicy — brak wpisu = aparat
nie podlega słownikowi rodziny (nigdy nie jest odfiltrowany ani flagowany).

Ta aproksymacja jest teraz WYPROWADZONA, nie przepisana ręcznie (scalenie
kanonu 2026-08-14): źródłem jest drobnoziarniste
`APPARATUS_KIND_FOR_TEMPLATE_KIND` (kind szablonu -> kanoniczny `ApparatusKind`
aparatu), a słownik rodzin powstaje z niego przez jawne zgrubienie
`_ZGRUBIENIE_DO_SLOWNIKA_RODZINY` i odjęcie aparatów spoza celki. Dwie
utrzymywane ręcznie tablice o tej samej treści rozjechałyby się przy pierwszym
nowym rodzaju aparatu — dlatego jest jedna, a zgrubienie jest jawną projekcją.

CZĘŚĆ 2 — MATERIALIZACJA. `instancje_aparatow_z_szablonu` zamienia kanoniczną
listę aparatów `BayTemplate.devices` na listę `BayDeviceInstanceTemplate`
kompletnego szablonu pola (aparat + oznaczenie + strona elektryczna + status
FABRYCZNY/OPCJA). Dzięki temu wyposażenie pola ma JEDNO źródło (kanoniczny
szablon), a nie dwie równoległe listy w jednym obiekcie.
"""

from __future__ import annotations

from ..bay_templates import BayDeviceTemplate, BayTemplate
from .device_instance import (
    ApparatusKind,
    BayDeviceInstanceTemplate,
    ElectricalSide,
    StatusWyposazenia,
)

FAMILY_APPARATUS_FOR_ENM_KIND: dict[str, str] = {
    "CB": "circuit_breaker",
    "LOAD_SWITCH": "switch_disconnector",
    "DS": "switch_disconnector",
    "ES": "earthing_switch",
    "FUSE": "fuse_set",
    "CT": "current_transformer",
    "VT": "voltage_transformer",
    "CABLE_HEAD": "cable_head",
    "SURGE_ARRESTER": "surge_arrester",
}

#: Kanoniczna tożsamość aparatu dla KAŻDEGO rodzaju z `BayDeviceTemplate.kind`
#: (drobnoziarnista: odłącznik szynowy i liniowy to osobne aparaty).
APPARATUS_KIND_FOR_TEMPLATE_KIND: dict[str, ApparatusKind] = {
    "CB": "circuit_breaker",
    "DS_BUS": "disconnector_busbar",
    "DS_LINE": "disconnector_line",
    "ES": "earthing_switch",
    "CT": "current_transformer",
    "VT": "voltage_transformer",
    "FUSE": "fuse_set",
    "SURGE_ARRESTER": "surge_arrester",
    "CABLE_HEAD": "cable_head",
    "TRANSFORMER_DEVICE": "transformer",
}

#: Zgrubienie tożsamości aparatu do słownika rodziny (rodzina deklaruje
#: `switch_disconnector`, nie rozróżniając odłącznika szynowego od liniowego).
_ZGRUBIENIE_DO_SLOWNIKA_RODZINY: dict[ApparatusKind, str] = {
    "disconnector_busbar": "switch_disconnector",
    "disconnector_line": "switch_disconnector",
}

#: Aparaty leżące POZA celką rozdzielnicy — nie podlegają słownikowi rodziny.
APARATY_POZA_CELKA: frozenset[ApparatusKind] = frozenset({"transformer"})

FAMILY_APPARATUS_FOR_TEMPLATE_KIND: dict[str, str] = {
    kind: _ZGRUBIENIE_DO_SLOWNIKA_RODZINY.get(apparatus, apparatus)
    for kind, apparatus in APPARATUS_KIND_FOR_TEMPLATE_KIND.items()
    if apparatus not in APARATY_POZA_CELKA
}

#: Strona elektryczna aparatu wynikająca z jego umiejscowienia w torze pola.
#: Wyjątek ma pierwszeństwo i jest jawny: transformator pola stoi po stronie
#: transformatorowej niezależnie od tego, że w szablonie jest DOWNSTREAM.
_STRONA_DLA_UMIEJSCOWIENIA: dict[str, ElectricalSide] = {
    "UPSTREAM": "busbar_side",
    "MIDSTREAM": "line_side",
    "DOWNSTREAM": "line_side",
    "OFF_PATH": "metering_branch",
    "GROUND_BRANCH": "earthing_branch",
}


def status_wyposazenia_aparatu(device: BayDeviceTemplate) -> StatusWyposazenia:
    """Status wyposażenia aparatu szablonu — JEDYNE miejsce tego odwzorowania.

    Kanoniczny szablon pola niesie jeden predykat (`optional`); status
    katalogowy pola (FABRYCZNY / OPCJA) jest jego nazwaniem, a nie drugą,
    niezależną deklaracją.
    """
    return "OPCJA" if device.optional else "FABRYCZNY"


def strona_elektryczna_aparatu(device: BayDeviceTemplate) -> ElectricalSide:
    """Strona elektryczna aparatu (transformator pola ma pierwszeństwo)."""
    if APPARATUS_KIND_FOR_TEMPLATE_KIND[device.kind] == "transformer":
        return "transformer_side"
    return _STRONA_DLA_UMIEJSCOWIENIA[device.placement]


def instancje_aparatow_z_szablonu(
    base_template: BayTemplate, template_ref: str
) -> list[BayDeviceInstanceTemplate]:
    """Wyposażenie kompletnego szablonu pola zmaterializowane z kanonu.

    Wejściem jest szablon PO filtrze słownika rodziny (`_family_filtered_base`),
    więc lista instancji opisuje dokładnie te aparaty, które rodzina dopuszcza —
    bez drugiego, niezależnego zbioru do rozjechania.
    """
    return [
        BayDeviceInstanceTemplate(
            device_template_ref=f"{template_ref}__{device.kind}__{device.position:02d}",
            apparatus_kind=APPARATUS_KIND_FOR_TEMPLATE_KIND[device.kind],
            label=device.designation_q,
            position_in_bay=device.position + 1,
            electrical_side=strona_elektryczna_aparatu(device),
            status_wyposazenia=status_wyposazenia_aparatu(device),
        )
        for device in base_template.devices
    ]
