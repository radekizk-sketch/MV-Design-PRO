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
"""

from __future__ import annotations

from dataclasses import dataclass

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
                    f"Wspolczynnik {pole} musi lezec w zakresie (0; 1,5] — otrzymano {wartosc}."
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
                "Obciazalnosc przyjeta dla WARUNKOW KATALOGOWYCH (bez korekty ulozenia); "
                "w rzeczywistej trasie moze byc mniejsza."
            )
        return (
            f"Obciazalnosc skorygowana dla warunkow: {self.etykieta_pl}; "
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
    podstawa="Obciazalnosc znamionowa z karty katalogowej producenta (warunki odniesienia).",
)

# Wartosci z dokumentacji projektowej uzywanej przez ten produkt: arkusz doborowy
# MT880 v3 (sekcja 1 „Dobor kabli na dlugotrwala obciazalnosc") oraz standard
# ENEA „Dobor kabli SN" 2021-06-30. Zestaw opisuje JEDEN konkretny przypadek
# ulozenia — nie wolno go stosowac do innych warunkow przez skalowanie.
ZIEMIA_3_KABLE_200MM = WspolczynnikiObciazalnosci(
    nazwa=NAZWA_ZIEMIA_3_KABLE_200MM,
    etykieta_pl=(
        "Ziemia, 3 kable jednozylowe w jednej warstwie, odstep 200 mm, "
        "rezystywnosc gruntu 1,5 K·m/W, temperatura gruntu 20°C"
    ),
    f_grunt=0.90,
    f_wiazka=1.01,
    f_grupa=0.82,
    podstawa="Arkusz doborowy MT880 v3, sekcja 1; standard ENEA „Dobor kabli SN” 2021-06-30.",
)

ZESTAWY_WARUNKOW: dict[str, WspolczynnikiObciazalnosci] = {
    WARUNKI_KATALOGOWE.nazwa: WARUNKI_KATALOGOWE,
    ZIEMIA_3_KABLE_200MM.nazwa: ZIEMIA_3_KABLE_200MM,
}

# Powod, dla ktorego lista jest krotka — zapisany w kodzie, zeby nie wygladala na pelna.
OGRANICZENIE_ZESTAWOW_PL = (
    "Lista zestawow zawiera wylacznie warunki o udokumentowanej podstawie w tym "
    "repozytorium. Dla innych warunkow ulozenia podaj wspolczynniki WPROST "
    "(z wlasnej dokumentacji projektowej) — system nie interpoluje miedzy zestawami, "
    "bo nie ma tablic IEC 60287."
)


def zestaw_warunkow(nazwa: str) -> WspolczynnikiObciazalnosci:
    """Zestaw wspolczynnikow po nazwie. ``ValueError`` dla nieznanej nazwy (fail-closed)."""
    zestaw = ZESTAWY_WARUNKOW.get(nazwa)
    if zestaw is None:
        dostepne = ", ".join(sorted(ZESTAWY_WARUNKOW))
        raise ValueError(
            f"Nieznany zestaw warunkow ulozenia: {nazwa}. Dostepne: {dostepne}. "
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
        raise ValueError("Wspolczynniki wlasne wymagaja opisu warunkow ulozenia.")
    return WspolczynnikiObciazalnosci(
        nazwa=NAZWA_WLASNE,
        etykieta_pl=opis_pl.strip(),
        f_grunt=f_grunt,
        f_wiazka=f_wiazka,
        f_grupa=f_grupa,
        podstawa="Wspolczynniki podane przez projektanta (dokumentacja projektowa).",
    )


def obciazalnosc_skorygowana(
    obciazalnosc_katalogowa_a: float, wspolczynniki: WspolczynnikiObciazalnosci
) -> float:
    """I'z = Iz · f_grunt · f_wiazka · f_grupa."""
    if obciazalnosc_katalogowa_a <= 0.0:
        raise ValueError("Obciazalnosc katalogowa musi byc dodatnia.")
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
            "Wlasne warunki ulozenia wymagaja trzech wspolczynnikow "
            "(f_grunt, f_wiazka, f_grupa) oraz opisu warunkow."
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
