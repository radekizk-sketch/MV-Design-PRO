#!/usr/bin/env python3
"""Ponowne WYKONANIE zrzutow API audytu poprawnym narzedziem (karta KD-3, poz. 12b).

DLACZEGO TEN SKRYPT ISTNIEJE. Dwa artefakty audytu
(`docs/audits/backend_openapi_after_backend.json`,
`docs/audits/backend_projects_after_backend.json`) zostaly zrzucone narzedziem,
ktore rozjechalo kodowanie. Probki ponizej sa CYTATEM z uszkodzonych plikow —
bez nich opis nie mowilby, co dokladnie zaszlo. Uszkodzenie ma DWIE KLASY NARAZ:
  1. mojibake — polska litera zapisana jako para bajtow innej strony kodowej
     (``SieÄ``, ``ukÅad``),
  2. znak zastepczy — litera zamieniona na ASCII, przy czym ta konwersja jest
     STRATNA, wiec oryginalu nie da sie z pliku odtworzyc. Probka z uszkodzonego
     zapisu (mojibake-guard: probka celowa — cytat zapisu audytu): ``ZÅo?ony``.

Reczna „naprawa" znakow falszowalaby ZAPIS audytu (zgadywanie, co tam bylo), a
druga klasa uszkodzenia i tak jest nieodwracalna. Dlatego zrzuty wykonujemy OD
NOWA: z zywego kontraktu API, jawnie w UTF-8, deterministycznie.

CO ROBI SKRYPT
  * `backend_openapi_after_backend.json` — pelny kontrakt OpenAPI wprost z
    aplikacji (`app.openapi()`); zrodlem jest KOD, wiec zrzut jest odtwarzalny
    w dowolnym momencie i nie zalezy od stanu bazy,
  * `backend_projects_after_backend.json` — odpowiedz `GET /api/projects` z
    biezacego srodowiska, pobrana przez `TestClient` (ten sam stos co produkcja).
    Zrzut niesie NAGLOWEK z data i informacja o srodowisku, zeby nikt nie czytal
    pustej listy jako „projekty znikly".

UZYCIE: `poetry run python scripts/zrzut_api_audytu.py`
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[2]
SRC = REPO / "backend" / "src"
DOCS = REPO / "docs" / "audits"

# Backend importuje sie DWOMA sciezkami (`api.…` oraz `src.…`) — obie musza byc
# widoczne, inaczej import aplikacji przerywa sie w polowie drzewa.
sys.path.insert(0, str(SRC))
sys.path.insert(0, str(REPO / "backend"))


def _zapisz(sciezka: Path, dane: Any) -> None:
    """Zapis kanoniczny w UTF-8 — bez escape'owania polskich liter.

    ``ensure_ascii=False`` jest sednem tej naprawy: to on decyduje, czy w pliku
    stoi ``Sieć``, czy ciag ucieczkowy, ktory kolejne narzedzie moze rozjechac.
    """
    sciezka.parent.mkdir(parents=True, exist_ok=True)
    sciezka.write_text(
        json.dumps(dane, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"zapisano {sciezka.relative_to(REPO)} ({sciezka.stat().st_size} B)")


def main() -> int:
    from api.main import app
    from fastapi.testclient import TestClient

    _zapisz(DOCS / "backend_openapi_after_backend.json", app.openapi())

    # Koncowka projektow wymaga skonfigurowanej jednostki pracy (baza). Skrypt
    # podaje ja JAWNIE — inaczej zrzut konczylby sie bledem konfiguracji, ktory
    # nie ma nic wspolnego z kontraktem API. Adres bazy z `DATABASE_URL`
    # (domyslnie plik roboczy backendu) — ten sam mechanizm co aplikacja.
    import os

    from infrastructure.persistence.db import (
        create_engine_from_url,
        create_session_factory,
        init_db,
    )
    from infrastructure.persistence.unit_of_work import build_uow_factory

    silnik = create_engine_from_url(
        os.getenv("DATABASE_URL", "sqlite+pysqlite:///./mv_design_pro.db")
    )
    init_db(silnik)
    app.state.uow_factory = build_uow_factory(create_session_factory(silnik))

    klient = TestClient(app)
    odpowiedz = klient.get("/api/projects")
    projekty: Any
    try:
        projekty = odpowiedz.json()
    except ValueError:
        projekty = {"raw_text": odpowiedz.text}

    _zapisz(
        DOCS / "backend_projects_after_backend.json",
        {
            "zrzut": {
                "koncowka": "GET /api/projects",
                "status_http": odpowiedz.status_code,
                "wykonano": datetime.now(UTC).isoformat(),
                "narzedzie": "backend/scripts/zrzut_api_audytu.py",
                "uwaga": (
                    "Zrzut wykonany od nowa (karta KD-3 poz. 12b). Poprzedni plik byl "
                    "uszkodzony w dwoch klasach naraz (mojibake + znak zastepczy '?'), "
                    "a druga klasa jest STRATNA — tresci audytu z 2026-05 nie da sie z "
                    "niego odtworzyc. Lista odzwierciedla srodowisko wykonania zrzutu."
                ),
            },
            "odpowiedz": projekty,
        },
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
