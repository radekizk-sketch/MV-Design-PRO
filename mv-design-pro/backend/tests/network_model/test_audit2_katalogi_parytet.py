"""Parytet katalogow audytu 2: BACKEND (autorytet) vs MIRROR WE FRONTENDZIE.

PO CO TEN PLIK (karta K-Q, 2026-08-14). Katalogi audytu 2 zyja w dwoch miejscach:
`backend/src/network_model/catalog/audit2_catalogs.py` (autorytet — z niego czyta
`/api/v1/catalog/audit2`) oraz `frontend/src/ui/network-build/station-der/
catalogs.ts` (mirror, z ktorego korzystaja kreatory zanim odpowie backend).
Dwie kopie tej samej listy to dwa zrodla prawdy, a wiec przyszly rozjazd —
i wlasnie tak powstal dlug, ktory zamykaja karty K-O i K-Q: front wyczyszczono
z fabrykacji, a backend niosl je dalej i serwowal przez API.

CZEGO PILNUJE TEN TEST:

1. TE SAME POZYCJE. Zbior identyfikatorow w mirrorze frontu jest identyczny ze
   zbiorem w backendzie — dla kazdego z katalogow lustrzanych. Pozycja dolozona
   po jednej stronie (albo usunieta tylko po jednej) zapala test.
2. ZERO POL BEZ PROWENIENCJI. Nazwy pol usunietych w tej karcie nie moga wrocic
   ANI do backendu, ANI do frontu — lista jest ZAMKNIETA i przypieta tutaj
   (deklaracja bez testu = falszywa pewnosc).
3. ZERO CUDZEJ TOZSAMOSCI. Do pozycji tych katalogow nie wraca imie producenta
   ani operatora doklejone do wlasnych liczb.

Test czyta plik frontu jako TEKST (nie uruchamia TypeScriptu) — to swiadomy
wybor: parytet ma dzialac w zwyklym biegu pytest, bez node'a w petli.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from network_model.catalog.audit2_catalogs import (
    BESS_OPERATION_MODE_CATALOG,
    HV_FUSE_CATALOG,
    MV_NEUTRAL_GROUNDING_CATALOG,
    TAP_CHANGER_CATALOG,
)

_FRONT_CATALOGS_TS = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "src"
    / "ui"
    / "network-build"
    / "station-der"
    / "catalogs.ts"
)
_FRONT_PROTECTION_CATALOGS_TS = _FRONT_CATALOGS_TS.with_name("protection-catalogs.ts")


def _front_source(path: Path) -> str:
    if not path.is_file():  # pragma: no cover - zabezpieczenie przed przeniesieniem pliku
        pytest.fail(f"Brak mirrora frontendu pod {path} — parytet nie ma czego porownac.")
    return path.read_text(encoding="utf-8")


def _ids_in_block(source: str, const_name: str) -> set[str]:
    """Identyfikatory pozycji w tablicy `export const <const_name> = Object.freeze([...])`."""
    start = source.index(f"export const {const_name}")
    tail = source[start:]
    end = tail.index("]);")
    block = tail[:end]
    return set(re.findall(r"^\s*id: '([^']+)'", block, flags=re.MULTILINE))


#: Pola USUNIETE w karcie K-Q — lista ZAMKNIETA. Kazde ponowne wystapienie
#: (w backendzie albo w mirrorze) jest naruszeniem tej karty, nie rozszerzeniem.
POLA_BEZ_PROWENIENCJI_ZAKAZANE = (
    # katalog uziemienia SN (K-O na froncie, K-Q w backendzie)
    "typical_ik1_a_range",
    "typical_ik1_a_min",
    "typical_ik1_a_max",
    "typical_operators_pl",
    # wkladki topikowe SN — dane wyrobu i pasmo t-I bez karty producenta
    "i_min_breaking_a",
    "i_max_breaking_ka",
    "i2t_total_a2s",
    "pre_arcing_time_at_6in_ms",
    "total_clearing_time_at_6in_ms",
    # przelaczniki zaczepow — dane eksploatacyjne wyrobu
    "switching_time_s",
    "operations_before_maintenance_thousand",
    # tryby pracy magazynu — nastawy i wymagania bez zrodla
    "reserved_capacity_percent",
    "max_duration_h",
    "required_for_nc_rfg_modules",
    # falowniki / turbiny / baterie — dane karty katalogowej bez karty
    "fault_current_capability_pu",
    "transient_short_circuit_pu",
    "cycle_life",
)

#: Nazwy, ktorych nie wolno doklejac do wlasnych liczb (cudza tozsamosc).
IMIONA_ZAKAZANE_W_KATALOGACH_AUDYTU2 = (
    "Schneider",
    "Energa",
    "Tauron",
    "Enea",
    "Innogy",
)


def test_kazdy_katalog_lustrzany_ma_te_same_pozycje_po_obu_stronach() -> None:
    """Karta FAB-J: `BLOCK_TRANSFORMER_CATALOG`/`PF_CURVE_CATALOG` USUNIĘTE z tej
    listy — nie dlatego, że przestały istnieć, tylko dlatego, że przestały mieć
    DRUGĄ KOPIĘ do porównania. Kreator czyta je dziś WYŁĄCZNIE ze snapshotu
    audytu 2 (`useAudit2CatalogSnapshot`, `frontend/.../audit2-api.ts`), więc w
    `catalogs.ts` nie ma już bloku `export const BLOCK_TRANSFORMER_CATALOG`/
    `PF_CURVE_CATALOG` do sparsowania — rozjazd jest strukturalnie niemożliwy
    (jedno źródło danych), a nie tylko pilnowany testem. Pozostałe trzy katalogi
    NADAL mają lokalny mirror we froncie (poza zakresem karty FAB-J) i parytet
    dla nich zostaje.
    """
    front = _front_source(_FRONT_CATALOGS_TS)
    pary = {
        "MV_NEUTRAL_GROUNDING_CATALOG": {g.id for g in MV_NEUTRAL_GROUNDING_CATALOG},
        "BESS_OPERATION_MODE_CATALOG": {m.id for m in BESS_OPERATION_MODE_CATALOG},
        "TAP_CHANGER_CATALOG": {t.id for t in TAP_CHANGER_CATALOG},
    }
    for const_name, backend_ids in pary.items():
        front_ids = _ids_in_block(front, const_name)
        assert front_ids == backend_ids, (
            f"{const_name}: rozjazd mirrora frontu z backendem — "
            f"tylko z przodu {sorted(front_ids - backend_ids)}, "
            f"tylko w backendzie {sorted(backend_ids - front_ids)}"
        )


def test_wkladki_sn_maja_te_same_pozycje_po_obu_stronach() -> None:
    """Mirror wkladek SN mieszka w `protection-catalogs.ts` (karta K-O)."""
    front_ids = _ids_in_block(_front_source(_FRONT_PROTECTION_CATALOGS_TS), "HV_FUSE_CATALOG")
    assert front_ids == {f.id for f in HV_FUSE_CATALOG}


def _wszystkie_pozycje_backendu() -> list[tuple[str, dict]]:
    """Kazda pozycja KAZDEGO z siedmiu katalogow, w postaci serwowanej przez API.

    Sprawdzamy DANE, nie tekst zrodla: nota proweniencji w komentarzu wolno
    wymieniac usuniete pola i cudze imiona (po to jest), ale odpowiedz API — nie.
    """
    from network_model.catalog.audit2_catalogs import (
        DEVICE_WITHSTAND_CATALOG,
        get_audit2_catalog_snapshot,
    )

    pozycje: list[tuple[str, dict]] = []
    for nazwa, lista in get_audit2_catalog_snapshot().to_dict().items():
        for item in lista:
            pozycje.append((f"{nazwa}/{item['id']}", item))
    assert pozycje, "snapshot katalogow audytu 2 nie moze byc pusty"
    assert len(DEVICE_WITHSTAND_CATALOG) > 0
    return pozycje


@pytest.mark.parametrize("pole", POLA_BEZ_PROWENIENCJI_ZAKAZANE)
def test_pole_bez_proweniencji_nie_wraca_do_zadnej_z_warstw(pole: str) -> None:
    for opis, item in _wszystkie_pozycje_backendu():
        assert pole not in item, f"backend: {pole} wrocil w pozycji {opis}"

    for sciezka in (_FRONT_CATALOGS_TS, _FRONT_PROTECTION_CATALOGS_TS):
        for linia in _front_source(sciezka).splitlines():
            obnazona = linia.strip()
            if obnazona.startswith("//") or obnazona.startswith("*"):
                continue
            assert pole not in obnazona, f"{sciezka.name}: {pole} wrocil w linii: {linia.strip()}"


#: Pola, ktore SLUZA do wskazania zrodla — tam cudze imie jest tresci a, nie
#: naruszeniem: „zmierzone w przewodniku Schneider Electric" to proweniencja,
#: „producent: Schneider" przy wlasnych liczbach to fabrykacja. Skan imion
#: pomija wylacznie te pola.
POLA_PROWENIENCJI = ("zrodlo_pl", "source_reference", "pasmo_brak_powod_pl")


@pytest.mark.parametrize("imie", IMIONA_ZAKAZANE_W_KATALOGACH_AUDYTU2)
def test_cudze_imie_nie_wraca_do_danych_katalogow_audytu2(imie: str) -> None:
    for opis, item in _wszystkie_pozycje_backendu():
        for klucz, wartosc in item.items():
            if klucz in POLA_PROWENIENCJI or not isinstance(wartosc, str):
                continue
            assert imie not in wartosc, f"backend: '{imie}' w {opis}.{klucz} = {wartosc!r}"


def test_zadna_pozycja_nie_deklaruje_producenta() -> None:
    """Pole `manufacturer` w tych katalogach bylo doklejaniem cudzej tozsamosci.

    Dane transformatora dedykowanego pochodza dzis z katalogu transformatorow i
    niosa jego wlasna proweniencje (`source_reference` + `verification_status`),
    a nie recznie wpisane imie producenta.
    """
    for opis, item in _wszystkie_pozycje_backendu():
        assert "manufacturer" not in item, opis
