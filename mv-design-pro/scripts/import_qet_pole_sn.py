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
  wokół przegubu na kierunek styku stałego; NIEZNANY = połowa kąta zamknięcia (łącznik
  dwupołożeniowy) albo położenie źródła (łącznik trójpołożeniowy, ``nieznanyJakOtwarty``);
* gabaryt: obwiednia wszystkich położeń i portów, symetryczna względem osi toru (port
  ``bottom``, a bez niego ``top``) i domknięta do rastru zacisków QET (20 j.), więc po
  skali 0,4 porty i gabaryt leżą na siatce schematu GRID = 8.

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
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

KORZEN = Path(__file__).resolve().parents[1]
MANIFEST = KORZEN / "docs" / "sld" / "vendor" / "qet" / "import_manifest.json"
ZRODLA = KORZEN / "docs" / "sld" / "vendor" / "qet"

MAX_BAJTOW = 200_000
MAX_WSPOLRZEDNA = 10_000.0
FIGURY = {"line", "polygon", "ellipse", "arc", "text"}
IGNOROWANE = {"dynamic_text", "input"}
KIERUNKI = {"n": "N", "s": "S", "e": "E", "w": "W"}
OBROT_KIERUNKU = {
    0: {"N": "N", "E": "E", "S": "S", "W": "W"},
    90: {"N": "E", "E": "S", "S": "W", "W": "N"},
    180: {"N": "S", "E": "W", "S": "N", "W": "E"},
    -90: {"N": "W", "E": "N", "S": "E", "W": "S"},
}
POLOZENIA = ("open", "closed", "earthed", "unknown")
#: Przybliżenie metryki tekstu źródła (QET zapisuje punkt bazowy, nie obrys): szerokość
#: 0,6 em na znak, wysokość 0,7 em — używane WYŁĄCZNIE do obwiedni i środka znaku.
EM_SZEROKOSC = 0.6
EM_WYSOKOSC = 0.7


class BladImportu(ValueError):
    """Źródło lub manifest poza dopuszczonym podzbiorem — import przerwany."""


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
    if wynik["line-style"] != "normal":
        raise BladImportu(f"styl kreski {wynik['line-style']!r} nieobsługiwany")
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
    element: Element
    obrot: int
    przesuniecie: tuple[float, float]

    def punkt(self, p: tuple[float, float]) -> tuple[float, float]:
        x, y = obroc(p, self.obrot)
        return (x + self.przesuniecie[0], y + self.przesuniecie[1])


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


def zloz_prymityw(p: Prymityw, s: Skladnik) -> Rysunek | None:
    if p.rodzaj == "pominiety":
        return None
    if p.rodzaj == "arc":
        assert p.luk is not None
        probki = [s.punkt(q) for q in punkty_luku(p.luk)]
        kat = p.luk[4]
        return Rysunek(
            rodzaj="arc",
            punkty=[probki[0], probki[-1]],
            promien=p.luk[2],
            luk_flagi=(int(abs(kat) > 180), int(kat < 0)),
            luk_probki=probki,
        )
    if p.rodzaj == "letter":
        (x, y) = p.punkty[0]
        szer = EM_SZEROKOSC * p.rozmiar * max(1, len(p.tekst))
        srodek = (x + szer / 2, y - EM_WYSOKOSC * p.rozmiar / 2)
        if s.obrot != 0:
            raise BladImportu("tekst w składniku obróconym nieobsługiwany")
        return Rysunek(rodzaj="letter", punkty=[s.punkt(srodek)], tekst=p.tekst, rozmiar=p.rozmiar)
    return Rysunek(
        rodzaj=p.rodzaj,
        punkty=[s.punkt(q) for q in p.punkty],
        promien=p.promien,
        zamkniety=p.zamkniety,
        wypelnienie=p.wypelnienie,
    )


def obroc_rysunek(r: Rysunek, stopnie: float, wokol: tuple[float, float]) -> Rysunek:
    return Rysunek(
        rodzaj=r.rodzaj,
        punkty=[obroc(q, stopnie, wokol) for q in r.punkty],
        promien=r.promien,
        zamkniety=r.zamkniety,
        wypelnienie=r.wypelnienie,
        tekst=r.tekst,
        rozmiar=r.rozmiar,
        luk_flagi=r.luk_flagi,
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
            pol_s = EM_SZEROKOSC * r.rozmiar * max(1, len(r.tekst)) / 2
            pol_w = EM_WYSOKOSC * r.rozmiar / 2
            punkty += [(cx - pol_s, cy - pol_w), (cx + pol_s, cy + pol_w)]
        else:
            punkty += r.punkty
    return punkty


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


def zloz_symbol(
    wpis: dict[str, Any], elementy: dict[str, Element], skala: float, raster: float
) -> dict[str, Any]:
    ident = str(wpis["symbolId"])
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

    noz_wpis = wpis.get("noz")
    indeksy_noza: set[tuple[int, int]] = set()
    if noz_wpis:
        indeksy_noza = {(int(noz_wpis["skladnik"]), int(i)) for i in noz_wpis["prymitywy"]}

    stale: list[Rysunek] = []
    noz: list[Rysunek] = []
    for si, s in enumerate(skladniki):
        for pi, p in enumerate(s.element.prymitywy):
            r = zloz_prymityw(p, s)
            if (si, pi) in indeksy_noza:
                if r is None or r.rodzaj != "line":
                    raise BladImportu(f"{ident}: prymityw noża {pi} nie jest linią źródła")
                noz.append(r)
            elif r is not None:
                stale.append(r)
    if noz_wpis and len(noz) != len(indeksy_noza):
        raise BladImportu(f"{ident}: indeks prymitywu noża poza źródłem")

    katy: dict[str, float] = {}
    przegub: tuple[float, float] | None = None
    if noz_wpis:
        s_noza = skladniki[int(noz_wpis["skladnik"])]
        przegub = s_noza.punkt((float(noz_wpis["przegub"][0]), float(noz_wpis["przegub"][1])))
        ostrze = noz[0]
        koniec = max(ostrze.punkty, key=lambda q: math.dist(q, przegub))
        katy["open"] = 0.0
        for polozenie, cel in sorted(noz_wpis["cele"].items()):
            if polozenie not in ("closed", "earthed"):
                raise BladImportu(f"{ident}: położenie {polozenie!r} nieznane")
            cel_zl = s_noza.punkt((float(cel[0]), float(cel[1])))
            katy[polozenie] = normalizuj_kat(
                kat_kierunku(przegub, cel_zl) - kat_kierunku(przegub, koniec)
            )
        if "closed" not in katy:
            raise BladImportu(f"{ident}: brak położenia zamkniętego noża")
        katy["unknown"] = 0.0 if noz_wpis.get("nieznanyJakOtwarty") else katy["closed"] / 2

    # Porty i zaciski: każdy zacisk źródła jest portem albo zaciskiem wewnętrznym.
    wykorzystane: set[tuple[int, float, float]] = set()

    def zacisk_zrodla(si: int, xy: Sequence[float]) -> tuple[tuple[float, float], str]:
        s = skladniki[si]
        for z in s.element.zaciski:
            if (z.x, z.y) == (float(xy[0]), float(xy[1])):
                wykorzystane.add((si, z.x, z.y))
                return s.punkt((z.x, z.y)), OBROT_KIERUNKU[s.obrot][z.kierunek]
        raise BladImportu(f"{ident}: składnik {si} nie ma zacisku {list(xy)}")

    porty: list[tuple[str, tuple[float, float], str]] = []
    for p in wpis["porty"]:
        if "zacisk" in p:
            punkt, kierunek = zacisk_zrodla(int(p["skladnik"]), p["zacisk"])
        else:
            if not p.get("powod") or p.get("dir") not in ("N", "S", "E", "W"):
                raise BladImportu(f"{ident}: port {p['name']} bez zacisku wymaga powodu i kierunku")
            punkt = skladniki[int(p["skladnik"])].punkt(
                (float(p["punkt"][0]), float(p["punkt"][1]))
            )
            kierunek = str(p["dir"])
        porty.append((str(p["name"]), punkt, kierunek))
    for w in wpis.get("zaciskiWewnetrzne", []):
        a, _ = zacisk_zrodla(int(w["skladnik"]), w["zacisk"])
        b, _ = zacisk_zrodla(int(w["z"]["skladnik"]), w["z"]["zacisk"])
        if math.dist(a, b) > 1e-9:
            raise BladImportu(f"{ident}: zaciski wewnętrzne złożenia nie pokrywają się {a} ≠ {b}")
    # Zacisk źródła spoza toru pierwotnego (np. uzwojenie wtórne przekładnika napięciowego)
    # nie jest portem — wymaga jawnej deklaracji z powodem; bez niej import jest przerywany.
    for w in wpis.get("zaciskiPozaTorem", []):
        if not str(w.get("powod") or "").strip():
            raise BladImportu(f"{ident}: zacisk poza torem {w.get('zacisk')} bez powodu")
        zacisk_zrodla(int(w["skladnik"]), w["zacisk"])
    for si, s in enumerate(skladniki):
        for z in s.element.zaciski:
            if (si, z.x, z.y) not in wykorzystane:
                raise BladImportu(f"{ident}: zacisk źródła {(z.x, z.y)} bez przypisania")

    p0 = porty[0][1]
    for nazwa, punkt, _ in porty:
        for os_ in (0, 1):
            reszta = (punkt[os_] - p0[os_]) / raster
            if abs(reszta - round(reszta)) > 1e-9:
                raise BladImportu(f"{ident}: port {nazwa} poza rastrem zacisków QET")

    polozenia_noza = (
        [[obroc_rysunek(r, katy[pol], przegub) for r in noz] for pol in POLOZENIA if pol in katy]
        if przegub is not None
        else []
    )
    punkty = obwiednia(stale) + [q for poz in polozenia_noza for q in obwiednia(poz)]
    punkty += [punkt for _, punkt, _ in porty]
    min_x, max_x = min(q[0] for q in punkty), max(q[0] for q in punkty)
    min_y, max_y = min(q[1] for q in punkty), max(q[1] for q in punkty)

    nazwy_portow = {nazwa: punkt for nazwa, punkt, _ in porty}
    os_x = (nazwy_portow.get("bottom") or nazwy_portow.get("top") or p0)[0]
    pol_szer = raster * math.ceil(round(max(os_x - min_x, max_x - os_x) / raster, 9))
    g_min_x, g_max_x = os_x - pol_szer, os_x + pol_szer
    g_min_y = domknij_w_dol(min_y, p0[1], raster)
    g_max_y = domknij_w_gore(max_y, p0[1], raster)

    def swiat(q: tuple[float, float]) -> tuple[float, float]:
        return ((q[0] - g_min_x) * skala, (q[1] - g_min_y) * skala)

    szer, wys = (g_max_x - g_min_x) * skala, (g_max_y - g_min_y) * skala

    def na_krawedzi(q: tuple[float, float]) -> bool:
        x, y = swiat(q)
        return abs(x) < 1e-9 or abs(y) < 1e-9 or abs(x - szer) < 1e-9 or abs(y - wys) < 1e-9

    # Zacisk źródła leżący WEWNĄTRZ gabarytu (deklaracja ``portyWewnatrzGabarytu`` z powodem)
    # jest przedłużany odcinkiem PRZEWODU w kierunku portu do krawędzi gabarytu — port
    # symbolu leży na krawędzi jak w całej bibliotece (sonda portów spec §11.3), a odcinek
    # jest jawny w wyjściu (``doprowadzenia``), nie udaje geometrii elementu QET.
    deklarowane: dict[str, str] = dict(wpis.get("portyWewnatrzGabarytu", {}))
    wewnetrzne = sorted(nazwa for nazwa, punkt, _ in porty if not na_krawedzi(punkt))
    if wewnetrzne != sorted(deklarowane):
        raise BladImportu(
            f"{ident}: porty poza krawędzią gabarytu {wewnetrzne} ≠ deklaracja "
            f"{sorted(deklarowane)}"
        )
    krawedz = {
        "N": (None, g_min_y),
        "S": (None, g_max_y),
        "W": (g_min_x, None),
        "E": (g_max_x, None),
    }
    doprowadzenia: list[dict[str, Any]] = []
    for i, (nazwa, punkt, kierunek) in enumerate(porty):
        if nazwa not in deklarowane:
            continue
        if not str(deklarowane[nazwa]).strip():
            raise BladImportu(f"{ident}: port wewnątrz gabarytu {nazwa} bez powodu")
        kx, ky = krawedz[kierunek]
        koniec = (punkt[0] if kx is None else kx, punkt[1] if ky is None else ky)
        stale.append(Rysunek(rodzaj="line", punkty=[punkt, koniec]))
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
        min_x, max_x = min(min_x, koniec[0]), max(max_x, koniec[0])
        min_y, max_y = min(min_y, koniec[1]), max(max_y, koniec[1])
    porty_swiat = []
    for nazwa, punkt, kierunek in porty:
        if not na_krawedzi(punkt):
            raise BladImportu(f"{ident}: port {nazwa} poza krawędzią gabarytu")
        x, y = swiat(punkt)
        porty_swiat.append({"name": nazwa, "x": zaokr(x), "y": zaokr(y), "dir": kierunek})

    def prymityw_ts(r: Rysunek, noz_stanu: bool = False) -> dict[str, Any]:
        if r.rodzaj == "line":
            (a, b) = (swiat(r.punkty[0]), swiat(r.punkty[1]))
            wynik: dict[str, Any] = {"k": "line", "x1": a[0], "y1": a[1], "x2": b[0], "y2": b[1]}
            if noz_stanu:
                wynik["nozStanu"] = True
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

    obrys_min = swiat((min_x, min_y))
    obrys_max = swiat((max_x, max_y))
    wynik: dict[str, Any] = {
        "id": ident,
        "namePl": str(wpis["namePl"]),
        "zlozenie": wpis.get("zlozenie"),
        "szerokosc": zaokr(szer),
        "wysokosc": zaokr(wys),
        "porty": porty_swiat,
        "doprowadzenia": doprowadzenia,
        "obrys": {
            "x": zaokr(obrys_min[0]),
            "y": zaokr(obrys_min[1]),
            "width": zaokr(obrys_max[0] - obrys_min[0]),
            "height": zaokr(obrys_max[1] - obrys_min[1]),
        },
        "stale": [prymityw_ts(r) for r in stale],
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
            "prymitywy": [prymityw_ts(r, noz_stanu=True) for r in noz],
        }
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
 * Rysunek źródła = położenie OTWARTE; pozostałe położenia — kąty obrotu noża (`noz.katy`,
 * stopnie, konwencja SVG `rotate`) wokół przegubu (`noz.cx`, `noz.cy`).
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
  /** Odcinki przewodu od zacisku źródła leżącego wewnątrz gabarytu do portu na krawędzi
   *  (z powodem) — przewód, nie geometria elementu QET. */
  readonly doprowadzenia: readonly QetDoprowadzenie[];
  /** Obwiednia rysunku we WSZYSTKICH położeniach noża i portów (względem gabarytu). */
  readonly obrys: QetProstokat;
  readonly stale: readonly CadPrimitive[];
  readonly noz: QetNozSymbolu | null;
  readonly zrodla: readonly QetZrodloSymbolu[];
}

export const QET_POCHODZENIE = {pochodzenie} as const;

export const QET_SYMBOLE_POLA_SN: Readonly<Record<QetSymbolPolaSnId, QetSymbolPolaSn>> = {
{symbole}};
"""


def generuj() -> str:
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
    symbole = [zloz_symbol(w, elementy, skala, raster) for w in manifest["symbole"]]
    identyfikatory = [s["id"] for s in symbole]
    if len(set(identyfikatory)) != len(identyfikatory):
        raise BladImportu("powtórzony identyfikator symbolu")
    uzyte = {z["sciezka"] for s in symbole for z in s["zrodla"]}
    if uzyte != {e.sciezka for e in elementy.values()}:
        raise BladImportu("element źródła w manifeście nieużyty przez żaden symbol")
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
