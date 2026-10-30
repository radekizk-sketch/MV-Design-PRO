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
  * progi kryteriów katalogu pochodzą z rejestru założeń inżynierskich
    (`application/analyses/v126_oceny.py::REJESTR_ZALOZEN`), źródło nazywa paragraf
    założenia, a solver nie niesie już literałów werdyktów (jedno źródło progu);
  * kontrakt `to_dict()` (pin kluczy dla frontu);
  * `katalog_odniesienia` wskazuje realną przestrzeń nazw `GET /api/catalog/v126/{ns}`;
  * każdy parametr projektanta (`od_uzytkownika[].klucz`) jest naprawdę czytany
    przez most albo solver — inaczej byłby to phantom (zero fabrykacji, karta
    §0 poz. 4 promptu właściciela).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from application.analyses import v126_katalog
from application.analyses.v126_katalog import (
    KATALOG_ANALIZ_V126,
    KOLEJNOSC_GRUP,
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
# Progi kryteriów — jedno źródło: rejestr założeń inżynierskich (v126_oceny)
# ---------------------------------------------------------------------------

#: Literały, którymi solver oceniał wyniki przed przeniesieniem ocen do rekordów
#: `OcenaKryterium` (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, odcinek 3). Solver liczy wielkości,
#: nie wystawia werdyktów — powrót któregokolwiek literału oznaczałby drugie źródło progu.
_DAWNE_PROGI_WERDYKTOW_SOLVERA: tuple[str, ...] = (
    "thd > 8.0",
    "thd > 5.0",
    "tdd > 5.0",
    "du <= 15",
    "thermal_ratio <= 1",
    "min_margin >= 10",
    "1.25 * u_touch_allow",
    "MARGINES_BIL_MIN_PROCENT",
    "PRAD_RESZTKOWY_MAX_UDZIAL_IC",
)


def test_solver_nie_niesie_progow_werdyktow() -> None:
    tresc_solvera = _tekst(SOLVER_PY)
    for literal in _DAWNE_PROGI_WERDYKTOW_SOLVERA:
        assert literal not in tresc_solvera, (
            f"Próg oceny {literal!r} wrócił do solvera — progi kryteriów należą do rejestru "
            "założeń `application/analyses/v126_oceny.py::REJESTR_ZALOZEN`."
        )


def test_progi_katalogu_pochodza_z_rejestru_zalozen() -> None:
    """Katalog nie ma własnych stałych progów: każdy próg liczbowy cytowany w karcie jest
    wartością założenia z rejestru, a źródło nazywa paragraf założenia (nie normę)."""
    from application.analyses.v126_oceny import REJESTR_ZALOZEN

    tekst_katalogu = _tekst(Path(v126_katalog.__file__))
    assert "_PROCENT =" not in tekst_katalogu
    assert "_MAX =" not in tekst_katalogu
    z_progiem = [z for z in REJESTR_ZALOZEN if z.wartosc is not None]
    assert {z.paragraf for z in z_progiem} == {"Z-2", "Z-3", "Z-6", "Z-9"}
    podstawy = [p for karta in KATALOG_ANALIZ_V126 for p in karta.podstawa_oceny]
    zrodla = " ".join(p.zrodlo_pl for p in podstawy)
    for zalozenie in REJESTR_ZALOZEN:
        if zalozenie.paragraf == "Z-12":
            continue  # tolerancja jest daną odniesienia biegu benchmarku (karta wycofana)
        assert v126_katalog.zrodlo_zalozenia(zalozenie) in zrodla, zalozenie.paragraf
    progi = {z.wartosc: z for z in z_progiem}
    for podstawa in podstawy:
        if isinstance(podstawa.wartosc_graniczna, float):
            # Granica liczbowa karty = wartość założenia; LaTeX warunku cytuje próg zapisem
            # rejestru (`prog_latex`, przecinek dziesiętny), nie własnym literałem.
            assert podstawa.wartosc_graniczna in progi, podstawa.symbol
            zalozenie = progi[podstawa.wartosc_graniczna]
            assert podstawa.warunek_latex.endswith(zalozenie.prog_latex), (
                podstawa.symbol,
                podstawa.warunek_latex,
            )


def test_rejestr_zalozen_dokumentu_rowny_rejestrowi_kodu() -> None:
    """Dokument podstawy (`docs/uiux/UX04_POLE_ZU_SKLADOWA_ZEROWA.md` §7) i rejestr w kodzie
    to JEDEN rejestr: każdy paragraf Z-n ma w tabeli dokumentu tę samą nazwę kryterium,
    treść, próg i praktykę co `REJESTR_ZALOZEN` — rekord oceny cytuje „§ Z-n” dokumentu, więc
    rozjazd byłby podstawą, która mówi co innego niż kod."""
    from application.analyses.v126_oceny import DOKUMENT_ZALOZEN, REJESTR_ZALOZEN

    dokument = _tekst(PROJECT_ROOT / "docs" / "uiux" / "UX04_POLE_ZU_SKLADOWA_ZEROWA.md")
    sekcja = dokument.split("## 7. Rejestr założeń inżynierskich", 1)[1]
    assert f"„{DOKUMENT_ZALOZEN}”" in sekcja
    wiersze = {}
    for linia in sekcja.splitlines():
        if linia.startswith("| Z-"):
            komorki = [k.strip() for k in linia.strip().strip("|").split("|")]
            wiersze[komorki[0]] = komorki[1:]
    assert list(wiersze) == [z.paragraf for z in REJESTR_ZALOZEN]
    for zalozenie in REJESTR_ZALOZEN:
        prog = (
            "—"
            if zalozenie.wartosc is None
            else f"{format(zalozenie.wartosc, 'g').replace('.', ',')} {zalozenie.jednostka}"
        )
        assert wiersze[zalozenie.paragraf] == [
            zalozenie.nazwa_pl,
            zalozenie.tresc_pl,
            prog,
            zalozenie.praktyka_pl,
        ], zalozenie.paragraf


def test_zalecenie_blokady_87t_ma_jeden_prog_w_solverze_i_katalogu() -> None:
    """Zalecenie blokady od 2. harmonicznej jest regułą solvera bez podstawy normowej,
    podaną w katalogu jako informacja — liczba w opisie katalogu musi być liczbą solvera."""
    assert "second_harmonic_percent >= 10" in _tekst(SOLVER_PY)
    karta = karta_analizy("transient_trv")
    assert karta is not None
    assert any("udział ≥ 10 %" in u for u in karta.uwagi_metody_pl)


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
        # Karta V12.7 §0.7: zakres, jaki wolno nazwać werdyktowi tego rodzaju.
        "zakres_oceny",
    }
)
_KLUCZE_DANE: frozenset[str] = frozenset({"z_modelu", "od_uzytkownika", "domyslne_solvera"})
_KLUCZE_GRUPA: frozenset[str] = frozenset({"kod", "nazwa_pl"})
# Karta V12.7 §0.1: LaTeX addytywnie na WielkoscGlowna/PodstawaOceny.
_KLUCZE_WIELKOSC: frozenset[str] = frozenset({"symbol", "nazwa_pl", "jednostka", "symbol_latex"})
_KLUCZE_PODSTAWA: frozenset[str] = frozenset(
    {
        "wielkosc_pl",
        "symbol",
        "jednostka",
        "warunek_pl",
        "wartosc_graniczna",
        "zrodlo_pl",
        "symbol_latex",
        "warunek_latex",
        "wzor_latex",
        "wzor_opis_pl",
    }
)


def test_to_dict_ma_dokladnie_kontraktowe_klucze() -> None:
    for karta in KATALOG_ANALIZ_V126:
        d = karta.to_dict()
        assert set(d.keys()) == _KLUCZE_KARTY, karta.kod
        assert set(d["grupa"].keys()) == _KLUCZE_GRUPA, karta.kod
        assert set(d["dane"].keys()) == _KLUCZE_DANE, karta.kod
        for wielkosc in d["wielkosci_glowne"]:
            assert set(wielkosc.keys()) == _KLUCZE_WIELKOSC, (karta.kod, wielkosc)
        for podstawa in d["podstawa_oceny"]:
            assert set(podstawa.keys()) == _KLUCZE_PODSTAWA, (karta.kod, podstawa)


def test_zakres_oceny_jest_kryterium_dla_wszystkich_rodzajow_v126() -> None:
    """Karta V12.7 §0.7 — żaden rodzaj V12.6 nie ocenia kompletu kryteriów
    jednego obiektu (każdy sprawdza jedną wielkość fizyczną wobec jednej
    granicy albo w ogóle nie stosuje progu), więc żaden nie dostaje
    szerszego zakresu — pin z pomiaru, nie z domysłu."""
    for karta in KATALOG_ANALIZ_V126:
        assert karta.zakres_oceny == "kryterium", karta.kod


def test_katalog_latex_bez_pustych_symboli_i_warunkow() -> None:
    """Karta V12.7 §0.1 — test kompletności: zero pustych `*_latex` w katalogu."""
    for karta in KATALOG_ANALIZ_V126:
        for wielkosc in karta.wielkosci_glowne:
            assert wielkosc.symbol_latex.strip() != "", (karta.kod, wielkosc.symbol)
        for podstawa in karta.podstawa_oceny:
            assert podstawa.symbol_latex.strip() != "", (karta.kod, podstawa.symbol)
            assert podstawa.warunek_latex.strip() != "", (karta.kod, podstawa.symbol)
            if isinstance(podstawa.wartosc_graniczna, str):
                assert podstawa.wzor_latex.strip() != "", (karta.kod, podstawa.symbol)


#: Symbol z indeksem dolnym zapisany ASCII (`U_c`, `ρ_s`, `Z_grid`, `TOV_10s`) — w prozie
#: ekranu pojawiłby się z podkreślnikiem zamiast indeksu.
_SYMBOL_ASCII = re.compile(r"(?<![\w.\[\]])[A-Za-zΔρθφα]{1,4}_[A-Za-z0-9{]")
#: Pola katalogu, które NIE są prozą ekranu (identyfikatory kontraktu, jednostki, LaTeX).
_POLA_NIE_PROZA = frozenset(
    {"kod", "klucz", "symbol", "katalog_odniesienia", "jednostka", "zakres_oceny"}
)


def _teksty_prozy(obiekt: object, sciezka: str) -> list[tuple[str, str]]:
    if isinstance(obiekt, dict):
        wynik: list[tuple[str, str]] = []
        for klucz, wartosc in obiekt.items():
            if klucz in _POLA_NIE_PROZA or "latex" in klucz:
                continue
            wynik.extend(_teksty_prozy(wartosc, f"{sciezka}.{klucz}"))
        return wynik
    if isinstance(obiekt, list):
        return [t for i, w in enumerate(obiekt) for t in _teksty_prozy(w, f"{sciezka}[{i}]")]
    return [(sciezka, obiekt)] if isinstance(obiekt, str) else []


def test_proza_katalogu_niesie_symbole_wylacznie_jako_wzory_inline() -> None:
    """Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, commit 5 (strażnik `ui_math_guard`, PIN = 0):
    symbol w prozie katalogu jest zapisem `$…$` (ekran składa go przez `TekstZWzorami`
    → KaTeX), nigdy ASCII z podkreślnikiem. Iloczyn: KAŻDA karta × KAŻDE pole prozy
    `to_dict()` (pytanie, zakres, wielkości, warunki, granice słowne, opisy wzorów, dane
    z modelu, parametry projektanta, domyślne solvera, źródła z rejestru założeń, uwagi).
    Ograniczniki `$` są parzyste — nieparzysty rozbiłby podział tekstu na wzory."""
    naruszenia: list[str] = []
    for karta in KATALOG_ANALIZ_V126:
        for sciezka, tekst in _teksty_prozy(karta.to_dict(), karta.kod):
            if tekst.count("$") % 2 != 0:
                naruszenia.append(f"{sciezka}: nieparzysta liczba '$' — {tekst!r}")
            poza_wzorami = re.sub(r"\$[^$]*\$", " ", tekst)
            symbole = _SYMBOL_ASCII.findall(poza_wzorami)
            if symbole:
                naruszenia.append(f"{sciezka}: {symbole} — {tekst!r}")
    assert naruszenia == []


def test_nazwa_parametru_bez_wzorow_bo_trafia_do_komunikatow_gotowosci() -> None:
    """`ParametrUzytkownika.nazwa_pl` trafia też do komunikatów gotowości
    (`nazwa_parametru_pl` → `v126_gotowosc.py`), które ekran wypisuje wprost — zapis `$…$`
    pokazałby się tam dosłownie. Nazwa parametru jest więc prozą bez wzorów."""
    for karta in KATALOG_ANALIZ_V126:
        for parametr in karta.od_uzytkownika:
            assert "$" not in parametr.nazwa_pl, (karta.kod, parametr.klucz)
            assert not _SYMBOL_ASCII.search(parametr.nazwa_pl), (
                karta.kod,
                parametr.klucz,
            )


def test_wykrywacz_symbolu_ascii_lapie_dawny_zapis() -> None:
    """Iniekcja: dawne napisy katalogu sprzed naprawy są wykrywane, zapis `$…$` nie."""
    for dawny in (
        "(U_c, U_r, U_res, wytrzymałość",
        "ρ_s — rezystywność",
        "TOV_10s ≥ U_TOV",
    ):
        assert _SYMBOL_ASCII.search(re.sub(r"\$[^$]*\$", " ", dawny)), dawny
    assert not _SYMBOL_ASCII.search(re.sub(r"\$[^$]*\$", " ", "($U_c$, $U_{\\mathrm{res}}$)"))


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
