"""Bramka trwala: modul ma JEDNA tozsamosc — zaden import nie idzie przez `src.` (KD-10).

DEFEKT, KTORY TO ZAMYKA. Katalog `src/` lezy na `sys.path` w KAZDYM kontekscie
(conftest testowy, instalacja editable, `PYTHONPATH=/app/src` w obrazie), wiec
ten sam plik da sie zaimportowac DWIEMA nazwami: `enm.models` oraz
`src.enm.models`. Python traktuje je jak dwa rozne moduly — wykonuje plik dwa
razy i tworzy DWA komplety klas. Pomiar sonda na HEAD przed naprawa: po samym
`import api.main` w jednym procesie zylo **41 modulow podwojnie**, w tym moduly
FROZEN solverow (`short_circuit_iec60909`, `power_flow_newton`,
`power_flow_result`, `protection_iec60255`, `short_circuit_contributions`,
`grid_source_preview`, `power_flow_trace`, `frt_hvrt`).

DLACZEGO TO MINA, A NIE KOSMETYKA. Zmierzone na HEAD przed naprawa:

    enm.models.EnergyNetworkModel      is  src.enm.models.EnergyNetworkModel  -> False
    issubclass(src.enm.models.EnergyNetworkModel, enm.models.EnergyNetworkModel) -> False
    isinstance(src.enm.models.EnergyNetworkModel(), enm.models.EnergyNetworkModel) -> False

Obiekt, ktory semantycznie JEST modelem sieci, oblewa test typu — zaleznie
wylacznie od tego, ktora sciezka importu wykonala sie pierwsza. To samo dotyczy
`except` po klasie wyjatku, dopasowania `@singledispatch`, porownan enumow i
kazdego rejestru trzymanego w zmiennej modulowej (dwie kopie stanu). Blad tej
klasy nie objawia sie stabilnie i nie da sie go zdiagnozowac z komunikatu.

KANONICZNA TOZSAMOSC to nazwa BEZ prefiksu `src.` — bo taka wychodzi z importu
w kazdym z trzech kontekstow uruchomienia i taka jest w calym repozytorium
dominujaca.

Bramka jest STATYCZNA (skan zrodel) i uzupelnia sonde runtime'owa
`test_jedna_tozsamosc_modulow.py`: sonda widzi tylko to, co dany bieg zdazyl
zaimportowac, a skan widzi KAZDY import, takze leniwy (w ciele funkcji) i taki,
ktorego zaden test nie wykonuje.
"""

from __future__ import annotations

import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
TEN_PLIK = Path(__file__).resolve()

# Zakotwiczone na poczatku wiersza (z wcieciem — importy leniwe w ciele funkcji
# tez lapiemy). Lancuchy znakowe i komentarze zawierajace `src.` nie sa importem
# i celowo NIE sa naruszeniem.
WZORZEC = re.compile(r"^\s*(?:from|import)\s+src(?:\.|\s|$)")

# Jawna allowlista odstepstw: sciezka wzgledem `backend/` -> powod.
# PUSTA i taka ma zostac. Wejscie produkcyjne (`uvicorn src.api.main:app`,
# `celery -A src.api.celery_app`) NIE wymaga wpisu, bo jest nazwa modulu
# rozruchowego podana z wiersza polecen, a nie importem w zrodle — a sam
# `api/main.py` nie importuje niczego przez `src.`, wiec moduly domenowe
# laduja pod nazwami kanonicznymi takze w obrazie produkcyjnym.
DOZWOLONE_ODSTEPSTWA: dict[str, str] = {}


def _naruszenia() -> list[str]:
    znaleziska: list[str] = []
    for katalog in ("src", "tests"):
        for plik in sorted((BACKEND / katalog).rglob("*.py")):
            if plik.resolve() == TEN_PLIK:
                # Ten plik CYTUJE wzorzec w opisie i w regexie, sam nie importuje.
                continue
            wzgledny = plik.relative_to(BACKEND).as_posix()
            if wzgledny in DOZWOLONE_ODSTEPSTWA:
                continue
            for numer, linia in enumerate(plik.read_text(encoding="utf-8").splitlines(), start=1):
                if WZORZEC.match(linia):
                    znaleziska.append(f"{wzgledny}:{numer}: {linia.strip()}")
    return znaleziska


def test_zaden_import_nie_idzie_przez_prefiks_src() -> None:
    """Import przez `src.` tworzy DRUGA tozsamosc modulu w tym samym procesie."""
    naruszenia = _naruszenia()

    assert naruszenia == [], (
        "Import przez prefiks `src.` laduje ten sam plik pod DRUGA nazwa modulu. "
        "Python wykonuje go wtedy po raz drugi i tworzy osobny komplet klas, przez co "
        "`isinstance` / `issubclass` / `except` / rejestry modulowe przestaja dzialac "
        "przez granice tych dwoch tozsamosci (zmierzone: 41 modulow podwojnie, w tym "
        "FROZEN solvery). Usun prefiks — `from src.enm.models import X` -> "
        "`from enm.models import X`. Katalog `src` jest na `sys.path` w kazdym "
        "kontekscie uruchomienia, wiec forma bez prefiksu dziala wszedzie.\n"
        + "\n".join(naruszenia)
    )
