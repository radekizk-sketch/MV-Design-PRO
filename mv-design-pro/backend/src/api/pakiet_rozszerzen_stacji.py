"""Router pakietu dowodow rozszerzen stacji i odczytu uziemienia sieci SN pol stacji.

Oba endpointy CZYTAJA model sieci projektu (ENM) — zadnego zapisu, zadnego magazynu obok
modelu (karta JEDNA-SCIEZKA-EDYCJI skasowala dawna zapisana konfiguracje stacji: dane stacji
zyja w elementach modelu i zmieniaja sie wylacznie operacjami domenowymi):

  POST /api/v1/projects/{project_id}/stations/_validate-all
       pakiet dowodow rozszerzen KAZDEJ stacji modelu
       (`application.proof_engine.packs.pakiet_rozszerzen_stacji`)
  POST /api/v1/projects/{project_id}/stations/{station_id}/_uziemienie-sn
       sposob uziemienia punktu neutralnego sieci SN pol stacji (karta UX-04/POLE-ZU)
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from application.proof_engine.packs.pakiet_rozszerzen_stacji import (
    uziemienie_sn_stacji,
    zloz_pakiety_projektu,
)
from application.twin_key import klucz_twin_dla_projektu
from enm.models import EnergyNetworkModel
from enm.store import get_enm, has_enm
from fastapi import APIRouter, Depends
from infrastructure.persistence.unit_of_work import UnitOfWork
from pydantic import BaseModel, Field

router = APIRouter(
    prefix="/api/v1/projects/{project_id}/stations",
    tags=["Pakiet dowodów rozszerzeń stacji"],
)


def _model_projektu(
    project_id: UUID, uow_factory: Callable[[], object]
) -> EnergyNetworkModel | None:
    """Model ENM projektu albo `None`, gdy projekt nie ma modelu.

    Klucz magazynu WYŁĄCZNIE przez tłumacza `application/twin_key.py` (migracja zastanych
    plików per przypadek przed odczytem).
    """
    klucz = klucz_twin_dla_projektu(project_id, uow_factory)
    return get_enm(klucz) if has_enm(klucz) else None


@router.post("/_validate-all")
def pakiet_dowodow_rozszerzen(
    project_id: UUID,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Pakiet dowodów walidacji rozszerzeń dla KAŻDEJ stacji modelu sieci projektu.

    Jedyna droga produktu do pakietu (karta PROOFPACK-KONTRAKT): pakiet składa backend
    z modelu sieci — nazwy z modelu, bilans mocy w backendzie, rodzaj bez danych jawnie
    oznaczony z przyczyną. Bezpieczne: nie modyfikuje modelu; te same dane dają te same bajty.
    """
    pakiety = zloz_pakiety_projektu(_model_projektu(project_id, uow_factory))
    return {
        "project_id": str(project_id),
        "all_pass": all(pakiet.all_pass for pakiet in pakiety),
        "station_count": len(pakiety),
        "per_station": [pakiet.to_dict() for pakiet in pakiety],
    }


class UziemieniePolRequest(BaseModel):
    """Oznaczenia pól stacji (reguła konfiguratora: numer → skrót odpływu → nazwa)."""

    pola: list[str] = Field(default_factory=list)


@router.post("/{station_id:path}/_uziemienie-sn")
def uziemienie_sn_pol_stacji(
    project_id: UUID,
    station_id: str,
    body: UziemieniePolRequest,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Sposób uziemienia punktu neutralnego sieci SN pól stacji — z MODELU sieci projektu.

    Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA: jedyną prawdą o uziemieniu sieci SN jest zespół
    uziemiający sekcji (albo uziemiony punkt neutralny uzwojenia transformatora) —
    ``enm.uziemienie_sekcji``. Pole bez ustalonego typu niesie nazwaną przyczynę (stacja spoza
    modelu, brak szyn SN, odmowa sekcji, pole w sekcjach różnie uziemionych); ``sekcje`` — opis
    każdej sieci SN stacji. Odczyt — nie zmienia modelu.
    """
    return {
        "station_id": station_id,
        **uziemienie_sn_stacji(_model_projektu(project_id, uow_factory), station_id, body.pola),
    }
