"""Porownanie fikstury z odpowiedzia backendu w klasie przenosnosci miedzy maszynami.

Jedno zrodlo predykatu „rozni sie wylacznie szumem numerycznym" dla DWOCH stron:
testu ``tests/ci/test_fixtury_harnessu.py`` (rozjazd poza tolerancja = czerwony) i
generatora ``scripts/eksport_fixtur_harnessu.py`` (KOTWICA W SZUMIE: plik na dysku zostaje
bez zmian, gdy swieza odpowiedz rozni sie od niego wylacznie w tej tolerancji — karta
SLD-SUBSTRAT §0 pkt 5; do niej integrator przywracal ten szum recznie po kazdej regeneracji).
Uzasadnienia progow i list pol — przy stalych nizej; piny — w tescie harnessu.
"""

from __future__ import annotations

import re

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
HEX_SKROTU = re.compile(r"[0-9a-f]{16,}")
#: Ziarno identyfikatora elementu ENM (`enm/domain_operations._make_id`: `prefiks/<ziarno>/ścieżka`)
#: — tożsamość domenowa nadana deterministycznie z referencji modelu (tor DER-SN sceny
#: „akademickie": `pv/<ziarno>/der/producer_nn_bus`), nie skrót wyniku; pin kształtu skrótów
#: (16/64 znaki) go nie dotyczy.
ZIARNO_IDENTYFIKATORA_ENM = re.compile(r"(?<=/)[0-9a-f]{32}(?=/)")
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
    return HEX_SKROTU.sub(lambda m: f"<{len(m.group(0))}hex>", tekst)


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


def _klucz_wielkosci(rodzic: dict[str, object], klucz: str) -> str:
    """Nazwa WIELKOŚCI, którą niesie liść ``klucz`` słownika ``rodzic``.

    Metryka nakładki wyników (``overlay_payload.elements.<ref>.metrics.<KOD>``) ma kształt
    ``{"code": "COS_PHI", "value": …}`` — o klasie wielkości rozstrzyga KOD metryki, nie
    nazwa pola ``value`` (karta SLD-SUBSTRAT, kontynuacja: cos φ odcinka niosącego
    praktycznie samą moc bierną, 2,7254e-08 wobec 2,7369e-08 między maszynami —
    bezwzględnie 1,2e-10, czyli w paśmie wielkości bezwymiarowych ograniczonych, a przy
    kluczu ``value`` porównywany względnie). Kod metryki trafia do porównania małymi
    literami (``COS_PHI`` → ``cos_phi``), więc lista klas pozostaje JEDNA."""
    kod = rodzic.get("code")
    if klucz == "value" and isinstance(kod, str) and kod.lower() in POLA_BEZWYMIAROWE_OGRANICZONE:
        return kod.lower()
    return klucz


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
            r
            for k in zloty
            for r in roznice_z_tolerancja(
                zloty[k], teraz[k], f"{sciezka}.{k}", _klucz_wielkosci(zloty, k)
            )
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
            and HEX_SKROTU.search(zloty)
            and HEX_SKROTU.search(teraz)
        ):
            # Skrót nad liczbami nieprzenośnymi: kształt dokładnie, treść poza
            # porównaniem międzymaszynowym (stabilność lokalna pilnuje determinizm).
            if szkielet_skrotu(zloty) == szkielet_skrotu(teraz):
                return []
            return [f"{sciezka}: kształt skrótu {zloty!r} != {teraz!r}"]
        if klucz in POLA_TEKSTU_Z_LICZBAMI:
            return _roznice_w_tekscie(zloty, teraz, sciezka, klucz)
    return [] if zloty == teraz else [f"{sciezka}: {zloty!r} != {teraz!r}"]
