"""Tozsamosc biegu: piec odciskow, determinizm, wrazliwosc na kazde wejscie."""

from __future__ import annotations

import pathlib

import numpy as np
import pytest
from network_model.solvers.dynamika import (
    HarmonogramDynamiki,
    SilnikDynamiki,
    SkokObciazenia,
    ZwarcieWezla,
    zbuduj_tozsamosc,
    zloz_model_sieci,
)
from network_model.solvers.dynamika.tozsamosc import (
    CYFRY_KWANTYZACJI,
    WERSJA_SOLVERA,
    kwantyzuj,
    odcisk_harmonogramu,
    odcisk_implementacji,
    odcisk_nastaw,
    skrot_kanoniczny,
)

from tests.network_model.dynamika.uklady import (
    X_ZWARCIA_PLYTKIEGO_OHM,
    nastawy,
    zbuduj_smib,
    zbuduj_smib_z_odbiorem,
)

HARMONOGRAM = HarmonogramDynamiki(
    (
        ZwarcieWezla(
            t_s=0.1,
            wezel="GEN",
            typ="3F",
            r_f_ohm=0.0,
            x_f_ohm=X_ZWARCIA_PLYTKIEGO_OHM,
            t_usuniecia_s=0.2,
        ),
    )
)


def _tozsamosc(uklad, harmonogram=HARMONOGRAM, **zmiany):
    wejscie = uklad.wejscie(harmonogram, nastawy(**zmiany))
    model = zloz_model_sieci(uklad.wezly, uklad.galezie, ())
    return zbuduj_tozsamosc(wejscie, model, (uklad.maszyna, uklad.szyna))


def test_kwantyzacja_do_dziewieciu_cyfr_i_bez_ujemnego_zera() -> None:
    assert CYFRY_KWANTYZACJI == 9
    assert kwantyzuj(1.2345678901234) == 1.23456789
    assert kwantyzuj(-0.0) == 0.0
    assert np.copysign(1.0, kwantyzuj(-0.0)) == 1.0


def test_skrot_kanoniczny_jest_niezalezny_od_kolejnosci_kluczy() -> None:
    assert skrot_kanoniczny({"a": 1, "b": 2}) == skrot_kanoniczny({"b": 2, "a": 1})
    assert skrot_kanoniczny([1, 2]) != skrot_kanoniczny([2, 1])


def test_bieg_jest_deterministyczny_dla_dwoch_ROZNYCH_obiektow_silnika() -> None:
    """Zero zaleznosci od historii obiektu: nowy obiekt per bieg daje ten sam wynik."""
    uklad = zbuduj_smib()
    wejscie = uklad.wejscie(HARMONOGRAM, nastawy(dt_s=0.002, horyzont_s=0.5, krok_wyjscia_s=0.01))
    pierwszy = SilnikDynamiki(wejscie).uruchom()
    drugi = SilnikDynamiki(wejscie).uruchom()
    assert pierwszy.tozsamosc == drugi.tozsamosc
    assert pierwszy.os_czasu_s == drugi.os_czasu_s
    for klucz, szereg in pierwszy.probki.items():
        assert szereg == drugi.probki[klucz], f"kanal {klucz} nie jest deterministyczny"


def test_ten_sam_obiekt_uruchomiony_dwa_razy_daje_ten_sam_wynik() -> None:
    """Silnik nie kumuluje stanu miedzy wywolaniami (`uruchom` jest czysta funkcja)."""
    uklad = zbuduj_smib()
    silnik = SilnikDynamiki(
        uklad.wejscie(HARMONOGRAM, nastawy(dt_s=0.002, horyzont_s=0.5, krok_wyjscia_s=0.01))
    )
    pierwszy = silnik.uruchom()
    drugi = silnik.uruchom()
    assert pierwszy.probki == drugi.probki
    assert pierwszy.zdarzenia_wykonane == drugi.zdarzenia_wykonane


def test_odcisk_nastaw_reaguje_na_kazda_nastawe() -> None:
    """Kazda nastawa wplywa na przebieg, wiec KAZDA musi zmieniac odcisk."""
    podstawa = nastawy()
    zmiany = {
        "dt_s": 0.002,
        "tolerancja_kroku": 1e-5,
        "eps_init": 1e-7,
        "horyzont_s": 2.0,
        "krok_wyjscia_s": 0.02,
        "integrator": "rk4_jawny",
    }
    odcisk_podstawy = odcisk_nastaw(podstawa)
    for pole, wartosc in zmiany.items():
        zmienione = nastawy(**{pole: wartosc})  # type: ignore[arg-type]
        assert odcisk_nastaw(zmienione) != odcisk_podstawy, f"odcisk nie reaguje na {pole}"


def test_odcisk_harmonogramu_zalezy_od_KOLEJNOSCI_ZAPISU() -> None:
    """Kolejnosc zapisu jest czescia tresci — remis czasowy rozstrzyga indeks."""
    pierwsze = SkokObciazenia(t_s=0.1, odbior="ODB1", delta_p_pu=0.1, delta_q_pu=0.0)
    drugie = SkokObciazenia(t_s=0.1, odbior="ODB1", delta_p_pu=-0.1, delta_q_pu=0.0)
    assert odcisk_harmonogramu(HarmonogramDynamiki((pierwsze, drugie))) != odcisk_harmonogramu(
        HarmonogramDynamiki((drugie, pierwsze))
    )


def test_odcisk_migawki_reaguje_na_zmiane_sieci() -> None:
    bez_odbioru = _tozsamosc(zbuduj_smib())
    z_odbiorem = _tozsamosc(zbuduj_smib_z_odbiorem(), harmonogram=HarmonogramDynamiki(()))
    assert bez_odbioru.odcisk_migawki != z_odbiorem.odcisk_migawki


def test_odcisk_punktu_pracy_reaguje_na_inny_punkt() -> None:
    podstawa = zbuduj_smib()
    inny = zbuduj_smib_z_odbiorem(p_odbioru_pu=0.35)
    assert (
        _tozsamosc(podstawa).odcisk_punktu_pracy
        != _tozsamosc(inny, harmonogram=HarmonogramDynamiki(())).odcisk_punktu_pracy
    )


def test_odcisk_implementacji_jest_skrotem_zrodel_pakietu() -> None:
    """Odcisk implementacji jest STABILNY w obrebie drzewa i niezalezny od biegu."""
    assert odcisk_implementacji() == odcisk_implementacji()
    assert len(odcisk_implementacji()) == 64


def test_wersja_solvera_zgadza_sie_z_rejestrem_rodzajow_biegu() -> None:
    """Etykieta wersji rdzenia jest TA SAMA, ktora rejestr biegow przypisuje
    `dynamika_rms` jako podstawe normatywna.

    Rdzen nie moze importowac warstwy API (granica pakietu), wiec zgodnosc jest
    sprawdzana po ZRODLE rejestru — inaczej wynik i rejestr moglyby opisywac dwa
    rozne solvery i nikt by tego nie zobaczyl.
    """
    import api.v125_contracts as rejestr  # noqa: PLC0415

    zrodlo = pathlib.Path(rejestr.__file__).read_text(encoding="utf-8")
    assert WERSJA_SOLVERA == "DYNAMIKA_RMS_DAE_V1"
    assert f'"dynamika_rms": "{WERSJA_SOLVERA}"' in zrodlo


def test_piatka_odciskow_jest_kompletna() -> None:
    tozsamosc = _tozsamosc(zbuduj_smib())
    wartosci = [
        tozsamosc.odcisk_migawki,
        tozsamosc.odcisk_punktu_pracy,
        tozsamosc.odcisk_nastaw_solvera,
        tozsamosc.odcisk_harmonogramu,
        tozsamosc.odcisk_implementacji,
    ]
    assert all(len(odcisk) == 64 for odcisk in wartosci)
    assert len(set(wartosci)) == 5
    assert tozsamosc.wersja_solvera == WERSJA_SOLVERA


def test_zmiana_nastaw_zmienia_tozsamosc_biegu_i_wynik() -> None:
    uklad = zbuduj_smib()
    wolniej = SilnikDynamiki(
        uklad.wejscie(HARMONOGRAM, nastawy(dt_s=0.004, horyzont_s=0.5, krok_wyjscia_s=0.02))
    ).uruchom()
    szybciej = SilnikDynamiki(
        uklad.wejscie(HARMONOGRAM, nastawy(dt_s=0.001, horyzont_s=0.5, krok_wyjscia_s=0.02))
    ).uruchom()
    assert wolniej.tozsamosc.odcisk_nastaw_solvera != szybciej.tozsamosc.odcisk_nastaw_solvera
    assert wolniej.tozsamosc.odcisk_migawki == szybciej.tozsamosc.odcisk_migawki
    assert wolniej.probki["delta_rad@G1"] != szybciej.probki["delta_rad@G1"]
    assert wolniej.probki["delta_rad@G1"][-1] == pytest.approx(
        szybciej.probki["delta_rad@G1"][-1], abs=1e-4
    )
