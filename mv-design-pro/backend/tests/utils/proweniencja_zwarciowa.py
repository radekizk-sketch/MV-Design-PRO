"""Wspólne wejście o ZNANEJ proweniencji dla testów konsumentów miarodajnych.

PO CO TO ISTNIEJE. Od czasu wprowadzenia granicy autorytetu
(`network_model.core.autorytet_wyniku_zwarciowego`) generator dowodu doboru
aparatury, koordynacja zabezpieczeń i pakiety dowodowe zwarciowe nie wystawiają
artefaktu z wejścia nieznanego pochodzenia. Testy, które badają TREŚĆ i
DETERMINIZM tych artefaktów, muszą więc podać model — tak samo jak podaje go
produkt.

MODEL BEZ ŹRÓDEŁ FALOWNIKOWYCH JEST TU WŁAŚCIWY I UCZCIWY. Gdy w sieci nie ma
falowników, wkład falownikowy NIE WCHODZI do równań zwarciowych, więc nie ma
danej, której mogłoby brakować — proweniencja jest miarodajna z powodu
merytorycznego, a nie dlatego, że test coś obszedł. Przypadki DER (z deklaracją
i bez) mają własne testy granicy w `tests/api/test_granica_autorytetu_downstream.py`.
"""

from __future__ import annotations

from typing import Any

from application.autorytet_zwarciowy import proweniencja_ze_snapshotu
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from network_model.core.autorytet_wyniku_zwarciowego import ProweniencjaWynikuZwarciowego


def snapshot_bez_falownikow(*, sn_nominal_kv: float = 15.0) -> dict[str, Any]:
    """Najmniejszy poprawny snapshot ENM bez źródeł przekształtnikowych."""
    return EnergyNetworkModel(
        header=ENMHeader(
            name="proweniencja_testowa",
            defaults=ENMDefaults(sn_nominal_kv=sn_nominal_kv),
        ),
    ).model_dump(mode="json")


def proweniencja_bez_falownikow() -> ProweniencjaWynikuZwarciowego:
    """Proweniencja WYPROWADZONA z modelu — nie skonstruowana wprost.

    Świadomie przechodzi przez ten sam most co produkt (`proweniencja_ze_snapshotu`),
    żeby test nie omijał drogi, którą idzie żądanie. Gdyby te testy budowały
    wartość ręcznie, regresja w moście byłaby dla nich niewidoczna.
    """
    return proweniencja_ze_snapshotu(snapshot_bez_falownikow())
