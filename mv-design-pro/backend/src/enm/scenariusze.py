"""Scenariusz roboczy i migawka efektywna — CV-3.1 (`OperatingScenario`, `apply_scenario`).

CO TO ZAMYKA. Szesc rodzin analiz (kontyngencje N-1, zdolnosc przylaczeniowa,
obszar P-Q, odpowiedz na polecenie OSD, dobor kompensacji, bieg zbiorczy nastaw)
robilo to samo szescioma prywatnymi drogami: kopia migawki biegu bazowego →
reczna mutacja slownika (usuniecie elementu, nadpisanie `p_mw`, dopisanie
generatora-sondy, wyzerowanie generacji, dopisanie baterii) → `CanonicalRun` w
pamieci → prywatny `_execute_power_flow` importowany wprost. Zaden z tych
wariantow nie mial nazwy, hasha ani proweniencji, wiec nie dalo sie powiedziec,
CO DOKLADNIE policzono, ani odroznic dwoch wariantow tej samej migawki.

MODEL (docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md §B.3):

    EffectiveNetworkSnapshot = apply_scenario(HEAD projektu, OperatingScenario)

`OperatingScenario` jest zbiorem TYPOWANYCH NADPISAN DANYCH WEJSCIOWYCH — nie
komend domenowych (to `NetworkVariation`) i nie fizyki (zero obliczen tutaj:
nadpisanie `p_mw` jest przepisaniem liczby, nie jej wyznaczeniem). Wchodza
WYLACZNIE pola, ktore maja dzis dostawce w kodzie (zasada „zero pol bez
dostawcy", rejestr decyzji OW-9): `out_of_service` (N-1, nastawy), `setpoints`
(polecenie OSD), `gen_scaling` (noc doboru kompensacji), `injections` (sondy
zdolnosci przylaczeniowej i obszaru P-Q), `probe_shunts` (sonda baterii),
`fault_spec` (scenariusz zwarciowy C6). Stany lacznikow, zaczepy, tryby zrodel,
profile czasowe, tryby DER/BESS i generator zestawow kontyngencji NIE wchodza,
dopoki nie ma ich konsumenta — deklaracja pola bez konsumenta bylaby fantomem.

SEMANTYKA NADPISAN (kolejnosc STALA: out_of_service → setpoints → gen_scaling →
injections → probe_shunts; kazde nadpisanie zostawia wpis proweniencji w
`EffectiveNetworkSnapshot.nadpisania`):
  * `out_of_service` — element NIEOBECNY w migawce efektywnej (dokladnie tak, jak
    dzisiejsza kontyngencja N-1 usuwa galaz z listy), nie „status open";
  * `setpoints` — nadpisanie `p_mw`/`q_mvar` ISTNIEJACEGO generatora;
  * `gen_scaling` — mnoznik mocy czynnej generatorow (`"*"` = wszystkie);
    mnoznik `0.0` zapisuje dokladnie `0.0` (nie `-0.0` z mnozenia liczby ujemnej —
    JSON migawki i hash maja byc te same, co przy jawnym wyzerowaniu);
  * `injections` — dopisany generator-sonda o deterministycznym `id` (`uuid5`
    z jawnego ziarna) — ten sam ksztalt, jaki budowaly rodziny D2/D3;
  * `probe_shunts` — dopisana bateria kondensatorow z katalogu (catalog-first).
`ref_id` nieobecny w modelu = `ScenariuszNieprzystajeError` z nazwa elementu i
scenariusza — nigdy cichy skip (cichy skip zamienialby „N-1 bez galezi X" w
„stan normalny" bez sladu).

TOZSAMOSC. Scenariusz bez nadpisan modelu (NORMAL, FAULT_STUDY) daje migawke o
hashu ROWNYM hashowi modelu (`compute_enm_hash`) — przypiete testem; migawka
z nadpisaniami ma hash policzony ta sama regula ze slownika
(`enm.hash.hash_migawki_enm`). `hash` scenariusza to SHA-256 nad kanonicznym
JSON nadpisan (bez nazwy, identyfikatora i rewizji — tozsamosc tresci, nie
etykiety).

TRWALOSC. Tylko scenariusze NAZWANE (identyfikator bez prefiksu `__`) trafiaja
do magazynu per projekt: `<digest>.scen/<scenario_id>.json`, rejestr rewizji
append-only (zapis roboczy + atomowa podmiana, jak dziennik i migawki rewizji);
usuniecie jest wpisem nagrobkowym, nie kasacja pliku. Scenariusze PRZEJSCIOWE
(sondy, warianty enumeracji) maja deterministyczne identyfikatory `__…` i NIE sa
zapisywane — magazyn odmawia ich przyjecia. Migracja klucza przypadku (CV-1)
przenosi katalog scenariuszy razem z modelem (`enm/store.py`).
"""

from __future__ import annotations

import copy
import hashlib
import json
import os
import shutil
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from domain.fault_scenario import FaultScenario
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from .dziennik_zmian import sciezka_tymczasowa
from .hash import compute_enm_hash, hash_migawki_enm
from .models import EnergyNetworkModel, Generator, ShuntCapacitor
from .rewizje import digest_klucza

#: Sufiks katalogu scenariuszy nazwanych projektu: `<digest>.scen/`.
SUFIKS_KATALOGU_SCENARIUSZY = ".scen"
#: Prefiks identyfikatora scenariusza PRZEJSCIOWEGO (nigdy nie zapisywany).
PREFIKS_PRZEJSCIOWEGO = "__"
#: Identyfikator scenariusza stanu normalnego (przejsciowy — nie ma rewizji w magazynie).
ID_SCENARIUSZA_NORMALNEGO = "__normal__"
#: Kolekcje ENM, z ktorych `out_of_service` usuwa element (kolejnosc = kolejnosc szukania).
KOLEKCJE_WYLACZALNE = (
    "branches",
    "transformers",
    "generators",
    "loads",
    "sources",
    "shunt_capacitors",
)
#: Wersja zapisu pliku scenariusza w magazynie.
WERSJA_ZAPISU_SCENARIUSZA = 1

_DEFAULT_STORE_DIR = Path(__file__).resolve().parents[2] / ".enm_store"


class RodzajScenariusza(StrEnum):
    NORMAL = "NORMAL"
    MAX_LOAD = "MAX_LOAD"
    MIN_LOAD = "MIN_LOAD"
    MAX_GEN = "MAX_GEN"
    N_1 = "N_1"
    MAINTENANCE = "MAINTENANCE"
    FAULT_STUDY = "FAULT_STUDY"
    SIZING = "SIZING"
    CUSTOM = "CUSTOM"


class ScenariuszNieprzystajeError(ValueError):
    """Scenariusz wskazuje element, ktorego model nie ma (albo ma w innej roli)."""

    def __init__(self, scenario_id: str, ref_id: str, powod: str) -> None:
        super().__init__(
            f"Scenariusz {scenario_id!r} nie przystaje do modelu: element {ref_id!r} — {powod}"
        )
        self.scenario_id = scenario_id
        self.ref_id = ref_id
        self.powod = powod


class ScenariuszPrzejsciowyError(ValueError):
    """Magazyn przyjmuje wylacznie scenariusze nazwane (bez prefiksu `__`)."""


class ScenariuszNieistniejeError(LookupError):
    def __init__(self, klucz: str, scenario_id: str, rewizja: int | None = None) -> None:
        rewizja_txt = "" if rewizja is None else f" w rewizji {rewizja}"
        super().__init__(f"Scenariusz {scenario_id!r} projektu {klucz!r} nie istnieje{rewizja_txt}")
        self.klucz = klucz
        self.scenario_id = scenario_id
        self.rewizja = rewizja


class ScenariuszUszkodzonyError(ValueError):
    """Plik scenariusza istnieje, ale nie da sie go odczytac jako rejestru rewizji."""


class Nastawa(BaseModel):
    """Nadpisanie nastawy generatora (co najmniej jedno z pol)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    p_mw: float | None = None
    q_mvar: float | None = None

    @model_validator(mode="after")
    def _co_najmniej_jedno(self) -> Nastawa:
        if self.p_mw is None and self.q_mvar is None:
            raise ValueError("Nastawa bez zadnej wartosci (p_mw/q_mvar) nie jest nadpisaniem")
        return self


def _domyslne_ziarno(dane: Any, prefiks: str) -> Any:
    """Uzupelnij `id_seed` z `ref_id`, gdy wolajacy go nie podal (walidator `before`)."""
    if isinstance(dane, dict) and not dane.get("id_seed") and dane.get("ref_id"):
        dane = dict(dane)
        dane["id_seed"] = f"{prefiks}:{dane['ref_id']}"
    return dane


class Wstrzyk(BaseModel):
    """Generator-sonda dopisywany na szynie (zdolnosc przylaczeniowa, obszar P-Q).

    `id_seed` — jawne ziarno `uuid5(NAMESPACE_URL, id_seed)` identyfikatora
    elementu; domyslnie `scenario-probe:<ref_id>`. Rodziny migrowane z wlasnych
    sond podaja swoje historyczne ziarno, zeby migawka byla bit w bit ta sama.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    bus_ref: str = Field(min_length=1)
    ref_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    p_mw: float
    q_mvar: float
    id_seed: str = Field(min_length=1)

    @model_validator(mode="before")
    @classmethod
    def _ziarno(cls, dane: Any) -> Any:
        return _domyslne_ziarno(dane, "scenario-probe")


class SondaKondensatora(BaseModel):
    """Bateria kondensatorow z katalogu dopisywana na szynie (dobor kompensacji)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    bus_ref: str = Field(min_length=1)
    ref_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    rated_mvar: float
    rated_kv: float
    catalog_ref: str = Field(min_length=1)
    catalog_namespace: str = "KOMPENSATOR_SN"
    id_seed: str = Field(min_length=1)

    @model_validator(mode="before")
    @classmethod
    def _ziarno(cls, dane: Any) -> Any:
        return _domyslne_ziarno(dane, "scenario-shunt-probe")


def czy_scenariusz_przejsciowy(scenario_id: str) -> bool:
    """JEDYNY predykat „przejsciowy" — dla magazynu (odmowa zapisu), koperty
    (referencja bez rewizji magazynu) i swiezosci (brak sprawdzenia rewizji)."""
    return scenario_id.startswith(PREFIKS_PRZEJSCIOWEGO)


def _tresc_zwarcia(fault_spec: FaultScenario | None) -> dict[str, Any] | None:
    """Tresc scenariusza zwarciowego wchodzaca do hasha: bez identyfikatorow,
    nazwy i znacznikow czasu (tozsamosc TRESCI, jak `content_hash` C6)."""
    if fault_spec is None:
        return None
    return {
        "fault_type": fault_spec.fault_type.value,
        "location": fault_spec.location.to_dict(),
        "config": fault_spec.config.to_dict(),
        "fault_mode": fault_spec.fault_mode.value,
        "fault_impedance": (
            fault_spec.fault_impedance.to_dict() if fault_spec.fault_impedance else None
        ),
        "arc_params": fault_spec.arc_params,
        "z0_bus_data": fault_spec.z0_bus_data,
    }


class OperatingScenario(BaseModel):
    """Scenariusz roboczy: typowane nadpisania danych wejsciowych modelu."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    scenario_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    kind: RodzajScenariusza
    revision: int = Field(default=1, ge=1)
    out_of_service: tuple[str, ...] = ()
    setpoints: dict[str, Nastawa] = Field(default_factory=dict)
    gen_scaling: dict[str, float] = Field(default_factory=dict)
    injections: tuple[Wstrzyk, ...] = ()
    probe_shunts: tuple[SondaKondensatora, ...] = ()
    fault_spec: FaultScenario | None = None

    @model_validator(mode="after")
    def _bez_duplikatow(self) -> OperatingScenario:
        if len(set(self.out_of_service)) != len(self.out_of_service):
            raise ValueError("out_of_service zawiera powtorzony ref_id")
        refy = [w.ref_id for w in self.injections] + [s.ref_id for s in self.probe_shunts]
        if len(set(refy)) != len(refy):
            raise ValueError("injections/probe_shunts zawieraja powtorzony ref_id sondy")
        for ref, mnoznik in self.gen_scaling.items():
            if not ref:
                raise ValueError("gen_scaling: pusty ref_id")
            if mnoznik < 0.0:
                raise ValueError(f"gen_scaling[{ref!r}]: mnoznik ujemny ({mnoznik})")
        return self

    @property
    def przejsciowy(self) -> bool:
        return czy_scenariusz_przejsciowy(self.scenario_id)

    @property
    def ma_nadpisania_modelu(self) -> bool:
        """Czy scenariusz zmienia migawke modelu (scenariusz zwarciowy jej nie zmienia)."""
        return bool(
            self.out_of_service
            or self.setpoints
            or self.gen_scaling
            or self.injections
            or self.probe_shunts
        )

    def tresc(self) -> dict[str, Any]:
        """Kanoniczna tresc nadpisan (to, co wchodzi do hasha)."""
        return {
            "kind": self.kind.value,
            "out_of_service": list(self.out_of_service),
            "setpoints": {
                ref: nastawa.model_dump(mode="json")
                for ref, nastawa in sorted(self.setpoints.items())
            },
            "gen_scaling": dict(sorted(self.gen_scaling.items())),
            "injections": [w.model_dump(mode="json") for w in self.injections],
            "probe_shunts": [s.model_dump(mode="json") for s in self.probe_shunts],
            "fault_spec": _tresc_zwarcia(self.fault_spec),
        }

    @property
    def hash(self) -> str:
        tekst = json.dumps(self.tresc(), sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        return hashlib.sha256(tekst.encode("utf-8")).hexdigest()

    @property
    def scenario_ref(self) -> tuple[str, int]:
        return (self.scenario_id, self.revision)


SCENARIUSZ_NORMALNY = OperatingScenario(
    scenario_id=ID_SCENARIUSZA_NORMALNEGO,
    name="Stan normalny",
    kind=RodzajScenariusza.NORMAL,
)


@dataclass(frozen=True)
class Nadpisanie:
    """Proweniencja JEDNEGO nadpisania w migawce efektywnej."""

    pole: str
    kolekcja: str
    ref_id: str
    przed: Any
    po: Any

    def to_dict(self) -> dict[str, Any]:
        return {
            "pole": self.pole,
            "kolekcja": self.kolekcja,
            "ref_id": self.ref_id,
            "przed": self.przed,
            "po": self.po,
        }


@dataclass(frozen=True)
class EffectiveNetworkSnapshot:
    """Migawka efektywna: slownik `model_dump` z narzuconymi nadpisaniami + odciski."""

    snapshot: dict[str, Any]
    snapshot_hash: str
    base_hash: str
    base_revision: int
    scenario_id: str
    scenario_revision: int
    scenario_hash: str
    nadpisania: tuple[Nadpisanie, ...] = field(default=())

    @property
    def scenario_ref(self) -> tuple[str, int]:
        return (self.scenario_id, self.scenario_revision)

    @property
    def tozsama_z_baza(self) -> bool:
        return not self.nadpisania


def _indeks_elementow(snapshot: dict[str, Any], kolekcja: str) -> dict[str, dict[str, Any]]:
    return {
        str(element.get("ref_id")): element
        for element in (snapshot.get(kolekcja) or [])
        if isinstance(element, dict)
    }


def _znajdz_kolekcje(snapshot: dict[str, Any], ref_id: str) -> str | None:
    for kolekcja in KOLEKCJE_WYLACZALNE:
        if ref_id in _indeks_elementow(snapshot, kolekcja):
            return kolekcja
    return None


def _wymagaj_szyny(snapshot: dict[str, Any], scenariusz: OperatingScenario, bus_ref: str) -> None:
    if bus_ref not in _indeks_elementow(snapshot, "buses"):
        raise ScenariuszNieprzystajeError(scenariusz.scenario_id, bus_ref, "brak takiej szyny")


def _generator_sondy(wstrzyk: Wstrzyk) -> dict[str, Any]:
    return Generator(
        id=uuid5(NAMESPACE_URL, wstrzyk.id_seed),
        ref_id=wstrzyk.ref_id,
        name=wstrzyk.name,
        bus_ref=wstrzyk.bus_ref,
        p_mw=wstrzyk.p_mw,
        q_mvar=wstrzyk.q_mvar,
    ).model_dump(mode="json")


def _bateria_sondy(sonda: SondaKondensatora) -> dict[str, Any]:
    return ShuntCapacitor(
        id=uuid5(NAMESPACE_URL, sonda.id_seed),
        ref_id=sonda.ref_id,
        name=sonda.name,
        bus_ref=sonda.bus_ref,
        rated_mvar=sonda.rated_mvar,
        rated_kv=sonda.rated_kv,
        status="closed",
        catalog_ref=sonda.catalog_ref,
        catalog_namespace=sonda.catalog_namespace,
        parameter_source="CATALOG",
        source_mode="KATALOG",
    ).model_dump(mode="json")


def _przeskaluj(p_mw: float, mnoznik: float) -> float:
    # `0.0` zapisane wprost: `(-1.5) * 0.0 == -0.0` roznilby JSON migawki od
    # jawnego wyzerowania generacji (semantyka „noc": moc czynna rowna zero).
    return 0.0 if mnoznik == 0.0 else p_mw * mnoznik


def apply_scenario(
    enm: EnergyNetworkModel, scenariusz: OperatingScenario
) -> EffectiveNetworkSnapshot:
    """JEDYNE miejsce kopii modelu do analizy z nadpisaniami scenariusza.

    Tozsamosc: scenariusz bez nadpisan modelu daje `snapshot_hash == base_hash ==
    compute_enm_hash(enm)`; nadpisania sa nakladane w kolejnosci z naglowka
    modulu na SWIEZY `model_dump` (model w magazynie nietkniety).
    """
    base_hash = compute_enm_hash(enm)
    snapshot = enm.model_dump(mode="json")
    nadpisania: list[Nadpisanie] = []

    for ref_id in scenariusz.out_of_service:
        kolekcja = _znajdz_kolekcje(snapshot, ref_id)
        if kolekcja is None:
            raise ScenariuszNieprzystajeError(
                scenariusz.scenario_id, ref_id, "brak elementu do wylaczenia w zadnej kolekcji"
            )
        snapshot[kolekcja] = [
            element
            for element in snapshot[kolekcja]
            if not (isinstance(element, dict) and str(element.get("ref_id")) == ref_id)
        ]
        nadpisania.append(Nadpisanie("out_of_service", kolekcja, ref_id, "obecny", "nieobecny"))

    generatory = _indeks_elementow(snapshot, "generators")
    for ref_id, nastawa in scenariusz.setpoints.items():
        generator = generatory.get(ref_id)
        if generator is None:
            raise ScenariuszNieprzystajeError(
                scenariusz.scenario_id, ref_id, "brak generatora dla nastawy"
            )
        for pole in ("p_mw", "q_mvar"):
            wartosc = getattr(nastawa, pole)
            if wartosc is None:
                continue
            nadpisania.append(
                Nadpisanie(f"setpoints.{pole}", "generators", ref_id, generator.get(pole), wartosc)
            )
            generator[pole] = wartosc

    for ref_id, mnoznik in scenariusz.gen_scaling.items():
        if ref_id == "*":
            cele = list(generatory.values())
        else:
            skalowany = generatory.get(ref_id)
            if skalowany is None:
                raise ScenariuszNieprzystajeError(
                    scenariusz.scenario_id, ref_id, "brak generatora do przeskalowania"
                )
            cele = [skalowany]
        for generator in cele:
            przed = float(generator["p_mw"])
            po = _przeskaluj(przed, mnoznik)
            nadpisania.append(
                Nadpisanie("gen_scaling.p_mw", "generators", str(generator["ref_id"]), przed, po)
            )
            generator["p_mw"] = po

    if scenariusz.injections:
        lista = list(snapshot.get("generators") or [])
        for wstrzyk in scenariusz.injections:
            _wymagaj_szyny(snapshot, scenariusz, wstrzyk.bus_ref)
            if wstrzyk.ref_id in generatory:
                raise ScenariuszNieprzystajeError(
                    scenariusz.scenario_id, wstrzyk.ref_id, "generator o tym ref_id juz istnieje"
                )
            lista.append(_generator_sondy(wstrzyk))
            nadpisania.append(
                Nadpisanie(
                    "injections",
                    "generators",
                    wstrzyk.ref_id,
                    None,
                    {"bus_ref": wstrzyk.bus_ref, "p_mw": wstrzyk.p_mw, "q_mvar": wstrzyk.q_mvar},
                )
            )
        snapshot["generators"] = lista

    if scenariusz.probe_shunts:
        baterie = _indeks_elementow(snapshot, "shunt_capacitors")
        lista = list(snapshot.get("shunt_capacitors") or [])
        for sonda in scenariusz.probe_shunts:
            _wymagaj_szyny(snapshot, scenariusz, sonda.bus_ref)
            if sonda.ref_id in baterie:
                raise ScenariuszNieprzystajeError(
                    scenariusz.scenario_id, sonda.ref_id, "bateria o tym ref_id juz istnieje"
                )
            lista.append(_bateria_sondy(sonda))
            nadpisania.append(
                Nadpisanie(
                    "probe_shunts",
                    "shunt_capacitors",
                    sonda.ref_id,
                    None,
                    {"bus_ref": sonda.bus_ref, "catalog_ref": sonda.catalog_ref},
                )
            )
        snapshot["shunt_capacitors"] = lista

    snapshot_hash = base_hash if not nadpisania else hash_migawki_enm(snapshot)
    return EffectiveNetworkSnapshot(
        snapshot=snapshot,
        snapshot_hash=snapshot_hash,
        base_hash=base_hash,
        base_revision=int(enm.header.revision),
        scenario_id=scenariusz.scenario_id,
        scenario_revision=scenariusz.revision,
        scenario_hash=scenariusz.hash,
        nadpisania=tuple(nadpisania),
    )


def czy_stan_normalny(scenario_id: str) -> bool:
    """Czy to scenariusz STANU NORMALNEGO (`SCENARIUSZ_NORMALNY`) — bieg bez scenariusza."""
    return scenario_id == ID_SCENARIUSZA_NORMALNEGO


def referencja_koperty(
    migawka: EffectiveNetworkSnapshot,
) -> tuple[tuple[str, int] | None, str | None]:
    """JEDYNA regula „co niesie koperta biegu o scenariuszu".

    Bieg na stanie normalnym (scenariusz `SCENARIUSZ_NORMALNY`, jawnie albo
    domyslnie) dostaje koperte WERSJI 1 — identyczna z biegiem sprzed CV-3.1;
    kazdy inny scenariusz (nazwany albo przejsciowy) jest w kopercie
    zapisany referencja i hashem tresci.
    """
    if czy_stan_normalny(migawka.scenario_id):
        return None, None
    return migawka.scenario_ref, migawka.scenario_hash


def opcje_biegu_ze_scenariusza(scenariusz: OperatingScenario) -> dict[str, Any]:
    """Projekcja scenariusza zwarciowego na opcje biegu — JEDNO zrodlo prawdy.

    Wykonawca kanoniczny (`enm/canonical_analysis._execute_short_circuit`) czyta
    `fault_type`, `c_factor`, `thermal_time_seconds` i `location` Z WIERZCHU opcji;
    klucz `config` zostaje jako pochodzenie (WHITE BOX). Scenariusz bez
    `fault_spec` nie wnosi zadnych opcji.
    """
    spec = scenariusz.fault_spec
    if spec is None:
        return {}
    return {
        "scenario_id": str(spec.scenario_id),
        "fault_type": spec.fault_type.value,
        "location": spec.location.to_dict(),
        "config": spec.config.to_dict(),
        "c_factor": spec.config.c_factor,
        "thermal_time_seconds": spec.config.thermal_time_seconds,
    }


# ---------------------------------------------------------------------------
# Magazyn scenariuszy nazwanych (per projekt, rejestr rewizji append-only)
# ---------------------------------------------------------------------------


def _store_dir() -> Path:
    configured = os.getenv("ENM_STORE_DIR")
    return Path(configured) if configured else _DEFAULT_STORE_DIR


def katalog_scenariuszy(klucz: str) -> Path:
    return _store_dir() / f"{digest_klucza(klucz)}{SUFIKS_KATALOGU_SCENARIUSZY}"


def _sciezka_scenariusza(klucz: str, scenario_id: str) -> Path:
    return katalog_scenariuszy(klucz) / f"{scenario_id}.json"


@dataclass(frozen=True)
class StanScenariusza:
    """Biezacy stan scenariusza nazwanego w magazynie (dla swiezosci biegow)."""

    rewizja: int
    usuniety: bool


def _wczytaj_rejestr(klucz: str, scenario_id: str) -> dict[str, Any] | None:
    sciezka = _sciezka_scenariusza(klucz, scenario_id)
    if not sciezka.exists():
        return None
    try:
        rejestr = json.loads(sciezka.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ScenariuszUszkodzonyError(f"{sciezka}: {exc}") from exc
    if not isinstance(rejestr, dict) or not isinstance(rejestr.get("rewizje"), list):
        raise ScenariuszUszkodzonyError(f"{sciezka}: brak rejestru rewizji")
    if not rejestr["rewizje"]:
        raise ScenariuszUszkodzonyError(f"{sciezka}: pusty rejestr rewizji")
    return rejestr


def _zapisz_rejestr(klucz: str, scenario_id: str, rejestr: dict[str, Any]) -> None:
    katalog = katalog_scenariuszy(klucz)
    katalog.mkdir(parents=True, exist_ok=True)
    docelowa = _sciezka_scenariusza(klucz, scenario_id)
    tmp = sciezka_tymczasowa(docelowa)
    tekst = json.dumps(rejestr, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    try:
        tmp.write_text(tekst, encoding="utf-8")
        tmp.replace(docelowa)
    except OSError:
        tmp.unlink(missing_ok=True)
        raise


def _scenariusz_z_wpisu(klucz: str, wpis: dict[str, Any]) -> OperatingScenario:
    try:
        return OperatingScenario.model_validate(wpis["scenariusz"])
    except (KeyError, ValidationError) as exc:
        raise ScenariuszUszkodzonyError(f"{klucz}: nieprawidlowy wpis rewizji: {exc}") from exc


def zapisz_scenariusz(klucz: str, scenariusz: OperatingScenario) -> OperatingScenario:
    """Zapisz nowa rewizje scenariusza nazwanego (append-only).

    Numer rewizji nadaje MAGAZYN (ostatnia + 1); rewizja podana przez wolajacego
    jest ignorowana jako zrodlo numeru. Zapis tresci identycznej z ostatnia
    rewizja (ta sama nazwa, ten sam rodzaj, ten sam hash) NIE tworzy rewizji —
    „brak zmiany" nie jest zmiana. Scenariusz usuniety wpisem nagrobkowym mozna
    zapisac ponownie (rewizja rosnie dalej, historia zostaje).
    """
    if scenariusz.przejsciowy:
        raise ScenariuszPrzejsciowyError(
            f"Scenariusz przejsciowy {scenariusz.scenario_id!r} nie jest zapisywany w magazynie"
        )
    rejestr = _wczytaj_rejestr(klucz, scenariusz.scenario_id)
    if rejestr is None:
        rejestr = {
            "wersja": WERSJA_ZAPISU_SCENARIUSZA,
            "klucz": klucz,
            "scenario_id": scenariusz.scenario_id,
            "rewizje": [],
        }
        nastepna = 1
    else:
        ostatni = rejestr["rewizje"][-1]
        nastepna = int(ostatni["revision"]) + 1
        if not ostatni.get("usuniety"):
            poprzedni = _scenariusz_z_wpisu(klucz, ostatni)
            if (
                poprzedni.hash == scenariusz.hash
                and poprzedni.name == scenariusz.name
                and poprzedni.kind == scenariusz.kind
            ):
                return poprzedni
    zapisany = scenariusz.model_copy(update={"revision": nastepna})
    rejestr["rewizje"].append(
        {
            "revision": nastepna,
            "usuniety": False,
            "hash": zapisany.hash,
            "scenariusz": zapisany.model_dump(mode="json"),
        }
    )
    _zapisz_rejestr(klucz, scenariusz.scenario_id, rejestr)
    return zapisany


def usun_scenariusz(klucz: str, scenario_id: str) -> int:
    """Wpis nagrobkowy (nowa rewizja `usuniety=True`); zwraca jej numer."""
    rejestr = _wczytaj_rejestr(klucz, scenario_id)
    if rejestr is None or rejestr["rewizje"][-1].get("usuniety"):
        raise ScenariuszNieistniejeError(klucz, scenario_id)
    nastepna = int(rejestr["rewizje"][-1]["revision"]) + 1
    rejestr["rewizje"].append({"revision": nastepna, "usuniety": True})
    _zapisz_rejestr(klucz, scenario_id, rejestr)
    return nastepna


def stan_scenariusza(klucz: str, scenario_id: str) -> StanScenariusza | None:
    """Biezaca rewizja i flaga usuniecia; `None` gdy scenariusza nigdy nie bylo."""
    rejestr = _wczytaj_rejestr(klucz, scenario_id)
    if rejestr is None:
        return None
    ostatni = rejestr["rewizje"][-1]
    return StanScenariusza(rewizja=int(ostatni["revision"]), usuniety=bool(ostatni.get("usuniety")))


def wczytaj_scenariusz(
    klucz: str, scenario_id: str, rewizja: int | None = None
) -> OperatingScenario:
    """Scenariusz w podanej rewizji (`None` = najnowsza, nieusunieta)."""
    rejestr = _wczytaj_rejestr(klucz, scenario_id)
    if rejestr is None:
        raise ScenariuszNieistniejeError(klucz, scenario_id, rewizja)
    wpisy = rejestr["rewizje"]
    if rewizja is None:
        wpis = wpisy[-1]
        if wpis.get("usuniety"):
            raise ScenariuszNieistniejeError(klucz, scenario_id)
        return _scenariusz_z_wpisu(klucz, wpis)
    for wpis in wpisy:
        if int(wpis["revision"]) == rewizja:
            if wpis.get("usuniety"):
                raise ScenariuszNieistniejeError(klucz, scenario_id, rewizja)
            return _scenariusz_z_wpisu(klucz, wpis)
    raise ScenariuszNieistniejeError(klucz, scenario_id, rewizja)


def znajdz_klucz_scenariusza(scenario_id: str) -> str | None:
    """Klucz magazynu (projektu), ktory przechowuje scenariusz o tym identyfikatorze
    — BEZ indeksu drugiej prawdy (karta C6-PERSIST).

    Konczowki API adresowane WYLACZNIE `scenario_id` (bez `case_id` w sciezce:
    `GET/PUT/DELETE .../fault-scenarios/{scenario_id}`, `.../eligibility`,
    `.../sld-overlay`, `.../runs`) potrzebuja klucza magazynu, zeby w ogole
    wolac `wczytaj_scenariusz`/`zapisz_scenariusz`/`usun_scenariusz` — a klucz
    zalezy od PROJEKTU, ktorego adres nie jest czescia sciezki. Zamiast osobnego
    pliku indeksu (`scenario_id -> klucz`), ktory moglby sie rozjechac z
    rzeczywistymi plikami po awarii zapisu, PRZEGLADAMY magazyn: kazdy plik
    scenariusza jest juz nazwany `<scenario_id>.json` (patrz `_sciezka_
    scenariusza`) i jego WLASNY rejestr niesie pole `"klucz"` (patrz
    `zapisz_scenariusz`) — jedno zrodlo prawdy, ten sam plik, ktory i tak trzeba
    by odczytac.

    Zwraca `None`, gdy zaden projekt nie ma pliku o tej nazwie (scenariusz
    nigdy nie istnial, albo zyje wylacznie w `legacy_przypadki/` po migracji
    klucza — CV-1); wolajacy tlumaczy to na `FaultScenarioNotFoundError`
    (uczciwy 404, nieodrozniny od „scenariusz nigdy nie istnial" — z perspektywy
    API to ten sam brak).

    Wiele trafien jest teoretycznie niemozliwe (identyfikator scenariusza to
    `uuid4()` nadany raz przy tworzeniu) — gdyby jednak wystapilo, wybor jest
    DETERMINISTYCZNY (posortowane sciezki, pierwsza wygrywa), nie przypadkowy.
    """
    korzen = _store_dir()
    if not korzen.is_dir():
        return None
    dopasowania = sorted(korzen.glob(f"*{SUFIKS_KATALOGU_SCENARIUSZY}/{scenario_id}.json"))
    if not dopasowania:
        return None
    plik = dopasowania[0]
    try:
        rejestr = json.loads(plik.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ScenariuszUszkodzonyError(f"{plik}: {exc}") from exc
    if not isinstance(rejestr, dict) or not rejestr.get("klucz"):
        raise ScenariuszUszkodzonyError(f"{plik}: brak pola 'klucz' w rejestrze")
    return str(rejestr["klucz"])


def lista_scenariuszy(klucz: str) -> list[OperatingScenario]:
    """Najnowsze, nieusuniete rewizje wszystkich scenariuszy projektu (po identyfikatorze)."""
    katalog = katalog_scenariuszy(klucz)
    if not katalog.is_dir():
        return []
    wynik: list[OperatingScenario] = []
    for plik in sorted(katalog.glob("*.json")):
        stan = stan_scenariusza(klucz, plik.stem)
        if stan is None or stan.usuniety:
            continue
        wynik.append(wczytaj_scenariusz(klucz, plik.stem))
    return wynik


def ma_scenariusze(klucz: str) -> bool:
    """Predykat „projekt ma juz wlasne scenariusze" — JEDEN dla decyzji o
    przeniesieniu katalogu w migracji klucza (CV-1) i dla zabezpieczenia w
    `przenies_katalog_scenariuszy_pod_klucz`."""
    katalog = katalog_scenariuszy(klucz)
    return katalog.is_dir() and any(katalog.glob("*.json"))


def przenies_katalog_scenariuszy(klucz: str, katalog_docelowy: Path) -> bool:
    """Przenies caly katalog scenariuszy klucza do `katalog_docelowy`
    (odlozenie przypadku do `legacy_przypadki/`). True, gdy bylo co przenosic."""
    zrodlo = katalog_scenariuszy(klucz)
    if not zrodlo.is_dir():
        return False
    cel = katalog_docelowy / zrodlo.name
    if cel.exists():
        shutil.rmtree(cel)
    shutil.move(str(zrodlo), str(cel))
    return True


def przenies_katalog_scenariuszy_pod_klucz(klucz_zrodla: str, klucz_celu: str) -> bool:
    """Scenariusze ida ZA modelem (migracja CV-1). Odmowa (`False`), gdy cel ma
    juz wlasne scenariusze — nadpisanie cudzych byloby utrata danych. Najpierw
    pelna kopia pod celem (kazdy plik przez zapis roboczy + atomowa podmiana, z
    przepisanym polem `klucz`), potem znika katalog zrodla."""
    zrodlo = katalog_scenariuszy(klucz_zrodla)
    if not zrodlo.is_dir():
        return False
    if ma_scenariusze(klucz_celu):
        return False
    przeniesione = 0
    for plik in sorted(zrodlo.glob("*.json")):
        rejestr = _wczytaj_rejestr(klucz_zrodla, plik.stem)
        if rejestr is None:
            continue
        rejestr = copy.deepcopy(rejestr)
        rejestr["klucz"] = klucz_celu
        _zapisz_rejestr(klucz_celu, plik.stem, rejestr)
        przeniesione += 1
    shutil.rmtree(zrodlo)
    return przeniesione > 0


def usun_wszystkie_scenariusze() -> None:
    """Reset magazynu scenariuszy — razem z `reset_enm_store` (jeden cykl zycia)."""
    katalog = _store_dir()
    if not katalog.exists():
        return
    for sciezka in katalog.glob(f"*{SUFIKS_KATALOGU_SCENARIUSZY}"):
        if sciezka.is_dir():
            shutil.rmtree(sciezka, ignore_errors=True)
