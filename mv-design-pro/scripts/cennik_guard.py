#!/usr/bin/env python3
"""Strażnik cenników wersjonowanych (karta W10-2a, decyzja OD-16).

PO CO. Cennik żyje obok niemutowalnego katalogu typów i wiąże się z nim WYŁĄCZNIE po
``type_id``. Pozycja z ``type_id`` spoza katalogu, waluta spoza obsługiwanych, data cen spoza
miesiąca wersji, nazwa pliku niezgodna z wersją albo wartość bez stanu źródła to dane, które
funkcje kosztowe wyceniłyby cicho źle — dlatego każdy plik ``catalog/cenniki/cennik_*.yaml``
jest sprawdzany na CI tą samą funkcją (``naruszenia_cennika``), którą loader woła przy wczytaniu
(jedno źródło predykatu). Dodatkowo:

  * plik w katalogu cenników o nazwie spoza wzorca ``cennik_RRRR-MM.yaml`` (literówka w nazwie
    wyłączyłaby cennik z wyboru wersji bez śladu) jest naruszeniem;
  * brak jakiegokolwiek pliku cennika jest naruszeniem — pusty szablon jest dopuszczalny,
    nieobecność pliku nie (funkcje kosztowe nie miałyby czego nazwać w odmowie).

Uruchomienie interpreterem środowiska backendu (import katalogu):
    poetry run python ../scripts/cennik_guard.py     # z katalogu backend/

Kod wyjścia: 0 — wszystkie cenniki zgodne z kontraktem; 1 — naruszenie; 2 — interpreter bez
zależności backendu.
"""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"
KATALOG = BACKEND_SRC / "catalog" / "cenniki"


def zmierz(katalog: Path = KATALOG) -> list[str]:
    """Lista naruszeń wszystkich plików cenników w katalogu (pusta = zielono)."""
    from catalog.cenniki.loader import WZORZEC_PLIKU, BladCennika, wczytaj_cennik

    naruszenia: list[str] = []
    pliki = sorted(katalog.glob("*.yaml"))
    for plik in pliki:
        if WZORZEC_PLIKU.match(plik.name) is None:
            naruszenia.append(f"{plik.name}: nazwa spoza wzorca cennik_RRRR-MM.yaml.")
            continue
        try:
            wczytaj_cennik(plik)
        except BladCennika as exc:
            naruszenia.append(f"{plik.name}: {exc}")
    if not pliki:
        naruszenia.append(
            "Katalog cenników nie zawiera żadnego pliku (wymagany co najmniej szablon)."
        )
    return naruszenia


def main() -> int:
    sys.path.insert(0, str(BACKEND_SRC))
    try:
        naruszenia = zmierz()
    except ModuleNotFoundError as exc:
        print(
            f"cennik_guard: brak zależności backendu ({exc}) — uruchom w venv backendu."
        )
        return 2
    if naruszenia:
        print("cennik_guard: CZERWONY")
        for naruszenie in naruszenia:
            print(f"  - {naruszenie}")
        return 1
    print(
        "cennik_guard: OK — cenniki zgodne z kontraktem (type_id w katalogu, waluta, data, stan)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
