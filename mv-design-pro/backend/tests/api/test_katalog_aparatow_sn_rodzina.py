"""Oferta aparatów SN rodziny rozdzielnicy — projekcje producenta i rodzaju aparatu.

Przejście scenariusza „stacja SN/nN 630 kVA”: lista aparatów w polu rozdzielnicy
ZPUE Rotoblok mieszała ABB, Siemens, Schneider i NOJA, bo pozycja katalogu
APARAT_SN nie niosła referencji producenta rozdzielnicy ani rodzaju w słowniku
rodzin. Końcówka `/api/catalog/mv-apparatus-types` wystawia teraz obie projekcje;
testy przypinają, że słowniki są ZAMKNIĘTE wobec katalogu (każdy producent i każdy
rodzaj katalogu ma wpis), a nie tylko przykład z karty.
"""

from __future__ import annotations

from api.main import app
from fastapi.testclient import TestClient
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.switchgear import SWITCHGEAR_FAMILY_REGISTRY
from network_model.catalog.switchgear.apparatus_vocabulary import (
    FAMILY_APPARATUS_FOR_CATALOG_DEVICE_KIND,
    FAMILY_APPARATUS_FOR_TEMPLATE_KIND,
    FAMILY_APPARATUS_KINDS_INTERCHANGEABLE,
)
from network_model.catalog.switchgear.registry import (
    MANUFACTURER_REF_FOR_APPARATUS_VENDOR,
    MANUFACTURER_REGISTRY,
)


def _aparaty() -> list[dict]:
    odpowiedz = TestClient(app).get("/api/catalog/mv-apparatus-types")
    assert odpowiedz.status_code == 200
    return odpowiedz.json()


def test_kazdy_producent_katalogu_ma_wpis_slownika() -> None:
    """Zamknięcie słownika producentów: nowa nazwa w katalogu łamie test, nie filtr."""
    producenci = {a.manufacturer for a in get_default_mv_catalog().list_mv_apparatus_types()}
    producenci.discard(None)
    assert producenci <= set(MANUFACTURER_REF_FOR_APPARATUS_VENDOR)


def test_referencje_producenta_naleza_do_rejestru_rozdzielnic() -> None:
    for ref in MANUFACTURER_REF_FOR_APPARATUS_VENDOR.values():
        assert ref is None or ref in MANUFACTURER_REGISTRY


def test_kazdy_rodzaj_katalogu_ma_wpis_slownika_rodzin() -> None:
    """Zamknięcie słownika rodzajów; wartości należą do słownika rodzin rozdzielnic."""
    rodzaje = {a.device_kind for a in get_default_mv_catalog().list_mv_apparatus_types()}
    assert rodzaje <= set(FAMILY_APPARATUS_FOR_CATALOG_DEVICE_KIND)
    slownik_rodzin = set(FAMILY_APPARATUS_FOR_TEMPLATE_KIND.values())
    for rodzaj in FAMILY_APPARATUS_FOR_CATALOG_DEVICE_KIND.values():
        assert rodzaj is None or rodzaj in slownik_rodzin


def test_koncowka_wystawia_producenta_i_rodzaj_dla_kazdej_pozycji() -> None:
    aparaty = _aparaty()
    assert aparaty
    for aparat in aparaty:
        assert "manufacturer_ref" in aparat
        assert "family_apparatus_kind" in aparat
        assert aparat["family_apparatus_kind"] == FAMILY_APPARATUS_FOR_CATALOG_DEVICE_KIND.get(
            aparat["device_kind"]
        )
        assert aparat["interchangeable_across_families"] is (
            aparat["family_apparatus_kind"] in FAMILY_APPARATUS_KINDS_INTERCHANGEABLE
        )


def _oferta(rodzina_ref: str) -> list[dict]:
    """Oferta rodziny — ten sam predykat, co filtr kreatora stacji (`aparatyRodziny`):
    rodzaj dopuszczony kartą rodziny ORAZ (producent rodziny ALBO komponent wymienny)."""
    rodzina = SWITCHGEAR_FAMILY_REGISTRY[rodzina_ref]
    return [
        a
        for a in _aparaty()
        if a["family_apparatus_kind"] in set(rodzina.allowed_apparatus_kinds)
        and (
            a["manufacturer_ref"] == rodzina.manufacturer_ref
            or a["interchangeable_across_families"]
        )
    ]


def test_wkladki_bezpiecznikowe_sa_wymienne_miedzy_rodzinami() -> None:
    """Pole transformatorowe Rotobloku dostaje rozłącznik bezpiecznikowy z wkładkami ETI —
    bez wyjątku wymienności zestaw bezpiecznikowy nie należałby do oferty ŻADNEJ rodziny,
    bo jego wytwórca (ETI) nie produkuje rozdzielnic. Iloczyn: rodzaj {fuse_set, wyłącznik,
    rozłącznik, uziemnik} × producent {rodziny, inny, brak}."""
    rotoblok = _oferta("ZPUE_WLOSZCZOWA__ROTOBLOK")
    bezpieczniki = [a for a in rotoblok if a["family_apparatus_kind"] == "fuse_set"]
    assert bezpieczniki, "Rotoblok dopuszcza fuse_set — oferta musi go zawierać"
    assert all(a["manufacturer_ref"] is None for a in bezpieczniki)
    niewymienne = [a for a in rotoblok if a["family_apparatus_kind"] != "fuse_set"]
    assert niewymienne
    assert all(a["manufacturer_ref"] == "ZPUE_WLOSZCZOWA" for a in niewymienne)
    # Aparaty bez producenta rozdzielnic, ale NIEWYMIENNE (odłącznik słupowy, uziemnik
    # ogólny) nie wchodzą do oferty rodziny.
    assert "sw-ds-generic-slupowy-17kv-400a" not in {a["id"] for a in rotoblok}
    assert "sw-es-generic-17kv" not in {a["id"] for a in rotoblok}


def test_oferta_rodziny_rotoblok_to_wylacznie_aparaty_zpue_dopuszczonych_rodzajow() -> None:
    """Iloczyn cech: producent rodziny × rodzaje dopuszczone kartą rodziny (poza
    komponentami wymiennymi, które przypina test wkładek bezpiecznikowych)."""
    oferta = [
        a for a in _oferta("ZPUE_WLOSZCZOWA__ROTOBLOK") if not a["interchangeable_across_families"]
    ]
    assert oferta, "rodzina Rotoblok musi mieć ofertę aparatów w katalogu"
    assert {a["manufacturer"] for a in oferta} == {"ZPUE Włoszczowa"}
    # Reklozer (łącznik słupowy) nie jest aparatem celki żadnej rodziny.
    assert all(a["device_kind"] != "REKLOZER" for a in oferta)
    nazwy = {a["name"] for a in oferta}
    assert not any(n.startswith(("ABB", "Siemens", "Schneider", "NOJA")) for n in nazwy)


def test_reklozer_nie_nalezy_do_zadnej_rodziny() -> None:
    reklozery = [a for a in _aparaty() if a["device_kind"] == "REKLOZER"]
    assert reklozery
    assert all(a["family_apparatus_kind"] is None for a in reklozery)


def test_odczyt_nie_zmienia_rekordu_katalogu() -> None:
    """Projekcje dokładane są w odczycie — rekord katalogu (i jego odcisk) bez zmian."""
    rekordy = {a.id: a.to_dict() for a in get_default_mv_catalog().list_mv_apparatus_types()}
    for aparat in _aparaty():
        bez_projekcji = {
            k: v
            for k, v in aparat.items()
            if k
            not in {"manufacturer_ref", "family_apparatus_kind", "interchangeable_across_families"}
        }
        assert bez_projekcji == rekordy[aparat["id"]]
