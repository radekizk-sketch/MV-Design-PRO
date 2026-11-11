#!/usr/bin/env python3
"""Tabela posuwów znaków krojów schematu SLD v3 — JEDNO źródło metryk tekstu.

Karta UX-04/POLE-LINIOWE-WZORZEC (decyzja architekta §11.7 pkt 7): szacunek szerokości tekstu
„0,62 em na znak” zastępuje tabela posuwów znaków kroju, wspólna dla pomiaru etykiet kanwy
(``frontend/src/ui/sld/v3/core/text.ts`` → ``measureTextWidth``), zawijania etykiet widoku
domeny nN (``ui/sld/v3/lv-domain/visualGrammar.ts`` → ``zawinNazwe``) i importera symboli QET
(``scripts/import_qet_pole_sn.py`` → ``szerokosc_tekstu``). Dwa kroje, każdy w odmianach 400
(zwykła) i 700 (pogrubiona):

* ``sans`` — Liberation Sans, zgodny metrycznie z Arial (ten sam posuw każdego znaku): tekst
  schematu (``SLD_FONT_FAMILY``);
* ``mono`` — Liberation Mono, zgodny metrycznie z Courier New: wartości liczbowe widoku domeny
  nN (``SLD_FONT_FAMILY_MONO``).

Kanwa rysuje tekst tymi krojami bez kerningu, więc posuw z tabeli jest szerokością tekstu na
ekranie, a nie szacunkiem.

Wejście: pliki TTF krojów (``/usr/share/fonts/truetype/liberation``, pakiet ``fonts-liberation``).
Plik TTF czytany jest bez zależności zewnętrznych: tabele ``head`` (jednostki em, format
``loca``), ``hhea`` (wznoszenie i zejście kroju, liczba metryk poziomych), ``hmtx`` (posuwy),
``cmap`` (format 4, Unicode BMP), ``maxp``, ``loca`` i ``glyf`` (pionowy zasięg tuszu każdego
glifu: ``yMin``/``yMax`` nagłówka glifu). Pionowe metryki służą położeniu litery symbolu
rysowanej z ``dominant-baseline: central`` (środek pudełka em: (wznoszenie − zejście)/2 nad
linią bazową) i sprawdzeniu, że tusz litery mieści się w rysunku symbolu (karta
UX-04/POLE-LINIOWE-WZORZEC, decyzja §11.7 pkt 5: litery symboli ≥ 8 px bez nakładania na
kreskę). Zestaw znaków
kroju: bloki Unicode etykiet schematu (ASCII, Latin-1, Latin Extended-A — polskie litery, greka,
interpunkcja ogólna, indeksy, symbole literowe, strzałki, operatory matematyczne), wyłącznie
znaki obecne w obu odmianach kroju.

Uruchomienie z katalogu ``mv-design-pro``::

    python scripts/metryki_kroju_sld.py            # zapis tabeli JSON
    python scripts/metryki_kroju_sld.py --sprawdz  # rc=1, gdy tabela różni się od krojów
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

KORZEN = Path(__file__).resolve().parents[1]
WYJSCIE = KORZEN / "frontend" / "src" / "ui" / "sld" / "v3" / "core" / "metrykiKroju.json"
KATALOG_KROJU = Path("/usr/share/fonts/truetype/liberation")
#: Krój schematu → (nazwa kroju, krój zgodny metrycznie, odmiana CSS font-weight → plik kroju).
#: Waga 600 etykiet (`LABEL_TYPOGRAPHY`) dobiera w CSS najbliższą cięższą odmianę kroju
#: (CSS Fonts 4 §5.2: waga > 500 → najpierw cięższe) — 700.
KROJE: dict[str, tuple[str, str, dict[str, str]]] = {
    "sans": (
        "Liberation Sans",
        "Arial",
        {"400": "LiberationSans-Regular.ttf", "700": "LiberationSans-Bold.ttf"},
    ),
    "mono": (
        "Liberation Mono",
        "Courier New",
        {"400": "LiberationMono-Regular.ttf", "700": "LiberationMono-Bold.ttf"},
    ),
}
#: Bloki Unicode etykiet schematu (zakresy domknięte).
BLOKI: tuple[tuple[int, int, str], ...] = (
    (0x0020, 0x007E, "ASCII"),
    (0x00A0, 0x00FF, "Latin-1"),
    (0x0100, 0x017F, "Latin Extended-A (polskie litery)"),
    (0x0370, 0x03FF, "greka (φ, Δ, Ω, μ)"),
    (0x2000, 0x206F, "interpunkcja ogólna (·, –, „, ”, …)"),
    (0x2070, 0x209F, "indeksy górne i dolne"),
    (0x2100, 0x214F, "symbole literowe (Ω, ℃)"),
    (0x2190, 0x21FF, "strzałki"),
    (0x2200, 0x22FF, "operatory matematyczne (≤, ≥, √)"),
)
#: Posuw znaku spoza tabeli [em] — 1 em (zachowawczo: szerszy niż każdy znak łaciński kroju),
#: deterministyczny; tekst schematu z takim znakiem ma szerokość górną, nie niedoszacowaną.
POSUW_SPOZA_TABELI_EM = 1.0
#: Jednostki em obu krojów Liberation (tabela ``head``) — wspólna podstawa posuwów tabeli.
JEDNOSTKI_EM = 2048


class BladKroju(ValueError):
    """Plik kroju poza obsługiwanym podzbiorem formatu TrueType."""


def _tabele(dane: bytes) -> dict[str, tuple[int, int]]:
    (liczba,) = struct.unpack_from(">H", dane, 4)
    tabele: dict[str, tuple[int, int]] = {}
    for i in range(liczba):
        znacznik, _suma, poczatek, dlugosc = struct.unpack_from(">4sIII", dane, 12 + 16 * i)
        tabele[znacznik.decode("latin-1")] = (poczatek, dlugosc)
    for wymagana in ("head", "hhea", "hmtx", "cmap", "maxp", "loca", "glyf"):
        if wymagana not in tabele:
            raise BladKroju(f"brak tabeli {wymagana!r}")
    return tabele


def _cmap_bmp(dane: bytes, poczatek: int) -> dict[int, int]:
    """Mapa kod znaku → numer glifu z podtabeli formatu 4 (platforma 3, kodowanie 1)."""
    (_wersja, liczba) = struct.unpack_from(">HH", dane, poczatek)
    for i in range(liczba):
        platforma, kodowanie, przesuniecie = struct.unpack_from(">HHI", dane, poczatek + 4 + 8 * i)
        if (platforma, kodowanie) != (3, 1):
            continue
        p = poczatek + przesuniecie
        (format_,) = struct.unpack_from(">H", dane, p)
        if format_ != 4:
            raise BladKroju(f"podtabela cmap (3, 1) w formacie {format_}, oczekiwano 4")
        (seg_x2,) = struct.unpack_from(">H", dane, p + 6)
        seg = seg_x2 // 2
        konce = struct.unpack_from(f">{seg}H", dane, p + 14)
        poczatki = struct.unpack_from(f">{seg}H", dane, p + 16 + seg_x2)
        delty = struct.unpack_from(f">{seg}h", dane, p + 16 + 2 * seg_x2)
        adres_przes = p + 16 + 3 * seg_x2
        przesuniecia = struct.unpack_from(f">{seg}H", dane, adres_przes)
        mapa: dict[int, int] = {}
        for k in range(seg):
            for kod in range(poczatki[k], konce[k] + 1):
                if kod == 0xFFFF:
                    continue
                if przesuniecia[k] == 0:
                    glif = (kod + delty[k]) & 0xFFFF
                else:
                    adres = adres_przes + 2 * k + przesuniecia[k] + 2 * (kod - poczatki[k])
                    (glif,) = struct.unpack_from(">H", dane, adres)
                    if glif != 0:
                        glif = (glif + delty[k]) & 0xFFFF
                if glif != 0:
                    mapa[kod] = glif
        return mapa
    raise BladKroju("brak podtabeli cmap (3, 1)")


def posuwy_kroju(plik: Path) -> tuple[int, dict[int, int]]:
    """(jednostki em, mapa kod znaku → posuw [jednostki em]) pliku TTF."""
    dane = plik.read_bytes()
    tabele = _tabele(dane)
    (jednostki_em,) = struct.unpack_from(">H", dane, tabele["head"][0] + 18)
    (liczba_metryk,) = struct.unpack_from(">H", dane, tabele["hhea"][0] + 34)
    hmtx = tabele["hmtx"][0]
    posuwy_glifow = [struct.unpack_from(">H", dane, hmtx + 4 * i)[0] for i in range(liczba_metryk)]
    mapa = _cmap_bmp(dane, tabele["cmap"][0])
    wynik = {kod: posuwy_glifow[min(glif, liczba_metryk - 1)] for kod, glif in mapa.items()}
    return jednostki_em, wynik


def zasiegi_pionowe_kroju(plik: Path) -> tuple[tuple[int, int], dict[int, tuple[int, int]]]:
    """((wznoszenie, zejście) kroju z ``hhea`` [jednostki em, zejście dodatnie w dół], mapa kod
    znaku → (yMin, yMax) tuszu glifu z nagłówka ``glyf`` [jednostki em, y w górę od linii
    bazowej]); glif bez konturów (spacja) ma zasięg (0, 0)."""
    dane = plik.read_bytes()
    tabele = _tabele(dane)
    (format_loca,) = struct.unpack_from(">h", dane, tabele["head"][0] + 50)
    (wznoszenie, zejscie) = struct.unpack_from(">hh", dane, tabele["hhea"][0] + 4)
    (liczba_glifow,) = struct.unpack_from(">H", dane, tabele["maxp"][0] + 4)
    loca = tabele["loca"][0]
    if format_loca == 0:
        adresy = [2 * a for a in struct.unpack_from(f">{liczba_glifow + 1}H", dane, loca)]
    elif format_loca == 1:
        adresy = list(struct.unpack_from(f">{liczba_glifow + 1}I", dane, loca))
    else:
        raise BladKroju(f"format loca {format_loca} nieznany")
    glyf = tabele["glyf"][0]

    def zasieg(glif: int) -> tuple[int, int]:
        if glif >= liczba_glifow or adresy[glif + 1] == adresy[glif]:
            return (0, 0)
        (_kontury, _x_min, y_min, _x_max, y_max) = struct.unpack_from(
            ">hhhhh", dane, glyf + adresy[glif]
        )
        return (y_min, y_max)

    mapa = _cmap_bmp(dane, tabele["cmap"][0])
    return (wznoszenie, -zejscie), {kod: zasieg(glif) for kod, glif in mapa.items()}


def _kroj(nazwa: str, odmiany_plikow: dict[str, str], katalog: Path) -> dict[str, object]:
    odmiany: dict[str, tuple[int, dict[int, int]]] = {}
    pionowe: dict[str, tuple[tuple[int, int], dict[int, tuple[int, int]]]] = {}
    zrodla: dict[str, dict[str, str]] = {}
    for waga, plik_kroju in odmiany_plikow.items():
        plik = katalog / plik_kroju
        if not plik.is_file():
            raise BladKroju(f"brak pliku kroju {plik} (pakiet fonts-liberation)")
        odmiany[waga] = posuwy_kroju(plik)
        pionowe[waga] = zasiegi_pionowe_kroju(plik)
        zrodla[waga] = {"plik": plik_kroju, "sha256": hashlib.sha256(plik.read_bytes()).hexdigest()}
    jednostki = {em for em, _ in odmiany.values()}
    if jednostki != {JEDNOSTKI_EM}:
        raise BladKroju(
            f"krój {nazwa}: jednostki em {sorted(jednostki)}, oczekiwano {JEDNOSTKI_EM}"
        )
    kody = sorted(
        kod
        for od, do, _ in BLOKI
        for kod in range(od, do + 1)
        if all(kod in posuwy for _, posuwy in odmiany.values())
    )
    return {
        "zrodla": zrodla,
        "znaki": "".join(chr(kod) for kod in kody),
        "posuwy": {waga: [posuwy[kod] for kod in kody] for waga, (_, posuwy) in odmiany.items()},
        "pionowe": {
            waga: {
                "wznoszenie": wznoszenie_zejscie[0],
                "zejscie": wznoszenie_zejscie[1],
                "tuszDol": [zasiegi[kod][0] for kod in kody],
                "tuszGora": [zasiegi[kod][1] for kod in kody],
            }
            for waga, (wznoszenie_zejscie, zasiegi) in pionowe.items()
        },
    }


def zbuduj_tabele(katalog: Path = KATALOG_KROJU) -> dict[str, object]:
    kroje: dict[str, object] = {}
    for klucz, (nazwa, zgodny, odmiany_plikow) in KROJE.items():
        kroje[klucz] = {
            "kroj": nazwa,
            "zgodnyMetrycznieZ": zgodny,
            **_kroj(nazwa, odmiany_plikow, katalog),
        }
    return {
        "opis": (
            "Tabela posuwów znaków krojów schematu SLD v3 — PLIK GENEROWANY przez "
            "scripts/metryki_kroju_sld.py, nie edytować ręcznie. Wspólna dla pomiaru etykiet "
            "kanwy (core/text.ts), zawijania etykiet widoku domeny nN (lv-domain/visualGrammar.ts) "
            "i importera symboli QET (scripts/import_qet_pole_sn.py)."
        ),
        "jednostkiEm": JEDNOSTKI_EM,
        "posuwSpozaTabeliEm": POSUW_SPOZA_TABELI_EM,
        "bloki": [f"U+{od:04X}–U+{do:04X} {nazwa}" for od, do, nazwa in BLOKI],
        "kroje": kroje,
    }


def tekst_tabeli(tabela: dict[str, object]) -> str:
    return json.dumps(tabela, ensure_ascii=False, indent=1) + "\n"


def wczytaj_tabele(plik: Path = WYJSCIE) -> dict[str, object]:
    """Tabela zapisana w repozytorium (odczyt importera symboli i testów)."""
    return json.loads(plik.read_text(encoding="utf-8"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--sprawdz", action="store_true", help="porównaj zamiast zapisać")
    args = parser.parse_args(argv)
    tekst = tekst_tabeli(zbuduj_tabele())
    if args.sprawdz:
        obecny = WYJSCIE.read_text(encoding="utf-8") if WYJSCIE.is_file() else ""
        if obecny != tekst:
            print(f"{WYJSCIE.relative_to(KORZEN)}: tabela różni się od krojów — uruchom generator")
            return 1
        print(f"{WYJSCIE.relative_to(KORZEN)}: zgodna z krojami")
        return 0
    WYJSCIE.write_text(tekst, encoding="utf-8")
    print(f"zapisano {WYJSCIE.relative_to(KORZEN)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
