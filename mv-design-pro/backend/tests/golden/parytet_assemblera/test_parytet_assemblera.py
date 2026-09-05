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


def test_widok_parytetu_zeruje_szum_zachowuje_parametry_i_wartosci_znaczace() -> None:
    """Iloczyn cech: {zero fizyczne, reszta NR, parametr, wartość duża} × {znak}.

    Szum BLAS/CPU (rzędu 1e-16 względnie) NIE może zmienić hasha parytetu —
    dokładnie to obaliło CI (run 4871): 252/252 hashy inne niż lokalnie.
    """
    from tests.golden.parytet_assemblera.harness import hash_parytetu, widok_parytetu

    widok = widok_parytetu(
        {
            "zero_fizyczne": -6.938916726557845e-16,
            "reszta_nr_mw": 4.736406822303252e-08,
            "parametr_tolerancja": 1e-08,
            "napiecie_kv": 15.123456789012345,
            "prad_a": 12345.678901234567,
            "licznik": 7,
            "flaga": True,
            "lista": [2.6707815088660613e-17, -0.0],
        }
    )
    assert widok["zero_fizyczne"] == 0.0 and str(widok["zero_fizyczne"]) == "0.0"
    assert widok["reszta_nr_mw"] == 4.7e-08
    assert widok["parametr_tolerancja"] == 1e-08
    assert widok["napiecie_kv"] == 15.1234568  # 9 cyfr znaczacych, potem 9 miejsc
    assert widok["prad_a"] == 12345.6789
    assert widok["licznik"] == 7 and widok["flaga"] is True
    assert widok["lista"] == [0.0, 0.0]

    baza = {
        "u_kv": [15.1234567891, 14.98765432109],
        "p_mw": [0.5, -6.938916726557845e-16, 4.736406822303252e-08],
        "i_a": [12345.678901234, 9.005550060073712e-14],
    }
    szum = {
        klucz: [x * (1 + 3e-16) + (7e-17 if x == 0 else 0.0) for x in wartosci]
        for klucz, wartosci in baza.items()
    }
    assert hash_parytetu(baza) == hash_parytetu(szum)
