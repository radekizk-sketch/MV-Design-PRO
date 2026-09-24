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

from enm.rola_pola_sn import nazwa_roli_pola_sn_z_okresleniem
from pydantic import BaseModel, Field

from ..bay_templates import BayTemplate
from .device_instance import BayDeviceInstanceTemplate
from .port_definition import PortDefinitionTemplate

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

#: Rodzaj pola katalogowego (`BayKind`) → rola kanonu ról pól SN z określeniem rodzaju albo
#: własna nazwa rodzaju bez roli kanonu (karty #141 i #142). Ta sama tablica co
#: `OPIS_RODZAJU_POLA` w `frontend/src/ui/catalog/BayTemplatePicker.tsx` — termin roli zawsze
#: z kanonu (`enm.rola_pola_sn`), rodzaj dokłada tylko określenie; parytet z frontem i
#: kompletność względem `BayKind` przypięte testem
#: `tests/enm/test_komunikaty_operacji_bez_kodow.py`.
OPIS_RODZAJU_POLA_KATALOGOWEGO: dict[str, tuple[str, str] | str] = {
    "liniowe_doplywowe": ("LINIA_IN", ""),
    "liniowe_odplywowe": ("LINIA_OUT", ""),
    "transformatorowe": ("TRANSFORMATOROWE", ""),
    "pomiarowe": ("POMIAROWE", ""),
    "sprzeglowe_podluzne": ("SPRZEGLO", "podłużnego"),
    "sprzeglowe_poprzeczne": ("SPRZEGLO", "poprzecznego"),
    "sekcyjne": "Pole sekcyjne",
    "potrzeb_wlasnych": "Pole potrzeb własnych",
    "odgromnikowe": "Pole odgromnikowe",
    "pv": ("PV_SN", ""),
    "bess": ("BESS_SN", ""),
    "fw": ("FW_SN", ""),
    "rezerwowe": "Pole rezerwowe",
    "kablowe": "Pole kablowe",
    "napowietrzne": "Pole napowietrzne",
    "nop_lacznikowe": "Pole łącznikowe NOP",
}

#: Rodzaj pola katalogowego → nazwa w treści dla projektanta (karta #142).
NAZWY_RODZAJOW_POLA_KATALOGOWEGO_PL: dict[str, str] = {
    rodzaj: opis if isinstance(opis, str) else nazwa_roli_pola_sn_z_okresleniem(*opis)
    for rodzaj, opis in OPIS_RODZAJU_POLA_KATALOGOWEGO.items()
}


def nazwa_rodzaju_pola_katalogowego_pl(bay_kind: object) -> str:
    """Nazwa rodzaju pola katalogowego; rodzaj spoza słownika = „Pole innego rodzaju"."""
    return NAZWY_RODZAJOW_POLA_KATALOGOWEGO_PL.get(str(bay_kind), "Pole innego rodzaju")


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
    # §11A.2 rozszerzenie — szablon pola producenta generuje pełne SLD pole.
    template_name_pl: str | None = None
    template_code: str | None = None
    device_instances: list[BayDeviceInstanceTemplate] = Field(default_factory=list)
    port_definitions: list[PortDefinitionTemplate] = Field(default_factory=list)
    interlock_rules: list[str] = Field(default_factory=list)
    operation_rules: list[str] = Field(default_factory=list)
    protection_requirements: list[str] = Field(default_factory=list)
    measurement_requirements: list[str] = Field(default_factory=list)
    readiness_requirements: list[str] = Field(default_factory=list)
    lod_variants: list[str] = Field(default_factory=lambda: ["LOD0", "LOD1", "LOD2", "LOD3"])
    cad_anchors: dict[str, str] = Field(default_factory=dict)
    label_slots: list[str] = Field(default_factory=list)
    version: str = "1.0"
    hash: str = ""
    notes_pl: str | None = None

    def opis_pl(self, family_name: str | None = None) -> str:
        """Pole katalogowe w środku zdania — nigdy referencja szablonu (karta #142).

        „pole „Nazwa katalogowa”" albo rodzaj pola małą literą („pole liniowe wyjściowe"),
        z dopiskiem „rodziny X", gdy wołający zna nazwę rodziny i zdanie jej nie niesie.
        """
        if self.template_name_pl and self.template_name_pl.strip():
            opis = f"pole „{self.template_name_pl.strip()}”"
        else:
            rodzaj = nazwa_rodzaju_pola_katalogowego_pl(self.bay_kind)
            opis = rodzaj[:1].lower() + rodzaj[1:]
        return f"{opis} rodziny {family_name}" if family_name else opis

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
