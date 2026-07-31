#!/usr/bin/env python3
"""Narzędzie: masowa naprawa mojibake UTF-8→UTF-8 (karta KD-6, poz. 4).

CO NAPRAWIA. Tekst UTF-8, który jakieś narzędzie odczytało jako stronę kodową
Windows-1250 i zapisało z powrotem jako UTF-8. Polska litera „ł" (bajty C5 82)
staje się wtedy parą „\u0139\u201a", „ó" (C3 B3) parą „\u0102\u0142", a znak
ramki „│" (E2 94 82) trójką „\u00e2\u201d\u201a". Dług nazwany w karcie KD-2:
klasa „\u0139" nie była wpisana do strażnika, bo zapalała ponad tysiąc miejsc
w dokumentach. (Przykłady zapisane sekwencjami \\uXXXX — inaczej TEN plik
zapalałby strażnika, którego właśnie domyka.)

ODWRACALNOŚĆ, NIE ZGADYWANIE. Naprawa jest ODWROTNOŚCIĄ uszkodzenia: znaki
mapowane są z powrotem na bajty (CP1250, a potem CP1252; sloty nieokreślone
strony kodowej to znak sterujący o tej samej wartości — tak zachowują się
konwertery Windows), a bajty odczytywane jako UTF-8. Żadna litera nie jest „poprawiana" z sensu zdania.

DWA BEZPIECZNIKI — bez nich narzędzie zepsułoby poprawny tekst:

1. ZNAK WIODĄCY spoza alfabetu polskiego. Ciąg naprawy musi zaczynać się od
   znaku, którego polski tekst NIE UŻYWA (Ĺ, Ă, Ä, Å, â, Â, Î, Ď, đ, Ĺ...).
   Bez tego „RÓŻNICA" (para „ÓŻ" = bajty D3 BF) dałaby się odczytać jako
   poprawny znak UTF-8 U+04FF i słowo zostałoby zniszczone.
2. ZBIÓR DOCELOWY. Odtworzony znak musi należeć do klasy, która w tych plikach
   realnie występuje (litery polskie, typografia, ramki, strzałki, symbole
   matematyczne, greka, emoji). Znak spoza zbioru przerywa naprawę ciągu —
   „CZĘŚĆ" (para „ĘŚ" = CA 9A) nie zamieni się w ʌ, bo ʌ nie jest w zbiorze.

Ciąg, którego nie da się odczytać jako UTF-8 albo który wychodzi poza zbiór
docelowy, zostaje NIETKNIĘTY i jest raportowany jako nierozpoznany — narzędzie
nigdy nie „poprawia na siłę".

UŻYCIE:
    python scripts/napraw_mojibake.py               # próba (dry-run), pomiar per plik
    python scripts/napraw_mojibake.py --zastosuj    # zapis napraw
    python scripts/napraw_mojibake.py --sciezka X   # ograniczenie do podkatalogu

KOD WYJŚCIA: 0 = wykonano (także gdy nie było czego naprawiać), 1 = błąd we/wy.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

#: Drzewo skanowane — DOKŁADNIE to, co widzi `utf8_mojibake_guard`.
SCAN_DIRS = [
    Path("frontend") / "src",
    Path("backend") / "src",
    Path("docs"),
    Path("scripts"),
]
SCAN_FILES = [
    Path("AGENTS.md"),
    Path("ARCHITECTURE.md"),
    Path("SYSTEM_SPEC.md"),
    Path("PLANS.md"),
]
SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".py", ".md", ".json", ".css"}

#: Litery alfabetu polskiego — NIGDY nie zaczynają ciągu naprawy (bezpiecznik 1).
LITERY_POLSKIE = set("aąbcćdeęfghijklłmnńoópqrsśtuvwxyzźżAĄBCĆDEĘFGHIJKLŁMNŃOÓPQRSŚTUVWXYZŹŻ")


def _tablica(strona: str) -> dict[str, int]:
    """Znak → bajt danej strony kodowej (sloty nieokreślone = znak sterujący).

    Znaki sterujące U+0080–U+009F trafiają do tablicy ZAWSZE, także gdy strona
    ma w tym miejscu znak drukowalny: konwerter zostawia dla slotu
    nieokreślonego znak sterujący o tej samej wartości. Bez tego zapis
    „Å\\x82" (litera „ł" przepuszczona przez CP1252) zostawałby nienaprawiony.
    Znak sterujący nigdy nie należy do poprawnego tekstu, więc odwzorowanie jest
    jednoznaczne.
    """
    mapa: dict[str, int] = {}
    for bajt in range(0x80, 0x100):
        try:
            znak = bytes([bajt]).decode(strona)
        except UnicodeDecodeError:
            znak = chr(bajt)
        mapa[znak] = bajt
    for bajt in range(0x80, 0xA0):
        mapa.setdefault(chr(bajt), bajt)
    return mapa


#: Strony kodowe, przez które tekst tego repozytorium bywał przepuszczany.
#: Kolejność jest USTALONA (najpierw dominująca klasa „Ĺ" z CP1250, potem
#: „Å" z CP1252) — dzięki temu wynik jest deterministyczny. Tablice są
#: rozłączne w praktyce: ten sam znak nie bywa w obu naraz z innym bajtem.
TABLICE: tuple[tuple[str, dict[str, int]], ...] = (
    ("cp1250", _tablica("cp1250")),
    ("cp1252", _tablica("cp1252")),
)


def _w_zbiorze_docelowym(znak: str) -> bool:
    """Czy odtworzony znak należy do klasy, którą te pliki realnie niosą."""
    kod = ord(znak)
    if znak in "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ":
        return True
    if znak in "–—‑…„“”‘’«»•·§°±×÷²³µ¹¼½¾¬¦¨©®":
        return True
    return (
        0x0370 <= kod <= 0x03FF  # greka (Ω, Δ, φ, κ, π…)
        or 0x2010 <= kod <= 0x205F  # interpunkcja typograficzna
        or 0x2070 <= kod <= 0x209F  # indeksy górne i dolne
        or 0x20A0 <= kod <= 0x20BF  # symbole walut
        or 0x2100 <= kod <= 0x214F  # symbole literopodobne (№, ℃)
        or 0x2190 <= kod <= 0x21FF  # strzałki
        or 0x2200 <= kod <= 0x22FF  # operatory matematyczne
        or 0x2300 <= kod <= 0x23FF  # symbole techniczne
        or 0x25A0 <= kod <= 0x25FF  # figury geometryczne
        or 0x2500 <= kod <= 0x259F  # ramki i bloki
        or 0x2600 <= kod <= 0x27BF  # symbole różne i dingbaty (✓ ✗ ⚠ ⚡ ➕)
        or 0x2B00 <= kod <= 0x2BFF  # strzałki i figury dodatkowe
        or 0xFE0F == kod  # selektor wariantu emoji
        or 0x1F300 <= kod <= 0x1FAFF  # emoji (📁, 🏭)
    )


def napraw_tekst(tekst: str) -> tuple[str, int, list[str]]:
    """(tekst naprawiony, liczba odtworzonych znaków, nierozpoznane ciągi).

    Deterministyczna: ten sam wejściowy tekst zawsze daje ten sam wynik.
    Przebieg po każdej znanej stronie kodowej w USTALONEJ kolejności.
    """
    odtworzone_razem = 0
    nierozpoznane_razem: list[str] = []
    for _nazwa, tablica in TABLICE:
        tekst, odtworzone, nierozpoznane = _napraw_tablica(tekst, tablica)
        odtworzone_razem += odtworzone
        nierozpoznane_razem.extend(nierozpoznane)
    return tekst, odtworzone_razem, sorted(set(nierozpoznane_razem))


def _napraw_tablica(tekst: str, tablica: dict[str, int]) -> tuple[str, int, list[str]]:
    """Jeden przebieg naprawy dla wskazanej tablicy strony kodowej."""
    wynik: list[str] = []
    nierozpoznane: list[str] = []
    odtworzone = 0
    i = 0
    dlugosc = len(tekst)

    while i < dlugosc:
        znak = tekst[i]
        # BEZPIECZNIK 1: ciąg naprawy zaczyna się wyłącznie od znaku spoza
        # alfabetu polskiego, który należy do tablicy strony kodowej.
        if znak not in tablica or znak in LITERY_POLSKIE:
            wynik.append(znak)
            i += 1
            continue

        # Maksymalny ciąg znaków „wysokich" — kandydat na uszkodzony zapis.
        koniec = i
        while koniec < dlugosc and tekst[koniec] in tablica:
            koniec += 1
        surowe = bytes(tablica[c] for c in tekst[i:koniec])

        # Odczyt ZNAK PO ZNAKU: każdy odtworzony znak sprawdzamy zbiorem
        # docelowym (BEZPIECZNIK 2) i przerywamy na pierwszym, który do niego
        # nie należy — reszta ciągu zostaje nietknięta.
        odczytane: list[str] = []
        pozycja = 0
        while pozycja < len(surowe):
            dlugosc_znaku = _dlugosc_sekwencji(surowe[pozycja])
            if dlugosc_znaku == 0 or pozycja + dlugosc_znaku > len(surowe):
                break
            try:
                kandydat = surowe[pozycja : pozycja + dlugosc_znaku].decode("utf-8")
            except UnicodeDecodeError:
                break
            if not _w_zbiorze_docelowym(kandydat):
                break
            odczytane.append(kandydat)
            pozycja += dlugosc_znaku

        if not odczytane:
            # Raportujemy WYŁĄCZNIE ciągi, które WYGLĄDAJĄ na uszkodzony zapis
            # (co najmniej dwa znaki, pierwszy bajt zapowiada sekwencję UTF-8).
            # Samotny „—" albo „§" to poprawna typografia, nie mojibake.
            if len(surowe) >= 2 and _dlugosc_sekwencji(surowe[0]) > 0:
                nierozpoznane.append(tekst[i:koniec])
            wynik.append(tekst[i:koniec])
            i = koniec
            continue

        wynik.append("".join(odczytane))
        odtworzone += len(odczytane)
        # Znaki ciągu, których nie odczytano, wracają bez zmian (1 znak = 1 bajt).
        i += pozycja

    return "".join(wynik), odtworzone, nierozpoznane


def _dlugosc_sekwencji(bajt: int) -> int:
    """Długość sekwencji UTF-8 zapowiedzianej tym bajtem (0 = nie jest wiodący)."""
    if 0xC2 <= bajt <= 0xDF:
        return 2
    if 0xE0 <= bajt <= 0xEF:
        return 3
    if 0xF0 <= bajt <= 0xF4:
        return 4
    return 0


def _pliki(korzen: Path, ograniczenie: Path | None) -> list[Path]:
    zebrane: list[Path] = []
    for katalog in SCAN_DIRS:
        sciezka = korzen / katalog
        if ograniczenie is not None and ograniczenie not in (sciezka, *sciezka.parents):
            if sciezka not in (ograniczenie, *ograniczenie.parents):
                continue
        if sciezka.exists():
            zebrane.extend(
                p for p in sciezka.rglob("*") if p.is_file() and p.suffix.lower() in SUFFIXES
            )
    if ograniczenie is None:
        zebrane.extend(korzen / f for f in SCAN_FILES if (korzen / f).exists())
    if ograniczenie is not None:
        zebrane = [p for p in zebrane if ograniczenie in (p, *p.parents)]
    return sorted(set(zebrane))


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zastosuj", action="store_true", help="zapisz naprawy (bez tego: próba)")
    parser.add_argument("--sciezka", type=str, default=None, help="ogranicz do podkatalogu")
    args = parser.parse_args()

    ograniczenie = (REPO / args.sciezka).resolve() if args.sciezka else None
    pliki = _pliki(REPO, ograniczenie)

    zmienione: list[tuple[str, int]] = []
    nierozpoznane_razem: dict[str, int] = {}
    odtworzone_razem = 0

    for plik in pliki:
        try:
            oryginal = plik.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        naprawiony, odtworzone, nierozpoznane = napraw_tekst(oryginal)
        for ciag in nierozpoznane:
            nierozpoznane_razem[ciag] = nierozpoznane_razem.get(ciag, 0) + 1
        if naprawiony == oryginal:
            continue
        zmienione.append((str(plik.relative_to(REPO)), odtworzone))
        odtworzone_razem += odtworzone
        if args.zastosuj:
            try:
                plik.write_text(naprawiony, encoding="utf-8")
            except OSError as blad:
                print(f"BLAD ZAPISU {plik}: {blad}")
                return 1

    tryb = "ZAPISANO" if args.zastosuj else "PROBA (dry-run)"
    print(f"napraw_mojibake [{tryb}]")
    print(f"  plikow przeskanowanych: {len(pliki)}")
    print(f"  plikow do naprawy:      {len(zmienione)}")
    print(f"  znakow odtworzonych:    {odtworzone_razem}")
    if zmienione:
        print("\n  pomiar per plik:")
        for nazwa, ile in sorted(zmienione, key=lambda x: (-x[1], x[0])):
            print(f"    {ile:6d}  {nazwa}")
    if nierozpoznane_razem:
        print(f"\n  ciagi NIEROZPOZNANE (zostaja nietkniete): {len(nierozpoznane_razem)} roznych")
        for ciag, ile in sorted(nierozpoznane_razem.items(), key=lambda x: (-x[1], x[0]))[:20]:
            print(f"    {ile:6d}  {ciag!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
