"""Inwentarz klasy „wartość współczynnika c poza jedynym miejscem tabeli" (karta
WSPOLCZYNNIK-C-JEDEN-NOSNIK, reguła KLASA, NIE INSTANCJA §1 i §4).

Obietnica z docstringu ``network_model/core/voltage_factor.py``: „no other module may hold
a c value". Bez testu byłaby fałszywą pewnością — przed kartą c żyło w siedmiu miejscach
(stałe ``C_MIN``/``C_MAX`` solvera FROZEN, ``0,95``/``1,05`` pętli zwarcia IEC 60364,
domyślka ``c_max = 1,1`` maszyny synchronicznej, pola ``Source.c_max``/``c_min``, metody
``get_ikss_lv_cmax_ka``/``cmin_ka`` gałęzi, ``c_factor: 1.10`` żądań API).

Trzy warstwy, każda zamknięta:

1. Literał wartości z tabeli 1 (1,05 · 1,10 · 0,95 · 0,90; także 1,00 nie jest szukane, bo
   jest wszędzie) w INSTRUKCJI, która nazywa współczynnik napięciowy (identyfikator, klucz
   słownika albo argument nazwany ``c``, ``c_max``, ``c_min``, ``c_factor``, ``c_q``,
   ``voltage_factor``…) — w CAŁYM ``backend/src``, także w katalogach. Lista wyjątków
   zamknięta: stała 0,95 wzoru K_T (IEC 60909-0 eq. 12a), która nie jest wartością c.
2. Spis WSZYSTKICH literałów 1,05 · 1,1 · 0,95 · 0,9 w kodzie poza modułami danych katalogu
   (``network_model/catalog/**`` — tabele cos φ, i0, sprawności, współczynników
   obciążalności) i poza ``voltage_factor.py``: zamknięta lista ``(plik, linia) → liczba``
   z uzasadnieniem merytorycznym, czemu to nie c. Nowy literał w dowolnym miejscu jest
   czerwony, dopóki ktoś nie wpisze, czym jest — tak wyszłaby na jaw np. ``c = wsp = 1.1``
   pod nazwą, której warstwa 1 nie rozpoznaje.
3. Prywatna tabela (``_TABELA_1*``) nie jest importowana ani czytana atrybutem poza swoim
   modułem — w ``backend/src`` i ``backend/tests``.
"""

from __future__ import annotations

import ast
import re
from collections import Counter
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[2]
_SRC = _BACKEND / "src"
_TESTS = _BACKEND / "tests"
_MODUL_TABELI = "network_model/core/voltage_factor.py"
_KATALOGI = "network_model/catalog/"

_WARTOSCI_C = (1.05, 1.1, 0.95, 0.9)

#: Identyfikator nazywający współczynnik napięciowy c (IEC 60909-0 tab. 1).
_NAZWA_C = re.compile(
    r"(?i)^(c|c_(max|min|factor|q|tab\w*|zrodlo\w*|nn|sn|wn)|\w*_c_(max|min|factor))$"
    r"|voltage_factor|wspolczynnik_?c\b|wspolczynnik_napieciowy|tabel\w*_?1|tab_?1_"
)

#: Warstwa 1 — zamknięte wyjątki: (plik względem src, linia bez wcięcia) → powód.
_WYJATKI_KONTEKSTU: dict[tuple[str, str], str] = {
    ("network_model/core/branch.py", "return 0.95 * c_max / (1.0 + 0.6 * x_t)"): (
        "stała 0,95 wzoru K_T = 0,95·c_max/(1 + 0,6·x_T), IEC 60909-0:2016 eq. 12a — "
        "część wzoru normy, nie wartość c; c_max czytane z voltage_factor"
    ),
}

#: Warstwa 2 — spis literałów poza katalogami: (plik, linia bez wcięcia) → (liczba, powód).
_SPIS: dict[tuple[str, str], tuple[int, str]] = {
    ("network_model/core/branch.py", "return 0.95 * c_max / (1.0 + 0.6 * x_t)"): (
        1,
        "stała 0,95 wzoru K_T (IEC 60909-0 eq. 12a), wyjątek warstwy 1",
    ),
    ("analysis/boundary/identifier.py", "confidence=0.95,"): (1, "pewność identyfikacji"),
    (
        "analysis/sanity_bounds/parametry_linii_bounds.py",
        'PasmoParametruLinii("b0_do_b1", "Stosunek B′0/B′1", "—", 0.35, 0.90),',
    ): (
        1,
        "górna granica pasma wiarygodności stosunku B′0/B′1 linii napowietrznej, nie c",
    ),
    ("analysis/energy_validation/builder.py", "if cos_phi >= 0.9:"): (
        1,
        "próg cos φ bilansu mocy biernej",
    ),
    ("analysis/energy_validation/builder.py", "limit_warn=0.9,"): (1, "próg ostrzeżenia cos φ"),
    ("api/analysis_runs.py", "k_bth: float = Query(default=1.1),"): (
        3,
        "k_bth — współczynnik cieplny nastaw zabezpieczeń (Hoppel), nie c",
    ),
    ("application/analyses/migotanie.py", "PLANNING_LEVEL_PST_MV = 0.9"): (
        1,
        "poziom planistyczny P_st SN (IEC/TR 61000-3-7)",
    ),
    (
        "application/analyses/protection/coordination/analyzer.py",
        "KROTNOSC_TCC_OD = 1.05",
    ): (1, "początek osi krotności charakterystyki czasowo-prądowej"),
    (
        "application/proof_engine/packs/p14_power_flow.py",
        "if data.v_min_pu < 0.9 or data.v_max_pu > 1.1:",
    ): (2, "pasmo napięcia ±10 % U_n rozpływu (PN-EN 50160)"),
    (
        "application/proof_engine/packs/p14_power_flow.py",
        "in_range = 0.9 <= data.v_min_pu and data.v_max_pu <= 1.1",
    ): (2, "pasmo napięcia ±10 % U_n rozpływu (PN-EN 50160)"),
    ("application/proof_engine/packs/protection_settings.py", "k_bth: float = 1.1"): (
        1,
        "k_bth — współczynnik cieplny nastaw zabezpieczeń, nie c",
    ),
    ("application/proof_engine/pakiet_nastaw.py", "k_bth: float = 1.1,"): (
        3,
        "k_bth — współczynnik cieplny nastaw zabezpieczeń, nie c",
    ),
    ("application/protection_read_model.py", "_IT_CURVE_CURRENT_RANGE = (1.1, 20.0)"): (
        1,
        "zakres krotności prądu krzywej zabezpieczenia",
    ),
    ("application/protection_settings/batch_run.py", "k_bth: float = 1.1,"): (
        2,
        "k_bth — współczynnik cieplny nastaw zabezpieczeń, nie c",
    ),
    ("application/protection_settings/engine.py", '"short": 1.05,  # < 30% of total line'): (
        1,
        "tabela k_bth wg długości linii (Hoppel tab. 7)",
    ),
    ("application/protection_settings/engine.py", '"medium": 1.10,  # 30-70% of total line'): (
        1,
        "tabela k_bth wg długości linii (Hoppel tab. 7)",
    ),
    (
        "application/protection_settings/engine.py",
        "k_bth: float = 1.1  # Thermal correction factor",
    ): (
        1,
        "k_bth — współczynnik cieplny nastaw zabezpieczeń, nie c",
    ),
    (
        "application/reference_patterns/pattern_line_i_doubleprime_thermal_spz.py",
        'k_bth=fixture.get("k_bth", 1.1),',
    ): (1, "k_bth wzorca referencyjnego, nie c"),
    ("application/station_templates/schema.py", "COS_PHI_ODBIORU_NN_SZABLONU = 0.95"): (
        1,
        "cos φ odbioru nN szablonu stacji",
    ),
    ("enm/validator.py", "and 0.9 <= float(u_set_pu) <= 1.1"): (
        2,
        "dopuszczalne napięcie zadane generatora 0,9–1,1 p.u.",
    ),
    ("network_model/core/generator.py", "cos_phi: float = 0.9"): (1, "cos φ generatora"),
    ("network_model/core/generator.py", "k_sc: float = 1.1"): (
        2,
        "k_sc — krotność prądu zwarciowego falownika, nie c",
    ),
    (
        "network_model/core/wklad_zwarciowy_przeksztaltnika.py",
        "K_SC_DOMYSLNY_SYSTEMOWY: float = 1.1",
    ): (
        1,
        "k_sc systemowy falownika (IEC 60909-0 §6.6.2), nie c",
    ),
    ("network_model/solvers/cable_ampacity_derating.py", "f_grunt=0.90,"): (
        1,
        "współczynnik obciążalności kabla w gruncie",
    ),
    ("network_model/solvers/dynamika/silnik.py", "MARGINES_DOBORU_KROKU = 0.9"): (
        1,
        "margines doboru kroku całkowania",
    ),
    ("network_model/solvers/frt_hvrt/engine.py", "p_recovered_threshold = 0.95 * pre_fault_p"): (
        1,
        "próg odbudowy mocy czynnej po zwarciu (FRT)",
    ),
    (
        "network_model/solvers/v126_academic.py",
        "i_n = motor.rated_kw / (math.sqrt(3) * motor.rated_voltage_kv * 0.9)",
    ): (1, "η·cos φ silnika w rozruchu (moduł akademicki)"),
    ("network_model/solvers/v126_academic.py", "if probability >= 0.95:"): (
        1,
        "poziom ufności Monte Carlo hosting capacity",
    ),
    # Dawne MCOV ogranicznika 1,05·U_m i 1,05·U_m/√3 (`v126_academic._insulation`) skasowane
    # kartą UX-04/POLE-ZU-SKLADOWA-ZEROWA: U_c dobierany z U_TOV = k·U_m/√3 trybu doziemienia.
    (
        "network_model/solvers/v126_academic.py",
        "if 0.90 <= voltage <= 1.10 and kryterium_pradowe:",
    ): (2, "pasmo napięcia ±10 % U_n hosting capacity"),
    # Fasada `protection/curves/curve_calculator.py` skasowana w partii integracji 10 —
    # jej literał zakresu krotności zniknął razem z plikiem (zostaje w `iec_curves.py`).
    ("protection/curves/iec_curves.py", "current_range: tuple[float, float] = (1.1, 20.0),"): (
        1,
        "zakres krotności prądu krzywej IEC 60255",
    ),
    ("protection/curves/ieee_curves.py", "current_range: tuple[float, float] = (1.1, 20.0),"): (
        1,
        "zakres krotności prądu krzywej IEEE C37.112",
    ),
}


def _moduly(korzen: Path) -> list[tuple[str, ast.Module, list[str]]]:
    wynik = []
    for sciezka in sorted(korzen.rglob("*.py")):
        if "__pycache__" in sciezka.parts:
            continue
        tekst = sciezka.read_text(encoding="utf-8")
        wynik.append((sciezka.relative_to(korzen).as_posix(), ast.parse(tekst), tekst.splitlines()))
    return wynik


def _literal_c(wezel: ast.AST) -> bool:
    return (
        isinstance(wezel, ast.Constant)
        and isinstance(wezel.value, float)
        and wezel.value in _WARTOSCI_C
    )


def _nazwy_instrukcji(instrukcja: ast.AST) -> set[str]:
    nazwy: set[str] = set()
    for wezel in ast.walk(instrukcja):
        if isinstance(wezel, ast.Name):
            nazwy.add(wezel.id)
        elif isinstance(wezel, ast.Attribute):
            nazwy.add(wezel.attr)
        elif isinstance(wezel, ast.keyword) and wezel.arg:
            nazwy.add(wezel.arg)
        elif isinstance(wezel, ast.arg):
            nazwy.add(wezel.arg)
        elif isinstance(wezel, ast.Constant) and isinstance(wezel.value, str):
            if len(wezel.value) <= 40 and re.fullmatch(r"[A-Za-z_]\w*", wezel.value):
                nazwy.add(wezel.value)  # klucz słownika / nazwa pola
    return nazwy


def _instrukcje_proste(modul: ast.Module):
    """Instrukcje bez zagnieżdżonych ciał (dla def/class/if — tylko nagłówek)."""
    for wezel in ast.walk(modul):
        if isinstance(wezel, ast.stmt) and not hasattr(wezel, "body"):
            yield wezel
        elif isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef):
            yield from (a for a in wezel.args.defaults + wezel.args.kw_defaults if a is not None)
        elif isinstance(wezel, ast.If | ast.While):
            yield wezel.test


def _kandydaci_c(modul: ast.Module, linie: list[str]) -> list[tuple[str, int]]:
    wynik = []
    for instrukcja in _instrukcje_proste(modul):
        if not any(_literal_c(w) for w in ast.walk(instrukcja)):
            continue
        if any(_NAZWA_C.search(n) for n in _nazwy_instrukcji(instrukcja)):
            wynik.append((linie[instrukcja.lineno - 1].strip(), instrukcja.lineno))
    # argument domyślny funkcji z nazwą c: `def f(c_max: float = 1.1)`
    for wezel in ast.walk(modul):
        if isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef):
            argi = wezel.args.args + wezel.args.kwonlyargs
            pary = list(
                zip(argi[len(argi) - len(wezel.args.defaults) :], wezel.args.defaults, strict=False)
            )
            pary += [
                (a, d)
                for a, d in zip(wezel.args.kwonlyargs, wezel.args.kw_defaults, strict=False)
                if d
            ]
            for arg, domyslna in pary:
                if _literal_c(domyslna) and _NAZWA_C.search(arg.arg):
                    wynik.append((linie[domyslna.lineno - 1].strip(), domyslna.lineno))
        elif isinstance(wezel, ast.AnnAssign) and _literal_c(wezel.value or ast.Pass()):
            if isinstance(wezel.target, ast.Name) and _NAZWA_C.search(wezel.target.id):
                wynik.append((linie[wezel.lineno - 1].strip(), wezel.lineno))
    return sorted(set(wynik), key=lambda p: p[1])


def test_skaner_widzi_tabele_w_jej_jedynym_miejscu() -> None:
    """Samosprawdzenie skanera: w ``voltage_factor.py`` warstwa 1 MUSI znaleźć tabelę —
    inaczej zielony wynik reszty pliku nic by nie znaczył."""
    (modul, linie) = next((m, lin) for p, m, lin in _moduly(_SRC) if p == _MODUL_TABELI)
    znalezione = {linia for linia, _ in _kandydaci_c(modul, linie)}
    # Instrukcja wielowierszowa jest zgłaszana linią początku (nazwa tabeli).
    assert any(linia.startswith("_TABELA_1_NN:") for linia in znalezione), znalezione
    assert any(linia.startswith("_TABELA_1_SN_WN:") for linia in znalezione), znalezione


#: Wzorce, które warstwa 1 MUSI rozpoznać (instancje sprzed karty i ich warianty).
_WZORCE_C = (
    "C_MAX = 1.10",
    "c_max: float = 1.1",
    "def f(c_min=0.95):\n    pass",
    "def f(*, c_factor: float = 1.10):\n    pass",
    "x = {'c_factor': 1.10}",
    "wynik = solver(graph, c=1.05)",
    "ik = c_min * u / z if c_min else 0.95 * u / z",
    "if c >= 0.9:\n    pass",
    "params.get('c_max', 1.1)",
)
#: Wzorce, których warstwa 1 NIE może zgłaszać (inne wielkości z tymi samymi liczbami).
_WZORCE_NIE_C = ("k_bth = 1.1", "cos_phi = 0.95", "x = u_m_kv * 1.05", "f_grunt = 0.90")


def test_skaner_rozpoznaje_wzorce_c_i_pomija_inne_wielkosci() -> None:
    for kod in _WZORCE_C:
        modul = ast.parse(kod)
        assert _kandydaci_c(modul, kod.splitlines()), kod
    for kod in _WZORCE_NIE_C:
        modul = ast.parse(kod)
        assert not _kandydaci_c(modul, kod.splitlines()), kod


def test_zadna_instrukcja_nazywajaca_c_nie_niesie_wartosci_tabeli_poza_jej_modulem() -> None:
    naruszenia = []
    uzyte_wyjatki = set()
    for sciezka, modul, linie in _moduly(_SRC):
        if sciezka == _MODUL_TABELI:
            continue
        for linia, nr in _kandydaci_c(modul, linie):
            if (sciezka, linia) in _WYJATKI_KONTEKSTU:
                uzyte_wyjatki.add((sciezka, linia))
                continue
            naruszenia.append(f"{sciezka}:{nr}: {linia}")
    assert naruszenia == [], (
        "wartość współczynnika c poza network_model/core/voltage_factor.py — czytaj c przez "
        "c_for_node/dobierz_c z tolerancją sieci nN:\n" + "\n".join(naruszenia)
    )
    # Wyjątek bez trafienia jest martwy — lista zamknięta nie może puchnąć.
    assert uzyte_wyjatki == set(_WYJATKI_KONTEKSTU)


def test_spis_literalow_wartosci_c_poza_katalogami_jest_zamkniety() -> None:
    spis: Counter[tuple[str, str]] = Counter()
    for sciezka, modul, linie in _moduly(_SRC):
        if sciezka == _MODUL_TABELI or sciezka.startswith(_KATALOGI):
            continue
        for wezel in ast.walk(modul):
            if _literal_c(wezel):
                spis[(sciezka, linie[wezel.lineno - 1].strip())] += 1  # type: ignore[attr-defined]
    oczekiwany = {klucz: liczba for klucz, (liczba, _) in _SPIS.items()}
    nowe = {k: v for k, v in spis.items() if oczekiwany.get(k) != v}
    znikniete = {k: v for k, v in oczekiwany.items() if spis.get(k) != v}
    assert not nowe and not znikniete, (
        "spis literałów 1,05/1,1/0,95/0,9 zmienił się — każdy nowy literał wpisz do _SPIS "
        "z powodem, czemu to nie współczynnik c (c czytaj z voltage_factor)\n"
        f"nowe/zmienione: {nowe}\nzniknięte: {znikniete}"
    )


def test_prywatna_tabela_nie_jest_czytana_poza_modulem() -> None:
    naruszenia = []
    for korzen in (_SRC, _TESTS):
        for sciezka, modul, _ in _moduly(korzen):
            if korzen == _SRC and sciezka == _MODUL_TABELI:
                continue
            for wezel in ast.walk(modul):
                if isinstance(wezel, ast.ImportFrom):
                    for alias in wezel.names:
                        if alias.name.startswith("_TABELA_1"):
                            naruszenia.append(f"{korzen.name}/{sciezka}:{wezel.lineno}")
                elif isinstance(wezel, ast.Attribute) and wezel.attr.startswith("_TABELA_1"):
                    naruszenia.append(f"{korzen.name}/{sciezka}:{wezel.lineno}")
    assert naruszenia == []


def test_skasowane_nosniki_c_nie_wrocily() -> None:
    """Instancje sprzed karty — każda skasowana, nie zastąpiona warstwą zgodności."""
    from enm.models import Source
    from network_model.core.branch import LineBranch, TransformerBranch
    from network_model.core.machine import SynchronousMachineSource
    from network_model.solvers import short_circuit_iec60909 as solver

    assert not hasattr(solver, "C_MIN") and not hasattr(solver, "C_MAX")
    assert not hasattr(solver, "compute_ikss_3ph_min")
    assert not hasattr(solver, "compute_ikss_3ph_max")
    for klasa in (LineBranch, TransformerBranch):
        for nazwa in ("get_ikss_lv_cmax_ka", "get_ikss_lv_cmin_ka", "get_voltage_factor_c_min"):
            assert not hasattr(klasa, nazwa), (klasa.__name__, nazwa)
    assert "c_max" not in Source.model_fields and "c_min" not in Source.model_fields
    # c_max maszyny jest WŁASNOŚCIĄ wyliczaną z tabeli, nie polem z domyślką 1,1.
    assert isinstance(SynchronousMachineSource.__dict__["c_max"], property)
