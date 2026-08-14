"""Dobór aparatu zabezpieczającego nN dla obwodu (karta P0.7, §0.5).

Warstwa APLIKACJI/ANALIZ (interpretacja — NOT-A-SOLVER). Ocenia kandydatów z
katalogu (MCB / rozłącznik bezpiecznikowy+wkładka / wyłącznik nN) przeciw
CZTEREM kryteriom normatywnym doboru zabezpieczenia obwodu nN:

    (i)   Ib <= In <= Iz′               (IEC 60364-4-43 §433.1)
    (ii)  I2 <= 1,45·Iz′                (IEC 60364-4-43 §433.1.1)
    (iii) Icu/Icn/Ic-warunkowy >= Ik″max w punkcie zabudowy (IEC 60947)
    (iv)  SWZ przy Ik_min                (IEC 60364-4-41, REUSE pakietu SWZ)

REUSE, ZERO DRUGIEJ FIZYKI:
  - Iz′: WOLANY dostarcza gotową wartość (solver `cable_ampacity_derating`
    liczy ją — ten moduł tylko PORÓWNUJE, nie liczy współczynników).
  - I2 dla MCB: stała `PROG_CIEPLNY_WYZWALA_X_IN` (1,45×In) z
    `network_model.catalog.lv_mcb_bands_iec60898` — JEDNO źródło progu
    cieplnego (G-D4), zweryfikowane przez `protection_lv_curves.
    compute_mcb_thermal_point` (nie druga stała).
  - I2 dla wkładki gG: `protection_lv_curves.compute_fuse_gg_gate` (If=1,6×In,
    G-D2) — JEDYNE miejsce liczące bramki I-t wkładek.
  - SWZ: `application.analyses.swz.werdykt.ocen_swz` — JEDNO źródło werdyktu
    3-stanowego (P0.6, G-06); ten moduł NIE odtwarza logiki Ia/tabeli
    czasów, tylko woła istniejący silnik dla KAŻDEGO kandydata.
  - Ik1_min/U0 dla wywołania SWZ: orkiestracja (`wybierz_aparat_dla_obwodu_nn`)
    powtarza DOKŁADNIE tę samą sekwencję wywołań solvera pętli zwarcia, którą
    używa `application.analyses.swz.service.build_swz_view` (import
    prywatnych helperów `fault_loop.service` — WZORZEC już ustanowiony i
    świadomie uzasadniony w `swz/service.py`; ten moduł powtarza go z tego
    samego powodu: Ik1_min NIE zależy od tego, KTÓRY aparat jest oceniany —
    tylko od trasy/impedancji, więc liczy się GO RAZ, nie per kandydat).
    `application/analyses/swz/**` pozostaje NIETKNIĘTE (granica karty P0.6).

ZERO FABRYKACJI: kryterium nieobliczalne (brak danej katalogowej, brak
normatywnego mnożnika dla danego rodzaju aparatu) daje TRZECI STAN
(NIEROZSTRZYGALNE), NIGDY ciche odrzucenie ani ciche zaliczenie.

RANKING DETERMINISTYCZNY: kandydaci kwalifikujący się (WSZYSTKIE kryteria
SPEŁNIA) posortowani wg najmniejszego In, tie-break po id. Rekomendacja to
pierwszy z tej listy (najmniejszy spełniający In) albo `None`.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from application.analyses.fault_loop.route import (
    RouteExtractionError,
    path_to_bus,
    route_segments_min_scenario,
)

# Import ŚWIADOMY prywatnych helperów `fault_loop.service` — DOKŁADNIE ten
# sam wzorzec i to samo uzasadnienie, co w `application.analyses.swz.service`
# (patrz docstring modułu powyżej i tamtego modułu): Ik1_min/U0 dla obwodu
# NIE zależą od ocenianego aparatu, więc liczą się RAZ, tą samą fizyką co
# SWZ (zero drugiej ścieżki obliczeniowej pętli zwarcia).
from application.analyses.fault_loop.service import (
    _DEFAULT_SYSTEM,
    _NON_TN_SYSTEMS,
    _SYSTEM_MAP,
    _find_station,
    _station_transformer,
    _system_for_station,
    _transformer_loop_impedance,
    _upstream_thevenin_lv_component,
)
from application.analyses.swz.werdykt import (
    AparatZabezpieczajacy,
    SwzStatus,
    ocen_swz,
)
from enm.models import EnergyNetworkModel
from network_model.catalog.lv_mcb_bands_iec60898 import PROG_CIEPLNY_WYZWALA_X_IN
from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog
from network_model.catalog.types import LVApparatusType
from network_model.solvers.fault_loop_builder import (
    FaultLoopBuildRequest,
    build_fault_loop_input,
    sum_phase_and_return_route,
)
from network_model.solvers.fault_loop_iec60364 import compute_fault_loop
from network_model.solvers.protection_lv_curves import (
    FUSE_GG_IF_MULTIPLIER,
    MCCB_I2_MULTIPLIER,
    GwarancjaNormy,
    compute_fuse_gg_gate,
    compute_mcb_thermal_point,
    compute_mccb_point,
)

# =============================================================================
# STAN KRYTERIUM (trzeci stan obowiązkowy)
# =============================================================================


class KryteriumStatus(StrEnum):
    SPELNIA = "spełnia"
    NIE_SPELNIA = "nie spełnia"
    NIEROZSTRZYGALNE = "nierozstrzygalne"


# Rodzaje kandydatów — mapowanie na namespace'y katalogu nN (P0.2).
KIND_MCB = "MCB"
KIND_FUSE_SWITCH = "FUSE_SWITCH"
KIND_MCCB = "MCCB"
_KINDY_DOZWOLONE = (KIND_MCB, KIND_FUSE_SWITCH, KIND_MCCB)


@dataclass(frozen=True)
class KandydatAparatuNn:
    """Jeden kandydat do doboru — aparat (albo kombinacja aparat+wkładka) z katalogu.

    Attributes:
        id: Stabilny identyfikator kandydata (dla MCB/MCCB = id typu
            katalogowego; dla FUSE_SWITCH = "{apparatus_id}+{fuse_id}").
        nazwa: Nazwa czytelna dla człowieka.
        kind: ``KIND_MCB`` | ``KIND_FUSE_SWITCH`` | ``KIND_MCCB``.
        in_a: Prąd znamionowy DECYDUJĄCY o funkcji ochronnej [A] — dla MCB i
            MCCB to prąd znamionowy aparatu; dla FUSE_SWITCH to prąd
            znamionowy WKŁADKI (to ona ogranicza prąd, nie korpus
            rozłącznika).
        zdolnosc_wylaczania_ka: Pole zdolności wyłączania WŁAŚCIWE dla
            ``kind`` (MCB→icn_ka; FUSE_SWITCH→conditional_sc_current_ka
            KOMBINACJI; MCCB→i_cu_ka) — ``None`` gdy katalog nie niesie tej
            wartości (kryterium iii da wtedy NIEROZSTRZYGALNE, nie 0).
        klasa_mcb: Klasa wyzwolenia B/C/D — WYŁĄCZNIE dla ``kind=KIND_MCB``.
        fuse_breaking_capacity_ka: WYŁĄCZNIE dla ``kind=KIND_FUSE_SWITCH`` —
            własna zdolność wyłączania SAMEJ wkładki (``LVFuseLinkType.
            breaking_capacity_ka``, IEC 60269-1/-2), NIEZALEŻNA od
            ``zdolnosc_wylaczania_ka`` (która niesie wartość KOMBINACJI z
            rozłącznikiem). Pole informacyjne w dowodzie doboru — kombinacja
            fizycznie NIE MOŻE przekroczyć zdolności samej wkładki (walidacja
            w `zbierz_kandydatow_z_katalogu`).
        manufacturer: Producent (opcjonalnie, do prezentacji).
        ir_a, isd_a, ii_a, tr_s, tsd_s: Karta D1 (nN, „runda 8") — WYŁĄCZNIE
            dla ``kind=KIND_MCCB``. Nastawy wyzwalacza elektronicznego
            RESOLWOWANE (nie zakres nastawialności) do absolutnych jednostek
            [A]/[s], konsumowane 1:1 przez `protection_lv_curves.
            compute_mccb_point` (ten sam kontrakt parametrów). Resolucja z
            `LVApparatusType.ir_range/isd_range/ii_range/tr_range/tsd_range`
            do GÓRNEGO krańca zakresu regulacji — ZAŁOŻENIE NAZWANE WPROST
            (nie fabrykacja): kandydat z nastawialnym wyzwalaczem musi
            spełniać kryteria doboru NAWET przy najbardziej wymagającej
            dozwolonej nastawie fabrycznej (`zbierz_kandydatow_z_katalogu`).
            ``None`` gdy katalog nie niesie odpowiedniego zakresu — kryterium
            (ii)/(iv) dają wtedy NIEROZSTRZYGALNE, nigdy fabrykowaną wartość.
    """

    id: str
    nazwa: str
    kind: str
    in_a: float
    zdolnosc_wylaczania_ka: float | None
    klasa_mcb: str | None = None
    fuse_breaking_capacity_ka: float | None = None
    manufacturer: str | None = None
    ir_a: float | None = None
    isd_a: float | None = None
    ii_a: float | None = None
    tr_s: float | None = None
    tsd_s: float | None = None

    def __post_init__(self) -> None:
        if self.kind not in _KINDY_DOZWOLONE:
            raise ValueError(
                f"Nieznany rodzaj kandydata '{self.kind}' — dozwolone: {_KINDY_DOZWOLONE}."
            )
        if self.in_a <= 0:
            raise ValueError(f"in_a musi być dodatnie, otrzymano {self.in_a}.")
        if self.kind == KIND_MCB and not self.klasa_mcb:
            raise ValueError("Kandydat MCB wymaga klasa_mcb (B/C/D).")
        if (
            self.kind == KIND_FUSE_SWITCH
            and self.zdolnosc_wylaczania_ka is not None
            and self.fuse_breaking_capacity_ka is not None
            and self.zdolnosc_wylaczania_ka > self.fuse_breaking_capacity_ka
        ):
            raise ValueError(
                f"Dane katalogowe niespójne: warunkowy prąd kombinacji "
                f"({self.zdolnosc_wylaczania_ka:g} kA) przekracza własną zdolność "
                f"wyłączania wkładki ({self.fuse_breaking_capacity_ka:g} kA) — kombinacja "
                "fizycznie nie może przewyższyć zdolności samej wkładki."
            )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "nazwa": self.nazwa,
            "kind": self.kind,
            "in_a": self.in_a,
            "zdolnosc_wylaczania_ka": self.zdolnosc_wylaczania_ka,
            "klasa_mcb": self.klasa_mcb,
            "fuse_breaking_capacity_ka": self.fuse_breaking_capacity_ka,
            "manufacturer": self.manufacturer,
            "ir_a": self.ir_a,
            "isd_a": self.isd_a,
            "ii_a": self.ii_a,
            "tr_s": self.tr_s,
            "tsd_s": self.tsd_s,
        }


# =============================================================================
# WYNIK JEDNEGO KRYTERIUM
# =============================================================================


@dataclass(frozen=True)
class KryteriumWynik:
    nazwa: str
    status: KryteriumStatus
    uzasadnienie_pl: str
    wartosci: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "nazwa": self.nazwa,
            "status": self.status.value,
            "uzasadnienie_pl": self.uzasadnienie_pl,
            "wartosci": self.wartosci,
        }


@dataclass(frozen=True)
class WynikKandydataNn:
    kandydat: KandydatAparatuNn
    kryteria: tuple[KryteriumWynik, ...]
    kwalifikuje_sie: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "kandydat": self.kandydat.to_dict(),
            "kryteria": [k.to_dict() for k in self.kryteria],
            "kwalifikuje_sie": self.kwalifikuje_sie,
        }


@dataclass(frozen=True)
class WynikDoboruAparatuNn:
    ib_a: float
    iz_prime_a: float
    ik_max_ka: float | None
    ik1_min_a: float
    u0_v: float
    kandydaci: tuple[WynikKandydataNn, ...]
    rekomendacja: KandydatAparatuNn | None
    deterministic_signature: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "ib_a": self.ib_a,
            "iz_prime_a": self.iz_prime_a,
            "ik_max_ka": self.ik_max_ka,
            "ik1_min_a": self.ik1_min_a,
            "u0_v": self.u0_v,
            "kandydaci": [k.to_dict() for k in self.kandydaci],
            "rekomendacja": self.rekomendacja.to_dict() if self.rekomendacja else None,
            "deterministic_signature": self.deterministic_signature,
        }


# =============================================================================
# KRYTERIA — FUNKCJE CZYSTE
# =============================================================================


def _kryterium_ib_in_iz(*, ib_a: float, iz_prime_a: float, in_a: float) -> KryteriumWynik:
    """(i) Ib <= In <= Iz′ — IEC 60364-4-43 §433.1."""
    spelnia = ib_a <= in_a <= iz_prime_a
    if spelnia:
        uzasadnienie = (
            f"Ib={ib_a:g} A <= In={in_a:g} A <= Iz′={iz_prime_a:g} A — spełnia (IEC 60364-4-43 "
            "§433.1)."
        )
    elif in_a < ib_a:
        uzasadnienie = f"In={in_a:g} A < Ib={ib_a:g} A — aparat NIE POKRYWA obciążenia obwodu."
    else:
        uzasadnienie = f"In={in_a:g} A > Iz′={iz_prime_a:g} A — aparat NIE CHRONI przewodu."
    return KryteriumWynik(
        nazwa="Ib<=In<=Iz′",
        status=KryteriumStatus.SPELNIA if spelnia else KryteriumStatus.NIE_SPELNIA,
        uzasadnienie_pl=uzasadnienie,
        wartosci={"ib_a": ib_a, "in_a": in_a, "iz_prime_a": iz_prime_a},
    )


def _kryterium_i2(*, kandydat: KandydatAparatuNn, iz_prime_a: float) -> KryteriumWynik:
    """(ii) I2 <= 1,45·Iz′ — IEC 60364-4-43 §433.1.1.

    I2 = próg gwarantowanego zadziałania w czasie umownym:
      MCB: 1,45×In (REUSE `PROG_CIEPLNY_WYZWALA_X_IN`, G-D4), zweryfikowany
        przez `compute_mcb_thermal_point`.
      FUSE_SWITCH: 1,6×In wkładki (`FUSE_GG_IF_MULTIPLIER`, G-D2),
        zweryfikowany przez `compute_fuse_gg_gate`.
      MCCB: 1,3×Ir (REUSE `MCCB_I2_MULTIPLIER`, IEC 60947-2, karta D1),
        WYŁĄCZNIE gdy `kandydat.ir_a`/`tr_s` są rozwiązane (katalog niesie
        `ir_range`/`tr_range`) — zweryfikowany przez `compute_mccb_point`
        (musi klasyfikować I2 W lub POWYŻEJ progu długozwłocznego — I2>Ir
        z definicji mnożnika >1). Brak nastawy → NIEROZSTRZYGALNE
        (WARUNKOWO — zależne od danych katalogowych, nie zaszyte na stałe).
    """
    limit = 1.45 * iz_prime_a
    if kandydat.kind == KIND_MCB:
        i2 = PROG_CIEPLNY_WYZWALA_X_IN * kandydat.in_a
        gate = compute_mcb_thermal_point(i_query_a=i2, in_a=kandydat.in_a)
        assert gate.gwarancja == GwarancjaNormy.WYZWOLENIE_GWARANTOWANE  # I2 z definicji progu
        spelnia = i2 <= limit
        uzasadnienie = (
            f"I2={i2:g} A (={PROG_CIEPLNY_WYZWALA_X_IN:g}×In MCB, IEC 60898-1) "
            f"{'<=' if spelnia else '>'} 1,45·Iz′={limit:g} A."
        )
        return KryteriumWynik(
            nazwa="I2<=1,45·Iz′",
            status=KryteriumStatus.SPELNIA if spelnia else KryteriumStatus.NIE_SPELNIA,
            uzasadnienie_pl=uzasadnienie,
            wartosci={"i2_a": i2, "limit_a": limit, "zrodlo": "IEC 60898-1 (1,45×In)"},
        )
    if kandydat.kind == KIND_FUSE_SWITCH:
        i2 = FUSE_GG_IF_MULTIPLIER * kandydat.in_a
        gate = compute_fuse_gg_gate(i_query_a=i2, in_a=kandydat.in_a)
        assert gate.gwarancja == GwarancjaNormy.WYZWOLENIE_GWARANTOWANE
        spelnia = i2 <= limit
        uzasadnienie = (
            f"I2={i2:g} A (=If={FUSE_GG_IF_MULTIPLIER:g}×In wkładki, IEC 60269-1) "
            f"{'<=' if spelnia else '>'} 1,45·Iz′={limit:g} A."
        )
        return KryteriumWynik(
            nazwa="I2<=1,45·Iz′",
            status=KryteriumStatus.SPELNIA if spelnia else KryteriumStatus.NIE_SPELNIA,
            uzasadnienie_pl=uzasadnienie,
            wartosci={"i2_a": i2, "limit_a": limit, "zrodlo": "IEC 60269-1 (If=1,6×In)"},
        )
    # KIND_MCCB — karta D1: I2 = MCCB_I2_MULTIPLIER×Ir (IEC 60947-2), gdy
    # nastawa długozwłoczna jest rozwiązana; w przeciwnym razie trzeci stan,
    # WARUNKOWO zależny od tego, czy TEN KONKRETNY rekord katalogu niesie
    # `ir_range`/`tr_range` (nie zaszyty na stałe niezależnie od danych).
    if kandydat.ir_a is None or kandydat.tr_s is None:
        return KryteriumWynik(
            nazwa="I2<=1,45·Iz′",
            status=KryteriumStatus.NIEROZSTRZYGALNE,
            uzasadnienie_pl=(
                "Wyłącznik z wyzwalaczem elektronicznym (MCCB) bez rozwiązanej nastawy "
                "długozwłocznej Ir/tr w katalogu — I2 nie do wyznaczenia bez fabrykacji "
                "(ten rekord katalogu nie niesie `ir_range`/`tr_range`)."
            ),
            wartosci={"limit_a": limit},
        )
    i2 = MCCB_I2_MULTIPLIER * kandydat.ir_a
    gate = compute_mccb_point(
        i_query_a=i2,
        ir_a=kandydat.ir_a,
        isd_a=kandydat.isd_a,
        ii_a=kandydat.ii_a,
        tr_s=kandydat.tr_s,
        tsd_s=kandydat.tsd_s,
    )
    # I2=1,3×Ir > Ir z definicji mnożnika (>1) — punkt NIGDY nie klasyfikuje
    # się jako "brak" (poniżej progu długozwłocznego); solver to potwierdza
    # (reuse, nie druga fizyka).
    assert gate.stopien != "brak"
    spelnia = i2 <= limit
    uzasadnienie = (
        f"I2={i2:g} A (={MCCB_I2_MULTIPLIER:g}×Ir={kandydat.ir_a:g} A, wyzwalacz "
        f"elektroniczny, IEC 60947-2 — stopień klasyfikacji '{gate.stopien}') "
        f"{'<=' if spelnia else '>'} 1,45·Iz′={limit:g} A."
    )
    return KryteriumWynik(
        nazwa="I2<=1,45·Iz′",
        status=KryteriumStatus.SPELNIA if spelnia else KryteriumStatus.NIE_SPELNIA,
        uzasadnienie_pl=uzasadnienie,
        wartosci={
            "i2_a": i2,
            "limit_a": limit,
            "zrodlo": "IEC 60947-2 (1,3×Ir, wyzwalacz elektroniczny)",
            "ir_a": kandydat.ir_a,
            "mccb_stopien": gate.stopien,
        },
    )


def _kryterium_zdolnosc_wylaczania(
    *, kandydat: KandydatAparatuNn, ik_max_ka: float | None
) -> KryteriumWynik:
    """(iii) Icu/Icn/Ic-warunkowy >= Ik″max w punkcie zabudowy."""
    if ik_max_ka is None:
        return KryteriumWynik(
            nazwa="Zdolność wyłączania >= Ik″max",
            status=KryteriumStatus.NIEROZSTRZYGALNE,
            uzasadnienie_pl="Brak Ik″max w punkcie zabudowy (bieg zwarciowy nie dostarczony).",
            wartosci={"zdolnosc_wylaczania_ka": kandydat.zdolnosc_wylaczania_ka},
        )
    if kandydat.zdolnosc_wylaczania_ka is None:
        pole = {
            KIND_MCB: "icn_ka",
            KIND_FUSE_SWITCH: "conditional_sc_current_ka",
            KIND_MCCB: "i_cu_ka",
        }[kandydat.kind]
        return KryteriumWynik(
            nazwa="Zdolność wyłączania >= Ik″max",
            status=KryteriumStatus.NIEROZSTRZYGALNE,
            uzasadnienie_pl=(
                f"Katalog nie niesie pola '{pole}' dla tego kandydata — zdolność wyłączania "
                "nieznana (zero fabrykacji)."
            ),
            wartosci={"ik_max_ka": ik_max_ka},
        )
    spelnia = kandydat.zdolnosc_wylaczania_ka >= ik_max_ka
    uzasadnienie = (
        f"Zdolność wyłączania={kandydat.zdolnosc_wylaczania_ka:g} kA "
        f"{'>=' if spelnia else '<'} Ik″max={ik_max_ka:g} kA."
    )
    return KryteriumWynik(
        nazwa="Zdolność wyłączania >= Ik″max",
        status=KryteriumStatus.SPELNIA if spelnia else KryteriumStatus.NIE_SPELNIA,
        uzasadnienie_pl=uzasadnienie,
        wartosci={
            "zdolnosc_wylaczania_ka": kandydat.zdolnosc_wylaczania_ka,
            "ik_max_ka": ik_max_ka,
        },
    )


_SWZ_STATUS_MAP: dict[SwzStatus, KryteriumStatus] = {
    SwzStatus.SPELNIA: KryteriumStatus.SPELNIA,
    SwzStatus.NIE_SPELNIA: KryteriumStatus.NIE_SPELNIA,
    SwzStatus.NIEROZSTRZYGALNE: KryteriumStatus.NIEROZSTRZYGALNE,
}


def _kryterium_swz(*, kandydat: KandydatAparatuNn, ik1_min_a: float, u0_v: float) -> KryteriumWynik:
    """(iv) SWZ przy Ik_min — REUSE `application.analyses.swz.werdykt.ocen_swz`.

    Karta D1: `typ="MCCB"` ma teraz galaz w `ocen_swz` (Ia z nastawy Ii
    magnetycznej/bezzwłocznej, `kandydat.ii_a` — patrz docstring
    `KandydatAparatuNn`) — WARUNKOWO NIEROZSTRZYGALNA, gdy `ii_a is None`.
    """
    typ = {
        KIND_MCB: "MCB",
        KIND_FUSE_SWITCH: "WKLADKA_GG",
    }.get(
        kandydat.kind, kandydat.kind
    )  # MCCB -> "MCCB"
    aparat = AparatZabezpieczajacy(
        typ=typ,
        in_a=kandydat.in_a,
        klasa_mcb=kandydat.klasa_mcb,
        ii_a=kandydat.ii_a if kandydat.kind == KIND_MCCB else None,
    )
    wynik = ocen_swz(ik1_min_a=ik1_min_a, u0_v=u0_v, aparat=aparat)
    return KryteriumWynik(
        nazwa="SWZ przy Ik_min",
        status=_SWZ_STATUS_MAP[wynik.status],
        uzasadnienie_pl=wynik.przyczyna_pl,
        wartosci=wynik.to_dict(),
    )


# =============================================================================
# OCENA JEDNEGO KANDYDATA + PEŁNY DOBÓR
# =============================================================================


def oceniaj_kandydata(
    *,
    kandydat: KandydatAparatuNn,
    ib_a: float,
    iz_prime_a: float,
    ik_max_ka: float | None,
    ik1_min_a: float,
    u0_v: float,
) -> WynikKandydataNn:
    """Oceń JEDNEGO kandydata przeciw wszystkim czterem kryteriom (§0.5)."""
    kryteria = (
        _kryterium_ib_in_iz(ib_a=ib_a, iz_prime_a=iz_prime_a, in_a=kandydat.in_a),
        _kryterium_i2(kandydat=kandydat, iz_prime_a=iz_prime_a),
        _kryterium_zdolnosc_wylaczania(kandydat=kandydat, ik_max_ka=ik_max_ka),
        _kryterium_swz(kandydat=kandydat, ik1_min_a=ik1_min_a, u0_v=u0_v),
    )
    kwalifikuje = all(k.status == KryteriumStatus.SPELNIA for k in kryteria)
    return WynikKandydataNn(kandydat=kandydat, kryteria=kryteria, kwalifikuje_sie=kwalifikuje)


def ocen_kandydatow_nn(
    *,
    ib_a: float,
    iz_prime_a: float,
    ik_max_ka: float | None,
    ik1_min_a: float,
    u0_v: float,
    kandydaci: tuple[KandydatAparatuNn, ...],
) -> WynikDoboruAparatuNn:
    """Oceń WSZYSTKICH kandydatów i zwróć deterministyczny ranking.

    Ranking: kandydaci kwalifikujący się (wszystkie kryteria SPEŁNIA) NA
    POCZĄTKU listy, posortowani wg najmniejszego In (tie-break: id);
    niekwalifikujący się ZA nimi, tym samym kluczem sortowania (pełna
    przejrzystość — żaden kandydat nie znika z odpowiedzi).

    Raises:
        ValueError: ``ib_a < 0``, ``iz_prime_a <= 0`` albo
            ``ik1_min_a < 0``.
    """
    if ib_a < 0:
        raise ValueError(f"ib_a nie może być ujemne, otrzymano {ib_a}.")
    if iz_prime_a <= 0:
        raise ValueError(f"iz_prime_a musi być dodatnie, otrzymano {iz_prime_a}.")
    if ik1_min_a < 0:
        raise ValueError(f"ik1_min_a nie może być ujemne, otrzymano {ik1_min_a}.")

    oceny = [
        oceniaj_kandydata(
            kandydat=k,
            ib_a=ib_a,
            iz_prime_a=iz_prime_a,
            ik_max_ka=ik_max_ka,
            ik1_min_a=ik1_min_a,
            u0_v=u0_v,
        )
        for k in kandydaci
    ]
    oceny_posortowane = tuple(
        sorted(oceny, key=lambda w: (not w.kwalifikuje_sie, w.kandydat.in_a, w.kandydat.id))
    )
    rekomendacja = next(
        (w.kandydat for w in oceny_posortowane if w.kwalifikuje_sie),
        None,
    )

    sig_data = {
        "ib_a": ib_a,
        "iz_prime_a": iz_prime_a,
        "ik_max_ka": ik_max_ka,
        "ik1_min_a": ik1_min_a,
        "u0_v": u0_v,
        "kandydaci": [w.to_dict() for w in oceny_posortowane],
        "rekomendacja": rekomendacja.to_dict() if rekomendacja else None,
    }
    sig_json = json.dumps(sig_data, sort_keys=True, separators=(",", ":"))
    signature = hashlib.sha256(sig_json.encode("utf-8")).hexdigest()

    return WynikDoboruAparatuNn(
        ib_a=ib_a,
        iz_prime_a=iz_prime_a,
        ik_max_ka=ik_max_ka,
        ik1_min_a=ik1_min_a,
        u0_v=u0_v,
        kandydaci=oceny_posortowane,
        rekomendacja=rekomendacja,
        deterministic_signature=signature,
    )


# =============================================================================
# KANDYDACI Z KATALOGU
# =============================================================================


def _resolwuj_nastawy_mccb(
    aparat: LVApparatusType,
) -> tuple[float | None, float | None, float | None, float | None, float | None]:
    """Resolwuj nastawy wyzwalacza elektronicznego MCCB do wartości absolutnych.

    Karta D1 (nN, „runda 8 — PEŁNY WERDYKT nN"). Katalog niesie
    ``LVApparatusType.ir_range``/``isd_range``/``ii_range``/``tr_range``/
    ``tsd_range`` jako ZAKRESY nastawialności (xIn/xIr/[s]) — DOBÓR wymaga
    KONKRETNEJ wartości (kontrakt `compute_mccb_point`). ZAŁOŻENIE NAZWANE
    WPROST (nie fabrykacja): każda nastawa resolwowana do GÓRNEGO krańca
    swojego zakresu regulacji — kandydat z nastawialnym wyzwalaczem musi
    spełniać kryteria doboru NAWET przy najbardziej wymagającej dozwolonej
    nastawie fabrycznej (Ir max → najwyższe I2; Ii max → najwyższe wymagane
    Ia dla SWZ). Brak KTÓREGOKOLWIEK zakresu w rekordzie katalogu → `None`
    dla zależnej wartości (i wszystkiego, co od niej zależy) — trzeci stan
    w kryteriach (ii)/(iv), nigdy cicha fabrykacja.

    Zwraca ``(ir_a, isd_a, ii_a, tr_s, tsd_s)``.
    """
    ir_a = aparat.ir_range[1] * aparat.i_n_a if aparat.ir_range is not None else None
    isd_a = (
        aparat.isd_range[1] * ir_a if aparat.isd_range is not None and ir_a is not None else None
    )
    ii_a = aparat.ii_range[1] * aparat.i_n_a if aparat.ii_range is not None else None
    tr_s = aparat.tr_range[1] if aparat.tr_range is not None else None
    tsd_s = aparat.tsd_range[1] if aparat.tsd_range is not None else None
    return ir_a, isd_a, ii_a, tr_s, tsd_s


def zbierz_kandydatow_z_katalogu(
    catalog: CatalogRepository | None = None,
) -> tuple[KandydatAparatuNn, ...]:
    """Zbuduj pełną listę kandydatów instalowalnych z katalogu nN.

    MCB: jeden kandydat na typ `LVBreakerMcbType` (icn_ka).
    FUSE_SWITCH: jeden kandydat na PARĘ (rozłącznik bezpiecznikowy, wkładka)
        — WYŁĄCZNIE gdy prąd wkładki <= prąd znamionowy korpusu rozłącznika
        (ograniczenie fizyczne, nie normatywne odgadywanie).
    MCCB: jeden kandydat na typ `LVApparatusType` z device_kind
        WYLACZNIK_GLOWNY/WYLACZNIK_ODPLYWOWY (i_cu_ka).

    Deterministyczne: kolejność wynikowa zależy WYŁĄCZNIE od kolejności
    repozytorium katalogu (już deterministyczna — `CatalogRepository._sorted`).
    """
    repo = catalog if catalog is not None else get_default_mv_catalog()
    kandydaci: list[KandydatAparatuNn] = []

    for mcb in repo.list_lv_breaker_mcb_types():
        kandydaci.append(
            KandydatAparatuNn(
                id=mcb.id,
                nazwa=mcb.name,
                kind=KIND_MCB,
                in_a=mcb.in_a,
                zdolnosc_wylaczania_ka=mcb.icn_ka,
                klasa_mcb=mcb.curve_class,
                manufacturer=mcb.manufacturer,
            )
        )

    apparaty = [
        a for a in repo.list_lv_apparatus_types() if a.device_kind == "ROZLACZNIK_BEZPIECZNIKOWY"
    ]
    wkladki = repo.list_lv_fuse_link_types()
    for apparat in apparaty:
        for wkladka in wkladki:
            if wkladka.in_a > apparat.i_n_a:
                continue
            kandydaci.append(
                KandydatAparatuNn(
                    id=f"{apparat.id}+{wkladka.id}",
                    nazwa=f"{apparat.name} + {wkladka.name}",
                    kind=KIND_FUSE_SWITCH,
                    in_a=wkladka.in_a,
                    zdolnosc_wylaczania_ka=apparat.conditional_sc_current_ka,
                    fuse_breaking_capacity_ka=wkladka.breaking_capacity_ka,
                    manufacturer=apparat.manufacturer,
                )
            )

    for aparat in repo.list_lv_apparatus_types():
        if aparat.device_kind not in ("WYLACZNIK_GLOWNY", "WYLACZNIK_ODPLYWOWY"):
            continue
        ir_a, isd_a, ii_a, tr_s, tsd_s = _resolwuj_nastawy_mccb(aparat)
        kandydaci.append(
            KandydatAparatuNn(
                id=aparat.id,
                nazwa=aparat.name,
                kind=KIND_MCCB,
                in_a=aparat.i_n_a,
                zdolnosc_wylaczania_ka=aparat.i_cu_ka,
                manufacturer=aparat.manufacturer,
                ir_a=ir_a,
                isd_a=isd_a,
                ii_a=ii_a,
                tr_s=tr_s,
                tsd_s=tsd_s,
            )
        )

    return tuple(kandydaci)


# =============================================================================
# ORKIESTRACJA PER OBWÓD
# =============================================================================


def _ik1_min_i_u0(
    enm: EnergyNetworkModel, station_ref: str, bus_ref: str
) -> tuple[float | None, float | None, list[str], str | None]:
    """Ik1_min [A] i U0 [V] dla obwodu (scenariusz MIN, ta sama fizyka co SWZ).

    Zwraca ``(ik1_min_a, u0_v, missing_data, reason_pl)`` — pierwsze dwa
    ``None`` przy braku danych, `missing_data`/`reason_pl` nazywają powód.
    """
    station = _find_station(enm, station_ref)
    if station is None:
        return None, None, ["station"], None

    system = _system_for_station(station)
    if system in _NON_TN_SYSTEMS:
        return (
            None,
            None,
            [],
            f"Układ {system}: SWZ metodą pętli TN (IEC 60364-4-41) nie dotyczy.",
        )

    trafo = _station_transformer(enm, station)
    if trafo is None:
        return None, None, ["transformer"], None

    z_tr, missing = _transformer_loop_impedance(trafo)
    if z_tr is None:
        return None, None, missing, None

    upstream, upstream_missing = _upstream_thevenin_lv_component(enm, trafo)
    if upstream is None:
        return None, None, upstream_missing, None

    try:
        path = path_to_bus(enm, trafo.lv_bus_ref, bus_ref)
        segments = route_segments_min_scenario(path)
    except RouteExtractionError as exc:
        return None, None, ["route"], str(exc)

    phase_component, return_component = sum_phase_and_return_route(segments)
    net_type, protection = _SYSTEM_MAP.get(system, _SYSTEM_MAP[_DEFAULT_SYSTEM])
    u_phase_v = trafo.ulv_kv * 1000.0 / math.sqrt(3.0)

    request = FaultLoopBuildRequest(
        fault_node_id=bus_ref,
        u_nom_v=u_phase_v,
        network_type=net_type,
        protection_arrangement=protection,
        phase_conductor_r_ohm=phase_component.r_ohm,
        phase_conductor_x_ohm=phase_component.x_ohm,
        return_conductor_r_ohm=return_component.r_ohm,
        return_conductor_x_ohm=return_component.x_ohm,
        transformer_r_ohm=z_tr.r_ohm,
        transformer_x_ohm=z_tr.x_ohm,
        transformer_label=f"Transformator SN/nN {trafo.name}",
        upstream_r_ohm=upstream.r_ohm,
        upstream_x_ohm=upstream.x_ohm,
        upstream_label=upstream.label,
        phase_label=phase_component.label,
        return_label=return_component.label,
    )
    loop_result = compute_fault_loop(build_fault_loop_input(request))
    return loop_result.ik_min_a, u_phase_v, [], None


def wybierz_aparat_dla_obwodu_nn(
    *,
    enm: EnergyNetworkModel,
    station_ref: str,
    bus_ref: str,
    ib_a: float,
    iz_prime_a: float,
    ik_max_ka: float | None,
    catalog: CatalogRepository | None = None,
) -> dict[str, Any]:
    """Dobór aparatu nN dla obwodu — orkiestracja per obwód (API layer).

    Ib, Iz′ i Ik″max są PARAMETRAMI WEJŚCIOWYMI (nie liczone tutaj):
      - Ib to prąd OBLICZENIOWY obwodu z definicji IEC 60364-4-43 §433.1 —
        wielkość PROJEKTOWA, nie wyprowadzona z jednego biegu rozpływu
        (wzorzec: `czasy_wylaczenia_pol_stacji(ik_ka=...)` w tym samym
        module — Ik przyjmowane jako parametr, nie resolwowane wewnątrz).
      - Iz′ pochodzi z `network_model.solvers.cable_ampacity_derating`
        (osobny, już istniejący krok — ten moduł go NIE powtarza).
      - Ik″max pochodzi z biegu zwarciowego IEC 60909 w punkcie zabudowy
        (osobny bieg, jak przy `czasy_wylaczenia_pol_stacji`).

    Ik1_min/U0 SĄ resolwowane tutaj (ta sama fizyka co SWZ, patrz
    `_ik1_min_i_u0`) — to JEDYNA wielkość niezależna od wyboru kandydata.
    """
    ik1_min_a, u0_v, missing, reason_pl = _ik1_min_i_u0(enm, station_ref, bus_ref)
    if ik1_min_a is None or u0_v is None:
        return {
            "status": "brak danych",
            "station_ref": station_ref,
            "bus_ref": bus_ref,
            "missing_data": missing,
            "reason_pl": reason_pl,
        }

    kandydaci = zbierz_kandydatow_z_katalogu(catalog)
    wynik = ocen_kandydatow_nn(
        ib_a=ib_a,
        iz_prime_a=iz_prime_a,
        ik_max_ka=ik_max_ka,
        ik1_min_a=ik1_min_a,
        u0_v=u0_v,
        kandydaci=kandydaci,
    )
    return {
        "status": "OK",
        "station_ref": station_ref,
        "bus_ref": bus_ref,
        "dobor": wynik.to_dict(),
        "missing_data": [],
    }
