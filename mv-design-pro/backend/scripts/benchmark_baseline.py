#!/usr/bin/env python3
"""BASELINE budzetow wydajnosci B1-B10 (karta PERF-0, M0-7 / CV-0).

Mierzy — NIE ocenia — pozycje macierzy budzetow z
`docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md` sekcja 1a, na sieciach rejestru
`tests/golden/registry.py` (funkcja `zbuduj_wszystkie(id)`). Kazda pozycja
dostaje albo pomiar (mediana + p95 z >=5 powtorzen, ten sam proces, ta sama
maszyna) albo wpis NIEMIERZALNE z jawnym powodem — zadna pozycja nie znika
po cichu (pozycja bez pomiaru = pozycja nieodebrana, plan sekcja 1a).

ZERO FIZYKI: ten skrypt nie liczy nic sam. Wylacznie woła ISTNIEJACE funkcje
solverow/serwisow (przez ich publiczne albo pol-prywatne wejscia, patrz
komentarze przy kazdym pomiarze) i mierzy czas ich wykonania
(`time.perf_counter`). Zaden wynik fizyczny nie jest tu wyliczany ani
zmieniany.

IZOLACJA SRODOWISKA (PRZED importem pakietow `src` — patrz blok ponizej).
Ten sam wzorzec co `tests/conftest.py::_izolowana_baza_przebiegow`: skrypt
zaklada WLASNY katalog magazynu ENM i WLASNA baze SQLite w katalogu
tymczasowym. Nigdy nie dotyka `.enm_store/` ani `mv_design_pro.db`
repozytorium.

Uzycie (z katalogu `backend`):
    poetry run python scripts/benchmark_baseline.py --powtorzenia 5 --sieci S,M

Wyjscie (domyslnie):
    ../docs/evidence/performance_baseline.json  — surowe pomiary (dowod)
    ../docs/evidence/PERFORMANCE_BASELINE.md    — tabela czytelna dla czlowieka

Siec G00 (substrat 52 stacji / 315 szyn) jest budowana wolno (~15-20 s) i jej
zwarcia na WSZYSTKICH wezlach (B4) sa liczone bardzo dlugo (algebra gesta,
inwersja per wezel — patrz plan sekcja 0 "SC wszystkie wezly: O(N*n^3)") —
dlatego G00 jest ZAWSZE ograniczona do 1 powtorzenia (bez rozgrzewki),
niezaleznie od `--powtorzenia`.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import statistics
import sys
import tempfile
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

# ---------------------------------------------------------------------------
# Izolacja srodowiska — MUSI biec PRZED importem jakiegokolwiek modulu `src`,
# ktory czyta te zmienne przy imporcie/pierwszym wywolaniu (magazyn ENM,
# silnik bazy biegow kanonicznych). Patrz docstring modulu.
# ---------------------------------------------------------------------------
_TMP_ROOT = Path(tempfile.mkdtemp(prefix="perf-baseline-"))
os.environ.setdefault("ENM_STORE_DIR", str(_TMP_ROOT / "enm_store"))
os.environ.setdefault("STATION_USER_TEMPLATES_DIR", str(_TMP_ROOT / "szablony"))
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{_TMP_ROOT / 'perf_baseline_runs.db'}"

BACKEND_DIR = Path(__file__).resolve().parents[1]
SRC_DIR = BACKEND_DIR / "src"
for _p in (str(BACKEND_DIR), str(SRC_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from application.analyses.kontyngencje_n1 import build_kontyngencje_n1_view  # noqa: E402
from application.analyses.lv_domain.projection_v1 import (  # noqa: E402
    build_lv_domain_projection_v1,
)
from application.proof_engine.pakiet_biegu import zbuduj_pakiet_biegu  # noqa: E402
from application.proof_engine.proof_inspector.exporters import (  # noqa: E402
    is_pdf_export_available,
)
from enm.canonical_analysis import (  # noqa: E402
    CanonicalRun,
    _execute_power_flow,
    _execute_short_circuit,
    create_run,
)
from enm.mapping import map_enm_to_network_graph  # noqa: E402
from enm.models import EnergyNetworkModel  # noqa: E402
from enm.severity import is_blocking_severity  # noqa: E402
from enm.store import set_enm  # noqa: E402
from enm.validator import ENMValidator  # noqa: E402
from network_model.core.ybus import AdmittanceMatrixBuilder  # noqa: E402

from tests.application.analyses.lv_domain.scenariusze_nn import SCENARIUSZE  # noqa: E402
from tests.golden.registry import zbuduj_wszystkie  # noqa: E402

DOCS_EVIDENCE_DIR = BACKEND_DIR.parent / "docs" / "evidence"
JSON_WYJSCIE_DOMYSLNE = DOCS_EVIDENCE_DIR / "performance_baseline.json"
MD_WYJSCIE_DOMYSLNE = DOCS_EVIDENCE_DIR / "PERFORMANCE_BASELINE.md"

ZRODLO_BUDZETOW = "docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md sekcja 1a"

REJESTRY_S: tuple[str, ...] = ("G02", "G03", "G08")
REJESTRY_M: tuple[str, ...] = ("G13", "G00")
#: Siec G00 jest wolna (budowa + B4) — zawsze 1 powtorzenie, bez rozgrzewki.
REJESTR_WOLNY = "G00"

_NAZWY_REJESTROW: dict[str, str] = {
    "G02": "SN promieniowa / z odgalezieniem (GN_01, GN_02)",
    "G03": "SN pierscien + NOP, N-1 (GN_03)",
    "G08": "SN+nN z zabezpieczeniami (GN_05)",
    "G13": "feeder 110/SN CGMES (golden_enm)",
    "G00": "substrat SLD 52 stacji (build_sld_substrate_52s)",
}
_WIELKOSC_REJESTRU: dict[str, str] = {
    "G02": "S",
    "G03": "S",
    "G08": "S",
    "G13": "M",
    "G00": "M",
}


# ---------------------------------------------------------------------------
# Budzety sekcja 1a — PRZEPISANE DOKLADNIE z dokumentu (nie przeliczane).
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Budzet:
    nazwa: str
    co_mierzy: str
    s_ms: float | None
    s_opis: str
    m_ms: float | None
    m_opis: str
    l_ms: float | None
    l_opis: str
    bramka_ci: str

    def prog(self, wielkosc: str) -> tuple[float | None, str]:
        return {
            "S": (self.s_ms, self.s_opis),
            "M": (self.m_ms, self.m_opis),
            "L": (self.l_ms, self.l_opis),
        }.get(wielkosc, (None, "-"))


BUDZETY: dict[str, Budzet] = {
    "B1": Budzet(
        "topology",
        "TopologyService: CN -> TN, wyspy, spojnosc po zmianie lacznika",
        5,
        "< 5 ms",
        30,
        "< 30 ms",
        200,
        "< 200 ms",
        "regresja > 20% = czerwony",
    ),
    "B2": Budzet(
        "snapshot assembly",
        "CanonicalNetworkSnapshot: rozwiazanie stanu efektywnego + materializacja + hash",
        20,
        "< 20 ms",
        80,
        "< 80 ms",
        500,
        "< 500 ms",
        "regresja > 20%",
    ),
    "B3": Budzet(
        "LF",
        "rozplyw mocy NR na skladowej zgodnej (bez montazu migawki)",
        50,
        "< 50 ms",
        200,
        "< 200 ms",
        2000,
        "< 2 s",
        "regresja > 20%",
    ),
    "B4": Budzet(
        "SC",
        "zwarcia 3F/1F/2F/2FZ we wszystkich wezlach (faktoryzacja + kolumny)",
        100,
        "< 100 ms",
        1000,
        "< 1 s",
        10000,
        "< 10 s",
        "regresja > 20%",
    ),
    "B5": Budzet(
        "ABCN nN",
        "rozplyw 4-przewodowy nN per stacja (solver fazowy)",
        20,
        "< 20 ms",
        20,
        "< 20 ms/stacja",
        3000,
        "< 3 s (150 stacji)",
        "regresja > 20%",
    ),
    "B6": Budzet(
        "scenario batch",
        "wsad scenariuszy (N-1, QSTS, warianty) - przepustowosc i p95",
        1000,
        "< 1 s (N-1 pelne)",
        10000,
        "< 10 s (N-1 pelne)",
        120000,
        "< 120 s (N-1 pelne)",
        "przepustowosc >= min(K, rdzenie) x szeregowa",
    ),
    "B7": Budzet(
        "projection SN",
        "scena semantyczna SN z backendu (bez rysowania)",
        20,
        "< 20 ms",
        100,
        "< 100 ms",
        500,
        "< 500 ms",
        "regresja > 20%",
    ),
    "B8": Budzet(
        "projection nN",
        "scena semantyczna nN (portal, obwody odbiorcze) per stacja",
        15,
        "< 15 ms",
        15,
        "< 15 ms/stacja",
        2000,
        "< 2 s (150 stacji)",
        "regresja > 20%",
    ),
    "B9": Budzet(
        "dense renderer",
        "pierwsze wyrenderowanie i interakcja kanwy przy gestej scenie",
        None,
        "60 fps",
        None,
        "< 1 s / 60 fps",
        None,
        "< 3 s / >= 30 fps",
        "budzet klatki w tescie kanwy",
    ),
    "B10": Budzet(
        "document generation",
        "pakiet dokumentow (PDF/A + XLSX + wektor), bez przeliczen",
        5000,
        "< 5 s",
        20000,
        "< 20 s",
        120000,
        "< 2 min",
        "regresja > 20%",
    ),
}

KOLEJNOSC_POZYCJI: tuple[str, ...] = tuple(f"B{i}" for i in range(1, 11))


# ---------------------------------------------------------------------------
# Struktury pomiaru
# ---------------------------------------------------------------------------


@dataclass
class Pomiar:
    pozycja: str
    nazwa_pozycji: str
    siec: str
    wielkosc: str  # "S" | "M" | "L" | "-"
    szyny: int | None
    galezie: int | None
    n: int
    mediana_ms: float | None
    p95_ms: float | None
    budzet_ms: float | None
    budzet_opis: str
    status: str  # "WEWNATRZ" | "PRZEKROCZONY" | "NIEMIERZALNE"
    powod_niemierzalne: str | None
    uwagi: str
    surowe_ms: list[float] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "pozycja": self.pozycja,
            "nazwa_pozycji": self.nazwa_pozycji,
            "siec": self.siec,
            "wielkosc": self.wielkosc,
            "szyny": self.szyny,
            "galezie": self.galezie,
            "n": self.n,
            "mediana_ms": round(self.mediana_ms, 4) if self.mediana_ms is not None else None,
            "p95_ms": round(self.p95_ms, 4) if self.p95_ms is not None else None,
            "budzet_ms": self.budzet_ms,
            "budzet_opis": self.budzet_opis,
            "status": self.status,
            "powod_niemierzalne": self.powod_niemierzalne,
            "uwagi": self.uwagi,
            "surowe_ms": [round(c, 4) for c in self.surowe_ms],
        }


@dataclass
class Siec:
    klucz: str  # np. "G02[0]"
    rejestr_id: str
    indeks: int
    nazwa: str
    wielkosc: str  # "S" | "M"
    enm: EnergyNetworkModel
    snapshot: dict[str, Any]
    szyny: int
    galezie: int
    transformatory: int
    czas_budowy_ms: float
    walidacja_status: str
    n_issues: int
    n_blockers: int
    blokery_pl: list[str]


def _to_enm(obj: Any) -> EnergyNetworkModel:
    if isinstance(obj, EnergyNetworkModel):
        return obj
    return EnergyNetworkModel.model_validate(obj)


def zaladuj_siec(rejestr_id: str) -> list[Siec]:
    """Zbuduj wszystkie sieci wpisu rejestru (`zbuduj_wszystkie`) i zwaliduj kazda."""
    t0 = time.perf_counter()
    sieci_surowe = zbuduj_wszystkie(rejestr_id)
    t1 = time.perf_counter()
    czas_budowy_calosc_ms = (t1 - t0) * 1000.0

    wynik: list[Siec] = []
    for idx, surowa in enumerate(sieci_surowe):
        enm = _to_enm(surowa)
        walidacja = ENMValidator().validate(enm)
        blokery = [i for i in walidacja.issues if is_blocking_severity(i.severity)]
        wynik.append(
            Siec(
                klucz=f"{rejestr_id}[{idx}]",
                rejestr_id=rejestr_id,
                indeks=idx,
                nazwa=_NAZWY_REJESTROW.get(rejestr_id, rejestr_id),
                wielkosc=_WIELKOSC_REJESTRU.get(rejestr_id, "?"),
                enm=enm,
                snapshot=enm.model_dump(mode="json"),
                szyny=len(enm.buses),
                galezie=len(enm.branches),
                transformatory=len(enm.transformers),
                # Wpis rejestru moze zwrocic KILKA sieci z JEDNEGO wywolania
                # `zbuduj_wszystkie` (np. G02 -> GN_01 + GN_02, dwa osobne
                # budowniczowie) — rejestr nie oddaje czasu per-siec, wiec
                # dzielimy laczny czas budowy rowno (przyblizenie, jawnie
                # nazwane w uwagach dokumentu, NIE jedna z pozycji B1-B10).
                czas_budowy_ms=czas_budowy_calosc_ms / max(1, len(sieci_surowe)),
                walidacja_status=str(walidacja.status),
                n_issues=len(walidacja.issues),
                n_blockers=len(blokery),
                blokery_pl=[f"{i.code}: {i.message_pl}" for i in blokery],
            )
        )
    return wynik


# ---------------------------------------------------------------------------
# Pomocnicze: pomiar czasu, mediana/p95, klasyfikacja wzgledem budzetu
# ---------------------------------------------------------------------------


def _zmierz(fn: Callable[[], Any], powtorzenia: int, *, rozgrzewka: bool = True) -> list[float]:
    """`powtorzenia` wywolan `fn` w TYM SAMYM procesie, czasy w ms.

    Jedno dodatkowe wywolanie rozgrzewkowe (nieliczone) domyslnie wlaczone —
    eliminuje jednorazowy koszt leniwego importu/inicjalizacji z pierwszego
    pomiaru (zmierzone empirycznie: pierwsze `create_run` ~130 ms na tej
    maszynie, kolejne ~12-18 ms — bez rozgrzewki mediana bylaby zawyzona
    przez efekt jednorazowy, ktorego produkcyjny serwer (dlugo dzialajacy
    proces) nigdy nie placi przy KAZDYM zadaniu).
    """
    if rozgrzewka:
        fn()
    czasy: list[float] = []
    for _ in range(powtorzenia):
        t0 = time.perf_counter()
        fn()
        t1 = time.perf_counter()
        czasy.append((t1 - t0) * 1000.0)
    return czasy


def _mediana_p95(czasy: list[float]) -> tuple[float, float]:
    posortowane = sorted(czasy)
    n = len(posortowane)
    mediana = statistics.median(posortowane)
    idx = min(n - 1, max(0, math.ceil(0.95 * n) - 1))
    return mediana, posortowane[idx]


def _status_z_pomiaru(
    pozycja: str, wielkosc: str, mediana_ms: float
) -> tuple[str, float | None, str]:
    prog, opis = BUDZETY[pozycja].prog(wielkosc)
    if prog is None:
        return "NIEMIERZALNE", None, opis
    status = "WEWNATRZ" if mediana_ms <= prog else "PRZEKROCZONY"
    return status, float(prog), opis


def _pomiar_niemierzalne(
    pozycja: str,
    siec: str,
    wielkosc: str,
    powod: str,
    *,
    szyny: int | None = None,
    galezie: int | None = None,
) -> Pomiar:
    _prog, opis = BUDZETY[pozycja].prog(wielkosc) if wielkosc in ("S", "M", "L") else (None, "-")
    return Pomiar(
        pozycja=pozycja,
        nazwa_pozycji=BUDZETY[pozycja].nazwa,
        siec=siec,
        wielkosc=wielkosc,
        szyny=szyny,
        galezie=galezie,
        n=0,
        mediana_ms=None,
        p95_ms=None,
        budzet_ms=None,
        budzet_opis=opis,
        status="NIEMIERZALNE",
        powod_niemierzalne=powod,
        uwagi="",
        surowe_ms=[],
    )


def _canonical_run_bazowy(
    siec: Siec, analysis_type: str, options: dict[str, Any] | None = None
) -> CanonicalRun:
    """`CanonicalRun` w PAMIECI (bez DB) — status wstepnie ustawiony na FINISHED,
    ten sam wzorzec co warianty N-1 w `kontyngencje_n1.py::_bieg_wariantu`
    (rozpływ/zwarcie liczy sie WYWOLUJAC solver, a nie z automatu
    `create_run`/`execute_run` — patrz uwagi B2/B3/B4 nizej)."""
    return CanonicalRun(
        id=uuid4(),
        case_id=f"perf-{siec.klucz}",
        project_id=None,
        analysis_type=analysis_type,
        status="FINISHED",
        created_at=datetime.now(UTC),
        snapshot_hash="perf-baseline",
        input_hash="perf-baseline",
        snapshot=siec.snapshot,
        validation={},
        readiness={},
        options=options or {},
    )


# ---------------------------------------------------------------------------
# B1 — topology: map_enm_to_network_graph + scalanie wezlow (union-find)
# ---------------------------------------------------------------------------


def mierz_b1(siec: Siec, powtorzenia: int, *, rozgrzewka: bool) -> Pomiar:
    def raz() -> tuple[float, float]:
        t0 = time.perf_counter()
        graph = map_enm_to_network_graph(siec.enm)
        t1 = time.perf_counter()
        # `_build_merged_node_map` to metoda WEWNETRZNA `AdmittanceMatrixBuilder`
        # (prefiks `_`) — wywolana tu CELOWO wprost, zeby zmierzyc SAMO scalanie
        # unii-find zamknietych lacznikow BEZ budowy pelnej macierzy Y-bus
        # (`build()` woła ja jako pierwszy krok i idzie dalej). Karta PERF-0
        # wprost dopuszcza to rozbicie ("zmierz osobno mapowanie i scalanie,
        # jesli da sie wywolac scalanie bez pelnego Ybus").
        builder = AdmittanceMatrixBuilder(graph)
        _reprezentanci, _mapa = builder._build_merged_node_map()  # noqa: SLF001
        t2 = time.perf_counter()
        return (t1 - t0) * 1000.0, (t2 - t1) * 1000.0

    if rozgrzewka:
        raz()
    czasy_mapowania: list[float] = []
    czasy_scalania: list[float] = []
    for _ in range(powtorzenia):
        m, s = raz()
        czasy_mapowania.append(m)
        czasy_scalania.append(s)
    razem = [m + s for m, s in zip(czasy_mapowania, czasy_scalania, strict=True)]

    mediana, p95 = _mediana_p95(razem)
    status, prog, opis = _status_z_pomiaru("B1", siec.wielkosc, mediana)
    med_map, _ = _mediana_p95(czasy_mapowania)
    med_scal, _ = _mediana_p95(czasy_scalania)
    return Pomiar(
        pozycja="B1",
        nazwa_pozycji=BUDZETY["B1"].nazwa,
        siec=siec.klucz,
        wielkosc=siec.wielkosc,
        szyny=siec.szyny,
        galezie=siec.galezie,
        n=powtorzenia,
        mediana_ms=mediana,
        p95_ms=p95,
        budzet_ms=prog,
        budzet_opis=opis,
        status=status,
        powod_niemierzalne=None,
        uwagi=(
            f"razem = mapowanie ENM->graf + scalanie wezlow. Rozbicie median: "
            f"mapowanie={med_map:.4f} ms, scalanie (union-find zamknietych "
            f"lacznikow, BEZ budowy macierzy Y-bus)={med_scal:.4f} ms."
        ),
        surowe_ms=razem,
    )


# ---------------------------------------------------------------------------
# B2 — snapshot assembly: enm.canonical_analysis.create_run (wymaga DB)
# ---------------------------------------------------------------------------


#: `create_run` odmawia zlozenia migawki analizy PF, gdy walidator zglasza
#: `analysis_available.load_flow=False` (np. siec bez ZADNEGO odbioru/generatora
#: — zmierzone naprawde na G03: GN_03 nie ma odbiorow nawet PO uzupelnieniu
#: domyslnych katalogowych). To NIE jest awaria mechanizmu assemblacji (ktory
#: jest TEN SAM niezaleznie od `analysis_type` — walidacja+readiness+hash+DB),
#: tylko biznesowa brama specyficzna dla PF. Zwarcie 3F jest dostepne dla
#: kazdej sieci rejestru z co najmniej jednym zrodlem, wiec jest uczciwym
#: zamiennikiem DO POMIARU TEGO SAMEGO mechanizmu assemblacji.
_B2_KANDYDACI: tuple[tuple[str, dict[str, Any]], ...] = (
    ("PF", {}),
    ("short_circuit_sn", {"fault_type": "3F"}),
)


def mierz_b2(siec: Siec, powtorzenia: int, *, rozgrzewka: bool) -> Pomiar:
    case_id = f"perf-b2-{siec.klucz}"
    set_enm(case_id, siec.enm)

    wybrany_typ: str | None = None
    wybrane_opcje: dict[str, Any] = {}
    bledy_kandydatow: list[str] = []
    for typ, opcje in _B2_KANDYDACI:
        try:
            create_run(case_id=case_id, analysis_type=typ, options=dict(opcje))
        except Exception as exc:  # noqa: BLE001 — probujemy kolejnego kandydata
            bledy_kandydatow.append(f"{typ}: {type(exc).__name__}: {exc}")
            continue
        wybrany_typ, wybrane_opcje = typ, opcje
        break

    if wybrany_typ is None:
        return _pomiar_niemierzalne(
            "B2",
            siec.klucz,
            siec.wielkosc,
            "create_run odmowil zlozenia migawki dla WSZYSTKICH probowanych rodzajow "
            f"analizy ({', '.join(t for t, _ in _B2_KANDYDACI)}): " + " | ".join(bledy_kandydatow),
            szyny=siec.szyny,
            galezie=siec.galezie,
        )

    def raz() -> None:
        create_run(case_id=case_id, analysis_type=wybrany_typ, options=dict(wybrane_opcje))

    try:
        # Proba kandydata powyzej juz wykonala JEDNO udane wywolanie — liczy sie
        # jako rozgrzewka (nieliczona); `_zmierz` wiec bez wlasnej rozgrzewki,
        # zeby nie dublowac tego samego jednorazowego kosztu.
        czasy = _zmierz(raz, powtorzenia, rozgrzewka=False)
    except Exception as exc:  # noqa: BLE001
        return _pomiar_niemierzalne(
            "B2",
            siec.klucz,
            siec.wielkosc,
            f"{type(exc).__name__}: {exc}",
            szyny=siec.szyny,
            galezie=siec.galezie,
        )

    mediana, p95 = _mediana_p95(czasy)
    status, prog, opis = _status_z_pomiaru("B2", siec.wielkosc, mediana)
    zamiennik = (
        ""
        if wybrany_typ == "PF"
        else (
            f" UWAGA: analysis_type='PF' odmowiony ({bledy_kandydatow[0]}), zmierzono zamiast "
            f"tego z analysis_type='{wybrany_typ}' — TEN SAM mechanizm assemblacji migawki, "
            "inna biznesowa brama dostepnosci."
        )
    )
    return Pomiar(
        pozycja="B2",
        nazwa_pozycji=BUDZETY["B2"].nazwa,
        siec=siec.klucz,
        wielkosc=siec.wielkosc,
        szyny=siec.szyny,
        galezie=siec.galezie,
        n=powtorzenia,
        mediana_ms=mediana,
        p95_ms=p95,
        budzet_ms=prog,
        budzet_opis=opis,
        status=status,
        powod_niemierzalne=None,
        uwagi=(
            f"enm.canonical_analysis.create_run(case_id, analysis_type='{wybrany_typ}') W "
            "CALOSCI: ENMValidator.validate + readiness + model_dump(mode='json') + "
            "compute_enm_hash + CanonicalRunRepository.create (ZAPIS DO DB). WYMAGA DB — "
            f"skrypt zaklada WLASNA izolowana baze SQLite w katalogu tymczasowym "
            f"({_TMP_ROOT}), analogicznie do tests/conftest.py::_izolowana_baza_przebiegow; "
            "NIE dotyka mv_design_pro.db repozytorium. Brak w kodzie sciezki 'w pamieci' bez "
            "DB dla create_run (istnieje wykonaj_bieg_w_pamieci, ale przyjmuje JUZ zlozony "
            "CanonicalRun — nie wykonuje assemblacji migawki). Rozgrzewka: pierwsze "
            "(nieliczone) wywolanie z proby kandydata pochlania jednorazowy koszt "
            "inicjalizacji silnika DB + schematu (~130 ms na tej maszynie, kolejne "
            "wywolania ~12-18 ms)." + zamiennik
        ),
        surowe_ms=czasy,
    )


# ---------------------------------------------------------------------------
# B3 — LF: enm.canonical_analysis._execute_power_flow
# ---------------------------------------------------------------------------


def mierz_b3(
    siec: Siec, powtorzenia: int, *, rozgrzewka: bool
) -> tuple[Pomiar, CanonicalRun | None]:
    ostatni_bieg: list[CanonicalRun] = []

    def raz() -> None:
        run = _canonical_run_bazowy(siec, "PF")
        _execute_power_flow(run)
        ostatni_bieg[:] = [run]

    try:
        czasy = _zmierz(raz, powtorzenia, rozgrzewka=rozgrzewka)
    except Exception as exc:  # noqa: BLE001
        return (
            _pomiar_niemierzalne(
                "B3",
                siec.klucz,
                siec.wielkosc,
                f"{type(exc).__name__}: {exc}",
                szyny=siec.szyny,
                galezie=siec.galezie,
            ),
            None,
        )

    mediana, p95 = _mediana_p95(czasy)
    status, prog, opis = _status_z_pomiaru("B3", siec.wielkosc, mediana)
    bieg = ostatni_bieg[0] if ostatni_bieg else None
    zbieglo = bool(((bieg.raw_result or {}) if bieg else {}).get("result_v1", {}).get("converged"))
    pomiar = Pomiar(
        pozycja="B3",
        nazwa_pozycji=BUDZETY["B3"].nazwa,
        siec=siec.klucz,
        wielkosc=siec.wielkosc,
        szyny=siec.szyny,
        galezie=siec.galezie,
        n=powtorzenia,
        mediana_ms=mediana,
        p95_ms=p95,
        budzet_ms=prog,
        budzet_opis=opis,
        status=status,
        powod_niemierzalne=None,
        uwagi=(
            "cala funkcja enm.canonical_analysis._execute_power_flow(run, graph=None) — "
            "budowa PQSpec + solver NR (power_flow_newton_internal, przez solve_with_oltc) + "
            "montaz wyniku WHITE BOX. Graf budowany WEWNATRZ funkcji (koszt B1 NIE odjety — "
            "'bez montazu migawki' z definicji B3 odnosi sie do migawki/DB z B2, nie do "
            "grafu). power_flow_trace nie niesie sub-znacznikow czasu wewnatrz solvera, wiec "
            f"nie da sie wydzielic 'samego' solvera od reszty funkcji. Zbieznosc: {zbieglo}."
        ),
        surowe_ms=czasy,
    )
    return pomiar, bieg


# ---------------------------------------------------------------------------
# B4 — SC: enm.canonical_analysis._execute_short_circuit (3F, wszystkie wezly)
# ---------------------------------------------------------------------------


def mierz_b4(siec: Siec, powtorzenia: int, *, rozgrzewka: bool) -> Pomiar:
    n_wynikow: list[int] = []

    def raz() -> None:
        run = _canonical_run_bazowy(siec, "short_circuit_sn", {"fault_type": "3F"})
        _execute_short_circuit(run)
        n_wynikow.append(len((run.raw_result or {}).get("results", [])))

    try:
        czasy = _zmierz(raz, powtorzenia, rozgrzewka=rozgrzewka)
    except Exception as exc:  # noqa: BLE001
        return _pomiar_niemierzalne(
            "B4",
            siec.klucz,
            siec.wielkosc,
            f"{type(exc).__name__}: {exc}",
            szyny=siec.szyny,
            galezie=siec.galezie,
        )

    mediana, p95 = _mediana_p95(czasy)
    status, prog, opis = _status_z_pomiaru("B4", siec.wielkosc, mediana)
    return Pomiar(
        pozycja="B4",
        nazwa_pozycji=BUDZETY["B4"].nazwa,
        siec=siec.klucz,
        wielkosc=siec.wielkosc,
        szyny=siec.szyny,
        galezie=siec.galezie,
        n=powtorzenia,
        mediana_ms=mediana,
        p95_ms=p95,
        budzet_ms=prog,
        budzet_opis=opis,
        status=status,
        powod_niemierzalne=None,
        uwagi=(
            "cala funkcja enm.canonical_analysis._execute_short_circuit(run) — zwarcie 3F "
            f"IEC 60909 (scenariusz MAX) na WSZYSTKICH wezlach raportowalnych "
            f"({n_wynikow[-1] if n_wynikow else '?'} wynikow w ostatnim powtorzeniu), z "
            "budowa grafu WEWNATRZ funkcji (koszt B1 NIE odjety, jak w B3). Solver dzis "
            "liczy inwersje ODDZIELNIE per wezel zwarcia (gesta algebra) — patrz "
            "docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md sekcja 0 ('SC wszystkie wezly: "
            "O(N*n^3): inwersja per wezel')."
        ),
        surowe_ms=czasy,
    )


# ---------------------------------------------------------------------------
# B6 — scenario batch: N-1 pelne na G03 (application/analyses/kontyngencje_n1.py)
# ---------------------------------------------------------------------------


def mierz_b6(siec: Siec, powtorzenia: int, *, rozgrzewka: bool) -> Pomiar:
    base_run = _canonical_run_bazowy(siec, "PF")
    try:
        _execute_power_flow(base_run)
    except Exception as exc:  # noqa: BLE001
        return _pomiar_niemierzalne(
            "B6",
            siec.klucz,
            siec.wielkosc,
            f"bieg PF bazowy (wymagany wejsciem N-1) nie policzyl sie: {type(exc).__name__}: {exc}",
            szyny=siec.szyny,
            galezie=siec.galezie,
        )
    if not bool((base_run.raw_result or {}).get("result_v1", {}).get("converged")):
        return _pomiar_niemierzalne(
            "B6",
            siec.klucz,
            siec.wielkosc,
            "bieg PF bazowy nie osiagnal zbieznosci — enumeracja N-1 wymaga zbieznego "
            "przebiegu wejsciowego (build_kontyngencje_n1_view wymaga status=FINISHED, "
            "PF; zbieznosc sama w sobie nie jest wymagana przez funkcje, ale wynik bez "
            "niej nie jest interpretowalny jako baseline wydajnosci).",
            szyny=siec.szyny,
            galezie=siec.galezie,
        )

    n_kontyngencji: list[int] = []

    def raz() -> None:
        widok = build_kontyngencje_n1_view(base_run)
        n_kontyngencji.append(int(widok["podsumowanie"]["kontyngencji"]))

    try:
        czasy = _zmierz(raz, powtorzenia, rozgrzewka=rozgrzewka)
    except Exception as exc:  # noqa: BLE001
        return _pomiar_niemierzalne(
            "B6",
            siec.klucz,
            siec.wielkosc,
            f"{type(exc).__name__}: {exc}",
            szyny=siec.szyny,
            galezie=siec.galezie,
        )

    mediana, p95 = _mediana_p95(czasy)
    status, prog, opis = _status_z_pomiaru("B6", siec.wielkosc, mediana)
    return Pomiar(
        pozycja="B6",
        nazwa_pozycji=BUDZETY["B6"].nazwa,
        siec=siec.klucz,
        wielkosc=siec.wielkosc,
        szyny=siec.szyny,
        galezie=siec.galezie,
        n=powtorzenia,
        mediana_ms=mediana,
        p95_ms=p95,
        budzet_ms=prog,
        budzet_opis=opis,
        status=status,
        powod_niemierzalne=None,
        uwagi=(
            "application.analyses.kontyngencje_n1.build_kontyngencje_n1_view(run) — PELNY "
            f"wsad N-1 (element_refs=None = WSZYSTKIE kwalifikowane elementy: "
            f"{n_kontyngencji[-1] if n_kontyngencji else '?'} kontyngencji na {siec.klucz}), "
            "sekwencyjnie, jeden rdzen (funkcja liczy takze WLASNY 'przypadek bazowy' PF "
            "wewnatrz — druga, wewnetrzna kopia biegu bazowego, wiec pomiar zawiera 2x koszt "
            "PF bazowego + 1x PF per element). Bieg PF WEJSCIOWY (przekazywany do funkcji) "
            "policzony PRZED petla pomiarowa, poza czasem mierzonym (izolacja od B3). "
            "Porownanie do kolumny budzetu 'N-1 pelne' z sekcji 1 planu."
        ),
        surowe_ms=czasy,
    )


# ---------------------------------------------------------------------------
# B8 — projection nN: build_lv_domain_projection_v1 na 18 scenariuszach
# ---------------------------------------------------------------------------


def mierz_b8(powtorzenia: int, *, rozgrzewka: bool) -> list[Pomiar]:
    wyniki: list[Pomiar] = []
    mediany: list[float] = []

    for scenariusz in SCENARIUSZE:
        enm = scenariusz.budowniczy()
        case_id = f"perf-b8-{scenariusz.slug}"
        station_ref = scenariusz.station_ref

        def raz(enm=enm, case_id=case_id, station_ref=station_ref) -> None:
            build_lv_domain_projection_v1(enm, case_id, station_ref)

        try:
            czasy = _zmierz(raz, powtorzenia, rozgrzewka=rozgrzewka)
        except Exception as exc:  # noqa: BLE001
            wyniki.append(
                _pomiar_niemierzalne(
                    "B8",
                    f"{scenariusz.slug} (stacja {station_ref})",
                    "S",
                    f"{type(exc).__name__}: {exc}",
                    szyny=len(enm.buses),
                    galezie=len(enm.branches),
                )
            )
            continue

        mediana, p95 = _mediana_p95(czasy)
        mediany.append(mediana)
        status, prog, opis = _status_z_pomiaru("B8", "S", mediana)
        wyniki.append(
            Pomiar(
                pozycja="B8",
                nazwa_pozycji=BUDZETY["B8"].nazwa,
                siec=f"{scenariusz.slug} (stacja {station_ref})",
                wielkosc="S",
                szyny=len(enm.buses),
                galezie=len(enm.branches),
                n=powtorzenia,
                mediana_ms=mediana,
                p95_ms=p95,
                budzet_ms=prog,
                budzet_opis=opis,
                status=status,
                powod_niemierzalne=None,
                uwagi=(
                    "application.analyses.lv_domain.projection_v1.build_lv_domain_projection_v1"
                    "(enm, case_id, station_ref) BEZ przebiegu (run=None) — czysta projekcja "
                    f"jednej stacji. Scenariusz sekcja 47: '{scenariusz.tytul_pl}'. Porownanie "
                    "do kolumny S/M budzetu (obie '< 15 ms', bo scenariusz to pojedyncza "
                    "stacja — nie jest to substrat wielostacyjny)."
                ),
                surowe_ms=czasy,
            )
        )

    if mediany:
        mediana_z_median = statistics.median(mediany)
        status, prog, opis = _status_z_pomiaru("B8", "S", mediana_z_median)
        wyniki.append(
            Pomiar(
                pozycja="B8",
                nazwa_pozycji=BUDZETY["B8"].nazwa,
                siec=f"RAZEM ({len(mediany)} scenariuszy nN, mediana median)",
                wielkosc="S",
                szyny=None,
                galezie=None,
                n=len(mediany),
                mediana_ms=mediana_z_median,
                p95_ms=max(mediany),
                budzet_ms=prog,
                budzet_opis=opis,
                status=status,
                powod_niemierzalne=None,
                uwagi=(
                    "Mediana median wszystkich scenariuszy nN "
                    "(tests/application/analyses/lv_domain/scenariusze_nn.py:SCENARIUSZE) — "
                    "jedna pozycja porownawcza zbiorcza; p95 = najwolniejszy scenariusz "
                    "(max median). Wiersze indywidualne powyzej niosa pelny rozklad."
                ),
                surowe_ms=mediany,
            )
        )

    return wyniki


# ---------------------------------------------------------------------------
# B10 — document generation: zbuduj_pakiet_biegu po biegu LF na G02
# ---------------------------------------------------------------------------


def mierz_b10(
    siec: Siec, powtorzenia: int, *, rozgrzewka: bool, bieg_pf: CanonicalRun | None = None
) -> Pomiar:
    base_run = bieg_pf
    if base_run is None:
        base_run = _canonical_run_bazowy(siec, "PF")
        try:
            _execute_power_flow(base_run)
        except Exception as exc:  # noqa: BLE001
            return _pomiar_niemierzalne(
                "B10",
                siec.klucz,
                siec.wielkosc,
                f"bieg PF bazowy (wymagany wejsciem pakietu dowodowego) nie policzyl sie: "
                f"{type(exc).__name__}: {exc}",
                szyny=siec.szyny,
                galezie=siec.galezie,
            )

    rozmiary_bajty: list[int] = []

    def raz() -> None:
        _nazwa, zawartosc = zbuduj_pakiet_biegu(base_run)
        rozmiary_bajty.append(len(zawartosc))

    try:
        czasy = _zmierz(raz, powtorzenia, rozgrzewka=rozgrzewka)
    except Exception as exc:  # noqa: BLE001
        return _pomiar_niemierzalne(
            "B10",
            siec.klucz,
            siec.wielkosc,
            f"{type(exc).__name__}: {exc}",
            szyny=siec.szyny,
            galezie=siec.galezie,
        )

    mediana, p95 = _mediana_p95(czasy)
    status, prog, opis = _status_z_pomiaru("B10", siec.wielkosc, mediana)
    pdf_dostepny = is_pdf_export_available()
    rozmiar_med = statistics.median(rozmiary_bajty) if rozmiary_bajty else 0.0
    return Pomiar(
        pozycja="B10",
        nazwa_pozycji=BUDZETY["B10"].nazwa,
        siec=siec.klucz,
        wielkosc=siec.wielkosc,
        szyny=siec.szyny,
        galezie=siec.galezie,
        n=powtorzenia,
        mediana_ms=mediana,
        p95_ms=p95,
        budzet_ms=prog,
        budzet_opis=opis,
        status=status,
        powod_niemierzalne=None,
        uwagi=(
            "application.proof_engine.pakiet_biegu.zbuduj_pakiet_biegu(run) po biegu LF na "
            f"{siec.klucz} (run.status=FINISHED) — pakiet ZIP zbiorczy rozpływu: "
            "rozplyw.zip + spadek_napiecia.zip + straty.zip (kazdy: proof.json + proof.tex + "
            "manifest.json + signature.json). PDF (proof.pdf) "
            + (
                "DOSTEPNY i WLICZONY do pomiaru."
                if pdf_dostepny
                else (
                    "NIEDOSTEPNY w tym srodowisku (brak pdflatex) — pakiet NIE zawiera "
                    "proof.pdf, wiec ten pomiar jest DOLNYM oszacowaniem kosztu pelnego pakietu "
                    "z PDF (renderowanie LaTeX->PDF nie jest wliczone)."
                )
            )
            + f" Mediana rozmiaru ZIP: {rozmiar_med:.0f} B."
        ),
        surowe_ms=czasy,
    )


# ---------------------------------------------------------------------------
# Pozycje strukturalnie NIEMIERZALNE (nie zaleza od --sieci) + siec L
# ---------------------------------------------------------------------------

SIEC_L_POWOD = (
    "Siec wzorcowa L (~2000 szyn SN+nN, ~150 stacji z nN) NIE ISTNIEJE w rejestrze "
    "tests/golden/registry.py — generator L nie jest zaimplementowany. Najwiekszy zbudowany "
    "substrat to G00 (52 stacje / 315 szyn / 260 galezi), ktory rejestr "
    "(tests/golden/registry.py, wpis 'G00', pole proweniencja) oznacza jako NIEOBLICZALNY: "
    "'substrat 52 stacji NIEOBLICZALNY (A10) - do naprawy u zrodla; generator L nie istnieje'."
)


def wpisy_strukturalnie_niemierzalne() -> list[Pomiar]:
    return [
        _pomiar_niemierzalne(
            "B5",
            "-",
            "-",
            "Solver rozplywu 4-przewodowego nN (current-injection/BFS ABCN) NIE ISTNIEJE w "
            "backendzie — brak jakiejkolwiek klasy ABCN/FourWire w "
            "src/network_model/solvers/** (potwierdzone grep). "
            "docs/adr/ADR-021-frozen-core-extensions-and-lv-four-wire-solver.md:3 opisuje go "
            "jako NOWY solver ze statusem 'PROPOSED (program Digital Twin 2026-09; wymaga "
            "zgody wlasciciela B-01)' — rozszerzenie zamrozonego rdzenia wymagajace zgody "
            "wlasciciela (bramka B-01), NIE wdrozone.",
        ),
        _pomiar_niemierzalne(
            "B7",
            "-",
            "-",
            "Scena semantyczna SN jest liczona W CALOSCI PO STRONIE KLIENTA (frontend "
            "TypeScript, frontend/src/ui/sld/v3/scene/**, ~35,3 tys. LOC) — backend NIE MA "
            "endpointu/serwisu budujacego projekcje SN (w odroznieniu od projekcji nN, "
            "application/analyses/lv_domain/projection_v1.py, ktora istnieje — patrz B8). "
            "Zrodlo: docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md:29 ('SLD SN | projekcja "
            "100 % w kliencie (35,3 tys. LOC TS), trzy geometrie per LOD (3 sceny), brak "
            "wirtualizacji, wydajnosc dowodzona tylko w jsdom | A7-01/07').",
        ),
        _pomiar_niemierzalne(
            "B9",
            "-",
            "-",
            "Dense renderer (pierwsze wyrenderowanie + interakcja kanwy pan/zoom/selekcja) "
            "jest kodem PRZEGLADARKI (Canvas/SVG, frontend/src/ui/sld/**) — backend Python "
            "nie ma odpowiednika do zmierzenia time.perf_counter(). Wymaga harnessu "
            "Playwright W PRZEGLADARCE (nie jsdom) na sieci M/L — "
            "docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md sekcja 3 ('Frontend: Playwright "
            "performance.now()/requestAnimationFrame na sieci M/L: czas do pierwszej sceny, "
            "fps przy pan/zoom, pamiec'). Poza zakresem karty PERF-0 (backend Python) — "
            "osobna karta dla frontendu.",
        ),
    ]


# ---------------------------------------------------------------------------
# Orkiestracja
# ---------------------------------------------------------------------------


def sparsuj_argumenty(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Baseline budzetow wydajnosci B1-B10 (karta PERF-0). Mierzy, nie ocenia."
    )
    parser.add_argument(
        "--powtorzenia",
        type=int,
        default=5,
        help="Liczba MIERZONYCH powtorzen na pozycje/siec (domyslnie 5, min. zalecane wg "
        "planu: 5). Siec G00 jest ZAWSZE ograniczona do 1 powtorzenia (wolna budowa i "
        "wolne zwarcia) niezaleznie od tej wartosci.",
    )
    parser.add_argument(
        "--sieci",
        type=str,
        default="S,M",
        help="Wielkosci sieci do zmierzenia, po przecinku: S, M (L nie istnieje w rejestrze "
        "— zawsze raportowana jako NIEMIERZALNE, niezaleznie od tego parametru). "
        "Domyslnie 'S,M'.",
    )
    parser.add_argument("--json-wyjscie", type=Path, default=JSON_WYJSCIE_DOMYSLNE)
    parser.add_argument("--md-wyjscie", type=Path, default=MD_WYJSCIE_DOMYSLNE)
    return parser.parse_args(argv)


def _wersja_pakietu(nazwa: str) -> str | None:
    try:
        modul = __import__(nazwa)
    except Exception:  # noqa: BLE001
        return None
    return str(getattr(modul, "__version__", None))


def zbierz_metadane(
    powtorzenia: int, wybrane_wielkosci: set[str], czas_calosc_s: float
) -> dict[str, Any]:
    return {
        "data_pomiaru": datetime.now(UTC).isoformat(),
        "python_wersja": platform.python_version(),
        "numpy_wersja": _wersja_pakietu("numpy"),
        "scipy_wersja": _wersja_pakietu("scipy"),
        "platforma": platform.platform(),
        "liczba_rdzeni_logicznych": os.cpu_count(),
        "powtorzenia_zadane": powtorzenia,
        "sieci_wybrane": sorted(wybrane_wielkosci),
        "czas_calkowity_s": round(czas_calosc_s, 3),
        "zrodlo_budzetow": ZRODLO_BUDZETOW,
        "izolacja_srodowiska": {
            "tmp_root": str(_TMP_ROOT),
            "database_url": os.environ["DATABASE_URL"],
            "enm_store_dir": os.environ["ENM_STORE_DIR"],
        },
        "metoda": (
            "time.perf_counter() w JEDNYM procesie, ta sama maszyna dla wszystkich pozycji. "
            "Kazda pozycja/siec: 1 wywolanie rozgrzewkowe (nieliczone, POMINIETE dla sieci "
            "G00) + N wywolan mierzonych. Raportowana mediana i p95 "
            "(indeks ceil(0.95*N)-1 posortowanej listy rosnaco; dla N=1 mediana=p95=jedyna "
            "probka). Siec G00 (budowa ~15-20 s, zwarcia bardzo wolne — gesta algebra): "
            "N=1, BEZ rozgrzewki, niezaleznie od --powtorzenia."
        ),
    }


def zapisz_json(
    sciezka: Path, metadane: dict[str, Any], sieci: list[Siec], pomiary: list[Pomiar]
) -> None:
    dane = {
        "meta": metadane,
        "sieci": [
            {
                "klucz": s.klucz,
                "rejestr_id": s.rejestr_id,
                "indeks": s.indeks,
                "nazwa": s.nazwa,
                "wielkosc": s.wielkosc,
                "szyny": s.szyny,
                "galezie": s.galezie,
                "transformatory": s.transformatory,
                "czas_budowy_ms": round(s.czas_budowy_ms, 3),
                "walidacja_status": s.walidacja_status,
                "n_issues": s.n_issues,
                "n_blockers": s.n_blockers,
                "blokery_pl": s.blokery_pl,
            }
            for s in sieci
        ],
        "siec_l": {"status": "NIE_ISTNIEJE", "powod": SIEC_L_POWOD},
        "pomiary": [p.to_dict() for p in pomiary],
    }
    sciezka.parent.mkdir(parents=True, exist_ok=True)
    sciezka.write_text(json.dumps(dane, ensure_ascii=False, indent=2), encoding="utf-8")


def _fmt_ms(wartosc: float | None) -> str:
    return "-" if wartosc is None else f"{wartosc:.3f}"


def _fmt_int(wartosc: int | None) -> str:
    return "-" if wartosc is None else str(wartosc)


def zapisz_md(
    sciezka: Path, metadane: dict[str, Any], sieci: list[Siec], pomiary: list[Pomiar]
) -> None:
    linie: list[str] = []
    linie.append("# Baseline wydajnosci — macierz budzetow B1-B10 (karta PERF-0)")
    linie.append("")
    linie.append(
        "Dokument GENEROWANY przez `backend/scripts/benchmark_baseline.py` "
        f"(zrodlo budzetow: `{ZRODLO_BUDZETOW}`). Nie edytowac recznie — uruchom skrypt "
        "ponownie. Baseline = POMIAR, nie ocena: kazda pozycja ma albo liczbe (mediana + "
        "p95 z N powtorzen w tym samym procesie), albo wpis NIEMIERZALNE z jawnym powodem."
    )
    linie.append("")
    linie.append("## Warunki pomiaru")
    linie.append("")
    linie.append(f"- Data pomiaru: {metadane['data_pomiaru']}")
    linie.append(
        f"- Python: {metadane['python_wersja']}; numpy {metadane['numpy_wersja']}; "
        f"scipy {metadane['scipy_wersja']}"
    )
    linie.append(f"- Platforma: {metadane['platforma']}")
    linie.append(f"- Rdzenie logiczne: {metadane['liczba_rdzeni_logicznych']}")
    linie.append(
        f"- Powtorzenia zadane: {metadane['powtorzenia_zadane']} "
        "(siec G00: zawsze 1, bez rozgrzewki)"
    )
    linie.append(f"- Sieci wybrane (--sieci): {', '.join(metadane['sieci_wybrane']) or '-'}")
    linie.append(f"- Czas calkowity pomiaru: {metadane['czas_calkowity_s']} s")
    linie.append(f"- Metoda: {metadane['metoda']}")
    linie.append("")

    linie.append("## Sieci zmierzone")
    linie.append("")
    if sieci:
        linie.append(
            "| Siec | Rejestr | Nazwa | Wielkosc | Szyny | Galezie | Transf. | "
            "Budowa [ms] | Walidacja | BLOCKER |"
        )
        linie.append("|---|---|---|---|---|---|---|---|---|---|")
        for s in sieci:
            linie.append(
                "| "
                + " | ".join(
                    [
                        s.klucz,
                        s.rejestr_id,
                        s.nazwa,
                        s.wielkosc,
                        str(s.szyny),
                        str(s.galezie),
                        str(s.transformatory),
                        f"{s.czas_budowy_ms:.1f}",
                        s.walidacja_status,
                        str(s.n_blockers),
                    ]
                )
                + " |"
            )
        linie.append("")
        blokery_do_wypisania = [s for s in sieci if s.blokery_pl]
        if blokery_do_wypisania:
            linie.append("### BLOCKER walidatora per siec")
            linie.append("")
            for s in blokery_do_wypisania:
                linie.append(f"**{s.klucz}** ({s.n_blockers} BLOCKER):")
                for b in s.blokery_pl[:25]:
                    linie.append(f"- {b}")
                if s.n_blockers > 25:
                    linie.append(f"- ... (+{s.n_blockers - 25} kolejnych, patrz JSON)")
                linie.append("")
    else:
        linie.append("Brak — parametr `--sieci` nie wybral zadnej sieci S/M.")
        linie.append("")

    linie.append("## Siec L")
    linie.append("")
    linie.append(f"**NIEMIERZALNE.** {SIEC_L_POWOD}")
    linie.append("")

    linie.append("## Macierz pomiarow")
    linie.append("")
    linie.append(
        "| Pozycja | Nazwa | Siec | Wielk. | Szyny | Galezie | N | Mediana [ms] | "
        "p95 [ms] | Budzet | Status |"
    )
    linie.append("|---|---|---|---|---|---|---|---|---|---|---|")

    uwagi_lista: list[tuple[str, str, str]] = []  # (pozycja, siec, uwagi)
    for pozycja in KOLEJNOSC_POZYCJI:
        wiersze = [p for p in pomiary if p.pozycja == pozycja]
        for p in wiersze:
            linie.append(
                "| "
                + " | ".join(
                    [
                        p.pozycja,
                        p.nazwa_pozycji,
                        p.siec,
                        p.wielkosc,
                        _fmt_int(p.szyny),
                        _fmt_int(p.galezie),
                        str(p.n) if p.n else "-",
                        _fmt_ms(p.mediana_ms),
                        _fmt_ms(p.p95_ms),
                        p.budzet_opis,
                        (p.status if p.status != "NIEMIERZALNE" else "NIEMIERZALNE ⚠"),
                    ]
                )
                + " |"
            )
            if p.status == "NIEMIERZALNE":
                uwagi_lista.append((p.pozycja, p.siec, p.powod_niemierzalne or ""))
            elif p.uwagi:
                uwagi_lista.append((p.pozycja, p.siec, p.uwagi))
    linie.append("")

    linie.append("## Uwagi szczegolowe / powody NIEMIERZALNE")
    linie.append("")
    for pozycja, siec, tekst in uwagi_lista:
        if not tekst:
            continue
        linie.append(f"- **{pozycja} / {siec}:** {tekst}")
    linie.append("")

    liczba_wewnatrz = sum(1 for p in pomiary if p.status == "WEWNATRZ")
    liczba_przekroczony = sum(1 for p in pomiary if p.status == "PRZEKROCZONY")
    liczba_niemierzalne = sum(1 for p in pomiary if p.status == "NIEMIERZALNE")
    linie.append("## Podsumowanie")
    linie.append("")
    linie.append(f"- Wpisow WEWNATRZ budzetu: {liczba_wewnatrz}")
    linie.append(f"- Wpisow PRZEKROCZONY: {liczba_przekroczony}")
    linie.append(f"- Wpisow NIEMIERZALNE: {liczba_niemierzalne}")
    pozycje_obecne = sorted({p.pozycja for p in pomiary})
    brakujace = [p for p in KOLEJNOSC_POZYCJI if p not in pozycje_obecne]
    if brakujace:
        linie.append(f"- **BLAD POKRYCIA — pozycje bez zadnego wpisu: {', '.join(brakujace)}**")
    else:
        linie.append("- Pokrycie: wszystkie pozycje B1-B10 maja co najmniej jeden wpis.")
    linie.append("")
    linie.append(
        "Baseline nie jest bramka CI (zero asercji na czasy) — status PRZEKROCZONY jest "
        "danymi wejsciowymi do kart naprawczych programu wydajnosci "
        "(`docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md`), nie powodem do podniesienia progu."
    )
    linie.append("")

    sciezka.parent.mkdir(parents=True, exist_ok=True)
    sciezka.write_text("\n".join(linie), encoding="utf-8")


def wydrukuj_podsumowanie(pomiary: list[Pomiar]) -> None:
    print()
    print("=" * 100)
    print(
        f"{'Pozycja':6} {'Siec':38} {'Wielk':6} {'N':4} {'Mediana[ms]':>12} {'p95[ms]':>10} {'Status':14}"
    )
    print("-" * 100)
    for pozycja in KOLEJNOSC_POZYCJI:
        for p in [x for x in pomiary if x.pozycja == pozycja]:
            print(
                f"{p.pozycja:6} {p.siec[:38]:38} {p.wielkosc:6} {(str(p.n) if p.n else '-'):>4} "
                f"{_fmt_ms(p.mediana_ms):>12} {_fmt_ms(p.p95_ms):>10} {p.status:14}"
            )
    print("=" * 100)


def main(argv: list[str] | None = None) -> int:
    args = sparsuj_argumenty(argv)
    wybrane_wielkosci = {w.strip().upper() for w in args.sieci.split(",") if w.strip()}
    czas_start = time.perf_counter()

    print(f"[perf-baseline] katalog tymczasowy izolacji: {_TMP_ROOT}")
    print(f"[perf-baseline] powtorzenia={args.powtorzenia} sieci={sorted(wybrane_wielkosci)}")

    rejestry_do_budowy: list[str] = []
    if "S" in wybrane_wielkosci:
        rejestry_do_budowy.extend(REJESTRY_S)
    if "M" in wybrane_wielkosci:
        rejestry_do_budowy.extend(REJESTRY_M)

    sieci: list[Siec] = []
    for rejestr_id in rejestry_do_budowy:
        print(f"[perf-baseline] budowanie sieci rejestru {rejestr_id}...", flush=True)
        for s in zaladuj_siec(rejestr_id):
            print(
                f"  {s.klucz}: {s.szyny} szyn, {s.galezie} galezi, {s.transformatory} "
                f"transformatorow, budowa~={s.czas_budowy_ms:.1f} ms, walidacja="
                f"{s.walidacja_status} ({s.n_blockers} BLOCKER)",
                flush=True,
            )
            sieci.append(s)

    pomiary: list[Pomiar] = []
    bieg_pf_g02_0: CanonicalRun | None = None

    for s in sieci:
        wolna = s.rejestr_id == REJESTR_WOLNY
        powt = 1 if wolna else args.powtorzenia
        rozgrz = not wolna

        print(f"[perf-baseline] {s.klucz}: B1 (topology)...", flush=True)
        pomiary.append(mierz_b1(s, powt, rozgrzewka=rozgrz))

        print(f"[perf-baseline] {s.klucz}: B2 (snapshot assembly)...", flush=True)
        pomiary.append(mierz_b2(s, powt, rozgrzewka=rozgrz))

        print(f"[perf-baseline] {s.klucz}: B3 (LF)...", flush=True)
        pomiar_b3, bieg_pf = mierz_b3(s, powt, rozgrzewka=rozgrz)
        pomiary.append(pomiar_b3)
        if s.rejestr_id == "G02" and s.indeks == 0:
            bieg_pf_g02_0 = bieg_pf

        print(
            f"[perf-baseline] {s.klucz}: B4 (SC) — UWAGA: moze byc wolne na sieci M...", flush=True
        )
        pomiary.append(mierz_b4(s, powt, rozgrzewka=rozgrz))

    g03 = next((s for s in sieci if s.rejestr_id == "G03"), None)
    if g03 is not None:
        print("[perf-baseline] B6 (N-1 na G03)...", flush=True)
        pomiary.append(mierz_b6(g03, args.powtorzenia, rozgrzewka=True))
    else:
        pomiary.append(
            _pomiar_niemierzalne(
                "B6", "G03", "S", "Siec G03 pominieta parametrem --sieci (wymagane 'S')."
            )
        )

    print("[perf-baseline] B8 (18 scenariuszy nN)...", flush=True)
    pomiary.extend(mierz_b8(args.powtorzenia, rozgrzewka=True))

    g02_0 = next((s for s in sieci if s.rejestr_id == "G02" and s.indeks == 0), None)
    if g02_0 is not None:
        print("[perf-baseline] B10 (pakiet dowodowy na G02 po LF)...", flush=True)
        pomiary.append(mierz_b10(g02_0, args.powtorzenia, rozgrzewka=True, bieg_pf=bieg_pf_g02_0))
    else:
        pomiary.append(
            _pomiar_niemierzalne(
                "B10", "G02", "S", "Siec G02 pominieta parametrem --sieci (wymagane 'S')."
            )
        )

    pomiary.extend(wpisy_strukturalnie_niemierzalne())

    czas_calosc_s = time.perf_counter() - czas_start
    metadane = zbierz_metadane(args.powtorzenia, wybrane_wielkosci, czas_calosc_s)

    zapisz_json(args.json_wyjscie, metadane, sieci, pomiary)
    zapisz_md(args.md_wyjscie, metadane, sieci, pomiary)
    wydrukuj_podsumowanie(pomiary)

    print()
    print(f"[perf-baseline] zapisano {args.json_wyjscie}")
    print(f"[perf-baseline] zapisano {args.md_wyjscie}")
    print(f"[perf-baseline] czas calkowity: {czas_calosc_s:.1f} s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
