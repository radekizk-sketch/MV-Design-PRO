"""Rejestr LaTeX kroków śladu WHITE BOX V12.6 (karta V12.7 §0.1).

DLACZEGO W WARSTWIE APLIKACJI, NIE W SOLWERZE. Ślad WHITE BOX
(`AcademicWhiteBoxTraceV1.steps[].formula`, `.substitution`) pochodzi z solvera
FROZEN (`network_model/solvers/v126_academic.py`, B-01 — NIE DOTYKAMY). Solver
pisze `formula` jako zwięzły zapis ASCII/Unicode czytelny w logu i w audycie
tekstowym (np. `"U_h = Y_h^-1 * I_h, THD_U = sqrt(sum(|U_h|^2))/U_1 * 100%"`),
nie jako LaTeX. Właściciel ocenił ekran analiz specjalistycznych: wzory mają
renderować się KaTeX-em, nie jako surowy ASCII (`<=`, `sqrt(`, `^-1`) — ale
zmiana zapisu ASCII solvera złamałaby FROZEN (B-01) i zapis audytowy/eksport,
który dziś czyta `formula`/`substitution` jako tekst.

Rozwiązanie: rejestr KLUCZ KROKU (`step.key`, POLE JUŻ ISTNIEJĄCE w śladzie,
nadawane przez `TraceBuilder.add` solvera) → zapis LaTeX. Widok API (trace,
proof — `api/v126_academic.py`) DOKŁADA `formula_latex`/`substitution_latex`
do KOPII kroku w ODPOWIEDZI, nigdy nie mutuje `result["white_box_trace"]`
solvera ani zapisanego pakietu dowodowego — `deterministic_hash` (solver),
`proof_hash`/`report_hash` (`application/v126_artifacts.py`) liczone są PRZED
tym wzbogaceniem i zostają bajtowo identyczne.

ZERO FABRYKACJI. `formula_latex` jest WIERNYM zapisem TEGO SAMEGO wzoru, który
solver już ma w polu `formula` (ten sam plik jest źródłem — patrz cytat przy
każdym wpisie). `substitution_latex` dokładany jest WYŁĄCZNIE tam, gdzie zapis
podstawienia da się zbudować Z LICZB KROKU (`step["data"]`) bez zgadywania —
`WzorKroku.podstawienie` czyta wyłącznie klucze `data`, które solver NAPRAWDĘ
przekazuje do `TraceBuilder.add` dla tego kroku (patrz `network_model/solvers/
v126_academic.py`, cytowany numer linii przy każdym budowniczym). Krok bez
budowniczego (`podstawienie=None`) zostaje bez `substitution_latex` — brak
pola, nie fabrykowana wartość.

KOMPLETNOŚĆ. Rejestr niesie WPIS DLA KAŻDEGO `step.key`, jaki solver V12.6
kiedykolwiek nadaje (`grep -n 'trace\\.add(' network_model/solvers/
v126_academic.py`, 24 unikatowe klucze — dwa wywołania `benchmark_regression`
dzielą jeden wpis, bo niosą IDENTYCZNY zapis wzoru). Test kompletności
(`backend/tests/application/analyses/test_v126_wzory.py`) uruchamia WSZYSTKIE
PREZENTOWANE rodzaje V12.6 na sieci złotej (parametry `scripts/
eksport_fixtur_harnessu.py`), zbiera zmierzony zbiór `step.key` i sprawdza,
że każdy ma wpis tutaj — brak wpisu jest czerwonym testem, nie cichym
pominięciem.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

JsonDict = dict[str, Any]

#: Budowniczy podstawienia LaTeX: czyta WYŁĄCZNIE `step["data"]`/`step["result"]`
#: (liczby, które solver NAPRAWDĘ policzył dla TEGO biegu) i zwraca zapis LaTeX
#: albo `None`, gdy któryś klucz danych nie jest obecny (zero fabrykacji —
#: brak liczby w kroku nie dostaje podstawionej wartości zastępczej).
Budowniczy = Callable[[Mapping[str, Any]], "str | None"]


@dataclass(frozen=True)
class WzorKroku:
    """Wpis rejestru: LaTeX wzoru (zawsze) + opcjonalny budowniczy podstawienia."""

    formula_latex: str
    podstawienie: Budowniczy | None = None


def _liczba(dane: Mapping[str, Any], klucz: str) -> float | None:
    wartosc = dane.get(klucz)
    return wartosc if isinstance(wartosc, int | float) else None


def _pl(wartosc: float, cyfry: int = 4) -> str:
    """Zapis liczby z przecinkiem dziesiętnym PL — TA SAMA konwencja co reszta
    prezentacji V12.6 (`fmtWartosc`/`formatujLiczbe` frontendu). Zaokrąglenie
    WYŁĄCZNIE prezentacyjne (liczba już zaokrąglona przez solwer w `data`)."""
    tekst = f"{round(wartosc, cyfry):.{cyfry}f}".rstrip("0").rstrip(".")
    if tekst in ("", "-0"):
        tekst = "0"
    return tekst.replace(".", ",")


# ---------------------------------------------------------------------------
# Budowniczowie podstawień — WYŁĄCZNIE kroki, gdzie `data` niesie bezpośrednio
# liczby wzoru (bez pośredniego wyliczania w tym module — zero fizyki tutaj).
# ---------------------------------------------------------------------------


def _podstawienie_sverak(dane: Mapping[str, Any]) -> str | None:
    """`_earthing`, `network_model/solvers/v126_academic.py:1228-1234`:
    `data={"area_m2": area, "lc_m": lc, "rho_ohm_m": data.rho1_ohm_m}`."""
    rho = _liczba(dane, "rho_ohm_m")
    lc = _liczba(dane, "lc_m")
    area = _liczba(dane, "area_m2")
    if rho is None or lc is None or area is None:
        return None
    return (
        rf"R_g = {_pl(rho)}\ \Omega{{\cdot}}\mathrm{{m}} \cdot \left("
        rf"\dfrac{{1}}{{{_pl(lc)}\ \mathrm{{m}}}} + \text{{człon powierzchniowy siatki (}}A={_pl(area)}\ \mathrm{{m}}^2\text{{)}}"
        rf"\right)"
    )


def _podstawienie_ic(dane: Mapping[str, Any]) -> str | None:
    """`_neutral_earthing_design`, linie 1375-1389: `data={"omega_rad_s":…,
    "b0_total_siemens":…, "u_line_kv":…}`."""
    omega = _liczba(dane, "omega_rad_s")
    b0 = _liczba(dane, "b0_total_siemens")
    u_l = _liczba(dane, "u_line_kv")
    if omega is None or b0 is None or u_l is None:
        return None
    return (
        rf"C_0 = \dfrac{{{_pl(b0, 6)}\ \mathrm{{S}}}}{{{_pl(omega)}\ \mathrm{{rad/s}}}}\text{{,}}\quad "
        rf"I_C = \sqrt{{3}}\cdot {_pl(omega)}\cdot C_0 \cdot {_pl(u_l)}\ \mathrm{{kV}}"
    )


def _podstawienie_petersen_rezonans(dane: Mapping[str, Any]) -> str | None:
    """`_petersen_design`, linie 1426-1436: `data={"c0_farad":…, "omega_rad_s":…,
    "ic_a":…}`."""
    c0 = _liczba(dane, "c0_farad")
    omega = _liczba(dane, "omega_rad_s")
    ic = _liczba(dane, "ic_a")
    if c0 is None or omega is None or ic is None:
        return None
    return (
        rf"L = \dfrac{{1}}{{3\cdot {_pl(omega)}^2 \cdot {_pl(c0, 9)}\ \mathrm{{F}}}}\text{{,}}\quad "
        rf"X_L = \dfrac{{1}}{{3\cdot {_pl(omega)}\cdot {_pl(c0, 9)}\ \mathrm{{F}}}}\text{{,}}\quad "
        rf"I_L^{{(\mathrm{{rezonans}})}} = I_C = {_pl(ic)}\ \mathrm{{A}}"
    )


def _podstawienie_petersen_resztkowy(dane: Mapping[str, Any]) -> str | None:
    """`_petersen_design`, linie 1452-1461: `data={"ic_a":…, "detuning_v":…,
    "residual_damping_d":…}`."""
    ic = _liczba(dane, "ic_a")
    v = _liczba(dane, "detuning_v")
    d = _liczba(dane, "residual_damping_d")
    if ic is None or v is None or d is None:
        return None
    return (
        rf"I_{{\mathrm{{res}}}}(\mathrm{{rezonans}}) = {_pl(ic)}\ \mathrm{{A}}\cdot {_pl(d)}\text{{,}}\quad "
        rf"I_{{\mathrm{{res}}}}(\pm{_pl(v)}) = {_pl(ic)}\ \mathrm{{A}}\cdot "
        rf"\sqrt{{{_pl(d)}^2 + {_pl(v)}^2}}"
    )


def _podstawienie_ner_dobor(dane: Mapping[str, Any]) -> str | None:
    """`_ner_design`, linie 1552-1562: `data={"u_phase_v":…, "i_ef_target_a":…,
    "ic_a":…}`."""
    u_f = _liczba(dane, "u_phase_v")
    i_ef = _liczba(dane, "i_ef_target_a")
    ic = _liczba(dane, "ic_a")
    if u_f is None or i_ef is None or ic is None:
        return None
    return (
        rf"R = \dfrac{{{_pl(u_f)}\ \mathrm{{V}}}}{{{_pl(i_ef)}\ \mathrm{{A}}}}\text{{,}}\quad "
        rf"I_{{\mathrm{{ef}}}}^{{\mathrm{{wyp}}}} = \sqrt{{\left(\dfrac{{{_pl(u_f)}}}{{R}}\right)^2 "
        rf"+ {_pl(ic)}^2}}"
    )


def _podstawienie_ner_cieplo(dane: Mapping[str, Any]) -> str | None:
    """`_ner_design`, linie 1602-1610: `data={"i_ef_a":…, "r_ohm":…,
    "t_clear_s":…, "e_rating_j":…}`."""
    i_ef = _liczba(dane, "i_ef_a")
    r = _liczba(dane, "r_ohm")
    t = _liczba(dane, "t_clear_s")
    e_n = _liczba(dane, "e_rating_j")
    if i_ef is None or r is None or t is None or e_n is None:
        return None
    return (
        rf"E = {_pl(i_ef)}^2\ \mathrm{{A}}^2 \cdot {_pl(r)}\ \Omega \cdot {_pl(t)}\ \mathrm{{s}}"
        rf" \leq E_n = {_pl(e_n)}\ \mathrm{{J}}"
    )


# ---------------------------------------------------------------------------
# Rejestr — KAŻDY `step.key` nadawany przez `trace.add(...)` w
# `network_model/solvers/v126_academic.py` (24 unikatowe klucze, pomiar
# `grep -c 'trace\.add('` == 25 wywołań, `benchmark_regression` dzieli wpis).
# `formula_latex` jest ZAPISEM ASCII/Unicode `formula` solvera W LATEX — cytat
# przy każdym wpisie wskazuje linię solvera, z której wzór pochodzi.
# ---------------------------------------------------------------------------

REJESTR_WZOROW_V126: dict[str, WzorKroku] = {
    # _power_quality, linia 491-500.
    "harmonic_power_flow": WzorKroku(
        r"U_h = Y_h^{-1} \cdot I_h,\quad "
        r"\mathrm{THD}_U = \dfrac{\sqrt{\sum_h |U_h|^2}}{U_1}\cdot 100\%"
    ),
    # _ssci_impedance, linia 689-697 (brak przekształtnika w modelu).
    "ssci_impedance_no_converter": WzorKroku(
        r"Z_{\mathrm{conv}}(j\omega)\ \text{wymaga przekształtnika sieciowego (VSC) w modelu}"
    ),
    # _ssci_impedance, linia 739-747 (brak pól karty przekształtnika).
    "ssci_impedance_missing_card_fields": WzorKroku(
        r"Z_{\mathrm{conv}}(j\omega)\ \text{wymaga: } "
        r"f_{\mathrm{ci}},\ f_{\mathrm{pll}},\ L_f\ (\text{indukcyjność filtra, j.w.})"
    ),
    # _z_conv_components, docstring + linia 789-812.
    "ssci_zconv_model": WzorKroku(
        r"Z_{\mathrm{conv}}(j\omega) = \dfrac{Z_f + G_d G_{ci}}"
        r"{1 - G_d H_{\mathrm{pll}}\left(\dfrac{I_0 G_{ci} - V_0}{V_0}\right)}"
    ),
    # _ssci_impedance, linia 828-846.
    "ssci_zgrid_sweep": WzorKroku(
        r"Z_{\mathrm{grid}}(f) = \left[\left(Y_{\mathrm{bus}}(f) + Y_{\mathrm{src}}(f)\right)^{+}"
        r"\right]_{\mathrm{diag}}\Big|_{\text{szyna przekształtnika}}"
    ),
    # _ssci_impedance, linia 848-865.
    "ssci_minor_loop_gain": WzorKroku(
        r"L(j\omega) = \dfrac{Z_{\mathrm{grid}}(j\omega)}{Z_{\mathrm{conv}}(j\omega)}"
    ),
    # _voltage_stability, linia 1003-1029 (rodzaj wycofany — karta QU-FABRYKACJA).
    "voltage_stability_indices": WzorKroku(
        r"\text{brak danych wejściowych} \Rightarrow \text{wielkość niewyznaczana}"
    ),
    # _reliability, linia 1154-1165.
    "reliability_indices": WzorKroku(
        r"\mathrm{SAIDI} = \dfrac{\sum_e \lambda_e \cdot \mathrm{MTTR}_e \cdot 60 \cdot N_e}{N_t}"
        r"\text{,}\quad \mathrm{SAIFI} = \dfrac{\sum_e \lambda_e \cdot N_e}{N_t}"
    ),
    # _earthing, linia 1228-1237 (IEEE 80, metoda Sveraka).
    "ieee80_sverak": WzorKroku(
        r"R_g = \rho_1 \left[\dfrac{1}{L_c} + \dfrac{1}{\sqrt{20A}}"
        r"\left(1 + \dfrac{1}{1+h\sqrt{20/A}}\right)\right]",
        podstawienie=_podstawienie_sverak,
    ),
    # _neutral_earthing_design, linia 1349-1361 (brak C0 — dane niekompletne).
    "neutral_earthing_no_c0": WzorKroku(
        r"C_0 = \dfrac{1}{\omega}\sum_i b_{0,i}\cdot \ell_i\text{,}\quad "
        r"I_C = \sqrt{3}\,\omega\, C_0\, U_l"
    ),
    # _neutral_earthing_design, linia 1375-1390.
    "neutral_earthing_capacitive_current": WzorKroku(
        r"C_0 = \dfrac{1}{\omega}\sum b_0 \cdot \ell\text{,}\quad "
        r"I_C = 3\,\omega\, C_0\, U_f = \sqrt{3}\,\omega\, C_0\, U_l",
        podstawienie=_podstawienie_ic,
    ),
    # _petersen_design, linia 1421-1436 (Petersen — kompensacja rezonansowa).
    "petersen_resonance_tuning": WzorKroku(
        r"\omega L = \dfrac{1}{3\omega C_0} \;\Rightarrow\; L = \dfrac{1}{3\omega^2 C_0}"
        r"\text{,}\quad X_L = \omega L\text{,}\quad I_L^{\,(\mathrm{rezonans})} = I_C",
        podstawienie=_podstawienie_petersen_rezonans,
    ),
    # _petersen_design, linia 1448-1461.
    "petersen_residual_current": WzorKroku(
        r"v = \dfrac{I_L - I_C}{I_C}\text{,}\quad I_{\mathrm{res}} = I_C\sqrt{d^2+v^2}",
        podstawienie=_podstawienie_petersen_resztkowy,
    ),
    # _ner_design, linia 1522-1535 (brak I_ef docelowego).
    "ner_no_target": WzorKroku(r"R \approx \dfrac{U_f}{I_{\mathrm{ef}}}"),
    # _ner_design, linia 1546-1562.
    "ner_resistance_sizing": WzorKroku(
        r"R = \dfrac{U_f}{I_{\mathrm{ef}}}\text{,}\quad "
        r"I_{\mathrm{ef}}^{\,\mathrm{wyp}} = \sqrt{\left(\dfrac{U_f}{R}\right)^2 + I_C^2}",
        podstawienie=_podstawienie_ner_dobor,
    ),
    # _ner_design, linia 1571-1591 (brak t_clear/E_rating — sprawdzenie niewykonane).
    "ner_thermal_incomplete": WzorKroku(
        r"E_{\mathrm{dissipated}} = I_{\mathrm{ef}}^2 \cdot R \cdot t_{\mathrm{clear}} "
        r"\leq E_{\mathrm{rating}}"
    ),
    # _ner_design, linia 1597-1620.
    "ner_thermal_withstand": WzorKroku(
        r"E_{\mathrm{dissipated}} = I_{\mathrm{ef}}^2 \cdot R \cdot t_{\mathrm{clear}} "
        r"\leq E_{\mathrm{rating}}",
        podstawienie=_podstawienie_ner_cieplo,
    ),
    # _insulation, linia 1695-1707 (IEC 60071 — margines BIL).
    "iec60071_arrester_margin": WzorKroku(
        r"M_{\mathrm{BIL}} = \dfrac{\mathrm{BIL} - U_{\mathrm{res}}}{U_{\mathrm{res}}}\cdot 100\%"
    ),
    # _earth_fault_detection, linia 1748-1757 (tabela decyzyjna — bez jednostek fizycznych).
    "earth_fault_method_selection": WzorKroku(
        r"\text{Metoda detekcji} = f(\text{sposób uziemienia punktu neutralnego},\ "
        r"\text{wyposażenie przekaźnika})"
    ),
    # _transient, linia 1823-1831 (IEC 62271-100 — napięcie powrotne).
    "trv_inrush_ferro": WzorKroku(
        r"u_{\mathrm{TRV}}(t) = U_r\left(1-\cos(\omega_n t)\right)e^{-t/\tau} "
        r"+ \dfrac{U_r}{\sqrt{3}}"
    ),
    # _motor_starting, linia 1916-1928.
    "motor_starting": WzorKroku(
        r"\Delta U = \dfrac{|I_{\mathrm{start}} \cdot Z_{\mathrm{src}}|}{U_{\mathrm{phase}}}"
        r"\cdot 100\%\text{,}\quad I_{\mathrm{start}} = k_{LR}\cdot I_n"
    ),
    # _hosting_capacity, linia 2076-2093 (rodzaj wycofany — karta W3-E).
    "stochastic_hosting_capacity": WzorKroku(
        r"P_{\text{przył}} = \max(P_{\mathrm{gen}})\ \text{przy prawdopodobieństwie "
        r"spełnienia kryteriów} \geq 95\%"
    ),
    # _opf_loss_lcc, linia 2152-2163 (rodzaj wycofany — karta W3-E).
    "opf_losses_lcc": WzorKroku(
        r"\Delta P = 3 I^2 R\text{,}\quad \mathrm{LCC} = \mathrm{CAPEX} "
        r"+ \sum_t \dfrac{\mathrm{OPEX}_t}{(1+r)^t}"
    ),
    # _benchmark_validation, linia 2190-2198 i 2237-2249 (rodzaj wycofany).
    "benchmark_regression": WzorKroku(
        r"\delta = \dfrac{|\mathrm{calc} - \mathrm{ref}|}{|\mathrm{ref}|}\cdot 100\%"
    ),
    # _uncertainty, linia 2290-2298.
    "uncertainty_propagation": WzorKroku(
        r"\sigma_Y^2 = \sum_i \left(\dfrac{\partial Y}{\partial x_i}\cdot \sigma_{x_i}\right)^2"
        r"\text{,}\quad U_{95} = 2\sigma_Y"
    ),
}


def wzor_kroku(klucz: str) -> WzorKroku | None:
    """Wpis rejestru dla `step.key`, albo `None`, gdy klucz nieznany (solver
    nadał krok, którego ten rejestr jeszcze nie zna — czerwony test
    kompletności, nie cichy brak wzoru)."""
    return REJESTR_WZOROW_V126.get(klucz)


def wzbogac_kroki_latex(kroki: list[JsonDict]) -> list[JsonDict]:
    """Zwraca NOWĄ listę kroków śladu z dołożonym (kopia, nie mutacja)
    `formula_latex`/`substitution_latex` — WYŁĄCZNIE dla widoku API (trace,
    proof). Krok bez wpisu w rejestrze wraca BEZ ZMIAN (nie brakiem —
    kompletność pilnuje osobny test, ten adapter nigdy nie fabrykuje wzoru).
    Nie mutuje `kroki` ani zagnieżdżonych słowników — `result["white_box_trace"]`
    solvera i zapisany pakiet dowodowy (`proof_hash`) zostają bajtowo
    identyczne, bo hash liczony jest PRZED wywołaniem tego adaptera.
    """
    wynik: list[JsonDict] = []
    for krok in kroki:
        if not isinstance(krok, Mapping):
            wynik.append(krok)
            continue
        wzbogacony: JsonDict = dict(krok)
        wzor = REJESTR_WZOROW_V126.get(str(krok.get("key", "")))
        if wzor is not None:
            wzbogacony["formula_latex"] = wzor.formula_latex
            if wzor.podstawienie is not None:
                dane_kroku = krok.get("data")
                if isinstance(dane_kroku, Mapping):
                    podstawienie_latex = wzor.podstawienie(dane_kroku)
                    if podstawienie_latex is not None:
                        wzbogacony["substitution_latex"] = podstawienie_latex
        wynik.append(wzbogacony)
    return wynik
