from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from functools import lru_cache

from .types import (
    BESSInverterType,
    CableType,
    ConverterKind,
    ConverterType,
    CTType,
    InverterType,
    LineType,
    LoadType,
    LVApparatusType,
    LVCableType,
    MVApparatusType,
    ProtectionCurve,
    ProtectionDeviceType,
    ProtectionSettingTemplate,
    PtpireeGeneratorCertificate,
    PVInverterType,
    ShuntCapacitorType,
    SourceSystemType,
    SurgeArresterType,
    SwitchEquipmentType,
    TransformerType,
    VTType,
)


def _converter_kind_value(record: dict) -> str:
    params = record.get("params") or {}
    raw_kind = params.get("kind") or params.get("converter_kind") or ""
    return str(raw_kind).upper()


def _copy_catalog_quality(record: dict) -> dict:
    params = record.get("params") or {}
    quality: dict[str, object] = {}
    for field_name in (
        "verification_status",
        "source_reference",
        "catalog_status",
        "contract_version",
        "verification_note",
    ):
        value = params.get(field_name)
        if value is not None:
            quality[field_name] = value
    for field_name, value in params.items():
        if str(field_name).startswith("ptpiree_") and value is not None:
            quality[field_name] = value
    return quality


#: Memoizacja OBIEKTOW certyfikatow PTPiREE (V12K-321, dlug wydajnosci P1-D1).
#: Snapshot wykazu ma 6887 wierszy, a `get_default_mv_catalog()` jest wolane w
#: 88 miejscach — bez memo kazde wywolanie parsowalo 6887x `from_dict`
#: (zmierzone 87 ms/wywolanie; krok pytest w CI wydluzyl sie ~2x, z ~18 do
#: ponad 45 minut). Obiekty sa ZAMROZONE (frozen dataclass), wiec
#: wspoldzielenie miedzy instancjami repozytorium jest bezpieczne. Straznica
#: swiezosci: klucz niesie numer dokumentu i model, wiec rekord testowy o tym
#: samym id ale INNEJ tresci nie dostanie cudzego obiektu.
_PTPIREE_CERT_MEMO: dict[tuple[str, str, str], PtpireeGeneratorCertificate] = {}


def _certyfikat_ptpiree_z_memo(record: dict) -> PtpireeGeneratorCertificate:
    params = record.get("params") or {}
    klucz = (
        str(record.get("id")),
        str(params.get("document_number") or ""),
        str(params.get("model") or record.get("name") or ""),
    )
    obiekt = _PTPIREE_CERT_MEMO.get(klucz)
    if obiekt is None:
        data = {"id": record.get("id"), "name": record.get("name")}
        data.update(params)
        obiekt = PtpireeGeneratorCertificate.from_dict(data)
        _PTPIREE_CERT_MEMO[klucz] = obiekt
    return obiekt


#: Czas odniesienia prądu wytrzymywanego krótkotrwale w katalogu aparatury SN.
#: Konwencja katalogu jest zapisana w jego nagłówku ("icw_ka [kA] — prad
#: wytrzymywany krotkotrwale 1s"), więc czas NIE jest tu zgadywany — jest
#: odczytem jednostki, w której zapisano daną.
_ICW_CZAS_ODNIESIENIA_S = 1.0


def _dodatnia(wartosc: object) -> float | None:
    """Liczba dodatnia albo ``None`` — zero w katalogu znaczy „nie dotyczy”.

    Bezpiecznik topikowy ma ``icw_ka = 0.0`` (nie ma wytrzymałości
    krótkotrwałej — przepala się), a uziemnik ``ik_ka = 0.0`` (nie łączy
    prądów zwarciowych). Przepisanie takiego zera jako znamiona dałoby werdykt
    „nie wytrzymuje” tam, gdzie kryterium w ogóle nie istnieje.
    """
    if wartosc is None:
        return None
    try:
        liczba = float(wartosc)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return liczba if liczba > 0 else None


def _derive_mv_apparatus_records(
    switch_equipment_records: Iterable[dict],
) -> list[dict]:
    kind_map = {
        "CIRCUIT_BREAKER": "WYLACZNIK",
        "LOAD_SWITCH": "ROZLACZNIK",
        "DISCONNECTOR": "ODLACZNIK",
        "EARTH_SWITCH": "UZIEMNIK",
        "FUSE": "ROZLACZNIK_BEZPIECZNIKOWY",
        "RECLOSER": "REKLOZER",
    }
    derived: list[dict] = []
    for record in switch_equipment_records:
        params = dict(record.get("params") or {})
        icw_ka = _dodatnia(params.get("icw_ka"))
        derived.append(
            {
                "id": record.get("id"),
                "name": record.get("name"),
                "params": {
                    "device_kind": kind_map.get(
                        str(params.get("equipment_kind", "")).upper(),
                        "APARAT_SN",
                    ),
                    "u_n_kv": params.get("un_kv"),
                    "i_n_a": params.get("in_a"),
                    "breaking_capacity_ka": params.get("ik_ka"),
                    # KD-6 poz. 1: prąd wytrzymywany krótkotrwale (Icw) to
                    # WYTRZYMAŁOŚĆ CIEPLNA aparatu — trafia w pole I_th razem ze
                    # swoim czasem odniesienia. Prąd załączalny szczytowy
                    # (making capacity) jest INNĄ wielkością (wartość szczytowa
                    # przy załączeniu na zwarcie) i do tej chwili niósł tu kopię
                    # Icw, czyli wartość SKUTECZNĄ pod nazwą szczytowej. Zostaje
                    # `None`, dopóki karty producentów nie wniosą jej wprost —
                    # brak danej jest uczciwszy niż dana o cudzym znaczeniu.
                    "making_capacity_ka": None,
                    "i_th_ka": icw_ka,
                    "i_th_duration_s": (_ICW_CZAS_ODNIESIENIA_S if icw_ka is not None else None),
                    "manufacturer": params.get("manufacturer"),
                    **_copy_catalog_quality(record),
                },
            }
        )
    return derived


def _derive_pv_records(converter_records: Iterable[dict]) -> list[dict]:
    derived: list[dict] = []
    for record in converter_records:
        if _converter_kind_value(record) != "PV":
            continue
        params = dict(record.get("params") or {})
        derived.append(
            {
                "id": record.get("id"),
                "name": record.get("name"),
                "params": {
                    "un_kv": params.get("un_kv"),
                    "s_n_kva": float(params.get("sn_mva", 0.0)) * 1000.0,
                    "p_max_kw": float(params.get("pmax_mw", 0.0)) * 1000.0,
                    "cos_phi_min": params.get("cosphi_min"),
                    "cos_phi_max": params.get("cosphi_max"),
                    "control_mode": params.get("control_mode") or "STALY_COS_PHI",
                    "grid_code": params.get("grid_code"),
                    "manufacturer": params.get("manufacturer"),
                    "dynamic_profile_id": params.get("dynamic_profile_id"),
                    **_copy_catalog_quality(record),
                },
            }
        )
    return derived


def _derive_bess_records(converter_records: Iterable[dict]) -> list[dict]:
    derived: list[dict] = []
    for record in converter_records:
        if _converter_kind_value(record) != "BESS":
            continue
        params = dict(record.get("params") or {})
        p_max_kw = float(params.get("pmax_mw", 0.0)) * 1000.0
        derived.append(
            {
                "id": record.get("id"),
                "name": record.get("name"),
                "params": {
                    "un_kv": params.get("un_kv"),
                    "p_charge_kw": p_max_kw,
                    "p_discharge_kw": p_max_kw,
                    "e_kwh": float(params.get("e_kwh", 0.0)),
                    "s_n_kva": float(params.get("sn_mva", 0.0)) * 1000.0,
                    "manufacturer": params.get("manufacturer"),
                    "dynamic_profile_id": params.get("dynamic_profile_id"),
                    **_copy_catalog_quality(record),
                },
            }
        )
    return derived


def _derive_inverter_records(converter_records: Iterable[dict]) -> list[dict]:
    derived: list[dict] = []
    for record in converter_records:
        params = dict(record.get("params") or {})
        kind = _converter_kind_value(record) or "INVERTER"
        derived.append(
            {
                "id": record.get("id"),
                "name": record.get("name"),
                "params": {
                    "un_kv": params.get("un_kv"),
                    "sn_mva": params.get("sn_mva"),
                    "pmax_mw": params.get("pmax_mw"),
                    "qmin_mvar": params.get("qmin_mvar"),
                    "qmax_mvar": params.get("qmax_mvar"),
                    "cosphi_min": params.get("cosphi_min"),
                    "cosphi_max": params.get("cosphi_max"),
                    "kind": kind,
                    "manufacturer": params.get("manufacturer"),
                    "model": params.get("model"),
                    **_copy_catalog_quality(record),
                },
            }
        )
    return derived


@dataclass(frozen=True)
class CatalogRepository:
    """
    Immutable catalog repository for type library access.

    Provides deterministic listing and lookup for catalog types.
    """

    line_types: dict[str, LineType]
    cable_types: dict[str, CableType]
    transformer_types: dict[str, TransformerType]
    switch_equipment_types: dict[str, SwitchEquipmentType]
    converter_types: dict[str, ConverterType]
    inverter_types: dict[str, InverterType]
    protection_device_types: dict[str, ProtectionDeviceType] = field(default_factory=dict)
    protection_curves: dict[str, ProtectionCurve] = field(default_factory=dict)
    protection_setting_templates: dict[str, ProtectionSettingTemplate] = field(default_factory=dict)
    # Phase 1 — extended catalog namespaces
    lv_cable_types: dict[str, LVCableType] = field(default_factory=dict)
    load_types: dict[str, LoadType] = field(default_factory=dict)
    mv_apparatus_types: dict[str, MVApparatusType] = field(default_factory=dict)
    lv_apparatus_types: dict[str, LVApparatusType] = field(default_factory=dict)
    ct_types: dict[str, CTType] = field(default_factory=dict)
    vt_types: dict[str, VTType] = field(default_factory=dict)
    source_system_types: dict[str, SourceSystemType] = field(default_factory=dict)
    pv_inverter_types: dict[str, PVInverterType] = field(default_factory=dict)
    bess_inverter_types: dict[str, BESSInverterType] = field(default_factory=dict)
    surge_arrester_types: dict[str, SurgeArresterType] = field(default_factory=dict)
    shunt_capacitor_types: dict[str, ShuntCapacitorType] = field(default_factory=dict)
    ptpiree_generator_certificates: dict[str, PtpireeGeneratorCertificate] = field(
        default_factory=dict
    )

    @classmethod
    def from_records(
        cls,
        *,
        line_types: Iterable[dict],
        cable_types: Iterable[dict],
        transformer_types: Iterable[dict],
        switch_equipment_types: Iterable[dict] | None = None,
        converter_types: Iterable[dict] | None = None,
        inverter_types: Iterable[dict] | None = None,
        protection_device_types: Iterable[dict] | None = None,
        protection_curves: Iterable[dict] | None = None,
        protection_setting_templates: Iterable[dict] | None = None,
        lv_cable_types: Iterable[dict] | None = None,
        load_types: Iterable[dict] | None = None,
        mv_apparatus_types: Iterable[dict] | None = None,
        lv_apparatus_types: Iterable[dict] | None = None,
        ct_types: Iterable[dict] | None = None,
        vt_types: Iterable[dict] | None = None,
        source_system_types: Iterable[dict] | None = None,
        pv_inverter_types: Iterable[dict] | None = None,
        bess_inverter_types: Iterable[dict] | None = None,
        surge_arrester_types: Iterable[dict] | None = None,
        shunt_capacitor_types: Iterable[dict] | None = None,
        ptpiree_generator_certificates: Iterable[dict] | None = None,
    ) -> CatalogRepository:
        def _build_line_type(record: dict) -> LineType:
            data = {"id": record.get("id"), "name": record.get("name")}
            data.update(record.get("params") or {})
            return LineType.from_dict(data)

        def _build_cable_type(record: dict) -> CableType:
            data = {"id": record.get("id"), "name": record.get("name")}
            data.update(record.get("params") or {})
            return CableType.from_dict(data)

        def _build_transformer_type(record: dict) -> TransformerType:
            data = {"id": record.get("id"), "name": record.get("name")}
            data.update(record.get("params") or {})
            return TransformerType.from_dict(data)

        def _build_switch_equipment_type(record: dict) -> SwitchEquipmentType:
            data = {"id": record.get("id"), "name": record.get("name")}
            data.update(record.get("params") or {})
            return SwitchEquipmentType.from_dict(data)

        def _build_inverter_type(record: dict) -> InverterType:
            data = {"id": record.get("id"), "name": record.get("name")}
            data.update(record.get("params") or {})
            return InverterType.from_dict(data)

        def _build_converter_type(record: dict) -> ConverterType:
            data = {"id": record.get("id"), "name": record.get("name")}
            data.update(record.get("params") or {})
            return ConverterType.from_dict(data)

        def _build_protection_device_type(record: dict) -> ProtectionDeviceType:
            data = {"id": record.get("id"), "name_pl": record.get("name_pl")}
            data.update(record.get("params") or {})
            return ProtectionDeviceType.from_dict(data)

        def _build_protection_curve(record: dict) -> ProtectionCurve:
            data = {"id": record.get("id"), "name_pl": record.get("name_pl")}
            data.update(record.get("params") or {})
            return ProtectionCurve.from_dict(data)

        def _build_protection_setting_template(record: dict) -> ProtectionSettingTemplate:
            data = {"id": record.get("id"), "name_pl": record.get("name_pl")}
            data.update(record.get("params") or {})
            return ProtectionSettingTemplate.from_dict(data)

        def _build_lv_cable_type(record: dict) -> LVCableType:
            data = {"id": record.get("id"), "name": record.get("name")}
            data.update(record.get("params") or {})
            return LVCableType.from_dict(data)

        def _build_load_type(record: dict) -> LoadType:
            data = {"id": record.get("id"), "name": record.get("name")}
            data.update(record.get("params") or {})
            return LoadType.from_dict(data)

        def _build_mv_apparatus_type(record: dict) -> MVApparatusType:
            data = {"id": record.get("id"), "name": record.get("name")}
            data.update(record.get("params") or {})
            return MVApparatusType.from_dict(data)

        def _build_lv_apparatus_type(record: dict) -> LVApparatusType:
            data = {"id": record.get("id"), "name": record.get("name")}
            data.update(record.get("params") or {})
            return LVApparatusType.from_dict(data)

        def _build_ct_type(record: dict) -> CTType:
            data = {"id": record.get("id"), "name": record.get("name")}
            data.update(record.get("params") or {})
            return CTType.from_dict(data)

        def _build_vt_type(record: dict) -> VTType:
            data = {"id": record.get("id"), "name": record.get("name")}
            data.update(record.get("params") or {})
            return VTType.from_dict(data)

        def _build_source_system_type(record: dict) -> SourceSystemType:
            data = {"id": record.get("id"), "name": record.get("name")}
            data.update(record.get("params") or {})
            return SourceSystemType.from_dict(data)

        def _build_pv_inverter_type(record: dict) -> PVInverterType:
            data = {"id": record.get("id"), "name": record.get("name")}
            data.update(record.get("params") or {})
            return PVInverterType.from_dict(data)

        def _build_bess_inverter_type(record: dict) -> BESSInverterType:
            data = {"id": record.get("id"), "name": record.get("name")}
            data.update(record.get("params") or {})
            return BESSInverterType.from_dict(data)

        def _build_surge_arrester_type(record: dict) -> SurgeArresterType:
            data = {"id": record.get("id"), "name": record.get("name")}
            data.update(record.get("params") or {})
            return SurgeArresterType.from_dict(data)

        def _build_shunt_capacitor_type(record: dict) -> ShuntCapacitorType:
            data = {"id": record.get("id"), "name": record.get("name")}
            data.update(record.get("params") or {})
            return ShuntCapacitorType.from_dict(data)

        def _build_ptpiree_generator_certificate(
            record: dict,
        ) -> PtpireeGeneratorCertificate:
            return _certyfikat_ptpiree_z_memo(record)

        switch_records = list(switch_equipment_types or [])
        converter_records = list(converter_types or [])
        inverter_records = list(inverter_types or [])
        protection_device_records = list(protection_device_types or [])
        protection_curve_records = list(protection_curves or [])
        protection_setting_template_records = list(protection_setting_templates or [])
        if not converter_records and inverter_records:
            converter_records = inverter_records
        if not inverter_records and converter_records:
            inverter_records = _derive_inverter_records(converter_records)
        mv_apparatus_records = list(mv_apparatus_types or [])
        if not mv_apparatus_records and switch_records:
            mv_apparatus_records = _derive_mv_apparatus_records(switch_records)
        pv_records = list(pv_inverter_types or [])
        if not pv_records and converter_records:
            pv_records = _derive_pv_records(converter_records)
        bess_records = list(bess_inverter_types or [])
        if not bess_records and converter_records:
            bess_records = _derive_bess_records(converter_records)
        return cls(
            line_types={str(item.id): item for item in map(_build_line_type, line_types)},
            cable_types={str(item.id): item for item in map(_build_cable_type, cable_types)},
            transformer_types={
                str(item.id): item for item in map(_build_transformer_type, transformer_types)
            },
            switch_equipment_types={
                str(item.id): item for item in map(_build_switch_equipment_type, switch_records)
            },
            converter_types={
                str(item.id): item for item in map(_build_converter_type, converter_records)
            },
            inverter_types={
                str(item.id): item for item in map(_build_inverter_type, inverter_records)
            },
            protection_device_types={
                str(item.id): item
                for item in map(_build_protection_device_type, protection_device_records)
            },
            protection_curves={
                str(item.id): item
                for item in map(_build_protection_curve, protection_curve_records)
            },
            protection_setting_templates={
                str(item.id): item
                for item in map(
                    _build_protection_setting_template, protection_setting_template_records
                )
            },
            lv_cable_types={
                str(item.id): item for item in map(_build_lv_cable_type, list(lv_cable_types or []))
            },
            load_types={
                str(item.id): item for item in map(_build_load_type, list(load_types or []))
            },
            mv_apparatus_types={
                str(item.id): item for item in map(_build_mv_apparatus_type, mv_apparatus_records)
            },
            lv_apparatus_types={
                str(item.id): item
                for item in map(_build_lv_apparatus_type, list(lv_apparatus_types or []))
            },
            ct_types={str(item.id): item for item in map(_build_ct_type, list(ct_types or []))},
            vt_types={str(item.id): item for item in map(_build_vt_type, list(vt_types or []))},
            source_system_types={
                str(item.id): item
                for item in map(_build_source_system_type, list(source_system_types or []))
            },
            pv_inverter_types={
                str(item.id): item for item in map(_build_pv_inverter_type, pv_records)
            },
            bess_inverter_types={
                str(item.id): item for item in map(_build_bess_inverter_type, bess_records)
            },
            surge_arrester_types={
                str(item.id): item
                for item in map(_build_surge_arrester_type, list(surge_arrester_types or []))
            },
            shunt_capacitor_types={
                str(item.id): item
                for item in map(_build_shunt_capacitor_type, list(shunt_capacitor_types or []))
            },
            ptpiree_generator_certificates={
                str(item.id): item
                for item in map(
                    _build_ptpiree_generator_certificate,
                    list(ptpiree_generator_certificates or []),
                )
            },
        )

    def list_line_types(self) -> list[LineType]:
        return self._sorted(self.line_types.values())

    def list_cable_types(self) -> list[CableType]:
        return self._sorted(self.cable_types.values())

    def list_transformer_types(self) -> list[TransformerType]:
        return self._sorted(self.transformer_types.values())

    def list_switch_equipment_types(self) -> list[SwitchEquipmentType]:
        return self._sorted(self.switch_equipment_types.values())

    def list_converter_types(self, kind: ConverterKind | None = None) -> list[ConverterType]:
        values: list[ConverterType] = list(self.converter_types.values())
        if kind is not None:
            values = [item for item in values if item.kind == kind]
        return sorted(values, key=lambda item: str(item.id))

    def list_inverter_types(self) -> list[InverterType]:
        return self._sorted(self.inverter_types.values())

    def get_line_type(self, type_id: str) -> LineType | None:
        return self.line_types.get(str(type_id))

    def get_cable_type(self, type_id: str) -> CableType | None:
        return self.cable_types.get(str(type_id))

    def get_transformer_type(self, type_id: str) -> TransformerType | None:
        return self.transformer_types.get(str(type_id))

    def get_switch_equipment_type(self, type_id: str) -> SwitchEquipmentType | None:
        return self.switch_equipment_types.get(str(type_id))

    def get_converter_type(self, type_id: str) -> ConverterType | None:
        return self.converter_types.get(str(type_id))

    def get_inverter_type(self, type_id: str) -> InverterType | None:
        return self.inverter_types.get(str(type_id))

    def list_protection_device_types(self) -> list[ProtectionDeviceType]:
        return self._sorted_pl(self.protection_device_types.values())

    def list_protection_curves(self) -> list[ProtectionCurve]:
        return self._sorted_pl(self.protection_curves.values())

    def list_protection_setting_templates(self) -> list[ProtectionSettingTemplate]:
        return self._sorted_pl(self.protection_setting_templates.values())

    def get_protection_device_type(self, type_id: str) -> ProtectionDeviceType | None:
        return self.protection_device_types.get(str(type_id))

    def get_protection_curve(self, type_id: str) -> ProtectionCurve | None:
        return self.protection_curves.get(str(type_id))

    def get_protection_setting_template(self, type_id: str) -> ProtectionSettingTemplate | None:
        return self.protection_setting_templates.get(str(type_id))

    # --- Phase 1: Extended namespace accessors ---

    def list_lv_cable_types(self) -> list[LVCableType]:
        return self._sorted(self.lv_cable_types.values())

    def get_lv_cable_type(self, type_id: str) -> LVCableType | None:
        return self.lv_cable_types.get(str(type_id))

    def list_load_types(self) -> list[LoadType]:
        return self._sorted(self.load_types.values())

    def get_load_type(self, type_id: str) -> LoadType | None:
        return self.load_types.get(str(type_id))

    def list_mv_apparatus_types(self) -> list[MVApparatusType]:
        return self._sorted(self.mv_apparatus_types.values())

    def get_mv_apparatus_type(self, type_id: str) -> MVApparatusType | None:
        return self.mv_apparatus_types.get(str(type_id))

    def list_lv_apparatus_types(self) -> list[LVApparatusType]:
        return self._sorted(self.lv_apparatus_types.values())

    def get_lv_apparatus_type(self, type_id: str) -> LVApparatusType | None:
        return self.lv_apparatus_types.get(str(type_id))

    def list_ct_types(self) -> list[CTType]:
        return self._sorted(self.ct_types.values())

    def get_ct_type(self, type_id: str) -> CTType | None:
        return self.ct_types.get(str(type_id))

    def list_vt_types(self) -> list[VTType]:
        return self._sorted(self.vt_types.values())

    def get_vt_type(self, type_id: str) -> VTType | None:
        return self.vt_types.get(str(type_id))

    def list_source_system_types(self) -> list[SourceSystemType]:
        return self._sorted(self.source_system_types.values())

    def get_source_system_type(self, type_id: str) -> SourceSystemType | None:
        return self.source_system_types.get(str(type_id))

    def list_pv_inverter_types(self) -> list[PVInverterType]:
        return self._sorted(self.pv_inverter_types.values())

    def get_pv_inverter_type(self, type_id: str) -> PVInverterType | None:
        return self.pv_inverter_types.get(str(type_id))

    def list_bess_inverter_types(self) -> list[BESSInverterType]:
        return self._sorted(self.bess_inverter_types.values())

    def get_bess_inverter_type(self, type_id: str) -> BESSInverterType | None:
        return self.bess_inverter_types.get(str(type_id))

    def list_surge_arrester_types(self) -> list[SurgeArresterType]:
        return self._sorted(self.surge_arrester_types.values())

    def get_surge_arrester_type(self, type_id: str) -> SurgeArresterType | None:
        return self.surge_arrester_types.get(str(type_id))

    def list_shunt_capacitor_types(self) -> list[ShuntCapacitorType]:
        return self._sorted(self.shunt_capacitor_types.values())

    def get_shunt_capacitor_type(self, type_id: str) -> ShuntCapacitorType | None:
        return self.shunt_capacitor_types.get(str(type_id))

    def list_ptpiree_generator_certificates(self) -> list[PtpireeGeneratorCertificate]:
        return sorted(
            self.ptpiree_generator_certificates.values(),
            key=lambda item: (str(item.manufacturer), str(item.model), str(item.id)),
        )

    def get_ptpiree_generator_certificate(
        self,
        type_id: str,
    ) -> PtpireeGeneratorCertificate | None:
        return self.ptpiree_generator_certificates.get(str(type_id))

    @staticmethod
    def _sorted(values: Iterable) -> list:
        return sorted(values, key=lambda item: (str(item.name), str(item.id)))

    @staticmethod
    def _sorted_pl(values: Iterable) -> list:
        """Sort protection types by name_pl, then id (deterministic)."""
        return sorted(values, key=lambda item: (str(item.name_pl), str(item.id)))


#: Memoizacja CALEGO kanonicznego repozytorium katalogowego (V12K-322, dlug 9 / DET-9).
#: Bez memo `get_default_mv_catalog()` odbudowywalo komplet slownikow typow przy KAZDYM
#: wywolaniu (zmierzone 89 ms), a pojedyncza operacja domenowa wola je 18 razy przez
#: `_get_catalog_safe()` (`enm/domain_operations.py`) — profil `insert_station_on_segment_sn`
#: pokazal 1,61 s katalogu na 1,69 s calej operacji, czyli ~95% czasu na przebudowie tych
#: samych, NIEZMIENNYCH danych. To ta sama klasa defektu co memo obiektow PTPiREE nizej,
#: tyle ze o poziom wyzej: tam zapamietano LISCIE, tu zapamietujemy caly agregat.
#: Bezpieczenstwo wspoldzielenia: rekordy zrodlowe (`mv_*_catalog.get_all_*`) sa statyczne
#: (brak rejestracji w czasie zycia procesu), `CatalogRepository` jest `frozen=True` i
#: kontraktowo niezmienne ("Immutable catalog repository"), a w calym repo nie ma zapisu do
#: zadnego z jego slownikow. Swiezosc na zadanie: `get_default_mv_catalog.cache_clear()`.
@lru_cache(maxsize=1)
def get_default_mv_catalog() -> CatalogRepository:
    """
    Get default MV catalog with full equipment data.

    Returns a CatalogRepository pre-populated with:
    - Base cable types (XLPE/EPR, Cu/Al, 1-core/3-core, 70-400mm²)
    - Base overhead line types (Al/Al-St, 25-150mm²)
    - Manufacturer-specific cable/line types (NKT, Tele-Fonika Kable)
    - Power transformers WN/SN (110/15 kV, 110/20 kV): 16-63 MVA Yd11
    - Distribution transformers SN/nN (15/0.4, 20/0.4 kV): 63-1000 kVA Dyn11/Yd11
    - Switching equipment (breakers, load switches, disconnectors, reclosers, fuses)
    - Converter-based sources (PV, wind, BESS)

    This is the canonical catalog for MV network design.
    """
    from .mv_auxiliary_catalog import (
        get_all_ct_types,
        get_all_load_types,
        get_all_lv_apparatus_types,
        get_all_lv_cable_types,
        get_all_protection_curves,
        get_all_protection_device_types,
        get_all_protection_setting_templates,
        get_all_vt_types,
    )
    from .mv_cable_line_catalog import get_all_cable_types, get_all_line_types
    from .mv_converter_catalog import get_all_converter_types
    from .mv_ptpiree_catalog import get_all_ptpiree_generator_certificates
    from .mv_shunt_capacitor_catalog import get_all_shunt_capacitor_records
    from .mv_source_catalog import get_all_source_system_types
    from .mv_surge_arrester_catalog import get_all_surge_arrester_types
    from .mv_switch_catalog import get_all_switch_equipment_types
    from .mv_transformer_catalog import get_all_transformer_types

    return CatalogRepository.from_records(
        line_types=get_all_line_types(),
        cable_types=get_all_cable_types(),
        transformer_types=get_all_transformer_types(),
        switch_equipment_types=get_all_switch_equipment_types(),
        converter_types=get_all_converter_types(),
        inverter_types=[],
        protection_device_types=get_all_protection_device_types(),
        protection_curves=get_all_protection_curves(),
        protection_setting_templates=get_all_protection_setting_templates(),
        lv_cable_types=get_all_lv_cable_types(),
        load_types=get_all_load_types(),
        lv_apparatus_types=get_all_lv_apparatus_types(),
        ct_types=get_all_ct_types(),
        vt_types=get_all_vt_types(),
        source_system_types=get_all_source_system_types(),
        surge_arrester_types=get_all_surge_arrester_types(),
        shunt_capacitor_types=get_all_shunt_capacitor_records(),
        ptpiree_generator_certificates=get_all_ptpiree_generator_certificates(),
    )
