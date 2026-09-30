"""Karta PROT-LTI — tożsamość czasów zadziałania przed i po ujednoliceniu nazwy krzywej.

Krzywa zależna długoczasowa t = TMS·120/(M − 1) miała w produkcie cztery nazwy:
„RI" w jądrze, „IEC_LI" w modelu ENM, „LTI" w adapterze i słowniku operacji domenowych,
„IEC_LTI" w rejestrze krzywych producentów. Karta zostawia jedną nazwę — „LTI"
(członek jądra `IEC60255CurveType.LONG_TIME_INVERSE`, literał modelu „IEC_LTI").

Zmiana dotyczy WYŁĄCZNIE nazwy, więc każdy wynik liczbowy jądra musi być identyczny
bit w bit z wynikiem sprzed karty. Migawka `iec60255_t_m_przed_prot_lti.json` została
wygenerowana z pliku jądra z commita bazowego `f3c435b6` (przed zmianą) i jest
kluczowana STAŁYMI krzywej (A/B), nie nazwą — test nie może więc przejść dzięki temu,
że stara i nowa nazwa „pasują do siebie".

Iloczyn cech: każda krzywa jądra × M ∈ {1,05 … 50} (w tym M ∈ {2, 5, 10, 20} z karty)
× TMS ∈ {0,05 … 1,0} × ścieżka wejścia (jądro wprost, nastawa modelu ENM przez
`czas_z_nastawy`) — porównanie `float.hex`, nie tolerancja.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from application.analyses.protection.czas_wylaczenia_galezi import czas_z_nastawy
from network_model.solvers.protection_iec60255 import (
    IEC60255_CURVE_FORMULAS_LATEX,
    IEC60255_CURVE_PARAMS,
    IEC60255CurveType,
    compute_curve_trip_time,
)

_MIGAWKA = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "protection"
    / "iec60255_t_m_przed_prot_lti.json"
)
_DANE = json.loads(_MIGAWKA.read_text(encoding="utf-8"))

#: Literał krzywej w modelu ENM → klucz migawki (stałe A/B jądra). Odwzorowanie po
#: stałych jest jedynym uczciwym kluczem (SI modelu = NI jądra, inne nazwy tej samej krzywej).
_ENM_NA_KLUCZ = {
    "IEC_SI": "0.14/0.02",
    "IEC_VI": "13.5/1.0",
    "IEC_EI": "80.0/2.0",
    "IEC_LTI": "120.0/1.0",
}


def _hex(v: float | None) -> str | None:
    return None if v is None else float(v).hex()


def _klucz(typ: IEC60255CurveType) -> str:
    if typ not in IEC60255_CURVE_PARAMS:
        return "DT"
    a, b = IEC60255_CURVE_PARAMS[typ]
    return f"{a!r}/{b!r}"


def test_migawka_obejmuje_dokladnie_krzywe_jadra() -> None:
    """Każda krzywa jądra ma wiersze migawki i odwrotnie — nowa albo zgubiona krzywa
    nie może przejść niezauważona."""
    assert sorted(_klucz(t) for t in IEC60255CurveType) == sorted(_DANE["krzywe"])


def test_mnozniki_z_karty_sa_w_migawce() -> None:
    mnozniki = {w[0] for w in _DANE["krzywe"]["120.0/1.0"]["wiersze"]}
    assert {2.0, 5.0, 10.0, 20.0} <= mnozniki


@pytest.mark.parametrize("typ", list(IEC60255CurveType), ids=lambda t: t.value)
def test_jadro_bit_w_bit_jak_przed_karta(typ: IEC60255CurveType) -> None:
    krzywa = _DANE["krzywe"][_klucz(typ)]
    assert IEC60255_CURVE_FORMULAS_LATEX[typ] == krzywa["formula_latex"]
    for m, tms, t, base, mb, den, mx, trip, podstawienie in krzywa["wiersze"]:
        r = compute_curve_trip_time(curve_type=typ, i_fault_a=100.0 * m, is_pickup_a=100.0, tms=tms)
        assert [
            _hex(r.calculated_time_s),
            _hex(r.base_time_s),
            _hex(r.M_power_B),
            _hex(r.denominator),
            _hex(r.current_multiple_M),
            r.will_trip,
            r.substitution_latex,
        ] == [t, base, mb, den, mx, trip, podstawienie], (typ.value, m, tms)


@pytest.mark.parametrize(("literal_enm", "klucz"), sorted(_ENM_NA_KLUCZ.items()))
def test_nastawa_modelu_daje_czas_jak_przed_karta(literal_enm: str, klucz: str) -> None:
    """Tor modelu ENM (`czas_z_nastawy`, konsument czasu wyłączenia gałęzi) po zmianie
    literału „IEC_LI" → „IEC_LTI" daje ten sam czas co jądro przed kartą."""
    for m, tms, t, *_ in _DANE["krzywe"][klucz]["wiersze"]:
        nastawa = {"threshold_a": 100.0, "curve_type": literal_enm, "time_multiplier": tms}
        czas, _powod, opis, stale = czas_z_nastawy(nastawa, 100.0 * m)
        assert _hex(czas) == t, (literal_enm, m, tms)
        assert opis == literal_enm
        if t is not None:
            assert f"{stale[0]!r}/{stale[1]!r}" == klucz


def test_literaly_modelu_pokrywaja_wszystkie_krzywe_odwrotne_jadra() -> None:
    """Predykat parami: zbiór literałów modelu w tym teście = zbiór krzywych odwrotnych
    jądra (bez DT) — test nie pomija krzywej, której nie przewidział."""
    odwrotne = {_klucz(t) for t in IEC60255CurveType if t in IEC60255_CURVE_PARAMS}
    assert set(_ENM_NA_KLUCZ.values()) == odwrotne


def test_jeden_zbior_nazw_krzywych_modelu_i_jego_konsumentow() -> None:
    """Literały krzywej w modelu ENM, odwzorowanie na solver (`_KRZYWE`) i mapa odczytu
    zabezpieczeń (`CURVE_TYPE_MAP`) to TEN SAM zbiór nazw — pozostawiona stara nazwa
    („IEC_LI") w którymkolwiek z trzech miejsc dawałaby cichy brak czasu albo DT."""
    from typing import get_args

    from application.analyses.protection.czas_wylaczenia_galezi import _KRZYWE
    from application.protection_read_model import CURVE_TYPE_MAP
    from enm.models import ProtectionSetting

    adnotacja = ProtectionSetting.model_fields["curve_type"].annotation
    literaly = {a for arg in get_args(adnotacja) for a in get_args(arg)}
    assert literaly == set(_KRZYWE) == set(CURVE_TYPE_MAP)
    assert "IEC_LTI" in literaly and "IEC_LI" not in literaly
    assert CURVE_TYPE_MAP["IEC_LTI"] == IEC60255CurveType.LONG_TIME_INVERSE.value
