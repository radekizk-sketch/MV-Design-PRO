"""Szablony stacji tworzą obiekt PROJEKTOWANY — żadna podpowiedź aparatu SN nie ma gazu fluorowanego.

PO CO. Szablon stacji (`application/station_templates`) podpowiada aparaty pól SN z katalogu
`APARAT_SN` i nazywa rozdzielnicę w etykiecie. Stacja z szablonu jest PROJEKTOWANA, a strażnik
operacji domenowej odmawia aparatu z gazem fluorowanym w obiekcie projektowanym (rozporządzenie
(UE) 2024/573, art. 13 ust. 9; `network_model/catalog/gazy_fluorowane`). Podpowiedź z SF₆
w szablonie prowadziłaby projektanta wprost w odmowę zapisu (dawny rozłącznik Schneider RM6 jako
opcja `SN_APPARATUS_OPTIONS`), a etykieta „ABB SafeRing" — do wyboru rodziny z SF₆.

KLASA, NIE INSTANCJA. Test nie czyta jednej listy opcji, tylko przechodzi rekurencyjnie KAŻDY
szablon rejestru (`ALL_TEMPLATES`) i zbiera każdą `CatalogChoice` przestrzeni `APARAT_SN`
— nowa lista opcji w nowym miejscu szablonu też jest sprawdzana. Medium pozycji czyta z katalogu
(jedna prawda), a nazwy rodzin z gazem fluorowanym — z rejestru rodzin (pole wyprowadzone
`gaz_fluorowany`), nie z listy zaszytej w teście.
"""

from __future__ import annotations

import dataclasses
from collections.abc import Iterator

from application.station_templates._choices import SN_APPARATUS_OPTIONS
from application.station_templates.schema import CatalogChoice
from application.station_templates.templates import ALL_TEMPLATES
from network_model.catalog.gazy_fluorowane import czy_medium_z_gazem_fluorowanym
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.switchgear.families import SWITCHGEAR_FAMILY_REGISTRY


def _wybory(obiekt: object) -> Iterator[CatalogChoice]:
    if isinstance(obiekt, CatalogChoice):
        yield obiekt
    elif dataclasses.is_dataclass(obiekt) and not isinstance(obiekt, type):
        for pole in dataclasses.fields(obiekt):
            yield from _wybory(getattr(obiekt, pole.name))
    elif isinstance(obiekt, tuple | list | frozenset | set):
        for element in obiekt:
            yield from _wybory(element)
    elif isinstance(obiekt, dict):
        for wartosc in obiekt.values():
            yield from _wybory(wartosc)


def _teksty(obiekt: object) -> Iterator[str]:
    if isinstance(obiekt, str):
        yield obiekt
    elif dataclasses.is_dataclass(obiekt) and not isinstance(obiekt, type):
        for pole in dataclasses.fields(obiekt):
            yield from _teksty(getattr(obiekt, pole.name))
    elif isinstance(obiekt, tuple | list | frozenset | set):
        for element in obiekt:
            yield from _teksty(element)
    elif isinstance(obiekt, dict):
        for wartosc in obiekt.values():
            yield from _teksty(wartosc)


def _aparaty_szablonow() -> dict[str, set[str]]:
    wynik: dict[str, set[str]] = {}
    for szablon in ALL_TEMPLATES:
        for wybor in _wybory(szablon):
            if wybor.namespace == "APARAT_SN":
                wynik.setdefault(wybor.catalog_ref, set()).add(szablon.id)
    return wynik


def test_szablony_podpowiadaja_aparaty_sn() -> None:
    """Detektor nie jest pusty — inaczej test niżej niczego by nie sprawdzał."""
    aparaty = _aparaty_szablonow()
    assert {w.catalog_ref for w in SN_APPARATUS_OPTIONS} <= set(aparaty)


def test_zadna_podpowiedz_aparatu_sn_nie_ma_gazu_fluorowanego() -> None:
    katalog = get_default_mv_catalog()
    naruszenia: list[str] = []
    for ref, szablony in sorted(_aparaty_szablonow().items()):
        pozycja = katalog.get_mv_apparatus_type(ref)
        assert pozycja is not None, f"Podpowiedź {ref} nie istnieje w katalogu aparatów SN"
        gaz = czy_medium_z_gazem_fluorowanym(pozycja.medium)
        # Brak potwierdzenia ≠ brak gazu: pozycja bez medium też jest naruszeniem.
        if gaz is not False:
            naruszenia.append(f"{ref} (medium {pozycja.medium!r}) w {sorted(szablony)}")
    assert not naruszenia, naruszenia


def test_etykiety_szablonow_nie_wskazuja_rodzin_z_gazem_fluorowanym() -> None:
    rodziny_z_gazem = sorted(
        r.family_name for r in SWITCHGEAR_FAMILY_REGISTRY.values() if r.gaz_fluorowany is True
    )
    # Nazwa rodziny bez gazu może zawierać nazwę rodziny z gazem („Rotoblok Air" ⊃ „Rotoblok") —
    # najpierw usuwa się nazwy rodzin bez gazu (najdłuższe najpierw), potem szuka nazw z gazem.
    rodziny_bez_gazu = sorted(
        (r.family_name for r in SWITCHGEAR_FAMILY_REGISTRY.values() if r.gaz_fluorowany is False),
        key=len,
        reverse=True,
    )
    assert rodziny_z_gazem, "Rejestr rodzin bez rodzin z gazem — detektor nic nie sprawdza"

    def bez_nazw_rodzin_bez_gazu(tekst: str) -> str:
        wynik = tekst.lower()
        for nazwa in rodziny_bez_gazu:
            wynik = wynik.replace(nazwa.lower(), " ")
        return wynik

    naruszenia = sorted(
        (szablon.id, nazwa)
        for szablon in ALL_TEMPLATES
        for tekst in _teksty(szablon)
        for nazwa in rodziny_z_gazem
        if nazwa.lower() in bez_nazw_rodzin_bez_gazu(tekst)
    )
    assert not naruszenia, naruszenia
    assert "rotoblok" not in bez_nazw_rodzin_bez_gazu("ZPUE Rotoblok Air")
