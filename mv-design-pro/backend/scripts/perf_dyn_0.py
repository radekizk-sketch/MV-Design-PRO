"""PERF-DYN-0 — pomiar kosztu biegu `dynamika_rms` (karta DYNAMIKA-W-TLE, karta W6-2 §0 pkt 9).

Budżet z karty W6-2: 10 s symulacji sieci 50 stacji z 5 źródłami ≤ 60 s obliczeń. Pomiar idzie
TĄ SAMĄ ścieżką, którą przechodzi bieg projektanta (`create_run` → `execute_run` → rdzeń DAE),
więc obejmuje adapter, rozpływ punktu pracy nie (mierzony osobno) i zapis szeregów do bazy.

Dwie sieci:
* `harness` — scena harnessu dynamiki (`tests/golden/enm_builders/dynamika_projektanta.py`,
  ta sama, którą eksportuje `eksport_fixtur_harnessu.py`): GPZ, magistrala 2 odcinki, stacja
  z PV; horyzont 0,3 s (scenariusz sceny) — bieg krótki;
* `zlota` — sieć złota G00 (`tests/reference_networks/sld_substrate_52s.py`, 54 stacje,
  514 szyn) z PIĘCIOMA źródłami PV związanymi z profilem `default_pv_gfl` operacją
  `set_der_catalog_bindings` (magazyny i turbiny wiatrowe G00 są zdjęte: magazyn nie ma
  danych tabliczki wymaganych przez rdzeń — karta KATALOG-DYNAMIKI-BRAKI, a turbina typu 1/2
  nie ma modelu elektrycznego); zwarcie 3F w połowie gałęzi najdalszej od GPZ w t = 0,05 s usunięte
  izolacją w 0,15 s (X_f = 2 Ω); horyzont z argumentu (domyślnie 10 s), krok stały 0,002 s (nastawy
  sceny harnessu).

Liczba wątków BLAS jest cechą PROCESU: ustaw `OPENBLAS_NUM_THREADS`/`OMP_NUM_THREADS`
PRZED uruchomieniem (skrypt tylko raportuje wartości z otoczenia). Wynik: JSON na stdout.

Uruchomienie (z katalogu `backend`):
    OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 PYTHONPATH=src:. python scripts/perf_dyn_0.py
    PYTHONPATH=src:. python scripts/perf_dyn_0.py --siec zlota --horyzont-s 10
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

BACKEND = Path(__file__).resolve().parents[1]
for sciezka in (BACKEND / "src", BACKEND):
    if str(sciezka) not in sys.path:
        sys.path.insert(0, str(sciezka))

_TMP = tempfile.mkdtemp(prefix="perf_dyn_0_")
os.environ.setdefault("DATABASE_URL", f"sqlite+pysqlite:///{_TMP}/biegi.db")
os.environ.setdefault("ENM_STORE_DIR", f"{_TMP}/enm")

import numpy as np  # noqa: E402

from enm.canonical_analysis import (  # noqa: E402
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.domain_operations import execute_domain_operation  # noqa: E402
from enm.models import EnergyNetworkModel  # noqa: E402
from enm.scenariusze import (  # noqa: E402
    OperatingScenario,
    RodzajScenariusza,
    ScenariuszDynamiczny,
    usun_wszystkie_scenariusze,
    zapisz_scenariusz,
)
from enm.store import reset_enm_store, set_enm  # noqa: E402

CASE_ID = "perf-dyn-0"
PROFIL_PV = "default_pv_gfl"
LICZBA_ZRODEL_SIECI_ZLOTEJ = 5

#: Nastawy sceny harnessu (`scripts/eksport_fixtur_harnessu.py: NASTAWY_SCENY_DYNAMIKA`).
NASTAWY: dict[str, Any] = {
    "dt_s": 0.002,
    "dt_min_s": 0.002,
    "dt_max_s": 0.002,
    "tolerancja": 1.0e-10,
    "tolerancja_kroku": 1.0e-6,
    "eps_init": 1.0e-6,
    "max_iteracji_newtona": 40,
    "max_nawrotow": 30,
    "integrator": "trapez_niejawny",
    "tolerancja_lokalizacji_zdarzen_s": 1.0e-4,
}


def _op(enm: dict[str, Any], nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(enm, nazwa, payload)
    if wynik.get("error") is not None:
        raise RuntimeError(f"Operacja {nazwa} odrzucona: {wynik['error']}")
    return dict(wynik["snapshot"])


def _siec_harnessu() -> tuple[dict[str, Any], dict[str, Any]]:
    from tests.golden.enm_builders.dynamika_projektanta import (
        build_dynamika_projektanta_enm,
        refy_sieci,
        scenariusz_zwarcia_w_odcinku,
    )

    enm = build_dynamika_projektanta_enm(z_modelem_pv=True)
    refy = refy_sieci(enm)
    return enm, scenariusz_zwarcia_w_odcinku(refy.odcinek_zwarcia, szyna_detektora=refy.szyna_pv)


def _siec_zlota(horyzont_s: float) -> tuple[dict[str, Any], dict[str, Any]]:
    from tests.reference_networks.sld_substrate_52s import build_sld_substrate_52s

    enm = dict(build_sld_substrate_52s()["enm"])
    pv = [g for g in enm["generators"] if g["gen_type"] == "pv_inverter"]
    enm["generators"] = pv[:LICZBA_ZRODEL_SIECI_ZLOTEJ]
    for generator in enm["generators"]:
        enm = _op(
            enm,
            "set_der_catalog_bindings",
            {"generator_ref": generator["ref_id"], "dynamic_model_ref": PROFIL_PV},
        )
    magistrala = _galaz_najdalsza_od_zrodla(enm)
    scenariusz = {
        "detektory": [],
        "horyzont_s": horyzont_s,
        "krok_wyjscia_s": 0.02,
        "zdarzenia": [
            {
                "rodzaj": "zwarcie",
                "t_s": 0.05,
                "element_ref": magistrala,
                "polozenie_wzgledne": 0.5,
                "typ": "3F",
                "r_f_ohm": 0.0,
                # X_f = 1 Ω (jak w scenie harnessu) kończy się na tej sieci odmową
                # `dynamika.reinicjalizacja_niezbiezna` (re-inicjalizacja algebry po
                # zdarzeniu, 30 nawrotów) — obserwacja rdzenia zapisana w meldunku karty;
                # pomiar kosztu potrzebuje zdarzenia liczonego, nie odmowy: X_f = 2 Ω zbiega.
                "x_f_ohm": 2.0,
                "t_usuniecia_s": 0.15,
                "sposob_usuniecia": "izolacja",
            },
            {"rodzaj": "wylaczenie_galezi", "t_s": 0.15, "element_ref": magistrala},
        ],
    }
    return enm, scenariusz


def _galaz_najdalsza_od_zrodla(enm: dict[str, Any]) -> str:
    """Gałąź SN najdalsza (liczbą gałęzi) od szyny źródła — miejsce zwarcia pomiaru.

    Zwarcie na magistrali tuż przy GPZ (X_f = 1 Ω) zapada napięcie całej sieci i
    re-inicjalizacja algebry po zdarzeniu odmawia (`dynamika.reinicjalizacja_niezbiezna`);
    pomiar kosztu kroku potrzebuje zdarzenia, które rdzeń liczy, nie odmowy — zwarcie
    na końcu odgałęzienia jest zwarciem realnym sieci rozdzielczej i zbiega.
    """
    from collections import deque

    sasiedzi: dict[str, list[tuple[str, str]]] = {}
    for galaz in enm["branches"]:
        if galaz.get("status") == "open":
            continue
        a, b = galaz["from_bus_ref"], galaz["to_bus_ref"]
        sasiedzi.setdefault(a, []).append((b, galaz["ref_id"]))
        sasiedzi.setdefault(b, []).append((a, galaz["ref_id"]))
    start = enm["sources"][0]["bus_ref"]
    glebokosc = {start: 0}
    najdalsza = (0, "")
    kolejka = deque([start])
    while kolejka:
        szyna = kolejka.popleft()
        for sasiad, ref in sorted(sasiedzi.get(szyna, ())):
            if sasiad in glebokosc:
                continue
            glebokosc[sasiad] = glebokosc[szyna] + 1
            najdalsza = max(najdalsza, (glebokosc[sasiad], ref))
            kolejka.append(sasiad)
    if not najdalsza[1]:
        raise RuntimeError("Sieć bez gałęzi zamkniętej od szyny źródła")
    return najdalsza[1]


def _pomiar(nazwa: str, enm_dict: dict[str, Any], scenariusz: dict[str, Any]) -> dict[str, Any]:
    reset_canonical_runs()
    reset_enm_store()
    usun_wszystkie_scenariusze()
    enm = EnergyNetworkModel.model_validate(enm_dict)
    set_enm(CASE_ID, enm)

    zegar = time.perf_counter()
    bieg_pf = execute_run(
        create_run(case_id=CASE_ID, klucz_twin=CASE_ID, analysis_type="PF", options={}).id
    )
    czas_pf_s = time.perf_counter() - zegar
    if bieg_pf.status != "FINISHED":
        raise RuntimeError(f"{nazwa}: rozpływ nie zakończył się wynikiem: {bieg_pf.error_message}")

    zapisany = zapisz_scenariusz(
        CASE_ID,
        OperatingScenario(
            scenario_id=f"perf-dyn-0-{nazwa}",
            name=f"PERF-DYN-0 {nazwa}",
            kind=RodzajScenariusza.CUSTOM,
            dynamika=ScenariuszDynamiczny.model_validate(scenariusz),
        ),
    )
    zegar = time.perf_counter()
    bieg = execute_run(
        create_run(
            case_id=CASE_ID,
            klucz_twin=CASE_ID,
            analysis_type="dynamika_rms",
            options={"pf_run_id": str(bieg_pf.id), "nastawy_solvera": NASTAWY},
            scenariusz=zapisany,
        ).id
    )
    czas_biegu_s = time.perf_counter() - zegar
    if bieg.status != "FINISHED":
        raise RuntimeError(f"{nazwa}: bieg dynamiki nie zakończył się wynikiem: {bieg.error_message}")
    wlasnosci = (bieg.raw_result or {}).get("wlasnosci_biegu", {})
    return {
        "siec": nazwa,
        "szyny": len(enm.buses),
        "galezie": len(enm.branches),
        "transformatory": len(enm.transformers),
        "stacje": len(enm.substations),
        "zrodla_dynamiczne": len(enm.generators),
        "horyzont_s": scenariusz["horyzont_s"],
        "dt_s": NASTAWY["dt_s"],
        "czas_rozplywu_s": round(czas_pf_s, 3),
        "czas_biegu_dynamiki_s": round(czas_biegu_s, 3),
        "czas_obliczen_rdzenia_s": wlasnosci.get("czas_obliczen_s"),
        "kroki": wlasnosci.get("kroki"),
        "kroki_odrzucone": wlasnosci.get("kroki_odrzucone"),
    }


def _otoczenie() -> dict[str, Any]:
    obciazenie = os.getloadavg() if hasattr(os, "getloadavg") else None
    return {
        "maszyna": platform.node(),
        "cpu": os.cpu_count(),
        "python": platform.python_version(),
        "numpy": np.__version__,
        "OPENBLAS_NUM_THREADS": os.environ.get("OPENBLAS_NUM_THREADS"),
        "OMP_NUM_THREADS": os.environ.get("OMP_NUM_THREADS"),
        "MKL_NUM_THREADS": os.environ.get("MKL_NUM_THREADS"),
        "obciazenie_1_5_15_min": obciazenie,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--siec", choices=("harness", "zlota", "obie"), default="obie")
    parser.add_argument("--horyzont-s", type=float, default=10.0)
    parser.add_argument("--powtorzenia", type=int, default=1)
    args = parser.parse_args()

    raport: dict[str, Any] = {"otoczenie": _otoczenie(), "pomiary": []}
    try:
        for _ in range(args.powtorzenia):
            if args.siec in ("harness", "obie"):
                raport["pomiary"].append(_pomiar("harness", *_siec_harnessu()))
            if args.siec in ("zlota", "obie"):
                raport["pomiary"].append(_pomiar("zlota", *_siec_zlota(args.horyzont_s)))
    finally:
        reset_canonical_runs()
        reset_enm_store()
        usun_wszystkie_scenariusze()
    print(json.dumps(raport, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
