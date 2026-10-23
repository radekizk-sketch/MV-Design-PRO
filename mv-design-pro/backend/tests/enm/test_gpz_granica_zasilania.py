"""Karta GPZ-MODEL — GPZ jako rzeczywista granica zasilania SN w modelu ENM.

Dwa tryby równoważnika sieci GPZ (`add_grid_source_sn`):

* **równoważnik po stronie 110 kV** — układ H5 (ENEA Operator, Zeszyt 1 „Stacje 110 kV"
  §11.1, rys. Z.1; karta GPZ-H5-APARATURA): dwie sekcje szyn 110 kV, każda z własnym torem
  zasilania (linia 110 kV + równoważnik sieci), łącznik szyn 110 kV ze stanem normalnym
  z ładunku, jeden albo dwa transformatory 110/SN — co najwyżej jeden w sekcji 110 kV —
  przypisane JAWNIE wpisem `transformers` (bez liczby transformatorów i bez przydziału
  domyślnego). Przydział ładunku testowego TR(i) → sekcja 110 kV i, sekcja SN (i mod
  sekcje) jest WYŁĄCZNIE jawnym ładunkiem (`_przydzial`), nie zachowaniem operacji. Dawny
  układ „jedna sekcja 110 kV × 3 transformatory" jest spoza standardu i przypięty jako
  odmowa operacji (`test_odmowa_ukladu_spoza_h5`); rozpływ przez każdy transformator
  i wkład zwarciowy wynikają z solvera dla rzeczywistego stanu obu łączników szyn.
  Stan normalny łącznika szyn SN wynika z trybu rezerwy (ENEA Zeszyt 1 §26.10.5): rezerwa
  ukryta — otwarty, rezerwa jawna — zamknięty; stan badany ustawia potem operacja
  łączeniowa (`open_switch` / `close_switch`). Układ ENEA H5 (dwa tory L1/L2) bada
  `tests/enm/test_gpz_h5_akceptacja.py`;
* **równoważnik na szynach SN** — moc zwarciowa widziana z szyn SN zawiera już impedancję
  transformatorów, więc transformatory NIE są elementami modelu (żądanie ich jest
  odmawiane z przyczyną i wskazaniem trybu 110 kV); jeden równoważnik na sekcji 1, sekcja
  odcięta otwartym sprzęgłem jest zgłoszeniem „sekcja GPZ bez zasilania" (E065, IMPORTANT)
  i w wynikach jest bez napięcia (karta GPZ-H5, R7).

ILOCZYN CECH (reguła KLASA, NIE INSTANCJA): układ standardu H5 {1 sekcja SN
× 1 TR, 1 sekcja SN × 2 TR z rezerwowym, 2 sekcje SN × 1 TR, 2 sekcje SN × 2 TR z rezerwą
ukrytą, 2 sekcje SN × 2 TR z rezerwą jawną} × {sprzęgło SN zamknięte, otwarte} ×
{równoważnik 110 kV, równoważnik SN}; stan normalny łącznika szyn 110 kV {otwarty,
zamknięty z uzasadnieniem} — w strukturze modelu (zamknięty łącznik szyn 110 kV łączy
niezależne równoważniki obu torów i bieg jest odmawiany zgłoszeniem E067 — przypięte
w `tests/enm/test_gpz_h5_akceptacja.py`, SC-04). Kombinacje bez
fizycznego sensu są jawnie przypięte jako ODMOWY, nie pominięte: transformatory przy
równoważniku SN (odmowa operacji), sprzęgło przy jednej sekcji (nie istnieje — sprawdzone),
sekcja bez transformatora przy otwartym sprzęgle w stanie normalnym (odmowa operacji
`source.gpz_sn_section_without_supply`), ten sam stan osiągnięty łączeniem (E065, bieg
liczy część zasilaną, sekcja odcięta bez napięcia). Model sprzed karty
(równoważnik na szynach SN + transformator 110/SN do martwej szyny pomocniczej), wczytany
drogą importu archiwum, jest blokowany zgłoszeniem E066 „transformator GPZ bez zasilania od
strony 110 kV" — iloczyn {stan GPZ} × {sekcje} × {sprzęgło} × {sekcja dawnego TR}.

KAŻDA liczba solvera jest porównana z NIEZALEŻNYM rachunkiem w tym pliku:
* zwarcie 3F — IEC 60909-0:2016: Z_Q = c·U_nQ²/S″_kQ przeliczone na stronę SN przez t_r²
  (§6.2), korekcja impedancji transformatora K_T = 0,95·c_max/(1 + 0,6·x_T) (§6.3.3,
  wzór 12a), I″_k = c·U_n/(√3·|Z_k|) (wzór 29), c_max = 1,1 (tab. 1, sieci 1–35 kV
  i powyżej 35 kV); Z_k miejsca zwarcia to impedancja Thevenina pasywnej sieci zastępczej
  (metoda zastępczego źródła napięcia, §4.3.1) — wyznaczana tu odwróceniem macierzy
  admitancyjnej węzłów W1, W2, S1, S2 zbudowanej z tabliczki, nie z wyniku solvera;
* rozpływ — bilans mocy i rozwiązanie stałopunktowe obwodu zastępczego „źródło napięcia
  110 kV (węzeł bilansujący) → n transformatorów równolegle → odbiór PQ" na stronie SN,
  wyprowadzone tu z tabliczki katalogu, nie z wyniku solvera.

Ścieżka użytkownika: budowa przez `POST /api/cases/{case}/enm/domain-ops`, bieg przez
`POST /api/execution/study-cases/{case}/runs` + wykonawca w tle, wynik z
`GET /api/execution/runs/{id}/results/v1` — ta sama droga, którą idzie kreator i ekran wyników.
"""

from __future__ import annotations

import cmath
import gzip
import json
import logging
import math
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from api.main import app
from fastapi.testclient import TestClient
from network_model.catalog.repository import get_default_mv_catalog

from tests.reference_networks.budowa_przez_api import (
    TRANSFORMATOR_WN_SN,
    ZRODLO_GPZ,
    KlientBudowy,
    wiazanie,
)
from tests.reference_networks.gpz_h5 import APARAT_SN_15
from tests.utils.biegi import wykonaj_bieg

#: IEC 60909-0:2016 tab. 1 — współczynnik napięciowy c_max dla sieci SN (1–35 kV).
C_MAX = 1.1
#: Napięcie znamionowe sieci SN modelu [kV] i równoważnik 110 kV z `KlientBudowy.gpz_110kv`.
U_N_SN_KV = 15.0
U_N_WN_KV = 110.0
SK_WN_MVA = 3000.0
RX_WN = 0.1

#: Odbiory sekcji (P [MW], Q [Mvar]) — różne na S1 i S2, żeby otwarte sprzęgło dawało
#: RÓŻNE przepływy transformatorów obu sekcji (iloczyn nie może się schować w symetrii).
ODBIOR_S1 = (6.0, 2.0)
ODBIOR_S2 = (4.0, 1.5)

TRYBY = ("110kV", "SN")


@pytest.fixture(scope="module")
def klient() -> Iterator[TestClient]:
    logging.getLogger("httpx").setLevel(logging.WARNING)
    with TestClient(app) as k:
        yield k


# ---------------------------------------------------------------------------
# Budowa przez operacje domenowe i bieg przez wykonawcę
# ---------------------------------------------------------------------------


def _surowa_operacja(
    klient: TestClient, case_id: str, nazwa: str, payload: dict[str, Any]
) -> dict[str, Any]:
    """Odpowiedź operacji BEZ podnoszenia wyjątku — do asercji na odmowach."""
    odpowiedz = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "project_id": "",
            "snapshot_base_hash": "",
            "operation": {
                "name": nazwa,
                "idempotency_key": f"granica-{nazwa}-{json.dumps(payload, sort_keys=True)}",
                "payload": payload,
            },
        },
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    return dict(odpowiedz.json())


def _ladunek_gpz_sn(sekcje: int, **dodatkowe: Any) -> dict[str, Any]:
    ladunek: dict[str, Any] = {
        "voltage_kv": U_N_SN_KV,
        "catalog_binding": wiazanie("ZRODLO_SN", ZRODLO_GPZ),
        "sections_count": sekcje,
    }
    if sekcje >= 2:
        # Karta GPZ-H5: stan normalny łącznika szyn SN jest daną; jeden równoważnik na
        # szynach SN zasila obie sekcje tylko przy łączniku zamkniętym (z uzasadnieniem).
        ladunek["sn_coupler"] = {
            "normal_state": "closed",
            "justification": "Obie sekcje zasilane jednym równoważnikiem sieci.",
        }
    return {**ladunek, **dodatkowe}


def _przydzial(sekcje: int, liczba_tr: int) -> list[tuple[int, int]]:
    """Jawny przydział (sekcja 110 kV, sekcja SN) transformatorów ładunku TESTOWEGO:
    TR(i) → sekcja 110 kV i (układ H5: co najwyżej jeden transformator w sekcji 110 kV),
    sekcja SN (i mod sekcje)."""
    return [(i + 1, i % sekcje + 1) for i in range(liczba_tr)]


#: Układy standardu H5 przyjmowane przez operację: nazwa → (sekcje SN, transformatory,
#: transformator rezerwowy rezerwy jawnej). Jedna sekcja SN zasilana z dwóch torów 110 kV
#: naraz łączyłaby L1 i L2 na stałe (odmowa `source.gpz_sn_section_two_hv_supplies`), więc
#: drugi transformator przy jednej sekcji jest rezerwowy (wyłącznik pola SN otwarty).
UKLADY_H5: dict[str, tuple[int, int, int | None]] = {
    "1S-1TR": (1, 1, None),
    "1S-2TR-rezerwa": (1, 2, 2),
    "2S-1TR": (2, 1, None),
    "2S-2TR-ukryta": (2, 2, None),
    "2S-2TR-jawna": (2, 2, 2),
}


def _stan_normalny_sn(sekcje: int, liczba_tr: int, rezerwowy: int | None) -> str:
    """Stan normalny łącznika szyn SN z trybu rezerwy (ENEA Zeszyt 1 §26.10.5)."""
    return "open" if _tryb_rezerwy(sekcje, liczba_tr, rezerwowy) == "hidden" else "closed"


def _tryb_rezerwy(sekcje: int, liczba_tr: int, rezerwowy: int | None = None) -> str | None:
    """Tryb rezerwy ładunku testowego: transformator rezerwowy albo jeden transformator na
    dwie sekcje — rezerwa jawna (łącznik szyn SN normalnie zamknięty); co najmniej dwa
    pracujące transformatory — rezerwa ukryta (każda sekcja ze swojego transformatora)."""
    if rezerwowy is not None or (sekcje >= 2 and liczba_tr == 1):
        return "explicit"
    if sekcje >= 2 or liczba_tr >= 2:
        return "hidden"
    return None


def _ladunek_gpz_110kv(
    sekcje: int,
    liczba_tr: int,
    *,
    wn: str = "open",
    rezerwowy: int | None = None,
    **dodatkowe: Any,
) -> dict[str, Any]:
    """Ładunek trybu 110 kV w układzie H5: dwa tory zasilania 110 kV o tym samym
    równoważniku (Sk″ = 3000 MVA, R/X = 0,1 — przykładowe dane przypadku testowego), łącznik
    szyn 110 kV w stanie normalnym `wn` (zamknięty — z uzasadnieniem), transformatory
    z `_przydzial`, przy rezerwie jawnej transformator rezerwowy `rezerwowy` z wyłącznikiem
    pola SN z katalogu."""
    ladunek: dict[str, Any] = {
        "voltage_kv": U_N_SN_KV,
        "sections_count": sekcje,
        "line_fields_per_section": 1,
        "hv_sections": [
            {
                "supply": {
                    "line_name": f"Linia 110 kV zasilająca L{tor}",
                    "supplying_station_name": (
                        f"Stacja zasilająca {tor} — przykładowe dane przypadku testowego"
                    ),
                    "manual_equivalent": {
                        "hv_voltage_kv": U_N_WN_KV,
                        "sk3_hv_mva": SK_WN_MVA,
                        "rx_ratio": RX_WN,
                    },
                }
            }
            for tor in (1, 2)
        ],
        "hv_coupler": (
            {"normal_state": wn}
            if wn == "open"
            else {
                "normal_state": wn,
                "justification": "Sekcje 110 kV zasilane wspólnie — dane przypadku testowego.",
            }
        ),
        "transformers": [
            {
                "hv_section": wn,
                "sn_section": sn,
                "transformer_catalog_binding": wiazanie("TRAFO_SN_NN", TRANSFORMATOR_WN_SN),
            }
            for wn, sn in _przydzial(sekcje, liczba_tr)
        ],
    }
    tryb = _tryb_rezerwy(sekcje, liczba_tr, rezerwowy)
    if tryb is not None:
        ladunek["reserve_mode"] = tryb
    if rezerwowy is not None:
        ladunek["reserve_transformer"] = rezerwowy
        ladunek["reserve_transformer_apparatus"] = {"catalog_ref": APARAT_SN_15}
    return {**ladunek, **dodatkowe}


def _gpz(migawka: dict[str, Any]) -> dict[str, Any]:
    (gpz,) = (s for s in migawka["substations"] if s.get("station_type") == "gpz")
    return dict(gpz)


def _sekcje(migawka: dict[str, Any]) -> list[str]:
    return [str(s["bus_ref"]) for s in _gpz(migawka)["gpz_sections"]]


def _szyny_wn(migawka: dict[str, Any]) -> list[str]:
    return [str(s["bus_ref"]) for s in _gpz(migawka).get("gpz_hv_sections") or []]


def _sprzegla(migawka: dict[str, Any]) -> list[dict[str, Any]]:
    """Łącznik szyn SN (sprzęgło sekcji SN) — łącznik szyn 110 kV zwraca `_lacznik_wn`."""
    sekcje = set(_sekcje(migawka))
    return [
        g
        for g in migawka["branches"]
        if g.get("type") == "bus_coupler" and g["from_bus_ref"] in sekcje
    ]


def _lacznik_wn(migawka: dict[str, Any]) -> dict[str, Any]:
    szyny = set(_szyny_wn(migawka))
    (lacznik,) = (
        g
        for g in migawka["branches"]
        if g.get("type") == "bus_coupler" and g["from_bus_ref"] in szyny
    )
    return dict(lacznik)


def _zbuduj(
    klient: TestClient,
    tryb: str,
    sekcje: int,
    liczba_tr: int,
    sprzeglo: str,
    wn: str = "open",
    rezerwowy: int | None = None,
) -> tuple[KlientBudowy, dict[str, Any]]:
    """GPZ w zadanym trybie + odbiory sekcji + stan sprzęgła ustawiony ISTNIEJĄCĄ operacją
    `open_switch` (ta sama, którą inspektor i schemat otwierają łącznik — karta W5-C);
    stan normalny łącznika szyn 110 kV (`wn`) pochodzi z ładunku operacji."""
    budowa = KlientBudowy(
        klient, f"granica-{tryb}-{sekcje}s-{liczba_tr}tr-{sprzeglo}-{wn}-r{rezerwowy}"
    )
    if tryb == "110kV":
        budowa.operacja(
            "add_grid_source_sn",
            _ladunek_gpz_110kv(sekcje, liczba_tr, wn=wn, rezerwowy=rezerwowy),
        )
    else:
        assert liczba_tr == 0, "równoważnik SN nie ma transformatorów w modelu"
        budowa.operacja("add_grid_source_sn", _ladunek_gpz_sn(sekcje))
    migawka = budowa.migawka()
    szyny = _sekcje(migawka)
    assert len(szyny) == sekcje
    for szyna, (p, q), nazwa in zip(
        szyny, (ODBIOR_S1, ODBIOR_S2), ("Odbiór S1", "Odbiór S2"), strict=False
    ):
        budowa.operacja(
            "add_load_sn", {"bus_ref": szyna, "p_mw": p, "q_mvar": q, "load_name": nazwa}
        )
    if sekcje >= 2:
        (sprz,) = _sprzegla(budowa.migawka())
        if sprz["status"] != sprzeglo:
            operacja = "open_switch" if sprzeglo == "open" else "close_switch"
            budowa.operacja(operacja, {"switch_ref": sprz["ref_id"]})
        assert _sprzegla(budowa.migawka())[0]["status"] == sprzeglo
    return budowa, budowa.migawka()


def _bieg(klient: TestClient, case_id: str, typ: str) -> dict[str, dict[str, float]]:
    """Metryki nakładki wyniku per element (`overlay_payload.elements[ref].metrics`)."""
    zlecenie = klient.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": typ, "solver_input": {}},
    )
    assert zlecenie.status_code == 201, zlecenie.text
    stan = wykonaj_bieg(klient, zlecenie.json()["id"])
    assert stan.json()["status"] == "DONE", stan.text
    wynik = klient.get(f"/api/execution/runs/{zlecenie.json()['id']}/results/v1").json()
    return {
        ref: {kod: float(m["value"]) for kod, m in element["metrics"].items()}
        for ref, element in wynik["overlay_payload"]["elements"].items()
    }


# ---------------------------------------------------------------------------
# Niezależny rachunek (tabliczka katalogu → IEC 60909 / obwód zastępczy)
# ---------------------------------------------------------------------------


def _tabliczka_tr() -> tuple[complex, float]:
    """(Z_T po stronie SN [Ω], x_T [pu]) z KATALOGU: Z = u_k·U²/S, R = P_k·U²/S²."""
    typ = get_default_mv_catalog().get_transformer_type(TRANSFORMATOR_WN_SN)
    assert typ is not None
    u_lv = float(typ.voltage_lv_kv)
    s_r = float(typ.rated_power_mva)
    z_t = typ.uk_percent / 100.0 * u_lv**2 / s_r
    r_t = typ.pk_kw / 1000.0 * u_lv**2 / s_r**2
    x_t = math.sqrt(z_t**2 - r_t**2)
    return complex(r_t, x_t), x_t / (u_lv**2 / s_r)


def _impedancja_sieci_sn(tryb: str) -> complex:
    """Z_Q widziane z szyn SN [Ω] — IEC 60909-0 §6.2: c·U_nQ²/S″_kQ, a dla sieci 110 kV
    przeliczenie przez przekładnię t_r = 110/15 (Z_Qt = Z_Q/t_r²)."""
    if tryb == "110kV":
        z_q = C_MAX * U_N_WN_KV**2 / SK_WN_MVA / (U_N_WN_KV / U_N_SN_KV) ** 2
        rx = RX_WN
    else:
        zrodlo = get_default_mv_catalog().get_source_system_type(ZRODLO_GPZ)
        assert zrodlo is not None
        z_q = C_MAX * U_N_SN_KV**2 / float(zrodlo.sk3_mva)
        rx = float(zrodlo.rx_ratio)
    x_q = z_q / math.sqrt(1.0 + rx**2)
    return complex(rx * x_q, x_q)


def _ik_niezalezne_sn_ka() -> float:
    """I″_k3 na szynie sekcji SN [kA] przy równoważniku na szynach SN (bez transformatorów)."""
    return C_MAX * U_N_SN_KV / (math.sqrt(3.0) * abs(_impedancja_sieci_sn("SN")))


def _impedancje_thevenina_110kv(
    sekcje: int, liczba_tr: int, sprzeglo: str, rezerwowy: int | None = None
) -> dict[str, complex]:
    """Impedancja Thevenina [Ω, po stronie SN] węzłów W1, W2 (szyny 110 kV) i S1, S2
    (sekcje SN) w pasywnej sieci zastępczej IEC 60909-0 §4.3.1: Z_Qt każdego toru zasilania
    do ziemi, K_T·Z_T PRACUJĄCEGO transformatora TR(i) między W(i) i S((i−1 mod sekcje)+1)
    (rezerwowy ma otwarty wyłącznik pola SN — gałąź ślepa bez prądu), zamknięty łącznik
    szyn SN = jeden węzeł (impedancja zerowa, jak w rdzeniu zwarciowym). Łącznik szyn
    110 kV jest otwarty: zamknięty łączy niezależne równoważniki i bieg jest odmawiany
    (E067). Węzeł bez drogi do żadnego toru zasilania nie ma impedancji (sekcja odcięta)."""
    z_t, x_t = _tabliczka_tr()
    k_t = 0.95 * C_MAX / (1.0 + 0.6 * x_t)
    z_q = _impedancja_sieci_sn("110kV")
    wezly = ["W1", "W2", "S1", "S2"][: 2 + sekcje]
    scal = {w: w for w in wezly}
    if sekcje == 2 and sprzeglo == "closed":
        scal["S2"] = "S1"
    glowne = sorted(set(scal.values()))
    indeks = {w: glowne.index(scal[w]) for w in wezly}
    y = np.zeros((len(glowne), len(glowne)), dtype=complex)
    for tor in ("W1", "W2"):
        y[indeks[tor], indeks[tor]] += 1.0 / z_q
    sasiedzi: dict[int, set[int]] = {i: set() for i in range(len(glowne))}
    for numer, (wn_tr, sn_tr) in enumerate(_przydzial(sekcje, liczba_tr), start=1):
        if numer == rezerwowy:
            continue
        a, b = indeks[f"W{wn_tr}"], indeks[f"S{sn_tr}"]
        y_t = 1.0 / (k_t * z_t)
        y[a, a] += y_t
        y[b, b] += y_t
        y[a, b] -= y_t
        y[b, a] -= y_t
        sasiedzi[a].add(b)
        sasiedzi[b].add(a)
    # Składowa spójna z torem zasilania (W1 zawsze ma tor); węzły poza nią są odcięte.
    zasilane = {indeks["W1"], indeks["W2"]}
    kolejka = list(zasilane)
    while kolejka:
        for n in sasiedzi[kolejka.pop()]:
            if n not in zasilane:
                zasilane.add(n)
                kolejka.append(n)
    rzad = sorted(zasilane)
    z_bus = np.linalg.inv(y[np.ix_(rzad, rzad)])
    return {
        w: complex(z_bus[rzad.index(indeks[w]), rzad.index(indeks[w])])
        for w in wezly
        if indeks[w] in zasilane
    }


def _rozplyw_niezalezny(
    liczba_tr: int, p_mw: float, q_mvar: float
) -> tuple[float, float, float, float]:
    """(U_SN [kV], P po stronie 110 kV na JEDEN transformator [MW], strata wyłączników pól SN
    transformatorów [MW], strata wyłączników pól liniowych 110 kV [MW]) dla wyspy „zacisk
    linii 110 kV (węzeł bilansujący, U = U_n) → zamknięty wyłącznik pola liniowego 110 kV →
    sekcja szyn 110 kV → transformator → zamknięty wyłącznik pola SN (gniazdo „W”, zał. Z.7)
    → odbiór PQ”, n takich torów równolegle.

    Obwód zastępczy po stronie SN, na fazę: V = V₀ − ((Z_T + Z_ł + Z_ł,WN·(15/110)²)/n)·
    conj(S/(3V)). Każdy pracujący transformator ma WŁASNY tor: układ H5 przyjmuje co
    najwyżej jeden transformator w sekcji 110 kV (`_przydzial`), a każda sekcja 110 kV ma
    własny tor zasilania z wyłącznikiem pola liniowego (granica zasilania, decyzja właściciela
    2026-10-22). Zamknięty łącznik rozpływu to `Z_LACZNIKA_ROZPLYWU_OHM` liczone NA POZIOMIE
    NAPIĘCIA łącznika (`_base_scale` rdzenia NR), więc wyłącznik 110 kV sprowadzony na stronę
    SN to Z_ł·(U_SN/U_WN)². Przekładnia znamionowa 110/15 równa ilorazowi napięć szyn
    (zaczep neutralny), więc V₀ = 15/√3 kV. Moc P_TR wyniku jest mierzona na zacisku 110 kV
    transformatora, ZA wyłącznikiem pola liniowego — nie zawiera jego straty, którą niesie
    dopiero moc źródła. Gałąź poprzeczna magnesowania nie wchodzi do rozpływu (tor solvera —
    patrz `test_bilans_mocy_rozplywu`, który przypina, że straty transformatorów są wyłącznie
    stratami w miedzi, a resztę bilansu niosą straty wyłączników zwracane tutaj)."""
    z_t, _x_t = _tabliczka_tr()
    z_wn_na_sn = Z_LACZNIKA_ROZPLYWU_OHM * (U_N_SN_KV / U_N_WN_KV) ** 2
    z_eq = (z_t + Z_LACZNIKA_ROZPLYWU_OHM + z_wn_na_sn) / liczba_tr
    s_faza = complex(p_mw, q_mvar) / 3.0
    v0 = complex(U_N_SN_KV / math.sqrt(3.0), 0.0)
    v = v0
    for _ in range(200):
        v_nowe = v0 - z_eq * (s_faza / v).conjugate()
        if abs(v_nowe - v) < 1e-14:
            v = v_nowe
            break
        v = v_nowe
    prad = abs((s_faza / v).conjugate())
    straty = 3.0 * prad**2 * z_eq.real
    straty_wylacznikow = 3.0 * prad**2 * Z_LACZNIKA_ROZPLYWU_OHM.real / liczba_tr
    straty_wylacznikow_wn = 3.0 * prad**2 * z_wn_na_sn.real / liczba_tr
    return (
        math.sqrt(3.0) * abs(v),
        (p_mw + straty - straty_wylacznikow_wn) / liczba_tr,
        straty_wylacznikow,
        straty_wylacznikow_wn,
    )


def _po_sufiksie(metryki: dict[str, dict[str, float]], sufiks: str) -> dict[str, float]:
    (wpis,) = (m for ref, m in metryki.items() if ref.endswith(sufiks))
    return wpis


# ---------------------------------------------------------------------------
# Struktura modelu: dwie sekcje szyn 110 kV z torami zasilania, TR → sekcje (układ H5)
# ---------------------------------------------------------------------------

#: Iloczyn trybu 110 kV: układ standardu H5 × stan normalny łącznika szyn 110 kV.
ILOCZYN_110KV = [(uklad, wn) for uklad in UKLADY_H5 for wn in ("open", "closed")]


@pytest.mark.parametrize(("uklad", "wn"), ILOCZYN_110KV)
def test_tryb_110kv_dwie_sekcje_wn_z_torami_i_transformatory(
    klient: TestClient, uklad: str, wn: str
) -> None:
    sekcje, liczba_tr, rezerwowy = UKLADY_H5[uklad]
    stan_sn = _stan_normalny_sn(sekcje, liczba_tr, rezerwowy)
    _budowa, migawka = _zbuduj(klient, "110kV", sekcje, liczba_tr, stan_sn, wn, rezerwowy)
    gpz = _gpz(migawka)
    szyny_wn = [b for b in migawka["buses"] if "gpz_hv_bus" in (b.get("tags") or [])]
    assert len(szyny_wn) == 2, "układ H5 — dwie sekcje szyn 110 kV, każda z torem zasilania"
    assert [s["bus_ref"] for s in gpz["gpz_hv_sections"]] == [b["ref_id"] for b in szyny_wn]
    assert all(b["voltage_kv"] == U_N_WN_KV for b in szyny_wn)
    zrodla = {z["ref_id"]: z for z in migawka["sources"]}
    assert len(zrodla) == 2
    napiecia = {b["ref_id"]: b["voltage_kv"] for b in migawka["buses"]}
    for sekcja, szyna in zip(gpz["gpz_hv_sections"], szyny_wn, strict=True):
        zrodlo = zrodla[sekcja["incoming_source_ref"]]
        # Tor zasilania = równoważnik linii 110 kV na ZACISKU pola liniowego + jedyny łącznik
        # pola (wyłącznik z gałęzią modelu, bez typu katalogowego — strona 110 kV jest granicą
        # zasilania, decyzja właściciela 2026-10-22) między zaciskiem a szyną sekcji; stan
        # tego wyłącznika wpływa na obliczenia (otwarty = utrata toru).
        zacisk = zrodlo["bus_ref"]
        assert zacisk != szyna["ref_id"], "równoważnik toru stoi na zacisku pola, nie na szynie"
        assert napiecia[zacisk] == U_N_WN_KV
        (wylacznik_linii,) = (
            g for g in migawka["branches"] if zacisk in (g["from_bus_ref"], g["to_bus_ref"])
        )
        assert wylacznik_linii["type"] == "breaker"
        assert {wylacznik_linii["from_bus_ref"], wylacznik_linii["to_bus_ref"]} == {
            szyna["ref_id"],
            zacisk,
        }
        assert (wylacznik_linii["status"], wylacznik_linii["normal_state"]) == (
            "closed",
            "closed",
        )
        assert wylacznik_linii.get("catalog_ref") is None, "pole 110 kV pokazuje „brak typu”"
    assert _lacznik_wn(migawka)["status"] == wn, "stan normalny łącznika szyn 110 kV z ładunku"
    transformatory = sorted(migawka["transformers"], key=lambda t: t["ref_id"])
    assert len(transformatory) == liczba_tr
    szyny_sn = _sekcje(migawka)
    # Przydział z JAWNEGO ładunku (`_przydzial`), nie z reguły operacji.
    galezie = {g["ref_id"]: g for g in migawka["branches"]}
    for numer, (tr, (wn_tr, sn)) in enumerate(
        zip(transformatory, _przydzial(sekcje, liczba_tr), strict=True), start=1
    ):
        assert tr["hv_bus_ref"] == szyny_wn[wn_tr - 1]["ref_id"], tr["name"]
        # Każdy transformator: wyłącznik pola SN (gniazdo „W”, ENEA zał. Z.7) między zaciskiem
        # SN transformatora a sekcją — normalnie otwarty wyłącznie dla transformatora
        # rezerwowego (Zeszyt 1 §26.10.5, rezerwa jawna).
        (wylacznik,) = (
            g
            for g in galezie.values()
            if g.get("type") == "breaker" and g["to_bus_ref"] == tr["lv_bus_ref"]
        )
        assert tr["lv_bus_ref"] not in szyny_sn, tr["name"]
        assert wylacznik["from_bus_ref"] == szyny_sn[sn - 1], tr["name"]
        oczekiwany = "open" if numer == rezerwowy else "closed"
        assert (wylacznik["status"], wylacznik["normal_state"]) == (oczekiwany, oczekiwany)
    assert sorted(gpz["transformer_refs"]) == [t["ref_id"] for t in transformatory]
    assert len(_sprzegla(migawka)) == sekcje - 1, "sprzęgło SN istnieje tylko przy 2 sekcjach"


@pytest.mark.parametrize("sekcje", [1, 2])
def test_tryb_sn_bez_transformatorow_rownowaznik_na_sekcji_1(
    klient: TestClient, sekcje: int
) -> None:
    _budowa, migawka = _zbuduj(klient, "SN", sekcje, 0, "closed")
    assert migawka["transformers"] == []
    assert not [b for b in migawka["buses"] if "gpz_hv_bus" in (b.get("tags") or [])]
    (zrodlo,) = migawka["sources"]
    assert zrodlo["bus_ref"] == _sekcje(migawka)[0]
    assert zrodlo["name"] == "Źródło GPZ 15 kV"
    assert _gpz(migawka)["transformer_refs"] == []
    assert len(_sprzegla(migawka)) == sekcje - 1


# ---------------------------------------------------------------------------
# Odmowy — kombinacje, których model nie przyjmuje
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "dane_tr",
    [
        {"transformer_count": 1},
        {"transformer_count": 3},
        {"transformers": [{"hv_section": 1, "sn_section": 1}]},
        {"transformer_catalog_ref": TRANSFORMATOR_WN_SN},
        {"transformer_catalog_binding": wiazanie("TRAFO_SN_NN", TRANSFORMATOR_WN_SN)},
        {"hv_voltage_kv": 110.0, "transformer_sn_mva": 25.0},
    ],
    ids=[
        "liczba_1",
        "liczba_3",
        "wpis_transformatora",
        "typ_katalogu",
        "wiazanie_katalogu",
        "para_napiecie_moc",
    ],
)
@pytest.mark.parametrize("sekcje", [1, 2])
def test_odmowa_transformatorow_przy_rownowazniku_sn(
    klient: TestClient, sekcje: int, dane_tr: dict[str, Any]
) -> None:
    budowa = KlientBudowy(klient, "odmowa-tr-sn")
    wynik = _surowa_operacja(
        klient, budowa.case_id, "add_grid_source_sn", _ladunek_gpz_sn(sekcje, **dane_tr)
    )
    assert wynik["error_code"] == "source.transformer_requires_hv_equivalent", wynik
    assert "GPZ ze stroną 110 kV" in wynik["error"]
    assert budowa.migawka()["transformers"] == [], "odmowa nie zostawia żadnego skutku"
    assert budowa.migawka()["sources"] == []


#: Odmowy wpisów `transformers` (karta GPZ-H5): brak wpisów, numer sekcji spoza zakresu
#: albo nie-liczba po stronie 110 kV i SN, dawna liczba transformatorów obok wpisów.
ODMOWY_WPISOW_TR = [
    ("brak_wpisow", None, "source.gpz_transformers_required"),
    ("pusta_lista", [], "source.gpz_transformers_required"),
    ("sekcja_wn_0", [{"hv_section": 0, "sn_section": 1}], "source.gpz_transformer_section_invalid"),
    ("sekcja_wn_5", [{"hv_section": 5, "sn_section": 1}], "source.gpz_transformer_section_invalid"),
    (
        "sekcja_wn_napis",
        [{"hv_section": "dwa", "sn_section": 1}],
        "source.gpz_transformer_section_invalid",
    ),
    ("sekcja_sn_3", [{"hv_section": 1, "sn_section": 3}], "source.gpz_transformer_section_invalid"),
    ("liczba_obok", "liczba", "source.gpz_transformers_required"),
]


@pytest.mark.parametrize(
    ("wariant", "wpisy", "kod"), ODMOWY_WPISOW_TR, ids=[w for w, _p, _k in ODMOWY_WPISOW_TR]
)
def test_odmowa_trybu_110kv_bez_jawnych_wpisow_transformatorow(
    klient: TestClient, wariant: str, wpisy: object, kod: str
) -> None:
    budowa = KlientBudowy(klient, f"odmowa-wpisy-{wariant}")
    ladunek = _ladunek_gpz_110kv(1, 1)
    if wpisy is None:
        del ladunek["transformers"]
    elif wpisy == "liczba":
        ladunek["transformer_count"] = 1
    else:
        assert isinstance(wpisy, list)
        ladunek["transformers"] = [
            {**w, "transformer_catalog_binding": wiazanie("TRAFO_SN_NN", TRANSFORMATOR_WN_SN)}
            for w in wpisy
        ]
    wynik = _surowa_operacja(klient, budowa.case_id, "add_grid_source_sn", ladunek)
    assert wynik["error_code"] == kod, wynik
    assert budowa.migawka()["sources"] == [], "odmowa nie zostawia żadnego skutku"
    assert budowa.migawka()["transformers"] == []


def test_odmowa_sekcji_sn_bez_transformatora_w_stanie_normalnym(klient: TestClient) -> None:
    """Dwie sekcje SN, jeden transformator i rezerwa ukryta (łącznik szyn SN normalnie
    otwarty): sekcja 2 nie miałaby zasilania w stanie NORMALNYM — odmowa operacji z
    przyczyną, bez skutku w modelu."""
    budowa = KlientBudowy(klient, "odmowa-sekcja-bez-tr")
    ladunek = _ladunek_gpz_110kv(2, 1, reserve_mode="hidden")
    wynik = _surowa_operacja(klient, budowa.case_id, "add_grid_source_sn", ladunek)
    assert wynik["error_code"] == "source.gpz_sn_section_without_supply", wynik
    assert "Sekcja SN 2" in wynik["error"]
    assert budowa.migawka()["sources"] == []


def test_odmowa_trybu_110kv_przy_niezgodnym_napieciu_wn(klient: TestClient) -> None:
    budowa = KlientBudowy(klient, "odmowa-napiecie")
    ladunek = _ladunek_gpz_110kv(1, 1)
    ladunek["hv_sections"][0]["supply"]["manual_equivalent"]["hv_voltage_kv"] = 220.0
    wynik = _surowa_operacja(klient, budowa.case_id, "add_grid_source_sn", ladunek)
    assert wynik["error_code"] == "source.hv_voltage_mismatch", wynik
    assert budowa.migawka()["sources"] == []


def _uklad_spoza_h5(wariant: str) -> dict[str, Any]:
    ladunek = _ladunek_gpz_110kv(2, 2)
    tr = {"transformer_catalog_binding": wiazanie("TRAFO_SN_NN", TRANSFORMATOR_WN_SN)}
    if wariant == "jedna_sekcja_wn":
        ladunek["hv_sections"] = ladunek["hv_sections"][:1]
        ladunek["transformers"] = [{**tr, "hv_section": 1, "sn_section": 1}]
        del ladunek["hv_coupler"]
    elif wariant == "trzy_sekcje_wn":
        ladunek["hv_sections"] = [*ladunek["hv_sections"], ladunek["hv_sections"][0]]
    elif wariant == "dwa_tr_w_sekcji_wn":
        ladunek["transformers"] = [
            {**tr, "hv_section": 1, "sn_section": 1},
            {**tr, "hv_section": 1, "sn_section": 2},
        ]
    elif wariant == "trzy_tr":
        ladunek["transformers"] = [
            {**tr, "hv_section": 1, "sn_section": 1},
            {**tr, "hv_section": 2, "sn_section": 2},
            {**tr, "hv_section": 2, "sn_section": 1},
        ]
    elif wariant == "trzy_sekcje_sn":
        ladunek["sections_count"] = 3
        ladunek["transformers"] = [
            {**tr, "hv_section": 1, "sn_section": 1},
            {**tr, "hv_section": 2, "sn_section": 3},
        ]
    elif wariant == "bez_liczby_pol_liniowych":
        del ladunek["line_fields_per_section"]
    return ladunek


#: Iloczyn odmów układu spoza H5 (ENEA Zeszyt 1 §11.1, rys. Z.1, §13 i rys. Z.2): liczba
#: sekcji szyn 110 kV {1, 3} × {≥ 2 transformatory w sekcji 110 kV, 3 transformatory} ×
#: {3 sekcje SN} × {brak liczby pól liniowych — dana projektu, zał. Z.2}. Każda odmowa
#: z podstawą (Zeszyt 1 ENEA) i bez skutku w modelu.
ODMOWY_UKLADU = [
    ("jedna_sekcja_wn", "source.invalid_hv_sections_count"),
    ("trzy_sekcje_wn", "source.invalid_hv_sections_count"),
    ("dwa_tr_w_sekcji_wn", "source.gpz_layout_outside_standard"),
    ("trzy_tr", "source.gpz_layout_outside_standard"),
    ("trzy_sekcje_sn", "source.gpz_layout_outside_standard"),
    ("bez_liczby_pol_liniowych", "source.gpz_line_fields_required"),
]


@pytest.mark.parametrize(("wariant", "kod"), ODMOWY_UKLADU, ids=[w for w, _k in ODMOWY_UKLADU])
def test_odmowa_ukladu_spoza_h5(klient: TestClient, wariant: str, kod: str) -> None:
    budowa = KlientBudowy(klient, f"odmowa-uklad-{wariant}")
    wynik = _surowa_operacja(klient, budowa.case_id, "add_grid_source_sn", _uklad_spoza_h5(wariant))
    assert wynik["error_code"] == kod, wynik
    podstawa = "zał. Z.2" if wariant == "bez_liczby_pol_liniowych" else "§11.1"
    assert "Zeszyt 1" in wynik["error"] and podstawa in wynik["error"], wynik["error"]
    migawka = budowa.migawka()
    assert migawka["sources"] == [] and migawka["transformers"] == []
    assert migawka["substations"] == [], "odmowa nie zostawia żadnego skutku"


# ---------------------------------------------------------------------------
# Nazwy pól liniowych GPZ: „Pole liniowe GPZ {sekcja}.{pole}"
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("tryb", TRYBY)
def test_nazwy_pol_liniowych_gpz_sekcja_kropka_pole(klient: TestClient, tryb: str) -> None:
    budowa = KlientBudowy(klient, f"pola-{tryb}")
    ladunek = (
        _ladunek_gpz_110kv(2, 2, line_fields_per_section=3)
        if tryb == "110kV"
        else _ladunek_gpz_sn(2, line_fields_per_section=3)
    )
    budowa.operacja("add_grid_source_sn", ladunek)
    nazwy = sorted(
        str(p["name"])
        for p in budowa.migawka()["bays"]
        if str(p.get("name", "")).startswith("Pole liniowe GPZ")
    )
    assert nazwy == [f"Pole liniowe GPZ {s}.{p}" for s in (1, 2) for p in (1, 2, 3)]


# ---------------------------------------------------------------------------
# Rozpływ mocy — iloczyn {sekcje} × {TR} × {sprzęgło} w trybie 110 kV
# ---------------------------------------------------------------------------

#: Układy standardu H5 w stanie normalnym (łącznik szyn SN z trybu rezerwy, łącznik szyn
#: 110 kV otwarty). Stany łączeniowe poza normalnym: otwarte sprzęgło przy jednym TR →
#: E065 (`test_otwarte_sprzeglo_*`), zamknięte sprzęgło przy rezerwie ukrytej albo
#: zamknięty łącznik szyn 110 kV → E067 (`test_gpz_h5_akceptacja.py`, SC-04 i SC-05b).
ILOCZYN_ROZPLYWU = list(UKLADY_H5)


def _parametry(uklad: str) -> tuple[int, int, str, int | None]:
    sekcje, liczba_tr, rezerwowy = UKLADY_H5[uklad]
    return sekcje, liczba_tr, _stan_normalny_sn(sekcje, liczba_tr, rezerwowy), rezerwowy


def _wyspy(
    sekcje: int, liczba_tr: int, sprzeglo: str, rezerwowy: int | None = None
) -> list[tuple[list[int], list[int]]]:
    """Wyspy zasilania strony SN: (indeksy sekcji, indeksy PRACUJĄCYCH TR) z przydziału
    TR(i) → S(i mod sekcje); transformator rezerwowy (wyłącznik pola SN otwarty) nie zasila
    żadnej wyspy."""
    pracujace = [t for t in range(liczba_tr) if t + 1 != rezerwowy]
    if sekcje == 1 or sprzeglo == "closed":
        return [(list(range(sekcje)), pracujace)]
    return [([s], [t for t in pracujace if t % sekcje == s]) for s in range(sekcje)]


#: Impedancja zamkniętego łącznika w macierzy admitancyjnej rozpływu NR [Ω] — stała
#: `Y_CLOSED_SWITCH = 1/(0,0001 + j0,0001)` rdzenia `power_flow_newton_internal.py`
#: (FROZEN, B-01). Zwarcie IEC 60909 scala węzły zamkniętego łącznika (impedancja zerowa,
#: `network_model/core/ybus.py`), rozpływ NIE — stąd jawny człon sprzęgła w tolerancjach.
Z_LACZNIKA_ROZPLYWU_OHM = complex(1e-4, 1e-4)
#: Próg niezbilansowania NR 1·10⁻⁸ pu na bazie 100 MVA = 1·10⁻⁶ MW.
TOLERANCJA_NR_MW = 1e-6


def _sprzeglo_przewodzi(sekcje: int, sprzeglo: str) -> bool:
    return sekcje == 2 and sprzeglo == "closed"


def _tolerancje_rozplywu(sekcje: int, sprzeglo: str) -> tuple[float, float]:
    """(tolerancja P na transformator [MW], tolerancja U sekcji [kV]).

    Bez przewodzącego sprzęgła obwód niezależny jest DOKŁADNIE obwodem solvera, więc
    granicą jest zbieżność NR: 1·10⁻⁶ MW i 1·10⁻⁶ kV (zmierzone 2026-10-21: ≤ 1·10⁻¹¹).
    Przy zamkniętym sprzęgle solver wstawia łącznik |Z_ł| = 1,41·10⁻⁴ Ω, którego obwód
    niezależny (sekcje jako jeden węzeł — fizyczny łącznik bez impedancji) nie ma:
    transformator sekcji 2 zasilający odbiór sekcji 1 widzi dodatkowo |Z_ł|/|Z_T| ≈
    1,4·10⁻⁴ swojej impedancji, a spadek na łączniku to √3·I·|Z_ł| ≈ 1·10⁻⁴ kV przy
    0,42 kA. Zmierzone 2026-10-21: ΔP ≤ 2,5·10⁻⁵ MW, ΔU ≤ 3,8·10⁻⁵ kV — tolerancje
    2·10⁻⁴ MW i 1·10⁻⁴ kV mieszczą ten człon z zapasem, a wciąż wykrywają przydział
    transformatora do złej szyny (różnica rzędu MW i setek V)."""
    if _sprzeglo_przewodzi(sekcje, sprzeglo):
        return 2e-4, 1e-4
    return 1e-6, 1e-6


@pytest.mark.parametrize("uklad", ILOCZYN_ROZPLYWU)
def test_rozplyw_przez_kazdy_transformator_z_niezaleznego_obwodu(
    klient: TestClient, uklad: str
) -> None:
    sekcje, liczba_tr, sprzeglo, rezerwowy = _parametry(uklad)
    budowa, migawka = _zbuduj(klient, "110kV", sekcje, liczba_tr, sprzeglo, "open", rezerwowy)
    metryki = _bieg(klient, budowa.case_id, "LOAD_FLOW")
    transformatory = sorted(migawka["transformers"], key=lambda t: t["ref_id"])
    szyny = _sekcje(migawka)
    odbiory = (ODBIOR_S1, ODBIOR_S2)
    tolerancja_p, tolerancja_u = _tolerancje_rozplywu(sekcje, sprzeglo)
    if rezerwowy is not None:
        # Rezerwowy pod napięciem od strony 110 kV, wyłącznik pola SN otwarty — bez prądu.
        bieg_rez = metryki.get(transformatory[rezerwowy - 1]["ref_id"], {})
        assert abs(bieg_rez.get("P_MW", 0.0)) <= TOLERANCJA_NR_MW, bieg_rez
    for indeksy_sekcji, indeksy_tr in _wyspy(sekcje, liczba_tr, sprzeglo, rezerwowy):
        p = sum(odbiory[s][0] for s in indeksy_sekcji)
        q = sum(odbiory[s][1] for s in indeksy_sekcji)
        u_kv, p_na_tr, _straty_sn, _straty_wn = _rozplyw_niezalezny(len(indeksy_tr), p, q)
        for t in indeksy_tr:
            wynik_tr = metryki[transformatory[t]["ref_id"]]
            assert wynik_tr["P_MW"] == pytest.approx(p_na_tr, abs=tolerancja_p), (
                transformatory[t]["name"],
                sprzeglo,
            )
            assert wynik_tr["LOADING_PCT"] > 0.0
        for s in indeksy_sekcji:
            assert metryki[szyny[s]]["U_kV"] == pytest.approx(u_kv, abs=tolerancja_u), (
                s,
                sprzeglo,
            )


@pytest.mark.parametrize("uklad", ILOCZYN_ROZPLYWU)
def test_bilans_mocy_rozplywu(klient: TestClient, uklad: str) -> None:
    """Σ P_źródeł = Σ P_TR (zacisk 110 kV) + strata wyłączników pól liniowych 110 kV
    = Σ P_odbiorów + Σ strat TR + strata wszystkich zamkniętych łączników (wyłączniki pól
    liniowych 110 kV, wyłączniki pól SN transformatorów, sprzęgło — wynik ich nie raportuje,
    łącznik nie jest gałęzią wyniku); straty TR są stratami w miedzi P_k·(S/S_r)² — gałąź
    magnesowania nie wchodzi do rozpływu. Tor bez transformatora (jeden TR, łącznik szyn
    110 kV otwarty) nie oddaje mocy."""
    sekcje, liczba_tr, sprzeglo, rezerwowy = _parametry(uklad)
    budowa, migawka = _zbuduj(klient, "110kV", sekcje, liczba_tr, sprzeglo, "open", rezerwowy)
    metryki = _bieg(klient, budowa.case_id, "LOAD_FLOW")
    zrodla = migawka["sources"]
    assert len(zrodla) == 2
    p_zrodla = sum(metryki[z["ref_id"]]["P_MW"] for z in zrodla)
    wyniki_tr = [
        metryki[t["ref_id"]]
        for numer, t in enumerate(sorted(migawka["transformers"], key=lambda t: t["ref_id"]), 1)
        if numer != rezerwowy
    ]
    p_odbiorow = sum(p for p, _q in (ODBIOR_S1, ODBIOR_S2)[:sekcje])
    straty = sum(w["LOSSES_P_MW"] for w in wyniki_tr)
    oddanie_ponad_tr = p_zrodla - sum(w["P_MW"] for w in wyniki_tr)
    niezbilansowanie = p_zrodla - (p_odbiorow + straty)
    if _sprzeglo_przewodzi(sekcje, sprzeglo):
        # Górne ograniczenie straty łączników: CAŁA moc odbiorów przez sprzęgło, CAŁA przez
        # wyłączniki pól SN pracujących transformatorów (Σ I² ≤ (Σ I)²) i CAŁA przez
        # wyłączniki pól liniowych 110 kV (prąd sprowadzony przekładnią 15/110), każdy człon
        # 3·I²·R_ł przy I = S/(√3·U_min sekcji).
        s_calk = math.hypot(sum(p for p, _ in (ODBIOR_S1, ODBIOR_S2)), 3.5)
        u_min = min(metryki[sz]["U_kV"] for sz in _sekcje(migawka))
        prad_max = s_calk / (math.sqrt(3.0) * u_min)
        strata_ogniwa = 3.0 * prad_max**2 * Z_LACZNIKA_ROZPLYWU_OHM.real
        strata_wn_max = strata_ogniwa * (U_N_SN_KV / U_N_WN_KV) ** 2
        strata_max = 2.0 * strata_ogniwa + strata_wn_max
        assert -TOLERANCJA_NR_MW <= oddanie_ponad_tr <= strata_wn_max + TOLERANCJA_NR_MW, (
            oddanie_ponad_tr,
            strata_wn_max,
        )
        assert -TOLERANCJA_NR_MW <= niezbilansowanie <= strata_max + TOLERANCJA_NR_MW, (
            niezbilansowanie,
            strata_max,
        )
    else:
        # Bez przewodzącego sprzęgła bilans domyka DOKŁADNIE strata zamkniętych wyłączników
        # pól SN transformatorów i pól liniowych 110 kV (rozpływ jej nie raportuje — łącznik
        # nie jest gałęzią wyniku); moc źródła ponad moc zacisków 110 kV transformatorów to
        # DOKŁADNIE strata wyłączników pól liniowych 110 kV.
        referencja = [
            _rozplyw_niezalezny(
                len(indeksy_tr),
                sum((ODBIOR_S1, ODBIOR_S2)[s][0] for s in indeksy_sekcji),
                sum((ODBIOR_S1, ODBIOR_S2)[s][1] for s in indeksy_sekcji),
            )
            for indeksy_sekcji, indeksy_tr in _wyspy(sekcje, liczba_tr, sprzeglo, rezerwowy)
        ]
        straty_wn = sum(r[3] for r in referencja)
        assert oddanie_ponad_tr == pytest.approx(straty_wn, abs=TOLERANCJA_NR_MW)
        assert niezbilansowanie == pytest.approx(
            sum(r[2] for r in referencja) + straty_wn, abs=TOLERANCJA_NR_MW
        )
    typ = get_default_mv_catalog().get_transformer_type(TRANSFORMATOR_WN_SN)
    assert typ is not None
    for w in wyniki_tr:
        miedz = typ.pk_kw / 1000.0 * (w["S_MVA"] / typ.rated_power_mva) ** 2
        # Moc pozorna S_MVA jest mierzona na zacisku 110 kV przy napięciu 1,0 pu, a straty
        # liczą się prądem gałęzi; I·U_n ≠ S przy U ≠ U_n — różnica ≤ 2 % w (S/S_r)².
        assert w["LOSSES_P_MW"] == pytest.approx(miedz, rel=2e-2)


@pytest.mark.parametrize("tryb", TRYBY)
def test_otwarte_sprzeglo_sekcja_bez_zasilania_jest_bez_napiecia(
    klient: TestClient, tryb: str
) -> None:
    """Sekcja 2 bez własnego zasilania (równoważnik SN na sekcji 1 albo jedyny TR na S1)
    i sprzęgło otwarte operacją łączeniową: walidator E065 (IMPORTANT, kod kanoniczny
    `source.gpz_section_unsupplied`), a bieg NIE jest odmawiany — karta GPZ-H5 (R7): rozpływ
    i zwarcie liczą część zasilaną, sekcja odcięta jest w wynikach bez napięcia (brak
    wartości, nie zero). Odmowę biegu daje wyłącznie model bez żadnego źródła."""
    budowa, migawka = _zbuduj(klient, tryb, 2, 1 if tryb == "110kV" else 0, "open")
    (sprz,) = _sprzegla(migawka)
    s1, s2 = _sekcje(migawka)
    walidacja = klient.get(f"/api/cases/{budowa.case_id}/enm/validate").json()
    e065 = [z for z in walidacja["issues"] if z["code"] == "E065"]
    assert len(e065) == 1, walidacja["issues"]
    (zgloszenie,) = e065
    assert zgloszenie["severity"] == "IMPORTANT"
    assert zgloszenie["element_refs"] == [s2, sprz["ref_id"]]
    assert "Sekcja GPZ bez zasilania" in zgloszenie["message_pl"]
    assert "„Sekcja 2”" in zgloszenie["message_pl"]
    assert "sprzęgło „Sprzęgło sekcji GPZ 1-2” jest otwarte" in zgloszenie["message_pl"]
    assert "sekcja odcięta jest w wynikach bez napięcia" in zgloszenie["message_pl"]
    assert "sprzęgło sprzęgło" not in zgloszenie["message_pl"]
    gotowosc = klient.get(f"/api/cases/{budowa.case_id}/enm/readiness").json()
    assert "E065" not in {b.get("code") for b in gotowosc["readiness"]["blockers"]}
    # Panel gotowości inżynierskiej: kod kanoniczny rejestru gotowości i akcja naprawcza
    # prowadząca do otwartego sprzęgła (most `domain/readiness_bridge.py`).
    panel = klient.get(f"/api/cases/{budowa.case_id}/engineering-readiness").json()
    (wpis,) = (z for z in panel["issues"] if z["code"] == "E065")
    assert wpis["canonical_code"] == "source.gpz_section_unsupplied"
    assert wpis["canonical_level"] != "BLOCKER"
    assert wpis["fix_action"] is not None
    assert wpis["fix_action"]["element_ref"] == sprz["ref_id"], wpis["fix_action"]
    rozplyw = _bieg(klient, budowa.case_id, "LOAD_FLOW")
    assert rozplyw[s1]["U_kV"] > 0.0
    assert "U_kV" not in rozplyw.get(s2, {}), rozplyw.get(s2)
    zwarcie = _bieg(klient, budowa.case_id, "SC_3F")
    assert zwarcie[s1]["IK_3F_A"] > 0.0
    assert "IK_3F_A" not in zwarcie.get(s2, {}), zwarcie.get(s2)


@pytest.mark.parametrize("tryb", TRYBY)
def test_zamkniete_sprzeglo_zasila_sekcje_2_bez_zgloszenia(klient: TestClient, tryb: str) -> None:
    budowa, _migawka = _zbuduj(klient, tryb, 2, 1 if tryb == "110kV" else 0, "closed")
    walidacja = klient.get(f"/api/cases/{budowa.case_id}/enm/validate").json()
    assert not [z for z in walidacja["issues"] if z["code"] == "E065"]


# ---------------------------------------------------------------------------
# Zwarcie 3F — iloczyn pełny z niezależnym IEC 60909
# ---------------------------------------------------------------------------

#: (tryb, układ) — układy standardu H5 w stanie normalnym i równoważnik SN (1, 2 sekcje).
ILOCZYN_ZWARCIA = [("110kV", uklad) for uklad in UKLADY_H5] + [("SN", "1S"), ("SN", "2S")]

#: Przekładnia znamionowa transformatora 110/15 kV (przeliczenie impedancji na stronę SN).
T_R = U_N_WN_KV / U_N_SN_KV


@pytest.mark.parametrize(("tryb", "uklad"), ILOCZYN_ZWARCIA)
def test_zwarcie_3f_na_sekcjach_z_niezaleznego_iec60909(
    klient: TestClient, tryb: str, uklad: str
) -> None:
    if tryb == "SN":
        sekcje, liczba_tr, sprzeglo, rezerwowy = int(uklad[0]), 0, "closed", None
    else:
        sekcje, liczba_tr, sprzeglo, rezerwowy = _parametry(uklad)
    budowa, migawka = _zbuduj(klient, tryb, sekcje, liczba_tr, sprzeglo, "open", rezerwowy)
    metryki = _bieg(klient, budowa.case_id, "SC_3F")
    szyny = _sekcje(migawka)
    if tryb == "SN":
        oczekiwane_sn = {s: _ik_niezalezne_sn_ka() for s in range(sekcje)}
    else:
        z_th = _impedancje_thevenina_110kv(sekcje, liczba_tr, sprzeglo, rezerwowy)
        oczekiwane_sn = {
            s: C_MAX * U_N_SN_KV / (math.sqrt(3.0) * abs(z_th[f"S{s + 1}"])) for s in range(sekcje)
        }
    for s, oczekiwane in oczekiwane_sn.items():
        # Tolerancja względna 1·10⁻⁹: solver i rachunek niezależny liczą ten sam wzór
        # normowy na tych samych danych katalogu — różnica wyłącznie zmiennoprzecinkowa.
        assert metryki[szyny[s]]["IK_3F_A"] == pytest.approx(oczekiwane, rel=1e-9), (
            tryb,
            uklad,
            s,
        )
        assert metryki[szyny[s]]["SK_MVA"] == pytest.approx(
            math.sqrt(3.0) * U_N_SN_KV * oczekiwane, rel=1e-9
        )
    if tryb == "110kV":
        # Zwarcie na szynie 110 kV: tor zasilania sekcji i — gdy dwa pracujące
        # transformatory łączy strona SN — tor drugiej sekcji drogą zwrotną przez oba
        # transformatory; impedancja Thevenina węzła przeliczona na stronę 110 kV przez t_r².
        for numer, szyna_wn in enumerate(_szyny_wn(migawka), start=1):
            oczekiwane = C_MAX * U_N_WN_KV / (math.sqrt(3.0) * abs(z_th[f"W{numer}"]) * T_R**2)
            assert metryki[szyna_wn]["IK_3F_A"] == pytest.approx(oczekiwane, rel=1e-9), (
                numer,
                uklad,
            )


def test_kazdy_transformator_ma_wlasny_tor_zasilania(klient: TestClient) -> None:
    """Regresja dawnego modelu (szyna 110 kV na transformator, równoważnik tylko na TR1 —
    pozostałe transformatory bez zasilania od strony 110 kV): w układzie H5 z rezerwą ukrytą
    każda sekcja SN jest zasilana z WŁASNEGO toru 110 kV, więc prąd zwarcia obu sekcji jest
    równy Z_Qt + K_T·Z_T, a każda szyna 110 kV widzi wyłącznie swój tor (strona SN rozcięta
    otwartym sprzęgłem — brak drogi zwrotnej)."""
    budowa, migawka = _zbuduj(klient, "110kV", 2, 2, "open")
    metryki = _bieg(klient, budowa.case_id, "SC_3F")
    z_t, x_t = _tabliczka_tr()
    k_t = 0.95 * C_MAX / (1.0 + 0.6 * x_t)
    ik_sekcji = (
        C_MAX * U_N_SN_KV / (math.sqrt(3.0) * abs(_impedancja_sieci_sn("110kV") + k_t * z_t))
    )
    for szyna in _sekcje(migawka):
        assert metryki[szyna]["IK_3F_A"] == pytest.approx(ik_sekcji, rel=1e-9), szyna
    for szyna_wn in _szyny_wn(migawka):
        assert metryki[szyna_wn]["IK_3F_A"] == pytest.approx(
            SK_WN_MVA / (math.sqrt(3.0) * U_N_WN_KV), rel=1e-9
        )


# ---------------------------------------------------------------------------
# E066: transformator GPZ bez równoważnika po stronie 110 kV (model sprzed karty)
# ---------------------------------------------------------------------------

#: Archiwum produktu sprzed karty W5-B (zamrożone dane historyczne) — źródło KSZTAŁTU
#: dawnej fikcji: równoważnik na szynach SN + transformator 110/SN do szyny pomocniczej.
ARCHIWUM_SPRZED_KARTY = (
    Path(__file__).parent / "migrations" / "dane" / "substrat52s_przed_w5b.enm.json.gz"
)

#: Iloczyn cech E066: {stan GPZ: 110 kV z operacji, SN z operacji, SN + dawny TR,
#: 110 kV + dawny TR obok rzeczywistych} × {1, 2 sekcje} × {sprzęgło zamknięte, otwarte}
#: × {dawny TR na sekcji 1, na sekcji ostatniej}. Zgłoszenie powstaje WYŁĄCZNIE dla
#: transformatora, którego szyna górna nie leży w domenie napięciowej równoważnika.
ILOCZYN_E066 = [
    (stan, sekcje, sprzeglo, sekcja_tr)
    for stan in ("110kV", "SN", "SN+dawny_TR", "110kV+dawny_TR")
    for sekcje in (1, 2)
    for sprzeglo in (("closed",) if sekcje == 1 else ("closed", "open"))
    for sekcja_tr in ((1,) if sekcje == 1 or "dawny" not in stan else (1, 2))
]


def _wstaw_dawny_transformator(
    klient: TestClient, budowa: KlientBudowy, migawka: dict[str, Any], sekcja_tr: int
) -> dict[str, Any]:
    """Zapisz w magazynie model z dawnym transformatorem GPZ (kształt z archiwum sprzed
    karty: szyna pomocnicza 110 kV bez równoważnika + TR 110/SN do sekcji SN)."""
    archiwum = json.loads(gzip.decompress(ARCHIWUM_SPRZED_KARTY.read_bytes()))["enm"]
    (wzor_tr,) = (t for t in archiwum["transformers"] if "gpz_wn_sn_transformer" in t["tags"])
    (wzor_szyny,) = (b for b in archiwum["buses"] if b["ref_id"] == wzor_tr["hv_bus_ref"])
    prefiks = _gpz(migawka)["ref_id"].removesuffix("/substation")
    szyna = {
        **wzor_szyny,
        "ref_id": f"{prefiks}/transformer/009/bus_110",
        "id": "00000000-0000-5000-8000-000000000066",
        "name": "Szyna 110 kV TR dawny",
        "meta": {},
    }
    trafo = {
        **wzor_tr,
        "ref_id": f"{prefiks}/transformer/009/wn_sn",
        "id": "00000000-0000-5000-8000-000000000067",
        "name": "TR dawny 110/15 kV",
        "hv_bus_ref": szyna["ref_id"],
        "lv_bus_ref": _sekcje(migawka)[sekcja_tr - 1],
        "meta": {},
    }
    model = {
        **migawka,
        "buses": [*migawka["buses"], szyna],
        "transformers": [*migawka["transformers"], trafo],
    }
    # Droga importu archiwum projektu (`ProjectArchiveService` → `restore_enm`, zapis 1:1
    # bez operacji) — jedyna realna droga modelu sprzed karty do aplikacji; `PUT /enm`
    # w aplikacji produkcyjnej jest zamknięte (405).
    from uuid import UUID

    from enm.klucz_twin import klucz_twin_projektu
    from enm.store import restore_enm

    projekt = klient.get(f"/api/study-cases/{budowa.case_id}").json()["project_id"]
    assert restore_enm(klucz_twin_projektu(UUID(projekt)), model) is not None
    return trafo


@pytest.mark.parametrize(("stan", "sekcje", "sprzeglo", "sekcja_tr"), ILOCZYN_E066)
def test_transformator_gpz_bez_rownowaznika_wn_blokuje_gotowosc(
    klient: TestClient, stan: str, sekcje: int, sprzeglo: str, sekcja_tr: int
) -> None:
    tryb = stan.split("+")[0]
    # Tryb 110 kV: dwa transformatory w układzie H5 — przy jednej sekcji SN drugi rezerwowy,
    # przy dwóch sekcjach z łącznikiem zamkniętym rezerwa jawna, z otwartym rezerwa ukryta.
    rezerwowy = 2 if tryb == "110kV" and (sekcje == 1 or sprzeglo == "closed") else None
    budowa, migawka = _zbuduj(
        klient, tryb, sekcje, 2 if tryb == "110kV" else 0, sprzeglo, rezerwowy=rezerwowy
    )
    dawny = (
        _wstaw_dawny_transformator(klient, budowa, migawka, sekcja_tr) if "dawny" in stan else None
    )
    walidacja = klient.get(f"/api/cases/{budowa.case_id}/enm/validate").json()
    e066 = [z for z in walidacja["issues"] if z["code"] == "E066"]
    if dawny is None:
        assert not e066, e066
        return
    (zgloszenie,) = e066
    assert zgloszenie["severity"] == "BLOCKER"
    assert zgloszenie["element_refs"] == [dawny["ref_id"], dawny["hv_bus_ref"]]
    tekst = zgloszenie["message_pl"]
    assert "Transformator GPZ bez zasilania od strony 110 kV" in tekst
    assert "„TR dawny 110/15 kV”" in tekst and "„Szyna 110 kV TR dawny”" in tekst
    # Przyczyna nazwana wg trybu: równoważnik na szynach SN zawiera impedancję
    # transformatorów; przy równoważniku 110 kV — szyna dawnego TR jest poza jego domeną.
    assert ("zawiera już impedancję" in tekst) is (tryb == "SN"), tekst
    gotowosc = klient.get(f"/api/cases/{budowa.case_id}/enm/readiness").json()
    assert gotowosc["readiness"]["ready"] is False
    assert "E066" in {b.get("code") for b in gotowosc["readiness"]["blockers"]}
    panel = klient.get(f"/api/cases/{budowa.case_id}/engineering-readiness").json()
    (wpis,) = (z for z in panel["issues"] if z["code"] == "E066")
    assert wpis["canonical_code"] == "source.gpz_transformer_hv_unsupplied"
    assert wpis["canonical_level"] == "BLOCKER"
    assert wpis["fix_action"]["element_ref"] == dawny["ref_id"], wpis["fix_action"]
    for typ in ("LOAD_FLOW", "SC_3F"):
        zlecenie = klient.post(
            f"/api/execution/study-cases/{budowa.case_id}/runs",
            json={"analysis_type": typ, "solver_input": {}},
        )
        assert zlecenie.status_code == 409, zlecenie.text
        assert "Transformator GPZ bez zasilania od strony 110 kV" in zlecenie.text


def test_e066_zasilanie_strony_gornej_z_grafu_bez_transformatorow_gpz() -> None:
    """Predykat E066 czyta SKŁADOWĄ szyny górnej w grafie „w ruchu" bez transformatorów
    WN/SN GPZ i pyta, czy jest martwa (bez źródła, odbioru i generatora) — nie samą szynę
    i nie domenę napięciową. Iloczyn: {równoważnik na szynach SN (archiwum), równoważnik na
    innej szynie 110 kV połączonej linią (zamkniętą, otwartą), równoważnik 220 kV za
    transformatorem sieci WN, linia 110 kV do szyny bez źródła, odbiór albo generator po
    stronie górnej}."""
    from enm.models import EnergyNetworkModel
    from enm.validator import transformatory_gpz_bez_zasilania_wn

    archiwum = json.loads(gzip.decompress(ARCHIWUM_SPRZED_KARTY.read_bytes()))["enm"]
    model = EnergyNetworkModel.model_validate(_przygotuj(archiwum))
    (trafo,) = (t for t in model.transformers if "gpz_wn_sn_transformer" in t.tags)

    def _bez_zasilania(m: EnergyNetworkModel) -> list[str]:
        return [t.ref_id for t, _s, _b in transformatory_gpz_bez_zasilania_wn(m)]

    # Archiwum: równoważnik na sekcji SN, TR do martwej szyny pomocniczej — E066.
    assert _bez_zasilania(model) == [trafo.ref_id]
    (szyna_wn,) = (b for b in model.buses if b.ref_id == trafo.hv_bus_ref)
    druga = szyna_wn.model_copy(update={"ref_id": "wn/druga", "name": "Szyna 110 kV druga"})
    kabel = next(g for g in model.branches if g.type == "cable")
    linia = kabel.model_copy(
        update={"ref_id": "wn/linia", "from_bus_ref": szyna_wn.ref_id, "to_bus_ref": "wn/druga"}
    )
    zrodlo = model.sources[0]
    # Linia 110 kV do szyny bez źródła — dalej E066 (składowa bez równoważnika).
    bez_zrodla = model.model_copy(
        update={"buses": [*model.buses, druga], "branches": [*model.branches, linia]}
    )
    assert _bez_zasilania(bez_zrodla) == [trafo.ref_id]
    # Równoważnik przeniesiony na drugą szynę 110 kV (linia w ruchu) — zasila TR.
    przez_linie = bez_zrodla.model_copy(
        update={"sources": [zrodlo.model_copy(update={"bus_ref": "wn/druga"})]}
    )
    assert _bez_zasilania(przez_linie) == []
    # Ta sama linia otwarta — szyna górna znów bez zasilania.
    otwarta = przez_linie.model_copy(
        update={
            "branches": [
                g.model_copy(update={"status": "open"}) if g.ref_id == "wn/linia" else g
                for g in przez_linie.branches
            ]
        }
    )
    assert _bez_zasilania(otwarta) == [trafo.ref_id]
    # Równoważnik 220 kV za transformatorem sieci WN (220/110 kV) — zasilanie przechodzi.
    szyna_220 = szyna_wn.model_copy(
        update={"ref_id": "wn/220", "name": "Szyna 220 kV", "voltage_kv": 220.0}
    )
    trafo_wn = trafo.model_copy(
        update={"ref_id": "wn/tr_220_110", "hv_bus_ref": "wn/220", "lv_bus_ref": szyna_wn.ref_id}
    )
    przez_trafo_wn = model.model_copy(
        update={
            "buses": [*model.buses, szyna_220],
            "transformers": [*model.transformers, trafo_wn],
            "sources": [zrodlo.model_copy(update={"bus_ref": "wn/220"})],
        }
    )
    assert _bez_zasilania(przez_trafo_wn) == []
    # Transformator podwyższający: równoważnik na sekcji, a po stronie górnej odbiór albo
    # generator (sieci benchmarkowe — węzeł bilansujący na sekcji, sieć WN za
    # transformatorem) — moc płynie w górę, to nie jest fikcja.
    wzor_odbioru = next(o for o in model.loads)
    odbior_wn = wzor_odbioru.model_copy(update={"ref_id": "wn/odbior", "bus_ref": "wn/druga"})
    assert _bez_zasilania(bez_zrodla.model_copy(update={"loads": [*model.loads, odbior_wn]})) == []
    wzor_gen = next(g for g in model.generators)
    gen_wn = wzor_gen.model_copy(update={"ref_id": "wn/gen", "bus_ref": "wn/druga"})
    assert (
        _bez_zasilania(bez_zrodla.model_copy(update={"generators": [*model.generators, gen_wn]}))
        == []
    )


#: Iloczyn: {liczba TR GPZ: 1, 2} × {wskazanie transformatora: automatyczne ze stacji,
#: jawne TR1} × {falownik: 15 kV (BESS), 0,4 kV (PV)}.
ILOCZYN_TR_BLOKOWEGO = [
    (liczba_tr, wskazanie, (technologia, katalog))
    for liczba_tr in (1, 2)
    for wskazanie in ("auto", "jawne")
    for technologia, katalog in (
        ("BESS", "conv-bess-1mw-2mwh-15kv"),
        ("PV", "conv-pv-nn-0p5mw-0p4kv"),
    )
]


@pytest.mark.parametrize(("liczba_tr", "wskazanie", "falownik"), ILOCZYN_TR_BLOKOWEGO)
def test_transformator_zasilajacy_gpz_nie_jest_transformatorem_blokowym(
    klient: TestClient, liczba_tr: int, wskazanie: str, falownik: tuple[str, str]
) -> None:
    """Źródło przekształtnikowe „przez transformator blokowy" na stacji GPZ: transformator
    110/SN zasilający sekcję SN nigdy nie zostaje transformatorem blokowym — ani
    automatycznie (jedyny „transformator stacji"), ani wskazany wprost. Dawniej przy jednym
    TR operacja przyjmowała go jako blokowy i stawiała falownik na sekcji SN 15 kV."""
    budowa, migawka = _zbuduj(
        klient, "110kV", 1, liczba_tr, "closed", rezerwowy=2 if liczba_tr == 2 else None
    )
    technologia, katalog = falownik
    ladunek: dict[str, Any] = {
        "source_technology": technologia,
        "connection_variant": "block_transformer",
        "catalog_ref": katalog,
        "station_ref": _gpz(migawka)["ref_id"],
    }
    if wskazanie == "jawne":
        ladunek["blocking_transformer_ref"] = sorted(t["ref_id"] for t in migawka["transformers"])[
            0
        ]
    wynik = _surowa_operacja(klient, budowa.case_id, "add_converter_source", ladunek)
    if wskazanie == "auto":
        assert wynik.get("error_code") == "generator.block_transformer_missing", wynik
    else:
        assert wynik.get("error_code") == "generator.block_transformer_invalid", wynik
        assert "granicą zasilania sieci" in str(wynik.get("error")), wynik
    assert not budowa.migawka()["generators"]


@pytest.mark.parametrize("liczba_tr", [1, 2])
def test_szyna_nn_stacji_gpz_nie_jest_strona_dolna_transformatora_zasilajacego(
    klient: TestClient, liczba_tr: int
) -> None:
    """`POST …/generators`, wariant po stronie nN, bez wskazanej szyny: końcówka szuka szyny
    nN po stronie dolnej transformatora STACJI. Transformator zasilający GPZ nie jest
    transformatorem stacji SN/nN — jego strona dolna to sekcja SN 15 kV, więc stacja GPZ
    bez rozdzielnicy nN dostaje nazwaną odmowę „brak szyny nN", a nie sekcję SN udającą
    szynę nN (dawniej tak trafiała do operacji)."""
    budowa, migawka = _zbuduj(
        klient, "110kV", 1, liczba_tr, "closed", rezerwowy=2 if liczba_tr == 2 else None
    )
    projekt = klient.get(f"/api/study-cases/{budowa.case_id}").json()["project_id"]
    odpowiedz = klient.post(
        f"/api/projects/{projekt}/cases/{budowa.case_id}/generators",
        json={
            "station_ref": _gpz(migawka)["ref_id"],
            "der_kind": "PV",
            "power_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
        },
    )
    assert odpowiedz.status_code == 422, odpowiedz.text
    assert odpowiedz.json()["detail"]["code"] == "station.nn_bus_missing", odpowiedz.text
    assert not budowa.migawka()["generators"]


def _przygotuj(surowe: dict[str, Any]) -> dict[str, Any]:
    from enm.models import EnergyNetworkModel
    from enm.store import przygotuj_model_po_odczycie

    model, _ = przygotuj_model_po_odczycie(EnergyNetworkModel.model_validate(surowe))
    return model.model_dump(mode="json")


# ---------------------------------------------------------------------------
# Wynik gałęzi transformatora: ΔU tylko między szynami tego samego napięcia
# ---------------------------------------------------------------------------


def test_spadek_napiecia_kv_nie_jest_podawany_dla_transformatora(klient: TestClient) -> None:
    """Różnica napięć szyn 110 kV i 15 kV (95 kV) nie jest spadkiem napięcia — wynik
    gałęzi transformatora nie niesie `DELTA_U_KV`; kabel SN niesie go nadal."""
    budowa, migawka = _zbuduj(klient, "110kV", 1, 1, "closed")
    budowa.odcinek_magistrali(500.0, "Odcinek pomiarowy")
    migawka = budowa.migawka()
    koniec = next(g for g in migawka["branches"] if g.get("type") == "cable")
    budowa.operacja("add_load_sn", {"bus_ref": koniec["to_bus_ref"], "p_mw": 1.0, "q_mvar": 0.3})
    metryki = _bieg(klient, budowa.case_id, "LOAD_FLOW")
    (tr,) = migawka["transformers"]
    assert "DELTA_U_KV" not in metryki[tr["ref_id"]], metryki[tr["ref_id"]]
    assert metryki[koniec["ref_id"]]["DELTA_U_KV"] > 0.0


# ---------------------------------------------------------------------------
# Determinizm: ta sama operacja → te same identyfikatory i ten sam wynik
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("tryb", TRYBY)
def test_determinizm_identyfikatorow_i_wyniku(klient: TestClient, tryb: str) -> None:
    liczba_tr = 2 if tryb == "110kV" else 0
    rezerwowy = 2 if tryb == "110kV" else None
    b1, m1 = _zbuduj(klient, tryb, 2, liczba_tr, "closed", rezerwowy=rezerwowy)
    b2, m2 = _zbuduj(klient, tryb, 2, liczba_tr, "closed", rezerwowy=rezerwowy)
    for kolekcja in ("buses", "branches", "transformers", "sources", "bays", "substations"):
        assert sorted(e["ref_id"] for e in m1.get(kolekcja, [])) == sorted(
            e["ref_id"] for e in m2.get(kolekcja, [])
        ), kolekcja
    assert _bieg(klient, b1.case_id, "SC_3F") == _bieg(klient, b2.case_id, "SC_3F")
    assert _bieg(klient, b1.case_id, "LOAD_FLOW") == _bieg(klient, b2.case_id, "LOAD_FLOW")


def test_kat_zwarcia_niezalezny_jest_spojny_z_r_x() -> None:
    """Strażnik samego rachunku niezależnego: R/X równoważnika zachowane po przeliczeniu,
    a sieć zastępcza dwóch torów odtwarza wzory zamknięte (jeden TR: Z_Qt + K_T·Z_T; dwa
    pracujące TR na wspólnej stronie SN: (Z_Qt + K_T·Z_T)/2; transformator rezerwowy nie
    zmienia impedancji; szyna 110 kV bez drogi zwrotnej: Z_Qt)."""
    for tryb in TRYBY:
        z = _impedancja_sieci_sn(tryb)
        assert z.real / z.imag == pytest.approx(0.1, rel=1e-12)
        assert cmath.phase(z) > 0.0
    z_t, x_t = _tabliczka_tr()
    k_t = 0.95 * C_MAX / (1.0 + 0.6 * x_t)
    z_q = _impedancja_sieci_sn("110kV")
    jeden = _impedancje_thevenina_110kv(1, 1, "closed")
    assert jeden["S1"] == pytest.approx(z_q + k_t * z_t, rel=1e-12)
    assert jeden["W2"] == pytest.approx(z_q, rel=1e-12)
    assert _impedancje_thevenina_110kv(1, 2, "closed", 2) == pytest.approx(jeden, rel=1e-12)
    dwa = _impedancje_thevenina_110kv(2, 2, "closed")
    assert dwa["S1"] == pytest.approx((z_q + k_t * z_t) / 2.0, rel=1e-12)
    odciete = _impedancje_thevenina_110kv(2, 1, "open")
    assert "S2" not in odciete, "sekcja odcięta nie ma impedancji Thevenina"


@pytest.mark.parametrize("droga", ["szyna_sekcji", "rejestr_stacji"])
@pytest.mark.parametrize("strona_wn", ["zasilona", "martwa"])
def test_e066_stacja_transformatora_z_jednego_zrodla(droga: str, strona_wn: str) -> None:
    """Predykaty parami (karta GPZ-H5): przynależność transformatora do GPZ i jego stacja
    pochodzą z JEDNEJ funkcji `stacje_transformatorow_zasilajacych_gpz`. Iloczyn: droga
    przynależności {szyna dolna na szynie sekcji `gpz_sections`, wyłącznie rejestr
    `transformer_refs` stacji} × strona 110 kV {zasilona, martwa}. Dawny walidator E066
    szukał stacji po szynie sekcji i dla transformatora z rejestru kończył się `KeyError`
    (bieg ze scenariuszem wyłączającym źródło, `test_is2_*`)."""
    from enm.models import EnergyNetworkModel
    from enm.topology import stacje_transformatorow_zasilajacych_gpz
    from enm.validator import ENMValidator

    from tests.cgmes.golden_enm import build_golden_enm

    enm = build_golden_enm().model_dump(mode="json")
    gpz = next(s for s in enm["substations"] if s["station_type"] == "gpz")
    if droga == "szyna_sekcji":
        gpz["gpz_sections"] = [
            {"section_id": "s1", "order": 0, "name": "Sekcja 1", "bus_ref": "bus_sn_main"}
        ]
        gpz["transformer_refs"] = []
    if strona_wn == "martwa":
        enm["sources"] = []
    model = EnergyNetworkModel.model_validate(enm)
    assert stacje_transformatorow_zasilajacych_gpz(model) == {"tr_hv_sn": gpz["ref_id"]}
    e066 = [i for i in ENMValidator().validate(model).issues if i.code == "E066"]
    if strona_wn == "zasilona":
        assert e066 == []
    else:
        assert len(e066) == 1
        assert gpz["name"] in e066[0].message_pl
