"""Kanoniczny rejestr kodow gotowosci jako JEDNO zrodlo tresci dla prezentacji.

Karta F-K6 (V12K-206), znalezisko Z8 audytu FLOW. Rejestr `READINESS_CODES` byl
kanoniczny dokumentacyjnie, ale nie mial ZADNEJ drogi do uzytkownika: komunikaty PL i
akcje naprawcze byly kopiowane komentarzem do kolejnych analiz, a front trzymal wlasne
tablice kodow, ktorych backend nie zna.

Ta koncowka wystawia kanon RAZ, razem z:
  * odwzorowaniem kodow walidatora ENM na kanon (jawne pary o tym samym warunku),
  * lista kodow walidatora BEZ odpowiednika (z powodem),
  * rezerwacjami kodow kanonu bez emitera (z powodem).

Luki nie sa ukryte — sa czescia odpowiedzi, bo tylko wtedy da sie je zamykac.
"""

from __future__ import annotations

from typing import Any

from domain.readiness_bridge import widok_rejestru
from fastapi import APIRouter

router = APIRouter(tags=["readiness-registry"])


@router.get("/api/readiness/registry")
def get_readiness_registry() -> dict[str, Any]:
    """Kanoniczny rejestr kodow gotowosci + odwzorowanie + jawne luki."""
    return widok_rejestru()
