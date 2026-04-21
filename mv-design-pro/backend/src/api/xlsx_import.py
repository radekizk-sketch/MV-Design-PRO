"""XLSX Import API — import sieci z pliku Excel."""

from __future__ import annotations

from typing import Any

from api.dependencies import get_uow_factory
from application.xlsx_import import XlsxNetworkImporter
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/xlsx")
async def import_xlsx(
    file: UploadFile = File(..., description="Plik XLSX z danymi sieci"),
    uow_factory: Any = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Import sieci z pliku XLSX.

    POST /api/import/xlsx

    Oczekiwane arkusze:
    - Szyny (wymagany): id, nazwa, napięcie_kV
    - Linie (wymagany): id, szyna_pocz, szyna_kon, typ, długość_km, R_ohm_km, X_ohm_km
    - Trafo (opcjonalny): id, szyna_HV, szyna_LV, Sn_MVA, uk_pct, Pk_kW, grupa
    - Źródła (opcjonalny): id, szyna, typ, Sk_MVA, RX_ratio
    - Odbiory (opcjonalny): id, szyna, P_MW, Q_Mvar
    """
    if not file.filename or not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Plik musi mieć rozszerzenie .xlsx lub .xls",
        )

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Plik jest pusty",
        )

    importer = XlsxNetworkImporter()
    result = importer.import_from_bytes(content)

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "Błędy walidacji importu XLSX",
                "errors": result.errors,
            },
        )

    return {
        "message": "Import zakończony pomyślnie",
        "result": result.to_dict(),
    }
