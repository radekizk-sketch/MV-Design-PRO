"""Automigracja: klucz punktu przyłączenia wytwórcy traci ZAKAZANĄ nazwę „PCC".

DLACZEGO (V12K-268, decyzja właściciela: „pełna zmiana z migracją zapisu").
Rekordy wytwórców trzymały odniesienie do szyny przyłączenia pod kluczami
nazwami objętymi ZAKAZEM (``pcc_ref``, starsze ``pcc``) w ``materialized_params``
i ``meta`` — zakaz spisany w CLAUDE.md, „Forbidden Terms in Core Model".
Od weryfikacji nadzoru 2026-07-29 migracja obejmuje elementy WSZYSTKICH
kolekcji modelu (nie tylko ``generators``) — patrz ``_elementy_modelu``.
Powód zakazu: punkt przyłączenia nie jest osobnym bytem fizycznym — jest to SZYNA
(``Bus``), do której wytwórca jest przyłączony. Sama zmiana nazwy pola w kodzie nie
wystarczyłaby: klucz siedzi w ZAPISANYCH danych projektów, więc kod czytający
nową nazwę nie zobaczyłby przypisania zrobionego wcześniej i punkt przyłączenia
„zniknąłby" projektantowi z gotowego projektu.

WŁAŚCIWOŚCI (jak pozostałe automigracje ENM):
- **idempotentna** — drugie uruchomienie nie zmienia modelu (klucza już nie ma),
- **deterministyczna** — ten sam model wejściowy daje ten sam wynik,
- **bezstratna** — wartość jest PRZENOSZONA, nie kasowana; gdy obie nazwy
  istnieją, wygrywa NOWA (zapis nowszego kodu), a stara jest usuwana bez
  nadpisywania nowej.

SKUTEK DLA HASZY — powiedziany wprost. Migracja zmienia model, więc zmienia
``header.hash_sha256`` i podnosi rewizję (przez ``set_enm``). Wyniki policzone
przed migracją pokażą się jako NIEAKTUALNE — raz, dla projektów, które miały
zapisany stary klucz. To jest uczciwa konsekwencja zmiany reprezentacji, a nie
błąd: model faktycznie się zmienił. Złote sieci i utrwalone hasze testowe NIE
zawierają tego klucza (zmierzone), więc determinizm testów pozostaje nietknięty.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from enm.models import EnergyNetworkModel

MIGRATION_VERSION = "punkt_przylaczenia_der_001"

#: Nazwa kanoniczna — odniesienie do SZYNY przyłączenia wytwórcy.
KLUCZ_KANONICZNY = "bus_przylaczenia_ref"

#: Nazwy z zastanego ZAPISU na dysku, w kolejności malejącego zaufania. ZAKAZ
#: dotyczy nazw POJĘĆ MODELU; to jest jedyne miejsce w kodzie, które ma prawo je
#: wymienić — bo je z modelu usuwa.
KLUCZE_ZASTANE: tuple[str, ...] = ("pcc_ref", "pcc")  # nazwy objete ZAKAZEM — usuwane


def _przenies_w_slowniku(dane: dict[str, Any] | None) -> bool:
    """Przenieś wartość ze starych kluczy pod nazwę kanoniczną. Zwróć: czy zmieniono."""
    if not isinstance(dane, dict):
        return False

    obecne = [k for k in KLUCZE_ZASTANE if k in dane]
    if not obecne:
        return False

    zmieniono = False
    for klucz in obecne:
        wartosc = dane.pop(klucz)
        zmieniono = True
        # Nowa nazwa wygrywa: gdy nowszy kod zdążył już zapisać kanoniczny klucz,
        # stary wpis jest pozostałością i nie może go nadpisać.
        if dane.get(KLUCZ_KANONICZNY) in (None, ""):
            if wartosc not in (None, ""):
                dane[KLUCZ_KANONICZNY] = wartosc
    return zmieniono


def _slowniki_elementu(element: Any) -> tuple[dict[str, Any] | None, ...]:
    """Słowniki danych elementu, w których zakazany klucz mógł zostać zapisany."""
    return (
        getattr(element, "materialized_params", None),
        getattr(element, "meta", None),
    )


def _elementy_modelu(enm: EnergyNetworkModel) -> Iterator[Any]:
    """Elementy WSZYSTKICH kolekcji modelu, w stałej kolejności pól.

    Zakres rozszerzony z ``generators`` na całość (weryfikacja nadzoru
    2026-07-29): jedyny historyczny producent klucza pisał wyłącznie do
    ``generators[].meta`` (zmierzone w historii), ale zakaz dotyczy NAZWY
    w zapisanych danych — dane mogły powstać także ręczną edycją albo importem,
    więc migracja domyka całą warstwę zapisu, nie jedną kolekcję. Iteracja po
    polach modelu jest deterministyczna (kolejność deklaracji) i obejmuje
    kolekcje dodane w przyszłości bez zmiany tego pliku.
    """
    for nazwa_pola in type(enm).model_fields:
        wartosc = getattr(enm, nazwa_pola)
        if isinstance(wartosc, list):
            yield from wartosc


def wymaga_migracji(enm: EnergyNetworkModel) -> bool:
    """Czy którykolwiek element modelu trzyma jeszcze odniesienie pod starą nazwą."""
    for element in _elementy_modelu(enm):
        for dane in _slowniki_elementu(element):
            if isinstance(dane, dict) and any(k in dane for k in KLUCZE_ZASTANE):
                return True
    return False


def migruj(enm: EnergyNetworkModel) -> tuple[EnergyNetworkModel, bool]:
    """Przenieś odniesienie punktu przyłączenia pod nazwę kanoniczną.

    Returns:
        Para (model, czy_zmieniono). Przy braku zmian zwracany jest TEN SAM
        obiekt — żeby wywołujący nie podbijał rewizji bez powodu.
    """
    if not wymaga_migracji(enm):
        return enm, False

    zmigrowany = enm.model_copy(deep=True)
    zmieniono = False
    for element in _elementy_modelu(zmigrowany):
        for dane in _slowniki_elementu(element):
            if _przenies_w_slowniku(dane):
                zmieniono = True
    return zmigrowany, zmieniono
