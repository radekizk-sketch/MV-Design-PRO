"""
P21: Equation Registry dla Power Flow Newton-Raphson.

Ten moduł zawiera kanoniczny rejestr równań używanych w dowodzie Power Flow.
Każde równanie ma stabilne ID i pełną definicję LaTeX.

CANONICAL ALIGNMENT:
- IMMUTABLE: ID równań nie mogą się zmieniać
- LATEX-ONLY: Wszystkie wzory w notacji LaTeX
- POLISH: Nazwy i opisy po polsku
- STABLE: Kolejność kroków jest ustalona
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class SymbolDefinition:
    """Definicja symbolu matematycznego.

    Attributes:
        symbol: Symbol w notacji LaTeX.
        unit: Jednostka SI lub '—' dla bezwymiarowych.
        description_pl: Opis po polsku.
        mapping_key: Klucz w trace/result.
    """

    symbol: str
    unit: str
    description_pl: str
    mapping_key: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "unit": self.unit,
            "description_pl": self.description_pl,
            "mapping_key": self.mapping_key,
        }


@dataclass(frozen=True)
class EquationEntry:
    """Wpis w rejestrze równań.

    Attributes:
        equation_id: Unikalny identyfikator (IMMUTABLE).
        latex: Wzór w notacji LaTeX.
        name_pl: Nazwa równania po polsku.
        description_pl: Opis równania.
        symbols: Lista symboli użytych w równaniu.
        category: Kategoria równania.
    """

    equation_id: str
    latex: str
    name_pl: str
    description_pl: str
    symbols: tuple[SymbolDefinition, ...]
    category: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "equation_id": self.equation_id,
            "latex": self.latex,
            "name_pl": self.name_pl,
            "description_pl": self.description_pl,
            "symbols": [s.to_dict() for s in self.symbols],
            "category": self.category,
        }


# =============================================================================
# SEKCJA 1: RÓWNANIA ROZPŁYWU MOCY (Power Flow Equations)
# =============================================================================

EQ_PF_001_P_INJECTION = EquationEntry(
    equation_id="EQ_PF_001",
    latex=r"P_i = \sum_{k=1}^{n} |V_i| |V_k| (G_{ik} \cos \theta_{ik} + B_{ik} \sin \theta_{ik})",
    name_pl="Równanie mocy czynnej wstrzykiwanej",
    description_pl="Moc czynna wstrzyknięta do węzła i jako suma iloczynów napięć i admitancji.",
    symbols=(
        SymbolDefinition("P_i", "p.u.", "Moc czynna wstrzyknięta do węzła i", "p_injected_pu"),
        SymbolDefinition("|V_i|", "p.u.", "Moduł napięcia w węźle i", "v_pu"),
        SymbolDefinition("|V_k|", "p.u.", "Moduł napięcia w węźle k", "v_pu"),
        SymbolDefinition("G_{ik}", "p.u.", "Konduktancja między węzłami i-k", "g_ik_pu"),
        SymbolDefinition("B_{ik}", "p.u.", "Susceptancja między węzłami i-k", "b_ik_pu"),
        SymbolDefinition(r"\theta_{ik}", "rad", "Różnica kątów napięć", "theta_diff_rad"),
    ),
    category="POWER_FLOW",
)

EQ_PF_002_Q_INJECTION = EquationEntry(
    equation_id="EQ_PF_002",
    latex=r"Q_i = \sum_{k=1}^{n} |V_i| |V_k| (G_{ik} \sin \theta_{ik} - B_{ik} \cos \theta_{ik})",
    name_pl="Równanie mocy biernej wstrzykiwanej",
    description_pl="Moc bierna wstrzyknięta do węzła i jako suma iloczynów napięć i admitancji.",
    symbols=(
        SymbolDefinition("Q_i", "p.u.", "Moc bierna wstrzyknięta do węzła i", "q_injected_pu"),
        SymbolDefinition("|V_i|", "p.u.", "Moduł napięcia w węźle i", "v_pu"),
        SymbolDefinition("|V_k|", "p.u.", "Moduł napięcia w węźle k", "v_pu"),
        SymbolDefinition("G_{ik}", "p.u.", "Konduktancja między węzłami i-k", "g_ik_pu"),
        SymbolDefinition("B_{ik}", "p.u.", "Susceptancja między węzłami i-k", "b_ik_pu"),
        SymbolDefinition(r"\theta_{ik}", "rad", "Różnica kątów napięć", "theta_diff_rad"),
    ),
    category="POWER_FLOW",
)

# =============================================================================
# SEKCJA 2: METODA NEWTON-RAPHSON (NR Method)
# =============================================================================

EQ_NR_001_MISMATCH_P = EquationEntry(
    equation_id="EQ_NR_001",
    latex=r"\Delta P_i = P_i^{spec} - P_i^{calc}",
    name_pl="Mismatch mocy czynnej",
    description_pl="Różnica między zadaną a obliczoną mocą czynną w węźle i.",
    symbols=(
        SymbolDefinition(r"\Delta P_i", "p.u.", "Mismatch mocy czynnej", "delta_p_pu"),
        SymbolDefinition("P_i^{spec}", "p.u.", "Zadana moc czynna", "p_spec_pu"),
        SymbolDefinition("P_i^{calc}", "p.u.", "Obliczona moc czynna", "p_calc_pu"),
    ),
    category="NEWTON_RAPHSON",
)

EQ_NR_002_MISMATCH_Q = EquationEntry(
    equation_id="EQ_NR_002",
    latex=r"\Delta Q_i = Q_i^{spec} - Q_i^{calc}",
    name_pl="Mismatch mocy biernej",
    description_pl="Różnica między zadaną a obliczoną mocą bierną w węźle i.",
    symbols=(
        SymbolDefinition(r"\Delta Q_i", "p.u.", "Mismatch mocy biernej", "delta_q_pu"),
        SymbolDefinition("Q_i^{spec}", "p.u.", "Zadana moc bierna", "q_spec_pu"),
        SymbolDefinition("Q_i^{calc}", "p.u.", "Obliczona moc bierna", "q_calc_pu"),
    ),
    category="NEWTON_RAPHSON",
)

EQ_NR_003_JACOBIAN = EquationEntry(
    equation_id="EQ_NR_003",
    latex=r"\mathbf{J} = \begin{bmatrix} \frac{\partial \mathbf{P}}{\partial \boldsymbol{\theta}} & \frac{\partial \mathbf{P}}{\partial \mathbf{V}} \\ \frac{\partial \mathbf{Q}}{\partial \boldsymbol{\theta}} & \frac{\partial \mathbf{Q}}{\partial \mathbf{V}} \end{bmatrix} = \begin{bmatrix} \mathbf{J}_1 & \mathbf{J}_2 \\ \mathbf{J}_3 & \mathbf{J}_4 \end{bmatrix}",
    name_pl="Macierz Jacobiego",
    description_pl="Macierz pochodnych cząstkowych funkcji mocy względem zmiennych stanu.",
    symbols=(
        SymbolDefinition(r"\mathbf{J}", "—", "Macierz Jacobiego", "jacobian"),
        SymbolDefinition(r"\mathbf{J}_1", "—", "Blok ∂P/∂θ", "J1_dP_dTheta"),
        SymbolDefinition(r"\mathbf{J}_2", "—", "Blok ∂P/∂V", "J2_dP_dV"),
        SymbolDefinition(r"\mathbf{J}_3", "—", "Blok ∂Q/∂θ", "J3_dQ_dTheta"),
        SymbolDefinition(r"\mathbf{J}_4", "—", "Blok ∂Q/∂V", "J4_dQ_dV"),
    ),
    category="NEWTON_RAPHSON",
)

EQ_NR_004_J1_DIAGONAL = EquationEntry(
    equation_id="EQ_NR_004",
    latex=r"J_{1,ii} = \frac{\partial P_i}{\partial \theta_i} = -Q_i - B_{ii} |V_i|^2",
    name_pl="Element diagonalny J₁",
    description_pl="Pochodna cząstkowa mocy czynnej po kącie własnego węzła.",
    symbols=(
        SymbolDefinition("J_{1,ii}", "—", "Element diagonalny J₁", "J1_diag"),
        SymbolDefinition("Q_i", "p.u.", "Moc bierna w węźle i", "q_pu"),
        SymbolDefinition("B_{ii}", "p.u.", "Susceptancja własna węzła i", "b_ii_pu"),
        SymbolDefinition("|V_i|", "p.u.", "Moduł napięcia", "v_pu"),
    ),
    category="NEWTON_RAPHSON",
)

EQ_NR_005_J1_OFFDIAGONAL = EquationEntry(
    equation_id="EQ_NR_005",
    latex=r"J_{1,ik} = \frac{\partial P_i}{\partial \theta_k} = |V_i| |V_k| (G_{ik} \sin \theta_{ik} - B_{ik} \cos \theta_{ik})",
    name_pl="Element pozadiagonalny J₁",
    description_pl="Pochodna cząstkowa mocy czynnej po kącie innego węzła.",
    symbols=(
        SymbolDefinition("J_{1,ik}", "—", "Element pozadiagonalny J₁", "J1_offdiag"),
        SymbolDefinition("|V_i|", "p.u.", "Moduł napięcia węzła i", "v_i_pu"),
        SymbolDefinition("|V_k|", "p.u.", "Moduł napięcia węzła k", "v_k_pu"),
        SymbolDefinition("G_{ik}", "p.u.", "Konduktancja", "g_ik_pu"),
        SymbolDefinition("B_{ik}", "p.u.", "Susceptancja", "b_ik_pu"),
        SymbolDefinition(r"\theta_{ik}", "rad", "Różnica kątów", "theta_diff_rad"),
    ),
    category="NEWTON_RAPHSON",
)

EQ_NR_006_J2_DIAGONAL = EquationEntry(
    equation_id="EQ_NR_006",
    latex=r"J_{2,ii} = \frac{\partial P_i}{\partial |V_i|} = \frac{P_i}{|V_i|} + G_{ii} |V_i|",
    name_pl="Element diagonalny J₂",
    description_pl="Pochodna cząstkowa mocy czynnej po module napięcia własnego węzła.",
    symbols=(
        SymbolDefinition("J_{2,ii}", "—", "Element diagonalny J₂", "J2_diag"),
        SymbolDefinition("P_i", "p.u.", "Moc czynna w węźle i", "p_pu"),
        SymbolDefinition("G_{ii}", "p.u.", "Konduktancja własna węzła i", "g_ii_pu"),
        SymbolDefinition("|V_i|", "p.u.", "Moduł napięcia", "v_pu"),
    ),
    category="NEWTON_RAPHSON",
)

EQ_NR_007_J3_DIAGONAL = EquationEntry(
    equation_id="EQ_NR_007",
    latex=r"J_{3,ii} = \frac{\partial Q_i}{\partial \theta_i} = P_i - G_{ii} |V_i|^2",
    name_pl="Element diagonalny J₃",
    description_pl="Pochodna cząstkowa mocy biernej po kącie własnego węzła.",
    symbols=(
        SymbolDefinition("J_{3,ii}", "—", "Element diagonalny J₃", "J3_diag"),
        SymbolDefinition("P_i", "p.u.", "Moc czynna w węźle i", "p_pu"),
        SymbolDefinition("G_{ii}", "p.u.", "Konduktancja własna węzła i", "g_ii_pu"),
        SymbolDefinition("|V_i|", "p.u.", "Moduł napięcia", "v_pu"),
    ),
    category="NEWTON_RAPHSON",
)

EQ_NR_008_J4_DIAGONAL = EquationEntry(
    equation_id="EQ_NR_008",
    latex=r"J_{4,ii} = \frac{\partial Q_i}{\partial |V_i|} = \frac{Q_i}{|V_i|} - B_{ii} |V_i|",
    name_pl="Element diagonalny J₄",
    description_pl="Pochodna cząstkowa mocy biernej po module napięcia własnego węzła.",
    symbols=(
        SymbolDefinition("J_{4,ii}", "—", "Element diagonalny J₄", "J4_diag"),
        SymbolDefinition("Q_i", "p.u.", "Moc bierna w węźle i", "q_pu"),
        SymbolDefinition("B_{ii}", "p.u.", "Susceptancja własna węzła i", "b_ii_pu"),
        SymbolDefinition("|V_i|", "p.u.", "Moduł napięcia", "v_pu"),
    ),
    category="NEWTON_RAPHSON",
)

EQ_NR_009_LINEAR_SYSTEM = EquationEntry(
    equation_id="EQ_NR_009",
    latex=r"\begin{bmatrix} \Delta \boldsymbol{\theta} \\ \Delta \mathbf{V} \end{bmatrix} = \mathbf{J}^{-1} \begin{bmatrix} \Delta \mathbf{P} \\ \Delta \mathbf{Q} \end{bmatrix}",
    name_pl="Układ równań liniowych NR",
    description_pl="Rozwiązanie układu równań liniowych dla poprawek stanu.",
    symbols=(
        SymbolDefinition(
            r"\Delta \boldsymbol{\theta}", "rad", "Wektor poprawek kątów", "delta_theta_rad"
        ),
        SymbolDefinition(r"\Delta \mathbf{V}", "p.u.", "Wektor poprawek napięć", "delta_v_pu"),
        SymbolDefinition(r"\mathbf{J}^{-1}", "—", "Odwrotność Jacobiego", "jacobian_inv"),
        SymbolDefinition(r"\Delta \mathbf{P}", "p.u.", "Wektor mismatch P", "delta_p_vec"),
        SymbolDefinition(r"\Delta \mathbf{Q}", "p.u.", "Wektor mismatch Q", "delta_q_vec"),
    ),
    category="NEWTON_RAPHSON",
)

EQ_NR_010_STATE_UPDATE = EquationEntry(
    equation_id="EQ_NR_010",
    latex=r"\begin{aligned} \theta_i^{(k+1)} &= \theta_i^{(k)} + \alpha \cdot \Delta \theta_i^{(k)} \\ |V_i|^{(k+1)} &= |V_i|^{(k)} + \alpha \cdot \Delta |V_i|^{(k)} \end{aligned}",
    name_pl="Aktualizacja stanu",
    description_pl="Aktualizacja kątów i napięć z uwzględnieniem współczynnika tłumienia α.",
    symbols=(
        SymbolDefinition(
            r"\theta_i^{(k+1)}", "rad", "Kąt napięcia po aktualizacji", "theta_next_rad"
        ),
        SymbolDefinition(
            r"\theta_i^{(k)}", "rad", "Kąt napięcia przed aktualizacją", "theta_current_rad"
        ),
        SymbolDefinition(r"\Delta \theta_i^{(k)}", "rad", "Poprawka kąta", "delta_theta_rad"),
        SymbolDefinition(r"|V_i|^{(k+1)}", "p.u.", "Moduł napięcia po aktualizacji", "v_next_pu"),
        SymbolDefinition(
            r"|V_i|^{(k)}", "p.u.", "Moduł napięcia przed aktualizacją", "v_current_pu"
        ),
        SymbolDefinition(r"\Delta |V_i|^{(k)}", "p.u.", "Poprawka modułu napięcia", "delta_v_pu"),
        SymbolDefinition(r"\alpha", "—", "Współczynnik tłumienia (damping)", "damping_used"),
    ),
    category="NEWTON_RAPHSON",
)

# =============================================================================
# SEKCJA 3: KRYTERIUM ZBIEŻNOŚCI (Convergence Criterion)
# =============================================================================

EQ_CONV_001_NORM = EquationEntry(
    equation_id="EQ_CONV_001",
    latex=r"\|\mathbf{f}\|_{\infty} = \max\left( |\Delta P_i|, |\Delta Q_i| \right) < \varepsilon",
    name_pl="Kryterium zbieżności (norma nieskończoność)",
    description_pl="Zbieżność osiągnięta gdy maksymalny mismatch jest mniejszy od tolerancji.",
    symbols=(
        SymbolDefinition(
            r"\|\mathbf{f}\|_{\infty}",
            "p.u.",
            "Norma nieskończoność wektora mismatch",
            "max_mismatch_pu",
        ),
        SymbolDefinition(r"|\Delta P_i|", "p.u.", "Wartość bezwzględna mismatch P", "abs_delta_p"),
        SymbolDefinition(r"|\Delta Q_i|", "p.u.", "Wartość bezwzględna mismatch Q", "abs_delta_q"),
        SymbolDefinition(r"\varepsilon", "p.u.", "Tolerancja zbieżności", "tolerance"),
    ),
    category="CONVERGENCE",
)

EQ_CONV_002_NORM_L2 = EquationEntry(
    equation_id="EQ_CONV_002",
    latex=r"\|\mathbf{f}\|_2 = \sqrt{\sum_i \left( \Delta P_i^2 + \Delta Q_i^2 \right)} < \varepsilon \cdot \sqrt{2n}",
    name_pl="Kryterium zbieżności (norma L2)",
    description_pl="Alternatywne kryterium zbieżności oparte na normie euklidesowej.",
    symbols=(
        SymbolDefinition(r"\|\mathbf{f}\|_2", "p.u.", "Norma L2 wektora mismatch", "norm_mismatch"),
        SymbolDefinition(r"\Delta P_i", "p.u.", "Mismatch mocy czynnej", "delta_p_pu"),
        SymbolDefinition(r"\Delta Q_i", "p.u.", "Mismatch mocy biernej", "delta_q_pu"),
        SymbolDefinition("n", "—", "Liczba węzłów (bez slack)", "bus_count"),
        SymbolDefinition(r"\varepsilon", "p.u.", "Tolerancja zbieżności", "tolerance"),
    ),
    category="CONVERGENCE",
)

# =============================================================================
# REJESTR RÓWNAŃ (IMMUTABLE ORDER)
# =============================================================================

POWER_FLOW_EQUATION_REGISTRY: tuple[EquationEntry, ...] = (
    # Sekcja 1: Równania rozpływu mocy
    EQ_PF_001_P_INJECTION,
    EQ_PF_002_Q_INJECTION,
    # Sekcja 2: Metoda Newton-Raphson
    EQ_NR_001_MISMATCH_P,
    EQ_NR_002_MISMATCH_Q,
    EQ_NR_003_JACOBIAN,
    EQ_NR_004_J1_DIAGONAL,
    EQ_NR_005_J1_OFFDIAGONAL,
    EQ_NR_006_J2_DIAGONAL,
    EQ_NR_007_J3_DIAGONAL,
    EQ_NR_008_J4_DIAGONAL,
    EQ_NR_009_LINEAR_SYSTEM,
    EQ_NR_010_STATE_UPDATE,
    # Sekcja 3: Kryterium zbieżności
    EQ_CONV_001_NORM,
    EQ_CONV_002_NORM_L2,
)


def get_equation_by_id(equation_id: str) -> EquationEntry | None:
    """Pobiera równanie po ID."""
    for eq in POWER_FLOW_EQUATION_REGISTRY:
        if eq.equation_id == equation_id:
            return eq
    return None


def get_equations_by_category(category: str) -> list[EquationEntry]:
    """Pobiera równania z danej kategorii."""
    return [eq for eq in POWER_FLOW_EQUATION_REGISTRY if eq.category == category]


# =============================================================================
# KOLEJNOŚĆ KROKÓW (IMMUTABLE ORDER)
# =============================================================================

POWER_FLOW_PROOF_STEP_ORDER: tuple[str, ...] = (
    # Sekcja: Definicja problemu
    "PFPROOF_DEF_001",  # Definicja sieci
    "PFPROOF_DEF_002",  # Moc bazowa i węzły
    # Sekcja: Równania rozpływu mocy
    "PFPROOF_EQ_001",  # Równanie P(θ,V)
    "PFPROOF_EQ_002",  # Równanie Q(θ,V)
    # Sekcja: Metoda NR
    "PFPROOF_NR_001",  # Opis metody NR
    "PFPROOF_NR_002",  # Jacobian - struktura
    # Sekcja: Stan początkowy
    "PFPROOF_INIT_001",  # Stan początkowy V₀, θ₀
    # Sekcja: Iteracje (dynamiczne)
    # PFPROOF_ITER_{k}_MISMATCH
    # PFPROOF_ITER_{k}_NORM
    # PFPROOF_ITER_{k}_JACOBIAN
    # PFPROOF_ITER_{k}_DELTA
    # PFPROOF_ITER_{k}_UPDATE
    # PFPROOF_ITER_{k}_CONV
    # Sekcja: Kryterium zbieżności
    "PFPROOF_CONV_001",  # Kryterium zbieżności
    # Sekcja: Stan końcowy
    "PFPROOF_FINAL_001",  # Stan końcowy V, θ
    "PFPROOF_FINAL_002",  # Bilans mocy
    # Sekcja: Weryfikacja
    "PFPROOF_VERIFY_001",  # Spójność jednostek
    "PFPROOF_VERIFY_002",  # Brak sprzeczności energetycznych
)
