"""Jednostki — jedno recenzowane miejsce dla skalowania prefiksów SI (k/M/µ)
poza rdzeniami solverów, poza wzorami fizycznymi wielkości pochodnych
(karta W3-F, mapa §8 W3, `docs/plan/KARTA_W3_KONWERGENCJA_FIZYKI_2026-09.md`
§0.13/§0.14, decyzje architekta §0).

Po co: inwentarz klasy (`scratchpad/w3f_inwentarz_surowy.txt`, meldunek karty
§1) zmierzył ~200 miejsc `*1000`/`/1000` (+ `1e3`, `1e-6`, `1e6`, `1_000_000`)
poza `network_model/solvers/**` i `network_model/pochodne/**`, rozsianych po
66 plikach ośmiu warstw — każde to niejawna konwersja jednostki (kW↔MW,
A↔kA, V↔kV, m↔km, ms↔s, µS↔S) bez nazwy własnej, czyli miejsce, w którym
błąd jednostki (pomylony kierunek, pomylony rząd wielkości) jest niewidoczny
dla recenzenta kodu.

Każda funkcja tutaj jest URUCHAMIALNĄ, PRZETESTOWANĄ kopią JEDNEGO zmierzonego
oryginalnego wyrażenia — DOKŁADNIE JEDNA operacja zmiennoprzecinkowa na
literale float, bit w bit z wyrażeniem inline sprzed migracji (test tożsamości
w `backend/tests/network_model/pochodne/test_jednostki.py`, porównanie `==`
na siatce wartości: 0, ±1, ±1e-9, ±123,456, ±1e12, 1e300 oraz 50 wartości z
generatora z ziarnem), więc podmiana inline → wywołanie funkcji jest bit w
bit identyczna z kodem sprzed karty na KAŻDYM wejściu, nie tylko typowym.

Reguły (§0.1/§0.2 karty W3-F, wiążące — analogiczne do K4.1/K4.5 dla
`wielkosci_pochodne.py`, ten sam precedens architektoniczny):
- Moduł ADDYTYWNY, liść grafu importów: bez importów poza `from __future__
  import annotations` — nawet `math` NIE jest tu importowany, bo te funkcje
  to CZYSTE skalowanie literałem (jedna operacja `*`/`/`), nie wzór fizyczny;
  formuła z częstotliwością (B = 2πf·C, wymaga `math.pi`) idzie do
  `wielkosci_pochodne.py` (siostrzany moduł w TYM SAMYM pakiecie), nie tutaj.
  Import z `jednostki.py` DO rdzeni solverów jest zabroniony (jak dla
  `wielkosci_pochodne.py`) — moduł może być importowany na poziomie modułu z
  KAŻDEJ warstwy (domena, aplikacja, analiza, enm, api, infrastructure, a
  także `network_model/core/**`) bez ryzyka cyklu importów, bo `pochodne/`
  jest siostrą `core/` i `solvers/`, nie potomkiem żadnego z nich (patrz
  docstring modułu `wielkosci_pochodne.py` dla pełnego uzasadnienia relokacji
  architekta 2026-09-06 — dotyczy całego pakietu `pochodne/`, więc również
  tego modułu).
- Czyste funkcje `float -> float`: bez zaokrąglania, bez rzutowania na `int`,
  bez walidacji, bez efektów ubocznych. Dokładnie JEDNA operacja `*`/`/` na
  stałej liczbowej. `float(...)`, `int(round(...))`, `round(..., 6)` zostają
  u WOŁAJĄCEGO dokładnie jak były w oryginale — tu jest wyłącznie sam
  przelicznik.
- Formy literałów `1000`, `1000.0`, `1e3` są TYM SAMYM floatem (IEEE 754,
  `1000 == 1000.0 == 1e3`) → JEDNA funkcja niezależnie od tego, którą formę
  literału miało wywołanie źródłowe przed migracją. To samo dla
  `1_000_000`/`1e6` (`1_000_000.0 == 1e6`). `1e-6` NIE jest bit w bit tym
  samym floatem co `/ 1_000_000.0` (inna sekwencja zaokrągleń IEEE 754 — patrz
  `mikrosimens_na_simens` kontra `mikrosimens_na_simens_ybus` niżej) i `0.001`
  (`1e-3`) NIE jest bit w bit tym samym floatem co `/ 1000.0` — żadna funkcja
  tutaj nie reprezentuje `0.001`/`1e-3` jako "dzielenie przez 1000" (w
  zmierzonym inwentarzu karty W3-F żadne miejsce `* 0.001` nie jest
  skalowaniem jednostki — patrz tabela inwentarza w meldunku karty).
- Kolejność działań zachowana DOKŁADNIE jak w oryginale: przy łańcuchu mnożeń
  (np. `power_mw * energy_hours * 1000` → `mwh_na_kwh(power_mw * energy_hours)`,
  lewostronna łączność Pythona = ta sama sekwencja) funkcja opakowuje
  WYŁĄCZNIE operację na literale, nigdy cały łańcuch — wołający przekazuje
  już-policzony argument, tak jak przekazywałby go do mnożenia inline.
- Kilka funkcji liczy TĘ SAMĄ konwersję jednostki różnymi ścieżkami
  zmiennoprzecinkowymi zmierzonymi w RÓŻNYCH plikach (np. `mikrosimens_na_simens`
  ×(1/1_000_000.0) kontra `mikrosimens_na_simens_ybus` ×1e-6) — to NIE jest
  przypadkowa duplikacja: to dwie NIEZALEŻNE sekwencje zmierzone w oryginalnym
  kodzie w różnych plikach, a wymóg bit w bit (§0.7.1 karty) zabrania scalenia
  ich w jedną bez zmiany ostatniego bitu wyniku dla części wołających
  (mnożenie/dzielenie w IEEE 754 jest przemienne, ale dzielenie NIE jest
  łączne z mnożeniem — inna kolejność może dać inny wynik o 1 ULP). Docstring
  każdej takiej funkcji nazywa siostrzaną funkcję i różnicę.
"""

from __future__ import annotations

# =============================================================================
# Moc — kW/MW/W, kvar/Mvar, kVA/MVA, MWh/kWh
# =============================================================================


def kw_na_mw(moc_kw: float) -> float:
    """Moc czynna: kW -> MW, x / 1000.0."""
    return moc_kw / 1000.0


def mw_na_kw(moc_mw: float) -> float:
    """Moc czynna: MW -> kW, x * 1000.0."""
    return moc_mw * 1000.0


def kvar_na_mvar(moc_kvar: float) -> float:
    """Moc bierna: kvar -> Mvar, x / 1000.0 (ta sama operacja co `kw_na_mw`,
    inna wielkość fizyczna — moc bierna zamiast czynnej)."""
    return moc_kvar / 1000.0


def mvar_na_kvar(moc_mvar: float) -> float:
    """Moc bierna: Mvar -> kvar, x * 1000.0 (ta sama operacja co `mw_na_kw`)."""
    return moc_mvar * 1000.0


def kva_na_mva(moc_kva: float) -> float:
    """Moc pozorna: kVA -> MVA, x / 1000.0 (ta sama operacja co `kw_na_mw`)."""
    return moc_kva / 1000.0


def mva_na_kva(moc_mva: float) -> float:
    """Moc pozorna: MVA -> kVA, x * 1000.0 (ta sama operacja co `mw_na_kw`)."""
    return moc_mva * 1000.0


def kw_na_w(moc_kw: float) -> float:
    """Moc czynna: kW -> W, x * 1000.0.

    Zmierzone w ``infrastructure/cgmes/cgmes_exporter.py::_ik_a`` sąsiedztwie
    (``pk_w = trafo.pk_kw * 1000.0``) — jedyne miejsce w pakiecie CGMES, które
    NIE przechodziło przez lokalny moduł ``infrastructure/cgmes/units.py``
    (ten moduł ma WŁASNY, wcześniej istniejący komplet stałych nazwanych
    ``_MW_TO_W``/``_KV_TO_V``/itd. i WŁASNE testy — poza zakresem tej karty,
    inwentarz mierzy wyłącznie literały INLINE, a `units.py` ich nie ma).
    """
    return moc_kw * 1000.0


def mw_na_w(moc_mw: float) -> float:
    """Moc czynna: MW -> W, x * 1e6 (network_model/core/generator.py:141)."""
    return moc_mw * 1e6


def mwh_na_kwh(energia_mwh: float) -> float:
    """Energia: MWh -> kWh, x * 1000.0 (network_model/catalog/
    mv_converter_catalog.py:263 — ``power_mw * energy_hours * 1000``,
    lewostronna łączność: funkcja opakowuje wyłącznie ostatnie mnożenie)."""
    return energia_mwh * 1000.0


# =============================================================================
# Prąd — A/kA
# =============================================================================


def a_na_ka(prad_a: float) -> float:
    """Prąd: A -> kA, x / 1000.0."""
    return prad_a / 1000.0


def ka_na_a(prad_ka: float) -> float:
    """Prąd: kA -> A, x * 1000.0."""
    return prad_ka * 1000.0


# =============================================================================
# Napięcie — V/kV
# =============================================================================


def v_na_kv(napiecie_v: float) -> float:
    """Napięcie: V -> kV, x / 1000.0."""
    return napiecie_v / 1000.0


def kv_na_v(napiecie_kv: float) -> float:
    """Napięcie: kV -> V, x * 1000.0 (obejmuje warianty literału `* 1e3` —
    `1000.0 == 1e3` bit w bit, ten sam float)."""
    return napiecie_kv * 1000.0


# =============================================================================
# Długość — m/km
# =============================================================================


def m_na_km(dlugosc_m: float) -> float:
    """Długość: m -> km, x / 1000.0."""
    return dlugosc_m / 1000.0


def km_na_m(dlugosc_km: float) -> float:
    """Długość: km -> m, x * 1000.0."""
    return dlugosc_km * 1000.0


# =============================================================================
# Czas — ms/s
# =============================================================================


def ms_na_s(czas_ms: float) -> float:
    """Czas: ms -> s, x / 1000.0."""
    return czas_ms / 1000.0


def s_na_ms(czas_s: float) -> float:
    """Czas: s -> ms, x * 1000.0.

    Obejmuje czas zegara ściennego (`time.monotonic()`, `time.time()`) —
    skalowanie s↔ms jest skalowaniem jednostki niezależnie od tego, czy dane
    pochodzą z pomiaru elektrycznego czy z zegara systemowego (§0.4 karty:
    "jedna reguła bez wyjątków «bo to infrastruktura»"); wołający zachowuje
    rzutowanie na `int`, gdy oryginał je miało (np. `int(s_na_ms(...))` dla
    znaczników czasu w milisekundach jako liczba całkowita).
    """
    return czas_s * 1000.0


# =============================================================================
# Admitancja — µS/S
# =============================================================================


def mikrosimens_na_simens(admitancja_us: float) -> float:
    """Admitancja: µS -> S, x / 1_000_000.0 (materializacja ENM:
    enm/domain_operations.py:2712, enm/catalog_completion.py:449).

    Siostra `mikrosimens_na_simens_ybus` (×1e-6, tor Y-bus) — BIT W BIT RÓŻNA
    sekwencja zmiennoprzecinkowa (`x * 1e-6` ≠ `x / 1_000_000.0` o 1 ULP dla
    części wartości x), więc NIE wolno scalić tych dwóch funkcji w jedną bez
    zmiany ostatniego bitu wyniku dla którejś grupy wołających.
    """
    return admitancja_us / 1_000_000.0


def mikrosimens_na_simens_ybus(admitancja_us: float) -> float:
    """Admitancja: µS -> S, x * 1e-6 — tor Y-bus (network_model/core/branch.py:
    476, 479), bit w bit ze złotymi hashami power flow / short circuit.

    Siostra `mikrosimens_na_simens` (÷ 1_000_000.0) — patrz różnica tam;
    NIGDY nie podmieniaj jednej na drugą w torze Y-bus (zmiana ostatniego bitu
    admitancji szeregowej zmienia hash złotych wyników solverów FROZEN).
    """
    return admitancja_us * 1e-6


def simens_na_mikrosimens(admitancja_s: float) -> float:
    """Admitancja: S -> µS, x * 1e6 (enm/mapping.py:1016, network_model/
    catalog/mv_benchmark_catalog.py:147 — tam operand to wyrażenie `(b_pu /
    zb)`, nie goła nazwa, więc wołający przekazuje już-policzoną wartość)."""
    return admitancja_s * 1e6
