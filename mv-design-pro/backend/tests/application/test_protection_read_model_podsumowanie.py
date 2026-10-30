"""Podsumowanie elementu widoku zabezpieczeń bez werdyktu (karta WERDYKT-MIGRACJA-190, C39).

Dawny `verification_status` dawał „SPELNIONE”, gdy element NIE MIAŁ diagnostyk („brak wykrytych
konfliktów w logice zabezpieczeń”) — status bez kryterium, limitu i marginesu (`margin_pct`
zawsze `None`). Podsumowanie niesie teraz wyłącznie braki danych z powodami, a kompletność
danych jest JEDNYM predykatem: `has_complete_data == not braki_danych_pl`.

Iloczyn cech: funkcje skonfigurowane (brak / z progiem / bez progu) × diagnostyki elementu
(brak, INFO, WARN, ERROR, WARN+INFO). Diagnostyka INFO to „brak danych do pełnej analizy”
(`SanityCheckSeverity.INFO`), więc jest brakiem także obok WARN/ERROR.
"""

from __future__ import annotations

import itertools

import pytest
from application.analyses.protection.sanity_checks.models import (
    ProtectionSanityCheckResult,
    SanityCheckCode,
    SanityCheckSeverity,
)
from application.protection_read_model import _build_read_model_summary, _build_summary

_BEZ_FUNKCJI = "Brak skonfigurowanych funkcji zabezpieczeniowych"
_BEZ_PROGU = (
    "Próg funkcji nie ma jednostki (strona wtórna albo pierwotna) albo przekładnika "
    "prądowego — prąd rozruchowy po stronie pierwotnej jest niewyznaczalny"
)

_FUNKCJE: dict[str, list[dict[str, object]]] = {
    "brak": [],
    "z_progiem": [{"code": "OVERCURRENT_TIME", "setpoint": {"value": 1.2, "unit": "A"}}],
    "bez_progu": [
        {"code": "OVERCURRENT_TIME", "setpoint": {"value": 1.2, "unit": "A"}},
        {"code": "OVERCURRENT_INST", "setpoint": None},
    ],
}


def _diagnostyka(waga: SanityCheckSeverity, komunikat: str) -> ProtectionSanityCheckResult:
    return ProtectionSanityCheckResult(
        severity=waga,
        code=SanityCheckCode.VOLT_MISSING_UN,
        message_pl=komunikat,
        element_id="line_1",
        element_type="LINE",
    )


_INFO = _diagnostyka(SanityCheckSeverity.INFO, "Brak napięcia znamionowego — analiza częściowa")
_WARN = _diagnostyka(SanityCheckSeverity.WARN, "Nakładanie progów napięciowych")
_ERROR = _diagnostyka(SanityCheckSeverity.ERROR, "Próg poniżej zakresu")

_DIAGNOSTYKI: dict[str, list[ProtectionSanityCheckResult]] = {
    "brak": [],
    "info": [_INFO],
    "warn": [_WARN],
    "error": [_ERROR],
    "warn_info": [_WARN, _INFO],
}


def _wpis(funkcje: str, diagnostyki: str) -> dict[str, object]:
    return {
        "element_id": "line_1",
        "element_type": "LINE",
        "element_name": "Linia 1",
        "functions": _FUNKCJE[funkcje],
        "ct": None,
        "diagnostics": _DIAGNOSTYKI[diagnostyki],
    }


@pytest.mark.parametrize(
    ("funkcje", "diagnostyki"), list(itertools.product(_FUNKCJE, _DIAGNOSTYKI))
)
def test_iloczyn_funkcje_x_diagnostyki(funkcje: str, diagnostyki: str) -> None:
    podsumowanie = _build_summary(_wpis(funkcje, diagnostyki))

    oczekiwane: list[str] = []
    if funkcje == "brak":
        oczekiwane.append(_BEZ_FUNKCJI)
    if funkcje == "bez_progu":
        oczekiwane.append(_BEZ_PROGU)
    if "info" in diagnostyki:
        oczekiwane.append(_INFO.message_pl)

    assert podsumowanie["braki_danych_pl"] == oczekiwane
    # Predykaty parami: kompletność to dokładnie brak braków — jedno źródło prawdy.
    assert podsumowanie["has_complete_data"] is (not oczekiwane)
    # Żadnego statusu bez kryterium: ani status, ani powód, ani stały margines `None`.
    assert not {"verification_status", "verification_reason", "margin_pct"} & set(podsumowanie)


def test_konflikt_logiki_bez_brakow_nie_jest_statusem_spelnienia() -> None:
    """Element z funkcjami z progiem i bez diagnostyk ma komplet danych — i NIC więcej:
    brak wykrytych konfliktów nie jest dowodem spełnienia żadnego kryterium."""
    podsumowanie = _build_summary(_wpis("z_progiem", "brak"))
    assert podsumowanie["has_complete_data"] is True
    assert podsumowanie["braki_danych_pl"] == []
    zestawienie = _build_read_model_summary(
        assignments=[], diagnostics=[], summaries=[podsumowanie]
    )
    assert not {"verified_count", "failed_count", "no_data_count"} & set(zestawienie)
    assert zestawienie["complete_count"] == 1
    assert zestawienie["incomplete_count"] == 0
