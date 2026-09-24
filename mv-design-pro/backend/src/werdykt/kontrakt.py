"""Kontrakt werdyktu wyjaśnialnego — typy rekordu oceny kryterium (K) i wymagania (W).

Kanon wiążący: ``docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md``. Zasada stała właściciela
(2026-09-22): status ``SPELNIA`` / ``NIE_SPELNIA`` / … jest enumem maszynowym (agregacja, filtry,
API), NIGDY samodzielną odpowiedzią inżynierską. Każdy rekord niesie ocenę + kryterium + wynik
z jednostką + limit z podstawą + margines + przyczynę + podstawę + dowód + zakres ważności.

Ten moduł zawiera JEDYNE w produkcie typy tego kontraktu. Typy są zamrożone (``frozen=True``,
``extra="forbid"``), a kolekcje są krotkami: lista w zamrożonym modelu przyjmowałaby ``append``
już PO walidacji, więc rekord mógłby rozjechać się z regułą, która go sprawdziła.

WALIDACJA PRZY KONSTRUKCJI. Inwarianty kontraktu (T1–T5, T10, T11, T14, T15 i pochodne) są
błędami typu, nie testami zewnętrznymi. Rekordy K i W są dodatkowo sprawdzane PARAMI z regułą:
walidator wyprowadza ponownie margines, status, kompletność dowodu, etykietę, braki
i zastrzeżenia TYMI SAMYMI funkcjami, których używa konstruktor wysokiego poziomu
(``werdykt.decyzja.ocen_kryterium`` / ``zagreguj_wymaganie``), i odrzuca rekord, którego pole
różni się od wyniku reguły — reguła ma JEDNO ciało. Import ``werdykt.decyzja`` następuje
wewnątrz walidatora, bo ``decyzja`` importuje typy z tego modułu (cykl kontrakt ↔ decyzja).

IMPORTY: stdlib, pydantic i własne moduły pakietu (osie ``EvidenceTier``, ``FieldQuality``,
``ClaimKind`` z ``werdykt.proweniencja``) — pakiet jest liściem także przechodnio: jego import
nie ładuje ``solver_input``, ``domain``, ``network_model``, ``application``, ``analysis``,
``api``, ``catalog`` ani ``enm``.
"""

from __future__ import annotations

import hashlib
import json
import re
from bisect import bisect_right
from typing import Annotated, Literal, Self, get_args

from pydantic import AfterValidator, BaseModel, ConfigDict, FiniteFloat, model_validator
from werdykt.proweniencja import ClaimKind, EvidenceTier, FieldQuality

# ---------------------------------------------------------------------------
# Słowniki zamknięte (wartości dokładnie jak w kontrakcie §1, §2.1, §4)
# ---------------------------------------------------------------------------

#: Status maszynowy oceny (§2.1). Kolejność = kolejność prezentacji słownika.
StatusWerdyktu = Literal[
    "SPELNIA",
    "NIE_SPELNIA",
    "NIEJEDNOZNACZNY",
    "NIE_OCENIONO",
    "BRAK_PODSTAWY",
    "BRAK_DOWODU",
    "NIE_DOTYCZY",
]
#: Oś kompletności dowodu (§3), niezależna od statusu kryterium.
KompletnoscDowodu = Literal["PELNY", "NIEPELNY", "NIE_DOTYCZY"]
#: Rodzaj źródła podstawy wymagania (warstwa normatywna).
RodzajPodstawy = Literal[
    "ROZPORZADZENIE_UE",
    "NORMA",
    "PRAWO_KRAJOWE",
    "WOS",
    "PROCEDURA_PTPIREE",
    "WIPWC",
    "OSD",
    "KATALOG_PRODUCENTA",
    "ZALOZENIE_PROJEKTOWE",
    "NIEUSTALONA",
]
#: Stan źródła podstawy — od najmocniejszego.
StanZrodla = Literal["ZWERYFIKOWANE", "WSKAZANE", "NIEUSTALONE"]
#: Relacja wyniku do limitu.
Relacja = Literal[
    "NIE_WIECEJ",
    "NIE_MNIEJ",
    "PASMO",
    "OBWIEDNIA_DOLNA",
    "OBWIEDNIA_GORNA",
    "LOGICZNE",
]
#: Status walidacji modelu KONKRETNEGO urządzenia (oś inna niż ``EvidenceTier`` narzędzia).
StatusModelu = Literal[
    "UNVALIDATED_MODEL", "VALIDATED_AGAINST_TEST", "CERTIFIED_MODEL", "NIE_DOTYCZY"
]
#: Status danych wejściowych oceny.
StanDanych = Literal["ZWALIDOWANE", "UNVALIDATED_INPUT"]
#: Dziedzina fizyki, w której wynik jest ważny (zakres ważności §7).
DziedzinaFizyki = Literal[
    "POWER_FLOW",
    "SHORT_CIRCUIT",
    "RMS_DYNAMICS",
    "SEQUENCE_DOMAIN",
    "HARMONIC_FREQUENCY_DOMAIN",
    "SUPRAHARMONIC_FREQUENCY_DOMAIN",
]
#: JEDEN słownik metody dowodu, używany w ``WynikKryterium.metoda``, ``StatusDowodu.metoda``
#: i ``WynikWymagania.sposob_wykazania``; podzbiory dopuszczalne w każdym z trzech miejsc
#: pilnują walidatory (``METODY_WYNIKU``, ``METODY_WYKAZANIA``).
MetodaDowodu = Literal[
    "CERTYFIKAT",
    "RAPORT_Z_TESTU",
    "SYMULACJA",
    "OBLICZENIE",
    "DEKLARACJA",
    "POMIAR",
    "OCENA_OPERATORA",
    "DOWOD_LACZONY",
    "BRAK_METODY",
]
#: Semantyka koloru etykiety (§9) — interfejs mapuje WYŁĄCZNIE semantykę na kolor.
SemantykaKoloru = Literal["pozytywna", "negatywna", "ostrzegawcza", "neutralna"]
#: Rodzaj skali marginesu względnego (§2.4).
RodzajSkali = Literal["TOLERANCJA", "LIMIT", "NIEPEWNOSC"]
#: Pokrycie zbioru scenariuszy programu badań przez biegi wykazujące wymaganie (§2.3 pkt 8).
PokrycieProgramu = Literal["PELNE", "CZESCIOWE", "NIE_DOTYCZY"]
#: Poziom rekordu: K — ocena kryterium, W — wynik wymagania (etykieta zależy od poziomu, §9).
PoziomRekordu = Literal["K", "W"]
#: Krok reguły K (§2.2), który rozstrzygnął status — generator tekstu dobiera nim treść.
KrokRegulyK = Literal[
    "STOSOWALNOSC",
    "METODA",
    "WYNIK",
    "PODSTAWA",
    "NIEJEDNOZNACZNOSC",
    "MARGINES",
]
#: Krok reguły W (§2.3), który rozstrzygnął status.
KrokRegulyW = Literal[
    "STOSOWALNOSC",
    "BRAK_METODY",
    "SKLADOWE_NIE_DOTYCZA",
    "NARUSZENIE",
    "NIEJEDNOZNACZNOSC",
    "NIEOCENIONE",
    "BRAK_PODSTAWY",
    "POKRYCIE",
    "KOMPLETNOSC",
    "SPELNIENIE",
]

#: Kanoniczna kolejność metod — każde wyliczenie metod w tekście jest w tej kolejności
#: (zbiory ``frozenset`` iterują w kolejności zależnej od ziarna skrótu, więc nie wolno
#: składać z nich tekstu bez sortowania).
KOLEJNOSC_METOD: tuple[MetodaDowodu, ...] = get_args(MetodaDowodu)

#: Metody, z których może pochodzić wielkość wyniku kryterium (§4.1).
METODY_WYNIKU: frozenset[MetodaDowodu] = frozenset(
    ("SYMULACJA", "OBLICZENIE", "DEKLARACJA", "POMIAR", "CERTYFIKAT")
)
#: Sposoby wykazania wymagania (§4.2).
METODY_WYKAZANIA: frozenset[MetodaDowodu] = frozenset(
    (
        "CERTYFIKAT",
        "RAPORT_Z_TESTU",
        "SYMULACJA",
        "OBLICZENIE",
        "DEKLARACJA",
        "OCENA_OPERATORA",
        "DOWOD_LACZONY",
        "BRAK_METODY",
    )
)
#: Metody dowodu dopuszczalne dla rodzaju twierdzenia (§2.2 krok 2) — metoda spoza zbioru daje na
#: poziomie K ``NIE_OCENIONO``; przydatność dowodowa (§3 pkt 1) jest podzbiorem dopuszczalności.
METODY_DOPUSZCZALNE_DLA_TWIERDZENIA: dict[ClaimKind, frozenset[MetodaDowodu]] = {
    ClaimKind.DYNAMIC_PERFORMANCE: frozenset(
        ("SYMULACJA", "RAPORT_Z_TESTU", "POMIAR", "CERTYFIKAT", "DOWOD_LACZONY")
    ),
    ClaimKind.DECLARED_CONFIGURATION: frozenset(
        (
            "DEKLARACJA",
            "OBLICZENIE",
            "CERTYFIKAT",
            "RAPORT_Z_TESTU",
            "POMIAR",
            "OCENA_OPERATORA",
            "DOWOD_LACZONY",
        )
    ),
    ClaimKind.STATIC_CALCULATION: frozenset(
        ("OBLICZENIE", "POMIAR", "RAPORT_Z_TESTU", "CERTYFIKAT", "DOWOD_LACZONY")
    ),
}
#: Metody dowodu wyłącznie poziomu W: dowód łączony łączy metody składników, więc nie jest
#: dowodem jednego kryterium (walidator ``OcenaKryterium`` odrzuca go w ``dowod`` rekordu K).
METODY_TYLKO_WYMAGANIA: frozenset[MetodaDowodu] = frozenset(("DOWOD_LACZONY",))
#: Metody przydatne dowodowo niezależnie od rodzaju twierdzenia (§3 pkt 1).
METODY_PRZYDATNE_ZAWSZE: frozenset[MetodaDowodu] = frozenset(
    ("CERTYFIKAT", "RAPORT_Z_TESTU", "POMIAR")
)
#: Metody przydatne bezwarunkowo wyłącznie dla wskazanego rodzaju twierdzenia (§3 pkt 1):
#: deklaracja i ocena operatora są właściwą podstawą faktu zadeklarowanego.
METODY_PRZYDATNE_DLA_TWIERDZENIA: dict[ClaimKind, frozenset[MetodaDowodu]] = {
    ClaimKind.DYNAMIC_PERFORMANCE: frozenset(),
    ClaimKind.DECLARED_CONFIGURATION: frozenset(("DEKLARACJA", "OCENA_OPERATORA")),
    ClaimKind.STATIC_CALCULATION: frozenset(),
}
#: Rodzaje twierdzenia, dla których obliczenie zwalidowanym solverem jest dowodem właściwym.
TWIERDZENIA_Z_OBLICZENIEM: frozenset[ClaimKind] = frozenset((ClaimKind.STATIC_CALCULATION,))
#: Statusy modelu urządzenia, przy których symulacja jest dowodem właściwym (§3 pkt 1).
STATUSY_MODELU_ZWALIDOWANEGO: frozenset[StatusModelu] = frozenset(
    ("VALIDATED_AGAINST_TEST", "CERTIFIED_MODEL")
)
#: Jakości danej bez rzeczywistego źródła (§3 pkt 2).
JAKOSCI_BEZ_ZRODLA: frozenset[FieldQuality] = frozenset(
    (FieldQuality.ESTIMATED, FieldQuality.SYSTEM_DEFAULT)
)
#: Poziomy dowodowe zdolności narzędzia, przy których obliczenie nie ma ustalonej poprawności.
POZIOMY_BEZ_WALIDACJI: frozenset[EvidenceTier] = frozenset(
    (EvidenceTier.UNVALIDATED_MODEL, EvidenceTier.NOT_SIMULATED)
)
#: Metody, przy których istnieje obliczenie (ślad WHITE BOX i dziedzina fizyki obowiązkowe).
METODY_OBLICZENIOWE: frozenset[MetodaDowodu] = frozenset(("SYMULACJA", "OBLICZENIE"))
#: Metody dowodu, którym może towarzyszyć poziom ``TYPE_TEST_CERTIFICATE`` (§3 tabela poziomów):
#: certyfikat (poziom obowiązkowy) i dowód łączony ze składową certyfikatu (najsłabszy poziom
#: składników — walidator ``WynikWymagania`` żąda stosowalnej składowej certyfikatu).
METODY_Z_POZIOMEM_CERTYFIKATU: frozenset[MetodaDowodu] = frozenset(("CERTYFIKAT", "DOWOD_LACZONY"))
#: Statusy, dla których ``czego_brakuje`` jest obowiązkowe (§5).
STATUSY_Z_BRAKAMI: frozenset[StatusWerdyktu] = frozenset(
    ("NIE_OCENIONO", "BRAK_PODSTAWY", "BRAK_DOWODU", "NIEJEDNOZNACZNY")
)
#: Relacje liczbowe (limit obowiązkowy, ``warunek_latex`` obowiązkowy).
RELACJE_LICZBOWE: frozenset[Relacja] = frozenset(
    ("NIE_WIECEJ", "NIE_MNIEJ", "PASMO", "OBWIEDNIA_DOLNA", "OBWIEDNIA_GORNA")
)
#: Relacje z limitem w postaci obwiedni (wynik wymaga chwili punktu krytycznego).
RELACJE_OBWIEDNI: frozenset[Relacja] = frozenset(("OBWIEDNIA_DOLNA", "OBWIEDNIA_GORNA"))
#: Sufiks identyfikatora kryterium stanu końcowego (pozycja „Stan końcowy" dokumentu §10).
SUFIKS_STANU_KONCOWEGO = ".stan_koncowy"
#: Jednostka wielkości logicznej (wynik 1 = stan wymagany, 0 = stan przeciwny).
JEDNOSTKA_LOGICZNA = "1"


# ---------------------------------------------------------------------------
# Typy pól prostych
# ---------------------------------------------------------------------------


def _sprawdz_tekst(tekst: str) -> str:
    if not tekst.strip():
        raise ValueError("Tekst nie może być pusty ani złożony wyłącznie z odstępów.")
    return tekst


#: Tekst niepusty po ``strip()``.
Tekst = Annotated[str, AfterValidator(_sprawdz_tekst)]

_JEDNOSTKA_PU_POCZATEK = re.compile(r"p\.?\s*u(?![a-z])", re.IGNORECASE)
_JEDNOSTKA_PU_KANONICZNA = re.compile(r"p\.u\. \((?P<baza>.+)\)")
_JEDNOSTKI_BRAKU = frozenset(("-", "—", "–", "−"))


def _sprawdz_jednostke(jednostka: str) -> str:
    """Jednostka jawna i kanoniczna (T3, T15).

    Wielkości bezwymiarowe zapisuje się jako ``"1"``, ``"%"`` albo ``"p.u. (<baza>)"`` z nazwaną
    bazą. Każdy inny zapis jednostki względnej (``"p.u."``, ``"pu"``, ``"PU"``, ``"pu (U_n)"``)
    jest odrzucany — klasa defektu „wartość względna bez bazy", nie tylko jej jedna pisownia.
    Myślnik zamiast jednostki jest typograficznym „brak jednostki" i też jest odrzucany.
    """
    if not jednostka.strip():
        raise ValueError(
            "Liczba bez jednostki: pole 'jednostka' jest puste (wielkość bezwymiarową zapisz "
            'jawnie jako "1", "%" albo "p.u. (<baza>)").'
        )
    if jednostka != jednostka.strip():
        raise ValueError(
            f"Jednostka {jednostka!r} ma odstęp na brzegu — zapis musi być kanoniczny."
        )
    if jednostka in _JEDNOSTKI_BRAKU:
        raise ValueError(
            f"Jednostka {jednostka!r} oznacza brak jednostki — wielkość bezwymiarową zapisz jawnie "
            'jako "1", "%" albo "p.u. (<baza>)".'
        )
    if _JEDNOSTKA_PU_POCZATEK.match(jednostka):
        kanoniczna = _JEDNOSTKA_PU_KANONICZNA.fullmatch(jednostka)
        if kanoniczna is None or not kanoniczna.group("baza").strip():
            raise ValueError(
                f"Jednostka względna {jednostka!r} bez nazwanej bazy — dopuszczalny zapis: "
                '"p.u. (<baza>)", np. "p.u. (U_n)", "p.u. (I_n modułu)".'
            )
    return jednostka


#: Jednostka jawna (T3) z nazwaną bazą dla wartości względnych (T15).
Jednostka = Annotated[str, AfterValidator(_sprawdz_jednostke)]


class _Zamrozony(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


def _bez_duplikatow(nazwa: str, elementy: tuple[str, ...]) -> None:
    if len(set(elementy)) != len(elementy):
        raise ValueError(f"Lista '{nazwa}' zawiera powtórzone pozycje: {list(elementy)}.")


# ---------------------------------------------------------------------------
# Proweniencja, wielkości, dane
# ---------------------------------------------------------------------------


class PodstawaWymagania(_Zamrozony):
    """Podstawa wymagania albo wartości (§1): skąd pochodzi i w jakim stanie jest źródło.

    JEDEN typ podstawy w produkcie (uogólnienie ``ZrodloWartosci`` profilu NC RfG).
    Stan ``WSKAZANE`` albo ``ZWERYFIKOWANE`` wymaga niepustych ``dokument``, ``wydanie``
    i ``jednostka_redakcyjna`` — bez nich stan jest ``NIEUSTALONE`` (przeetykietowanie nie
    podnosi stanu). Rodzaj ``NIEUSTALONA`` (warstwa bez ustalonego pochodzenia) nie może mieć
    stanu mocniejszego niż ``NIEUSTALONE``. Walidator sprawdza niepustość jednostki
    redakcyjnej, nie jej treść — opis słowny parametru w tym polu to błąd wołającego.
    """

    rodzaj: RodzajPodstawy
    dokument: Tekst
    wydanie: Tekst | None = None
    jednostka_redakcyjna: Tekst | None = None
    status: StanZrodla
    uwagi_pl: Tekst | None = None

    @model_validator(mode="after")
    def _spojnosc_stanu(self) -> Self:
        if self.status != "NIEUSTALONE":
            brakujace = [
                nazwa
                for nazwa, wartosc in (
                    ("wydanie", self.wydanie),
                    ("jednostka_redakcyjna", self.jednostka_redakcyjna),
                )
                if wartosc is None
            ]
            if brakujace:
                raise ValueError(
                    f"Podstawa „{self.dokument}” o stanie {self.status} wymaga pól: "
                    f"{', '.join(brakujace)} — bez nich stan źródła jest NIEUSTALONE."
                )
        if self.rodzaj == "NIEUSTALONA" and self.status != "NIEUSTALONE":
            raise ValueError(
                f"Podstawa rodzaju NIEUSTALONA nie może mieć stanu {self.status} — warstwa bez "
                "ustalonego pochodzenia ma stan NIEUSTALONE."
            )
        return self


class Wielkosc(_Zamrozony):
    """Liczba z jednostką (T3). Wartość skończona — NaN i nieskończoność są odrzucane."""

    wartosc: FiniteFloat
    jednostka: Jednostka


class DanaPrzyjeta(_Zamrozony):
    """Dana przyjęta do oceny bez pełnej walidacji (wartość, powód, jakość danej)."""

    nazwa_pl: Tekst
    wartosc: Wielkosc | None
    powod_pl: Tekst
    jakosc: FieldQuality | None


class StatusDanych(_Zamrozony):
    """Status danych wejściowych: ``UNVALIDATED_INPUT`` ⇔ lista danych przyjętych niepusta."""

    stan: StanDanych
    dane_przyjete: tuple[DanaPrzyjeta, ...] = ()

    @model_validator(mode="after")
    def _stan_zgodny_z_lista(self) -> Self:
        if self.stan == "UNVALIDATED_INPUT" and not self.dane_przyjete:
            raise ValueError(
                "Stan UNVALIDATED_INPUT wymaga listy danych przyjętych (wartość i powód każdej)."
            )
        if self.stan == "ZWALIDOWANE" and self.dane_przyjete:
            raise ValueError(
                "Stan ZWALIDOWANE nie może nieść danych przyjętych bez walidacji — dana przyjęta "
                "oznacza stan UNVALIDATED_INPUT."
            )
        return self


class StatusDowodu(_Zamrozony):
    """Dowód stojący za wynikiem: metoda, poziom zdolności narzędzia, rodzaj twierdzenia,
    status modelu urządzenia, status danych, odniesienie do dowodu (bieg, certyfikat, raport)
    i przynależność biegu do zadeklarowanej domeny walidacji silnika.

    ``w_domenie_walidacji`` — wynik predykatu „bieg należy do domeny walidacji" (§3b);
    ``None`` dla metod bez biegu (wszystko poza symulacją i obliczeniem) i dla dowodu, który
    domeny nie deklaruje; ``domena_pl`` nazywa domenę (manifest walidacji, zakresy parametrów) i
    towarzyszy każdej rozstrzygniętej wartości predykatu. Obowiązek podania predykatu dla
    wyniku symulacji egzekwuje walidator ``OcenaKryterium``.
    """

    metoda: MetodaDowodu
    poziom: EvidenceTier
    rodzaj_twierdzenia: ClaimKind
    status_modelu: StatusModelu
    status_danych: StatusDanych
    odniesienie: Tekst | None = None
    w_domenie_walidacji: bool | None = None
    domena_pl: Tekst | None = None

    @model_validator(mode="after")
    def _domena_walidacji(self) -> Self:
        if self.metoda not in METODY_OBLICZENIOWE and (
            self.w_domenie_walidacji is not None or self.domena_pl is not None
        ):
            raise ValueError(
                f"Domena walidacji dotyczy wyłącznie biegu (symulacja, obliczenie) — metoda "
                f"{self.metoda} nie ma domeny walidacji."
            )
        if (self.w_domenie_walidacji is None) != (self.domena_pl is None):
            raise ValueError(
                "Przynależność biegu do domeny walidacji i nazwa domeny (domena_pl) występują "
                "razem albo wcale."
            )
        return self

    @model_validator(mode="after")
    def _poziom_certyfikatu(self) -> Self:
        """Poziom ``TYPE_TEST_CERTIFICATE`` ⇔ dowód certyfikatem badania typu (§3 tabela
        poziomów): certyfikat zawsze niesie ten poziom, a poziom certyfikatu nigdy nie opisuje
        obliczenia, symulacji, deklaracji ani braku metody."""
        certyfikat = EvidenceTier.TYPE_TEST_CERTIFICATE
        if self.metoda == "CERTYFIKAT" and self.poziom is not certyfikat:
            raise ValueError(
                f"Dowód certyfikatem urządzenia ma poziom {certyfikat.value} (certyfikat "
                f"badania typu) — poziom {self.poziom.value} nie opisuje certyfikatu."
            )
        if self.poziom is certyfikat and self.metoda not in METODY_Z_POZIOMEM_CERTYFIKATU:
            raise ValueError(
                f"Poziom {certyfikat.value} (certyfikat badania typu) towarzyszy wyłącznie "
                f"dowodowi certyfikatem albo dowodowi łączonemu ze składową certyfikatu — nie "
                f"metodzie {self.metoda}."
            )
        return self

    @property
    def przydatnosc_dowodowa(self) -> bool:
        """Czy metoda jest właściwa dla rodzaju twierdzenia (§3 pkt 1) — fail-closed.

        Metoda przydatna jest zawsze metodą dopuszczalną dla rodzaju twierdzenia
        (``METODY_DOPUSZCZALNE_DLA_TWIERDZENIA``, §2.2 krok 2). W tym zbiorze prawda wyłącznie
        gdy: metoda to certyfikat, raport z testu albo pomiar; albo deklaracja lub ocena
        operatora dla twierdzenia o konfiguracji zadeklarowanej; albo symulacja na silniku
        o poziomie ``VALIDATED_SIMULATION`` z modelem urządzenia ``VALIDATED_AGAINST_TEST`` /
        ``CERTIFIED_MODEL``; albo obliczenie na zdolności o poziomie ``VALIDATED_SIMULATION``
        dla twierdzenia z obliczenia statycznego. Bieg (symulacja, obliczenie) rozstrzygnięty
        jako leżący POZA zadeklarowaną domeną walidacji (``w_domenie_walidacji is False``) nigdy
        nie jest przydatny (§3 pkt 1, §3b). Dowód łączony nie jest przydatny sam w sobie — na
        poziomie wymagania jego przydatność wynika ze składowych
        (``werdykt.decyzja.przydatnosc_dowodu_wymagania``); brak metody nigdy.
        """
        if self.metoda not in METODY_DOPUSZCZALNE_DLA_TWIERDZENIA[self.rodzaj_twierdzenia]:
            return False
        if self.metoda in METODY_PRZYDATNE_ZAWSZE:
            return True
        if self.metoda in METODY_PRZYDATNE_DLA_TWIERDZENIA[self.rodzaj_twierdzenia]:
            return True
        if self.w_domenie_walidacji is False:
            return False
        if self.metoda == "SYMULACJA":
            return (
                self.poziom is EvidenceTier.VALIDATED_SIMULATION
                and self.status_modelu in STATUSY_MODELU_ZWALIDOWANEGO
            )
        if self.metoda == "OBLICZENIE":
            return (
                self.rodzaj_twierdzenia in TWIERDZENIA_Z_OBLICZENIEM
                and self.poziom is EvidenceTier.VALIDATED_SIMULATION
            )
        return False


class Niepewnosc(_Zamrozony):
    """Niepewność wyniku: wartość z metodą oszacowania ALBO jawny powód braku (§6).

    Wartość obejmuje WYŁĄCZNIE błąd dyskretyzacji: wynik raportowany jest z biegu kontrolnego
    o drobniejszym kroku, a ``u = |m(h) − m(h/2)|``. Niepewność modelowa (parametry
    niezwalidowane) nie jest liczbą — wyraża ją status modelu i kompletność dowodu. Niepewność
    jest wielkością nieujemną. Dla metody ``SYMULACJA`` wartość liczbowa jest obowiązkowa
    (walidator ``OcenaKryterium``).
    """

    wartosc: Wielkosc | None = None
    metoda_pl: Tekst | None = None
    nie_dotyczy: bool = False
    powod_pl: Tekst | None = None

    @model_validator(mode="after")
    def _jedna_postac(self) -> Self:
        if self.nie_dotyczy:
            if self.powod_pl is None or self.wartosc is not None or self.metoda_pl is not None:
                raise ValueError(
                    "Niepewność „nie dotyczy” wymaga niepustego powodu i nie może nieść wartości "
                    "ani metody oszacowania."
                )
        else:
            if self.wartosc is None or self.metoda_pl is None or self.powod_pl is not None:
                raise ValueError(
                    "Niepewność oszacowana wymaga wartości z jednostką i metody oszacowania "
                    "(bez powodu braku); brak oszacowania zapisz jako nie_dotyczy=True z powodem."
                )
            if self.wartosc.wartosc < 0.0:
                raise ValueError(
                    f"Niepewność jest wielkością nieujemną (podano {self.wartosc.wartosc})."
                )
        return self


# ---------------------------------------------------------------------------
# Kryterium, przedmiot, wynik, limit, margines
# ---------------------------------------------------------------------------


class Kryterium(_Zamrozony):
    """Kryterium: opis, warunek w LaTeX (obowiązkowy dla relacji liczbowej — T2), relacja
    i opcjonalny warunek wstępny uruchomienia (np. przebieg napięcia nad obwiednią FRT) razem
    z podstawą tego warunku (np. obwiednia z profilu — jej stan źródła wchodzi do kompletności
    dowodu i do zastrzeżeń).
    """

    opis_pl: Tekst
    warunek_latex: str
    relacja: Relacja
    warunek_wstepny_pl: Tekst | None = None
    warunek_wstepny_podstawa: PodstawaWymagania | None = None

    @model_validator(mode="after")
    def _warunek_dla_relacji_liczbowej(self) -> Self:
        if self.relacja in RELACJE_LICZBOWE and not self.warunek_latex.strip():
            raise ValueError(
                f"Kryterium „{self.opis_pl}” o relacji {self.relacja} wymaga warunku w LaTeX."
            )
        if (self.warunek_wstepny_pl is None) != (self.warunek_wstepny_podstawa is None):
            raise ValueError(
                f"Kryterium „{self.opis_pl}”: warunek wstępny i jego podstawa występują razem "
                "albo wcale."
            )
        return self


class Przedmiot(_Zamrozony):
    """CO oceniono: odnośnik elementu, nazwa i zdanie opisujące przedmiot oceny."""

    element_ref: Tekst | None
    nazwa_pl: Tekst
    opis_pl: Tekst


class WynikKryterium(_Zamrozony):
    """Wielkość zmierzona albo obliczona: nazwa, symbol, wartość z jednostką, punkt krytyczny.

    Dla relacji ``LOGICZNE`` wartość jest zapisana jako ``Wielkosc(1.0 | 0.0, "1")`` (1 = stan
    wymagany), a ``punkt_krytyczny_pl`` opisuje stan (walidator ``OcenaKryterium``).
    """

    wielkosc_pl: Tekst
    symbol_latex: str
    wartosc: Wielkosc
    punkt_krytyczny_pl: Tekst | None = None
    chwila_s: FiniteFloat | None = None
    metoda: MetodaDowodu

    @model_validator(mode="after")
    def _metoda_wyniku(self) -> Self:
        if self.metoda not in METODY_WYNIKU:
            dozwolone = ", ".join(m for m in KOLEJNOSC_METOD if m in METODY_WYNIKU)
            raise ValueError(
                f"Metoda {self.metoda} nie jest źródłem wielkości wyniku — dozwolone: {dozwolone}."
            )
        return self


class PunktObwiedni(_Zamrozony):
    """Punkt obwiedni limitu: chwila [s] i wartość w jednostce obwiedni."""

    t_s: FiniteFloat
    wartosc: FiniteFloat


class LimitKryterium(_Zamrozony):
    """Limit w DOKŁADNIE jednej postaci (wartość, pasmo albo obwiednia) z podstawą (T4).

    Pasmo: obie granice w tej samej jednostce, dolna < górna. Obwiednia: co najmniej dwa punkty
    o ściśle rosnących chwilach i niepusta jednostka obwiedni.
    """

    wartosc: Wielkosc | None = None
    pasmo: tuple[Wielkosc, Wielkosc] | None = None
    obwiednia: tuple[PunktObwiedni, ...] | None = None
    jednostka_obwiedni: Jednostka | None = None
    podstawa: PodstawaWymagania
    zakres_stosowalnosci_pl: Tekst | None = None
    wersja_profilu: Tekst | None = None

    @model_validator(mode="after")
    def _jedna_postac(self) -> Self:
        postaci = [
            nazwa
            for nazwa, wartosc in (
                ("wartosc", self.wartosc),
                ("pasmo", self.pasmo),
                ("obwiednia", self.obwiednia),
            )
            if wartosc is not None
        ]
        if len(postaci) != 1:
            raise ValueError(
                "Limit ma dokładnie jedną postać (wartość, pasmo albo obwiednia); podano: "
                f"{postaci or 'żadnej'}."
            )
        if self.pasmo is not None:
            dolna, gorna = self.pasmo
            if dolna.jednostka != gorna.jednostka:
                raise ValueError(
                    f"Granice pasma w różnych jednostkach ({dolna.jednostka!r}, "
                    f"{gorna.jednostka!r}) — konwersja jednostek jest niedozwolona."
                )
            if not dolna.wartosc < gorna.wartosc:
                raise ValueError(
                    f"Pasmo wymaga granicy dolnej mniejszej od górnej ({dolna.wartosc} ≥ "
                    f"{gorna.wartosc})."
                )
        if self.obwiednia is not None:
            if len(self.obwiednia) < 2:
                raise ValueError("Obwiednia wymaga co najmniej dwóch punktów.")
            czasy = [punkt.t_s for punkt in self.obwiednia]
            if any(b <= a for a, b in zip(czasy, czasy[1:], strict=False)):
                raise ValueError(f"Chwile punktów obwiedni muszą rosnąć ściśle ({czasy}).")
            if self.jednostka_obwiedni is None:
                raise ValueError("Obwiednia wymaga jednostki wartości (jednostka_obwiedni).")
        elif self.jednostka_obwiedni is not None:
            raise ValueError("Jednostka obwiedni podana dla limitu, który nie jest obwiednią.")
        return self

    @property
    def jednostka(self) -> str:
        """Jednostka limitu niezależnie od postaci."""
        if self.wartosc is not None:
            return self.wartosc.jednostka
        if self.pasmo is not None:
            return self.pasmo[0].jednostka
        if self.jednostka_obwiedni is None:
            raise ValueError("Limit bez jednostki — walidator postaci limitu został pominięty.")
        return self.jednostka_obwiedni

    def wartosc_obwiedni(self, t_s: float) -> float:
        """Wartość obwiedni w chwili ``t_s`` — interpolacja liniowa między punktami.

        Chwila poza zakresem obwiedni jest błędem: obwiednia nie jest ekstrapolowana.
        """
        if self.obwiednia is None:
            raise ValueError("Limit nie ma postaci obwiedni.")
        punkty = self.obwiednia
        if not punkty[0].t_s <= t_s <= punkty[-1].t_s:
            raise ValueError(
                f"Chwila t = {t_s} s poza zakresem obwiedni [{punkty[0].t_s}, {punkty[-1].t_s}] s "
                "— ekstrapolacja obwiedni jest niedozwolona."
            )
        indeks = bisect_right([punkt.t_s for punkt in punkty], t_s)
        if indeks == len(punkty):
            return punkty[-1].wartosc
        poprzedni, nastepny = punkty[indeks - 1], punkty[indeks]
        if t_s == poprzedni.t_s:
            return poprzedni.wartosc
        udzial = (t_s - poprzedni.t_s) / (nastepny.t_s - poprzedni.t_s)
        return poprzedni.wartosc + (nastepny.wartosc - poprzedni.wartosc) * udzial


class Margines(_Zamrozony):
    """Margines: wartość z definicją i skalą ALBO jawnie niedefiniowalny z powodem.

    ``wzgledny = wartosc / skala`` (§2.4); skala ma jednostkę marginesu i jest dodatnia;
    ``skala_rodzaj`` mówi, czym jest skala (tolerancja z profilu, |limit| albo niepewność).
    Bez skali margines względny nie istnieje (``None``) i składnik nie uczestniczy w wyborze
    kryterium najbliżej granicy.
    """

    wartosc: Wielkosc | None = None
    definicja_latex: Tekst | None = None
    punkt_pl: Tekst | None = None
    skala: Wielkosc | None = None
    skala_rodzaj: RodzajSkali | None = None
    wzgledny: FiniteFloat | None = None
    niedefiniowalny: bool = False
    powod_pl: Tekst | None = None

    @model_validator(mode="after")
    def _jedna_postac(self) -> Self:
        if self.niedefiniowalny:
            if self.powod_pl is None:
                raise ValueError("Margines niedefiniowalny wymaga powodu.")
            if any(
                pole is not None
                for pole in (
                    self.wartosc,
                    self.definicja_latex,
                    self.skala,
                    self.skala_rodzaj,
                    self.wzgledny,
                )
            ):
                raise ValueError(
                    "Margines niedefiniowalny nie może nieść wartości, definicji, skali ani "
                    "marginesu względnego."
                )
            return self
        if self.wartosc is None or self.definicja_latex is None or self.powod_pl is not None:
            raise ValueError(
                "Margines wymaga wartości z jednostką i definicji w LaTeX (bez powodu) albo "
                "jawnego niedefiniowalny=True z powodem."
            )
        if (self.skala is None) != (self.skala_rodzaj is None):
            raise ValueError("Skala marginesu i jej rodzaj występują razem albo wcale.")
        if (self.skala is None) != (self.wzgledny is None):
            raise ValueError("Margines względny istnieje wtedy i tylko wtedy, gdy istnieje skala.")
        if self.skala is not None:
            if self.skala.jednostka != self.wartosc.jednostka:
                raise ValueError(
                    f"Skala marginesu w jednostce {self.skala.jednostka!r} różnej od jednostki "
                    f"marginesu {self.wartosc.jednostka!r}."
                )
            if not self.skala.wartosc > 0.0:
                raise ValueError(
                    f"Skala marginesu musi być dodatnia (podano {self.skala.wartosc})."
                )
            if self.wzgledny != self.wartosc.wartosc / self.skala.wartosc:
                raise ValueError(
                    "Margines względny różni się od ilorazu marginesu i skali "
                    f"({self.wzgledny} ≠ {self.wartosc.wartosc} / {self.skala.wartosc})."
                )
        return self


# ---------------------------------------------------------------------------
# Zakres, ślad, wyjaśnienie, stosowalność, etykieta
# ---------------------------------------------------------------------------


class ZakresWaznosci(_Zamrozony):
    """Zakres ważności wyniku (§7): wynik NIGDY nie jest opisany szerzej niż ten zakres.

    Parametry sieci niosą status danych (jakość każdej wartości jest obowiązkowa).
    """

    rodzaj_analizy: DziedzinaFizyki | None = None
    opis_pl: Tekst
    technologia: Tekst | None = None
    model_urzadzenia: Tekst | None = None
    symetria_zaklocenia: Tekst | None = None
    parametry_sieci: tuple[DanaPrzyjeta, ...] = ()
    regulator: Tekst | None = None
    ograniczniki: tuple[Tekst, ...] = ()
    wykluczenia: tuple[Tekst, ...] = ()

    @model_validator(mode="after")
    def _parametry_ze_statusem(self) -> Self:
        bez_jakosci = [p.nazwa_pl for p in self.parametry_sieci if p.jakosc is None]
        if bez_jakosci:
            raise ValueError(
                f"Parametry sieci bez statusu danych (jakości): {bez_jakosci} — zakres ważności "
                "podaje parametry sieci ze statusem danych."
            )
        _bez_duplikatow("wykluczenia", self.wykluczenia)
        _bez_duplikatow("ograniczniki", self.ograniczniki)
        return self


class OdnosnikSladu(_Zamrozony):
    """Odnośnik do kroku śladu WHITE BOX (§8)."""

    run_id: Tekst | None = None
    wersja_silnika: Tekst | None = None
    krok: Tekst
    opis_pl: Tekst


class WyjasnienieWerdyktu(_Zamrozony):
    """Wyjaśnienie werdyktu (§5): zdanie, przyczyna, czego brakuje, zastrzeżenia.

    Zdanie jest niepuste zawsze (T1). Obowiązki zależne od statusu (przyczyna, braki) i
    zgodność zastrzeżeń z polami rekordu egzekwują walidatory rekordów K i W.
    """

    zdanie_pl: Tekst
    przyczyna_pl: Tekst | None = None
    czego_brakuje: tuple[Tekst, ...] = ()
    zastrzezenia: tuple[Tekst, ...] = ()

    @model_validator(mode="after")
    def _bez_powtorzen(self) -> Self:
        _bez_duplikatow("czego_brakuje", self.czego_brakuje)
        _bez_duplikatow("zastrzezenia", self.zastrzezenia)
        return self


class Stosowalnosc(_Zamrozony):
    """Stosowalność kryterium albo wymagania do przedmiotu; powód niepusty ZAWSZE (T10).

    ``podstawa`` — podstawa reguły stosowalności (np. progi klas modułów z WOS).
    ``modul_istniejacy`` — moduł istniejący w rozumieniu art. 4 rozporządzenia 2016/631;
    ``None`` = status nieustalony (dla przedmiotu będącego modułem — zastrzeżenie w wyjaśnieniu).
    ``warunek_wstepny_nieuruchomiony`` — kryterium nie stosuje się, bo jego warunek wstępny nie
    wystąpił w scenariuszu (np. napięcie poniżej obwiedni FRT: obowiązek nie został uruchomiony);
    rozróżnia ten powód od niestosowalności z typu albo technologii.
    """

    typ_modulu: Tekst | None = None
    technologia: Tekst | None = None
    modul_istniejacy: bool | None = None
    dotyczy: bool
    powod_pl: Tekst
    podstawa: PodstawaWymagania | None = None
    warunek_wstepny_nieuruchomiony: bool = False

    @model_validator(mode="after")
    def _warunek_wstepny(self) -> Self:
        if self.warunek_wstepny_nieuruchomiony and self.dotyczy:
            raise ValueError(
                "Nieuruchomiony warunek wstępny oznacza niestosowalność w scenariuszu "
                "(dotyczy=False)."
            )
        return self


class Etykieta(_Zamrozony):
    """Etykieta PL i semantyka koloru statusu (§9) — liczona w backendzie, niesiona w rekordzie."""

    etykieta_pl: Tekst
    semantyka: SemantykaKoloru


# ---------------------------------------------------------------------------
# Rekordy poziomu K i W
# ---------------------------------------------------------------------------


class _RekordWerdyktu(_Zamrozony):
    def kanoniczny_json(self) -> str:
        """Kanoniczny JSON rekordu (T12): klucze posortowane, zapis zwarty, UTF-8 bez ucieczek."""
        return json.dumps(
            self.model_dump(mode="json"),
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        )

    def odcisk(self) -> str:
        """SHA-256 kanonicznego JSON rekordu."""
        return hashlib.sha256(self.kanoniczny_json().encode("utf-8")).hexdigest()


def _sprawdz_parametry_sieci(zakres: ZakresWaznosci, dowod: StatusDowodu) -> None:
    """Parametr sieci bez źródła (jakość ESTIMATED/SYSTEM_DEFAULT) jest daną przyjętą.

    Dwa miejsca niosą dane przyjęte (zakres ważności i status danych dowodu); predykat jest
    jeden: taki parametr MUSI stać na liście danych przyjętych dowodu — inaczej kompletność
    dowodu liczona z ``status_danych`` przemilczałaby założoną wartość sieci.
    """
    for parametr in zakres.parametry_sieci:
        if (
            parametr.jakosc in JAKOSCI_BEZ_ZRODLA
            and parametr not in dowod.status_danych.dane_przyjete
        ):
            raise ValueError(
                f"Parametr sieci „{parametr.nazwa_pl}” ma jakość {parametr.jakosc} — musi "
                "figurować w danych przyjętych dowodu (status danych UNVALIDATED_INPUT)."
            )


def _sprawdz_braki(
    status: StatusWerdyktu,
    czego_brakuje: tuple[str, ...],
    braki_reguly: tuple[str, ...],
) -> None:
    if czego_brakuje[: len(braki_reguly)] != braki_reguly:
        raise ValueError(
            "Lista 'czego_brakuje' nie zaczyna się od braków wyprowadzonych regułą: "
            f"oczekiwano {list(braki_reguly)}, jest {list(czego_brakuje)}."
        )
    if status in STATUSY_Z_BRAKAMI and not czego_brakuje:
        raise ValueError(f"Status {status} wymaga niepustej listy 'czego_brakuje'.")


class OcenaKryterium(_RekordWerdyktu):
    """Rekord poziomu K: JEDNO kryterium na JEDNYM przedmiocie (§4.1).

    Konstrukcja właściwa: ``werdykt.decyzja.ocen_kryterium``. Konstrukcja bezpośrednia (także
    odczyt z JSON) przechodzi te same wyprowadzenia i jest odrzucana, gdy którekolwiek
    wyprowadzone pole różni się od wyniku reguły.
    """

    kryterium_id: Tekst
    przedmiot: Przedmiot
    kryterium: Kryterium
    podstawa: PodstawaWymagania
    stosowalnosc: Stosowalnosc
    wynik: WynikKryterium | None
    limit: LimitKryterium | None
    margines: Margines | None
    niepewnosc: Niepewnosc
    status_maszynowy: StatusWerdyktu
    kompletnosc_dowodu: KompletnoscDowodu
    powody_niepelnosci: tuple[Tekst, ...]
    etykieta: Etykieta
    wyjasnienie: WyjasnienieWerdyktu
    dowod: StatusDowodu
    zakres_waznosci: ZakresWaznosci
    slad: tuple[OdnosnikSladu, ...]

    @model_validator(mode="after")
    def _zgodnosc_z_regula(self) -> Self:
        # Import wewnątrz walidatora: `decyzja` importuje typy z tego modułu (cykl).
        from werdykt import decyzja

        self._sprawdz_strukture()
        _sprawdz_parametry_sieci(self.zakres_waznosci, self.dowod)
        # Tolerancja z profilu nie jest polem rekordu poza skalą marginesu — odczyt ze skali.
        tolerancja = (
            self.margines.skala
            if self.margines is not None and self.margines.skala_rodzaj == "TOLERANCJA"
            else None
        )
        pochodne = decyzja.wyprowadz_pola_kryterium(
            kryterium=self.kryterium,
            podstawa=self.podstawa,
            stosowalnosc=self.stosowalnosc,
            wynik=self.wynik,
            limit=self.limit,
            niepewnosc=self.niepewnosc,
            dowod=self.dowod,
            zakres_waznosci=self.zakres_waznosci,
            tolerancja=tolerancja,
        )
        if self.margines != pochodne.margines:
            raise ValueError(
                f"Kryterium {self.kryterium_id}: margines rekordu różni się od marginesu "
                f"wyprowadzonego z wyniku i limitu ({self.margines} ≠ {pochodne.margines})."
            )
        if self.status_maszynowy != pochodne.status:
            raise ValueError(
                f"Kryterium {self.kryterium_id}: status {self.status_maszynowy} różni się od "
                f"statusu reguły {pochodne.status} (krok {pochodne.krok})."
            )
        if (self.kompletnosc_dowodu, self.powody_niepelnosci) != (
            pochodne.kompletnosc,
            pochodne.powody,
        ):
            raise ValueError(
                f"Kryterium {self.kryterium_id}: kompletność dowodu {self.kompletnosc_dowodu} "
                f"z powodami {list(self.powody_niepelnosci)} różni się od wyprowadzonej "
                f"{pochodne.kompletnosc} z powodami {list(pochodne.powody)}."
            )
        if self.etykieta != pochodne.etykieta:
            raise ValueError(
                f"Kryterium {self.kryterium_id}: etykieta {self.etykieta} różni się od etykiety "
                f"słownika {pochodne.etykieta}."
            )
        if self.status_maszynowy != "SPELNIA" and self.wyjasnienie.przyczyna_pl is None:
            raise ValueError(
                f"Kryterium {self.kryterium_id}: status {self.status_maszynowy} wymaga przyczyny."
            )
        _sprawdz_braki(self.status_maszynowy, self.wyjasnienie.czego_brakuje, pochodne.braki)
        if self.wyjasnienie.zastrzezenia != pochodne.zastrzezenia:
            raise ValueError(
                f"Kryterium {self.kryterium_id}: zastrzeżenia muszą być wyprowadzone z pól "
                f"rekordu — oczekiwano {list(pochodne.zastrzezenia)}, jest "
                f"{list(self.wyjasnienie.zastrzezenia)}."
            )
        return self

    def _sprawdz_strukture(self) -> None:
        relacja = self.kryterium.relacja
        if self.dowod.metoda in METODY_TYLKO_WYMAGANIA:
            raise ValueError(
                f"Kryterium {self.kryterium_id}: dowód łączony nie jest dowodem jednego kryterium "
                "— łączy się metody składników na poziomie wymagania."
            )
        if (
            self.stosowalnosc.warunek_wstepny_nieuruchomiony
            and self.kryterium.warunek_wstepny_pl is None
        ):
            raise ValueError(
                f"Kryterium {self.kryterium_id}: niestosowalność z powodu warunku wstępnego "
                "wymaga warunku wstępnego kryterium (warunek_wstepny_pl)."
            )
        if relacja == "LOGICZNE":
            if self.limit is not None:
                raise ValueError(
                    f"Kryterium logiczne {self.kryterium_id} nie ma limitu skalarnego — podstawa "
                    "kryterium logicznego jest w polu 'podstawa'."
                )
        elif self.limit is not None:
            postac_wymagana = {
                "NIE_WIECEJ": self.limit.wartosc,
                "NIE_MNIEJ": self.limit.wartosc,
                "PASMO": self.limit.pasmo,
                "OBWIEDNIA_DOLNA": self.limit.obwiednia,
                "OBWIEDNIA_GORNA": self.limit.obwiednia,
            }[relacja]
            if postac_wymagana is None:
                raise ValueError(
                    f"Kryterium {self.kryterium_id}: postać limitu nie pasuje do relacji {relacja}."
                )
        wynik = self.wynik
        if wynik is not None:
            if relacja == "LOGICZNE":
                if wynik.wartosc.jednostka != JEDNOSTKA_LOGICZNA or wynik.wartosc.wartosc not in (
                    0.0,
                    1.0,
                ):
                    raise ValueError(
                        f"Kryterium logiczne {self.kryterium_id}: wynik zapisuje się jako "
                        f'Wielkość(1.0 albo 0.0, "{JEDNOSTKA_LOGICZNA}").'
                    )
                if wynik.punkt_krytyczny_pl is None:
                    raise ValueError(
                        f"Kryterium logiczne {self.kryterium_id}: punkt_krytyczny_pl opisuje stan."
                    )
            elif not wynik.symbol_latex.strip():
                raise ValueError(
                    f"Kryterium {self.kryterium_id}: wynik liczbowy wymaga symbolu w LaTeX."
                )
            if relacja in RELACJE_OBWIEDNI and wynik.chwila_s is None:
                raise ValueError(
                    f"Kryterium {self.kryterium_id}: wynik wobec obwiedni wymaga chwili punktu "
                    "krytycznego (chwila_s)."
                )
            if self.dowod.metoda == "SYMULACJA" and self.dowod.w_domenie_walidacji is None:
                raise ValueError(
                    f"Kryterium {self.kryterium_id}: wynik symulacji wymaga rozstrzygnięcia, czy "
                    "bieg należy do zadeklarowanej domeny walidacji silnika (w_domenie_walidacji)."
                )
            symulacja = wynik.metoda == "SYMULACJA" or self.dowod.metoda == "SYMULACJA"
            if symulacja and self.niepewnosc.wartosc is None:
                raise ValueError(
                    f"Kryterium {self.kryterium_id}: wynik symulacji wymaga oszacowanej "
                    "niepewności (u = |m(h) − m(h/2)|) — brak oszacowania nie może dać werdyktu."
                )
            if wynik.metoda in METODY_OBLICZENIOWE:
                if self.zakres_waznosci.rodzaj_analizy is None:
                    raise ValueError(
                        f"Kryterium {self.kryterium_id}: wynik metody {wynik.metoda} wymaga "
                        "dziedziny fizyki w zakresie ważności — bez niej zakres byłby szerszy "
                        "niż faktyczny."
                    )
                if not self.slad:
                    raise ValueError(
                        f"Kryterium {self.kryterium_id}: wynik metody {wynik.metoda} wymaga "
                        "odnośników śladu WHITE BOX."
                    )


class WynikWymagania(_RekordWerdyktu):
    """Rekord poziomu W: JEDNO wymaganie dla JEDNEGO modułu/obiektu (§4.2).

    Agregat NIGDY nie zastępuje składników — oceny składowe są częścią rekordu. Konstrukcja
    właściwa: ``werdykt.decyzja.zagreguj_wymaganie``; konstrukcja bezpośrednia jest sprawdzana
    tymi samymi wyprowadzeniami.
    """

    wymaganie_id: Tekst
    nazwa_pl: Tekst
    podstawa: PodstawaWymagania
    stosowalnosc: Stosowalnosc
    sposob_wykazania: MetodaDowodu
    #: Podstawa REGUŁY, która czyni sposób wykazania właściwym dla tego wymagania (np. reguła
    #: pokrycia wymagania certyfikatem urządzenia z warstwy WiPWC). Wchodzi do kompletności
    #: dowodu i do zastrzeżeń jak podstawa wymagania: reguła o stanie ``NIEUSTALONE`` czyni
    #: dowód niepełnym (``BRAK_DOWODU``), nigdy ``SPELNIA``. ``None`` — sposób wykazania nie
    #: opiera się na osobnej regule (test, deklaracja, obliczenie); przy ``BRAK_METODY``
    #: zawsze ``None`` (brak metody nie ma reguły).
    podstawa_sposobu_wykazania: PodstawaWymagania | None = None
    oceny_skladowe: tuple[OcenaKryterium, ...]
    pokrycie_programu: PokrycieProgramu
    pokrycie_programu_pl: Tekst
    status_maszynowy: StatusWerdyktu
    kompletnosc_dowodu: KompletnoscDowodu
    powody_niepelnosci: tuple[Tekst, ...]
    kryteria_naruszone: tuple[Tekst, ...]
    kryterium_najblizej_granicy: Tekst | None
    etykieta: Etykieta
    wyjasnienie: WyjasnienieWerdyktu
    dowod: StatusDowodu
    zakres_waznosci: ZakresWaznosci
    slad: tuple[OdnosnikSladu, ...]

    @model_validator(mode="after")
    def _zgodnosc_z_regula(self) -> Self:
        # Import wewnątrz walidatora: `decyzja` i `wyjasnienie` importują typy z tego modułu.
        from werdykt import decyzja, wyjasnienie

        self._sprawdz_strukture()
        _sprawdz_parametry_sieci(self.zakres_waznosci, self.dowod)
        pochodne = decyzja.wyprowadz_pola_wymagania(
            podstawa=self.podstawa,
            stosowalnosc=self.stosowalnosc,
            sposob_wykazania=self.sposob_wykazania,
            podstawa_sposobu_wykazania=self.podstawa_sposobu_wykazania,
            oceny=self.oceny_skladowe,
            pokrycie_programu=self.pokrycie_programu,
            pokrycie_programu_pl=self.pokrycie_programu_pl,
            dowod=self.dowod,
            zakres_waznosci=self.zakres_waznosci,
        )
        if (self.kompletnosc_dowodu, self.powody_niepelnosci) != (
            pochodne.kompletnosc,
            pochodne.powody,
        ):
            raise ValueError(
                f"Wymaganie {self.wymaganie_id}: kompletność dowodu {self.kompletnosc_dowodu} "
                f"z powodami {list(self.powody_niepelnosci)} różni się od wyprowadzonej "
                f"{pochodne.kompletnosc} z powodami {list(pochodne.powody)}."
            )
        if self.status_maszynowy != pochodne.status:
            raise ValueError(
                f"Wymaganie {self.wymaganie_id}: status {self.status_maszynowy} różni się od "
                f"statusu reguły agregacji {pochodne.status} (krok {pochodne.krok})."
            )
        if self.kryteria_naruszone != pochodne.naruszone:
            raise ValueError(
                f"Wymaganie {self.wymaganie_id}: kryteria naruszone {list(self.kryteria_naruszone)}"
                f" różnią się od wyprowadzonych {list(pochodne.naruszone)}."
            )
        if self.kryterium_najblizej_granicy != pochodne.najblizej:
            raise ValueError(
                f"Wymaganie {self.wymaganie_id}: kryterium najbliżej granicy "
                f"{self.kryterium_najblizej_granicy} różni się od wyprowadzonego "
                f"{pochodne.najblizej}."
            )
        if self.etykieta != pochodne.etykieta:
            raise ValueError(
                f"Wymaganie {self.wymaganie_id}: etykieta {self.etykieta} różni się od etykiety "
                f"słownika {pochodne.etykieta}."
            )
        if self.wyjasnienie.przyczyna_pl is None:
            raise ValueError(
                f"Wymaganie {self.wymaganie_id}: przyczyna jest obowiązkowa na poziomie "
                "wymagania (dla statusu SPELNIA — kryterium najbliżej granicy albo powód jego "
                "braku)."
            )
        _sprawdz_braki(self.status_maszynowy, self.wyjasnienie.czego_brakuje, pochodne.braki)
        if self.wyjasnienie.zastrzezenia != pochodne.zastrzezenia:
            raise ValueError(
                f"Wymaganie {self.wymaganie_id}: zastrzeżenia muszą być wyprowadzone z pól "
                f"rekordu — oczekiwano {list(pochodne.zastrzezenia)}, jest "
                f"{list(self.wyjasnienie.zastrzezenia)}."
            )
        skladowe = {ocena.kryterium_id: ocena for ocena in self.oceny_skladowe}
        for kryterium_id in self.kryteria_naruszone:
            nazwa = wyjasnienie.nazwa_skladowej(skladowe[kryterium_id])
            if nazwa not in self.wyjasnienie.zdanie_pl:
                raise ValueError(
                    f"Wymaganie {self.wymaganie_id}: wyjaśnienie nie nazywa naruszonego "
                    f"kryterium składowego „{nazwa}” (T8)."
                )
        if self.kryterium_najblizej_granicy is not None:
            nazwa = wyjasnienie.nazwa_skladowej(skladowe[self.kryterium_najblizej_granicy])
            if nazwa not in self.wyjasnienie.przyczyna_pl:
                raise ValueError(
                    f"Wymaganie {self.wymaganie_id}: przyczyna nie nazywa kryterium najbliżej "
                    f"granicy „{nazwa}”."
                )
        return self

    def _sprawdz_strukture(self) -> None:
        dotyczy = self.stosowalnosc.dotyczy
        if self.stosowalnosc.warunek_wstepny_nieuruchomiony:
            raise ValueError(
                f"Wymaganie {self.wymaganie_id}: warunek wstępny jest cechą kryterium — "
                "niestosowalność wymagania wynika z typu, technologii albo statusu modułu."
            )
        # §4.2: składowe są puste WYŁĄCZNIE przy NIE_DOTYCZY albo BRAK_METODY. Wymaganie
        # niestosowalne nie ma składowych (nic nie jest oceniane); przy BRAK_METODY składowe są
        # dozwolone jako INFORMACYJNE (np. kryterium koordynacji nastaw, które jest warunkiem
        # koniecznym, ale nie wykazuje wymagania) — reguła W daje BRAK_DOWODU niezależnie od nich.
        if not dotyczy and self.oceny_skladowe:
            raise ValueError(
                f"Wymaganie {self.wymaganie_id}: wymaganie nie dotyczy przedmiotu, więc nie ma "
                "ocen składowych (oceny składowe są puste przy NIE_DOTYCZY)."
            )
        if dotyczy and self.sposob_wykazania != "BRAK_METODY" and not self.oceny_skladowe:
            raise ValueError(
                f"Wymaganie {self.wymaganie_id}: oceny składowe są puste wyłącznie przy "
                "NIE_DOTYCZY albo sposobie wykazania BRAK_METODY — sposób "
                f"{self.sposob_wykazania} wymaga co najmniej jednej oceny składowej."
            )
        if self.sposob_wykazania == "BRAK_METODY" and self.podstawa_sposobu_wykazania is not None:
            raise ValueError(
                f"Wymaganie {self.wymaganie_id}: sposób wykazania BRAK_METODY nie ma reguły, "
                "która czyniłaby go właściwym — podstawa sposobu wykazania musi być pusta."
            )
        identyfikatory = [ocena.kryterium_id for ocena in self.oceny_skladowe]
        if len(set(identyfikatory)) != len(identyfikatory):
            raise ValueError(
                f"Wymaganie {self.wymaganie_id}: powtórzony identyfikator kryterium składowego "
                f"({identyfikatory})."
            )
        if self.sposob_wykazania not in METODY_WYKAZANIA:
            dozwolone = ", ".join(m for m in KOLEJNOSC_METOD if m in METODY_WYKAZANIA)
            raise ValueError(
                f"Wymaganie {self.wymaganie_id}: {self.sposob_wykazania} nie jest sposobem "
                f"wykazania wymagania — dozwolone: {dozwolone}."
            )
        if self.dowod.metoda != self.sposob_wykazania:
            raise ValueError(
                f"Wymaganie {self.wymaganie_id}: metoda dowodu {self.dowod.metoda} różni się od "
                f"sposobu wykazania {self.sposob_wykazania}."
            )
        if (
            self.dowod.poziom is EvidenceTier.TYPE_TEST_CERTIFICATE
            and self.dowod.metoda == "DOWOD_LACZONY"
            and not any(
                ocena.status_maszynowy != "NIE_DOTYCZY" and ocena.dowod.metoda == "CERTYFIKAT"
                for ocena in self.oceny_skladowe
            )
        ):
            raise ValueError(
                f"Wymaganie {self.wymaganie_id}: dowód łączony ma poziom "
                f"{EvidenceTier.TYPE_TEST_CERTIFICATE.value} bez stosowalnej składowej "
                "wykazanej certyfikatem — rekord bez certyfikatu nie niesie poziomu certyfikatu."
            )
        self._sprawdz_pokrycie(dotyczy)
        self._sprawdz_zakres()

    def _sprawdz_pokrycie(self, dotyczy: bool) -> None:
        if not dotyczy and self.pokrycie_programu != "NIE_DOTYCZY":
            raise ValueError(
                f"Wymaganie {self.wymaganie_id}: wymaganie nie dotyczy przedmiotu, więc pokrycie "
                "programu badań jest NIE_DOTYCZY."
            )
        if self.sposob_wykazania in ("DEKLARACJA", "CERTYFIKAT"):
            if self.pokrycie_programu != "NIE_DOTYCZY":
                raise ValueError(
                    f"Wymaganie {self.wymaganie_id}: wymaganie wykazywane "
                    f"({self.sposob_wykazania}) nie ma programu badań — pokrycie NIE_DOTYCZY."
                )
        symulacja_w_dowodzie = self.sposob_wykazania == "SYMULACJA" or any(
            ocena.status_maszynowy != "NIE_DOTYCZY"
            and (
                ocena.dowod.metoda == "SYMULACJA"
                or (ocena.wynik is not None and ocena.wynik.metoda == "SYMULACJA")
            )
            for ocena in self.oceny_skladowe
        )
        if dotyczy and symulacja_w_dowodzie and self.pokrycie_programu == "NIE_DOTYCZY":
            raise ValueError(
                f"Wymaganie {self.wymaganie_id}: wymaganie wykazywane biegami symulacji wymaga "
                "określenia pokrycia programu badań (PELNE albo CZESCIOWE)."
            )

    def _sprawdz_zakres(self) -> None:
        stosowalne = [o for o in self.oceny_skladowe if o.status_maszynowy != "NIE_DOTYCZY"]
        wykluczenia = set(self.zakres_waznosci.wykluczenia)
        for ocena in stosowalne:
            pominiete = [w for w in ocena.zakres_waznosci.wykluczenia if w not in wykluczenia]
            if pominiete:
                raise ValueError(
                    f"Wymaganie {self.wymaganie_id}: zakres ważności agregatu pomija wykluczenia "
                    f"składnika {ocena.kryterium_id}: {pominiete} — agregat nie może być opisany "
                    "szerzej niż jego składniki."
                )
            dziedzina = self.zakres_waznosci.rodzaj_analizy
            dziedzina_skladnika = ocena.zakres_waznosci.rodzaj_analizy
            if (
                dziedzina is not None
                and dziedzina_skladnika is not None
                and dziedzina != dziedzina_skladnika
            ):
                raise ValueError(
                    f"Wymaganie {self.wymaganie_id}: zakres agregatu ({dziedzina}) inny niż "
                    f"zakres składnika {ocena.kryterium_id} ({dziedzina_skladnika}) — dla "
                    "składników z różnych dziedzin rodzaj analizy agregatu pozostaje pusty."
                )
