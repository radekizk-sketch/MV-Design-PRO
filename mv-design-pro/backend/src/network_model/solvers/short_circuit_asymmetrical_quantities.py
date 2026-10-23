"""
SC1 Asymmetrical Quantities — wielkości zwarciowe dla zwarć asymetrycznych (WHITE BOX).

STATUS: CANONICAL & BINDING
Rejestr: V12K-118 (naprawa NOT-A-SOLVER w torze dowodowym SC1).

Fizyka przeniesiona 1:1 (VERBATIM, bit-w-bit) z
``application/proof_engine/proof_generator.py`` (``generate_sc1_proof``),
gdzie łamała regułę NOT-A-SOLVER (proof engine = czysta interpretacja).
Od tej zmiany wielkości liczy TEN moduł (warstwa solverów), a wywołujący
(pakiet dowodowy) przekazuje gotowy wynik do generatora dowodu, który
wyłącznie FORMATUJE kroki (wzór → podstawienie → wynik).

Determinizm dowodów: to samo wejście daje ten sam wynik bit w bit. Karta SC-IB-ITH-ZRODLA
zmieniła WARTOŚĆ I_th (m, n z t_k i κ tego typu zwarcia zamiast podanych z zewnątrz) —
goldeny ``tests/golden/sc_asymmetrical/**`` odświeżone z uzasadnieniem w commicie karty.

IEC 60909-0:2016:
- 1F-Z: Z_k = Z1 + Z2 + Z0;            I″k1  = √3·c·Un / |Z_k|  (eq. 29)
- 2F:   Z_k = Z1 + Z2;                 I″k2  = c·Un / |Z_k|     (eq. 23)
- 2F-Z: Z_k = Z1 + Z2·Z0/(Z2+Z0);      I″k2E = c·Un / |Z_k|
- κ = 1.02 + 0.98·e^(−3·R/X); i_p = κ·√2·I″k; I_dyn = i_p; I_th = I″k·√(m+n)

κ, i_p i I_th z JEDNEGO źródła rdzenia (karta SC-IB-ITH-ZRODLA, B-01 (n)):
`short_circuit_core.compute_post_fault_quantities` z czasem t_k i R/X pętli TEGO typu
zwarcia. Do tej karty moduł miał własną kopię wzoru κ (z R/X = 0 dla X = 0, czyli κ = 2
dla pętli czysto rezystancyjnej zamiast 1,02) i przyjmował m, n z ZEWNĄTRZ — pakiet
dowodowy podawał m, n wyniku 1F-Z także zwarciom 2F i 2F-Z, mimo że κ każdego typu jest
inne; dowód I_th zwarcia 2F pokazywał więc m policzone dla cudzej pętli.

Zwarcie przez impedancję przejścia Z_f (karta OD-14, partia integracji 10): impedancja pętli
z JEDNEGO źródła wzorów rdzenia (`short_circuit_core.impedancja_petli_zwarcia` — do tej karty
ten moduł miał własną kopię trzech wzorów pętli, drugą ścieżkę tej samej fizyki), prądy
składowe z tym samym torem zerowym Z_0 + 3·Z_f co pętla. Bez Z_f każde wyrażenie i kolejność
działań jak przed kartą — goldeny bit w bit.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from network_model.core.impedancja_przejscia import (
    OPISY_ODMOW_IMPEDANCJI,
    impedancja_przejscia_obliczeniowa,
    kod_odmowy_impedancji,
)
from network_model.core.modul_zespolony import modul_zespolony
from network_model.odmowa_danych import OdmowaDanychError, OdmowaNazwana
from network_model.solvers.short_circuit_core import (
    ShortCircuitType,
    compute_post_fault_quantities,
    impedancja_petli_zwarcia,
)

_FAULT_TYPE_MAPPING = {
    "ONE_PHASE_TO_GROUND": "SC1FZ",
    "TWO_PHASE": "SC2F",
    "TWO_PHASE_TO_GROUND": "SC2FZ",
    "SC1FZ": "SC1FZ",
    "SC2F": "SC2F",
    "SC2FZ": "SC2FZ",
}

#: Postać kanoniczna typu SC1 → rodzaj zwarcia rdzenia (jedno źródło wzorów pętli).
_RODZAJ_RDZENIA: dict[str, ShortCircuitType] = {
    "SC1FZ": ShortCircuitType.SINGLE_PHASE_GROUND,
    "SC2F": ShortCircuitType.TWO_PHASE,
    "SC2FZ": ShortCircuitType.TWO_PHASE_GROUND,
}

#: Operator Fortescue ``a = e^{j120°}`` transformacji składowych symetrycznych.
#: STAŁA DEFINICYJNA metody (IEC 60909-0:2016 / PN-EN 60909), nie parametr modelu
#: ani danych projektu — dlatego jej miejscem jest warstwa solvera, a nie kontrakt
#: HTTP. Dotąd każdy wywołujący pakiet dowodowy SC1 musiał ją PODAĆ w żądaniu, co
#: zmuszało klienta (UI) do niesienia wielkości fizycznej — patrz karta PACK-DOWODY.
OPERATOR_FORTESCUE_A = complex(-0.5, math.sqrt(3.0) / 2.0)


def napiecie_fazowe_przedzwarciowe_kv(*, u_n_kv: float, c_factor: float) -> float:
    """Napięcie fazowe przed zwarciem ``U_f = c · U_n / √3`` [kV].

    Wielkość wejściowa prądów składowych zwarć niesymetrycznych (IEC 60909-0:2016:
    źródło zastępcze w miejscu zwarcia ``c·U_n/√3``). Definicja tożsama z tą, którą
    dotąd wyliczał WYWOŁUJĄCY i przekazywał jako ``u_prefault_kv`` — przeniesiona do
    warstwy solverów, żeby klient pakietu dowodowego nie musiał liczyć fizyki.
    """
    return c_factor * u_n_kv / math.sqrt(3.0)


@dataclass(frozen=True)
class SC1AsymmetricalQuantities:
    """Wielkości zwarciowe SC1 policzone w warstwie solverów (WHITE BOX).

    Wszystkie wartości pośrednie jawne (audyt numeryczny możliwy):
    impedancja zastępcza, prądy składowe i fazowe, I″k, κ, i_p, I_dyn, I_th oraz czas t_k
    i współczynniki cieplne m, n, z którymi policzono I_th (rdzeń `_thermal_mn_factors`).
    """

    fault_type: str  # znormalizowany: SC1FZ | SC2F | SC2FZ
    z_equiv_ohm: complex
    i1_ka: complex
    i2_ka: complex
    i0_ka: complex
    ia_ka: complex
    ib_ka: complex
    ic_ka: complex
    ikss_ka: float
    r_equiv_ohm: float
    x_equiv_ohm: float
    kappa: float
    ip_ka: float
    idyn_ka: float
    ith_ka: float
    #: Karta SC-IB-ITH-ZRODLA: t_k [s] i współczynniki cieplne m (składowa nieokresowa,
    #: z κ TEGO typu zwarcia) oraz n (= 1, górne oszacowanie) użyte w I_th = I″k·√(m+n).
    tk_s: float
    m_factor: float
    n_factor: float
    #: Karta OD-14: impedancja przejścia Z_f [Ω], z którą policzono pętlę; None = zwarcie
    #: metaliczne IEC 60909 (wielkości bit w bit jak przed kartą).
    z_f_ohm: complex | None = None


def normalize_sc1_fault_type(fault_type: str) -> str:
    """Normalizuje typ zwarcia asymetrycznego do postaci kanonicznej."""
    if fault_type not in _FAULT_TYPE_MAPPING:
        raise ValueError(f"Unsupported SC1 fault type: {fault_type}")
    return _FAULT_TYPE_MAPPING[fault_type]


def _tor_zerowy(z0: complex, z_f: complex | None) -> complex:
    """Impedancja toru składowej zerowej: Z_0, a przy impedancji przejścia Z_0 + 3·Z_f."""
    return z0 if z_f is None else z0 + 3.0 * z_f


def _compute_equiv_impedance(
    *,
    fault_type: str,
    z1: complex,
    z2: complex,
    z0: complex,
    z_f: complex | None = None,
) -> complex:
    rodzaj = _RODZAJ_RDZENIA.get(fault_type)
    if rodzaj is None:
        raise ValueError(f"Unsupported SC1 fault type: {fault_type}")
    if fault_type == "SC2FZ" and z2 + _tor_zerowy(z0, z_f) == 0:
        raise OdmowaDanychError(
            "Suma impedancji składowej przeciwnej i toru składowej zerowej jest równa zeru — "
            "impedancji zastępczej zwarcia dwufazowego z ziemią nie da się wyznaczyć."
        )
    return impedancja_petli_zwarcia(rodzaj, z1=z1, z2=z2, z0=z0, z_f=z_f)


def _compute_sequence_currents(
    *,
    fault_type: str,
    u_prefault_kv: float,
    z_equiv: complex,
    z2: complex,
    z0: complex,
    z_f: complex | None = None,
) -> tuple[complex, complex, complex]:
    if z_equiv == 0:
        raise OdmowaDanychError(
            "Impedancja zastępcza pętli zwarcia jest równa zeru — prądów składowych nie da się "
            "wyznaczyć."
        )
    i1 = u_prefault_kv / z_equiv
    if fault_type == "SC1FZ":
        return i1, i1, i1
    if fault_type == "SC2F":
        return i1, -i1, 0.0
    if fault_type == "SC2FZ":
        z0_toru = _tor_zerowy(z0, z_f)
        denominator = z2 + z0_toru
        if denominator == 0:
            raise OdmowaDanychError(
                "Suma impedancji składowej przeciwnej i toru składowej zerowej jest równa "
                "zeru — prądów składowych zwarcia dwufazowego z ziemią nie da się wyznaczyć."
            )
        i2 = -(z0_toru / denominator) * i1
        i0 = -(z2 / denominator) * i1
        return i1, i2, i0
    raise ValueError(f"Unsupported SC1 fault type: {fault_type}")


def _compute_phase_currents(
    *,
    a_operator: complex,
    i0: complex,
    i1: complex,
    i2: complex,
) -> tuple[complex, complex, complex]:
    a = a_operator
    a2 = a**2
    ia = i0 + i1 + i2
    ib = i0 + a2 * i1 + a * i2
    ic = i0 + a * i1 + a2 * i2
    return ia, ib, ic


def _compute_ikss(
    *,
    fault_type: str,
    c_factor: float,
    u_n_kv: float,
    z_equiv: complex,
) -> float:
    """
    I″k for asymmetrical faults per IEC 60909-0:2016.

    - 1F-Z: I″k1 = √3·c·Un / |Z_k|  (eq. 29)
    - 2F:   I″k2 = c·Un / |Z_k|       (eq. 23)
    - 2F-Z: I″k2E = c·Un / |Z_k|
    """
    z_abs = modul_zespolony(z_equiv)
    if z_abs == 0:
        raise OdmowaDanychError(
            "Impedancja zastępcza pętli zwarcia jest równa zeru — prądu I″k nie da się "
            "wyznaczyć."
        )
    if fault_type == "SC1FZ":
        return math.sqrt(3.0) * c_factor * u_n_kv / z_abs
    return c_factor * u_n_kv / z_abs


def compute_sc1_asymmetrical_quantities(
    *,
    fault_type: str,
    u_n_kv: float,
    c_factor: float,
    u_prefault_kv: float,
    z1_ohm: complex,
    z2_ohm: complex,
    z0_ohm: complex,
    a_operator: complex,
    tk_s: float,
    z_f_ohm: complex | None = None,
) -> SC1AsymmetricalQuantities:
    """Liczy komplet wielkości zwarciowych SC1 (1F-Z / 2F / 2F-Z).

    Jedyne miejsce fizyki toru dowodowego SC1 (NOT-A-SOLVER: proof engine
    dostaje ten wynik i wyłącznie formatuje kroki dowodu).

    ``z_f_ohm`` — impedancja przejścia w miejscu zwarcia (karta OD-14): pętla z wzorów rdzenia
    (2F: Z_1 + Z_2 + Z_f; 1F-Z: Z_1 + Z_2 + Z_0 + 3Z_f; 2F-Z: tor zerowy Z_0 + 3Z_f), prądy
    składowe 2F-Z z tym samym torem zerowym. Wynik poza zakresem IEC 60909.

    ``tk_s`` — czas trwania zwarcia t_k [s]; κ, i_p, m, n i I_th liczy rdzeń
    (`compute_post_fault_quantities`) z R/X pętli tego typu zwarcia — jedno źródło I_th.
    """
    normalized = normalize_sc1_fault_type(fault_type)
    if z_f_ohm is not None:
        # Ta sama reguła danych i normalizacja Z_f = 0 → metaliczne co rdzeń IEC 60909.
        kod = kod_odmowy_impedancji(float(z_f_ohm.real), float(z_f_ohm.imag))
        if kod is not None:
            raise OdmowaNazwana(
                OPISY_ODMOW_IMPEDANCJI[kod],
                kod=kod,
                dane={"r_f_ohm": float(z_f_ohm.real), "x_f_ohm": float(z_f_ohm.imag)},
            )
        z_f_ohm = impedancja_przejscia_obliczeniowa(float(z_f_ohm.real), float(z_f_ohm.imag))

    z_equiv = _compute_equiv_impedance(
        fault_type=normalized,
        z1=z1_ohm,
        z2=z2_ohm,
        z0=z0_ohm,
        z_f=z_f_ohm,
    )

    i1, i2, i0 = _compute_sequence_currents(
        fault_type=normalized,
        u_prefault_kv=u_prefault_kv,
        z_equiv=z_equiv,
        z2=z2_ohm,
        z0=z0_ohm,
        z_f=z_f_ohm,
    )

    ia, ib, ic = _compute_phase_currents(
        a_operator=a_operator,
        i0=i0,
        i1=i1,
        i2=i2,
    )

    # Post-fault quantities (§4.1 MANDATORY: I″k, ip, I_th, I_dyn)
    ikss_ka = _compute_ikss(
        fault_type=normalized,
        c_factor=c_factor,
        u_n_kv=u_n_kv,
        z_equiv=z_equiv,
    )

    r_equiv = z_equiv.real
    x_equiv = z_equiv.imag
    # Rdzeń jest liniowy w I″k (i_p = κ·√2·I″k, I_th = I″k·√(m+n)), więc podanie I″k w kA
    # daje i_p i I_th w kA; S_k'' rdzenia (wielkość trójfazowa) nie jest tu używana.
    post = compute_post_fault_quantities(
        ikss=ikss_ka, un_v=u_n_kv * 1000.0, z_equiv=z_equiv, tk_s=tk_s
    )
    kappa = post.kappa
    ip_ka = post.ip_a
    idyn_ka = ip_ka
    ith_ka = post.ith_a

    return SC1AsymmetricalQuantities(
        fault_type=normalized,
        z_equiv_ohm=z_equiv,
        i1_ka=i1,
        i2_ka=i2,
        i0_ka=i0,
        ia_ka=ia,
        ib_ka=ib,
        ic_ka=ic,
        ikss_ka=ikss_ka,
        r_equiv_ohm=r_equiv,
        x_equiv_ohm=x_equiv,
        kappa=kappa,
        ip_ka=ip_ka,
        idyn_ka=idyn_ka,
        ith_ka=ith_ka,
        tk_s=tk_s,
        m_factor=post.m_factor,
        n_factor=post.n_factor,
        z_f_ohm=z_f_ohm,
    )
