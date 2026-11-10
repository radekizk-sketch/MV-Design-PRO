"""Magazyny energii — ENEA, osobny operator-specific endpoint, bez NC RfG."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from application.ncrfg_compliance.bess_enea_registry import (
    DaneMagazynuDoRejestru, oceń_rejestr_magazynu,
)
from enm.deklaracje_modulu import DataUmowy

router=APIRouter(prefix="/api/bess",tags=["bess-enea-registry"])


class BessRejestrOcenaRequest(BaseModel):
    model_config=ConfigDict(extra="forbid")
    dane: DaneMagazynuDoRejestru
    na_dzien: DataUmowy


@router.post("/enea/ocena-rejestru")
def ocena_rejestru_magazynu(data: BessRejestrOcenaRequest) -> dict:
    """IRiESD I.5, właściciel/rejestr OSD są osobnymi adresatami."""
    return oceń_rejestr_magazynu(data.dane,na_dzien=data.na_dzien)
