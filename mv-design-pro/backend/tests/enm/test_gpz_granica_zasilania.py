"""Karta GPZ-MODEL — GPZ jako rzeczywista granica zasilania SN w modelu ENM.

Dwa tryby równoważnika sieci GPZ (`add_grid_source_sn`):

* **równoważnik po stronie 110 kV** — jeden tor zasilania 110 kV (jedna sekcja szyn 110 kV
  z równoważnikiem), każdy transformator 110/SN przypisany JAWNIE do sekcji SN wpisem
  `transformers` (karta GPZ-H5: bez liczby transformatorów i bez przydziału domyślnego).
  Dawny układ „2 sekcje × 3 transformatory" (TR1→S1, TR2→S2, TR3→S1) jest tu WYŁĄCZNIE
  jawnym ładunkiem testowym (`_przydzial`), nie zachowaniem operacji; rozpływ przez każdy
  transformator i wkład zwarciowy wynikają z solvera dla rzeczywistego stanu sprzęgła.
  Stan normalny łącznika szyn SN wynika z trybu rezerwy (ENEA Zeszyt 1 §26.10.5): rezerwa
  ukryta — otwarty, rezerwa jawna — zamknięty; stan badany ustawia potem operacja
  łączeniowa (`open_switch` / `close_switch`). Układ ENEA H5 (dwa tory L1/L2) bada
  `tests/enm/test_gpz_h5_akceptacja.py`;
* **równoważnik na szynach SN** — moc zwarciowa widziana z szyn SN zawiera już impedancję
  transformatorów, więc transformatory NIE są elementami modelu (żądanie ich jest
  odmawiane z przyczyną i wskazaniem trybu 110 kV); jeden równoważnik na sekcji 1, sekcja
  odcięta otwartym sprzęgłem jest zgłoszeniem „sekcja GPZ bez zasilania" (E065, IMPORTANT)
  i w wynikach jest bez napięcia (karta GPZ-H5, R7).

ILOCZYN CECH (reguła KLASA, NIE INSTANCJA): {1, 2 sekcje} × {1, 3 transformatory} ×
{sprzęgło zamknięte, otwarte} × {równoważnik 110 kV, równoważnik SN}. Kombinacje bez
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
  wzór 12a), I″_k = c·U_n/(√3·|Z_k|) (wzór 29), c_max = 1,1 (tab. 1, sieci 1–35 kV);
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
    """Jawny przydział (sekcja 110 kV, sekcja SN) transformatorów ładunku TESTOWEGO: dawny
    układ TR(i) → S(i mod sekcje) zapisany wprost, jedna sekcja 110 kV."""
    return [(1, i % sekcje + 1) for i in range(liczba_tr)]


def _tryb_rezerwy(sekcje: int, liczba_tr: int) -> str | None:
    """Tryb rezerwy ładunku testowego: jeden transformator na dwie sekcje — rezerwa jawna
    (łącznik szyn SN normalnie zamknięty, jedyna droga zasilania sekcji 2); co najmniej dwa
    transformatory — rezerwa ukryta (każda sekcja ze swojego transformatora)."""
    if sekcje >= 2 and liczba_tr == 1:
        return "explicit"
    if sekcje >= 2 or liczba_tr >= 2:
        return "hidden"
    return None


def _ladunek_gpz_110kv(sekcje: int, liczba_tr: int, **dodatkowe: Any) -> dict[str, Any]:
    ladunek: dict[str, Any] = {
        "voltage_kv": U_N_SN_KV,
        "sections_count": sekcje,
        "hv_sections": [
            {
                "supply": {
                    "line_name": "Linia 110 kV zasilająca",
                    "supplying_station_name": (
                        "Stacja zasilająca — przykładowe dane przypadku testowego"
                    ),
                    "manual_equivalent": {
                        "hv_voltage_kv": U_N_WN_KV,
                        "sk3_hv_mva": SK_WN_MVA,
                        "rx_ratio": RX_WN,
                    },
                }
            }
        ],
        "transformers": [
            {
                "hv_section": wn,
                "sn_section": sn,
                "transformer_catalog_binding": wiazanie("TRAFO_SN_NN", TRANSFORMATOR_WN_SN),
            }
            for wn, sn in _przydzial(sekcje, liczba_tr)
        ],
    }
    tryb = _tryb_rezerwy(sekcje, liczba_tr)
    if tryb is not None:
        ladunek["reserve_mode"] = tryb
    return {**ladunek, **dodatkowe}


def _gpz(migawka: dict[str, Any]) -> dict[str, Any]:
    (gpz,) = (s for s in migawka["substations"] if s.get("station_type") == "gpz")
    return dict(gpz)


def _sekcje(migawka: dict[str, Any]) -> list[str]:
    return [str(s["bus_ref"]) for s in _gpz(migawka)["gpz_sections"]]


def _sprzegla(migawka: dict[str, Any]) -> list[dict[str, Any]]:
    return [g for g in migawka["branches"] if g.get("type") == "bus_coupler"]


def _zbuduj(
    klient: TestClient, tryb: str, sekcje: int, liczba_tr: int, sprzeglo: str
) -> tuple[KlientBudowy, dict[str, Any]]:
    """GPZ w zadanym trybie + odbiory sekcji + stan sprzęgła ustawiony ISTNIEJĄCĄ operacją
    `open_switch` (ta sama, którą inspektor i schemat otwierają łącznik — karta W5-C)."""
    budowa = KlientBudowy(klient, f"granica-{tryb}-{sekcje}s-{liczba_tr}tr-{sprzeglo}")
    if tryb == "110kV":
        budowa.operacja("add_grid_source_sn", _ladunek_gpz_110kv(sekcje, liczba_tr))
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


def _ik_niezalezne_ka(tryb: str, liczba_tr_zasilajacych: int) -> float:
    """I″_k3 na szynie sekcji SN [kA]: równoważnik + n transformatorów równolegle z K_T."""
    z_k = _impedancja_sieci_sn(tryb)
    if tryb == "110kV":
        z_t, x_t = _tabliczka_tr()
        k_t = 0.95 * C_MAX / (1.0 + 0.6 * x_t)
        z_k += k_t * z_t / liczba_tr_zasilajacych
    return C_MAX * U_N_SN_KV / (math.sqrt(3.0) * abs(z_k))


def _rozplyw_niezalezny(liczba_tr: int, p_mw: float, q_mvar: float) -> tuple[float, float, float]:
    """(U_SN [kV], P po stronie 110 kV na JEDEN transformator [MW], straty [MW]) dla wyspy
    „szyna 110 kV (węzeł bilansujący, U = U_n) → n transformatorów → odbiór PQ".

    Obwód zastępczy po stronie SN, na fazę: V = V₀ − (Z_T/n)·conj(S/(3V)); przekładnia
    znamionowa 110/15 równa ilorazowi napięć szyn (zaczep neutralny), więc V₀ = 15/√3 kV.
    Gałąź poprzeczna magnesowania nie wchodzi do rozpływu (tor solvera — patrz
    `test_bilans_mocy_rozplywu`, który przypina, że straty są wyłącznie stratami w miedzi)."""
    z_t, _x_t = _tabliczka_tr()
    z_eq = z_t / liczba_tr
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
    return math.sqrt(3.0) * abs(v), (p_mw + straty) / liczba_tr, straty


def _po_sufiksie(metryki: dict[str, dict[str, float]], sufiks: str) -> dict[str, float]:
    (wpis,) = (m for ref, m in metryki.items() if ref.endswith(sufiks))
    return wpis


# ---------------------------------------------------------------------------
# Struktura modelu: jedna szyna 110 kV, równoważnik na niej, TR → sekcje
# ---------------------------------------------------------------------------

#: Iloczyn trybu 110 kV: (sekcje, transformatory).
ILOCZYN_110KV = [(1, 1), (1, 3), (2, 1), (2, 3)]


@pytest.mark.parametrize(("sekcje", "liczba_tr"), ILOCZYN_110KV)
def test_tryb_110kv_jedna_szyna_wn_wszystkie_tr_i_rownowaznik(
    klient: TestClient, sekcje: int, liczba_tr: int
) -> None:
    _budowa, migawka = _zbuduj(klient, "110kV", sekcje, liczba_tr, "closed")
    gpz = _gpz(migawka)
    szyny_wn = [b for b in migawka["buses"] if "gpz_hv_bus" in (b.get("tags") or [])]
    assert len(szyny_wn) == 1, "jeden tor zasilania — jedna sekcja szyn 110 kV"
    (szyna_wn,) = szyny_wn
    assert szyna_wn["voltage_kv"] == U_N_WN_KV
    assert [s["bus_ref"] for s in gpz["gpz_hv_sections"]] == [szyna_wn["ref_id"]]
    (zrodlo,) = migawka["sources"]
    assert zrodlo["bus_ref"] == szyna_wn["ref_id"], "równoważnik stoi na szynie 110 kV"
    assert gpz["gpz_hv_sections"][0]["incoming_source_ref"] == zrodlo["ref_id"]
    transformatory = sorted(migawka["transformers"], key=lambda t: t["ref_id"])
    assert len(transformatory) == liczba_tr
    szyny_sn = _sekcje(migawka)
    # Przydział z JAWNEGO ładunku (`_przydzial`), nie z reguły operacji.
    for tr, (_wn, sn) in zip(transformatory, _przydzial(sekcje, liczba_tr), strict=True):
        assert tr["hv_bus_ref"] == szyna_wn["ref_id"], tr["name"]
        assert tr["lv_bus_ref"] == szyny_sn[sn - 1], tr["name"]
    assert sorted(gpz["transformer_refs"]) == [t["ref_id"] for t in transformatory]
    assert len(_sprzegla(migawka)) == sekcje - 1, "sprzęgło istnieje tylko przy 2 sekcjach"


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
    ladunek = _ladunek_gpz_110kv(1, 2)
    ladunek["hv_sections"][0]["supply"]["manual_equivalent"]["hv_voltage_kv"] = 220.0
    wynik = _surowa_operacja(klient, budowa.case_id, "add_grid_source_sn", ladunek)
    assert wynik["error_code"] == "source.hv_voltage_mismatch", wynik
    assert budowa.migawka()["sources"] == []


# ---------------------------------------------------------------------------
# Nazwy pól liniowych GPZ: „Pole liniowe GPZ {sekcja}.{pole}"
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("tryb", TRYBY)
def test_nazwy_pol_liniowych_gpz_sekcja_kropka_pole(klient: TestClient, tryb: str) -> None:
    budowa = KlientBudowy(klient, f"pola-{tryb}")
    ladunek = (
        _ladunek_gpz_110kv(2, 3, line_fields_per_section=3)
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

#: (sekcje, TR, sprzęgło) z zasilaniem każdej sekcji; (2, 1, open) → osobny test E065.
ILOCZYN_ROZPLYWU = [
    (1, 1, "closed"),
    (1, 3, "closed"),
    (2, 1, "closed"),
    (2, 3, "closed"),
    (2, 3, "open"),
]


def _wyspy(sekcje: int, liczba_tr: int, sprzeglo: str) -> list[tuple[list[int], list[int]]]:
    """Wyspy zasilania: (indeksy sekcji, indeksy TR) — z przydziału TR(i) → S(i mod sekcje)."""
    if sekcje == 1 or sprzeglo == "closed":
        return [(list(range(sekcje)), list(range(liczba_tr)))]
    return [([s], [t for t in range(liczba_tr) if t % sekcje == s]) for s in range(sekcje)]


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


@pytest.mark.parametrize(("sekcje", "liczba_tr", "sprzeglo"), ILOCZYN_ROZPLYWU)
def test_rozplyw_przez_kazdy_transformator_z_niezaleznego_obwodu(
    klient: TestClient, sekcje: int, liczba_tr: int, sprzeglo: str
) -> None:
    budowa, migawka = _zbuduj(klient, "110kV", sekcje, liczba_tr, sprzeglo)
    metryki = _bieg(klient, budowa.case_id, "LOAD_FLOW")
    transformatory = sorted(migawka["transformers"], key=lambda t: t["ref_id"])
    szyny = _sekcje(migawka)
    odbiory = (ODBIOR_S1, ODBIOR_S2)
    tolerancja_p, tolerancja_u = _tolerancje_rozplywu(sekcje, sprzeglo)
    for indeksy_sekcji, indeksy_tr in _wyspy(sekcje, liczba_tr, sprzeglo):
        p = sum(odbiory[s][0] for s in indeksy_sekcji)
        q = sum(odbiory[s][1] for s in indeksy_sekcji)
        u_kv, p_na_tr, _straty = _rozplyw_niezalezny(len(indeksy_tr), p, q)
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


@pytest.mark.parametrize(("sekcje", "liczba_tr", "sprzeglo"), ILOCZYN_ROZPLYWU)
def test_bilans_mocy_rozplywu(
    klient: TestClient, sekcje: int, liczba_tr: int, sprzeglo: str
) -> None:
    """P_źródła = Σ P_TR (strona 110 kV) = Σ P_odbiorów + Σ strat TR (+ strata łącznika
    sprzęgła, której wynik nie raportuje); straty TR są stratami w miedzi P_k·(S/S_r)² —
    gałąź magnesowania nie wchodzi do rozpływu."""
    budowa, migawka = _zbuduj(klient, "110kV", sekcje, liczba_tr, sprzeglo)
    metryki = _bieg(klient, budowa.case_id, "LOAD_FLOW")
    (zrodlo,) = migawka["sources"]
    p_zrodla = metryki[zrodlo["ref_id"]]["P_MW"]
    wyniki_tr = [metryki[t["ref_id"]] for t in migawka["transformers"]]
    p_odbiorow = sum(p for p, _q in (ODBIOR_S1, ODBIOR_S2)[:sekcje])
    straty = sum(w["LOSSES_P_MW"] for w in wyniki_tr)
    assert p_zrodla == pytest.approx(sum(w["P_MW"] for w in wyniki_tr), abs=TOLERANCJA_NR_MW)
    niezbilansowanie = p_zrodla - (p_odbiorow + straty)
    if _sprzeglo_przewodzi(sekcje, sprzeglo):
        # Górne ograniczenie straty łącznika: CAŁA moc odbiorów przez sprzęgło,
        # 3·I²·R_ł przy I = S/(√3·U_min sekcji).
        s_calk = math.hypot(sum(p for p, _ in (ODBIOR_S1, ODBIOR_S2)), 3.5)
        u_min = min(metryki[sz]["U_kV"] for sz in _sekcje(migawka))
        prad_max = s_calk / (math.sqrt(3.0) * u_min)
        strata_max = 3.0 * prad_max**2 * Z_LACZNIKA_ROZPLYWU_OHM.real
        assert -TOLERANCJA_NR_MW <= niezbilansowanie <= strata_max + TOLERANCJA_NR_MW, (
            niezbilansowanie,
            strata_max,
        )
    else:
        assert niezbilansowanie == pytest.approx(0.0, abs=TOLERANCJA_NR_MW)
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

#: (tryb, sekcje, TR, sprzęgło) — wszystkie kombinacje z zasilaną każdą sekcją.
ILOCZYN_ZWARCIA = [
    ("110kV", 1, 1, "closed"),
    ("110kV", 1, 3, "closed"),
    ("110kV", 2, 1, "closed"),
    ("110kV", 2, 3, "closed"),
    ("110kV", 2, 3, "open"),
    ("SN", 1, 0, "closed"),
    ("SN", 2, 0, "closed"),
]


@pytest.mark.parametrize(("tryb", "sekcje", "liczba_tr", "sprzeglo"), ILOCZYN_ZWARCIA)
def test_zwarcie_3f_na_sekcjach_z_niezaleznego_iec60909(
    klient: TestClient, tryb: str, sekcje: int, liczba_tr: int, sprzeglo: str
) -> None:
    budowa, migawka = _zbuduj(klient, tryb, sekcje, liczba_tr, sprzeglo)
    metryki = _bieg(klient, budowa.case_id, "SC_3F")
    szyny = _sekcje(migawka)
    wyspy = _wyspy(sekcje, liczba_tr, sprzeglo) if tryb == "110kV" else [(list(range(sekcje)), [])]
    for indeksy_sekcji, indeksy_tr in wyspy:
        oczekiwane = _ik_niezalezne_ka(tryb, len(indeksy_tr))
        for s in indeksy_sekcji:
            # Tolerancja względna 1·10⁻⁹: solver i rachunek niezależny liczą ten sam wzór
            # normowy na tych samych danych katalogu — różnica wyłącznie zmiennoprzecinkowa.
            assert metryki[szyny[s]]["IK_3F_A"] == pytest.approx(oczekiwane, rel=1e-9), (
                tryb,
                sekcje,
                liczba_tr,
                sprzeglo,
                s,
            )
            assert metryki[szyny[s]]["SK_MVA"] == pytest.approx(
                math.sqrt(3.0) * U_N_SN_KV * oczekiwane, rel=1e-9
            )
    if tryb == "110kV":
        (szyna_wn,) = (b for b in migawka["buses"] if "gpz_hv_bus" in (b.get("tags") or []))
        # Zwarcie na szynie 110 kV: wyłącznie równoważnik (transformatory nie mają źródła
        # po stronie SN) — I″_k = S″_kQ/(√3·U_nQ), bo Z_Q = c·U_nQ²/S″_kQ.
        assert metryki[szyna_wn["ref_id"]]["IK_3F_A"] == pytest.approx(
            SK_WN_MVA / (math.sqrt(3.0) * U_N_WN_KV), rel=1e-9
        )


def test_wklad_trzech_transformatorow_rosnie_wzgledem_jednego(klient: TestClient) -> None:
    """Regresja dawnego modelu (szyna 110 kV na transformator, równoważnik tylko na TR1):
    trzy transformatory dawały prąd JEDNEGO (9,05 kA). Teraz 3 TR równolegle ≈ 23,5 kA."""
    budowa_1, m1 = _zbuduj(klient, "110kV", 1, 1, "closed")
    budowa_3, m3 = _zbuduj(klient, "110kV", 1, 3, "closed")
    ik_1 = _bieg(klient, budowa_1.case_id, "SC_3F")[_sekcje(m1)[0]]["IK_3F_A"]
    ik_3 = _bieg(klient, budowa_3.case_id, "SC_3F")[_sekcje(m3)[0]]["IK_3F_A"]
    assert ik_1 == pytest.approx(_ik_niezalezne_ka("110kV", 1), rel=1e-9)
    assert ik_3 == pytest.approx(_ik_niezalezne_ka("110kV", 3), rel=1e-9)
    assert ik_3 > 2.5 * ik_1


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
    budowa, migawka = _zbuduj(klient, tryb, sekcje, 2 if tryb == "110kV" else 0, sprzeglo)
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
    budowa, migawka = _zbuduj(klient, "110kV", 1, liczba_tr, "closed")
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
    budowa, migawka = _zbuduj(klient, "110kV", 1, liczba_tr, "closed")
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
    liczba_tr = 3 if tryb == "110kV" else 0
    b1, m1 = _zbuduj(klient, tryb, 2, liczba_tr, "closed")
    b2, m2 = _zbuduj(klient, tryb, 2, liczba_tr, "closed")
    for kolekcja in ("buses", "branches", "transformers", "sources", "bays", "substations"):
        assert sorted(e["ref_id"] for e in m1.get(kolekcja, [])) == sorted(
            e["ref_id"] for e in m2.get(kolekcja, [])
        ), kolekcja
    assert _bieg(klient, b1.case_id, "SC_3F") == _bieg(klient, b2.case_id, "SC_3F")
    assert _bieg(klient, b1.case_id, "LOAD_FLOW") == _bieg(klient, b2.case_id, "LOAD_FLOW")


def test_kat_zwarcia_niezalezny_jest_spojny_z_r_x() -> None:
    """Strażnik samego rachunku niezależnego: R/X równoważnika zachowane po przeliczeniu."""
    for tryb in TRYBY:
        z = _impedancja_sieci_sn(tryb)
        assert z.real / z.imag == pytest.approx(0.1, rel=1e-12)
        assert cmath.phase(z) > 0.0


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
