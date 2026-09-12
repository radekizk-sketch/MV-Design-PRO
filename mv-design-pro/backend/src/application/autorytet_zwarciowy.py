"""Most: snapshot ENM → proweniencja wyniku zwarciowego (warstwa aplikacji).

DLACZEGO TU, A NIE W API. Wyprowadzenie proweniencji wymaga przejścia snapshot →
model → graf obliczeniowy. Warstwa prezentacji nie ma prawa tego robić (zakaz
fizyki i mapowania w API), a rdzeń nie zna formatu snapshotu. Most należy do
warstwy aplikacji i jest JEDNYM miejscem, w którym ta zamiana zachodzi.

ZERO FIZYKI. Moduł niczego nie liczy — czyta znaczniki pochodzenia ``k_sc``
policzone przez rdzeń i pakuje je w wartość, którą rozumie bramka autorytetu.

FAIL-CLOSED PRZY KAŻDYM NIEPOWODZENIU. Snapshot, którego nie da się zwalidować
ani zmapować, NIE staje się „brakiem przeszkód". Zwracamy wtedy stan ``bez_sladu``,
czyli blokadę — bo „nie umiem sprawdzić" i „sprawdziłem, jest dobrze" to dwie
różne odpowiedzi.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from network_model.core.autorytet_wyniku_zwarciowego import ProweniencjaWynikuZwarciowego


def proweniencja_ze_snapshotu(snapshot: Mapping[str, Any] | None) -> ProweniencjaWynikuZwarciowego:
    """Proweniencja wyprowadzona ze snapshotu ENM.

    Brak snapshotu (``None``) znaczy „konsument nie podał modelu" — wtedy jedyną
    uczciwą odpowiedzią jest brak śladu, nie domniemanie poprawności.
    """
    if not snapshot:
        return ProweniencjaWynikuZwarciowego.bez_sladu()

    try:
        from enm.mapping import map_enm_to_network_graph
        from enm.models import EnergyNetworkModel

        model = EnergyNetworkModel.model_validate(dict(snapshot))
        graf = map_enm_to_network_graph(model)
    except Exception:
        # Snapshot nieczytelny: nie wiemy, co wnoszą źródła falownikowe. Blokada,
        # nie przepustka — patrz nagłówek modułu.
        return ProweniencjaWynikuZwarciowego.bez_sladu()

    return ProweniencjaWynikuZwarciowego.z_grafu(graf)
