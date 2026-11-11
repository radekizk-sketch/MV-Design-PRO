"""Identyfikacja wiersza tabel rodzin zabezpieczeń (karta EKRANY-EAZ-ZIEMNOZWARCIOWE).

Wiersz rodziny ziemnozwarciowej i rodziny nadprądowej 50/51 nazywa pole przez
``nazwa_pola_sterownika``. Sieć złota G08 ma w każdej z czterech stacji pola o tych samych
nazwach („Pole liniowe wejściowe 1” w S01…S04) — sama nazwa pola dawała wiersze nie do
odróżnienia na ekranie i w raporcie. Iloczyn cech: {nazwa jednoznaczna, nazwa powtarzalna}
× {kontener: stacja, rozdzielnica odgałęźna} × {rodzina ziemnozwarciowa, rodzina 50/51}.

Porządek wierszy (stacje w porządku naturalnym, pole w kolejności w rozdzielnicy z pierwszeństwem
numeru dyspozytorskiego, funkcja w kolejności sterownika, urządzenia bez pola na końcu):
{rodzina ziemnozwarciowa, 50/51} × {ekran — wiersze wyniku, raport — tabela i rekordy}.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

import pytest
from application.analyses.protection.ocena_ziemnozwarciowa import (
    klucz_naturalny,
    nazwa_pola_sterownika,
    ocen_zabezpieczenia_ziemnozwarciowe,
    pola_sterownikow,
    uporzadkuj_wiersze_rodzin,
)
from enm.mapping import map_enm_to_network_graph
from enm.models import BranchPointSN, EnergyNetworkModel
from enm.store import get_enm
from network_model.reporting.protection_tcc_presentation import (
    rekordy_ziemnozwarciowe,
    tabela_rodziny_nadpradowej,
    zdania_rodziny_nadpradowej,
)

from tests.application.analyses.protection.test_rodzina_nadpradowa import _koordynacja
from tests.reference_networks.scena_doziemienia import scena_z_nastawami

_SKRYPT = Path(__file__).resolve().parents[4] / "scripts" / "eksport_fixtur_harnessu.py"
_spec = importlib.util.spec_from_file_location("eksport_fixtur_harnessu_nazwy", _SKRYPT)
assert _spec is not None and _spec.loader is not None
eksport = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(eksport)


def _model_g08() -> EnergyNetworkModel:
    with eksport._biegi_sceny_koordynacja():
        return get_enm(eksport.CASE_ID_HARNESSU)


def test_nazwa_jednoznaczna_bez_dopisku() -> None:
    enm = EnergyNetworkModel.model_validate(scena_z_nastawami("KOMPENSOWANY_AWSC"))
    pola = {b.ref_id: b.name for b in enm.bays}
    sprawdzone = 0
    for a in enm.protection_assignments:
        if a.bay_ref in pola:
            assert nazwa_pola_sterownika(enm, a) == pola[a.bay_ref]
            sprawdzone += 1
    assert sprawdzone >= 3


def test_nazwa_powtarzalna_ze_stacja() -> None:
    enm = _model_g08()
    stacje = {s.ref_id: s.name for s in enm.substations}
    pola = {b.ref_id: b for b in enm.bays}
    nazwy = []
    for a in enm.protection_assignments:
        pole = pola.get(a.bay_ref or "")
        if pole is None:
            continue
        powtorzona = sum(1 for b in enm.bays if b.name == pole.name) > 1
        assert powtorzona, "scena G08: nazwy pól powtarzają się między stacjami"
        assert nazwa_pola_sterownika(enm, a) == f"{pole.name} — {stacje[pole.substation_ref]}"
        nazwy.append(nazwa_pola_sterownika(enm, a))
    assert len(nazwy) >= 12 and len(set(nazwy)) == len(nazwy)


def test_nazwa_powtarzalna_z_rozdzielnica_odgaleziona() -> None:
    enm = _model_g08()
    a = next(x for x in enm.protection_assignments if x.bay_ref)
    pole = next(b for b in enm.bays if b.ref_id == a.bay_ref)
    zksn = BranchPointSN(
        ref_id="bp-zksn-1",
        name="ZKSN Leśna",
        branch_point_type="zksn",
        parent_segment_id="seg-x",
        bus_ref=pole.bus_ref,
    )
    pole_zksn = pole.model_copy(update={"substation_ref": None, "branch_point_ref": "bp-zksn-1"})
    enm = enm.model_copy(
        update={
            "bays": [pole_zksn if b.ref_id == pole.ref_id else b for b in enm.bays],
            "branch_points": [*enm.branch_points, zksn],
        }
    )
    assert nazwa_pola_sterownika(enm, a) == f"{pole.name} — ZKSN Leśna"
    # Kontener nieobecny w modelu: sama nazwa pola (bez zmyślonego dopisku).
    bez = enm.model_copy(update={"branch_points": []})
    assert nazwa_pola_sterownika(bez, a) == pole.name


def test_obie_rodziny_identyfikuja_pole_jednoznacznie() -> None:
    dane = _koordynacja()["dict"]
    for rodzina in ("nadpradowe", "ziemnozwarciowe"):
        wiersze = dane[rodzina]["wiersze"]
        assert wiersze, rodzina
        urzadzenia_nazwy: dict[str, set[str]] = {}
        for w in wiersze:
            urzadzenia_nazwy.setdefault(w["pole_pl"], set()).add(w["urzadzenie_ref"])
        assert all(len(u) == 1 for u in urzadzenia_nazwy.values()), (rodzina, urzadzenia_nazwy)
        assert any(" — Stacja " in w["pole_pl"] for w in wiersze), rodzina


# --- Porządek wierszy (jedno miejsce: ``uporzadkuj_wiersze_rodzin``) -------------------------


def _stacja_wiersza(pole_pl: str) -> str:
    return pole_pl.rsplit(" — ", 1)[1] if " — " in pole_pl else ""


def test_klucz_naturalny_liczby_jako_liczby() -> None:
    nazwy = ["Stacja S10", "Stacja S2", "stacja s1", "GPZ Wschód"]
    assert sorted(nazwy, key=klucz_naturalny) == [
        "GPZ Wschód",
        "stacja s1",
        "Stacja S2",
        "Stacja S10",
    ]


@pytest.mark.parametrize("rodzina", ["nadpradowe", "ziemnozwarciowe"])
def test_porzadek_wierszy_ekranu(rodzina: str) -> None:
    enm = _model_g08()
    wiersze = _koordynacja()["dict"][rodzina]["wiersze"]
    pola = pola_sterownikow(enm)
    z_polem = [w for w in wiersze if w["urzadzenie_ref"] in pola]
    bez_pola = [w for w in wiersze if w["urzadzenie_ref"] not in pola]
    # Urządzenia bez pola w modelu na końcu.
    assert wiersze == [*z_polem, *bez_pola]
    stacje = [pola[w["urzadzenie_ref"]].kontener_pl or "" for w in z_polem]
    assert stacje == sorted(stacje, key=klucz_naturalny) and len(set(stacje)) == 4
    for stacja in set(stacje):
        kolejnosc = [
            pola[w["urzadzenie_ref"]].klucz_w_rozdzielnicy
            for w in z_polem
            if pola[w["urzadzenie_ref"]].kontener_pl == stacja
        ]
        assert kolejnosc == sorted(kolejnosc)
    assert [w["pole_nazwa_pl"] for w in z_polem] == [
        pola[w["urzadzenie_ref"]].nazwa_pl for w in z_polem
    ]
    assert [w["pole_kontener_pl"] for w in z_polem] == stacje
    assert [_stacja_wiersza(w["pole_pl"]) for w in z_polem] == stacje


def test_porzadek_raportu_nadpradowe_rowny_ekranowi() -> None:
    nadpr = _koordynacja()["dict"]["nadpradowe"]
    _, wiersze_raportu = tabela_rodziny_nadpradowej(nadpr)
    assert [r[0] for r in wiersze_raportu] == [
        w["pole_pl"] or w["sterownik_pl"] for w in nadpr["wiersze"]
    ]
    kolejnosc = {w["sterownik_pl"]: i for i, w in enumerate(nadpr["wiersze"])}
    zdania = zdania_rodziny_nadpradowej(nadpr)
    liczba_ocen = len(nadpr["oceny"])
    # Dwie grupy zdań (oceny, potem odmowy) — każda w kolejności wierszy ekranu.
    for grupa in (zdania[:liczba_ocen], zdania[liczba_ocen:]):
        pozycje = [kolejnosc[next(n for n in kolejnosc if z.startswith(f"{n}:"))] for z in grupa]
        assert pozycje and pozycje == sorted(pozycje)


def _ziemne_ze_scena_nastaw() -> dict[str, Any]:
    model = EnergyNetworkModel.model_validate(scena_z_nastawami("KOMPENSOWANY_AWSC"))
    return ocen_zabezpieczenia_ziemnozwarciowe(
        model, map_enm_to_network_graph(model), odniesienie="test"
    ).to_dict()


@pytest.mark.parametrize("zrodlo", ["koordynacja_g08", "scena_z_nastawami"])
def test_porzadek_raportu_ziemnozwarciowe_rowny_ekranowi(zrodlo: str) -> None:
    ziemne = (
        _koordynacja()["dict"]["ziemnozwarciowe"]
        if zrodlo == "koordynacja_g08"
        else _ziemne_ze_scena_nastaw()
    )
    kolejnosc = {w["urzadzenie_ref"]: i for i, w in enumerate(ziemne["wiersze"])}
    rekordy = rekordy_ziemnozwarciowe(ziemne)
    sprawdzone = 0
    for grupa in ("oceny", "odmowy"):
        refy = {id(r) for r in ziemne[grupa]}
        pozycje = [
            kolejnosc[r["urzadzenie_ref"]]
            for r in rekordy
            if id(r) in refy and r["urzadzenie_ref"] in kolejnosc
        ]
        assert pozycje == sorted(pozycje), grupa
        sprawdzone += len(pozycje)
    assert sprawdzone > 0
    if zrodlo == "scena_z_nastawami":
        assert any(r["urzadzenie_ref"] in kolejnosc for r in ziemne["oceny"])


def test_numer_dyspozytorski_i_kolejnosc_funkcji() -> None:
    enm = _model_g08()
    pola = pola_sterownikow(enm)
    stacja = sorted({p.kontener_pl for p in pola.values()}, key=lambda s: klucz_naturalny(s or ""))[
        0
    ]
    w_stacji = [ref for ref, p in pola.items() if p.kontener_pl == stacja]
    sterowniki = {a.ref_id: a for a in enm.protection_assignments}
    pola_ref = [sterowniki[r].bay_ref for r in w_stacji]
    # Numer dyspozytorski odwrotny do kolejności w modelu — ma pierwszeństwo.
    numery = {ref: str(10 - i) for i, ref in enumerate(pola_ref)}
    enm2 = enm.model_copy(
        update={
            "bays": [
                b.model_copy(update={"bay_number": numery[b.ref_id]}) if b.ref_id in numery else b
                for b in enm.bays
            ]
        }
    )
    wiersze = [{"urzadzenie_ref": r, "funkcja_ref": "x", "pole_pl": None} for r in w_stacji]
    wynik = [w["urzadzenie_ref"] for w in uporzadkuj_wiersze_rodzin(enm2, wiersze)]
    assert wynik == sorted(w_stacji, key=lambda r: pola[r].klucz_w_rozdzielnicy, reverse=True)
    # Funkcje jednego sterownika w kolejności sterownika (nie alfabetycznie).
    a = next(x for x in enm.protection_assignments if len(x.funkcje) >= 2)
    refy = [f.ref for f in a.funkcje]
    wiersze_f = [
        {"urzadzenie_ref": a.ref_id, "funkcja_ref": f, "pole_pl": None} for f in reversed(refy)
    ]
    assert [w["funkcja_ref"] for w in uporzadkuj_wiersze_rodzin(enm, wiersze_f)] == refy
