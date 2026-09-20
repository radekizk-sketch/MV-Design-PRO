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
import json
import math

import numpy as np
from network_model.solvers.dynamika import OdmowaDynamiki, ZwarcieWezla

from . import stanowisko
from .wyrocznia import UkladSMIB

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
        ),
    )


# --------------------------------------------------------------------------- bramki
def g1_dryf_stanu_ustalonego() -> dict[str, float]:
    """Bieg bez zaklocenia: punkt pracy jest rownowaga, wiec kat stoi."""
    wynik = stanowisko.uruchom(
        stanowisko.zbuduj(), (), horyzont_s=2.0, dt_s=1e-3, krok_wyjscia_s=1e-2
    )
    delta = stanowisko.szereg(wynik, "delta_rad@G1")
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
        t = stanowisko.czas(wynik)
        delta = stanowisko.szereg(wynik, "delta_rad@G1")
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
    """ROCOF z rownania ruchu produktu wobec algebry wyroczni w tej samej chwili."""
    wynik = stanowisko.uruchom(
        stanowisko.zbuduj(),
        _zwarcie(0.5, 0.05, None),
        horyzont_s=0.55,
        dt_s=2.5e-4,
        krok_wyjscia_s=2.5e-4,
    )
    t = stanowisko.czas(wynik)
    i0 = int(np.searchsorted(t, 0.5, side="left"))
    p_m = stanowisko.szereg(wynik, "p_mechaniczna_pu@G1")
    p_e = stanowisko.szereg(wynik, "p_pu@G1")
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
    t = stanowisko.czas(wynik)
    delta = stanowisko.szereg(wynik, "delta_rad@G1")
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
    t = stanowisko.czas(wynik)
    delta = stanowisko.szereg(wynik, "delta_rad@G1")
    omega = stanowisko.szereg(wynik, "omega_pu@G1")
    f_hz = stanowisko.szereg(wynik, "f_hz@GEN")
    uklad = UkladSMIB()
    pp = uklad.punkt_pracy()
    sem, e_sys = float(pp["sem_modul"]), complex(pp["e_sys"])
    omega_b = 2.0 * math.pi * 50.0
    y_f = 1.0 / complex(0.0, 0.5)
    najgorszy = 0.0
    for i in range(len(t)):
        czynne = (t[i] >= 0.3) and (t[i] < 0.45)
        macierz = uklad.macierz(y_f if czynne else 0j)
        e_m = sem * cmath.exp(1j * float(delta[i]))
        napiecia = np.linalg.solve(
            macierz, np.array([e_m * uklad.y_maszyny, e_sys * uklad.y_systemu])
        )
        pochodna = np.linalg.solve(macierz, np.array([1j * e_m * uklad.y_maszyny, 0.0 + 0.0j]))
        v_kropka = pochodna * (omega_b * (float(omega[i]) - 1.0))
        theta_kropka = (v_kropka[0] * napiecia[0].conjugate()).imag / (abs(napiecia[0]) ** 2)
        najgorszy = max(najgorszy, abs(50.0 + theta_kropka / (2.0 * math.pi) - float(f_hz[i])))
    return {"G7_blad_czestotliwosci_wezlowej_hz": float(najgorszy)}


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
        napiecia = stanowisko.szereg(wynik, "u_pu@GEN")
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
        delta = stanowisko.szereg(wynik, "delta_rad@G1")
        omega = stanowisko.szereg(wynik, "omega_pu@G1")
        czas = stanowisko.czas(wynik)
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
        czas = stanowisko.czas(wynik)
        delta = stanowisko.szereg(wynik, "delta_rad@G1")
        omega = stanowisko.szereg(wynik, "omega_pu@G1")
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
