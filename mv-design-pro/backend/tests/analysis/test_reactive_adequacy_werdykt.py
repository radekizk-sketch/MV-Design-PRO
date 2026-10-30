"""Rekord werdyktu wyjaśnialnego adekwatności mocy biernej (karta WERDYKT-MIGRACJA-190, domena 6).

Iloczyn cech, w którym defekt mógłby się schować:
- rezerwa źródła: kierunek {w górę, w dół} × położenie {powyżej ε, równa ε, poniżej ε, zero}
  — nasycenie ⇔ rekord kierunku ``NIE_SPELNIA`` (predykat wejścia i wyjścia z JEDNEGO rekordu);
- dane źródła {komplet, brak Q_akt, brak Q_min, brak Q_max, granice niespójne, bieg
  niezbieżny} × napięcie węzła {w paśmie, poza pasmem} — naruszenie udowodnione rozstrzyga,
  brak danych bez naruszenia nigdy nie jest „wystarczająca”;
- napięcie węzła {w paśmie, równe U_max, powyżej U_max, równe U_min, poniżej U_min,
  nierozwiązany} × pasmo {własne węzła, domyślne} — naruszenie ⇔ rekord ``NIE_SPELNIA``,
  podstawa pasma zależna od jego źródła;
- jakość granic regulatora {karta producenta, oszacowana, domyślna systemowa, brak} — dane
  przyjęte i kompletność dowodu;
- zbiór źródeł {pusty, niepusty} × napięcie {w paśmie, poza pasmem};
- niezmienniki projekcji (``verdict``/``is_adequate`` ↔ rozstrzygnięcie rekordu W),
  wyjasnienie z rekordu, determinizm ładunku.
"""

from __future__ import annotations

import json

import pytest
from analysis.reactive_adequacy import (
    VERDICT_ADEQUATE,
    VERDICT_EXHAUSTED,
    VERDICT_NO_DATA,
    BusVoltageInput,
    ReactiveAdequacyBuilder,
    ReactiveAdequacyView,
    SourceReactiveInput,
)
from analysis.reactive_adequacy.oceny import PODSTAWA_PASMA_DOMYSLNEGO, PODSTAWA_PASMA_WEZLA
from solver_input.provenance import FieldQuality
from werdykt.porownanie import rozstrzygniecie

# ε dokładnie reprezentowalne binarnie — równość rezerwy z ε jest równością, nie zaokrągleniem.
_EPS = 0.25
_NAZWY = {"B": "Szyna SN stacji", "S": "Falownik farmy", "T": "Falownik drugi"}
_PROJEKCJA = {
    "SPELNIA": (VERDICT_ADEQUATE, True),
    "NIE_SPELNIA": (VERDICT_EXHAUSTED, False),
    None: (VERDICT_NO_DATA, False),
}


def _builder() -> ReactiveAdequacyBuilder:
    return ReactiveAdequacyBuilder(saturation_tol_mvar=_EPS)


def _niezmienniki(widok: ReactiveAdequacyView) -> None:
    rozstrz = rozstrzygniecie(widok.wymaganie.oceny_skladowe)
    assert (widok.verdict, widok.is_adequate) == _PROJEKCJA[rozstrz]
    assert widok.wyjasnienie == widok.wymaganie.wyjasnienie
    for zrodlo in widok.sources:
        nasycone = {
            "Q_max": zrodlo.ocena_rezerwy_gora.status_maszynowy == "NIE_SPELNIA",
            "Q_min": zrodlo.ocena_rezerwy_dol.status_maszynowy == "NIE_SPELNIA",
        }
        assert zrodlo.is_saturated == any(nasycone.values())
        if zrodlo.is_saturated:
            assert nasycone[zrodlo.at_limit_pl]
    naruszone = {
        o.przedmiot.element_ref
        for o in widok.wymaganie.oceny_skladowe
        if o.kryterium_id.startswith("adekwatnosc_q.pasmo_napiecia")
        and o.status_maszynowy == "NIE_SPELNIA"
    }
    assert {v.bus_ref for v in widok.voltage_violations} == naruszone
    for v in widok.voltage_violations:
        assert v.ocena.status_maszynowy == "NIE_SPELNIA"


# Rezerwa w danym kierunku przy Q_min = −1, Q_max = 1: Q_akt dobrane tak, by ΔQ = wartość.
_POLOZENIA = [
    (1.0, False),  # powyżej ε
    (_EPS, False),  # równa ε — relacja ≥ spełniona, źródło nienasycone
    (_EPS / 2, True),  # poniżej ε
    (0.0, True),  # dokładnie na granicy
]


@pytest.mark.parametrize("kierunek", ["gora", "dol"])
@pytest.mark.parametrize("rezerwa,nasycone", _POLOZENIA)
def test_rezerwa_kierunku_i_nasycenie(kierunek: str, rezerwa: float, nasycone: bool) -> None:
    q_akt = 1.0 - rezerwa if kierunek == "gora" else -1.0 + rezerwa
    widok = _builder().build(
        [BusVoltageInput("B", 1.0, 0.95, 1.05)],
        [SourceReactiveInput("S", "B", q_actual_mvar=q_akt, q_min_mvar=-1.0, q_max_mvar=1.0)],
        nazwy=_NAZWY,
    )
    _niezmienniki(widok)
    zrodlo = widok.sources[0]
    assert zrodlo.is_saturated is nasycone
    if nasycone:
        assert zrodlo.at_limit_pl == ("Q_max" if kierunek == "gora" else "Q_min")
        assert widok.verdict == VERDICT_EXHAUSTED
    else:
        assert widok.verdict == VERDICT_ADEQUATE


_DANE_ZRODLA = {
    "komplet": ({"q_actual_mvar": 0.0, "q_min_mvar": -1.0, "q_max_mvar": 1.0}, True),
    "brak_q_akt": ({"q_actual_mvar": None, "q_min_mvar": -1.0, "q_max_mvar": 1.0}, True),
    "brak_q_min": ({"q_actual_mvar": 0.0, "q_min_mvar": None, "q_max_mvar": 1.0}, True),
    "brak_q_max": ({"q_actual_mvar": 0.0, "q_min_mvar": -1.0, "q_max_mvar": None}, True),
    "niespojne": ({"q_actual_mvar": 0.0, "q_min_mvar": 1.0, "q_max_mvar": -1.0}, True),
    "niezbiezny": ({"q_actual_mvar": 0.0, "q_min_mvar": -1.0, "q_max_mvar": 1.0}, False),
}


@pytest.mark.parametrize("v_pu", [1.0, 1.08], ids=["w_pasmie", "poza_pasmem"])
@pytest.mark.parametrize("dane", list(_DANE_ZRODLA))
def test_dane_zrodla_x_napiecie(dane: str, v_pu: float) -> None:
    pola, zbiezny = _DANE_ZRODLA[dane]
    widok = _builder().build(
        [BusVoltageInput("B", v_pu, 0.95, 1.05)],
        [SourceReactiveInput("S", "B", **pola)],
        nazwy=_NAZWY,
        power_flow_converged=zbiezny,
    )
    _niezmienniki(widok)
    zrodlo = widok.sources[0]
    if dane == "komplet":
        oczekiwany = VERDICT_ADEQUATE if v_pu == 1.0 else VERDICT_EXHAUSTED
    elif dane == "niezbiezny":
        # Bieg niezbieżny: ani rezerwy, ani napięcia nie są oceniane — naruszenie na
        # niewiarygodnym napięciu nie jest dowodem.
        oczekiwany = VERDICT_NO_DATA
        assert widok.voltage_violations == ()
    else:
        # Udowodnione naruszenie pasma rozstrzyga mimo braku danych źródła; bez naruszenia
        # brak danych źródła daje „dane niekompletne”, nigdy „wystarczająca”.
        oczekiwany = VERDICT_NO_DATA if v_pu == 1.0 else VERDICT_EXHAUSTED
        assert zrodlo.ocena_rezerwy_gora.status_maszynowy == "NIE_OCENIONO"
        assert zrodlo.ocena_rezerwy_dol.status_maszynowy == "NIE_OCENIONO"
        assert zrodlo.is_saturated is False
    assert widok.verdict == oczekiwany
    # Tekst dla inżyniera bez kodów pól i bez identyfikatorów.
    for kod in (*zrodlo.missing_data, *widok.missing_data):
        assert kod not in zrodlo.why_pl
        assert kod not in widok.why_pl
    assert "S" not in widok.why_pl.split()


_NAPIECIA = [
    (1.0, False),
    (1.05, False),
    (1.06, True),
    (0.95, False),
    (0.94, True),
]


@pytest.mark.parametrize("wlasne_pasmo", [True, False], ids=["pasmo_wezla", "pasmo_domyslne"])
@pytest.mark.parametrize("v_pu,naruszenie", _NAPIECIA)
def test_pasmo_napiecia(v_pu: float, naruszenie: bool, wlasne_pasmo: bool) -> None:
    bus = (
        BusVoltageInput("B", v_pu, 0.95, 1.05)
        if wlasne_pasmo
        else BusVoltageInput("B", v_pu)  # domyślne pasmo programu ±5 % Un
    )
    widok = _builder().build(
        [bus, BusVoltageInput("X", None)],
        [SourceReactiveInput("S", "B", q_actual_mvar=0.0, q_min_mvar=-1.0, q_max_mvar=1.0)],
        nazwy=_NAZWY,
    )
    _niezmienniki(widok)
    oceny_pasma = [
        o
        for o in widok.wymaganie.oceny_skladowe
        if o.kryterium_id.startswith("adekwatnosc_q.pasmo_napiecia")
    ]
    # Węzeł nierozwiązany jest poza oceną pasma (wykluczenie zakresu), nie „w paśmie”.
    assert [o.przedmiot.element_ref for o in oceny_pasma] == ["B"]
    assert oceny_pasma[0].podstawa == (
        PODSTAWA_PASMA_WEZLA if wlasne_pasmo else PODSTAWA_PASMA_DOMYSLNEGO
    )
    assert (len(widok.voltage_violations) == 1) is naruszenie
    assert widok.verdict == (VERDICT_EXHAUSTED if naruszenie else VERDICT_ADEQUATE)


@pytest.mark.parametrize(
    "jakosc",
    [FieldQuality.DATASHEET, FieldQuality.ESTIMATED, FieldQuality.SYSTEM_DEFAULT, None],
    ids=["karta", "oszacowana", "domyslna", "brak"],
)
def test_jakosc_granic_dane_przyjete(jakosc: FieldQuality | None) -> None:
    widok = _builder().build(
        [BusVoltageInput("B", 1.0, 0.95, 1.05)],
        [
            SourceReactiveInput(
                "S",
                "B",
                q_actual_mvar=0.0,
                q_min_mvar=-1.0,
                q_max_mvar=1.0,
                limits_field_quality=jakosc,
            )
        ],
        nazwy=_NAZWY,
    )
    _niezmienniki(widok)
    zrodlo = widok.sources[0]
    dane_gora = zrodlo.ocena_rezerwy_gora.dowod.status_danych.dane_przyjete
    dane_dol = zrodlo.ocena_rezerwy_dol.dowod.status_danych.dane_przyjete
    if jakosc in (FieldQuality.ESTIMATED, FieldQuality.SYSTEM_DEFAULT):
        assert [d.wartosc.wartosc for d in dane_gora] == [1.0]
        assert [d.wartosc.wartosc for d in dane_dol] == [-1.0]
        assert all(d.jakosc == jakosc for d in (*dane_gora, *dane_dol))
        assert zrodlo.ocena_rezerwy_gora.kompletnosc_dowodu == "NIEPELNY"
        # Wartość robocza nie zmienia rozstrzygnięcia liczbowego (zasada nr 4).
        assert widok.verdict == VERDICT_ADEQUATE
    else:
        assert dane_gora == () and dane_dol == ()


@pytest.mark.parametrize("v_pu", [1.0, 1.08], ids=["w_pasmie", "poza_pasmem"])
def test_brak_zrodla(v_pu: float) -> None:
    widok = _builder().build([BusVoltageInput("B", v_pu, 0.95, 1.05)], [], nazwy=_NAZWY)
    _niezmienniki(widok)
    statusy = {o.kryterium_id: o.status_maszynowy for o in widok.wymaganie.oceny_skladowe}
    assert statusy["adekwatnosc_q.rezerwa_systemu"] == "NIE_OCENIONO"
    assert widok.verdict == (VERDICT_NO_DATA if v_pu == 1.0 else VERDICT_EXHAUSTED)
    assert "controllable_sources" not in widok.why_pl


def test_brak_napiec_i_zrodel() -> None:
    widok = _builder().build([BusVoltageInput("B", None)], [], nazwy=_NAZWY)
    _niezmienniki(widok)
    assert widok.verdict == VERDICT_NO_DATA
    assert all(o.status_maszynowy == "NIE_OCENIONO" for o in widok.wymaganie.oceny_skladowe)


def test_tolerancja_musi_byc_dodatnia() -> None:
    # ε = 0 nie wykrywa źródła DOKŁADNIE na granicy (0 ≥ 0 spełnia relację rekordu).
    with pytest.raises(ValueError):
        ReactiveAdequacyBuilder(saturation_tol_mvar=0.0)


def test_ladunek_deterministyczny_z_rekordami() -> None:
    bus = [BusVoltageInput("B", 1.06, 0.95, 1.05)]
    zrodla = [
        SourceReactiveInput("T", "B", q_actual_mvar=1.0, q_min_mvar=-1.0, q_max_mvar=1.0),
        SourceReactiveInput("S", "B", q_actual_mvar=0.0, q_min_mvar=-1.0, q_max_mvar=1.0),
    ]
    a = json.dumps(_builder().build(bus, zrodla, nazwy=_NAZWY).to_dict(), sort_keys=True)
    b = json.dumps(
        _builder().build(bus, list(reversed(zrodla)), nazwy=_NAZWY).to_dict(), sort_keys=True
    )
    assert a == b
    ladunek = json.loads(a)
    assert ladunek["wyjasnienie"] == ladunek["wymaganie"]["wyjasnienie"]
    assert ladunek["voltage_violations"][0]["ocena"]["status_maszynowy"] == "NIE_SPELNIA"
