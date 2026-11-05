"""Dane znamionowe rozdzielnicy sekcji GPZ (`GPZSection.rozdzielnica`) — JEDEN opis i walidator.

Po co: sekcja szyn GPZ niosła dotąd wyłącznie topologię (szyna, kolejność, sprzęgła), a analizy,
które potrzebują danych ROZDZIELNICY sekcji — wytrzymałość zwarciowa szyn zbiorczych (IEC
62271-1, IEC 60865-1), klasyfikacja łukowa IAC (IEC 62271-200), dobór napięcia znamionowego
(IEC 62271-1 wobec U_s sieci z IEC 60038), prąd znamionowy ciągły szyn i energia łuku (IEEE
1584-2018) — albo ich nie oceniały, albo brały wartości z żądania wspólne dla wszystkich węzłów.
Ten moduł jest JEDYNYM opisem tych danych: nazwa, symbol, jednostka, dopuszczalny zakres z
podstawą normową. Czytają go: model (`enm.models.RozdzielnicaSekcjiGpz` — granice pól), operacja
`update_gpz_section` (brama wartości projektanta), dostawca widoku wytrzymałości aparatury
(`application.analyses.wytrzymalosc_aparatury_pol`) i widok Arc Flash
(`application.analyses.arc_flash_view`); lustro frontendu `ui/workspace/gpz/poleGpzDefinicje.ts`
przypina test równości z tablicą parytetu `backend/schemas/rozdzielnica_gpz_parytet_v1.json`
(eksport `eksport_parytetu_rozdzielnicy`, skrypt `backend/scripts/eksport_parytetu_rozdzielnicy_
gpz.py`; równość pliku z eksportem przypina `tests/enm/test_rozdzielnica_gpz.py`).

Zero fizyki: moduł to DANE (zakresy, nazwy) i walidacja kształtu. Brak bloku albo pola = dana
nienadana (nigdy zero): analizy proponują wartość roboczą tam, gdzie norma ją daje (zasada nr 4
— `network_model.catalog.wartosci_robocze`), a tam, gdzie jej nie ma, nazywają brak.

Kod błędu `gpz_section.update.rozdzielnica_invalid` jest kodem ODPOWIEDZI operacji domenowej,
nie kodem gotowości kanonu.
"""

from __future__ import annotations

import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal, get_args

#: Konfiguracja elektrod IEEE 1584-2018 §4.2 — lustro `analysis.arc_flash.ElectrodeConfig`
#: (równość zbiorów przypina `tests/enm/test_rozdzielnica_gpz.py`; warstwa domeny nie importuje
#: warstwy analizy).
KonfiguracjaElektrod = Literal["VCB", "VCBB", "HCB", "VOA", "HOA"]
KONFIGURACJE_ELEKTROD: tuple[str, ...] = get_args(KonfiguracjaElektrod)

#: Rodzaj dostępności klasyfikacji łukowej IAC (IEC 62271-200:2021 p. 6.106.2 / zał. AA):
#: A — dostęp wyłącznie dla upoważnionego personelu, B — dostęp nieograniczony (także dla
#: osób postronnych), C — rozdzielnica na słupie poza zasięgiem.
DostepnoscIac = Literal["A", "B", "C"]
DOSTEPNOSCI_IAC: tuple[str, ...] = get_args(DostepnoscIac)

#: Strony obudowy objęte klasyfikacją IAC (F — przód, L — bok, R — tył), kolejność normy.
#: Strony obudowy objęte klasyfikacją IAC (IEC 62271-200 p. 6.106): F, L, R w tej kolejności,
#: każda co najwyżej raz. Jeden wzór dla modelu pydantic, bramy operacji i tablicy parytetu.
WZOR_STRON_IAC = r"^[F]?[L]?[R]?$"
_WZOR_STRON_IAC = re.compile(WZOR_STRON_IAC)

KOD_BLEDU_ROZDZIELNICY = "gpz_section.update.rozdzielnica_invalid"


@dataclass(frozen=True)
class OpisPolaRozdzielnicy:
    """Pole liczbowe rozdzielnicy: nazwa, symbol, jednostka, zakres i jego podstawa."""

    klucz: str
    nazwa_pl: str
    symbol: str
    jednostka: str
    od: float
    do: float
    #: Zakres jest granicą DOMKNIĘTĄ z obu stron; podstawa mówi, skąd się wziął.
    podstawa_zakresu_pl: str


#: Pola liczbowe rozdzielnicy sekcji — kolejność stała (formularz, raport, determinizm).
OPISY_POL_ROZDZIELNICY: tuple[OpisPolaRozdzielnicy, ...] = (
    OpisPolaRozdzielnicy(
        klucz="u_r_kv",
        nazwa_pl="napięcie znamionowe rozdzielnicy",
        symbol="U_r",
        jednostka="kV",
        od=1.0,
        do=245.0,
        podstawa_zakresu_pl=(
            "IEC 62271-1:2017 p. 5.2, tabl. 1 (zakres I: U_r od 3,6 kV do 245 kV); dolna granica "
            "1 kV — rozdzielnica sekcji GPZ jest aparaturą wysokonapięciową"
        ),
    ),
    OpisPolaRozdzielnicy(
        klucz="i_r_a",
        nazwa_pl="prąd znamionowy ciągły szyn zbiorczych",
        symbol="I_r",
        jednostka="A",
        od=100.0,
        do=6300.0,
        podstawa_zakresu_pl=(
            "IEC 62271-1:2017 p. 5.5 (szereg R10 prądów znamionowych ciągłych; rozdzielnice SN "
            "i 110 kV od 400 A do 4000 A, granica 6300 A — największa wartość szeregu w kartach)"
        ),
    ),
    OpisPolaRozdzielnicy(
        klucz="i_k_ka",
        nazwa_pl="prąd znamionowy krótkotrwały wytrzymywany szyn",
        symbol="I_k",
        jednostka="kA",
        od=0.1,
        do=100.0,
        podstawa_zakresu_pl="IEC 62271-1:2017 p. 5.6 (szereg R10: 6,3 kA … 80 kA)",
    ),
    OpisPolaRozdzielnicy(
        klucz="t_k_s",
        nazwa_pl="znamionowy czas trwania zwarcia szyn",
        symbol="t_k",
        jednostka="s",
        od=0.1,
        do=5.0,
        podstawa_zakresu_pl=(
            "IEC 62271-1:2017 p. 5.8 (wartość zalecana 1 s; wartości alternatywne 0,5 s, 2 s, 3 s)"
        ),
    ),
    OpisPolaRozdzielnicy(
        klucz="i_p_ka",
        nazwa_pl="prąd znamionowy szczytowy wytrzymywany szyn",
        symbol="I_p",
        jednostka="kA",
        od=0.1,
        do=250.0,
        podstawa_zakresu_pl="IEC 62271-1:2017 p. 5.7 (I_p = 2,5·I_k przy 50 Hz; do 250 kA)",
    ),
    OpisPolaRozdzielnicy(
        klucz="iac_i_a_ka",
        nazwa_pl="prąd próby łukowej klasyfikacji IAC",
        symbol="I_A",
        jednostka="kA",
        od=0.1,
        do=100.0,
        podstawa_zakresu_pl="IEC 62271-200:2021 p. 6.106 (prąd próby łuku wewnętrznego)",
    ),
    OpisPolaRozdzielnicy(
        klucz="iac_t_a_s",
        nazwa_pl="czas próby łukowej klasyfikacji IAC",
        symbol="t_A",
        jednostka="s",
        od=0.1,
        do=3.0,
        podstawa_zakresu_pl=(
            "IEC 62271-200:2021 p. 6.106 (czasy zalecane 0,1 s, 0,5 s, 1 s; do 3 s w kartach)"
        ),
    ),
    OpisPolaRozdzielnicy(
        klucz="odstep_elektrod_mm",
        nazwa_pl="odstęp szyn (elektrod) w przedziale szynowym",
        symbol="G",
        jednostka="mm",
        od=6.35,
        do=254.0,
        podstawa_zakresu_pl=(
            "IEEE 1584-2018 p. 4.2 (zakres ważności modelu: 6,35–76,2 mm do 600 V, "
            "19,05–254 mm od 601 V do 15 kV)"
        ),
    ),
    OpisPolaRozdzielnicy(
        klucz="odleglosc_robocza_mm",
        nazwa_pl="odległość robocza od miejsca łuku",
        symbol="D",
        jednostka="mm",
        od=305.0,
        do=3000.0,
        podstawa_zakresu_pl=(
            "IEEE 1584-2018 p. 4.2 (odległość robocza ≥ 305 mm); górna granica 3000 mm — "
            "obsługa rozdzielnicy wnętrzowej z korytarza"
        ),
    ),
    OpisPolaRozdzielnicy(
        klucz="szerokosc_obudowy_mm",
        nazwa_pl="szerokość obudowy przedziału",
        symbol="W",
        jednostka="mm",
        od=100.0,
        do=5000.0,
        podstawa_zakresu_pl=(
            "IEEE 1584-2018 p. 4.8 (korekcja rozmiaru obudowy; wymiar ponad 1244,6 mm model "
            "ogranicza sam) — zakres fizyczny przedziału rozdzielnicy"
        ),
    ),
    OpisPolaRozdzielnicy(
        klucz="wysokosc_obudowy_mm",
        nazwa_pl="wysokość obudowy przedziału",
        symbol="H",
        jednostka="mm",
        od=100.0,
        do=5000.0,
        podstawa_zakresu_pl=(
            "IEEE 1584-2018 p. 4.8 (korekcja rozmiaru obudowy; wymiar ponad 1244,6 mm model "
            "ogranicza sam) — zakres fizyczny przedziału rozdzielnicy"
        ),
    ),
    OpisPolaRozdzielnicy(
        klucz="glebokosc_obudowy_mm",
        nazwa_pl="głębokość obudowy przedziału",
        symbol="D_o",
        jednostka="mm",
        od=100.0,
        do=5000.0,
        podstawa_zakresu_pl=(
            "IEEE 1584-2018 p. 4.8 (głębokość decyduje o obudowie płytkiej) — zakres fizyczny "
            "przedziału rozdzielnicy"
        ),
    ),
)

OPIS_POLA_ROZDZIELNICY: Mapping[str, OpisPolaRozdzielnicy] = {
    opis.klucz: opis for opis in OPISY_POL_ROZDZIELNICY
}

#: Pola nieliczbowe bloku (słownikowe i tekstowe) — razem z liczbowymi tworzą ZAMKNIĘTY zbiór
#: kluczy bloku (klucz spoza zbioru = odmowa, nie ciche pominięcie).
POLA_SLOWNIKOWE_ROZDZIELNICY: tuple[str, ...] = (
    "iac_dostepnosc",
    "iac_strony",
    "konfiguracja_elektrod",
    "dokument_zrodlowy",
)
KLUCZE_ROZDZIELNICY: tuple[str, ...] = (
    tuple(opis.klucz for opis in OPISY_POL_ROZDZIELNICY) + POLA_SLOWNIKOWE_ROZDZIELNICY
)

#: Nazwy pól słownikowych (komunikaty odmowy i etykiety formularza).
NAZWY_POL_SLOWNIKOWYCH: Mapping[str, str] = {
    "iac_dostepnosc": "rodzaj dostępności klasyfikacji IAC",
    "iac_strony": "strony obudowy objęte klasyfikacją IAC",
    "konfiguracja_elektrod": "konfiguracja elektrod (IEEE 1584)",
    "dokument_zrodlowy": "dokument źródłowy danych rozdzielnicy",
}

#: Słowniki zamknięte pól słownikowych (pole tekstowe swobodne — brak wpisu).
SLOWNIKI_POL_ROZDZIELNICY: Mapping[str, tuple[str, ...]] = {
    "iac_dostepnosc": DOSTEPNOSCI_IAC,
    "konfiguracja_elektrod": KONFIGURACJE_ELEKTROD,
}

#: Analizy, które CZYTAJĄ pole bloku (deklaracja przypięta testem iloczynu cech
#: `tests/application/analyses/test_rozdzielnica_gpz_konsumenci.py`: zmiana pola zmienia wynik
#: każdego zadeklarowanego konsumenta, a żadnego niezadeklarowanego).
KONSUMENT_WYTRZYMALOSC_SZYN = "wytrzymalosc_szyn_sekcji"
KONSUMENT_LUK_ELEKTRYCZNY = "luk_elektryczny"
KONSUMENCI_POL_ROZDZIELNICY: Mapping[str, tuple[str, ...]] = {
    "u_r_kv": (KONSUMENT_WYTRZYMALOSC_SZYN,),
    "i_r_a": (KONSUMENT_WYTRZYMALOSC_SZYN,),
    "i_k_ka": (KONSUMENT_WYTRZYMALOSC_SZYN,),
    "t_k_s": (KONSUMENT_WYTRZYMALOSC_SZYN,),
    "i_p_ka": (KONSUMENT_WYTRZYMALOSC_SZYN,),
    "iac_dostepnosc": (KONSUMENT_WYTRZYMALOSC_SZYN,),
    "iac_strony": (KONSUMENT_WYTRZYMALOSC_SZYN,),
    "iac_i_a_ka": (KONSUMENT_WYTRZYMALOSC_SZYN,),
    "iac_t_a_s": (KONSUMENT_WYTRZYMALOSC_SZYN,),
    "konfiguracja_elektrod": (KONSUMENT_LUK_ELEKTRYCZNY,),
    "odstep_elektrod_mm": (KONSUMENT_LUK_ELEKTRYCZNY,),
    "odleglosc_robocza_mm": (KONSUMENT_LUK_ELEKTRYCZNY,),
    "szerokosc_obudowy_mm": (KONSUMENT_LUK_ELEKTRYCZNY,),
    "wysokosc_obudowy_mm": (KONSUMENT_LUK_ELEKTRYCZNY,),
    "glebokosc_obudowy_mm": (KONSUMENT_LUK_ELEKTRYCZNY,),
    "dokument_zrodlowy": (KONSUMENT_WYTRZYMALOSC_SZYN, KONSUMENT_LUK_ELEKTRYCZNY),
}

#: Operacja i ścieżka zapisu bloku (jedyny pisarz) — tablica parytetu podaje je frontendowi.
OPERACJA_ZAPISU_ROZDZIELNICY = "update_gpz_section"
SCIEZKA_ZAPISU_ROZDZIELNICY = "updates.rozdzielnica"


def _liczba_pl(wartosc: float) -> str:
    return f"{wartosc:.6g}".replace(".", ",")


def _blad_liczby(opis: OpisPolaRozdzielnicy, wartosc: object) -> str | None:
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return f"Pole „{opis.nazwa_pl}” ({opis.symbol}) musi być liczbą w {opis.jednostka}."
    liczba = float(wartosc)
    if not math.isfinite(liczba) or liczba < opis.od or liczba > opis.do:
        return (
            f"Pole „{opis.nazwa_pl}” ({opis.symbol}) = {wartosc!r} {opis.jednostka} leży poza "
            f"zakresem {_liczba_pl(opis.od)}–{_liczba_pl(opis.do)} {opis.jednostka} "
            f"({opis.podstawa_zakresu_pl})."
        )
    return None


def blad_pola_rozdzielnicy(klucz: str, wartosc: object) -> str | None:
    """Powód odmowy wartości JEDNEGO pola bloku po polsku albo ``None`` (wartość dopuszczalna).

    ``None`` jako wartość jest zawsze dopuszczalny (dana nienadana)."""
    if wartosc is None:
        return None
    opis = OPIS_POLA_ROZDZIELNICY.get(klucz)
    if opis is not None:
        return _blad_liczby(opis, wartosc)
    if klucz == "konfiguracja_elektrod":
        if wartosc not in KONFIGURACJE_ELEKTROD:
            return (
                f"Konfiguracja elektrod {wartosc!r} spoza IEEE 1584-2018 "
                f"(dozwolone: {', '.join(KONFIGURACJE_ELEKTROD)})."
            )
        return None
    if klucz == "iac_dostepnosc":
        if wartosc not in DOSTEPNOSCI_IAC:
            return (
                f"Rodzaj dostępności IAC {wartosc!r} spoza IEC 62271-200 "
                f"(dozwolone: {', '.join(DOSTEPNOSCI_IAC)})."
            )
        return None
    if klucz == "iac_strony":
        if not isinstance(wartosc, str) or not wartosc or not _WZOR_STRON_IAC.match(wartosc):
            return (
                f"Strony obudowy IAC {wartosc!r} — podaj litery F (przód), L (bok), R (tył) "
                "w kolejności normy, np. „FLR” (IEC 62271-200 zał. AA)."
            )
        return None
    if klucz == "dokument_zrodlowy":
        if not isinstance(wartosc, str) or not wartosc.strip():
            return (
                "Dokument źródłowy danych rozdzielnicy podaje się tekstem (np. numer karty "
                "katalogowej albo DTR producenta)."
            )
        return None
    return (
        f"Klucz {klucz!r} nie należy do danych znamionowych rozdzielnicy sekcji GPZ "
        f"(dozwolone: {', '.join(KLUCZE_ROZDZIELNICY)})."
    )


def blad_spojnosci_rozdzielnicy(blok: Mapping[str, Any]) -> str | None:
    """Sprzeczność między polami bloku (fizyczna niemożliwość danych znamionowych).

    Prąd szczytowy wytrzymywany jest z definicji szczytem prądu krótkotrwałego: przebieg
    zwarcia o wartości skutecznej I_k ma szczyt co najmniej √2·I_k (składowa okresowa bez
    składowej nieokresowej), więc karta z I_p < √2·I_k jest wewnętrznie sprzeczna (IEC
    62271-1:2017 p. 5.7: I_p = 2,5·I_k przy 50 Hz). Sprawdzenie relacji to porównanie danych
    wejściowych, nie obliczenie sieci."""
    i_k = blok.get("i_k_ka")
    i_p = blok.get("i_p_ka")
    if isinstance(i_k, int | float) and isinstance(i_p, int | float):
        if float(i_p) < math.sqrt(2.0) * float(i_k):
            return (
                f"Prąd szczytowy wytrzymywany I_p = {_liczba_pl(float(i_p))} kA jest mniejszy "
                f"od szczytu prądu krótkotrwałego √2·I_k = {_liczba_pl(math.sqrt(2.0) * i_k)} kA "
                "— dane rozdzielnicy są sprzeczne (IEC 62271-1:2017 p. 5.7)."
            )
    return None


def waliduj_rozdzielnice(blok: object) -> tuple[dict[str, Any] | None, str | None]:
    """Zwraca ``(blok_znormalizowany, blad)`` — JEDYNA brama bloku rozdzielnicy sekcji GPZ.

    ``None`` = usunięcie bloku (dana nienadana). Blok musi być słownikiem o kluczach z
    ``KLUCZE_ROZDZIELNICY``; pola ``None`` są pomijane (exclude_none — blok pusty to ``None``).
    Liczby całkowite zapisywane są jako ``float`` (jedna postać w odcisku modelu)."""
    if blok is None:
        return None, None
    if not isinstance(blok, Mapping):
        return None, "Dane znamionowe rozdzielnicy sekcji podaje się jako zestaw pól."
    wynik: dict[str, Any] = {}
    for klucz in sorted(blok, key=str):
        wartosc = blok[klucz]
        blad = blad_pola_rozdzielnicy(str(klucz), wartosc)
        if blad is not None:
            return None, blad
        if wartosc is None:
            continue
        if str(klucz) in OPIS_POLA_ROZDZIELNICY:
            wynik[str(klucz)] = float(wartosc)
        elif str(klucz) == "dokument_zrodlowy":
            wynik[str(klucz)] = str(wartosc).strip()
        else:
            wynik[str(klucz)] = wartosc
    blad = blad_spojnosci_rozdzielnicy(wynik)
    if blad is not None:
        return None, blad
    return (wynik or None), None


def eksport_parytetu_rozdzielnicy() -> dict[str, Any]:
    """Tablica parytetu opisu pól dla lustra frontendu (``rozdzielnica_gpz_parytet_v1.json``).

    Deterministyczna (kolejność opisu pól, potem pól słownikowych); każde pole niesie klucz
    modelu, nazwę, jednostkę, zakres z podstawą albo słownik oraz analizy-konsumentów."""
    # Import w funkcji: `enm.operator_sieci` importuje `enm.models`, które importuje ten moduł.
    from enm.operator_sieci import opis_pola_operatora_sieci

    pola: list[dict[str, Any]] = []
    for opis in OPISY_POL_ROZDZIELNICY:
        pola.append(
            {
                "klucz": opis.klucz,
                "rodzaj": "liczba",
                "nazwa_pl": opis.nazwa_pl,
                "symbol": opis.symbol,
                "jednostka": opis.jednostka,
                "od": opis.od,
                "do": opis.do,
                "podstawa_zakresu_pl": opis.podstawa_zakresu_pl,
                "konsumenci": list(KONSUMENCI_POL_ROZDZIELNICY[opis.klucz]),
            }
        )
    for klucz in POLA_SLOWNIKOWE_ROZDZIELNICY:
        slownik = SLOWNIKI_POL_ROZDZIELNICY.get(klucz)
        pola.append(
            {
                "klucz": klucz,
                "rodzaj": "slownik" if slownik is not None else "tekst",
                "nazwa_pl": NAZWY_POL_SLOWNIKOWYCH[klucz],
                "dozwolone": list(slownik) if slownik is not None else None,
                "wzor": _WZOR_STRON_IAC.pattern if klucz == "iac_strony" else None,
                "konsumenci": list(KONSUMENCI_POL_ROZDZIELNICY[klucz]),
            }
        )
    return {
        "$id": "rozdzielnica_gpz_parytet_v1",
        "karta": "GPZ-DANE-ANALIZ",
        "opis_pl": (
            "Opis pól danych znamionowych rozdzielnicy sekcji GPZ (GPZSection.rozdzielnica) — "
            "jedno źródło: backend/src/enm/rozdzielnica_gpz.py; lustro: "
            "frontend/src/ui/workspace/gpz/poleGpzDefinicje.ts. Plik generuje "
            "backend/scripts/eksport_parytetu_rozdzielnicy_gpz.py."
        ),
        "operacja": OPERACJA_ZAPISU_ROZDZIELNICY,
        "sciezka": SCIEZKA_ZAPISU_ROZDZIELNICY,
        "kod_bledu": KOD_BLEDU_ROZDZIELNICY,
        "pola": pola,
        # Dodatek karty GPZ-DANE-ANALIZ: operator sieci — jedna dana modelu na poziomie sieci
        # (warunki przyłączenia), pole konfiguratora GPZ „Operator sieci”.
        "pole_operatora_sieci": opis_pola_operatora_sieci(),
    }
