"""Rekordy werdyktu wyjaśnialnego zgodności referencyjnej (karta WERDYKT-MIGRACJA-190, E61/D71/D72).

Dawniej każde sprawdzenie silnika zgodności niosło goły status ``pass``/``fail``, a trzy ekrany
(diagnostyka ENM, przestrzeń „Gotowość”, właściwości elementu) tłumaczyły go na ✓/✗ i kolor,
a wynik pakietu (Reference Score) kolorowały własnym progiem okna 100 % / 80 %. Teraz:

- sprawdzenie niesie rekord K (relacja logiczna): przedmiot z nazwą z modelu, kryterium z tabeli
  reguł niżej, podstawa z pakietu (dokument, wersja pakietu, jednostka redakcyjna), stan
  stwierdzony (treść sprawdzenia) i dowód (konfiguracja w modelu porównana z pakietem —
  deklaracja, zdolność ``referencje.zgodnosc_konfiguracji``);
- pakiet nie niesie zbiorczego werdyktu: liczniki ``passed``/``failed`` liczone są ze statusów
  rekordów K, a wynik pakietu (Reference Score, ``score_percent``) jest miarą udziału, nie
  oceną — ekran pokazuje go bez koloru werdyktu; ``score_percent = None`` przy braku
  sprawdzeń (brak sprawdzeń ≠ zgodny). Rekord W pakietu powielałby każdy rekord K w ładunku
  (pomiar: 50 sprawdzeń — 190 KB rekordów K, drugie tyle w W);
- predykat sprawdzenia ma JEDNO źródło: ``compliance.Sprawdzenie.spelniony`` — walidacja na żywo
  czyta ten sam obiekt, raport opakowuje go rekordem.

Warstwa interpretacji — zero fizyki: wyłącznie porównanie przez pakiet ``werdykt``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    OcenaKryterium,
    PodstawaWymagania,
    Przedmiot,
    ZakresWaznosci,
)
from werdykt.porownanie import (
    Porownanie,
    ocena_porownania,
    podstawa_normy,
    podstawa_osd,
)

from .models import ReferencePack

#: Zdolność dowodowa zgodności referencyjnej (rejestr ``solver_input.provenance``).
ZDOLNOSC_ZGODNOSCI_REFERENCYJNEJ: Final = "referencje.zgodnosc_konfiguracji"

_ODNIESIENIE: Final = "reference_engine/compliance.py"

_ZAKRES: Final = ZakresWaznosci(
    opis_pl=(
        "Konfiguracja pól rozdzielnic SN i stacji zapisana w modelu (skład, kolejność, położenie "
        "i stany aparatów, konstrukcja stacji, moc transformatorów, pomiary) porównana z "
        "regułami pakietu referencyjnego."
    ),
    wykluczenia=(
        "parametry znamionowe aparatów (prądy, wytrzymałości zwarciowe) — ocenia je dobór "
        "aparatury",
        "pola rozdzielnic nN",
        "reguły pakietu oznaczone jako nieegzekwowane w programie",
    ),
)


@dataclass(frozen=True)
class OpisReguly:
    """Kryterium reguły (CO jest wymagane) i jednostka redakcyjna jej podstawy."""

    kryterium_pl: str
    wielkosc_pl: str
    jednostka_pl: str


#: Reguły silnika zgodności: prefiks ``rule_code`` → opis kryterium. Lista ZAMKNIĘTA — kod
#: reguły spoza listy jest błędem programu (``opis_reguly`` podnosi wyjątek; test
#: ``test_kazda_regula_silnika_ma_opis`` przechodzi wszystkie reguły pakietów).
_OPISY_REGUL: Final[tuple[tuple[str, OpisReguly], ...]] = (
    (
        "profile.required.",
        OpisReguly(
            "Pole ma aparat wymagany profilem pola",
            "obecność aparatu wymaganego w polu",
            "profil pola — aparaty wymagane",
        ),
    ),
    (
        "profile.one_of.",
        OpisReguly(
            "Tor pola ma funkcję łączeniową — co najmniej jeden aparat z grupy profilu",
            "obecność aparatu łączeniowego toru",
            "profil pola — grupa aparatów łączeniowych",
        ),
    ),
    (
        "profile.forbidden",
        OpisReguly(
            "Pole nie ma aparatów zakazanych dla profilu",
            "obecność aparatów zakazanych",
            "profil pola — aparaty zakazane",
        ),
    ),
    (
        "profile.order",
        OpisReguly(
            "Kolejność aparatów toru głównego zgodna z kolejnością kanoniczną profilu (od szyny "
            "w dół)",
            "kolejność aparatów toru głównego",
            "profil pola — kolejność kanoniczna toru",
        ),
    ),
    (
        "profile.lateral_placement.",
        OpisReguly(
            "Aparat boczny (uziemnik, przekładnik napięciowy, ogranicznik przepięć) leży poza "
            "osią toru",
            "położenie aparatu bocznego",
            "profil pola — aparaty boczne",
        ),
    ),
    (
        "iec62271.interlock.",
        OpisReguly(
            "Uziemnik pola nie jest zamknięty przy zamkniętym łączniku toru głównego",
            "stan uziemnika wobec łącznika toru",
            "blokada uziemnika z łącznikiem toru głównego",
        ),
    ),
    (
        "iec60617.symbols_mapped",
        OpisReguly(
            "Każdy aparat pola ma symbol w słowniku symboli",
            "symbole aparatów pola w słowniku",
            "słownik symboli graficznych aparatów",
        ),
    ),
    (
        "family.bay_kind",
        OpisReguly(
            "Rodzaj pola jest dostępny w rodzinie rozdzielnicy",
            "rodzaj pola w ofercie rodziny",
            "karta rodziny — dostępne rodzaje pól",
        ),
    ),
    (
        "family.apparatus.",
        OpisReguly(
            "Aparat pola należy do słownika aparatów rodziny rozdzielnicy",
            "aparat pola w słowniku rodziny",
            "karta rodziny — słownik aparatów",
        ),
    ),
    (
        "family.voltage",
        OpisReguly(
            "Napięcie sieci jest objęte deklaracją napięć rodziny rozdzielnicy",
            "napięcie sieci w deklaracji rodziny",
            "karta rodziny — napięcia sieci i klasy napięcia Um",
        ),
    ),
    (
        "family.cell_match",
        OpisReguly(
            "Skład pola odpowiada konfiguracji celki z katalogu producenta",
            "dopasowanie składu pola do celki katalogowej",
            "karta rodziny — konfiguracje celek",
        ),
    ),
    (
        "osd_enea.station.prefabricated_compact_preferred",
        OpisReguly(
            "Stacja SN/nN w rozwiązaniu podstawowym standardu — stacja kompaktowa prefabrykowana",
            "konstrukcja stacji",
            "Zeszyt 1 rozdz. 2 s. 3",
        ),
    ),
    (
        "osd_enea.station.pole_station_cable_entry_forbidden",
        OpisReguly(
            "Stacja słupowa bez kablowego podejścia SN",
            "podejście SN stacji słupowej",
            "Zeszyt 3 rozdz. 2 s. 3",
        ),
    ),
    (
        "osd_enea.station.transformer_power_limit",
        OpisReguly(
            "Moc transformatora nie większa od granicy dla konstrukcji stacji",
            "moc znamionowa transformatora wobec granicy konstrukcji",
            "Zeszyt 1 rys. 1 s. 10; Zeszyt 3 §4.1 s. 7",
        ),
    ),
    (
        "osd_enea.station.bay_composition",
        OpisReguly(
            "Skład rozdzielnicy SN stacji w zakresie standardu: jedno pole transformatorowe, od "
            "jednego do czterech pól liniowych, najwyżej pięć pól",
            "skład pól rozdzielnicy SN",
            "Zeszyt 1 §4.1.2 i §4.3.1; Zeszyt 2 §4.3.1",
        ),
    ),
    (
        "osd_enea.telemechanika.line_bay_u_i_measurement",
        OpisReguly(
            "Pole liniowe zdalnie sterowane ma pomiar napięcia i prądu",
            "pomiary napięcia i prądu pola liniowego",
            "Telemechanika §6.4.1 s. 14",
        ),
    ),
    (
        "osd_enea.metering.control_metering_above_5mw",
        OpisReguly(
            "Obiekt o mocy przyłączeniowej powyżej 5 MW ma układ pomiarowo-kontrolny",
            "układ pomiarowo-kontrolny obiektu",
            "standard układów pomiarowych [E-UP] pkt 3 w związku z IRiESD",
        ),
    ),
)


def opis_reguly(rule_code: str) -> OpisReguly:
    """Opis kryterium reguły silnika zgodności (lista zamknięta — reguła bez opisu to błąd)."""
    for prefiks, opis in _OPISY_REGUL:
        if rule_code.startswith(prefiks):
            return opis
    raise KeyError(f"Reguła zgodności referencyjnej bez opisu kryterium: {rule_code}")


def podstawa_pakietu(pack: ReferencePack, jednostka_pl: str) -> PodstawaWymagania:
    """Podstawa reguły z pakietu: rodzaj z rodzaju pakietu, wersja pakietu jako wydanie."""
    wydanie = f"pakiet referencyjny programu w wersji {pack.version}"
    if pack.kind == "osd":
        return podstawa_osd(pack.name_pl, jednostka_pl, wydanie=wydanie)
    if pack.kind == "manufacturer":
        return PodstawaWymagania(
            rodzaj="KATALOG_PRODUCENTA",
            dokument=pack.name_pl,
            wydanie=wydanie,
            jednostka_redakcyjna=jednostka_pl,
            status="WSKAZANE",
        )
    return podstawa_normy(
        pack.source_document_refs[0] if pack.source_document_refs else pack.name_pl,
        wydanie,
        jednostka_pl,
        uwagi_pl=(
            f"reguły pakietu „{pack.name_pl}” są odwzorowaniem normy w programie (profil pola, "
            "słownik symboli), nie cytatem jej treści"
        ),
    )


def ocena_sprawdzenia(
    *,
    pack: ReferencePack,
    element_ref: str,
    nazwa_elementu_pl: str,
    rule_code: str,
    wystapienie: int,
    spelniony: bool,
    message_pl: str,
) -> OcenaKryterium:
    """Rekord K jednego sprawdzenia (stan stwierdzony = treść sprawdzenia silnika).

    ``wystapienie`` — numer kolejny tej reguły dla tego elementu (od 1); identyfikator
    kryterium jest unikalny w rekordzie W pakietu.
    """
    opis = opis_reguly(rule_code)
    przyrostek = "" if wystapienie == 1 else f".{wystapienie}"
    return ocena_porownania(
        Porownanie(
            kryterium_id=f"referencje.{pack.pack_id}.{element_ref}.{rule_code}{przyrostek}",
            opis_pl=opis.kryterium_pl,
            relacja="LOGICZNE",
            wielkosc_pl=opis.wielkosc_pl,
            spelniony=spelniony,
            stan_pl=message_pl,
            metoda_wyniku="DEKLARACJA",
        ),
        przedmiot=Przedmiot(
            element_ref=element_ref,
            nazwa_pl=nazwa_elementu_pl,
            opis_pl=f"{nazwa_elementu_pl} wobec pakietu referencyjnego „{pack.name_pl}”",
        ),
        podstawa=podstawa_pakietu(pack, opis.jednostka_pl),
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_ZGODNOSCI_REFERENCYJNEJ),
        zakres=_ZAKRES,
        odniesienie=_ODNIESIENIE,
    )
