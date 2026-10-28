"""Wartości projektanta (``overrides``) rodzin rejestru wartości roboczych — JEDNA brama.

Zasada nr 4 (V12K-351, karta PODSTAWA-Q): projektant nadaje parametr urządzenia, którego
tabliczka nie podaje, w ``overrides`` elementu — aparat łączeniowy SN (gałąź z wiązaniem
``APARAT_SN``) i maszyna wirująca (generator rodziny rejestru ``RODZINA_MASZYNY_WG_GEN_TYPE``).
Każda droga, którą lista trafia do modelu albo jest w nim oceniana, idzie przez TĘ SAMĄ bramę:

* operacja domenowa ``update_element_parameters`` (normalizacja i odmowa przed zapisem),
* operacje topologii ``create_device`` / ``update_device`` (odmowa przed zapisem — stan końcowy
  generatora: rodzaj po zmianie, lista po zmianie),
* walidator ENM, kod E011 (model wczytany z pliku albo zapisany przed bramą — blokada biegu
  z akcją naprawczą zamiast cichego pominięcia wartości w obliczeniu).

Zakresy i parametry rodzin zna wyłącznie rejestr ``network_model.catalog.wartosci_robocze``.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from typing import Any

from network_model.catalog.wartosci_robocze import (
    PARAMETRY_APARATU_SN,
    PARAMETRY_MASZYNY,
    RODZINA_MASZYNY_WG_GEN_TYPE,
    RodzinaMaszyny,
    blad_wartosci_maszyny,
    blad_wartosci_projektanta,
)

from .slownik_komunikatow import pole

#: Przestrzeń katalogu gałęzi aparatu łączeniowego SN (nośnik wartości projektanta aparatu).
PRZESTRZEN_APARATU_SN = "APARAT_SN"


def nadpisania_wartosci_roboczych(
    surowe: object,
    *,
    opis_pl: str,
    blad_wartosci: Callable[[object, object], str | None],
    kolejnosc: Sequence[str],
) -> tuple[list[dict[str, Any]], str | None]:
    """Lista wartości projektanta w postaci znormalizowanej albo powód odmowy — JEDEN
    normalizator dla każdej rodziny rejestru wartości roboczych.

    Wpis: ``{"key": parametr rejestru, "value": liczba, "reason": napis | None}``. Klucz
    powtórzony jest odmową (dwie wartości jednego parametru to sprzeczność, nie wybór).
    Kolejność wyniku — ``kolejnosc`` rejestru (determinizm zapisu).
    """
    if not isinstance(surowe, list):
        return [], (
            f"Pole {pole('overrides', 'update_element_parameters')}: wartości projektanta "
            f"{opis_pl} podaje się jako listę wpisów {{key, value, reason}}."
        )
    po_kluczu: dict[str, dict[str, Any]] = {}
    for wpis in surowe:
        if not isinstance(wpis, dict):
            return (
                [],
                f"Wpis wartości projektanta {opis_pl} musi mieć postać {{key, value, reason}}.",
            )
        klucz = wpis.get("key")
        wartosc = wpis.get("value")
        blad = blad_wartosci(klucz, wartosc)
        if blad is not None:
            return [], blad
        if not isinstance(klucz, str) or not isinstance(wartosc, int | float):
            raise AssertionError("brama rejestru przepuściła wpis spoza kontraktu")
        if klucz in po_kluczu:
            return [], (
                f"Parametr „{klucz}” podano dwukrotnie — element ma jedną wartość parametru."
            )
        powod = wpis.get("reason")
        if powod is not None and not isinstance(powod, str):
            return [], f"Uzasadnienie wartości parametru „{klucz}” musi być tekstem."
        po_kluczu[klucz] = {
            "key": klucz,
            "value": float(wartosc),
            "reason": (powod.strip() or None) if isinstance(powod, str) else None,
        }
    return [po_kluczu[k] for k in kolejnosc if k in po_kluczu], None


def nadpisania_aparatu_sn(surowe: object) -> tuple[list[dict[str, Any]], str | None]:
    """Lista wartości projektanta aparatu SN w postaci znormalizowanej albo powód odmowy."""
    return nadpisania_wartosci_roboczych(
        surowe,
        opis_pl="aparatu SN",
        blad_wartosci=blad_wartosci_projektanta,
        kolejnosc=PARAMETRY_APARATU_SN,
    )


def nadpisania_maszyny(
    rodzina: RodzinaMaszyny, surowe: object
) -> tuple[list[dict[str, Any]], str | None]:
    """Lista wartości projektanta parametrów maszyny wirującej w postaci znormalizowanej albo
    powód odmowy — brama rejestru ``blad_wartosci_maszyny`` (ta sama co dla danej tabliczki
    przed obliczeniem)."""
    return nadpisania_wartosci_roboczych(
        surowe,
        opis_pl="maszyny",
        blad_wartosci=lambda klucz, wartosc: blad_wartosci_maszyny(rodzina, klucz, wartosc),
        kolejnosc=PARAMETRY_MASZYNY[rodzina],
    )


def rodzina_generatora(gen_type: object) -> RodzinaMaszyny | None:
    """Rodzina maszyny wirującej rodzaju generatora (``None`` — to nie maszyna wirująca)."""
    return RODZINA_MASZYNY_WG_GEN_TYPE.get(str(gen_type or ""))


def nadpisania_generatora(
    gen_type: object, surowe: object, *, opis_pl: str
) -> tuple[list[dict[str, Any]], str | None]:
    """Wartości projektanta generatora na STANIE KOŃCOWYM (rodzaj i lista po zmianie).

    Generator bez modelu maszyny wirującej nie ma żadnego konsumenta wartości projektanta
    (kontrolka bez backendu jest zakazana) — niepusta lista to odmowa. Zmiana rodzaju z maszyny
    synchronicznej na asynchroniczną sprawdza zapisane wartości względem rodziny NOWEGO rodzaju
    (x″d nie jest parametrem maszyny asynchronicznej).
    """
    rodzina = rodzina_generatora(gen_type)
    if rodzina is None:
        if surowe:
            return [], (
                f"{opis_pl} nie jest maszyną wirującą — wartości projektanta parametrów "
                "zwarciowych dotyczą generatora synchronicznego i maszyny asynchronicznej "
                "(klatkowej albo dwustronnie zasilanej); usuń je albo zmień rodzaj źródła."
            )
        return [], None
    return nadpisania_maszyny(rodzina, surowe)


def blad_wartosci_projektanta_elementu(
    kolekcja: str, element: Mapping[str, Any], *, opis_pl: str
) -> str | None:
    """Powód, dla którego ``overrides`` elementu (stan końcowy, postać JSON) nie przechodzi
    bramy rodziny, albo ``None``. Elementy spoza obu nośników (transformator, odbiór, gałąź
    bez wiązania aparatu) — ``None``: ich ``overrides`` należą do innego mechanizmu.

    Woła ją każda droga zapisu (operacje topologii) i walidator ENM (E011). Generator spoza
    maszyn wirujących z niepustą listą to odmowa zapisu; walidator pomija go jawnie
    (``rodzina_generatora``), bo żaden tor obliczeń tej listy nie czyta — blokada biegu nie
    miałaby skutku obliczeniowego ani akcji naprawczej w kreatorze.
    """
    nadpisania = list(element.get("overrides") or [])
    if kolekcja == "generators":
        return nadpisania_generatora(element.get("gen_type"), nadpisania, opis_pl=opis_pl)[1]
    if kolekcja == "branches" and element.get("catalog_namespace") == PRZESTRZEN_APARATU_SN:
        return nadpisania_aparatu_sn(nadpisania)[1]
    return None
