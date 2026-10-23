"""Sprawdzenia koordynacji zabezpieczeń (E-28) — typy wyniku, bez fizyki.

Karta BIEG-ZABEZPIECZEN-Z-MODELU (D-21): urządzenia i nastawy żyją w modelu
(``ProtectionAssignment`` + ``ProtectionSetting``), więc równoległy model urządzenia
koordynacji (``ProtectionDevice`` z nastawami ``stage_51``/``stage_50`` przysyłanymi przez
klienta) został skasowany na amen, bez warstwy zgodności. Zostają typy SPRAWDZEŃ, które niesie
wynik koordynacji, raporty PDF/DOCX i ekran.

Zakaz P-06 (``docs/analysis/PROTECTION_CANONICAL_ARCHITECTURE.md`` §3): koordynacja NIE
wydaje werdyktów „prawidłowa / nieskoordynowane" — podaje wyłącznie wielkości liczbowe ze
śladem (odstęp czasowy, iloraz czułości, iloraz przeciążalności) obok wartości wymaganej
z kryteriów projektowych. Ocenę liczb zostawia projektantowi; dawny werdykt sprawdzenia
(``CoordinationVerdict`` PASS/MARGINAL/FAIL/ERROR) i jego etykiety skasowane.

Pola liczbowe sprawdzeń są ``None``, gdy wartości nie wyznaczono (odmowa, brak zadziałania) —
nigdy liczba zastępcza (dawniej 0,0 A albo 999,999 s); zdanie ``notes_pl`` mówi dlaczego.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class StanPary(StrEnum):
    """Co zadziała przy zwarciu w punkcie strefy podrzędnego — FAKT z czasów obu urządzeń
    (który przekaźnik się pobudza), nie ocena selektywności."""

    ODSTEP = "ODSTEP"
    NADRZEDNE_NIE_POBUDZA = "NADRZEDNE_NIE_POBUDZA"
    PODRZEDNE_NIE_ZADZIALA = "PODRZEDNE_NIE_ZADZIALA"
    ZADNE_NIE_ZADZIALA = "ZADNE_NIE_ZADZIALA"
    BEZ_PUNKTOW = "BEZ_PUNKTOW"


#: Opis faktu po polsku (dla tabel i raportów — ekran nie buduje własnych tekstów).
STAN_PARY_PL: dict[str, str] = {
    "ODSTEP": "oba zabezpieczenia zadziałają — odstęp czasowy wyznaczony",
    "NADRZEDNE_NIE_POBUDZA": "zabezpieczenie nadrzędne się nie pobudza",
    "PODRZEDNE_NIE_ZADZIALA": "zabezpieczenie podrzędne nie zadziała, nadrzędne zadziała",
    "ZADNE_NIE_ZADZIALA": "żadne z dwóch zabezpieczeń nie zadziała",
    "BEZ_PUNKTOW": "brak punktu zwarcia z oceną obu zabezpieczeń",
}


@dataclass(frozen=True)
class SensitivityCheck:
    """Czułość: najmniejszy prąd przekaźnika w strefie (bieg minimalny) wobec progu
    najczulszego stopnia. ``ratio`` = I_min/I_s, ``margin_percent`` = (I_min/I_s − 1)·100,
    ``required_ratio`` — kryterium projektowe (współczynnik czułości wymagany)."""

    device_id: str
    i_fault_min_a: float | None
    i_pickup_a: float | None
    ratio: float | None
    margin_percent: float | None
    required_ratio: float
    notes_pl: str
    punkt_ref: str | None = None
    nazwa_punktu_pl: str | None = None
    stopien: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "device_id": self.device_id,
            "i_fault_min_a": self.i_fault_min_a,
            "i_pickup_a": self.i_pickup_a,
            "ratio": self.ratio,
            "margin_percent": self.margin_percent,
            "required_ratio": self.required_ratio,
            "notes_pl": self.notes_pl,
            "punkt_ref": self.punkt_ref,
            "nazwa_punktu_pl": self.nazwa_punktu_pl,
            "stopien": self.stopien,
        }


@dataclass(frozen=True)
class SelectivityCheck:
    """Selektywność pary w punkcie strefy podrzędnego o NAJMNIEJSZYM odstępie (bieg maksymalny).

    ``analysis_current_a`` — prąd przekaźnika podrzędnego, ``i_upstream_a`` — prąd przekaźnika
    nadrzędnego w tym samym punkcie; ``margin_s`` = t_nad − t_pod (``None``, gdy jedno z
    urządzeń nie zadziała — ``stan`` mówi które); ``required_margin_s`` — wymagany odstęp
    czasowy (CTI) z kryteriów projektowych."""

    upstream_device_id: str
    downstream_device_id: str
    analysis_current_a: float | None
    t_upstream_s: float | None
    t_downstream_s: float | None
    margin_s: float | None
    required_margin_s: float
    stan: StanPary
    notes_pl: str
    punkt_ref: str | None = None
    nazwa_punktu_pl: str | None = None
    i_upstream_a: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "upstream_device_id": self.upstream_device_id,
            "downstream_device_id": self.downstream_device_id,
            "analysis_current_a": self.analysis_current_a,
            "i_upstream_a": self.i_upstream_a,
            "t_upstream_s": self.t_upstream_s,
            "t_downstream_s": self.t_downstream_s,
            "margin_s": self.margin_s,
            "required_margin_s": self.required_margin_s,
            "stan": self.stan.value,
            "stan_pl": STAN_PARY_PL[self.stan.value],
            "notes_pl": self.notes_pl,
            "punkt_ref": self.punkt_ref,
            "nazwa_punktu_pl": self.nazwa_punktu_pl,
        }


@dataclass(frozen=True)
class OverloadCheck:
    """Przeciążalność: próg stopnia zwłocznego wobec prądu roboczego wyłącznika (bieg
    rozpływu). ``ratio`` = I_s/I_rob, ``margin_percent`` = (I_s/I_rob − 1)·100,
    ``required_ratio`` — kryterium projektowe."""

    device_id: str
    i_operating_a: float | None
    i_pickup_a: float | None
    ratio: float | None
    margin_percent: float | None
    required_ratio: float
    notes_pl: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "device_id": self.device_id,
            "i_operating_a": self.i_operating_a,
            "i_pickup_a": self.i_pickup_a,
            "ratio": self.ratio,
            "margin_percent": self.margin_percent,
            "required_ratio": self.required_ratio,
            "notes_pl": self.notes_pl,
        }
