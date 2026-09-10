"""Regulatory: AVR i governor — pętle ZAMKNIĘTE, z ogranicznikami i anti-windup.

KOD BADAWCZY — patrz `backend/research/README.md`.

Defekt P0-05 audytu: w produkcyjnym silniku governor czytał prędkość z
``parameters.get("omega_input_pu", 0.0)`` — czyli ze SŁOWNIKA STAŁYCH, a nie ze
stanu maszyny; AVR liczył ``Efd``, którego maszyna nigdy nie konsumowała.
Regulatory obliczały stany, na które nikt nie patrzył: PSS nie mógł tłumić,
AVR nie mógł wzbudzać.

Odpowiedź projektowa w laboratorium: **domknięcie strukturalne, nie umowne.**
Regulator jest częścią zespołu wytwórczego (``ZespolSynchroniczny``), a jego
wejście pomiarowe jest argumentem funkcji pochodnych — nie da się go „zapomnieć
podpiąć", bo bez niego kod się nie wykona.

Każdy regulator deklaruje jawnie:
- swój wektor stanu i jego znaczenie,
- równanie, które implementuje,
- ograniczniki i sposób obsługi nasycenia (anti-windup),
- jednostki wejść i wyjść.
"""

from __future__ import annotations

from dataclasses import dataclass


def _ogranicz(wartosc: float, dol: float, gora: float) -> float:
    return max(dol, min(gora, wartosc))


@dataclass(frozen=True)
class RegulatorNapiecia:
    """Wzbudnica/AVR pierwszego rzędu z ogranicznikiem i anti-windup.

    Implementowane równanie (JEDEN stan — i tak jest nazwany):

        T_a * dEfd/dt = K_a * (V_ref - V_t) - Efd
        Efd ograniczone do [efd_min, efd_max]

    To NIE jest pełny IEEE Type-1 (ten ma człon nasycenia wzbudnicy i sprzężenie
    stabilizujące, czyli 3–4 stany). Nazwa mówi, co jest zaimplementowane —
    świadomie, bo zawyżanie nazwą było defektem P0-03 audytu.

    Anti-windup: gdy wyjście jest na ograniczniku, a pochodna spycha je dalej
    poza zakres, pochodna jest zerowana. Bez tego stan „ładuje się" poza
    ogranicznikiem i po ustaniu zakłócenia regulator reaguje z opóźnieniem,
    którego w rzeczywistym układzie nie ma.

    Wejście pomiarowe ``v_t`` [p.u.] MUSI pochodzić z rozwiązania sieci.
    """

    k_a: float = 200.0
    t_a_s: float = 0.05
    efd_min: float = 0.0
    efd_max: float = 5.0
    v_ref_pu: float = 1.0

    def __post_init__(self) -> None:
        if self.t_a_s <= 0.0:
            raise ValueError("t_a_s musi być > 0")
        if self.efd_min > self.efd_max:
            raise ValueError("efd_min > efd_max")

    def pochodna(self, efd: float, v_t_pu: float) -> float:
        """dEfd/dt [p.u./s] przy zmierzonym napięciu zaciskowym ``v_t_pu``.

        OGRANICZNIK DZIAŁA NA ŻĄDANIE, NIE TYLKO NA POCHODNĄ — to jest istotne
        i fizycznie, i numerycznie.

        Fizycznie: wzbudnica ma sufit napięciowy, więc nie potrafi ZAŻĄDAĆ
        wartości spoza swojego zakresu.

        Numerycznie (zmierzone): bez ograniczenia żądania, przy głębokim zapadzie
        napięcia człon ``K_a*(V_ref - V_t)`` sięga tu ~88 p.u., co daje
        ``dEfd/dt ~ 4400 p.u./s``. Predyktor kroku niejawnego (``x + dt*f``)
        wyrzuca wtedy stan na ~22 p.u. przy suficie 5 p.u. — w obszar
        niefizyczny, w którym anti-windup jest nieciągły i Newton wpada w cykl
        graniczny. Objawem był brak zbieżności Eulera wstecznego dokładnie w
        chwili zwarcia. Ograniczenie żądania bounduje pochodną do
        ``(efd_max - efd)/T_a`` i usuwa przyczynę.
        """
        cel = _ogranicz(self.k_a * (self.v_ref_pu - v_t_pu), self.efd_min, self.efd_max)
        d = (cel - efd) / self.t_a_s
        if (efd >= self.efd_max and d > 0.0) or (efd <= self.efd_min and d < 0.0):
            return 0.0
        return d

    def stan_ustalony(self, efd_wymagane: float, v_t_pu: float) -> tuple[float, float]:
        """Punkt pracy: zwraca ``(efd0, v_ref)`` zapewniające równowagę.

        Inicjalizacja idzie ODWROTNIE niż symulacja: znamy ``Efd`` wymagane przez
        maszynę w punkcie rozpływu i dobieramy ``V_ref`` tak, by ``dEfd/dt = 0``.
        To jest właściwy kierunek — narzucenie ``V_ref`` i liczenie ``Efd`` dałoby
        punkt startowy poza równowagą (defekt P0-04).
        """
        efd0 = _ogranicz(efd_wymagane, self.efd_min, self.efd_max)
        v_ref = v_t_pu + efd0 / self.k_a
        return efd0, v_ref


@dataclass(frozen=True)
class RegulatorTurbiny:
    """Governor pierwszego rzędu ze statyzmem i ogranicznikiem mocy.

    Implementowane równanie (JEDEN stan):

        T_g * dPm/dt = P_ref - (omega - 1) / R - Pm
        Pm ograniczone do [p_min, p_max]

    To NIE jest TGOV1 (ten ma dodatkowo stałą czasową przelotu pary/objętości i
    człon ``Dt``). Nazwa odpowiada zawartości.

    ``R`` to statyzm w p.u. (0.05 = 5%): przyrost częstotliwości o 5% znamionowej
    redukuje moc o 100% znamionowej. Wejście ``omega`` MUSI pochodzić ze stanu
    maszyny.
    """

    r_statyzm: float = 0.05
    t_g_s: float = 0.5
    p_min_pu: float = 0.0
    p_max_pu: float = 1.2
    p_ref_pu: float = 0.8

    def __post_init__(self) -> None:
        if self.t_g_s <= 0.0:
            raise ValueError("t_g_s musi być > 0")
        if self.r_statyzm <= 0.0:
            raise ValueError("r_statyzm musi być > 0")
        if self.p_min_pu > self.p_max_pu:
            raise ValueError("p_min_pu > p_max_pu")

    def pochodna(self, pm: float, omega_pu: float) -> float:
        """dPm/dt [p.u./s] przy zmierzonej prędkości ``omega_pu`` (1.0 = synchroniczna)."""
        cel = self.p_ref_pu - (omega_pu - 1.0) / self.r_statyzm
        d = (cel - pm) / self.t_g_s
        if (pm >= self.p_max_pu and d > 0.0) or (pm <= self.p_min_pu and d < 0.0):
            return 0.0
        return d

    def stan_ustalony(self, pm_wymagane: float) -> tuple[float, float]:
        """Punkt pracy: zwraca ``(pm0, p_ref)`` zapewniające ``dPm/dt = 0`` przy omega=1."""
        pm0 = _ogranicz(pm_wymagane, self.p_min_pu, self.p_max_pu)
        return pm0, pm0
