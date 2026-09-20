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
            "wielkosc jest NIEDOSTEPNA, a nie przyblizona"
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
            "trojfazowe symetryczne usuwane bez zmiany topologii pozwarciowej"
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
        zakres_waznosci="zdarzenia zmieniajace Ybus albo wstrzykniecia; zero zmian stanu wirnika",
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
            "odbior o stalej mocy i wyspy bez zrodla; NIE obejmuje wyspy martwej BEZ odbioru "
            "(V = 0 jest wtedy rozwiazaniem fizycznym, ktorego ten rdzen nie reprezentuje — "
            "konczy sie osobliwym jakobianem i odmowa `dynamika.algebra_niezbiezna`)"
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

#: Poziomy, dla ktorych kontrakt wymaga KOMPLETU (mutacja + bramka + testy).
POZIOMY_WYMAGAJACE_KOMPLETU = ("L5",)


__all__ = ["MANIFEST", "POZIOMY_WYMAGAJACE_KOMPLETU", "Twierdzenie"]
