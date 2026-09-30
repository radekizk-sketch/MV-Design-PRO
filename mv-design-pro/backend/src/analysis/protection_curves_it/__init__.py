"""Protection curves I–t — typy widoku (model + serializer).

Karta AB-1a Pakiet L (2026-09-23): budowniczy (`builder.py`) i renderery SVG/PDF
skasowane — LEGACY_USUNAC B8 inwentarza werdyktow (0 wolajacych w `backend/src`,
agregat `normative_status` „Status: PASS" drukowany w legendzie). Typ widoku
zostaje: jest typem parametru zywych budowniczych pokrycia/wrazliwosci/rekomendacji.
"""

from analysis.protection_curves_it.models import ProtectionCurvesITView

__all__ = [
    "ProtectionCurvesITView",
]
