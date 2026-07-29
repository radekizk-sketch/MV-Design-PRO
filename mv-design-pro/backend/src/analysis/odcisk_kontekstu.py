"""Rzut koperty ``context`` na potrzeby ODCISKU analizy (V12K-269).

DEFEKT, KTORY TO USUWA — ZMIERZONY.
``analysis_id`` kazdej z dziewieciu analiz liczony jest z tresci: parametry +
wyniki + CALA koperta ``context``. Koperta niesie ``run_timestamp``, wiec ta sama
analiza tej samej, NIEZMIENIONEJ sieci dostawala INNY odcisk przy kazdym
uruchomieniu. Pomiar (``compute_sensitivity_id``, identyczne wejscie, rozne
znaczniki czasu):

    id (2026-01-01) = 433b0ad9de04346973d04c386a25899fb5ec478f8418e1ee6d42a8cb4163879e
    id (2026-07-28) = 73a0af66562d931b32fc2e429da560b0a0376b7a0eed914ca64b2047b9e69a10

Lamie to regule determinizmu kanonu („to samo wejscie = ten sam wynik; odciski
SHA-256 musza byc stabilne") i odbiera odciskowi jego jedyne zastosowanie:
projektant NIE MOZE po odcisku stwierdzic, czy dwie analizy sa ta sama analiza,
ani czy cokolwiek sie zmienilo od poprzedniego przebiegu. Istniejace testy tego
nie lapaly, bo wszystkie budowaly kontekst przez wspolne ``_ctx()`` ze
STALYM znacznikiem czasu — czas nigdy sie w nich nie zmienial.

CO ZOSTAJE W ODCISKU, A CO NIE.
Zostaja pola, ktore identyfikuja WEJSCIE analizy:
- ``snapshot_id`` — wersja modelu, na ktorym liczono (rozne modele MUSZA dac
  rozne odciski, inaczej odcisk zlewalby ze soba dwie rozne sieci),
- ``trace_id`` — identyfikator artefaktu dowodowego, z ktorego analiza powstala
  (tresciowy skrot, patrz ``application/trace_emitters/deterministic_ids.py``).

Wypadaja pola PROWENIENCJI, ktore nie sa wejsciem obliczenia:
- ``run_timestamp`` — zegar scienny,
- ``project_name``, ``case_name`` — etykiety; zmiana nazwy projektu nie zmienia
  ani jednej liczby w wyniku, wiec nie moze zmieniac odcisku wyniku.

Pola te NADAL sa w ``to_dict`` kazdego kontekstu i nadal jada do raportow —
znikaja wylacznie z ODCISKU. To rozroznienie jest cala trescia tego modulu.
"""

from __future__ import annotations

from typing import Any

#: Pola koperty, ktore NIE sa wejsciem analizy i nie moga wchodzic do odcisku.
POLA_PROWENIENCJI: frozenset[str] = frozenset({"run_timestamp", "project_name", "case_name"})


def odcisk_kontekstu(context: Any | None) -> dict[str, Any] | None:
    """Rzut koperty na pola identyfikujace WEJSCIE analizy.

    Args:
        context: dowolny kontekst analizy z metoda ``to_dict`` albo ``None``.

    Returns:
        Slownik bez pol proweniencji, albo ``None`` gdy kontekstu nie ma —
        brak koperty i koperta pusta to dwa rozne stany i nie wolno ich zlewac.
    """
    if context is None:
        return None
    dane = context.to_dict()
    return {k: v for k, v in dane.items() if k not in POLA_PROWENIENCJI}
