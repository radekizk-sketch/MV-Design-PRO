"""Słownik aparatów rodzin rozdzielnic — JEDNO mapowanie kindów na
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
"""

from __future__ import annotations

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

FAMILY_APPARATUS_FOR_TEMPLATE_KIND: dict[str, str] = {
    "CB": "circuit_breaker",
    "DS_BUS": "switch_disconnector",
    "DS_LINE": "switch_disconnector",
    "ES": "earthing_switch",
    "FUSE": "fuse_set",
    "CT": "current_transformer",
    "VT": "voltage_transformer",
    "CABLE_HEAD": "cable_head",
    "SURGE_ARRESTER": "surge_arrester",
}
