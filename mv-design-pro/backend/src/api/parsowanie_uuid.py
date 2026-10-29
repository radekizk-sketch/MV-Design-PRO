"""Identyfikator UUID z parametru żądania API — jedno parsowanie dla wszystkich końcówek.

PO CO. Pięć modułów API miało własną kopię ``_parse_uuid(value, field_name)`` z odmową
``f"{field_name} musi być poprawnym UUID"`` — klucz parametru (``case_id``, ``run_id``…)
trafiał do projektanta zamiast nazwy. Teraz parametr nazywa ``nazwa_pola`` z jednej mapy
słownika komunikatów (``enm.slownik_komunikatow.NAZWY_POL_KONTRAKTU_PL``); brak wpisu jest
błędem programu (``KeyError``), który przypina test strażnika klasy, nie ścieżka błędu
u projektanta.
"""

from __future__ import annotations

from uuid import UUID

from enm.slownik_komunikatow import nazwa_pola
from fastapi import HTTPException, status


def parsuj_uuid(wartosc: str, klucz_parametru: str) -> UUID:
    """UUID z parametru żądania; 400 z nazwą parametru słowami przy złym zapisie."""
    nazwa = nazwa_pola(klucz_parametru)
    try:
        return UUID(wartosc)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{nazwa} musi być poprawnym UUID",
        ) from exc


__all__ = ["parsuj_uuid"]
