#!/usr/bin/env python3
"""Strażnik: globalna klasa CSS ma jednego właściciela, a każdy token `--mvd-*` ma definicję.

PO CO (karta K1 POWLOKA, POMIAR_POWLOKA §1). Arkusze aplikacji są GLOBALNE (Vite wstrzykuje
każdy zaimportowany `.css` do jednego dokumentu). Menu „Widok" powłoki miało klasę `.mvd-menu`,
a menu kontekstowe menedżera przypadków (`przypadki.css`) zdefiniowało tę samą klasę jako
`position: fixed` — po wejściu w przestrzeń „Obliczenia" kontener „Widok" wypadał z paska
i przykrywał nazwę projektu. Żaden test tego nie łapał, bo każdy plik z osobna był poprawny;
defekt powstaje dopiero z ZESTAWIENIA dwóch arkuszy. Druga klasa tego samego rodzaju:
odwołanie `var(--mvd-x)` do tokenu, którego żaden arkusz nie definiuje (przed kartą K1 —
ponad 70 takich odwołań, m.in. `--mvd-border`, `--mvd-text`), po cichu daje wartość zapasową
albo dziedziczenie, więc kolor ekranu nie pochodzi z jednego zestawu tokenów.

CO WYKRYWA (analiza reguł `frontend/src/**/*.css`, bez katalogów testów):
  1. KOLIZJA KLAS — ta sama klasa ma DEFINICJĘ BAZOWĄ w dwóch różnych arkuszach. Definicja
     bazowa = selektor złożony z JEDNEGO członu (bez kombinatorów spacja/`>`/`+`/`~`), który
     zaczyna się od tej klasy, np. `.mvd-menu`, `.mvd-menu:hover`, `.mvd-menu[aria-x]`,
     `.mvd-menu.mvd-on`, `.mvd-menu::before`. Selektory kontekstowe (`.rodzic .mvd-btn`,
     `:root[data-theme] .x`) NIE są definicją bazową — to świadome nadpisanie w kontekście.
  2. TOKEN BEZ DEFINICJI — odwołanie `var(--mvd-…)` w arkuszu albo w kodzie TS/TSX
     (`frontend/src/**`, bez testów) do nazwy, której nie definiuje żaden arkusz
     (`--mvd-…:` w `.css`) ani kod (klucz `'--mvd-…'` stylu wstawianego, `setProperty`).
     Odwołanie z wartością zapasową (`var(--mvd-x, #fff)`) też jest trafieniem — zapas
     ukrywa brak tokenu, a nie go zastępuje.

LISTA DOZWOLONA I ZAPADKA (`DOZWOLONE_KOLIZJE`: klasa → (zbiór arkuszy, uzasadnienie)).
Wpis istnieje WYŁĄCZNIE dla kolizji w arkuszach warstw, których karta K1 nie mogła edytować
(granice karty), z uzasadnieniem merytorycznym. Zapadka w obie strony: nowa kolizja albo nowy
arkusz przy istniejącej klasie = czerwony; wpis, którego kolizja zniknęła z drzewa = czerwony
(„usuń wpis — zapadka w dół"), żeby lista nie kłamała. Tokeny bez definicji: lista pusta,
każde trafienie czerwone.

CZEGO NIE WYKRYWA (nazwane, żeby zieleń nie znaczyła więcej, niż znaczy):
  * kolizji klasy zdefiniowanej w jednym arkuszu i nadpisanej w drugim selektorem
    kontekstowym o wyższej specyficzności — to świadome nadpisanie, nie kolizja;
  * klas Tailwinda (nie mają arkuszy w `src/`) ani stylów wstawianych (`style={…}`);
  * tokenów spoza przedrostka `--mvd-` (`--sld-*` należy do motywu schematu);
  * nazw tokenów składanych w czasie działania (`` `var(--mvd-${x})` ``) — w kodzie aplikacji
    takie miejsce jest jedno (`tailwind.config.js`, poza `src/`), pilnuje go test tokenów.

PUSTY SKAN (zero arkuszy albo zero reguł) to BŁĄD, nie sukces — kod wyjścia 1.

Uruchomienie: `python scripts/css_kolizje_klas_guard.py` z katalogu `mv-design-pro/`.
"""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

KORZEN = Path(__file__).resolve().parent.parent
SRC = KORZEN / "frontend" / "src"

#: Katalogi pomijane przy skanie (testy mają własne arkusze-atrapy).
POMIJANE_KATALOGI = frozenset({"__tests__", "node_modules"})

#: Dozwolone kolizje: klasa → (arkusze względem `frontend/src`, uzasadnienie merytoryczne).
_GRANICA_K1 = (
    "Duplikaty w arkuszach warstw poza granicą karty K1 POWLOKA (przestrzeń Gotowość, ekrany "
    "wyników, rama kreatorów należą do innych kart programu UIUX-PRZEMYSLOWY i karta K1 nie "
    "może ich edytować). "
)

DOZWOLONE_KOLIZJE: dict[str, tuple[frozenset[str], str]] = {
    "mvd-btn": (
        frozenset(
            {
                "ui2/theme/komponenty.css",
                "ui2/spaces/gotowosc/gotowosc.css",
                "ui2/wyniki/dowod/dowod.css",
                "ui2/wyniki/porownanie/porownanie.css",
                "ui2/wyniki/wzorzec/wzorzec.css",
            }
        ),
        _GRANICA_K1 + "Kopie różnią się od definicji wspólnej obramowaniem (`--mvd-line` zamiast "
        "`--mvd-line-strong`), brakiem stanu `aria-disabled`, a w dowod.css także odstępem "
        "5 px 12 px — kolejność ładowania zmienia odcień ramki i wysokość przycisku.",
    ),
    "mvd-num": (
        frozenset(
            {
                "ui2/theme/komponenty.css",
                "ui2/spaces/gotowosc/gotowosc.css",
                "ui2/wyniki/dowod/dowod.css",
                "ui2/wyniki/odbior/odbior.css",
                "ui2/wyniki/wzorzec/wzorzec.css",
            }
        ),
        _GRANICA_K1 + "Kopie są identyczne z definicją wspólną (krój mono, `tabular-nums`).",
    ),
    "mvd-sr-only": (
        frozenset(
            {
                "ui2/theme/komponenty.css",
                "ui2/spaces/gotowosc/gotowosc.css",
                "ui2/wyniki/wzorzec/wzorzec.css",
            }
        ),
        _GRANICA_K1 + "Kopie są identyczne z definicją wspólną (wzorzec ukrycia wizualnego).",
    ),
    "mvd-input": (
        frozenset({"ui2/theme/komponenty.css", "ui2/spaces/gotowosc/gotowosc.css"}),
        _GRANICA_K1
        + "Kopia różni się tłem (`--mvd-panel` zamiast `--mvd-panel-2`) i obramowaniem; "
        "do scalenia przez kartę przestrzeni Gotowość.",
    ),
    "mvd-pole": (
        frozenset({"ui2/theme/komponenty.css", "ui2/kreatory/rama/kreatory.css"}),
        _GRANICA_K1
        + "Rama kreatorów ma odstęp 5 px zamiast 4 px; do scalenia przez kartę kreatorów.",
    ),
    "mvd-pole-etykieta": (
        frozenset({"ui2/theme/komponenty.css", "ui2/kreatory/rama/kreatory.css"}),
        _GRANICA_K1
        + "Rama kreatorów ma etykietę 11 px krojem mono (poniżej minimum 13 px z §8) — kolizja "
        "zastana sprzed karty K1 (wcześniej z przypadki.css i otworz.css); do scalenia przez "
        "kartę kreatorów.",
    ),
    "mvd-gotowosc": (
        frozenset({"ui2/spaces/gotowosc/gotowosc.css", "ui2/kreatory/rama/kreatory.css"}),
        _GRANICA_K1
        + "Ta sama nazwa klasy dla dwóch różnych elementów (panel przestrzeni Gotowość i sekcja "
        "gotowości w ramie kreatora) — kolizja zastana sprzed karty K1, wymaga zmiany nazwy po "
        "stronie jednej z tych warstw.",
    ),
    "mvd-gotowosc-head": (
        frozenset({"ui2/spaces/gotowosc/gotowosc.css", "ui2/kreatory/rama/kreatory.css"}),
        _GRANICA_K1
        + "Para klasy `.mvd-gotowosc` (ten sam przypadek: dwa różne elementy pod jedną nazwą).",
    ),
    "mvd-wyn-wykres-tytul": (
        frozenset({"ui2/wyniki/oltc/oltc.css", "ui2/wyniki/rozplyw/rozplyw.css"}),
        _GRANICA_K1 + "Dwa ekrany wyników definiują wspólny tytuł wykresu; scalenie należy do "
        "karty ekranów wyników.",
    ),
}

_KOMENTARZ = re.compile(r"/\*.*?\*/", re.S)
_KLASA_NA_POCZATKU = re.compile(r"^\.(-?[A-Za-z_][\w-]*)")
_KOMBINATOR = re.compile(r"[\s>+~]")
_UZYCIE_TOKENU = re.compile(r"var\(\s*(--mvd-[\w-]+)")
_DEFINICJA_CSS = re.compile(r"(--mvd-[\w-]+)\s*:")
_DEFINICJA_KOD = re.compile(r"""['"`](--mvd-[\w-]+)['"`]\s*[:,)]""")


class PustySkanError(RuntimeError):
    """Skan nie znalazł arkuszy albo reguł — zieleń byłaby fałszywa."""


@dataclass(frozen=True)
class DefinicjaBazowa:
    klasa: str
    plik: str
    linia: int
    selektor: str


def _bez_komentarzy(tekst: str) -> str:
    # Komentarz zamieniony na tyle samo nowych linii — numery linii zostają prawdziwe.
    return _KOMENTARZ.sub(lambda m: "\n" * m.group(0).count("\n"), tekst)


def _rozdziel_przecinkami(prelude: str) -> list[str]:
    """Selektory listy rozdzielone przecinkami najwyższego poziomu (poza `()` i `[]`)."""
    czesci: list[str] = []
    glebokosc = 0
    biezacy: list[str] = []
    for znak in prelude:
        if znak in "([":
            glebokosc += 1
        elif znak in ")]":
            glebokosc -= 1
        if znak == "," and glebokosc == 0:
            czesci.append("".join(biezacy))
            biezacy = []
            continue
        biezacy.append(znak)
    czesci.append("".join(biezacy))
    return [c.strip() for c in czesci if c.strip()]


def _bez_nawiasow(selektor: str) -> str:
    """Selektor z wyciętą treścią `[...]` i `(...)` — kombinatory w środku się nie liczą."""
    wynik: list[str] = []
    glebokosc = 0
    for znak in selektor:
        if znak in "([":
            glebokosc += 1
            continue
        if znak in ")]":
            glebokosc -= 1
            continue
        if glebokosc == 0:
            wynik.append(znak)
    return "".join(wynik)


def klasa_bazowa(selektor: str) -> str | None:
    """Klasa, której `selektor` jest definicją bazową, albo `None` (selektor kontekstowy)."""
    dopasowanie = _KLASA_NA_POCZATKU.match(selektor)
    if not dopasowanie:
        return None
    if _KOMBINATOR.search(_bez_nawiasow(selektor).strip()):
        return None
    return dopasowanie.group(1)


def selektory_regul(tekst: str) -> list[tuple[str, int]]:
    """(selektor, linia) każdej reguły stylu arkusza — także wewnątrz `@media`/`@supports`.

    Klatki `@keyframes` (`from`, `50%`) nie są regułami stylu i są pomijane.
    """
    czysty = _bez_komentarzy(tekst)
    wynik: list[tuple[str, int]] = []
    poczatek = 0
    #: Dla każdego otwartego bloku: czy to blok `@keyframes`.
    stos: list[bool] = []
    for indeks, znak in enumerate(czysty):
        if znak == "{":
            surowy = czysty[poczatek:indeks]
            prelude = surowy.strip()
            jest_at = prelude.startswith("@")
            w_klatkach = bool(stos) and stos[-1]
            if prelude and not jest_at and not w_klatkach:
                przesuniecie = len(surowy) - len(surowy.lstrip())
                linia = czysty.count("\n", 0, poczatek + przesuniecie) + 1
                for selektor in _rozdziel_przecinkami(prelude):
                    wynik.append((selektor, linia))
            stos.append(jest_at and "keyframes" in prelude)
            poczatek = indeks + 1
        elif znak in "};":
            if znak == "}" and stos:
                stos.pop()
            poczatek = indeks + 1
    return wynik


def _pliki(rozszerzenia: tuple[str, ...], src: Path) -> list[Path]:
    return sorted(
        p
        for p in src.rglob("*")
        if p.suffix in rozszerzenia
        and p.is_file()
        and not POMIJANE_KATALOGI.intersection(p.relative_to(src).parts)
    )


def definicje_bazowe(src: Path = SRC) -> dict[str, list[DefinicjaBazowa]]:
    """Klasa → definicje bazowe we wszystkich arkuszach."""
    arkusze = _pliki((".css",), src)
    if not arkusze:
        raise PustySkanError(f"brak arkuszy .css pod {src}")
    wynik: dict[str, list[DefinicjaBazowa]] = defaultdict(list)
    liczba_regul = 0
    for arkusz in arkusze:
        wzgledna = arkusz.relative_to(src).as_posix()
        for selektor, linia in selektory_regul(arkusz.read_text(encoding="utf-8")):
            liczba_regul += 1
            klasa = klasa_bazowa(selektor)
            if klasa is not None:
                wynik[klasa].append(DefinicjaBazowa(klasa, wzgledna, linia, selektor))
    if liczba_regul == 0:
        raise PustySkanError("arkusze nie zawierają żadnej reguły stylu")
    return dict(wynik)


def kolizje(definicje: dict[str, list[DefinicjaBazowa]]) -> dict[str, list[DefinicjaBazowa]]:
    """Klasy z definicją bazową w więcej niż jednym arkuszu."""
    return {
        klasa: lista
        for klasa, lista in sorted(definicje.items())
        if len({d.plik for d in lista}) > 1
    }


def tokeny_bez_definicji(src: Path = SRC) -> list[tuple[str, int, str]]:
    """(plik, linia, token) każdego odwołania `var(--mvd-…)` bez definicji w repo."""
    arkusze = _pliki((".css",), src)
    kod = _pliki((".ts", ".tsx"), src)
    if not arkusze or not kod:
        raise PustySkanError(f"brak arkuszy albo kodu pod {src}")
    zdefiniowane: set[str] = set()
    for arkusz in arkusze:
        zdefiniowane.update(_DEFINICJA_CSS.findall(_bez_komentarzy(arkusz.read_text("utf-8"))))
    for plik in kod:
        zdefiniowane.update(_DEFINICJA_KOD.findall(plik.read_text("utf-8")))
    trafienia: list[tuple[str, int, str]] = []
    for plik in [*arkusze, *kod]:
        tekst = plik.read_text("utf-8")
        if plik.suffix == ".css":
            tekst = _bez_komentarzy(tekst)
        for numer, wiersz in enumerate(tekst.splitlines(), start=1):
            for token in _UZYCIE_TOKENU.findall(wiersz):
                if token not in zdefiniowane:
                    trafienia.append((plik.relative_to(src).as_posix(), numer, token))
    return trafienia


def porownaj_z_lista(
    znalezione: dict[str, list[DefinicjaBazowa]],
    dozwolone: dict[str, tuple[frozenset[str], str]] = DOZWOLONE_KOLIZJE,
) -> list[str]:
    """Błędy zapadki: nowa kolizja, nowy arkusz kolizji, wpis nieaktualny, wpis bez uzasadnienia."""
    bledy: list[str] = []
    for klasa, (arkusze, uzasadnienie) in sorted(dozwolone.items()):
        if not uzasadnienie.strip():
            bledy.append(f"wpis listy `.{klasa}` bez uzasadnienia merytorycznego")
        if klasa not in znalezione:
            bledy.append(
                f"kolizja `.{klasa}` zniknęła — usuń wpis z DOZWOLONE_KOLIZJE (zapadka w dół)"
            )
            continue
        faktyczne = frozenset(d.plik for d in znalezione[klasa])
        if faktyczne != arkusze:
            bledy.append(
                f"kolizja `.{klasa}`: arkusze {sorted(faktyczne)} ≠ lista {sorted(arkusze)} "
                "(nowy arkusz = nowy dług; mniej arkuszy = obniż wpis)"
            )
    for klasa, lista in znalezione.items():
        if klasa in dozwolone:
            continue
        miejsca = ", ".join(f"{d.plik}:{d.linia} `{d.selektor}`" for d in lista)
        bledy.append(f"klasa `.{klasa}` ma definicję bazową w kilku arkuszach: {miejsca}")
    return bledy


def main(src: Path = SRC) -> int:
    try:
        znalezione = kolizje(definicje_bazowe(src))
        tokeny = tokeny_bez_definicji(src)
    except PustySkanError as blad:
        print(f"BŁĄD: pusty skan — {blad}")
        return 1
    bledy = porownaj_z_lista(znalezione)
    bledy.extend(
        f"{plik}:{linia} odwołanie do niezdefiniowanego tokenu {token}"
        for plik, linia, token in tokeny
    )
    if bledy:
        print("css_kolizje_klas_guard: CZERWONY")
        for blad in bledy:
            print(f"  - {blad}")
        return 1
    print(
        "css_kolizje_klas_guard: zielony — globalne klasy mają jednego właściciela, "
        f"każdy token --mvd-* ma definicję (dozwolone kolizje: {len(DOZWOLONE_KOLIZJE)})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
