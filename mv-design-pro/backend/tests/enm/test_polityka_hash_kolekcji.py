"""Polityka haszowania kolekcji ENM — zbior wyjatkow jest ZAMKNIETY i pinowany.

DEFEKT, KTORY TO PILNUJE (znalezisko Z7 audytu donorow 2026-09-07).
`enm/hash.py::_kopia_pod_hash` zdejmuje `id` wylacznie z kolekcji wymienionych w
`_ELEMENT_KEYS`. `EnergyNetworkModel` ma 16 kolekcji listowych, a `_ELEMENT_KEYS`
zna 14 — poza polityka stoja `connection_nodes` i `line_runs`, wiec ich `id`
wchodza do hasza migawki inaczej niz identyfikatory pozostalych elementow.

DZIS NIE JEST TO DEFEKT CZYNNY: identyfikatory w tych dwoch kolekcjach sa stabilne
(pochodne referencji, nie losowe `uuid4`), wiec hasz jest deterministyczny. Jest to
NIESPOJNOSC, ktorej nic nie pilnowalo — element z losowym identyfikatorem w
ktorejkolwiek z nich zaczalby zmieniac `snapshot_hash` przy kazdym zapisie, a przez
`application/result_freshness.py` uniewazniac wyniki bez zmiany fizyki.

DLACZEGO TEN TEST NIE NAPRAWIA, TYLKO PINUJE. Dopisanie tych dwoch nazw do
`_ELEMENT_KEYS` ZMIENIA WEJSCIE HASZA: uniewaznia `snapshot_hash` zapisane w
istniejacych bazach, wymaga przeliczenia plikow golden i migracji danych. To jest
karta migracyjna (patrz `docs/architecture/DONOR_IMPLEMENTATION_BACKLOG.md` D-11),
a nie sprzatanie przy okazji. Do czasu jej wykonania zbior wyjatkow ma byc
ZAMKNIETY — kazda NOWA kolekcja poza polityka to swiadoma decyzja, nie przeoczenie.
"""

from __future__ import annotations

import pytest

sqlalchemy = pytest.importorskip("sqlalchemy")

from enm.hash import _ELEMENT_KEYS  # noqa: E402
from enm.models import EnergyNetworkModel  # noqa: E402

#: Kolekcje SWIADOMIE poza `_ELEMENT_KEYS` (Z7). Lista ZAMKNIETA — powiekszenie
#: jej wymaga decyzji o migracji haszy, nie samej edycji tej stalej.
WYJATKI_POZA_POLITYKA_HASH: frozenset[str] = frozenset({"connection_nodes", "line_runs"})


def _kolekcje_listowe() -> set[str]:
    return {
        nazwa
        for nazwa, pole in EnergyNetworkModel.model_fields.items()
        if "list" in str(pole.annotation).lower()
    }


def test_zbior_kolekcji_poza_polityka_hash_jest_zamkniety() -> None:
    """Zadna NOWA kolekcja nie moze cicho ominac zdejmowania `id` przed haszowaniem."""
    poza = _kolekcje_listowe() - set(_ELEMENT_KEYS)

    nowe = poza - WYJATKI_POZA_POLITYKA_HASH
    assert not nowe, (
        f"nowe kolekcje ENM poza polityka hash: {sorted(nowe)} — ich `id` NIE beda zdejmowane "
        "przez `_kopia_pod_hash`, wiec losowy identyfikator zmieni `snapshot_hash` i uniewazni "
        "wyniki bez zmiany fizyki. Albo dopisz je do `_ELEMENT_KEYS` (to MIGRACJA haszy — "
        "karta D-11), albo swiadomie do WYJATKI_POZA_POLITYKA_HASH z uzasadnieniem."
    )

    zniknely = WYJATKI_POZA_POLITYKA_HASH - poza
    assert not zniknely, (
        f"wyjatki {sorted(zniknely)} sa juz objete polityka hash — usun je z listy wyjatkow, "
        "zeby nie udawala dlugu, ktorego nie ma (karta D-11 wykonana?)"
    )


def test_element_keys_nie_wymienia_nieistniejacych_kolekcji() -> None:
    """`_ELEMENT_KEYS` nie moze zawierac nazw, ktorych model juz nie ma (martwy wpis)."""
    martwe = set(_ELEMENT_KEYS) - _kolekcje_listowe()
    assert not martwe, f"`_ELEMENT_KEYS` wymienia nieistniejace kolekcje: {sorted(martwe)}"
