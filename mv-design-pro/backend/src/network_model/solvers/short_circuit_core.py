from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

import numpy as np
from network_model.core.graph import NetworkGraph
from network_model.core.modul_zespolony import modul_zespolony
from network_model.core.ybus import AdmittanceMatrixBuilder
from network_model.odmowa_danych import (
    RODZAJ_WEZEL,
    OdmowaWejsciaRdzenia,
    OdwolanieElementu,
    RekordOdmowy,
)

OMEGA_50HZ = 2.0 * math.pi * 50.0

#: Kod odmowy wejścia (rekord strukturalny `RekordOdmowy`, decyzja O-59, plan A/B §12.2 (k)):
#: węzeł zwarcia spoza grafu. JEDNO źródło kodu dla walidacji wejścia solvera IEC 60909
#: (`ShortCircuitIEC60909Solver._sprawdz_wejscie`) i dla jądra impedancji zastępczej poniżej
#: (decyzja B-01 partii integracji 9 — wcześniej jądro rzucało goły `ValueError`
#: z identyfikatorem węzła w treści).
KOD_WEZEL_ZWARCIA_SPOZA_GRAFU: str = "zwarcie.wezel_zwarcia_spoza_grafu"


def odmowa_wezla_zwarcia_spoza_grafu(fault_node_id: str) -> OdmowaWejsciaRdzenia:
    """Odmowa „węzeł zwarcia nie istnieje w grafie": treść bez identyfikatora, węzeł
    w odwołaniu rekordu (zdanie z nazwą składa `enm/zdania_odmow_rdzenia.py`)."""
    return OdmowaWejsciaRdzenia(
        [
            RekordOdmowy(
                KOD_WEZEL_ZWARCIA_SPOZA_GRAFU,
                "Wskazany węzeł zwarcia nie istnieje w grafie sieci.",
                (OdwolanieElementu(RODZAJ_WEZEL, fault_node_id),),
            )
        ]
    )


class ShortCircuitType(Enum):
    THREE_PHASE = "3F"
    SINGLE_PHASE_GROUND = "1F"
    TWO_PHASE = "2F"
    TWO_PHASE_GROUND = "2F+G"


@dataclass(frozen=True)
class ShortCircuitCoreResult:
    z_equiv: complex
    z1: complex
    z2: complex
    z0: complex | None
    # Karta OD-14 (partia integracji 10, addytywnie): impedancja przejścia w miejscu zwarcia
    # Z_f = R_f + jX_f [Ω] i impedancja zastępcza tej samej pętli przy Z_f = 0 (zwarcie
    # metaliczne IEC 60909) — podstawa współczynnika tłumienia pętli i warunku sanity
    # |I_k(Z_f)| ≤ |I_k(0)|. None = zwarcie metaliczne (wynik bit w bit jak przed kartą).
    z_f: complex | None = None
    z_equiv_metaliczne: complex | None = None


@dataclass(frozen=True)
class ShortCircuitPostProcessResult:
    """Wielkości pozwarciowe z I_k'' i impedancji pętli zwarcia (bez prądu wyłączeniowego).

    Karta SC-IB-ITH-ZRODLA (B-01 (n)): prąd wyłączeniowy I_b NIE jest tu liczony — zależy
    od udziału maszyn wirujących i od czasu t_b, których ta funkcja nie zna; jego jedyną
    definicją jest `prad_wylaczeniowy_symetryczny_a`, a składowej nieokresowej
    `skladowa_nieokresowa`.
    """

    rx_ratio: float
    kappa: float
    ip_a: float
    ith_a: float
    sk_mva: float
    # Audyt fizyki fala G (2026-07): wspolczynniki cieplne m (skladowa DC) i n
    # (skladowa AC) faktycznie uzyte do policzenia ith_a = ikss*sqrt(m+n) —
    # niesione addytywnie, zeby biale-skrzynkowy wywod (proof engine) mogl
    # pokazac PRAWDZIWE m,n zamiast domyslnych placeholderow. Patrz
    # _thermal_mn_factors ponizej.
    m_factor: float = 0.0
    n_factor: float = 1.0


def build_zbus(graph: NetworkGraph) -> tuple[AdmittanceMatrixBuilder, np.ndarray]:
    """Macierz Z-bus sieci zwarciowej IEC 60909 składowej zgodnej (i przeciwnej: Z_2 = Z_1).

    JEDYNE wejście sieci zgodnej dla każdej ścieżki zwarciowej (3F/2F/1F/2F+G, wkłady
    falowników i rozpływ Thevenina po gałęziach, maszyny wirujące, pętla zwarcia IEC 60364,
    ekwiwalent sieci nadrzędnej nN). Budowniczy w trybie `siec_zwarciowa=True`: admitancje
    poprzeczne gałęzi pominięte (IEC 60909-0:2016 pkt 5.2 f) i 5.3.1, karta BEZ-POJEMNOSCI),
    zasilania i maszyny jako boczniki źródeł.
    """
    builder = AdmittanceMatrixBuilder(graph)
    y_bus = builder.build(siec_zwarciowa=True)

    try:
        z_bus = np.linalg.inv(y_bus)
    except np.linalg.LinAlgError as exc:
        raise ValueError("Y-bus is singular; cannot compute Z-bus for short-circuit") from exc
    return builder, z_bus


def voltage_factor_for_fault(short_circuit_type: ShortCircuitType) -> float:
    if short_circuit_type == ShortCircuitType.THREE_PHASE:
        return 1.0 / math.sqrt(3.0)
    if short_circuit_type == ShortCircuitType.SINGLE_PHASE_GROUND:
        return math.sqrt(3.0)
    if short_circuit_type in {ShortCircuitType.TWO_PHASE, ShortCircuitType.TWO_PHASE_GROUND}:
        return 1.0
    raise ValueError(f"Unsupported short-circuit type: {short_circuit_type}")


def compute_equivalent_impedance(
    *,
    graph: NetworkGraph,
    fault_node_id: str,
    short_circuit_type: ShortCircuitType,
    z0_bus: np.ndarray | None = None,
    z2_bus: np.ndarray | None = None,
    z_f: complex | None = None,
) -> ShortCircuitCoreResult:
    """Impedancja zastępcza pętli zwarcia w węźle `fault_node_id` [Ω].

    Zwarcie metaliczne (IEC 60909, `z_f=None`): 3F Z_1; 2F Z_1 + Z_2; 1F Z_1 + Z_2 + Z_0;
    2F+G Z_1 + Z_2·Z_0/(Z_2 + Z_0).

    Zwarcie przez impedancję przejścia Z_f (karta OD-14, kontrakt
    `docs/domain/KONTRAKT_SCENARIUSZY_ZWARCIOWYCH_TRYB_IMPEDANCE.md` §2) — impedancja Z_f
    w każdej fazie zwarcia i w torze do ziemi, metoda składowych symetrycznych:
    3F Z_1 + Z_f; 2F Z_1 + Z_2 + Z_f; 1F Z_1 + Z_2 + Z_0 + 3·Z_f;
    2F+G Z_1 + Z_2·(Z_0 + 3·Z_f)/(Z_2 + Z_0 + 3·Z_f). Norma IEC 60909 definiuje prąd
    zwarciowy dla zwarcia metalicznego — wynik z Z_f ≠ 0 jest poza jej zakresem i tak go
    oznacza proweniencja biegu. `z_f=None` zostawia każdą wielkość bit w bit.
    """
    if fault_node_id not in graph.nodes:
        raise odmowa_wezla_zwarcia_spoza_grafu(fault_node_id)

    builder, z1_bus_pu = build_zbus(graph)
    node_index = builder.node_id_to_index[fault_node_id]
    z_base_ohm = builder.get_zbase_ohm(fault_node_id)
    z1 = z1_bus_pu[node_index, node_index] * z_base_ohm
    z2 = (z2_bus[node_index, node_index] * z_base_ohm) if z2_bus is not None else z1

    def require_z0_bus(message: str) -> complex:
        if z0_bus is None:
            raise ValueError(message)
        return z0_bus[node_index, node_index] * z_base_ohm

    z0: complex | None = None
    if short_circuit_type in {
        ShortCircuitType.SINGLE_PHASE_GROUND,
        ShortCircuitType.TWO_PHASE_GROUND,
    }:
        z0 = require_z0_bus(
            f"Z0 bus matrix is required for {short_circuit_type.value} fault computation"
        )
    z_equiv = impedancja_petli_zwarcia(short_circuit_type, z1=z1, z2=z2, z0=z0)
    if abs(z_equiv) == 0:
        raise ZeroDivisionError("Equivalent impedance is zero; cannot compute Ik''")
    if z_f is None:
        return ShortCircuitCoreResult(z_equiv=z_equiv, z1=z1, z2=z2, z0=z0)
    z_equiv_f = impedancja_petli_zwarcia(short_circuit_type, z1=z1, z2=z2, z0=z0, z_f=z_f)
    return ShortCircuitCoreResult(
        z_equiv=z_equiv_f, z1=z1, z2=z2, z0=z0, z_f=z_f, z_equiv_metaliczne=z_equiv
    )


def impedancja_petli_zwarcia(
    short_circuit_type: ShortCircuitType,
    *,
    z1: complex,
    z2: complex,
    z0: complex | None,
    z_f: complex | None = None,
) -> complex:
    """Impedancja zastępcza pętli zwarcia z impedancji składowych w węźle zwarcia [Ω].

    JEDNO źródło wzorów pętli dla zwarcia metalicznego (`z_f=None`) i przez impedancję
    przejścia (karta OD-14); wzory w docstringu `compute_equivalent_impedance`. Bez Z_f
    wyrażenia są identyczne z dawnymi gałęziami funkcji wołającej (ta sama kolejność
    działań — wynik bit w bit).
    """
    if short_circuit_type == ShortCircuitType.THREE_PHASE:
        return z1 if z_f is None else z1 + z_f
    if short_circuit_type == ShortCircuitType.TWO_PHASE:
        return z1 + z2 if z_f is None else z1 + z2 + z_f
    if short_circuit_type in {
        ShortCircuitType.SINGLE_PHASE_GROUND,
        ShortCircuitType.TWO_PHASE_GROUND,
    }:
        if z0 is None:
            raise ValueError(f"Z0 is required for {short_circuit_type.value} fault computation")
        z0_toru = z0 if z_f is None else z0 + 3.0 * z_f
        if short_circuit_type == ShortCircuitType.SINGLE_PHASE_GROUND:
            return z1 + z2 + z0_toru
        denominator = z2 + z0_toru
        if abs(denominator) == 0:
            raise ZeroDivisionError("Z2 + Z0 is zero; cannot compute Ik''")
        return z1 + (z2 * z0_toru) / denominator
    raise ValueError(f"Unsupported short-circuit type: {short_circuit_type}")


def compute_ikss(
    *,
    un_v: float,
    c_factor: float,
    short_circuit_type: ShortCircuitType,
    z_equiv: complex,
) -> float:
    voltage_factor = voltage_factor_for_fault(short_circuit_type)
    return (c_factor * un_v * voltage_factor) / modul_zespolony(z_equiv)


def _thermal_mn_factors(kappa: float, tk_s: float, f_hz: float = 50.0) -> tuple[float, float]:
    """Wspolczynniki cieplne m (skladowa DC) i n (skladowa AC) — IEC 60909-0 §4.7/§12.

    I_th = I_k'' * sqrt(m + n) (norma; patrz rowniez
    docs/proof/NORMATIVE_COMPLETION_PACK_IEC_60909.md §4.7 i
    docs/proof_engine/EQUATIONS_IEC60909_SC3F.md EQ_SC3F_008 — TA SAMA formula
    jest juz udokumentowana jako wiazaca i uzyta w proof_generator.py dla
    SC1/SC3F, ale do audytu fizyki fala G (2026-07) NIE byla uzyta tutaj — ten
    rdzenny solver liczyl ith_a = ikss*sqrt(tk_s), co jest niezgodne
    wymiarowo (sqrt(tk_s) ma jednostke sqrt(s), nie jest bezwymiarowe) i
    fizycznie (Ith rosloby bez ograniczen z czasem trwania zwarcia zamiast
    pozostac ograniczone w poblizu Ikss).

    m — postac zamknieta (norma, powszechnie cytowana rowniez w publicznych
    przewodnikach inzynierskich IEC 60909, NIE tablica wspolczynnikow objeta
    prawem autorskim — jak juz istniejaca formula kappa w tym samym module):
        m = 1/(2*f*tk*ln(kappa-1)) * (exp(4*f*tk*ln(kappa-1)) - 1),  kappa > 1
    kappa<=1 (brak skladowej DC, tj. R/X->inf) -> m=0.

    n — skladowa okresowa (AC decay). n=1 dla zwarc DALEKO OD GENERATORA
    (brak zaniku skladowej okresowej). Dla zwarc BLISKO GENERATORA norma daje
    n<1 z krzywej n(I_k''/I_k, T_k), gdzie I_k to prad zwarciowy USTALONY
    maszyn (wspolczynniki lambda_max/lambda_min z reaktancji synchronicznej
    nasyconej x_d,sat i krotnosci napiecia wzbudzenia U_f,max/U_f,r). Model
    ENM i katalog maszyn NIE niosa tych danych, wiec I_k (a z nim n<1) nie
    jest wyznaczalny bez zgadywania. Rozstrzygniecie karty SC-IB-ITH-ZRODLA
    (B-01 (n)): n = 1 stale — to GORNE oszacowanie I_th (I_k <= I_k'' daje
    n <= 1), wiec kryterium cieplne pozostaje po bezpiecznej stronie; wynik
    niesie n_factor = 1 jawnie (slad Ith, dowod EQ_SC3F_008).
    """
    if tk_s <= 0.0:
        return 0.0, 1.0
    if kappa <= 1.0:
        return 0.0, 1.0
    ln_term = math.log(kappa - 1.0)
    if abs(ln_term) < 1e-9:
        # kappa -> 2.0 (R/X -> 0): ln_term -> 0, formula ma usuwalna osobliwosc
        # 0/0. Granica (regula de l'Hopitala / rozwiniecie Taylora pierwszego
        # rzedu wzgledem ln_term): m -> 2.0. Zweryfikowane numerycznie
        # (kappa=1.999999 -> m=1.99980...).
        return 2.0, 1.0
    denom = 2.0 * f_hz * tk_s * ln_term
    exponent = 4.0 * f_hz * tk_s * ln_term
    if exponent < -700:
        m = -1.0 / denom
    elif exponent > 700:
        m = math.inf
    else:
        m = (math.exp(exponent) - 1.0) / denom
    return max(m, 0.0), 1.0


def compute_post_fault_quantities(
    *,
    ikss: float,
    un_v: float,
    z_equiv: complex,
    tk_s: float,
) -> ShortCircuitPostProcessResult:
    """κ, i_p, I_th = I_k''·√(m + n) i S_k'' z I_k'' oraz R/X impedancji pętli zwarcia.

    JEDNO źródło prądu cieplnego zastępczego I_th w programie (karta SC-IB-ITH-ZRODLA):
    rdzeń IEC 60909, wielkości zwarć niesymetrycznych (`short_circuit_asymmetrical_
    quantities`) i podgląd źródła sieciowego wołają tę funkcję, nikt nie składa I_th sam.
    """
    if z_equiv.imag == 0:
        rx_ratio = math.inf
    else:
        rx_ratio = z_equiv.real / z_equiv.imag
    exp_arg = -3.0 * rx_ratio
    if exp_arg > 700:
        kappa = 2.0
    elif exp_arg < -700:
        kappa = 1.02
    else:
        kappa = 1.02 + 0.98 * math.exp(exp_arg)
    ip_a = kappa * math.sqrt(2.0) * ikss
    m_factor, n_factor = _thermal_mn_factors(kappa, tk_s)
    ith_a = ikss * math.sqrt(m_factor + n_factor)
    sk_mva = (math.sqrt(3.0) * un_v * ikss) / 1_000_000.0

    return ShortCircuitPostProcessResult(
        rx_ratio=rx_ratio,
        kappa=kappa,
        ip_a=ip_a,
        ith_a=ith_a,
        sk_mva=sk_mva,
        m_factor=m_factor,
        n_factor=n_factor,
    )


@dataclass(frozen=True)
class SkladowaNieokresowa:
    """Składowa nieokresowa prądu zwarciowego w chwili t_b (IEC 60909-0:2016, rozdz. 10).

    ``wykladnik`` = ω·t_b·R/X, ``wspolczynnik_zaniku`` = e^(−ω·t_b·R/X),
    ``i_dc_a`` = √2·I_k''·e^(−ω·t_b·R/X) [A]. Wartości pośrednie są w wyniku, żeby ślad,
    dowód i ekran pokazywały TO SAMO podstawienie, którym solver policzył liczbę.
    """

    tb_s: float
    ikss_a: float
    rx_ratio: float
    wykladnik: float
    wspolczynnik_zaniku: float
    i_dc_a: float


def skladowa_nieokresowa(*, ikss_a: float, rx_ratio: float, tb_s: float) -> SkladowaNieokresowa:
    """i_DC(t_b) = √2·I_k''·e^(−2π·f·t_b·R/X) — IEC 60909-0:2016, rozdz. 10, f = 50 Hz.

    ``ikss_a`` to prąd początkowy części sieci niosącej składową nieokresową (sieć zasilająca
    i maszyny wirujące — źródła przekształtnikowe są w IEC 60909-0 źródłami prądowymi bez
    składowej nieokresowej). ``rx_ratio`` to R/X impedancji pętli zwarcia — TEN SAM stosunek,
    z którego policzono κ: X = 0 daje R/X = ∞ i zerową składową, R = 0 — brak zaniku.
    """
    if tb_s <= 0.0:
        raise ValueError("tb_s must be > 0")
    wykladnik = OMEGA_50HZ * tb_s * rx_ratio
    wspolczynnik = 0.0 if wykladnik > 700.0 else math.exp(-wykladnik)
    return SkladowaNieokresowa(
        tb_s=tb_s,
        ikss_a=ikss_a,
        rx_ratio=rx_ratio,
        wykladnik=wykladnik,
        wspolczynnik_zaniku=wspolczynnik,
        i_dc_a=math.sqrt(2.0) * ikss_a * wspolczynnik,
    )


@dataclass(frozen=True)
class ZanikPraduMaszyny:
    """Wkład jednej maszyny wirującej do różnicy I_k'' − I_b (IEC 60909-0:2016, rozdz. 9).

    ``ikss_czesciowy_a`` — prąd początkowy maszyny odniesiony do miejsca zwarcia [A];
    ``mu``, ``q`` — współczynniki zaniku składowej okresowej przy t_min = t_b (q = 1 dla
    maszyny synchronicznej); ``delta_u_wzgledne`` — ΔU''/(c·U_n/√3), spadek napięcia na
    reaktancji podprzejściowej maszyny odniesiony do napięcia źródła zastępczego.
    """

    ikss_czesciowy_a: float
    mu: float
    q: float
    delta_u_wzgledne: float

    @property
    def ubytek_a(self) -> float:
        """ΔU''/(c·U_n/√3) · (1 − μ·q) · I_k,m'' [A] — składnik odejmowany od I_k''."""
        return self.delta_u_wzgledne * (1.0 - self.mu * self.q) * self.ikss_czesciowy_a


def prad_wylaczeniowy_symetryczny_a(
    *, ikss_a: float, zaniki: tuple[ZanikPraduMaszyny, ...] = ()
) -> float:
    """Symetryczny prąd wyłączeniowy I_b — JEDYNA definicja w programie (IEC 60909-0:2016,
    rozdz. 9).

    I_b = I_k'' − Σ_m ΔU''_m/(c·U_n/√3) · (1 − μ_m·q_m) · I_k,m''.

    Bez maszyn wirujących (zwarcie odległe od generatora, także z udziałem źródeł
    przekształtnikowych, które są źródłami prądowymi bez zaniku) I_b = I_k''. Dla maszyny
    na zaciskach zwarcia ΔU''/(c·U_n/√3) = 1 i wzór redukuje się do I_b = μ·q·I_k,m''
    zwarcia zasilanego jednostronnie. Zwarcia niesymetryczne: I_b = I_k'' (norma nie
    uwzględnia zaniku strumienia maszyn) — wołający podaje ``zaniki=()``.
    """
    return ikss_a - sum(zanik.ubytek_a for zanik in zaniki)
