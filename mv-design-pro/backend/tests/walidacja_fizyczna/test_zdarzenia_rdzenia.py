"""Twierdzenia D-15, D-16, D-17, D-18, D-21 wobec wyroczni NIEZALEZNYCH (karta AB-1b.1, P3-P5).

* D-15 — fazory pradow galezi (modul i kat obu zaciskow) w probkach `L`/`P` chwili
  zwarcia; wyrocznie: (i) superpozycja Thevenina na kolumnie `Z` sieci zdrowej
  (`wyrocznia_fazorow`), (ii) FROZEN `ShortCircuitIEC60909Solver` dla sieci, w ktorej
  metoda zrodla zastepczego i bieg od `U = c_max` licza to samo.
* D-18 — probki obustronne: `L` = algebra sieci sprzed zdarzenia, `P` = po nim, przy tym
  samym stanie rozniczkowym; wyrocznia: algebra SMIB (`wyrocznia.UkladSMIB.macierz`).

* D-16 — obszar beznapieciowy ma `V = 0` DOKLADNIE, odbiory sa odciete, a ponowne
  zasilenie trafia w WYZSZY (fizyczny) pierwiastek odbioru stalej mocy; wyrocznia:
  postac zamknieta ukladu dwuwezlowego (`wyrocznia_zdarzen.napiecie_odbioru_stalej_mocy`).
* D-17 — predykat izolacji usuniecia zwarcia `izolacja` w stanie t+; wyrocznia:
  spojnosc grafu stanu t+ w `networkx` (`wyrocznia_zdarzen.miejsce_odizolowane`) dla
  WSZYSTKICH 16 podzbiorow otwieranych galezi pierscienia.
* D-21 — zwarcie w linii w miejscu x*L; wyrocznia: gesta algebra z JAWNYM wezlem
  wewnetrznym (`wyrocznia_pradow`), bez redukcji Krona.

Pakiety P6-P8 (twierdzenia D-12, D-13, D-14, D-20):

* D-12 — lokalizacja zdarzen warunkowych: rampa zrodla idealnego i pierwiastek trajektorii
  dyskretnej trapezu czlonu inercyjnego w postaci zamknietej (`wyrocznia_zdarzen`),
* D-13 — przypisanie stanu: ciaglosc stanow nieprzypisanych i trajektoria kata po dwoch
  skokach P_m wobec `solve_ivp` wyroczni (`wyrocznia.UkladSMIB.calkuj`),
* D-14 — zrodlo testowe: postac zamknieta profilu (`wyrocznia_zdarzen.profil_zamkniety`),
* D-20 — czesciowa utrata: rownowaznosc agregatu i przyspieszenie wyspy wobec algebry
  sieci liniowej wyroczni (`wyrocznia_pradow.rozwiaz_siec_liniowa`).
"""

from __future__ import annotations

import cmath
import itertools
import math

import pytest
from network_model.solvers.dynamika import (
    OdmowaDynamiki,
    ZmianaGalezi,
    ZwarcieWezla,
)
from network_model.solvers.dynamika.kontrakty import KOD_ZWARCIE_NIEODIZOLOWANE

from . import bramki
from .wyrocznia_fazorow import GalazZPrzekladnia, prady_zaciskow, superpozycja_thevenina
from .wyrocznia_pradow import (
    GalazPi,
    ZrodloNortona,
    polowki_linii_ze_zwarciem,
    rozwiaz_siec_liniowa,
)
from .wyrocznia_zdarzen import miejsce_odizolowane, napiecie_odbioru_stalej_mocy


# --------------------------------------------------------------------------- D-16
def test_d16_wezel_odciety_ma_zero_a_ponowne_zasilenie_trafia_w_wyzszy_pierwiastek() -> None:
    pomiary = bramki.g17_obszar_beznapieciowy()
    assert pomiary["G17_napiecie_obszaru_odcietego_pu"] == 0.0
    assert (
        pomiary["G17_blad_ponownego_zasilenia_pu"]
        <= bramki.PROGI["G17_blad_ponownego_zasilenia_pu"]
    )
    # Pierwiastek nizszy lezy daleko: bramka rozroznia oba rozwiazania, nie tylko jedno.
    assert pomiary["_odleglosc_od_pierwiastka_nizszego_pu"] > 0.1


def test_d16_wyrocznia_kwadratowa_spelnia_rownanie_obwodu() -> None:
    """Samokontrola wyroczni: oba pierwiastki spelniaja `(E - V) conj(V) = Z conj(S)`."""
    sem, z, s = cmath.rect(1.02, 0.1), complex(0.05, 0.2), complex(0.8, 0.3)
    for v in napiecie_odbioru_stalej_mocy(sem, z, s):
        assert abs((sem - v) * v.conjugate() - z * s.conjugate()) < 1e-14


# --------------------------------------------------------------------------- D-17
PIERSCIEN_GALEZIE = bramki.PIERSCIEN_GALEZIE


PODZBIORY = [
    tuple(g for g, otwarta in zip(PIERSCIEN_GALEZIE, maska, strict=True) if otwarta)
    for maska in itertools.product((False, True), repeat=4)
]


@pytest.mark.parametrize("otwarte", PODZBIORY, ids=["+".join(p) or "brak" for p in PODZBIORY])
def test_d17_predykat_izolacji_zgodny_ze_spojnoscia_grafu(otwarte: tuple[str, ...]) -> None:
    zdarzenia = (
        ZwarcieWezla(0.02, "B", "3F", 0.1, 0.1, 0.05, "izolacja"),
        *(ZmianaGalezi(0.05, galaz, False) for galaz in otwarte),
    )
    aktywne = [(g[0], g[2]) for g in PIERSCIEN_GALEZIE if g not in otwarte]
    oczekiwane = miejsce_odizolowane(("S", "A", "B", "C"), aktywne, ("S", "C"), "B")
    if oczekiwane:
        bramki.pierscien_d17(zdarzenia)
    else:
        with pytest.raises(OdmowaDynamiki) as blad:
            bramki.pierscien_d17(zdarzenia)
        assert blad.value.kod == KOD_ZWARCIE_NIEODIZOLOWANE


def test_d17_bramka_g19_bez_niezgodnosci() -> None:
    pomiary = bramki.g19_predykat_izolacji()
    assert pomiary["G19_niezgodnosc_predykatu_izolacji"] == 0.0
    assert pomiary["_przypadki_sprawdzone"] == 16


# --------------------------------------------------------------------------- D-21
@pytest.mark.parametrize("polozenie", [0.1, 0.3, 0.5, 0.85])
@pytest.mark.parametrize("admitancja_zwarcia", [1.0 / complex(0.2, 0.3), None], ids=["Rf", "metal"])
def test_d21_zwarcie_w_linii_wobec_jawnego_wezla_wewnetrznego(
    polozenie: float, admitancja_zwarcia: complex | None
) -> None:
    pomiary = bramki.zmierz_zwarcie_w_linii(polozenie, admitancja_zwarcia)
    assert pomiary["blad_napiec_wzgl"] <= bramki.PROGI["G16_blad_czwornika_wzgl"]
    assert pomiary["blad_pradu_zwarcia_wzgl"] <= bramki.PROGI["G16_blad_czwornika_wzgl"]


def test_d21_bramka_g16_czesc_linii() -> None:
    pomiary = bramki.g16_zwarcie_w_linii()
    assert pomiary["G16_blad_czwornika_wzgl"] <= bramki.PROGI["G16_blad_czwornika_wzgl"]


def test_d21_wyrocznia_rozroznia_zamiane_polowek() -> None:
    """Samokontrola wyroczni: x i 1-x daja ROZNE napiecia — test nie jest slepy na M34."""
    galaz = GalazPi("A", "B", 1.0 / complex(0.02, 0.1), 0.004)
    wyniki = []
    for x in (0.3, 0.7):
        pierwsza, druga = polowki_linii_ze_zwarciem(galaz, x, "M")
        wyniki.append(
            rozwiaz_siec_liniowa(
                ("A", "B", "M"),
                (pierwsza, druga),
                (("M", 1.0 / complex(0.2, 0.3)),),
                (ZrodloNortona("A", 1.0 + 0j, 1.0 / complex(0.0, 0.05)),),
            )["M"]
        )
    assert abs(wyniki[0] - wyniki[1]) > 1e-3
    assert math.isfinite(abs(wyniki[0]))


# --------------------------------------------------------------------------- D-15
@pytest.mark.parametrize(("wezel", "z_zwarcia"), bramki.ZWARCIA_D15)
def test_d15_fazory_pradow_galezi_wobec_superpozycji_thevenina(
    wezel: str, z_zwarcia: complex
) -> None:
    pomiary = bramki.zmierz_fazory_d15(wezel, z_zwarcia)
    assert pomiary["modul"] <= bramki.PROGI["G16_blad_modulu_pradu_galezi_wzgl"]
    assert pomiary["kat"] <= bramki.PROGI["G16_blad_kata_pradu_galezi_rad"]


def test_d15_parytet_z_zamrozonym_solverem_iec60909() -> None:
    pomiary = bramki.g16_parytet_iec60909()
    assert (
        pomiary["G16_blad_parytetu_iec60909_wzgl"]
        <= bramki.PROGI["G16_blad_parytetu_iec60909_wzgl"]
    )
    assert pomiary["G16_kierunek_niezgodny_iec60909"] == 0.0


def test_d15_wyrocznia_superpozycji_zgodna_z_siecia_zwarta_rozwiazana_wprost() -> None:
    """Samokontrola wyroczni: superpozycja Thevenina = rozwiazanie sieci ZE zwarciem.

    Dwie drogi tej samej algebry liniowej (kolumna Z sieci zdrowej kontra uklad z
    bocznikiem zwarcia) musza sie zgadzac do zaokraglen — inaczej wyrocznia bylaby
    zepsuta, a bramka G16 mierzylaby jej blad, nie rdzenia.
    """
    zrodla = (
        ZrodloNortona("S", 1.0 + 0j, 1.0 / bramki.Z_ZRODLA_D15),
        ZrodloNortona("C", 0.95 + 0.1j, 1.0 / complex(0.0, bramki.X_MASZYNY_D15_PU)),
    )
    z_f = complex(0.05, 0.1)
    wynik = superpozycja_thevenina(
        bramki.WEZLY_D15, bramki.GALEZIE_D15, bramki.ADMITANCJE_ODBIOROW_D15, zrodla, "T", z_f
    )
    from .wyrocznia_fazorow import napiecia_sieci

    wprost = napiecia_sieci(
        bramki.WEZLY_D15,
        bramki.GALEZIE_D15,
        (*bramki.ADMITANCJE_ODBIOROW_D15, ("T", 1.0 / z_f)),
        zrodla,
    )
    for wezel in bramki.WEZLY_D15:
        assert abs(wynik.napiecia_po[wezel] - wprost[wezel]) < 1e-12
    for galaz in bramki.GALEZIE_D15:
        i_od, i_do = prady_zaciskow(galaz, wprost)
        assert abs(wynik.prady_po[galaz.ident][0] - i_od) < 1e-12
        assert abs(wynik.prady_po[galaz.ident][1] - i_do) < 1e-12


def test_d15_wyrocznia_rozroznia_strone_przekladni_i_sprzezenie() -> None:
    """Samokontrola: przekladnia po zlej stronie i sprzezony kat daja INNE prady."""
    galaz = GalazZPrzekladnia("T", "A", "B", 1.0 / complex(0.01, 0.1), 0.0, cmath.rect(1.05, -0.5))
    odwrocona = GalazZPrzekladnia(
        "T", "B", "A", 1.0 / complex(0.01, 0.1), 0.0, cmath.rect(1.05, -0.5)
    )
    napiecia = {"A": 1.0 + 0j, "B": cmath.rect(0.97, -0.6)}
    i_od, _ = prady_zaciskow(galaz, napiecia)
    _, i_do_odwrocony = prady_zaciskow(odwrocona, napiecia)
    assert abs(i_od - i_do_odwrocony) > 1e-3
    assert abs(cmath.phase(i_od) - cmath.phase(i_od.conjugate())) > 1e-3


# --------------------------------------------------------------------------- D-18
def test_d18_probki_obustronne_wobec_algebry_smib() -> None:
    pomiary = bramki.g20_probki_obustronne()
    for klucz in (
        "G20_blad_algebry_probek_L_P_wzgl",
        "G20_skok_stanu_rozniczkowego_rad",
        "G20_naruszenia_osi_i_czestotliwosci",
    ):
        assert pomiary[klucz] <= bramki.PROGI[klucz], (klucz, pomiary)


# --------------------------------------------------------------------------- D-12 .. D-14, D-20
# Karta AB-1b.1, pakiety P6-P8: przypisanie stanu, zrodlo testowe, zdarzenia warunkowe,
# czesciowa utrata zrodla — kazde twierdzenie wobec wyroczni bez importow z rdzenia.


def test_d12_lokalizacja_zdarzen_warunkowych_wobec_postaci_zamknietych() -> None:
    pomiary = bramki.g14_lokalizacja_zdarzen_warunkowych()
    for klucz in (
        "G14_blad_lokalizacji_wzgl_tolerancji",
        "G14_pobudzenia_niezgodne_z_kierunkiem",
        "G14_akcje_niezgodne_z_kasowaniem",
    ):
        assert pomiary[klucz] <= bramki.PROGI[klucz], (klucz, pomiary)


def test_d12_wyrocznia_kroku_trapezu_spelnia_rownanie_kroku() -> None:
    """Samokontrola wyroczni: `tau` z postaci zamknietej spelnia rownanie JEDNEGO kroku
    trapezu `x1 = x0 + tau/2 (f(x0) + f(x1))` dla czlonu `dx/dt = (x_inf - x)/T`."""
    from .wyrocznia_zdarzen import pierwiastek_kroku_trapezu

    x_0, x_inf, stala, prog = 0.2, 1.0, 0.05, 0.55
    tau = pierwiastek_kroku_trapezu(x_0, x_inf, stala, prog)
    residuum = prog - x_0 - 0.5 * tau * ((x_inf - x_0) / stala + (x_inf - prog) / stala)
    assert abs(residuum) < 1e-15


def test_d13_przypisanie_stanu_wobec_wyroczni_rownania_wahan() -> None:
    pomiary = bramki.g18_przypisanie_stanu()
    assert pomiary["G18_skok_stanow_nieprzypisanych"] == 0.0
    assert pomiary["G18_blad_wartosci_przypisanej"] == 0.0
    for klucz in ("G18_residuum_algebry_po_przypisaniu", "G18_blad_trajektorii_po_przypisaniu_rad"):
        assert pomiary[klucz] <= bramki.PROGI[klucz], (klucz, pomiary)


def test_d14_zrodlo_testowe_wobec_postaci_zamknietej() -> None:
    pomiary = bramki.g15_zrodlo_testowe()
    for klucz in (
        "G15_blad_postaci_zamknietej_wzgl",
        "G15_napiecie_wezla_rozne_od_sem",
        "G15_blad_czestotliwosci_zrodla_idealnego_hz",
    ):
        assert pomiary[klucz] <= bramki.PROGI[klucz], (klucz, pomiary)


def test_d14_wyrocznia_profilu_jest_ciagla_poza_skokami() -> None:
    """Samokontrola wyroczni: kat i amplituda ciagle na koncach ramp (strona L == P), skok
    amplitudy i fazy — nieciaglosc dokladnie o wartosc segmentu."""
    from .wyrocznia_zdarzen import profil_zamkniety

    segmenty = bramki.PROFIL_SONDY_7_WYROCZNIA

    def punkt(t: float, strona: str) -> tuple[float, float, float]:
        return profil_zamkniety(segmenty, m_0=1.0, kat_0_rad=0.0, f_n_hz=50.0, t_s=t, strona=strona)

    for t in (1.0, 2.0, 3.0):  # poczatki i konce ramp
        assert punkt(t, "L") == pytest.approx(punkt(t, "P"), abs=1e-15)
    assert punkt(0.2, "P")[0] - punkt(0.2, "L")[0] == pytest.approx(-0.5, abs=1e-15)
    assert punkt(1.5, "P")[1] - punkt(1.5, "L")[1] == pytest.approx(math.radians(30.0), abs=1e-15)


@pytest.mark.parametrize("rodzina", ["gfl", "maszyna_klasyczna"])
def test_d20_agregat_z_udzialem_polowy_rowny_dwom_polowom_z_odlaczeniem(rodzina: str) -> None:
    assert (
        bramki.zmierz_rownowaznosc_agregatu(rodzina)
        <= bramki.PROGI["G21_blad_rownowaznosci_agregatu_wzgl"]
    )


def test_d20_przyspieszenie_wyspy_po_czesciowej_utracie_wobec_algebry_wyroczni() -> None:
    pomiary = bramki.g21_utrata_czesciowa()
    for klucz in (
        "G21_blad_rocof_maszyn_po_utracie_wzgl",
        "G21_blad_rocof_srodka_bezwladnosci_wzgl",
        "G21_blad_rownowaznosci_agregatu_wzgl",
    ):
        assert pomiary[klucz] <= bramki.PROGI[klucz], (klucz, pomiary)
