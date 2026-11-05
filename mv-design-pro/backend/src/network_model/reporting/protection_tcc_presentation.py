"""Prezentacja pozycji TCC w raportach zabezpieczen (PDF i DOCX) — karta N-D5-FUSE.

JEDNO miejsce, ktore tlumaczy `podstawa_kod` pozycji krzywej czasowo-pradowej na
komorki tabeli raportu. PDF i DOCX MUSZA czytac to samo — inaczej ten sam wynik
opowiadalby dwie rozne historie w dwoch eksportach.

WARSTWA: prezentacja. ZERO fizyki, zero liczenia — tylko formatowanie tego, co
policzyla warstwa analizy.

DLACZEGO ISTNIEJE: bezpiecznik topikowy bez pasma z karty katalogowej nie ma
czego narysowac ani co wpisac w kolumne TMS (bezpiecznik nie ma mnoznika
czasowego). Bez tego tlumaczenia raport drukowal w kolumnie „Typ krzywej"
surowe `FUSE_SI` — etykiete sugerujaca krzywa bezpiecznika tam, gdzie liczby
pochodzily ze wzoru przekaznika IEC 60255.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from network_model.catalog.funkcje_eaz import etykieta_funkcji_eaz
from network_model.nazwy import nazwa_nadana

#: Kod podstawy oznaczajacy krzywa policzona ze wzoru przekaznikowego.
KOD_KRZYWA_PRZEKAZNIKOWA = "KRZYWA_PRZEKAZNIKOWA"

#: Polskie etykiety kolumny „Typ krzywej" dla pozycji BEZ podstawy przekaznikowej.
#: Lista ZAMKNIETA — kod spoza niej dostaje etykiete ogolna, nigdy surowy kod.
#: Przypiete testem `test_raport_tcc_etykiety_bez_podstawy`.
#: Karta BIEG-ZABEZPIECZEN-Z-MODELU: urządzenia przekaźnikowe pochodzą z modelu z nastawami
#: rozwiązanymi przez jedną ścieżkę oceny (urządzenie bez gotowych nastaw jest odmową, nie
#: pozycją TCC), więc jedynym kodem braku podstawy jest bezpiecznik bez pasma.
ETYKIETY_BRAKU_PL: dict[str, str] = {
    "BRAK_PASMA_BEZPIECZNIKA": "Bezpiecznik — brak pasma topikowego",
}

_ETYKIETA_OGOLNA_PL = "Brak charakterystyki"

#: Znacznik komorki liczbowej, ktora NIE DOTYCZY tej pozycji (np. TMS bezpiecznika).
NIE_DOTYCZY = "—"


#: Urządzenie wyniku bez nazwy — opis braku, nigdy identyfikator (karta #144).
URZADZENIE_BEZ_NAZWY = "Urządzenie bez nazwy"
#: Sprawdzenie wskazuje urządzenie, którego lista urządzeń wyniku nie zawiera.
URZADZENIE_SPOZA_WYNIKU = "Urządzenie spoza wyniku"


def nazwy_urzadzen(result: dict[str, Any]) -> dict[str, str]:
    """Nazwa każdego urządzenia wyniku koordynacji po jego identyfikatorze.

    Tabele sprawdzeń raportu (czułość, selektywność, przeciążalność) nazywały urządzenie
    FRAGMENTEM identyfikatora (`device_id[:8] + "..."`) — projektant nie mógł go odnaleźć
    w modelu. Nazwa pochodzi z listy urządzeń tego samego wyniku (`result["devices"]`).
    """
    nazwy: dict[str, str] = {}
    for urzadzenie in result.get("devices", []) or []:
        if not isinstance(urzadzenie, dict) or urzadzenie.get("id") is None:
            continue
        nazwy[str(urzadzenie["id"])] = nazwa_wpisu_urzadzenia(urzadzenie)
    return nazwy


def nazwa_wpisu_urzadzenia(wpis: dict[str, Any], klucz: str = "name") -> str:
    """Nazwa urządzenia z wpisu wyniku (urządzenie: `name`, krzywa TCC: `device_name`) albo
    opis braku — ta sama reguła dla wiersza urządzenia, wiersza krzywej i tabel sprawdzeń.
    """
    return nazwa_nadana(wpis.get(klucz)) or URZADZENIE_BEZ_NAZWY


def nazwa_urzadzenia(nazwy: dict[str, str], device_id: object) -> str:
    """Nazwa urządzenia sprawdzenia albo jawny brak — nigdy identyfikator."""
    return nazwy.get(str(device_id), URZADZENIE_SPOZA_WYNIKU)


def ma_podstawe_przekaznikowa(curve: dict[str, Any]) -> bool:
    """Czy pozycja niesie krzywa policzona ze wzoru przekaznikowego."""
    return str(curve.get("podstawa_kod", KOD_KRZYWA_PRZEKAZNIKOWA)) == KOD_KRZYWA_PRZEKAZNIKOWA


def etykieta_typu_krzywej_pl(curve: dict[str, Any]) -> str:
    """Komorka „Typ krzywej": wariant normy albo uczciwy powod braku po polsku."""
    if ma_podstawe_przekaznikowa(curve):
        # Opis stopni po polsku (próg, charakterystyka, TMS/zwłoka) z wyniku; kod krzywej
        # wyłącznie, gdy wynik opisu nie niesie.
        opis = curve.get("opis_pl")
        return str(opis) if opis else str(curve.get("curve_type", NIE_DOTYCZY))
    kod = str(curve.get("podstawa_kod", ""))
    return ETYKIETY_BRAKU_PL.get(kod, _ETYKIETA_OGOLNA_PL)


def etykieta_tms(curve: dict[str, Any], sformatowana_wartosc: str) -> str:
    """Komorka „TMS": liczba tylko dla krzywej przekaznikowej.

    Bezpiecznik nie ma mnoznika czasowego — wpisanie tam `0.00` czytaloby sie
    jak nastawa TMS = 0, wiec pozycja bez podstawy dostaje znacznik „nie dotyczy".
    """
    if ma_podstawe_przekaznikowa(curve):
        return sformatowana_wartosc
    return NIE_DOTYCZY


def powod_braku_pl(curve: dict[str, Any]) -> str | None:
    """Pelne zdanie po polsku, dlaczego pozycja nie ma krzywej (albo ``None``)."""
    if ma_podstawe_przekaznikowa(curve):
        return None
    powod = curve.get("powod_pl")
    return str(powod) if powod else None


#: Nagłówki tabeli nastaw urządzeń raportu koordynacji (PDF i DOCX — jedna definicja).
NAGLOWKI_NASTAW_PL: tuple[str, ...] = (
    "Nazwa",
    "Stopień",
    "Próg pierwotny [A]",
    "TMS / zwłoka [s]",
    "Charakterystyka",
)


def wiersze_nastaw_urzadzenia(urzadzenie: dict[str, Any]) -> list[tuple[str, str, str, str, str]]:
    """Wiersze tabeli nastaw urządzenia wyniku koordynacji — po jednym na stopień.

    Karta BIEG-ZABEZPIECZEN-Z-MODELU: urządzenie wyniku niesie nastawy Z MODELU
    (``nastawy.stopnie``: próg pierwotny z przekładni przekładnika, TMS albo zwłoka). Urządzenie
    bez stopni (odmowa, bezpiecznik) daje jeden wiersz z nazwanym brakiem, nigdy liczbę.
    """
    nazwa = nazwa_wpisu_urzadzenia(urzadzenie)
    stopnie = ((urzadzenie.get("nastawy") or {}).get("stopnie")) or []
    if not stopnie:
        return [
            (
                nazwa,
                NIE_DOTYCZY,
                NIE_DOTYCZY,
                NIE_DOTYCZY,
                "Brak nastaw gotowych do oceny",
            )
        ]
    wiersze: list[tuple[str, str, str, str, str]] = []
    for stopien in sorted(stopnie, key=lambda s: str(s.get("funkcja")), reverse=True):
        tms = stopien.get("tms")
        zwloka = stopien.get("zwloka_s")
        czas = (
            f"TMS {tms:.3f}"
            if isinstance(tms, int | float)
            else (f"{zwloka:.3f} s" if isinstance(zwloka, int | float) else NIE_DOTYCZY)
        )
        prog = stopien.get("prog_pierwotny_a")
        wiersze.append(
            (
                nazwa,
                etykieta_funkcji_eaz(stopien.get("funkcja")),
                f"{prog:.1f}" if isinstance(prog, int | float) else NIE_DOTYCZY,
                czas,
                str(stopien.get("krzywa") or NIE_DOTYCZY),
            )
        )
    return wiersze


#: Nagłówek sekcji raportu z funkcjami sterowników spoza oceny nadprądowej fazowej — każda
#: z powodem: ocenia ją inna ocena (ziemnozwarciowa — sekcja niżej, LoM) albo produkt jej nie
#: ocenia (status: nie oceniono).
NAGLOWEK_FUNKCJI_NIEOCENIANYCH_PL = "Funkcje poza oceną nadprądową fazową"


def zdania_funkcji_nieocenianych(urzadzenia: list[dict[str, Any]]) -> list[str]:
    """Zdania raportu o funkcjach sterownika, których produkt nie ocenia (karta
    OCHRONA-JEDNO-ZRODLO pkt 5): urządzenie, funkcja (zapis z rysunku i kod) i powód — ten sam
    zapis ``nastawy.funkcje_nieoceniane`` co widok zabezpieczeń i edytor nastaw. Funkcja bez
    ewaluatora nie znika z raportu po cichu; kolejność: nazwa urządzenia, potem kolejność
    funkcji sterownika. PDF i DOCX czytają to samo."""
    zdania: list[str] = []
    for urzadzenie in sorted(
        urzadzenia, key=lambda d: (nazwa_wpisu_urzadzenia(d), str(d.get("id", "")))
    ):
        for wpis in (urzadzenie.get("nastawy") or {}).get("funkcje_nieoceniane") or []:
            zdania.append(
                f"{nazwa_wpisu_urzadzenia(urzadzenie)} · "
                f"{etykieta_funkcji_eaz(str(wpis.get('funkcja')))}: {wpis.get('powod_pl')}"
            )
    return zdania


def uzasadnienia_sprawdzen(sprawdzenia: list[dict[str, Any]], nazwy: dict[str, str]) -> list[str]:
    """Zdania sprawdzeń (czułość, selektywność, przeciążalność) — każdy wiersz tabeli ma zdanie
    po polsku z liczbami, punktem zwarcia i wartością wymaganą (``notes_pl`` sprawdzenia);
    koordynacja nie wydaje werdyktów (P-06). PDF i DOCX czytają to samo."""
    zdania: list[str] = []
    for sprawdzenie in sprawdzenia:
        if "upstream_device_id" in sprawdzenie:
            kto = (
                f"{nazwa_urzadzenia(nazwy, sprawdzenie.get('downstream_device_id'))} → "
                f"{nazwa_urzadzenia(nazwy, sprawdzenie.get('upstream_device_id'))}"
            )
        else:
            kto = nazwa_urzadzenia(nazwy, sprawdzenie.get("device_id"))
        zdania.append(f"{kto}: {sprawdzenie['notes_pl']}")
    return zdania


def wiersze_podsumowania_pl(
    podsumowanie: dict[str, Any], liczba: Callable[[Any], str]
) -> list[tuple[str, str]]:
    """Wiersze podsumowania raportu (PDF i DOCX): liczby zbiorcze koordynacji bez werdyktu
    (P-06) — najmniejszy odstęp i ilorazy obok wartości wymaganych z kryteriów."""
    kryteria = podsumowanie["kryteria"]
    czulosc = podsumowanie["sensitivity"]
    selektywnosc = podsumowanie["selectivity"]
    przeciazalnosc = podsumowanie["overload"]
    return [
        ("Liczba urządzeń:", str(podsumowanie["total_devices"])),
        ("Łączna liczba sprawdzeń:", str(podsumowanie["total_checks"])),
        (
            "Najmniejszy odstęp czasowy par [s]:",
            f"{liczba(selektywnosc['najmniejszy_odstep_s'])} "
            f"(wymagany {liczba(kryteria['minimum_grading_margin_s'])})",
        ),
        ("Pary bez odstępu czasowego:", str(selektywnosc["bez_odstepu"])),
        (
            "Najmniejszy iloraz czułości:",
            f"{liczba(czulosc['najmniejszy_iloraz'])} "
            f"(wymagany {liczba(kryteria['sensitivity_ratio_required'])})",
        ),
        ("Urządzenia bez ilorazu czułości:", str(czulosc["bez_wartosci"])),
        (
            "Najmniejszy iloraz przeciążalności:",
            f"{liczba(przeciazalnosc['najmniejszy_iloraz'])} "
            f"(wymagany {liczba(kryteria['overload_ratio_required'])})",
        ),
        (
            "Urządzenia bez ilorazu przeciążalności:",
            str(przeciazalnosc["bez_wartosci"]),
        ),
    ]


# ---------------------------------------------------------------------------
# Ocena zabezpieczeń ziemnozwarciowych i uziemień stacji (karta EWALUATORY-ZIEMNOZWARCIOWE)
# ---------------------------------------------------------------------------

NAGLOWEK_ZIEMNOZWARCIOWYCH_PL = "Zabezpieczenia ziemnozwarciowe i uziemienia stacji"
NAGLOWKI_ZIEMNOZWARCIOWYCH_PL: tuple[str, ...] = (
    "Urządzenie",
    "Funkcja",
    "Kryterium",
    "Wynik",
    "Wymagane",
    "Ocena",
)


def rekordy_ziemnozwarciowe(ziemne: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Rekordy sekcji w kolejności raportu: oceny funkcji, uziemienia stacji, odmowy."""
    if not ziemne:
        return []
    return [
        *ziemne.get("oceny", []),
        *ziemne.get("uziemienia", []),
        *ziemne.get("odmowy", []),
    ]


def wiersz_ziemnozwarciowy(rekord: dict[str, Any]) -> tuple[str, str, str, str, str, str]:
    """Wiersz tabeli raportu: urządzenie, funkcja, kryterium (nazwa z rekordu ewaluatora —
    lista zamknięta `KRYTERIA_ZIEMNOZWARCIOWE`), wynik, wartość wymagana, ocena (etykieta
    statusu z rekordu werdyktu). Wynik i wartość wymagana — zapis z rekordu (``wynik_pl``,
    ``limit_pl``: jeden zapis liczb z jednostką dla ekranu i obu raportów; rzut 67N z nazwanym
    kierunkiem) — zero liczenia i zero drugiego formatu liczb."""
    ocena = rekord["ocena"]
    return (
        str(rekord["nazwa_urzadzenia_pl"]),
        str(rekord.get("etykieta_pl") or NIE_DOTYCZY),
        str(rekord["kryterium_pl"]),
        str(rekord.get("wynik_pl") or NIE_DOTYCZY),
        str(rekord.get("limit_pl") or NIE_DOTYCZY),
        str(ocena["etykieta"]["etykieta_pl"]),
    )


def zdanie_ziemnozwarciowe(rekord: dict[str, Any]) -> str:
    """Zdanie wyjaśnienia rekordu (co oceniono, wynik, limit z podstawą, margines, przyczyna).
    Przy ocenie wstrzymanej zdanie generatora werdyktu już niesie braki złożone przez
    ``zdania_brakow`` (podmiot raz, lista nazw nastaw, jedno wezwanie) — raport nie dokleja ich
    drugi raz ani nie składa po jednym zdaniu na brak."""
    return f"{rekord['nazwa_urzadzenia_pl']}: {rekord['ocena']['wyjasnienie']['zdanie_pl']}"


#: Nagłówek sekcji raportu z urządzeniami nadprądowymi, których ocena jest wstrzymana brakami.
NAGLOWEK_ODMOW_URZADZEN_PL = "Zabezpieczenia nadprądowe z oceną wstrzymaną"


def zdania_odmow_urzadzen(result: dict[str, Any]) -> list[str]:
    """Zdania raportu o urządzeniach nadprądowych (50/51) z oceną wstrzymaną: nazwa i braki
    złożone przez ``zdania_brakow`` (``braki_pl`` odmowy — ten sam zapis co ekran wyników).
    PDF i DOCX czytają to samo; kolejność — kolejność odmów wyniku (deterministyczna).
    """
    return [
        f"{nazwa_wpisu_urzadzenia(odmowa, 'nazwa_pl')}: {' '.join(odmowa.get('braki_pl') or [])}"
        for odmowa in result.get("odmowy_urzadzen") or []
    ]
