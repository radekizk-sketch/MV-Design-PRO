"""Korekta obciazalnosci dlugotrwalej kabla wg WARUNKOW ULOZENIA (karta F-K7, V12K-207).

ZNALEZISKO Z6 audytu FLOW. `propose_mv_cable` porownywal prad obliczeniowy z
obciazalnoscia KATALOGOWA wprost. Obciazalnosc katalogowa obowiazuje dla warunkow
ODNIESIENIA producenta (rezystywnosc cieplna gruntu, temperatura otoczenia, glebokosc
ulozenia, brak grupowania). W rzeczywistej trasie warunki sa inne i obciazalnosc jest
MNIEJSZA, wiec dobor bez korekty jest optymistyczny — a nigdzie nie bylo napisane, ze
wynik dotyczy warunkow katalogowych.

ZASADA TEGO MODULU: liczby nie powstaja tutaj. Wspolczynnik pochodzi ALBO z nazwanego
zestawu warunkow o UDOKUMENTOWANEJ podstawie, ALBO jest podany WPROST przez projektanta
(wtedy podstawa jest jego dokumentacja i tak to jest opisane w zalozeniach). Nie ma
interpolacji miedzy zestawami: repozytorium nie zawiera tablic IEC 60287, a zgadniecie
wspolczynnika zamienia dobor w liczbe bez podstawy — dokladnie to, czego zakazuje
regula braku fabrykacji.

Domyslnie obowiazuje zestaw „warunki katalogowe" (iloczyn 1,0), wiec dolozenie tego
modulu NIE zmienia zadnego dotychczasowego wyniku; zmienia sie tylko to, ze zalozenie
jest od teraz JAWNE w sladzie WHITE BOX.

---

KARTA P0.5a (nN, docs/nn/H_PLAN_IMPLEMENTACJI_NN.md P0.5, luka G-08/G-D1).
REGULA KLASA, NIE INSTANCJA: do tej karty istnialy DWIE rownolegle struktury
liczace obciazalnosc skorygowana — ten modul (SN) i
`network_model.catalog.lv_ampacity_iec60364_5_52` (nN, P0.2, rejestr G-D1
byl wtedy PUSTY). Rozstrzygniecie: fizyka (skladanie wspolczynnikow, mnozenie,
Iz' = Iz * iloczyn) zyje WYLACZNIE tutaj — dla SN (ta sekcja, bez zmian) i dla
nN (sekcja ponizej). Modul katalogowy zostal PRZEPISANY na czysty nosnik DANYCH
tablic normy PN-HD 60364-5-52 (rejestry `TABLICA_*`) — nie eksportuje zadnej
funkcji liczacej. `obciazalnosc_skorygowana` ponizej jest JEDYNYM miejscem
mnozenia Iz * wspolczynniki.iloczyn w calym repozytorium (SN i nN dziela ta
sama funkcje przez strukturalne typowanie — patrz `WspolczynnikiKorekcyjne`).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

from network_model.catalog import lv_ampacity_iec60364_5_52 as _tablice_nn

# ---------------------------------------------------------------------------
# Wspolny "ksztalt" wspolczynnikow korekcyjnych (SN i nN) — JEDNO miejsce
# mnozenia Iz * iloczyn w calym repozytorium (patrz `obciazalnosc_skorygowana`
# nizej). SN (`WspolczynnikiObciazalnosci`) i nN (`WspolczynnikiObciazalnosciNN`)
# spelniaja ten protokol strukturalnie — nie ma dziedziczenia, bo maja rozne
# pola zrodlowe (SN: trzy wspolczynniki nazwanego scenariusza; nN: trzy
# wspolczynniki skladane z niezaleznych tablic normy), ale IDENTYCZNY sposob
# uzycia w rachunku Iz'.
# ---------------------------------------------------------------------------


class WspolczynnikiKorekcyjne(Protocol):
    """Cokolwiek niesie gotowy iloczyn wspolczynnikow korekcyjnych obciazalnosci."""

    @property
    def iloczyn(self) -> float: ...


# ---------------------------------------------------------------------------
# Wspolczynniki korekcyjne
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class WspolczynnikiObciazalnosci:
    """Zestaw wspolczynnikow korekcyjnych obciazalnosci dlugotrwalej.

    Nazwy odpowiadaja praktyce doborowej sieci SN:
      * `f_grunt`  — rezystywnosc cieplna gruntu, temperatura otoczenia, glebokosc,
      * `f_wiazka` — liczba kabli obciazonych w tej samej wiazce/rurze,
      * `f_grupa`  — ulozenie rownolegle wielu kabli (odstep miedzy nimi).

    Iloczyn tych trzech mnozy obciazalnosc katalogowa. Kazdy zestaw MUSI podac
    `podstawa` — dokument albo norme, z ktorej wartosci pochodza.
    """

    nazwa: str
    etykieta_pl: str
    f_grunt: float
    f_wiazka: float
    f_grupa: float
    podstawa: str

    def __post_init__(self) -> None:
        for pole, wartosc in (
            ("f_grunt", self.f_grunt),
            ("f_wiazka", self.f_wiazka),
            ("f_grupa", self.f_grupa),
        ):
            if not 0.0 < wartosc <= 1.5:
                raise ValueError(
                    f"Współczynnik {pole} musi leżeć w zakresie (0; 1,5] — otrzymano {wartosc}."
                )

    @property
    def iloczyn(self) -> float:
        """Sumaryczny wspolczynnik korekcyjny obciazalnosci."""
        return self.f_grunt * self.f_wiazka * self.f_grupa

    @property
    def bez_korekty(self) -> bool:
        """Czy zestaw odpowiada warunkom katalogowym (brak korekty)."""
        return self.f_grunt == 1.0 and self.f_wiazka == 1.0 and self.f_grupa == 1.0

    def zalozenie_pl(self) -> str:
        """Jedno zdanie do sladu WHITE BOX — co przyjeto i skad."""
        if self.bez_korekty:
            return (
                "Obciążalność przyjęta dla WARUNKÓW KATALOGOWYCH (bez korekty ułożenia); "
                "w rzeczywistej trasie może być mniejsza."
            )
        return (
            f"Obciążalność skorygowana dla warunków: {self.etykieta_pl}; "
            f"f_grunt = {self.f_grunt:g}, f_wiazka = {self.f_wiazka:g}, "
            f"f_grupa = {self.f_grupa:g}, iloczyn = {self.iloczyn:.4f}. "
            f"Podstawa: {self.podstawa}."
        )


# ---------------------------------------------------------------------------
# Nazwane zestawy warunkow — WYLACZNIE z udokumentowana podstawa
# ---------------------------------------------------------------------------

NAZWA_WARUNKI_KATALOGOWE = "warunki_katalogowe"
NAZWA_ZIEMIA_3_KABLE_200MM = "ziemia_3_kable_warstwa_200mm"
# Nazwa zarezerwowana dla wspolczynnikow podanych WPROST przez projektanta. NIE nalezy
# do `ZESTAWY_WARUNKOW` (nie ma stalych wartosci), ale warstwy wyzsze musza ja rozpoznac,
# zeby wiedziec, ze maja odczytac trzy wspolczynniki i opis z wejscia.
NAZWA_WLASNE = "wlasne"

WARUNKI_KATALOGOWE = WspolczynnikiObciazalnosci(
    nazwa=NAZWA_WARUNKI_KATALOGOWE,
    etykieta_pl="Warunki katalogowe (bez korekty)",
    f_grunt=1.0,
    f_wiazka=1.0,
    f_grupa=1.0,
    podstawa="Obciążalność znamionowa z karty katalogowej producenta (warunki odniesienia).",
)

# Wartosci z dokumentacji projektowej uzywanej przez ten produkt: arkusz doborowy
# MT880 v3 (sekcja 1 „Dobor kabli na dlugotrwala obciazalnosc") oraz standard
# ENEA „Dobor kabli SN" 2021-06-30. Zestaw opisuje JEDEN konkretny przypadek
# ulozenia — nie wolno go stosowac do innych warunkow przez skalowanie.
ZIEMIA_3_KABLE_200MM = WspolczynnikiObciazalnosci(
    nazwa=NAZWA_ZIEMIA_3_KABLE_200MM,
    etykieta_pl=(
        "Ziemia, 3 kable jednożyłowe w jednej warstwie, odstęp 200 mm, "
        "rezystywność gruntu 1,5 K·m/W, temperatura gruntu 20°C"
    ),
    f_grunt=0.90,
    f_wiazka=1.01,
    f_grupa=0.82,
    podstawa="Arkusz doborowy MT880 v3, sekcja 1; standard ENEA „Dobór kabli SN” 2021-06-30.",
)

ZESTAWY_WARUNKOW: dict[str, WspolczynnikiObciazalnosci] = {
    WARUNKI_KATALOGOWE.nazwa: WARUNKI_KATALOGOWE,
    ZIEMIA_3_KABLE_200MM.nazwa: ZIEMIA_3_KABLE_200MM,
}

# Powod, dla ktorego lista jest krotka — zapisany w kodzie, zeby nie wygladala na pelna.
OGRANICZENIE_ZESTAWOW_PL = (
    "Lista zestawów zawiera wyłącznie warunki o udokumentowanej podstawie w tym "
    "repozytorium. Dla innych warunków ułożenia podaj współczynniki WPROST "
    "(z własnej dokumentacji projektowej) — system nie interpoluje między zestawami, "
    "bo nie ma tablic IEC 60287."
)


def zestaw_warunkow(nazwa: str) -> WspolczynnikiObciazalnosci:
    """Zestaw wspolczynnikow po nazwie. ``ValueError`` dla nieznanej nazwy (fail-closed)."""
    zestaw = ZESTAWY_WARUNKOW.get(nazwa)
    if zestaw is None:
        dostepne = ", ".join(sorted(ZESTAWY_WARUNKOW))
        raise ValueError(
            f"Nieznany zestaw warunków ułożenia: {nazwa}. Dostępne: {dostepne}. "
            f"{OGRANICZENIE_ZESTAWOW_PL}"
        )
    return zestaw


def wspolczynniki_wlasne(
    *, f_grunt: float, f_wiazka: float, f_grupa: float, opis_pl: str
) -> WspolczynnikiObciazalnosci:
    """Wspolczynniki podane WPROST przez projektanta (podstawa: jego dokumentacja).

    `opis_pl` jest wymagany: bez opisu warunkow wynik doboru nie dalby sie obronic
    w dokumentacji projektu — a to jest jedyny powod, dla ktorego korekta istnieje.
    """
    if not opis_pl or not opis_pl.strip():
        raise ValueError("Współczynniki własne wymagają opisu warunków ułożenia.")
    return WspolczynnikiObciazalnosci(
        nazwa=NAZWA_WLASNE,
        etykieta_pl=opis_pl.strip(),
        f_grunt=f_grunt,
        f_wiazka=f_wiazka,
        f_grupa=f_grupa,
        podstawa="Współczynniki podane przez projektanta (dokumentacja projektowa).",
    )


def obciazalnosc_skorygowana(
    obciazalnosc_katalogowa_a: float, wspolczynniki: WspolczynnikiKorekcyjne
) -> float:
    """I'z = Iz · iloczyn wspolczynnikow korekcyjnych.

    JEDYNE miejsce mnozenia obciazalnosci katalogowej przez wspolczynniki
    korekcyjne w calym repozytorium (karta P0.5a, regula KLASA NIE INSTANCJA).
    Dziala zarowno dla SN (`WspolczynnikiObciazalnosci`), jak i nN
    (`WspolczynnikiObciazalnosciNN`) — obie klasy spelniaja strukturalnie
    `WspolczynnikiKorekcyjne` (maja `.iloczyn`), wiec nie ma drugiej
    implementacji tego samego mnozenia gdziekolwiek indziej.
    """
    if obciazalnosc_katalogowa_a <= 0.0:
        raise ValueError("Obciążalność katalogowa musi być dodatnia.")
    return obciazalnosc_katalogowa_a * wspolczynniki.iloczyn


def wspolczynniki_z_opisu(
    nazwa: str | None,
    *,
    f_grunt: float | None = None,
    f_wiazka: float | None = None,
    f_grupa: float | None = None,
    opis_pl: str | None = None,
) -> WspolczynnikiObciazalnosci:
    """Zestaw wspolczynnikow z OPISU warunkow (nazwa zestawu albo wartosci wprost).

    JEDNO miejsce, w ktorym warstwy wyzsze (API doboru, operacja domenowa materializujaca
    kabel, raport zgodnosci) zamieniaja opis warunkow na wspolczynniki. Bez tego kazda z
    nich odtwarzalaby te sama regule osobno i mogly sie rozjechac — a wtedy raport
    zgodnosci zglaszalby ODSTEPSTWO od propozycji, ktora sam liczy inaczej niz kreator.

    `nazwa` puste/None == warunki katalogowe (zachowanie dotychczasowe co do bitu).
    """
    if nazwa is None or not str(nazwa).strip():
        return WARUNKI_KATALOGOWE
    klucz = str(nazwa).strip()
    if klucz != NAZWA_WLASNE:
        return zestaw_warunkow(klucz)
    if f_grunt is None or f_wiazka is None or f_grupa is None:
        raise ValueError(
            "Własne warunki ułożenia wymagają trzech współczynników "
            "(f_grunt, f_wiazka, f_grupa) oraz opisu warunków."
        )
    return wspolczynniki_wlasne(
        f_grunt=f_grunt,
        f_wiazka=f_wiazka,
        f_grupa=f_grupa,
        opis_pl=opis_pl or "",
    )


def widok_zestawow() -> dict[str, object]:
    """Dane dla warstwy prezentacji: lista zestawow + powod krotkiej listy.

    Kreator NIE MOZE miec wlasnej listy warunkow ulozenia — wartosci wspolczynnikow sa
    danymi doborowymi, a nie tekstem interfejsu. Jedno zrodlo: ten widok.
    """
    return {
        "sets": [
            {
                "name": zestaw.nazwa,
                "label_pl": zestaw.etykieta_pl,
                "f_grunt": zestaw.f_grunt,
                "f_wiazka": zestaw.f_wiazka,
                "f_grupa": zestaw.f_grupa,
                "total": zestaw.iloczyn,
                "basis": zestaw.podstawa,
                "assumption_pl": zestaw.zalozenie_pl(),
            }
            for zestaw in sorted(ZESTAWY_WARUNKOW.values(), key=lambda item: item.nazwa)
        ],
        "custom_name": NAZWA_WLASNE,
        "default_name": NAZWA_WARUNKI_KATALOGOWE,
        "limitation_pl": OGRANICZENIE_ZESTAWOW_PL,
    }


# ---------------------------------------------------------------------------
# nN: Iz' wg PN-HD 60364-5-52 (karta P0.5a, luka G-08/G-D1)
# ---------------------------------------------------------------------------
#
# Rozniki wobec SN powyzej: SN uzywa nazwanych ZESTAWOW (caly przypadek ulozenia
# ma jedna nazwe i trzy stale wspolczynniki z jednego dokumentu projektowego).
# nN sklada Iz' z NIEZALEZNYCH tablic normy PN-HD 60364-5-52 — temperatura,
# rezystywnosc gruntu i grupowanie dobierane sa OSOBNO, bo tak dziala norma
# (projektant wybiera srodowisko, izolacje, temperature, liczbe obwodow —
# kazdy wybor trafia do INNEJ tablicy). Zloto sklada `wspolczynniki_nn` (jedno
# miejsce skladania, wzorzec `wspolczynniki_z_opisu` dla SN); mnozenie i tak
# idzie przez WSPOLNA `obciazalnosc_skorygowana` powyzej.

Srodowisko = Literal["powietrze", "grunt"]
Izolacja = Literal["PVC", "XLPE"]

_SRODOWISKA_NN: tuple[Srodowisko, ...] = ("powietrze", "grunt")
_IZOLACJE_NN: tuple[Izolacja, ...] = ("PVC", "XLPE")


@dataclass(frozen=True)
class WspolczynnikiObciazalnosciNN:
    """Zestaw wspolczynnikow korekcyjnych Iz' kabla nN, zlozony z tablic normy.

    Zgodnie z PN-HD 60364-5-52: Iz' = Iz_katalogowe * f_temperatura *
    f_rezystywnosc_gruntu * f_grupowanie. `f_rezystywnosc_gruntu` = 1,0
    (neutralne, brak korekty) dla ulozenia w powietrzu — rezystywnosc gruntu
    nie dotyczy tego srodowiska, co jest INFORMACJA, nie brakiem danej.
    """

    srodowisko: Srodowisko
    izolacja: Izolacja
    temperatura_c: float
    liczba_obwodow: int
    rezystywnosc_gruntu_km_w: float | None
    f_temperatura: float
    f_rezystywnosc_gruntu: float
    f_grupowanie: float
    podstawa_temperatura: str
    podstawa_rezystywnosc: str | None
    podstawa_grupowanie: str

    def __post_init__(self) -> None:
        for pole, wartosc in (
            ("f_temperatura", self.f_temperatura),
            ("f_rezystywnosc_gruntu", self.f_rezystywnosc_gruntu),
            ("f_grupowanie", self.f_grupowanie),
        ):
            if not 0.0 < wartosc <= 1.3:
                raise ValueError(
                    f"Współczynnik {pole} musi leżeć w zakresie (0; 1,3] — otrzymano {wartosc}."
                )

    @property
    def iloczyn(self) -> float:
        """Sumaryczny wspolczynnik korekcyjny obciazalnosci Iz'/Iz."""
        return self.f_temperatura * self.f_rezystywnosc_gruntu * self.f_grupowanie

    @property
    def bez_korekty(self) -> bool:
        """Czy zlozenie odpowiada warunkom odniesienia normy (brak korekty)."""
        return (
            self.f_temperatura == 1.0
            and self.f_rezystywnosc_gruntu == 1.0
            and self.f_grupowanie == 1.0
        )

    def zalozenie_pl(self) -> str:
        """Jedno zdanie do sladu WHITE BOX — co przyjeto i skad (nN)."""
        if self.bez_korekty:
            return (
                "Obciążalność Iz przyjęta dla WARUNKÓW ODNIESIENIA normy "
                "PN-HD 60364-5-52 (bez korekty); w rzeczywistej instalacji może być mniejsza."
            )
        opis_srodowiska = (
            f"powietrze {self.temperatura_c:g}°C"
            if self.srodowisko == "powietrze"
            else (
                f"grunt {self.temperatura_c:g}°C, rezystywność "
                f"{self.rezystywnosc_gruntu_km_w:g} K·m/W"
            )
        )
        return (
            f"Obciążalność Iz' skorygowana dla: {opis_srodowiska}, izolacja "
            f"{self.izolacja}, {self.liczba_obwodow} obwód(ów); "
            f"f_temperatura = {self.f_temperatura:g}, "
            f"f_rezystywność_gruntu = {self.f_rezystywnosc_gruntu:g}, "
            f"f_grupowanie = {self.f_grupowanie:g}, iloczyn = {self.iloczyn:.4f}."
        )


def _wpis_tablicy_temperatury_nn(
    *, srodowisko: Srodowisko, izolacja: Izolacja, temperatura_c: float
) -> _tablice_nn.WpisNormyNN:
    """Wpis tablicy korekty temperatury (powietrze albo grunt). Fail-closed."""
    klucz_temp = int(round(temperatura_c))
    tablica = (
        _tablice_nn.TABLICA_TEMPERATURY_POWIETRZE_NN
        if srodowisko == "powietrze"
        else _tablice_nn.TABLICA_TEMPERATURY_GRUNTU_NN
    )
    wpis = tablica.get((izolacja, klucz_temp))
    if wpis is None:
        dostepne = sorted(temp for (iz, temp) in tablica if iz == izolacja)
        raise ValueError(
            f"Brak zweryfikowanej korekty temperatury dla środowiska '{srodowisko}', "
            f"izolacji {izolacja}, {temperatura_c:g}°C w rejestrze G-D1. "
            f"Dostępne temperatury dla {izolacja} ({srodowisko}): {dostepne}. "
            f"{_tablice_nn.OGRANICZENIE_TABLIC_PL}"
        )
    return wpis


def _wpis_tablicy_rezystywnosci_gruntu_nn(rezystywnosc_km_w: float) -> _tablice_nn.WpisNormyNN:
    """Wpis tablicy korekty rezystywności cieplnej gruntu. Fail-closed."""
    klucz = round(rezystywnosc_km_w, 1)
    wpis = _tablice_nn.TABLICA_REZYSTYWNOSCI_GRUNTU_NN.get(klucz)
    if wpis is None:
        dostepne = sorted(_tablice_nn.TABLICA_REZYSTYWNOSCI_GRUNTU_NN)
        raise ValueError(
            f"Brak zweryfikowanej korekty rezystywności cieplnej gruntu dla "
            f"{rezystywnosc_km_w:g} K·m/W w rejestrze G-D1. Dostępne wartości: {dostepne}. "
            f"{_tablice_nn.OGRANICZENIE_TABLIC_PL}"
        )
    return wpis


def _wpis_tablicy_grupowania_nn(
    *, srodowisko: Srodowisko, liczba_obwodow: int
) -> _tablice_nn.WpisNormyNN:
    """Wpis tablicy korekty grupowania obwodów (powietrze albo grunt). Fail-closed."""
    tablica = (
        _tablice_nn.TABLICA_GRUPOWANIA_POWIETRZE_NN
        if srodowisko == "powietrze"
        else _tablice_nn.TABLICA_GRUPOWANIA_GRUNTU_NN
    )
    wpis = tablica.get(liczba_obwodow)
    if wpis is None:
        dostepne = sorted(tablica)
        raise ValueError(
            f"Brak zweryfikowanej korekty grupowania dla środowiska '{srodowisko}' i "
            f"{liczba_obwodow} obwodów w rejestrze G-D1. Dostępne liczby obwodów: {dostepne}. "
            f"{_tablice_nn.OGRANICZENIE_TABLIC_PL}"
        )
    return wpis


def wspolczynniki_nn(
    *,
    srodowisko: Srodowisko,
    izolacja: Izolacja,
    temperatura_c: float,
    liczba_obwodow: int,
    rezystywnosc_gruntu_km_w: float | None = None,
) -> WspolczynnikiObciazalnosciNN:
    """Zloz wspolczynniki Iz' nN z tablic PN-HD 60364-5-52 (G-D1).

    JEDNO miejsce skladania — wzorzec `wspolczynniki_z_opisu` (SN). Warstwy
    wyzsze (operacja domenowa `set_nn_cable_laying_conditions`, analiza doboru
    nN) NIE odtwarzaja tej reguly osobno, tylko wywoluja te funkcje.

    Fail-closed: nieznana kombinacja (temperatura/rezystywnosc/liczba obwodow
    spoza zweryfikowanego rejestru G-D1) podnosi ``ValueError`` z lista
    dostepnych wartosci — nigdy cichej interpolacji ani przyblizenia.
    """
    if srodowisko not in _SRODOWISKA_NN:
        raise ValueError(
            f"Nieznane środowisko ułożenia: {srodowisko!r}. Dozwolone: {_SRODOWISKA_NN}."
        )
    if izolacja not in _IZOLACJE_NN:
        raise ValueError(f"Nieznany typ izolacji: {izolacja!r}. Dozwolone: {_IZOLACJE_NN}.")
    if liczba_obwodow < 1:
        raise ValueError("Liczba obwodów musi być >= 1.")
    if srodowisko == "grunt" and rezystywnosc_gruntu_km_w is None:
        raise ValueError(
            "Ułożenie w gruncie wymaga rezystywności cieplnej gruntu "
            "(rezystywnosc_gruntu_km_w, K·m/W)."
        )
    if srodowisko == "powietrze" and rezystywnosc_gruntu_km_w is not None:
        raise ValueError(
            "Rezystywność cieplna gruntu nie dotyczy ułożenia w powietrzu "
            "(rezystywnosc_gruntu_km_w musi być None)."
        )

    wpis_temp = _wpis_tablicy_temperatury_nn(
        srodowisko=srodowisko, izolacja=izolacja, temperatura_c=temperatura_c
    )
    wpis_grupa = _wpis_tablicy_grupowania_nn(srodowisko=srodowisko, liczba_obwodow=liczba_obwodow)

    if srodowisko == "grunt":
        assert rezystywnosc_gruntu_km_w is not None  # walidacja wyzej
        wpis_rezyst = _wpis_tablicy_rezystywnosci_gruntu_nn(rezystywnosc_gruntu_km_w)
        f_rezyst = wpis_rezyst.wartosc
        podstawa_rezyst: str | None = wpis_rezyst.podstawa
    else:
        f_rezyst = 1.0
        podstawa_rezyst = None

    return WspolczynnikiObciazalnosciNN(
        srodowisko=srodowisko,
        izolacja=izolacja,
        temperatura_c=temperatura_c,
        liczba_obwodow=liczba_obwodow,
        rezystywnosc_gruntu_km_w=rezystywnosc_gruntu_km_w,
        f_temperatura=wpis_temp.wartosc,
        f_rezystywnosc_gruntu=f_rezyst,
        f_grupowanie=wpis_grupa.wartosc,
        podstawa_temperatura=wpis_temp.podstawa,
        podstawa_rezystywnosc=podstawa_rezyst,
        podstawa_grupowanie=wpis_grupa.podstawa,
    )
