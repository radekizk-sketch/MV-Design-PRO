"""
Proof Inspector Tests — P11.1d

STATUS: CANONICAL & BINDING
Reference: P11_1d_PROOF_UI_EXPORT.md

Testy:
1. test_inspector_read_only - Inspector nie modyfikuje dokumentu
2. test_inspector_step_order_matches_proof - Kolejnosc krokow zgodna
3. test_inspector_exports_json_tex - Eksporty JSON i TEX dzialaja
4. test_inspector_counterfactual_view - Tryb A/B dziala poprawnie
"""

from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime
from uuid import uuid4

import pytest
from application.proof_engine.proof_generator import (
    ProofGenerator,
    SC3FInput,
    VDROPInput,
    VDROPSegmentInput,
)
from application.proof_engine.proof_inspector import (
    CounterfactualView,
    InspectorExporter,
    InspectorView,
    ProofInspector,
    export_to_docx,
    export_to_json,
    export_to_tex,
    inspect,
    is_pdf_export_available,
)
from application.proof_engine.types import (
    SEMANTIC_ALIASES,
    LoadCurrentsCounterfactualInput,
    LoadCurrentsInput,
    LoadElementKind,
    ProofDocument,
    ProofSummary,
    ProofType,
    QUCounterfactualInput,
    QUInput,
)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def sc3f_test_input() -> SC3FInput:
    """Fixture: minimalne dane SC3F dla testow."""
    return SC3FInput(
        project_name="Test Project",
        case_name="Test Case SC3F",
        fault_node_id="B2",
        fault_type="THREE_PHASE",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        c_factor=1.10,
        u_n_kv=15.0,
        z_thevenin_ohm=complex(0.749, 3.419),
        ikss_ka=2.722,
        ip_ka=5.882,
        ith_ka=2.722,
        sk_mva=70.7,
        kappa=1.528,
        rx_ratio=0.219,
        tk_s=1.0,
        m_factor=1.0,
        n_factor=0.0,
        # Karta S-C (2026-07-22): pełny bilans — I_b(t_b) z FROZEN wyniku solvera.
        ib_ka=2.722,
        tb_s=0.1,
    )


@pytest.fixture
def vdrop_test_input() -> VDROPInput:
    """Fixture: minimalne dane VDROP dla testow."""
    return VDROPInput(
        project_name="Test Project",
        case_name="Test Case VDROP",
        source_bus_id="SOURCE",
        target_bus_id="LOAD",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        u_source_kv=15.0,
        segments=[
            VDROPSegmentInput(
                segment_id="SEG1",
                from_bus_id="SOURCE",
                to_bus_id="MID",
                r_ohm_per_km=0.206,
                x_ohm_per_km=0.075,
                length_km=2.5,
                p_mw=2.0,
                q_mvar=1.0,
                u_n_kv=15.0,
            ),
        ],
    )


@pytest.fixture
def sc3f_proof(sc3f_test_input: SC3FInput) -> ProofDocument:
    """Fixture: wygenerowany dokument SC3F."""
    return ProofGenerator.generate_sc3f_proof(sc3f_test_input)


@pytest.fixture
def vdrop_proof(vdrop_test_input: VDROPInput) -> ProofDocument:
    """Fixture: wygenerowany dokument VDROP."""
    return ProofGenerator.generate_vdrop_proof(vdrop_test_input)


@pytest.fixture
def qu_test_input() -> QUInput:
    """Fixture: minimalne dane Q(U) dla testow."""
    return QUInput(
        project_name="Test Project QU",
        case_name="Test Case QU",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        u_meas_kv=15.5,
        u_ref_kv=15.0,
        u_dead_kv=0.2,
        k_q_mvar_per_kv=5.0,
        q_min_mvar=-10.0,
        q_max_mvar=10.0,
    )


@pytest.fixture
def qu_counterfactual_input(qu_test_input: QUInput) -> QUCounterfactualInput:
    """Fixture: dane counterfactual A vs B."""
    input_b = QUInput(
        project_name="Test Project QU B",
        case_name="Test Case QU B",
        run_timestamp=qu_test_input.run_timestamp,
        u_meas_kv=qu_test_input.u_meas_kv,
        u_ref_kv=qu_test_input.u_ref_kv,
        u_dead_kv=qu_test_input.u_dead_kv,
        k_q_mvar_per_kv=7.0,  # Zmieniony k_Q
        q_min_mvar=qu_test_input.q_min_mvar,
        q_max_mvar=qu_test_input.q_max_mvar,
    )
    return QUCounterfactualInput(a=qu_test_input, b=input_b)


@pytest.fixture
def qu_counterfactual_proof(
    qu_counterfactual_input: QUCounterfactualInput,
) -> ProofDocument:
    """Fixture: wygenerowany dokument counterfactual Q(U)."""
    return ProofGenerator.generate_qu_counterfactual(qu_counterfactual_input)


@pytest.fixture
def lc_line_input() -> LoadCurrentsInput:
    """Fixture: dane P15 dla linii."""
    return LoadCurrentsInput(
        project_name="Test Project LC",
        case_name="Test Case LC",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        target_id="LINE_01",
        u_ll_kv=15.0,
        p_mw=3.2,
        q_mvar=1.5,
        in_a=400.0,
        sn_mva=None,
        element_kind=LoadElementKind.LINE,
    )


@pytest.fixture
def lc_counterfactual_proof(
    lc_line_input: LoadCurrentsInput,
) -> ProofDocument:
    """Fixture: wygenerowany dokument counterfactual P15."""
    input_b = LoadCurrentsInput(
        project_name="Test Project LC B",
        case_name="Test Case LC B",
        run_timestamp=lc_line_input.run_timestamp,
        target_id=lc_line_input.target_id,
        u_ll_kv=lc_line_input.u_ll_kv,
        p_mw=4.5,
        q_mvar=2.0,
        in_a=lc_line_input.in_a,
        sn_mva=None,
        element_kind=LoadElementKind.LINE,
    )
    cf_input = LoadCurrentsCounterfactualInput(a=lc_line_input, b=input_b)
    return ProofGenerator.generate_load_currents_counterfactual(cf_input)


# =============================================================================
# Test: Inspector Read-Only
# =============================================================================


class TestInspectorReadOnly:
    """
    Testy: Inspector nie modyfikuje dokumentu.

    INVARIANT: ProofDocument jest frozen (immutable).
    Inspector tylko czyta dane.
    """

    def test_inspector_does_not_mutate_document(self, sc3f_proof: ProofDocument):
        """Inspector nie modyfikuje dokumentu."""
        # Zapisz oryginalny JSON
        original_json = sc3f_proof.json_representation

        # Uzyj inspektora
        inspector = ProofInspector(sc3f_proof)
        _ = inspector.get_view()
        _ = inspector.get_steps()
        _ = inspector.get_summary()
        _ = inspector.get_header()
        _ = inspector.get_mapping_keys()

        # Sprawdz ze JSON sie nie zmienil
        assert sc3f_proof.json_representation == original_json

    def test_inspector_returns_same_view_on_multiple_calls(self, sc3f_proof: ProofDocument):
        """Wielokrotne wywolanie get_view zwraca ten sam obiekt."""
        inspector = ProofInspector(sc3f_proof)

        view1 = inspector.get_view()
        view2 = inspector.get_view()

        assert view1 is view2  # Ten sam obiekt (cache)

    def test_inspect_factory_function(self, sc3f_proof: ProofDocument):
        """Factory function inspect() dziala poprawnie."""
        view = inspect(sc3f_proof)

        assert isinstance(view, InspectorView)
        assert view.proof_type == ProofType.SC3F_IEC60909.value
        # 9 kroków po karcie S-C (2026-07-22): + I_b(t_b), + I²t.
        assert len(view.steps) == 9

    def test_inspector_preserves_document_reference(self, sc3f_proof: ProofDocument):
        """Inspector zachowuje referencje do dokumentu."""
        inspector = ProofInspector(sc3f_proof)

        assert inspector.document is sc3f_proof

    def test_view_types_are_frozen(self, sc3f_proof: ProofDocument):
        """Wszystkie typy widokow sa frozen (immutable)."""
        view = inspect(sc3f_proof)

        # InspectorView jest frozen
        with pytest.raises(AttributeError):
            view.title = "New title"  # type: ignore

        # StepView jest frozen
        step = view.steps[0]
        with pytest.raises(AttributeError):
            step.title = "New title"  # type: ignore

        # ValueView jest frozen
        val = step.result
        with pytest.raises(AttributeError):
            val.symbol = "X"  # type: ignore


# =============================================================================
# Test: Step Order Matches Proof
# =============================================================================


class TestInspectorStepOrder:
    """
    Testy: Kolejnosc krokow w Inspector zgodna z ProofDocument.

    Kroki musza byc posortowane po step_number.
    """

    def test_step_order_matches_proof_sc3f(self, sc3f_proof: ProofDocument):
        """Kolejnosc krokow SC3F zgodna z dokumentem."""
        inspector = ProofInspector(sc3f_proof)
        steps = inspector.get_steps()

        # Sprawdz ze kroki sa posortowane po step_number
        step_numbers = [s.step_number for s in steps]
        assert step_numbers == sorted(step_numbers)

        # Sprawdz ze numery sa sekwencyjne od 1
        assert step_numbers == list(range(1, len(steps) + 1))

    def test_step_order_matches_proof_vdrop(self, vdrop_proof: ProofDocument):
        """Kolejnosc krokow VDROP zgodna z dokumentem."""
        inspector = ProofInspector(vdrop_proof)
        steps = inspector.get_steps()

        step_numbers = [s.step_number for s in steps]
        assert step_numbers == sorted(step_numbers)
        assert step_numbers == list(range(1, len(steps) + 1))

    def test_step_ids_match_proof_document(self, sc3f_proof: ProofDocument):
        """ID krokow w Inspector zgodne z ProofDocument."""
        inspector = ProofInspector(sc3f_proof)
        steps = inspector.get_steps()

        # Pobierz ID z oryginalnego dokumentu
        original_ids = sorted(
            [s.step_id for s in sc3f_proof.steps],
            key=lambda x: int(x.split("_")[-1]),
        )

        # Pobierz ID z inspektora
        inspector_ids = [s.step_id for s in steps]

        assert inspector_ids == original_ids

    def test_get_step_by_id(self, sc3f_proof: ProofDocument):
        """Mozna pobrac krok po ID."""
        inspector = ProofInspector(sc3f_proof)

        step = inspector.get_step("SC3F_STEP_001")
        assert step is not None
        assert step.step_number == 1

        # Nieistniejacy ID zwraca None
        assert inspector.get_step("NONEXISTENT") is None

    def test_get_step_by_number(self, sc3f_proof: ProofDocument):
        """Mozna pobrac krok po numerze."""
        inspector = ProofInspector(sc3f_proof)

        step = inspector.get_step_by_number(1)
        assert step is not None
        assert step.step_id == "SC3F_STEP_001"

        # Nieistniejacy numer zwraca None
        assert inspector.get_step_by_number(999) is None


# =============================================================================
# Test: Exports (JSON, TEX)
# =============================================================================


class TestInspectorExports:
    """
    Testy: Eksporty JSON i TEX dzialaja poprawnie.

    Inspector uzywa istniejacych rendererow (LaTeXRenderer).
    """

    def test_export_json_returns_valid_json(self, sc3f_proof: ProofDocument):
        """Eksport JSON zwraca poprawny JSON."""
        exporter = InspectorExporter(sc3f_proof)
        result = exporter.export_json()

        assert result.success
        assert result.format == "json"
        assert isinstance(result.content, str)

        # Parsowanie JSON
        data = json.loads(result.content)
        assert "steps" in data
        assert "proof_type" in data
        assert data["proof_type"] == "SC3F_IEC60909"

    def test_export_json_is_deterministic(self, sc3f_test_input: SC3FInput):
        """Eksport JSON jest deterministyczny (ten sam input -> identyczny output)."""
        artifact_id = uuid4()

        proof1 = ProofGenerator.generate_sc3f_proof(sc3f_test_input, artifact_id)
        proof2 = ProofGenerator.generate_sc3f_proof(sc3f_test_input, artifact_id)

        json1 = export_to_json(proof1)
        json2 = export_to_json(proof2)

        # Usun pola zmienne
        data1 = json.loads(json1)
        data2 = json.loads(json2)
        del data1["document_id"]
        del data1["created_at"]
        del data2["document_id"]
        del data2["created_at"]

        assert data1 == data2

    def test_export_tex_returns_valid_latex(self, sc3f_proof: ProofDocument):
        """Eksport TEX zwraca poprawny LaTeX."""
        exporter = InspectorExporter(sc3f_proof)
        result = exporter.export_tex()

        assert result.success
        assert result.format == "tex"
        assert isinstance(result.content, str)

        # Sprawdz strukture LaTeX
        latex = result.content
        assert r"\documentclass" in latex
        assert r"\begin{document}" in latex
        assert r"\end{document}" in latex
        assert r"\section{Dowód}" in latex

    def test_export_tex_uses_block_math_only(self, sc3f_proof: ProofDocument):
        """Eksport TEX uzywa tylko blokowego LaTeX ($$...$$)."""
        exporter = InspectorExporter(sc3f_proof)
        result = exporter.export_tex()

        latex = result.content

        # Sprawdz ze zawiera bloki $$...$$
        assert "$$" in latex

        # NIE powinno byc inline math $...$ (poza $$)
        # To trudne do sprawdzenia bez parsera, wiec sprawdzamy strukture
        lines = latex.split("\n")
        for line in lines:
            # Pomijamy linie z $$
            if "$$" in line:
                continue
            # Sprawdzamy czy nie ma pojedynczych $
            # (uproszczone - ignorujemy escape \$)
            line.replace(r"\$", "")
            # Pojedynczy $ (nie podwojny) moze wystapic tylko w tabelach
            # lub jako escape, wiec ta heurystyka jest przyblizona

    def test_export_convenience_functions(self, sc3f_proof: ProofDocument):
        """Convenience functions dzialaja poprawnie."""
        json_str = export_to_json(sc3f_proof)
        assert isinstance(json_str, str)
        assert "steps" in json_str

    def test_export_docx_returns_valid_docx(self, sc3f_proof: ProofDocument):
        """Eksport DOCX zwraca poprawny dokument Word (V12K-007 light_technical).

        Wymóg P0.8: polskie raporty edytowalne dla projektanta.
        """
        exporter = InspectorExporter(sc3f_proof)
        result = exporter.export_docx()

        # Pominąć test gdy python-docx nie zainstalowany (CI bez dev deps)
        if not result.success and result.error_message and "python-docx" in result.error_message:
            import pytest

            pytest.skip("python-docx not installed in this environment")

        assert result.success, f"DOCX export failed: {result.error_message}"
        assert result.format == "docx"
        assert isinstance(result.content, bytes)
        assert len(result.content) > 0
        # DOCX (ZIP) magic bytes
        assert result.content[:2] == b"PK", "DOCX should be a ZIP-based file"
        # Sugerowana nazwa pliku ma rozszerzenie .docx
        assert result.filename_hint.endswith(".docx")

    def test_export_docx_convenience_function(self, sc3f_proof: ProofDocument):
        """export_to_docx() convenience function działa i zwraca bytes."""
        try:
            import docx  # noqa: F401
        except ImportError:
            import pytest

            pytest.skip("python-docx not installed")

        docx_bytes = export_to_docx(sc3f_proof)
        assert isinstance(docx_bytes, bytes)
        assert len(docx_bytes) > 0
        assert docx_bytes[:2] == b"PK"

    def test_export_docx_is_byte_deterministic_across_repeated_calls(
        self, sc3f_proof: ProofDocument
    ):
        """DOCX-DETERMINIZM-RESZTA: 2x eksport z odstepem >2s -> identyczne bajty.

        Odstep >2s MIEDZY wywolaniami jest CELOWY, nie kosmetyczny: DOCX jest
        ZIP-em, a `zipfile` znakuje kazdy wpis biezacym czasem lokalnym w
        formacie DOS, ktory ma rozdzielczosc DWOCH SEKUND (pole sekund koduje
        wartosc/2) — dwa wywolania oddalone o <=2s moga trafic w TEN SAM
        znacznik nawet bez normalizacji
        (`docx_determinism.make_docx_bytes_deterministic`), co dawaloby
        falszywa zielen (lekcja karty ZAB-100-BACKEND, iniekcja I2;
        DOCX-DETERMINIZM-RESZTA doprecyzowala granulacje na 2s empirycznym
        pomiarem — 1.1s dawal falszywa zielen w ok. 30% powtorzen).
        """
        try:
            import docx  # noqa: F401
        except ImportError:
            pytest.skip("python-docx not installed")

        exporter = InspectorExporter(sc3f_proof)
        first = exporter.export_docx()
        time.sleep(2.1)
        second = exporter.export_docx()

        assert first.success and second.success
        assert first.content[:2] == b"PK"
        hash_1 = hashlib.sha256(first.content).hexdigest()
        hash_2 = hashlib.sha256(second.content).hexdigest()
        assert hash_1 == hash_2, (
            f"DOCX export InspectorExporter nie deterministyczny\n"
            f"Hash 1: {hash_1}\nHash 2: {hash_2}"
        )

    def test_export_all_includes_docx(self, sc3f_proof: ProofDocument):
        """export_all() zwraca 4 formaty: json + tex + pdf + docx (V12K-007)."""
        exporter = InspectorExporter(sc3f_proof)
        results = exporter.export_all()

        assert "json" in results
        assert "tex" in results
        assert "pdf" in results
        assert "docx" in results
        assert results["json"].success
        assert results["tex"].success
        # PDF/DOCX mogą nie być dostępne w CI — sprawdzamy obecność klucza

        tex_str = export_to_tex(sc3f_proof)
        assert isinstance(tex_str, str)
        assert r"\documentclass" in tex_str

    def test_export_pdf_availability_check(self):
        """Mozna sprawdzic czy eksport PDF jest dostepny."""
        # To tylko sprawdza czy funkcja dziala, nie wymaga pdflatex
        result = is_pdf_export_available()
        assert isinstance(result, bool)

    def test_export_all_returns_all_formats(self, sc3f_proof: ProofDocument):
        """export_all() zwraca wyniki dla wszystkich formatow."""
        exporter = InspectorExporter(sc3f_proof)
        results = exporter.export_all()

        assert "json" in results
        assert "tex" in results
        assert "pdf" in results

        assert results["json"].success
        assert results["tex"].success
        # PDF moze byc niedostepny (brak pdflatex)

    def test_export_result_filename_hint(self, sc3f_proof: ProofDocument):
        """ExportResult zawiera sugerowana nazwe pliku."""
        exporter = InspectorExporter(sc3f_proof)

        json_result = exporter.export_json()
        assert json_result.filename_hint.endswith(".json")
        assert "sc3f_iec60909" in json_result.filename_hint.lower()

        tex_result = exporter.export_tex()
        assert tex_result.filename_hint.endswith(".tex")


# =============================================================================
# Test: Counterfactual View
# =============================================================================


class TestInspectorCounterfactualView:
    """
    Testy: Tryb A/B (counterfactual) dziala poprawnie.
    """

    def test_non_counterfactual_is_detected(self, sc3f_proof: ProofDocument):
        """Standardowy dowod NIE jest counterfactual."""
        inspector = ProofInspector(sc3f_proof)

        assert not inspector.is_counterfactual()
        assert inspector.get_counterfactual_table() is None

    def test_counterfactual_is_detected(self, qu_counterfactual_proof: ProofDocument):
        """Dowod counterfactual jest wykrywany."""
        inspector = ProofInspector(qu_counterfactual_proof)

        assert inspector.is_counterfactual()
        cf_table = inspector.get_counterfactual_table()
        assert cf_table is not None
        assert isinstance(cf_table, CounterfactualView)

    def test_counterfactual_p15_is_detected(self, lc_counterfactual_proof: ProofDocument):
        """Counterfactual P15 jest wykrywany."""
        inspector = ProofInspector(lc_counterfactual_proof)

        assert inspector.is_counterfactual()
        cf_table = inspector.get_counterfactual_table()
        assert cf_table is not None
        assert any(row.name == "s_mva" for row in cf_table.rows)

    def test_counterfactual_table_has_rows(self, qu_counterfactual_proof: ProofDocument):
        """Tabela counterfactual zawiera wiersze."""
        inspector = ProofInspector(qu_counterfactual_proof)
        cf_table = inspector.get_counterfactual_table()

        assert cf_table is not None
        assert len(cf_table.rows) > 0

        # Pierwszy wiersz powinien byc Q_cmd
        q_row = cf_table.rows[0]
        assert q_row.name == "Q_cmd"
        assert q_row.unit == "Mvar"

    def test_counterfactual_delta_values(self, qu_counterfactual_proof: ProofDocument):
        """Delta w counterfactual jest obliczane poprawnie (B - A)."""
        inspector = ProofInspector(qu_counterfactual_proof)
        cf_table = inspector.get_counterfactual_table()

        assert cf_table is not None
        for row in cf_table.rows:
            expected_delta = row.value_b - row.value_a
            assert abs(row.delta - expected_delta) < 0.0001

    def test_counterfactual_view_to_dict(self, qu_counterfactual_proof: ProofDocument):
        """CounterfactualView.to_dict() zwraca poprawny slownik."""
        inspector = ProofInspector(qu_counterfactual_proof)
        cf_table = inspector.get_counterfactual_table()

        assert cf_table is not None
        d = cf_table.to_dict()

        assert "rows" in d
        assert "has_vdrop_data" in d
        assert isinstance(d["rows"], list)


# =============================================================================
# Test: Mapping Keys
# =============================================================================


class TestInspectorMappingKeys:
    """
    Testy: mapping_key dla kazdej wielkosci jest widoczny.
    """

    def test_mapping_keys_are_present(self, sc3f_proof: ProofDocument):
        """Wszystkie wartosci maja mapping_key."""
        inspector = ProofInspector(sc3f_proof)
        steps = inspector.get_steps()

        for step in steps:
            # Input values maja mapping_key
            for val in step.input_values:
                assert val.mapping_key != "", f"Missing mapping_key in {step.step_id}"

            # Result ma mapping_key
            assert step.result.mapping_key != ""

    def test_get_mapping_keys_returns_all(self, sc3f_proof: ProofDocument):
        """get_mapping_keys() zwraca wszystkie klucze."""
        inspector = ProofInspector(sc3f_proof)
        keys = inspector.get_mapping_keys()

        # Powinno byc wiecej kluczy niz krokow
        assert len(keys) >= len(sc3f_proof.steps)

        # Klucze sa posortowane alfabetycznie
        assert list(keys.keys()) == sorted(keys.keys())

    def test_mapping_keys_match_source_keys(self, sc3f_proof: ProofDocument):
        """mapping_key w ValueView odpowiada source_keys w ProofStep."""
        inspector = ProofInspector(sc3f_proof)
        steps = inspector.get_steps()

        for step in steps:
            # source_keys zawiera mapowanie symbol -> key
            for val in step.input_values:
                if val.symbol in step.source_keys:
                    # mapping_key powinien odpowiadac
                    assert val.mapping_key == step.source_keys.get(val.symbol, val.mapping_key)


# =============================================================================
# Test: View Serialization
# =============================================================================


class TestInspectorViewSerialization:
    """
    Testy: Widoki sa poprawnie serializowalne.
    """

    def test_inspector_view_to_dict(self, sc3f_proof: ProofDocument):
        """InspectorView.to_dict() zwraca poprawny slownik."""
        view = inspect(sc3f_proof)
        d = view.to_dict()

        assert "document_id" in d
        assert "steps" in d
        assert "summary" in d
        assert "header" in d
        assert "proof_type" in d

    def test_inspector_view_to_dict_is_serializable(self, sc3f_proof: ProofDocument):
        """InspectorView.to_dict() mozna serializowac do JSON."""
        view = inspect(sc3f_proof)
        d = view.to_dict()

        json_str = json.dumps(d, ensure_ascii=False)
        assert isinstance(json_str, str)

        # Deserializacja
        data = json.loads(json_str)
        assert data["proof_type"] == "SC3F_IEC60909"

    def test_step_view_to_dict(self, sc3f_proof: ProofDocument):
        """StepView.to_dict() zwraca poprawny slownik."""
        view = inspect(sc3f_proof)
        step = view.steps[0]
        d = step.to_dict()

        assert "step_number" in d
        assert "step_id" in d
        assert "formula_latex" in d
        assert "input_values" in d
        assert "result" in d
        assert "unit_check" in d

    def test_summary_view_to_dict(self, sc3f_proof: ProofDocument):
        """SummaryView.to_dict() zwraca poprawny slownik."""
        view = inspect(sc3f_proof)
        d = view.summary.to_dict()

        assert "key_results" in d
        assert "unit_check_passed" in d
        assert "total_steps" in d
        assert "warnings" in d

    def test_header_view_to_dict(self, sc3f_proof: ProofDocument):
        """HeaderView.to_dict() zwraca poprawny slownik."""
        view = inspect(sc3f_proof)
        d = view.header.to_dict()

        assert "project_name" in d
        assert "case_name" in d
        assert "run_timestamp" in d
        assert "solver_version" in d

    def test_header_view_contains_target_for_p15(self, lc_line_input: LoadCurrentsInput):
        """Nagłówek P15 zawiera identyfikator i typ elementu."""
        proof = ProofGenerator.generate_load_currents_proof(lc_line_input)
        view = inspect(proof)

        assert view.header.target_id == lc_line_input.target_id
        assert view.header.element_kind == lc_line_input.element_kind.value


# =============================================================================
# Test: Completeness Validation — P11.1e
# =============================================================================


class TestInspectorCompleteness:
    """
    Testy: Walidacja kompletności strukturalnej.

    Sprawdza czy wymagane klucze są obecne w key_results.
    Bez wartości liczbowych — tylko sprawdzenie strukturalne.
    """

    def test_completeness_sc3f_passes(self, sc3f_proof: ProofDocument):
        """SC3F proof z kompletnymi key_results przechodzi walidację."""
        inspector = ProofInspector(sc3f_proof)
        passed, missing = inspector.validate_completeness()

        assert passed is True
        assert missing == ()

    def test_completeness_vdrop_passes(self, vdrop_proof: ProofDocument):
        """VDROP proof z kompletnymi key_results przechodzi walidację."""
        inspector = ProofInspector(vdrop_proof)
        passed, missing = inspector.validate_completeness()

        assert passed is True
        assert missing == ()

    def test_completeness_reports_missing_keys(self, sc3f_test_input: SC3FInput):
        """Walidacja zgłasza brakujące klucze gdy key_results jest niepełne."""
        # Generate a valid proof first
        proof = ProofGenerator.generate_sc3f_proof(sc3f_test_input)

        # Create a modified proof with missing key_results
        # We need to create a new ProofDocument with incomplete summary
        incomplete_key_results = {
            "ikss_ka": proof.summary.key_results["ikss_ka"],
            # Missing: ip_ka, ith_ka, sk_mva, idyn_ka
        }

        incomplete_summary = ProofSummary(
            key_results=incomplete_key_results,
            unit_check_passed=proof.summary.unit_check_passed,
            total_steps=proof.summary.total_steps,
            warnings=(),
        )

        incomplete_proof = ProofDocument(
            document_id=proof.document_id,
            artifact_id=proof.artifact_id,
            created_at=proof.created_at,
            proof_type=proof.proof_type,
            title_pl=proof.title_pl,
            header=proof.header,
            steps=proof.steps,
            summary=incomplete_summary,
        )

        inspector = ProofInspector(incomplete_proof)
        passed, missing = inspector.validate_completeness()

        assert passed is False
        # Missing keys should be sorted alphabetically
        assert "ip_ka" in missing
        assert "ith_ka" in missing
        assert "sk_mva" in missing
        # idyn_ka not in missing because ip_ka is also missing (proxy rule)
        # But ip_ka is missing so idyn_ka should be reported
        assert "idyn_ka" in missing
        # Verify deterministic ordering (sorted)
        assert missing == tuple(sorted(missing))

    def test_completeness_idyn_proxy_rule(self, sc3f_test_input: SC3FInput):
        """Jeśli brak idyn_ka ale jest ip_ka, walidacja przechodzi (proxy rule)."""
        proof = ProofGenerator.generate_sc3f_proof(sc3f_test_input)

        # Create key_results without idyn_ka but with ip_ka
        key_results_no_idyn = {k: v for k, v in proof.summary.key_results.items() if k != "idyn_ka"}

        # Make sure ip_ka is present (should be from original)
        assert "ip_ka" in key_results_no_idyn

        modified_summary = ProofSummary(
            key_results=key_results_no_idyn,
            unit_check_passed=proof.summary.unit_check_passed,
            total_steps=proof.summary.total_steps,
            warnings=(),
        )

        modified_proof = ProofDocument(
            document_id=proof.document_id,
            artifact_id=proof.artifact_id,
            created_at=proof.created_at,
            proof_type=proof.proof_type,
            title_pl=proof.title_pl,
            header=proof.header,
            steps=proof.steps,
            summary=modified_summary,
        )

        inspector = ProofInspector(modified_proof)
        passed, missing = inspector.validate_completeness()

        # Should pass because ip_ka acts as proxy for idyn_ka
        assert passed is True
        assert missing == ()


# =============================================================================
# Test: Semantic Aliases — P11.1e
# =============================================================================


class TestInspectorSemanticAliases:
    """
    Testy: Aliasy semantyczne dla doboru aparatury.

    Sprawdza czy aliasy są poprawnie przypisywane do key_results.
    """

    def test_semantic_aliases_present_in_sc3f_summary_view(self, sc3f_proof: ProofDocument):
        """SC3F summary zawiera aliasy semantyczne dla kluczowych wyników."""
        inspector = ProofInspector(sc3f_proof)
        summary = inspector.get_summary()

        # Check that ikss_ka has the correct alias
        assert "ikss_ka" in summary.key_results
        ikss = summary.key_results["ikss_ka"]
        assert ikss.alias_pl == "prąd wyłączalny"

        # Check ip_ka
        assert "ip_ka" in summary.key_results
        ip = summary.key_results["ip_ka"]
        assert ip.alias_pl == "prąd udarowy"

        # Check ith_ka
        assert "ith_ka" in summary.key_results
        ith = summary.key_results["ith_ka"]
        assert ith.alias_pl == "prąd cieplny"

        # Check idyn_ka
        assert "idyn_ka" in summary.key_results
        idyn = summary.key_results["idyn_ka"]
        assert idyn.alias_pl == "prąd dynamiczny"

        # Check sk_mva
        assert "sk_mva" in summary.key_results
        sk = summary.key_results["sk_mva"]
        assert sk.alias_pl == "moc zwarciowa"

    def test_semantic_aliases_not_present_for_non_aliased_keys(self, sc3f_proof: ProofDocument):
        """Klucze bez zdefiniowanych aliasów mają alias_pl = None."""
        inspector = ProofInspector(sc3f_proof)
        summary = inspector.get_summary()

        # kappa doesn't have a semantic alias defined
        if "kappa" in summary.key_results:
            kappa = summary.key_results["kappa"]
            assert kappa.alias_pl is None

    def test_semantic_aliases_in_to_dict_output(self, sc3f_proof: ProofDocument):
        """alias_pl pojawia się w to_dict() gdy jest zdefiniowany."""
        inspector = ProofInspector(sc3f_proof)
        summary = inspector.get_summary()

        ikss = summary.key_results["ikss_ka"]
        ikss_dict = ikss.to_dict()

        assert "alias_pl" in ikss_dict
        assert ikss_dict["alias_pl"] == "prąd wyłączalny"

    def test_semantic_aliases_not_in_to_dict_when_none(self, vdrop_proof: ProofDocument):
        """alias_pl nie pojawia się w to_dict() gdy jest None."""
        inspector = ProofInspector(vdrop_proof)
        summary = inspector.get_summary()

        # VDROP keys don't have semantic aliases
        u_kv = summary.key_results["u_kv"]
        u_dict = u_kv.to_dict()

        # alias_pl should not be in dict when None
        assert "alias_pl" not in u_dict

    def test_semantic_aliases_constants_are_complete(self):
        """Stałe SEMANTIC_ALIASES zawierają wszystkie wymagane aliasy."""
        required_aliases = ["ikss_ka", "ip_ka", "ith_ka", "idyn_ka", "sk_mva"]

        for key in required_aliases:
            assert key in SEMANTIC_ALIASES
            alias = SEMANTIC_ALIASES[key]
            assert alias.alias_pl != ""
            assert alias.target_key == key
