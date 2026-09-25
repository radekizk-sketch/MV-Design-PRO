"""Kontrakty dziedziny częstotliwości i sekcji modelu urządzenia (karta AB-H0, decyzja O-45).

Pakiet-LIŚĆ grafu importów backendu. Moduły:

* ``kanon`` — rekord zamrożony, kanoniczny JSON i odcisk SHA-256, przedział z domknięciem;
* ``pomiar`` — parametry pomiaru widma (część danych widma);
* ``widmo`` — modele źródeł widmowych, składowe, punkt pracy, odniesienia, wybór modelu;
* ``pasmo`` — definicja pasma widma (dana z dokumentu);
* ``sekcje`` — rodzaje sekcji modelu urządzenia, JEDNA funkcja statusu sekcji
  i odwzorowanie na ``StatusModelu``;
* ``karta_widmowa`` — rekord karty widmowej (import i katalog) oraz nośnik w ENM;
* ``jakosc_energii`` — typ wymagania jakości energii i JEDNA funkcja stosowalności;
* ``dziedzina_analizy`` — JEDNA mapa rodzaj analizy → dziedziny fizyki.

LISTA IMPORTÓW ZAMKNIĘTA (strażnik ``scripts/dziedziny_granica_importow_guard.py``):
stdlib (``__future__``, ``collections.abc``, ``dataclasses``, ``datetime``, ``decimal``,
``enum``, ``hashlib``, ``json``, ``math``, ``re``, ``types``, ``typing``), ``pydantic``,
``werdykt.kontrakt``, ``werdykt.proweniencja`` i moduły własne pakietu. Zakaz:
``network_model`` (także ``pochodne``), ``enm``, ``catalog``, ``application``, ``api``,
``analysis``, ``solvers``, ``solver_input``, ``infrastructure``, ``domain``.

Zero fizyki (liść nie przelicza procentów na ampery, nie interpoluje widm), zero domyślek
liczbowych w polach fizycznych (strażnik zero-default).

Ten plik jest wyłącznie re-eksportem — bez logiki.
"""

from dziedziny.dziedzina_analizy import MAPA_DZIEDZIN, PozaDziedzinami, dziedziny_rodzaju
from dziedziny.jakosc_energii import (
    AgregacjaWymagania,
    ParametrMetody,
    PozycjaTabeliLimitow,
    PrzedmiotOceny,
    WymaganieJakosciEnergii,
    ZakresNapieciaWymagania,
    ZakresPasma,
    stosowalnosc_wymagania_jakosci,
)
from dziedziny.kanon import KontraktDziedziny, Przedzial
from dziedziny.karta_widmowa import (
    KartaWidmowa,
    ModeleWidmoweElementu,
    OdniesienieKarty,
    materializuj_modele_widmowe,
)
from dziedziny.pasmo import PasmoWidma, modele_niezgodne_z_pasmem
from dziedziny.pomiar import AgregacjaPomiaru, KalibracjaPomiaru, OknoPomiaru, ParametryPomiaru
from dziedziny.sekcje import (
    DZIEDZINY_SEKCJI,
    SEKCJE,
    BrakModelu,
    DowodModelu,
    OcenaSekcji,
    OcenaSkladnika,
    PoleSekcji,
    RodzajSekcjiModelu,
    SkladnikSekcji,
    StatusSekcji,
    WejscieStatusuSekcji,
    status_modelu_z_sekcji,
    status_sekcji,
)
from dziedziny.widmo import (
    ModelParametryczny,
    ModelWybrany,
    ModelZrodlaWidmowego,
    NiejednoznacznyWybor,
    OdniesienieAmplitudy,
    OdniesienieFazy,
    ParametrModelu,
    PozaDomenaModelu,
    PunktAdmitancji,
    PunktImpedancji,
    PunktPracyWidma,
    SkladowaWidma,
    ZakresCzestotliwosci,
    ZapytaniePunktuPracy,
    faza_znana,
    rzad_harmonicznej,
    wybierz_model,
)

__all__ = [
    "DZIEDZINY_SEKCJI",
    "MAPA_DZIEDZIN",
    "SEKCJE",
    "AgregacjaPomiaru",
    "AgregacjaWymagania",
    "BrakModelu",
    "DowodModelu",
    "KalibracjaPomiaru",
    "KartaWidmowa",
    "KontraktDziedziny",
    "ModelParametryczny",
    "ModelWybrany",
    "ModelZrodlaWidmowego",
    "ModeleWidmoweElementu",
    "NiejednoznacznyWybor",
    "OcenaSekcji",
    "OcenaSkladnika",
    "OdniesienieAmplitudy",
    "OdniesienieFazy",
    "OdniesienieKarty",
    "OknoPomiaru",
    "ParametrMetody",
    "ParametrModelu",
    "ParametryPomiaru",
    "PasmoWidma",
    "PoleSekcji",
    "PozaDomenaModelu",
    "PozaDziedzinami",
    "PozycjaTabeliLimitow",
    "PrzedmiotOceny",
    "Przedzial",
    "PunktAdmitancji",
    "PunktImpedancji",
    "PunktPracyWidma",
    "RodzajSekcjiModelu",
    "SkladnikSekcji",
    "SkladowaWidma",
    "StatusSekcji",
    "WejscieStatusuSekcji",
    "WymaganieJakosciEnergii",
    "ZakresCzestotliwosci",
    "ZakresNapieciaWymagania",
    "ZakresPasma",
    "ZapytaniePunktuPracy",
    "dziedziny_rodzaju",
    "faza_znana",
    "materializuj_modele_widmowe",
    "modele_niezgodne_z_pasmem",
    "rzad_harmonicznej",
    "status_modelu_z_sekcji",
    "status_sekcji",
    "stosowalnosc_wymagania_jakosci",
    "wybierz_model",
]
