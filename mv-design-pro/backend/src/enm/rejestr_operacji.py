"""Rejestr operacji domenowych — JEDNA mapa nazwa kanoniczna → handler (karta AB-H0, P10).

PO CO. Operacje domenowe żyją w dwóch plikach: ``enm/domain_operations.py`` (rdzeń V1,
dyspozytor ``execute_domain_operation``) i ``enm/domain_operations_v2.py`` (ochrona,
przypadki, źródła nN, operacje uniwersalne). V2 importuje z V1 funkcje pomocnicze, a V1
importował V2 „z dołu pliku" (``from .domain_operations_v2 import ALL_V2_HANDLERS`` po
całej treści modułu), żeby scalić handlery. Skutek zmierzony: ``enm.domain_operations_v2``
nie dawał się zaimportować jako PIERWSZY moduł procesu (``ImportError: cannot import name
'ALL_V2_HANDLERS' from partially initialized module``), a testy obchodziły to kolejnością
importów z komentarzem „import PRZED".

ROZCIĘCIE. Ten moduł importuje OBA pliki operacji i składa rejestr; żaden z nich nie
importuje drugiego „z dołu". Dyspozytor czyta rejestr w chwili wywołania. Kierunek
zależności jest jeden: ``domain_operations_v2`` → ``domain_operations`` (pomocnicze),
``rejestr_operacji`` → oba. Przypięte testem ``tests/ci/test_kolejnosc_importow.py``
(każdy z trzech modułów importowany jako pierwszy w osobnym procesie).

Słowniki handlerów zostają literałami w plikach operacji (``_HANDLERS``,
``ALL_V2_HANDLERS``) — czyta je strażnik ``scripts/canonical_ops_guard.py`` (AST).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from types import MappingProxyType
from typing import Any

from enm.domain_operations import _HANDLERS, CANONICAL_OPS_V1
from enm.domain_operations_v2 import ALL_V2_HANDLERS, V2_CANONICAL_OPS

#: Handler operacji: (migawka ENM jako słownik, payload) → odpowiedź operacji.
HandlerOperacji = Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]


def _zloz_handlery() -> dict[str, HandlerOperacji]:
    kolizje = sorted(set(_HANDLERS) & set(ALL_V2_HANDLERS))
    if kolizje:
        raise RuntimeError(
            f"Operacje zarejestrowane w obu plikach operacji: {kolizje} — jedna nazwa "
            "kanoniczna ma dokładnie jeden handler."
        )
    return {**_HANDLERS, **ALL_V2_HANDLERS}


#: Pełny zbiór nazw operacji kanonicznych systemu.
OPERACJE_KANONICZNE: frozenset[str] = CANONICAL_OPS_V1 | V2_CANONICAL_OPS
#: Pełna mapa handlerów (tylko do odczytu).
HANDLERY: Mapping[str, HandlerOperacji] = MappingProxyType(_zloz_handlery())

__all__ = ["HANDLERY", "OPERACJE_KANONICZNE", "HandlerOperacji"]
