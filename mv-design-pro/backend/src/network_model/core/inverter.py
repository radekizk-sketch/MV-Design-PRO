"""
Definicje źródeł falownikowych (OZE) dla obliczeń zwarciowych IEC 60909.
"""

import uuid
from dataclasses import dataclass, field

from network_model.catalog.types import ConverterKind
from network_model.core.wklad_zwarciowy_przeksztaltnika import (
    deklaracja_k_sc,
    prad_wkladu_zwarciowego,
    wspolczynnik_wkladu_zwarciowego,
)


@dataclass
class InverterSource:
    """
    Źródło falownikowe modelowane jako ograniczone źródło prądowe IEC 60909.

    Model uproszczony: wkład tylko jako prąd RMS w punkcie zwarcia,
    bez modelowania impedancji wewnętrznej.
    """

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = field(default="")
    node_id: str = field(default="")
    type_ref: str | None = field(default=None)
    converter_kind: ConverterKind | None = field(default=None)
    in_rated_a: float = field(default=0.0)
    #: Współczynnik wkładu zwarciowego Z DEKLARACJI — karta producenta albo
    #: certyfikat jednostki wytwórczej. ``None`` znaczy „nikt nie podał" i JEST
    #: informacją, nie brakiem do wypełnienia liczbą.
    #:
    #: JEDNO POLE, NIE DWA. Wartość użyta w rachunku (`k_sc_efektywny`) i
    #: znacznik pochodzenia (`k_sc_zrodlo`) są z niego WYPROWADZANE, a nie
    #: trzymane obok. Dwie dane, które muszą się zgadzać, to wzorzec, który
    #: kanon nazywa defektem czekającym na dane brzegowe — tu nie da się go
    #: odtworzyć, bo obie odpowiedzi liczy ten sam predykat z tego samego pola.
    #:
    #: Jawny argument konstruktora JEST deklaracją: `InverterSource(k_sc=1.35)`
    #: znaczy „ktoś tę wartość podał". Domyślka powstaje z POMINIĘCIA argumentu,
    #: nie z wpisania liczby równej domyślce.
    k_sc: float | None = field(default=None)
    contributes_negative_sequence: bool = field(default=False)
    contributes_zero_sequence: bool = field(default=False)
    in_service: bool = field(default=True)

    @property
    def k_sc_efektywny(self) -> float:
        """Współczynnik użyty w rachunku: deklaracja albo domyślka systemowa."""
        return wspolczynnik_wkladu_zwarciowego(self.k_sc)[0]

    @property
    def k_sc_zrodlo(self) -> str:
        """Pochodzenie współczynnika — WYPROWADZONE z tej samej deklaracji.

        Znacznik nie da się rozjechać z wartością, bo obie odpowiedzi liczy ten
        sam predykat z tego samego pola.
        """
        return wspolczynnik_wkladu_zwarciowego(self.k_sc)[1]

    @property
    def ik_sc_a(self) -> float:
        """RMS wkład prądowy do zwarcia ``I_k = k_sc · I_n`` — ZAWSZE skończony.

        KOREKTA PO RECENZJI NIEZALEŻNEJ (P1-DELTA-07). Poprzednia wersja mnożyła
        wprost, więc para skończonych, dodatnich, każda z osobna poprawnych
        wartości (``k_sc = 1e308``, ``I_n = 1000 A``) dawała ``inf`` — i to ``inf``
        oznaczony jako pochodzący z DEKLARACJI. Nieskończoność wchodziła stąd do
        serializacji, składania wyniku zwarciowego i doboru aparatury.

        Kontrola dziedziny wyniku siedzi w
        `wklad_zwarciowy_przeksztaltnika.prad_wkladu_zwarciowego`, czyli w tym
        samym module co predykat wejściowy — dwa warunki opisujące tę samą daną
        muszą pochodzić z jednego źródła prawdy.
        """
        return prad_wkladu_zwarciowego(self.k_sc, self.in_rated_a)[0]

    @property
    def wklad_zrodlo(self) -> str:
        """Pochodzenie WKŁADU (nie samego współczynnika) — z kontrolą dziedziny.

        Różni się od `k_sc_zrodlo` dokładnie w jednym przypadku: deklaracja jest
        poprawna, ale iloczyn z prądem znamionowym wychodzi poza zakres liczb
        skończonych. To ten znacznik czyta warstwa gotowości i autorytetu.
        """
        return prad_wkladu_zwarciowego(self.k_sc, self.in_rated_a)[1]

    def to_dict(self) -> dict:
        """
        Serializes inverter source to a dictionary.
        """
        return {
            "id": self.id,
            "name": self.name,
            "node_id": self.node_id,
            "type_ref": self.type_ref,
            "converter_kind": self.converter_kind.value if self.converter_kind else None,
            "in_rated_a": self.in_rated_a,
            # DEKLARACJA, nie wartość efektywna — inaczej obieg
            # `from_dict(to_dict(x))` zamieniałby domyślkę systemową w deklarację
            # (``1.1`` jest liczbą dodatnią, więc przy odczycie przeszłoby jako
            # „ktoś to podał"). Migawka niosłaby wtedy informację, że projektant
            # zadeklarował współczynnik, którego nigdy nie widział — i po jednym
            # zapisie modelu ślad White Box przestałby odróżniać oba przypadki.
            "k_sc": self.k_sc,
            "contributes_negative_sequence": self.contributes_negative_sequence,
            "contributes_zero_sequence": self.contributes_zero_sequence,
            "in_service": self.in_service,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "InverterSource":
        """
        Deserializes inverter source from a dictionary.
        """
        return cls(
            id=str(data.get("id", str(uuid.uuid4()))),
            name=str(data.get("name", "")),
            node_id=str(data.get("node_id", "")),
            type_ref=data.get("type_ref"),
            converter_kind=(
                ConverterKind(str(data.get("converter_kind")).upper())
                if data.get("converter_kind") is not None
                else None
            ),
            in_rated_a=float(data.get("in_rated_a", 0.0)),
            k_sc=deklaracja_k_sc(data.get("k_sc")),
            contributes_negative_sequence=bool(data.get("contributes_negative_sequence", False)),
            contributes_zero_sequence=bool(data.get("contributes_zero_sequence", False)),
            in_service=bool(data.get("in_service", True)),
        )
