"""Karty widmowe katalogu — budowa rekordu z kodem odmowy i karty statyczne z dokumentem.

KARTA = OSOBNY REKORD (karta AB-H0 §0.7, decyzja P8). Typ ``dziedziny.karta_widmowa.
KartaWidmowa`` jest jedynym kontraktem; ten moduł jest jego bramą katalogową:

* ``karta_widmowa_z_rekordu(rekord)`` — budowa rekordu z mapą. Naruszenie kontraktu
  jest ODMOWĄ NAZWANĄ kodem rejestru ``niezmienniki_katalogu`` (``OdmowaKatalogu``):
  identyfikator reguły z komunikatu kontraktu (``dziedziny.kanon.naruszenie``) mapuje
  ``KODY_REGUL_KARTY`` na kod ``KAT-T``; błędy typów bez identyfikatora (brak pola, zły
  literał, liczba spoza dziedziny) rozstrzyga położenie błędu. Jedno ciało reguł —
  kontrakt ``dziedziny`` — i jedna mapa na kody katalogu.
* ``wczytaj_karty_statyczne()`` — karty katalogu statycznego z tego katalogu. Każdy plik
  ``<id>.json`` ma postać ``{"karta": {…KartaWidmowa…}, "wyciag_dokumentu": {"plik":
  "<plik w tym katalogu>", "sha256": "<skrót>"}}``; karta bez wyciągu albo ze skrótem
  niezgodnym z plikiem jest odrzucana kodem ``KAT-T-041``. Karty statycznej NIE MA bez
  dokumentu producenta — zero widm „typowych” i zero widm z literatury jako danych
  urządzenia.

STAN DZISIEJSZY (pomiar 2026-09-23): katalog statyczny nie ma ani jednej karty — 0 ze
176 typów przekształtników ma w repozytorium raport badań widma. To stan uczciwy, nie
defekt: sekcja ``harmonic`` emisji każdego typu ma status ``UNKNOWN`` z nazwanym brakiem.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Mapping
from pathlib import Path
from types import MappingProxyType
from typing import Any, NoReturn

from dziedziny.kanon import reguly_w_komunikacie
from dziedziny.karta_widmowa import KartaWidmowa
from network_model.catalog.niezmienniki_katalogu import odmowa_twarda
from pydantic import ValidationError

#: Katalog kart statycznych (pliki ``*.json`` i ich wyciągi dokumentów).
KATALOG_KART = Path(__file__).resolve().parent

#: Identyfikator reguły kontraktu karty (``dziedziny.kanon.REGULY_KONTRAKTU``) → kod
#: twardej reguły katalogu. Każda reguła osiągalna z rekordu ``KartaWidmowa`` ma kod
#: (parytet przypięty testem ``tests/network_model/catalog/test_karty_widmowe_katalog.py``).
KODY_REGUL_KARTY: Mapping[str, str] = MappingProxyType(
    {
        "widmo.ksztalt": "KAT-T-009",
        "widmo.niepuste": "KAT-T-014",
        "widmo.czestotliwosc": "KAT-T-015",
        "widmo.amplituda": "KAT-T-016",
        "karta.modele_unikalne": "KAT-T-034",
        "karta.dowody": "KAT-T-035",
        "dowod.pokrywa": "KAT-T-035",
        "widmo.podstawa": "KAT-T-036",
        "widmo.faza": "KAT-T-037",
        "widmo.pomiar": "KAT-T-038",
        "widmo.przelaczanie": "KAT-T-039",
        "kanon.przedzial": "KAT-T-040",
    }
)
#: Kod odmowy karty statycznej bez dokumentu (brak wyciągu albo niezgodny skrót).
KOD_BRAKU_DOKUMENTU = "KAT-T-041"
#: Kody reguł metadanych katalogu (słowniki zamknięte statusów).
_KOD_STATUSU_WERYFIKACJI = "KAT-T-001"
_KOD_STATUSU_KATALOGU = "KAT-T-002"
#: Kod domyślny błędu kształtu rekordu (brak pola, pole spoza kontraktu, zły typ).
_KOD_KSZTALTU = "KAT-T-009"
#: Pola liczbowe częstotliwości i amplitudy — błąd typu na nich należy do reguły dziedziny.
_POLA_CZESTOTLIWOSCI = frozenset(("f_hz", "f_min_hz", "f_max_hz", "f1_hz"))

#: Kod → odmowa z tym kodem. Każde wywołanie ``odmowa_twarda`` ma kod LITERAŁEM, więc
#: strażnik ``scripts/niezmienniki_katalogu_guard.py`` sprawdza jego obecność w rejestrze.
_ODMOWY: Mapping[str, Callable[[str], NoReturn]] = MappingProxyType(
    {
        "KAT-T-001": lambda komunikat: odmowa_twarda("KAT-T-001", komunikat),
        "KAT-T-002": lambda komunikat: odmowa_twarda("KAT-T-002", komunikat),
        "KAT-T-009": lambda komunikat: odmowa_twarda("KAT-T-009", komunikat),
        "KAT-T-014": lambda komunikat: odmowa_twarda("KAT-T-014", komunikat),
        "KAT-T-015": lambda komunikat: odmowa_twarda("KAT-T-015", komunikat),
        "KAT-T-016": lambda komunikat: odmowa_twarda("KAT-T-016", komunikat),
        "KAT-T-034": lambda komunikat: odmowa_twarda("KAT-T-034", komunikat),
        "KAT-T-035": lambda komunikat: odmowa_twarda("KAT-T-035", komunikat),
        "KAT-T-036": lambda komunikat: odmowa_twarda("KAT-T-036", komunikat),
        "KAT-T-037": lambda komunikat: odmowa_twarda("KAT-T-037", komunikat),
        "KAT-T-038": lambda komunikat: odmowa_twarda("KAT-T-038", komunikat),
        "KAT-T-039": lambda komunikat: odmowa_twarda("KAT-T-039", komunikat),
        "KAT-T-040": lambda komunikat: odmowa_twarda("KAT-T-040", komunikat),
        "KAT-T-041": lambda komunikat: odmowa_twarda("KAT-T-041", komunikat),
    }
)


def _kod_bledu(blad: Mapping[str, Any]) -> str:
    """Kod ``KAT-T`` jednego wpisu ``ValidationError.errors()``."""
    reguly = reguly_w_komunikacie(str(blad.get("msg", "")))
    if reguly:
        return KODY_REGUL_KARTY.get(reguly[0], _KOD_KSZTALTU)
    polozenie = tuple(str(czlon) for czlon in blad.get("loc", ()))
    if polozenie[:1] == ("verification_status",):
        return _KOD_STATUSU_WERYFIKACJI
    if polozenie[:1] == ("catalog_status",):
        return _KOD_STATUSU_KATALOGU
    if "podstawa" in polozenie:
        return KODY_REGUL_KARTY["widmo.podstawa"]
    if polozenie and polozenie[-1] in _POLA_CZESTOTLIWOSCI:
        return KODY_REGUL_KARTY["widmo.czestotliwosc"]
    if "amplituda" in polozenie or "odniesienie_amplitudy" in polozenie:
        return KODY_REGUL_KARTY["widmo.amplituda"]
    if "pomiar" in polozenie:
        return KODY_REGUL_KARTY["widmo.pomiar"]
    if "punkt_pracy" in polozenie:
        return KODY_REGUL_KARTY["kanon.przedzial"]
    return _KOD_KSZTALTU


def kod_odmowy_karty(blad: ValidationError) -> str:
    """Kod ``KAT-T`` odmowy rekordu karty — z PIERWSZEGO błędu walidacji (kolejność
    pydantic jest deterministyczna: kolejność pól kontraktu)."""
    bledy = blad.errors()
    return _kod_bledu(bledy[0]) if bledy else _KOD_KSZTALTU


def karta_widmowa_z_rekordu(rekord: Mapping[str, Any]) -> KartaWidmowa:
    """Zbuduj kartę widmową z rekordu; naruszenie kontraktu = ``OdmowaKatalogu`` z kodem."""
    try:
        return KartaWidmowa.model_validate(dict(rekord))
    except ValidationError as blad:
        bledy = blad.errors()
        _ODMOWY[kod_odmowy_karty(blad)](
            f"Karta widmowa '{rekord.get('id')}' odrzucona — naruszenie kontraktu karty: "
            f"{bledy[0].get('msg') if bledy else blad}"
        )


def wczytaj_karty_statyczne(katalog: Path = KATALOG_KART) -> list[dict[str, Any]]:
    """Rekordy kart statycznych (posortowane po nazwie pliku) z dokumentem przypiętym SHA-256."""
    rekordy: list[dict[str, Any]] = []
    for plik in sorted(katalog.glob("*.json")):
        zawartosc = json.loads(plik.read_text(encoding="utf-8"))
        wyciag = zawartosc.get("wyciag_dokumentu") if isinstance(zawartosc, dict) else None
        if not isinstance(wyciag, dict) or not wyciag.get("plik") or not wyciag.get("sha256"):
            odmowa_twarda(
                "KAT-T-041",
                f"Karta widmowa {plik.name}: brak wyciągu dokumentu producenta "
                "(`wyciag_dokumentu.plik` i `.sha256`) — karta statyczna bez dokumentu nie "
                "istnieje.",
            )
        sciezka_wyciagu = katalog / str(wyciag["plik"])
        if not sciezka_wyciagu.is_file():
            odmowa_twarda(
                "KAT-T-041",
                f"Karta widmowa {plik.name}: wyciąg dokumentu {wyciag['plik']!r} nie istnieje.",
            )
        skrot = hashlib.sha256(sciezka_wyciagu.read_bytes()).hexdigest()
        if skrot != str(wyciag["sha256"]):
            odmowa_twarda(
                "KAT-T-041",
                f"Karta widmowa {plik.name}: skrót SHA-256 wyciągu {wyciag['plik']!r} "
                f"({skrot}) różni się od przypiętego ({wyciag['sha256']}).",
            )
        karta = zawartosc.get("karta")
        if not isinstance(karta, dict):
            odmowa_twarda("KAT-T-009", f"Karta widmowa {plik.name}: brak obiektu `karta`.")
        rekordy.append(karta)
    return rekordy


__all__ = [
    "KATALOG_KART",
    "KODY_REGUL_KARTY",
    "KOD_BRAKU_DOKUMENTU",
    "karta_widmowa_z_rekordu",
    "kod_odmowy_karty",
    "wczytaj_karty_statyczne",
]
