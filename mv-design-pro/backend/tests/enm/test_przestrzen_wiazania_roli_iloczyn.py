"""Przestrzeń wiązania ROLI (``<rola>_catalog_binding``) — jedna kontrola, obie drogi.

Karta JEDEN-KLUCZ-KATALOGU (cel 2, przyczyna konfliktu wersji w
``test_jeden_klucz_wiazania_iloczyn``): handlery czytały pozycję wiązania roli bez przestrzeni
(``pozycja_wiazania``), więc wiązanie aparatu pola deklarujące grupę kabli było PRZYJMOWANE —
wariant „przestrzeń niezgodna” zmieniał model, a następny krok łańcucha dostawał 409.
Naprawa u źródła: przestrzenie ról w :data:`PRZESTRZENIE_WIAZANIA_ROLI`, sprawdzane w jedynej
kontroli kształtu wiązań :func:`bledy_wiazan_w_ladunku` (dyspozytor operacji i brama API).

ILOCZYN CECH: klucz roli {każdy z mapy} × miejsce w kontrakcie {każde: wierzch ładunku,
obiekt zagnieżdżony, element listy} × przestrzeń zadeklarowana {brak, każda dozwolona, obca}
× droga {kontrola kształtu, dyspozytor operacji, brama API}.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from api.domain_ops_policy import CatalogPolicyError, validate_and_materialize_catalog_binding
from domain.canonical_operations import (
    CANONICAL_OPERATIONS,
    KSZTALTY_ZAGNIEZDZONE,
    klucze_kontraktu,
)
from enm.domain_operations import execute_domain_operation
from enm.wiazanie_katalogowe import (
    KOD_PRZESTRZENI_NIEZGODNEJ,
    PRZESTRZENIE_WIAZANIA_ROLI,
    bledy_wiazan_w_ladunku,
)

from tests.enm.model_minimalny import model_minimalny

OBCA = "KABEL_NN"


def _miejsca_w_ksztalcie(ksztalt: Any, sciezka: tuple) -> Iterator[tuple]:
    for klucz in sorted(getattr(ksztalt, "pola", ())):
        yield (*sciezka, klucz)
    for klucz, pod in sorted(getattr(ksztalt, "zagniezdzone", {}).items()):
        yield from _miejsca_w_ksztalcie(pod, (*sciezka, klucz))


def _miejsca() -> list[tuple[str, tuple]]:
    """(operacja, ścieżka) każdego klucza roli w kontrakcie operacji."""
    wynik: set[tuple[str, tuple]] = set()
    for operacja in CANONICAL_OPERATIONS:
        for klucz in klucze_kontraktu(operacja):
            if klucz in PRZESTRZENIE_WIAZANIA_ROLI:
                wynik.add((operacja, (klucz,)))
        for klucz, ksztalt in KSZTALTY_ZAGNIEZDZONE.get(operacja, {}).items():
            for sciezka in _miejsca_w_ksztalcie(ksztalt, (klucz,)):
                if sciezka[-1] in PRZESTRZENIE_WIAZANIA_ROLI:
                    wynik.add((operacja, sciezka))
    return sorted(wynik)


MIEJSCA = _miejsca()


def _ladunek(sciezka: tuple, wiazanie: dict[str, Any], jako_lista: bool) -> dict[str, Any]:
    wezel: Any = wiazanie
    for i, klucz in enumerate(reversed(sciezka)):
        wezel = {klucz: wezel}
        # Pierwszy poziom zagnieżdżenia jako lista (np. ``sn_fields[]``) — walker przyjmuje
        # słownik albo listę słowników pod tym samym kształtem.
        if jako_lista and i == len(sciezka) - 2:
            wezel = [wezel]
    return wezel


def test_kazdy_klucz_roli_ma_miejsce_w_kontrakcie() -> None:
    """Mapa nie niesie martwych kluczy — każdy występuje w kontrakcie jakiejś operacji."""
    assert {sciezka[-1] for _, sciezka in MIEJSCA} == set(PRZESTRZENIE_WIAZANIA_ROLI)


@pytest.mark.parametrize(("operacja", "sciezka"), MIEJSCA, ids=lambda v: str(v))
def test_klucz_roli_x_miejsce_x_przestrzen_x_droga(operacja: str, sciezka: tuple) -> None:
    dozwolone = PRZESTRZENIE_WIAZANIA_ROLI[sciezka[-1]]
    warianty: list[str | None] = [None, *dozwolone, OBCA]
    for deklarowana in warianty:
        wiazanie: dict[str, Any] = {"catalog_item_id": "pozycja-testowa"}
        if deklarowana is not None:
            wiazanie["catalog_namespace"] = deklarowana
        odrzucona = deklarowana == OBCA
        for jako_lista in (False, True) if len(sciezka) > 1 else (False,):
            ladunek = _ladunek(sciezka, wiazanie, jako_lista)
            kody = {o.kod_bledu for _, o in bledy_wiazan_w_ladunku(operacja, ladunek)}
            assert (KOD_PRZESTRZENI_NIEZGODNEJ in kody) is odrzucona, (
                operacja,
                sciezka,
                deklarowana,
                jako_lista,
                kody,
            )
            if not odrzucona:
                continue
            # Dyspozytor operacji: odmowa przed handlerem, model bez zmian.
            wynik = execute_domain_operation(model_minimalny(), operacja, ladunek)
            assert wynik.get("error_code") == KOD_PRZESTRZENI_NIEZGODNEJ, (
                operacja,
                sciezka,
                wynik.get("error_code"),
            )
            assert wynik.get("snapshot") is None
            # Brama API: ten sam kod z tej samej kontroli.
            try:
                blad, _ = validate_and_materialize_catalog_binding(operacja, ladunek)
            except CatalogPolicyError as odmowa:
                blad = odmowa
            assert blad is not None and blad.code == KOD_PRZESTRZENI_NIEZGODNEJ, (
                operacja,
                sciezka,
                blad,
            )
