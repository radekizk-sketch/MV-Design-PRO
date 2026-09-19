"""Katalog projektu — typy katalogowe niesione PRZEZ model (`EnergyNetworkModel.katalog_projektu`).

DLACZEGO (wycinek W1 mapy domknięcia, `docs/plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` §9):
dane sieci wchodzące spoza systemu (arkusz XLSX) niosą JAWNE parametry elementów
(R/X/B na km, Sn/uk/Pk/grupa transformatora) bez identyfikatora typu producenta.
Reguła wiązania katalogowego (CLAUDE.md, reguła 10) zabrania wstrzykiwać takie
parametry wprost do elementu, a zero fabrykacji zabrania podmieniać je „najbliższym"
typem producenta. Jedyne uczciwe miejsce dla parametrów inżyniera to POZYCJA
KATALOGU z proweniencją (`source_reference` = arkusz/wiersz, status weryfikacji
`NIEZWERYFIKOWANY`), którą element wiąże zwykłym `catalog_ref` i materializuje tą
samą drogą co typ producenta (`network_model/catalog/materialization.py`).

Pozycje te żyją W MODELU (sekcja `katalog_projektu`), nie w procesie ani w bazie:
podróżują z archiwum, wchodzą do odcisku modelu (zmiana parametru typu = zmiana
wejścia obliczeń), są deterministyczne (posortowane po `id`) i nie mają drugiej
kopii. Katalog statyczny (`network_model/catalog/*.py`) pozostaje jedynym źródłem
typów producenckich — tu jest wyłącznie NAKŁADKA per model, budowana z tych
samych klas typów (`LineType`/`CableType`/`TransformerType`) i tym samym
budowniczym rekordów (`CatalogRepository.from_records`).

JEDEN RESOLVER. Operacje domenowe nie wołają `get_default_mv_catalog()` wprost —
dyspozytor `execute_domain_operation` ustawia kontekst katalogu modelu
(`kontekst_katalogu`), a każde miejsce rozstrzygania referencji czyta
`katalog_biezacy()`. Poza operacją (uzupełnianie materializacji przy odczycie
magazynu, obliczenie parametrów pochodnych) resolver dostaje model jawnie:
`katalog_dla_modelu(enm)`. Dzięki temu typ z arkusza jest widoczny WSZĘDZIE, gdzie
widoczny jest typ producenta — bez drugiej ścieżki.

Kolizja identyfikatorów: pozycja projektu nie może nosić `id` istniejącego w
katalogu statycznym tego samego rodzaju — to byłoby ciche przesłonięcie typu
producenta parametrami użytkownika. Kolizja kończy się `BladKataloguProjektu`
(dyspozytor zamienia go na nazwany błąd operacji `katalog_projektu.invalid`).
"""

from __future__ import annotations

import dataclasses
import json
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from contextvars import ContextVar
from functools import lru_cache
from typing import Any

from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog

#: Rodzaje typów, które model może nieść lokalnie (klucze sekcji = pola
#: `CatalogRepository`, żeby nakładka była mechaniczna, bez tłumaczenia nazw).
RODZAJE_TYPOW_PROJEKTU: tuple[str, ...] = ("line_types", "cable_types", "transformer_types")

#: Status weryfikacji pozycji z arkusza — dana inżyniera, nie karta producenta.
STATUS_WERYFIKACJI_ARKUSZA = "NIEWERYFIKOWANY"
STATUS_KATALOGU_PROJEKTU = "PROJEKTOWY_V1"

_KATALOG_OPERACJI: ContextVar[CatalogRepository | None] = ContextVar(
    "katalog_operacji", default=None
)


class BladKataloguProjektu(ValueError):
    """Sekcja `katalog_projektu` nie daje się złożyć w katalog (kolizja/niepełny rekord)."""


def sekcja_katalogu_projektu(enm: object) -> dict[str, list[dict[str, Any]]] | None:
    """Sekcja `katalog_projektu` jako słownik list rekordów — z modelu albo ze słownika
    migawki; `None`, gdy model nie niesie żadnej pozycji projektu."""
    if isinstance(enm, Mapping):
        surowa = enm.get("katalog_projektu")
    else:
        surowa = getattr(enm, "katalog_projektu", None)
    if surowa is None:
        return None
    if not isinstance(surowa, Mapping):
        surowa = surowa.model_dump(mode="json")
    sekcja: dict[str, list[dict[str, Any]]] = {}
    for rodzaj in RODZAJE_TYPOW_PROJEKTU:
        rekordy = surowa.get(rodzaj) or []
        if rekordy:
            sekcja[rodzaj] = [dict(rekord) for rekord in rekordy]
    return sekcja or None


def klucz_sekcji(sekcja: Mapping[str, list[dict[str, Any]]]) -> str:
    """Kanoniczny JSON sekcji — klucz pamięci podręcznej nakładki (determinizm:
    ta sama treść = ten sam katalog, niezależnie od kolejności kluczy w słowniku)."""
    return json.dumps(sekcja, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


@lru_cache(maxsize=32)
def _katalog_z_klucza(klucz: str) -> CatalogRepository:
    sekcja: dict[str, list[dict[str, Any]]] = json.loads(klucz)
    domyslny = get_default_mv_catalog()
    try:
        lokalny = CatalogRepository.from_records(
            line_types=sekcja.get("line_types", []),
            cable_types=sekcja.get("cable_types", []),
            transformer_types=sekcja.get("transformer_types", []),
        )
    except (KeyError, TypeError, ValueError) as blad:
        raise BladKataloguProjektu(
            f"Rekord katalogu projektu nie daje się złożyć w typ katalogowy: {blad}"
        ) from blad
    nadpisania: dict[str, dict[str, Any]] = {}
    for rodzaj in RODZAJE_TYPOW_PROJEKTU:
        lokalne = getattr(lokalny, rodzaj)
        if not lokalne:
            continue
        statyczne = getattr(domyslny, rodzaj)
        kolizje = sorted(identyfikator for identyfikator in lokalne if identyfikator in statyczne)
        if kolizje:
            raise BladKataloguProjektu(
                f"Pozycje katalogu projektu ({rodzaj}) noszą identyfikatory katalogu "
                f"statycznego: {kolizje} — typ producenta nie może być przesłonięty "
                "parametrami użytkownika; nadaj pozycjom projektu własne identyfikatory."
            )
        nadpisania[rodzaj] = {**statyczne, **lokalne}
    return dataclasses.replace(domyslny, **nadpisania)


def katalog_dla_modelu(enm: object) -> CatalogRepository:
    """Katalog obowiązujący dla TEGO modelu: statyczny + pozycje projektu (jeśli są).

    Model bez sekcji dostaje dokładnie ten sam obiekt co `get_default_mv_catalog()`
    (zero kosztu, zero zmiany zachowania dla wszystkich istniejących modeli).
    """
    sekcja = sekcja_katalogu_projektu(enm)
    if sekcja is None:
        return get_default_mv_catalog()
    return _katalog_z_klucza(klucz_sekcji(sekcja))


def katalog_biezacy() -> CatalogRepository:
    """Katalog operacji domenowej w toku (ustawiony przez `kontekst_katalogu`), a poza
    operacją — katalog statyczny."""
    katalog = _KATALOG_OPERACJI.get()
    return katalog if katalog is not None else get_default_mv_catalog()


@contextmanager
def kontekst_katalogu(enm: object) -> Iterator[CatalogRepository]:
    """Ustaw katalog modelu jako katalog bieżący na czas operacji domenowej."""
    katalog = katalog_dla_modelu(enm)
    token = _KATALOG_OPERACJI.set(katalog)
    try:
        yield katalog
    finally:
        _KATALOG_OPERACJI.reset(token)
