"""Fikstury substratu SLD 52 stacji sa BAJTOWO rowne generatorowi (karta SLD-SUBSTRAT).

Kontrakty SLD v2/v3 czytaja ``sldSubstrate52s.{enm,powerflow,powerflow.maintenance}.json``
(fikstura Vitest i sciezka harnessu ``public/test-fixtures``). Do tej karty zaden test nie
porownywal tych plikow z generatorem: ostatnia regeneracja (2026-09-05) wyprzedzila zmiane
ziarna identyfikatorow odcinkow (CV-4.3 K1), polskie znaki w nazwach (PL-ZNAKI) i nowe pola
modelu — kontrakty SLD przechodzily na danych, ktorych produkt juz nie wytwarzal.

Ta sama technika co ``test_companions_generated.py``: generator w procesie testu
(``render_fikstur_substratu`` — jeden tor dla ``--write`` i testu), porownanie BAJTOWE,
komunikat z komenda regeneracji. Porownanie bajtowe jest przenosne miedzy maszynami, bo
liczby przechodza regule ``zapis_fikstur`` (rozplyw niesie moc czynna z 6 miejscami
po przecinku z towarzysza, ENM — wartosci katalogowe i ich iloczyny).
"""

from __future__ import annotations

import json

import pytest

from tests.golden.zapis_fikstur import zaokraglij_liczby
from tests.reference_networks.sld_substrate_fixtures import (
    FRONTEND,
    KATALOGI_FIKSTUR,
    KOMENDA_REGENERACJI,
    render_fikstur_substratu,
)

_PLIKI = (
    "sldSubstrate52s.enm.json",
    "sldSubstrate52s.powerflow.json",
    "sldSubstrate52s.powerflow.maintenance.json",
)


@pytest.fixture(scope="module")
def wyrenderowane() -> dict[str, str]:
    return render_fikstur_substratu()


def test_kazda_fikstura_substratu_jest_bajtowo_rowna_generatorowi(
    wyrenderowane: dict[str, str],
) -> None:
    rozjechane = [
        sciezka
        for sciezka, tresc in sorted(wyrenderowane.items())
        if not (FRONTEND / sciezka).exists()
        or (FRONTEND / sciezka).read_text(encoding="utf-8") != tresc
    ]
    assert not rozjechane, (
        f"fikstury substratu ROZJECHANE z generatorem: {rozjechane}. "
        f"Zregeneruj: {KOMENDA_REGENERACJI}"
    )


def test_generator_pokrywa_obie_lokalizacje_kazdego_pliku(
    wyrenderowane: dict[str, str],
) -> None:
    """Zakres w druga strone: kazdy plik substratu w kazdej lokalizacji ma generator,
    a plik ``sldSubstrate52s.*`` spoza generatora bylby recznym artefaktem."""
    oczekiwane = {f"{k}/{p}" for k in KATALOGI_FIKSTUR for p in _PLIKI}
    assert set(wyrenderowane) == oczekiwane
    na_dysku = {
        f"{k}/{p.name}" for k in KATALOGI_FIKSTUR for p in (FRONTEND / k).glob("sldSubstrate52s*")
    }
    assert na_dysku == oczekiwane


def test_render_jest_deterministyczny(wyrenderowane: dict[str, str]) -> None:
    """Dwa przebiegi = te same bajty (warunek sensownosci porownania bajtowego)."""
    assert render_fikstur_substratu() == wyrenderowane


def test_fikstury_substratu_spelniaja_regule_zapisu_liczb(
    wyrenderowane: dict[str, str],
) -> None:
    """Zapis jest punktem stalym reguly: ponowne zaokraglenie nie zmienia zadnej liczby."""
    for sciezka, tresc in wyrenderowane.items():
        dane = json.loads(tresc)
        assert zaokraglij_liczby(dane) == dane, sciezka


def test_towarzysze_rozplywu_wiaza_sie_z_odciskiem_fikstury_enm(
    wyrenderowane: dict[str, str],
) -> None:
    """Odcisk w naglowku ENM = odcisk w ``_meta`` = ``enm_hash`` towarzysza stanu normalnego
    (towarzysz konserwacji niesie odcisk migawki scenariusza — inny model z definicji)."""
    katalog = KATALOGI_FIKSTUR[0]
    enm = json.loads(wyrenderowane[f"{katalog}/sldSubstrate52s.enm.json"])
    normalny = json.loads(wyrenderowane[f"{katalog}/sldSubstrate52s.powerflow.json"])
    odcisk = enm["enm"]["header"]["hash_sha256"]
    assert enm["_meta"]["builder_snapshot_hash"] == odcisk
    assert normalny["enm_hash"] == odcisk
