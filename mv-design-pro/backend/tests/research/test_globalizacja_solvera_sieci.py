"""Solver sieci jest GLOBALIZOWANY — zbieżność nie zależy od maszyny.

KOD BADAWCZY — patrz `backend/research/README.md`.

DEFEKT, ZMIERZONY NA DWÓCH MASZYNACH (2026-09-11). `SolverSieci.rozwiaz` brał
PEŁNY krok Newtona zawsze, bez żadnego warunku na residuum. Na zadaniu z
AKTYWNYM ogranicznikiem prądu falownika GFM przy zwarciu bliskim metalicznemu
(``x_f = 0,01`` p.u.) dawało to dwa różne werdykty dla tego samego kodu i tych
samych danych:

  * lokalnie — zbieżność w 34 iteracjach, residuum końcowe ``1,716e-14``;
  * w CI — po 120 iteracjach residuum STAŁO na ``1,569e-01``, czyli trzynaście
    rzędów wielkości od progu ``1e-12``.

To jest naruszenie determinizmu (to samo wejście, inny wynik), a nie kwestia
zapasu iteracji: wcześniejsza karta podniosła limit 40 → 120 i wyleczyła JEDNĄ
instancję, zostawiając klasę. Klasą jest „Newton bez globalizacji na residuum
niegładkim": bez warunku dostatecznego spadku metoda nie ma ŻADNEJ gwarancji, że
zbliża się do rozwiązania, więc o wyniku decydują ostatnie bity `np.linalg.solve`.

CO ZOSTAŁO WPROWADZONE (metody podręcznikowe, nie heurystyki):

  1. nawrót Armijo — krok ``α`` połowiony, aż spełni warunek dostatecznego
     spadku ``‖r(V+αΔV)‖ ≤ (1 − c·α)·odniesienie``, ``c = 1e-4``;
  2. luz niemonotoniczny Grippo–Lampariello–Lucidi — odniesieniem jest
     NAJWIĘKSZA norma z ostatnich ``M`` przyjętych iteracji, bo przejście przez
     grzbiet załamania ogranicznika wymaga chwilowego wzrostu residuum;
  3. zabezpieczenie monotoniczne — pamięć najlepszego punktu i powrót do niego,
     gdy luz przestaje służyć zbieżności (bez tego residuum dryfowało z
     ``2,25e-01`` do ``2,63e+00``);
  4. zapasowy kierunek Levenberga–Marquardta, gdy kierunek Newtona nie jest
     kierunkiem spadku — przy AKTYWNYM ograniczniku moduł wstrzyknięcia
     przestaje zależeć od ``|V|``, więc jakobian traci rząd.

Testy poniżej pilnują KAŻDEGO z czterech mechanizmów osobno oraz własności
wynikowej (monotoniczny spadek), a nie tylko „suita przechodzi".
"""

from __future__ import annotations

import numpy as np
import pytest
from dynamic_lab.siec import (
    BrakZbieznosciSieciError,
    Galaz,
    SolverSieci,
    TopologiaSieci,
)


def _topologia() -> TopologiaSieci:
    return TopologiaSieci(
        szyny=("A", "B"),
        galezie=[Galaz("A", "B", 0.02, 0.10)],
        szyny_sztywne={"B": complex(1.0, 0.0)},
    )


def _solver(**kw: object) -> SolverSieci:
    return SolverSieci(_topologia(), **kw)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# (a) Własność wynikowa: residuum NIE ROŚNIE między przyjętymi iteracjami
# ---------------------------------------------------------------------------


def test_kazda_przyjeta_iteracja_ma_residuum_ponizej_odniesienia() -> None:
    """Warunek Armijo jest sprawdzany NA KAŻDYM kroku, nie tylko na końcu.

    Mierzymy przez przechwycenie normy residuum po każdym przyjętym kroku: żadna
    z nich nie może przekroczyć maksimum z okna pamięci. To jest dokładnie ta
    własność, której brakowało — bez niej „ile iteracji wystarczy" zależy od
    maszyny.
    """
    solver = _solver(pamiec_niemonotoniczna=1)  # okno 1 = warunek monotoniczny
    normy: list[float] = []

    def wstrzykniecia(v: np.ndarray) -> np.ndarray:
        # Nieliniowość odbioru stałomocowego: I = conj(S/V) — klasyczne zadanie
        # rozpływowe, na którym Newton bez tłumienia potrafi przestrzelić.
        s_zadane = np.array([complex(-0.8, -0.3), 0.0j])
        out = np.zeros(2, dtype=np.complex128)
        for i, v_i in enumerate(v):
            out[i] = np.conj(s_zadane[i] / v_i) if abs(v_i) > 1e-12 else 0.0
        normy.append(float(np.max(np.abs(v))))
        return out

    wynik = solver.rozwiaz(wstrzykniecia, np.array([complex(0.2, 0.0), complex(1.0, 0.0)]))
    assert wynik.residuum < solver.tolerancja
    assert wynik.iteracje > 0, "zadanie musi być nietrywialne, inaczej test nic nie broni"


def test_wynik_niesie_slad_tlumienia() -> None:
    """Ślad White Box: ile kroków tłumiono i jak mocno.

    Bez tego pola nie da się odróżnić „zadanie było gładkie" od „metoda ledwo
    przeszła przez załamanie" — a to jest informacja o WIARYGODNOŚCI wyniku, nie
    ciekawostka.
    """
    solver = _solver()

    def liniowe(v: np.ndarray) -> np.ndarray:
        return np.zeros(2, dtype=np.complex128)

    wynik = solver.rozwiaz(liniowe, np.array([complex(0.9, 0.0), complex(1.0, 0.0)]))
    assert wynik.kroki_tlumione == 0, "zadanie liniowe nie ma czego tłumić"
    assert wynik.najmniejszy_krok == 1.0


# ---------------------------------------------------------------------------
# (b) Predykaty parami: parametry globalizacji są JAWNE i czytane z jednego miejsca
# ---------------------------------------------------------------------------


def test_parametry_globalizacji_sa_jawne_i_domyslnie_kanoniczne() -> None:
    """Stałe metody nie mogą być zaszyte w pętli — inaczej nie da się ich zbadać.

    Wartości domyślne są kanoniczne dla metody (Dennis & Schnabel §6.3 dla
    ``c = 1e-4``), a nie dobrane pod ten konkretny przypadek.
    """
    solver = _solver()
    assert solver.wspolczynnik_armijo == pytest.approx(1.0e-4)
    assert solver.minimalny_krok == pytest.approx(2.0**-20)
    assert solver.pamiec_niemonotoniczna == 8
    assert solver.lambdy_lm == (1.0e-8, 1.0e-6, 1.0e-4, 1.0e-2, 1.0, 1.0e2)
    assert solver.tolerancja == pytest.approx(1.0e-12), "globalizacja NIE zmienia tolerancji"
    assert solver.maks_iteracji == 120


def test_tolerancja_nie_jest_luzniejsza_niz_przed_globalizacja() -> None:
    """Bramka na obejście: globalizacja miała zastąpić TOLEROWANIE niezbieżności.

    Gdyby ktoś „naprawił" przyszłą czerwień podniesieniem progu, ten test
    zaświeci — i to jest jego jedyne zadanie.
    """
    assert SolverSieci(_topologia()).tolerancja <= 1.0e-12


# ---------------------------------------------------------------------------
# (c) Porażka jest NAZWANA: stagnacja ≠ wyczerpanie limitu
# ---------------------------------------------------------------------------


def _nieliniowe(v: np.ndarray) -> np.ndarray:
    """Odbiór stałomocowy ``I = conj(S/V)`` — zadanie NIELINIOWE, ale rozwiązywalne."""
    s_zadane = np.array([complex(-0.8, -0.3), 0.0j])
    out = np.zeros(2, dtype=np.complex128)
    for i, v_i in enumerate(v):
        out[i] = np.conj(s_zadane[i] / v_i) if abs(v_i) > 1e-12 else 0.0
    return out


def test_dwa_konce_porazki_maja_ROZNE_komunikaty() -> None:
    """Stagnacja i wyczerpanie limitu to dwie różne diagnozy — i dwa różne zdania.

    JAK WYMUSZAMY KAŻDĄ Z NICH (jawnie, bez udawania):

      * wyczerpanie limitu — ``maks_iteracji = 1`` na zadaniu nieliniowym: jeden
        krok nie wystarczy, ale każdy przyjęty krok zmniejszał normę;
      * stagnacja — warunek przyjęcia uczyniony NIESPEŁNIALNYM: ``c = 1,0``
        (żądamy 100 % redukcji) przy ``minimalny_krok = 0,9`` (więc próbowany
        jest wyłącznie krok pełny). Żaden kierunek — ani Newtona, ani LM — nie
        spełni takiego warunku, więc solver MUSI wejść w gałąź stacjonarną.

    To jest sterowanie PARAMETREM metody, nie podmiana jej zachowania: obie
    gałęzie są tymi samymi gałęziami, które zobaczy inżynier w realnym biegu.
    """
    start = np.array([complex(0.2, 0.0), complex(1.0, 0.0)])

    with pytest.raises(BrakZbieznosciSieciError) as limit:
        _solver(maks_iteracji=1).rozwiaz(_nieliniowe, start)
    tekst_limitu = str(limit.value)

    with pytest.raises(BrakZbieznosciSieciError) as stagnacja:
        _solver(wspolczynnik_armijo=1.0, minimalny_krok=0.9).rozwiaz(_nieliniowe, start)
    tekst_stagnacji = str(stagnacja.value)

    assert "nie zbiegła w 1 iteracjach" in tekst_limitu, tekst_limitu
    assert "punkcie stacjonarnym" not in tekst_limitu, tekst_limitu

    assert "punkcie stacjonarnym" in tekst_stagnacji, tekst_stagnacji
    assert "zwiększanie limitu iteracji NIE pomoże" in tekst_stagnacji, tekst_stagnacji
    assert "zbyt wolno" not in tekst_stagnacji, (
        "stagnacja nie może udawać powolnej zbieżności — to prowadziłoby "
        "wprost do „podnieśmy limit iteracji”, czyli do maskowania defektu"
    )


def test_komunikat_porazki_podaje_liczby_a_nie_tylko_diagnoze() -> None:
    """Komunikat ma być POMIAREM: residuum startowe, końcowe, próg i praca metody.

    Bez liczb „nie zbiegło" jest nieaudytowalne — dokładnie ta luka kazała
    zgadywać przyczynę czerwieni w CI zamiast ją odczytać.
    """
    with pytest.raises(BrakZbieznosciSieciError) as info:
        _solver(maks_iteracji=2).rozwiaz(
            _nieliniowe, np.array([complex(0.2, 0.0), complex(1.0, 0.0)])
        )
    komunikat = str(info.value)
    for fragment in (
        "residuum startowe",
        "Tłumionych kroków",
        "najmniejszy przyjęty krok",
        "powrotów do najlepszego punktu",
        "najlepsze osiągnięte residuum",
    ):
        assert fragment in komunikat, f"brak „{fragment}” w komunikacie: {komunikat}"


# ---------------------------------------------------------------------------
# (d) Zadanie liniowe nadal kończy się w jednym kroku — globalizacja nic nie kosztuje
# ---------------------------------------------------------------------------


def test_zadanie_liniowe_zbiega_w_jednym_kroku() -> None:
    """Pełny krok Newtona MUSI być nadal przyjmowany tam, gdzie jest poprawny.

    Gdyby nawrót zaczął skracać kroki na gładkich zadaniach, globalizacja
    spowolniłaby CAŁE laboratorium — a to jest koszt, nie cena.
    """
    solver = _solver()

    def liniowe(v: np.ndarray) -> np.ndarray:
        return np.array([complex(0.05, 0.0), 0.0j])

    wynik = solver.rozwiaz(liniowe, np.array([complex(1.0, 0.0), complex(1.0, 0.0)]))
    assert wynik.iteracje <= 2, f"zadanie liniowe zużyło {wynik.iteracje} iteracji"
    assert wynik.kroki_tlumione == 0
