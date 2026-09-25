"""Reguły werdyktu wyjaśnialnego — JEDYNE miejsce reguły K (§2.2), agregacji W (§2.3),
kompletności dowodu (§3) i marginesu ze skalą (§2.4).

Funkcje są czyste i deterministyczne. Walidatory rekordów w ``werdykt.kontrakt`` wołają TE
SAME funkcje (``wyprowadz_pola_kryterium`` / ``wyprowadz_pola_wymagania``) co konstruktory
wysokiego poziomu (``ocen_kryterium`` / ``zagreguj_wymaganie``), więc rekord zbudowany ręcznie
albo odczytany z JSON przechodzi dokładnie tę samą regułę co rekord zbudowany konstruktorem.

KOLEJNOŚĆ REGUŁ jest danymi (krotki ``_KROKI_REGULY_K`` i ``_KROKI_REGULY_W``), a nie
zagnieżdżeniem warunków: każdy krok zwraca status albo nic oraz braki, które nazwał, a silnik
kroków przyjmuje pierwszy status i zbiera braki ze WSZYSTKICH kroków (każdy brak nazwany po
drodze trafia do ``czego_brakuje`` niezależnie od statusu końcowego). Krok stosowalności kończy
ocenę — dla przedmiotu, do którego kryterium się nie stosuje, nic nie „brakuje". Testy mutacyjne
podmieniają kolejność tych krotek i sprawdzają, że iloczyn cech ją wykrywa (T19).

Tekst braków i powodów składa ``werdykt.wyjasnienie`` (jedyny generator tekstu werdyktu);
ten moduł decyduje, KIEDY brak występuje, i przekazuje generatorowi fakty.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass

from werdykt import etykiety, wyjasnienie
from werdykt.kontrakt import (
    METODY_DOPUSZCZALNE_DLA_TWIERDZENIA,
    METODY_TYLKO_WYMAGANIA,
    RELACJE_LICZBOWE,
    Etykieta,
    KompletnoscDowodu,
    KrokRegulyK,
    KrokRegulyW,
    Kryterium,
    LimitKryterium,
    Margines,
    MetodaDowodu,
    Niepewnosc,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    PokrycieProgramu,
    Przedmiot,
    Relacja,
    RodzajSkali,
    StatusDowodu,
    StatusWerdyktu,
    Stosowalnosc,
    Wielkosc,
    WynikKryterium,
    WynikWymagania,
    ZakresWaznosci,
)
from werdykt.proweniencja import ClaimKind

# ---------------------------------------------------------------------------
# Metody dopuszczalne dla rodzaju twierdzenia (§2.2 krok 2)
# ---------------------------------------------------------------------------


def metody_dopuszczalne(rodzaj_twierdzenia: ClaimKind) -> frozenset[MetodaDowodu]:
    """Metody dowodu, którymi WOLNO ocenić twierdzenie danego rodzaju (§2.2 krok 2).

    Porównanie deklaracji nigdy nie ocenia zachowania dynamicznego: metoda spoza zbioru daje
    ``NIE_OCENIONO`` (wynik pokazywany informacyjnie), niezależnie od wartości wyniku.
    Twierdzenie z obliczenia statycznego ocenia się obliczeniem, pomiarem, raportem z testu,
    certyfikatem albo dowodem łączonym. Tabela: ``kontrakt.METODY_DOPUSZCZALNE_DLA_TWIERDZENIA``.
    """
    return METODY_DOPUSZCZALNE_DLA_TWIERDZENIA[rodzaj_twierdzenia]


def przydatnosc_dowodu_wymagania(
    dowod: StatusDowodu,
    oceny: Sequence[OcenaKryterium],
) -> bool:
    """Przydatność dowodowa dowodu WYMAGANIA (§3 pkt 1) — jeden predykat dla reguły i tekstu.

    Dowód łączony (``DOWOD_LACZONY``) jest przydatny wtedy i tylko wtedy, gdy istnieje co
    najmniej jedna stosowalna ocena składowa (status ≠ ``NIE_DOTYCZY``) i KAŻDA stosowalna ocena
    składowa ma ``dowod.przydatnosc_dowodowa``; składowa ``NIE_DOTYCZY`` nie wykazuje niczego,
    więc nie uczestniczy w łączeniu. Każda inna metoda — ``StatusDowodu.przydatnosc_dowodowa``.
    """
    if dowod.metoda in METODY_TYLKO_WYMAGANIA:
        stosowalne = [o for o in oceny if o.status_maszynowy != "NIE_DOTYCZY"]
        return bool(stosowalne) and all(o.dowod.przydatnosc_dowodowa for o in stosowalne)
    return dowod.przydatnosc_dowodowa


# ---------------------------------------------------------------------------
# Margines (§2.4)
# ---------------------------------------------------------------------------

#: Jednostka marginesu różna od jednostki wyniku: różnica dwóch wielkości w procentach jest
#: w punktach procentowych (§4.1 „margines").
_JEDNOSTKA_MARGINESU: dict[str, str] = {"%": "pp"}


def jednostka_marginesu(jednostka_wyniku: str) -> str:
    """Jednostka marginesu, skali, tolerancji i niepewności dla wyniku w danej jednostce.

    Wynik w ``%`` → ``"pp"`` (punkty procentowe: 89,8 % wobec 90 % to margines −0,2 pp); każda
    inna jednostka — ta sama co jednostka wyniku.
    """
    return _JEDNOSTKA_MARGINESU.get(jednostka_wyniku, jednostka_wyniku)


_DEFINICJE_MARGINESU: dict[Relacja, str] = {
    "NIE_WIECEJ": r"m = x_{\lim} - x",
    "NIE_MNIEJ": r"m = x - x_{\lim}",
    "PASMO": r"m = \min\left(x - x_{\min},\; x_{\max} - x\right)",
    "OBWIEDNIA_DOLNA": r"m = x(t^{*}) - x_{\lim}(t^{*})",
    "OBWIEDNIA_GORNA": r"m = x_{\lim}(t^{*}) - x(t^{*})",
}


def margines(
    relacja: Relacja,
    wynik: Wielkosc,
    limit: LimitKryterium | None,
    *,
    chwila_s: float | None = None,
    punkt_pl: str | None = None,
    tolerancja: Wielkosc | None = None,
    niepewnosc: Wielkosc | None = None,
) -> Margines:
    """Margines wyniku wobec limitu z definicją, punktem i skalą marginesu względnego.

    Definicje: ``NIE_WIECEJ`` m = limit − wynik; ``NIE_MNIEJ`` m = wynik − limit; ``PASMO``
    m = min(wynik − dolna, górna − wynik), a granicą odniesienia jest granica bliższa (przy
    remisie dolna); ``OBWIEDNIA_DOLNA`` m = wynik − obwiednia(t*), ``OBWIEDNIA_GORNA``
    m = obwiednia(t*) − wynik, gdzie wynik jest już ekstremum, a t* = ``chwila_s`` punktu
    krytycznego (obwiednia interpolowana liniowo, bez ekstrapolacji); ``LOGICZNE`` — margines
    niedefiniowalny z powodem (kryterium logiczne nie ma limitu skalarnego).

    Skala marginesu względnego (§2.4), w kolejności pierwszeństwa: tolerancja z profilu, gdy
    podana (``TOLERANCJA``); |granica|, gdy granica ≠ 0 (``LIMIT``); niepewność wyniku ``u``,
    gdy dodatnia (``NIEPEWNOSC``); inaczej brak skali i margines względny ``None``. Jednostki
    wyniku i limitu muszą być identyczne; jednostka marginesu i skali to
    ``jednostka_marginesu(jednostka wyniku)`` (dla wyniku w ``%`` — ``"pp"``), a tolerancja
    i niepewność są podawane w jednostce marginesu — różne jednostki to ``ValueError``, nigdy
    cicha konwersja.
    """
    if relacja == "LOGICZNE":
        if limit is not None or tolerancja is not None:
            raise ValueError(
                "Kryterium logiczne nie ma limitu skalarnego ani tolerancji — margines jest "
                "niedefiniowalny."
            )
        return Margines(
            punkt_pl=punkt_pl,
            niedefiniowalny=True,
            powod_pl=wyjasnienie.powod_marginesu_logicznego(),
        )
    if limit is None:
        raise ValueError(f"Margines relacji {relacja} wymaga limitu.")
    if limit.jednostka != wynik.jednostka:
        raise ValueError(
            f"Jednostka wyniku „{wynik.jednostka}” różni się od jednostki limitu "
            f"„{limit.jednostka}” — porównanie bez konwersji jest niedozwolone."
        )
    x = wynik.wartosc
    if relacja in ("NIE_WIECEJ", "NIE_MNIEJ"):
        if limit.wartosc is None:
            raise ValueError(f"Relacja {relacja} wymaga limitu w postaci wartości.")
        granica = limit.wartosc.wartosc
        m = granica - x if relacja == "NIE_WIECEJ" else x - granica
    elif relacja == "PASMO":
        if limit.pasmo is None:
            raise ValueError("Relacja PASMO wymaga limitu w postaci pasma.")
        dolna, gorna = limit.pasmo[0].wartosc, limit.pasmo[1].wartosc
        od_dolnej, od_gornej = x - dolna, gorna - x
        m, granica = (od_dolnej, dolna) if od_dolnej <= od_gornej else (od_gornej, gorna)
    else:
        if limit.obwiednia is None:
            raise ValueError(f"Relacja {relacja} wymaga limitu w postaci obwiedni.")
        if chwila_s is None:
            raise ValueError(
                "Margines wobec obwiedni wymaga chwili punktu krytycznego (wynik jest ekstremum)."
            )
        granica = limit.wartosc_obwiedni(chwila_s)
        m = x - granica if relacja == "OBWIEDNIA_DOLNA" else granica - x
    jednostka = jednostka_marginesu(wynik.jednostka)
    skala, rodzaj = _skala(granica, tolerancja, niepewnosc, jednostka)
    return Margines(
        wartosc=Wielkosc(wartosc=m, jednostka=jednostka),
        definicja_latex=_DEFINICJE_MARGINESU[relacja],
        punkt_pl=punkt_pl,
        skala=skala,
        skala_rodzaj=rodzaj,
        wzgledny=None if skala is None else m / skala.wartosc,
    )


def _skala(
    granica: float,
    tolerancja: Wielkosc | None,
    niepewnosc: Wielkosc | None,
    jednostka: str,
) -> tuple[Wielkosc | None, RodzajSkali | None]:
    for nazwa, wielkosc in (("tolerancji", tolerancja), ("niepewności", niepewnosc)):
        if wielkosc is not None and wielkosc.jednostka != jednostka:
            raise ValueError(
                f"Jednostka {nazwa} „{wielkosc.jednostka}” różni się od jednostki marginesu "
                f"„{jednostka}” — konwersja jednostek jest niedozwolona."
            )
    if tolerancja is not None:
        if not tolerancja.wartosc > 0.0:
            raise ValueError(f"Tolerancja musi być dodatnia (podano {tolerancja.wartosc}).")
        return tolerancja, "TOLERANCJA"
    if granica != 0.0:
        return Wielkosc(wartosc=abs(granica), jednostka=jednostka), "LIMIT"
    if niepewnosc is not None and niepewnosc.wartosc > 0.0:
        return niepewnosc, "NIEPEWNOSC"
    return None, None


# ---------------------------------------------------------------------------
# Silnik kroków
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _WynikKroku:
    status: StatusWerdyktu | None = None
    braki: tuple[str, ...] = ()
    konczy: bool = False


def _bez_powtorzen(teksty: Sequence[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(teksty))


# ---------------------------------------------------------------------------
# Reguła K (§2.2)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _WejscieK:
    dotyczy: bool
    relacja: Relacja
    podstawa: PodstawaWymagania
    dowod: StatusDowodu
    limit: LimitKryterium | None
    wynik: WynikKryterium | None
    margines: Margines | None
    niepewnosc: Niepewnosc


def _krok_k_stosowalnosc(w: _WejscieK) -> _WynikKroku:
    if not w.dotyczy:
        return _WynikKroku(status="NIE_DOTYCZY", konczy=True)
    return _WynikKroku()


def _krok_k_metoda(w: _WejscieK) -> _WynikKroku:
    dopuszczalne = metody_dopuszczalne(w.dowod.rodzaj_twierdzenia)
    if w.dowod.metoda not in dopuszczalne:
        return _WynikKroku(
            status="NIE_OCENIONO",
            braki=(wyjasnienie.brak_metody_dopuszczalnej(w.dowod, dopuszczalne),),
        )
    return _WynikKroku()


def _krok_k_wynik(w: _WejscieK) -> _WynikKroku:
    if w.wynik is None:
        return _WynikKroku(
            status="NIE_OCENIONO",
            braki=(wyjasnienie.brak_wyniku(jest_metoda=w.dowod.metoda != "BRAK_METODY"),),
        )
    return _WynikKroku()


def _krok_k_podstawa(w: _WejscieK) -> _WynikKroku:
    if w.relacja == "LOGICZNE":
        if w.podstawa.status == "NIEUSTALONE":
            return _WynikKroku(
                status="BRAK_PODSTAWY",
                braki=(wyjasnienie.brak_podstawy_kryterium(w.podstawa),),
            )
        return _WynikKroku()
    if w.limit is None:
        return _WynikKroku(status="BRAK_PODSTAWY", braki=(wyjasnienie.brak_limitu(),))
    if w.limit.podstawa.status == "NIEUSTALONE":
        return _WynikKroku(
            status="BRAK_PODSTAWY",
            braki=(wyjasnienie.brak_podstawy_limitu(w.limit.podstawa),),
        )
    return _WynikKroku()


def _margines_liczbowy(w: _WejscieK) -> Wielkosc | None:
    """Margines skalarny, gdy istnieje; spójność marginesu z wynikiem i limitem sprawdzana."""
    if w.relacja == "LOGICZNE" or w.wynik is None or w.limit is None:
        return None
    if w.margines is None or w.margines.wartosc is None:
        raise ValueError(
            "Wynik i limit relacji liczbowej istnieją, a margines skalarny nie został wyznaczony."
        )
    return w.margines.wartosc


def _krok_k_niejednoznacznosc(w: _WejscieK) -> _WynikKroku:
    m = _margines_liczbowy(w)
    u = w.niepewnosc.wartosc
    if m is None or u is None:
        return _WynikKroku()
    if u.jednostka != m.jednostka:
        raise ValueError(
            f"Jednostka niepewności „{u.jednostka}” różni się od jednostki marginesu "
            f"„{m.jednostka}” — porównanie |m| ≤ u bez konwersji jest niedozwolone."
        )
    if abs(m.wartosc) <= u.wartosc:
        return _WynikKroku(
            status="NIEJEDNOZNACZNY",
            braki=(wyjasnienie.brak_rozstrzygniecia(m, u),),
        )
    return _WynikKroku()


def _krok_k_margines(w: _WejscieK) -> _WynikKroku:
    if w.wynik is None:
        return _WynikKroku()
    if w.relacja == "LOGICZNE":
        stan = w.wynik.wartosc.wartosc
        if stan == 1.0:
            return _WynikKroku(status="SPELNIA")
        if stan == 0.0:
            return _WynikKroku(status="NIE_SPELNIA")
        raise ValueError(f"Wynik kryterium logicznego musi mieć wartość 1.0 albo 0.0 ({stan}).")
    m = _margines_liczbowy(w)
    if m is None:
        return _WynikKroku()
    return _WynikKroku(status="SPELNIA" if m.wartosc >= 0.0 else "NIE_SPELNIA")


_KROKI_REGULY_K: tuple[tuple[KrokRegulyK, Callable[[_WejscieK], _WynikKroku]], ...] = (
    ("STOSOWALNOSC", _krok_k_stosowalnosc),
    ("METODA", _krok_k_metoda),
    ("WYNIK", _krok_k_wynik),
    ("PODSTAWA", _krok_k_podstawa),
    ("NIEJEDNOZNACZNOSC", _krok_k_niejednoznacznosc),
    ("MARGINES", _krok_k_margines),
)


def _rozstrzygnij_kryterium(w: _WejscieK) -> tuple[StatusWerdyktu, KrokRegulyK, tuple[str, ...]]:
    status: StatusWerdyktu | None = None
    krok: KrokRegulyK | None = None
    braki: list[str] = []
    for nazwa, funkcja in _KROKI_REGULY_K:
        wynik_kroku = funkcja(w)
        braki.extend(wynik_kroku.braki)
        if wynik_kroku.status is not None and status is None:
            status, krok = wynik_kroku.status, nazwa
        if wynik_kroku.status is not None and wynik_kroku.konczy:
            break
    if status is None or krok is None:
        raise ValueError("Reguła K nie wyznaczyła statusu — lista kroków reguły jest niekompletna.")
    return status, krok, _bez_powtorzen(braki)


def status_kryterium(
    *,
    dotyczy: bool,
    relacja: Relacja,
    podstawa: PodstawaWymagania,
    dowod: StatusDowodu,
    limit: LimitKryterium | None,
    wynik: WynikKryterium | None,
    margines: Margines | None,
    niepewnosc: Niepewnosc,
) -> tuple[StatusWerdyktu, list[str]]:
    """Status kryterium wg §2.2 i braki nazwane po drodze (reguła K, JEDNO ciało).

    Kolejność: (1) poza stosowalnością → ``NIE_DOTYCZY`` (koniec oceny); (2) metoda dowodu
    niedopuszczalna dla rodzaju twierdzenia → ``NIE_OCENIONO``; (3) brak wyniku →
    ``NIE_OCENIONO``; (4) podstawa ``NIEUSTALONE`` (relacje liczbowe: brak limitu albo
    ``limit.podstawa``; kryterium logiczne: ``podstawa`` kryterium) → ``BRAK_PODSTAWY``;
    (5) |m| ≤ u → ``NIEJEDNOZNACZNY`` (także dla m ≥ 0); (6) m ≥ 0 → ``SPELNIA``, m < 0 →
    ``NIE_SPELNIA``; kryterium logiczne: wartość 1.0 → ``SPELNIA``, 0.0 → ``NIE_SPELNIA``.
    """
    status, _, braki = _rozstrzygnij_kryterium(
        _WejscieK(
            dotyczy=dotyczy,
            relacja=relacja,
            podstawa=podstawa,
            dowod=dowod,
            limit=limit,
            wynik=wynik,
            margines=margines,
            niepewnosc=niepewnosc,
        )
    )
    return status, list(braki)


# ---------------------------------------------------------------------------
# Kompletność dowodu (§3)
# ---------------------------------------------------------------------------


def _powody_niepelnosci(
    dowod: StatusDowodu,
    podstawy: Sequence[PodstawaWymagania],
    powod_metody: str | None,
) -> list[str]:
    """Powody niepełności wspólne dla K i W; powód metody wyznacza wołający z predykatu
    przydatności właściwego dla poziomu rekordu."""
    powody: list[str] = [] if powod_metody is None else [powod_metody]
    if dowod.status_modelu == "UNVALIDATED_MODEL":
        powody.append(wyjasnienie.powod_modelu_niezwalidowanego())
    if dowod.w_domenie_walidacji is False:
        powody.append(wyjasnienie.powod_poza_domena(dowod))
    if dowod.status_danych.stan != "ZWALIDOWANE":
        powody.extend(
            wyjasnienie.powod_danej_przyjetej(dana) for dana in dowod.status_danych.dane_przyjete
        )
    powody.extend(
        wyjasnienie.powod_podstawy_nieustalonej(podstawa)
        for podstawa in podstawy
        if podstawa.status == "NIEUSTALONE"
    )
    return list(_bez_powtorzen(powody))


def kompletnosc_dowodu(
    dowod: StatusDowodu,
    podstawy: Sequence[PodstawaWymagania],
) -> tuple[KompletnoscDowodu, list[str]]:
    """Kompletność dowodu kryterium wg §3 i konkretne powody niepełności.

    ``PELNY`` wyłącznie, gdy: (1) metoda jest właściwa dla rodzaju twierdzenia
    (``StatusDowodu.przydatnosc_dowodowa`` — w tym bieg nie leży poza zadeklarowaną domeną
    walidacji); (2) dane wejściowe zwalidowane — stan ``ZWALIDOWANE``, żadna dana przyjęta
    (także o jakości ``ESTIMATED`` / ``SYSTEM_DEFAULT``); (3) każda podstawa o stanie
    ``ZWERYFIKOWANE`` albo ``WSKAZANE``; ponadto model urządzenia ``UNVALIDATED_MODEL`` (T6)
    i bieg poza domeną walidacji (§3b) zawsze dają ``NIEPELNY``. Każdy powód nazywa warunek
    i wartość.
    """
    powod_metody = None if dowod.przydatnosc_dowodowa else wyjasnienie.powod_metody(dowod, "K")
    powody = _powody_niepelnosci(dowod, podstawy, powod_metody)
    return ("NIEPELNY", powody) if powody else ("PELNY", [])


def _podstawy_kryterium(
    kryterium: Kryterium,
    podstawa: PodstawaWymagania,
    limit: LimitKryterium | None,
) -> list[PodstawaWymagania]:
    """Podstawy, na których opiera się ocena kryterium: podstawa kryterium, podstawa limitu
    (relacje liczbowe) i podstawa warunku wstępnego (gdy kryterium go ma) — w tej kolejności.
    Zastrzeżenia (``wyjasnienie.zastrzezenia_kryterium``) nazywają każdą z nich o stanie
    ≠ ``ZWERYFIKOWANE`` — podstawę warunku wstępnego zdaniem o warunku wstępnym."""
    podstawy = [podstawa]
    if limit is not None:
        podstawy.append(limit.podstawa)
    if kryterium.warunek_wstepny_podstawa is not None:
        podstawy.append(kryterium.warunek_wstepny_podstawa)
    return podstawy


def kompletnosc_kryterium(
    *,
    dotyczy: bool,
    kryterium: Kryterium,
    dowod: StatusDowodu,
    podstawa: PodstawaWymagania,
    limit: LimitKryterium | None,
) -> tuple[KompletnoscDowodu, list[str]]:
    """Kompletność dowodu kryterium: z własnego dowodu, podstawy kryterium, podstawy limitu
    i podstawy warunku wstępnego."""
    if not dotyczy:
        return "NIE_DOTYCZY", []
    return kompletnosc_dowodu(dowod, _podstawy_kryterium(kryterium, podstawa, limit))


def kompletnosc_wymagania(
    *,
    dotyczy: bool,
    dowod: StatusDowodu,
    podstawa: PodstawaWymagania,
    oceny: Sequence[OcenaKryterium],
    podstawa_sposobu_wykazania: PodstawaWymagania | None = None,
) -> tuple[KompletnoscDowodu, list[str]]:
    """Kompletność dowodu wymagania: dowód, podstawa wymagania, podstawa reguły sposobu
    wykazania + agregat składowych.

    Podstawa reguły sposobu wykazania (np. reguła pokrycia wymagania certyfikatem z warstwy
    WiPWC) jest warunkiem pełnego dowodu jak podstawa wymagania (§3 pkt 3): stan
    ``NIEUSTALONE`` daje powód niepełności nazywający regułę i metodę, więc sam certyfikat
    przy regule bez wskazanej jednostki redakcyjnej daje ``BRAK_DOWODU``, nigdy ``SPELNIA``.

    Właściwość metody rozstrzyga ``przydatnosc_dowodu_wymagania`` (ten sam predykat, który
    wystawia API): dla dowodu łączonego (``DOWOD_LACZONY``) — każda stosowalna ocena składowa
    ma metodę przydatną, a powód niepełności nazywa składniki bez metody przydatnej. Każdy
    powód niepełności stosowalnej oceny składowej przechodzi do wymagania (z nazwą składnika):
    wartość przyjęta bez źródła albo model niezwalidowany w którymkolwiek składniku wpływa na
    wynik wymagania, więc wymaganie nie może mieć dowodu pełnego (§3 pkt 2, T6).
    """
    if not dotyczy:
        return "NIE_DOTYCZY", []
    stosowalne = [ocena for ocena in oceny if ocena.status_maszynowy != "NIE_DOTYCZY"]
    powod_metody: str | None = None
    if not przydatnosc_dowodu_wymagania(dowod, oceny):
        if dowod.metoda not in METODY_TYLKO_WYMAGANIA:
            powod_metody = wyjasnienie.powod_metody(dowod, "W")
        elif not stosowalne:
            powod_metody = wyjasnienie.powod_dowodu_laczonego_bez_skladowych()
        else:
            powod_metody = wyjasnienie.powod_dowodu_laczonego(
                [ocena for ocena in stosowalne if not ocena.dowod.przydatnosc_dowodowa]
            )
    powody = _powody_niepelnosci(dowod, [podstawa], powod_metody)
    if (
        podstawa_sposobu_wykazania is not None
        and podstawa_sposobu_wykazania.status == "NIEUSTALONE"
    ):
        powody.append(
            wyjasnienie.powod_reguly_sposobu_wykazania(dowod.metoda, podstawa_sposobu_wykazania)
        )
    for ocena in stosowalne:
        powody.extend(
            wyjasnienie.z_nazwa_skladowej(ocena, powod) for powod in ocena.powody_niepelnosci
        )
    powody = list(_bez_powtorzen(powody))
    return ("NIEPELNY", powody) if powody else ("PELNY", [])


# ---------------------------------------------------------------------------
# Reguła W (§2.3)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _WejscieW:
    dotyczy: bool
    sposob_wykazania: MetodaDowodu
    oceny: tuple[OcenaKryterium, ...]
    kompletnosc: KompletnoscDowodu
    pokrycie_programu: PokrycieProgramu
    pokrycie_programu_pl: str

    @property
    def stosowalne(self) -> tuple[OcenaKryterium, ...]:
        return tuple(o for o in self.oceny if o.status_maszynowy != "NIE_DOTYCZY")


def _skladowe_o_statusie(w: _WejscieW, status: StatusWerdyktu) -> tuple[OcenaKryterium, ...]:
    return tuple(o for o in w.oceny if o.status_maszynowy == status)


def _krok_w_stosowalnosc(w: _WejscieW) -> _WynikKroku:
    if not w.dotyczy:
        return _WynikKroku(status="NIE_DOTYCZY", konczy=True)
    return _WynikKroku()


def _krok_w_brak_metody(w: _WejscieW) -> _WynikKroku:
    if w.sposob_wykazania == "BRAK_METODY":
        return _WynikKroku(status="BRAK_DOWODU", braki=(wyjasnienie.brak_metody_wymagania(),))
    return _WynikKroku()


def _krok_w_skladowe_nie_dotycza(w: _WejscieW) -> _WynikKroku:
    # Predykat obejmuje także pustą listę składowych: czysta funkcja reguły nie może wydać
    # „pustego SPELNIA" nawet dla wejścia, którego walidator rekordu by nie przyjął. Dla
    # BRAK_METODY pusta lista jest stanem właściwym (krok wcześniejszy), więc nie jest brakiem.
    if not w.stosowalne:
        braki = (
            ()
            if w.sposob_wykazania == "BRAK_METODY"
            else (wyjasnienie.brak_skladowych_stosowalnych(),)
        )
        return _WynikKroku(status="NIE_OCENIONO", braki=braki)
    return _WynikKroku()


def _krok_w_skladowe(status: StatusWerdyktu) -> Callable[[_WejscieW], _WynikKroku]:
    def krok(w: _WejscieW) -> _WynikKroku:
        return _WynikKroku(status=status) if _skladowe_o_statusie(w, status) else _WynikKroku()

    return krok


def _krok_w_pokrycie(w: _WejscieW) -> _WynikKroku:
    if w.pokrycie_programu == "CZESCIOWE":
        return _WynikKroku(
            status="BRAK_DOWODU",
            braki=(wyjasnienie.brak_pokrycia_programu(w.pokrycie_programu_pl),),
        )
    return _WynikKroku()


def _krok_w_kompletnosc(w: _WejscieW) -> _WynikKroku:
    if w.kompletnosc != "PELNY":
        return _WynikKroku(status="BRAK_DOWODU")
    return _WynikKroku()


def _krok_w_spelnienie(w: _WejscieW) -> _WynikKroku:
    return _WynikKroku(status="SPELNIA")


_KROKI_REGULY_W: tuple[tuple[KrokRegulyW, Callable[[_WejscieW], _WynikKroku]], ...] = (
    ("STOSOWALNOSC", _krok_w_stosowalnosc),
    ("BRAK_METODY", _krok_w_brak_metody),
    ("SKLADOWE_NIE_DOTYCZA", _krok_w_skladowe_nie_dotycza),
    ("NARUSZENIE", _krok_w_skladowe("NIE_SPELNIA")),
    ("NIEJEDNOZNACZNOSC", _krok_w_skladowe("NIEJEDNOZNACZNY")),
    ("NIEOCENIONE", _krok_w_skladowe("NIE_OCENIONO")),
    ("BRAK_PODSTAWY", _krok_w_skladowe("BRAK_PODSTAWY")),
    ("POKRYCIE", _krok_w_pokrycie),
    ("KOMPLETNOSC", _krok_w_kompletnosc),
    ("SPELNIENIE", _krok_w_spelnienie),
)


def _najblizej_granicy(oceny: Sequence[OcenaKryterium]) -> str | None:
    """Składnik o najmniejszym marginesie względnym; remis — mniejszy ``kryterium_id``."""
    kandydaci = [
        (ocena.margines.wzgledny, ocena.kryterium_id)
        for ocena in oceny
        if ocena.status_maszynowy != "NIE_DOTYCZY"
        and ocena.margines is not None
        and ocena.margines.wzgledny is not None
    ]
    return min(kandydaci)[1] if kandydaci else None


def _rozstrzygnij_wymaganie(
    w: _WejscieW,
) -> tuple[StatusWerdyktu, KrokRegulyW, tuple[str, ...], str | None, tuple[str, ...]]:
    status: StatusWerdyktu | None = None
    krok: KrokRegulyW | None = None
    braki: list[str] = []
    for nazwa, funkcja in _KROKI_REGULY_W:
        wynik_kroku = funkcja(w)
        braki.extend(wynik_kroku.braki)
        if wynik_kroku.status is not None and status is None:
            status, krok = wynik_kroku.status, nazwa
        if wynik_kroku.status is not None and wynik_kroku.konczy:
            break
    if status is None or krok is None:
        raise ValueError("Reguła W nie wyznaczyła statusu — lista kroków reguły jest niekompletna.")
    if status != "NIE_DOTYCZY":
        # Braki składników (z nazwą składnika) i powody niepełności dowodu są brakami
        # wymagania niezależnie od statusu, który wygrał.
        for ocena in w.stosowalne:
            braki.extend(
                wyjasnienie.z_nazwa_skladowej(ocena, brak)
                for brak in ocena.wyjasnienie.czego_brakuje
            )
    naruszone = (
        tuple(o.kryterium_id for o in _skladowe_o_statusie(w, "NIE_SPELNIA"))
        if status == "NIE_SPELNIA"
        else ()
    )
    najblizej = _najblizej_granicy(w.oceny) if status == "SPELNIA" else None
    return status, krok, naruszone, najblizej, _bez_powtorzen(braki)


def status_wymagania(
    *,
    dotyczy: bool,
    sposob_wykazania: MetodaDowodu,
    oceny: Sequence[OcenaKryterium],
    kompletnosc: KompletnoscDowodu,
    pokrycie_programu: PokrycieProgramu,
) -> tuple[StatusWerdyktu, list[str], str | None]:
    """Status wymagania wg §2.3 (agregacja W, zakaz „master PASS").

    Kolejność: (1) nie stosuje się → ``NIE_DOTYCZY``; (2) sposób wykazania ``BRAK_METODY`` →
    ``BRAK_DOWODU``; (3) stosowalne, ale każda składowa ``NIE_DOTYCZY`` → ``NIE_OCENIONO``;
    (4) którakolwiek ``NIE_SPELNIA`` → ``NIE_SPELNIA`` (``kryteria_naruszone`` = wszystkie);
    (5) ``NIEJEDNOZNACZNY``; (6) ``NIE_OCENIONO``; (7) ``BRAK_PODSTAWY``; (8) pokrycie programu
    badań ``CZESCIOWE`` → ``BRAK_DOWODU``; (9) kompletność ≠ ``PELNY`` → ``BRAK_DOWODU``;
    (10) ``SPELNIA`` z kryterium najbliżej granicy (najmniejszy margines względny, remis —
    mniejszy ``kryterium_id``; ``None``, gdy żaden składnik nie ma marginesu względnego).
    Zwraca (status, ``kryteria_naruszone``, ``kryterium_najblizej_granicy``).
    """
    status, _, naruszone, najblizej, _ = _rozstrzygnij_wymaganie(
        _WejscieW(
            dotyczy=dotyczy,
            sposob_wykazania=sposob_wykazania,
            oceny=tuple(oceny),
            kompletnosc=kompletnosc,
            pokrycie_programu=pokrycie_programu,
            pokrycie_programu_pl="",
        )
    )
    return status, list(naruszone), najblizej


# ---------------------------------------------------------------------------
# Wyprowadzenia pól rekordów (jedna ścieżka dla konstruktora i walidatora)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PochodneKryterium:
    """Pola rekordu K wyprowadzone regułą z pól wejściowych."""

    margines: Margines | None
    status: StatusWerdyktu
    krok: KrokRegulyK
    braki: tuple[str, ...]
    kompletnosc: KompletnoscDowodu
    powody: tuple[str, ...]
    etykieta: Etykieta
    zastrzezenia: tuple[str, ...]


@dataclass(frozen=True)
class PochodneWymagania:
    """Pola rekordu W wyprowadzone regułą z pól wejściowych i ocen składowych."""

    status: StatusWerdyktu
    krok: KrokRegulyW
    naruszone: tuple[str, ...]
    najblizej: str | None
    braki: tuple[str, ...]
    kompletnosc: KompletnoscDowodu
    powody: tuple[str, ...]
    etykieta: Etykieta
    zastrzezenia: tuple[str, ...]


def wyprowadz_pola_kryterium(
    *,
    kryterium: Kryterium,
    podstawa: PodstawaWymagania,
    stosowalnosc: Stosowalnosc,
    wynik: WynikKryterium | None,
    limit: LimitKryterium | None,
    niepewnosc: Niepewnosc,
    dowod: StatusDowodu,
    zakres_waznosci: ZakresWaznosci,
    tolerancja: Wielkosc | None,
) -> PochodneKryterium:
    """Margines, status, braki, kompletność, etykieta i zastrzeżenia rekordu K."""
    relacja = kryterium.relacja
    margines_kryterium: Margines | None = None
    if wynik is not None and (limit is not None or relacja not in RELACJE_LICZBOWE):
        margines_kryterium = margines(
            relacja,
            wynik.wartosc,
            limit,
            chwila_s=wynik.chwila_s,
            punkt_pl=wynik.punkt_krytyczny_pl,
            tolerancja=tolerancja,
            niepewnosc=niepewnosc.wartosc if relacja in RELACJE_LICZBOWE else None,
        )
    status, krok, braki = _rozstrzygnij_kryterium(
        _WejscieK(
            dotyczy=stosowalnosc.dotyczy,
            relacja=relacja,
            podstawa=podstawa,
            dowod=dowod,
            limit=limit,
            wynik=wynik,
            margines=margines_kryterium,
            niepewnosc=niepewnosc,
        )
    )
    kompletnosc, powody = kompletnosc_kryterium(
        dotyczy=stosowalnosc.dotyczy,
        kryterium=kryterium,
        dowod=dowod,
        podstawa=podstawa,
        limit=limit,
    )
    return PochodneKryterium(
        margines=margines_kryterium,
        status=status,
        krok=krok,
        braki=braki,
        kompletnosc=kompletnosc,
        powody=tuple(powody),
        etykieta=etykiety.etykieta(status, kompletnosc, "K"),
        zastrzezenia=wyjasnienie.zastrzezenia_kryterium(
            kryterium=kryterium,
            podstawa=podstawa,
            stosowalnosc=stosowalnosc,
            limit=limit,
            dowod=dowod,
            zakres_waznosci=zakres_waznosci,
        ),
    )


def wyprowadz_pola_wymagania(
    *,
    podstawa: PodstawaWymagania,
    stosowalnosc: Stosowalnosc,
    sposob_wykazania: MetodaDowodu,
    oceny: Sequence[OcenaKryterium],
    podstawa_sposobu_wykazania: PodstawaWymagania | None = None,
    pokrycie_programu: PokrycieProgramu,
    pokrycie_programu_pl: str,
    dowod: StatusDowodu,
    zakres_waznosci: ZakresWaznosci,
) -> PochodneWymagania:
    """Status, naruszenia, najbliższe granicy, braki, kompletność, etykieta i zastrzeżenia W."""
    oceny_krotka = tuple(oceny)
    kompletnosc, powody = kompletnosc_wymagania(
        dotyczy=stosowalnosc.dotyczy,
        dowod=dowod,
        podstawa=podstawa,
        oceny=oceny_krotka,
        podstawa_sposobu_wykazania=podstawa_sposobu_wykazania,
    )
    status, krok, naruszone, najblizej, braki = _rozstrzygnij_wymaganie(
        _WejscieW(
            dotyczy=stosowalnosc.dotyczy,
            sposob_wykazania=sposob_wykazania,
            oceny=oceny_krotka,
            kompletnosc=kompletnosc,
            pokrycie_programu=pokrycie_programu,
            pokrycie_programu_pl=pokrycie_programu_pl,
        )
    )
    return PochodneWymagania(
        status=status,
        krok=krok,
        naruszone=naruszone,
        najblizej=najblizej,
        braki=_bez_powtorzen([*braki, *powody]),
        kompletnosc=kompletnosc,
        powody=tuple(powody),
        etykieta=etykiety.etykieta(status, kompletnosc, "W"),
        zastrzezenia=wyjasnienie.zastrzezenia_wymagania(
            podstawa=podstawa,
            stosowalnosc=stosowalnosc,
            oceny=oceny_krotka,
            dowod=dowod,
            zakres_waznosci=zakres_waznosci,
            podstawa_sposobu_wykazania=podstawa_sposobu_wykazania,
        ),
    )


# ---------------------------------------------------------------------------
# Konstruktory wysokiego poziomu
# ---------------------------------------------------------------------------


def ocen_kryterium(
    *,
    kryterium_id: str,
    przedmiot: Przedmiot,
    kryterium: Kryterium,
    podstawa: PodstawaWymagania,
    stosowalnosc: Stosowalnosc,
    wynik: WynikKryterium | None,
    limit: LimitKryterium | None,
    niepewnosc: Niepewnosc,
    dowod: StatusDowodu,
    zakres_waznosci: ZakresWaznosci,
    slad: Sequence[OdnosnikSladu],
    tolerancja: Wielkosc | None = None,
    braki_dodatkowe: Sequence[str] = (),
) -> OcenaKryterium:
    """Zbuduj rekord K: margines, status, kompletność, etykieta i wyjaśnienie z reguły.

    ``tolerancja`` — tolerancja kryterium z profilu (skala marginesu względnego ``TOLERANCJA``).
    ``braki_dodatkowe`` — konkretne braki znane producentowi oceny (np. brak biegu dynamiki dla
    danego typu modułu); trafiają do ``czego_brakuje`` po brakach nazwanych przez regułę.
    """
    pochodne = wyprowadz_pola_kryterium(
        kryterium=kryterium,
        podstawa=podstawa,
        stosowalnosc=stosowalnosc,
        wynik=wynik,
        limit=limit,
        niepewnosc=niepewnosc,
        dowod=dowod,
        zakres_waznosci=zakres_waznosci,
        tolerancja=tolerancja,
    )
    czego_brakuje = _bez_powtorzen([*pochodne.braki, *braki_dodatkowe])
    return OcenaKryterium(
        kryterium_id=kryterium_id,
        przedmiot=przedmiot,
        kryterium=kryterium,
        podstawa=podstawa,
        stosowalnosc=stosowalnosc,
        wynik=wynik,
        limit=limit,
        margines=pochodne.margines,
        niepewnosc=niepewnosc,
        status_maszynowy=pochodne.status,
        kompletnosc_dowodu=pochodne.kompletnosc,
        powody_niepelnosci=pochodne.powody,
        etykieta=pochodne.etykieta,
        wyjasnienie=wyjasnienie.wyjasnienie_kryterium(
            status=pochodne.status,
            krok=pochodne.krok,
            przedmiot=przedmiot,
            kryterium=kryterium,
            podstawa=podstawa,
            stosowalnosc=stosowalnosc,
            wynik=wynik,
            limit=limit,
            margines=pochodne.margines,
            niepewnosc=niepewnosc,
            dowod=dowod,
            metody_dopuszczalne=metody_dopuszczalne(dowod.rodzaj_twierdzenia),
            czego_brakuje=czego_brakuje,
            zastrzezenia=pochodne.zastrzezenia,
            braki_dodatkowe=tuple(braki_dodatkowe),
        ),
        dowod=dowod,
        zakres_waznosci=zakres_waznosci,
        slad=tuple(slad),
    )


def zagreguj_wymaganie(
    *,
    wymaganie_id: str,
    nazwa_pl: str,
    podstawa: PodstawaWymagania,
    stosowalnosc: Stosowalnosc,
    sposob_wykazania: MetodaDowodu,
    oceny_skladowe: Sequence[OcenaKryterium],
    pokrycie_programu: PokrycieProgramu,
    pokrycie_programu_pl: str,
    dowod: StatusDowodu,
    zakres_waznosci: ZakresWaznosci,
    slad: Sequence[OdnosnikSladu],
    braki_dodatkowe: Sequence[str] = (),
    podstawa_sposobu_wykazania: PodstawaWymagania | None = None,
) -> WynikWymagania:
    """Zbuduj rekord W: agregacja §2.3, kompletność §3, etykieta i wyjaśnienie z reguły.

    Kompletność wymagania = dowód, podstawa wymagania i podstawa reguły sposobu wykazania
    (``podstawa_sposobu_wykazania``, np. reguła pokrycia certyfikatem) + powody niepełności
    stosowalnych składowych (każda z własnym dowodem, podstawą kryterium i podstawą limitu).
    """
    oceny = tuple(oceny_skladowe)
    pochodne = wyprowadz_pola_wymagania(
        podstawa=podstawa,
        stosowalnosc=stosowalnosc,
        sposob_wykazania=sposob_wykazania,
        podstawa_sposobu_wykazania=podstawa_sposobu_wykazania,
        oceny=oceny,
        pokrycie_programu=pokrycie_programu,
        pokrycie_programu_pl=pokrycie_programu_pl,
        dowod=dowod,
        zakres_waznosci=zakres_waznosci,
    )
    czego_brakuje = _bez_powtorzen([*pochodne.braki, *braki_dodatkowe])
    return WynikWymagania(
        wymaganie_id=wymaganie_id,
        nazwa_pl=nazwa_pl,
        podstawa=podstawa,
        stosowalnosc=stosowalnosc,
        sposob_wykazania=sposob_wykazania,
        podstawa_sposobu_wykazania=podstawa_sposobu_wykazania,
        oceny_skladowe=oceny,
        pokrycie_programu=pokrycie_programu,
        pokrycie_programu_pl=pokrycie_programu_pl,
        status_maszynowy=pochodne.status,
        kompletnosc_dowodu=pochodne.kompletnosc,
        powody_niepelnosci=pochodne.powody,
        kryteria_naruszone=pochodne.naruszone,
        kryterium_najblizej_granicy=pochodne.najblizej,
        etykieta=pochodne.etykieta,
        wyjasnienie=wyjasnienie.wyjasnienie_wymagania(
            krok=pochodne.krok,
            nazwa_pl=nazwa_pl,
            podstawa=podstawa,
            stosowalnosc=stosowalnosc,
            oceny=oceny,
            powody_niepelnosci=pochodne.powody,
            kryteria_naruszone=pochodne.naruszone,
            kryterium_najblizej_granicy=pochodne.najblizej,
            pokrycie_programu_pl=pokrycie_programu_pl,
            dowod=dowod,
            czego_brakuje=czego_brakuje,
            zastrzezenia=pochodne.zastrzezenia,
        ),
        dowod=dowod,
        zakres_waznosci=zakres_waznosci,
        slad=tuple(slad),
    )
