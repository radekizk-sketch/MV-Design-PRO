"""Serializer rekordu do bloku dokumentu formalnego (§10) — połowa backendowa T13.

Intencja: raport, certyfikat i wniosek do OSD renderują TEN SAM rekord jednym serializerem.
Blok niesie dosłownie to samo zdanie, te same zastrzeżenia, braki i przyczynę co rekord (T13),
etykietę oceny z rekordu (jedyne mapowanie statusu na etykietę jest w ``etykiety.py``), status
modelu i dane przyjęte (T6, T7 w tekście dokumentu), a pozycje idą w kolejności §10 — na całym
katalogu rekordów K i W, nie na przykładzie.
"""

from __future__ import annotations

import ast
from pathlib import Path
from typing import get_args

import pytest
import werdykt
from werdykt import (
    OcenaKryterium,
    PozycjaBloku,
    StanZrodla,
    StatusWerdyktu,
    WynikWymagania,
    blok_kryterium,
    blok_wymagania,
    etykieta,
)
from werdykt import dokument as modul_dokumentu
from werdykt.etykiety import SLOWNIK_ETYKIET

from tests.werdykt import fabryki as f

REKORDY_K = f.rekordy_k()
REKORDY_W = f.rekordy_w()

KOLEJNOSC_K = [
    "Przedmiot",
    "Ocena",
    "Stosowalność",
    "Kryterium",
    "Warunek (LaTeX)",
    "Warunek wstępny",
    "Wynik",
    "Limit",
    "Margines",
    "Definicja marginesu (LaTeX)",
    "Niepewność",
    "Wyjaśnienie",
    "Przyczyna",
    "Czego brakuje",
    "Zastrzeżenia",
    "Podstawa",
    "Dowód",
    "Kompletność dowodu",
    "Powód niepełności",
    "Status modelu",
    "Status danych",
    "Dana przyjęta",
    "Zakres ważności",
    "Ślad",
]
KOLEJNOSC_W = [
    "Wymaganie",
    "Ocena",
    "Stosowalność",
    "Sposób wykazania",
    "Pokrycie programu badań",
    "Kryteria naruszone",
    "Kryterium najbliżej granicy",
    "Stan końcowy",
    "Wyjaśnienie",
    "Przyczyna",
    "Czego brakuje",
    "Zastrzeżenia",
    "Podstawa",
    "Dowód",
    "Kompletność dowodu",
    "Powód niepełności",
    "Status modelu",
    "Status danych",
    "Dana przyjęta",
    "Zakres ważności",
    "Ślad",
]
#: Pozycje minimum §10, obecne w każdym bloku.
MINIMUM_K = {
    "Ocena",
    "Kryterium",
    "Wynik",
    "Margines",
    "Wyjaśnienie",
    "Podstawa",
    "Dowód",
    "Status modelu",
    "Status danych",
    "Zakres ważności",
}
MINIMUM_W = {
    "Wymaganie",
    "Ocena",
    "Wyjaśnienie",
    "Podstawa",
    "Dowód",
    "Status modelu",
    "Status danych",
    "Zakres ważności",
}


def _wartosci(blok: list[PozycjaBloku], etykieta_pozycji: str) -> list[str]:
    return [p.tresc_pl for p in blok if p.etykieta_pl == etykieta_pozycji]


def _wlasne_pozycje_w(blok: list[PozycjaBloku]) -> list[PozycjaBloku]:
    koniec = next(
        (i for i, p in enumerate(blok) if p.etykieta_pl == "Kryterium składowe"), len(blok)
    )
    return blok[:koniec]


def _kolejnosc_zgodna(etykiety: list[str], wzorzec: list[str]) -> bool:
    indeksy = [wzorzec.index(e) for e in etykiety]
    return indeksy == sorted(indeksy)


def _sprawdz_t13(blok: list[PozycjaBloku], rekord: OcenaKryterium | WynikWymagania) -> None:
    w = rekord.wyjasnienie
    assert _wartosci(blok, "Wyjaśnienie") == [w.zdanie_pl]
    assert _wartosci(blok, "Zastrzeżenia") == list(w.zastrzezenia)
    assert _wartosci(blok, "Czego brakuje") == list(w.czego_brakuje)
    assert _wartosci(blok, "Przyczyna") == ([] if w.przyczyna_pl is None else [w.przyczyna_pl])
    assert _wartosci(blok, "Ocena") == [rekord.etykieta.etykieta_pl]
    assert _wartosci(blok, "Status modelu") == [rekord.dowod.status_modelu]
    assert _wartosci(blok, "Status danych") == [rekord.dowod.status_danych.stan]
    assert _wartosci(blok, "Kompletność dowodu") == [rekord.kompletnosc_dowodu]
    assert _wartosci(blok, "Powód niepełności") == list(rekord.powody_niepelnosci)


@pytest.mark.parametrize("nazwa, rekord", REKORDY_K, ids=[n for n, _ in REKORDY_K])
def test_t13_blok_kryterium_niesie_to_samo_zdanie_i_zastrzezenia(
    nazwa: str, rekord: OcenaKryterium
) -> None:
    blok = blok_kryterium(rekord)
    _sprawdz_t13(blok, rekord)
    etykiety = [p.etykieta_pl for p in blok]
    assert MINIMUM_K <= set(etykiety)
    assert _kolejnosc_zgodna(etykiety, KOLEJNOSC_K), etykiety


@pytest.mark.parametrize("nazwa, rekord", REKORDY_W, ids=[n for n, _ in REKORDY_W])
def test_t13_blok_wymagania_niesie_to_samo_zdanie_i_bloki_skladowych(
    nazwa: str, rekord: WynikWymagania
) -> None:
    blok = blok_wymagania(rekord)
    wlasne = _wlasne_pozycje_w(blok)
    _sprawdz_t13(wlasne, rekord)
    etykiety = [p.etykieta_pl for p in wlasne]
    assert MINIMUM_W <= set(etykiety)
    assert _kolejnosc_zgodna(etykiety, KOLEJNOSC_W), etykiety
    reszta = blok[len(wlasne) :]
    oczekiwana_reszta: list[PozycjaBloku] = []
    for ocena in rekord.oceny_skladowe:
        oczekiwana_reszta.append(
            PozycjaBloku(etykieta_pl="Kryterium składowe", tresc_pl=ocena.kryterium_id)
        )
        oczekiwana_reszta.extend(blok_kryterium(ocena))
    assert reszta == oczekiwana_reszta
    assert _wartosci(wlasne, "Kryteria naruszone") == (
        [", ".join(rekord.kryteria_naruszone)] if rekord.kryteria_naruszone else []
    )
    assert _wartosci(wlasne, "Kryterium najbliżej granicy") == (
        [] if rekord.kryterium_najblizej_granicy is None else [rekord.kryterium_najblizej_granicy]
    )


@pytest.mark.parametrize("nazwa, rekord", REKORDY_W, ids=[n for n, _ in REKORDY_W])
def test_stan_koncowy_tylko_gdy_istnieje_kryterium_stanu_koncowego(
    nazwa: str, rekord: WynikWymagania
) -> None:
    stany = _wartosci(_wlasne_pozycje_w(blok_wymagania(rekord)), "Stan końcowy")
    koncowe = [o for o in rekord.oceny_skladowe if o.kryterium_id.endswith(".stan_koncowy")]
    assert len(stany) == len(koncowe)
    for tresc, ocena in zip(stany, koncowe, strict=True):
        assert ocena.wyjasnienie.zdanie_pl in tresc
        assert tresc.startswith(ocena.etykieta.etykieta_pl)


def test_t6_t7_dokument_niesie_status_modelu_i_dane_przyjete() -> None:
    """Zastrzeżenie UNVALIDATED_MODEL i dana przyjęta z wartością są w tekście dokumentu."""
    rekord = f.ocena(
        dowod_oceny=f.dowod_symulacji(
            status_modelu="UNVALIDATED_MODEL", stan_danych="UNVALIDATED_INPUT"
        ),
        metoda_wyniku="SYMULACJA",
        u=0.5,
    )
    for blok in (blok_kryterium(rekord), blok_wymagania(f.wymaganie([rekord], sposob="SYMULACJA"))):
        teksty = [p.tresc_pl for p in blok]
        assert "UNVALIDATED_MODEL" in _wartosci(blok, "Status modelu")
        assert any("Status modelu urządzenia: UNVALIDATED_MODEL" in t for t in teksty)
        assert any(
            "moc zwarciowa sieci S_k″ = 120 MVA" in t for t in _wartosci(blok, "Dana przyjęta")
        )
        assert any(
            "(UNVALIDATED_INPUT)" in t and "120 MVA" in t for t in _wartosci(blok, "Zastrzeżenia")
        )


@pytest.mark.parametrize("stan", f.STANY_ZRODLA)
def test_pozycja_podstawy_ma_dokument_wydanie_jednostke_i_stan(stan: StanZrodla) -> None:
    rekord = f.ocena(stan_kryterium=stan)
    (podstawa,) = _wartosci(blok_kryterium(rekord), "Podstawa")
    assert f"dokument: „{rekord.podstawa.dokument}”" in podstawa
    assert f"stan źródła: {stan}" in podstawa
    assert "wydanie:" in podstawa and "jednostka redakcyjna:" in podstawa
    if stan != "NIEUSTALONE":
        assert "wydanie: 3.0" in podstawa and "jednostka redakcyjna: pkt 5.3" in podstawa


def test_pozycja_dowodu_ma_metode_poziom_i_odniesienie() -> None:
    rekord = f.ocena(dowod_oceny=f.dowod_symulacji(), metoda_wyniku="SYMULACJA", u=0.5)
    (dowod,) = _wartosci(blok_kryterium(rekord), "Dowód")
    assert "metoda: symulacja" in dowod
    assert f"poziom: {rekord.dowod.poziom.label_pl}" in dowod
    assert "odniesienie: bieg-001" in dowod
    assert "przydatność dowodowa: tak" in dowod


@pytest.mark.parametrize("w_domenie", [None, True, False])
def test_pozycja_dowodu_nazywa_domene_walidacji_biegu(w_domenie: bool | None) -> None:
    """Domena walidacji biegu jest w pozycji „Dowód" (z położeniem biegu), a przydatność
    dowodowa biegu poza domeną — „nie"."""
    rekord = f.ocena(
        dowod_oceny=f.dowod_obliczenia(w_domenie=w_domenie),
        metoda_wyniku="OBLICZENIE",
        zakres_oceny=f.zakres(rodzaj="POWER_FLOW"),
    )
    (dowod,) = _wartosci(blok_kryterium(rekord), "Dowód")
    if w_domenie is None:
        assert "domena walidacji: nie zadeklarowano" in dowod
    else:
        polozenie = "bieg w domenie" if w_domenie else "bieg poza domeną"
        assert f"domena walidacji: {f.DOMENA_WALIDACJI} ({polozenie})" in dowod
    assert ("przydatność dowodowa: tak" in dowod) == (w_domenie is not False)


def test_pozycja_dowodu_bez_biegu_nie_ma_domeny() -> None:
    (dowod,) = _wartosci(blok_kryterium(f.ocena()), "Dowód")
    assert "domena walidacji" not in dowod


@pytest.mark.parametrize("nazwa", ["dowod_laczony_pelny", "dowod_laczony_niepelny"])
def test_przydatnosc_dowodu_laczonego_w_dokumencie_liczona_ze_skladowych(nazwa: str) -> None:
    rekord = dict(REKORDY_W)[nazwa]
    (dowod,) = _wartosci(_wlasne_pozycje_w(blok_wymagania(rekord)), "Dowód")
    przydatny = nazwa == "dowod_laczony_pelny"
    assert "metoda: dowód łączony" in dowod
    assert ("przydatność dowodowa: tak" in dowod) == przydatny


@pytest.mark.parametrize("stan_warunku", f.STANY_ZRODLA)
def test_pozycja_warunku_wstepnego_niesie_podstawe_ze_stanem(stan_warunku: StanZrodla) -> None:
    rekord = f.ocena("LOGICZNE", warunek_wstepny="U_PCC(t) ≥ obwiednia", stan_warunku=stan_warunku)
    (warunek,) = _wartosci(blok_kryterium(rekord), "Warunek wstępny")
    podstawa = rekord.kryterium.warunek_wstepny_podstawa
    assert podstawa is not None
    assert warunek.startswith("U_PCC(t) ≥ obwiednia; podstawa — ")
    assert f"dokument: „{podstawa.dokument}”" in warunek
    assert f"stan źródła: {stan_warunku}" in warunek


def test_pozycje_latex_osobno_od_tekstu() -> None:
    rekord = f.ocena("OBWIEDNIA_DOLNA")
    blok = blok_kryterium(rekord)
    assert _wartosci(blok, "Warunek (LaTeX)") == [rekord.kryterium.warunek_latex]
    assert rekord.margines is not None
    assert _wartosci(blok, "Definicja marginesu (LaTeX)") == [rekord.margines.definicja_latex]
    for pozycja in blok:
        if "LaTeX" not in pozycja.etykieta_pl:
            assert "\\" not in pozycja.tresc_pl, pozycja


def test_limit_obwiedni_wypisuje_punkty() -> None:
    (limit,) = _wartosci(blok_kryterium(f.ocena("OBWIEDNIA_DOLNA")), "Limit")
    assert "obwiednia dolna: t = 0 s: 0,25 p.u. (U_n); t = 1 s: 0,75 p.u. (U_n)" in limit


# ---------------------------------------------------------------------------
# Jedyne mapowanie statusu na etykietę
# ---------------------------------------------------------------------------

STATUSY: set[str] = set(get_args(StatusWerdyktu))
KATALOG_PAKIETU = Path(werdykt.__file__).parent


@pytest.mark.parametrize("plik", sorted(KATALOG_PAKIETU.glob("*.py")), ids=lambda p: p.name)
def test_brak_map_status_na_etykiete_poza_slownikiem(plik: Path) -> None:
    """Żaden moduł pakietu nie definiuje literału słownika o kluczach ze słownika statusów, a
    teksty etykiet §9 występują w kodzie wyłącznie w ``etykiety.py``."""
    zrodlo = plik.read_text(encoding="utf-8")
    for wezel in ast.walk(ast.parse(zrodlo)):
        if isinstance(wezel, ast.Dict):
            klucze = {k.value for k in wezel.keys if isinstance(k, ast.Constant)}
            assert not (klucze & STATUSY), f"{plik.name}: mapa o kluczach statusów {klucze}"
    if plik.name != "etykiety.py":
        for pozycja in SLOWNIK_ETYKIET:
            assert f'"{pozycja.etykieta_pl}"' not in zrodlo, (plik.name, pozycja.etykieta_pl)


def test_dokument_czyta_etykiete_z_rekordu() -> None:
    """Etykieta oceny w bloku jest etykietą rekordu — zgodną z funkcją słownika."""
    for _, rekord in REKORDY_K:
        (ocena,) = _wartosci(blok_kryterium(rekord), "Ocena")
        assert (
            ocena
            == etykieta(
                rekord.status_maszynowy,
                None if rekord.kompletnosc_dowodu == "NIE_DOTYCZY" else rekord.kompletnosc_dowodu,
                "K",
            ).etykieta_pl
        )
    for _, rekord_w in REKORDY_W:
        ocena_w = _wartosci(blok_wymagania(rekord_w), "Ocena")[0]
        assert (
            ocena_w
            == etykieta(
                rekord_w.status_maszynowy,
                (
                    None
                    if rekord_w.kompletnosc_dowodu == "NIE_DOTYCZY"
                    else rekord_w.kompletnosc_dowodu
                ),
                "W",
            ).etykieta_pl
        )
    assert "etykieta" not in {n for n in dir(modul_dokumentu) if not n.startswith("_")}
