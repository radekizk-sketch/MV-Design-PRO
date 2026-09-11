"""Czas zdarzeń, koniec przedziału i FORENSYKA niepowodzenia solvera.

KOD BADAWCZY — patrz `backend/research/README.md`.

Trzy defekty ŚLADU (nie dokładności), znalezione w przeglądzie kontradyktoryjnym
tego laboratorium. Każdy polegał na tym, że wynik twierdził coś, czego nie zrobił:

1. **Czas zdarzenia.** Zdarzenie stosowano na najbliższym późniejszym punkcie
   siatki, a w śladzie zapisywano czas NOMINALNY. Dla ``dt = 2 ms`` i zdarzenia
   w ``103 ms`` ślad mówił „103 ms", model zmieniał się w ``104 ms``.
2. **Koniec przedziału.** ``n = round(Tend/dt)``, ``t = k·dt`` — dla
   ``Tend = 1,003 s`` i ``dt = 5 ms`` przebieg kończył się w ``1,005 s``.
3. **Przyczyna niepowodzenia.** Każde niepowodzenie redukowano do jednego
   ``zbiegl = False``; rozjechany Newton, osobliwa sieć i NaN z modelu były
   nierozróżnialne.

Testy niżej padłyby na wersji sprzed naprawy.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pytest
from dynamic_lab.benchmarki import smib
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.zdarzenia import (
    HarmonogramZdarzen,
    NieobslugiwaneZdarzenieError,
    ZdjecieZwarcia,
    ZwarcieNiesymetryczne,
    ZwarcieTrojfazowe,
)


def _silnik(krok_s: float = 0.002, integrator: str = "rk4"):
    model, moce = smib()
    silnik = SilnikRMS(model, integrator=integrator, krok_s=krok_s)
    return silnik, silnik.inicjalizuj(moce)


# ---------------------------------------------------------------------------
# E1 / E3 — zdarzenie DOKŁADNIE w swojej chwili, także poza siatką
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("czas_zdarzenia", "krok_s"),
    [
        (0.103, 0.002),  # 51,5 kroku — świadomie NIE na siatce
        (0.0035, 0.001),
        (0.2501, 0.005),
        (0.1, 0.002),  # dokładnie na siatce — nie wolno tego zepsuć
    ],
)
def test_zdarzenie_stosowane_dokladnie_w_swojej_chwili(czas_zdarzenia, krok_s) -> None:
    silnik, x0 = _silnik(krok_s=krok_s)
    harmonogram = HarmonogramZdarzen(
        [ZwarcieTrojfazowe(czas_s=czas_zdarzenia, szyna="GEN", x_f_pu=0.05)]
    )
    wynik = silnik.symuluj(x0, czas_koncowy_s=0.5, harmonogram=harmonogram)
    assert len(wynik.zdarzenia) == 1
    zapis = wynik.zdarzenia[0]
    assert zapis["czas_zastosowania_s"] == pytest.approx(czas_zdarzenia, abs=1e-12)
    assert zapis["blad_czasu_s"] == pytest.approx(0.0, abs=1e-12)


def test_slad_zdarzenia_niesie_czas_nominalny_I_faktyczny() -> None:
    """Ślad musi pozwalać ODRÓŻNIĆ jedno od drugiego, nawet gdy są równe.

    Zapisywanie samego czasu nominalnego było defektem semantyki: ślad nie
    pozwalał sprawdzić, czy model naprawdę zmienił się wtedy, kiedy twierdzi.
    """
    silnik, x0 = _silnik(krok_s=0.002)
    harmonogram = HarmonogramZdarzen([ZwarcieTrojfazowe(czas_s=0.103, szyna="GEN", x_f_pu=0.05)])
    zapis = silnik.symuluj(x0, czas_koncowy_s=0.3, harmonogram=harmonogram).zdarzenia[0]
    assert set(zapis) >= {"czas_s", "czas_zastosowania_s", "blad_czasu_s", "typ", "opis"}


def test_chwila_zdarzenia_jest_punktem_siatki() -> None:
    silnik, _ = _silnik(krok_s=0.002)
    harmonogram = HarmonogramZdarzen(
        [
            ZwarcieTrojfazowe(czas_s=0.103, szyna="GEN"),
            ZdjecieZwarcia(czas_s=0.187, szyna="GEN"),
        ]
    )
    siatka = silnik.siatka_czasu(0.5, harmonogram)
    for t in (0.103, 0.187):
        assert any(abs(t - punkt) < 1e-12 for punkt in siatka), f"brak {t} na siatce"
    assert siatka == sorted(siatka)
    assert len(siatka) == len(set(siatka))


def test_skrocenie_krokow_jest_raportowane() -> None:
    """Ile kroków skrócono, żeby trafić w zdarzenia — to informacja numeryczna."""
    silnik, x0 = _silnik(krok_s=0.002)
    harmonogram = HarmonogramZdarzen(
        [
            ZwarcieTrojfazowe(czas_s=0.103, szyna="GEN", x_f_pu=0.05),
            ZdjecieZwarcia(czas_s=0.187, szyna="GEN"),
        ]
    )
    wynik = silnik.symuluj(x0, czas_koncowy_s=0.5, harmonogram=harmonogram)
    assert wynik.diagnostyka.kroki_skrocone >= 2


def test_zdarzenie_na_siatce_nie_skraca_krokow() -> None:
    silnik, x0 = _silnik(krok_s=0.002)
    harmonogram = HarmonogramZdarzen([ZwarcieTrojfazowe(czas_s=0.100, szyna="GEN")])
    wynik = silnik.symuluj(x0, czas_koncowy_s=0.5, harmonogram=harmonogram)
    assert wynik.diagnostyka.kroki_skrocone == 0


# ---------------------------------------------------------------------------
# R1 — koniec przedziału DOKŁADNIE tam, gdzie zażądano
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("czas_koncowy_s", "krok_s"),
    [(1.003, 0.005), (0.333, 0.010), (0.5, 0.002), (0.07, 0.003), (2.0, 0.005)],
)
def test_symulacja_konczy_sie_dokladnie_w_zadanej_chwili(czas_koncowy_s, krok_s) -> None:
    silnik, x0 = _silnik(krok_s=krok_s)
    wynik = silnik.symuluj(x0, czas_koncowy_s=czas_koncowy_s)
    assert wynik.czas_s[-1] == pytest.approx(czas_koncowy_s, abs=1e-12)
    assert wynik.diagnostyka.czas_osiagniety_s == pytest.approx(czas_koncowy_s, abs=1e-12)


def test_siatka_nie_przekracza_zadanego_konca() -> None:
    silnik, _ = _silnik(krok_s=0.005)
    siatka = silnik.siatka_czasu(1.003, HarmonogramZdarzen([]))
    assert max(siatka) == pytest.approx(1.003, abs=1e-12)
    assert siatka[0] == 0.0


def test_zerowy_czas_koncowy_jest_odrzucany() -> None:
    silnik, x0 = _silnik()
    with pytest.raises(ValueError, match="dodatni"):
        silnik.symuluj(x0, czas_koncowy_s=0.0)


# ---------------------------------------------------------------------------
# Q1 — forensyka niepowodzenia zamiast jednego Boolean
# ---------------------------------------------------------------------------


@dataclass
class _UrzadzenieZwracajaceNan:
    """Urządzenie testowe psujące się w zadanej chwili — deterministycznie.

    JEST DATAKLASĄ ŚWIADOMIE. Od wpięcia rekurencyjnej tożsamości parametrów
    (`tozsamosc.odcisk`) urządzenie musi mieć postać kanoniczną — inaczej wynik
    nie potrafi podać jego odcisku i operacja kończy się
    `NieserializowalnyParametrError`. Zwykła klasa z `__init__` tego nie spełnia.

    To NIE jest obejście pod test, tylko wyrównanie atrapy do kontraktu, który
    spełniają wszystkie urządzenia laboratorium: dzięki temu atrapa ćwiczy tę
    samą ścieżkę odcisku, co model produkcyjny, zamiast omijać ją przez bycie
    innym rodzajem obiektu. Gdyby ktoś napisał REALNE urządzenie jako zwykłą
    klasę, dostanie ten sam błąd — i tak ma być, bo odcisk liczony z `vars()`
    był ślepy na obiekty zagnieżdżone.
    """

    ref: str
    szyna: str

    def nazwy_stanow(self) -> tuple[str, ...]:
        return ("stan_a", "stan_b")

    def pochodne(self, x, v_szyny):  # noqa: ANN001
        return np.array([float("nan"), 0.0])

    def wstrzykniecie(self, x, v_szyny):  # noqa: ANN001
        return complex(0.0, 0.0)

    def inicjalizuj(self, v_szyny, s_zadane):  # noqa: ANN001
        return np.array([0.0, 0.0])


def test_nan_z_modelu_jest_zlokalizowany_co_do_stanu() -> None:
    """„Model wyrzucił NaN" musi wskazywać KTÓRY stan, nie tylko że coś padło."""
    topo = TopologiaSieci(
        szyny=("A", "SYS"),
        galezie=[Galaz("A", "SYS", 0.01, 0.10)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    model = ModelDynamiczny(topologia=topo, urzadzenia=[_UrzadzenieZwracajaceNan("U1", "A")])
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.01, tolerancja_rownowagi=1e9)
    wynik = silnik.symuluj(np.array([0.0, 0.0]), czas_koncowy_s=0.1)
    blad = wynik.diagnostyka.blad
    assert wynik.diagnostyka.zbiegl is False
    assert blad is not None
    assert blad.faza == "calkowanie"
    assert blad.stan_skonczony is False
    assert "U1.stan_a" in blad.stany_niesksonczone
    assert "U1.stan_b" not in blad.stany_niesksonczone
    assert blad.czas_s > 0.0
    assert blad.krok_s == pytest.approx(0.01)


def test_wynik_zbiezny_nie_niesie_bledu() -> None:
    silnik, x0 = _silnik(krok_s=0.005)
    wynik = silnik.symuluj(x0, czas_koncowy_s=0.2)
    assert wynik.diagnostyka.zbiegl is True
    assert wynik.diagnostyka.blad is None


def test_diagnostyka_odrzuca_niespojna_pare_zbiegl_blad() -> None:
    """Kontrakt pilnuje sam siebie: `zbiegl=False` bez opisu błędu jest zakazane."""
    from dynamic_lab.wynik import DiagnostykaSolvera

    with pytest.raises(ValueError, match="MUSI nieść opis błędu"):
        DiagnostykaSolvera(
            integrator="rk4",
            krok_s=0.01,
            liczba_krokow=10,
            ewaluacje_pochodnych=40,
            maks_residuum_sieci=0.0,
            maks_iteracji_sieci=1,
            zbiegl=False,
            norma_pochodnej_w_t0=0.0,
            blad=None,
        )


def test_blad_wchodzi_do_odcisku_wyniku() -> None:
    """Odcisk musi rozróżniać bieg zakończony sukcesem od zakończonego błędem."""
    topo = TopologiaSieci(
        szyny=("A", "SYS"),
        galezie=[Galaz("A", "SYS", 0.01, 0.10)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    model = ModelDynamiczny(topologia=topo, urzadzenia=[_UrzadzenieZwracajaceNan("U1", "A")])
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.01, tolerancja_rownowagi=1e9)
    wynik = silnik.symuluj(np.array([0.0, 0.0]), czas_koncowy_s=0.1)
    slownik = wynik.to_dict()
    assert slownik["diagnostyka"]["blad"]["klasa"] == "NieskonczonyStanError"
    assert slownik["diagnostyka"]["blad"]["stany_niesksonczone"] == ["U1.stan_a"]


# ---------------------------------------------------------------------------
# F1 — semantyka zwarcia
# ---------------------------------------------------------------------------


def test_zwarcie_niesymetryczne_jest_glosno_nieobslugiwane() -> None:
    """Zwarcie 1F wymaga Z1/Z2/Z0 — model liczy tylko składową zgodną.

    Podstawienie w jego miejsce zwarcia trójfazowego byłoby fabrykacją: dałoby
    liczbę wyglądającą na wynik, policzoną dla innego zwarcia.
    """
    silnik, x0 = _silnik(krok_s=0.005)
    harmonogram = HarmonogramZdarzen([ZwarcieNiesymetryczne(czas_s=0.1, szyna="GEN", rodzaj="1F")])
    with pytest.raises(NieobslugiwaneZdarzenieError, match="Z1/Z2/Z0"):
        silnik.symuluj(x0, czas_koncowy_s=0.3, harmonogram=harmonogram)


def test_typ_zwarcia_w_sladzie_nazywa_zwarcie_trojfazowe() -> None:
    """Nazwa typu jest jedyną informacją o rodzaju zwarcia, która trafia do śladu."""
    silnik, x0 = _silnik(krok_s=0.005)
    harmonogram = HarmonogramZdarzen([ZwarcieTrojfazowe(czas_s=0.1, szyna="GEN")])
    wynik = silnik.symuluj(x0, czas_koncowy_s=0.3, harmonogram=harmonogram)
    assert wynik.zdarzenia[0]["typ"] == "ZwarcieTrojfazowe"
    assert "trójfazowe" in str(wynik.zdarzenia[0]["opis"])
