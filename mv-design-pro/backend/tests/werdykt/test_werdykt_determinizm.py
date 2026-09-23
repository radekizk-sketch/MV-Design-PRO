"""Determinizm rekordu werdyktu (T12): ta sama treść wejścia → bajtowo ten sam JSON.

Intencja: kanoniczny JSON rekordu (klucze posortowane, zapis zwarty, UTF-8 bez ucieczek) i jego
SHA-256 są takie same przy dwóch niezależnych budowach, po odczycie rekordu z JSON i w procesach
o RÓŻNYM ziarnie skrótu (``PYTHONHASHSEED``) — tekst werdyktu nie może zależeć od kolejności
iteracji zbiorów. Sprawdzane na całym katalogu rekordów K i W.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from werdykt import OcenaKryterium, WynikWymagania

from tests.werdykt import fabryki as f

KORZEN_BACKENDU = Path(__file__).resolve().parents[2]
REKORDY = f.rekordy_k() + f.rekordy_w()
IDENTYFIKATORY = [n for n, _ in REKORDY]


@pytest.mark.parametrize("indeks", range(len(REKORDY)), ids=IDENTYFIKATORY)
def test_t12_dwie_niezalezne_budowy_daja_ten_sam_json(indeks: int) -> None:
    pierwszy = REKORDY[indeks][1]
    drugi = (f.rekordy_k() + f.rekordy_w())[indeks][1]
    assert pierwszy is not drugi
    assert pierwszy.kanoniczny_json().encode("utf-8") == drugi.kanoniczny_json().encode("utf-8")
    assert pierwszy.odcisk() == drugi.odcisk()


@pytest.mark.parametrize("nazwa, rekord", REKORDY, ids=IDENTYFIKATORY)
def test_t12_kanoniczny_json_i_odcisk(nazwa: str, rekord: OcenaKryterium | WynikWymagania) -> None:
    tekst = rekord.kanoniczny_json()
    assert tekst == json.dumps(
        json.loads(tekst), sort_keys=True, ensure_ascii=False, separators=(",", ":")
    )
    assert json.loads(tekst) == rekord.model_dump(mode="json")
    assert "\\u" not in tekst
    assert rekord.odcisk() == hashlib.sha256(tekst.encode("utf-8")).hexdigest()


@pytest.mark.parametrize("nazwa, rekord", REKORDY, ids=IDENTYFIKATORY)
def test_t12_odczyt_z_json_odtwarza_rekord_bajtowo(
    nazwa: str, rekord: OcenaKryterium | WynikWymagania
) -> None:
    odczytany = type(rekord).model_validate_json(rekord.kanoniczny_json())
    assert odczytany == rekord
    assert odczytany.kanoniczny_json() == rekord.kanoniczny_json()


def test_t12_rozna_tresc_daje_rozny_odcisk() -> None:
    odciski = {rekord.odcisk() for _, rekord in REKORDY}
    assert len(odciski) == len(REKORDY)
    assert f.ocena(m=2.0).odcisk() != f.ocena(m=1.0).odcisk()


_SKRYPT = (
    "from tests.werdykt import fabryki as f\n"
    "for nazwa, rekord in f.rekordy_k() + f.rekordy_w():\n"
    "    print(nazwa, rekord.odcisk())\n"
)


def _odciski_w_procesie(ziarno: str) -> str:
    srodowisko = {
        **os.environ,
        "PYTHONHASHSEED": ziarno,
        "PYTHONPATH": os.pathsep.join([str(KORZEN_BACKENDU / "src"), str(KORZEN_BACKENDU)]),
    }
    wynik = subprocess.run(
        [sys.executable, "-c", _SKRYPT],
        cwd=KORZEN_BACKENDU,
        env=srodowisko,
        capture_output=True,
        text=True,
        check=True,
        timeout=300,
    )
    return wynik.stdout


def test_t12_odcisk_niezalezny_od_ziarna_skrotu() -> None:
    """Trzy procesy o różnym ``PYTHONHASHSEED`` dają identyczne odciski całego katalogu,
    równe odciskom z procesu testów."""
    oczekiwane = "".join(f"{nazwa} {rekord.odcisk()}\n" for nazwa, rekord in REKORDY)
    for ziarno in ("0", "1", "4242"):
        assert _odciski_w_procesie(ziarno) == oczekiwane, ziarno
