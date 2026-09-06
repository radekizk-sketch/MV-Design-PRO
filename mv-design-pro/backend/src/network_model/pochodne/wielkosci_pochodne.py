"""Wielkości pochodne — jedno recenzowane miejsce dla formuł algebraicznych
wyprowadzających JEDNĄ wielkość znamionową z DRUGIEJ, poza rdzeniami solverów
(CV-4.3 K4, konstytucja C.2.3, karta ``karta_cv43_a3.md``).

Po co: inwentarz klasy (``scratchpad/inwentarz_cv43.md``, sekcja D) zmierzył
59 miejsc poza ``network_model/solvers/**``, które liczyły WŁASNYM wzorem
jedną z rodzin: √3 (napięcie fazowe, prąd znamionowy z mocy pozornej),
κ = 1,02 + 0,98·e^(−3R/X) (narracja podstawienia dowodu SC — WYŁĄCZNIE do
LaTeX, K4.2), I²t / całka Joule'a, R·(1 + α·(θ−20)) (korekta temperaturowa
IEC 60909-0), P/(√3·U·cosφ) i S = P/cosφ (moc/prąd znamionowy z cosφ),
Z = U²/S (impedancja/prąd bazowy) — do 6 kopii DOSŁOWNIE tej samej linii
(``u_phase_v = trafo.ulv_kv*1000.0/math.sqrt(3.0)``) w różnych plikach.

Każda funkcja tutaj jest URUCHAMIALNĄ, PRZETESTOWANĄ kopią JEDNEGO zmierzonego
oryginalnego wyrażenia — z DOKŁADNIE tą samą kolejnością działań zmienno-
przecinkowych (patrz test tożsamości w
``backend/tests/network_model/pochodne/test_wielkosci_pochodne.py``),
więc podmiana inline → wywołanie funkcji jest bit w bit identyczna z kodem
sprzed karty na wejściach z rejestru sieci i na wartościach brzegowych.

Reguły (K4.1/K4.5, wiążące):
- Moduł ADDYTYWNY: `git diff --stat` na ``network_model/solvers/**`` względem
  bazy karty jest PUSTY — pakiet nie leży pod ``solvers/`` w ogóle (relokacja
  architekta 2026-09-06, patrz niżej), więc drzewo rdzeni solverów zostaje
  dosłownie nietknięte, nie tylko "addytywnie rozszerzone". Import z
  ``pochodne/`` DO rdzeni solverów jest ZABRONIONY — rdzenie
  (``short_circuit_iec60909.py``, ``power_flow_newton.py``, ...) nie mogą
  zależeć od nowego kodu. Ten moduł importuje WYŁĄCZNIE ``math`` — jest
  liściem grafu importów, więc może być bezpiecznie importowany NA POZIOMIE
  MODUŁU z KAŻDEJ warstwy (domena, aplikacja, analiza, enm, api,
  infrastructure, a także ``network_model/core/**``) bez ryzyka cyklu.
- Dlaczego siostrzany katalog ``network_model/pochodne/``, a NIE
  ``network_model/solvers/pochodne/``: ``network_model/solvers/__init__.py``
  (FROZEN) gorliwie importuje WSZYSTKIE solvery, a solvery zależą od
  ``network_model.core.graph.NetworkGraph``. Gdyby ``pochodne/`` leżało pod
  ``solvers/``, import ``from network_model.solvers.pochodne import ...`` w
  dowolnym pliku ``network_model/core/*.py`` (importowanym W TRAKCIE
  inicjalizacji ``core/__init__.py``, PRZED pełnym zdefiniowaniem
  ``NetworkGraph``) uruchamiałby ``solvers/__init__.py`` i wpadał w cykl —
  jedynym obejściem byłby import odroczony do wnętrza funkcji (prowizorka,
  zakazana przez „Zasady inżynierskie" pkt 7). Jako SIOSTRA ``core/`` i
  ``solvers/`` (a nie potomek żadnego z nich), ``pochodne/`` nie zależy od
  ``core`` ani nie jest importowana przez ``network_model/__init__.py``
  (które importuje wyłącznie ``.core``) — więc jest prawdziwym liściem grafu
  importów i każda warstwa, WŁĄCZNIE z ``network_model/core/**``, importuje
  ją na poziomie modułu, bez odroczenia.
- Czyste funkcje: bez efektów ubocznych, bez odczytu I/O, bez znajomości
  domeny (Bus/Branch/ENM) — WYŁĄCZNIE liczby na wejściu i liczba na wyjściu.
  Walidacja/decyzja (guard ``if x <= 0``, wybór trybu, zaokrąglenie wyniku do
  wyświetlenia) zostaje u WOŁAJĄCEGO — tu jest wyłącznie sam wzór.
- Kryterium (porównanie ``x <= y`` dwóch JUŻ policzonych wielkości) NIE jest
  formułą i zostaje w analizie/aplikacji (K4.3) — np. ``equipment_proof/
  generator.py`` woła ``calka_joule_ka2s`` stąd, ale werdykt PASS/FAIL liczy
  sam (kryterialne porównanie, zgoda właściciela, Karta S-C 2026-07-22).
- Kilka funkcji poniżej liczy TĘ SAMĄ wielkość fizyczną (np. prąd znamionowy
  z mocy pozornej i napięcia) różnymi ścieżkami skalowania jednostek
  (×1000 vs ×1e6/×1e3) — to NIE jest przypadkowa duplikacja: to dwie
  NIEZALEŻNE sekwencje operacji zmiennoprzecinkowych zmierzone w oryginalnym
  kodzie w różnych plikach, a wymóg bit w bit (karta CV-4.3-A3) zabrania
  scalenia ich w jedną bez zmiany ostatniego bitu wyniku dla części wołających
  (mnożenie/dzielenie w IEEE 754 jest przemienne, ale NIE łączne — inna
  kolejność działań może dać inny wynik o 1 ULP). Docstring każdej takiej
  funkcji nazywa siostrzaną funkcję i różnicę.
"""

from __future__ import annotations

import math

#: √3 — stała trójfazowa IEC 60909 (napięcie międzyprzewodowe ↔ fazowe, moc
#: pozorna ↔ prąd). Eksportowana dla narracji podstawienia dowodu (K4.2) —
#: `application/proof_engine/proof_generator.py` potrzebuje WARTOŚCI do
#: wyrenderowania kroku LaTeX (Result i tak pochodzi ze śladu solvera).
SQRT3: float = math.sqrt(3.0)

#: √2 — stała szczytowa (i_p = κ·√2·I_k''). Jak wyżej: WYŁĄCZNIE narracja.
SQRT2: float = math.sqrt(2.0)


# =============================================================================
# Rodzina A — napięcie fazowe i prąd z mocy pozornej/zwarciowej (√3)
# =============================================================================


def napiecie_fazowe_v(napiecie_miedzyprzewodowe_v: float) -> float:
    """Napięcie fazowe z międzyprzewodowego: U_f = U_LL / √3 (dowolna spójna
    jednostka napięcia — wołający skaluje ARGUMENT, nie wynik, żeby zachować
    kolejność działań oryginału, np. ``napiecie_fazowe_v(ulv_kv * 1000.0)``).

    Było 6 kopii DOSŁOWNIE tej samej linii (D.9 inwentarza CV-4.3):
    ``u_phase_v = trafo.ulv_kv * 1000.0 / math.sqrt(3.0)`` w
    ``lv_circuit_verification_binding.py``, ``nn_device_selection.py``,
    ``fault_loop/service.py`` (×3), ``swz/service.py`` — plus warianty w
    ``domain/dobor_przekladnika.py`` i ``enm/canonical_analysis.py``.
    """
    return napiecie_miedzyprzewodowe_v / SQRT3


def prad_z_mocy_pozornej_ka(moc_pozorna_mva: float, napiecie_miedzyprzewodowe_kv: float) -> float:
    """Prąd z mocy pozornej: I = S / (√3·U), S[MVA], U[kV] → I[kA].

    Ta sama formuła algebraiczna liczy zarówno prąd roboczy z mocy pozornej
    (``proof_generator.py``, ``domain/units.py::i_base_ka``) jak i prąd
    zwarciowy z mocy zwarciowej Ik'' = Sk''/(√3·Un) (``mv_source_catalog.py``,
    ``enm/validator.py``) — to DOKŁADNIE ta sama para wielkości S i U, tylko
    inne fizyczne pochodzenie S. Siostrzane funkcje dla INNEGO skalowania
    jednostek (bit w bit RÓŻNE ścieżki zmiennoprzecinkowe): ``prad_roboczy_a``
    (×1000, wynik w A) i ``prad_znamionowy_a`` (×1e6/×1e3, wynik w A).
    """
    return moc_pozorna_mva / (SQRT3 * napiecie_miedzyprzewodowe_kv)


def prad_roboczy_a(moc_pozorna_mva: float, napiecie_miedzyprzewodowe_kv: float) -> float:
    """Prąd roboczy z mocy pozornej: I = S·1000/(√3·U), S[MVA], U[kV] → I[A].

    Wariant skalowania jednostek DOSŁOWNIE zmierzony w
    ``application/analyses/nn_circuit_sheet.py::_ib_z_tabliczki`` (komentarz
    ARKUSZ-NN: "Ib = S/(√3·U_LL)") i
    ``application/analyses/protection/base_values/resolver.py`` (komentarz:
    "Sn [MVA], Un [kV] → In [kA], więc ×1000 dla [A]"). Patrz
    ``prad_z_mocy_pozornej_ka`` dla wariantu bez ×1000 (wynik w kA) i
    ``prad_znamionowy_a`` dla wariantu ×1e6/×1e3 — trzy formuły matematycznie
    równoważne, ale NIE bit-identyczne między sobą (inna kolejność
    zaokrągleń), więc zostają trzema osobnymi funkcjami.
    """
    return moc_pozorna_mva * 1000.0 / (SQRT3 * napiecie_miedzyprzewodowe_kv)


def prad_znamionowy_a(moc_pozorna_mva: float, napiecie_miedzyprzewodowe_kv: float) -> float:
    """Prąd znamionowy z mocy pozornej: I = S·1e6/(√3·U·1e3), S[MVA], U[kV] →
    I[A] (S→VA przez ×1e6, U→V przez ×1e3, osobno — inna ścieżka
    zmiennoprzecinkowa niż ``prad_roboczy_a``'s ×1000 zbiorcze).

    Współdzielona przez: prąd znamionowy maszyny synchronicznej/asynchronicznej
    IEC 60909-0 §6.3/§6.7 (``network_model/core/machine.py::ir_a``), prąd
    znamionowy z tabliczki DER (``enm/der_sn_validation.py::rated_current_a``),
    prąd znamionowy generatora pełnoprzekształtnikowego
    (``enm/mapping.py``) i prąd zwarciowy Ik''=Sk''/(√3·Un) w amperach dla
    eksportu CGMES (``infrastructure/cgmes/cgmes_exporter.py::_ik_from_sk`` —
    ta sama formuła algebraiczna z inną fizyczną etykietą S, bit-identyczna
    kolejność działań zweryfikowana testem tożsamości).
    """
    return moc_pozorna_mva * 1.0e6 / (SQRT3 * napiecie_miedzyprzewodowe_kv * 1.0e3)


def prad_znamionowy_z_mocy_czynnej_a(
    moc_czynna_w: float, napiecie_miedzyprzewodowe_v: float, cos_phi: float
) -> float:
    """Prąd znamionowy z mocy czynnej: In = P/(√3·U·cosφ), P[W], U[V] → I[A]
    (rodzina F karty CV-4.3-A3 — kombinacja √3 i cosφ w jednym mianowniku).

    Zmierzone w ``network_model/core/generator.py::GeneratorSN.
    get_rated_current_a`` (jedyne miejsce z tą DOKŁADNĄ postacią poza
    solverami — sprawdzone grepem na całym ``backend/src``).
    """
    return moc_czynna_w / (SQRT3 * napiecie_miedzyprzewodowe_v * cos_phi)


def moc_zwarciowa_z_pradu_mva(napiecie_v: float, prad_a: float) -> float:
    """Moc zwarciowa z prądu: Sk'' = √3·U·I / 1e6, U[V], I[A] → S[MVA]
    (odwrotność ``prad_z_mocy_pozornej_ka``/``prad_znamionowy_a`` — tu
    wyprowadzamy S z U i I, nie I z S i U).

    Zmierzone w ``application/analyses/lv_domain/upstream_equivalent.py``
    (rekonstrukcja mocy zwarciowej górnego poziomu z prądu Ikss policzonego
    przez solver, do celów sprawozdawczych — sam Ikss pochodzi ze śladu SC).
    """
    return (SQRT3 * napiecie_v * prad_a) / 1_000_000.0


def impedancja_z_napiecia_i_pradu_ohm(napiecie_v: float, prad_a: float) -> float:
    """Impedancja z napięcia międzyprzewodowego i prądu: Z = U/(√3·I), U[V],
    I[A] → Z[Ω] (napięcie fazowe podzielone przez prąd — Ohm na fazę).

    Zmierzone w ``network_model/core/machine.py::AsynchronousMachineSource.
    z_abs_ohm`` jako część |Z_M| = (1/(I_LR/I_rM))·(U_rM/(√3·I_rM)) — ten
    czynnik jest WEWNĘTRZNYM podwyrażeniem (U_rM·1e3)/(√3·I_rM); mnożnik
    zewnętrzny (1/i_lr_ratio) zostaje u wołającego, żeby zachować dokładną
    kolejność działań oryginału.
    """
    return napiecie_v / (SQRT3 * prad_a)


# =============================================================================
# Rodzina B — narracja podstawienia κ (WYŁĄCZNIE do LaTeX dowodu SC, K4.2)
# =============================================================================


def czlon_wykladniczy_kappa(stosunek_r_x: float) -> float:
    """Człon wykładniczy współczynnika udaru κ: e^(−3·R/X).

    UWAGA (K4.2): κ SAMO liczy WYŁĄCZNIE solver FROZEN
    (``network_model/solvers/short_circuit_iec60909.py``) — ta funkcja
    istnieje TYLKO po to, żeby Proof Engine pokazał liczbowe podstawienie w
    LaTeX kroku dowodu (``\\kappa = 1.02 + 0.98 · e^{-3·R/X} = ...``); wynik
    kroku (``ProofValue``) zawsze bierze κ z PARAMETRU (wynik solvera), nigdy
    z tej funkcji. Luka śladu solvera (brak `exp_term` w White Box) zgłoszona
    w meldunku karty jako B-01.
    """
    return math.exp(-3 * stosunek_r_x)


def wspolczynnik_kappa(stosunek_r_x: float) -> float:
    """Współczynnik udaru IEC 60909: κ = 1,02 + 0,98·e^(−3·R/X).

    Formuła kanoniczna (IEC 60909-0:2016 §4.3.1.1), referencyjna — jedyna
    implementacja κ poza solverem powinna istnieć TUTAJ; solver liczy κ we
    własnym torze (frozen), a ta funkcja służy WYŁĄCZNIE narracji podstawienia
    dowodu (patrz ``czlon_wykladniczy_kappa``), nigdy jako zamiennik wyniku
    solvera.
    """
    return 1.02 + 0.98 * czlon_wykladniczy_kappa(stosunek_r_x)


# =============================================================================
# Rodzina C — całka Joule'a I²t
# =============================================================================


def calka_joule_ka2s(prad_ka: float, czas_s: float) -> float:
    """Całka Joule'a (prąd zastępczy cieplny): I²t = I²·t, I[kA], t[s] →
    [kA²s] (IEC 60909-0 §12 — definicja prądu zastępczego cieplnego I_th).

    Formuła BEZ kryterium: porównanie ``wymagane <= dostępne`` zostaje u
    wołającego (K4.3 — ``application/equipment_proof/generator.py`` liczy
    werdykt PASS/FAIL z DWÓCH wywołań tej funkcji, zgoda właściciela Karta
    S-C 2026-07-22).
    """
    return prad_ka**2 * czas_s


# =============================================================================
# Rodzina D — korekta temperaturowa rezystancji (IEC 60909-0)
# =============================================================================


def rezystancja_w_temperaturze(
    rezystancja_w_20c_ohm: float,
    wspolczynnik_alpha: float,
    temperatura_c: float,
    temperatura_odniesienia_c: float = 20.0,
) -> float:
    """Korekta temperaturowa rezystancji IEC 60909-0: R_θ = R20·[1 + α·(θ−20)].

    Karta P0.3 (``application/solvers/lv_temperature_correction.py``,
    scenariusz SHORT_CIRCUIT_MIN) — dekoruje WEJŚCIE solvera (kopiuje gałąź
    z poprawionym R przed przekazaniem do FROZEN IEC 60909), nie jest
    solverem. α domyślnie 0,004 [1/°C] dla miedzi/aluminium (stała u
    wołającego, nie tutaj — formuła jest ogólna).
    """
    return rezystancja_w_20c_ohm * (
        1.0 + wspolczynnik_alpha * (temperatura_c - temperatura_odniesienia_c)
    )


# =============================================================================
# Rodzina E — moc pozorna/bierna z mocy czynnej i cosφ
# =============================================================================


def moc_pozorna_z_czynnej_mva(moc_czynna_mw: float, cos_phi: float) -> float:
    """Moc pozorna z czynnej i cosφ: S = P/cosφ (tabliczka znamionowa, nie
    fizyka pola — przybliżenie P≈S·cosφ używane przy materializacji katalogu,
    walidacji DER i doborze przyłącza; kryterium ``cos_phi > 0`` zostaje u
    wołającego).
    """
    return moc_czynna_mw / cos_phi


def tan_phi_z_cos_phi(cos_phi: float) -> float:
    """tanφ z cosφ: tanφ = tan(acos(cosφ)) — nastawa mocy biernej z zadanego
    współczynnika mocy (polecenie OSD, tabliczka znamionowa katalogu).
    """
    return math.tan(math.acos(cos_phi))


def moc_bierna_z_czynnej_i_cos_phi(moc_czynna_mw: float, cos_phi: float) -> float:
    """Moc bierna z czynnej i cosφ: Q = P·tan(acos(cosφ)) (tabliczka
    znamionowa katalogu — uzupełnienie Q, gdy katalog niesie WYŁĄCZNIE P i
    cosφ znamionowy).

    Zmierzone w ``enm/catalog_completion.py``, ``enm/domain_operations_v2.py
    ::add_nn_load`` i ``enm/domain_operations.py`` (potrzeby własne stacji —
    ta sama formuła, dwa niezależne dyspozytory V1/V2).
    """
    return moc_czynna_mw * tan_phi_z_cos_phi(cos_phi)


# =============================================================================
# Rodzina G — impedancja/moc bazowa Z = U²/S
# =============================================================================


def impedancja_z_napiecia_i_mocy_ohm(napiecie_kv: float, moc_mva: float) -> float:
    """Impedancja z napięcia i mocy: Z = U²/S, U[kV], S[MVA] → Z[Ω].

    Formuła bazy per-unit (Zbase = U²/Sbase, ``network_model/core/ybus.py``,
    ``domain/units.py``, ``enm/zero_sequence_transformer.py``) i formuła
    impedancji zastępczej źródła sieciowego z mocy zwarciowej
    (Z = U²/Sk'', ``enm/mapping.py``) — TA SAMA formuła algebraiczna,
    inna fizyczna etykieta S.
    """
    return napiecie_kv**2 / moc_mva
