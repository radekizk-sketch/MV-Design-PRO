"""Reguły zapisu fikstur generowanych z backendu: liczby i identyfikatory elementów ENM.

1. JEDNA reguła zapisu liczb we wszystkich fiksturach (niżej).
2. JEDNA reguła identyfikatora technicznego elementu ENM (``identyfikator_elementu``):
   ``ENMElement.id`` jest losowany (``uuid4``) przy każdej walidacji modelu, więc fikstura
   ENM bez przypięcia zmieniała się przy KAŻDEJ regeneracji w setkach miejsc (zmierzone na
   substracie 52 stacji: 738 liści między dwoma biegami). Trzy generatory miały trzy
   własne przepisy z trzema przestrzeniami nazw (harness, sieć pokazowa, DEMO-OZE-SC),
   a generator substratu żadnego — deklarował bajtową stabilność bez testu.

REGUŁA LICZB: każda liczba zmiennoprzecinkowa zapisywana w fiksturze ma co najwyżej
``CYFRY_ZNACZACE`` cyfr znaczących (zaokrąglenie ``format(x, ".{N}g")``), a zero jest
zapisywane bez znaku (``-0.0`` -> ``0.0``: znak zera rozstrzyga szum, nie fizyka). Liczby
całkowite, wartości logiczne, NaN i nieskończoności bez zmian.

DLACZEGO (karta SLD-SUBSTRAT §0 pkt 5). Porównanie bajtowe fikstury z wyjściem generatora
ma sens tylko wtedy, gdy generator daje te same bajty na każdej maszynie. Surowy ``repr``
liczby niesie 17 cyfr znaczących, z których ostatnie są szumem numeryki (BLAS/LAPACK,
kolejność sumowania, biblioteka matematyczna) — pomiar na tej maszynie:
``eksport_fixtur_harnessu.py --sprawdz`` czerwony na czubku w 7 plikach, różnice względne
1e-16…3e-5 wobec plików zatwierdzonych na innej maszynie.

DOBÓR ``CYFRY_ZNACZACE = 12`` (dowód w meldunku karty):
* tolerancje konsumentów z zapasem — błąd względny zaokrąglenia <= 5·10⁻¹²; najciaśniejsza
  tolerancja WZGLĘDNA konsumenta to 1e-9 (projekcje domeny nN,
  ``eksport_fixtur_projekcji_nn.TOLERANCJA_WZGLEDNA_MIEDZY_MASZYNAMI``) — zapas x200; harness
  ``RTOL_FIXTUR = 1e-4`` — zapas x2·10⁷; pasmo wielkości bezwymiarowych 1e-9 (bezwzględne,
  wartości <= 1) — zapas x200; pasmo zera 1e-8 — zaokrąglenie wartości rzędu 1e-8 przesuwa
  ją o <= 5e-20;
* konsumenci frontendu nie widzą zmiany ostatnich cyfr — dowodem jest bieg vitest
  wszystkich katalogów czytających fikstury, zielony po regeneracji (meldunek karty), a nie
  założenie o liczbie cyfr pokazywanych na ekranach;
* szum usunięty tam, gdzie leży poniżej 12. cyfry — pomiar na 4 wariantach numeryki
  (OpenBLAS: domyślny, 1 wątek, rdzeń Haswell, rdzeń Sandybridge) i pliku zatwierdzonym na
  innej maszynie dla 7 plików rozjechanych: bez reguły rozjazd w 7 plikach, z regułą w 5
  (falowniki i diagnoza stabilne; zostają: reszty znormalizowane estymacji WLS — szum
  względny do 3e-5, niedopasowanie po zbieżności rzędu 1e-12 — sam szum, pozostałe
  przepływy rozpływu z szumem 1e-11, skrót wyniku nad takimi liczbami). ŻADNA stała liczba
  cyfr nie usuwa szumu sięgającego 5. cyfry (przy 6 cyfrach nadal 45 liści estymacji) —
  dla tych generatorów obowiązuje dodatkowo KOTWICA W SZUMIE (plik na dysku zostaje, gdy
  świeża odpowiedź różni się od niego wyłącznie w tolerancji zmierzonej testem tego
  generatora): ``eksport_fixtur_harnessu.tresc_do_zapisu`` i
  ``eksport_fixtur_projekcji_nn.tresc_do_zapisu``.
"""

from __future__ import annotations

import json
import math
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

#: Liczba cyfr znaczących liczby zmiennoprzecinkowej w fiksturze (dobór: docstring).
CYFRY_ZNACZACE = 12


def zaokraglij_liczbe(x: float) -> float:
    """Liczba wg reguły zapisu fikstur (pin: ``tests/golden/test_zapis_fikstur.py``)."""
    if math.isnan(x) or math.isinf(x):
        return x
    wynik = float(format(x, f".{CYFRY_ZNACZACE}g"))
    return 0.0 if wynik == 0.0 else wynik


def zaokraglij_liczby(dane: Any) -> Any:
    """Kopia struktury JSON z każdą liczbą zmiennoprzecinkową wg reguły."""
    if isinstance(dane, bool):
        return dane
    if isinstance(dane, float):
        return zaokraglij_liczbe(dane)
    if isinstance(dane, dict):
        return {klucz: zaokraglij_liczby(wartosc) for klucz, wartosc in dane.items()}
    if isinstance(dane, list | tuple):
        return [zaokraglij_liczby(wartosc) for wartosc in dane]
    return dane


def json_fikstury(dane: Any, *, sort_keys: bool = True, indent: int = 2) -> str:
    """Tekst fikstury JSON: reguła liczb + UTF-8 bez escapowania + znak nowej linii."""
    return (
        json.dumps(zaokraglij_liczby(dane), ensure_ascii=False, sort_keys=sort_keys, indent=indent)
        + "\n"
    )


def identyfikator_elementu(ref_id: str) -> UUID:
    """Identyfikator techniczny elementu ENM wyprowadzony z ``ref_id`` (tożsamości domenowej).

    Graf, solvery i API czytają wyłącznie ``ref_id``; ``id`` jest identyfikatorem
    technicznym, więc odwzorowanie wzajemnie jednoznaczne ``ref_id`` -> ``uuid5`` nie zmienia
    żadnej wielkości ani tożsamości. Przestrzeń nazw jest tą, którą harness scen stosował
    od karty HARNESS-RESZTA-2 (jego fikstury i skróty wejścia pozostają bez zmian)."""
    return uuid5(NAMESPACE_URL, f"mv-design-pro:harness:element-id:{ref_id}")


def przypnij_identyfikatory_modelu(enm: Any) -> None:
    """Nadpisuje ``id`` każdego elementu KAŻDEJ kolekcji modelu ENM (w miejscu).

    Iteracja po polach modelu, nie po wypisanej liście kolekcji — nowa kolekcja ENM jest
    objęta automatycznie. Podmiana ``uuid4`` w module nie działa: Pydantic wiąże obiekt
    funkcji ``default_factory`` przy definicji klasy, więc skuteczne jest tylko nadpisanie
    po konstrukcji."""
    for nazwa_pola in type(enm).model_fields:
        wartosc = getattr(enm, nazwa_pola, None)
        if not isinstance(wartosc, list):
            continue
        for element in wartosc:
            ref_id = getattr(element, "ref_id", None)
            if isinstance(ref_id, str) and hasattr(element, "id"):
                element.id = identyfikator_elementu(ref_id)


def przypnij_identyfikatory_zrzutu(enm: dict[str, Any]) -> None:
    """To samo dla zrzutu JSON modelu (``model_dump(mode="json")``, odpowiedź API)."""
    for kolekcja in enm.values():
        if not isinstance(kolekcja, list):
            continue
        for element in kolekcja:
            if isinstance(element, dict) and "id" in element and element.get("ref_id"):
                element["id"] = str(identyfikator_elementu(str(element["ref_id"])))
