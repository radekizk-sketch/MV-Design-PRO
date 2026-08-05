"""Pin memoizacji kanonicznego repozytorium katalogowego (V12K-322, dlug 9 / DET-9).

INTENCJA: `get_default_mv_catalog()` jest wolane 89 razy w `src/` i 133 razy w testach,
a pojedyncza operacja domenowa siega po nie 18 razy. Przed memo kazde wywolanie
odbudowywalo komplet slownikow typow (zmierzone 89 ms), co dawalo ~95% czasu operacji
domenowej i godziny w pelnym biegu testow. Memo jest KONTRAKTEM wydajnosciowym, wiec
ma przypiety test — inaczej ciche cofniecie dekoratora byloby niewidoczne.

Test pilnuje obu polowek kontraktu:
  1. WSPOLDZIELENIE — kolejne wywolania oddaja TEN SAM obiekt (memo dziala),
  2. ZGODNOSC — zapamietany agregat ma dokladnie te sama tresc, co swiezo zbudowany
     (`__wrapped__`), wiec memo nie moze podac katalogu innego niz kanoniczny.
"""

from __future__ import annotations

from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog

#: Wszystkie przestrzenie typow repozytorium — porownujemy KLASE (komplet namespace'ow),
#: nie pojedynczy przyklad, zeby memo nie moglo zgubic zadnej z nich niezauwazenie.
_NAMESPACES = tuple(CatalogRepository.__dataclass_fields__)


def test_katalog_domyslny_jest_wspoldzielony() -> None:
    """Kolejne wywolania oddaja ten sam obiekt — katalog nie jest odbudowywany."""
    assert get_default_mv_catalog() is get_default_mv_catalog()


def test_zapamietany_katalog_ma_tresc_swiezo_zbudowanego() -> None:
    """Memo oddaje dokladnie ten sam komplet typow, co budowa od zera."""
    zapamietany = get_default_mv_catalog()
    swiezy = get_default_mv_catalog.__wrapped__()

    assert _NAMESPACES, "Repozytorium katalogowe nie ma zadnych przestrzeni typow"
    for namespace in _NAMESPACES:
        zapamietane = getattr(zapamietany, namespace)
        swieze = getattr(swiezy, namespace)
        assert sorted(zapamietane) == sorted(
            swieze
        ), f"Przestrzen '{namespace}': memo ma inny zbior identyfikatorow niz swieza budowa"
