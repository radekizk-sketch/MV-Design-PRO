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
