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
from typing import Any, Literal, TypeAlias

from network_model.core.uziemienie import (
    UZIEMIENIA_MALOPRADOWE,
    TypPunktuNeutralnego,
    etykieta_punktu_neutralnego_pl,
)
from werdykt.kontrakt import (
    LimitKryterium,
    StatusWerdyktu,
    Wielkosc,
    WyjasnienieWerdyktu,
)

#: Sposob uziemienia punktu neutralnego — TEN SAM slownik co `GroundingConfig.type`
#: (W5-A: koniec polskich literalow w kontrakcie); `None` = nieznany w modelu.
TrybUziemienia: TypeAlias = TypPunktuNeutralnego | None
ZrodloPraduZerowego = Literal[
    "suma_ct", "przekladnik_ferrantiego", "zewnetrzne", "brak"
]
ZrodloNapieciaZerowego = Literal[
    "otwarty_trojkat_vt", "uzwojenie_resztkowe_vt", "obliczone", "brak"
]
RodzajDer = Literal["PV", "BESS", "FW"]

#: Próg mocy znamionowej transformatora dedykowanego, od którego wymagane jest zabezpieczenie
#: różnicowe 87T, ma JEDNEGO dostawcę: profil NC RfG operatora wskazany przez wytwórcę
#: (`NcRfgProfile.prog_87t_sn_transformatora` — rekord limitu z podstawą albo ``None``).
#: Moduł nie niesie własnej stałej: wołający podaje próg z profilu, a brak profilu albo progu
#: daje BRAK_PODSTAWY z wyjaśnieniem.
#:
#: POMIAR (karta JEDNA-SCIEZKA-EDYCJI cz. 4). Dawna stała 1600 kW porównywała z progiem MOC
#: ŹRÓDŁA (błąd podmiotu — kryterium dotyczy transformatora, którego zabezpieczenie oceniamy)
#: i powoływała IEC 60255-13, która jest normą wyrobu dla przekaźników różnicowych
#: z charakterystyką stabilizowaną i NIE określa mocy transformatora, od której 87T jest
#: wymagane. Przeszukane źródła progu: profile operatorów NC RfG
#: (`catalog/profiles/nc_rfg/operatorzy/{enea,energa,pge,pse,tauron}.yaml` i warstwy) — brak
#: wymagań funkcji zabezpieczeniowych i progu mocy transformatora (każdy profil ma jawne
#: `prog_87t_sn_transformatora: null`); `docs/**` — wartość 1,6 MVA występowała wyłącznie
#: jako opis tej stałej (rejestr konfliktów V12K-246, skorygowany), bez dokumentu operatora
#: ani normy; katalog urządzeń zabezpieczeniowych (`application/analyses/protection/catalog`)
#: — kod 87T tylko jako funkcja urządzenia.

#: Wyjaśnienie braku podstawy progu 87T (jedno źródło tekstu dla doboru i gotowości).
BRAK_PODSTAWY_PROGU_87T_PL = (
    "próg wymagania 87T nie ma potwierdzonej podstawy w profilu operatora"
)

#: Przyczyna braku podstawy, gdy wytwórca nie wskazuje profilu operatora NC RfG.
BRAK_PROFILU_OPERATORA_87T_PL = "wytwórca nie wskazuje profilu NC RfG operatora"

#: Sieci o MALYM pradzie doziemnym (`UZIEMIENIA_MALOPRADOWE` z rdzenia uziemienia):
#: kryterium nadpradowe bez kierunkowosci bywa w nich nieskuteczne, bo prad zwarcia
#: doziemnego jest pojemnosciowy i porownywalny z pradami zdrowych odplywow.
__all_uziemienia_maloparadowe__ = UZIEMIENIA_MALOPRADOWE

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
    #: NAZWA wytwórcy z modelu — etykieta chronionego obiektu pokazywana
    #: inżynierowi. Bez niej opis funkcji sklejał się z REFERENCJĄ modelu
    #: („pole wytwórcy pv/cf52e8ef.../converter"), czyli identyfikator maszynowy
    #: wychodził na pierwszy plan ekranu doboru zabezpieczeń (zmierzone na
    #: modelu zbudowanym operacjami domenowymi). Pole WYMAGANE (karta #144):
    #: wytwórca bez nazwy w modelu dostaje od wołającego polski opis rodzaju
    #: (`enm.nazwy_elementow.nazwa_elementu` — „Generator bez nazwy"), nigdy
    #: identyfikator — `der_id` zostaje wyłącznie tożsamością rekordu.
    der_nazwa: str
    nominal_power_kw: float | None = None
    #: Moc znamionowa transformatora dedykowanego (element modelu wskazany przez
    #: `blocking_transformer_ref`) — PODMIOT kryterium 87T; `None` = brak w modelu.
    sn_transformatora_dedykowanego_kva: float | None = None
    neutral_grounding_mode: TrybUziemienia = None
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
    #: Oceny progów wymagań funkcji (87T) — status maszynowy ZAWSZE z wyjaśnieniem.
    oceny_progow: list[OcenaProguWymagania] = field(default_factory=list)

    def kody(self) -> list[str]:
        return [f.kod for f in self.wymagane]

    def to_dict(self) -> dict[str, Any]:
        return {
            "wymagane": [f.to_dict() for f in self.wymagane],
            "kwestie_otwarte": [k.to_dict() for k in self.kwestie_otwarte],
            "oceny_progow": [o.to_dict() for o in self.oceny_progow],
        }


@dataclass(frozen=True)
class OcenaProguWymagania:
    """Czy wymaganie funkcji progowej (87T) DOTYCZY ocenianego obiektu — z wyjaśnieniem.

    Status maszynowy (kontrakt werdyktu wyjaśnialnego) odpowiada na pytanie „czy warunek
    stosowalności wymagania jest spełniony" i nigdy nie stoi sam:

      * ``SPELNIA`` — S_n transformatora ≥ próg z podstawą: funkcja jest WYMAGANA,
      * ``NIE_DOTYCZY`` — S_n poniżej progu z podstawą: wymaganie nie dotyczy obiektu,
      * ``BRAK_PODSTAWY`` — próg nie ma potwierdzonej podstawy: wymagania nie da się ani
        nałożyć, ani wykluczyć (brak podstawy ≠ „niewymagane"),
      * ``NIE_OCENIONO`` — próg ma podstawę, ale model nie niesie mocy znamionowej
        transformatora dedykowanego (brak elementu albo wskazania).
    """

    kod_funkcji: str
    status_maszynowy: StatusWerdyktu
    przedmiot_pl: str
    wartosc: Wielkosc | None
    limit: LimitKryterium | None
    wyjasnienie: WyjasnienieWerdyktu

    @property
    def wyjasnienie_pl(self) -> str:
        return self.wyjasnienie.zdanie_pl

    def to_dict(self) -> dict[str, Any]:
        return {
            "kod_funkcji": self.kod_funkcji,
            "status_maszynowy": self.status_maszynowy,
            "przedmiot_pl": self.przedmiot_pl,
            "wartosc": self.wartosc.model_dump(mode="json") if self.wartosc else None,
            "limit": self.limit.model_dump(mode="json") if self.limit else None,
            "wyjasnienie": self.wyjasnienie.model_dump(mode="json"),
            "wyjasnienie_pl": self.wyjasnienie_pl,
        }


def _kva(wartosc: float) -> str:
    return f"{wartosc:g}".replace(".", ",") + " kVA"


def ocen_prog_87t(
    sn_transformatora_kva: float | None,
    prog: LimitKryterium | None,
    *,
    profil_operatora_pl: str | None,
) -> OcenaProguWymagania:
    """Wymaganie 87T wobec transformatora dedykowanego — JEDEN predykat doboru i gotowości.

    Podmiotem kryterium jest MOC ZNAMIONOWA TRANSFORMATORA (S_n elementu modelu
    wskazanego przez `blocking_transformer_ref`), nie moc źródła: zabezpieczenie różnicowe
    chroni transformator. Próg przychodzi z profilu operatora (`profil_operatora_pl` —
    nazwa operatora profilu wskazanego przez wytwórcę, ``None`` = profilu nie wskazano) jako
    rekord limitu z podstawą; bez profilu albo bez progu w profilu wynik to BRAK_PODSTAWY
    niezależnie od S_n.
    """

    przedmiot = "transformator dedykowany wytwórcy"
    wartosc = (
        Wielkosc(wartosc=sn_transformatora_kva, jednostka="kVA")
        if sn_transformatora_kva is not None
        else None
    )
    opis_sn = (
        f"S_n transformatora = {_kva(sn_transformatora_kva)}"
        if sn_transformatora_kva is not None
        else "moc znamionowa transformatora nieznana"
    )
    if prog is None or prog.wartosc is None:
        if profil_operatora_pl is None:
            przyczyna = BRAK_PROFILU_OPERATORA_87T_PL
            zdanie = (
                f"{BRAK_PODSTAWY_PROGU_87T_PL[0].upper()}{BRAK_PODSTAWY_PROGU_87T_PL[1:]}: "
                f"{przyczyna} ({opis_sn})."
            )
        else:
            przyczyna = BRAK_PODSTAWY_PROGU_87T_PL
            zdanie = (
                f"{BRAK_PODSTAWY_PROGU_87T_PL[0].upper()}{BRAK_PODSTAWY_PROGU_87T_PL[1:]} "
                f"{profil_operatora_pl} ({opis_sn})."
            )
        return OcenaProguWymagania(
            kod_funkcji="87T",
            status_maszynowy="BRAK_PODSTAWY",
            przedmiot_pl=przedmiot,
            wartosc=wartosc,
            limit=None,
            wyjasnienie=WyjasnienieWerdyktu(
                zdanie_pl=(
                    f"{zdanie} Wymagania zabezpieczenia różnicowego 87T nie da się ani "
                    "nałożyć, ani wykluczyć — rozstrzygają warunki przyłączenia operatora."
                ),
                przyczyna_pl=przyczyna,
                czego_brakuje=(
                    "próg mocy znamionowej transformatora dla 87T z dokumentem operatora "
                    "i jednostką redakcyjną",
                ),
            ),
        )
    if prog.wartosc.jednostka != "kVA":
        raise ValueError(
            f"Próg 87T w jednostce {prog.wartosc.jednostka!r} — rekord limitu musi być w kVA."
        )
    zrodlo = prog.podstawa.dokument + (
        f", {prog.podstawa.jednostka_redakcyjna}"
        if prog.podstawa.jednostka_redakcyjna
        else ""
    )
    opis_progu = f"próg {_kva(prog.wartosc.wartosc)} ({zrodlo})"
    if sn_transformatora_kva is None:
        return OcenaProguWymagania(
            kod_funkcji="87T",
            status_maszynowy="NIE_OCENIONO",
            przedmiot_pl=przedmiot,
            wartosc=None,
            limit=prog,
            wyjasnienie=WyjasnienieWerdyktu(
                zdanie_pl=(
                    f"Model nie niesie mocy znamionowej transformatora dedykowanego, więc "
                    f"warunku S_n ≥ {opis_progu} nie oceniono — wskaż transformator w modelu."
                ),
                przyczyna_pl="brak transformatora dedykowanego wytwórcy w modelu",
                czego_brakuje=("moc znamionowa transformatora dedykowanego w modelu",),
            ),
        )
    if sn_transformatora_kva >= prog.wartosc.wartosc:
        return OcenaProguWymagania(
            kod_funkcji="87T",
            status_maszynowy="SPELNIA",
            przedmiot_pl=przedmiot,
            wartosc=wartosc,
            limit=prog,
            wyjasnienie=WyjasnienieWerdyktu(
                zdanie_pl=(
                    f"{opis_sn} ≥ {opis_progu} — zabezpieczenie różnicowe 87T jest wymagane."
                ),
            ),
        )
    return OcenaProguWymagania(
        kod_funkcji="87T",
        status_maszynowy="NIE_DOTYCZY",
        przedmiot_pl=przedmiot,
        wartosc=wartosc,
        limit=prog,
        wyjasnienie=WyjasnienieWerdyktu(
            zdanie_pl=f"{opis_sn} < {opis_progu} — wymaganie 87T nie dotyczy transformatora.",
        ),
    )


def dobierz_funkcje(
    fakty: FaktyPolaWytworcy,
    *,
    prog_87t: LimitKryterium | None,
    profil_operatora_pl: str | None,
) -> WynikDoboru:
    """Zestaw funkcji wymaganych dla pola wytworcy — wyprowadzony z faktow o obiekcie."""

    wymagane: list[FunkcjaWymagana] = []
    otwarte: list[KwestiaOtwarta] = []
    oceny_progow: list[OcenaProguWymagania] = []
    obiekt = f"pole wytwórcy {fakty.der_nazwa}"

    # --- Zwarcia miedzyfazowe: podstawa kazdego pola, niezalezna od uziemienia --------
    wymagane.append(
        FunkcjaWymagana(
            kod="50",
            nazwa_pl="Nadprądowe zwłoczne bezzwłoczne (I>>)",
            podstawa_pl=(
                "Szybkie wyłączenie zwarć międzyfazowych w polu wytwórcy "
                "(IEC 60255-151)."
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
    elif fakty.neutral_grounding_mode is None:
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
    if fakty.connection_side in STRONY_ANTI_ISLANDING and fakty.der_kind in (
        "PV",
        "FW",
    ):
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
                        f"Ochrona przed pracą wyspową — {opis} "
                        "(IEEE 1547 / NC RfG Art. 14)."
                    ),
                    chroniony_obiekt_pl=obiekt,
                    zrodlo_pomiaru_pl="przekładnik napięciowy pola",
                )
            )

    # --- Zabezpieczenie roznicowe transformatora blokowego --------------------------
    #
    # Podmiot kryterium: MOC ZNAMIONOWA TRANSFORMATORA dedykowanego (nie moc zrodla).
    # Prog jest rekordem limitu z podstawa; bez podstawy wymaganie zostaje nazwanym
    # brakiem (BRAK_PODSTAWY), a nie cichym „niewymagane" (`ocen_prog_87t`).
    if fakty.connection_side == "dedicated_transformer":
        ocena_87t = ocen_prog_87t(
            fakty.sn_transformatora_dedykowanego_kva,
            prog_87t,
            profil_operatora_pl=profil_operatora_pl,
        )
        oceny_progow.append(ocena_87t)
        if ocena_87t.status_maszynowy == "SPELNIA" and ocena_87t.limit is not None:
            wymagane.append(
                FunkcjaWymagana(
                    kod="87T",
                    nazwa_pl="Różnicowe transformatora",
                    podstawa_pl=ocena_87t.wyjasnienie_pl,
                    chroniony_obiekt_pl="transformator blokowy wytwórcy",
                    zrodlo_pomiaru_pl=(
                        "przekładniki po obu stronach transformatora (dwurdzeniowe)"
                    ),
                )
            )
        elif ocena_87t.status_maszynowy == "BRAK_PODSTAWY":
            otwarte.append(
                KwestiaOtwarta(
                    kod="protection.87t_threshold_no_basis",
                    opis_pl=ocena_87t.wyjasnienie_pl,
                    skutek_pl=(
                        "Rozstrzygnij potrzebę zabezpieczenia różnicowego 87T według "
                        "warunków przyłączenia operatora i dopisz ją w projekcie "
                        "zabezpieczeń."
                    ),
                )
            )
        elif ocena_87t.status_maszynowy == "NIE_OCENIONO":
            otwarte.append(
                KwestiaOtwarta(
                    kod="protection.87t_transformer_rating_missing",
                    opis_pl=ocena_87t.wyjasnienie_pl,
                    skutek_pl="Wskaż transformator dedykowany wytwórcy w modelu sieci.",
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

    return WynikDoboru(
        wymagane=wymagane, kwestie_otwarte=otwarte, oceny_progow=oceny_progow
    )


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
        return OcenaUrzadzenia(
            brakujace_funkcje=list(wymagane_kody), pokrywa_wymagania=False
        )

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


def _uziemienie_pl(tryb: str | None) -> str:
    """Przymiotnik sieci („sieć izolowana"); `None` = punkt neutralny nieokreślony."""
    if tryb is None:
        return "o nieokreślonym punkcie neutralnym"
    return {
        "isolated": "izolowana",
        "petersen_coil": "kompensowana (cewka Petersena)",
        "resistor_grounded": "uziemiona przez rezystor",
        "directly_grounded": "bezpośrednio uziemiona",
    }.get(tryb, etykieta_punktu_neutralnego_pl(tryb))


def _zrodlo_napiecia_pl(zrodlo: str) -> str:
    return {
        "otwarty_trojkat_vt": "napięcie zerowe z otwartego trójkąta przekładnika napięciowego",
        "uzwojenie_resztkowe_vt": "napięcie zerowe z uzwojenia resztkowego przekładnika",
        "obliczone": "napięcie zerowe wyznaczone obliczeniowo",
        "brak": "brak toru napięcia zerowego",
    }.get(zrodlo, zrodlo)
