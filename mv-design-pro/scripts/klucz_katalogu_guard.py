#!/usr/bin/env python3
"""Strażnik kontraktu: jeden klucz wiązania katalogowego w ładunku operacji domenowej.

PO CO (karta JEDEN-KLUCZ-KATALOGU). Pozycję katalogu w ładunku operacji wskazywały dwie
drogi naraz — wiązanie (``catalog_binding``/``<rola>_catalog_binding``) i zamiennik klucza
(``catalog_ref``, ``catalog_item_id`` obok wiązania, ``<rola>_catalog_ref`` obok
``<rola>_catalog_binding``). Brama API czytała je w innej kolejności niż operacja, więc
ładunek z dwiema różnymi wartościami był bramkowany po jednej, a zapisywany po drugiej.
Jedyny odczyt to ``enm.wiazanie_katalogowe.odczytaj_wiazanie``; ten strażnik pilnuje, żeby
KONTRAKT operacji (``domain.canonical_operations``) nie ogłaszał drugiej drogi:

1. pola operacji (``required ∪ optional``): obok klucza wiązania nie ma żadnego
   z jego zamienników (reguła ``zamienniki_klucza`` — ta sama funkcja, którą operacja
   i brama odrzucają zamiennik w ładunku);
2. kształty zagnieżdżone (``KSZTALTY_ZAGNIEZDZONE``) — ta sama reguła na każdym poziomie,
   a kształt wiązania (``_WIAZANIE_KATALOGOWE``) nie zawiera zamienników pól wiązania
   (``ZAMIENNIKI_W_WIAZANIU``);
3. każdy klucz wiązania w kształcie ma pod sobą kształt wiązania katalogowego;
4. żaden węzeł kontraktu nie niesie klucza ``catalog_ref`` ani ``<rola>_catalog_ref``
   (decyzja architekta: klucze ról przechodzą na ``<rola>_catalog_binding``) — poza polami
   MODELU wymienionymi jawnie w :data:`POLA_MODELU_W_LADUNKU`.

Pola MODELU niesione przez ładunek (``set_bay_equipment.devices[].catalog_ref`` — pole
urządzenia pola w modelu, nie wskazanie pozycji obok wiązania) reguła 1–2 przepuszcza,
bo węzeł nie niesie klucza wiązania; to jest jedyna droga wskazania w tym węźle.

Kod wyjścia: 0 — kontrakt czysty; 1 — naruszenia (wypisane); pusty kontrakt = błąd.
"""

from __future__ import annotations

import sys
from collections.abc import Mapping
from pathlib import Path

BACKEND_SRC = Path(__file__).resolve().parent.parent / "backend" / "src"


#: Ścieżki pól MODELU ENM niesionych przez ładunek (lista ZAMKNIĘTA, przypięta samotestem):
#: ``set_bay_equipment.devices[].catalog_ref`` to pole aparatu pola ``BayPrimaryDevice``
#: zapisywane wprost do rekordu pola, nie wskazanie pozycji ładunku.
POLA_MODELU_W_LADUNKU: frozenset[str] = frozenset({"set_bay_equipment.devices.catalog_ref"})


def _jest_kluczem_ref(klucz: str) -> bool:
    return klucz == "catalog_ref" or klucz.endswith("_catalog_ref")


def naruszenia_kluczy_ref(sciezka: str, pola: frozenset[str] | set[str]) -> list[str]:
    """Reguła 4: klucz ``catalog_ref``/``<rola>_catalog_ref`` w węźle kontraktu operacji."""
    return [
        f"{sciezka}: klucz „{klucz}” w ładunku operacji — pozycję wskazuje wiązanie "
        f"„{klucz[: -len('catalog_ref')]}catalog_binding”"
        for klucz in sorted(pola)
        if _jest_kluczem_ref(klucz) and f"{sciezka}.{klucz}" not in POLA_MODELU_W_LADUNKU
    ]


def _jest_kluczem_wiazania(klucz: str) -> bool:
    return klucz == "catalog_binding" or klucz.endswith("_catalog_binding")


def naruszenia_wezla(sciezka: str, pola: frozenset[str] | set[str]) -> list[str]:
    """Naruszenia reguły zamienników w jednym węźle kontraktu (zbiór kluczy)."""
    from enm.wiazanie_katalogowe import zamienniki_klucza

    wynik: list[str] = []
    for klucz in sorted(pola):
        if not _jest_kluczem_wiazania(klucz):
            continue
        for zamiennik in zamienniki_klucza(klucz):
            if zamiennik in pola:
                wynik.append(
                    f"{sciezka}: zamiennik „{zamiennik}” obok wiązania „{klucz}” — "
                    "pozycję wskazuje wyłącznie wiązanie"
                )
    return wynik


def naruszenia_ksztaltow(
    sciezka: str,
    ksztalty: Mapping[str, object],
    wiazanie: object,
) -> list[str]:
    """Rekurencyjnie: reguła zamienników + kształt wiązania pod każdym kluczem wiązania."""
    wynik: list[str] = []
    for klucz in sorted(ksztalty):
        ksztalt = ksztalty[klucz]
        s = f"{sciezka}.{klucz}"
        if _jest_kluczem_wiazania(klucz):
            if ksztalt is not wiazanie:
                wynik.append(f"{s}: klucz wiązania bez kształtu wiązania katalogowego")
            continue
        pola = getattr(ksztalt, "pola", frozenset())
        wynik.extend(naruszenia_wezla(s, pola))
        wynik.extend(naruszenia_kluczy_ref(s, pola))
        for k in sorted(pola):
            if _jest_kluczem_wiazania(k) and k not in getattr(ksztalt, "zagniezdzone", {}):
                wynik.append(f"{s}.{k}: klucz wiązania bez kształtu wiązania katalogowego")
        wynik.extend(naruszenia_ksztaltow(s, getattr(ksztalt, "zagniezdzone", {}), wiazanie))
    return wynik


def naruszenia_kontraktu(
    operacje: Mapping[str, object],
    ksztalty: Mapping[str, Mapping[str, object]],
    wiazanie: object,
) -> list[str]:
    from enm.wiazanie_katalogowe import ZAMIENNIKI_W_WIAZANIU

    wynik: list[str] = []
    for op in sorted(operacje):
        spec = operacje[op]
        pola = set(getattr(spec, "required_fields", ())) | set(getattr(spec, "optional_fields", ()))
        wynik.extend(naruszenia_wezla(op, pola))
        wynik.extend(naruszenia_kluczy_ref(op, pola))
        for k in sorted(pola):
            if _jest_kluczem_wiazania(k) and k not in ksztalty.get(op, {}):
                wynik.append(f"{op}.{k}: klucz wiązania bez kształtu wiązania katalogowego")
    for op in sorted(ksztalty):
        wynik.extend(naruszenia_ksztaltow(op, ksztalty[op], wiazanie))
    pola_wiazania = getattr(wiazanie, "pola", frozenset())
    for zamiennik in ZAMIENNIKI_W_WIAZANIU:
        if zamiennik in pola_wiazania:
            wynik.append(f"kształt wiązania: zamiennik pola „{zamiennik}”")
    return wynik


def main() -> int:
    sys.path.insert(0, str(BACKEND_SRC))
    from domain.canonical_operations import (
        _WIAZANIE_KATALOGOWE,
        CANONICAL_OPERATIONS,
        KSZTALTY_ZAGNIEZDZONE,
    )

    if not CANONICAL_OPERATIONS:
        print("klucz_katalogu_guard: pusty kontrakt operacji — skan nic nie sprawdził")
        return 1
    wynik = naruszenia_kontraktu(CANONICAL_OPERATIONS, KSZTALTY_ZAGNIEZDZONE, _WIAZANIE_KATALOGOWE)
    if wynik:
        print(f"klucz_katalogu_guard: {len(wynik)} naruszeń kontraktu jednego klucza wiązania:")
        for linia in wynik:
            print(f"  - {linia}")
        return 1
    print(
        f"klucz_katalogu_guard: OK — {len(CANONICAL_OPERATIONS)} operacji, "
        f"{len(KSZTALTY_ZAGNIEZDZONE)} kształtów zagnieżdżonych bez zamienników wiązania"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
