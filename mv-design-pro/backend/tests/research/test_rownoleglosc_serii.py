"""Kontrakt wyniku wymusza JEDNĄ próbkę na sygnał na każdą chwilę osi czasu (§14).

PO CO. Przebieg o innej długości niż oś czasu nie jest „trochę niekompletny" —
jest NIEINTERPRETOWALNY, a mimo to rysuje się i liczy statystyki. Laboratorium
miało dokładnie taki defekt (przeplot wyjścia i stanu ``p_pu`` falownika: seria
dwa razy dłuższa od osi czasu), a testy radziły sobie braniem co drugiej
próbki — czyli utrwalały go zamiast pokazać.

Kolizję łapie dziś `ZbieraczPrzebiegow`, ale `WynikDynamiczny` da się zbudować z
DOWOLNEGO źródła (import, konwersja, test), więc kontrakt nie może opierać się na
tym, że producent danych się nie pomylił.
"""

from __future__ import annotations

import numpy as np
import pytest
from dynamic_lab.regulatory import RegulatorNapiecia, RegulatorTurbiny
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.urzadzenia import FalownikGFL, MaszynaSynchroniczna4Rzedu, ZespolSynchroniczny
from dynamic_lab.wynik import (
    KONTRAKT,
    DiagnostykaSolvera,
    KolizjaSygnaluError,
    NiemonotonicznaOsCzasuError,
    NiezgodnaDlugoscPrzebieguError,
    PrzestrzenSygnalu,
    Sygnal,
    WynikDynamiczny,
)
from dynamic_lab.zdarzenia import HarmonogramZdarzen, ZdjecieZwarcia, ZwarcieTrojfazowe


def _diagnostyka(liczba_krokow: int = 2) -> DiagnostykaSolvera:
    return DiagnostykaSolvera(
        integrator="rk4",
        krok_s=0.01,
        liczba_krokow=liczba_krokow,
        ewaluacje_pochodnych=8,
        maks_residuum_sieci=0.0,
        maks_iteracji_sieci=1,
        zbiegl=True,
        norma_pochodnej_w_t0=0.0,
        czas_zadany_s=0.02,
        czas_osiagniety_s=0.02,
        kroki_scisle_zbiezne=liczba_krokow,
    )


def _wynik(czas, sygnaly) -> WynikDynamiczny:
    return WynikDynamiczny(
        kontrakt=KONTRAKT,
        czas_s=tuple(czas),
        sygnaly=tuple(sygnaly),
        modele=(),
        zdarzenia=(),
        diagnostyka=_diagnostyka(),
        odcisk_scenariusza="a" * 64,
        odcisk_topologii="b" * 64,
    )


def _sygnal(klucz: str, wartosci, przestrzen=PrzestrzenSygnalu.WYJSCIE, ref="D") -> Sygnal:
    return Sygnal(
        klucz=klucz,
        etykieta_pl=klucz,
        jednostka="p.u.",
        element_ref=ref,
        wartosci=tuple(wartosci),
        przestrzen=przestrzen,
    )


def test_seria_dluzsza_od_osi_czasu_jest_odrzucona() -> None:
    """Dokładnie ten kształt miał defekt przeplotu: 2n próbek przy n chwilach."""
    with pytest.raises(NiezgodnaDlugoscPrzebieguError, match="6 próbek przy osi czasu o 3"):
        _wynik([0.0, 0.01, 0.02], [_sygnal("p_pu", [1, 2, 3, 4, 5, 6])])


def test_seria_krotsza_od_osi_czasu_jest_odrzucona() -> None:
    with pytest.raises(NiezgodnaDlugoscPrzebieguError):
        _wynik([0.0, 0.01, 0.02], [_sygnal("p_pu", [1, 2])])


def test_seria_zgodna_przechodzi() -> None:
    w = _wynik([0.0, 0.01, 0.02], [_sygnal("p_pu", [1, 2, 3])])
    assert len(w.sygnal("p_pu", "D").wartosci) == len(w.czas_s)


def test_pusta_os_czasu_wymaga_pustych_serii() -> None:
    """Bieg, który nie zapisał ani jednej próbki, nie może nieść wartości."""
    assert _wynik([], [_sygnal("p_pu", [])]).czas_s == ()
    with pytest.raises(NiezgodnaDlugoscPrzebieguError):
        _wynik([], [_sygnal("p_pu", [1.0])])


@pytest.mark.parametrize("czas", ([0.0, 0.0], [0.0, 0.02, 0.01], [0.01, 0.0]))
def test_os_czasu_musi_rosnac_sciśle(czas) -> None:
    """Chwila powtórzona albo cofnięta daje dwie wartości tej samej wielkości w t."""
    with pytest.raises(NiemonotonicznaOsCzasuError):
        _wynik(czas, [_sygnal("p_pu", [0.0] * len(czas))])


def test_dwa_sygnaly_o_tej_samej_tozsamosci_sa_odrzucone() -> None:
    """(przestrzeń, klucz, element) musi być jednoznaczne — inaczej `sygnal()` zgaduje."""
    with pytest.raises(KolizjaSygnaluError):
        _wynik(
            [0.0, 0.01],
            [_sygnal("p_pu", [1, 2]), _sygnal("p_pu", [3, 4])],
        )


def test_ten_sam_klucz_w_dwoch_przestrzeniach_jest_dozwolony() -> None:
    """Wyjście i stan ``p_pu`` to DWIE wielkości — rozróżnia je przestrzeń, nie nazwa."""
    w = _wynik(
        [0.0, 0.01],
        [
            _sygnal("p_pu", [1, 2], PrzestrzenSygnalu.WYJSCIE),
            _sygnal("p_pu", [3, 4], PrzestrzenSygnalu.STAN),
        ],
    )
    assert w.sygnal("p_pu", "D", PrzestrzenSygnalu.STAN).wartosci == (3.0, 4.0)
    with pytest.raises(KeyError, match="niejednoznaczny"):
        w.sygnal("p_pu", "D")


def test_bieg_silnika_spelnia_rownoleglosc_serii() -> None:
    """Własność sprawdzona na REALNYM biegu, nie tylko na ręcznie złożonym wyniku.

    Iloczyn cech: urządzenie ze stanami kolidującymi nazwą z kluczami wyjścia
    (`FalownikGFL` ma stany ``p_pu``/``q_pu``) × zespół z regulatorami ×
    przerzedzone próbkowanie × zdarzenia skracające krok.
    """
    topologia = TopologiaSieci(
        szyny=("GEN", "MID", "SYS"),
        galezie=[Galaz("GEN", "MID", 0.01, 0.08), Galaz("MID", "SYS", 0.01, 0.05)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    model = ModelDynamiczny(
        topologia=topologia,
        urzadzenia=[
            ZespolSynchroniczny(
                maszyna=MaszynaSynchroniczna4Rzedu(ref="G1", szyna="GEN", h_s=4.0, d_tlumienie=1.0),
                avr=RegulatorNapiecia(),
                governor=RegulatorTurbiny(),
            ),
            FalownikGFL(ref="D", szyna="MID", s_zn_pu=0.5),
        ],
    )
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.002, probkowanie_co=7)
    x0 = silnik.inicjalizuj({"G1": complex(0.6, 0.2), "D": complex(0.3, 0.05)})
    wynik = silnik.symuluj(
        x0,
        czas_koncowy_s=1.0,
        harmonogram=HarmonogramZdarzen(
            [ZwarcieTrojfazowe(0.203, "MID", x_f_pu=0.05), ZdjecieZwarcia(0.317, "MID")]
        ),
    )
    n = len(wynik.czas_s)
    assert n > 0
    for s in wynik.sygnaly:
        assert len(s.wartosci) == n, f"{s.klucz_pelny}@{s.element_ref}"
    assert np.all(np.diff(np.array(wynik.czas_s)) > 0.0)
