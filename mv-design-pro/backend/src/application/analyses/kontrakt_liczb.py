"""Kanonizacja liczb w kontraktach wyjściowych (ADR-018, M0-2).

DLACZEGO (dowód z CI, 2026-09-02, `main` @ a1ab2959 i gałąź audytu):
7 z 18 fixtur projekcji nN (`frontend/src/ui/sld/v3/lv-domain/fixtures/generated`)
miało w CI inny `projection_hash` niż lokalnie, choć model był identyczny.
Różnice dotyczyły WYŁĄCZNIE ostatniego bitu mantysy liczb wyprowadzanych z
algebry macierzowej (odwrócenie Zbus w `build_zbus`, OpenBLAS z `DYNAMIC_ARCH`
dobiera inne jądro na innym CPU → inna kolejność sumowania):

    r_ohm     7.111111111111113e-05  vs  7.111111111111112e-05
    rx_ratio  0.2                    vs  0.19999999999999998
    sk_mva    485.38743446700545     vs  485.38743446700533
    z1_ohm.x  0.5000000000000001     vs  0.5000000000000002

Odcisk liczony z pełnej reprezentacji `float` zależy więc od maszyny, a nie od
modelu — świeżość wyników (FRESH/OUTDATED) i parytet fixtur były
nieudowadnialne między środowiskami.

REGUŁA: każda liczba zmiennoprzecinkowa w kontrakcie WYJŚCIOWYM jest
kwantyzowana do `CYFRY_ZNACZACE` cyfr znaczących PRZED serializacją i PRZED
liczeniem odcisku. 9 cyfr znaczących to o kilka rzędów więcej niż dokładność
danych wejściowych (katalog: 3–4 cyfry; IEC 60909: tolerancja 2–5 %), a szum
1 ULP (~1e-16 względnie) przekracza granicę zaokrąglenia z prawdopodobieństwem
≈ 2·1e-16 / 1e-9 = 2e-7 na wartość — dla ~2 000 liczb w 18 fixturach oznacza
to ≈ 4e-4 na pełny przebieg (przy 12 cyfrach byłoby to ≈ 0,4, czyli praktycznie
pewna fałszywa czerwień). Liczby całkowite, logiczne, tekst i `None` są
przekazywane bez zmian; `-0.0` staje się `0.0`; NaN/inf nie są dopuszczalne w
kontraktach (przechodzą bez zmian, żeby nie ukrywać defektu producenta).

Funkcja jest czysta i idempotentna: `kwantyzuj_kontrakt(kwantyzuj_kontrakt(x))
== kwantyzuj_kontrakt(x)`; test `test_kwantyzacja_kontraktu.py` dowodzi tego
na wszystkich fixturach i sprawdza odporność na zaburzenie ±1 ULP każdej liczby.
"""

from __future__ import annotations

import math
from typing import Any

#: Liczba cyfr znaczących kontraktu (uzasadnienie w docstringu modułu).
CYFRY_ZNACZACE = 9


def kanoniczna_liczba(wartosc: float, cyfry_znaczace: int = CYFRY_ZNACZACE) -> float:
    """Zaokrąglij `float` do `cyfry_znaczace` cyfr znaczących (deterministycznie)."""
    if wartosc == 0.0 or not math.isfinite(wartosc):
        return 0.0 if wartosc == 0.0 else wartosc
    return float(f"{wartosc:.{cyfry_znaczace - 1}e}")


def kwantyzuj_kontrakt(obiekt: Any, cyfry_znaczace: int = CYFRY_ZNACZACE) -> Any:
    """Rekurencyjnie skwantyzuj wszystkie `float` w słownikach/listach/krotkach.

    Zwraca NOWĄ strukturę (wejście nie jest mutowane). Klucze słowników nie są
    zmieniane. `bool` nie jest liczbą zmiennoprzecinkową i pozostaje `bool`.
    """
    if isinstance(obiekt, bool):
        return obiekt
    if isinstance(obiekt, float):
        return kanoniczna_liczba(obiekt, cyfry_znaczace)
    if isinstance(obiekt, dict):
        return {
            klucz: kwantyzuj_kontrakt(wartosc, cyfry_znaczace) for klucz, wartosc in obiekt.items()
        }
    if isinstance(obiekt, list):
        return [kwantyzuj_kontrakt(element, cyfry_znaczace) for element in obiekt]
    if isinstance(obiekt, tuple):
        return tuple(kwantyzuj_kontrakt(element, cyfry_znaczace) for element in obiekt)
    return obiekt
