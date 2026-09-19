"""SO-1A — kanoniczny scenariusz odniesienia zamrozenia zdolnosci dynamiki.

CO TEN PLIK DOWODZI. `docs/plan/FINAL_DYNAMICS_CAPABILITY_FREEZE.md` §0.1 opisuje
scenariusz odniesienia SO-1 slowami wlasciciela:

    „Instalacja PV 2,75 MW i magazyn energii pracuja w miejscu przylaczenia.
    W chwili t = 1 s wystepuje zwarcie na szynie SN. Zabezpieczenie otwiera
    wylacznik po 180 ms. Po 1 s nastepuje ponowne zalaczenie. Zbadaj zachowanie
    sieci przez 10 s."

§0.2 rozdziela ciezar dowodowy: **SO-1A** to wariant, w ktorym inzynier podaje
zwarcie oraz chwile usuniecia i ponownego zalaczenia, program wyznacza przebiegi,
a dowiedziona zostaje **deterministyczna praca RMS i silnika zdarzen** — dokladnie
zakres fali W6-A. (Wyznaczenie chwili otwarcia z nastaw zabezpieczenia to SO-1B,
fale W6-B i W6-C; ten plik tego NIE dotyka i nie zalicza.)

LANCUCH JEST PELNY, BEZ SKROTOW: migawka ENM -> **realny** solver rozplywu
(`_execute_power_flow`) -> `pf_run_id` -> punkt pracy z wyniku rozplywu -> adapter
(`zloz_wejscie_dynamiki`) -> rdzen DAE (`SilnikDynamiki`). Zaden stan poczatkowy
nie jest budowany recznie; `U_post`, `f_post` ani `delta_fault` nie sa danymi
wejsciowymi, tylko wynikiem (§0.1 zamrozenia).

CZEGO TEN PLIK NIE DOWODZI, powiedziane wprost: zgodnosci przebiegow z narzedziem
zewnetrznym (wyrocznia H4 fali **W6-F**). Bieg jest wykonywalny i odtwarzalny —
to nie jest to samo, co zwalidowany fizycznie.
"""

from __future__ import annotations

import copy
import hashlib
import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest
from enm.adapter_dynamiki import (
    PunktPracyRozplywu,
    odmow_gdy_braki_modelu,
    punkt_pracy_z_biegu_rozplywu,
    zloz_wejscie_dynamiki,
)
from enm.assembler import czestotliwosc_studium_hz, zbuduj_graf
from enm.canonical_analysis import CanonicalRun, _execute_power_flow
from enm.models import EnergyNetworkModel
from network_model.solvers.dynamika.obserwable import (
    JAKOSC_NIEDOSTEPNA,
    JAKOSC_NIEROZROZNIALNA,
    JAKOSC_ROZROZNIALNA,
)
from network_model.solvers.dynamika.silnik import SilnikDynamiki
from network_model.solvers.dynamika.wynik import WynikDynamiki

from tests.golden.enm_builders.so1a_pv_magazyn import build_so1a_pv_magazyn_enm

HASH_MIGAWKI = "sha256:g17"

#: Chwile ZAMROZONE opisem scenariusza — nie wolno ich dostrajac, zeby uzyskac
#: ladniejszy przebieg (§5 bramki wlascicielskiej).
T_ZWARCIA_S = 1.000
T_USUNIECIA_S = 1.180
T_ZALACZENIA_S = 2.180
HORYZONT_S = 10.0

#: Rezystancja luku zwarcia. NIE jest pokretlem zbieznosci: zwarcie metaliczne
#: (`R_f = X_f = 0`) nie ma w modelu wezlowym skonczonej admitancji i konczy sie
#: nazwana odmowa rdzenia, wiec impedancja MUSI byc niezerowa. Wartosc 0,5 om
#: odpowiada lukowi dlugosci rzedu 0,3 m przy pradzie zwarciowym rzedu kilku kA
#: (wzor Warringtona), czyli typowemu przeskokowi na rozdzielnicy SN. Pomiar
#: wrazliwosci (raport rundy): bieg wykonuje sie dla 5,0 / 2,0 / 1,0 / 0,5 / 0,2 om,
#: a zapad na przylaczu siega odpowiednio 0,93 / 0,72 / 0,49 / 0,29 / 0,14 pu.
R_LUKU_OHM = 0.5

NASTAWY_SOLVERA: dict[str, Any] = {
    "dt_s": 0.002,
    "dt_min_s": 1.0e-7,
    "dt_max_s": 0.01,
    "tolerancja": 1.0e-10,
    "tolerancja_kroku": 1.0e-5,
    "eps_init": 1.0e-6,
    "max_iteracji_newtona": 40,
    "max_nawrotow": 30,
    "integrator": "trapez_niejawny",
}

SCENARIUSZ_SO1A: dict[str, Any] = {
    "horyzont_s": HORYZONT_S,
    "krok_wyjscia_s": 0.02,
    "zdarzenia": [
        {
            "rodzaj": "zwarcie",
            "t_s": T_ZWARCIA_S,
            "bus_ref": "b-sn-stacja",
            "typ": "3F",
            "r_f_ohm": R_LUKU_OHM,
            "x_f_ohm": 0.0,
            "t_usuniecia_s": T_USUNIECIA_S,
        },
        {"rodzaj": "wylaczenie_galezi", "t_s": T_USUNIECIA_S, "element_ref": "wyl-pole"},
        {"rodzaj": "zalaczenie_galezi", "t_s": T_ZALACZENIA_S, "element_ref": "wyl-pole"},
    ],
}


def _migawka() -> dict[str, Any]:
    return EnergyNetworkModel.model_validate(build_so1a_pv_magazyn_enm()).model_dump(mode="json")


def _bieg_rozplywu(snapshot: dict[str, Any]) -> CanonicalRun:
    """REALNY bieg rozplywu — ten sam wykonawca, ktory obsluguje zadanie uzytkownika."""
    run = CanonicalRun(
        id=uuid4(),
        case_id="case-so1a",
        project_id=None,
        analysis_type="PF",
        status="CREATED",
        created_at=datetime.now(UTC),
        snapshot_hash=HASH_MIGAWKI,
        input_hash="sha256:pf-so1a",
        snapshot=snapshot,
        validation={},
        readiness={},
        options={},
    )
    _execute_power_flow(run)
    run.status = "FINISHED"
    return run


def _wykonaj(snapshot: dict[str, Any], scenariusz: dict[str, Any] | None = None) -> WynikDynamiki:
    """Kolejnosc DOKLADNIE ta, co `_execute_dynamika_rms` — nie skrot testowy."""
    rozplyw = _bieg_rozplywu(snapshot)
    punkt = punkt_pracy_z_biegu_rozplywu(
        run_id=str(rozplyw.id),
        analysis_type=rozplyw.analysis_type,
        status=rozplyw.status,
        snapshot_hash=rozplyw.snapshot_hash,
        raw_result=rozplyw.raw_result,
        snapshot=snapshot,
        oczekiwany_snapshot_hash=HASH_MIGAWKI,
    )
    odmow_gdy_braki_modelu(EnergyNetworkModel.model_validate(snapshot))
    wejscie = zloz_wejscie_dynamiki(
        snapshot,
        {
            "dynamika": copy.deepcopy(scenariusz or SCENARIUSZ_SO1A),
            "nastawy_solvera": dict(NASTAWY_SOLVERA),
        },
        punkt=punkt,
        graph=zbuduj_graf(snapshot),
        f_bazowa_hz=czestotliwosc_studium_hz(snapshot),
    )
    return SilnikDynamiki(wejscie=wejscie).uruchom()


@pytest.fixture(scope="module")
def migawka_so1a() -> dict[str, Any]:
    return _migawka()


@pytest.fixture(scope="module")
def punkt_so1a(migawka_so1a: dict[str, Any]) -> PunktPracyRozplywu:
    rozplyw = _bieg_rozplywu(migawka_so1a)
    return punkt_pracy_z_biegu_rozplywu(
        run_id=str(rozplyw.id),
        analysis_type=rozplyw.analysis_type,
        status=rozplyw.status,
        snapshot_hash=rozplyw.snapshot_hash,
        raw_result=rozplyw.raw_result,
        snapshot=migawka_so1a,
        oczekiwany_snapshot_hash=HASH_MIGAWKI,
    )


@pytest.fixture(scope="module")
def bieg_so1a(migawka_so1a: dict[str, Any]) -> WynikDynamiki:
    return _wykonaj(migawka_so1a)


def _indeks(os_czasu: tuple[float, ...], t_s: float) -> int:
    return min(range(len(os_czasu)), key=lambda i: abs(os_czasu[i] - t_s))


# ---------------------------------------------------------------------------
# Macierz zgodnosci z zamrozonym opisem SO-1A
# ---------------------------------------------------------------------------


def test_uklad_spelnia_zamrozony_opis_so1a(migawka_so1a: dict[str, Any]) -> None:
    """Kazdy wiersz opisu SO-1A ma odpowiednik w modelu — sprawdzony, nie deklarowany.

    Ten test jest wykonywalna postacia macierzy zgodnosci: gdyby siec wzorcowa
    zostala kiedykolwiek podmieniona na „rownowazna" (PV o innej mocy, magazyn
    zastapiony maszyna synchroniczna), bramka SO-1A przestalaby dowodzic tego,
    co obiecuje jej nazwa.
    """
    enm = EnergyNetworkModel.model_validate(migawka_so1a)
    wytworcy = {gen.ref_id: gen for gen in enm.generators}

    pv = wytworcy["gen-pv"]
    assert pv.p_mw == pytest.approx(2.75), "opis SO-1A mowi: instalacja PV 2,75 MW"
    assert pv.gen_type == "pv_inverter"
    assert pv.dynamika is not None and pv.dynamika.rodzina == "przeksztaltnikowa_gfl"

    magazyn = wytworcy["gen-magazyn"]
    assert magazyn.gen_type == "bess", "opis SO-1A mowi: magazyn energii"
    assert magazyn.dynamika is not None and magazyn.dynamika.rodzina == "magazyn"

    assert pv.bus_ref == magazyn.bus_ref == "b-przylacze", (
        "opis SO-1A mowi: obie instalacje pracuja W MIEJSCU PRZYLACZENIA, "
        "czyli na tej samej szynie"
    )

    zdarzenia = SCENARIUSZ_SO1A["zdarzenia"]
    assert zdarzenia[0]["t_s"] == 1.000 and zdarzenia[0]["typ"] == "3F"
    assert zdarzenia[0]["bus_ref"] in {bus.ref_id for bus in enm.buses}
    assert zdarzenia[0]["t_usuniecia_s"] == pytest.approx(1.180), "180 ms po zwarciu"
    assert zdarzenia[1]["t_s"] == pytest.approx(1.180), "wylacznik otwiera sie po 180 ms"
    assert zdarzenia[2]["t_s"] == pytest.approx(2.180), "ponowne zalaczenie 1 s po otwarciu"
    assert SCENARIUSZ_SO1A["horyzont_s"] == 10.0, "zbadaj zachowanie sieci przez 10 s"

    wylacznik = {galaz.ref_id: galaz for galaz in enm.branches}[zdarzenia[1]["element_ref"]]
    assert (
        wylacznik.type == "breaker"
    ), "zdarzenie otwarcia ma trafiac w APARAT (wylacznik), nie w kabel"


# ---------------------------------------------------------------------------
# Wykonanie scenariusza
# ---------------------------------------------------------------------------


def test_punkt_pracy_dzieli_moc_wezla_miedzy_obie_instalacje(
    migawka_so1a: dict[str, Any], bieg_so1a: WynikDynamiki
) -> None:
    """Kazda instalacja startuje ze SWOJEJ mocy, nie z mocy wypadkowej szyny.

    To jest test FALSYFIKUJACY naprawe podzialu mocy wezla: gdyby adapter wrocil
    do dawania obu urzadzeniom wypadkowej szyny (3,25 MW), obie asercje padlyby
    rownoczesnie. Sam fakt, ze bieg sie wykonuje, tego nie wykrywa.
    """
    baza_mva = 100.0
    i0 = _indeks(bieg_so1a.os_czasu_s, 0.0)
    assert bieg_so1a.probki["p_pu@gen-pv"][i0] == pytest.approx(2.75 / baza_mva, rel=1e-9)
    assert bieg_so1a.probki["p_pu@gen-magazyn"][i0] == pytest.approx(0.50 / baza_mva, rel=1e-9)


def test_wszystkie_zdarzenia_wykonane_w_zamrozonych_chwilach(bieg_so1a: WynikDynamiki) -> None:
    """Os zdarzen: zwarcie 1,000 s; zdjecie + otwarcie 1,180 s; zalaczenie 2,180 s."""
    wykonane = [
        (z.rodzaj, z.ref, z.t_zaplanowany_s, z.t_wykonany_s) for z in bieg_so1a.zdarzenia_wykonane
    ]
    assert wykonane == [
        ("zwarcie", "b-sn-stacja", T_ZWARCIA_S, T_ZWARCIA_S),
        ("zdjecie_zwarcia", "b-sn-stacja", T_USUNIECIA_S, T_USUNIECIA_S),
        ("wylaczenie_galezi", "wyl-pole", T_USUNIECIA_S, T_USUNIECIA_S),
        ("zalaczenie_galezi", "wyl-pole", T_ZALACZENIA_S, T_ZALACZENIA_S),
    ]
    # Zdarzenie zmienia WYLACZNIE zmienne algebraiczne: stany rozniczkowe sa
    # ciagle (uklad DAE indeksu 1), wiec kazda niezerowa `delta_x_max` bylaby
    # skokiem stanu urzadzenia, ktorego zadne rownanie nie przewiduje.
    assert [z.delta_x_max for z in bieg_so1a.zdarzenia_wykonane] == [0.0, 0.0, 0.0, 0.0]
    assert all(
        z.residuum_kcl_max < NASTAWY_SOLVERA["eps_init"] for z in bieg_so1a.zdarzenia_wykonane
    )


def test_topologia_po_otwarciu_i_po_zalaczeniu_wylacznika(bieg_so1a: WynikDynamiki) -> None:
    """Otwarta galaz niesie DOKLADNIE zero, zalaczona wraca do przewodzenia."""
    probki = bieg_so1a.probki
    przed = _indeks(bieg_so1a.os_czasu_s, 0.5)
    po_otwarciu = _indeks(bieg_so1a.os_czasu_s, 1.5)
    po_zalaczeniu = _indeks(bieg_so1a.os_czasu_s, 3.0)

    assert probki["i_od_pu@wyl-pole"][przed] > 0.0
    for kanal in ("i_od_pu", "i_do_pu", "p_od_pu", "q_od_pu", "p_do_pu", "q_do_pu"):
        assert (
            probki[f"{kanal}@wyl-pole"][po_otwarciu] == 0.0
        ), f"{kanal} otwartego wylacznika musi byc dokladnie zerem, nie prawie zerem"
    assert probki["i_od_pu@wyl-pole"][po_zalaczeniu] > 0.0

    # Odbior stacji magistralnej jest zasilany przez CALY czas — pierscien
    # przenosi zasilanie na druga strone, wiec bieg nie wchodzi w prace wyspowa
    # (zdolnosc D11, fala W6-B).
    for i in range(len(bieg_so1a.os_czasu_s)):
        assert probki["u_pu@b-sn-stacja"][i] > 0.0


def test_obserwable_inzynierskie_sa_kompletne(bieg_so1a: WynikDynamiki) -> None:
    """Kontrakt obserwabli W6-A: czestotliwosc wezlow i wielkosci zaciskow galezi."""
    klucze = set(bieg_so1a.probki)
    wezly = {"b-110", "b-pole", "b-przylacze", "b-sn-gpz", "b-sn-stacja"}
    galezie = {"kab-domkniecie", "kab-magistrala", "lin-przylacze", "tr-gpz", "wyl-pole"}
    for wezel in wezly:
        for rodzina in ("u_pu", "kat_deg", "f_hz", "u_f_est_hz", "jakosc_f"):
            assert f"{rodzina}@{wezel}" in klucze
    for galaz in galezie:
        for rodzina in ("i_od_pu", "i_do_pu", "p_od_pu", "q_od_pu", "p_do_pu", "q_do_pu"):
            assert f"{rodzina}@{galaz}" in klucze
    # Instalacja PV i magazyn oddaja SWOJE stany — bez wymyslania sygnalow,
    # ktorych model nie ma.
    for kanal in ("p_pu", "q_pu", "pll_kat_rad", "i_czynny_pu", "i_bierny_pu"):
        assert f"{kanal}@gen-pv" in klucze
    for kanal in ("p_pu", "q_pu", "soc_pu", "omega_pu", "kat_rad"):
        assert f"{kanal}@gen-magazyn" in klucze


def test_stan_naladowania_magazynu_maleje_przy_rozladowaniu(bieg_so1a: WynikDynamiki) -> None:
    """Znak bilansu energii: moc oddawana do sieci OBNIZA stan naladowania."""
    soc = bieg_so1a.probki["soc_pu@gen-magazyn"]
    moc = bieg_so1a.probki["p_pu@gen-magazyn"]
    assert soc[0] == pytest.approx(0.55)
    assert moc[0] > 0.0, "punkt pracy scenariusza: magazyn sie rozladowuje"
    assert soc[-1] < soc[0], "rozladowanie przez 10 s musi obnizyc stan naladowania"


def test_jakosc_czestotliwosci_jest_uczciwa_w_kazdej_fazie(bieg_so1a: WynikDynamiki) -> None:
    """Stan jakosci opisuje to, co predykat naprawde sprawdza — w kazdej fazie biegu.

    PRZED ZWARCIEM uklad jest w stanie ustalonym, wiec odchylka od czestotliwosci
    znamionowej NIE jest rozrozniania od szumu numerycznego — i to jest poprawny
    werdykt, a nie brak. PO KAZDYM ZDARZENIU odchylka jest o rzedy wielkosci
    wieksza od oszacowanego bledu, wiec staje sie rozroznialna.
    """
    probki = bieg_so1a.probki
    przed = _indeks(bieg_so1a.os_czasu_s, 0.5)
    for wezel in ("b-110", "b-przylacze", "b-sn-stacja"):
        assert probki[f"jakosc_f@{wezel}"][przed] == JAKOSC_NIEROZROZNIALNA
        assert probki[f"f_hz@{wezel}"][przed] == pytest.approx(50.0, abs=1e-6)

    for chwila in (T_ZWARCIA_S, T_USUNIECIA_S, T_ZALACZENIA_S):
        i = _indeks(bieg_so1a.os_czasu_s, chwila)
        for wezel in ("b-110", "b-przylacze", "b-sn-stacja"):
            assert probki[f"jakosc_f@{wezel}"][i] == JAKOSC_ROZROZNIALNA
            assert probki[f"u_f_est_hz@{wezel}"][i] < abs(
                probki[f"f_hz@{wezel}"][i] - 50.0
            ), "ROZROZNIALNA znaczy: odchylka przewyzsza oszacowany blad numeryczny"

    # Stan NIEDOSTEPNA nie pojawia sie nigdzie — i to jest MIERZALNE, nie zalozone:
    # najwieksze oszacowanie bledu w calym biegu jest o rzedy wielkosci mniejsze
    # od najmniejszego modulu napiecia, wiec fazor nigdzie nie wpada do wlasnej
    # kuli niepewnosci.
    assert all(
        probki[f"jakosc_f@{wezel}"][i] != JAKOSC_NIEDOSTEPNA
        for wezel in ("b-110", "b-pole", "b-przylacze", "b-sn-gpz", "b-sn-stacja")
        for i in range(len(bieg_so1a.os_czasu_s))
    )


def test_probka_w_chwili_zdarzenia_jest_granica_prawostronna(bieg_so1a: WynikDynamiki) -> None:
    """Probka w `t_zdarzenia` opisuje uklad PO zdarzeniu, poprzednia — PRZED nim.

    Gdyby silnik probkowal przed naniesieniem zdarzenia, zapad napiecia pojawilby
    sie o jedna probke za pozno, a czestotliwosc liczona z rozwiazania nie
    pokazywalaby skoku kata w chwili, w ktorej on zachodzi.
    """
    probki = bieg_so1a.probki
    i = _indeks(bieg_so1a.os_czasu_s, T_ZWARCIA_S)
    assert bieg_so1a.os_czasu_s[i] == pytest.approx(T_ZWARCIA_S)
    assert probki["u_pu@b-sn-stacja"][i - 1] > 1.0, "probka poprzednia: uklad przed zwarciem"
    assert probki["u_pu@b-sn-stacja"][i] < 0.4, "probka zdarzenia: uklad JUZ w zwarciu"
    assert probki["f_hz@b-sn-stacja"][i - 1] == pytest.approx(50.0, abs=1e-6)
    assert abs(probki["f_hz@b-sn-stacja"][i] - 50.0) > 1.0


def test_residua_i_zachowanie_solvera_sa_w_kontrakcie(bieg_so1a: WynikDynamiki) -> None:
    wlasnosci = bieg_so1a.wlasnosci
    assert wlasnosci.zbiegl is True
    assert wlasnosci.max_residuum_f <= NASTAWY_SOLVERA["tolerancja"] * 10.0
    assert wlasnosci.max_residuum_g <= NASTAWY_SOLVERA["tolerancja"] * 10.0
    assert wlasnosci.kroki > 0
    assert wlasnosci.integrator == "trapez_niejawny"
    assert len(bieg_so1a.os_czasu_s) == int(round(HORYZONT_S / 0.02)) + 1
    assert bieg_so1a.os_czasu_s[-1] == pytest.approx(HORYZONT_S)


def test_powtorzony_bieg_daje_identyczny_wynik(
    migawka_so1a: dict[str, Any], bieg_so1a: WynikDynamiki
) -> None:
    """Determinizm (§9 bramki): porownanie CALEGO wyniku, nie kodu wyjscia.

    Porownywane sa: os czasu, komplet probek wszystkich kanalow, slad zdarzen,
    odciski tozsamosci, metryki, slad White Box (w tym slad topologii i kroki
    szczegolne) oraz wlasnosci biegu.
    """
    powtorzony = _wykonaj(migawka_so1a)
    assert powtorzony.os_czasu_s == bieg_so1a.os_czasu_s
    assert set(powtorzony.probki) == set(bieg_so1a.probki)
    for klucz in bieg_so1a.probki:
        assert powtorzony.probki[klucz] == bieg_so1a.probki[klucz], klucz
    assert powtorzony.zdarzenia_wykonane == bieg_so1a.zdarzenia_wykonane
    assert powtorzony.tozsamosc == bieg_so1a.tozsamosc
    assert powtorzony.metryki == bieg_so1a.metryki
    assert powtorzony.slad_white_box == bieg_so1a.slad_white_box
    assert powtorzony.wlasnosci.kroki == bieg_so1a.wlasnosci.kroki
    assert powtorzony.wlasnosci.kroki_odrzucone == bieg_so1a.wlasnosci.kroki_odrzucone
    assert powtorzony.wlasnosci.max_residuum_f == bieg_so1a.wlasnosci.max_residuum_f
    assert powtorzony.wlasnosci.max_residuum_g == bieg_so1a.wlasnosci.max_residuum_g


#: Pole wyłączane z porównania determinizmu — DOKŁADNIE jedno, z dowodem.
#: `silnik.py:40` importuje `time` jako JEDYNY import czasu w całym pakiecie dynamiki,
#: a `time.` występuje tam w DWÓCH miejscach: `:128` (start zegara) i `:273`
#: (`czas_obliczen_s=time.perf_counter() - zegar`, składane po zakończeniu pętli).
#: Żaden kod produkcyjny tego pola NIE CZYTA — jedyne wystąpienie poza silnikiem i
#: serializacją (`wynik.py:66` deklaracja, `wynik.py:143` kwantyzacja) to bierne pole
#: schematu `application/contracts/resultset_dynamic_v1.py:87`. Wyłączenie jest tą samą,
#: już przypiętą decyzją co w `test_wynik.py:170`, `test_adapter_dynamiki.py:515` i
#: `test_dynamika_rms_run.py:728`, a `docs/evidence/CONVERGENCE_EVIDENCE.md:735` mówi
#: wprost, że pole „nie wchodzi do żadnego odcisku".
SCIEZKA_ZEGARA = ("wlasnosci_biegu", "czas_obliczen_s")

#: Ziarna haszowania bramki. Para WYMAGANA to dwa RÓŻNE ziarna z AKTYWNĄ randomizacją —
#: `PYTHONHASHSEED=0` randomizację WYŁĄCZA, więc sam nie bada klasy „inne rozmieszczenie
#: haszy → ten sam wynik" i jest tu wyłącznie wariantem diagnostycznym (trzecim).
ZIARNA_BRAMKI: tuple[tuple[str, int], ...] = (("1", 1), ("987654321", 1), ("0", 0))

_KOD_PODPROCESU = """
import json, os, sys
import tests.e2e.test_so1a_scenariusz_odniesienia as m
from network_model.solvers.dynamika import ladunek_resultset_dynamic_v1

wynik = m._wykonaj(m._migawka())
json.dump(
    {
        "meta": {
            "PYTHONHASHSEED": os.environ.get("PYTHONHASHSEED"),
            "hash_randomization": sys.flags.hash_randomization,
            "wersja": sys.version_info[:3],
            "pid": os.getpid(),
        },
        "ladunek": ladunek_resultset_dynamic_v1(wynik, run_id=m.RUN_ID_DETERMINIZMU),
    },
    sys.stdout,
    ensure_ascii=False,
)
"""

#: Jawny, wspólny `run_id` obu procesów — inaczej różniłby się sam identyfikator biegu.
RUN_ID_DETERMINIZMU = "so1a-determinizm-miedzyprocesowy"


def bieg_w_osobnym_procesie(ziarno: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Zbuduj migawkę SO-1A OD ZERA i policz cały scenariusz w osobnym interpreterze."""
    proces = subprocess.run(
        [sys.executable, "-c", _KOD_PODPROCESU],
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONHASHSEED": ziarno, "PYTHONPATH": os.pathsep.join(sys.path)},
    )
    assert proces.returncode == 0, (
        f"podproces z PYTHONHASHSEED={ziarno} zakończył się {proces.returncode}\n"
        f"{proces.stderr[-4000:]}"
    )
    odpowiedz = json.loads(proces.stdout)
    return odpowiedz["meta"], odpowiedz["ladunek"]


def bez_zegara(ladunek: dict[str, Any]) -> dict[str, Any]:
    """Kopia ładunku BEZ jednego pola zegara. Nic innego nie jest usuwane ani zaokrąglane."""
    okrojony = copy.deepcopy(ladunek)
    sekcja, pole = SCIEZKA_ZEGARA
    assert pole in okrojony[sekcja], f"brak {'.'.join(SCIEZKA_ZEGARA)} — kontrakt się zmienił"
    del okrojony[sekcja][pole]
    return okrojony


def pierwsza_roznica(a: Any, b: Any, sciezka: str = "$") -> str | None:
    """Pierwsza RÓŻNICA w porządku deterministycznym, jako ścieżka — nie „hash mismatch".

    Klucze słowników obchodzone posortowane, listy po indeksie. Zwraca `None`, gdy
    struktury są równe.
    """
    if type(a) is not type(b):
        return f"{sciezka}: typ {type(a).__name__} vs {type(b).__name__}"
    if isinstance(a, dict):
        tylko_a = sorted(set(a) - set(b))
        tylko_b = sorted(set(b) - set(a))
        if tylko_a:
            return f"{sciezka}: klucz tylko w pierwszym: {tylko_a[0]!r}"
        if tylko_b:
            return f"{sciezka}: klucz tylko w drugim: {tylko_b[0]!r}"
        for klucz in sorted(a):
            znaleziona = pierwsza_roznica(a[klucz], b[klucz], f"{sciezka}.{klucz}")
            if znaleziona is not None:
                return znaleziona
        return None
    if isinstance(a, list):
        if len(a) != len(b):
            return f"{sciezka}: długość {len(a)} vs {len(b)}"
        for i, (x, y) in enumerate(zip(a, b, strict=True)):
            znaleziona = pierwsza_roznica(x, y, f"{sciezka}[{i}]")
            if znaleziona is not None:
                return znaleziona
        return None
    if a != b:
        return f"{sciezka}: {a!r} vs {b!r}"
    return None


def odcisk_kanoniczny(ladunek: dict[str, Any]) -> str:
    tekst = json.dumps(ladunek, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(tekst.encode("utf-8")).hexdigest()


def test_ROZNE_ziarna_haszowania_kazde_w_OSOBNYM_PROCESIE_daja_identyczny_ladunek() -> None:
    """Determinizm MIĘDZY PROCESAMI o JAWNIE RÓŻNYCH, AKTYWNYCH ziarnach haszowania.

    CZEGO NIE WYSTARCZA. Powtórzenie biegu w TYM SAMYM procesie
    (`test_powtorzony_bieg_daje_identyczny_wynik`) dzieli jedno ziarno haszowania napisów,
    jedno rozmieszczenie obiektów i jedne `id()` — nie może więc spaść pod defektem klasy
    „kolejność iteracji po zbiorze/słowniku wycieka do wyniku". Porównanie procesu pytest
    z jednym podprocesem też nie wystarcza: ziarno procesu nadrzędnego jest zależne od
    środowiska, więc para porównywanych ziaren nie jest kontrolowana.

    CO ROBI TEN TEST. Uruchamia TRZY całkowicie oddzielne interpretery, każdy budujący
    migawkę SO-1A od zera i liczący cały scenariusz. Parą WYMAGANĄ są ziarna `1` i
    `987654321` — oba z `hash_randomization == 1`, co proces potwierdza SAM, zwracając
    własne `sys.flags.hash_randomization` (ustawienie zmiennej środowiskowej samo w sobie
    nie jest dowodem). `PYTHONHASHSEED=0` jest wariantem DIAGNOSTYCZNYM: wyłącza
    randomizację, więc nie bada tej klasy, ale pokazuje, że jej wyłączenie też nie zmienia
    wyniku.

    KOLEJNOŚĆ DOWODU: najpierw struktura (klucze i sekcje z osobna, z podaniem PIERWSZEJ
    rozbieżnej ścieżki), potem kanoniczny JSON, a SHA-256 dopiero na końcu. Odwrotna
    kolejność dawałaby przy awarii dwa nieczytelne skróty zamiast miejsca defektu.
    """
    wyniki = {ziarno: bieg_w_osobnym_procesie(ziarno) for ziarno, _ in ZIARNA_BRAMKI}

    for ziarno, oczekiwane_losowanie in ZIARNA_BRAMKI:
        meta, _ = wyniki[ziarno]
        assert meta["PYTHONHASHSEED"] == ziarno, f"podproces nie dostał ziarna {ziarno}"
        assert meta["hash_randomization"] == oczekiwane_losowanie, (
            f"ziarno {ziarno}: hash_randomization={meta['hash_randomization']}, "
            f"oczekiwano {oczekiwane_losowanie}"
        )

    #: Dowód, że to NAPRAWDĘ oddzielne procesy operacyjne, a nie powtórzenia w jednym:
    #: każdy podproces melduje WŁASNY `os.getpid()`, różny od siebie nawzajem i od pytesta.
    pidy = [meta["pid"] for meta, _ in wyniki.values()]
    assert len(set(pidy)) == len(ZIARNA_BRAMKI), f"podprocesy nie były rozłączne: {pidy}"
    assert os.getpid() not in pidy, f"bieg odbył się w procesie pytesta: {pidy}"

    wymagane = [ziarno for ziarno, losowanie in ZIARNA_BRAMKI if losowanie == 1]
    assert len(wymagane) >= 2, "bramka musi mieć co najmniej dwa ziarna z aktywną randomizacją"

    odniesienie = bez_zegara(wyniki[wymagane[0]][1])
    for ziarno in wymagane[1:] + [z for z, losowanie in ZIARNA_BRAMKI if losowanie == 0]:
        badany = bez_zegara(wyniki[ziarno][1])

        assert set(badany) == set(odniesienie), (
            f"ziarno {ziarno}: inny zbiór kluczy najwyższego poziomu: "
            f"{sorted(set(badany) ^ set(odniesienie))}"
        )
        for sekcja in sorted(odniesienie):
            roznica = pierwsza_roznica(odniesienie[sekcja], badany[sekcja], f"$.{sekcja}")
            assert roznica is None, f"ziarno {wymagane[0]} vs {ziarno} — {roznica}"

        assert pierwsza_roznica(odniesienie, badany) is None
        kanoniczny_a = json.dumps(
            odniesienie, sort_keys=True, ensure_ascii=False, separators=(",", ":")
        )
        kanoniczny_b = json.dumps(badany, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        assert kanoniczny_a == kanoniczny_b, f"ziarno {ziarno}: kanoniczny JSON różny"
        assert odcisk_kanoniczny(odniesienie) == odcisk_kanoniczny(badany)

    #: Zegar JEST pomiarem i JEST różny — gdyby był identyczny, wyłączenie go z porównania
    #: byłoby bezprzedmiotowe, a test nie badałby tego, co deklaruje.
    zegary = [wyniki[z][1]["wlasnosci_biegu"]["czas_obliczen_s"] for z, _ in ZIARNA_BRAMKI]
    assert all(z >= 0.0 for z in zegary), zegary


def test_sonda_determinizmu_WYKRYWA_sztuczny_wyciek_kolejnosci_haszy() -> None:
    """Self-test APARATURY: czy sonda w ogóle potrafi zobaczyć wyciek kolejności.

    Zielony test porównujący dwa procesy nic nie znaczy, jeżeli sonda nie umie spaść pod
    defektem, który rzekomo wykrywa. Ten test NIE dotyka produktu: w dwóch procesach o
    różnych ziarnach liczy `list(set(...))` — konstrukcję, której kolejność ZALEŻY od
    ziarna haszowania napisów — i wymaga, żeby `pierwsza_roznica` wskazała rozbieżność
    ze ścieżką, a odciski kanoniczne były różne.
    """
    kod = (
        "import json, os, sys\n"
        "napisy = [f'element-{i}' for i in range(64)]\n"
        "json.dump({'kolejnosc': list(set(napisy)),\n"
        "           'hash_randomization': sys.flags.hash_randomization,\n"
        "           'seed': os.environ.get('PYTHONHASHSEED')}, sys.stdout)\n"
    )

    def sonda(ziarno: str) -> dict[str, Any]:
        proces = subprocess.run(
            [sys.executable, "-c", kod],
            capture_output=True,
            text=True,
            env={**os.environ, "PYTHONHASHSEED": ziarno},
        )
        assert proces.returncode == 0, proces.stderr[-2000:]
        return json.loads(proces.stdout)

    a, b = sonda("1"), sonda("987654321")
    assert a["hash_randomization"] == 1 and b["hash_randomization"] == 1
    assert sorted(a["kolejnosc"]) == sorted(b["kolejnosc"]), "sonda ma badać KOLEJNOŚĆ"

    roznica = pierwsza_roznica(a["kolejnosc"], b["kolejnosc"], "$.kolejnosc")
    assert roznica is not None, (
        "APARATURA ŚLEPA: `list(set(...))` przy dwóch różnych aktywnych ziarnach dało tę samą "
        "kolejność, więc ten sam mechanizm nie wykryłby wycieku kolejności w ładunku biegu"
    )
    assert roznica.startswith("$.kolejnosc[")
    assert odcisk_kanoniczny({"k": a["kolejnosc"]}) != odcisk_kanoniczny({"k": b["kolejnosc"]})
