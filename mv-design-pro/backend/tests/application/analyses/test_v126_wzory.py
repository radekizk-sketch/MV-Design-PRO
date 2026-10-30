"""Testy rejestru LaTeX kroków WHITE BOX V12.6 (karta V12.7 §0.1).

Test kompletności: uruchamia solver FROZEN (`V126AcademicSolver`) dla
WSZYSTKICH rodzajów PREZENTOWANYCH V12.6 (`PARAMETRY_SCENY_AKADEMICKIE`,
`scripts/eksport_fixtur_harnessu.py` — TE SAME parametry, którymi żywi się
scena harnessu „akademickie"), na sieci tej sceny, konstrukcją WEJŚCIA
IDENTYCZNĄ z trasą `POST …/runs/v126/{rodzaj}` (`uzupelnij_parametry_z_modelu`
+ `api.v126_academic.wejscie_solvera_v126` — jedna składanka mostu modelu, danych
projektanta i prądu uziomowego z modelu, reużyta wprost; zero drugiego źródła prawdy
o budowie wejścia), zbiera zmierzony zbiór
`step.key` i sprawdza, że KAŻDY ma wpis w `REJESTR_WZOROW_V126`. Brak wpisu
jest czerwonym testem (karta §0.1: „Brak wpisu = czerwony test, nie cichy
fallback"), nie cichym pominięciem formuły.

Dwa rodzaje sceny (`power_quality_harmonics`, `ssci_impedance`) NIE osiągają
gotowości POTWIERDZONEJ na złotej sieci (`gen_pv` bez karty przekształtnika —
karta B-02 §0 poz. 13); solver wywołany BEZPOŚREDNIO (ten test pomija bramkę
422, żeby zmierzyć ślad, nie odmowę) i tak emituje krok — gałąź „dane
niekompletne”/„brak przekształtnika”, nie wyjątek — więc jego klucz WCHODZI do
zmierzonego zbioru i musi mieć wpis w rejestrze na równi z pozostałymi.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from api.v126_academic import wejscie_solvera_v126
from application.analyses.v126_gotowosc import uzupelnij_parametry_z_modelu
from application.analyses.v126_katalog import KATALOG_ANALIZ_V126
from application.analyses.v126_wzory import REJESTR_WZOROW_V126, wzbogac_kroki_latex
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import V126AnalysisType

from scripts.eksport_fixtur_harnessu import PARAMETRY_SCENY_AKADEMICKIE, _enm_sceny_akademickiej

#: Rodzaje PREZENTOWANI katalogu (§0: „wszystkie prezentowane rodzaje") — z
#: KATALOGU, nie z listy przepisanej ręcznie (parytet z jedynym źródłem
#: prawdy o tym, co jest prezentowane).
_RODZAJE_PREZENTOWANE = {karta.kod for karta in KATALOG_ANALIZ_V126 if karta.prezentowany}


def _uruchom(rodzaj: str) -> list[dict[str, Any]]:
    """Kroki śladu WHITE BOX solvera FROZEN dla jednego rodzaju, na sieci sceny
    „akademickie" (sieć złota + farma PV toru DER-SN + zespół uziemiający z dławikiem na
    szynie SN GPZ — karta UX-04/POLE-ZU: sposób uziemienia z modelu), z parametrami tej
    sceny — konstrukcja wejścia TA SAMA co
    `api/v126_academic.py::run_v126_analysis` (gotowość pominięta celowo: ten
    test mierzy ślad, nie bramkę 422 — gotowość ma WŁASNY test klasy w
    `tests/application/analyses/test_v126_gotowosc.py`)."""
    enm = _enm_sceny_akademickiej()
    analysis_type = V126AnalysisType(rodzaj)
    parametry_uzytkownika = PARAMETRY_SCENY_AKADEMICKIE.get(rodzaj, {})
    parametry = uzupelnij_parametry_z_modelu(enm, analysis_type, parametry_uzytkownika)
    model = wejscie_solvera_v126(enm, analysis_type, parametry)
    envelope = V126AcademicSolver().run(analysis_type, model)
    return list(envelope["white_box_trace"])


#: Rodzaje prezentowane BEZ danych od użytkownika w katalogu
#: (`karta.dane.od_uzytkownika == ()`) — liczą WYŁĄCZNIE z modelu/przypadku,
#: więc `PARAMETRY_SCENY_AKADEMICKIE` (harness formularza) uczciwie ich nie
#: niesie (`insulation_coordination`: `model.insulation` z kart ENM;
#: `uncertainty_sensitivity`: transformatory/gałęzie/szyny wprost). `_uruchom`
#: i tak je uruchamia z pustymi parametrami (`.get(rodzaj, {})`).
_RODZAJE_BEZ_PARAMETROW_UZYTKOWNIKA = frozenset(
    {karta.kod for karta in KATALOG_ANALIZ_V126 if karta.prezentowany and not karta.od_uzytkownika}
)


def test_wszystkie_rodzaje_prezentowane_maja_sceny_parametrow() -> None:
    """Warunek wstępny pomiaru: `PARAMETRY_SCENY_AKADEMICKIE` (harness) niesie
    wpis dla KAŻDEGO rodzaju prezentowanego katalogu, który katalog deklaruje
    jako wymagający danych od użytkownika — inaczej pomiar kompletności
    poniżej cicho pomija rodzaj bez sceny."""
    wymagajace_sceny = _RODZAJE_PREZENTOWANE - _RODZAJE_BEZ_PARAMETROW_UZYTKOWNIKA
    brakujace = wymagajace_sceny - set(PARAMETRY_SCENY_AKADEMICKIE)
    assert (
        brakujace == set()
    ), f"rodzaje prezentowane bez sceny w PARAMETRY_SCENY_AKADEMICKIE: {sorted(brakujace)}"


def test_komplet_kluczy_sladu_ma_wpis_w_rejestrze_latex() -> None:
    """Test kompletności karty V12.7 §0.1 — pin z POMIARU (nie z arytmetyki)."""
    zmierzone_klucze: set[str] = set()
    for rodzaj in sorted(_RODZAJE_PREZENTOWANE):
        for krok in _uruchom(rodzaj):
            klucz = krok.get("key")
            assert isinstance(klucz, str) and klucz != "", (rodzaj, krok)
            zmierzone_klucze.add(klucz)

    brak_wpisu = sorted(zmierzone_klucze - set(REJESTR_WZOROW_V126))
    assert (
        brak_wpisu == []
    ), f"step.key bez wpisu w REJESTR_WZOROW_V126 (zmierzone na scenie akademickie): {brak_wpisu}"
    # Pin z pomiaru (2026-09-16, złota sieć `tests/cgmes/golden_enm.py`,
    # 10 rodzajów prezentowanych × parametry `PARAMETRY_SCENY_AKADEMICKIE`).
    # Zapadka tylko w dół: spadek liczby kluczy jest dozwolony (np. rodzaj
    # przestał emitować gałąź), wzrost bez podniesienia pinu jest czerwony —
    # nowy klucz musi dostać wpis w rejestrze W TEJ SAMEJ karcie.
    # Pomiar 2026-10-28 (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA): scena akademicka z zespołem
    # uziemiającym (dławik) — projekt uziemienia liczy się w pełni zamiast gałęzi braku C0:
    # dochodzą `neutral_earthing_scheme_from_model`, `neutral_earthing_capacitive_current`,
    # `petersen_resonance_tuning`, `petersen_residual_current`; odpada gałąź braku C0
    # (12 − 1 + 4 = 15 kluczy, wszystkie z wpisem w rejestrze).
    # Pomiar 2026-10-30 (ta sama karta, commit 5): ocena uziomu liczy prąd zwarcia doziemnego
    # stacji z modelu (EN 50522 tab. 1) — dochodzi `en50522_prad_uziomowy` (15 + 1 = 16).
    assert len(zmierzone_klucze) == 16, sorted(zmierzone_klucze)


#: Klucz kroku nadany w źródle solvera: literał pierwszego argumentu `trace.add(` albo
#: drugiego argumentu `_odmowa_uziemienia_sn(trace, …)` (odmowa przekazuje klucz dalej).
_KLUCZ_W_ZRODLE = re.compile(
    r"(?:trace\.add\(\s*|_odmowa_uziemienia_sn\(\s*trace,\s*)\"([a-z0-9_]+)\""
)
_ZRODLO_SOLVERA = (
    Path(__file__).resolve().parents[3] / "src" / "network_model" / "solvers" / "v126_academic.py"
)


def test_kazdy_klucz_kroku_ze_zrodla_solvera_ma_wpis_w_rejestrze() -> None:
    """Kompletność NIEZALEŻNA od sceny: pomiar na scenie akademickiej widzi tylko gałęzie,
    które scena uruchamia (krok baterii kondensatorów projektu uziemienia nie padał na sieci
    złotej i latami nie miał wpisu). Tu — KAŻDY klucz nadawany w źródle solvera, w tym gałęzie
    odmów; rejestr bez wpisu dla żadnego z nich, bez wpisów martwych."""
    zrodlo = _ZRODLO_SOLVERA.read_text(encoding="utf-8")
    klucze = set(_KLUCZ_W_ZRODLE.findall(zrodlo))
    # Każde wywołanie `trace.add(` niesie klucz-literał (inaczej pomiar byłby niepełny).
    wywolania = len(re.findall(r"trace\.add\(", zrodlo))
    zlapane = len(re.findall(r"trace\.add\(\s*\"[a-z0-9_]+\"", zrodlo))
    assert wywolania - zlapane == 1, "trace.add bez klucza-literału poza `_odmowa_uziemienia_sn`"
    assert sorted(klucze - set(REJESTR_WZOROW_V126)) == []
    assert sorted(set(REJESTR_WZOROW_V126) - klucze) == []


def test_wykrywacz_klucza_zrodla_lapie_obie_postaci_wywolania() -> None:
    """Iniekcja: wykrywacz klucza widzi literał `trace.add` i klucz odmowy."""
    tekst = 'trace.add(\n    "krok_a",\n)\n_odmowa_uziemienia_sn(trace, "krok_b", powod)'
    assert set(_KLUCZ_W_ZRODLE.findall(tekst)) == {"krok_a", "krok_b"}


def test_wzbogac_kroki_latex_nie_mutuje_oryginalu_i_dokladakada_formule() -> None:
    """`wzbogac_kroki_latex` jest widokiem API — kopia, nie mutacja; krok bez
    wpisu w rejestrze wraca bez zmian (zero fabrykacji formuły)."""
    kroki = _uruchom("earthing_safety")
    wzbogacone = wzbogac_kroki_latex(kroki)
    assert kroki[0].get("formula_latex") is None, "oryginalny krok solvera zmutowany"
    ieee80 = next(k for k in wzbogacone if k["key"] == "ieee80_sverak")
    assert ieee80["formula_latex"] == REJESTR_WZOROW_V126["ieee80_sverak"].formula_latex
    assert "R_g" in ieee80["substitution_latex"]

    nieznany = wzbogac_kroki_latex([{"key": "nieznany_klucz_spoza_rejestru", "data": {}}])
    assert "formula_latex" not in nieznany[0], "krok bez wpisu nie może dostać fabrykowanej formuły"


def test_kazdy_wpis_rejestru_ma_niepusty_formula_latex() -> None:
    for klucz, wzor in REJESTR_WZOROW_V126.items():
        assert wzor.formula_latex.strip() != "", klucz


# ---------------------------------------------------------------------------
# Karta #145 — kroki PAKIETU DOWODOWEGO i polskie opisy kodów decyzji.
#
# Iloczyn cech: pochodzenie kroku {ślad z `key`, dowód bez `key` + mapa `proof_ref`,
# dowód bez `key` bez mapy} × wpis rejestru {z podstawieniem/opisem wyniku, bez} ×
# kod decyzji {w słowniku, spoza słownika}.
# ---------------------------------------------------------------------------


def _krok_dowodu(krok_sladu: dict[str, Any]) -> dict[str, Any]:
    """Krok pakietu dowodowego tak, jak buduje go `application/v126_artifacts.py`:
    bez `key`, z `proof_ref` przepisanym ze śladu."""
    return {
        "ordinal": 1,
        "proof_ref": krok_sladu["proof_ref"],
        "formula": krok_sladu["formula"],
        "data": krok_sladu["data"],
        "substitution": krok_sladu["substitution"],
        "result": krok_sladu["result"],
        "result_pl": krok_sladu.get("result_pl"),
    }


def test_krok_dowodu_bez_klucza_dostaje_wzor_po_proof_ref_ze_sladu() -> None:
    slad = _uruchom("reliability_contingency")
    dowod = [_krok_dowodu(krok) for krok in slad]
    klucze = {krok["proof_ref"]: krok["key"] for krok in slad}

    bez_mapy = wzbogac_kroki_latex(dowod)
    assert all("formula_latex" not in krok for krok in bez_mapy), "bez mapy klucza nie zgadujemy"

    z_mapa = wzbogac_kroki_latex(dowod, klucze)
    for krok_sladu, krok_dowodu in zip(slad, z_mapa, strict=True):
        assert krok_dowodu["formula_latex"] == REJESTR_WZOROW_V126[krok_sladu["key"]].formula_latex
    assert "formula_latex" not in dowod[0], "oryginalny krok dowodu zmutowany"


def test_detekcja_doziemna_podstawienie_i_wynik_po_polsku_bez_kodow() -> None:
    slad = _uruchom("earth_fault_detection")
    wzbogacone = wzbogac_kroki_latex(slad)
    krok = next(k for k in wzbogacone if k["key"] == "earth_fault_method_selection")
    oryginal = next(k for k in slad if k["key"] == "earth_fault_method_selection")
    kody = {oryginal["data"]["neutral_grounding"], oryginal["result"]["recommended_method"]}
    for pole in ("substitution_latex", "result_pl"):
        assert pole in krok, pole
        for kod in kody:
            assert kod not in krok[pole], f"{pole}: kod {kod} na ekranie"
    assert krok["result_pl"].startswith("Metoda zalecana: ")
    # Podstawienie jest LaTeX-em tekstowym: polecenie `\text{…}` (nie znak tabulacji
    # z niezabezpieczonego `\t` w literale), a znaki sterujące nie trafiają do KaTeX.
    assert krok["substitution_latex"].startswith(r"\text{punkt neutralny: ")
    assert not any(ord(znak) < 32 for znak in krok["substitution_latex"])
    assert oryginal["result_pl"] != krok["result_pl"], "opis wyniku nie został złożony"


def test_detekcja_doziemna_kod_spoza_slownika_zostawia_zapis_solvera() -> None:
    krok = {
        "key": "earth_fault_method_selection",
        "data": {"neutral_grounding": "nowy_sposob", "relay_methods": ["wattmetric"]},
        "result": {"recommended_method": "nowa_metoda", "required_functions": ["nowa_metoda"]},
        "result_pl": "zapis solvera",
    }
    (wzbogacony,) = wzbogac_kroki_latex([krok])
    assert "substitution_latex" not in wzbogacony
    assert wzbogacony["result_pl"] == "zapis solvera"


def test_slowniki_detekcji_doziemnej_obejmuja_kazdy_kod_tabeli_solvera() -> None:
    """Parytet z KODEM solvera: każdy sposób uziemienia z tabeli decyzyjnej, każda metoda
    zalecana/alternatywna i każda funkcja wyposażenia przekaźnika (``METODY_DETEKCJI_KOMPLET``
    — metody proste i składowe 51N/67N/50N metod złożonych) ma polską nazwę — inaczej krok
    wracałby do zapisu kodami."""
    import ast
    import inspect
    import textwrap

    from application.analyses.v126_wzory import (
        METODA_DETEKCJI_ZIEMNOZWARCIOWEJ_PL,
        UZIEMIENIE_PUNKTU_NEUTRALNEGO_PL,
    )
    from network_model.solvers.v126_academic import (
        METODY_DETEKCJI_KOMPLET,
        SKLADNIKI_METODY_DETEKCJI,
    )

    zrodlo = inspect.getsource(V126AcademicSolver._earth_fault_detection)
    drzewo = ast.parse(textwrap.dedent(zrodlo))
    tabela: dict[str, tuple[str | None, ...]] = {}
    metody_domyslne: list[str] = []
    for wezel in ast.walk(drzewo):
        if (
            isinstance(wezel, ast.Assign)
            and isinstance(wezel.targets[0], ast.Name)
            and wezel.targets[0].id == "table"
        ):
            tabela = ast.literal_eval(wezel.value)
        if isinstance(wezel, ast.List) and all(
            isinstance(e, ast.Constant) and isinstance(e.value, str) for e in wezel.elts
        ):
            metody_domyslne.extend(e.value for e in wezel.elts)  # type: ignore[union-attr]
    assert tabela, "nie znaleziono tabeli decyzyjnej solvera"
    assert set(tabela) == set(UZIEMIENIE_PUNKTU_NEUTRALNEGO_PL)
    metody = {m for para in tabela.values() for m in para if m is not None}
    metody |= set(metody_domyslne) | set(METODY_DETEKCJI_KOMPLET)
    assert metody == set(METODA_DETEKCJI_ZIEMNOZWARCIOWEJ_PL)
    # Składowe metod złożonych należą do wyposażenia, które projektant wskazuje.
    assert {f for s in SKLADNIKI_METODY_DETEKCJI.values() for f in s} <= set(
        METODY_DETEKCJI_KOMPLET
    )
