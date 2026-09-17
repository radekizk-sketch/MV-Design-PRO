#!/usr/bin/env python3
"""Testy straznika nazwania twardych regul katalogu (karta KATALOG-NIEZMIENNIKI).

Wzorzec przejety z `test_readiness_dictionary_guard.py`: sciezki czerwieni na
SYNTETYCZNYM katalogu (tmp_path), bramka zieleni jednym wywolaniem straznika na
PRAWDZIWYM repozytorium. Zero psucia zrodel produkcyjnych i grania w przywracanie
ich w `finally`.

Dowod czerwonej iniekcji jest tu CZTEROKROTNY, bo straznik ma cztery rozne
sciezki odrzucenia (surowy raise w `types.py`, surowy raise w walidacji rekordu
dowolnego modulu, kod spoza rejestru, kod reguly miekkiej). Test, ktory
sprawdzalby jedna z nich, uwiarygodnialby pozostale trzy bez dowodu.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from niezmienniki_katalogu_guard import (  # noqa: E402
    KATALOG_DIR,
    PLIKI_ZWOLNIONE,
    _jest_walidacja_rekordu,
    modul_rejestru,
    zbadaj,
)

NAGLOWEK = "from __future__ import annotations\n\nfrom dataclasses import dataclass\n\n"


def _katalog_syntetyczny(tmp_path: Path, nazwa: str, tresc: str) -> Path:
    katalog = tmp_path / "catalog"
    katalog.mkdir(exist_ok=True)
    # Rejestr musi byc widoczny pod ta sama nazwa, bo straznik go pomija.
    (katalog / "niezmienniki_katalogu.py").write_text("# rejestr (pomijany)\n", encoding="utf-8")
    (katalog / nazwa).write_text(NAGLOWEK + tresc, encoding="utf-8")
    return katalog


def test_zielono_na_prawdziwym_repozytorium() -> None:
    """Bramka: zrodla katalogu w repozytorium nie maja surowego `raise ValueError`."""
    assert zbadaj() == []


def test_straznik_podprocesem_konczy_sie_zerem() -> None:
    wynik = subprocess.run(
        [sys.executable, str(REPO / "scripts" / "niezmienniki_katalogu_guard.py")],
        capture_output=True,
        text=True,
        cwd=REPO,
    )
    assert wynik.returncode == 0, wynik.stdout + wynik.stderr
    assert "regul twardych" in wynik.stdout


def test_iniekcja_surowy_raise_w_pliku_typow(tmp_path: Path) -> None:
    """CZERWIEN 1/4: jakikolwiek `raise ValueError` w `types.py` — nawet poza walidacja."""
    katalog = _katalog_syntetyczny(
        tmp_path,
        "types.py",
        "def pomocnicza(x: int) -> int:\n"
        "    if x < 0:\n"
        '        raise ValueError("ujemne")\n'
        "    return x\n",
    )
    naruszenia = zbadaj(katalog=katalog, plik_typow=katalog / "types.py")
    assert len(naruszenia) == 1, naruszenia
    assert "types.py" in naruszenia[0].plik
    assert "odmowa_twarda" in naruszenia[0].opis


def test_iniekcja_surowy_raise_w_walidacji_rekordu_dowolnego_modulu(tmp_path: Path) -> None:
    """CZERWIEN 2/4: KLASA, nie instancja — nowy modul katalogu wchodzi do skanu sam."""
    katalog = _katalog_syntetyczny(
        tmp_path,
        "mv_zupelnie_nowy_katalog.py",
        "@dataclass(frozen=True)\n"
        "class NowyTyp:\n"
        "    wartosc: float\n\n"
        "    def __post_init__(self) -> None:\n"
        "        if self.wartosc <= 0:\n"
        '            raise ValueError("wartosc musi byc dodatnia")\n',
    )
    naruszenia = zbadaj(katalog=katalog, plik_typow=katalog / "types.py")
    assert len(naruszenia) == 1, naruszenia
    assert "mv_zupelnie_nowy_katalog.py" in naruszenia[0].plik
    assert "__post_init__" in naruszenia[0].opis


def test_raise_poza_walidacja_rekordu_nie_jest_naruszeniem(tmp_path: Path) -> None:
    """Predykat parami: straznik pilnuje BRAMEK REKORDU, nie kazdego `ValueError`.

    Walidacja ARGUMENTU funkcji odczytu tablicy normowej (np. „U0 spoza zakresu
    tablicy") nie jest odmowa rekordu katalogu i nie ma kodu w rejestrze — gdyby
    straznik ja lapal, rejestr zapelnilby sie regulami o niczym.
    """
    katalog = _katalog_syntetyczny(
        tmp_path,
        "lv_odczyt_tablicy.py",
        "def pasmo_dla_napiecia(u0_v: float) -> str:\n"
        "    if u0_v <= 50.0:\n"
        '        raise ValueError("poza zakresem tablicy")\n'
        '    return "50<U0<=120"\n',
    )
    assert zbadaj(katalog=katalog, plik_typow=katalog / "types.py") == []


def test_iniekcja_kod_spoza_rejestru(tmp_path: Path) -> None:
    """CZERWIEN 3/4: literal kodu, ktorego rejestr nie zna."""
    katalog = _katalog_syntetyczny(
        tmp_path,
        "mv_katalog_z_bledem.py",
        "@dataclass(frozen=True)\n"
        "class Typ:\n"
        "    wartosc: float\n\n"
        "    def __post_init__(self) -> None:\n"
        "        if self.wartosc <= 0:\n"
        '            odmowa_twarda("KAT-T-999", "nie ma takiej reguly")\n',
    )
    naruszenia = zbadaj(katalog=katalog, plik_typow=katalog / "types.py")
    assert len(naruszenia) == 1, naruszenia
    assert "KAT-T-999" in naruszenia[0].opis
    assert "nie istnieje w rejestrze" in naruszenia[0].opis


def test_iniekcja_kod_reguly_miekkiej_w_bramce(tmp_path: Path) -> None:
    """CZERWIEN 4/4: wiarygodnosc uzyta jako odmowa — dokladnie to, czego karta zakazuje."""
    kod_miekki = sorted(modul_rejestru().KODY_WIARYGODNOSCI)[0]
    katalog = _katalog_syntetyczny(
        tmp_path,
        "mv_katalog_z_miekka_bramka.py",
        "@dataclass(frozen=True)\n"
        "class Typ:\n"
        "    r0: float\n"
        "    r1: float\n\n"
        "    def __post_init__(self) -> None:\n"
        "        if self.r0 < self.r1:\n"
        f'            odmowa_twarda("{kod_miekki}", "R0 < R1")\n',
    )
    naruszenia = zbadaj(katalog=katalog, plik_typow=katalog / "types.py")
    assert len(naruszenia) == 1, naruszenia
    assert kod_miekki in naruszenia[0].opis
    assert "MIEKKA" in naruszenia[0].opis


def test_kod_wyliczany_w_czasie_wykonania_jest_naruszeniem(tmp_path: Path) -> None:
    """Kod niebedacy literalem omijalby sprawdzenie 3 — straznik mowi to wprost."""
    katalog = _katalog_syntetyczny(
        tmp_path,
        "mv_katalog_z_kodem_zmiennym.py",
        "@dataclass(frozen=True)\n"
        "class Typ:\n"
        "    wartosc: float\n"
        "    kod: str\n\n"
        "    def __post_init__(self) -> None:\n"
        "        if self.wartosc <= 0:\n"
        "            odmowa_twarda(self.kod, \"wartosc\")\n",
    )
    naruszenia = zbadaj(katalog=katalog, plik_typow=katalog / "types.py")
    assert len(naruszenia) == 1, naruszenia
    assert "literalem tekstowym" in naruszenia[0].opis


def test_pusty_skan_jest_bledem(tmp_path: Path) -> None:
    """Straznik, ktory nic nie zbadal, NIE MA prawa meldowac zieleni."""
    pusty = tmp_path / "pusty"
    pusty.mkdir()
    naruszenia = zbadaj(katalog=pusty, plik_typow=pusty / "types.py")
    assert len(naruszenia) == 1
    assert "PUSTY SKAN" in naruszenia[0].opis


def test_wylaczenie_dotyczy_dokladnie_jednego_pliku() -> None:
    """Deklaracja „JEDYNE WYLACZENIE" z naglowka ma test, nie zdanie w docstringu."""
    assert PLIKI_ZWOLNIONE == frozenset({"niezmienniki_katalogu.py"})
    assert (KATALOG_DIR / "niezmienniki_katalogu.py").is_file()


def test_predykat_walidacji_rekordu_rozpoznaje_kontrakt_nazw() -> None:
    for nazwa in ("__post_init__", "from_dict", "validate_power_hierarchy", "_validate_pq_curve"):
        assert _jest_walidacja_rekordu(nazwa), nazwa
    for nazwa in ("to_dict", "pasmo_dla_napiecia", "list_line_types", "__init__"):
        assert not _jest_walidacja_rekordu(nazwa), nazwa
