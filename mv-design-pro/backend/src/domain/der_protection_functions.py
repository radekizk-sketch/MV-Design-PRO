"""Dobor funkcji zabezpieczeniowych pola wytworcy i walidacja przeznaczenia urzadzenia.

KARTA E21-3 (audyt E-21, pkt P7 i P8). Do tej pory ekran wytworcy pokazywal STALA liste
kodow ANSI, sklejona z katalogu funkcji po fladze `required_for_der` — TE SAME 13 kodow
dla kazdej instalacji PV w kraju, niezaleznie od sposobu uziemienia punktu neutralnego,
dostepnego toru pomiarowego i mozliwosci wybranego urzadzenia. To nie byl projekt
zabezpieczen, tylko ozdoba. Rownolegle walidacja wiazan sprawdzala WYLACZNIE, czy
referencja urzadzenia istnieje w katalogu — wiec zabezpieczenie roznicowe SZYN (87BB)
przechodzilo jako „zabezpieczenie wytworcy" bez slowa sprzeciwu.

CO ROZSTRZYGA DOBOR (dane, nie preferencje):

  * `neutral_grounding_mode` — sposob uziemienia punktu neutralnego sieci SN,
  * `zero_sequence_current_source` — SKAD bierze sie prad zerowy: suma pradow fazowych
    (polaczenie Holmgreena) czy przekladnik ziemnozwarciowy obejmujacy wszystkie zyly,
  * `zero_sequence_voltage_source` — czy istnieje tor napiecia zerowego (otwarty trojkat
    VT / uzwojenie resztkowe), bez ktorego funkcja KIERUNKOWA ziemnozwarciowa jest
    niewykonalna.

Te trzy dane niesie model (`BayEarthFaultPath`), wiec dobor jest WYPROWADZENIEM z faktow,
nie zgadywaniem. Tam, gdzie danej brak (`nieznany`, `brak`), zestaw funkcji zostaje
NIEROZSTRZYGNIETY z nazwanym powodem — cisza albo domyslny zestaw bylyby fabrykacja.

CZEGO TU NIE MA I DLACZEGO. Profile NC RfG operatorow (`catalog/profiles/nc_rfg/*.yaml`)
NIE zawieraja wymagan funkcji zabezpieczeniowych (POMIAR: klucze profilu to
`reactive_power`, `frequency_response`, `voltage_levels`, `compliance_tests`,
`module_types`, `p_recovery_after_fault` — zadnych kodow ANSI). Dlatego funkcje wymagane
WYLACZNIE decyzja OSD — w szczegolnosci 78 (kryterium skokowej zmiany wektora) — NIE sa
tu wymagane; ich zrodlem sa warunki przylaczenia, ktorych model nie niesie. Brak jest
nazwany, zeby nikt nie wzial ciszy za „niewymagane".

ZERO FIZYKI: modul nie liczy zadnej nastawy ani pradu. Odpowiada wylacznie na pytanie
„jakie funkcje sa wymagane, czym je zmierzyc i czy wybrane urzadzenie je realizuje".
Nastawy licza solwery i moduly koordynacji.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

TrybUziemienia = Literal[
    "izolowany", "cewka_petersena", "rezystor", "bezposrednio_uziemiony", "nieznany"
]
ZrodloPraduZerowego = Literal["suma_ct", "przekladnik_ferrantiego", "zewnetrzne", "brak"]
ZrodloNapieciaZerowego = Literal[
    "otwarty_trojkat_vt", "uzwojenie_resztkowe_vt", "obliczone", "brak"
]
RodzajDer = Literal["PV", "BESS", "FW"]

#: Prog mocy transformatora dedykowanego dla zabezpieczenia roznicowego (IEC 60255-13).
PROG_87T_KW = 1600.0

#: Sieci o MALYM pradzie doziemnym — kryterium nadpradowe bez kierunkowosci bywa w nich
#: nieskuteczne, bo prad zwarcia doziemnego jest pojemnosciowy i porownywalny z pradami
#: zdrowych odplywow.
UZIEMIENIA_MALOPRADOWE: frozenset[str] = frozenset({"izolowany", "cewka_petersena"})

#: Strony przylaczenia, przy ktorych wymagane sa funkcje anty-wyspowe
#: (IEEE 1547 / NC RfG Art. 14) — ta sama granica, ktora stosuje regula gotowosci.
STRONY_ANTI_ISLANDING: frozenset[str] = frozenset(
    {"nN", "at_zksn", "at_branch_pole", "at_cable_joint"}
)


@dataclass(frozen=True)
class FaktyPolaWytworcy:
    """Fakty o chronionym obiekcie — wejscie doboru."""

    der_id: str
    der_kind: RodzajDer
    connection_side: str
    nominal_power_kw: float | None = None
    block_transformer_catalog_ref: str | None = None
    neutral_grounding_mode: TrybUziemienia = "nieznany"
    zero_sequence_current_source: ZrodloPraduZerowego = "brak"
    zero_sequence_voltage_source: ZrodloNapieciaZerowego = "brak"


@dataclass(frozen=True)
class FunkcjaWymagana:
    """Funkcja wraz z UZASADNIENIEM — sam kod ANSI nie jest projektem zabezpieczen."""

    kod: str
    nazwa_pl: str
    podstawa_pl: str
    chroniony_obiekt_pl: str
    zrodlo_pomiaru_pl: str

    def to_dict(self) -> dict[str, str]:
        return {
            "kod": self.kod,
            "nazwa_pl": self.nazwa_pl,
            "podstawa_pl": self.podstawa_pl,
            "chroniony_obiekt_pl": self.chroniony_obiekt_pl,
            "zrodlo_pomiaru_pl": self.zrodlo_pomiaru_pl,
        }


@dataclass(frozen=True)
class KwestiaOtwarta:
    """Czego NIE DA SIE rozstrzygnac i dlaczego — brak nazwany, nie przemilczany."""

    kod: str
    opis_pl: str
    skutek_pl: str

    def to_dict(self) -> dict[str, str]:
        return {"kod": self.kod, "opis_pl": self.opis_pl, "skutek_pl": self.skutek_pl}


@dataclass(frozen=True)
class WynikDoboru:
    wymagane: list[FunkcjaWymagana] = field(default_factory=list)
    kwestie_otwarte: list[KwestiaOtwarta] = field(default_factory=list)

    def kody(self) -> list[str]:
        return [f.kod for f in self.wymagane]

    def to_dict(self) -> dict[str, Any]:
        return {
            "wymagane": [f.to_dict() for f in self.wymagane],
            "kwestie_otwarte": [k.to_dict() for k in self.kwestie_otwarte],
        }


def dobierz_funkcje(fakty: FaktyPolaWytworcy) -> WynikDoboru:
    """Zestaw funkcji wymaganych dla pola wytworcy — wyprowadzony z faktow o obiekcie."""

    wymagane: list[FunkcjaWymagana] = []
    otwarte: list[KwestiaOtwarta] = []
    obiekt = f"pole wytwórcy {fakty.der_id}"

    # --- Zwarcia miedzyfazowe: podstawa kazdego pola, niezalezna od uziemienia --------
    wymagane.append(
        FunkcjaWymagana(
            kod="50",
            nazwa_pl="Nadprądowe zwłoczne bezzwłoczne (I>>)",
            podstawa_pl=(
                "Szybkie wyłączenie zwarć międzyfazowych w polu wytwórcy " "(IEC 60255-151)."
            ),
            chroniony_obiekt_pl=obiekt,
            zrodlo_pomiaru_pl="przekładniki prądowe fazowe pola",
        )
    )
    wymagane.append(
        FunkcjaWymagana(
            kod="51",
            nazwa_pl="Nadprądowe zależnoczasowe (IDMT)",
            podstawa_pl=(
                "Selektywność czasowo-prądowa wobec zabezpieczeń nadrzędnych "
                "i odpływowych (IEC 60255-151)."
            ),
            chroniony_obiekt_pl=obiekt,
            zrodlo_pomiaru_pl="przekładniki prądowe fazowe pola",
        )
    )

    # --- Zwarcia doziemne: RODZINA FUNKCJI WYNIKA Z TORU POMIAROWEGO -----------------
    #
    # 50N/51N i 50G/51G to nie dwa style zapisu tej samej funkcji, tylko DWA ROZNE
    # tory pomiaru pradu zerowego. Wymaganie obu naraz oznaczaloby, ze pole ma
    # jednoczesnie sume pradow fazowych i przekladnik ziemnozwarciowy — a to jest
    # rozstrzygalne DANA, nie domyslem.
    zrodlo_pradu = fakty.zero_sequence_current_source
    if zrodlo_pradu == "suma_ct":
        wymagane.extend(
            [
                FunkcjaWymagana(
                    kod="50N",
                    nazwa_pl="Ziemnozwarciowe bezzwłoczne (I0>>)",
                    podstawa_pl=(
                        "Prąd zerowy mierzony jako suma prądów fazowych "
                        "(połączenie Holmgreena) — rodzina N."
                    ),
                    chroniony_obiekt_pl=obiekt,
                    zrodlo_pomiaru_pl="suma prądów przekładników fazowych",
                ),
                FunkcjaWymagana(
                    kod="51N",
                    nazwa_pl="Ziemnozwarciowe zależnoczasowe (I0>)",
                    podstawa_pl=(
                        "Selektywność zwarć doziemnych przy pomiarze sumy prądów "
                        "fazowych (IEC 60255-151)."
                    ),
                    chroniony_obiekt_pl=obiekt,
                    zrodlo_pomiaru_pl="suma prądów przekładników fazowych",
                ),
            ]
        )
    elif zrodlo_pradu == "przekladnik_ferrantiego":
        wymagane.extend(
            [
                FunkcjaWymagana(
                    kod="50G",
                    nazwa_pl="Ziemnozwarciowe bezzwłoczne z przekładnika ziemnozwarciowego",
                    podstawa_pl=(
                        "Prąd zerowy mierzony bezpośrednio przekładnikiem obejmującym "
                        "wszystkie żyły — rodzina G (czulsza od sumy prądów fazowych)."
                    ),
                    chroniony_obiekt_pl=obiekt,
                    zrodlo_pomiaru_pl="przekładnik ziemnozwarciowy (Ferrantiego)",
                ),
                FunkcjaWymagana(
                    kod="51G",
                    nazwa_pl="Ziemnozwarciowe zależnoczasowe z przekładnika ziemnozwarciowego",
                    podstawa_pl=(
                        "Selektywność zwarć doziemnych przy pomiarze przekładnikiem "
                        "obejmującym wszystkie żyły (IEC 60255-151)."
                    ),
                    chroniony_obiekt_pl=obiekt,
                    zrodlo_pomiaru_pl="przekładnik ziemnozwarciowy (Ferrantiego)",
                ),
            ]
        )
    elif zrodlo_pradu == "zewnetrzne":
        otwarte.append(
            KwestiaOtwarta(
                kod="protection.earth_current_source_external",
                opis_pl=(
                    "Prąd zerowy pochodzi ze źródła zewnętrznego wobec pola — rodziny "
                    "funkcji ziemnozwarciowej (N czy G) nie da się z tego wyprowadzić."
                ),
                skutek_pl=(
                    "Uzupełnij opis toru pomiarowego pola, żeby dobór rozstrzygnął "
                    "między 50N/51N a 50G/51G."
                ),
            )
        )
    else:
        otwarte.append(
            KwestiaOtwarta(
                kod="protection.earth_current_source_missing",
                opis_pl=(
                    "Pole nie ma opisanego toru pomiaru prądu zerowego, więc żadnej "
                    "funkcji ziemnozwarciowej nie da się wymagać ani nastawić."
                ),
                skutek_pl=(
                    "Wskaż sumę prądów fazowych albo przekładnik ziemnozwarciowy — "
                    "bez tego zwarcie doziemne pozostaje niewykrywane."
                ),
            )
        )

    # --- Kierunkowosc ziemnozwarciowa w sieciach maloparadowych ----------------------
    #
    # W sieci izolowanej i kompensowanej prad zwarcia doziemnego jest pojemnosciowy
    # i porownywalny z pradami zdrowych odplywow, wiec samo kryterium nadpradowe nie
    # rozroznia odplywu uszkodzonego. Kierunkowosc wymaga jednak TORU NAPIECIA
    # ZEROWEGO — bez niego funkcji nie „wymagamy na papierze", tylko nazywamy brak.
    if fakty.neutral_grounding_mode in UZIEMIENIA_MALOPRADOWE:
        if fakty.zero_sequence_voltage_source == "brak":
            otwarte.append(
                KwestiaOtwarta(
                    kod="protection.zero_sequence_voltage_missing",
                    opis_pl=(
                        f"Sieć {_uziemienie_pl(fakty.neutral_grounding_mode)} wymaga "
                        "kierunkowego kryterium ziemnozwarciowego (67N), ale pole nie ma "
                        "toru napięcia zerowego (otwarty trójkąt VT albo uzwojenie "
                        "resztkowe)."
                    ),
                    skutek_pl=(
                        "Bez napięcia polaryzującego funkcja 67N jest niewykonalna — "
                        "uzupełnij tor napięciowy albo udokumentuj inne kryterium."
                    ),
                )
            )
        else:
            wymagane.append(
                FunkcjaWymagana(
                    kod="67N",
                    nazwa_pl="Kierunkowe ziemnozwarciowe",
                    podstawa_pl=(
                        f"Sieć {_uziemienie_pl(fakty.neutral_grounding_mode)}: prąd "
                        "doziemny jest pojemnościowy, więc kryterium nadprądowe bez "
                        "kierunkowości nie rozróżnia odpływu uszkodzonego."
                    ),
                    chroniony_obiekt_pl=obiekt,
                    zrodlo_pomiaru_pl=(
                        f"prąd zerowy + {_zrodlo_napiecia_pl(fakty.zero_sequence_voltage_source)}"
                    ),
                )
            )
    elif fakty.neutral_grounding_mode == "nieznany":
        otwarte.append(
            KwestiaOtwarta(
                kod="protection.neutral_grounding_unknown",
                opis_pl=(
                    "Sposób uziemienia punktu neutralnego sieci nie jest w modelu "
                    "określony, więc potrzeby kryterium kierunkowego nie da się "
                    "rozstrzygnąć."
                ),
                skutek_pl=(
                    "Uzupełnij tryb uziemienia (izolowana / kompensowana / rezystor / "
                    "bezpośrednio uziemiona) w danych pola."
                ),
            )
        )

    # --- Anti-islanding (praca wyspowa) ---------------------------------------------
    if fakty.connection_side in STRONY_ANTI_ISLANDING and fakty.der_kind in ("PV", "FW"):
        for kod, nazwa, opis in (
            ("27", "Podnapięciowe", "zanik napięcia sieci"),
            ("59", "Nadnapięciowe", "wzrost napięcia przy pracy wyspowej"),
            ("81U", "Podczęstotliwościowe", "spadek częstotliwości wyspy"),
            ("81O", "Nadczęstotliwościowe", "wzrost częstotliwości wyspy"),
        ):
            wymagane.append(
                FunkcjaWymagana(
                    kod=kod,
                    nazwa_pl=nazwa,
                    podstawa_pl=(
                        f"Ochrona przed pracą wyspową — {opis} " "(IEEE 1547 / NC RfG Art. 14)."
                    ),
                    chroniony_obiekt_pl=obiekt,
                    zrodlo_pomiaru_pl="przekładnik napięciowy pola",
                )
            )

    # --- Zabezpieczenie roznicowe transformatora blokowego --------------------------
    if (
        fakty.connection_side == "dedicated_transformer"
        and (fakty.nominal_power_kw or 0.0) >= PROG_87T_KW
    ):
        wymagane.append(
            FunkcjaWymagana(
                kod="87T",
                nazwa_pl="Różnicowe transformatora",
                podstawa_pl=(
                    "Transformator dedykowany ≥ 1,6 MVA — zabezpieczenie różnicowe "
                    "strefowe (IEC 60255-13)."
                ),
                chroniony_obiekt_pl="transformator blokowy wytwórcy",
                zrodlo_pomiaru_pl="przekładniki po obu stronach transformatora (dwurdzeniowe)",
            )
        )

    # --- Granica wiedzy: wymagania OSD ----------------------------------------------
    #
    # Profile NC RfG w katalogu nie niosa wymagan funkcji zabezpieczeniowych (POMIAR:
    # brak kodow ANSI w `catalog/profiles/nc_rfg/*.yaml`), wiec funkcje wymagane
    # DECYZJA OPERATORA — w tym 78 — nie moga byc stad wyprowadzone. Cisza wygladalaby
    # jak „niewymagane", dlatego granica jest nazwana.
    otwarte.append(
        KwestiaOtwarta(
            kod="protection.osd_requirements_not_modelled",
            opis_pl=(
                "Model nie niesie wymagań zabezpieczeniowych operatora sieci "
                "(warunki przyłączenia). Funkcje wymagane wyłącznie decyzją OSD — "
                "w szczególności 78 (kryterium skokowej zmiany wektora) — nie są tu "
                "wyprowadzane."
            ),
            skutek_pl=(
                "Zweryfikuj listę z warunkami przyłączenia; jeśli OSD wymaga funkcji "
                "spoza tego zestawu, dopisz ją w projekcie zabezpieczeń."
            ),
        )
    )

    return WynikDoboru(wymagane=wymagane, kwestie_otwarte=otwarte)


# ---------------------------------------------------------------------------
# Walidacja urzadzenia
# ---------------------------------------------------------------------------

#: Funkcje jednoznacznie wskazujace INNA strefe niz pole wytworcy. Ich obecnosc nie
#: dyskwalifikuje urzadzenia sama w sobie (bywaja aparaty wielofunkcyjne), ale wymaga
#: potwierdzenia przeznaczenia — dokladnie tego, czego zabraklo przy REB670.
FUNKCJE_INNEJ_STREFY: dict[str, str] = {
    "87BB": "różnicowe szyn zbiorczych",
    "87B": "różnicowe szyn zbiorczych",
    "87L": "różnicowe odcinkowe linii",
    "87M": "różnicowe silnika",
}


@dataclass(frozen=True)
class OcenaUrzadzenia:
    """Werdykt o wybranym urzadzeniu — DWA rozne pytania, dwa rozne kody."""

    brakujace_funkcje: list[str] = field(default_factory=list)
    ostrzezenia_przeznaczenia: list[str] = field(default_factory=list)
    #: `True` tylko wtedy, gdy urzadzenie realizuje KOMPLET wymaganych funkcji.
    pokrywa_wymagania: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "brakujace_funkcje": list(self.brakujace_funkcje),
            "ostrzezenia_przeznaczenia": list(self.ostrzezenia_przeznaczenia),
            "pokrywa_wymagania": self.pokrywa_wymagania,
        }


def ocen_urzadzenie(
    wymagane_kody: list[str],
    funkcje_urzadzenia: tuple[str, ...] | list[str] | None,
    *,
    nazwa_urzadzenia: str = "wybrane urządzenie",
) -> OcenaUrzadzenia:
    """Czy urzadzenie realizuje wymagane funkcje ORAZ czy jest do tego przeznaczone.

    Rozdzielenie tych dwoch pytan jest sednem naprawy P8: urzadzenie moze miec komplet
    kodow z listy i mimo to byc aparatem innej strefy. Sam zestaw numerow ANSI nie
    dowodzi przeznaczenia aplikacyjnego.
    """

    if funkcje_urzadzenia is None:
        return OcenaUrzadzenia(brakujace_funkcje=list(wymagane_kody), pokrywa_wymagania=False)

    dostepne = set(funkcje_urzadzenia)
    brakujace = [kod for kod in wymagane_kody if kod not in dostepne]

    ostrzezenia: list[str] = []
    for kod, opis in FUNKCJE_INNEJ_STREFY.items():
        if kod in dostepne:
            ostrzezenia.append(
                f"{nazwa_urzadzenia} deklaruje funkcję {kod} ({opis}), która należy do "
                "innej strefy zabezpieczeniowej niż pole wytwórcy. Potwierdź przeznaczenie "
                "aplikacyjne urządzenia i wskaż chronioną strefę."
            )

    return OcenaUrzadzenia(
        brakujace_funkcje=brakujace,
        ostrzezenia_przeznaczenia=ostrzezenia,
        pokrywa_wymagania=not brakujace,
    )


def _uziemienie_pl(tryb: str) -> str:
    return {
        "izolowany": "izolowana",
        "cewka_petersena": "kompensowana (cewka Petersena)",
        "rezystor": "uziemiona przez rezystor",
        "bezposrednio_uziemiony": "bezpośrednio uziemiona",
        "nieznany": "o nieokreślonym punkcie neutralnym",
    }.get(tryb, tryb)


def _zrodlo_napiecia_pl(zrodlo: str) -> str:
    return {
        "otwarty_trojkat_vt": "napięcie zerowe z otwartego trójkąta przekładnika napięciowego",
        "uzwojenie_resztkowe_vt": "napięcie zerowe z uzwojenia resztkowego przekładnika",
        "obliczone": "napięcie zerowe wyznaczone obliczeniowo",
        "brak": "brak toru napięcia zerowego",
    }.get(zrodlo, zrodlo)
