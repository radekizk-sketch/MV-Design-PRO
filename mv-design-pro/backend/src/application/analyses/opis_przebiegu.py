"""Rodzaj i stan przebiegu obliczeń po polsku — komunikaty bramek widoków analiz.

Karta #145: widoki analiz odmawiają (HTTP 422), gdy wskazany przebieg jest innego
rodzaju albo niezakończony. Komunikat trafia na ekran projektanta jako stan błędu, więc
nie niesie identyfikatora przebiegu ani kodów (``PF``, ``short_circuit_sn``,
``status=RUNNING``) — nazywa rodzaj i stan słowami. Identyfikator przebiegu zna ekran
(to on go wskazał) i pokazuje go w informacjach audytowych.

Słowniki obejmują każdy rodzaj i stan kanonicznego przebiegu (``enm/canonical_analysis``);
kompletność przypina ``tests/application/analyses/test_opis_przebiegu.py``. Kod spoza
słownika daje uczciwe zdanie zamiast kodu.
"""

from __future__ import annotations

RODZAJE_PRZEBIEGU_PL: dict[str, str] = {
    "PF": "rozpływ mocy",
    "short_circuit_sn": "obliczenie zwarciowe",
    "protection_sn": "analiza zabezpieczeń",
    "phase_state_sn": "stan fazowy sieci SN",
    "rozplyw_niesymetryczny": "rozpływ niesymetryczny",
    "dynamic_stability": "stabilność dynamiczna",
    "dynamika_rms": "dynamika RMS",
}

STANY_PRZEBIEGU_PL: dict[str, str] = {
    "CREATED": "utworzony, nieuruchomiony",
    "PENDING": "oczekuje na wykonanie",
    "RUNNING": "w toku",
    "FINISHED": "zakończony",
    "FAILED": "zakończony błędem",
}

RODZAJ_SPOZA_SLOWNIKA_PL = "przebieg rodzaju spoza słownika aplikacji"
STAN_SPOZA_SLOWNIKA_PL = "stan spoza słownika aplikacji"


def rodzaj_przebiegu_pl(kod: str) -> str:
    """Nazwa rodzaju przebiegu po polsku (kod spoza słownika → uczciwe zdanie)."""
    return RODZAJE_PRZEBIEGU_PL.get(kod, RODZAJ_SPOZA_SLOWNIKA_PL)


def stan_przebiegu_pl(kod: str) -> str:
    """Nazwa stanu przebiegu po polsku (kod spoza słownika → uczciwe zdanie)."""
    return STANY_PRZEBIEGU_PL.get(kod, STAN_SPOZA_SLOWNIKA_PL)
