"""Weryfikacja jednostek dowodu: wzór w polu LaTeX, proza słowami (karta ZU, punkt 4).

KLASA. Krok dowodu „Weryfikacja jednostek" niósł algebrę jednostek zapisaną Unicode
(`kV / Ω = kA ✓`) w polu tekstowym, a eksport LaTeX stawiał ją w bloku `$$…$$` — `pdflatex`
z preambułą `inputenc`/T1 nie zna Ω ani ✓ w trybie matematycznym, KaTeX pokazywał znaki
z czcionki tekstowej, a znak „✓" był plakietką werdyktu bez wyjaśnienia. Teraz:
`EquationDefinition.unit_derivation_latex` i `UnitCheckResult.derivation_latex` są LaTeX-em
(blok wzoru), `UnitCheckResult.opis_pl` — słowami, wyprowadzonymi z tych samych pól, które
ocenia flaga `passed`.

ILOCZYN CECH: generator dowodu (SC3F, SC3F z maszynami, SC1 × trzy rodzaje zwarcia, VDROP,
rozpływ P32, prądy obciążenia linii i transformatora, Q(U), straty energii, rozpływ P14
zbieżny i niezbieżny, straty P16, nastawy zabezpieczeń, obwód nN, parametry linii 110 kV,
dobór aparatury) × format wyjścia (JSON, LaTeX, DOCX, inspektor) × gałąź opisu (zgodność,
niezgodność, nie dotyczy, brak reguły) × źródło wyprowadzenia (rejestr równań, rejestr linii
napowietrznych, weryfikator, kroki pakietów).
"""

from __future__ import annotations

import io
import json
import re
from collections.abc import Callable
from uuid import UUID

import pytest
from application.equipment_proof.generator import EquipmentProofGenerator
from application.proof_engine.equation_registry import EquationRegistry, registry
from application.proof_engine.latex_renderer import LaTeXRenderer
from application.proof_engine.packs.lv_circuit_verification import (
    LVCircuitVerificationProofPack,
)
from application.proof_engine.packs.p14_power_flow import P14PowerFlowProof
from application.proof_engine.packs.p16_losses import P16LossesProof
from application.proof_engine.packs.parametry_linii_110kv import ParametryLinii110kVProof
from application.proof_engine.packs.protection_settings import ProtectionSettingsProofPack
from application.proof_engine.proof_generator import ProofGenerator
from application.proof_engine.proof_inspector import ProofInspector
from application.proof_engine.proof_inspector.exporters import export_to_docx, export_to_tex
from application.proof_engine.registries.ohl_equations import OHL_EQUATIONS
from application.proof_engine.types import ProofDocument, UnitCheckResult
from application.proof_engine.unit_verifier import UnitVerifier
from application.proof_engine.zapis_jednostek import jednostka_latex

from tests.application.equipment_proof.test_equipment_proof import _base_input
from tests.proof_engine.test_dowod_parametrow_linii import ILOCZYN as ILOCZYN_LINII
from tests.proof_engine.test_dowod_parametrow_linii import _dane_dowodu, _wynik
from tests.proof_engine.test_inspector import qu_test_input  # noqa: F401 — fikstura
from tests.proof_engine.test_load_flow_voltage_proof_p32 import p32_input  # noqa: F401
from tests.proof_engine.test_losses_energy import _build_discrete_input
from tests.proof_engine.test_lv_circuit_verification_pack import _input as _wejscie_nn
from tests.proof_engine.test_p14_power_flow import (
    _build_converged_input,
    _build_non_converged_input,
)
from tests.proof_engine.test_p16_losses import _build_multi_branch_input
from tests.proof_engine.test_proof_engine import (  # noqa: F401 — fikstury
    lc_line_input,
    lc_transformer_input,
    sc1_test_input,
    sc3f_test_input,
    sc3f_with_machines,
    vdrop_test_input,
)
from tests.proof_engine.test_sc_asymmetrical_golden import FAULT_CASES, _sc1_input
from tests.test_proof_protection_settings import _make_input as _wejscie_nastaw

#: Polecenie `\text{…}` LaTeX-a — proza wewnątrz wzoru (litery polskie są tam dozwolone).
_TEKST_LATEX = re.compile(r"\\text\{[^{}]*\}")
#: Blok wzoru eksportu (`LaTeXRenderer._math_block`).
_BLOK_WZORU = re.compile(r"\$\$\n(.*?)\n\$\$", re.DOTALL)
#: Znak Unicode, którego kodowanie T1 nie zna nawet w `\text{}` (om, mikro, potęgi).
_ZNAK_POZA_T1 = re.compile(r"[ΩμµΣ²³⁻¹√✓✗·≤≥−→]")


def _ascii_poza_tekstem(latex: str) -> bool:
    return _TEKST_LATEX.sub("", latex).isascii()


def _nawiasy_zbilansowane(latex: str) -> bool:
    glebokosc = 0
    for znak in re.sub(r"\\[{}]", "", latex):
        glebokosc += {"{": 1, "}": -1}.get(znak, 0)
        if glebokosc < 0:
            return False
    return glebokosc == 0


def _poprawny_zapis_wzoru(latex: str) -> bool:
    return (
        _ascii_poza_tekstem(latex)
        and _nawiasy_zbilansowane(latex)
        and not any(_ZNAK_POZA_T1.search(t) for t in _TEKST_LATEX.findall(latex))
    )


# ---------------------------------------------------------------------------
# Źródła wyprowadzenia: rejestr równań, rejestr linii napowietrznych, weryfikator
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("rownanie", sorted(registry.values(), key=lambda e: e.equation_id))
def test_wyprowadzenie_kazdego_rownania_rejestru_jest_zapisem_latex(rownanie) -> None:
    zapis = rownanie.unit_derivation_latex
    assert zapis, f"{rownanie.equation_id}: brak wyprowadzenia jednostek"
    assert _poprawny_zapis_wzoru(zapis), f"{rownanie.equation_id}: {zapis!r}"


def test_rejestr_linii_napowietrznych_jest_w_rejestrze_rownan() -> None:
    for identyfikator in OHL_EQUATIONS:
        assert EquationRegistry.get_equation(identyfikator) is OHL_EQUATIONS[identyfikator]


def test_kazda_regula_weryfikatora_ma_wyprowadzenie_w_rejestrze() -> None:
    """Predykat parami: reguła jednostki wyniku ⇔ równanie z wyprowadzeniem w rejestrze."""
    for identyfikator, jednostka in UnitVerifier.JEDNOSTKA_WYNIKU.items():
        rownanie = EquationRegistry.get_equation(identyfikator)
        assert rownanie is not None, f"reguła {identyfikator} bez równania w rejestrze"
        wynik = UnitVerifier.verify_equation(identyfikator, {}, jednostka)
        assert wynik.passed
        assert wynik.derivation_latex == rownanie.unit_derivation_latex


def test_weryfikator_bez_reguly_nie_orzeka_zgodnosci() -> None:
    wynik = UnitVerifier.verify_equation("EQ_NIEZNANE_001", {"U": "kV"}, "kA")
    assert wynik.passed is False
    assert wynik.derivation_latex == ""
    assert "nie sprawdzono" in wynik.opis_pl


def test_weryfikator_zla_jednostka_wyniku_jest_niezgodnoscia() -> None:
    wynik = UnitVerifier.verify_equation("EQ_SC3F_004", {"U_n": "kV", "Z_th": "Ω"}, "MVA")
    assert wynik.passed is False
    assert wynik.derivation_latex == r"\mathrm{kV}/\Omega = \mathrm{kA}"
    assert wynik.opis_pl == (
        "Niezgodność jednostek: jednostka wyprowadzona z jednostek danych (kA) różni się "
        "od jednostki wyniku (MVA)."
    )


@pytest.mark.parametrize(
    ("passed", "wyprowadzenie", "poczatek"),
    [
        (True, r"\Omega = \Omega", "Zgodność jednostek: "),
        (False, r"\Omega = \Omega", "Niezgodność jednostek: "),
        (True, "", "Weryfikacja jednostek nie dotyczy tego kroku"),
        (False, "", "Brak reguły wyprowadzenia jednostek"),
    ],
)
def test_opis_weryfikacji_ma_cztery_rozlaczne_galezie(
    passed: bool, wyprowadzenie: str, poczatek: str
) -> None:
    wynik = UnitCheckResult(
        passed=passed, expected_unit="Ω", computed_unit="—", derivation_latex=wyprowadzenie
    )
    assert wynik.opis_pl.startswith(poczatek)
    if wyprowadzenie:
        assert "(bez jednostki)" in wynik.opis_pl and "(Ω)" in wynik.opis_pl
    assert wynik.to_dict()["opis_pl"] == wynik.opis_pl
    assert "derivation" not in wynik.to_dict()


@pytest.mark.parametrize(
    "jednostka", sorted({s.unit for e in registry.values() for s in e.symbols})
)
def test_jednostka_kazdego_symbolu_rejestru_ma_zapis_latex_ascii(jednostka: str) -> None:
    zapis = jednostka_latex(jednostka)
    assert _poprawny_zapis_wzoru(zapis), f"{jednostka!r} → {zapis!r}"


# ---------------------------------------------------------------------------
# Generator × format wyjścia
# ---------------------------------------------------------------------------

Budowniczy = Callable[[pytest.FixtureRequest], ProofDocument]

GENERATORY: dict[str, Budowniczy] = {
    "sc3f": lambda r: ProofGenerator.generate_sc3f_proof(r.getfixturevalue("sc3f_test_input")),
    "sc3f_maszyny": lambda r: ProofGenerator.generate_sc3f_proof(
        r.getfixturevalue("sc3f_with_machines")
    ),
    **{
        f"sc1_{klucz}": (
            lambda r, k=klucz: ProofGenerator.generate_sc1_proof(_sc1_input(FAULT_CASES[k], k))
        )
        for klucz in FAULT_CASES
    },
    "vdrop": lambda r: ProofGenerator.generate_vdrop_proof(r.getfixturevalue("vdrop_test_input")),
    "rozplyw_p32": lambda r: ProofGenerator.generate_load_flow_voltage_proof(
        r.getfixturevalue("p32_input")
    ),
    "obciazenie_linii": lambda r: ProofGenerator.generate_load_currents_proof(
        r.getfixturevalue("lc_line_input")
    ),
    "obciazenie_transformatora": lambda r: ProofGenerator.generate_load_currents_proof(
        r.getfixturevalue("lc_transformer_input")
    ),
    "regulacja_q_u": lambda r: ProofGenerator.generate_qu_proof(r.getfixturevalue("qu_test_input")),
    "straty_energii": lambda r: ProofGenerator.generate_losses_energy_proof(
        _build_discrete_input()
    ),
    "rozplyw_p14_zbiezny": lambda r: P14PowerFlowProof.generate(_build_converged_input()),
    "rozplyw_p14_niezbiezny": lambda r: P14PowerFlowProof.generate(_build_non_converged_input()),
    "straty_p16": lambda r: P16LossesProof.generate(_build_multi_branch_input()),
    "nastawy": lambda r: ProtectionSettingsProofPack.generate(_wejscie_nastaw()).proof,
    "obwod_nn": lambda r: LVCircuitVerificationProofPack.generate(_wejscie_nn()),
    "linia_110kv": lambda r: ParametryLinii110kVProof.generate(
        _dane_dowodu(_wynik(*ILOCZYN_LINII[0])), UUID(int=1)
    ),
    "aparatura": lambda r: EquipmentProofGenerator.generate(_base_input()).proof_document,
}


@pytest.fixture(params=sorted(GENERATORY))
def dokument(request: pytest.FixtureRequest) -> ProofDocument:
    return GENERATORY[request.param](request)


def test_json_kroku_niesie_wzor_w_polu_latex_i_proze(dokument: ProofDocument) -> None:
    payload = json.loads(dokument.json_representation)
    assert payload["steps"], "dokument bez kroków"
    for krok in payload["steps"]:
        jednostki = krok["unit_check"]
        assert "derivation" not in jednostki
        assert "unit_derivation" not in krok["equation"]
        assert _poprawny_zapis_wzoru(jednostki["derivation_latex"])
        assert _poprawny_zapis_wzoru(krok["equation"]["unit_derivation_latex"])
        assert jednostki["opis_pl"]
        assert "✓" not in jednostki["opis_pl"] and "✗" not in jednostki["opis_pl"]


def test_latex_kroku_proza_slowami_a_wyprowadzenie_blokiem_wzoru(dokument: ProofDocument) -> None:
    tex = export_to_tex(dokument)
    for blok in _BLOK_WZORU.findall(tex):
        assert _poprawny_zapis_wzoru(blok), f"blok wzoru spoza ASCII: {blok[:160]!r}"
    for krok in dokument.steps:
        uc = krok.unit_check
        assert f"\\textbf{{Weryfikacja jednostek:}} {LaTeXRenderer._escape(uc.opis_pl)}" in tex
        if uc.derivation_latex:
            assert f"$$\n{uc.derivation_latex}\n$$" in tex
    assert "✓" not in tex and "✗" not in tex


def test_docx_kroku_proza_i_wyprowadzenie(dokument: ProofDocument) -> None:
    from docx import Document

    tekst = "\n".join(
        akapit.text for akapit in Document(io.BytesIO(export_to_docx(dokument))).paragraphs
    )
    for krok in dokument.steps:
        uc = krok.unit_check
        assert f"Weryfikacja jednostek: {uc.opis_pl}" in tekst
        if uc.derivation_latex:
            assert f"Wyprowadzenie jednostek: {uc.derivation_latex}" in tekst


def test_inspektor_kroku_proza_i_wyprowadzenie(dokument: ProofDocument) -> None:
    kroki_widoku = ProofInspector(dokument).get_steps()
    for krok, krok_widoku in zip(dokument.steps, kroki_widoku, strict=True):
        jednostki = krok_widoku.unit_check.to_dict()
        assert jednostki["derivation_latex"] == krok.unit_check.derivation_latex
        assert jednostki["opis_pl"] == krok.unit_check.opis_pl
        assert "derivation" not in jednostki


def test_dobor_aparatury_kroki_stanu_nie_maja_bloku_wyprowadzenia() -> None:
    dokument = EquipmentProofGenerator.generate(_base_input()).proof_document
    tex = export_to_tex(dokument)
    for krok in dokument.steps:
        assert krok.unit_check.derivation_latex == ""
        assert krok.unit_check.opis_pl.startswith("Weryfikacja jednostek nie dotyczy")
    assert "\\textbf{Weryfikacja jednostek:} Weryfikacja jednostek nie dotyczy" in tex
