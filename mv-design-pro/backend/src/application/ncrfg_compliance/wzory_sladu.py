"""Zapis LaTeX wzorów śladu WHITE BOX testów NC RfG / PTPiREE (kontrakt prezentacji inżynierskiej).

DLACZEGO W WARSTWIE APLIKACJI. Ślad testów zgodności (`NcRfgTraceStep.formula`) pochodzi
z rdzenia B-01 (`network_model/solvers/ncrfg_ptpiree/engine.py`), który pisze wzór jako
zwięzły zapis ASCII/Unicode czytelny w audycie tekstowym (np. „t_zap ≤ t_max"). Kryterium
kontraktu prezentacji: każdy wzór i symbol z indeksem, który projektant widzi, renderuje się
przez KaTeX. Zmiana zapisu w rdzeniu byłaby zmianą rdzenia B-01, a dodanie pola do kontraktu
`NcRfgTraceStep` — zmianą kontraktu rdzenia. Rozwiązanie wzorowane na
`application/analyses/v126_wzory.py`: rejestr ZAPIS WZORU RDZENIA → LaTeX, wydawany przez
katalog testów (`GET /api/ncrfg-tests/catalog`, pole `wzory_sladu_latex`); widok śladu
(`ui2/oze/macierz/SladTestu.tsx`) renderuje LaTeX przez `MathBlock`.

ZERO FABRYKACJI. Każdy wpis jest WIERNYM zapisem TEGO SAMEGO wzoru, który rdzeń stawia
w `formula` — kluczem jest dokładny tekst rdzenia, więc zmiana wzoru w rdzeniu bez zmiany
tutaj zostawia krok bez LaTeX i czerwieni test kompletności
(`tests/application/ncrfg_compliance/test_wzory_sladu.py`: zbiór zapisów wzorów
wyprowadzony z AST rdzenia, z obiema gałęziami wyrażeń warunkowych, równa się zbiorowi
kluczy tego rejestru — w obie strony).
"""

from __future__ import annotations

from types import MappingProxyType
from typing import Final

_ZAPISY: dict[str, str] = {
    (
        "wymagany = wymuszony ∨ (klasa ∧ technologia ∧ ¬istniejący ∧ (wykazuje wymaganie "
        "przez test ∨ zakres procedury ∨ brak certyfikatu obejmującego typ ∨ zdolność "
        "dodatkowa programu))"
    ): (
        r"\text{wymagany} = \text{wymuszony} \lor \left(\text{klasa} \land \text{technologia} "
        r"\land \lnot\,\text{istniejący} \land \left(\text{wymaganie przez test} \lor "
        r"\text{zakres procedury} \lor \text{brak certyfikatu typu} \lor "
        r"\text{zdolność dodatkowa}\right)\right)"
    ),
    (
        "status = reguła K kontraktu werdyktu (stosowalność → metoda → wynik → podstawa "
        "→ niejednoznaczność → margines)"
    ): (
        r"\text{status} = K\left(\text{stosowalność} \rightarrow \text{metoda} \rightarrow "
        r"\text{wynik} \rightarrow \text{podstawa} \rightarrow \text{niejednoznaczność} "
        r"\rightarrow \text{margines}\right)"
    ),
    ("ΔP = Pmax · min(1, max(|f − f_n| − db, 0) / (f_n · s)); kryterium: |s − s_wym| ≤ Δs"): (
        r"\Delta P = P_{\max} \cdot \min\left(1, \frac{\max\left(\left|f - f_{n}\right| - "
        r"d_{b}, 0\right)}{f_{n} \cdot s}\right), \quad \left|s - s_{wym}\right| \le \Delta s"
    ),
    "r ≥ k_r · r_wym": r"r \ge k_{r} \cdot r_{wym}",
    "t = (1 − u) / r ≤ max(k · (1 − u) / r_wym, t_min)": (
        r"t = \frac{1 - u}{r} \le \max\left(k \cdot \frac{1 - u}{r_{wym}}, t_{\min}\right)"
    ),
    (
        "zapas_dolny = Q_wym,min − Q_min; zapas_gorny = Q_max − Q_wym,max; orzeka "
        "strona o mniejszym zapasie"
    ): (
        r"\Delta Q_{dolny} = Q_{wym,\min} - Q_{\min}, \quad \Delta Q_{\text{górny}} = Q_{\max} - "
        r"Q_{wym,\max}, \quad \text{orzeka strona o mniejszym zapasie}"
    ),
    "cosφ_min,moduł ≤ cosφ_min,wym": (
        r"\cos\varphi_{\min,\text{moduł}} \le \cos\varphi_{\min,wym}"
    ),
    "t_zap ≤ t_max": r"t_{zap} \le t_{\max}",
    "moduł przyłączony ∀t, gdy U(t) ≥ U_obwiedni(t)": (
        r"\text{moduł przyłączony}\ \forall t: \ U(t) \ge U_{obwiedni}(t)"
    ),
    "moduł przyłączony ∀t, gdy U(t) ≤ U_obwiedni(t)": (
        r"\text{moduł przyłączony}\ \forall t: \ U(t) \le U_{obwiedni}(t)"
    ),
    "t_odb ≤ t_odb,wym (wymaga przebiegu P(t) z biegu dynamiki)": (
        r"t_{odb} \le t_{odb,wym} \quad \text{(wymaga przebiegu } P(t) \text{ z biegu dynamiki)}"
    ),
    "K_FRT ≥ K_min (wymaga przebiegu I_q(t) z biegu dynamiki)": (
        r"K_{\mathrm{FRT}} \ge K_{\min} \quad \text{(wymaga przebiegu } I_{q}(t) "
        r"\text{ z biegu dynamiki)}"
    ),
    "każda wymagana zdolność dodatkowa realizowana (wymaga biegu dynamiki)": (
        r"\forall\ \text{wymagana zdolność dodatkowa: realizowana} \quad "
        r"\text{(wymaga biegu dynamiki)}"
    ),
    "THD_U ≤ THD_U,max": r"THD_{U} \le THD_{U,\max}",
}

#: Zapis wzoru rdzenia (dokładny tekst `NcRfgTraceStep.formula`) → LaTeX tego samego wzoru.
WZORY_SLADU_LATEX: Final = MappingProxyType(_ZAPISY)


def wzor_sladu_latex(zapis_rdzenia: str) -> str | None:
    """LaTeX wzoru kroku śladu albo ``None`` dla zapisu spoza rejestru (test kompletności
    pilnuje, że rdzeń nie stawia takiego zapisu)."""
    return WZORY_SLADU_LATEX.get(zapis_rdzenia)
