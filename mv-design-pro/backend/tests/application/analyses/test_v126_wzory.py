"""Testy rejestru LaTeX kroków WHITE BOX V12.6 (karta V12.7 §0.1).

Test kompletności: uruchamia solver FROZEN (`V126AcademicSolver`) dla
WSZYSTKICH rodzajów PREZENTOWANYCH V12.6 (`PARAMETRY_SCENY_AKADEMICKIE`,
`scripts/eksport_fixtur_harnessu.py` — TE SAME parametry, którymi żywi się
scena harnessu „akademickie"), na sieci złotej, konstrukcją WEJŚCIA
IDENTYCZNĄ z trasą `POST …/runs/v126/{rodzaj}` (`uzupelnij_parametry_z_modelu`
+ `build_v126_input_from_enm` + `_with_parameter_payloads`, reużyte wprost —
zero drugiego źródła prawdy o budowie wejścia), zbiera zmierzony zbiór
`step.key` i sprawdza, że KAŻDY ma wpis w `REJESTR_WZOROW_V126`. Brak wpisu
jest czerwonym testem (karta §0.1: „Brak wpisu = czerwony test, nie cichy
fallback"), nie cichym pominięciem formuły.

Karta AB-1d_min: `power_quality_harmonics` i `ssci_impedance` zeszły z
powierzchni (rejestr `availability="withdrawn"`, 410) i nie są już prezentowane,
więc nie wchodzą do pomiaru. Ich wpisy w `REJESTR_WZOROW_V126` zostają — tak jak
wpisy `hosting_capacity`/`opf_loss_lcc` po karcie W3-E — bo GET śladu biegu
HISTORYCZNEGO wycofanego rodzaju nadal wzbogaca kroki formułami (odtwarzalność).
"""

from __future__ import annotations

from typing import Any

from api.v126_academic import _with_parameter_payloads
from application.analyses.v126_gotowosc import uzupelnij_parametry_z_modelu
from application.analyses.v126_katalog import KATALOG_ANALIZ_V126
from application.analyses.v126_wzory import REJESTR_WZOROW_V126, wzbogac_kroki_latex
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import V126AnalysisType, build_v126_input_from_enm

from scripts.eksport_fixtur_harnessu import PARAMETRY_SCENY_AKADEMICKIE
from tests.cgmes.golden_enm import build_golden_enm

#: Rodzaje PREZENTOWANI katalogu (§0: „wszystkie prezentowane rodzaje") — z
#: KATALOGU, nie z listy przepisanej ręcznie (parytet z jedynym źródłem
#: prawdy o tym, co jest prezentowane).
_RODZAJE_PREZENTOWANE = {karta.kod for karta in KATALOG_ANALIZ_V126 if karta.prezentowany}


def _uruchom(rodzaj: str) -> list[dict[str, Any]]:
    """Kroki śladu WHITE BOX solvera FROZEN dla jednego rodzaju, na złotej
    sieci, z parametrami sceny „akademickie" — konstrukcja wejścia TA SAMA co
    `api/v126_academic.py::run_v126_analysis` (gotowość pominięta celowo: ten
    test mierzy ślad, nie bramkę 422 — gotowość ma WŁASNY test klasy w
    `tests/application/analyses/test_v126_gotowosc.py`)."""
    enm = build_golden_enm()
    analysis_type = V126AnalysisType(rodzaj)
    parametry_uzytkownika = PARAMETRY_SCENY_AKADEMICKIE.get(rodzaj, {})
    parametry = uzupelnij_parametry_z_modelu(enm, analysis_type, parametry_uzytkownika)
    model = _with_parameter_payloads(
        build_v126_input_from_enm(enm, parameters=parametry), parametry
    )
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
    # Pin z pomiaru (2026-09-23, karta AB-1d_min, złota sieć
    # `tests/cgmes/golden_enm.py`, 8 rodzajów prezentowanych × parametry
    # `PARAMETRY_SCENY_AKADEMICKIE`; było 12 przy 10 rodzajach — ubyły klucze
    # `harmonic_power_flow` i gałęzi SSCI wraz z wycofaniem obu rodzajów).
    # Zapadka tylko w dół: spadek liczby kluczy jest dozwolony (np. rodzaj
    # przestał emitować gałąź), wzrost bez podniesienia pinu jest czerwony —
    # nowy klucz musi dostać wpis w rejestrze W TEJ SAMEJ karcie.
    assert len(zmierzone_klucze) == 10, sorted(zmierzone_klucze)


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
