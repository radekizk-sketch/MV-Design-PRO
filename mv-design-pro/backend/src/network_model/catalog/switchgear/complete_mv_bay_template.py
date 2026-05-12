"""CompleteMvBayTemplate — szablon pola SN per producent (kompozycja).

Goal §11A.5: szablon pola producenta generuje pełny układ aparatów + porty +
LOD + readiness + proof/report lineage.

**Architektura: kompozycja** (`base_template: BayTemplate`) zamiast dziedziczenia
po `BayTemplate`. Powód (recenzja planu): „Dziedziczenie tylko jeśli obecny
model Pydantic jest stabilny i testy to pokryją. Bezpieczniej: kompozycja
albo rozszerzony wrapper."

Każdy `CompleteMvBayTemplate` ma:
- `base_template: BayTemplate` — referencyjny układ aparatury (10 kanonów
  pozostaje jako `source_status='canonical_fallback'`),
- `manufacturer_ref`, `switchgear_family_ref` — kontekst producenta,
- `bay_kind`, `bay_role` — funkcja pola (liniowe / transformatorowe / DER...),
- `source_status` — kanon źródła (oficjalny katalog / repo verified / user /
  canonical_fallback / requires_catalog),
- `source_refs`, `version`, `hash` — śledzenie lineage do raportu i proof.

Reguła: szablon o `source_status == 'requires_catalog'` (brak producenta
zweryfikowanego) NIE jest renderowany jako "oficjalny katalog producenta";
UI ma badge ostrzegawczy „Wymaga uzupełnienia katalogu".
"""

from __future__ import annotations

import hashlib
import json
from typing import Literal

from pydantic import BaseModel, Field

from ..bay_templates import BayTemplate

BayKind = Literal[
    "liniowe_doplywowe",
    "liniowe_odplywowe",
    "transformatorowe",
    "pomiarowe",
    "sprzeglowe_podluzne",
    "sprzeglowe_poprzeczne",
    "sekcyjne",
    "potrzeb_wlasnych",
    "odgromnikowe",
    "pv",
    "bess",
    "fw",
    "rezerwowe",
    "kablowe",
    "napowietrzne",
    "nop_lacznikowe",
]

SourceStatus = Literal[
    "official_catalog",
    "repo_verified",
    "user_defined",
    "canonical_fallback",
    "requires_catalog",
    "incomplete_requires_review",
]


class CompleteMvBayTemplate(BaseModel):
    """Pełny szablon pola SN — kompozycja BayTemplate + meta producenta.

    Wykorzystywany do:
    - generowania pola w GPZ / stacji (`StationConfigurator`, `FieldWorkspace`),
    - readiness blockera `MANUFACTURER_CATALOG_MISSING` gdy `source_status ==
      'requires_catalog'`,
    - lineage w raporcie i proof.
    """

    template_ref: str
    base_template: BayTemplate
    manufacturer_ref: str | None = None
    switchgear_family_ref: str | None = None
    bay_kind: BayKind = "liniowe_odplywowe"
    bay_role: Literal["IN", "OUT", "TR", "COUPLER", "FEEDER", "MEASUREMENT", "OZE"] = "OUT"
    source_status: SourceStatus = "requires_catalog"
    source_refs: list[str] = Field(default_factory=list)
    version: str = "1.0"
    hash: str = ""
    notes_pl: str | None = None

    def is_verified(self) -> bool:
        return (
            self.source_status in {"official_catalog", "repo_verified"}
            and len(self.source_refs) > 0
        )

    def compute_hash(self) -> str:
        """Deterministyczny content hash (do invalidacji wyników).

        Hash zawiera: base_template (model_dump), manufacturer_ref,
        family_ref, bay_kind, bay_role, source_status. NIE zawiera
        source_refs ani version (te się zmieniają niezależnie).
        """
        payload = {
            "base_template": self.base_template.model_dump(mode="json"),
            "manufacturer_ref": self.manufacturer_ref,
            "switchgear_family_ref": self.switchgear_family_ref,
            "bay_kind": self.bay_kind,
            "bay_role": self.bay_role,
            "source_status": self.source_status,
        }
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
