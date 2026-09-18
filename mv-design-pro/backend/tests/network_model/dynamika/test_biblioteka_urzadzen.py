"""Biblioteka urzadzen W6-3A: jakobiany, rownowaga i zmiana bazy — ILOCZYN CECH.

DLACZEGO TO JEST NAJWAZNIEJSZY TEST TEJ WARSTWY. Rownania kazdego urzadzenia sa
pisane RAZ, na liczbach dualnych (`urzadzenia/pochodne_kierunkowe.py`), wiec
funkcja i jej jakobian nie moga sie rozejsc. Ale to znaczy tylko tyle, ze OBIE sa
takie same — nie, ze sa POPRAWNE. Roznica skonczona jest jedyna niezalezna miara:
liczy pochodna z samej funkcji, bez ani jednej linii wspolnej z rozniczkowaniem
w przod. Jesli regula lancuchowa jest zle zaimplementowana albo rownanie czyta
zly stan, ten test to zobaczy.

ILOCZYN CECH (CLAUDE.md, KLASA NIE INSTANCJA p. 2) — nie „po jednym przykladzie
na rodzine", tylko iloczyn:

* maszyna synchroniczna x {bez regulacji, AVR, AVR+GOV, AVR+GOV+PSS,
  AVR bez czlonu wyprzedzajacego, GOV bez zaworu i bez wyprzedzenia};
* GFL x {priorytet bierny, priorytet czynny} x {z opoznieniem odbudowy, bez};
* GFM x {statyzm, maszyna wirtualna} x {impedancja wirtualna, nasycenie zadania};
* magazyn x {GFL, GFM} x {rozladowanie, ladowanie};
* turbina x {typ 3 z crowbar zwloczny, typ 3 z crowbar natychmiastowy, typ 4}
  x {crowbar spoczywajacy, crowbar zadzialany};

a kazda konfiguracja x {punkt pracy, stan zaburzony} x {napiecie znamionowe,
gleboki zapad} — czyli takze obszary, w ktorych dzialaja OGRANICZNIKI (prad
przeksztaltnika, wsparcie FRT, ogranicznik tempa odbudowy).

PUNKTY PRZELACZENIA SA POMIJANE SWIADOMIE. Ogranicznik, martwa strefa i `min`/
`max` sa funkcjami kawalkami gladkimi — w punkcie przelaczenia pochodna NIE
ISTNIEJE (jednostronne sa rozne). Stany testowe sa dobrane tak, zeby lezec
WEWNATRZ galezi; sprawdzenie „na krawedzi" mierzyloby roznice pochodnych
jednostronnych, a nie blad implementacji.
"""

from __future__ import annotations

import cmath

import numpy as np
import pytest
from network_model.solvers.dynamika.kontrakty import Urzadzenie
from network_model.solvers.dynamika.urzadzenia import (
    UrzadzenieOdlaczone,
    zbuduj_maszyne_synchroniczna,
    zbuduj_rdzen_gfl,
)

from tests.network_model.dynamika.biblioteka_urzadzen import (
    F_BAZOWA_HZ,
    PARAMETRY_MASZYNY,
    S_BAZOWA_MVA,
    crowbar_typowy,
    magazyn,
    maszyna,
    przeksztaltnik_gfl,
    przeksztaltnik_gfm,
    rdzen_gfl,
    rdzen_gfm,
    turbina,
    zloz_uklad,
)

#: Krok roznicy centralnej — kompromis miedzy bledem obciecia (~h^2) a bledem
#: zaokraglenia (~eps/h); dla wielkosci rzedu jednosci optimum lezy okolo
#: pierwiastka szescinnego z epsilona maszynowego.
KROK_ROZNICY = 1.0e-6
#: Tolerancja BEZWZGLEDNA porownania Z POMIARU: najwiekszy zmierzony blad roznicy
#: centralnej na wyrazach rzedu jednosci to 6,0e-07, wiec 1e-5 daje rzad zapasu.
TOLERANCJA_JAKOBIANU = 1.0e-5
#: Tolerancja WZGLEDNA — bez niej test bylby niewykonalny na wyrazach o duzym
#: module. POMIAR: w otoczeniu ogranicznika pradu przeksztaltnika wyraz
#: `d(i_czynny)/d(u_odniesienia)` ma wartosc -5356,755 i pochodzi z pierwiastka
#: `sqrt(i_max^2 - i_bierny^2)` blisko jego krawedzi, gdzie trzecia pochodna jest
#: ogromna. Blad roznicy centralnej skaluje sie tam DOKLADNIE jak h^2 (zmierzone:
#: h=1e-4 -> 8,4e+01; 1e-5 -> 8,0e-01; 1e-6 -> 8,0e-03; 1e-7 -> 8,3e-05), czyli
#: jest bledem OBCIECIA WZORU ROZNICOWEGO, nie bledem jakobianu. Najwiekszy
#: zmierzony blad wzgledny to 1,5e-06; prog 1e-5 daje siedmiokrotny zapas, a
#: przestawiony znak daje blad wzgledny 2,0 — piec rzedow wielkosci wyzej.
TOLERANCJA_WZGLEDNA_JAKOBIANU = 1.0e-5
#: Tolerancja rownowagi Z POMIARU: najwieksze zmierzone residuum stanow w punkcie
#: pracy to 2,7e-14 (maszyna z pelna regulacja), wiec 1e-10 daje cztery rzedy
#: zapasu wobec bledu zaokraglenia i nadal lapie pominiety skladnik.
TOLERANCJA_ROWNOWAGI = 1.0e-10


def _konfiguracje_maszyny() -> list[tuple[str, Urzadzenie, float]]:
    return [
        ("maszyna/bez regulacji", maszyna(), 0.8),
        ("maszyna/AVR", maszyna(z_wzbudzeniem=True), 0.8),
        ("maszyna/AVR bez wyprzedzenia", maszyna(z_wzbudzeniem=True, tb_s=0.0, tc_s=0.0), 0.8),
        ("maszyna/AVR+GOV", maszyna(z_wzbudzeniem=True, z_turbina=True), 0.8),
        (
            "maszyna/AVR+GOV bez zaworu i wyprzedzenia",
            maszyna(
                z_wzbudzeniem=True,
                z_turbina=True,
                t1_turbiny_s=0.0,
                t2_turbiny_s=0.0,
                t3_turbiny_s=0.0,
            ),
            0.8,
        ),
        (
            "maszyna/AVR+GOV+PSS",
            maszyna(z_wzbudzeniem=True, z_turbina=True, z_stabilizatorem=True),
            0.8,
        ),
        (
            "maszyna/AVR+PSS bez czlonow wyprzedzajacych PSS",
            maszyna(
                z_wzbudzeniem=True,
                z_stabilizatorem=True,
                t1_pss_s=0.0,
                t2_pss_s=0.0,
                t3_pss_s=0.0,
                t4_pss_s=0.0,
            ),
            0.8,
        ),
    ]


def _konfiguracje_przeksztaltnikow() -> list[tuple[str, Urzadzenie, float]]:
    przypadki: list[tuple[str, Urzadzenie, float]] = []
    for priorytet in ("bierna", "czynna"):
        for opoznienie in (0.05, 0.0):
            przypadki.append(
                (
                    f"GFL/priorytet={priorytet}/opoznienie={opoznienie}",
                    przeksztaltnik_gfl(
                        priorytet_ogranicznika=priorytet,
                        p_odbudowa_opoznienie_s=opoznienie,
                    ),
                    0.25,
                )
            )
    for tryb in ("droop", "vsm"):
        for strategia in ("impedancja_wirtualna", "nasycenie_zadania"):
            przypadki.append(
                (
                    f"GFM/{tryb}/{strategia}",
                    przeksztaltnik_gfm(tryb=tryb, strategia_ograniczenia=strategia),
                    0.3,
                )
            )
    return przypadki


def _konfiguracje_magazynu() -> list[tuple[str, Urzadzenie, float]]:
    return [
        ("magazyn/GFL/rozladowanie", magazyn(), 0.2),
        ("magazyn/GFL/ladowanie", magazyn(), -0.2),
        ("magazyn/GFM-droop/rozladowanie", magazyn(rdzen=rdzen_gfm()), 0.2),
        (
            "magazyn/GFM-vsm/ladowanie",
            magazyn(rdzen=rdzen_gfm(tryb="vsm")),
            -0.2,
        ),
        # Rezerwa 0,2 pu bazy przeksztaltnika (30 MVA) zweza okno o 0,06 pu bazy
        # ukladu z obu stron, wiec punkt pracy musi byc ODPOWIEDNIO mniejszy —
        # inaczej fabryka slusznie odmawia (`punkt_pracy_poza_ograniczeniem`).
        ("magazyn/GFL/rezerwa", magazyn(p_rezerwa_pu=0.2), 0.15),
    ]


def _konfiguracje_turbiny() -> list[tuple[str, Urzadzenie, float]]:
    return [
        ("turbina/typ4", turbina(), 0.2),
        (
            "turbina/typ3/crowbar zwloczny",
            turbina(typ="wiatr_typ_3", crowbar=crowbar_typowy()),
            0.2,
        ),
        (
            "turbina/typ3/crowbar natychmiastowy",
            turbina(typ="wiatr_typ_3", crowbar=crowbar_typowy(czas_zwloki_s=0.0)),
            0.2,
        ),
    ]


def wszystkie_konfiguracje() -> list[tuple[str, Urzadzenie, float]]:
    return [
        *_konfiguracje_maszyny(),
        *_konfiguracje_przeksztaltnikow(),
        *_konfiguracje_magazynu(),
        *_konfiguracje_turbiny(),
    ]


def _odsun_od_krawedzi(urzadzenie: Urzadzenie, stan: np.ndarray) -> np.ndarray:
    """Odsun stany, ktore w rownowadze SIEDZA na ograniczniku, do wnetrza galezi.

    DWA takie stany maja te wlasnosc Z KONSTRUKCJI, nie przez przypadek:
    * `pitch_rad` w rownowadze rowna sie katowi MINIMALNEMU (turbina oddaje pelna
      moc aerodynamiczna), a ogranicznik nienawrotny zeruje tam pochodna
      jednostronnie — roznica CENTRALNA mierzy wtedy srednia dwoch roznych
      pochodnych jednostronnych (pomiar: 0,262 wobec 0,524), czyli wlasnosc
      OGRANICZNIKA, nie blad jakobianu;
    * `crowbar_pu` w spoczynku rowna sie zeru, ktore jest krawedzia galezi `max`.

    Zgodnosc jakobianu bada sie WEWNATRZ galezi, bo tam pochodna istnieje. Samo
    dzialanie ogranicznikow na krawedzi jest sprawdzane osobno — przez
    nienaruszalnosc zakresu w calym przebiegu (`test_biblioteka_przebiegi`).
    """
    odsuniety = stan.copy()
    nazwy = urzadzenie.nazwy_stanow
    if "crowbar_pu" in nazwy:
        odsuniety[nazwy.index("crowbar_pu")] = 0.4
    if "pitch_rad" in nazwy:
        odsuniety[nazwy.index("pitch_rad")] += 0.004
    return odsuniety


def _stany_probne(urzadzenie: Urzadzenie, stan: np.ndarray) -> list[tuple[str, np.ndarray]]:
    """Punkt pracy + stan zaburzony, w ktorym KAZDY skladnik jest niezerowy."""
    generator = np.random.default_rng(20260918)
    zaburzony = _odsun_od_krawedzi(
        urzadzenie, stan + generator.uniform(-0.02, 0.02, size=stan.shape)
    )
    return [
        ("punkt pracy", _odsun_od_krawedzi(urzadzenie, stan)),
        ("stan zaburzony", zaburzony),
    ]


def _roznica_po_stanie(funkcja, stan: np.ndarray, indeks: int) -> np.ndarray:
    w_gore = stan.copy()
    w_dol = stan.copy()
    w_gore[indeks] += KROK_ROZNICY
    w_dol[indeks] -= KROK_ROZNICY
    return (funkcja(w_gore) - funkcja(w_dol)) / (2.0 * KROK_ROZNICY)


def _roznica_po_napieciu(funkcja, napiecie: complex, os: int) -> np.ndarray:
    przesuniecie = complex(KROK_ROZNICY, 0.0) if os == 0 else complex(0.0, KROK_ROZNICY)
    return (funkcja(napiecie + przesuniecie) - funkcja(napiecie - przesuniecie)) / (
        2.0 * KROK_ROZNICY
    )


def _prad_jako_wektor(urzadzenie: Urzadzenie, stan: np.ndarray, napiecie: complex) -> np.ndarray:
    prad = urzadzenie.prad_pu(stan, napiecie)
    return np.array([prad.real, prad.imag], dtype=float)


def _napiecie_jalowe_jako_wektor(urzadzenie: Urzadzenie, stan: np.ndarray) -> np.ndarray:
    napiecie = urzadzenie.napiecie_bez_obciazenia(stan)
    return np.array([napiecie.real, napiecie.imag], dtype=float)


def _porownaj_kolumne(analityczna: np.ndarray, numeryczna: np.ndarray, opis: str) -> float:
    """Porownanie z progiem BEZWZGLEDNYM i WZGLEDNYM; zwraca zmierzony blad."""
    blad = float(np.max(np.abs(analityczna - numeryczna)))
    skala = float(max(np.max(np.abs(analityczna)), np.max(np.abs(numeryczna))))
    prog = TOLERANCJA_JAKOBIANU + TOLERANCJA_WZGLEDNA_JAKOBIANU * skala
    assert blad <= prog, (
        f"{opis}: pochodna analityczna {analityczna} rozni sie od roznicy skonczonej "
        f"{numeryczna} o {blad} (prog {prog}, skala {skala})"
    )
    return blad


def _sprawdz_wszystkie_bloki(
    urzadzenie: Urzadzenie, stan: np.ndarray, napiecie: complex, opis: str
) -> float:
    """Piec blokow pochodnych wobec roznicy skonczonej; zwraca najwiekszy blad."""
    najwiekszy = 0.0
    wymiar = len(urzadzenie.nazwy_stanow)

    blok_fx = urzadzenie.jakobian_stan_stan(stan, napiecie)
    for indeks in range(wymiar):
        numeryczny = _roznica_po_stanie(
            lambda x, u=urzadzenie, n=napiecie: u.pochodne(x, n), stan, indeks
        )
        najwiekszy = max(
            najwiekszy,
            _porownaj_kolumne(
                blok_fx[:, indeks],
                numeryczny,
                f"{opis}: blok f_x, kolumna {urzadzenie.nazwy_stanow[indeks]!r}",
            ),
        )

    blok_fy = urzadzenie.jakobian_stan_napiecie(stan, napiecie)
    for os in (0, 1):
        numeryczny = _roznica_po_napieciu(
            lambda v, u=urzadzenie, x=stan: u.pochodne(x, v), napiecie, os
        )
        najwiekszy = max(
            najwiekszy,
            _porownaj_kolumne(blok_fy[:, os], numeryczny, f"{opis}: blok f_y, kolumna {os}"),
        )

    blok_ix = urzadzenie.jakobian_prad_stan(stan, napiecie)
    for indeks in range(wymiar):
        numeryczny = _roznica_po_stanie(
            lambda x, u=urzadzenie, n=napiecie: _prad_jako_wektor(u, x, n), stan, indeks
        )
        najwiekszy = max(
            najwiekszy,
            _porownaj_kolumne(
                blok_ix[:, indeks],
                numeryczny,
                f"{opis}: blok I_x, kolumna {urzadzenie.nazwy_stanow[indeks]!r}",
            ),
        )

    blok_iy = urzadzenie.jakobian_prad_napiecie(stan, napiecie)
    for os in (0, 1):
        numeryczny = _roznica_po_napieciu(
            lambda v, u=urzadzenie, x=stan: _prad_jako_wektor(u, x, v), napiecie, os
        )
        najwiekszy = max(
            najwiekszy,
            _porownaj_kolumne(blok_iy[:, os], numeryczny, f"{opis}: blok I_y, kolumna {os}"),
        )

    blok_ex = urzadzenie.jakobian_napiecia_bez_obciazenia(stan)
    for indeks in range(wymiar):
        numeryczny = _roznica_po_stanie(
            lambda x, u=urzadzenie: _napiecie_jalowe_jako_wektor(u, x), stan, indeks
        )
        najwiekszy = max(
            najwiekszy,
            _porownaj_kolumne(
                blok_ex[:, indeks],
                numeryczny,
                f"{opis}: blok dE/dx, kolumna {urzadzenie.nazwy_stanow[indeks]!r}",
            ),
        )
    return najwiekszy


@pytest.mark.parametrize(
    ("opis", "urzadzenie", "p_pu"),
    list(wszystkie_konfiguracje()),
    ids=[opis for opis, _, _ in wszystkie_konfiguracje()],
)
def test_jakobiany_zgodne_z_roznica_skonczona(
    opis: str, urzadzenie: Urzadzenie, p_pu: float
) -> None:
    """Piec blokow pochodnych x dwa stany x dwa napiecia, dla KAZDEJ konfiguracji."""
    uklad = zloz_uklad(urzadzenie, p_pu=p_pu)
    stan = urzadzenie.stan_poczatkowy(uklad.napiecie_gen_pu, uklad.moc_gen_pu)
    napiecia = [
        ("napiecie znamionowe", uklad.napiecie_gen_pu),
        ("gleboki zapad", 0.35 * cmath.exp(1j * 0.12)),
    ]
    for opis_stanu, stan_probny in _stany_probne(urzadzenie, stan):
        for opis_napiecia, napiecie in napiecia:
            _sprawdz_wszystkie_bloki(
                urzadzenie,
                stan_probny,
                napiecie,
                f"{opis} / {opis_stanu} / {opis_napiecia}",
            )


@pytest.mark.parametrize(
    ("opis", "urzadzenie", "p_pu"),
    list(wszystkie_konfiguracje()),
    ids=[opis for opis, _, _ in wszystkie_konfiguracje()],
)
def test_punkt_pracy_jest_rownowaga(opis: str, urzadzenie: Urzadzenie, p_pu: float) -> None:
    """Pochodne stanow w punkcie pracy sa zerowe — poza stanami jawnie dryfujacymi.

    Stan naladowania magazynu dryfuje Z DEFINICJI (magazyn oddaje albo pobiera
    energie), wiec jest zgloszony w `stany_bez_rownowagi` i sprawdzany osobno:
    ma miec ZNAK zgodny z kierunkiem mocy, a nie wartosc zerowa.
    """
    uklad = zloz_uklad(urzadzenie, p_pu=p_pu)
    stan = urzadzenie.stan_poczatkowy(uklad.napiecie_gen_pu, uklad.moc_gen_pu)
    pochodne = urzadzenie.pochodne(stan, uklad.napiecie_gen_pu)
    bez_rownowagi = set(urzadzenie.stany_bez_rownowagi)
    for nazwa, wartosc in zip(urzadzenie.nazwy_stanow, pochodne, strict=True):
        if nazwa in bez_rownowagi:
            continue
        assert (
            abs(float(wartosc)) < TOLERANCJA_ROWNOWAGI
        ), f"{opis}: stan {nazwa!r} nie jest w rownowadze (pochodna {wartosc})"


@pytest.mark.parametrize(
    ("opis", "urzadzenie", "p_pu"),
    list(wszystkie_konfiguracje()),
    ids=[opis for opis, _, _ in wszystkie_konfiguracje()],
)
def test_punkt_pracy_odtwarza_moc(opis: str, urzadzenie: Urzadzenie, p_pu: float) -> None:
    """Prad z inicjalizacji musi odtworzyc moc punktu pracy CO DO BITU rachunku."""
    uklad = zloz_uklad(urzadzenie, p_pu=p_pu)
    stan = urzadzenie.stan_poczatkowy(uklad.napiecie_gen_pu, uklad.moc_gen_pu)
    prad = urzadzenie.prad_pu(stan, uklad.napiecie_gen_pu)
    moc = uklad.napiecie_gen_pu * prad.conjugate()
    assert (
        abs(moc - uklad.moc_gen_pu) < 1.0e-12
    ), f"{opis}: moc odtworzona {moc} rozni sie od mocy punktu pracy {uklad.moc_gen_pu}"


@pytest.mark.parametrize(
    ("opis", "urzadzenie", "p_pu"),
    list(wszystkie_konfiguracje()),
    ids=[opis for opis, _, _ in wszystkie_konfiguracje()],
)
def test_urzadzenie_odlaczone_nie_wstrzykuje_pradu(
    opis: str, urzadzenie: Urzadzenie, p_pu: float
) -> None:
    """Opakowanie odlaczenia dziala dla KAZDEJ rodziny, nie tylko dla maszyny.

    To jest test klasy: `UrzadzenieOdlaczone` powstalo dla maszyny klasycznej, a
    zdarzenie `OdlaczenieZrodla` moze trafic w dowolne zrodlo. Rodzina, ktorej
    napiecie jalowe nie jest okreslone, wywalilaby bieg przy pierwszym odlaczeniu.
    """
    uklad = zloz_uklad(urzadzenie, p_pu=p_pu)
    stan = urzadzenie.stan_poczatkowy(uklad.napiecie_gen_pu, uklad.moc_gen_pu)
    odlaczone = UrzadzenieOdlaczone(urzadzenie)
    assert odlaczone.prad_pu(stan, complex(0.4, -0.2)) == 0j
    pochodne = odlaczone.pochodne(stan, complex(0.4, -0.2))
    assert np.all(np.isfinite(pochodne)), f"{opis}: pochodne odlaczonego nie sa skonczone"
    assert odlaczone.stany_bez_rownowagi == urzadzenie.stany_bez_rownowagi


def test_jakobian_odlaczonego_zgodny_z_roznica_skonczona() -> None:
    """Regula lancuchowa opakowania odlaczenia dla rodzin z nowej biblioteki.

    Pochodne urzadzenia odlaczonego licza sie przy jego WLASNYM napieciu jalowym,
    ktore samo zalezy od stanu — pominiecie drugiego skladnika reguly lancuchowej
    jest niewidoczne w przebiegu i widoczne WYLACZNIE tutaj.
    """
    for opis, urzadzenie, p_pu in wszystkie_konfiguracje():
        uklad = zloz_uklad(urzadzenie, p_pu=p_pu)
        stan = urzadzenie.stan_poczatkowy(uklad.napiecie_gen_pu, uklad.moc_gen_pu)
        _, zaburzony = _stany_probne(urzadzenie, stan)[1]
        odlaczone = UrzadzenieOdlaczone(urzadzenie)
        blok = odlaczone.jakobian_stan_stan(zaburzony, complex(0.9, 0.05))
        for indeks in range(len(urzadzenie.nazwy_stanow)):
            numeryczny = _roznica_po_stanie(
                lambda x, u=odlaczone: u.pochodne(x, complex(0.9, 0.05)), zaburzony, indeks
            )
            blad = float(np.max(np.abs(blok[:, indeks] - numeryczny)))
            assert blad < TOLERANCJA_JAKOBIANU, (
                f"odlaczone/{opis}: kolumna {urzadzenie.nazwy_stanow[indeks]!r} "
                f"rozni sie od roznicy skonczonej o {blad}"
            )


def test_zmiana_bazy_maszyny_nie_zmienia_wielkosci_fizycznych() -> None:
    """Ta sama maszyna w DWOCH bazach mocy daje ten sam prad i te same pochodne.

    Klasa defektu „dwie bazy tej samej wielkosci pu" (kontrprzyklad 100/50 MVA):
    blad skali 2:1 NIE maleje przy dt -> 0, bo nie jest bledem calkowania.
    """
    #: Pola przeliczane ODWROTNIE do impedancji (jak moc): H i D.
    jak_moc = {"h_s", "d_pu"}
    #: Pola NIEZALEZNE od bazy mocy: stale czasowe i wspolczynniki nasycenia.
    bez_bazy = {
        "td0_prim_s",
        "tq0_prim_s",
        "td0_bis_s",
        "tq0_bis_s",
        "nasycenie_s10",
        "nasycenie_s12",
    }
    pola_polowka = {
        nazwa: (
            wartosc if nazwa in bez_bazy else (wartosc / 2.0 if nazwa in jak_moc else wartosc * 2.0)
        )
        for nazwa, wartosc in PARAMETRY_MASZYNY.items()
        if nazwa != "s_n_mva"
    }
    pola_bazowe = {
        nazwa: wartosc for nazwa, wartosc in PARAMETRY_MASZYNY.items() if nazwa != "s_n_mva"
    }
    w_bazie_ukladu = zbuduj_maszyne_synchroniczna(
        ident="G",
        wezel="GEN",
        s_n_mva=S_BAZOWA_MVA,
        wzbudzenie=None,
        turbina=None,
        stabilizator=None,
        s_bazowa_mva=S_BAZOWA_MVA,
        f_bazowa_hz=F_BAZOWA_HZ,
        **pola_bazowe,
    )
    w_bazie_urzadzenia = zbuduj_maszyne_synchroniczna(
        ident="G",
        wezel="GEN",
        s_n_mva=S_BAZOWA_MVA / 2.0,
        wzbudzenie=None,
        turbina=None,
        stabilizator=None,
        s_bazowa_mva=S_BAZOWA_MVA,
        f_bazowa_hz=F_BAZOWA_HZ,
        **pola_polowka,
    )
    napiecie = complex(1.02, 0.05)
    moc = complex(0.4, 0.1)
    stan_a = w_bazie_ukladu.stan_poczatkowy(napiecie, moc)
    stan_b = w_bazie_urzadzenia.stan_poczatkowy(napiecie, moc)
    assert w_bazie_ukladu.prad_pu(stan_a, napiecie) == pytest.approx(
        w_bazie_urzadzenia.prad_pu(stan_b, napiecie)
    )
    assert w_bazie_ukladu.pochodne(stan_a, napiecie) == pytest.approx(
        w_bazie_urzadzenia.pochodne(stan_b, napiecie), abs=1e-12
    )


def test_zmiana_bazy_przeksztaltnika_nie_zmienia_ogranicznika() -> None:
    """Ogranicznik pradu przeksztaltnika jest ta sama GRANICA FIZYCZNA w obu bazach.

    Przeksztaltnik 30 MVA o `i_max = 1,2 pu` swojej bazy ma w bazie 100 MVA
    granice 0,36 pu. Gdyby `i_max` nie przechodzil zmiany bazy, ogranicznik
    dzialalby przy pradzie trzykrotnie wiekszym niz aparat wytrzymuje.
    """
    rdzen = rdzen_gfl(s_n_mva=30.0, i_max_pu=1.2)
    assert rdzen.i_max_pu == pytest.approx(1.2 * 30.0 / S_BAZOWA_MVA)
    rdzen_w_bazie = zbuduj_rdzen_gfl(
        s_bazowa_mva=S_BAZOWA_MVA,
        f_bazowa_hz=F_BAZOWA_HZ,
        s_n_mva=S_BAZOWA_MVA,
        i_max_pu=1.2 * 30.0 / S_BAZOWA_MVA,
        priorytet_ogranicznika="bierna",
        pll_kp=6.0,
        pll_ki=60.0,
        k_frt=2.0 * 30.0 / S_BAZOWA_MVA,
        prog_frt_pu=0.9,
        tp_s=0.02,
        tiq_s=0.01,
        p_odbudowa_pu_na_s=1.0 * 30.0 / S_BAZOWA_MVA,
        p_odbudowa_opoznienie_s=0.05,
        droop_p_f_pu=0.04,
        martwa_strefa_f_hz=0.02,
        droop_q_u_pu=0.05,
        martwa_strefa_u_pu=0.01,
        u_min_ciagle_pu=0.85,
        u_max_ciagle_pu=1.1,
    )
    assert rdzen.i_max_pu == pytest.approx(rdzen_w_bazie.i_max_pu)
    assert rdzen.k_frt == pytest.approx(rdzen_w_bazie.k_frt)
    assert rdzen.p_odbudowa_pu_na_s == pytest.approx(rdzen_w_bazie.p_odbudowa_pu_na_s)
