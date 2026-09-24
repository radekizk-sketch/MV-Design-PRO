"""Atrapy harnessu scen liczone z backendu (E2E-FULL-FIX-3, 2026-09-10).

JSON w `frontend/src/harness-fixtures/generated/` MUSI być równy świeżo
policzonej odpowiedzi (`scripts/eksport_fixtur_harnessu.py`) — rozjazd znaczy,
że kontrakt albo dane sceny się zmieniły, a zrzut do oceny pokazywałby stan
sprzed zmiany. Dwa uruchomienia dają identyczny wynik (determinizm atrapy).

PRZENOŚNOŚĆ MIĘDZY MASZYNAMI (2026-09-18). Fixtury powstają na maszynie sesji,
a porównanie liczy odpowiedź na runnerze CI. Repo ma dla tej klasy rozstrzygnięcie
(karty CI-PARYTET-3/4/5, `docs/evidence/CONVERGENCE_EVIDENCE.md`): surowy wynik
solvera NIE jest przenośny przy ŻADNEJ siatce kwantyzacji, bo BLAS/LAPACK dwóch
maszyn sumuje inaczej. Żądanie równości bit w bit od takich wielkości nie mierzy
zgodności fixtury z backendem, tylko szum numeryczny. Dlatego porównanie jest
rozdzielone na trzy warstwy, a każda ma własny, ZMIERZONY próg:

1. SZKIELET — zbiór kluczy, długości list, typy, `bool`, liczby całkowite,
   wartości nieliczbowe (etykiety, kody, jednostki, statusy) — DOKŁADNIE.
2. LICZBY — tolerancja WZGLĘDNA `RTOL_FIXTUR` plus pasmo martwe zera
   `PASMO_ZERA_FIXTUR` (oba wyprowadzone z pomiaru, uzasadnienie przy stałych).
   Tekst niosący liczby policzone (`POLA_TEKSTU_Z_LICZBAMI`) porównuje się po
   strukturze (dokładnie) i po liczbach (tą samą tolerancją), nie po napisie.
3. SKRÓTY NAD LICZBAMI NIEPRZENOŚNYMI (`POLA_SKROTOW_NIEPRZENOSNYCH`) — wychodzą
   z porównania międzymaszynowego, ale NIE z testu: sprawdzany jest kształt
   (prefiks i długość ciągu szesnastkowego, dokładnie), obecność i stabilność w
   obrębie jednej maszyny (`test_atrapa_jest_deterministyczna`).

Obie listy pól są ZAMKNIĘTE i przypięte self-testem
(`test_listy_pol_wylaczonych_sa_zamkniete`) — dopisanie pola jest świadomą
decyzją, nie cichym przyrostem.
"""

from __future__ import annotations

import importlib.util
import json
import re
from pathlib import Path
from typing import Any

import pytest
from enm.deklaracje_modulu import POLA_DEKLARACJI, DeklaracjeModulu
from enm.migrations.nn_field_specs_promocja import migruj as promuj_nn_field_specs
from enm.models import EnergyNetworkModel

_SKRYPT = Path(__file__).resolve().parents[2] / "scripts" / "eksport_fixtur_harnessu.py"
_spec = importlib.util.spec_from_file_location("eksport_fixtur_harnessu", _SKRYPT)
assert _spec is not None and _spec.loader is not None
eksport = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(eksport)


#: Tolerancja WZGLĘDNA liczb fixtur. POMIAR (CI run 35290801270, job `pytest`,
#: commit 8d795200 — 7 czerwonych przy 15 878 zielonych): największa zmierzona
#: rozbieżność międzymaszynowa to `estymacja $.measurements[9].normalized_residual`
#: 1.4209582645767669 (sesja) vs 1.4209749416592783 (runner) = 1,2·10⁻⁵ względnie;
#: druga co do wielkości `$.measurements[5].normalized_residual` = 6,8·10⁻⁶,
#: `$.white_box[2].gain_matrix_g[0][4]` = 1,2·10⁻⁶. Próg 1·10⁻⁴ to zapas ×8,5 nad
#: zmierzonym maksimum (limit karty: ×10). Rozwiązanie WLS jest najczulszą
#: wielkością tego zbioru (residuum znormalizowane dzieli się przez pierwiastek
#: kowariancji residuum, która przy niskiej redundancji lokalnej dąży do zera) —
#: gdyby przyszły bieg CI przekroczył ten próg, odpowiedzią NIE jest podniesienie
#: progu, tylko pytanie, czy ta wielkość ma prawo być w fiksturze.
RTOL_FIXTUR = 1e-4

#: Pasmo martwe zera (bezwzględne). POMIAR: największe zmierzone „zero numeryczne”
#: między maszynami to człon 1,27454e-09 w śladzie składowych
#: (`skladowe $.white_box_trace[2].substitution`: 5,11591e-13 na sesji wobec
#: 1,27454e-09 na runnerze, OBOK członu −j 10162,6 w tym samym wyrażeniu) — obie
#: wartości są fizycznie zerem części rzeczywistej Z₀. Pasmo 1·10⁻⁸ to zapas ×7,8
#: nad tym pomiarem (limit karty: ×10) i ×43 nad najgorszą różnicą sondy szumu
#: BLAS (`zwarcia $.branch_flow_trace[].result.i_contrib_a`: 2,3·10⁻¹⁰).
#: Pasmo obowiązuje tylko wtedy, gdy OBIE wartości w nim leżą — 1e-9 wobec 5,0 to
#: nadal różnica. Poprzednie 1e-6 było o dwa rzędy ZA SZEROKIE: zrównywało z zerem
#: realne współczynniki katalogowe tablic łuku (`arcflash
#: $.coefficient_table.incident_energy.VOA|V2700.k[6]` = 8,346e-07).
PASMO_ZERA_FIXTUR = 1e-8

#: Pasmo BEZWZGLEDNE dla wielkosci BEZWYMIAROWYCH OGRANICZONYCH (ilorazow o
#: naturalnej skali 1). POWOD, NIE WYGODA: dla takiej wielkosci tolerancja
#: WZGLEDNA jest zlym przyrzadem, gdy licznik ilorazu daza do zera przy skonczonym
#: mianowniku — `cos phi` galezi niosacej praktycznie sama moc bierna wychodzi
#: rzedu 1e-7 i jego blad wzgledny jest nieograniczony, choc bezwzgledny jest
#: znikomy. POMIAR (CI run 35305960018, job `pytest`, commit 07d93d01):
#: `koordynacja $.rows[2].cos_phi` 3.9231140792499414e-07 (sesja) wobec
#: 3.923647677786405e-07 (runner) = 5,336e-11 BEZWZGLEDNIE (1,36e-4 wzglednie,
#: tuz nad RTOL). Pasmo 1e-9 to zapas x18,7 nad tym pomiarem.
#: DLACZEGO TO NIE OSLEPIA TESTU: regula dziala jako ALTERNATYWA obok tolerancji
#: wzglednej, wiec jedyne, co traci porownanie, to czulosc PONIZEJ 1e-9 W
#: WARTOSCI BEZWZGLEDNEJ — piec rzedow ponizej czwartego miejsca po przecinku,
#: ktore te wielkosci pokazuja na ekranie, i osiem rzedow ponizej progow
#: normowych (cos phi 0,90/0,95). Zadna realna regresja nie miesci sie ponizej.
PASMO_BEZWYMIAROWYCH = 1e-9

#: Pola z klasy wyzej. Lista ZAMKNIETA — pin: `test_listy_pol_wylaczonych_sa_zamkniete`.
#: Czlonkostwo rozstrzyga DEFINICJA wielkosci (iloraz ograniczony do [-1, 1]),
#: nie zaobserwowany zakres w fiksturach:
#:   * `cos_phi` = P/S, |cos phi| <= 1 z definicji;
#:   * `fraction` = udzial, [0, 1] z definicji (dzis 1,6e-17, czyli i tak w pasmie
#:     zera — wchodzi jako czlonek KLASY, nie jako lata na dzisiejsza wartosc);
#:   * `voltage_unbalance_u2_u1` = U2/U1, [0, 1] z definicji (dzis 0,0).
#: SWIADOMIE POZA LISTA: `rx_ratio` (R/X bywa > 1, nie jest ograniczony),
#: `iq_bierny_pu` (prad w jednostkach wzglednych moze przekroczyc 1 w przeciazeniu)
#: — dla nich naturalna skala to ich wlasna wartosc, wiec tolerancja wzgledna jest
#: przyrzadem wlasciwym.
POLA_BEZWYMIAROWE_OGRANICZONE: frozenset[str] = frozenset(
    {
        "cos_phi",
        "fraction",
        "voltage_unbalance_u2_u1",
    }
)

#: Pola, których wartość jest SKRÓTEM policzonym nad liczbami nieprzenośnymi
#: (wynik solvera). Lista ZAMKNIĘTA — pin: `test_listy_pol_wylaczonych_sa_zamkniete`.
#: Źródła: (a) tabela pomiaru CI 35290801270 (`result_hash`, `export_ref`,
#: `deterministic_signature`, `analysis_case_context.reproducibility.result_hash`);
#: (b) sonda szumu BLAS (szum względny 1e-12 wstrzyknięty w wyniki `np.linalg.*`,
#: deterministyczny jako funkcja WEJŚCIA) na komplecie fixtur — rozjechały się
#: dokładnie te pola i żadne inne.
#: ŚWIADOMIE POZA LISTĄ: `input_hash`, `snapshot_hash`, `snapshot_ref`, `enm_hash`,
#: `model_hash`, `options_hash`, `solver_input_hash`, `catalog_fingerprint`,
#: `catalog_materialization_hash`, `hash_sha256`, `semantic_fingerprint`,
#: `effect_signature`, `deterministic_id`, `snapshot_id` — to skróty nad WEJŚCIEM;
#: sonda nie ruszyła ich przy 1e-12 i bieg CI ich nie zgłosił. Są najsilniejszym
#: sygnałem, jaki ten test ma (dryf danych wejściowych), więc ich wyłączenie
#: oślepiłoby go na realną regresję.
POLA_SKROTOW_NIEPRZENOSNYCH: frozenset[str] = frozenset(
    {
        "analysis_id",
        "deterministic_hash",
        "deterministic_signature",
        "estimate_id",
        "export_ref",
        "proof_hash",
        "proof_id",
        "proof_ref",
        "report_hash",
        "report_id",
        "report_ref",
        "result_hash",
        "source_proof_hash",
        "source_result_hash",
        "value",
    }
)

#: Pola tekstowe niosące liczby POLICZONE (ślad White Box, uzasadnienia, etykiety
#: metryk raportu). Porównanie: struktura napisu DOKŁADNIE, liczby w napisie tą
#: samą tolerancją co liczby JSON — człon numerycznie zerowy nie może wywracać
#: porównania. Lista ZAMKNIĘTA — pin: `test_listy_pol_wylaczonych_sa_zamkniete`.
#: Pomiar: skan kompletu fixtur po kluczach tekstowych niosących liczbę o ≥4
#: cyfrach znaczących albo w notacji wykładniczej. Reguła NIE jest globalna dla
#: wszystkich napisów, bo identyfikatory bywają mylone z liczbami (fragment UUID
#: `…-5e63-…` jest poprawnym literałem zmiennoprzecinkowym, `31.12.2026` datą) —
#: poza tą listą napisy porównuje się DOKŁADNIE.
POLA_TEKSTU_Z_LICZBAMI: frozenset[str] = frozenset(
    {
        "description_pl",
        "latex",
        "result_pl",
        "slad_pl",
        "substitution",
        "substitution_latex",
        "substitution_pl",
        "tekst",
        "uzasadnienie_pl",
        "value",
        "wartosc_pl",
        "why_pl",
        "wiodacy_opis_pl",
        "wscr_why_pl",
        "z_tk_formula_latex",
    }
)

#: Ciąg szesnastkowy skrótu w napisie (goły albo po prefiksie rodzaju, np.
#: `proof:short-circuit:<64hex>`, `report:v126:<rodzaj>:<16hex>`).
_HEX_SKROTU = re.compile(r"[0-9a-f]{16,}")
#: Literał liczbowy w tekście. Odgrodzony z obu stron od znaków alfanumerycznych i
#: kropki, żeby `15kv`, `v1.2.3` ani `lvrt_conv-pv-1mw` nie były czytane jak liczby.
_LICZBA_W_TEKSCIE = re.compile(
    r"(?<![0-9A-Za-z_.])[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?(?![0-9A-Za-z_])"
)
#: UUID w tekście — jego fragmenty bywają poprawnymi literałami liczbowymi
#: (`c767-5e63-8e7e`), więc leżące w nim „liczby” są częścią SZKIELETU napisu.
_UUID_W_TEKSCIE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE
)


def liczby_rowne(a: float, b: float, klucz: str | None = None) -> bool:
    """Równość liczb w klasie przenośności: pasmo martwe zera, pasmo wielkości
    bezwymiarowych ograniczonych (tylko dla pól tej klasy) albo tolerancja względna."""
    if a == b:
        return True
    if abs(a) <= PASMO_ZERA_FIXTUR and abs(b) <= PASMO_ZERA_FIXTUR:
        return True
    if klucz in POLA_BEZWYMIAROWE_OGRANICZONE and abs(a - b) <= PASMO_BEZWYMIAROWYCH:
        return True
    return abs(a - b) <= RTOL_FIXTUR * max(abs(a), abs(b))


def szkielet_skrotu(tekst: str) -> str:
    """Napis ze skrótami zastąpionymi znacznikiem DŁUGOŚCI — prefiks rodzaju
    (`proof:short-circuit:` wobec `proof:power-flow:`) i długość ciągu zostają
    porównywane dokładnie, treść skrótu wypada."""
    return _HEX_SKROTU.sub(lambda m: f"<{len(m.group(0))}hex>", tekst)


def _rozbij_tekst(tekst: str) -> tuple[str, list[str]]:
    """(szkielet napisu, literały liczbowe) — liczby w UUID zostają w szkielecie."""
    zakazane = [m.span() for m in _UUID_W_TEKSCIE.finditer(tekst)]
    szkielet: list[str] = []
    liczby: list[str] = []
    koniec = 0
    for m in _LICZBA_W_TEKSCIE.finditer(tekst):
        if any(p <= m.start() and m.end() <= k for p, k in zakazane):
            continue
        szkielet.append(tekst[koniec : m.start()])
        szkielet.append("\x00")
        liczby.append(m.group(0))
        koniec = m.end()
    szkielet.append(tekst[koniec:])
    return "".join(szkielet), liczby


def _roznice_w_tekscie(zloty: str, teraz: str, sciezka: str, klucz: str | None = None) -> list[str]:
    szkielet_a, liczby_a = _rozbij_tekst(zloty)
    szkielet_b, liczby_b = _rozbij_tekst(teraz)
    if szkielet_a != szkielet_b:
        return [f"{sciezka}: struktura tekstu {zloty!r} != {teraz!r}"]
    return [
        f"{sciezka}: liczba w tekście {a} != {b} (poza tolerancją; {zloty!r} != {teraz!r})"
        for a, b in zip(liczby_a, liczby_b, strict=True)
        if not liczby_rowne(float(a), float(b), klucz)
    ]


def roznice_z_tolerancja(
    zloty: object, teraz: object, sciezka: str = "$", klucz: str | None = None
) -> list[str]:
    """Lista ścieżek, na których fixtura z repo różni się od odpowiedzi backendu."""
    if isinstance(zloty, bool) or isinstance(teraz, bool):
        # `bool` jest częścią kontraktu (True != 1): typ i wartość dokładnie.
        if type(zloty) is type(teraz) and zloty == teraz:
            return []
        return [f"{sciezka}: {zloty!r} != {teraz!r}"]
    if isinstance(zloty, int | float) and isinstance(teraz, int | float):
        if isinstance(zloty, int) and isinstance(teraz, int):
            return [] if zloty == teraz else [f"{sciezka}: {zloty!r} != {teraz!r}"]
        if liczby_rowne(float(zloty), float(teraz), klucz):
            return []
        return [f"{sciezka}: {zloty!r} != {teraz!r} (poza tolerancją)"]
    if isinstance(zloty, dict) and isinstance(teraz, dict):
        if set(zloty) != set(teraz):
            return [f"{sciezka}: klucze {sorted(set(zloty) ^ set(teraz))}"]
        return [
            r for k in zloty for r in roznice_z_tolerancja(zloty[k], teraz[k], f"{sciezka}.{k}", k)
        ]
    if isinstance(zloty, list) and isinstance(teraz, list):
        if len(zloty) != len(teraz):
            return [f"{sciezka}: długość listy {len(zloty)} != {len(teraz)}"]
        return [
            r
            for i, (a, b) in enumerate(zip(zloty, teraz, strict=True))
            for r in roznice_z_tolerancja(a, b, f"{sciezka}[{i}]", klucz)
        ]
    if isinstance(zloty, str) and isinstance(teraz, str):
        if (
            klucz in POLA_SKROTOW_NIEPRZENOSNYCH
            and _HEX_SKROTU.search(zloty)
            and _HEX_SKROTU.search(teraz)
        ):
            # Skrót nad liczbami nieprzenośnymi: kształt dokładnie, treść poza
            # porównaniem międzymaszynowym (stabilność lokalna pilnuje determinizm).
            if szkielet_skrotu(zloty) == szkielet_skrotu(teraz):
                return []
            return [f"{sciezka}: kształt skrótu {zloty!r} != {teraz!r}"]
        if klucz in POLA_TEKSTU_Z_LICZBAMI:
            return _roznice_w_tekscie(zloty, teraz, sciezka, klucz)
    return [] if zloty == teraz else [f"{sciezka}: {zloty!r} != {teraz!r}"]


def test_roznice_z_tolerancja_rozroznia_szum_od_regresji() -> None:
    """Pin komparatora: szum ostatnich cyfr przechodzi, zmiana kształtu/typu/tekstu
    i różnica ponad tolerancję — nie (deklaracja bez testu = fałszywa pewność)."""
    assert roznice_z_tolerancja({"a": [8.913153836959333]}, {"a": [8.913153836847659]}) == []
    assert roznice_z_tolerancja(1.0, 1.0 + 5e-6) == []
    assert roznice_z_tolerancja(1.0, 1.0 + 2e-4) != []
    assert roznice_z_tolerancja({"a": 1}, {"a": 1.0}) == []
    assert roznice_z_tolerancja(True, 1) != []
    assert roznice_z_tolerancja({"a": 1}, {"b": 1}) != []
    assert roznice_z_tolerancja([1, 2], [1]) != []
    assert roznice_z_tolerancja("x", "y") != []
    assert roznice_z_tolerancja(None, 0.0) != []
    # Para z POMIARU CI 35290801270 — dokładnie ta, która zapalała test.
    assert roznice_z_tolerancja(1.4209582645767669, 1.4209749416592783) == []
    assert roznice_z_tolerancja(-1404211.347412109, -1404209.641607789) == []
    # 1 % to nadal regresja, nie szum — także na wartości ujemnej i w liście.
    assert roznice_z_tolerancja([1.4209582645767669], [1.4209582645767669 * 1.01]) != []
    assert roznice_z_tolerancja(-1404211.347412109, -1404211.347412109 * 0.99) != []


def test_pasmo_zera_nie_polyka_wartosci_kontraktowych() -> None:
    """Pasmo martwe działa TYLKO wtedy, gdy obie wartości w nim leżą. Iloczyn cech:
    {zero × zero, zero × wartość, parametr solvera × parametr solvera} — parametr
    `tolerance_used = 1e-8` jest wartością kontraktu, nie szumem, więc jego zmiana
    o rząd wielkości musi być czerwona."""
    assert roznice_z_tolerancja(5.11591e-13, 1.27454e-09) == []
    assert roznice_z_tolerancja(0.0, 9.9e-09) == []
    assert roznice_z_tolerancja(-8e-09, 7e-09) == []
    assert roznice_z_tolerancja(1e-09, 5.0) != []
    assert roznice_z_tolerancja(1e-08, 1e-06) != []
    assert roznice_z_tolerancja({"tolerance_used": 1e-08}, {"tolerance_used": 0.0}) == []
    assert roznice_z_tolerancja({"tolerance_used": 1e-08}, {"tolerance_used": 1e-05}) != []


def test_skroty_nieprzenosne_porownywane_po_ksztalcie_a_nie_po_tresci() -> None:
    """Iloczyn cech: {pole na liście, pole spoza listy} × {inna treść skrótu, inny
    prefiks rodzaju, inna długość, brak pola, wartość nie będąca skrótem}."""
    a, b = "a" * 64, "b" * 64  # dwa różne skróty tej samej długości
    assert roznice_z_tolerancja({"result_hash": a}, {"result_hash": b}) == []
    assert (
        roznice_z_tolerancja(
            {"proof_ref": f"proof:short-circuit:{a}"}, {"proof_ref": f"proof:short-circuit:{b}"}
        )
        == []
    )
    # Rodzaj dowodu i długość skrótu to KSZTAŁT — porównywane dokładnie.
    assert (
        roznice_z_tolerancja(
            {"proof_ref": f"proof:short-circuit:{a}"}, {"proof_ref": f"proof:power-flow:{b}"}
        )
        != []
    )
    assert (
        roznice_z_tolerancja(
            {"proof_id": f"proof:v126:ssci:{'a' * 16}"}, {"proof_id": f"proof:v126:ssci:{'b' * 64}"}
        )
        != []
    )
    # Brak pola i pole puste to nie „inny skrót”, tylko regresja kontraktu.
    assert roznice_z_tolerancja({"result_hash": a}, {"result_hash": None}) != []
    assert roznice_z_tolerancja({"result_hash": a}, {"inny": a}) != []
    assert roznice_z_tolerancja({"result_hash": a}, {"result_hash": ""}) != []
    # Skrót pod polem SPOZA listy (wejściowy) — porównywany dokładnie.
    assert roznice_z_tolerancja({"input_hash": a}, {"input_hash": b}) != []
    assert roznice_z_tolerancja({"snapshot_hash": a}, {"snapshot_hash": b}) != []
    assert roznice_z_tolerancja({"enm_hash": a}, {"enm_hash": b}) != []
    # `value` metryki raportu niesie i skróty, i zwykły tekst — reguła skrótu
    # włącza się WYŁĄCZNIE dla wartości o kształcie skrótu.
    assert roznice_z_tolerancja({"value": a}, {"value": b}) == []
    assert roznice_z_tolerancja({"value": "5 pozycji"}, {"value": "6 pozycji"}) != []
    assert roznice_z_tolerancja({"value": "zgodny"}, {"value": "niezgodny"}) != []


def test_tekst_sladu_porownywany_po_strukturze_i_liczbach() -> None:
    """Iloczyn cech: {człon zerowy, liczba znacząca, etykieta, jednostka, UUID} ×
    {pole na liście tekstów, pole spoza listy}. Para bazowa jest POMIAREM z CI
    35290801270 (`skladowe $.white_box_trace[2].substitution`)."""
    sesja = r"\left(0.0541396 + j 1.06265\right) + \left(5.11591e-13 - j 10162.6\right)"
    runner = r"\left(0.0541396 + j 1.06265\right) + \left(1.27454e-09 - j 10162.6\right)"
    assert roznice_z_tolerancja({"substitution": sesja}, {"substitution": runner}) == []
    assert roznice_z_tolerancja({"substitution_latex": sesja}, {"substitution_latex": runner}) == []
    # Liczba znacząca zmieniona o 1 % — czerwone mimo identycznej struktury.
    assert (
        roznice_z_tolerancja(
            {"substitution": sesja}, {"substitution": sesja.replace("10162.6", "10264.2")}
        )
        != []
    )
    # Zmiana etykiety/jednostki/operatora to zmiana STRUKTURY — czerwone.
    assert (
        roznice_z_tolerancja(
            {"substitution": sesja},
            {"substitution": sesja.replace(r"+ j 1.06265", r"- j 1.06265")},
        )
        != []
    )
    assert (
        roznice_z_tolerancja(
            {"result_pl": "Impedancja przy 1.0 Hz: 1.6434 Ω"},
            {"result_pl": "Impedancja przy 1.0 Hz: 1.6434 mΩ"},
        )
        != []
    )
    assert (
        roznice_z_tolerancja(
            {"wartosc_pl": "SPELNIONA — prog = 0.448 kA"},
            {"wartosc_pl": "NIESPELNIONA — prog = 0.448 kA"},
        )
        != []
    )
    # Identyfikator w tekście nie jest liczbą, choć jego fragment nią wygląda.
    uuid_a = "296d2c10-c767-5e63-8e7e-c4130fb47b94"
    uuid_b = "296d2c10-c767-5e64-8e7e-c4130fb47b94"
    assert roznice_z_tolerancja({"tekst": f"bieg {uuid_a}"}, {"tekst": f"bieg {uuid_b}"}) != []
    # Ten sam napis pod kluczem SPOZA listy — porównywany dokładnie.
    assert roznice_z_tolerancja({"opis": sesja}, {"opis": runner}) != []


def test_listy_pol_wylaczonych_sa_zamkniete() -> None:
    """Obie listy są ZAMKNIĘTE: dopisanie pola musi być świadomą zmianą tego pinu,
    nie cichym przyrostem (deklaracja bez testu = fałszywa pewność)."""
    assert POLA_SKROTOW_NIEPRZENOSNYCH == {
        "analysis_id",
        "deterministic_hash",
        "deterministic_signature",
        "estimate_id",
        "export_ref",
        "proof_hash",
        "proof_id",
        "proof_ref",
        "report_hash",
        "report_id",
        "report_ref",
        "result_hash",
        "source_proof_hash",
        "source_result_hash",
        "value",
    }
    assert POLA_TEKSTU_Z_LICZBAMI == {
        "description_pl",
        "latex",
        "result_pl",
        "slad_pl",
        "substitution",
        "substitution_latex",
        "substitution_pl",
        "tekst",
        "uzasadnienie_pl",
        "value",
        "wartosc_pl",
        "why_pl",
        "wiodacy_opis_pl",
        "wscr_why_pl",
        "z_tk_formula_latex",
    }
    assert POLA_BEZWYMIAROWE_OGRANICZONE == {
        "cos_phi",
        "fraction",
        "voltage_unbalance_u2_u1",
    }
    # Wielkości, dla których naturalną skalą jest ich WŁASNA wartość, nie 1 —
    # pasmo bezwzględne byłoby dla nich błędnym przyrządem.
    assert POLA_BEZWYMIAROWE_OGRANICZONE.isdisjoint(
        {"b_siemens_per_km", "iq_bierny_pu", "losses_p_mw", "rx_ratio", "tau_s"}
    )
    # Skróty nad WEJŚCIEM nigdy nie wchodzą na listę wyłączeń — to jedyny sygnał
    # dryfu danych wejściowych, jaki ten test ma.
    assert POLA_SKROTOW_NIEPRZENOSNYCH.isdisjoint(
        {
            "catalog_fingerprint",
            "catalog_materialization_hash",
            "enm_hash",
            "hash_sha256",
            "input_hash",
            "model_hash",
            "options_hash",
            "snapshot_hash",
            "snapshot_ref",
            "solver_input_hash",
        }
    )


def test_pasmo_bezwymiarowych_dziala_tylko_dla_swojej_klasy_i_tylko_przy_zerze() -> None:
    """Pin klasy „iloraz ograniczony blisko zera".

    Pomiar z CI (run 35305960018): `cos_phi` galezi niosacej praktycznie sama moc
    bierna rozjechal sie o 5,3e-11 BEZWZGLEDNIE, czyli 1,36e-4 wzglednie — tuz nad
    RTOL. Test pilnuje CZTERECH wlasnosci naraz, bo kazda z nich osobno da sie
    spelnic zla poprawka: (1) szum przechodzi, (2) realna zmiana tej samej
    wielkosci nadal pada, (3) pasmo NIE jest globalne — to samo zestawienie liczb
    na polu spoza klasy pada, (4) blisko jednosci czulosc jest nienaruszona.
    """
    # (1) zmierzona para z CI — szum, nie regresja.
    sesja, runner = 3.9231140792499414e-07, 3.923647677786405e-07
    assert liczby_rowne(sesja, runner, "cos_phi")

    # (2) realna zmiana wielkosci blisko zera (1e-3 to juz inny stan galezi) pada.
    assert not liczby_rowne(sesja, 1.0e-3, "cos_phi")

    # (3) pasmo jest ZWIAZANE Z KLUCZEM: ta sama para na polu spoza klasy pada,
    #     bo dla wielkosci o wlasnej skali tolerancja wzgledna jest wlasciwa.
    assert not liczby_rowne(sesja, runner, "rx_ratio")
    assert not liczby_rowne(sesja, runner, None)

    # (4) blisko jednosci pasmo bezwzgledne niczego nie rozluznia — rzadzi RTOL.
    assert liczby_rowne(0.95, 0.95 * (1 + 0.5 * RTOL_FIXTUR), "cos_phi")
    assert not liczby_rowne(0.95, 0.95 * (1 + 2 * RTOL_FIXTUR), "cos_phi")

    # (5) zapas nad pomiarem jest taki, jak deklaruje komentarz stalej.
    assert PASMO_BEZWYMIAROWYCH / abs(runner - sesja) > 10.0


@pytest.mark.parametrize("nazwa", sorted(eksport.FIXTURY))
def test_json_w_repo_rowny_odpowiedzi_backendu(nazwa: str) -> None:
    sciezka = eksport.FIXTURES_DIR / f"{nazwa}.json"
    assert sciezka.exists(), f"brak {sciezka} — uruchom scripts/eksport_fixtur_harnessu.py"
    roznice = roznice_z_tolerancja(
        json.loads(sciezka.read_text(encoding="utf-8")), eksport.FIXTURY[nazwa]()
    )
    assert roznice == [], "\n".join(roznice)


def _skroty_nieprzenosne(
    dane: object, sciezka: str = "$", klucz: str | None = None
) -> dict[str, str]:
    """Wszystkie wartości pól z `POLA_SKROTOW_NIEPRZENOSNYCH` o kształcie skrótu."""
    if isinstance(dane, dict):
        znalezione: dict[str, str] = {}
        for k, v in dane.items():
            znalezione.update(_skroty_nieprzenosne(v, f"{sciezka}.{k}", k))
        return znalezione
    if isinstance(dane, list):
        znalezione = {}
        for i, v in enumerate(dane):
            znalezione.update(_skroty_nieprzenosne(v, f"{sciezka}[{i}]", klucz))
        return znalezione
    if isinstance(dane, str) and klucz in POLA_SKROTOW_NIEPRZENOSNYCH and _HEX_SKROTU.search(dane):
        return {sciezka: dane}
    return {}


@pytest.mark.parametrize("nazwa", sorted(eksport.FIXTURY))
def test_atrapa_jest_deterministyczna(nazwa: str) -> None:
    pierwsze = eksport.FIXTURY[nazwa]()
    drugie = eksport.FIXTURY[nazwa]()
    assert pierwsze == drugie
    # Skróty wyłączone z porównania MIĘDZYMASZYNOWEGO nie znikają z testu: w
    # obrębie jednej maszyny dwa kolejne wyliczenia dają ten sam skrót, a jego
    # kształt jest pinowany z pomiaru (16 znaków hex dla identyfikatorów
    # `proof:v126:…`/`report:v126:…`, 64 dla skrótów pełnych).
    skroty_a = _skroty_nieprzenosne(pierwsze)
    skroty_b = _skroty_nieprzenosne(drugie)
    assert skroty_a == skroty_b
    for sciezka, wartosc in skroty_a.items():
        dlugosci = {len(m.group(0)) for m in _HEX_SKROTU.finditer(wartosc)}
        assert dlugosci <= {16, 64}, (nazwa, sciezka, wartosc)


def test_fixtury_niosa_skroty_nieprzenosne() -> None:
    """Pin inwentarza: pola wyłączone z porównania międzymaszynowego MUSZĄ w
    fikstrach realnie występować. Gdyby zniknęły, lista wyłączeń stałaby się
    martwa i milcząco osłabiałaby test przy następnym ich powrocie."""
    obecne: set[str] = set()
    for sciezka in sorted(eksport.FIXTURES_DIR.glob("*.json")):
        dane = json.loads(sciezka.read_text(encoding="utf-8"))
        obecne.update(
            klucz.rsplit(".", 1)[-1].split("[")[0] for klucz in _skroty_nieprzenosne(dane)
        )
    # POMIAR 2026-09-18 na komplecie fixtur repo (69 plików). 2026-09-24 (Pakiet D2, luka
    # §5.2): skróty sekcji wniosku i studium liczone nad sekcją skwantyzowaną
    # (`kontrakt_liczb.kwantyzuj_kontrakt`) — sonda szumu BLAS na 90 fixturach nie rusza
    # żadnego z nich, więc nie ma ich na tej liście (porównanie dokładne).
    assert obecne == {
        "analysis_id",
        "deterministic_hash",
        "deterministic_signature",
        "estimate_id",
        "export_ref",
        "proof_hash",
        "proof_id",
        "proof_ref",
        "report_hash",
        "report_id",
        "report_ref",
        "result_hash",
        "source_proof_hash",
        "source_result_hash",
        "value",
    }


def test_zgodnosc_przekrojowa_ma_ksztalt_trasy() -> None:
    """Ten sam kształt co `run_ncrfg_compliance_from_model` (api/ncrfg_ptpiree_tests.py):
    koperta biegu (`NcRfgPtpireeRunResponse` — rekordy testów + ocena wymagań, karta AB-1a
    Pakiet C) opakowana per przypadek — solver kanoniczny, numeracja T01–T20, źródło danych
    zatwierdzony model, dowód certyfikatu wyprowadzony przez serwer z wykazu PTPiREE."""
    odpowiedz = eksport.zgodnosc_przekrojowa_sceny_macierz()
    assert set(odpowiedz) == {
        "case_id",
        "operator_id",
        "der_count",
        "pominiete",
        "certyfikaty_odrzucone",
        "bieg",
    }
    assert odpowiedz["case_id"] == eksport.CASE_ID_HARNESSU
    assert odpowiedz["operator_id"] == eksport.OPERATOR_SCENY_MACIERZ
    assert odpowiedz["pominiete"] == [] and odpowiedz["certyfikaty_odrzucone"] == []
    bieg = odpowiedz["bieg"]
    assert bieg is not None
    assert bieg["contract"] == "NcRfgPtpireeTestResultV2"
    # HARNESS-RESZTA-2: oczekiwania wyprowadzone Z MODELU sceny (zbudowanego
    # operacjami domenowymi), nie z listy gotowych modułów przepisanej obok —
    # referencje i napięcia nadaje domena, a nie autor testu.
    model = eksport.enm_sceny_macierz()
    napiecia = {szyna.ref_id: szyna.voltage_kv for szyna in model.buses}
    oczekiwane = {
        generator.ref_id: (
            round(generator.p_mw * 1000.0, 6),
            napiecia[generator.bus_ref],
        )
        for generator in model.generators
    }
    assert odpowiedz["der_count"] == len(bieg["modules"]) == len(oczekiwane)
    assert [o["der_ref"] for o in bieg["ocena_wymagan"]] == [m["der_ref"] for m in bieg["modules"]]
    for modul in bieg["modules"]:
        p_max_kw, voltage_kv = oczekiwane[modul["der_ref"]]
        assert modul["p_max_kw"] == pytest.approx(p_max_kw)
        assert modul["voltage_kv"] == pytest.approx(voltage_kv)
        # Klasa modułu z jednej klasyfikacji backendu (progi WOS) — scena zasiewa moduły B.
        assert modul["module_type"] == modul["klasyfikacja"]["modul"] == "B"
        assert modul["zrodlo_danych"] == "ZATWIERDZONY_MODEL"
        assert {test["test_id"] for test in modul["tests"]} == {f"T{i:02d}" for i in range(1, 21)}
        assert {t["verdict"] for t in modul["tests"]} <= {"pass", "fail", "no_data", "not_required"}
        assert all(
            t["summary_pl"] == t["ocena"]["wyjasnienie"]["zdanie_pl"] for t in modul["tests"]
        )
    for pole in ("reporting_status", "proof_status", "evidence_by_test", "certificate_evidence"):
        assert pole not in bieg
    # Certyfikat PTPiREE z REALNEGO katalogu: falownik PV z wykazu PTPiREE ma dowód z rekordu
    # rejestru, magazyn spoza wykazu — nie ma (i jest poza NC RfG, O-28). Moduły rozpoznawane
    # po technologii Z MODELU (`gen_type`), nie po ręcznej etykiecie.
    technologia = {generator.ref_id: generator.gen_type for generator in model.generators}
    moduly = {m["der_ref"]: m for m in bieg["modules"]}
    for der_ref, rodzaj in technologia.items():
        if rodzaj == "pv_inverter":
            assert moduly[der_ref]["dowod_certyfikatu"]["numer_dokumentu"]
            assert moduly[der_ref]["technologia"] == "PPM"
        else:
            assert moduly[der_ref]["dowod_certyfikatu"] is None
            assert moduly[der_ref]["technologia"] == "MAGAZYN"


def test_werdykt_bez_biegow_jest_niesprawdzony() -> None:
    """Scena `uwaga` zasiewa rozpływ tylko w kliencie — backend biegu nie zna."""
    werdykt = eksport.werdykt_projektowy_sceny_uwaga()
    assert werdykt["case_id"] == eksport.CASE_ID_HARNESSU
    assert werdykt["werdykt"] == "NIESPRAWDZONE"
    assert werdykt["podsumowanie"]["naruszone"] == 0
    assert all(
        pozycja["stan"] in {"NIESPRAWDZONE", "NIE_DOTYCZY"} for pozycja in werdykt["pozycje"]
    )


# ---------------------------------------------------------------------------
# Karta B02-BE-TESTY §6 — katalog analiz V12.6, gotowość, werdykt (ocena/przekroczenia)
# ---------------------------------------------------------------------------

_WZORZEC_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def _wartosci_run_id(dane: dict) -> list[str]:
    """Wszystkie wartości pól nazwanych `run_id` w drzewie JSON (w tym zagnieżdżone
    `dowod.run_id`) — czyta TEKST JSON, żeby złapać KAŻDE wystąpienie, tak samo
    jak stabilizacja w skrypcie eksportu."""
    return re.findall(r'"run_id":\s*"([^"]+)"', json.dumps(dane, ensure_ascii=False))


def test_katalog_analiz_v126_ma_14_pozycji_i_4_wycofane() -> None:
    katalog = eksport.katalog_analiz_v126()
    assert katalog["namespace"] == "analysis-catalog"
    assert len(katalog["items"]) == 14
    wycofane = [item for item in katalog["items"] if not item["prezentowany"]]
    assert len(wycofane) == 4


def test_gotowosc_v126_scena_akademickie_ma_14_analiz_i_rozklad_stanow() -> None:
    gotowosc = eksport.gotowosc_v126_scena_akademickie()
    assert gotowosc["case_id"] == eksport.CASE_ID_HARNESSU
    assert gotowosc["model_hash"], "złota sieć ma szyny -> model_hash nie może być pusty"
    analizy = gotowosc["analizy"]
    assert len(analizy) == 14
    stany = [a["gotowosc"] for a in analizy]
    assert stany.count("POTWIERDZONA") >= 1
    assert stany.count("NIEPOTWIERDZONA") >= 1
    assert stany.count("WYCOFANA") == 2


#: Stan gotowości KAŻDEGO rodzaju z parametrami sceny — zmierzony REALNYM
#: wywołaniem na złotej sieci, nie założony. Harmoniczne i SSCI zostają
#: NIEPOTWIERDZONE, bo `gen_pv` złotej sieci nie ma karty przekształtnika (mocy
#: znamionowej) — żaden parametr formularza tego nie zastąpi; fixtura pokazuje
#: tę przyczynę po nazwie zamiast udawać komplet danych.
_OCZEKIWANE_STANY_Z_PARAMETRAMI: dict[str, tuple[str, str | None]] = {
    "power_quality_harmonics": ("NIEPOTWIERDZONA", "generator.converter_card_missing"),
    "ssci_impedance": ("NIEPOTWIERDZONA", "generator.converter_card_missing"),
    "earthing_safety": ("POTWIERDZONA", None),
    "earth_fault_detection": ("POTWIERDZONA", None),
    "neutral_earthing_design": ("POTWIERDZONA", None),
    "transient_trv": ("POTWIERDZONA", None),
    "motor_starting": ("POTWIERDZONA", None),
    "reliability_contingency": ("POTWIERDZONA", None),
}


def _klucz_najwyzszy(klucz: str) -> str:
    """`earthing.rho1_ohm_m` -> `earthing`, `motors[].ref` -> `motors`."""
    return klucz.split(".")[0].split("[")[0]


def test_parametry_sceny_pokrywaja_kazdy_prezentowany_rodzaj_z_polami_od_uzytkownika() -> None:
    """KLASA, nie instancja: zbiór rodzajów z parametrami sceny = zbiór rodzajów
    prezentowanych, których karta katalogu ma sekcję „od użytkownika". Nowa
    karta z parametrem bez wpisu sceny (albo wpis dla karty bez parametrów) jest
    czerwony tutaj, nie cichym brakiem zrzutu."""
    katalog = eksport.katalog_analiz_v126()["items"]
    z_parametrami = {
        item["kod"] for item in katalog if item["prezentowany"] and item["dane"]["od_uzytkownika"]
    }
    assert set(eksport.PARAMETRY_SCENY_AKADEMICKIE) == z_parametrami
    assert set(_OCZEKIWANE_STANY_Z_PARAMETRAMI) == z_parametrami


def test_parametry_sceny_maja_klucze_z_karty_katalogu() -> None:
    """Każdy klucz parametru sceny jest kluczem sekcji „od użytkownika" karty
    (po najwyższym członie: `earthing`, `motors`) — parametr spoza karty byłby
    kontrolką-fantomem, której formularz nie ma jak wypełnić."""
    katalog = {item["kod"]: item for item in eksport.katalog_analiz_v126()["items"]}
    for kod, parametry in eksport.PARAMETRY_SCENY_AKADEMICKIE.items():
        klucze_karty = {
            _klucz_najwyzszy(pole["klucz"]) for pole in katalog[kod]["dane"]["od_uzytkownika"]
        }
        assert set(parametry) <= klucze_karty, (kod, set(parametry) - klucze_karty)


def test_gotowosc_z_parametrami_ma_ksztalt_koncowki_i_oczekiwane_stany() -> None:
    fixtura = eksport.gotowosc_v126_scena_akademickie_parametry()
    assert set(fixtura) == {"case_id", "model_hash", "przedmiot", "parametry", "analizy"}
    assert fixtura["case_id"] == eksport.CASE_ID_HARNESSU
    assert fixtura["model_hash"] == eksport.gotowosc_v126_scena_akademickie()["model_hash"]
    assert fixtura["parametry"] == eksport.PARAMETRY_SCENY_AKADEMICKIE
    assert [a["kod"] for a in fixtura["analizy"]] == list(eksport.PARAMETRY_SCENY_AKADEMICKIE)
    for analiza in fixtura["analizy"]:
        stan, kod_braku = _OCZEKIWANE_STANY_Z_PARAMETRAMI[analiza["kod"]]
        assert analiza["gotowosc"] == stan, (analiza["kod"], analiza["braki"])
        if kod_braku is None:
            assert analiza["braki"] == []
            assert all(w["spelniony"] for w in analiza["warunki"] if w["blokujacy"])
        else:
            assert [b["kod"] for b in analiza["braki"]] == [kod_braku]
            assert analiza["braki"][0]["klucz_parametru"] is None


def test_gotowosc_z_parametrami_rozni_sie_od_gotowosci_bez_parametrow() -> None:
    """Dowód, że parametry sceny COŚ zmieniają: każdy rodzaj POTWIERDZONY z
    parametrami jest NIEPOTWIERDZONY bez nich (fixtura bazowa) — inaczej scena
    „wypełnienie formularza" nie pokazywałaby żadnej zmiany stanu."""
    bez = {a["kod"]: a["gotowosc"] for a in eksport.gotowosc_v126_scena_akademickie()["analizy"]}
    z_parametrami = {
        a["kod"]: a["gotowosc"]
        for a in eksport.gotowosc_v126_scena_akademickie_parametry()["analizy"]
    }
    for kod, (stan, _) in _OCZEKIWANE_STANY_Z_PARAMETRAMI.items():
        if stan == "POTWIERDZONA":
            assert bez[kod] == "NIEPOTWIERDZONA", kod
            assert z_parametrami[kod] == "POTWIERDZONA", kod


def test_werdykt_projektowy_scena_ocena_ma_oceny_bez_naruszen() -> None:
    werdykt = eksport.werdykt_projektowy_scena_ocena()
    assert werdykt["ocena"]["spelnia"] > 0
    assert werdykt["ocena"]["nie_spelnia"] == 0
    assert werdykt["ocena"]["brak_podstaw"] > 0
    assert all(zrodlo["dostepny"] and zrodlo["aktualny"] for zrodlo in werdykt["zrodla"])
    run_idy = _wartosci_run_id(werdykt)
    assert run_idy, "scena musi mieć co najmniej jeden run_id (dowód biegu)"
    assert not any(_WZORZEC_UUID.match(wartosc) for wartosc in run_idy), run_idy


def test_werdykt_projektowy_scena_ocena_przekroczenia_ma_naruszenia() -> None:
    werdykt = eksport.werdykt_projektowy_scena_ocena_przekroczenia()
    assert werdykt["ocena"]["nie_spelnia"] > 0
    assert any(pozycja["stan"] == "NARUSZONE" for pozycja in werdykt["pozycje"])
    run_idy = _wartosci_run_id(werdykt)
    assert run_idy, "scena musi mieć co najmniej jeden run_id (dowód biegu)"
    assert not any(_WZORZEC_UUID.match(wartosc) for wartosc in run_idy), run_idy


# ---------------------------------------------------------------------------
# Karta HARNESS-ZWARCIA-Z-BACKENDU (2026-09-16) — sceny „zwarcia"/„zwarcia-
# -rozplyw": wyniki/wkłady/rozpływ/pasmo z JEDNEGO realnego biegu backendu
# (sieć złota `build_golden_enm`, §0.3 karty: testy kształtu).
# ---------------------------------------------------------------------------


def _run_idy_nie_sa_uuid(widok: dict) -> None:
    """Pin wspólny trzem fixturom kotwicy: co najmniej jeden `run_id`
    (dowód biegu) i ŻADEN nie jest surowym UUID (stabilizacja zadziałała)."""
    run_idy = _wartosci_run_id(widok)
    assert run_idy, "scena musi mieć co najmniej jeden run_id (dowód biegu)"
    assert not any(_WZORZEC_UUID.match(wartosc) for wartosc in run_idy), run_idy


def test_zwarcia_wyniki_ma_co_najmniej_dwa_punkty_zwarcia() -> None:
    wyniki = eksport.zwarcia_wyniki_scena_zwarcia()
    assert wyniki["run_id"] == eksport.RUN_ID_SCENY_ZWARCIA
    assert len(wyniki["rows"]) >= 2
    assert len({row["target_id"] for row in wyniki["rows"]}) == len(
        wyniki["rows"]
    ), "target_id musi być unikalny per punkt zwarcia"
    _run_idy_nie_sa_uuid(wyniki)


def test_zwarcia_wklady_pokrywaja_wszystkie_punkty_wynikow() -> None:
    """KLASA, nie instancja: zbiór punktów mapy wkładów = zbiór punktów
    wyników TEGO SAMEGO biegu — nowy punkt zwarcia bez wpisu w mapie byłby
    czerwony tutaj, nie cichym „dane niedostępne" na ekranie."""
    wyniki = eksport.zwarcia_wyniki_scena_zwarcia()
    wklady = eksport.zwarcia_wklady_scena_zwarcia()
    assert set(wklady) == {row["target_id"] for row in wyniki["rows"]}
    for target_id, odpowiedz in wklady.items():
        assert odpowiedz["fault_node_id"] == target_id
        assert "contributions" in odpowiedz
        assert (
            len(odpowiedz["contributions"]) >= 1
        ), "sieć złota niesie generator synchroniczny widoczny z każdego punktu"


def test_zwarcia_rozplyw_niesie_tor_sieci_nadrzednej_i_tor_falownika() -> None:
    """Karta W3-G3/Z-3: rozpływ gałęziowy MUSI pokazywać OBA tory — sieci
    nadrzędnej (`THEVENIN_GRID`) i falownika (`gen_pv`) — inaczej fixtura nie
    zastępuje uczciwie dawnej ręcznej sceny Z-3 (`run-sc-th1-demo`)."""
    rozplyw = eksport.zwarcia_rozplyw_scena_zwarcia()
    assert rozplyw["target_id"] == eksport.zwarcia_wyniki_scena_zwarcia()["rows"][0]["target_id"]
    wpisy = rozplyw["branch_contributions"] or []
    zrodla = {wpis["source_id"] for wpis in wpisy}
    assert "THEVENIN_GRID" in zrodla, "brak toru sieci nadrzędnej w rozpływie"
    assert any(zrodlo != "THEVENIN_GRID" for zrodlo in zrodla), "brak toru falownika w rozpływie"
    assert "gen_pv" in zrodla, zrodla
    _run_idy_nie_sa_uuid(rozplyw)
    # Karta HARNESS-RESZTA (kontynuacja) — NAPOTKANY BŁĄD naprawiony u źródła
    # (`_sc_rozplyw_galeziowy`): `branch_id`/`from_node_id`/`to_node_id` MUSZĄ
    # być refami domenowymi (`Branch.ref_id`/`Bus.ref_id` sieci złotej), NIE
    # kluczami wewnętrznymi grafu solvera — inaczej `buildFaultFlowOverlayFor
    # Snapshot`/`buildFaultFlowOverlayFromScene` (kanwa v3, `ownerRef` sceny =
    # `ref_id`) dostają PUSTĄ nakładkę na KAŻDEJ realnej sieci (zmierzone
    # bezpośrednio przed naprawą). Sieć złota: refy gałęzi {"tr_hv_sn",
    # "cab_main_b", "line_b_c", "tr_sn_nn"}, refy szyn {"bus_hv", "bus_sn_main",
    # "bus_sn_b", "bus_sn_c", "bus_nn"} (`tests/cgmes/golden_enm.py`).
    refy_galezi_zlotej = {"tr_hv_sn", "cab_main_b", "line_b_c", "tr_sn_nn"}
    refy_szyn_zlotej = {"bus_hv", "bus_sn_main", "bus_sn_b", "bus_sn_c", "bus_nn"}
    for wpis in wpisy:
        assert wpis["branch_id"] in refy_galezi_zlotej, (wpis["branch_id"], wpisy)
        assert wpis["from_node_id"] in refy_szyn_zlotej, (wpis["from_node_id"], wpisy)
        assert wpis["to_node_id"] in refy_szyn_zlotej, (wpis["to_node_id"], wpisy)


def test_zwarcia_pasmo_strona_max_jest_biegiem_kotwicy() -> None:
    pasmo = eksport.zwarcia_pasmo_scena_zwarcia()
    assert pasmo["run_id_kotwicy"] == eksport.RUN_ID_SCENY_ZWARCIA
    assert pasmo["brakujacy_scenariusz"] is None
    assert pasmo["powod_niedostepnosci"] is None
    assert pasmo["max"] is not None and pasmo["min"] is not None
    assert pasmo["max"]["zrodlo"] == "biegu_zapisanego"
    assert pasmo["max"]["run_id"] == eksport.RUN_ID_SCENY_ZWARCIA
    assert pasmo["max"]["bieg_bazowy_id"] == eksport.RUN_ID_SCENY_ZWARCIA
    # Strona MIN — kontrakt karty W3-G3: `obliczony_na_zadanie` dzieli `id` z
    # kotwicą (bez własnego `run_id`), tak działa produkt (§0.1 karty).
    assert pasmo["min"]["zrodlo"] == "obliczony_na_zadanie"
    assert pasmo["min"]["run_id"] is None
    assert pasmo["min"]["bieg_bazowy_id"] == eksport.RUN_ID_SCENY_ZWARCIA
    _run_idy_nie_sa_uuid(pasmo)


def test_zwarcia_pasmo_strona_min_ma_ikss_mniejsze_niz_max_per_szyna() -> None:
    pasmo = eksport.zwarcia_pasmo_scena_zwarcia()
    wiersze_max = {w["target_id"]: w["ikss_ka"] for w in pasmo["max"]["wynik"]["rows"]}
    wiersze_min = {w["target_id"]: w["ikss_ka"] for w in pasmo["min"]["wynik"]["rows"]}
    assert wiersze_max, "pasmo musi nieść co najmniej jedną szynę"
    assert set(wiersze_max) == set(wiersze_min)
    for target_id, ikss_min in wiersze_min.items():
        assert ikss_min < wiersze_max[target_id], (target_id, ikss_min, wiersze_max[target_id])


# ---------------------------------------------------------------------------
# Karta HARNESS-RESZTA (2026-09-16) — sceny „wyniki-stan-fazowy"/
# „wyniki-stabilnosc" (E-31/E-32), realny bieg backendu (phase_state_sn /
# dynamic_stability na sieci złotej).
# ---------------------------------------------------------------------------


def test_stan_fazowy_ma_run_id_stabilny_i_pokazuje_alert_asymetrii() -> None:
    wynik = eksport.stan_fazowy_scena_wyniki()
    assert wynik["run_id"] == eksport.RUN_ID_SCENY_STAN_FAZOWY
    _run_idy_nie_sa_uuid(wynik)
    wiersz = wynik["rows"][0]
    assert wiersz["element_id"] == "bus_sn_b"
    # Dowod, ze scena COS demonstruje (nie tylko przechodzi bez bledu): prady
    # fazowe z opcji sceny sa na tyle asymetryczne, ze solver zglasza alert.
    assert wiersz["flags"]["current_unbalance_alert"] is True
    assert wiersz["ia_a"] == 135.0
    assert wiersz["ib_a"] == 78.0
    assert wiersz["ic_a"] == 100.0


# ---------------------------------------------------------------------------
# Karta HARNESS-RESZTA (kontynuacja, 2026-09-16) — sceny „siła-sieci",
# „migotanie", „kompensacja(-wynik)", „walidacja"/„rozplyw", „cieplna",
# „arcflash": realny bieg backendu (short_circuit_sn/PF). „siła-sieci" i
# „migotanie" od karty AB-H0 na sieci sceny analiz OZE (`_enm_sceny_oze_analiz`),
# pozostałe na sieci złotej.
# ---------------------------------------------------------------------------


def _falownik_sceny_oze() -> dict[str, Any]:
    """Falownik PV sceny analiz OZE — wyłącznie ten z karty `_KARTA_PV_SCENY_OZE`,
    w postaci, którą widzi bieg (model po automigracji magazynu).

    Karta AB-H0 (§0 pkt 2): scena nie dopisuje już `catalog_ref` karty 0,8 kV do
    falownika na szynie 0,4 kV sieci złotej (przypisanie typu odmawia takiej pary
    `converter.voltage_mismatch`, tak jak tor tworzenia), tylko buduje własną sieć
    operacjami domenowymi (stacja 15/0,8 kV + `add_converter_source`). Refy szyny
    i falownika nadaje domena, więc test bierze je z tej samej sieci zamiast
    przepisywać je ręcznie — intencja bez zmian: wpis dotyczy węzła z falownikiem
    katalogowym, a moc/współczynnik pochodzą z karty. Szyna: magazyn modelu
    (`enm/store.py`) promuje pole źródłowe nN do realnego aparatu i szyny odpływu
    (`enm/migrations/nn_field_specs_promocja.py`, LV-INV-12), więc falownik wariantu
    `nn_side` stoi w biegu na szynie odpływu za aparatem pola, nie na szynie
    zbiorczej nN — test stosuje TĘ SAMĄ migrację."""
    model, _ = promuj_nn_field_specs(
        EnergyNetworkModel.model_validate(eksport._enm_sceny_oze_analiz())
    )
    falowniki = [
        g.model_dump(mode="json")
        for g in model.generators
        if g.catalog_ref == eksport._KARTA_PV_SCENY_OZE
    ]
    assert len(falowniki) == 1, falowniki
    return falowniki[0]


def test_sila_sieci_ma_scr_realny_z_katalogu_i_werdykt_mocna() -> None:
    widok = eksport.sila_sieci_scena_wynik()
    _run_idy_nie_sa_uuid(widok)
    assert widok["context"]["run_id"] == eksport.RUN_ID_SCENY_OZE_ANALIZ
    falownik = _falownik_sceny_oze()
    wpis = widok["entries"][0]
    assert wpis["bus_ref"] == falownik["bus_ref"]
    assert wpis["nominal_kv"] == 0.8, "falownik karty 0,8 kV na szynie nN 0,8 kV stacji"
    assert wpis["modules"][0]["ref"] == falownik["ref_id"]
    assert wpis["s_installed_mva"] == 0.215, "moc znamionowa MUSI pochodzic z karty katalogu MV"
    assert wpis["scr"] is not None and wpis["scr"] > widok["weak_threshold"]
    assert wpis["verdict"] == "mocna"


def test_migotanie_ma_pst_realny_z_katalogu() -> None:
    widok = eksport.migotanie_scena_wynik()
    _run_idy_nie_sa_uuid(widok)
    falownik = _falownik_sceny_oze()
    bus = widok["buses"][0]
    assert bus["bus_ref"] == falownik["bus_ref"]
    modul = bus["modules"][0]
    assert modul["gen_ref"] == falownik["ref_id"]
    assert modul["flicker_c"] == 0.3, "wspolczynnik migotania MUSI pochodzic z karty katalogu MV"
    assert modul["included"] is True
    assert bus["pst"] is not None


def test_kompensacja_dobiera_realnego_kandydata_z_katalogu() -> None:
    widok = eksport.kompensacja_scena_wynik()
    _run_idy_nie_sa_uuid(widok)
    assert widok["parameters"]["bus_ref"] == "bus_sn_b"
    assert widok["dobor"] is not None, "scena musi pokazywac REALNY dobor, nie odmowe"
    assert widok["dobor"]["catalog_ref"] == "KOMP_SN_0V6_15KV"
    assert widok["dobor"]["cosfi_punktu_dzien"] >= 0.95
    assert widok["powod_braku"] is None


def test_rozplyw_ma_ksztalt_power_flow_result_v1_z_naruszeniami() -> None:
    widok = eksport.rozplyw_scena_wynik()
    assert {"bus_results", "branch_results", "summary", "converged"} <= set(widok)
    assert widok["converged"] is True
    assert len(widok["bus_results"]) >= 2
    assert len(widok["branch_results"]) >= 1
    # Siec x8 obciazenia MUSI dawac realne odchylenie napiec (nie trywialne
    # ~1.0 pu jak siec bazowa) — dowod, ze mnoznik faktycznie cos zmienia.
    v_pu = [row["v_pu"] for row in widok["bus_results"]]
    assert min(v_pu) < 0.95 or max(v_pu) > 1.05, v_pu


def test_walidacja_energetyczna_na_biegu_x8_ma_naruszenie() -> None:
    widok = eksport.walidacja_scena_wynik()
    assert (
        widok["summary"]["fail_count"] + widok["summary"]["warning_count"] > 0
    ), "siec x8 musi dawac co najmniej jedno realne naruszenie/ostrzezenie"
    kody = {item["check_type"] for item in widok["items"]}
    assert "VOLTAGE_DEVIATION" in kody


def test_walidacja_i_rozplyw_dziela_ten_sam_bieg() -> None:
    rozplyw = eksport.rozplyw_scena_wynik()
    walidacja = eksport.walidacja_scena_wynik()
    # Oba widoki pochodza z JEDNEGO biegu kotwicy (ten sam run_id stabilizowany) —
    # KLASA, nie instancja: dwie sceny czytajace jeden PF nie moga rozjezdzac sie
    # w hashu wejscia.
    _run_idy_a = _wartosci_run_id(walidacja)
    assert eksport.RUN_ID_SCENY_ROZPLYW in _run_idy_a
    assert rozplyw["summary"]["min_v_pu"] < 1.0


def test_cieplna_scena_ocena_ma_pozycje_z_realnym_pradem_i_dowod_na_niej() -> None:
    wynik = eksport.cieplna_scena_wynik()
    _run_idy_nie_sa_uuid(wynik)
    items = wynik["ocena"]["items"]
    assert len(items) >= 1
    najwiekszy = max(items, key=lambda p: (p["i_fault_a"], p["branch_id"]))
    assert najwiekszy["i_fault_a"] > 0.0, "co najmniej jedna galaz musi niesc realny prad zwarcia"
    dowod = eksport.cieplna_scena_dowod()
    assert dowod["branch_id"] == najwiekszy["branch_id"]
    assert len(dowod["kroki"]) >= 1


def test_arcflash_scena_ma_energie_incydentu_realnie_policzona() -> None:
    widok = eksport.arcflash_scena_wynik()
    _run_idy_nie_sa_uuid(widok)
    wynik = widok["results"][0]
    assert wynik["incident_energy_cal_cm2"] > 0.0
    assert wynik["i_bf_ka"] > 0.0
    assert wynik["voltage_kv"] == 15.0


def test_stabilnosc_wyniki_i_slad_dziela_ten_sam_run_id_i_scenariusz() -> None:
    wyniki = eksport.stabilnosc_scena_wyniki()
    slad = eksport.stabilnosc_scena_slad()
    assert wyniki["run_id"] == eksport.RUN_ID_SCENY_STABILNOSC == slad["run_id"]
    _run_idy_nie_sa_uuid(wyniki)
    _run_idy_nie_sa_uuid(slad)
    wiersz = wyniki["rows"][0]
    assert wiersz["source_id"] == "gen_sync"
    assert wiersz["faulted_element_id"] == "line_b_c"
    assert wiersz["cleared_by_element_ids"] == ["fuse_c"]
    assert wiersz["status"] == "STABLE"
    # Karta S-1 (W6-0): zdolnosc dynamic_stability.fault_clear jest
    # UNVALIDATED_MODEL — atrapa NIE MOZE pokazywac "pelny/raportowalny"
    # (defekt starej, recznie wpisanej atrapy, naprawiony tu u zrodla).
    assert wiersz["proof_status"] == "incomplete"
    assert wiersz["reporting_status"] == "not_reportable"
    assert wiersz["dopuszczalnosc_raportowa"] is False
    assert wiersz["evidence"]["tier"] == "UNVALIDATED_MODEL"
    typy_zdarzen = [row["event_type"] for row in slad["rows"]]
    assert typy_zdarzen == [
        "AUTOMATION_STARTED",
        "FAULT_APPLIED",
        "FAULT_CLEARED",
        "POST_FAULT_TOPOLOGY_EFFECT",
        "DYNAMIC_STABILITY_EVALUATED",
    ]


def test_falowniki_rozplyw_gpz_feeder_niesie_tor_gpz_i_tor_falownika_na_realnej_topologii() -> None:
    """Karta HARNESS-RESZTA (kontynuacja) — ścieżka (b): `screenshot-harness-
    main.tsx` `FAULT_FLOW_DEMO_INPUT` MUSI pochodzić z realnego biegu NA
    topologii gpzFeeder (nie z innej sieci, jak dawna atrapa `run-sc-th1-demo`
    pożyczająca liczby z testu TH-1). Dowód: oba refy gałęzi WYSTĘPUJĄ w
    `gpzFeeder.enm.json`, oba prądy > 0, kierunki i źródła zgodne z fizyką
    (sieć nadrzędna dominuje na torze do zwarcia; falownik płynie WSTECZ do
    GPZ), `run_id` stabilny i nie jest surowym UUID."""
    wynik = eksport.falowniki_rozplyw_scena_gpz_feeder_wynik()
    assert wynik["run_id"] == eksport.RUN_ID_SCENY_ROZPLYW_ZWARCIOWY_GPZ_FEEDER
    assert wynik["fault_type"] == "3F"
    assert wynik["fault_element_ref"] == eksport._REF_STACJA_S01_GPZ_FEEDER
    _run_idy_nie_sa_uuid(wynik)

    sciezka_gpz_feeder = (
        eksport.BACKEND_DIR.parent / "frontend" / "public" / "test-fixtures" / "gpzFeeder.enm.json"
    )
    tekst_gpz_feeder = sciezka_gpz_feeder.read_text(encoding="utf-8")

    assert len(wynik["flows"]) == 2, wynik["flows"]
    tor_gpz, tor_falownika = wynik["flows"]

    assert tor_gpz["source_id"] == "THEVENIN_GRID"
    assert tor_gpz["branch_name"] == f"Odcinek {eksport._REF_BRANCH_SEGMENT_L_S01}"
    assert eksport._REF_BRANCH_SEGMENT_L_S01 in tekst_gpz_feeder, (
        "branch_id toru sieci nadrzędnej musi być REF-em rzeczywiście "
        "istniejącym w topologii renderowanej przez kanwę (gpzFeeder.enm.json)"
    )
    assert tor_gpz["direction"] == "from_to"
    assert tor_gpz["i_ka"] > 1.0, "prąd sieci nadrzędnej musi być dominujący (rząd kA, nie A)"

    assert tor_falownika["source_id"] == "gen_pv_s02"
    assert tor_falownika["branch_name"] == f"Odcinek {eksport._REF_BRANCH_SEGMENT_L_S02}"
    assert eksport._REF_BRANCH_SEGMENT_L_S02 in tekst_gpz_feeder, (
        "branch_id toru falownika musi być REF-em rzeczywiście istniejącym "
        "w topologii renderowanej przez kanwę (gpzFeeder.enm.json)"
    )
    assert tor_falownika["direction"] == "to_from", "falownik zasila zwarcie WSTECZ do GPZ"
    assert 0.0 < tor_falownika["i_ka"] < tor_gpz["i_ka"], (
        "wkład falownika musi być realny (>0) i mniejszy niż dominujący tor sieci "
        "nadrzędnej — falownik 0,4 MW nie może przebić sieci 250 MVA"
    )

    # gpzFeeder.enm.json (fixtura WSPÓŁDZIELONA z kanwą) sam pozostaje NIETKNIĘTY
    # przez tę kartę — zero generatorów w repo, falownik istnieje WYŁĄCZNIE w
    # kopii w pamięci (`_gpz_feeder_enm_z_falownikiem`).
    assert '"generators": []' in tekst_gpz_feeder or '"generators":[]' in tekst_gpz_feeder


def test_falowniki_rozplyw_gpz_feeder_dominujacy_wplyw_ignoruje_szum_sprzezenia() -> None:
    """`_dominujacy_wplyw_na_galezi` musi wybrać wpis o NAJWIĘKSZYM |i_ka| —
    czerwona iniekcja: lista z jednym wpisem-szumem (kierunek przeciwny,
    wartość znikoma) i jednym wpisem dominującym musi zwrócić dominujący,
    niezależnie od kolejności w liście wejściowej."""
    dominujacy = {
        "branch_name": "Odcinek X",
        "source_id": "DOMINUJACY",
        "i_ka": 9.12,
        "direction": "from_to",
    }
    szum = {
        "branch_name": "Odcinek X",
        "source_id": "SZUM",
        "i_ka": -0.0005,
        "direction": "to_from",
    }
    assert eksport._dominujacy_wplyw_na_galezi([szum, dominujacy], "X") == dominujacy
    assert eksport._dominujacy_wplyw_na_galezi([dominujacy, szum], "X") == dominujacy
    assert eksport._dominujacy_wplyw_na_galezi([szum], "Y") is None
    assert eksport._dominujacy_wplyw_na_galezi([], "X") is None


# ---------------------------------------------------------------------------
# Karta AB-1a Pakiet D2 — sceny NC RfG na kontrakcie V2 (macierz, certyfikat, wniosek)
# Oczekiwania wyprowadzone Z MODELU sceny (operacje domenowe), nie z listy przepisanej obok.
# ---------------------------------------------------------------------------

_HEX_64 = re.compile(r"^[0-9a-f]{64}$")
_TESTY_T01_T20 = [f"T{i:02d}" for i in range(1, 21)]


def _operator_z_modelu(model: object) -> str:
    """Operator sceny = profil NC RfG modułów zapisany w modelu (jednoznaczny)."""
    profile = {
        dict(dict(generator.materialized_params or {}).get("profiles") or {}).get(
            "nc_rfg_profile_ref"
        )
        for generator in model.generators  # type: ignore[attr-defined]
    }
    assert len(profile) == 1 and None not in profile, profile
    return str(profile.pop())


def test_katalog_ncrfg_zna_operatora_scen_i_testy_t01_t20() -> None:
    katalog = eksport.ncrfg_katalog()
    assert set(katalog) == {"procedure_version", "operators", "tests"}
    assert set(katalog["procedure_version"]) == {
        "tytul",
        "wydanie",
        "status",
        "adres",
        "obowiazuje_od",
        "uwagi_pl",
    }
    operatorzy = [operator["operator_id"] for operator in katalog["operators"]]
    assert _operator_z_modelu(eksport.enm_sceny_macierz()) in operatorzy
    assert _operator_z_modelu(eksport.enm_sceny_magazyn()) in operatorzy
    assert [test["test_id"] for test in katalog["tests"]] == _TESTY_T01_T20


#: Flagi deklaracji modułu TRÓJSTANOWE (`bool | None`) — bez wymagań programu `*_required`.
_FLAGI_TROJSTANOWE = tuple(
    pole
    for pole in POLA_DEKLARACJI
    if DeklaracjeModulu.model_fields[pole].annotation == (bool | None)
    and not pole.endswith("_required")
)


def test_wejscia_sceny_macierz_z_mostu_modelu_z_pochodzeniem() -> None:
    """Formularz wstępny macierzy (`GET …/wejscia`) = wejścia mostu modelu sceny: moduły
    w kolejności modelu, pochodzenie „z modelu" dla każdego modułu, bez DER pominiętych; pola
    LICZONE z deklaracji kreatora w `meta` (statyzm, martwa strefa, zakres Q, Q(U), HVRT) są
    wypełnione i nazwane „z modelu" (luka §5.3), a pola bez danej modelu — nie."""
    model = eksport.enm_sceny_macierz()
    wejscia = eksport.ncrfg_wejscia_scena_macierz()
    assert set(wejscia) == {"case_id", "operator_id", "modules", "pola_z_modelu", "pominiete"}
    assert wejscia["case_id"] == eksport.CASE_ID_HARNESSU
    assert wejscia["operator_id"] == _operator_z_modelu(model)
    assert [m["der_ref"] for m in wejscia["modules"]] == [g.ref_id for g in model.generators]
    assert set(wejscia["pola_z_modelu"]) == {g.ref_id for g in model.generators}
    assert wejscia["pominiete"] == []
    pv = next(m for m in wejscia["modules"] if m["der_kind"] == "PV")
    z_modelu = set(wejscia["pola_z_modelu"][pv["der_ref"]])
    liczone_z_meta = {
        "droop_percent": 5.0,
        "dead_band_hz": 0.2,
        "has_pf_droop": True,
        "has_qu_curve": True,
        "has_hvrt_curve": True,
    }
    for pole, wartosc in liczone_z_meta.items():
        assert pv[pole] == wartosc, pole
        assert pole in z_modelu, pole
    assert pv["q_range_pct_pn_min"] < 0 < pv["q_range_pct_pn_max"]
    assert {"q_range_pct_pn_min", "q_range_pct_pn_max"} <= z_modelu
    assert pv["cos_phi_min"] is None and "cos_phi_min" not in z_modelu
    assert not z_modelu & {"operator_id", "module_family"}


def test_bieg_co_jesli_sceny_macierz_jest_zadaniem_klienta_bez_dowodu_serwera() -> None:
    """Bieg „co-jeśli" liczy moduły z ZADANIA klienta: ciało = formularz wstępny bez edycji
    = wejścia mostu odczytane z `GET …/wejscia` (klient niczego z modelu nie wyprowadza sam;
    kolejność modułów ekranu — po referencji), źródło danych `ZADANIE_KLIENTA`, dowód
    certyfikatu `null` (wyprowadza go wyłącznie serwer z zatwierdzonego modelu), rekordy
    T01–T20 z oceną kryterium, zero pól zbiorczych V1."""
    wejscia = eksport.ncrfg_wejscia_scena_macierz()
    zadanie = eksport.ncrfg_bieg_scena_macierz_zadanie()
    assert zadanie == {"modules": sorted(wejscia["modules"], key=lambda m: m["der_ref"])}
    # Scena niesie wszystkie trzy stany flagi deklaracji (iloczyn cech formularza wstępnego).
    stany = {modul[pole] for modul in zadanie["modules"] for pole in _FLAGI_TROJSTANOWE}
    assert stany == {True, False, None}
    bieg = eksport.ncrfg_bieg_scena_macierz()
    assert bieg["contract"] == "NcRfgPtpireeTestResultV2"
    assert [m["der_ref"] for m in bieg["modules"]] == [m["der_ref"] for m in zadanie["modules"]]
    assert [o["der_ref"] for o in bieg["ocena_wymagan"]] == [m["der_ref"] for m in bieg["modules"]]
    for modul in bieg["modules"]:
        assert modul["zrodlo_danych"] == "ZADANIE_KLIENTA"
        assert modul["dowod_certyfikatu"] is None
        assert modul["module_type"] == modul["klasyfikacja"]["modul"]
        assert [test["test_id"] for test in modul["tests"]] == _TESTY_T01_T20
        assert all(test["ocena"]["wyjasnienie"]["zdanie_pl"] for test in modul["tests"])
        for pole in ("overall_status", "pass_count", "fail_count", "certificate_status"):
            assert pole not in modul
    for pole in ("reporting_status", "proof_status", "evidence_by_test", "certificate_evidence"):
        assert pole not in bieg


def test_certyfikat_scen_jedno_zadanie_i_dwa_wyniki_z_modelu() -> None:
    """Scena `macierz` (PV bez wykazanej zgodności) daje 422 z brakami; scena `certyfikat`
    (magazyn — każde wymaganie `NIE_DOTYCZY`, O-28) daje widok dokumentu. Oba z tego samego
    zadania: identyfikacja z zasiewu, operator z modelu."""
    zadanie = eksport.certyfikat_scena_zadanie()
    assert zadanie == {
        "nazwa_projektu": eksport.NAZWA_PROJEKTU_SCEN_OZE,
        "nazwa_przypadku": eksport.NAZWA_PRZYPADKU_SCEN_OZE,
        "operator_id": _operator_z_modelu(eksport.enm_sceny_macierz()),
    }
    assert _operator_z_modelu(eksport.enm_sceny_magazyn()) == zadanie["operator_id"]

    braki = eksport.certyfikat_scena_macierz_braki()
    assert set(braki) == {"komunikat", "braki", "braki_pl", "pominiete", "pominiete_pl"}
    assert braki["komunikat"]
    assert braki["braki"] and len(braki["braki"]) == len(braki["braki_pl"])
    # Braki przypisane do modułu (plan AB O-50 pkt 7): `{der_ref, der_name, rekord}` i zdania
    # `{der_ref, der_name, zdanie_pl}` — moduły to generatory modelu sceny.
    generatory = {g.ref_id: g.name for g in eksport.enm_sceny_macierz().generators}
    for pozycja, zdanie in zip(braki["braki"], braki["braki_pl"], strict=True):
        assert set(pozycja) == {"der_ref", "der_name", "rekord"}
        assert set(zdanie) == {"der_ref", "der_name", "zdanie_pl"}
        assert pozycja["der_ref"] == zdanie["der_ref"] and pozycja["der_ref"] in generatory
        assert pozycja["der_name"] == zdanie["der_name"] == generatory[pozycja["der_ref"]]
        assert zdanie["zdanie_pl"] == pozycja["rekord"]["wyjasnienie"]["zdanie_pl"]
    # Brak = wymaganie stosowalne bez wykazanej zgodności (nigdy SPELNIA ani NIE_DOTYCZY).
    assert {b["rekord"]["status_maszynowy"] for b in braki["braki"]}.isdisjoint(
        {"SPELNIA", "NIE_DOTYCZY"}
    )

    model = eksport.enm_sceny_magazyn()
    widok = eksport.certyfikat_scena_magazyn()
    assert widok["kontrakt"] == "CertyfikatZgodnosciNcRfgV2"
    identyfikacja = widok["identyfikacja"]
    assert identyfikacja["projekt"] == zadanie["nazwa_projektu"]
    assert identyfikacja["przypadek"] == zadanie["nazwa_przypadku"]
    assert identyfikacja["operator_id"] == zadanie["operator_id"]
    assert identyfikacja["case_id"] == eksport.CASE_ID_HARNESSU
    assert {m["der_ref"] for m in widok["moduly"]} == {g.ref_id for g in model.generators}
    for modul in widok["moduly"]:
        assert modul["zrodlo_danych"] == "ZATWIERDZONY_MODEL"
        assert modul["technologia"] == "MAGAZYN"
        assert modul["wymagania"] and all(
            pozycja["rekord"]["status_maszynowy"] == "NIE_DOTYCZY" for pozycja in modul["wymagania"]
        )
    assert _HEX_64.match(widok["odcisk_wejscia_sha256"])
    assert _HEX_64.match(widok["odcisk_wyniku_sha256"])


def test_zgodnosc_przekrojowa_sceny_magazyn_z_modelu() -> None:
    model = eksport.enm_sceny_magazyn()
    migawka = eksport.magazyn_scena_migawka()
    assert [g["ref_id"] for g in migawka["generators"]] == [g.ref_id for g in model.generators]
    odpowiedz = eksport.ncrfg_zgodnosc_przekrojowa_scena_magazyn()
    assert odpowiedz["case_id"] == eksport.CASE_ID_HARNESSU
    assert odpowiedz["operator_id"] == _operator_z_modelu(model)
    assert odpowiedz["der_count"] == len(model.generators) == 1
    bieg = odpowiedz["bieg"]
    assert bieg["contract"] == "NcRfgPtpireeTestResultV2"
    for modul in bieg["modules"]:
        assert modul["zrodlo_danych"] == "ZATWIERDZONY_MODEL"
        assert modul["technologia"] == "MAGAZYN"
        assert modul["dowod_certyfikatu"] is None
    assert {
        rekord["status_maszynowy"]
        for ocena in bieg["ocena_wymagan"]
        for rekord in ocena["wymagania"]
    } == {"NIE_DOTYCZY"}


@pytest.mark.parametrize(
    ("scena_modelu", "scena_zadania", "scena_przebiegow"),
    [
        ("enm_sceny_magazyn", "wniosek_scena_magazyn_zadanie", "wniosek_scena_magazyn_przebiegi"),
        ("enm_sceny_macierz", "wniosek_scena_macierz_zadanie", "wniosek_scena_macierz_przebiegi"),
    ],
)
def test_wniosek_zadanie_wskazuje_przebiegi_sceny_i_szyne_sn(
    scena_modelu: str, scena_zadania: str, scena_przebiegow: str
) -> None:
    """Żądanie wniosku ekranu wskazuje DOKŁADNIE przebiegi zasiane w rejestrze sceny (UUID,
    rozpływ i zwarcie trójfazowe, zakończone), węzeł SN GPZ i operatora z modelu."""
    model = getattr(eksport, scena_modelu)()
    zadanie = getattr(eksport, scena_zadania)()
    przebiegi = getattr(eksport, scena_przebiegow)()
    assert zadanie["nazwa_projektu"] == eksport.NAZWA_PROJEKTU_SCEN_OZE
    assert zadanie["nazwa_przypadku"] == eksport.NAZWA_PRZYPADKU_SCEN_OZE
    assert zadanie["wnioskodawca"] is None and zadanie["adres_przylaczenia"] is None
    assert zadanie["operator_id"] == _operator_z_modelu(model)
    # Węzeł przyłączenia = strona SN transformatora WN/SN GPZ, na napięciu górnej strony
    # transformatorów blokowych modułów (wyprowadzone z topologii modelu, nie z nazwy szyny).
    napiecia = {szyna.ref_id: szyna.voltage_kv for szyna in model.buses}
    szyny_wytworcow = {generator.bus_ref for generator in model.generators}
    bloki = [t for t in model.transformers if t.lv_bus_ref in szyny_wytworcow]
    gpz = [t for t in model.transformers if t.lv_bus_ref not in szyny_wytworcow]
    assert bloki and gpz
    assert zadanie["bus_ref"] in {t.lv_bus_ref for t in gpz}
    assert {napiecia[t.hv_bus_ref] for t in bloki} == {napiecia[zadanie["bus_ref"]]}
    assert [(p["id"], p["analysis_type"], p["status"]) for p in przebiegi] == [
        (zadanie["pf_run_id"], "LOAD_FLOW", "DONE"),
        (zadanie["sc_run_id"], "SC_3F", "DONE"),
    ]
    for przebieg in przebiegi:
        assert _WZORZEC_UUID.match(przebieg["id"])
        assert przebieg["study_case_id"] == eksport.CASE_ID_HARNESSU


def test_wniosek_scen_widok_i_braki_z_modelu() -> None:
    """Scena `wniosek` (magazyn) daje widok V2; scena `wniosek-braki` (PV) daje 422 z tymi
    samymi rekordami braków NC RfG co certyfikat tej sceny — jedna ocena wymagań."""
    model = eksport.enm_sceny_magazyn()
    zadanie = eksport.wniosek_scena_magazyn_zadanie()
    widok = eksport.wniosek_scena_magazyn()
    assert widok["kontrakt"] == "WniosekOkresleniaWarunkowPrzylaczeniaV2"
    assert widok["identyfikacja"] == {
        "projekt": zadanie["nazwa_projektu"],
        "przypadek": zadanie["nazwa_przypadku"],
        "wnioskodawca": None,
        "adres_przylaczenia": None,
        "wezel_przylaczenia": zadanie["bus_ref"],
    }
    zgodnosc = widok["zgodnosc_nc_rfg"]
    assert zgodnosc["case_id"] == eksport.CASE_ID_HARNESSU
    assert zgodnosc["operator_id"] == zadanie["operator_id"]
    assert {m["der_ref"] for m in zgodnosc["moduly"]} == {g.ref_id for g in model.generators}
    assert set(widok["odciski_sekcji_sha256"]) == {
        "bilans_mocy",
        "zgodnosc_nc_rfg",
        "zwarcia_punkt_przylaczenia",
    }
    assert all(_HEX_64.match(odcisk) for odcisk in widok["odciski_sekcji_sha256"].values())

    braki = eksport.wniosek_scena_macierz_braki()
    assert set(braki) == {
        "komunikat",
        "braki",
        "braki_ncrfg",
        "braki_ncrfg_pl",
        "pominiete",
        "pominiete_pl",
    }
    assert braki["komunikat"]
    assert braki["braki_ncrfg"] and len(braki["braki_ncrfg"]) == len(braki["braki_ncrfg_pl"])
    certyfikat = eksport.certyfikat_scena_macierz_braki()
    assert braki["braki_ncrfg"] == certyfikat["braki"]
    assert braki["braki_ncrfg_pl"] == certyfikat["braki_pl"]


def test_studium_dokument_sceny_macierz_niesie_dowod_urzadzen_typu_z_modelu() -> None:
    """Sekcja dowodu dokumentu studium (żądanie z `case_id`): urządzenia modelu o TYPIE
    katalogowym dokumentu, każde z rekordem wykazu PTPiREE albo jawnym brakiem — oczekiwania
    z tabliczek modelu (status powiązania z wykazem nadaje materializacja katalogowa)."""
    model = eksport.enm_sceny_macierz()
    dokument = eksport.studium_dokument_scena_macierz()
    typ = dokument["zalozenia"]["typ_katalogowy"]["id"]
    tabliczki = {
        generator.ref_id: dict(generator.materialized_params or {})
        for generator in model.generators
    }
    urzadzenia_typu = [ref for ref, t in tabliczki.items() if t.get("catalog_item_id") == typ]
    assert urzadzenia_typu, "scena musi mieć urządzenie typu dokumentu"
    dowod = dokument["zalozenia"]["dowod_certyfikatu"]
    assert dowod["catalog_item_id"] == typ
    assert dowod["stan_pl"] is None
    assert [u["der_ref"] for u in dowod["urzadzenia"]] == urzadzenia_typu
    for urzadzenie in dowod["urzadzenia"]:
        assert urzadzenie["wiersze"] and all(
            w["etykieta_pl"] and w["tresc_pl"] for w in urzadzenie["wiersze"]
        )
        if tabliczki[urzadzenie["der_ref"]].get("ptpiree_status") == "POWIAZANY":
            assert (
                urzadzenie["dowod"]["numer_dokumentu"]
                == tabliczki[urzadzenie["der_ref"]]["ptpiree_document_number"]
            )
            assert urzadzenie["odrzucony"] is None
        else:
            assert urzadzenie["dowod"] is None
    assert dokument["zalozenia"]["operator"]["id"] == _operator_z_modelu(model)
    assert dokument["zalozenia"]["przebieg_bazowy"]["run_id"] == str(eksport._UUID_PF_SCENY_WNIOSEK)


@pytest.mark.parametrize(
    ("nazwa", "status"),
    [
        ("krzywe_pokrycie_scena_pv", "BRAK_PODSTAWY"),
        ("krzywe_pokrycie_scena_bez_krzywej", "NIE_OCENIONO"),
        ("krzywe_pokrycie_scena_magazyn", "NIE_DOTYCZY"),
    ],
)
def test_krzywe_pq_sceny_niosa_rekord_ocena_bez_statusu_widoku(nazwa: str, status: str) -> None:
    """Widok pokrycia P–Q na kontrakcie werdyktu: rekord `ocena` (`OcenaKryterium`) i liczby
    per punkt — bez dawnego `werdykt`/`pokryty`/`uwaga` (status i tekst liczy wyłącznie
    kontrakt werdyktu). Iloczyn cech scen: porównanie wykonane × brak krzywej × magazyn."""
    widok = eksport.FIXTURY[nazwa]()
    assert set(widok) == {
        "typ_katalogowy",
        "operator",
        "wymaganie",
        "punkty",
        "ocena",
        "slad_whitebox",
    }
    assert widok["ocena"]["status_maszynowy"] == status
    assert widok["ocena"]["kryterium_id"] == "pq.pokrycie_zakresu_mocy_biernej"
    assert widok["ocena"]["wyjasnienie"]["zdanie_pl"]
    for punkt in widok["punkty"]:
        assert set(punkt) == {
            "p_mw",
            "q_min_mvar",
            "q_max_mvar",
            "q_wymagane_min_mvar",
            "q_wymagane_max_mvar",
            "zapas_dolny_mvar",
            "zapas_gorny_mvar",
            "margines_mvar",
        }
    if status == "NIE_OCENIONO":
        assert widok["punkty"] == []
        assert widok["ocena"]["wyjasnienie"]["czego_brakuje"]
    else:
        assert widok["punkty"]
    typy = [rekord["id"] for rekord in eksport.krzywe_konwertery_scen()]
    assert widok["typ_katalogowy"]["id"] in typy
