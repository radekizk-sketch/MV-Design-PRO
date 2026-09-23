"""Werdykt wyjaśnialny — JEDYNE w produkcie typy i reguły kontraktu
``docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md``.

Status maszynowy (``SPELNIA`` / ``NIE_SPELNIA`` / ``NIEJEDNOZNACZNY`` / ``NIE_OCENIONO`` /
``BRAK_PODSTAWY`` / ``BRAK_DOWODU`` / ``NIE_DOTYCZY``) nie jest odpowiedzią inżynierską: każdy
rekord niesie kryterium, wynik z jednostką, limit z podstawą, margines, przyczynę, dowód,
zakres ważności, etykietę i wyjaśnienie złożone przez jeden generator.

Moduły:

* ``kontrakt`` — typy rekordu (poziom K ``OcenaKryterium``, poziom W ``WynikWymagania``) i ich
  walidacja przy konstrukcji;
* ``decyzja`` — reguła K (§2.2), agregacja W (§2.3), kompletność dowodu (§3), margines ze skalą
  (§2.4) i konstruktory ``ocen_kryterium`` / ``zagreguj_wymaganie``;
* ``wyjasnienie`` — jedyny generator tekstu werdyktu i formatowanie liczb;
* ``etykiety`` — jedyny słownik etykiet i semantyki koloru (§9);
* ``dokument`` — jeden serializer rekordu do bloku dokumentu formalnego (§10).

Importy bezpośrednie pakietu: stdlib, pydantic, ``solver_input.provenance``.
"""

from werdykt.decyzja import (
    PochodneKryterium,
    PochodneWymagania,
    kompletnosc_dowodu,
    kompletnosc_kryterium,
    kompletnosc_wymagania,
    margines,
    metody_dopuszczalne,
    ocen_kryterium,
    status_kryterium,
    status_wymagania,
    wyprowadz_pola_kryterium,
    wyprowadz_pola_wymagania,
    zagreguj_wymaganie,
)
from werdykt.dokument import PozycjaBloku, blok_kryterium, blok_wymagania
from werdykt.etykiety import SLOWNIK_ETYKIET, PozycjaSlownikaEtykiet, etykieta
from werdykt.kontrakt import (
    DanaPrzyjeta,
    DziedzinaFizyki,
    Etykieta,
    KompletnoscDowodu,
    Kryterium,
    LimitKryterium,
    Margines,
    MetodaDowodu,
    Niepewnosc,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    PokrycieProgramu,
    Przedmiot,
    PunktObwiedni,
    Relacja,
    RodzajPodstawy,
    RodzajSkali,
    SemantykaKoloru,
    StanDanych,
    StanZrodla,
    StatusDanych,
    StatusDowodu,
    StatusModelu,
    StatusWerdyktu,
    Stosowalnosc,
    Wielkosc,
    WyjasnienieWerdyktu,
    WynikKryterium,
    WynikWymagania,
    ZakresWaznosci,
)
from werdykt.wyjasnienie import (
    format_liczba,
    format_wielkosc,
    wyjasnienie_kryterium,
    wyjasnienie_wymagania,
)

__all__ = [
    "SLOWNIK_ETYKIET",
    "DanaPrzyjeta",
    "DziedzinaFizyki",
    "Etykieta",
    "KompletnoscDowodu",
    "Kryterium",
    "LimitKryterium",
    "Margines",
    "MetodaDowodu",
    "Niepewnosc",
    "OcenaKryterium",
    "OdnosnikSladu",
    "PochodneKryterium",
    "PochodneWymagania",
    "PodstawaWymagania",
    "PokrycieProgramu",
    "PozycjaBloku",
    "PozycjaSlownikaEtykiet",
    "Przedmiot",
    "PunktObwiedni",
    "Relacja",
    "RodzajPodstawy",
    "RodzajSkali",
    "SemantykaKoloru",
    "StanDanych",
    "StanZrodla",
    "StatusDanych",
    "StatusDowodu",
    "StatusModelu",
    "StatusWerdyktu",
    "Stosowalnosc",
    "Wielkosc",
    "WyjasnienieWerdyktu",
    "WynikKryterium",
    "WynikWymagania",
    "ZakresWaznosci",
    "blok_kryterium",
    "blok_wymagania",
    "etykieta",
    "format_liczba",
    "format_wielkosc",
    "kompletnosc_dowodu",
    "kompletnosc_kryterium",
    "kompletnosc_wymagania",
    "margines",
    "metody_dopuszczalne",
    "ocen_kryterium",
    "status_kryterium",
    "status_wymagania",
    "wyjasnienie_kryterium",
    "wyjasnienie_wymagania",
    "wyprowadz_pola_kryterium",
    "wyprowadz_pola_wymagania",
    "zagreguj_wymaganie",
]
