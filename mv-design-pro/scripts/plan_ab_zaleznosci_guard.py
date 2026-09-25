#!/usr/bin/env python3
"""Strażnik zależności planu A/B (plan §13, decyzja O-35; karta AB-1a Pakiet E1, pkt B).

PO CO. `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §5 niesie WIĄŻĄCĄ sekwencję przyrostów
(pierwszy pogrubiony ciąg z `AB-1a →`), a §11 — tabelę z kolumną „Zależność". Przegląd
adwersarzowy (ETAP 7, #5) znalazł w pierwotnej sekwencji przyrost AB-4 stojący przed OBIEMA
swoimi zależnościami (AB-H1, AB-H2) — cykl AB-4 ↔ AB-H2 między sekwencją a tabelą, którego nikt
nie zauważył, bo nic tego nie liczyło. Reguła KLASA, NIE INSTANCJA pkt 4: deklaracja „kolejność
wiążąca" bez sprawdzenia to fałszywa pewność.

CO SPRAWDZA:
  * sekwencja §5: tokeny rozdzielone `→` (`AB-…`, `W<n>-<X>`), bez powtórzeń;
  * tabela §11 (kolumny po nagłówku, komórki dzielone po nieucieczonej `|`): przyrostem wiersza
    jest `AB-Hn`, gdy „Nowa zdolność" zaczyna się od `AB-Hn:` (wtedy „Istniejący workstream" to
    KONSUMENCI — każdy zależy od `AB-Hn`), inaczej identyfikatory kolumny „Istniejący
    workstream" (także `(+ AB-3b)`; nawias opisowy, np. `(przed AB-1c)`, nie jest przyrostem);
    zależność opisana „(miejsce w sekwencji, nie zależność techniczna)" jest POMIJANA;
  * każdy przyrost z §11 ma miejsce w sekwencji: token wprost albo GRUPA (`AB-1b` =
    `AB-1b.1`/`AB-1b.2`/`AB-1b.3` — wiersz „AB-1b" tabeli dotyczy każdego członka); inaczej
    „przyrost bez miejsca";
  * każda zależność (także przechodnia przez identyfikator zewnętrzny) stoi w sekwencji
    WCZEŚNIEJ niż przyrost zależny; dla grupy — każdy członek; naruszenie jest meldowane jako
    cykl sekwencja ↔ zależność (sekwencja stawia B przed A, tabela wymaga A przed B);
  * cykle samego grafu zależności (Tarjan) — czerwony;
  * identyfikatory spoza sekwencji (`R10`, `W5`, `AB-1`) są spełnione — wypisywane jako
    „zewnętrzne".

Wynik zawsze wypisuje porządek sekwencji i graf zależności. KODY WYJŚCIA: 0 — zielony;
1 — naruszenia (także brak sekcji/sekwencji/tabeli w planie); 2 — brak pliku planu.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PLAN = PROJECT_ROOT / "docs" / "plan" / "PLAN_AB_DYNAMIKA_A_B_2026-09.md"

KOLUMNA_WORKSTREAM = "Istniejący workstream"
KOLUMNA_ZDOLNOSC = "Nowa zdolność"
KOLUMNA_ZALEZNOSC = "Zależność"
ZNACZNIK_POMINIECIA = "miejsce w sekwencji"

_TOKEN_SEKWENCJI = re.compile(r"^(?:AB-[A-Za-z0-9_.]+|W\d+-[A-Z]+)$")
_IDENTYFIKATOR = re.compile(r"(AB-[A-Za-z0-9_.]*[A-Za-z0-9_]|W\d+(?:-[A-Z]+)?|R\d+)")
_PRZYROST_H = re.compile(r"^(AB-H\d+)\s*:")
_DOPISANY = re.compile(r"\(\+\s*(AB-[A-Za-z0-9_.]*[A-Za-z0-9_])\s*\)")
_POGRUBIENIE = re.compile(r"\*\*(.+?)\*\*", re.DOTALL)
_PIONOWA_KRESKA = re.compile(r"(?<!\\)\|")


@dataclass(frozen=True)
class WierszTabeli:
    przyrosty: tuple[str, ...]
    konsumenci: tuple[str, ...]
    zaleznosci: tuple[str, ...]
    pominiete: tuple[str, ...]
    zrodlo: str


@dataclass
class Plan:
    sekwencja: list[str]
    wiersze: list[WierszTabeli]
    bledy: list[str] = field(default_factory=list)


def sekcja(tekst: str, numer: int) -> str | None:
    """Treść sekcji `## <numer>.` do następnego nagłówka drugiego stopnia."""
    dopasowanie = re.search(rf"^## {numer}\..*?$(.*?)(?=^## |\Z)", tekst, re.MULTILINE | re.DOTALL)
    return dopasowanie.group(1) if dopasowanie else None


def komorki(linia: str) -> list[str]:
    """Komórki wiersza tabeli Markdown; `\\|` wewnątrz komórki nie dzieli kolumn."""
    czesci = _PIONOWA_KRESKA.split(linia.strip())
    if czesci and czesci[0] == "":
        czesci = czesci[1:]
    if czesci and czesci[-1] == "":
        czesci = czesci[:-1]
    return [c.strip() for c in czesci]


def parsuj_sekwencje(tekst_sekcji: str) -> tuple[list[str], list[str]]:
    """(tokeny, błędy) z pierwszego pogrubionego ciągu zawierającego `AB-1a →`."""
    for dopasowanie in _POGRUBIENIE.finditer(tekst_sekcji):
        ciag = dopasowanie.group(1)
        if "AB-1a →" not in ciag:
            continue
        tokeny = [t.strip() for t in re.sub(r"\s+", " ", ciag).split("→")]
        bledy = [
            f"sekwencja §5: nierozpoznany token {t!r}"
            for t in tokeny
            if not _TOKEN_SEKWENCJI.match(t)
        ]
        widziane: set[str] = set()
        for token in tokeny:
            if token in widziane:
                bledy.append(f"sekwencja §5: token {token} powtórzony")
            widziane.add(token)
        return tokeny, bledy
    return [], ["sekwencja §5: brak pogrubionego ciągu z `AB-1a →`"]


def _identyfikatory_kolumny(tekst: str) -> list[str]:
    """Identyfikatory przyrostów pierwszej kolumny: `A / B` oraz `(+ C)`; inne nawiasy — opis."""
    wynik: list[str] = []
    for czesc in tekst.split("/"):
        glowna = re.sub(r"\(.*?\)", "", czesc).strip()
        poczatek = _IDENTYFIKATOR.match(glowna)
        if poczatek:
            wynik.append(poczatek.group(1))
        wynik.extend(_DOPISANY.findall(czesc))
    return wynik


def _elementy_listy(tekst: str) -> list[str]:
    """Podział po przecinkach poza nawiasami."""
    elementy: list[str] = []
    glebokosc = 0
    biezacy = ""
    for znak in tekst:
        glebokosc += {"(": 1, ")": -1}.get(znak, 0)
        if znak == "," and glebokosc == 0:
            elementy.append(biezacy.strip())
            biezacy = ""
        else:
            biezacy += znak
    if biezacy.strip():
        elementy.append(biezacy.strip())
    return elementy


def parsuj_zaleznosci(tekst: str) -> tuple[list[str], list[str], list[str]]:
    """(zależności, pominięte, błędy) z komórki „Zależność"."""
    if tekst.strip() in ("", "—", "-", "–"):
        return [], [], []
    zaleznosci: list[str] = []
    pominiete: list[str] = []
    bledy: list[str] = []
    for element in _elementy_listy(tekst):
        poczatek = _IDENTYFIKATOR.match(element)
        if poczatek is None:
            bledy.append(f"nierozpoznana zależność {element!r}")
            continue
        (pominiete if ZNACZNIK_POMINIECIA in element else zaleznosci).append(poczatek.group(1))
    return zaleznosci, pominiete, bledy


def parsuj_tabele(tekst_sekcji: str) -> tuple[list[WierszTabeli], list[str]]:
    """Wiersze tabeli §11 z kolumną „Zależność" (kolumny wg nagłówka)."""
    linie = tekst_sekcji.splitlines()
    for numer, linia in enumerate(linie):
        naglowek = komorki(linia) if linia.lstrip().startswith("|") else []
        if KOLUMNA_ZALEZNOSC not in naglowek or KOLUMNA_WORKSTREAM not in naglowek:
            continue
        k_ws = naglowek.index(KOLUMNA_WORKSTREAM)
        k_zd = naglowek.index(KOLUMNA_ZDOLNOSC) if KOLUMNA_ZDOLNOSC in naglowek else None
        k_za = naglowek.index(KOLUMNA_ZALEZNOSC)
        wiersze: list[WierszTabeli] = []
        bledy: list[str] = []
        for wiersz in linie[numer + 2 :]:
            if not wiersz.lstrip().startswith("|"):
                break
            kom = komorki(wiersz)
            if len(kom) != len(naglowek):
                bledy.append(
                    f"tabela §11: wiersz ma {len(kom)} kolumn zamiast {len(naglowek)}: {wiersz[:80]!r}"
                )
                continue
            h = _PRZYROST_H.match(kom[k_zd]) if k_zd is not None else None
            identyfikatory = _identyfikatory_kolumny(kom[k_ws])
            if not identyfikatory and h is None:
                bledy.append(f"tabela §11: wiersz bez identyfikatora przyrostu: {kom[k_ws]!r}")
                continue
            zaleznosci, pominiete, bledy_komorki = parsuj_zaleznosci(kom[k_za])
            bledy.extend(f"tabela §11 ({kom[k_ws]}): {b}" for b in bledy_komorki)
            wiersze.append(
                WierszTabeli(
                    przyrosty=(h.group(1),) if h else tuple(identyfikatory),
                    konsumenci=tuple(identyfikatory) if h else (),
                    zaleznosci=tuple(zaleznosci),
                    pominiete=tuple(pominiete),
                    zrodlo=kom[k_ws],
                )
            )
        return wiersze, bledy
    return [], ["tabela §11: brak tabeli z kolumnami „Istniejący workstream” i „Zależność”"]


def parsuj_plan(tekst: str) -> Plan:
    bledy: list[str] = []
    s5 = sekcja(tekst, 5)
    s11 = sekcja(tekst, 11)
    if s5 is None:
        bledy.append("plan: brak sekcji `## 5.`")
    if s11 is None:
        bledy.append("plan: brak sekcji `## 11.`")
    sekwencja, bledy_sekwencji = parsuj_sekwencje(s5 or "")
    wiersze, bledy_tabeli = parsuj_tabele(s11 or "")
    return Plan(sekwencja, wiersze, [*bledy, *bledy_sekwencji, *bledy_tabeli])


# ---------------------------------------------------------------------------
# Graf i reguły
# ---------------------------------------------------------------------------


def _czlonkowie_grupy(identyfikator: str, sekwencja: list[str]) -> list[str]:
    return [t for t in sekwencja if t.startswith(identyfikator + ".")]


@dataclass
class Graf:
    krawedzie: dict[str, set[str]]  # zależność → przyrosty zależne
    pozycje: dict[str, list[int]]
    zewnetrzne: set[str]
    grupy: dict[str, list[str]]
    pominiete: list[tuple[str, str]]


def zbuduj_graf(plan: Plan) -> Graf:
    krawedzie: dict[str, set[str]] = {}
    pominiete: list[tuple[str, str]] = []
    for wiersz in plan.wiersze:
        for przyrost in wiersz.przyrosty:
            krawedzie.setdefault(przyrost, set())
            for zaleznosc in wiersz.zaleznosci:
                krawedzie.setdefault(zaleznosc, set()).add(przyrost)
            pominiete.extend((przyrost, p) for p in wiersz.pominiete)
            for konsument in wiersz.konsumenci:
                krawedzie.setdefault(konsument, set())
                krawedzie[przyrost].add(konsument)
    pozycje: dict[str, list[int]] = {t: [i] for i, t in enumerate(plan.sekwencja)}
    grupy: dict[str, list[str]] = {}
    zewnetrzne: set[str] = set()
    for wezel in sorted(krawedzie):
        if wezel in pozycje:
            continue
        czlonkowie = _czlonkowie_grupy(wezel, plan.sekwencja)
        if czlonkowie:
            grupy[wezel] = czlonkowie
            pozycje[wezel] = [plan.sekwencja.index(c) for c in czlonkowie]
        else:
            zewnetrzne.add(wezel)
    return Graf(krawedzie, pozycje, zewnetrzne, grupy, pominiete)


def _osiagalne_umieszczone(graf: Graf, start: str) -> dict[str, list[str]]:
    """Węzły z pozycją osiągalne ze `start` przez węzły BEZ pozycji: {węzeł: ścieżka}."""
    wynik: dict[str, list[str]] = {}
    kolejka: list[list[str]] = [[start, n] for n in sorted(graf.krawedzie.get(start, ()))]
    odwiedzone = {start}
    while kolejka:
        sciezka = kolejka.pop(0)
        wezel = sciezka[-1]
        if wezel in odwiedzone:
            continue
        odwiedzone.add(wezel)
        if wezel in graf.pozycje:
            wynik.setdefault(wezel, sciezka)
            continue
        kolejka.extend([*sciezka, n] for n in sorted(graf.krawedzie.get(wezel, ())))
    return wynik


def cykle(krawedzie: dict[str, set[str]]) -> list[list[str]]:
    """Silnie spójne składowe z cyklem (Tarjan): >1 węzeł albo pętla własna."""
    indeks: dict[str, int] = {}
    niski: dict[str, int] = {}
    stos: list[str] = []
    na_stosie: set[str] = set()
    wynik: list[list[str]] = []
    licznik = [0]

    def odwiedz(v: str) -> None:
        indeks[v] = niski[v] = licznik[0]
        licznik[0] += 1
        stos.append(v)
        na_stosie.add(v)
        for w in sorted(krawedzie.get(v, ())):
            if w not in indeks:
                odwiedz(w)
                niski[v] = min(niski[v], niski[w])
            elif w in na_stosie:
                niski[v] = min(niski[v], indeks[w])
        if niski[v] == indeks[v]:
            skladowa: list[str] = []
            while True:
                w = stos.pop()
                na_stosie.discard(w)
                skladowa.append(w)
                if w == v:
                    break
            if len(skladowa) > 1 or v in krawedzie.get(v, ()):
                wynik.append(sorted(skladowa))

    for v in sorted(krawedzie):
        if v not in indeks:
            odwiedz(v)
    return wynik


def sprawdz(plan: Plan) -> tuple[list[str], Graf]:
    """Naruszenia planu (lista pusta = zielony) i graf do wydruku."""
    bledy = list(plan.bledy)
    graf = zbuduj_graf(plan)

    for wiersz in plan.wiersze:
        for przyrost in wiersz.przyrosty:
            if przyrost not in graf.pozycje:
                bledy.append(
                    f"przyrost bez miejsca: {przyrost} (§11, wiersz „{wiersz.zrodlo}”) nie stoi "
                    "w sekwencji §5 (ani jako token, ani jako grupa `X.n`)"
                )

    for skladowa in cykle(graf.krawedzie):
        bledy.append("cykl zależności §11: " + " ↔ ".join(skladowa))

    for zaleznosc in sorted(graf.pozycje):
        for zalezny, sciezka in sorted(_osiagalne_umieszczone(graf, zaleznosc).items()):
            if max(graf.pozycje[zaleznosc]) < min(graf.pozycje[zalezny]):
                continue
            posrednie = f" (przez {' → '.join(sciezka[1:-1])})" if len(sciezka) > 2 else ""
            bledy.append(
                f"cykl sekwencja ↔ zależność: {zalezny} ↔ {zaleznosc} — sekwencja §5 stawia "
                f"{zalezny} przed {zaleznosc}, a §11 wymaga {zaleznosc} przed {zalezny}{posrednie}"
            )

    return bledy, graf


# ---------------------------------------------------------------------------
# Wydruk i wejście
# ---------------------------------------------------------------------------


def _lista(elementy: Iterable[str]) -> str:
    return ", ".join(elementy) or "—"


def wydruk(plan: Plan, graf: Graf) -> list[str]:
    linie = [f"Sekwencja §5 ({len(plan.sekwencja)} przyrostów):"]
    linie += [f"  {i + 1:>2}. {t}" for i, t in enumerate(plan.sekwencja)]
    linie.append(
        f"Graf zależności §11 (przyrost ← zależności; {len(plan.wiersze)} wierszy tabeli):"
    )
    poprzednicy: dict[str, set[str]] = {}
    for zrodlo, cele in graf.krawedzie.items():
        for cel in cele:
            poprzednicy.setdefault(cel, set()).add(zrodlo)
    kolejnosc = {t: i for i, t in enumerate(plan.sekwencja)}
    for wezel in sorted(poprzednicy, key=lambda w: (min(graf.pozycje.get(w, [10**6])), w)):
        miejsce = (
            f"#{kolejnosc[wezel] + 1}"
            if wezel in kolejnosc
            else "grupa" if wezel in graf.grupy else "zewnętrzny"
        )
        linie.append(f"  {wezel} [{miejsce}] ← {_lista(sorted(poprzednicy[wezel]))}")
    linie.append("Grupy: " + _lista(f"{g} = {'/'.join(c)}" for g, c in sorted(graf.grupy.items())))
    linie.append("Zewnętrzne (spoza sekwencji — spełnione): " + _lista(sorted(graf.zewnetrzne)))
    linie.append(
        "Pominięte („miejsce w sekwencji, nie zależność techniczna”): "
        + _lista(f"{p} ← {z}" for p, z in graf.pominiete)
    )
    return linie


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Strażnik zależności planu A/B (O-35).")
    parser.add_argument(
        "--plan", type=Path, default=PLAN, help="ścieżka planu (domyślnie plan A/B)"
    )
    argumenty = parser.parse_args(sys.argv[1:] if argv is None else argv)
    if not argumenty.plan.is_file():
        print(
            f"plan_ab_zaleznosci_guard: BŁĄD ŚRODOWISKA: brak planu {argumenty.plan}",
            file=sys.stderr,
        )
        return 2
    plan = parsuj_plan(argumenty.plan.read_text(encoding="utf-8"))
    bledy, graf = sprawdz(plan)
    print("\n".join(wydruk(plan, graf)))
    if bledy:
        print("\nNARUSZENIA ZALEŻNOŚCI PLANU A/B:", file=sys.stderr)
        for blad in bledy:
            print("  " + blad, file=sys.stderr)
        print(
            f"\n{len(bledy)} naruszeń. Sekwencja §5 jest wiążąca: przestaw przyrost za jego "
            "zależności albo popraw kolumnę „Zależność” §11 (plan O-35).",
            file=sys.stderr,
        )
        return 1
    print("\nOK: każdy przyrost stoi po swoich zależnościach; brak cykli i przyrostów bez miejsca.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
