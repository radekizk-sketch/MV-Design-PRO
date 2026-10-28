"""Równania dowodu parametrów linii napowietrznej 110 kV z geometrii (karta LINIA-110).

Wzory liczy WYŁĄCZNIE solver ``network_model.solvers.parametry_linii_napowietrznej`` — ten
rejestr nadaje im stabilne identyfikatory, nazwy, podstawę i symbole dla pakietu dowodowego.
LaTeX każdego równania jest TEN SAM co ``KrokSladu.wzor_latex`` kroku solvera o kodzie z
``KOD_KROKU_NA_ROWNANIE`` (para przypięta testem
``tests/proof_engine/test_dowod_parametrow_linii.py`` — dwa teksty tego samego wzoru, które
„dziś się zgadzają", byłyby defektem czekającym na zmianę jednego z nich).
"""

from __future__ import annotations

from application.proof_engine.types import EquationDefinition, SymbolDefinition


def _s(symbol: str, unit: str, opis: str, klucz: str) -> SymbolDefinition:
    return SymbolDefinition(symbol=symbol, unit=unit, description_pl=opis, mapping_key=klucz)


_PODSTAWA_CARSON = "J. R. Carson, Bell System Technical Journal 5 (1926) 539–554"
_PODSTAWA_GMR = "W. H. Kersting, Distribution System Modeling and Analysis, rozdz. 4 (GMR, GMD)"
_PODSTAWA_TRANSPOZYCJA = "Linia transponowana — składowe symetryczne (założenie inżynierskie)"

EQ_OHL_001 = EquationDefinition(
    equation_id="EQ_OHL_001",
    name_pl="Rezystancja fazy w 20 °C",
    standard_ref="PN-EN 50182 (rezystancja prądu stałego w 20 °C z tablicy wyrobu)",
    latex=r"R'_{20} = \frac{R'_{20,\text{DC}}}{n}",
    symbols=(
        _s("R'_{20}", "Ω/km", "Rezystancja fazy w 20 °C", "ohl_r20_fazy"),
        _s(r"R'_{20,\text{DC}}", "Ω/km", "Rezystancja przewodu z tablicy wyrobu", "ohl_r20_dc"),
        _s("n", "—", "Liczba przewodów w wiązce fazy", "ohl_liczba_w_wiazce"),
    ),
    unit_derivation="Ω/km / (—) = Ω/km",
    notes="Rezystancja 50 Hz równa rezystancji prądu stałego — założenie inżynierskie.",
)

EQ_OHL_002 = EquationDefinition(
    equation_id="EQ_OHL_002",
    name_pl="Rezystancja fazy w temperaturze przewodu",
    standard_ref="IEC 60909-0:2016, wzór R_L(θ_e)",
    latex=r"R'_{\theta} = R'_{20}\,[1 + \alpha(\theta - 20\ ^{\circ}\text{C})]",
    symbols=(
        _s(r"R'_{\theta}", "Ω/km", "Rezystancja w temperaturze przewodu", "ohl_r_theta"),
        _s("R'_{20}", "Ω/km", "Rezystancja fazy w 20 °C", "ohl_r20_fazy"),
        _s(r"\alpha", "1/K", "Współczynnik temperaturowy rezystancji", "ohl_alfa"),
        _s(r"\theta", "°C", "Temperatura dopuszczalna długotrwale przewodu", "ohl_theta"),
    ),
    unit_derivation="Ω/km · (1 + 1/K · °C) = Ω/km",
)

EQ_OHL_003 = EquationDefinition(
    equation_id="EQ_OHL_003",
    name_pl="GMR przewodu z budowy",
    standard_ref=_PODSTAWA_GMR,
    latex=(
        r"GMR = \Big(\prod_{i=1}^{N}\prod_{j=1}^{N} D_{ij}\Big)^{1/N^2},\quad "
        r"D_{ii} = \tfrac{d}{2}\,e^{-1/4}"
    ),
    symbols=(
        _s("GMR", "mm", "Średni geometryczny promień przewodu", "ohl_gmr_przewodu"),
        _s("N", "—", "Liczba drutów aluminiowych", "ohl_liczba_drutow_al"),
        _s("d", "mm", "Średnica drutu aluminiowego", "ohl_srednica_drutu_al"),
        _s(r"\varnothing_{\text{rdzenia}}", "mm", "Średnica rdzenia stalowego", "ohl_rdzen"),
    ),
    unit_derivation="(mm^{N²})^{1/N²} = mm",
    notes="Prąd w drutach aluminiowych — założenie inżynierskie zgodne z tablicą PN-EN 50182.",
)

EQ_OHL_004 = EquationDefinition(
    equation_id="EQ_OHL_004",
    name_pl="GMR przewodu z tablicy wyrobu",
    standard_ref="Dana typu katalogowego przewodu",
    latex=r"GMR = GMR_{\text{tabl}}",
    symbols=(
        _s("GMR", "mm", "Średni geometryczny promień przewodu", "ohl_gmr_przewodu"),
        _s(r"GMR_{\text{tabl}}", "mm", "GMR z tablicy wyrobu", "ohl_gmr_tablicowy"),
    ),
    unit_derivation="mm = mm",
)

EQ_OHL_005 = EquationDefinition(
    equation_id="EQ_OHL_005",
    name_pl="GMR i promień zastępczy wiązki",
    standard_ref=_PODSTAWA_GMR,
    latex=(
        r"A = \frac{s}{2\sin(\pi/n)},\ GMR_w = (n\,GMR\,A^{n-1})^{1/n},\ "
        r"r_w = (n\,r\,A^{n-1})^{1/n}"
    ),
    symbols=(
        _s("GMR_w", "m", "GMR fazy (wiązki)", "ohl_gmr_fazy"),
        _s("n", "—", "Liczba przewodów w wiązce", "ohl_liczba_w_wiazce"),
        _s("s", "m", "Odstęp przewodów w wiązce", "ohl_odstep_wiazki"),
        _s("GMR", "m", "GMR przewodu", "ohl_gmr_przewodu_m"),
        _s("r", "m", "Promień zewnętrzny przewodu", "ohl_promien_przewodu"),
    ),
    unit_derivation="(m · m^{n−1})^{1/n} = m",
)

EQ_OHL_006 = EquationDefinition(
    equation_id="EQ_OHL_006",
    name_pl="Średnia geometryczna odległość faz",
    standard_ref=_PODSTAWA_GMR,
    latex=r"GMD = \sqrt[3]{d_{12}\,d_{13}\,d_{23}}",
    symbols=(
        _s("GMD", "m", "Średnia geometryczna odległość faz", "ohl_gmd"),
        _s("d_{12}", "m", "Odległość faz L1–L2", "ohl_d12"),
        _s("d_{13}", "m", "Odległość faz L1–L3", "ohl_d13"),
        _s("d_{23}", "m", "Odległość faz L2–L3", "ohl_d23"),
    ),
    unit_derivation="(m³)^{1/3} = m",
)

EQ_OHL_007 = EquationDefinition(
    equation_id="EQ_OHL_007",
    name_pl="Zastępcza głębokość wnikania prądu w ziemię (kontrolnie)",
    standard_ref=_PODSTAWA_CARSON + " — pierwszy wyraz szeregu",
    latex=r"\delta = \frac{1{,}851}{\sqrt{\omega\mu_0/\rho}}",
    symbols=(
        _s(r"\delta", "m", "Zastępcza głębokość wnikania", "ohl_delta"),
        _s(r"\omega", "rad/s", "Pulsacja", "ohl_omega"),
        _s(r"\mu_0", "H/m", "Przenikalność magnetyczna próżni (CODATA 2018)", "ohl_mi0"),
        _s(r"\rho", "Ω·m", "Rezystywność gruntu", "ohl_rho"),
    ),
    unit_derivation="1 / √(rad/s · H/m / Ω·m) = m",
)

EQ_OHL_008 = EquationDefinition(
    equation_id="EQ_OHL_008",
    name_pl="Macierz impedancji pierwotnych z poprawką ziemi Carsona",
    standard_ref=_PODSTAWA_CARSON + " — postać całkowa",
    latex=(
        r"Z_{ii} = R'_i + j\frac{\omega\mu_0}{2\pi}\ln\frac{2h_i}{GMR_i} + \Delta Z_{ii},\ "
        r"Z_{ij} = j\frac{\omega\mu_0}{2\pi}\ln\frac{D'_{ij}}{d_{ij}} + \Delta Z_{ij},\ "
        r"\Delta Z = \frac{j\omega\mu_0}{\pi}\int_0^{\infty}"
        r"\frac{e^{-(h_i+h_j)\lambda}\cos(x_{ij}\lambda)}"
        r"{\lambda+\sqrt{\lambda^2+j\omega\mu_0/\rho}}\,d\lambda"
    ),
    symbols=(
        _s("Z_{11}", "Ω/km", "Impedancja własna fazy L1 z powrotem przez ziemię", "ohl_z11"),
        _s("f", "Hz", "Częstotliwość", "ohl_f"),
        _s(r"\rho", "Ω·m", "Rezystywność gruntu", "ohl_rho"),
        _s("h_1", "m", "Średnia wysokość fazy L1", "ohl_h1"),
        _s("GMR_1", "m", "GMR fazy L1", "ohl_gmr_fazy"),
    ),
    unit_derivation="Ω/m · 1000 = Ω/km",
)

EQ_OHL_009 = EquationDefinition(
    equation_id="EQ_OHL_009",
    name_pl="Redukcja Krona przewodów odgromowych",
    standard_ref="Standard ENEA Operator linii 110 kV (06.2026) §4.6 — każdy słup uziemiony",
    latex=r"Z_f = Z_{ff} - Z_{fg}\,Z_{gg}^{-1}\,Z_{gf}",
    symbols=(
        _s("Z_{f,11}", "Ω/km", "Impedancja własna fazy po redukcji", "ohl_zf11"),
        _s("Z_{ff,11}", "Ω/km", "Impedancja własna fazy przed redukcją", "ohl_z11"),
        _s("Z_{gg,11}", "Ω/km", "Impedancja własna przewodu odgromowego", "ohl_zgg11"),
    ),
    unit_derivation="Ω/km − Ω/km · (Ω/km)⁻¹ · Ω/km = Ω/km",
)

EQ_OHL_010 = EquationDefinition(
    equation_id="EQ_OHL_010",
    name_pl="Impedancja składowej zgodnej",
    standard_ref=_PODSTAWA_TRANSPOZYCJA,
    latex=r"Z'_1 = Z_s - Z_m",
    symbols=(
        _s("Z'_1", "Ω/km", "Impedancja jednostkowa składowej zgodnej", "ohl_z1"),
        _s("Z_s", "Ω/km", "Średnia impedancja własna", "ohl_zs"),
        _s("Z_m", "Ω/km", "Średnia impedancja wzajemna", "ohl_zm"),
    ),
    unit_derivation="Ω/km − Ω/km = Ω/km",
)

EQ_OHL_011 = EquationDefinition(
    equation_id="EQ_OHL_011",
    name_pl="Impedancja składowej zerowej z wpływem ziemi",
    standard_ref=_PODSTAWA_TRANSPOZYCJA + "; ziemia wg Carsona",
    latex=r"Z'_0 = Z_s + 2Z_m",
    symbols=(
        _s("Z'_0", "Ω/km", "Impedancja jednostkowa składowej zerowej", "ohl_z0"),
        _s("Z_s", "Ω/km", "Średnia impedancja własna", "ohl_zs"),
        _s("Z_m", "Ω/km", "Średnia impedancja wzajemna", "ohl_zm"),
    ),
    unit_derivation="Ω/km + 2·Ω/km = Ω/km",
)

EQ_OHL_012 = EquationDefinition(
    equation_id="EQ_OHL_012",
    name_pl="Impedancja składowej zerowej bez przewodów odgromowych (porównawczo)",
    standard_ref=_PODSTAWA_TRANSPOZYCJA,
    latex=r"Z'_{0,\text{bez}} = Z_{s,ff} + 2Z_{m,ff}",
    symbols=(
        _s(r"Z'_{0,\text{bez}}", "Ω/km", "Z′0 bez przewodów odgromowych", "ohl_z0_bez"),
        _s("Z_{s,ff}", "Ω/km", "Średnia impedancja własna faz", "ohl_zs_ff"),
        _s("Z_{m,ff}", "Ω/km", "Średnia impedancja wzajemna faz", "ohl_zm_ff"),
    ),
    unit_derivation="Ω/km + 2·Ω/km = Ω/km",
)

EQ_OHL_013 = EquationDefinition(
    equation_id="EQ_OHL_013",
    name_pl="Kontrola reaktancji składowej zgodnej (GMD/GMR)",
    standard_ref=_PODSTAWA_GMR,
    latex=r"X'_1 \approx \frac{\omega\mu_0}{2\pi}\ln\frac{GMD}{GMR_w}",
    symbols=(
        _s("X'_1", "Ω/km", "Reaktancja składowej zgodnej (wzór klasyczny)", "ohl_x1_kontrolne"),
        _s("GMD", "m", "Średnia geometryczna odległość faz", "ohl_gmd"),
        _s("GMR_w", "m", "GMR fazy", "ohl_gmr_fazy"),
        _s(r"\frac{\omega\mu_0}{2\pi}", "Ω/km", "Stała indukcyjności przy f", "ohl_stala_x"),
    ),
    unit_derivation="Ω/km · ln(m/m) = Ω/km",
)

EQ_OHL_014 = EquationDefinition(
    equation_id="EQ_OHL_014",
    name_pl="Susceptancje składowej zgodnej i zerowej",
    standard_ref="Metoda odbić zwierciadlanych (ziemia ekwipotencjalna), redukcja Krona",
    latex=(
        r"P_{ii} = \frac{\ln(2h_i/r_i)}{2\pi\varepsilon_0},\ "
        r"P_{ij} = \frac{\ln(D'_{ij}/d_{ij})}{2\pi\varepsilon_0},\ "
        r"B'_1 = \frac{\omega}{P_s - P_m},\ B'_0 = \frac{\omega}{P_s + 2P_m}"
    ),
    symbols=(
        _s("B'_1", "μS/km", "Susceptancja składowej zgodnej", "ohl_b1"),
        _s("P_s", "m/F", "Średni współczynnik potencjałowy własny", "ohl_ps"),
        _s("P_m", "m/F", "Średni współczynnik potencjałowy wzajemny", "ohl_pm"),
        _s(r"\omega", "rad/s", "Pulsacja", "ohl_omega"),
    ),
    unit_derivation="(rad/s) / (m/F) = S/m → μS/km",
)

#: Równania dowodu parametrów linii (scalane do głównego rejestru dowodów).
OHL_EQUATIONS: dict[str, EquationDefinition] = {
    rownanie.equation_id: rownanie
    for rownanie in (
        EQ_OHL_001,
        EQ_OHL_002,
        EQ_OHL_003,
        EQ_OHL_004,
        EQ_OHL_005,
        EQ_OHL_006,
        EQ_OHL_007,
        EQ_OHL_008,
        EQ_OHL_009,
        EQ_OHL_010,
        EQ_OHL_011,
        EQ_OHL_012,
        EQ_OHL_013,
        EQ_OHL_014,
    )
}

#: Kod kroku śladu solvera → równanie. GMR ma dwa warianty (z budowy, z tablicy) — wybór
#: po wzorze kroku w ``rownanie_kroku``.
KOD_KROKU_NA_ROWNANIE: dict[str, tuple[str, ...]] = {
    "R1_20": ("EQ_OHL_001",),
    "R1_THETA": ("EQ_OHL_002",),
    "GMR_FAZOWY": ("EQ_OHL_003", "EQ_OHL_004"),
    "GMR_ODGROMOWY": ("EQ_OHL_003", "EQ_OHL_004"),
    "WIAZKA": ("EQ_OHL_005",),
    "GMD": ("EQ_OHL_006",),
    "DELTA": ("EQ_OHL_007",),
    "Z_PIERWOTNE": ("EQ_OHL_008",),
    "KRON_Z": ("EQ_OHL_009",),
    "Z1": ("EQ_OHL_010",),
    "Z0": ("EQ_OHL_011",),
    "Z0_BEZ_ODGROMOWYCH": ("EQ_OHL_012",),
    "X1_KONTROLA": ("EQ_OHL_013",),
    "B1_B0": ("EQ_OHL_014",),
}


def rownanie_kroku(kod: str, wzor_latex: str) -> EquationDefinition:
    """Równanie rejestru dla kroku śladu: kod kroku + IDENTYCZNY wzór.

    Rozjazd wzoru kroku solvera z rejestrem jest błędem programu (rejestr i solver to dwa pliki
    jednego wydania), nie odmową danych użytkownika — stąd asercja, nie ``ValueError``
    (``scripts/polykanie_wyjatkow_guard.py``, druga połowa)."""
    for equation_id in KOD_KROKU_NA_ROWNANIE[kod]:
        rownanie = OHL_EQUATIONS[equation_id]
        if rownanie.latex == wzor_latex:
            return rownanie
    raise AssertionError(
        f"Krok śladu {kod!r} ma wzór spoza rejestru równań dowodu parametrów linii — "
        "rejestr i solver rozjechały się."
    )
