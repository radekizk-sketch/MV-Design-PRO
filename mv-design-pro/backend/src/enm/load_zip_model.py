"""Kontrakt modelu ZIP odbioru na GRANICY ENM — jedno wejście, jedna walidacja.

Wielomian ZIP odbioru (ADR-011, niezmiennik Z-ZIP-04) opisuje, jak pobór zmienia
się z napięciem i częstotliwością::

    P(V) = P0 · [ a_P·(V/V0)² + b_P·(V/V0) + c_P ]      a_P + b_P + c_P = 1
    Q(V) = Q0 · [ a_Q·(V/V0)² + b_Q·(V/V0) + c_Q ]      a_Q + b_Q + c_Q = 1

Współczynniki żyją w ``Load.materialized_params`` i CZYTA je rozpływ mocy przez
``zip_coeffs_from_materialized_params``. Ten moduł jest JEDYNĄ drogą, którą mogą
tam trafić z payloadu operacji domenowej — trzy pisarze modelu (``add_nn_load``,
``create_device``, ``update_element_parameters``) wołają tę samą funkcję, więc
zbiór stanów przyjętych do modelu i zbiór stanów, które rozpływ potrafi policzyć,
są równe Z KONSTRUKCJI, a nie „zgadzają się dzisiaj".

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

from typing import Any

from network_model.solvers.power_flow_zip import ZipCoeffs, validate_zip_coeffs

#: Współczynniki modelu ZIP dobierane PER ODBIÓR — dokładnie te, które projektant
#: widzi w kontrakcie pól OBCIAZENIE (``MATERIALIZATION_CONTRACTS``) i ustawia w
#: kreatorze odbioru. Wielkości odniesienia układu (``v0_pu``, ``f0_hz``) NIE są
#: tu wymienione: nie są własnością pojedynczego odbioru, więc zostają na
#: wartościach odniesienia solvera (1,0 pu / 50 Hz).
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

#: Odniesienia solvera (``ZipCoeffs``) — powtórzone tu wyłącznie jako wartości
#: startowe uzupełniania braków; regułę ich poprawności trzyma ``validate_zip_coeffs``.
DOMYSLNE_ODNIESIENIA_ZIP: dict[str, float] = {"v0_pu": 1.0, "f0_hz": 50.0}

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
                f"Współczynnik modelu obciążenia (ZIP) '{klucz}' musi być liczbą, "
                f"otrzymano: {surowa!r}."
            )
        wspolczynniki[klucz] = liczba

    coeffs = ZipCoeffs(**wspolczynniki)
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
