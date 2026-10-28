"""Napięcie najwyższe sieci U_s i reguły napięcia urządzenia wobec sieci — jedno źródło.

`network_model/pochodne/pasma_napieciowe.py` niesie JEDYNĄ tabelę U_s (IEC 60038 tab. 3–5)
i JEDYNE predykaty: poziom izolacji (U_m ≥ U_s, IEC 60071-1), strefa A maszyny synchronicznej
(IEC 60034-1 p. 7.3), przedział napięcia baterii kondensatorów (IEC 60871-1, IEC 60038) i
równość napięć znamionowych. Lustro frontu (`ui2/model/pasmaNapieciowe.ts`) czyta tę samą
tablicę parytetu `backend/schemas/napiecie_najwyzsze_parytet_v1.json` (vitest
`ui2/model/__tests__/napiecieNajwyzszeParytet.test.ts`) — rozjazd tabeli po którejkolwiek
stronie wywraca test po obu.

Iloczyn cech: sieć {3, 6, 10, 15, 20, 30 kV} × U_m {poniżej, równe, powyżej U_s} oraz granica
U_m = Uₙ; pasmo {nN, SN, WN, spoza tabel, powyżej tabel, brak, niefizyczne}; strefa A {obie
granice 0,95 i 1,05, typowe maszyny, dawne trafienia tolerancji 1 kV}; bateria {obie granice
przedziału, nN}.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import pytest
from network_model.pochodne.pasma_napieciowe import (
    NAPIECIE_NAJWYZSZE_SIECI_KV,
    STREFA_A_NAPIECIA_MASZYNY_PU,
    izolacja_pokrywa_siec,
    napiecie_baterii_pasuje_do_sieci,
    napiecie_najwyzsze_sieci_kv,
    napiecie_sieci_w_strefie_a_maszyny,
    napiecie_wymagane_izolacji_kv,
    to_samo_napiecie_znamionowe,
)

_TABLICA = Path(__file__).resolve().parents[2] / "schemas" / "napiecie_najwyzsze_parytet_v1.json"


def _tablica() -> dict[str, Any]:
    return dict(json.loads(_TABLICA.read_text(encoding="utf-8")))


#: IEC 60038:2009 tab. 3 (seria I) — sieci 3…36 kV: Uₙ → U_s.
SIECI_SN_IEC_60038 = (
    (3.0, 3.6),
    (6.0, 7.2),
    (10.0, 12.0),
    (15.0, 17.5),
    (20.0, 24.0),
    (30.0, 36.0),
)


def test_tabela_parytetu_jest_tabela_zrodla() -> None:
    tabela = {w["napiecie_znamionowe_kv"]: w["u_s_kv"] for w in _tablica()["tabela"]}
    assert tabela == NAPIECIE_NAJWYZSZE_SIECI_KV


@pytest.mark.parametrize("wiersz", _tablica()["wiersze"], ids=lambda w: str(w["napiecie_kv"]))
def test_napiecie_najwyzsze_zgodne_z_tablica_parytetu(wiersz: dict[str, Any]) -> None:
    assert napiecie_najwyzsze_sieci_kv(wiersz["napiecie_kv"]) == wiersz["u_s_kv"]


@pytest.mark.parametrize(
    "para", _tablica()["pary_rownosci"], ids=lambda p: f"{p['pierwsze_kv']}={p['drugie_kv']}"
)
def test_rownosc_napiec_zgodna_z_tablica_parytetu(para: dict[str, Any]) -> None:
    assert to_samo_napiecie_znamionowe(para["pierwsze_kv"], para["drugie_kv"]) is para["to_samo"]


@pytest.mark.parametrize(
    "wiersz",
    _tablica()["izolacja"],
    ids=lambda w: f"{w['u_m_kv']}@{w['napiecie_sieci_kv']}",
)
def test_poziom_izolacji_zgodny_z_tablica_parytetu(wiersz: dict[str, Any]) -> None:
    """Ta sama tablica sprawdza lustro frontu (`izolacjaPokrywaSiec`) — rozjazd reguły U_m ≥ U_s
    między kontrolą aparatu pola / ogranicznika a filtrem rodzin w kreatorze stacji."""
    assert izolacja_pokrywa_siec(wiersz["u_m_kv"], wiersz["napiecie_sieci_kv"]) is wiersz["pokrywa"]


def test_kazda_para_tabeli_ma_u_s_powyzej_napiecia_znamionowego() -> None:
    assert all(u_s > u_n for u_n, u_s in NAPIECIE_NAJWYZSZE_SIECI_KV.items())


@pytest.mark.parametrize("napiecie", [math.nan, math.inf, -math.inf, 0.0, -10.0, 0.4, 1.0, 500.0])
def test_brak_u_s_dla_nn_niefizycznych_i_powyzej_tabel(napiecie: float) -> None:
    assert napiecie_najwyzsze_sieci_kv(napiecie) is None


@pytest.mark.parametrize(("u_n", "u_s"), SIECI_SN_IEC_60038)
@pytest.mark.parametrize(("przesuniecie_kv", "pokrywa"), [(-0.1, False), (0.0, True), (0.1, True)])
def test_poziom_izolacji_iloczyn_sieci_i_polozenia_u_m(
    u_n: float, u_s: float, przesuniecie_kv: float, pokrywa: bool
) -> None:
    """U_m poniżej / równe / powyżej U_s sieci — granica równości dopuszczona."""
    assert izolacja_pokrywa_siec(u_s + przesuniecie_kv, u_n) is pokrywa


@pytest.mark.parametrize(("u_n", "u_s"), SIECI_SN_IEC_60038)
def test_u_m_rowne_napieciu_znamionowemu_sieci_nie_pokrywa_sieci(u_n: float, u_s: float) -> None:
    """Dawna reguła ogranicznika porównywała U_m z Uₙ szyny: typ U_m = 15 kV na szynie 15 kV
    przechodził, choć napięcie robocze sieci sięga U_s = 17,5 kV (IEC 60038 tab. 3)."""
    assert u_s > u_n
    assert izolacja_pokrywa_siec(u_n, u_n) is False


@pytest.mark.parametrize(
    ("u_m", "u_n", "wynik"),
    [
        (0.4, 0.4, True),
        (0.69, 0.4, True),
        (0.23, 0.4, False),
        (None, 15.0, None),
        (17.5, None, None),
    ],
)
def test_poziom_izolacji_nn_i_brak_danej(
    u_m: float | None, u_n: float | None, wynik: bool | None
) -> None:
    assert izolacja_pokrywa_siec(u_m, u_n) is wynik


@pytest.mark.parametrize(
    ("u_n", "wymagane"), [(0.4, 0.4), (1.0, 1.0), (15.0, 17.5), (110.0, 123.0), (None, None)]
)
def test_napiecie_wymagane_izolacji(u_n: float | None, wymagane: float | None) -> None:
    assert napiecie_wymagane_izolacji_kv(u_n) == wymagane


@pytest.mark.parametrize(
    ("u_rg", "u_n", "w_strefie"),
    [
        (6.3, 6.0, True),
        (10.5, 10.0, True),
        (15.75, 15.0, True),
        (21.0, 20.0, True),
        (31.5, 30.0, True),
        (10.0, 10.5, True),
        (7.0, 6.0, False),
        (10.0, 9.5, True),
        (10.0, 9.49, False),
        (10.0, 10.51, False),
        (None, 10.0, None),
        (10.0, 0.0, None),
    ],
)
def test_strefa_a_maszyny_synchronicznej(
    u_rg: float | None, u_n: float, w_strefie: bool | None
) -> None:
    assert STREFA_A_NAPIECIA_MASZYNY_PU == 0.05
    assert napiecie_sieci_w_strefie_a_maszyny(u_rg, u_n) is w_strefie


@pytest.mark.parametrize(
    ("u_bat", "u_n", "pasuje"),
    [
        (14.999, 15.0, False),
        (15.0, 15.0, True),
        (17.0, 15.0, True),
        (17.5, 15.0, True),
        (17.501, 15.0, False),
        (20.0, 15.0, False),
        (20.0, 20.0, True),
        (24.0, 20.0, True),
        (0.4, 0.4, True),
        (0.44, 0.4, False),
        (0.39, 0.4, False),
        (None, 15.0, None),
        (15.0, None, None),
    ],
)
def test_przedzial_napiecia_baterii(
    u_bat: float | None, u_n: float | None, pasuje: bool | None
) -> None:
    assert napiecie_baterii_pasuje_do_sieci(u_bat, u_n) is pasuje
