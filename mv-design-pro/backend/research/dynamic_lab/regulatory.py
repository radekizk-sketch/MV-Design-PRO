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

OGRANICZNIK STANU: DWA MECHANIZMY, ROZDZIELONE
----------------------------------------------
Poprzednia wersja miała JEDEN mechanizm — zerowanie pochodnej, gdy stan jest już
na granicy lub poza nią — i nazywała go ogranicznikiem. Przy skończonym kroku to
NIE gwarantuje ``x_min <= x_n <= x_max``. Zmierzone na wartościach z audytu
(``x = 4,0``; ``cel = 5,0``; ``T = 0,05``; ``dt = 0,10``): pochodna wynosi
``20,0`` p.u./s, a Euler jawny daje ``x_next = 6,000000`` przy suficie ``5,0`` —
przekroczenie o ``+1,0`` p.u., czyli 20 % ponad sufit wzbudnicy. Dla governora
przy ``omega = 0,95`` i ``dt = 0,50`` Euler jawny dawał ``Pm = 1,800`` przy
``p_max = 1,2`` (``+0,6`` p.u., 50 % ponad limit).

Teraz są dwa mechanizmy o rozdzielonych rolach:

1. **Ograniczenie ŻĄDANIA** (tutaj, w pochodnej). Regulator nie potrafi zażądać
   wartości spoza swojego zakresu — to własność fizyczna urządzenia. Skutek
   matematyczny: ``f`` jest afiniczna i ciągła, a przedział ``[dol, gora]`` jest
   zbiorem NIEZMIENNICZYM dokładnego przepływu ``T*dx/dt = cel - x``, bo
   rozwiązanie jest kontrakcją do ``cel`` należącego do tego przedziału.

2. **Niezmiennik DYSKRETNY** (``calkowanie.IntegratorZNiezmiennikami``).
   Ponieważ przedział jest niezmienniczy dla przepływu ścisłego, wyjście poza
   niego jest wyłącznie artefaktem dyskretyzacji; rzutowanie przyjętego stanu
   odtwarza własność rozwiązania ścisłego i jest ZAPISYWANE (``DziennikRzutowan``).
   Granice do tego rzutowania deklaruje sam regulator — ``ogranicznik_stanu`` —
   więc nie ma drugiego miejsca, w którym te same liczby trzeba by powtórzyć.

DLACZEGO NIE ZOSTAŁ STAN NIEOGRANICZONY Z NASYCONYM WYJŚCIEM (opcja B). Wariant
„nieograniczony stan + ``y = sat(x)`` + sprzężenie anti-windup ``-K_aw*(x-sat(x))``"
jest matematycznie spójny, ale wprowadza pasożytniczy mod o stałej czasowej
``T/(1+K_aw)``. Zmierzone dla ``K_aw = 100``, ``T_a = 0,05``: integratory jawne
rozjeżdżają się już przy ``dt >= 0,005`` (błąd końcowy ``1,010`` p.u.), a mimo to
raportują wyjście W ZAKRESIE, bo ``sat`` maskuje rozjazd. Naruszenie zamieniałoby
się w cichy błąd. Opcja przyjęta (ograniczone żądanie + rzutowanie) trzymała
niezmiennik dla WSZYSTKICH czterech integratorów i wszystkich zbadanych kroków.

DLACZEGO NIE ZOSTAŁO SAMO RZUTOWANIE, BEZ OGRANICZENIA ŻĄDANIA (opcja A').
Wariant „żądanie nieograniczone + brak zerowania pochodnej + rzutowanie" jest
kuszący, bo odtwarzałby czas dobicia do sufitu typowy dla ogranicznika
non-windup. Zmierzony na UKŁADZIE SPRZĘŻONYM (SMIB 4. rzędu z AVR i governorem,
zwarcie ``x_f = 0,05`` p.u. przez 120 ms, wszystkie cztery integratory,
``dt = 0,005`` i ``0,001``):

* zbieżność jest — wbrew wcześniejszemu przypuszczeniu Newton NIE wpada w cykl
  graniczny, gdy zniknie nieciągłość; cykl brał się z niej, nie z wielkości
  predyktora;
* ale ``Efd`` sięga ``+115`` p.u. i ``-55`` p.u. przy suficie ``5,0`` p.u. we
  WSZYSTKICH ośmiu przebiegach, bo niezmiennik dyskretny nie jest (jeszcze)
  wpięty w ``silnik.SilnikRMS`` — integrator rejestru nie zna ograniczników
  urządzeń.

Wariant przyjęty daje w tym samym teście ``Efd`` w przedziale ``0,59…4,85`` p.u.
dla wszystkich ośmiu przebiegów, czyli trzyma się fizyki także BEZ wpięcia
niezmiennika. Opcja A' staje się sensowna dopiero wtedy, gdy zespół wytwórczy
przekaże integratorowi swoje ograniczniki (``ogranicznik_stanu``).

CENA MODELOWA, ŚWIADOMIE PRZYJĘTA. Przy ograniczonym żądaniu stan dochodzi do
granicy asymptotycznie, a nie w skończonym czasie. Dla governora
(``omega = 0,95``, ``T_g = 0,5``, ``p_max = 1,2``) ogranicznik non-windup siadał
na limicie po ``143,8`` ms; wariant przyjęty osiąga ``Pm = 1,19`` po ``1,50`` s,
czyli 11 razy wolniej. Ta sama konwencja obowiązywała już wcześniej w AVR
(``Efd = 4,9`` po ``184`` ms zamiast ``0,98`` ms). Alternatywą było zostawienie
governora bez ograniczenia żądania — czyli 50 % przekroczenia limitu mocy i
BRAK ZBIEŻNOŚCI metod niejawnych. Zamiana została wykonana świadomie i jest
przypięta testem; jej odwrócenie wymaga wpięcia niezmiennika w silnik.

ANTI-WINDUP. Utrzymany jest przez samo rzutowanie: stan nigdy nie „ładuje się"
poza ogranicznikiem, więc po ustaniu zakłócenia regulator schodzi z granicy
natychmiast, bez opóźnienia, którego w układzie rzeczywistym nie ma.
"""

from __future__ import annotations

from dataclasses import dataclass

from dynamic_lab.calkowanie import OgraniczenieStanu
from dynamic_lab.tozsamosc import pole_nastawa


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

    Anti-windup: stan nie może wyjść poza ogranicznik (niezmiennik dyskretny,
    patrz nagłówek modułu), więc nie ma czego „rozładowywać" po ustaniu
    zakłócenia — regulator schodzi z granicy natychmiast.

    Wejście pomiarowe ``v_t`` [p.u.] MUSI pochodzić z rozwiązania sieci.
    """

    k_a: float = 200.0
    t_a_s: float = 0.05
    efd_min: float = 0.0
    efd_max: float = 5.0
    v_ref_pu: float = pole_nastawa(
        default=1.0,
        powod=(
            "napięcie zadane wzbudnicy — wyliczane przez `ZespolSynchroniczny.inicjalizuj` z punktu pracy rozpływu, więc NIE jest definicją regulatora; wchodzi do tożsamości BIEGU jako nastawa punktu pracy, nie do tożsamości MODELU"
        ),
    )

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

        DLACZEGO NIE MA TU ZEROWANIA POCHODNEJ NA GRANICY. Poprzednia wersja
        kończyła się warunkiem ``if (efd >= efd_max and d > 0) or (efd <= efd_min
        and d < 0): return 0.0``. Ten warunek był MARTWY: skoro ``cel`` leży w
        ``[efd_min, efd_max]``, to dla ``efd >= efd_max`` zawsze ``d <= 0``, a dla
        ``efd <= efd_min`` zawsze ``d >= 0`` — żadna gałąź nie mogła się wykonać.
        Martwy warunek sugerował ochronę, której nie dawał (stan i tak przekraczał
        sufit przy ``dt > T_a`` — zmierzone ``6,0`` p.u. przy suficie ``5,0``),
        więc został zastąpiony niezmiennikiem dyskretnym, który tę ochronę realnie
        daje. Nieusunięcie go kosztowałoby też ciągłość ``f``: to właśnie taki
        warunek (bez ograniczenia żądania) czyni równanie niejawne nierozwiązywalnym
        — zmierzone na governorze, patrz `RegulatorTurbiny.pochodna`.
        Martwość jest przypięta testem ``test_zerowanie_pochodnej_bylo_martwe``.
        """
        cel = _ogranicz(self.k_a * (self.v_ref_pu - v_t_pu), self.efd_min, self.efd_max)
        return (cel - efd) / self.t_a_s

    def ogranicznik_stanu(self, indeks: int) -> OgraniczenieStanu:
        """Niezmiennik dyskretny stanu ``Efd`` dla integratora.

        ``indeks`` podaje wołający (zespół wytwórczy zna układ swojego wektora
        stanu), a granice i ich znaczenie — regulator, bo to jego parametry.
        """
        return OgraniczenieStanu(
            indeks=indeks,
            dol=self.efd_min,
            gora=self.efd_max,
            nazwa="efd_pu",
            znaczenie=(
                "zakres napięcia wzbudzenia wzbudnicy [p.u.]: sufit napięciowy "
                "wzbudnicy i jej dolna granica pracy"
            ),
        )

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

    Ogranicznik mocy działa NA ŻĄDANIE i przez niezmiennik dyskretny — tak samo
    jak w `RegulatorNapiecia`; uzasadnienie i pomiary w `pochodna`.
    """

    r_statyzm: float = 0.05
    t_g_s: float = 0.5
    p_min_pu: float = 0.0
    p_max_pu: float = 1.2
    p_ref_pu: float = pole_nastawa(
        default=0.8,
        powod=(
            "moc zadana turbiny — wyliczane przez `ZespolSynchroniczny.inicjalizuj` z punktu pracy rozpływu, więc NIE jest definicją regulatora; wchodzi do tożsamości BIEGU jako nastawa punktu pracy, nie do tożsamości MODELU"
        ),
    )

    def __post_init__(self) -> None:
        if self.t_g_s <= 0.0:
            raise ValueError("t_g_s musi być > 0")
        if self.r_statyzm <= 0.0:
            raise ValueError("r_statyzm musi być > 0")
        if self.p_min_pu > self.p_max_pu:
            raise ValueError("p_min_pu > p_max_pu")

    def pochodna(self, pm: float, omega_pu: float) -> float:
        """dPm/dt [p.u./s] przy zmierzonej prędkości ``omega_pu`` (1.0 = synchroniczna).

        OGRANICZENIE ŻĄDANIA — TA SAMA REGUŁA CO W `RegulatorNapiecia`. Wcześniej
        AVR ograniczał swoje żądanie, a governor NIE — ten sam mechanizm był
        naprawiony w jednej klasie i pominięty w drugiej. Skutki zmierzone dla
        ``omega = 0,95``, ``R = 0,05``, ``T_g = 0,5``, ``p_max = 1,2``:

        * żądanie ``cel = P_ref - (omega-1)/R = 1,800`` p.u. przy limicie ``1,2``;
        * Euler jawny przy ``dt = 0,50`` dawał ``Pm = 1,800`` (``+0,600`` ponad
          limit), przy ``dt = 0,20`` — ``Pm = 1,320`` (``+0,120``);
        * metody NIEJAWNE w ogóle nie zbiegały: przy nieograniczonym żądaniu i
          zerowaniu pochodnej na granicy równanie ``x1 = x0 + dt*f(x1)`` NIE MA
          ROZWIĄZANIA. Dla ``x0 = 1,0``, ``dt = 0,5``: gałąź „poniżej limitu" daje
          ``x1 = 1,4`` (sprzeczne z założeniem ``x1 < 1,2``), a gałąź „na limicie"
          daje ``x1 = 1,0`` (sprzeczne z ``x1 >= 1,2``). Newton kręcił 50 iteracji
          i kończył ``BrakZbieznosciIntegratoraError`` z residuum ``4,000e-01``.

        Ograniczenie żądania czyni ``f`` ciągłą i afiniczną — równanie niejawne
        zawsze ma rozwiązanie — a fizycznie mówi to, co mówi turbina: nie da się
        zażądać mocy spoza zakresu regulacyjnego. Zakres jest domykany
        niezmiennikiem dyskretnym (``ogranicznik_stanu``).
        """
        cel = _ogranicz(
            self.p_ref_pu - (omega_pu - 1.0) / self.r_statyzm, self.p_min_pu, self.p_max_pu
        )
        return (cel - pm) / self.t_g_s

    def ogranicznik_stanu(self, indeks: int) -> OgraniczenieStanu:
        """Niezmiennik dyskretny stanu ``Pm`` dla integratora."""
        return OgraniczenieStanu(
            indeks=indeks,
            dol=self.p_min_pu,
            gora=self.p_max_pu,
            nazwa="pm_pu",
            znaczenie=(
                "zakres regulacyjny mocy mechanicznej turbiny [p.u.]: moc minimalna "
                "techniczna i moc maksymalna osiągalna"
            ),
        )

    def stan_ustalony(self, pm_wymagane: float) -> tuple[float, float]:
        """Punkt pracy: zwraca ``(pm0, p_ref)`` zapewniające ``dPm/dt = 0`` przy omega=1."""
        pm0 = _ogranicz(pm_wymagane, self.p_min_pu, self.p_max_pu)
        return pm0, pm0
