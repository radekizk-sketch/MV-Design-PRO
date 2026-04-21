"""
EquationRegistryV2 — single source of truth for equations (PR-34).

All equations used in TraceArtifactV2 MUST be registered here.
No dynamic eq_id. No embedding symbolic latex at runtime without registry.

INVARIANTS:
- eq_id is stable and semantic
- latex_symbolic is canonical
- valid_from_math_spec pins equation to version
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from domain.trace_v2.math_spec_version import CURRENT_MATH_SPEC_VERSION

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class EquationVariable:
    """Variable used in an equation."""

    name: str
    unit: str
    meaning_pl: str

    def to_dict(self) -> dict[str, str]:
        return {"name": self.name, "unit": self.unit, "meaning_pl": self.meaning_pl}


@dataclass(frozen=True)
class EquationEntryV2:
    """Single equation in the registry.

    Attributes:
        eq_id: Stable, semantic ID (e.g. "SC_IKSS")
        label_pl: Polish label for UI
        description_pl: Polish description
        latex_symbolic: Symbolic LaTeX formula
        variables: Variables used in the equation
        source_norm: Normative reference (IEC 60909, etc.)
        valid_from_math_spec: MathSpecVersion semver
    """

    eq_id: str
    label_pl: str
    description_pl: str
    latex_symbolic: str
    variables: tuple[EquationVariable, ...]
    source_norm: str
    valid_from_math_spec: str = CURRENT_MATH_SPEC_VERSION

    def to_dict(self) -> dict[str, Any]:
        return {
            "eq_id": self.eq_id,
            "label_pl": self.label_pl,
            "description_pl": self.description_pl,
            "latex_symbolic": self.latex_symbolic,
            "variables": [v.to_dict() for v in self.variables],
            "source_norm": self.source_norm,
            "valid_from_math_spec": self.valid_from_math_spec,
        }


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class EquationRegistryV2:
    """Immutable equation registry (single source of truth).

    Usage:
        registry = EquationRegistryV2.default()
        eq = registry.get("SC_IKSS")
    """

    def __init__(self, entries: dict[str, EquationEntryV2]) -> None:
        self._entries: dict[str, EquationEntryV2] = dict(sorted(entries.items()))

    def get(self, eq_id: str) -> EquationEntryV2:
        """Get equation by ID. Raises KeyError if not found."""
        return self._entries[eq_id]

    def contains(self, eq_id: str) -> bool:
        return eq_id in self._entries

    def all_ids(self) -> list[str]:
        return list(self._entries.keys())

    def all_entries(self) -> list[EquationEntryV2]:
        return list(self._entries.values())

    def to_dict(self) -> dict[str, Any]:
        return {eq_id: entry.to_dict() for eq_id, entry in self._entries.items()}

    @classmethod
    def default(cls) -> EquationRegistryV2:
        """Build the default registry with all canonical equations."""
        entries: dict[str, EquationEntryV2] = {}
        for eq in _SC_EQUATIONS + _PROTECTION_EQUATIONS + _LOAD_FLOW_EQUATIONS:
            entries[eq.eq_id] = eq
        return cls(entries)


# ===========================================================================
# SC (IEC 60909) Equations
# ===========================================================================

_v = EquationVariable

_SC_EQUATIONS: list[EquationEntryV2] = [
    EquationEntryV2(
        eq_id="SC_ZK_3F",
        label_pl="Impedancja zastępcza (3F)",
        description_pl="Impedancja zastępcza w punkcie zwarcia — zwarcie trójfazowe",
        latex_symbolic=r"Z_k = Z_1",
        variables=(
            _v("Z_k", "\\Omega", "Impedancja zastępcza"),
            _v("Z_1", "\\Omega", "Impedancja kolejności zgodnej"),
        ),
        source_norm="IEC 60909-0:2016",
    ),
    EquationEntryV2(
        eq_id="SC_ZK_2F",
        label_pl="Impedancja zastępcza (2F)",
        description_pl="Impedancja zastępcza w punkcie zwarcia — zwarcie dwufazowe",
        latex_symbolic=r"Z_k = Z_1 + Z_2",
        variables=(
            _v("Z_k", "\\Omega", "Impedancja zastępcza"),
            _v("Z_1", "\\Omega", "Impedancja kolejności zgodnej"),
            _v("Z_2", "\\Omega", "Impedancja kolejności przeciwnej"),
        ),
        source_norm="IEC 60909-0:2016",
    ),
    EquationEntryV2(
        eq_id="SC_ZK_1F",
        label_pl="Impedancja zastępcza (1F)",
        description_pl="Impedancja zastępcza w punkcie zwarcia — zwarcie jednofazowe",
        latex_symbolic=r"Z_k = Z_1 + Z_2 + Z_0",
        variables=(
            _v("Z_k", "\\Omega", "Impedancja zastępcza"),
            _v("Z_1", "\\Omega", "Impedancja kolejności zgodnej"),
            _v("Z_2", "\\Omega", "Impedancja kolejności przeciwnej"),
            _v("Z_0", "\\Omega", "Impedancja kolejności zerowej"),
        ),
        source_norm="IEC 60909-0:2016",
    ),
    EquationEntryV2(
        eq_id="SC_ZK_2FG",
        label_pl="Impedancja zastępcza (2F+G)",
        description_pl="Impedancja zastępcza w punkcie zwarcia — zwarcie dwufazowe z ziemią",
        latex_symbolic=r"Z_k = Z_1 + \frac{Z_2 \cdot Z_0}{Z_2 + Z_0}",
        variables=(
            _v("Z_k", "\\Omega", "Impedancja zastępcza"),
            _v("Z_1", "\\Omega", "Impedancja kolejności zgodnej"),
            _v("Z_2", "\\Omega", "Impedancja kolejności przeciwnej"),
            _v("Z_0", "\\Omega", "Impedancja kolejności zerowej"),
        ),
        source_norm="IEC 60909-0:2016",
    ),
    EquationEntryV2(
        eq_id="SC_IKSS",
        label_pl="Prąd zwarciowy początkowy",
        description_pl="Prąd zwarciowy początkowy symetryczny I_k''",
        latex_symbolic=r"I_{k}'' = \frac{c \cdot U_n \cdot k_U}{|Z_k|}",
        variables=(
            _v("I_{k}''", "A", "Prąd zwarciowy początkowy"),
            _v("c", "—", "Współczynnik napięciowy"),
            _v("U_n", "V", "Napięcie znamionowe"),
            _v("k_U", "—", "Współczynnik napięciowy typu zwarcia"),
            _v("|Z_k|", "\\Omega", "Moduł impedancji zastępczej"),
        ),
        source_norm="IEC 60909-0:2016 eq. (29)",
    ),
    EquationEntryV2(
        eq_id="SC_KAPPA",
        label_pl="Współczynnik udaru",
        description_pl="Współczynnik udaru kappa",
        latex_symbolic=r"\kappa = 1.02 + 0.98 \cdot e^{-3 R/X}",
        variables=(
            _v("\\kappa", "—", "Współczynnik udaru"),
            _v("R", "\\Omega", "Rezystancja"),
            _v("X", "\\Omega", "Reaktancja"),
        ),
        source_norm="IEC 60909-0:2016 eq. (66)",
    ),
    EquationEntryV2(
        eq_id="SC_IP",
        label_pl="Prąd udarowy",
        description_pl="Prąd udarowy ip",
        latex_symbolic=r"i_p = \kappa \cdot \sqrt{2} \cdot I_{k}''",
        variables=(
            _v("i_p", "A", "Prąd udarowy"),
            _v("\\kappa", "—", "Współczynnik udaru"),
            _v("I_{k}''", "A", "Prąd zwarciowy początkowy"),
        ),
        source_norm="IEC 60909-0:2016 eq. (61)",
    ),
    EquationEntryV2(
        eq_id="SC_IB",
        label_pl="Prąd zwarciowy Ib",
        description_pl="Prąd zwarciowy do obliczeń cieplnych Ib",
        latex_symbolic=r"I_b = I_{k}'' \cdot \sqrt{1 + ((\kappa - 1) \cdot e^{-t_b/t_a})^2}",
        variables=(
            _v("I_b", "A", "Prąd zwarciowy Ib"),
            _v("I_{k}''", "A", "Prąd zwarciowy początkowy"),
            _v("\\kappa", "—", "Współczynnik udaru"),
            _v("t_b", "s", "Czas do obliczenia Ib"),
            _v("t_a", "s", "Stała czasowa DC"),
        ),
        source_norm="IEC 60909-0:2016",
    ),
    EquationEntryV2(
        eq_id="SC_ITH",
        label_pl="Prąd zastępczy cieplny",
        description_pl="Prąd zastępczy cieplny Ith",
        latex_symbolic=r"I_{th} = I_{k}'' \cdot \sqrt{t_k}",
        variables=(
            _v("I_{th}", "A", "Prąd zastępczy cieplny"),
            _v("I_{k}''", "A", "Prąd zwarciowy początkowy"),
            _v("t_k", "s", "Czas trwania zwarcia"),
        ),
        source_norm="IEC 60909-0:2016",
    ),
    EquationEntryV2(
        eq_id="SC_IDYN",
        label_pl="Prąd dynamiczny",
        description_pl="Prąd dynamiczny I_dyn = i_p",
        latex_symbolic=r"I_{dyn} = i_p",
        variables=(
            _v("I_{dyn}", "A", "Prąd dynamiczny"),
            _v("i_p", "A", "Prąd udarowy"),
        ),
        source_norm="IEC 60909-0:2016",
    ),
    EquationEntryV2(
        eq_id="SC_SK",
        label_pl="Moc zwarciowa",
        description_pl="Moc zwarciowa Sk''",
        latex_symbolic=r"S_k'' = \frac{\sqrt{3} \cdot U_n \cdot I_{k}''}{10^6}",
        variables=(
            _v("S_k''", "MVA", "Moc zwarciowa"),
            _v("U_n", "V", "Napięcie znamionowe"),
            _v("I_{k}''", "A", "Prąd zwarciowy początkowy"),
        ),
        source_norm="IEC 60909-0:2016 eq. (34)",
    ),
]

# ===========================================================================
# Protection (IEC 60255) Equations
# ===========================================================================

_PROTECTION_EQUATIONS: list[EquationEntryV2] = [
    EquationEntryV2(
        eq_id="PROT_CT_CONVERSION",
        label_pl="Przeliczenie przekładnika prądowego",
        description_pl="Przeliczenie prądu strony pierwotnej na wtórną CT",
        latex_symbolic=r"I_{sec} = I_{pri} \cdot \frac{n_{sec}}{n_{pri}}",
        variables=(
            _v("I_{sec}", "A", "Prąd wtórny"),
            _v("I_{pri}", "A", "Prąd pierwotny"),
            _v("n_{sec}", "A", "Prąd znamionowy strony wtórnej"),
            _v("n_{pri}", "A", "Prąd znamionowy strony pierwotnej"),
        ),
        source_norm="IEC 61869-2",
    ),
    EquationEntryV2(
        eq_id="PROT_MULTIPLE_M",
        label_pl="Wielokrotność prądu rozruchowego",
        description_pl="Krotność prądu pomiarowego do nastawy rozruchowej",
        latex_symbolic=r"M = \frac{I}{I_{pickup}}",
        variables=(
            _v("M", "—", "Krotność prądu"),
            _v("I", "A", "Prąd pomiarowy (wtórny)"),
            _v("I_{pickup}", "A", "Nastawa rozruchowa (wtórna)"),
        ),
        source_norm="IEC 60255-151:2009",
    ),
    EquationEntryV2(
        eq_id="PROT_IEC_IDMT",
        label_pl="Czas zadziałania IDMT",
        description_pl="Czas zadziałania zabezpieczenia nadprądowego IDMT wg IEC",
        latex_symbolic=r"t = TMS \cdot \frac{A}{M^B - 1}",
        variables=(
            _v("t", "s", "Czas zadziałania"),
            _v("TMS", "—", "Mnożnik czasowy"),
            _v("A", "—", "Stała krzywej IEC"),
            _v("B", "—", "Wykładnik krzywej IEC"),
            _v("M", "—", "Krotność prądu"),
        ),
        source_norm="IEC 60255-151:2009 eq. (1)",
    ),
    EquationEntryV2(
        eq_id="PROT_F50_TRIP",
        label_pl="Decyzja zabezpieczenia 50 (I>>)",
        description_pl="Sprawdzenie warunku I > I_pickup dla funkcji 50",
        latex_symbolic=r"I > I_{pickup} \Rightarrow \text{TRIP w } t_{trip}",
        variables=(
            _v("I", "A", "Prąd pomiarowy (wtórny)"),
            _v("I_{pickup}", "A", "Nastawa rozruchowa (wtórna)"),
            _v("t_{trip}", "s", "Czas wyłączenia"),
        ),
        source_norm="ANSI/IEEE C37.2 — Function 50",
    ),
]

# ===========================================================================
# Load Flow Equations
# ===========================================================================

_LOAD_FLOW_EQUATIONS: list[EquationEntryV2] = [
    EquationEntryV2(
        eq_id="LF_CONVERGENCE",
        label_pl="Zbieżność iteracji",
        description_pl="Warunek zbieżności Newton-Raphson",
        latex_symbolic=r"\max(|\Delta P|, |\Delta Q|) < \varepsilon",
        variables=(
            _v("\\Delta P", "p.u.", "Mismatch mocy czynnej"),
            _v("\\Delta Q", "p.u.", "Mismatch mocy biernej"),
            _v("\\varepsilon", "p.u.", "Tolerancja zbieżności"),
        ),
        source_norm="Newton-Raphson Power Flow",
    ),
    EquationEntryV2(
        eq_id="LF_POWER_BALANCE_P",
        label_pl="Bilans mocy czynnej",
        description_pl="Suma mocy czynnej wstrzykniętej = suma strat + moc slack",
        latex_symbolic=r"\sum P_{inj} = \sum P_{loss} + P_{slack}",
        variables=(
            _v("P_{inj}", "MW", "Moc czynna wstrzyknięta"),
            _v("P_{loss}", "MW", "Straty mocy czynnej"),
            _v("P_{slack}", "MW", "Moc czynna slack"),
        ),
        source_norm="Newton-Raphson Power Flow",
    ),
    EquationEntryV2(
        eq_id="LF_POWER_BALANCE_Q",
        label_pl="Bilans mocy biernej",
        description_pl="Suma mocy biernej wstrzykniętej = suma strat + moc slack",
        latex_symbolic=r"\sum Q_{inj} = \sum Q_{loss} + Q_{slack}",
        variables=(
            _v("Q_{inj}", "Mvar", "Moc bierna wstrzyknięta"),
            _v("Q_{loss}", "Mvar", "Straty mocy biernej"),
            _v("Q_{slack}", "Mvar", "Moc bierna slack"),
        ),
        source_norm="Newton-Raphson Power Flow",
    ),
    EquationEntryV2(
        eq_id="LF_BUS_VOLTAGE",
        label_pl="Napięcie węzłowe",
        description_pl="Napięcie w węźle w jednostkach względnych",
        latex_symbolic=r"U_i = |V_i| \angle \theta_i",
        variables=(
            _v("U_i", "p.u.", "Napięcie węzła"),
            _v("|V_i|", "p.u.", "Moduł napięcia"),
            _v("\\theta_i", "rad", "Kąt napięcia"),
        ),
        source_norm="Newton-Raphson Power Flow",
    ),
    EquationEntryV2(
        eq_id="LF_BRANCH_FLOW",
        label_pl="Przepływ w gałęzi",
        description_pl="Moc przepływająca przez gałąź (P + jQ) z obliczeniem strat",
        latex_symbolic=r"S_{ij} = V_i \cdot (V_i - V_j)^* \cdot y_{ij}^*",
        variables=(
            _v("S_{ij}", "MVA", "Moc pozorna przepływu"),
            _v("V_i", "p.u.", "Napięcie węzła i"),
            _v("V_j", "p.u.", "Napięcie węzła j"),
            _v("y_{ij}", "p.u.", "Admitancja gałęzi"),
        ),
        source_norm="Newton-Raphson Power Flow",
    ),
    EquationEntryV2(
        eq_id="LF_BRANCH_LOSSES",
        label_pl="Straty w gałęzi",
        description_pl="Straty mocy w gałęzi = S_from + S_to",
        latex_symbolic=r"\Delta S_{ij} = S_{ij} + S_{ji}",
        variables=(
            _v("\\Delta S_{ij}", "MVA", "Straty w gałęzi"),
            _v("S_{ij}", "MVA", "Moc od strony i"),
            _v("S_{ji}", "MVA", "Moc od strony j"),
        ),
        source_norm="Newton-Raphson Power Flow",
    ),
]
