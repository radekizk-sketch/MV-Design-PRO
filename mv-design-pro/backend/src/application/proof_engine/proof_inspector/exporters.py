"""
Proof Inspector Exporters — P11.1d

STATUS: CANONICAL & BINDING
Reference: P11_1d_PROOF_UI_EXPORT.md

Eksportery dla Proof Inspector (read-only):
- proof.json (kanoniczny, deterministyczny)
- proof.tex (LaTeX-only, $$...$$)
- proof.pdf (jesli pipeline istnieje — wpp. tylko TEX)

UWAGA: Brak modyfikacji istniejacego latex_renderer.
Inspector TYLKO wywoluje istniejace renderery.
"""

from __future__ import annotations

import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from application.proof_engine.types import ProofDocument


@dataclass(frozen=True)
class ExportResult:
    """
    Wynik eksportu dokumentu.

    Attributes:
        format: Format eksportu (json, tex, pdf)
        content: Zawartosc (string dla json/tex, bytes dla pdf)
        success: Czy eksport sie powiodl
        error_message: Komunikat bledu (jesli niepowodzenie)
        filename_hint: Sugerowana nazwa pliku
    """

    format: str
    content: str | bytes
    success: bool
    error_message: str | None = None
    filename_hint: str = "proof"

    @property
    def is_binary(self) -> bool:
        """Czy content jest binarny (PDF)."""
        return isinstance(self.content, bytes)


class InspectorExporter:
    """
    Eksporter dokumentow dowodowych (read-only).

    Wywoluje istniejace renderery bez ich modyfikacji.

    Eksporty:
    - JSON: kanoniczny, deterministyczny (sort_keys=True)
    - TEX: LaTeX z istniejacego LaTeXRenderer
    - PDF: kompilacja TEX jesli dostepny pdflatex
    """

    def __init__(self, document: ProofDocument) -> None:
        """
        Inicjalizuje eksporter.

        Args:
            document: ProofDocument do eksportu
        """
        self._document = document

    @property
    def document(self) -> ProofDocument:
        """Zwraca dokument (read-only)."""
        return self._document

    def export_json(self) -> ExportResult:
        """
        Eksportuje do JSON (kanoniczny, deterministyczny).

        Format:
        - sort_keys=True dla determinizmu
        - indent=2 dla czytelnosci
        - ensure_ascii=False dla polskich znakow

        Returns:
            ExportResult z zawartoscia JSON
        """
        try:
            # Uzyj json_representation z ProofDocument (juz deterministyczny)
            content = self._document.json_representation
            return ExportResult(
                format="json",
                content=content,
                success=True,
                filename_hint=self._generate_filename("json"),
            )
        except Exception as e:
            return ExportResult(
                format="json",
                content="",
                success=False,
                error_message=str(e),
            )

    def export_tex(self) -> ExportResult:
        """
        Eksportuje do LaTeX.

        Uzywa istniejacego LaTeXRenderer bez modyfikacji.
        Format blokowy ($$...$$) WYLACZNIE.

        Returns:
            ExportResult z zawartoscia LaTeX
        """
        try:
            # Uzyj latex_representation z ProofDocument
            content = self._document.latex_representation
            return ExportResult(
                format="tex",
                content=content,
                success=True,
                filename_hint=self._generate_filename("tex"),
            )
        except Exception as e:
            return ExportResult(
                format="tex",
                content="",
                success=False,
                error_message=str(e),
            )

    def export_pdf(self) -> ExportResult:
        """
        Eksportuje do PDF.

        Kompiluje LaTeX do PDF jesli pdflatex jest dostepny.
        Wymaga zainstalowanego TeX Live lub MiKTeX.

        Returns:
            ExportResult z zawartoscia PDF (bytes) lub bledem
        """
        # Najpierw eksportuj do LaTeX
        tex_result = self.export_tex()
        if not tex_result.success:
            return ExportResult(
                format="pdf",
                content=b"",
                success=False,
                error_message=f"LaTeX export failed: {tex_result.error_message}",
            )

        # Sprawdz czy pdflatex jest dostepny
        if not self._is_pdflatex_available():
            return ExportResult(
                format="pdf",
                content=b"",
                success=False,
                error_message="pdflatex not available. Install TeX Live or MiKTeX.",
            )

        # Kompiluj do PDF
        try:
            pdf_content = self._compile_to_pdf(tex_result.content)
            return ExportResult(
                format="pdf",
                content=pdf_content,
                success=True,
                filename_hint=self._generate_filename("pdf"),
            )
        except Exception as e:
            return ExportResult(
                format="pdf",
                content=b"",
                success=False,
                error_message=f"PDF compilation failed: {e}",
            )

    def export_docx(self) -> ExportResult:
        """
        Eksportuje ProofDocument do polskiego raportu DOCX (Word).

        Format edytowalny dla projektanta — typowo używany w dokumentacji
        projektowej OSD. Zawiera nagłówek light_technical (nazwa projektu,
        case, snapshot, timestamp) + tabelę kroków dowodowych (Formula →
        Data → Substitution → Result → Unit verification).

        Uwaga: równania renderowane jako tekst LaTeX w monospace —
        pełne renderowanie matematyczne wymaga konwersji TEX→OMML w MS Word
        (poza zakresem proof engine). Format pozostaje zgodny z V12K-007:
        eksport zawsze w motywie technicznym jasnym (nie dark_scada).

        Determinizm binarny: normalizowane przez `docx_determinism` — sam
        python-docx NIE zeruje znacznikow czasu wpisow ZIP ani docProps/core.xml
        (dwa kolejne `Document().save()` roznia sie bajtowo, gdy wywolania
        przetna granice sekundy).

        Returns:
            ExportResult z zawartością DOCX (bytes) lub błędem
        """
        try:
            from docx import Document
            from docx.shared import Pt
        except ImportError as exc:
            return ExportResult(
                format="docx",
                content=b"",
                success=False,
                error_message=(
                    f"python-docx not available ({exc}). "
                    "Install via 'poetry install --with dev'."
                ),
            )

        try:
            from io import BytesIO

            from network_model.reporting.docx_determinism import (
                make_docx_bytes_deterministic,
            )

            doc = self._document
            docx_obj = Document()

            # Header (light_technical)
            title = docx_obj.add_heading(doc.title_pl, level=0)
            for run in title.runs:
                run.font.size = Pt(16)

            # Metadata
            meta_table = docx_obj.add_table(rows=4, cols=2)
            meta_table.style = "Light Grid Accent 1"
            meta_rows = [
                ("Typ dowodu", doc.proof_type.value),
                ("Identyfikator artefaktu", str(doc.artifact_id)),
                ("Data utworzenia", doc.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")),
                ("Liczba kroków", str(len(doc.steps))),
            ]
            for row_idx, (label, value) in enumerate(meta_rows):
                cells = meta_table.rows[row_idx].cells
                cells[0].text = label
                cells[1].text = value

            docx_obj.add_paragraph()

            # Steps — każdy krok jako sekcja
            docx_obj.add_heading("Kroki dowodowe", level=1)
            for step in doc.steps:
                docx_obj.add_heading(f"Krok {step.step_number}: {step.title_pl}", level=2)

                # Formula (LaTeX, monospace)
                eq_para = docx_obj.add_paragraph()
                eq_run = eq_para.add_run("Wzór: ")
                eq_run.bold = True
                formula_run = eq_para.add_run(step.equation.latex)
                formula_run.font.name = "Consolas"

                # Substitution
                if step.substitution_latex:
                    sub_para = docx_obj.add_paragraph()
                    sub_run = sub_para.add_run("Podstawienie: ")
                    sub_run.bold = True
                    sub_value_run = sub_para.add_run(step.substitution_latex)
                    sub_value_run.font.name = "Consolas"

                # Result
                result_para = docx_obj.add_paragraph()
                result_label = result_para.add_run("Wynik: ")
                result_label.bold = True
                result_para.add_run(f"{step.result.value} {step.result.unit}")

                # Unit check
                if step.unit_check:
                    uc_para = docx_obj.add_paragraph()
                    uc_label = uc_para.add_run("Weryfikacja jednostek: ")
                    uc_label.bold = True
                    uc_status = "OK" if step.unit_check.passed else "BŁĄD"
                    uc_para.add_run(f"{uc_status} ({step.unit_check.expected_unit})")

            # Summary
            docx_obj.add_paragraph()
            docx_obj.add_heading("Podsumowanie", level=1)
            summary_para = docx_obj.add_paragraph()
            summary_para.add_run(f"Łączna liczba kroków: {doc.summary.total_steps}")

            # Zapisz do bytes, normalizuj przez docx_determinism dla determinizmu binarnego
            buf = BytesIO()
            docx_obj.save(buf)
            return ExportResult(
                format="docx",
                content=make_docx_bytes_deterministic(buf.getvalue()),
                success=True,
                filename_hint=self._generate_filename("docx"),
            )
        except Exception as exc:
            return ExportResult(
                format="docx",
                content=b"",
                success=False,
                error_message=f"DOCX export failed: {exc}",
            )

    def export_all(self) -> dict[str, ExportResult]:
        """
        Eksportuje do wszystkich formatow.

        Returns:
            Slownik: format -> ExportResult
        """
        return {
            "json": self.export_json(),
            "tex": self.export_tex(),
            "pdf": self.export_pdf(),
            "docx": self.export_docx(),
        }

    # =========================================================================
    # Private methods
    # =========================================================================

    def _generate_filename(self, extension: str) -> str:
        """Generuje sugerowana nazwe pliku."""
        doc = self._document
        proof_type = doc.proof_type.value.lower()
        timestamp = doc.created_at.strftime("%Y%m%d_%H%M%S")
        return f"proof_{proof_type}_{timestamp}.{extension}"

    def _is_pdflatex_available(self) -> bool:
        """Sprawdza czy pdflatex jest zainstalowany."""
        try:
            result = subprocess.run(
                ["pdflatex", "--version"],
                capture_output=True,
                timeout=5,
            )
            return result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False

    def _compile_to_pdf(self, tex_content: str) -> bytes:
        """
        Kompiluje LaTeX do PDF.

        Args:
            tex_content: Zawartosc LaTeX

        Returns:
            Zawartosc PDF jako bytes

        Raises:
            RuntimeError: Jesli kompilacja sie nie powiodla
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            tex_file = tmpdir_path / "proof.tex"
            pdf_file = tmpdir_path / "proof.pdf"

            # Zapisz plik LaTeX
            tex_file.write_text(tex_content, encoding="utf-8")

            # Kompiluj (2 przebiegi dla TOC)
            for _ in range(2):
                result = subprocess.run(
                    [
                        "pdflatex",
                        "-interaction=nonstopmode",
                        "-output-directory",
                        str(tmpdir_path),
                        str(tex_file),
                    ],
                    capture_output=True,
                    timeout=60,
                    cwd=tmpdir_path,
                )

                if result.returncode != 0:
                    # Sprobuj wydobyc blad z logu
                    log_file = tmpdir_path / "proof.log"
                    error_msg = "Unknown LaTeX error"
                    if log_file.exists():
                        log_content = log_file.read_text(encoding="utf-8", errors="ignore")
                        # Znajdz linie z bledem
                        for line in log_content.split("\n"):
                            if line.startswith("!"):
                                error_msg = line
                                break
                    raise RuntimeError(error_msg)

            # Odczytaj PDF
            if not pdf_file.exists():
                raise RuntimeError("PDF file not generated")

            return pdf_file.read_bytes()


# =============================================================================
# Convenience functions
# =============================================================================


def export_to_json(document: ProofDocument) -> str:
    """
    Eksportuje ProofDocument do JSON.

    Args:
        document: ProofDocument do eksportu

    Returns:
        JSON string (kanoniczny, deterministyczny)

    Raises:
        RuntimeError: Jesli eksport sie nie powiodl
    """
    result = InspectorExporter(document).export_json()
    if not result.success:
        raise RuntimeError(f"JSON export failed: {result.error_message}")
    return str(result.content)


def export_to_tex(document: ProofDocument) -> str:
    """
    Eksportuje ProofDocument do LaTeX.

    Args:
        document: ProofDocument do eksportu

    Returns:
        LaTeX string

    Raises:
        RuntimeError: Jesli eksport sie nie powiodl
    """
    result = InspectorExporter(document).export_tex()
    if not result.success:
        raise RuntimeError(f"LaTeX export failed: {result.error_message}")
    return str(result.content)


def export_to_pdf(document: ProofDocument) -> bytes:
    """
    Eksportuje ProofDocument do PDF.

    Args:
        document: ProofDocument do eksportu

    Returns:
        PDF content (bytes)

    Raises:
        RuntimeError: Jesli eksport sie nie powiodl (w tym brak pdflatex)
    """
    result = InspectorExporter(document).export_pdf()
    if not result.success:
        raise RuntimeError(f"PDF export failed: {result.error_message}")
    return bytes(result.content)


def export_to_docx(document: ProofDocument) -> bytes:
    """
    Eksportuje ProofDocument do polskiego raportu DOCX (Word).

    Format edytowalny dla projektanta — zgodny z V12K-007 (eksport w motywie
    technicznym jasnym, nie dark_scada).

    Args:
        document: ProofDocument do eksportu

    Returns:
        DOCX content (bytes)

    Raises:
        RuntimeError: Jesli eksport sie nie powiodl (w tym brak python-docx)
    """
    result = InspectorExporter(document).export_docx()
    if not result.success:
        raise RuntimeError(f"DOCX export failed: {result.error_message}")
    return bytes(result.content)


def is_pdf_export_available() -> bool:
    """
    Sprawdza czy eksport PDF jest dostepny.

    Returns:
        True jesli pdflatex jest zainstalowany
    """
    try:
        result = subprocess.run(
            ["pdflatex", "--version"],
            capture_output=True,
            timeout=5,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False
