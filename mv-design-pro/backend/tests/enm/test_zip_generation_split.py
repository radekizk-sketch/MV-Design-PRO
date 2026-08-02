"""Defekt D1 (AUDYT_SZCZYTU_2026-08-01): wielomian ZIP tylko na czesci odbiorowej.

Dowod na PRODUKCYJNEJ sciezce (``create_run``/``execute_run``), nie na samej
funkcji. Scenariusz z audytu (po korekcie sceptyka): szyna SN 15 kV z odbiorem
3,0 MW / 1,5 Mvar o charakterystyce STALEJ IMPEDANCJI (a_p = a_q = 1) ORAZ
generatorem synchronicznym na TEJ SAMEJ szynie; zasilanie z GPZ linia 12 km
0,4 + j0,8 om/km, slack 1,0 pu, S_b = 10 MVA.

Model wiazacy (kanon fizyczny):

    P_szyny(V) = -P_odb * f_ZIP(V) + P_gen        (generator PQ = stala moc)

Przed naprawa lancuch mnozyl wielomian przez moc WYPADKOWA szyny, wiec przy
przewadze generacji ODWRACAL znak mocy na przylaczu (+0,0424 MW poboru zamiast
0,2720 MW oddawania przy P_gen = 3,0 MW).

Odniesienie liczbowe pochodzi z NIEZALEZNEGO Newtona liczonego w tym pliku w
czystym numpy — bez uzycia badanego solvera (wymog karty C, §2.4).
"""

from __future__ import annotations

import math

import numpy as np
import pytest
from enm.canonical_analysis import (
    _graph_id_from_ref,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store, set_enm
from enm.validator import ENMValidator

from tests.catalog_test_helpers import gpz_source_record

BASE_MVA = 10.0
U_KV = 15.0
LINE_KM = 12.0
R_OHM_KM = 0.4
X_OHM_KM = 0.8
P_LOAD_MW = 3.0
Q_LOAD_MVAR = 1.5

# Wartosc, ktora lancuch zwracal PRZED naprawa przy P_gen = 3,0 MW: pobor
# +0,0424 MW z sieci zamiast oddawania 0,2720 MW (znak odwrotny). Test ma ja
# asercyjnie odrzucac — inaczej regresja defektu D1 bylaby niewykrywalna.
POBOR_PRZED_NAPRAWA_MW = 0.042360913901222985

# --- defekt A1 (PRZEGLAD_FALI_2026-08-01, znaleziska P1/P3/P7/P9) -------------
# Odbior o TRYWIALNYM wielomianie napieciowym (a=b=0, c=1), ale z niezerowa
# czuloscia CZESTOTLIWOSCIOWA. Przy f = f0 mnoznik `frequency_factor` wynosi
# DOKLADNIE 1,0, wiec fizycznie jest to ten sam uklad co odbior stalomocowy —
# kazda roznica wyniku jest bledem, nie fizyka.
FREQ_ONLY_PARAMS = {
    "a_p": 0.0,
    "b_p": 0.0,
    "c_p": 1.0,
    "a_q": 0.0,
    "b_q": 0.0,
    "c_q": 1.0,
    "v0_pu": 1.0,
    "k_pf": 2.0,
    "k_qf": 1.0,
    "f0_hz": 50.0,
}
P_GEN_FREQ_ONLY_MW = 2.0
# Fizyka szyny b2: P = -P_odb + P_gen = -3,0 + 2,0 = -1,0 MW (Q = -1,5 Mvar).
P_SZYNY_FIZYKA_MW = -P_LOAD_MW + P_GEN_FREQ_ONLY_MW
# Wartosci, ktore lancuch zwracal PRZED naprawa: rozdzielenie zabieralo cala
# generacje i nigdy jej nie oddawalo (szyna liczona jak BEZ generatora).
P_SZYNY_PRZED_NAPRAWA_MW = -3.0
V_SZYNY_PRZED_NAPRAWA_PU = 0.8413282902724865


def _payload(name: str, *, p_gen_mw: float, q_load_mvar: float = Q_LOAD_MVAR) -> dict:
    generators = []
    if p_gen_mw > 0.0:
        generators = [
            {
                "id": "00000000-0000-0000-0000-000000000040",
                "ref_id": "g1",
                "name": "Agregat kogeneracyjny",
                "tags": [],
                "meta": {},
                "bus_ref": "b2",
                "gen_type": "synchronous",
                "p_mw": p_gen_mw,
                "q_mvar": 0.0,
                "sn_mva": 5.0,
            }
        ]
    return {
        "header": {
            "name": name,
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "ref_id": "b1",
                "name": "GPZ",
                "tags": [],
                "meta": {},
                "voltage_kv": U_KV,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000000002",
                "ref_id": "b2",
                "name": "Zaklad",
                "tags": [],
                "meta": {},
                "voltage_kv": U_KV,
                "phase_system": "3ph",
            },
        ],
        "branches": [
            {
                "id": "00000000-0000-0000-0000-000000000010",
                "ref_id": "ln-1",
                "name": "Linia GPZ-Zaklad",
                "tags": [],
                "meta": {},
                "from_bus_ref": "b1",
                "to_bus_ref": "b2",
                "status": "closed",
                "type": "line_overhead",
                "length_km": LINE_KM,
                "r_ohm_per_km": R_OHM_KM,
                "x_ohm_per_km": X_OHM_KM,
                "catalog_ref": "LINIA_SN:reczne",
                "catalog_namespace": "LINIA_SN",
            }
        ],
        "transformers": [],
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000000003",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="s1",
                    name="S1",
                    bus_ref="b1",
                    voltage_kv=U_KV,
                    sk3_mva=500.0,
                    rx_ratio=0.10,
                ),
            }
        ],
        "loads": [
            {
                "id": "00000000-0000-0000-0000-000000000020",
                "ref_id": "load-1",
                "name": "Odbior o stalej impedancji",
                "tags": [],
                "meta": {},
                "bus_ref": "b2",
                "p_mw": P_LOAD_MW,
                "q_mvar": q_load_mvar,
                "model": "zip",
                "materialized_params": {
                    "a_p": 1.0,
                    "b_p": 0.0,
                    "c_p": 0.0,
                    "a_q": 1.0,
                    "b_q": 0.0,
                    "c_q": 0.0,
                    "v0_pu": 1.0,
                },
            }
        ],
        "generators": generators,
        "shunt_capacitors": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [],
    }


@pytest.fixture(autouse=True)
def _reset_state():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _run(case_id: str, payload: dict):
    enm = EnergyNetworkModel.model_validate(payload)
    walidacja = ENMValidator().validate(enm)
    assert walidacja.status != "FAIL", [
        issue.message_pl for issue in walidacja.issues if issue.severity == "BLOCKER"
    ]
    set_enm(case_id, enm)
    run = execute_run(
        create_run(case_id=case_id, analysis_type="PF", options={"base_mva": BASE_MVA}).id
    )
    assert run.status == "FINISHED", run.error_message
    return run


def _bus(run, ref_id: str) -> dict:
    buses = {b["bus_id"]: b for b in run.raw_result["result_v1"]["bus_results"]}
    return buses[_graph_id_from_ref(ref_id)]


def _referencyjny_newton(p_gen_mw: float, q_load_mvar: float = Q_LOAD_MVAR) -> tuple[float, float]:
    """NIEZALEZNY Newton (czysty numpy) — dwa wezly, slack + szyna PQ z ZIP.

    Zwraca (|V| szyny b2 [pu], moc pobierana z sieci na GPZ [MW]).
    Fizyka: P(V) = -P_odb*(V/V0)^2 + P_gen, Q(V) = -Q_odb*(V/V0)^2.
    Zaden element badanego solvera nie jest tu uzyty.
    """
    z_base = U_KV * U_KV / BASE_MVA
    z_pu = complex(R_OHM_KM * LINE_KM, X_OHM_KM * LINE_KM) / z_base
    y = 1.0 / z_pu
    ybus = np.array([[y, -y], [-y, y]], dtype=complex)

    theta, v_mag = 0.0, 1.0
    for _ in range(100):
        v = np.array([1.0 + 0j, v_mag * np.exp(1j * theta)], dtype=complex)
        s_calc = v * np.conj(ybus @ v)
        p_zad = (-P_LOAD_MW * v_mag * v_mag + p_gen_mw) / BASE_MVA
        q_zad = (-q_load_mvar * v_mag * v_mag) / BASE_MVA
        f = np.array([s_calc[1].real - p_zad, s_calc[1].imag - q_zad])
        if float(np.max(np.abs(f))) < 1e-14:
            break
        eps = 1e-8
        jak = np.zeros((2, 2))
        for kol, (d_theta, d_v) in enumerate(((eps, 0.0), (0.0, eps))):
            th2, vm2 = theta + d_theta, v_mag + d_v
            v2 = np.array([1.0 + 0j, vm2 * np.exp(1j * th2)], dtype=complex)
            s2 = v2 * np.conj(ybus @ v2)
            f2 = np.array(
                [
                    s2[1].real - (-P_LOAD_MW * vm2 * vm2 + p_gen_mw) / BASE_MVA,
                    s2[1].imag - (-q_load_mvar * vm2 * vm2) / BASE_MVA,
                ]
            )
            jak[:, kol] = (f2 - f) / eps
        krok = np.linalg.solve(jak, -f)
        theta += krok[0]
        v_mag += krok[1]

    v = np.array([1.0 + 0j, v_mag * np.exp(1j * theta)], dtype=complex)
    s_calc = v * np.conj(ybus @ v)
    # Konwencja audytu: POBOR z sieci dodatni. Injekcja slacka do sieci JEST
    # poborem ukladu (moc plynie z sieci do odbiorcy); wartosc ujemna = oddawanie.
    pobor_z_sieci_mw = float(s_calc[0].real) * BASE_MVA
    return v_mag, pobor_z_sieci_mw


def test_referencyjny_newton_zgadza_sie_z_lancuchem_bez_generacji() -> None:
    """Kontrola odniesienia: bez generacji lancuch i wlasny Newton sa zgodne.

    Bez tego kroku dowod nie mialby wartosci — sprawdzamy najpierw, ze niezalezne
    odniesienie opisuje TEN SAM uklad (0 roznicy), zanim uzyjemy go jako sedziego.
    """
    run = _run("zip-ref-0", _payload("Bez generacji", p_gen_mw=0.0))
    v_odn, pobor_odn = _referencyjny_newton(0.0)
    assert _bus(run, "b2")["v_pu"] == pytest.approx(v_odn, abs=1e-9)
    assert _bus(run, "b1")["p_injected_mw"] == pytest.approx(pobor_odn, abs=1e-6)


@pytest.mark.parametrize("p_gen_mw", [2.7, 3.0, 4.0])
def test_moc_na_przylaczu_zgodna_z_niezaleznym_newtonem(p_gen_mw: float) -> None:
    """DOWOD LICZBOWY (karta C §2.4): lancuch == fizyka dla kazdej mocy generacji."""
    run = _run(f"zip-gen-{p_gen_mw}", _payload(f"Generacja {p_gen_mw} MW", p_gen_mw=p_gen_mw))
    v_odn, pobor_odn = _referencyjny_newton(p_gen_mw)
    assert _bus(run, "b2")["v_pu"] == pytest.approx(v_odn, abs=1e-6)
    pobor_lancuch = _bus(run, "b1")["p_injected_mw"]
    assert pobor_lancuch == pytest.approx(pobor_odn, abs=1e-6)


def test_znak_mocy_na_przylaczu_nie_jest_odwrocony() -> None:
    """Sedno defektu: przy P_gen = 3,0 MW uklad ODDAJE moc, a nie pobiera.

    Lancuch przed naprawa raportowal pobor +0,042361 MW (znak odwrotny wobec
    fizyki). Ta wartosc jest tu odrzucana asercyjnie.
    """
    run = _run("zip-gen-znak", _payload("Generacja 3 MW", p_gen_mw=3.0))
    pobor_lancuch = _bus(run, "b1")["p_injected_mw"]
    _, pobor_odn = _referencyjny_newton(3.0)
    assert pobor_odn < 0.0, "odniesienie: uklad oddaje moc do sieci"
    assert pobor_lancuch < 0.0, f"lancuch nadal raportuje pobor {pobor_lancuch} MW"
    assert pobor_lancuch != pytest.approx(POBOR_PRZED_NAPRAWA_MW, abs=1e-6)
    assert pobor_lancuch == pytest.approx(-0.271955, abs=1e-6)


def test_bilans_wezlowy_na_szynie_zip_sie_domyka() -> None:
    """``p_injected_mw`` = moc FAKTYCZNIE wstrzyknieta = przeplyw galezi.

    Przed naprawa tabela pokazywala moc SPRZED wielomianu (-3,0000 MW przy
    rzeczywistych -2,3408 MW), czyli lamala bilans wezlowy o 22 % na kazdej
    szynie ZIP — niezaleznie od obecnosci generacji.
    """
    for nazwa, p_gen in (("zip-bilans-0", 0.0), ("zip-bilans-27", 2.7)):
        run = _run(nazwa, _payload(nazwa, p_gen_mw=p_gen))
        galaz = run.raw_result["result_v1"]["branch_results"][0]
        b2 = _bus(run, "b2")
        assert b2["p_injected_mw"] == pytest.approx(galaz["p_to_mw"], abs=1e-6)
        assert b2["q_injected_mvar"] == pytest.approx(galaz["q_to_mvar"], abs=1e-6)
    # kontrola wartosci bezwzglednej dla wariantu bez generacji (audyt: -2,3408)
    run = _run("zip-bilans-kontrola", _payload("kontrola", p_gen_mw=0.0))
    assert _bus(run, "b2")["p_injected_mw"] == pytest.approx(-2.3408, abs=1e-4)


def test_odbior_zip_bez_mocy_biernej_nie_wywraca_biegu() -> None:
    """Scenariusz 2 z audytu: odbior ZIP skompensowany do cos fi = 1 (Q0 = 0).

    Agregat mial wtedy a_q = b_q = c_q = 0 (suma 0 zamiast 1), przez co
    ``build_zip_table`` rzucal ValueError i CALY bieg konczyl sie statusem FAILED
    z angielskim komunikatem wewnetrznym. Bieg ma sie konczyc sukcesem.
    """
    run = _run("zip-q0", _payload("Odbior skompensowany", p_gen_mw=0.0, q_load_mvar=0.0))
    assert run.raw_result["reporting_status"] == "reportable"
    b2 = _bus(run, "b2")
    assert b2["q_injected_mvar"] == pytest.approx(0.0, abs=1e-12)
    # P nadal skaluje sie wielomianem stalej impedancji.
    assert b2["p_injected_mw"] == pytest.approx(-P_LOAD_MW * b2["v_pu"] ** 2, rel=1e-9)


def test_wynik_jest_deterministyczny() -> None:
    a = _run("zip-det-a", _payload("Determinizm", p_gen_mw=2.7))
    b = _run("zip-det-b", _payload("Determinizm", p_gen_mw=2.7))
    assert _bus(a, "b2")["v_pu"] == _bus(b, "b2")["v_pu"]
    assert _bus(a, "b2")["p_injected_mw"] == _bus(b, "b2")["p_injected_mw"]


@pytest.mark.parametrize("metoda", ["gauss-seidel", "fast-decoupled"])
def test_parytet_metod_rozplywu_na_szynie_zip_z_generacja(metoda: str) -> None:
    """Rozdzielenie skladnikow obowiazuje w NR, GS i FD — jedna fizyka, trzy drogi."""
    enm = EnergyNetworkModel.model_validate(_payload(f"Parytet {metoda}", p_gen_mw=2.7))
    set_enm(f"zip-parytet-{metoda}", enm)
    run = execute_run(
        create_run(
            case_id=f"zip-parytet-{metoda}",
            analysis_type="PF",
            options={"base_mva": BASE_MVA, "solver_method": metoda},
        ).id
    )
    assert run.status == "FINISHED", run.error_message
    v_odn, pobor_odn = _referencyjny_newton(2.7)
    assert _bus(run, "b2")["v_pu"] == pytest.approx(v_odn, abs=1e-5)
    assert _bus(run, "b1")["p_injected_mw"] == pytest.approx(pobor_odn, abs=1e-5)
    assert _bus(run, "b2")["p_injected_mw"] == pytest.approx(
        math.fsum([-P_LOAD_MW * _bus(run, "b2")["v_pu"] ** 2, 2.7]), abs=1e-6
    )


# ---- defekt A1: odbior zalezny WYLACZNIE od czestotliwosci + generacja -------
#
# Regresja wniesiona fala audytu (PRZEGLAD_FALI_2026-08-01, P1/P3/P7/P9): zbior
# szyn ROZDZIELANYCH byl szerszy niz zbior szyn, ktorym czesc stala wracala do
# rownania, wiec szyna o trywialnym wielomianie napieciowym, ale z niezerowa
# czuloscia czestotliwosciowa, tracila CALA generacje. Luka w pokryciu byla
# dokladnie w iloczynie cech: wszystkie dotychczasowe testy rozdzielenia stoja na
# wspolczynnikach NAPIECIOWYCH (a_p = 1), a wszystkie testy czestotliwosci — na
# szynie BEZ generacji.


def _payload_freq_only(name: str, *, p_gen_mw: float) -> dict:
    payload = _payload(name, p_gen_mw=p_gen_mw)
    payload["loads"][0]["name"] = "Odbior wrazliwy na czestotliwosc"
    payload["loads"][0]["materialized_params"] = dict(FREQ_ONLY_PARAMS)
    return payload


def _payload_stalomocowy(name: str, *, p_gen_mw: float) -> dict:
    payload = _payload(name, p_gen_mw=p_gen_mw)
    payload["loads"][0]["name"] = "Odbior stalomocowy"
    payload["loads"][0]["model"] = "pq"
    payload["loads"][0]["materialized_params"] = None
    return payload


def test_generacja_zostaje_na_szynie_z_odbiorem_tylko_czestotliwosciowym() -> None:
    """BRAMKA (a): generator jest OBECNY w wyniku na sciezce produkcyjnej.

    Przy f = f0 mnoznik czestotliwosciowy = 1,0 i wielomian napieciowy jest
    trywialny, wiec moc netto szyny MUSI wynosic -P_odb + P_gen. Przed naprawa
    lancuch raportowal -3,0 MW (szyna liczona jak bez generatora): blad 2,0 MW,
    czyli 200 % mocy netto szyny.
    """
    run = _run(
        "a1-freq-gen",
        _payload_freq_only("Odbior czestotliwosciowy + agregat", p_gen_mw=P_GEN_FREQ_ONLY_MW),
    )
    b2 = _bus(run, "b2")
    assert b2["p_injected_mw"] == pytest.approx(P_SZYNY_FIZYKA_MW, abs=1e-9)
    assert b2["q_injected_mvar"] == pytest.approx(-Q_LOAD_MVAR, abs=1e-9)
    # Wartosc sprzed naprawy ma byc NIEOSIAGALNA — inaczej regresja bylaby
    # niewykrywalna (generacja znikala bez sladu, bieg konczyl sie FINISHED).
    assert b2["p_injected_mw"] != pytest.approx(P_SZYNY_PRZED_NAPRAWA_MW, abs=1e-3)
    assert b2["v_pu"] != pytest.approx(V_SZYNY_PRZED_NAPRAWA_PU, abs=1e-4)
    # Bilans wezlowy: to, co szyna wstrzykuje, plynie galezia.
    galaz = run.raw_result["result_v1"]["branch_results"][0]
    assert b2["p_injected_mw"] == pytest.approx(galaz["p_to_mw"], abs=1e-6)


def test_czulosc_czestotliwosciowa_przy_f0_nie_zmienia_niczego() -> None:
    """Sedno dowodu: przy f = f0 oba modele sa TYM SAMYM ukladem fizycznym.

    Rozne sa wylacznie dwa wspolczynniki k_pf/k_qf, ktore przy f = f0 daja mnoznik
    dokladnie 1,0, wiec kazda roznica wyniku jest bledem rachunku, a nie fizyka.

    Tolerancja, a nie rownosc bitowa — i to jest scisle uzasadnione: szyna
    rozdzielona liczy sie jako `baza + (netto - baza)`, czyli o JEDNO zaokraglenie
    binarne wiecej niz szyna nierozdzielona. Roznica jest rzedu 1 ULP (~1e-16
    wzglednie); defekt, ktory ten test lapie, mial 2,0 MW. Rownosc BITOWA jest
    natomiast wymagana tam, gdzie rozdzielenia nie ma (test ponizej) — tam nie ma
    dodatkowego zaokraglenia i kontrakt reduce-to-NR obowiazuje co do bitu.
    """
    freq = _run("a1-rownowaznosc-freq", _payload_freq_only("freq", p_gen_mw=P_GEN_FREQ_ONLY_MW))
    stala = _run("a1-rownowaznosc-pq", _payload_stalomocowy("pq", p_gen_mw=P_GEN_FREQ_ONLY_MW))
    for szyna in ("b1", "b2"):
        for pole in ("v_pu", "p_injected_mw", "q_injected_mvar"):
            assert _bus(freq, szyna)[pole] == pytest.approx(
                _bus(stala, szyna)[pole], rel=1e-12, abs=1e-12
            ), f"{szyna}.{pole}"


@pytest.mark.parametrize("metoda", ["newton-raphson", "gauss-seidel", "fast-decoupled"])
def test_parytet_metod_na_szynie_tylko_czestotliwosciowej(metoda: str) -> None:
    """BRAMKA (b): NR/GS/FD zgodne na POPRAWNEJ liczbie.

    Przed naprawa wszystkie trzy solvery zgadzaly sie na tej samej BLEDNEJ
    wartosci (kazdy wola ten sam `zip_effective_spec`), wiec sam parytet niczego
    nie dowodzil — dopiero parytet + fizyka.
    """
    enm = EnergyNetworkModel.model_validate(
        _payload_freq_only(f"Parytet {metoda}", p_gen_mw=P_GEN_FREQ_ONLY_MW)
    )
    set_enm(f"a1-parytet-{metoda}", enm)
    run = execute_run(
        create_run(
            case_id=f"a1-parytet-{metoda}",
            analysis_type="PF",
            options={"base_mva": BASE_MVA, "solver_method": metoda},
        ).id
    )
    assert run.status == "FINISHED", run.error_message
    b2 = _bus(run, "b2")
    assert b2["p_injected_mw"] == pytest.approx(P_SZYNY_FIZYKA_MW, abs=1e-6)
    assert b2["p_injected_mw"] != pytest.approx(P_SZYNY_PRZED_NAPRAWA_MW, abs=1e-3)


def test_odbior_tylko_czestotliwosciowy_bez_generacji_jest_sciezka_historyczna() -> None:
    """Szyna bez generacji nie jest rozdzielana — wynik jak dla zwyklego PQ."""
    freq = _run("a1-bez-gen-freq", _payload_freq_only("freq bez gen", p_gen_mw=0.0))
    stala = _run("a1-bez-gen-pq", _payload_stalomocowy("pq bez gen", p_gen_mw=0.0))
    assert _bus(freq, "b2")["v_pu"] == _bus(stala, "b2")["v_pu"]
    assert _bus(freq, "b2")["p_injected_mw"] == _bus(stala, "b2")["p_injected_mw"]
    assert _bus(freq, "b2")["p_injected_mw"] == pytest.approx(-P_LOAD_MW, abs=1e-9)


# ---- defekt A2: walidacja wielomianu nie moze wywracac mapowania -------------


def _payload_z_odbiorem_pojemnosciowym() -> dict:
    """Szyna z odbiorem ZIP (a_q = 1) ORAZ odbiorem POJEMNOSCIOWYM (Q < 0).

    Odbior pojemnosciowy to kanon katalogu (`cos_phi_mode == "POJ"` →
    `enm/catalog_completion.py`), a `add_nn_load` przyjmuje `reactive_power_kvar`
    bez ograniczenia znaku. Przy mieszanych znakach Q wagowy udzial agregatu
    wychodzi poza [0, 1] — wlasnosc KOMBINACJI, nie zadnego ze skladnikow.
    """
    payload = _payload("A2 pojemnosciowy", p_gen_mw=0.0)
    payload["loads"].append(
        {
            "id": "00000000-0000-0000-0000-000000000021",
            "ref_id": "load-2",
            "name": "Odbior pojemnosciowy",
            "tags": [],
            "meta": {},
            "bus_ref": "b2",
            "p_mw": 1.0,
            "q_mvar": -1.0,
            "model": "pq",
        }
    )
    return payload


def test_zwarcie_nie_pada_przez_wspolczynniki_modelu_rozplywowego() -> None:
    """Analiza ZWARCIOWA nie czyta modelu ZIP — nie wolno jej nim wywrocic.

    Fala przeniesla `validate_zip_coeffs` do `aggregate_zip`, ktore siedzi w
    `map_enm_to_network_graph` — funkcji udokumentowanej jako czysta i wspolnej
    dla zwarcia, walidacji energii, estymacji stanu i wytrzymalosci cieplnej.
    Odbior pojemnosciowy na szynie z odbiorem ZIP konczyl bieg zwarciowy statusem
    FAILED z komunikatem 'ZIP a_Q must be in [0, 1], got 3.0'.
    """
    case_id = "a2-zwarcie"
    set_enm(case_id, EnergyNetworkModel.model_validate(_payload_z_odbiorem_pojemnosciowym()))
    run = execute_run(create_run(case_id=case_id, analysis_type="short_circuit_sn").id)
    assert run.status == "FINISHED", run.error_message
    assert "ZIP" not in (run.error_message or "")


def test_mapowanie_pozostaje_niewywracalne() -> None:
    """`map_enm_to_network_graph` jest czysta funkcja — nie rzuca na modelu odbioru."""
    from enm.mapping import map_enm_to_network_graph

    enm = EnergyNetworkModel.model_validate(_payload_z_odbiorem_pojemnosciowym())
    graph = map_enm_to_network_graph(enm)
    assert graph.nodes
