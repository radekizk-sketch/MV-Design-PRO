"""Testy katalogu analiz specjalistycznych V12.6 (karta B02-BE-TESTY, §2).

Katalog (`application/analyses/v126_katalog.py`) jest JEDNYM źródłem prawdy dla
ekranu „Analizy specjalistyczne" — te testy pinują MOCNE ZDANIA z docstringu
modułu (reguła KLASA §4: „deklaracja bez testu = fałszywa pewność"):

  * komplet 14 rodzajów kontraktu ma dokładnie jedną kartę, bez duplikatów;
  * każda karta PREZENTOWANA niesie pytanie/zakres/wielkości inżynierskie oraz
    ALBO podstawę oceny (norma cytująca solver FROZEN), ALBO jawne stwierdzenie
    braku podstawy — NIGDY oba naraz, NIGDY oba puste (zasada normowa §8);
  * każda karta WYCOFANA ma powód i jest wpisana do rejestru frontu
    (`nieprezentowane.ts::POWODY_NIEPREZENTOWANIA`) — SUMA dwóch zbiorów jest
    strażnikiem parytetu w `tests/ci/test_v126_rodzaje_parytet.py`, ten plik
    testuje TREŚĆ katalogu, nie parytet z frontem (reużycie parsera frontu
    importem, nie kopią — zero drugiego źródła prawdy o wycofaniach);
  * kolejność prezentacji katalogu i grup;
  * literały progów normatywnych katalogu są liczbami rzeczywiście stosowanymi
    przez solver FROZEN (`network_model/solvers/v126_academic.py`, B-01 — nie
    edytujemy go) — inaczej katalog cytowałby normę, której solver nie stosuje;
  * kontrakt `to_dict()` (pin kluczy dla frontu);
  * `katalog_odniesienia` wskazuje realną przestrzeń nazw `GET /api/catalog/v126/{ns}`;
  * każdy parametr projektanta (`od_uzytkownika[].klucz`) jest naprawdę czytany
    przez most albo solver — inaczej byłby to phantom (zero fabrykacji, karta
    §0 poz. 4 promptu właściciela).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from application.analyses import v126_katalog
from application.analyses.v126_katalog import (
    KATALOG_ANALIZ_V126,
    KOLEJNOSC_GRUP,
    KROTNOSC_OCHRONY_DODATKOWEJ,
    MARGINES_BIL_MIN_PROCENT,
    MARGINES_TRV_MIN_PROCENT,
    PRAD_RESZTKOWY_MAX_UDZIAL_IC,
    TDD_IEEE519_PROCENT,
    THD_U_IEEE519_PROCENT,
    THD_U_PNEN50160_PROCENT,
    UDZIAL_2H_BLOKADA_87T_PROCENT,
    WSKAZNIK_CIEPLNY_ROZRUCHU_MAX,
    ZAPAD_ROZRUCHU_MAX_PROCENT,
    grupy_do_dict,
    karta_analizy,
    katalog_do_dict,
    nazwa_parametru_pl,
)
from fastapi.testclient import TestClient
from solver_input.v126_contracts import V126AnalysisType

from tests.ci.test_v126_rodzaje_parytet import _rodzaje_nieprezentowane

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SOLVER_PY = PROJECT_ROOT / "backend" / "src" / "network_model" / "solvers" / "v126_academic.py"
V126_CONTRACTS_PY = PROJECT_ROOT / "backend" / "src" / "solver_input" / "v126_contracts.py"
API_V126_PY = PROJECT_ROOT / "backend" / "src" / "api" / "v126_academic.py"


def _tekst(sciezka: Path) -> str:
    assert sciezka.exists(), f"plik nie istnieje: {sciezka}"
    return sciezka.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Parytet z kontraktem
# ---------------------------------------------------------------------------


def test_katalog_pokrywa_dokladnie_kontrakt_bez_duplikatow() -> None:
    kody_katalogu = [karta.kod for karta in KATALOG_ANALIZ_V126]
    assert len(kody_katalogu) == len(set(kody_katalogu)), (
        f"Duplikaty w katalogu: "
        f"{sorted({kod for kod in kody_katalogu if kody_katalogu.count(kod) > 1})}"
    )
    assert {karta.kod for karta in KATALOG_ANALIZ_V126} == {t.value for t in V126AnalysisType}
    assert len(KATALOG_ANALIZ_V126) == 14, "Kontrakt V126AnalysisType ma dziś 14 rodzajów"


# ---------------------------------------------------------------------------
# Karty PREZENTOWANE — kompletność treści inżynierskiej
# ---------------------------------------------------------------------------


def test_karty_prezentowane_niosa_pytanie_zakres_i_wielkosci() -> None:
    prezentowane = [k for k in KATALOG_ANALIZ_V126 if k.prezentowany]
    assert len(prezentowane) == 10
    for karta in prezentowane:
        assert karta.pytanie_pl.strip(), karta.kod
        assert karta.zakres_pl.strip(), karta.kod
        assert karta.wielkosci_glowne, f"{karta.kod}: brak głównych wielkości"
        for wielkosc in karta.wielkosci_glowne:
            assert wielkosc.symbol.strip(), karta.kod
            assert wielkosc.nazwa_pl.strip(), karta.kod
            assert wielkosc.jednostka.strip(), karta.kod


def test_karty_prezentowane_maja_podstawe_oceny_xor_jawny_brak() -> None:
    """Zasada normowa §8: pokazanie normy wymaga podstawy; inaczej BRAK PODSTAW —
    a karta NIGDY nie udaje jednego, mając w zapasie drugie (nigdy oba naraz)."""
    prezentowane = [k for k in KATALOG_ANALIZ_V126 if k.prezentowany]
    for karta in prezentowane:
        ma_podstawe = bool(karta.podstawa_oceny)
        ma_jawny_brak = bool(karta.bez_podstawy_pl and karta.bez_podstawy_pl.strip())
        assert ma_podstawe or ma_jawny_brak, (
            f"{karta.kod}: ani podstawy oceny, ani jawnego stwierdzenia braku — "
            "karta milczy o normie"
        )
        assert not (
            ma_podstawe and ma_jawny_brak
        ), f"{karta.kod}: podstawa oceny I jawny brak jednocześnie — dwuznaczne"
        for pozycja in karta.podstawa_oceny:
            assert pozycja.wielkosc_pl.strip(), karta.kod
            assert pozycja.symbol.strip(), karta.kod
            assert pozycja.jednostka.strip(), karta.kod
            assert pozycja.warunek_pl.strip(), karta.kod
            if isinstance(pozycja.wartosc_graniczna, str):
                assert pozycja.wartosc_graniczna.strip(), karta.kod
            else:
                assert isinstance(pozycja.wartosc_graniczna, int | float), karta.kod
            assert pozycja.zrodlo_pl.strip(), karta.kod


# ---------------------------------------------------------------------------
# Karty WYCOFANE — parytet z rejestrem frontu (reużycie parsera, nie kopia)
# ---------------------------------------------------------------------------


def test_karty_wycofane_pokrywaja_dokladnie_rejestr_frontu() -> None:
    wycofane_katalogu = {k.kod for k in KATALOG_ANALIZ_V126 if not k.prezentowany}
    wycofane_frontu = set(_rodzaje_nieprezentowane())
    assert wycofane_katalogu == wycofane_frontu, (
        f"Rozjazd katalog↔front: tylko w katalogu {wycofane_katalogu - wycofane_frontu}, "
        f"tylko we froncie {wycofane_frontu - wycofane_katalogu}"
    )
    assert len(wycofane_katalogu) == 4


def test_karty_wycofane_maja_niepusty_powod_i_prezentowany_false() -> None:
    for karta in KATALOG_ANALIZ_V126:
        if karta.kod in _rodzaje_nieprezentowane():
            assert karta.prezentowany is False, karta.kod
            assert (
                karta.powod_wycofania_pl is not None and karta.powod_wycofania_pl.strip()
            ), karta.kod


# ---------------------------------------------------------------------------
# Kolejność prezentacji
# ---------------------------------------------------------------------------


def test_katalog_do_dict_posortowany_wg_kolejnosci_grup() -> None:
    posortowane = katalog_do_dict()
    assert len(posortowane) == 14
    kolejnosc_grup = {kod: indeks for indeks, kod in enumerate(KOLEJNOSC_GRUP)}
    indeksy_grup = [kolejnosc_grup[karta["grupa"]["kod"]] for karta in posortowane]
    assert indeksy_grup == sorted(indeksy_grup), "Karty nie są posortowane wg KOLEJNOSC_GRUP"
    # Wewnątrz KAŻDEJ grupy kolejność katalogu (stabilność sortu) — dla grupy
    # z ≥2 kartami sprawdzamy, że kolejność w `posortowane` zgadza się z
    # kolejnością tych samych kodów w KATALOG_ANALIZ_V126.
    kolejnosc_zrodlowa = [karta.kod for karta in KATALOG_ANALIZ_V126]
    for grupa_kod in KOLEJNOSC_GRUP:
        kody_w_grupie_posortowane = [
            k["kod"] for k in posortowane if k["grupa"]["kod"] == grupa_kod
        ]
        kody_w_grupie_zrodlowe = [
            kod for kod in kolejnosc_zrodlowa if karta_analizy(kod).grupa == grupa_kod
        ]
        assert kody_w_grupie_posortowane == kody_w_grupie_zrodlowe, grupa_kod


def test_grupy_do_dict_zawiera_wylacznie_grupy_z_karta_prezentowana_raz() -> None:
    grupy = grupy_do_dict()
    kody_grup = [g["kod"] for g in grupy]
    assert len(kody_grup) == len(set(kody_grup)), "Grupa wymieniona więcej niż raz"
    obecne_w_katalogu = {k.grupa for k in KATALOG_ANALIZ_V126 if k.prezentowany}
    assert set(kody_grup) == obecne_w_katalogu
    # GRUPA_WYCOFANE nie ma żadnej karty prezentowanej -> nie występuje.
    assert "wycofane_z_powierzchni" not in kody_grup
    # Kolejność = KOLEJNOSC_GRUP obcięta do grup obecnych.
    assert kody_grup == [kod for kod in KOLEJNOSC_GRUP if kod in obecne_w_katalogu]
    for grupa in grupy:
        assert grupa["nazwa_pl"].strip()


# ---------------------------------------------------------------------------
# Literały progów — parytet z solverem FROZEN (B-01: nie edytujemy solvera)
# ---------------------------------------------------------------------------

#: (nazwa stałej katalogu, oczekiwana wartość, fragment tekstu solvera FROZEN).
#: Fragmenty ustalone RĘCZNIE odczytem `network_model/solvers/v126_academic.py`
#: (karta B02-BE-TESTY §2) — solver zapisuje 5 z tych 10 progów jako BARE INT
#: (bez „.0": `margin >= 20`, `du <= 15`, `thermal_ratio <= 1`, `min_margin >= 10`,
#: `second_harmonic_percent >= 10`), więc test NIE porównuje `str(wartość)` z
#: tekstem solvera wprost — to dałoby FAŁSZYWY rozjazd (wartość ta sama, zapis
#: inny). Pozostałe 5 progów solver zapisuje jako float identyczny z katalogiem.
#: ŻADEN z 10 literałów nie okazał się nieobecny w solverze (zweryfikowano
#: ręcznym odczytem źródła przy pisaniu tej karty) — gdyby był, ten test by to
#: wykrył i raport karty B02-BE-TESTY opisałby rozjazd (NIE wolno zmieniać
#: solvera z tej karty — poprawiałby się katalog).
_PROGI_LITERALOW_SOLVERA: tuple[tuple[str, float, str], ...] = (
    ("THD_U_PNEN50160_PROCENT", THD_U_PNEN50160_PROCENT, "thd > 8.0"),
    ("THD_U_IEEE519_PROCENT", THD_U_IEEE519_PROCENT, "thd > 5.0"),
    ("TDD_IEEE519_PROCENT", TDD_IEEE519_PROCENT, "tdd > 5.0"),
    ("MARGINES_BIL_MIN_PROCENT", MARGINES_BIL_MIN_PROCENT, "margin >= 20"),
    ("ZAPAD_ROZRUCHU_MAX_PROCENT", ZAPAD_ROZRUCHU_MAX_PROCENT, "du <= 15"),
    ("WSKAZNIK_CIEPLNY_ROZRUCHU_MAX", WSKAZNIK_CIEPLNY_ROZRUCHU_MAX, "thermal_ratio <= 1"),
    ("MARGINES_TRV_MIN_PROCENT", MARGINES_TRV_MIN_PROCENT, "min_margin >= 10"),
    (
        "UDZIAL_2H_BLOKADA_87T_PROCENT",
        UDZIAL_2H_BLOKADA_87T_PROCENT,
        "second_harmonic_percent >= 10",
    ),
    ("PRAD_RESZTKOWY_MAX_UDZIAL_IC", PRAD_RESZTKOWY_MAX_UDZIAL_IC, "i_res_detuned_a <= 0.1 * ic_a"),
    ("KROTNOSC_OCHRONY_DODATKOWEJ", KROTNOSC_OCHRONY_DODATKOWEJ, "u_touch <= 1.25 * u_touch_allow"),
)


def test_literaly_progow_katalogu_sa_stosowane_przez_solver_frozen() -> None:
    tresc_solvera = _tekst(SOLVER_PY)
    for nazwa_stalej, oczekiwana_wartosc, fragment in _PROGI_LITERALOW_SOLVERA:
        wartosc_katalogu = getattr(v126_katalog, nazwa_stalej)
        assert wartosc_katalogu == oczekiwana_wartosc, (
            f"{nazwa_stalej}: wartość katalogu zmieniła się na {wartosc_katalogu} — "
            "zaktualizuj fragment solvera w tej tabeli"
        )
        assert fragment in tresc_solvera, (
            f"{nazwa_stalej}: fragment solvera {fragment!r} nie znaleziony w "
            f"{SOLVER_PY} — literał normy zniknął albo zmienił zapis (B-01: NIE "
            "zmieniaj solvera z tej karty, popraw KATALOG)"
        )


# ---------------------------------------------------------------------------
# Kontrakt to_dict() — pin kluczy dla frontu
# ---------------------------------------------------------------------------

_KLUCZE_KARTY: frozenset[str] = frozenset(
    {
        "kod",
        "nazwa_pl",
        "grupa",
        "pytanie_pl",
        "zakres_pl",
        "wielkosci_glowne",
        "podstawa_oceny",
        "bez_podstawy_pl",
        "dane",
        "prezentowany",
        "powod_wycofania_pl",
        "katalog_odniesienia",
        "uwagi_metody_pl",
    }
)
_KLUCZE_DANE: frozenset[str] = frozenset({"z_modelu", "od_uzytkownika", "domyslne_solvera"})
_KLUCZE_GRUPA: frozenset[str] = frozenset({"kod", "nazwa_pl"})


def test_to_dict_ma_dokladnie_kontraktowe_klucze() -> None:
    for karta in KATALOG_ANALIZ_V126:
        d = karta.to_dict()
        assert set(d.keys()) == _KLUCZE_KARTY, karta.kod
        assert set(d["grupa"].keys()) == _KLUCZE_GRUPA, karta.kod
        assert set(d["dane"].keys()) == _KLUCZE_DANE, karta.kod


# ---------------------------------------------------------------------------
# nazwa_parametru_pl — JEDYNE źródło polskich nazw parametrów w komunikatach
# gotowości (naprawa po znalezisku architekta: `v126_gotowosc.py` cytowało
# surowe klucze Pythona, np. `rho1_ohm_m`, wprost na ekranie projektanta).
# ---------------------------------------------------------------------------


def test_nazwa_parametru_pl_zwraca_nazwe_z_katalogu_dla_kazdego_od_uzytkownika() -> None:
    """Iloczyn cech: KAŻDA karta × KAŻDY jej parametr `od_uzytkownika` — funkcja
    zwraca DOKŁADNIE `nazwa_pl` zadeklarowaną w katalogu, nigdy pusty string,
    nigdy sam klucz z powrotem (co byłoby cichym brakiem tłumaczenia)."""
    for karta in KATALOG_ANALIZ_V126:
        for parametr in karta.od_uzytkownika:
            wynik = nazwa_parametru_pl(karta.kod, parametr.klucz)
            assert wynik == parametr.nazwa_pl
            assert wynik.strip()
            assert wynik != parametr.klucz


def test_nazwa_parametru_pl_nieznany_klucz_podnosi_key_error() -> None:
    """Brak w katalogu jest błędem WYWOŁANIA (defekt do naprawienia u źródła),
    nie brakiem do cichego zwrócenia pustego stringa albo samego klucza."""
    with pytest.raises(KeyError):
        nazwa_parametru_pl(V126AnalysisType.EARTHING_SAFETY.value, "earthing.klucz_ktorego_nie_ma")
    with pytest.raises(KeyError):
        nazwa_parametru_pl(V126AnalysisType.MOTOR_STARTING.value, "customer_counts")


# ---------------------------------------------------------------------------
# katalog_odniesienia -> przestrzeń nazw realna w GET /api/catalog/v126/{ns}
# ---------------------------------------------------------------------------


def test_katalog_odniesienia_wskazuje_realna_przestrzen_nazw() -> None:
    z_odniesieniem = [k for k in KATALOG_ANALIZ_V126 if k.katalog_odniesienia]
    assert len(z_odniesieniem) >= 3, "Test kontrolny: oczekiwano kilku kart z odniesieniem"
    from api.main import app

    with TestClient(app) as client:
        for karta in z_odniesieniem:
            resp = client.get(f"/api/catalog/v126/{karta.katalog_odniesienia}")
            assert resp.status_code == 200, (
                f"{karta.kod}: katalog_odniesienia={karta.katalog_odniesienia!r} -> "
                f"{resp.status_code}"
            )
            body = resp.json()
            assert body["namespace"] == karta.katalog_odniesienia
            assert body["items"], f"{karta.kod}: przestrzeń {karta.katalog_odniesienia} pusta"


# ---------------------------------------------------------------------------
# Zero fabrykacji: każdy parametr projektanta jest naprawdę czytany
# ---------------------------------------------------------------------------


def _klucz_bazowy(klucz: str) -> str:
    """`earthing.rho1_ohm_m` -> `earthing`; `motors[].ref` -> `motors`."""
    return klucz.split(".", 1)[0].split("[", 1)[0]


def test_kazdy_parametr_uzytkownika_jest_czytany_przez_most_albo_solver() -> None:
    teksty = [_tekst(V126_CONTRACTS_PY), _tekst(SOLVER_PY), _tekst(API_V126_PY)]
    brak_konsumenta: list[str] = []
    for karta in KATALOG_ANALIZ_V126:
        for parametr in karta.od_uzytkownika:
            bazowy = _klucz_bazowy(parametr.klucz)
            wzorzec = f'"{bazowy}"'
            if not any(wzorzec in tekst for tekst in teksty):
                brak_konsumenta.append(f"{karta.kod}: {parametr.klucz} (bazowy {bazowy!r})")
    assert brak_konsumenta == [], (
        "Parametry projektanta z katalogu bez konsumenta w moście/solverze/API "
        f"(phantom — karta §0 poz. 4): {brak_konsumenta}"
    )
