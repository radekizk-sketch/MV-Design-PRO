"""Styk kart P1/P2 (V12K-321) — most kreatora DER niesie KOMPLET adnotacji PTPiREE.

Do tej karty most (`_certyfikat_ptpiree_z_katalogu`) kopiowal 4 z 9+ pol
adnotacji i wylacznie z zapisu typow katalogowych — bez `ptpiree_status`
i `ptpiree_note` tor gotowosci (karta P2) czytal KAZDY DER z kreatora jako
„unlinked", a warunek waznosci certyfikatu ginal na granicy typow.

Po styku zrodlem prawdy o dopasowaniu jest `annotate_with_ptpiree_status`
na PELNYM wykazie (karta P1) — most wola TE SAMA funkcje na tabliczce
producent/model rekordu (zero drugiej implementacji dopasowania).
"""

from __future__ import annotations

from typing import Any

import enm.domain_operations  # noqa: F401  (lamie cykl importu pakietu enm)
import pytest
from enm.domain_operations_v2 import (
    _POLA_CERTYFIKATU_PTPIREE,
    _PRZESTRZEN_ZRODLA_PRZEKSZTALTNIKOWEGO,
    _certyfikat_ptpiree_z_katalogu,
)
from network_model.catalog.mv_ptpiree_catalog import annotate_with_ptpiree_status
from network_model.catalog.repository import get_default_mv_catalog

#: Jedyny rekord katalogu przetwornic dopasowany do wykazu (pomiar karty P1).
REF_POWIAZANY = "conv-pv-card-huawei-sun2000-215ktl"

#: Przestrzen katalogu -> czytnik listy rekordow, ktore most w niej rozwiazuje.
#: Klucze MUSZA pokryc obraz `_PRZESTRZEN_ZRODLA_PRZEKSZTALTNIKOWEGO` (pilnuje
#: tego `test_kazda_przestrzen_kreatora_jest_pokryta_testem`) — inaczej nowa
#: technologia kreatora wchodzilaby na most bez ani jednego pomiaru.
CZYTNIKI_PRZESTRZENI: dict[str, Any] = {
    "ZRODLO_NN_PV": lambda katalog: katalog.list_pv_inverter_types(),
    "ZRODLO_NN_BESS": lambda katalog: katalog.list_bess_inverter_types(),
    "CONVERTER": lambda katalog: katalog.list_converter_types(),
}


def test_pola_mostu_pokrywaja_produkty_adnotacji() -> None:
    """PREDYKATY PARAMI (CLAUDE.md pkt 3): lista pol mostu = klucze, ktore
    faktycznie produkuje annotate. Nowe pole adnotacji bez wpisu na liscie
    ginelohy cicho na moscie — ten test to uniemozliwia."""
    dopasowany = annotate_with_ptpiree_status(
        {"id": "x", "name": "x", "params": {"manufacturer": "HUAWEI", "model": "SUN2000-215KTL-H3"}}
    )["params"]
    niedopasowany = annotate_with_ptpiree_status(
        {"id": "x", "name": "x", "params": {"manufacturer": "NIE-MA", "model": "TAKIEGO"}}
    )["params"]
    produkty = {k for k in {**dopasowany, **niedopasowany} if k.startswith("ptpiree_")}
    assert produkty <= set(
        _POLA_CERTYFIKATU_PTPIREE
    ), f"adnotacja produkuje pola spoza listy mostu: {sorted(produkty - set(_POLA_CERTYFIKATU_PTPIREE))}"


def test_most_niesie_komplet_dla_urzadzenia_powiazanego() -> None:
    tabliczka = _certyfikat_ptpiree_z_katalogu("CONVERTER", REF_POWIAZANY)
    assert tabliczka["ptpiree_status"] == "POWIAZANY"
    # Dowod: numer dokumentu, data akceptacji, wersje, zrodlo, nota opisowa.
    for pole in (
        "ptpiree_certificate_ref",
        "ptpiree_document_number",
        "ptpiree_document_acceptance_date",
        "ptpiree_wipwc_version",
        "ptpiree_ppm_scope",
        "ptpiree_source_url",
        "ptpiree_note",
    ):
        assert tabliczka.get(pole), f"most zgubil pole dowodowe: {pole}"
    # Nota opisowa NIE jest warunkiem — pole warunku nieobecne dla czystego
    # dopasowania (anty-falszywy-alarm toru gotowosci).
    assert "ptpiree_certificate_condition" not in tabliczka


def test_kazda_przestrzen_kreatora_jest_pokryta_testem() -> None:
    """KLASA, NIE INSTANCJA: pomiary ponizej chodza po WSZYSTKICH przestrzeniach,
    ktore kreator OZE kieruje na most — nie po jednej wybranej."""
    assert set(_PRZESTRZEN_ZRODLA_PRZEKSZTALTNIKOWEGO.values()) <= set(CZYTNIKI_PRZESTRZENI)


@pytest.mark.parametrize("przestrzen", sorted(CZYTNIKI_PRZESTRZENI))
def test_most_nie_nadpisuje_statusu_rekordu_w_zadnej_przestrzeni(przestrzen: str) -> None:
    """Regresja (2026-08-05): most re-adnotowal rekord tabliczka producent/model
    i nadpisywal jego WLASNY status. `ConverterType` niesie `model`, ale
    `PVInverterType` i `BESSInverterType` NIE — tam adnotacja szla z `model=None`,
    nie trafiala w wykaz i zamieniala POWIAZANY na NIEPOWIAZANY. Predykat wejscia
    (status rekordu katalogu) i wyjscia (status tabliczki modelu) MUSZA pochodzic
    z jednego zrodla w KAZDEJ przestrzeni."""
    katalog = get_default_mv_catalog()
    rekordy = CZYTNIKI_PRZESTRZENI[przestrzen](katalog)
    assert rekordy, f"pusta lista rekordow przestrzeni {przestrzen} — pomiar na pusto"

    rozbieznosci = []
    for rekord in rekordy:
        dane = rekord.to_dict()
        status_rekordu = dane.get("ptpiree_status")
        if not status_rekordu:
            continue
        status_mostu = _certyfikat_ptpiree_z_katalogu(przestrzen, dane["id"]).get("ptpiree_status")
        if status_mostu != status_rekordu:
            rozbieznosci.append((dane["id"], status_rekordu, status_mostu))
    assert not rozbieznosci, f"most przeklamal status katalogu: {rozbieznosci[:5]}"


@pytest.mark.parametrize("przestrzen", sorted(CZYTNIKI_PRZESTRZENI))
def test_tabliczka_nie_laczy_niepowiazania_z_dowodem(przestrzen: str) -> None:
    """DEKLARACJA Z TESTEM: tabliczka z numerem dokumentu wykazu NIE MOZE
    jednoczesnie meldowac NIEPOWIAZANY — to byla wewnetrzna sprzecznosc jednego
    slownika (nota „Brak dopasowania" obok wypelnionego numeru dokumentu), na
    ktorej tor gotowosci podnosil falszywy alarm."""
    katalog = get_default_mv_catalog()
    sprzeczne = []
    for rekord in CZYTNIKI_PRZESTRZENI[przestrzen](katalog):
        tabliczka = _certyfikat_ptpiree_z_katalogu(przestrzen, rekord.to_dict()["id"])
        if tabliczka.get("ptpiree_document_number") and tabliczka.get("ptpiree_status") != (
            "POWIAZANY"
        ):
            sprzeczne.append((rekord.to_dict()["id"], tabliczka.get("ptpiree_status")))
    assert not sprzeczne, f"dowod certyfikatu przy statusie NIEPOWIAZANY: {sprzeczne[:5]}"


def test_most_niesie_powiazanie_droga_kreatora_pv() -> None:
    """Produkcyjna droga PV kreatora OZE to przestrzen ZRODLO_NN_PV — to w niej
    jedyne urzadzenie powiazane z wykazem musi zostac powiazane w modelu."""
    tabliczka = _certyfikat_ptpiree_z_katalogu(
        _PRZESTRZEN_ZRODLA_PRZEKSZTALTNIKOWEGO["PV"], REF_POWIAZANY
    )
    assert tabliczka["ptpiree_status"] == "POWIAZANY"
    assert tabliczka["ptpiree_document_number"] == "TC-GCC-DNVGL-SE-0124-07526-1"
    assert tabliczka["ptpiree_wipwc_version"] == "1.2"
    assert "Brak dopasowania" not in tabliczka["ptpiree_note"]


def test_most_dla_urzadzenia_spoza_wykazu_mowi_to_wprost() -> None:
    """Turbiny wiatrowe MV nie sa objete wykazem (typ A/B, glownie nN) — status
    NIEPOWIAZANY z nota wyjasniajaca jest PRAWDA, nie brakiem danych."""
    katalog = get_default_mv_catalog()
    spoza = next(
        t.id
        for t in katalog.list_converter_types()
        if _certyfikat_ptpiree_z_katalogu("CONVERTER", t.id).get("ptpiree_status") == "NIEPOWIAZANY"
    )
    tabliczka = _certyfikat_ptpiree_z_katalogu("CONVERTER", spoza)
    assert tabliczka["ptpiree_status"] == "NIEPOWIAZANY"
    assert tabliczka.get("ptpiree_note"), "brak noty wyjasniajacej niedopasowanie"


def test_most_dla_nieistniejacego_refu_oddaje_pusto() -> None:
    assert _certyfikat_ptpiree_z_katalogu("CONVERTER", "nie-ma-takiego-refu") == {}
