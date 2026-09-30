"""Karta N-D5-FUSE po karcie BIEG-ZABEZPIECZEN-Z-MODELU — bezpiecznik NIE jest liczony jak
przekaźnik, a raporty PDF i DOCX opowiadają o nim tę samą historię.

Bezpiecznik topikowy nie ma charakterystyki IDMT ani TMS; pasmo (IEC 60282-1) pochodzi z karty
producenta, którego katalog nie niesie — pozycja TCC bezpiecznika nie ma punktów, progu ani
mnożnika (``None``), a raport drukuje polskie zdanie, nigdy surowy kod ani ``FUSE_*``.
Iloczyn: rodzaj pozycji (przekaźnik z modelu, bezpiecznik) × wyjście (TCC, PDF, DOCX).
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import pytest
from application.analyses.protection.coordination.analyzer import (
    KOD_BRAK_CHARAKTERYSTYKI,
    KOD_BRAK_PASMA_BEZPIECZNIKA,
    KOD_KRZYWA_PRZEKAZNIKOWA,
    OvercurrentCoordinationAnalyzer,
)
from application.analyses.protection.coordination.models import (
    CoordinationConfig,
    CoordinationInput,
)
from enm.canonical_analysis import (
    create_run,
    execute_run,
    get_run,
    ocen_zabezpieczenia_biegu,
    reset_canonical_runs,
)
from enm.store import get_enm, reset_enm_store, set_enm
from network_model.reporting.protection_tcc_presentation import (
    ETYKIETY_BRAKU_PL,
    NIE_DOTYCZY,
    etykieta_tms,
    etykieta_typu_krzywej_pl,
    ma_podstawe_przekaznikowa,
    powod_braku_pl,
)

from tests.golden.enm_builders.zabezpieczenia_magistrali import build_zabezpieczenia_magistrali_enm


@pytest.fixture(scope="module")
def wynik() -> dict[str, Any]:
    reset_canonical_runs()
    reset_enm_store()
    set_enm("case-bezpiecznik", build_zabezpieczenia_magistrali_enm())
    bieg = execute_run(
        create_run(
            case_id="case-bezpiecznik",
            klucz_twin="case-bezpiecznik",
            analysis_type="short_circuit_sn",
        ).id
    )
    ocena = ocen_zabezpieczenia_biegu(get_enm("case-bezpiecznik"), get_run(UUID(str(bieg.id))))
    wejscie = CoordinationInput(
        ocena_max=ocena,
        ocena_min=ocena,
        pary=(),
        odmowy_par=(),
        prady_robocze={},
        prady_punktow_max={},
        prady_punktow_min={},
        rodzaj_zwarcia_max="3F",
        rodzaj_zwarcia_min="3F",
        bezpieczniki=(
            {"id": "F1", "name": "Bezpiecznik F1", "device_type": "FUSE", "nastawy": None},
        ),
        config=CoordinationConfig(),
        project_id="p",
        sc_run_id=str(bieg.id),
        sc_run_id_min=str(bieg.id),
    )
    dane = OvercurrentCoordinationAnalyzer(config=CoordinationConfig()).analyze(wejscie).to_dict()
    reset_canonical_runs()
    reset_enm_store()
    return dane


def test_bezpiecznik_bez_krzywej_przekaznik_z_krzywa(wynik: dict[str, Any]) -> None:
    krzywe = {k["device_id"]: k for k in wynik["tcc_curves"]}
    bezpiecznik = krzywe.pop("F1")
    assert bezpiecznik["curve_type"] == KOD_BRAK_CHARAKTERYSTYKI
    assert bezpiecznik["podstawa_kod"] == KOD_BRAK_PASMA_BEZPIECZNIKA
    assert bezpiecznik["points"] == []
    assert bezpiecznik["pickup_current_a"] is None
    assert bezpiecznik["time_multiplier"] is None
    assert krzywe and all(k["podstawa_kod"] == KOD_KRZYWA_PRZEKAZNIKOWA for k in krzywe.values())
    assert all(k["points"] for k in krzywe.values())


def test_raport_tcc_etykiety_bez_podstawy() -> None:
    """Pin listy ZAMKNIĘTEJ ``ETYKIETY_BRAKU_PL`` — jedyny brak podstawy to bezpiecznik."""
    assert set(ETYKIETY_BRAKU_PL) == {"BRAK_PASMA_BEZPIECZNIKA"}
    bezpiecznik = {
        "curve_type": KOD_BRAK_CHARAKTERYSTYKI,
        "podstawa_kod": KOD_BRAK_PASMA_BEZPIECZNIKA,
        "powod_pl": "Bezpiecznik topikowy ... IEC 60282-1 ...",
        "time_multiplier": None,
    }
    assert not ma_podstawe_przekaznikowa(bezpiecznik)
    assert etykieta_typu_krzywej_pl(bezpiecznik) == "Bezpiecznik — brak pasma topikowego"
    assert etykieta_tms(bezpiecznik, "—") == NIE_DOTYCZY
    assert powod_braku_pl(bezpiecznik) is not None
    nieznany = {"curve_type": "X", "podstawa_kod": "COS_NOWEGO", "powod_pl": "p"}
    assert etykieta_typu_krzywej_pl(nieznany) == "Brak charakterystyki"


def test_raport_pdf_i_docx_pokazuja_ten_sam_brak(wynik: dict[str, Any], tmp_path) -> None:
    pytest.importorskip("reportlab", reason="eksport PDF wymaga reportlab")
    pytest.importorskip("docx", reason="eksport DOCX wymaga python-docx")
    from docx import Document
    from network_model.reporting.protection_report_docx import (
        export_protection_coordination_to_docx,
    )
    from network_model.reporting.protection_report_pdf import (
        export_protection_coordination_to_pdf,
    )

    sciezka_pdf = export_protection_coordination_to_pdf(wynik, tmp_path / "k.pdf")
    sciezka_docx = export_protection_coordination_to_docx(wynik, tmp_path / "k.docx")
    assert sciezka_pdf.exists() and sciezka_docx.exists()
    dokument = Document(str(sciezka_docx))
    tresc = "\n".join(
        komorka.text
        for tabela in dokument.tables
        for wiersz in tabela.rows
        for komorka in wiersz.cells
    ) + "\n".join(p.text for p in dokument.paragraphs)
    assert "Bezpiecznik — brak pasma topikowego" in tresc
    assert "FUSE_" not in tresc
    assert "IEC normalnie odwrotna (NI)" in tresc
