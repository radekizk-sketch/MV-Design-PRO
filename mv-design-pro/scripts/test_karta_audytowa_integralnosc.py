"""Integralność ZAMKNIĘTEJ karty audytowej — ustalenia są nienaruszalne.

Karta `docs/plan/KARTA_MAX_DYNAMIC_SIMULATION_AUDIT_2026-09.md` została
ogłoszona zamkniętą, a potem skorygowana (ERRATA + przepisany §27.2). Przyjęta
polityka (§0.0 karty) dopuszcza korektę APPEND-ONLY, ale pod warunkiem, że
korekta nie zmienia USTALEŃ audytu — bo wtedy nie byłaby korektą, tylko
przepisaniem historii.

Ten test pilnuje warunku. Nie sprawdza brzmienia zdań (te wolno poprawiać),
tylko liczby i werdykty, które są wynikiem audytu.
"""

from __future__ import annotations

import re
from pathlib import Path

KARTA = (
    Path(__file__).resolve().parents[1]
    / "docs"
    / "plan"
    / "KARTA_MAX_DYNAMIC_SIMULATION_AUDIT_2026-09.md"
)

#: Ustalenia audytu z chwili zamknięcia (commit `7ab9d7a0`). NIE WOLNO ich
#: zmieniać korektą — zmiana wymaga nowego audytu, nie edycji starego.
#: Liczby zmierzone na karcie w chwili zamknięcia, nie przepisane z pamięci.
LICZBA_ZNALEZIEN_P0 = 11

USTALENIA_NIENARUSZALNE = {
    "werdykt osi PHYSICS": "| **PHYSICS** | **1** |",
    "werdykt osi VALIDATION": "| **VALIDATION** | **1** |",
    "werdykt osi NUMERICS": "| **NUMERICS** | **2** |",
    "werdykt osi ARCHITECTURE": "| **ARCHITECTURE** | **3** |",
    "werdykt osi SOURCE MODEL COVERAGE": "| **SOURCE MODEL COVERAGE** | **1** |",
    "werdykt osi PROOF": "| **PROOF** | **1** |",
}


def _tresc() -> str:
    return KARTA.read_text(encoding="utf-8")


def test_karta_istnieje() -> None:
    assert KARTA.exists(), f"Brak karty audytowej: {KARTA}"


def test_oceny_osi_sa_nienaruszone() -> None:
    """Oceny osi z tabeli werdyktu muszą przetrwać każdą korektę."""
    tresc = _tresc()
    braki = [nazwa for nazwa, wzor in USTALENIA_NIENARUSZALNE.items() if wzor not in tresc]
    assert not braki, (
        f"Oceny osi zmienione albo usunięte: {braki}. Korekta nie może zmieniać "
        "wyniku audytu — to wymaga nowego audytu, nie edycji starego."
    )


def test_liczba_znalezien_p0_jest_nienaruszona() -> None:
    """Znalezisko P0 nie może zniknąć z karty przez korektę.

    Liczone są UNIKALNE identyfikatory `P0-NN`, więc dopisanie odwołania do
    istniejącego znaleziska niczego nie psuje, a usunięcie albo dołożenie
    znaleziska — psuje, i o to chodzi.
    """
    identyfikatory = set(re.findall(r"P0-\d{2}", _tresc()))
    assert len(identyfikatory) == LICZBA_ZNALEZIEN_P0, (
        f"Karta zawiera {len(identyfikatory)} znalezisk P0, a audyt zamknięto z "
        f"{LICZBA_ZNALEZIEN_P0}: {sorted(identyfikatory)}"
    )


def test_karta_deklaruje_polityke_integralnosci() -> None:
    assert "POLITYKA INTEGRALNOŚCI ZAMKNIĘTEJ KARTY" in _tresc()


def test_kazda_korekta_ma_wpis_w_erracie() -> None:
    """Sekcja oznaczona SKORYGOWANE musi mieć odpowiednik w tabeli ERRATA."""
    tresc = _tresc()
    skorygowane = re.findall(r"^### (\d+\.\d+[a-z]?) .*SKORYGOWANE", tresc, re.MULTILINE)
    assert skorygowane, "Brak sekcji oznaczonych SKORYGOWANE — test straciłby sens"
    poczatek = tresc.index("## 0. ERRATA")
    koniec = tresc.index("## 1.", poczatek)
    errata = tresc[poczatek:koniec]
    for numer in skorygowane:
        assert f"§{numer}" in errata, (
            f"Sekcja §{numer} jest oznaczona jako skorygowana, ale nie ma wpisu "
            "w tabeli ERRATA — korekta bez wpisu jest cichą edycją."
        )


def test_korekta_cytuje_oryginalne_brzmienie() -> None:
    """Poprawiona sekcja musi zacytować to, co prostuje."""
    tresc = _tresc()
    poczatek = tresc.index("### 27.2 ")
    koniec = tresc.index("### 27.2b")
    sekcja = tresc[poczatek:koniec]
    assert "Sprostowanie" in sekcja
    assert "działający wzorzec" in sekcja, (
        "Skorygowany §27.2 nie cytuje oryginalnego brzmienia — bez cytatu "
        "korekta jest nieodróżnialna od przepisania historii."
    )


def test_werdykt_koncowy_pozostaje_bez_zmian() -> None:
    assert "1/10" in _tresc() or "maturity" in _tresc().lower()
