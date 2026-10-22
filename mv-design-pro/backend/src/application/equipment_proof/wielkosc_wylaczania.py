"""Wielkość zwarciowa porównywana ze zdolnością wyłączania aparatu — JEDNO źródło wyboru.

Karta SC-IB-ITH-ZRODLA (B-01 (n)). Zdolność wyłączania aparatu porównuje się z INNĄ wielkością
zwarciową zależnie od tego, jak aparat przerywa prąd:

* wyłącznik i reklozer SN/WN — IEC 62271-100:2008 § 4.101 (znamionowy prąd wyłączalny
  zwarciowy I_sc: wartość skuteczna składowej OKRESOWEJ prądu w chwili rozdzielenia styków,
  z osobno deklarowaną składową nieokresową) porównany z symetrycznym prądem wyłączeniowym I_b
  wg IEC 60909-0:2016 rozdz. 9 — wielkością, którą norma zwarciowa definiuje dla tej chwili
  (t_b = t_min). Przy udziale maszyn wirujących I_b < I″k; poza nimi I_b = I″k;
* aparat nN — IEC 60364-4-43:2008 p. 434.5.1 (zdolność wyłączania nie mniejsza niż największy
  SPODZIEWANY prąd zwarciowy w miejscu zainstalowania) i IEC 60947-2 (I_cu wyłącznika nN
  wobec prądu spodziewanego): porównanie z I″k;
* bezpiecznik (SN: IEC 60282-1, nN: IEC 60269-1) — bezpiecznik ograniczający przerywa prąd
  przed pierwszym szczytem, a jego znamionowa zdolność wyłączania odnosi się do prądu
  SPODZIEWANEGO; porównanie z I_b (prądem w chwili t_b, której bezpiecznik nie doczekuje)
  zaniżałoby wymaganie przy udziale maszyn — porównanie z I″k niezależnie od pasma.

Ten moduł jest jedynym miejscem wyboru: dowód doboru aparatury (``EquipmentProofGenerator``)
i ocena wytrzymałości aparatury pól stacji (``wytrzymalosc_aparatury_pol``) wołają tę samą
funkcję z tymi samymi danymi (napięcie znamionowe punktu zwarcia z biegu i znacznik
bezpiecznika z katalogu aparatu). Warstwa aplikacji — zero fizyki: wybór wielkości, nie
obliczenie.
"""

from __future__ import annotations

from dataclasses import dataclass

from network_model.pochodne.pasma_napieciowe import pasmo_napieciowe

__all__ = [
    "WIELKOSC_IB",
    "WIELKOSC_IKSS_BEZPIECZNIK",
    "WIELKOSC_IKSS_NN",
    "WielkoscKryteriumWylaczania",
    "wielkosc_kryterium_wylaczania",
]


@dataclass(frozen=True)
class WielkoscKryteriumWylaczania:
    """Wielkość zwarciowa porównywana ze zdolnością wyłączania aparatu i jej podstawa normowa.

    ``klucz`` — pole wyniku zwarciowego (``ib_ka`` / ``ikss_ka``); ``symbol`` — symbol LaTeX;
    ``nazwa_pl`` — mianownik (wynik kryterium), ``opis_pl`` — dopełniacz (zdanie porównania);
    ``dokument`` / ``wydanie`` / ``jednostka_redakcyjna`` — podstawa wymagania rekordu K;
    ``norma`` — skrót podstawy do dowodu doboru aparatury.
    """

    klucz: str
    symbol: str
    nazwa_pl: str
    opis_pl: str
    norma: str
    dokument: str
    wydanie: str
    jednostka_redakcyjna: str


WIELKOSC_IB = WielkoscKryteriumWylaczania(
    klucz="ib_ka",
    symbol="I_b",
    nazwa_pl="prąd wyłączeniowy symetryczny I_b",
    opis_pl="prądu wyłączeniowego symetrycznego I_b",
    norma="IEC 62271-100; IEC 60909-0:2016 rozdz. 9",
    dokument="IEC 62271-100 (PN-EN 62271-100) Wyłączniki prądu przemiennego wysokiego napięcia",
    wydanie="2008",
    jednostka_redakcyjna=(
        "§ 4.101 znamionowy prąd wyłączalny zwarciowy I_sc; I_b wg IEC 60909-0:2016 rozdz. 9"
    ),
)
WIELKOSC_IKSS_NN = WielkoscKryteriumWylaczania(
    klucz="ikss_ka",
    symbol="I_k''",
    nazwa_pl="spodziewany prąd zwarciowy początkowy I″k",
    opis_pl="spodziewanego prądu zwarciowego początkowego I″k",
    norma="IEC 60947-2; IEC 60364-4-43 p. 434.5.1",
    dokument="IEC 60364-4-43 (PN-HD 60364-4-43) Ochrona przed prądem przetężeniowym",
    wydanie="2008",
    jednostka_redakcyjna=(
        "p. 434.5.1 zdolność wyłączania nie mniejsza niż największy spodziewany prąd "
        "zwarciowy w miejscu zainstalowania"
    ),
)
WIELKOSC_IKSS_BEZPIECZNIK = WielkoscKryteriumWylaczania(
    klucz="ikss_ka",
    symbol="I_k''",
    nazwa_pl="spodziewany prąd zwarciowy początkowy I″k",
    opis_pl="spodziewanego prądu zwarciowego początkowego I″k",
    norma="IEC 60282-1 (bezpiecznik SN); IEC 60269-1 (bezpiecznik nN)",
    dokument="IEC 60282-1 (PN-EN 60282-1) Bezpieczniki wysokonapięciowe — bezpieczniki "
    "ograniczające prąd",
    wydanie="2020",
    jednostka_redakcyjna=(
        "znamionowy maksymalny prąd wyłączalny I_1 odniesiony do prądu spodziewanego "
        "(bezpiecznik ograniczający przerywa prąd przed pierwszym szczytem)"
    ),
)


def wielkosc_kryterium_wylaczania(
    u_kv: float | None, *, bezpiecznik: bool
) -> WielkoscKryteriumWylaczania | None:
    """JEDYNY predykat wyboru wielkości kryterium wyłączania.

    Bezpiecznik → I″k spodziewany (niezależnie od pasma). Pozostałe aparaty: pasmo napięcia
    punktu zwarcia (``pasmo_napieciowe``) — nN → I″k, SN/WN → I_b. ``None`` = aparat inny niż
    bezpiecznik przy biegu bez napięcia znamionowego punktu (wyboru nie da się ugruntować).
    """
    if bezpiecznik:
        return WIELKOSC_IKSS_BEZPIECZNIK
    pasmo = pasmo_napieciowe(u_kv)
    if pasmo is None:
        return None
    return WIELKOSC_IKSS_NN if pasmo == "nN" else WIELKOSC_IB
