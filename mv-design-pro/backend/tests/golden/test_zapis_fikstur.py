"""Piny reguł zapisu fikstur (`tests/golden/zapis_fikstur.py`): reguła liczb i kotwica w szumie.

Docstring modułu odsyłał do tego pliku jako pinu reguły liczb, a plik nie istniał (karta
SLD-SUBSTRAT, kontynuacja — deklaracja bez testu). Iloczyn cech kotwicy: różnica {tylko
szum liczby w tolerancji, liczba ponad tolerancję, łańcuch, format tekstu, brak pliku,
treść nie-JSON} × zapis.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tests.golden.zapis_fikstur import (
    CYFRY_ZNACZACE,
    json_fikstury,
    tresc_z_kotwica,
    zaokraglij_liczbe,
    zaokraglij_liczby,
)


def test_regula_liczb_12_cyfr_znaczacych_i_zero_bez_znaku() -> None:
    assert CYFRY_ZNACZACE == 12
    assert zaokraglij_liczbe(0.1234567890123456) == 0.123456789012
    assert zaokraglij_liczbe(-0.0) == 0.0 and str(zaokraglij_liczbe(-0.0)) == "0.0"
    assert zaokraglij_liczbe(-1e-30) == -1e-30
    assert zaokraglij_liczby({"a": True, "b": 3, "c": [2.00000000000001]}) == {
        "a": True,
        "b": 3,
        "c": [2.0],
    }


def _plik(tmp_path: Path, dane: object) -> Path:
    plik = tmp_path / "f.json"
    plik.write_text(json_fikstury(dane), encoding="utf-8")
    return plik


_ZAPISANE = {"cos_phi": 0.953902502426, "p_mw": 0.250628673371, "nazwa": "Stacja S01"}


def test_kotwica_zostawia_plik_przy_szumie_w_tolerancji(tmp_path: Path) -> None:
    plik = _plik(tmp_path, _ZAPISANE)
    swieze = json_fikstury({**_ZAPISANE, "cos_phi": 0.953902502736, "p_mw": 0.250628673927})
    assert tresc_z_kotwica(plik, swieze) == plik.read_text(encoding="utf-8")


@pytest.mark.parametrize(
    "zmiana",
    [
        {"p_mw": 0.2507},  # liczba ponad tolerancję 1e-4 względnie
        {"nazwa": "Stacja S02"},  # łańcuch
        {"nowy_klucz": 1.0},  # struktura
    ],
)
def test_kotwica_przepuszcza_realna_zmiane(tmp_path: Path, zmiana: dict[str, object]) -> None:
    plik = _plik(tmp_path, _ZAPISANE)
    swieze = json_fikstury({**_ZAPISANE, **zmiana})
    assert tresc_z_kotwica(plik, swieze) == swieze


def test_kotwica_przepuszcza_zmiane_formatu_tekstu(tmp_path: Path) -> None:
    plik = _plik(tmp_path, _ZAPISANE)
    swieze = json.dumps(_ZAPISANE, ensure_ascii=False, sort_keys=True, indent=1) + "\n"
    assert tresc_z_kotwica(plik, swieze) == swieze


def test_kotwica_bez_pliku_i_dla_tresci_nie_json(tmp_path: Path) -> None:
    assert tresc_z_kotwica(tmp_path / "brak.json", "{}\n") == "{}\n"
    plik = tmp_path / "f.ts"
    plik.write_text("export const A = 0.500003;\n", encoding="utf-8")
    assert tresc_z_kotwica(plik, "export const A = 0.500002;\n") == ("export const A = 0.500002;\n")


def test_kotwica_metryki_nakladki_cos_phi_w_pasmie_bezwymiarowym(tmp_path: Path) -> None:
    """cos φ metryki nakładki (`{"code": "COS_PHI", "value": …}`) bliski zeru: szum
    bezwzględny 1,2e-10 (pomiar `s92Rozplyw`, 2026-09-29) to pasmo wielkości
    bezwymiarowych, nie różnica; 1e-6 bezwzględnie — już różnica."""
    metryka = {"code": "COS_PHI", "unit": "", "value": 2.72542290898e-08}
    plik = _plik(tmp_path, {"metrics": {"COS_PHI": metryka}})
    szum = json_fikstury({"metrics": {"COS_PHI": {**metryka, "value": 2.73692900554e-08}}})
    assert tresc_z_kotwica(plik, szum) == plik.read_text(encoding="utf-8")
    realna = json_fikstury({"metrics": {"COS_PHI": {**metryka, "value": 1.0e-6}}})
    assert tresc_z_kotwica(plik, realna) == realna


# Kotwica PER LIŚĆ (karta ZU, 2026-11-04): szkielet zmieniony (łańcuch opisu, skrót modelu),
# a liczba obok różni się tylko szumem. Iloczyn cech: {liczba w tolerancji, liczba ponad
# tolerancję, liczba w tekście pola z liczbami, liczba w tekście zwykłego łańcucha, metryka
# bezwymiarowa wg kodu, lista innej długości, typ int} × {szkielet zmieniony}. Niezmiennik:
# szkielet zawsze świeży, każda zapisana liczba w tolerancji świeżej.
_PER_LISC = {
    "opis": "stary opis",
    "p_mw": 0.180288,
    "substitution": "R/X = 0.500002",
    "nazwa_kroku": "R/X = 0.500002",
    "metrics": {"COS_PHI": {"code": "COS_PHI", "unit": "", "value": 2.72542290898e-08}},
    "lista": [1.0000001, 2.0],
    "n": 3,
}


def _per_lisc(**zmiany: object) -> dict[str, object]:
    return {**_PER_LISC, "opis": "nowy opis", **zmiany}


def test_kotwica_per_lisc_zostawia_szum_liczby_przy_zmianie_szkieletu(tmp_path: Path) -> None:
    plik = _plik(tmp_path, _PER_LISC)
    swieze = _per_lisc(p_mw=0.180287, substitution="R/X = 0.500003")
    wynik = tresc_z_kotwica(plik, swieze_t := json_fikstury(swieze))
    assert wynik != swieze_t
    assert wynik == json_fikstury(_per_lisc())


@pytest.mark.parametrize(
    ("zmiana", "oczekiwane"),
    [
        ({"p_mw": 0.1805}, {"p_mw": 0.1805}),  # ponad tolerancję 1e-4 względnie
        ({"nazwa_kroku": "R/X = 0.500003"}, {"nazwa_kroku": "R/X = 0.500003"}),  # zwykły łańcuch
        (
            {"metrics": {"COS_PHI": {"code": "COS_PHI", "unit": "", "value": 1.0e-6}}},
            {"metrics": {"COS_PHI": {"code": "COS_PHI", "unit": "", "value": 1.0e-6}}},
        ),
        ({"lista": [9.0, 1.0000002, 2.0]}, {"lista": [9.0, 1.0000002, 2.0]}),
        ({"n": 4}, {"n": 4}),
    ],
)
def test_kotwica_per_lisc_przepuszcza_realna_zmiane(
    tmp_path: Path, zmiana: dict[str, object], oczekiwane: dict[str, object]
) -> None:
    plik = _plik(tmp_path, _PER_LISC)
    assert tresc_z_kotwica(plik, json_fikstury(_per_lisc(**zmiana))) == json_fikstury(
        _per_lisc(**oczekiwane)
    )


def test_kotwica_per_lisc_metryka_bezwymiarowa_wg_kodu(tmp_path: Path) -> None:
    plik = _plik(tmp_path, _PER_LISC)
    szum = {"COS_PHI": {"code": "COS_PHI", "unit": "", "value": 2.73692900554e-08}}
    assert tresc_z_kotwica(plik, json_fikstury(_per_lisc(metrics=szum))) == json_fikstury(
        _per_lisc()
    )


def test_kotwica_per_lisc_lancuch_z_cudzyslowem_i_liczba_w_kluczu(tmp_path: Path) -> None:
    """Żetony łańcuchów z sekwencjami ucieczki i kluczami-liczbami nie przesuwają liści."""
    dane = {'a "1.5" b': 0.1234561, "12.5": "x \\ 3.0", "w": 1.0}
    plik = _plik(tmp_path, dane)
    swieze = {'a "1.5" b': 0.1234562, "12.5": "x \\ 3.0", "w": 1.0, "nowy": 2}
    assert tresc_z_kotwica(plik, json_fikstury(swieze)) == json_fikstury(
        {**swieze, 'a "1.5" b': 0.1234561}
    )


@pytest.mark.parametrize("klucz", ["value", "tekst"])
def test_kotwica_per_lisc_tekst_ze_skrotem_zawsze_ze_swiezym_skrotem(
    tmp_path: Path, klucz: str
) -> None:
    """Iloczyn {pole skrótu nieprzenośnego z liczbami (`value`), pole tekstu z liczbami
    (`tekst`)} × zmiana szkieletu pliku. Metryka raportu niesie skrót biegu (`value` =
    `proof_hash`); zostawiona z dysku przy świeżym `proof_hash` łamałaby relację równości
    skrótów grupy (pomiar: `akademickie_scena_biegi`). Nowy skrót w tekście jest zawsze
    świeży, niezależnie od tego, czy predykat tolerancji uznaje skróty za równe."""
    stary, nowy = "a" * 64, "b" * 64
    plik = _plik(tmp_path, {**_PER_LISC, klucz: f"{stary} 1.0"})
    swieze = _per_lisc(**{klucz: f"{nowy} 1.0"})
    assert json.loads(tresc_z_kotwica(plik, json_fikstury(swieze)))[klucz] == f"{nowy} 1.0"
