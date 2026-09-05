"""Koperta rewizji biegu — CO DOKLADNIE policzono (CV-2, `RevisionEnvelope`).

Bieg kanoniczny (`enm/canonical_analysis.CanonicalRun`) niosl dotad `snapshot_hash`
(hash modelu) i `input_hash` (hash opcji). Nie niosl: numeru rewizji modelu (wiec
„ktora zmiana uniewaznila wynik" wymagalo zgadywania po hashu), odcisku katalogu
(zmiana typu katalogowego nie uniewazniala niczego) ani jednego odcisku
semantycznego, po ktorym dwa biegi mozna uznac za TEN SAM bieg. Koperta zamyka to
jednym, zamrozonym rekordem zapisywanym addytywnie na biegu (`envelope_json`).

Swiezosc wyniku jest odtad WYPROWADZANA z koperty (`enm/swiezosc.py`), nie
zapisywana przez „unieważniacze" — porownanie `model_revision` i
`catalog_fingerprint` z biezacym stanem projektu jest jedynym zrodlem prawdy.

Pola `variation_ref` / `scenario_ref` DODAJE CV-3 (OperatingScenario) — nie
deklarujemy pol bez dostawcy.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

#: Wersja kontraktu koperty — zmiana zbioru pol semantycznych = nowa wersja.
WERSJA_KOPERTY = 1


def _odcisk_semantyczny(
    *,
    project_id: str | None,
    model_revision: int,
    snapshot_hash: str,
    catalog_fingerprint: str,
    options_hash: str,
) -> str:
    """SHA-256 nad kanonicznym JSON pol semantycznych (bez czasu, bez id biegu)."""
    payload = {
        "wersja": WERSJA_KOPERTY,
        "project_id": project_id,
        "model_revision": model_revision,
        "snapshot_hash": snapshot_hash,
        "catalog_fingerprint": catalog_fingerprint,
        "options_hash": options_hash,
    }
    tekst = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(tekst.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class RevisionEnvelope:
    project_id: str | None
    model_revision: int
    snapshot_hash: str
    catalog_fingerprint: str
    options_hash: str
    semantic_fingerprint: str

    @property
    def spojna(self) -> bool:
        """Czy `semantic_fingerprint` zgadza sie z pozostalymi polami (koperta
        odczytana z bazy mogla zostac zmieniona recznie)."""
        return self.semantic_fingerprint == _odcisk_semantyczny(
            project_id=self.project_id,
            model_revision=self.model_revision,
            snapshot_hash=self.snapshot_hash,
            catalog_fingerprint=self.catalog_fingerprint,
            options_hash=self.options_hash,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "wersja": WERSJA_KOPERTY,
            "project_id": self.project_id,
            "model_revision": self.model_revision,
            "snapshot_hash": self.snapshot_hash,
            "catalog_fingerprint": self.catalog_fingerprint,
            "options_hash": self.options_hash,
            "semantic_fingerprint": self.semantic_fingerprint,
        }

    @staticmethod
    def from_dict(dane: Any) -> RevisionEnvelope | None:
        """Koperta z zapisu bazy; `None` dla biegu bez koperty (sprzed CV-2) albo
        zapisu o niekanonicznej postaci — wolajacy traktuje to jako BRAK koperty,
        nigdy jako koperte zgadnieta."""
        if not isinstance(dane, dict):
            return None
        try:
            model_revision = int(dane["model_revision"])
            snapshot_hash = str(dane["snapshot_hash"])
            catalog_fingerprint = str(dane["catalog_fingerprint"])
            options_hash = str(dane["options_hash"])
            semantic_fingerprint = str(dane["semantic_fingerprint"])
        except (KeyError, TypeError, ValueError):
            return None
        project_id = dane.get("project_id")
        return RevisionEnvelope(
            project_id=str(project_id) if project_id is not None else None,
            model_revision=model_revision,
            snapshot_hash=snapshot_hash,
            catalog_fingerprint=catalog_fingerprint,
            options_hash=options_hash,
            semantic_fingerprint=semantic_fingerprint,
        )


def zbuduj_koperte(
    *,
    project_id: str | None,
    model_revision: int,
    snapshot_hash: str,
    catalog_fingerprint: str,
    options_hash: str,
) -> RevisionEnvelope:
    return RevisionEnvelope(
        project_id=project_id,
        model_revision=model_revision,
        snapshot_hash=snapshot_hash,
        catalog_fingerprint=catalog_fingerprint,
        options_hash=options_hash,
        semantic_fingerprint=_odcisk_semantyczny(
            project_id=project_id,
            model_revision=model_revision,
            snapshot_hash=snapshot_hash,
            catalog_fingerprint=catalog_fingerprint,
            options_hash=options_hash,
        ),
    )
