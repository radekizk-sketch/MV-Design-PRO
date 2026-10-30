"""Dobor przekladnikow pola wytworcy — kryteria normowe (karta E21-4).

DLACZEGO TEN MODUL ISTNIEJE. Ekran pokazywal przekladnik jako NAZWE katalogowa
(„CT 200/5 A kl. 5P10 10 VA") i nic wiecej. Wlasciciel wskazal, ze bez sprawdzenia
przekladni wobec pradu chronionego toru, obciazalnosci cieplnej i dynamicznej,
nasycenia oraz zgodnosci z wejsciem przekaznika „jego wybor nie ma wiarygodnosci
inzynierskiej". Dane do tych sprawdzen katalog niesie od V12K-254 (Ith, Idyn, Fs,
ALF, obciazalnosc), wiec kryteria daja sie policzyc — a nie tylko nazwac.

ZERO FIZYKI SIECI. Modul NIE liczy pradu zwarciowego ani pradu roboczego sieci:
prad zwarciowy poczatkowy i szczytowy przychodza Z SOLVERA, a prad znamionowy toru
z tabliczki (moc i napiecie modelu). Tutaj zestawiane sa WYMAGANIA z MOZLIWOSCIAMI
przekladnika wg wzorow normowych na podanych wartosciach — to samo, co katalog robi
z rodzajem rdzenia i Idyn (V12K-239, V12K-254).

KRYTERIA (kazde z podstawa normowa i jawnym rachunkiem):
  1. Przekladnia      — prad roboczy toru nie moze przekraczac pradu pierwotnego CT.
  2. Wykorzystanie    — bardzo niskie wykorzystanie przekladni psuje dokladnosc
                        (informacja, nie blad).
  3. Rodzaj rdzenia   — funkcje zabezpieczeniowe wymagaja rdzenia zabezpieczeniowego.
  4. Nasycenie (ALF)  — ALF·In musi pokryc prad zwarciowy odniesiony do przekladni.
  5. Wytrzymalosc cieplna — Ith >= Ik''·sqrt(tk) (rownowaznosc cieplna, IEC 61869-2).
  6. Wytrzymalosc dynamiczna — Idyn >= ip (prad szczytowy z solwera).
  7. Prad wtorny      — 1 A / 5 A musi zgadzac sie z wejsciem przekaznika.
  8. Obciazalnosc     — moc znamionowa rdzenia >= obciazenie obwodu wtornego.

WERDYKT WYJASNIALNY (karta WERDYKT-MIGRACJA-190). Kazde kryterium niesie rekord
``OcenaKryterium`` (co oceniono, kryterium, wynik z jednostka, limit z podstawa i stanem
zrodla, margines, przyczyna, dowod, zakres waznosci); slowo ``werdykt`` jest jego
projekcja (jedno zrodlo rozstrzygniecia). Pozycje „informacja" (wykorzystanie przekladni,
nadwymiarowanie VT, ALF katalogowy) NIE sa kryteriami oceny — ida do osobnej listy
``informacje`` bez statusu, zeby praktyka projektowa nie udawala werdyktu.

KRYTERIA PRZEKLADNIKA NAPIECIOWEGO (`sprawdz_dobor_vt`, dane katalogu z V12K-255):
  1. Napiecie pierwotne — przekladnia wobec napiecia sieci; rozpoznanie ukladu
                          (miedzyfazowy vs faza-ziemia U_n/√3).
  2. Rodzaj uzwojenia   — funkcje zabezpieczeniowe wymagaja klasy z litera P.
  3. Wspolczynnik F_v   — 1,9 w sieci maloprądowej, 1,5 w bezposrednio uziemionej;
                          czas (30 s / 8 h) zalezy od automatycznego wylaczania.
  4. Napiecie wtorne    — 100 V / 110 V (albo /√3) wobec wejscia przekaznika.
  5. Obciazalnosc       — moc znamionowa uzwojenia >= obciazenie obwodu.
  6. Tor napiecia zerowego — otwarty trojkat wymaga ukladu faza-ziemia, uzwojenie
                          resztkowe wymaga trzeciego uzwojenia w przekladniku.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Final, Literal

from domain.readiness_bridge import opis_kanoniczny
from network_model.core.uziemienie import UZIEMIENIA_WYMAGAJACE_FV_19
from network_model.nazwy import nazwa_nadana
from network_model.pochodne import ka_na_a, napiecie_fazowe_v
from network_model.solvers.equipment_checks.ct_burden_saturation import (
    CtBurdenInput,
    CtDeviceBurden,
    alf_z_klasy,
    check_ct_burden_saturation,
)
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    WyjasnienieWerdyktu,
    ZakresWaznosci,
    format_liczba,
)
from werdykt.porownanie import (
    Porownanie,
    ocena_porownania,
    podstawa_katalogu,
    podstawa_normy,
    podstawa_zalozenia,
)

#: Ponizej tego wykorzystania przekladni dokladnosc pomiaru pradu roboczego jest slaba
#: (blad wzgledny rosnie przy malym wykorzystaniu zakresu). Progu nie ma w normie jako
#: wymagania — to praktyka projektowa, wiec pozycja jest INFORMACJA, nie werdyktem.
PROG_WYKORZYSTANIA_PRZEKLADNI = 0.2

#: Projekcja rekordu na slowo werdyktu doboru (filtry, liczniki). ``brak_danych`` obejmuje
#: kazdy status nierozstrzygajacy (brak wyniku, brak podstawy limitu) — brak danych ≠ spelnia.
Werdykt = Literal["spelnione", "niespelnione", "brak_danych"]

#: Zdolnosc obliczeniowa doboru przekladnikow w rejestrze dowodowym (`solver_input/provenance`).
ZDOLNOSC_DOBORU: Final = "aparatura.dobor_przekladnika"

_PODSTAWA_CT: Final = podstawa_normy(
    "IEC 61869-2 (przekładniki prądowe)",
    "2012",
    "wymagania znamionowe przekładnika prądowego (prąd pierwotny, rdzeń zabezpieczeniowy, "
    "prąd cieplny i dynamiczny, moc znamionowa)",
)
_PODSTAWA_VT: Final = podstawa_normy(
    "IEC 61869-3 (przekładniki napięciowe)",
    "2011",
    "wymagania znamionowe przekładnika napięciowego (napięcie pierwotne, uzwojenie "
    "zabezpieczeniowe, współczynnik napięciowy tab. 2, moc znamionowa)",
)
_PODSTAWA_WEJSC: Final = podstawa_normy(
    "IEC 60255-1 (przekaźniki pomiarowe i urządzenia zabezpieczeniowe)",
    "2009",
    "znamionowe wartości wejść pomiarowych prądowych i napięciowych",
)
_PODSTAWA_TORU_ZEROWEGO: Final = podstawa_zalozenia(
    "Wymagania funkcji ziemnozwarciowych 67N/59N zadeklarowane w modelu pola",
    "droga pomiaru napięcia zerowego 3U0 (otwarty trójkąt, uzwojenie resztkowe, suma "
    "numeryczna napięć fazowych)",
    wydanie="bieżący stan modelu sieci",
)
_PODSTAWA_TORU: Final = podstawa_zalozenia(
    "Wymagania toru z modelu sieci i biegu zwarciowego IEC 60909",
    "prąd roboczy z tabliczki, I_k″ i i_p z solvera, obciążenie obwodu wtórnego z projektu",
    wydanie="bieżący stan modelu sieci",
)

_ZAKRES_CT: Final = ZakresWaznosci(
    rodzaj_analizy="SHORT_CIRCUIT",
    opis_pl=(
        "Dobór typu przekładnika prądowego wobec wymagań toru: prąd roboczy z tabliczki, "
        "prąd zwarciowy początkowy i udarowy z biegu IEC 60909, dane znamionowe z katalogu."
    ),
    wykluczenia=(
        "składowa nieokresowa prądu zwarciowego i remanencja rdzenia",
        "dokładność pomiaru w zakresie przeciążeniowym",
    ),
)
_ZAKRES_VT: Final = ZakresWaznosci(
    rodzaj_analizy="POWER_FLOW",
    opis_pl=(
        "Dobór typu przekładnika napięciowego wobec napięcia sieci i sposobu uziemienia "
        "punktu neutralnego z modelu oraz wejść przekaźnika z katalogu urządzeń."
    ),
    wykluczenia=(
        "ferrorezonans przekładnika w sieci izolowanej",
        "przepięcia przejściowe łączeniowe i atmosferyczne",
    ),
)


@dataclass(frozen=True)
class WymaganiaToru:
    """Fakty o chronionym torze — WSZYSTKIE z modelu albo z solwera, zadnej domyslnej."""

    #: Prad roboczy (znamionowy) chronionego toru [A] — z tabliczki: moc i napiecie.
    prad_roboczy_a: float | None = None
    #: Poczatkowy prad zwarciowy [kA] — Z SOLWERA (IEC 60909).
    ik_ka: float | None = None
    #: Prad szczytowy zwarcia [kA] — Z SOLWERA.
    ip_ka: float | None = None
    #: Czas trwania zwarcia przyjety do sprawdzenia cieplnego [s].
    czas_zwarcia_s: float | None = None
    #: Prady wejsc pomiarowych przekaznika [A] — z katalogu urzadzen. To ZBIOR
    #: (typowo 1 A i 5 A), bo urzadzenie przyjmuje kilka wartosci znamionowych.
    prady_wejsc_przekaznika_a: tuple[float, ...] | None = None
    #: Pochodzenie powyzszej deklaracji (karta producenta / szereg preferowany normy).
    zrodlo_wejsc_pl: str | None = None
    #: Obciazenie obwodu wtornego [VA] — dana PROJEKTOWA (przewody + przekaznik).
    obciazenie_obwodu_va: float | None = None
    #: Czy przekladnik ma zasilac funkcje zabezpieczeniowe.
    dla_zabezpieczen: bool = True
    # --- Obwod wtorny CT (karta W3-B, mapa 4 #3) — z `Measurement.obwod_wtorny`
    # modelu (`enm/models.py`), GDY zapisany. Zasila WYLACZNIE bilans nasycenia
    # kryterium `ct.alf` (`ct_burden_saturation.py`); brak = solver sam zwraca
    # nieoceniony czlon z kodem gotowosci `ct.secondary_circuit_missing`
    # (zero fabrykacji — modul NIE podstawia „typowych" wartosci).
    dlugosc_przewodu_m: float | None = None
    przekroj_przewodu_mm2: float | None = None
    obciazenia_aparatow: tuple[CtDeviceBurden, ...] = ()
    #: Moc tracona na stykach i zaciskach [VA] — TYLKO gdy podana jawnie.
    moc_stykow_va: float | None = None
    #: Nazwa przekladnika/pola w rekordzie oceny.
    nazwa_pl: str = "przekładnik prądowy"


def _werdykt_z_oceny(ocena: OcenaKryterium) -> Werdykt:
    if ocena.status_maszynowy == "SPELNIA":
        return "spelnione"
    if ocena.status_maszynowy == "NIE_SPELNIA":
        return "niespelnione"
    return "brak_danych"


@dataclass(frozen=True)
class Kryterium:
    """Kryterium doboru z rekordem werdyktu wyjasnialnego (``ocena``).

    ``wymagane``/``dostepne`` to jawny rachunek tekstem (liczby po polsku); rozstrzygniecie
    niesie WYLACZNIE ``ocena`` — ``werdykt`` jest jej projekcja.
    """

    kod: str
    nazwa_pl: str
    podstawa_pl: str
    ocena: OcenaKryterium
    wyjasnienie: WyjasnienieWerdyktu
    #: Wartosc WYMAGANA (z toru) i DOSTEPNA (z przekladnika) — jawny rachunek.
    wymagane: str | None = None
    dostepne: str | None = None
    komentarz_pl: str | None = None
    #: Kody gotowosci solvera (karta W3-B) — puste dla kryteriow bez wlasnego solvera.
    kody_gotowosci: tuple[str, ...] = ()
    #: Slad WHITE BOX solvera (karta W3-B) — do rozwiniecia w UI.
    slad: tuple[dict[str, Any], ...] = ()

    @property
    def werdykt(self) -> Werdykt:
        return _werdykt_z_oceny(self.ocena)

    def to_dict(self) -> dict[str, Any]:
        return {
            "kod": self.kod,
            "nazwa_pl": self.nazwa_pl,
            "podstawa_pl": self.podstawa_pl,
            "ocena": self.ocena.model_dump(mode="json"),
            "wyjasnienie": self.wyjasnienie.model_dump(mode="json"),
            "wymagane": self.wymagane,
            "dostepne": self.dostepne,
            "komentarz_pl": self.komentarz_pl,
            "kody_gotowosci": list(self.kody_gotowosci),
            "slad": list(self.slad),
        }


@dataclass(frozen=True)
class Informacja:
    """Pozycja informacyjna doboru (praktyka projektowa albo warunek konieczny) — BEZ
    statusu: nie jest kryterium oceny i nie wplywa na potwierdzenie doboru."""

    kod: str
    nazwa_pl: str
    podstawa_pl: str
    wymagane: str | None = None
    dostepne: str | None = None
    komentarz_pl: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "kod": self.kod,
            "nazwa_pl": self.nazwa_pl,
            "podstawa_pl": self.podstawa_pl,
            "wymagane": self.wymagane,
            "dostepne": self.dostepne,
            "komentarz_pl": self.komentarz_pl,
        }


@dataclass(frozen=True)
class WynikDoboru:
    kryteria: list[Kryterium] = field(default_factory=list)
    informacje: list[Informacja] = field(default_factory=list)

    @property
    def niespelnione(self) -> list[Kryterium]:
        return [k for k in self.kryteria if k.werdykt == "niespelnione"]

    @property
    def bez_danych(self) -> list[Kryterium]:
        return [k for k in self.kryteria if k.werdykt == "brak_danych"]

    @property
    def dobor_potwierdzony(self) -> bool:
        """Dobor potwierdzony = zadne kryterium nie jest niespelnione ANI bez rozstrzygniecia.

        Brak danej NIE jest zgodnoscia — to trzeci stan, ktory musi byc widoczny
        (precedens V12K-232: „nie wiem" nie jest werdyktem „spelnione").
        """
        return not self.niespelnione and not self.bez_danych

    def to_dict(self) -> dict[str, Any]:
        return {
            "kryteria": [k.to_dict() for k in self.kryteria],
            "informacje": [i.to_dict() for i in self.informacje],
            "dobor_potwierdzony": self.dobor_potwierdzony,
            "liczba_niespelnionych": len(self.niespelnione),
            "liczba_bez_danych": len(self.bez_danych),
        }


def _fl(wartosc: float | None) -> str:
    """Liczba po polsku w zdaniu złożonym — kreska dla braku danej (nigdy ``None``)."""
    return "—" if wartosc is None else format_liczba(wartosc)


def _liczba(wartosc: float | None, jednostka: str) -> str | None:
    """Wielkosc tekstem po polsku (przecinek dziesietny) — ``None`` dla braku danej."""
    if wartosc is None:
        return None
    return f"{format_liczba(wartosc)} {jednostka}"


def _kryterium(
    *,
    kod: str,
    nazwa_pl: str,
    podstawa_pl: str,
    porownanie: Porownanie,
    przedmiot: Przedmiot,
    podstawa: PodstawaWymagania,
    zakres: ZakresWaznosci,
    podstawa_limitu: PodstawaWymagania | None = None,
    wymagane: str | None = None,
    dostepne: str | None = None,
    komentarz_pl: str | None = None,
    brak_pl: str | None = None,
    skutek_pl: str | None = None,
    kody_gotowosci: tuple[str, ...] = (),
    slad: tuple[dict[str, Any], ...] = (),
) -> Kryterium:
    """Kryterium doboru z rekordem ``ocena``.

    Komentarz pod kryterium wybiera STATUS REKORDU (jedno źródło rozstrzygnięcia, bez drugiej
    kopii warunku ``≤``): ``skutek_pl`` przy niespełnieniu, ``brak_pl`` przy braku
    rozstrzygnięcia, ``komentarz_pl`` w pozostałych przypadkach (także jako zastępczy, gdy
    właściwy wariant nie jest podany).
    """
    wyznaczono = (
        porownanie.spelniony is not None
        if porownanie.relacja == "LOGICZNE"
        else porownanie.wynik is not None
    )
    # Krok sladu WHITE BOX reguly: zestawienie wymagania toru z dana katalogowa. Powstaje
    # tylko przy wyznaczonym wyniku — rekord wskazuje na krok, ktory istnieje.
    if wyznaczono and not slad:
        slad = (
            {
                "step": 1,
                "key": kod,
                "title": nazwa_pl,
                "formula_latex": porownanie.warunek_latex,
                "inputs": {
                    "wymagane": {"value": wymagane, "unit": "", "label": "Wymagane przez tor"},
                    "dostepne": {"value": dostepne, "unit": "", "label": "Dostępne w typie"},
                },
                "substitution": porownanie.stan_pl or "",
                "result": {},
                "notes": podstawa_pl,
            },
        )
    ocena = ocena_porownania(
        porownanie,
        przedmiot=przedmiot,
        podstawa=podstawa,
        podstawa_limitu=podstawa_limitu,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_DOBORU),
        zakres=zakres,
        odniesienie="domain/dobor_przekladnika.py",
        slad=(
            (OdnosnikSladu(krok=kod, opis_pl=f"{nazwa_pl} — zestawienie wymagania z typem"),)
            if wyznaczono
            else ()
        ),
    )
    if ocena.status_maszynowy == "NIE_SPELNIA" and skutek_pl is not None:
        komentarz_pl = skutek_pl
    elif ocena.status_maszynowy not in ("SPELNIA", "NIE_SPELNIA") and brak_pl is not None:
        komentarz_pl = brak_pl
    return _z_oceny(
        kod=kod,
        nazwa_pl=nazwa_pl,
        podstawa_pl=podstawa_pl,
        ocena=ocena,
        wymagane=wymagane,
        dostepne=dostepne,
        komentarz_pl=komentarz_pl,
        kody_gotowosci=kody_gotowosci,
        slad=slad,
    )


def _z_oceny(
    *,
    kod: str,
    nazwa_pl: str,
    podstawa_pl: str,
    ocena: OcenaKryterium,
    wymagane: str | None,
    dostepne: str | None,
    komentarz_pl: str | None,
    kody_gotowosci: tuple[str, ...] = (),
    slad: tuple[dict[str, Any], ...] = (),
) -> Kryterium:
    return Kryterium(
        kod=kod,
        nazwa_pl=nazwa_pl,
        podstawa_pl=podstawa_pl,
        ocena=ocena,
        wyjasnienie=ocena.wyjasnienie,
        wymagane=wymagane,
        dostepne=dostepne,
        komentarz_pl=komentarz_pl,
        kody_gotowosci=kody_gotowosci,
        slad=slad,
    )


#: Opis wariantu bilansu nasycenia po polsku (kod wariantu solvera nie jest tekstem).
WARIANT_ALF_PL: Final[dict[str, str]] = {
    "PELNY_IEC61869_2": "wariant pełny z rezystancją uzwojenia",
    "UPROSZCZONY_BEZ_RCT": "wariant uproszczony bez rezystancji uzwojenia — wynik optymistyczny",
}


def sprawdz_dobor_ct(przekladnik: dict[str, Any], tor: WymaganiaToru) -> WynikDoboru:
    """Zestaw kryteriow doboru dla podanego typu CT i chronionego toru.

    `przekladnik` to slownik z katalogu (`CTType.to_dict()`), zeby modul nie zalezal
    od klasy katalogu i dzialal tez na danych zmaterializowanych w modelu.
    """

    kryteria: list[Kryterium] = []
    informacje: list[Informacja] = []
    in_a = przekladnik.get("ratio_primary_a")
    in_wtorny = przekladnik.get("ratio_secondary_a")
    alf = przekladnik.get("accuracy_limit_factor")
    zastosowanie = przekladnik.get("application")
    ith = przekladnik.get("ith_ka_1s")
    idyn = przekladnik.get("idyn_ka_peak")
    obciazalnosc = przekladnik.get("burden_va")
    klasa = przekladnik.get("accuracy_class")
    nazwa_typu = nazwa_nadana(przekladnik.get("name")) or "przekładnik prądowy"
    przedmiot = Przedmiot(
        element_ref=None,
        nazwa_pl=tor.nazwa_pl,
        opis_pl=f"Przekładnik prądowy pola — typ katalogowy „{nazwa_typu}”",
    )
    katalog = lambda parametr: podstawa_katalogu(nazwa_typu, parametr)  # noqa: E731

    # --- 1. Przekladnia wobec pradu roboczego toru -------------------------------
    brak_przekladni = tor.prad_roboczy_a is None or in_a is None
    kryteria.append(
        _kryterium(
            kod="ct.przekladnia",
            nazwa_pl="Przekładnia wobec prądu roboczego toru",
            podstawa_pl="Prąd pierwotny przekładnika musi pokryć prąd roboczy toru.",
            porownanie=Porownanie(
                kryterium_id="ct.przekladnia",
                opis_pl="Prąd roboczy toru nie większy od znamionowego prądu pierwotnego",
                warunek_latex=r"I_{rob} \le I_{1n}",
                relacja="NIE_WIECEJ",
                wielkosc_pl="prąd roboczy toru",
                symbol_latex=r"I_{rob}",
                jednostka="A",
                wynik=None if brak_przekladni else tor.prad_roboczy_a,
                limit=in_a,
                limit_pl="znamionowy prąd pierwotny przekładnika",
                braki=(
                    (
                        "Prąd roboczy toru (moc i napięcie z tabliczki) albo przekładnia "
                        "przekładnika z katalogu.",
                    )
                    if brak_przekladni
                    else ()
                ),
            ),
            przedmiot=przedmiot,
            podstawa=_PODSTAWA_CT,
            podstawa_limitu=katalog("znamionowy prąd pierwotny I_1n"),
            zakres=_ZAKRES_CT,
            wymagane=_liczba(tor.prad_roboczy_a, "A"),
            dostepne=_liczba(in_a, "A"),
            brak_pl=(
                "Brakuje prądu roboczego toru albo przekładni — sprawdzenia nie da się wykonać."
            ),
            skutek_pl=(
                "Prąd roboczy przekracza prąd pierwotny — przekładnik pracowałby "
                "w przeciążeniu, a pomiar byłby zafałszowany."
            ),
        )
    )
    if not brak_przekladni:
        # --- 2. Wykorzystanie przekladni (informacja, nie kryterium) -------------
        assert tor.prad_roboczy_a is not None and in_a is not None
        wykorzystanie = tor.prad_roboczy_a / in_a if in_a > 0 else None
        if wykorzystanie is not None and wykorzystanie < PROG_WYKORZYSTANIA_PRZEKLADNI:
            informacje.append(
                Informacja(
                    kod="ct.wykorzystanie_przekladni",
                    nazwa_pl="Wykorzystanie przekładni",
                    podstawa_pl=(
                        "Przy bardzo niskim wykorzystaniu zakresu rośnie błąd względny "
                        "pomiaru (praktyka projektowa, nie wymaganie normy)."
                    ),
                    wymagane=f"≥ {format_liczba(PROG_WYKORZYSTANIA_PRZEKLADNI * 100)} % "
                    "prądu pierwotnego",
                    dostepne=f"{format_liczba(wykorzystanie * 100)} %",
                    komentarz_pl="Rozważ przekładnik o niższym prądzie pierwotnym.",
                )
            )

    # --- 3. Rodzaj rdzenia -------------------------------------------------------
    if tor.dla_zabezpieczen:
        ok_rdzen = None if zastosowanie is None else zastosowanie in ("protection", "dual")
        kryteria.append(
            _kryterium(
                kod="ct.rodzaj_rdzenia",
                nazwa_pl="Rodzaj rdzenia",
                podstawa_pl=(
                    "Funkcje zabezpieczeniowe wymagają rdzenia zabezpieczeniowego (IEC 61869-2)."
                ),
                porownanie=Porownanie(
                    kryterium_id="ct.rodzaj_rdzenia",
                    opis_pl="Rdzeń zabezpieczeniowy (klasa z literą P) dla funkcji zabezpieczeń",
                    relacja="LOGICZNE",
                    wielkosc_pl="rodzaj rdzenia wg klasy dokładności",
                    spelniony=ok_rdzen,
                    stan_pl=(
                        None
                        if ok_rdzen is None
                        else f"klasa {klasa} — "
                        + ("rdzeń zabezpieczeniowy" if ok_rdzen else "rdzeń pomiarowy")
                    ),
                    braki=(
                        (f"Rodzaj rdzenia z klasy dokładności „{klasa}” nie jest rozpoznany.",)
                        if ok_rdzen is None
                        else ()
                    ),
                ),
                przedmiot=przedmiot,
                podstawa=_PODSTAWA_CT,
                zakres=_ZAKRES_CT,
                wymagane=None if ok_rdzen is None else "rdzeń zabezpieczeniowy (klasa z literą P)",
                dostepne=str(klasa),
                komentarz_pl=(
                    "Klasy dokładności nie da się rozstrzygnąć na rodzaj rdzenia."
                    if ok_rdzen is None
                    else (
                        None
                        if ok_rdzen
                        else "Rdzeń pomiarowy nasyca się przy prądzie zwarciowym — "
                        "zabezpieczenie mogłoby nie zadziałać."
                    )
                ),
            )
        )

    # --- 4a. ALF katalogowy: warunek KONIECZNY, nigdy werdykt (karta W3-B) ------
    # Ta pozycja nie orzeka o nasyceniu — sam ALF katalogowy nie wie NIC o
    # obciazeniu obwodu wtornego (milczace zalozenie S2obl = Sn bylo defektem).
    # Rozstrzygniecie niesie `ct.alf` (4b) — bilans mocy wtornej solvera.
    if alf is None and klasa is not None:
        # `accuracy_limit_factor` z `CTType.to_dict()` bywa None dla danych
        # zmaterializowanych bez pelnego przeliczenia katalogu — solver niesie
        # TEN SAM wyprowadzacz klasy, wiec wynik jest identyczny.
        alf = alf_z_klasy(klasa)
        alf_ze_zrodla_klasy = alf is not None
    else:
        alf_ze_zrodla_klasy = False
    alf_wymagany = (
        ka_na_a(tor.ik_ka) / in_a
        if tor.ik_ka is not None and in_a is not None and in_a > 0
        else None
    )
    informacje.append(
        Informacja(
            kod="ct.alf_katalogowy",
            nazwa_pl="ALF katalogowy wobec prądu zwarciowego",
            podstawa_pl=(
                "Warunek KONIECZNY ALF ≥ Ik″/I1n, bez obciążenia wtórnego "
                "(IEC 61869-2) — nie rozstrzyga nasycenia rdzenia."
            ),
            wymagane=(
                _liczba(tor.ik_ka, "kA")
                if alf_wymagany is None or alf is None
                else f"ALF ≥ {_fl(alf_wymagany)} (Ik″ {_fl(tor.ik_ka)} kA / In {_fl(in_a)} A)"
            ),
            dostepne=(
                None
                if alf is None
                else f"ALF {format_liczba(alf)}"
                + (" (wyprowadzony z klasy)" if alf_ze_zrodla_klasy else "")
            ),
            komentarz_pl=(
                "Brakuje prądu zwarciowego z obliczeń albo ALF przekładnika."
                if alf_wymagany is None or alf is None
                else "Nasycenie rdzenia zależy od rzeczywistego obciążenia obwodu wtórnego "
                "(S2obl) — rozstrzyga je kryterium „Nasycenie rdzenia” (ct.alf) niżej, "
                "nie ten warunek konieczny."
            ),
        )
    )

    # --- 4b. Nasycenie rdzenia: bilans mocy wtornej (solver, W3-B) --------------
    # Rekord kryterium nasycenia pochodzi Z SOLVERA (ten sam rekord, ktory pokazuje
    # ekran bilansu CT) — dobor nie sklada wlasnej kopii warunku ALF_eff ≥ ALF_wym.
    wynik_nasycenia = check_ct_burden_saturation(
        CtBurdenInput(
            i2n_a=in_wtorny,
            sn_va=obciazalnosc,
            alf=alf,
            dlugosc_przewodu_m=tor.dlugosc_przewodu_m,
            przekroj_przewodu_mm2=tor.przekroj_przewodu_mm2,
            obciazenia_aparatow=tor.obciazenia_aparatow,
            rct_ohm=przekladnik.get("rct_ohm"),
            alf_wymagany=alf_wymagany,
            moc_stykow_va=tor.moc_stykow_va,
            nazwa_pl=tor.nazwa_pl,
        )
    )
    ocena_nasycenia = wynik_nasycenia.ocena.oceny_skladowe[1]
    s2obl = wynik_nasycenia.moc_obliczeniowa_va
    dostepne_nasycenia: str | None = None
    if wynik_nasycenia.alf_efektywny is not None and s2obl is not None and obciazalnosc is not None:
        # ALF_eff istnieje wyłącznie przy policzonym bilansie (S2obl) i znanej mocy Sn.
        wariant = WARIANT_ALF_PL.get(
            wynik_nasycenia.wariant_alf or "", "wariant bilansu nieustalony"
        )
        dostepne_nasycenia = (
            f"ALF_eff {format_liczba(wynik_nasycenia.alf_efektywny)} ({wariant}; "
            f"S2obl {format_liczba(s2obl)} VA / Sn {format_liczba(float(obciazalnosc))} VA)"
        )
    # Komentarz PL: gdy solver zglosil kody gotowosci (brak danej ALBO wariant
    # uproszczony), ich kanoniczna tresc jest KONKRETNA (nazywa BRAKUJACA dana) —
    # ma pierwszenstwo przed ogolnym zalozeniem formuly.
    tresc_kodow_pl = "; ".join(
        opis["canonical_message_pl"]
        for kod in wynik_nasycenia.readiness_codes
        if (opis := opis_kanoniczny(kod)) is not None
    )
    komentarz_nasycenia = tresc_kodow_pl or "; ".join(wynik_nasycenia.assumptions) or None
    kryteria.append(
        _z_oceny(
            kod="ct.alf",
            nazwa_pl="Nasycenie rdzenia (bilans mocy wtórnej)",
            podstawa_pl=wynik_nasycenia.formula_ref,
            ocena=ocena_nasycenia,
            wymagane=(
                f"ALF_eff ≥ {format_liczba(alf_wymagany)}" if alf_wymagany is not None else None
            ),
            dostepne=dostepne_nasycenia,
            komentarz_pl=komentarz_nasycenia,
            kody_gotowosci=wynik_nasycenia.readiness_codes,
            slad=wynik_nasycenia.white_box_trace,
        )
    )

    # --- 5. Wytrzymalosc cieplna -------------------------------------------------
    brak_cieplnej = tor.ik_ka is None or tor.czas_zwarcia_s is None or ith is None
    wymagany_ith = (
        None
        if tor.ik_ka is None or tor.czas_zwarcia_s is None
        else tor.ik_ka * math.sqrt(tor.czas_zwarcia_s)
    )
    kryteria.append(
        _kryterium(
            kod="ct.wytrzymalosc_cieplna",
            nazwa_pl="Wytrzymałość cieplna zwarciowa",
            podstawa_pl="Ith ≥ Ik″·√tk — równoważność cieplna prądu zwarcia (IEC 61869-2).",
            porownanie=Porownanie(
                kryterium_id="ct.wytrzymalosc_cieplna",
                opis_pl=(
                    "Równoważny prąd cieplny 1 s zwarcia nie większy od znamionowego "
                    "krótkotrwałego prądu cieplnego przekładnika"
                ),
                warunek_latex=r"I_k'' \sqrt{t_k} \le I_{th}",
                relacja="NIE_WIECEJ",
                wielkosc_pl="równoważny prąd cieplny 1 s zwarcia",
                symbol_latex=r"I_k'' \sqrt{t_k}",
                jednostka="kA",
                wynik=None if brak_cieplnej else wymagany_ith,
                limit=ith,
                limit_pl="znamionowy krótkotrwały prąd cieplny 1 s",
                braki=(
                    (
                        "Prąd zwarciowy początkowy z biegu IEC 60909, czas trwania zwarcia "
                        "albo prąd cieplny przekładnika z katalogu.",
                    )
                    if brak_cieplnej
                    else ()
                ),
            ),
            przedmiot=przedmiot,
            podstawa=_PODSTAWA_CT,
            podstawa_limitu=katalog("znamionowy krótkotrwały prąd cieplny I_th (1 s)"),
            zakres=_ZAKRES_CT,
            wymagane=(
                None
                if brak_cieplnej
                else f"{_fl(wymagany_ith)} kA / 1 s "
                f"(Ik″ {_fl(tor.ik_ka)} kA, tk {_fl(tor.czas_zwarcia_s)} s)"
            ),
            dostepne=_liczba(ith, "kA / 1 s"),
            brak_pl=(
                "Brakuje prądu zwarciowego, czasu jego trwania albo prądu cieplnego przekładnika."
            ),
            skutek_pl=(
                "Uzwojenie pierwotne przekroczyłoby dopuszczalną temperaturę podczas zwarcia."
            ),
        )
    )

    # --- 6. Wytrzymalosc dynamiczna ----------------------------------------------
    brak_dynamicznej = tor.ip_ka is None or idyn is None
    kryteria.append(
        _kryterium(
            kod="ct.wytrzymalosc_dynamiczna",
            nazwa_pl="Wytrzymałość dynamiczna",
            podstawa_pl="Idyn ≥ ip — siły elektrodynamiczne od prądu szczytowego (IEC 61869-2).",
            porownanie=Porownanie(
                kryterium_id="ct.wytrzymalosc_dynamiczna",
                opis_pl="Prąd udarowy zwarcia nie większy od znamionowego prądu dynamicznego",
                warunek_latex=r"i_p \le I_{dyn}",
                relacja="NIE_WIECEJ",
                wielkosc_pl="prąd udarowy zwarcia",
                symbol_latex=r"i_p",
                jednostka="kA",
                wynik=None if brak_dynamicznej else tor.ip_ka,
                limit=idyn,
                limit_pl="znamionowy prąd dynamiczny przekładnika",
                braki=(
                    (
                        "Prąd udarowy z biegu IEC 60909 albo prąd dynamiczny przekładnika "
                        "z katalogu.",
                    )
                    if brak_dynamicznej
                    else ()
                ),
            ),
            przedmiot=przedmiot,
            podstawa=_PODSTAWA_CT,
            podstawa_limitu=katalog("znamionowy prąd dynamiczny I_dyn"),
            zakres=_ZAKRES_CT,
            wymagane=None if brak_dynamicznej else _liczba(tor.ip_ka, "kA"),
            dostepne=_liczba(idyn, "kA"),
            brak_pl="Brakuje prądu szczytowego z obliczeń albo prądu dynamicznego.",
            skutek_pl=("Siły elektrodynamiczne przekroczyłyby wytrzymałość mechaniczną uzwojenia."),
        )
    )

    # --- 7. Zgodnosc pradu wtornego z wejsciem przekaznika -----------------------
    wejscia_pradowe = tor.prady_wejsc_przekaznika_a
    brak_wejsc = not wejscia_pradowe or in_wtorny is None
    zgodny = (
        None
        if not wejscia_pradowe or in_wtorny is None
        else any(abs(float(in_wtorny) - w) < 1e-6 for w in wejscia_pradowe)
    )
    wykaz_pradow = (
        None
        if not tor.prady_wejsc_przekaznika_a
        else " / ".join(f"{format_liczba(w)} A" for w in tor.prady_wejsc_przekaznika_a)
    )
    kryteria.append(
        _kryterium(
            kod="ct.prad_wtorny",
            nazwa_pl="Zgodność prądu wtórnego z wejściem przekaźnika",
            podstawa_pl=(
                "Prąd wtórny przekładnika musi być jedną z wartości znamionowych "
                "wejścia prądowego urządzenia (IEC 60255-1)."
            ),
            porownanie=Porownanie(
                kryterium_id="ct.prad_wtorny",
                opis_pl=(
                    "Znamionowy prąd wtórny przekładnika równy jednej z wartości znamionowych "
                    "wejścia prądowego urządzenia"
                ),
                relacja="LOGICZNE",
                wielkosc_pl="zgodność prądu wtórnego z wejściem urządzenia",
                spelniony=zgodny,
                stan_pl=(
                    None
                    if zgodny is None
                    else f"prąd wtórny {_fl(in_wtorny)} A wobec wejść {wykaz_pradow}"
                ),
                braki=(
                    ("Wartości znamionowe wejścia prądowego wybranego urządzenia z katalogu.",)
                    if brak_wejsc
                    else ()
                ),
            ),
            przedmiot=przedmiot,
            podstawa=_PODSTAWA_WEJSC,
            zakres=_ZAKRES_CT,
            wymagane=None if brak_wejsc else wykaz_pradow,
            dostepne=_liczba(in_wtorny, "A"),
            komentarz_pl=(
                "Brakuje danej o wejściu prądowym wybranego urządzenia."
                if brak_wejsc
                else (
                    (
                        f"Podstawa danych o wejściu: {tor.zrodlo_wejsc_pl}."
                        if tor.zrodlo_wejsc_pl
                        else None
                    )
                    if zgodny
                    else "Niezgodność prądu wtórnego oznacza błąd pomiaru w całym torze "
                    "zabezpieczeniowym."
                )
            ),
        )
    )

    # --- 8. Obciazalnosc obwodu wtornego -----------------------------------------
    kryteria.append(
        _obciazalnosc(
            kod="ct.obciazalnosc",
            podstawa_pl="Moc znamionowa rdzenia ≥ obciążenie obwodu (przewody + urządzenie).",
            obciazenie_va=tor.obciazenie_obwodu_va,
            moc_znamionowa_va=obciazalnosc,
            przedmiot=przedmiot,
            podstawa=_PODSTAWA_CT,
            podstawa_limitu=katalog("moc znamionowa rdzenia S_n"),
            zakres=_ZAKRES_CT,
            brak_pl=(
                "Obciążenie obwodu wtórnego jest daną projektową — podaj sumę "
                "rezystancji przewodów i poboru urządzenia."
            ),
            skutek_pl=(
                "Przeciążony obwód wtórny obniża rzeczywisty ALF — rdzeń nasyci się "
                "wcześniej, niż wynika z klasy."
            ),
        )
    )

    return WynikDoboru(kryteria=kryteria, informacje=informacje)


def _obciazalnosc(
    *,
    kod: str,
    podstawa_pl: str,
    obciazenie_va: float | None,
    moc_znamionowa_va: float | None,
    przedmiot: Przedmiot,
    podstawa: PodstawaWymagania,
    podstawa_limitu: PodstawaWymagania,
    zakres: ZakresWaznosci,
    brak_pl: str,
    skutek_pl: str,
) -> Kryterium:
    """Kryterium obciazalnosci obwodu wtornego — wspolne dla CT i VT (jeden warunek)."""
    brak = obciazenie_va is None or moc_znamionowa_va is None
    return _kryterium(
        kod=kod,
        nazwa_pl="Obciążalność wobec obwodu wtórnego",
        podstawa_pl=podstawa_pl,
        porownanie=Porownanie(
            kryterium_id=kod,
            opis_pl="Obciążenie obwodu wtórnego nie większe od mocy znamionowej uzwojenia",
            warunek_latex=r"S_{obw} \le S_n",
            relacja="NIE_WIECEJ",
            wielkosc_pl="obciążenie obwodu wtórnego",
            symbol_latex=r"S_{obw}",
            jednostka="VA",
            wynik=None if brak else obciazenie_va,
            limit=moc_znamionowa_va,
            limit_pl="moc znamionowa uzwojenia z karty katalogowej",
            braki=(brak_pl,) if brak else (),
        ),
        przedmiot=przedmiot,
        podstawa=podstawa,
        podstawa_limitu=podstawa_limitu,
        zakres=zakres,
        wymagane=None if brak else _liczba(obciazenie_va, "VA"),
        dostepne=_liczba(moc_znamionowa_va, "VA"),
        brak_pl=brak_pl,
        skutek_pl=skutek_pl,
    )


# =============================================================================
# PRZEKLADNIK NAPIECIOWY (VT)
# =============================================================================

#: Dopuszczalne odchylenie przekladni od wartosci wzorcowej przy rozpoznawaniu ukladu
#: pracy (miedzyfazowy vs faza-ziemia) i przy zgodnosci napiecia wtornego.
#:
#: Pasmo jest CIASNE i taki jest zamysl: napiecia znamionowe przekladnikow to wartosci
#: ZNORMALIZOWANE (100 V, 110 V, 100/√3 V), a nie pomiary — pasmo ma pokryc wylacznie
#: zaokraglenia katalogowe (20000/√3 zapisane jako 11547,0; 100/√3 jako 57,7). Szersze
#: pasmo uznawaloby 110 V za zgodne ze wejsciem 100 V, a to 10% bledu w kazdej nastawie
#: napieciowej toru — dokladnie ten defekt wykryl test zgodnosci napiecia wtornego.
TOLERANCJA_PRZEKLADNI_NAPIECIOWEJ = 0.02

#: Powyzej tej krotnosci napiecia sieci przekladnik jest nadwymiarowany — pomiar traci
#: rozdzielczosc. Praktyka projektowa, nie wymaganie normy => INFORMACJA.
PROG_NADWYMIAROWANIA_VT = 1.5

#: Sieci, w ktorych zwarcie doziemne NIE jest ograniczane male impedancja punktu
#: neutralnego: napiecie faz zdrowych rosnie do napiecia miedzyfazowego, wiec norma
#: wymaga wspolczynnika napieciowego 1,9 (IEC 61869-3 tab. 2). „rezystor" jest tu
#: swiadomie: siec uziemiona przez rezystor NIE jest siecia skutecznie uziemiona.

#: Wspolczynnik ciagly — wystarcza przekladnikowi pracujacemu MIEDZY FAZAMI, bo zwarcie
#: doziemne nie zmienia napiecia miedzyfazowego (IEC 61869-3 tab. 2).
WSPOLCZYNNIK_CIAGLY = 1.2
WSPOLCZYNNIK_SIEC_UZIEMIONA = 1.5
WSPOLCZYNNIK_SIEC_MALOPRADOWA = 1.9
CZAS_WSPOLCZYNNIKA_KROTKI_S = 30.0
CZAS_WSPOLCZYNNIKA_DLUGI_S = 8 * 3600.0


@dataclass(frozen=True)
class WymaganiaToruNapieciowego:
    """Fakty o torze napieciowym — z modelu, nigdy domyslne."""

    #: Napiecie znamionowe sieci w tym punkcie [V] — z modelu (szyna pola).
    napiecie_sieci_v: float | None = None
    #: Sposob uziemienia punktu neutralnego — z modelu (`GroundingConfig.type`);
    #: `None` znaczy NIEZNANY (W5-A: koniec literalu nieznany).
    tryb_uziemienia: str | None = None
    #: Czy zwarcie doziemne jest wylaczane automatycznie — dana PROJEKTOWA; decyduje
    #: o CZASIE wspolczynnika napieciowego (30 s vs 8 h), nie o jego wartosci.
    zwarcie_doziemne_wylaczane_automatycznie: bool | None = None
    #: Napiecia wejsc pomiarowych przekaznika [V] — ZBIOR wartosci znamionowych.
    napiecia_wejsc_przekaznika_v: tuple[float, ...] | None = None
    #: Pochodzenie powyzszej deklaracji (karta producenta / szereg preferowany normy).
    zrodlo_wejsc_pl: str | None = None
    #: Obciazenie obwodu wtornego [VA] — dana PROJEKTOWA.
    obciazenie_obwodu_va: float | None = None
    #: Zadeklarowane w modelu zrodlo napiecia zerowego: „otwarty_trojkat_vt",
    #: „uzwojenie_resztkowe_vt", „obliczone" albo „brak".
    zrodlo_napiecia_zerowego: str | None = None
    #: Czy przekladnik ma zasilac funkcje zabezpieczeniowe.
    dla_zabezpieczen: bool = True
    #: Nazwa przekladnika/pola w rekordzie oceny.
    nazwa_pl: str = "przekładnik napięciowy"


def _blisko(wartosc: float, wzorzec: float, tolerancja: float) -> bool:
    if wzorzec <= 0:
        return False
    return abs(wartosc - wzorzec) / wzorzec <= tolerancja


def wymagany_wspolczynnik_napieciowy(tryb: str | None, uklad: str | None = None) -> float | None:
    """Wymagana wartosc F_v wg IEC 61869-3 tab. 2 — JEDYNE miejsce tej reguly.

    UKLAD PRACY DECYDUJE, ZANIM ZDECYDUJE UZIEMIENIE. Zwarcie doziemne podnosi napiecie
    faz zdrowych WZGLEDEM ZIEMI — napiecie MIEDZYFAZOWE sie nie zmienia. Dlatego
    przekladnik pracujacy miedzy fazami potrzebuje tylko wspolczynnika ciaglego (1,2),
    niezaleznie od sposobu uziemienia sieci, a wymagania 1,5 i 1,9 dotycza wylacznie
    uzwojenia pierwotnego pracujacego miedzy FAZA a ZIEMIA.

    Dla ukladu faza-ziemia:
      * siec maloprądowa (izolowana, kompensowana, uziemiona przez rezystor) => 1,9,
      * siec bezposrednio (skutecznie) uziemiona => 1,5.

    „rezystor" nalezy do rodziny 1,9 SWIADOMIE: siec uziemiona przez rezystor NIE jest
    siecia skutecznie uziemiona — przy zwarciu doziemnym napiecie faz zdrowych rosnie
    praktycznie do miedzyfazowego, wiec wymaganie 1,5 byloby zanizone. Tak brzmial
    rozjazd V12K-256: `audit2_catalogs` mial wlasna, lagodniejsza wersje tej samej reguly.

    `None` = nie da sie ustalic (nieznane uziemienie albo nierozpoznany uklad pracy);
    wymagania NIE zgadujemy (V12K-246).
    """
    if uklad == "miedzyfazowy":
        return WSPOLCZYNNIK_CIAGLY
    if uklad is None and tryb is not None:
        # Uklad nierozpoznany: nie wiadomo, ktora rodzina wymagan obowiazuje.
        return None
    if tryb is None:
        return None
    if tryb in UZIEMIENIA_WYMAGAJACE_FV_19:
        return WSPOLCZYNNIK_SIEC_MALOPRADOWA
    if tryb == "directly_grounded":
        return WSPOLCZYNNIK_SIEC_UZIEMIONA
    return None


def _czas_wspolczynnika_pl(czas_s: float | None) -> str | None:
    if czas_s is None:
        return None
    if czas_s >= 3600.0:
        return f"{czas_s / 3600.0:.0f} h"
    return f"{czas_s:.0f} s"


def sprawdz_dobor_vt(przekladnik: dict[str, Any], tor: WymaganiaToruNapieciowego) -> WynikDoboru:
    """Zestaw kryteriow doboru przekladnika napieciowego dla podanego toru.

    `przekladnik` to slownik z katalogu (`VTType.to_dict()`) — modul nie zalezy od klasy
    katalogu i dziala tez na danych zmaterializowanych w modelu.
    """

    kryteria: list[Kryterium] = []
    informacje: list[Informacja] = []
    un_pierwotne = przekladnik.get("ratio_primary_v")
    un_wtorne = przekladnik.get("ratio_secondary_v")
    rodzaj = przekladnik.get("application")
    fv = przekladnik.get("rated_voltage_factor")
    czas_fv = przekladnik.get("voltage_factor_duration_s")
    obciazalnosc = przekladnik.get("burden_va")
    uzwojenie_resztkowe = przekladnik.get("has_residual_winding")
    klasa = przekladnik.get("accuracy_class")
    nazwa_typu = nazwa_nadana(przekladnik.get("name")) or "przekładnik napięciowy"
    przedmiot = Przedmiot(
        element_ref=None,
        nazwa_pl=tor.nazwa_pl,
        opis_pl=f"Przekładnik napięciowy pola — typ katalogowy „{nazwa_typu}”",
    )

    #: Uklad pracy uzwojenia pierwotnego rozpoznany z przekladni — potrzebny takze
    #: kryterium toru napiecia zerowego, dlatego liczony raz.
    uklad: str | None = None

    # --- 1. Napiecie pierwotne wobec napiecia sieci ------------------------------
    podstawa_pierwotne = (
        "Napięcie pierwotne odpowiada napięciu sieci (układ międzyfazowy) "
        "albo napięciu fazowemu U_n/√3 (układ faza–ziemia)."
    )
    if tor.napiecie_sieci_v is None or un_pierwotne is None:
        kryteria.append(
            _kryterium(
                kod="vt.napiecie_pierwotne",
                nazwa_pl="Przekładnia wobec napięcia sieci",
                podstawa_pl=podstawa_pierwotne,
                porownanie=_porownanie_pierwotne(None, None),
                przedmiot=przedmiot,
                podstawa=_PODSTAWA_VT,
                zakres=_ZAKRES_VT,
                wymagane=_liczba(tor.napiecie_sieci_v, "V"),
                dostepne=_liczba(un_pierwotne, "V"),
                komentarz_pl="Brakuje napięcia sieci w tym punkcie albo przekładni.",
            )
        )
    else:
        faza_ziemia = napiecie_fazowe_v(tor.napiecie_sieci_v)
        if _blisko(un_pierwotne, faza_ziemia, TOLERANCJA_PRZEKLADNI_NAPIECIOWEJ):
            uklad = "faza_ziemia"
        elif _blisko(un_pierwotne, tor.napiecie_sieci_v, TOLERANCJA_PRZEKLADNI_NAPIECIOWEJ):
            uklad = "miedzyfazowy"
        elif un_pierwotne > tor.napiecie_sieci_v:
            # Przekladnik przewymiarowany (np. na napiecie Um rozdzielnicy) — dopuszczalny,
            # bo izolacja i F_v maja zapas; kosztem rozdzielczosci pomiaru.
            uklad = "miedzyfazowy"
        stan = (
            f"napięcie pierwotne {format_liczba(un_pierwotne)} V wobec sieci "
            f"{format_liczba(tor.napiecie_sieci_v)} V — "
            + (
                "układ faza–ziemia"
                if uklad == "faza_ziemia"
                else ("układ międzyfazowy" if uklad == "miedzyfazowy" else "napięcie za niskie")
            )
        )
        kryteria.append(
            _kryterium(
                kod="vt.napiecie_pierwotne",
                nazwa_pl="Przekładnia wobec napięcia sieci",
                podstawa_pl=podstawa_pierwotne,
                porownanie=_porownanie_pierwotne(uklad is not None, stan),
                przedmiot=przedmiot,
                podstawa=_PODSTAWA_VT,
                zakres=_ZAKRES_VT,
                wymagane=(
                    f"{format_liczba(tor.napiecie_sieci_v)} V (międzyfazowo) "
                    f"albo {format_liczba(faza_ziemia)} V (faza–ziemia)"
                ),
                dostepne=_liczba(un_pierwotne, "V"),
                komentarz_pl=(
                    "Rozpoznany układ pracy: faza–ziemia (przekładnia U_n/√3)."
                    if uklad == "faza_ziemia"
                    else (
                        "Rozpoznany układ pracy: międzyfazowy."
                        if uklad == "miedzyfazowy"
                        else "Napięcie pierwotne jest niższe od napięcia sieci — przekładnik "
                        "pracowałby w przepięciu, a izolacja nie ma zapasu."
                    )
                ),
            )
        )
        if uklad is not None and un_pierwotne > tor.napiecie_sieci_v * PROG_NADWYMIAROWANIA_VT:
            informacje.append(
                Informacja(
                    kod="vt.nadwymiarowanie",
                    nazwa_pl="Nadwymiarowanie przekładni",
                    podstawa_pl=(
                        "Przy dużym zapasie przekładni sygnał wtórny jest mały w stosunku "
                        "do zakresu wejścia (praktyka projektowa, nie wymaganie normy)."
                    ),
                    wymagane=f"≤ {format_liczba(PROG_NADWYMIAROWANIA_VT)}× napięcia sieci",
                    dostepne=(
                        f"{format_liczba(un_pierwotne / tor.napiecie_sieci_v)}× napięcia sieci"
                    ),
                    komentarz_pl="Rozważ przekładnik dopasowany do napięcia sieci.",
                )
            )

    # --- 2. Rodzaj uzwojenia -----------------------------------------------------
    if tor.dla_zabezpieczen:
        ok_uzwojenie = None if rodzaj is None else rodzaj == "protection"
        kryteria.append(
            _kryterium(
                kod="vt.rodzaj_uzwojenia",
                nazwa_pl="Rodzaj uzwojenia",
                podstawa_pl=(
                    "Funkcje zabezpieczeniowe wymagają uzwojenia zabezpieczeniowego "
                    "— klasa z literą P (IEC 61869-3 § 5.6.202)."
                ),
                porownanie=Porownanie(
                    kryterium_id="vt.rodzaj_uzwojenia",
                    opis_pl=(
                        "Uzwojenie zabezpieczeniowe (klasa 3P albo 6P) dla funkcji zabezpieczeń"
                    ),
                    relacja="LOGICZNE",
                    wielkosc_pl="rodzaj uzwojenia wg klasy dokładności",
                    spelniony=ok_uzwojenie,
                    stan_pl=(
                        None
                        if ok_uzwojenie is None
                        else f"klasa {klasa} — "
                        + ("uzwojenie zabezpieczeniowe" if ok_uzwojenie else "uzwojenie pomiarowe")
                    ),
                    braki=(
                        (f"Rodzaj uzwojenia z klasy dokładności „{klasa}” nie jest rozpoznany.",)
                        if ok_uzwojenie is None
                        else ()
                    ),
                ),
                przedmiot=przedmiot,
                podstawa=_PODSTAWA_VT,
                zakres=_ZAKRES_VT,
                wymagane=(
                    None
                    if ok_uzwojenie is None
                    else "uzwojenie zabezpieczeniowe (klasa 3P albo 6P)"
                ),
                dostepne=str(klasa),
                komentarz_pl=(
                    "Klasy dokładności nie da się rozstrzygnąć na rodzaj uzwojenia."
                    if ok_uzwojenie is None
                    else (
                        None
                        if ok_uzwojenie
                        else "Uzwojenie pomiarowe ma zdefiniowaną dokładność tylko w "
                        "otoczeniu napięcia znamionowego — przy zapadzie i przy "
                        "przepięciu ziemnozwarciowym pomiar dla zabezpieczeń traci "
                        "wiarygodność."
                    )
                ),
            )
        )

    # --- 3. Wspolczynnik napieciowy F_v ------------------------------------------
    wymagany_fv = wymagany_wspolczynnik_napieciowy(tor.tryb_uziemienia, uklad)
    wymagany_czas = (
        None
        if tor.zwarcie_doziemne_wylaczane_automatycznie is None
        else (
            CZAS_WSPOLCZYNNIKA_KROTKI_S
            if tor.zwarcie_doziemne_wylaczane_automatycznie
            else CZAS_WSPOLCZYNNIKA_DLUGI_S
        )
    )
    # W sieci bezposrednio uziemionej norma podaje jeden czas (30 s) — zwarcie doziemne
    # jest tam zwarciem wielkopradowym i musi byc wylaczone, wiec dana o automatyce
    # nie jest potrzebna do rozstrzygniecia.
    if wymagany_fv == WSPOLCZYNNIK_SIEC_UZIEMIONA:
        wymagany_czas = CZAS_WSPOLCZYNNIKA_KROTKI_S
    if wymagany_fv == WSPOLCZYNNIK_CIAGLY:
        # Wspolczynnik ciagly obowiazuje bez ograniczenia czasu — kazda deklaracja
        # producenta (30 s / 8 h) jest wobec niego wystarczajaca.
        wymagany_czas = 0.0
    podstawa_fv = (
        "F_v opisuje krotność napięcia znamionowego wytrzymywaną z "
        "zachowaniem dokładności; w sieci małoprądowej zwarcie doziemne "
        "podnosi napięcie faz zdrowych do międzyfazowego (IEC 61869-3 tab. 2)."
    )
    if wymagany_fv is None or fv is None or wymagany_czas is None or czas_fv is None:
        brakujace: list[str] = []
        if wymagany_fv is None and uklad is None:
            brakujace.append(
                "układ pracy przekładnika (najpierw rozstrzygnij kryterium przekładni — "
                "wymaganie 1,9 dotyczy uzwojenia faza–ziemia, nie międzyfazowego)"
            )
        elif wymagany_fv is None:
            brakujace.append(
                "sposób uziemienia punktu neutralnego sieci (decyduje o wartości 1,5 albo 1,9)"
            )
        if wymagany_czas is None:
            brakujace.append(
                "informacja, czy zwarcie doziemne jest wyłączane automatycznie "
                "(decyduje o czasie 30 s albo 8 h)"
            )
        if fv is None or czas_fv is None:
            brakujace.append("współczynnik napięciowy przekładnika z karty producenta")
        kryteria.append(
            _kryterium(
                kod="vt.wspolczynnik_napieciowy",
                nazwa_pl="Współczynnik napięciowy",
                podstawa_pl=podstawa_fv,
                porownanie=_porownanie_fv(
                    None, None, tuple(b[:1].upper() + b[1:] + "." for b in brakujace)
                ),
                przedmiot=przedmiot,
                podstawa=_PODSTAWA_VT,
                zakres=_ZAKRES_VT,
                dostepne=(
                    None
                    if fv is None
                    else f"{format_liczba(fv)} przez "
                    f"{_czas_wspolczynnika_pl(czas_fv) or 'czas nieznany'}"
                ),
                komentarz_pl="Brakuje: " + "; ".join(brakujace) + ".",
            )
        )
    else:
        ok_fv = fv >= wymagany_fv
        ok_czas = czas_fv >= wymagany_czas
        # Wspolczynnik ciagly (czas 0) obowiazuje bez ograniczenia czasu — „przez 0 s" byloby
        # falszywym zapisem wymagania.
        wymagane_fv = (
            f"{format_liczba(wymagany_fv)} (praca ciągła)"
            if wymagany_czas == 0.0
            else f"{format_liczba(wymagany_fv)} przez {_czas_wspolczynnika_pl(wymagany_czas)}"
        )
        dostepne_fv = f"{format_liczba(fv)} przez {_czas_wspolczynnika_pl(czas_fv)}"
        kryteria.append(
            _kryterium(
                kod="vt.wspolczynnik_napieciowy",
                nazwa_pl="Współczynnik napięciowy",
                podstawa_pl=podstawa_fv,
                porownanie=_porownanie_fv(
                    ok_fv and ok_czas,
                    f"F_v {dostepne_fv} wobec wymaganego {wymagane_fv}",
                    (),
                ),
                przedmiot=przedmiot,
                podstawa=_PODSTAWA_VT,
                zakres=_ZAKRES_VT,
                wymagane=wymagane_fv,
                dostepne=dostepne_fv,
                komentarz_pl=(
                    None
                    if ok_fv and ok_czas
                    else (
                        "Zbyt niska krotność napięcia — przy zwarciu doziemnym rdzeń "
                        "nasyci się, a pomiar napięcia przestanie być wiarygodny."
                        if not ok_fv
                        else "Krotność jest wystarczająca, ale deklarowana na krótszy "
                        "czas niż czas trwania doziemienia w tej sieci."
                    )
                ),
            )
        )

    # --- 4. Napiecie wtorne wobec wejscia przekaznika ----------------------------
    wejscia_napieciowe = tor.napiecia_wejsc_przekaznika_v
    brak_wejsc = not wejscia_napieciowe or un_wtorne is None
    pasuje = (
        None
        if not wejscia_napieciowe or un_wtorne is None
        else any(
            _blisko(un_wtorne, w, TOLERANCJA_PRZEKLADNI_NAPIECIOWEJ)
            or _blisko(un_wtorne, napiecie_fazowe_v(w), TOLERANCJA_PRZEKLADNI_NAPIECIOWEJ)
            for w in wejscia_napieciowe
        )
    )
    wykaz = (
        None
        if not tor.napiecia_wejsc_przekaznika_v
        else " / ".join(
            f"{format_liczba(w)} V (albo {format_liczba(napiecie_fazowe_v(w))} V faza–ziemia)"
            for w in tor.napiecia_wejsc_przekaznika_v
        )
    )
    kryteria.append(
        _kryterium(
            kod="vt.napiecie_wtorne",
            nazwa_pl="Zgodność napięcia wtórnego z wejściem przekaźnika",
            podstawa_pl=(
                "Napięcie wtórne musi być jedną z wartości znamionowych wejścia napięciowego "
                "urządzenia (IEC 60255-1) — wprost albo przez √3 w układzie faza–ziemia."
            ),
            porownanie=Porownanie(
                kryterium_id="vt.napiecie_wtorne",
                opis_pl=(
                    "Znamionowe napięcie wtórne przekładnika równe jednej z wartości "
                    "znamionowych wejścia napięciowego urządzenia (wprost albo przez √3)"
                ),
                relacja="LOGICZNE",
                wielkosc_pl="zgodność napięcia wtórnego z wejściem urządzenia",
                spelniony=pasuje,
                stan_pl=(
                    None
                    if pasuje is None
                    else f"napięcie wtórne {_fl(un_wtorne)} V wobec wejść {wykaz}"
                ),
                braki=(
                    ("Wartości znamionowe wejścia napięciowego wybranego urządzenia z katalogu.",)
                    if brak_wejsc
                    else ()
                ),
            ),
            przedmiot=przedmiot,
            podstawa=_PODSTAWA_WEJSC,
            zakres=_ZAKRES_VT,
            wymagane=None if brak_wejsc else wykaz,
            dostepne=_liczba(un_wtorne, "V"),
            komentarz_pl=(
                "Brakuje danej o wejściu napięciowym wybranego urządzenia."
                if brak_wejsc
                else (
                    (
                        f"Podstawa danych o wejściu: {tor.zrodlo_wejsc_pl}."
                        if tor.zrodlo_wejsc_pl
                        else None
                    )
                    if pasuje
                    else "Niezgodność napięcia wtórnego przekłada się wprost na błąd "
                    "nastaw napięciowych w całym torze."
                )
            ),
        )
    )

    # --- 5. Obciazalnosc obwodu wtornego -----------------------------------------
    kryteria.append(
        _obciazalnosc(
            kod="vt.obciazalnosc",
            podstawa_pl="Moc znamionowa uzwojenia ≥ obciążenie obwodu (IEC 61869-3).",
            obciazenie_va=tor.obciazenie_obwodu_va,
            moc_znamionowa_va=obciazalnosc,
            przedmiot=przedmiot,
            podstawa=_PODSTAWA_VT,
            podstawa_limitu=podstawa_katalogu(nazwa_typu, "moc znamionowa uzwojenia S_n"),
            zakres=_ZAKRES_VT,
            brak_pl=(
                "Obciążenie obwodu napięciowego jest daną projektową — podaj sumę "
                "poboru urządzeń zasilanych z tego uzwojenia."
            ),
            skutek_pl=(
                "Przeciążone uzwojenie wychodzi z klasy dokładności — zmierzone "
                "napięcie będzie zaniżone."
            ),
        )
    )

    # --- 6. Tor napiecia zerowego ------------------------------------------------
    # Kryterium powstaje TYLKO wtedy, gdy model deklaruje zrodlo napiecia zerowego.
    # Jego BRAK jest nazwany w doborze funkcji zabezpieczeniowych (V12K-252) jako
    # kwestia otwarta — powtarzanie go tutaj byloby szumem.
    zrodlo = tor.zrodlo_napiecia_zerowego
    if zrodlo in ("otwarty_trojkat_vt", "uzwojenie_resztkowe_vt", "obliczone"):
        kryteria.append(_kryterium_toru_zerowego(zrodlo, uklad, uzwojenie_resztkowe, przedmiot))

    return WynikDoboru(kryteria=kryteria, informacje=informacje)


def _porownanie_pierwotne(rozpoznany: bool | None, stan_pl: str | None) -> Porownanie:
    return Porownanie(
        kryterium_id="vt.napiecie_pierwotne",
        opis_pl=(
            "Napięcie pierwotne przekładnika odpowiada napięciu sieci (układ międzyfazowy, "
            "także z zapasem) albo napięciu fazowemu U_n/√3 (układ faza–ziemia)"
        ),
        relacja="LOGICZNE",
        wielkosc_pl="rozpoznany układ pracy uzwojenia pierwotnego",
        spelniony=rozpoznany,
        stan_pl=stan_pl,
        braki=(
            ("Napięcie znamionowe sieci w punkcie pola albo przekładnia przekładnika.",)
            if rozpoznany is None
            else ()
        ),
    )


def _porownanie_fv(
    spelniony: bool | None, stan_pl: str | None, braki: tuple[str, ...]
) -> Porownanie:
    return Porownanie(
        kryterium_id="vt.wspolczynnik_napieciowy",
        opis_pl=(
            "Współczynnik napięciowy przekładnika i czas jego deklaracji nie mniejsze od "
            "wymaganych dla układu pracy i sposobu uziemienia sieci"
        ),
        warunek_latex=r"F_v \ge F_{v,wym} \wedge t_{F_v} \ge t_{wym}",
        relacja="LOGICZNE",
        wielkosc_pl="współczynnik napięciowy z czasem deklaracji",
        spelniony=spelniony,
        stan_pl=stan_pl,
        braki=braki,
    )


def _kryterium_toru_zerowego(
    zrodlo: str,
    uklad: str | None,
    uzwojenie_resztkowe: bool | None,
    przedmiot: Przedmiot,
) -> Kryterium:
    """Czy wybrany przekladnik realizuje ZADEKLAROWANY w modelu tor napiecia zerowego.

    Trzy zrodla to trzy rozne wymagania konstrukcyjne, nie synonimy:
      * otwarty trojkat  — trzy przekladniki faza-ziemia, uzwojenia wtorne w otwartym
                           trojkacie; nie wymaga trzeciego uzwojenia,
      * uzwojenie resztkowe — wymaga TRZECIEGO uzwojenia w przekladniku (dana
                           konstrukcyjna producenta),
      * obliczone        — 3U0 sumowane numerycznie w urzadzeniu; wymaga pomiaru
                           napiec fazowych, czyli ukladu faza-ziemia.
    """
    nazwa = "Realizacja toru napięcia zerowego"
    podstawa = (
        "Kryterium ziemnozwarciowe kierunkowe (67N) i zerowe nadnapięciowe (59N) "
        "wymagają pomiaru 3U0 — jego droga musi istnieć w konstrukcji przekładnika."
    )

    def kryterium(
        spelniony: bool | None,
        stan_pl: str | None,
        wymagane: str,
        dostepne: str | None,
        komentarz_pl: str | None,
        brak_pl: str | None,
    ) -> Kryterium:
        return _kryterium(
            kod="vt.tor_napiecia_zerowego",
            nazwa_pl=nazwa,
            podstawa_pl=podstawa,
            porownanie=Porownanie(
                kryterium_id="vt.tor_napiecia_zerowego",
                opis_pl=f"Konstrukcja przekładnika realizuje tor 3U0: {wymagane}",
                relacja="LOGICZNE",
                wielkosc_pl="realizacja toru napięcia zerowego",
                spelniony=spelniony,
                stan_pl=stan_pl,
                braki=(brak_pl,) if brak_pl else (),
            ),
            przedmiot=przedmiot,
            podstawa=_PODSTAWA_TORU_ZEROWEGO,
            zakres=_ZAKRES_VT,
            wymagane=wymagane,
            dostepne=dostepne,
            komentarz_pl=komentarz_pl,
        )

    if zrodlo == "uzwojenie_resztkowe_vt":
        wymagane_r = "uzwojenie resztkowe (trzecie) w przekładniku"
        if uzwojenie_resztkowe is None:
            komentarz = (
                "Karta producenta tego typu nie mówi, czy uzwojenie resztkowe "
                "istnieje. W katalogu jest rodzina faza–ziemia z uzwojeniem "
                "resztkowym — wybierz typ z tej rodziny albo uzupełnij kartę."
            )
            return kryterium(None, None, wymagane_r, None, komentarz, komentarz)
        dostepne_r = "uzwojenie resztkowe" if uzwojenie_resztkowe else "brak uzwojenia resztkowego"
        return kryterium(
            bool(uzwojenie_resztkowe),
            dostepne_r,
            wymagane_r,
            dostepne_r,
            (
                None
                if uzwojenie_resztkowe
                else "Model deklaruje napięcie zerowe z uzwojenia resztkowego, a wybrany "
                "typ go nie ma — kryterium kierunkowe nie miałoby sygnału."
            ),
            None,
        )

    # Otwarty trojkat i pomiar obliczany wymagaja tego samego: pomiaru napiec fazowych.
    wymagane = "układ faza–ziemia (przekładnia U_n/√3)"
    if uklad is None:
        komentarz = (
            "Układu pracy przekładnika nie ustalono, bo nie zgadza się przekładnia "
            "z napięciem sieci — najpierw rozstrzygnij kryterium przekładni."
        )
        return kryterium(None, None, wymagane, None, komentarz, komentarz)
    ok = uklad == "faza_ziemia"
    dostepne = "układ faza–ziemia" if ok else "układ międzyfazowy"
    return kryterium(
        ok,
        dostepne,
        wymagane,
        dostepne,
        (
            None
            if ok
            else "Przekładnik międzyfazowy nie mierzy napięć fazowych, więc suma 3U0 "
            "nie powstanie — ani w otwartym trójkącie, ani numerycznie w urządzeniu."
        ),
        None,
    )
