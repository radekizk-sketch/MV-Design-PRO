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
* ``dokument`` — jeden serializer rekordu do bloku dokumentu formalnego (§10);
* ``proweniencja`` — JEDYNE definicje osi ``FieldQuality``, ``EvidenceTier`` i ``ClaimKind``
  (``solver_input.provenance`` je re-eksportuje).

Pakiet jest liściem także przechodnio: importuje wyłącznie stdlib, pydantic i własne moduły,
więc jego import nie ładuje ``solver_input``, ``domain``, ``network_model``, ``application`` ani
``analysis`` (test ``test_werdykt_lisc``).
"""

from werdykt.decyzja import (
    PochodneKryterium,
    PochodneWymagania,
    jednostka_marginesu,
    kompletnosc_dowodu,
    kompletnosc_kryterium,
    kompletnosc_wymagania,
    margines,
    metody_dopuszczalne,
    ocen_kryterium,
    przydatnosc_dowodu_wymagania,
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
    PoziomRekordu,
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
from werdykt.proweniencja import BRAK_DOWODU_PL, ClaimKind, EvidenceTier, FieldQuality
from werdykt.wyjasnienie import (
    format_liczba,
    format_wielkosc,
    wyjasnienie_kryterium,
    wyjasnienie_wymagania,
)

__all__ = [
    "BRAK_DOWODU_PL",
    "SLOWNIK_ETYKIET",
    "ClaimKind",
    "DanaPrzyjeta",
    "DziedzinaFizyki",
    "Etykieta",
    "EvidenceTier",
    "FieldQuality",
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
    "PoziomRekordu",
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
    "jednostka_marginesu",
    "margines",
    "metody_dopuszczalne",
    "ocen_kryterium",
    "przydatnosc_dowodu_wymagania",
    "status_kryterium",
    "status_wymagania",
    "wyjasnienie_kryterium",
    "wyjasnienie_wymagania",
    "wyprowadz_pola_kryterium",
    "wyprowadz_pola_wymagania",
    "zagreguj_wymaganie",
]
