#!/usr/bin/env python3
"""Importer symboli QElectroTech EN 60617 pola liniowego SN -> geometria TS schematu SLD v3.

Karta UX-04/POLE-LINIOWE-WZORZEC. Wejście: niezmienione pliki ``.elmt`` z
``docs/sld/vendor/qet`` i manifest ``docs/sld/vendor/qet/import_manifest.json``.
Wyjście: ``frontend/src/ui/sld/v3/cad/qet/qetPoleSn.ts`` (plik generowany,
nie edytuje się go ręcznie).

Zasady (fail-closed — każde odstępstwo przerywa import z komunikatem):

* źródło jest daną niezaufaną: czytany jest WYŁĄCZNIE XML z dopuszczonym podzbiorem
  prymitywów (``line``, ``polygon``, ``ellipse`` o równych osiach, ``arc``, ``text``),
  zaciskami ``terminal`` i ignorowanymi bez skutku ``dynamic_text``/``input``; DTD,
  encje, skrypty i bitmapy są odrzucane;
* SHA bloba git każdego pliku musi być równe ``upstreamBlobSha`` z manifestu (plik nie
  został zmieniony po pobraniu z ``qelectrotech-elements``);
* geometria nie jest przerysowywana: prymitywy źródła są przenoszone 1:1, a manifest
  podaje wyłącznie złożenie (obrót o wielokrotność 90° i przesunięcie składnika), które
  prymitywy tworzą nóż łącznika, przegub i styk stały, oraz które zaciski są portami;
* tekst źródła ma jawną decyzję (``pomin``/``zachowaj``) — tekst bez decyzji przerywa import;
* każdy zacisk źródła jest portem, zaciskiem wewnętrznym złożenia albo zaciskiem spoza toru
  pierwotnego zadeklarowanym z powodem (``zaciskiPozaTorem``, np. uzwojenie wtórne
  przekładnika napięciowego); zaciski wewnętrzne muszą się pokrywać po złożeniu;
* położenia łącznika: rysunek źródła = OTWARTY; ZAMKNIĘTY/UZIEMIONY = obrót prymitywów noża
  wokół przegubu na kierunek styku stałego i ZASIĘG noża równy odległości przegub–styk (koniec
  noża leży na styku stałym: nóż źródła odłącznika jest dłuższy od odległości do styku, więc
  obrócony sztywno przechodził przez kreskę styku i odłącznik zamknięty czytał się jak krzyżyk
  „+” — decyzja architekta 2026-10-30, karta UX-04/POLE-LINIOWE-WZORZEC); OTWARTY = rysunek
  źródła albo obrót noża na jawny kierunek z powodem (``otwarty``); NIEZNANY = połowa drogi
  między położeniem otwartym a zamkniętym, z zasięgiem źródła — położenie pośrednie różne od
  każdego położenia pewnego, także w łączniku trójpołożeniowym (uwaga właściciela 2026-10-30:
  geometria noża wynika wyłącznie ze stanu; dawna opcja „nieznany jak otwarty" skasowana);
* jednokładność rysunku (``skalaRysunku``: skala k ∈ (1; 4] wokół punktu, z powodem) i skala
  lokalna prymitywów (``skalaLokalna``: znak rodzaju aparatu, doprowadzenie obwodu wtórnego)
  przenoszą kształt źródła bez zmian; stopień glifu (wysokość rysunku aparatu / bok kafla
  stanu) musi leżeć w zakresie ``stopienSymboli`` — kafel [0,55; 0,70], tor [0,33; 0,70];
* role prymitywów: przewód (linia z zacisku portu w kierunku portu), glif (rysunek aparatu)
  i osprzęt (napęd, cewka — deklaracja ``osprzet``); przewody przycinane do gabarytu;
* gabaryt: obwiednia rysunku aparatu (wszystkie położenia noża), osprzętu i portów obwodu
  wtórnego, symetryczna względem osi toru (port ``bottom``, a bez niego ``top``) i domknięta
  do rastru zacisków QET (20 j.) od pierwszego portu, więc po skali 0,4 porty i gabaryt leżą
  na siatce schematu GRID = 8; łącznik z nożem — jednolity kwadratowy kafel stanu.

Uruchomienie z katalogu ``mv-design-pro``::

    python scripts/import_qet_pole_sn.py            # zapis pliku TS
    python scripts/import_qet_pole_sn.py --sprawdz  # rc=1, gdy plik różni się od generatora
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

KORZEN = Path(__file__).resolve().parents[1]
MANIFEST = KORZEN / "docs" / "sld" / "vendor" / "qet" / "import_manifest.json"
ZRODLA = KORZEN / "docs" / "sld" / "vendor" / "qet"

MAX_BAJTOW = 200_000
MAX_WSPOLRZEDNA = 10_000.0
FIGURY = {"line", "polygon", "rect", "ellipse", "arc", "text"}
#: Styl kreski źródła: ciągła albo przerywana (``dashed`` — dopuszczona WYŁĄCZNIE dla linii,
#: np. sprzężenie mechaniczne napędu EN 60617 02-13-26); każdy inny przerywa import.
STYLE_KRESKI = {"normal", "dashed"}
IGNOROWANE = {"dynamic_text", "input"}
KIERUNKI = {"n": "N", "s": "S", "e": "E", "w": "W"}
OBROT_KIERUNKU = {
    0: {"N": "N", "E": "E", "S": "S", "W": "W"},
    90: {"N": "E", "E": "S", "S": "W", "W": "N"},
    180: {"N": "S", "E": "W", "S": "N", "W": "E"},
    -90: {"N": "W", "E": "N", "S": "E", "W": "S"},
}
POLOZENIA = ("open", "closed", "earthed", "unknown")
#: Metryka tekstu źródła (QET zapisuje punkt bazowy lewego dolnego rogu, nie obrys):
#: szerokość znaku = posuw znaku kroju schematu (Liberation Sans, odmiana rysowana na ekranie —
#: ``WAGA_TEKSTU_QET`` niżej) z TABELI POSUWÓW KROJU schematu (`metrykiKroju.json`, generator
#: `scripts/metryki_kroju_sld.py`) — JEDNO źródło metryk z pomiarem etykiet kanwy
#: (`frontend/src/ui/sld/v3/core/text.ts`, decyzja architekta §11.7 pkt 7 karty UX-04/
#: POLE-LINIOWE-WZORZEC). Pion z tej samej tabeli (``pionowe``): litera rysuje się z
#: ``dominant-baseline: central``, a linia centralna kroju leży (wznoszenie − zejście)/2 nad linią
#: bazową (CSS Inline Layout 3 §4.2) — punkt bazowy źródła przesuwa się o tyle w górę do środka
#: znaku; obwiednia znaku to zasięg TUSZU jego glifów (nagłówki ``glyf``), nie szacunek wysokości
#: (decyzja §11.7 pkt 5: litera ≥ 8 px bez nakładania na kreskę wymaga rzeczywistego tuszu). Znak
#: spoza tabeli przerywa import — przybliżenie jednej szerokości dla wszystkich znaków przesuwało
#: środek litery „M" napędu o 0,12 em w bok.
TABELA_KROJU = KORZEN / "frontend" / "src" / "ui" / "sld" / "v3" / "core" / "metrykiKroju.json"
KROJ_TEKSTU_QET = "sans"
#: Odmiana kroju liter symboli: renderer rysuje litery symboli wagą CSS 600
#: (``frontend/src/ui/sld/v3/cad/CadSymbol.tsx``, ``WAGA_LITERY_SYMBOLU``), a waga > 500 dobiera
#: odmianę 700 (CSS Fonts 4 §5.2, ta sama reguła co ``core/text.ts``) — obwiednia i środek
#: litery liczone metrykami odmiany, którą widać na ekranie, nie odmianą zwykłą źródła QET.
#: Wartość trafia do pliku TS (``QET_ODMIANA_KROJU_LITER``), test frontendu przypina zgodność
#: z wagą renderera.
WAGA_TEKSTU_QET = "700"


def szerokosci_znakow_em(tabela: Path = TABELA_KROJU) -> dict[str, float]:
    """Posuw znaku [em] odmiany tekstu QET z tabeli posuwów kroju schematu (krój ``sans``)."""
    dane = json.loads(tabela.read_text(encoding="utf-8"))
    jednostki = float(dane["jednostkiEm"])
    kroj = dane["kroje"][KROJ_TEKSTU_QET]
    posuwy = kroj["posuwy"][WAGA_TEKSTU_QET]
    return {znak: posuw / jednostki for znak, posuw in zip(kroj["znaki"], posuwy, strict=True)}


SZEROKOSC_ZNAKU_EM: dict[str, float] = szerokosci_znakow_em()


def metryki_pionowe_em(
    tabela: Path = TABELA_KROJU,
) -> tuple[float, dict[str, tuple[float, float]]]:
    """(przesunięcie linii centralnej nad linią bazową [em], znak → (yMin, yMax) tuszu [em,
    y w górę od linii bazowej]) odmiany tekstu QET z tabeli kroju schematu."""
    dane = json.loads(tabela.read_text(encoding="utf-8"))
    jednostki = float(dane["jednostkiEm"])
    kroj = dane["kroje"][KROJ_TEKSTU_QET]
    pion = kroj["pionowe"][WAGA_TEKSTU_QET]
    centralna = (pion["wznoszenie"] - pion["zejscie"]) / 2 / jednostki
    tusz = {
        znak: (dol / jednostki, gora / jednostki)
        for znak, dol, gora in zip(kroj["znaki"], pion["tuszDol"], pion["tuszGora"], strict=True)
    }
    return centralna, tusz


LINIA_CENTRALNA_EM, TUSZ_ZNAKU_EM = metryki_pionowe_em()


class BladImportu(ValueError):
    """Źródło lub manifest poza dopuszczonym podzbiorem — import przerwany."""


def szerokosc_tekstu(tekst: str, rozmiar: float) -> float:
    """Szerokość tekstu źródła w jednostkach QET (suma posuwów znaków kroju źródła)."""
    brak = sorted({z for z in tekst if z not in SZEROKOSC_ZNAKU_EM})
    if brak:
        raise BladImportu(f"tekst {tekst!r}: brak szerokości znaków {brak} w SZEROKOSC_ZNAKU_EM")
    return rozmiar * sum(SZEROKOSC_ZNAKU_EM[z] for z in tekst)


def zasieg_tuszu_wzgledem_srodka(tekst: str, rozmiar: float) -> tuple[float, float]:
    """(góra, dół) tuszu tekstu względem środka znaku (punktu ``dominant-baseline: central``)
    w osi y skierowanej w DÓŁ — linia bazowa leży ``LINIA_CENTRALNA_EM`` pod środkiem."""
    brak = sorted({z for z in tekst if z not in TUSZ_ZNAKU_EM})
    if brak:
        raise BladImportu(f"tekst {tekst!r}: brak zasięgu tuszu znaków {brak} w tabeli kroju")
    y_min = min(0.0, *(TUSZ_ZNAKU_EM[z][0] for z in tekst))
    y_max = max(0.0, *(TUSZ_ZNAKU_EM[z][1] for z in tekst))
    return ((LINIA_CENTRALNA_EM - y_max) * rozmiar, (LINIA_CENTRALNA_EM - y_min) * rozmiar)


# ---------------------------------------------------------------------------
# Odczyt źródła
# ---------------------------------------------------------------------------


def sha_bloba_git(dane: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(dane) + dane).hexdigest()  # noqa: S324


def liczba(surowa: str | None, nazwa: str) -> float:
    if surowa is None:
        raise BladImportu(f"brak atrybutu {nazwa}")
    try:
        wartosc = float(surowa)
    except ValueError as exc:
        raise BladImportu(f"atrybut {nazwa} nie jest liczbą: {surowa!r}") from exc
    if not math.isfinite(wartosc) or abs(wartosc) > MAX_WSPOLRZEDNA:
        raise BladImportu(f"atrybut {nazwa} poza zakresem: {surowa!r}")
    return wartosc


def styl(element: ET.Element) -> dict[str, str]:
    wynik = {"line-style": "normal", "line-weight": "normal", "filling": "none", "color": "black"}
    for czesc in element.get("style", "").split(";"):
        if ":" in czesc:
            klucz, wartosc = czesc.split(":", 1)
            wynik[klucz.strip()] = wartosc.strip()
    if wynik["line-style"] not in STYLE_KRESKI:
        raise BladImportu(f"styl kreski {wynik['line-style']!r} nieobsługiwany")
    if wynik["line-style"] != "normal" and element.tag != "line":
        raise BladImportu(f"styl kreski {wynik['line-style']!r} dopuszczony wyłącznie dla linii")
    if wynik["line-weight"] != "normal":
        raise BladImportu(f"grubość kreski {wynik['line-weight']!r} nieobsługiwana")
    if wynik["filling"] not in ("none", "black", "white"):
        raise BladImportu(f"wypełnienie {wynik['filling']!r} nieobsługiwane")
    if wynik["color"] not in ("black", "#000000"):
        raise BladImportu(f"kolor {wynik['color']!r} wymaga osobnej oceny")
    for koniec in ("end1", "end2"):
        if element.get(koniec, "none") != "none":
            raise BladImportu(f"zakończenie linii {koniec}={element.get(koniec)!r} nieobsługiwane")
    return wynik


@dataclass(frozen=True)
class Prymityw:
    """Prymityw źródła w układzie QET (względem hotspotu)."""

    rodzaj: str  # line | circle | polygon | arc | letter
    punkty: tuple[tuple[float, float], ...] = ()
    promien: float = 0.0
    zamkniety: bool = False
    wypelnienie: str = "none"
    tekst: str = ""
    rozmiar: float = 0.0
    luk: tuple[float, float, float, float, float, float] | None = None  # cx, cy, r, start, kat
    kreskowana: bool = False


@dataclass(frozen=True)
class Zacisk:
    x: float
    y: float
    kierunek: str


@dataclass
class Element:
    ident: str
    sciezka: str
    upstream_sha: str
    sha256: str
    prymitywy: list[Prymityw] = field(default_factory=list)
    zaciski: list[Zacisk] = field(default_factory=list)


def wczytaj_element(wpis: dict[str, Any]) -> Element:
    sciezka = str(wpis["sourcePath"])
    czesci = Path(sciezka)
    if czesci.is_absolute() or ".." in czesci.parts or czesci.suffix != ".elmt":
        raise BladImportu(f"niebezpieczna ścieżka źródła: {sciezka}")
    plik = (ZRODLA / czesci).resolve()
    if not plik.is_relative_to(ZRODLA.resolve()):
        raise BladImportu(f"ścieżka poza katalogiem źródeł: {sciezka}")
    dane = plik.read_bytes()
    if not 0 < len(dane) <= MAX_BAJTOW:
        raise BladImportu(f"{sciezka}: nieprawidłowy rozmiar pliku")
    if re.search(rb"<!DOCTYPE|<!ENTITY|<script|<image\b", dane, re.IGNORECASE):
        raise BladImportu(f"{sciezka}: zabronione DTD, encja, skrypt albo bitmapa")
    sha = sha_bloba_git(dane)
    if sha != wpis["upstreamBlobSha"]:
        raise BladImportu(f"{sciezka}: SHA bloba {sha} ≠ manifest {wpis['upstreamBlobSha']}")
    try:
        korzen = ET.fromstring(dane)  # noqa: S314 — DTD i encje odrzucone wyżej
    except ET.ParseError as exc:
        raise BladImportu(f"{sciezka}: nieprawidłowy XML") from exc
    if korzen.tag != "definition" or korzen.get("type") != "element":
        raise BladImportu(f"{sciezka}: brak definicji elementu")
    opis = korzen.find("description")
    if opis is None:
        raise BladImportu(f"{sciezka}: brak opisu rysunku")
    decyzje_tekstu: dict[str, str] = dict(wpis.get("teksty", {}))
    element = Element(
        ident=str(wpis["id"]),
        sciezka=sciezka,
        upstream_sha=sha,
        sha256=hashlib.sha256(dane).hexdigest(),
    )
    uzyte_decyzje: set[str] = set()
    for wezel in opis:
        if wezel.tag == "terminal":
            kierunek = KIERUNKI.get(wezel.get("orientation", ""))
            if kierunek is None:
                raise BladImportu(f"{sciezka}: nieznana orientacja zacisku")
            element.zaciski.append(
                Zacisk(liczba(wezel.get("x"), "x"), liczba(wezel.get("y"), "y"), kierunek)
            )
            continue
        if wezel.tag in IGNOROWANE:
            continue
        if wezel.tag not in FIGURY:
            raise BladImportu(f"{sciezka}: nieznany element rysunku {wezel.tag!r}")
        if wezel.tag == "text":
            tresc = wezel.get("text", "")
            decyzja = decyzje_tekstu.get(tresc)
            if decyzja is None:
                raise BladImportu(f"{sciezka}: tekst {tresc!r} bez decyzji pomin/zachowaj")
            uzyte_decyzje.add(tresc)
            if wezel.get("rotation", "0") not in ("0", "0.0"):
                raise BladImportu(f"{sciezka}: obrócony tekst nieobsługiwany")
            czcionka = wezel.get("font", "").split(",")
            rozmiar = liczba(czcionka[1] if len(czcionka) > 1 else None, "font")
            prymityw = Prymityw(
                rodzaj="letter",
                punkty=((liczba(wezel.get("x"), "x"), liczba(wezel.get("y"), "y")),),
                tekst=tresc,
                rozmiar=rozmiar,
            )
            # Tekst pominięty zachowuje swoje miejsce w numeracji prymitywów (indeksy noża
            # w manifeście liczą figury źródła w kolejności pliku).
            element.prymitywy.append(prymityw if decyzja == "zachowaj" else Prymityw("pominiety"))
            if decyzja not in ("pomin", "zachowaj"):
                raise BladImportu(f"{sciezka}: decyzja tekstu {decyzja!r} nieznana")
            continue
        s = styl(wezel)
        if wezel.tag == "line":
            element.prymitywy.append(
                Prymityw(
                    rodzaj="line",
                    punkty=(
                        (liczba(wezel.get("x1"), "x1"), liczba(wezel.get("y1"), "y1")),
                        (liczba(wezel.get("x2"), "x2"), liczba(wezel.get("y2"), "y2")),
                    ),
                    kreskowana=s["line-style"] == "dashed",
                )
            )
        elif wezel.tag == "rect":
            # Prostokąt źródła (np. wtyk złącza EN 60617 03-03-05) = zamknięty wielokąt czterech
            # narożników; zaokrąglenie narożników poza podzbiorem.
            x, y = liczba(wezel.get("x"), "x"), liczba(wezel.get("y"), "y")
            w, h = liczba(wezel.get("width"), "width"), liczba(wezel.get("height"), "height")
            if w <= 0 or h <= 0:
                raise BladImportu(f"{sciezka}: prostokąt o niedodatnim wymiarze")
            if liczba(wezel.get("rx", "0"), "rx") != 0 or liczba(wezel.get("ry", "0"), "ry") != 0:
                raise BladImportu(
                    f"{sciezka}: prostokąt z zaokrąglonymi narożnikami nieobsługiwany"
                )
            element.prymitywy.append(
                Prymityw(
                    rodzaj="polygon",
                    punkty=((x, y), (x + w, y), (x + w, y + h), (x, y + h)),
                    zamkniety=True,
                    wypelnienie=s["filling"],
                )
            )
        elif wezel.tag == "polygon":
            indeksy = sorted(
                int(m.group(1)) for k in wezel.attrib if (m := re.fullmatch(r"x(\d+)", k))
            )
            if len(indeksy) < 2 or indeksy != list(range(1, len(indeksy) + 1)):
                raise BladImportu(f"{sciezka}: niekompletna lista punktów wielokąta")
            punkty = tuple(
                (liczba(wezel.get(f"x{i}"), f"x{i}"), liczba(wezel.get(f"y{i}"), f"y{i}"))
                for i in indeksy
            )
            zamkniety = wezel.get("closed", "true") == "true"
            element.prymitywy.append(
                Prymityw(
                    rodzaj="polygon",
                    punkty=punkty,
                    zamkniety=zamkniety,
                    wypelnienie=s["filling"] if zamkniety else "none",
                )
            )
        elif wezel.tag == "ellipse":
            x, y = liczba(wezel.get("x"), "x"), liczba(wezel.get("y"), "y")
            w, h = liczba(wezel.get("width"), "width"), liczba(wezel.get("height"), "height")
            if w <= 0 or w != h:
                raise BladImportu(f"{sciezka}: elipsa o nierównych osiach nieobsługiwana")
            element.prymitywy.append(
                Prymityw(
                    rodzaj="circle",
                    punkty=((x + w / 2, y + h / 2),),
                    promien=w / 2,
                    wypelnienie=s["filling"],
                )
            )
        elif wezel.tag == "arc":
            x, y = liczba(wezel.get("x"), "x"), liczba(wezel.get("y"), "y")
            w, h = liczba(wezel.get("width"), "width"), liczba(wezel.get("height"), "height")
            start, kat = liczba(wezel.get("start"), "start"), liczba(wezel.get("angle"), "angle")
            if w <= 0 or w != h or not 0 < abs(kat) < 360:
                raise BladImportu(f"{sciezka}: łuk poza obsługiwanym podzbiorem")
            element.prymitywy.append(
                Prymityw(rodzaj="arc", luk=(x + w / 2, y + h / 2, w / 2, start, kat))
            )
    if set(decyzje_tekstu) - uzyte_decyzje:
        raise BladImportu(f"{sciezka}: decyzje tekstu bez tekstu w źródle")
    return element


# ---------------------------------------------------------------------------
# Złożenie i transformacje
# ---------------------------------------------------------------------------


def obroc(punkt: tuple[float, float], stopnie: float, wokol: tuple[float, float] = (0.0, 0.0)):
    """Obrót w układzie ekranowym (oś y w dół) — ta sama konwencja co SVG ``rotate``."""
    r = math.radians(stopnie)
    dx, dy = punkt[0] - wokol[0], punkt[1] - wokol[1]
    return (
        wokol[0] + dx * math.cos(r) - dy * math.sin(r),
        wokol[1] + dx * math.sin(r) + dy * math.cos(r),
    )


@dataclass(frozen=True)
class Skladnik:
    """Składnik złożenia: element źródła po obrocie i przesunięciu, a dla składnika objętego
    ``skalaRysunku`` manifestu — po jednokładności o skali ``k`` wokół ``srodek`` (układ
    złożenia). Jednokładność przenosi kształt źródła bez zmian (wszystkie odległości × k)."""

    element: Element
    obrot: int
    przesuniecie: tuple[float, float]
    k: float = 1.0
    srodek: tuple[float, float] = (0.0, 0.0)

    def punkt(self, p: tuple[float, float]) -> tuple[float, float]:
        x, y = obroc(p, self.obrot)
        x, y = x + self.przesuniecie[0], y + self.przesuniecie[1]
        return (
            self.srodek[0] + self.k * (x - self.srodek[0]),
            self.srodek[1] + self.k * (y - self.srodek[1]),
        )


def punkty_luku(luk: tuple[float, float, float, float, float, float]) -> list[tuple[float, float]]:
    """Punkty łuku źródła (kąty QET: od godziny 3, dodatnie przeciwnie do ruchu wskazówek
    zegara na ekranie) — co 1° plus końce; służą obwiedni i końcom ścieżki SVG."""
    cx, cy, r, start, kat = luk
    kroki = max(2, int(abs(kat)))
    return [
        (
            cx + r * math.cos(math.radians(start + kat * i / kroki)),
            cy - r * math.sin(math.radians(start + kat * i / kroki)),
        )
        for i in range(kroki + 1)
    ]


def zaokr(v: float) -> float:
    w = round(v, 4)
    return 0.0 if w == 0 else w


def liczba_ts(v: float) -> str:
    w = zaokr(v)
    return str(int(w)) if float(w).is_integer() else repr(w)


#: Role prymitywów w symbolu (wyjście generatora i renderer kafla):
#: ``przewod`` — przewód toru albo obwodu wtórnego (linia od zacisku portu w kierunku portu;
#: kreska przewodu, przycinana i przedłużana do krawędzi gabarytu); ``glif`` — rysunek aparatu
#: (nóż, styk stały i jego znak rodzaju, okręgi przekładników, uziemienie) — kreska glifu
#: proporcjonalna do kafla stanu, jego wysokość mierzy stopień symbolu; ``osprzet`` — osprzęt
#: łącznika zadeklarowany w manifeście (napęd silnikowy, cewka wyłączająca) — kreska glifu, poza
#: miarą stopnia, w kaflu z marginesem.
ROLE = ("przewod", "glif", "osprzet")
#: Tolerancja dopasowania końca linii źródła do zacisku portu przy rozpoznaniu przewodu
#: [jednostki QET] — doprowadzenie uzwojenia wtórnego przekładnika napięciowego EN 60617
#: 06-13-01 leży w źródle 0,13 jednostki obok zacisku.
TOLERANCJA_PRZEWODU = 0.25


@dataclass
class Rysunek:
    """Prymityw po złożeniu (układ QET złożenia) — przed skalą do świata schematu."""

    rodzaj: str
    punkty: list[tuple[float, float]]
    promien: float = 0.0
    zamkniety: bool = False
    wypelnienie: str = "none"
    tekst: str = ""
    rozmiar: float = 0.0
    luk_flagi: tuple[int, int] = (0, 0)
    luk_probki: list[tuple[float, float]] = field(default_factory=list)
    kreskowana: bool = False
    rola: str = "glif"


def zloz_prymityw(p: Prymityw, s: Skladnik, rola: str) -> Rysunek | None:
    if p.rodzaj == "pominiety":
        return None
    if p.rodzaj == "arc":
        assert p.luk is not None
        probki = [s.punkt(q) for q in punkty_luku(p.luk)]
        kat = p.luk[4]
        return Rysunek(
            rodzaj="arc",
            punkty=[probki[0], probki[-1]],
            promien=p.luk[2] * s.k,
            luk_flagi=(int(abs(kat) > 180), int(kat < 0)),
            luk_probki=probki,
            rola=rola,
        )
    if p.rodzaj == "letter":
        (x, y) = p.punkty[0]
        szer = szerokosc_tekstu(p.tekst, p.rozmiar)
        srodek = (x + szer / 2, y - LINIA_CENTRALNA_EM * p.rozmiar)
        # Znak w składniku obróconym: obrót przenosi ŚRODEK znaku, a sam znak zostaje poziomy
        # (litera kodu „M" napędu czytana jak na rysunku, nie do góry nogami).
        return Rysunek(
            rodzaj="letter",
            punkty=[s.punkt(srodek)],
            tekst=p.tekst,
            rozmiar=p.rozmiar * s.k,
            rola=rola,
        )
    return Rysunek(
        rodzaj=p.rodzaj,
        punkty=[s.punkt(q) for q in p.punkty],
        promien=p.promien * s.k,
        zamkniety=p.zamkniety,
        wypelnienie=p.wypelnienie,
        kreskowana=p.kreskowana,
        rola=rola,
    )


def noz_w_zasiegu(r: Rysunek, zasieg: float, przegub: tuple[float, float]) -> Rysunek:
    """Linia noża z końcem dalszym od przegubu przesuniętym wzdłuż noża do ``zasieg`` × długości
    (koniec bliższy przegubowi bez zmian) — ta sama reguła co renderer
    (``frontend/src/ui/sld/v3/symbols/glyphs.tsx::prymitywyNozaQet``)."""
    if zasieg == 1.0:
        return r
    (a, b) = r.punkty
    (blizszy, dalszy) = (a, b) if math.dist(a, przegub) <= math.dist(b, przegub) else (b, a)
    nowy = (
        przegub[0] + (dalszy[0] - przegub[0]) * zasieg,
        przegub[1] + (dalszy[1] - przegub[1]) * zasieg,
    )
    return replace(r, punkty=[blizszy, nowy] if blizszy is a else [nowy, blizszy])


def obroc_rysunek(r: Rysunek, stopnie: float, wokol: tuple[float, float]) -> Rysunek:
    return replace(
        r,
        punkty=[obroc(q, stopnie, wokol) for q in r.punkty],
        luk_probki=[obroc(q, stopnie, wokol) for q in r.luk_probki],
    )


def obwiednia(rysunki: Iterable[Rysunek]) -> list[tuple[float, float]]:
    punkty: list[tuple[float, float]] = []
    for r in rysunki:
        if r.rodzaj == "circle":
            (cx, cy) = r.punkty[0]
            punkty += [(cx - r.promien, cy - r.promien), (cx + r.promien, cy + r.promien)]
        elif r.rodzaj == "arc":
            punkty += r.luk_probki
        elif r.rodzaj == "letter":
            (cx, cy) = r.punkty[0]
            pol_s = szerokosc_tekstu(r.tekst, r.rozmiar) / 2
            (gora, dol) = zasieg_tuszu_wzgledem_srodka(r.tekst, r.rozmiar)
            punkty += [(cx - pol_s, cy + gora), (cx + pol_s, cy + dol)]
        else:
            punkty += r.punkty
    return punkty


def prostokat(punkty: Sequence[tuple[float, float]]) -> tuple[float, float, float, float]:
    """(min_x, min_y, max_x, max_y) zbioru punktów."""
    return (
        min(q[0] for q in punkty),
        min(q[1] for q in punkty),
        max(q[0] for q in punkty),
        max(q[1] for q in punkty),
    )


def kat_kierunku(od: tuple[float, float], do: tuple[float, float]) -> float:
    return math.degrees(math.atan2(do[1] - od[1], do[0] - od[0]))


def normalizuj_kat(k: float) -> float:
    while k <= -180:
        k += 360
    while k > 180:
        k -= 360
    return k


def domknij_w_dol(wartosc: float, odniesienie: float, raster: float) -> float:
    return odniesienie - raster * math.ceil(round((odniesienie - wartosc) / raster, 9))


def domknij_w_gore(wartosc: float, odniesienie: float, raster: float) -> float:
    return odniesienie + raster * math.ceil(round((wartosc - odniesienie) / raster, 9))


def _powod(wpis: dict[str, Any], ident: str, co: str) -> str:
    powod = str(wpis.get("powod") or "").strip()
    if not powod:
        raise BladImportu(f"{ident}: {co} bez powodu")
    return powod


#: Zakres skali lokalnej prymitywów (``skalaLokalna`` manifestu): powiększenie znaku rodzaju
#: aparatu albo zmniejszenie doprowadzenia obwodu wtórnego przed jednokładnością rysunku.
SKALA_LOKALNA = (0.25, 4.0)
#: Zakres jednokładności rysunku symbolu (``skalaRysunku`` manifestu).
SKALA_RYSUNKU = (1.0, 4.0)


def przeskaluj_prymityw(
    p: Prymityw, srodek: tuple[float, float], skala: float, ident: str
) -> Prymityw:
    """Jednokładność wskazanych prymitywów źródła wokół punktu (``skalaLokalna`` manifestu).
    Litera (kwalifikator „M" napędu silnikowego) zmienia się razem z okręgiem: punkt zaczepienia
    i rozmiar pisma × skala, więc środek litery przechodzi tą samą jednokładnością co środek
    okręgu (litera zostaje w okręgu)."""

    def sk(q: tuple[float, float]) -> tuple[float, float]:
        return (srodek[0] + skala * (q[0] - srodek[0]), srodek[1] + skala * (q[1] - srodek[1]))

    if p.rodzaj in ("line", "polygon"):
        return replace(p, punkty=tuple(sk(q) for q in p.punkty))
    if p.rodzaj == "circle":
        return replace(p, punkty=(sk(p.punkty[0]),), promien=p.promien * skala)
    if p.rodzaj == "arc":
        assert p.luk is not None
        cx, cy = sk((p.luk[0], p.luk[1]))
        return replace(p, luk=(cx, cy, p.luk[2] * skala, p.luk[3], p.luk[4]))
    if p.rodzaj == "letter":
        return replace(p, punkty=(sk(p.punkty[0]),), rozmiar=p.rozmiar * skala)
    raise BladImportu(f"{ident}: skala lokalna prymitywu {p.rodzaj!r} nieobsługiwana")


def prymitywy_skladnikow(
    wpis: dict[str, Any], skladniki: Sequence[Skladnik], ident: str
) -> list[list[Prymityw]]:
    """Prymitywy każdego składnika po jawnych decyzjach manifestu — ``pominPrymitywy``
    (prymityw źródła nieużyty w złożeniu, np. doprowadzenie uzwojenia przecinające okrąg
    sąsiedniego uzwojenia) i ``skalaLokalna`` (jednokładność wskazanych prymitywów wokół punktu:
    znak rodzaju aparatu powiększony, żeby kafel stanu niósł czytelny rodzaj, albo doprowadzenie
    obwodu wtórnego zmniejszone, żeby po jednokładności rysunku zostało w długości źródła).
    Numeracja prymitywów źródła bez zmian."""
    wynik = [list(s.element.prymitywy) for s in skladniki]

    def sprawdz(si: int, pi: int, co: str) -> None:
        if not 0 <= si < len(wynik) or not 0 <= pi < len(wynik[si]):
            raise BladImportu(f"{ident}: {co} — prymityw {pi} składnika {si} poza źródłem")
        if wynik[si][pi].rodzaj == "pominiety":
            raise BladImportu(f"{ident}: {co} — prymityw {pi} składnika {si} już pominięty")

    for decyzja in wpis.get("pominPrymitywy", []):
        _powod(decyzja, ident, "pominięcie prymitywów")
        si = int(decyzja["skladnik"])
        for pi in decyzja["prymitywy"]:
            sprawdz(si, int(pi), "pominięcie")
            wynik[si][int(pi)] = Prymityw("pominiety")
    for decyzja in wpis.get("skalaLokalna", []):
        _powod(decyzja, ident, "skala lokalna")
        si = int(decyzja["skladnik"])
        skala = float(decyzja["skala"])
        if not SKALA_LOKALNA[0] <= skala <= SKALA_LOKALNA[1] or skala == 1:
            raise BladImportu(f"{ident}: skala lokalna {skala} poza [0,25; 4] albo równa 1")
        srodek = (float(decyzja["srodek"][0]), float(decyzja["srodek"][1]))
        for pi in decyzja["prymitywy"]:
            sprawdz(si, int(pi), "skala lokalna")
            wynik[si][int(pi)] = przeskaluj_prymityw(wynik[si][int(pi)], srodek, skala, ident)
    return wynik


@dataclass(frozen=True)
class KafelStanu:
    """Jednolity kwadratowy kafel stanu łączników z położeniem (jednostki QET): połowa boku od
    osi toru, bok, margines rysunku od krawędzi i kreska glifu — z jednej deklaracji manifestu
    (``kafelStanu``). Gabaryt łącznika = kafel, więc kafle wszystkich łączników pola mają jeden
    rozmiar."""

    pol_szer: float
    wysokosc: float
    margines: float
    kreska: float
    powod: str


@dataclass(frozen=True)
class StopienSymboli:
    """Stopień symboli pola na LOD2 (``stopienSymboli`` manifestu): wysokość glifu (rysunek
    aparatu wzdłuż osi toru, bez przewodów i osprzętu) jako ułamek boku kafla stanu — dla
    łączników w każdym położeniu noża, dla symboli toru bez kafla w położeniu jedynym."""

    kafel: tuple[float, float]
    tor: tuple[float, float]
    bok: float
    powod: str


def _na_rastrze(wartosc: float, odniesienie: float, raster: float) -> bool:
    reszta = (wartosc - odniesienie) / raster
    return abs(reszta - round(reszta)) <= 1e-9


def _blisko(a: tuple[float, float], b: tuple[float, float], tol: float = 1e-9) -> bool:
    return abs(a[0] - b[0]) <= tol and abs(a[1] - b[1]) <= tol


def zloz_symbol(
    wpis: dict[str, Any],
    elementy: dict[str, Element],
    skala: float,
    raster: float,
    kafel: KafelStanu | None = None,
    stopien: StopienSymboli | None = None,
) -> dict[str, Any]:
    ident = str(wpis["symbolId"])
    liczba_skladnikow = len(wpis["skladniki"])

    # Jednokładność rysunku (``skalaRysunku``): skala k > 1 wokół punktu układu złożenia dla
    # wskazanych składników (domyślnie wszystkich); składnik poza listą stoi w układzie po
    # jednokładności (jego przesunięcie jest podane w tym układzie).
    skala_rys = wpis.get("skalaRysunku")
    k, srodek_k, skalowane = 1.0, (0.0, 0.0), set[int]()
    if skala_rys is not None:
        _powod(skala_rys, ident, "skala rysunku")
        k = float(skala_rys["k"])
        if not SKALA_RYSUNKU[0] < k <= SKALA_RYSUNKU[1]:
            raise BladImportu(f"{ident}: skala rysunku {k} poza (1; 4]")
        srodek_k = (float(skala_rys["srodek"][0]), float(skala_rys["srodek"][1]))
        skalowane = {int(i) for i in skala_rys.get("skladniki", range(liczba_skladnikow))}
        if not skalowane or not skalowane <= set(range(liczba_skladnikow)):
            raise BladImportu(f"{ident}: skala rysunku wskazuje składnik spoza złożenia")
    skladniki = [
        Skladnik(
            element=elementy[str(s["element"])],
            obrot=int(s["obrot"]),
            przesuniecie=(float(s["przesuniecie"][0]), float(s["przesuniecie"][1])),
            k=k if i in skalowane else 1.0,
            srodek=srodek_k if i in skalowane else (0.0, 0.0),
        )
        for i, s in enumerate(wpis["skladniki"])
    ]
    for s in skladniki:
        if s.obrot not in OBROT_KIERUNKU:
            raise BladImportu(f"{ident}: obrót {s.obrot} poza wielokrotnością 90°")
    zrodlowe = prymitywy_skladnikow(wpis, skladniki, ident)

    noz_wpis = wpis.get("noz")
    indeksy_noza: set[tuple[int, int]] = set()
    if noz_wpis:
        indeksy_noza = {(int(noz_wpis["skladnik"]), int(i)) for i in noz_wpis["prymitywy"]}

    osprzet: dict[int, str] = {}
    for o in wpis.get("osprzet", []):
        si = int(o["skladnik"])
        if not 0 <= si < liczba_skladnikow:
            raise BladImportu(f"{ident}: osprzęt wskazuje składnik spoza złożenia")
        if noz_wpis and si == int(noz_wpis["skladnik"]):
            raise BladImportu(f"{ident}: składnik noża nie może być osprzętem")
        osprzet[si] = _powod(o, ident, "osprzęt")

    stale: list[Rysunek] = []
    noz: list[Rysunek] = []
    for si, s in enumerate(skladniki):
        for pi, p in enumerate(zrodlowe[si]):
            r = zloz_prymityw(p, s, "osprzet" if si in osprzet else "glif")
            if (si, pi) in indeksy_noza:
                if r is None or r.rodzaj != "line":
                    raise BladImportu(f"{ident}: prymityw noża {pi} nie jest linią źródła")
                noz.append(r)
            elif r is not None:
                stale.append(r)
    if noz_wpis and len(noz) != len(indeksy_noza):
        raise BladImportu(f"{ident}: indeks prymitywu noża poza źródłem")

    katy: dict[str, float] = {}
    zasiegi: dict[str, float] = {}
    przegub: tuple[float, float] | None = None
    if noz_wpis:
        s_noza = skladniki[int(noz_wpis["skladnik"])]
        przegub = s_noza.punkt((float(noz_wpis["przegub"][0]), float(noz_wpis["przegub"][1])))
        ostrze = noz[0]
        koniec = max(ostrze.punkty, key=lambda q: math.dist(q, przegub))
        katy["open"] = 0.0
        zasiegi["open"] = 1.0
        # Położenie OTWARTE = rysunek źródła albo — z jawnym powodem (``otwarty``: kierunek noża
        # i powód) — obrót noża źródła na podany kierunek, bez zmiany długości (koniec noża poza
        # zestykami). Łącznik trójpołożeniowy: nóż źródła odłącznika odchylony o 19° przy
        # kresce zestyku szynowego w osi stykał się z nią grubością kreski glifu.
        otwarty = noz_wpis.get("otwarty")
        if otwarty is not None:
            _powod(otwarty, ident, "kierunek położenia otwartego")
            cel_otw = s_noza.punkt((float(otwarty["kierunek"][0]), float(otwarty["kierunek"][1])))
            katy["open"] = normalizuj_kat(
                kat_kierunku(przegub, cel_otw) - kat_kierunku(przegub, koniec)
            )
        for polozenie, cel in sorted(noz_wpis["cele"].items()):
            if polozenie not in ("closed", "earthed"):
                raise BladImportu(f"{ident}: położenie {polozenie!r} nieznane")
            cel_zl = s_noza.punkt((float(cel[0]), float(cel[1])))
            katy[polozenie] = normalizuj_kat(
                kat_kierunku(przegub, cel_zl) - kat_kierunku(przegub, koniec)
            )
            # Koniec noża NA styku stałym: zasięg = |przegub → styk| / |przegub → koniec noża|.
            zasiegi[polozenie] = math.dist(przegub, cel_zl) / math.dist(przegub, koniec)
        if "closed" not in katy:
            raise BladImportu(f"{ident}: brak położenia zamkniętego noża")
        # NIEZNANY = położenie pośrednie między otwartym a zamkniętym (różne od obu); zasięg
        # źródła albo — z jawnym powodem (``nieznany``) — skrócony, gdy nóż w pełnej długości
        # przechodziłby przy kresce styku stałego.
        katy["unknown"] = (katy["open"] + katy["closed"]) / 2
        zasiegi["unknown"] = 1.0
        nieznany = noz_wpis.get("nieznany")
        if nieznany is not None:
            _powod(nieznany, ident, "zasięg położenia nieustalonego")
            zasieg = float(nieznany["zasieg"])
            if not 0 < zasieg < 1:
                raise BladImportu(f"{ident}: zasięg położenia nieustalonego {zasieg} poza (0; 1)")
            zasiegi["unknown"] = zasieg
    if kafel is not None and przegub is None:
        raise BladImportu(f"{ident}: kafel stanu wyłącznie dla łącznika z nożem")

    # Porty i zaciski: każdy zacisk źródła jest portem, zaciskiem wewnętrznym, portem obwodu
    # wtórnego albo zaciskiem spoza toru zadeklarowanym z powodem.
    wykorzystane: set[tuple[int, float, float]] = set()

    def zacisk_zrodla(si: int, xy: Sequence[float]) -> tuple[tuple[float, float], str]:
        s = skladniki[si]
        for z in s.element.zaciski:
            if (z.x, z.y) == (float(xy[0]), float(xy[1])):
                wykorzystane.add((si, z.x, z.y))
                return s.punkt((z.x, z.y)), OBROT_KIERUNKU[s.obrot][z.kierunek]
        raise BladImportu(f"{ident}: składnik {si} nie ma zacisku {list(xy)}")

    def punkt_portu(p: dict[str, Any], co: str) -> tuple[tuple[float, float], str]:
        if "zacisk" in p:
            return zacisk_zrodla(int(p["skladnik"]), p["zacisk"])
        if not str(p.get("powod") or "").strip() or p.get("dir") not in ("N", "S", "E", "W"):
            raise BladImportu(f"{ident}: {co} {p['name']} bez zacisku wymaga powodu i kierunku")
        punkt = skladniki[int(p["skladnik"])].punkt((float(p["punkt"][0]), float(p["punkt"][1])))
        return punkt, str(p["dir"])

    porty: list[tuple[str, tuple[float, float], str]] = []
    for p in wpis["porty"]:
        punkt, kierunek = punkt_portu(p, "port")
        porty.append((str(p["name"]), punkt, kierunek))
    for w in wpis.get("zaciskiWewnetrzne", []):
        a, _ = zacisk_zrodla(int(w["skladnik"]), w["zacisk"])
        b, _ = zacisk_zrodla(int(w["z"]["skladnik"]), w["z"]["zacisk"])
        if math.dist(a, b) > 1e-9:
            raise BladImportu(f"{ident}: zaciski wewnętrzne złożenia nie pokrywają się {a} ≠ {b}")
    # Zacisk źródła spoza toru pierwotnego (np. uzwojenie wtórne bez doprowadzenia w złożeniu,
    # zacisk powrotny cewki wyłączającej) nie jest portem — wymaga jawnej deklaracji z powodem;
    # bez niej import jest przerywany.
    for w in wpis.get("zaciskiPozaTorem", []):
        if not str(w.get("powod") or "").strip():
            raise BladImportu(f"{ident}: zacisk poza torem {w.get('zacisk')} bez powodu")
        zacisk_zrodla(int(w["skladnik"]), w["zacisk"])
    p0 = porty[0][1]

    # Porty OBWODU WTÓRNEGO (zacisk uzwojenia wtórnego przekładnika, koniec doprowadzenia
    # rdzenia, zacisk cewki wyłączającej wyłącznika): punkty zaczepienia linii pomiarowych
    # i linii wyłączania, osobna lista wyjścia (nie są portami toru pola). ``przedluzenie``
    # = jawny odcinek przewodu obwodu wtórnego od punktu źródła w podanym kierunku do
    # najbliższego węzła rastru zacisków (z powodem) — punkt źródła leży między rastrami.
    krok = {"N": (0, -1), "S": (0, 1), "E": (1, 0), "W": (-1, 0)}
    wtorne_zrodlo: list[dict[str, Any]] = []
    for p in wpis.get("portyWtorne", []):
        od, kierunek = punkt_portu(p, "port wtórny")
        koniec = od
        przedluzenie = p.get("przedluzenie")
        if przedluzenie is not None:
            _powod(przedluzenie, ident, f"przedłużenie portu wtórnego {p['name']}")
            kier_przedl = str(przedluzenie.get("kierunek") or "")
            if kier_przedl not in krok:
                raise BladImportu(f"{ident}: przedłużenie portu wtórnego {p['name']} bez kierunku")
            dx, dy = krok[kier_przedl]
            os_ = 0 if dx else 1
            znak = dx or dy
            reszta = (od[os_] - p0[os_]) / raster
            cel = p0[os_] + raster * (
                math.floor(round(reszta, 9)) + 1 if znak > 0 else math.ceil(round(reszta, 9)) - 1
            )
            if _na_rastrze(od[os_], p0[os_], raster):
                raise BladImportu(
                    f"{ident}: przedłużenie portu wtórnego {p['name']} zbędne — punkt na rastrze"
                )
            koniec = (cel, od[1]) if os_ == 0 else (od[0], cel)
        wtorne_zrodlo.append(
            {
                "name": str(p["name"]),
                "od": od,
                "punkt": koniec,
                "dir": kierunek,
                "powod": str((przedluzenie or {}).get("powod") or ""),
            }
        )
    for si, s in enumerate(skladniki):
        for z in s.element.zaciski:
            if (si, z.x, z.y) not in wykorzystane:
                raise BladImportu(f"{ident}: zacisk źródła {(z.x, z.y)} bez przypisania")

    for nazwa, punkt, _ in porty:
        if not (_na_rastrze(punkt[0], p0[0], raster) and _na_rastrze(punkt[1], p0[1], raster)):
            raise BladImportu(f"{ident}: port {nazwa} poza rastrem zacisków QET")
    for w in wtorne_zrodlo:
        q = w["punkt"]
        if not (_na_rastrze(q[0], p0[0], raster) and _na_rastrze(q[1], p0[1], raster)):
            raise BladImportu(f"{ident}: port wtórny {w['name']} poza rastrem zacisków QET")
        if w["od"] != w["punkt"]:
            stale.append(Rysunek(rodzaj="line", punkty=[w["od"], w["punkt"]], rola="przewod"))

    # Przewód: linia stała (poza nożem), której koniec leży na zacisku portu toru albo na
    # punkcie źródła portu obwodu wtórnego, równoległa do kierunku tego portu. Pozostałe linie
    # są rysunkiem aparatu (glif) albo osprzętem. Symbol z deklaracją ``przewodyJakoRysunek``
    # (np. zakończenie kabla — odcinek kabla jest treścią znaku) nie ma przewodów do przycięcia.
    zaczepy = [(punkt, kier) for _, punkt, kier in porty] + [
        (w["od"], w["dir"]) for w in wtorne_zrodlo
    ]
    przewody_jako_rysunek = wpis.get("przewodyJakoRysunek")
    if przewody_jako_rysunek is not None:
        _powod(przewody_jako_rysunek, ident, "przewody jako rysunek")
    else:
        for r in stale:
            if r.rodzaj != "line" or r.rola == "przewod":
                continue
            (a, b) = r.punkty
            for zaczep, kier in zaczepy:
                pionowa = abs(a[0] - b[0]) <= TOLERANCJA_PRZEWODU
                pozioma = abs(a[1] - b[1]) <= TOLERANCJA_PRZEWODU
                rownolegla = pionowa if kier in ("N", "S") else pozioma
                if rownolegla and (
                    _blisko(a, zaczep, TOLERANCJA_PRZEWODU)
                    or _blisko(b, zaczep, TOLERANCJA_PRZEWODU)
                ):
                    r.rola = "przewod"
                    break

    polozenia_noza = (
        {
            pol: [
                obroc_rysunek(noz_w_zasiegu(r, zasiegi[pol], przegub), katy[pol], przegub)
                for r in noz
            ]
            for pol in POLOZENIA
            if pol in katy
        }
        if przegub is not None
        else {"open": []}
    )
    glif_staly = [r for r in stale if r.rola == "glif"]
    osprzet_r = [r for r in stale if r.rola == "osprzet"]
    rysunek_pol = {pol: glif_staly + rys for pol, rys in polozenia_noza.items()}
    if not any(rysunek_pol.values()):
        raise BladImportu(f"{ident}: symbol bez rysunku aparatu (same przewody)")
    tresc = obwiednia(osprzet_r) + [q for rys in rysunek_pol.values() for q in obwiednia(rys)]
    przewody = [r for r in stale if r.rola == "przewod"]

    nazwy_portow = {nazwa: punkt for nazwa, punkt, _ in porty}
    os_x = (nazwy_portow.get("bottom") or nazwy_portow.get("top") or p0)[0]
    t_min_x, t_min_y, t_max_x, t_max_y = prostokat(tresc)

    # Gabaryt: wzdłuż osi toru — treść (rysunek aparatu we wszystkich położeniach noża i osprzęt)
    # oraz porty obwodu wtórnego, domknięte do rastru od portu; w poprzek — symetrycznie wokół
    # osi toru. Łącznik z kaflem: kwadrat kafla wyśrodkowany na treści, krawędzie na rastrze od
    # portu. Symbol z przewodami jako rysunkiem: gabaryt obejmuje też porty (reguła źródła).
    wtorne_punkty = [w["punkt"] for w in wtorne_zrodlo]
    poprzecznie = [t_min_x, t_max_x] + [q[0] for q in wtorne_punkty]
    if przewody_jako_rysunek is not None:
        poprzecznie += [q[0] for q in obwiednia(przewody)] + [q[0] for _, q, _ in porty]
    pol_szer = raster * math.ceil(round(max(abs(v - os_x) for v in poprzecznie) / raster, 9))
    if kafel is not None:
        if kafel.pol_szer < pol_szer:
            raise BladImportu(f"{ident}: rysunek łącznika nie mieści się w kaflu stanu")
        pol_szer = kafel.pol_szer
        srodek_y = (t_min_y + t_max_y) / 2
        g_min_y = p0[1] - raster * math.floor(
            (p0[1] - (srodek_y - kafel.wysokosc / 2)) / raster + 0.5
        )
        g_max_y = g_min_y + kafel.wysokosc
    else:
        wzdluz = [t_min_y, t_max_y] + [q[1] for q in wtorne_punkty]
        if przewody_jako_rysunek is not None:
            wzdluz += [q[1] for q in obwiednia(przewody)] + [q[1] for _, q, _ in porty]
        g_min_y = domknij_w_dol(min(wzdluz), p0[1], raster)
        g_max_y = domknij_w_gore(max(wzdluz), p0[1], raster)
    g_min_x, g_max_x = os_x - pol_szer, os_x + pol_szer

    if kafel is not None:
        m = kafel.margines
        if (
            t_min_x < g_min_x + m - 1e-9
            or t_max_x > g_max_x - m + 1e-9
            or t_min_y < g_min_y + m - 1e-9
            or t_max_y > g_max_y - m + 1e-9
        ):
            raise BladImportu(f"{ident}: rysunek łącznika nie mieści się w kaflu stanu")
    for w in wtorne_zrodlo:
        q = w["punkt"]
        if not (
            g_min_x - 1e-9 <= q[0] <= g_max_x + 1e-9 and g_min_y - 1e-9 <= q[1] <= g_max_y + 1e-9
        ):
            raise BladImportu(f"{ident}: port wtórny {w['name']} poza gabarytem")

    # Przewody przycięte do gabarytu (zacisk źródła poza gabarytem → krawędź); przewód
    # o długości zero po przycięciu znika. Przewód biegnący poza gabarytem w poprzek osi
    # przerywa import.
    def przytnij(r: Rysunek) -> Rysunek | None:
        (a, b) = r.punkty
        if abs(a[0] - b[0]) <= TOLERANCJA_PRZEWODU:
            if not g_min_x - 1e-9 <= a[0] <= g_max_x + 1e-9:
                raise BladImportu(f"{ident}: przewód poza gabarytem w poprzek osi")
            ya, yb = (min(max(v, g_min_y), g_max_y) for v in (a[1], b[1]))
            if abs(ya - yb) <= 1e-9:
                return None
            return replace(r, punkty=[(a[0], ya), (b[0], yb)])
        if not g_min_y - 1e-9 <= a[1] <= g_max_y + 1e-9:
            raise BladImportu(f"{ident}: przewód poza gabarytem w poprzek osi")
        xa, xb = (min(max(v, g_min_x), g_max_x) for v in (a[0], b[0]))
        if abs(xa - xb) <= 1e-9:
            return None
        return replace(r, punkty=[(xa, a[1]), (xb, b[1])])

    if przewody_jako_rysunek is None:
        przewody = [q for q in (przytnij(r) for r in przewody) if q is not None]

    def swiat(q: tuple[float, float]) -> tuple[float, float]:
        return ((q[0] - g_min_x) * skala, (q[1] - g_min_y) * skala)

    szer, wys = (g_max_x - g_min_x) * skala, (g_max_y - g_min_y) * skala

    def na_krawedzi(q: tuple[float, float]) -> bool:
        x, y = swiat(q)
        return abs(x) < 1e-9 or abs(y) < 1e-9 or abs(x - szer) < 1e-9 or abs(y - wys) < 1e-9

    krawedz = {
        "N": (None, g_min_y),
        "S": (None, g_max_y),
        "W": (g_min_x, None),
        "E": (g_max_x, None),
    }

    def na_krawedzi_kierunku(q: tuple[float, float], kierunek: str) -> tuple[float, float]:
        kx, ky = krawedz[kierunek]
        return (q[0] if kx is None else kx, q[1] if ky is None else ky)

    # Port poza gabarytem — przesunięty na krawędź w kierunku portu (jego przewód przycięty
    # wyżej). Port wewnątrz gabarytu (deklaracja ``portyWewnatrzGabarytu`` z powodem albo —
    # u łącznika z kaflem — kafel większy od rysunku) jest przedłużany odcinkiem PRZEWODU do
    # krawędzi — port leży na krawędzi jak w całej bibliotece (sonda portów spec §11.3), odcinek
    # jest jawny w wyjściu (``doprowadzenia``).
    deklarowane: dict[str, str] = dict(wpis.get("portyWewnatrzGabarytu", {}))
    wewnetrzne: list[str] = []
    for i, (nazwa, punkt, kierunek) in enumerate(porty):
        cel = na_krawedzi_kierunku(punkt, kierunek)
        poza = (
            punkt[1] < g_min_y - 1e-9
            or punkt[1] > g_max_y + 1e-9
            or punkt[0] < g_min_x - 1e-9
            or punkt[0] > g_max_x + 1e-9
        )
        if poza:
            if przewody_jako_rysunek is not None:
                raise BladImportu(f"{ident}: port {nazwa} poza gabarytem")
            porty[i] = (nazwa, cel, kierunek)
        elif not na_krawedzi(punkt):
            wewnetrzne.append(nazwa)
    if kafel is not None:
        for nazwa in wewnetrzne:
            deklarowane.setdefault(nazwa, kafel.powod)
    if sorted(wewnetrzne) != sorted(deklarowane):
        raise BladImportu(
            f"{ident}: porty poza krawędzią gabarytu {sorted(wewnetrzne)} ≠ deklaracja "
            f"{sorted(deklarowane)}"
        )
    doprowadzenia: list[dict[str, Any]] = []
    for i, (nazwa, punkt, kierunek) in enumerate(porty):
        if nazwa not in deklarowane:
            continue
        if not str(deklarowane[nazwa]).strip():
            raise BladImportu(f"{ident}: port wewnątrz gabarytu {nazwa} bez powodu")
        koniec = na_krawedzi_kierunku(punkt, kierunek)
        przewody.append(Rysunek(rodzaj="line", punkty=[punkt, koniec], rola="przewod"))
        porty[i] = (nazwa, koniec, kierunek)
        a, b = swiat(punkt), swiat(koniec)
        doprowadzenia.append(
            {
                "port": nazwa,
                "x1": zaokr(a[0]),
                "y1": zaokr(a[1]),
                "x2": zaokr(b[0]),
                "y2": zaokr(b[1]),
                "powod": str(deklarowane[nazwa]),
            }
        )
    for w in wtorne_zrodlo:
        if w["od"] != w["punkt"]:
            a, b = swiat(w["od"]), swiat(w["punkt"])
            doprowadzenia.append(
                {
                    "port": w["name"],
                    "x1": zaokr(a[0]),
                    "y1": zaokr(a[1]),
                    "x2": zaokr(b[0]),
                    "y2": zaokr(b[1]),
                    "powod": w["powod"],
                }
            )
    porty_swiat = []
    for nazwa, punkt, kierunek in porty:
        if not na_krawedzi(punkt):
            raise BladImportu(f"{ident}: port {nazwa} poza krawędzią gabarytu")
        x, y = swiat(punkt)
        porty_swiat.append({"name": nazwa, "x": zaokr(x), "y": zaokr(y), "dir": kierunek})
    porty_wtorne_swiat = []
    for w in wtorne_zrodlo:
        x, y = swiat(w["punkt"])
        porty_wtorne_swiat.append(
            {"name": w["name"], "x": zaokr(x), "y": zaokr(y), "dir": w["dir"]}
        )

    # Stopień symbolu: wysokość glifu wzdłuż osi toru / bok kafla stanu — łącznik w KAŻDYM
    # położeniu noża w zakresie kafla, symbol toru w zakresie toru.
    def wys_glifu(rys: Sequence[Rysunek]) -> float:
        _, y0, _, y1 = prostokat(obwiednia(rys))
        return y1 - y0

    udzialy: dict[str, float] = {}
    if stopien is not None:
        udzialy = {pol: wys_glifu(rys) / stopien.bok for pol, rys in rysunek_pol.items()}
        zakres = stopien.kafel if kafel is not None else stopien.tor
        for pol, u in sorted(udzialy.items()):
            if not zakres[0] - 1e-9 <= u <= zakres[1] + 1e-9:
                raise BladImportu(
                    f"{ident}: stopień glifu {u:.3f} boku kafla (położenie {pol}) poza "
                    f"[{zakres[0]}; {zakres[1]}]"
                )

    def prymityw_ts(r: Rysunek, noz_stanu: bool = False) -> dict[str, Any]:
        if r.rodzaj == "line":
            (a, b) = (swiat(r.punkty[0]), swiat(r.punkty[1]))
            wynik: dict[str, Any] = {"k": "line", "x1": a[0], "y1": a[1], "x2": b[0], "y2": b[1]}
            if noz_stanu:
                wynik["nozStanu"] = True
            if r.kreskowana:
                wynik["kreskowana"] = True
            return wynik
        if r.rodzaj == "circle":
            c = swiat(r.punkty[0])
            return {"k": "circle", "cx": c[0], "cy": c[1], "r": r.promien * skala, "fill": _fill(r)}
        if r.rodzaj == "polygon":
            pts = [swiat(q) for q in r.punkty]
            d = "M " + " L ".join(f"{liczba_ts(x)} {liczba_ts(y)}" for x, y in pts)
            if r.zamkniety:
                d += " Z"
            return {"k": "path", "d": d, "fill": _fill(r)}
        if r.rodzaj == "arc":
            a, b = swiat(r.punkty[0]), swiat(r.punkty[1])
            rr = liczba_ts(r.promien * skala)
            d = (
                f"M {liczba_ts(a[0])} {liczba_ts(a[1])} A {rr} {rr} 0 {r.luk_flagi[0]} "
                f"{r.luk_flagi[1]} {liczba_ts(b[0])} {liczba_ts(b[1])}"
            )
            return {"k": "arc", "d": d}
        if r.rodzaj == "letter":
            c = swiat(r.punkty[0])
            return {"k": "letter", "x": c[0], "y": c[1], "t": r.tekst, "size": r.rozmiar * skala}
        raise BladImportu(f"{ident}: prymityw {r.rodzaj} bez odwzorowania")

    def prostokat_ts(punkty: Sequence[tuple[float, float]]) -> dict[str, float]:
        x0, y0, x1, y1 = prostokat([swiat(q) for q in punkty])
        return {"x": zaokr(x0), "y": zaokr(y0), "width": zaokr(x1 - x0), "height": zaokr(y1 - y0)}

    wszystko = (
        tresc
        + obwiednia(przewody)
        + [punkt for _, punkt, _ in porty]
        + [w["punkt"] for w in wtorne_zrodlo]
    )
    wynik: dict[str, Any] = {
        "id": ident,
        "namePl": str(wpis["namePl"]),
        "zlozenie": wpis.get("zlozenie"),
        "szerokosc": zaokr(szer),
        "wysokosc": zaokr(wys),
        "porty": porty_swiat,
        "portyWtorne": porty_wtorne_swiat,
        "doprowadzenia": doprowadzenia,
        "obrys": prostokat_ts(wszystko),
        "glif": prostokat_ts([q for rys in rysunek_pol.values() for q in obwiednia(rys)]),
        "kafel": (
            {"x": 0, "y": 0, "width": zaokr(szer), "height": zaokr(wys)}
            if kafel is not None
            else None
        ),
        "przewody": [prymityw_ts(r) for r in przewody],
        "stale": [prymityw_ts(r) for r in glif_staly],
        "osprzet": [prymityw_ts(r) for r in osprzet_r],
        "noz": None,
        "zrodla": [
            {
                "sciezka": s.element.sciezka,
                "upstreamBlobSha": s.element.upstream_sha,
                "sha256": s.element.sha256,
            }
            for s in skladniki
        ],
    }
    if przegub is not None:
        c = swiat(przegub)
        wynik["noz"] = {
            "cx": zaokr(c[0]),
            "cy": zaokr(c[1]),
            "katy": {k: zaokr(katy[k]) for k in POLOZENIA if k in katy},
            "zasiegi": {k: zaokr(zasiegi[k]) for k in POLOZENIA if k in zasiegi},
            "prymitywy": [prymityw_ts(r, noz_stanu=True) for r in noz],
        }
    wynik["_udzialy"] = udzialy
    return wynik


def kafel_stanu(manifest: dict[str, Any], raster: float) -> KafelStanu | None:
    """Jednolity KWADRATOWY kafel stanu łączników (``kafelStanu`` manifestu): bok z JEDNEJ
    stałej ``bokQet`` (wymaganie właściciela 2026-10-29: kafle łączników są kwadratami
    o identycznych wymiarach, 48 × 48 jednostek świata w skali bazowej LOD2), NIE wyliczany
    z rysunku symbolu. Rysunek każdego łącznika (wszystkie położenia noża i osprzęt) musi się
    mieścić w kaflu z marginesem ``marginesQet`` — inaczej import jest przerywany
    (``zloz_symbol``), kafel się nie rozszerza. Kreska glifu ``kreskaGlifuQet`` jest częścią tej
    samej deklaracji, więc rośnie razem z kaflem."""
    deklaracja = manifest.get("kafelStanu")
    if deklaracja is None:
        return None
    powod = _powod(deklaracja, "kafelStanu", "kafel stanu")
    bok = float(deklaracja["bokQet"])
    margines = float(deklaracja["marginesQet"])
    kreska = float(deklaracja["kreskaGlifuQet"])
    if margines < 0:
        raise BladImportu("kafelStanu: ujemny margines")
    if bok <= 0 or abs(bok / (2 * raster) - round(bok / (2 * raster))) > 1e-9:
        raise BladImportu("kafelStanu: bok kafla musi być parzystą wielokrotnością rastru zacisków")
    if not 0 < kreska <= bok / 12:
        raise BladImportu("kafelStanu: kreska glifu poza (0; bok/12]")
    return KafelStanu(pol_szer=bok / 2, wysokosc=bok, margines=margines, kreska=kreska, powod=powod)


def stopien_symboli(manifest: dict[str, Any], kafel: KafelStanu | None) -> StopienSymboli | None:
    deklaracja = manifest.get("stopienSymboli")
    if deklaracja is None:
        return None
    if kafel is None:
        raise BladImportu("stopienSymboli: stopień mierzony bokiem kafla stanu — brak kafla")
    powod = _powod(deklaracja, "stopienSymboli", "stopień symboli")
    zakresy = []
    for klucz in ("kafel", "tor"):
        lo, hi = (float(v) for v in deklaracja[klucz])
        if not 0 < lo < hi <= 1:
            raise BladImportu(f"stopienSymboli: zakres {klucz} [{lo}; {hi}] niepoprawny")
        zakresy.append((lo, hi))
    return StopienSymboli(kafel=zakresy[0], tor=zakresy[1], bok=kafel.wysokosc, powod=powod)


def _fill(r: Rysunek) -> str:
    return {"none": "none", "black": "ink", "white": "paper"}[r.wypelnienie]


# ---------------------------------------------------------------------------
# Wyjście TS
# ---------------------------------------------------------------------------


def ts(wartosc: Any, wciecie: int = 0) -> str:
    odstep = "  " * wciecie
    if wartosc is None:
        return "null"
    if isinstance(wartosc, bool):
        return "true" if wartosc else "false"
    if isinstance(wartosc, int | float):
        return liczba_ts(float(wartosc))
    if isinstance(wartosc, str):
        return "'" + wartosc.replace("\\", "\\\\").replace("'", "\\'") + "'"
    if isinstance(wartosc, list):
        if not wartosc:
            return "[]"
        if all(not isinstance(v, dict | list) for v in wartosc):
            return "[" + ", ".join(ts(v) for v in wartosc) + "]"
        return "[\n" + "".join(f"{odstep}  {ts(v, wciecie + 1)},\n" for v in wartosc) + f"{odstep}]"
    if isinstance(wartosc, dict):
        if not wartosc:
            return "{}"
        proste = all(not isinstance(v, dict | list) for v in wartosc.values())
        if proste and len(wartosc) <= 8:
            return "{ " + ", ".join(f"{k}: {ts(v)}" for k, v in wartosc.items()) + " }"
        return (
            "{\n"
            + "".join(f"{odstep}  {k}: {ts(v, wciecie + 1)},\n" for k, v in wartosc.items())
            + f"{odstep}}}"
        )
    raise BladImportu(f"wartość {wartosc!r} bez odwzorowania TS")


NAGLOWEK = """/**
 * PLIK GENEROWANY — nie edytować ręcznie. Generator: `scripts/import_qet_pole_sn.py`
 * (karta UX-04/POLE-LINIOWE-WZORZEC), źródło: `docs/sld/vendor/qet/import_manifest.json`.
 * Odświeżenie: `python scripts/import_qet_pole_sn.py`; kontrola świeżości:
 * `python scripts/import_qet_pole_sn.py --sprawdz` (test `backend/tests/ci/test_qet_pole_sn_import.py`).
 *
 * Geometria symboli pola liniowego SN przeniesiona 1:1 z elementów QElectroTech
 * (kolekcja `qelectrotech-elements`, autor: The QElectroTech team, licencja CC BY 3.0,
 * https://creativecommons.org/licenses/by/3.0/). Współrzędne w jednostkach świata
 * schematu SLD v3 względem lewego górnego rogu gabarytu (skala 0,4 jednostki QET).
 * Prymitywy noża = rysunek źródła; każde położenie (otwarte, zamknięte, uziemione, nieznane) —
 * kąt obrotu noża (`noz.katy`, stopnie, konwencja SVG `rotate`; otwarte 0° albo jawny kierunek
 * manifestu) wokół przegubu (`noz.cx`, `noz.cy`) i zasięg noża (`noz.zasiegi`: w położeniu
 * zamkniętym i uziemionym koniec noża leży na styku stałym).
 * Jednokładność rysunku (`skalaRysunku` manifestu) przenosi kształt elementu bez zmian; role prymitywów: `przewody`
 * (kreska przewodu toru), `stale` i `noz` (rysunek aparatu — kreska glifu `QET_KRESKA_GLIFU`),
 * `osprzet` (napęd, cewka wyłączająca — kreska glifu).
 */
import type { SymbolPort } from '../../core/grid';
import type { CadPrimitive } from '../cadSymbolRegistry';

export type QetSymbolPolaSnId =
{unia};

export type QetPolozenieNoza = 'open' | 'closed' | 'earthed' | 'unknown';

export interface QetZrodloSymbolu {
  readonly sciezka: string;
  readonly upstreamBlobSha: string;
  readonly sha256: string;
}

export interface QetNozSymbolu {
  readonly cx: number;
  readonly cy: number;
  readonly katy: Readonly<Partial<Record<QetPolozenieNoza, number>>>;
  /** Zasięg noża w położeniu — ułamek długości noża źródła: koniec dalszy od przegubu leży
   *  w odległości `zasieg` × długość (ZAMKNIĘTY/UZIEMIONY — dokładnie na styku stałym). */
  readonly zasiegi: Readonly<Partial<Record<QetPolozenieNoza, number>>>;
  readonly prymitywy: readonly CadPrimitive[];
}

export interface QetProstokat {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface QetDoprowadzenie {
  readonly port: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly powod: string;
}

export interface QetSymbolPolaSn {
  readonly id: QetSymbolPolaSnId;
  readonly namePl: string;
  readonly zlozenie: string | null;
  readonly szerokosc: number;
  readonly wysokosc: number;
  readonly porty: readonly SymbolPort[];
  /** Porty OBWODU WTÓRNEGO (zacisk uzwojenia wtórnego, koniec doprowadzenia rdzenia, cewka
   *  wyłączająca i napęd wyłącznika) — zaczepienie linii pomiarowych i linii wyłączania;
   *  nie są portami toru pola. */
  readonly portyWtorne: readonly SymbolPort[];
  /** Odcinki przewodu od zacisku źródła leżącego wewnątrz gabarytu do portu na krawędzi
   *  (z powodem) — przewód, nie geometria elementu QET. */
  readonly doprowadzenia: readonly QetDoprowadzenie[];
  /** Obwiednia rysunku we WSZYSTKICH położeniach noża, przewodów, osprzętu i portów
   *  (względem gabarytu). */
  readonly obrys: QetProstokat;
  /** Obwiednia rysunku APARATU (glifu: `stale` i `noz` we wszystkich położeniach, bez
   *  przewodów i osprzętu) — miara stopnia symbolu (`stopienSymboli` manifestu). */
  readonly glif: QetProstokat;
  /** Jednolity kafel stanu łącznika z nożem (jeden rozmiar dla wszystkich łączników) albo
   *  `null` dla symbolu bez położenia. */
  readonly kafel: QetProstokat | null;
  /** Przewody toru i obwodu wtórnego w gabarycie (kreska przewodu). */
  readonly przewody: readonly CadPrimitive[];
  /** Rysunek aparatu poza nożem (kreska glifu). */
  readonly stale: readonly CadPrimitive[];
  /** Osprzęt łącznika: napęd silnikowy, cewka wyłączająca (kreska glifu). */
  readonly osprzet: readonly CadPrimitive[];
  readonly noz: QetNozSymbolu | null;
  readonly zrodla: readonly QetZrodloSymbolu[];
}

/** Bok JEDNOLITEGO kwadratowego kafla stanu łączników [jednostki świata, skala bazowa LOD2] —
 *  jedna stała manifestu (`kafelStanu.bokQet` × skala); gabaryt każdego łącznika z nożem. */
export const QET_BOK_KAFLA_STANU = {bokKafla};

/** Kreska glifu aparatu [jednostki świata, skala bazowa LOD2] — `kafelStanu.kreskaGlifuQet`
 *  × skala, proporcjonalna do boku kafla stanu (bok/24); przewody mają kreskę przewodu. */
export const QET_KRESKA_GLIFU = {kreskaGlifu};

/** Odmiana kroju, której metrykami importer liczy obwiednię i środek liter symboli — odmiana
 *  rysowana przez `CadPrimitiveLayer` (waga `WAGA_LITERY_SYMBOLU`, `cad/CadSymbol.tsx`). */
export const QET_ODMIANA_KROJU_LITER = '{odmianaLiter}';

export const QET_POCHODZENIE = {pochodzenie} as const;

export const QET_SYMBOLE_POLA_SN: Readonly<Record<QetSymbolPolaSnId, QetSymbolPolaSn>> = {
{symbole}};
"""


@dataclass(frozen=True)
class SymboleManifestu:
    """Symbole złożone z manifestu dokładnie tak, jak trafiają do pliku TS (jedna ścieżka
    składania dla generatora i testów — kafel stanu wyłącznie dla łączników z nożem)."""

    manifest: dict[str, Any]
    skala: float
    kafel: KafelStanu | None
    stopien: StopienSymboli | None
    symbole: list[dict[str, Any]]
    #: Stopień glifu każdego symbolu: wysokość rysunku aparatu wzdłuż osi toru / bok kafla stanu
    #: w każdym położeniu noża (miara, którą ``zloz_symbol`` sprawdza z ``stopienSymboli``).
    udzialy: dict[str, dict[str, float]]


def zloz_symbole_manifestu() -> SymboleManifestu:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1:
        raise BladImportu("nieznana wersja manifestu")
    skala = float(manifest["skala"])
    raster = float(manifest["rasterZaciskowQet"])
    if abs(raster * skala - 8) > 1e-9:
        raise BladImportu("raster zacisków QET po skali musi być siatką schematu (8)")
    elementy: dict[str, Element] = {}
    for wpis in manifest["elementy"]:
        if wpis["id"] in elementy:
            raise BladImportu(f"powtórzony identyfikator elementu {wpis['id']}")
        elementy[str(wpis["id"])] = wczytaj_element(wpis)
    kafel = kafel_stanu(manifest, raster)
    stopien = stopien_symboli(manifest, kafel)
    symbole = [
        zloz_symbol(w, elementy, skala, raster, kafel if w.get("noz") else None, stopien)
        for w in manifest["symbole"]
    ]
    udzialy = {str(s["id"]): s.pop("_udzialy") for s in symbole}
    identyfikatory = [s["id"] for s in symbole]
    if len(set(identyfikatory)) != len(identyfikatory):
        raise BladImportu("powtórzony identyfikator symbolu")
    uzyte = {z["sciezka"] for s in symbole for z in s["zrodla"]}
    if uzyte != {e.sciezka for e in elementy.values()}:
        raise BladImportu("element źródła w manifeście nieużyty przez żaden symbol")
    return SymboleManifestu(
        manifest=manifest,
        skala=skala,
        kafel=kafel,
        stopien=stopien,
        symbole=symbole,
        udzialy=udzialy,
    )


def generuj() -> str:
    zlozone = zloz_symbole_manifestu()
    manifest, skala, kafel, symbole = (
        zlozone.manifest,
        zlozone.skala,
        zlozone.kafel,
        zlozone.symbole,
    )
    identyfikatory = [s["id"] for s in symbole]
    pochodzenie = {
        "repozytorium": manifest["origin"],
        "commit": manifest["upstreamCommit"],
        "licencja": manifest["license"],
        "licencjaUrl": manifest["licenseUrl"],
        "autor": manifest["attribution"],
    }
    tresc = NAGLOWEK.replace(
        "{unia}", "\n".join(f"  | '{i}'" for i in identyfikatory) + ""
    ).replace("{pochodzenie}", ts(pochodzenie))
    tresc = tresc.replace(
        "{bokKafla}", liczba_ts(kafel.wysokosc * skala) if kafel is not None else "null"
    ).replace("{kreskaGlifu}", liczba_ts(kafel.kreska * skala) if kafel is not None else "null")
    tresc = tresc.replace("{odmianaLiter}", WAGA_TEKSTU_QET)
    tresc = tresc.replace("{symbole}", "".join(f"  {s['id']}: {ts(s, 1)},\n" for s in symbole))
    return tresc


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sprawdz", action="store_true", help="porównaj z plikiem, bez zapisu")
    args = parser.parse_args(argv)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    cel = KORZEN / str(manifest["wyjscie"])
    try:
        tresc = generuj()
    except BladImportu as exc:
        print(f"import QET przerwany: {exc}", file=sys.stderr)
        return 2
    if args.sprawdz:
        if not cel.exists() or cel.read_text(encoding="utf-8") != tresc:
            print(f"{cel.relative_to(KORZEN)} rozjechany z generatorem — uruchom bez --sprawdz")
            return 1
        print(f"{cel.relative_to(KORZEN)} zgodny z generatorem")
        return 0
    cel.parent.mkdir(parents=True, exist_ok=True)
    cel.write_text(tresc, encoding="utf-8")
    print(f"zapisano {cel.relative_to(KORZEN)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
