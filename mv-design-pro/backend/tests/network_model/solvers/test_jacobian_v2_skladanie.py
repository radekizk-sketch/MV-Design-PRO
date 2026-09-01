"""PIN BITOWY składania jakobianu Newtona-Raphsona (karta N1-WYDAJNOSC).

``build_jacobian_v2`` składa jakobian blokowo (operacje na całych blokach), a nie
pętlą skalarną. To zmiana WYŁĄCZNIE sposobu składania — wynik ma być IDENTYCZNY
CO DO BITU z postacią skalarną, bo inaczej ostatnie cyfry rozpływu (a przez nie
wszystkie analizy nadbudowane: N-1, walidacja energetyczna, dowody) po cichu by się
przesunęły.

Ten plik trzyma REFERENCYJNĄ IMPLEMENTACJĘ SKALARNĄ — dokładny zapis pętli sprzed
optymalizacji — i porównuje ją z produkcyjną na WZORCU BITÓW (``view(np.uint64)``),
nie na ``allclose``. Porównanie bitowe łapie także różnicę ``-0.0`` vs ``+0.0``,
której ``==`` by nie zauważyło, a która potrafi zmienić wynik dodawania.

DWIE RZECZY, DWA PINY (korekta 2026-08-14 — decyzja właściciela po pomiarze).
Pierwotnie jeden pin mieszał dwie rzeczy: sposób składania (nasz kod) i zgodność
wektorowego ``np.sin`` ze skalarnym (cudzy kod). Runner CI pokazał, że druga z nich
NIE zachodzi na każdym procesorze — pin świecił czerwono, choć składanie było
identyczne. Teraz:

* SPOSÓB SKŁADANIA pinuje ``_jakobian_skalarny`` — bierze wejście trygonometryczne z
  TEJ SAMEJ funkcji, co produkcja (``trig_bloku``), więc równoważność bitowa jest
  własnością konstrukcji, niezależną od procesora (sprawdzone: podmiana ``trig_bloku``
  na wartości przesunięte o 1 ULP NIE psuje zgodności, a odwrócenie znaku jednego
  wyrazu składania — psuje);
* WŁASNOŚĆ BIBLIOTEKI pinuje ``test_trig_wektorowy_vs_skalarny_najwyzej_1_ulp``
  (granica 1 ULP; zmierzony wpływ najgorszego przypadku na krok Newtona: 7,0e-12,
  cztery rzędy poniżej tolerancji zbieżności 1e-8).

ILOCZYN CECH (nie pojedynczy przykład): pokrycie obejmuje kombinacje
{blok kwadratowy ns×ns, bloki mieszane ns×pq i pq×ns, gdzie przekątna NIE leży na
``row == col``} × {sieć z węzłami PV, sieć bez PV} × {start płaski (wszystkie kąty
równe, ``theta == 0``), stan rozbieżnych kątów} × {gałęzie obecne i nieobecne w
Y-bus, czyli wyrazy zerowe} × {przypadki zdegenerowane: brak węzłów PQ, jeden węzeł}
× {realna macierz Y-bus substratu 53 stacji z realnego biegu rozpływu}.
"""

from __future__ import annotations

import json

import numpy as np
import pytest
from network_model.solvers.power_flow_newton_internal import build_jacobian_v2


def _jakobian_skalarny(
    ybus: np.ndarray,
    v: np.ndarray,
    non_slack_indices: list[int],
    pq_indices: list[int],
    p_calc: np.ndarray,
    q_calc: np.ndarray,
) -> np.ndarray:
    """Referencja: DOKŁADNY zapis pętli skalarnej sprzed karty N1-WYDAJNOSC.

    Nie upraszczać i nie „porządkować" — wartość tej funkcji polega na tym, że jest
    wiernym zapisem postaci, wobec której deklarujemy bitową równoważność.

    WEJŚCIE TRYGONOMETRYCZNE JEST WSPÓLNE Z PRODUKCJĄ (``trig_bloku``) — korekta
    2026-08-14 po zderzeniu z runnerem CI. Ta funkcja pinuje SPOSÓB SKŁADANIA (co
    było przedmiotem karty N1-WYDAJNOSC), a nie ścieżkę SIMD sinusa: gdy sinus
    liczyły osobno obie strony, pin świecił czerwono na procesorze o innej ścieżce
    wektorowej, mimo że sposób składania był identyczny. Własność biblioteki
    (wektor vs skalar ≤ 1 ULP) ma własny pin niżej w tym pliku — razem pokrywają
    to samo, co pin pierwotny, ale każdy mierzy JEDNĄ rzecz.
    """
    from network_model.solvers.power_flow_newton_internal import trig_bloku, wyrazy_przekatne

    g = ybus.real
    b = ybus.imag
    n_p = len(non_slack_indices)
    n_q = len(pq_indices)
    j11 = np.zeros((n_p, n_p))
    j12 = np.zeros((n_p, n_q))
    j21 = np.zeros((n_q, n_p))
    j22 = np.zeros((n_q, n_q))

    v_mag = np.abs(v)
    v_ang = np.angle(v)

    # Wejscie trygonometryczne per blok — TA SAMA funkcja, ktora liczy produkcja.
    va_ns = v_ang[np.asarray(non_slack_indices, dtype=np.intp)]
    va_pq = v_ang[np.asarray(pq_indices, dtype=np.intp)]
    sin_11, cos_11 = trig_bloku(va_ns, va_ns)
    sin_12, cos_12 = trig_bloku(va_ns, va_pq)
    sin_21, cos_21 = trig_bloku(va_pq, va_ns)
    sin_22, cos_22 = trig_bloku(va_pq, va_pq)
    # Wyrazy przekatniowe — rowniez z JEDNEGO zrodla wspolnego z produkcja
    # (numpy potrafi liczyc `vm ** 2` inna droga dla tablicy niz dla skalara).
    idx_ns = np.asarray(non_slack_indices, dtype=np.intp)
    idx_pq = np.asarray(pq_indices, dtype=np.intp)
    przek_11, przek_12, przek_21, przek_22 = wyrazy_przekatne(
        g, b, v_mag[idx_ns], v_mag[idx_pq], p_calc, q_calc, idx_ns, idx_pq
    )

    for row, i in enumerate(non_slack_indices):
        for col, k in enumerate(non_slack_indices):
            if i == k:
                j11[row, col] = przek_11[row]
            else:
                sin_t = sin_11[row, col]
                cos_t = cos_11[row, col]
                j11[row, col] = v_mag[i] * v_mag[k] * (g[i, k] * sin_t - b[i, k] * cos_t)

    for row, i in enumerate(non_slack_indices):
        for col, k in enumerate(pq_indices):
            if i == k:
                j12[row, col] = przek_12[row]
            else:
                sin_t = sin_12[row, col]
                cos_t = cos_12[row, col]
                j12[row, col] = v_mag[i] * (g[i, k] * cos_t + b[i, k] * sin_t)

    for row, i in enumerate(pq_indices):
        for col, k in enumerate(non_slack_indices):
            if i == k:
                j21[row, col] = przek_21[row]
            else:
                sin_t = sin_21[row, col]
                cos_t = cos_21[row, col]
                j21[row, col] = -v_mag[i] * v_mag[k] * (g[i, k] * cos_t + b[i, k] * sin_t)

    for row, i in enumerate(pq_indices):
        for col, k in enumerate(pq_indices):
            if i == k:
                j22[row, col] = przek_22[row]
            else:
                sin_t = sin_22[row, col]
                cos_t = cos_22[row, col]
                j22[row, col] = v_mag[i] * (g[i, k] * sin_t - b[i, k] * cos_t)

    top = np.hstack([j11, j12])
    bottom = np.hstack([j21, j22])
    return np.vstack([top, bottom])


def test_trig_wektorowy_vs_skalarny_najwyzej_1_ulp() -> None:
    """WLASNOSC BIBLIOTEKI, nie tego kodu: sinus wektorowy vs skalarny.

    Pin powstal 2026-08-14 z pomiaru, a nie z ostroznosci. Pierwotny pin skladania
    zakladal, ze ``np.sin`` policzony dla tablicy daje bit w bit to samo, co wywolany
    skalarnie. Na tej maszynie daje; na runnerze CI NIE (inna sciezka SIMD) i pin
    swiecil czerwono, mimo ze SPOSOB SKLADANIA byl identyczny. Rozdzielone: skladanie
    pinuje ``_jakobian_skalarny`` (wspolne wejscie ``trig_bloku``), a TU stoi jawna
    granica dla biblioteki.

    Dopuszczalna roznica to 1 ULP. Zmierzony wplyw najgorszego przypadku na substracie
    53 stacji (Y-bus 308x308): jakobian ``max |delta| = 2,8e-17`` (wzglednie 2,2e-16),
    krok Newtona ``max |delta dx| = 7,0e-12`` — cztery rzedy PONIZEJ tolerancji
    zbieznosci 1e-8. Gdyby biblioteka kiedys przekroczyla 1 ULP, ten pin zaswieci
    czerwono i decyzja o postaci skladania wroci na stol z nowym pomiarem.
    """
    rng = np.random.default_rng(20260814)
    katy = rng.uniform(-np.pi, np.pi, 4096)

    for nazwa, wektorowa, skalarna in (
        ("sin", np.sin(katy), np.array([np.sin(float(x)) for x in katy])),
        ("cos", np.cos(katy), np.array([np.cos(float(x)) for x in katy])),
    ):
        rozne = np.flatnonzero(wektorowa.view(np.uint64) != skalarna.view(np.uint64))
        if rozne.size == 0:
            continue
        # Roznica liczona w ULP: ile reprezentowalnych liczb dzieli obie wartosci.
        krok = np.abs(np.nextafter(skalarna[rozne], np.inf) - skalarna[rozne])
        ulp = np.abs(wektorowa[rozne] - skalarna[rozne]) / np.maximum(krok, np.finfo(float).tiny)
        assert ulp.max() <= 1.0, (
            f"{nazwa}: wektorowa i skalarna postac roznia sie o {ulp.max():.2f} ULP "
            f"(dopuszczalne 1 ULP) na {rozne.size} z {katy.size} wartosci. "
            "Wplyw na wynik rozplywu trzeba zmierzyc ponownie — patrz docstring."
        )


def _rowne_bitowo(lewa: np.ndarray, prawa: np.ndarray) -> bool:
    """Równość WZORCA BITÓW — łapie też ``-0.0`` vs ``+0.0`` (``==`` by nie złapało)."""
    if lewa.shape != prawa.shape or lewa.dtype != prawa.dtype:
        return False
    if lewa.size == 0:
        return True
    return bool(
        np.array_equal(
            np.ascontiguousarray(lewa).view(np.uint64),
            np.ascontiguousarray(prawa).view(np.uint64),
        )
    )


def _ybus_losowy(rng: np.random.Generator, n: int, gestosc: float) -> np.ndarray:
    """Y-bus o strukturze sieciowej: symetryczna, rzadka, z sumą wierszy na przekątnej.

    Rzadkość jest tu ISTOTNĄ cechą, a nie ozdobą: wyrazy ``g[i,k] == b[i,k] == 0``
    to miejsca, w których optymalizacja „pomijająca zera" wpisałaby ``+0.0`` tam,
    gdzie pętla wpisuje ``-0.0``. Postać blokowa niczego nie pomija — i ten test
    trzyma to w ryzach.
    """
    ybus = np.zeros((n, n), dtype=complex)
    for i in range(n):
        for k in range(i + 1, n):
            if rng.random() < gestosc:
                y = complex(rng.uniform(0.5, 5.0), -rng.uniform(1.0, 20.0))
                ybus[i, k] = -y
                ybus[k, i] = -y
                ybus[i, i] += y
                ybus[k, k] += y
    ybus += np.eye(n) * complex(0.0, 0.001)
    return ybus


def _stan_losowy(
    rng: np.random.Generator, n: int, *, plaski: bool
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if plaski:
        v = np.ones(n, dtype=complex)
    else:
        v = (1.0 + rng.uniform(-0.15, 0.15, n)) * np.exp(1j * rng.uniform(-0.4, 0.4, n))
    p_calc = rng.uniform(-3.0, 3.0, n)
    q_calc = rng.uniform(-2.0, 2.0, n)
    return v, p_calc, q_calc


@pytest.mark.parametrize("plaski", [True, False], ids=["start-plaski", "katy-rozbiezne"])
@pytest.mark.parametrize("z_pv", [True, False], ids=["z-wezlami-PV", "bez-wezlow-PV"])
@pytest.mark.parametrize("n", [1, 2, 5, 30], ids=["n1", "n2", "n5", "n30"])
def test_skladanie_blokowe_bit_w_bit_jak_petla_skalarna(n: int, z_pv: bool, plaski: bool) -> None:
    """Iloczyn cech {rozmiar} × {są węzły PV} × {start płaski / kąty rozbieżne}.

    Węzły PV są tu kluczowe: wtedy ``pq_indices`` jest WŁAŚCIWYM podzbiorem
    ``non_slack_indices``, więc w blokach mieszanych przekątna (warunek ``i == k``
    na indeksie WĘZŁA) nie leży na ``row == col``. Blok składany maską
    ``np.equal.outer`` musi trafić dokładnie tam, gdzie pętla wchodziła w gałąź
    ``if i == k`` — przesunięcie o jeden wiersz dałoby macierz podobną, ale inną.
    """
    rng = np.random.default_rng(1000 + n * 10 + int(z_pv) * 2 + int(plaski))
    rozmiar = n + 1
    ybus = _ybus_losowy(rng, rozmiar, gestosc=0.35)
    v, p_calc, q_calc = _stan_losowy(rng, rozmiar, plaski=plaski)

    non_slack = list(range(1, rozmiar))
    pq = [idx for pos, idx in enumerate(non_slack) if not (z_pv and pos % 2 == 0)]

    oczekiwany = _jakobian_skalarny(ybus, v, non_slack, pq, p_calc, q_calc)
    otrzymany = build_jacobian_v2(ybus, v, non_slack, pq, p_calc, q_calc)

    assert otrzymany.shape == oczekiwany.shape
    assert _rowne_bitowo(otrzymany, oczekiwany), (
        "Blokowe składanie jakobianu przestało być bitowo równoważne pętli skalarnej. "
        "Najczęstsza przyczyna: zmiana ścieżki SIMD np.sin/np.cos w nowej wersji numpy "
        "albo zmiana kolejności mnożeń w którymś bloku. NIE dopasowywać asercji — "
        "wynik rozpływu ma zostać niezmieniony."
    )


def test_brak_wezlow_pq_daje_bitowo_ten_sam_blok_zdegenerowany() -> None:
    """Przypadek brzegowy: sieć bez węzłów PQ (bloki J12/J21/J22 puste).

    Kształt zdegenerowany (n_q == 0) przechodzi w postaci blokowej przez inne
    rozgłaszanie niż zwykły, więc nie może zostać nieprzetestowany.
    """
    rng = np.random.default_rng(4242)
    ybus = _ybus_losowy(rng, 6, gestosc=0.5)
    v, p_calc, q_calc = _stan_losowy(rng, 6, plaski=False)
    non_slack = [1, 2, 3, 4, 5]

    oczekiwany = _jakobian_skalarny(ybus, v, non_slack, [], p_calc, q_calc)
    otrzymany = build_jacobian_v2(ybus, v, non_slack, [], p_calc, q_calc)

    assert otrzymany.shape == (5, 5)
    assert _rowne_bitowo(otrzymany, oczekiwany)


def test_galezie_nieobecne_w_ybus_daja_ten_sam_znak_zera() -> None:
    """Wyraz zerowy Y-bus: postać blokowa NIE pomija wyrazów, więc znak zera zgodny.

    Y-bus rzeczywistej sieci promieniowej jest skrajnie rzadki — to najliczniejsza
    klasa wyrazów jakobianu. Optymalizacja „nie licz, gdy g i b są zerem" wpisałaby
    tu ``+0.0`` z inicjalizacji, podczas gdy pętla liczy ``vm_i*vm_k*(0*sin - 0*cos)``
    i przy ujemnym sinusie otrzymuje ``-0.0``. Test porównuje wzorzec bitów, więc
    taka „niewinna" zmiana byłaby czerwona.
    """
    rozmiar = 8
    ybus = np.zeros((rozmiar, rozmiar), dtype=complex)
    for i in range(rozmiar - 1):  # łańcuch: sąsiedzi połączeni, reszta zerowa
        y = complex(1.0, -4.0)
        ybus[i, i + 1] = -y
        ybus[i + 1, i] = -y
        ybus[i, i] += y
        ybus[i + 1, i + 1] += y

    rng = np.random.default_rng(99)
    v, p_calc, q_calc = _stan_losowy(rng, rozmiar, plaski=False)
    non_slack = list(range(1, rozmiar))
    pq = list(range(1, rozmiar))

    oczekiwany = _jakobian_skalarny(ybus, v, non_slack, pq, p_calc, q_calc)
    otrzymany = build_jacobian_v2(ybus, v, non_slack, pq, p_calc, q_calc)

    assert _rowne_bitowo(otrzymany, oczekiwany)
    # Kontrola samego założenia testu: w tej macierzy REALNIE występują ujemne zera.
    zera_ujemne = np.signbit(oczekiwany) & (oczekiwany == 0.0)
    assert zera_ujemne.any(), (
        "Fikstura przestała wytwarzać -0.0 — test przestałby pilnować znaku zera; "
        "poprawić fiksturę, nie usuwać asercji."
    )


def _artefakt_biegu(run: object) -> str:
    """Kanoniczna postać PEŁNEGO artefaktu biegu: wynik + CAŁY ślad WHITE BOX.

    Świadomie NIE ograniczamy się do końcowych napięć: gdyby zmiana składania
    jakobianu przesunęła cokolwiek w środku iteracji (historia niedopasowań,
    ślad Y-bus, stan początkowy, kroki dowodowe), wynik końcowy mógłby się zgodzić
    po zaokrągleniu, a ślad — nie. Ślad jest częścią kontraktu (dowody, White Box),
    więc podlega tej samej bitowej identyczności co wynik.

    Liczby zmiennoprzecinkowe idą przez ``str``, które dla ``float``/``np.float64``
    daje najkrótszą postać round-trip — jest ona RÓŻNOWARTOŚCIOWA, więc dwie różne
    liczby podwójnej precyzji nigdy nie dadzą tego samego napisu.
    """
    artefakt = {
        "raw_result": getattr(run, "raw_result", None),
        "white_box_trace": getattr(run, "white_box_trace", None),
        "power_flow_trace": getattr(run, "power_flow_trace", None),
        "result_summary": getattr(run, "result_summary", None),
    }
    return json.dumps(artefakt, sort_keys=True, ensure_ascii=False, default=str)


def _bieg_z_migawki(snapshot: dict, snapshot_hash: str) -> object:
    """Przebieg PF o USTALONYCH identyfikatorach — inaczej ślad różniłby się run_id."""
    from datetime import UTC, datetime
    from uuid import UUID

    from enm.canonical_analysis import CanonicalRun

    return CanonicalRun(
        id=UUID("00000000-0000-4000-8000-000000000042"),
        case_id="case-pin-slad",
        project_id="proj-pin-slad",
        analysis_type="PF",
        status="FINISHED",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        snapshot_hash=snapshot_hash,
        input_hash="pin-slad",
        snapshot=snapshot,
        validation={},
        readiness={},
        options={},
    )


def _siec(nazwa: str) -> dict:
    from tests.reference_networks.builders import (
        build_gn01_sn_promieniowa,
        build_gn03_sn_pierscien,
        build_gn04_sn_nn_oze,
    )
    from tests.reference_networks.sld_substrate_52s import build_sld_substrate_52s

    budowniczy = {
        "promieniowa": build_gn01_sn_promieniowa,
        "pierscien": build_gn03_sn_pierscien,
        "sn-nn-oze": build_gn04_sn_nn_oze,
        "substrat-53-stacji": build_sld_substrate_52s,
    }[nazwa]
    return budowniczy()


@pytest.mark.parametrize(
    "siec",
    ["promieniowa", "pierscien", "sn-nn-oze", "substrat-53-stacji"],
)
def test_slad_white_box_biegu_bit_w_bit_przed_i_po_zmianie_skladania(siec: str) -> None:
    """PEŁNY artefakt biegu (wynik + ślad) identyczny dla obu postaci składania.

    „Przed" jest tu odtworzone dosłownie: produkcyjna funkcja zostaje podmieniona
    na referencyjną pętlę skalarną z tego pliku, czyli na stan sprzed karty
    N1-WYDAJNOSC. Porównanie obejmuje topologię PROMIENIOWĄ i OCZKOWĄ (pierścień) —
    w sieci oczkowej jakobian jest gęstszy, a iteracji zwykle więcej, więc
    ewentualny dryf ostatnich cyfr miałby się gdzie skumulować — oraz sieć z
    generacją rozproszoną (regulacja falownika) i substrat 53 stacji.
    """
    import network_model.solvers.power_flow_newton_internal as internal
    from enm.canonical_analysis import _execute_power_flow

    dane = _siec(siec)
    snapshot = dane["enm"]
    snapshot_hash = dane["snapshot_hash"]

    bieg_po = _bieg_z_migawki(snapshot, snapshot_hash)
    _execute_power_flow(bieg_po)
    artefakt_po = _artefakt_biegu(bieg_po)

    produkcyjny = internal.build_jacobian_v2
    internal.build_jacobian_v2 = _jakobian_skalarny  # type: ignore[assignment]
    try:
        bieg_przed = _bieg_z_migawki(snapshot, snapshot_hash)
        _execute_power_flow(bieg_przed)
        artefakt_przed = _artefakt_biegu(bieg_przed)
    finally:
        internal.build_jacobian_v2 = produkcyjny  # type: ignore[assignment]

    assert artefakt_przed, f"Sieć {siec}: bieg nie wytworzył artefaktu."
    assert artefakt_po == artefakt_przed, (
        f"Sieć {siec}: ślad WHITE BOX lub wynik biegu różni się między postacią "
        "skalarną a blokową składania jakobianu. Zmiana składania NIE jest wtedy "
        "neutralna i musi wrócić do pętli — nie wolno dopasowywać asercji."
    )
    # Kontrola samego testu: artefakt musi realnie zawierać historię iteracji,
    # inaczej porównywalibyśmy pustkę i pin nie pilnowałby niczego.
    slad = getattr(bieg_po, "power_flow_trace", None) or {}
    assert slad.get("iterations"), f"Sieć {siec}: ślad biegu nie zawiera historii iteracji."


def test_jakobian_realnego_biegu_substratu_53_stacji_bit_w_bit() -> None:
    """Pin na REALNYCH danych: Y-bus i stan z faktycznego biegu rozpływu substratu.

    Losowe macierze pokrywają strukturę, ale nie mają realnego rozrzutu rzędów
    wielkości (impedancje kabla i linii SN, transformatory SN/nN, szyny nN).
    Ten test bierze macierz z tej samej ścieżki, którą liczy produkcja.
    """
    from tests.reference_networks.sld_substrate_52s import build_sld_substrate_52s

    przechwycone: list[tuple] = []
    import network_model.solvers.power_flow_newton_internal as internal

    oryginalny = internal.build_jacobian_v2

    def _przechwytujacy(ybus, v, non_slack_indices, pq_indices, p_calc, q_calc):  # type: ignore[no-untyped-def]
        przechwycone.append(
            (
                ybus.copy(),
                v.copy(),
                list(non_slack_indices),
                list(pq_indices),
                p_calc.copy(),
                q_calc.copy(),
            )
        )
        return oryginalny(ybus, v, non_slack_indices, pq_indices, p_calc, q_calc)

    from datetime import UTC, datetime
    from uuid import uuid4

    from enm.canonical_analysis import CanonicalRun, _execute_power_flow

    substrat = build_sld_substrate_52s()
    bieg = CanonicalRun(
        id=uuid4(),
        case_id="case-pin-jakobian",
        project_id="proj-pin-jakobian",
        analysis_type="PF",
        status="FINISHED",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        snapshot_hash=substrat["snapshot_hash"],
        input_hash="pin-jakobian",
        snapshot=substrat["enm"],
        validation={},
        readiness={},
        options={},
    )

    internal.build_jacobian_v2 = _przechwytujacy  # type: ignore[assignment]
    try:
        _execute_power_flow(bieg)
    finally:
        internal.build_jacobian_v2 = oryginalny  # type: ignore[assignment]

    assert przechwycone, "Bieg rozpływu substratu nie złożył ani jednego jakobianu."
    for numer, (ybus, v, non_slack, pq, p_calc, q_calc) in enumerate(przechwycone):
        oczekiwany = _jakobian_skalarny(ybus, v, non_slack, pq, p_calc, q_calc)
        otrzymany = build_jacobian_v2(ybus, v, non_slack, pq, p_calc, q_calc)
        # Komunikat MUSI nazwać miejsce: czerwień tego pinu na innym procesorze raz
        # kosztowała pełny przebieg CI zgadywany „na oko" (2026-08-14). Diagnostyka
        # liczona dopiero po wykryciu różnicy, więc nie obciąża zielonego biegu.
        if not _rowne_bitowo(otrzymany, oczekiwany):
            rozne = np.argwhere(otrzymany.view(np.uint64) != oczekiwany.view(np.uint64))
            n_p = len(non_slack)
            opis = []
            for w, k in rozne[:5]:
                blok_nazwa = (
                    "J11"
                    if (w < n_p and k < n_p)
                    else "J12" if w < n_p else "J21" if k < n_p else "J22"
                )
                przekatna = (
                    "PRZEKĄTNA"
                    if non_slack[w % n_p] == (non_slack[k] if k < n_p else pq[k - n_p])
                    else "poza przekątną"
                )
                opis.append(
                    f"{blok_nazwa}[{w},{k}] ({przekatna}): blok={otrzymany[w, k]!r} "
                    f"vs skalar={oczekiwany[w, k]!r}"
                )
            raise AssertionError(
                f"Jakobian iteracji {numer} biegu substratu 53 stacji różni się bitowo "
                f"od postaci skalarnej w {len(rozne)} z {otrzymany.size} wyrazów. "
                f"Pierwsze różnice: {'; '.join(opis)}. "
                "Wejście trygonometryczne i wyrazy przekątniowe pochodzą z jednego "
                "źródła (trig_bloku, wyrazy_przekatne), więc różnica oznacza realną "
                "zmianę SPOSOBU SKŁADANIA — nie wolno dopasowywać asercji."
            )
