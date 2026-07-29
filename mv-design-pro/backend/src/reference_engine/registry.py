"""Reference Engine V1 — rejestr pakietów referencyjnych.

REFERENCE_ENGINE_SPEC_V1.md §2/§5 (V12K-060). Ładuje pakiety z
`packs/*/pack.json` (wersjonowane DANE — pkt 11 dyrektywy), waliduje je
Pydantic przy imporcie i egzekwuje spójność krzyżową:

- pakiet `manufacturer` MUSI wskazywać istniejącą rodzinę w
  `SWITCHGEAR_FAMILY_REGISTRY` (dane rodziny mają jedno źródło — katalog),
- dokładnie jeden pakiet niesie `field_profiles` (V1: `iec62271`) —
  profile pól nie mogą mieć drugiej definicji (pkt 10/12 dyrektywy),
- identyfikatory profili unikalne.

Mapowanie pole→profil (`profile_id_for_bay`) jest lustrem frontendowego
`mapStationBayRoleToMiniRole` (v2/canvas/enmToSldAdapter.ts): stacje inne
niż GPZ = technologia RMU (V12K-031-A), GPZ = technologia wyłącznikowa.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path

from network_model.catalog.switchgear import SWITCHGEAR_FAMILY_REGISTRY, SwitchgearFamily

from .models import ReferenceFieldProfile, ReferencePack

_PACKS_DIR = Path(__file__).resolve().parent / "packs"

# Pakiet-nośnik profili pól w V1 (spec §3): profile składu/kolejności żyją
# w referencji rozdzielnicowej IEC 62271-200.
FIELD_PROFILE_PACK_ID = "iec62271"


def _load_packs() -> dict[str, ReferencePack]:
    packs: dict[str, ReferencePack] = {}
    for pack_file in sorted(_PACKS_DIR.glob("*/pack.json")):
        data = json.loads(pack_file.read_text(encoding="utf-8"))
        pack = ReferencePack.model_validate(data)
        if pack.pack_id != pack_file.parent.name:
            raise ValueError(
                f"Pack id mismatch: katalog '{pack_file.parent.name}' "
                f"niesie pack_id '{pack.pack_id}' — nazwy muszą być zgodne."
            )
        if pack.pack_id in packs:
            raise ValueError(f"Duplicate pack_id: {pack.pack_id}")
        packs[pack.pack_id] = pack

    # Spójność krzyżowa z katalogiem rodzin (jedno źródło danych rodziny).
    for pack in packs.values():
        if pack.kind == "manufacturer":
            if not pack.switchgear_family_ref:
                raise ValueError(f"Pakiet producencki '{pack.pack_id}' bez switchgear_family_ref.")
            if pack.switchgear_family_ref not in SWITCHGEAR_FAMILY_REGISTRY:
                raise ValueError(
                    f"Pakiet '{pack.pack_id}' wskazuje nieistniejącą rodzinę "
                    f"'{pack.switchgear_family_ref}' (katalog switchgear)."
                )
        elif pack.switchgear_family_ref is not None:
            raise ValueError(
                f"Pakiet '{pack.pack_id}' (kind={pack.kind}) nie może wskazywać rodziny."
            )
        if pack.cell_configurations and pack.kind != "manufacturer":
            raise ValueError(
                f"Pakiet '{pack.pack_id}' (kind={pack.kind}) nie może nieść "
                "konfiguracji celek — to dane katalogu producenta."
            )
        for cell in pack.cell_configurations:
            if not cell.source_pl.strip():
                raise ValueError(
                    f"Pakiet '{pack.pack_id}', celka '{cell.cell_code}': brak "
                    "cytowania źródła (reguła „nie fabrykuj danych producenta”)."
                )

    # Jedna definicja profili pól (pkt 10/12 dyrektywy).
    packs_with_profiles = [p.pack_id for p in packs.values() if p.field_profiles]
    if packs_with_profiles != [FIELD_PROFILE_PACK_ID]:
        raise ValueError(
            f"Profile pól może nieść wyłącznie pakiet '{FIELD_PROFILE_PACK_ID}' "
            f"(znaleziono w: {packs_with_profiles})."
        )
    profiles = packs[FIELD_PROFILE_PACK_ID].field_profiles
    profile_ids = [p.profile_id for p in profiles]
    if len(profile_ids) != len(set(profile_ids)):
        raise ValueError(f"Zduplikowane profile_id w pakiecie {FIELD_PROFILE_PACK_ID}.")
    return packs


REFERENCE_PACK_REGISTRY: dict[str, ReferencePack] = _load_packs()

FIELD_PROFILE_REGISTRY: dict[str, ReferenceFieldProfile] = {
    profile.profile_id: profile
    for profile in REFERENCE_PACK_REGISTRY[FIELD_PROFILE_PACK_ID].field_profiles
}


def list_reference_packs() -> list[ReferencePack]:
    """Lista pakietów posortowana deterministycznie po `pack_id`."""
    return sorted(REFERENCE_PACK_REGISTRY.values(), key=lambda p: p.pack_id)


def get_reference_pack(pack_id: str) -> ReferencePack:
    """Pobiera pakiet po id. KeyError z listą dostępnych gdy brak."""
    if pack_id not in REFERENCE_PACK_REGISTRY:
        available = ", ".join(sorted(REFERENCE_PACK_REGISTRY.keys()))
        raise KeyError(f"Unknown reference pack: {pack_id}. Available: {available}")
    return REFERENCE_PACK_REGISTRY[pack_id]


def family_for_pack(pack: ReferencePack) -> SwitchgearFamily | None:
    """Rodzina rozdzielnicy z katalogu dla pakietu producenckiego (None inaczej)."""
    if pack.switchgear_family_ref is None:
        return None
    return SWITCHGEAR_FAMILY_REGISTRY[pack.switchgear_family_ref]


def profile_id_for_bay(
    bay_role: str,
    station_type: str | None,
    device_kinds: Iterable[str] = (),
) -> str | None:
    """Profil pola dla (rola pola × typ stacji) — spec §5.

    Lustro `mapStationBayRoleToMiniRole` (frontend): GPZ = technologia
    wyłącznikowa, pozostałe stacje = technologia RMU (V12K-031-A).
    Rola FEEDER obejmuje dwa kanoniczne szablony (rezerwowe / potrzeb
    własnych) — rozróżnienie deterministycznie z DANYCH pola: obecny
    bezpiecznik ⇒ profil `aux`, inaczej `reserve`.
    `None` = rola bez profilu (zero domysłu).
    """
    is_gpz = station_type == "gpz"
    if bay_role in ("IN", "OUT"):
        return "line_breaker" if is_gpz else "rmu_line"
    if bay_role == "TR":
        return "transformer_breaker" if is_gpz else "rmu_transformer"
    if bay_role == "MEASUREMENT":
        return "measurement"
    if bay_role == "COUPLER":
        return "coupler"
    if bay_role == "OZE":
        return "der_source"
    if bay_role == "FEEDER":
        return "aux" if "FUSE" in set(device_kinds) else "reserve"
    return None


def field_profile_for_bay(
    bay_role: str,
    station_type: str | None,
    device_kinds: Iterable[str] = (),
) -> ReferenceFieldProfile | None:
    """Profil pola (obiekt) dla roli i typu stacji — patrz `profile_id_for_bay`."""
    profile_id = profile_id_for_bay(bay_role, station_type, device_kinds)
    if profile_id is None:
        return None
    return FIELD_PROFILE_REGISTRY[profile_id]
