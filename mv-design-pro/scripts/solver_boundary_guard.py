#!/usr/bin/env python3
"""SolverBoundaryGuard — granica warstwy solverów: zmiany chronionych rdzeni
oraz granica importów nowego rdzenia dynamiki.

CZĘŚĆ 1 (delta): sprawdza git diff i failuje, jeśli dotknięte są chronione pliki
rdzeni — cała lista B-01 (`scripts/rdzenie_b01.py`, jedno źródło z odciskiem
`solver_diff_guard`) i `DODATKOWE_CHRONIONE` — bez sankcji.

SANKCJE (2026-07-22): zmiana chronionego pliku jest dopuszczalna WYŁĄCZNIE
z jawną sankcją w SANCTIONED_CHANGES (ścieżka -> wpis rejestru V12K-*
z uzasadnieniem). Guard pozostaje czerwony dla każdej nieusankcjonowanej
zmiany — sankcja jest audytowalna i punktowa, nie wyłącza ochrony.

CZĘŚĆ 2 (statyczna, karta W6-2 §0 p.1): rdzeń dynamiki RMS
(`network_model/solvers/dynamika/**`) powstał OBOK zamrożonych rdzeni, nie w
nich (B-01). „Obok" znaczy także: bez importu z nich i bez importu warstw nad
nimi. Ta część NIE jest drugą kopią sprawdzenia — woła
`scripts/dynamika_granica_importow.py`, czyli TĘ SAMĄ implementację, którą
uruchamia samodzielna bramka `dynamika_granica_importow_guard.py`. Dwie kopie
listy dozwolonych modułów „zgadzałyby się dziś" i rozjechały przy pierwszym
nowym imporcie (reguła KLASA, NIE INSTANCJA).
"""
import sys
from pathlib import Path

from dynamika_granica_importow import KATALOG_PAKIETU as KATALOG_PAKIETU_DYNAMIKI
from dynamika_granica_importow import raport as raport_granicy_dynamiki
from guard_diff_base import zmienione_pliki
from rdzenie_b01 import sciezki_b01

#: Pliki chronione SPOZA listy B-01 (`rdzenie_b01.py`), pilnowane tą samą sankcją: jądra
#: wspólne z rdzeniem zwarć albo jedyne wejścia fizyki, których zmiana jest zmianą liczb
#: rdzenia, choć same nie są na liście właściciela.
DODATKOWE_CHRONIONE: tuple[str, ...] = (
    # Wpis-widmo `short_circuit_iec60909_internal.py` (plik NIGDY nie istnial w
    # historii repo — zmierzone `git log --all`; karta ALLOWLIST-WIDMA 2026-08-12)
    # zastapiony REALNYMI plikami wewnetrznymi solvera SC:
    "backend/src/network_model/solvers/short_circuit_asymmetrical_quantities.py",
    # `backend/src/domain/protection_engine_v1.py` zdjęty: plik skasowany w karcie
    # RESULTSET-MARTWE-MAPPERY (2026-09-30, zgoda B-01 w O-59) — drugi silnik
    # zabezpieczeń bez konsumenta; bramka wskrzeszenia w `resultset_v1_schema_guard.py`.
    # Karta W5-E-TTIT (decyzja O-59 OD-25, 2026-09-30): JEDYNE wejście fizyki Ik1 nN
    # (`compute_fault_loop`, dyspozycja po układzie) i pętla doziemna TT/IT (jądro sumowania
    # składowych i prądu z pętli wspólne z TN — ADR-015 „jedna fizyka Ik1 nN").
    "backend/src/network_model/solvers/fault_loop_iec60364.py",
    "backend/src/network_model/solvers/petla_zwarcia_tt_it.py",
)

#: Ścieżki chronione: CAŁA lista B-01 (jedno źródło `rdzenie_b01.py`, wpis-katalog z `/`
#: obejmuje każdy plik w nim, także nowy) + `DODATKOWE_CHRONIONE`. Partia integracji 10:
#: dawna ręczna lista pomijała rozpływ NR/GS/FD, NC RfG z profilami, FRT/HVRT, WLS, stan
#: fazowy SN i V12.6 — zmiana tych rdzeni przechodziła bez sankcji.
WATCHED_PATHS: list[str] = [f"backend/src/{sciezka}" for sciezka in sciezki_b01()] + list(
    DODATKOWE_CHRONIONE
)

# Usankcjonowane zmiany chronionych plików na bieżącej gałęzi programu
# (docs/v12xx/REJESTR_KONFLIKTOW.md). Wpis usuwamy po scaleniu do main.
SANCTIONED_CHANGES = {
    "backend/src/network_model/solvers/short_circuit_iec60909.py": (
        "V12K-120: FIX pre-existing (wymiar wektora iniekcji w "
        "_build_branch_contributions_for_inverters dla scalonych wezlow) "
        "+ test regresyjny; dowod addytywnosci to_dict testem. "
        "V12K-128: delta FROZEN zatwierdzona przez wlasciciela - z1/z2/z0 "
        "addytywnie. "
        "V12K-132: rozszerzenie WHITE BOX wkladow galeziowych o tor Thevenina "
        "(rozplyw pradu od zrodla zastepczego po galeziach) - pkt 7 karty "
        "wlasciciela; addytywnie (branch_flow_trace + wpisy source_id="
        "'THEVENIN_GRID'), wpis do usuniecia po scaleniu do main. "
        "V12K-178 (SM-1): korekcja K_T IEC 60909 par. 3.3.3 dla TR sieciowych, "
        "twarde wg decyzji wlasciciela V12K-175, WHITE BOX + re-baseline "
        "goldenow z dowodem; wpis do usuniecia po scaleniu do main. "
        "V12K-184: FIX pre-existing - wklad zrodel przeksztaltnikowych (IEC "
        "60909-0 par. 6.8, zrodlo pradowe) wchodzil do zwarcia 1:1 w amperach, "
        "bez przeniesienia przez przekladnie ani podzialu Z-bus; parametr "
        "fault_node_id byl przyjmowany i ignorowany. Skutek: 15 mikrozrodel "
        "0,4 kV dawalo 21,5 kA na szynie 15 kV. Naprawa: I_k = I_j*|Z_kj/Z_kk|"
        "*(U_j/U_k), zero heurystyk, WHITE BOX. Przy okazji naprawione "
        "mieszanie jednostek pu/SI w torze wkladow galeziowych falownikow "
        "(iniekcja jednostkowa + _series_admittance_pu). Dla zrodla W wezle "
        "zwarcia wspolczynnik = 1 -> bit-identycznosc. Wpis do usuniecia po "
        "scaleniu do main. "
        "V12K-186: model transformatora w sieci zwarciowej dostal PRZEKLADNIE "
        "poza-znamionowa (zmiana bazy napieciowej + zaczep). Tor wkladow "
        "galeziowych liczy teraz prad strony from jako (V_from/a^2 - V_to/a)*y "
        "zamiast (V_from - V_to)*y; dla a = 1 (szyny zgodne z tabliczka, brak "
        "zaczepu) wynik bit-identyczny. Zmiana sygnatury _series_admittance_pu "
        "na (y, a) — bez niej rozpakowanie lapaloby ValueError i CICHO gasilo "
        "wklady galeziowe. Wpis do usuniecia po scaleniu do main. "
        "O-59 (plan A/B par. 12.2 (d)(k)(m), karta B01-RUNDA-3): runda tekstowa, "
        "zero zmian liczbowych - adnotacje typow parametrow _inverter_transfer_factors "
        "(mypy), odmowa wejscia jako rekord strukturalny (kod + odwolanie do wezla/"
        "galezi, tresc PL bez identyfikatora), wymog niepustej nazwy galezi w "
        "eksploatacji przed biegiem (nazwana odmowa), tytuly krokow sladu z nazwa "
        "galezi z modelu (klucze krokow bez zmian). "
        "Decyzja B-01 partii integracji 9 (O-59): odmowa wezla zwarcia spoza grafu skladana "
        "jedna funkcja z `short_circuit_core` (jeden kod, zero zmian liczb). "
        "Wpis do usuniecia po scaleniu do main."
        " Decyzja B-01 partii integracji 10 (OD-14, delegacja O-59): impedancja przejscia Z_f"
        " = R_f + jX_f ADDYTYWNIE (parametr opcjonalny; brak Z_f albo Z_f = 0 -> wynik bit w "
        "bit jak przed karta, goldeny bez zmian), petle w jednym toku _oblicz_zwarcie dla "
        "czterech rodzajow, krok WHITE BOX Z_f, pola addytywne wyniku "
        "z_f_ohm/zkk_metaliczne_ohm/ikss_metaliczny_a/poza_zakresem_iec60909 (exclude_none), "
        "wklady falownikow i galeziowe z ta sama Z_f - kontrakt "
        "docs/domain/KONTRAKT_SCENARIUSZY_ZWARCIOWYCH_TRYB_IMPEDANCE.md; testy "
        "tests/network_model/solvers/test_zwarcie_przez_impedancje_przejscia.py. Wpis do "
        "usuniecia po scaleniu do main."
        " Decyzja B-01 pozycja (n) planu A/B (karta SC-IB-ITH-ZRODLA, delegacja O-59 - odbior "
        "przez sesje glowna z niezalezna weryfikacja): ib_a = SYMETRYCZNY prad wylaczeniowy wg "
        "IEC 60909-0:2016 rozdz. 9 (bez maszyn I_b = I_k''; z maszynami I_k'' - suma "
        "dU_m/(c*Un/sqrt3)*(1-mu*q)*I_k,m'' z mu/q z machine_sc_iec60909 - jedna implementacja); "
        "dawny wzor I_k''*sqrt(1+((kappa-1)e^(-t_b/t_a))^2) usuniety (mieszal skladowa "
        "nieokresowa do I_b). ZMIANA LICZB ib_a usankcjonowana kartą; addytywnie i_dc_a = "
        "sqrt2*I_k''*e^(-2*pi*f*t_b*R/X) (rozdz. 10) i krok sladu iDC; koniec cichej stalej "
        "0,1 s w czterech sygnaturach; zwarcia niesymetryczne I_b = I_k''. Wyrocznia "
        "4 563,542872 A (iec60909_example), test "
        "tests/network_model/solvers/test_prad_wylaczeniowy_iloczyn_cech.py. "
        "Wpis do usuniecia po scaleniu do main."
        " Decyzja B-01 pozycja (n) planu A/B (karta TB-WARTOSC-ROBOCZA, delegacja O-59, zasada "
        "nr 4 / V12K-351): brak t_b nie blokuje obliczen - rdzen dostaje t_b PUNKTU ZWARCIA "
        "jako obowiazkowy nosnik `CzasWylaczeniaTb` (wartosc + pochodzenie PROJEKTANT / Z_POL / "
        "PROPOZYCJA) zamiast `tb_s: float | None`; galaz None (I_b z maszynami i i_DC puste, "
        "kod brakowy) skasowana; addytywnie pole wyniku tb_zrodlo (exclude_none - None dla t_b "
        "projektanta, wiec wynik i slad biegu z t_b projektanta bit w bit jak przed karta, "
        "sonda 15 odciskow); publiczne prad_poczatkowy_a (ta sama petla _petla_zwarcia) dla "
        "czasu pol lokalnych; martwe compute_ikss_3ph (0 uzyc) usuniete. Testy "
        "tests/network_model/solvers/test_czas_tb_punktu_zwarcia.py. Wpis do usuniecia po "
        "scaleniu do main."
    ),
    "backend/src/network_model/solvers/short_circuit_core.py": (
        "Decyzja B-01 partii integracji 9 (delegacja O-59, klasa par. 12.2 (k)): jadro "
        "impedancji zastepczej odmawia wezla zwarcia spoza grafu rekordem strukturalnym "
        "(`OdmowaWejsciaRdzenia`, kod `zwarcie.wezel_zwarcia_spoza_grafu`, wezel w odwolaniu, "
        "tresc PL bez identyfikatora) zamiast golego ValueError z identyfikatorem w tresci; "
        "kod i funkcja odmowy - jedno zrodlo dla walidacji wejscia solvera IEC 60909. Zero "
        "zmian liczb. Wpis do usuniecia po scaleniu do main."
        " Decyzja B-01 partii integracji 10 (OD-14, delegacja O-59): impedancja przejscia Z_f"
        " = R_f + jX_f ADDYTYWNIE (parametr opcjonalny; brak Z_f albo Z_f = 0 -> wynik bit w "
        "bit jak przed karta, goldeny bez zmian), petle 3F Z1+Zf, 2F Z1+Z2+Zf, 1F "
        "Z1+Z2+Z0+3Zf, 2F+G Z1+Z2(Z0+3Zf)/(Z2+Z0+3Zf) w impedancji zastepczej - kontrakt "
        "docs/domain/KONTRAKT_SCENARIUSZY_ZWARCIOWYCH_TRYB_IMPEDANCE.md; testy "
        "tests/network_model/solvers/test_zwarcie_przez_impedancje_przejscia.py. Wpis do "
        "usuniecia po scaleniu do main."
        " Decyzja B-01 pozycja (n) planu A/B (karta SC-IB-ITH-ZRODLA, delegacja O-59): jadro "
        "wielkosci po zwarciu liczy I_b symetryczny (rozdz. 9), skladowa nieokresowa "
        "i_DC(t_b) (rozdz. 10) i I_th = I_k''*sqrt(m+n) z n = 1 (udokumentowane) jako JEDYNE "
        "zrodlo dla 3F/2F/1F/2F+G i toru dowodowego SC1; t_b z danych biegu (karta "
        "TB-WARTOSC-ROBOCZA: t_b punktu zwarcia zawsze rozstrzygniety, bez zmian w tym pliku). "
        "Zmiana liczb ib_a usankcjonowana karta. Wpis do usuniecia po scaleniu do main."
    ),
    "backend/src/network_model/solvers/power_flow_newton_internal.py": (
        "V12K-180 (SM-2): przesuniecie fazowe grupy polaczen w PF, twarde wg "
        "V12K-175, WHITE BOX + re-baseline katow goldenow z dowodem |V| "
        "niezmienione; wpis do usuniecia po scaleniu do main. "
        "N1-WYDAJNOSC: build_jacobian_v2 sklada jakobian BLOKOWO zamiast petla "
        "skalarna. Zmiana WYLACZNIE sposobu skladania, ZERO zmian fizyki i ZERO "
        "zmian wyniku: kazdy wyraz liczony tym samym wyrazeniem w tej samej "
        "kolejnosci dzialan, zaden wyraz nie pomijany (znak zera zachowany), brak "
        "jakiejkolwiek redukcji po osi (kolejnosc sumowania nie istnieje, wiec nie "
        "moze sie zmienic). Powod: 76 % czasu wlasnego enumeracji N-1 na substracie "
        "53 stacji. Dowod bitowy: tests/network_model/solvers/"
        "test_jacobian_v2_skladanie.py — porownanie z referencyjna petla skalarna "
        "na WZORCU BITOW oraz pelny artefakt biegu (wynik + slad WHITE BOX) "
        "bit-w-bit na 4 sieciach (promieniowa, pierscien, SN/nN z OZE, substrat "
        "53 stacji); dodatkowo sha256 pelnego widoku N-1 dla 142 kontyngencji "
        "identyczny przed i po. Wpis do usuniecia po scaleniu do main. "
        "O-59 (plan A/B par. 12.2 (d)(k), karta B01-RUNDA-3): runda tekstowa, zero "
        "zmian liczbowych - nazwy zmiennych petli walidatora i budowy wektora mocy "
        "(mypy: jedna zmienna dla roznych typow), odmowy walidatora wejscia i "
        "przekladni <= 0 jako rekordy strukturalne (kod + odwolanie, tresc PL bez "
        "identyfikatora; te same predykaty w tej samej kolejnosci). Wpis do usuniecia "
        "po scaleniu do main."
    ),
    "backend/src/network_model/solvers/state_estimation_wls.py": (
        "B-01 (j) (O-59, plan A/B par. 12.2): prog chi^2 testu J(x) wylacznie z "
        "scipy.stats.chi2.ppf, bez cichej aproksymacji Wilsona-Hilferty'ego; brak scipy = "
        "odmowa nazwana. Pomiar przy partii integracji 10 (rozszerzenie WATCHED_PATHS na "
        "cala liste B-01): jedyna zmiana pliku wobec main. Wpis do usuniecia po scaleniu "
        "do main."
    ),
    "backend/src/network_model/solvers/v126_academic.py": (
        "O-59 (plan A/B par. 12.2 (d)(k), karta B01-RUNDA-3 i decyzja B-01 partii 9): "
        "typy i teksty, zero zmian liczbowych; odmowa bilansu strat bez P0 transformatora "
        "jako rekord strukturalny. Decyzja B-01 partii integracji 10: brak pol karty "
        "falownika dla Z_conv(f) jako odmowa strukturalna (kod + odwolanie do "
        "przeksztaltnika, tresc PL z nazwami wielkosci, jedno zrodlo listy brakow) zamiast "
        "golego ValueError z kluczami pol. Wpis do usuniecia po scaleniu do main."
    ),
    "backend/src/network_model/solvers/short_circuit_asymmetrical_quantities.py": (
        "PACK-DOWODY: ADDYTYWNE 18 linii — stala definicyjna OPERATOR_FORTESCUE_A "
        "(IEC 60909-0:2016) przeniesiona do warstwy solvera, zeby klient HTTP nie "
        "niosl wielkosci fizycznej; zero zmian istniejacych sciezek. Wpis do "
        "usuniecia po scaleniu do main."
        " Decyzja B-01 partii integracji 10 (OD-14, delegacja O-59): impedancja przejscia Z_f"
        " = R_f + jX_f ADDYTYWNIE (parametr opcjonalny; brak Z_f albo Z_f = 0 -> wynik bit w "
        "bit jak przed karta, goldeny bez zmian), petle w wielkosciach SC1 (pradach "
        "skladowych) z ta sama Z_f co rdzen - kontrakt "
        "docs/domain/KONTRAKT_SCENARIUSZY_ZWARCIOWYCH_TRYB_IMPEDANCE.md; testy "
        "tests/network_model/solvers/test_zwarcie_przez_impedancje_przejscia.py. Wpis do "
        "usuniecia po scaleniu do main."
        " Decyzja B-01 pozycja (n) planu A/B (karta SC-IB-ITH-ZRODLA, delegacja O-59): "
        "compute_sc1_asymmetrical_quantities bierze t_k i liczy kappa, i_p, m, n i I_th przez "
        "rdzen (compute_post_fault_quantities) z R/X petli danego rodzaju zwarcia - koniec "
        "drugiej implementacji I_th (wejscia m_factor/n_factor wolajacego) w torze dowodowym "
        "SC1; I_b zwarc niesymetrycznych = I_k'' (IEC 60909-0 rozdz. 9). Goldeny "
        "tests/golden/sc_asymmetrical/* przeliczone (n = 1, m z kappa; kappa bez zmian). "
        "Wpis do usuniecia po scaleniu do main."
    ),
    "backend/src/network_model/solvers/fault_loop_iec60364.py": (
        "W5-E-TTIT (O-59 OD-25, D-11-fault_loop-TT-IT): kasacja NotImplementedError dla "
        "ukladow TT/IT -> dyspozycja po network_type do `petla_zwarcia_tt_it` przez to samo "
        "wejscie `compute_fault_loop`; jadro `zsumuj_skladowe_petli`/`prad_z_petli` wydzielone "
        "i wspolne z TN; pola ADDYTYWNE `FaultLoopInput.dane_tt_it`, `FaultLoopResult.tt_it` "
        "(to_dict dopisuje `tt_it` tylko gdy obecne). Dowod bit-identycznosci TN: "
        "tests/test_petla_tn_tozsamosc_w5e_ttit.py (18 przypadkow, sha256 to_dict przed/po). "
        "Wpis do usuniecia po scaleniu do main."
    ),
    "backend/src/network_model/solvers/petla_zwarcia_tt_it.py": (
        "W5-E-TTIT (O-59 OD-25): NOWY modul pętli doziemnej TT (I_d przez R_A+R_B, "
        "U_dotyk = R_A*I_dn) i IT (I_d = 3*omega*C_e*U_0 z b_0 odcinkow, drugie zwarcie "
        "L-PE-L z Z1 transformatora), WHITE BOX; limity normy NIE sa w kodzie (BRAK_PODSTAWY "
        "w werdykcie). Decyzja B-01 partii integracji 10: odmowy danych TT/IT bez kluczy "
        "pol w tresci (symbol i opis wielkosci z jednej mapy OPISY_DANYCH_TT_IT), odmowa "
        "danych odcinka IT jako rekord strukturalny (kod + odwolanie do galezi, tresc PL bez "
        "identyfikatora). Zero zmian liczb. Wpis do usuniecia po scaleniu do main."
    ),
    "backend/src/network_model/solvers/protection_iec60255.py": (
        "O-59 OD-15(e) (karta PROT-LTI, 2026-09-30): krzywa 120/(M-1) nazywala sie "
        "w jadrze RI (myla sie z charakterystyka RI ASEA/ABB, inny wzor) - przemianowana "
        "na LONG_TIME_INVERSE o wartosci LTI, etykieta Odwrotna dlugoczasowa (LTI, 120). "
        "Zero zmian liczb: stale, wzor LaTeX i wszystkie wielkosci WHITE BOX bit w bit "
        "(tests/network_model/solvers/test_protection_lti_tozsamosc.py na migawce z "
        "f3c435b6). "
        "Decyzja B-01 partii integracji 9 (delegacja O-59): para nazw NI/SI tej samej krzywej "
        "0,14/0,02 ujednolicona do STANDARD_INVERSE o wartosci SI (literal modelu IEC_SI = kod "
        "katalogu IED = adapter iec_curves); etykieta DT z polskimi znakami; cytat stalych "
        "poprawiony na IEC 60255-151:2009 zal. A tab. A.1. Liczby bit w bit (ta sama migawka). "
        "Wpis do usuniecia po scaleniu do main."
    ),
}


def sprawdz_granice_dynamiki(katalog: Path = KATALOG_PAKIETU_DYNAMIKI) -> int:
    """Granica importów rdzenia dynamiki (karta W6-2 §0 p.1) — 0 = zielono. Katalog skanu
    parametrem, żeby test mógł sprawdzić wpięcie na kopii pakietu (nigdy w żywym drzewie).
    """
    liczba_plikow, naruszenia = raport_granicy_dynamiki(katalog)
    if liczba_plikow == 0:
        print(
            "BŁĄD [SolverBoundaryGuard]: pakiet `network_model/solvers/dynamika` nie ma "
            "ani jednego pliku — pusty skan nie jest sukcesem."
        )
        return 1
    if naruszenia:
        print("BŁĄD [SolverBoundaryGuard]: rdzeń dynamiki narusza granicę importów:")
        for naruszenie in naruszenia:
            print(f"  - {naruszenie}")
        return 1
    print(
        f"OK [SolverBoundaryGuard]: rdzeń dynamiki — {liczba_plikow} plików, "
        "0 naruszeń granicy importów."
    )
    return 0


def main() -> int:
    kod_granicy_dynamiki = sprawdz_granice_dynamiki()
    # Baza porownania z odpornego helpera: brak bazy => JAWNY blad, nigdy
    # ciche „nic sie nie zmienilo" (patrz scripts/guard_diff_base.py).
    wynik = zmienione_pliki()
    if not wynik.ok:
        print(wynik.powod_bledu)
        return 1
    changed = list(wynik.pliki or ())
    violations = []
    sanctioned = []
    for path in changed:
        for watched in WATCHED_PATHS:
            if path.endswith(watched) or watched in path:
                if watched in SANCTIONED_CHANGES:
                    sanctioned.append((path, SANCTIONED_CHANGES[watched]))
                else:
                    violations.append(path)

    for path, powod in sorted(set(sanctioned)):
        print(f"SANKCJA [SolverBoundaryGuard]: {path}")
        print(f"  {powod}")

    if violations:
        print("BŁĄD [SolverBoundaryGuard]: zmiana chronionych rdzeni bez sankcji.")
        print("Zmienione pliki chronione:")
        for v in sorted(set(violations)):
            print(f"  - {v}")
        print()
        print(
            "Rdzeń z listy B-01 (`scripts/rdzenie_b01.py`) zmienia się wyłącznie z decyzją "
            "właściciela nazwaną w SANCTIONED_CHANGES."
        )
        return 1

    print("OK [SolverBoundaryGuard]: Brak zmian w chronionych plikach solverów.")
    return kod_granicy_dynamiki


if __name__ == "__main__":
    sys.exit(main())
