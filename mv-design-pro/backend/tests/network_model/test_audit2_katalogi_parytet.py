"""Parytet katalogow audytu 2: BACKEND (autorytet) vs MIRROR WE FRONTENDZIE.

PO CO TEN PLIK (karta K-Q, 2026-08-14; zakres zwezony kartą FAB-L, 2026-09-05).
Katalogi audytu 2 zyly pierwotnie w dwoch miejscach: `backend/src/network_model/
catalog/audit2_catalogs.py` (autorytet — z niego czyta `/api/v1/catalog/audit2`)
oraz frontendowy mirror. Dwie kopie tej samej listy to dwa zrodla prawdy, a wiec
przyszly rozjazd — i wlasnie tak powstal dlug, ktory zamykaly karty K-O i K-Q:
front wyczyszczono z fabrykacji, a backend niosl je dalej i serwowal przez API.

Karta FAB-L usunela OSTATNI powod takiego mirrora dla trzech z czterech katalogow
(`MV_NEUTRAL_GROUNDING_CATALOG`, `BESS_OPERATION_MODE_CATALOG`, `TAP_CHANGER_CATALOG`):
front juz nie ma WLASNEJ kopii tych list w `catalogs.ts` (selektory
`getMvNeutralGrounding`/`selectBessModesForPcs`/`selectTapChangersForTransformer`/
`getTapChanger` przyjmuja katalog jako PARAMETR — kreator czyta go WYLACZNIE ze
snapshotu `useAudit2CatalogSnapshot`). Rozjazd frontu z backendem jest wiec
STRUKTURALNIE niemozliwy dla tych trzech (jedno zrodlo danych), a nie tylko
pilnowany testem — patrz `test_trzy_katalogi_nie_maja_juz_bloku_mirrora_w_froncie`
ponizej. `HV_FUSE_CATALOG` (wkladki SN) NADAL ma lokalny mirror we froncie (poza
zakresem karty FAB-L, patrz meldunek) — dla niego parytet 1:1 zostaje.

CZEGO PILNUJE TEN PLIK:

1. WKLADKI SN: te same pozycje w mirrorze frontu i w backendzie (jedyny katalog
   z tych czterech, ktory nadal ma dwie kopie).
2. TRZY POZOSTALE KATALOGI NIE MAJA JUZ BLOKU MIRRORA — pozytywne potwierdzenie
   nieobecnosci, nie tylko brak awarii przy parsowaniu.
3. ZERO POL BEZ PROWENIENCJI. Nazwy pol usunietych w kartach K-O/K-Q/FAB-L nie
   moga wrocic ANI do backendu, ANI do frontu — lista jest ZAMKNIETA i przypieta
   tutaj (deklaracja bez testu = falszywa pewnosc).
4. ZERO CUDZEJ TOZSAMOSCI. Do pozycji tych katalogow nie wraca imie producenta
   ani operatora doklejone do wlasnych liczb.

Test czyta plik frontu jako TEKST (nie uruchamia TypeScriptu) — to swiadomy
wybor: parytet ma dzialac w zwyklym biegu pytest, bez node'a w petli.

KARTA FAB-M (2026-09-05) zamyka DRUGA KOPIE `HV_FUSE_CATALOG`: front czytal
dotad WLASNY mirror w `protection-catalogs.ts` (4 pozycje identyczne z
backendem), ktory `test_wkladki_sn_maja_te_same_pozycje_po_obu_stronach`
porownywal 1:1. Ten mirror zostal USUNIETY (front czyta katalog WYLACZNIE ze
snapshotu audytu 2, `useAudit2CatalogSnapshot`), wiec test zmienia ksztalt z
"te same pozycje po obu stronach" na "front NIE MA juz bloku mirrora" —
pozytywne potwierdzenie nieobecnosci, wzorem `test_trzy_katalogi_nie_maja_juz_
bloku_mirrora_w_froncie` (karta FAB-L, `MV_NEUTRAL_GROUNDING_CATALOG`/
`BESS_OPERATION_MODE_CATALOG`/`TAP_CHANGER_CATALOG` w `catalogs.ts` — inny
plik frontu, poza zakresem tej karty, NIETKNIETE tutaj). Nowy test dolozony
przez FAB-M pilnuje KLASY inaczej: identyfikatory bezpiecznikow uzyte w
fikstarach/testach frontu (gdziekolwiek w `frontend/src`/`frontend/e2e`) MUSZA
istniec w katalogu backendu — fikstura z identyfikatorem zmyslonym zapala
test, zamiast cicho przechodzic obok nieistniejacej pozycji.
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
    "response_time_s",
    "reserved_capacity_percent",
    "max_duration_h",
    "required_for_nc_rfg_modules",
    # falowniki / turbiny / baterie — dane karty katalogowej bez karty
    "fault_current_capability_pu",
    "transient_short_circuit_pu",
    "cycle_life",
)

#: Nazwy, ktorych nie wolno doklejac do wlasnych liczb (cudza tozsamosc).
#: `PGE`/`PSE` dopisane karta FAB-L (2026-09-05) — migracja pinu z usunietego
#: frontendowego testu `MV_NEUTRAL_GROUNDING_CATALOG` (katalog uziemienia SN
#: nie mial tu wczesniej ODPOWIADAJACEGO backendowego pinu operatorow).
IMIONA_ZAKAZANE_W_KATALOGACH_AUDYTU2 = (
    "Schneider",
    "Energa",
    "Tauron",
    "Enea",
    "Innogy",
    "PGE",
    "PSE",
)


def test_trzy_katalogi_nie_maja_juz_bloku_mirrora_w_froncie() -> None:
    """Karta FAB-L: `MV_NEUTRAL_GROUNDING_CATALOG`/`BESS_OPERATION_MODE_CATALOG`/
    `TAP_CHANGER_CATALOG` — jak wcześniej `BLOCK_TRANSFORMER_CATALOG`/`PF_CURVE_CATALOG`
    (karta FAB-J) — USUNIĘTE z `catalogs.ts` jako bloki `export const`, nie dlatego,
    że przestały istnieć, tylko dlatego, że przestały mieć DRUGĄ KOPIĘ do porównania.
    Kreator czyta je dziś WYŁĄCZNIE ze snapshotu audytu 2 (`useAudit2CatalogSnapshot`),
    a selektory (`getMvNeutralGrounding`/`selectBessModesForPcs`/
    `selectTapChangersForTransformer`/`getTapChanger`) przyjmują katalog jako PARAMETR.
    Test potwierdza NIEOBECNOŚĆ wprost — sam brak wyjątku przy parsowaniu (stary
    kształt testu) nie odróżniał „katalog usunięty celowo" od „test się zepsuł".
    `HV_FUSE_CATALOG` (wkładki SN) NADAL ma mirror — patrz test poniżej.
    """
    front = _front_source(_FRONT_CATALOGS_TS)
    for const_name in (
        "MV_NEUTRAL_GROUNDING_CATALOG",
        "BESS_OPERATION_MODE_CATALOG",
        "TAP_CHANGER_CATALOG",
    ):
        assert f"export const {const_name}" not in front, (
            f"{const_name}: mirror wrócił do catalogs.ts — karta FAB-L wymaga "
            "czytania WYŁĄCZNIE ze snapshotu audytu 2 (useAudit2CatalogSnapshot), "
            "nie drugiej kopii statycznej."
        )
    # Katalogi wciąż realne w backendzie (autorytet, serwowany przez snapshot) —
    # samo ich USUNIĘCIE stąd byłoby fałszywym alarmem: importy niżej dowodzą, że
    # backend nadal je niesie, tylko front przestał je duplikować.
    assert len(MV_NEUTRAL_GROUNDING_CATALOG) > 0
    assert len(BESS_OPERATION_MODE_CATALOG) > 0
    assert len(TAP_CHANGER_CATALOG) > 0


def test_wkladki_sn_nie_maja_juz_bloku_mirrora_w_froncie() -> None:
    """Karta FAB-M: `HV_FUSE_CATALOG` (mirror wkladek SN w `protection-catalogs.ts`,
    karta K-O) USUNIETY jako blok `export const` — front czyta katalog WYLACZNIE
    ze snapshotu audytu 2 (`useAudit2CatalogSnapshot`), a jedyny konsument
    produkcyjny (`StationConfigBaysCard.tsx`) dostaje go jako prop `hvFuses`.
    Test potwierdza NIEOBECNOSC wprost (wzorem FAB-L) — sam brak wyjatku przy
    parsowaniu nie odrozniałby "katalog usuniety celowo" od "test sie zepsul".
    """
    front = _front_source(_FRONT_PROTECTION_CATALOGS_TS)
    assert "export const HV_FUSE_CATALOG" not in front, (
        "HV_FUSE_CATALOG: mirror wrocil do protection-catalogs.ts — karta FAB-M "
        "wymaga czytania WYLACZNIE ze snapshotu audytu 2 (useAudit2CatalogSnapshot), "
        "nie drugiej kopii statycznej."
    )
    # Katalog wciaz realny w backendzie (autorytet, serwowany przez snapshot) —
    # samo jego USUNIECIE stad byloby falszywym alarmem.
    assert len(HV_FUSE_CATALOG) > 0


#: Wzorzec identyfikatora bezpiecznika SN katalogu audytu 2, np.
#: `fuse_15kv_50a_full` / `fuse_20kv_25a_gp` — odrozniony od NIEPOWIAZANEGO
#: literalu `fuse_set` (rodzaj aparatu pola, `konfiguratorRozdzielnicy.ts`) i od
#: identyfikatorow z myslnikami rodziny ETI VV (`sw-fuse-eti-vv-17kv-63a`,
#: `mv_switch_catalog.py::SWITCH_FUSES` — INNY katalog, realna proweniencja).
_WZORZEC_ID_BEZPIECZNIKA_SN = re.compile(r"\bfuse_\d+kv_\d+a_[a-z]+\b")

#: Katalogi frontu przeszukiwane pod katem identyfikatorow bezpiecznikow w
#: fikstarach/testach/e2e (karta FAB-M, M2). Cale drzewo `src`/`e2e` — nie
#: pojedynczy plik — zeby fikstura DODANA GDZIEKOLWIEK indziej w przyszlosci
#: byla rowniez zlapana, nie tylko dzisiejszy jeden plik.
_FRONT_SRC_ROOT = _FRONT_CATALOGS_TS.parents[4] / "src"
_FRONT_E2E_ROOT = _FRONT_CATALOGS_TS.parents[4] / "e2e"


def test_kazdy_identyfikator_bezpiecznika_uzyty_w_froncie_istnieje_w_backendzie() -> None:
    """Karta FAB-M (M2): kazdy identyfikator bezpiecznika SN uzyty w
    fikstarach/testach/e2e frontu istnieje w katalogu backendu (backend jest
    prawda). Fikstury frontu z identyfikatorami ZMYSLONYMI przechodza na
    realne — ten test nie pozwala wrocic do stanu sprzed tej karty.
    """
    backend_ids = {f.id for f in HV_FUSE_CATALOG}
    assert backend_ids, "katalog bezpiecznikow SN backendu nie moze byc pusty"

    znalezione: dict[str, list[str]] = {}
    for korzen in (_FRONT_SRC_ROOT, _FRONT_E2E_ROOT):
        assert korzen.is_dir(), f"Brak katalogu frontu pod {korzen}"
        for plik in sorted(korzen.rglob("*.ts")) + sorted(korzen.rglob("*.tsx")):
            tekst = plik.read_text(encoding="utf-8")
            for dopasowanie in _WZORZEC_ID_BEZPIECZNIKA_SN.findall(tekst):
                znalezione.setdefault(dopasowanie, []).append(str(plik))

    assert znalezione, (
        "Zero identyfikatorow bezpiecznikow SN znalezionych we froncie — "
        "wzorzec regex albo sciezki korzeni wymagaja poprawy (test musial "
        "znalezc co najmniej fikstury audit-round3-wiring.test.tsx)."
    )
    for identyfikator, pliki in znalezione.items():
        assert identyfikator in backend_ids, (
            f"Identyfikator bezpiecznika '{identyfikator}' uzyty we froncie "
            f"({', '.join(pliki)}) NIE ISTNIEJE w katalogu backendu "
            f"({sorted(backend_ids)}) — fikstura z identyfikatorem zmyslonym."
        )


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


#: Migracja pinu z usunietego testu frontowego (`MV_NEUTRAL_GROUNDING_CATALOG`,
#: karta K-O → FAB-L, 2026-09-05): opis wariantu uziemienia SN nie moze podawac
#: liczbowego I_k1 — ta liczba nie ma tu zrodla, a prad zwarcia doziemnego
#: konkretnej sieci wylicza solver SC1F (IEC 60909) z impedancji Z0 modelu, nie
#: katalog wariantow uziemienia.
_WZORZEC_IK1_W_TEKSCIE = re.compile(r"I\s*k?1?\s*[≈~=]\s*\d|Ik1\s*[≈~=]?\s*\d", re.IGNORECASE)


def test_zadna_pozycja_uziemienia_sn_nie_podaje_liczbowego_ik1_w_etykiecie_ani_opisie() -> None:
    for wariant in MV_NEUTRAL_GROUNDING_CATALOG:
        tekst = f"{wariant.label_pl} {wariant.description_pl}"
        assert not _WZORZEC_IK1_W_TEKSCIE.search(tekst), (
            f"Wariant {wariant.id} podaje liczbowy I_k1 w tekscie: {tekst!r}. "
            "Prad zwarcia doziemnego tej sieci wylicza solver SC1F."
        )
