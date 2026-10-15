"""Wykonanie biegu w testach HTTP TĄ SAMĄ ścieżką, którą przechodzi projektant.

Karta DYNAMIKA-W-TLE: `POST …/execute` przyjmuje bieg do kolejki wykonawcy w tle
(202, stan QUEUED) i wraca natychmiast; wynik jest dostępny dopiero, gdy odpytywany
stan (`GET …/runs/{id}`) dojdzie do DONE/FAILED/CANCELLED. Test, który po `execute`
od razu czyta wynik, ćwiczyłby ścieżkę, której produkt już nie ma (Zero-Debt pkt 5).

Pomocnicy zwracają ODPOWIEDŹ `GET` stanu końcowego (200, ten sam kształt rekordu
biegu, co dotąd zwracał synchroniczny `execute`), więc asercje na `status_code == 200`
i `json()["status"] == "DONE"` pozostają asercjami o realnym stanie. Odmowa samego
zlecenia (404 nieznany bieg, 409 seria poza CREATED) wraca jako odpowiedź `POST` —
bez maskowania.
"""

from __future__ import annotations

import time
from typing import Any

from domain.execution import RunStatus

#: Stany końcowe kontraktu HTTP wykonania (render `STATUS_WYKONAWCZY`).
STANY_KONCOWE_HTTP = frozenset(
    {RunStatus.DONE.value, RunStatus.FAILED.value, RunStatus.CANCELLED.value}
)
#: Stany końcowe serii (`RunBatchStatus`).
STANY_KONCOWE_SERII = frozenset({"FINISHED", "FAILED", "PARTIAL", "CANCELLED"})
#: Stany końcowe biegów zabezpieczeń i rozpływu (`StanBiegu` domenowy w odpowiedzi).
STANY_KONCOWE_DOMENOWE = frozenset({"FINISHED", "FAILED", "CANCELLED"})

ODSTEP_ODPYTYWANIA_S = 0.02
LIMIT_OCZEKIWANIA_S = 600.0


def poczekaj_na_stan_koncowy(
    client: Any,
    adres: str,
    *,
    stany_koncowe: frozenset[str],
    limit_s: float = LIMIT_OCZEKIWANIA_S,
) -> Any:
    """Odpytuj `adres` do stanu końcowego; zwraca ostatnią odpowiedź `GET` (200)."""
    termin = time.monotonic() + limit_s
    while True:
        odpowiedz = client.get(adres)
        assert odpowiedz.status_code == 200, odpowiedz.text
        if odpowiedz.json()["status"] in stany_koncowe:
            return odpowiedz
        assert time.monotonic() < termin, (
            f"bieg {adres} nie doszedł do stanu końcowego w {limit_s} s: {odpowiedz.json()}"
        )
        time.sleep(ODSTEP_ODPYTYWANIA_S)


def wykonaj_bieg(client: Any, run_id: str, *, limit_s: float = LIMIT_OCZEKIWANIA_S) -> Any:
    """`POST /api/execution/runs/{id}/execute` (202) → odpytywanie do DONE/FAILED/CANCELLED.

    Zwraca odpowiedź `GET /api/execution/runs/{id}` stanu końcowego; gdy zlecenie
    zostało odrzucone (kod inny niż 202), zwraca odpowiedź `POST` bez zmian.
    """
    zlecenie = client.post(f"/api/execution/runs/{run_id}/execute")
    if zlecenie.status_code != 202:
        return zlecenie
    return poczekaj_na_stan_koncowy(
        client, f"/api/execution/runs/{run_id}", stany_koncowe=STANY_KONCOWE_HTTP, limit_s=limit_s
    )


def wykonaj_bieg_zabezpieczen(
    client: Any, run_id: str, *, limit_s: float = LIMIT_OCZEKIWANIA_S
) -> Any:
    """`POST /api/protection-runs/{id}/execute` (202) → odpytywanie do FINISHED/FAILED/CANCELLED."""
    zlecenie = client.post(f"/api/protection-runs/{run_id}/execute")
    if zlecenie.status_code != 202:
        return zlecenie
    return poczekaj_na_stan_koncowy(
        client,
        f"/api/protection-runs/{run_id}",
        stany_koncowe=STANY_KONCOWE_DOMENOWE,
        limit_s=limit_s,
    )


def wykonaj_bieg_rozplywu(
    client: Any, run_id: str, *, limit_s: float = LIMIT_OCZEKIWANIA_S
) -> Any:
    """`POST /api/power-flow-runs/{id}/execute` (202) → odpytywanie do FINISHED/FAILED/CANCELLED."""
    zlecenie = client.post(f"/api/power-flow-runs/{run_id}/execute")
    if zlecenie.status_code != 202:
        return zlecenie
    return poczekaj_na_stan_koncowy(
        client,
        f"/api/power-flow-runs/{run_id}",
        stany_koncowe=STANY_KONCOWE_DOMENOWE,
        limit_s=limit_s,
    )


def wykonaj_serie(client: Any, batch_id: str, *, limit_s: float = LIMIT_OCZEKIWANIA_S) -> Any:
    """`POST /api/execution/batches/{id}/execute` (202) → odpytywanie do stanu końcowego serii."""
    zlecenie = client.post(f"/api/execution/batches/{batch_id}/execute")
    if zlecenie.status_code != 202:
        return zlecenie
    return poczekaj_na_stan_koncowy(
        client,
        f"/api/execution/batches/{batch_id}",
        stany_koncowe=STANY_KONCOWE_SERII,
        limit_s=limit_s,
    )


def uruchom_v126(
    client: Any,
    case_id: str,
    rodzaj: str,
    parametry: dict[str, Any] | None = None,
    *,
    limit_s: float = LIMIT_OCZEKIWANIA_S,
) -> Any:
    """`POST /api/cases/{case_id}/runs/v126/{rodzaj}` (202) → odpytywanie biegu do końca.

    Zwraca odpowiedź `POST` (202: `run_id`, adresy wyniku; bieg jest już ZAKOŃCZONY,
    więc `result_url` daje wynik) albo odmowę zlecenia (410/422) bez zmian.
    """
    zlecenie = client.post(
        f"/api/cases/{case_id}/runs/v126/{rodzaj}", json={"parameters": parametry or {}}
    )
    if zlecenie.status_code != 202:
        return zlecenie
    poczekaj_na_stan_koncowy(
        client,
        f"/api/execution/runs/{zlecenie.json()['run_id']}",
        stany_koncowe=STANY_KONCOWE_HTTP,
        limit_s=limit_s,
    )
    return zlecenie


def poczekaj_na_wykonawce(limit_s: float = LIMIT_OCZEKIWANIA_S) -> None:
    """Poczekaj, aż wykonawca w tle wyczerpie kolejkę (izolacja między testami)."""
    from application.execution import wykonawca_biegow

    assert wykonawca_biegow.poczekaj_na_pustke(limit_s), "wykonawca w tle nie opróżnił kolejki"


__all__ = [
    "LIMIT_OCZEKIWANIA_S",
    "STANY_KONCOWE_DOMENOWE",
    "STANY_KONCOWE_HTTP",
    "STANY_KONCOWE_SERII",
    "poczekaj_na_stan_koncowy",
    "poczekaj_na_wykonawce",
    "uruchom_v126",
    "wykonaj_bieg",
    "wykonaj_bieg_rozplywu",
    "wykonaj_bieg_zabezpieczen",
    "wykonaj_serie",
]
