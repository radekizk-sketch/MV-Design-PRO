"""HARNESS MUTACJI: wstrzykniecie defektu fizycznego i sprawdzenie, czy bramki go widza.

PO CO. Zielona bramka nie dowodzi niczego, dopoki nie wiadomo, CO potrafi zaczerwienic.
Mutacja jest odwrotnoscia testu: psujemy jedno rownanie i zadamy, zeby aparat dowodowy
to zglosil. Mutacja, ktora PRZEZYWA, jest defektem ZESTAWU BRAMEK — i tak jest
raportowana, nie jako „drobiazg".

IZOLACJA. Zadna mutacja nie dotyka drzewa roboczego. Dla kazdej powstaje katalog
tymczasowy z LUSTREM `src/` zlozonym z dowiazan symbolicznych (`cp -as`); podmieniany
jest wylacznie ten JEDEN plik, ktory mutacja psuje, a bramki biegna w osobnym procesie
z `PYTHONPATH` wskazujacym lustro. Przerwanie biegu nie zostawia zmutowanego repo.

SAMOKONTROLA HARNESSU (R10 par. 24). Harness, ktory melduje „zabite" dla zmiany bez
skutku, jest gorszy od braku harnessu, bo produkuje falszywa pewnosc. Dlatego kazda
mutacja jest KWALIFIKOWANA przed biegiem przez porownanie DRZEW SKLADNIOWYCH pliku
przed i po podmianie:

* tekst sie nie zmienil            -> `BEZ ZMIANY TEKSTU` (wzorzec nie pasuje do zrodla),
* tekst inny, AST identyczne       -> `MUTACJA NIEWAZNA` (zmiana bez skutku, np. komentarz),
* AST inne, bramki czerwone/wyjatek-> `ZABITA`,
* AST inne, bramki zielone         -> `PRZEZYLA` (luka w zestawie bramek).

Wariant „MUTACJA NIEWAZNA" NIGDY nie jest liczony jako zabicie — pilnuje tego wlasny
test harnessu, ktory wstrzykuje zmiane samego komentarza.
"""

from __future__ import annotations

import ast
import json
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

KORZEN_BACKENDU = Path(__file__).resolve().parents[2]
KATALOG_ZRODEL = KORZEN_BACKENDU / "src"


@dataclass(frozen=True)
class Mutacja:
    """Jeden wstrzykiwany defekt: co psuje fizycznie i ktora bramka ma to zlapac."""

    ident: str
    defekt_fizyczny: str
    plik: str
    przed: str
    po: str
    oczekiwany_detektor: str
    bramki: tuple[str, ...] = ()
    testy: tuple[str, ...] = ()


#: Zamkniety zestaw mutacji rdzenia dynamiki. Kazda psuje INNE rownanie albo INNY
#: mechanizm ochronny; oczekiwany detektor jest nazwany, wiec „zabite przez cokolwiek"
#: nie przechodzi za dowod.
MUTACJE: tuple[Mutacja, ...] = (
    Mutacja(
        "M10",
        "Odwrocony znak tlumienia w rownaniu wahan: moment tlumiacy zaczyna "
        "pompowac energie zamiast ja rozpraszac.",
        "network_model/solvers/dynamika/urzadzenia/maszyna_klasyczna.py",
        "- self.d_pu * odchylka_predkosci",
        "+ self.d_pu * odchylka_predkosci",
        "G4 (tlumienie modu) oraz G12 (monotoniczny spadek energii przy D > 0)",
        bramki=("g2_g4_mod_elektromechaniczny", "g11_g12_energia"),
    ),
    Mutacja(
        "M11",
        "Odwrocony znak mocy elektrycznej: maszyna przyspiesza tam, gdzie powinna hamowac.",
        "network_model/solvers/dynamika/urzadzenia/maszyna_klasyczna.py",
        "                    - moc_elektryczna\n",
        "                    + moc_elektryczna\n",
        "G2 (czestotliwosc modu), G3 (ROCOF), G11 (calka pierwsza)",
        bramki=("g2_g4_mod_elektromechaniczny", "g3_rocof_w_chwili_zwarcia", "g11_g12_energia"),
    ),
    Mutacja(
        "M12",
        "Bezwladnosc 2H zamieniona na H: mod elektromechaniczny przyspiesza sqrt(2) razy.",
        "network_model/solvers/dynamika/urzadzenia/maszyna_klasyczna.py",
        "                / (2.0 * self.h_s),",
        "                / (1.0 * self.h_s),",
        "G2 (czestotliwosc modu) i G4 (tlumienie) — oba zmierzone",
        bramki=("g2_g4_mod_elektromechaniczny", "g3_rocof_w_chwili_zwarcia"),
    ),
    Mutacja(
        "M13",
        "Usunieta pulsacja bazowa z rownania kata: kat przestaje byc calka predkosci.",
        "network_model/solvers/dynamika/urzadzenia/maszyna_klasyczna.py",
        "                self.omega_bazowa_rad_s * odchylka_predkosci,",
        "                odchylka_predkosci,",
        "G2 (czestotliwosc modu) i G4 (tlumienie) — oba zmierzone",
        bramki=("g2_g4_mod_elektromechaniczny",),
    ),
    Mutacja(
        "M14",
        "Odwrocony KIERUNEK zmiany bazy stalej bezwladnosci (H skalowane jak impedancja).",
        "network_model/solvers/dynamika/urzadzenia/maszyna_klasyczna.py",
        "        h_s=zmiana_bazy_stalej_bezwladnosci(\n",
        "        h_s=zmiana_bazy_impedancji(\n",
        "G6 (ta sama maszyna w innej bazie urzadzenia)",
        bramki=("g6_inna_baza_urzadzenia",),
    ),
    Mutacja(
        "M15",
        "Odwrocony KIERUNEK zmiany bazy reaktancji przejsciowej (X'd skalowane jak H).",
        "network_model/solvers/dynamika/urzadzenia/maszyna_klasyczna.py",
        "        x_prim_pu=zmiana_bazy_impedancji(x_prim_pu, s_n_mva, s_bazowa_mva),",
        "        x_prim_pu=zmiana_bazy_stalej_bezwladnosci(x_prim_pu, s_n_mva, s_bazowa_mva),",
        "G6 (ta sama maszyna w innej bazie urzadzenia)",
        bramki=("g6_inna_baza_urzadzenia",),
    ),
    Mutacja(
        "M16",
        "Czestotliwosc wezlowa liczona z |V| zamiast |V|^2: tozsamosc przestaje byc "
        "niezmiennikiem skali napiecia.",
        "network_model/solvers/dynamika/obserwable.py",
        "    pochodna_kata = (pochodna_napiecia_pu_s * napiecie_pu.conjugate()).imag / (modul * modul)",
        "    pochodna_kata = (pochodna_napiecia_pu_s * napiecie_pu.conjugate()).imag / modul",
        "G7 (czestotliwosc wezlowa wobec pochodnej analitycznej)",
        bramki=("g7_czestotliwosc_wezlowa",),
    ),
    Mutacja(
        "M17",
        "Pominiety czlon czestotliwosci znamionowej: wezel melduje samo odchylenie.",
        "network_model/solvers/dynamika/obserwable.py",
        "    f_hz = f_bazowa_hz + pochodna_kata / (2.0 * math.pi)",
        "    f_hz = pochodna_kata / (2.0 * math.pi)",
        "G7 (czestotliwosc wezlowa wobec pochodnej analitycznej)",
        bramki=("g7_czestotliwosc_wezlowa",),
    ),
    Mutacja(
        "M18",
        "Bramka fail-closed czestotliwosci wylaczona: fazor wewnatrz wlasnej kuli "
        "niepewnosci nadal melduje kat jako wynik.",
        "network_model/solvers/dynamika/obserwable.py",
        "    if not math.isfinite(niepewnosc_napiecia_pu) or modul <= niepewnosc_napiecia_pu:",
        "    if False:",
        "test jednostkowy obserwabli — pasmo 0 < |V| <= u_V jest NIEOSIAGALNE z poziomu "
        "biegu: zapad dowolnej glebokosci sie liczy (odbior przechodzi w stala impedancje), "
        "ale wezel o V = 0 dokladnie (zwarcie metaliczne, obszar beznapieciowy) jest "
        "wierszem ograniczenia z czestotliwoscia niedostepna bez wolania tego wzoru, a |V| "
        "rzedu u_V wymagaloby zwarcia o impedancji rzedu tolerancji Newtona. Zmierzone "
        "2026-09-25: bramki G23 (zwarcie metaliczne w wezle odbioru) i G17 (obszar "
        "beznapieciowy) nie zabijaja tej mutacji — jedyna obrona kontraktu jest test "
        "jednostkowy",
        bramki=(),
        testy=(
            "tests/walidacja_fizyczna/test_czestotliwosc_wezlowa.py"
            "::test_granica_dostepnosci_jest_fail_closed",
            "tests/walidacja_fizyczna/test_czestotliwosc_wezlowa.py"
            "::test_tuz_nad_granica_wartosc_jest_publikowana_ale_nieufna",
        ),
    ),
    Mutacja(
        "M19",
        "Usuniety warunek istnienia punktu pracy: wyspa z odbiorem i bez zrodla wraca "
        "do „zbieznosci” przy |V| rzedu 1e11 pu albo do surowego OverflowError.",
        "network_model/solvers/dynamika/siec.py",
        "    sprawdz_zasilanie_wysp(",
        "    _wylaczone_sprawdz_zasilanie_wysp(",
        "G13 (wyspa bez zrodla konczy sie odmowa nazwana)",
        bramki=("g13_wyspa_bez_zrodla",),
    ),
    Mutacja(
        "M20",
        "Zdarzenie przyciagane do najblizszego wezla siatki zamiast wykonywane w "
        "chwili zadanej.",
        "network_model/solvers/dynamika/silnik.py",
        "            kandydaci.append(wpis.t_s)",
        "            kandydaci.append(round(wpis.t_s / nastawy.dt_s) * nastawy.dt_s)",
        "G5 (czas wykonania zdarzenia)",
        bramki=("g5_czas_zdarzenia",),
    ),
    Mutacja(
        "M26",
        "Predykat izolacji wylaczony: usuniecie zwarcia `izolacja` na szynie nadal "
        "zasilanej przez pierscien przechodzi — luk „gasnie” pod napieciem bez aparatu.",
        "network_model/solvers/dynamika/silnik.py",
        "            if odizolowane:\n                continue",
        "            if True:\n                continue",
        "G19 (predykat izolacji wobec spojnosci grafu t+) i test odmowy dawnego SO-1A",
        bramki=("g19_predykat_izolacji",),
        testy=(
            "tests/e2e/test_so1a_scenariusz_odniesienia.py"
            "::test_dawny_scenariusz_z_usunieciem_izolacja_na_szynie_zasilanej_to_odmowa",
        ),
    ),
    Mutacja(
        "M27",
        "Adapter znow porzuca lacznik otwarty: element nieaktywny w t = 0 znika z rdzenia, "
        "wiec jego zamkniecie zdarzeniem nie ma czego zamknac.",
        "enm/adapter_dynamiki.py",
        "            aktywny = lacznik.in_service and lacznik.state == SwitchState.CLOSED\n",
        "            aktywny = lacznik.in_service and lacznik.state == SwitchState.CLOSED\n"
        "            if not aktywny:\n                continue\n",
        "test sciezki uzytkownika: zamkniecie lacznika rezerwowego G16 (D-19)",
        bramki=(),
        testy=(
            "tests/enm/test_adapter_dynamiki.py::TestAktywnoscElementow"
            "::test_laczenia_na_sciezce_uzytkownika",
        ),
    ),
    Mutacja(
        "M28",
        "Probka `L` pobierana PO re-inicjalizacji: strona lewa chwili zdarzenia pokazuje "
        "juz stan po zdarzeniu, wiec stan tuz przed zwarciem ginie z wyniku.",
        "network_model/solvers/dynamika/silnik.py",
        "        if zdarzenia_chwili:\n"
        "            self._probkuj(\n"
        "                probkowanie,\n"
        '                "L",\n'
        "                t_s,\n"
        "                poprzednia.model,\n"
        "                poprzednia.odbiory,\n"
        "                poprzednia.urzadzenia,\n"
        "                stany,\n"
        "                napiecia,\n"
        "            )\n"
        "        chwila = self._nanies_chwile(\n"
        "            t_s, wpisy, akcje, poprzednia, stany, napiecia, wykonane, kroki_szczegolne\n"
        "        )\n",
        "        chwila = self._nanies_chwile(\n"
        "            t_s, wpisy, akcje, poprzednia, stany, napiecia, wykonane, kroki_szczegolne\n"
        "        )\n"
        "        if zdarzenia_chwili:\n"
        "            self._probkuj(\n"
        "                probkowanie,\n"
        '                "L",\n'
        "                t_s,\n"
        "                chwila.model,\n"
        "                chwila.odbiory,\n"
        "                chwila.urzadzenia,\n"
        "                stany,\n"
        "                chwila.napiecia,\n"
        "            )\n",
        "G20 (probka L wobec algebry wyroczni sieci sprzed zdarzenia, D-18) i test osi czasu",
        bramki=("g20_probki_obustronne",),
        testy=(
            "tests/walidacja_fizyczna/test_probki_obustronne.py"
            "::test_os_czasu_i_strony_probek[na_siatce-jedno]",
        ),
    ),
    Mutacja(
        "M29",
        "Czestotliwosc w chwili zdarzenia publikowana jako LICZBA: pochodna fazy liczona "
        "przez nieciaglosc udaje wartosc, ktorej nie ma.",
        "network_model/solvers/dynamika/silnik.py",
        '        if strona != "C":\n            czestotliwosci = [',
        "        if False:\n            czestotliwosci = [",
        "G20 (predykat osi i czestotliwosci chwili zdarzenia, D-18), G7 cz. 2 i test kontraktu",
        bramki=("g20_probki_obustronne",),
        testy=(
            "tests/network_model/dynamika/test_wynik.py"
            "::test_czestotliwosc_w_chwili_zdarzenia_jest_None_z_kodem_3_w_obu_probkach",
        ),
    ),
    Mutacja(
        "M30",
        "Kat pradu galezi otwartej publikowany jako 0,0 z `angle(0)`: fazor zerowy dostaje "
        "sfabrykowana faze.",
        "network_model/solvers/dynamika/silnik.py",
        "    if abs(prad) <= rozdzielczosc_pu:\n        return None\n"
        "    return float(np.degrees(np.angle(prad)))",
        "    return float(np.degrees(np.angle(prad)))",
        "test kanalow galezi: galaz otwarta w probce P ma kat None (D-15)",
        bramki=(),
        testy=(
            "tests/walidacja_fizyczna/test_probki_obustronne.py"
            "::test_kanaly_galezi_modul_i_kat[otwarta-P]",
        ),
    ),
    Mutacja(
        "M32",
        "Sprzezenie w kacie fazora pradu zacisku poczatkowego: kat pradu ma odwrocony znak, "
        "modul bez zmian — kierunek przeplywu bez sladu w module.",
        "network_model/solvers/dynamika/silnik.py",
        "                _kat_pradu_deg(wielkosci.i_od_pu, rozdzielczosc)",
        "                _kat_pradu_deg(wielkosci.i_od_pu.conjugate(), rozdzielczosc)",
        "G16 (fazory pradow galezi wobec superpozycji Thevenina wyroczni, D-15)",
        bramki=("g16_fazory_pradow_galezi",),
    ),
    Mutacja(
        "M34",
        "Czwornik zwarcia w linii z polowkami zamienionymi (x <-> 1-x): miejsce zwarcia "
        "liczone od niewlasciwego zacisku.",
        "network_model/solvers/dynamika/siec.py",
        "        dlugosc = punkty[i + 1] - punkty[i]",
        "        dlugosc = 1.0 - (punkty[i + 1] - punkty[i])",
        "G16 (czwornik wobec jawnego wezla wewnetrznego wyroczni, D-21)",
        bramki=("g16_zwarcie_w_linii",),
    ),
    Mutacja(
        "M35",
        "Klasyfikacja obszarow beznapieciowych wylaczona: wezel bez zrodla nigdy nie jest "
        "odcinany, wiec wezel martwy od t = 0 albo odcinek po przerwie SZR konczy bieg "
        "odmowa zamiast napieciem zerowym.",
        "network_model/solvers/dynamika/silnik.py",
        "            wezel.ident for pozycja, wezel in enumerate(wezly) if przydzial[pozycja] not in zywe",
        "            wezel.ident for pozycja, wezel in enumerate(wezly) if False",
        "G17 (obszar beznapieciowy i ponowne zasilenie, D-16)",
        bramki=("g17_obszar_beznapieciowy",),
    ),
    Mutacja(
        "M36",
        "Ponowne zasilenie startuje Newtona od zera zamiast od napiecia sasiada: odbior "
        "stalej mocy nie ma w zerze pradu (odmowa punktu startowego zamiast biegu), a start "
        "z dolu prowadzilby do pierwiastka nizszego.",
        "network_model/solvers/dynamika/silnik.py",
        "                    start[sasiad] = start[biezacy]",
        "                    start[sasiad] = 0j",
        "G17 (pierwiastek wyzszy wobec wyroczni kwadratowej, D-16)",
        bramki=("g17_obszar_beznapieciowy",),
    ),
    Mutacja(
        "M37",
        "Pominiety blok -dE/dx wiersza ograniczenia w jakobianie sprzezonym (i w macierzy "
        "stanu analizy malosygnalowej — ta sama regula `blok_algebry_po_stanie`): Newton "
        "kroku traci kierunek dla wezla o napieciu narzuconym przez stan urzadzenia.",
        "network_model/solvers/dynamika/calkowanie.py",
        "        return urzadzenie.jakobian_napiecia_bez_obciazenia(stan)",
        "        return None",
        "test jakobianu sprzezonego wobec roznicy skonczonej na atrapie zrodla napieciowego "
        "(D-16: jeden mechanizm wiersza ograniczenia V - E(x) = 0)",
        bramki=(),
        testy=(
            "tests/network_model/dynamika/test_obszary_beznapieciowe.py"
            "::test_jakobian_sprzezony_wiersza_ograniczenia_zgodny_z_roznica_skonczona",
        ),
    ),
    Mutacja(
        "M22",
        "Akcja zdarzenia warunkowego wykonana na KONCU kroku zamiast w zlokalizowanej chwili "
        "przekroczenia t*: krok nie jest skracany do t*, blad chwili wykonania rzedu dt/2.",
        "network_model/solvers/dynamika/dozory.py",
        "            if najwczesniej is not None and najwczesniej < t_lad - eps:",
        "            if False:",
        "G14 (chwila wykonania akcji wobec postaci zamknietej rampy, D-12)",
        bramki=("g14_lokalizacja_zdarzen_warunkowych",),
    ),
    Mutacja(
        "M23",
        "Odwrocony kierunek dozoru: `w_dol` pobudza sie na zboczu narastajacym (albo w t = 0+, "
        "bo warunek odwrocony jest spelniony od poczatku) — brak pobudzenia albo zle zbocze.",
        "network_model/solvers/dynamika/dozory.py",
        '        return 1.0 if self.kierunek == "w_gore" else -1.0',
        '        return -1.0 if self.kierunek == "w_gore" else 1.0',
        "G14 (pobudzenia niezgodne z kierunkiem i chwila lokalizacji, D-12)",
        bramki=("g14_lokalizacja_zdarzen_warunkowych",),
    ),
    Mutacja(
        "M24",
        "Brak kasowania akcji opoznionej przy przejsciu powrotnym: zapad krotszy niz zwloka "
        "i tak wywoluje akcje (np. wylaczenie po powrocie napiecia).",
        "network_model/solvers/dynamika/dozory.py",
        "                if not dozor.kasowanie_przy_powrocie:\n                    continue",
        "                if True:\n                    continue",
        "G14 (akcje niezgodne z kasowaniem przy zapadzie 0,25 s i zwloce 0,3 s, D-12)",
        bramki=("g14_lokalizacja_zdarzen_warunkowych",),
    ),
    Mutacja(
        "M25",
        "Przypisanie stanu realizowane ponownym wyznaczeniem stanu urzadzenia z punktu pracy: "
        "kat i predkosc maszyny w trakcie wahan wracaja do rownowagi — ciaglosc stanow "
        "nieprzypisanych zniszczona.",
        "network_model/solvers/dynamika/silnik.py",
        "                nowe[indeks][pozycja_stanu] = wartosc_stanu\n",
        "                nowe[indeks] = urzadzenie.stan_poczatkowy(\n"
        "                    urzadzenie.napiecie_bez_obciazenia(nowe[indeks]),\n"
        "                    complex(wartosc_stanu, 0.0),\n"
        "                )\n"
        "                nowe[indeks][pozycja_stanu] = wartosc_stanu\n",
        "G18 (skok stanow nieprzypisanych i trajektoria kata wobec solve_ivp, D-13)",
        bramki=("g18_przypisanie_stanu",),
    ),
    Mutacja(
        "M31",
        "Kat SEM zrodla testowego calkowany bez czlonu odchylki pulsacji: rampa i skok "
        "czestotliwosci nie przesuwaja fazy — profil czestotliwosci nie istnieje w przebiegu.",
        "network_model/solvers/dynamika/urzadzenia/zrodlo_testowe.py",
        "        pochodne[_TH] = self.omega_bazowa_rad_s * float(stan[_DW])",
        "        pochodne[_TH] = 0.0 * float(stan[_DW])",
        "G15 (postac zamknieta profilu zrodla testowego, D-14)",
        bramki=("g15_zrodlo_testowe",),
    ),
    Mutacja(
        "M33",
        "Udzial pozostaly zastosowany takze do pochodnych stanu agregatu: pozostale jednostki "
        "zwalniaja swoja dynamike — rownowaznosc agregatu z jednostkami pada.",
        "network_model/solvers/dynamika/urzadzenia/czesciowe.py",
        "        return self.bazowe.pochodne(stan, napiecie_pu)",
        "        return self.udzial * self.bazowe.pochodne(stan, napiecie_pu)",
        "G21 (rownowaznosc agregatu z udzialem 0,5 i dwoch polow, D-20)",
        bramki=("g21_utrata_czesciowa",),
    ),
    # --- Model odbioru (karta modeli odbiorow, twierdzenia D-22...D-25) -------------------
    Mutacja(
        "M38",
        "Predykat modelu odbioru z pola `Load.model` zamiast wspolczynnikow: odbior z "
        "`model = pq` i wielomianem ZIP liczony w dynamice stala moca, a w rozplywie ZIP.",
        "enm/adapter_dynamiki.py",
        "    if wspolczynniki is None:\n        if blok.u_min_pu is None",
        '    if wspolczynniki is None or load.model != "zip":\n        if blok.u_min_pu is None',
        "G22 (parytet t = 0, przypadki `model = pq` + ZIP — sonda S1)",
        bramki=("g22_parytet_chwili_zerowej",),
    ),
    Mutacja(
        "M39",
        "Podzial mocy wezla moca BAZOWA odbioru `P0 + jQ0` zamiast mocy charakterystyki w "
        "napieciu punktu pracy: urzadzenie szyny z odbiorem ZIP dostaje moc obok rozplywu.",
        "enm/adapter_dynamiki.py",
        "            moc_poboru_w_punkcie_pracy(odbior, punkt.napiecia_pu[szyna], f_bazowa_hz)",
        "            complex(odbior.p_pu, odbior.q_pu)",
        "G22 (moc urzadzenia szyny z wytworca i ze zrodlem sieciowym przy odbiorze ZIP)",
        bramki=("g22_parytet_chwili_zerowej",),
    ),
    Mutacja(
        "M40",
        "Galaz impedancyjna bez sprzezenia: `Y_eq = S(U_min)/U_min^2` — moc bierna odbioru "
        "ponizej U_min ze zlym znakiem.",
        "network_model/solvers/dynamika/odbiory.py",
        "    return moc.conjugate() / (odniesienie * odniesienie)",
        "    return moc / (odniesienie * odniesienie)",
        "G23 (napiecie wezla odbioru Q0 != 0 ponizej U_min wobec postaci zamknietej)",
        bramki=("g23_przejscie_pq_z",),
    ),
    Mutacja(
        "M41",
        "Galaz impedancyjna skalowana moca przy `v0` zamiast przy `U_min`: skok mocy i pradu "
        "w napieciu przejscia dla skladowej Z albo I.",
        "network_model/solvers/dynamika/odbiory.py",
        "    moc = moc_charakterystyki_pu(odbior, odniesienie, f_hz)\n",
        "    moc = moc_charakterystyki_pu(odbior, odbior.charakterystyka.v0_pu or 1.0, f_hz)\n",
        "G23 (ciaglosc mocy w U_min przy a != 0 albo b != 0)",
        bramki=("g23_przejscie_pq_z",),
    ),
    Mutacja(
        "M42",
        "Przejscie w stala impedancje wylacznie skladowej stalomocowej: skladowa stalopradowa "
        "w V = 0 dzieli przez zero (kierunek V/|V| nie istnieje).",
        "network_model/solvers/dynamika/odbiory.py",
        "    return charakterystyka.u_min_pu is not None and modul_v < charakterystyka.u_min_pu",
        "    return (\n        charakterystyka.u_min_pu is not None\n"
        "        and modul_v < charakterystyka.u_min_pu\n"
        "        and charakterystyka.b_p == 0.0\n        and charakterystyka.b_q == 0.0\n    )",
        "G23 (zwarcie metaliczne w wezle odbioru ze skladowa I — bieg zamiast odmowy)",
        bramki=("g23_przejscie_pq_z",),
    ),
    Mutacja(
        "M43",
        "Czynnik czestotliwosciowy wylacznie w galezi charakterystyki: ponizej U_min odbior "
        "czuly liczy moc przy f0 zamiast przy czestotliwosci widzianej.",
        "network_model/solvers/dynamika/odbiory.py",
        "    moc = moc_charakterystyki_pu(odbior, odniesienie, f_hz)\n",
        "    moc = moc_charakterystyki_pu(odbior, odniesienie, odbior.charakterystyka.f0_hz)\n",
        "G23 (F != 1 przez f0 != f_n ponizej U_min) i G24 (przejscie przez U_min przy "
        "dw_hat != 0 — tozsamosc poboru)",
        bramki=("g23_przejscie_pq_z", "g24_estymator_w_zdarzeniach"),
    ),
    Mutacja(
        "M44",
        "Estymator z roznicy katow `angle(V) - x` bez `arg(V e^{-jx})`: przejscie "
        "absolutnego kata szyny przez +-pi daje skok 2 pi bledu fazy.",
        "network_model/solvers/dynamika/odbiory.py",
        "        return cmath.phase(napiecie_pu * cmath.exp(-1j * float(stan[0])))",
        "        return cmath.phase(napiecie_pu) - float(stan[0])",
        "G24 (samoregulacja wyspy — kat szyny przechodzi przez +-pi)",
        bramki=("g24_samoregulacja_wyspy",),
    ),
    Mutacja(
        "M45",
        "Odchylka czestotliwosci widzianej `dw_hat = e/T_f` bez pulsacji znamionowej: "
        "odbior widzi czestotliwosc zawyzona 314 razy.",
        "network_model/solvers/dynamika/odbiory.py",
        "        odchylka = self.blad_fazy_rad(stan, napiecie_pu) / (\n"
        "            2.0 * math.pi * self.f_bazowa_hz * self._t_f()\n        )",
        "        odchylka = self.blad_fazy_rad(stan, napiecie_pu) / self._t_f()",
        "G24 (tozsamosc estymatora f_odb = f_n (1 + e/(w_n T_f)) w probkach biegu)",
        bramki=("g24_estymator_w_zdarzeniach",),
    ),
    Mutacja(
        "M46",
        "Jakobian pradu odbioru bez czlonu dS/d|V| skladowych Z i I: Newton traci zbieznosc "
        "kwadratowa (wynik ten sam, bo residuum jest dokladne).",
        "network_model/solvers/dynamika/odbiory.py",
        "    if ch.v0_pu is None:\n        return jakobian",
        "    if True:\n        return jakobian",
        "test jakobianu analitycznego wobec roznicy centralnej (bledny jakobian przy "
        "dokladnym residuum nie zmienia rozwiazania Newtona, wiec zadna bramka fizyczna go "
        "nie widzi — obrona jest test jednostkowy, jak M18)",
        testy=(
            "tests/network_model/dynamika/test_odbiory.py"
            "::test_jakobian_analityczny_wobec_roznicy_centralnej",
        ),
    ),
    Mutacja(
        "M47",
        "Brak `x := arg V+` przy ponownym zasileniu szyny odbioru: estymator po przerwie "
        "beznapieciowej startuje z faza sprzed odciecia (skok czestotliwosci widzianej).",
        "network_model/solvers/dynamika/silnik.py",
        "        if not (odbior.estymator_wyzerowany and odbior.nazwy_stanow):\n"
        "            nowe.append(stan)\n            continue",
        "        if True:\n            nowe.append(stan)\n            continue",
        "G24 (obszar beznapieciowy — f_odb = f_n dokladnie w probce P ponownego zasilenia)",
        bramki=("g24_estymator_w_zdarzeniach",),
    ),
    Mutacja(
        "M48",
        "Brak sprawdzenia |V_pf| >= U_min: punkt pracy ponizej przejscia konczy sie odmowa "
        "bramki rownowagi zamiast odmowy nazwanej modelu odbioru.",
        "network_model/solvers/dynamika/silnik.py",
        "                sprawdz_punkt_pracy_odbioru(",
        "                (lambda *_argumenty: None)(",
        "G25 (oczekiwany kod `dynamika.odbior_ponizej_napiecia_przejscia`)",
        bramki=("g25_odmowy_modelu_odbioru",),
    ),
    Mutacja(
        "M49",
        "Warunek bloku `Load.dynamika` wyciety z bramki modelu: gotowosc mowi `ready`, a bieg "
        "odmawia przy skladaniu wejscia (rozjazd gotowosc - bieg).",
        "enm/adapter_dynamiki.py",
        "    bez_bloku_odbioru = tuple(sorted(load.ref_id for load in enm.loads if load.dynamika "
        "is None))",
        "    bez_bloku_odbioru: tuple[str, ...] = ()",
        "G25 (para gotowosc - bieg dla odbioru bez bloku)",
        bramki=("g25_odmowy_modelu_odbioru",),
    ),
    Mutacja(
        "M50",
        "Prawa strona zrozniczkowanej algebry bez elementow stanowych odbiorow: `f_hz@` szyny "
        "z odbiorem czulym liczona z niepelnej pochodnej napiec.",
        "network_model/solvers/dynamika/obserwable.py",
        "        if not odbior.nazwy_stanow or not odbior.przylaczony:\n            continue",
        "        if True:\n            continue",
        "G24 (f_hz@B wobec f_n (1 + dw - psi'(e) e'/w_n) na stanie z biegu)",
        bramki=("g24_estymator_w_zdarzeniach",),
    ),
    Mutacja(
        "M51",
        "Predykat reprezentowalnosci agregatu ZIP szyny wylaczony: rozplyw liczy cicho "
        "agregat niedokladny zamiast odmowy nazwanej.",
        "enm/load_zip_model.py",
        "    if powod is None:\n        return None\n    return powod, moc_p, moc_q",
        "    return None",
        "G22 (dwa odbiory szyny o roznych k przy f0 != f_studium — odmowa rozplywu)",
        bramki=("g22_parytet_chwili_zerowej",),
    ),
    Mutacja(
        "M67",
        "Kat pradu nierozroznialnego od zera publikowany: kryterium rozdzielczosci rozwiazania "
        'zastapione dawnym „dokladnie zero" — szum zaokraglen galezi slepej dostaje kat, '
        "zalezny od kolejnosci sumowania (liczby watkow BLAS).",
        "network_model/solvers/dynamika/silnik.py",
        "    if abs(prad) <= rozdzielczosc_pu:\n        return None",
        "    if prad == 0:\n        return None",
        "test galezi slepej z przekladnia zespolona: szum pradu bez kata (DETERMINIZM-KATA-FAZORA)",
        bramki=(),
        testy=(
            "tests/walidacja_fizyczna/test_kat_pradu_rozdzielczosc.py"
            "::test_galaz_slepa_z_przekladnia_zespolona_nie_ma_kata_mimo_niezerowego_szumu",
        ),
    ),
    Mutacja(
        "M68",
        "Kat napiecia wezla bez napiecia publikowany jako 0,0 z `angle(0)`: wezel z "
        "ograniczeniem V = 0 (zwarcie metaliczne) dostaje sfabrykowana faze.",
        "network_model/solvers/dynamika/silnik.py",
        "    if fazor == 0:\n        return None\n    return float(np.degrees(np.angle(fazor)))",
        "    return float(np.degrees(np.angle(fazor)))",
        "test napiecia wezlow za zwarciem metalicznym: zero dokladne bez kata",
        bramki=(),
        testy=(
            "tests/walidacja_fizyczna/test_kat_pradu_rozdzielczosc.py"
            "::test_napiecie_wezlow_za_zwarciem_metalicznym_jest_zerem_dokladnym_bez_kata",
        ),
    ),
    Mutacja(
        "M69",
        "Estymata bledu rozwiazania z residuum-szumu: pelne obliczone residuum `r` zamiast jego "
        "czesci pewnej `psi(r)` — przy residuum mieszczacym sie w granicy wlasnego bledu "
        "zaokraglen estymata niepewnosci czestotliwosci i jej kod jakosci zaleza od kolejnosci "
        "sumowania (liczby watkow BLAS).",
        "network_model/solvers/dynamika/obserwable.py",
        "    czesc_pewna = czesc_pewna_residuum(residuum, granica)\n",
        "    czesc_pewna = residuum\n",
        "test estymaty przy residuum na granicy zaokraglen (DETERMINIZM-KATA-FAZORA)",
        bramki=(),
        testy=(
            "tests/walidacja_fizyczna/test_niepewnosc_na_granicy_zaokraglen.py"
            "::test_estymata_przy_residuum_szumu_jest_propagacja_granicy",
        ),
    ),
    Mutacja(
        "M70",
        "Probka t = 0 w punkcie pracy rozplywu bez korekty algebry rdzenia: residuum ponad "
        "tolerancja biegu, a estymata niepewnosci czestotliwosci mierzy szum zaokraglen "
        "rozplywu (zalezny od jadra BLAS i historii procesu).",
        "network_model/solvers/dynamika/silnik.py",
        "        if not residuum_ponad_granica_zaokraglen(residuum, granica):\n"
        "            ocena = self._bramka_rownowagi(",
        "        if True:\n            ocena = self._bramka_rownowagi(",
        "test probki zero na algebrze rdzenia (PRZENOSNOSC-NIEPEWNOSCI)",
        bramki=(),
        testy=(
            "tests/walidacja_fizyczna/test_przenosnosc_estymaty_niepewnosci.py"
            "::test_probka_zero_lezy_na_algebrze_rdzenia",
        ),
    ),
    Mutacja(
        "M71",
        "Roznica skonczona pochodnej napiec przy przesunieciu rzedu estymaty na dnie "
        "zaokraglen (~1e-10 wzglednie) zamiast sqrt(u): `u_Vdot` staje sie szumem obliczenia "
        "pochodnej, a estymata niepewnosci czestotliwosci — realizacja zaokraglen.",
        "network_model/solvers/dynamika/obserwable.py",
        "    if 0.0 < przesuniecie_wzgledne < KROK_WZGLEDNY_POCHODNEJ:\n"
        "        return KROK_WZGLEDNY_POCHODNEJ / przesuniecie_wzgledne\n",
        "",
        "test odpornosci u_Vdot na jednostke zaokraglenia (PRZENOSNOSC-NIEPEWNOSCI)",
        bramki=(),
        testy=(
            "tests/walidacja_fizyczna/test_przenosnosc_estymaty_niepewnosci.py"
            "::test_u_vdot_odporne_na_jednostke_zaokraglenia_w_obliczeniu_pochodnej",
            "tests/walidacja_fizyczna/test_przenosnosc_estymaty_niepewnosci.py"
            "::test_krok_roznicy_pochodnej_nigdy_ponizej_pierwiastka_u",
        ),
    ),
    Mutacja(
        "M72",
        "Stan t = 0 bez reinicjalizacji urzadzen w punkcie skorygowanym: stany rownowagi "
        "punktu rozplywu przy napieciach skorygowanych — bieg startuje ze stanu, ktory bramka "
        "rownowagi by odrzucila (scena harnessu: max |f| 2,9e-5 1/s przy eps_init 1e-6), a "
        "probka t = 0 stanu ustalonego melduje ROZROZNIALNA odchylke czestotliwosci.",
        "network_model/solvers/dynamika/silnik.py",
        "            stany_urzadzen_po.append(urzadzenie.stan_poczatkowy(napiecie_po, moc_po))\n",
        "            stany_urzadzen_po.append(stan)\n",
        "test probki zero na algebrze rdzenia — rownowaga stanu t = 0 (PRZENOSNOSC-NIEPEWNOSCI) "
        "i ten sam niezmiennik dla kazdej rodziny urzadzen (AB-1b.3b-NA-CZUBKU)",
        bramki=(),
        testy=(
            "tests/walidacja_fizyczna/test_przenosnosc_estymaty_niepewnosci.py"
            "::test_probka_zero_lezy_na_algebrze_rdzenia",
            "tests/walidacja_fizyczna/test_chwila_zero_rodziny_urzadzen.py",
        ),
    ),
    Mutacja(
        "M73",
        "Estymata bledu napiecia bez propagacji dna, gdy residuum ma czesc pewna (dawne "
        "rozgalezienie): tuz nad progiem `u_V = |J^-1 psi(r)|` spada do ulamka procenta "
        "propagacji granicy, a strona progu zalezy od jadra BLAS.",
        "network_model/solvers/dynamika/obserwable.py",
        "    niepewnosc_napiecia = np.abs(blad_czesci_pewnej) + np.abs(blad_dna)\n",
        "    niepewnosc_napiecia = (\n"
        "        np.abs(blad_czesci_pewnej)\n"
        "        if bool(np.any(czesc_pewna != 0.0))\n"
        "        else np.abs(blad_dna)\n"
        "    )\n",
        "test estymaty tuz nad progiem czesci pewnej (PRZENOSNOSC-NIEPEWNOSCI)",
        bramki=(),
        testy=(
            "tests/walidacja_fizyczna/test_niepewnosc_na_granicy_zaokraglen.py"
            "::test_estymata_tuz_nad_progiem_czesci_pewnej_nie_spada_pod_dno",
        ),
    ),
    Mutacja(
        "M74",
        "Niepewnosc pochodnej napiec z samej roznicy wzdluz czesci pewnej, gdy ta jest "
        "niezerowa: tuz nad progiem `u_Vdot` traci skladnik dna i spada ponizej wartosci "
        "sprzed progu.",
        "network_model/solvers/dynamika/obserwable.py",
        "    for blad_napiecia in (blad_czesci_pewnej, blad_dna):\n",
        "    for blad_napiecia in (\n"
        "        (blad_czesci_pewnej,) if bool(np.any(czesc_pewna != 0.0)) else (blad_dna,)\n"
        "    ):\n",
        "test estymaty tuz nad progiem czesci pewnej (PRZENOSNOSC-NIEPEWNOSCI)",
        bramki=(),
        testy=(
            "tests/walidacja_fizyczna/test_niepewnosc_na_granicy_zaokraglen.py"
            "::test_estymata_tuz_nad_progiem_czesci_pewnej_nie_spada_pod_dno",
        ),
    ),
    # --- Chwila zero z odbiorami stanowymi (karta AB-1b.3b-NA-CZUBKU) --------------------
    Mutacja(
        "M75",
        "Stan t = 0 odbioru czulego bez reinicjalizacji w punkcie skorygowanym: estymator "
        "zostaje przy x = arg V_pf, wiec w stanie t = 0 ma pochodna e/T_f != 0, a prad "
        "odbioru (czestotliwosc widziana != f_n) nie jest tym, przy ktorym algebra zbiegla.",
        "network_model/solvers/dynamika/silnik.py",
        "            nowy = odbior.stan_poczatkowy_odbioru(para[1])\n",
        "            nowy = stan\n",
        "test probki zero na algebrze rdzenia — rownowaga odbioru ze stanem "
        "(AB-1b.3b-NA-CZUBKU)",
        bramki=(),
        testy=(
            "tests/walidacja_fizyczna/test_przenosnosc_estymaty_niepewnosci.py"
            "::test_probka_zero_lezy_na_algebrze_rdzenia"
            "[smib_z_odbiorem_czulym-punkt_zaburzony-probka_C]",
        ),
    ),
    Mutacja(
        "M76",
        "Algebra korekty t = 0 przy TRZYMANYM stanie estymatora (bez rozmaitosci rownowagi): "
        "po x := arg V0 prad odbioru czulego zmienia sie o dI/dtheta * dtheta, wiec probka "
        "t = 0 lamie tolerancje algebry biegu.",
        "network_model/solvers/dynamika/silnik.py",
        "        odbiory_rownowagi = tuple(odbior.w_rownowadze_estymatora() for odbior in odbiory)\n",
        "        odbiory_rownowagi = odbiory\n",
        "test probki zero na algebrze rdzenia — residuum stanu t = 0 z odbiorem czulym "
        "(AB-1b.3b-NA-CZUBKU)",
        bramki=(),
        testy=(
            "tests/walidacja_fizyczna/test_przenosnosc_estymaty_niepewnosci.py"
            "::test_probka_zero_lezy_na_algebrze_rdzenia"
            "[smib_z_odbiorem_czulym-punkt_zaburzony-probka_C]",
        ),
    ),
    Mutacja(
        "M77",
        "Granica zaokraglen residuum liczona z pradu odbioru przy czestotliwosci znamionowej "
        "zamiast przy stanie estymatora: granica i residuum opisuja rozne wiersze, wiec "
        "czesc pewna residuum i estymata niepewnosci czestotliwosci niosa rozjazd.",
        "network_model/solvers/dynamika/siec.py",
        "    for pozycja, prad in skladniki_wstrzykniec(model, odbiory, urzadzenia, stany, napiecia):\n"
        "        suma_wstrzykniec[pozycja] += abs(prad)\n",
        "    for pozycja, prad in skladniki_wstrzykniec(\n"
        "        model,\n"
        "        tuple(odbior.w_rownowadze_estymatora() for odbior in odbiory),\n"
        "        urzadzenia,\n"
        "        stany,\n"
        "        napiecia,\n"
        "    ):\n"
        "        suma_wstrzykniec[pozycja] += abs(prad)\n",
        "test granicy wobec niezaleznego wzoru — odbior czuly z estymatorem za faza szyny",
        bramki=(),
        testy=(
            "tests/walidacja_fizyczna/test_niepewnosc_na_granicy_zaokraglen.py"
            "::test_granica_zaokraglen_to_suma_modulow_skladnikow_wiersza"
            "[smib_z_odbiorem_czulym_i_zwarciem]",
        ),
    ),
    Mutacja(
        "M78",
        "Granica zaokraglen residuum sumuje takze odbiory BEZ obwodu (odlaczone zdarzeniem), "
        "ktorych prad nie wchodzi do wiersza residuum — dawny zbior skladnikow granicy.",
        "network_model/solvers/dynamika/siec.py",
        "    for pozycja, prad in skladniki_wstrzykniec(model, odbiory, urzadzenia, stany, napiecia):\n"
        "        suma_wstrzykniec[pozycja] += abs(prad)\n"
        "        liczba_wstrzykniec[pozycja] += 1\n",
        "    for pozycja, prad in skladniki_wstrzykniec(model, odbiory, urzadzenia, stany, napiecia):\n"
        "        suma_wstrzykniec[pozycja] += abs(prad)\n"
        "        liczba_wstrzykniec[pozycja] += 1\n"
        "    from .odbiory import prad_wstrzykiwany_pu\n"
        "\n"
        "    for odbior in odbiory:\n"
        "        if odbior.przylaczony:\n"
        "            continue\n"
        "        pozycja = model.indeks_wezla[odbior.wezel]\n"
        "        suma_wstrzykniec[pozycja] += abs(\n"
        "            prad_wstrzykiwany_pu(\n"
        "                odbior.odbior, complex(napiecia[pozycja]), odbior.f_bazowa_hz\n"
        "            )\n"
        "        )\n"
        "        liczba_wstrzykniec[pozycja] += 1\n",
        "test granicy wobec niezaleznego wzoru — odbior odlaczony zdarzeniem na zywej szynie",
        bramki=(),
        testy=(
            "tests/walidacja_fizyczna/test_niepewnosc_na_granicy_zaokraglen.py"
            "::test_granica_zaokraglen_to_suma_modulow_skladnikow_wiersza"
            "[smib_z_odbiorem_czulym_odlaczanym]",
        ),
    ),
    Mutacja(
        "M79",
        "Bramka rownowagi sprawdza skonczonosc wylacznie stanow URZADZEN: stan estymatora "
        "odbioru NaN w chwili 0 przechodzi kontrole stanow i konczy sie odmowa pochodnych "
        "bez adresu stanu, a stan, ktorego zadna pochodna nie czyta, dotarlby do kroku.",
        "network_model/solvers/dynamika/silnik.py",
        "        sprawdz_wektor(spakuj_stany(stany), kontekst.adresy_stanow, "
        '"stany równowagi", 0.0)\n',
        "        liczba_stanow_odbiorow = sum(kontekst.wymiary_stanow[: len(kontekst.odbiory)])\n"
        "        sprawdz_wektor(\n"
        "            spakuj_stany(stany[len(kontekst.odbiory) :]),\n"
        "            kontekst.adresy_stanow[liczba_stanow_odbiorow:],\n"
        '            "stany równowagi",\n'
        "            0.0,\n"
        "        )\n",
        "test skonczonosci chwili zero — stan odbioru NaN w punkcie rozplywu i po korekcie",
        bramki=(),
        testy=(
            "tests/network_model/dynamika/test_silnik.py"
            "::test_nieskonczony_stan_odbioru_konczy_sie_odmowa_bramki_z_adresem_w_chwili_zero",
        ),
    ),
    Mutacja(
        "M80",
        "Macierz stanu analizy malosygnalowej z wlasna regula bloku dg/dx (dawna petla): "
        "dI/dx kazdego elementu takze w wierszu ograniczenia i dla urzadzenia napieciowego — "
        "linearyzacja innego ukladu niz calkowany przez rdzen.",
        "network_model/solvers/dynamika/walidacja/malosygnalowa.py",
        "        blok_gx = blok_algebry_po_stanie(kontekst, indeks, stan, napiecie, ograniczone)\n",
        "        blok_gx = element.jakobian_prad_stan(stan, napiecie)\n",
        "test macierzy stanu wobec roznicy skonczonej ukladu zredukowanego",
        bramki=(),
        testy=(
            "tests/network_model/dynamika/test_malosygnalowa.py"
            "::test_macierz_stanu_wobec_roznicy_skonczonej_ukladu_zredukowanego",
        ),
    ),
    Mutacja(
        "M21",
        "MUTACJA KONTROLNA BEZ SKUTKU — zmiana samego komentarza. Harness MUSI "
        "zakwalifikowac ja jako niewazna, a nie zameldowac zabicia.",
        "network_model/solvers/dynamika/siec.py",
        "#: Wspolczynnik warunku Armijo",
        "#: WSPOLCZYNNIK warunku Armijo",
        "BRAK — mutacja kontrolna samokontroli harnessu",
        bramki=(),
    ),
)


def _lustro_zrodel(katalog: Path) -> Path:
    """Lustro CALEGO backendu (`src` + `tests` + `pyproject.toml`) z dowiazan.

    DLACZEGO CALY BACKEND, A NIE SAM `src`. `tests/conftest.py` wstawia SWOJ katalog
    `src` na POCZATEK `sys.path` (`sys.path.insert(0, Path(__file__).parents[1]/"src")`).
    Gdyby lustro obejmowalo sam `src`, a pytest biegl w prawdziwym drzewie, prawdziwe
    zrodla PRZESLONILYBY zmutowane i mutacja nie mialaby zadnego skutku — harness
    meldowalby „PRZEZYLA" dla defektu, ktorego w ogole nie wstrzyknal. Zmierzone na
    mutacji M18: detektor testowy byl zielony, dopoki lustro nie objelo `tests`.

    Dowiazania symboliczne (`cp -as`) sa tanie i nieniszczace; podmieniany jest
    wylacznie ten jeden plik, ktory mutacja psuje.
    """
    lustro = katalog / "src"
    subprocess.run(["cp", "-as", str(KATALOG_ZRODEL), str(lustro)], check=True)
    subprocess.run(
        ["cp", "-as", str(KORZEN_BACKENDU / "tests"), str(katalog / "tests")], check=True
    )
    (katalog / "pyproject.toml").symlink_to(KORZEN_BACKENDU / "pyproject.toml")
    return lustro


def _podmien(lustro: Path, mutacja: Mutacja) -> tuple[str, str]:
    """Zamien dowiazanie na realny plik z podmieniona trescia. Zwroc (przed, po)."""
    cel = lustro / mutacja.plik
    tresc = cel.read_text()
    if mutacja.przed not in tresc:
        raise AssertionError(
            f"{mutacja.ident}: wzorzec nie wystepuje w {mutacja.plik} — "
            "mutacja opisuje kod, ktorego juz nie ma"
        )
    zmutowana = tresc.replace(mutacja.przed, mutacja.po, 1)
    cel.unlink()
    cel.write_text(zmutowana)
    return tresc, zmutowana


def kwalifikuj(przed: str, po: str) -> str:
    """BEZ ZMIANY TEKSTU / MUTACJA NIEWAZNA / MUTACJA WAZNA — z porownania AST."""
    if przed == po:
        return "BEZ ZMIANY TEKSTU"
    if ast.dump(ast.parse(przed)) == ast.dump(ast.parse(po)):
        return "MUTACJA NIEWAZNA"
    return "MUTACJA WAZNA"


def uruchom_bramki(lustro: Path, limit_s: float = 3600.0, wybrane: tuple[str, ...] = ()) -> dict:
    """Bramki w OSOBNYM procesie na zmutowanym lustrze zrodel."""
    korzen_lustra = lustro.parent
    srodowisko = dict(os.environ)
    if wybrane:
        srodowisko["WALIDACJA_BRAMKI"] = ",".join(wybrane)
    else:
        srodowisko.pop("WALIDACJA_BRAMKI", None)
    srodowisko["PYTHONPATH"] = f"{lustro}{os.pathsep}{korzen_lustra}"
    srodowisko["PYTHONDONTWRITEBYTECODE"] = "1"
    proces = subprocess.run(
        [sys.executable, "-m", "tests.walidacja_fizyczna.bramki"],
        cwd=str(korzen_lustra),
        env=srodowisko,
        capture_output=True,
        text=True,
        timeout=limit_s,
    )
    try:
        return json.loads(proces.stdout)
    except json.JSONDecodeError:
        return {
            "WSZYSTKIE_PASS": False,
            "WYJATEK": f"bieg bramek nie zwrocil JSON (kod {proces.returncode}): "
            + (proces.stderr or proces.stdout)[-400:],
        }


def uruchom_testy(lustro: Path, wezly: tuple[str, ...], limit_s: float = 900.0) -> list[str]:
    """Wskazane testy na zmutowanym lustrze. Zwraca liste CZERWONYCH wezlow.

    Nie kazda mutacja da sie zlapac bramka fizyczna. Pomiar rundy 9: stan
    `|V| <= u_V` jest NIEOSIAGALNY z poziomu biegu, bo rdzen odmawia wczesniej
    przy zapadzie — jedyna obrona kontraktu fail-closed czestotliwosci jest test
    jednostkowy. Harness, ktory umie uruchomic wylacznie bramki, zameldowalby wtedy
    „PRZEZYLA" dla mutacji, ktora tak naprawde JEST pilnowana. Dlatego mutacja moze
    deklarowac detektor testowy — i harness go wykonuje.
    """
    srodowisko = dict(os.environ)
    korzen_lustra = lustro.parent
    srodowisko["PYTHONPATH"] = f"{lustro}{os.pathsep}{korzen_lustra}"
    srodowisko["PYTHONDONTWRITEBYTECODE"] = "1"
    czerwone: list[str] = []
    for wezel in wezly:
        proces = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "-p", "no:randomly", wezel],
            cwd=str(korzen_lustra),
            env=srodowisko,
            capture_output=True,
            text=True,
            timeout=limit_s,
        )
        if proces.returncode != 0:
            czerwone.append(wezel)
    return czerwone


def wykonaj(mutacja: Mutacja, limit_s: float = 3600.0) -> dict:
    """Pelny cykl jednej mutacji: lustro -> podmiana -> kwalifikacja -> bramki -> werdykt."""
    katalog = Path(tempfile.mkdtemp(prefix=f"mutacja-{mutacja.ident}-"))
    try:
        lustro = _lustro_zrodel(katalog)
        przed, po = _podmien(lustro, mutacja)
        kwalifikacja = kwalifikuj(przed, po)
        if kwalifikacja != "MUTACJA WAZNA":
            return {
                "mutacja": mutacja.ident,
                "defekt_fizyczny": mutacja.defekt_fizyczny,
                "plik": mutacja.plik,
                "kwalifikacja": kwalifikacja,
                "oczekiwany_detektor": mutacja.oczekiwany_detektor,
                "faktyczny_detektor": None,
                "WERDYKT": kwalifikacja,
            }
        czerwone: list[str] = []
        wyjatek = None
        if mutacja.bramki:
            pomiary = uruchom_bramki(lustro, limit_s=limit_s, wybrane=mutacja.bramki)
            werdykt = pomiary.get("WERDYKT", {})
            czerwone = sorted(k for k, v in werdykt.items() if v == "FAIL")
            wyjatek = pomiary.get("WYJATEK")
        czerwone_testy = uruchom_testy(lustro, mutacja.testy) if mutacja.testy else []
        zabita = bool(czerwone) or bool(wyjatek) or bool(czerwone_testy)
        return {
            "mutacja": mutacja.ident,
            "defekt_fizyczny": mutacja.defekt_fizyczny,
            "plik": mutacja.plik,
            "kwalifikacja": kwalifikacja,
            "oczekiwany_detektor": mutacja.oczekiwany_detektor,
            "faktyczny_detektor": (
                czerwone + czerwone_testy + (["WYJATEK: " + str(wyjatek)[:200]] if wyjatek else [])
            ),
            "WERDYKT": "ZABITA" if zabita else "PRZEZYLA",
        }
    finally:
        shutil.rmtree(katalog, ignore_errors=True)


if __name__ == "__main__":  # pragma: no cover — wejscie harnessu
    wybrane = sys.argv[1:] or [m.ident for m in MUTACJE]
    # Meldunek po KAZDEJ mutacji, nie na koncu. Bieg kompletu trwa kilkanascie minut;
    # zbiorczy wydruk na koncu oznaczalby, ze przerwanie limitem czasu nie zostawia
    # ZADNEJ informacji o tym, ktore mutacje zdazyly i z jakim skutkiem.
    wyniki: list[dict] = []
    for mutacja in MUTACJE:
        if mutacja.ident not in wybrane:
            continue
        wynik = wykonaj(mutacja)
        wyniki.append(wynik)
        print(json.dumps(wynik, ensure_ascii=False), flush=True)
    print("=== PODSUMOWANIE ===")
    print(
        json.dumps(
            {
                "zabite": sorted(w["mutacja"] for w in wyniki if w["WERDYKT"] == "ZABITA"),
                "przezyly": sorted(w["mutacja"] for w in wyniki if w["WERDYKT"] == "PRZEZYLA"),
                "niewazne": sorted(
                    w["mutacja"] for w in wyniki if w["WERDYKT"] == "MUTACJA NIEWAZNA"
                ),
                "bez_zmiany_tekstu": sorted(
                    w["mutacja"] for w in wyniki if w["WERDYKT"] == "BEZ ZMIANY TEKSTU"
                ),
            },
            indent=1,
            ensure_ascii=False,
        )
    )
