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

import enm.domain_operations  # noqa: F401  (lamie cykl importu pakietu enm)
from enm.domain_operations_v2 import (
    _POLA_CERTYFIKATU_PTPIREE,
    _certyfikat_ptpiree_z_katalogu,
)
from network_model.catalog.mv_ptpiree_catalog import annotate_with_ptpiree_status

#: Jedyny rekord katalogu przetwornic dopasowany do wykazu (pomiar karty P1).
REF_POWIAZANY = "conv-pv-card-huawei-sun2000-215ktl"


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


def test_most_dla_urzadzenia_spoza_wykazu_mowi_to_wprost() -> None:
    """Turbiny wiatrowe MV nie sa objete wykazem (typ A/B, glownie nN) — status
    NIEPOWIAZANY z nota wyjasniajaca jest PRAWDA, nie brakiem danych."""
    from network_model.catalog.repository import get_default_mv_catalog

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
