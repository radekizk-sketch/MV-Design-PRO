"""Wynik solvera nie zależy od liczby wątków BLAS ani od historii procesu (karta
DETERMINIZM-HISTORII-PROCESU, 2026-10-23).

DEFEKT. OpenBLAS numpy i scipy dzieli LU, odwrócenie i iloczyn macierzy między wątki, a liczbę
wątków czyta z ``OPENBLAS_NUM_THREADS`` przy załadowaniu biblioteki. Generator fixtur harnessu
uruchomiony z powłoki (4 wątki) i ten sam generator pod pytest-xdist (1 wątek) dawały inne
ostatnie bity Z_bus (``short_circuit_core.py`` ``np.linalg.inv(y_bus)``), kroku Newtona
(``power_flow_newton_internal.py`` ``np.linalg.solve``) i macierzy wzmocnienia WLS
(``state_estimation_wls.py`` ``np.linalg.inv``) — a za nimi fixtury dynamiki (punkt pracy,
``odcisk_punktu_pracy``), koordynacji zabezpieczeń i estymacji. Hipoteza „redukcje zależne od
wyrównania pamięci po imporcie odcisku katalogu" NIE potwierdziła się: 128 fixtur liczonych po
imporcie ``network_model.catalog.odcisk`` i po alokacji przesuwającej adresy jest bit w bit
równych biegowi świeżemu przy tej samej liczbie wątków.

NAPRAWA. ``network_model/watki_blas.py`` (ładowany przez ``network_model/__init__.py``) ustawia
jeden wątek w każdej załadowanej bibliotece BLAS procesu.

ILOCZYN CECH. {historia procesu: świeży / po imporcie odcisku katalogu / po dużej alokacji
przesuwającej wyrównanie; każdy wariant z innym ``PYTHONHASHSEED``} x {``OPENBLAS_NUM_THREADS``: 1 / 2 / 4, w podprocesie} x {rodzina
solvera: zwarcia IEC 60909, rozpływ NR, rozpływ FD, rozpływ GS, dynamika, koordynacja
zabezpieczeń, estymacja WLS} — porównanie BITOWE (``float.hex``) wyników każdej rodziny między
wszystkimi dziewięcioma wariantami. Rodziny liczone na dwóch rodzajach wejścia: scenach
harnessu (te same funkcje, które wołają końcówki API — generator fixtur) i sieci syntetycznej
160 węzłów, na której gęste LU/odwrócenie są wrażliwe na podział pracy (rozpływ GS nie ma
operacji BLAS poza normą wektora — jest w iloczynie jako rodzina, nie jako czujnik).
Uzupełnienie w procesie: argumenty przesunięte o wielokrotność 16 bajtów (jedyne przesunięcie
z alokatora) dają te same bity w każdej klasie operacji BLAS/LAPACK używanej przez solvery.
"""

from __future__ import annotations

import ast
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import scipy.linalg
import scipy.sparse
import scipy.sparse.linalg
from network_model.watki_blas import LICZBA_WATKOW_BLAS, biblioteki_blas

KATALOG_BACKENDU = Path(__file__).resolve().parents[2]
SRC = KATALOG_BACKENDU / "src"

HISTORIE = ("swiezy", "po_imporcie_odcisku", "po_duzej_alokacji")
LICZBY_WATKOW = (1, 2, 4)
RODZINY = (
    "zwarcia_iec60909",
    "rozplyw_nr",
    "rozplyw_fd",
    "rozplyw_gs",
    "dynamika",
    "koordynacja_zabezpieczen",
    "estymacja_wls",
)

#: Skrypt podprocesu: historia procesu PRZED importem solverów, potem rodziny solverów;
#: na stdout JSON {rodzina: SHA-256 wyniku w zapisie `float.hex`}. Eksporter fixtur ładowany
#: z PLIKU (jak w `tests/ci/test_fixtury_harnessu.py`), żeby katalog `scripts` nie przesłaniał
#: pakietów źródłowych.
_SKRYPT = r'''
import sys
historia = sys.argv[1]
zapas = []
if historia == "po_imporcie_odcisku":
    import network_model.catalog.odcisk  # noqa: F401
elif historia == "po_duzej_alokacji":
    import numpy as np
    for k in range(1, 300):
        zapas.append(np.empty(1000 * k + 3))
        zapas.append(bytearray(37 * k + 5))

import dataclasses, enum, hashlib, importlib.util, json
import numpy as np

def kanon(o):
    if dataclasses.is_dataclass(o) and not isinstance(o, type):
        return {f.name: kanon(getattr(o, f.name)) for f in dataclasses.fields(o)}
    if isinstance(o, dict):
        return {str(k): kanon(v) for k, v in sorted(o.items(), key=lambda kv: str(kv[0]))}
    if isinstance(o, (list, tuple)):
        return [kanon(v) for v in o]
    if isinstance(o, np.ndarray):
        return kanon(o.tolist())
    if isinstance(o, (bool, np.bool_)):
        return bool(o)
    if isinstance(o, (int, np.integer)):
        return int(o)
    if isinstance(o, (float, np.floating)):
        return float(o).hex()
    if isinstance(o, (complex, np.complexfloating)):
        return [float(o.real).hex(), float(o.imag).hex()]
    if isinstance(o, enum.Enum):
        return str(o.value)
    if o is None or isinstance(o, str):
        return o
    raise TypeError(f"brak zapisu kanonicznego dla {type(o)!r}")

def skrot(o):
    return hashlib.sha256(json.dumps(kanon(o), sort_keys=True).encode()).hexdigest()

from network_model.core.branch import BranchType, LineBranch
from network_model.core.czas_wylaczenia import czas_tb_roboczy
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_fast_decoupled import PowerFlowFastDecoupledSolver
from network_model.solvers.power_flow_gauss_seidel import PowerFlowGaussSeidelSolver
from network_model.solvers.power_flow_newton import solve_power_flow_physics
from network_model.solvers.power_flow_types import (
    PowerFlowInput, PowerFlowOptions, PQSpec, SlackSpec,
)
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

def siec(n):
    """Magistrala 15 kV z n węzłami i co dziewiątym węzłem spiętym linią (oczka)."""
    g = NetworkGraph()
    g.add_node(Node(id="W000", name="W000", node_type=NodeType.SLACK, voltage_level=15.0,
                    voltage_magnitude=1.0, voltage_angle=0.0, active_power=0.0,
                    reactive_power=0.0))
    for i in range(1, n):
        g.add_node(Node(id=f"W{i:03d}", name=f"W{i:03d}", node_type=NodeType.PQ,
                        voltage_level=15.0, active_power=0.0, reactive_power=0.0))
    pary = [(i - 1, i, 0.3 + 0.01 * (i % 11)) for i in range(1, n)]
    pary += [(i, i + 9, 1.1) for i in range(0, n - 9, 9)]
    for k, (a, b, dl) in enumerate(pary):
        g.add_branch(LineBranch(
            id=f"L{k:03d}", name=f"L{k:03d}", branch_type=BranchType.LINE,
            from_node_id=f"W{a:03d}", to_node_id=f"W{b:03d}",
            r_ohm_per_km=0.206 + 0.001 * (k % 5), x_ohm_per_km=0.35 + 0.002 * (k % 7),
            b_us_per_km=2.5, length_km=dl, rated_current_a=400.0))
    return g

def wejscie(n):
    return PowerFlowInput(
        graph=siec(n), base_mva=10.0, slack=SlackSpec(node_id="W000", u_pu=1.02),
        pq=[PQSpec(node_id=f"W{i:03d}", p_mw=0.02 + 0.0005 * (i % 13),
                   q_mvar=0.008 + 0.0002 * (i % 5)) for i in range(1, n)],
        options=PowerFlowOptions(max_iter=500, tolerance=1e-10))

spec = importlib.util.spec_from_file_location(
    "eksport_fixtur_harnessu", "scripts/eksport_fixtur_harnessu.py"
)
eksport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(eksport)
F = eksport.FIXTURY

N = 160
g = siec(N)
wynik = {
    "zwarcia_iec60909": skrot([
        [ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=g, fault_node_id=f"W{i:03d}", c_factor=1.1, tk_s=1.0,
            czas_tb=czas_tb_roboczy()) for i in (N // 3, N - 1)],
        F["zwarcia_wyniki_scena_zwarcia"](),
        F["koordynacja_scena_zwarcia_max"](),
        F["koordynacja_scena_zwarcia_min"](),
    ]),
    "rozplyw_nr": skrot([solve_power_flow_physics(wejscie(N)), F["rozplyw_scena_wynik"]()]),
    "rozplyw_fd": skrot(PowerFlowFastDecoupledSolver().solve(wejscie(N))),
    "rozplyw_gs": skrot(PowerFlowGaussSeidelSolver().solve(wejscie(40))),
    "dynamika": skrot([F["dynamika_scena_przebiegi"](), F["dynamika_scena_wyniki"]()]),
    "koordynacja_zabezpieczen": skrot(
        [F["koordynacja_scena_wynik"](), F["koordynacja_scena_nastawy"]()]
    ),
    "estymacja_wls": skrot(F["estymacja_scena_wynik"]()),
}
json.dump(wynik, sys.stdout, sort_keys=True)
'''


def _wariant(historia: str, liczba_watkow: int, katalog: Path) -> dict[str, str]:
    """Rodziny solverów w OSOBNYM procesie z zadaną historią i liczbą wątków z otoczenia.

    Każdy podproces ma własne magazyny i bazę przebiegów (dwa warianty biegną naraz, a sceny
    harnessu zapisują biegi kotwic). Ścieżka importu dziedziczona z bieżącego procesu."""
    katalog.mkdir(parents=True)
    srodowisko = dict(os.environ)
    srodowisko["PYTHONPATH"] = os.pathsep.join(p for p in sys.path if p)
    for zmienna in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
        srodowisko[zmienna] = str(liczba_watkow)
    # Każdy wariant z INNYM ziarnem skrótów napisów: kolejność iteracji zbiorów napisów
    # (a za nią kolejność sumowania po zbiorze identyfikatorów) to też historia procesu.
    srodowisko["PYTHONHASHSEED"] = str(
        HISTORIE.index(historia) * len(LICZBY_WATKOW) + LICZBY_WATKOW.index(liczba_watkow)
    )
    for zmienna in ("ENM_STORE_DIR", "STATION_USER_TEMPLATES_DIR", "CLOUD_BACKUP_BUCKET"):
        (katalog / zmienna).mkdir()
        srodowisko[zmienna] = str(katalog / zmienna)
        srodowisko.pop(zmienna + "_PYTEST_PID", None)
    srodowisko["DATABASE_URL"] = f"sqlite+pysqlite:///{katalog / 'przebiegi.db'}"
    srodowisko.pop("DATABASE_URL_PYTEST_PID", None)
    proces = subprocess.run(
        [sys.executable, "-c", _SKRYPT, historia],
        cwd=KATALOG_BACKENDU,
        env=srodowisko,
        capture_output=True,
        text=True,
        timeout=900,
        check=False,
    )
    assert proces.returncode == 0, proces.stderr[-4000:]
    wynik: dict[str, str] = json.loads(proces.stdout)
    return wynik


def test_rodziny_solverow_bit_w_bit_niezalezne_od_historii_i_watkow_blas(
    tmp_path: Path,
) -> None:
    """Iloczyn {historia} x {liczba wątków} x {rodzina}: jeden skrót wyniku na rodzinę."""
    warianty = [(h, w) for h in HISTORIE for w in LICZBY_WATKOW]
    with ThreadPoolExecutor(max_workers=2) as pula:
        wyniki = dict(
            zip(
                warianty,
                pula.map(
                    lambda hw: _wariant(hw[0], hw[1], tmp_path / f"{hw[0]}-{hw[1]}"), warianty
                ),
                strict=True,
            )
        )
    for wariant, wynik in wyniki.items():
        assert sorted(wynik) == sorted(RODZINY), wariant
    rozjazdy = {
        rodzina: {f"{h}/{w}": wyniki[(h, w)][rodzina][:12] for h, w in warianty}
        for rodzina in RODZINY
        if len({wynik[rodzina] for wynik in wyniki.values()}) > 1
    }
    assert rozjazdy == {}, f"wynik zależny od historii procesu albo liczby wątków: {rozjazdy}"


#: Świeży proces: import pakietu, potem algebra numpy, scipy i SuperLU — biblioteka scipy
#: musi mieć politykę tak samo jak numpy, także gdy proces sięga po scipy dopiero po
#: imporcie pakietu (iniekcja: polityka ustawiana przed załadowaniem scipy = czerwień przy
#: 2 i 4 wątkach w otoczeniu); na stdout biblioteki BLAS z liczbą wątków.
_SKRYPT_BIBLIOTEK = r"""
import json
import network_model  # noqa: F401
import numpy as np
import scipy.linalg
import scipy.sparse
import scipy.sparse.linalg
from threadpoolctl import threadpool_info
np.linalg.inv(np.eye(3) * 2.0)
scipy.linalg.lu_factor(np.eye(3) * 2.0)
scipy.sparse.linalg.splu(scipy.sparse.csc_matrix(np.eye(3) * 2.0)).solve(np.ones(3))
print(json.dumps([[i["prefix"], i["num_threads"]] for i in threadpool_info()
                  if i["user_api"] == "blas"]))
"""


@pytest.mark.parametrize("liczba_watkow", LICZBY_WATKOW)
def test_kazda_zaladowana_biblioteka_blas_liczy_jednym_watkiem(liczba_watkow: int) -> None:
    """Polityka obejmuje OBIE kopie OpenBLAS (numpy i scipy) w świeżym procesie z dowolną
    liczbą wątków w otoczeniu — także bibliotekę scipy, którą proces ładuje po pakiecie."""
    srodowisko = dict(os.environ)
    srodowisko["PYTHONPATH"] = os.pathsep.join(p for p in sys.path if p)
    for zmienna in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
        srodowisko[zmienna] = str(liczba_watkow)
    proces = subprocess.run(
        [sys.executable, "-c", _SKRYPT_BIBLIOTEK],
        cwd=KATALOG_BACKENDU,
        env=srodowisko,
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )
    assert proces.returncode == 0, proces.stderr[-4000:]
    biblioteki = {str(przedrostek): watki for przedrostek, watki in json.loads(proces.stdout)}
    assert {"libopenblas", "libscipy_openblas"} <= set(biblioteki), biblioteki
    assert set(biblioteki.values()) == {LICZBA_WATKOW_BLAS}, biblioteki
    # W procesie pytest ta sama polityka (pakiet zaimportowany przez testy wyżej).
    assert {b["num_threads"] for b in biblioteki_blas()} == {LICZBA_WATKOW_BLAS}


def test_polityka_jest_pierwszym_importem_pakietu() -> None:
    """`network_model/__init__.py` ładuje politykę PRZED pierwszym podpakietem — żaden moduł
    `network_model` nie liczy macierzy przed jej ustawieniem."""
    drzewo = ast.parse((SRC / "network_model" / "__init__.py").read_text(encoding="utf-8"))
    importy = [w for w in drzewo.body if isinstance(w, ast.Import | ast.ImportFrom)]
    assert importy, "network_model/__init__.py bez importów"
    assert ast.unparse(importy[0]) == "from . import watki_blas"


def _operacje_blas(drzewo: ast.AST) -> list[str]:
    """Operacje biblioteki BLAS/LAPACK w module: `@`, `*.linalg.*`, `np.dot`/`matmul`/`vdot`/
    `inner`/`einsum`/`tensordot`, metoda `.dot`, import `linalg`."""
    operacje: list[str] = []
    for wezel in ast.walk(drzewo):
        if isinstance(wezel, ast.BinOp) and isinstance(wezel.op, ast.MatMult):
            operacje.append(f"@:{wezel.lineno}")
        elif isinstance(wezel, ast.Call):
            nazwa = ast.unparse(wezel.func)
            czlony = nazwa.split(".")
            if (
                "linalg" in czlony
                or (
                    czlony[0] in {"np", "numpy"}
                    and czlony[-1] in {"dot", "matmul", "vdot", "inner", "einsum", "tensordot"}
                )
                or czlony[-1] == "dot"
            ):
                operacje.append(f"{nazwa}:{wezel.lineno}")
        elif isinstance(wezel, ast.Import | ast.ImportFrom) and "linalg" in ast.unparse(wezel):
            operacje.append(f"import:{wezel.lineno}")
    return operacje


def test_kazdy_modul_z_algebra_blas_dziala_pod_polityka() -> None:
    """KLASA, nie instancja: każdy moduł `src`, który woła BLAS/LAPACK, leży w pakiecie
    `network_model` albo importuje go na poziomie modułu — więc polityka jest ustawiona,
    zanim policzy pierwszą macierz. Nowy moduł z algebrą poza tym zasięgiem jest czerwony."""
    poza_polityka: list[str] = []
    z_algebra: list[str] = []
    for plik in sorted(SRC.rglob("*.py")):
        sciezka = plik.relative_to(SRC).as_posix()
        drzewo = ast.parse(plik.read_text(encoding="utf-8"))
        if not _operacje_blas(drzewo):
            continue
        z_algebra.append(sciezka)
        importy = [
            ast.unparse(w) for w in drzewo.body if isinstance(w, ast.Import | ast.ImportFrom)
        ]
        if not sciezka.startswith("network_model/") and not any(
            "network_model" in tekst for tekst in importy
        ):
            poza_polityka.append(sciezka)
    # Inwentarz zmierzony 2026-10-23: rdzenie zwarć, rozpływu NR/GS/FD, estymacji WLS,
    # dynamiki (sieć, całkowanie, obserwable, urządzenia, walidacja), V12.6 i `enm/mapping.py`.
    assert "network_model/solvers/short_circuit_core.py" in z_algebra
    assert "enm/mapping.py" in z_algebra
    assert poza_polityka == [], poza_polityka


#: Przesunięcia argumentów w bajtach względem bloku wyrównanego do 64 — wielokrotności 16,
#: bo tyle gwarantuje alokator (`malloc` na x86-64), a resztę ustala historia procesu.
PRZESUNIECIA_ALOKATORA = (0, 16, 32, 48)


def _pod_adresem(bufor: np.ndarray, tablica: np.ndarray, przesuniecie: int) -> np.ndarray:
    widok = np.frombuffer(
        bufor.data, dtype=tablica.dtype, count=tablica.size, offset=przesuniecie
    ).reshape(tablica.shape)
    widok[...] = tablica
    return widok


def _operacje(a: np.ndarray, b: np.ndarray) -> dict[str, Any]:
    rzadka = scipy.sparse.csc_matrix(
        np.where(np.abs(a) > 1.5, a, 0.0) + a.shape[0] * np.eye(len(a))
    )
    wynik: dict[str, Any] = {
        "solve": np.linalg.solve(a, b),
        "inv": np.linalg.inv(a),
        "a@b": a @ b,
        "b@a": b @ a,
        "a@a": a @ a,
        "dot": b @ b,
        "norm": np.linalg.norm(b),
        "lu": scipy.linalg.lu_solve(scipy.linalg.lu_factor(a), b),
        "splu": scipy.sparse.linalg.splu(rzadka).solve(b),
    }
    if not np.iscomplexobj(a):
        wynik["eigvals"] = np.linalg.eigvals(a)
        wynik["cond"] = np.linalg.cond(a)
    else:
        wynik["pinv"] = np.linalg.pinv(a)
    return wynik


@pytest.mark.parametrize("rozmiar", [8, 63, 151])
@pytest.mark.parametrize("typ", [np.float64, np.complex128])
def test_wyrownanie_z_alokatora_nie_zmienia_bitow_operacji_blas(
    rozmiar: int, typ: type[np.generic]
) -> None:
    """Historia procesu przesuwa adresy tablic tylko o wielokrotności 16 bajtów — żadna klasa
    operacji BLAS/LAPACK solverów nie zmienia wtedy ani jednego bitu (pomiar jąder Prescott,
    Haswell, SkylakeX: zero różnic; przesunięcie o 8 bajtów, możliwe wyłącznie dla wycinka
    tablicy, zmienia `dot` i macierz x wektor w jądrze Prescott — zależy od kształtu danych,
    nie od historii)."""
    los = np.random.default_rng(rozmiar)
    a = los.standard_normal((rozmiar, rozmiar)) + rozmiar * np.eye(rozmiar)
    b = los.standard_normal(rozmiar)
    if typ is np.complex128:
        a = a + 1j * los.standard_normal((rozmiar, rozmiar))
        b = b + 1j * los.standard_normal(rozmiar)
    bufor_a = np.empty(a.nbytes + 128, dtype=np.uint8)
    bufor_b = np.empty(b.nbytes + 128, dtype=np.uint8)
    przesuniecie_bazy = (-bufor_a.ctypes.data) % 64, (-bufor_b.ctypes.data) % 64
    wzorzec: dict[str, bytes] | None = None
    for przesuniecie in PRZESUNIECIA_ALOKATORA:
        wynik = _operacje(
            _pod_adresem(bufor_a, a, przesuniecie_bazy[0] + przesuniecie),
            _pod_adresem(bufor_b, b, przesuniecie_bazy[1] + przesuniecie),
        )
        bity = {klucz: np.asarray(wartosc).tobytes() for klucz, wartosc in wynik.items()}
        if wzorzec is None:
            wzorzec = bity
            continue
        rozne = sorted(k for k in bity if bity[k] != wzorzec[k])
        assert rozne == [], f"przesunięcie {przesuniecie} B zmienia bity: {rozne}"
