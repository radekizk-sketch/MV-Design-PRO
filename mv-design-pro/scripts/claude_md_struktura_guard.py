#!/usr/bin/env python3
"""Zapadka: opis struktury w `CLAUDE.md` musi zgadzac sie z REPOZYTORIUM.

DLACZEGO TEN GUARD ISTNIEJE. `CLAUDE.md` jest plikiem WIAZACYM — czyta go kazdy
agent przed praca i wyprowadza z niego, gdzie co lezy. Ta sama klasa defektu
wyszla z niego TRZY RAZY:

1. lista "krytycznych testow kontraktowych SLD" wymieniala szesc plikow w
   `sld/core/__tests__/`, z ktorych NIE ISTNIAL ANI JEDEN (naprawione 2026-08-08),
2. blok struktury wymienial `frontend/src/designer/` juz po jego kasacji,
3. blok struktury wymienial OSIEMNASCIE modulow UI bez ani jednego pliku w gicie
   (`wizard/`, `case-manager/`, `results-workspace/`, `protection-results/`, …),
   a jednoczesnie NIE WYMIENIAL warstwy `ui2/`, w ktorej toczy sie biezaca praca —
   `ui2` wystepowalo w calym pliku RAZ, w opisie innego guarda.

Tekst poprawiony recznie zgnije po raz czwarty, bo nic go nie trzyma przy repo.
Dlatego pin: jesli katalog zniknie albo powstanie, ten guard czerwienieje i
zmusza do aktualizacji dokumentu W TYM SAMYM commicie co zmiana kodu.

CO SPRAWDZAMY (obie strony pary — reguła "predykaty parami" z `CLAUDE.md`):
* KAZDY katalog wymieniony w bloku struktury dla `frontend/src/ui` i
  `frontend/src/ui2` MA pliki sledzone przez git — inaczej dokument opisuje byt,
  ktorego nie ma,
* KAZDY katalog istniejacy w repo JEST wymieniony — inaczej dokument milczy o
  zywej warstwie (dokladnie przypadek `ui2/`).

CZEGO NIE SPRAWDZAMY (nazwane wprost, zeby zielen nie znaczyla wiecej, niz znaczy):
* trafnosci OPISU po `#` — to zdanie po polsku, nie da sie go zweryfikowac
  maszynowo; pilnuje recenzja,
* pozostalych blokow drzewa (backend, docs) — obejmuje je osobny dlug, bo
  wymagaja innej reguly dopasowania niz "katalog modulu UI".
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

KORZEN = Path(__file__).resolve().parents[2]
CLAUDE_MD = KORZEN / "CLAUDE.md"

#: Sciezka w repo -> (nazwa katalogu w drzewie, ZNACZNIK jednoznaczny w wierszu).
#:
#: Znacznik jest KONIECZNY, nie ozdobny: sama nazwa `ui/` wystepuje w drzewie
#: kilka razy (`docs/ui/`, `mv-design-pro/docs/ui/`), wiec kotwica po nazwie
#: trafialaby w PIERWSZY z brzegu blok i mierzyla nie ten zbior, co trzeba —
#: dokladnie klasa defektu, ktora ten guard ma tropic. Pierwsza wersja tego
#: pliku sie na tym wylozyla i zameldowala pusty blok.
SLEDZONE_WARSTWY: dict[str, tuple[str, str]] = {
    "mv-design-pro/frontend/src/ui": ("ui", "React components —"),
    "mv-design-pro/frontend/src/ui2": ("ui2", "Warstwa UI programu"),
}

#: Katalogi pomijane po obu stronach — infrastruktura testowa, nie modul produktu.
POMIJANE = frozenset({"__tests__"})

_WIERSZ_DRZEWA = re.compile(r"[├└]── ([A-Za-z0-9_.\-]+)/")


def moduly_z_repo(baza: str) -> set[str]:
    """Katalogi pierwszego poziomu pod `baza`, ktore maja pliki SLEDZONE przez git.

    Zrodlem jest `git ls-files`, nie `os.listdir`: katalog z samymi plikami
    nieledzonymi (artefakty builda, smieci po narzedziach) nie jest modulem
    produktu i nie ma prawa wymuszac wpisu w dokumencie.
    """
    wynik = subprocess.run(
        ["git", "ls-files", baza], cwd=KORZEN, capture_output=True, text=True, check=True
    )
    prefiks = baza.rstrip("/") + "/"
    out: set[str] = set()
    for sciezka in wynik.stdout.split():
        reszta = sciezka[len(prefiks) :]
        if "/" in reszta:
            out.add(reszta.split("/", 1)[0])
    return out - POMIJANE


def moduly_z_dokumentu(tekst: str, nazwa: str, znacznik: str) -> set[str]:
    """Katalogi wymienione w bloku drzewa dla katalogu `nazwa`.

    Naglowek bloku musi spelnic OBA warunki naraz: wiersz drzewa o dokladnie tej
    nazwie ORAZ obecnosc `znacznik` — patrz komentarz przy `SLEDZONE_WARSTWY`.
    Blok konczy sie na pierwszym wierszu drzewa o wciecu MNIEJSZYM LUB ROWNYM
    naglowkowi, czyli tam, gdzie drzewo wraca na wyzszy poziom.
    """
    linie = tekst.splitlines()
    start = None
    for i, w in enumerate(linie):
        m = _WIERSZ_DRZEWA.search(w)
        if m is not None and m.group(1) == nazwa and znacznik in w:
            start = i
            break
    if start is None:
        raise SystemExit(
            f"[brak-bloku] `CLAUDE.md` nie ma wiersza drzewa `{nazwa}/` ze znacznikiem "
            f"`{znacznik}`. Znacznik jest czescia kontraktu tego guarda — jesli zmieniasz "
            f"opis warstwy, zmien go TAKZE tutaj."
        )

    def wciecie(w: str) -> int:
        m = _WIERSZ_DRZEWA.search(w)
        return m.start() if m else -1

    baza_wciecia = wciecie(linie[start])
    out: set[str] = set()
    for w in linie[start + 1 :]:
        m = _WIERSZ_DRZEWA.search(w)
        if m is None:
            continue
        if m.start() <= baza_wciecia:
            break
        # Bierzemy WYLACZNIE pierwszy poziom pod naglowkiem; glebsze podkatalogi
        # (np. `sld/v3/`) sa opisem wewnetrznym modulu, nie osobnym modulem.
        if m.start() > baza_wciecia + 4:
            continue
        out.add(m.group(1))
    return out - POMIJANE


def main() -> int:
    if not CLAUDE_MD.is_file():
        print(f"[brak-pliku] nie znaleziono {CLAUDE_MD}")
        return 1
    tekst = CLAUDE_MD.read_text(encoding="utf-8")

    naruszenia: list[str] = []
    for baza, (nazwa, znacznik) in SLEDZONE_WARSTWY.items():
        naglowek = f"{nazwa}/"
        w_repo = moduly_z_repo(baza)
        w_dok = moduly_z_dokumentu(tekst, nazwa, znacznik)
        # Zapadka na zbior pusty: skan, ktory nic nie widzi, jest zielony z tego
        # samego powodu, co skan, ktory widzi komplet — i nie wolno ich mylic.
        if not w_repo:
            naruszenia.append(f"[pusty-skan] `git ls-files {baza}` nie zwrocil ani jednego modulu")
            continue
        if not w_dok:
            naruszenia.append(f"[pusty-blok] blok `{naglowek}` w CLAUDE.md nie wymienia modulow")
            continue
        widmo = sorted(w_dok - w_repo)
        milczenie = sorted(w_repo - w_dok)
        if widmo:
            naruszenia.append(
                f"[modul-widmo] `{naglowek}` wymienia {len(widmo)} katalogow BEZ ani jednego "
                f"pliku w gicie: {widmo}. Dokument wiazacy opisuje byt, ktorego nie ma."
            )
        if milczenie:
            naruszenia.append(
                f"[modul-przemilczany] `{baza}` ma {len(milczenie)} modulow NIEWYMIENIONYCH "
                f"w CLAUDE.md: {milczenie}. Tak przemilczana byla cala warstwa `ui2/`."
            )

    if naruszenia:
        print(f"\nFAILED: {len(naruszenia)} naruszen zgodnosci CLAUDE.md z repozytorium:\n")
        for n in naruszenia:
            print(f"  {n}")
        print(
            "\nDokument opisu struktury aktualizuje sie W TYM SAMYM commicie, co zmiane "
            "ukladu katalogow — inaczej kolejny agent wyprowadzi z niego falszywy obraz kodu."
        )
        return 1

    ile = {b: len(moduly_z_repo(b)) for b in SLEDZONE_WARSTWY}
    print(
        "claude_md_struktura_guard: "
        + " · ".join(f"{b.split('/')[-1]}={n}" for b, n in ile.items())
    )
    print("OK: opis struktury UI w CLAUDE.md zgadza sie z repozytorium.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
