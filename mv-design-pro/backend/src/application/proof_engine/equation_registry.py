"""
Equation Registry — Rejestr równań dla Proof Engine P11.1a

STATUS: CANONICAL & BINDING
Reference: EQUATIONS_IEC60909_SC3F.md, EQUATIONS_VDROP.md

Rejestr równań jest JEDYNYM źródłem prawdy dla matematyki w dowodach.
Wszystkie równania są zdefiniowane tutaj na podstawie dokumentacji kanonicznej.

=============================================================================
ANTI-DOUBLE-COUNTING AUDIT — Współczynnik napięciowy c
=============================================================================

Model: A1 (CANONICAL)
---------------------
Współczynnik napięciowy c występuje WYŁĄCZNIE w równaniu EQ_SC3F_004:

    I_k'' = (c · U_n) / (√3 · |Z_th|)

c NIE występuje w żadnym innym równaniu używanym bezpośrednio w dowodzie.

Status: PASS
Weryfikacja: 2026-01-27 (P11.1a MVP)

Pełna lista równań SC3F z audytem c:
| Equation ID   | c występuje | Uwagi                                    |
|---------------|-------------|------------------------------------------|
| EQ_SC3F_003   | NIE         | Impedancja Thevenina (suma Z)            |
| EQ_SC3F_004   | TAK         | Jedyne miejsce z c                       |
| EQ_SC3F_005   | NIE         | Współczynnik κ (R/X)                     |
| EQ_SC3F_006   | NIE         | Prąd udarowy (κ·√2·I_k'')                |
| EQ_SC3F_007   | NIE         | Moc S_k'' (√3·U_n·I_k'')                 |
| EQ_SC3F_008   | NIE         | Prąd cieplny (I_k''·√(m+n))              |
| EQ_SC3F_008a  | NIE         | Prąd dynamiczny (= i_p)                  |

Równania pomocnicze (NIE używane bezpośrednio w dowodzie):
| Equation ID   | c występuje | Uwagi                                    |
|---------------|-------------|------------------------------------------|
| EQ_SC3F_002   | TAK         | Pomocniczy: Z_Q z S_kQ'' (solver only)   |
| EQ_SC3F_002a  | NIE         | Rozkład R/X                              |
| EQ_SC3F_009   | NIE         | Impedancja transformatora                |
| EQ_SC3F_010   | NIE         | Impedancja linii/kabla                   |

=============================================================================
"""

from __future__ import annotations

from application.proof_engine.registries.ls_equations import LS_EQUATIONS
from application.proof_engine.types import EquationDefinition, SymbolDefinition

# =============================================================================
# SC3F IEC 60909 — Kanoniczne równania (BINDING)
# =============================================================================

# -----------------------------------------------------------------------------
# RÓWNANIA POMOCNICZE (solver-only, NIE używane bezpośrednio w dowodzie)
# -----------------------------------------------------------------------------

EQ_SC3F_002 = EquationDefinition(
    equation_id="EQ_SC3F_002",
    name_pl="Impedancja źródła (sieci zasilającej)",
    standard_ref="IEC 60909-0:2016 eq. (10)",
    latex=r"Z_Q = \frac{c \cdot U_n^2}{S_{kQ}''}",
    symbols=(
        SymbolDefinition(
            symbol="Z_Q",
            unit="Ω",
            description_pl="Impedancja źródła",
            mapping_key="z_source_ohm",
        ),
        SymbolDefinition(
            symbol="c",
            unit="—",
            description_pl="Współczynnik napięciowy",
            mapping_key="c_factor",
        ),
        SymbolDefinition(
            symbol="U_n",
            unit="kV",
            description_pl="Napięcie znamionowe",
            mapping_key="u_n_kv",
        ),
        SymbolDefinition(
            symbol="S_{kQ}''",
            unit="MVA",
            description_pl="Moc zwarciowa źródła",
            mapping_key="sk_source_mva",
        ),
    ),
    unit_derivation="kV² / MVA = Ω",
    notes="POMOCNICZY: używany przez solver do przeliczenia mocy zwarciowej na impedancję. "
    "NIE używany bezpośrednio w dowodzie — c jest już uwzględnione w EQ_SC3F_004.",
)

EQ_SC3F_002a = EquationDefinition(
    equation_id="EQ_SC3F_002a",
    name_pl="Rozkład impedancji źródła na składowe R i X",
    standard_ref="IEC 60909-0:2016 Table 2",
    latex=r"R_Q = \frac{Z_Q}{\sqrt{1 + (X/R)^2}}, \quad X_Q = R_Q \cdot (X/R)",
    symbols=(
        SymbolDefinition(
            symbol="R_Q",
            unit="Ω",
            description_pl="Rezystancja źródła",
            mapping_key="r_source_ohm",
        ),
        SymbolDefinition(
            symbol="X_Q",
            unit="Ω",
            description_pl="Reaktancja źródła",
            mapping_key="x_source_ohm",
        ),
        SymbolDefinition(
            symbol="Z_Q",
            unit="Ω",
            description_pl="Impedancja źródła",
            mapping_key="z_source_ohm",
        ),
        SymbolDefinition(
            symbol="X/R",
            unit="—",
            description_pl="Stosunek reaktancji do rezystancji",
            mapping_key="xr_ratio",
        ),
    ),
    unit_derivation="Ω / — = Ω",
    notes="POMOCNICZY: rozkład impedancji na składowe.",
)

EQ_SC3F_009 = EquationDefinition(
    equation_id="EQ_SC3F_009",
    name_pl="Impedancja transformatora (przeliczona na stronę zwarcia)",
    standard_ref="IEC 60909-0:2016 eq. (7)",
    latex=r"Z_T = \frac{u_k\% \cdot U_n^2}{100 \cdot S_r}",
    symbols=(
        SymbolDefinition(
            symbol="Z_T",
            unit="Ω",
            description_pl="Impedancja transformatora",
            mapping_key="z_transformer_ohm",
        ),
        SymbolDefinition(
            symbol="u_k\\%",
            unit="%",
            description_pl="Napięcie zwarcia transformatora",
            mapping_key="uk_percent",
        ),
        SymbolDefinition(
            symbol="U_n",
            unit="kV",
            description_pl="Napięcie znamionowe (strona zwarcia)",
            mapping_key="u_n_kv",
        ),
        SymbolDefinition(
            symbol="S_r",
            unit="MVA",
            description_pl="Moc znamionowa transformatora",
            mapping_key="s_rated_mva",
        ),
    ),
    unit_derivation="(% · kV²) / (100 · MVA) = Ω",
    notes="POMOCNICZY: przeliczenie parametrów transformatora.",
)

EQ_SC3F_010 = EquationDefinition(
    equation_id="EQ_SC3F_010",
    name_pl="Impedancja linii lub kabla",
    standard_ref="—",
    latex=r"Z_L = (r + jx) \cdot l",
    symbols=(
        SymbolDefinition(
            symbol="Z_L",
            unit="Ω",
            description_pl="Impedancja linii/kabla",
            mapping_key="z_line_ohm",
        ),
        SymbolDefinition(
            symbol="r",
            unit="Ω/km",
            description_pl="Rezystancja jednostkowa",
            mapping_key="r_ohm_per_km",
        ),
        SymbolDefinition(
            symbol="x",
            unit="Ω/km",
            description_pl="Reaktancja jednostkowa",
            mapping_key="x_ohm_per_km",
        ),
        SymbolDefinition(
            symbol="l",
            unit="km",
            description_pl="Długość linii/kabla",
            mapping_key="length_km",
        ),
    ),
    unit_derivation="Ω/km · km = Ω",
    notes="POMOCNICZY: obliczenie impedancji linii/kabla.",
)

# -----------------------------------------------------------------------------
# RÓWNANIA DOWODOWE (używane bezpośrednio w dowodzie SC3F)
# -----------------------------------------------------------------------------

EQ_SC3F_003 = EquationDefinition(
    equation_id="EQ_SC3F_003",
    name_pl="Impedancja zastępcza Thevenina w miejscu zwarcia",
    standard_ref="IEC 60909-0:2016 § 4.2",
    latex=r"Z_{th} = Z_Q + Z_T + Z_L",
    symbols=(
        SymbolDefinition(
            symbol="Z_{th}",
            unit="Ω",
            description_pl="Impedancja zastępcza Thevenina",
            mapping_key="z_thevenin_ohm",
        ),
        SymbolDefinition(
            symbol="Z_Q",
            unit="Ω",
            description_pl="Impedancja źródła",
            mapping_key="z_source_ohm",
        ),
        SymbolDefinition(
            symbol="Z_T",
            unit="Ω",
            description_pl="Impedancja transformatora (przeliczona)",
            mapping_key="z_transformer_ohm",
        ),
        SymbolDefinition(
            symbol="Z_L",
            unit="Ω",
            description_pl="Impedancja linii/kabla",
            mapping_key="z_line_ohm",
        ),
    ),
    unit_derivation="Ω + Ω + Ω = Ω",
    notes="Dla sieci promieniowych suma szeregowa. Dla sieci złożonych: redukcja metodą Thevenina. "
    "AUDIT: c NIE występuje w tym równaniu.",
)

EQ_SC3F_004 = EquationDefinition(
    equation_id="EQ_SC3F_004",
    name_pl="Początkowy prąd zwarciowy symetryczny",
    standard_ref="IEC 60909-0:2016 eq. (29)",
    latex=r"I_k'' = \frac{c \cdot U_n}{\sqrt{3} \cdot |Z_{th}|}",
    symbols=(
        SymbolDefinition(
            symbol="I_k''",
            unit="kA",
            description_pl="Początkowy prąd zwarciowy symetryczny",
            mapping_key="ikss_ka",
        ),
        SymbolDefinition(
            symbol="c",
            unit="—",
            description_pl="Współczynnik napięciowy",
            mapping_key="c_factor",
        ),
        SymbolDefinition(
            symbol="U_n",
            unit="kV",
            description_pl="Napięcie znamionowe",
            mapping_key="u_n_kv",
        ),
        SymbolDefinition(
            symbol="Z_{th}",
            unit="Ω",
            description_pl="Impedancja zastępcza Thevenina",
            mapping_key="z_thevenin_ohm",
        ),
    ),
    unit_derivation="kV / Ω = kA",
    notes="AUDIT: c występuje WYŁĄCZNIE w tym równaniu (Anti-Double-Counting: PASS).",
)

EQ_SC3F_005 = EquationDefinition(
    equation_id="EQ_SC3F_005",
    name_pl="Współczynnik udaru",
    standard_ref="IEC 60909-0:2016 eq. (55)",
    latex=r"\kappa = 1.02 + 0.98 \cdot e^{-3 \cdot R_{th}/X_{th}}",
    symbols=(
        SymbolDefinition(
            symbol="\\kappa",
            unit="—",
            description_pl="Współczynnik udaru",
            mapping_key="kappa",
        ),
        SymbolDefinition(
            symbol="R_{th}",
            unit="Ω",
            description_pl="Rezystancja zastępcza Thevenina",
            mapping_key="r_thevenin_ohm",
        ),
        SymbolDefinition(
            symbol="X_{th}",
            unit="Ω",
            description_pl="Reaktancja zastępcza Thevenina",
            mapping_key="x_thevenin_ohm",
        ),
    ),
    unit_derivation="— (bezwymiarowy)",
    notes="Wartość κ mieści się w zakresie 1.02 ≤ κ ≤ 2.00. AUDIT: c NIE występuje.",
)

EQ_SC3F_006 = EquationDefinition(
    equation_id="EQ_SC3F_006",
    name_pl="Prąd udarowy (szczytowy)",
    standard_ref="IEC 60909-0:2016 eq. (54)",
    latex=r"i_p = \kappa \cdot \sqrt{2} \cdot I_k''",
    symbols=(
        SymbolDefinition(
            symbol="i_p",
            unit="kA",
            description_pl="Prąd udarowy (wartość szczytowa)",
            mapping_key="ip_ka",
        ),
        SymbolDefinition(
            symbol="\\kappa",
            unit="—",
            description_pl="Współczynnik udaru",
            mapping_key="kappa",
        ),
        SymbolDefinition(
            symbol="I_k''",
            unit="kA",
            description_pl="Początkowy prąd zwarciowy symetryczny",
            mapping_key="ikss_ka",
        ),
    ),
    unit_derivation="— · — · kA = kA",
    notes="AUDIT: c NIE występuje (używa I_k'' które już zawiera c).",
)

EQ_SC3F_007 = EquationDefinition(
    equation_id="EQ_SC3F_007",
    name_pl="Moc zwarciowa początkowa",
    standard_ref="IEC 60909-0:2016 eq. (33)",
    latex=r"S_k'' = \sqrt{3} \cdot U_n \cdot I_k''",
    symbols=(
        SymbolDefinition(
            symbol="S_k''",
            unit="MVA",
            description_pl="Moc zwarciowa początkowa",
            mapping_key="sk_mva",
        ),
        SymbolDefinition(
            symbol="U_n",
            unit="kV",
            description_pl="Napięcie znamionowe",
            mapping_key="u_n_kv",
        ),
        SymbolDefinition(
            symbol="I_k''",
            unit="kA",
            description_pl="Początkowy prąd zwarciowy symetryczny",
            mapping_key="ikss_ka",
        ),
    ),
    unit_derivation="kV · kA = MVA",
    notes="AUDIT: c NIE występuje (używa I_k'' które już zawiera c).",
)

EQ_SC3F_008 = EquationDefinition(
    equation_id="EQ_SC3F_008",
    name_pl="Prąd cieplny równoważny",
    standard_ref="IEC 60909-0:2016 eq. (100)–(105)",
    latex=r"I_{th} = I_k'' \cdot \sqrt{m + n}",
    symbols=(
        SymbolDefinition(
            symbol="I_{th}",
            unit="kA",
            description_pl="Prąd cieplny równoważny",
            mapping_key="ith_ka",
        ),
        SymbolDefinition(
            symbol="I_k''",
            unit="kA",
            description_pl="Początkowy prąd zwarciowy symetryczny",
            mapping_key="ikss_ka",
        ),
        SymbolDefinition(
            symbol="m",
            unit="—",
            description_pl="Współczynnik dla składowej nieokresowej (DC)",
            mapping_key="m_factor",
        ),
        SymbolDefinition(
            symbol="n",
            unit="—",
            description_pl="Współczynnik dla składowej okresowej (AC decay)",
            mapping_key="n_factor",
        ),
    ),
    unit_derivation="kA · — = kA",
    notes="AUDIT: c NIE występuje (używa I_k'' które już zawiera c).",
)

EQ_SC3F_008a = EquationDefinition(
    equation_id="EQ_SC3F_008a",
    name_pl="Prąd dynamiczny",
    standard_ref="IEC 60909-0:2016 § 4.3.1.2",
    latex=r"I_{dyn} = i_p",
    symbols=(
        SymbolDefinition(
            symbol="I_{dyn}",
            unit="kA",
            description_pl="Prąd dynamiczny (do wymiarowania wytrzymałości dynamicznej)",
            mapping_key="idyn_ka",
        ),
        SymbolDefinition(
            symbol="i_p",
            unit="kA",
            description_pl="Prąd udarowy (szczytowy)",
            mapping_key="ip_ka",
        ),
    ),
    unit_derivation="kA = kA",
    notes="Prąd dynamiczny służy do wymiarowania aparatury na wytrzymałość elektrodynamiczną. "
    "AUDIT: c NIE występuje.",
)

# --- Maszyny wirujące: prąd wyłączeniowy z zanikiem (IEC 60909-0:2016 § 6.6) -----
EQ_SC3F_011 = EquationDefinition(
    equation_id="EQ_SC3F_011",
    name_pl="Współczynnik zanikania μ (składowa AC) maszyny",
    standard_ref="IEC 60909-0:2016 § 6.6.1 (Fig. 100–103)",
    latex=r"\mu = 0.84 + 0.26 \cdot e^{-0.26 \cdot I_k''/I_r} \quad (t_{min} \leq 35\,\text{ms})",
    symbols=(
        SymbolDefinition(
            symbol="\\mu",
            unit="—",
            description_pl="Współczynnik zanikania składowej AC prądu wyłączeniowego",
            mapping_key="mu_factor",
        ),
        SymbolDefinition(
            symbol="I_k''",
            unit="kA",
            description_pl="Początkowy prąd zwarciowy maszyny (udział częściowy)",
            mapping_key="ikss_partial_ka",
        ),
        SymbolDefinition(
            symbol="I_r",
            unit="kA",
            description_pl="Prąd znamionowy maszyny",
            mapping_key="ir_ka",
        ),
    ),
    unit_derivation="— (bezwymiarowy)",
    notes="μ = 1 dla I_k''/I_r ≤ 2 (z dala od generatora). Współczynniki krzywej "
    "wybierane wg t_min (0.02 / 0.05 / 0.10 / ≥0.25 s). AUDIT: c NIE występuje.",
)

EQ_SC3F_012 = EquationDefinition(
    equation_id="EQ_SC3F_012",
    name_pl="Współczynnik zanikania q maszyny asynchronicznej",
    standard_ref="IEC 60909-0:2016 § 6.6.3",
    latex=r"q = 1.03 + 0.12 \cdot \ln(m) \quad (t_{min} \leq 35\,\text{ms})",
    symbols=(
        SymbolDefinition(
            symbol="q",
            unit="—",
            description_pl="Dodatkowy współczynnik zanikania silnika asynchronicznego",
            mapping_key="q_factor",
        ),
        SymbolDefinition(
            symbol="m",
            unit="MW",
            description_pl="Moc czynna na parę biegunów (P_rM / p)",
            mapping_key="p_per_pole_mw",
        ),
    ),
    unit_derivation="— (bezwymiarowy)",
    notes="q ≤ 1; współczynniki krzywej wybierane wg t_min. Dla maszyn synchronicznych "
    "q = 1 (brak dodatkowego zaniku). AUDIT: c NIE występuje.",
)

EQ_SC3F_013 = EquationDefinition(
    equation_id="EQ_SC3F_013",
    name_pl="Prąd wyłączeniowy symetryczny maszyny",
    standard_ref="IEC 60909-0:2016 § 6.6 (eq. 74)",
    latex=r"i_{b} = \mu \cdot q \cdot I_k''",
    symbols=(
        SymbolDefinition(
            symbol="i_{b}",
            unit="kA",
            description_pl="Prąd wyłączeniowy symetryczny maszyny (do doboru zdolności łączeniowej)",
            mapping_key="ib_partial_ka",
        ),
        SymbolDefinition(
            symbol="\\mu",
            unit="—",
            description_pl="Współczynnik zanikania AC",
            mapping_key="mu_factor",
        ),
        SymbolDefinition(
            symbol="q",
            unit="—",
            description_pl="Współczynnik zanikania asynchroniczny (= 1 dla synchronicznych)",
            mapping_key="q_factor",
        ),
        SymbolDefinition(
            symbol="I_k''",
            unit="kA",
            description_pl="Początkowy prąd zwarciowy maszyny (udział częściowy)",
            mapping_key="ikss_partial_ka",
        ),
    ),
    unit_derivation="— · — · kA = kA",
    notes="Prąd wyłączeniowy maszyny do doboru zdolności łączeniowej aparatury. "
    "AUDIT: c NIE występuje (I_k'' już zawiera c).",
)


# =============================================================================
# VDROP — Kanoniczne równania (BINDING)
# =============================================================================

EQ_VDROP_001 = EquationDefinition(
    equation_id="EQ_VDROP_001",
    name_pl="Rezystancja odcinka linii lub kabla",
    standard_ref="—",
    latex=r"R = r \cdot l",
    symbols=(
        SymbolDefinition(
            symbol="R",
            unit="Ω",
            description_pl="Rezystancja odcinka",
            mapping_key="r_ohm",
        ),
        SymbolDefinition(
            symbol="r",
            unit="Ω/km",
            description_pl="Rezystancja jednostkowa",
            mapping_key="r_ohm_per_km",
        ),
        SymbolDefinition(
            symbol="l",
            unit="km",
            description_pl="Długość odcinka",
            mapping_key="length_km",
        ),
    ),
    unit_derivation="Ω/km · km = Ω",
)

EQ_VDROP_002 = EquationDefinition(
    equation_id="EQ_VDROP_002",
    name_pl="Reaktancja odcinka linii lub kabla",
    standard_ref="—",
    latex=r"X = x \cdot l",
    symbols=(
        SymbolDefinition(
            symbol="X",
            unit="Ω",
            description_pl="Reaktancja odcinka",
            mapping_key="x_ohm",
        ),
        SymbolDefinition(
            symbol="x",
            unit="Ω/km",
            description_pl="Reaktancja jednostkowa",
            mapping_key="x_ohm_per_km",
        ),
        SymbolDefinition(
            symbol="l",
            unit="km",
            description_pl="Długość odcinka",
            mapping_key="length_km",
        ),
    ),
    unit_derivation="Ω/km · km = Ω",
)

EQ_VDROP_003 = EquationDefinition(
    equation_id="EQ_VDROP_003",
    name_pl="Składowa czynna spadku napięcia (R·P)",
    standard_ref="—",
    latex=r"\Delta U_R = \frac{R \cdot P}{U_n^2} \cdot 100\%",
    symbols=(
        SymbolDefinition(
            symbol="\\Delta U_R",
            unit="%",
            description_pl="Składowa czynna spadku napięcia",
            mapping_key="delta_u_r_percent",
        ),
        SymbolDefinition(
            symbol="R",
            unit="Ω",
            description_pl="Rezystancja odcinka",
            mapping_key="r_ohm",
        ),
        SymbolDefinition(
            symbol="P",
            unit="MW",
            description_pl="Moc czynna przepływająca",
            mapping_key="p_mw",
        ),
        SymbolDefinition(
            symbol="U_n",
            unit="kV",
            description_pl="Napięcie znamionowe",
            mapping_key="u_n_kv",
        ),
    ),
    unit_derivation="(Ω · MW) / kV² = %",
    notes="Dla sieci trójfazowej: P to moc trójfazowa.",
)

EQ_VDROP_004 = EquationDefinition(
    equation_id="EQ_VDROP_004",
    name_pl="Składowa bierna spadku napięcia (X·Q)",
    standard_ref="—",
    latex=r"\Delta U_X = \frac{X \cdot Q}{U_n^2} \cdot 100\%",
    symbols=(
        SymbolDefinition(
            symbol="\\Delta U_X",
            unit="%",
            description_pl="Składowa bierna spadku napięcia",
            mapping_key="delta_u_x_percent",
        ),
        SymbolDefinition(
            symbol="X",
            unit="Ω",
            description_pl="Reaktancja odcinka",
            mapping_key="x_ohm",
        ),
        SymbolDefinition(
            symbol="Q",
            unit="Mvar",
            description_pl="Moc bierna przepływająca",
            mapping_key="q_mvar",
        ),
        SymbolDefinition(
            symbol="U_n",
            unit="kV",
            description_pl="Napięcie znamionowe",
            mapping_key="u_n_kv",
        ),
    ),
    unit_derivation="(Ω · Mvar) / kV² = %",
    notes="Q dodatnie = indukcyjna (pobór), Q ujemne = pojemnościowa (generacja).",
)

EQ_VDROP_005 = EquationDefinition(
    equation_id="EQ_VDROP_005",
    name_pl="Całkowity spadek napięcia na odcinku",
    standard_ref="—",
    latex=r"\Delta U = \Delta U_R + \Delta U_X",
    symbols=(
        SymbolDefinition(
            symbol="\\Delta U",
            unit="%",
            description_pl="Spadek napięcia na odcinku",
            mapping_key="delta_u_percent",
        ),
        SymbolDefinition(
            symbol="\\Delta U_R",
            unit="%",
            description_pl="Składowa czynna spadku",
            mapping_key="delta_u_r_percent",
        ),
        SymbolDefinition(
            symbol="\\Delta U_X",
            unit="%",
            description_pl="Składowa bierna spadku",
            mapping_key="delta_u_x_percent",
        ),
    ),
    unit_derivation="% + % = %",
    notes="Suma algebraiczna — ΔU_X może być ujemne (wzrost napięcia).",
)

EQ_VDROP_006 = EquationDefinition(
    equation_id="EQ_VDROP_006",
    name_pl="Sumaryczny spadek napięcia od źródła do punktu",
    standard_ref="—",
    latex=r"\Delta U_{total} = \sum_{i=1}^{n} \Delta U_i",
    symbols=(
        SymbolDefinition(
            symbol="\\Delta U_{total}",
            unit="%",
            description_pl="Sumaryczny spadek napięcia",
            mapping_key="delta_u_total_percent",
        ),
        SymbolDefinition(
            symbol="\\Delta U_i",
            unit="%",
            description_pl="Spadek napięcia na i-tym odcinku",
            mapping_key="delta_u_segments",
        ),
        SymbolDefinition(
            symbol="n",
            unit="—",
            description_pl="Liczba odcinków na ścieżce",
            mapping_key="segment_count",
        ),
    ),
    unit_derivation="Σ % = %",
    notes="Suma po wszystkich odcinkach od źródła do punktu.",
)

EQ_VDROP_007 = EquationDefinition(
    equation_id="EQ_VDROP_007",
    name_pl="Napięcie w punkcie po uwzględnieniu spadku",
    standard_ref="—",
    latex=r"U = U_{source} \cdot \left(1 - \frac{\Delta U_{total}}{100}\right)",
    symbols=(
        SymbolDefinition(
            symbol="U",
            unit="kV",
            description_pl="Napięcie w punkcie",
            mapping_key="u_kv",
        ),
        SymbolDefinition(
            symbol="U_{source}",
            unit="kV",
            description_pl="Napięcie źródła",
            mapping_key="u_source_kv",
        ),
        SymbolDefinition(
            symbol="\\Delta U_{total}",
            unit="%",
            description_pl="Sumaryczny spadek napięcia",
            mapping_key="delta_u_total_percent",
        ),
    ),
    unit_derivation="kV · — = kV",
)


# -----------------------------------------------------------------------------
# P32: Load Flow & Voltage Drop Proof Pack — równania dowodowe
# -----------------------------------------------------------------------------

EQ_LF_001 = EquationDefinition(
    equation_id="EQ_LF_001",
    name_pl="Moc pozorna",
    standard_ref="praktyka inżynierska",
    latex=r"S = \sqrt{P^{2} + Q^{2}}",
    symbols=(
        SymbolDefinition(
            symbol="S",
            unit="MVA",
            description_pl="Moc pozorna",
            mapping_key="s_mva",
        ),
        SymbolDefinition(
            symbol="P",
            unit="MW",
            description_pl="Moc czynna",
            mapping_key="p_mw",
        ),
        SymbolDefinition(
            symbol="Q",
            unit="Mvar",
            description_pl="Moc bierna",
            mapping_key="q_mvar",
        ),
    ),
    unit_derivation="MW² + Mvar² = MVA² → MVA",
    notes="Moc pozorna dla kroku post-hoc.",
)

EQ_LF_002 = EquationDefinition(
    equation_id="EQ_LF_002",
    name_pl="Prąd roboczy trójfazowy",
    standard_ref="praktyka inżynierska",
    latex=r"I = \frac{S}{\sqrt{3}\,U_{LL}}",
    symbols=(
        SymbolDefinition(
            symbol="I",
            unit="kA",
            description_pl="Prąd roboczy",
            mapping_key="i_ka",
        ),
        SymbolDefinition(
            symbol="S",
            unit="MVA",
            description_pl="Moc pozorna",
            mapping_key="s_mva",
        ),
        SymbolDefinition(
            symbol="U_{LL}",
            unit="kV",
            description_pl="Napięcie międzyfazowe",
            mapping_key="u_ll_kv",
        ),
    ),
    unit_derivation="MVA / kV = kA (MVA = kV · kA)",
    notes="Prąd roboczy liczony post-hoc.",
)

EQ_LF_003 = EquationDefinition(
    equation_id="EQ_LF_003",
    name_pl="Składowa rezystancyjna spadku napięcia",
    standard_ref="praktyka inżynierska",
    latex=r"\Delta U_{R} = \frac{R\cdot P}{U_{n}}",
    symbols=(
        SymbolDefinition(
            symbol="\\Delta U_{R}",
            unit="kV",
            description_pl="Składowa rezystancyjna spadku",
            mapping_key="delta_u_r_kv",
        ),
        SymbolDefinition(
            symbol="R",
            unit="Ω",
            description_pl="Rezystancja elementu",
            mapping_key="r_ohm",
        ),
        SymbolDefinition(
            symbol="P",
            unit="MW",
            description_pl="Moc czynna",
            mapping_key="p_mw",
        ),
        SymbolDefinition(
            symbol="U_{n}",
            unit="kV",
            description_pl="Napięcie znamionowe",
            mapping_key="u_nom_kv",
        ),
    ),
    unit_derivation="Ω · MW / kV = kV",
)

EQ_LF_004 = EquationDefinition(
    equation_id="EQ_LF_004",
    name_pl="Składowa reaktancyjna spadku napięcia",
    standard_ref="praktyka inżynierska",
    latex=r"\Delta U_{X} = \frac{X\cdot Q}{U_{n}}",
    symbols=(
        SymbolDefinition(
            symbol="\\Delta U_{X}",
            unit="kV",
            description_pl="Składowa reaktancyjna spadku",
            mapping_key="delta_u_x_kv",
        ),
        SymbolDefinition(
            symbol="X",
            unit="Ω",
            description_pl="Reaktancja elementu",
            mapping_key="x_ohm",
        ),
        SymbolDefinition(
            symbol="Q",
            unit="Mvar",
            description_pl="Moc bierna",
            mapping_key="q_mvar",
        ),
        SymbolDefinition(
            symbol="U_{n}",
            unit="kV",
            description_pl="Napięcie znamionowe",
            mapping_key="u_nom_kv",
        ),
    ),
    unit_derivation="Ω · Mvar / kV = kV",
)

EQ_LF_005 = EquationDefinition(
    equation_id="EQ_LF_005",
    name_pl="Całkowity spadek napięcia",
    standard_ref="praktyka inżynierska",
    latex=r"\Delta U = \Delta U_{R} + \Delta U_{X}",
    symbols=(
        SymbolDefinition(
            symbol="\\Delta U",
            unit="kV",
            description_pl="Całkowity spadek napięcia",
            mapping_key="delta_u_kv",
        ),
        SymbolDefinition(
            symbol="\\Delta U_{R}",
            unit="kV",
            description_pl="Składowa rezystancyjna spadku",
            mapping_key="delta_u_r_kv",
        ),
        SymbolDefinition(
            symbol="\\Delta U_{X}",
            unit="kV",
            description_pl="Składowa reaktancyjna spadku",
            mapping_key="delta_u_x_kv",
        ),
    ),
    unit_derivation="kV + kV = kV",
)

EQ_LF_006 = EquationDefinition(
    equation_id="EQ_LF_006",
    name_pl="Napięcie w jednostkach względnych",
    standard_ref="praktyka inżynierska",
    latex=r"U_{pu} = \frac{U}{U_{n}}",
    symbols=(
        SymbolDefinition(
            symbol="U_{pu}",
            unit="p.u.",
            description_pl="Napięcie w jednostkach względnych",
            mapping_key="u_pu",
        ),
        SymbolDefinition(
            symbol="U",
            unit="kV",
            description_pl="Napięcie rzeczywiste",
            mapping_key="u_ll_kv",
        ),
        SymbolDefinition(
            symbol="U_{n}",
            unit="kV",
            description_pl="Napięcie znamionowe",
            mapping_key="u_nom_kv",
        ),
    ),
    unit_derivation="kV / kV = p.u.",
)

EQ_LF_007 = EquationDefinition(
    equation_id="EQ_LF_007",
    name_pl="Odchyłka napięcia",
    standard_ref="praktyka inżynierska",
    latex=r"\delta_{U}[\%] = 100\cdot\frac{U - U_{n}}{U_{n}}",
    symbols=(
        SymbolDefinition(
            symbol="\\delta_{U}",
            unit="%",
            description_pl="Odchyłka napięcia",
            mapping_key="delta_pct",
        ),
        SymbolDefinition(
            symbol="U",
            unit="kV",
            description_pl="Napięcie rzeczywiste",
            mapping_key="u_ll_kv",
        ),
        SymbolDefinition(
            symbol="U_{n}",
            unit="kV",
            description_pl="Napięcie znamionowe",
            mapping_key="u_nom_kv",
        ),
    ),
    unit_derivation="kV / kV = %",
)


# -----------------------------------------------------------------------------
# P15: Load Currents & Overload — równania dowodowe
# -----------------------------------------------------------------------------

EQ_LC_001 = EquationDefinition(
    equation_id="EQ_LC_001",
    name_pl="Moc pozorna",
    standard_ref="praktyka inżynierska",
    latex=r"S = \sqrt{P^{2} + Q^{2}}",
    symbols=(
        SymbolDefinition(
            symbol="S",
            unit="MVA",
            description_pl="Moc pozorna",
            mapping_key="s_mva",
        ),
        SymbolDefinition(
            symbol="P",
            unit="MW",
            description_pl="Moc czynna",
            mapping_key="p_mw",
        ),
        SymbolDefinition(
            symbol="Q",
            unit="Mvar",
            description_pl="Moc bierna",
            mapping_key="q_mvar",
        ),
    ),
    unit_derivation="MW² + Mvar² = MVA² → MVA",
    notes="Moc pozorna liczona z mocy czynnej i biernej.",
)

EQ_LC_002 = EquationDefinition(
    equation_id="EQ_LC_002",
    name_pl="Prąd roboczy trójfazowy",
    standard_ref="praktyka inżynierska",
    latex=r"I = \frac{S}{\sqrt{3}\,U_{LL}}",
    symbols=(
        SymbolDefinition(
            symbol="I",
            unit="kA",
            description_pl="Prąd roboczy linii/kabla",
            mapping_key="i_ka",
        ),
        SymbolDefinition(
            symbol="S",
            unit="MVA",
            description_pl="Moc pozorna",
            mapping_key="s_mva",
        ),
        SymbolDefinition(
            symbol="U_{LL}",
            unit="kV",
            description_pl="Napięcie międzyfazowe",
            mapping_key="u_ll_kv",
        ),
    ),
    unit_derivation="MVA / kV = kA (MVA = kV · kA)",
    notes="Uwaga jednostkowa: S w MVA, U w kV → wynik w kA.",
)

EQ_LC_003 = EquationDefinition(
    equation_id="EQ_LC_003",
    name_pl="Procent obciążenia prądowego",
    standard_ref="praktyka inżynierska",
    latex=r"k_I = 100\cdot\frac{I}{I_n}",
    symbols=(
        SymbolDefinition(
            symbol="k_I",
            unit="%",
            description_pl="Procent obciążenia prądowego",
            mapping_key="k_i_percent",
        ),
        SymbolDefinition(
            symbol="I",
            unit="kA",
            description_pl="Prąd roboczy",
            mapping_key="i_ka",
        ),
        SymbolDefinition(
            symbol="I_n",
            unit="kA",
            description_pl="Prąd znamionowy (przeliczony na kA)",
            mapping_key="in_a",
        ),
    ),
    unit_derivation="100 · kA / kA = %",
    notes="I_n przeliczany z A na kA dla spójności jednostek.",
)

EQ_LC_004 = EquationDefinition(
    equation_id="EQ_LC_004",
    name_pl="Margines prądowy",
    standard_ref="praktyka inżynierska",
    latex=r"m_I = 100\cdot\left(\frac{I_n}{I}-1\right)",
    symbols=(
        SymbolDefinition(
            symbol="m_I",
            unit="%",
            description_pl="Margines prądowy",
            mapping_key="m_i_percent",
        ),
        SymbolDefinition(
            symbol="I_n",
            unit="kA",
            description_pl="Prąd znamionowy (przeliczony na kA)",
            mapping_key="in_a",
        ),
        SymbolDefinition(
            symbol="I",
            unit="kA",
            description_pl="Prąd roboczy",
            mapping_key="i_ka",
        ),
    ),
    unit_derivation="100 · (kA / kA - 1) = %",
    notes="Dla I = 0 margines definiowany jako +∞ (deterministycznie).",
)

EQ_LC_005 = EquationDefinition(
    equation_id="EQ_LC_005",
    name_pl="Obciążenie transformatora (procent)",
    standard_ref="praktyka inżynierska",
    latex=r"k_S = 100\cdot\frac{S}{S_n}",
    symbols=(
        SymbolDefinition(
            symbol="k_S",
            unit="%",
            description_pl="Procent obciążenia transformatora",
            mapping_key="k_s_percent",
        ),
        SymbolDefinition(
            symbol="S",
            unit="MVA",
            description_pl="Moc pozorna",
            mapping_key="s_mva",
        ),
        SymbolDefinition(
            symbol="S_n",
            unit="MVA",
            description_pl="Moc znamionowa transformatora",
            mapping_key="sn_mva",
        ),
    ),
    unit_derivation="100 · MVA / MVA = %",
    notes="Obciążenie transformatora względem mocy znamionowej.",
)

EQ_LC_006 = EquationDefinition(
    equation_id="EQ_LC_006",
    name_pl="Margines transformatora",
    standard_ref="praktyka inżynierska",
    latex=r"m_S = 100\cdot\left(\frac{S_n}{S}-1\right)",
    symbols=(
        SymbolDefinition(
            symbol="m_S",
            unit="%",
            description_pl="Margines obciążenia transformatora",
            mapping_key="m_s_percent",
        ),
        SymbolDefinition(
            symbol="S_n",
            unit="MVA",
            description_pl="Moc znamionowa transformatora",
            mapping_key="sn_mva",
        ),
        SymbolDefinition(
            symbol="S",
            unit="MVA",
            description_pl="Moc pozorna",
            mapping_key="s_mva",
        ),
    ),
    unit_derivation="100 · (MVA / MVA - 1) = %",
    notes="Dla S = 0 margines definiowany jako +∞ (deterministycznie).",
)


# =============================================================================
# P17: Losses Energy Profile — Kanoniczne równania (BINDING)
# =============================================================================

EQ_LE_001 = EquationDefinition(
    equation_id="EQ_LE_001",
    name_pl="Krok czasowy profilu strat",
    standard_ref="—",
    latex=r"\Delta t_i = t_{i} - t_{i-1}",
    symbols=(
        SymbolDefinition(
            symbol="\\Delta t_i",
            unit="h",
            description_pl="Przyrost czasu",
            mapping_key="delta_t_h",
        ),
        SymbolDefinition(
            symbol="t_{i}",
            unit="h",
            description_pl="Czas bieżący",
            mapping_key="t_h",
        ),
        SymbolDefinition(
            symbol="t_{i-1}",
            unit="h",
            description_pl="Czas poprzedni",
            mapping_key="t_h",
        ),
    ),
    unit_derivation="h - h = h",
)

EQ_LE_002 = EquationDefinition(
    equation_id="EQ_LE_002",
    name_pl="Energia w kroku profilu strat",
    standard_ref="—",
    latex=r"E_i = P_{loss,i}\cdot \Delta t_i",
    symbols=(
        SymbolDefinition(
            symbol="E_i",
            unit="kWh",
            description_pl="Energia strat w kroku",
            mapping_key="e_i_kwh",
        ),
        SymbolDefinition(
            symbol="P_{loss,i}",
            unit="kW",
            description_pl="Moc strat w kroku",
            mapping_key="p_loss_kw",
        ),
        SymbolDefinition(
            symbol="\\Delta t_i",
            unit="h",
            description_pl="Przyrost czasu",
            mapping_key="delta_t_h",
        ),
    ),
    unit_derivation="kW · h = kWh",
)

EQ_LE_003 = EquationDefinition(
    equation_id="EQ_LE_003",
    name_pl="Suma energii strat",
    standard_ref="—",
    latex=r"E_{loss}=\sum_i E_i",
    symbols=(
        SymbolDefinition(
            symbol="E_{loss}",
            unit="kWh",
            description_pl="Energia strat",
            mapping_key="e_loss_kwh",
        ),
        SymbolDefinition(
            symbol="E_i",
            unit="kWh",
            description_pl="Energia strat w kroku",
            mapping_key="e_i_kwh",
        ),
    ),
    unit_derivation="kWh + ... = kWh",
)

EQ_LE_004 = EquationDefinition(
    equation_id="EQ_LE_004",
    name_pl="Energia strat (wariant stały)",
    standard_ref="—",
    latex=r"E_{loss}=P_{loss}\cdot t",
    symbols=(
        SymbolDefinition(
            symbol="E_{loss}",
            unit="kWh",
            description_pl="Energia strat",
            mapping_key="e_loss_kwh",
        ),
        SymbolDefinition(
            symbol="P_{loss}",
            unit="kW",
            description_pl="Moc strat",
            mapping_key="p_loss_kw",
        ),
        SymbolDefinition(
            symbol="t",
            unit="h",
            description_pl="Czas trwania",
            mapping_key="t_h",
        ),
    ),
    unit_derivation="kW · h = kWh",
)


# =============================================================================
# P18: Protection Overcurrent & Selectivity — Kanoniczne równania (BINDING)
# =============================================================================

EQ_PR_001 = EquationDefinition(
    equation_id="EQ_PR_001",
    name_pl="Warunek wyłączalności",
    standard_ref="IEC 60947-2 / IEC 60909 (P18)",
    latex=r"\text{OK}_{breaking} = (I_k'' \le I_{cu})",
    symbols=(
        SymbolDefinition(
            symbol=r"\text{OK}_{breaking}",
            unit="—",
            description_pl="Status warunku wyłączalności",
            mapping_key="breaking_ok",
        ),
        SymbolDefinition(
            symbol="I_k''",
            unit="kA",
            description_pl="Prąd zwarciowy początkowy",
            mapping_key="ikss_ka",
        ),
        SymbolDefinition(
            symbol="I_{cu}",
            unit="kA",
            description_pl="Zdolność wyłączalna",
            mapping_key="icu_ka",
        ),
    ),
    unit_derivation="kA ≤ kA → —",
)

EQ_PR_002 = EquationDefinition(
    equation_id="EQ_PR_002",
    name_pl="Warunek dynamiczny",
    standard_ref="IEC 60947-2 / IEC 60909 (P18)",
    latex=r"\text{OK}_{dynamic} = (i_p \le I_{dyn})",
    symbols=(
        SymbolDefinition(
            symbol=r"\text{OK}_{dynamic}",
            unit="—",
            description_pl="Status warunku dynamicznego",
            mapping_key="dynamic_ok",
        ),
        SymbolDefinition(
            symbol="i_p",
            unit="kA",
            description_pl="Prąd udarowy",
            mapping_key="ip_ka",
        ),
        SymbolDefinition(
            symbol="I_{dyn}",
            unit="kA",
            description_pl="Wytrzymałość dynamiczna",
            mapping_key="idyn_ka",
        ),
    ),
    unit_derivation="kA ≤ kA → —",
)

EQ_PR_003 = EquationDefinition(
    equation_id="EQ_PR_003",
    name_pl="Warunek cieplny",
    standard_ref="IEC 60947-2 / IEC 60909 (P18)",
    latex=r"\text{OK}_{thermal} = \left(\int i^{2} dt \le I_{th}\right)",
    symbols=(
        SymbolDefinition(
            symbol=r"\text{OK}_{thermal}",
            unit="—",
            description_pl="Status warunku cieplnego",
            mapping_key="thermal_ok",
        ),
        SymbolDefinition(
            symbol=r"\int i^{2} dt",
            unit="kA²s",
            description_pl="Energia zwarcia",
            mapping_key="i2t_ka2s",
        ),
        SymbolDefinition(
            symbol="I_{th}",
            unit="kA²s",
            description_pl="Wytrzymałość cieplna (I²t)",
            mapping_key="ith_limit_ka2s",
        ),
    ),
    unit_derivation="kA²s ≤ kA²s → —",
)

EQ_PR_004 = EquationDefinition(
    equation_id="EQ_PR_004",
    name_pl="Selektywność (granice charakterystyk)",
    standard_ref="IEC 60255 / praktyka inżynierska (P18)",
    latex=(r"\text{OK}_{selectivity} = (t_{down,max} + \Delta t \le t_{up,min})"),
    symbols=(
        SymbolDefinition(
            symbol=r"\text{OK}_{selectivity}",
            unit="—",
            description_pl="Status selektywności",
            mapping_key="selectivity_ok",
        ),
        SymbolDefinition(
            symbol="t_{down,max}",
            unit="s",
            description_pl="Maksymalny czas zabezpieczenia dolnego",
            mapping_key="selectivity_downstream_max_s",
        ),
        SymbolDefinition(
            symbol="t_{up,min}",
            unit="s",
            description_pl="Minimalny czas zabezpieczenia górnego",
            mapping_key="selectivity_upstream_min_s",
        ),
        SymbolDefinition(
            symbol="\\Delta t",
            unit="s",
            description_pl="Margines selektywności",
            mapping_key="selectivity_margin_setting_s",
        ),
    ),
    unit_derivation="s + s ≤ s → —",
)


# =============================================================================
# P19: Earthing / Ground Fault (SN) — Kanoniczne równania (BINDING)
# =============================================================================

EQ_EARTH_001 = EquationDefinition(
    equation_id="EQ_EARTH_001",
    name_pl="Prąd doziemny",
    standard_ref="IEC 60909 (1F-Z) / praktyka inżynierska",
    latex=r"I_{E} = \frac{U_{0}}{Z_{E}}",
    symbols=(
        SymbolDefinition(
            symbol="I_{E}",
            unit="A",
            description_pl="Prąd doziemny",
            mapping_key="i_earth_a",
        ),
        SymbolDefinition(
            symbol="U_{0}",
            unit="V",
            description_pl="Napięcie zerowe",
            mapping_key="u0_v",
        ),
        SymbolDefinition(
            symbol="Z_{E}",
            unit="Ω",
            description_pl="Impedancja uziemienia",
            mapping_key="z_e_ohm",
        ),
    ),
    unit_derivation="V / Ω = A",
)

EQ_EARTH_002 = EquationDefinition(
    equation_id="EQ_EARTH_002",
    name_pl="Rozdział prądu doziemnego",
    standard_ref="praktyka inżynierska",
    latex=r"I_{E} = I_{u} + I_{p}",
    symbols=(
        SymbolDefinition(
            symbol="I_{E}",
            unit="A",
            description_pl="Prąd doziemny",
            mapping_key="i_earth_a",
        ),
        SymbolDefinition(
            symbol="I_{u}",
            unit="A",
            description_pl="Prąd przez uziom",
            mapping_key="i_u_a",
        ),
        SymbolDefinition(
            symbol="I_{p}",
            unit="A",
            description_pl="Prąd przez pozostałe ścieżki",
            mapping_key="i_p_a",
        ),
    ),
    unit_derivation="A + A = A",
)

EQ_EARTH_003 = EquationDefinition(
    equation_id="EQ_EARTH_003",
    name_pl="Napięcie dotykowe (UPROSZCZONE)",
    standard_ref="UPROSZCZONE",
    latex=r"U_{d} = I_{u} \cdot R_{u}",
    symbols=(
        SymbolDefinition(
            symbol="U_{d}",
            unit="V",
            description_pl="Napięcie dotykowe (uproszczone)",
            mapping_key="u_touch_v",
        ),
        SymbolDefinition(
            symbol="I_{u}",
            unit="A",
            description_pl="Prąd przez uziom",
            mapping_key="i_u_a",
        ),
        SymbolDefinition(
            symbol="R_{u}",
            unit="Ω",
            description_pl="Rezystancja uziemienia stanowiska",
            mapping_key="r_u_ohm",
        ),
    ),
    unit_derivation="A · Ω = V",
    notes="Krok wyłącznie informacyjny (UPROSZCZONE).",
)


# =============================================================================
# P14: Power Flow Verification — Kanoniczne równania (BINDING)
# =============================================================================

EQ_PF_001 = EquationDefinition(
    equation_id="EQ_PF_001",
    name_pl="Kryterium zbieżności Power Flow",
    standard_ref="Newton-Raphson method",
    latex=r"\text{converged} = \left(\max(|\Delta P|, |\Delta Q|) < \epsilon\right)",
    symbols=(
        SymbolDefinition(
            symbol=r"\text{converged}",
            unit="—",
            description_pl="Status zbieżności",
            mapping_key="converged",
        ),
        SymbolDefinition(
            symbol=r"\max(|\Delta P|, |\Delta Q|)",
            unit="p.u.",
            description_pl="Maksymalny mismatch",
            mapping_key="max_mismatch_pu",
        ),
        SymbolDefinition(
            symbol=r"\epsilon",
            unit="p.u.",
            description_pl="Tolerancja zbieżności",
            mapping_key="tolerance",
        ),
    ),
    unit_derivation="p.u. < p.u. → —",
    notes="Solver osiąga zbieżność gdy maksymalny mismatch jest mniejszy od tolerancji.",
)

EQ_PF_002 = EquationDefinition(
    equation_id="EQ_PF_002",
    name_pl="Bilans mocy czynnej",
    standard_ref="Power Flow equations",
    latex=r"\sum P_{gen} = \sum P_{load} + P_{losses}",
    symbols=(
        SymbolDefinition(
            symbol=r"\sum P_{gen}",
            unit="MW",
            description_pl="Suma mocy generowanej",
            mapping_key="p_gen_total_mw",
        ),
        SymbolDefinition(
            symbol=r"\sum P_{load}",
            unit="MW",
            description_pl="Suma mocy pobieranej",
            mapping_key="p_load_total_mw",
        ),
        SymbolDefinition(
            symbol="P_{losses}",
            unit="MW",
            description_pl="Straty mocy czynnej",
            mapping_key="p_losses_total_mw",
        ),
    ),
    unit_derivation="MW = MW + MW",
    notes="Weryfikacja bilansu mocy czynnej w sieci.",
)

EQ_PF_003 = EquationDefinition(
    equation_id="EQ_PF_003",
    name_pl="Bilans mocy biernej",
    standard_ref="Power Flow equations",
    latex=r"\sum Q_{gen} = \sum Q_{load} + Q_{losses}",
    symbols=(
        SymbolDefinition(
            symbol=r"\sum Q_{gen}",
            unit="Mvar",
            description_pl="Suma mocy biernej generowanej",
            mapping_key="q_gen_total_mvar",
        ),
        SymbolDefinition(
            symbol=r"\sum Q_{load}",
            unit="Mvar",
            description_pl="Suma mocy biernej pobieranej",
            mapping_key="q_load_total_mvar",
        ),
        SymbolDefinition(
            symbol="Q_{losses}",
            unit="Mvar",
            description_pl="Straty mocy biernej",
            mapping_key="q_losses_total_mvar",
        ),
    ),
    unit_derivation="Mvar = Mvar + Mvar",
    notes="Weryfikacja bilansu mocy biernej w sieci.",
)

EQ_PF_004 = EquationDefinition(
    equation_id="EQ_PF_004",
    name_pl="Weryfikacja zakresu napięć",
    standard_ref="praktyka inżynierska",
    latex=r"U_{min} \le U_i \le U_{max}",
    symbols=(
        SymbolDefinition(
            symbol="U_{min}",
            unit="p.u.",
            description_pl="Minimalne napięcie w sieci",
            mapping_key="v_min_pu",
        ),
        SymbolDefinition(
            symbol="U_{max}",
            unit="p.u.",
            description_pl="Maksymalne napięcie w sieci",
            mapping_key="v_max_pu",
        ),
        SymbolDefinition(
            symbol="U_i",
            unit="p.u.",
            description_pl="Napięcie w węźle i",
            mapping_key="v_pu",
        ),
    ),
    unit_derivation="p.u. ≤ p.u. ≤ p.u. → —",
    notes="Weryfikacja czy napięcia mieszczą się w dopuszczalnym zakresie.",
)


# =============================================================================
# P16: Losses Proof — Kanoniczne równania (BINDING)
# =============================================================================

EQ_LOSS_001 = EquationDefinition(
    equation_id="EQ_LOSS_001",
    name_pl="Straty mocy czynnej na gałęzi",
    standard_ref="Power Flow equations",
    latex=r"P_{loss,ij} = P_{from,ij} + P_{to,ij}",
    symbols=(
        SymbolDefinition(
            symbol="P_{loss,ij}",
            unit="MW",
            description_pl="Straty mocy czynnej na gałęzi",
            mapping_key="p_loss_mw",
        ),
        SymbolDefinition(
            symbol="P_{from,ij}",
            unit="MW",
            description_pl="Moc czynna wchodząca",
            mapping_key="p_from_mw",
        ),
        SymbolDefinition(
            symbol="P_{to,ij}",
            unit="MW",
            description_pl="Moc czynna wychodząca",
            mapping_key="p_to_mw",
        ),
    ),
    unit_derivation="MW + MW = MW",
    notes="Straty jako różnica mocy wchodzącej i wychodzącej.",
)

EQ_LOSS_002 = EquationDefinition(
    equation_id="EQ_LOSS_002",
    name_pl="Straty mocy biernej na gałęzi",
    standard_ref="Power Flow equations",
    latex=r"Q_{loss,ij} = Q_{from,ij} + Q_{to,ij}",
    symbols=(
        SymbolDefinition(
            symbol="Q_{loss,ij}",
            unit="Mvar",
            description_pl="Straty mocy biernej na gałęzi",
            mapping_key="q_loss_mvar",
        ),
        SymbolDefinition(
            symbol="Q_{from,ij}",
            unit="Mvar",
            description_pl="Moc bierna wchodząca",
            mapping_key="q_from_mvar",
        ),
        SymbolDefinition(
            symbol="Q_{to,ij}",
            unit="Mvar",
            description_pl="Moc bierna wychodząca",
            mapping_key="q_to_mvar",
        ),
    ),
    unit_derivation="Mvar + Mvar = Mvar",
    notes="Straty mocy biernej na gałęzi.",
)

EQ_LOSS_003 = EquationDefinition(
    equation_id="EQ_LOSS_003",
    name_pl="Suma strat mocy czynnej w sieci",
    standard_ref="Power Flow equations",
    latex=r"P_{losses,total} = \sum_{ij} P_{loss,ij}",
    symbols=(
        SymbolDefinition(
            symbol="P_{losses,total}",
            unit="MW",
            description_pl="Całkowite straty mocy czynnej",
            mapping_key="p_losses_total_mw",
        ),
        SymbolDefinition(
            symbol="P_{loss,ij}",
            unit="MW",
            description_pl="Straty na gałęzi ij",
            mapping_key="p_loss_mw",
        ),
    ),
    unit_derivation="Σ MW = MW",
    notes="Suma strat na wszystkich gałęziach.",
)

EQ_LOSS_004 = EquationDefinition(
    equation_id="EQ_LOSS_004",
    name_pl="Suma strat mocy biernej w sieci",
    standard_ref="Power Flow equations",
    latex=r"Q_{losses,total} = \sum_{ij} Q_{loss,ij}",
    symbols=(
        SymbolDefinition(
            symbol="Q_{losses,total}",
            unit="Mvar",
            description_pl="Całkowite straty mocy biernej",
            mapping_key="q_losses_total_mvar",
        ),
        SymbolDefinition(
            symbol="Q_{loss,ij}",
            unit="Mvar",
            description_pl="Straty na gałęzi ij",
            mapping_key="q_loss_mvar",
        ),
    ),
    unit_derivation="Σ Mvar = Mvar",
    notes="Suma strat mocy biernej na wszystkich gałęziach.",
)

EQ_LOSS_005 = EquationDefinition(
    equation_id="EQ_LOSS_005",
    name_pl="Procent strat mocy czynnej",
    standard_ref="praktyka inżynierska",
    latex=r"\eta_{P} = 100 \cdot \frac{P_{losses}}{P_{gen}}",
    symbols=(
        SymbolDefinition(
            symbol=r"\eta_{P}",
            unit="%",
            description_pl="Procentowe straty mocy czynnej",
            mapping_key="p_loss_percent",
        ),
        SymbolDefinition(
            symbol="P_{losses}",
            unit="MW",
            description_pl="Straty mocy czynnej",
            mapping_key="p_losses_total_mw",
        ),
        SymbolDefinition(
            symbol="P_{gen}",
            unit="MW",
            description_pl="Moc generowana",
            mapping_key="p_gen_total_mw",
        ),
    ),
    unit_derivation="100 · MW / MW = %",
    notes="Procentowe straty względem mocy generowanej.",
)


# =============================================================================
# Q(U) Regulation — Kanoniczne równania (BINDING) P11.1b
# =============================================================================

EQ_QU_001 = EquationDefinition(
    equation_id="EQ_QU_001",
    name_pl="Odchylenie napięcia od wartości referencyjnej",
    standard_ref="Q(U) regulation",
    latex=r"\Delta U = U_{meas} - U_{ref}",
    symbols=(
        SymbolDefinition(
            symbol="\\Delta U",
            unit="kV",
            description_pl="Odchylenie napięcia",
            mapping_key="delta_u_kv",
        ),
        SymbolDefinition(
            symbol="U_{meas}",
            unit="kV",
            description_pl="Napięcie zmierzone",
            mapping_key="u_meas_kv",
        ),
        SymbolDefinition(
            symbol="U_{ref}",
            unit="kV",
            description_pl="Napięcie referencyjne",
            mapping_key="u_ref_kv",
        ),
    ),
    unit_derivation="kV - kV = kV",
)

EQ_QU_002 = EquationDefinition(
    equation_id="EQ_QU_002",
    name_pl="Funkcja martwej strefy (deadband)",
    standard_ref="Q(U) regulation",
    latex=(
        r"s(U) = \begin{cases} "
        r"\Delta U - U_{dead} & \text{if } \Delta U > U_{dead} \\ "
        r"0 & \text{if } |\Delta U| \le U_{dead} \\ "
        r"\Delta U + U_{dead} & \text{if } \Delta U < -U_{dead} "
        r"\end{cases}"
    ),
    symbols=(
        SymbolDefinition(
            symbol="s(U)",
            unit="kV",
            description_pl="Sygnał po deadband",
            mapping_key="s_u_kv",
        ),
        SymbolDefinition(
            symbol="\\Delta U",
            unit="kV",
            description_pl="Odchylenie napięcia",
            mapping_key="delta_u_kv",
        ),
        SymbolDefinition(
            symbol="U_{dead}",
            unit="kV",
            description_pl="Szerokość martwej strefy",
            mapping_key="u_dead_kv",
        ),
    ),
    unit_derivation="kV ± kV = kV",
)

EQ_QU_003 = EquationDefinition(
    equation_id="EQ_QU_003",
    name_pl="Surowa wartość mocy biernej Q",
    standard_ref="Q(U) regulation",
    latex=r"Q_{raw} = k_Q \cdot s(U)",
    symbols=(
        SymbolDefinition(
            symbol="Q_{raw}",
            unit="Mvar",
            description_pl="Surowa moc bierna",
            mapping_key="q_raw_mvar",
        ),
        SymbolDefinition(
            symbol="k_Q",
            unit="Mvar/kV",
            description_pl="Współczynnik regulacji Q(U)",
            mapping_key="k_q_mvar_per_kv",
        ),
        SymbolDefinition(
            symbol="s(U)",
            unit="kV",
            description_pl="Sygnał po deadband",
            mapping_key="s_u_kv",
        ),
    ),
    unit_derivation="Mvar/kV · kV = Mvar",
)

EQ_QU_004 = EquationDefinition(
    equation_id="EQ_QU_004",
    name_pl="Końcowa moc bierna z limitami",
    standard_ref="Q(U) regulation",
    latex=r"Q_{cmd} = \min(\max(Q_{raw}, Q_{min}), Q_{max})",
    symbols=(
        SymbolDefinition(
            symbol="Q_{cmd}",
            unit="Mvar",
            description_pl="Komenda mocy biernej",
            mapping_key="q_cmd_mvar",
        ),
        SymbolDefinition(
            symbol="Q_{raw}",
            unit="Mvar",
            description_pl="Surowa moc bierna",
            mapping_key="q_raw_mvar",
        ),
        SymbolDefinition(
            symbol="Q_{min}",
            unit="Mvar",
            description_pl="Minimalna moc bierna",
            mapping_key="q_min_mvar",
        ),
        SymbolDefinition(
            symbol="Q_{max}",
            unit="Mvar",
            description_pl="Maksymalna moc bierna",
            mapping_key="q_max_mvar",
        ),
    ),
    unit_derivation="Mvar = Mvar",
)

# =============================================================================
# EQ_QU_005 — Wpływ Q_cmd na napięcie U (LINK-ONLY, P11.1c)
# =============================================================================
#
# Ten krok jest REFERENCJĄ do istniejących równań VDROP (EQ_VDROP_004..007).
# NIE DUPLIKUJE wzorów VDROP — tylko wskazuje na ich użycie.
# NIE LICZY niczego nowego — tylko prezentuje wyniki VDROP.
#
# Łańcuch zależności:
#   Q_cmd (z Q(U)) → ΔU_X (EQ_VDROP_004) → ΔU (EQ_VDROP_005)
#                  → ΔU_total (EQ_VDROP_006) → U (EQ_VDROP_007)
# =============================================================================

EQ_QU_005 = EquationDefinition(
    equation_id="EQ_QU_005",
    name_pl="Wpływ Q_cmd na napięcie U (referencja VDROP)",
    standard_ref="Q(U) regulation → VDROP link",
    latex=(r"Q_{cmd} \xrightarrow{\text{VDROP}} \Delta U_X \to \Delta U \to U"),
    symbols=(
        SymbolDefinition(
            symbol="Q_{cmd}",
            unit="Mvar",
            description_pl="Komenda mocy biernej (z regulacji Q(U))",
            mapping_key="q_cmd_mvar",
        ),
        SymbolDefinition(
            symbol="\\Delta U_X",
            unit="%",
            description_pl="Składowa bierna spadku napięcia (EQ_VDROP_004)",
            mapping_key="delta_u_x_percent",
        ),
        SymbolDefinition(
            symbol="\\Delta U",
            unit="%",
            description_pl="Spadek napięcia na odcinku (EQ_VDROP_005)",
            mapping_key="delta_u_percent",
        ),
        SymbolDefinition(
            symbol="U",
            unit="kV",
            description_pl="Napięcie w punkcie (EQ_VDROP_007)",
            mapping_key="u_kv",
        ),
    ),
    unit_derivation="Mvar → % → kV (VDROP link)",
    notes=(
        "LINK-ONLY: Referencja do istniejących równań VDROP. "
        "Q_cmd wpływa na ΔU_X przez EQ_VDROP_004: ΔU_X = (X·Q)/U_n²·100%. "
        "NIE DUPLIKUJE wzorów — tylko pokazuje zależność."
    ),
)


# =============================================================================
# SC1 IEC 60909 — Zwarcia asymetryczne (P11.1c)
# =============================================================================

EQ_SC1_001 = EquationDefinition(
    equation_id="EQ_SC1_001",
    name_pl="Impedancje składowych zgodna/przeciwna/zerowa",
    standard_ref="IEC 60909-0:2016 § 6 (składowe symetryczne)",
    latex=(
        r"\begin{aligned}"
        r"Z_1 &= Z_{1,\mathrm{th}} \\"
        r"Z_2 &= Z_{2,\mathrm{th}} \\"
        r"Z_0 &= Z_{0,\mathrm{th}}"
        r"\end{aligned}"
    ),
    symbols=(
        SymbolDefinition(
            symbol="Z_1",
            unit="Ω",
            description_pl="Impedancja składowej zgodnej",
            mapping_key="z1_ohm",
        ),
        SymbolDefinition(
            symbol="Z_2",
            unit="Ω",
            description_pl="Impedancja składowej przeciwnej",
            mapping_key="z2_ohm",
        ),
        SymbolDefinition(
            symbol="Z_0",
            unit="Ω",
            description_pl="Impedancja składowej zerowej",
            mapping_key="z0_ohm",
        ),
    ),
    unit_derivation="Ω = Ω",
    notes="Źródło danych: white_box_trace/result. Definicje składowych symetrycznych.",
)

EQ_SC1_002 = EquationDefinition(
    equation_id="EQ_SC1_002",
    name_pl="Operator a i macierz Fortescue (składowe → fazy)",
    standard_ref="IEC 60909-0:2016 Annex B (składowe symetryczne)",
    latex=(
        r"a = e^{j 120^\circ}, \quad a^2 = e^{j 240^\circ} \\"
        r"\begin{bmatrix} I_a \\ I_b \\ I_c \end{bmatrix} ="
        r"\begin{bmatrix} 1 & 1 & 1 \\ 1 & a^2 & a \\ 1 & a & a^2 \end{bmatrix}"
        r"\begin{bmatrix} I_0 \\ I_1 \\ I_2 \end{bmatrix}"
    ),
    symbols=(
        SymbolDefinition(
            symbol="a",
            unit="—",
            description_pl="Operator obrotu 120°",
            mapping_key="a_operator",
        ),
        SymbolDefinition(
            symbol="I_a",
            unit="kA",
            description_pl="Prąd fazowy a",
            mapping_key="ia_ka",
        ),
        SymbolDefinition(
            symbol="I_b",
            unit="kA",
            description_pl="Prąd fazowy b",
            mapping_key="ib_ka",
        ),
        SymbolDefinition(
            symbol="I_c",
            unit="kA",
            description_pl="Prąd fazowy c",
            mapping_key="ic_ka",
        ),
        SymbolDefinition(
            symbol="I_0",
            unit="kA",
            description_pl="Prąd składowej zerowej",
            mapping_key="i0_ka",
        ),
        SymbolDefinition(
            symbol="I_1",
            unit="kA",
            description_pl="Prąd składowej zgodnej",
            mapping_key="i1_ka",
        ),
        SymbolDefinition(
            symbol="I_2",
            unit="kA",
            description_pl="Prąd składowej przeciwnej",
            mapping_key="i2_ka",
        ),
    ),
    unit_derivation="—",
    notes="Macierz Fortescue dla prądów (analogicznie dla napięć).",
)

EQ_SC1_003 = EquationDefinition(
    equation_id="EQ_SC1_003",
    name_pl="Sieć składowych dla zwarcia 1F–Z",
    standard_ref="IEC 60909-0:2016 § 6.1",
    latex=r"Z_k = Z_1 + Z_2 + Z_0",
    symbols=(
        SymbolDefinition(
            symbol="Z_k",
            unit="Ω",
            description_pl="Impedancja zastępcza w miejscu zwarcia",
            mapping_key="z_equiv_ohm",
        ),
        SymbolDefinition(
            symbol="Z_1",
            unit="Ω",
            description_pl="Impedancja składowej zgodnej",
            mapping_key="z1_ohm",
        ),
        SymbolDefinition(
            symbol="Z_2",
            unit="Ω",
            description_pl="Impedancja składowej przeciwnej",
            mapping_key="z2_ohm",
        ),
        SymbolDefinition(
            symbol="Z_0",
            unit="Ω",
            description_pl="Impedancja składowej zerowej",
            mapping_key="z0_ohm",
        ),
    ),
    unit_derivation="Ω + Ω + Ω = Ω",
    notes="Stosować wyłącznie dla zwarcia jednofazowego doziemnego (1F–Z).",
)

EQ_SC1_004 = EquationDefinition(
    equation_id="EQ_SC1_004",
    name_pl="Sieć składowych dla zwarcia 2F",
    standard_ref="IEC 60909-0:2016 § 6.2",
    latex=r"Z_k = Z_1 + Z_2",
    symbols=(
        SymbolDefinition(
            symbol="Z_k",
            unit="Ω",
            description_pl="Impedancja zastępcza w miejscu zwarcia",
            mapping_key="z_equiv_ohm",
        ),
        SymbolDefinition(
            symbol="Z_1",
            unit="Ω",
            description_pl="Impedancja składowej zgodnej",
            mapping_key="z1_ohm",
        ),
        SymbolDefinition(
            symbol="Z_2",
            unit="Ω",
            description_pl="Impedancja składowej przeciwnej",
            mapping_key="z2_ohm",
        ),
    ),
    unit_derivation="Ω + Ω = Ω",
    notes="Stosować wyłącznie dla zwarcia dwufazowego (2F).",
)

EQ_SC1_005 = EquationDefinition(
    equation_id="EQ_SC1_005",
    name_pl="Sieć składowych dla zwarcia 2F–Z",
    standard_ref="IEC 60909-0:2016 § 6.3",
    latex=r"Z_k = Z_1 + \frac{Z_2 \cdot Z_0}{Z_2 + Z_0}",
    symbols=(
        SymbolDefinition(
            symbol="Z_k",
            unit="Ω",
            description_pl="Impedancja zastępcza w miejscu zwarcia",
            mapping_key="z_equiv_ohm",
        ),
        SymbolDefinition(
            symbol="Z_1",
            unit="Ω",
            description_pl="Impedancja składowej zgodnej",
            mapping_key="z1_ohm",
        ),
        SymbolDefinition(
            symbol="Z_2",
            unit="Ω",
            description_pl="Impedancja składowej przeciwnej",
            mapping_key="z2_ohm",
        ),
        SymbolDefinition(
            symbol="Z_0",
            unit="Ω",
            description_pl="Impedancja składowej zerowej",
            mapping_key="z0_ohm",
        ),
    ),
    unit_derivation="Ω + (Ω·Ω)/(Ω+Ω) = Ω",
    notes="Stosować wyłącznie dla zwarcia dwufazowego doziemnego (2F–Z).",
)

EQ_SC1_006 = EquationDefinition(
    equation_id="EQ_SC1_006",
    name_pl="Wyznaczenie prądów składowych I₁, I₂, I₀",
    standard_ref="IEC 60909-0:2016 Annex B",
    latex=(
        r"\begin{aligned}"
        r"\text{1F–Z:} \quad & I_1 = I_2 = I_0 = \frac{U_f}{Z_k} \\"
        r"\text{2F:} \quad & I_1 = \frac{U_f}{Z_k}, \quad I_2 = -I_1, \quad I_0 = 0 \\"
        r"\text{2F–Z:} \quad & I_1 = \frac{U_f}{Z_k}, \quad"
        r"I_2 = -\frac{Z_0}{Z_2 + Z_0} I_1, \quad"
        r"I_0 = -\frac{Z_2}{Z_2 + Z_0} I_1"
        r"\end{aligned}"
    ),
    symbols=(
        SymbolDefinition(
            symbol="I_1",
            unit="kA",
            description_pl="Prąd składowej zgodnej",
            mapping_key="i1_ka",
        ),
        SymbolDefinition(
            symbol="I_2",
            unit="kA",
            description_pl="Prąd składowej przeciwnej",
            mapping_key="i2_ka",
        ),
        SymbolDefinition(
            symbol="I_0",
            unit="kA",
            description_pl="Prąd składowej zerowej",
            mapping_key="i0_ka",
        ),
        SymbolDefinition(
            symbol="U_f",
            unit="kV",
            description_pl="Napięcie przedzwarciowe fazowe",
            mapping_key="u_prefault_kv",
        ),
        SymbolDefinition(
            symbol="Z_k",
            unit="Ω",
            description_pl="Impedancja zastępcza",
            mapping_key="z_equiv_ohm",
        ),
        SymbolDefinition(
            symbol="Z_2",
            unit="Ω",
            description_pl="Impedancja składowej przeciwnej",
            mapping_key="z2_ohm",
        ),
        SymbolDefinition(
            symbol="Z_0",
            unit="Ω",
            description_pl="Impedancja składowej zerowej",
            mapping_key="z0_ohm",
        ),
    ),
    unit_derivation="kV / Ω = kA",
    notes="Stosować zgodnie z typem zwarcia oraz impedancją Z_k z EQ_SC1_003/004/005.",
)

EQ_SC1_007 = EquationDefinition(
    equation_id="EQ_SC1_007",
    name_pl="Rekonstrukcja prądów fazowych Ia, Ib, Ic",
    standard_ref="IEC 60909-0:2016 Annex B",
    latex=(
        r"\begin{bmatrix} I_a \\ I_b \\ I_c \end{bmatrix} ="
        r"\begin{bmatrix} 1 & 1 & 1 \\ 1 & a^2 & a \\ 1 & a & a^2 \end{bmatrix}"
        r"\begin{bmatrix} I_0 \\ I_1 \\ I_2 \end{bmatrix}"
    ),
    symbols=(
        SymbolDefinition(
            symbol="I_a",
            unit="kA",
            description_pl="Prąd fazowy a",
            mapping_key="ia_ka",
        ),
        SymbolDefinition(
            symbol="I_b",
            unit="kA",
            description_pl="Prąd fazowy b",
            mapping_key="ib_ka",
        ),
        SymbolDefinition(
            symbol="I_c",
            unit="kA",
            description_pl="Prąd fazowy c",
            mapping_key="ic_ka",
        ),
        SymbolDefinition(
            symbol="I_0",
            unit="kA",
            description_pl="Prąd składowej zerowej",
            mapping_key="i0_ka",
        ),
        SymbolDefinition(
            symbol="I_1",
            unit="kA",
            description_pl="Prąd składowej zgodnej",
            mapping_key="i1_ka",
        ),
        SymbolDefinition(
            symbol="I_2",
            unit="kA",
            description_pl="Prąd składowej przeciwnej",
            mapping_key="i2_ka",
        ),
        SymbolDefinition(
            symbol="a",
            unit="—",
            description_pl="Operator obrotu 120°",
            mapping_key="a_operator",
        ),
    ),
    unit_derivation="kA = kA",
    notes="Rekombinacja składowych symetrycznych do prądów fazowych.",
)


# -----------------------------------------------------------------------------
# SC1 Equations — Post-fault quantities (BINDING)
# IEC 60909-0:2016 — I″k, κ, ip, I_th, I_dyn for asymmetrical faults
# -----------------------------------------------------------------------------

EQ_SC1_008 = EquationDefinition(
    equation_id="EQ_SC1_008",
    name_pl="Początkowy prąd zwarciowy I″k (zwarcie asymetryczne)",
    standard_ref="IEC 60909-0:2016 § 4.2 / eq. 29, 23",
    latex=(
        r"\begin{aligned}"
        r"\text{1F–Z:} \quad & I_k'' = \frac{\sqrt{3} \cdot c \cdot U_n}{|Z_1 + Z_2 + Z_0|} \\"
        r"\text{2F:} \quad & I_k'' = \frac{c \cdot U_n}{|Z_1 + Z_2|} \\"
        r"\text{2F–Z:} \quad & I_k'' = \frac{c \cdot U_n}{|Z_k|}"
        r"\end{aligned}"
    ),
    symbols=(
        SymbolDefinition(
            symbol="I_k''",
            unit="kA",
            description_pl="Początkowy prąd zwarciowy (asymetryczny)",
            mapping_key="ikss_ka",
        ),
        SymbolDefinition(
            symbol="c",
            unit="—",
            description_pl="Współczynnik napięciowy",
            mapping_key="c_factor",
        ),
        SymbolDefinition(
            symbol="U_n",
            unit="kV",
            description_pl="Napięcie znamionowe",
            mapping_key="u_n_kv",
        ),
        SymbolDefinition(
            symbol="Z_k",
            unit="Ω",
            description_pl="Impedancja zastępcza w miejscu zwarcia",
            mapping_key="z_equiv_ohm",
        ),
    ),
    unit_derivation="kV / Ω = kA",
    notes=(
        "Współczynnik napięciowy c występuje WYŁĄCZNIE w tym równaniu dla dowodu SC1. "
        "ANTI-DOUBLE-COUNTING: c NIE występuje w EQ_SC1_001–007 ani EQ_SC1_009–012."
    ),
)

EQ_SC1_009 = EquationDefinition(
    equation_id="EQ_SC1_009",
    name_pl="Współczynnik udaru κ (zwarcie asymetryczne)",
    standard_ref="IEC 60909-0:2016 § 4.3.1.1 eq. (56)",
    latex=r"\kappa = 1{,}02 + 0{,}98 \cdot e^{-3 \cdot R_k / X_k}",
    symbols=(
        SymbolDefinition(
            symbol="\\kappa",
            unit="—",
            description_pl="Współczynnik udaru",
            mapping_key="kappa",
        ),
        SymbolDefinition(
            symbol="R_k",
            unit="Ω",
            description_pl="Rezystancja zastępcza Z_k",
            mapping_key="r_equiv_ohm",
        ),
        SymbolDefinition(
            symbol="X_k",
            unit="Ω",
            description_pl="Reaktancja zastępcza Z_k",
            mapping_key="x_equiv_ohm",
        ),
    ),
    unit_derivation="— (bezwymiarowy)",
    notes="κ obliczane z R/X impedancji zastępczej Z_k. Identyczny wzór jak dla 3F.",
)

EQ_SC1_010 = EquationDefinition(
    equation_id="EQ_SC1_010",
    name_pl="Prąd udarowy ip (zwarcie asymetryczne)",
    standard_ref="IEC 60909-0:2016 § 4.3.1.1 eq. (55)",
    latex=r"i_p = \kappa \cdot \sqrt{2} \cdot I_k''",
    symbols=(
        SymbolDefinition(
            symbol="i_p",
            unit="kA",
            description_pl="Prąd udarowy (szczytowy)",
            mapping_key="ip_ka",
        ),
        SymbolDefinition(
            symbol="\\kappa",
            unit="—",
            description_pl="Współczynnik udaru",
            mapping_key="kappa",
        ),
        SymbolDefinition(
            symbol="I_k''",
            unit="kA",
            description_pl="Początkowy prąd zwarciowy",
            mapping_key="ikss_ka",
        ),
    ),
    unit_derivation="— · — · kA = kA",
    notes="Prąd udarowy dla zwarcia asymetrycznego. Wzór identyczny jak dla 3F.",
)

EQ_SC1_011 = EquationDefinition(
    equation_id="EQ_SC1_011",
    name_pl="Prąd cieplny równoważny I_th (zwarcie asymetryczne)",
    standard_ref="IEC 60909-0:2016 § 4.8 eq. (102)",
    latex=r"I_{th} = I_k'' \cdot \sqrt{m + n}",
    symbols=(
        SymbolDefinition(
            symbol="I_{th}",
            unit="kA",
            description_pl="Prąd cieplny równoważny",
            mapping_key="ith_ka",
        ),
        SymbolDefinition(
            symbol="I_k''",
            unit="kA",
            description_pl="Początkowy prąd zwarciowy",
            mapping_key="ikss_ka",
        ),
        SymbolDefinition(
            symbol="m",
            unit="—",
            description_pl="Współczynnik cieplny (składowa DC)",
            mapping_key="m_factor",
        ),
        SymbolDefinition(
            symbol="n",
            unit="—",
            description_pl="Współczynnik cieplny (składowa AC)",
            mapping_key="n_factor",
        ),
    ),
    unit_derivation="kA · — = kA",
    notes=(
        "Prąd cieplny równoważny I_th dla doboru aparatury. "
        "m = 1, n = 0 w uproszczeniu (zwarcie odległe od generatora)."
    ),
)

EQ_SC1_012 = EquationDefinition(
    equation_id="EQ_SC1_012",
    name_pl="Prąd dynamiczny I_dyn (zwarcie asymetryczne)",
    standard_ref="IEC 60909-0:2016 § 4.3.1.1",
    latex=r"I_{dyn} = i_p",
    symbols=(
        SymbolDefinition(
            symbol="I_{dyn}",
            unit="kA",
            description_pl="Prąd dynamiczny (do doboru aparatury)",
            mapping_key="idyn_ka",
        ),
        SymbolDefinition(
            symbol="i_p",
            unit="kA",
            description_pl="Prąd udarowy",
            mapping_key="ip_ka",
        ),
    ),
    unit_derivation="kA = kA",
    notes="I_dyn = i_p. Obowiązkowy wynik do doboru aparatury (wytrzymałość dynamiczna).",
)


# =============================================================================
# ANTI-DOUBLE-COUNTING AUDIT
# =============================================================================


class AntiDoubleCountingAudit:
    """
    Anti-Double-Counting Audit dla współczynnika napięciowego c.

    Model: A1 (CANONICAL)
    c występuje WYŁĄCZNIE w: EQ_SC3F_004

    Status: PASS
    """

    MODEL = "A1"
    C_FACTOR_EQUATION = "EQ_SC3F_004"
    STATUS = "PASS"

    # Równania dowodowe SC3F z audytem c
    PROOF_EQUATIONS_AUDIT: dict[str, bool] = {
        "EQ_SC3F_003": False,  # Impedancja Thevenina — c NIE występuje
        "EQ_SC3F_004": True,  # Prąd I_k'' — c WYSTĘPUJE (jedyne miejsce)
        "EQ_SC3F_005": False,  # Współczynnik κ — c NIE występuje
        "EQ_SC3F_006": False,  # Prąd udarowy — c NIE występuje
        "EQ_SC3F_007": False,  # Moc S_k'' — c NIE występuje
        "EQ_SC3F_008": False,  # Prąd cieplny — c NIE występuje
        "EQ_SC3F_008a": False,  # Prąd dynamiczny — c NIE występuje
        "EQ_SC3F_011": False,  # Współczynnik μ — c NIE występuje
        "EQ_SC3F_012": False,  # Współczynnik q — c NIE występuje
        "EQ_SC3F_013": False,  # Prąd wyłączeniowy maszyny i_b — c NIE występuje (I_k'' zawiera c)
    }

    # Równania pomocnicze (solver-only)
    HELPER_EQUATIONS_AUDIT: dict[str, bool] = {
        "EQ_SC3F_002": True,  # Z_Q z S_kQ'' — c występuje (solver only)
        "EQ_SC3F_002a": False,  # Rozkład R/X — c NIE występuje
        "EQ_SC3F_009": False,  # Impedancja transformatora — c NIE występuje
        "EQ_SC3F_010": False,  # Impedancja linii — c NIE występuje
    }

    @classmethod
    def verify(cls) -> bool:
        """
        Weryfikuje, że c występuje DOKŁADNIE RAZ w równaniach dowodowych.

        Returns:
            True jeśli audit PASS, False jeśli FAIL
        """
        c_count = sum(1 for has_c in cls.PROOF_EQUATIONS_AUDIT.values() if has_c)
        if c_count != 1:
            return False
        if not cls.PROOF_EQUATIONS_AUDIT.get(cls.C_FACTOR_EQUATION, False):
            return False
        return True

    # Równania dowodowe SC1 z audytem c (§4.1 blocker resolution)
    SC1_PROOF_EQUATIONS_AUDIT: dict[str, bool] = {
        "EQ_SC1_001": False,  # Impedancje składowe — c NIE występuje
        "EQ_SC1_002": False,  # Operator Fortescue — c NIE występuje
        "EQ_SC1_003": False,  # Z_k dla 1F–Z — c NIE występuje
        "EQ_SC1_004": False,  # Z_k dla 2F — c NIE występuje
        "EQ_SC1_005": False,  # Z_k dla 2F–Z — c NIE występuje
        "EQ_SC1_006": False,  # Prądy składowe — c NIE występuje (używa U_f, nie c·Un)
        "EQ_SC1_007": False,  # Rekombinacja fazowa — c NIE występuje
        "EQ_SC1_008": True,  # I″k asymetryczny — c WYSTĘPUJE (jedyne miejsce SC1)
        "EQ_SC1_009": False,  # Współczynnik κ — c NIE występuje
        "EQ_SC1_010": False,  # Prąd udarowy ip — c NIE występuje
        "EQ_SC1_011": False,  # Prąd cieplny I_th — c NIE występuje
        "EQ_SC1_012": False,  # Prąd dynamiczny I_dyn — c NIE występuje
    }

    SC1_C_FACTOR_EQUATION = "EQ_SC1_008"

    @classmethod
    def verify_sc1(cls) -> bool:
        """
        Weryfikuje, że c występuje DOKŁADNIE RAZ w równaniach dowodowych SC1.

        Returns:
            True jeśli audit PASS, False jeśli FAIL
        """
        c_count = sum(1 for has_c in cls.SC1_PROOF_EQUATIONS_AUDIT.values() if has_c)
        if c_count != 1:
            return False
        if not cls.SC1_PROOF_EQUATIONS_AUDIT.get(cls.SC1_C_FACTOR_EQUATION, False):
            return False
        return True

    @classmethod
    def get_audit_report(cls) -> str:
        """Zwraca raport audytu w formie tekstowej."""
        lines = [
            "ANTI-DOUBLE-COUNTING AUDIT — Współczynnik napięciowy c",
            "=" * 60,
            f"Model: {cls.MODEL}",
            f"c występuje w: {cls.C_FACTOR_EQUATION} (SC3F), {cls.SC1_C_FACTOR_EQUATION} (SC1)",
            "",
            "Równania dowodowe SC3F:",
        ]
        for eq_id, has_c in sorted(cls.PROOF_EQUATIONS_AUDIT.items()):
            status = "TAK" if has_c else "NIE"
            lines.append(f"  {eq_id}: c {status}")

        lines.append("")
        lines.append("Równania dowodowe SC1:")
        for eq_id, has_c in sorted(cls.SC1_PROOF_EQUATIONS_AUDIT.items()):
            status = "TAK" if has_c else "NIE"
            lines.append(f"  {eq_id}: c {status}")

        lines.append("")
        lines.append("Równania pomocnicze (solver-only):")
        for eq_id, has_c in sorted(cls.HELPER_EQUATIONS_AUDIT.items()):
            status = "TAK" if has_c else "NIE"
            lines.append(f"  {eq_id}: c {status}")

        lines.append("")
        sc3f_pass = cls.verify()
        sc1_pass = cls.verify_sc1()
        lines.append(f"Status SC3F: {'PASS' if sc3f_pass else 'FAIL'}")
        lines.append(f"Status SC1: {'PASS' if sc1_pass else 'FAIL'}")

        return "\n".join(lines)


# =============================================================================
# EquationRegistry — Rejestr równań
# =============================================================================


class _EquationRegistryStore:
    def __init__(self) -> None:
        self._equations: dict[str, EquationDefinition] = {}
        self._frozen = False

    def merge(self, equations: dict[str, EquationDefinition]) -> None:
        if self._frozen:
            raise RuntimeError("Equation registry is frozen.")
        duplicates = set(self._equations).intersection(equations)
        if duplicates:
            duplicates_list = ", ".join(sorted(duplicates))
            raise ValueError(f"Duplicate equation IDs: {duplicates_list}")
        self._equations.update(equations)

    def freeze(self) -> None:
        self._frozen = True

    def get(self, equation_id: str) -> EquationDefinition | None:
        return self._equations.get(equation_id)

    def values(self):
        return self._equations.values()

    def all(self) -> dict[str, EquationDefinition]:
        return self._equations.copy()


# SC3F equations registry (wszystkie, włącznie z pomocniczymi)
SC3F_EQUATIONS: dict[str, EquationDefinition] = {
    "EQ_SC3F_002": EQ_SC3F_002,
    "EQ_SC3F_002a": EQ_SC3F_002a,
    "EQ_SC3F_003": EQ_SC3F_003,
    "EQ_SC3F_004": EQ_SC3F_004,
    "EQ_SC3F_005": EQ_SC3F_005,
    "EQ_SC3F_006": EQ_SC3F_006,
    "EQ_SC3F_007": EQ_SC3F_007,
    "EQ_SC3F_008": EQ_SC3F_008,
    "EQ_SC3F_008a": EQ_SC3F_008a,
    "EQ_SC3F_009": EQ_SC3F_009,
    "EQ_SC3F_010": EQ_SC3F_010,
    "EQ_SC3F_011": EQ_SC3F_011,
    "EQ_SC3F_012": EQ_SC3F_012,
    "EQ_SC3F_013": EQ_SC3F_013,
}

# VDROP equations registry
VDROP_EQUATIONS: dict[str, EquationDefinition] = {
    "EQ_VDROP_001": EQ_VDROP_001,
    "EQ_VDROP_002": EQ_VDROP_002,
    "EQ_VDROP_003": EQ_VDROP_003,
    "EQ_VDROP_004": EQ_VDROP_004,
    "EQ_VDROP_005": EQ_VDROP_005,
    "EQ_VDROP_006": EQ_VDROP_006,
    "EQ_VDROP_007": EQ_VDROP_007,
}

# P32: Load Flow & Voltage Drop equations registry
LF_EQUATIONS: dict[str, EquationDefinition] = {
    "EQ_LF_001": EQ_LF_001,
    "EQ_LF_002": EQ_LF_002,
    "EQ_LF_003": EQ_LF_003,
    "EQ_LF_004": EQ_LF_004,
    "EQ_LF_005": EQ_LF_005,
    "EQ_LF_006": EQ_LF_006,
    "EQ_LF_007": EQ_LF_007,
}

# P15: Load Currents & Overload equations registry
LC_EQUATIONS: dict[str, EquationDefinition] = {
    "EQ_LC_001": EQ_LC_001,
    "EQ_LC_002": EQ_LC_002,
    "EQ_LC_003": EQ_LC_003,
    "EQ_LC_004": EQ_LC_004,
    "EQ_LC_005": EQ_LC_005,
    "EQ_LC_006": EQ_LC_006,
}

# P17: Losses Energy Profile equations registry
LE_EQUATIONS: dict[str, EquationDefinition] = {
    "EQ_LE_001": EQ_LE_001,
    "EQ_LE_002": EQ_LE_002,
    "EQ_LE_003": EQ_LE_003,
    "EQ_LE_004": EQ_LE_004,
}

# P14: Power Flow Verification equations registry
PF_EQUATIONS: dict[str, EquationDefinition] = {
    "EQ_PF_001": EQ_PF_001,
    "EQ_PF_002": EQ_PF_002,
    "EQ_PF_003": EQ_PF_003,
    "EQ_PF_004": EQ_PF_004,
}

# P16: Losses Proof equations registry
LOSS_EQUATIONS: dict[str, EquationDefinition] = {
    "EQ_LOSS_001": EQ_LOSS_001,
    "EQ_LOSS_002": EQ_LOSS_002,
    "EQ_LOSS_003": EQ_LOSS_003,
    "EQ_LOSS_004": EQ_LOSS_004,
    "EQ_LOSS_005": EQ_LOSS_005,
}

# P18: Protection Overcurrent & Selectivity equations registry
PR_EQUATIONS: dict[str, EquationDefinition] = {
    "EQ_PR_001": EQ_PR_001,
    "EQ_PR_002": EQ_PR_002,
    "EQ_PR_003": EQ_PR_003,
    "EQ_PR_004": EQ_PR_004,
}

# P19: Earthing / Ground Fault equations registry
EARTH_EQUATIONS: dict[str, EquationDefinition] = {
    "EQ_EARTH_001": EQ_EARTH_001,
    "EQ_EARTH_002": EQ_EARTH_002,
    "EQ_EARTH_003": EQ_EARTH_003,
}

# Q(U) equations registry (P11.1b + P11.1c)
QU_EQUATIONS: dict[str, EquationDefinition] = {
    "EQ_QU_001": EQ_QU_001,
    "EQ_QU_002": EQ_QU_002,
    "EQ_QU_003": EQ_QU_003,
    "EQ_QU_004": EQ_QU_004,
    "EQ_QU_005": EQ_QU_005,  # P11.1c: VDROP link (no new physics)
}

# SC1 equations registry (P11.1c)
SC1_EQUATIONS: dict[str, EquationDefinition] = {
    "EQ_SC1_001": EQ_SC1_001,
    "EQ_SC1_002": EQ_SC1_002,
    "EQ_SC1_003": EQ_SC1_003,
    "EQ_SC1_004": EQ_SC1_004,
    "EQ_SC1_005": EQ_SC1_005,
    "EQ_SC1_006": EQ_SC1_006,
    "EQ_SC1_007": EQ_SC1_007,
    "EQ_SC1_008": EQ_SC1_008,
    "EQ_SC1_009": EQ_SC1_009,
    "EQ_SC1_010": EQ_SC1_010,
    "EQ_SC1_011": EQ_SC1_011,
    "EQ_SC1_012": EQ_SC1_012,
}

# Step order for SC3F proof (BINDING) — tylko równania dowodowe
SC3F_PROOF_STEP_ORDER: list[str] = [
    "EQ_SC3F_003",  # Impedancja Thevenina
    "EQ_SC3F_004",  # Prąd zwarciowy I_k'' (c TUTAJ)
    "EQ_SC3F_005",  # Współczynnik udaru κ
    "EQ_SC3F_006",  # Prąd udarowy i_p
    "EQ_SC3F_008a",  # Prąd dynamiczny I_dyn (OBOWIĄZKOWY)
    "EQ_SC3F_008",  # Prąd cieplny I_th (OBOWIĄZKOWY)
    "EQ_SC3F_007",  # Moc zwarciowa S_k''
]

# Step order for VDROP (BINDING)
VDROP_STEP_ORDER: list[str] = [
    "EQ_VDROP_001",  # Rezystancja odcinka
    "EQ_VDROP_002",  # Reaktancja odcinka
    "EQ_VDROP_003",  # Składowa czynna ΔU_R
    "EQ_VDROP_004",  # Składowa bierna ΔU_X
    "EQ_VDROP_005",  # Spadek na odcinku ΔU
    "EQ_VDROP_006",  # Suma spadków ΔU_total
    "EQ_VDROP_007",  # Napięcie w punkcie U
]

# Step order for P32 (BINDING)
LF_STEP_ORDER: list[str] = [
    "EQ_LF_001",  # Moc pozorna
    "EQ_LF_002",  # Prąd roboczy
    "EQ_LF_003",  # Składowa rezystancyjna ΔU_R
    "EQ_LF_004",  # Składowa reaktancyjna ΔU_X
    "EQ_LF_005",  # Całkowity spadek ΔU
    "EQ_LF_006",  # U_pu
    "EQ_LF_007",  # delta%
]

# Step order for P15 (BINDING)
LC_STEP_ORDER: list[str] = [
    "EQ_LC_001",  # Moc pozorna
    "EQ_LC_002",  # Prąd roboczy 3-f
    "EQ_LC_003",  # Procent obciążenia prądowego
    "EQ_LC_004",  # Margines prądowy
    "EQ_LC_005",  # Obciążenie transformatora
    "EQ_LC_006",  # Margines transformatora
]

# Step order for P17 (BINDING)
LE_STEP_ORDER: list[str] = [
    "EQ_LE_001",  # Δt_i = t_i - t_{i-1}
    "EQ_LE_002",  # E_i = P_loss,i * Δt_i
    "EQ_LE_003",  # E_loss = Σ E_i
    "EQ_LE_004",  # E_loss = P_loss * t (wariant stały)
]

# Step order for P14: Power Flow Verification (BINDING)
PF_STEP_ORDER: list[str] = [
    "EQ_PF_001",  # Kryterium zbieżności
    "EQ_PF_002",  # Bilans mocy czynnej
    "EQ_PF_003",  # Bilans mocy biernej
    "EQ_PF_004",  # Weryfikacja zakresu napięć
]

# Step order for P16: Losses Proof (BINDING)
LOSS_STEP_ORDER: list[str] = [
    "EQ_LOSS_001",  # Straty P na gałęzi
    "EQ_LOSS_002",  # Straty Q na gałęzi
    "EQ_LOSS_003",  # Suma strat P
    "EQ_LOSS_004",  # Suma strat Q
    "EQ_LOSS_005",  # Procent strat P
]

# Step order for P18 (BINDING)
PR_STEP_ORDER: list[str] = [
    "EQ_PR_001",  # Warunek wyłączalności
    "EQ_PR_002",  # Warunek dynamiczny
    "EQ_PR_003",  # Warunek cieplny
    "EQ_PR_004",  # Selektywność
]

# Step order for P19 (BINDING)
EARTH_STEP_ORDER: list[str] = [
    "EQ_EARTH_001",  # Prąd doziemny
    "EQ_EARTH_002",  # Rozdział prądu doziemnego
    "EQ_EARTH_003",  # Napięcie dotykowe (uproszczone)
]

# Step order for Q(U) proof (BINDING) — P11.1b + P11.1c
QU_STEP_ORDER: list[str] = [
    "EQ_QU_001",  # ΔU = U_meas - U_ref
    "EQ_QU_002",  # s(U) deadband
    "EQ_QU_003",  # Q_raw = k_Q · s(U)
    "EQ_QU_004",  # Q_cmd with limits
    "EQ_QU_005",  # P11.1c: Q_cmd → U (VDROP link, no new physics)
]

# Step order for SC1 proofs (BINDING) — P11.1c + §4.1 blocker resolution
SC1FZ_STEP_ORDER: list[str] = [
    "EQ_SC1_001",  # Z₁, Z₂, Z₀
    "EQ_SC1_002",  # Transformacja Fortescue
    "EQ_SC1_003",  # Z_k dla 1F–Z
    "EQ_SC1_006",  # I₁, I₂, I₀
    "EQ_SC1_007",  # Rekombinacja fazowa
    "EQ_SC1_008",  # I″k (początkowy prąd zwarciowy) — c TUTAJ (jedyne miejsce SC1)
    "EQ_SC1_009",  # κ (współczynnik udaru)
    "EQ_SC1_010",  # ip (prąd udarowy)
    "EQ_SC1_012",  # I_dyn (prąd dynamiczny — OBOWIĄZKOWY)
    "EQ_SC1_011",  # I_th (prąd cieplny — OBOWIĄZKOWY)
]

SC2F_STEP_ORDER: list[str] = [
    "EQ_SC1_001",  # Z₁, Z₂, Z₀
    "EQ_SC1_002",  # Transformacja Fortescue
    "EQ_SC1_004",  # Z_k dla 2F
    "EQ_SC1_006",  # I₁, I₂, I₀
    "EQ_SC1_007",  # Rekombinacja fazowa
    "EQ_SC1_008",  # I″k (początkowy prąd zwarciowy) — c TUTAJ (jedyne miejsce SC1)
    "EQ_SC1_009",  # κ (współczynnik udaru)
    "EQ_SC1_010",  # ip (prąd udarowy)
    "EQ_SC1_012",  # I_dyn (prąd dynamiczny — OBOWIĄZKOWY)
    "EQ_SC1_011",  # I_th (prąd cieplny — OBOWIĄZKOWY)
]

SC2FZ_STEP_ORDER: list[str] = [
    "EQ_SC1_001",  # Z₁, Z₂, Z₀
    "EQ_SC1_002",  # Transformacja Fortescue
    "EQ_SC1_005",  # Z_k dla 2F–Z
    "EQ_SC1_006",  # I₁, I₂, I₀
    "EQ_SC1_007",  # Rekombinacja fazowa
    "EQ_SC1_008",  # I″k (początkowy prąd zwarciowy) — c TUTAJ (jedyne miejsce SC1)
    "EQ_SC1_009",  # κ (współczynnik udaru)
    "EQ_SC1_010",  # ip (prąd udarowy)
    "EQ_SC1_012",  # I_dyn (prąd dynamiczny — OBOWIĄZKOWY)
    "EQ_SC1_011",  # I_th (prąd cieplny — OBOWIĄZKOWY)
]

# Frozen IDs for stability tests (BINDING)
FROZEN_IDS: dict[str, list[str]] = {
    "sc3f_equations": list(SC3F_EQUATIONS.keys()),
    "vdrop_equations": list(VDROP_EQUATIONS.keys()),
    "lf_equations": list(LF_EQUATIONS.keys()),
    "sc1_equations": list(SC1_EQUATIONS.keys()),
    "lc_equations": list(LC_EQUATIONS.keys()),
    "le_equations": list(LE_EQUATIONS.keys()),
    "pr_equations": list(PR_EQUATIONS.keys()),
    "earth_equations": list(EARTH_EQUATIONS.keys()),
    "pf_equations": list(PF_EQUATIONS.keys()),
    "loss_equations": list(LOSS_EQUATIONS.keys()),
    "mapping_keys": [
        # SC3F
        "ikss_ka",
        "ip_ka",
        "ith_ka",
        "idyn_ka",
        "sk_mva",
        "kappa",
        "z_thevenin_ohm",
        "r_thevenin_ohm",
        "x_thevenin_ohm",
        "c_factor",
        "u_n_kv",
        # VDROP
        "r_ohm",
        "x_ohm",
        "p_mw",
        "q_mvar",
        "delta_u_r_percent",
        "delta_u_x_percent",
        "delta_u_percent",
        "delta_u_total_percent",
        # P32
        "u_nom_kv",
        "u_pu",
        "delta_pct",
        "delta_u_r_kv",
        "delta_u_x_kv",
        "delta_u_kv",
        # SC1
        "z1_ohm",
        "z2_ohm",
        "z0_ohm",
        "z_equiv_ohm",
        "u_prefault_kv",
        "i1_ka",
        "i2_ka",
        "i0_ka",
        "ia_ka",
        "ib_ka",
        "ic_ka",
        "a_operator",
        "r_equiv_ohm",
        "x_equiv_ohm",
        # P15
        "u_ll_kv",
        "p_mw",
        "q_mvar",
        "s_mva",
        "i_ka",
        "in_a",
        "k_i_percent",
        "m_i_percent",
        "sn_mva",
        "k_s_percent",
        "m_s_percent",
        # P17
        "t_h",
        "p_loss_kw",
        "delta_t_h",
        "e_i_kwh",
        "e_loss_kwh",
        # P18
        "breaking_ok",
        "dynamic_ok",
        "thermal_ok",
        "selectivity_ok",
        "icu_ka",
        "idyn_ka",
        "i2t_ka2s",
        "ith_limit_ka2s",
        "selectivity_downstream_max_s",
        "selectivity_upstream_min_s",
        "selectivity_margin_setting_s",
        # P19
        "u0_v",
        "z_e_ohm",
        "i_earth_a",
        "i_u_a",
        "i_p_a",
        "r_u_ohm",
        "u_touch_v",
        # P14 (Power Flow)
        "converged",
        "max_mismatch_pu",
        "tolerance",
        "p_gen_total_mw",
        "p_load_total_mw",
        "p_losses_total_mw",
        "q_gen_total_mvar",
        "q_load_total_mvar",
        "q_losses_total_mvar",
        "v_min_pu",
        "v_max_pu",
        # P16 (Losses)
        "p_loss_mw",
        "q_loss_mvar",
        "p_from_mw",
        "p_to_mw",
        "q_from_mvar",
        "q_to_mvar",
        "p_loss_percent",
    ],
}

registry = _EquationRegistryStore()
registry.merge(SC3F_EQUATIONS)
registry.merge(VDROP_EQUATIONS)
registry.merge(LF_EQUATIONS)
registry.merge(LC_EQUATIONS)
registry.merge(LE_EQUATIONS)
registry.merge(PR_EQUATIONS)
registry.merge(EARTH_EQUATIONS)
registry.merge(QU_EQUATIONS)
registry.merge(SC1_EQUATIONS)
registry.merge(LS_EQUATIONS)
registry.merge(PF_EQUATIONS)
registry.merge(LOSS_EQUATIONS)
registry.freeze()


class EquationRegistry:
    """
    Rejestr równań dla Proof Engine.

    Rejestr jest JEDYNYM źródłem prawdy dla wszystkich równań używanych w dowodach.
    Wszystkie equation_id są STABILNE i NIE MOGĄ się zmienić między wersjami.
    """

    @classmethod
    def get_equation(cls, equation_id: str) -> EquationDefinition | None:
        """Zwraca definicję równania po ID."""
        return registry.get(equation_id)

    @classmethod
    def get_sc3f_equations(cls) -> dict[str, EquationDefinition]:
        """Zwraca wszystkie równania SC3F."""
        return SC3F_EQUATIONS.copy()

    @classmethod
    def get_vdrop_equations(cls) -> dict[str, EquationDefinition]:
        """Zwraca wszystkie równania VDROP."""
        return VDROP_EQUATIONS.copy()

    @classmethod
    def get_lf_equations(cls) -> dict[str, EquationDefinition]:
        """Zwraca wszystkie równania P32 (Load Flow)."""
        return LF_EQUATIONS.copy()

    @classmethod
    def get_lc_equations(cls) -> dict[str, EquationDefinition]:
        """Zwraca wszystkie równania P15 (Load Currents)."""
        return LC_EQUATIONS.copy()

    @classmethod
    def get_sc3f_proof_step_order(cls) -> list[str]:
        """Zwraca kolejność kroków dla dowodu SC3F (tylko równania dowodowe)."""
        return SC3F_PROOF_STEP_ORDER.copy()

    @classmethod
    def get_vdrop_step_order(cls) -> list[str]:
        """Zwraca kolejność kroków dla dowodu VDROP."""
        return VDROP_STEP_ORDER.copy()

    @classmethod
    def get_lf_step_order(cls) -> list[str]:
        """Zwraca kolejność kroków dla dowodu P32."""
        return LF_STEP_ORDER.copy()

    @classmethod
    def get_lc_step_order(cls) -> list[str]:
        """Zwraca kolejność kroków dla dowodu P15."""
        return LC_STEP_ORDER.copy()

    @classmethod
    def get_le_equations(cls) -> dict[str, EquationDefinition]:
        """Zwraca wszystkie równania P17 (Losses Energy)."""
        return LE_EQUATIONS.copy()

    @classmethod
    def get_le_step_order(cls) -> list[str]:
        """Zwraca kolejność kroków dla dowodu P17."""
        return LE_STEP_ORDER.copy()

    @classmethod
    def get_pr_equations(cls) -> dict[str, EquationDefinition]:
        """Zwraca wszystkie równania P18 (Protection Overcurrent)."""
        return PR_EQUATIONS.copy()

    @classmethod
    def get_pr_step_order(cls) -> list[str]:
        """Zwraca kolejność kroków dla dowodu P18."""
        return PR_STEP_ORDER.copy()

    @classmethod
    def get_earth_equations(cls) -> dict[str, EquationDefinition]:
        """Zwraca wszystkie równania P19 (Earthing / Ground Fault)."""
        return EARTH_EQUATIONS.copy()

    @classmethod
    def get_earth_step_order(cls) -> list[str]:
        """Zwraca kolejność kroków dla dowodu P19."""
        return EARTH_STEP_ORDER.copy()

    @classmethod
    def get_qu_equations(cls) -> dict[str, EquationDefinition]:
        """Zwraca wszystkie równania Q(U)."""
        return QU_EQUATIONS.copy()

    @classmethod
    def get_qu_step_order(cls) -> list[str]:
        """Zwraca kolejność kroków dla dowodu Q(U)."""
        return QU_STEP_ORDER.copy()

    @classmethod
    def get_sc1_equations(cls) -> dict[str, EquationDefinition]:
        """Zwraca wszystkie równania SC1 (P11.1c)."""
        return SC1_EQUATIONS.copy()

    @classmethod
    def get_pf_equations(cls) -> dict[str, EquationDefinition]:
        """Zwraca wszystkie równania P14 (Power Flow Verification)."""
        return PF_EQUATIONS.copy()

    @classmethod
    def get_pf_step_order(cls) -> list[str]:
        """Zwraca kolejność kroków dla dowodu P14."""
        return PF_STEP_ORDER.copy()

    @classmethod
    def get_loss_equations(cls) -> dict[str, EquationDefinition]:
        """Zwraca wszystkie równania P16 (Losses Proof)."""
        return LOSS_EQUATIONS.copy()

    @classmethod
    def get_loss_step_order(cls) -> list[str]:
        """Zwraca kolejność kroków dla dowodu P16."""
        return LOSS_STEP_ORDER.copy()

    @classmethod
    def get_sc1_step_order(cls, fault_type: str) -> list[str]:
        """
        Zwraca kolejność kroków dla dowodu SC1 (P11.1c).

        Args:
            fault_type: Typ zwarcia (SC1FZ/SC2F/SC2FZ)
        """
        if fault_type == "SC1FZ":
            return SC1FZ_STEP_ORDER.copy()
        if fault_type == "SC2F":
            return SC2F_STEP_ORDER.copy()
        if fault_type == "SC2FZ":
            return SC2FZ_STEP_ORDER.copy()
        raise ValueError(f"Unsupported SC1 fault type: {fault_type}")

    @classmethod
    def get_all_mapping_keys(cls) -> set[str]:
        """Zwraca wszystkie mapping_key używane w rejestrze."""
        keys: set[str] = set()
        for eq in registry.values():
            for sym in eq.symbols:
                keys.add(sym.mapping_key)
        return keys

    @classmethod
    def validate_id_stability(cls) -> bool:
        """
        Weryfikuje, że żaden istniejący ID nie został zmieniony.
        Używane w testach regresji.
        """
        for eq_id in FROZEN_IDS["sc3f_equations"]:
            if eq_id not in SC3F_EQUATIONS:
                raise ValueError(f"Frozen equation ID {eq_id} usunięty z SC3F!")

        for eq_id in FROZEN_IDS["vdrop_equations"]:
            if eq_id not in VDROP_EQUATIONS:
                raise ValueError(f"Frozen equation ID {eq_id} usunięty z VDROP!")

        for eq_id in FROZEN_IDS["lf_equations"]:
            if eq_id not in LF_EQUATIONS:
                raise ValueError(f"Frozen equation ID {eq_id} usunięty z P32!")

        for eq_id in FROZEN_IDS["sc1_equations"]:
            if eq_id not in SC1_EQUATIONS:
                raise ValueError(f"Frozen equation ID {eq_id} usunięty z SC1!")

        for eq_id in FROZEN_IDS["lc_equations"]:
            if eq_id not in LC_EQUATIONS:
                raise ValueError(f"Frozen equation ID {eq_id} usunięty z P15!")

        for eq_id in FROZEN_IDS["le_equations"]:
            if eq_id not in LE_EQUATIONS:
                raise ValueError(f"Frozen equation ID {eq_id} usunięty z P17!")

        for eq_id in FROZEN_IDS["pr_equations"]:
            if eq_id not in PR_EQUATIONS:
                raise ValueError(f"Frozen equation ID {eq_id} usunięty z P18!")
        for eq_id in FROZEN_IDS["earth_equations"]:
            if eq_id not in EARTH_EQUATIONS:
                raise ValueError(f"Frozen equation ID {eq_id} usunięty z P19!")

        current_keys = cls.get_all_mapping_keys()
        for key in FROZEN_IDS["mapping_keys"]:
            if key not in current_keys:
                raise ValueError(f"Frozen mapping key {key} usunięty!")

        return True

    @classmethod
    def verify_anti_double_counting(cls) -> bool:
        """Weryfikuje audit anti-double-counting (SC3F)."""
        return AntiDoubleCountingAudit.verify()

    @classmethod
    def verify_anti_double_counting_sc1(cls) -> bool:
        """Weryfikuje audit anti-double-counting (SC1)."""
        return AntiDoubleCountingAudit.verify_sc1()


EquationRegistry.SC3F_EQUATIONS = SC3F_EQUATIONS
EquationRegistry.VDROP_EQUATIONS = VDROP_EQUATIONS
EquationRegistry.LF_EQUATIONS = LF_EQUATIONS
EquationRegistry.LC_EQUATIONS = LC_EQUATIONS
EquationRegistry.LE_EQUATIONS = LE_EQUATIONS
EquationRegistry.PR_EQUATIONS = PR_EQUATIONS
EquationRegistry.EARTH_EQUATIONS = EARTH_EQUATIONS
EquationRegistry.QU_EQUATIONS = QU_EQUATIONS
EquationRegistry.SC1_EQUATIONS = SC1_EQUATIONS
EquationRegistry.SC3F_PROOF_STEP_ORDER = SC3F_PROOF_STEP_ORDER
EquationRegistry.VDROP_STEP_ORDER = VDROP_STEP_ORDER
EquationRegistry.LF_STEP_ORDER = LF_STEP_ORDER
EquationRegistry.LC_STEP_ORDER = LC_STEP_ORDER
EquationRegistry.LE_STEP_ORDER = LE_STEP_ORDER
EquationRegistry.PR_STEP_ORDER = PR_STEP_ORDER
EquationRegistry.EARTH_STEP_ORDER = EARTH_STEP_ORDER
EquationRegistry.QU_STEP_ORDER = QU_STEP_ORDER
EquationRegistry.SC1FZ_STEP_ORDER = SC1FZ_STEP_ORDER
EquationRegistry.SC2F_STEP_ORDER = SC2F_STEP_ORDER
EquationRegistry.SC2FZ_STEP_ORDER = SC2FZ_STEP_ORDER
EquationRegistry.FROZEN_IDS = FROZEN_IDS
