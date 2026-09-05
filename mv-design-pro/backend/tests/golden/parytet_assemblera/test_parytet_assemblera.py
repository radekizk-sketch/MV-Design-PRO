"""Parytet assemblera (CV-4.1): wynik każdego biegu kanonicznego PF/SC sieci rejestru bit w bit.

Złote hashe zebrane na stanie SPRZED wycięcia ``enm/assembler.py``
(``regeneruj.py``). Czerwony test = refaktor zmienił wynik albo odmowę —
naprawia się kod, nie hash (wyjątek: świadoma korekta fizyki z dowodem).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tests.golden.parytet_assemblera.harness import sieci_enm_rejestru, zbierz_hashe

_PLIK = Path(__file__).parent / "zlote_hashe.json"


@pytest.fixture(scope="module")
def zebrane() -> dict[str, dict]:
    return zbierz_hashe(sieci_enm_rejestru())


def test_zlote_hashe_istnieja_i_pokrywaja_kazda_siec_enm_rejestru(zebrane: dict[str, dict]) -> None:
    zlote = json.loads(_PLIK.read_text(encoding="utf-8"))
    assert set(zlote) == set(zebrane), (
        "Zbiór kluczy (sieć × analiza) rozjechał się ze złotym plikiem — nowa sieć w rejestrze "
        "albo nowy wariant: uzupełnij złote hashe świadomie (regeneruj.py) i uzasadnij w commicie."
    )


def test_parytet_bit_w_bit(zebrane: dict[str, dict]) -> None:
    zlote = json.loads(_PLIK.read_text(encoding="utf-8"))
    roznice = {k: (zlote.get(k), v) for k, v in zebrane.items() if zlote.get(k) != v}
    assert not roznice, "Parytet assemblera złamany:\n" + "\n".join(
        f"  {k}: złoty={a} teraz={b}" for k, (a, b) in sorted(roznice.items())
    )


def test_harness_jest_deterministyczny(zebrane: dict[str, dict]) -> None:
    assert zbierz_hashe(sieci_enm_rejestru()) == zebrane
