"""Jedno źródło prawdy: jakie dane zwarciowe niesie źródło sieciowe (CV-4.3 K7).

Do tej karty predykat „czy źródło ma parametry zwarciowe" żył w SIEDMIU kopiach
(walidator E008/W002, gotowość obliczeniowa, eligibility ×2, walidator kreatora
sieci, polityka operacji domenowych), a mapper (``enm/mapping.py``) rozstrzygał
tryb po swojemu — kopie już się rozjechały (gotowość obliczeniowa uznawała źródło
z jawną impedancją R/X za pozbawione Sk'', a źródło z samym Ik'' przechodziło
walidację i znikało z grafu solvera bez słowa). Reguła KLASA, NIE INSTANCJA:
predykaty parami — to, czego UŻYWA mapper, i to, co SPRAWDZA gotowość, pochodzi
z tej samej funkcji.

Tryby danych deklarowanych przez operatora (IEC 60909-0:2016 §6.2.1):
- ``IMPEDANCJA_JAWNA`` — R_Q + jX_Q z modelu (impedancja fizyczna, bez c),
- ``MOC_ZWARCIOWA`` — S''_kQ (Z_Q = c·U_nQ²/S''_kQ, eq. 6),
- ``PRAD_ZWARCIOWY`` — I''_kQ (Z_Q = c·U_nQ/(√3·I''_kQ), eq. 6 zapisana prądem).
Scenariusz MIN ma własny komplet (``sk3_min_mva``/``ik3_min_ka``/``rx_ratio_min``);
impedancja jawna jest fizyczna, więc nie ma wariantu MIN (c_min wchodzi wyłącznie do
źródła napięciowego w węźle zwarcia).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from .models import Source

#: Kod gotowości (kanon ``domain/canonical_operations.py::READINESS_CODES``): scenariusz
#: MIN bez S''_kQmin/I''_kQmin — Z_Q wzięte z danych MAX (założenie NIEKONSERWATYWNE
#: dla czułości zabezpieczeń: prawdziwe Z_Qmin ≥ Z_Qmax, więc rzeczywisty prąd MIN
#: może być NIŻSZY). Emitowane w śladzie ``zrodla_sieciowe`` i w ``raw_result.zalozenia``.
KOD_SK_MIN_BRAK = "source.sk_min_missing"


class TrybDanych(str, Enum):
    IMPEDANCJA_JAWNA = "IMPEDANCJA_JAWNA"
    MOC_ZWARCIOWA = "MOC_ZWARCIOWA"
    PRAD_ZWARCIOWY = "PRAD_ZWARCIOWY"


def dodatnia(wartosc: object) -> bool:
    """Dana liczbowa obecna i > 0 (``None``/0/ujemna = brak danej, nie „zero fizyczne")."""
    return isinstance(wartosc, int | float) and not isinstance(wartosc, bool) and wartosc > 0


def impedancja_jawna(r_ohm: object, x_ohm: object) -> bool:
    """R i X podane wprost i nie oba zerowe (0 + j0 nie jest impedancją zasilania)."""
    return (
        isinstance(r_ohm, int | float)
        and isinstance(x_ohm, int | float)
        and not isinstance(r_ohm, bool)
        and not isinstance(x_ohm, bool)
        and (r_ohm > 0 or x_ohm > 0)
    )


def tryb_danych(
    *, r_ohm: object = None, x_ohm: object = None, sk3_mva: object = None, ik3_ka: object = None
) -> TrybDanych | None:
    """Tryb danych zwarciowych z WARTOŚCI — ta sama kolejność pierwszeństwa co mapper."""
    if impedancja_jawna(r_ohm, x_ohm):
        return TrybDanych.IMPEDANCJA_JAWNA
    if dodatnia(sk3_mva):
        return TrybDanych.MOC_ZWARCIOWA
    if dodatnia(ik3_ka):
        return TrybDanych.PRAD_ZWARCIOWY
    return None


def dane_zerowe(
    *, r0_ohm: object = None, x0_ohm: object = None, z0_z1_ratio: object = None
) -> bool:
    """Źródło ma dane składowej zerowej: jawne R0 i X0 albo dodatni stosunek Z0/Z1."""
    return (r0_ohm is not None and x0_ohm is not None) or dodatnia(z0_z1_ratio)


@dataclass(frozen=True)
class DaneZwarcioweZrodla:
    """Co źródło niesie: tryb dla MAX, tryb dla MIN (bez impedancji jawnej), dane Z0.

    Nazwy ``tryb_max``/``tryb_min`` (nie ``max``/``min``): nazwy pól kontraktów wejściowych
    trafiają do inwentarza ``solver_input_substitute_guard`` — pole o nazwie ``max``
    kazałoby guardowi traktować każde ``np.max(...)`` w repo jako podstawienie liczby.
    """

    tryb_max: TrybDanych | None
    tryb_min: TrybDanych | None
    z0: bool

    @property
    def policzalne(self) -> bool:
        """Źródło wnosi bocznik Y_Q do grafu solvera (predykat mappera)."""
        return self.tryb_max is not None


def dane_zwarciowe_zrodla(source: Source) -> DaneZwarcioweZrodla:
    """Dla ``enm.models.Source``."""
    tryb_max = tryb_danych(
        r_ohm=source.r_ohm, x_ohm=source.x_ohm, sk3_mva=source.sk3_mva, ik3_ka=source.ik3_ka
    )
    tryb_min = tryb_danych(sk3_mva=source.sk3_min_mva, ik3_ka=source.ik3_min_ka)
    z0 = dane_zerowe(r0_ohm=source.r0_ohm, x0_ohm=source.x0_ohm, z0_z1_ratio=source.z0_z1_ratio)
    return DaneZwarcioweZrodla(tryb_max=tryb_max, tryb_min=tryb_min, z0=z0)


#: Pasmo napięcia zadanego szyny bilansującej [p.u.]: poza nim nastawa jest błędem danych
#: (bliźniaki literatury: 0,982 — IEEE case39, 1,06 — IEEE case14; PN-EN 50160 ±10 %
#: pracy normalnej mieści się w środku). Jedno źródło prawdy dla operacji domenowej
#: (`source.manual_equivalent_invalid`) i walidatora (`sources.u_set_pu_out_of_range`).
PASMO_U_SET_PU: tuple[float, float] = (0.8, 1.2)


def u_set_pu_w_pasmie(wartosc: object) -> bool:
    return (
        isinstance(wartosc, int | float)
        and PASMO_U_SET_PU[0] <= float(wartosc) <= PASMO_U_SET_PU[1]
    )
