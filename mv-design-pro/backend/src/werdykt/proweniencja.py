"""Osie proweniencji wyniku: jakość danej, poziom dowodowy zdolności, rodzaj twierdzenia.

JEDYNE definicje ``FieldQuality``, ``EvidenceTier`` i ``ClaimKind`` w produkcie (wraz z
etykietami PL i zdaniem kanonicznym ``BRAK_DOWODU_PL``). Przeniesione z
``solver_input.provenance``, żeby pakiet ``werdykt`` był liściem także PRZECHODNIO: import
``solver_input.provenance`` wykonuje ``solver_input/__init__.py``, który ładuje budowniczego
wejścia solverów razem z modułami ``domain`` i ``network_model``. ``solver_input.provenance``
re-eksportuje te same obiekty klas, więc tożsamość typów jest zachowana dla wszystkich
konsumentów (``solver_input.provenance.ClaimKind is werdykt.proweniencja.ClaimKind``).

Moduł importuje wyłącznie stdlib.
"""

from __future__ import annotations

from enum import StrEnum


class FieldQuality(StrEnum):
    """Data-quality provenance axis for a single card field.

    Orthogonal to ``solver_input.provenance.SourceKind`` (which records *where* a value came
    from in the pipeline). ``FieldQuality`` records *how trustworthy* the value is:

    - ``DATASHEET`` (karta_techniczna): value taken from a manufacturer datasheet
      / type-test report — fully trustworthy for the OSD package.
    - ``ESTIMATED`` (oszacowane): value is an engineering estimate without a real
      source (e.g. a controller bandwidth assumed from technology defaults). It
      MUST be tagged ``ESTIMATED`` — never ``DATASHEET`` — until a real source is
      attached.
    - ``SYSTEM_DEFAULT`` (domyslne_techniczne): value is a system/technical
      default carried by the schema (the field is present but no real value has
      been provided).

    Paramount rule: "no gaps" means the schema is COMPLETE (every field present),
    NOT that every field is filled with a fabricated value. A value with no real
    source is ``ESTIMATED`` (or ``SYSTEM_DEFAULT``), never ``DATASHEET``.
    """

    DATASHEET = "DATASHEET"
    ESTIMATED = "ESTIMATED"
    SYSTEM_DEFAULT = "SYSTEM_DEFAULT"

    @property
    def label_pl(self) -> str:
        """Polish UI label (no codenames)."""
        return _FIELD_QUALITY_LABEL_PL[self]


_FIELD_QUALITY_LABEL_PL: dict[FieldQuality, str] = {
    FieldQuality.DATASHEET: "karta_techniczna",
    FieldQuality.ESTIMATED: "oszacowane",
    FieldQuality.SYSTEM_DEFAULT: "domyslne_techniczne",
}


class EvidenceTier(StrEnum):
    """Stopien dowodowy WYNIKU obliczenia (trzecia os proweniencji, karta S-1).

    Orthogonal do dwoch osi powyzej:

    - ``solver_input.provenance.SourceKind`` — skad wartosc WEJSCIOWA pochodzi w potoku;
    - :class:`FieldQuality` — jak bardzo wiarygodna jest wartosc WEJSCIOWA;
    - ``EvidenceTier`` — czy WYNIK obliczenia wolno przedstawic jako dowod
      spelnienia wymagania normatywnego.

    Rozroznienie, ktorego dwie starsze osie nie wyrazaja: wejscie moze byc
    danymi z karty katalogowej najwyzszej jakosci, a mimo to obliczenie, ktore
    je konsumuje, moze nie miec ustalonej poprawnosci fizycznej. Dopuszczalnosc
    dowodowa jest cecha OBLICZENIA (zdolnosci), nie pojedynczego pola.

    Poziomy:

    - ``VALIDATED_SIMULATION``: obliczenie fizyczne o ustalonej poprawnosci
      modelu i zachowania numerycznego (istnieje dowod walidacji). JEDYNY
      poziom dopuszczalny jako dowod regulacyjny.
    - ``DECLARATION``: wartosc zadeklarowana przez wnioskodawce (albo
      odczytana z profilu) i porownana z wymaganiem. Uprawniona kontrola
      wymagania — ale obliczenie niczego nie wykazalo.
    - ``UNVALIDATED_MODEL``: obliczenie zostalo wykonane, ale model za nim nie
      ma ustalonej poprawnosci fizycznej, wiec jego wynik nie moze wspierac
      wniosku normatywnego.
    - ``NOT_SIMULATED``: zadne obliczenie fizyczne nie zostalo wykonane;
      wielkosc „symulowana" przypisana takiemu wynikowi nie jest wartoscia
      policzona.

    Zasada nadrzedna (lustro reguly FieldQuality): awans do
    ``VALIDATED_SIMULATION`` wynika z WYKAZANEJ zdolnosci, nigdy z nazwania.
    Oznaczenie zdolnosci jako zwalidowanej nie czyni jej zwalidowana — poziom
    podnosi sie wylacznie, gdy istnieje dowod walidacji.
    """

    VALIDATED_SIMULATION = "VALIDATED_SIMULATION"
    DECLARATION = "DECLARATION"
    UNVALIDATED_MODEL = "UNVALIDATED_MODEL"
    NOT_SIMULATED = "NOT_SIMULATED"

    @property
    def regulatory_evidence_eligible(self) -> bool:
        """True wylacznie dla poziomu dopuszczalnego jako dowod regulacyjny (fail-closed)."""
        return self is EvidenceTier.VALIDATED_SIMULATION

    @property
    def label_pl(self) -> str:
        """Etykieta PL (bez kodow projektowych)."""
        return _EVIDENCE_TIER_LABEL_PL[self]


#: Zdanie kanoniczne uzywane wszedzie, gdzie wynik NIE jest dowodem
#: regulacyjnym. Swiadomie mowi o BRAKU DOWODU, a nie o niespelnieniu
#: wymagania — to dwa rozne stany („nie spelnia" jest wynikiem wykazanym i
#: raportowalnym; „brak dowodu" to inny stan) i mylenie ich byloby rownie
#: nieuczciwe jak falszywy wynik pozytywny.
BRAK_DOWODU_PL = "BRAK WYSTARCZAJĄCEGO DOWODU SPEŁNIENIA WYMAGANIA"

_EVIDENCE_TIER_LABEL_PL: dict[EvidenceTier, str] = {
    EvidenceTier.VALIDATED_SIMULATION: "symulacja_zwalidowana",
    EvidenceTier.DECLARATION: "deklaracja_wnioskodawcy",
    EvidenceTier.UNVALIDATED_MODEL: "model_niezwalidowany",
    EvidenceTier.NOT_SIMULATED: "brak_symulacji",
}


class ClaimKind(StrEnum):
    """Rodzaj twierdzenia, ktore wynik zdolnosci wspiera.

    - ``DYNAMIC_PERFORMANCE``: narzedzie orzeka, jak modul ZACHOWUJE SIE w
      czasie (LVRT/HVRT, odbudowa mocy czynnej, odpowiedz czestotliwosciowa,
      praca wyspowa, stabilnosc). Wylacznie zwalidowana symulacja moze
      wspierac takie twierdzenie.
    - ``DECLARED_CONFIGURATION``: narzedzie orzeka ZADEKLAROWANY albo
      katalogowy FAKT o module (tryb regulacji, telemechanika, THD z rekordu
      katalogowego) porownany z wymaganiem. Deklaracja jest wlasciwa
      podstawa takiego twierdzenia.
    - ``STATIC_CALCULATION``: narzedzie orzeka wielkosc z OBLICZENIA STATYCZNEGO
      sieci (zwarcia IEC 60909, obciazalnosc i wytrzymalosc przewodow, spadki
      napiec, rozplyw). Obliczenie solverem o poziomie ``VALIDATED_SIMULATION``
      jest wlasciwa podstawa takiego twierdzenia; obliczenie bez ustalonej
      poprawnosci — nie.

    Domyslnie ``DYNAMIC_PERFORMANCE`` — SUROWSZE odczytanie, zeby zdolnosc
    zarejestrowana bez przemyslenia nie stala sie dopuszczalna przez pominiecie.
    """

    DYNAMIC_PERFORMANCE = "DYNAMIC_PERFORMANCE"
    DECLARED_CONFIGURATION = "DECLARED_CONFIGURATION"
    STATIC_CALCULATION = "STATIC_CALCULATION"

    @property
    def label_pl(self) -> str:
        return _CLAIM_KIND_LABEL_PL[self]


_CLAIM_KIND_LABEL_PL: dict[ClaimKind, str] = {
    ClaimKind.DYNAMIC_PERFORMANCE: "zachowanie_dynamiczne",
    ClaimKind.DECLARED_CONFIGURATION: "konfiguracja_zadeklarowana",
    ClaimKind.STATIC_CALCULATION: "obliczenie_statyczne",
}
