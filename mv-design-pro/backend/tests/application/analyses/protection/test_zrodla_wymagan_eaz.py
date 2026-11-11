"""Źródła wymagań oceny zabezpieczeń ziemnozwarciowych — tabela przypięta testem
(wymaganie właściciela 3 przy przekazaniu karty EKRANY-EAZ-ZIEMNOZWARCIOWE).

Rozróżnienie stanów nie może się zmienić przy wpinaniu ekranu ani raportu:
* ENEA zweryfikowane — IRiESD ENEA, tekst ujednolicony wer. 2.3 od 19.10.2026: k_c pkt
  II.4.5.4.1.4 ppkt 1–5 (1,5 metaliczne; 1,2 przy U₀ = 50 %; 2,0 Y₀>/G₀> z rezystorem;
  1,5 G₀> z AWSC; 1,2 pozostałe), zakres U₀> pkt II.4.5.4.1.5 (10/15/20 % — górne granice);
* założenie inżynierskie (ESTIMATED) — k_b = 1,2, k_c watometryczne i konduktancyjne spoza
  punktu;
* niezweryfikowane — Δt (IRiESD pkt II.4.5.1.8), U_Tp (PN-EN 50522 rys. 4, pkt 5.4.3);
* wartość projektanta — nadpisanie w przypadku obliczeniowym, oznaczone, nie udaje ENEA.

ILOCZYN CECH: wiersz tabeli × {wartość, stan, odwołanie} (literał) × droga {rejestr, wynik oceny,
fikstura frontu — ta, którą czyta ekran} × wymaganie {bez nadpisania, nadpisane w przypadku}.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from application.analyses.protection.coordination.models import CoordinationConfig
from application.analyses.protection.ocena_ziemnozwarciowa import (
    ocen_zabezpieczenia_ziemnozwarciowe,
)
from application.analyses.protection.rodziny_eaz import (
    ZRODLA_WYMAGAN_EAZ,
    podstawa_u0_roboczego,
    wymaganie_k_b,
    wymaganie_k_c,
    wymaganie_k_c_opor,
)
from domain.study_case import KLUCZE_WYMAGAN_EAZ, wymagania_eaz_z_danych
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel

from tests.reference_networks.scena_doziemienia import scena_z_nastawami

#: (klucz, wartość, stan, fragment odwołania) — LITERAŁ: zmiana wartości albo stanu wymaga
#: świadomej zmiany tego testu (z odwołaniem do źródła).
TABELA: tuple[tuple[str, float | None, str, str], ...] = (
    ("k_c.zerowopradowe", 1.5, "ENEA_ZWERYFIKOWANE", "pkt II.4.5.4.1.4 ppkt 1 (s. 51)"),
    ("k_c_opor.zerowopradowe", 1.2, "ENEA_ZWERYFIKOWANE", "pkt II.4.5.4.1.4 ppkt 2 (s. 51)"),
    ("k_c.admitancyjne_rezystor", 2.0, "ENEA_ZWERYFIKOWANE", "pkt II.4.5.4.1.4 ppkt 3 (s. 51)"),
    ("k_c.konduktancyjne_awsc", 1.5, "ENEA_ZWERYFIKOWANE", "pkt II.4.5.4.1.4 ppkt 4 (s. 51)"),
    ("k_c.admitancyjne_pozostale", 1.2, "ENEA_ZWERYFIKOWANE", "pkt II.4.5.4.1.4 ppkt 5 (s. 51)"),
    ("k_c.watometryczne", 1.5, "ZALOZENIE_INZYNIERSKIE", "założenie inżynierskie"),
    ("k_c.konduktancyjne_pozostale", 1.5, "ZALOZENIE_INZYNIERSKIE", "założenie inżynierskie"),
    ("k_b", 1.2, "ZALOZENIE_INZYNIERSKIE", "IRiESD ENEA nie podaje k_b"),
    ("u0_prog.rezystor", 10.0, "ENEA_ZWERYFIKOWANE", "pkt II.4.5.4.1.5 ppkt 1 (s. 51)"),
    ("u0_prog.izolowany", 15.0, "ENEA_ZWERYFIKOWANE", "pkt II.4.5.4.1.5 ppkt 2 (s. 51)"),
    ("u0_prog.kompensowany", 20.0, "ENEA_ZWERYFIKOWANE", "pkt II.4.5.4.1.5 ppkt 3 (s. 51)"),
    ("delta_t", None, "NIEZWERYFIKOWANE", "pkt II.4.5.1.8"),
    ("u_tp", None, "NIEZWERYFIKOWANE", "PN-EN 50522:2011, rysunek 4 i pkt 5.4.3"),
)
WYDANIE = "wersja 2.3, tekst ujednolicony obowiązujący od 19.10.2026"

FIKSTURA = (
    Path(__file__).resolve().parents[5]
    / "frontend/src/ui2/wyniki/koordynacja/__tests__/fixtures/oceny_ziemnozwarciowe.json"
)


def test_tabela_zrodel_przypieta() -> None:
    assert [(z.klucz, z.wartosc, z.stan) for z in ZRODLA_WYMAGAN_EAZ] == [
        (k, w, s) for k, w, s, _ in TABELA
    ]
    for z, (_, _, stan, odwolanie) in zip(ZRODLA_WYMAGAN_EAZ, TABELA, strict=True):
        assert odwolanie in z.odwolanie_pl, z.klucz
        if stan == "ENEA_ZWERYFIKOWANE" or z.klucz == "delta_t":
            assert "IRiESD ENEA" in z.odwolanie_pl and WYDANIE in z.odwolanie_pl


def test_wymagania_czytaja_tabele_bez_zmiany_stanu() -> None:
    """Każda funkcja ``wymaganie_*`` zwraca wartość i stan z tabeli; ENEA — podstawa OSD
    ZWERYFIKOWANE, założenie — dana przyjęta (ESTIMATED), nigdy odwrotnie."""
    przypadki = [
        (wymaganie_k_c("51N", "IZOLOWANY"), "k_c.zerowopradowe"),
        (wymaganie_k_c("67N", "KOMPENSOWANY_AWSC"), "k_c.zerowopradowe"),
        (wymaganie_k_c_opor("51N"), "k_c_opor.zerowopradowe"),
        (wymaganie_k_c("Yo>", "UZIEMIONY_REZYSTOR"), "k_c.admitancyjne_rezystor"),
        (wymaganie_k_c("Go>", "KOMPENSOWANY_AWSC"), "k_c.konduktancyjne_awsc"),
        (wymaganie_k_c("Bo>", "IZOLOWANY"), "k_c.admitancyjne_pozostale"),
        (wymaganie_k_c("32N", "IZOLOWANY"), "k_c.watometryczne"),
        (wymaganie_k_c("Go>", "IZOLOWANY"), "k_c.konduktancyjne_pozostale"),
        (wymaganie_k_b("ZEROWOPRADOWE"), "k_b"),
        (wymaganie_k_b("KIERUNKOWE_67N"), "k_b"),
    ]
    tabela = {k: (w, s) for k, w, s, _ in TABELA}
    for wymaganie, klucz in przypadki:
        assert wymaganie is not None
        assert (wymaganie.wartosc, wymaganie.stan) == tabela[klucz], klucz
        if wymaganie.stan == "ENEA_ZWERYFIKOWANE":
            assert wymaganie.podstawa.rodzaj == "OSD"
            assert wymaganie.podstawa.status == "ZWERYFIKOWANE"
            assert wymaganie.przyjete is False
        else:
            assert wymaganie.podstawa.rodzaj == "ZALOZENIE_PROJEKTOWE"
            assert wymaganie.podstawa.status != "ZWERYFIKOWANE"
            assert wymaganie.przyjete is True
    for sposob, wartosc in (
        ("UZIEMIONY_REZYSTOR", 10.0),
        ("IZOLOWANY", 15.0),
        ("KOMPENSOWANY", 20.0),
        ("KOMPENSOWANY_AWSC", 20.0),
    ):
        u0, zdanie = podstawa_u0_roboczego(sposob)  # type: ignore[arg-type]
        assert u0 == wartosc and "II.4.5.4.1.5" in zdanie and WYDANIE in zdanie


@pytest.mark.parametrize("klucz", KLUCZE_WYMAGAN_EAZ)
def test_wartosc_projektanta_oznaczona_nie_udaje_enea(klucz: str) -> None:
    wymagania = {klucz: 1.7}
    w = (
        wymaganie_k_b("ZEROWOPRADOWE", wymagania)
        if klucz == "k_b"
        else (
            wymaganie_k_c("51N", "IZOLOWANY", wymagania)
            if klucz == "k_c"
            else wymaganie_k_c_opor("51N", wymagania)
        )
    )
    assert w is not None
    assert w.wartosc == 1.7 and w.stan == "WARTOSC_PROJEKTANTA"
    assert w.podstawa.rodzaj == "ZALOZENIE_PROJEKTOWE" and w.podstawa.status == "WSKAZANE"
    assert "ENEA" not in w.podstawa.dokument and w.przyjete is False
    assert w.to_dict()["stan_pl"] == "wartość projektanta (przypadek obliczeniowy)"


def test_lista_kluczy_przypadku_jest_zamknieta() -> None:
    """Jedno źródło kluczy (domena przypadku): każdy klucz jest konsumowany przez ewaluator,
    klucz spoza listy odrzuca walidacja przypadku."""
    assert KLUCZE_WYMAGAN_EAZ == ("k_b", "k_c", "k_c_opor")
    with pytest.raises(ValueError):
        wymagania_eaz_z_danych({"k_x": 1.5})
    for zle in (0.0, -1.0, float("nan"), float("inf"), "1,5", True):
        with pytest.raises(ValueError):
            wymagania_eaz_z_danych({"k_b": zle})


def _rejestr() -> list[dict]:
    return [z.to_dict() for z in ZRODLA_WYMAGAN_EAZ]


def test_wynik_i_fikstura_ekranu_niosa_tabele_bez_przeksztalcen() -> None:
    """Rejestr przed oceną = rejestr po ocenie = tabela w wyniku = tabela w fikstur(z)e, którą
    czyta ekran (fikstura jest równa backendowi — ``test_fikstura_oceny_ziemnozwarciowej``).
    Δt w wyniku niesie liczbę z założeń koordynacji, stan i odwołanie bez zmiany."""
    przed = json.dumps(_rejestr(), sort_keys=True)
    enm = EnergyNetworkModel.model_validate(scena_z_nastawami("IZOLOWANY"))
    wynik = ocen_zabezpieczenia_ziemnozwarciowe(
        enm, map_enm_to_network_graph(enm), odniesienie="t", wymagania={"k_b": 1.4}
    ).to_dict()
    assert json.dumps(_rejestr(), sort_keys=True) == przed
    cti = CoordinationConfig().get_minimum_grading_margin_s()
    oczekiwane = [
        {**z, "wartosc": cti} if z["klucz"] == "delta_t" else z for z in json.loads(przed)
    ]
    assert wynik["zrodla_wymagan"] == oczekiwane
    fikstura = json.loads(FIKSTURA.read_text(encoding="utf-8"))
    for wariant in fikstura.values():
        assert wariant["zrodla_wymagan"] == oczekiwane
    # Nadpisanie k_b w przypadku: wiersze niosą stan wartości projektanta, tabela źródeł nie.
    stany = {w["wymagania"]["k_b"]["stan"] for w in wynik["wiersze"] if "k_b" in w["wymagania"]}
    assert stany == {"WARTOSC_PROJEKTANTA"}
