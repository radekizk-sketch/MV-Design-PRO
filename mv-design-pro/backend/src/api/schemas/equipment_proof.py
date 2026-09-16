from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DeviceRatingPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    device_id: str = Field(..., min_length=1)
    name_pl: str = Field(..., min_length=1)
    type_ref: str | None = None
    u_m_kv: float | None = None
    i_cu_ka: float | None = None
    i_dyn_ka: float | None = None
    i_th_ka: float | None = None
    t_th_s: float | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


class EquipmentProofRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project_id: str = Field(..., min_length=1)
    case_id: str = Field(..., min_length=1)
    run_id: str = Field(..., min_length=1)
    connection_node_id: str = Field(..., min_length=1)
    device: DeviceRatingPayload
    #: Karta S-2 AUTORYTET: wielkości zwarciowe wchodzą do dowodu WYŁĄCZNIE z
    #: ``run_id`` (bieg zapisany) — to pole jest teraz ECHEM opcjonalnym, nie
    #: źródłem danych. Podane — porównywane z biegiem, rozbieżność = 422
    #: ``WYNIK_NIEZGODNY_Z_BIEGIEM``. Pominięte — dowód powstaje z liczb biegu
    #: bez porównania.
    required_fault_results: dict[str, Any] | None = None
