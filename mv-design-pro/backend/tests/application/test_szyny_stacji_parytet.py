"""Plik parytetu szyn stacji jest BAJTOWO równy generatorowi (karta SZYNY-STACJI-LUSTRO).

Generator ``tests/reference_networks/szyny_stacji_parytet.py`` liczy ``enm.tor_pola.szyny_stacji``
na każdym modelu ENM z fikstur generowanych; test vitest ``szynyStacji.parytet.test.ts``
porównuje z tym plikiem lustro frontu. Bez tego testu plik mógłby zestarzeć się względem
backendu i parytet frontu byłby parytetem z przeszłością.
"""

from __future__ import annotations

import json

from enm.tor_pola import szyny_stacji

from tests.reference_networks.szyny_stacji_parytet import (
    FRONTEND,
    KATALOGI,
    KOMENDA_REGENERACJI,
    WYJSCIE,
    oczekiwane_szyny_stacji,
    render_parytetu,
)


def test_plik_parytetu_jest_bajtowo_rowny_generatorowi() -> None:
    plik = FRONTEND / WYJSCIE
    assert plik.exists(), f"brak {WYJSCIE}. {KOMENDA_REGENERACJI}"
    assert (
        plik.read_text(encoding="utf-8") == render_parytetu()
    ), f"{WYJSCIE} ROZJECHANY z generatorem. {KOMENDA_REGENERACJI}"


def test_generator_jest_deterministyczny() -> None:
    assert render_parytetu() == render_parytetu()


def test_parytet_obejmuje_substrat_fikstury_enm_sld_i_harness() -> None:
    """Zakres z karty: substrat 52 stacji, fikstury ENM SLD i harness — każdy niepusty."""
    pliki = oczekiwane_szyny_stacji()["pliki"]
    substrat = pliki["src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json"]["/enm"]
    assert len(substrat) >= 52
    assert any(p.startswith("src/ui/sld/v3/scene/__tests__/fixtures/") for p in pliki)
    assert any(p.startswith("src/ui/sld/v3/canvas/__tests__/fixtures/") for p in pliki)
    assert any(p.startswith("src/harness-fixtures/generated/") for p in pliki)
    assert all(k in KATALOGI for k in {p.rsplit("/", 1)[0] for p in pliki})


def test_parytet_zawiera_wszystkie_trzy_skladniki_zbioru() -> None:
    """Plik ćwiczy każdą część reguły — inaczej iniekcja w lustrze frontu nie miałaby czego
    wykryć: szyny główne, WŁASNE zaciski pól SN i końce aparatów pól nN (spoza bus_refs)."""
    zaciski = aparaty = 0
    for sciezka, modele in oczekiwane_szyny_stacji()["pliki"].items():
        dane = json.loads((FRONTEND / sciezka).read_text(encoding="utf-8"))
        for wskaznik in modele:
            model = dane
            for czesc in [c for c in wskaznik.split("/") if c]:
                model = model[int(czesc)] if isinstance(model, list) else model[czesc]
            for stacja in model["substations"]:
                glowne = set(stacja.get("bus_refs") or [])
                bez_nn = szyny_stacji(
                    {**stacja, "meta": {**(stacja.get("meta") or {}), "nn_field_specs": []}},
                    model["branches"],
                )
                pelne = szyny_stacji(stacja, model["branches"])
                zaciski += len(bez_nn - glowne)
                aparaty += len(pelne - bez_nn)
    assert zaciski > 0
    assert aparaty > 0
