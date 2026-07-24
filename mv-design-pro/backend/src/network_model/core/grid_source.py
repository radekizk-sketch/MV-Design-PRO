"""Źródło sieciowe (zasilanie systemowe) dla obliczeń zwarciowych IEC 60909.

Sieć zasilająca (external grid / network feeder, IEC 60909-0 §3.2) jest siłą
elektromotoryczną ZA impedancją Z_Q. W metodzie Z-bus odpowiada to bocznikowi
Y_Q = 1/Z_Q w węźle przyłączenia — dokładnie tak, jak maszyny wirujące (§6.3,
§6.7) i tak, jak sieć składowej zerowej stampuje źródło (``enm/mapping.py``).

Uziemienie węzła źródła admitancją idealną (szyna nieskończona) ZWIERAŁOBY
Z_Q — patrz ``ybus._ground_slack_buses``.
"""

import uuid
from dataclasses import dataclass, field


@dataclass(frozen=True)
class GridShortCircuitSource:
    """Zasilanie systemowe jako SEM za impedancją Z_Q (składowa zgodna).

    Attributes:
        id: Identyfikator (deterministyczna kolejność stampowania).
        name: Nazwa prezentacyjna (ślad WHITE BOX).
        node_id: Węzeł przyłączenia w grafie.
        z_ohm: Impedancja zgodna Z_Q [Ω] w napięciu węzła przyłączenia.
        in_service: Czy źródło jest w ruchu.
    """

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = field(default="")
    node_id: str = field(default="")
    z_ohm: complex = field(default=0j)
    in_service: bool = field(default=True)
