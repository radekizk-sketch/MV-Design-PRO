"""Przestrzeń katalogu odcinka POCHODNEGO z odcinka macierzystego — jedno źródło prawdy.

Klasa (karta JEDEN-KLUCZ-KATALOGU, decyzja architekta 3): odcinek, który powstaje z odcinka
istniejącego, bierze tę samą pozycję katalogu i MUSI ją wskazywać w tej samej przestrzeni.
Inwentarz dróg, które tworzą odcinek pochodny z ponowną materializacją katalogu:

* połówki podziału przy wcięciu stacji (``insert_station_on_segment_sn``);
* pierwszy odcinek odgałęzienia szablonu stacji abonenckiej
  (``application/station_templates/apply.py`` — ``start_branch_segment_sn`` z typem odcinka
  magistrali).

Drogi podziału bez ponownej materializacji (punkt rozgałęzienia, łącznik sekcyjny) kopiują
przestrzeń polem modelu (``_copy_split_segment_fields``) — przypięte niżej tą samą macierzą.

Dawniej obie drogi materializujące brały PIERWSZĄ przestrzeń typu odcinka (``KABEL_SN`` /
``LINIA_SN``), więc przewód linii 110 kV (``PRZEWOD_LINII_WN``) był szukany w grupie linii SN.

Iloczyn cech: przestrzeń odcinka macierzystego {KABEL_SN, LINIA_SN, PRZEWOD_LINII_WN}
× droga {wcięcie stacji, odgałęzienie szablonu, punkt rozgałęzienia}; funkcja źródła prawdy:
typ odcinka × przestrzeń własna {zgodna, druga zgodna, spoza typu, brak}.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.wiazanie_katalogowe import przestrzenie_odcinka_pochodnego, przestrzenie_odcinka_sn

from tests.application.station_templates.test_apply_odgalezienie import (
    SZABLON_KLASY_A,
    SZABLON_KLASY_B,
    _binding,
    _pusty_enm,
    _wykonaj,
    _zastosuj_szablon,
)

#: (przestrzeń, pozycja, rodzaj odcinka w ładunku operacji toru, typ gałęzi modelu)
MEDIA = [
    ("KABEL_SN", "cable-tfk-yakxs-3x120", "KABEL", "cable"),
    ("LINIA_SN", "line-base-al-st-70", "LINIA", "line_overhead"),
    ("PRZEWOD_LINII_WN", "przewod-wn-243-al1-39-st1a", "LINIA", "line_overhead"),
]


def _magistrala(przestrzen: str, pozycja: str, rodzaj: str) -> tuple[dict[str, Any], str]:
    enm = _wykonaj(
        _pusty_enm(),
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_binding": _binding("ZRODLO_SN", "src-gpz-15kv-250mva-rx010"),
        },
    )["snapshot"]
    for i in range(2):
        enm = _wykonaj(
            enm,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": rodzaj,
                    "dlugosc_m": 800 + 100 * i,
                    "name": f"Odcinek {i + 1}",
                    "catalog_binding": _binding(przestrzen, pozycja),
                }
            },
        )["snapshot"]
    return enm, enm["corridors"][0]["ordered_segment_refs"][-1]


def _galaz(enm: dict[str, Any], ref: str) -> dict[str, Any]:
    return next(b for b in enm["branches"] if b["ref_id"] == ref)


@pytest.mark.parametrize(("przestrzen", "pozycja", "rodzaj", "typ"), MEDIA)
def test_magistrala_niesie_przestrzen_wskazana(
    przestrzen: str, pozycja: str, rodzaj: str, typ: str
) -> None:
    """Warunek wstępny macierzy: odcinek macierzysty leży w przestrzeni z wiązania."""
    enm, ref = _magistrala(przestrzen, pozycja, rodzaj)
    odcinek = _galaz(enm, ref)
    assert (odcinek["type"], odcinek["catalog_namespace"], odcinek["catalog_ref"]) == (
        typ,
        przestrzen,
        pozycja,
    )


@pytest.mark.parametrize(("przestrzen", "pozycja", "rodzaj", "typ"), MEDIA)
def test_polowki_wciecia_stacji_w_przestrzeni_odcinka_macierzystego(
    przestrzen: str, pozycja: str, rodzaj: str, typ: str
) -> None:
    enm, ref = _magistrala(przestrzen, pozycja, rodzaj)
    wynik = _zastosuj_szablon(enm, SZABLON_KLASY_A, ref)
    polowki = [
        b
        for b in wynik["enm"]["branches"]
        if b.get("type") == typ and b["ref_id"] != ref and b.get("catalog_ref") == pozycja
    ]
    # Dwa odcinki magistrali bez dzielonego + dwie połówki dzielonego.
    assert len(polowki) >= 2
    assert {b["catalog_namespace"] for b in polowki} == {przestrzen}
    assert all(
        (b.get("materialized_params") or {}).get("catalog_item_id") == pozycja for b in polowki
    )


@pytest.mark.parametrize(("przestrzen", "pozycja", "rodzaj", "typ"), MEDIA)
def test_odgalezienie_szablonu_w_przestrzeni_odcinka_macierzystego(
    przestrzen: str, pozycja: str, rodzaj: str, typ: str
) -> None:
    enm, ref = _magistrala(przestrzen, pozycja, rodzaj)
    wynik = _zastosuj_szablon(enm, SZABLON_KLASY_B, ref)
    odcinek = next(b for b in wynik["enm"]["branches"] if b["ref_id"].endswith("/branch_segment"))
    assert (odcinek["type"], odcinek["catalog_namespace"], odcinek["catalog_ref"]) == (
        typ,
        przestrzen,
        pozycja,
    )
    # Połówki magistrali za punktem rozgałęzienia (podział bez ponownej materializacji).
    polowki = [
        b
        for b in wynik["enm"]["branches"]
        if b.get("type") == typ and b.get("catalog_ref") == pozycja
    ]
    assert {b["catalog_namespace"] for b in polowki} == {przestrzen}


@pytest.mark.parametrize("typ", ["cable", "line_overhead"])
@pytest.mark.parametrize("wlasna", ["KABEL_SN", "LINIA_SN", "PRZEWOD_LINII_WN", "KABEL_NN", None])
def test_funkcja_zrodla_prawdy_iloczyn_typ_x_przestrzen_wlasna(
    typ: str, wlasna: str | None
) -> None:
    dozwolone = przestrzenie_odcinka_sn(typ)
    wynik = przestrzenie_odcinka_pochodnego({"type": typ, "catalog_namespace": wlasna})
    # Zbiór dozwolonych bez zmian — funkcja tylko wybiera przestrzeń domyślną.
    assert sorted(wynik) == sorted(dozwolone)
    if wlasna in dozwolone:
        assert wynik[0] == wlasna
    else:
        assert wynik == dozwolone
