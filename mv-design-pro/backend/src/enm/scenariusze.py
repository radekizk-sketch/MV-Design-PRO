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
from typing import Annotated, Any, Literal
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


# ---------------------------------------------------------------------------
# Zdarzenia dynamiczne (karta W6-1 SS0 p.5) — harmonogram czytany przez solver
# W6-2 (`network_model/solvers/dynamika/`, nie istnieje w tej karcie). ZERO
# fizyki tutaj: `apply_scenario` NIE stosuje tych zdarzen do migawki (scenariusz
# statyczny — out_of_service/setpoints — pozostaje jedynym stanem POCZATKOWYM;
# harmonogram jest danymi wejsciowymi solvera czasowego, nie druga sciezka
# mutacji modelu).
# ---------------------------------------------------------------------------

#: Odleglosc gorna horyzontu symulacji dynamicznej (s) — RMS krotkoterminowe
#: (stabilnosc, FRT), nie QSTS (profile godzinowe wchodza w W6-6 jako osobna
#: encja `ProfilCzasowy`, poza tym kontraktem).
_MAX_HORYZONT_DYNAMIKI_S = 600.0


class Zwarcie(BaseModel):
    """Zwarcie w WEZLE (`bus_ref`) albo w LINII/KABLU w miejscu `x*L` (`element_ref` +
    `polozenie_wzgledne` w przedziale otwartym (0, 1), liczone od zacisku poczatkowego
    galezi) — dokladnie jedno z dwoch miejsc (karta AB-1b.1 par. 0 pkt 5). 3F w W6-2;
    2F/1F/2FZ modelowane w W6-4 (skladowe symetryczne); tu WYLACZNIE ksztalt danych,
    solver decyduje co umie policzyc (zwarcie w transformatorze albo laczniku konczy sie
    odmowa rdzenia `dynamika.zwarcie_galezi_nieobslugiwane`)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    rodzaj: Literal["zwarcie"] = "zwarcie"
    t_s: float = Field(ge=0.0, le=_MAX_HORYZONT_DYNAMIKI_S)
    bus_ref: str | None = Field(default=None, min_length=1)
    element_ref: str | None = Field(default=None, min_length=1)
    polozenie_wzgledne: float | None = Field(default=None, gt=0.0, lt=1.0)
    typ: Literal["3F", "2F", "1F", "2FZ"]
    r_f_ohm: float = Field(ge=0.0, le=100_000.0)
    x_f_ohm: float = Field(ge=0.0, le=100_000.0)
    t_usuniecia_s: float | None = Field(default=None, ge=0.0, le=_MAX_HORYZONT_DYNAMIKI_S)
    #: Jawny sposob usuniecia (karta AB-1b.1 par. 0 pkt 4): `izolacja` — aparaty
    #: odcinaja miejsce zwarcia (rdzen sprawdza to w stanie po zdarzeniach chwili
    #: usuniecia i odmawia `dynamika.zwarcie_nieodizolowane`, gdy miejsce nadal jest
    #: zasilane); `samoczynne` — zadeklarowana idealizacja zwarcia przemijajacego
    #: (luk gasnie pod napieciem), dopisywana do zalozen wyniku. Podawany razem z
    #: `t_usuniecia_s` albo wcale — ta sama para, ktora waliduje kontrakt rdzenia.
    sposob_usuniecia: Literal["izolacja", "samoczynne"] | None = None

    @model_validator(mode="after")
    def _usuniecie_po_zwarciu(self) -> Zwarcie:
        if (self.bus_ref is None) == (self.element_ref is None):
            raise ValueError(
                "Zwarcie: podaj dokladnie jedno miejsce — `bus_ref` (zwarcie w wezle) albo "
                "`element_ref` z `polozenie_wzgledne` (zwarcie w linii/kablu w x*L); "
                f"podano bus_ref={self.bus_ref!r}, element_ref={self.element_ref!r}."
            )
        if (self.element_ref is None) != (self.polozenie_wzgledne is None):
            raise ValueError(
                "Zwarcie: `polozenie_wzgledne` podaje sie razem z `element_ref` i tylko z nim "
                f"(element_ref={self.element_ref!r}, "
                f"polozenie_wzgledne={self.polozenie_wzgledne!r})."
            )
        if self.t_usuniecia_s is not None and self.t_usuniecia_s <= self.t_s:
            raise ValueError(
                f"Zwarcie: t_usuniecia_s ({self.t_usuniecia_s}) musi byc pozniej niz "
                f"t_s ({self.t_s}) — zwarcie nie moze byc usuniete przed wystapieniem."
            )
        if (self.t_usuniecia_s is None) != (self.sposob_usuniecia is None):
            raise ValueError(
                f"Zwarcie: t_usuniecia_s ({self.t_usuniecia_s}) i sposob_usuniecia "
                f"({self.sposob_usuniecia}) podaje sie razem albo wcale — usuniecie bez "
                "jawnego sposobu nie mowi, czy luk zgasl po odcieciu (izolacja), czy pod "
                "napieciem (samoczynne)."
            )
        return self


class WylaczenieGalezi(BaseModel):
    """Otwarcie lacznika/galezi w chwili t_s (harmonogram, nie mutacja migawki)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    rodzaj: Literal["wylaczenie_galezi"] = "wylaczenie_galezi"
    t_s: float = Field(ge=0.0, le=_MAX_HORYZONT_DYNAMIKI_S)
    element_ref: str = Field(min_length=1)


class ZalaczenieGalezi(BaseModel):
    """Zamkniecie lacznika/galezi w chwili t_s."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    rodzaj: Literal["zalaczenie_galezi"] = "zalaczenie_galezi"
    t_s: float = Field(ge=0.0, le=_MAX_HORYZONT_DYNAMIKI_S)
    element_ref: str = Field(min_length=1)


class OdlaczenieZrodla(BaseModel):
    """Odlaczenie zrodla (generatora/zrodla sieciowego) od sieci w chwili t_s."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    rodzaj: Literal["odlaczenie_zrodla"] = "odlaczenie_zrodla"
    t_s: float = Field(ge=0.0, le=_MAX_HORYZONT_DYNAMIKI_S)
    ref_id: str = Field(min_length=1)


class SkokObciazenia(BaseModel):
    """Skokowa zmiana mocy ODBIORU w chwili t_s (delta wzgledem stanu poczatkowego
    scenariusza — solver dodaje delte do punktu pracy z rozplywu).

    KOREKTA 2026-09-23 (karta AB-1b.1, S18): docstring mowil „odbioru/zrodla", a
    adapter biegu odmawia skoku wskazujacego zrodlo (`dynamika.skok_obciazenia_poza_
    odbiorem`) — deklaracja bez pokrycia. Skokowa zmiana nastawy wytworcy to komenda
    regulacji, nie skok obciazenia."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    rodzaj: Literal["skok_obciazenia"] = "skok_obciazenia"
    t_s: float = Field(ge=0.0, le=_MAX_HORYZONT_DYNAMIKI_S)
    ref_id: str = Field(min_length=1)
    delta_p_mw: float = Field(ge=-100_000.0, le=100_000.0)
    delta_q_mvar: float = Field(ge=-100_000.0, le=100_000.0)


class OdlaczenieOdbioru(BaseModel):
    """NAZWANE odlaczenie odbioru w chwili t_s (karta AB-1b.1, FREEZE par. 2 wiersz D7).

    Odlaczenie jest zdarzeniem laczeniowym, nie skokiem mocy do zera: odbior odlaczony
    nie ma obwodu i nie wchodzi do bilansu wezla, a jego wczesniejsze skoki mocy
    wracaja z nim przy `zalaczenie_odbioru`.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    rodzaj: Literal["odlaczenie_odbioru"] = "odlaczenie_odbioru"
    t_s: float = Field(ge=0.0, le=_MAX_HORYZONT_DYNAMIKI_S)
    ref_id: str = Field(min_length=1)


class ZalaczenieOdbioru(BaseModel):
    """Ponowne zalaczenie odbioru odlaczonego wczesniej zdarzeniem `odlaczenie_odbioru`."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    rodzaj: Literal["zalaczenie_odbioru"] = "zalaczenie_odbioru"
    t_s: float = Field(ge=0.0, le=_MAX_HORYZONT_DYNAMIKI_S)
    ref_id: str = Field(min_length=1)


class KomendaRegulacji(BaseModel):
    """Zmiana nastawy regulatora zrodla w chwili t_s — reuzywa `Nastawa`
    (jedno zrodlo prawdy ksztaltu nastawy: scenariusz statyczny i harmonogram
    dynamiczny nadpisuja p_mw/q_mvar tym samym kontraktem)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    rodzaj: Literal["komenda_regulacji"] = "komenda_regulacji"
    t_s: float = Field(ge=0.0, le=_MAX_HORYZONT_DYNAMIKI_S)
    ref_id: str = Field(min_length=1)
    nastawa: Nastawa


class Synchronizacja(BaseModel):
    """Synchronizacja zrodla z siecia (zalaczenie na szyne pod napieciem) w t_s."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    rodzaj: Literal["synchronizacja"] = "synchronizacja"
    t_s: float = Field(ge=0.0, le=_MAX_HORYZONT_DYNAMIKI_S)
    ref_id: str = Field(min_length=1)
    bus_ref: str = Field(min_length=1)


ZdarzenieDynamiczne = Annotated[
    Zwarcie
    | WylaczenieGalezi
    | ZalaczenieGalezi
    | OdlaczenieZrodla
    | SkokObciazenia
    | OdlaczenieOdbioru
    | ZalaczenieOdbioru
    | KomendaRegulacji
    | Synchronizacja,
    Field(discriminator="rodzaj"),
]


class ScenariuszDynamiczny(BaseModel):
    """Harmonogram zdarzen czasowych scenariusza (karta W6-1 SS0 p.5).

    Kolejnosc kanoniczna = (t_s, indeks) — `zdarzenia_uporzadkowane` sortuje
    STABILNIE po t_s (Python `sorted` jest stabilny, wiec remisy zachowuja
    kolejnosc zapisu = "indeks"), zeby solver W6-2 czytal zawsze ten sam
    porzadek niezaleznie od kolejnosci podanej przez wolajacego.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    horyzont_s: float = Field(gt=0.0, le=_MAX_HORYZONT_DYNAMIKI_S)
    krok_wyjscia_s: float = Field(gt=0.0, le=_MAX_HORYZONT_DYNAMIKI_S)
    zdarzenia: tuple[ZdarzenieDynamiczne, ...] = ()

    @model_validator(mode="after")
    def _spojnosc_harmonogramu(self) -> ScenariuszDynamiczny:
        if self.krok_wyjscia_s > self.horyzont_s:
            raise ValueError(
                f"ScenariuszDynamiczny: krok_wyjscia_s ({self.krok_wyjscia_s}) nie moze "
                f"byc wiekszy niz horyzont_s ({self.horyzont_s})."
            )
        for zdarzenie in self.zdarzenia:
            if zdarzenie.t_s > self.horyzont_s:
                raise ValueError(
                    f"ScenariuszDynamiczny: zdarzenie {zdarzenie.rodzaj!r} w t_s="
                    f"{zdarzenie.t_s} wykracza poza horyzont_s ({self.horyzont_s})."
                )
            if (
                isinstance(zdarzenie, Zwarcie)
                and zdarzenie.t_usuniecia_s is not None
                and zdarzenie.t_usuniecia_s > self.horyzont_s
            ):
                raise ValueError(
                    f"ScenariuszDynamiczny: zwarcie w t_s={zdarzenie.t_s} ma "
                    f"t_usuniecia_s={zdarzenie.t_usuniecia_s} poza horyzont_s "
                    f"({self.horyzont_s})."
                )
        return self

    @property
    def zdarzenia_uporzadkowane(self) -> tuple[ZdarzenieDynamiczne, ...]:
        """Kolejnosc kanoniczna (t_s, indeks) — sort stabilny po t_s."""
        return tuple(sorted(self.zdarzenia, key=lambda z: z.t_s))

    def tresc(self) -> dict[str, Any]:
        """Kanoniczna tresc do hasha scenariusza — kolejnosc ZAPISU (nie
        posortowana): dwa scenariusze z tymi samymi zdarzeniami w innej
        kolejnosci zapisu maja INNY hash (kolejnosc jest czescia tresci,
        `indeks` w "(t_s, indeks)" to pozycja zapisu)."""
        return {
            "horyzont_s": self.horyzont_s,
            "krok_wyjscia_s": self.krok_wyjscia_s,
            "zdarzenia": [z.model_dump(mode="json") for z in self.zdarzenia],
        }


#: Referencje elementu wymagane przez kazdy rodzaj zdarzenia — (atrybut, opis)
#: uzywane przez `_waliduj_zdarzenia_dynamiczne` (jedno zrodlo prawdy predykatu
#: "ref istnieje w modelu", zamiast siedmiu odrebnych sprawdzen).
#: Kolekcje ENM, na ktorych moze dzialac zdarzenie laczeniowe galezi (karta AB-1b.1
#: par. 0 pkt 1): galezie, transformatory i BATERIE KONDENSATOROW — laczenie baterii
#: jest ta sama klasa mechanizmu, co laczenie galezi (adapter rozpoznaje kolekcje).
KOLEKCJE_LACZENIA_GALEZI: tuple[str, ...] = ("branches", "transformers", "shunt_capacitors")


def _refy_zdarzenia(
    zdarzenie: ZdarzenieDynamiczne,
) -> tuple[tuple[str, str, tuple[str, ...]], ...]:
    """(atrybut, ref, DOZWOLONE kolekcje) kazdej referencji zdarzenia — JEDEN predykat.

    Dozwolone kolekcje sa czescia predykatu, nie tylko istnienie referencji: przed
    karta AB-1b.1 `wylaczenie_galezi` wskazujace GENERATOR przechodzilo walidacje
    danych (element „istnieje w jakiejs kolekcji") i konczylo sie dopiero odmowa
    rdzenia — klasa „ref istnieje, ale w zlej roli" byla niewidoczna dla projektanta.
    Adapter biegu czyta te sama klasyfikacje kolekcji (bateria -> zdarzenie odsprzegu).
    """
    if isinstance(zdarzenie, Zwarcie):
        if zdarzenie.bus_ref is not None:
            return (("bus_ref", zdarzenie.bus_ref, ("buses",)),)
        assert zdarzenie.element_ref is not None  # gwarantuje walidator modelu
        return (("element_ref", zdarzenie.element_ref, ("branches",)),)
    if isinstance(zdarzenie, WylaczenieGalezi | ZalaczenieGalezi):
        return (("element_ref", zdarzenie.element_ref, KOLEKCJE_LACZENIA_GALEZI),)
    if isinstance(zdarzenie, OdlaczenieZrodla | KomendaRegulacji):
        return (("ref_id", zdarzenie.ref_id, ("generators", "sources")),)
    if isinstance(zdarzenie, SkokObciazenia | OdlaczenieOdbioru | ZalaczenieOdbioru):
        return (("ref_id", zdarzenie.ref_id, ("loads",)),)
    if isinstance(zdarzenie, Synchronizacja):
        return (
            ("ref_id", zdarzenie.ref_id, ("generators", "sources")),
            ("bus_ref", zdarzenie.bus_ref, ("buses",)),
        )
    raise AssertionError(f"Nieznany rodzaj zdarzenia: {zdarzenie!r}")  # pragma: no cover


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
    dynamika: ScenariuszDynamiczny | None = None
    """
    Harmonogram zdarzen czasowych (karta W6-1 SS0 p.5). `None` = brak scenariusza
    dynamicznego (domyslne — addytywne). `apply_scenario` NIE stosuje tych
    zdarzen do migawki — scenariusz statyczny (`out_of_service`/`setpoints`)
    pozostaje jedynym stanem POCZATKOWYM migawki efektywnej, a harmonogram jest
    DANA WEJSCIOWA biegu czasowego: `opcje_biegu_ze_scenariusza` rzutuje go na
    `options["dynamika"]`, skad czyta go adapter (karta W6-3B).
    """

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
        """Kanoniczna tresc nadpisan (to, co wchodzi do hasha).

        Karta W6-1 SS0 p.5: "hash scenariusza obejmuje blok" `dynamika` — klucz
        WYLACZNIE gdy blok jest ustawiony (wzorzec `branch_contributions_mode`
        w `opcje_biegu_ze_scenariusza` ponizej): scenariusz BEZ dynamiki ma
        bajtowo TA SAMA tresc/hash co przed ta karta (zero zmiany istniejacych
        odciskow scenariuszy w magazynie).
        """
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
            **({"dynamika": self.dynamika.tresc()} if self.dynamika is not None else {}),
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


def _waliduj_zdarzenia_dynamiczne(snapshot: dict[str, Any], scenariusz: OperatingScenario) -> None:
    """Refy harmonogramu dynamicznego istnieja w migawce PO nadpisaniach statycznych
    (karta W6-1 SS0 p.5: "refy istnieja w modelu... nigdy cichy skip" — ten sam
    predykat co `_wymagaj_szyny`/`_znajdz_kolekcje` powyzej, zastosowany do
    zdarzen zamiast do out_of_service/injections/probe_shunts: KLASA, nie
    instancja jednego sprawdzenia).

    Walidacja WYLACZNIE — `apply_scenario` NIE stosuje zdarzen do migawki (solver
    W6-2 czyta harmonogram bezposrednio), wiec funkcja nic nie zwraca i niczego
    nie mutuje; podnosi `ScenariuszNieprzystajeError` przy pierwszym brakujacym
    ref (deterministyczna kolejnosc: `zdarzenia_uporzadkowane`, nie kolejnosc
    zapisu — zeby blad byl stabilny niezaleznie od zmiany kolejnosci pol
    wejsciowych o tym samym tresci)."""
    dynamika = scenariusz.dynamika
    assert dynamika is not None  # wolane wylacznie gdy blok ustawiony
    for zdarzenie in dynamika.zdarzenia_uporzadkowane:
        for atrybut, ref, dozwolone in _refy_zdarzenia(zdarzenie):
            if atrybut == "bus_ref":
                if ref not in _indeks_elementow(snapshot, "buses"):
                    raise ScenariuszNieprzystajeError(
                        scenariusz.scenario_id,
                        ref,
                        f"zdarzenie '{zdarzenie.rodzaj}' (t_s={zdarzenie.t_s}): brak takiej szyny",
                    )
                continue
            kolekcja = _znajdz_kolekcje(snapshot, ref)
            if kolekcja is None:
                raise ScenariuszNieprzystajeError(
                    scenariusz.scenario_id,
                    ref,
                    f"zdarzenie '{zdarzenie.rodzaj}' (t_s={zdarzenie.t_s}): "
                    "brak elementu w zadnej kolekcji",
                )
            if kolekcja not in dozwolone:
                raise ScenariuszNieprzystajeError(
                    scenariusz.scenario_id,
                    ref,
                    f"zdarzenie '{zdarzenie.rodzaj}' (t_s={zdarzenie.t_s}): element nalezy do "
                    f"kolekcji '{kolekcja}', a ten rodzaj zdarzenia dziala wylacznie na "
                    f"{', '.join(dozwolone)}",
                )


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

    if scenariusz.dynamika is not None:
        _waliduj_zdarzenia_dynamiczne(snapshot, scenariusz)

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
    """Projekcja scenariusza (zwarciowego i dynamicznego) na opcje biegu — JEDNO zrodlo prawdy.

    Wykonawca kanoniczny (`enm/canonical_analysis._execute_short_circuit`) czyta
    `fault_type`, `c_factor`, `thermal_time_seconds` i `location` Z WIERZCHU opcji;
    klucz `config` zostaje jako pochodzenie (WHITE BOX).

    Karta W6-3B: harmonogram dynamiczny (`ScenariuszDynamiczny`) idzie ta sama
    droga pod kluczem `dynamika` — dzieki temu wchodzi do `input_hash` biegu
    (dwa biegi o roznych harmonogramach sa ROZNYMI biegami) i czyta go adapter
    (`enm/adapter_dynamiki.py::scenariusz_z_opcji`) z JEDNEGO miejsca, niezaleznie
    od tego, czy harmonogram przyszedl ze scenariusza nazwanego, czy wprost w
    `options` zadania. Klucz pojawia sie WYLACZNIE, gdy scenariusz go niesie —
    payload i hash scenariuszy bez dynamiki sa bajtowo te same.

    Scenariusz bez `fault_spec` i bez `dynamika` nie wnosi zadnych opcji.
    """
    opcje: dict[str, Any] = {}
    if scenariusz.dynamika is not None:
        opcje["dynamika"] = scenariusz.dynamika.model_dump(mode="json")
    spec = scenariusz.fault_spec
    if spec is None:
        return opcje
    return {
        **opcje,
        "scenario_id": str(spec.scenario_id),
        "fault_type": spec.fault_type.value,
        "location": spec.location.to_dict(),
        "config": spec.config.to_dict(),
        "c_factor": spec.config.c_factor,
        "thermal_time_seconds": spec.config.thermal_time_seconds,
        # PERF-SC-50: `include_branch_contributions` scenariusza staje się realnym
        # sterowaniem biegu (do tej karty zapisywane w `config`, nieczytane przez
        # wykonawcę — fantom). Klucz tylko przy True: payload/hash scenariuszy bez
        # flagi (domyślne False) pozostaje bajtowo ten sam.
        **(
            {"branch_contributions_mode": "in_run"}
            if spec.config.include_branch_contributions
            else {}
        ),
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
