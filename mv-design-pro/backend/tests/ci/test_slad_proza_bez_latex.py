"""Kontrakt pól kroku śladu na PRZEBIEGU producentów backendu (karta DOWOD-CIEPLNY).

Strażnik ``scripts/slad_proza_bez_latex_guard.py`` sprawdza korpus fikstur frontu.
Ten plik uruchamia producentów kroków — także warianty, których żadna scena harnessu
nie ćwiczy — i stosuje TEN SAM predykat (moduł strażnika, jedno źródło reguły):
pole prozy (``substitution``, ``notes``, ``title``, ``symbol``, ``*_pl``) bez znaczników
LaTeX, pola ``*_latex`` bez ograniczników ``$``.

ILOCZYN CECH (każda kombinacja, w której pomyłka pól mogłaby się schować):
- rdzeń IEC 60909: typ zwarcia (3F, 2F, 1F, 2F+Z) × krok z rejestru granicy / krok
  spoza rejestru (``thevenin_flow_*``) × transformator sieciowy (kroki ``KT[...]``),
  na torze solvera i na torze biegu kanonicznego (wiersz wyniku i ślad biegu);
- przewód: pochodzenie k (katalog / wyprowadzone IEC 60949) × werdykt (spełnia /
  narusza) × przekrój (jest / brak) × rodzaj (kabel / przewód goły);
- krok czasu dowodu cieplnego: nastawa zależna / nastawa niezależna / założenie
  przypadku / czas nierozstrzygnięty;
- wyposażenie: CT (wariant pełny / uproszczony), VT (pomiarowe / zabezpieczeniowe),
  kabel (starzenie), transformator (straty z mocą / bez mocy);
- migotanie: kroki modułu i sumowania.
"""

from __future__ import annotations

import importlib.util
import sys
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

import pytest
from application.analyses.migotanie import build_migotanie_view
from application.analyses.wytrzymalosc_cieplna_przewodow import _krok_czasu
from application.slad_kroku import (
    KLUCZE_ZWARCIA_LATEX_W_PROZIE,
    WZOR_RDZENIA_BILANS,
    WZOR_RDZENIA_PRAD_GALEZI,
    krok_zwarcia_z_latex_w_prozie,
    kroki_zwarcia_w_kontrakcie,
    wzor_zwarcia_na_granicy,
)
from enm.canonical_analysis import (
    create_run,
    execute_run,
    pobierz_slad_rozplywu_biegu,
    reset_canonical_runs,
)
from enm.mapping import build_zero_sequence_zbus, map_enm_to_network_graph
from enm.store import reset_enm_store, set_enm
from network_model.core.czas_wylaczenia import czas_tb_roboczy
from network_model.solvers.conductor_thermal_withstand import (
    CONDUCTOR_KIND_BARE,
    CONDUCTOR_KIND_CABLE,
    ConductorThermalInput,
    check_conductor_thermal_withstand,
)
from network_model.solvers.equipment_checks import (
    CableThermalAgingInput,
    CtBurdenInput,
    CtDeviceBurden,
    TransformerLossesInput,
    VtBurdenInput,
    VtDeviceBurden,
    check_cable_thermal_aging,
    check_ct_burden_saturation,
    check_vt_burden_voltage_drop,
    compute_transformer_losses,
)
from network_model.solvers.equipment_checks.vt_burden_voltage_drop import (
    KATEGORIA_POMIAROWA,
    KATEGORIA_ZABEZPIECZENIOWA,
)
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

from tests.application.analyses.test_migotanie import _bus, _ibg, _sc_run
from tests.cgmes.golden_enm import build_golden_enm

_SKRYPT = Path(__file__).resolve().parents[3] / "scripts" / "slad_proza_bez_latex_guard.py"
_spec = importlib.util.spec_from_file_location("slad_proza_bez_latex_guard", _SKRYPT)
assert _spec is not None and _spec.loader is not None
straznik = importlib.util.module_from_spec(_spec)
sys.modules["slad_proza_bez_latex_guard"] = straznik
_spec.loader.exec_module(straznik)


def _naruszenia(kroki: Iterable[Mapping[str, Any]]) -> list[tuple[str, str, str]]:
    return [
        (str(krok.get("key")), pole, opis)
        for krok in kroki
        for pole, opis in straznik.naruszenia_kroku(dict(krok))
    ]


# ---------------------------------------------------------------------------
# Rdzeń IEC 60909 (B-01): mapowanie po kluczu na granicy aplikacji
# ---------------------------------------------------------------------------

_TYPY_ZWARC = ("3F", "2F", "1F", "2F+Z")


def _slad_solvera(typ: str) -> list[dict[str, Any]]:
    enm = build_golden_enm()
    graf = map_enm_to_network_graph(enm)
    wezel = next(
        node_id for node_id, node in sorted(graf.nodes.items()) if node.voltage_level == 15.0
    )
    wspolne: dict[str, Any] = {
        "graph": graf,
        "fault_node_id": wezel,
        "c_factor": 1.1,
        "tk_s": 1.0,
        "czas_tb": czas_tb_roboczy(),
    }
    if typ == "3F":
        wynik = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            **wspolne, include_branch_contributions=True
        )
    elif typ == "2F":
        wynik = ShortCircuitIEC60909Solver.compute_2ph_short_circuit(**wspolne)
    elif typ == "1F":
        wynik = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            **wspolne, z0_bus=build_zero_sequence_zbus(enm, graf)
        )
    else:
        wynik = ShortCircuitIEC60909Solver.compute_2ph_ground_short_circuit(
            **wspolne, z0_bus=build_zero_sequence_zbus(enm, graf)
        )
    return [dict(krok) for krok in wynik.white_box_trace] + [
        dict(krok) for krok in (getattr(wynik, "branch_flow_trace", None) or [])
    ]


@pytest.mark.parametrize("typ", _TYPY_ZWARC)
def test_rdzen_zwarcia_niesie_kopie_latex_w_prozie_dokladnie_w_krokach_rejestru(typ: str) -> None:
    """Przesłanka mapowania (deklaracja w ``application/slad_kroku.py``) przypięta testem:
    w krokach z rejestru ``substitution`` jest BAJTOWĄ kopią ``substitution_latex``, a
    kroki spoza rejestru nie niosą LaTeX-u w prozie. Zmiana rdzenia, która złamie
    którąkolwiek połowę, zapali ten test zamiast cicho zgubić prozę albo przepuścić LaTeX.
    """
    kroki = _slad_solvera(typ)
    klucze = {str(krok["key"]) for krok in kroki}
    assert KLUCZE_ZWARCIA_LATEX_W_PROZIE <= klucze
    assert any(klucz.startswith("KT[") for klucz in klucze), "sieć złota ma transformator"
    for krok in kroki:
        if krok_zwarcia_z_latex_w_prozie(krok["key"]):
            assert krok["substitution"] == krok["substitution_latex"], krok["key"]
        else:
            assert straznik.naruszenia_kroku(krok) == [], krok["key"]
        # Druga przesłanka: kroki podziału prądu niosą w rdzeniu indeks `ga\l`
        # (nieskładalny w KaTeX-u) — dokładnie ten tekst, który granica podmienia.
        if wzor_zwarcia_na_granicy(krok["key"]) is not None:
            assert krok["formula_latex"] in {WZOR_RDZENIA_PRAD_GALEZI, WZOR_RDZENIA_BILANS}
    if typ == "3F":
        assert any(wzor_zwarcia_na_granicy(k) is not None for k in klucze), "ślad podziału"


@pytest.mark.parametrize("typ", _TYPY_ZWARC)
def test_granica_aplikacji_zdejmuje_latex_z_prozy_i_zachowuje_zapis(typ: str) -> None:
    surowe = _slad_solvera(typ)
    zmapowane = kroki_zwarcia_w_kontrakcie(surowe)

    assert _naruszenia(zmapowane) == []
    assert [k["key"] for k in zmapowane] == [k["key"] for k in surowe]
    for przed, po in zip(surowe, zmapowane, strict=True):
        # Zapis podstawienia nietknięty; wejście (wynik FROZEN) niezmienione.
        assert po.get("substitution_latex") == przed.get("substitution_latex")
        assert "substitution" in przed
        wzor = wzor_zwarcia_na_granicy(przed["key"])
        if krok_zwarcia_z_latex_w_prozie(przed["key"]):
            assert "substitution" not in po
        elif wzor is not None:
            assert po["formula_latex"] == wzor and "ga\\l" not in wzor
            assert {k: v for k, v in po.items() if k != "formula_latex"} == {
                k: v for k, v in przed.items() if k != "formula_latex"
            }
        else:
            assert po == przed
        assert "ga\\l" not in str(po.get("formula_latex"))


@pytest.fixture
def _magazyn_czysty() -> Iterable[None]:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


@pytest.mark.usefixtures("_magazyn_czysty")
@pytest.mark.parametrize("typ", _TYPY_ZWARC)
def test_bieg_kanoniczny_zwarcia_ma_slad_i_wiersze_w_kontrakcie(typ: str) -> None:
    """Tor projektanta: bieg kanoniczny (ślad biegu i wiersze wyniku) — ta sama reguła."""
    set_enm("case-slad-proza", build_golden_enm())
    run = execute_run(
        create_run(
            case_id="case-slad-proza",
            klucz_twin="case-slad-proza",
            analysis_type="short_circuit_sn",
            options={"fault_type": typ},
        ).id
    )
    assert run.status == "FINISHED"
    assert run.white_box_trace
    assert _naruszenia(run.white_box_trace) == []
    wiersze = (run.raw_result or {}).get("results") or []
    assert wiersze
    for wiersz in wiersze:
        assert _naruszenia(wiersz.get("white_box_trace") or []) == []
        # Ślad podziału prądu punktu (inline albo policzony na żądanie) — ta sama granica.
        slad_podzialu = pobierz_slad_rozplywu_biegu(run, str(wiersz["fault_node_id"])) or []
        assert _naruszenia(slad_podzialu) == []
        assert all("ga\\l" not in str(k.get("formula_latex")) for k in slad_podzialu)


# ---------------------------------------------------------------------------
# Kryterium cieplne przewodu (solver spoza B-01 — naprawa u źródła)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("k_z_katalogu", [True, False])
@pytest.mark.parametrize("ith_a", [8000.0, 30000.0])
@pytest.mark.parametrize("przekroj", [120.0, None])
@pytest.mark.parametrize("rodzaj", [CONDUCTOR_KIND_CABLE, CONDUCTOR_KIND_BARE])
def test_slad_przewodu_w_kontrakcie(
    k_z_katalogu: bool, ith_a: float, przekroj: float | None, rodzaj: str
) -> None:
    wynik = check_conductor_thermal_withstand(
        ConductorThermalInput(
            ith_a=ith_a,
            fault_duration_s=0.5,
            ith_1s_a=94.0 * 120.0 if k_z_katalogu else None,
            jth_1s_a_per_mm2=94.0 if k_z_katalogu else None,
            cross_section_mm2=przekroj,
            conductor_material="AL",
            insulation="XLPE" if rodzaj == CONDUCTOR_KIND_CABLE else None,
            temp_operating_c=90.0 if rodzaj == CONDUCTOR_KIND_CABLE else 70.0,
            temp_short_circuit_c=250.0 if rodzaj == CONDUCTOR_KIND_CABLE else 200.0,
            conductor_kind=rodzaj,
        )
    )
    assert _naruszenia(wynik.white_box_trace) == []
    for krok in wynik.white_box_trace:
        assert "substitution" not in krok, krok["key"]
    if wynik.white_box_trace:
        assert all(krok.get("formula_latex") for krok in wynik.white_box_trace)


@pytest.mark.parametrize(
    "wpis",
    [
        {
            "zrodlo": "nastawa_zabezpieczenia",
            "tk_s": 0.42,
            "tms": 0.1,
            "stala_a": 0.14,
            "stala_b": 0.02,
            "prad_galezi_a": 2400.0,
            "prad_rozruchowy_a": 400.0,
            "powod_pl": "Czas z charakterystyki zależnej nastawy.",
        },
        {
            "zrodlo": "nastawa_zabezpieczenia",
            "tk_s": 0.3,
            "prad_galezi_a": 2400.0,
            "powod_pl": "Czas nastawionej zwłoki członu niezależnego.",
        },
        {"zrodlo": "zalozenie_przypadku", "tk_s": 1.0, "powod_pl": "Założenie przypadku."},
        {"zrodlo": "zalozenie_przypadku", "tk_s": None, "powod_pl": "Czas nierozstrzygnięty."},
    ],
    ids=["nastawa-zalezna", "nastawa-niezalezna", "zalozenie", "czas-nierozstrzygniety"],
)
def test_krok_czasu_dowodu_cieplnego_w_kontrakcie(wpis: dict[str, Any]) -> None:
    krok = _krok_czasu(wpis)
    assert _naruszenia([krok]) == []
    assert "substitution" not in krok
    if wpis["tk_s"] is None:
        # Brak liczby do podstawienia to brak pola, nie znak zapytania w dowodzie.
        assert "substitution_latex" not in krok
    else:
        assert krok["substitution_latex"].startswith("t_k = ")


# ---------------------------------------------------------------------------
# Kryteria wyposażenia (solvery spoza B-01 — naprawa u źródła)
# ---------------------------------------------------------------------------

_APARATY_CT = (CtDeviceBurden(nazwa="Przekaźnik", moc_va=2.5),)
_APARATY_VT = (VtDeviceBurden(nazwa="Licznik", moc_va=8.0),)


@pytest.mark.parametrize("rct_ohm", [0.2, None], ids=["wariant-pelny", "wariant-uproszczony"])
def test_slad_ct_w_kontrakcie(rct_ohm: float | None) -> None:
    wynik = check_ct_burden_saturation(
        CtBurdenInput(
            i2n_a=5.0,
            sn_va=10.0,
            alf=20.0,
            dlugosc_przewodu_m=25.0,
            przekroj_przewodu_mm2=4.0,
            obciazenia_aparatow=_APARATY_CT,
            rct_ohm=rct_ohm,
            alf_wymagany=15.0,
        )
    )
    assert len(wynik.white_box_trace) == 5
    assert _naruszenia(wynik.white_box_trace) == []


@pytest.mark.parametrize("kategoria", [KATEGORIA_POMIAROWA, KATEGORIA_ZABEZPIECZENIOWA])
def test_slad_vt_w_kontrakcie(kategoria: str) -> None:
    wynik = check_vt_burden_voltage_drop(
        VtBurdenInput(
            u2n_v=100.0,
            sn_va=30.0,
            kategoria_uzwojenia=kategoria,
            dlugosc_przewodu_m=40.0,
            przekroj_przewodu_mm2=2.5,
            obciazenia_aparatow=_APARATY_VT,
        )
    )
    assert wynik.white_box_trace
    assert _naruszenia(wynik.white_box_trace) == []


@pytest.mark.parametrize("temperatura_pracy_c", [80.0, 100.0])
def test_slad_starzenia_kabla_w_kontrakcie(temperatura_pracy_c: float) -> None:
    wynik = check_cable_thermal_aging(
        CableThermalAgingInput(
            temperatura_pracy_c=temperatura_pracy_c,
            temperatura_znamionowa_c=90.0,
            typ_izolacji="XLPE",
        )
    )
    assert len(wynik.white_box_trace) == 3
    assert _naruszenia(wynik.white_box_trace) == []


@pytest.mark.parametrize("sn_mva", [0.63, None])
def test_slad_strat_transformatora_w_kontrakcie(sn_mva: float | None) -> None:
    wynik = compute_transformer_losses(
        TransformerLossesInput(p0_kw=1.1, pk_kw=10.5, beta=0.6, sn_mva=sn_mva)
    )
    assert wynik.white_box_trace
    assert _naruszenia(wynik.white_box_trace) == []


# ---------------------------------------------------------------------------
# Migotanie — `symbol` jest prozą (ekran pokazuje go tekstem)
# ---------------------------------------------------------------------------


def test_slad_migotania_w_kontrakcie() -> None:
    run = _sc_run(
        generators=[_ibg("g1", "b1", sn_mva=2.0, flicker_c=0.3)],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    wezel = build_migotanie_view(run)["buses"][0]
    kroki = list(wezel["white_box"]) + [
        krok for modul in wezel.get("modules") or [] for krok in modul.get("white_box") or []
    ]
    assert len(kroki) > len(wezel["white_box"])
    assert _naruszenia(kroki) == []


# ---------------------------------------------------------------------------
# Statyczny przegląd producentów kroków w backend/src (karta PROZA-BEZ-SYMBOLI-ASCII)
# ---------------------------------------------------------------------------
#
# DLACZEGO. Testy wyżej biegną przez WYBRANYCH producentów; przegląd karty 2026-11-05 znalazł
# zapis `$…$` i `\cdot` w polach prozy kroków producentów spoza tej listy (łuk elektryczny,
# siła sieci, rezerwa mocy biernej, model zerowy transformatora, doziemienie SN, nastawy
# zabezpieczeń) — każdy przeszedł na zielono, bo żaden test go nie wywoływał. Przegląd AST
# obejmuje KAŻDY krok w kodzie: wywołanie `…Step(...)`, wywołanie z polem kroku
# (`tracer.add(formula_latex=…)`) i literał słownika z polem kroku. Rdzenie B-01 są poza tym
# przeglądem z jednego powodu: niosą kopię LaTeX w prozie z kontraktu FROZEN, a granica
# aplikacji zdejmuje ją po kluczu — pilnują tego testy rdzenia zwarcia wyżej.


def _teksty_wartosci(wezel: Any) -> list[tuple[str, int]]:
    """Teksty wyrażenia (f-string sklejony z `0` w miejscu wstawek); klucze słowników pomija."""
    import ast

    wynik: list[tuple[str, int]] = []

    def zbierz(n: ast.AST) -> None:
        if isinstance(n, ast.JoinedStr):
            tekst = "".join(
                v.value if isinstance(v, ast.Constant) else "0" for v in n.values
            )
            wynik.append((tekst, n.lineno))
        elif isinstance(n, ast.Constant) and isinstance(n.value, str):
            wynik.append((n.value, n.lineno))
        elif isinstance(n, ast.Dict):
            for wartosc in n.values:
                zbierz(wartosc)
        else:
            for dziecko in ast.iter_child_nodes(n):
                zbierz(dziecko)

    zbierz(wezel)
    return wynik


def _naruszenia_statyczne(zrodlo: str, nazwa: str) -> list[str]:
    import ast

    wyniki: list[str] = []
    drzewo = ast.parse(zrodlo)
    # Pomocnik modułu budujący krok (parametr o nazwie pola kroku, np. `_krok(…, substitution,
    # substitution_latex)`): argumenty POZYCYJNE wywołania mapowane na nazwy parametrów.
    pomocniki = {
        f.name: [a.arg for a in f.args.args]
        for f in ast.walk(drzewo)
        if isinstance(f, ast.FunctionDef) and {a.arg for a in f.args.args} & straznik.POLA_KROKU
    }
    for wezel in ast.walk(drzewo):
        pary: list[tuple[str, ast.AST]] = []
        if isinstance(wezel, ast.Call):
            funkcja = getattr(wezel.func, "id", getattr(wezel.func, "attr", ""))
            argumenty = {k.arg for k in wezel.keywords if k.arg}
            if funkcja.endswith("Step") or argumenty & straznik.POLA_KROKU or funkcja in pomocniki:
                pary = [
                    (k.arg, k.value)
                    for k in wezel.keywords
                    if k.arg and straznik.jest_polem_prozy(k.arg)
                ]
                pary += [
                    (nazwa, wartosc)
                    for nazwa, wartosc in zip(pomocniki.get(funkcja, []), wezel.args, strict=False)
                    if straznik.jest_polem_prozy(nazwa)
                ]
        elif isinstance(wezel, ast.Dict):
            klucze = {
                k.value for k in wezel.keys if isinstance(k, ast.Constant) and isinstance(k.value, str)
            }
            if klucze & straznik.POLA_KROKU:
                pary = [
                    (k.value, v)
                    for k, v in zip(wezel.keys, wezel.values, strict=True)
                    if isinstance(k, ast.Constant)
                    and isinstance(k.value, str)
                    and straznik.jest_polem_prozy(k.value)
                ]
        for pole, wartosc in pary:
            for tekst, linia in _teksty_wartosci(wartosc):
                if straznik.znaczniki_latex(tekst):
                    wyniki.append(f"{nazwa}:{linia} [{pole}] {tekst[:80]!r}")
    return wyniki


def test_proza_krokow_w_kodzie_backendu_bez_latex() -> None:
    """Każdy krok śladu zapisany w `backend/src` (poza rdzeniami B-01) ma prozę bez LaTeX."""
    sys.path.insert(0, str(_SKRYPT.parent))
    from rdzenie_b01 import jest_rdzeniem_b01

    src = Path(__file__).resolve().parents[2] / "src"
    naruszenia: list[str] = []
    for plik in sorted(src.rglob("*.py")):
        wzgledna = plik.relative_to(src).as_posix()
        if "__pycache__" in plik.parts or jest_rdzeniem_b01(wzgledna):
            continue
        naruszenia += _naruszenia_statyczne(plik.read_text(encoding="utf-8"), wzgledna)
    assert naruszenia == []


@pytest.mark.parametrize(
    ("kod", "liczba"),
    [
        ('WhiteBoxStep(substitution_pl=f"$I_{{bf}}$={x} kA")', 1),  # wywołanie …Step, f-string
        ('t.add(formula_latex="a", substitution="a \\\\cdot b")', 1),  # pole kroku w wywołaniu
        ('{"formula_latex": "a", "notes": "$Z_1$ = 1"}', 1),  # literał słownika kroku
        ('{"formula_latex": "a", "substitution_latex": "a \\\\cdot b"}', 0),  # pole *_latex
        ('{"formula_latex": "a", "unit_check": {"I\'\'_{k,m}": "kA"}}', 0),  # klucz słownika
        ('WhiteBoxStep(substitution_pl=f"Ibf={x} kA")', 0),  # proza bez LaTeX
        ('{"message_pl": "$U_n$"}', 0),  # słownik bez pola kroku nie jest krokiem
        # pomocnik modułu z parametrem pola kroku × argument pozycyjny {proza, *_latex}
        ('def _krok(k, substitution, substitution_latex): pass\n_krok("a", "$I_C$ = 1", "I_C")', 1),
        ('def _krok(k, substitution, substitution_latex): pass\n_krok("a", "Ic = 1", "I_{C}")', 0),
    ],
)
def test_przeglad_statyczny_rozpoznaje_kroki_i_pola(kod: str, liczba: int) -> None:
    """Iloczyn: postać kroku {…Step, wywołanie z polem kroku, słownik, pomocnik z argumentem
    pozycyjnym} × pole {proza, *_latex, klucz słownika} × treść {LaTeX, bez LaTeX}."""
    assert len(_naruszenia_statyczne(kod, "m.py")) == liczba
