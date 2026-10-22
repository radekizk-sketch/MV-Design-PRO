"""Karta PROG-ZERA-WKLADOW (warunkowa zgoda B-01 właściciela z 2026-10-21).

Wkład gałęziowy rozpływu prądu zwarciowego o |I| < 1e-6 A to „wkład pominięty na podstawie
tolerancji numerycznej (|I| < 1e-6 A)” — nie trafia na listę `branch_contributions` ani do
kroków `thevenin_flow_<gałąź>` śladu, tylko do addytywnego zestawienia `wklady_pominiete`
(surowe |I| i kąt fazora, 3 cyfry znaczące w stronę zera) i kroku śladu `wklady_pominiete`.

Iloczyn cech (wymaganie 5 właściciela):
- wartość: {0, +1e-17 kA, −1e-17 kA, tuż poniżej progu, dokładnie na progu, tuż powyżej};
- tor: {falownikowy, Thevenina};
- rodzaj zwarcia: {3F, 2F, 2F+Z, 1F};
oraz sieć z RZECZYWISTYM małym prądem nad progiem (prąd mikrogeneratora synchronicznego
płynący odgałęzieniem kablowym, kilka µA; do karty BEZ-POJEMNOSCI był to prąd ładowania
pojemności kabla, której sieć zwarciowa IEC 60909 nie zawiera) — ten wpis zostaje na liście
we wszystkich czterech rodzajach.

Wartości graniczne trafiają do predykatu rdzenia DOKŁADNIE: graf i macierz Z-bus testu są
dobrane tak, że współczynnik podziału gałęzi sondy wynosi 2⁻⁴⁰ (potęga dwójki — mnożenie
bez błędu zaokrąglenia), więc prąd gałęzi = I_źródła · 2⁻⁴⁰ bit w bit. „−1e-17 kA” to ten
sam prąd w gałęzi o odwróconej orientacji (fazor ze znakiem przeciwnym, kąt +180°) — moduł
w rdzeniu jest zawsze nieujemny, znak niesie fazor i kierunek.
"""

from __future__ import annotations

import ast
import hashlib
import json
import math
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import numpy as np
import pytest
from network_model.solvers import short_circuit_core
from network_model.solvers.short_circuit_contributions import (
    CYFRY_ZNACZACE_WKLADU_POMINIETEGO,
    NAZWA_WKLADU_POMINIETEGO,
    OPIS_PROGU_WKLADU_POMIJALNEGO,
    PROG_WKLADU_POMIJALNEGO_A,
    TOR_FALOWNIK,
    TOR_THEVENIN,
    WkladPominiety,
    jest_wkladem_pominietym,
    zaokraglij_cyfry_znaczace,
)
from network_model.solvers.short_circuit_core import ShortCircuitType
from network_model.solvers.short_circuit_iec60909 import (
    OPTIONAL_SHORT_CIRCUIT_RESULT_KEYS,
    ShortCircuitIEC60909Solver,
)

from tests.utils.siec_wkladow_pominietych import (
    NAZWA_GALEZI_BEZ_PRADU,
    NAZWA_GALEZI_REALNEJ_MALEJ,
    siec_wkladow_pominietych,
)

PROG = PROG_WKLADU_POMIJALNEGO_A
SKALA = 2.0**-40  # współczynnik podziału gałęzi sondy (dokładny)

#: Wartość graniczna → (prąd gałęzi sondy [A], gałąź sondy, czy wpis jest pominięty).
WARTOSCI: dict[str, tuple[float, str, bool]] = {
    "zero": (1e-14, "g_zero", True),  # gałąź o różnicy napięć DOKŁADNIE 0
    "plus_1e-17_kA": (1e-14, "g_sonda", True),
    "minus_1e-17_kA": (1e-14, "g_sonda_odwrocona", True),
    "tuz_ponizej_progu": (math.nextafter(PROG, 0.0), "g_sonda", True),
    "na_progu": (PROG, "g_sonda", False),
    "tuz_powyzej_progu": (math.nextafter(PROG, math.inf), "g_sonda", False),
}
RODZAJE = (
    ShortCircuitType.THREE_PHASE,
    ShortCircuitType.TWO_PHASE,
    ShortCircuitType.TWO_PHASE_GROUND,
    ShortCircuitType.SINGLE_PHASE_GROUND,
)


# ---------------------------------------------------------------------------
# Predykat i jedna definicja progu (wymaganie 1)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "prad_a,pominiety",
    [
        (0.0, True),
        (-0.0, True),
        (1e-14, True),
        (-1e-14, True),
        (math.nextafter(PROG, 0.0), True),
        (-math.nextafter(PROG, 0.0), True),
        (PROG, False),
        (-PROG, False),
        (math.nextafter(PROG, math.inf), False),
        (math.inf, False),
        (math.nan, False),  # NaN to błąd liczbowy, nie wkład pomijalny — nie wolno go ukryć
    ],
)
def test_predykat_abs_mniejsze_od_progu(prad_a: float, pominiety: bool) -> None:
    assert jest_wkladem_pominietym(prad_a) is pominiety


def test_prog_ma_jedna_definicje_z_jednostka() -> None:
    assert PROG == 1e-6
    assert OPIS_PROGU_WKLADU_POMIJALNEGO == "|I| < 1e-6 A"
    assert NAZWA_WKLADU_POMINIETEGO == (
        "wkład pominięty na podstawie tolerancji numerycznej (|I| < 1e-6 A)"
    )
    # Jedna definicja w backendzie: żaden inny moduł nie nadaje wartości stałej progu
    # ani dawnej stałej prezentacyjnej „brak” (drugi próg tej samej klasy).
    src = Path(__file__).resolve().parents[3] / "src"
    przypisania: list[str] = []
    for plik in sorted(src.rglob("*.py")):
        drzewo = ast.parse(plik.read_text(encoding="utf-8"))
        for wezel in ast.walk(drzewo):
            cele = (
                wezel.targets
                if isinstance(wezel, ast.Assign)
                else [wezel.target] if isinstance(wezel, ast.AnnAssign) else []
            )
            for cel in cele:
                if isinstance(cel, ast.Name) and cel.id in {
                    "PROG_WKLADU_POMIJALNEGO_A",
                    "PROG_PRADU_ZEROWEGO_KA",
                }:
                    przypisania.append(f"{plik.relative_to(src)}:{cel.id}")
    assert przypisania == [
        "network_model/solvers/short_circuit_contributions.py:PROG_WKLADU_POMIJALNEGO_A"
    ]


@pytest.mark.parametrize(
    "x,oczekiwane",
    [
        (9.99869e-7, 9.99e-7),  # obcięcie w stronę zera: nie dosięga progu
        (1.4e-17, 1.4e-17),  # z repr, nie z dokładnej wartości binarnej
        (-3.627e-9, -3.62e-9),
        (163.04, 163.0),
        (-73.86, -73.8),
        (0.0, 0.0),
    ],
)
def test_zaokraglenie_trzy_cyfry_w_strone_zera(x: float, oczekiwane: float) -> None:
    assert CYFRY_ZNACZACE_WKLADU_POMINIETEGO == 3
    assert zaokraglij_cyfry_znaczace(x) == oczekiwane
    assert abs(zaokraglij_cyfry_znaczace(x)) <= abs(x)


def test_rekord_wkladu_pominietego_kat_i_zero() -> None:
    zero = WkladPominiety.z_wartosci(
        tor=TOR_THEVENIN, source_id="THEVENIN_GRID", branch_id="g", i_a=0.0, fazor_a=0j
    )
    assert zero.to_dict() == {
        "tor": "thevenin",
        "source_id": "THEVENIN_GRID",
        "branch_id": "g",
        "i_a": 0.0,
        "kat_deg": None,  # fazor zerowy nie ma kąta — brak, nie 0°
    }
    plus = WkladPominiety.z_wartosci(
        tor=TOR_FALOWNIK, source_id="pv", branch_id="g", i_a=1e-14, fazor_a=complex(1e-14, 0.0)
    )
    minus = WkladPominiety.z_wartosci(
        tor=TOR_FALOWNIK, source_id="pv", branch_id="g", i_a=1e-14, fazor_a=complex(-1e-14, 0.0)
    )
    assert plus.kat_deg == 0.0
    assert minus.kat_deg == 180.0
    assert plus.i_a == minus.i_a == 1e-14


# ---------------------------------------------------------------------------
# Iloczyn cech na budowniczych rdzenia (wymaganie 5)
# ---------------------------------------------------------------------------


class _Budowniczy:
    """Macierz admitancji testu: admitancja szeregowa każdej gałęzi = 1 pu, a = 1."""

    node_id_to_index = {"F": 0, "A": 1, "B": 2, "C": 3, "S": 4}

    def _get_branch_admittances_pu(self, branch: Any) -> tuple[complex, complex, float]:
        return complex(1.0, 0.0), 0j, 1.0


def _z_bus() -> np.ndarray:
    """Z-bus testu: V = −Z[:, F] przy iniekcji −1 w F (Thevenin) i +1 w S, −1 w F
    (falownik — kolumna S zerowa). V_A − V_B = −2⁻⁴⁰ dokładnie, V_C = V_A dokładnie."""
    z = np.zeros((5, 5), dtype=complex)
    z[0, 0] = 1.0
    z[1, 0] = 0.5
    z[2, 0] = 0.5 - SKALA
    z[3, 0] = 0.5
    return z


def _galaz(od: str, do: str, nazwa: str) -> Any:
    return SimpleNamespace(from_node_id=od, to_node_id=do, in_service=True, name=nazwa)


def _graf(ik_falownika_a: float | None) -> Any:
    galezie = {
        "g_glowna": _galaz("F", "A", "Gałąź główna"),
        "g_sonda": _galaz("A", "B", "Sonda"),
        "g_sonda_odwrocona": _galaz("B", "A", "Sonda odwrócona"),
        "g_zero": _galaz("A", "C", "Gałąź bez różnicy napięć"),
    }
    zrodla = (
        []
        if ik_falownika_a is None
        else [
            SimpleNamespace(
                id="pv",
                node_id="S",
                ik_sc_a=ik_falownika_a,
                contributes_negative_sequence=True,
                contributes_zero_sequence=True,
            )
        ]
    )
    return SimpleNamespace(branches=galezie, get_inverter_sources=lambda: zrodla)


@pytest.fixture
def _rdzen_testowy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(short_circuit_core, "build_zbus", lambda graph: (_Budowniczy(), _z_bus()))
    monkeypatch.setattr(
        ShortCircuitIEC60909Solver,
        "_inverter_transfer_factors",
        staticmethod(lambda graph, fault_node_id, **_kw: {"pv": 1.0}),
    )


@pytest.mark.usefixtures("_rdzen_testowy")
@pytest.mark.parametrize("rodzaj", RODZAJE, ids=lambda r: r.value)
@pytest.mark.parametrize("tor", [TOR_THEVENIN, TOR_FALOWNIK])
@pytest.mark.parametrize("wartosc", list(WARTOSCI))
def test_wartosci_graniczne_iloczyn_cech(wartosc: str, tor: str, rodzaj: ShortCircuitType) -> None:
    prad_a, galaz_sondy, pominiety = WARTOSCI[wartosc]
    prad_zrodla_a = prad_a / SKALA  # potęga dwójki: dokładnie
    assert prad_zrodla_a * SKALA == prad_a
    if tor == TOR_THEVENIN:
        graf, ik_thevenin = _graf(None), prad_zrodla_a
    else:
        graf, ik_thevenin = _graf(prad_zrodla_a), 0.0  # 0.0 → tor Thevenina pusty
    zrodlo = "THEVENIN_GRID" if tor == TOR_THEVENIN else "pv"

    wklady, slad, pominiete = ShortCircuitIEC60909Solver._build_branch_contributions(
        graf, "F", rodzaj, ik_thevenin
    )

    opublikowane = {(w.source_id, w.branch_id): w for w in wklady}
    zestawienie = {(w.source_id, w.branch_id): w for w in pominiete}
    klucz = (zrodlo, galaz_sondy)
    # Rozłączność i pokrycie: każda para źródło×gałąź jest DOKŁADNIE w jednym zbiorze.
    assert not set(opublikowane) & set(zestawienie)
    assert set(opublikowane) | set(zestawienie) == {(zrodlo, g) for g in graf.branches}
    assert (klucz in zestawienie) is pominiety
    assert (klucz in opublikowane) is not pominiety
    for w in wklady:
        assert w.i_contrib_a >= PROG
    for w in pominiete:
        assert w.i_a < PROG and w.tor == tor

    if pominiety:
        wpis = zestawienie[klucz]
        oczekiwany_prad = 0.0 if galaz_sondy == "g_zero" else zaokraglij_cyfry_znaczace(prad_a)
        assert wpis.i_a == oczekiwany_prad
        if galaz_sondy == "g_zero":
            assert wpis.kat_deg is None
        elif galaz_sondy == "g_sonda_odwrocona":
            # −1e-17 kA: ten sam moduł, fazor o przeciwnym znaku (kąt różny o 180°).
            assert abs(wpis.kat_deg - zestawienie[(zrodlo, "g_sonda")].kat_deg) == 180.0
    else:
        assert opublikowane[klucz].i_contrib_a == prad_a  # bit w bit, bez korekty

    klucze_sladu = [k["key"] for k in slad]
    if tor == TOR_THEVENIN:
        # Ślad ↔ lista: krok gałęzi istnieje DOKŁADNIE dla gałęzi opublikowanych.
        assert {k for k in klucze_sladu if k.startswith("thevenin_flow_")} - {
            "thevenin_flow_setup",
            "thevenin_flow_balance",
        } == {f"thevenin_flow_{b}" for (_s, b) in opublikowane}
    else:
        assert not any(k.startswith("thevenin_flow_") for k in klucze_sladu)
    # Krok zestawienia: obecny wtedy i tylko wtedy, gdy coś pominięto; liczba = zestawienie.
    kroki = [k for k in slad if k["key"] == "wklady_pominiete"]
    assert len(kroki) == (1 if pominiete else 0)
    if kroki:
        wynik = kroki[0]["result"]
        assert wynik[f"liczba_pominietych_{tor}"] == len(pominiete)
        assert NAZWA_WKLADU_POMINIETEGO in kroki[0]["notes"]
        assert "nie zero" in kroki[0]["notes"]


@pytest.mark.usefixtures("_rdzen_testowy")
@pytest.mark.parametrize("tor", [TOR_THEVENIN, TOR_FALOWNIK])
def test_zrodlo_o_wkladzie_ponizej_progu_nie_rozprowadza_pradu(tor: str) -> None:
    """Ten sam predykat na wkładzie źródła: źródło o wkładzie < 1e-6 A nie rozprowadza
    prądu po gałęziach (skład zestawienia nie może zależeć od tego, czy reszta
    zmiennoprzecinkowa wkładu źródła wypadła na 0 czy 1e-17)."""
    prad = math.nextafter(PROG, 0.0)
    graf = _graf(prad if tor == TOR_FALOWNIK else None)
    wklady, slad, pominiete = ShortCircuitIEC60909Solver._build_branch_contributions(
        graf, "F", ShortCircuitType.THREE_PHASE, prad if tor == TOR_THEVENIN else 0.0
    )
    assert (wklady, slad, pominiete) == ([], [], [])


@pytest.mark.usefixtures("_rdzen_testowy")
def test_zestawienie_i_krok_sa_deterministyczne() -> None:
    """Ten sam wejściowy graf → bajtowo ten sam zapis zestawienia i kroku śladu."""

    def odcisk() -> str:
        graf = _graf(1e-14 / SKALA)
        wklady, slad, pominiete = ShortCircuitIEC60909Solver._build_branch_contributions(
            graf, "F", ShortCircuitType.THREE_PHASE, 1e-14 / SKALA
        )
        tresc = {
            "pominiete": [w.to_dict() for w in pominiete],
            "krok": [k for k in slad if k["key"] == "wklady_pominiete"],
            "wklady": [w.to_dict() for w in wklady],
        }
        return hashlib.sha256(json.dumps(tresc, sort_keys=True, default=str).encode()).hexdigest()

    assert odcisk() == odcisk()
    graf = _graf(1e-14 / SKALA)
    _w, _s, pominiete = ShortCircuitIEC60909Solver._build_branch_contributions(
        graf, "F", ShortCircuitType.THREE_PHASE, 1e-14 / SKALA
    )
    assert [(w.source_id, w.branch_id) for w in pominiete] == sorted(
        (w.source_id, w.branch_id) for w in pominiete
    )


# ---------------------------------------------------------------------------
# Sieć z rzeczywistym małym prądem nad progiem — tor kanoniczny (wymaganie 5)
# ---------------------------------------------------------------------------


@pytest.fixture
def _czysty_stan():
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


@pytest.mark.usefixtures("_czysty_stan")
@pytest.mark.parametrize("rodzaj", ["3F", "2F", "2FG", "1F"])
def test_realny_maly_prad_nad_progiem_zostaje_na_liscie(rodzaj: str) -> None:
    from enm.store import set_enm

    from tests.utils.biegi import run_short_circuit_now

    case_id = str(uuid4())
    set_enm(case_id, siec_wkladow_pominietych())
    bieg = run_short_circuit_now(
        case_id=case_id,
        klucz_twin=case_id,
        options={"fault_type": rodzaj, "branch_contributions_mode": "in_run"},
    )
    graf = bieg.raw_result["graph"]
    nazwa_galezi = {k: v["name"] for k, v in graf["branches"].items()}
    nazwa_wezla = {k: v["name"] for k, v in graf["nodes"].items()}
    punkty = {nazwa_wezla[w["fault_node_id"]]: w for w in bieg.raw_result["results"]}

    glowna = punkty["Szyna glowna"]
    realne = [
        w
        for w in glowna["branch_contributions"]
        if nazwa_galezi[w["branch_id"]] == NAZWA_GALEZI_REALNEJ_MALEJ
        and w["source_id"] == "THEVENIN_GRID"
    ]
    assert len(realne) == 1
    # Prąd mikrogeneratora za 5 m kabla: kilka µA — fizyka, nie szum; NAD progiem.
    assert PROG < realne[0]["i_contrib_a"] < 1e-4
    for punkt in punkty.values():
        wklady = punkt["branch_contributions"]
        pominiete = punkt.get("wklady_pominiete") or []
        assert all(w["i_contrib_a"] >= PROG for w in wklady)
        assert all(w["i_a"] < PROG for w in pominiete)
        assert not {(w["source_id"], w["branch_id"]) for w in wklady} & {
            (w["source_id"], w["branch_id"]) for w in pominiete
        }
        # Ślad ↔ lista Thevenina: ten sam zbiór gałęzi.
        thevenin = {w["branch_id"] for w in wklady if w["source_id"] == "THEVENIN_GRID"}
        kroki = {
            k["key"].removeprefix("thevenin_flow_")
            for k in punkt["branch_flow_trace"]
            if k["key"].startswith("thevenin_flow_")
            and k["key"] not in ("thevenin_flow_setup", "thevenin_flow_balance")
        }
        assert kroki == thevenin
    # Odgałęzienie martwe bez pojemności: wpis Thevenina pominięty, NIE zero na liście.
    oze = punkty["Szyna OZE"]
    assert not [
        w
        for w in oze["branch_contributions"]
        if nazwa_galezi[w["branch_id"]] == NAZWA_GALEZI_BEZ_PRADU
    ]
    assert [
        w["tor"]
        for w in oze["wklady_pominiete"]
        if nazwa_galezi[w["branch_id"]] == NAZWA_GALEZI_BEZ_PRADU
    ] == ["thevenin"]
    assert "wklady_pominiete" in OPTIONAL_SHORT_CIRCUIT_RESULT_KEYS
