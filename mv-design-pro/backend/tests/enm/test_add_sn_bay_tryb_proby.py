"""Tryb próby `add_sn_bay` na OBU planach pola — jedna operacja, jedna umowa `dry_run`.

Operacja `add_sn_bay` ma dwa plany pola: deklarację (rola + aparat) i pole z KATALOGU
rozdzielnic (`czy_wybor_katalogowy`: katalogowe pole rodziny albo jednostka bloku RMU).
Do 2026-10 plan katalogowy miał drugie wejście — osobną operację kanoniczną bez
żadnego wołającego w UI; skasowana, a tryb próby przeszedł do `add_sn_bay`. Kreator pola
SN pokazuje werdykt konfiguracji z tego trybu przed zapisem.

Defekt, który ten moduł przypina: plan deklaracji IGNOROWAŁ `dry_run` — odpowiedź
niosła migawkę, więc końcówka `domain-ops` utrwalała pole, o które projektant tylko
„pytał". ILOCZYN CECH: plan pola {deklaracja, katalog} × tryb {próba, zapis}.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation

from tests.enm.test_brama_katalogowa_operacji_v2 import (
    _payload_sn_bay,
    _payload_sn_bay_z_katalogu,
    _siec_ze_stacja,
)

PLANY = {"deklaracja": _payload_sn_bay, "katalog": _payload_sn_bay_z_katalogu}


@pytest.mark.parametrize("proba", [True, False], ids=["proba", "zapis"])
@pytest.mark.parametrize("plan", sorted(PLANY))
def test_plan_pola_x_tryb(plan: str, proba: bool) -> None:
    snapshot = copy.deepcopy(_siec_ze_stacja())
    przed = copy.deepcopy(snapshot)
    payload: dict[str, Any] = PLANY[plan](snapshot)
    if proba:
        payload["dry_run"] = True
    wynik = execute_domain_operation(snapshot, "add_sn_bay", payload)
    assert not wynik.get("error"), (wynik.get("error"), wynik.get("error_code"))
    assert snapshot == przed, "Operacja nie może mutować modelu wejściowego"
    if proba:
        assert wynik.get("dry_run") is True
        assert not wynik.get("snapshot"), "Próba nie niesie migawki — nic się nie utrwala"
        if plan == "katalog":
            # Werdykt wyjaśnialny: VALID razem z tym, CO oceniono (źródło i rola z katalogu).
            assert wynik["preview"]["werdykt"] == "VALID"
            assert wynik["preview"]["zrodlo_opis_pl"]
            assert wynik["preview"]["bay_role"]
    else:
        assert wynik.get("snapshot"), "Zapis niesie migawkę z nowym polem"
        assert len(wynik["snapshot"]["bays"]) == len(przed.get("bays", [])) + 1
