"""Minimalny model ENM ZGODNY z kontraktem — fikstura testów operacji domenowych.

Karta #151: operacja domenowa oddaje wynik zgodny z kontraktem ENM (`_response` w
`enm/domain_operations.py`), a migawka, która go łamie, jest odmową nazwaną. Fikstury
składane ręcznie jako słownik bez nagłówka, bez rodzaju stacji albo z identyfikatorem
spoza UUID przechodziły dotąd wyłącznie dzięki połkniętemu `ValidationError` w
wyliczaniu gotowości — były modelami, których system nie może zawierać. Ta funkcja
składa z tych samych kolekcji model poprawny: nagłówek z ustawieniami domyślnymi i
identyfikatory elementów wyprowadzone deterministycznie z `ref_id` (UUID5 — dwa wywołania
dają ten sam model co do bajtu).
"""

from __future__ import annotations

import copy
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from enm.models import EnergyNetworkModel


def _uzupelnij_identyfikatory(wartosc: Any) -> None:
    if isinstance(wartosc, dict):
        if isinstance(wartosc.get("ref_id"), str) and "id" not in wartosc:
            wartosc["id"] = str(uuid5(NAMESPACE_URL, f"enm:{wartosc['ref_id']}"))
        for pole in wartosc.values():
            _uzupelnij_identyfikatory(pole)
    elif isinstance(wartosc, list):
        for element in wartosc:
            _uzupelnij_identyfikatory(element)


def model_minimalny(nazwa: str = "Model testowy", **kolekcje: Any) -> dict[str, Any]:
    """Migawka JSON modelu z podanymi kolekcjami (walidowana kontraktem ENM)."""
    dane = copy.deepcopy(kolekcje)
    _uzupelnij_identyfikatory(dane)
    return EnergyNetworkModel.model_validate(
        {"header": {"name": nazwa, "defaults": {"sn_nominal_kv": 15.0}}, **dane}
    ).model_dump(mode="json")
