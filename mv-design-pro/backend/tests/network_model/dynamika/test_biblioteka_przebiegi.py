"""Biblioteka urzadzen W6-3A: dowody NA PRZEBIEGU — po jednym na kazda rodzine.

PIEC NIEZALEZNYCH RODZAJOW DOWODU; kazda rodzina ma co najmniej trzy z nich:

1. **Zgodnosc malosygnalowa.** Czestotliwosc oscylacji ODCZYTANA Z PRZEBIEGU
   (odstepy miedzy kolejnymi maksimami, czyli calkowanie w czasie) porownana z
   czestotliwoscia policzona z WARTOSCI WLASNYCH macierzy stanu (algebra liniowa
   w jednym punkcie, ani jednego kroku calkowania). Zadna z tych dwoch liczb nie
   korzysta z kodu tej drugiej, wiec ich zgodnosc nie moze byc zgodnoscia dwoch
   kopii tego samego bledu. Sprawdzane sa OBIE wielkosci modu — czestotliwosc i
   tlumienie — bo dopasowanie samej czestotliwosci moglo by byc przypadkiem.

2. **Nienaruszalnosc ograniczen w CALYM przebiegu** (nie na probce): prad
   przeksztaltnika w kole `|I| <= i_max`, stan naladowania w `[SOC_min, SOC_max]`,
   kat lopat w `[beta_min, beta_max]`, napiecie wzbudzenia w `[Efd_min, Efd_max]`.

3. **Reakcja na skok.** Znak odpowiedzi wyprowadzony ANALITYCZNIE z parametrow
   przed uruchomieniem biegu — nie odczytany z wyniku.

4. **Prawo kontraktu NA DOKLADNEJ ROWNOSCI.** Tam, gdzie prawo regulacji jest
   algebraiczne (statyzm turbiny, statyzm Q/U, statyzm mocy czynnej GFM w obu
   trybach), porownujemy je z wzorem kontraktu do 1e-12, a nie przez przebieg.
   Na przebiegu ta sama odpowiedz jest przefiltrowana przez czlony inercyjne i
   nie da sie jej odczytac bez odtworzenia tych filtrow, czyli bez powtorzenia
   modelu w tescie.

5. **Pomiar ROZNICOWY (A/B).** Dwa biegi rozniace sie DOKLADNIE jednym czlonem
   modelu; roznica kanalow wyniku jest wtedy czystym wkladem tego czlonu i
   porownuje sie ja z prawem kontraktu ciasno. Ten rodzaj dowodu powstal, bo
   iniekcja czerwieni pokazala, ze pomiar SUMY mechanizmow niczego nie dowodzi:
   wsparcie FRT mierzone lacznie ze statyzmem Q/U i ogranicznikiem pradu dawalo
   przebieg CO DO BITU identyczny po wylaczeniu calego wsparcia. Warunki izolacji
   (ktory mechanizm wylaczamy i dlaczego) sa nazwane w kazdym takim tescie, a
   wylaczony mechanizm ma wlasny dowod gdzie indziej w tym pliku.

KAZDY Z TYCH DOWODOW MA POTWIERDZENIE PRZEZ INIEKCJE CZERWIENI — przestawienie
znaku albo pominiecie czlonu w kodzie MUSI wywalic konkretny test. Dowod, ktory
po iniekcji zostaje zielony, nie jest dowodem i jest w tym pliku traktowany jak
defekt (pierwszy przebieg iniekcji wykryl piec takich).

Uklad odniesienia jest wspolny (`biblioteka_urzadzen.zloz_uklad`): urzadzenie na
szynie GEN, szyna sztywna na SYS, jedna galaz o czystej reaktancji. Zaburzeniem
jest ZWARCIE o skonczonej impedancji usuwane po zadanym czasie — topologia po
usunieciu wraca do wyjsciowej, wiec odpowiedz swobodna po zwarciu ma dokladnie
te wartosci wlasne, ktore liczy analiza malosygnalowa w punkcie pracy.
"""

from __future__ import annotations

import cmath
import math
from dataclasses import dataclass

import numpy as np
import pytest
from network_model.solvers.dynamika import (
    HarmonogramDynamiki,
    SilnikDynamiki,
    WynikDynamiki,
    ZwarcieWezla,
)
from network_model.solvers.dynamika.calkowanie import KontekstKroku
from network_model.solvers.dynamika.kontrakty import (
    KOD_PARAMETRY_SPRZECZNE,
    OdmowaDynamiki,
    Urzadzenie,
)
from network_model.solvers.dynamika.siec import zloz_model_sieci
from network_model.solvers.dynamika.urzadzenia.pochodne_kierunkowe import Dual, Zespolona
from network_model.solvers.dynamika.urzadzenia.przeksztaltnik_gfm import PrzeksztaltnikGFM
from network_model.solvers.dynamika.walidacja import Mod, mody

from tests.network_model.dynamika.biblioteka_urzadzen import (
    S_BAZOWA_MVA,
    UkladDwuwezlowy,
    crowbar_typowy,
    magazyn,
    maszyna,
    nastawy,
    przeksztaltnik_gfl,
    przeksztaltnik_gfm,
    rdzen_gfl,
    rdzen_gfm,
    turbina,
    zloz_uklad,
)

#: Reaktancja zwarcia [Ohm] dajaca UMIARKOWANY zapad na szynie 15 kV przy bazie
#: 100 MVA (Z_b = 2,25 Ohm, wiec 0,5 Ohm = 0,222 pu).
X_ZWARCIA_OHM = 0.5
#: Reaktancja zwarcia dajaca GLEBOKI zapad (0,05 Ohm = 0,0222 pu) — do dowodu
#: nienaruszalnosci ogranicznika pradu.
X_ZWARCIA_GLEBOKIEGO_OHM = 0.05

#: Prog zgodnosci czestotliwosci modu z czestotliwoscia przebiegu. POMIAR:
#: najwieksza zmierzona rozbieznosc wzgledna na tych ukladach to 2,0e-02
#: (turbina, dwa okresy w oknie pomiarowym), wiec 8e-02 daje czterokrotny zapas.
#: Blad znaku w jakobianie przesuwa mod o rzad wielkosci, nie o kilka procent.
PROG_ZGODNOSCI_CZESTOTLIWOSCI = 8.0e-2
#: Prog zgodnosci TLUMIENIA (wspolczynnika zaniku) — wielkosc mierzona z zaniku
#: amplitudy kolejnych maksimow, wiec z natury mniej dokladna niz okres. POMIAR:
#: najwieksza zmierzona rozbieznosc bezwzgledna 1,1e-01 1/s przy modach o zaniku
#: 0,0-9,9 1/s.
PROG_ZGODNOSCI_TLUMIENIA_1_S = 1.0


@dataclass(frozen=True)
class PomiarPrzebiegu:
    """Czestotliwosc i wspolczynnik zaniku odczytane z SAMEGO przebiegu."""

    czestotliwosc_hz: float
    zanik_1_s: float
    liczba_maksimow: int


def zmierz_oscylacje(
    os_czasu_s: tuple[float, ...], szereg: tuple[float, ...], od_s: float
) -> PomiarPrzebiegu:
    """Czestotliwosc i zanik z ODSTEPOW i AMPLITUD kolejnych maksimow lokalnych.

    Wartosc ustalona jest brana jako srednia OSTATNIEJ dziesiatej czesci okna —
    odejmowanie sredniej calego okna przesuwaloby zero przy modzie slabo
    tlumionym i zawyzalo liczbe maksimow.
    """
    czas = np.asarray(os_czasu_s, dtype=float)
    wartosci = np.asarray(szereg, dtype=float)
    wybor = czas >= od_s
    czas, wartosci = czas[wybor], wartosci[wybor]
    if czas.size < 20:
        raise AssertionError(f"Okno pomiarowe ma tylko {czas.size} probek — za malo na mod")
    ustalona = float(np.mean(wartosci[-max(czas.size // 10, 3) :]))
    odchylka = wartosci - ustalona

    maksima: list[tuple[float, float]] = []
    for indeks in range(1, odchylka.size - 1):
        if odchylka[indeks] > odchylka[indeks - 1] and odchylka[indeks] >= odchylka[indeks + 1]:
            if odchylka[indeks] > 0.0:
                maksima.append((float(czas[indeks]), float(odchylka[indeks])))
    if len(maksima) < 2:
        raise AssertionError(
            f"Przebieg ma {len(maksima)} maksimow w oknie pomiarowym — nie da sie "
            "odczytac okresu (uklad nie oscyluje albo okno jest za krotkie)"
        )
    czasy = np.array([punkt[0] for punkt in maksima], dtype=float)
    amplitudy = np.array([punkt[1] for punkt in maksima], dtype=float)
    okres = float(np.mean(np.diff(czasy)))
    zanik = -float(np.polyfit(czasy, np.log(amplitudy), 1)[0])
    return PomiarPrzebiegu(
        czestotliwosc_hz=1.0 / okres, zanik_1_s=zanik, liczba_maksimow=len(maksima)
    )


def mod_ukladu(uklad: UkladDwuwezlowy, nast: object) -> tuple[Mod, ...]:
    """Mody ukladu w punkcie pracy — z wartosci wlasnych, bez ani jednego kroku."""
    wejscie = uklad.wejscie(HarmonogramDynamiki(()), nast)  # type: ignore[arg-type]
    model = zloz_model_sieci(wejscie.wezly, wejscie.galezie, wejscie.odsprzegi)
    stany = tuple(
        urzadzenie.stan_poczatkowy(
            uklad.punkt_pracy.napiecia_pu[urzadzenie.wezel],
            uklad.punkt_pracy.moce_zrodel_pu[urzadzenie.ident],
        )
        for urzadzenie in wejscie.urzadzenia
    )
    napiecia = np.array(
        [uklad.punkt_pracy.napiecia_pu[ident] for ident in model.identy_wezlow], dtype=complex
    )
    kontekst = KontekstKroku(model, wejscie.odbiory, wejscie.urzadzenia, wejscie.nastawy)
    return mody(kontekst, stany, napiecia)


def mod_najblizszy(mody_ukladu: tuple[Mod, ...], czestotliwosc_hz: float) -> Mod:
    """Mod o czestotliwosci najblizszej zmierzonej — wybor JAWNY, nie „najwyzszy".

    Uklad z regulatorami ma kilka modow oscylacyjnych (elektromechaniczny,
    wzbudzenia, stabilizatora). Porownanie z modem o najwyzszej czestotliwosci
    mierzyloby przypadkowa zgodnosc; porownanie z NAJBLIZSZYM plus wymog
    zgodnosci TLUMIENIA daje dwa niezalezne warunki na ten sam mod.
    """
    oscylacyjne = [mod for mod in mody_ukladu if mod.czestotliwosc_hz > 1.0e-6]
    if not oscylacyjne:
        raise AssertionError("Uklad nie ma modu oscylacyjnego — nie ma czego porownywac")
    return min(oscylacyjne, key=lambda mod: abs(mod.czestotliwosc_hz - czestotliwosc_hz))


def bieg_ze_zwarciem(
    uklad: UkladDwuwezlowy,
    *,
    horyzont_s: float,
    t_zwarcia_s: float = 0.1,
    czas_trwania_s: float = 0.08,
    x_zwarcia_ohm: float = X_ZWARCIA_OHM,
    dt_s: float = 0.002,
    krok_wyjscia_s: float = 0.005,
) -> WynikDynamiki:
    """Bieg z zwarciem o skonczonej impedancji, usuwanym po zadanym czasie."""
    harmonogram = HarmonogramDynamiki(
        (
            ZwarcieWezla(
                t_s=t_zwarcia_s,
                wezel="GEN",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=x_zwarcia_ohm,
                t_usuniecia_s=t_zwarcia_s + czas_trwania_s,
            ),
        )
    )
    nast = nastawy(dt_s=dt_s, horyzont_s=horyzont_s, krok_wyjscia_s=krok_wyjscia_s)
    return SilnikDynamiki(uklad.wejscie(harmonogram, nast)).uruchom()


def sprawdz_zgodnosc_malosygnalowa(
    uklad: UkladDwuwezlowy,
    wynik: WynikDynamiki,
    klucz_kanalu: str,
    od_s: float,
    opis: str,
) -> tuple[float, float]:
    """Porownaj mod z wartosci wlasnych z modem odczytanym z przebiegu."""
    pomiar = zmierz_oscylacje(wynik.os_czasu_s, wynik.probki[klucz_kanalu], od_s)
    mod = mod_najblizszy(mod_ukladu(uklad, nastawy()), pomiar.czestotliwosc_hz)
    blad_czestotliwosci = abs(pomiar.czestotliwosc_hz - mod.czestotliwosc_hz) / mod.czestotliwosc_hz
    zanik_modu = -float(mod.wartosc_wlasna.real)
    blad_tlumienia = abs(pomiar.zanik_1_s - zanik_modu)
    assert blad_czestotliwosci < PROG_ZGODNOSCI_CZESTOTLIWOSCI, (
        f"{opis}: czestotliwosc z przebiegu {pomiar.czestotliwosc_hz} Hz wobec modu "
        f"{mod.czestotliwosc_hz} Hz (blad wzgledny {blad_czestotliwosci}, "
        f"{pomiar.liczba_maksimow} maksimow)"
    )
    assert blad_tlumienia < PROG_ZGODNOSCI_TLUMIENIA_1_S, (
        f"{opis}: zanik z przebiegu {pomiar.zanik_1_s} 1/s wobec modu {zanik_modu} 1/s "
        f"(roznica {blad_tlumienia})"
    )
    return blad_czestotliwosci, blad_tlumienia


def _szereg(wynik: WynikDynamiki, klucz: str) -> np.ndarray:
    return np.asarray(wynik.probki[klucz], dtype=float)


# ---------------------------------------------------------------------------
# Maszyna synchroniczna 6. rzedu
# ---------------------------------------------------------------------------


def test_maszyna_mod_elektromechaniczny_zgodny_z_przebiegiem() -> None:
    """Mod elektromechaniczny SMIB: wartosci wlasne vs odstepy maksimow kata."""
    uklad = zloz_uklad(maszyna(), p_pu=0.8)
    wynik = bieg_ze_zwarciem(uklad, horyzont_s=4.0)
    sprawdz_zgodnosc_malosygnalowa(
        uklad, wynik, "delta_rad@G1", od_s=0.2, opis="maszyna 6. rzedu bez regulacji"
    )


def test_maszyna_z_regulacja_nie_przekracza_granic_wzbudzenia() -> None:
    """Napiecie wzbudzenia nie wychodzi poza `[Efd_min, Efd_max]` w ZADNYM kroku.

    Zwarcie jest GLEBOKIE, zeby regulator napiecia realnie doszedl do granicy —
    test bez nasycenia regulatora nie sprawdzalby ogranicznika, tylko to, ze
    nigdzie sie nie zblizyl.
    """
    urzadzenie = maszyna(z_wzbudzeniem=True, z_turbina=True, z_stabilizatorem=True)
    uklad = zloz_uklad(urzadzenie, p_pu=0.8)
    wynik = bieg_ze_zwarciem(
        uklad, horyzont_s=2.0, czas_trwania_s=0.12, x_zwarcia_ohm=X_ZWARCIA_GLEBOKIEGO_OHM
    )
    efd = _szereg(wynik, "efd_pu@G1")
    wzbudzenie = urzadzenie.wzbudzenie
    assert wzbudzenie is not None
    assert (
        efd.max() <= wzbudzenie.efd_max_pu + 1.0e-12
    ), f"Efd doszlo do {efd.max()} pu przy granicy {wzbudzenie.efd_max_pu} pu"
    assert (
        efd.min() >= wzbudzenie.efd_min_pu - 1.0e-12
    ), f"Efd spadlo do {efd.min()} pu przy granicy {wzbudzenie.efd_min_pu} pu"
    assert efd.max() == pytest.approx(wzbudzenie.efd_max_pu, abs=1.0e-9), (
        "Regulator nie doszedl do granicy — test nie sprawdzil ogranicznika, "
        f"tylko brak zblizenia (max {efd.max()} pu)"
    )


def test_maszyna_przyspiesza_zgodnie_z_rownaniem_ruchu() -> None:
    """Skok: przyspieszenie wirnika w zwarciu rowna sie `(P_szczelina - P_m)/(2H)`.

    WYROCZNIA ANALITYCZNA BEZ PODGLADANIA WYNIKU: nachylenie predkosci liczymy z
    PROBEK predkosci (roznica skonczona po osi czasu), a wartosc oczekiwana — z
    rownania ruchu, czyli z mocy mechanicznej, MIERZONYCH mocy na zaciskach i
    stalej bezwladnosci. Obie strony pochodza z innych kanalow wyniku i z innej
    czesci modelu, wiec ich zgodnosc nie jest tautologia.

    MOC PRZEZ SZCZELINE, NIE MOC NA ZACISKACH. Do rownania ruchu wchodzi moc
    przekazywana przez szczeline powietrzna, czyli `P_zaciski + R_a |I|^2`
    (Sauer & Pai: moment elektryczny liczy sie ze strumieni, nie z napiecia
    zaciskowego). Kanal `p_pu@` publikuje `Re(V conj(I))` — moc oddawana do
    SIECI, czyli juz POMNIEJSZONA o straty w stojanie. Te dwie wielkosci rozni
    sie w zwarciu o `R_a |I|^2` = 0,0169…0,0207 pu, bo prad dochodzi do 2,0 pu.
    Pierwsza wersja tej wyroczni mylila je ze soba i dawala rozjazd 7,49e-02;
    po dolozeniu strat stojana rozjazd wynosi 1,14e-04, czyli 650 razy mniej.
    Prog 5e-03 lezy 44 razy nad zmierzonym rozjazdem i 15 razy pod defektem,
    ktory ma wylapac.

    `|I|` odtwarzamy z kanalow `p_pu`, `q_pu` i `u_pu` (`|I| = |S| / |V|`), wiec
    strata stojana tez pochodzi z POMIARU, a nie z powtorzenia modelu w tescie.
    """
    urzadzenie = maszyna()
    uklad = zloz_uklad(urzadzenie, p_pu=0.8)
    wynik = bieg_ze_zwarciem(uklad, horyzont_s=1.0, czas_trwania_s=0.1, krok_wyjscia_s=0.002)
    czas = np.asarray(wynik.os_czasu_s, dtype=float)
    predkosc = _szereg(wynik, "omega_pu@G1")
    moc_zaciskow = _szereg(wynik, "p_pu@G1")
    moc_bierna = _szereg(wynik, "q_pu@G1")
    napiecie = _szereg(wynik, "u_pu@GEN")
    moc_mechaniczna = _szereg(wynik, "p_mechaniczna_pu@G1")

    w_zwarciu = (czas > 0.115) & (czas < 0.185)
    assert w_zwarciu.sum() >= 8, "Za malo probek w zwarciu na oszacowanie nachylenia"
    assert float(np.min(napiecie[w_zwarciu])) > 0.05, (
        "Odtworzenie pradu z |S|/|V| wymaga napiecia odsunietego od zera — "
        f"zmierzone minimum {float(np.min(napiecie[w_zwarciu]))} pu"
    )
    strata_stojana = urzadzenie.ra_pu * (moc_zaciskow**2 + moc_bierna**2) / napiecie**2
    nachylenie = np.gradient(predkosc, czas)[w_zwarciu]
    strata_tlumienia = urzadzenie.d_pu * (predkosc[w_zwarciu] - 1.0)
    oczekiwane = (
        moc_mechaniczna[w_zwarciu]
        - moc_zaciskow[w_zwarciu]
        - strata_stojana[w_zwarciu]
        - strata_tlumienia
    ) / (2.0 * urzadzenie.h_s)
    assert (
        float(np.mean(nachylenie)) > 0.0
    ), "Zwarcie obniza moc elektryczna, wiec wirnik MUSI przyspieszac"
    assert float(np.min(strata_stojana[w_zwarciu])) > 0.01, (
        "Straty stojana w zwarciu musza byc mierzalne, inaczej test nie odrozni "
        f"mocy przez szczeline od mocy na zaciskach (zmierzono "
        f"{float(np.min(strata_stojana[w_zwarciu]))} pu)"
    )
    blad_wzgledny = float(np.max(np.abs(nachylenie - oczekiwane)) / np.max(np.abs(oczekiwane)))
    assert blad_wzgledny < 5.0e-03, (
        f"Nachylenie predkosci z probek rozni sie od rownania ruchu o "
        f"{blad_wzgledny} (max |dw/dt| = {np.max(np.abs(nachylenie))} 1/s)"
    )


def test_statyzm_regulatora_obrotow_jest_dokladnie_prawem_kontraktu() -> None:
    """Zadanie regulatora obrotow rowna sie `clamp(Pref - dOmega/R, Pmin, Pmax)`.

    To jest wyrocznia ANALITYCZNA bloku, nie przebiegu: sprawdzamy sam statyzm z
    ogranicznikiem, w trzech obszarach (wnetrze, gorne nasycenie, dolne
    nasycenie). Na przebiegu ta odpowiedz jest przefiltrowana przez dwa czlony
    inercyjne turbiny i nie da sie jej odczytac bez odtwarzania tych filtrow,
    czyli bez powtarzania modelu w tescie.
    """
    from network_model.solvers.dynamika.urzadzenia.pochodne_kierunkowe import Dual

    urzadzenie = maszyna(z_turbina=True)
    regulator = urzadzenie.turbina
    assert regulator is not None
    for odchylka, opis in ((0.0, "punkt pracy"), (0.002, "przesterowanie"), (-0.002, "spadek")):
        oczekiwane = min(
            max(0.8 - odchylka / regulator.r_pu, regulator.p_min_pu), regulator.p_max_pu
        )
        zmierzone = regulator.zadanie_ograniczone(Dual(0.8), Dual(odchylka)).wartosc
        assert zmierzone == pytest.approx(oczekiwane, abs=1e-12), opis
    assert regulator.zadanie_ograniczone(Dual(0.8), Dual(-1.0)).wartosc == pytest.approx(
        regulator.p_max_pu
    ), "Ogranicznik gorny mocy turbiny nie zadzialal"
    assert regulator.zadanie_ograniczone(Dual(0.8), Dual(1.0)).wartosc == pytest.approx(
        regulator.p_min_pu
    ), "Ogranicznik dolny mocy turbiny nie zadzialal"


# ---------------------------------------------------------------------------
# Przeksztaltnik nadazny (GFL)
# ---------------------------------------------------------------------------

#: PLL o pasmie obnizonym tak, zeby mod synchronizacji lezal w okolicy 4-5 Hz i
#: dal sie odczytac z przebiegu przy kroku 2 ms (parametry przemyslowe daja mod
#: ponad 20 Hz, czyli okres rzedu dziesieciu probek).
PLL_WOLNY: dict[str, float] = {"pll_kp": 0.05, "pll_ki": 3.0}

#: Nastawy ODCINAJACE oba mechanizmy, ktore maskuja prawo FRT w przebiegu:
#: statyzm Q/U (drugie zrodlo pradu biernego w tym samym zapadzie) i ogranicznik
#: pradu (przycinal skladowa bierna do `i_max` niezaleznie od wsparcia).
#: Uzasadnienie i pomiary — w docstringu `test_gfl_wstrzykuje_prad_bierny...`.
IZOLACJA_FRT: dict[str, float] = {"droop_q_u_pu": 0.0, "i_max_pu": 4.0}


def test_gfl_mod_synchronizacji_zgodny_z_przebiegiem() -> None:
    """Mod petli synchronizacji: wartosci wlasne vs odstepy maksimow kata PLL."""
    uklad = zloz_uklad(przeksztaltnik_gfl(**PLL_WOLNY), p_pu=0.25)
    wynik = bieg_ze_zwarciem(uklad, horyzont_s=2.0, czas_trwania_s=0.06, dt_s=0.001)
    sprawdz_zgodnosc_malosygnalowa(
        uklad, wynik, "pll_kat_rad@PV1", od_s=0.17, opis="przeksztaltnik nadazny"
    )


def test_gfl_nie_przekracza_ogranicznika_pradu_w_zadnym_kroku() -> None:
    """`|I| <= i_max` w CALYM przebiegu, przy zwarciu wymuszajacym ograniczenie."""
    urzadzenie = przeksztaltnik_gfl()
    uklad = zloz_uklad(urzadzenie, p_pu=0.25)
    wynik = bieg_ze_zwarciem(
        uklad, horyzont_s=1.5, czas_trwania_s=0.15, x_zwarcia_ohm=X_ZWARCIA_GLEBOKIEGO_OHM
    )
    czynny = _szereg(wynik, "i_czynny_pu@PV1")
    bierny = _szereg(wynik, "i_bierny_pu@PV1")
    modul = np.hypot(czynny, bierny)
    i_max = urzadzenie.rdzen.i_max_pu
    assert (
        modul.max() <= i_max + 1.0e-9
    ), f"Prad przeksztaltnika doszedl do {modul.max()} pu przy ograniczniku {i_max} pu"
    assert modul.max() > 0.9 * i_max, (
        f"Zwarcie nie wymusilo ograniczenia (max {modul.max()} pu wobec {i_max} pu) — "
        "test nie sprawdzil ogranicznika"
    )


def test_gfl_wstrzykuje_prad_bierny_przy_zapadzie() -> None:
    """Skok: przy zapadzie ponizej progu FRT prad bierny ROSNIE o `k_frt * dU`.

    POMIAR ROZNICOWY, NIE PASMO RZEDU WIELKOSCI. Ten sam bieg idzie DWA RAZY:
    raz z `k_frt` z kontraktu, raz z `k_frt = 0`. Wszystko poza wsparciem
    napieciowym jest w obu biegach identyczne, wiec ROZNICA pradu biernego jest
    czystym wkladem FRT i mozna ja porownac z prawem kontraktu ciasno.

    DLACZEGO DAWNA WERSJA BYLA SLEPA (pomiar). Mierzyla `max(i_bierny) -
    i_bierny(0)` i przyjmowala wszystko w pasmie `0,1…10` krotnosci. W tym
    ukladzie zapad siega 0,43 pu, a wtedy SAM statyzm Q/U — nasycony na `u_min`
    — zada 1,14 pu pradu biernego, wiec ogranicznik przycina skladowa bierna
    DOKLADNIE do `i_max` niezaleznie od tego, czy wsparcie FRT w ogole liczy sie
    do zadania. Iniekcja „pomin cale wsparcie FRT" dawala przebieg CO DO BITU
    identyczny i test przechodzil na zielono. Mierzyl zaciecie ogranicznika, nie
    prawo FRT.

    DWA WARUNKI IZOLACJI, oba nazwane wprost i oba sprawdzone asercja:
    * `droop_q_u_pu = 0` — statyzm Q/U jest drugim, NIEZALEZNYM zrodlem pradu
      biernego w tym samym zapadzie; bez jego wylaczenia nie da sie odczytac
      wkladu FRT. Sam statyzm ma wlasny dowod w tescie ponizej.
    * `i_max` podniesione do 4,0 pu bazy urzadzenia (1,2 pu ukladu) — ogranicznik
      pradu ma SWOJ dowod (`test_gfl_nie_przekracza_ogranicznika_pradu...`);
      tutaj musi byc nieaktywny, inaczej mierzylibysmy jego prog zamiast prawa.

    WYROCZNIA JEST PELNA, nie samym czlonem FRT. Zadanie skladowej biernej to
    `q_zadane/|V| + k_frt (U_prog - |V|)`. Bieg ze wsparciem ma WYZSZE napiecie
    (0,4713 wobec 0,4401 pu), wiec czlon `q_zadane/|V|` jest w nim MNIEJSZY —
    i o te roznice trzeba wyrocznie poprawic. Bez tej poprawki iloraz stoi na
    0,892 (systematycznie, nie losowo); z nia na 0,9998. Wszystkie skladniki
    wyroczni pochodza z KANALOW WYNIKU obu biegow, wiec nie jest to powtorzenie
    modelu w tescie.
    """
    urzadzenie = przeksztaltnik_gfl(**IZOLACJA_FRT)
    bez_wsparcia = przeksztaltnik_gfl(**IZOLACJA_FRT, k_frt=0.0)
    assert urzadzenie.rdzen.k_frt > 0.0, "Wariant badany ma miec NIEZEROWE wsparcie FRT"
    assert bez_wsparcia.rdzen.k_frt == 0.0, "Wariant odniesienia ma miec ZEROWE wsparcie FRT"
    ze_wsparciem = bieg_ze_zwarciem(
        zloz_uklad(urzadzenie, p_pu=0.25), horyzont_s=1.0, czas_trwania_s=0.15
    )
    bez = bieg_ze_zwarciem(zloz_uklad(bez_wsparcia, p_pu=0.25), horyzont_s=1.0, czas_trwania_s=0.15)
    czas = np.asarray(ze_wsparciem.os_czasu_s, dtype=float)
    w_zwarciu = (czas > 0.15) & (czas < 0.25)
    napiecie = _szereg(ze_wsparciem, "u_pu@GEN")[w_zwarciu]
    napiecie_bez = _szereg(bez, "u_pu@GEN")[w_zwarciu]
    bierny = _szereg(ze_wsparciem, "i_bierny_pu@PV1")[w_zwarciu]
    bierny_bez = _szereg(bez, "i_bierny_pu@PV1")[w_zwarciu]
    zadanie_q = _szereg(ze_wsparciem, "q_zadane_pu@PV1")[w_zwarciu]
    zadanie_q_bez = _szereg(bez, "q_zadane_pu@PV1")[w_zwarciu]

    assert float(napiecie.mean()) < urzadzenie.rdzen.prog_frt_pu, (
        f"Zapad {float(napiecie.mean())} pu nie zszedl ponizej progu FRT "
        f"{urzadzenie.rdzen.prog_frt_pu} pu — test nie sprawdzil wsparcia"
    )
    for opis, wynik_biegu in (("ze wsparciem", ze_wsparciem), ("bez wsparcia", bez)):
        modul = np.hypot(
            _szereg(wynik_biegu, "i_czynny_pu@PV1"), _szereg(wynik_biegu, "i_bierny_pu@PV1")
        )
        assert float(modul.max()) < urzadzenie.rdzen.i_max_pu - 1.0e-3, (
            f"Ogranicznik pradu zadzialal w biegu {opis} (|I| doszlo do {float(modul.max())} pu "
            f"przy {urzadzenie.rdzen.i_max_pu} pu) — wklad FRT byloby wtedy przyciety i "
            "test mierzylby prog ogranicznika zamiast prawa wsparcia"
        )

    zmierzony = float(np.mean(bierny - bierny_bez))
    wsparcie = urzadzenie.rdzen.k_frt * (urzadzenie.rdzen.prog_frt_pu - napiecie)
    przewidziany = float(np.mean(wsparcie + zadanie_q / napiecie - zadanie_q_bez / napiecie_bez))
    assert zmierzony > 0.0, "Wsparcie FRT musi ZWIEKSZAC prad bierny"
    assert zmierzony / przewidziany == pytest.approx(1.0, abs=1.0e-2), (
        f"Wklad wsparcia FRT w prad bierny {zmierzony} pu rozni sie od prawa "
        f"`k_frt * dU` poprawionego o czlon `q_zadane/|V|` ({przewidziany} pu)"
    )


def test_gfl_statyzm_q_u_jest_dokladnie_prawem_kontraktu() -> None:
    """Statyzm Q/U rowna sie `-(clamp(U) - U_odn) / droop` ze strefa martwa.

    Statyzm Q/U zostal WYLACZONY w dowodzie FRT powyzej, zeby odciac drugie
    zrodlo pradu biernego — wiec musi miec dowod WLASNY, inaczej wylaczenie
    zamiotloby go pod dywan. Sprawdzamy sam blok w pieciu obszarach: wewnatrz
    strefy martwej, po obu jej stronach oraz poza pasmem pracy ciaglej z obu
    stron (tam statyzm NASYCA sie, a regulacje przejmuje wsparcie FRT).
    """
    from network_model.solvers.dynamika.urzadzenia.pochodne_kierunkowe import Dual

    rdzen = rdzen_gfl()
    odniesienie = 1.05
    przypadki = (
        (1.05, "punkt odniesienia"),
        (1.055, "wewnatrz strefy martwej"),
        (1.08, "powyzej strefy martwej"),
        (1.0, "ponizej strefy martwej"),
        (0.5, "ponizej pasma pracy ciaglej — nasycenie statyzmu"),
        (1.3, "powyzej pasma pracy ciaglej — nasycenie statyzmu"),
    )
    for napiecie, opis in przypadki:
        w_pasmie = min(max(napiecie, rdzen.u_min_ciagle_pu), rdzen.u_max_ciagle_pu)
        odchylka = w_pasmie - odniesienie
        if abs(odchylka) <= rdzen.martwa_strefa_u_pu:
            odchylka_po_strefie = 0.0
        else:
            odchylka_po_strefie = odchylka - math.copysign(rdzen.martwa_strefa_u_pu, odchylka)
        oczekiwane = -odchylka_po_strefie / rdzen.droop_q_u_pu
        zmierzone = rdzen.korekta_statyzmu_biernego(Dual(napiecie), Dual(odniesienie)).wartosc
        assert zmierzone == pytest.approx(oczekiwane, abs=1.0e-12), opis
    assert rdzen_gfl(droop_q_u_pu=0.0).korekta_statyzmu_biernego(
        Dual(0.5), Dual(odniesienie)
    ).wartosc == pytest.approx(0.0, abs=1.0e-12), "Zerowy statyzm ma dawac ZEROWA korekte"


def test_gfl_petla_synchronizacji_nadaza_za_katem_napiecia_wezla() -> None:
    """PLL SYNCHRONIZUJE sie: jego kat zbiega do kata napiecia szyny.

    To jest kontrakt petli, a nie jej dynamika: przy uchybie `eps = -V_d` zerem
    jest dokladnie `theta_PLL = arg(V)`. Dowod na modzie (`test_gfl_mod_...`)
    tego NIE obejmuje — porownuje czestotliwosc z przebiegu z wartosciami
    wlasnymi, a obie strony licza sie z tego samego `f`, wiec przestawiony znak
    uchybu przesuwa je RAZEM i zgodnosc zostaje. Iniekcja „przestaw znak uchybu
    PLL" przechodzila przez tamten test na zielono.

    Sprawdzamy oba rezimy: przed zaburzeniem (kat ustalony) i po usunieciu
    zwarcia (petla musi WROCIC do zgodnosci, a nie zatrzasnac sie gdzie indziej).
    """
    uklad = zloz_uklad(przeksztaltnik_gfl(), p_pu=0.25)
    wynik = bieg_ze_zwarciem(uklad, horyzont_s=2.0, czas_trwania_s=0.15)
    czas = np.asarray(wynik.os_czasu_s, dtype=float)
    kat_pll = _szereg(wynik, "pll_kat_rad@PV1")
    kat_wezla = np.radians(_szereg(wynik, "kat_deg@GEN"))
    uchyb = np.arctan2(np.sin(kat_pll - kat_wezla), np.cos(kat_pll - kat_wezla))

    przed = czas < 0.09
    po = czas > 1.5
    assert float(np.max(np.abs(uchyb[przed]))) < 1.0e-9, (
        "Przed zaburzeniem PLL ma byc ZSYNCHRONIZOWANY — zmierzony uchyb "
        f"{float(np.max(np.abs(uchyb[przed]))):.3e} rad"
    )
    assert float(np.max(np.abs(uchyb[po]))) < 1.0e-3, (
        "Po usunieciu zwarcia PLL musi WROCIC do zgodnosci z katem szyny — "
        f"zmierzony uchyb {float(np.max(np.abs(uchyb[po]))):.3e} rad"
    )


# ---------------------------------------------------------------------------
# Przeksztaltnik tworzacy siec (GFM)
# ---------------------------------------------------------------------------


def test_gfm_mod_maszyny_wirtualnej_zgodny_z_przebiegiem() -> None:
    """Mod maszyny wirtualnej: wartosci wlasne vs odstepy maksimow kata."""
    uklad = zloz_uklad(przeksztaltnik_gfm(tryb="vsm"), p_pu=0.3)
    wynik = bieg_ze_zwarciem(uklad, horyzont_s=4.0)
    sprawdz_zgodnosc_malosygnalowa(
        uklad, wynik, "kat_rad@GFM1", od_s=0.2, opis="przeksztaltnik tworzacy siec (VSM)"
    )


@pytest.mark.parametrize("strategia", ["impedancja_wirtualna", "nasycenie_zadania"])
def test_gfm_nie_przekracza_ogranicznika_pradu(strategia: str) -> None:
    """`|I| <= i_max` w calym przebiegu dla OBU strategii ograniczenia z kontraktu."""
    urzadzenie = przeksztaltnik_gfm(strategia_ograniczenia=strategia)
    uklad = zloz_uklad(urzadzenie, p_pu=0.3)
    wynik = bieg_ze_zwarciem(uklad, horyzont_s=1.0, czas_trwania_s=0.12)
    czynna = _szereg(wynik, "p_pu@GFM1")
    bierna = _szereg(wynik, "q_pu@GFM1")
    napiecie = _szereg(wynik, "u_pu@GEN")
    modul_pradu = np.hypot(czynna, bierna) / np.maximum(napiecie, 1.0e-9)
    i_max = urzadzenie.rdzen.i_max_pu
    assert (
        modul_pradu.max() <= i_max + 1.0e-6
    ), f"{strategia}: prad doszedl do {modul_pradu.max()} pu przy ograniczniku {i_max} pu"
    assert (
        modul_pradu.max() > 0.9 * i_max
    ), f"{strategia}: zwarcie nie wymusilo ograniczenia (max {modul_pradu.max()} pu)"


@pytest.mark.parametrize("strategia", ["impedancja_wirtualna", "nasycenie_zadania"])
def test_gfm_ogranicza_prad_w_calym_zakresie_napiec(strategia: str) -> None:
    """`|I| <= i_max` na ZAMIECIONYM zakresie napiec, az do zapadu prawie do zera.

    DLACZEGO WPROST, A NIE PRZEZ BIEG. Bieg odwiedza tylko te napiecia, ktore
    same wypadna z calkowania, i nigdy nie da pewnosci co do CALEGO zakresu.
    Tutaj prad urzadzenia liczony jest wprost dla siatki napiec (modul x kat),
    wiec ograniczenie jest sprawdzone tam, gdzie bieg nigdy nie zajrzy — w tym
    przy zapadzie prawie do zera, gdzie zadanie SEM najmocniej rozjezdza sie z
    napieciem wezla.
    """
    urzadzenie = przeksztaltnik_gfm(strategia_ograniczenia=strategia)
    uklad = zloz_uklad(urzadzenie, p_pu=0.3)
    stan = urzadzenie.stan_poczatkowy(uklad.napiecie_gen_pu, uklad.moc_gen_pu)
    i_max = urzadzenie.rdzen.i_max_pu
    najwiekszy = 0.0
    for modul in np.linspace(0.01, 1.2, 60):
        for kat in np.linspace(-math.pi, math.pi, 25):
            napiecie = complex(modul * math.cos(kat), modul * math.sin(kat))
            prad = urzadzenie.prad_pu(stan, napiecie)
            najwiekszy = max(najwiekszy, abs(prad))
            assert abs(prad) <= i_max + 1.0e-9, (
                f"{strategia}: przy napieciu {napiecie} prad {abs(prad)} pu przekroczyl "
                f"ogranicznik {i_max} pu"
            )
    assert (
        najwiekszy > 0.99 * i_max
    ), f"{strategia}: zamiecenie nie dosieglo ogranicznika (max {najwiekszy} pu)"


def test_gfm_dwie_strategie_ograniczenia_zmieniaja_prad_inaczej() -> None:
    """Obie strategie trzymaja `|I| = i_max`, ale KIERUNEK pradu maja rozny.

    To jest jedyna rzecz, ktora te dwie strategie odroznia — i az do teraz nie
    miala dowodu. Test `..._nie_przekracza_ogranicznika_pradu` sprawdza sam
    MODUL, a modul obie strategie daja identyczny (oba konczy to samo obciecie
    `|I| <= i_max`), wiec iniekcja usuwajaca cale sciaganie modulu SEM
    (`sciagniecie = 1`) przechodzila przez niego NA ZIELONO: prad wracal wtedy
    do kierunku strategii impedancyjnej, co modulowi nie szkodzi.

    KONTRAKT, ktory tu sprawdzamy:
    * `impedancja_wirtualna` skaluje CALA roznice `E - V` liczba rzeczywista,
      wiec kierunek pradu zostaje taki, jaki byl bez ograniczenia — i to jest
      sprawdzone wprost, przez porownanie z `arg((E - V)/Z_w)`;
    * `nasycenie_zadania` sciaga tylko skladowa ROWNOLEGLA do kierunku kata,
      wiec wierzcholek trojkata napiec sie przesuwa i kierunek pradu SIE ZMIENIA.

    POMIAR: przy napieciach 0,1…0,9 pu i katach -30…+30 stopni oba prady maja
    modul dokladnie 0,48 pu (= `i_max`), a ich kierunki roznia sie o 0,078…0,687
    rad. Prog 1e-2 rad lezy osiem razy ponizej najmniejszej zmierzonej roznicy.
    """
    warianty: dict[str, tuple[PrzeksztaltnikGFM, np.ndarray]] = {}
    for strategia in ("impedancja_wirtualna", "nasycenie_zadania"):
        urzadzenie = przeksztaltnik_gfm(strategia_ograniczenia=strategia)
        uklad = zloz_uklad(urzadzenie, p_pu=0.3)
        warianty[strategia] = (
            urzadzenie,
            urzadzenie.stan_poczatkowy(uklad.napiecie_gen_pu, uklad.moc_gen_pu),
        )
    impedancja, stan_impedancji = warianty["impedancja_wirtualna"]
    nasycenie, stan_nasycenia = warianty["nasycenie_zadania"]
    i_max = impedancja.rdzen.i_max_pu
    najmniejsza_roznica = math.inf

    for modul in (0.1, 0.3, 0.5, 0.7, 0.9):
        for kat_stopni in (-30.0, 0.0, 30.0):
            napiecie = cmath.rect(modul, math.radians(kat_stopni))
            prad_impedancji = impedancja.prad_pu(stan_impedancji, napiecie)
            prad_nasycenia = nasycenie.prad_pu(stan_nasycenia, napiecie)
            opis = f"|V| = {modul} pu, kat = {kat_stopni} stopni"
            assert abs(prad_impedancji) == pytest.approx(i_max, abs=1.0e-9), opis
            assert abs(prad_nasycenia) == pytest.approx(i_max, abs=1.0e-9), opis

            stany_dual = dict(
                zip(
                    impedancja.nazwy_stanow,
                    [Dual(float(wartosc)) for wartosc in stan_impedancji],
                    strict=True,
                )
            )
            sem = impedancja.rdzen.napiecie_wewnetrzne(stany_dual)
            bez_ograniczenia = (
                complex(sem.re.wartosc, sem.im.wartosc) - napiecie
            ) / impedancja.rdzen.impedancja_pu
            assert cmath.phase(prad_impedancji) == pytest.approx(
                cmath.phase(bez_ograniczenia), abs=1.0e-9
            ), (
                f"{opis}: impedancja wirtualna skaluje roznice napiec liczba RZECZYWISTA, "
                "wiec kierunek pradu MUSI zostac kierunkiem bez ograniczenia"
            )

            roznica_kata = abs(cmath.phase(prad_impedancji / prad_nasycenia))
            najmniejsza_roznica = min(najmniejsza_roznica, roznica_kata)
            assert roznica_kata > 1.0e-2, (
                f"{opis}: obie strategie daly TEN SAM kierunek pradu (roznica "
                f"{roznica_kata} rad) — nasycenie zadania nie przesuwa wierzcholka "
                "trojkata napiec, czyli jest druga nazwa tej samej strategii"
            )
    assert najmniejsza_roznica < 1.0, (
        "Kontrola samego pomiaru: kierunki nie moga sie roznic o radian, to byloby "
        f"inne zjawisko niz opisane (zmierzono minimum {najmniejsza_roznica} rad)"
    )


def test_gfm_statyzm_czynny_jest_dokladnie_prawem_kontraktu_w_obu_trybach() -> None:
    """Prawo statyzmu mocy czynnej — DOKLADNIE, osobno dla kazdego z dwoch trybow.

    Oba tryby wyrazaja to samo prawo regulacji, ale W INNYM MIEJSCU KODU, wiec
    kazdy potrzebuje wlasnego dowodu:

    * `droop` — czestotliwosc jest ALGEBRAICZNA: `omega = 1 - mp (P_f - P_zad)`;
    * `vsm` — czestotliwosc jest STANEM, a statyzm siedzi w rownaniu ruchu:
      `2 H dω/dt = P_zad - (ω-1)/mp - P_f - D (ω-1)`.

    DLACZEGO TO NIE JEST DUBLOWANIE DOWODU NA PRZEBIEGU. Dawny test o tej nazwie
    puszczal bieg w trybie `vsm` i porownywal PRZEJSCIOWY spadek predkosci z
    `mp * dP` w pasmie `0,1…10` krotnosci. Dwa bledy naraz: przejsciowy dolek
    predkosci rzadzi sie bezwladnoscia `H`, a nie statyzmem (`mp * dP` to
    zaleznosc USTALONA, nie chwilowa), a wzor z trybu `droop` nie wykonuje sie
    w trybie `vsm` ANI RAZU. Iniekcja „przestaw znak statyzmu mocy czynnej"
    (wiersz trybu `droop`) przechodzila wiec na zielono — test nie dotykal
    zmienionego kodu. Tutaj kazdy tryb jest sprawdzany tam, gdzie naprawde
    zywie, i to na dokladnej rownosci zamiast na pasmie rzedu wielkosci.
    """
    from network_model.solvers.dynamika.urzadzenia.pochodne_kierunkowe import Dual

    statyzm = przeksztaltnik_gfm(tryb="droop")
    rdzen_statyzmu = statyzm.rdzen
    assert "omega_pu" not in statyzm.nazwy_stanow, (
        "W trybie statyzmu predkosc jest wielkoscia ALGEBRAICZNA — stan o wartosci "
        "wyznaczonej z innego stanu bylby duplikatem informacji"
    )
    for moc_filtru, moc_zadana, opis in (
        (0.30, 0.30, "punkt pracy"),
        (0.40, 0.30, "wzrost mocy oddawanej"),
        (0.20, 0.30, "spadek mocy oddawanej"),
    ):
        stany = {
            "p_filtr_pu": Dual(moc_filtru),
            "p_zadane_pu": Dual(moc_zadana),
        }
        oczekiwane = 1.0 - (moc_filtru - moc_zadana) * rdzen_statyzmu.mp_pu
        zmierzone = rdzen_statyzmu.predkosc(stany, statyzm.okno_mocy).wartosc
        assert zmierzone == pytest.approx(oczekiwane, abs=1.0e-12), opis
    assert (
        rdzen_statyzmu.predkosc(
            {"p_filtr_pu": Dual(0.40), "p_zadane_pu": Dual(0.30)}, statyzm.okno_mocy
        ).wartosc
        < 1.0
    ), "Wzrost mocy oddawanej musi OBNIZAC czestotliwosc, nie podnosic"

    maszyna_wirtualna = przeksztaltnik_gfm(tryb="vsm")
    rdzen_maszyny = maszyna_wirtualna.rdzen
    assert (
        "omega_pu" in maszyna_wirtualna.nazwy_stanow
    ), "W trybie maszyny wirtualnej predkosc jest STANEM rownania ruchu"
    for predkosc_pu, moc_filtru, opis in (
        (1.0, 0.30, "predkosc znamionowa, moc rowna zadaniu"),
        (1.0, 0.40, "predkosc znamionowa, moc ponad zadaniem"),
        (1.002, 0.30, "predkosc ponad znamionowa"),
        (0.998, 0.30, "predkosc ponizej znamionowej"),
    ):
        odchylka = predkosc_pu - 1.0
        oczekiwane = (
            0.30
            - odchylka / rdzen_maszyny.mp_pu
            - moc_filtru
            - odchylka * rdzen_maszyny.d_wirtualne_pu
        ) / (2.0 * rdzen_maszyny.h_wirtualne_s)
        stany = {
            "kat_rad": Dual(0.1),
            "omega_pu": Dual(predkosc_pu),
            "p_filtr_pu": Dual(moc_filtru),
            "q_filtr_pu": Dual(0.0),
            "p_zadane_pu": Dual(0.30),
            "q_zadane_pu": Dual(0.0),
            "u_odniesienia_pu": Dual(1.05),
        }
        pochodne = rdzen_maszyny.rownania(
            stany, Zespolona(Dual(1.0), Dual(0.0)), maszyna_wirtualna.okno_mocy, "GFM1"
        )
        assert pochodne["omega_pu"].wartosc == pytest.approx(oczekiwane, abs=1.0e-12), opis


def test_gfm_statyzm_obniza_czestotliwosc_w_przebiegu() -> None:
    """Na PRZEBIEGU: wzrost mocy oddawanej obniza czestotliwosc maszyny wirtualnej.

    Dowod ZNAKU na pelnej sciezce (siec + calkowanie), komplementarny do dowodu
    DOKLADNEJ rownosci na samym prawie powyzej. Magnitudy nie porownujemy z
    `mp * dP`, bo przejsciowa odpowiedz rzadzi sie bezwladnoscia `H`, nie samym
    statyzmem — porownanie z zaleznoscia USTALONA byloby wyrocznia z innego
    rezimu niz mierzony przebieg.
    """
    urzadzenie = przeksztaltnik_gfm(tryb="vsm")
    uklad = zloz_uklad(urzadzenie, p_pu=0.3)
    wynik = bieg_ze_zwarciem(uklad, horyzont_s=2.0, czas_trwania_s=0.08)
    czas = np.asarray(wynik.os_czasu_s, dtype=float)
    predkosc = _szereg(wynik, "omega_pu@GFM1")
    moc_filtru = _szereg(wynik, "p_filtr_pu@GFM1")
    assert (
        float(moc_filtru.max() - moc_filtru[0]) > 0.0
    ), "Zwarcie musi przejsciowo zwiekszyc moc oddawana — bez tego nie ma czego mierzyc"
    chwila_szczytu = int(np.argmax(moc_filtru))
    po_szczycie = predkosc[chwila_szczytu:]
    assert float(po_szczycie.min()) < float(predkosc[0]), (
        f"Po szczycie mocy (t = {czas[chwila_szczytu]} s) predkosc MUSI zejsc ponizej "
        f"wartosci poczatkowej {float(predkosc[0])} pu — zmierzone minimum "
        f"{float(po_szczycie.min())} pu"
    )


# ---------------------------------------------------------------------------
# Magazyn
# ---------------------------------------------------------------------------


def test_magazyn_mod_przeksztaltnika_zgodny_z_przebiegiem() -> None:
    """Magazyn dziedziczy mod po swoim przeksztaltniku — sprawdzamy to POMIAREM."""
    uklad = zloz_uklad(magazyn(rdzen=rdzen_gfm(tryb="vsm")), p_pu=0.2)
    wynik = bieg_ze_zwarciem(uklad, horyzont_s=4.0)
    sprawdz_zgodnosc_malosygnalowa(
        uklad, wynik, "kat_rad@BESS1", od_s=0.2, opis="magazyn z przeksztaltnikiem VSM"
    )


@pytest.mark.parametrize(
    ("opis", "soc_poczatkowy", "p_pu"),
    [
        ("rozladowanie do dolnej granicy", 0.1001, 0.24),
        ("ladowanie do gornej granicy", 0.8999, -0.24),
    ],
)
def test_magazyn_nie_wychodzi_poza_zakres_naladowania(
    opis: str, soc_poczatkowy: float, p_pu: float
) -> None:
    """SOC nie wychodzi poza `[SOC_min, SOC_max]` w ZADNYM kroku.

    Stan poczatkowy jest tuz przy granicy, a moc maksymalna — po to, zeby granica
    ZOSTALA OSIAGNIETA w przebiegu. Test na magazynie w polowie zakresu nie
    sprawdzalby ogranicznika, tylko to, ze nigdzie sie nie zblizyl.
    """
    urzadzenie = magazyn(soc_poczatkowy=soc_poczatkowy)
    uklad = zloz_uklad(urzadzenie, p_pu=p_pu)
    wynik = bieg_ze_zwarciem(uklad, horyzont_s=2.0, czas_trwania_s=0.08)
    soc = _szereg(wynik, "soc_pu@BESS1")
    zasobnik = urzadzenie.zasobnik
    assert soc.min() >= zasobnik.soc_min - 1.0e-12, f"{opis}: SOC spadl do {soc.min()}"
    assert soc.max() <= zasobnik.soc_max + 1.0e-12, f"{opis}: SOC wzrosl do {soc.max()}"
    granica = zasobnik.soc_min if p_pu > 0.0 else zasobnik.soc_max
    osiagniete = soc.min() if p_pu > 0.0 else soc.max()
    assert osiagniete == pytest.approx(granica, abs=1.0e-9), (
        f"{opis}: SOC nie doszedl do granicy {granica} (osiagnieto {osiagniete}) — "
        "test nie sprawdzil ogranicznika"
    )


def test_magazyn_rozladowanie_i_ladowanie_maja_przeciwne_znaki_dryfu_soc() -> None:
    """Skok: znak `d(SOC)/dt` wynika z KIERUNKU mocy, a wartosc z bilansu energii.

    Rzad wielkosci z parametrow: przy mocy 0,20 pu bazy 100 MVA (20 MW), pojemnosci
    20 000 kWh i sprawnosci rozladowania 0,93 stan naladowania spada o
    `20/0,93 / (20 * 3600) = 2,99e-04 1/s`. Ta liczba jest policzona PRZED biegiem
    i porownana z pomiarem z dokladnoscia do jednego procenta.
    """
    for p_pu, sprawnosc_opis in ((0.2, "rozladowanie"), (-0.2, "ladowanie")):
        urzadzenie = magazyn()
        uklad = zloz_uklad(urzadzenie, p_pu=p_pu)
        wynik = bieg_ze_zwarciem(uklad, horyzont_s=1.0, czas_trwania_s=0.0001)
        czas = np.asarray(wynik.os_czasu_s, dtype=float)
        soc = _szereg(wynik, "soc_pu@BESS1")
        zasobnik = urzadzenie.zasobnik
        sprawnosc = (
            zasobnik.sprawnosc_rozladowania if p_pu > 0.0 else 1.0 / zasobnik.sprawnosc_ladowania
        )
        oczekiwane_tempo = -(p_pu * S_BAZOWA_MVA * 1000.0 / sprawnosc) / (
            zasobnik.pojemnosc_kwh * 3600.0
        )
        zmierzone_tempo = float((soc[-1] - soc[0]) / (czas[-1] - czas[0]))
        assert math.copysign(1.0, zmierzone_tempo) == math.copysign(
            1.0, oczekiwane_tempo
        ), f"{sprawnosc_opis}: znak dryfu SOC {zmierzone_tempo} niezgodny z kierunkiem mocy"
        assert zmierzone_tempo == pytest.approx(oczekiwane_tempo, rel=0.02), (
            f"{sprawnosc_opis}: tempo {zmierzone_tempo} 1/s wobec bilansu energii "
            f"{oczekiwane_tempo} 1/s"
        )


# ---------------------------------------------------------------------------
# Turbina wiatrowa
# ---------------------------------------------------------------------------


def test_turbina_mod_mechaniczny_zgodny_z_wyprowadzeniem_analitycznym() -> None:
    """Mod petli predkosc-kat lopat: wartosci wlasne vs POSTAC ZAMKNIETA.

    Wyprowadzenie (dwa stany, reszta odsprzegnieta przez przeksztaltnik):
    `2H dw/dt = P_aero (b_max - b)/(b_max - b_min) - P_el`,
    `db/dt = tempo (w - 1)` daje pulsacje
    `sqrt(P_aero * tempo / ((b_max - b_min) * 2H))`.

    DLACZEGO TEN MOD NIE JEST CZYTANY Z PRZEBIEGU. Kat lopat w rownowadze lezy
    DOKLADNIE na swoim ograniczniku dolnym (kat minimalny = praca z maksymalnym
    odbiorem mocy z wiatru), wiec odpowiedz jest z natury JEDNOSTRONNA — dolna
    polowka oscylacji jest obcieta przez ogranicznik. Liniowa analiza
    malosygnalowa opisuje uklad BEZ ograniczen i dlatego jest tu porownana z
    postacia zamknieta, a nie z przebiegiem. Drugi mod tej samej turbiny —
    synchronizacji przeksztaltnika — jest czytany z przebiegu w tescie obok.
    """
    urzadzenie = turbina()
    uklad = zloz_uklad(urzadzenie, p_pu=0.2)
    oczekiwana_pulsacja = math.sqrt(
        0.2
        * urzadzenie.tor.pitch_tempo_rad_s
        / (
            (urzadzenie.tor.pitch_max_rad - urzadzenie.tor.pitch_min_rad)
            * 2.0
            * urzadzenie.tor.h_calkowite_s
        )
    )
    oczekiwana_czestotliwosc = oczekiwana_pulsacja / (2.0 * math.pi)
    mod = mod_najblizszy(mod_ukladu(uklad, nastawy()), oczekiwana_czestotliwosc)
    assert mod.czestotliwosc_hz == pytest.approx(oczekiwana_czestotliwosc, rel=0.05), (
        f"Mod z wartosci wlasnych {mod.czestotliwosc_hz} Hz wobec wyprowadzenia "
        f"analitycznego {oczekiwana_czestotliwosc} Hz"
    )


def test_turbina_mod_synchronizacji_zgodny_z_przebiegiem() -> None:
    """Mod petli synchronizacji turbiny: wartosci wlasne vs maksima kata PLL."""
    uklad = zloz_uklad(turbina(rdzen=rdzen_gfl(**PLL_WOLNY)), p_pu=0.2)
    wynik = bieg_ze_zwarciem(uklad, horyzont_s=2.0, czas_trwania_s=0.06, dt_s=0.001)
    sprawdz_zgodnosc_malosygnalowa(
        uklad, wynik, "pll_kat_rad@WT1", od_s=0.17, opis="turbina wiatrowa typ 4"
    )


def test_turbina_nie_wychodzi_poza_zakres_kata_lopat() -> None:
    """Kat lopat nie wychodzi poza `[beta_min, beta_max]` w ZADNYM kroku.

    Zakres fikstury jest WASKI (0-1 stopnia), wiec regulator dochodzi do obu
    koncow w ciagu kilku sekund — bez tego test nie sprawdzalby ogranicznika.
    """
    urzadzenie = turbina()
    uklad = zloz_uklad(urzadzenie, p_pu=0.2)
    wynik = bieg_ze_zwarciem(uklad, horyzont_s=6.0, czas_trwania_s=0.1, krok_wyjscia_s=0.01)
    kat = _szereg(wynik, "pitch_rad@WT1")
    assert (
        kat.min() >= urzadzenie.tor.pitch_min_rad - 1.0e-12
    ), f"Kat lopat spadl do {kat.min()} rad przy granicy {urzadzenie.tor.pitch_min_rad} rad"
    assert (
        kat.max() <= urzadzenie.tor.pitch_max_rad + 1.0e-12
    ), f"Kat lopat wzrosl do {kat.max()} rad przy granicy {urzadzenie.tor.pitch_max_rad} rad"
    assert kat.min() == pytest.approx(urzadzenie.tor.pitch_min_rad, abs=1.0e-9), (
        f"Kat lopat nie doszedl do dolnej granicy (min {kat.min()} rad) — test nie "
        "sprawdzil ogranicznika"
    )


def test_turbina_typ3_crowbar_ogranicza_moc_czynna_przy_przekroczeniu_pradu() -> None:
    """Crowbar zamyka okno mocy czynnej i OPOZNIA odbudowe mocy po zwarciu.

    POMIAR ROZNICOWY WOBEC TEJ SAMEJ TURBINY BEZ CROWBAR. Dawna wersja
    sprawdzala tylko, ze sygnal rosnie i ze moc czynna spada po jego pojawieniu
    sie — a moc czynna w zapadzie spada i tak, bo ogranicznik pradu z
    priorytetem biernej nie zostawia na nia miejsca. Iniekcja „pomin domkniecie
    okna przez crowbar" (`return self.okno_mocy` zamiast `z_domknieciem`)
    przechodzila przez tamten test NA ZIELONO. Tutaj porownujemy dwa biegi
    rozniace sie WYLACZNIE obecnoscia crowbar.

    GDZIE DOMKNIECIE OKNA JEST WIDOCZNE — i dlaczego wlasnie tam. W samym
    zapadzie okno nie jest wiazace: `|V|` spada, wiec KAZDE zadanie mocy daje
    ogromne zadanie pradu i o skladowej czynnej decyduje ogranicznik pradu, nie
    okno. Dopiero PO usunieciu zwarcia napiecie wraca, ogranicznik zwalnia, a
    crowbar jest jeszcze zalaczony (zanika ze stala `czas_trwania_s`) — i wtedy
    zamkniete okno przycina zadanie mocy czynnej. To jest zarazem fizyczna tresc
    zabezpieczenia: zwarty wirnik nie oddaje mocy czynnej dopoty, dopoki crowbar
    nie odpadnie. POMIAR: najwieksza roznica mocy czynnej miedzy biegami wynosi
    2,73e-02 pu i wypada tuz po usunieciu zwarcia.

    DWA WARUNKI IZOLACJI, te same co w dowodzie FRT i z tego samego powodu:
    statyzm Q/U i ogranicznik pradu maja WLASNE dowody, a tutaj musza byc
    nieaktywne, inaczej zadanie skladowej biernej samo wyczerpuje kolo pradu i
    skladowa czynna jest zerem niezaleznie od okna.
    """
    rdzen_izolowany = rdzen_gfl(**IZOLACJA_FRT)
    z_crowbar = turbina(
        typ="wiatr_typ_3",
        crowbar=crowbar_typowy(prog_pradu_pu=1.0),
        rdzen=rdzen_izolowany,
    )
    bez_crowbar = turbina(typ="wiatr_typ_3", crowbar=None, rdzen=rdzen_gfl(**IZOLACJA_FRT))
    crowbar = z_crowbar.crowbar
    assert crowbar is not None
    assert crowbar.prog_pradu_pu < crowbar.prad_pelnego_zadzialania_pu, (
        "Prog crowbar musi lezec ponizej ogranicznika pradu przeksztaltnika, inaczej "
        "zabezpieczenie nie moze zadzialac nigdy"
    )

    wynik = bieg_ze_zwarciem(zloz_uklad(z_crowbar, p_pu=0.2), horyzont_s=2.0, czas_trwania_s=0.15)
    wynik_bez = bieg_ze_zwarciem(
        zloz_uklad(bez_crowbar, p_pu=0.2), horyzont_s=2.0, czas_trwania_s=0.15
    )
    czas = np.asarray(wynik.os_czasu_s, dtype=float)
    sygnal = _szereg(wynik, "crowbar_pu@WT1")
    moc = _szereg(wynik, "p_pu@WT1")
    moc_bez = _szereg(wynik_bez, "p_pu@WT1")

    assert (
        sygnal.min() >= -1.0e-12 and sygnal.max() <= 1.0 + 1.0e-12
    ), f"Sygnal crowbar wyszedl poza [0, 1]: [{sygnal.min()}, {sygnal.max()}]"
    assert (
        sygnal.max() > 0.3
    ), f"Crowbar nie zadzialal (max {sygnal.max()}) — test nie sprawdzil zabezpieczenia"
    assert float(sygnal[-1]) < 0.1 * float(sygnal.max()), (
        f"Crowbar nie zanikl do konca przebiegu (koncowy {sygnal[-1]} wobec maksimum "
        f"{sygnal.max()}) — czas trwania nie dziala"
    )

    roznica = moc_bez - moc
    assert float(np.max(np.abs(roznica))) > 1.0e-2, (
        "Obecnosc crowbar nie zmienila mocy czynnej — domkniecie okna nie dochodzi "
        f"do zadania mocy (najwieksza roznica {float(np.max(np.abs(roznica)))} pu)"
    )
    po_zwarciu = czas > 0.255
    zalaczony = po_zwarciu & (sygnal > 0.1)
    assert int(zalaczony.sum()) >= 5, (
        "Za malo probek z crowbar jeszcze zalaczonym po usunieciu zwarcia — "
        "test nie trafil w okno, w ktorym domkniecie jest wiazace"
    )
    assert float(np.min(roznica[zalaczony])) >= -1.0e-9, (
        "Crowbar nigdzie nie moze PODNIESC mocy czynnej ponad turbine bez crowbar — "
        f"zmierzono {float(np.min(roznica[zalaczony]))} pu"
    )
    assert float(np.max(roznica[zalaczony])) > 1.0e-2, (
        "Po usunieciu zwarcia, dopoki crowbar jest zalaczony, moc czynna MUSI byc "
        f"wyraznie nizsza niz bez crowbar (zmierzono {float(np.max(roznica[zalaczony]))} pu)"
    )
    chwila = int(np.argmax(roznica))
    assert czas[chwila] > 0.25, (
        f"Najwieksza roznica wypadla w t = {czas[chwila]} s, czyli JESZCZE W ZAPADZIE — "
        "tam o skladowej czynnej decyduje ogranicznik pradu, nie okno mocy"
    )


def test_turbina_crowbar_o_progu_na_ograniczniku_pradu_jest_odmowa() -> None:
    """Prog crowbar na ograniczniku pradu albo powyzej = zabezpieczenie martwe.

    Sygnal zadzialania rosnie od progu do `i_max` przeksztaltnika, wiec prog
    rowny `i_max` daje zakres zerowy (dzielenie przez zero), a prog wyzszy —
    zabezpieczenie, ktore nie zadziala przy zadnym pradzie, jaki przeksztaltnik
    potrafi wydac. Jedno i drugie jest sprzecznoscia nastaw, nie sytuacja do
    cichego przyjecia.
    """
    rdzen = rdzen_gfl(**IZOLACJA_FRT)
    prog_na_ograniczniku = rdzen.i_max_pu * S_BAZOWA_MVA / 30.0
    for prog_urzadzenia, opis in (
        (prog_na_ograniczniku, "prog dokladnie na ograniczniku"),
        (prog_na_ograniczniku * 1.5, "prog powyzej ogranicznika"),
    ):
        with pytest.raises(OdmowaDynamiki) as odmowa:
            turbina(
                typ="wiatr_typ_3",
                crowbar=crowbar_typowy(prog_pradu_pu=prog_urzadzenia),
                rdzen=rdzen,
            )
        assert odmowa.value.kod == KOD_PARAMETRY_SPRZECZNE, opis


def test_crowbar_nie_zmienia_mocy_biernej_ani_mocy_przy_nasyconym_ograniczniku() -> None:
    """GRANICA ZAKRESU crowbar, przypieta pomiarem — obie polowy deklaracji.

    Docstring `Crowbar` mowi dwie rzeczy mocne i obie musza miec dowod, inaczej
    sa tylko obietnica:

    1. Zamkniecie okna mocy czynnej daje skutek na mocy oddawanej TYLKO wtedy,
       gdy ogranicznik pradu ma zapas. Na nastawach domyslnych (priorytet
       skladowej biernej, statyzm Q/U nasycony na `u_min`) cale kolo pradu
       zajmuje skladowa bierna, wiec skladowa czynna jest zerowa niezaleznie od
       crowbar. Dowod z zapasem w ograniczniku stoi w tescie powyzej (roznica
       2,7e-02 pu); TUTAJ dowodzimy strony przeciwnej — ze bez zapasu roznicy
       NIE MA, mimo ze sygnal crowbar dochodzi do jednosci.
    2. Crowbar NIE zmienia zachowania w mocy biernej. Fizyczne zwarcie wirnika
       przestawia maszyne w prace indukcyjna z poborem mocy biernej, ale
       kontrakt ENM nie niesie schematu zastepczego maszyny indukcyjnej, wiec
       ten skutek nie jest udawany. Test pilnuje, ze nie pojawi sie przypadkiem.

    Ten test jest UMYSLNIE testem braku skutku. Bez niego kazda przyszla zmiana
    mogla by po cichu rozszerzyc zakres dzialania crowbar poza to, co kontrakt
    parametryzuje — i nikt by tego nie zobaczyl.
    """
    z_crowbar = turbina(
        typ="wiatr_typ_3", crowbar=crowbar_typowy(prog_pradu_pu=1.0), rdzen=rdzen_gfl()
    )
    bez_crowbar = turbina(typ="wiatr_typ_3", crowbar=None, rdzen=rdzen_gfl())
    wynik = bieg_ze_zwarciem(
        zloz_uklad(z_crowbar, p_pu=0.2),
        horyzont_s=2.0,
        czas_trwania_s=0.15,
        x_zwarcia_ohm=X_ZWARCIA_GLEBOKIEGO_OHM,
    )
    wynik_bez = bieg_ze_zwarciem(
        zloz_uklad(bez_crowbar, p_pu=0.2),
        horyzont_s=2.0,
        czas_trwania_s=0.15,
        x_zwarcia_ohm=X_ZWARCIA_GLEBOKIEGO_OHM,
    )
    sygnal = _szereg(wynik, "crowbar_pu@WT1")
    assert float(sygnal.max()) > 0.9, (
        "Crowbar ma w tym scenariuszu zadzialac w pelni — inaczej test nie mowi nic o "
        f"granicy jego skutku (zmierzony maksimum sygnalu {float(sygnal.max())})"
    )
    for kanal, prog, opis in (
        ("p_pu@WT1", 1.0e-4, "moc czynna przy NASYCONYM ograniczniku pradu"),
        ("q_pu@WT1", 1.0e-12, "moc bierna (crowbar nie ma na nia zadnego wplywu)"),
    ):
        roznica = float(np.max(np.abs(_szereg(wynik, kanal) - _szereg(wynik_bez, kanal))))
        assert roznica < prog, (
            f"{opis}: crowbar zmienil kanal {kanal} o {roznica} pu przy progu {prog} pu. "
            "Albo zakres dzialania crowbar sie rozszerzyl poza to, co niesie kontrakt, "
            "albo ogranicznik pradu przestal sie nasycac i trzeba przeliczyc granice"
        )


def test_turbina_typ3_bez_crowbar_i_typ4_daja_ten_sam_przebieg() -> None:
    """Typ 3 bez crowbar i typ 4 roznia sie WYLACZNIE obecnoscia zabezpieczenia.

    To jest test klasy: gdyby typ turbiny wplywal na cokolwiek poza crowbar,
    modele rozjechalyby sie mimo identycznych parametrow — a kontrakt nie niesie
    zadnej innej roznicy miedzy typem 3 a 4.
    """
    wyniki = []
    for typ in ("wiatr_typ_3", "wiatr_typ_4"):
        uklad = zloz_uklad(turbina(typ=typ, crowbar=None), p_pu=0.2)
        wyniki.append(bieg_ze_zwarciem(uklad, horyzont_s=1.0, czas_trwania_s=0.08))
    pierwszy, drugi = wyniki
    assert pierwszy.probki.keys() == drugi.probki.keys()
    for klucz in pierwszy.probki:
        assert pierwszy.probki[klucz] == pytest.approx(
            drugi.probki[klucz], abs=1.0e-12
        ), f"Kanal {klucz} rozni sie miedzy typem 3 bez crowbar a typem 4"


# ---------------------------------------------------------------------------
# Determinizm — wspolny dla calej biblioteki
# ---------------------------------------------------------------------------


def test_biegi_sa_powtarzalne_dla_kazdej_rodziny() -> None:
    """Ten sam uklad przepuszczony DWA RAZY daje identyczne probki i tozsamosc."""
    przypadki: list[tuple[str, Urzadzenie, float]] = [
        ("maszyna", maszyna(z_wzbudzeniem=True, z_turbina=True, z_stabilizatorem=True), 0.8),
        ("gfl", przeksztaltnik_gfl(), 0.25),
        ("gfm", przeksztaltnik_gfm(tryb="vsm"), 0.3),
        ("magazyn", magazyn(), 0.2),
        ("turbina", turbina(typ="wiatr_typ_3", crowbar=crowbar_typowy()), 0.2),
    ]
    for opis, urzadzenie, p_pu in przypadki:
        pierwszy = bieg_ze_zwarciem(zloz_uklad(urzadzenie, p_pu=p_pu), horyzont_s=1.0)
        drugi = bieg_ze_zwarciem(zloz_uklad(urzadzenie, p_pu=p_pu), horyzont_s=1.0)
        assert pierwszy.tozsamosc == drugi.tozsamosc, f"{opis}: tozsamosc biegu niestabilna"
        for klucz, szereg in pierwszy.probki.items():
            assert szereg == drugi.probki[klucz], f"{opis}: kanal {klucz} niepowtarzalny"


def test_rdzen_gfl_jest_wspolny_dla_trzech_konsumentow() -> None:
    """Przeksztaltnik samodzielny, magazyn i turbina licza TEN SAM prad z tego rdzenia.

    To jest test KLASY, nie instancji: trzy rodziny kontraktu ENM skladaja sie z
    tego samego bloku przeksztaltnika, wiec rozjazd ktorejkolwiek kopii regulacji
    bylby niewidoczny w testach pojedynczych rodzin.
    """
    rdzen = rdzen_gfl()
    napiecie = complex(0.97, 0.05)
    moc = complex(0.2, 0.03)
    samodzielny = przeksztaltnik_gfl(ident="PV1")
    z_magazynem = magazyn(ident="BESS1", rdzen=rdzen)
    z_turbina = turbina(ident="WT1", rdzen=rdzen, typ="wiatr_typ_4")

    stan_samodzielny = samodzielny.stan_poczatkowy(napiecie, moc)
    prad_samodzielny = samodzielny.prad_pu(stan_samodzielny, napiecie)
    for opis, urzadzenie in (("magazyn", z_magazynem), ("turbina", z_turbina)):
        stan = urzadzenie.stan_poczatkowy(napiecie, moc)
        assert urzadzenie.prad_pu(stan, napiecie) == pytest.approx(
            prad_samodzielny
        ), f"{opis}: prad z tego samego rdzenia GFL rozni sie od samodzielnego"
