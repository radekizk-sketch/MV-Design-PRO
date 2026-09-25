"""MANIFEST DOWODOW: co twierdzimy, czym to jest udowodnione i na jakim poziomie (R10 par. 35-36).

KONTRAKT POZIOMU L5. Twierdzenie ma poziom L5 dopiero wtedy, gdy ma KOMPLET
siedmiu elementow — brak choc jednego cofa je nizej, bez negocjacji:

  1. jawne ROWNANIE (nie „model", tylko wzor),
  2. NIEZALEZNA wyrocznia (inna droga liczenia, bez wspolnego kodu z produktem),
  3. WERSJONOWANY wzorzec (uklad i nastawy w repo, nie w katalogu sesji),
  4. MUTACJA falsyfikujaca (wstrzykniety defekt, ktory ten dowod ZABIJA),
  5. odtworzenie z CZYSTEGO KLONU (`uruchom.py`, bez plikow sesji),
  6. wykonanie w BRAMCE (pytest/CI, a nie „kiedys u kogos"),
  7. jawnie nazwany ZAKRES WAZNOSCI (gdzie to twierdzenie przestaje obowiazywac).

Poziomy nizsze: L4 = brak jednego z (4)-(6); L3 = dowod tylko wobec wlasnej
implementacji (bez niezaleznej wyroczni); L2 = pomiar bez wyroczni; L1 = deklaracja
z testem ksztaltu; L0 = deklaracja bez testu.

Ten plik jest DANYMI, nie opowiescia: `test_manifest.py` sprawdza, ze kazda pozycja
wskazuje istniejacy test i istniejaca mutacje, a poziom zgadza sie z kompletem pol.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Twierdzenie:
    """Jedno twierdzenie o fizyce rdzenia wraz z calym swoim dowodem."""

    ident: str
    zdolnosc: str
    rownanie: str
    wyrocznia: str
    wzorzec: str
    testy: tuple[str, ...]
    mutacje: tuple[str, ...]
    bramka_ci: str
    zakres_waznosci: str
    poziom: str
    uwagi: str = ""
    wymaga_wyroczni_zewnetrznej: bool = field(default=False)


MANIFEST: tuple[Twierdzenie, ...] = (
    Twierdzenie(
        ident="D-01",
        zdolnosc="Rownanie wahan maszyny klasycznej (postac mocowa)",
        rownanie="d(delta)/dt = omega_0 (omega - 1); d(omega)/dt = (P_m - P_e - D dOmega)/(2H)",
        wyrocznia="wyrocznia.UkladSMIB.mod_analityczny (postac zamknieta malosygnalowa)",
        wzorzec="stanowisko.zbuduj() + zwarcie 5 pu, dt = 5e-4 s",
        testy=("tests/walidacja_fizyczna/test_bramki.py::test_g2_g4_mod_elektromechaniczny",),
        mutacje=("M10", "M11", "M12", "M13"),
        bramka_ci="Walidacja fizyczna dynamiki",
        zakres_waznosci=(
            "maszyna 2. rzedu bez regulatorow, siec bezstratna, male odchylki wokol "
            "punktu pracy (mod malosygnalowy); dla duzych katow obowiazuje D-04"
        ),
        poziom="L5",
    ),
    Twierdzenie(
        ident="D-02",
        zdolnosc="Zmiana bazy: bezwladnosc w gore, impedancja w dol",
        rownanie="H_uklad = H S_urz/S_uklad ; z_uklad = z S_uklad/S_urz",
        wyrocznia="wyrocznia.UkladSMIB — ten sam uklad fizyczny podany w innej bazie",
        wzorzec="stanowisko.zbuduj(s_n_mva=50.0) wobec stanowisko.zbuduj()",
        testy=("tests/walidacja_fizyczna/test_bramki.py::test_g6_inna_baza_urzadzenia",),
        mutacje=("M14", "M15"),
        bramka_ci="Walidacja fizyczna dynamiki",
        zakres_waznosci="wielkosci w pu o znanym rzedzie jednorodnosci wzgledem mocy bazowej",
        poziom="L5",
        uwagi=(
            "Wzorzec W6-F mial baze urzadzenia ROWNA bazie ukladu, wiec mnoznik wynosil 1,0 "
            "i kazdy blad kierunku byl w nim niewidoczny (defekt F-1). Bramka G6 zamyka ten "
            "slepy punkt: okres modu w bazie 50 MVA wychodzi BITOWO identyczny."
        ),
    ),
    Twierdzenie(
        ident="D-03",
        zdolnosc="Czestotliwosc wezlowa z fazora napiecia",
        rownanie="f_i = f_n + Im(Vdot_i conj(V_i)) / (2 pi |V_i|^2)",
        wyrocznia="pochodna analityczna dV/ddelta z wlasnej macierzy Y wyroczni",
        wzorzec="stanowisko.zbuduj() + zwarcie 0,5 pu zdejmowane, dt = 5e-4 s",
        testy=(
            "tests/walidacja_fizyczna/test_bramki.py::test_g7_czestotliwosc_wezlowa",
            "tests/walidacja_fizyczna/test_czestotliwosc_wezlowa.py",
        ),
        mutacje=("M16", "M17"),
        bramka_ci="Walidacja fizyczna dynamiki",
        zakres_waznosci=(
            "fazor skladowej zgodnej w stanie quasi-ustalonym RMS; przy |V| <= u_V "
            "wielkosc jest NIEDOSTEPNA, a nie przyblizona; poza chwilami zdarzen — w probkach "
            "L i P chwili zdarzenia czestotliwosc jest NIEDOSTEPNA (kod 3, D-18)"
        ),
        poziom="L5",
        uwagi="Zmierzony blad wobec pochodnej analitycznej: 7,105427357601002e-15 Hz = ulp(50 Hz).",
    ),
    Twierdzenie(
        ident="D-04",
        zdolnosc="Czas krytyczny zwarcia (stabilnosc przejsciowa)",
        rownanie="A1(delta_c) = A2(delta_c); t = INT d(delta)/sqrt((omega_0/H) A1(delta))",
        wyrocznia=(
            "DWIE niezalezne drogi: kwadratura rownych pol po kacie oraz bisekcja po "
            "trajektoriach DOP853/Radau (zgodne do 1,4e-10 s)"
        ),
        wzorzec="stanowisko.zbuduj() + zwarcie X_f = 0,05 pu na szynie GEN",
        testy=("tests/walidacja_fizyczna/test_bramki.py::test_g10_czas_krytyczny",),
        mutacje=("M12", "M13"),
        bramka_ci="Walidacja fizyczna dynamiki",
        zakres_waznosci=(
            "uklad bezstratny (Ra = R_s = 0), maszyna 2. rzedu bez regulatorow, zwarcie "
            "trojfazowe symetryczne usuwane bez zmiany topologii pozwarciowej — usuniecie "
            "`samoczynne` (jawna idealizacja zwarcia przemijajacego, zapisywana w zalozeniach "
            "wyniku); usuniecie `izolacja` ze zmiana topologii jest poza tym twierdzeniem (D-17)"
        ),
        poziom="L5",
    ),
    Twierdzenie(
        ident="D-05",
        zdolnosc="Niezmienniki energii (calka pierwsza i monotonicznosc)",
        rownanie="V = 1/2 M dOmega^2 + INT (P_e - P_m) d(delta); dV/dt = -(D/omega_0) dOmega^2 <= 0",
        wyrocznia="funkcja energii liczona z SAMYCH probek wyniku i stalych maszyny",
        wzorzec="stanowisko.zbuduj(d_pu=0) i (d_pu=2) + zwarcie 5 pu zdejmowane",
        testy=("tests/walidacja_fizyczna/test_bramki.py::test_g11_g12_energia",),
        mutacje=("M10", "M11"),
        bramka_ci="Walidacja fizyczna dynamiki",
        zakres_waznosci="maszyna 2. rzedu, siec bezstratna, brak regulatorow i ogranicznikow",
        poziom="L5",
    ),
    Twierdzenie(
        ident="D-06",
        zdolnosc="Reinicjalizacja po zdarzeniu (`g(x+, y+) = 0`)",
        rownanie="0 = g(x+, y+) = Y_nowe V+ - I(x+, V+), x+ = x- (ciaglosc stanu rozniczkowego)",
        wyrocznia="residuum KCL liczone NIEZALEZNIE od Ybus (element po elemencie, model pi)",
        wzorzec="zwarcie na wezle siatki (t = 0,3 s) i MIEDZY krokami (t = 0,30025 s)",
        testy=(
            "tests/walidacja_fizyczna/test_zdarzenia.py",
            "tests/walidacja_fizyczna/test_bramki.py::test_g9_residuum_po_zdarzeniu",
        ),
        mutacje=("M20",),
        bramka_ci="Walidacja fizyczna dynamiki",
        zakres_waznosci=(
            "zdarzenia zmieniajace Ybus albo wstrzykniecia; zero zmian stanu wirnika; poza "
            "stanami przypisanymi (przypisanie stanu i komenda regulacji — D-13)"
        ),
        poziom="L5",
    ),
    Twierdzenie(
        ident="D-07",
        zdolnosc="Fail-closed: brak rozwiazania konczy sie ODMOWA NAZWANA",
        rownanie=(
            "warunek istnienia: wyspa z odbiorem |S| > 0 musi zawierac urzadzenie o "
            "niezerowym pradzie albo niezerowym dI/dV"
        ),
        wyrocznia=(
            "analiza rownania: dla Ybus = 0 residuum wynosi |S|/|V|, wiec KAZDA tolerancja "
            "jest osiagalna przez odjechanie napiecia — norma residuum nie jest swiadectwem"
        ),
        wzorzec="Ybus = 0 + odbior S = 1,0 + j0,2 pu przy dwoch zestawach nastaw",
        testy=(
            "tests/walidacja_fizyczna/test_bramki.py::test_g13_wyspa_bez_zrodla",
            "tests/walidacja_fizyczna/test_bramki.py::test_g8_granica_odmowy",
            "tests/walidacja_fizyczna/test_odpornosc_numeryczna.py",
        ),
        mutacje=("M18", "M19"),
        bramka_ci="Walidacja fizyczna dynamiki",
        zakres_waznosci=(
            "odbior o stalej mocy i wyspy bez zrodla NA POZIOMIE ALGEBRY (`rozwiaz_algebre` "
            "bez wierszy ograniczenia); tam wyspa martwa BEZ odbioru i bez bocznika nadal "
            "konczy sie osobliwym jakobianem i odmowa `dynamika.algebra_niezbiezna`. Na "
            "poziomie BIEGU silnik odcina wyspe bez urzadzenia wnoszacego do algebry "
            "(obszar beznapieciowy, V = 0 dokladnie) i nie podaje jej algebrze — wyspa "
            "martwa, patrz D-16"
        ),
        poziom="L5",
    ),
    Twierdzenie(
        ident="D-08",
        zdolnosc="Warunek istnienia rownania wahan: H > 0",
        rownanie="d(omega)/dt = (P_m - P_e - D dOmega)/(2H), okreslone wylacznie dla H > 0",
        wyrocznia="analiza rownania (brak rownania dla H = 0, odwrocona przyczynowosc dla H < 0)",
        wzorzec="H = 1; 0,05; 1e-12; 0; -1e-12; -1; +-inf; NaN",
        testy=("tests/walidacja_fizyczna/test_odpornosc_numeryczna.py",),
        mutacje=(),
        bramka_ci="Walidacja fizyczna dynamiki",
        zakres_waznosci=(
            "warunek MATEMATYCZNY, nie prog wiarygodnosci: H = 0,05 s jest dopuszczone, "
            "bo uklad jest wtedy tylko sztywniejszy, a zbieznosci pilnuje wlasna maszyneria kroku"
        ),
        poziom="L4",
        uwagi=(
            "L4, nie L5: nie ma mutacji falsyfikujacej sam warunek (usuniecie go nie zmienia "
            "zadnego przebiegu — defekt F-7 byl NIEWIDOCZNY w biegu, bo przy P_m = P_e licznik "
            "jest zerem). Dowodem jest tu sprawdzenie zachowania na zamiatanej wartosci H, nie "
            "roznica trajektorii."
        ),
    ),
    Twierdzenie(
        ident="D-09",
        zdolnosc="Zgodnosc z wyrocznia zewnetrzna (ANDES 1.9.3) i przyczyna roznicy",
        rownanie="tau* = min(eps, dt)/2 — polowa PIERWSZEGO kroku po zdarzeniu",
        wyrocznia="ANDES 1.9.3 (GENCLS + Fault), niezalezna implementacja tego samego modelu",
        wzorzec="tests/walidacja_fizyczna/andes/eksperyment_eps_tau.py (zamiatanie eps i dt)",
        testy=("tests/walidacja_fizyczna/andes/test_eps_tau.py",),
        mutacje=(),
        bramka_ci="Walidacja fizyczna dynamiki — praca rozszerzona (marker `andes`)",
        zakres_waznosci=(
            "SMIB z maszyna klasyczna i zwarciem przez reaktancje; wniosek dotyczy SEMANTYKI "
            "PROBKOWANIA na uzytej sciezce porownania, NIE poprawnosci ktoregokolwiek programu"
        ),
        poziom="L4",
        wymaga_wyroczni_zewnetrznej=True,
        uwagi=(
            "L4, nie L5: ANDES nie jest zaleznoscia produkcyjna (wlasny pin scipy), wiec dowod "
            "wykonuje sie w osobnym srodowisku i NIE w obowiazkowej bramce kazdego PR. "
            "Brakujacym elementem kontraktu L5 jest wylacznie punkt (6)."
        ),
    ),
    Twierdzenie(
        ident="D-10",
        zdolnosc="Determinizm biegu miedzy procesami",
        rownanie="brak — wlasnosc implementacji, nie fizyki",
        wyrocznia="powtorzenie biegu w osobnym procesie przy zmienionym PYTHONHASHSEED",
        wzorzec="dwa zdarzenia w TEJ SAMEJ chwili na ukladzie dwutorowym",
        testy=(
            "tests/walidacja_fizyczna/test_zdarzenia.py::test_wynik_nie_zalezy_od_pythonhashseed",
        ),
        mutacje=(),
        bramka_ci="Walidacja fizyczna dynamiki",
        zakres_waznosci="ta sama platforma i ta sama wersja numpy/scipy",
        poziom="L4",
        uwagi="L4: brak mutacji falsyfikujacej (iniekcja niedeterminizmu wymagalaby zmiany typu kolekcji).",
    ),
)

#: Twierdzenia karty AB-1b.1 (rdzen zdarzen): D-15..D-19, D-21 — pakiety P2-P5.
MANIFEST = MANIFEST + (
    Twierdzenie(
        ident="D-15",
        zdolnosc=(
            "Fazory pradow galezi: modul i kat pradu OBU zaciskow kazdej galezi oraz pradu "
            "zwarcia, w probkach L i P chwili zwarcia; kat None dla fazora zerowego"
        ),
        rownanie=(
            "(i) I_f = V_k(t_f-) / (Z_kk + Z_f), dV = -Z[:, k] I_f, "
            "I_ij(t_f+) = I_ij(t_f-) + stempel_ij(dV) (pi z idealnym transformatorem po "
            "stronie od: I_od = (y + jB/2)/|a|^2 V_od - y/conj(a) V_do, "
            "I_do = -y/a V_od + (y + jB/2) V_do); "
            "(ii) I_k'' = c U_n / (sqrt3 |Z_kk|) i prady galezi z podzialu Z-bus (IEC 60909-0)"
        ),
        wyrocznia=(
            "(i) wyrocznia_fazorow.superpozycja_thevenina — kolumna Z sieci zdrowej, bez "
            "skladania sieci zwartej (zero importow z rdzenia); (ii) FROZEN "
            "network_model.solvers.short_circuit_iec60909.ShortCircuitIEC60909Solver "
            "(ikss_a, branch_contributions: modul i kierunek)"
        ),
        wzorzec=(
            "(i) bramki.bieg_d15: szyna sztywna + linia z B + transformator 1,025/-30 st. + "
            "linie + odbiory jako admitancje + maszyna klasyczna; zwarcie 3F w A, T, B, C "
            "(R_f > 0 i metaliczne); (ii) bramki.g16_parytet_iec60909: zrodlo S_k'' = 250 MVA, "
            "R/X = 0,1, U = c_max = 1,1; pierscien Q-A-B-Q + odgalezienie B-C, B = 0; zwarcie "
            "metaliczne w B"
        ),
        testy=(
            "tests/walidacja_fizyczna/test_zdarzenia_rdzenia.py"
            "::test_d15_fazory_pradow_galezi_wobec_superpozycji_thevenina",
            "tests/walidacja_fizyczna/test_zdarzenia_rdzenia.py"
            "::test_d15_parytet_z_zamrozonym_solverem_iec60909",
            "tests/walidacja_fizyczna/test_bramki.py::test_g16_fazory_pradow_galezi",
            "tests/walidacja_fizyczna/test_bramki.py::test_g16_parytet_iec60909",
            "tests/walidacja_fizyczna/test_probki_obustronne.py::test_kanaly_galezi_modul_i_kat",
        ),
        mutacje=("M30", "M32"),
        bramka_ci="Walidacja fizyczna dynamiki",
        zakres_waznosci=(
            "skladowa zgodna, zwarcie 3F w wezle (R_f >= 0), siec liniowa w chwili zwarcia "
            "(zrodla jako SEM za admitancja, odbiory jako admitancje); parytet IEC 60909 "
            "wylacznie dla sieci bez transformatorow (K_T), generatorow (K_G), odbiorow i "
            "susceptancji — tam metoda zrodla zastepczego i bieg od U = c_max sa ta sama "
            "algebra; kat fazora numerycznie bliskiego zeru (szum zaokraglen) NIE jest "
            "twierdzeniem — `None` wylacznie dla zera dokladnego"
        ),
        poziom="L5",
    ),
    Twierdzenie(
        ident="D-18",
        zdolnosc=(
            "Probki obustronne: chwila zdarzenia ma probke L (stan przed zdarzeniami chwili) "
            "i P (po nich i po jednej re-inicjalizacji); czestotliwosc w obu niedostepna"
        ),
        rownanie=(
            "L: Y(t_z-) V = I(x(t_z)); P: Y(t_z+) V = I(x(t_z)); x(t_z-) = x(t_z+) "
            "(stan rozniczkowy ciagly); f(t_z) = None, kod jakosci 3"
        ),
        wyrocznia=(
            "wyrocznia.UkladSMIB.macierz — algebra SMIB przed i po zwarciu przy kacie wirnika "
            "z probki (zero importow z rdzenia)"
        ),
        wzorzec=(
            "bramki.g20_probki_obustronne: SMIB, zwarcie w 0,3 s (na siatce) i usuniecie w "
            "0,4237 s (poza siatka)"
        ),
        testy=(
            "tests/walidacja_fizyczna/test_zdarzenia_rdzenia.py"
            "::test_d18_probki_obustronne_wobec_algebry_smib",
            "tests/walidacja_fizyczna/test_bramki.py::test_g20_probki_obustronne",
            "tests/walidacja_fizyczna/test_probki_obustronne.py::test_os_czasu_i_strony_probek",
            "tests/network_model/dynamika/test_wynik.py"
            "::test_czestotliwosc_w_chwili_zdarzenia_jest_None_z_kodem_3_w_obu_probkach",
            "tests/network_model/dynamika/test_dozory.py"
            "::test_akcja_wykonana_dokladnie_w_chwili_pobudzenia",
            "tests/network_model/dynamika/test_przypisania_stanu.py"
            "::test_komenda_wykonana_na_kazdej_rodzinie",
        ),
        mutacje=("M28", "M29"),
        bramka_ci="Walidacja fizyczna dynamiki",
        zakres_waznosci=(
            "zdarzenia planowane (topologia, zwarcia, odsprzegi, odbiory, przypisania stanu, "
            "komendy regulacji, segmenty profilu zrodla testowego) i akcje zdarzen "
            "warunkowych (para L/P w chwili t*, takze kilka rund w jednej chwili) na siatce, "
            "poza nia, w t = 0 i w t = horyzont, pojedyncze i rownoczesne"
        ),
        poziom="L5",
    ),
    Twierdzenie(
        ident="D-16",
        zdolnosc=(
            "Obszar beznapieciowy: wyspa bez urzadzenia wnoszacego do algebry ma V = 0, "
            "odbiory odciete, ponowne zasilenie trafia w rozwiazanie fizyczne"
        ),
        rownanie=(
            "wezel obszaru: V_k - 0 = 0 (wiersz ograniczenia zamiast KCL; ogolnie "
            "V_k - E_k(x) = 0 z blokiem jakobianu sprzezonego -dE/dx); po ponownym "
            "zasileniu odbior stalej mocy za impedancja Z od SEM E: "
            "E conj(V) - |V|^2 = Z conj(S), rozwiazanie fizyczne = pierwiastek WYZSZY"
        ),
        wyrocznia=(
            "wyrocznia_zdarzen.napiecie_odbioru_stalej_mocy — postac zamknieta rownania "
            "kwadratowego w |V|^2 (zero importow z rdzenia)"
        ),
        wzorzec=(
            "bramki.g17_obszar_beznapieciowy: zrodlo za impedancja + linia otwarta w t = 0 + "
            "odbior S = 0,6 + j0,2 pu; zamkniecie linii w t = 0,05 s"
        ),
        testy=(
            "tests/walidacja_fizyczna/test_zdarzenia_rdzenia.py"
            "::test_d16_wezel_odciety_ma_zero_a_ponowne_zasilenie_trafia_w_wyzszy_pierwiastek",
            "tests/walidacja_fizyczna/test_bramki.py::test_g17_obszar_beznapieciowy",
            "tests/network_model/dynamika/test_obszary_beznapieciowe.py"
            "::test_obszar_beznapieciowy_iloczyn_cech",
            "tests/enm/test_adapter_dynamiki.py::TestObszarBeznapieciowy"
            "::test_szr_z_przerwa_beznapieciowa",
            "tests/network_model/dynamika/test_obszary_beznapieciowe.py"
            "::test_jakobian_sprzezony_wiersza_ograniczenia_zgodny_z_roznica_skonczona",
        ),
        mutacje=("M35", "M36", "M37"),
        bramka_ci="Walidacja fizyczna dynamiki",
        zakres_waznosci=(
            "wyspa, w ktorej ZADNE urzadzenie nie wnosi pradu ani dI/dV (predykat "
            "`wyspy.urzadzenie_wnosi_do_algebry`); NIE obejmuje wyspy z samymi przeksztaltnikami "
            "nadaznymi (wnosza prad, wiec wyspa jest zywa — klasyfikacja tworzace/nadazne i "
            "bilans P/Q przed Newtonem to zakres D11 pelnego, karta AB-5); pierwiastek wyzszy "
            "jest dowodzony dla odbioru stalej mocy za impedancja od SEM stalej; blok -dE/dx "
            "wiersza ograniczenia dowodzony testem roznicowym na atrapie zrodla napieciowego i "
            "na zrodle testowym (jakobiany wobec roznicy skonczonej); przebieg zrodla "
            "testowego idealnego wobec postaci zamknietej — D-14"
        ),
        poziom="L5",
    ),
    Twierdzenie(
        ident="D-17",
        zdolnosc=(
            "Predykat izolacji: usuniecie zwarcia `izolacja` wymaga odciecia miejsca zwarcia "
            "w stanie PO zdarzeniach chwili (t+)"
        ),
        rownanie=(
            "dopuszczalne <=> skladowa spojna grafu galezi aktywnych stanu t+ zawierajaca "
            "miejsce zwarcia nie ma urzadzenia wnoszacego do algebry"
        ),
        wyrocznia=(
            "wyrocznia_zdarzen.miejsce_odizolowane — spojnosc grafu w `networkx` (zero importow "
            "z rdzenia), wszystkie 16 podzbiorow otwieranych galezi pierscienia"
        ),
        wzorzec="bramki.pierscien_d17: pierscien S-A-B-C, szyna sztywna w S, maszyna w C",
        testy=(
            "tests/walidacja_fizyczna/test_zdarzenia_rdzenia.py"
            "::test_d17_predykat_izolacji_zgodny_ze_spojnoscia_grafu",
            "tests/walidacja_fizyczna/test_bramki.py::test_g19_predykat_izolacji",
            "tests/network_model/dynamika/test_zwarcia_semantyka.py"
            "::test_predykat_izolacji_iloczyn_cech",
            "tests/e2e/test_so1a_scenariusz_odniesienia.py"
            "::test_dawny_scenariusz_z_usunieciem_izolacja_na_szynie_zasilanej_to_odmowa",
        ),
        mutacje=("M26",),
        bramka_ci="Walidacja fizyczna dynamiki",
        zakres_waznosci=(
            "zwarcie w wezle i w linii/kablu x*L; usuniecie `samoczynne` jest JAWNA "
            "idealizacja poza tym twierdzeniem (zapisywana w zalozeniach wyniku); chwila "
            "zadzialania aparatu jest dana wejsciowa scenariusza (SO-1A), nie wynikiem "
            "nastaw zabezpieczen (SO-1B)"
        ),
        poziom="L5",
    ),
    Twierdzenie(
        ident="D-19",
        zdolnosc=(
            "Elementy nieaktywne w t = 0 sa w rdzeniu: zamkniecie zdarzeniem daje macierz "
            "rozplywu migawki z elementem zamknietym"
        ),
        rownanie=(
            "Ybus_dyn(stan po zamknieciu) = Ybus_PF(migawka z elementem zamknietym); element "
            "nieaktywny nie jest stemplowany (Ybus t = 0 bitowo bez zmiany)"
        ),
        wyrocznia=(
            "`power_flow_newton_internal.build_ybus_pu` (tor rozplywu, FROZEN) — niezalezne "
            "zlozenie macierzy z grafu IR"
        ),
        wzorzec=(
            "siec G16: odlacznik rezerwowy (takze jako bezpiecznik), kabel poza ruchem, bateria "
            "wylaczona"
        ),
        testy=(
            "tests/enm/test_adapter_dynamiki.py::TestAktywnoscElementow"
            "::test_ybus_po_zalaczeniu_rowna_ybus_rozplywu_z_elementem_zamknietym",
            "tests/enm/test_adapter_dynamiki.py::TestAktywnoscElementow"
            "::test_ybus_t0_z_elementami_nieaktywnymi_jest_bitowo_ta_sama",
            "tests/enm/test_adapter_dynamiki.py::TestAktywnoscElementow"
            "::test_laczenia_na_sciezce_uzytkownika",
        ),
        mutacje=("M27",),
        bramka_ci="Python tests (pelna regresja backendu)",
        zakres_waznosci=(
            "linie, kable, transformatory, laczniki, bezpieczniki i baterie kondensatorow; "
            "prog 1e-9 jak w parytecie Ybus t = 0; ponowne przylaczenie ZRODLA "
            "(synchronizacja) jest poza twierdzeniem — kryteria dU/df/dtheta to zakres AB-5"
        ),
        poziom="L5",
    ),
    Twierdzenie(
        ident="D-21",
        zdolnosc="Zwarcie w linii/kablu w miejscu x*L jako czwornik Krona w rdzeniu",
        rownanie=(
            "Y_zred = Y_ee - Y_ei Y_ii^-1 Y_ie dla odcinkow pi (y/dx, B*dx) z admitancja "
            "zwarcia w wezle wewnetrznym; zwarcie metaliczne: wezel wewnetrzny uziemiony"
        ),
        wyrocznia=(
            "wyrocznia_pradow — gesta algebra z JAWNYM wezlem wewnetrznym (bez redukcji), "
            "uziemienie przez usuniecie wiersza i kolumny (zero importow z rdzenia)"
        ),
        wzorzec=(
            "bramki.zmierz_zwarcie_w_linii: zrodlo za impedancja, linia z susceptancja, "
            "bocznik na koncu; x w {0,1; 0,3; 0,5; 0,85} x {R_f > 0, metaliczne}"
        ),
        testy=(
            "tests/walidacja_fizyczna/test_zdarzenia_rdzenia.py"
            "::test_d21_zwarcie_w_linii_wobec_jawnego_wezla_wewnetrznego",
            "tests/walidacja_fizyczna/test_bramki.py::test_g16_zwarcie_w_linii",
            "tests/network_model/dynamika/test_zwarcia_semantyka.py"
            "::test_czwornik_przy_polozeniu_do_zera_daje_zwarcie_w_wezle_od",
        ),
        mutacje=("M34",),
        bramka_ci="Walidacja fizyczna dynamiki",
        zakres_waznosci=(
            "linie i kable (przekladnia 1) w skladowej zgodnej, zwarcie 3F; transformator i "
            "lacznik koncza sie odmowa `dynamika.zwarcie_galezi_nieobslugiwane`; model pi "
            "odcinkow (bez linii dlugiej o parametrach rozlozonych)"
        ),
        poziom="L5",
    ),
)

#: Twierdzenia karty AB-1b.1 (rdzen zdarzen): D-12, D-13, D-14, D-20 — pakiety P6-P8.
MANIFEST = MANIFEST + (
    Twierdzenie(
        ident="D-12",
        zdolnosc=(
            "Zdarzenia warunkowe (dozory): chwila przekroczenia progu lokalizowana z "
            "zadeklarowana tolerancja, akcja wykonana DOKLADNIE w t* (ze zwloka i kasowaniem), "
            "detektory przekroczen w wyniku"
        ),
        rownanie=(
            "h(t) = s (w(t) - prog), s = +1 (w_gore) / -1 (w_dol); t* = prawy koniec [a, b], "
            "h(a) <= 0 < h(b), b - a <= tolerancja; (a) rampa: t = t_0 + (prog - m_0)/tempo; "
            "(b) jeden krok trapezu czlonu dx/dt = (x_inf - x)/T: "
            "tau = 2T (1 - d)/(1 + d), d = (prog - x_inf)/(x_n - x_inf)"
        ),
        wyrocznia=(
            "wyrocznia_zdarzen.chwila_przeciecia_rampy, pierwiastek_kroku_trapezu, "
            "wezel_trajektorii_trapezu — postacie zamkniete (zero importow z rdzenia)"
        ),
        wzorzec=(
            "bramki.g14_lokalizacja_zdarzen_warunkowych: zrodlo idealne + linia + odbior, "
            "rampa -0,4 pu/s od 0,2 s przez prog 0,85 (detektor i akcja zatrzymania rampy), "
            "tolerancje 1e-6 i 1e-9 s, trapez i RK4; czlon inercyjny T = 0,05 s, h = 0,01 s; "
            "zapad 0,25 s wobec zwloki 0,3 s z kasowaniem i bez"
        ),
        testy=(
            "tests/walidacja_fizyczna/test_zdarzenia_rdzenia.py"
            "::test_d12_lokalizacja_zdarzen_warunkowych_wobec_postaci_zamknietych",
            "tests/walidacja_fizyczna/test_bramki.py::test_g14_lokalizacja_zdarzen_warunkowych",
            "tests/network_model/dynamika/test_dozory.py"
            "::test_przejscie_ciagle_obu_kierunkow_zgodne_z_siatka",
            "tests/network_model/dynamika/test_dozory.py"
            "::test_zwloka_i_kasowanie_przy_zapadzie_krotszym_niz_zwloka",
            "tests/network_model/dynamika/test_dozory.py"
            "::test_wynik_z_dozorami_nie_zalezy_od_pythonhashseed",
        ),
        mutacje=("M22", "M23", "M24"),
        bramka_ci="Walidacja fizyczna dynamiki",
        zakres_waznosci=(
            "wielkosci: modul napiecia wezla, czestotliwosc wezla (poza chwilami zdarzen i "
            "jakoscia NIEDOSTEPNA — tam przedzial nielokalizowany, z uczciwa szerokoscia od "
            "ostatniej oceny), modul pradu JAWNIE nazwanego zacisku galezi, stan i moc "
            "urzadzenia; jedno przejscie w kroku (dwa przejscia w jednym kroku, niewidoczne na "
            "jego koncu, nie sa wykrywane); tolerancja wzgledem trajektorii dyskretnej, "
            "wykonanie w t* co do bitu; akcje chwilowe (bez zwarc); w scenariuszu wylacznie "
            "detektory — akcje przychodza z modelu (automatyka, przekazniki)"
        ),
        poziom="L5",
    ),
    Twierdzenie(
        ident="D-13",
        zdolnosc=(
            "Przypisanie stanu i komenda regulacji P/Q/U: stany nieprzypisane bitowo ciagle, "
            "stan przypisany = wartosc zadana, algebra rozwiazana od nowa"
        ),
        rownanie=(
            "x+_j = x-_j (j nieprzypisane), x+_k = w_k, 0 = g(x+, y+); maszyna klasyczna: "
            "d(delta)/dt = w_0 (w - 1), d(w)/dt = (P_m(t) - P_e)/(2H) z P_m skokowym"
        ),
        wyrocznia=(
            "wyrocznia.UkladSMIB.calkuj(skoki_p_m=...) — solve_ivp DOP853 z podzialem na "
            "odcinki w chwilach skokow (zero importow z rdzenia)"
        ),
        wzorzec=(
            "bramki.g18_przypisanie_stanu: SMIB, P_m 0,8 -> 0,9 w 0,2 s (rownowaga) i -> 0,75 "
            "w 0,7 s (w trakcie wahan), trapez h = 5e-4 s, horyzont 1,5 s"
        ),
        testy=(
            "tests/walidacja_fizyczna/test_zdarzenia_rdzenia.py"
            "::test_d13_przypisanie_stanu_wobec_wyroczni_rownania_wahan",
            "tests/walidacja_fizyczna/test_bramki.py::test_g18_przypisanie_stanu",
            "tests/network_model/dynamika/test_przypisania_stanu.py"
            "::test_komenda_wykonana_na_kazdej_rodzinie",
            "tests/network_model/dynamika/test_przypisania_stanu.py"
            "::test_przypisanie_i_zdarzenie_topologiczne_w_tej_samej_chwili",
        ),
        mutacje=("M25",),
        bramka_ci="Walidacja fizyczna dynamiki",
        zakres_waznosci=(
            "stany zadeklarowane przez klase jako przypisywalne (nastawy i odniesienia "
            "regulatorow, stany profilu zrodla testowego); trajektoria wobec wyroczni "
            "dowodzona dla maszyny klasycznej bez regulatorow; tablica komend P/Q/U rodzin "
            "biblioteki i zakres nastawy (okno mocy, granice turbiny) — testy iloczynu cech bez "
            "wyroczni fizycznej rodzin (poziom modeli rodzin: UNVALIDATED_MODEL)"
        ),
        poziom="L5",
    ),
    Twierdzenie(
        ident="D-14",
        zdolnosc=(
            "Zrodlo testowe stanowiska: SEM o profilu amplitudy, czestotliwosci i fazy "
            "calkowana bez bledu dyskretyzacji; przy Z = 0 napiecie wezla i czestotliwosc "
            "narzucone"
        ),
        rownanie=(
            "dm/dt = r_m, d(theta)/dt = w_0 dw, d(dw)/dt = r_w, E = m e^{j(theta + phi)}; "
            "Z = 0: V = E, f = f_n (1 + dw)"
        ),
        wyrocznia=(
            "wyrocznia_zdarzen.profil_zamkniety — postac zamknieta odcinkami wielomianowa "
            "liczona wprost z listy segmentow (zero importow z rdzenia)"
        ),
        wzorzec=(
            "bramki.g15_zrodlo_testowe: skok U 1,0 -> 0,5 pu w 0,2 s, rampa 0,4 pu/s od 1,0 s "
            "przez 1 s, skok fazy 30 st. w 1,5 s, rampa f 0,5 Hz/s od 2,0 s przez 1 s; Z = 0 "
            "i Z = 0,001 + j0,02 pu; trapez i RK4"
        ),
        testy=(
            "tests/walidacja_fizyczna/test_zdarzenia_rdzenia.py"
            "::test_d14_zrodlo_testowe_wobec_postaci_zamknietej",
            "tests/walidacja_fizyczna/test_bramki.py::test_g15_zrodlo_testowe",
            "tests/network_model/dynamika/test_zrodlo_testowe.py"
            "::test_profil_wobec_postaci_zamknietej",
            "tests/network_model/dynamika/test_zrodlo_testowe.py"
            "::test_zrodlo_idealne_narzuca_napiecie_i_czestotliwosc_wezla",
        ),
        mutacje=("M31",),
        bramka_ci="Walidacja fizyczna dynamiki",
        zakres_waznosci=(
            "skladowa zgodna; profil opisuje SEM (przy Z = 0 napiecie punktu przylaczenia); "
            "amplituda nieujemna (ogranicznik amplitudy); impedancja Z_Q modelu albo zerowa; "
            "tryb stanowiska wylacznie z komendami regulacji badanego urzadzenia (bez zaklocen "
            "sieci w tym samym biegu)"
        ),
        poziom="L5",
    ),
    Twierdzenie(
        ident="D-20",
        zdolnosc="Czesciowa utrata zrodla: agregat identycznych jednostek z ubytkiem udzialu",
        rownanie=(
            "I_agregatu = u I(x, V), dx/dt = f(x, V) bez skalowania; (a) agregat u = 0,5 == "
            "dwie polowy z odlaczeniem jednej; (b) d(w_i)/dt(0+) = (P_m,i - P_e,i(0+))/(2H_i), "
            "srodek bezwladnosci: -dP/(2 sum H)"
        ),
        wyrocznia=(
            "(b) wyrocznia_pradow.rozwiaz_siec_liniowa — maszyny jako SEM za X', PV jako zrodlo "
            "pradu, odbiory jako admitancje (zero importow z rdzenia); (a) jest relacja "
            "metamorficzna dwoch konfiguracji produktu, nie wyrocznia niezalezna"
        ),
        wzorzec=(
            "bramki.g21_utrata_czesciowa: (a) GFL 30 MVA ze statyzmami zerowymi i maszyna "
            "klasyczna 100 MVA z szyna sztywna, udzial 0,5 w 0,2 s; (b) wyspa GA (H = 3 s), "
            "GB (H = 5 s), PV, odbiory-admitancje, udzial 0,6 w t = 0"
        ),
        testy=(
            "tests/walidacja_fizyczna/test_zdarzenia_rdzenia.py"
            "::test_d20_agregat_z_udzialem_polowy_rowny_dwom_polowom_z_odlaczeniem",
            "tests/walidacja_fizyczna/test_zdarzenia_rdzenia.py"
            "::test_d20_przyspieszenie_wyspy_po_czesciowej_utracie_wobec_algebry_wyroczni",
            "tests/walidacja_fizyczna/test_bramki.py::test_g21_utrata_czesciowa",
            "tests/network_model/dynamika/test_przypisania_stanu.py"
            "::test_czesciowa_utrata_malejaco_skaluje_prad_i_zachowuje_stany",
        ),
        mutacje=("M33",),
        bramka_ci="Walidacja fizyczna dynamiki",
        zakres_waznosci=(
            "agregat identycznych jednostek rownoleglych o sprzezeniu pradowym; ubytek nie "
            "zmienia stanu na jednostke; rownowaznosc (a) dowodzona dla przeksztaltnika "
            "nadaznego ze statyzmami ZEROWYMI i maszyny klasycznej — statyzmy P/f i Q/U "
            "przeksztaltnika nie sa dzis przeliczane na baze ukladu (defekt nazwany w "
            "`zbuduj_rdzen_gfl`, poprawka fizyki w karcie AB-1b.2), wiec agregat ze statyzmem "
            "nie jest rownowazny swoim jednostkom; szyna sztywna i zrodlo testowe — odmowa"
        ),
        poziom="L5",
    ),
)

#: Poziomy, dla ktorych kontrakt wymaga KOMPLETU (mutacja + bramka + testy).
POZIOMY_WYMAGAJACE_KOMPLETU = ("L5",)


__all__ = ["MANIFEST", "POZIOMY_WYMAGAJACE_KOMPLETU", "Twierdzenie"]
