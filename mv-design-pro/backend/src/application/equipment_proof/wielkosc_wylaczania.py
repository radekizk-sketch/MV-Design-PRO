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
    "NAZWA_ZNAMIENIA_NIEUSTALONA_PL",
    "SYMBOL_ZNAMIENIA_NIEUSTALONY",
    "WIELKOSC_IB",
    "WIELKOSC_IKSS_BEZPIECZNIK",
    "WIELKOSC_IKSS_NN",
    "WielkoscKryteriumWylaczania",
    "wielkosc_kryterium_wylaczania",
]


@dataclass(frozen=True)
class WielkoscKryteriumWylaczania:
    """Wielkość zwarciowa porównywana ze zdolnością wyłączania aparatu i jej podstawa normowa.

    ``klucz`` — pole wyniku zwarciowego (``ib_ka`` / ``ikss_ka``); ``symbol_latex`` — symbol
    LaTeX;
    ``nazwa_pl`` — mianownik (wynik kryterium), ``opis_pl`` — dopełniacz (zdanie porównania);
    ``dokument`` / ``wydanie`` / ``jednostka_redakcyjna`` — podstawa wymagania rekordu K;
    ``norma`` — skrót podstawy do dowodu doboru aparatury;
    ``symbol_znamienia_latex`` / ``nazwa_znamienia_pl`` / ``paragraf_znamienia`` — ZNAMIĘ aparatu, z
    którym wielkość się porównuje, nazwane wg normy aparatu TEGO pasma: wyłącznik SN/WN ma
    znamionowy prąd wyłączalny zwarciowy I_sc (IEC 62271-100 § 4.101), wyłącznik nN graniczną
    zdolność wyłączania zwarciowego I_cu (IEC 60947-2), bezpiecznik SN znamionowy maksymalny
    prąd wyłączalny I_1 (IEC 60282-1). Nazwa znamienia idzie za tym samym predykatem co
    porównywana wielkość — I_cu przy aparacie SN to błąd normowy (karta APARATURA-TABELA).

    Proza (``nazwa_pl``, ``opis_pl``, ``jednostka_redakcyjna``, ``nazwa_znamienia_pl``,
    ``paragraf_znamienia``) nazywa wielkości SŁOWAMI, bez symbolu (karta KD6): trafia do
    podstaw rekordów K, zdań werdyktu, dokumentu werdyktu i podpowiedzi ekranu, które
    pokazują tekst; symbol renderuje się wyłącznie z pól ``*_latex``
    (strażnik ``ui_math_guard``).
    """

    klucz: str
    symbol_latex: str
    nazwa_pl: str
    opis_pl: str
    norma: str
    dokument: str
    wydanie: str
    jednostka_redakcyjna: str
    symbol_znamienia_latex: str
    nazwa_znamienia_pl: str
    paragraf_znamienia: str

    @property
    def wielkosc_zwarciowa(self) -> str:
        """Klucz wielkości zwarciowej punktu (``ib`` / ``ikss``) — dobór danych przyjętych
        maszyn wirujących (`wartosci_robocze.dane_przyjete_maszyn`) z TEGO SAMEGO pola wyniku."""
        return self.klucz.removesuffix("_ka")


WIELKOSC_IB = WielkoscKryteriumWylaczania(
    klucz="ib_ka",
    symbol_latex="I_b",
    nazwa_pl="prąd wyłączeniowy symetryczny",
    opis_pl="prądu wyłączeniowego symetrycznego",
    norma="IEC 62271-100; IEC 60909-0:2016 rozdz. 9",
    dokument="IEC 62271-100 (PN-EN 62271-100) Wyłączniki prądu przemiennego wysokiego napięcia",
    wydanie="2008",
    jednostka_redakcyjna=(
        "§ 4.101 znamionowy prąd wyłączalny zwarciowy; prąd wyłączeniowy wg IEC 60909-0:2016 "
        "rozdz. 9"
    ),
    symbol_znamienia_latex="I_{sc}",
    nazwa_znamienia_pl="znamionowy prąd wyłączalny zwarciowy",
    paragraf_znamienia="IEC 62271-100 § 4.101 znamionowy prąd wyłączalny zwarciowy",
)
WIELKOSC_IKSS_NN = WielkoscKryteriumWylaczania(
    klucz="ikss_ka",
    symbol_latex="I_k''",
    nazwa_pl="spodziewany prąd zwarciowy początkowy",
    opis_pl="spodziewanego prądu zwarciowego początkowego",
    norma="IEC 60947-2; IEC 60364-4-43 p. 434.5.1",
    dokument="IEC 60364-4-43 (PN-HD 60364-4-43) Ochrona przed prądem przetężeniowym",
    wydanie="2008",
    jednostka_redakcyjna=(
        "p. 434.5.1 zdolność wyłączania nie mniejsza niż największy spodziewany prąd "
        "zwarciowy w miejscu zainstalowania"
    ),
    symbol_znamienia_latex="I_{cu}",
    nazwa_znamienia_pl="znamionowa graniczna zdolność wyłączania zwarciowego",
    paragraf_znamienia="IEC 60947-2 znamionowa graniczna zdolność wyłączania zwarciowego",
)
WIELKOSC_IKSS_BEZPIECZNIK = WielkoscKryteriumWylaczania(
    klucz="ikss_ka",
    symbol_latex="I_k''",
    nazwa_pl="spodziewany prąd zwarciowy początkowy",
    opis_pl="spodziewanego prądu zwarciowego początkowego",
    norma="IEC 60282-1 (bezpiecznik SN); IEC 60269-1 (bezpiecznik nN)",
    dokument="IEC 60282-1 (PN-EN 60282-1) Bezpieczniki wysokonapięciowe — bezpieczniki "
    "ograniczające prąd",
    wydanie="2020",
    jednostka_redakcyjna=(
        "znamionowy maksymalny prąd wyłączalny odniesiony do prądu spodziewanego "
        "(bezpiecznik ograniczający przerywa prąd przed pierwszym szczytem)"
    ),
    symbol_znamienia_latex="I_{1}",
    nazwa_znamienia_pl="znamionowy maksymalny prąd wyłączalny bezpiecznika",
    paragraf_znamienia=(
        "IEC 60282-1 znamionowy maksymalny prąd wyłączalny (bezpiecznik nN: znamionowa "
        "zdolność wyłączania wg IEC 60269-1)"
    ),
)

#: Znamię zdolności wyłączania, gdy pasma punktu nie da się ustalić (bieg bez napięcia
#: znamionowego punktu) — nazwa ogólna, bez przypisywania symbolu normy jednego pasma.
SYMBOL_ZNAMIENIA_NIEUSTALONY = r"I_{\mathrm{wył}}"
NAZWA_ZNAMIENIA_NIEUSTALONA_PL = (
    "znamionowa zdolność wyłączania zwarciowa aparatu (znamionowy prąd wyłączalny zwarciowy "
    "wyłącznika SN/WN wg IEC 62271-100 albo znamionowa graniczna zdolność wyłączania "
    "zwarciowego wyłącznika nN wg IEC 60947-2 — zależnie od pasma punktu)"
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
