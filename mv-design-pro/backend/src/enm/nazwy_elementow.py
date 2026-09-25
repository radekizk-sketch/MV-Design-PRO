"""Nazwa elementu modelu pokazywana projektantowi — jedno źródło (karta #144).

PO CO: nazwy elementów trafiają na schemat, do tabel wyników, dowodów, dokumentów, śladów
White Box i komunikatów. Każda droga, która w braku nazwy sięgała po identyfikator
(`f"Odcinek {ref[-8:]}"` — dosłownie „Odcinek /segment", `node.get("name", bus_id)`,
`element.name or element.ref_id`), pokazywała inżynierowi identyfikator maszynowy zamiast
nazwy z projektu. Ten moduł jest jedynym miejscem, które wie, jak nazwać element bez nazwy:
polskim opisem rodzaju („Szyna bez nazwy", „Kabel bez nazwy"), NIGDY identyfikatorem ani
jego fragmentem. Identyfikator zostaje w polach rekordu (`ref_id`, `element_ref`,
`element_id`), z których interfejs wiąże wybór i nawigację.

WARSTWA: interpretacja migawki ENM (słownik albo model pydantic). Zero fizyki, zero mutacji;
importuje wyłącznie liście (`network_model/nazwy.py`, `enm/rola_pola_sn.py`) — siostra
`enm/element_kind.py` (indeks rodzajów).

JEDEN PREDYKAT (karta NAZWY-JEDNO-ZRODLO). Na pytanie „czy ta wartość jest nazwą nadaną przez
projektanta" odpowiada wyłącznie `jest_nazwa`/`nazwa_nadana` z liścia `network_model/nazwy.py`
(jedyna ścieżka importu predykatu — ten moduł go nie re-eksportuje; o powodzie położenia
mówi nagłówek liścia) i zbudowane na nich funkcje tego modułu — tak samo w nazwie nadawanej
przez operację, w etykiecie wyniku, w zdaniu komunikatu (słownik `enm/slownik_komunikatow.py`
składa zdanie, ale o istnienie nazwy pyta tutaj) i w nazwie pozycji katalogu. Nazwa to
niepusty napis po obcięciu spacji — BEZ oceny kształtu: „T_1", „QF-03_zrodlo" czy „RGN-2"
wpisane przez projektanta są jego nazwami. Pomiar karty
wykazał, że żadna operacja, importer ani generator nie nadaje dziś nazwy o kształcie
identyfikatora albo kodu (tę klasę zamyka strażnik `scripts/nazwa_bez_identyfikatora_guard.py`),
a danych zapisanych przed zasadą się nie migruje — predykat kształtu byłby warstwą zgodności.
Jedność predykatu przypina test AST `tests/enm/test_nazwy_jedno_zrodlo.py` (zapadka).
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from typing import Any

from network_model.nazwy import nazwa_nadana

from .rola_pola_sn import nazwa_roli_pola_sn

#: Gałąź bez nazwy — opis rodzaju wg typu gałęzi ENM (`Branch.type`).
NAZWA_GALEZI_BEZ_NAZWY: dict[str, str] = {
    "line_overhead": "Linia napowietrzna bez nazwy",
    "cable": "Kabel bez nazwy",
    "switch": "Łącznik bez nazwy",
    "breaker": "Wyłącznik bez nazwy",
    "disconnector": "Odłącznik bez nazwy",
    "bus_coupler": "Sprzęgło bez nazwy",
    "fuse": "Bezpiecznik bez nazwy",
}
#: Przekładnik bez nazwy — opis rodzaju wg `Measurement.measurement_type`.
NAZWA_PRZEKLADNIKA_BEZ_NAZWY: dict[str, str] = {
    "CT": "Przekładnik prądowy bez nazwy",
    "VT": "Przekładnik napięciowy bez nazwy",
}
#: Element bez nazwy — opis rodzaju wg kolekcji migawki ENM.
NAZWA_ELEMENTU_BEZ_NAZWY: dict[str, str] = {
    "buses": "Szyna bez nazwy",
    "branches": "Gałąź bez nazwy",
    "transformers": "Transformator bez nazwy",
    "sources": "Źródło zasilania bez nazwy",
    "loads": "Odbiór bez nazwy",
    "generators": "Generator bez nazwy",
    "shunt_capacitors": "Bateria kondensatorów bez nazwy",
    "substations": "Stacja bez nazwy",
    "bays": "Pole bez nazwy",
    "junctions": "Węzeł rozgałęźny bez nazwy",
    "corridors": "Magistrala bez nazwy",
    "measurements": "Przekładnik bez nazwy",
    "protection_assignments": "Zabezpieczenie bez nazwy",
    "branch_points": "Punkt rozgałęzienia bez nazwy",
}
#: Odcinek trasy SN (magistrala, odgałęzienie, połówka dzielonego odcinka) bez nazwy — słowo
#: domeny „odcinek" zamiast rodzaju przewodu, bo tak projektant nazywa element trasy.
ODCINEK_BEZ_NAZWY = "Odcinek bez nazwy"
#: Kolejność kolekcji indeksu nazw — ta sama zasada co `element_kind._KOLEKCJE`: przy
#: (niedozwolonym) duplikacie identyfikatora między kolekcjami wygrywa pierwsza.
_KOLEKCJE_INDEKSU: tuple[str, ...] = tuple(NAZWA_ELEMENTU_BEZ_NAZWY)
#: Identyfikator, którego nie ma w migawce (element usunięty, węzeł pomocniczy grafu):
#: jawny brak elementu w modelu, nie jego identyfikator.
ELEMENT_SPOZA_MODELU = "Element spoza modelu"
#: To samo po słowie rodzaju w zdaniu („Źródło spoza modelu", „na elemencie spoza modelu",
#: „Wyspa źródła spoza modelu") — argument `spoza_modelu` funkcji `nazwa_po_identyfikatorze`.
SPOZA_MODELU = "spoza modelu"
#: Pozycja biblioteki typów (katalogu) bez nazwy — rekord katalogu bez pola `name`.
POZYCJA_KATALOGU_BEZ_NAZWY = "Pozycja katalogu bez nazwy"
#: Model sieci utworzony domyślnie (magazyn ENM bez zapisu) — nagłówek bez nazwy.
NAZWA_MODELU_BEZ_NAZWY = "Model sieci bez nazwy"


def _pole(element: object, klucz: str) -> object:
    if isinstance(element, Mapping):
        return element.get(klucz)
    return getattr(element, klucz, None)


def nazwa_nadana_elementu(element: object) -> str | None:
    """Nazwa nadana elementowi (pole `name` słownika migawki albo obiektu modelu) albo `None`."""
    return nazwa_nadana(_pole(element, "name")) if element is not None else None


def nazwa_galezi_bez_nazwy(branch_type: object) -> str:
    """Opis rodzaju gałęzi bez nazwy (typ ENM → polska nazwa rodzaju)."""
    return NAZWA_GALEZI_BEZ_NAZWY.get(str(branch_type), NAZWA_ELEMENTU_BEZ_NAZWY["branches"])


def opis_bez_nazwy(kolekcja: str, element: object = None) -> str:
    """Opis rodzaju elementu kolekcji `kolekcja` (gałąź wg typu, przekładnik wg rodzaju)."""
    if kolekcja == "branches" and element is not None:
        return nazwa_galezi_bez_nazwy(_pole(element, "type"))
    if kolekcja == "measurements" and element is not None:
        rodzaj = str(_pole(element, "measurement_type") or "")
        if rodzaj in NAZWA_PRZEKLADNIKA_BEZ_NAZWY:
            return NAZWA_PRZEKLADNIKA_BEZ_NAZWY[rodzaj]
    return NAZWA_ELEMENTU_BEZ_NAZWY.get(kolekcja, "Element bez nazwy")


def nazwa_elementu(element: object, kolekcja: str) -> str:
    """Nazwa elementu z modelu albo opis rodzaju, gdy nazwy brak lub jest pusta."""
    return nazwa_nadana_elementu(element) or opis_bez_nazwy(kolekcja, element)


def _elementy_migawki(model: object) -> Iterator[tuple[str, str, object]]:
    """`(kolekcja, ref_id, element)` każdego elementu migawki w kolejności `_KOLEKCJE_INDEKSU`.

    Jedno przejście dla indeksu nazw i wyszukania po identyfikatorze — oba widzą ten sam zbiór
    elementów w tej samej kolejności (przy niedozwolonym duplikacie wygrywa pierwszy).
    """
    if model is None:
        return
    for kolekcja in _KOLEKCJE_INDEKSU:
        elementy = _pole(model, kolekcja)
        if not isinstance(elementy, list | tuple):
            continue
        for element in elementy:
            ref = _pole(element, "ref_id")
            if ref:
                yield kolekcja, str(ref), element


def zbuduj_indeks_nazw(model: object) -> dict[str, str]:
    """Indeks `ref_id -> nazwa pokazywana` wszystkich elementów migawki (deterministycznie).

    `model` to migawka ENM jako słownik albo `EnergyNetworkModel`; `None` daje pusty indeks.
    """
    indeks: dict[str, str] = {}
    for kolekcja, ref, element in _elementy_migawki(model):
        indeks.setdefault(ref, nazwa_elementu(element, kolekcja))
    return indeks


def nazwa_nadana_po_identyfikatorze(model: object, element_ref: object) -> str | None:
    """Nazwa nadana elementowi o identyfikatorze `element_ref` albo `None` (elementu nie ma
    w migawce albo nie ma nazwy). Postać dla zdań komunikatów, które same dobierają słowo
    rodzaju (`slownik_komunikatow.opis_elementu`); etykiety wyników używają
    `nazwa_po_identyfikatorze` (opis rodzaju albo jawny brak elementu)."""
    if not isinstance(element_ref, str) or not element_ref:
        return None
    for _kolekcja, ref, element in _elementy_migawki(model):
        if ref == element_ref:
            return nazwa_nadana_elementu(element)
    return None


#: Pola nazwy pozycji katalogu w kolejności pierwszeństwa (typy katalogu niosą `name`,
#: część typów i szablonów — wyłącznie `name_pl`).
_POLA_NAZWY_POZYCJI_KATALOGU: tuple[str, ...] = ("name", "name_pl")


def nazwa_nadana_pozycji_katalogu(pozycja: object) -> str | None:
    """Nazwa pozycji katalogu (rekord-słownik albo typ katalogu) albo `None` — nigdy jej
    identyfikator."""
    if pozycja is None:
        return None
    for pole in _POLA_NAZWY_POZYCJI_KATALOGU:
        nazwa = nazwa_nadana(_pole(pozycja, pole))
        if nazwa is not None:
            return nazwa
    return None


def nazwa_pozycji_katalogu(rekord: object) -> str:
    """Nazwa pozycji katalogu albo opis braku („Pozycja katalogu bez nazwy") — nigdy `id`."""
    return nazwa_nadana_pozycji_katalogu(rekord) or POZYCJA_KATALOGU_BEZ_NAZWY


def nazwy_wezlow_grafu(raw_result: Mapping[str, Any] | None) -> dict[str, str]:
    """Nazwa każdego węzła grafu wyniku biegu (klucz: identyfikator węzła grafu).

    `raw_result` to artefakt biegu z grafem (`raw_result["graph"]["nodes"]`). Nazwa węzła
    grafu pochodzi z modelu (mapowanie ENM → graf); węzeł bez nazwy dostaje opis rodzaju
    („Szyna bez nazwy") — nigdy identyfikator węzła grafu ani elementu. Ta sama reguła co
    kolumna `name` tabel wyników szyn i zwarć.
    """
    graf = _pole(raw_result, "graph") if raw_result is not None else None
    wezly = _pole(graf, "nodes") if graf is not None else None
    if not isinstance(wezly, Mapping):
        return {}
    wynik: dict[str, str] = {}
    for identyfikator, wezel in wezly.items():
        if not isinstance(wezel, Mapping):
            continue
        wynik[str(identyfikator)] = nazwa_nadana(wezel.get("name")) or opis_bez_nazwy("buses")
    return wynik


def opis_galezi_grafu_bez_nazwy(wpis: Mapping[str, Any]) -> str:
    """Opis rodzaju gałęzi grafu wyniku bez nazwy (transformator albo gałąź) — nigdy klucz
    grafu ani identyfikator elementu."""
    if wpis.get("element_type") == "TRANSFORMER":
        return opis_bez_nazwy("transformers")
    return opis_bez_nazwy("branches")


def nazwy_galezi_grafu(raw_result: Mapping[str, Any] | None) -> dict[str, str]:
    """Nazwa każdej gałęzi grafu wyniku biegu (klucz: identyfikator gałęzi grafu) —
    nazwa z modelu albo opis rodzaju (`opis_galezi_grafu_bez_nazwy`), nigdy identyfikator."""
    graf = _pole(raw_result, "graph") if raw_result is not None else None
    galezie = _pole(graf, "branches") if graf is not None else None
    if not isinstance(galezie, Mapping):
        return {}
    wynik: dict[str, str] = {}
    for identyfikator, wpis in galezie.items():
        if not isinstance(wpis, Mapping):
            continue
        wynik[str(identyfikator)] = nazwa_nadana(wpis.get("name")) or opis_galezi_grafu_bez_nazwy(
            wpis
        )
    return wynik


def nazwa_po_identyfikatorze(
    element_ref: object,
    model: object = None,
    *,
    indeks: Mapping[str, str] | None = None,
    spoza_modelu: str = ELEMENT_SPOZA_MODELU,
) -> str:
    """Nazwa elementu o podanym identyfikatorze; identyfikator nieobecny w migawce daje
    `spoza_modelu` (jawny brak), nigdy siebie samego.

    `indeks` pozwala nie przebudowywać mapy przy wielu odpytaniach tej samej migawki.
    """
    mapa = indeks if indeks is not None else zbuduj_indeks_nazw(model)
    if element_ref is None:
        return spoza_modelu
    return mapa.get(str(element_ref), spoza_modelu)


def nazwa_pola_ze_specyfikacji(
    spec: Mapping[str, Any], nazwy_elementow_pol: Mapping[object, object]
) -> str:
    """Nazwa pola SN opisanego specyfikacją stacji (`meta.field_specs`) — JEDNA reguła dla
    operacji (nazwy przekładników, zabezpieczeń, komunikaty), read-modelu pola i oceny LoM.

    Kolejność źródeł: nazwa specyfikacji; nazwa elementu pola, który specyfikacja opisuje
    (`bay_ref` — operacje stacji nadają nazwę elementowi, a specyfikacja jej nie powiela);
    polska nazwa roli z kanonu ról pól SN (`enm.rola_pola_sn`, karta #141). Nigdy
    identyfikator pola (karta #144). `nazwy_elementow_pol`: `Bay.ref_id → Bay.name`.
    """
    return (
        nazwa_nadana(spec.get("name"))
        or nazwa_nadana(nazwy_elementow_pol.get(spec.get("bay_ref")))
        or nazwa_roli_pola_sn(spec.get("field_role") or spec.get("bay_role"))
    )
