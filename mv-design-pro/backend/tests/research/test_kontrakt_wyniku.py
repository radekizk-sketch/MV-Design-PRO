"""Kontrakt wyniku dynamicznego: tożsamość sygnału, jednostki, kompletność czasu.

PO CO TEN PLIK (pakiet B audytu). Trzy defekty kontraktu, z których każdy
pozwalał wynikowi twierdzić coś, czego nie policzył:

  B1. Tożsamością sygnału była para ``(klucz, element_ref)``. ``FalownikGFL`` ma
      STANY nazwane ``p_pu``/``q_pu``, a silnik zapisuje pod tymi samymi nazwami
      moc policzoną z wstrzyknięcia — obie serie lądowały w jednym ciągu
      NAPRZEMIENNIE. Przebieg miał podwójną długość i mieszał dwie różne
      wielkości fizyczne, a testy OZE radziły sobie braniem co drugiej próbki.
  B2. KAŻDY stan dostawał jednostkę ``"p.u./rad"`` — jeden napis dla kąta w
      radianach, prędkości w p.u. i SOC, który jest liczbą niemianowaną.
  B3. Wynik niósł ``zbiegl`` i ``czas_osiagniety_s``, ale NIE niósł czasu
      ŻĄDANEGO, więc konsument nie miał jak stwierdzić, że okno jest niedomknięte.
"""

from __future__ import annotations

import numpy as np
import pytest
from dynamic_lab.konwencje import JEDNOSTKA_NIEZNANA
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.urzadzenia import FalownikGFL
from dynamic_lab.wynik import (
    BladSolvera,
    DiagnostykaSolvera,
    KolizjaSygnaluError,
    KompletnoscPrzebiegu,
    PrzestrzenSygnalu,
    ZbieraczPrzebiegow,
)


def _wynik_z_falownikiem():
    topologia = TopologiaSieci(
        szyny=("DER", "SYS"),
        galezie=[Galaz("DER", "SYS", 0.02, 0.10)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    model = ModelDynamiczny(
        topologia=topologia, urzadzenia=[FalownikGFL(ref="D", szyna="DER", i_max_pu=1.2)]
    )
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.005)
    x0 = silnik.inicjalizuj({"D": complex(0.6, 0.0)})
    return silnik.symuluj(x0, czas_koncowy_s=0.5)


# ---------------------------------------------------------------------------
# B1 — tożsamość sygnału i wykrywanie kolizji
# ---------------------------------------------------------------------------


def test_zbieracz_wykrywa_dwukrotny_zapis_tego_samego_sygnalu() -> None:
    """Kolizja ma być BŁĘDEM, nie dopisaniem kolejnej próbki do cudzej serii."""
    zbieracz = ZbieraczPrzebiegow()
    zbieracz.rozpocznij_probke()
    zbieracz.dodaj("p_pu", 1.0, element_ref="D", przestrzen=PrzestrzenSygnalu.WYJSCIE)
    with pytest.raises(KolizjaSygnaluError, match="DWA RAZY"):
        zbieracz.dodaj("p_pu", 2.0, element_ref="D", przestrzen=PrzestrzenSygnalu.WYJSCIE)


def test_ten_sam_klucz_w_roznych_przestrzeniach_to_dwa_sygnaly() -> None:
    """Wyjście i stan o tej samej nazwie NIE kolidują — mają różną tożsamość."""
    zbieracz = ZbieraczPrzebiegow()
    for wartosc in (1.0, 2.0):
        zbieracz.rozpocznij_probke()
        zbieracz.dodaj("p_pu", wartosc, element_ref="D", przestrzen=PrzestrzenSygnalu.WYJSCIE)
        zbieracz.dodaj("p_pu", -wartosc, element_ref="D", przestrzen=PrzestrzenSygnalu.STAN)

    sygnaly = {s.klucz_pelny: s for s in zbieracz.sygnaly()}
    assert set(sygnaly) == {"output.p_pu", "state.p_pu"}
    assert sygnaly["output.p_pu"].wartosci == (1.0, 2.0)
    assert sygnaly["state.p_pu"].wartosci == (-1.0, -2.0)


def test_kazdy_przebieg_ma_dlugosc_osi_czasu() -> None:
    """Inwariant końcowy: żaden sygnał nie jest przeplotem dwóch serii."""
    wynik = _wynik_z_falownikiem()
    oczekiwana = len(wynik.czas_s)
    assert oczekiwana > 1
    for sygnal in wynik.sygnaly:
        assert len(sygnal.wartosci) == oczekiwana, (
            f"{sygnal.klucz_pelny}@{sygnal.element_ref}: " f"{len(sygnal.wartosci)} != {oczekiwana}"
        )


def test_falownik_gfl_ma_osobno_moc_wyjsciowa_i_stan() -> None:
    """Dokładnie ten przypadek, który się przeplatał: GFL ma stan `p_pu`."""
    wynik = _wynik_z_falownikiem()
    wyjscie = wynik.sygnal("p_pu", "D", PrzestrzenSygnalu.WYJSCIE)
    stan = wynik.sygnal("p_pu", "D", PrzestrzenSygnalu.STAN)
    assert wyjscie.klucz_pelny == "output.p_pu"
    assert stan.klucz_pelny == "state.p_pu"
    assert len(wyjscie.wartosci) == len(stan.wartosci) == len(wynik.czas_s)


def test_niejednoznaczny_odczyt_jest_bledem_glosnym() -> None:
    """Milczące wybranie jednej z dwóch wielkości byłoby zgadywaniem."""
    wynik = _wynik_z_falownikiem()
    with pytest.raises(KeyError, match="niejednoznaczny"):
        wynik.sygnal("p_pu", "D")


def test_jednoznaczny_odczyt_nie_wymaga_przestrzeni() -> None:
    """Strona pozytywna — klucz bez kolizji czyta się jak dawniej."""
    wynik = _wynik_z_falownikiem()
    assert wynik.sygnal("u_pu", "DER").przestrzen is PrzestrzenSygnalu.WYJSCIE


# ---------------------------------------------------------------------------
# B2 — jednostki
# ---------------------------------------------------------------------------


def test_jednostka_nie_jest_wspolnym_napisem_dla_wszystkich_stanow() -> None:
    """``"p.u./rad"`` było jedną etykietą dla kąta, prędkości i SOC naraz."""
    wynik = _wynik_z_falownikiem()
    jednostki = {s.jednostka for s in wynik.sygnaly}
    assert "p.u./rad" not in jednostki


def test_model_bez_deklaracji_jednostek_melduje_brak_zamiast_zgadywac() -> None:
    """Brak deklaracji ma być WIDOCZNY, a nie zastąpiony wspólnym napisem."""
    wynik = _wynik_z_falownikiem()
    stany = [s for s in wynik.sygnaly if s.przestrzen is PrzestrzenSygnalu.STAN]
    assert stany
    for s in stany:
        assert s.jednostka != "p.u./rad"
        assert s.jednostka in {JEDNOSTKA_NIEZNANA, "p.u.", "rad", "1", "Hz", "s"}


# ---------------------------------------------------------------------------
# B3 — kompletność czasu
# ---------------------------------------------------------------------------


def test_wynik_niesie_czas_zadany_i_osiagniety() -> None:
    wynik = _wynik_z_falownikiem()
    d = wynik.diagnostyka
    assert d.czas_zadany_s == pytest.approx(0.5)
    assert d.czas_osiagniety_s == pytest.approx(0.5)
    assert d.kompletnosc is KompletnoscPrzebiegu.PELNY
    assert d.to_dict()["czas_zadany_s"] == pytest.approx(0.5)
    assert d.to_dict()["kompletnosc"] == "pelny"


def test_przebieg_urwany_nie_moze_byc_oznaczony_jako_pelny() -> None:
    """PREDYKATY PARAMI: „pełny" i „doszedł do końca" z jednego źródła prawdy.

    0,4 s policzonych danych przy żądanych 2,0 s to NIE jest wynik dla okna 2 s.
    Bez tego inwariantu konsument widział komplet liczb i nie miał jak stwierdzić,
    że brakuje 80 % przedziału.
    """
    blad = BladSolvera(
        klasa="BrakZbieznosciSieciError",
        komunikat="test",
        faza="algebra_sieci",
        czas_s=0.4,
        krok_s=0.005,
        numer_kroku=80,
        residuum_sieci=1.0,
        stan_skonczony=True,
    )
    with pytest.raises(ValueError, match="nie wolno oznaczyć go jako PELNY"):
        DiagnostykaSolvera(
            integrator="rk4",
            krok_s=0.005,
            liczba_krokow=80,
            ewaluacje_pochodnych=320,
            maks_residuum_sieci=1.0,
            maks_iteracji_sieci=5,
            zbiegl=False,
            norma_pochodnej_w_t0=0.0,
            blad=blad,
            czas_zadany_s=2.0,
            czas_osiagniety_s=0.4,
            kompletnosc=KompletnoscPrzebiegu.PELNY,
        )


def test_przebieg_urwany_oznaczony_poprawnie_jest_dopuszczalny() -> None:
    """Strona pozytywna: urwany przebieg wolno oddać, byle był tak OZNACZONY."""
    blad = BladSolvera(
        klasa="BrakZbieznosciSieciError",
        komunikat="test",
        faza="algebra_sieci",
        czas_s=0.4,
        krok_s=0.005,
        numer_kroku=80,
        residuum_sieci=1.0,
        stan_skonczony=True,
    )
    d = DiagnostykaSolvera(
        integrator="rk4",
        krok_s=0.005,
        liczba_krokow=80,
        ewaluacje_pochodnych=320,
        maks_residuum_sieci=1.0,
        maks_iteracji_sieci=5,
        zbiegl=False,
        norma_pochodnej_w_t0=0.0,
        blad=blad,
        czas_zadany_s=2.0,
        czas_osiagniety_s=0.4,
        kompletnosc=KompletnoscPrzebiegu.PRZERWANY_BLEDEM,
    )
    assert d.kompletnosc is KompletnoscPrzebiegu.PRZERWANY_BLEDEM
    assert d.czas_osiagniety_s < d.czas_zadany_s
    assert np.isfinite(d.czas_zadany_s)
