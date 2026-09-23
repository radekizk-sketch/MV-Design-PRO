"""Wspólne fabryki rekordów werdyktu dla testów pakietu ``werdykt``.

Liczby w fabrykach są DWÓJKOWO-DOKŁADNE (całkowite albo ułamki o mianowniku 2^k): margines
``m`` i niepewność ``u`` na granicy ``|m| = u`` (T11) wychodzą z arytmetyki zmiennoprzecinkowej
bez błędu zaokrąglenia, więc test granicy sprawdza regułę, a nie szum reprezentacji. Liczby
NIE pochodzą z profilu regulacyjnego — to dane testowe, nie wartości kryteriów.

Każda relacja ma jedną „wielkość wzorcową" (limit, jednostka, wynik o zadanym marginesie):

* ``NIE_WIECEJ`` — czas aktywacji prądu biernego, limit 40 ms;
* ``NIE_MNIEJ`` — moc czynna po zakłóceniu, limit 90 % (margines, tolerancja i niepewność
  w punktach procentowych ``pp``);
* ``PASMO`` — częstotliwość pracy, pasmo 48–52 Hz;
* ``OBWIEDNIA_DOLNA`` — napięcie w punkcie przyłączenia nad obwiednią (0,25 → 0,75 p.u.);
* ``OBWIEDNIA_GORNA`` — napięcie pod obwiednią (1,25 → 1,125 p.u.);
* ``LOGICZNE`` — pozostanie modułu w pracy (1 = pozostał przyłączony).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal

from werdykt import (
    DanaPrzyjeta,
    Kryterium,
    LimitKryterium,
    MetodaDowodu,
    Niepewnosc,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    PokrycieProgramu,
    Przedmiot,
    PunktObwiedni,
    Relacja,
    StanDanych,
    StanZrodla,
    StatusDanych,
    StatusDowodu,
    StatusModelu,
    Stosowalnosc,
    Wielkosc,
    WynikKryterium,
    WynikWymagania,
    ZakresWaznosci,
    ocen_kryterium,
    zagreguj_wymaganie,
)
from werdykt.proweniencja import ClaimKind, EvidenceTier, FieldQuality

RELACJE: tuple[Relacja, ...] = (
    "NIE_WIECEJ",
    "NIE_MNIEJ",
    "PASMO",
    "OBWIEDNIA_DOLNA",
    "OBWIEDNIA_GORNA",
    "LOGICZNE",
)
RELACJE_LICZBOWE: tuple[Relacja, ...] = RELACJE[:-1]
STANY_ZRODLA: tuple[StanZrodla, ...] = ("ZWERYFIKOWANE", "WSKAZANE", "NIEUSTALONE")
STATUSY_MODELU: tuple[StatusModelu, ...] = (
    "UNVALIDATED_MODEL",
    "VALIDATED_AGAINST_TEST",
    "CERTIFIED_MODEL",
    "NIE_DOTYCZY",
)
STANY_DANYCH: tuple[StanDanych, ...] = ("ZWALIDOWANE", "UNVALIDATED_INPUT")

JEDNOSTKA: dict[Relacja, str] = {
    "NIE_WIECEJ": "ms",
    "NIE_MNIEJ": "%",
    "PASMO": "Hz",
    "OBWIEDNIA_DOLNA": "p.u. (U_n)",
    "OBWIEDNIA_GORNA": "p.u. (U_n)",
    "LOGICZNE": "1",
}
#: Jednostka marginesu, skali, tolerancji i niepewności (wynik w ``%`` → ``pp``).
JEDNOSTKA_MARGINESU: dict[Relacja, str] = {
    **JEDNOSTKA,
    "NIE_MNIEJ": "pp",
}
#: Domena walidacji silnika w fabrykach dowodu symulacji (nazwa manifestu i zakresy).
DOMENA_WALIDACJI = "D-11: SCR 3–20, X/R 2–15, zapad 0,05–0,9 p.u. (U_n)"
#: Krok marginesu (dodatni) dla każdej relacji — dwójkowo dokładny.
KROK_MARGINESU: dict[Relacja, float] = {
    "NIE_WIECEJ": 2.0,
    "NIE_MNIEJ": 2.0,
    "PASMO": 0.5,
    "OBWIEDNIA_DOLNA": 0.125,
    "OBWIEDNIA_GORNA": 0.125,
}
#: Chwila punktu krytycznego wyników wobec obwiedni (wartość obwiedni dokładna).
CHWILA_KRYTYCZNA_S = 0.5
WARTOSC_OBWIEDNI_DOLNEJ = 0.5
WARTOSC_OBWIEDNI_GORNEJ = 1.1875
OPIS_KRYTERIUM: dict[Relacja, str] = {
    "NIE_WIECEJ": "Czas aktywacji prądu biernego",
    "NIE_MNIEJ": "Odbudowa mocy czynnej po zakłóceniu",
    "PASMO": "Praca w paśmie częstotliwości",
    "OBWIEDNIA_DOLNA": "Napięcie nad obwiednią zapadu",
    "OBWIEDNIA_GORNA": "Napięcie pod obwiednią wzrostu",
    "LOGICZNE": "Pozostanie w pracy podczas zapadu",
}
WARUNEK_LATEX: dict[Relacja, str] = {
    "NIE_WIECEJ": r"t_{akt} \leq t_{akt,\max}",
    "NIE_MNIEJ": r"P(t_1) \geq P_{\min}",
    "PASMO": r"f_{\min} \leq f \leq f_{\max}",
    "OBWIEDNIA_DOLNA": r"U(t) \geq U_{obw}(t)",
    "OBWIEDNIA_GORNA": r"U(t) \leq U_{obw}(t)",
    "LOGICZNE": "",
}
WIELKOSC: dict[Relacja, str] = {
    "NIE_WIECEJ": "czas aktywacji prądu biernego",
    "NIE_MNIEJ": "moc czynna po 1 s",
    "PASMO": "częstotliwość",
    "OBWIEDNIA_DOLNA": "najmniejsze napięcie nad obwiednią",
    "OBWIEDNIA_GORNA": "największe napięcie pod obwiednią",
    "LOGICZNE": "pozostanie w pracy",
}


def podstawa(
    stan: StanZrodla = "ZWERYFIKOWANE",
    *,
    dokument: str = "Procedura testowania modułów wytwarzania energii",
    jednostka: str = "pkt 5.3",
    uwagi: str | None = None,
) -> PodstawaWymagania:
    """Podstawa w danym stanie; stan ``NIEUSTALONE`` bez wydania i jednostki redakcyjnej."""
    if stan == "NIEUSTALONE":
        return PodstawaWymagania(
            rodzaj="NIEUSTALONA",
            dokument="Profil zastany operatorów (pochodzenie nieustalone)",
            status="NIEUSTALONE",
            uwagi_pl=uwagi or "wartość przeniesiona z dawnych profili",
        )
    return PodstawaWymagania(
        rodzaj="PROCEDURA_PTPIREE",
        dokument=dokument,
        wydanie="3.0",
        jednostka_redakcyjna=jednostka,
        status=stan,
        uwagi_pl=uwagi,
    )


def wielkosc(wartosc: float, jednostka: str) -> Wielkosc:
    return Wielkosc(wartosc=wartosc, jednostka=jednostka)


def dana_przyjeta(
    nazwa: str = "moc zwarciowa sieci S_k″",
    wartosc: float | None = 120.0,
    jednostka: str = "MVA",
    jakosc: FieldQuality | None = FieldQuality.ESTIMATED,
    powod: str = "założona do czasu otrzymania warunków przyłączenia",
) -> DanaPrzyjeta:
    return DanaPrzyjeta(
        nazwa_pl=nazwa,
        wartosc=None if wartosc is None else wielkosc(wartosc, jednostka),
        powod_pl=powod,
        jakosc=jakosc,
    )


def status_danych(stan: StanDanych = "ZWALIDOWANE") -> StatusDanych:
    if stan == "ZWALIDOWANE":
        return StatusDanych(stan="ZWALIDOWANE")
    return StatusDanych(stan="UNVALIDATED_INPUT", dane_przyjete=(dana_przyjeta(),))


def dowod(
    *,
    metoda: MetodaDowodu = "DEKLARACJA",
    poziom: EvidenceTier = EvidenceTier.DECLARATION,
    twierdzenie: ClaimKind = ClaimKind.DECLARED_CONFIGURATION,
    status_modelu: StatusModelu = "NIE_DOTYCZY",
    stan_danych: StanDanych = "ZWALIDOWANE",
    dane: StatusDanych | None = None,
    odniesienie: str | None = "bieg-001",
    w_domenie: bool | None = None,
    domena: str | None = None,
) -> StatusDowodu:
    return StatusDowodu(
        metoda=metoda,
        poziom=poziom,
        rodzaj_twierdzenia=twierdzenie,
        status_modelu=status_modelu,
        status_danych=dane if dane is not None else status_danych(stan_danych),
        odniesienie=odniesienie,
        w_domenie_walidacji=w_domenie,
        domena_pl=domena,
    )


def dowod_symulacji(
    *,
    status_modelu: StatusModelu = "VALIDATED_AGAINST_TEST",
    poziom: EvidenceTier = EvidenceTier.VALIDATED_SIMULATION,
    stan_danych: StanDanych = "ZWALIDOWANE",
    w_domenie: bool | None = True,
) -> StatusDowodu:
    """Dowód symulacji (domyślnie: bieg w zadeklarowanej domenie walidacji silnika)."""
    return dowod(
        metoda="SYMULACJA",
        poziom=poziom,
        twierdzenie=ClaimKind.DYNAMIC_PERFORMANCE,
        status_modelu=status_modelu,
        stan_danych=stan_danych,
        w_domenie=w_domenie,
        domena=None if w_domenie is None else DOMENA_WALIDACJI,
    )


def dowod_obliczenia(
    *,
    poziom: EvidenceTier = EvidenceTier.VALIDATED_SIMULATION,
    twierdzenie: ClaimKind = ClaimKind.STATIC_CALCULATION,
    stan_danych: StanDanych = "ZWALIDOWANE",
    w_domenie: bool | None = None,
) -> StatusDowodu:
    """Dowód obliczenia statycznego (domyślnie: solver zwalidowany, domena niezadeklarowana)."""
    return dowod(
        metoda="OBLICZENIE",
        poziom=poziom,
        twierdzenie=twierdzenie,
        stan_danych=stan_danych,
        w_domenie=w_domenie,
        domena=None if w_domenie is None else DOMENA_WALIDACJI,
    )


def podstawa_warunku(stan: StanZrodla = "ZWERYFIKOWANE") -> PodstawaWymagania:
    """Podstawa warunku wstępnego (obwiednia z profilu) w danym stanie."""
    return podstawa(stan, dokument="Profil wymagań OSD — obwiednia zapadu", jednostka="tab. 4")


def kryterium(
    relacja: Relacja,
    *,
    warunek_wstepny: str | None = None,
    stan_warunku: StanZrodla = "ZWERYFIKOWANE",
) -> Kryterium:
    """Kryterium wzorcowe; warunek wstępny zawsze z podstawą (obowiązkowa para)."""
    return Kryterium(
        opis_pl=OPIS_KRYTERIUM[relacja],
        warunek_latex=WARUNEK_LATEX[relacja],
        relacja=relacja,
        warunek_wstepny_pl=warunek_wstepny,
        warunek_wstepny_podstawa=(
            None if warunek_wstepny is None else podstawa_warunku(stan_warunku)
        ),
    )


def limit(
    relacja: Relacja,
    stan: StanZrodla = "ZWERYFIKOWANE",
    *,
    wartosc_limitu: float | None = None,
) -> LimitKryterium | None:
    """Limit wzorcowy relacji (``None`` dla ``LOGICZNE``)."""
    podstawa_limitu = podstawa(stan, dokument="Warunki przyłączenia OSD", jednostka="pkt 7.2")
    if relacja == "NIE_WIECEJ":
        granica = 40.0 if wartosc_limitu is None else wartosc_limitu
        return LimitKryterium(wartosc=wielkosc(granica, "ms"), podstawa=podstawa_limitu)
    if relacja == "NIE_MNIEJ":
        granica = 90.0 if wartosc_limitu is None else wartosc_limitu
        return LimitKryterium(wartosc=wielkosc(granica, "%"), podstawa=podstawa_limitu)
    if relacja == "PASMO":
        return LimitKryterium(
            pasmo=(wielkosc(48.0, "Hz"), wielkosc(52.0, "Hz")), podstawa=podstawa_limitu
        )
    if relacja == "OBWIEDNIA_DOLNA":
        return LimitKryterium(
            obwiednia=(
                PunktObwiedni(t_s=0.0, wartosc=0.25),
                PunktObwiedni(t_s=1.0, wartosc=0.75),
                PunktObwiedni(t_s=2.0, wartosc=0.75),
            ),
            jednostka_obwiedni="p.u. (U_n)",
            podstawa=podstawa_limitu,
        )
    if relacja == "OBWIEDNIA_GORNA":
        return LimitKryterium(
            obwiednia=(
                PunktObwiedni(t_s=0.0, wartosc=1.25),
                PunktObwiedni(t_s=1.0, wartosc=1.125),
                PunktObwiedni(t_s=2.0, wartosc=1.125),
            ),
            jednostka_obwiedni="p.u. (U_n)",
            podstawa=podstawa_limitu,
        )
    return None


def wartosc_wyniku(relacja: Relacja, m: float) -> float:
    """Wartość wyniku, dla której margines wobec limitu wzorcowego wynosi dokładnie ``m``."""
    if relacja == "NIE_WIECEJ":
        return 40.0 - m
    if relacja == "NIE_MNIEJ":
        return 90.0 + m
    if relacja == "PASMO":
        return 48.0 + m
    if relacja == "OBWIEDNIA_DOLNA":
        return WARTOSC_OBWIEDNI_DOLNEJ + m
    if relacja == "OBWIEDNIA_GORNA":
        return WARTOSC_OBWIEDNI_GORNEJ - m
    raise ValueError("Kryterium logiczne nie ma marginesu skalarnego.")


def wynik(
    relacja: Relacja,
    m: float = 2.0,
    *,
    metoda: MetodaDowodu = "DEKLARACJA",
    stan_logiczny: bool = True,
) -> WynikKryterium:
    """Wynik o marginesie ``m`` (relacje liczbowe) albo o stanie logicznym (``LOGICZNE``)."""
    if relacja == "LOGICZNE":
        return WynikKryterium(
            wielkosc_pl=WIELKOSC[relacja],
            symbol_latex="",
            wartosc=wielkosc(1.0 if stan_logiczny else 0.0, "1"),
            punkt_krytyczny_pl=(
                "moduł pozostał przyłączony przez cały przebieg"
                if stan_logiczny
                else "moduł odłączony przez zabezpieczenie podnapięciowe w chwili 0,31 s"
            ),
            metoda=metoda,
        )
    obwiednia = relacja in ("OBWIEDNIA_DOLNA", "OBWIEDNIA_GORNA")
    return WynikKryterium(
        wielkosc_pl=WIELKOSC[relacja],
        symbol_latex=r"x",
        wartosc=wielkosc(wartosc_wyniku(relacja, m), JEDNOSTKA[relacja]),
        punkt_krytyczny_pl="punkt przyłączenia modułu" if obwiednia else None,
        chwila_s=CHWILA_KRYTYCZNA_S if obwiednia else None,
        metoda=metoda,
    )


def niepewnosc(u: float | None = None, jednostka: str = "ms") -> Niepewnosc:
    """Niepewność oszacowana ``u`` albo jawnie „nie dotyczy" (``u is None``)."""
    if u is None:
        return Niepewnosc(
            nie_dotyczy=True,
            powod_pl="porównanie wartości zadeklarowanych — niepewność numeryczna nie dotyczy",
        )
    return Niepewnosc(
        wartosc=wielkosc(u, jednostka),
        metoda_pl="różnica wyniku przy połowionym kroku całkowania",
    )


def przedmiot(nazwa: str = "Moduł PV 2 MW") -> Przedmiot:
    return Przedmiot(
        element_ref="gen-pv-01",
        nazwa_pl=nazwa,
        opis_pl="Moduł parku energii typu B przyłączony do sieci SN",
    )


def stosowalnosc(
    dotyczy: bool = True,
    *,
    podstawa_stosowalnosci: PodstawaWymagania | None = None,
    modul_istniejacy: bool | None = False,
    warunek_wstepny_nieuruchomiony: bool = False,
) -> Stosowalnosc:
    return Stosowalnosc(
        typ_modulu="B",
        technologia="PPM",
        modul_istniejacy=modul_istniejacy,
        dotyczy=dotyczy,
        powod_pl=(
            "wymaganie dotyczy modułów parku energii typu B"
            if dotyczy
            else "wymaganie dotyczy modułów parku energii, oceniany moduł jest synchroniczny"
        ),
        podstawa=podstawa_stosowalnosci,
        warunek_wstepny_nieuruchomiony=warunek_wstepny_nieuruchomiony,
    )


def zakres(
    *,
    rodzaj: Literal["RMS_DYNAMICS", "POWER_FLOW"] | None = "RMS_DYNAMICS",
    wykluczenia: Sequence[str] = ("zwarcia niesymetryczne",),
    parametry_sieci: Sequence[DanaPrzyjeta] = (),
) -> ZakresWaznosci:
    return ZakresWaznosci(
        rodzaj_analizy=rodzaj,
        opis_pl="RMS składowa zgodna, zwarcie trójfazowe",
        symetria_zaklocenia="zwarcie trójfazowe",
        parametry_sieci=tuple(parametry_sieci),
        wykluczenia=tuple(wykluczenia),
    )


def slad() -> tuple[OdnosnikSladu, ...]:
    return (
        OdnosnikSladu(
            run_id="bieg-001",
            wersja_silnika="1.0.0",
            krok="metryka",
            opis_pl="wartość metryki z przebiegu",
        ),
    )


def ocena(
    relacja: Relacja = "NIE_WIECEJ",
    *,
    kryterium_id: str | None = None,
    m: float | None = None,
    jest_wynik: bool = True,
    stan_logiczny: bool = True,
    u: float | None = None,
    dotyczy: bool = True,
    stan_limitu: StanZrodla = "ZWERYFIKOWANE",
    stan_kryterium: StanZrodla = "ZWERYFIKOWANE",
    jest_limit: bool = True,
    dowod_oceny: StatusDowodu | None = None,
    metoda_wyniku: MetodaDowodu = "DEKLARACJA",
    zakres_oceny: ZakresWaznosci | None = None,
    stosowalnosc_oceny: Stosowalnosc | None = None,
    tolerancja: Wielkosc | None = None,
    braki_dodatkowe: Sequence[str] = (),
    nazwa_przedmiotu: str = "Moduł PV 2 MW",
    warunek_wstepny: str | None = None,
    stan_warunku: StanZrodla = "ZWERYFIKOWANE",
    podstawa_kryterium: PodstawaWymagania | None = None,
) -> OcenaKryterium:
    """Rekord K przez konstruktor ``ocen_kryterium`` (domyślnie: deklaracja konfiguracji)."""
    margines_zadany = KROK_MARGINESU.get(relacja, 0.0) if m is None else m
    return ocen_kryterium(
        kryterium_id=kryterium_id or f"test.{relacja.lower()}",
        przedmiot=przedmiot(nazwa_przedmiotu),
        kryterium=kryterium(relacja, warunek_wstepny=warunek_wstepny, stan_warunku=stan_warunku),
        podstawa=podstawa_kryterium or podstawa(stan_kryterium),
        stosowalnosc=stosowalnosc_oceny or stosowalnosc(dotyczy),
        wynik=(
            wynik(relacja, margines_zadany, metoda=metoda_wyniku, stan_logiczny=stan_logiczny)
            if jest_wynik
            else None
        ),
        limit=limit(relacja, stan_limitu) if jest_limit else None,
        niepewnosc=niepewnosc(u, JEDNOSTKA_MARGINESU[relacja]),
        dowod=dowod_oceny or dowod(),
        zakres_waznosci=zakres_oceny or zakres(),
        slad=slad(),
        tolerancja=tolerancja,
        braki_dodatkowe=braki_dodatkowe,
    )


def wymaganie(
    oceny: Sequence[OcenaKryterium],
    *,
    sposob: MetodaDowodu = "DEKLARACJA",
    pokrycie: PokrycieProgramu | None = None,
    dotyczy: bool = True,
    stan_podstawy: StanZrodla = "ZWERYFIKOWANE",
    dowod_wymagania: StatusDowodu | None = None,
    wykluczenia_wlasne: Sequence[str] = (),
    stosowalnosc_wymagania: Stosowalnosc | None = None,
) -> WynikWymagania:
    """Rekord W przez ``zagreguj_wymaganie``; zakres agregatu = suma wykluczeń składników."""
    if pokrycie is None:
        pokrycie = "PELNE" if sposob == "SYMULACJA" else "NIE_DOTYCZY"
    if dowod_wymagania is None:
        if sposob == "SYMULACJA":
            dowod_wymagania = dowod_symulacji(w_domenie=None)
        elif sposob == "OBLICZENIE":
            dowod_wymagania = dowod_obliczenia()
        else:
            dowod_wymagania = dowod(
                metoda=sposob,
                twierdzenie=(
                    ClaimKind.DECLARED_CONFIGURATION
                    if sposob in ("DEKLARACJA", "OCENA_OPERATORA")
                    else ClaimKind.DYNAMIC_PERFORMANCE
                ),
            )
    wykluczenia = list(
        dict.fromkeys(
            [w for o in oceny for w in o.zakres_waznosci.wykluczenia] + list(wykluczenia_wlasne)
        )
    )
    return zagreguj_wymaganie(
        wymaganie_id="rfg.art14_3",
        nazwa_pl="Zdolność do pozostania w pracy podczas zwarcia",
        podstawa=podstawa(
            stan_podstawy,
            dokument="Rozporządzenie Komisji (UE) 2016/631",
            jednostka="art. 14 ust. 3",
        ),
        stosowalnosc=stosowalnosc_wymagania or stosowalnosc(dotyczy),
        sposob_wykazania=sposob,
        oceny_skladowe=oceny,
        pokrycie_programu=pokrycie,
        pokrycie_programu_pl=(
            "3 głębokości zapadu × 2 poziomy mocy czynnej"
            if pokrycie != "NIE_DOTYCZY"
            else "wymaganie wykazywane bez programu badań"
        ),
        dowod=dowod_wymagania,
        zakres_waznosci=zakres(rodzaj=None, wykluczenia=wykluczenia),
        slad=slad(),
    )


#: Niepewność mniejsza od kroku marginesu (wynik rozstrzygalny) — dla metod wymagających
#: oszacowania niepewności (symulacja).
NIEPEWNOSC_ROZSTRZYGALNA: dict[Relacja, float] = {
    "NIE_WIECEJ": 0.5,
    "NIE_MNIEJ": 0.5,
    "PASMO": 0.125,
    "OBWIEDNIA_DOLNA": 0.03125,
    "OBWIEDNIA_GORNA": 0.03125,
    "LOGICZNE": 0.25,
}


def rekordy_k() -> list[tuple[str, OcenaKryterium]]:
    """Katalog rekordów K: każda relacja × każda droga do każdego statusu reguły §2.2."""
    rekordy: list[tuple[str, OcenaKryterium]] = []
    for relacja in RELACJE:
        krok = KROK_MARGINESU.get(relacja, 0.0)
        u_symulacji = NIEPEWNOSC_ROZSTRZYGALNA[relacja]
        rekordy.append((f"{relacja}-spelnia", ocena(relacja)))
        if relacja == "LOGICZNE":
            rekordy.append((f"{relacja}-nie_spelnia", ocena(relacja, stan_logiczny=False)))
            rekordy.append(
                (f"{relacja}-brak_podstawy", ocena(relacja, stan_kryterium="NIEUSTALONE"))
            )
        else:
            rekordy.append((f"{relacja}-nie_spelnia", ocena(relacja, m=-krok)))
            rekordy.append((f"{relacja}-niejednoznaczny", ocena(relacja, u=krok)))
            rekordy.append((f"{relacja}-brak_podstawy", ocena(relacja, stan_limitu="NIEUSTALONE")))
            rekordy.append((f"{relacja}-brak_limitu", ocena(relacja, jest_limit=False)))
        rekordy.append((f"{relacja}-brak_wyniku", ocena(relacja, jest_wynik=False)))
        rekordy.append(
            (
                f"{relacja}-metoda_niedopuszczalna",
                ocena(relacja, dowod_oceny=dowod(twierdzenie=ClaimKind.DYNAMIC_PERFORMANCE)),
            )
        )
        rekordy.append((f"{relacja}-nie_dotyczy", ocena(relacja, dotyczy=False)))
        rekordy.append(
            (
                f"{relacja}-dane_przyjete",
                ocena(relacja, dowod_oceny=dowod(stan_danych="UNVALIDATED_INPUT")),
            )
        )
        rekordy.append(
            (
                f"{relacja}-symulacja_model_niezwalidowany",
                ocena(
                    relacja,
                    dowod_oceny=dowod_symulacji(status_modelu="UNVALIDATED_MODEL"),
                    metoda_wyniku="SYMULACJA",
                    u=u_symulacji,
                ),
            )
        )
        rekordy.append(
            (
                f"{relacja}-symulacja_zwalidowana",
                ocena(
                    relacja,
                    dowod_oceny=dowod_symulacji(),
                    metoda_wyniku="SYMULACJA",
                    u=u_symulacji,
                ),
            )
        )
        rekordy.append(
            (
                f"{relacja}-symulacja_poza_domena",
                ocena(
                    relacja,
                    dowod_oceny=dowod_symulacji(w_domenie=False),
                    metoda_wyniku="SYMULACJA",
                    u=u_symulacji,
                ),
            )
        )
        rekordy.append(
            (
                f"{relacja}-obliczenie_statyczne",
                ocena(
                    relacja,
                    dowod_oceny=dowod_obliczenia(),
                    metoda_wyniku="OBLICZENIE",
                    zakres_oceny=zakres(rodzaj="POWER_FLOW"),
                ),
            )
        )
        rekordy.append(
            (
                f"{relacja}-warunek_wstepny_nieustalony",
                ocena(
                    relacja,
                    warunek_wstepny="U_PCC(t) ≥ obwiednia zapadu w całym przedziale",
                    stan_warunku="NIEUSTALONE",
                ),
            )
        )
    return rekordy


def rekordy_w() -> list[tuple[str, WynikWymagania]]:
    """Katalog rekordów W: każda droga do każdego statusu reguły agregacji §2.3."""
    certyfikat = ocena(
        "LOGICZNE",
        kryterium_id="certyfikat.pokrycie",
        metoda_wyniku="CERTYFIKAT",
        dowod_oceny=dowod(metoda="CERTYFIKAT", twierdzenie=ClaimKind.DYNAMIC_PERFORMANCE),
    )
    symulacja_poza_domena = ocena(
        kryterium_id="symulacja.poza_domena",
        dowod_oceny=dowod_symulacji(w_domenie=False),
        metoda_wyniku="SYMULACJA",
        u=0.5,
    )
    obliczenie = ocena(
        kryterium_id="obliczenie.statyczne",
        dowod_oceny=dowod_obliczenia(),
        metoda_wyniku="OBLICZENIE",
        zakres_oceny=zakres(rodzaj="POWER_FLOW"),
    )
    return [
        ("nie_dotyczy", wymaganie([], dotyczy=False)),
        ("brak_metody", wymaganie([], sposob="BRAK_METODY")),
        ("skladowe_nie_dotycza", wymaganie([ocena(dotyczy=False)])),
        (
            "nie_spelnia",
            wymaganie([ocena(kryterium_id="a", m=-2.0), ocena("NIE_MNIEJ", kryterium_id="b")]),
        ),
        ("niejednoznaczny", wymaganie([ocena(u=2.0)])),
        ("nie_oceniono", wymaganie([ocena(jest_wynik=False)])),
        ("brak_podstawy", wymaganie([ocena(stan_limitu="NIEUSTALONE")])),
        ("pokrycie_czesciowe", wymaganie([ocena()], sposob="SYMULACJA", pokrycie="CZESCIOWE")),
        ("dowod_niepelny", wymaganie([ocena(dowod_oceny=dowod(stan_danych="UNVALIDATED_INPUT"))])),
        (
            "spelnia",
            wymaganie(
                [ocena(kryterium_id="a"), ocena("PASMO", kryterium_id="b"), ocena("LOGICZNE")]
            ),
        ),
        ("certyfikat", wymaganie([certyfikat], sposob="CERTYFIKAT")),
        (
            "stan_koncowy",
            wymaganie([ocena(kryterium_id="odbudowa.stan_koncowy"), ocena("PASMO")]),
        ),
        ("dowod_laczony_pelny", wymaganie([certyfikat, ocena()], sposob="DOWOD_LACZONY")),
        (
            "dowod_laczony_niepelny",
            wymaganie(
                [certyfikat, symulacja_poza_domena], sposob="DOWOD_LACZONY", pokrycie="PELNE"
            ),
        ),
        ("symulacja_poza_domena", wymaganie([symulacja_poza_domena], sposob="SYMULACJA")),
        ("obliczenie_statyczne", wymaganie([obliczenie], sposob="OBLICZENIE")),
    ]
