"""Poziom 4: zgodność laboratorium z NIEZALEŻNYM narzędziem (ANDES).

KOD BADAWCZY — patrz `backend/research/README.md`.

Te testy są bramkowane ``importorskip("andes")``, bo ANDES nie jest zależnością
repozytorium. Trzeba to nazwać wprost, bo jest to DOKŁADNIE ten wzorzec, który
audyt wytknął testom porównawczym z pandapower: pliki istnieją, opisane są jako
„formalny dowód poprawności", i nigdy się nie wykonują (pandapower nie jest
zainstalowany, nie ma go w ``pyproject.toml`` ani w żadnym workflow CI).

Uczciwa konsekwencja, świadomie tu zapisana:
  - dopóki ANDES nie jest zależnością deweloperską wpiętą w CI, ten plik jest
    NARZĘDZIEM BADAWCZYM, nie obowiązującą bramką;
  - „testy przechodzą" nic tu nie znaczy, jeśli zostały pominięte;
  - rekomendacja (uczynić ANDES zależnością dev i uruchamiać ten poziom w CI)
    jest pozycją decyzyjną, nie decyzją tego kodu.
"""

from __future__ import annotations

import math

import pytest

andes = pytest.importorskip("andes", reason="ANDES nie jest zależnością repozytorium")

from dynamic_lab.konwencje import F_BAZOWA_HZ  # noqa: E402
from dynamic_lab.wzorzec_zewnetrzny import (  # noqa: E402
    BrakWzorcaError,
    NiezgodnaBazaCzestotliwosciError,
    PrzypadekSMIB,
    _sprawdz_baze_czestotliwosci,
    _zbuduj_andes,
    czy_wzorzec_dostepny,
    porownaj_z_wzorcem,
    wynik_analityczny,
    wynik_laboratorium,
    wynik_wzorca,
    zaleznosc_od_amplitudy,
)

# Tolerancje NIE są dobrane pod wynik — każda ma uzasadnienie:
TOL_PUNKT_PRACY = 1.0e-6
"""Punkt pracy jest rozwiązaniem tych samych równań algebraicznych w obu
narzędziach; różnica może pochodzić tylko z tolerancji ich solverów (~1e-8)."""

TOL_CZESTOTLIWOSC_LAB = 1.0e-4
"""Laboratorium mierzy częstotliwość z trajektorii (kwantyzacja przejść przez
zero), wzorzec liczy ją z wartości własnej. 1e-4 to zapas nad zmierzonym 6e-6."""

TOL_CZESTOTLIWOSC_WZORU = 1.0e-6
"""Wzór analityczny i wartość własna liczą TO SAMO pytanie w tej samej granicy —
tu nie ma miejsca na różnicę większą niż numeryczna."""


@pytest.fixture(scope="module")
def porownanie_bazowe():
    return porownaj_z_wzorcem()


def test_wzorzec_jest_dostepny_skoro_test_sie_wykonuje():
    """Sanity: jeśli test NIE został pominięty, wzorzec musi być realnie dostępny."""
    assert czy_wzorzec_dostepny() is True


# ---------------------------------------------------------------------------
# Zgodność punktu pracy i dynamiki
# ---------------------------------------------------------------------------


def test_punkt_pracy_zgodny_z_wzorcem(porownanie_bazowe):
    """``delta0`` i ``E'`` z inicjalizacji laboratorium = wynik ANDES."""
    assert porownanie_bazowe.blad_delta0 < TOL_PUNKT_PRACY
    assert porownanie_bazowe.blad_e_prim < TOL_PUNKT_PRACY


def test_laboratorium_odtwarza_napiecie_wzorca(porownanie_bazowe):
    """Warstwa algebraiczna: z samej mocy zespolonej laboratorium musi trafić w V wzorca.

    To NIE jest tautologia: laboratorium dostaje tylko ``S`` i szynę sztywną,
    a ``V`` w węźle maszyny jest rozwiązaniem jego własnego układu ``Ybus V = I``.
    """
    assert porownanie_bazowe.blad_napiecia_modul < TOL_PUNKT_PRACY
    assert porownanie_bazowe.blad_napiecia_kat < TOL_PUNKT_PRACY


def test_czestotliwosc_wahan_zgodna_z_wzorcem(porownanie_bazowe):
    assert porownanie_bazowe.blad_czestotliwosci_lab < TOL_CZESTOTLIWOSC_LAB


def test_wzor_analityczny_zgodny_z_wartoscia_wlasna(porownanie_bazowe):
    """Trzecia droga: zamknięty wzór vs wartość własna cudzej linearyzacji."""
    assert porownanie_bazowe.blad_czestotliwosci_analitycznej < TOL_CZESTOTLIWOSC_WZORU


def test_wzorzec_liczy_na_tej_samej_bazie_co_laboratorium(porownanie_bazowe):
    assert porownanie_bazowe.wzorzec.baza_czestotliwosci_hz == pytest.approx(F_BAZOWA_HZ)
    assert porownanie_bazowe.laboratorium.baza_czestotliwosci_hz == pytest.approx(
        F_BAZOWA_HZ
    )


def test_raport_wymienia_zrodlo_wzorca(porownanie_bazowe):
    """Wynik porównania musi nazywać narzędzie i metodę — inaczej nie da się go obalić."""
    tekst = porownanie_bazowe.raport()
    assert "ANDES" in tekst
    assert "wartości własne" in tekst


# ---------------------------------------------------------------------------
# ILOCZYN CECH — nie jeden przypadek z karty (reguła KLASA, NIE INSTANCJA)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("h_s", [2.0, 4.0, 8.0])
@pytest.mark.parametrize("x_linii_pu", [0.05, 0.15, 0.40])
def test_zgodnosc_w_iloczynie_bezwladnosci_i_impedancji(h_s, x_linii_pu):
    """Zgodność musi zachodzić w SIATCE cech, nie w jednym punkcie.

    Bezwładność i impedancja wchodzą do ``omega_n = sqrt(omega_s*Ps/(2H))`` na
    dwa różne sposoby (``Ps`` zależy od ``X`` i od ``delta0``, które samo zależy
    od ``X``). Zgodność w jednym punkcie mogłaby być przypadkiem; zgodność w 9
    punktach o rozpiętości 4x po ``H`` i 8x po ``X`` — nie może.
    """
    przypadek = PrzypadekSMIB(h_s=h_s, x_linii_pu=x_linii_pu)
    wzorzec = wynik_wzorca(przypadek)
    lab = wynik_laboratorium(przypadek, q_gen_pu=wzorzec.q_gen_pu)
    ana = wynik_analityczny(
        przypadek, delta0_rad=wzorzec.delta0_rad, e_prim_pu=wzorzec.e_prim_pu
    )
    assert lab.delta0_rad == pytest.approx(wzorzec.delta0_rad, rel=TOL_PUNKT_PRACY)
    assert lab.e_prim_pu == pytest.approx(wzorzec.e_prim_pu, rel=TOL_PUNKT_PRACY)
    assert lab.f_oscylacji_hz == pytest.approx(
        wzorzec.f_oscylacji_hz, rel=TOL_CZESTOTLIWOSC_LAB
    )
    assert ana.f_oscylacji_hz == pytest.approx(
        wzorzec.f_oscylacji_hz, rel=TOL_CZESTOTLIWOSC_WZORU
    )


@pytest.mark.parametrize("p_gen_pu", [0.20, 0.50, 0.80])
def test_zgodnosc_w_roznych_punktach_obciazenia(p_gen_pu):
    """Zmiana obciążenia przesuwa ``delta0``, więc i moc synchronizującą.

    Gdyby laboratorium miało błąd w transformacji dq (najczęstsza pomyłka w tej
    klasie modeli), rozjechałoby się właśnie tutaj — bo ``cos(delta0)`` zmienia
    się między tymi punktami o kilkanaście procent.
    """
    przypadek = PrzypadekSMIB(p_gen_pu=p_gen_pu)
    wzorzec = wynik_wzorca(przypadek)
    lab = wynik_laboratorium(przypadek, q_gen_pu=wzorzec.q_gen_pu)
    assert lab.delta0_rad == pytest.approx(wzorzec.delta0_rad, rel=TOL_PUNKT_PRACY)
    assert lab.f_oscylacji_hz == pytest.approx(
        wzorzec.f_oscylacji_hz, rel=TOL_CZESTOTLIWOSC_LAB
    )


def test_wieksza_bezwladnosc_daje_wolniejsze_wahania_w_OBU_narzedziach():
    """Kierunek zależności fizycznej musi się zgadzać, nie tylko liczba."""
    lekka = wynik_wzorca(PrzypadekSMIB(h_s=2.0))
    ciezka = wynik_wzorca(PrzypadekSMIB(h_s=8.0))
    assert ciezka.f_oscylacji_hz < lekka.f_oscylacji_hz
    lab_lekka = wynik_laboratorium(PrzypadekSMIB(h_s=2.0), q_gen_pu=lekka.q_gen_pu)
    lab_ciezka = wynik_laboratorium(PrzypadekSMIB(h_s=8.0), q_gen_pu=ciezka.q_gen_pu)
    assert lab_ciezka.f_oscylacji_hz < lab_lekka.f_oscylacji_hz
    # H rośnie 4x => omega_n maleje 2x (omega_n ~ 1/sqrt(H)) przy zbliżonym Ps
    assert lekka.f_oscylacji_hz / ciezka.f_oscylacji_hz == pytest.approx(2.0, rel=0.02)


# ---------------------------------------------------------------------------
# PUŁAPKA BAZY CZĘSTOTLIWOŚCI — zakodowana jako warunek wykrywalny
# ---------------------------------------------------------------------------


def test_baza_60hz_jest_odrzucana_a_nie_przeskalowana():
    """Wzorzec na 60 Hz MUSI podnieść wyjątek, nie zwrócić „poprawionego" wyniku."""
    with pytest.raises(NiezgodnaBazaCzestotliwosciError) as info:
        wynik_wzorca(PrzypadekSMIB(), fn_hz=60.0)
    assert "60" in str(info.value)
    assert "fn" in str(info.value)


def test_pominiecie_bazy_dalo_by_blad_o_zmierzonej_wielkosci():
    """Ile KOSZTUJE pułapka — zmierzone, żeby nie było „pewnie drobiazg".

    Deklaracja bez testu jest fałszywą pewnością (reguła KLASA, NIE INSTANCJA
    pkt 4), więc twierdzenie z docstringa modułu — „9,5% za wysoko" — ma tu
    przypięty pomiar, a nie tylko zdanie.
    """
    ss60 = _zbuduj_andes(PrzypadekSMIB(), fn_hz=60.0)
    ss50 = _zbuduj_andes(PrzypadekSMIB(), fn_hz=50.0)

    def f_osc(ss):
        return min(
            abs(w.imag) / (2.0 * math.pi) for w in ss.EIG.mu if abs(w.imag) > 1.0e-9
        )

    stosunek = f_osc(ss60) / f_osc(ss50)
    assert stosunek == pytest.approx(math.sqrt(60.0 / 50.0), rel=1.0e-4)
    assert stosunek > 1.09  # ~9,5% — rząd wielkości, który udaje wiarygodny wynik


def test_konfiguracja_systemowa_nie_zmienia_bazy_a_parametr_urzadzenia_tak():
    """Pin pod zaskakujące zachowanie ANDES: ``ss.config.freq`` NIE działa.

    Gdyby przyszła wersja ANDES to naprawiła, ten test padnie — i dobrze:
    zmiana zachowania narzędzia wzorcowego MUSI być widoczna, a nie milcząca.
    """
    ss = _zbuduj_andes(PrzypadekSMIB(), fn_hz=50.0)
    assert float(ss.GENCLS.fn.v[0]) == pytest.approx(50.0)
    assert ss.config.freq == 60  # domyślna baza systemu pozostaje 60 Hz


def test_straznik_bazy_przepuszcza_wlasciwa_i_odrzuca_kazda_inna():
    _sprawdz_baze_czestotliwosci(F_BAZOWA_HZ)  # nie podnosi
    for zla in (60.0, 50.5, 49.9, 0.0):
        with pytest.raises(NiezgodnaBazaCzestotliwosciError):
            _sprawdz_baze_czestotliwosci(zla)


# ---------------------------------------------------------------------------
# Nieliniowość: różnica zależna od amplitudy to FIZYKA, nie błąd
# ---------------------------------------------------------------------------


def test_rozbieznosc_znika_gdy_amplituda_dazy_do_zera():
    """Wartość własna to granica amplitudy -> 0; laboratorium musi do niej zbiegać.

    Rozbieżność NIEZNIKAJĄCA przy malejącej amplitudzie oznaczałaby błąd modelu
    albo inicjalizacji — i ten test właśnie to odróżnia.
    """
    pomiary = zaleznosc_od_amplitudy()
    bledy = [blad for _, _, blad in pomiary]
    assert bledy[0] > bledy[-1] * 10.0, (
        f"Błąd przy 5° ({bledy[0]:.2e}) powinien być o rząd wielkości większy "
        f"niż przy 0,2° ({bledy[-1]:.2e}) — inaczej to nie jest nieliniowość."
    )
    assert bledy[-1] < 1.0e-4
    # monotoniczność (z zapasem na podłogę kwantyzacji pomiaru)
    for wczesniejszy, pozniejszy in zip(bledy, bledy[1:]):
        assert pozniejszy <= wczesniejszy * 1.05


# ---------------------------------------------------------------------------
# Brak wzorca = brak porównania (nigdy „zgodność")
# ---------------------------------------------------------------------------


def test_brak_wzorca_podnosi_wyjatek_zamiast_cicho_przejsc(monkeypatch):
    """Gdy narzędzia nie ma, funkcja MUSI odmówić, a nie zwrócić pusty sukces."""
    monkeypatch.setattr(
        "dynamic_lab.wzorzec_zewnetrzny.czy_wzorzec_dostepny", lambda: False
    )
    with pytest.raises(BrakWzorcaError) as info:
        wynik_wzorca()
    assert "BRAK PORÓWNANIA" in str(info.value)
