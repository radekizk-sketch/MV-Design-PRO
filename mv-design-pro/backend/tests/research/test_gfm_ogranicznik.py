"""Ogranicznik prądu falownika GFM — POMIAR dwóch kandydatów, nie wybór między nimi.

KOD BADAWCZY — patrz `backend/research/README.md`.

PO CO TEN PLIK ISTNIEJE. `urzadzenia.FalownikGFM` jest źródłem NAPIĘCIOWYM za
impedancją, więc jego prąd zwarciowy wynika z ``(E − V)/Z_w`` i nie zna granicy
zaworów: zmierzone ``I_max = 2,4425`` p.u. przy zwarciu ``x_f = 0,05`` p.u.
(a 3,5916 p.u. przy ``x_f = 0,01``), wobec 1,1–1,5 p.u. dla rzeczywistego
przekształtnika. Ponieważ GFL ogranicznik MA, dotychczasowe porównanie „GFL vs
GFM podczas FRT" porównywało urządzenie z limitem z urządzeniem bez limitu.
Ten plik mierzy stan PRZED i PO wejściu ogranicznika oraz zachowanie NUMERYCZNE
obu strategii — produktem jest zmierzone porównanie, NIE rekomendacja: wybór
strategii jest decyzją architektoniczną właściciela programu.

SCENARIUSZ ODNIESIENIA (ten sam co w `test_dynamic_lab._przebieg_der`):
DER — MID — SYS, DER wstrzykuje ``0,6 + j0`` p.u., zwarcie symetryczne przez
``Zf`` na szynie MID w ``t = 0,5`` s, zdjęte po ``0,15`` s, RK4, krok 2 ms, okno 1,0 s.

ZMIERZONE (``x_f = 0,05`` p.u., jeśli nie napisano inaczej):

    wariant                  I_max   I(0,60 s)  U_min DER  |dU/dP| w zwarciu
    bez ogranicznika         2,4425   2,2120     0,6287     0,0253
    impedancja k = 0,10      1,3801   1,3730     0,5133     0,0571
    impedancja k = 0,20      1,1928   0,8530     0,4430     0,0780
    nasycenie zadania        1,2000   1,2000     0,4897     0,0971

    (bez zwarcia ``|dU/dP| = 0,0201`` dla KAŻDEGO wariantu — ogranicznik
    nieaktywny nie zmienia ani jednej próbki, co pinuje osobny test.)

Testy są WŁASNOŚCIAMI (metamorficznymi) i ILOCZYNEM CECH
(strategia × głębokość zwarcia × integrator), a nie pojedynczym przykładem.
Wartości bezwzględne pojawiają się w komunikatach asercji — po to, żeby zmiana
modelu była widoczna jako LICZBA, a nie tylko jako czerwony test.

GRANICA WNIOSKÓW. Wszystkie liczby dotyczą TEGO modelu na TEJ sieci: RMS,
składowa zgodna, brak wewnętrznej pętli prądowej, brak blokady falownika i brak
ograniczenia energii. Żaden wynik nie jest walidacją wobec sprzętu ani wobec
narzędzia zewnętrznego (oś W: W1/W2, nigdy W3).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pytest
from dynamic_lab.calkowanie import INTEGRATORY
from dynamic_lab.konwencje import ogranicz_prad
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.urzadzenia import (
    FalownikGFL,
    FalownikGFM,
    KandydatOgraniczeniaImpedancjaWirtualna,
    KandydatOgraniczeniaNasycenieZadania,
    OdbiorStalejMocy,
    PunktPracyPozaOgranicznikiemError,
)
from dynamic_lab.wynik import WynikDynamiczny
from dynamic_lab.zdarzenia import HarmonogramZdarzen, ZdjecieZwarcia, ZwarcieTrojfazowe

# --- konfiguracje badane --------------------------------------------------------

I_MAX = 1.2
"""Granica prądowa użyta we wszystkich porównaniach [p.u.] — jedna dla obu
strategii, bo porównujemy STRATEGIE, a nie nastawy."""

MIEKKI = KandydatOgraniczeniaImpedancjaWirtualna(i_max_pu=I_MAX, k_impedancji_pu=0.10)
"""Impedancja wirtualna PONIŻEJ progu twardości ``|Z_w|/i_max = 0,1253`` — limit miękki."""

TWARDY_IMPEDANCYJNY = KandydatOgraniczeniaImpedancjaWirtualna(i_max_pu=I_MAX, k_impedancji_pu=0.20)
"""Impedancja wirtualna POWYŻEJ progu twardości — limit twardy, ale z wycofaniem prądu."""

NASYCENIE = KandydatOgraniczeniaNasycenieZadania(i_max_pu=I_MAX)
"""Nasycenie zadania prądu z priorytetem składowej biernej — limit twardy."""

STRATEGIE = (
    ("impedancja k=0,10", MIEKKI),
    ("impedancja k=0,20", TWARDY_IMPEDANCYJNY),
    ("nasycenie zadania", NASYCENIE),
)
GLEBOKOSCI = (0.05, 0.01)
"""Reaktancja zwarcia [p.u.]: 0,05 — zapad umiarkowany, 0,01 — głęboki."""

Z_WIRTUALNA = complex(0.01, 0.15)
"""Domyślna impedancja wirtualna `FalownikGFM` — punkt odniesienia dla kresów."""


# --- warsztat pomiarowy ---------------------------------------------------------


def _topologia() -> TopologiaSieci:
    return TopologiaSieci(
        szyny=("DER", "MID", "SYS"),
        galezie=[Galaz("DER", "MID", 0.02, 0.10), Galaz("MID", "SYS", 0.02, 0.10)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )


_PAMIEC: dict[tuple, WynikDynamiczny] = {}


def przebieg(
    ogranicznik,
    *,
    x_f_pu: float = 0.05,
    trwanie_s: float = 0.15,
    integrator: str = "rk4",
    krok_s: float = 0.002,
    czas_koncowy_s: float = 1.0,
) -> WynikDynamiczny:
    """Bieg scenariusza odniesienia; wyniki są zapamiętywane (te same nastawy = ten sam bieg).

    Pamięć podręczna jest bezpieczna, bo `WynikDynamiczny` jest niemutowalny, a
    `SilnikRMS` powstaje od nowa w każdym biegu — powtórzenie nastaw MUSI dać ten
    sam wynik (reguła determinizmu laboratorium).
    """
    klucz = (repr(ogranicznik), x_f_pu, trwanie_s, integrator, krok_s, czas_koncowy_s)
    if klucz not in _PAMIEC:
        falownik = FalownikGFM(ref="D", szyna="DER", ogranicznik=ogranicznik)
        model = ModelDynamiczny(topologia=_topologia(), urzadzenia=[falownik])
        silnik = SilnikRMS(model, integrator=integrator, krok_s=krok_s)
        x0 = silnik.inicjalizuj({"D": complex(0.6, 0.0)})
        harmonogram = HarmonogramZdarzen(
            [
                ZwarcieTrojfazowe(0.5, "MID", x_f_pu=x_f_pu),
                ZdjecieZwarcia(0.5 + trwanie_s, "MID"),
            ]
        )
        _PAMIEC[klucz] = silnik.symuluj(x0, czas_koncowy_s=czas_koncowy_s, harmonogram=harmonogram)
    return _PAMIEC[klucz]


def _serie(wynik: WynikDynamiczny, klucz: str, ref: str) -> np.ndarray:
    return np.array(wynik.sygnal(klucz, ref).wartosci, dtype=np.float64)


@dataclass(frozen=True)
class Pomiar:
    """Zestaw wielkości mierzonych w jednym biegu — jawnie, z jednostkami w nazwach."""

    i_max_pu: float
    u_min_pu: float
    p_min_pu: float
    p_max_pu: float
    q_max_pu: float
    f_min_hz: float
    f_max_hz: float
    wybieg_delta_deg: float
    zbiegl: bool

    def __str__(self) -> str:
        return (
            f"I_max={self.i_max_pu:.4f} U_min={self.u_min_pu:.4f} "
            f"P=[{self.p_min_pu:+.4f},{self.p_max_pu:+.4f}] Q_max={self.q_max_pu:+.4f} "
            f"f=[{self.f_min_hz:.4f},{self.f_max_hz:.4f}] "
            f"wybieg_delta={self.wybieg_delta_deg:.1f} deg"
        )


def zmierz(wynik: WynikDynamiczny) -> Pomiar:
    """Wyciągnij komplet wielkości z przebiegu (albo powiedz, że biegu nie ma)."""
    if not wynik.diagnostyka.zbiegl:
        raise AssertionError(
            "Bieg nie doszedł do końca — pomiar nie istnieje: "
            f"{wynik.diagnostyka.blad.klasa} w fazie {wynik.diagnostyka.blad.faza} "
            f"w t={wynik.diagnostyka.blad.czas_s:.4f} s"
        )
    delta = _serie(wynik, "delta_rad", "D")
    omega = _serie(wynik, "omega_pu", "D")
    return Pomiar(
        i_max_pu=float(_serie(wynik, "i_pu", "D").max()),
        u_min_pu=float(_serie(wynik, "u_pu", "DER").min()),
        p_min_pu=float(_serie(wynik, "p_pu", "D").min()),
        p_max_pu=float(_serie(wynik, "p_pu", "D").max()),
        q_max_pu=float(_serie(wynik, "q_pu", "D").max()),
        f_min_hz=float(omega.min() * 50.0),
        f_max_hz=float(omega.max() * 50.0),
        wybieg_delta_deg=float(np.degrees(np.max(np.abs(delta - delta[0])))),
        zbiegl=True,
    )


def wartosc_w_chwili(wynik: WynikDynamiczny, klucz: str, ref: str, chwila_s: float) -> float:
    """Próbka najbliższa zadanej chwili — do pomiaru stanu quasi-ustalonego w zwarciu."""
    czas = np.array(wynik.czas_s, dtype=np.float64)
    return float(_serie(wynik, klucz, ref)[int(np.argmin(np.abs(czas - chwila_s)))])


def sztywnosc_napieciowa_pu(ogranicznik, *, x_f_pu: float | None, przyrost_p_pu: float = 0.02):
    """``|dU/dP|`` na zaciskach DER przy ZAMROŻONYM stanie urządzenia [p.u./p.u.].

    Sztywność napięciowa źródła jest własnością ALGEBRAICZNĄ: mierzy, o ile zmieni
    się napięcie zacisków, gdy zmieni się pobór na tej samej szynie, ZANIM zdążą
    zareagować regulatory. Dlatego stan ``x`` jest tu ustalony na punkcie pracy, a
    zmienia się wyłącznie obciążenie — inaczej mierzylibyśmy regulację, a nie
    charakter źródła.

    Zwraca ``(|dU/dP|, |I| przy mniejszym obciążeniu)``.
    """

    def punkt(p_odbioru_pu: float) -> tuple[float, float]:
        topologia = _topologia()
        falownik = FalownikGFM(ref="D", szyna="DER", ogranicznik=ogranicznik)
        odbior = OdbiorStalejMocy(ref="L", szyna="DER", p_pu=-p_odbioru_pu, q_pu=0.0)
        model = ModelDynamiczny(topologia=topologia, urzadzenia=[falownik, odbior])
        silnik = SilnikRMS(model, integrator="rk4", krok_s=0.002)
        x0 = silnik.inicjalizuj({"D": complex(0.6, 0.0), "L": complex(-p_odbioru_pu, 0.0)})
        if x_f_pu is not None:
            silnik.solver_sieci.ustaw_topologie(
                ZwarcieTrojfazowe(0.0, "MID", x_f_pu=x_f_pu).zastosuj(topologia)
            )
        napiecia = silnik.rozwiaz_siec(x0)
        v_der = complex(napiecia[topologia.indeks["DER"]])
        return abs(v_der), abs(falownik.wstrzykniecie(x0[:4], v_der))

    u_1, i_1 = punkt(0.10)
    u_2, _ = punkt(0.10 + przyrost_p_pu)
    return abs(u_2 - u_1) / przyrost_p_pu, i_1


def stracil_synchronizm(wynik: WynikDynamiczny) -> bool:
    """Czy falownik wypadł z synchronizmu w oknie symulacji.

    KRYTERIUM I JEGO GRANICA. Kąt ``delta`` falownika GFM to kąt SEM narzucanej
    przez regulator mocy, a nie kąt wirnika — nie obowiązuje dla niego kryterium
    równych pól, dlatego `benchmarki.czas_krytyczny_zwarcia` ODMAWIA liczenia CCT
    dla falowników. Tutaj rozstrzyga wybieg kąta powyżej ``pi`` (poślizg
    biegunowy) ALBO brak rozwiązania sieci: dla nasycenia zadania utrata
    synchronizmu objawia się właśnie jako awaria solvera (zmierzone), więc
    kryterium zwijające obie sytuacje do „nie zachował" byłoby zgodne z pomiarem,
    a rozdzielenie ich jest informacją dla inżyniera — stąd osobne asercje w
    testach, a tu jedna odpowiedź logiczna.

    NIE wykrywa: powolnej niestabilności oscylacyjnej, utraty stabilności
    napięciowej ani poślizgu, który zdarzyłby się po końcu okna symulacji.
    """
    if not wynik.diagnostyka.zbiegl:
        return True
    delta = _serie(wynik, "delta_rad", "D")
    return bool(np.max(np.abs(delta - delta[0])) >= math.pi)


# --- 1. Stan PRZED: domyślny GFM nie ma ogranicznika ----------------------------


def test_domyslny_gfm_nie_ma_ogranicznika_i_daje_prad_niefizyczny() -> None:
    """Domyślne zachowanie ZOSTAJE bez zmian — i dlatego zostaje też jego wada.

    Dwie rzeczy naraz, bo są nierozdzielne: (a) dołożenie zdolności nie zmieniło
    domyślnego modelu (``ogranicznik is None``), więc żaden wcześniejszy pomiar
    laboratorium nie stał się nieporównywalny; (b) ten domyślny model daje prąd
    zwarciowy dwukrotnie większy niż rzeczywisty przekształtnik, więc NIE WOLNO
    go przedstawiać jako model falownika z ogranicznikiem.
    """
    assert FalownikGFM(ref="D", szyna="DER").ogranicznik is None
    assert FalownikGFM(ref="D", szyna="DER").tozsamosc_ogranicznika == "brak"

    pomiary = {xf: zmierz(przebieg(None, x_f_pu=xf)) for xf in GLEBOKOSCI}
    for xf, pomiar in pomiary.items():
        assert pomiar.i_max_pu > 2.0, f"x_f={xf}: {pomiar}"
    # Głębsze zwarcie MUSI dać większy prąd — bez ogranicznika nic tego nie hamuje.
    assert pomiary[0.01].i_max_pu > pomiary[0.05].i_max_pu, pomiary


def test_ogranicznik_nieaktywny_nie_zmienia_ani_jednej_probki() -> None:
    """Ogranicznik poniżej progu MUSI być przezroczysty — inaczej zmienia pomiar bez powodu.

    Zwarcie ``x_f = 0,5`` p.u. jest na tyle płytkie, że prąd (zmierzone 0,7486
    p.u.) nie sięga limitu 1,2 p.u. Wtedy każdy sygnał musi być IDENTYCZNY co do
    bitu — nie „bliski", bo strategie nie wykonują wtedy żadnej operacji
    zmiennoprzecinkowej na prądzie.
    """
    odniesienie = przebieg(None, x_f_pu=0.5, czas_koncowy_s=1.5)
    assert zmierz(odniesienie).i_max_pu < I_MAX, zmierz(odniesienie)
    for nazwa, strategia in STRATEGIE:
        badany = przebieg(strategia, x_f_pu=0.5, czas_koncowy_s=1.5)
        for klucz, ref in (("i_pu", "D"), ("u_pu", "DER"), ("p_pu", "D"), ("delta_rad", "D")):
            assert np.array_equal(
                _serie(odniesienie, klucz, ref), _serie(badany, klucz, ref)
            ), f"{nazwa}: {klucz}@{ref} zmienione mimo nieaktywnego ogranicznika"


def test_punkt_pracy_powyzej_progu_jest_odrzucony_z_liczbami() -> None:
    """Start niewykonalny MUSI paść głośno — cicha korekta zadania byłaby fabrykacją."""
    for nazwa, strategia in (
        ("impedancja", KandydatOgraniczeniaImpedancjaWirtualna(i_max_pu=0.5, k_impedancji_pu=0.2)),
        ("nasycenie", KandydatOgraniczeniaNasycenieZadania(i_max_pu=0.5)),
    ):
        model = ModelDynamiczny(
            topologia=_topologia(),
            urzadzenia=[FalownikGFM(ref="D", szyna="DER", ogranicznik=strategia)],
        )
        silnik = SilnikRMS(model, integrator="rk4", krok_s=0.002)
        with pytest.raises(PunktPracyPozaOgranicznikiemError) as blad:
            silnik.inicjalizuj({"D": complex(0.6, 0.0)})
        komunikat = str(blad.value)
        assert "0.5" in komunikat and "|I|" in komunikat, f"{nazwa}: {komunikat}"


# --- 2. Własności samej strategii (bez sieci) -----------------------------------


def _prad_dla_sem(strategia, sem_pu: float, v_pu: float) -> complex:
    """Prąd strategii dla zadanej SEM i napięcia — bez modelu i bez sieci."""
    sem = complex(sem_pu, 0.0)
    v = complex(v_pu, 0.0)
    i_0 = (sem - v) / Z_WIRTUALNA
    return strategia.prad_ograniczony(
        i_bez_ograniczenia=i_0, sem=sem, v_szyny=v, z_wirtualna=Z_WIRTUALNA
    )


def test_kres_gorny_impedancji_wirtualnej_zgadza_sie_z_wyprowadzeniem() -> None:
    """C0/W2: kres ``max(i_max, |Z_w|/k)`` wyprowadzony ze znaku ``g'(y)``, nie zgadnięty.

    Sprawdzamy OBIE strony progu twardości ``k* = |Z_w|/i_max`` (zmierzone
    0,125277) na siatce SEM dającej ``|I_0|`` od zera do ~60 p.u.:
      - ``k > k*`` → prąd NIGDY nie przekracza ``i_max`` (limit twardy),
      - ``k < k*`` → prąd przekracza ``i_max``, ale nigdy nie sięga ``|Z_w|/k``,
        a dla dużego ``|I_0|`` dociska się do tej asymptoty.
    """
    k_prog = abs(Z_WIRTUALNA) / I_MAX
    assert math.isclose(k_prog, 0.125277, rel_tol=1e-4), k_prog

    for k in (0.02, 0.05, 0.10, 0.1252, 0.1254, 0.20, 0.50, 1.0):
        strategia = KandydatOgraniczeniaImpedancjaWirtualna(i_max_pu=I_MAX, k_impedancji_pu=k)
        kres = strategia.kres_pradu_pu(Z_WIRTUALNA)
        oczekiwany = I_MAX if k >= k_prog else abs(Z_WIRTUALNA) / k
        assert math.isclose(kres, oczekiwany, rel_tol=1e-12), (k, kres, oczekiwany)

        moduly = [abs(_prad_dla_sem(strategia, sem, 1.0)) for sem in np.linspace(1.0, 10.0, 400)]
        najwiekszy = max(moduly)
        assert najwiekszy <= kres + 1.0e-12, f"k={k}: {najwiekszy:.6f} > kres {kres:.6f}"
        if k >= k_prog:
            assert najwiekszy <= I_MAX + 1.0e-12, f"k={k}: limit miał być twardy ({najwiekszy})"
        else:
            assert najwiekszy > I_MAX, f"k={k}: limit miał być MIĘKKI, a nie przekroczył i_max"
            # Asymptota: dla bardzo dużego |I_0| prąd dociska się do |Z_w|/k.
            daleko = abs(_prad_dla_sem(strategia, 500.0, 1.0))
            assert kres * 0.99 < daleko < kres, f"k={k}: {daleko:.6f} vs kres {kres:.6f}"


def test_nasycenie_zadania_daje_twardy_limit_dla_kazdej_pary_sem_i_napiecia() -> None:
    """Iloczyn (SEM × napięcie × priorytet): rzut na okrąg NIGDY nie przekracza ``i_max``."""
    for priorytet in (True, False):
        strategia = KandydatOgraniczeniaNasycenieZadania(
            i_max_pu=I_MAX, priorytet_biernej=priorytet
        )
        assert strategia.kres_pradu_pu(Z_WIRTUALNA) == I_MAX
        osiagniete = 0.0
        for sem in np.linspace(0.5, 6.0, 60):
            for v in np.linspace(0.01, 1.2, 40):
                modul = abs(_prad_dla_sem(strategia, float(sem), float(v)))
                assert modul <= I_MAX + 1.0e-12, (sem, v, modul)
                osiagniete = max(osiagniete, modul)
        assert math.isclose(osiagniete, I_MAX, rel_tol=1.0e-9), osiagniete


def test_nasycenie_zadania_zgadza_sie_z_ogranicznikami_gfl_i_oze() -> None:
    """Trzy miejsca, JEDNA funkcja — i to jest sprawdzone, nie zadeklarowane.

    HISTORIA. Rzut prądu na okrąg z priorytetem składowej istniał w laboratorium
    w trzech kopiach (`FalownikGFL.wstrzykniecie`, `urzadzenia_oze._ogranicz_prad`
    i ta strategia). Dług został spłacony: fizyka mieszka w
    `konwencje.ogranicz_prad`, a wszystkie trzy miejsca ją wołają. Test został,
    bo pilnuje czegoś innego niż wcześniej — że nikt nie wniósł czwartej kopii.

    ZAKRES RÓWNOŚCI. Sprawdzane są napięcia od 0,15 p.u. w górę. Poniżej ~1e-6
    p.u. `FalownikGFL` zwraca prąd zerowy, zanim dojdzie do ograniczania, więc
    obietnica równości ograniczona jest do zakresu, w którym ją zmierzono —
    deklaracja szersza byłaby fałszywą pewnością.
    """
    strategia = KandydatOgraniczeniaNasycenieZadania(i_max_pu=I_MAX, priorytet_biernej=True)
    for v in (complex(0.95, 0.1), complex(0.4, -0.2), complex(0.15, 0.0)):
        for i_zadany in (
            complex(1.8, 0.4),
            complex(0.3, 2.2),
            complex(-1.1, 1.9),
            complex(0.5, 0.2),
        ):
            moj = strategia.prad_ograniczony(
                i_bez_ograniczenia=i_zadany,
                sem=complex(1.05, 0.0),
                v_szyny=v,
                z_wirtualna=Z_WIRTUALNA,
            )
            oze = ogranicz_prad(i_zadany, v, I_MAX, priorytet_biernej=True)
            moc = v * np.conj(i_zadany)
            gfl = FalownikGFL(ref="G", szyna="B", i_max_pu=I_MAX, priorytet_biernej=True)
            z_gfl = gfl.wstrzykniecie(np.array([moc.real, moc.imag], dtype=np.float64), v)
            assert abs(moj - oze) < 1.0e-12, (v, i_zadany, moj, oze)
            assert abs(moj - z_gfl) < 1.0e-9, (v, i_zadany, moj, z_gfl)


@pytest.mark.parametrize(
    ("i_zadany", "v"),
    [
        (complex(1.8, 1.8), complex(0.95, 0.1)),
        (complex(2.0, 0.5), complex(0.4, -0.2)),
        (complex(-1.5, 2.0), complex(0.6, 0.3)),
    ],
)
def test_priorytet_czynnej_zachowuje_czynna_a_nie_wspolczynnik_mocy(
    i_zadany: complex, v: complex
) -> None:
    """``priorytet_biernej=False`` MUSI znaczyć „priorytet czynnej", nie „skaluj oba".

    ZMIERZONY DEFEKT (naprawiony 2026-09). `FalownikGFL.wstrzykniecie` w gałęzi
    ``not priorytet_biernej`` skalowała cały wektor: ``I * i_max/|I|``, czyli
    zachowywała WSPÓŁCZYNNIK MOCY. Dwie pozostałe kopie tej samej reguły
    (`urzadzenia_oze` i `KandydatOgraniczeniaNasycenieZadania`) zachowywały
    składową czynną i poświęcały bierną. Dla ``I = 2+2j`` względem fazy napięcia
    i ``i_max = 1`` dawało to ``(0,707; 0,707)`` zamiast ``(1,000; 0,000)`` —
    czyli 29 % mniej mocy czynnej z urządzenia, któremu kazano ją utrzymać.
    Flaga nazywała jedno, a jej zaprzeczenie robiło co innego.

    Iloczyn cech: głębokość zapadu × ćwiartka zadania (w tym ujemna czynna).
    """
    ogr = ogranicz_prad(i_zadany, v, I_MAX, priorytet_biernej=False)
    faza = v / abs(v)
    wzgledny_zadany = i_zadany / faza
    wzgledny_ogr = ogr / faza
    assert abs(ogr) <= I_MAX + 1.0e-12
    # Składowa czynna zachowana w całości albo ograniczona do kresu — nigdy
    # zmniejszona „proporcjonalnie" tylko po to, żeby utrzymać bierną.
    oczekiwana_czynna = max(min(wzgledny_zadany.real, I_MAX), -I_MAX)
    assert wzgledny_ogr.real == pytest.approx(oczekiwana_czynna, abs=1.0e-12)
    # Ta sama liczba musi wyjść z falownika GFL — czyli GFL naprawdę woła tę funkcję.
    gfl = FalownikGFL(ref="G", szyna="B", i_max_pu=I_MAX, priorytet_biernej=False)
    moc = v * np.conj(i_zadany)
    z_gfl = gfl.wstrzykniecie(np.array([moc.real, moc.imag], dtype=np.float64), v)
    assert abs(ogr - z_gfl) < 1.0e-9


def test_ogranicznik_odrzuca_bezsensowne_nastawy() -> None:
    """Zerowe wzmocnienie i niedodatni limit to zaślepki udające funkcję."""
    with pytest.raises(ValueError, match="i_max_pu"):
        KandydatOgraniczeniaImpedancjaWirtualna(i_max_pu=0.0, k_impedancji_pu=0.2)
    with pytest.raises(ValueError, match="k_impedancji_pu"):
        KandydatOgraniczeniaImpedancjaWirtualna(i_max_pu=1.2, k_impedancji_pu=0.0)
    with pytest.raises(ValueError, match="i_max_pu"):
        KandydatOgraniczeniaNasycenieZadania(i_max_pu=-1.0)


# --- 3. Pomiar PRZED i PO na sieci ---------------------------------------------


@pytest.mark.parametrize("x_f_pu", GLEBOKOSCI)
def test_obie_strategie_scinaja_prad_zwarciowy(x_f_pu: float) -> None:
    """Iloczyn (strategia × głębokość): każda strategia ścina prąd pod swój kres.

    Mierzone razem z resztą obrazu (U, P, Q, f, kąt), bo ogranicznik prądu nie
    jest kosmetyką jednej liczby: obniża też napięcie w miejscu przyłączenia
    (falownik przestaje podpierać sieć prądem, którego nie ma).
    """
    bez = zmierz(przebieg(None, x_f_pu=x_f_pu))
    for nazwa, strategia in STRATEGIE:
        pomiar = zmierz(przebieg(strategia, x_f_pu=x_f_pu))
        kres = strategia.kres_pradu_pu(Z_WIRTUALNA)
        assert pomiar.i_max_pu <= kres + 1.0e-9, f"{nazwa} x_f={x_f_pu}: {pomiar} > kres {kres}"
        assert pomiar.i_max_pu < bez.i_max_pu - 0.5, f"{nazwa} x_f={x_f_pu}: {pomiar} vs {bez}"
        # Mniejszy prąd = mniejsze podparcie napięcia w miejscu zwarcia.
        assert pomiar.u_min_pu < bez.u_min_pu, f"{nazwa} x_f={x_f_pu}: {pomiar} vs {bez}"
        # Ogranicznik zabiera moc czynną — falownik przyspiesza mocniej.
        assert pomiar.f_max_hz > bez.f_max_hz, f"{nazwa} x_f={x_f_pu}: {pomiar} vs {bez}"


def test_prad_i_moc_w_srodku_zwarcia_roznia_strategie() -> None:
    """Porównanie strategii w stanie quasi-ustalonym zwarcia — LICZBY, nie werdykt.

    Zmierzone w ``t = 0,60`` s przy ``x_f = 0,05``: nasycenie oddaje dokładnie
    limit (1,2000 p.u.) i całą tę zdolność przeznacza na prąd bierny, więc moc
    czynna spada do zera; impedancja ``k = 0,10`` przepuszcza 1,3730 p.u. (ponad
    limit) i zostawia 0,171 p.u. mocy czynnej; impedancja ``k = 0,20`` daje
    0,8530 p.u., czyli MNIEJ niż własny limit. To jest cały kompromis
    „twardy limit ↔ zachowane wsparcie" w trzech liczbach.
    """
    chwila = 0.60
    bez = przebieg(None, x_f_pu=0.05)
    i_bez = wartosc_w_chwili(bez, "i_pu", "D", chwila)
    wyniki = {}
    for nazwa, strategia in STRATEGIE:
        wynik = przebieg(strategia, x_f_pu=0.05)
        wyniki[nazwa] = (
            wartosc_w_chwili(wynik, "i_pu", "D", chwila),
            wartosc_w_chwili(wynik, "p_pu", "D", chwila),
            wartosc_w_chwili(wynik, "q_pu", "D", chwila),
        )

    assert i_bez > 2.0, i_bez
    i_nas, p_nas, q_nas = wyniki["nasycenie zadania"]
    i_miekki, p_miekki, _ = wyniki["impedancja k=0,10"]
    i_twardy, p_twardy, _ = wyniki["impedancja k=0,20"]

    assert math.isclose(i_nas, I_MAX, rel_tol=1.0e-6), wyniki
    assert abs(p_nas) < 1.0e-3, f"priorytet biernej miał zabrać całą moc czynną: {wyniki}"
    assert q_nas > 0.4, wyniki
    assert i_miekki > I_MAX, f"limit miękki miał przepuścić ponad i_max: {wyniki}"
    assert p_miekki > 0.1, wyniki
    assert i_twardy < I_MAX - 0.2, f"duże k miało WYCOFAĆ prąd poniżej limitu: {wyniki}"
    assert p_twardy < p_miekki, wyniki


def test_wysokie_wzmocnienie_impedancji_wycofuje_prad_zamiast_go_ograniczac() -> None:
    """Wada strategii impedancyjnej: przy dużym ``k`` zwarcie ZMNIEJSZA prąd falownika.

    Wynika wprost ze znaku ``g'(y)``: dla ``a·i_max > 1`` funkcja maleje, więc im
    głębszy zapad, tym mniejszy prąd. Zmierzone: przy ``k = 1,0`` prąd w środku
    zwarcia jest MNIEJSZY niż przed zwarciem — model urządzenia, które w chwili
    zwarcia wycofuje wsparcie. Rzeczywisty przekształtnik z ogranicznikiem oddaje
    prąd do wysokości limitu, więc duże ``k`` jest nastawą niefizyczną i to jest
    granica tej strategii, a nie jej strojenie.
    """
    strategia = KandydatOgraniczeniaImpedancjaWirtualna(i_max_pu=I_MAX, k_impedancji_pu=1.0)
    wynik = przebieg(strategia, x_f_pu=0.05)
    i_przed = wartosc_w_chwili(wynik, "i_pu", "D", 0.40)
    i_w_zwarciu = wartosc_w_chwili(wynik, "i_pu", "D", 0.60)
    assert i_w_zwarciu < i_przed, f"i(0,40 s)={i_przed:.4f} i(0,60 s)={i_w_zwarciu:.4f}"
    assert i_w_zwarciu < 0.5 * I_MAX, i_w_zwarciu
    # Nasycenie zadania na tym samym zwarciu oddaje pełny limit — kontrast jest istotą.
    nasycenie = przebieg(NASYCENIE, x_f_pu=0.05)
    assert wartosc_w_chwili(nasycenie, "i_pu", "D", 0.60) > i_w_zwarciu + 0.5


# --- 4. Badanie numeryczne ------------------------------------------------------


def _prog_delta(falownik: FalownikGFM, v_szyny: complex) -> float:
    """Kąt, przy którym ``|I_0|`` dokładnie sięga progu ogranicznika (bisekcja)."""
    dol, gora = 0.0, 1.2
    for _ in range(200):
        srodek = 0.5 * (dol + gora)
        x = np.array([srodek, 1.0, 0.6, 0.0], dtype=np.float64)
        if abs(falownik.prad_bez_ogranicznika(x, v_szyny)) < I_MAX:
            dol = srodek
        else:
            gora = srodek
    return 0.5 * (dol + gora)


def test_ograniczenie_pradu_jest_ciagle_ale_nie_rozniczkowalne() -> None:
    """Najważniejszy pomiar numeryczny: NIE ma skoku ``f``, JEST skok jakobianu.

    Ogranicznik jest klasycznym podejrzanym o nieciągłość równań. Pomiar
    rozstrzyga to na dwie części:

      - CIĄGŁOŚĆ: ``||f(δ+ε) − f(δ−ε)||`` maleje LINIOWO z ``ε`` (zmierzone 10,0×
        na dekadę dla każdego wariantu) — różnica pochodzi z nachylenia, nie ze
        skoku; funkcja jest ciągła także w progu.
      - RÓŻNICZKOWALNOŚĆ: pochodna jednostronna ``d f/d δ`` SKACZE na progu —
        zmierzone 0,009 bez ogranicznika (szum różnicowania) wobec 97,8
        (``k = 0,10``), 195,6 (``k = 0,20``) i 247,9 (nasycenie). Skok rośnie
        LINIOWO z ``k``, co zgadza się z ``g'`` po prawej stronie progu.

    Wniosek dla architektury: jakobian jest nieciągły, więc metody niejawne mogą
    (choć tu nie musiały) mieć kłopot dokładnie w chwili wejścia ogranicznika.
    """
    v_szyny = complex(0.9, 0.0)
    skoki_jednostronne = {}
    for nazwa, strategia in (("bez ogranicznika", None), *STRATEGIE):
        falownik = FalownikGFM(ref="D", szyna="DER", ogranicznik=strategia)
        falownik.p_ref_pu, falownik.q_ref_pu, falownik.e_ref_pu = 0.6, 0.0, 1.05
        prog = _prog_delta(falownik, v_szyny)

        def f(delta: float, urzadzenie=falownik) -> np.ndarray:
            return urzadzenie.pochodne(np.array([delta, 1.0, 0.6, 0.0], dtype=np.float64), v_szyny)

        skoki = [
            float(np.max(np.abs(f(prog + eps) - f(prog - eps))))
            for eps in (1.0e-4, 1.0e-5, 1.0e-6, 1.0e-7)
        ]
        for mniejszy, wiekszy in zip(skoki[1:], skoki[:-1], strict=True):
            assert 9.0 < wiekszy / mniejszy < 11.0, f"{nazwa}: f ma SKOK, nie nachylenie: {skoki}"

        h = 1.0e-5
        nachylenie_lewe = (f(prog - h) - f(prog - 2 * h)) / h
        nachylenie_prawe = (f(prog + 2 * h) - f(prog + h)) / h
        skoki_jednostronne[nazwa] = float(np.max(np.abs(nachylenie_prawe - nachylenie_lewe)))

    assert skoki_jednostronne["bez ogranicznika"] < 0.1, skoki_jednostronne
    for nazwa, _ in STRATEGIE:
        assert skoki_jednostronne[nazwa] > 50.0, skoki_jednostronne
    # Skok jakobianu rośnie liniowo z wzmocnieniem impedancji (0,10 -> 0,20).
    iloraz = skoki_jednostronne["impedancja k=0,20"] / skoki_jednostronne["impedancja k=0,10"]
    assert 1.9 < iloraz < 2.1, skoki_jednostronne
    # Nasycenie zadania jest najtwardsze z badanych.
    assert skoki_jednostronne["nasycenie zadania"] > skoki_jednostronne["impedancja k=0,20"]


@pytest.mark.parametrize("x_f_pu", GLEBOKOSCI)
@pytest.mark.parametrize("integrator", sorted(INTEGRATORY))
def test_wszystkie_integratory_zbiegaja_z_ogranicznikiem(integrator: str, x_f_pu: float) -> None:
    """Iloczyn (strategia × głębokość × integrator): 32 biegi, wszystkie zbieżne.

    WYNIK NEGATYWNY, ZARAPORTOWANY JAKO WYNIK. Ograniczenie prądu jest typowym
    podejrzanym o rozbicie Newtona w metodach niejawnych — na TYM zadaniu to się
    NIE dzieje: zbiegają wszystkie cztery metody, dla obu strategii i obu
    głębokości zwarcia, a rozrzut ``I_max`` między metodami nie przekracza 2 %.
    Kłopot ze zbieżnością pojawia się gdzie indziej i ma inną przyczynę — patrz
    ``test_zwarcie_bliskie_metalicznemu_lamie_nasycenie_a_nie_impedancje``
    (algebra sieci, nie integrator).
    """
    for nazwa, strategia in STRATEGIE:
        wynik = przebieg(strategia, x_f_pu=x_f_pu, integrator=integrator, czas_koncowy_s=0.8)
        diagnostyka = wynik.diagnostyka
        assert diagnostyka.zbiegl, (
            f"{nazwa} x_f={x_f_pu} {integrator}: "
            f"{diagnostyka.blad.klasa} w fazie {diagnostyka.blad.faza} "
            f"w t={diagnostyka.blad.czas_s:.4f} s"
        )
        i_max = zmierz(wynik).i_max_pu
        kres = strategia.kres_pradu_pu(Z_WIRTUALNA)
        assert i_max <= kres + 1.0e-9, f"{nazwa} {integrator}: {i_max:.4f} > {kres:.4f}"
        odniesienie = zmierz(
            przebieg(strategia, x_f_pu=x_f_pu, integrator="rk4", czas_koncowy_s=0.8)
        ).i_max_pu
        assert (
            abs(i_max - odniesienie) / odniesienie < 0.02
        ), f"{nazwa} {integrator}: I_max={i_max:.4f} vs RK4 {odniesienie:.4f}"


def test_zwarcie_bliskie_metalicznemu_lamie_nasycenie_a_nie_impedancje() -> None:
    """Tu ogranicznik REALNIE psuje zbieżność — ale algebry sieci, nie integratora.

    Źródło prądowe wpięte w niemal zerową impedancję zwarcia zostawia napięcie
    szyny bez dobrze uwarunkowanego rozwiązania: iteracja sieci przestaje zbiegać.
    Zmierzone: model bez ogranicznika i obie nastawy impedancji wirtualnej liczą
    się do zwarcia METALICZNEGO (``x_f = 0``) włącznie; nasycenie zadania
    (``i_max = 1,2``) pada poniżej progu zawężonego bisekcją do przedziału
    podanego w komunikacie asercji. Próg rośnie z limitem prądowym — im większy
    prąd wymuszony, tym płytsze zwarcie wystarczy.
    """
    for nazwa, strategia in (
        ("bez ogranicznika", None),
        ("impedancja k=0,10", MIEKKI),
        ("impedancja k=0,20", TWARDY_IMPEDANCYJNY),
    ):
        for x_f_pu in (0.05, 0.01, 0.0):
            wynik = przebieg(strategia, x_f_pu=x_f_pu, czas_koncowy_s=0.7)
            assert wynik.diagnostyka.zbiegl, f"{nazwa} x_f={x_f_pu}: {wynik.diagnostyka.blad}"

    def zbiega(i_max_pu: float, x_f_pu: float) -> bool:
        wynik = przebieg(
            KandydatOgraniczeniaNasycenieZadania(i_max_pu=i_max_pu),
            x_f_pu=x_f_pu,
            czas_koncowy_s=0.7,
        )
        if not wynik.diagnostyka.zbiegl:
            assert (
                wynik.diagnostyka.blad.klasa == "BrakZbieznosciSieciError"
            ), wynik.diagnostyka.blad
        return wynik.diagnostyka.zbiegl

    # Monotoniczność: większy wymuszony prąd = wcześniejsza utrata zbieżności.
    assert zbiega(0.9, 0.003), "i_max=0,9 miało jeszcze zbiegać przy x_f=0,003"
    assert not zbiega(1.2, 0.003), "i_max=1,2 miało już nie zbiegać przy x_f=0,003"
    assert zbiega(1.2, 0.01), "i_max=1,2 miało zbiegać przy x_f=0,01"
    assert not zbiega(1.5, 0.01), "i_max=1,5 miało już nie zbiegać przy x_f=0,01"

    dol, gora = 0.003, 0.01  # dol: nie zbiega, gora: zbiega
    for _ in range(8):
        srodek = 0.5 * (dol + gora)
        if zbiega(1.2, srodek):
            gora = srodek
        else:
            dol = srodek
    assert 0.004 < dol < gora < 0.005, (
        f"Próg zbieżności nasycenia (i_max=1,2) zmierzony w przedziale "
        f"({dol:.6f}, {gora:.6f}) p.u."
    )


def test_ogranicznik_oslabia_sztywnosc_a_ranking_zalezy_od_glebokosci() -> None:
    """Zmiana charakteru źródła — zmierzona jako ``|dU/dP|``, a nie opowiedziana.

    Trzy fakty naraz, bo dopiero razem są uczciwe:

      1. ogranicznik NIEAKTYWNY nie zmienia sztywności (0,0201 dla wszystkich —
         co do bitu, bo nie wykonuje żadnej operacji);
      2. ogranicznik AKTYWNY osłabia sztywność KAŻDEJ strategii — falownik
         przestaje trzymać napięcie zacisków tak jak źródło napięciowe;
      3. RANKING strategii ZALEŻY od głębokości zwarcia: przy ``x_f = 0,05``
         najgorsze jest nasycenie zadania (0,0971 wobec 0,0571 dla ``k = 0,10``),
         a przy ``x_f = 0,01`` odwrotnie — nasycenie 0,1677 wobec 1,081 dla
         ``k = 0,20``. Zdanie „strategia X zachowuje charakter źródła
         napięciowego" jest więc nieprawdziwe bez podania punktu pracy.
    """
    bez_zwarcia = {
        nazwa: sztywnosc_napieciowa_pu(strategia, x_f_pu=None)[0]
        for nazwa, strategia in (("bez ogranicznika", None), *STRATEGIE)
    }
    odniesienie = bez_zwarcia["bez ogranicznika"]
    for nazwa, wartosc in bez_zwarcia.items():
        assert wartosc == odniesienie, f"{nazwa}: {wartosc} != {odniesienie}"

    zmierzone: dict[float, dict[str, float]] = {}
    for x_f_pu in GLEBOKOSCI:
        zmierzone[x_f_pu] = {}
        for nazwa, strategia in (("bez ogranicznika", None), *STRATEGIE):
            sztywnosc, prad = sztywnosc_napieciowa_pu(strategia, x_f_pu=x_f_pu)
            zmierzone[x_f_pu][nazwa] = sztywnosc
            if strategia is not None:
                assert prad <= strategia.kres_pradu_pu(Z_WIRTUALNA) + 1.0e-9, (nazwa, prad)
        baza = zmierzone[x_f_pu]["bez ogranicznika"]
        for nazwa, _ in STRATEGIE:
            assert zmierzone[x_f_pu][nazwa] > baza, (
                f"x_f={x_f_pu} {nazwa}: |dU/dP|={zmierzone[x_f_pu][nazwa]:.5f} "
                f"nie jest gorsze od {baza:.5f} bez ogranicznika"
            )

    assert zmierzone[0.05]["nasycenie zadania"] > zmierzone[0.05]["impedancja k=0,10"], zmierzone
    assert zmierzone[0.01]["nasycenie zadania"] < zmierzone[0.01]["impedancja k=0,20"], zmierzone


@pytest.mark.parametrize("trwanie_s", (0.15, 0.5))
def test_ogranicznik_skraca_najdluzsze_zwarcie_z_synchronizmem(trwanie_s: float) -> None:
    """Iloczyn (strategia × czas trwania zwarcia): ogranicznik ODBIERA odporność kątową.

    Mechanizm jest fizyczny, nie numeryczny: ogranicznik zabiera moc czynną
    oddawaną w czasie zwarcia (skrajnie: ``P = 0`` przy nasyceniu z priorytetem
    biernej), więc falownik przyspiesza pełnym ``P_ref/2H`` i kąt ucieka.
    Zmierzone przy ``x_f = 0,01`` (okno 2 s, RK4, krok 2 ms):

      - zwarcie 0,15 s: synchronizm zachowany przez WSZYSTKIE warianty
        (wybieg kąta 11,3° bez ogranicznika, 19,0° / 24,3° / 22,2° z nim);
      - zwarcie 0,50 s: bez ogranicznika nadal zachowany (53,6°), a każda
        strategia go traci — impedancyjne przez poślizg kąta (503,6° i 572,7°),
        nasycenie przez awarię solvera (``BrakZbieznosciSieciError`` jeszcze w
        czasie trwania zwarcia).
    """
    bez = przebieg(None, x_f_pu=0.01, trwanie_s=trwanie_s, czas_koncowy_s=2.0)
    assert not stracil_synchronizm(bez), zmierz(bez)

    for nazwa, strategia in STRATEGIE:
        wynik = przebieg(strategia, x_f_pu=0.01, trwanie_s=trwanie_s, czas_koncowy_s=2.0)
        if trwanie_s == 0.15:
            assert not stracil_synchronizm(wynik), f"{nazwa}: {zmierz(wynik)}"
            assert (
                zmierz(wynik).wybieg_delta_deg > zmierz(bez).wybieg_delta_deg
            ), f"{nazwa}: ogranicznik miał POWIĘKSZYĆ wybieg kąta"
        else:
            assert stracil_synchronizm(wynik), f"{nazwa}: {zmierz(wynik)}"
            if strategia is NASYCENIE:
                blad = wynik.diagnostyka.blad
                assert blad is not None and blad.klasa == "BrakZbieznosciSieciError", blad
                assert blad.faza == "calkowanie", blad
                assert (
                    0.5 < blad.czas_s < 0.5 + trwanie_s
                ), f"awaria miała nastąpić w czasie trwania zwarcia: t={blad.czas_s:.4f} s"
            else:
                delta = _serie(wynik, "delta_rad", "D")
                assert np.degrees(np.max(np.abs(delta - delta[0]))) > 180.0, nazwa


def test_tozsamosc_modelu_rozroznia_strategie_ogranicznika() -> None:
    """Dwa biegi różnymi strategiami MUSZĄ mieć różny odcisk parametrów.

    Bez tego porównanie „ten sam model, inna strategia" byłoby nieodróżnialne w
    śladzie wyniku — a to jest ta sama klasa defektu, przed którą broni
    ``TozsamoscModelu.odcisk_parametrow``.
    """
    odciski = {}
    for nazwa, strategia in (("bez ogranicznika", None), *STRATEGIE):
        wynik = przebieg(strategia, x_f_pu=0.05, czas_koncowy_s=0.7)
        (model,) = wynik.modele
        odciski[nazwa] = model.odcisk_parametrow
    assert len(set(odciski.values())) == len(odciski), odciski

    powtorzony = FalownikGFM(ref="D", szyna="DER", ogranicznik=NASYCENIE)
    kopia = FalownikGFM(
        ref="D", szyna="DER", ogranicznik=KandydatOgraniczeniaNasycenieZadania(i_max_pu=I_MAX)
    )
    assert powtorzony.tozsamosc_ogranicznika == kopia.tozsamosc_ogranicznika
    assert (
        powtorzony.tozsamosc_ogranicznika
        != FalownikGFM(ref="D", szyna="DER", ogranicznik=MIEKKI).tozsamosc_ogranicznika
    )
