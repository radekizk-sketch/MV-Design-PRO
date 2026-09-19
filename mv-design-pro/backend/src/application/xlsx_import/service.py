"""
Import sieci z arkusza XLSX do modelu projektu — warstwa aplikacji (W1).

JEDNA PRAWDA SIECI OD PIERWSZEGO BAJTU (mapa domknięcia, `docs/plan/
MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` §9): arkusz → rekordy (`importer.py`) →
KOMPILATOR GRAFU (`enm/kompilator_grafu.py`, wyłącznie operacje domenowe) →
`EnergyNetworkModel` w magazynie modelu pod kluczem PROJEKTU (`enm/store.set_enm`) —
dokładnie tam, skąd czytają kreatory, SLD, gotowość obliczeniowa i biegi analiz.
Stan PRZED (2026-08-07 → 2026-09-09) zapisywał import do tabel `network_*` i migawki
rdzenia (`NetworkGraph`), których żaden tor użytkownika nie czytał: projekt „z importu”
otwierał się PUSTY (druga prawda sieci, klasa K-A mapy).

Podgląd = TEN SAM tor bez zapisu (parsowanie + kompilacja w pamięci + walidator ENM),
więc liczby i zastrzeżenia podglądu są liczbami i zastrzeżeniami importu, nie ich
przybliżeniem. Liczby pochodzą z ENM (co faktycznie weszło do modelu), nie z liczenia
wierszy arkusza.

TRANSAKCYJNOŚĆ: projekt i pierwszy przypadek obliczeniowy idą w sesji wołającego
(`commit=False`); model trafia do magazynu DOPIERO po udanym `flush` bazy, a każdy
błąd przed tym momentem zostawia sesję do wycofania przez `UnitOfWork.__exit__`
(żaden projekt-kikut). Ta sama kolejność co import archiwum projektu
(`application/project_archive/service.py::_restore_project`).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from application.twin_key import migruj_projekt_z_legacy_z_repozytorium
from domain.models import new_project
from domain.study_case import new_study_case
from enm.katalog_projektu import BladKataloguProjektu
from enm.kompilator_grafu import (
    BenchmarkBuildError,
    BladGrafuWejsciowego,
    EdgeSpec,
    GrafDoKompilacji,
    OdbiorSpec,
    SzynaSpec,
    TransformatorSpec,
    WynikKompilacji,
    ZrodloSpec,
    kompiluj_graf,
)
from enm.models import EnergyNetworkModel
from enm.severity import SEVERITY_BLOCKER
from enm.store import ZrodloZmiany, set_enm
from enm.validator import ENMValidator
from infrastructure.persistence.models import ProjectORM
from infrastructure.persistence.repositories.case_repository import CaseRepository
from sqlalchemy.orm import Session

from .importer import BladArkusza, SiecZArkusza, XlsxNetworkImporter

STATUS_ZAIMPORTOWANO = "ZAIMPORTOWANO"
STATUS_ODRZUCONO = "ODRZUCONO"

#: Nazwa pierwszego przypadku obliczeniowego — ta sama, którą nadaje ekran otwarcia
#: projektu (`frontend/src/ui2/spaces/projekt/otworz/OtworzProjektKontener.tsx`,
#: `nazwaPierwszegoPrzypadku`), żeby projekt z arkusza wyglądał jak projekt z kreatora.
NAZWA_PIERWSZEGO_PRZYPADKU = "Wariant bazowy"
OPIS_PIERWSZEGO_PRZYPADKU = "Przypadek utworzony przy imporcie arkusza"
OPIS_PROJEKTU = "Import z arkusza XLSX"
#: Źródło rewizji w dzienniku zmian modelu (`enm/dziennik_zmian.py`): import NIE jest
#: operacją domenową z kanonu, więc wpis idzie bez operacji, z nazwanym opisem i tym
#: identyfikatorem w ładunku (`ladunek.zrodlo`).
ZRODLO_IMPORTU = "import_arkusza"
#: Zastrzeżenia kompilatora/walidatora nie wskazują pojedynczego arkusza — dotyczą
#: modelu złożonego ze wszystkich arkuszy naraz.
ARKUSZ_MODELU = "model"


@dataclass(frozen=True)
class PodsumowanieArkusza:
    """Liczby elementów MODELU zbudowanego z arkusza (z ENM, nie z liczenia wierszy)."""

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
    """Podgląd — model zbudowany w pamięci, BEZ zapisu czegokolwiek."""

    poprawny: bool
    podsumowanie: PodsumowanieArkusza | None = None
    bledy: list[dict[str, Any]] = field(default_factory=list)
    ostrzezenia: list[str] = field(default_factory=list)
    elementy_typow_projektu: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "poprawny": self.poprawny,
            "podsumowanie": self.podsumowanie.to_dict() if self.podsumowanie else None,
            "bledy": self.bledy,
            "ostrzezenia": self.ostrzezenia,
            "elementy_typow_projektu": self.elementy_typow_projektu,
        }


@dataclass(frozen=True)
class WynikImportu:
    """Wynik importu — z ADRESEM tego, co powstało (projekt, przypadek, odcisk modelu)."""

    status: str
    project_id: str | None = None
    case_id: str | None = None
    enm_hash: str | None = None
    podsumowanie: PodsumowanieArkusza | None = None
    bledy: list[dict[str, Any]] = field(default_factory=list)
    ostrzezenia: list[str] = field(default_factory=list)
    elementy_typow_projektu: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "project_id": self.project_id,
            "case_id": self.case_id,
            "enm_hash": self.enm_hash,
            "podsumowanie": self.podsumowanie.to_dict() if self.podsumowanie else None,
            "bledy": self.bledy,
            "ostrzezenia": self.ostrzezenia,
            "elementy_typow_projektu": self.elementy_typow_projektu,
        }


@dataclass(frozen=True)
class _Kompilacja:
    """Model zbudowany z arkusza w pamięci (podgląd i import idą tą samą drogą)."""

    model: EnergyNetworkModel
    wynik: WynikKompilacji
    ostrzezenia: list[str]
    elementy_typow_projektu: list[str]


class XlsxImportService:
    """Import sieci z arkusza XLSX do nowego projektu (model w magazynie ENM)."""

    def __init__(self, session: Session, importer: XlsxNetworkImporter | None = None) -> None:
        self._session = session
        self._importer = importer or XlsxNetworkImporter()

    # ------------------------------------------------------------------
    # Podgląd (bez zapisu)
    # ------------------------------------------------------------------

    def podglad(self, dane: bytes, nazwa_pliku: str | None = None) -> WynikPodgladu:
        kompilacja, bledy = self._wczytaj_i_skompiluj(dane, nazwa_pliku, nazwa_modelu="Podgląd")
        if kompilacja is None:
            return WynikPodgladu(poprawny=False, bledy=[blad.to_dict() for blad in bledy])
        return WynikPodgladu(
            poprawny=True,
            podsumowanie=_podsumowanie(kompilacja.model),
            ostrzezenia=kompilacja.ostrzezenia,
            elementy_typow_projektu=kompilacja.elementy_typow_projektu,
        )

    # ------------------------------------------------------------------
    # Import (projekt + przypadek w sesji, model w magazynie ENM)
    # ------------------------------------------------------------------

    def importuj(
        self, dane: bytes, nazwa_projektu: str, nazwa_pliku: str | None = None
    ) -> WynikImportu:
        kompilacja, bledy = self._wczytaj_i_skompiluj(
            dane, nazwa_pliku, nazwa_modelu=nazwa_projektu
        )
        if kompilacja is None:
            return WynikImportu(status=STATUS_ODRZUCONO, bledy=[blad.to_dict() for blad in bledy])

        project_id = self._zapisz_projekt(nazwa_projektu, kompilacja.model)
        case_id = self._zapisz_pierwszy_przypadek(project_id)
        zapisany = self._zapisz_model(project_id, kompilacja, nazwa_pliku)
        return WynikImportu(
            status=STATUS_ZAIMPORTOWANO,
            project_id=str(project_id),
            case_id=str(case_id),
            enm_hash=zapisany.header.hash_sha256,
            podsumowanie=_podsumowanie(zapisany),
            ostrzezenia=kompilacja.ostrzezenia,
            elementy_typow_projektu=kompilacja.elementy_typow_projektu,
        )

    # ------------------------------------------------------------------
    # Kroki
    # ------------------------------------------------------------------

    def _wczytaj_i_skompiluj(
        self, dane: bytes, nazwa_pliku: str | None, *, nazwa_modelu: str
    ) -> tuple[_Kompilacja | None, list[BladArkusza]]:
        """Arkusz → rekordy → kompilator → walidator ENM. Każda odmowa jest NAZWANA
        (arkusz/wiersz/kolumna z parsera; element z kompilatora/walidatora) — zero
        cichego pomijania elementów."""
        wynik = self._importer.import_from_bytes(dane, nazwa_pliku)
        if not wynik.success or wynik.siec is None:
            return None, list(wynik.bledy)
        try:
            kompilacja = kompiluj_graf(graf_z_arkusza(wynik.siec, nazwa_modelu))
        except (BladGrafuWejsciowego, BladKataloguProjektu, BenchmarkBuildError) as blad:
            return None, [
                BladArkusza(
                    arkusz=ARKUSZ_MODELU,
                    komunikat=f"Model nie daje się zbudować z arkusza: {blad}",
                )
            ]
        model = EnergyNetworkModel.model_validate(kompilacja.enm)
        nazwy = _nazwy_z_arkusza(kompilacja)
        blokady = [
            BladArkusza(
                arkusz=ARKUSZ_MODELU,
                komunikat=(
                    f"{issue.code}: {issue.message_pl}"
                    + (
                        " (elementy: "
                        + ", ".join(nazwy.get(ref, ref) for ref in issue.element_refs)
                        + ")"
                        if issue.element_refs
                        else ""
                    )
                ),
            )
            for issue in ENMValidator().validate(model).issues
            if issue.severity == SEVERITY_BLOCKER
        ]
        if blokady:
            return None, blokady
        return (
            _Kompilacja(
                model=model,
                wynik=kompilacja,
                ostrzezenia=list(wynik.warnings),
                elementy_typow_projektu=list(wynik.elementy_typow_projektu),
            ),
            [],
        )

    def _zapisz_projekt(self, nazwa_projektu: str, model: EnergyNetworkModel) -> UUID:
        projekt = new_project(
            name=nazwa_projektu,
            description=OPIS_PROJEKTU,
            mode="AS-IS",
            voltage_level_kv=max(bus.voltage_kv for bus in model.buses),
        )
        teraz = datetime.now(UTC)
        self._session.add(
            ProjectORM(
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
                sources_jsonb=[],
                created_at=teraz,
                updated_at=teraz,
                deleted_at=None,
            )
        )
        self._session.flush()
        return projekt.id

    def _zapisz_pierwszy_przypadek(self, project_id: UUID) -> UUID:
        """Projekt bez przypadku obliczeniowego nie da się otworzyć w żadnym torze —
        import tworzy od razu pierwszy, aktywny przypadek (jak ekran otwarcia projektu)."""
        przypadek = new_study_case(
            project_id=project_id,
            name=NAZWA_PIERWSZEGO_PRZYPADKU,
            description=OPIS_PIERWSZEGO_PRZYPADKU,
            is_active=True,
        )
        CaseRepository(self._session).add_study_case(przypadek, commit=False)
        self._session.flush()
        return przypadek.id

    def _zapisz_model(
        self, project_id: UUID, kompilacja: _Kompilacja, nazwa_pliku: str | None
    ) -> EnergyNetworkModel:
        # Klucz magazynu tą samą drogą co import archiwum: przez migrację, nie przez
        # czystą funkcję klucza (dla świeżego projektu to pusty przebieg, ale droga do
        # magazynu ma być JEDNA).
        klucz = migruj_projekt_z_legacy_z_repozytorium(
            project_id, CaseRepository(self._session)
        ).klucz_projektu
        wynik = kompilacja.wynik
        utworzone = tuple(
            sorted(
                ref
                for mapa in (
                    wynik.bus_map,
                    wynik.branch_map,
                    wynik.transformer_map,
                    wynik.source_map,
                    wynik.load_map,
                )
                for ref in mapa.values()
            )
        )
        return set_enm(
            klucz,
            kompilacja.model,
            zrodlo_zmiany=ZrodloZmiany(
                operacja=None,
                utworzone=utworzone,
                opis_pl=f"Import sieci z arkusza XLSX ({nazwa_pliku or 'arkusz'})",
                ladunek={
                    "zrodlo": ZRODLO_IMPORTU,
                    "plik": nazwa_pliku,
                    "podsumowanie": _podsumowanie(kompilacja.model).to_dict(),
                    "elementy_typow_projektu": list(kompilacja.elementy_typow_projektu),
                },
            ),
        )


def graf_z_arkusza(siec: SiecZArkusza, nazwa: str) -> GrafDoKompilacji:
    """Rekordy arkusza → graf wejściowy kompilatora (1:1, bez tłumaczenia wartości)."""
    return GrafDoKompilacji(
        name=nazwa,
        szyny=tuple(
            SzynaSpec(lit=w["ref"], name=w["name"], voltage_kv=w["voltage_kv"]) for w in siec.wezly
        ),
        odcinki=tuple(
            EdgeSpec(
                edge_id=g["ref"],
                from_lit=g["from_ref"],
                to_lit=g["to_ref"],
                catalog_ref=g["catalog_ref"],
                dlugosc_m=g["dlugosc_m"],
                rodzaj=g["rodzaj"],
            )
            for g in siec.galezie
        ),
        transformatory=tuple(
            TransformatorSpec(
                edge_id=t["ref"],
                hv_lit=t["hv_ref"],
                lv_lit=t["lv_ref"],
                catalog_ref=t["catalog_ref"],
                name=t["name"],
            )
            for t in siec.transformatory
        ),
        zrodla=tuple(
            ZrodloSpec(
                lit=z["node_ref"],
                name=z["name"],
                rx_ratio=z["rx_ratio"],
                sk3_mva=z.get("sk3_mva"),
                ik3_ka=z.get("ik3_ka"),
                sk3_min_mva=z.get("sk3_min_mva"),
                ik3_min_ka=z.get("ik3_min_ka"),
                rx_ratio_min=z.get("rx_ratio_min"),
                u_set_pu=z.get("u_set_pu"),
            )
            for z in siec.zrodla
        ),
        odbiory=tuple(
            OdbiorSpec(lit=o["node_ref"], name=o["name"], p_mw=o["p_mw"], q_mvar=o["q_mvar"])
            for o in siec.odbiory
        ),
        katalog_projektu=(
            siec.typy_projektu
            if any(siec.typy_projektu.get(r) for r in siec.typy_projektu)
            else None
        ),
    )


def _nazwy_z_arkusza(kompilacja: WynikKompilacji) -> dict[str, str]:
    """`ref_id` elementu modelu → identyfikator z arkusza (komunikaty w języku arkusza)."""
    nazwy: dict[str, str] = {}
    for mapa in (
        kompilacja.bus_map,
        kompilacja.branch_map,
        kompilacja.transformer_map,
        kompilacja.source_map,
        kompilacja.load_map,
    ):
        for identyfikator, ref in mapa.items():
            nazwy[ref] = identyfikator
    return nazwy


def _podsumowanie(model: EnergyNetworkModel) -> PodsumowanieArkusza:
    return PodsumowanieArkusza(
        szyny=len(model.buses),
        odcinki=len(model.branches),
        transformatory=len(model.transformers),
        zrodla=len(model.sources),
        odbiory=len(model.loads),
    )
