"""ResultSetDynamicV1 — kontrakt kanonicznego wyniku czasowego (karta W6-1 SS0 p.6).

CANONICAL ALIGNMENT:
- Kontrakt OSOBNY od `domain/result_contract_v1.py::ResultSetV1` (A-13, DT-10) —
  `ResultSetV1` NIE jest rozszerzany; biegi statyczne (PF/SC) i biegi czasowe
  (`dynamika_rms`) maja rozlaczne kontrakty w JEDNYM rejestrze biegow
  (`CanonicalRun`).
- FROZEN dopiero PO odbiorze W6-2 (rdzen solvera) — w tej karcie ksztalt jest
  projektowany, ale W6-1 sam NIE produkuje zadnej instancji z prawdziwym biegiem
  (dyspozytor odmawia `dynamika.rdzen_niedostepny` — solver nie istnieje).
- Zero fizyki: modul niesie WYLACZNIE ksztalt danych i pomocnicze funkcje
  budowy/kwantyzacji, zadnego rownania ruchu ani calkowania.
- Szeregi czasowe (`os_czasu_s`/`probki`) NIE wchodza do `CanonicalRun.raw_result`
  (PERF-SC-50 lekcja: nigdy pelny szereg w wierszu biegu) — osobna tabela
  `canonical_run_time_series` (infrastructure/persistence), API rozdziela
  metadane (`GET .../results/dynamika`) od probek na zadanie
  (`GET .../results/dynamika/time-series?kanaly=...`).
- Kwantyzacja 9 cyfr znaczacych na GRANICY kontraktu (DT-11, ADR-018/M0-2) —
  `zbuduj_resultset_dynamiczny_v1` kwantyzuje kazdy float przez
  `application.analyses.kontrakt_liczb.kwantyzuj_kontrakt` przed zwroceniem.

MODELE:
- KanalDynamicznyV1: opis jednego kanalu wyniku (klucz, przestrzen, jednostka).
- ZdarzenieWykonaneV1: zdarzenie z harmonogramu FAKTYCZNIE wykonane przez solver
  (t zaplanowany vs wykonany, residua re-inicjalizacji).
- WlasnosciBieguV1: zbieznosc, liczba krokow/odrzuconych, residua, integrator.
- TozsamoscBieguDynamicznegoV1: piec odciskow + wersja solvera (determinizm).
- MetrykaDynamicznaV1: pojedyncza metryka skalarna (np. u_min_pu, cct_s).
- StopienDowodowyV1: mirror `solver_input.provenance.CapabilityEvidence` (JSON).
- ResultSetDynamicV1: kontener najwyzszego poziomu.
"""

from __future__ import annotations

from typing import Any, Literal

from application.analyses.kontrakt_liczb import kwantyzuj_kontrakt
from pydantic import BaseModel, Field
from solver_input.provenance import CapabilityEvidence

RESULTSET_DYNAMIC_CONTRACT = "resultset_dynamic_v1"

PrzestrzenKanalu = Literal["siec", "urzadzenie", "regulator", "magazyn"]


class KanalDynamicznyV1(BaseModel):
    """Opis jednego kanalu szeregu czasowego (bez probek — te w API na zadanie)."""

    klucz: str = Field(min_length=1, description="Klucz kanalu (np. 'u_pu@b12', 'omega_pu@g1').")
    przestrzen: PrzestrzenKanalu
    jednostka: str = Field(min_length=1, description="Jednostka fizyczna (pu, Hz, s, MW, Mvar...).")
    element_ref: str | None = Field(default=None, description="Ref_id elementu ENM, gdy dotyczy.")
    opis_pl: str = Field(min_length=1, description="Opis po polsku (bez kodow projektowych).")

    model_config = {"frozen": True}


class ZdarzenieWykonaneV1(BaseModel):
    """Zdarzenie harmonogramu FAKTYCZNIE wykonane przez solver (nie zaplanowane)."""

    t_zaplanowany_s: float
    t_wykonany_s: float
    rodzaj: str = Field(min_length=1)
    ref: str | None = None
    delta_x_max: float = Field(description="Maks. skok stanu rozniczkowego przy re-inicjalizacji.")
    delta_y_max: float = Field(description="Maks. skok stanu algebraicznego przy re-inicjalizacji.")
    residuum_kcl_max: float = Field(description="Maks. residuum bilansu pradowego po re-inicjalizacji.")

    model_config = {"frozen": True}


class WlasnosciBieguV1(BaseModel):
    """Wlasnosci numeryczne biegu (zbieznosc, kroki, residua, integrator)."""

    zbiegl: bool
    kroki: int = Field(ge=0)
    kroki_odrzucone: int = Field(ge=0)
    max_residuum_f: float = Field(ge=0.0, description="Maks. residuum rownan rozniczkowych ||f||.")
    max_residuum_g: float = Field(ge=0.0, description="Maks. residuum rownan algebraicznych ||g||.")
    czas_obliczen_s: float = Field(ge=0.0)
    integrator: str = Field(min_length=1)
    dt_s: float = Field(gt=0.0)
    tolerancja: float = Field(gt=0.0)

    model_config = {"frozen": True}


class TozsamoscBieguDynamicznegoV1(BaseModel):
    """Piec odciskow tozsamosci biegu — determinizm (ta sama piatka => ten sam wynik)."""

    odcisk_migawki: str = Field(min_length=1)
    odcisk_punktu_pracy: str = Field(min_length=1)
    odcisk_nastaw_solvera: str = Field(min_length=1)
    odcisk_harmonogramu: str = Field(min_length=1)
    odcisk_implementacji: str = Field(min_length=1)
    wersja_solvera: str = Field(min_length=1)

    model_config = {"frozen": True}


class MetrykaDynamicznaV1(BaseModel):
    """Skalarna metryka wyprowadzona z przebiegu (np. u_min_pu, cct_s, rocof_max_hz_s)."""

    klucz: str = Field(min_length=1)
    wartosc: float
    jednostka: str = Field(min_length=1)
    wzor_ref: str | None = Field(default=None, description="Odniesienie do wzoru/rownania (WHITE BOX).")
    element_ref: str | None = None

    model_config = {"frozen": True}


class StopienDowodowyV1(BaseModel):
    """Mirror JSON `solver_input.provenance.CapabilityEvidence` (rejestr A-2)."""

    capability_id: str = Field(min_length=1)
    tier: str = Field(min_length=1)
    tier_pl: str = Field(min_length=1)
    claim_kind: str = Field(min_length=1)
    claim_kind_pl: str = Field(min_length=1)
    regulatory_evidence_eligible: bool
    rationale_pl: str = Field(min_length=1)
    audit_ref: str = Field(min_length=1)

    model_config = {"frozen": True}

    @classmethod
    def z_klasyfikacji(cls, ewidencja: CapabilityEvidence) -> StopienDowodowyV1:
        return cls(**ewidencja.to_dict())


class ResultSetDynamicV1(BaseModel):
    """Kanoniczny wynik czasowy — kontener najwyzszego poziomu (SS0 p.6).

    INVARIANTS:
    - `kontrakt` = "resultset_dynamic_v1" (bump wersji = nowy plik/kontrakt).
    - `probki` domyslnie PUSTE w kontenerze zapisanym w `CanonicalRun.raw_result`
      (szeregi czasowe zyja w `canonical_run_time_series`) — kontener z
      niepustymi `probki` istnieje WYLACZNIE w odpowiedzi endpointu
      `.../time-series`, nigdy w wierszu biegu.
    - Kazdy `float` skwantyzowany do 9 cyfr znaczacych na granicy kontraktu
      (`zbuduj_resultset_dynamiczny_v1`), zero NaN/Inf (fail-closed).
    """

    kontrakt: Literal["resultset_dynamic_v1"] = RESULTSET_DYNAMIC_CONTRACT
    run_id: str = Field(min_length=1)
    analysis_type: Literal["dynamika_rms"] = "dynamika_rms"
    kanaly: tuple[KanalDynamicznyV1, ...] = ()
    os_czasu_s: tuple[float, ...] = ()
    probki: dict[str, tuple[float, ...]] = Field(default_factory=dict)
    zdarzenia_wykonane: tuple[ZdarzenieWykonaneV1, ...] = ()
    wlasnosci_biegu: WlasnosciBieguV1
    tozsamosc: TozsamoscBieguDynamicznegoV1
    metryki: tuple[MetrykaDynamicznaV1, ...] = ()
    stopien_dowodowy: tuple[StopienDowodowyV1, ...] = ()
    zalozenia: tuple[str, ...] = ()

    model_config = {"frozen": True}


def zbuduj_resultset_dynamiczny_v1(wynik: ResultSetDynamicV1, *, z_probkami: bool) -> dict[str, Any]:
    """Zserializuj `ResultSetDynamicV1` do slownika skwantyzowanego (DT-11).

    `z_probkami=False` (domyslne dla `CanonicalRun.raw_result`): `os_czasu_s`
    i `probki` wychodza PUSTE — szeregi zyja w osobnej tabeli i wracaja
    wylacznie z endpointu `.../time-series`. `z_probkami=True` jest uzywane
    WYLACZNIE przy budowie odpowiedzi tego endpointu (dane pochodza wtedy z
    `canonical_run_time_series`, nie z tego samego obiektu co metadane —
    wolajacy scala oba zrodla przed wywolaniem tej funkcji z `z_probkami=True`).
    """
    surowy = wynik.model_dump(mode="json")
    if not z_probkami:
        surowy["os_czasu_s"] = []
        surowy["probki"] = {}
    return kwantyzuj_kontrakt(surowy)


__all__ = [
    "RESULTSET_DYNAMIC_CONTRACT",
    "KanalDynamicznyV1",
    "MetrykaDynamicznaV1",
    "PrzestrzenKanalu",
    "ResultSetDynamicV1",
    "StopienDowodowyV1",
    "TozsamoscBieguDynamicznegoV1",
    "WlasnosciBieguV1",
    "ZdarzenieWykonaneV1",
    "zbuduj_resultset_dynamiczny_v1",
]
