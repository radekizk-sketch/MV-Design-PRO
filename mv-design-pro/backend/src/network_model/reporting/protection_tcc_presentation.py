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

from typing import Any

from network_model.nazwy import nazwa_nadana

#: Kod podstawy oznaczajacy krzywa policzona ze wzoru przekaznikowego.
KOD_KRZYWA_PRZEKAZNIKOWA = "KRZYWA_PRZEKAZNIKOWA"

#: Polskie etykiety kolumny „Typ krzywej" dla pozycji BEZ podstawy przekaznikowej.
#: Lista ZAMKNIETA — kod spoza niej dostaje etykiete ogolna, nigdy surowy kod.
#: Przypiete testem `test_raport_tcc_etykiety_bez_podstawy`.
ETYKIETY_BRAKU_PL: dict[str, str] = {
    "BRAK_PASMA_BEZPIECZNIKA": "Bezpiecznik — brak pasma topikowego",
    "NIEZNANA_NORMA_KRZYWEJ": "Nieznana norma charakterystyki",
    "BRAK_NASTAW_KRZYWEJ": "Brak nastaw charakterystyki",
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
    opis braku — ta sama reguła dla wiersza urządzenia, wiersza krzywej i tabel sprawdzeń."""
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
        return str(curve.get("curve_type", NIE_DOTYCZY))
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

_STOPNIE_PL: dict[str, str] = {"overcurrent_51": "I> (51)", "overcurrent_50": "I>> (50)"}


def wiersze_nastaw_urzadzenia(urzadzenie: dict[str, Any]) -> list[tuple[str, str, str, str, str]]:
    """Wiersze tabeli nastaw urządzenia wyniku koordynacji — po jednym na stopień.

    Karta BIEG-ZABEZPIECZEN-Z-MODELU: urządzenie wyniku niesie nastawy Z MODELU
    (``nastawy.stopnie``: próg pierwotny z przekładni przekładnika, TMS albo zwłoka). Urządzenie
    bez stopni (odmowa, bezpiecznik) daje jeden wiersz z nazwanym brakiem, nigdy liczbę.
    """
    nazwa = nazwa_wpisu_urzadzenia(urzadzenie)
    stopnie = ((urzadzenie.get("nastawy") or {}).get("stopnie")) or []
    if not stopnie:
        return [(nazwa, NIE_DOTYCZY, NIE_DOTYCZY, NIE_DOTYCZY, "Brak nastaw gotowych do oceny")]
    wiersze: list[tuple[str, str, str, str, str]] = []
    for stopien in sorted(stopnie, key=lambda s: str(s.get("funkcja")), reverse=True):
        tms = stopien.get("tms")
        zwloka = stopien.get("zwloka_s")
        czas = (
            f"TMS {tms:.3f}"
            if isinstance(tms, (int, float))
            else (f"{zwloka:.3f} s" if isinstance(zwloka, (int, float)) else NIE_DOTYCZY)
        )
        prog = stopien.get("prog_pierwotny_a")
        wiersze.append(
            (
                nazwa,
                _STOPNIE_PL.get(str(stopien.get("funkcja")), str(stopien.get("funkcja"))),
                f"{prog:.1f}" if isinstance(prog, (int, float)) else NIE_DOTYCZY,
                czas,
                str(stopien.get("krzywa") or NIE_DOTYCZY),
            )
        )
    return wiersze
