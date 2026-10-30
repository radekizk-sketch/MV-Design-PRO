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
v126_academic.py`, 27 unikatowych kluczy — dwa wywołania `benchmark_regression`
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

#: Budowniczy polskiego opisu wyniku kroku (karta #145): czyta `step["data"]` i
#: `step["result"]` i zwraca zdanie po polsku albo `None`, gdy któraś wartość jest spoza
#: słownika (wtedy zostaje `result_pl` solvera — zero fabrykacji nazwy).
BudowniczyWyniku = Callable[[Mapping[str, Any], Mapping[str, Any]], "str | None"]


@dataclass(frozen=True)
class WzorKroku:
    """Wpis rejestru: LaTeX wzoru (zawsze) + opcjonalny budowniczy podstawienia
    + opcjonalny budowniczy polskiego opisu wyniku (karta #145)."""

    formula_latex: str
    podstawienie: Budowniczy | None = None
    wynik_pl: BudowniczyWyniku | None = None


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
    """`_petersen_design` (krok „petersen_residual_current"): `data={"ic_a":…, "i_l_a":…,
    "i_w_a":…, "detuning_v":…}` — prąd dławika i składowa czynna z impedancji punktów
    neutralnych MODELU (solver `doziemienie_sn`)."""
    ic = _liczba(dane, "ic_a")
    i_l = _liczba(dane, "i_l_a")
    i_w = _liczba(dane, "i_w_a")
    if ic is None or i_l is None or i_w is None:
        return None
    return (
        rf"I_{{\mathrm{{res}}}} = \sqrt{{{_pl(i_w)}^2 + ({_pl(ic)} - {_pl(i_l)})^2}}\ \mathrm{{A}}"
        rf"\text{{,}}\quad v = \dfrac{{{_pl(ic)} - {_pl(i_l)}}}{{{_pl(ic)}}}"
    )


def _podstawienie_ner_dobor(dane: Mapping[str, Any]) -> str | None:
    """`_ner_design` (krok „ner_resistance_sizing"): `data={"resistors": [{"r_ohm":…}, …],
    "ic_a":…, "i_resistive_a":…, "i_coil_a":…}` — rezystory punktu neutralnego z MODELU,
    składowe prądu z impedancji punktów neutralnych (solver `doziemienie_sn`)."""
    ic = _liczba(dane, "ic_a")
    i_r = _liczba(dane, "i_resistive_a")
    i_l = _liczba(dane, "i_coil_a")
    rezystory = dane.get("resistors")
    if ic is None or i_r is None or i_l is None or not isinstance(rezystory, list):
        return None
    surowe = [r.get("r_ohm") for r in rezystory if isinstance(r, Mapping)]
    opory = [float(r) for r in surowe if isinstance(r, int | float) and r > 0]
    if not opory or len(opory) != len(surowe):
        return None
    suma = " + ".join(rf"\dfrac{{1}}{{{_pl(r)}\ \Omega}}" for r in opory)
    return (
        rf"R_N = \left({suma}\right)^{{-1}}\text{{,}}\quad "
        rf"I_{{\mathrm{{ef}}}} = \sqrt{{{_pl(i_r)}^2 + ({_pl(ic)} - {_pl(i_l)})^2}}\ \mathrm{{A}}"
    )


def _podstawienie_ner_cieplo(dane: Mapping[str, Any]) -> str | None:
    """`_ner_thermal` (krok „ner_thermal_withstand"): `data={"t_clear_s":…, "resistors":
    [{"i_thermal_a":…, "r_ohm":…, "i_n_a":…, "t_n_s":…}, …]}` — prąd cieplny zastępczy
    I_th = I_R·√(m+n) rezystora (IEC 60909-0 §12)."""
    t = _liczba(dane, "t_clear_s")
    rezystory = dane.get("resistors")
    if t is None or not isinstance(rezystory, list) or not rezystory:
        return None
    czlony: list[str] = []
    for rez in rezystory:
        if not isinstance(rez, Mapping):
            return None
        i_th, r, i_n, t_n = (_liczba(rez, k) for k in ("i_thermal_a", "r_ohm", "i_n_a", "t_n_s"))
        if i_th is None or r is None or i_n is None or t_n is None:
            return None
        czlony.append(
            rf"E = {_pl(i_th)}^2\ \mathrm{{A}}^2 \cdot {_pl(r)}\ \Omega \cdot {_pl(t)}\ \mathrm{{s}}"
            rf" \leq E_n = {_pl(i_n)}^2\ \mathrm{{A}}^2 \cdot {_pl(r)}\ \Omega \cdot "
            rf"{_pl(t_n)}\ \mathrm{{s}}"
        )
    return r";\quad ".join(czlony)


def _podstawienie_ner_czas_dopuszczalny(dane: Mapping[str, Any]) -> str | None:
    """`_ner_thermal` (krok „ner_thermal_permissible_time"): `data={"c_max":…, "u_phase_v":…,
    "resistors": [{"z_loop_ohm": {"r_ohm":…, "x_ohm":…}, "i_resistor_a":…, "i_n_a":…,
    "t_n_s":…, "permissible_time_s":…}, …]}`."""
    c = _liczba(dane, "c_max")
    u_f = _liczba(dane, "u_phase_v")
    rezystory = dane.get("resistors")
    if c is None or u_f is None or not isinstance(rezystory, list) or not rezystory:
        return None
    czlony: list[str] = []
    for rez in rezystory:
        if not isinstance(rez, Mapping) or not isinstance(rez.get("z_loop_ohm"), Mapping):
            return None
        petla = rez["z_loop_ohm"]
        r_p, x_p = _liczba(petla, "r_ohm"), _liczba(petla, "x_ohm")
        i_k, i_n, t_n, t_dop = (
            _liczba(rez, k) for k in ("i_resistor_a", "i_n_a", "t_n_s", "permissible_time_s")
        )
        if r_p is None or x_p is None or i_k is None or i_n is None or t_n is None or t_dop is None:
            return None
        czlony.append(
            rf"I_R = \dfrac{{{_pl(c)} \cdot {_pl(u_f)}\ \mathrm{{V}}}}"
            rf"{{|{_pl(r_p)} + \mathrm{{j}}{_pl(x_p)}|\ \Omega}} = {_pl(i_k)}\ \mathrm{{A}}"
            rf"\text{{,}}\quad I_{{\mathrm{{th}}}}^2(t_{{\mathrm{{dop}}}})\cdot t_{{\mathrm{{dop}}}}"
            rf" = {_pl(i_n)}^2\ \mathrm{{A}}^2 \cdot {_pl(t_n)}\ \mathrm{{s}}"
            rf" \Rightarrow t_{{\mathrm{{dop}}}} = {_pl(t_dop)}\ \mathrm{{s}}"
        )
    return r";\quad ".join(czlony)


# ---------------------------------------------------------------------------
# Detekcja zwarć doziemnych (`_earth_fault_detection`) — kody decyzji po polsku.
#
# Solver (FROZEN, B-01) zapisuje podstawienie i wynik kodami tabeli decyzyjnej
# („petersen_tuned -> wattmetric", „Metoda zalecana: wattmetric"). Karta #145: ekran
# nie pokazuje kodów — widok API składa polskie zdanie z DANYCH kroku. Słowniki
# obejmują KAŻDY kod tabeli decyzyjnej i listy metod przekaźnika solvera (parytet
# przypina `tests/application/analyses/test_v126_wzory.py`); kod spoza słownika →
# `None` i zostaje zapis solvera (nie zgadujemy nazwy).
# ---------------------------------------------------------------------------

UZIEMIENIE_PUNKTU_NEUTRALNEGO_PL: dict[str, str] = {
    "isolated": "izolowany",
    "petersen_tuned": "skompensowany dławikiem dostrojonym",
    "petersen_detuned": "skompensowany dławikiem rozstrojonym",
    "resistor": "uziemiony przez rezystor",
    "solid": "uziemiony bezpośrednio",
}

METODA_DETEKCJI_ZIEMNOZWARCIOWEJ_PL: dict[str, str] = {
    "wattmetric": "watometryczna",
    "admittance": "admitancyjna",
    "transient_directional": "kierunkowa stanów przejściowych",
    "fifth_harmonic": "piątej harmonicznej",
    "51N+67N": "nadprądowa ziemnozwarciowa 51N z kierunkową 67N",
    "51N/50N": "nadprądowa ziemnozwarciowa zwłoczna 51N i bezzwłoczna 50N",
    "51N": "nadprądowa ziemnozwarciowa zwłoczna 51N",
    "67N": "kierunkowa ziemnozwarciowa 67N",
    "50N": "nadprądowa ziemnozwarciowa bezzwłoczna 50N",
}


def _metody_pl(kody: Any) -> str | None:
    if not isinstance(kody, list) or not all(isinstance(kod, str) for kod in kody):
        return None
    nazwy = [METODA_DETEKCJI_ZIEMNOZWARCIOWEJ_PL.get(kod) for kod in kody]
    if any(nazwa is None for nazwa in nazwy):
        return None
    return ", ".join(str(nazwa) for nazwa in nazwy)


def _podstawienie_detekcji_doziemnej(dane: Mapping[str, Any]) -> str | None:
    """`_earth_fault_detection`: `data={"neutral_grounding":…, "wariant_uziemienia_sn":…,
    "relay_methods":[…]}` — polskie nazwy zamiast kodów tabeli decyzyjnej (kategoria sieci
    wyprowadzona z wariantu zespołu uziemiającego modelu, karta UX-04/POLE-ZU)."""
    uziemienie = UZIEMIENIE_PUNKTU_NEUTRALNEGO_PL.get(str(dane.get("neutral_grounding")))
    metody = _metody_pl(dane.get("relay_methods"))
    if uziemienie is None or metody is None:
        return None
    return (
        rf"\text{{punkt neutralny: {uziemienie};}}\ "
        rf"\text{{metody dostępne w przekaźniku: {metody}}}"
    )


def _wynik_detekcji_doziemnej(dane: Mapping[str, Any], wynik: Mapping[str, Any]) -> str | None:
    """`_earth_fault_detection`: `result={"recommended_method":…, "required_functions":[…]}`
    — metoda zalecana i funkcje wymagane w przekaźniku. Ocenę dostępności (czy przekaźnik ma
    każdą funkcję) niesie rekord werdyktu wyjaśnialnego biegu, nie zdanie kroku śladu."""
    del dane
    metoda = METODA_DETEKCJI_ZIEMNOZWARCIOWEJ_PL.get(str(wynik.get("recommended_method")))
    funkcje = _metody_pl(wynik.get("required_functions"))
    if metoda is None or funkcje is None:
        return None
    return f"Metoda zalecana: {metoda}; funkcje wymagane w przekaźniku: {funkcje}"


# ---------------------------------------------------------------------------
# Rejestr — KAŻDY `step.key` nadawany przez `trace.add(...)` w
# `network_model/solvers/v126_academic.py` (27 unikatowych kluczy, pomiar
# `grep -c 'trace\.add('` == 28 wywołań, `benchmark_regression` dzieli wpis).
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
    # _neutral_earthing_design — typ projektu z wariantu zespołu uziemiającego modelu
    # (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 4; decyzja logiczna, bez jednostek).
    "neutral_earthing_scheme_from_model": WzorKroku(
        r"\text{Projekt} = f(\text{wariant zespołu uziemiającego sekcji SN})"
    ),
    # _neutral_earthing_design / _earth_fault_detection — model nie opisuje uziemienia sieci SN
    # (`brak_uziemienia_sn`: nazwana przyczyna, bez wartości zastępczej).
    "neutral_earthing_no_grounding_model": WzorKroku(
        r"\text{brak sposobu uziemienia w modelu} \Rightarrow \text{projekt niewykonany}"
    ),
    "earth_fault_no_grounding_model": WzorKroku(
        r"\text{brak sposobu uziemienia w modelu} \Rightarrow \text{metoda niewyznaczana}"
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
    # _petersen_design — prąd resztkowy dławika modelu (solver `doziemienie_sn`).
    "petersen_residual_current": WzorKroku(
        r"I_N = \sum_p \dfrac{U_f}{Z_{N,p} + Z_{0,p}/3}\text{,}\quad I_w = \mathrm{Re}\,I_N"
        r"\text{,}\quad I_L = -\mathrm{Im}\,I_N\text{,}\quad "
        r"I_{\mathrm{res}} = \sqrt{I_w^2 + (I_C - I_L)^2}\text{,}\quad v = \dfrac{I_C - I_L}{I_C}",
        podstawienie=_podstawienie_petersen_resztkowy,
    ),
    # _ner_design — brak danych rezystora punktu neutralnego albo punktów uziemienia w ruchu.
    "ner_no_resistor": WzorKroku(
        r"R_N = R_{\mathrm{zespołu}}\text{,}\quad "
        r"I_{\mathrm{ef}} = \left|\sum_p \dfrac{U_f}{Z_{N,p} + Z_{0,p}/3} + j I_C\right|"
    ),
    # _ner_design — rezystory punktu neutralnego z modelu (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA).
    "ner_resistance_sizing": WzorKroku(
        r"R_N = \left(\sum_k \dfrac{1}{R_k}\right)^{-1}\text{,}\quad "
        r"I_N = \sum_p \dfrac{U_f}{Z_{N,p} + Z_{0,p}/3}\text{,}\quad "
        r"I_{\mathrm{ef}} = \sqrt{I_R^2 + (I_C - I_L)^2}\ \ (I_R = \mathrm{Re}\,I_N,\ "
        r"I_L = -\mathrm{Im}\,I_N)",
        podstawienie=_podstawienie_ner_dobor,
    ),
    # _ner_thermal — brak czasu wyłączenia albo c_max (porównanie z t_wył niewykonane).
    "ner_thermal_incomplete": WzorKroku(
        r"E_k = I_{\mathrm{th},k}^2 \cdot R_k \cdot t_{\text{wył}} "
        r"\leq E_{n,k} = I_{n,k}^2 \cdot R_k \cdot t_{n,k}"
    ),
    # _ner_thermal — prąd największy rezystora i dopuszczalny czas doziemienia (IEC 60909-0).
    "ner_thermal_permissible_time": WzorKroku(
        r"I_{R,k} = \dfrac{c_{\max} U_f}{\left|R_k + Z_{0,\mathrm{TU}}/3\right|}\text{,}\quad "
        r"I_{\mathrm{th}}^2(t_{\mathrm{dop}}) \cdot t_{\mathrm{dop}} = I_{n,k}^2 \cdot t_{n,k}",
        podstawienie=_podstawienie_ner_czas_dopuszczalny,
    ),
    # _ner_thermal — sprawdzenie cieplne każdego rezystora w ruchu.
    "ner_thermal_withstand": WzorKroku(
        r"I_{\mathrm{th},k} = I_{R,k}\sqrt{m+n}\text{,}\quad "
        r"E_k = I_{\mathrm{th},k}^2 \cdot R_k \cdot t_{\text{wył}} "
        r"\leq E_{n,k} = I_{n,k}^2 \cdot R_k \cdot t_{n,k}",
        podstawienie=_podstawienie_ner_cieplo,
    ),
    # _insulation (IEC 60071 — przepięcie dorywcze wg trybu doziemienia i margines BIL).
    "iec60071_arrester_margin": WzorKroku(
        r"U_{\mathrm{TOV}} = k\,\dfrac{U_m}{\sqrt{3}}\text{,}\quad "
        r"M_{\mathrm{BIL}} = \dfrac{\mathrm{BIL} - U_{\mathrm{res}}}{U_{\mathrm{res}}}\cdot 100\%"
    ),
    # _earth_fault_detection, linia 1748-1757 (tabela decyzyjna — bez jednostek fizycznych).
    "earth_fault_method_selection": WzorKroku(
        r"\text{Metoda detekcji} = f(\text{sposób uziemienia punktu neutralnego},\ "
        r"\text{wyposażenie przekaźnika})",
        podstawienie=_podstawienie_detekcji_doziemnej,
        wynik_pl=_wynik_detekcji_doziemnej,
    ),
    # _transient — napięcie powrotne wobec obwiedni modelowej solvera (nie tabel IEC 62271-100).
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


def wzbogac_kroki_latex(
    kroki: list[JsonDict],
    klucze_po_odnosniku: Mapping[str, str] | None = None,
) -> list[JsonDict]:
    """Zwraca NOWĄ listę kroków śladu z dołożonym (kopia, nie mutacja)
    `formula_latex`/`substitution_latex` — WYŁĄCZNIE dla widoku API (trace,
    proof). Krok bez wpisu w rejestrze wraca BEZ ZMIAN (nie brakiem —
    kompletność pilnuje osobny test, ten adapter nigdy nie fabrykuje wzoru).
    Nie mutuje `kroki` ani zagnieżdżonych słowników — `result["white_box_trace"]`
    solvera i zapisany pakiet dowodowy (`proof_hash`) zostają bajtowo
    identyczne, bo hash liczony jest PRZED wywołaniem tego adaptera.

    `klucze_po_odnosniku` (karta #145): kroki PAKIETU DOWODOWEGO nie niosą `key`
    (`application/v126_artifacts.py` przepisuje z kroku śladu `proof_ref`, nie
    klucz), więc widok `/proof` podaje mapę `proof_ref` → `key` zbudowaną ze śladu
    TEGO biegu. Bez niej krok dowodu nie dostawał wzoru LaTeX i ekran pokazywał
    zapis ASCII solvera. Wpis rejestru z `wynik_pl` podmienia w KOPII kroku
    `result_pl` na zdanie złożone z danych kroku (kody decyzji → nazwy polskie).
    """
    wynik: list[JsonDict] = []
    for krok in kroki:
        if not isinstance(krok, Mapping):
            wynik.append(krok)
            continue
        wzbogacony: JsonDict = dict(krok)
        klucz = krok.get("key")
        if klucz is None and klucze_po_odnosniku is not None:
            klucz = klucze_po_odnosniku.get(str(krok.get("proof_ref", "")))
        wzor = REJESTR_WZOROW_V126.get(str(klucz or ""))
        if wzor is not None:
            wzbogacony["formula_latex"] = wzor.formula_latex
            dane_kroku = krok.get("data")
            if wzor.podstawienie is not None and isinstance(dane_kroku, Mapping):
                podstawienie_latex = wzor.podstawienie(dane_kroku)
                if podstawienie_latex is not None:
                    wzbogacony["substitution_latex"] = podstawienie_latex
            wynik_kroku = krok.get("result")
            if (
                wzor.wynik_pl is not None
                and isinstance(dane_kroku, Mapping)
                and isinstance(wynik_kroku, Mapping)
            ):
                opis_wyniku = wzor.wynik_pl(dane_kroku, wynik_kroku)
                if opis_wyniku is not None:
                    wzbogacony["result_pl"] = opis_wyniku
        wynik.append(wzbogacony)
    return wynik
