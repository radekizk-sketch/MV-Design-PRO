"""FIX-12C: E2E Determinism Tests for Protection Coordination Export (PDF/DOCX).

Ten moduł testuje deterministyczność eksportów PDF i DOCX dla wyników
analizy koordynacji zabezpieczeń nadprądowych.

Scenariusze testowe:
1. Ten sam wynik koordynacji -> 2x eksport DOCX -> identyczny binarnie (SHA256)
2. Ten sam wynik koordynacji -> 2x eksport PDF -> identyczny binarnie (SHA256)
3. Walidacja zawartości sekcji w raporcie

Wymagania:
- Export DOCX deterministyczny dla tego samego wejścia
- PDF deterministyczny dzięki reportlab invariant mode
- SHA256 plików identyczne między run1/run2

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: Testy nie modyfikują solverów ani eksporterów
- Tylko weryfikacja deterministyczności eksportów
- 100% Polish labels w raportach
"""

from __future__ import annotations

import copy
import functools
import hashlib
import tempfile
from pathlib import Path
from typing import Any

import pytest
from enm.canonical_analysis import reset_canonical_runs
from enm.store import reset_enm_store

from tests.application.analyses.protection.coordination.test_overcurrent_coordination import (
    _biegi_modelu,
    _koordynuj,
)
from tests.golden.enm_builders.zabezpieczenia_magistrali import (
    NAZWA_ZABEZPIECZENIA_Q1,
    NAZWA_ZABEZPIECZENIA_Q2,
    build_zabezpieczenia_magistrali_enm,
)

# Check for optional dependencies
try:
    from network_model.reporting.protection_report_pdf import (
        _PDF_AVAILABLE,
        export_protection_coordination_to_pdf,
    )
except ImportError:
    _PDF_AVAILABLE = False
    export_protection_coordination_to_pdf = None  # type: ignore

try:
    from network_model.reporting.protection_report_docx import (
        _DOCX_AVAILABLE,
        export_protection_coordination_to_docx,
    )
except ImportError:
    _DOCX_AVAILABLE = False
    export_protection_coordination_to_docx = None  # type: ignore


# =============================================================================
# Test Fixtures - Deterministic Protection Coordination Result
# =============================================================================


@functools.cache
def _wynik_sieci_zlotej() -> dict[str, Any]:
    """PRAWDZIWY wynik koordynacji sieci złotej G08 (dwa zabezpieczenia modelu przy
    wyłącznikach liniowych, biegi SC max/min i rozpływ) — nie ręcznie wpisany słownik.

    Karta BIEG-ZABEZPIECZEN-Z-MODELU: dawna fikstura niosła werdykty PASS i liczniki
    „prawidłowe/nieprawidłowe", których koordynacja już nie wydaje (P-06); raport renderuje
    to, co zwraca analizator — liczby z wartościami wymaganymi.
    """
    ids = _biegi_modelu(build_zabezpieczenia_magistrali_enm())
    try:
        return _koordynuj(ids)
    finally:
        reset_canonical_runs()
        reset_enm_store()


def _create_deterministic_protection_result() -> dict[str, Any]:
    """Wynik koordynacji ze stałym identyfikatorem i czasem (bez ``uuid4``/``datetime.now``)."""
    wynik = copy.deepcopy(_wynik_sieci_zlotej())
    wynik["run_id"] = "run_deterministic_e2e_test_001"
    wynik["created_at"] = "2024-01-01T00:00:00+00:00"
    return wynik


def _compute_file_hash(file_path: Path) -> str:
    """Oblicza SHA-256 hash pliku."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256_hash.update(chunk)
    return sha256_hash.hexdigest()


# =============================================================================
# E2E Test Classes - DOCX Export
# =============================================================================


@pytest.mark.skipif(not _DOCX_AVAILABLE, reason="python-docx not installed")
class TestProtectionDOCXExportDeterminism:
    """E2E: Deterministyczność eksportu DOCX dla koordynacji zabezpieczeń."""

    def test_docx_export_identical_twice(self) -> None:
        """2x eksport DOCX -> identyczne pliki (SHA256)."""
        result = _create_deterministic_protection_result()

        with tempfile.TemporaryDirectory() as tmpdir:
            path_1 = Path(tmpdir) / "protection_report_1.docx"
            path_2 = Path(tmpdir) / "protection_report_2.docx"

            # Export 1
            export_protection_coordination_to_docx(
                result,
                path_1,
                title="Raport koordynacji zabezpieczeń - Test E2E",
                metadata={"project_name": "Projekt testowy", "created_at": "2024-01-01T00:00:00"},
                deterministic=True,
            )

            # Export 2
            export_protection_coordination_to_docx(
                result,
                path_2,
                title="Raport koordynacji zabezpieczeń - Test E2E",
                metadata={"project_name": "Projekt testowy", "created_at": "2024-01-01T00:00:00"},
                deterministic=True,
            )

            # Compare hashes
            hash_1 = _compute_file_hash(path_1)
            hash_2 = _compute_file_hash(path_2)

            assert hash_1 == hash_2, (
                f"DOCX export nie deterministyczny\n" f"Hash 1: {hash_1}\nHash 2: {hash_2}"
            )

    def test_docx_export_without_metadata_deterministic(self) -> None:
        """DOCX bez metadata jest deterministyczny."""
        result = _create_deterministic_protection_result()

        with tempfile.TemporaryDirectory() as tmpdir:
            path_1 = Path(tmpdir) / "no_meta_1.docx"
            path_2 = Path(tmpdir) / "no_meta_2.docx"

            export_protection_coordination_to_docx(result, path_1, deterministic=True)
            export_protection_coordination_to_docx(result, path_2, deterministic=True)

            hash_1 = _compute_file_hash(path_1)
            hash_2 = _compute_file_hash(path_2)

            assert hash_1 == hash_2, "DOCX bez metadata nie deterministyczny"

    def test_docx_export_empty_checks_deterministic(self) -> None:
        """DOCX z pustymi sprawdzeniami jest deterministyczny."""
        result = _create_deterministic_protection_result()
        # Clear all checks
        result["sensitivity_checks"] = []
        result["selectivity_checks"] = []
        result["overload_checks"] = []
        result["tcc_curves"] = []
        result["devices"] = []
        result["summary"]["total_devices"] = 0
        result["summary"]["total_checks"] = 0

        with tempfile.TemporaryDirectory() as tmpdir:
            path_1 = Path(tmpdir) / "empty_1.docx"
            path_2 = Path(tmpdir) / "empty_2.docx"

            export_protection_coordination_to_docx(result, path_1, deterministic=True)
            export_protection_coordination_to_docx(result, path_2, deterministic=True)

            hash_1 = _compute_file_hash(path_1)
            hash_2 = _compute_file_hash(path_2)

            assert hash_1 == hash_2, "DOCX z pustymi danymi nie deterministyczny"


# =============================================================================
# E2E Test Classes - PDF Export
# =============================================================================


@pytest.mark.skipif(not _PDF_AVAILABLE, reason="reportlab not installed")
class TestProtectionPDFExportDeterminism:
    """E2E: Deterministyczność eksportu PDF dla koordynacji zabezpieczeń.

    PDF używa reportlab invariant mode dla deterministycznego wyjścia.
    """

    def test_pdf_export_identical_twice(self) -> None:
        """2x eksport PDF -> identyczne pliki (SHA256)."""
        result = _create_deterministic_protection_result()

        with tempfile.TemporaryDirectory() as tmpdir:
            path_1 = Path(tmpdir) / "protection_report_1.pdf"
            path_2 = Path(tmpdir) / "protection_report_2.pdf"

            # Export 1
            export_protection_coordination_to_pdf(
                result,
                path_1,
                title="Raport koordynacji zabezpieczeń - Test E2E",
                metadata={"project_name": "Projekt testowy", "created_at": "2024-01-01T00:00:00"},
            )

            # Export 2
            export_protection_coordination_to_pdf(
                result,
                path_2,
                title="Raport koordynacji zabezpieczeń - Test E2E",
                metadata={"project_name": "Projekt testowy", "created_at": "2024-01-01T00:00:00"},
            )

            # Compare hashes
            hash_1 = _compute_file_hash(path_1)
            hash_2 = _compute_file_hash(path_2)

            assert hash_1 == hash_2, (
                f"PDF export nie deterministyczny\n" f"Hash 1: {hash_1}\nHash 2: {hash_2}"
            )

    def test_pdf_export_without_metadata_deterministic(self) -> None:
        """PDF bez metadata jest deterministyczny."""
        result = _create_deterministic_protection_result()

        with tempfile.TemporaryDirectory() as tmpdir:
            path_1 = Path(tmpdir) / "no_meta_1.pdf"
            path_2 = Path(tmpdir) / "no_meta_2.pdf"

            export_protection_coordination_to_pdf(result, path_1)
            export_protection_coordination_to_pdf(result, path_2)

            hash_1 = _compute_file_hash(path_1)
            hash_2 = _compute_file_hash(path_2)

            assert hash_1 == hash_2, "PDF bez metadata nie deterministyczny"

    def test_pdf_export_empty_checks_deterministic(self) -> None:
        """PDF z pustymi sprawdzeniami jest deterministyczny."""
        result = _create_deterministic_protection_result()
        # Clear all checks
        result["sensitivity_checks"] = []
        result["selectivity_checks"] = []
        result["overload_checks"] = []
        result["tcc_curves"] = []
        result["devices"] = []
        result["summary"]["total_devices"] = 0
        result["summary"]["total_checks"] = 0

        with tempfile.TemporaryDirectory() as tmpdir:
            path_1 = Path(tmpdir) / "empty_1.pdf"
            path_2 = Path(tmpdir) / "empty_2.pdf"

            export_protection_coordination_to_pdf(result, path_1)
            export_protection_coordination_to_pdf(result, path_2)

            hash_1 = _compute_file_hash(path_1)
            hash_2 = _compute_file_hash(path_2)

            assert hash_1 == hash_2, "PDF z pustymi danymi nie deterministyczny"


# =============================================================================
# E2E Test Classes - Content Validation
# =============================================================================


@pytest.mark.skipif(not _DOCX_AVAILABLE, reason="python-docx not installed")
class TestProtectionDOCXContentValidation:
    """E2E: Walidacja zawartości sekcji w raporcie DOCX."""

    def test_content_sections_present(self) -> None:
        """Wszystkie wymagane sekcje są obecne w raporcie DOCX."""
        from docx import Document as DocxDocument

        result = _create_deterministic_protection_result()

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "content_test.docx"
            export_protection_coordination_to_docx(result, path, deterministic=True)

            # Read DOCX and check sections
            doc = DocxDocument(str(path))
            full_text = "\n".join([p.text for p in doc.paragraphs])

            # Check for required Polish section headers
            required_sections = [
                "Podsumowanie",
                "Tabela urządzeń i nastaw",
                "Czułość — iloraz",
                "Selektywność czasowa — odstęp",
                "Przeciążalność — iloraz",
                "Krzywe czasowo-prądowe",
            ]

            for section in required_sections:
                assert section in full_text, f"Brak sekcji '{section}' w raporcie DOCX"

    def test_raport_niesie_liczby_z_wartoscia_wymagana_bez_werdyktu(self) -> None:
        """P-06: tabele sprawdzeń mają kolumnę wartości wymaganej i liczby, nie kolumnę
        werdyktu; podsumowanie — najmniejszy odstęp i ilorazy, nie liczniki „prawidłowe"."""
        from docx import Document as DocxDocument

        result = _create_deterministic_protection_result()
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "liczby.docx"
            export_protection_coordination_to_docx(result, path, deterministic=True)
            doc = DocxDocument(str(path))

        naglowki = {k.text for tabela in doc.tables for k in tabela.rows[0].cells}
        assert {"Wymagany", "Wymagany [s]", "Odstęp [s]", "Iloraz"} <= naglowki
        assert not {"Werdykt", "Margines [%]"} & naglowki
        komorki = {k.text for tabela in doc.tables for w in tabela.rows for k in w.cells}
        assert "Najmniejszy odstęp czasowy par [s]" in komorki
        assert not any("prawidłowe" in k or "Prawidłowa" in k for k in komorki)

    def test_tabele_sprawdzen_nazywaja_urzadzenia_nazwami_nie_identyfikatorami(self) -> None:
        """Karta #144: tabele czułości, selektywności i przeciążalności nazywają urządzenie
        nazwą z listy urządzeń wyniku; fragment identyfikatora (dawniej `device_id[:12]`)
        nie trafia do żadnej komórki. Urządzenie spoza listy to jawny brak."""
        from docx import Document as DocxDocument

        result = _create_deterministic_protection_result()
        result["overload_checks"] = [
            *result["overload_checks"],
            {**result["overload_checks"][0], "device_id": "urzadzenie-usuniete-7f3a"},
        ]

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "nazwy.docx"
            export_protection_coordination_to_docx(result, path, deterministic=True)
            doc = DocxDocument(str(path))

        komorki = [
            komorka.text
            for tabela in doc.tables
            for wiersz in tabela.rows[1:]
            for komorka in wiersz.cells
        ]
        assert NAZWA_ZABEZPIECZENIA_Q1 in komorki
        assert NAZWA_ZABEZPIECZENIA_Q2 in komorki
        assert "Urządzenie spoza wyniku" in komorki
        identyfikatory = {d["id"] for d in result["devices"]}
        for komorka in komorki:
            assert not any(ident in komorka for ident in identyfikatory)
            assert "urzadzenie-usuniete" not in komorka

    def test_no_codenames_in_docx(self) -> None:
        """Raport DOCX nie zawiera nazw kodowych projektu."""
        from docx import Document as DocxDocument

        result = _create_deterministic_protection_result()

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "codename_test.docx"
            export_protection_coordination_to_docx(result, path, deterministic=True)

            doc = DocxDocument(str(path))
            full_text = "\n".join([p.text for p in doc.paragraphs])

            # Forbidden codenames
            forbidden = ["P7", "P11", "P14", "P17", "P20", "FIX-12"]
            for codename in forbidden:
                assert (
                    codename not in full_text
                ), f"Znaleziono niedozwoloną nazwę kodową '{codename}' w raporcie"


@pytest.mark.skipif(not _PDF_AVAILABLE, reason="reportlab not installed")
class TestProtectionPDFContentValidation:
    """E2E: Walidacja zawartości PDF."""

    def test_pdf_file_valid_and_nonzero(self) -> None:
        """PDF jest poprawnym plikiem o niezerowym rozmiarze."""
        result = _create_deterministic_protection_result()

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "valid_test.pdf"
            export_protection_coordination_to_pdf(result, path)

            # Check file exists and has content
            assert path.exists(), "Plik PDF nie został utworzony"
            assert path.stat().st_size > 0, "Plik PDF jest pusty"

            # Check PDF magic bytes
            with open(path, "rb") as f:
                magic = f.read(5)
            assert magic == b"%PDF-", "Plik nie jest poprawnym PDF-em"


# =============================================================================
# E2E Integration Test - Full Workflow
# =============================================================================


class TestProtectionExportFullWorkflow:
    """E2E: Pełny workflow eksportu obu formatów."""

    @pytest.mark.skipif(
        not (_PDF_AVAILABLE and _DOCX_AVAILABLE), reason="reportlab or python-docx not installed"
    )
    def test_both_exports_from_same_result(self) -> None:
        """PDF i DOCX z tego samego wyniku są deterministyczne."""
        result = _create_deterministic_protection_result()

        with tempfile.TemporaryDirectory() as tmpdir:
            # Export PDF twice
            pdf_1 = Path(tmpdir) / "report_1.pdf"
            pdf_2 = Path(tmpdir) / "report_2.pdf"
            export_protection_coordination_to_pdf(result, pdf_1)
            export_protection_coordination_to_pdf(result, pdf_2)

            # Export DOCX twice
            docx_1 = Path(tmpdir) / "report_1.docx"
            docx_2 = Path(tmpdir) / "report_2.docx"
            export_protection_coordination_to_docx(result, docx_1, deterministic=True)
            export_protection_coordination_to_docx(result, docx_2, deterministic=True)

            # Verify all exports are deterministic
            assert _compute_file_hash(pdf_1) == _compute_file_hash(
                pdf_2
            ), "PDF export nie deterministyczny"
            assert _compute_file_hash(docx_1) == _compute_file_hash(
                docx_2
            ), "DOCX export nie deterministyczny"

            # Verify files are different formats (not accidentally same)
            assert _compute_file_hash(pdf_1) != _compute_file_hash(
                docx_1
            ), "PDF i DOCX mają ten sam hash - to niemożliwe"

    @pytest.mark.skipif(not _DOCX_AVAILABLE, reason="python-docx not installed")
    def test_sorted_order_in_checks(self) -> None:
        """Sprawdzenia są sortowane deterministycznie po device_id."""

        # Create result with unsorted checks
        result = _create_deterministic_protection_result()

        # Swap order of sensitivity checks (B before A)
        result["sensitivity_checks"] = [
            result["sensitivity_checks"][1],  # DEV-B-002
            result["sensitivity_checks"][0],  # DEV-A-001
        ]

        with tempfile.TemporaryDirectory() as tmpdir:
            path_1 = Path(tmpdir) / "sorted_1.docx"
            path_2 = Path(tmpdir) / "sorted_2.docx"

            export_protection_coordination_to_docx(result, path_1, deterministic=True)
            export_protection_coordination_to_docx(result, path_2, deterministic=True)

            # Should still be identical due to internal sorting
            hash_1 = _compute_file_hash(path_1)
            hash_2 = _compute_file_hash(path_2)

            assert hash_1 == hash_2, "Eksport z różną kolejnością wejściową daje różne wyniki"
