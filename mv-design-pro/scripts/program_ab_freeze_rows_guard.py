#!/usr/bin/env python3
"""Guard dokumentu: kazdy OTWARTY wiersz zamrozenia ma DOKLADNIE jeden kamien programu A/B.

DLACZEGO (przeglad adwersarialny `docs/evidence/OPUS_PRZEGLAD_ADWERSARIALNY_2026-09-23.md`
§7.6, program `docs/plan/PROGRAM_AB_DYNAMIKA_I_JAKOSC_ENERGII_2026-09.md` §7). Regula R-01
programu wymaga, zeby kamien wskazywal wiersze zamrozenia, ktore domyka. Odwrotna kontrola
— czy KAZDY otwarty wiersz zamrozenia ma swoj kamien — nie istniala i nie przechodzila
(A3, B4, C1, C3, E8 bez kamienia). Wiersz bez kamienia to zdolnosc, ktorej nikt nie
dostarczy; wiersz w dwoch kamieniach to dwa miejsca prawdy o tym, kto ja dostarcza.

CO SPRAWDZA (obie strony pary):
* tablica A zamrozenia `docs/plan/FINAL_DYNAMICS_CAPABILITY_FREEZE.md` §2 — wiersz jest
  OTWARTY, gdy para (CURRENT, TARGET) != (`CURRENT`, `CURRENT`);
* tabela kamieni programu §7 — kolumna, ktorej naglowek zaczyna sie od „Domyka";
  identyfikator wiersza (`A1`…`I4`, zakres `I1–I4` rozwijany) liczony per kamien;
* kazdy otwarty wiersz wystepuje w kolumnie „Domyka" DOKLADNIE jednego kamienia;
  identyfikator w kolumnie, ktorego zamrozenie nie zna, tez jest bledem.

ZAPADKA ZMIERZONA, NIE WYKLUCZENIE (Zero-Debt pkt 1). Pierwszy pomiar (2026-09-23,
karta AB-1d_min) wykazal naruszenia w planie; karta zakazuje edycji planu dla zielieni
guardu (plan nalezy do orkiestratora). Lista `ZNANE_NARUSZENIA` jest DOKLADNIE
zmierzonym stanem: guard czerwienieje przy KAZDYM nowym naruszeniu ORAZ przy naruszeniu
znanym, ktore zniknelo (lista musi maleć razem z planem — zapadka w dol). Kazde
uruchomienie drukuje znane naruszenia, zeby nie zniknely z pola widzenia.

    python scripts/program_ab_freeze_rows_guard.py
Kod wyjscia: 0 = stan zgodny z zapadka, 1 = nowe albo zdjete naruszenie / blad parsera.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ZAMROZENIE = PROJECT_ROOT / "docs" / "plan" / "FINAL_DYNAMICS_CAPABILITY_FREEZE.md"
PROGRAM = PROJECT_ROOT / "docs" / "plan" / "PROGRAM_AB_DYNAMIKA_I_JAKOSC_ENERGII_2026-09.md"

#: Identyfikator wiersza zamrozenia w pierwszej kolumnie tablicy A: `**A1** …`.
WIERSZ_ZAMROZENIA = re.compile(r"^\*\*([A-I]\d{1,2})\*\*")
#: Identyfikator (albo zakres tej samej litery) w kolumnie „Domyka".
ID_W_KOLUMNIE = re.compile(
    r"(?<![A-Za-z0-9-])([A-I])(\d{1,2})(?:\s*[–-]\s*\1(\d{1,2}))?(?![A-Za-z0-9-])"
)
#: Rozdzial komorek tabeli Markdown (pionowa kreska niepoprzedzona `\`).
KRESKA = re.compile(r"(?<!\\)\|")

#: Zmierzony stan planu — {id: opis naruszenia}. Po odbiorze AB-1d_min (2026-09-23)
#: plan skorygowany: siedem naruszen z pomiaru wykonawcy usunietych (B2 = CURRENT po
#: W6-A; E2/H1/H2 -> AB-2R; D11 -> AB-5R; E7 -> AB-4R; H4 -> AB-7b). Lista MALEJE
#: razem z poprawkami planu (guard wymusza jej skrocenie) i dzis jest PUSTA.
ZNANE_NARUSZENIA: dict[str, str] = {}


def _komorki(linia: str) -> list[str]:
    """Komorki wiersza tabeli: kreska dzieli komorki POZA fragmentem kodu (`…`) i gdy nie
    jest poprzedzona `\\` — plan zapisuje w kodzie m.in. `|I| ≤ I_max`, a sam podzial po
    kresce przesunalby kolumne „Domyka" w tym wierszu (zmierzone: AB-2R)."""
    tresc = linia.strip()
    if not tresc.startswith("|"):
        return []
    komorki: list[str] = []
    biezaca: list[str] = []
    w_kodzie = False
    poprzedni = ""
    for znak in tresc[1:]:
        if znak == "`":
            w_kodzie = not w_kodzie
        if znak == "|" and not w_kodzie and poprzedni != "\\":
            komorki.append("".join(biezaca).strip())
            biezaca = []
        else:
            biezaca.append(znak)
        poprzedni = znak
    if "".join(biezaca).strip():
        komorki.append("".join(biezaca).strip())
    return komorki


def _sekcja(tekst: str, naglowek_prefiks: str) -> list[str]:
    linie = tekst.splitlines()
    for indeks, linia in enumerate(linie):
        if linia.startswith(naglowek_prefiks):
            koniec = next(
                (
                    j
                    for j in range(indeks + 1, len(linie))
                    if linie[j].startswith("## ") and not linie[j].startswith("###")
                ),
                len(linie),
            )
            return linie[indeks + 1 : koniec]
    raise SystemExit(f"[guard] nie znaleziono sekcji {naglowek_prefiks!r}")


def wiersze_zamrozenia(tekst: str) -> dict[str, tuple[str, str]]:
    """{id: (CURRENT, TARGET)} z tablicy A (§2) zamrozenia."""
    linie = _sekcja(tekst, "## 2. ")
    naglowek: list[str] | None = None
    wynik: dict[str, tuple[str, str]] = {}
    for linia in linie:
        komorki = _komorki(linia)
        if not komorki:
            continue
        if naglowek is None:
            naglowek = [komorka.upper() for komorka in komorki]
            continue
        if set("".join(komorki)) <= set("-: "):
            continue
        dopasowanie = WIERSZ_ZAMROZENIA.match(komorki[0])
        if dopasowanie is None:
            continue
        stan = komorki[naglowek.index("CURRENT")]
        cel = komorki[naglowek.index("TARGET")]
        wynik[dopasowanie.group(1)] = (stan, cel)
    if naglowek is None or not wynik:
        raise SystemExit("[guard] tablica A zamrozenia pusta — parser do poprawy")
    return wynik


def identyfikatory_komorki(komorka: str) -> set[str]:
    """Identyfikatory wierszy w komorce „Domyka" (zakres `I1–I4` rozwijany)."""
    ids: set[str] = set()
    for litera, poczatek, koniec in ID_W_KOLUMNIE.findall(komorka):
        if koniec:
            ids |= {f"{litera}{n}" for n in range(int(poczatek), int(koniec) + 1)}
        else:
            ids.add(f"{litera}{poczatek}")
    return ids


def kamienie_domykajace(tekst: str) -> dict[str, set[str]]:
    """{kamien: {id wierszy zamrozenia}} z kolumny „Domyka" tabeli §7 programu."""
    linie = _sekcja(tekst, "## 7. ")
    naglowek: list[str] | None = None
    wynik: dict[str, set[str]] = {}
    for linia in linie:
        komorki = _komorki(linia)
        if not komorki:
            continue
        if naglowek is None:
            naglowek = komorki
            continue
        if set("".join(komorki)) <= set("-: "):
            continue
        kolumna = next((i for i, nazwa in enumerate(naglowek) if nazwa.startswith("Domyka")), None)
        if kolumna is None:
            raise SystemExit("[guard] tabela §7 bez kolumny „Domyka” — parser do poprawy")
        kamien = re.sub(r"\*\*", "", komorki[0]).strip()
        wynik[kamien] = identyfikatory_komorki(komorki[kolumna])
    if naglowek is None or not wynik:
        raise SystemExit("[guard] tabela kamieni §7 pusta — parser do poprawy")
    return wynik


def naruszenia(zamrozenie: str, program: str) -> dict[str, str]:
    """{id: opis} — otwarte wiersze bez kamienia / w wielu kamieniach, id nieznane."""
    wiersze = wiersze_zamrozenia(zamrozenie)
    kamienie = kamienie_domykajace(program)
    wynik: dict[str, str] = {}
    for identyfikator, (stan, cel) in sorted(wiersze.items()):
        if (stan, cel) == ("CURRENT", "CURRENT"):
            continue
        domykajace = sorted(k for k, ids in kamienie.items() if identyfikator in ids)
        if len(domykajace) == 0:
            wynik[identyfikator] = f"otwarty ({stan} -> {cel}), brak kamienia w kolumnie Domyka"
        elif len(domykajace) > 1:
            wynik[identyfikator] = (
                f"otwarty ({stan} -> {cel}), {len(domykajace)} kamienie: " + "; ".join(domykajace)
            )
    wszystkie = set().union(*kamienie.values())
    for identyfikator in sorted(wszystkie - set(wiersze)):
        wynik[identyfikator] = "identyfikator w kolumnie Domyka nieznany zamrozeniu"
    return wynik


def main() -> int:
    stan = naruszenia(ZAMROZENIE.read_text(encoding="utf-8"), PROGRAM.read_text(encoding="utf-8"))
    nowe = {k: v for k, v in stan.items() if k not in ZNANE_NARUSZENIA}
    zdjete = sorted(set(ZNANE_NARUSZENIA) - set(stan))
    zmienione = {
        k: v for k, v in stan.items() if k in ZNANE_NARUSZENIA and ZNANE_NARUSZENIA[k] != v
    }
    for identyfikator, opis in sorted(stan.items()):
        znacznik = "ZNANE" if identyfikator in ZNANE_NARUSZENIA else "NOWE"
        print(f"[{znacznik}] {identyfikator}: {opis}")
    if nowe or zdjete or zmienione:
        if zdjete:
            print(f"Naruszenia usuniete z planu — skroc ZNANE_NARUSZENIA: {zdjete}")
        if zmienione:
            print(
                f"Naruszenia zmienione — zaktualizuj opis w ZNANE_NARUSZENIA: {sorted(zmienione)}"
            )
        print("CZERWONY: stan planu rozjechal sie z zapadka.")
        return 1
    print(f"OK: {len(stan)} znanych naruszen (zapadka), zero nowych.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
