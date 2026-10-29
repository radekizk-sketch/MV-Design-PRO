"""Jednoznaczność oznaczeń aparatów w polu — JEDNA reguła walidatora (W063).

PO CO. Oznaczenie aparatu (Q0, Q8, 6Q2) jest adresem polecenia łączeniowego i zapisu
w dokumentacji: dwa aparaty pola o tym samym oznaczeniu czynią polecenie „otwórz 6Q2"
niejednoznacznym. Referencja HMI właściciela (2026-10-29, ekran sterownika polowego pola P6)
pokazuje ten defekt w obiekcie w ruchu: łącznik górny i wyłącznik noszą to samo „6Q2".
Narzędzie projektowe nie może go przepuścić.

PODSTAWA. IEC 81346-1 (zasady strukturyzacji i oznaczeń referencyjnych): oznaczenie
referencyjne identyfikuje obiekt JEDNOZNACZNIE w obrębie obiektu nadrzędnego — tu pola,
którego numer (`Bay.bay_number`) jest przedrostkiem oznaczenia w stacji (6 + Q2 = 6Q2).
Oznaczenia w RÓŻNYCH polach mogą się powtarzać (Q0 w każdym polu) — to zamierzone.

PORÓWNANIE. Oznaczenie po przycięciu odstępów i bez rozróżniania wielkości liter („6q2" i
„6Q2 " to jedno oznaczenie). Aparat bez oznaczenia nie uczestniczy (brak danej ≠ duplikat;
schemat pokazuje wtedy oznaczenie konwencji ze znacznikiem źródła).

Moduł jest regułą czystą (bez stanu): czyta rekord pola, zwraca naruszenia w stałej
kolejności (pole → oznaczenie), więc to samo wejście daje ten sam wynik walidatora.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from .models import Bay, BayPrimaryDevice
from .slownik_komunikatow import opis_obiektu
from .wyposazenie_pola import NAZWY_RODZAJOW_APARATU_POLA_PL

__all__ = [
    "AKCJA_NAPRAWCZA_OZNACZEN_PL",
    "KOD_WALIDATORA_OZNACZEN",
    "PODSTAWA_JEDNOZNACZNOSCI_OZNACZEN",
    "ZdublowaneOznaczenie",
    "klucz_oznaczenia",
    "zdublowane_oznaczenia",
    "zdublowane_oznaczenia_pola",
]

#: Kod walidatora modelu — kanon gotowości `bay.apparatus_designation_duplicate`
#: (`domain.readiness_bridge`).
KOD_WALIDATORA_OZNACZEN = "W063"

PODSTAWA_JEDNOZNACZNOSCI_OZNACZEN = (
    "IEC 81346-1 — oznaczenie referencyjne jednoznaczne w obrębie obiektu nadrzędnego (pola)"
)

AKCJA_NAPRAWCZA_OZNACZEN_PL = (
    "nadaj aparatom pola różne oznaczenia w wyposażeniu pola na karcie pola (pole "
    "„Oznaczenie aparatu”) — np. łącznik szynowy Q1, wyłącznik Q0, uziemnik Q8"
)


@dataclass(frozen=True)
class ZdublowaneOznaczenie:
    """Jedno oznaczenie noszone przez dwa albo więcej aparatów tego samego pola."""

    bay_ref: str
    oznaczenie: str
    device_refs: tuple[str, ...]
    komunikat_pl: str


def klucz_oznaczenia(oznaczenie: str | None) -> str | None:
    """Postać porównawcza oznaczenia; `None` — aparat bez oznaczenia (nie uczestniczy)."""
    if oznaczenie is None:
        return None
    klucz = oznaczenie.strip().upper()
    return klucz or None


def _opis_aparatu(aparat: BayPrimaryDevice) -> str:
    return NAZWY_RODZAJOW_APARATU_POLA_PL.get(aparat.kind, "aparat")


def zdublowane_oznaczenia_pola(pole: Bay) -> list[ZdublowaneOznaczenie]:
    """Oznaczenia powtórzone w jednym polu (kolejność: pierwsze wystąpienie w wyposażeniu)."""
    grupy: dict[str, list[BayPrimaryDevice]] = {}
    for aparat in pole.primary_devices:
        klucz = klucz_oznaczenia(aparat.designation)
        if klucz is not None:
            grupy.setdefault(klucz, []).append(aparat)
    wynik: list[ZdublowaneOznaczenie] = []
    for klucz, aparaty in grupy.items():
        if len(aparaty) < 2:
            continue
        rodzaje = ", ".join(_opis_aparatu(a) for a in aparaty)
        komunikat = (
            f"{opis_obiektu(pole, 'Pole')}: {len(aparaty)} aparaty ({rodzaje}) noszą to samo "
            f"oznaczenie „{klucz}”. Oceniono jednoznaczność oznaczeń aparatów w polu względem "
            f"kryterium: {PODSTAWA_JEDNOZNACZNOSCI_OZNACZEN}. Wynik: oznaczenie wskazuje "
            f"{len(aparaty)} aparaty, limit — jeden aparat na oznaczenie. Skutek: polecenie "
            "łączeniowe i zapis w dokumentacji pola są niejednoznaczne; obliczenia sieci nie "
            "zależą od oznaczeń."
        )
        wynik.append(
            ZdublowaneOznaczenie(
                bay_ref=pole.ref_id,
                oznaczenie=klucz,
                device_refs=tuple(a.device_ref for a in aparaty),
                komunikat_pl=komunikat,
            )
        )
    return wynik


def zdublowane_oznaczenia(pola: Iterable[Bay]) -> list[ZdublowaneOznaczenie]:
    """Naruszenia wszystkich pól modelu w stałej kolejności (identyfikator pola)."""
    wynik: list[ZdublowaneOznaczenie] = []
    for pole in sorted(pola, key=lambda p: p.ref_id):
        wynik.extend(zdublowane_oznaczenia_pola(pole))
    return wynik
