"""Kontrakt modelu ZIP odbioru na GRANICY ENM — jedno wejście, jedna walidacja.

Wielomian ZIP odbioru (ADR-011, niezmiennik Z-ZIP-04) opisuje, jak pobór zmienia
się z napięciem i częstotliwością::

    P(V) = P0 · [ a_P·(V/V0)² + b_P·(V/V0) + c_P ]      a_P + b_P + c_P = 1
    Q(V) = Q0 · [ a_Q·(V/V0)² + b_Q·(V/V0) + c_Q ]      a_Q + b_Q + c_Q = 1

Współczynniki żyją w ``Load.materialized_params`` i CZYTA je rozpływ mocy przez
``zip_coeffs_from_materialized_params``. Ten moduł jest JEDYNĄ drogą, którą mogą
tam trafić z payloadu operacji domenowej — pięciu pisarzy modelu (``add_nn_load``,
``add_load_sn``, ``create_device``, ``update_element_parameters`` i krok K6 kreatora
sieci) woła tę samą funkcję, więc zbiór stanów przyjętych do modelu i zbiór stanów,
które rozpływ potrafi policzyć, są równe Z KONSTRUKCJI, a nie „zgadzają się dzisiaj".
Ten sam moduł wyprowadza pole ``Load.model`` (``model_odbioru``) i niesie JEDEN
predykat modelu odbioru (``jest_odbiorem_zip``) oraz kontrolę, czy rozpływ odwzorowuje
odbiory ZIP szyny dokładnie (``odmowy_agregatu_zip``) — karta modeli odbiorów, O-49.

REGUŁA WEJŚCIA (bez zgadywania). Wielomian, który nie sumuje się do 1, jest
ODRZUCANY komunikatem po polsku wskazującym zmierzone sumy — nigdy cicho
normalizowany. Sama REGUŁA ma jedno źródło prawdy: ``validate_zip_coeffs``
solvera. Tutaj powstaje wyłącznie jej polskie brzmienie (warstwa domenowa mówi
językiem projektanta, solver — swoim).

ZGODNOŚĆ WSTECZNA. Payload bez współczynników oraz payload z DOMYŚLNYMI (stała
moc: a=b=0, c=1, k=0) dają ``None`` — model nie dostaje żadnego klucza, więc
migawka jest bajtowo identyczna jak przed tą zmianą, a rozpływ idzie ścieżką
klasyczną (reduce-to-NR). „Stała moc" to dokładnie to, co odbiór deklaruje już
polem ``model: "pq"``; zapisywanie tego drugi raz jako wielomian byłoby
równoległą prawdą o tym samym.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal

from network_model.solvers.power_flow_zip import (
    ZipCoeffs,
    aggregate_zip,
    frequency_factor,
    validate_zip_coeffs,
    zip_coeffs_from_materialized_params,
)

from .slownik_komunikatow import pole

if TYPE_CHECKING:  # pragma: no cover — wyłącznie adnotacje (bez cyklu importów w biegu)
    from .models import EnergyNetworkModel

#: Współczynniki modelu ZIP dobierane PER ODBIÓR — dokładnie te, które projektant
#: widzi w kontrakcie pól OBCIAZENIE (``MATERIALIZATION_CONTRACTS``) i ustawia w
#: kreatorze odbioru. Wielkości odniesienia (``v0_pu``, ``f0_hz``) NIE są tu
#: wymienione: nie są dobierane per odbiór — przy ich braku rozpływ przyjmuje 1,0 pu
#: (baza jednostek względnych) i częstotliwość znamionową STUDIUM
#: (``zip_coeffs_from_materialized_params``), nie literał 50 Hz.
KLUCZE_ZIP_ODBIORU: tuple[str, ...] = (
    "a_p",
    "b_p",
    "c_p",
    "a_q",
    "b_q",
    "c_q",
    "k_pf",
    "k_qf",
)

#: Wielkości ODNIESIENIA wielomianu. Nie są dobierane per odbiór, więc nie mają
#: pola w kreatorze — ale rozpływ je CZYTA, więc gdy tabliczka je niesie (np. z
#: migracji albo z korekty eksperckiej), muszą przejść tę samą kontrolę co
#: udziały. Klucz czytany, a niewalidowany, to ten sam defekt, tylko cichszy.
KLUCZE_ODNIESIENIA_ZIP: tuple[str, ...] = ("v0_pu", "f0_hz")

#: Domyślne = stała moc, bez wrażliwości częstotliwościowej. Te same liczby, które
#: przyjmuje ``zip_coeffs_from_materialized_params`` przy braku klucza — dlatego
#: uzupełnienie braków tutaj NIE zmienia wyniku rozpływu.
DOMYSLNE_ZIP_ODBIORU: dict[str, float] = {
    "a_p": 0.0,
    "b_p": 0.0,
    "c_p": 1.0,
    "a_q": 0.0,
    "b_q": 0.0,
    "c_q": 1.0,
    "k_pf": 0.0,
    "k_qf": 0.0,
}

#: Odniesienie napięciowe przy braku klucza — baza jednostek względnych (1,0 pu), ta sama,
#: którą przyjmuje ``zip_coeffs_from_materialized_params``; regułę poprawności trzyma
#: ``validate_zip_coeffs``.
DOMYSLNE_ODNIESIENIA_ZIP: dict[str, float] = {"v0_pu": 1.0}

#: ``f0_hz`` NIEPODANE: rozpływ przyjmie częstotliwość studium (dodatnią z konstrukcji
#: ``ENMDefaults``), więc warunek ``f0 > 0`` dotyczy wyłącznie wartości PODANEJ. Walidacja
#: wielomianu bez ``f0`` używa dodatniej wartości zastępczej, która nie zmienia werdyktu
#: (``validate_zip_coeffs`` sprawdza ``f0`` wyłącznie znakiem) i NIE trafia do tabliczki —
#: zapisywane są wyłącznie klucze podane (niżej).
F0_ZASTEPCZE_WALIDACJI_HZ = 1.0

KOD_BLEDU_ZIP = "load.zip_invalid"


def _liczba(wartosc: object) -> float | None:
    if isinstance(wartosc, bool):
        return None
    if isinstance(wartosc, int | float):
        return float(wartosc)
    return None


def _komunikat_niepoprawnego_modelu(wspolczynniki: dict[str, float]) -> str:
    """Polskie brzmienie odrzucenia: SAME ZMIERZONE LICZBY + zdanie o wymaganiu.

    Komunikat pokazuje wszystkie sześć udziałów i obie sumy, więc widać zarówno
    rozjechaną sumę, jak i udział poza zakresem — bez powtarzania warunku
    akceptacji w kodzie (o tym rozstrzyga wyłącznie ``validate_zip_coeffs``) i bez
    doklejania angielskiego tekstu solvera do zdania czytanego przez projektanta.
    """
    suma_p = wspolczynniki["a_p"] + wspolczynniki["b_p"] + wspolczynniki["c_p"]
    suma_q = wspolczynniki["a_q"] + wspolczynniki["b_q"] + wspolczynniki["c_q"]
    return (
        "Model obciążenia (ZIP) jest niepoprawny. Udziały P: "
        f"a={wspolczynniki['a_p']:.6f}, b={wspolczynniki['b_p']:.6f}, "
        f"c={wspolczynniki['c_p']:.6f} (suma {suma_p:.6f}); udziały Q: "
        f"a={wspolczynniki['a_q']:.6f}, b={wspolczynniki['b_q']:.6f}, "
        f"c={wspolczynniki['c_q']:.6f} (suma {suma_q:.6f}). Każdy udział musi "
        "mieścić się w zakresie [0, 1], a suma udziałów dla P i dla Q musi wynosić 1."
    )


def zip_odbioru_z_payloadu(
    payload: dict[str, Any],
) -> tuple[dict[str, float] | None, str | None]:
    """Współczynniki ZIP odbioru z payloadu operacji: ``(wspolczynniki, blad_pl)``.

    ``(None, None)``  — payload nie deklaruje modelu ZIP albo deklaruje stałą moc:
                        do modelu nie trafia nic (ścieżka historyczna, bajt w bajt).
    ``(dict, None)``  — poprawny wielomian nietrywialny; komplet ośmiu udziałów
                        (braki uzupełnione domyślnymi) plus te wielkości
                        odniesienia, które payload FAKTYCZNIE niósł, gotowy do
                        zapisu w ``Load.materialized_params``.
    ``(None, tekst)`` — wielomian odrzucony; ``tekst`` to komunikat dla projektanta.

    Walidowany jest KOMPLET tego, co czyta solver — także ``v0_pu``/``f0_hz``,
    mimo że kreator ich nie ustawia. Klucz czytany przez rozpływ, a przepuszczany
    tu bez kontroli, byłby tym samym defektem, który ta ścieżka zamyka.
    """
    czytane = (*KLUCZE_ZIP_ODBIORU, *KLUCZE_ODNIESIENIA_ZIP)
    podane = {klucz: payload[klucz] for klucz in czytane if klucz in payload}
    podane = {klucz: wartosc for klucz, wartosc in podane.items() if wartosc is not None}
    if not podane:
        return None, None

    wspolczynniki = {**DOMYSLNE_ZIP_ODBIORU, **DOMYSLNE_ODNIESIENIA_ZIP}
    for klucz, surowa in podane.items():
        liczba = _liczba(surowa)
        if liczba is None:
            return None, (
                f"Współczynnik modelu obciążenia (ZIP) {pole(klucz)} musi być liczbą, "
                f"otrzymano: {surowa!r}."
            )
        wspolczynniki[klucz] = liczba

    do_walidacji = {"f0_hz": F0_ZASTEPCZE_WALIDACJI_HZ, **wspolczynniki}
    coeffs = ZipCoeffs(**do_walidacji)
    try:
        validate_zip_coeffs(coeffs)
    except ValueError:
        return None, _komunikat_niepoprawnego_modelu(wspolczynniki)

    # Stała moc bez wrażliwości częstotliwościowej NIE JEST osobnym modelem — to
    # klasyczny odbiór PQ, który element deklaruje polem `model`. Nie zapisujemy
    # go drugi raz jako wielomian: payload z domyślnymi daje ten sam model co
    # payload bez współczynników (zgodność wsteczna przypięta testem).
    if coeffs.is_constant_power() and not coeffs.has_frequency_dependence():
        return None, None

    # Odniesienia zapisujemy TYLKO gdy payload je niósł: odbiór z kreatora dostaje
    # dokładnie osiem kluczy, więc tabliczka nie puchnie o wartości, których nikt
    # nie deklarował (a solver i tak przyjmuje te same przy ich braku).
    return {
        klucz: wartosc
        for klucz, wartosc in wspolczynniki.items()
        if klucz in KLUCZE_ZIP_ODBIORU or klucz in podane
    }, None


def zip_odbioru_z_parametrow_materializacji(
    materialized: object,
) -> str | None:
    """Sprawdź współczynniki ZIP w gotowej tabliczce odbioru. ``None`` = w porządku.

    Ścieżki, które przyjmują ``materialized_params`` jako całość (topologiczne
    ``create_device``, ekspercki ``update_element_parameters``), wpuszczają
    wielomian do modelu z pominięciem payloadu kreatora. Bez tej kontroli odbiór
    z sumą udziałów ≠ 1 zapisywałby się bez słowa i wywracał dopiero rozpływ —
    surowym ``ValueError`` solvera, po angielsku, bez wskazania elementu.
    """
    if not isinstance(materialized, dict):
        return None
    _, blad = zip_odbioru_z_payloadu(materialized)
    return blad


# ---------------------------------------------------------------------------
# JEDEN predykat modelu odbioru (O-49 pkt 2)
# ---------------------------------------------------------------------------


def jest_odbiorem_zip(materialized_params: object, f_studium_hz: float) -> bool:
    """Odbiór ZIP <=> rozpływ czyta z jego tabliczki wielomian NIETRYWIALNY.

    JEDNO źródło prawdy modelu odbioru: ten sam odczyt
    (``zip_coeffs_from_materialized_params``), z którego liczy rozpływ i z którego
    adapter dynamiki buduje charakterystykę. Pole ``Load.model`` jest WYPROWADZANE z tego
    predykatu przez pisarzy modelu i nie jest czytane przez żaden rachunek — dawny
    predykat ``load.model == "zip"`` w adapterze dynamiki rozjeżdżał się z rozpływem
    (odbiór ``model="pq"`` ze współczynnikami ZIP: rozpływ liczył ZIP, dynamika stałą moc,
    moc wytwórcy szyny 0,9 % obok punktu pracy).
    """
    if not isinstance(materialized_params, dict):
        return False
    return zip_coeffs_from_materialized_params(materialized_params, f_studium_hz) is not None


def model_odbioru(materialized_params: object, f_studium_hz: float) -> Literal["pq", "zip"]:
    """Wartość pola ``Load.model`` wyprowadzona z predykatu ``jest_odbiorem_zip``."""
    return "zip" if jest_odbiorem_zip(materialized_params, f_studium_hz) else "pq"


# ---------------------------------------------------------------------------
# Reprezentowalność modelu odbiorów szyny w rozpływie (O-49 pkt 5, S2 karty odbiorów)
# ---------------------------------------------------------------------------

#: Kod gotowości (``READINESS_CODES``) i odmowy assemblera rozpływu dla szyny, której
#: odbiorów ZIP rozpływ nie potrafi odwzorować dokładnie.
KOD_ZIP_AGREGAT_NIEREPREZENTOWALNY = "load.zip_agregat_niereprezentowalny"

#: Próg WZGLĘDNY (do sumy modułów mocy bazowych odbiorów szyny) rozbieżności
#: współczynników wielomianu „suma odbiorów" vs „agregat rozpływu". Rząd błędu zaokrągleń
#: samej agregacji (udziały ważone i z powrotem pomnożone przez sumę) to 1e-16…1e-15;
#: przypadki niereprezentowalne różnią się o wielkości MODELOWE (pomiar S2: 2e-3 mocy
#: odbioru przy V = 0,9 pu i 49 Hz). Próg nie jest strojony pod przypadek.
TOLERANCJA_WZGLEDNA_AGREGATU = 1.0e-9

#: Napięcia [pu], w których komunikat raportuje rozbieżność mocy (wielomian 2. stopnia —
#: siatka służy wyłącznie opisowi, decyzja zapada na współczynnikach).
_SIATKA_NAPIEC_OPISU_PU: tuple[float, ...] = tuple(round(0.05 * n, 2) for n in range(25))


@dataclass(frozen=True)
class NiereprezentowalnyAgregatZip:
    """Szyna, której odbiorów rozpływ nie odwzorowuje dokładnie — z pomiarem rozbieżności."""

    szyna: str
    odbiory: tuple[str, ...]
    powod_pl: str
    rozbieznosc_p_mw: float
    rozbieznosc_q_mvar: float


def _wspolczynniki_potegowe(
    moc: float, coeffs: ZipCoeffs | None, os: Literal["P", "Q"], f_studium_hz: float
) -> tuple[float, float, float]:
    """Współczynniki przy V², V¹, V⁰ (V w pu) mocy odbioru przy częstotliwości studium."""
    if coeffs is None:
        return (0.0, 0.0, moc)
    if os == "P":
        a, b, c, k = coeffs.a_p, coeffs.b_p, coeffs.c_p, coeffs.k_pf
    else:
        a, b, c, k = coeffs.a_q, coeffs.b_q, coeffs.c_q, coeffs.k_qf
    skala = moc * frequency_factor(k, f_studium_hz, coeffs.f0_hz)
    return (skala * a / coeffs.v0_pu**2, skala * b / coeffs.v0_pu, skala * c)


def _rozbieznosc(
    rzeczywiste: tuple[float, float, float], agregat: tuple[float, float, float]
) -> tuple[float, float]:
    """(max różnicy współczynników, max różnicy mocy na siatce napięć opisu)."""
    roznice = tuple(x - y for x, y in zip(rzeczywiste, agregat, strict=True))
    wspolczynniki = max(abs(r) for r in roznice)
    moc = max(
        abs(roznice[0] * v * v + roznice[1] * v + roznice[2]) for v in _SIATKA_NAPIEC_OPISU_PU
    )
    return wspolczynniki, moc


def reprezentowalnosc_zip_szyny(
    odbiory_szyny: Sequence[tuple[float, float, ZipCoeffs | None]], f_studium_hz: float
) -> tuple[str, float, float] | None:
    """Czy rozpływ odwzorowuje odbiory szyny DOKŁADNIE — ``None`` = tak.

    Rozpływ niesie JEDEN wielomian na szynę (``power_flow_zip.aggregate_zip``, wagi mocą
    bazową, jeden czynnik częstotliwościowy, odniesienia pierwszego odbioru ze
    współczynnikami). Odwzorowanie jest dokładne wtedy i tylko wtedy, gdy wielomian mocy
    SUMY odbiorów przy częstotliwości studium — współczynniki przy V², V i V⁰ policzone
    osobno dla każdego odbioru z jego własnym ``v0``, ``f0`` i ``k`` — jest równy
    wielomianowi agregatu, a udziały agregatu leżą w [0, 1] (inaczej ``build_zip_table``
    odrzuca go surowym błędem). Porównanie współczynników obejmuje naraz wszystkie
    przypadki sondy S2: różne ``k`` przy ``f_studium != f0``, różne ``v0`` (agregat zależny
    od kolejności odbiorów), sumę ``Q0 = 0`` przy różnych wielomianach (agregat = cicho
    zero) i udziały poza [0, 1].

    Zwraca ``(powód PL, rozbieżność P [MW], rozbieżność Q [Mvar])`` — rozbieżność to
    największa różnica mocy „suma odbiorów − agregat" na siatce napięć 0…1,2 pu.
    """
    if not any(coeffs is not None for _p, _q, coeffs in odbiory_szyny):
        return None
    rzeczywiste_p = [0.0, 0.0, 0.0]
    rzeczywiste_q = [0.0, 0.0, 0.0]
    for p0, q0, coeffs in odbiory_szyny:
        for i, w in enumerate(_wspolczynniki_potegowe(p0, coeffs, "P", f_studium_hz)):
            rzeczywiste_p[i] += w
        for i, w in enumerate(_wspolczynniki_potegowe(q0, coeffs, "Q", f_studium_hz)):
            rzeczywiste_q[i] += w
    p_suma = sum(p for p, _q, _c in odbiory_szyny)
    q_suma = sum(q for _p, q, _c in odbiory_szyny)
    agregat = aggregate_zip(list(odbiory_szyny))
    powod: str | None = None
    if agregat is None:
        agregat_p: tuple[float, float, float] = (0.0, 0.0, p_suma)
        agregat_q: tuple[float, float, float] = (0.0, 0.0, q_suma)
    else:
        try:
            validate_zip_coeffs(agregat)
        except ValueError:
            powod = (
                "udziały wielomianu zastępczego szyny wychodzą poza przedział [0, 1] "
                f"(P: a={agregat.a_p:.6f}, b={agregat.b_p:.6f}, c={agregat.c_p:.6f}; "
                f"Q: a={agregat.a_q:.6f}, b={agregat.b_q:.6f}, c={agregat.c_q:.6f}) — "
                "odbiory o mocy biernej przeciwnych znaków albo różnych wielomianach"
            )
        agregat_p = _wspolczynniki_potegowe(p_suma, agregat, "P", f_studium_hz)
        agregat_q = _wspolczynniki_potegowe(q_suma, agregat, "Q", f_studium_hz)
    wsp_p, moc_p = _rozbieznosc((rzeczywiste_p[0], rzeczywiste_p[1], rzeczywiste_p[2]), agregat_p)
    wsp_q, moc_q = _rozbieznosc((rzeczywiste_q[0], rzeczywiste_q[1], rzeczywiste_q[2]), agregat_q)
    skala_p = sum(abs(p) for p, _q, _c in odbiory_szyny)
    skala_q = sum(abs(q) for _p, q, _c in odbiory_szyny)
    if powod is None and (
        wsp_p > TOLERANCJA_WZGLEDNA_AGREGATU * skala_p
        or wsp_q > TOLERANCJA_WZGLEDNA_AGREGATU * skala_q
    ):
        powod = (
            "wielomian zastępczy szyny (wagi mocą bazową, jeden czynnik częstotliwościowy, "
            "jedno napięcie i jedna częstotliwość odniesienia) nie jest równy sumie "
            "wielomianów odbiorów — odbiory różnią się napięciem albo częstotliwością "
            "odniesienia, czułością częstotliwościową przy częstotliwości studium innej niż "
            "odniesienia, albo suma ich mocy bazowych jest zerowa przy różnych wielomianach"
        )
    if powod is None:
        return None
    return powod, moc_p, moc_q


def odmowy_agregatu_zip(enm: EnergyNetworkModel) -> tuple[NiereprezentowalnyAgregatZip, ...]:
    """Szyny, których odbiorów ZIP rozpływ nie odwzorowuje dokładnie — JEDEN predykat dla
    bramki gotowości rozpływu (``calculation_readiness/service.py::_check_power_flow``) i dla
    assemblera rozpływu (``enm/assembler.py::zloz_wejscie_rozplywu``, odmowa nazwana).

    * Szyna węzła PQ: ``reprezentowalnosc_zip_szyny``.
    * Szyna regulacji napięcia (węzeł PV, ``mapping.generator_reguluje_napiecie``): graf
      rozpływu nie niesie tam wielomianu wcale — odbiory ZIP takiej szyny byłyby liczone
      stałą mocą, więc każdy odbiór ZIP na niej jest nieodwzorowany.
    * Szyna źródła sieciowego (bilansująca) jest POMINIĘTA z powodem: jej moc nie jest
      zadana w równaniach rozpływu (bilans domyka źródło), więc wielomian odbiorów tej szyny
      nie wchodzi do rozwiązania; podział mocy tej szyny na źródło i odbiory liczy dynamika
      z napięcia rozwiązania.

    Częstotliwość studium z nagłówka ENM (to samo pole, które czyta
    ``assembler.czestotliwosc_studium_hz`` z surowej migawki).
    """
    from .mapping import generator_reguluje_napiecie

    f_studium_hz = float(enm.header.defaults.frequency_hz)
    szyny_zrodel = {zrodlo.bus_ref for zrodlo in enm.sources}
    szyny_pv = {gen.bus_ref for gen in enm.generators if generator_reguluje_napiecie(gen)}
    odbiory_szyn: dict[str, list[tuple[str, float, float, ZipCoeffs | None]]] = {}
    for load in sorted(enm.loads, key=lambda odbior: odbior.ref_id):
        odbiory_szyn.setdefault(load.bus_ref, []).append(
            (
                load.ref_id,
                float(load.p_mw),
                float(load.q_mvar),
                zip_coeffs_from_materialized_params(load.materialized_params, f_studium_hz),
            )
        )
    wynik: list[NiereprezentowalnyAgregatZip] = []
    for szyna in sorted(odbiory_szyn):
        if szyna in szyny_zrodel:
            continue
        odbiory = odbiory_szyn[szyna]
        zip_odbiory = tuple(ref for ref, _p, _q, coeffs in odbiory if coeffs is not None)
        if not zip_odbiory:
            continue
        if szyna in szyny_pv:
            wynik.append(
                NiereprezentowalnyAgregatZip(
                    szyna=szyna,
                    odbiory=zip_odbiory,
                    powod_pl=(
                        "szyna regulacji napięcia (węzeł PV) — rozpływ nie niesie tam "
                        "wielomianu odbiorów i liczyłby odbiory ZIP stałą mocą"
                    ),
                    rozbieznosc_p_mw=0.0,
                    rozbieznosc_q_mvar=0.0,
                )
            )
            continue
        werdykt = reprezentowalnosc_zip_szyny(
            [(p, q, coeffs) for _ref, p, q, coeffs in odbiory], f_studium_hz
        )
        if werdykt is None:
            continue
        powod, rozbieznosc_p, rozbieznosc_q = werdykt
        wynik.append(
            NiereprezentowalnyAgregatZip(
                szyna=szyna,
                odbiory=tuple(ref for ref, _p, _q, _c in odbiory),
                powod_pl=powod,
                rozbieznosc_p_mw=rozbieznosc_p,
                rozbieznosc_q_mvar=rozbieznosc_q,
            )
        )
    return tuple(wynik)


def opis_odmowy_agregatu_zip(
    odmowa: NiereprezentowalnyAgregatZip, nazwa_elementu: Callable[[str], str]
) -> str:
    """Komunikat PL jednej szyny — szyna i odbiory NAZWAMI z modelu (karta #144).

    ``nazwa_elementu`` zamienia identyfikator na nazwę pokazywaną (wołający ma indeks nazw
    migawki); identyfikatory zostają w ``elementy`` odmowy i w ``blocking_object_refs``.
    """
    rozbieznosc = (
        f" Największa rozbieżność mocy sumy odbiorów względem modelu rozpływu w zakresie "
        f"napięć 0–1,2 pu: P {odmowa.rozbieznosc_p_mw:.6g} MW, Q "
        f"{odmowa.rozbieznosc_q_mvar:.6g} Mvar."
        if odmowa.rozbieznosc_p_mw or odmowa.rozbieznosc_q_mvar
        else ""
    )
    nazwy_odbiorow = ", ".join(nazwa_elementu(ref) for ref in odmowa.odbiory)
    return (
        f"Odbiory ZIP szyny {nazwa_elementu(odmowa.szyna)} ({nazwy_odbiorow}) nie dają się "
        f"odwzorować w rozpływie dokładnie: {odmowa.powod_pl}.{rozbieznosc} Rozdziel odbiory "
        "o różnych charakterystykach na osobne szyny albo ujednolić ich charakterystyki "
        "— dokładne odwzorowanie wielu odbiorów ZIP na jednej szynie wymaga zmiany rdzenia "
        "rozpływu (decyzja właściciela)."
    )
