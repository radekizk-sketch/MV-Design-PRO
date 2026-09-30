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
import copy
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
    SkokObciazenia,
    WejscieDynamiki,
    WezelDynamiki,
    ZmianaGalezi,
    ZwarcieGalezi,
    ZwarcieWezla,
)
from network_model.solvers.dynamika.kontrakty import KOD_ZWARCIE_NIEODIZOLOWANE
from network_model.solvers.dynamika.obserwable import JAKOSC_CHWILA_ZDARZENIA
from network_model.solvers.dynamika.odbiory import charakterystyka_stalej_mocy
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

#: Odbior STALEJ MOCY wzorcow bramek — napiecie przejscia `U_min` jest DANA TESTU ponizej
#: wszystkich iteratow Newtona biegow (`stanowisko.U_MIN_TESTOWE_PU`, pomiar licznikiem wejsc
#: w galaz impedancyjna), wiec wzorce licza dotychczasowa charakterystyke stalej mocy.
STALA_MOC = stanowisko.STALA_MOC

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
    # G14 — LOKALIZACJA ZDARZEN WARUNKOWYCH (D-12). Kontrakt: |t* - t_prawdziwe| <=
    # tolerancja_lokalizacji + ulp(t) (prawy koniec przedzialu po przekroczeniu). Pomiar jest
    # STOSUNKIEM do tej granicy, bo bieg sprawdza dwie tolerancje (1e-6 i 1e-9 s) naraz —
    # prog 1,0 to dokladnie kontrakt, bez zapasu, bo trajektoria dyskretna rampy jest
    # dokladna (D-14), a pierwiastek czlonu inercyjnego ma postac zamknieta. Akcja
    # wykonana na koncu kroku zamiast w t* daje stosunek rzedu dt/(2 tolerancja) >= 5e3.
    # Zmierzone 2026-09-24: 0,5 — t* lezy pol tolerancji za pierwiastkiem (krok tolerancji
    # metody Brenta zamyka przedzial po jednej siecznej trafiajacej w pierwiastek dokladnie).
    "G14_blad_lokalizacji_wzgl_tolerancji": 1.0,
    # Kierunek (predykat): dozor `w_dol` pobudza sie wylacznie na zboczu opadajacym,
    # akcja jednorazowa wykonuje sie raz — liczba niezgodnosci z oczekiwana lista.
    "G14_pobudzenia_niezgodne_z_kierunkiem": 0.0,
    # Kasowanie (predykat): zapad 0,25 s krotszy niz zwloka 0,3 s — akcja z kasowaniem nie
    # wykonuje sie, bez kasowania wykonuje sie raz; liczba niezgodnosci.
    "G14_akcje_niezgodne_z_kasowaniem": 0.0,
    # G15 — ZRODLO TESTOWE (D-14). Rownania liniowe, przebiegi odcinkami wielomianowe
    # stopnia <= 2: trapez i RK4 sa DOKLADNE, zostaje zaokraglenie akumulowane przez ~350
    # krokow (zmierzone 2026-09-24: 1,6e-15). 1e-12 wzglednie to zapas ~600x; kat bez czlonu
    # odchylki pulsacji albo rampa bez zerowania tempa daja bledy rzedu 1e-1.
    "G15_blad_postaci_zamknietej_wzgl": 1.0e-12,
    # Zrodlo idealne narzuca napiecie wezla wierszem ograniczenia: |V| = |E| co do
    # kwantyzacji kontraktu (9 cyfr) — liczba probek niezgodnych (predykat).
    "G15_napiecie_wezla_rozne_od_sem": 0.0,
    # f wezla zrodla idealnego w probkach C = f_n (1 + dw): ten sam prog co G7 (1e-12 Hz
    # = ~140 ulp(50 Hz)); zmierzone 7,1e-15 Hz = ulp(50 Hz).
    "G15_blad_czestotliwosci_zrodla_idealnego_hz": 1.0e-12,
    # G18 — PRZYPISANIE STANU (D-13). Stany nieprzypisane przez chwile przypisania bitowo
    # bez zmiany i wartosc przypisana DOKLADNIE zadana: predykaty (0,0). Residuum algebry
    # po przypisaniu: 1e-9 jak G9 (tolerancja Newtona 1e-11, zapas 100x).
    "G18_skok_stanow_nieprzypisanych": 0.0,
    "G18_blad_wartosci_przypisanej": 0.0,
    "G18_residuum_algebry_po_przypisaniu": 1.0e-9,
    # Trajektoria kata po dwoch skokach P_m (0,2 s w rownowadze, 0,7 s w trakcie wahan)
    # wobec `solve_ivp` DOP853 wyroczni: trapez rzedu 2, h = 5e-4 s, horyzont 1,5 s, mod
    # ~1,3 Hz o amplitudzie ~0,1 rad => blad globalny ~ T h^2/12 max|d3 delta/dt3| ~ 2e-6
    # rad (zmierzone 2026-09-24: 1,44e-6 rad). Prog 1e-5 rad (zapas ~7x); ponowne wyznaczenie
    # stanu maszyny z punktu pracy w chwili przypisania (zerowanie odchylki predkosci w
    # trakcie wahan) daje bledy rzedu 1e-1 rad.
    "G18_blad_trajektorii_po_przypisaniu_rad": 1.0e-5,
    # G21 — CZESCIOWA UTRATA (D-20). (a) Agregat z udzialem 0,5 wobec dwoch polow z
    # odlaczeniem jednej: mnozenie przez 0,5 i dzielenie przez 2 sa dokladne w arytmetyce
    # dwojkowej — zostaje rozklad LU macierzy o innym wymiarze (rzad 1e-15; zmierzone
    # 2026-09-24: 0,0 bitowo dla przeksztaltnika nadaznego i maszyny klasycznej); 1e-12 to zapas.
    "G21_blad_rownowaznosci_agregatu_wzgl": 1.0e-12,
    # (b) Przyspieszenie maszyn w t = 0+ po utracie 40 % pradu PV wobec algebry wyroczni
    # (siec liniowa w chwili zdarzenia) — ta sama wielkosc dwiema drogami, jak G3: 1e-9
    # (zmierzone 2026-09-24: 5,9e-15 dla maszyn, 5,2e-15 dla srodka bezwladnosci).
    "G21_blad_rocof_maszyn_po_utracie_wzgl": 1.0e-9,
    "G21_blad_rocof_srodka_bezwladnosci_wzgl": 1.0e-9,
    # G22 — PARYTET t = 0 ROZPLYW <-> DYNAMIKA (D-22), tor rozplyw -> adapter -> rdzen. Moc
    # odbioru w punkcie pracy liczona przez rdzen (`odbiory.moc_poboru_w_punkcie_pracy`) wobec
    # wielomianu ROZPLYWU (`power_flow_zip.zip_factor` x `frequency_factor` — druga
    # implementacja tego samego wzoru): kilka ulp, 1e-12 wzglednie to zapas ~1e3. Moc
    # urzadzenia szyny = wstrzyk rozplywu + suma mocy odbiorow wg rozplywu: ta sama suma
    # dwiema drogami, 1e-12 wzglednie (wobec sumy modulow skladnikow). Podzial moca bazowa
    # `P0 + jQ0` zamiast `S(V_pf)` daje bledy rzedu 1e-3.
    "G22_blad_mocy_odbioru_wzgl": 1.0e-12,
    "G22_blad_mocy_urzadzenia_wzgl": 1.0e-12,
    # Residuum algebry w punkcie startowym biegu wobec granicy wynikajacej z tolerancji
    # rozplywu: `||g||_inf <= tol_PF / min|V_pf|` (prad = moc/napiecie; rozplyw domyka bilans
    # MOCY do `tol_PF`). Pomiar jest STOSUNKIEM do tej granicy — prog 1,0 to dokladnie
    # granica, bez zapasu (zmierzone przed karta na G16: 7,1e-9 przy tol 1e-8).
    "G22_residuum_rownowagi_wzgl_granicy": 1.0,
    # Predykaty (0,0): przypadek reprezentowalny zakonczony odmowa (rozplywu, adaptera albo
    # rdzenia) oraz przypadek NIEreprezentowalny (dwa odbiory szyny o roznych `k` przy
    # `f0 != f_studium`), ktory NIE skonczyl sie odmowa nazwana rozplywu.
    "G22_przypadki_z_odmowa": 0.0,
    "G22_niereprezentowalne_bez_odmowy": 0.0,
    # G23 — CHARAKTERYSTYKA Z PRZEJSCIEM PQ -> Z (D-23), uklad dwuwezlowy. Napiecie wezla
    # odbioru w oknie zwarcia wobec postaci zamknietej: tolerancja Newtona biegu 1e-11,
    # uwarunkowanie ~1, wiec 1e-10 pu to zapas 10x; admitancja bez sprzezenia, skalowanie
    # S(v0) albo czynnik f poza galezia impedancyjna daja bledy rzedu 1e-2.
    "G23_blad_napiecia_pu": 1.0e-10,
    # Tozsamosc probkowa: kanal poboru = charakterystyka zapisana od nowa w wyroczni przy
    # |V| i f z tej samej probki — te same liczby dwiema drogami, 1e-12 wzglednie.
    "G23_tozsamosc_mocy_wzgl": 1.0e-12,
    # Ciaglosc mocy w U_min: S(U_min) - S(U_min - ulp). Pochodna jest ograniczona, wiec
    # roznica jest rzedu ulp; 1e-12 pu to zapas ~1e4. Skok wynika wylacznie z bledu
    # odniesienia galezi impedancyjnej (M41: rzad 1e-1).
    "G23_ciaglosc_mocy_w_napieciu_przejscia_pu": 1.0e-12,
    # Predykaty (0,0): kod `tryb_odbioru@` niezgodny z predykatem |V| < U_min wyroczni; bieg
    # zakonczony odmowa (zwarcie metaliczne w wezle odbioru MA sie liczyc — V = 0, pobor 0).
    "G23_niezgodnosci_trybu": 0.0,
    "G23_biegi_z_odmowa": 0.0,
    # G24 — SAMOREGULACJA WYSPY (D-24), uklad zredukowany calkowany DOP853 (rtol 1e-12).
    # Blad trajektorii dw i dw_hat na 20 s wobec |dw_inf|: trapez rzedu 2, dt = 1e-3 s, mod
    # szybki lambda ~ -9,7 1/s o amplitudzie ~3e-3 w dw_hat => (lambda dt)^2/12 x amplituda
    # ~ 2e-8 bezwzglednie w szczycie przejscia, zmierzone 2026-09-25: 5,1e-10 pu dla dw_hat
    # (1,0e-7 wzgl.). Prog karty 1e-6 wzgl. (zapas ~10x); estymator bez `w_n`, zly znak albo
    # zly czlon `psi'` daja bledy rzedu 1e-2 wzgl.
    "G24_blad_trajektorii_wzgl": 1.0e-6,
    # Rzad metody zmierzony: e(dt)/e(dt/2) na pierwszych 2 s (dt = 1e-3 s i 5e-4 s). Trapez
    # ma rzad 2, wiec stosunek 4; karta dopuszcza [3,5; 4,5] — pomiarem jest |stosunek - 4|
    # z progiem 0,5. Zmierzone 2026-09-25: 4,0025 (dw) i 4,00005 (dw_hat).
    "G24_odchylka_rzedu_metody": 0.5,
    # Skok w chwili zdarzenia: dw_hat w probce P skoku mocy bazowej wobec rownania skalarnego
    # `e+ = e- - (psi(e+; P0') - psi-)` (brentq). Algebra chwili zbiega do 1e-11 w pradach, a
    # e+ jest katem napiecia — zmierzone 7,2e-14 pu; prog karty 1e-12.
    "G24_blad_skoku_w_chwili_zdarzenia_pu": 1.0e-12,
    # Predykat (0,0) warunku wstepnego: absolutny kat szyny odbioru przechodzi w horyzoncie
    # przez +-pi (zmierzone 2026-09-25: 3 przejscia w 20 s — mod wolny -0,145 1/s ustala
    # dw_inf po ~7 s) — bez przejscia wzorzec nie sprawdzalby estymatora katowego tam, gdzie
    # roznica katow bez `arg(V e^{-jx})` sie zawija. Cztery i wiecej obrotow przypina test
    # `test_wiele_obrotow_kata_szyny_bez_poslizgu_estymatora` (skok +0,05 pu, 30 s).
    "G24_brak_przejscia_kata_przez_pi": 0.0,
    # Czestotliwosc szyny odbioru `f_hz@B` wobec `f_n (1 + dw - psi'(e) e'/w_n)` na STANIE Z
    # BIEGU (izoluje obserwable od calkowania, jak G7). Prog karty 1e-9 Hz; zmierzone
    # 7,1e-15 Hz = ulp(50 Hz). Prawa strona DAE bez wkladu stanu odbioru daje bledy ~1e-2 Hz.
    "G24_blad_czestotliwosci_szyny_hz": 1.0e-9,
    # Tozsamosc estymatora: `f_odbioru = f_n (1 + wrap(theta - x)/(w_n T_f))` z kanalow tej
    # samej probki; prog jak G7 (1e-12 Hz = ~140 ulp(50 Hz)), zmierzone 7,1e-15 Hz.
    "G24_tozsamosc_estymatora_hz": 1.0e-12,
    # Tozsamosc poboru przy przejsciu przez U_min z dw_hat != 0 (zwarcie w wezle odbioru
    # wyspy): kanal poboru = P0' F(f_odbioru) w(|V|) w obu galeziach; 1e-12 wzglednie jak G23.
    "G24_tozsamosc_poboru_wzgl": 1.0e-12,
    # Predykat (0,0) warunku wstepnego: bieg przejscia ma probki pod U_min z dw_hat != 0 —
    # inaczej tozsamosc poboru nie sprawdzalaby galezi impedancyjnej z czynnikiem f != 1.
    "G24_brak_przejscia_przez_u_min_z_odchylka": 0.0,
    # Ponowne zasilenie: w probce P chwili zasilenia estymator stoi na f_n DOKLADNIE
    # (`x := arg V+`); prog 0,0 Hz (predykat).
    "G24_estymator_po_ponownym_zasileniu_hz": 0.0,
    # Wartosci wlasne macierzy stanu rdzenia (`walidacja.malosygnalowa`) wobec pierwiastkow
    # `lambda^2 + lambda/tau + c/tau` oraz zer (sztywny obrot, stany stale maszyny); algebra
    # liniowa macierzy 5x5 o uwarunkowaniu ~1e2 — blad rzedu 1e-13, prog 1e-9 wzglednie
    # (wobec max|lambda|). Zly czlon `a` stalej tau albo brak sprzezenia estymatora z
    # moca daja bledy rzedu 1e-1.
    "G24_blad_wartosci_wlasnych_wzgl": 1.0e-9,
    # G25 — FAIL-CLOSED MODELU ODBIORU (D-25). Predykaty (0,0): przypadki macierzy, w ktorych
    # gotowosc i bieg rozstrzygaja inaczej (gotowa, a bieg odmawia; kod odmowy biegu spoza
    # kodow gotowosci; odmowa inna niz oczekiwana; surowy wyjatek), oraz pozycje tablicy
    # uzycia pol (spisanej niezaleznie od predykatu rdzenia) niezgodne z rdzeniem albo z kopia
    # materializacji katalogu.
    "G25_niezgodnosci_gotowosci_i_biegu": 0.0,
    "G25_niezgodnosci_tablicy_uzycia_pol": 0.0,
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
    odbiory = stanowisko.modele_odbiorow(
        (OdbiorDynamiki("L1", "ODB", 1.0, 0.2, charakterystyka=STALA_MOC),)
    )

    def probuj(tol: float, maxit: int, urzadzenia=(), stany=()) -> str:
        try:
            rozwiaz_algebre(
                model,
                odbiory,
                urzadzenia,
                stanowisko.stany_z_odbiorami(odbiory, stany),
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
#: Napiecie przejscia odbioru wzorca D-16 — DANA TESTU ponizej OBU pierwiastkow rownania
#: kwadratowego ukladu (0,954 i 0,0878 pu, `wyrocznia_zdarzen.napiecie_odbioru_stalej_mocy`),
#: wiec twierdzenie o pierwiastku wyzszym stalej mocy obowiazuje bez zmian. Galaz
#: impedancyjna daje przy tym TRZECIE rozwiazanie (|V| = 0,029 pu < U_min) — start Newtona od
#: zera (mutacja M36) trafia w nie, a nie w pierwiastek wyzszy.
U_MIN_G17_PU = 0.05
STALA_MOC_G17 = charakterystyka_stalej_mocy(u_min_pu=U_MIN_G17_PU)


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
            odbiory=(
                OdbiorDynamiki(
                    "ODB",
                    "L",
                    MOC_ODBIORU_G17.real,
                    MOC_ODBIORU_G17.imag,
                    charakterystyka=STALA_MOC_G17,
                ),
            ),
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


# --------------------------------------------------------------------------- AB-1b.1 P6-P8
#: Czestotliwosc i baza ukladu wzorcow P6-P8 (te same, co w `stanowisko`).
F_N_HZ = stanowisko.F_BAZOWA_HZ


def siec_zrodla_testowego(impedancja_pu: complex | None) -> dict:
    """Zrodlo testowe w SRC -> linia -> odbior stalej mocy w ODB; punkt pracy dokladny.

    Napiecie SRC = 1,0 pu (dla zrodla idealnego rowne SEM); napiecie ODB z rownania wezla
    rozwiazanego iteracja punktu stalego do zbieznosci w arytmetyce (odbior stalej mocy).
    """
    from network_model.solvers.dynamika.urzadzenia import zbuduj_zrodlo_testowe

    wezly = (WezelDynamiki("SRC", stanowisko.U_N_KV), WezelDynamiki("ODB", stanowisko.U_N_KV))
    y_linii = 1.0 / complex(0.01, 0.05)
    galezie = (GalazDynamiki("L", "SRC", "ODB", y_linii, 0.0, 1 + 0j, True, "linia"),)
    odbior = complex(0.3, 0.1)
    v_src = complex(1.0, 0.0)
    v_odb = complex(1.0, 0.0)
    for _ in range(200):
        v_odb = (-odbior.conjugate() / v_odb.conjugate() + y_linii * v_src) / y_linii
    prad_src = (v_src - v_odb) * y_linii
    zrodlo = zbuduj_zrodlo_testowe(
        ident="ZT", wezel="SRC", impedancja_pu=impedancja_pu, f_bazowa_hz=F_N_HZ
    )
    return {
        "wezly": wezly,
        "galezie": galezie,
        "odbiory": (
            OdbiorDynamiki("O1", "ODB", odbior.real, odbior.imag, charakterystyka=STALA_MOC),
        ),
        "urzadzenia": (zrodlo,),
        "punkt_pracy": PunktPracy(
            {"SRC": v_src, "ODB": v_odb}, {"ZT": v_src * prad_src.conjugate()}
        ),
        "sem_0": v_src if impedancja_pu is None else v_src + impedancja_pu * prad_src,
    }


def _stosunek_do_tolerancji(blad_s: float, tolerancja_s: float, t_s: float) -> float:
    """|blad| / (tolerancja + ulp(t)) — prog lokalizacji kontraktu D-12 jako stosunek."""
    return abs(blad_s) / (tolerancja_s + math.ulp(t_s))


def g14_lokalizacja_zdarzen_warunkowych() -> dict[str, float]:
    """Lokalizacja i wykonanie zdarzen warunkowych (D-12) wobec postaci zamknietych.

    (a) Rampa amplitudy zrodla idealnego (1,0 -> tempo -0,4 pu/s od 0,2 s) przez prog
        0,85: `t_true` z postaci zamknietej, trajektoria dyskretna bez bledu (D-14), wiec
        |t* - t_true| <= tolerancja + ulp — dla detektora i dla chwili WYKONANIA akcji
        (zatrzymanie rampy), tolerancje 1e-6 i 1e-9 s, trapez i RK4.
    (b) Czlon inercyjny `dx/dt = (1 - x)/T` przez prog 0,6: pierwiastek TRAJEKTORII
        DYSKRETNEJ trapezu w postaci zamknietej; |t* - t_dyskretne| <= tolerancja + ulp.
    (c) Kierunek: dozor `w_dol` pobudza sie wylacznie na zboczu opadajacym (liczba pobudzen
        niezgodnych z oczekiwanymi — predykat).
    (d) Zwloka 0,3 s przy zapadzie 0,25 s: z kasowaniem akcja NIE wykonuje sie, bez
        kasowania — wykonuje sie w t* + 0,3 s (liczba niezgodnosci — predykat).
    """
    from network_model.solvers.dynamika import PrzypisanieStanu
    from network_model.solvers.dynamika.dozory import Dozor, ModulNapieciaWezla, StanUrzadzenia
    from network_model.solvers.dynamika.urzadzenia import RampaNapiecia, rozwin_profil

    from .wyrocznia_zdarzen import (
        chwila_przeciecia_rampy,
        pierwiastek_kroku_trapezu,
        wezel_trajektorii_trapezu,
    )

    stosunek = 0.0
    niezgodne_kierunki = 0
    niezgodne_kasowania = 0
    uklad = siec_zrodla_testowego(None)
    zatrzymaj = (
        PrzypisanieStanu(t_s=0.0, urzadzenie="ZT", stan="sem_modul_tempo_pu_na_s", wartosc=0.0),
    )
    # Rampa 0,2-0,7 s (1,0 -> 0,8 pu) przecina prog 0,85 w 0,575 s i konczy sie PRZED
    # horyzontem 1 s (segment profilu poza horyzontem to odmowa rozwiniecia harmonogramu).
    rampa = rozwin_profil("ZT", (RampaNapiecia(0.2, -0.4, 0.5),), f_bazowa_hz=F_N_HZ)
    t_true = chwila_przeciecia_rampy(1.0, 0.2, -0.4, 0.85)
    for tolerancja in (1e-6, 1e-9):
        for integrator in ("trapez_niejawny", "rk4_jawny"):
            dozory = (
                Dozor("detektor", ModulNapieciaWezla("SRC"), 0.85, "w_dol", 0.0, False, (), False),
                Dozor(
                    "akcja", ModulNapieciaWezla("SRC"), 0.85, "w_dol", 0.0, False, zatrzymaj, True
                ),
            )
            wynik = stanowisko.uruchom(
                uklad,
                rampa,
                dozory,
                horyzont_s=1.0,
                dt_s=0.01,
                krok_wyjscia_s=0.05,
                integrator=integrator,
                tolerancja_lokalizacji_zdarzen_s=tolerancja,
            )
            przekroczenia = [(p.dozor, p.kierunek) for p in wynik.przekroczenia]
            niezgodne_kierunki += int(przekroczenia != [("detektor", "w_dol")])
            for przekroczenie in wynik.przekroczenia:
                stosunek = max(
                    stosunek,
                    _stosunek_do_tolerancji(przekroczenie.t_s - t_true, tolerancja, t_true),
                )
            akcje = [z for z in wynik.zdarzenia_wykonane if z.przyczyna == "dozor:akcja"]
            niezgodne_kierunki += int(len(akcje) != 1)
            for akcja in akcje:
                stosunek = max(
                    stosunek,
                    _stosunek_do_tolerancji(akcja.t_wykonany_s - t_true, tolerancja, t_true),
                )
    # (b) czlon inercyjny: trapez, krok staly 0,01 s, T = 0,05 s.
    stala, krok, prog = 0.05, 0.01, 0.6
    for tolerancja in (1e-6, 1e-9):
        wynik = _bieg_czlonu_inercyjnego(stala, krok, prog, tolerancja)
        (przekroczenie,) = wynik.przekroczenia
        n = int(przekroczenie.t_s // krok)
        x_n = wezel_trajektorii_trapezu(0.0, 1.0, stala, krok, n)
        t_dyskretne = n * krok + pierwiastek_kroku_trapezu(x_n, 1.0, stala, prog)
        stosunek = max(
            stosunek,
            _stosunek_do_tolerancji(przekroczenie.t_s - t_dyskretne, tolerancja, t_dyskretne),
        )
    # (d) zapad krotszy niz zwloka.
    zapad = rozwin_profil(
        "ZT", (RampaNapiecia(0.2, -0.4, 0.5), RampaNapiecia(0.7, 0.4, 0.5)), f_bazowa_hz=F_N_HZ
    )
    for kasowanie, oczekiwane in ((True, 0), (False, 1)):
        wynik = stanowisko.uruchom(
            uklad,
            zapad,
            (
                Dozor(
                    "zwloka",
                    ModulNapieciaWezla("SRC"),
                    0.85,
                    "w_dol",
                    0.3,
                    kasowanie,
                    zatrzymaj,
                    True,
                ),
            ),
            horyzont_s=1.3,
            dt_s=0.01,
            krok_wyjscia_s=0.05,
            tolerancja_lokalizacji_zdarzen_s=1e-9,
        )
        akcje = [z for z in wynik.zdarzenia_wykonane if z.przyczyna == "dozor:zwloka"]
        niezgodne_kasowania += int(len(akcje) != oczekiwane)
        for akcja in akcje:
            stosunek = max(
                stosunek,
                _stosunek_do_tolerancji(akcja.t_wykonany_s - (t_true + 0.3), 1e-9, t_true + 0.3),
            )
    _ = StanUrzadzenia  # wielkosc stanu uzyta w (b) przez `_bieg_czlonu_inercyjnego`
    return {
        "G14_blad_lokalizacji_wzgl_tolerancji": float(stosunek),
        "G14_pobudzenia_niezgodne_z_kierunkiem": float(niezgodne_kierunki),
        "G14_akcje_niezgodne_z_kasowaniem": float(niezgodne_kasowania),
    }


class CzlonInercyjny:
    """Atrapa urzadzenia `dx/dt = (x_inf - x)/T` bez sprzezenia z siecia (prad zerowy).

    Stan `x_pu` jest zadeklarowany jako bez rownowagi (startuje z x_0 != x_inf), wiec bramka
    rownowagi go nie wymaga. Rownanie liniowe: jeden krok trapezu dlugosci `tau` ma postac
    zamknieta (`wyrocznia_zdarzen.pierwiastek_kroku_trapezu`).
    """

    POLA_POZA_ODCISKIEM: tuple = ()

    def __init__(self, stala_czasowa_s: float) -> None:
        self.ident = "LAG"
        self.wezel = "SYS"
        self.stala_czasowa_s = stala_czasowa_s

    sprzezenie = "pradowe"
    nazwy_stanow = ("x_pu",)
    granice_stanow = (None,)
    zakresy_waznosci = (None,)
    stany_bez_rownowagi = ("x_pu",)
    stany_przypisywalne: tuple[str, ...] = ()
    agregat_jednostek = False

    @property
    def nastawy_regulacji(self) -> tuple:
        from network_model.solvers.dynamika.kontrakty import WIELKOSCI_NASTAW, NastawaRegulacji

        return tuple(
            NastawaRegulacji(wielkosc, None, "atrapa bez regulatora", None, 1.0)
            for wielkosc in WIELKOSCI_NASTAW
        )

    def parametry_tozsamosci(self) -> dict:
        return {"stala_czasowa_s": self.stala_czasowa_s}

    def stan_poczatkowy(self, napiecie_pu: complex, moc_pu: complex) -> np.ndarray:
        return np.array([0.0])

    def pochodne(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        return np.array([(1.0 - float(stan[0])) / self.stala_czasowa_s])

    def jakobian_stan_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        return np.array([[-1.0 / self.stala_czasowa_s]])

    def jakobian_stan_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        return np.zeros((1, 2))

    def prad_pu(self, stan: np.ndarray, napiecie_pu: complex) -> complex:
        return 0j

    def jakobian_prad_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        return np.zeros((2, 2))

    def jakobian_prad_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        return np.zeros((2, 1))

    def napiecie_bez_obciazenia(self, stan: np.ndarray) -> complex:
        return 0j

    def jakobian_napiecia_bez_obciazenia(self, stan: np.ndarray) -> np.ndarray:
        return np.zeros((2, 1))


def _bieg_czlonu_inercyjnego(stala: float, krok: float, prog: float, tolerancja: float):
    from network_model.solvers.dynamika.dozory import Dozor, StanUrzadzenia

    uklad = stanowisko.zbuduj()
    wejscie = WejscieDynamiki(
        wezly=uklad["wezly"],
        galezie=uklad["galezie"],
        odsprzegi=(),
        odbiory=(),
        urzadzenia=(*uklad["urzadzenia"], CzlonInercyjny(stala)),
        punkt_pracy=PunktPracy(
            dict(uklad["punkt_pracy"].napiecia_pu),
            {**uklad["punkt_pracy"].moce_zrodel_pu, "LAG": 0j},
        ),
        harmonogram=HarmonogramDynamiki(
            (),
            (Dozor("lag", StanUrzadzenia("LAG", "x_pu"), prog, "w_gore", 0.0, False, (), True),),
        ),
        nastawy=stanowisko.nastawy(
            dt_s=krok,
            horyzont_s=0.2,
            krok_wyjscia_s=krok,
            tolerancja_lokalizacji_zdarzen_s=tolerancja,
        ),
        s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
        f_bazowa_hz=F_N_HZ,
    )
    return SilnikDynamiki(wejscie).uruchom()


#: Profil sondy 7 karty: skok U 1,0 -> 0,5 pu w 0,2 s; rampa 0,5 -> 0,9 pu od 1,0 s z tempem
#: 0,4 pu/s; skok fazy 30 st. w 1,5 s; rampa f 0,5 Hz/s przez 1 s od 2,0 s.
def _profil_sondy_7():
    from network_model.solvers.dynamika.urzadzenia import (
        RampaCzestotliwosci,
        RampaNapiecia,
        SkokFazy,
        SkokNapiecia,
    )

    return (
        SkokNapiecia(0.2, 0.5),
        RampaNapiecia(1.0, 0.4, 1.0),
        SkokFazy(1.5, 30.0),
        RampaCzestotliwosci(2.0, 0.5, 1.0),
    )


#: Te same segmenty w zapisie wyroczni (rodzaj, t, wartosc, czas trwania) — wpisane jawnie.
PROFIL_SONDY_7_WYROCZNIA = (
    ("skok_u", 0.2, 0.5, 0.0),
    ("rampa_u", 1.0, 0.4, 1.0),
    ("skok_fazy", 1.5, 30.0, 0.0),
    ("rampa_f", 2.0, 0.5, 1.0),
)


def g15_zrodlo_testowe() -> dict[str, float]:
    """Zrodlo testowe (D-14): |E|, theta + phi, dw wobec postaci zamknietej odcinkami
    wielomianowej (zrodlo idealne i za impedancja, trapez i RK4); dla Z = 0 napiecie wezla
    = |E| po kwantyzacji do 9 cyfr, a `f_hz` probek C = f_n (1 + dw)."""
    from network_model.solvers.dynamika.urzadzenia import rozwin_profil

    from .wyrocznia_zdarzen import profil_zamkniety

    blad = 0.0
    niezgodne_napiecia = 0
    blad_f = 0.0
    for impedancja in (None, complex(0.001, 0.02)):
        uklad = siec_zrodla_testowego(impedancja)
        sem_0 = complex(uklad["sem_0"])
        for integrator in ("trapez_niejawny", "rk4_jawny"):
            wynik = stanowisko.uruchom(
                uklad,
                rozwin_profil("ZT", _profil_sondy_7(), f_bazowa_hz=F_N_HZ),
                horyzont_s=3.5,
                dt_s=0.01,
                krok_wyjscia_s=0.05,
                integrator=integrator,
            )
            probki = wynik.probki
            for i, (t, strona) in enumerate(
                zip(wynik.os_czasu_s, wynik.strona_probki, strict=True)
            ):
                m, kat, odchylka = profil_zamkniety(
                    PROFIL_SONDY_7_WYROCZNIA,
                    m_0=abs(sem_0),
                    kat_0_rad=cmath.phase(sem_0),
                    f_n_hz=F_N_HZ,
                    t_s=t,
                    strona=strona,
                )
                kat_produktu = (
                    probki["sem_kat_rad@ZT"][i] + probki["sem_przesuniecie_fazy_rad@ZT"][i]
                )
                blad = max(
                    blad,
                    abs(probki["sem_modul_pu@ZT"][i] - m) / abs(m),
                    abs(kat_produktu - kat) / max(abs(kat), 1.0),
                    abs(probki["odchylka_pulsacji_pu@ZT"][i] - odchylka),
                )
                if impedancja is None:
                    niezgodne_napiecia += int(
                        f"{probki['u_pu@SRC'][i]:.9g}" != f"{probki['sem_modul_pu@ZT'][i]:.9g}"
                    )
                    if strona == "C":
                        blad_f = max(
                            blad_f,
                            abs(
                                probki["f_hz@SRC"][i]
                                - F_N_HZ * (1.0 + probki["odchylka_pulsacji_pu@ZT"][i])
                            ),
                        )
    return {
        "G15_blad_postaci_zamknietej_wzgl": float(blad),
        "G15_napiecie_wezla_rozne_od_sem": float(niezgodne_napiecia),
        "G15_blad_czestotliwosci_zrodla_idealnego_hz": float(blad_f),
    }


#: Skoki P_m wzorca D-13: w 0,2 s (uklad w rownowadze) i w 0,7 s (w trakcie wahan).
SKOKI_P_M_D13 = ((0.2, 0.9), (0.7, 0.75))


def g18_przypisanie_stanu() -> dict[str, float]:
    """Przypisanie stanu (D-13): stany nieprzypisane BITOWO ciagle, przypisany = zadany,
    algebra po przypisaniu rozwiazana, trajektoria kata wobec niezaleznego `solve_ivp`."""
    from network_model.solvers.dynamika import PrzypisanieStanu

    zdarzenia = tuple(
        PrzypisanieStanu(t_s=t, urzadzenie="G1", stan="p_mechaniczna_pu", wartosc=p)
        for t, p in SKOKI_P_M_D13
    )
    wynik = stanowisko.uruchom(
        stanowisko.zbuduj(), zdarzenia, horyzont_s=1.5, dt_s=5e-4, krok_wyjscia_s=5e-3
    )
    skok = max(z.delta_x_nieprzypisane_max for z in wynik.zdarzenia_wykonane)
    blad_wartosci = max(
        abs(z.przypisania[0].po - p)
        for z, (_, p) in zip(wynik.zdarzenia_wykonane, SKOKI_P_M_D13, strict=True)
    )
    residuum = max(z.residuum_kcl_max for z in wynik.zdarzenia_wykonane)
    t = stanowisko.czas(wynik, strony=stanowisko.SIATKA_PRAWOSTRONNA)
    delta = stanowisko.szereg(wynik, "delta_rad@G1", strony=stanowisko.SIATKA_PRAWOSTRONNA)
    wyrocznia = UkladSMIB().calkuj(horyzont_s=1.5, czasy_wyjscia=t, skoki_p_m=SKOKI_P_M_D13)
    return {
        "G18_skok_stanow_nieprzypisanych": float(skok),
        "G18_blad_wartosci_przypisanej": float(blad_wartosci),
        "G18_residuum_algebry_po_przypisaniu": float(residuum),
        "G18_blad_trajektorii_po_przypisaniu_rad": float(
            np.max(np.abs(delta - wyrocznia["delta"]))
        ),
    }


def _uklad_agregatu(dwie_polowy: bool, rodzina: str):
    """GFL (statyzmy zerowe) albo maszyna klasyczna na szynie GEN z szyna sztywna w SYS:
    jeden agregat albo dwie identyczne polowy (baza znamionowa polowy)."""
    from tests.network_model.dynamika import biblioteka_urzadzen as b

    if rodzina == "gfl":

        def urzadzenie(ident: str, s_n: float):
            return b.przeksztaltnik_gfl(
                ident=ident, s_n_mva=s_n, droop_p_f_pu=0.0, droop_q_u_pu=0.0
            )

        s_n, p_pu = 30.0, 0.25
    else:

        def urzadzenie(ident: str, s_n: float):
            return zbuduj_maszyne_klasyczna(
                ident=ident,
                wezel="GEN",
                s_n_mva=s_n,
                h_s=3.5,
                d_pu=0.0,
                x_prim_pu=0.3,
                ra_pu=0.0,
                s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
                f_bazowa_hz=F_N_HZ,
            )

        s_n, p_pu = 100.0, 0.8
    podstawa = b.zloz_uklad(urzadzenie("A", s_n), p_pu=p_pu)
    moc = podstawa.moc_gen_pu
    if not dwie_polowy:
        urzadzenia = (podstawa.urzadzenie, podstawa.szyna)
        moce = {"A": moc}
    else:
        urzadzenia = (urzadzenie("B1", s_n / 2.0), urzadzenie("B2", s_n / 2.0), podstawa.szyna)
        moce = {"B1": moc / 2.0, "B2": moc / 2.0}
    return WejscieDynamiki(
        wezly=podstawa.wezly,
        galezie=podstawa.galezie,
        odsprzegi=(),
        odbiory=(),
        urzadzenia=urzadzenia,
        punkt_pracy=PunktPracy(
            dict(podstawa.punkt_pracy.napiecia_pu),
            {**moce, "SYS1": podstawa.punkt_pracy.moce_zrodel_pu["SYS1"]},
        ),
        harmonogram=HarmonogramDynamiki(()),
        nastawy=stanowisko.nastawy(dt_s=1e-3, horyzont_s=0.6, krok_wyjscia_s=5e-3),
        s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
        f_bazowa_hz=F_N_HZ,
    )


def zmierz_rownowaznosc_agregatu(rodzina: str) -> float:
    """D-20 (a): agregat z udzialem 0,5 == dwie identyczne polowy z odlaczeniem jednej."""
    import dataclasses

    from network_model.solvers.dynamika import OdlaczenieZrodla, UtrataCzesciowaZrodla

    agregat = dataclasses.replace(
        _uklad_agregatu(False, rodzina),
        harmonogram=HarmonogramDynamiki(
            (UtrataCzesciowaZrodla(t_s=0.2, zrodlo="A", udzial_pozostaly=0.5),)
        ),
    )
    polowy = dataclasses.replace(
        _uklad_agregatu(True, rodzina),
        harmonogram=HarmonogramDynamiki((OdlaczenieZrodla(t_s=0.2, zrodlo="B2"),)),
    )
    a = SilnikDynamiki(agregat).uruchom()
    p = SilnikDynamiki(polowy).uruchom()
    assert a.os_czasu_s == p.os_czasu_s and a.strona_probki == p.strona_probki
    blad = 0.0
    for i, t in enumerate(a.os_czasu_s):
        for wezel in ("GEN", "SYS"):
            va = cmath.rect(
                a.probki[f"u_pu@{wezel}"][i], math.radians(a.probki[f"kat_deg@{wezel}"][i])
            )
            vp = cmath.rect(
                p.probki[f"u_pu@{wezel}"][i], math.radians(p.probki[f"kat_deg@{wezel}"][i])
            )
            blad = max(blad, abs(va - vp) / abs(va))
        po_utracie = t > 0.2 or (t == 0.2 and a.strona_probki[i] == "P")
        moc_p = p.probki["p_pu@B1"][i] + (0.0 if po_utracie else p.probki["p_pu@B2"][i])
        moc_q = p.probki["q_pu@B1"][i] + (0.0 if po_utracie else p.probki["q_pu@B2"][i])
        blad = max(
            blad,
            abs(complex(a.probki["p_pu@A"][i], a.probki["q_pu@A"][i]) - complex(moc_p, moc_q))
            / abs(complex(a.probki["p_pu@A"][i], a.probki["q_pu@A"][i])),
        )
    return blad


#: Wyspa D-20 (b): dwie maszyny klasyczne (A, B), przeksztaltnik nadazny (C), odbiory jako
#: admitancje. Parametry wpisane jawnie po stronie wzorca i wyroczni.
WYSPA_D20 = {
    "maszyny": (
        ("GA", "A", 3.0, 0.3, cmath.rect(1.05, 0.2)),
        ("GB", "B", 5.0, 0.25, cmath.rect(1.03, 0.1)),
    ),
    "linie": (("AC", "A", "C", 0.02, 0.2), ("BC", "B", "C", 0.015, 0.15)),
    "odbiory": (("OC", "C", 0.9, -0.2), ("OA", "A", 0.3, -0.05)),
    "prad_pv": complex(0.2, -0.05),
    "udzial": 0.6,
}


def g21_utrata_czesciowa() -> dict[str, float]:
    """Czesciowa utrata zrodla (D-20): (a) rownowaznosc agregatu (GFL i maszyna klasyczna);
    (b) przyspieszenie kazdej maszyny wyspy w t = 0+ po utracie 40 % pradu PV wobec algebry
    wyroczni (siec liniowa: maszyny jako SEM za X', PV jako zrodlo pradu, odbiory jako
    admitancje) oraz przyspieszenie srodka bezwladnosci `-dP / (2 sum H)`."""
    from network_model.solvers.dynamika import UtrataCzesciowaZrodla

    from tests.network_model.dynamika import biblioteka_urzadzen as b

    rownowaznosc = max(zmierz_rownowaznosc_agregatu(r) for r in ("gfl", "maszyna_klasyczna"))

    wezly = ("A", "B", "C")
    galezie = tuple(
        GalazPi(od, do, 1.0 / complex(r, x), 0.0) for _, od, do, r, x in WYSPA_D20["linie"]
    )
    boczniki = tuple((wezel, complex(g, b_)) for _, wezel, g, b_ in WYSPA_D20["odbiory"])
    nortony = tuple(
        ZrodloNortona(wezel, sem, 1.0 / complex(0.0, x))
        for _, wezel, _, x, sem in WYSPA_D20["maszyny"]
    )
    prad_pv = complex(WYSPA_D20["prad_pv"])
    przed = rozwiaz_siec_liniowa(
        wezly, galezie, boczniki, nortony, zrodla_pradowe=(("C", prad_pv),)
    )
    po = rozwiaz_siec_liniowa(
        wezly, galezie, boczniki, nortony, zrodla_pradowe=(("C", WYSPA_D20["udzial"] * prad_pv),)
    )

    def moc_maszyny(napiecia: dict[str, complex], wezel: str, sem: complex, x: float) -> float:
        return float((sem * ((sem - napiecia[wezel]) / complex(0.0, x)).conjugate()).real)

    urzadzenia = []
    moce = {}
    for ident, wezel, h, x, sem in WYSPA_D20["maszyny"]:
        urzadzenia.append(
            zbuduj_maszyne_klasyczna(
                ident=ident,
                wezel=wezel,
                s_n_mva=stanowisko.S_BAZOWA_MVA,
                h_s=h,
                d_pu=0.0,
                x_prim_pu=x,
                ra_pu=0.0,
                s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
                f_bazowa_hz=F_N_HZ,
            )
        )
        prad = (sem - przed[wezel]) / complex(0.0, x)
        moce[ident] = przed[wezel] * prad.conjugate()
    urzadzenia.append(b.przeksztaltnik_gfl(ident="PV", wezel="C"))
    moce["PV"] = przed["C"] * prad_pv.conjugate()
    wejscie = WejscieDynamiki(
        wezly=tuple(WezelDynamiki(w, stanowisko.U_N_KV) for w in wezly),
        galezie=tuple(
            GalazDynamiki(ident, od, do, 1.0 / complex(r, x), 0.0, 1 + 0j, True, "linia")
            for ident, od, do, r, x in WYSPA_D20["linie"]
        ),
        odsprzegi=tuple(
            OdsprzegDynamiki(ident, wezel, g, b_, True)
            for ident, wezel, g, b_ in WYSPA_D20["odbiory"]
        ),
        odbiory=(),
        urzadzenia=tuple(urzadzenia),
        punkt_pracy=PunktPracy(dict(przed), moce),
        harmonogram=HarmonogramDynamiki(
            (UtrataCzesciowaZrodla(t_s=0.0, zrodlo="PV", udzial_pozostaly=WYSPA_D20["udzial"]),)
        ),
        nastawy=stanowisko.nastawy(dt_s=1e-3, horyzont_s=0.01, krok_wyjscia_s=1e-3),
        s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
        f_bazowa_hz=F_N_HZ,
    )
    wynik = SilnikDynamiki(wejscie).uruchom()
    i_p = stanowisko.indeks_probki(wynik, 0.0, "P")
    blad = 0.0
    suma_2h_rocof_produkt = 0.0
    dp = 0.0
    suma_h = 0.0
    for ident, wezel, h, x, sem in WYSPA_D20["maszyny"]:
        p_m = moc_maszyny(przed, wezel, sem, x)
        p_e = moc_maszyny(po, wezel, sem, x)
        wyrocznia = (p_m - p_e) / (2.0 * h)
        produkt = (
            wynik.probki[f"p_mechaniczna_pu@{ident}"][i_p] - wynik.probki[f"p_pu@{ident}"][i_p]
        ) / (2.0 * h)
        blad = max(blad, abs(produkt - wyrocznia) / abs(wyrocznia))
        suma_2h_rocof_produkt += 2.0 * h * produkt
        dp += p_e - p_m
        suma_h += h
    rocof_srodka = suma_2h_rocof_produkt / (2.0 * suma_h)
    blad_srodka = abs(rocof_srodka - (-dp / (2.0 * suma_h))) / abs(dp / (2.0 * suma_h))
    return {
        "G21_blad_rownowaznosci_agregatu_wzgl": float(rownowaznosc),
        "G21_blad_rocof_maszyn_po_utracie_wzgl": float(blad),
        "G21_blad_rocof_srodka_bezwladnosci_wzgl": float(blad_srodka),
    }


# --------------------------------------------------------------------------- odbiory (D-22..D-25)
#
# Wzorce twierdzen o modelu odbioru (karta modeli odbiorow). Wyrocznia: `wyrocznia_odbiorow`
# (zero importow z rdzenia); D-22 porownuje z rozplywem (FROZEN NR) i jego WLASNA
# implementacja wielomianu (`power_flow_zip`).

#: Hash migawki biegow rozplywu i dynamiki bramek G22/G25 — punkt pracy i bieg dotycza TEJ
#: SAMEJ migawki (adapter sprawdza zgodnosc hashy).
_HASH_MIGAWKI_ODBIOROW = "sha256:bramki-odbiorow"

#: Nastawy biegow G22/G25 na sieci G16 — te same, co testy adaptera (`test_adapter_dynamiki`).
_NASTAWY_SIECI_ODBIOROW: dict[str, object] = {
    "dt_s": 0.002,
    "dt_min_s": 0.002,
    "dt_max_s": 0.002,
    "tolerancja": 1.0e-10,
    "tolerancja_kroku": 1.0e-6,
    "eps_init": 1.0e-6,
    "max_iteracji_newtona": 40,
    "max_nawrotow": 30,
    "integrator": "trapez_niejawny",
    "tolerancja_lokalizacji_zdarzen_s": None,
}


def _opcje_sieci_odbiorow(horyzont_s: float) -> dict:
    return {
        "dynamika": {"horyzont_s": horyzont_s, "krok_wyjscia_s": 0.002, "zdarzenia": []},
        "nastawy_solvera": dict(_NASTAWY_SIECI_ODBIOROW),
    }


def _migawka_g16() -> dict:
    """Siec wzorcowa G16 z odbiorami zwiazanymi z profilem katalogu (ta sama operacja, co
    projektant na ekranie dynamiki) — postac, w jakiej niesie ja `CanonicalRun.snapshot`."""
    from enm.models import EnergyNetworkModel

    from tests.golden.enm_builders.dynamika_rms import build_dynamika_rms_enm

    return EnergyNetworkModel.model_validate(build_dynamika_rms_enm()).model_dump(mode="json")


def _rozplyw_i_punkt_pracy(snapshot: dict):
    """Bieg rozplywu (FROZEN NR przez `_execute_power_flow`) i punkt pracy z jego wyniku."""
    from datetime import UTC, datetime
    from uuid import UUID

    from enm.adapter_dynamiki import punkt_pracy_z_biegu_rozplywu
    from enm.canonical_analysis import CanonicalRun, _execute_power_flow

    bieg = CanonicalRun(
        id=UUID(int=22),
        case_id="bramki-odbiorow",
        project_id=None,
        analysis_type="PF",
        status="CREATED",
        created_at=datetime(2026, 9, 25, tzinfo=UTC),
        snapshot_hash=_HASH_MIGAWKI_ODBIOROW,
        input_hash="sha256:pf",
        snapshot=snapshot,
        validation={},
        readiness={},
        options={},
    )
    _execute_power_flow(bieg)
    bieg.status = "FINISHED"
    punkt = punkt_pracy_z_biegu_rozplywu(
        run_id=str(bieg.id),
        analysis_type=bieg.analysis_type,
        status=bieg.status,
        snapshot_hash=bieg.snapshot_hash,
        raw_result=bieg.raw_result,
        snapshot=snapshot,
        oczekiwany_snapshot_hash=_HASH_MIGAWKI_ODBIOROW,
    )
    return bieg, punkt


def _wejscie_biegu_produktu(snapshot: dict, opcje: dict, punkt):
    """Wejscie rdzenia w KOLEJNOSCI `canonical_analysis._execute_dynamika_rms`: bramka modelu
    (`braki_modelu_dynamiki`), kopia katalogowa aktualna, zlozenie wejscia przez adapter."""
    from enm.adapter_dynamiki import odmow_gdy_braki_modelu, zloz_wejscie_dynamiki
    from enm.assembler import czestotliwosc_studium_hz, zbuduj_graf
    from enm.dynamika_z_katalogu import odmow_gdy_kopia_nieaktualna
    from enm.models import EnergyNetworkModel

    odmow_gdy_braki_modelu(EnergyNetworkModel.model_validate(snapshot))
    odmow_gdy_kopia_nieaktualna(snapshot)
    return zloz_wejscie_dynamiki(
        snapshot,
        opcje,
        punkt=punkt,
        graph=zbuduj_graf(snapshot),
        f_bazowa_hz=czestotliwosc_studium_hz(snapshot),
    )


#: Ksztalty charakterystyki odbioru (wspolczynniki rozplywu w `materialized_params`). Wielomian
#: Q rozny od P w ksztalcie mieszanym — zamiana osi P/Q nie moze sie schowac.
_KSZTALTY_G22: dict[str, dict[str, float]] = {
    "stala_moc": {},
    "czysty_z": {"a_p": 1.0, "b_p": 0.0, "c_p": 0.0, "a_q": 1.0, "b_q": 0.0, "c_q": 0.0},
    "czysty_i": {"a_p": 0.0, "b_p": 1.0, "c_p": 0.0, "a_q": 0.0, "b_q": 1.0, "c_q": 0.0},
    "mieszany": {"a_p": 0.5, "b_p": 0.3, "c_p": 0.2, "a_q": 0.2, "b_q": 0.3, "c_q": 0.5},
}
#: Czulosc czestotliwosciowa: brak; `k` przy `f0` = czestotliwosc studium (pole nieobecne);
#: `k` przy jawnym `f0 != f_studium` (czynnik `F != 1` w punkcie pracy).
_CZULOSCI_G22: dict[str, dict[str, float]] = {
    "bez_czulosci": {},
    "k_f0_studium": {"k_pf": 1.5, "k_qf": -0.8},
    "k_f0_jawne": {"k_pf": 1.5, "k_qf": -0.8, "f0_hz": 49.0},
}
#: Rodzaj szyny odbioru: (szyna, odbior istniejacy albo None = nowy odbior, urzadzenie szyny).
_SZYNY_G22: dict[str, tuple[str, str | None, str | None]] = {
    "z_wytworca": ("b-sn-b", "odb-potrzeby", "gen-synchroniczny"),
    "same_odbiory": ("b-odplyw", "odb-odplyw", None),
    "ze_zrodlem_sieciowym": ("b-110", None, "zrodlo-110"),
}


def _dodaj_odbior(snapshot: dict, ref_id: str, szyna: str, p_mw: float, q_mvar: float) -> None:
    wzor = next(load for load in snapshot["loads"] if load["ref_id"] == "odb-odplyw")
    snapshot["loads"].append(
        {
            **copy.deepcopy(wzor),
            "ref_id": ref_id,
            "name": f"Odbiór bramki {ref_id}",
            "bus_ref": szyna,
            "p_mw": p_mw,
            "q_mvar": q_mvar,
        }
    )


def _przypadek_g22(
    szyna_rodzaj: str,
    ksztalt: str,
    czulosc: str,
    *,
    dwa_odbiory: bool,
    pole_model: str | None,
    czulosc_drugiego: str | None = None,
) -> tuple[dict, tuple[str, ...]]:
    """Migawka G16 z odbiorem (odbiorami) szyny o zadanym ksztalcie i czulosci — zwiazanymi
    z profilem katalogu i odswiezonymi TA SAMA synchronizacja, co odpowiedz operacji."""
    from enm.dynamika_z_katalogu import synchronizuj_dynamike_z_wiazan
    from enm.models import EnergyNetworkModel

    from tests.golden.enm_builders.odbiory_dynamiki import PROFIL_ODBIOROW_SIECI_WZORCOWYCH

    snapshot = _migawka_g16()
    szyna, istniejacy, _urzadzenie = _SZYNY_G22[szyna_rodzaj]
    if istniejacy is None:
        istniejacy = "odb-bramki-110"
        _dodaj_odbior(snapshot, istniejacy, szyna, 1.0, 0.3)
    refy = [istniejacy]
    if dwa_odbiory:
        _dodaj_odbior(snapshot, "odb-bramki-drugi", szyna, 0.3, 0.1)
        refy.append("odb-bramki-drugi")
    nazwy_ksztaltow = sorted(_KSZTALTY_G22)
    for numer, ref in enumerate(refy):
        # Drugi odbior szyny ma INNY ksztalt; czulosc ta sama (agregat reprezentowalny), chyba
        # ze przypadek jawnie bada agregat niereprezentowalny (`czulosc_drugiego`).
        ksztalt_odbioru = nazwy_ksztaltow[
            (nazwy_ksztaltow.index(ksztalt) + numer) % len(nazwy_ksztaltow)
        ]
        czulosc_odbioru = czulosc if numer == 0 else (czulosc_drugiego or czulosc)
        wpis = next(load for load in snapshot["loads"] if load["ref_id"] == ref)
        wpis["materialized_params"] = {
            **_KSZTALTY_G22[ksztalt_odbioru],
            **_CZULOSCI_G22[czulosc_odbioru],
            "dynamic_model_ref": PROFIL_ODBIOROW_SIECI_WZORCOWYCH,
        }
        wpis["model"] = pole_model
    snapshot = synchronizuj_dynamike_z_wiazan(snapshot)
    return EnergyNetworkModel.model_validate(snapshot).model_dump(mode="json"), tuple(refy)


def _moc_odbioru_rozplywu(load: dict, modul: float, base_mva: float, f_studium_hz: float):
    """Moc odbioru wg WIELOMIANU ROZPLYWU (`power_flow_zip`) — druga implementacja wzoru."""
    from network_model.solvers.power_flow_zip import (
        frequency_factor,
        zip_coeffs_from_materialized_params,
        zip_factor,
    )

    p0 = load["p_mw"] / base_mva
    q0 = load["q_mvar"] / base_mva
    wsp = zip_coeffs_from_materialized_params(load["materialized_params"], f_studium_hz)
    if wsp is None:
        return complex(p0, q0)
    return complex(
        p0
        * frequency_factor(wsp.k_pf, f_studium_hz, wsp.f0_hz)
        * zip_factor(wsp.a_p, wsp.b_p, wsp.c_p, modul, wsp.v0_pu),
        q0
        * frequency_factor(wsp.k_qf, f_studium_hz, wsp.f0_hz)
        * zip_factor(wsp.a_q, wsp.b_q, wsp.c_q, modul, wsp.v0_pu),
    )


def _przypadki_g22() -> list[tuple[str, str, str, bool, str | None]]:
    """Iloczyn cech D-22 (karta P4): rodzaj szyny x ksztalt x czulosc — pelny; liczba odbiorow
    szyny {1, 2} i pole `Load.model` {"pq", "zip"} przeplatane deterministycznie tak, ze
    KAZDA para (ksztalt, liczba) i (czulosc, model) wystepuje. `model = "pq"` przy
    wspolczynnikach ZIP to sonda S1 (dawny cichy blad mocy wytworcy 0,9 %)."""
    przypadki = []
    for numer, (szyna, ksztalt, czulosc) in enumerate(
        itertools.product(sorted(_SZYNY_G22), sorted(_KSZTALTY_G22), sorted(_CZULOSCI_G22))
    ):
        dwa = numer % 2 == 1
        model = ("pq", "zip")[(numer // 2) % 2]
        przypadki.append((szyna, ksztalt, czulosc, dwa, model))
    return przypadki


def g22_parytet_chwili_zerowej() -> dict[str, float | dict[str, str]]:
    """Parytet t = 0 rozplyw <-> dynamika (D-22) na torze rozplyw -> adapter -> rdzen.

    Dla kazdego przypadku iloczynu cech: (1) moc kazdego odbioru w punkcie pracy wg rdzenia
    wobec wielomianu rozplywu, (2) moc urzadzenia szyny wobec `S_net + sum S_odb^PF(V_pf)`,
    (3) residuum algebry w punkcie startowym biegu wobec `tol_PF / min|V_pf|`. Osobno
    przypadek NIEreprezentowalny (dwa odbiory szyny o roznych `k`, `f0 != f_studium`) — ma
    skonczyc sie odmowa nazwana rozplywu `load.zip_agregat_niereprezentowalny`.
    """
    from enm.assembler import czestotliwosc_studium_hz
    from enm.load_zip_model import KOD_ZIP_AGREGAT_NIEREPREZENTOWALNY
    from network_model.solvers.dynamika.odbiory import moc_poboru_w_punkcie_pracy

    blad_odbioru = 0.0
    blad_urzadzenia = 0.0
    residuum_wzgl = 0.0
    odmowy: dict[str, str] = {}
    for szyna_rodzaj, ksztalt, czulosc, dwa, pole_model in _przypadki_g22():
        etykieta = f"{szyna_rodzaj}/{ksztalt}/{czulosc}/{'dwa' if dwa else 'jeden'}/{pole_model}"
        snapshot, refy = _przypadek_g22(
            szyna_rodzaj, ksztalt, czulosc, dwa_odbiory=dwa, pole_model=pole_model
        )
        f_studium = czestotliwosc_studium_hz(snapshot)
        try:
            bieg_pf, punkt = _rozplyw_i_punkt_pracy(snapshot)
            wejscie = _wejscie_biegu_produktu(snapshot, _opcje_sieci_odbiorow(0.004), punkt)
        except Exception as blad:  # noqa: BLE001 — kazda odmowa przypadku reprezentowalnego
            odmowy[etykieta] = f"{type(blad).__name__}: {getattr(blad, 'kod', blad)}"
            continue
        # Moce PRZED biegiem rdzenia: bramka rownowagi rdzenia odmawia punktu z bledna moca
        # urzadzenia, a pomiar ma nazwac TEN blad, nie tylko odmowe.
        szyna = _SZYNY_G22[szyna_rodzaj][0]
        modul = abs(punkt.napiecia_pu[szyna])
        odbiory_rdzenia = {odbior.ident: odbior for odbior in wejscie.odbiory}
        loads = {load["ref_id"]: load for load in snapshot["loads"]}
        suma_rozplywu = 0j
        suma_modulow = abs(punkt.wstrzyki_pu[szyna])
        for ref in (load["ref_id"] for load in snapshot["loads"] if load["bus_ref"] == szyna):
            moc_pf = _moc_odbioru_rozplywu(loads[ref], modul, punkt.base_mva, f_studium)
            moc_rdzenia = moc_poboru_w_punkcie_pracy(
                odbiory_rdzenia[ref], punkt.napiecia_pu[szyna], f_studium
            )
            if ref in refy:
                blad_odbioru = max(blad_odbioru, abs(moc_rdzenia - moc_pf) / abs(moc_pf))
            suma_rozplywu += moc_pf
            suma_modulow += abs(moc_pf)
        urzadzenie = _SZYNY_G22[szyna_rodzaj][2]
        if urzadzenie is not None:
            moc_urzadzenia = wejscie.punkt_pracy.moce_zrodel_pu[urzadzenie]
            blad_urzadzenia = max(
                blad_urzadzenia,
                abs(moc_urzadzenia - (punkt.wstrzyki_pu[szyna] + suma_rozplywu)) / suma_modulow,
            )
        try:
            wynik = SilnikDynamiki(wejscie).uruchom()
        except Exception as blad:  # noqa: BLE001 — odmowa rdzenia w punkcie pracy
            odmowy[etykieta] = f"{type(blad).__name__}: {getattr(blad, 'kod', blad)}"
            continue
        tolerancja_pf = float(bieg_pf.raw_result["result_v1"]["tolerance_used"])
        min_modul = min(abs(v) for v in punkt.napiecia_pu.values())
        residuum = float(wynik.slad_white_box["inicjalizacja"]["residuum_g"])
        residuum_wzgl = max(residuum_wzgl, residuum / (tolerancja_pf / min_modul))

    snapshot, _refy = _przypadek_g22(
        "same_odbiory",
        "mieszany",
        "k_f0_jawne",
        dwa_odbiory=True,
        pole_model="zip",
        czulosc_drugiego="bez_czulosci",
    )
    try:
        _rozplyw_i_punkt_pracy(snapshot)
        niereprezentowalny = "BIEG BEZ ODMOWY"
    except Exception as blad:  # noqa: BLE001
        niereprezentowalny = str(getattr(blad, "kod", type(blad).__name__))
    return {
        "_odmowy_g22": odmowy,
        "_przypadki_g22": float(len(_przypadki_g22())),
        "_niereprezentowalny_g22": niereprezentowalny,
        "G22_blad_mocy_odbioru_wzgl": float(blad_odbioru),
        "G22_blad_mocy_urzadzenia_wzgl": float(blad_urzadzenia),
        "G22_residuum_rownowagi_wzgl_granicy": float(residuum_wzgl),
        "G22_przypadki_z_odmowa": float(len(odmowy)),
        "G22_niereprezentowalne_bez_odmowy": float(
            niereprezentowalny != KOD_ZIP_AGREGAT_NIEREPREZENTOWALNY
        ),
    }


#: Uklad dwuwezlowy D-23: szyna sztywna (SEM E za Z_s) — linia z_l — odbior.
_Z_S_D23 = complex(0.01, 0.10)
_Z_L_D23 = complex(0.02, 0.08)
_Y_D23 = 1.0 / (_Z_S_D23 + _Z_L_D23)
_E_D23 = complex(1.0, 0.0)
_P0_D23, _Q0_D23 = 0.3, 0.1
#: Napiecie przejscia wzorca — dana testu (wartosc profilu katalogu sieci SN, 0,7 pu).
_U_MIN_D23 = 0.7
_T_ZWARCIA_D23, _T_USUNIECIA_D23, _HORYZONT_D23 = 0.05, 0.15, 0.2
#: Ksztalty D-23: (wielomian P, wielomian Q, k_pf, k_qf, f0 [Hz] albo None, U_min, T_f).
_KSZTALTY_D23: dict[
    str,
    tuple[
        tuple[float, float, float],
        tuple[float, float, float],
        float,
        float,
        float | None,
        float | None,
        float | None,
    ],
] = {
    "stala_moc": ((0.0, 0.0, 1.0), (0.0, 0.0, 1.0), 0.0, 0.0, None, _U_MIN_D23, None),
    "czysty_i": ((0.0, 1.0, 0.0), (0.0, 1.0, 0.0), 0.0, 0.0, None, _U_MIN_D23, None),
    "mieszany_zip": ((0.5, 0.25, 0.25), (0.2, 0.3, 0.5), 0.0, 0.0, None, _U_MIN_D23, None),
    "czysty_z": ((1.0, 0.0, 0.0), (1.0, 0.0, 0.0), 0.0, 0.0, None, None, None),
    # Czynnik F != 1 przez jawne f0 != f_n (w obu galeziach) i estymator czestotliwosci.
    "mieszany_czuly": ((0.5, 0.25, 0.25), (0.2, 0.3, 0.5), 1.5, 1.0, 49.0, _U_MIN_D23, 0.1),
}


def _odbior_d23(ksztalt: str, *, u_min_pu: float | None = None):
    """(odbior rdzenia, ten sam odbior zapisany od nowa dla wyroczni)."""
    from network_model.solvers.dynamika.odbiory import charakterystyka_z_wielomianu

    from .wyrocznia_odbiorow import OdbiorWyroczni

    wielomian_p, wielomian_q, k_pf, k_qf, f0, u_min, t_f = _KSZTALTY_D23[ksztalt]
    if u_min_pu is not None:
        u_min = u_min_pu
    charakterystyka = charakterystyka_z_wielomianu(
        a_p=wielomian_p[0],
        b_p=wielomian_p[1],
        c_p=wielomian_p[2],
        a_q=wielomian_q[0],
        b_q=wielomian_q[1],
        c_q=wielomian_q[2],
        v0_pu=1.0,
        k_pf=k_pf,
        k_qf=k_qf,
        f0_hz=stanowisko.F_BAZOWA_HZ if f0 is None else f0,
        u_min_pu=u_min,
        t_pomiaru_czestotliwosci_s=t_f,
    )
    wyrocznia = OdbiorWyroczni(
        p0_pu=_P0_D23,
        q0_pu=_Q0_D23,
        wielomian_p=wielomian_p,
        wielomian_q=wielomian_q,
        v0_pu=1.0,
        k_pf=k_pf,
        k_qf=k_qf,
        f0_hz=stanowisko.F_BAZOWA_HZ if f0 is None else f0,
        u_min_pu=u_min,
    )
    return OdbiorDynamiki("O", "L", _P0_D23, _Q0_D23, charakterystyka), wyrocznia


def _uklad_d23(odbior: OdbiorDynamiki, wyrocznia, *, f_hz: float | None) -> dict:
    """Uklad dwuwezlowy w punkcie pracy z wyroczni (galaz charakterystyki, `Y_f = 0`)."""
    from .wyrocznia_odbiorow import napiecie_dwuwezlowe

    v_l = napiecie_dwuwezlowe(_E_D23, _Y_D23, 0j, wyrocznia, f_hz)
    prad = _Y_D23 * (_E_D23 - v_l)
    v_s = _E_D23 - _Z_S_D23 * prad
    szyna = zbuduj_szyne_sztywna(
        ident="SYS",
        wezel="S",
        s_zwarciowa_mva=stanowisko.S_BAZOWA_MVA,
        r_pu=_Z_S_D23.real,
        x_pu=_Z_S_D23.imag,
        s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
    )
    return {
        "wezly": (WezelDynamiki("S", stanowisko.U_N_KV), WezelDynamiki("L", stanowisko.U_N_KV)),
        "galezie": (
            GalazDynamiki("LSL", "S", "L", 1.0 / _Z_L_D23, 0.0, complex(1.0, 0.0), True, "linia"),
        ),
        "odbiory": (odbior,),
        "urzadzenia": (szyna,),
        "punkt_pracy": PunktPracy({"S": v_s, "L": v_l}, {"SYS": v_s * prad.conjugate()}),
    }


def _glebokosci_d23(ksztalt: str, wyrocznia) -> dict[str, float | None]:
    """Reaktancja zwarcia [Ohm] (None = metaliczne): plytka (galaz charakterystyki),
    DOKLADNIE na granicy `|V| = U_min` (admitancja `Y_f*` z wyroczni), gleboka, metaliczna."""
    from .wyrocznia_odbiorow import skala_admitancji_granicznej

    glebokosci: dict[str, float | None] = {"plytka": 2.0, "gleboka": 0.05, "metaliczna": None}
    if wyrocznia.u_min_pu is not None and wyrocznia.k_pf == 0.0 and wyrocznia.k_qf == 0.0:
        skala = skala_admitancji_granicznej(_E_D23, _Y_D23, complex(0.0, -1.0), wyrocznia, None)
        glebokosci["granica"] = stanowisko.Z_BAZOWA_OM / skala
    return glebokosci


def g23_przejscie_pq_z() -> dict[str, float | dict[str, str]]:
    """Charakterystyka z przejsciem PQ -> Z (D-23) wobec postaci zamknietej ukladu dwuwezlowego.

    Iloczyn: ksztalt {stala moc, czysty I, mieszany ZIP, czysty Z, mieszany czuly f z
    `f0 != f_n`} x glebokosc zwarcia {plytka, dokladnie U_min, gleboka, metaliczna}. W oknie
    zwarcia napiecie wezla odbioru wobec wyroczni (dla odbioru czulego — przy czestotliwosci
    widzianej z tej samej probki); w KAZDEJ probce kanal poboru wobec charakterystyki
    wyroczni i kod trybu wobec predykatu `|V| < U_min`; ciaglosc mocy w `U_min` z funkcji
    rdzenia. Zwarcie metaliczne w wezle odbioru jest biegiem (V = 0, pobor 0), nie odmowa.
    """
    from network_model.solvers.dynamika.odbiory import moc_poboru_pu

    from .wyrocznia_odbiorow import napiecie_dwuwezlowe

    blad_napiecia = 0.0
    tozsamosc = 0.0
    ciaglosc = 0.0
    niezgodnosci_trybu = 0
    odmowy: dict[str, str] = {}
    for ksztalt in sorted(_KSZTALTY_D23):
        odbior, wyrocznia = _odbior_d23(ksztalt)
        czuly = wyrocznia.k_pf != 0.0 or wyrocznia.k_qf != 0.0
        f_studium = stanowisko.F_BAZOWA_HZ if czuly else None
        if wyrocznia.u_min_pu is not None:
            for f_hz in (f_studium,) if not czuly else (f_studium, 50.3):
                gora = moc_poboru_pu(odbior, complex(wyrocznia.u_min_pu, 0.0), f_hz)
                dol = moc_poboru_pu(
                    odbior, complex(math.nextafter(wyrocznia.u_min_pu, 0.0), 0.0), f_hz
                )
                ciaglosc = max(ciaglosc, abs(gora - dol))
        for glebokosc, x_f_ohm in sorted(_glebokosci_d23(ksztalt, wyrocznia).items()):
            etykieta = f"{ksztalt}/{glebokosc}"
            uklad = _uklad_d23(odbior, wyrocznia, f_hz=f_studium)
            zwarcie = ZwarcieWezla(
                t_s=_T_ZWARCIA_D23,
                wezel="L",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=0.0 if x_f_ohm is None else x_f_ohm,
                t_usuniecia_s=_T_USUNIECIA_D23,
                sposob_usuniecia="samoczynne",
            )
            try:
                wynik = stanowisko.uruchom(
                    uklad, (zwarcie,), horyzont_s=_HORYZONT_D23, dt_s=1e-3, krok_wyjscia_s=1e-2
                )
            except Exception as blad:  # noqa: BLE001 — bieg MA sie liczyc przy kazdej glebokosci
                odmowy[etykieta] = f"{type(blad).__name__}: {getattr(blad, 'kod', blad)}"
                continue
            y_f = (
                None if x_f_ohm is None else 1.0 / (complex(0.0, x_f_ohm) / stanowisko.Z_BAZOWA_OM)
            )
            skala_mocy = abs(complex(_P0_D23, _Q0_D23))
            for i, (t, strona) in enumerate(
                zip(wynik.os_czasu_s, wynik.strona_probki, strict=True)
            ):
                modul = float(wynik.probki["u_pu@L"][i])
                kat = wynik.probki["kat_deg@L"][i]
                napiecie = 0j if kat is None else modul * cmath.exp(1j * math.radians(kat))
                f_odb = wynik.probki["f_odbioru_hz@O"][i] if czuly else None
                pobor = complex(wynik.probki["p_pobor_pu@O"][i], wynik.probki["q_pobor_pu@O"][i])
                tozsamosc = max(tozsamosc, abs(pobor - wyrocznia.moc(modul, f_odb)) / skala_mocy)
                tryb_oczekiwany = 1.0 if wyrocznia.w_galezi_impedancyjnej(modul) else 0.0
                niezgodnosci_trybu += int(wynik.probki["tryb_odbioru@O"][i] != tryb_oczekiwany)
                w_oknie = (_T_ZWARCIA_D23 < t < _T_USUNIECIA_D23 and strona == "C") or (
                    t == _T_ZWARCIA_D23 and strona == "P"
                )
                if w_oknie:
                    oczekiwane = napiecie_dwuwezlowe(_E_D23, _Y_D23, y_f, wyrocznia, f_odb)
                    blad_napiecia = max(blad_napiecia, abs(napiecie - oczekiwane))
    return {
        "_odmowy_g23": odmowy,
        "G23_blad_napiecia_pu": float(blad_napiecia),
        "G23_tozsamosc_mocy_wzgl": float(tozsamosc),
        "G23_ciaglosc_mocy_w_napieciu_przejscia_pu": float(ciaglosc),
        "G23_niezgodnosci_trybu": float(niezgodnosci_trybu),
        "G23_biegi_z_odmowa": float(len(odmowy)),
    }


#: Wyspa samoregulacji D-24: maszyna klasyczna (H, X'd, E') — linia X_L — odbior stalej mocy
#: czynnej czuly czestotliwosciowo (k_pf = 2, T_f = 0,1 s, U_min = 0,7 pu), skok +0,005 pu.
_H_D24, _XD_D24, _XL_D24, _E_D24, _P0_D24 = 3.5, 0.3, 0.3, 1.05, 0.5
_K_D24, _T_F_D24, _SKOK_D24 = 2.0, 0.1, 0.005


def _wyspa_d24(*, k_pf: float = _K_D24, t_f_s: float = _T_F_D24) -> dict:
    """Wyspa w rownowadze: `|V_B| = E' cos(psi)`, `sin 2psi = 2 X P0 / E'^2`, `Q0 = 0`."""
    from network_model.solvers.dynamika.odbiory import charakterystyka_z_wielomianu

    x = _XD_D24 + _XL_D24
    psi = 0.5 * math.asin(2.0 * x * _P0_D24 / _E_D24**2)
    v_b = complex(_E_D24 * math.cos(psi), 0.0)
    prad = complex(_P0_D24, 0.0).conjugate() / v_b.conjugate()
    v_g = v_b + 1j * _XL_D24 * prad
    maszyna = zbuduj_maszyne_klasyczna(
        ident="G",
        wezel="GEN",
        s_n_mva=stanowisko.S_BAZOWA_MVA,
        h_s=_H_D24,
        d_pu=0.0,
        x_prim_pu=_XD_D24,
        ra_pu=0.0,
        s_bazowa_mva=stanowisko.S_BAZOWA_MVA,
        f_bazowa_hz=stanowisko.F_BAZOWA_HZ,
    )
    charakterystyka = charakterystyka_z_wielomianu(
        a_p=0.0,
        b_p=0.0,
        c_p=1.0,
        a_q=0.0,
        b_q=0.0,
        c_q=1.0,
        v0_pu=1.0,
        k_pf=k_pf,
        k_qf=0.0,
        f0_hz=stanowisko.F_BAZOWA_HZ,
        u_min_pu=0.7,
        t_pomiaru_czestotliwosci_s=t_f_s,
    )
    return {
        "wezly": (WezelDynamiki("GEN", stanowisko.U_N_KV), WezelDynamiki("B", stanowisko.U_N_KV)),
        "galezie": (
            GalazDynamiki(
                "LB", "GEN", "B", 1.0 / complex(0.0, _XL_D24), 0.0, complex(1.0, 0.0), True, "linia"
            ),
        ),
        "odbiory": (OdbiorDynamiki("ODB_B", "B", _P0_D24, 0.0, charakterystyka),),
        "urzadzenia": (maszyna,),
        "punkt_pracy": PunktPracy({"GEN": v_g, "B": v_b}, {"G": v_g * prad.conjugate()}),
    }


def _wyrocznia_wyspy_d24():
    from .wyrocznia_odbiorow import WyspaSamoregulacji

    return WyspaSamoregulacji(
        h_s=_H_D24,
        x_pu=_XD_D24 + _XL_D24,
        sem_pu=_E_D24,
        p_m_pu=_P0_D24,
        k=_K_D24,
        t_f_s=_T_F_D24,
        f_n_hz=stanowisko.F_BAZOWA_HZ,
    )


def _stan_zredukowany(wynik, i: int) -> tuple[float, float]:
    """(dw, e) probki `i` biegu wyspy — z kanalow wyniku, `e = wrap(theta_B - x)`."""
    from .wyrocznia_odbiorow import zawin

    dw = float(wynik.probki["omega_pu@G"][i]) - 1.0
    e = zawin(
        math.radians(wynik.probki["kat_deg@B"][i]) - float(wynik.probki["kat_pomiaru_rad@ODB_B"][i])
    )
    return dw, e


def g24_estymator_w_zdarzeniach() -> dict[str, float]:
    """Estymator czestotliwosci odbioru w zdarzeniach (D-24, czesc zdarzeniowa).

    (a) Wartosci wlasne macierzy stanu rdzenia wyspy wobec postaci zamknietej; (b) bieg: skok
    mocy bazowej, potem zwarcie w wezle odbioru z przejsciem przez `U_min` przy `dw_hat != 0`
    — w kazdej probce tozsamosc estymatora i poboru, a poza oknem zwarcia `f_hz@B` wobec
    `f_n (1 + dw - psi'(e) e'/w_n)` na stanie z biegu; (c) obszar beznapieciowy i ponowne
    zasilenie szyny odbioru — w probce P zasilenia `f_odbioru = f_n` dokladnie.
    """
    from network_model.solvers.dynamika.calkowanie import KontekstKroku
    from network_model.solvers.dynamika.siec import zloz_model_sieci
    from network_model.solvers.dynamika.walidacja.malosygnalowa import macierz_stanu

    from .wyrocznia_odbiorow import OdbiorWyroczni

    wyrocznia = _wyrocznia_wyspy_d24()
    w_n = wyrocznia.w_n
    f_n = stanowisko.F_BAZOWA_HZ

    # (a) wartosci wlasne.
    uklad = _wyspa_d24()
    model = zloz_model_sieci(uklad["wezly"], uklad["galezie"], ())
    odbiory = stanowisko.modele_odbiorow(uklad["odbiory"])
    (maszyna,) = uklad["urzadzenia"]
    punkt = uklad["punkt_pracy"]
    stany = (
        odbiory[0].stan_poczatkowy_odbioru(punkt.napiecia_pu["B"]),
        maszyna.stan_poczatkowy(punkt.napiecia_pu["GEN"], punkt.moce_zrodel_pu["G"]),
    )
    napiecia = np.array([punkt.napiecia_pu[w] for w in model.identy_wezlow], dtype=complex)
    kontekst = KontekstKroku(model, odbiory, (maszyna,), stanowisko.nastawy())
    wartosci = sorted(np.linalg.eigvals(macierz_stanu(kontekst, stany, napiecia)), key=abs)
    oczekiwane = sorted(wyrocznia.wartosci_wlasne(_P0_D24), key=abs)
    skala = max(abs(w) for w in oczekiwane)
    blad_wartosci = max(
        *(abs(w) / skala for w in wartosci[: len(wartosci) - 2]),
        *(
            abs(complex(p) - o) / skala
            for p, o in zip(wartosci[len(wartosci) - 2 :], oczekiwane, strict=True)
        ),
    )

    # (b) skok mocy bazowej i zwarcie z przejsciem przez U_min.
    t_skoku, t_zwarcia, t_usuniecia = 0.05, 0.15, 0.18
    wynik = stanowisko.uruchom(
        uklad,
        (
            SkokObciazenia(t_skoku, "ODB_B", _SKOK_D24, 0.0),
            ZwarcieWezla(
                t_s=t_zwarcia,
                wezel="B",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=0.15 * stanowisko.Z_BAZOWA_OM,
                t_usuniecia_s=t_usuniecia,
                sposob_usuniecia="samoczynne",
            ),
        ),
        horyzont_s=0.4,
        dt_s=1e-3,
        krok_wyjscia_s=1e-2,
    )
    tozsamosc_estymatora = 0.0
    tozsamosc_poboru = 0.0
    blad_f_szyny = 0.0
    przejscie_z_odchylka = False
    for i, (t, strona) in enumerate(zip(wynik.os_czasu_s, wynik.strona_probki, strict=True)):
        po_skoku = t > t_skoku or (t == t_skoku and strona == "P")
        p0 = _P0_D24 + (_SKOK_D24 if po_skoku else 0.0)
        modul = float(wynik.probki["u_pu@B"][i])
        f_odb = float(wynik.probki["f_odbioru_hz@ODB_B"][i])
        dw, e = _stan_zredukowany(wynik, i)
        tozsamosc_estymatora = max(
            tozsamosc_estymatora, abs(f_odb - f_n * (1.0 + e / (w_n * _T_F_D24)))
        )
        odbior = OdbiorWyroczni(
            p0_pu=p0,
            q0_pu=0.0,
            wielomian_p=(0.0, 0.0, 1.0),
            wielomian_q=(0.0, 0.0, 1.0),
            v0_pu=1.0,
            k_pf=_K_D24,
            k_qf=0.0,
            f0_hz=f_n,
            u_min_pu=0.7,
        )
        pobor = complex(wynik.probki["p_pobor_pu@ODB_B"][i], wynik.probki["q_pobor_pu@ODB_B"][i])
        tozsamosc_poboru = max(tozsamosc_poboru, abs(pobor - odbior.moc(modul, f_odb)) / p0)
        if modul < 0.7 and abs(f_odb - f_n) > 1e-6:
            przejscie_z_odchylka = True
        poza_zwarciem = t < t_zwarcia or t > t_usuniecia
        if strona == "C" and poza_zwarciem:
            blad_f_szyny = max(
                blad_f_szyny,
                abs(float(wynik.probki["f_hz@B"][i]) - wyrocznia.czestotliwosc_szyny_hz(p0, dw, e)),
            )

    # (c) obszar beznapieciowy i ponowne zasilenie szyny odbioru.
    t_otwarcia, t_zasilenia = 0.05, 0.1
    zasilenie = stanowisko.uruchom(
        _wyspa_d24(),
        (ZmianaGalezi(t_otwarcia, "LB", False), ZmianaGalezi(t_zasilenia, "LB", True)),
        horyzont_s=0.2,
        dt_s=1e-3,
        krok_wyjscia_s=1e-2,
    )
    probka_p = stanowisko.indeks_probki(zasilenie, t_zasilenia, "P")
    f_po_zasileniu = zasilenie.probki["f_odbioru_hz@ODB_B"][probka_p]
    estymator_po_zasileniu = (
        float("inf") if f_po_zasileniu is None else abs(float(f_po_zasileniu) - f_n)
    )
    return {
        "_wartosci_wlasne_rdzenia": [str(complex(w)) for w in wartosci],
        "_wartosci_wlasne_wyroczni": [str(w) for w in oczekiwane],
        "G24_blad_wartosci_wlasnych_wzgl": float(blad_wartosci),
        "G24_tozsamosc_estymatora_hz": float(tozsamosc_estymatora),
        "G24_tozsamosc_poboru_wzgl": float(tozsamosc_poboru),
        "G24_brak_przejscia_przez_u_min_z_odchylka": float(not przejscie_z_odchylka),
        "G24_blad_czestotliwosci_szyny_hz": float(blad_f_szyny),
        "G24_estymator_po_ponownym_zasileniu_hz": float(estymator_po_zasileniu),
    }


#: Wzorzec trajektorii D-24: skok w 0,1 s, horyzont 20 s (kat szyny przechodzi przez +-pi —
#: dw_inf = -4,95e-3 pu, czyli -1,56 rad/s po ustaleniu), okno rzedu metody 2 s.
_T_SKOKU_D24, _HORYZONT_D24, _OKNO_RZEDU_D24 = 0.1, 20.0, 2.0


def _bledy_trajektorii(wynik, t_do: float) -> tuple[float, float]:
    """(max|dw - dw_wyr|, max|dw_hat - dw_hat_wyr|) na probkach C w (t_skoku, t_do]."""
    wyrocznia = _wyrocznia_wyspy_d24()
    p0_po = _P0_D24 + _SKOK_D24
    e_po = wyrocznia.skok(_P0_D24, p0_po, 0.0)
    indeksy = [
        i
        for i, (t, strona) in enumerate(zip(wynik.os_czasu_s, wynik.strona_probki, strict=True))
        if strona == "C" and _T_SKOKU_D24 < t <= t_do + 1e-12
    ]
    chwile = np.array([wynik.os_czasu_s[i] for i in indeksy])
    dw_wyr, e_wyr = wyrocznia.trajektoria(p0_po, 0.0, e_po, _T_SKOKU_D24, chwile)
    skala = wyrocznia.w_n * _T_F_D24
    blad_dw = 0.0
    blad_hat = 0.0
    for numer, i in enumerate(indeksy):
        dw, e = _stan_zredukowany(wynik, i)
        blad_dw = max(blad_dw, abs(dw - float(dw_wyr[numer])))
        blad_hat = max(blad_hat, abs(e - float(e_wyr[numer])) / skala)
    return blad_dw, blad_hat


def g24_samoregulacja_wyspy() -> dict[str, float]:
    """Samoregulacja czestotliwosciowa wyspy z odbiorem czulym f (D-24, trajektoria).

    Bieg 20 s (dt = 1e-3 s) i 2 s (dt = 5e-4 s) wobec ukladu zredukowanego calkowanego
    DOP853: blad trajektorii dw i dw_hat wzgledem |dw_inf|, rzad metody z dwoch krokow, skok
    dw_hat w chwili zdarzenia wobec rownania skalarnego, liczba przejsc kata szyny przez +-pi
    (estymator katowy bez zawijania roznicy kata — defekt pokazalby sie przy pierwszym).
    """
    wyrocznia = _wyrocznia_wyspy_d24()
    p0_po = _P0_D24 + _SKOK_D24
    skok = (SkokObciazenia(_T_SKOKU_D24, "ODB_B", _SKOK_D24, 0.0),)
    dlugi = stanowisko.uruchom(
        _wyspa_d24(), skok, horyzont_s=_HORYZONT_D24, dt_s=1e-3, krok_wyjscia_s=1e-2
    )
    krotki = stanowisko.uruchom(
        _wyspa_d24(), skok, horyzont_s=_OKNO_RZEDU_D24, dt_s=5e-4, krok_wyjscia_s=1e-2
    )
    dw_inf = abs(wyrocznia.odchylka_ustalona(p0_po))
    blad_dw, blad_hat = _bledy_trajektorii(dlugi, _HORYZONT_D24)
    okno_dt = _bledy_trajektorii(dlugi, _OKNO_RZEDU_D24)
    okno_pol = _bledy_trajektorii(krotki, _OKNO_RZEDU_D24)
    rzedy = [duzy / maly for duzy, maly in zip(okno_dt, okno_pol, strict=True)]

    probka_p = stanowisko.indeks_probki(dlugi, _T_SKOKU_D24, "P")
    _dw, e_p = _stan_zredukowany(dlugi, probka_p)
    e_wyr = wyrocznia.skok(_P0_D24, p0_po, 0.0)
    skok_blad = abs(e_p - e_wyr) / (wyrocznia.w_n * _T_F_D24)

    katy = [
        math.radians(dlugi.probki["kat_deg@B"][i])
        for i, strona in enumerate(dlugi.strona_probki)
        if strona == "C"
    ]
    przejscia = sum(
        1 for poprzedni, nastepny in itertools.pairwise(katy) if abs(nastepny - poprzedni) > math.pi
    )
    return {
        "_rzad_dw": float(rzedy[0]),
        "_rzad_dw_hat": float(rzedy[1]),
        "_przejscia_kata_przez_pi": float(przejscia),
        "_dw_inf_pu": float(dw_inf),
        "G24_blad_trajektorii_wzgl": float(max(blad_dw, blad_hat) / dw_inf),
        "G24_odchylka_rzedu_metody": float(max(abs(r - 4.0) for r in rzedy)),
        "G24_blad_skoku_w_chwili_zdarzenia_pu": float(skok_blad),
        "G24_brak_przejscia_kata_przez_pi": float(przejscia < 1),
    }


#: Tablica uzycia pol modelu dynamicznego odbioru SPISANA Z ROWNAN karty (par. 0 pkt 1 i 4),
#: niezaleznie od predykatu rdzenia `wymagane_parametry_odbioru`:
#: * `U_min` — czyta je przejscie skladowych NIEIMPEDANCYJNYCH (b, c) w stala impedancje;
#:   odbior czysto impedancyjny (b = c = 0 w P i Q) go nie ma;
#: * `T_f` — czyta je estymator czestotliwosci odbioru czulego (k_pf != 0 albo k_qf != 0).
#: Klucz: (ksztalt, czulosc) -> (U_min uzyte, T_f uzyte).
_TABLICA_UZYCIA_POL: dict[tuple[str, str], tuple[bool, bool]] = {
    (ksztalt, czulosc): (ksztalt != "czysty_z", czulosc != "bez_czulosci")
    for ksztalt in ("stala_moc", "czysty_z", "czysty_i", "mieszany")
    for czulosc in ("bez_czulosci", "k_f0_studium", "k_f0_jawne")
}


def _kody_gotowosci(raport) -> set[str]:
    """Kody z powodow gotowosci (`... (kod 'x')`) — ta sama forma, ktora czyta projektant."""
    import re

    return {
        kod for powod in raport.missing_fields_pl for kod in re.findall(r"\(kod '([^']+)'\)", powod)
    }


def _gotowosc_i_bieg(snapshot: dict) -> tuple[str, set[str], str | None]:
    """(status gotowosci, kody gotowosci, kod odmowy biegu albo None) — gotowosc z punktem
    pracy (`punkt_pracy_rozplywu=True`), bieg torem rozplyw -> adapter -> rdzen."""
    from application.calculation_readiness.service import CalculationReadinessService
    from enm.models import EnergyNetworkModel

    raport = CalculationReadinessService().evaluate_single(
        EnergyNetworkModel.model_validate(snapshot), "dynamika_rms", punkt_pracy_rozplywu=True
    )
    try:
        _bieg_pf, punkt = _rozplyw_i_punkt_pracy(snapshot)
        SilnikDynamiki(
            _wejscie_biegu_produktu(snapshot, _opcje_sieci_odbiorow(0.004), punkt)
        ).uruchom()
        kod_biegu = None
    except Exception as blad:  # noqa: BLE001 — surowy wyjatek to tez wynik (niezgodnosc)
        kod_biegu = str(getattr(blad, "kod", f"WYJATEK SUROWY {type(blad).__name__}"))
    return raport.status, _kody_gotowosci(raport), kod_biegu


def _zmien_odbior(snapshot: dict, ref: str, **pola: object) -> dict:
    wynik = copy.deepcopy(snapshot)
    wpis = next(load for load in wynik["loads"] if load["ref_id"] == ref)
    for klucz, wartosc in pola.items():
        if klucz == "dynamika_pola":
            assert isinstance(wartosc, dict)
            wpis["dynamika"] = {**wpis["dynamika"], **wartosc}
        else:
            wpis[klucz] = wartosc
    return wynik


def _przypadki_g25() -> dict[str, tuple[dict, str | None]]:
    """Macierz D-25: migawka -> oczekiwany kod odmowy biegu (None = bieg przechodzi).

    Stany niespojne bloku (brak/fantom pola) powstaja tu RECZNA edycja kopii — droga
    projektanta (wiazanie profilu) takich kopii nie tworzy, ale migawka z importu albo
    sprzed zmiany wspolczynnikow moze je niesc; gotowosc i bieg musza wtedy mowic to samo.
    """
    from enm.adapter_dynamiki import (
        KOD_ODBIOR_BEZ_BLOKU,
        KOD_ODBIOR_NIEODWZOROWANY,
        KOD_ODBIOR_PARAMETRY_NIESPOJNE,
    )
    from enm.dynamika_z_katalogu import synchronizuj_dynamike_z_wiazan
    from enm.models import EnergyNetworkModel

    from tests.golden.enm_builders.odbiory_dynamiki import PROFIL_ODBIOROW_SIECI_WZORCOWYCH

    baza = _migawka_g16()
    zwiazany_zip_czuly = _zmien_odbior(
        baza,
        "odb-odplyw",
        materialized_params={
            **_KSZTALTY_G22["mieszany"],
            **_CZULOSCI_G22["k_f0_studium"],
            "dynamic_model_ref": PROFIL_ODBIOROW_SIECI_WZORCOWYCH,
        },
    )
    zwiazany_zip_czuly = synchronizuj_dynamike_z_wiazan(zwiazany_zip_czuly)
    czysty_z = synchronizuj_dynamike_z_wiazan(
        _zmien_odbior(
            baza,
            "odb-odplyw",
            materialized_params={
                **_KSZTALTY_G22["czysty_z"],
                "dynamic_model_ref": PROFIL_ODBIOROW_SIECI_WZORCOWYCH,
            },
        )
    )
    bez_wytworcow = copy.deepcopy(baza)
    bez_wytworcow["generators"] = []
    przypadki: dict[str, tuple[dict, str | None]] = {
        "wszystko_zwiazane": (baza, None),
        "bez_wytworcow_z_odbiorami": (bez_wytworcow, None),
        "odbior_bez_bloku": (
            _zmien_odbior(
                baza,
                "odb-odplyw",
                dynamika=None,
                materialized_params={},
            ),
            KOD_ODBIOR_BEZ_BLOKU,
        ),
        "u_min_brak": (
            _zmien_odbior(baza, "odb-odplyw", dynamika_pola={"u_min_pu": None}),
            KOD_ODBIOR_PARAMETRY_NIESPOJNE,
        ),
        "u_min_zbedny": (
            _zmien_odbior(czysty_z, "odb-odplyw", dynamika_pola={"u_min_pu": 0.7}),
            KOD_ODBIOR_PARAMETRY_NIESPOJNE,
        ),
        "t_f_brak": (
            _zmien_odbior(
                zwiazany_zip_czuly, "odb-odplyw", dynamika_pola={"t_pomiaru_czestotliwosci_s": None}
            ),
            KOD_ODBIOR_PARAMETRY_NIESPOJNE,
        ),
        "t_f_zbedny": (
            _zmien_odbior(baza, "odb-odplyw", dynamika_pola={"t_pomiaru_czestotliwosci_s": 0.1}),
            KOD_ODBIOR_PARAMETRY_NIESPOJNE,
        ),
        "p0_ujemne": (
            _zmien_odbior(baza, "odb-odplyw", p_mw=-1.0),
            KOD_ODBIOR_NIEODWZOROWANY,
        ),
    }
    return {
        nazwa: (EnergyNetworkModel.model_validate(migawka).model_dump(mode="json"), kod)
        for nazwa, (migawka, kod) in przypadki.items()
    }


def _odmowa_rdzenia(uklad: dict, zdarzenia: tuple, **nastawy: float) -> tuple[str | None, tuple]:
    try:
        stanowisko.uruchom(uklad, zdarzenia, **nastawy)
    except OdmowaDynamiki as odmowa:
        return odmowa.kod, tuple(odmowa.szczegoly.get("adresy", ()))
    except Exception as blad:  # noqa: BLE001
        return f"WYJATEK SUROWY {type(blad).__name__}", ()
    return None, ()


def g25_odmowy_modelu_odbioru() -> dict[str, float | dict[str, str]]:
    """Fail-closed modelu odbioru (D-25): ta sama odmowa w gotowosci i w biegu.

    (1) Macierz ENM (siec G16): gotowosc `blocked` <=> bieg odmawia, a kod odmowy biegu jest
    wsrod kodow gotowosci i rowny oczekiwanemu; gotowosc `ready` <=> bieg przechodzi.
    (2) Odmowy rdzenia zalezne od biegu (gotowosc ich nie zna — punkt pracy i przebieg):
    punkt pracy ponizej `U_min` -> `dynamika.odbior_ponizej_napiecia_przejscia` PRZED bramka
    rownowagi; `F <= 0` -> `dynamika.zakres_waznosci_przekroczony` z adresem
    `<odbior>.czynnik_czestotliwosci_P`. (3) Tablica uzycia pol wobec predykatu rdzenia i
    kopii materializacji katalogu.
    """
    from enm.dynamika_z_katalogu import materializuj_dynamike_odbioru
    from network_model.solvers.dynamika.kontrakty import (
        KOD_ODBIOR_PONIZEJ_NAPIECIA_PRZEJSCIA,
        KOD_ZAKRES_WAZNOSCI_PRZEKROCZONY,
        wymagane_parametry_odbioru,
    )
    from network_model.solvers.dynamika.odbiory import charakterystyka_z_wielomianu

    from tests.golden.enm_builders.odbiory_dynamiki import PROFIL_ODBIOROW_SIECI_WZORCOWYCH

    from .wyrocznia_odbiorow import OdbiorWyroczni

    macierz: dict[str, str] = {}
    niezgodnosci = 0
    for nazwa, (snapshot, oczekiwany) in sorted(_przypadki_g25().items()):
        status, kody, kod_biegu = _gotowosc_i_bieg(snapshot)
        macierz[nazwa] = f"gotowosc={status} {sorted(kody)} bieg={kod_biegu}"
        # Para gotowosc <-> bieg: `blocked` wtedy i tylko wtedy, gdy bieg odmawia, a kod odmowy
        # biegu jest wsrod kodow gotowosci. `partial` (ostrzezenie rozplywu, np. tryb regulacji
        # PV nieustawiony) nie blokuje biegu i nie jest odmowa.
        zgodne = (
            kod_biegu == oczekiwany
            and (status == "blocked") == (kod_biegu is not None)
            and (kod_biegu is None or kod_biegu in kody)
        )
        niezgodnosci += int(not zgodne)

    odbior, wyrocznia = _odbior_d23("stala_moc", u_min_pu=0.99)
    kod, _adresy = _odmowa_rdzenia(
        _uklad_d23(odbior, wyrocznia, f_hz=None),
        (),
        horyzont_s=0.02,
        dt_s=1e-3,
        krok_wyjscia_s=1e-2,
    )
    macierz["punkt_pracy_ponizej_u_min"] = f"bieg={kod}"
    niezgodnosci += int(kod != KOD_ODBIOR_PONIZEJ_NAPIECIA_PRZEJSCIA)

    # Skok fazy napiecia wezla odbioru przy glebokim zwarciu, duza czulosc i krotka stala
    # pomiaru: `dw_hat` rzedu 1e-2 => `F_P = 1 + k dw_hat <= 0` (R6 karty). Na wyspie
    # jednomaszynowej odbior sam ogranicza skok (moc zalezna od F wraca do kata `psi`),
    # dlatego wzorcem jest uklad dwuwezlowy ze sztywna szyna.
    odbior_czuly = OdbiorDynamiki(
        "O",
        "L",
        _P0_D23,
        _Q0_D23,
        charakterystyka_z_wielomianu(
            a_p=0.0,
            b_p=0.0,
            c_p=1.0,
            a_q=0.0,
            b_q=0.0,
            c_q=1.0,
            v0_pu=1.0,
            k_pf=40.0,
            k_qf=0.0,
            f0_hz=stanowisko.F_BAZOWA_HZ,
            u_min_pu=_U_MIN_D23,
            t_pomiaru_czestotliwosci_s=0.002,
        ),
    )
    wyrocznia_czulego = OdbiorWyroczni(
        p0_pu=_P0_D23,
        q0_pu=_Q0_D23,
        wielomian_p=(0.0, 0.0, 1.0),
        wielomian_q=(0.0, 0.0, 1.0),
        v0_pu=1.0,
        k_pf=40.0,
        k_qf=0.0,
        f0_hz=stanowisko.F_BAZOWA_HZ,
        u_min_pu=_U_MIN_D23,
    )
    kod, adresy = _odmowa_rdzenia(
        _uklad_d23(odbior_czuly, wyrocznia_czulego, f_hz=stanowisko.F_BAZOWA_HZ),
        (
            ZwarcieWezla(
                t_s=0.05,
                wezel="L",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=0.05,
                t_usuniecia_s=0.08,
                sposob_usuniecia="samoczynne",
            ),
        ),
        horyzont_s=0.2,
        dt_s=1e-3,
        krok_wyjscia_s=1e-2,
    )
    macierz["czynnik_czestotliwosci_niedodatni"] = f"bieg={kod} {adresy}"
    niezgodnosci += int(
        kod != KOD_ZAKRES_WAZNOSCI_PRZEKROCZONY or adresy != ("O.czynnik_czestotliwosci_P",)
    )

    niezgodnosci_tablicy = 0
    for (ksztalt, czulosc), (u_min_uzyte, t_f_uzyte) in sorted(_TABLICA_UZYCIA_POL.items()):
        wspolczynniki = {"a_p": 0.0, "b_p": 0.0, "c_p": 1.0, "a_q": 0.0, "b_q": 0.0, "c_q": 1.0}
        wspolczynniki.update(
            {k: v for k, v in _KSZTALTY_G22[ksztalt].items() if k in wspolczynniki}
        )
        czulosci = _CZULOSCI_G22[czulosc]
        rdzen = wymagane_parametry_odbioru(
            **wspolczynniki, k_pf=czulosci.get("k_pf", 0.0), k_qf=czulosci.get("k_qf", 0.0)
        )
        kopia = materializuj_dynamike_odbioru(
            PROFIL_ODBIOROW_SIECI_WZORCOWYCH,
            {
                "ref_id": "odb-tablica",
                "name": "Odbiór tablicy",
                "materialized_params": {**_KSZTALTY_G22[ksztalt], **czulosci},
            },
            stanowisko.F_BAZOWA_HZ,
        )
        niezgodnosci_tablicy += int(
            (rdzen.u_min_pu, rdzen.t_pomiaru_czestotliwosci_s) != (u_min_uzyte, t_f_uzyte)
            or (kopia["u_min_pu"] is not None, kopia["t_pomiaru_czestotliwosci_s"] is not None)
            != (u_min_uzyte, t_f_uzyte)
        )
    return {
        "_macierz_g25": macierz,
        "G25_niezgodnosci_gotowosci_i_biegu": float(niezgodnosci),
        "G25_niezgodnosci_tablicy_uzycia_pol": float(niezgodnosci_tablicy),
    }


BRAMKI = (
    g1_dryf_stanu_ustalonego,
    g2_g4_mod_elektromechaniczny,
    g3_rocof_w_chwili_zwarcia,
    g5_czas_zdarzenia,
    g6_inna_baza_urzadzenia,
    g7_czestotliwosc_wezlowa,
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
    g14_lokalizacja_zdarzen_warunkowych,
    g15_zrodlo_testowe,
    g18_przypisanie_stanu,
    g21_utrata_czesciowa,
    g22_parytet_chwili_zerowej,
    g23_przejscie_pq_z,
    g24_estymator_w_zdarzeniach,
    g24_samoregulacja_wyspy,
    g25_odmowy_modelu_odbioru,
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
