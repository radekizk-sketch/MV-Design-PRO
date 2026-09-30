"""Calkowanie: rzad metody, zgodnosc trapezu z RK4, kontrola kroku, residua."""

from __future__ import annotations

import numpy as np
import pytest
from network_model.solvers.dynamika import (
    HarmonogramDynamiki,
    OdmowaDynamiki,
    SilnikDynamiki,
    ZwarcieWezla,
    zloz_model_sieci,
)
from network_model.solvers.dynamika.calkowanie import (
    INTEGRATORY,
    KontekstKroku,
    RungeKutta4Jawny,
    TrapezNiejawny,
    blad_lokalny,
    maska_nasycenia,
    rozpakuj_stany,
    rzutuj_stany,
    spakuj_stany,
)
from network_model.solvers.dynamika.kontrakty import KOD_KROK_NIEZBIEZNY
from network_model.solvers.dynamika.siec import rozwiaz_algebre

from tests.network_model.dynamika.uklady import (
    X_ZWARCIA_PLYTKIEGO_OHM,
    nastawy,
    zbuduj_smib,
)

#: Zwarcie plytkie, zdejmowane — wymuszenie gladkie POZA chwilami zdarzen, wiec
#: nadaje sie do pomiaru rzedu metody (rzad mierzy sie na odcinku gladkim).
HARMONOGRAM = HarmonogramDynamiki(
    (
        ZwarcieWezla(
            t_s=0.04,
            wezel="GEN",
            typ="3F",
            r_f_ohm=0.0,
            x_f_ohm=X_ZWARCIA_PLYTKIEGO_OHM,
            t_usuniecia_s=0.12,
            sposob_usuniecia="samoczynne",
        ),
    )
)


def _kontekst(uklad):
    model = zloz_model_sieci(uklad.wezly, uklad.galezie, ())
    urzadzenia = (uklad.maszyna, uklad.szyna)
    stany = tuple(
        urzadzenie.stan_poczatkowy(
            uklad.punkt_pracy.napiecia_pu[urzadzenie.wezel],
            uklad.punkt_pracy.moce_zrodel_pu[urzadzenie.ident],
        )
        for urzadzenie in urzadzenia
    )
    napiecia = np.array(
        [uklad.punkt_pracy.napiecia_pu[ident] for ident in model.identy_wezlow], dtype=complex
    )
    return KontekstKroku(model, (), urzadzenia, nastawy()), stany, napiecia


def test_rejestr_integratorow_jest_zamkniety_i_zgodny_z_nazwami() -> None:
    assert set(INTEGRATORY) == {"trapez_niejawny", "rk4_jawny"}
    for nazwa, integrator in INTEGRATORY.items():
        assert integrator.nazwa == nazwa
    assert INTEGRATORY["trapez_niejawny"].rzad == 2
    assert INTEGRATORY["rk4_jawny"].rzad == 4


def test_pakowanie_i_rozpakowanie_stanow_jest_odwracalne() -> None:
    stany = (np.array([1.0, 2.0, 3.0, 4.0]), np.array([5.0, 6.0]))
    spakowane = spakuj_stany(stany)
    assert spakowane.shape == (6,)
    rozpakowane = rozpakuj_stany(spakowane, (4, 2))
    assert all(np.array_equal(a, b) for a, b in zip(stany, rozpakowane, strict=True))


def test_rozpakowanie_niezgodnego_wektora_jest_bledem_programisty() -> None:
    with pytest.raises(AssertionError, match="sumy wymiarow"):
        rozpakuj_stany(np.zeros(5), (4, 2))


def test_krok_w_rownowadze_nie_rusza_stanu() -> None:
    """Punkt rownowagi jest punktem STALYM kroku — dla obu integratorow."""
    uklad = zbuduj_smib()
    kontekst, stany, napiecia = _kontekst(uklad)
    for integrator in (TrapezNiejawny(), RungeKutta4Jawny()):
        wynik = integrator.krok(kontekst, stany, napiecia, 0.0, 0.001)
        assert np.max(np.abs(spakuj_stany(wynik.stany) - spakuj_stany(stany))) < 1e-12
        assert np.max(np.abs(wynik.napiecia - napiecia)) < 1e-12


def test_drabina_kroku_potwierdza_rzad_2_trapezu() -> None:
    """Zageszczenie kroku o polowe MUSI zmniejszyc blad czterokrotnie (rzad 2).

    Wartosc odniesienia liczona krokiem 16-krotnie mniejszym od najgestszego z
    drabiny. Krok wyjscia jest WIELOKROTNOSCIA kazdego kroku drabiny, zeby zaden
    krok nie byl skracany do siatki probek (skrocenie mieszaloby rzedy).
    """
    uklad = zbuduj_smib()
    krok_wyjscia = 0.02
    odniesienie = SilnikDynamiki(
        uklad.wejscie(
            HARMONOGRAM,
            nastawy(dt_s=0.00015625, horyzont_s=0.6, krok_wyjscia_s=krok_wyjscia),
        )
    ).uruchom()
    wzorzec = np.array(odniesienie.probki["delta_rad@G1"])

    bledy: list[float] = []
    for dt in (0.005, 0.0025, 0.00125):
        wynik = SilnikDynamiki(
            uklad.wejscie(
                HARMONOGRAM, nastawy(dt_s=dt, horyzont_s=0.6, krok_wyjscia_s=krok_wyjscia)
            )
        ).uruchom()
        bledy.append(float(np.max(np.abs(np.array(wynik.probki["delta_rad@G1"]) - wzorzec))))

    assert bledy[0] > bledy[1] > bledy[2] > 0.0
    for wiekszy, mniejszy in zip(bledy, bledy[1:], strict=False):
        assert 3.6 <= wiekszy / mniejszy <= 4.4, f"iloraz {wiekszy / mniejszy} poza rzedem 2"


def test_trapez_i_rk4_zgadzaja_sie_na_odcinku_gladkim() -> None:
    """Dwie ROZNE metody (niejawna sprzezona i jawna rozdzielona) daja ten sam przebieg.

    To sprawdzian implementacji pochodnych, a nie samej metody: gdyby blok
    pochodnych byl bledny, obie metody bladzilyby tak samo tylko wtedy, gdyby
    dzielily kod calkowania — a nie dziela.
    """
    uklad = zbuduj_smib()
    trapez = SilnikDynamiki(
        uklad.wejscie(HARMONOGRAM, nastawy(dt_s=0.0005, horyzont_s=0.5, krok_wyjscia_s=0.01))
    ).uruchom()
    rk4 = SilnikDynamiki(
        uklad.wejscie(
            HARMONOGRAM,
            nastawy(dt_s=0.0005, horyzont_s=0.5, krok_wyjscia_s=0.01, integrator="rk4_jawny"),
        )
    ).uruchom()
    roznica = np.max(
        np.abs(np.array(trapez.probki["delta_rad@G1"]) - np.array(rk4.probki["delta_rad@G1"]))
    )
    assert roznica < 1e-6
    assert trapez.wlasnosci.integrator == "trapez_niejawny"
    assert rk4.wlasnosci.integrator == "rk4_jawny"


def test_residuum_kroku_jest_rozdzielone_na_czesc_rozniczkowa_i_algebraiczna() -> None:
    uklad = zbuduj_smib()
    kontekst, stany, napiecia = _kontekst(uklad)
    wynik = TrapezNiejawny().krok(kontekst, stany, napiecia, 0.0, 0.001)
    assert wynik.residuum_stanow <= kontekst.nastawy.tolerancja
    assert wynik.residuum_algebry <= kontekst.nastawy.tolerancja
    assert wynik.residuum >= max(wynik.residuum_stanow, wynik.residuum_algebry) * 0.5


def test_rk4_ma_zerowe_residuum_rownania_stanu() -> None:
    """Metoda JAWNA nie rozwiazuje rownania stanu — zero jest pomiarem, nie zaslepka."""
    uklad = zbuduj_smib()
    kontekst, stany, napiecia = _kontekst(uklad)
    wynik = RungeKutta4Jawny().krok(kontekst, stany, napiecia, 0.0, 0.001)
    assert wynik.residuum_stanow == 0.0


def test_blad_lokalny_maleje_z_krokiem_zgodnie_z_rzedem() -> None:
    """Oszacowanie bledu przez podwojenie kroku skaluje sie jak `dt^(p+1)`.

    PUNKT STARTOWY MUSI BYC SPOJNY (`g(x0, y0) = 0`). Pomiar na punkcie
    NIESPOJNYM (stan zaburzony przy napieciach rownowagi) daje iloraz 2,000
    zamiast 8 — bo trapez rusza wtedy od `f(x0, y0)` liczonego przy napieciu,
    ktore do tego stanu nie nalezy, i traci rzad. To nie jest wada metody, tylko
    warunek jej stosowania; dlatego stan zaburzony jest tu najpierw uzgadniany z
    siecia.
    """
    uklad = zbuduj_smib()
    kontekst, stany, napiecia = _kontekst(uklad)
    integrator = TrapezNiejawny()
    stany_zaburzone = (stany[0] + np.array([0.25, 0.002, 0.0, 0.0]), stany[1])
    napiecia_spojne = rozwiaz_algebre(
        kontekst.model,
        kontekst.odbiory,
        kontekst.urzadzenia,
        stany_zaburzone,
        napiecia,
        tolerancja=kontekst.nastawy.tolerancja,
        max_iteracji=kontekst.nastawy.max_iteracji_newtona,
        max_nawrotow=kontekst.nastawy.max_nawrotow,
        t_s=0.0,
    ).napiecia

    # Granice ilorazu Z POMIARU (2026-09-17): dla dt = 0,005 / 0,0025 / 0,00125 /
    # 0,000625 zmierzono 7,428 / 7,725 / 7,865 — wartosc dazy do 8 od dolu, bo
    # skladniki wyzszych rzedow jeszcze nie znikly. Na kroku 0,02 iloraz wynosi
    # 5,07, czyli POZA zakresem asymptotycznym; dlatego drabina zaczyna sie od
    # 0,005, a nie „od okragłej wartosci".
    bledy = []
    for dt in (0.005, 0.0025, 0.00125, 0.000625):
        wynik = integrator.krok(kontekst, stany_zaburzone, napiecia_spojne, 0.0, dt)
        bledy.append(
            blad_lokalny(integrator, kontekst, stany_zaburzone, napiecia_spojne, 0.0, dt, wynik)
        )
    assert bledy[0] > bledy[1] > bledy[2] > bledy[3] > 0.0
    for wiekszy, mniejszy in zip(bledy, bledy[1:], strict=False):
        assert 7.2 <= wiekszy / mniejszy <= 8.3, f"iloraz {wiekszy / mniejszy} poza rzedem 3"


def test_krok_z_punktu_NIESPOJNEGO_traci_rzad() -> None:
    """Warunek spojnosci nie jest kosmetyka — pomiar pokazuje utrate rzedu.

    Ten sam stan zaburzony przy napieciach rownowagi (czyli `g(x0, y0) != 0`)
    daje oszacowanie bledu malejace liniowo z krokiem (iloraz ~2), a nie jak
    `dt^3` (iloraz ~8). Test przypina te roznice, zeby nikt nie uznal pierwszego
    pomiaru za „blad metody" i nie zaczal stroic tolerancji.
    """
    uklad = zbuduj_smib()
    kontekst, stany, napiecia = _kontekst(uklad)
    integrator = TrapezNiejawny()
    stany_zaburzone = (stany[0] + np.array([0.25, 0.002, 0.0, 0.0]), stany[1])
    bledy = []
    for dt in (0.005, 0.0025, 0.00125):
        wynik = integrator.krok(kontekst, stany_zaburzone, napiecia, 0.0, dt)
        bledy.append(blad_lokalny(integrator, kontekst, stany_zaburzone, napiecia, 0.0, dt, wynik))
    for wiekszy, mniejszy in zip(bledy, bledy[1:], strict=False):
        assert 1.8 <= wiekszy / mniejszy <= 2.2


def test_krok_adaptacyjny_liczy_odrzucenia_i_zmienia_dlugosc() -> None:
    """Krok odrzucony jest LICZONY, nie przemilczany (SS0 p.4)."""
    uklad = zbuduj_smib()
    wynik = SilnikDynamiki(
        uklad.wejscie(
            HARMONOGRAM,
            nastawy(
                dt_s=0.01,
                dt_min_s=0.0002,
                dt_max_s=0.01,
                horyzont_s=0.5,
                krok_wyjscia_s=0.05,
                tolerancja_kroku=1.0e-9,
            ),
        )
    ).uruchom()
    assert wynik.wlasnosci.kroki_odrzucone > 0
    odrzucone = [
        wpis
        for wpis in wynik.slad_white_box["kroki_szczegolne"]
        if wpis["powod"] == "krok_odrzucony"
    ]
    assert len(odrzucone) == wynik.wlasnosci.kroki_odrzucone
    assert all(wpis["blad_lokalny"] > wpis["tolerancja_kroku"] for wpis in odrzucone)


def test_krok_adaptacyjny_przy_luznej_tolerancji_nie_odrzuca_nic() -> None:
    """Predykat pary: ta sama sciezka przy luznej tolerancji ma ZERO odrzucen."""
    uklad = zbuduj_smib()
    wynik = SilnikDynamiki(
        uklad.wejscie(
            HARMONOGRAM,
            nastawy(
                dt_s=0.002,
                dt_min_s=0.0005,
                dt_max_s=0.005,
                horyzont_s=0.5,
                krok_wyjscia_s=0.05,
                tolerancja_kroku=1.0e-3,
            ),
        )
    ).uruchom()
    assert wynik.wlasnosci.kroki_odrzucone == 0


def test_nieosiagalna_tolerancja_kroku_konczy_sie_odmowa() -> None:
    """Gdy nawet `dt_min` nie wystarcza, rdzen ODMAWIA — nie liczy „jak wyjdzie"."""
    uklad = zbuduj_smib()
    with pytest.raises(OdmowaDynamiki) as blad:
        SilnikDynamiki(
            uklad.wejscie(
                HARMONOGRAM,
                nastawy(
                    dt_s=0.01,
                    dt_min_s=0.009,
                    dt_max_s=0.01,
                    horyzont_s=0.5,
                    krok_wyjscia_s=0.05,
                    tolerancja_kroku=1.0e-14,
                ),
            )
        ).uruchom()
    assert blad.value.kod == KOD_KROK_NIEZBIEZNY
    assert "blad_lokalny" in blad.value.szczegoly


def test_maska_nasycenia_jest_warunkiem_dwuczlonowym() -> None:
    """Zbior aktywny wymaga POLOZENIA na granicy ORAZ znaku residuum swobodnego.

    To jest dowod przypiety do mocnego zdania z docstringu `maska_nasycenia`
    („warunek jest dwuczlonowy, i to jest istota rzeczy"). Bez niego deklaracja
    zyje bez pokrycia: iniekcja sprowadzajaca zbior aktywny do pustego
    przechodzila przez CALA regresje dynamiki (323 testy) na zielono, bo
    rzutowanie stanow w `rozloz` samo dotrzymuje granic — roznica na przebiegu
    siega 1,59e-09, czyli tyle, co tolerancja Newtona. Zbior aktywny odpowiada
    NIE za dotrzymanie granicy, tylko za to, ze rozwiazanie kroku LEZY w
    granicach zamiast byc przycietym po fakcie: wiersz stanu aktywnego niesie
    rownanie `x = granica`, a jego wiersz jakobianu jest tozsamoscia, wiec jest
    bezwarunkowo dobrze uwarunkowany. Sprawdzamy wiec sam predykat, i to na
    ILOCZYNIE CECH, a nie na jednym przykladzie.

    Iloczyn cech: {ponizej, dokladnie na, powyzej granicy} x {residuum swobodne
    ujemne, zerowe, dodatnie} x {granica dolna, gorna}.
    """
    dolne = np.zeros(6)
    gorne = np.ones(6)

    stany_gorne = np.array([1.0, 1.0, 1.0, 0.999, 1.001, 0.5])
    reszta_gorna = np.array([-1.0e-3, 0.0, +1.0e-3, -1.0e-3, -1.0e-3, -1.0e-3])
    assert maska_nasycenia(stany_gorne, dolne, gorne, reszta_gorna).tolist() == [
        True,
        True,
        False,
        False,
        True,
        False,
    ], (
        "Gorna granica: aktywna przy x >= gora ORAZ reszcie <= 0. Sam warunek polozenia "
        "dawalby cykl — Newton sprowadza stan na granice, warunek znika, wiersz wraca do "
        "postaci rozniczkowej z niezerowym residuum i wypycha stan z powrotem"
    )

    stany_dolne = np.array([0.0, 0.0, 0.0, 0.001, -0.001, 0.5])
    reszta_dolna = np.array([+1.0e-3, 0.0, -1.0e-3, +1.0e-3, +1.0e-3, +1.0e-3])
    assert maska_nasycenia(stany_dolne, dolne, gorne, reszta_dolna).tolist() == [
        True,
        True,
        False,
        False,
        True,
        False,
    ], "Dolna granica: aktywna przy x <= dol ORAZ reszcie >= 0"

    na_gornej = np.array([1.0])
    jedna_dolna = np.array([0.0])
    jedna_gorna = np.array([1.0])
    assert maska_nasycenia(na_gornej, jedna_dolna, jedna_gorna, np.array([-1.0])).tolist() == [
        True
    ], "Regulator trzymany na limicie ma zostac w zbiorze aktywnym"
    assert maska_nasycenia(na_gornej, jedna_dolna, jedna_gorna, np.array([+1.0])).tolist() == [
        False
    ], "Regulator schodzacy z limitu MUSI wyjsc ze zbioru aktywnego, i to natychmiast"


def test_rzutowanie_stanow_dotrzymuje_obu_granic() -> None:
    """`rzutuj_stany` sprowadza KAZDY stan do swojego zakresu — obie strony."""
    stany = np.array([-5.0, 0.5, 5.0, 0.0, 1.0])
    dolne = np.zeros(5)
    gorne = np.ones(5)
    assert rzutuj_stany(stany, dolne, gorne).tolist() == [0.0, 0.5, 1.0, 0.0, 1.0]


@pytest.mark.parametrize("integrator", [TrapezNiejawny(), RungeKutta4Jawny()])
def test_krok_nie_pamieta_niczego_sprzed_swojego_wejscia(integrator) -> None:
    """Krok jest funkcja `(x, y, t, dt)` — CALA historia jest w argumentach.

    Dlaczego to ma wlasny test, skoro „to widac w kodzie". Semantyka zdarzen w tym
    rdzeniu brzmi: ZDARZENIE -> TOPOLOGIA -> RE-INICJALIZACJA ALGEBRY -> DALEJ. Jest
    ona poprawna TYLKO wtedy, gdy krok po nieciaglosci nie niesie ani jednej wartosci
    sprzed niej. Metoda WIELOKROKOWA (Adams, BDF) niesie — jej wzor czyta `f` z
    poprzednich krokow — i wtedy pierwsze kroki po zdarzeniu calkuja czesciowo model
    sprzed zdarzenia. Rejestr `INTEGRATORY` ma dzis dwie metody JEDNOKROKOWE i to
    jest wlasnosc, na ktorej stoi semantyka zdarzen, a nie szczegol implementacji.

    Test wykonuje ten sam krok DWA RAZY, rozdzielajac je krokiem z zupelnie innego
    stanu i z innym `dt`. Gdyby integrator trzymal cokolwiek miedzy wywolaniami,
    drugi wynik roznilby sie od pierwszego.
    """
    kontekst, stany, napiecia = _kontekst(zbuduj_smib())

    pierwszy = integrator.krok(kontekst, stany, napiecia, 0.0, 0.002)

    zaburzone = tuple(stan + 0.37 for stan in stany)
    integrator.krok(kontekst, zaburzone, napiecia * 0.9, 1.234, 0.0005)

    drugi = integrator.krok(kontekst, stany, napiecia, 0.0, 0.002)
    for przed, po in zip(pierwszy.stany, drugi.stany, strict=True):
        assert np.array_equal(przed, po), "Krok zapamietal cos miedzy wywolaniami"
    assert np.array_equal(pierwszy.napiecia, drugi.napiecia)


def test_rejestr_integratorow_zawiera_wylacznie_metody_jednokrokowe() -> None:
    """Deklaracja „metody jednokrokowe" ma przypiety test (regula KLASA par. 4).

    Dopisanie metody wielokrokowej do rejestru wywala ten test i zmusza do
    rozstrzygniecia, co taka metoda robi z semantyka zdarzen — zamiast cicho ja
    zlamac. Nazwy sa czescia kontraktu wyniku (`WlasnosciBiegu.integrator`).
    """
    assert set(INTEGRATORY) == {"trapez_niejawny", "rk4_jawny"}
