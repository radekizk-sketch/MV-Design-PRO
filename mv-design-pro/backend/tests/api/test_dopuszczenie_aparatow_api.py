"""Pola filtru pickerów aparatury SN w API katalogu — ta sama reguła co strażnik operacji.

PO CO. Picker frontu (`ui/catalog/dopuszczenieNowychPol`) nie zna reguły gazu fluorowanego: czyta
`dopuszczony_do_nowych_pol` i `powod_blokady_nowych_pol_pl` z obu przestrzeni katalogu łączników
SN — aparatów pola (`/mv-apparatus-types`) i łączników gałęzi (`/switch-equipment-types`, picker
typu łącznika w siatce właściwości). Strażnik operacji domenowej odmawia zapisu funkcją
`gazy_fluorowane.odmowa_gazu_fluorowanego_pl` dla obiektu projektowanego. Test przypina, że:

1. KAŻDA pozycja obu przestrzeni niesie pola filtru, równe regule liścia dla obiektu
   projektowanego (iloczyn: przestrzeń × medium pozycji);
2. obie przestrzenie mówią to samo o tej samej pozycji (ten sam identyfikator → to samo
   dopuszczenie i ten sam powód) — strażnik operacji czyta gaz z przestrzeni aparatów także dla
   łącznika gałęzi, więc rozjazd przestrzeni byłby furtką;
3. w każdej przestrzeni są pozycje obu rodzajów (inaczej punkt 1 nie rozróżnia gałęzi reguły).
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from network_model.catalog.gazy_fluorowane import (
    AKCJA_NAPRAWCZA_GAZU_FLUOROWANEGO_PL,
    czy_medium_z_gazem_fluorowanym,
    odmowa_gazu_fluorowanego_pl,
)

PRZESTRZENIE = ("/api/catalog/mv-apparatus-types", "/api/catalog/switch-equipment-types")


@pytest.fixture(scope="module")
def odpowiedzi(tmp_path_factory: pytest.TempPathFactory) -> Iterator[dict[str, list[dict]]]:
    baza: Path = tmp_path_factory.mktemp("dopuszczenie-aparatow") / "katalog.db"
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("DATABASE_URL", f"sqlite+pysqlite:///{baza}")
        from api.main import app

        with TestClient(app) as klient:
            wynik = {}
            for sciezka in PRZESTRZENIE:
                odp = klient.get(sciezka)
                assert odp.status_code == 200, sciezka
                wynik[sciezka] = odp.json()
            yield wynik


@pytest.mark.parametrize("sciezka", PRZESTRZENIE)
def test_pola_filtru_rowne_regule_dla_obiektu_projektowanego(
    odpowiedzi: dict[str, list[dict]], sciezka: str
) -> None:
    pozycje = odpowiedzi[sciezka]
    assert pozycje
    for p in pozycje:
        gaz = czy_medium_z_gazem_fluorowanym(p.get("medium"))
        powod = odmowa_gazu_fluorowanego_pl(
            f"Aparat {p['name']}", gaz_fluorowany=gaz, stan_obiektu="PROJEKTOWANY"
        )
        assert p["gaz_fluorowany"] is gaz, p["id"]
        assert p["dopuszczony_do_nowych_pol"] is (powod is None), p["id"]
        assert p["powod_blokady_nowych_pol_pl"] == powod, p["id"]
        if powod is not None:
            assert AKCJA_NAPRAWCZA_GAZU_FLUOROWANEGO_PL in powod
            assert "2024/573" in powod


@pytest.mark.parametrize("sciezka", PRZESTRZENIE)
def test_przestrzen_ma_pozycje_obu_rodzajow(
    odpowiedzi: dict[str, list[dict]], sciezka: str
) -> None:
    rodzaje = {p["dopuszczony_do_nowych_pol"] for p in odpowiedzi[sciezka]}
    assert rodzaje == {True, False}


def test_obie_przestrzenie_mowia_to_samo_o_tej_samej_pozycji(
    odpowiedzi: dict[str, list[dict]],
) -> None:
    def klucz(p: dict) -> tuple:
        return (p.get("medium"), p["gaz_fluorowany"], p["dopuszczony_do_nowych_pol"])

    aparaty = {p["id"]: klucz(p) for p in odpowiedzi[PRZESTRZENIE[0]]}
    laczniki = {p["id"]: klucz(p) for p in odpowiedzi[PRZESTRZENIE[1]]}
    assert set(aparaty) == set(laczniki)
    rozjazdy = sorted(ref for ref in aparaty if aparaty[ref] != laczniki[ref])
    assert not rozjazdy, rozjazdy
