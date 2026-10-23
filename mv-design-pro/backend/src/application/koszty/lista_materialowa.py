"""Koszt listy materiałowej toru DER-SN (karta W10-2a) — sekcja ``koszt`` widoku BOM.

Jedyny dziś konsument cennika na ścieżce użytkownika: widok listy materiałowej
(``GET /api/der-sn/{case_id}/bom``, panel podsumowania kreatora źródła OZE) niesie sekcję
``koszt``: wycenę (``status: WYCENIONE``) albo rekord gotowości z odmową nazwaną
(``status: BRAK_CENNIKA``, kod w polu ``kod``, lista ``type_id``). Pozycja bez ilości (np. kabel
bez długości w modelu) daje ``status: BRAK_ILOSCI`` — wycena bez ilości byłaby cichym zerem.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from application.koszty.wycena import (
    PozycjaDoWyceny,
    gotowosc_kosztow,
    wycen_liste_materialowa,
)
from catalog.cenniki import Cennik
from network_model.nazwy import nazwa_nadana

KOD_BRAK_ILOSCI = "BRAK_ILOSCI_POZYCJI"


def _ilosc(wartosc: object) -> float | None:
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    return float(wartosc)


def koszt_listy_materialowej(
    pozycje_bom: Sequence[Mapping[str, Any]], cennik: Cennik | None
) -> dict[str, Any]:
    """Sekcja ``koszt`` widoku BOM: wycena albo nazwany brak (nigdy zero)."""
    ilosci = [_ilosc(pozycja.get("ilosc")) for pozycja in pozycje_bom]
    bez_ilosci = sorted(
        str(pozycja.get("element"))
        for pozycja, ilosc in zip(pozycje_bom, ilosci, strict=True)
        if ilosc is None
    )
    if bez_ilosci:
        return {
            "status": "BRAK_ILOSCI",
            "kod": KOD_BRAK_ILOSCI,
            "komunikat_pl": (
                "Nie można wyznaczyć kosztu listy materiałowej: brak ilości dla pozycji: "
                f"{', '.join(bez_ilosci)}. Uzupełnij dane elementów w modelu."
            ),
            "pozycje_bez_ilosci": bez_ilosci,
        }
    pozycje = [
        PozycjaDoWyceny(
            nazwa_pl=str(pozycja.get("element")),
            type_id=(str(pozycja["catalog_ref"]) if pozycja.get("catalog_ref") else None),
            ilosc=ilosc,
            jednostka=str(pozycja.get("jednostka")),
            typ_nazwa_pl=nazwa_nadana(pozycja.get("typ_nazwa")),
        )
        for pozycja, ilosc in zip(pozycje_bom, ilosci, strict=True)
        if ilosc is not None
    ]
    gotowosc = gotowosc_kosztow(pozycje, cennik, "BOM")
    if gotowosc.status != "GOTOWE":
        return gotowosc.to_dict()
    return wycen_liste_materialowa(pozycje, cennik).to_dict()
