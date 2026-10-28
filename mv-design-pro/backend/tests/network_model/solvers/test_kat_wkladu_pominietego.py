"""Karta KAT-WKLADU-POMINIETEGO: kąt fazora wkładu pominiętego nie jest określony.

Wkład o |I| < `PROG_WKLADU_POMIJALNEGO_A` (1e-6 A) jest resztą arytmetyki zmiennoprzecinkowej:
jego kąt zależy od kolejności sumowania jądra BLAS (pomiar: ten sam wpis zestawienia
o |I| ≈ 1e-13 A ma kąt 166,0° na jednym jądrze OpenBLAS i −177,0° na drugim). Publikowanie
tej liczby naruszało zasadę zero fabrykacji i WHITE BOX, a dawne wykluczenie pola z porównania
fixtur maskowało defekt produktu. Od tej karty rdzeń podaje ``kat_deg`` = ``None`` dla KAŻDEGO
wkładu pominiętego — rozstrzyga ten sam predykat `jest_wkladem_pominietym`, który odkłada
wpis z listy wkładów — a wyjaśnienie `PRZYCZYNA_KATA_NIEOKRESLONEGO` stoi w notatce kroku
śladu i w polu ``przyczyna`` wpisu wkładu źródła.

ILOCZYN CECH: {wkład pominięty, wkład publikowany} × {zero, szum, próg − ulp, próg, próg + ulp,
prąd duży} × {fazor w czterech ćwiartkach} na funkcji kąta; {wpis gałęziowy (oba tory: sieć
zastępcza i falownik), wpis źródła tuż pod i nad progiem} × {1 wątek BLAS, 4 wątki BLAS
w otoczeniu} na pełnym biegu rdzenia w osobnym procesie — ten sam wynik bit w bit i kąt
``None`` dokładnie dla wkładów pominiętych. Iloczyn {próg ± ulp} × {tor} × {rodzaj zwarcia}
na budowniczych rdzenia: `test_prog_wkladu_pominietego.py::test_wartosci_graniczne_iloczyn_cech`.

WSTRZYKNIĘCIE (meldunek karty): przywrócenie kąta fazora we wpisie zestawienia albo kąta
wkładu źródła pod progiem czerwieni ten moduł oraz pin fixtur
`tests/ci/test_fixtury_harnessu.py::test_fixtury_nie_niosa_kata_wkladu_pominietego`.
"""

from __future__ import annotations

import cmath
import json
import math
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import pytest
from network_model.solvers.short_circuit_contributions import (
    OPIS_PROGU_WKLADU_POMIJALNEGO,
    PROG_WKLADU_POMIJALNEGO_A,
    PRZYCZYNA_KATA_NIEOKRESLONEGO,
    jest_wkladem_pominietym,
    kat_fazora_wkladu_deg,
)

PROG = PROG_WKLADU_POMIJALNEGO_A
KATALOG_BACKENDU = Path(__file__).resolve().parents[3]

#: Prąd wkładu [A] → czy wkład jest pominięty (próg ± ulp z `math.nextafter`).
PRADY: dict[str, tuple[float, bool]] = {
    "zero": (0.0, True),
    "szum": (1e-14, True),
    "prog_minus_ulp": (math.nextafter(PROG, 0.0), True),
    "prog": (PROG, False),
    "prog_plus_ulp": (math.nextafter(PROG, math.inf), False),
    "duzy": (1.2e4, False),
}
FAZORY = (complex(1.0, 1.0), complex(-1.0, 0.5), complex(-0.25, -2.0), complex(3.0, -4.0))
LICZBY_WATKOW = (1, 4)


@pytest.mark.parametrize("fazor", FAZORY, ids=lambda f: f"{f.real:+}{f.imag:+}j")
@pytest.mark.parametrize("prad", list(PRADY))
def test_kat_fazora_wkladu_rozstrzyga_jeden_predykat(prad: str, fazor: complex) -> None:
    prad_a, pominiety = PRADY[prad]
    kat = kat_fazora_wkladu_deg(prad_a, fazor)
    assert jest_wkladem_pominietym(prad_a) is pominiety
    assert (kat is None) is pominiety
    if not pominiety:
        assert kat == math.degrees(cmath.phase(fazor))


@pytest.mark.parametrize("prad_a", [PROG, 1.2e4])
def test_fazor_zerowy_wkladu_publikowanego_nie_ma_kata(prad_a: float) -> None:
    assert kat_fazora_wkladu_deg(prad_a, 0j) is None


def test_przyczyna_nazywa_prog_z_jedynej_definicji() -> None:
    assert OPIS_PROGU_WKLADU_POMIJALNEGO in PRZYCZYNA_KATA_NIEOKRESLONEGO
    assert PRZYCZYNA_KATA_NIEOKRESLONEGO.startswith("kąt fazora nie jest określony poniżej progu")


#: Bieg rdzenia w świeżym procesie: (1) bieg kanoniczny sieci z wkładami gałęziowymi
#: pominiętymi w obu torach (``in_run``, cztery rodzaje zwarcia); (2) wkład źródła Q2 sieci
#: dwuwęzłowej tuż pod progiem (5e-7 A) i nad progiem (2e-6 A).
_SKRYPT = r"""
import json
from enm.store import set_enm
from tests.network_model.solvers.test_wklad_zrodla import (
    Z_L, Z_Q1, _krok, _licz, _siec_dwuwezlowa, _z_q2_dla_wkladu,
)
from tests.utils.biegi import run_short_circuit_now
from tests.utils.siec_wkladow_pominietych import siec_wkladow_pominietych

wynik = {"galeziowe": {}, "zrodla": {}}
for rodzaj in ("3F", "2F", "2FG", "1F"):
    case_id = "00000000-0000-4000-8000-00000000000" + str(len(wynik["galeziowe"]) + 1)
    set_enm(case_id, siec_wkladow_pominietych())
    bieg = run_short_circuit_now(
        case_id=case_id,
        klucz_twin=case_id,
        options={"fault_type": rodzaj, "branch_contributions_mode": "in_run"},
    )
    nazwy = {k: v["name"] for k, v in bieg.raw_result["graph"]["nodes"].items()}
    wynik["galeziowe"][rodzaj] = {
        nazwy[p["fault_node_id"]]: {
            "pominiete": p.get("wklady_pominiete") or [],
            "kroki": [k for k in p["branch_flow_trace"] if k["key"] == "wklady_pominiete"],
        }
        for p in bieg.raw_result["results"]
    }
for cel_a in (5e-7, 2e-6):
    licz = _licz(_siec_dwuwezlowa(Z_Q1, _z_q2_dla_wkladu(cel_a), Z_L), "3F", "A", 1.1)
    (q2,) = (w for w in licz.wklady_zrodel if w.source_id == "Q2")
    krok = _krok(licz, "wklad_zrodla_Q2")
    wynik["zrodla"][repr(cel_a)] = {
        "wpis": q2.to_dict(),
        "krok_kat_deg": krok["result"]["kat_deg"],
        "krok_i_a": krok["result"]["i_a"],
        "krok_notes": krok["notes"],
    }
print(json.dumps(wynik, sort_keys=True, default=repr))
"""


def _bieg_w_procesie(liczba_watkow: int, katalog: Path) -> dict[str, Any]:
    """Bieg w OSOBNYM procesie z zadaną liczbą wątków BLAS w otoczeniu i własnymi magazynami."""
    katalog.mkdir(parents=True)
    srodowisko = dict(os.environ)
    srodowisko["PYTHONPATH"] = os.pathsep.join(p for p in sys.path if p)
    for zmienna in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
        srodowisko[zmienna] = str(liczba_watkow)
    for zmienna in ("ENM_STORE_DIR", "STATION_USER_TEMPLATES_DIR", "CLOUD_BACKUP_BUCKET"):
        (katalog / zmienna).mkdir()
        srodowisko[zmienna] = str(katalog / zmienna)
        srodowisko.pop(zmienna + "_PYTEST_PID", None)
    srodowisko["DATABASE_URL"] = f"sqlite+pysqlite:///{katalog / 'przebiegi.db'}"
    srodowisko.pop("DATABASE_URL_PYTEST_PID", None)
    proces = subprocess.run(
        [sys.executable, "-c", _SKRYPT],
        cwd=KATALOG_BACKENDU,
        env=srodowisko,
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
    )
    assert proces.returncode == 0, proces.stderr[-4000:]
    wynik: dict[str, Any] = json.loads(proces.stdout)
    return wynik


def test_bieg_rdzenia_bez_kata_wkladu_pominietego_przy_1_i_4_watkach(tmp_path: Path) -> None:
    with ThreadPoolExecutor(max_workers=2) as pula:
        wyniki = dict(
            zip(
                LICZBY_WATKOW,
                pula.map(lambda n: _bieg_w_procesie(n, tmp_path / f"watki_{n}"), LICZBY_WATKOW),
                strict=True,
            )
        )
    # Ten sam wynik bit w bit niezależnie od liczby wątków w otoczeniu.
    assert wyniki[1] == wyniki[4]

    for liczba_watkow, wynik in wyniki.items():
        # Wpisy gałęziowe: oba tory, każdy rodzaj zwarcia — kąt nieokreślony, wyjaśnienie
        # w notatce kroku; zestawienie niepuste w obu torach (inaczej iloczyn byłby pusty).
        tory: set[str] = set()
        for rodzaj, punkty in wynik["galeziowe"].items():
            for punkt, dane in punkty.items():
                pominiete = dane["pominiete"]
                tory |= {w["tor"] for w in pominiete}
                assert [w["kat_deg"] for w in pominiete] == [None] * len(pominiete), (
                    liczba_watkow,
                    rodzaj,
                    punkt,
                )
                assert all(w["i_a"] < PROG for w in pominiete)
                assert len(dane["kroki"]) == (1 if pominiete else 0)
                for krok in dane["kroki"]:
                    assert PRZYCZYNA_KATA_NIEOKRESLONEGO in krok["notes"]
                    assert not [k for k in krok["result"] if k.startswith("suma_fazorowa")]
        assert tory == {"thevenin", "falownik"}, tory

        # Wkład źródła: pod progiem kąt None (wpis i krok) z przyczyną, nad progiem liczba.
        pod, nad = wynik["zrodla"][repr(5e-7)], wynik["zrodla"][repr(2e-6)]
        assert jest_wkladem_pominietym(pod["krok_i_a"])
        assert not jest_wkladem_pominietym(nad["krok_i_a"])
        assert (pod["wpis"]["klasa"], pod["wpis"]["kat_deg"], pod["krok_kat_deg"]) == (
            "POMINIETY",
            None,
            None,
        )
        assert PRZYCZYNA_KATA_NIEOKRESLONEGO in pod["wpis"]["przyczyna"]
        assert PRZYCZYNA_KATA_NIEOKRESLONEGO in pod["krok_notes"]
        assert nad["wpis"]["klasa"] == "WKLAD"
        assert isinstance(nad["wpis"]["kat_deg"], float)
        assert nad["krok_kat_deg"] == nad["wpis"]["kat_deg"]
