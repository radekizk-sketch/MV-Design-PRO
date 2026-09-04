"""Test dymny (smoke) skryptu `scripts/benchmark_baseline.py` (karta PERF-0).

NIE jest bramka wydajnosci: zero asercji na czasy (mediana/p95 moga byc
dowolne — baseline mierzy, nie ocenia, wiec i ten test nie ocenia). Sprawdza
WYLACZNIE, ze skrypt konczy sie sukcesem i ze KAZDA pozycja macierzy budzetow
B1-B10 (`docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md` sekcja 1a) ma w wyniku
co najmniej jeden wpis — pomiar (mediana_ms nie jest None) ALBO NIEMIERZALNE
z niepustym powodem. Wpis NIEMIERZALNE bez powodu jest bledem tego testu:
pozycja bez pomiaru i bez uzasadnienia to pozycja pominieta po cichu, co
karta PERF-0 wprost zakazuje.

Uruchamia skrypt jako PODPROCES (tak jak byłby wywolany naprawde, z linii
polecen) na sieciach S WYLACZNIE (bez G00 — budowa ~15-20 s i bardzo wolne
zwarcia na 315 wezlach czynia siec M zbyt kosztowna na test jednostkowy;
pelny pomiar M/G00 jest zadaniem `benchmark_baseline.py`, nie tego testu),
z 1 powtorzeniem — szybki test funkcjonalny, nie pomiar.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]
SKRYPT = BACKEND_DIR / "scripts" / "benchmark_baseline.py"

#: Pozycje macierzy budzetow — sekcja 1a planu. Kazda MUSI miec wpis w wyniku.
POZYCJE_OCZEKIWANE = tuple(f"B{i}" for i in range(1, 11))


@pytest.mark.integration
def test_skrypt_istnieje() -> None:
    assert SKRYPT.is_file(), f"Brak skryptu baseline: {SKRYPT}"


@pytest.fixture(scope="module")
def wynik_biegu(tmp_path_factory: pytest.TempPathFactory) -> dict:
    """Jeden bieg skryptu (1 powtorzenie, sieci S) dla calego modulu testow —
    kosztowny (kilkanascie sekund realnych obliczen solvera), wiec bez sensu
    powtarzac per test."""
    katalog = tmp_path_factory.mktemp("perf-baseline-smoke")
    json_wyjscie = katalog / "performance_baseline.json"
    md_wyjscie = katalog / "PERFORMANCE_BASELINE.md"

    wynik = subprocess.run(
        [
            sys.executable,
            str(SKRYPT),
            "--powtorzenia",
            "1",
            "--sieci",
            "S",
            "--json-wyjscie",
            str(json_wyjscie),
            "--md-wyjscie",
            str(md_wyjscie),
        ],
        cwd=str(BACKEND_DIR),
        capture_output=True,
        text=True,
        timeout=300,
    )

    assert wynik.returncode == 0, (
        f"skrypt benchmark_baseline.py zakonczyl sie kodem {wynik.returncode}.\n"
        f"--- stdout ---\n{wynik.stdout}\n--- stderr ---\n{wynik.stderr}"
    )
    assert json_wyjscie.is_file(), f"Brak pliku JSON wyjsciowego: {json_wyjscie}"
    assert md_wyjscie.is_file(), f"Brak pliku Markdown wyjsciowego: {md_wyjscie}"

    dane = json.loads(json_wyjscie.read_text(encoding="utf-8"))
    dane["_md_tekst"] = md_wyjscie.read_text(encoding="utf-8")
    dane["_stdout"] = wynik.stdout
    return dane


def test_kazda_pozycja_b1_b10_ma_wpis(wynik_biegu: dict) -> None:
    """Pozycja bez pomiaru = pozycja nieodebrana (karta PERF-0) — zero wyjatkow."""
    pomiary = wynik_biegu["pomiary"]
    pozycje_obecne = {p["pozycja"] for p in pomiary}
    brakujace = [p for p in POZYCJE_OCZEKIWANE if p not in pozycje_obecne]
    assert not brakujace, (
        f"Pozycje bez ZADNEGO wpisu w wyniku: {brakujace}. "
        f"Pozycje obecne: {sorted(pozycje_obecne)}."
    )


def test_kazdy_wpis_jest_pomiarem_albo_niemierzalne_z_powodem(wynik_biegu: dict) -> None:
    """Kazdy wiersz: albo liczba (mediana_ms), albo NIEMIERZALNE z NIEPUSTYM powodem —
    nigdy oba None/puste naraz (uczciwosc: cisza jest zakazana)."""
    for pomiar in wynik_biegu["pomiary"]:
        etykieta = f"{pomiar['pozycja']} / {pomiar['siec']}"
        if pomiar["status"] == "NIEMIERZALNE":
            assert (
                pomiar["mediana_ms"] is None
            ), f"{etykieta}: NIEMIERZALNE, ale mediana_ms ustawiona"
            powod = pomiar.get("powod_niemierzalne")
            assert (
                powod and powod.strip()
            ), f"{etykieta}: status NIEMIERZALNE bez powodu — pozycja pominieta po cichu"
        else:
            assert pomiar["status"] in (
                "WEWNATRZ",
                "PRZEKROCZONY",
            ), f"{etykieta}: status nieznany: {pomiar['status']!r}"
            assert (
                pomiar["mediana_ms"] is not None
            ), f"{etykieta}: status {pomiar['status']} bez mediany"
            assert pomiar["p95_ms"] is not None, f"{etykieta}: status {pomiar['status']} bez p95"


def test_pozycje_strukturalnie_niemierzalne_maja_uzasadnienie(wynik_biegu: dict) -> None:
    """B5 (solver 4-przewodowy nN), B7 (projekcja SN) i B9 (renderer) sa dzis
    strukturalnie NIEMIERZALNE (karta PERF-0) — test pilnuje, ze powod jest
    NAZWANY (nie pusty placeholder), nie ze KIEDYS zostana zmierzone."""
    pomiary_po_pozycji: dict[str, list[dict]] = {}
    for pomiar in wynik_biegu["pomiary"]:
        pomiary_po_pozycji.setdefault(pomiar["pozycja"], []).append(pomiar)

    for pozycja in ("B5", "B7", "B9"):
        wpisy = pomiary_po_pozycji.get(pozycja, [])
        assert wpisy, f"Brak wpisu dla {pozycja}"
        assert all(w["status"] == "NIEMIERZALNE" for w in wpisy), (
            f"{pozycja}: oczekiwano wylacznie NIEMIERZALNE, dostano statusy "
            f"{[w['status'] for w in wpisy]}"
        )
        for w in wpisy:
            assert (
                len(w["powod_niemierzalne"]) > 20
            ), f"{pozycja}: powod NIEMIERZALNE podejrzanie krotki: {w['powod_niemierzalne']!r}"


def test_siec_g00_nie_byla_budowana(wynik_biegu: dict) -> None:
    """`--sieci S` musi wykluczyc siec M (G13/G00) — smoke test ma pozostac
    szybki; G00 (~15-20 s budowy + zwarcia liczone minutami) nalezy
    WYLACZNIE do pelnego biegu `benchmark_baseline.py`, nie do tego testu."""
    klucze_sieci = {s["klucz"] for s in wynik_biegu["sieci"]}
    assert not any(
        k.startswith("G00") or k.startswith("G13") for k in klucze_sieci
    ), f"Siec M zbudowana mimo --sieci S: {sorted(klucze_sieci)}"


def test_siec_l_jest_jawnie_niemierzalna(wynik_biegu: dict) -> None:
    siec_l = wynik_biegu.get("siec_l")
    assert siec_l is not None, "Brak klucza 'siec_l' w JSON — siec L musi byc zapisana jawnie"
    assert siec_l["status"] == "NIE_ISTNIEJE"
    assert siec_l["powod"] and len(siec_l["powod"]) > 20


def test_markdown_wspomina_wszystkie_pozycje(wynik_biegu: dict) -> None:
    tekst = wynik_biegu["_md_tekst"]
    assert tekst.strip(), "Plik Markdown jest pusty"
    for pozycja in POZYCJE_OCZEKIWANE:
        assert pozycja in tekst, f"Pozycja {pozycja} nie wystepuje w dokumencie Markdown"
    assert "NIEMIERZALNE" in tekst
