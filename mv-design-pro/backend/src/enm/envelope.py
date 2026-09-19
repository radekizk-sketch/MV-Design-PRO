"""Koperta rewizji biegu — CO DOKLADNIE policzono (CV-2, `RevisionEnvelope`).

Bieg kanoniczny (`enm/canonical_analysis.CanonicalRun`) niosl dotad `snapshot_hash`
(hash modelu) i `input_hash` (hash opcji). Nie niosl: numeru rewizji modelu (wiec
„ktora zmiana uniewaznila wynik" wymagalo zgadywania po hashu), odcisku katalogu
(zmiana typu katalogowego nie uniewazniala niczego) ani jednego odcisku
semantycznego, po ktorym dwa biegi mozna uznac za TEN SAM bieg. Koperta zamyka to
jednym, zamrozonym rekordem zapisywanym addytywnie na biegu (`envelope_json`).

Swiezosc wyniku jest odtad WYPROWADZANA z koperty (`application/result_freshness.py`), nie
zapisywana przez „unieważniacze" — porownanie `model_revision` i
`catalog_fingerprint` z biezacym stanem projektu jest jedynym zrodlem prawdy.

CV-3.1: koperta niesie `scenario_ref` = (identyfikator, rewizja) i `scenario_hash`
scenariusza roboczego (`enm/scenariusze.py`), gdy bieg policzono NA SCENARIUSZU.
`snapshot_hash` koperty jest ZAWSZE hashem modelu projektu w `model_revision`
(bazy, na ktora nalozono scenariusz) — to z nim swiezosc porownuje biezacy HEAD;
hash MIGAWKI EFEKTYWNEJ (tego, co policzono) niesie `CanonicalRun.snapshot_hash`
i dla biegu ze scenariuszem z nadpisaniami rozni sie od hasha koperty.
Koperta bez scenariusza jest zapisem WERSJI 1 (bieg na stanie normalnym) — jej
ladunek i odcisk semantyczny sa bit w bit takie same jak przed CV-3.1, wiec
biegi zapisane wczesniej czytaja sie jako biegi stanu normalnego bez migracji.
Koperta ze scenariuszem jest WERSJA 2 (odcisk semantyczny obejmuje oba pola).
`variation_ref` (wariant strukturalny) nadal nie ma dostawcy — nie wchodzi.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

#: Wersja kontraktu koperty BEZ scenariusza (bieg na stanie normalnym).
WERSJA_KOPERTY = 1
#: Wersja kontraktu koperty ZE scenariuszem roboczym (CV-3.1).
WERSJA_KOPERTY_SCENARIUSZ = 2


def wersja_koperty(scenario_ref: tuple[str, int] | None) -> int:
    """JEDYNA regula wersji: brak scenariusza = 1 (ladunek sprzed CV-3.1), scenariusz = 2."""
    return WERSJA_KOPERTY if scenario_ref is None else WERSJA_KOPERTY_SCENARIUSZ


def _odcisk_semantyczny(
    *,
    project_id: str | None,
    model_revision: int,
    snapshot_hash: str,
    catalog_fingerprint: str,
    options_hash: str,
    scenario_ref: tuple[str, int] | None = None,
    scenario_hash: str | None = None,
) -> str:
    """SHA-256 nad kanonicznym JSON pol semantycznych (bez czasu, bez id biegu).

    Koperta wersji 1 hashuje DOKLADNIE ten sam ladunek co przed CV-3.1 — odciski
    zapisanych biegow pozostaja spojne bez migracji.
    """
    payload: dict[str, Any] = {
        "wersja": wersja_koperty(scenario_ref),
        "project_id": project_id,
        "model_revision": model_revision,
        "snapshot_hash": snapshot_hash,
        "catalog_fingerprint": catalog_fingerprint,
        "options_hash": options_hash,
    }
    if scenario_ref is not None:
        payload["scenario_ref"] = [scenario_ref[0], scenario_ref[1]]
        payload["scenario_hash"] = scenario_hash
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
    #: CV-3.1: scenariusz roboczy biegu — (identyfikator, rewizja) i hash tresci.
    #: `None` = bieg na stanie normalnym (koperta wersji 1).
    scenario_ref: tuple[str, int] | None = None
    scenario_hash: str | None = None

    @property
    def wersja(self) -> int:
        return wersja_koperty(self.scenario_ref)

    @property
    def spojna(self) -> bool:
        """Czy `semantic_fingerprint` zgadza sie z pozostalymi polami (koperta
        odczytana z bazy mogla zostac zmieniona recznie)."""
        if (self.scenario_ref is None) != (self.scenario_hash is None):
            return False
        return self.semantic_fingerprint == _odcisk_semantyczny(
            project_id=self.project_id,
            model_revision=self.model_revision,
            snapshot_hash=self.snapshot_hash,
            catalog_fingerprint=self.catalog_fingerprint,
            options_hash=self.options_hash,
            scenario_ref=self.scenario_ref,
            scenario_hash=self.scenario_hash,
        )

    def to_dict(self) -> dict[str, Any]:
        dane: dict[str, Any] = {
            "wersja": self.wersja,
            "project_id": self.project_id,
            "model_revision": self.model_revision,
            "snapshot_hash": self.snapshot_hash,
            "catalog_fingerprint": self.catalog_fingerprint,
            "options_hash": self.options_hash,
            "semantic_fingerprint": self.semantic_fingerprint,
        }
        if self.scenario_ref is not None:
            dane["scenario_ref"] = {
                "scenario_id": self.scenario_ref[0],
                "revision": self.scenario_ref[1],
            }
            dane["scenario_hash"] = self.scenario_hash
        return dane

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
        scenario_ref: tuple[str, int] | None = None
        scenario_hash: str | None = None
        surowy_ref = dane.get("scenario_ref")
        if surowy_ref is not None:
            # Koperta wersji 2: scenariusz bez rewizji albo bez hasha to zapis
            # niekanoniczny — BRAK koperty, nie koperta zgadnieta.
            try:
                scenario_ref = (str(surowy_ref["scenario_id"]), int(surowy_ref["revision"]))
                scenario_hash = str(dane["scenario_hash"])
            except (KeyError, TypeError, ValueError):
                return None
        return RevisionEnvelope(
            project_id=str(project_id) if project_id is not None else None,
            model_revision=model_revision,
            snapshot_hash=snapshot_hash,
            catalog_fingerprint=catalog_fingerprint,
            options_hash=options_hash,
            semantic_fingerprint=semantic_fingerprint,
            scenario_ref=scenario_ref,
            scenario_hash=scenario_hash,
        )


def zbuduj_koperte(
    *,
    project_id: str | None,
    model_revision: int,
    snapshot_hash: str,
    catalog_fingerprint: str,
    options_hash: str,
    scenario_ref: tuple[str, int] | None = None,
    scenario_hash: str | None = None,
) -> RevisionEnvelope:
    if (scenario_ref is None) != (scenario_hash is None):
        raise ValueError("scenario_ref i scenario_hash koperty podaje sie razem albo wcale")
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
            scenario_ref=scenario_ref,
            scenario_hash=scenario_hash,
        ),
        scenario_ref=scenario_ref,
        scenario_hash=scenario_hash,
    )
