"""Generator tekstu werdyktu wyjaśnialnego — JEDYNE miejsce składania ``zdanie_pl``,
``przyczyna_pl``, ``czego_brakuje``, ``zastrzezenia`` i powodów niepełności dowodu (§5).

Tekst powstaje WYŁĄCZNIE z pól rekordu: stała jest tylko rama gramatyczna zdania. Reguła
(``werdykt.decyzja``) decyduje, kiedy brak albo powód występuje, i przekazuje tu fakty; ten
moduł nie importuje ``decyzja`` (kierunek zależności: decyzja → wyjasnienie → kontrakt).
Interfejs i dokument formalny pokazują TO SAMO zdanie i TE SAME zastrzeżenia (T13).

Liczby: przecinek dziesiętny, bez separatora tysięcy, najwyżej 4 cyfry znaczące, bez zbędnych
zer końcowych, znak minus typograficzny (U+2212), spacja przed jednostką; jednostka
bezwymiarowa ``"1"`` nie jest dopisywana. Formatowanie jest deterministyczne (dziesiętne
zaokrąglenie połówkowe w górę na zapisie ``repr`` liczby).
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from decimal import ROUND_HALF_UP, Decimal

from werdykt.kontrakt import (
    JEDNOSTKA_LOGICZNA,
    KOLEJNOSC_METOD,
    METODY_DOPUSZCZALNE_DLA_TWIERDZENIA,
    METODY_OBLICZENIOWE,
    METODY_PRZYDATNE_DLA_TWIERDZENIA,
    METODY_PRZYDATNE_ZAWSZE,
    METODY_TYLKO_WYMAGANIA,
    POZIOMY_BEZ_WALIDACJI,
    TWIERDZENIA_Z_OBLICZENIEM,
    DanaPrzyjeta,
    KrokRegulyK,
    KrokRegulyW,
    Kryterium,
    LimitKryterium,
    Margines,
    MetodaDowodu,
    Niepewnosc,
    OcenaKryterium,
    PodstawaWymagania,
    PoziomRekordu,
    Przedmiot,
    Relacja,
    RodzajPodstawy,
    RodzajSkali,
    StanZrodla,
    StatusDowodu,
    StatusWerdyktu,
    Stosowalnosc,
    Wielkosc,
    WyjasnienieWerdyktu,
    WynikKryterium,
    ZakresWaznosci,
)
from werdykt.proweniencja import ClaimKind, EvidenceTier

# Nazwy wartości osi dowodu W TEKŚCIE: poziom dowodowy, rodzaj twierdzenia i jakość danej mają
# JEDNO źródło nazwy — ``label_pl`` wyliczeń ``werdykt.proweniencja`` (lustro karty werdyktu
# ``frontend/src/ui2/wyniki/wzorzec/KartaWerdyktu.tsx``). Kod wyliczenia zostaje WYŁĄCZNIE
# w polach rekordu (``dowod.poziom``, ``dowod.status_modelu``, ``dowod.status_danych.stan``,
# ``dana.jakosc``, ``podstawa.status``) — zdania ``*_pl``, ``czego_brakuje`` i ``zastrzezenia``
# niosą tylko nazwy (strażnik ``werdykt_wyjasnialny_guard``, sprawdzenie ``5_kod_w_tekscie``).

#: Stan źródła podstawy W TEKŚCIE — lustro karty werdyktu (`NAZWA_STANU_ZRODLA_PL` w
#: ``KartaWerdyktu.tsx``); kod zostaje w polu ``podstawa.status``. Blok dokumentu formalnego
#: (``werdykt.dokument``) czyta tę samą mapę.
NAZWA_STANU_ZRODLA_PL: dict[StanZrodla, str] = {
    "ZWERYFIKOWANE": "zweryfikowane",
    "WSKAZANE": "wskazane (dokument i jednostka redakcyjna wskazane, treść poza repozytorium)",
    "NIEUSTALONE": "nieustalone",
}
#: Stan źródła wymagany dla dowodu pełnego — w tekście powodów niepełności.
_STAN_WYMAGANY_PL = "zweryfikowane albo wskazane"
_SIMULACJA_ZWALIDOWANA = EvidenceTier.VALIDATED_SIMULATION.label_pl
#: Status modelu urządzenia wymagany dla symulacji jako dowodu (``STATUSY_MODELU_ZWALIDOWANEGO``).
_MODEL_ZWALIDOWANY_PL = (
    "model urządzenia zwalidowany wynikiem testu albo model urządzenia certyfikowany"
)

#: Nazwy metod dowodu w tekście.
NAZWA_METODY_PL: dict[MetodaDowodu, str] = {
    "CERTYFIKAT": "certyfikat urządzenia",
    "RAPORT_Z_TESTU": "raport z testu",
    "SYMULACJA": "symulacja",
    "OBLICZENIE": "obliczenie",
    "DEKLARACJA": "deklaracja",
    "POMIAR": "pomiar",
    "OCENA_OPERATORA": "ocena operatora",
    "DOWOD_LACZONY": "dowód łączony",
    "BRAK_METODY": "brak metody",
}
#: Nazwy rodzajów twierdzenia (dopełniacz: „dla twierdzenia …").
NAZWA_TWIERDZENIA_PL: dict[ClaimKind, str] = {
    ClaimKind.DYNAMIC_PERFORMANCE: "twierdzenia o zachowaniu dynamicznym",
    ClaimKind.DECLARED_CONFIGURATION: "twierdzenia o konfiguracji zadeklarowanej",
    ClaimKind.STATIC_CALCULATION: "twierdzenia z obliczenia statycznego",
}
#: Nazwy rodzajów twierdzenia w dopełniaczu przedmiotu („nie wykazuje …").
NAZWA_TWIERDZENIA_DOPELNIACZ_PL: dict[ClaimKind, str] = {
    ClaimKind.DYNAMIC_PERFORMANCE: "zachowania dynamicznego",
    ClaimKind.DECLARED_CONFIGURATION: "konfiguracji zadeklarowanej",
    ClaimKind.STATIC_CALCULATION: "wielkości z obliczenia statycznego",
}
#: Nazwy rodzajów podstawy.
NAZWA_RODZAJU_PODSTAWY_PL: dict[RodzajPodstawy, str] = {
    "ROZPORZADZENIE_UE": "rozporządzenie UE",
    "NORMA": "norma",
    "PRAWO_KRAJOWE": "prawo krajowe",
    "WOS": "wymogi ogólnego stosowania (WOS)",
    "PROCEDURA_PTPIREE": "procedura PTPiREE",
    "WIPWC": "WiPWC",
    "OSD": "wymagania operatora systemu dystrybucyjnego",
    "KATALOG_PRODUCENTA": "katalog producenta",
    "ZALOZENIE_PROJEKTOWE": "założenie projektowe",
    "NIEUSTALONA": "warstwa o nieustalonym pochodzeniu",
}
#: Nazwy rodzaju skali marginesu względnego (dopełniacz).
NAZWA_SKALI_PL: dict[RodzajSkali, str] = {
    "TOLERANCJA": "tolerancji",
    "LIMIT": "wartości granicznej",
    "NIEPEWNOSC": "niepewności",
}
_KIERUNEK_NARUSZENIA: dict[Relacja, str] = {
    "NIE_WIECEJ": "przekracza wartość graniczną",
    "NIE_MNIEJ": "nie osiąga wartości granicznej",
    "PASMO": "wychodzi poza pasmo",
    "OBWIEDNIA_DOLNA": "schodzi poniżej obwiedni dolnej",
    "OBWIEDNIA_GORNA": "przekracza obwiednię górną",
}
_MINUS = "−"
_CYFRY_ZNACZACE = 4
_METODY_WYKAZANIA_BRAK_METODY = "certyfikat urządzenia albo raport z badania typu"


# ---------------------------------------------------------------------------
# Formatowanie liczb
# ---------------------------------------------------------------------------


def format_liczba(wartosc: float, *, znak: bool = False) -> str:
    """Liczba po polsku: przecinek, ≤ 4 cyfry znaczące, bez zer końcowych i separatora."""
    if not math.isfinite(wartosc):
        raise ValueError(f"Liczba nieskończona albo nieokreślona nie ma zapisu ({wartosc}).")
    dziesietna = Decimal(repr(wartosc))
    if dziesietna.is_zero():
        return "0"
    modul = abs(dziesietna)
    kwant = Decimal(1).scaleb(modul.adjusted() - (_CYFRY_ZNACZACE - 1))
    zaokraglona = modul.quantize(kwant, rounding=ROUND_HALF_UP).normalize()
    tekst = format(zaokraglona, "f").replace(".", ",")
    if dziesietna < 0:
        return _MINUS + tekst
    return "+" + tekst if znak else tekst


def format_wielkosc(w: Wielkosc, *, znak: bool = False) -> str:
    """Wielkość z jednostką po spacji (np. ``"+0,037 p.u. (U_n)"``, ``"89,8 %"``, ``"1800 s"``)."""
    liczba = format_liczba(w.wartosc, znak=znak)
    if w.jednostka == JEDNOSTKA_LOGICZNA:
        return liczba
    return f"{liczba} {w.jednostka}"


def _sekundy(t_s: float) -> str:
    return f"{format_liczba(t_s)} s"


def _wielka(tekst: str) -> str:
    return tekst[:1].upper() + tekst[1:]


def _bez_kropki(tekst: str) -> str:
    """Tekst wstawiany do środka zdania — bez kropki końcowej źródła."""
    return tekst.rstrip().rstrip(".")


def _albo(czesci: Sequence[str]) -> str:
    if len(czesci) <= 1:
        return "".join(czesci)
    return f"{', '.join(czesci[:-1])} albo {czesci[-1]}"


def _lista_metod(metody: Iterable[MetodaDowodu]) -> str:
    zbior = set(metody)
    return _albo([NAZWA_METODY_PL[m] for m in KOLEJNOSC_METOD if m in zbior])


def _lista_metod_kryterium(metody: Iterable[MetodaDowodu]) -> str:
    """Lista metod dla rekordu K — bez metod wyłącznie poziomu W (dowód łączony)."""
    return _lista_metod(m for m in metody if m not in METODY_TYLKO_WYMAGANIA)


def _bez_powtorzen(teksty: Iterable[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(teksty))


# ---------------------------------------------------------------------------
# Opisy pól
# ---------------------------------------------------------------------------


def opis_podstawy(podstawa: PodstawaWymagania) -> str:
    """Dokument, wydanie, jednostka redakcyjna i rodzaj podstawy."""
    czesci = [f"„{podstawa.dokument}”"]
    if podstawa.wydanie is not None:
        czesci.append(f"wydanie {podstawa.wydanie}")
    if podstawa.jednostka_redakcyjna is not None:
        czesci.append(podstawa.jednostka_redakcyjna)
    return f"{', '.join(czesci)} ({NAZWA_RODZAJU_PODSTAWY_PL[podstawa.rodzaj]})"


def odnosnik_podstawy(podstawa: PodstawaWymagania) -> str:
    """Krótki odnośnik: jednostka redakcyjna i tytuł dokumentu (bez jednostki — sam tytuł)."""
    if podstawa.jednostka_redakcyjna is None:
        return f"„{podstawa.dokument}”"
    return f"{podstawa.jednostka_redakcyjna} „{podstawa.dokument}”"


def metody_przydatne_pl(rodzaj_twierdzenia: ClaimKind, poziom: PoziomRekordu) -> str:
    """Metody dowodu właściwe dla rodzaju twierdzenia na danym poziomie rekordu — te same
    warunki co ``StatusDowodu.przydatnosc_dowodowa`` (K) i
    ``decyzja.przydatnosc_dowodu_wymagania`` (W), z tych samych stałych ``werdykt.kontrakt``:
    wyłącznie metody dopuszczalne dla rodzaju twierdzenia, w kolejności ``KOLEJNOSC_METOD``;
    dowód łączony wyłącznie na poziomie W."""
    dla_twierdzenia = METODY_PRZYDATNE_DLA_TWIERDZENIA[rodzaj_twierdzenia]
    czesci: list[str] = []
    for metoda in KOLEJNOSC_METOD:
        if metoda not in METODY_DOPUSZCZALNE_DLA_TWIERDZENIA[rodzaj_twierdzenia]:
            continue
        if metoda in METODY_PRZYDATNE_ZAWSZE or metoda in dla_twierdzenia:
            czesci.append(NAZWA_METODY_PL[metoda])
        elif metoda == "SYMULACJA":
            czesci.append(
                f"symulacja na silniku o poziomie dowodowym „{_SIMULACJA_ZWALIDOWANA}” (bieg w "
                f"zadeklarowanej domenie walidacji) z modelem urządzenia: {_MODEL_ZWALIDOWANY_PL}"
            )
        elif metoda == "OBLICZENIE" and rodzaj_twierdzenia in TWIERDZENIA_Z_OBLICZENIEM:
            czesci.append(
                "obliczenie solverem zwalidowanym (zdolność obliczeniowa o najwyższym poziomie "
                "dowodowym, bieg w zadeklarowanej domenie walidacji)"
            )
        elif metoda in METODY_TYLKO_WYMAGANIA and poziom == "W":
            czesci.append(
                "dowód łączony, w którym każde stosowalne kryterium składowe ma metodę przydatną"
            )
    return _albo(czesci)


def nazwa_kompletnosci(kompletnosc: str) -> str:
    """Kompletność dowodu w tekście (kod zostaje w polu ``kompletnosc_dowodu``)."""
    if kompletnosc == "PELNY":
        return "pełny"
    if kompletnosc == "NIEPELNY":
        return "niepełny"
    return "nie dotyczy"


def nazwa_statusu_modelu(status: str) -> str:
    """Status walidacji modelu urządzenia w tekście (kod zostaje w ``dowod.status_modelu``)."""
    if status == "UNVALIDATED_MODEL":
        return "model urządzenia niezwalidowany"
    if status == "VALIDATED_AGAINST_TEST":
        return "model urządzenia zwalidowany wynikiem testu"
    if status == "CERTIFIED_MODEL":
        return "model urządzenia certyfikowany"
    return "nie dotyczy (bez modelu urządzenia)"


def nazwa_stanu_danych(stan: str) -> str:
    """Stan danych wejściowych w tekście (kod zostaje w ``dowod.status_danych.stan``)."""
    return "dane zwalidowane" if stan == "ZWALIDOWANE" else "dane przyjęte bez walidacji"


def nazwa_pokrycia_programu(pokrycie: str) -> str:
    """Pokrycie programu badań w tekście (kod zostaje w ``pokrycie_programu``)."""
    if pokrycie == "PELNE":
        return "pełne"
    if pokrycie == "CZESCIOWE":
        return "częściowe"
    return "nie dotyczy"


def nazwa_skladowej(ocena: OcenaKryterium) -> str:
    """Nazwa oceny składowej w tekście wymagania: opis kryterium i nazwa przedmiotu."""
    return f"{ocena.kryterium.opis_pl} ({ocena.przedmiot.nazwa_pl})"


def z_nazwa_skladowej(ocena: OcenaKryterium, tekst: str) -> str:
    """Tekst składnika przeniesiony do wymagania — poprzedzony nazwą składnika."""
    return f"{nazwa_skladowej(ocena)}: {tekst}"


def _opis_wyniku(wynik: WynikKryterium) -> str:
    tekst = f"{wynik.wielkosc_pl}: {format_wielkosc(wynik.wartosc)}"
    if wynik.chwila_s is not None:
        tekst += f" w chwili t = {_sekundy(wynik.chwila_s)}"
    return tekst


def _opis_stanu(wynik: WynikKryterium) -> str:
    return f"{wynik.wielkosc_pl}: {wynik.punkt_krytyczny_pl}"


def _opis_limitu(relacja: Relacja, limit: LimitKryterium, chwila_s: float | None) -> str:
    if relacja == "NIE_WIECEJ" and limit.wartosc is not None:
        opis = f"wymaganych ≤ {format_wielkosc(limit.wartosc)}"
    elif relacja == "NIE_MNIEJ" and limit.wartosc is not None:
        opis = f"wymaganych ≥ {format_wielkosc(limit.wartosc)}"
    elif relacja == "PASMO" and limit.pasmo is not None:
        dolna, gorna = limit.pasmo
        opis = f"wymaganego pasma od {format_wielkosc(dolna)} do {format_wielkosc(gorna)}"
    elif relacja in ("OBWIEDNIA_DOLNA", "OBWIEDNIA_GORNA") and chwila_s is not None:
        rodzaj = "dolnej" if relacja == "OBWIEDNIA_DOLNA" else "górnej"
        wartosc = Wielkosc(wartosc=limit.wartosc_obwiedni(chwila_s), jednostka=limit.jednostka)
        opis = f"obwiedni {rodzaj} {format_wielkosc(wartosc)} w chwili t = {_sekundy(chwila_s)}"
    else:
        raise ValueError(f"Postać limitu nie pasuje do relacji {relacja}.")
    return f"{opis} wg {odnosnik_podstawy(limit.podstawa)}"


def _opis_wzglednego(margines: Margines) -> str | None:
    if margines.wzgledny is None or margines.skala_rodzaj is None:
        return None
    procent = format_liczba(margines.wzgledny * 100.0, znak=True)
    return f"względnie {procent} % {NAZWA_SKALI_PL[margines.skala_rodzaj]}"


def _opis_marginesu(margines: Margines) -> str:
    if margines.wartosc is None:
        return f"margines niedefiniowalny: {margines.powod_pl}"
    tekst = f"margines {format_wielkosc(margines.wartosc, znak=True)}"
    if margines.punkt_pl is not None:
        tekst += f", punkt: {margines.punkt_pl}"
    wzgledny = _opis_wzglednego(margines)
    if wzgledny is not None:
        tekst += f", {wzgledny}"
    return tekst


def _porownanie(
    relacja: Relacja,
    wynik: WynikKryterium,
    limit: LimitKryterium,
    margines: Margines,
) -> str:
    return (
        f"{_opis_wyniku(wynik)} wobec {_opis_limitu(relacja, limit, wynik.chwila_s)} "
        f"({_opis_marginesu(margines)})"
    )


def _opis_skladowej_z_wynikiem(ocena: OcenaKryterium) -> str:
    """Składnik z wynikiem: numeryczny z limitem i marginesem, logiczny ze stanem."""
    wynik = ocena.wynik
    nazwa = nazwa_skladowej(ocena)
    if wynik is None:
        return f"{nazwa} — brak wyniku"
    if ocena.kryterium.relacja == "LOGICZNE":
        return f"{nazwa} — {_opis_stanu(wynik)}"
    if ocena.limit is None or ocena.margines is None:
        return f"{nazwa} — {_opis_wyniku(wynik)}"
    return (
        f"{nazwa} — {_opis_wyniku(wynik)} wobec "
        f"{_opis_limitu(ocena.kryterium.relacja, ocena.limit, wynik.chwila_s)} "
        f"({_opis_marginesu(ocena.margines)})"
    )


# ---------------------------------------------------------------------------
# Braki nazywane przez regułę (wołane z ``werdykt.decyzja``)
# ---------------------------------------------------------------------------


def brak_metody_dopuszczalnej(dowod: StatusDowodu, dopuszczalne: Iterable[MetodaDowodu]) -> str:
    return (
        f"Metoda dowodu właściwa dla {NAZWA_TWIERDZENIA_PL[dowod.rodzaj_twierdzenia]}: "
        f"{_lista_metod_kryterium(dopuszczalne)} — metoda „{NAZWA_METODY_PL[dowod.metoda]}” jest "
        "niedopuszczalna (wynik pokazywany wyłącznie informacyjnie)."
    )


def brak_wyniku() -> str:
    return (
        "Wynik wielkości ocenianej: brak biegu obliczeń albo symulacji, bieg nieaktualny lub "
        "nieudany albo brak danych wejściowych — wykonaj bieg na aktualnym modelu albo uzupełnij "
        "dane wejściowe."
    )


def brak_limitu() -> str:
    return (
        "Limit kryterium z podstawą (dokument, wydanie, jednostka redakcyjna) — kryterium nie ma "
        "wartości granicznej."
    )


def _brak_podstawy(nazwa: str, podstawa: PodstawaWymagania) -> str:
    tekst = (
        f"{nazwa} o ustalonym pochodzeniu: obecna podstawa {opis_podstawy(podstawa)} ma stan "
        "źródła „nieustalone” — potrzebny dokument źródłowy z wydaniem i jednostką redakcyjną"
    )
    if podstawa.uwagi_pl is not None:
        tekst += f" (uwagi: {_bez_kropki(podstawa.uwagi_pl)})"
    return tekst + "."


def brak_podstawy_limitu(podstawa: PodstawaWymagania) -> str:
    return _brak_podstawy("Podstawa limitu", podstawa)


def brak_podstawy_kryterium(podstawa: PodstawaWymagania) -> str:
    return _brak_podstawy("Podstawa kryterium", podstawa)


def brak_rozstrzygniecia(margines: Wielkosc, niepewnosc: Wielkosc) -> str:
    modul = Wielkosc(wartosc=abs(margines.wartosc), jednostka=margines.jednostka)
    return (
        f"Rozstrzygnięcie wyniku: |m| = {format_wielkosc(modul)} nie przekracza niepewności "
        f"u = {format_wielkosc(niepewnosc)} — potrzebny wynik o mniejszej niepewności "
        "(dokładniejsze obliczenie albo pomiar)."
    )


def brak_metody_wymagania() -> str:
    return (
        f"Metoda wykazania wymagania: {_METODY_WYKAZANIA_BRAK_METODY} pokrywający wymaganie — "
        "narzędzie nie ma metody wykazania."
    )


def brak_skladowych_stosowalnych() -> str:
    return (
        "Ocena co najmniej jednego kryterium składowego stosowalnego do przedmiotu — wymaganie "
        "jest stosowalne, a żadne kryterium składowe nie dotyczy przedmiotu."
    )


def brak_pokrycia_programu(pokrycie_programu_pl: str) -> str:
    return f"Pełne pokrycie programu badań — pokryto: {_bez_kropki(pokrycie_programu_pl)}."


def powod_marginesu_logicznego() -> str:
    return "Kryterium logiczne nie ma marginesu skalarnego — o wyniku decyduje stan logiczny."


# ---------------------------------------------------------------------------
# Powody niepełności dowodu (wołane z ``werdykt.decyzja.kompletnosc_dowodu``)
# ---------------------------------------------------------------------------


def powod_metody(dowod: StatusDowodu, poziom: PoziomRekordu) -> str | None:
    """Powód niewłaściwości metody (dowód nieprzydatny) na danym poziomie rekordu. ``None``,
    gdy jedyną przeszkodą jest model urządzenia ``UNVALIDATED_MODEL`` albo bieg poza domeną
    walidacji — te powody nazywają osobno ``powod_modelu_niezwalidowanego`` i
    ``powod_poza_domena``."""
    rodzaj = dowod.rodzaj_twierdzenia
    twierdzenie = NAZWA_TWIERDZENIA_PL[rodzaj]
    wlasciwe = metody_przydatne_pl(rodzaj, poziom)
    dopuszczalna = dowod.metoda in METODY_DOPUSZCZALNE_DLA_TWIERDZENIA[rodzaj]
    if dowod.metoda == "BRAK_METODY":
        return f"Brak metody dowodu — właściwa metoda dla {twierdzenie}: {wlasciwe}."
    if dopuszczalna and dowod.metoda == "OBLICZENIE" and rodzaj in TWIERDZENIA_Z_OBLICZENIEM:
        if dowod.poziom is EvidenceTier.VALIDATED_SIMULATION:
            return None
        return (
            f"Obliczenie nie jest dowodem właściwym: zdolność obliczeniowa o poziomie dowodowym "
            f"„{dowod.poziom.label_pl}” (wymagany solver zwalidowany — najwyższy poziom "
            "dowodowy zdolności)."
        )
    if dopuszczalna and dowod.metoda == "SYMULACJA":
        czesci = []
        if dowod.poziom is not EvidenceTier.VALIDATED_SIMULATION:
            czesci.append(
                f"silnik o poziomie dowodowym „{dowod.poziom.label_pl}” "
                f"(wymagany „{_SIMULACJA_ZWALIDOWANA}”)"
            )
        if dowod.status_modelu == "NIE_DOTYCZY":
            czesci.append(f"brak statusu modelu urządzenia (wymagany: {_MODEL_ZWALIDOWANY_PL})")
        if not czesci:
            return None
        return f"Symulacja nie jest dowodem właściwym: {'; '.join(czesci)}."
    return (
        f"Metoda dowodu „{NAZWA_METODY_PL[dowod.metoda]}” nie jest właściwa dla {twierdzenie} — "
        f"właściwa metoda: {wlasciwe}."
    )


def powod_reguly_sposobu_wykazania(metoda: MetodaDowodu, podstawa: PodstawaWymagania) -> str:
    """Powód niepełności: reguła, która czyni sposób wykazania właściwym dla wymagania (np.
    pokrycie wymagania certyfikatem urządzenia w warstwie WiPWC), ma stan źródła
    ``NIEUSTALONE``."""
    tekst = (
        f"Reguła sposobu wykazania „{NAZWA_METODY_PL[metoda]}”: podstawa "
        f"{opis_podstawy(podstawa)} ma stan źródła „nieustalone” — reguła bez wskazanej "
        "jednostki redakcyjnej nie czyni tego sposobu wykazania dowodem pełnym (wymagany stan "
        f"źródła {_STAN_WYMAGANY_PL}: dokument, wydanie i jednostka redakcyjna reguły)"
    )
    if podstawa.uwagi_pl is not None:
        tekst += f" (uwagi: {_bez_kropki(podstawa.uwagi_pl)})"
    return tekst + "."


def powod_modelu_niezwalidowanego() -> str:
    return (
        "Model urządzenia niezwalidowany — model konkretnego urządzenia bez walidacji nie "
        f"stanowi pełnego dowodu zgodności (wymagany: {_MODEL_ZWALIDOWANY_PL})."
    )


def opis_danej(dana: DanaPrzyjeta) -> str:
    """Dana przyjęta: nazwa, wartość z jednostką (albo jej brak) i jakość danej."""
    tekst: str = dana.nazwa_pl
    if dana.wartosc is not None:
        tekst += f" = {format_wielkosc(dana.wartosc)}"
    else:
        tekst += " (bez wartości liczbowej)"
    if dana.jakosc is not None:
        tekst += f", jakość danej: {dana.jakosc.label_pl}"
    return tekst


def powod_danej_przyjetej(dana: DanaPrzyjeta) -> str:
    return f"Dana przyjęta bez walidacji: {opis_danej(dana)} — {_bez_kropki(dana.powod_pl)}."


def powod_podstawy_nieustalonej(podstawa: PodstawaWymagania) -> str:
    return (
        f"Podstawa {opis_podstawy(podstawa)} ma stan źródła „nieustalone” — wymagany stan "
        f"źródła {_STAN_WYMAGANY_PL} (dokument, wydanie i jednostka redakcyjna)."
    )


def _nazwa_domeny(dowod: StatusDowodu) -> str:
    if dowod.domena_pl is None:
        raise ValueError(
            "Rozstrzygnięta przynależność biegu do domeny walidacji wymaga nazwy domeny."
        )
    return _bez_kropki(dowod.domena_pl)


def powod_poza_domena(dowod: StatusDowodu) -> str:
    return (
        f"Bieg poza zadeklarowaną domeną walidacji: {_nazwa_domeny(dowod)} — wymagany bieg "
        "w domenie walidacji silnika."
    )


def powod_dowodu_laczonego_bez_skladowych() -> str:
    return "Dowód łączony bez stosowalnych ocen składowych — żaden składnik nie wykazuje wymagania."


def powod_dowodu_laczonego(nieprzydatne: Sequence[OcenaKryterium]) -> str:
    """Dowód łączony nieprzydatny: nazwa i metoda każdego składnika bez metody przydatnej."""
    skladniki = "; ".join(
        f"{nazwa_skladowej(ocena)}, metoda „{NAZWA_METODY_PL[ocena.dowod.metoda]}”"
        for ocena in nieprzydatne
    )
    return (
        "Dowód łączony nie jest dowodem właściwym — składniki bez metody przydatnej: "
        f"{skladniki}."
    )


# ---------------------------------------------------------------------------
# Zastrzeżenia (wyłącznie z pól rekordu)
# ---------------------------------------------------------------------------


def _zastrzezenie_podstawy(podstawa: PodstawaWymagania) -> str | None:
    if podstawa.status == "ZWERYFIKOWANE":
        return None
    if podstawa.status == "WSKAZANE":
        return (
            f"Podstawa {opis_podstawy(podstawa)}: stan źródła „wskazane” — dokument i jednostka "
            "redakcyjna wskazane, treść dokumentu nie jest dołączona do repozytorium."
        )
    tekst = (
        f"Podstawa {opis_podstawy(podstawa)}: stan źródła „nieustalone” — pochodzenie wartości "
        "nieustalone"
    )
    if podstawa.uwagi_pl is not None:
        tekst += f" ({_bez_kropki(podstawa.uwagi_pl)})"
    return tekst + "."


def _zastrzezenia_stosowalnosci(stosowalnosc: Stosowalnosc) -> list[str]:
    zastrzezenia: list[str] = []
    podstawa = stosowalnosc.podstawa
    if podstawa is not None and podstawa.status != "ZWERYFIKOWANE":
        zastrzezenia.append(
            f"Stosowalność wyznaczona wg podstawy o stanie źródła "
            f"„{NAZWA_STANU_ZRODLA_PL[podstawa.status]}”: "
            f"{opis_podstawy(podstawa)}."
        )
    if stosowalnosc.typ_modulu is not None and stosowalnosc.modul_istniejacy is None:
        zastrzezenia.append(
            "Status nowy/istniejący modułu nieustalony (art. 4 rozporządzenia 2016/631) — "
            "stosowalność wymagań wyznaczona bez rozstrzygnięcia tego statusu."
        )
    return zastrzezenia


def _zastrzezenia_dowodu(dowod: StatusDowodu) -> list[str]:
    zastrzezenia: list[str] = []
    if dowod.status_modelu == "UNVALIDATED_MODEL":
        zastrzezenia.append(
            "Model urządzenia niezwalidowany — model konkretnego urządzenia bez walidacji; "
            "wynik nie stanowi pełnego dowodu zgodności urządzenia."
        )
    if dowod.metoda in METODY_OBLICZENIOWE and dowod.poziom in POZIOMY_BEZ_WALIDACJI:
        zastrzezenia.append(
            f"Poziom dowodowy zdolności narzędzia: „{dowod.poziom.label_pl}” — "
            "obliczenie bez ustalonej poprawności fizycznej nie jest dowodem regulacyjnym."
        )
    if dowod.w_domenie_walidacji is False:
        zastrzezenia.append(
            f"Bieg poza zadeklarowaną domeną walidacji: {_nazwa_domeny(dowod)} — wynik spoza "
            "domeny walidacji silnika nie stanowi pełnego dowodu."
        )
    for dana in dowod.status_danych.dane_przyjete:
        zastrzezenia.append(
            f"Dana przyjęta bez walidacji: {opis_danej(dana)} — " f"{_bez_kropki(dana.powod_pl)}."
        )
    return zastrzezenia


def _zastrzezenie_zakresu(zakres: ZakresWaznosci) -> str | None:
    if not zakres.wykluczenia:
        return None
    return (
        f"Zakres ważności: {_bez_kropki(zakres.opis_pl)} — wynik nie obejmuje: "
        f"{'; '.join(_bez_kropki(w) for w in zakres.wykluczenia)}."
    )


def _zastrzezenie_warunku_wstepnego(kryterium: Kryterium) -> str | None:
    """Podstawa warunku wstępnego o stanie ≠ ``ZWERYFIKOWANE`` — rozstrzygnięcie, czy obowiązek
    został uruchomiony, opiera się na tej podstawie (np. obwiednia z profilu)."""
    podstawa = kryterium.warunek_wstepny_podstawa
    warunek = kryterium.warunek_wstepny_pl
    if podstawa is None or warunek is None or podstawa.status == "ZWERYFIKOWANE":
        return None
    tekst = (
        f"Warunek wstępny („{_bez_kropki(warunek)}”) oparty na podstawie o stanie źródła "
        f"„{NAZWA_STANU_ZRODLA_PL[podstawa.status]}”: {opis_podstawy(podstawa)}"
    )
    if podstawa.uwagi_pl is not None:
        tekst += f" (uwagi: {_bez_kropki(podstawa.uwagi_pl)})"
    return tekst + "."


def _zastrzezenia_pol(
    *,
    podstawy: Sequence[PodstawaWymagania],
    kryterium: Kryterium | None,
    stosowalnosc: Stosowalnosc,
    dowod: StatusDowodu,
    zakres_waznosci: ZakresWaznosci,
) -> list[str]:
    kandydaci: list[str | None] = [_zastrzezenie_podstawy(p) for p in podstawy]
    if kryterium is not None:
        kandydaci.append(_zastrzezenie_warunku_wstepnego(kryterium))
    kandydaci.extend(_zastrzezenia_stosowalnosci(stosowalnosc))
    kandydaci.extend(_zastrzezenia_dowodu(dowod))
    kandydaci.append(_zastrzezenie_zakresu(zakres_waznosci))
    return [z for z in kandydaci if z is not None]


def zastrzezenia_kryterium(
    *,
    kryterium: Kryterium,
    podstawa: PodstawaWymagania,
    stosowalnosc: Stosowalnosc,
    limit: LimitKryterium | None,
    dowod: StatusDowodu,
    zakres_waznosci: ZakresWaznosci,
) -> tuple[str, ...]:
    """Zastrzeżenia rekordu K: stan źródła ≠ ZWERYFIKOWANE (podstawa kryterium, podstawa
    limitu, podstawa warunku wstępnego, podstawa stosowalności), UNVALIDATED_MODEL, poziom
    zdolności bez walidacji, bieg poza domeną walidacji, UNVALIDATED_INPUT (każda dana
    z wartością) i wykluczenia zakresu ważności."""
    podstawy = [podstawa] if limit is None else [podstawa, limit.podstawa]
    return _bez_powtorzen(
        _zastrzezenia_pol(
            podstawy=podstawy,
            kryterium=kryterium,
            stosowalnosc=stosowalnosc,
            dowod=dowod,
            zakres_waznosci=zakres_waznosci,
        )
    )


def _zastrzezenie_reguly_sposobu(
    metoda: MetodaDowodu, podstawa: PodstawaWymagania | None
) -> str | None:
    """Podstawa reguły sposobu wykazania o stanie ≠ ``ZWERYFIKOWANE`` — sposób wykazania
    wymagania (np. certyfikat) opiera się na tej regule."""
    if podstawa is None or podstawa.status == "ZWERYFIKOWANE":
        return None
    tekst = (
        f"Reguła sposobu wykazania „{NAZWA_METODY_PL[metoda]}” oparta na podstawie o stanie "
        f"źródła „{NAZWA_STANU_ZRODLA_PL[podstawa.status]}”: {opis_podstawy(podstawa)}"
    )
    if podstawa.uwagi_pl is not None:
        tekst += f" (uwagi: {_bez_kropki(podstawa.uwagi_pl)})"
    return tekst + "."


def zastrzezenia_wymagania(
    *,
    podstawa: PodstawaWymagania,
    stosowalnosc: Stosowalnosc,
    oceny: Sequence[OcenaKryterium],
    dowod: StatusDowodu,
    zakres_waznosci: ZakresWaznosci,
    podstawa_sposobu_wykazania: PodstawaWymagania | None = None,
) -> tuple[str, ...]:
    """Zastrzeżenia rekordu W: suma zastrzeżeń składników (kolejność składników, bez
    powtórzeń), zastrzeżenia z pól samego wymagania i zastrzeżenie podstawy reguły sposobu
    wykazania (stan ≠ ``ZWERYFIKOWANE``)."""
    skladowe = [z for ocena in oceny for z in ocena.wyjasnienie.zastrzezenia]
    wlasne = _zastrzezenia_pol(
        podstawy=[podstawa],
        kryterium=None,
        stosowalnosc=stosowalnosc,
        dowod=dowod,
        zakres_waznosci=zakres_waznosci,
    )
    regula = _zastrzezenie_reguly_sposobu(dowod.metoda, podstawa_sposobu_wykazania)
    return _bez_powtorzen([*skladowe, *wlasne, *([regula] if regula is not None else [])])


# ---------------------------------------------------------------------------
# Wyjaśnienie rekordu K
# ---------------------------------------------------------------------------


def _uwaga_modelu_naruszenia(dowod: StatusDowodu) -> str | None:
    if dowod.status_modelu != "UNVALIDATED_MODEL":
        return None
    return (
        "naruszenie wykazano na modelu urządzenia bez walidacji — wymaga działania "
        "projektowego albo walidacji modelu"
    )


def wyjasnienie_kryterium(
    *,
    status: StatusWerdyktu,
    krok: KrokRegulyK,
    przedmiot: Przedmiot,
    kryterium: Kryterium,
    podstawa: PodstawaWymagania,
    stosowalnosc: Stosowalnosc,
    wynik: WynikKryterium | None,
    limit: LimitKryterium | None,
    margines: Margines | None,
    niepewnosc: Niepewnosc,
    dowod: StatusDowodu,
    metody_dopuszczalne: Iterable[MetodaDowodu],
    czego_brakuje: Sequence[str],
    zastrzezenia: Sequence[str],
    braki_dodatkowe: Sequence[str],
) -> WyjasnienieWerdyktu:
    """Wyjaśnienie rekordu K wg wzorców §5.1; treść wybiera krok reguły, który wydał status."""
    relacja = kryterium.relacja
    naglowek = f"{kryterium.opis_pl} ({przedmiot.nazwa_pl})"
    porownanie = (
        _porownanie(relacja, wynik, limit, margines)
        if wynik is not None and limit is not None and margines is not None
        else None
    )
    zdania: list[str]
    przyczyna: str | None
    if krok == "STOSOWALNOSC":
        if stosowalnosc.warunek_wstepny_nieuruchomiony:
            zdania = [
                f"{naglowek} — nie dotyczy: {_bez_kropki(stosowalnosc.powod_pl)}; obowiązek nie "
                f"został uruchomiony: {_bez_kropki(kryterium.warunek_wstepny_pl or '')}."
            ]
        else:
            zdania = [f"{naglowek} — nie dotyczy: {_bez_kropki(stosowalnosc.powod_pl)}."]
        przyczyna = stosowalnosc.powod_pl
    elif krok == "METODA":
        twierdzenie = NAZWA_TWIERDZENIA_DOPELNIACZ_PL[dowod.rodzaj_twierdzenia]
        if dowod.metoda == "BRAK_METODY":
            fraza = f"brak metody dowodu, która wykazuje {twierdzenie}"
        else:
            fraza = f"metoda „{NAZWA_METODY_PL[dowod.metoda]}” nie wykazuje {twierdzenie}"
        zdanie = f"{naglowek} — ocena niewykonana: {fraza}"
        if wynik is not None:
            informacja = (
                porownanie
                if porownanie is not None
                else _opis_stanu(wynik) if relacja == "LOGICZNE" else _opis_wyniku(wynik)
            )
            rodzaj_wartosci = (
                "wartość zadeklarowana"
                if wynik.metoda == "DEKLARACJA"
                else f"wartość wyznaczona metodą „{NAZWA_METODY_PL[wynik.metoda]}”"
            )
            zdanie += f"; {rodzaj_wartosci} pokazana informacyjnie: {informacja}"
        zdania = [f"{zdanie}; właściwa metoda: {_lista_metod_kryterium(metody_dopuszczalne)}."]
        przyczyna = fraza
    elif krok == "WYNIK":
        dopisek = (
            f" ({'; '.join(_bez_kropki(b) for b in braki_dodatkowe)})" if braki_dodatkowe else ""
        )
        zdania = [
            f"{naglowek} — ocena niewykonana: brak wyznaczonej wielkości ocenianej{dopisek}.",
            "Akcja naprawcza: wykonaj bieg na aktualnym modelu albo uzupełnij dane wejściowe.",
        ]
        przyczyna = "brak wyznaczonej wielkości ocenianej" + (
            dopisek or " (brak biegu, bieg nieaktualny albo nieudany, albo brak danych wejściowych)"
        )
    elif krok == "PODSTAWA":
        poczatek = f"{naglowek} — werdykt zgodności niewydany: brak ustalonej podstawy parametru"
        if relacja == "LOGICZNE":
            przyczyna = f"podstawa kryterium {opis_podstawy(podstawa)} ma stan źródła „nieustalone”"
            zdania = [f"{poczatek} — {przyczyna}."]
            if wynik is not None:
                zdania.append(f"Wynik informacyjny: {_opis_stanu(wynik)}.")
        elif limit is None:
            przyczyna = "kryterium nie ma limitu z podstawą"
            zdania = [f"{poczatek} — {przyczyna}."]
            if wynik is not None:
                zdania.append(f"Wynik obliczeniowy (informacyjnie): {_opis_wyniku(wynik)}.")
        else:
            przyczyna = (
                f"podstawa limitu {opis_podstawy(limit.podstawa)} ma stan źródła „nieustalone”"
            )
            zdania = [f"{poczatek} — {przyczyna}."]
            if porownanie is not None:
                zdania.append(
                    f"Wynik obliczeniowy wobec przyjętej wartości (informacyjnie): {porownanie}."
                )
    elif krok == "NIEJEDNOZNACZNOSC":
        if (
            porownanie is None
            or margines is None
            or margines.wartosc is None
            or niepewnosc.wartosc is None
        ):
            raise ValueError("Wynik niejednoznaczny wymaga marginesu i oszacowanej niepewności.")
        modul = Wielkosc(
            wartosc=abs(margines.wartosc.wartosc), jednostka=margines.wartosc.jednostka
        )
        zdania = [
            f"{naglowek} — wynik niejednoznaczny, wymaga weryfikacji.",
            f"{_wielka(porownanie)}; niepewność ±{format_wielkosc(niepewnosc.wartosc)} "
            f"({niepewnosc.metoda_pl}).",
            f"Rozstrzygnie: wynik o niepewności mniejszej niż |m| = {format_wielkosc(modul)} "
            "(dokładniejsze obliczenie albo pomiar).",
        ]
        przyczyna = (
            f"|m| = {format_wielkosc(modul)} nie przekracza niepewności "
            f"u = {format_wielkosc(niepewnosc.wartosc)}"
        )
    else:
        if wynik is None:
            raise ValueError("Werdykt z marginesu wymaga wyniku.")
        spelnia = status == "SPELNIA"
        zdania = [f"{naglowek} — kryterium {'spełnione' if spelnia else 'naruszone'}."]
        if relacja == "LOGICZNE":
            stan = "stan wymagany" if spelnia else "stan przeciwny do wymaganego"
            zdania.append(
                f"{_wielka(_opis_stanu(wynik))} ({stan} wg {odnosnik_podstawy(podstawa)})."
            )
            przyczyna = None if spelnia else _opis_stanu(wynik)
        else:
            if porownanie is None or margines is None or margines.wartosc is None:
                raise ValueError("Werdykt kryterium liczbowego wymaga limitu i marginesu.")
            zdania.append(f"{_wielka(porownanie)}.")
            przyczyna = None
            if not spelnia:
                modul = Wielkosc(
                    wartosc=abs(margines.wartosc.wartosc), jednostka=margines.wartosc.jednostka
                )
                przyczyna = (
                    f"{wynik.wielkosc_pl} {_KIERUNEK_NARUSZENIA[relacja]} o "
                    f"{format_wielkosc(modul)}"
                )
                if margines.punkt_pl is not None:
                    przyczyna += f" ({margines.punkt_pl})"
        uwaga = None if spelnia else _uwaga_modelu_naruszenia(dowod)
        if uwaga is not None:
            zdania.append(f"{_wielka(uwaga)}.")
    return WyjasnienieWerdyktu(
        zdanie_pl=" ".join(zdania),
        przyczyna_pl=przyczyna,
        czego_brakuje=tuple(czego_brakuje),
        zastrzezenia=tuple(zastrzezenia),
    )


# ---------------------------------------------------------------------------
# Wyjaśnienie rekordu W
# ---------------------------------------------------------------------------


def _opis_naruszenia(ocena: OcenaKryterium) -> str:
    tekst = _opis_skladowej_z_wynikiem(ocena)
    uwaga = _uwaga_modelu_naruszenia(ocena.dowod)
    return f"{tekst} ({uwaga})" if uwaga is not None else tekst


def _opis_skrotowy(ocena: OcenaKryterium) -> str:
    tekst = f"{nazwa_skladowej(ocena)} — {ocena.etykieta.etykieta_pl.lower()}"
    if ocena.margines is not None and ocena.margines.wartosc is not None:
        tekst += f" (margines {format_wielkosc(ocena.margines.wartosc, znak=True)})"
    return tekst


def _z_przyczyna(ocena: OcenaKryterium) -> str:
    return f"{nazwa_skladowej(ocena)} — {ocena.wyjasnienie.przyczyna_pl}"


def _wyniki_obliczeniowe(oceny: Sequence[OcenaKryterium]) -> str | None:
    z_wynikiem = [
        _opis_skladowej_z_wynikiem(o)
        for o in oceny
        if o.status_maszynowy != "NIE_DOTYCZY" and o.wynik is not None
    ]
    if not z_wynikiem:
        return None
    return f"Wynik obliczeniowy składników: {'; '.join(z_wynikiem)}."


def wyjasnienie_wymagania(
    *,
    krok: KrokRegulyW,
    nazwa_pl: str,
    podstawa: PodstawaWymagania,
    stosowalnosc: Stosowalnosc,
    oceny: Sequence[OcenaKryterium],
    powody_niepelnosci: Sequence[str],
    kryteria_naruszone: Sequence[str],
    kryterium_najblizej_granicy: str | None,
    pokrycie_programu_pl: str,
    dowod: StatusDowodu,
    czego_brakuje: Sequence[str],
    zastrzezenia: Sequence[str],
) -> WyjasnienieWerdyktu:
    """Wyjaśnienie rekordu W: ``NIE_SPELNIA`` nazywa KAŻDY naruszony składnik z marginesem,
    ``SPELNIA`` — kryterium najbliżej granicy z marginesem względnym (albo powód jego braku),
    ``BRAK_DOWODU`` — właściwą metodę, czego brakuje i wynik obliczeniowy składników."""
    naglowek = f"{nazwa_pl} ({odnosnik_podstawy(podstawa)})"
    stosowalne = [o for o in oceny if o.status_maszynowy != "NIE_DOTYCZY"]
    zdania: list[str]
    przyczyna: str
    if krok == "STOSOWALNOSC":
        zdania = [f"{naglowek} — nie dotyczy: {_bez_kropki(stosowalnosc.powod_pl)}."]
        przyczyna = stosowalnosc.powod_pl
    elif krok == "BRAK_METODY":
        zdania = [
            f"{naglowek} — brak wystarczającego dowodu: brak metody wykazania w narzędziu; "
            f"właściwa metoda: {_METODY_WYKAZANIA_BRAK_METODY}."
        ]
        if stosowalne:
            zdania.append(
                "Kryteria składowe (informacyjnie — nie wykazują wymagania): "
                f"{'; '.join(_opis_skrotowy(o) for o in stosowalne)}."
            )
        przyczyna = (
            "sposób wykazania: brak metody w narzędziu (ani certyfikat pokrywający wymaganie, "
            "ani test lub symulacja narzędzia)"
        )
    elif krok == "SKLADOWE_NIE_DOTYCZA":
        zdania = [
            f"{naglowek} — ocena niewykonana: wymaganie jest stosowalne "
            f"({_bez_kropki(stosowalnosc.powod_pl)}), ale żadne kryterium składowe nie dotyczy "
            "ocenianego przedmiotu."
        ]
        przyczyna = "wymaganie stosowalne bez stosowalnego kryterium składowego"
    elif krok == "NARUSZENIE":
        naruszone = [o for o in oceny if o.kryterium_id in kryteria_naruszone]
        pozostale = [o for o in stosowalne if o.kryterium_id not in kryteria_naruszone]
        zdania = [
            f"{naglowek} — wymaganie nie jest spełnione.",
            f"Naruszone kryteria składowe: {'; '.join(_opis_naruszenia(o) for o in naruszone)}.",
        ]
        if pozostale:
            zdania.append(
                f"Pozostałe kryteria składowe: {'; '.join(_opis_skrotowy(o) for o in pozostale)}."
            )
        przyczyna = "; ".join(_z_przyczyna(o) for o in naruszone)
    elif krok in ("NIEJEDNOZNACZNOSC", "NIEOCENIONE", "BRAK_PODSTAWY"):
        if krok == "NIEJEDNOZNACZNOSC":
            status_skladowej: StatusWerdyktu = "NIEJEDNOZNACZNY"
            fraza = "wynik niejednoznaczny, wymaga weryfikacji"
            lista = "Kryteria niejednoznaczne"
        elif krok == "NIEOCENIONE":
            status_skladowej = "NIE_OCENIONO"
            fraza = "ocena niewykonana"
            lista = "Kryteria nieocenione"
        else:
            status_skladowej = "BRAK_PODSTAWY"
            fraza = "werdykt zgodności niewydany: brak ustalonej podstawy parametru"
            lista = "Kryteria bez ustalonej podstawy"
        wskazane = [o for o in oceny if o.status_maszynowy == status_skladowej]
        przyczyna = "; ".join(_z_przyczyna(o) for o in wskazane)
        zdania = [f"{naglowek} — {fraza}.", f"{lista}: {przyczyna}."]
    elif krok == "POKRYCIE":
        zdania = [
            f"{naglowek} — brak wystarczającego dowodu: program badań pokryty częściowo "
            f"({_bez_kropki(pokrycie_programu_pl)})."
        ]
        wyniki = _wyniki_obliczeniowe(oceny)
        if wyniki is not None:
            zdania.append(wyniki)
        przyczyna = f"program badań pokryty częściowo: {_bez_kropki(pokrycie_programu_pl)}"
    elif krok == "KOMPLETNOSC":
        zdania = [
            f"{naglowek} — brak wystarczającego dowodu: kryteria dające się ocenić są spełnione, "
            "ale dowód jest niepełny.",
            f"Właściwa metoda: {metody_przydatne_pl(dowod.rodzaj_twierdzenia, 'W')}.",
        ]
        wyniki = _wyniki_obliczeniowe(oceny)
        if wyniki is not None:
            zdania.append(wyniki)
        przyczyna = f"dowód niepełny: {'; '.join(powody_niepelnosci)}"
    else:
        zdania = [f"{naglowek} — wymaganie spełnione, dowód pełny."]
        if kryterium_najblizej_granicy is not None:
            najblizsza = next(o for o in oceny if o.kryterium_id == kryterium_najblizej_granicy)
            zdania.append(f"Kryterium najbliżej granicy: {_opis_skladowej_z_wynikiem(najblizsza)}.")
            wzgledny = (
                _opis_wzglednego(najblizsza.margines) if najblizsza.margines is not None else None
            )
            przyczyna = f"kryterium najbliżej granicy: {nazwa_skladowej(najblizsza)}" + (
                f" ({wzgledny})" if wzgledny is not None else ""
            )
        else:
            logiczne = all(o.kryterium.relacja == "LOGICZNE" for o in stosowalne)
            powod = (
                "kryteria składowe są logiczne — margines skalarny niedefiniowalny"
                if logiczne
                else "marginesy składowych nie mają skali (limit zerowy bez tolerancji) albo "
                "kryteria są logiczne"
            )
            zdania.append(
                f"Żadne kryterium składowe nie ma marginesu względnego ({powod}); spełnione "
                f"kryteria składowe: {'; '.join(_opis_skladowej_z_wynikiem(o) for o in stosowalne)}."
            )
            przyczyna = f"brak kryterium z marginesem względnym: {powod}"
    return WyjasnienieWerdyktu(
        zdanie_pl=" ".join(zdania),
        przyczyna_pl=przyczyna,
        czego_brakuje=tuple(czego_brakuje),
        zastrzezenia=tuple(zastrzezenia),
    )
