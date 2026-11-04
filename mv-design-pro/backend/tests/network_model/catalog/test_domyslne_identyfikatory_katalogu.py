"""Identyfikatory katalogu zaszyte w kodzie produkcyjnym wskazują realne pozycje z kartą.

POWÓD (karta KATALOG-PRZEJECIE-PR, decyzja architekta 2026-11-04, pkt 2): domyślny kabel
odgałęzienia konfiguratora stacji wskazywał pozycję referencyjną, choć katalog ma pozycję
o tych samych parametrach z kartą producenta; inwentarz klasy wykazał dalej, że konfigurator
odcinka SN niósł listę dziewięciu identyfikatorów, z których siedem nie istniało w katalogu
(domyślny `cable-tfk-yakxs-3x70` także), a konfigurator GPZ — pięć nieistniejących
identyfikatorów transformatorów 110/SN. Backend odrzuca takie wiązanie dopiero w chwili
operacji, czyli projektant widział wybór, którego system nie umie wykonać.

ILOCZYN CECH (KLASA NIE INSTANCJA):
* {kod produkcyjny backendu × frontendu} × {literał w kształcie identyfikatora rodziny
  katalogu: przedrostek rodziny z „-” mającej co najmniej trzy pozycje albo jawny kształt
  rodziny z „_”} → pozycja istnieje w katalogu domyślnym (pomiar 2026-11-04: zero napisów
  niekatalogowych w tych kształtach — wyjątków brak);
* {literał będący identyfikatorem pozycji} × {status weryfikacji} → pozycja nie jest modelem
  referencyjnym ALBO jest na zamkniętej liście wyjątków z powodem merytorycznym; wyjątek jest
  PRAWDZIWY mechanicznie — w jego klasie (przestrzeń katalogu × rodzaj) nie ma pozycji
  dopuszczonej do doboru (`dopuszczona_do_doboru_szablonu`, to samo kryterium co skład DER
  szablonów) — a martwy wyjątek (literał już nie występuje) zapala test.

Poza skanem są katalogi same w sobie (`network_model/catalog`, dane producentów
`application/analyses/protection/catalog`) — to definicje pozycji, nie ich konsumenci.
"""

from __future__ import annotations

import re
from collections import Counter
from functools import cache
from pathlib import Path

from application.station_templates._choices import WYJATKI_POZYCJI_BEZ_KARTY
from network_model.catalog.mv_converter_catalog import dopuszczona_do_doboru_szablonu
from network_model.catalog.odcisk import zrzut_kanoniczny
from network_model.catalog.repository import get_default_mv_catalog

_BACKEND = Path(__file__).resolve().parents[3]
_FRONTEND_SRC = _BACKEND.parent / "frontend" / "src"

_POMIN_BACKEND = ("network_model/catalog/", "application/analyses/protection/catalog/")

#: Rodziny identyfikatorów z separatorem „_” — kształt jawny, bo przedrostek „ct_”/„load_”
#: dzielą także nazwy pól (`ct_catalog_ref`, `load_flow_run_id`). Każdy kształt musi pasować
#: do co najmniej jednej pozycji katalogu (inaczej jest martwy — test to sprawdza).
_KSZTALTY_PODKRESLNIKOWE = (
    r"ct_\d+_\d+_[a-z0-9_]+",
    r"vt_\d+kv_\d+v_[a-z0-9_]+",
    r"load_[a-z]+_\d+kw",
    r"KOMP_SN_[A-Z0-9_]+",
    r"EM_E2?TANGO_[A-Z0-9_]+",
)

_POWOD_PRZEKLADNIKI = (
    "Katalog przekładników zawiera wyłącznie profile referencyjne (pomiar 2026-11-04: CT 12, "
    "VT 13 — wszystkie REFERENCYJNY); szablon pola wskazuje profil o przekładni i klasie "
    "z wymagania pola, a dane producenta wprowadza projektant przy doborze wykonawczym."
)
_POWOD_ODBIORY = (
    "Typy odbiorów to profile obciążenia (mieszkaniowy, usługowy, przemysłowy), nie wyroby — "
    "katalog nie ma i nie może mieć dla nich karty producenta."
)
_POWOD_KOMPENSACJA = (
    "Katalog baterii kondensatorów SN zawiera wyłącznie profile referencyjne (pomiar "
    "2026-11-04: 6 pozycji, wszystkie REFERENCYJNY); szablon wskazuje profil mocy stopnia."
)

#: Zamknięta lista literałów-pozycji referencyjnych w kodzie produkcyjnym (id → powód).
_WYJATKI_REFERENCYJNE: dict[str, str] = {
    **{
        ident: _POWOD_PRZEKLADNIKI
        for ident in (
            "ct_50_1_0_5_5va_arteche",
            "ct_100_1_0_5_5va_abb",
            "ct_150_1_0_5_10va_abb",
            "ct_200_5_5p10_10va_abb",
            "ct_400_5_5p20_15va_abb",
            "ct_600_5_5p20_15va_schneider",
            "ct_1000_5_5p20_20va_abb",
            "vt_15kv_100v_3p_abb",
            "vt_15kv_100v_05_abb",
            "vt_20kv_100v_05_arteche",
        )
    },
    **{
        ident: _POWOD_ODBIORY
        for ident in ("load_mieszk_15kw", "load_przem_75kw", "load_uslugi_30kw")
    },
    **{
        ident: _POWOD_KOMPENSACJA
        for ident in (
            "KOMP_SN_0V6_15KV",
            "KOMP_SN_1V2_15KV",
            "KOMP_SN_1V8_20KV",
            "KOMP_SN_2V4_15KV",
            "KOMP_SN_3V6_20KV",
        )
    },
    **{
        ident: WYJATKI_POZYCJI_BEZ_KARTY["BESS"]
        for ident in (
            "conv-bess-nn-0p5mw-0p69kv",
            "conv-bess-nn-1mw-0p69kv",
            "conv-bess-nn-2mw-0p69kv",
        )
    },
    "conv-wind-nn-2mw-0p69kv": WYJATKI_POZYCJI_BEZ_KARTY["FW"],
}


@cache
def _pozycje() -> dict[str, list[tuple[str, dict]]]:
    """id → lista (przestrzeń katalogu, rekord) — ta sama pozycja bywa w dwóch przestrzeniach."""
    wynik: dict[str, list[tuple[str, dict]]] = {}
    for przestrzen, rekordy in zrzut_kanoniczny(get_default_mv_catalog()).items():
        if not isinstance(rekordy, dict):
            continue
        for ident, rekord in rekordy.items():
            if isinstance(rekord, dict):
                wynik.setdefault(ident, []).append((przestrzen, rekord))
    return wynik


def _przedrostki_myslnikowe() -> list[str]:
    """Przedrostki rodzin z separatorem „-” (co najmniej trzy pozycje w katalogu)."""
    licznik = Counter(i.split("-", 1)[0] for i in _pozycje() if "-" in i)
    return sorted(p for p, n in licznik.items() if n >= 3 and p != "ptpiree")


def _pliki_produkcyjne() -> list[Path]:
    pliki: list[Path] = []
    for sciezka in sorted((_BACKEND / "src").rglob("*.py")):
        wzgledna = sciezka.relative_to(_BACKEND / "src").as_posix()
        if "__pycache__" in wzgledna or wzgledna.startswith(_POMIN_BACKEND):
            continue
        pliki.append(sciezka)
    for sciezka in sorted(_FRONTEND_SRC.rglob("*.ts*")):
        wzgledna = sciezka.relative_to(_FRONTEND_SRC).as_posix()
        if (
            "__tests__/" in wzgledna
            or ".test." in sciezka.name
            or "harness-fixtures/" in wzgledna
            or sciezka.suffix not in (".ts", ".tsx")
        ):
            continue
        pliki.append(sciezka)
    return pliki


@cache
def _literaly() -> tuple[tuple[str, str], ...]:
    """(miejsce `plik:linia`, literał) dla każdego literału w kształcie identyfikatora."""
    kszalty = [re.escape(p) + r"-[A-Za-z0-9][A-Za-z0-9_.\-]{4,}" for p in _przedrostki_myslnikowe()]
    kszalty += list(_KSZTALTY_PODKRESLNIKOWE)
    # Literały w apostrofach i cudzysłowach; odwrotny apostrof oznacza w tym repo identyfikator
    # w komentarzu/docstringu (pomiar 2026-11-04: zero identyfikatorów katalogu w szablonach `...`
    # kodu wykonywalnego frontu), a komentarz nie jest miejscem wpięcia.
    wzor = re.compile(r"""['"]((?:%s))['"]""" % "|".join(kszalty))
    trafienia: list[tuple[str, str]] = []
    for plik in _pliki_produkcyjne():
        for nr, linia in enumerate(plik.read_text(encoding="utf-8").splitlines(), 1):
            for dopasowanie in wzor.finditer(linia):
                trafienia.append(
                    (f"{plik.relative_to(_BACKEND.parent)}:{nr}", dopasowanie.group(1))
                )
    return tuple(trafienia)


def test_skan_nie_jest_pusty_i_ksztalty_sa_zywe() -> None:
    # Pomiar 2026-11-04: 50+ literałów-pozycji (szablony stacji, operacje domenowe, front).
    assert len([1 for _, lit in _literaly() if lit in _pozycje()]) >= 50
    for ksztalt in _KSZTALTY_PODKRESLNIKOWE:
        assert any(re.fullmatch(ksztalt, i) for i in _pozycje()), f"martwy kształt {ksztalt}"


def test_kazdy_literal_rodziny_katalogu_istnieje_w_katalogu() -> None:
    brakujace = sorted(f"{miejsce}\t{lit}" for miejsce, lit in _literaly() if lit not in _pozycje())
    assert brakujace == [], "identyfikatory spoza katalogu:\n" + "\n".join(brakujace)


def test_literal_pozycji_nie_jest_modelem_referencyjnym_poza_jawnym_wyjatkiem() -> None:
    referencyjne = sorted(
        f"{miejsce}\t{lit}"
        for miejsce, lit in _literaly()
        if lit in _pozycje()
        and lit not in _WYJATKI_REFERENCYJNE
        and any(r.get("verification_status") == "REFERENCYJNY" for _, r in _pozycje()[lit])
    )
    assert referencyjne == [], "pozycje referencyjne zaszyte w kodzie:\n" + "\n".join(referencyjne)
    wystepujace = {lit for _, lit in _literaly()}
    martwe = sorted(set(_WYJATKI_REFERENCYJNE) - wystepujace)
    assert martwe == [], f"martwe wyjątki (literał już nie występuje): {martwe}"


def test_wyjatek_referencyjny_jest_prawdziwy_brak_pozycji_dopuszczonej_w_klasie() -> None:
    pozycje = _pozycje()
    for ident, powod in sorted(_WYJATKI_REFERENCYJNE.items()):
        assert powod.strip(), ident
        assert ident in pozycje, f"wyjątek {ident} nie jest pozycją katalogu"
        for przestrzen, rekord in pozycje[ident]:
            assert rekord.get("verification_status") == "REFERENCYJNY", (ident, przestrzen)
            rodzaj = rekord.get("kind")
            dopuszczone = sorted(
                inny_id
                for inny_id, wpisy in pozycje.items()
                for inna_przestrzen, inny in wpisy
                if inna_przestrzen == przestrzen
                and inny.get("kind") == rodzaj
                and dopuszczona_do_doboru_szablonu(inny)
            )
            assert dopuszczone == [], (
                f"wyjątek {ident} ({przestrzen}) nieprawdziwy — w klasie są pozycje z kartą: "
                f"{dopuszczone}; przepnij literał na pozycję z kartą"
            )


def test_domyslny_kabel_odgalezienia_konfiguratora_stacji_ma_karte_producenta() -> None:
    """Instancja z karty: `DEFAULT_BRANCH_CABLE_SEGMENT` (StationConfiguratorSurface.tsx)."""
    plik = _FRONTEND_SRC / "ui" / "workspace" / "surfaces" / "StationConfiguratorSurface.tsx"
    tresc = plik.read_text(encoding="utf-8")
    blok = tresc[tresc.index("DEFAULT_BRANCH_CABLE_SEGMENT") :]
    znalezione = re.search(r"catalog_item_id:\s*'([^']+)'", blok)
    assert znalezione is not None
    wpisy = _pozycje()[znalezione.group(1)]
    assert [p for p, _ in wpisy] == ["cable_types"]
    rekord = wpisy[0][1]
    assert rekord["verification_status"] != "REFERENCYJNY"
    # Te same parametry co dawny profil `cable-enea-operator-na2xs2y-1x150`: Al, 150 mm², 12/20 kV.
    assert (str(rekord["conductor_material"]).upper(), rekord["cross_section_mm2"]) == ("AL", 150.0)
    assert rekord["voltage_rating_kv"] == 20.0
