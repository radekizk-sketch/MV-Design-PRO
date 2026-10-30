"""Odwzorowanie rodzajów analizy wykonania na rodzaj biegu kanonicznego jest zupełne.

``api/execution_runs._canonical_analysis_type`` kończy się błędem programu
(``AssertionError``) — gałąź, której żaden rodzaj słownika nie może osiągnąć. Ten test jest
dowodem tej deklaracji: każdy rodzaj ``ExecutionAnalysisType`` poza oceną zabezpieczeń
(osobne polecenie, odmowa HTTP 400 ze zdaniem) ma rodzaj biegu kanonicznego, a ten ma
polską nazwę w ``domain.opis_przebiegu``.
"""

from __future__ import annotations

import pytest
from api.execution_runs import _canonical_analysis_type
from domain.execution import ExecutionAnalysisType
from domain.opis_przebiegu import RODZAJE_PRZEBIEGU_PL
from fastapi import HTTPException


@pytest.mark.parametrize(
    "rodzaj",
    [r for r in ExecutionAnalysisType if r is not ExecutionAnalysisType.PROTECTION],
)
def test_kazdy_rodzaj_ma_rodzaj_biegu_z_nazwa(rodzaj: ExecutionAnalysisType) -> None:
    kanoniczny = _canonical_analysis_type(rodzaj)
    assert kanoniczny in RODZAJE_PRZEBIEGU_PL


def test_ocena_zabezpieczen_odsyla_do_osobnego_polecenia() -> None:
    with pytest.raises(HTTPException) as odmowa:
        _canonical_analysis_type(ExecutionAnalysisType.PROTECTION)
    assert odmowa.value.status_code == 400
    assert "osobne polecenie" in str(odmowa.value.detail)
