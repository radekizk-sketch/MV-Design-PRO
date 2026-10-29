"""Zgodność szablonu pola z polem — JEDNA reguła dla operacji, kreatora, walidatora i filtra API.

Trzy reguły dopuszczalności szablonu pola liniowego GPZ, każda z własnym kodem i podstawą,
wszystkie z liścia `network_model.catalog.bay_templates`:

* WYKONANIE ŁĄCZNIKÓW × IZOLACJA (W046, ``pole.wykonanie_lacznikow_niezgodne_z_izolacja``) —
  rozdzielnica z izolacją powietrzną dopuszcza wyłącznie wyłącznik stały z odłącznikiem
  szynowym albo wyłącznik poziomo wysuwny (ENEA Zeszyt 1, §13, druk s.23–25). Nośniki: szablon
  pola (`Bay.bay_template_ref` → `BayTemplate.wykonanie_lacznikow`) i rodzina rozdzielnicy
  (`Bay.switchgear_family_ref` → `SwitchgearFamily.insulation_type` — jedno źródło medium
  izolacyjnego pola);
* SZABLON GPZ POZA GPZ (W047, ``pole.szablon_tylko_gpz``) — wzorce Z.10/Z.11.1/Z.11 opisują
  pola rozdzielni SN stacji 110 kV/SN (`BayTemplate.tylko_gpz`); pole GPZ = pole sekcji GPZ
  (`Bay.gpz_section_id`, ten sam predykat, którym operacje dobierają szablon domyślny);
* KLASA POLA × WYKONANIE (W048, ``pole.klasa_pola_niezgodna_z_wykonaniem``) — klasa z generacją
  (mieszana, dedykowana wytwórcy; IRiESD II.4.5.4.2.2–2.3) dopuszcza wyłącznie Z.11.1 i Z.11
  (`Bay.klasa_pola` × `BayTemplate.wykonanie_pola`).

Pole bez szablonu z daną osią albo bez rodziny/klasy nie ma czego oceniać (ZASADA NR 4).
Strażnik operacji (`nowe_niezgodnosci_szablonu`) porównuje model przed i po operacji —
odmowa dotyczy niezgodności, których przed operacją nie było (ten sam klucz). Reguły nie zależą
od stanu obiektu: opisują pole, którego wzorzec nie przewiduje, a nie wybór projektowy.
Walidator modelu raportuje wszystkie niezgodności. Filtr szablonów API
(`odmowy_szablonu_dla_pola`) liczy TE SAME zdania dla szablonu jeszcze niewybranego.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from network_model.catalog.bay_templates import (
    BAY_TEMPLATE_REGISTRY,
    KOD_ODMOWY_KLASY_POLA,
    KOD_ODMOWY_SZABLONU_TYLKO_GPZ,
    KOD_ODMOWY_WYKONANIA_LACZNIKOW,
    BayTemplate,
    odmowa_klasy_pola,
    odmowa_szablonu_tylko_gpz,
    odmowa_wykonania_lacznikow_w_izolacji,
)

from .slownik_komunikatow import opis_elementu

__all__ = [
    "AKCJA_NAPRAWCZA_SZABLONU_PL",
    "KODY_WALIDATORA_SZABLONU",
    "NiezgodnoscSzablonuPola",
    "czy_pole_gpz",
    "niezgodnosci_szablonu",
    "nowe_niezgodnosci_szablonu",
    "odmowy_szablonu_dla_pola",
]

#: Kod odmowy operacji → kod walidatora modelu (kanon gotowości w `domain.readiness_bridge`).
KODY_WALIDATORA_SZABLONU: dict[str, str] = {
    KOD_ODMOWY_WYKONANIA_LACZNIKOW: "W046",
    KOD_ODMOWY_SZABLONU_TYLKO_GPZ: "W047",
    KOD_ODMOWY_KLASY_POLA: "W048",
}

AKCJA_NAPRAWCZA_SZABLONU_PL: dict[str, str] = {
    KOD_ODMOWY_WYKONANIA_LACZNIKOW: (
        "zmień wykonanie łączników pola albo rodzinę rozdzielnicy na zgodną z izolacją"
    ),
    KOD_ODMOWY_SZABLONU_TYLKO_GPZ: "wybierz szablon pola stacji SN",
    KOD_ODMOWY_KLASY_POLA: "wybierz wykonanie Z.11.1 albo Z.11 albo zmień klasę pola",
}


@dataclass(frozen=True)
class NiezgodnoscSzablonuPola:
    """Niezgodność szablonu pola z polem: kod reguły, pole, klucz (przed/po) i zdanie."""

    kod: str
    bay_ref: str
    klucz: tuple[str, ...]
    komunikat_pl: str


def _napis(wartosc: object) -> str | None:
    return wartosc.strip() if isinstance(wartosc, str) and wartosc.strip() else None


def czy_pole_gpz(pole: Mapping[str, Any]) -> bool:
    """Pole rozdzielni GPZ = pole sekcji GPZ (`Bay.gpz_section_id`)."""
    return _napis(pole.get("gpz_section_id")) is not None


def odmowy_szablonu_dla_pola(
    szablon: BayTemplate,
    *,
    pole_gpz: bool,
    insulation_type: str | None,
    nazwa_rodziny: str,
    klasa_pola: str | None,
    opis_pola: str,
) -> list[tuple[str, str]]:
    """(kod, zdanie) każdej reguły, której szablon nie spełnia w polu o tych cechach — kolejność
    reguł stała. Wejście filtra szablonów API i reguły na rekordach modelu."""
    wynik: list[tuple[str, str]] = []
    powod = odmowa_wykonania_lacznikow_w_izolacji(
        szablon.wykonanie_lacznikow, insulation_type, nazwa_rodziny=nazwa_rodziny
    )
    if powod is not None:
        wynik.append((KOD_ODMOWY_WYKONANIA_LACZNIKOW, powod))
    powod = odmowa_szablonu_tylko_gpz(szablon.tylko_gpz, pole_gpz=pole_gpz, opis_pola=opis_pola)
    if powod is not None:
        wynik.append((KOD_ODMOWY_SZABLONU_TYLKO_GPZ, powod))
    powod = odmowa_klasy_pola(klasa_pola, szablon.wykonanie_pola, opis_pola=opis_pola)
    if powod is not None:
        wynik.append((KOD_ODMOWY_KLASY_POLA, powod))
    return wynik


def _pola(enm: Mapping[str, Any]) -> Iterable[Mapping[str, Any]]:
    for pole in enm.get("bays") or []:
        if isinstance(pole, Mapping):
            yield pole


def niezgodnosci_szablonu_pola(
    enm: Mapping[str, Any], pole: Mapping[str, Any]
) -> list[NiezgodnoscSzablonuPola]:
    """Niezgodności szablonu w jednym rekordzie pola (kolejność reguł stała)."""
    szablon = BAY_TEMPLATE_REGISTRY.get(_napis(pole.get("bay_template_ref")) or "")
    if szablon is None:
        return []
    # Import LENIWY: pakiet `switchgear` importuje szablony pól, a te — kanon ról pola z `enm`
    # (ten sam cykl, który omija `enm.gaz_fluorowany_pola`).
    from network_model.catalog.switchgear.families import SWITCHGEAR_FAMILY_REGISTRY

    bay_ref = str(pole.get("ref_id") or "")
    opis_pola = opis_elementu(dict(enm), bay_ref, "pola")
    rodzina = SWITCHGEAR_FAMILY_REGISTRY.get(_napis(pole.get("switchgear_family_ref")) or "")
    klasa = _napis(pole.get("klasa_pola"))
    return [
        NiezgodnoscSzablonuPola(
            kod=kod,
            bay_ref=bay_ref,
            klucz=(
                kod,
                bay_ref,
                szablon.template_id,
                rodzina.switchgear_family_ref if rodzina is not None else "",
                klasa or "",
            ),
            komunikat_pl=zdanie,
        )
        for kod, zdanie in odmowy_szablonu_dla_pola(
            szablon,
            pole_gpz=czy_pole_gpz(pole),
            insulation_type=rodzina.insulation_type if rodzina is not None else None,
            nazwa_rodziny=(
                f"{rodzina.family_name} {opis_pola}" if rodzina is not None else opis_pola
            ),
            klasa_pola=klasa,
            opis_pola=opis_pola,
        )
    ]


def niezgodnosci_szablonu(enm: Mapping[str, Any]) -> list[NiezgodnoscSzablonuPola]:
    """Wszystkie niezgodności w modelu (kolejność rekordów pól, potem reguł — deterministyczna)."""
    wynik: list[NiezgodnoscSzablonuPola] = []
    for pole in _pola(enm):
        wynik.extend(niezgodnosci_szablonu_pola(enm, pole))
    return wynik


def nowe_niezgodnosci_szablonu(
    przed: Mapping[str, Any], po: Mapping[str, Any]
) -> list[NiezgodnoscSzablonuPola]:
    """Niezgodności po operacji, których nie było przed nią (ten sam klucz). Strażnik KAŻDEJ
    operacji domenowej i kroku kreatora: utworzenie pola, zmiana szablonu, klasy albo rodziny
    rozdzielnicy i każda przyszła droga zapisu pola."""
    istniejace = {n.klucz for n in niezgodnosci_szablonu(przed)}
    return [n for n in niezgodnosci_szablonu(po) if n.klucz not in istniejace]
