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
przekazywane bez zmian; `-0.0` staje się `0.0`.

PRZEGLĄD §35 (kontrakt MAX PLATFORM, 2026-09-04; polityka w
`docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md` §C.5): wartości NIEFINITOWE (NaN,
±inf) i liczby zespolone NIE SĄ dopuszczalne w kontrakcie wyjściowym. Wcześniej
przechodziły bez zmian, a `json.dumps` emitował tokeny `NaN`/`Infinity`
(niepoprawny JSON — klient nie sparsuje) — defekt producenta ładunku był
maskowany. Teraz `kwantyzuj_kontrakt` w trybie ścisłym (domyślnym) zgłasza
`KontraktNiefinitowyError` ze ścieżką pola. Wielkość „nieskończona” w sensie
inżynierskim (sieć sztywna) ma być polem jawnym (`is_infinite_bus`) albo `None`
z powodem, nigdy `inf`. Kwantyzacja jest WZGLĘDNA (niezależna od jednostki),
porządek kluczy słownika jest nieistotny dla odcisku (`sort_keys`), porządek
list jest semantyczny (lista niesie kolejność), `int` i `bool` nie są
kwantyzowane (typ jest częścią kontraktu).

Funkcja jest czysta i idempotentna: `kwantyzuj_kontrakt(kwantyzuj_kontrakt(x))
== kwantyzuj_kontrakt(x)`; test `test_kwantyzacja_kontraktu.py` dowodzi tego
na wszystkich fixturach i sprawdza odporność na zaburzenie ±1 ULP każdej liczby.
"""

from __future__ import annotations

import math
from typing import Any

#: Liczba cyfr znaczących kontraktu (uzasadnienie w docstringu modułu).
CYFRY_ZNACZACE = 9


class KontraktNiefinitowyError(ValueError):
    """Kontrakt wyjściowy zawiera NaN/±inf albo liczbę zespoloną — defekt producenta ładunku.

    Komunikat niesie ścieżkę pola (np. `$.buses[3].u_kv`), żeby defekt był lokalizowalny
    bez debugowania serializacji.
    """


def kanoniczna_liczba(wartosc: float, cyfry_znaczace: int = CYFRY_ZNACZACE) -> float:
    """Zaokrąglij `float` do `cyfry_znaczace` cyfr znaczących (deterministycznie).

    Wartość niefinitowa jest zwracana bez zmian — o jej dopuszczalności decyduje
    wołający (`kwantyzuj_kontrakt` w trybie ścisłym ją odrzuca).
    """
    if wartosc == 0.0 or not math.isfinite(wartosc):
        return 0.0 if wartosc == 0.0 else wartosc
    return float(f"{wartosc:.{cyfry_znaczace - 1}e}")


def kwantyzuj_kontrakt(
    obiekt: Any,
    cyfry_znaczace: int = CYFRY_ZNACZACE,
    *,
    scisle: bool = True,
    _sciezka: str = "$",
) -> Any:
    """Rekurencyjnie skwantyzuj wszystkie `float` w słownikach/listach/krotkach.

    Zwraca NOWĄ strukturę (wejście nie jest mutowane). Klucze słowników nie są
    zmieniane. `bool` nie jest liczbą zmiennoprzecinkową i pozostaje `bool`.
    W trybie ścisłym (`scisle=True`, domyślnie) NaN/±inf oraz `complex` podnoszą
    `KontraktNiefinitowyError` ze ścieżką pola — kontrakt wyjściowy musi być
    poprawnym JSON-em o wartościach finitowych (polityka §35).
    """
    if isinstance(obiekt, bool):
        return obiekt
    if isinstance(obiekt, complex):
        if scisle:
            raise KontraktNiefinitowyError(
                f"{_sciezka}: liczba zespolona {obiekt!r} w kontrakcie wyjściowym — "
                "części re/im muszą być osobnymi polami"
            )
        return obiekt
    if isinstance(obiekt, float):
        if scisle and not math.isfinite(obiekt):
            raise KontraktNiefinitowyError(
                f"{_sciezka}: wartość niefinitowa {obiekt!r} w kontrakcie wyjściowym — "
                "użyj jawnego pola albo `None` z powodem"
            )
        return kanoniczna_liczba(obiekt, cyfry_znaczace)
    if isinstance(obiekt, dict):
        return {
            klucz: kwantyzuj_kontrakt(
                wartosc, cyfry_znaczace, scisle=scisle, _sciezka=f"{_sciezka}.{klucz}"
            )
            for klucz, wartosc in obiekt.items()
        }
    if isinstance(obiekt, list):
        return [
            kwantyzuj_kontrakt(element, cyfry_znaczace, scisle=scisle, _sciezka=f"{_sciezka}[{i}]")
            for i, element in enumerate(obiekt)
        ]
    if isinstance(obiekt, tuple):
        return tuple(
            kwantyzuj_kontrakt(element, cyfry_znaczace, scisle=scisle, _sciezka=f"{_sciezka}[{i}]")
            for i, element in enumerate(obiekt)
        )
    return obiekt
