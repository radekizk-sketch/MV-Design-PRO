"""BRAMKI FIZYCZNE: niezalezne sprawdzenia rdzenia wobec wyroczni analitycznej.

Kazda bramka odpowiada INNEJ klasie bledu implementacyjnego. Progi sa wyprowadzone
z rzedu metody, amplitudy sygnalu i arytmetyki podwojnej precyzji — nie dobrane po
zobaczeniu wyniku. Uzasadnienie kazdego progu stoi przy nim.

KAZDA BRAMKA JEST OSOBNA FUNKCJA. Dzieki temu `pytest` raportuje, KTORA klasa
bledu padla, a harness mutacji (`mutacje.py`) moze uruchomic komplet jednym
wywolaniem `zmierz()` i porownac werdykt PRZED i PO wstrzyknieciu defektu.
"""

from __future__ import annotations

import cmath
import itertools
import json
import math

import numpy as np
from network_model.solvers.dynamika import (
    GalazDynamiki,
    HarmonogramDynamiki,
    OdbiorDynamiki,
    OdmowaDynamiki,
    OdsprzegDynamiki,
    PunktPracy,
    SilnikDynamiki,
    WejscieDynamiki,
    WezelDynamiki,
    ZmianaGalezi,
    ZwarcieGalezi,
    ZwarcieWezla,
)
from network_model.solvers.dynamika.kontrakty import KOD_ZWARCIE_NIEODIZOLOWANE
from network_model.solvers.dynamika.obserwable import JAKOSC_CHWILA_ZDARZENIA
from network_model.solvers.dynamika.urzadzenia import (
    zbuduj_maszyne_klasyczna,
    zbuduj_szyne_sztywna,
)

from . import stanowisko
from .wyrocznia import UkladSMIB
from .wyrocznia_fazorow import (
    GalazZPrzekladnia,
    napiecia_sieci,
    superpozycja_thevenina,
)
from .wyrocznia_pradow import (
    GalazPi,
    ZrodloNortona,
    polowki_linii_ze_zwarciem,
    prad_do_ziemi_wezla_uziemionego,
    rozwiaz_siec_liniowa,
)
from .wyrocznia_zdarzen import miejsce_odizolowane, napiecie_odbioru_stalej_mocy

Z_B = stanowisko.Z_BAZOWA_OM

PROGI: dict[str, float] = {
    # G1 — bieg bez zaklocenia nie moze ruszac kata. Prog 1e-9 rad to ~40 rzedow
    # ponizej kazdego realnego ruchu, a ~1e5 ulp(0,43 rad) — z zapasem na 2000 krokow.
    "G1_dryf_stanu_ustalonego_rad": 1e-9,
    # G2 — czestotliwosc modu elektromechanicznego z przebiegu wobec analityki.
    # 1e-3 wzglednie: pomiar okresu z przejsc przez zero na siatce 5e-4 s.
    "G2_blad_czestotliwosci_modu_wzgl": 1.0e-3,
    # G3 — ROCOF w chwili zwarcia liczony z rownania ruchu wobec algebry wyroczni.
    # Obie strony licza TE SAMA wielkosc dwiema droga; 1e-9 to zapas na zaokraglenie.
    "G3_blad_rocof_wzgl": 1.0e-9,
    # G4 — tlumienie modu (D = 4) z obwiedni maksimow. 1e-2: dopasowanie
    # wykladnicze do kilkunastu ekstremow ma wlasna niepewnosc rzedu procenta.
    "G4_blad_tlumienia_wzgl": 1.0e-2,
    # G5 — czas wykonania zdarzenia. Prog 1e-12 s: zdarzenie ma trafic w chwile
    # zadana, a nie „w najblizszy krok siatki".
    "G5_blad_czasu_zdarzenia_s": 1e-12,
    # G6 — ta sama maszyna podana w INNEJ bazie urzadzenia musi dac ten sam mod.
    # Baza rowna bazie ukladu czyni przeliczenie mnozeniem przez 1,0, wiec bez tej
    # bramki kazdy blad KIERUNKU przeliczenia bylby niewidoczny (defekt F-1).
    "G6_blad_czestotliwosci_inna_baza_wzgl": 1.0e-3,
    # G7 — CZESTOTLIWOSC WEZLOWA wobec DOKLADNEJ pochodnej analitycznej liczonej
    # z wlasnej macierzy Y wyroczni na stanie wzietym z biegu. Izoluje OBSERWABLE
    # od rownania ruchu (tego pilnuja G2/G3/G4). Prog 1e-12 Hz = ~140 ulp(50 Hz),
    # a kazde zepsucie wzoru daje blad rzedu 1-50 Hz.
    "G7_blad_czestotliwosci_wezlowej_hz": 1.0e-12,
    # G7 (czesc druga, karta AB-1b.1 par. 0 pkt 6) — w chwili zdarzenia czestotliwosc NIE
    # jest liczba: pochodna fazy przez nieciaglosc nie istnieje. Prog 0,0 (predykat):
    # liczba probek `L`/`P`, w ktorych `f_hz` jest liczba albo kod jakosci inny niz 3.
    "G7_czestotliwosc_w_chwili_zdarzenia_jako_liczba": 0.0,
    # G8 — granica fail-closed na REALNYM biegu (odbior o stalej mocy + zapad).
    # Prog 0,0, bo to PREDYKAT (granica zachowana / zlamana), nie pomiar.
    "G8_granica_odmowy_zlamana": 0.0,
    # G9 — residuum algebry PO zdarzeniu. Pominiecie reinicjalizacji zostawia punkt
    # niezgodny z nowa siecia: residuum rzedu zmiany admitancji (>= 1e-2).
    # Tolerancja Newtona w tych biegach to 1e-11, wiec 1e-9 to 100x zapas.
    "G9_residuum_algebry_po_zdarzeniu": 1.0e-9,
    # G10 — czas krytyczny produktu wobec NIEZALEZNEJ wyroczni (kwadratura rownych
    # pol + bisekcja po trajektoriach DOP853/Radau, zgodne miedzy soba do 3,6e-10 s).
    # Prog 2e-3 s: produkt calkuje trapezem o rzedzie 2 z krokiem 5e-4 s, wiec blad
    # metody jest rzedu dt^2 * skala ~ 1e-6 s, a rozdzielczosc jego wlasnej bisekcji
    # to 1e-5 s; 2e-3 s to 200x zapas, a KAZDE zepsucie rownania wahan przesuwa
    # czas krytyczny o dziesiatki milisekund.
    "G10_blad_czasu_krytycznego_s": 2.0e-3,
    # G11 — niezmiennik energii przy D = 0: calka pierwsza nie moze dryfowac.
    # Prog 1e-6 pu: dla trapezu o rzedzie 2 i dt = 5e-4 s dryf jest rzedu 1e-9,
    # a kazdy zly znak/skladnik momentu daje dryf rzedu 1e-2.
    "G11_dryf_calki_pierwszej_pu": 1.0e-6,
    # G12 — przy D > 0 energia MALEJE monotonicznie. Prog 0,0 (predykat):
    # najwiekszy DODATNI przyrost musi byc zerem w granicach zaokraglenia,
    # a zly znak tlumienia daje przyrosty rzedu 1e-4.
    "G12_najwiekszy_dodatni_przyrost_energii_pu": 1.0e-12,
    # G13 — WYSPA BEZ ZRODLA (defekt F-8). Prog 0,0 (predykat): uklad bez
    # mozliwosci zasilenia odbioru musi konczyc sie ODMOWA NAZWANA, a nie
    # „zbieznoscia" przy |V| ~ 1e11 pu ani surowym OverflowError. Sprawdzane
    # przy DWOCH zestawach nastaw, bo od nich zalezalo, ktory z dwoch
    # nieuczciwych koncow wypadnie.
    "G13_wyspa_bez_zrodla_nieodmowiona": 0.0,
    # G16 (czesc zwarcia w linii, karta AB-1b.1 P4) — napiecia zaciskow, napiecie w miejscu
    # zwarcia i prad zwarcia z czwornika Krona rdzenia wobec wyroczni z JAWNYM wezlem
    # wewnetrznym (gesta algebra, `wyrocznia_pradow`). Siec jest liniowa, wiec obie strony
    # licza TE SAME liczby dwiema drogami: 1e-12 wzglednie to zapas ~1e4 ulp na
    # zaokraglenia rozkladu LU i przeliczenia omow na pu. Zamiana polowek x <-> 1-x albo
    # nierozdzielona susceptancja daje bledy rzedu 1e-2.
    "G16_blad_czwornika_wzgl": 1.0e-12,
    # G17 — OBSZAR BEZNAPIECIOWY (D-16). Napiecie wezla odcietego: 0,0 DOKLADNIE (wiersz
    # ograniczenia, nie „prawie zero" Newtona). Po ponownym zasileniu napiecie odbioru
    # stalej mocy wobec WYZSZEGO pierwiastka rownania kwadratowego ukladu dwuwezlowego:
    # 1e-10 pu to 10x tolerancja Newtona biegu (1e-11), a pierwiastek nizszy lezy o
    # dziesiate czesci pu dalej — start od zera albo zly punkt startowy nie zmiesci sie.
    "G17_napiecie_obszaru_odcietego_pu": 0.0,
    "G17_blad_ponownego_zasilenia_pu": 1.0e-10,
    # G19 — PREDYKAT IZOLACJI (D-17). Prog 0,0 (predykat): liczba podzbiorow otwieranych
    # galezi pierscienia, dla ktorych rdzen i niezalezna analiza spojnosci grafu stanu t+
    # (`networkx`) rozstrzygaja inaczej, czy usuniecie `izolacja` jest dopuszczalne.
    "G19_niezgodnosc_predykatu_izolacji": 0.0,
    # G16 (czesc fazorow pradow galezi, D-15 (i)) — modul i kat pradow OBU zaciskow kazdej
    # galezi oraz pradu zwarcia w probkach `L` i `P` chwili zwarcia wobec superpozycji
    # Thevenina wyroczni (kolumna Z sieci zdrowej, bez skladania sieci zwartej). Siec
    # liniowa (odbiory jako admitancje): Newton rdzenia zbiega w jednym kroku do
    # zaokraglenia LU, wiec 1e-10 wzglednie dla modulu i 1e-9 rad dla kata (karta
    # AB-1b.1 P5) to zapas >1e4 ulp; sprzezenie fazora albo zamiana zaciskow daje bledy
    # rzedu 1e-1 rad, a przekladnia po zlej stronie — rzedu 1e-2 wzglednie.
    "G16_blad_modulu_pradu_galezi_wzgl": 1.0e-10,
    "G16_blad_kata_pradu_galezi_rad": 1.0e-9,
    # G16 (czesc IEC 60909, D-15 (ii)) — I_k'' i moduly pradow galezi w probce `P` zwarcia
    # metalicznego wobec FROZEN `ShortCircuitIEC60909Solver` (zrodlo zastepcze c*U_n/sqrt3
    # za Z_Q, linie bez susceptancji, bez odbiorow — przy tych zalozeniach metoda zrodla
    # zastepczego i bieg od punktu pracy U = c_max licza TE SAME liczby). 1e-9 wzglednie:
    # przeliczenia om <-> pu i A <-> pu dokladaja ~1e-15, a K_T/K_G nie wystepuja.
    "G16_blad_parytetu_iec60909_wzgl": 1.0e-9,
    "G16_kierunek_niezgodny_iec60909": 0.0,
    # G20 — PROBKI OBUSTRONNE (D-18). Napiecia obu wezlow SMIB w probce `L` chwili
    # zdarzenia wobec algebry wyroczni sieci SPRZED zdarzenia, w probce `P` — sieci PO nim,
    # przy tym samym kacie wirnika. Algebra SMIB jest liniowa: 1e-10 wzglednie to 10x
    # tolerancja Newtona biegu. Probka `L` pobrana po re-inicjalizacji daje blad rzedu
    # zapadu (>1e-1).
    "G20_blad_algebry_probek_L_P_wzgl": 1.0e-10,
    # Stan rozniczkowy jest CIAGLY: kat wirnika w `L` i `P` tej samej chwili rowny
    # DOKLADNIE (ta sama tablica stanu). Prog 0,0 (predykat).
    "G20_skok_stanu_rozniczkowego_rad": 0.0,
    # Uporzadkowanie osi: `L` bezposrednio przed `P` tej samej chwili, os niemalejaca,
    # czestotliwosc `None` z kodem 3 w obu probkach. Prog 0,0 (predykat, liczba naruszen).
    "G20_naruszenia_osi_i_czestotliwosci": 0.0,
}


# --------------------------------------------------------------------------- pomocnicze
def _okres(t: np.ndarray, x: np.ndarray, x0: float) -> float:
    """Okres oscylacji ze SREDNIEJ odleglosci przejsc przez poziom rownowagi."""
    y = x - x0
    z = [
        t[i] - y[i] * (t[i + 1] - t[i]) / (y[i + 1] - y[i])
        for i in range(len(y) - 1)
        if y[i] * y[i + 1] < 0.0
    ]
    return 2.0 * float(np.mean(np.diff(z))) if len(z) >= 3 else float("nan")


def _sigma(t: np.ndarray, x: np.ndarray, x0: float) -> float:
    """Wykladnik tlumienia z obwiedni maksimow lokalnych (dopasowanie liniowe log)."""
    y = np.abs(x - x0)
    pt, pa = [], []
    for i in range(1, len(y) - 1):
        if (x[i] - x[i - 1]) * (x[i + 1] - x[i]) < 0.0:
            pt.append(t[i])
            pa.append(y[i])
    if len(pa) < 4 or min(pa) <= 0:
        return float("nan")
    return float(-np.polyfit(np.asarray(pt), np.log(np.asarray(pa)), 1)[0])


def _zwarcie(t_s: float, x_f_pu: float, t_usuniecia_s: float | None) -> tuple[ZwarcieWezla, ...]:
    return (
        ZwarcieWezla(
            t_s=t_s,
            wezel="GEN",
            typ="3F",
            r_f_ohm=0.0,
            x_f_ohm=x_f_pu * Z_B,
            t_usuniecia_s=t_usuniecia_s,
            sposob_usuniecia=None if t_usuniecia_s is None else "samoczynne",
        ),
    )


# --------------------------------------------------------------------------- bramki
def g1_dryf_stanu_ustalonego() -> dict[str, float]:
    """Bieg bez zaklocenia: punkt pracy jest rownowaga, wiec kat stoi."""
    wynik = stanowisko.uruchom(
        stanowisko.zbuduj(), (), horyzont_s=2.0, dt_s=1e-3, krok_wyjscia_s=1e-2
    )
    delta = stanowisko.szereg(wynik, "delta_rad@G1", strony=stanowisko.SIATKA_PRAWOSTRONNA)
    return {"G1_dryf_stanu_ustalonego_rad": float(np.max(np.abs(delta - delta[0])))}


def g2_g4_mod_elektromechaniczny() -> dict[str, float]:
    """Czestotliwosc (D = 0) i tlumienie (D = 4) modu wobec postaci zamknietej."""
    wyniki: dict[str, float] = {}
    for etykieta, d_pu, klucz in (
        ("G2", 0.0, "G2_blad_czestotliwosci_modu_wzgl"),
        ("G4", 4.0, "G4_blad_tlumienia_wzgl"),
    ):
        wynik = stanowisko.uruchom(
            stanowisko.zbuduj(d_pu=d_pu),
            _zwarcie(0.3, 5.0, 0.32),
            horyzont_s=4.5,
            dt_s=5e-4,
            krok_wyjscia_s=5e-4,
        )
        t = stanowisko.czas(wynik, strony=stanowisko.SIATKA_PRAWOSTRONNA)
        delta = stanowisko.szereg(wynik, "delta_rad@G1", strony=stanowisko.SIATKA_PRAWOSTRONNA)
        uklad = UkladSMIB(d_pu=d_pu)
        analityka = uklad.mod_analityczny()
        pp = uklad.punkt_pracy()
        maska = t >= 0.32
        if etykieta == "G2":
            okres = _okres(t[maska], delta[maska], float(pp["delta0"]))
            wyniki["_okres_s"] = okres
            wyniki[klucz] = (
                abs(1.0 / okres - float(analityka["f_d_hz"])) / float(analityka["f_d_hz"])
                if okres == okres
                else float("inf")
            )
        else:
            sigma = _sigma(t[maska], delta[maska], float(pp["delta0"]))
            sigma_a = float(analityka["zeta"]) * float(analityka["omega_n_rad_s"])
            wyniki["_sigma_1_s"] = sigma
            wyniki[klucz] = abs(sigma - sigma_a) / sigma_a if sigma == sigma else float("inf")
    return wyniki


def g3_rocof_w_chwili_zwarcia() -> dict[str, float]:
    """ROCOF z rownania ruchu produktu wobec algebry wyroczni w tej samej chwili.

    Probka wybrana po STRONIE (karta AB-1b.1 par. 0 pkt 6): `P` chwili zwarcia — stan po
    naniesieniu zwarcia i re-inicjalizacji, czyli ten, w ktorym moc elektryczna juz
    spadla. Probka `L` tej chwili niesie moc sprzed zwarcia (ROCOF zero).
    """
    wynik = stanowisko.uruchom(
        stanowisko.zbuduj(),
        _zwarcie(0.5, 0.05, None),
        horyzont_s=0.55,
        dt_s=2.5e-4,
        krok_wyjscia_s=2.5e-4,
    )
    i0 = stanowisko.indeks_probki(wynik, 0.5, "P")
    p_m = wynik.probki["p_mechaniczna_pu@G1"]
    p_e = wynik.probki["p_pu@G1"]
    produkt = (p_m[i0] - p_e[i0]) / (2.0 * 3.5)
    uklad = UkladSMIB()
    pp = uklad.punkt_pracy()
    p_e_wyrocznia = uklad.moc_elektryczna(
        float(pp["delta0"]), float(pp["sem_modul"]), complex(pp["e_sys"]), 1.0 / complex(0.0, 0.05)
    )
    wyrocznia = (float(pp["p_m"]) - p_e_wyrocznia) / (2.0 * 3.5)
    return {
        "_rocof_produkt": float(produkt),
        "_rocof_wyrocznia": float(wyrocznia),
        "G3_blad_rocof_wzgl": float(abs(produkt - wyrocznia) / abs(wyrocznia)),
    }


def g5_czas_zdarzenia() -> dict[str, float]:
    """Zdarzenie ma trafic w chwile ZADANA, nie w najblizszy wezel siatki."""
    wynik = stanowisko.uruchom(
        stanowisko.zbuduj(),
        _zwarcie(0.4237, 0.2, 0.5111),
        horyzont_s=0.7,
        dt_s=1e-3,
        krok_wyjscia_s=1e-3,
    )
    return {
        "G5_blad_czasu_zdarzenia_s": max(
            abs(z.t_wykonany_s - z.t_zaplanowany_s) for z in wynik.zdarzenia_wykonane
        )
    }


def g6_inna_baza_urzadzenia() -> dict[str, float]:
    """Ta sama maszyna podana w bazie 50 MVA musi dac IDENTYCZNY mod (F-1)."""
    wynik = stanowisko.uruchom(
        stanowisko.zbuduj(s_n_mva=50.0),
        _zwarcie(0.3, 5.0, 0.32),
        horyzont_s=4.5,
        dt_s=5e-4,
        krok_wyjscia_s=5e-4,
    )
    t = stanowisko.czas(wynik, strony=stanowisko.SIATKA_PRAWOSTRONNA)
    delta = stanowisko.szereg(wynik, "delta_rad@G1", strony=stanowisko.SIATKA_PRAWOSTRONNA)
    uklad = UkladSMIB(d_pu=0.0)
    analityka = uklad.mod_analityczny()
    pp = uklad.punkt_pracy()
    okres = _okres(t[t >= 0.32], delta[t >= 0.32], float(pp["delta0"]))
    return {
        "_okres_inna_baza_s": okres,
        "G6_blad_czestotliwosci_inna_baza_wzgl": (
            abs(1.0 / okres - float(analityka["f_d_hz"])) / float(analityka["f_d_hz"])
            if okres == okres
            else float("inf")
        ),
    }


def g7_czestotliwosc_wezlowa() -> dict[str, float]:
    """Opublikowane `f_hz` wobec DOKLADNEJ pochodnej analitycznej wyroczni.

    Algebra SMIB jest LINIOWA w `V`, wiec `dV/ddelta` liczy sie jednym
    rozwiazaniem ukladu — bez roznic skonczonych i bez rozwijania fazy.
    """
    wynik = stanowisko.uruchom(
        stanowisko.zbuduj(),
        _zwarcie(0.3, 0.5, 0.45),
        horyzont_s=1.2,
        dt_s=5e-4,
        krok_wyjscia_s=5e-4,
    )
    # Probki SIATKI (`C`): w chwilach zdarzen (0,3 i 0,45 s) czestotliwosc jest
    # NIEDOSTEPNA w obu probkach `L`/`P` (chwila nieciaglosci, kod 3) — sprawdzane
    # osobno ponizej, a nie zamieniane na liczbe (karta AB-1b.1 par. 0 pkt 6).
    t = stanowisko.czas(wynik, strony="C")
    delta = stanowisko.szereg(wynik, "delta_rad@G1", strony="C")
    omega = stanowisko.szereg(wynik, "omega_pu@G1", strony="C")
    f_hz = stanowisko.szereg(wynik, "f_hz@GEN", strony="C")
    uklad = UkladSMIB()
    pp = uklad.punkt_pracy()
    sem, e_sys = float(pp["sem_modul"]), complex(pp["e_sys"])
    omega_b = 2.0 * math.pi * 50.0
    y_f = 1.0 / complex(0.0, 0.5)
    najgorszy = 0.0
    for i in range(len(t)):
        czynne = 0.3 < t[i] < 0.45
        macierz = uklad.macierz(y_f if czynne else 0j)
        e_m = sem * cmath.exp(1j * float(delta[i]))
        napiecia = np.linalg.solve(
            macierz, np.array([e_m * uklad.y_maszyny, e_sys * uklad.y_systemu])
        )
        pochodna = np.linalg.solve(macierz, np.array([1j * e_m * uklad.y_maszyny, 0.0 + 0.0j]))
        v_kropka = pochodna * (omega_b * (float(omega[i]) - 1.0))
        theta_kropka = (v_kropka[0] * napiecia[0].conjugate()).imag / (abs(napiecia[0]) ** 2)
        najgorszy = max(najgorszy, abs(50.0 + theta_kropka / (2.0 * math.pi) - float(f_hz[i])))
    liczba_w_chwili_zdarzenia = sum(
        1
        for i, strona in enumerate(wynik.strona_probki)
        if strona != "C"
        and (
            wynik.probki["f_hz@GEN"][i] is not None
            or wynik.probki["jakosc_f@GEN"][i] != JAKOSC_CHWILA_ZDARZENIA
        )
    )
    return {
        "G7_blad_czestotliwosci_wezlowej_hz": float(najgorszy),
        "_probki_zdarzen": float(sum(1 for s in wynik.strona_probki if s != "C")),
        "G7_czestotliwosc_w_chwili_zdarzenia_jako_liczba": float(liczba_w_chwili_zdarzenia),
    }


#: Zamiatanie glebokosci zapadu dla bramki G8 (pu impedancji bazowej wezla).
ZAPADY_G8_PU: tuple[float, ...] = (0.5, 0.2, 0.1, 0.05, 0.03, 0.0222, 0.01, 0.002)


def g8_granica_odmowy() -> dict[str, float | dict[str, str]]:
    """Granica FAIL-CLOSED odbioru o stalej mocy — jako ZAMIATANIE, nie dwa punkty.

    Model odbioru o stalej mocy ma FIZYCZNA granice waznosci: przy zapadzie napiecia
    do zera zada pradu bez granicy, wiec algebra przestaje miec rozwiazanie. Bramka
    nie pyta „gdzie dokladnie lezy ta granica" — to zalezy od ukladu — tylko czy
    rdzen zachowuje sie po niej UCZCIWIE:

    1. plytki zapad LICZY sie i daje wynik skonczony,
    2. gleboki zapad konczy sie ODMOWA NAZWANA (kod z zamknietego rejestru),
    3. granica jest POJEDYNCZA i monotoniczna — nie ma glebszego zapadu, ktory
       „znowu sie liczy" po tym, jak plytszy juz odmowil.

    Punkt 3 jest tu wazniejszy od 1 i 2: gdyby zbieznosc wracala losowo przy
    glebszym zapadzie, oznaczaloby to, ze o wyniku decyduje przypadek numeryczny,
    a nie fizyka modelu. Zmierzona granica (dt = 2,5e-4 s, odbior 0,4 pu) lezy
    miedzy `x_f = 0,03 pu` (bieg, min|U| = 0,130 pu) a `x_f = 0,0222 pu`
    (`dynamika.krok_niezbiezny`); jeszcze glebiej rdzen melduje
    `dynamika.reinicjalizacja_niezbiezna`. Bramka NIE przypina tych wartosci —
    przypina ksztalt zachowania.
    """
    from network_model.solvers.dynamika.kontrakty import KODY_ODMOW

    wyniki: dict[str, str] = {}
    for x_f_pu in ZAPADY_G8_PU:
        try:
            wynik = stanowisko.uruchom(
                stanowisko.zbuduj(odbior_p_pu=0.4),
                _zwarcie(0.3, x_f_pu, None),
                horyzont_s=0.45,
                dt_s=2.5e-4,
                krok_wyjscia_s=2.5e-4,
            )
        except OdmowaDynamiki as odmowa:
            wyniki[f"x_f={x_f_pu} pu"] = (
                odmowa.kod if odmowa.kod in KODY_ODMOW else f"KOD SPOZA REJESTRU: {odmowa.kod}"
            )
            continue
        except Exception as blad:  # noqa: BLE001 — surowy wyjatek lamie kontrakt
            wyniki[f"x_f={x_f_pu} pu"] = f"WYJATEK SUROWY {type(blad).__name__}"
            continue
        napiecia = stanowisko.szereg(wynik, "u_pu@GEN", strony=stanowisko.SIATKA_PRAWOSTRONNA)
        wyniki[f"x_f={x_f_pu} pu"] = (
            f"BIEG min|U|={float(np.min(napiecia)):.6f} pu"
            if bool(np.all(np.isfinite(napiecia)))
            else "WARTOSC NIESKONCZONA"
        )

    klasy = [
        "BIEG" if opis.startswith("BIEG") else ("ODMOWA" if opis in KODY_ODMOW else "ZLAMANIE")
        for opis in wyniki.values()
    ]
    najplytszy_ok = klasy[0] == "BIEG"
    najglebszy_odmowa = klasy[-1] == "ODMOWA"
    bez_zlaman = "ZLAMANIE" not in klasy
    # Monotonicznosc: po pierwszej odmowie nie moze wrocic zaden bieg.
    pierwsza_odmowa = klasy.index("ODMOWA") if "ODMOWA" in klasy else len(klasy)
    monotoniczna = all(k == "ODMOWA" for k in klasy[pierwsza_odmowa:])
    return {
        "_granica_odmowy": wyniki,
        "G8_granica_odmowy_zlamana": float(
            not (najplytszy_ok and najglebszy_odmowa and bez_zlaman and monotoniczna)
        ),
    }


def g9_residuum_po_zdarzeniu() -> dict[str, float]:
    """Reinicjalizacja po zdarzeniu: `g(x+, y+) = 0` dotrzymane w calym biegu."""
    wynik = stanowisko.uruchom(
        stanowisko.zbuduj(),
        _zwarcie(0.3, 0.5, 0.45),
        horyzont_s=0.8,
        dt_s=5e-4,
        krok_wyjscia_s=5e-4,
    )
    return {"G9_residuum_algebry_po_zdarzeniu": float(wynik.wlasnosci.max_residuum_g)}


def g10_czas_krytyczny() -> dict[str, float]:
    """Czas krytyczny produktu wobec DWOCH niezaleznych drog wyroczni.

    Scenariusz jest klasycznym zadaniem CCT: zwarcie trojfazowe przez reaktancje
    `X_f` na szynie generatora, usuwane bez utraty linii. Wyrocznia odwzorowuje
    je przeksztalceniem gwiazda-trojkat (uklad pozostaje bezstratny, wiec
    charakterystyka mocy nadal jest sinusoida), produkt — wlasnym zdarzeniem
    `ZwarcieWezla`. Obie strony dostaja TEN SAM `X_f` podany jawnie.

    Droga wyroczni nr 1 to kwadratura po KACIE (kryterium rownych pol), droga
    nr 2 to bisekcja po TRAJEKTORIACH (DOP853). Zgadzaja sie do 3,6e-10 s, a
    produkt liczy trzecia droga — trapezem niejawnym ze sprzezeniem sieciowym.
    """
    x_f_pu = 0.05
    uklad = UkladSMIB()
    x_linii_zwarcia = uklad.reaktancja_linii_przy_zwarciu(x_f_pu)
    rowne_pola = uklad.czas_krytyczny_rownych_pol(x_linii_zwarcia_pu=x_linii_zwarcia)
    bisekcja = uklad.czas_krytyczny_calkowaniem(
        x_linii_zwarcia_pu=x_linii_zwarcia, horyzont_s=6.0, metoda="DOP853"
    )
    delta_u = rowne_pola["delta_u_rad"]

    def stracil(t_trwania: float) -> bool:
        # Krok 1e-3 s i okno pozwarciowe 1,5 s: klasyfikacja pyta WYLACZNIE, czy kat
        # przekracza `delta_u` przy `omega > 1`, a uklad niestabilny dochodzi tam w
        # kilkaset milisekund. Blad metody rzedu `dt^2` przesuwa granice o ~4e-6 s,
        # czyli 500x ponizej progu bramki (2e-3 s) — zapas jest POLICZONY, nie zgadniety.
        wynik = stanowisko.uruchom(
            stanowisko.zbuduj(),
            _zwarcie(0.2, x_f_pu, 0.2 + t_trwania),
            horyzont_s=0.2 + t_trwania + 1.5,
            dt_s=1e-3,
            krok_wyjscia_s=1e-3,
        )
        delta = stanowisko.szereg(wynik, "delta_rad@G1", strony=stanowisko.SIATKA_PRAWOSTRONNA)
        omega = stanowisko.szereg(wynik, "omega_pu@G1", strony=stanowisko.SIATKA_PRAWOSTRONNA)
        czas = stanowisko.czas(wynik, strony=stanowisko.SIATKA_PRAWOSTRONNA)
        po = czas >= 0.2 + t_trwania
        return bool(np.any((delta[po] > delta_u) & (omega[po] > 1.0)))

    dolny, gorny = 0.0, 0.05
    while not stracil(gorny):
        gorny *= 2.0
        if gorny > 2.0:
            raise AssertionError("Produkt nie traci synchronizmu w badanym oknie")
    while gorny - dolny > 5.0e-5:
        srodek = 0.5 * (dolny + gorny)
        if stracil(srodek):
            gorny = srodek
        else:
            dolny = srodek
    produkt = 0.5 * (dolny + gorny)
    return {
        "_cct_produkt_s": produkt,
        "_cct_rowne_pola_s": rowne_pola["t_cct_s"],
        "_cct_bisekcja_s": bisekcja["t_cct_s"],
        "_cct_niedomkniecie_pol": rowne_pola["niedomkniecie_pol"],
        "G10_blad_czasu_krytycznego_s": float(abs(produkt - rowne_pola["t_cct_s"])),
    }


def g11_g12_energia() -> dict[str, float]:
    """Niezmienniki energii: `D = 0` -> calka pierwsza stala, `D > 0` -> maleje.

    Funkcja energii liczona WYLACZNIE z probek wyniku i ze stalych maszyny —
    nie wola ani silnika, ani sieci, wiec nie moze potwierdzic biegu jego wlasnym
    kodem. Kat jest WZGLEDNY (`delta - delta_szyny`), bo SEM szyny sztywnej ma
    wlasny niezerowy kat.
    """
    wyniki: dict[str, float] = {}
    for d_pu in (0.0, 2.0):
        uklad = UkladSMIB(d_pu=d_pu)
        pp = uklad.punkt_pracy()
        sem, e_sys = float(pp["sem_modul"]), complex(pp["e_sys"])
        p_m = float(pp["p_m"])
        delta_s = cmath.phase(e_sys)
        x_total = uklad.x_prim_pu + uklad.x_linii_pu + uklad.x_systemu_pu
        p_max = sem * abs(e_sys) / x_total
        masa = 2.0 * uklad.h_s / uklad.omega_b

        wynik = stanowisko.uruchom(
            stanowisko.zbuduj(d_pu=d_pu),
            _zwarcie(0.3, 5.0, 0.35),
            horyzont_s=3.0,
            dt_s=5e-4,
            krok_wyjscia_s=5e-4,
        )
        czas = stanowisko.czas(wynik, strony=stanowisko.SIATKA_PRAWOSTRONNA)
        delta = stanowisko.szereg(wynik, "delta_rad@G1", strony=stanowisko.SIATKA_PRAWOSTRONNA)
        omega = stanowisko.szereg(wynik, "omega_pu@G1", strony=stanowisko.SIATKA_PRAWOSTRONNA)
        predkosc = uklad.omega_b * (omega - 1.0)
        energia = (
            0.5 * masa * predkosc**2
            - p_m * (delta - float(pp["delta0"]))
            - p_max * (np.cos(delta - delta_s) - math.cos(float(pp["delta0"]) - delta_s))
        )
        po_zwarciu = czas >= 0.35
        odcinek = energia[po_zwarciu]
        if d_pu == 0.0:
            wyniki["G11_dryf_calki_pierwszej_pu"] = float(np.max(np.abs(odcinek - odcinek[0])))
        else:
            przyrosty = np.diff(odcinek)
            wyniki["G12_najwiekszy_dodatni_przyrost_energii_pu"] = float(np.max(przyrosty))
            wyniki["_spadek_energii_pu"] = float(odcinek[0] - odcinek[-1])
    return wyniki


def g13_wyspa_bez_zrodla() -> dict[str, float | dict[str, str]]:
    """Wyspa niosaca odbior bez zrodla konczy sie ODMOWA NAZWANA (defekt F-8).

    Wprost odtworzony kontrprzyklad recenzenta: `Ybus = 0` i odbior o stalej mocy
    `S = 1,0 + j0,2 pu`. Bez sprawdzenia warunku istnienia ten uklad konczyl sie
    na dwa sposoby zaleznie WYLACZNIE od nastaw: surowym `OverflowError` przy
    `tolerancja = 1e-100 / 400 iteracji` albo „zbieznoscia" przy `|V| = 1,374e+11 pu`
    i residuum `7,42e-12` przy nastawach ROBOCZYCH. Oba konce sa badane.

    Trzeci przypadek — wyspa z urzadzeniem ODLACZONYM zdarzeniem — sprawdza, ze
    predykat mierzy WKLAD DO ALGEBRY, a nie sama obecnosc urzadzenia w wyspie.
    """
    import numpy as np_lokalne
    from network_model.solvers.dynamika.kontrakty import (
        KOD_WYSPA_BEZ_ZRODLA,
        OdbiorDynamiki,
        WezelDynamiki,
    )
    from network_model.solvers.dynamika.siec import rozwiaz_algebre, zloz_model_sieci
    from network_model.solvers.dynamika.urzadzenia import zbuduj_maszyne_klasyczna
    from network_model.solvers.dynamika.urzadzenia.odlaczone import UrzadzenieOdlaczone

    model = zloz_model_sieci(
        (WezelDynamiki("ODB", 15.0),), (), (), galezie_aktywne=frozenset(), admitancje_zwarc=()
    )
    odbiory = (OdbiorDynamiki("L1", "ODB", 1.0, 0.2),)

    def probuj(tol: float, maxit: int, urzadzenia=(), stany=()) -> str:
        try:
            rozwiaz_algebre(
                model,
                odbiory,
                urzadzenia,
                stany,
                np_lokalne.array([1.0 + 0.0j]),
                tolerancja=tol,
                max_iteracji=maxit,
                max_nawrotow=40,
                t_s=0.0,
            )
        except OdmowaDynamiki as odmowa:
            return odmowa.kod
        except Exception as blad:  # noqa: BLE001
            return f"WYJATEK SUROWY {type(blad).__name__}"
        return "ZWROCIL WYNIK"

    maszyna = zbuduj_maszyne_klasyczna(
        ident="G1",
        wezel="ODB",
        s_n_mva=100.0,
        h_s=3.5,
        d_pu=0.0,
        x_prim_pu=0.3,
        ra_pu=0.0,
        s_bazowa_mva=100.0,
        f_bazowa_hz=50.0,
    )
    odlaczona = UrzadzenieOdlaczone(maszyna)
    stan_odlaczonej = (maszyna.stan_poczatkowy(1.0 + 0.0j, complex(0.0, 0.0)),)

    przypadki = {
        "tolerancja=1e-100, iteracji=400": probuj(1e-100, 400),
        "tolerancja=1e-11, iteracji=60 (robocze)": probuj(1e-11, 60),
        "urzadzenie ODLACZONE w wyspie": probuj(1e-11, 60, (odlaczona,), stan_odlaczonej),
    }
    return {
        "_wyspa_bez_zrodla": przypadki,
        "G13_wyspa_bez_zrodla_nieodmowiona": float(
            not all(kod == KOD_WYSPA_BEZ_ZRODLA for kod in przypadki.values())
        ),
    }


# --------------------------------------------------------------------------- zdarzenia rdzenia
#: Uklad zwarcia w linii (G16) i uklad dwuwezlowy obszaru beznapieciowego (G17) — parametry
#: podane JAWNIE po stronie bramki i po stronie wyroczni (nic nie jest wspoldzielone z
#: rdzeniem poza wejsciem biegu).
Y_LINII_ZWARCIA = 1.0 / complex(0.02, 0.1)
B_LINII_ZWARCIA = 0.004
Z_ZRODLA = complex(0.005, 0.05)
Y_BOCZNIKA_B = complex(0.0, 0.01)
POLOZENIA_G16 = (0.1, 0.3, 0.5, 0.85)
ADMITANCJA_ZWARCIA_G16 = 1.0 / complex(0.2, 0.3)


def _blad_wzgledny(produkt: complex | float, wyrocznia: complex | float) -> float:
    """|a - b| / |b|; dla b = 0 bezwzgledne |a| (zero dokladne ma byc zerem dokladnym)."""
    return abs(produkt - wyrocznia) / abs(wyrocznia) if wyrocznia != 0 else abs(produkt)


def _fazor(wynik, wezel: str, indeks: int = -1) -> complex:
    """Fazor napiecia wezla z probki. Kat `None` wolno spotkac WYLACZNIE przy module
    DOKLADNIE zerowym (fazor zerowy nie ma kata, karta AB-1b.1 par. 0 pkt 8) — wtedy
    fazorem jest zero; `None` przy module niezerowym to blad kontraktu, nie zero."""
    modul = wynik.probki[f"u_pu@{wezel}"][indeks]
    kat = wynik.probki[f"kat_deg@{wezel}"][indeks]
    if kat is None:
        assert modul == 0.0, f"kat None przy |V| = {modul!r} (wezel {wezel})"
        return 0j
    return cmath.rect(modul, math.radians(kat))


def zmierz_zwarcie_w_linii(
    polozenie: float, admitancja_zwarcia: complex | None
) -> dict[str, float]:
    """Zwarcie w linii A-B w `x*L` (zrodlo za impedancja w A, bocznik w B) wobec wyroczni.

    `admitancja_zwarcia = None` to zwarcie metaliczne: w wyroczni wezel wewnetrzny jest
    UZIEMIONY wprost (usuniety z ukladu), w rdzeniu — stempel czwornika z uziemionym
    wezlem wewnetrznym, a zacisk B za zwarciem jest obszarem beznapieciowym.
    """
    galaz = GalazPi("A", "B", Y_LINII_ZWARCIA, B_LINII_ZWARCIA)
    zrodlo = ZrodloNortona("A", 1.0 + 0j, 1.0 / Z_ZRODLA)
    przed = rozwiaz_siec_liniowa(("A", "B"), (galaz,), (("B", Y_BOCZNIKA_B),), (zrodlo,))
    pierwsza, druga = polowki_linii_ze_zwarciem(galaz, polozenie, "M")
    po = rozwiaz_siec_liniowa(
        ("A", "B", "M"),
        (pierwsza, druga),
        (("B", Y_BOCZNIKA_B),) + ((("M", admitancja_zwarcia),) if admitancja_zwarcia else ()),
        (zrodlo,),
        uziemione=() if admitancja_zwarcia else ("M",),
    )
    prad_wyroczni = (
        admitancja_zwarcia * po["M"]
        if admitancja_zwarcia
        else prad_do_ziemi_wezla_uziemionego((pierwsza, druga), po, "M")
    )

    if admitancja_zwarcia is None:
        r_f_ohm = x_f_ohm = 0.0
    else:
        impedancja_ohm = Z_B / admitancja_zwarcia
        r_f_ohm, x_f_ohm = impedancja_ohm.real, impedancja_ohm.imag
    szyna = zbuduj_szyne_sztywna(
        ident="SYS",
        wezel="A",
        s_zwarciowa_mva=stanowisko.S_BAZOWA_MVA,
        r_pu=Z_ZRODLA.real,
        x_pu=Z_ZRODLA.imag,
        s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
    )
    prad_zrodla = (1.0 - przed["A"]) / Z_ZRODLA
    wynik = SilnikDynamiki(
        WejscieDynamiki(
            wezly=(WezelDynamiki("A", stanowisko.U_N_KV), WezelDynamiki("B", stanowisko.U_N_KV)),
            galezie=(
                GalazDynamiki(
                    "LAB", "A", "B", Y_LINII_ZWARCIA, B_LINII_ZWARCIA, 1 + 0j, True, "linia"
                ),
            ),
            odsprzegi=(OdsprzegDynamiki("BAT_B", "B", Y_BOCZNIKA_B.real, Y_BOCZNIKA_B.imag, True),),
            odbiory=(),
            urzadzenia=(szyna,),
            punkt_pracy=PunktPracy(
                {"A": przed["A"], "B": przed["B"]}, {"SYS": przed["A"] * prad_zrodla.conjugate()}
            ),
            harmonogram=HarmonogramDynamiki(
                (ZwarcieGalezi(0.01, "LAB", polozenie, "3F", r_f_ohm, x_f_ohm, None, None),)
            ),
            nastawy=stanowisko.nastawy(dt_s=1e-3, horyzont_s=0.03, krok_wyjscia_s=1e-2),
            s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
            f_bazowa_hz=stanowisko.F_BAZOWA_HZ,
        )
    ).uruchom()
    klucz = f"LAB:x={polozenie!r}"
    return {
        "blad_napiec_wzgl": max(
            _blad_wzgledny(_fazor(wynik, "A"), po["A"]),
            _blad_wzgledny(_fazor(wynik, "B"), po["B"]),
            _blad_wzgledny(wynik.probki[f"u_zwarcia_pu@{klucz}"][-1], abs(po["M"])),
        ),
        "blad_pradu_zwarcia_wzgl": _blad_wzgledny(
            wynik.probki[f"i_zwarcia_pu@{klucz}"][-1], abs(prad_wyroczni)
        ),
    }


def g16_zwarcie_w_linii() -> dict[str, float]:
    """Zwarcie w linii x*L (D-21): cztery polozenia x {R_f > 0, metaliczne}."""
    bledy: dict[str, float] = {}
    for polozenie in POLOZENIA_G16:
        for nazwa, admitancja in (("Rf", ADMITANCJA_ZWARCIA_G16), ("metal", None)):
            pomiar = zmierz_zwarcie_w_linii(polozenie, admitancja)
            bledy[f"x={polozenie}/{nazwa}"] = max(pomiar.values())
    return {"_zwarcie_w_linii": bledy, "G16_blad_czwornika_wzgl": max(bledy.values())}


#: Uklad G17: zrodlo za impedancja w S, linia S-L, odbior stalej mocy w L.
Z_LINII_G17 = complex(0.02, 0.08)
MOC_ODBIORU_G17 = complex(0.6, 0.2)
T_ZASILENIA_G17_S = 0.05


def g17_obszar_beznapieciowy() -> dict[str, float]:
    """Wezel martwy od t = 0 zasilany zamknieciem linii (D-16).

    Punkt pracy NIE ma napiecia wezla L (rozplyw go nie rozwiazal) — rdzen ma go uznac
    za obszar beznapieciowy (V = 0 dokladnie, odbior odciety), a po zamknieciu linii
    trafic w WYZSZY pierwiastek rownania `E conj(V) - |V|^2 = Z conj(S)`.
    """
    szyna = zbuduj_szyne_sztywna(
        ident="SYS",
        wezel="S",
        s_zwarciowa_mva=stanowisko.S_BAZOWA_MVA,
        r_pu=Z_ZRODLA.real,
        x_pu=Z_ZRODLA.imag,
        s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
    )
    wynik = SilnikDynamiki(
        WejscieDynamiki(
            wezly=(WezelDynamiki("S", stanowisko.U_N_KV), WezelDynamiki("L", stanowisko.U_N_KV)),
            galezie=(
                GalazDynamiki("LSL", "S", "L", 1.0 / Z_LINII_G17, 0.0, 1 + 0j, False, "linia"),
            ),
            odsprzegi=(),
            odbiory=(OdbiorDynamiki("ODB", "L", MOC_ODBIORU_G17.real, MOC_ODBIORU_G17.imag),),
            urzadzenia=(szyna,),
            punkt_pracy=PunktPracy({"S": 1.0 + 0j}, {"SYS": 0j}),
            harmonogram=HarmonogramDynamiki((ZmianaGalezi(T_ZASILENIA_G17_S, "LSL", True),)),
            nastawy=stanowisko.nastawy(dt_s=1e-3, horyzont_s=0.1, krok_wyjscia_s=1e-2),
            s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
            f_bazowa_hz=stanowisko.F_BAZOWA_HZ,
        )
    ).uruchom()
    czas_biegu = stanowisko.czas(wynik, strony=stanowisko.SIATKA_PRAWOSTRONNA)
    napiecie_l = stanowisko.szereg(wynik, "u_pu@L", strony=stanowisko.SIATKA_PRAWOSTRONNA)
    wyzszy, nizszy = napiecie_odbioru_stalej_mocy(1.0 + 0j, Z_ZRODLA + Z_LINII_G17, MOC_ODBIORU_G17)
    koncowe = _fazor(wynik, "L")
    return {
        "G17_napiecie_obszaru_odcietego_pu": float(
            np.max(np.abs(napiecie_l[czas_biegu < T_ZASILENIA_G17_S]))
        ),
        "G17_blad_ponownego_zasilenia_pu": abs(koncowe - wyzszy),
        "_odleglosc_od_pierwiastka_nizszego_pu": abs(koncowe - nizszy),
    }


PIERSCIEN_GALEZIE = ("S-A", "A-B", "B-C", "C-S")


def pierscien_d17(zdarzenia: tuple, horyzont_s: float = 0.1):
    """Pierscien S-A-B-C-S: szyna sztywna na S, maszyna (bez mocy) na C, bocznik na B.

    Punkt pracy liczony dokladnie algebra liniowa WYROCZNI (siec bez odbiorow, maszyna
    bez mocy: jej SEM jest napieciem zacisku).
    """
    wezly = tuple(WezelDynamiki(w, stanowisko.U_N_KV) for w in ("S", "A", "B", "C"))
    y = 1.0 / complex(0.01, 0.08)
    galezie = tuple(
        GalazDynamiki(nazwa, nazwa[0], nazwa[2], y, 0.001, 1 + 0j, True, "linia")
        for nazwa in PIERSCIEN_GALEZIE
    )
    szyna = zbuduj_szyne_sztywna(
        ident="SYS",
        wezel="S",
        s_zwarciowa_mva=stanowisko.S_BAZOWA_MVA,
        r_pu=0.0,
        x_pu=0.05,
        s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
    )
    maszyna = zbuduj_maszyne_klasyczna(
        ident="G",
        wezel="C",
        s_n_mva=50.0,
        h_s=3.0,
        d_pu=1.0,
        x_prim_pu=0.3,
        ra_pu=0.0,
        s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
        f_bazowa_hz=stanowisko.F_BAZOWA_HZ,
    )
    napiecia = rozwiaz_siec_liniowa(
        tuple(w.ident for w in wezly),
        tuple(
            GalazPi(g.wezel_od, g.wezel_do, g.y_szeregowa_pu, g.b_poprzeczna_pu) for g in galezie
        ),
        (("B", complex(0.0, 0.01)),),
        (ZrodloNortona("S", 1.0 + 0j, 1.0 / complex(0.0, 0.05)),),
    )
    punkt = PunktPracy(
        napiecia,
        {"SYS": napiecia["S"] * ((1.0 - napiecia["S"]) / complex(0.0, 0.05)).conjugate(), "G": 0j},
    )
    return SilnikDynamiki(
        WejscieDynamiki(
            wezly=wezly,
            galezie=galezie,
            odsprzegi=(OdsprzegDynamiki("BAT_B", "B", 0.0, 0.01, True),),
            odbiory=(),
            urzadzenia=(szyna, maszyna),
            punkt_pracy=punkt,
            harmonogram=HarmonogramDynamiki(zdarzenia),
            nastawy=stanowisko.nastawy(dt_s=1e-3, horyzont_s=horyzont_s, krok_wyjscia_s=1e-2),
            s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
            f_bazowa_hz=stanowisko.F_BAZOWA_HZ,
        )
    ).uruchom()


def g19_predykat_izolacji() -> dict[str, float]:
    """Predykat izolacji (D-17) wobec spojnosci grafu t+ — wszystkie 16 podzbiorow otwarc."""
    niezgodne: list[str] = []
    przypadki = 0
    for maska in itertools.product((False, True), repeat=len(PIERSCIEN_GALEZIE)):
        otwarte = tuple(g for g, otwarta in zip(PIERSCIEN_GALEZIE, maska, strict=True) if otwarta)
        zdarzenia = (
            ZwarcieWezla(0.02, "B", "3F", 0.1, 0.1, 0.05, "izolacja"),
            *(ZmianaGalezi(0.05, galaz, False) for galaz in otwarte),
        )
        aktywne = [(g[0], g[2]) for g in PIERSCIEN_GALEZIE if g not in otwarte]
        oczekiwane = miejsce_odizolowane(("S", "A", "B", "C"), aktywne, ("S", "C"), "B")
        try:
            pierscien_d17(zdarzenia)
            rdzen = True
        except OdmowaDynamiki as odmowa:
            if odmowa.kod != KOD_ZWARCIE_NIEODIZOLOWANE:
                raise
            rdzen = False
        przypadki += 1
        if rdzen != oczekiwane:
            niezgodne.append("+".join(otwarte) or "brak")
    return {
        "_niezgodne_podzbiory": niezgodne,  # type: ignore[dict-item]
        "_przypadki_sprawdzone": przypadki,
        "G19_niezgodnosc_predykatu_izolacji": float(len(niezgodne)),
    }


# --------------------------------------------------------------------------- fazory i probki
#: Siec D-15 (i): szyna sztywna S, linia z susceptancja, transformator z przekladnia
#: zespolona (odchylenie od znamionowej i przesuniecie fazowe grupy polaczen), odbiory jako
#: admitancje stale, maszyna klasyczna bez mocy w C. Parametry JAWNIE po obu stronach.
WEZLY_D15 = ("S", "A", "T", "B", "C")
Z_ZRODLA_D15 = complex(0.004, 0.04)
GALEZIE_D15 = (
    GalazZPrzekladnia("L-SA", "S", "A", 1.0 / complex(0.01, 0.05), 0.02, 1.0 + 0j),
    GalazZPrzekladnia(
        "TR-AT", "A", "T", 1.0 / complex(0.005, 0.08), 0.001, cmath.rect(1.025, -math.pi / 6.0)
    ),
    GalazZPrzekladnia("L-TB", "T", "B", 1.0 / complex(0.02, 0.06), 0.01, 1.0 + 0j),
    GalazZPrzekladnia("L-BC", "B", "C", 1.0 / complex(0.015, 0.07), 0.005, 1.0 + 0j),
)
#: Odbior takze w C: bez niego prad zacisku `do` linii B-C bylby rowny DOKLADNIE zeru
#: (maszyna bez mocy), a kat takiego fazora w rdzeniu jest katem szumu zaokraglen (~1e-15)
#: — porownanie kata nie mialoby tresci. Kazdy porownywany prad jest rzedu 1e-2 pu i wiecej.
ADMITANCJE_ODBIOROW_D15 = (
    ("T", complex(0.3, -0.1)),
    ("B", complex(0.2, -0.05)),
    ("C", complex(0.05, -0.02)),
)
#: Reaktancja przejsciowa maszyny: 0,3 pu w bazie 50 MVA = 0,6 pu w bazie ukladu 100 MVA
#: (impedancja skaluje sie S_uklad/S_n) — podana wprost, nie przeliczona kodem rdzenia.
X_MASZYNY_D15_PU = 0.6
#: Miejsca i impedancje zwarcia (pu): R_f > 0 w trzech wezlach i zwarcie metaliczne.
ZWARCIA_D15: tuple[tuple[str, complex], ...] = (
    ("A", complex(0.05, 0.1)),
    ("T", complex(0.0, 0.2)),
    ("B", 0j),
    ("C", complex(0.1, 0.1)),
)
T_ZWARCIA_D15_S = 0.02


def _kat_rad(wartosc_deg: float | None, wyrocznia: complex) -> float:
    """Blad kata (rad, zawiniety do [-pi, pi]); kat `None` przy fazorze niezerowym to blad."""
    if wartosc_deg is None:
        return math.inf if wyrocznia != 0 else 0.0
    roznica = math.radians(wartosc_deg) - cmath.phase(wyrocznia)
    return abs((roznica + math.pi) % (2.0 * math.pi) - math.pi)


def bieg_d15(wezel: str, z_zwarcia_pu: complex):
    """Bieg produktu na sieci D-15 ze zwarciem 3F w `wezel` w chwili `T_ZWARCIA_D15_S`."""
    impedancja_ohm = z_zwarcia_pu * Z_B
    return siec_d15(
        (
            ZwarcieWezla(
                T_ZWARCIA_D15_S,
                wezel,
                "3F",
                impedancja_ohm.real,
                impedancja_ohm.imag,
                None,
                None,
            ),
        ),
        horyzont_s=0.03,
    )


def siec_d15(zdarzenia: tuple, *, horyzont_s: float):
    """Bieg produktu na sieci D-15 z dowolnym harmonogramem (siatka wyjscia 0,01 s).

    Siec sluzy tez testom iloczynu cech probek obustronnych: ma galaz, ktora da sie
    otworzyc (L-TB), wyspe bez zrodla po otwarciu TR-AT i L-BC (T, B — same admitancje),
    linie do zwarcia w miejscu x*L (L-SA) i transformator z przekladnia zespolona.
    """
    zdrowe = napiecia_sieci(
        WEZLY_D15,
        GALEZIE_D15,
        ADMITANCJE_ODBIOROW_D15,
        (ZrodloNortona("S", 1.0 + 0j, 1.0 / Z_ZRODLA_D15),),
    )
    szyna = zbuduj_szyne_sztywna(
        ident="SYS",
        wezel="S",
        s_zwarciowa_mva=stanowisko.S_BAZOWA_MVA,
        r_pu=Z_ZRODLA_D15.real,
        x_pu=Z_ZRODLA_D15.imag,
        s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
    )
    maszyna = zbuduj_maszyne_klasyczna(
        ident="G",
        wezel="C",
        s_n_mva=50.0,
        h_s=3.0,
        d_pu=1.0,
        x_prim_pu=0.3,
        ra_pu=0.0,
        s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
        f_bazowa_hz=stanowisko.F_BAZOWA_HZ,
    )
    return SilnikDynamiki(
        WejscieDynamiki(
            wezly=tuple(WezelDynamiki(w, stanowisko.U_N_KV) for w in WEZLY_D15),
            galezie=tuple(
                GalazDynamiki(
                    g.ident,
                    g.od,
                    g.do,
                    g.y,
                    g.b_calkowita,
                    g.przekladnia,
                    True,
                    "linia" if g.przekladnia == 1 else "transformator",
                )
                for g in GALEZIE_D15
            ),
            odsprzegi=tuple(
                OdsprzegDynamiki(f"ODB-{w}", w, y.real, y.imag, True)
                for w, y in ADMITANCJE_ODBIOROW_D15
            ),
            odbiory=(),
            urzadzenia=(szyna, maszyna),
            punkt_pracy=PunktPracy(
                zdrowe,
                {
                    "SYS": zdrowe["S"] * ((1.0 - zdrowe["S"]) / Z_ZRODLA_D15).conjugate(),
                    "G": 0j,
                },
            ),
            harmonogram=HarmonogramDynamiki(zdarzenia),
            nastawy=stanowisko.nastawy(dt_s=1e-3, horyzont_s=horyzont_s, krok_wyjscia_s=1e-2),
            s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
            f_bazowa_hz=stanowisko.F_BAZOWA_HZ,
        )
    ).uruchom()


def zmierz_fazory_d15(wezel: str, z_zwarcia_pu: complex) -> dict[str, float]:
    """Fazory pradow OBU zaciskow wszystkich galezi i pradu zwarcia: L i P wobec Thevenina."""
    wynik = bieg_d15(wezel, z_zwarcia_pu)
    lewa = stanowisko.indeks_probki(wynik, T_ZWARCIA_D15_S, "L")
    prawa = stanowisko.indeks_probki(wynik, T_ZWARCIA_D15_S, "P")
    probki = wynik.probki
    zdrowe = napiecia_sieci(
        WEZLY_D15,
        GALEZIE_D15,
        ADMITANCJE_ODBIOROW_D15,
        (ZrodloNortona("S", 1.0 + 0j, 1.0 / Z_ZRODLA_D15),),
    )
    # SEM maszyny z kata wirnika W CHWILI zwarcia wzietego z biegu (stan rozniczkowy
    # wspolny obu stron porownania, jak w G7); modul SEM = |V_C| punktu pracy (I = 0).
    sem_maszyny = cmath.rect(abs(zdrowe["C"]), probki["delta_rad@G"][lewa])
    wyrocznia = superpozycja_thevenina(
        WEZLY_D15,
        GALEZIE_D15,
        ADMITANCJE_ODBIOROW_D15,
        (
            ZrodloNortona("S", 1.0 + 0j, 1.0 / Z_ZRODLA_D15),
            ZrodloNortona("C", sem_maszyny, 1.0 / complex(0.0, X_MASZYNY_D15_PU)),
        ),
        wezel,
        z_zwarcia_pu,
    )
    blad_modulu = 0.0
    blad_kata = 0.0
    for indeks, prady in ((lewa, wyrocznia.prady_przed), (prawa, wyrocznia.prady_po)):
        for ident, (i_od, i_do) in prady.items():
            for zacisk, oczekiwany in (("od", i_od), ("do", i_do)):
                blad_modulu = max(
                    blad_modulu,
                    _blad_wzgledny(probki[f"i_{zacisk}_pu@{ident}"][indeks], abs(oczekiwany)),
                )
                blad_kata = max(
                    blad_kata, _kat_rad(probki[f"i_{zacisk}_kat_deg@{ident}"][indeks], oczekiwany)
                )
    blad_modulu = max(
        blad_modulu,
        _blad_wzgledny(probki[f"i_zwarcia_pu@{wezel}"][prawa], abs(wyrocznia.prad_zwarcia)),
        abs(probki[f"i_zwarcia_pu@{wezel}"][lewa]),
    )
    blad_kata = max(
        blad_kata, _kat_rad(probki[f"i_zwarcia_kat_deg@{wezel}"][prawa], wyrocznia.prad_zwarcia)
    )
    if probki[f"i_zwarcia_kat_deg@{wezel}"][lewa] is not None:
        blad_kata = math.inf  # prad zwarcia przed zwarciem jest zerem: kat nie istnieje
    return {"modul": blad_modulu, "kat": blad_kata}


def g16_fazory_pradow_galezi() -> dict[str, float]:
    """Fazory pradow galezi (D-15 (i)): cztery miejsca zwarcia, probki L i P."""
    bledy: dict[str, dict[str, float]] = {}
    for wezel, z_zwarcia in ZWARCIA_D15:
        bledy[f"{wezel}/Zf={z_zwarcia}"] = zmierz_fazory_d15(wezel, z_zwarcia)
    return {
        "_fazory_d15": bledy,  # type: ignore[dict-item]
        "G16_blad_modulu_pradu_galezi_wzgl": max(b["modul"] for b in bledy.values()),
        "G16_blad_kata_pradu_galezi_rad": max(b["kat"] for b in bledy.values()),
    }


#: Siec D-15 (ii) — wylacznie elementy, dla ktorych metoda zrodla zastepczego IEC 60909 i
#: bieg od punktu pracy U = c_max licza to samo: zrodlo za Z_Q, linie bez susceptancji
#: (pierscien Q-A-B-Q i odgalezienie B-C), bez transformatorow, generatorow i odbiorow.
U_N_IEC_KV = 15.0
S_K_IEC_MVA = 250.0
RX_ZRODLA_IEC = 0.1
C_MAX_IEC = 1.1
LINIE_IEC: tuple[tuple[str, str, str, float, float, float], ...] = (
    # (ident, od, do, r_ohm_km, x_ohm_km, dlugosc_km)
    ("L-QA", "Q", "A", 0.2, 0.35, 3.0),
    ("L-AB", "A", "B", 0.3, 0.4, 2.0),
    ("L-QB", "Q", "B", 0.25, 0.3, 4.0),
    ("L-BC", "B", "C", 0.4, 0.35, 1.5),
)
WEZEL_ZWARCIA_IEC = "B"


def g16_parytet_iec60909() -> dict[str, float]:
    """I_k'' i prady galezi zwarcia metalicznego wobec FROZEN solvera IEC 60909 (D-15 (ii))."""
    from network_model.core.branch import BranchType, LineBranch
    from network_model.core.graph import NetworkGraph
    from network_model.core.grid_source import GridShortCircuitSource
    from network_model.core.node import Node, NodeType
    from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

    z_bazowa_ohm = U_N_IEC_KV**2 / stanowisko.S_BAZOWA_MVA
    prad_bazowy_a = stanowisko.S_BAZOWA_MVA * 1e6 / (math.sqrt(3.0) * U_N_IEC_KV * 1e3)
    z_q_ohm = C_MAX_IEC * U_N_IEC_KV**2 / S_K_IEC_MVA
    x_q_ohm = z_q_ohm / math.sqrt(1.0 + RX_ZRODLA_IEC**2)
    z_q = complex(RX_ZRODLA_IEC * x_q_ohm, x_q_ohm)
    wezly = ("Q", "A", "B", "C")

    graf = NetworkGraph()
    for wezel in wezly:
        graf.add_node(
            Node(
                id=wezel,
                name=wezel,
                node_type=NodeType.PQ,
                voltage_level=U_N_IEC_KV,
                active_power=0.0,
                reactive_power=0.0,
            )
        )
    for ident, od, do, r_km, x_km, dlugosc in LINIE_IEC:
        graf.add_branch(
            LineBranch(
                id=ident,
                name=ident,
                branch_type=BranchType.LINE,
                from_node_id=od,
                to_node_id=do,
                r_ohm_per_km=r_km,
                x_ohm_per_km=x_km,
                b_us_per_km=0.0,
                length_km=dlugosc,
                rated_current_a=0.0,
            )
        )
    graf.add_grid_sc_source(GridShortCircuitSource(id="Q-SIEC", name="Q", node_id="Q", z_ohm=z_q))
    iec = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graf, WEZEL_ZWARCIA_IEC, c_factor=C_MAX_IEC, tk_s=1.0, include_branch_contributions=True
    )

    szyna = zbuduj_szyne_sztywna(
        ident="Q-SIEC",
        wezel="Q",
        s_zwarciowa_mva=stanowisko.S_BAZOWA_MVA,
        r_pu=z_q.real / z_bazowa_ohm,
        x_pu=z_q.imag / z_bazowa_ohm,
        s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
    )
    wynik = SilnikDynamiki(
        WejscieDynamiki(
            wezly=tuple(WezelDynamiki(w, U_N_IEC_KV) for w in wezly),
            galezie=tuple(
                GalazDynamiki(
                    ident,
                    od,
                    do,
                    1.0 / (complex(r_km, x_km) * dlugosc / z_bazowa_ohm),
                    0.0,
                    1.0 + 0j,
                    True,
                    "linia",
                )
                for ident, od, do, r_km, x_km, dlugosc in LINIE_IEC
            ),
            odsprzegi=(),
            odbiory=(),
            urzadzenia=(szyna,),
            # Punkt pracy bez obciazenia: U = c_max w kazdym wezle (nastawa `u_set_pu`
            # zrodla = c_max), moc zrodla zero — to jest zalozenie metody zrodla zastepczego.
            punkt_pracy=PunktPracy({w: complex(C_MAX_IEC, 0.0) for w in wezly}, {"Q-SIEC": 0j}),
            harmonogram=HarmonogramDynamiki(
                (ZwarcieWezla(0.01, WEZEL_ZWARCIA_IEC, "3F", 0.0, 0.0, None, None),)
            ),
            nastawy=stanowisko.nastawy(dt_s=1e-3, horyzont_s=0.02, krok_wyjscia_s=1e-2),
            s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
            f_bazowa_hz=stanowisko.F_BAZOWA_HZ,
        )
    ).uruchom()
    prawa = stanowisko.indeks_probki(wynik, 0.01, "P")
    probki = wynik.probki
    prad_zwarcia = cmath.rect(
        probki[f"i_zwarcia_pu@{WEZEL_ZWARCIA_IEC}"][prawa],
        math.radians(probki[f"i_zwarcia_kat_deg@{WEZEL_ZWARCIA_IEC}"][prawa]),
    )
    bledy = {"Ik''": _blad_wzgledny(abs(prad_zwarcia) * prad_bazowy_a, iec.ikss_a)}
    kierunki_niezgodne = 0
    wklady = {w.branch_id: w for w in iec.branch_contributions or ()}
    for ident, *_ in LINIE_IEC:
        modul_a = probki[f"i_od_pu@{ident}"][prawa] * prad_bazowy_a
        wklad = wklady.get(ident)
        # Blad odniesiony do I_k'' (skala pradow sieci zwartej), nie do pradu galezi:
        # odgalezienie B-C nie niesie pradu zwarciowego, a obie strony oddaja tam szum
        # zaokraglen (~1e-13 A) — wzgledny blad szumu wobec szumu nie ma tresci.
        bledy[ident] = abs(modul_a - (wklad.i_contrib_a if wklad else 0.0)) / iec.ikss_a
        # Kierunek istnieje tylko dla pradu odroznialnego od zaokraglen: 1e-6 I_k'' to
        # ~1e7 ulp ponad szum, a kazda galaz pierscienia niesie > 0,4 I_k''.
        if wklad is None or wklad.i_contrib_a < 1e-6 * iec.ikss_a:
            continue
        kat = probki[f"i_od_kat_deg@{ident}"][prawa]
        fazor = cmath.rect(1.0, math.radians(kat))
        # Prad zacisku `od` plynie do galezi; kierunek „od -> do" = zgodny w fazie z pradem
        # zwarcia plynacym do ziemi w miejscu zwarcia.
        kierunek = "from_to" if (fazor * prad_zwarcia.conjugate()).real > 0 else "to_from"
        kierunki_niezgodne += int(kierunek != wklad.direction)
    return {
        "_parytet_iec60909": bledy,  # type: ignore[dict-item]
        "_ikss_iec_a": float(iec.ikss_a),
        "G16_blad_parytetu_iec60909_wzgl": max(bledy.values()),
        "G16_kierunek_niezgodny_iec60909": float(kierunki_niezgodne),
    }


def g20_probki_obustronne() -> dict[str, float]:
    """Probki obustronne (D-18): `L` = algebra przed zdarzeniem, `P` = po, ten sam stan x.

    Zwarcie w chwili NA siatce wyjscia (0,3 s) i usuniecie w chwili POZA nia (0,4237 s):
    obie chwile maja pare `L`/`P`, a siatka `C` zostaje nietknieta.
    """
    wynik = stanowisko.uruchom(
        stanowisko.zbuduj(),
        _zwarcie(0.3, 0.5, 0.4237),
        horyzont_s=0.6,
        dt_s=5e-4,
        krok_wyjscia_s=1e-2,
    )
    uklad = UkladSMIB()
    pp = uklad.punkt_pracy()
    sem, e_sys = float(pp["sem_modul"]), complex(pp["e_sys"])
    y_f = 1.0 / complex(0.0, 0.5)
    probki = wynik.probki
    blad = 0.0
    skok = 0.0
    naruszenia = 0
    for chwila, bocznik_l, bocznik_p in ((0.3, 0j, y_f), (0.4237, y_f, 0j)):
        lewa = stanowisko.indeks_probki(wynik, chwila, "L")
        prawa = stanowisko.indeks_probki(wynik, chwila, "P")
        naruszenia += int(prawa != lewa + 1)
        skok = max(skok, abs(probki["delta_rad@G1"][prawa] - probki["delta_rad@G1"][lewa]))
        e_m = sem * cmath.exp(1j * float(probki["delta_rad@G1"][lewa]))
        prawa_strona = np.array([e_m * uklad.y_maszyny, e_sys * uklad.y_systemu])
        for indeks, bocznik in ((lewa, bocznik_l), (prawa, bocznik_p)):
            oczekiwane = np.linalg.solve(uklad.macierz(bocznik), prawa_strona)
            for pozycja, wezel in enumerate(("GEN", "SYS")):
                blad = max(blad, _blad_wzgledny(_fazor(wynik, wezel, indeks), oczekiwane[pozycja]))
            for wezel in ("GEN", "SYS"):
                naruszenia += int(probki[f"f_hz@{wezel}"][indeks] is not None)
                naruszenia += int(probki[f"jakosc_f@{wezel}"][indeks] != JAKOSC_CHWILA_ZDARZENIA)
    naruszenia += sum(
        1 for a, b in zip(wynik.os_czasu_s[:-1], wynik.os_czasu_s[1:], strict=True) if b < a
    )
    siatka = stanowisko.czas(wynik, strony="C")
    naruszenia += int(len(siatka) != 61 - 1)  # 61 chwil siatki bez chwili 0,3 s (para L/P)
    return {
        "G20_blad_algebry_probek_L_P_wzgl": float(blad),
        "G20_skok_stanu_rozniczkowego_rad": float(skok),
        "G20_naruszenia_osi_i_czestotliwosci": float(naruszenia),
    }


BRAMKI = (
    g1_dryf_stanu_ustalonego,
    g2_g4_mod_elektromechaniczny,
    g3_rocof_w_chwili_zwarcia,
    g5_czas_zdarzenia,
    g6_inna_baza_urzadzenia,
    g7_czestotliwosc_wezlowa,
    g8_granica_odmowy,
    g9_residuum_po_zdarzeniu,
    g10_czas_krytyczny,
    g11_g12_energia,
    g13_wyspa_bez_zrodla,
    g16_zwarcie_w_linii,
    g16_fazory_pradow_galezi,
    g16_parytet_iec60909,
    g17_obszar_beznapieciowy,
    g19_predykat_izolacji,
    g20_probki_obustronne,
)


def zmierz(wybrane: tuple[str, ...] | None = None) -> dict:
    """Komplet pomiarow — jedno wejscie dla harnessu mutacji.

    `wybrane` (nazwy funkcji bramek) zawezaja bieg. Harness mutacji uzywa tego, zeby
    mutacja o znanym detektorze nie musiala przepuszczac calego zestawu: kazda
    mutacja deklaruje, KTORA bramka ma ja zlapac, wiec bieg calosci nie wnosilby
    dowodu, a kosztowalby minuty.
    """
    wyniki: dict = {}
    for bramka in BRAMKI:
        if wybrane is not None and bramka.__name__ not in wybrane:
            continue
        wyniki.update(bramka())
    return wyniki


def werdykt(pomiary: dict) -> dict:
    """PASS/FAIL per bramka wobec `PROGI` — bez interpretacji, sam porownanie.

    Progi, ktorych bieg NIE zmierzyl (bo zawezono zestaw bramek), nie wchodza do
    werdyktu. Gdyby wchodzily jako FAIL, kazdy zawezony bieg wygladalby na zabicie
    mutacji — i harness meldowalby zabicia, ktorych nie bylo.
    """
    return {
        klucz: ("PASS" if float(pomiary[klucz]) <= prog else "FAIL")
        for klucz, prog in PROGI.items()
        if klucz in pomiary
    }


if __name__ == "__main__":  # pragma: no cover — wejscie harnessu mutacji
    import os

    _wybrane = os.environ.get("WALIDACJA_BRAMKI")
    try:
        pomiary = zmierz(tuple(_wybrane.split(",")) if _wybrane else None)
        ocena = werdykt(pomiary)
        pomiary["WERDYKT"] = ocena
        pomiary["WSZYSTKIE_PASS"] = all(v == "PASS" for v in ocena.values())
    except BaseException as blad:  # noqa: BLE001 — mutacja moze wywrocic bieg
        pomiary = {
            "WYJATEK": f"{type(blad).__name__}: {blad}",
            "WSZYSTKIE_PASS": False,
        }
    print(json.dumps(pomiary, indent=1, ensure_ascii=False, default=str))
