"""Predykat nazwy — JEDYNA odpowiedź na pytanie „czy ta wartość jest nazwą" (karta
NAZWY-JEDNO-ZRODLO).

Nazwa to napis niepusty po obcięciu spacji — bez oceny kształtu: „T_1", „QF-03_zrodlo" czy
„RGN-2" wpisane przez projektanta są jego nazwami. Brak pola, `None`, wartość nie-napis, pusty
napis i same spacje to wszędzie ten sam brak nazwy (reguła predykatów parami).

GDZIE ŻYJE I DLACZEGO TU. Funkcje nazw elementów, indeks nazw i nazwy pozycji katalogu są
w `enm/nazwy_elementow.py` (funkcje zależne od kolekcji modelu). Predykat importuje się
WYŁĄCZNIE stąd (`from network_model.nazwy import …`) — jedna ścieżka importu, bez
re-eksportu. Predykat mieszka w liściu `network_model/`, bo pytają o niego także moduły
`network_model/**` (walidacja grafu IR `core/branch.py`, `core/station.py`, `core/switch.py`;
szablon pola katalogowego, pamięć certyfikatów i rejestr niezmienników katalogu; raporty
zabezpieczeń; wywód badań OLTC), a import czegokolwiek z pakietu `enm` uruchamia
`enm/__init__.py` → `enm/mapping.py` → `network_model.core`: z `network_model.core.branch`
kończy się to `ImportError` (cykl zmierzony przy karcie). Ten sam powód i ten sam wzorzec co
liść `network_model/pochodne/` (CLAUDE.md, Core Rule 1, addendum CV-4.3 K4).

Moduł importuje wyłącznie bibliotekę standardową (liść grafu importów). Jedność predykatu
przypina test AST `tests/enm/test_nazwy_jedno_zrodlo.py` (zapadka na całym `src/**`).
"""

from __future__ import annotations


def jest_nazwa(wartosc: object) -> bool:
    """Czy wartość jest nazwą: napis niepusty po obcięciu spacji (kształt bez znaczenia)."""
    return isinstance(wartosc, str) and bool(wartosc.strip())


def nazwa_nadana(wartosc: object) -> str | None:
    """Nazwa po obcięciu spacji albo `None`, gdy `jest_nazwa(wartosc)` jest fałszem.

    Postać do wyrażeń z zapasem: `nazwa_nadana(payload.get("name")) or "Kabel nN"` — zapas
    liczy się leniwie i tylko wtedy, gdy nazwy naprawdę brak.
    """
    return wartosc.strip() if isinstance(wartosc, str) and jest_nazwa(wartosc) else None
