"""
Zapis sieci z arkusza XLSX do modelu projektu — warstwa aplikacji.

STAN PRZED (karta XLSX-IMPORT, pomiar 2026-08-07): koncowka `POST /api/import/xlsx`
wstrzykiwala `uow_factory`, ale NIGDY go nie uzywala — budowala graf w pamieci,
zwracala „Import zakończony pomyślnie" i wyrzucala model. Zaden projekt, zaden
wezel, zadna migawka nie powstawaly. Ten modul domyka lancuch: arkusz -> projekt
z wezlami/galeziami/zrodlami/odbiorami + MIGAWKA sieci ustawiona jako aktywna,
czyli dokladnie ten sam ksztalt danych, ktory tworzy import archiwum ZIP i
kreator sieci (jeden magazyn modelu, bez modelu-cienia).

TRANSAKCYJNOSC: zapis idzie w jednej sesji `UnitOfWork` z `commit=False` na
kazdym repozytorium. Wyjatek w polowie => `UnitOfWork.__exit__` robi rollback,
wiec po nieudanym imporcie nie zostaje projekt-kikut.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from application.network_model.identity import network_model_id_for_project
from domain.models import new_project
from infrastructure.persistence.models import (
    NetworkBranchORM,
    NetworkLoadORM,
    NetworkNodeORM,
    NetworkSourceORM,
)
from network_model.core.branch import Branch, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node
from network_model.core.snapshot import create_network_snapshot
from sqlalchemy.orm import Session

from .importer import SiecZArkusza, XlsxImportResult, XlsxNetworkImporter

STATUS_ZAIMPORTOWANO = "ZAIMPORTOWANO"
STATUS_WYMAGA_KATALOGU = "WYMAGA_MAPOWANIA_KATALOGU"
STATUS_ODRZUCONO = "ODRZUCONO"


@dataclass(frozen=True)
class PodsumowanieArkusza:
    """Liczby elementow rozpoznanych w arkuszu (zrodlo liczb dla podgladu w UI)."""

    szyny: int = 0
    odcinki: int = 0
    transformatory: int = 0
    zrodla: int = 0
    odbiory: int = 0

    def to_dict(self) -> dict[str, int]:
        return {
            "szyny": self.szyny,
            "odcinki": self.odcinki,
            "transformatory": self.transformatory,
            "zrodla": self.zrodla,
            "odbiory": self.odbiory,
        }


@dataclass(frozen=True)
class WynikPodgladu:
    """Podglad zawartosci arkusza — BEZ zapisu czegokolwiek."""

    poprawny: bool
    podsumowanie: PodsumowanieArkusza | None = None
    bledy: list[dict[str, Any]] = field(default_factory=list)
    ostrzezenia: list[str] = field(default_factory=list)
    elementy_bez_katalogu: list[str] = field(default_factory=list)
    mapowanie_katalogowe_wymagane: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "poprawny": self.poprawny,
            "podsumowanie": self.podsumowanie.to_dict() if self.podsumowanie else None,
            "bledy": self.bledy,
            "ostrzezenia": self.ostrzezenia,
            "elementy_bez_katalogu": self.elementy_bez_katalogu,
            "mapowanie_katalogowe_wymagane": self.mapowanie_katalogowe_wymagane,
        }


@dataclass(frozen=True)
class WynikImportu:
    """Wynik importu — z ADRESEM tego, co powstalo (projekt + migawka)."""

    status: str
    project_id: str | None = None
    snapshot_id: str | None = None
    odcisk_migawki: str | None = None
    podsumowanie: PodsumowanieArkusza | None = None
    bledy: list[dict[str, Any]] = field(default_factory=list)
    ostrzezenia: list[str] = field(default_factory=list)
    elementy_bez_katalogu: list[str] = field(default_factory=list)
    mapowanie_katalogowe_wymagane: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "project_id": self.project_id,
            "snapshot_id": self.snapshot_id,
            "odcisk_migawki": self.odcisk_migawki,
            "podsumowanie": self.podsumowanie.to_dict() if self.podsumowanie else None,
            "bledy": self.bledy,
            "ostrzezenia": self.ostrzezenia,
            "elementy_bez_katalogu": self.elementy_bez_katalogu,
            "mapowanie_katalogowe_wymagane": self.mapowanie_katalogowe_wymagane,
        }


class XlsxImportService:
    """Import sieci z arkusza XLSX do nowego projektu."""

    def __init__(self, session: Session, importer: XlsxNetworkImporter | None = None) -> None:
        self._session = session
        self._importer = importer or XlsxNetworkImporter()

    # ------------------------------------------------------------------
    # Podglad (bez zapisu)
    # ------------------------------------------------------------------

    def podglad(self, dane: bytes) -> WynikPodgladu:
        wynik = self._importer.import_from_bytes(dane)
        if not wynik.success:
            return WynikPodgladu(
                poprawny=False,
                bledy=[blad.to_dict() for blad in wynik.bledy],
            )
        return WynikPodgladu(
            poprawny=True,
            podsumowanie=_podsumowanie(wynik),
            ostrzezenia=wynik.warnings,
            elementy_bez_katalogu=wynik.elementy_bez_katalogu,
            mapowanie_katalogowe_wymagane=wynik.mapowanie_katalogowe_wymagane,
        )

    # ------------------------------------------------------------------
    # Import (zapis do bazy)
    # ------------------------------------------------------------------

    def importuj(self, dane: bytes, nazwa_projektu: str) -> WynikImportu:
        wynik = self._importer.import_from_bytes(dane)
        if not wynik.success or wynik.siec is None:
            return WynikImportu(
                status=STATUS_ODRZUCONO,
                bledy=[blad.to_dict() for blad in wynik.bledy],
            )

        siec = wynik.siec
        project_id = self._zapisz_projekt(nazwa_projektu, siec)
        identyfikatory = self._zapisz_elementy(project_id, siec)
        snapshot = self._zapisz_migawke(project_id, siec, identyfikatory)

        status = (
            STATUS_WYMAGA_KATALOGU if wynik.mapowanie_katalogowe_wymagane else STATUS_ZAIMPORTOWANO
        )
        return WynikImportu(
            status=status,
            project_id=str(project_id),
            snapshot_id=snapshot[0],
            odcisk_migawki=snapshot[1],
            podsumowanie=_podsumowanie(wynik),
            ostrzezenia=wynik.warnings,
            elementy_bez_katalogu=wynik.elementy_bez_katalogu,
            mapowanie_katalogowe_wymagane=wynik.mapowanie_katalogowe_wymagane,
        )

    # ------------------------------------------------------------------
    # Zapis — kroki
    # ------------------------------------------------------------------

    def _zapisz_projekt(self, nazwa_projektu: str, siec: SiecZArkusza) -> UUID:
        napiecia = [float(wezel["base_kv"]) for wezel in siec.wezly]
        projekt = new_project(
            name=nazwa_projektu,
            description="Import z arkusza XLSX",
            mode="AS-IS",
            voltage_level_kv=max(napiecia) if napiecia else 15.0,
        )
        teraz = datetime.now(UTC)
        from infrastructure.persistence.models import ProjectORM

        orm = ProjectORM(
            id=projekt.id,
            name=projekt.name,
            description=projekt.description,
            schema_version=projekt.schema_version,
            mode=projekt.mode,
            voltage_level_kv=projekt.voltage_level_kv,
            frequency_hz=projekt.frequency_hz,
            connection_node_id=None,
            connection_description=None,
            owner_id=None,
            active_network_snapshot_id=None,
            sources_jsonb=[],
            created_at=teraz,
            updated_at=teraz,
            deleted_at=None,
        )
        self._session.add(orm)
        self._session.flush()
        return projekt.id

    def _zapisz_elementy(self, project_id: UUID, siec: SiecZArkusza) -> dict[str, UUID]:
        """Zapisz wezly/galezie/zrodla/odbiory; zwroc mapowanie ref z arkusza -> UUID."""
        identyfikatory: dict[str, UUID] = {}

        for wezel in siec.wezly:
            node_id = uuid4()
            identyfikatory[wezel["ref"]] = node_id
            self._session.add(
                NetworkNodeORM(
                    id=node_id,
                    project_id=project_id,
                    name=wezel["name"],
                    node_type=wezel["node_type"],
                    base_kv=wezel["base_kv"],
                    attrs_jsonb=wezel["attrs"],
                )
            )
        self._session.flush()

        for galaz in siec.galezie:
            branch_id = uuid4()
            identyfikatory[galaz["ref"]] = branch_id
            self._session.add(
                NetworkBranchORM(
                    id=branch_id,
                    project_id=project_id,
                    name=galaz["name"],
                    branch_type=galaz["branch_type"],
                    from_node_id=identyfikatory[galaz["from_ref"]],
                    to_node_id=identyfikatory[galaz["to_ref"]],
                    in_service=True,
                    params_jsonb=galaz["params"],
                )
            )

        for zrodlo in siec.zrodla:
            self._session.add(
                NetworkSourceORM(
                    id=uuid4(),
                    project_id=project_id,
                    node_id=identyfikatory[zrodlo["node_ref"]],
                    source_type=zrodlo["source_type"],
                    payload_jsonb=zrodlo["payload"],
                    in_service=True,
                )
            )

        for odbior in siec.odbiory:
            self._session.add(
                NetworkLoadORM(
                    id=uuid4(),
                    project_id=project_id,
                    node_id=identyfikatory[odbior["node_ref"]],
                    payload_jsonb=odbior["payload"],
                    in_service=True,
                )
            )

        self._session.flush()
        return identyfikatory

    def _zapisz_migawke(
        self,
        project_id: UUID,
        siec: SiecZArkusza,
        identyfikatory: dict[str, UUID],
    ) -> tuple[str, str]:
        """Zbuduj i zapisz migawke sieci; ustaw ja jako aktywna dla projektu."""
        graf = _zbuduj_graf(siec, identyfikatory, project_id)
        migawka = create_network_snapshot(
            graf,
            network_model_id=network_model_id_for_project(project_id),
        )

        from infrastructure.persistence.repositories.snapshot_repository import SnapshotRepository

        SnapshotRepository(self._session).add_snapshot(migawka, commit=False)

        from infrastructure.persistence.models import ProjectORM

        projekt = self._session.get(ProjectORM, project_id)
        if projekt is not None:
            projekt.active_network_snapshot_id = migawka.meta.snapshot_id
        self._session.flush()
        return migawka.meta.snapshot_id, migawka.fingerprint


def _podsumowanie(wynik: XlsxImportResult) -> PodsumowanieArkusza:
    return PodsumowanieArkusza(
        szyny=wynik.bus_count,
        odcinki=wynik.branch_count - wynik.trafo_count,
        transformatory=wynik.trafo_count,
        zrodla=wynik.source_count,
        odbiory=wynik.load_count,
    )


def _zbuduj_graf(
    siec: SiecZArkusza,
    identyfikatory: dict[str, UUID],
    project_id: UUID,
) -> NetworkGraph:
    """Zbuduj graf rdzenia z rekordow kanonicznych (te same identyfikatory co w bazie)."""
    graf = NetworkGraph(network_model_id=network_model_id_for_project(project_id))

    odbiory_na_wezle: dict[str, dict[str, float]] = {}
    for odbior in siec.odbiory:
        klucz = str(identyfikatory[odbior["node_ref"]])
        biezacy = odbiory_na_wezle.setdefault(klucz, {"p_mw": 0.0, "q_mvar": 0.0})
        biezacy["p_mw"] += float(odbior["payload"]["p_mw"])
        biezacy["q_mvar"] += float(odbior["payload"]["q_mvar"])

    for wezel in siec.wezly:
        node_id = str(identyfikatory[wezel["ref"]])
        if wezel["node_type"] == "SLACK":
            graf.add_node(
                Node.from_dict(
                    {
                        "id": node_id,
                        "name": wezel["name"],
                        "node_type": "SLACK",
                        "voltage_level": wezel["base_kv"],
                        "voltage_magnitude": wezel["attrs"].get("voltage_magnitude_pu", 1.0),
                        "voltage_angle": wezel["attrs"].get("voltage_angle_rad", 0.0),
                    }
                )
            )
            continue
        obciazenie = odbiory_na_wezle.get(node_id, {"p_mw": 0.0, "q_mvar": 0.0})
        graf.add_node(
            Node.from_dict(
                {
                    "id": node_id,
                    "name": wezel["name"],
                    "node_type": "PQ",
                    "voltage_level": wezel["base_kv"],
                    # Konwencja generatorowa rdzenia: odbior = ujemny wtrysk.
                    "active_power": -obciazenie["p_mw"],
                    "reactive_power": -obciazenie["q_mvar"],
                }
            )
        )

    for galaz in siec.galezie:
        dane: dict[str, Any] = {
            "id": str(identyfikatory[galaz["ref"]]),
            "name": galaz["name"],
            "branch_type": galaz["branch_type"],
            "from_node_id": str(identyfikatory[galaz["from_ref"]]),
            "to_node_id": str(identyfikatory[galaz["to_ref"]]),
            "in_service": True,
        }
        dane.update({k: v for k, v in galaz["params"].items() if v is not None})
        model = Branch.from_dict(dane)
        assert isinstance(model, LineBranch | TransformerBranch)
        graf.add_branch(model)

    return graf
