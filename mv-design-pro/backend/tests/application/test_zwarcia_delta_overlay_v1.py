"""Nakladka ROZNIC A/B na schemacie — mapper porownania zwarciowego (overlay v1).

DLUG, KTORY TE TESTY ZAMYKAJA: „klient bez dostawcy" nakladki delta. Klient
schematu wolal trase, ktorej zaden router nie serwuje, wiec funkcja widoczna
w interfejsie konczyla sie bledem. Dostawca stoi teraz w zywej sciezce
porownania zwarciowego, a te testy pilnuja jego kontraktu.

Pokrycie jest ILOCZYNEM CECH, a nie jednym przykladem z karty:
  obecnosc punktu (w obu / tylko A / tylko B)
  × komplet wielkosci (pelny / czesciowy / brak porownywalnych)
  × charakter roznicy (zmiana / brak zmiany / A = 0 ⇒ brak procentu)
  × tozsamosc refu (z `element_id` / bez `element_id`)
bo w kazdej z tych kombinacji defekt moglby sie schowac (element pokolorowany
jako zmieniony bez widocznej roznicy, punkt bez odpowiednika udajacy „bez zmian",
nakladka trafiajaca w ref, ktorego na schemacie nie ma).
"""

from __future__ import annotations

import pytest
from application.result_mapping.zwarcia_delta_overlay_v1 import (
    METRYKI_ROZNICOWE,
    METRYKI_WARTOSCI_B,
    RODZAJ_ANALIZY,
    zbuduj_nakladke_roznic,
)
from domain.result_contract_v1 import OverlayElementKind, OverlaySeverity
from domain.zwarcia_porownanie import zbuduj_porownanie_zwarc


def _wiersz(
    target_id: str,
    ikss: float,
    ip: float,
    ith: float,
    sk: float,
    *,
    element_id: str | None = None,
) -> dict:
    wiersz: dict = {
        "target_id": target_id,
        "target_name": f"Punkt {target_id}",
        "ikss_ka": ikss,
        "ip_ka": ip,
        "ith_ka": ith,
        "sk_mva": sk,
    }
    if element_id is not None:
        wiersz["element_id"] = element_id
    return wiersz


def _nakladka(wiersze_a: list[dict], wiersze_b: list[dict]):
    return zbuduj_nakladke_roznic(
        zbuduj_porownanie_zwarc(
            run_id_a="run-a",
            run_id_b="run-b",
            wiersze_a=wiersze_a,
            wiersze_b=wiersze_b,
        )
    )


# ---------------------------------------------------------------------------
# Tozsamosc elementu na schemacie
# ---------------------------------------------------------------------------


def test_element_nakladki_adresowany_refem_modelu_a_nie_wezlem_grafu() -> None:
    """Nakladka MUSI trafic w ref elementu modelu (`element_id`).

    Punkt zwarcia ma dwa identyfikatory. Gdyby nakladka adresowala wezel grafu
    przebiegu, kazdy element na schemacie zostalby bez pokrycia — nakladka byla
    by pusta mimo policzonych roznic.
    """
    nakladka = _nakladka(
        [_wiersz("node-7", 8.0, 20.0, 8.4, 200.0, element_id="bus-SN-1")],
        [_wiersz("node-7", 10.0, 25.0, 10.5, 250.0, element_id="bus-SN-1")],
    )
    assert set(nakladka.payload.elements) == {"bus-SN-1"}
    assert nakladka.payload.elements["bus-SN-1"].ref_id == "bus-SN-1"
    assert nakladka.payload.elements["bus-SN-1"].kind == OverlayElementKind.BUS


def test_brak_element_id_schodzi_na_wezel_grafu() -> None:
    """Starszy wynik bez `element_id` — ref zapasowy, nie utrata punktu."""
    nakladka = _nakladka(
        [_wiersz("node-7", 8.0, 20.0, 8.4, 200.0)],
        [_wiersz("node-7", 10.0, 25.0, 10.5, 250.0)],
    )
    assert set(nakladka.payload.elements) == {"node-7"}


# ---------------------------------------------------------------------------
# Wartosci roznic i ich waga
# ---------------------------------------------------------------------------


def test_metryki_niosa_roznice_z_domeny_a_nie_wartosci_bezwzgledne() -> None:
    """RACHUNEK RĘCZNY: A = 8,0 kA, B = 10,0 kA ⇒ Δ = 2,0 kA, Δ% = 25,0 %."""
    nakladka = _nakladka(
        [_wiersz("bus-1", 8.0, 20.0, 8.4, 200.0)],
        [_wiersz("bus-1", 10.0, 25.0, 10.5, 250.0)],
    )
    metryki = nakladka.payload.elements["bus-1"].metrics
    assert metryki["DELTA_IK_3F_KA"].value == pytest.approx(2.0, abs=1e-12)
    assert metryki["DELTA_IK_3F_KA"].unit == "kA"
    assert metryki["DELTA_IK_3F_PCT"].value == pytest.approx(25.0, abs=1e-12)
    assert metryki["DELTA_IK_3F_PCT"].unit == "%"
    assert metryki["DELTA_IP_KA"].value == pytest.approx(5.0, abs=1e-12)
    assert metryki["DELTA_ITH_KA"].value == pytest.approx(2.1, abs=1e-12)
    assert metryki["DELTA_SK_MVA"].value == pytest.approx(50.0, abs=1e-12)


def test_kody_metryk_roznicowych_nie_koliduja_z_kodami_wartosci() -> None:
    """Kod roznicy nie moze byc kodem wielkosci — inaczej Δ udalaby wartosc.

    S9-13: kody wartosci B (`B_*`) tez sa WLASNE — rozlaczne i z kodami roznic,
    i z kodami pojedynczego przebiegu (`IK_3F_A` itd.), zeby zadna warstwa nie
    pomylila wartosci przebiegu B z wartoscia biezacego wyniku ani z delta.
    """
    kody = {kod for kod, *_ in METRYKI_ROZNICOWE}
    kody_b = {kod for kod, *_ in METRYKI_WARTOSCI_B}
    kody_pojedynczego = {"IK_3F_A", "IP_A", "ITH_A", "SK_MVA"}
    assert kody.isdisjoint(kody_pojedynczego)
    assert all(kod.startswith("DELTA_") for kod in kody)
    assert kody_b.isdisjoint(kody_pojedynczego)
    assert kody_b.isdisjoint(kody)
    assert all(kod.startswith("B_") for kod in kody_b)


def test_punkt_ze_zmiana_ma_wage_ostrzezenia_a_bez_zmiany_informacyjna() -> None:
    nakladka = _nakladka(
        [_wiersz("bus-1", 8.0, 20.0, 8.4, 200.0), _wiersz("bus-2", 5.0, 12.0, 5.2, 100.0)],
        [_wiersz("bus-1", 10.0, 25.0, 10.5, 250.0), _wiersz("bus-2", 5.0, 12.0, 5.2, 100.0)],
    )
    assert nakladka.payload.elements["bus-1"].severity == OverlaySeverity.WARNING
    assert nakladka.payload.elements["bus-2"].severity == OverlaySeverity.INFO
    assert nakladka.liczba_punktow_zmienionych == 1
    assert nakladka.liczba_punktow_bez_zmian == 1


def test_waga_ostrzezenia_wymaga_widocznej_roznicy() -> None:
    """Predykat wagi i zbior pokazanych ROZNIC to JEDNO zrodlo prawdy.

    Element oznaczony jako zmieniony MUSI niesc co najmniej jedna niezerowa
    metryke ROZNICOWA; element informacyjny — same zerowe roznice. Rozjazd tych
    dwoch znaczylby kolor bez pokrycia w liczbach (albo liczby bez koloru).

    INTENCJA PO S9-13: nakladka niesie tez wartosci bezwzgledne przebiegu B
    (kody `B_*`) — te sa WYLACZNIE trescia do wyswietlenia i predykat wagi ich
    nie widzi (wartosc bezwzgledna jest niezerowa niemal zawsze, wiec kazdy
    punkt „bez zmian" stalby sie „zmieniony"). Dlatego rachunek ponizej filtruje
    metryki po prefiksie `DELTA_` — dokladnie tak, jak robi to kod.
    """
    nakladka = _nakladka(
        [_wiersz("bus-1", 8.0, 20.0, 8.4, 200.0), _wiersz("bus-2", 5.0, 12.0, 5.2, 100.0)],
        [_wiersz("bus-1", 10.0, 25.0, 10.5, 250.0), _wiersz("bus-2", 5.0, 12.0, 5.2, 100.0)],
    )
    for element in nakladka.payload.elements.values():
        niezerowe_roznice = [
            m
            for kod, m in element.metrics.items()
            if kod.startswith("DELTA_") and float(m.value) != 0.0
        ]
        if element.severity == OverlaySeverity.WARNING:
            assert niezerowe_roznice, f"{element.ref_id}: zmiana bez ani jednej niezerowej roznicy"
        else:
            assert not niezerowe_roznice, f"{element.ref_id}: brak zmiany mimo niezerowej roznicy"


def test_wartosci_b_nie_wplywaja_na_wage_ani_liczniki() -> None:
    """S9-13, predykaty parami: wartosc B to TRESC, nie predykat.

    Punkt „bez zmian" (identyczne wielkosci w A i B) ma NIEZEROWE wartosci
    bezwzgledne B — mimo to jego waga zostaje INFO, a licznik „bez zmian"
    go obejmuje. Gdyby predykat wagi widzial metryki `B_*`, kazdy punkt bez
    zmian zostalby falszywie pokolorowany jako zmieniony.
    """
    nakladka = _nakladka(
        [_wiersz("bus-1", 5.0, 12.0, 5.2, 100.0)],
        [_wiersz("bus-1", 5.0, 12.0, 5.2, 100.0)],
    )
    element = nakladka.payload.elements["bus-1"]
    assert element.metrics["B_IK_3F_KA"].value == pytest.approx(5.0, abs=1e-12)
    assert element.severity == OverlaySeverity.INFO
    assert nakladka.liczba_punktow_bez_zmian == 1
    assert nakladka.liczba_punktow_zmienionych == 0


def test_metryki_wartosci_b_niosa_wartosci_przebiegu_b() -> None:
    """S9-13: etykieta roznicy niesie tez wartosc, ktorej roznica dotyczy.

    Wartosci `B_*` sa PRZEPISANE z wyniku przebiegu B (nie liczone): Ik'' = 10,0
    kA, ip = 25,0 kA, Ith = 10,5 kA, Sk = 250,0 MVA.
    """
    nakladka = _nakladka(
        [_wiersz("bus-1", 8.0, 20.0, 8.4, 200.0)],
        [_wiersz("bus-1", 10.0, 25.0, 10.5, 250.0)],
    )
    metryki = nakladka.payload.elements["bus-1"].metrics
    assert metryki["B_IK_3F_KA"].value == pytest.approx(10.0, abs=1e-12)
    assert metryki["B_IK_3F_KA"].unit == "kA"
    assert metryki["B_IP_KA"].value == pytest.approx(25.0, abs=1e-12)
    assert metryki["B_ITH_KA"].value == pytest.approx(10.5, abs=1e-12)
    assert metryki["B_SK_MVA"].value == pytest.approx(250.0, abs=1e-12)
    assert metryki["B_SK_MVA"].unit == "MVA"


def test_wielkosc_b_nieobecna_nie_daje_metryki_b() -> None:
    """Starszy wynik B bez pola ⇒ brak metryki `B_*`, nigdy zero zastepcze."""
    a = _wiersz("bus-1", 8.0, 20.0, 8.4, 200.0)
    b = _wiersz("bus-1", 10.0, 25.0, 10.5, 250.0)
    del b["sk_mva"]
    nakladka = _nakladka([a], [b])
    metryki = nakladka.payload.elements["bus-1"].metrics
    assert "B_SK_MVA" not in metryki
    assert "B_IK_3F_KA" in metryki


def test_punkt_bez_roznic_nie_wchodzi_do_nakladki_mimo_wartosci_b() -> None:
    """Bramka wejscia do nakladki pochodzi z metryk ROZNICOWYCH (jedno zrodlo).

    Punkt wspolny bez ani jednej porownywalnej roznicy zostaje w grupie „bez
    danych", nawet jesli przebieg B ma wartosci — element z sama wartoscia B
    sugerowalby „bez zmian" tam, gdzie prawda jest „brak danych".
    """
    a = {"target_id": "bus-1", "target_name": "Punkt"}
    b = _wiersz("bus-1", 10.0, 25.0, 10.5, 250.0)
    nakladka = _nakladka([a], [b])
    assert nakladka.payload.elements == {}
    assert nakladka.liczba_punktow_bez_danych == 1


def test_odniesienie_zerowe_pomija_procent_a_nie_zeruje_go() -> None:
    """A = 0 ⇒ procent NIE ISTNIEJE; metryka jest nieobecna, nie zerowa."""
    nakladka = _nakladka(
        [_wiersz("bus-1", 0.0, 0.0, 0.0, 0.0)],
        [_wiersz("bus-1", 10.0, 25.0, 10.5, 250.0)],
    )
    metryki = nakladka.payload.elements["bus-1"].metrics
    assert "DELTA_IK_3F_PCT" not in metryki
    assert metryki["DELTA_IK_3F_KA"].value == pytest.approx(10.0, abs=1e-12)


def test_wielkosc_obecna_tylko_w_jednym_przebiegu_nie_daje_metryki() -> None:
    """Czesciowy komplet wielkosci: brak Sk po jednej stronie ⇒ brak ΔSk."""
    a = _wiersz("bus-1", 8.0, 20.0, 8.4, 200.0)
    b = _wiersz("bus-1", 10.0, 25.0, 10.5, 250.0)
    del b["sk_mva"]
    nakladka = _nakladka([a], [b])
    metryki = nakladka.payload.elements["bus-1"].metrics
    assert "DELTA_SK_MVA" not in metryki
    assert "DELTA_IK_3F_KA" in metryki


# ---------------------------------------------------------------------------
# Punkty bez roznicy — uczciwy brak zamiast fabrykacji
# ---------------------------------------------------------------------------


def test_punkt_bez_odpowiednika_nie_jest_elementem_nakladki_ale_jest_policzony() -> None:
    nakladka = _nakladka(
        [_wiersz("bus-1", 8.0, 20.0, 8.4, 200.0), _wiersz("bus-tylko-a", 4.0, 9.0, 4.1, 90.0)],
        [_wiersz("bus-1", 10.0, 25.0, 10.5, 250.0), _wiersz("bus-tylko-b", 4.0, 9.0, 4.1, 90.0)],
    )
    assert set(nakladka.payload.elements) == {"bus-1"}
    assert nakladka.liczba_punktow_bez_odpowiednika == 2


def test_punkt_wspolny_bez_porownywalnych_wielkosci_jest_osobna_grupa() -> None:
    """Brak danych to NIE „bez zmian" — inaczej pusty wynik udawalby zgodnosc."""
    nakladka = _nakladka(
        [{"target_id": "bus-1", "target_name": "Punkt"}],
        [{"target_id": "bus-1", "target_name": "Punkt"}],
    )
    assert nakladka.payload.elements == {}
    assert nakladka.liczba_punktow_bez_danych == 1
    assert nakladka.liczba_punktow_bez_zmian == 0


def test_liczniki_dziela_wszystkie_punkty_bez_reszty() -> None:
    """INWARIANT: suma czterech grup = liczba punktow porownania.

    Liczniki pochodza z jednej petli; ten test pilnuje, ze zaden punkt nie
    wypada z rachunku ani nie jest policzony dwa razy.
    """
    porownanie = zbuduj_porownanie_zwarc(
        run_id_a="run-a",
        run_id_b="run-b",
        wiersze_a=[
            _wiersz("bus-1", 8.0, 20.0, 8.4, 200.0),
            _wiersz("bus-2", 5.0, 12.0, 5.2, 100.0),
            _wiersz("bus-tylko-a", 4.0, 9.0, 4.1, 90.0),
            {"target_id": "bus-bez-danych", "target_name": "Bez danych"},
        ],
        wiersze_b=[
            _wiersz("bus-1", 10.0, 25.0, 10.5, 250.0),
            _wiersz("bus-2", 5.0, 12.0, 5.2, 100.0),
            _wiersz("bus-tylko-b", 4.0, 9.0, 4.1, 90.0),
            {"target_id": "bus-bez-danych", "target_name": "Bez danych"},
        ],
    )
    nakladka = zbuduj_nakladke_roznic(porownanie)
    suma = (
        nakladka.liczba_punktow_zmienionych
        + nakladka.liczba_punktow_bez_zmian
        + nakladka.liczba_punktow_bez_odpowiednika
        + nakladka.liczba_punktow_bez_danych
    )
    assert suma == len(porownanie.punkty)
    assert nakladka.liczba_punktow_bez_odpowiednika == (
        porownanie.liczba_punktow_tylko_a + porownanie.liczba_punktow_tylko_b
    )


# ---------------------------------------------------------------------------
# Kontrakt i determinizm
# ---------------------------------------------------------------------------


def test_rodzaj_analizy_oznacza_roznice() -> None:
    """Prefiks „DELTA_" jest kontraktem — po nim konsument wie, ze to roznice."""
    assert RODZAJ_ANALIZY.startswith("DELTA_")


def test_legenda_jest_polska_i_pochodzi_z_backendu() -> None:
    etykiety = [
        wpis.label
        for wpis in zbuduj_nakladke_roznic(
            zbuduj_porownanie_zwarc(run_id_a="a", run_id_b="b", wiersze_a=[], wiersze_b=[])
        ).payload.legend.entries
    ]
    assert etykiety == ["Bez zmian", "Zmiana"]


def test_ten_sam_wynik_daje_ten_sam_odcisk_tresci() -> None:
    wiersze_a = [_wiersz("bus-2", 5.0, 12.0, 5.2, 100.0), _wiersz("bus-1", 8.0, 20.0, 8.4, 200.0)]
    wiersze_b = [_wiersz("bus-2", 5.5, 13.0, 5.7, 110.0), _wiersz("bus-1", 10.0, 25.0, 10.5, 250.0)]
    pierwsza = _nakladka(wiersze_a, wiersze_b)
    druga = _nakladka(list(reversed(wiersze_a)), list(reversed(wiersze_b)))
    assert pierwsza.content_hash() == druga.content_hash()
    assert list(pierwsza.payload.elements) == sorted(pierwsza.payload.elements)


def test_zamiana_przebiegow_miejscami_zmienia_odcisk() -> None:
    """Kierunek porownania jest istotny — Δ zmienia znak, wiec i odcisk."""
    wiersze_a = [_wiersz("bus-1", 8.0, 20.0, 8.4, 200.0)]
    wiersze_b = [_wiersz("bus-1", 10.0, 25.0, 10.5, 250.0)]
    assert (
        _nakladka(wiersze_a, wiersze_b).content_hash()
        != _nakladka(wiersze_b, wiersze_a).content_hash()
    )
