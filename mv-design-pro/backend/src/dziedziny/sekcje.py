"""Sekcje modelu urządzenia per dziedzina i ich status — WYPROWADZANY, nigdy przechowywany.

DWIE OSIE, NIE JEDNA (karta AB-H0 §0.2). ``DziedzinaFizyki`` (6 wartości) jest importowana
z ``werdykt.kontrakt`` — zero drugiej definicji. ``RodzajSekcjiModelu`` (8 wartości) to
rodzaje sekcji modelu urządzenia: pięć sekcji FIZYCZNYCH (każda ma swoje dziedziny
w ``DZIEDZINY_SEKCJI``) i trzy sekcje DOWODOWE (``certification``, ``measurement``,
``validation``) — bez dziedziny; rekord dowodu deklaruje, które dziedziny pokrywa.

STATUS WYPROWADZANY (§0.3). Rekord katalogu ani element ENM NIE niesie pola statusu
sekcji. Status liczy JEDNA funkcja ``status_sekcji(WejscieStatusuSekcji) -> OcenaSekcji``
z: jakości pól (``FieldQuality``), rekordów dowodów, statusu weryfikacji rekordu
katalogowego i obecności danych. Dwa adaptery (typ katalogowy
``network_model.catalog.sekcje_modelu.sekcje_typu`` i element ENM
``application.model_urzadzenia.sekcje_elementu.sekcje_elementu``) budują wejście i wołają
TĘ SAMĄ funkcję (predykaty parami).

TABELA REGUŁ (wiążąca, przypięta testem iloczynu cech
``tests/dziedziny/test_sekcje_iloczyn_cech.py`` z niezależną wyrocznią):

Składnik sekcji FIZYCZNEJ (np. ``harmonic`` = emisja + impedancja wewnętrzna):

1. brak danych (brakujące pole wymagane albo brak modelu widmowego) → ``UNKNOWN``,
   powód nazywa braki;
2. sufit jakości: pole obecne o jakości ``ESTIMATED`` / ``SYSTEM_DEFAULT`` / niezadeklarowanej,
   parametr modelu parametrycznego o takiej jakości, albo model widma źródła bez kompletu
   parametrów pomiaru → co najwyżej ``UNVALIDATED`` (powód nazywa pola; każda taka dana
   wchodzi do ``dane_przyjete`` oceny);
3. dowód UZNANY = rekord dowodu, którego podstawa ma stan ``WSKAZANE``/``ZWERYFIKOWANE``
   (własna podstawa), ALBO rekord katalogowy ``ZWERYFIKOWANY`` (katalog zweryfikował
   dokument). Rekord ``REFERENCYJNY`` / ``NIEWERYFIKOWANY`` / ``CZESCIOWO_ZWERYFIKOWANY``
   nie przenosi weryfikacji na dowód — sufit ``UNVALIDATED``, chyba że dowód ma własną
   podstawę (§0.3.5);
4. uznany certyfikat MODELU pokrywający dziedzinę sekcji → ``CERTIFIED``;
5. uznany raport badań albo pomiar pokrywający dziedzinę, albo wszystkie modele składnika
   widmowego to widma zmierzone z kompletem pomiaru i podstawą ``WSKAZANE``/
   ``ZWERYFIKOWANE`` → ``MEASURED``;
6. w pozostałych przypadkach (deklaracja producenta, dane bez dowodu) → ``UNVALIDATED``
   (deklaracja producenta nie jest walidacją);
7. status składnika = słabszy z (sufit jakości, status z dowodu).

Certyfikat ZGODNOŚCI (wykaz PTPiREE) nie podnosi żadnej sekcji fizycznej — certyfikat
urządzenia nie certyfikuje modelu symulacyjnego (§0.3.4; kontrakt werdyktu §3b).

Składnik WYMAGANY bez choćby jednego pola albo bez modelu → ``UNKNOWN`` z nazwanym brakiem.
Składnik OPCJONALNY z danymi jest oceniany na polach OBECNYCH (pola nieobecne nazwane w
powodzie — pola składnika opcjonalnego bywają alternatywami trybu pracy).

Status sekcji fizycznej = najsłabszy składnik uwzględniony (wymagany zawsze; opcjonalny,
gdy ma dane) wg porządku ``PORZADEK_SILY`` (``UNKNOWN < UNVALIDATED < MEASURED <
VALIDATED < CERTIFIED``); sekcja bez uwzględnionego składnika → ``UNKNOWN``.

Sekcje DOWODOWE (bez składników): ``certification`` — uznany certyfikat (zgodności albo
modelu) → ``CERTIFIED``; ``measurement`` — uznany raport badań albo pomiar → ``MEASURED``;
dowód bez ustalonej podstawy → ``UNVALIDATED``; brak dowodu → ``UNKNOWN``.
``validation`` — ``UNKNOWN`` zawsze: w tym przyroście NIE istnieje producent rekordu
walidacji model–pomiar (przyrosty AB-H4/AB-7); wartość ``VALIDATED`` jest w słowniku
(plan O-19), a test przypina, że ``status_sekcji`` jej nie zwraca.

``OUTSIDE_DOMAIN`` nie jest statusem statycznym: zwraca go wyłącznie zapytanie o model
(``dziedziny.widmo.wybierz_model``) przy (f, punkt pracy) spoza domeny modelu.

ODWZOROWANIE NA ``StatusModelu`` — JEDNA funkcja ``status_modelu_z_sekcji``: ``CERTIFIED``
→ ``CERTIFIED_MODEL``; ``VALIDATED`` → ``VALIDATED_AGAINST_TEST``; ``MEASURED`` →
``VALIDATED_AGAINST_TEST`` WYŁĄCZNIE, gdy zapytanie o model trafiło w domenę modelu
(``ModelWybrany``), inaczej brak modelu z powodem; ``UNVALIDATED`` → ``UNVALIDATED_MODEL``;
``UNKNOWN`` / ``OUTSIDE_DOMAIN`` → ``BrakModelu`` z powodem (konsument: ``NIE_OCENIONO``
z „czego brakuje"). Sekcja dowodowa nie jest modelem → ``BrakModelu``. Konsumenci werdyktu
biorą ``StatusModelu`` urządzenia WYŁĄCZNIE z tej funkcji.

IMPORTY: stdlib, pydantic, ``werdykt.kontrakt``, ``werdykt.proweniencja``, ``dziedziny.*``.
"""

from __future__ import annotations

from collections.abc import Mapping
from types import MappingProxyType
from typing import Literal, Self, get_args

from dziedziny.kanon import KontraktDziedziny, naruszenie
from dziedziny.widmo import (
    STANY_USTALONE,
    ModelWybrany,
    ModelZrodlaWidmowego,
    NiejednoznacznyWybor,
    PozaDomenaModelu,
    WynikWyboruModelu,
)
from pydantic import field_validator, model_validator
from werdykt.kontrakt import DanaPrzyjeta, DziedzinaFizyki, PodstawaWymagania, StatusModelu, Tekst
from werdykt.proweniencja import FieldQuality

# ---------------------------------------------------------------------------
# Słowniki zamknięte
# ---------------------------------------------------------------------------

#: Rodzaj sekcji modelu urządzenia (plan O-19): pięć fizycznych i trzy dowodowe.
RodzajSekcjiModelu = Literal[
    "fundamental",
    "short_circuit",
    "dynamic",
    "harmonic",
    "supraharmonic",
    "certification",
    "measurement",
    "validation",
]
#: Status sekcji (plan O-19). ``OUTSIDE_DOMAIN`` wyłącznie z zapytania o model.
StatusSekcji = Literal[
    "VALIDATED", "UNVALIDATED", "MEASURED", "CERTIFIED", "UNKNOWN", "OUTSIDE_DOMAIN"
]
#: Status weryfikacji rekordu katalogowego — wartości ``CatalogVerificationStatus``
#: (``network_model.catalog.types``; parytet przypięty testem — liść nie importuje katalogu).
StatusWeryfikacjiRekordu = Literal[
    "ZWERYFIKOWANY", "NIEWERYFIKOWANY", "CZESCIOWO_ZWERYFIKOWANY", "REFERENCYJNY"
]
#: Rodzaj rekordu dowodu. Rekordu walidacji model–pomiar NIE MA (brak producenta w AB-H0).
RodzajDowodu = Literal[
    "DEKLARACJA_KARTY",
    "RAPORT_BADAN",
    "POMIAR",
    "CERTYFIKAT_ZGODNOSCI",
    "CERTYFIKAT_MODELU",
]
#: Postać danych składnika sekcji: pola karty albo modele widmowe (karty widmowe).
RodzajDanychSkladnika = Literal["POLA", "MODELE_WIDMOWE"]

#: Sekcje fizyczne i dowodowe (kolejność = kolejność prezentacji).
SEKCJE_FIZYCZNE: tuple[RodzajSekcjiModelu, ...] = (
    "fundamental",
    "short_circuit",
    "dynamic",
    "harmonic",
    "supraharmonic",
)
SEKCJE_DOWODOWE: tuple[RodzajSekcjiModelu, ...] = ("certification", "measurement", "validation")
#: Wszystkie sekcje w kolejności prezentacji.
SEKCJE: tuple[RodzajSekcjiModelu, ...] = get_args(RodzajSekcjiModelu)

#: Dziedziny fizyki sekcji — sekcje dowodowe nie mają dziedziny (pokrywają dziedziny
#: przez ``DowodModelu.pokrywa``).
DZIEDZINY_SEKCJI: Mapping[RodzajSekcjiModelu, frozenset[DziedzinaFizyki]] = MappingProxyType(
    {
        "fundamental": frozenset(("POWER_FLOW", "SEQUENCE_DOMAIN")),
        "short_circuit": frozenset(("SHORT_CIRCUIT",)),
        "dynamic": frozenset(("RMS_DYNAMICS",)),
        "harmonic": frozenset(("HARMONIC_FREQUENCY_DOMAIN",)),
        "supraharmonic": frozenset(("SUPRAHARMONIC_FREQUENCY_DOMAIN",)),
        "certification": frozenset(),
        "measurement": frozenset(),
        "validation": frozenset(),
    }
)

#: Porządek siły statusu — od najsłabszego do najmocniejszego (``OUTSIDE_DOMAIN`` poza
#: porządkiem: nie jest statusem statycznym).
PORZADEK_SILY: tuple[StatusSekcji, ...] = (
    "UNKNOWN",
    "UNVALIDATED",
    "MEASURED",
    "VALIDATED",
    "CERTIFIED",
)
#: Status rekordu katalogowego, który przenosi weryfikację dokumentu na rekord dowodu.
STATUS_REKORDU_PRZENOSZACY: StatusWeryfikacjiRekordu = "ZWERYFIKOWANY"
#: Dowody, które mogą uczynić sekcję fizyczną ``MEASURED``.
DOWODY_POMIAROWE: frozenset[RodzajDowodu] = frozenset(("RAPORT_BADAN", "POMIAR"))
#: Dowody sekcji ``certification``.
DOWODY_CERTYFIKACJI: frozenset[RodzajDowodu] = frozenset(
    ("CERTYFIKAT_ZGODNOSCI", "CERTYFIKAT_MODELU")
)
#: Powód stały sekcji walidacji (brak producenta rekordu w tym przyroście).
POWOD_BRAKU_WALIDACJI = (
    "brak rekordu walidacji model–pomiar (metryki zgodności modelu z pomiarem) — producent "
    "takiego rekordu nie istnieje w produkcie; sekcja walidacji pozostaje nieznana"
)


def _sila(status: StatusSekcji) -> int:
    return PORZADEK_SILY.index(status)


def slabszy(a: StatusSekcji, b: StatusSekcji) -> StatusSekcji:
    """Słabszy z dwóch statusów wg ``PORZADEK_SILY``."""
    return a if _sila(a) <= _sila(b) else b


# ---------------------------------------------------------------------------
# Wejście funkcji statusu
# ---------------------------------------------------------------------------


class DowodModelu(KontraktDziedziny):
    """Rekord dowodu: rodzaj, dziedziny, które pokrywa (niepuste), podstawa i odniesienie
    (np. numer raportu badań, numer certyfikatu z wykazu)."""

    rodzaj: RodzajDowodu
    pokrywa: tuple[DziedzinaFizyki, ...]
    podstawa: PodstawaWymagania
    odniesienie_pl: Tekst

    @field_validator("pokrywa")
    @classmethod
    def _pokrywa_niepusta(cls, pokrywa: tuple[DziedzinaFizyki, ...]) -> tuple[DziedzinaFizyki, ...]:
        if not pokrywa:
            raise ValueError(
                naruszenie(
                    "dowod.pokrywa",
                    "Rekord dowodu musi deklarować co najmniej jedną pokrytą dziedzinę.",
                )
            )
        if len(set(pokrywa)) != len(pokrywa):
            raise ValueError(
                naruszenie("dowod.pokrywa", f"Pokryte dziedziny powtarzają się: {list(pokrywa)}.")
            )
        return tuple(sorted(pokrywa))


class PoleSekcji(KontraktDziedziny):
    """Pole karty należące do składnika sekcji: obecność i jakość danej.

    ``jakosc = None`` przy polu obecnym = jakość niezadeklarowana (traktowana jak dana bez
    źródła — sufit ``UNVALIDATED``).
    """

    nazwa: Tekst
    obecne: bool
    jakosc: FieldQuality | None


class SkladnikSekcji(KontraktDziedziny):
    """Część sekcji (np. emisja i impedancja wewnętrzna sekcji ``harmonic``)."""

    nazwa: Tekst
    wymagany: bool
    rodzaj_danych: RodzajDanychSkladnika
    pola: tuple[PoleSekcji, ...] = ()
    modele: tuple[ModelZrodlaWidmowego, ...] = ()

    @model_validator(mode="after")
    def _postac_danych(self) -> Self:
        if self.rodzaj_danych == "POLA":
            if not self.pola:
                raise ValueError(
                    naruszenie(
                        "sekcje.wejscie", f"Składnik '{self.nazwa}' z danymi POLA wymaga listy pól."
                    )
                )
            if self.modele:
                raise ValueError(
                    naruszenie(
                        "sekcje.wejscie",
                        f"Składnik '{self.nazwa}' z danymi POLA nie niesie modeli.",
                    )
                )
            nazwy = [p.nazwa for p in self.pola]
            if len(set(nazwy)) != len(nazwy):
                raise ValueError(
                    naruszenie(
                        "sekcje.wejscie", f"Składnik '{self.nazwa}': pola powtarzają się {nazwy}."
                    )
                )
        elif self.pola:
            raise ValueError(
                naruszenie(
                    "sekcje.wejscie",
                    f"Składnik '{self.nazwa}' z danymi MODELE_WIDMOWE nie niesie pól karty.",
                )
            )
        return self


class WejscieStatusuSekcji(KontraktDziedziny):
    """Wejście JEDNEJ funkcji statusu sekcji."""

    sekcja: RodzajSekcjiModelu
    skladniki: tuple[SkladnikSekcji, ...] = ()
    dowody: tuple[DowodModelu, ...] = ()
    status_weryfikacji_rekordu: StatusWeryfikacjiRekordu

    @model_validator(mode="after")
    def _skladniki_zgodne_z_sekcja(self) -> Self:
        if self.sekcja in SEKCJE_DOWODOWE and self.skladniki:
            raise ValueError(
                naruszenie(
                    "sekcje.wejscie",
                    f"Sekcja dowodowa '{self.sekcja}' nie ma składników danych — jej status "
                    "wynika wyłącznie z rekordów dowodów.",
                )
            )
        nazwy = [s.nazwa for s in self.skladniki]
        if len(set(nazwy)) != len(nazwy):
            raise ValueError(
                naruszenie(
                    "sekcje.wejscie", f"Sekcja '{self.sekcja}': składniki powtarzają nazwy {nazwy}."
                )
            )
        return self


# ---------------------------------------------------------------------------
# Wynik
# ---------------------------------------------------------------------------


class OcenaSkladnika(KontraktDziedziny):
    """Status jednego składnika z powodem i danymi przyjętymi bez walidacji."""

    nazwa: Tekst
    wymagany: bool
    uwzgledniony: bool
    status: StatusSekcji
    powod_pl: Tekst
    dane_przyjete: tuple[DanaPrzyjeta, ...] = ()


class OcenaSekcji(KontraktDziedziny):
    """Status sekcji z powodem, składnikami i danymi przyjętymi bez walidacji."""

    sekcja: RodzajSekcjiModelu
    status: StatusSekcji
    powod_pl: Tekst
    skladniki: tuple[OcenaSkladnika, ...] = ()
    dane_przyjete: tuple[DanaPrzyjeta, ...] = ()


class BrakModelu(KontraktDziedziny):
    """Brak modelu urządzenia w sekcji — konsument werdyktu: ``NIE_OCENIONO`` z brakami."""

    sekcja: RodzajSekcjiModelu
    powod_pl: Tekst
    czego_brakuje_pl: Tekst


# ---------------------------------------------------------------------------
# JEDNA funkcja statusu
# ---------------------------------------------------------------------------


def dowod_uznany(dowod: DowodModelu, status_rekordu: StatusWeryfikacjiRekordu) -> bool:
    """Czy dowód liczy się do statusu: własna podstawa ustalona albo rekord zweryfikowany."""
    return dowod.podstawa.status in STANY_USTALONE or status_rekordu == STATUS_REKORDU_PRZENOSZACY


def _model_zmierzony_kompletnie(model: ModelZrodlaWidmowego) -> bool:
    if model.rodzaj != "MEASURED_SPECTRUM" or model.pomiar is None:
        return False
    supra = model.dziedzina == "SUPRAHARMONIC_FREQUENCY_DOMAIN"
    return (
        not model.pomiar.braki_kompletu(supraharmoniczna=supra)
        and model.podstawa.status in STANY_USTALONE
    )


def _sufit_jakosci(skladnik: SkladnikSekcji) -> tuple[list[str], list[DanaPrzyjeta]]:
    """Powody sufitu ``UNVALIDATED`` z jakości danych składnika i dane przyjęte."""
    powody: list[str] = []
    przyjete: list[DanaPrzyjeta] = []
    for pole in skladnik.pola:
        if not pole.obecne or pole.jakosc is FieldQuality.DATASHEET:
            continue
        opis = "niezadeklarowana" if pole.jakosc is None else pole.jakosc.value
        powody.append(f"pole {pole.nazwa} o jakości {opis}")
        przyjete.append(
            DanaPrzyjeta(
                nazwa_pl=pole.nazwa,
                wartosc=None,
                powod_pl=f"jakość danej {opis} — wartość bez źródła z karty technicznej",
                jakosc=pole.jakosc,
            )
        )
    for model in skladnik.modele:
        if model.model_parametryczny is not None:
            for parametr in model.model_parametryczny.parametry:
                if parametr.jakosc is FieldQuality.DATASHEET:
                    continue
                powody.append(
                    f"parametr {parametr.nazwa} modelu {model.ident} o jakości "
                    f"{parametr.jakosc.value}"
                )
                przyjete.append(
                    DanaPrzyjeta(
                        nazwa_pl=f"{model.ident}.{parametr.nazwa}",
                        wartosc=parametr.wartosc,
                        powod_pl=f"jakość danej {parametr.jakosc.value}",
                        jakosc=parametr.jakosc,
                    )
                )
        if model.skladowe and (
            model.pomiar is None
            or model.pomiar.braki_kompletu(
                supraharmoniczna=model.dziedzina == "SUPRAHARMONIC_FREQUENCY_DOMAIN"
            )
        ):
            powody.append(f"model {model.ident} bez kompletu parametrów pomiaru")
            przyjete.append(
                DanaPrzyjeta(
                    nazwa_pl=f"{model.ident}.pomiar",
                    wartosc=None,
                    powod_pl="parametry pomiaru nieznane — zakres ważności widma nieokreślony",
                    jakosc=None,
                )
            )
    return powody, przyjete


def _ocena_skladnika(
    sekcja: RodzajSekcjiModelu,
    skladnik: SkladnikSekcji,
    dowody: tuple[DowodModelu, ...],
    status_rekordu: StatusWeryfikacjiRekordu,
) -> OcenaSkladnika:
    nieobecne_opcjonalne = ""
    if skladnik.rodzaj_danych == "POLA":
        brakujace = [p.nazwa for p in skladnik.pola if not p.obecne]
        ma_dane = any(p.obecne for p in skladnik.pola)
        # Składnik WYMAGANY bez choćby jednego pola = brak danych sekcji. Składnik
        # OPCJONALNY z danymi jest oceniany na polach OBECNYCH (pola składnika opcjonalnego
        # bywają alternatywami trybu — np. krzywa Q(U) albo cos φ(P) wg trybu regulacji);
        # jego pola nieobecne są nazwane w powodzie, ale nie czynią sekcji nieznaną.
        brak_danych = bool(brakujace) if skladnik.wymagany else not ma_dane
        opis_brakow = f"brak pól: {', '.join(brakujace)}"
        if brakujace and not brak_danych:
            nieobecne_opcjonalne = f"; pola nieobecne (składnik opcjonalny): {', '.join(brakujace)}"
    else:
        ma_dane = bool(skladnik.modele)
        brak_danych = not skladnik.modele
        opis_brakow = "brak modelu widmowego (karty widmowej) urządzenia"
    uwzgledniony = skladnik.wymagany or ma_dane
    if brak_danych:
        return OcenaSkladnika(
            nazwa=skladnik.nazwa,
            wymagany=skladnik.wymagany,
            uwzgledniony=uwzgledniony,
            status="UNKNOWN",
            powod_pl=opis_brakow,
        )

    dziedziny = DZIEDZINY_SEKCJI[sekcja]
    uznane = [
        d for d in dowody if dowod_uznany(d, status_rekordu) and dziedziny.intersection(d.pokrywa)
    ]
    certyfikaty = [d for d in uznane if d.rodzaj == "CERTYFIKAT_MODELU"]
    pomiary = [d for d in uznane if d.rodzaj in DOWODY_POMIAROWE]
    zmierzone = skladnik.rodzaj_danych == "MODELE_WIDMOWE" and all(
        _model_zmierzony_kompletnie(m) for m in skladnik.modele
    )
    status_dowodu: StatusSekcji
    if certyfikaty:
        status_dowodu = "CERTIFIED"
        powod_dowodu = "certyfikat modelu: " + ", ".join(d.odniesienie_pl for d in certyfikaty)
    elif pomiary or zmierzone:
        status_dowodu = "MEASURED"
        zrodla = [d.odniesienie_pl for d in pomiary]
        if zmierzone:
            zrodla.extend(f"widmo zmierzone {m.ident}" for m in skladnik.modele)
        powod_dowodu = "dane z pomiaru: " + ", ".join(zrodla)
    else:
        status_dowodu = "UNVALIDATED"
        if status_rekordu != STATUS_REKORDU_PRZENOSZACY and any(
            dziedziny.intersection(d.pokrywa)
            and d.rodzaj in (DOWODY_POMIAROWE | {"CERTYFIKAT_MODELU"})
            for d in dowody
        ):
            powod_dowodu = (
                f"rekord katalogowy {status_rekordu} — dowód bez własnej ustalonej podstawy "
                "nie podnosi statusu"
            )
        else:
            powod_dowodu = "dane bez rekordu dowodu — deklaracja producenta nie jest walidacją"

    sufit_powody, przyjete = _sufit_jakosci(skladnik)
    if sufit_powody and _sila(status_dowodu) > _sila("UNVALIDATED"):
        status: StatusSekcji = "UNVALIDATED"
        powod = f"{powod_dowodu}; status ograniczony: {'; '.join(sufit_powody)}"
    elif sufit_powody:
        status = status_dowodu
        powod = f"{powod_dowodu}; {'; '.join(sufit_powody)}"
    else:
        status = status_dowodu
        powod = powod_dowodu
    powod += nieobecne_opcjonalne
    return OcenaSkladnika(
        nazwa=skladnik.nazwa,
        wymagany=skladnik.wymagany,
        uwzgledniony=uwzgledniony,
        status=status,
        powod_pl=powod,
        dane_przyjete=tuple(przyjete),
    )


def _ocena_sekcji_dowodowej(wejscie: WejscieStatusuSekcji) -> OcenaSekcji:
    if wejscie.sekcja == "validation":
        return OcenaSekcji(sekcja="validation", status="UNKNOWN", powod_pl=POWOD_BRAKU_WALIDACJI)
    rodzaje = DOWODY_CERTYFIKACJI if wejscie.sekcja == "certification" else DOWODY_POMIAROWE
    status_osiagalny: StatusSekcji = (
        "CERTIFIED" if wejscie.sekcja == "certification" else "MEASURED"
    )
    wlasciwe = [d for d in wejscie.dowody if d.rodzaj in rodzaje]
    if not wlasciwe:
        nazwa = "certyfikatu" if wejscie.sekcja == "certification" else "raportu badań ani pomiaru"
        return OcenaSekcji(
            sekcja=wejscie.sekcja, status="UNKNOWN", powod_pl=f"brak {nazwa} urządzenia"
        )
    uznane = [d for d in wlasciwe if dowod_uznany(d, wejscie.status_weryfikacji_rekordu)]
    if uznane:
        return OcenaSekcji(
            sekcja=wejscie.sekcja,
            status=status_osiagalny,
            powod_pl="dowód: " + ", ".join(d.odniesienie_pl for d in uznane),
        )
    return OcenaSekcji(
        sekcja=wejscie.sekcja,
        status="UNVALIDATED",
        powod_pl=(
            "dowód bez ustalonej podstawy (dokument bez wydania i jednostki redakcyjnej) przy "
            f"rekordzie katalogowym {wejscie.status_weryfikacji_rekordu}: "
            + ", ".join(d.odniesienie_pl for d in wlasciwe)
        ),
    )


def status_sekcji(wejscie: WejscieStatusuSekcji) -> OcenaSekcji:
    """JEDYNA funkcja statusu sekcji modelu urządzenia (tabela reguł w docstringu modułu)."""
    if wejscie.sekcja in SEKCJE_DOWODOWE:
        return _ocena_sekcji_dowodowej(wejscie)
    oceny = tuple(
        _ocena_skladnika(
            wejscie.sekcja, skladnik, wejscie.dowody, wejscie.status_weryfikacji_rekordu
        )
        for skladnik in wejscie.skladniki
    )
    uwzglednione = [o for o in oceny if o.uwzgledniony]
    if not uwzglednione:
        return OcenaSekcji(
            sekcja=wejscie.sekcja,
            status="UNKNOWN",
            powod_pl="brak danych sekcji",
            skladniki=oceny,
        )
    najslabszy = uwzglednione[0]
    for ocena in uwzglednione[1:]:
        if _sila(ocena.status) < _sila(najslabszy.status):
            najslabszy = ocena
    przyjete = tuple(d for o in uwzglednione for d in o.dane_przyjete)
    return OcenaSekcji(
        sekcja=wejscie.sekcja,
        status=najslabszy.status,
        powod_pl=f"najsłabszy składnik „{najslabszy.nazwa}”: {najslabszy.powod_pl}",
        skladniki=oceny,
        dane_przyjete=przyjete,
    )


def status_modelu_z_sekcji(
    ocena: OcenaSekcji, *, wybor: WynikWyboruModelu | None = None
) -> StatusModelu | BrakModelu:
    """JEDYNE odwzorowanie statusu sekcji na ``StatusModelu`` urządzenia (§0.3.6).

    ``wybor`` — wynik ``dziedziny.widmo.wybierz_model`` dla zapytania konsumenta; wymagany,
    żeby status ``MEASURED`` przeszedł w ``VALIDATED_AGAINST_TEST`` (tylko w domenie
    punktu pomiaru).
    """
    if ocena.sekcja in SEKCJE_DOWODOWE:
        return BrakModelu(
            sekcja=ocena.sekcja,
            powod_pl=(
                f"sekcja dowodowa '{ocena.sekcja}' nie jest modelem urządzenia — certyfikat "
                "zgodności ani raport badań nie certyfikuje modelu symulacyjnego"
            ),
            czego_brakuje_pl="model urządzenia w sekcji fizycznej właściwej dla analizy",
        )
    if ocena.status == "CERTIFIED":
        return "CERTIFIED_MODEL"
    if ocena.status == "VALIDATED":
        return "VALIDATED_AGAINST_TEST"
    if ocena.status == "UNVALIDATED":
        return "UNVALIDATED_MODEL"
    if ocena.status == "MEASURED":
        if isinstance(wybor, ModelWybrany):
            return "VALIDATED_AGAINST_TEST"
        if isinstance(wybor, PozaDomenaModelu):
            return BrakModelu(
                sekcja=ocena.sekcja,
                powod_pl=f"zapytanie poza domeną punktu pomiaru ({wybor.parametr}): "
                f"{wybor.powod_pl}",
                czego_brakuje_pl=f"model sekcji {ocena.sekcja} obejmujący punkt pracy",
            )
        if isinstance(wybor, NiejednoznacznyWybor):
            return BrakModelu(
                sekcja=ocena.sekcja,
                powod_pl=wybor.powod_pl,
                czego_brakuje_pl=f"jednoznaczny model sekcji {ocena.sekcja}",
            )
        return BrakModelu(
            sekcja=ocena.sekcja,
            powod_pl=(
                "status pomiarowy obowiązuje wyłącznie w domenie punktu pomiaru — brak "
                "zapytania o model (częstotliwość, punkt pracy)"
            ),
            czego_brakuje_pl=f"zapytanie o model sekcji {ocena.sekcja} w punkcie pracy",
        )
    return BrakModelu(
        sekcja=ocena.sekcja,
        powod_pl=ocena.powod_pl,
        czego_brakuje_pl=f"model sekcji {ocena.sekcja}",
    )


__all__ = [
    "DOWODY_CERTYFIKACJI",
    "DOWODY_POMIAROWE",
    "DZIEDZINY_SEKCJI",
    "PORZADEK_SILY",
    "POWOD_BRAKU_WALIDACJI",
    "SEKCJE",
    "SEKCJE_DOWODOWE",
    "SEKCJE_FIZYCZNE",
    "STATUS_REKORDU_PRZENOSZACY",
    "BrakModelu",
    "DowodModelu",
    "OcenaSekcji",
    "OcenaSkladnika",
    "PoleSekcji",
    "RodzajDanychSkladnika",
    "RodzajDowodu",
    "RodzajSekcjiModelu",
    "SkladnikSekcji",
    "StatusSekcji",
    "StatusWeryfikacjiRekordu",
    "WejscieStatusuSekcji",
    "dowod_uznany",
    "slabszy",
    "status_modelu_z_sekcji",
    "status_sekcji",
]
