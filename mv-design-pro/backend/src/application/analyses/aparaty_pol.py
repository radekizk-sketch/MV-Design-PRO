"""Aparaty katalogowe pól stacji — JEDEN czytelnik modelu (karta KD-6).

Pytanie „jaki aparat stoi w tym polu" jest pytaniem o MODEL, nie o konkretną
analizę. Odpowiadają na nie dwie analizy naraz — werdykt wytrzymałości
(``wytrzymalosc_aparatury_pol``) i czas wyłączenia pola
(``protection/czas_wylaczenia_pola``) — więc czytelnik jest jeden. Druga
implementacja rozjechałaby się przy pierwszej zmianie kreatora stacji.

Aparat pola jest gałęzią łącznikową z wiązaniem katalogu APARAT_SN
(``insert_station_on_segment_sn`` / ``append_station_on_endpoint`` /
``add_sn_bay``, reguła B-12: wskazanie pozycji jest WYMAGANE). Referencja pola
siedzi w ``meta`` gałęzi — raz jako ``bay_ref``, raz jako ``field_ref``
(zależnie od operacji), więc czytamy oba.
"""

from __future__ import annotations

from dataclasses import dataclass

from enm.models import EnergyNetworkModel, Substation

#: Kategoria katalogu wiązana z aparatem pola SN (B-12).
NAMESPACE_APARAT_SN = "APARAT_SN"


@dataclass(frozen=True)
class AparatPola:
    """Aparat jednego pola: gałąź modelu + pozycja katalogu, z której powstał."""

    aparat_ref: str
    aparat_nazwa: str
    catalog_ref: str


def znajdz_stacje(enm: EnergyNetworkModel, station_ref: str) -> Substation | None:
    """Stacja po ``ref_id`` albo ``id`` elementu (wołający podaje raz jedno, raz drugie)."""
    return next(
        (s for s in enm.substations if station_ref in (s.ref_id, str(getattr(s, "id", "")))),
        None,
    )


def aparaty_pol_stacji(enm: EnergyNetworkModel, station: Substation) -> dict[str, list[AparatPola]]:
    """Referencja pola → aparaty katalogowe tego pola (kolejność deterministyczna)."""
    wynik: dict[str, list[AparatPola]] = {}
    for branch in enm.branches:
        if getattr(branch, "catalog_namespace", None) != NAMESPACE_APARAT_SN:
            continue
        catalog_ref = getattr(branch, "catalog_ref", None)
        if not catalog_ref:
            continue
        meta = dict(getattr(branch, "meta", None) or {})
        if meta.get("station_ref") not in (None, station.ref_id):
            continue
        pole_ref = meta.get("bay_ref") or meta.get("field_ref")
        if not isinstance(pole_ref, str) or not pole_ref:
            continue
        wynik.setdefault(pole_ref, []).append(
            AparatPola(
                aparat_ref=branch.ref_id,
                aparat_nazwa=branch.name,
                catalog_ref=str(catalog_ref),
            )
        )
    for pozycje in wynik.values():
        pozycje.sort(key=lambda p: p.aparat_ref)
    return wynik
