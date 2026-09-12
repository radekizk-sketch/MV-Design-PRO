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
    #: ECHO wielkości zwarciowych, nie ich źródło (plan naprawy §3). Serwer bierze
    #: liczby z biegu wskazanego przez ``run_id``; to pole wolno pominąć, a jeżeli
    #: zostanie podane, musi się z nimi zgadzać — rozbieżność jest odmową.
    required_fault_results: dict[str, Any] | None = None
    #: Snapshot ENM, z którego pochodzą wielkości w ``required_fault_results``.
    #: Pole jest opcjonalne SKŁADNIOWO, ale nie znaczeniowo: bez niego serwer nie
    #: ma jak ustalić, czy wkład zwarciowy źródeł falownikowych opiera się na
    #: deklaracji producenta, więc odmawia wystawienia dowodu (fail-closed).
    #: Nie jest to pole „zaufania" — serwer wyprowadza proweniencję z modelu sam,
    #: klient nie może jej zadeklarować.
    snapshot: dict[str, Any] | None = None
