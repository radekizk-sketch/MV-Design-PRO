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
* geometria nie jest przerysowywana: prymitywy źródła są przenoszone przekształceniami
  zachowującymi kształt (obrót o wielokrotność 90°, przesunięcie, jednokładność, podobieństwo
  noża), a manifest podaje wyłącznie złożenie, role prymitywów i to, które zaciski są portami;
* tekst źródła ma jawną decyzję (``pomin``/``zachowaj``) — tekst bez decyzji przerywa import;
* każdy zacisk źródła jest portem, zaciskiem wewnętrznym złożenia albo zaciskiem spoza toru
  pierwotnego zadeklarowanym z powodem (``zaciskiPozaTorem``, np. uzwojenie wtórne
  przekładnika napięciowego, zacisk elementu, z którego łącznik bierze tylko znacznik styku);
  zaciski wewnętrzne muszą się pokrywać po złożeniu;
* łącznik z położeniem składa się WYŁĄCZNIE układem kafla (``kafelStanu.uklad``, wzorzec HMI
  e²TANGO, decyzja właściciela 2026-10-30): zawias noża u dołu, styk stały u góry, nóż pionowy =
  ZAMKNIĘTY, obrót o kąt z układu = OTWARTY, połowa kąta z zasięgiem z układu = NIEUSTALONY,
  obrót na zestyk uziemiający = UZIEMIONY; przy styku stałym ZNACZNIK rodzaju aparatu („×”
  wyłącznik, „○” odłącznik i człon wysuwny, kreska z okręgiem rozłącznik, kreska uziemnik)
  w jednym rozmiarze kafla, symbol ziemi pod uziemnikiem skierowany w dół; każdy prymityw
  źródła ma dokładnie jedną rolę układu albo jawne pominięcie, a rozmiar znacznika, margines,
  odstęp od noża i kierunek ziemi są sprawdzane (``uloz_kafel_lacznika``);
* jednokładność rysunku symbolu toru (``skalaRysunku``: skala k ∈ (1; 4] wokół punktu, z powodem)
  i skala lokalna prymitywów (``skalaLokalna``: okrąg styku rozłącznika, napęd, doprowadzenie
  obwodu wtórnego) przenoszą kształt źródła bez zmian; stopień glifu (wysokość rysunku aparatu / bok kafla
  stanu) musi leżeć w zakresie ``stopienSymboli`` — kafel [0,55; 0,70], tor [0,33; 0,70];
* role prymitywów symbolu toru: przewód (linia z zacisku portu w kierunku portu) i glif (rysunek
  aparatu); przewody przycinane do gabarytu;
* gabaryt symbolu toru: obwiednia rysunku aparatu i portów obwodu wtórnego, symetryczna względem
  osi toru (port ``bottom``, a bez niego ``top``) i domknięta do rastru zacisków QET (20 j.) od
  pierwszego portu, więc po skali 0,4 porty i gabaryt leżą na siatce schematu GRID = 8; łącznik
  z położeniem — jednolity kwadratowy kafel stanu (porty na krawędziach kafla, na rastrze).

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
    w osi y skierowanej w DÓŁ — linia bazowa leży ``LINIA_CENTRALNA_EM`` pod środkiem.
    """
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
    złożenia). Jednokładność przenosi kształt źródła bez zmian (wszystkie odległości × k).
    """

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
#: (nóż i znaczniki styków łącznika, okręgi przekładników) — kreska glifu proporcjonalna do kafla
#: stanu, jego wysokość mierzy stopień symbolu; ``osprzet`` — napęd łącznika zadeklarowany
#: w manifeście — kreska glifu, poza miarą stopnia, w kaflu z marginesem. Symbol ziemi łącznika
#: (``ziemia`` wyjścia) — kreska glifu, poza miarą stopnia.
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
    """Prymityw noża w ZASIĘGU położenia: jednokładność o skali ``zasieg`` wokół przegubu —
    nóż sztywny, każdy punkt (ostrze i wkładka bezpiecznika na nożu) przesuwa się do przegubu
    w tej samej proporcji, więc kształt noża się nie zmienia (dawna reguła „przesuń wyłącznie
    dalszy koniec każdej linii" deformowała wkładkę bezpiecznika). Ta sama reguła co renderer
    (``frontend/src/ui/sld/v3/symbols/glyphs.tsx::prymitywyNozaQet``)."""
    if zasieg == 1.0:
        return r
    if r.rodzaj != "line":
        raise BladImportu(f"prymityw noża {r.rodzaj!r} — nóż składa się wyłącznie z linii")
    return replace(
        r,
        punkty=[
            (przegub[0] + (q[0] - przegub[0]) * zasieg, przegub[1] + (q[1] - przegub[1]) * zasieg)
            for q in r.punkty
        ],
    )


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
    łączników w każdym położeniu noża, dla symboli toru bez kafla w położeniu jedynym.
    """

    kafel: tuple[float, float]
    tor: tuple[float, float]
    bok: float
    powod: str


def _na_rastrze(wartosc: float, odniesienie: float, raster: float) -> bool:
    reszta = (wartosc - odniesienie) / raster
    return abs(reszta - round(reszta)) <= 1e-9


def _blisko(a: tuple[float, float], b: tuple[float, float], tol: float = 1e-9) -> bool:
    return abs(a[0] - b[0]) <= tol and abs(a[1] - b[1]) <= tol


def wysokosc_glifu(rysunki: Sequence[Rysunek]) -> float:
    """Wysokość rysunku wzdłuż osi toru (miara stopnia symbolu)."""
    _, y0, _, y1 = prostokat(obwiednia(rysunki))
    return y1 - y0


def sprawdz_stopien(ident: str, udzialy: dict[str, float], zakres: tuple[float, float]) -> None:
    for pol, u in sorted(udzialy.items()):
        if not zakres[0] - 1e-9 <= u <= zakres[1] + 1e-9:
            raise BladImportu(
                f"{ident}: stopień glifu {u:.3f} boku kafla (położenie {pol}) poza "
                f"[{zakres[0]}; {zakres[1]}]"
            )


def prymityw_ts_swiata(
    r: Rysunek, swiat: Any, skala: float, ident: str, noz_stanu: bool = False
) -> dict[str, Any]:
    """Prymityw rysunku w układzie świata schematu (``swiat``: punkt QET → punkt świata)."""
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


def prostokat_ts_swiata(punkty: Sequence[tuple[float, float]], swiat: Any) -> dict[str, float]:
    x0, y0, x1, y1 = prostokat([swiat(q) for q in punkty])
    return {"x": zaokr(x0), "y": zaokr(y0), "width": zaokr(x1 - x0), "height": zaokr(y1 - y0)}


def zloz_symbol(
    wpis: dict[str, Any],
    elementy: dict[str, Element],
    skala: float,
    raster: float,
    stopien: StopienSymboli | None = None,
) -> dict[str, Any]:
    """Symbol TORU bez położenia (przekładniki, głowica, wskaźnik napięcia, pole wolne): złożenie
    elementów źródła, przewody przycięte do gabarytu domkniętego do rastru. Łącznik z nożem
    składa się WYŁĄCZNIE układem kafla (``uloz_kafel_lacznika``)."""
    ident = str(wpis["symbolId"])
    liczba_skladnikow = len(wpis["skladniki"])
    for klucz in ("noz", "ukladKafla", "osprzet"):
        if wpis.get(klucz):
            raise BladImportu(f"{ident}: {klucz} wyłącznie w układzie kafla łącznika")

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

    stale: list[Rysunek] = []
    for si, s in enumerate(skladniki):
        for p in zrodlowe[si]:
            r = zloz_prymityw(p, s, "glif")
            if r is not None:
                stale.append(r)

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

    # Przewód: linia stała, której koniec leży na zacisku portu toru albo na punkcie źródła
    # portu obwodu wtórnego, równoległa do kierunku tego portu. Pozostałe linie są rysunkiem
    # aparatu (glif). Symbol z deklaracją ``przewodyJakoRysunek``
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

    glif_staly = [r for r in stale if r.rola == "glif"]
    if not glif_staly:
        raise BladImportu(f"{ident}: symbol bez rysunku aparatu (same przewody)")
    tresc = obwiednia(glif_staly)
    przewody = [r for r in stale if r.rola == "przewod"]

    nazwy_portow = {nazwa: punkt for nazwa, punkt, _ in porty}
    os_x = (nazwy_portow.get("bottom") or nazwy_portow.get("top") or p0)[0]
    t_min_x, t_min_y, t_max_x, t_max_y = prostokat(tresc)

    # Gabaryt: wzdłuż osi toru — treść (rysunek aparatu) oraz porty obwodu wtórnego, domknięte
    # do rastru od portu; w poprzek — symetrycznie wokół osi toru. Symbol z przewodami jako
    # rysunkiem: gabaryt obejmuje też porty (reguła źródła).
    wtorne_punkty = [w["punkt"] for w in wtorne_zrodlo]
    poprzecznie = [t_min_x, t_max_x] + [q[0] for q in wtorne_punkty]
    if przewody_jako_rysunek is not None:
        poprzecznie += [q[0] for q in obwiednia(przewody)] + [q[0] for _, q, _ in porty]
    pol_szer = raster * math.ceil(round(max(abs(v - os_x) for v in poprzecznie) / raster, 9))
    wzdluz = [t_min_y, t_max_y] + [q[1] for q in wtorne_punkty]
    if przewody_jako_rysunek is not None:
        wzdluz += [q[1] for q in obwiednia(przewody)] + [q[1] for _, q, _ in porty]
    g_min_y = domknij_w_dol(min(wzdluz), p0[1], raster)
    g_max_y = domknij_w_gore(max(wzdluz), p0[1], raster)
    g_min_x, g_max_x = os_x - pol_szer, os_x + pol_szer

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
    # wyżej). Port wewnątrz gabarytu (deklaracja ``portyWewnatrzGabarytu`` z powodem) jest
    # przedłużany odcinkiem PRZEWODU do krawędzi — port leży na krawędzi jak w całej bibliotece
    # (sonda portów spec §11.3), odcinek jest jawny w wyjściu (``doprowadzenia``).
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

    # Stopień symbolu toru: wysokość glifu wzdłuż osi toru / bok kafla stanu w zakresie toru.
    udzialy: dict[str, float] = {}
    if stopien is not None:
        udzialy = {"open": wysokosc_glifu(glif_staly) / stopien.bok}
        sprawdz_stopien(ident, udzialy, stopien.tor)

    def prymityw_ts(r: Rysunek) -> dict[str, Any]:
        return prymityw_ts_swiata(r, swiat, skala, ident)

    def prostokat_ts(punkty: Sequence[tuple[float, float]]) -> dict[str, float]:
        return prostokat_ts_swiata(punkty, swiat)

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
        "glif": prostokat_ts(obwiednia(glif_staly)),
        "kafel": None,
        "przewody": [prymityw_ts(r) for r in przewody],
        "stale": [prymityw_ts(r) for r in glif_staly],
        "osprzet": [],
        "noz": None,
        "znaczniki": [],
        "ziemia": None,
        "zrodla": [
            {
                "sciezka": s.element.sciezka,
                "upstreamBlobSha": s.element.upstream_sha,
                "sha256": s.element.sha256,
            }
            for s in skladniki
        ],
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


# ---------------------------------------------------------------------------
# Układ kafla łącznika (decyzja właściciela 2026-10-30, wzorzec HMI e²TANGO)
# ---------------------------------------------------------------------------

#: Kotwica znacznika rodzaju aparatu przy styku stałym — JEDNA tabela importera i renderera
#: (eksport do TS: ``QET_KOTWICE_ZNACZNIKOW``). ``srodek``: środek obwiedni znacznika leży
#: w punkcie styku — nóż zamyka się na środku znaku (krzyżyk wyłącznika; kreska styku
#: uziemnika). ``od_przegubu``: punkt obwiedni zwrócony do przegubu leży w punkcie styku — nóż
#: dochodzi do okręgu, nie przechodzi przez niego (okrąg odłącznika i członu wysuwnego; okrąg
#: rozłącznika zawieszony pod kreską styku). ``obok_krzyzyka``: znacznik członu wysuwnego
#: (okrąg „○", rozstrzygnięcie architekta 2026-10-30 pkt 3) stoi OBOK krzyżyka wyłącznika, po
#: stronie przeciwnej do noża otwartego, na wysokości styku zamknięcia — środek w odległości
#: boku znacznika + ``odstepWysuwuQet`` od osi toru; kotwica (punkt, wokół którego znacznik rośnie
#: na podłodze LOD1) = lewy bok obwiedni krzyżyka na wysokości styku.
RODZAJE_ZNACZNIKOW: dict[str, str] = {
    "wylacznik": "srodek",
    "odlacznik": "od_przegubu",
    "rozlacznik": "od_przegubu",
    "uziemnik": "srodek",
    "czlon_wysuwny": "obok_krzyzyka",
}
#: Styk znacznika członu wysuwnego — nie jest położeniem noża (nóż nigdy na nim nie spoczywa).
STYK_WYSUWU = "wysuw"
#: Położenia, w których nóż spoczywa na styku stałym (styk znacznika).
STYKI = ("closed", "earthed")


@dataclass(frozen=True)
class RodzajUkladuKafla:
    """Rozmieszczenie jednego rodzaju łącznika w kaflu (jednostki QET, początek w lewym górnym
    rogu kafla): przegub noża, styki stałe położeń ``closed``/``earthed`` i punkt przyłączenia
    symbolu ziemi (``przegub`` — uziemnik: przegub łączy się z ziemią; ``earthed`` — łącznik
    trójpołożeniowy: dolny koniec kreski zestyku uziemiającego)."""

    przegub: tuple[float, float]
    styki: dict[str, tuple[float, float]]
    ziemia_przy: str | None


@dataclass(frozen=True)
class UkladKafla:
    """Jedna deklaracja proporcji kafla łącznika (``kafelStanu.uklad`` manifestu) — znacznik
    rodzaju aparatu przy styku stałym, nóż, symbol ziemi i rozmieszczenie rodzajów. Wszystkie
    łączniki pola biorą rozmiar znacznika, margines, odstęp od noża, kąt położenia otwartego
    i rozmiar ziemi z tej deklaracji, więc proporcje są te same w każdym rodzaju i stanie.
    """

    bok_znacznika: float
    udzial_znacznika: tuple[float, float]
    margines_znacznika: float
    odstep: float
    strefa_styku: float
    odstep_wysuwu: float
    kat_otwarty: float
    zasieg_nieustalony: float
    szerokosc_ziemi: float
    pion_ziemi: float
    rodzaje: dict[str, RodzajUkladuKafla]
    powod: str


def _punkt(v: Sequence[Any], co: str) -> tuple[float, float]:
    if len(v) != 2:
        raise BladImportu(f"{co}: punkt musi mieć dwie współrzędne")
    return (float(v[0]), float(v[1]))


def uklad_kafla(manifest: dict[str, Any], kafel: KafelStanu | None) -> UkladKafla | None:
    deklaracja = (manifest.get("kafelStanu") or {}).get("uklad")
    if deklaracja is None:
        return None
    if kafel is None:
        raise BladImportu("kafelStanu.uklad: układ kafla bez kafla stanu")
    powod = _powod(deklaracja, "kafelStanu.uklad", "układ kafla")
    zn = deklaracja["znacznik"]
    bok = float(zn["bokQet"])
    udzial = (float(zn["udzial"][0]), float(zn["udzial"][1]))
    if not 0 < udzial[0] < udzial[1] < 1:
        raise BladImportu(f"kafelStanu.uklad: przedział udziału znacznika {list(udzial)} błędny")
    u = bok / kafel.wysokosc
    if not udzial[0] - 1e-9 <= u <= udzial[1] + 1e-9:
        raise BladImportu(
            f"kafelStanu.uklad: znacznik {bok * 0.4:.2f} j.św. to {u:.3f} boku kafla — poza "
            f"[{udzial[0]}; {udzial[1]}] (za mały albo za duży)"
        )
    margines = float(zn["marginesQet"])
    odstep = float(zn["odstepOdNozaQet"])
    strefa = float(zn["strefaStykuQet"])
    odstep_wysuwu = float(zn["odstepWysuwuQet"])
    if margines < 0 or odstep < 0 or strefa <= 0 or odstep_wysuwu < 0:
        raise BladImportu("kafelStanu.uklad: margines, odstęp i strefa styku nieujemne")
    noz = deklaracja["noz"]
    kat = float(noz["katOtwarty"])
    zasieg = float(noz["zasiegNieustalony"])
    if not 0 < kat < 90:
        raise BladImportu(f"kafelStanu.uklad: kąt położenia otwartego {kat}° poza (0; 90)")
    if not 0 < zasieg < 1:
        raise BladImportu(f"kafelStanu.uklad: zasięg położenia nieustalonego {zasieg} poza (0; 1)")
    ziemia = deklaracja["ziemia"]
    szer_ziemi = float(ziemia["szerokoscQet"])
    pion = float(ziemia["pionQet"])
    if szer_ziemi <= 0 or pion <= 0:
        raise BladImportu("kafelStanu.uklad: szerokość i pion symbolu ziemi dodatnie")
    os_x = kafel.wysokosc / 2
    rodzaje: dict[str, RodzajUkladuKafla] = {}
    for nazwa, r in sorted(deklaracja["rodzaje"].items()):
        przegub = _punkt(r["przegub"], f"kafelStanu.uklad.{nazwa}.przegub")
        styki = {
            pol: _punkt(v, f"kafelStanu.uklad.{nazwa}.styki.{pol}")
            for pol, v in sorted(r["styki"].items())
        }
        if set(styki) - set(STYKI) or "closed" not in styki:
            raise BladImportu(f"kafelStanu.uklad.{nazwa}: styki {sorted(styki)} spoza {STYKI}")
        zamk = styki["closed"]
        # Zawias u dołu, styk stały u góry, nóż pionowy = zamknięty (wzorzec HMI e²TANGO).
        if not (abs(przegub[0] - os_x) <= 1e-9 and abs(zamk[0] - os_x) <= 1e-9):
            raise BladImportu(f"kafelStanu.uklad.{nazwa}: przegub i styk zamknięcia poza osią toru")
        if not zamk[1] < przegub[1]:
            raise BladImportu(f"kafelStanu.uklad.{nazwa}: styk zamknięcia nie leży nad przegubem")
        if "earthed" in styki:
            e = styki["earthed"]
            kat_e = normalizuj_kat(kat_kierunku(przegub, e) - kat_kierunku(przegub, zamk))
            if not kat < kat_e < 180:
                raise BladImportu(
                    f"kafelStanu.uklad.{nazwa}: położenie otwarte {kat}° nie leży między "
                    f"zamkniętym (0°) a uziemionym ({kat_e:.1f}°)"
                )
        ziemia_przy = r.get("ziemiaPrzy")
        if ziemia_przy not in (None, "przegub", "earthed") or (
            ziemia_przy == "earthed" and "earthed" not in styki
        ):
            raise BladImportu(f"kafelStanu.uklad.{nazwa}: przyłączenie ziemi {ziemia_przy!r}")
        for co, q in [("przegub", przegub), *styki.items()]:
            if not (0 <= q[0] <= kafel.wysokosc and 0 <= q[1] <= kafel.wysokosc):
                raise BladImportu(f"kafelStanu.uklad.{nazwa}: {co} poza kaflem")
        rodzaje[nazwa] = RodzajUkladuKafla(przegub=przegub, styki=styki, ziemia_przy=ziemia_przy)
    return UkladKafla(
        bok_znacznika=bok,
        udzial_znacznika=udzial,
        margines_znacznika=margines,
        odstep=odstep,
        strefa_styku=strefa,
        odstep_wysuwu=odstep_wysuwu,
        kat_otwarty=kat,
        zasieg_nieustalony=zasieg,
        szerokosc_ziemi=szer_ziemi,
        pion_ziemi=pion,
        rodzaje=rodzaje,
        powod=powod,
    )


def przeksztalc(r: Rysunek, f: Any, skala_dlugosci: float) -> Rysunek:
    """Rysunek po podobieństwie ``f`` (punkt → punkt) o skali długości ``skala_dlugosci`` —
    kształt bez zmian (jednokładność, przesunięcie, obrót noża)."""
    return replace(
        r,
        punkty=[f(q) for q in r.punkty],
        promien=r.promien * skala_dlugosci,
        rozmiar=r.rozmiar * skala_dlugosci,
        luk_probki=[f(q) for q in r.luk_probki],
    )


Ksztalt = tuple[str, tuple[float, float], Any]


def _ksztalty(r: Rysunek) -> list[Ksztalt]:
    """Rysunek jako odcinki i okręgi (linia środkowa kreski) — do pomiaru odstępów."""
    if r.rodzaj == "line":
        return [("odcinek", r.punkty[0], r.punkty[1])]
    if r.rodzaj == "polygon":
        pts = list(r.punkty) + ([r.punkty[0]] if r.zamkniety else [])
        return [("odcinek", a, b) for a, b in zip(pts, pts[1:], strict=False)]
    if r.rodzaj == "circle":
        return [("okrag", r.punkty[0], r.promien)]
    if r.rodzaj == "arc":
        pr = r.luk_probki
        return [("odcinek", a, b) for a, b in zip(pr, pr[1:], strict=False)]
    if r.rodzaj == "letter":
        (x0, y0), (x1, y1) = obwiednia([r])
        naroza = [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]
        return [("odcinek", a, b) for a, b in zip(naroza, naroza[1:], strict=False)]
    raise BladImportu(f"kształt {r.rodzaj!r} bez pomiaru odstępu")


def _odl_punkt_odcinek(p: tuple[float, float], a: tuple[float, float], b: tuple[float, float]):
    dx, dy = b[0] - a[0], b[1] - a[1]
    dl2 = dx * dx + dy * dy
    t = 0.0 if dl2 == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / dl2))
    return math.dist(p, (a[0] + t * dx, a[1] + t * dy))


def _przecinaja(a, b, c, d) -> bool:
    def orient(p, q, r) -> float:
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    o1, o2, o3, o4 = orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b)
    return (o1 * o2 < 0) and (o3 * o4 < 0)


def _odl_ksztaltow(k1: Ksztalt, k2: Ksztalt) -> float:
    if k1[0] == "okrag" and k2[0] == "odcinek":
        k1, k2 = k2, k1
    if k1[0] == "odcinek" and k2[0] == "odcinek":
        a, b, c, d = k1[1], k1[2], k2[1], k2[2]
        if _przecinaja(a, b, c, d):
            return 0.0
        return min(
            _odl_punkt_odcinek(a, c, d),
            _odl_punkt_odcinek(b, c, d),
            _odl_punkt_odcinek(c, a, b),
            _odl_punkt_odcinek(d, a, b),
        )
    if k1[0] == "odcinek":
        (a, b), (c, r) = (k1[1], k1[2]), (k2[1], k2[2])
        dmin = _odl_punkt_odcinek(c, a, b)
        dmax = max(math.dist(a, c), math.dist(b, c))
        if dmin <= r <= dmax:
            return 0.0
        return dmin - r if r < dmin else r - dmax
    (c1, r1), (c2, r2) = (k1[1], k1[2]), (k2[1], k2[2])
    d = math.dist(c1, c2)
    if d >= r1 + r2:
        return d - r1 - r2
    if d <= abs(r1 - r2):
        return abs(r1 - r2) - d
    return 0.0


def _poza_kolem(r: Rysunek, srodek: tuple[float, float], promien: float) -> list[Rysunek]:
    """Linia noża bez części leżącej w kole (strefa styku albo przegubu) — odcinki poza kołem."""
    if r.rodzaj != "line":
        raise BladImportu("strefa styku: prymityw noża nie jest linią")
    (a, b) = r.punkty
    dx, dy = b[0] - a[0], b[1] - a[1]
    fx, fy = a[0] - srodek[0], a[1] - srodek[1]
    aa = dx * dx + dy * dy
    bb = 2 * (fx * dx + fy * dy)
    cc = fx * fx + fy * fy - promien * promien
    delta = bb * bb - 4 * aa * cc
    if aa == 0 or delta <= 0:
        return [r]
    t1 = (-bb - math.sqrt(delta)) / (2 * aa)
    t2 = (-bb + math.sqrt(delta)) / (2 * aa)
    wynik = []
    for lo, hi in ((0.0, min(t1, 1.0)), (max(t2, 0.0), 1.0)):
        if hi - lo > 1e-9:
            wynik.append(
                replace(
                    r, punkty=[(a[0] + lo * dx, a[1] + lo * dy), (a[0] + hi * dx, a[1] + hi * dy)]
                )
            )
    return wynik


def odleglosc_rysunkow(g1: Sequence[Rysunek], g2: Sequence[Rysunek]) -> float:
    """Najmniejsza odległość linii środkowych dwóch grup rysunku (∞ dla grupy pustej)."""
    k1 = [k for r in g1 for k in _ksztalty(r)]
    k2 = [k for r in g2 for k in _ksztalty(r)]
    return min((_odl_ksztaltow(a, b) for a in k1 for b in k2), default=math.inf)


def _przeciecia_z_osia(rysunki: Sequence[Rysunek], os_x: float) -> list[float]:
    """Wysokości, na których rysunek przecina pionową oś toru ``x = os_x``."""
    ys: list[float] = []
    for r in rysunki:
        for k in _ksztalty(r):
            if k[0] == "odcinek":
                (a, b) = (k[1], k[2])
                if min(a[0], b[0]) - 1e-9 <= os_x <= max(a[0], b[0]) + 1e-9:
                    if abs(a[0] - b[0]) <= 1e-9:
                        ys += [a[1], b[1]]
                    else:
                        t = (os_x - a[0]) / (b[0] - a[0])
                        ys.append(a[1] + t * (b[1] - a[1]))
            else:
                (c, rr) = (k[1], k[2])
                dx = abs(c[0] - os_x)
                if dx <= rr + 1e-9:
                    h = math.sqrt(max(rr * rr - dx * dx, 0.0))
                    ys += [c[1] - h, c[1] + h]
    return ys


def uloz_kafel_lacznika(
    wpis: dict[str, Any],
    elementy: dict[str, Element],
    skala: float,
    raster: float,
    kafel: KafelStanu,
    stopien: StopienSymboli | None,
    uklad: UkladKafla,
) -> dict[str, Any]:
    """Łącznik w JEDNOLITYM kaflu stanu wg wzorca HMI e²TANGO (decyzja właściciela 2026-10-30):
    zawias noża u dołu, styk stały u góry, nóż pionowy = zamknięty, ukośny = otwarty; przy
    styku stałym ZNACZNIK rodzaju aparatu („×” wyłącznik, „○” odłącznik, kreska z okręgiem
    rozłącznik, kreska uziemnik) w jednym rozmiarze; symbol ziemi pod uziemnikiem, skierowany
    w dół, na końcu pionu odgałęzienia; osprzęt = wyłącznie napęd (atrybut łącznika).

    Geometria pochodzi z prymitywów źródła QET — każdy prymityw ma rolę (nóż, znacznik styku,
    ziemia, osprzęt) albo jawne pominięcie z powodem; rolę rozmieszcza przekształcenie
    zachowujące kształt (podobieństwo noża: przegub źródła → przegub układu, koniec ostrza →
    styk zamknięcia; jednokładność znacznika i ziemi do rozmiaru z ``kafelStanu.uklad``;
    przesunięcie osprzętu do przegubu). Przewody toru generuje układ: od portu górnego do
    pierwszego punktu znacznika styku zamknięcia na osi toru i od przegubu do portu dolnego.
    """
    ident = str(wpis["symbolId"])
    deklaracja = wpis["ukladKafla"]
    for klucz in ("skalaRysunku", "noz", "portyWewnatrzGabarytu", "zaciskiWewnetrzne"):
        if wpis.get(klucz) is not None:
            raise BladImportu(f"{ident}: {klucz} zbędne w układzie kafla — rozmiar z układu")
    rodzaj = uklad.rodzaje.get(str(deklaracja.get("rodzaj")))
    if rodzaj is None:
        raise BladImportu(f"{ident}: rodzaj układu kafla {deklaracja.get('rodzaj')!r} nieznany")
    bok = kafel.wysokosc
    os_x = bok / 2
    H = rodzaj.przegub
    C = rodzaj.styki["closed"]

    skladniki = [
        Skladnik(
            element=elementy[str(s["element"])],
            obrot=int(s["obrot"]),
            przesuniecie=(float(s["przesuniecie"][0]), float(s["przesuniecie"][1])),
        )
        for s in wpis["skladniki"]
    ]
    for s in skladniki:
        if s.obrot not in OBROT_KIERUNKU:
            raise BladImportu(f"{ident}: obrót {s.obrot} poza wielokrotnością 90°")
    zrodlowe = prymitywy_skladnikow(wpis, skladniki, ident)

    # Role prymitywów: każdy prymityw źródła ma DOKŁADNIE jedną rolę albo jawne pominięcie.
    role: dict[tuple[int, int], str] = {}

    def przypisz(si: int, pi: int, rola: str) -> None:
        if not 0 <= si < len(zrodlowe) or not 0 <= pi < len(zrodlowe[si]):
            raise BladImportu(f"{ident}: {rola} — prymityw {pi} składnika {si} poza źródłem")
        if zrodlowe[si][pi].rodzaj == "pominiety":
            raise BladImportu(f"{ident}: {rola} — prymityw {pi} składnika {si} pominięty")
        if (si, pi) in role:
            raise BladImportu(f"{ident}: prymityw {pi} składnika {si} ma dwie role")
        role[(si, pi)] = rola

    noz_d = deklaracja["noz"]
    si_noza = int(noz_d["skladnik"])
    for pi in noz_d["prymitywy"]:
        przypisz(si_noza, int(pi), "noz")
    znaczniki_d = list(deklaracja.get("znaczniki", []))
    if [z.get("styk") for z in znaczniki_d].count(STYK_WYSUWU) > 1:
        raise BladImportu(f"{ident}: więcej niż jeden znacznik członu wysuwnego")
    for i, z in enumerate(znaczniki_d):
        if z.get("rodzaj") not in RODZAJE_ZNACZNIKOW:
            raise BladImportu(f"{ident}: rodzaj znacznika {z.get('rodzaj')!r} nieznany")
        wysuw = z.get("rodzaj") == "czlon_wysuwny"
        if wysuw != (z.get("styk") == STYK_WYSUWU):
            raise BladImportu(
                f"{ident}: znacznik członu wysuwnego wyłącznie przy styku {STYK_WYSUWU!r} "
                f"(znacznik {z.get('rodzaj')!r} przy {z.get('styk')!r})"
            )
        if not wysuw and z.get("styk") not in rodzaj.styki:
            raise BladImportu(f"{ident}: znacznik przy styku {z.get('styk')!r} spoza układu")
        for pi in z["prymitywy"]:
            przypisz(int(z["skladnik"]), int(pi), f"znacznik{i}")
    styki_zn = [z["styk"] for z in znaczniki_d]
    for styk in rodzaj.styki:
        if styki_zn.count(styk) != 1:
            raise BladImportu(
                f"{ident}: styk {styk} ma {styki_zn.count(styk)} znaczników — wymagany dokładnie "
                "jeden (brak znacznika przerywa import)"
            )
    rodzaj_przy = {z["styk"]: z["rodzaj"] for z in znaczniki_d}
    if STYK_WYSUWU in rodzaj_przy and rodzaj_przy.get("closed") != "wylacznik":
        raise BladImportu(
            f"{ident}: znacznik członu wysuwnego wyłącznie obok krzyżyka wyłącznika "
            f"(styk zamknięcia: {rodzaj_przy.get('closed')!r})"
        )
    rodzaj_przy.pop(STYK_WYSUWU, None)
    ziemia_d = deklaracja.get("ziemia")
    styk_ziemi = {"przegub": "closed", "earthed": "earthed"}.get(str(rodzaj.ziemia_przy))
    for styk, rz in rodzaj_przy.items():
        if (rz == "uziemnik") != (styk == styk_ziemi):
            raise BladImportu(
                f"{ident}: znacznik uziemnika wyłącznie przy styku, do którego przyłączona jest "
                f"ziemia (styk {styk}: {rz})"
            )
    if (ziemia_d is None) != (rodzaj.ziemia_przy is None):
        raise BladImportu(f"{ident}: symbol ziemi wyłącznie w rodzaju z przyłączeniem ziemi")
    if ziemia_d is not None:
        for pi in ziemia_d["prymitywy"]:
            przypisz(int(ziemia_d["skladnik"]), int(pi), "ziemia")
    osprzet_si: set[int] = set()
    for o in wpis.get("osprzet", []):
        si = int(o["skladnik"])
        _powod(o, ident, "osprzęt")
        if not 0 <= si < len(zrodlowe):
            raise BladImportu(f"{ident}: osprzęt wskazuje składnik spoza złożenia")
        if si == si_noza:
            raise BladImportu(f"{ident}: składnik noża nie może być osprzętem")
        osprzet_si.add(si)
        for pi, p in enumerate(zrodlowe[si]):
            if p.rodzaj != "pominiety":
                przypisz(si, pi, "osprzet")
    for si, prymitywy in enumerate(zrodlowe):
        for pi, p in enumerate(prymitywy):
            if p.rodzaj != "pominiety" and (si, pi) not in role:
                raise BladImportu(
                    f"{ident}: prymityw {pi} składnika {si} bez roli w układzie kafla — "
                    "przypisz rolę albo pomiń z powodem"
                )

    def rysunki(rola: str, kolejnosc: Sequence[tuple[int, int]] | None = None) -> list[Rysunek]:
        klucze = (
            kolejnosc if kolejnosc is not None else sorted(k for k, v in role.items() if v == rola)
        )
        wynik = []
        for si, pi in klucze:
            r = zloz_prymityw(zrodlowe[si][pi], skladniki[si], "glif")
            if r is not None:
                wynik.append(r)
        return wynik

    # Nóż: podobieństwo przegub źródła → przegub układu, koniec ostrza → styk zamknięcia.
    s_n = skladniki[si_noza]
    p0 = s_n.punkt(_punkt(noz_d["przegub"], f"{ident}: przegub"))
    p1 = s_n.punkt(_punkt(noz_d["koniec"], f"{ident}: koniec noża"))
    noz_zr = rysunki("noz", [(si_noza, int(pi)) for pi in noz_d["prymitywy"]])
    if any(r.rodzaj != "line" for r in noz_zr):
        raise BladImportu(f"{ident}: nóż składa się wyłącznie z linii źródła")
    ostrze = noz_zr[0]
    if not (
        (_blisko(ostrze.punkty[0], p0, 1e-6) and _blisko(ostrze.punkty[1], p1, 1e-6))
        or (_blisko(ostrze.punkty[1], p0, 1e-6) and _blisko(ostrze.punkty[0], p1, 1e-6))
    ):
        raise BladImportu(f"{ident}: przegub i koniec noża nie są końcami ostrza źródła")
    w = complex(C[0] - H[0], C[1] - H[1]) / complex(p1[0] - p0[0], p1[1] - p0[1])

    def podobienstwo_noza(q: tuple[float, float]) -> tuple[float, float]:
        z = complex(H[0], H[1]) + w * complex(q[0] - p0[0], q[1] - p0[1])
        return (z.real, z.imag)

    noz = [przeksztalc(r, podobienstwo_noza, abs(w)) for r in noz_zr]

    # Znaczniki: jednokładność do boku znacznika, kotwica z tabeli rodzajów.
    znaczniki: list[tuple[dict[str, Any], list[Rysunek]]] = []
    for i, z in enumerate(znaczniki_d):
        rys = rysunki(f"znacznik{i}")
        x0, y0, x1, y1 = prostokat(obwiednia(rys))
        wym = max(x1 - x0, y1 - y0)
        if wym <= 0:
            raise BladImportu(f"{ident}: znacznik {z['rodzaj']} bez wymiaru")
        sigma = uklad.bok_znacznika / wym
        if RODZAJE_ZNACZNIKOW[z["rodzaj"]] == "obok_krzyzyka":
            # Środek okręgu obok krzyżyka, po stronie przeciwnej do noża otwartego (nóż otwiera
            # się w prawo), na wysokości styku zamknięcia.
            styk = (C[0] - uklad.bok_znacznika - uklad.odstep_wysuwu, C[1])
            a = ((x0 + x1) / 2, (y0 + y1) / 2)
        elif RODZAJE_ZNACZNIKOW[z["rodzaj"]] == "srodek":
            styk = rodzaj.styki[z["styk"]]
            a = ((x0 + x1) / 2, (y0 + y1) / 2)
        else:
            styk = rodzaj.styki[z["styk"]]
            dx, dy = H[0] - styk[0], H[1] - styk[1]
            if abs(dx) > 1e-9 and abs(dy) > 1e-9:
                raise BladImportu(f"{ident}: przegub nie leży na osi styku {z['styk']}")
            if dy > 1e-9:
                a = ((x0 + x1) / 2, y1)
            elif dy < -1e-9:
                a = ((x0 + x1) / 2, y0)
            elif dx > 0:
                a = (x1, (y0 + y1) / 2)
            else:
                a = (x0, (y0 + y1) / 2)

        def jednokladnosc(
            q: tuple[float, float],
            a: tuple[float, float] = a,
            styk: tuple[float, float] = styk,
            sigma: float = sigma,
        ) -> tuple[float, float]:
            return (styk[0] + sigma * (q[0] - a[0]), styk[1] + sigma * (q[1] - a[1]))

        umieszczone = [przeksztalc(r, jednokladnosc, sigma) for r in rys]
        if z["rodzaj"] == "uziemnik":
            # Kreska styku uziemnika: jedna linia prostopadła do noża w położeniu na styku.
            if len(umieszczone) != 1 or umieszczone[0].rodzaj != "line":
                raise BladImportu(f"{ident}: znacznik uziemnika = jedna kreska styku")
            (a1, b1) = umieszczone[0].punkty
            n = (styk[0] - H[0], styk[1] - H[1])
            if abs((b1[0] - a1[0]) * n[0] + (b1[1] - a1[1]) * n[1]) > 1e-6:
                raise BladImportu(f"{ident}: kreska styku uziemnika nie jest prostopadła do noża")
        znaczniki.append((z, umieszczone))

    # Ziemia: jednokładność do szerokości z układu, górna (najszersza) kreska na końcu pionu
    # odgałęzienia pod punktem przyłączenia; kreski malejące w dół.
    ziemia: list[Rysunek] = []
    kotwica_ziemi: tuple[float, float] | None = None
    if ziemia_d is not None:
        rys = rysunki("ziemia")
        for r in rys:
            if r.rodzaj != "line" or abs(r.punkty[0][1] - r.punkty[1][1]) > 1e-9:
                raise BladImportu(f"{ident}: symbol ziemi = wyłącznie kreski poziome źródła")
        rys.sort(key=lambda r: r.punkty[0][1])
        szer = [abs(r.punkty[0][0] - r.punkty[1][0]) for r in rys]
        if len(rys) < 3 or any(b >= a for a, b in zip(szer, szer[1:], strict=False)):
            raise BladImportu(
                f"{ident}: symbol ziemi skierowany w górę albo niepełny — kreski {szer} muszą "
                "maleć w dół (najszersza u góry, przy pionie odgałęzienia)"
            )
        srodki = [(r.punkty[0][0] + r.punkty[1][0]) / 2 for r in rys]
        if max(srodki) - min(srodki) > 1e-6:
            raise BladImportu(f"{ident}: kreski symbolu ziemi nie leżą na jednej osi")
        sigma = uklad.szerokosc_ziemi / szer[0]
        gora = rys[0]
        a = ((gora.punkty[0][0] + gora.punkty[1][0]) / 2, gora.punkty[0][1])
        if rodzaj.ziemia_przy == "przegub":
            kotwica_ziemi = H
        else:
            kreska = next(r for z, rr in znaczniki if z["styk"] == "earthed" for r in rr)
            kotwica_ziemi = max(kreska.punkty, key=lambda q: q[1])
        cel = (kotwica_ziemi[0], kotwica_ziemi[1] + uklad.pion_ziemi)

        def jednokladnosc_ziemi(q: tuple[float, float]) -> tuple[float, float]:
            return (cel[0] + sigma * (q[0] - a[0]), cel[1] + sigma * (q[1] - a[1]))

        ziemia = [Rysunek(rodzaj="line", punkty=[kotwica_ziemi, cel])] + [
            przeksztalc(r, jednokladnosc_ziemi, sigma) for r in rys
        ]

    # Osprzęt (napęd): złożenie źródła przesunięte tak, że kotwica napędu leży w przegubie.
    osprzet: list[Rysunek] = []
    if osprzet_si:
        kotwica = _punkt(deklaracja["osprzetKotwica"], f"{ident}: kotwica osprzętu")
        t = (H[0] - kotwica[0], H[1] - kotwica[1])
        osprzet = [
            przeksztalc(r, lambda q: (q[0] + t[0], q[1] + t[1]), 1.0) for r in rysunki("osprzet")
        ]
    elif deklaracja.get("osprzetKotwica") is not None:
        raise BladImportu(f"{ident}: kotwica osprzętu bez osprzętu")

    # Porty toru: górny przy styku stałym, dolny przy przegubie (brak dolnego — uziemnik).
    wykorzystane: set[tuple[int, float, float]] = set()

    def zacisk_zrodla(si: int, xy: Sequence[float]) -> tuple[tuple[float, float], str]:
        s = skladniki[si]
        for zc in s.element.zaciski:
            if (zc.x, zc.y) == (float(xy[0]), float(xy[1])):
                wykorzystane.add((si, zc.x, zc.y))
                return s.punkt((zc.x, zc.y)), OBROT_KIERUNKU[s.obrot][zc.kierunek]
        raise BladImportu(f"{ident}: składnik {si} nie ma zacisku {list(xy)}")

    oczekiwane_porty = ["top"] + ([] if rodzaj.ziemia_przy == "przegub" else ["bottom"])
    porty: list[tuple[str, tuple[float, float], str]] = []
    for p in wpis["porty"]:
        nazwa = str(p["name"])
        punkt_zr, kier = zacisk_zrodla(int(p["skladnik"]), p["zacisk"])
        if int(p["skladnik"]) != si_noza:
            raise BladImportu(f"{ident}: port {nazwa} z zacisku spoza składnika noża")
        przy_styku = math.dist(punkt_zr, p1) < math.dist(punkt_zr, p0)
        if (nazwa, kier, przy_styku) not in (("top", "N", True), ("bottom", "S", False)):
            raise BladImportu(
                f"{ident}: port {nazwa} ({kier}) nie odpowiada zaciskowi źródła — górny przy "
                "styku stałym (N), dolny przy przegubie (S)"
            )
        porty.append((nazwa, (os_x, 0.0) if nazwa == "top" else (os_x, bok), kier))
    for w_ in wpis.get("zaciskiPozaTorem", []):
        _powod(w_, ident, f"zacisk poza torem {w_.get('zacisk')}")
        zacisk_zrodla(int(w_["skladnik"]), w_["zacisk"])
    for si, s in enumerate(skladniki):
        for zc in s.element.zaciski:
            if (si, zc.x, zc.y) not in wykorzystane:
                raise BladImportu(f"{ident}: zacisk źródła {(zc.x, zc.y)} bez przypisania")
    # Porty toru z rodzaju układu: górny zawsze, dolny poza uziemnikiem (przegub uziemnika łączy
    # się z ziemią, nie z torem) — zbiór portów i zbiór wymagany przez rodzaj muszą być równe.
    if [n for n, _, _ in porty] != oczekiwane_porty:
        raise BladImportu(f"{ident}: porty {[n for n, _, _ in porty]} ≠ {oczekiwane_porty}")
    wtorne: list[tuple[str, tuple[float, float], str]] = []
    for p in wpis.get("portyWtorne", []):
        _powod(p, ident, f"port wtórny {p['name']}")
        q = _punkt(p["punkt"], f"{ident}: port wtórny {p['name']}")
        kier = str(p.get("dir"))
        na_krawedzi = {
            "N": abs(q[1]) <= 1e-9,
            "S": abs(q[1] - bok) <= 1e-9,
            "W": abs(q[0]) <= 1e-9,
            "E": abs(q[0] - bok) <= 1e-9,
        }.get(kier)
        if not na_krawedzi:
            raise BladImportu(f"{ident}: port wtórny {p['name']} poza krawędzią kafla {kier}")
        wtorne.append((str(p["name"]), q, kier))
    for co, lista in (("port", porty), ("port wtórny", wtorne)):
        for nazwa, q, _ in lista:
            if not (_na_rastrze(q[0], 0.0, raster) and _na_rastrze(q[1], 0.0, raster)):
                raise BladImportu(f"{ident}: {co} {nazwa} poza rastrem zacisków QET")

    # Przewody toru z układu.
    zamk = next(rr for z, rr in znaczniki if z["styk"] == "closed")
    wejscia = [y for y in _przeciecia_z_osia(zamk, os_x) if y <= C[1] + 1e-9]
    if not wejscia:
        raise BladImportu(f"{ident}: znacznik styku zamknięcia nie przecina osi toru")
    przewody = [Rysunek(rodzaj="line", punkty=[(os_x, 0.0), (os_x, min(wejscia))], rola="przewod")]
    if "bottom" in oczekiwane_porty:
        przewody.append(Rysunek(rodzaj="line", punkty=[H, (os_x, bok)], rola="przewod"))

    # Położenia noża: zamknięty 0°, otwarty — kąt z układu (w stronę przeciwną do znacznika
    # nad osią), nieustalony — połowa drogi z zasięgiem z układu, uziemiony — kąt na zestyk.
    katy = {"closed": 0.0, "open": uklad.kat_otwarty, "unknown": uklad.kat_otwarty / 2}
    zasiegi = {"closed": 1.0, "open": 1.0, "unknown": uklad.zasieg_nieustalony}
    if "earthed" in rodzaj.styki:
        e = rodzaj.styki["earthed"]
        katy["earthed"] = normalizuj_kat(kat_kierunku(H, e) - kat_kierunku(H, C))
        zasiegi["earthed"] = math.dist(H, e) / math.dist(H, C)
    polozenia = {
        pol: [obroc_rysunek(noz_w_zasiegu(r, zasiegi[pol], H), katy[pol], H) for r in noz]
        for pol in POLOZENIA
        if pol in katy
    }

    # Mieszczenie w kaflu: rysunek z marginesem kafla, znacznik (z grubością kreski) z marginesem
    # znacznika.
    m = kafel.margines
    tresc = [q for rys in polozenia.values() for q in obwiednia(rys)]
    tresc += obwiednia([r for _, rr in znaczniki for r in rr]) + obwiednia(ziemia + osprzet)
    t_min_x, t_min_y, t_max_x, t_max_y = prostokat(tresc)
    if (
        t_min_x < m - 1e-9
        or t_min_y < m - 1e-9
        or t_max_x > bok - m + 1e-9
        or t_max_y > bok - m + 1e-9
    ):
        raise BladImportu(f"{ident}: rysunek łącznika nie mieści się w kaflu stanu")
    mz = uklad.margines_znacznika + kafel.kreska / 2
    for z, rr in znaczniki:
        x0, y0, x1, y1 = prostokat(obwiednia(rr))
        if x0 < mz - 1e-9 or y0 < mz - 1e-9 or x1 > bok - mz + 1e-9 or y1 > bok - mz + 1e-9:
            raise BladImportu(
                f"{ident}: znacznik {z['rodzaj']} bliżej krawędzi kafla niż margines "
                f"{uklad.margines_znacznika * skala:.1f} j.św."
            )

    # Odstępy: linia środkowa ≥ kreska glifu + odstęp, poza strefą styku, na którym nóż leży
    # w danym położeniu, i strefą przegubu (sprzężenie napędu, pion ziemi uziemnika).
    minimum = kafel.kreska + uklad.odstep

    def sprawdz_odstep(opis: str, g1: Sequence[Rysunek], g2: Sequence[Rysunek]) -> None:
        d = odleglosc_rysunkow(g1, g2)
        if d < minimum - 1e-9:
            raise BladImportu(
                f"{ident}: {opis} — odstęp linii {d * skala:.2f} j.św. < {minimum * skala:.2f} "
                "(znacznik nachodzi na nóż albo rysunek się styka)"
            )

    def bez_strefy(rys: Sequence[Rysunek], srodek: tuple[float, float]) -> list[Rysunek]:
        return [q for r in rys for q in _poza_kolem(r, srodek, uklad.strefa_styku)]

    for pol, rys in sorted(polozenia.items()):
        for z, rr in znaczniki:
            noz_pol = bez_strefy(rys, rodzaj.styki[z["styk"]]) if z["styk"] == pol else rys
            sprawdz_odstep(f"nóż ({pol}) i znacznik {z['rodzaj']}", noz_pol, rr)
        if ziemia:
            noz_pol = bez_strefy(rys, H) if rodzaj.ziemia_przy == "przegub" else rys
            sprawdz_odstep(f"nóż ({pol}) i symbol ziemi", noz_pol, ziemia)
        if osprzet:
            sprawdz_odstep(f"nóż ({pol}) i napęd", bez_strefy(rys, H), osprzet)
    for i, (z1, r1) in enumerate(znaczniki):
        for z2, r2 in znaczniki[i + 1 :]:
            sprawdz_odstep(f"znaczniki {z1['rodzaj']} i {z2['rodzaj']}", r1, r2)
        if ziemia:
            ziemia_z = ziemia[1:] if z1["rodzaj"] == "uziemnik" else ziemia
            sprawdz_odstep(f"znacznik {z1['rodzaj']} i symbol ziemi", r1, ziemia_z)
        if osprzet:
            sprawdz_odstep(f"znacznik {z1['rodzaj']} i napęd", r1, osprzet)
    if ziemia and osprzet:
        sprawdz_odstep("symbol ziemi i napęd", ziemia, osprzet)

    # Stopień: nóż i znaczniki (aparat łączeniowy) w każdym położeniu; ziemia i napęd poza miarą.
    rys_znacznikow = [r for _, rr in znaczniki for r in rr]
    udzialy = {
        pol: wysokosc_glifu(rys_znacznikow + rys) / (stopien.bok if stopien else bok)
        for pol, rys in polozenia.items()
    }
    if stopien is not None:
        sprawdz_stopien(ident, udzialy, stopien.kafel)

    def swiat(q: tuple[float, float]) -> tuple[float, float]:
        return (q[0] * skala, q[1] * skala)

    def ts_(r: Rysunek, noz_stanu: bool = False) -> dict[str, Any]:
        return prymityw_ts_swiata(r, swiat, skala, ident, noz_stanu)

    def punkt_ts(q: tuple[float, float]) -> dict[str, float]:
        x, y = swiat(q)
        return {"x": zaokr(x), "y": zaokr(y)}

    wszystko = tresc + obwiednia(przewody) + [q for _, q, _ in porty + wtorne]
    glif = [q for rys in polozenia.values() for q in obwiednia(rys)] + obwiednia(rys_znacznikow)
    wynik: dict[str, Any] = {
        "id": ident,
        "namePl": str(wpis["namePl"]),
        "zlozenie": wpis.get("zlozenie"),
        "szerokosc": zaokr(bok * skala),
        "wysokosc": zaokr(bok * skala),
        "porty": [{"name": n, **punkt_ts(q), "dir": k} for n, q, k in porty],
        "portyWtorne": [{"name": n, **punkt_ts(q), "dir": k} for n, q, k in wtorne],
        "doprowadzenia": [],
        "obrys": prostokat_ts_swiata(wszystko, swiat),
        "glif": prostokat_ts_swiata(glif, swiat),
        "kafel": {"x": 0, "y": 0, "width": zaokr(bok * skala), "height": zaokr(bok * skala)},
        "przewody": [ts_(r) for r in przewody],
        "stale": [],
        "osprzet": [ts_(r) for r in osprzet],
        "noz": {
            **{"cx": zaokr(H[0] * skala), "cy": zaokr(H[1] * skala)},
            "katy": {k: zaokr(katy[k]) for k in POLOZENIA if k in katy},
            "zasiegi": {k: zaokr(zasiegi[k]) for k in POLOZENIA if k in zasiegi},
            "prymitywy": [ts_(r, noz_stanu=True) for r in noz],
        },
        "znaczniki": [
            {
                "rodzaj": z["rodzaj"],
                "styk": z["styk"],
                "kotwica": punkt_ts(
                    (C[0] - uklad.bok_znacznika / 2, C[1])
                    if z["styk"] == STYK_WYSUWU
                    else rodzaj.styki[z["styk"]]
                ),
                "prymitywy": [ts_(r) for r in rr],
            }
            for z, rr in znaczniki
        ],
        "ziemia": (
            {"kotwica": punkt_ts(kotwica_ziemi), "prymitywy": [ts_(r) for r in ziemia]}
            if kotwica_ziemi is not None
            else None
        ),
        "zrodla": [
            {
                "sciezka": s.element.sciezka,
                "upstreamBlobSha": s.element.upstream_sha,
                "sha256": s.element.sha256,
            }
            for s in skladniki
        ],
    }
    wynik["_udzialy"] = udzialy
    return wynik


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
 * Prymitywy noża = ostrze źródła ułożone w kaflu; każde położenie (zamknięte, otwarte, uziemione,
 * nieznane) — kąt obrotu noża (`noz.katy`, stopnie, konwencja SVG `rotate`; zamknięte 0°, otwarte
 * i nieznane z `kafelStanu.uklad.noz` manifestu, uziemione — kąt na zestyk uziemiający) wokół
 * przegubu (`noz.cx`, `noz.cy`) i zasięg noża (`noz.zasiegi`: w położeniu zamkniętym
 * i uziemionym koniec noża leży na styku stałym).
 * Role prymitywów: `przewody` (kreska przewodu toru), `stale` (rysunek symbolu toru; jednokładność
 * `skalaRysunku` manifestu przenosi kształt elementu bez zmian), `noz`, `znaczniki`, `ziemia`
 * i `osprzet` (napęd — atrybut łącznika) — kreska glifu `QET_KRESKA_GLIFU`.
 * Łącznik z położeniem (kafel stanu, `kafelStanu.uklad` manifestu, wzorzec HMI e²TANGO): zawias noża
 * u dołu, styk stały u góry, nóż pionowy = zamknięty; przy styku stałym `znaczniki` rodzaju aparatu
 * (`QET_ZNACZNIK_STYKU`, kotwice `QET_KOTWICE_ZNACZNIKOW`) i `ziemia` — symbol uziemienia skierowany
 * w dół, na końcu pionu odgałęzienia (`QET_ZIEMIA_KAFLA`).
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

/** Rodzaj aparatu rozpoznawany po znaczniku przy styku stałym (wzorzec HMI e²TANGO). */
export type QetRodzajZnacznika = 'wylacznik' | 'odlacznik' | 'rozlacznik' | 'uziemnik' | 'czlon_wysuwny';

export interface QetPunkt {
  readonly x: number;
  readonly y: number;
}

/** Znacznik rodzaju aparatu przy styku stałym: `kotwica` = punkt styku, na którym spoczywa nóż
 *  w położeniu `styk` (zamkniętym albo uziemionym) — punkt, wokół którego znacznik rośnie na
 *  podłodze LOD1. Znacznik członu wysuwnego (`styk` = `wysuw`, okrąg obok krzyżyka wyłącznika):
 *  kotwica = lewy bok obwiedni krzyżyka na wysokości styku zamknięcia. */
export interface QetZnacznikStyku {
  readonly rodzaj: QetRodzajZnacznika;
  readonly styk: 'closed' | 'earthed' | 'wysuw';
  readonly kotwica: QetPunkt;
  readonly prymitywy: readonly CadPrimitive[];
}

/** Symbol uziemienia łącznika: `kotwica` = punkt przyłączenia (przegub uziemnika albo dolny koniec
 *  kreski zestyku uziemiającego); pierwszy prymityw to pion odgałęzienia, dalej kreski malejące
 *  w dół. */
export interface QetZiemiaSymbolu {
  readonly kotwica: QetPunkt;
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
  /** Porty OBWODU WTÓRNEGO (zacisk uzwojenia wtórnego, koniec doprowadzenia rdzenia, koniec
   *  linii wyłączania na krawędzi kafla wyłącznika) — zaczepienie linii pomiarowych i linii
   *  wyłączania; nie są portami toru pola. */
  readonly portyWtorne: readonly SymbolPort[];
  /** Odcinki przewodu od zacisku źródła leżącego wewnątrz gabarytu do portu na krawędzi
   *  (z powodem) — przewód, nie geometria elementu QET. */
  readonly doprowadzenia: readonly QetDoprowadzenie[];
  /** Obwiednia rysunku we WSZYSTKICH położeniach noża, przewodów, osprzętu i portów
   *  (względem gabarytu). */
  readonly obrys: QetProstokat;
  /** Obwiednia rysunku APARATU (glifu: `stale`, `noz` we wszystkich położeniach i `znaczniki`,
   *  bez przewodów, ziemi i osprzętu) — miara stopnia symbolu (`stopienSymboli` manifestu). */
  readonly glif: QetProstokat;
  /** Jednolity kafel stanu łącznika z nożem (jeden rozmiar dla wszystkich łączników) albo
   *  `null` dla symbolu bez położenia. */
  readonly kafel: QetProstokat | null;
  /** Przewody toru i obwodu wtórnego w gabarycie (kreska przewodu). */
  readonly przewody: readonly CadPrimitive[];
  /** Rysunek aparatu symbolu toru (kreska glifu); łącznik z kaflem stanu — pusty. */
  readonly stale: readonly CadPrimitive[];
  /** Osprzęt łącznika: napęd (atrybut łącznika, kreska glifu). */
  readonly osprzet: readonly CadPrimitive[];
  readonly noz: QetNozSymbolu | null;
  /** Znaczniki rodzaju aparatu przy stykach stałych łącznika (pusta lista — symbol toru). */
  readonly znaczniki: readonly QetZnacznikStyku[];
  /** Symbol uziemienia skierowany w dół (uziemnik, łącznik trójpołożeniowy) albo `null`. */
  readonly ziemia: QetZiemiaSymbolu | null;
  readonly zrodla: readonly QetZrodloSymbolu[];
}

/** Bok JEDNOLITEGO kwadratowego kafla stanu łączników [jednostki świata, skala bazowa LOD2] —
 *  jedna stała manifestu (`kafelStanu.bokQet` × skala); gabaryt każdego łącznika z nożem. */
export const QET_BOK_KAFLA_STANU = {bokKafla};

/** Kreska glifu aparatu [jednostki świata, skala bazowa LOD2] — `kafelStanu.kreskaGlifuQet`
 *  × skala, proporcjonalna do boku kafla stanu (bok/24); przewody mają kreskę przewodu. */
export const QET_KRESKA_GLIFU = {kreskaGlifu};

/** Znacznik rodzaju aparatu przy styku stałym [jednostki świata, skala bazowa LOD2] —
 *  `kafelStanu.uklad.znacznik` × skala (decyzja właściciela 2026-10-30): `bok` = większy wymiar
 *  znacznika (linia środkowa), `udzial` = dopuszczalny przedział boku / bok kafla, `margines` =
 *  najmniejsza odległość tuszu znacznika od krawędzi kafla, `odstep` = najmniejsza odległość tuszu
 *  znacznika od tuszu noża poza strefą styku, `strefa` = promień strefy styku (wokół punktu, w którym
 *  nóż spoczywa na styku, i wokół przegubu), `odstepWysuwu` = odstęp linii środkowych znacznika
 *  członu wysuwnego od obwiedni krzyżyka wyłącznika. Kreska znacznika = `QET_KRESKA_GLIFU`. */
export const QET_ZNACZNIK_STYKU = {znacznikStyku} as const;

/** Kotwica znacznika względem punktu styku: `srodek` — środek obwiedni znacznika w punkcie styku,
 *  `od_przegubu` — bok obwiedni zwrócony do przegubu w punkcie styku, `obok_krzyzyka` — okrąg
 *  członu wysuwnego obok krzyżyka wyłącznika, po stronie przeciwnej do noża otwartego. */
export const QET_KOTWICE_ZNACZNIKOW = {kotwiceZnacznikow} as const;

/** Symbol uziemienia łącznika [jednostki świata, skala bazowa LOD2]: szerokość górnej (najszerszej)
 *  kreski i długość pionu odgałęzienia od punktu przyłączenia. */
export const QET_ZIEMIA_KAFLA = {ziemiaKafla} as const;

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
    uklad: UkladKafla | None
    symbole: list[dict[str, Any]]
    #: Stopień glifu każdego symbolu: wysokość rysunku aparatu wzdłuż osi toru / bok kafla stanu
    #: w każdym położeniu noża (miara, którą ``zloz_symbol`` i ``uloz_kafel_lacznika`` sprawdzają
    #: z ``stopienSymboli``).
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
    uklad = uklad_kafla(manifest, kafel)
    symbole = []
    for w in manifest["symbole"]:
        if w.get("ukladKafla") is not None:
            if kafel is None or uklad is None:
                raise BladImportu(f"{w['symbolId']}: układ kafla bez deklaracji kafelStanu.uklad")
            symbole.append(uloz_kafel_lacznika(w, elementy, skala, raster, kafel, stopien, uklad))
        else:
            symbole.append(zloz_symbol(w, elementy, skala, raster, stopien))
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
        uklad=uklad,
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
    uklad = zlozone.uklad
    if uklad is None:
        raise BladImportu("kafelStanu.uklad: brak deklaracji układu kafla łączników")
    tresc = tresc.replace(
        "{znacznikStyku}",
        ts(
            {
                "bok": zaokr(uklad.bok_znacznika * skala),
                "udzial": [uklad.udzial_znacznika[0], uklad.udzial_znacznika[1]],
                "margines": zaokr(uklad.margines_znacznika * skala),
                "odstep": zaokr(uklad.odstep * skala),
                "strefa": zaokr(uklad.strefa_styku * skala),
                "odstepWysuwu": zaokr(uklad.odstep_wysuwu * skala),
            }
        ),
    )
    tresc = tresc.replace("{kotwiceZnacznikow}", ts(dict(RODZAJE_ZNACZNIKOW)))
    tresc = tresc.replace(
        "{ziemiaKafla}",
        ts(
            {
                "szerokosc": zaokr(uklad.szerokosc_ziemi * skala),
                "pion": zaokr(uklad.pion_ziemi * skala),
            }
        ),
    )
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
