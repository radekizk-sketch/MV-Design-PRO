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

WARTOŚCI ROBOCZE (zasada nr 4, kontrakt werdyktu §3c, V12K-351). Parametr aparatu, którego
karta nie niesie (czas własny wyłącznika, znamiona wytrzymałości), nie blokuje analizy: JEDNO
rozstrzygnięcie ``parametry_aparatu`` zwraca dla każdego parametru wartość i pochodzenie
(projektant na elemencie modelu > karta katalogowa > propozycja rejestru
``network_model/catalog/wartosci_robocze.py``). Obie analizy — wytrzymałość i czas wyłączenia —
czytają WYŁĄCZNIE to rozstrzygnięcie; ``dana_przyjeta`` jest jedynym tłumaczeniem wartości
roboczej na daną przyjętą werdyktu (jakość ``ESTIMATED``, nigdy ``DATASHEET``).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from enm.models import EnergyNetworkModel, ParameterOverride, Substation
from network_model.catalog import get_default_mv_catalog
from network_model.catalog.types import MVApparatusType
from network_model.catalog.wartosci_robocze import (
    PARAMETRY_APARATU_SN,
    WartoscProjektanta,
    WartoscRozstrzygnieta,
    blad_wartosci_projektanta,
    rozstrzygnij_parametry_aparatu_sn,
)
from werdykt import DanaPrzyjeta, FieldQuality, Wielkosc

#: Kategoria katalogu wiązana z aparatem pola SN (B-12).
NAMESPACE_APARAT_SN = "APARAT_SN"


@dataclass(frozen=True)
class AparatPola:
    """Aparat jednego pola: gałąź modelu + pozycja katalogu, z której powstał."""

    aparat_ref: str
    aparat_nazwa: str
    catalog_ref: str
    #: Wartości nadane przez projektanta na tej gałęzi (``overrides`` z kluczami parametrów
    #: rejestru wartości roboczych), w kolejności ``PARAMETRY_APARATU_SN``.
    wartosci_projektanta: tuple[WartoscProjektanta, ...] = ()


def wartosci_projektanta(overrides: list[ParameterOverride]) -> tuple[WartoscProjektanta, ...]:
    """Wartości projektanta aparatu SN z ``overrides`` gałęzi (tylko parametry rejestru).

    Klucze spoza rejestru nie są parametrami aparatu — operacja domenowa ich nie przyjmuje.
    Wpis spoza bramy wartości (tekst, liczba poza zakresem — model wczytany z pliku, który
    ominąłby operację) nie jest wartością projektanta: TA SAMA brama co operacja domenowa
    (``blad_wartosci_projektanta``), jak dla maszyn wirujących (``wartosci_projektanta_maszyny``).
    """
    po_kluczu: dict[str, WartoscProjektanta] = {}
    for wpis in overrides:
        if blad_wartosci_projektanta(wpis.key, wpis.value) is not None:
            continue
        assert isinstance(wpis.value, int | float)
        po_kluczu[wpis.key] = WartoscProjektanta(
            parametr=wpis.key, wartosc=float(wpis.value), powod_pl=wpis.reason or None
        )
    return tuple(po_kluczu[k] for k in PARAMETRY_APARATU_SN if k in po_kluczu)


def parametry_aparatu(
    aparat: AparatPola,
) -> tuple[MVApparatusType | None, dict[str, WartoscRozstrzygnieta]]:
    """JEDNO rozstrzygnięcie parametrów aparatu: pozycja katalogu + wartość i pochodzenie.

    ``(None, {})`` — pozycji nie ma w katalogu (aparat spoza katalogu: brak MODELU, nie brak
    parametru urządzenia).
    """
    pozycja = get_default_mv_catalog().get_mv_apparatus_type(aparat.catalog_ref)
    if pozycja is None:
        return None, {}
    projektant = {w.parametr: w for w in aparat.wartosci_projektanta}
    return pozycja, rozstrzygnij_parametry_aparatu_sn(pozycja, projektant)


def dana_przyjeta(zapis: Mapping[str, Any], *, aparat_pl: str) -> DanaPrzyjeta:
    """Wartość robocza jako dana przyjęta werdyktu (§3c pkt 4): ``ESTIMATED`` + źródło i wpływ.

    Wejście to zapis ``WartoscRozstrzygnieta.to_dict()`` — ta sama postać, którą niesie
    odpowiedź (rozbicie czasu wyłączenia, znamiona), więc tłumaczenie jest jedno dla obu analiz.
    Dana karty katalogowej nie jest daną przyjętą — wywołanie dla niej jest błędem PROGRAMU
    (wołającego), nie odmową dziedziny, stąd ``AssertionError``.
    """
    wartosc = zapis.get("wartosc")
    if not zapis.get("wartosc_robocza") or not isinstance(wartosc, int | float):
        raise AssertionError(
            f"Parametr {zapis.get('parametr')} nie jest wartością roboczą — dana karty "
            "katalogowej nie jest daną przyjętą."
        )
    return DanaPrzyjeta(
        nazwa_pl=f"{zapis['nazwa_pl']} ({aparat_pl})",
        wartosc=Wielkosc(wartosc=float(wartosc), jednostka=str(zapis["jednostka"])),
        powod_pl=str(zapis["opis_zrodla_pl"]),
        jakosc=FieldQuality.ESTIMATED,
    )


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
                wartosci_projektanta=wartosci_projektanta(list(branch.overrides)),
            )
        )
    for pozycje in wynik.values():
        pozycje.sort(key=lambda p: p.aparat_ref)
    return wynik
