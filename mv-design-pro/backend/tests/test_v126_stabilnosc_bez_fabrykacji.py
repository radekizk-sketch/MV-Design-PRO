"""Stabilność napięciowa V12.6 nie liczy na zmyślonych współczynnikach (QU-FABRYKACJA).

BÓL (pomiar 2026-08-08, sieci odniesienia `sldSubstrate52s` = 315 szyn i
`demo_oze_sc` = 93 szyny). `_voltage_stability` podawał cztery rodziny wielkości
i KAŻDA stała na wejściu, którego model nie niesie:

* zapas mocy biernej — zdolność wytwórcza brana jako ``0,15 · P``, zapotrzebowanie
  jako ``0,35 · P``, podczas gdy ``bus.load_mvar`` istnieje w kontrakcie i jest
  używane w tym samym pliku; zdolności wytwórczej mocy biernej kontrakt NIE MA
  w ogóle (0 z 35 wytwórców niesie ``limits.q_min_mvar``, 0 — krzywą ``pq_curve``);
* margines P–U — ``1 + min(2,5; S_sc/P/20)``;
* wskaźnik L — ``P/S_sc · 4`` z obcięciem ``0,98``;
* wartość własna — ``(1 − L) · U_pu`` przy ``voltage_pu`` równym wartości
  domyślnej kontraktu dla 408 z 408 szyn.

Wspólne wejście wszystkich czterech — moc zwarciowa węzła — jest podane dla
1 z 315 i 1 z 93 szyn; dla reszty solver podstawiał ``max(25; U_n · 10)``.

TEN PLIK JEST JEDNOCZEŚNIE KONTROLĄ JAKOŚCI zdolności wycofanej z ekranu
(`tests/ci/test_v126_rodzaje_parytet.py::test_zdolnosc_wycofana_ma_kontrole_jakosci`):
rodzaj zszedł z okna projektanta, więc uruchamiany jest już tylko tutaj.

METODA: ILOCZYN CECH, nie przykład z karty. Defekt tej klasy chowa się w tym, że
naprawia się przypadek, w którym dane są ubogie, a zostawia gałąź „gdy dane są".
Dlatego testy przechodzą przez iloczyn
{moc zwarciowa podana · brak} × {moc bierna odbioru niezerowa · zerowa} ×
{generacja z mocą bierną · bez} — wraz z węzłem, który ma KOMPLET wszystkiego,
bo to właśnie na nim zaszyty współczynnik wyglądałby najbardziej wiarygodnie.
"""

from __future__ import annotations

import itertools
import re
from pathlib import Path
from typing import Any

import pytest
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import (
    V126AcademicInput,
    V126AnalysisType,
    V126BusInput,
    V126ConverterInput,
)

SOLVER_PY = Path(__file__).resolve().parents[1] / "src" / "network_model" / "solvers"
SOLVER_PY = SOLVER_PY / "v126_academic.py"

#: Wszystkie wielkości liczbowe kontraktu tej analizy — mapa
#: ścieżka → klucze liczbowe wiersza. Lista wyprowadzona z kontraktu odpowiedzi,
#: nie z karty: nowa wielkość dopisana do solvera bez decyzji nie prześlizgnie się
#: obok `test_kontrakt_nie_urosl_o_nowa_wielkosc`.
TABELE_LICZBOWE: dict[str, tuple[str, ...]] = {
    "pv_curves": ("lambda_max", "u_at_max", "margin_percent"),
    "qv_curves": ("q_min_mvar", "q_available_mvar", "margin_mvar"),
    "l_index_per_bus": ("l_index", "alert"),
}


def _model(**cechy: Any) -> V126AcademicInput:
    """Model jednowęzłowy o zadanych cechach — jeden punkt iloczynu cech."""
    bus = V126BusInput(
        ref="B1",
        name="Szyna SN",
        nominal_kv=15.0,
        voltage_pu=cechy.get("voltage_pu", 1.0),
        load_mw=cechy.get("load_mw", 0.0),
        load_mvar=cechy.get("load_mvar", 0.0),
        generation_mw=cechy.get("generation_mw", 0.0),
        generation_mvar=cechy.get("generation_mvar", 0.0),
        fault_level_mva=cechy.get("fault_level_mva"),
    )
    return V126AcademicInput(buses=[bus])


def _wynik(model: V126AcademicInput) -> dict[str, Any]:
    return V126AcademicSolver().run(V126AnalysisType.VOLTAGE_STABILITY, model)["result"]


# Iloczyn cech: 2 (moc zwarciowa) × 2 (moc bierna odbioru) × 2 (moc bierna generacji)
# × 2 (napięcie inne niż domyślne) = 16 kombinacji, w tym węzeł z KOMPLETEM danych.
_ILOCZYN_CECH = list(
    itertools.product(
        [None, 250.0],  # fault_level_mva: brak / podana
        [0.0, 0.45],  # load_mvar: zerowa / niezerowa (dana RZECZYWISTA w kontrakcie)
        [0.0, 0.30],  # generation_mvar: bez / z mocą bierną
        [1.0, 0.96],  # voltage_pu: domyślne / z modelu
    )
)


@pytest.mark.parametrize(("sk_mva", "q_odbioru", "q_generacji", "u_pu"), _ILOCZYN_CECH)
def test_zadna_wielkosc_nie_powstaje_z_wspolczynnika(
    sk_mva: float | None, q_odbioru: float, q_generacji: float, u_pu: float
) -> None:
    """ŻADNA kombinacja danych wejściowych nie wskrzesza liczby ze współczynnika.

    To jest sedno karty. Naprawa, która wyłącza fabrykację tylko przy ubogich
    danych, a przy bogatych podaje liczbę z tego samego wzoru, przeszłaby test
    napisany na jednym przykładzie. Ten iloczyn obejmuje też węzeł z KOMPLETEM
    (moc zwarciowa + moc bierna odbioru + moc bierna generacji + napięcie
    z modelu) — czyli dokładnie ten, na którym zaszyty współczynnik dałby wynik
    wyglądający wiarygodnie.
    """
    wynik = _wynik(
        _model(
            fault_level_mva=sk_mva,
            load_mw=1.4,
            load_mvar=q_odbioru,
            generation_mw=0.6,
            generation_mvar=q_generacji,
            voltage_pu=u_pu,
        )
    )

    for sciezka, klucze in TABELE_LICZBOWE.items():
        for wiersz in wynik[sciezka]:
            for klucz in klucze:
                assert wiersz[klucz] is None, (
                    f"{sciezka}.{klucz} = {wiersz[klucz]!r} — wielkość wróciła, "
                    "choć model nie niesie danych do jej wyznaczenia"
                )
    assert wynik["voltage_stability_margin_percent"] is None
    assert wynik["modal_analysis"]["smallest_eigenvalue"] is None
    assert wynik["modal_analysis"]["critical_mode"]["eigenvalue"] is None
    assert wynik["modal_analysis"]["critical_mode"]["participating_buses"] == []


def test_kontrola_dodatnia_iloczyn_cech_widzi_wartosci() -> None:
    """Kontrola dodatnia: iloczyn cech faktycznie dociera do wierszy wyniku.

    Bez tego cichy rozjazd (np. pusta lista węzłów po zmianie kontraktu wejścia)
    czyniłby wszystkie asercje powyżej bezprzedmiotowymi — pętla po pustym
    zbiorze zawsze przechodzi.
    """
    wynik = _wynik(_model(fault_level_mva=250.0, load_mw=1.4, load_mvar=0.45))
    for sciezka in TABELE_LICZBOWE:
        assert len(wynik[sciezka]) == 1, f"{sciezka}: brak wiersza dla jedynej szyny modelu"
        assert wynik[sciezka][0]["bus_ref"] == "B1"


@pytest.mark.parametrize("sciezka", sorted(TABELE_LICZBOWE))
def test_kazda_wycofana_wielkosc_niesie_powod_po_polsku(sciezka: str) -> None:
    """„Uczciwy brak bije zmyśloną obecność" — brak MUSI być nazwany, nie pusty.

    Wiersz z samymi `None` bez powodu byłby dla projektanta nieodróżnialny od
    awarii. Powód ma być merytoryczny (mówić, CZEGO brakuje), a nie odsyłać do
    zakresu karty — ta sama reguła, co w rejestrze wycofań frontu.
    """
    wynik = _wynik(_model(load_mw=1.4, load_mvar=0.45))
    for wiersz in wynik[sciezka]:
        powod = wiersz["brak_danych"]
        assert isinstance(powod, str) and len(powod) > 40, f"{sciezka}: powód pusty/hasłowy"
        assert "poza zakresem" not in powod.lower(), f"{sciezka}: odesłanie zamiast powodu"


def test_powod_wskazuje_dane_ktore_trzeba_uzupelnic() -> None:
    """Powód jest ACTIONABLE: nazywa brakujące dane, więc projektant wie, co dodać.

    Deklaracja „melduj brak z powodem" bez tego pinu osunęłaby się do jednego
    zdania ogólnego przyklejonego do wszystkich trzech wielkości.
    """
    wynik = _wynik(_model(load_mw=1.4, load_mvar=0.45))
    powod_qu = wynik["qv_curves"][0]["brak_danych"]
    powod_pu = wynik["pv_curves"][0]["brak_danych"]
    powod_l = wynik["l_index_per_bus"][0]["brak_danych"]

    assert "mocy biernej" in powod_qu
    assert "rozpływ" in powod_pu.lower()
    assert "zwarciow" in powod_l
    # Trzy różne wielkości = trzy różne powody; jeden wspólny tekst znaczyłby,
    # że powód jest ozdobą, a nie informacją.
    assert len({powod_qu, powod_pu, powod_l}) == 3


def test_slad_whitebox_melduje_brak_zamiast_liczby() -> None:
    """Zapis audytowy mówi PRAWDĘ — zmyślona liczba w śladzie jest gorsza niż na ekranie.

    Ślad WHITE BOX jedzie do pakietu dowodowego i do raportu, więc to on jest
    właściwym miejscem tego pinu (R1 karty: sedno jest w solverze, nie w ekranie).
    """
    przebieg = V126AcademicSolver().run(
        V126AnalysisType.VOLTAGE_STABILITY, _model(load_mw=1.4, load_mvar=0.45)
    )
    kroki = przebieg["white_box_trace"]
    assert len(kroki) == 1, "Ślad stabilności napięciowej ma dokładnie jeden krok"
    krok = kroki[0]
    assert all(wartosc is None for wartosc in krok["result"].values()), (
        "Krok śladu podaje liczbę, choć solver nie wyznacza żadnej wielkości — "
        "to zmyślony zapis audytowy"
    )
    assert "wstrzymana" in krok["result_pl"].lower()
    # Fałszywy rodowód „krzywa Q–U" / „krzywa P–U" nie wraca do zapisu audytowego:
    # we wzorze nigdy nie występowało napięcie, a rozpływu tam nie ma.
    tekst_sladu = f"{krok['formula']} {krok['substitution']} {krok['result_pl']}"
    for falszywy in ("Q–U", "Q-U", "P–U", "P-U"):
        assert falszywy not in tekst_sladu, f"Fałszywy rodowód '{falszywy}' wrócił do śladu"


def test_zaden_wspolczynnik_zastepczy_nie_zostal_w_funkcji() -> None:
    """Współczynniki-zastępniki zniknęły z KODU, nie tylko z wyniku.

    Pin czyta źródło funkcji, bo asercja na wyniku nie odróżnia „usunięto wzór"
    od „wzór jest, ale wynik zerowany na końcu" — a drugie wróciłoby przy
    pierwszym refaktorze. Zakaz obejmuje CIAŁO funkcji; docstring opisuje
    wycofane wzory i musi je móc cytować.
    """
    zrodlo = SOLVER_PY.read_text(encoding="utf-8")
    poczatek = zrodlo.index("    def _voltage_stability(")
    koniec = zrodlo.index("    def _branch_current_a(", poczatek)
    funkcja = zrodlo[poczatek:koniec]
    # Ciało = funkcja bez docstringa (docstring jest dokumentacją wycofania).
    cudzyslow = '"""'
    start_doc = funkcja.index(cudzyslow)
    koniec_doc = funkcja.index(cudzyslow, start_doc + 3) + 3
    cialo = funkcja[koniec_doc:]

    zakazane = {
        "0.15": "zdolność wytwórcza mocy biernej jako krotność mocy czynnej",
        "0.35": "moc bierna odbioru jako krotność mocy czynnej (model niesie load_mvar)",
        "2.5": "nasycenie krotności obciążalności P–U",
        "20.0": "dzielnik sztywności węzła",
        "0.98": "obcięcie wskaźnika L",
        "0.12": "spadek napięcia w punkcie krytycznym",
        "25.0": "zastępcza moc zwarciowa węzła",
    }
    znalezione = {
        stala: opis
        for stala, opis in zakazane.items()
        if re.search(rf"(?<![\w.]){re.escape(stala)}(?![\w])", cialo)
    }
    assert znalezione == {}, (
        "Współczynniki bez pokrycia w danych wróciły do ciała `_voltage_stability`: "
        f"{znalezione}"
    )
    # Kontrola dodatnia wycinka: gdyby indeksy wycięły pustkę, powyższe nic nie znaczy.
    assert "def _voltage_stability" in funkcja and len(cialo) > 500


def test_moc_zwarciowa_nie_ma_juz_wartosci_zastepczej() -> None:
    """Brak mocy zwarciowej NIE jest uzupełniany liczbą z napięcia znamionowego.

    Pomiar: pole podane dla 1 z 315 szyn sieci odniesienia, więc dla 99,7 % węzłów
    liczba wchodziła zmyślona (``max(25; U_n · 10)`` = 150 MVA dla szyny 15 kV).
    Pin trzyma OBA końce: brak nie staje się liczbą, a obecność nie staje się
    cicho ignorowana — obie szyny raportują ten sam jawny brak, bo wzoru
    korzystającego z mocy zwarciowej już nie ma.
    """
    model = V126AcademicInput(
        buses=[
            V126BusInput(ref="B_bez", name="Bez S_k", nominal_kv=15.0, load_mw=1.0),
            V126BusInput(
                ref="B_z", name="Z S_k", nominal_kv=15.0, load_mw=1.0, fault_level_mva=250.0
            ),
        ]
    )
    wynik = _wynik(model)
    assert [w["bus_ref"] for w in wynik["l_index_per_bus"]] == ["B_bez", "B_z"]
    assert {w["l_index"] for w in wynik["l_index_per_bus"]} == {None}
    dane_sladu = V126AcademicSolver().run(V126AnalysisType.VOLTAGE_STABILITY, model)[
        "white_box_trace"
    ][0]["data"]
    # Ślad audytowy PODAJE pomiar pokrycia danych — inaczej „brak danych" byłoby
    # twierdzeniem bez dowodu w zapisie.
    assert dane_sladu["buses"] == 2
    assert dane_sladu["buses_with_fault_level"] == 1


def test_kontrakt_nie_urosl_o_nowa_wielkosc() -> None:
    """Zbiór wielkości analizy jest ZAMKNIĘTY — nowa wymaga decyzji, nie przeoczenia.

    Deklaracja „solver nie wyznacza żadnej wielkości tej analizy" jest mocna,
    więc ma przypięty test: pole dopisane do odpowiedzi obok tabel objętych
    `TABELE_LICZBOWE` zapala czerwień tutaj, zamiast wpłynąć do pakietu
    dowodowego bez niczyjej decyzji.
    """
    wynik = _wynik(_model(load_mw=1.4, load_mvar=0.45))
    assert set(wynik) == {
        "pv_curves",
        "qv_curves",
        "l_index_per_bus",
        "modal_analysis",
        "voltage_stability_margin_percent",
        "brak_danych",
        "sanity",
    }
    for sciezka, klucze in TABELE_LICZBOWE.items():
        for wiersz in wynik[sciezka]:
            assert set(wiersz) == {"bus_ref", *klucze, "brak_danych"}, (
                f"{sciezka}: kształt wiersza zmienił się — uzupełnij TABELE_LICZBOWE "
                "albo cofnij nową wielkość"
            )


def test_podstawa_czestotliwosci_pochodzi_z_kontraktu_nie_z_kodu() -> None:
    """Ten sam defekt w sąsiedniej funkcji tego samego pliku (reguła KLASA §5).

    `_z_conv_components` liczyło ``w_base`` z zaszytego ``2π·50``, mimo że
    kontrakt niesie ``base_frequency_hz``, a ten sam plik czyta je w czterech
    innych miejscach. Pin jest RÓŻNICOWY: przy podstawie 60 Hz impedancja
    przekształtnika MUSI wyjść inna niż przy 50 Hz. Asercja na wartości
    bezwzględnej nie odróżniłaby naprawy od zaszytej stałej.
    """
    solver = V126AcademicSolver()
    przeksztaltnik = V126ConverterInput(
        ref="INV1",
        bus_ref="B1",
        rated_mva=2.0,
        rated_kv=0.69,
        current_loop_bandwidth_hz=900.0,
        pll_bandwidth_hz=30.0,
        filter_l_pu=0.08,
        filter_r_pu=0.005,
        p_mw=1.5,
    )
    z_50, _ = solver._z_conv_components(przeksztaltnik, 20.0, f_base_hz=50.0)
    z_60, _ = solver._z_conv_components(przeksztaltnik, 20.0, f_base_hz=60.0)
    assert z_50 != z_60, (
        "Impedancja przekształtnika nie zależy od częstotliwości podstawowej — "
        "podstawa znów jest zaszyta w kodzie zamiast pochodzić z kontraktu"
    )
