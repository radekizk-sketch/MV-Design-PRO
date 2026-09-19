#!/usr/bin/env python3
"""Testy straznika parytetu pol katalogu (karta KATALOG-NIEZMIENNIKI §5 p.2).

Sciezki czerwieni na SYNTETYCZNYCH plikach (tmp_path + podmiana stalych modulu),
bramka zieleni jednym wywolaniem na PRAWDZIWYM repozytorium. Dowod czerwieni jest
trojaki, bo straznik ma trzy rozne sciezki odrzucenia (pole gubione po cichu,
wyjatek, ktory przestal byc prawdziwy, pusty skan) — test sprawdzajacy jedna
uwiarygodnialby dwie pozostale bez dowodu.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import katalog_parytet_pol_guard as guard  # noqa: E402
import pytest  # noqa: E402

TYPY_FE = """
export interface CatalogType {
  id: string;
  name: string;
  manufacturer?: string;
}

export interface ConverterType extends CatalogType {
  kind: 'PV' | 'WIND' | 'BESS';
  un_kv: number;
  sn_mva: number;
  pmax_mw: number;
  k_sc?: number | null;
  grid_code?: string | null;
}
"""

TYPY_BACKENDU = """
from dataclasses import dataclass


@dataclass(frozen=True)
class PVInverterType:
    id: str
    name: str
    s_n_kva: float
    manufacturer: str | None = None
    k_sc: float | None = None
    grid_code: str | None = None
"""


def _api_ts(pola: str) -> str:
    return (
        "export async function fetchConverterTypes(): Promise<ConverterType[]> {\n"
        "  const pvConverters: ConverterType[] = pvTypes.flatMap((item) => {\n"
        "    const voltageKv = resolveConverterVoltageKv(item);\n"
        "    if (voltageKv === null) return [];\n"
        "    return [{\n"
        f"{pola}"
        "    }];\n"
        "  });\n"
        "}\n"
    )


POLA_PELNE = (
    "      id: item.id,\n"
    "      name: item.name,\n"
    "      manufacturer: item.manufacturer,\n"
    "      kind: 'PV',\n"
    "      un_kv: voltageKv,\n"
    "      sn_mva: item.s_n_kva / 1000,\n"
    "      pmax_mw: item.p_max_kw / 1000,\n"
    "      k_sc: item.k_sc ?? null,\n"
    "      grid_code: item.grid_code ?? null,\n"
)

POLA_BEZ_KSC = POLA_PELNE.replace("      k_sc: item.k_sc ?? null,\n", "")


@pytest.fixture
def drzewo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Podmien pliki zrodlowe straznika na syntetyczne (jedna rodzina, PV)."""

    def przygotuj(pola: str, nienoszone: dict[str, dict[str, str]] | None = None) -> None:
        (tmp_path / "api.ts").write_text(_api_ts(pola), encoding="utf-8")
        (tmp_path / "types.ts").write_text(TYPY_FE, encoding="utf-8")
        (tmp_path / "types.py").write_text(TYPY_BACKENDU, encoding="utf-8")
        monkeypatch.setattr(guard, "API_TS", tmp_path / "api.ts")
        monkeypatch.setattr(guard, "TYPES_TS", tmp_path / "types.ts")
        monkeypatch.setattr(guard, "TYPES_PY", tmp_path / "types.py")
        monkeypatch.setattr(guard, "MAPOWANIA", {"PV": ("pvConverters", "PVInverterType")})
        monkeypatch.setattr(guard, "NIENOSZONE", nienoszone or {"PV": {}})

    return przygotuj


def test_zielono_na_prawdziwym_repozytorium() -> None:
    assert guard.zbadaj() == []


def test_straznik_podprocesem_konczy_sie_zerem() -> None:
    wynik = subprocess.run(
        [sys.executable, str(REPO / "scripts" / "katalog_parytet_pol_guard.py")],
        capture_output=True,
        text=True,
        cwd=REPO,
    )
    assert wynik.returncode == 0, wynik.stdout + wynik.stderr
    assert "Parytet pol katalogu: OK" in wynik.stdout


def test_mapowanie_kompletne_jest_zielone(drzewo) -> None:
    drzewo(POLA_PELNE)
    assert guard.zbadaj() == []


def test_czerwien_pole_gubione_po_cichu(drzewo) -> None:
    """1/3: pole jest w kontrakcie backendu i w typie FE, a mapowanie je pomija."""
    drzewo(POLA_BEZ_KSC)
    naruszenia = guard.zbadaj()
    assert len(naruszenia) == 1, naruszenia
    assert "`k_sc`" in naruszenia[0]
    assert "gubione po cichu" in naruszenia[0]


def test_czerwien_wyjatek_ktory_przestal_byc_prawdziwy(drzewo) -> None:
    """2/3: pole na liscie nienoszonych, ktore kontrakt backendu JEDNAK niesie.

    To jest zapadka przeciw zwietrzalemu uzasadnieniu: lista wyjatkow bez tego
    sprawdzenia bylaby workiem na wszystko, ktorego nikt nigdy nie rewiduje.
    """
    drzewo(POLA_BEZ_KSC, nienoszone={"PV": {"k_sc": "rzekomo nie ma go w kontrakcie"}})
    naruszenia = guard.zbadaj()
    assert len(naruszenia) == 1, naruszenia
    assert "powod przestal byc prawdziwy" in naruszenia[0]


def test_czerwien_pusty_skan_mapowania(drzewo) -> None:
    """3/3: mapowanie bez ani jednego pola — straznik nie meldu je wtedy zieleni."""
    drzewo("      // brak przypisan\n")
    naruszenia = guard.zbadaj()
    assert len(naruszenia) == 1, naruszenia
    assert "PUSTY SKAN" in naruszenia[0]


def test_pole_spoza_kontraktu_backendu_nie_jest_wymagane(drzewo) -> None:
    """Predykat parami: wymagamy TYLKO tego, co backend potrafi podac.

    Pole obecne w typie FE, ale nieobecne w kontrakcie rodziny, nie moze byc
    zadane od mapowania — inaczej guard zmuszalby do fabrykowania wartosci.
    """
    typy_fe_z_nadmiarem = TYPY_FE.replace(
        "  grid_code?: string | null;\n",
        "  grid_code?: string | null;\n  e_kwh?: number;\n",
    )
    drzewo(POLA_PELNE)
    guard.TYPES_TS.write_text(typy_fe_z_nadmiarem, encoding="utf-8")
    assert guard.zbadaj() == []


def test_pola_wyliczane_sa_nazwane_jawnie() -> None:
    """Deklaracja „te pola sa wyliczane" ma test, nie zdanie w komentarzu."""
    assert guard.WYLICZANE == frozenset({"kind", "un_kv", "sn_mva", "pmax_mw"})


def test_kazdy_wyjatek_ma_niepusty_powod() -> None:
    for rodzaj, wyjatki in guard.NIENOSZONE.items():
        for pole, powod in wyjatki.items():
            assert powod.strip(), f"{rodzaj}.{pole}: wyjatek bez powodu"
