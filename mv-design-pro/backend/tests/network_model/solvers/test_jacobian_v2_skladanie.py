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

DLACZEGO PIN, A NIE SAMO ZAUFANIE: postać blokowa opiera się na założeniu o
BIBLIOTECE — że ``np.sin``/``np.cos`` policzone dla całej tablicy dają bit w bit to
samo, co wywołane skalarnie (na numpy 1.26.4 dają). To założenie o cudzym kodzie,
więc nie może zostać deklaracją w docstringu: gdyby przyszła wersja numpy zmieniła
ścieżkę SIMD dla funkcji trygonometrycznych, ten test ma zaświecić na czerwono.

ILOCZYN CECH (nie pojedynczy przykład): pokrycie obejmuje kombinacje
{blok kwadratowy ns×ns, bloki mieszane ns×pq i pq×ns, gdzie przekątna NIE leży na
``row == col``} × {sieć z węzłami PV, sieć bez PV} × {start płaski (wszystkie kąty
równe, ``theta == 0``), stan rozbieżnych kątów} × {gałęzie obecne i nieobecne w
Y-bus, czyli wyrazy zerowe} × {przypadki zdegenerowane: brak węzłów PQ, jeden węzeł}
× {realna macierz Y-bus substratu 53 stacji z realnego biegu rozpływu}.
"""

from __future__ import annotations

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
    """
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

    for row, i in enumerate(non_slack_indices):
        for col, k in enumerate(non_slack_indices):
            theta = v_ang[i] - v_ang[k]
            if i == k:
                j11[row, col] = -q_calc[i] - b[i, i] * v_mag[i] ** 2
            else:
                sin_t = np.sin(theta)
                cos_t = np.cos(theta)
                j11[row, col] = v_mag[i] * v_mag[k] * (g[i, k] * sin_t - b[i, k] * cos_t)

    for row, i in enumerate(non_slack_indices):
        for col, k in enumerate(pq_indices):
            theta = v_ang[i] - v_ang[k]
            if i == k:
                j12[row, col] = p_calc[i] / v_mag[i] + g[i, i] * v_mag[i]
            else:
                sin_t = np.sin(theta)
                cos_t = np.cos(theta)
                j12[row, col] = v_mag[i] * (g[i, k] * cos_t + b[i, k] * sin_t)

    for row, i in enumerate(pq_indices):
        for col, k in enumerate(non_slack_indices):
            theta = v_ang[i] - v_ang[k]
            if i == k:
                j21[row, col] = p_calc[i] - g[i, i] * v_mag[i] ** 2
            else:
                sin_t = np.sin(theta)
                cos_t = np.cos(theta)
                j21[row, col] = -v_mag[i] * v_mag[k] * (g[i, k] * cos_t + b[i, k] * sin_t)

    for row, i in enumerate(pq_indices):
        for col, k in enumerate(pq_indices):
            theta = v_ang[i] - v_ang[k]
            if i == k:
                j22[row, col] = q_calc[i] / v_mag[i] - b[i, i] * v_mag[i]
            else:
                sin_t = np.sin(theta)
                cos_t = np.cos(theta)
                j22[row, col] = v_mag[i] * (g[i, k] * sin_t - b[i, k] * cos_t)

    top = np.hstack([j11, j12])
    bottom = np.hstack([j21, j22])
    return np.vstack([top, bottom])


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
        assert _rowne_bitowo(otrzymany, oczekiwany), (
            f"Jakobian iteracji {numer} biegu substratu 53 stacji różni się bitowo "
            "od postaci skalarnej."
        )
