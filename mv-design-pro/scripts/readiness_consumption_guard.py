#!/usr/bin/env python3
"""Guard KONSUMPCJI kodow gotowosci (karta F-K6, V12K-206).

Istniejacy `readiness_codes_guard.py` pilnuje KSZTALTU rejestru: czy kod ma komunikat
PL, poziom, priorytet, akcje naprawcza i nawigacje. Nie pilnuje jednak rzeczy, ktora
znalezisko Z8 audytu FLOW nazwalo wprost: czy kod ma jakakolwiek DROGE do projektanta.
Rejestr moze byc kompletny formalnie i calkowicie martwy funkcjonalnie.

Ten guard sprawdza CZTERY niezmienniki:

  (a) Kazdy kod kanonu ma EMITER w kodzie produkcyjnym albo jawna REZERWACJE z powodem
      (`KODY_KANONU_ZAREZERWOWANE`). Kod bez emitera i bez powodu jest bledem — nigdy
      nie dotrze do uzytkownika, a wyglada w rejestrze jak dzialajaca zdolnosc.

  (b) Kazdy kod walidatora ENM (realny dostawca sygnalu) jest ODWZOROWANY na kanon albo
      jawnie wymieniony jako bez odpowiednika, z powodem. Milczenie tutaj oznaczaloby,
      ze sygnal dociera do UI bez kanonicznej tresci i nikt tego nie zauwazyl.

  (c) Odwzorowanie nie ma SIEROT: kazdy cel istnieje w kanonie (inaczej most prowadzi
      w prozne miejsce).

  (d) Front NIE deklaruje wlasnego rejestru kodow gotowosci. Tylko backend zna stan
      modelu, wiec tablica kodow w `frontend/src` to kody bez dostawcy — dokladnie taka
      atrapa (12 kodow zrodel nN, konsumowana wylacznie przez testy) byla powodem tej
      karty.

EXIT CODES:
  0 = wszystkie niezmienniki spelnione
  1 = naruszenie
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = REPO_ROOT / "backend" / "src"
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"
VALIDATOR = BACKEND_SRC / "enm" / "validator.py"

sys.path.insert(0, str(BACKEND_SRC))

from domain.canonical_operations import READINESS_CODES  # noqa: E402
from domain.readiness_bridge import (  # noqa: E402
    KODY_KANONU_ZAREZERWOWANE,
    KODY_WALIDATORA_BEZ_KANONU,
    ODWZOROWANIE_WALIDATOR_NA_KANON,
)

# Pliki, ktore SA rejestrem/mostem — ich wlasne literaly nie licza sie jako emiter.
_PLIKI_REJESTRU = {
    BACKEND_SRC / "domain" / "canonical_operations.py",
    BACKEND_SRC / "domain" / "readiness_bridge.py",
}


def _kody_emitowane() -> set[str]:
    """Kody kanonu wystepujace jako literal w kodzie produkcyjnym (poza rejestrem)."""
    emitowane: set[str] = set()
    kody = set(READINESS_CODES)
    for plik in BACKEND_SRC.rglob("*.py"):
        if plik in _PLIKI_REJESTRU:
            continue
        tresc = plik.read_text(encoding="utf-8", errors="replace")
        for kod in kody:
            if f'"{kod}"' in tresc or f"'{kod}'" in tresc:
                emitowane.add(kod)
    # Kod osiagalny przez odwzorowanie z walidatora tez ma droge do uzytkownika.
    emitowane.update(ODWZOROWANIE_WALIDATOR_NA_KANON.values())
    return emitowane


def _kody_walidatora() -> set[str]:
    tresc = VALIDATOR.read_text(encoding="utf-8", errors="replace")
    return set(re.findall(r'code="([^"]+)"', tresc))


# Rejestry gotowosci w froncie, ktorych nie da sie usunac w jednej karcie — z POWODEM
# i wskazaniem karty. To NIE jest wykluczenie: guard dalej je wypisuje z pomiarem i
# odrzuca KAZDY nowy plik tego rodzaju, wiec dlug jest widoczny i nie moze rosnac.
DLUG_REJESTROW_FRONTU: dict[str, str] = {
    "frontend/src/ui/network-build/station-der/readiness.ts": (
        "16 kodow `der.*` z komunikatami PL liczonych w UI ze snapshotu; ma REALNYCH "
        "konsumentow (WorkspaceSurfaceRouter, DerSurfaces), wiec usuniecie wymaga "
        "przeniesienia oceny gotowosci DER do backendu i przepiecia ekranow — karta F-K8."
    ),
}


def _jest_rejestrem_gotowosci(plik: Path, tresc: str) -> bool:
    """Czy plik DEKLARUJE rejestr kodow gotowosci (a nie waliduje formularza).

    Kryterium celowo waskie: co najmniej dwa wpisy z komunikatem PL ORAZ nazwa pliku
    albo nazwa eksportowanej stalej wskazujaca gotowosc. Bez tego zawezenia guard
    lapalby walidacje FORMULARZA nastaw (`settings-model.ts`, kody typu
    INVALID_UNIT_FOR_BASIS) oraz fixture testowe (`useSanityChecks.ts`) — a to nie sa
    rejestry gotowosci modelu i nie o nich mowi znalezisko Z8.
    """
    if tresc.count("message_pl:") < 2 or not re.search(r"\bcode:\s*'", tresc):
        return False
    if "readiness" in plik.name.lower():
        return True
    return bool(re.search(r"export const [A-Z0-9_]*READINESS[A-Z0-9_]*", tresc))


def _tablice_kodow_we_froncie() -> list[str]:
    """Front deklarujacy WLASNY rejestr kodow gotowosci (kody bez dostawcy)."""
    znaleziska: list[str] = []
    if not FRONTEND_SRC.is_dir():
        return znaleziska
    for plik in FRONTEND_SRC.rglob("*.ts"):
        if "__tests__" in plik.parts or plik.name.endswith(".test.ts"):
            continue
        tresc = plik.read_text(encoding="utf-8", errors="replace")
        if _jest_rejestrem_gotowosci(plik, tresc):
            znaleziska.append(str(plik.relative_to(REPO_ROOT)))
    return sorted(znaleziska)


def main() -> int:
    print("=" * 72)
    print("  Readiness Consumption Guard (karta F-K6, V12K-206)")
    print("  Kod gotowosci musi miec DROGE do projektanta albo jawna rezerwacje.")
    print("=" * 72)

    naruszenia: list[str] = []

    # (a) kanon: emiter albo rezerwacja z powodem
    emitowane = _kody_emitowane()
    bez_drogi = sorted(set(READINESS_CODES) - emitowane)
    for kod in bez_drogi:
        powod = KODY_KANONU_ZAREZERWOWANE.get(kod)
        if not powod or not powod.strip():
            naruszenia.append(
                f"(a) kod kanonu bez emitera i bez rezerwacji z powodem: {kod}\n"
                f"     Napraw: dodaj emiter albo wpis w KODY_KANONU_ZAREZERWOWANE "
                f"(domain/readiness_bridge.py) z powodem, dlaczego kodu nikt nie zglasza."
            )

    # (b) walidator: odwzorowanie albo jawny brak odpowiednika
    kody_v = _kody_walidatora()
    for kod in sorted(kody_v):
        if kod in ODWZOROWANIE_WALIDATOR_NA_KANON:
            continue
        powod = KODY_WALIDATORA_BEZ_KANONU.get(kod)
        if not powod or not powod.strip():
            naruszenia.append(
                f"(b) kod walidatora ENM bez rozstrzygniecia: {kod}\n"
                f"     Napraw: dodaj go do ODWZOROWANIE_WALIDATOR_NA_KANON (gdy warunek "
                f"jest ten sam) albo do KODY_WALIDATORA_BEZ_KANONU z powodem."
            )

    # (c) odwzorowanie bez sierot
    for kod_v, kod_k in sorted(ODWZOROWANIE_WALIDATOR_NA_KANON.items()):
        if kod_k not in READINESS_CODES:
            naruszenia.append(f"(c) odwzorowanie {kod_v} -> {kod_k}: cel nie istnieje w kanonie.")

    # (c2) rezerwacje bez kodu w kanonie (rejestr rezerwacji musi opisywac realne kody)
    for kod in sorted(KODY_KANONU_ZAREZERWOWANE):
        if kod not in READINESS_CODES:
            naruszenia.append(f"(c) rezerwacja opisuje kod, ktorego nie ma w kanonie: {kod}")

    # (c3) wpisy „bez kanonu" musza dotyczyc realnych kodow walidatora
    for kod in sorted(KODY_WALIDATORA_BEZ_KANONU):
        if kod not in kody_v:
            naruszenia.append(
                f"(c) wpis KODY_WALIDATORA_BEZ_KANONU dotyczy kodu, ktorego walidator "
                f"nie emituje: {kod}"
            )

    # (d) front bez wlasnego rejestru (poza jawnym, zmierzonym dlugiem)
    rejestry_frontu = _tablice_kodow_we_froncie()
    for plik in rejestry_frontu:
        powod = DLUG_REJESTROW_FRONTU.get(plik)
        if powod:
            print(f"\n  DLUG JAWNY [{plik}]:\n    {powod}")
            continue
        naruszenia.append(
            f"(d) front deklaruje wlasny rejestr kodow gotowosci: {plik}\n"
            f"     Napraw: przenies tresc do READINESS_CODES i czytaj ja z koncowki "
            f"GET /api/readiness/registry — tylko backend zna stan modelu."
        )

    # (d2) rejestr dlugu musi opisywac ISTNIEJACE pliki — inaczej dlug „znika"
    # z dokumentacji, choc plik zostal usuniety albo przeniesiony.
    for plik in sorted(DLUG_REJESTROW_FRONTU):
        if plik not in rejestry_frontu:
            naruszenia.append(
                f"(d) wpis dlugu dotyczy pliku, ktory nie jest (juz) rejestrem "
                f"gotowosci: {plik}\n     Napraw: usun wpis z DLUG_REJESTROW_FRONTU."
            )

    print(f"\n  Kodow w kanonie:            {len(READINESS_CODES)}")
    print(f"  Kodow z droga do uzytkownika: {len(emitowane & set(READINESS_CODES))}")
    print(f"  Kodow zarezerwowanych:      {len(bez_drogi)}")
    print(f"  Kodow walidatora ENM:       {len(kody_v)}")
    print(f"  Odwzorowanych na kanon:     {len(ODWZOROWANIE_WALIDATOR_NA_KANON)}")
    print(f"  Jawnie bez odpowiednika:    {len(KODY_WALIDATORA_BEZ_KANONU)}")

    if naruszenia:
        print(f"\n  FAIL: {len(naruszenia)} naruszenie(a):\n")
        for n in naruszenia:
            print(f"    - {n}")
        print("=" * 72)
        return 1

    print("\n  PASS: kazdy kod ma droge do projektanta albo jawna rezerwacje.")
    print("=" * 72)
    return 0


if __name__ == "__main__":
    sys.exit(main())
