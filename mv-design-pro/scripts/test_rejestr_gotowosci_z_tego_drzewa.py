#!/usr/bin/env python3
"""Ładowacze rejestru kodów gotowości czytają rejestr WŁASNEGO drzewa (scalenie partii 9–13).

Defekt zmierzony przy scaleniu: wspólne środowisko wirtualne kilku drzew roboczych niesie
wpis `.pth` na `backend/src` jednego z nich (głównego checkoutu). `modul_rejestru()`
generatora słownika i strażnika kodów brał wtedy `domain.canonical_operations` z INNEGO
drzewa — generator wypisał 147 kodów zamiast 160, a strażnik słownika zgłosił rozjazd,
którego w drzewie nie było (i odwrotnie: przepuściłby rozjazd prawdziwy).

Iloczyn cech: ładowacz (generator, strażnik kodów) × stan `sys.modules`
(brak, moduł obcego drzewa, moduł tego drzewa) × wynik `find_spec("domain")`
(brak, pakiet obcego drzewa, pakiet tego drzewa). Kryterium jedno: zwrócony moduł
pochodzi z `REGISTRY_FILE` tego drzewa, a moduł tego drzewa już obecny w `sys.modules`
jest zwracany DOKŁADNIE (te same klasy enum dla `isinstance`).
"""

from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path

import generuj_slownik_kodow_gotowosci as generator
import pytest
import readiness_codes_guard as straznik

REPO = Path(__file__).resolve().parents[1]
BACKEND_SRC = REPO / "backend" / "src"
OBCY_KORZEN = Path("/obce-drzewo/mv-design-pro/backend/src")

LADOWACZE = {
    "generator": (generator, "_rejestr_slownik_gotowosci"),
    "straznik": (straznik, "_rejestr_kanoniczny"),
}


def _modul(plik: Path) -> types.ModuleType:
    modul = types.ModuleType("domain.canonical_operations")
    modul.__file__ = str(plik)
    modul.READINESS_CODES = {}  # type: ignore[attr-defined]
    return modul


def _nasz_klucz(klucz: str) -> bool:
    nazwy_plikowe = {nazwa for _, nazwa in LADOWACZE.values()}
    return klucz == "domain" or klucz.startswith("domain.") or klucz in nazwy_plikowe


@pytest.fixture
def czyste_domain() -> object:
    """Pakiet `domain` usunięty na czas testu i przywrócony W CAŁOŚCI po nim.

    Import pakietowy w przypadku „własny” tworzy nowe moduły `domain.*`; bez pełnego
    przywrócenia zostałyby w `sys.modules` obok starych i rozjechały klasy enum innym
    testom tego procesu.
    """
    zapis = {k: v for k, v in sys.modules.items() if _nasz_klucz(k)}
    for klucz in zapis:
        del sys.modules[klucz]
    yield
    for klucz in [k for k in sys.modules if _nasz_klucz(k)]:
        del sys.modules[klucz]
    sys.modules.update(zapis)


class _Spec:
    def __init__(self, origin: Path) -> None:
        self.origin = str(origin)


@pytest.mark.parametrize("ladowacz", sorted(LADOWACZE))
@pytest.mark.parametrize("w_modulach", ["brak", "obcy", "wlasny"])
@pytest.mark.parametrize("pakiet", ["brak", "obcy", "wlasny"])
def test_modul_rejestru_zawsze_z_tego_drzewa(
    monkeypatch: pytest.MonkeyPatch,
    czyste_domain: object,
    ladowacz: str,
    w_modulach: str,
    pakiet: str,
) -> None:
    modul_ladowacza, nazwa_plikowa = LADOWACZE[ladowacz]
    plik_rejestru = Path(modul_ladowacza.REGISTRY_FILE).resolve()
    assert plik_rejestru == (BACKEND_SRC / "domain" / "canonical_operations.py").resolve()

    # Czysty stan (fiksura `czyste_domain`): bez wpisu plikowego z poprzednich wywołań i bez
    # pakietu `domain`, żeby import pakietowy (przypadek „własny”) szukał na ścieżce drzewa.
    assert nazwa_plikowa not in sys.modules
    monkeypatch.syspath_prepend(str(BACKEND_SRC))

    obcy = _modul(OBCY_KORZEN / "domain" / "canonical_operations.py")
    wlasny = _modul(plik_rejestru)
    # Wpis wprost, nie `monkeypatch.setitem`: cofnięcie monkeypatcha biegnie PO fiksturze
    # `czyste_domain` i usunęłoby przywrócony prawdziwy rejestr; sprząta fiksura.
    if w_modulach == "obcy":
        sys.modules["domain.canonical_operations"] = obcy
    elif w_modulach == "wlasny":
        sys.modules["domain.canonical_operations"] = wlasny

    prawdziwy_find_spec = importlib.util.find_spec

    def find_spec(nazwa: str, *args: object, **kwargs: object) -> object:
        if nazwa != "domain":
            return prawdziwy_find_spec(nazwa, *args, **kwargs)  # type: ignore[arg-type]
        if pakiet == "brak":
            return None
        if pakiet == "obcy":
            return _Spec(OBCY_KORZEN / "domain" / "__init__.py")
        return _Spec(plik_rejestru.parent / "__init__.py")

    monkeypatch.setattr(importlib.util, "find_spec", find_spec)

    wynik = modul_ladowacza.modul_rejestru()

    assert wynik is not obcy, "ładowacz zwrócił rejestr OBCEGO drzewa"
    assert Path(wynik.__file__).resolve() == plik_rejestru
    if w_modulach == "wlasny":
        assert wynik is wlasny, "moduł tego drzewa z sys.modules musi wrócić dokładnie"
    else:
        assert hasattr(wynik, "ReadinessLevel"), "zwrócony moduł to prawdziwy rejestr"
        assert len(wynik.READINESS_CODES) > 0
