"""Nazwana odmowa „zasobu o tym identyfikatorze nie ma" (karta #151).

PO CO. Globalny handler API tłumaczył KAŻDY `KeyError` na 404 „Nie znaleziono
zasobu" — także `KeyError` z odczytu słownika w kodzie (błąd programu), który
projektant widział jako „nie ma takiego elementu", a dziennik jako ostrzeżenie bez
śladu. Odtąd 404 daje WYŁĄCZNIE ten wyjątek, podnoszony jawnie tam, gdzie wyszukanie
po identyfikatorze nie znalazło pozycji (katalogi, rejestry, bieg). Zwykły `KeyError`
jest błędem programu: 500 i pełny ślad w dzienniku (`api/exception_handlers.py`).

Podklasa `KeyError`, bo wołający, którzy jawnie obsługują brak pozycji
(`except KeyError` przy konkretnym wyszukaniu), obsługują go dalej bez zmian.

Moduł jest LIŚCIEM (wyłącznie stdlib) — jak `network_model/ir_fields.py` — żeby
katalogi, rejestry i warstwa aplikacji mogły go importować bez cyklu.
"""

from __future__ import annotations

__all__ = ["BrakZasobuError"]


class BrakZasobuError(KeyError):
    """Pozycji o wskazanym identyfikatorze nie ma — API odpowiada 404."""
