"""Artefakty GENERATED musza byc SPRAWDZALNE (karta X4, dlug z V12K-318 poz. 5).

Pliki `frontend/src/ui/sld/v2/station-rozdzielnia/companions/*.ts` niosa naglowek
„GENERATED — DO NOT EDIT BY HAND" z instrukcja regeneracji z solverow FROZEN,
ale do karty X4 ZADEN test nie porownywal ich z wyjsciem generatora. Deklaracja
byla honorowana wylacznie dyscyplina autora: reczna edycja albo zmiana solvera
rozjezdzaly artefakt z rzeczywistoscia bez jednego czerwonego testu — a te
liczby ida na ekran jako wielkosci zwarciowe i rozplywowe.

Test uruchamia TEN SAM tor renderowania, ktorego uzywa `--write`
(`render_companions` — predykat zapisu i porownania z JEDNEGO zrodla,
CLAUDE.md pkt 3) i porownuje wynik BAJTOWO z plikami w repo. Rozjazd = czerwony,
z komunikatem mowiacym jak zregenerowac.

Solvery FROZEN sa deterministyczne, a serializacja idzie przez
`json.dumps(..., indent=2, sort_keys=True)` — bajtowa rownosc jest wiec
wlasciwa postacia porownania (bez kanonizacji, ktora moglaby maskowac zmiany).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from application.reference_networks.station_archetype_substrate import (
    _companions_dir,
    render_companions,
)

# Wolniejszy pelny przebieg solverow po wszystkich archetypach — raz na modul.


@pytest.fixture(scope="module")
def wyrenderowane() -> dict[str, str]:
    return render_companions()


def test_kazdy_artefakt_generated_jest_bajtowo_rowny_generatorowi(
    wyrenderowane: dict[str, str],
) -> None:
    katalog = Path(_companions_dir())
    for nazwa, tresc in sorted(wyrenderowane.items()):
        plik = katalog / nazwa
        assert plik.exists(), f"artefakt {nazwa} nie istnieje — uruchom generator z --write"
        na_dysku = plik.read_text(encoding="utf-8")
        assert na_dysku == tresc, (
            f"artefakt {nazwa} ROZJECHANY z generatorem (reczna edycja albo zmiana "
            "solvera bez regeneracji). Zregeneruj: cd mv-design-pro/backend && "
            "poetry run python -m application.reference_networks."
            "station_archetype_substrate --write"
        )


def test_generator_pokrywa_wszystkie_artefakty_katalogu(wyrenderowane: dict[str, str]) -> None:
    """Zakres w DRUGA strone: plik w katalogu companions, ktorego generator nie
    zna, bylby recznym artefaktem podszywajacym sie pod GENERATED."""
    katalog = Path(_companions_dir())
    na_dysku = {p.name for p in katalog.glob("*.ts")}
    generowane = set(wyrenderowane)
    # Pliki typow sa pisane RECZNIE (definicje TS, nie liczby) i nie niosa
    # naglowka GENERATED — jedyne legalne wyjatki.
    reczne = {p.name for p in katalog.glob("*.ts") if "GENERATED" not in p.read_text("utf-8")}
    assert na_dysku - generowane == reczne
    assert generowane <= na_dysku


def test_rendering_jest_deterministyczny(wyrenderowane: dict[str, str]) -> None:
    """Dwa przebiegi w tym samym procesie daja identyczne bajty — warunek
    sensownosci porownania bajtowego (karta X4 §2.3)."""
    drugi = render_companions()
    assert drugi == wyrenderowane


def test_fixtura_sld_network_53_jest_bajtowo_rowna_generatorowi() -> None:
    """Ta sama klasa co companions: artefakt GENERATED z wlasnym generatorem
    uruchamialnym w CI (substrat lezy w backend/tests). Do karty X4 rozjazd byl
    niewykrywalny; zmierzone przy wdrozeniu: source_hash artefaktu wskazywal
    substrat sprzed zmian modelu."""
    from application.reference_networks.sld_network_model import (
        distill_sld_network,
        render_sld_network_fixture,
    )

    from tests.reference_networks.sld_substrate_52s import build_sld_substrate_52s

    env = build_sld_substrate_52s()
    model = distill_sld_network(env["enm"])
    model["source_hash"] = env.get("snapshot_hash", "")

    plik = Path(_companions_dir()).parent / "autolayout" / "network" / "sldNetwork53.ts"
    assert plik.exists()
    assert plik.read_text(encoding="utf-8") == render_sld_network_fixture(model), (
        "sldNetwork53.ts ROZJECHANY z substratem — zregeneruj: cd backend && "
        "poetry run python scripts/emit_sld_network_fixture.py"
    )
