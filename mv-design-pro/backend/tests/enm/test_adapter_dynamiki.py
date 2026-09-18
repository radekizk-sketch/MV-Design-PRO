"""Adapter biegu `dynamika_rms` (karta W6-3B): złożenie wejścia, parytet Y-bus, odmowy.

ILOCZYN CECH, NIE PRZYKŁAD Z KARTY (CLAUDE.md „KLASA, NIE INSTANCJA" p. 2). Sieć
wzorcowa G16 niesie RÓWNOCZEŚNIE: transformator z przekładnią zespoloną (zaczep
poza znamionowym × grupa Dyn11), łącznik zamknięty × łącznik otwarty, kabel z
susceptancją poprzeczną × linię napowietrzną, baterię kondensatorów, odbiór na
szynie BEZ wytwórcy × odbiór na szynie Z wytwórcą, maszynę synchroniczną ×
przekształtnik nadążny. Każda z tych cech mogłaby ukryć defekt osobno; test
sprawdza je w jednym biegu, bo w jednym biegu żyją.

ODMOWY sprawdzamy dla KAŻDEGO braku osobno (brak punktu pracy × brak nastaw ×
rodzaj zdarzenia spoza zbioru × rodzina bez modelu × odbiór ZIP × dwa urządzenia
na szynie × zwarcie niesymetryczne × scenariusz poza horyzontem), bo „jedna
odmowa działa" nie dowodzi, że działają pozostałe.
"""

from __future__ import annotations

import copy
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest
from enm.adapter_dynamiki import (
    KOD_ELEMENT_BEZ_SZYNY,
    KOD_NASTAWY_BRAK,
    KOD_ODBIOR_ZIP,
    KOD_PUNKT_PRACY_INNA_MIGAWKA,
    KOD_PUNKT_PRACY_NIE_ROZPLYW,
    KOD_PUNKT_PRACY_NIEPELNY,
    KOD_RODZINA_BEZ_MODELU,
    KOD_SCENARIUSZ_BRAK,
    KOD_SKOK_POZA_ODBIOREM,
    KOD_WIELE_URZADZEN_W_WEZLE,
    KOD_ZDARZENIE_NIEOBSLUGIWANE,
    KOD_ZRODLO_BEZ_DYNAMIKI,
    KODY_ODMOW_ADAPTERA,
    OdmowaWejsciaDynamiki,
    PunktPracyRozplywu,
    braki_modelu_dynamiki,
    odmow_gdy_braki_modelu,
    punkt_pracy_z_biegu_rozplywu,
    zloz_wejscie_dynamiki,
    zloz_widok_sieci,
)
from enm.assembler import czestotliwosc_studium_hz, zbuduj_graf, zloz_wejscie_rozplywu
from enm.canonical_analysis import CanonicalRun, _execute_power_flow
from enm.mapping import ref_to_graph_id
from enm.models import EnergyNetworkModel
from network_model.solvers.dynamika import OdmowaDynamiki, SilnikDynamiki, zloz_model_sieci
from network_model.solvers.power_flow_newton_internal import build_slack_island, build_ybus_pu

from tests.golden.enm_builders.dynamika_rms import build_dynamika_rms_enm

#: Nastawy numeryczne używane w testach tego modułu — komplet pól kontraktu
#: (adapter nie ma domyślek, więc każdy test musi je podać w całości).
NASTAWY: dict[str, Any] = {
    "dt_s": 0.002,
    "dt_min_s": 0.002,
    "dt_max_s": 0.002,
    "tolerancja": 1.0e-10,
    "tolerancja_kroku": 1.0e-6,
    "eps_init": 1.0e-6,
    "max_iteracji_newtona": 40,
    "max_nawrotow": 30,
    "integrator": "trapez_niejawny",
}

#: Scenariusz czasowy: zwarcie 3F na sekcji B z wyłączeniem + skok obciążenia.
SCENARIUSZ: dict[str, Any] = {
    "horyzont_s": 0.4,
    "krok_wyjscia_s": 0.02,
    "zdarzenia": [
        {
            "rodzaj": "zwarcie",
            "t_s": 0.1,
            "bus_ref": "b-sn-b",
            "typ": "3F",
            "r_f_ohm": 0.0,
            "x_f_ohm": 1.0,
            "t_usuniecia_s": 0.2,
        },
        {
            "rodzaj": "skok_obciazenia",
            "t_s": 0.3,
            "ref_id": "odb-odplyw",
            "delta_p_mw": 0.5,
            "delta_q_mvar": 0.1,
        },
    ],
}

HASH_MIGAWKI = "sha256:g16"


def migawka() -> dict[str, Any]:
    """Migawka G16 w postaci, w jakiej niesie ją `CanonicalRun.snapshot`."""
    return EnergyNetworkModel.model_validate(build_dynamika_rms_enm()).model_dump(mode="json")


def opcje(**nadpisania: Any) -> dict[str, Any]:
    dane: dict[str, Any] = {
        "dynamika": copy.deepcopy(SCENARIUSZ),
        "nastawy_solvera": dict(NASTAWY),
    }
    dane.update(nadpisania)
    return dane


def _bieg_rozplywu(snapshot: dict[str, Any]) -> CanonicalRun:
    run = CanonicalRun(
        id=uuid4(),
        case_id="case-dynamika",
        project_id=None,
        analysis_type="PF",
        status="CREATED",
        created_at=datetime.now(UTC),
        snapshot_hash=HASH_MIGAWKI,
        input_hash="sha256:pf",
        snapshot=snapshot,
        validation={},
        readiness={},
        options={},
    )
    _execute_power_flow(run)
    run.status = "FINISHED"
    return run


def punkt_pracy(snapshot: dict[str, Any], bieg: CanonicalRun) -> PunktPracyRozplywu:
    return punkt_pracy_z_biegu_rozplywu(
        run_id=str(bieg.id),
        analysis_type=bieg.analysis_type,
        status=bieg.status,
        snapshot_hash=bieg.snapshot_hash,
        raw_result=bieg.raw_result,
        snapshot=snapshot,
        oczekiwany_snapshot_hash=HASH_MIGAWKI,
    )


def zloz(snapshot: dict[str, Any], options: dict[str, Any], punkt: PunktPracyRozplywu):
    """Ta sama KOLEJNOSC co `_execute_dynamika_rms`, nie skrot testowy.

    Odmowa modelu idzie PRZED budowa grafu — bo assembler (`enm/mapping.py`) od
    2026-09-18 tez odmawia elementowi z wiszaca referencja szyny (wczesniej
    pomijal go po cichu, przez co rozplyw i zwarcia liczyly siec inna niz
    zapisana). Gdyby helper budowal graf jako ARGUMENT, jak robil do tej pory,
    pierwszy odezwalby sie assembler i test sprawdzalby komunikat innej warstwy
    niz ta, o ktorej mowi jego nazwa.
    """
    odmow_gdy_braki_modelu(EnergyNetworkModel.model_validate(snapshot))
    return zloz_wejscie_dynamiki(
        snapshot,
        options,
        punkt=punkt,
        graph=zbuduj_graf(snapshot),
        f_bazowa_hz=czestotliwosc_studium_hz(snapshot),
    )


@pytest.fixture(scope="module")
def snapshot_g16() -> dict[str, Any]:
    return migawka()


@pytest.fixture(scope="module")
def rozplyw_g16(snapshot_g16: dict[str, Any]) -> CanonicalRun:
    return _bieg_rozplywu(snapshot_g16)


@pytest.fixture
def punkt_g16(snapshot_g16: dict[str, Any], rozplyw_g16: CanonicalRun) -> PunktPracyRozplywu:
    return punkt_pracy(snapshot_g16, rozplyw_g16)


# ---------------------------------------------------------------------------
# Rejestr kodów odmów — deklaracja z przypiętym testem
# ---------------------------------------------------------------------------


def test_kody_odmow_zamkniete() -> None:
    """Rejestr jest ZAMKNIĘTY: kod spoza niego nie może powstać jako odmowa.

    Bez tego testu zdanie „rejestr zamknięty" w docstringu modułu byłoby
    obietnicą bez pokrycia (CLAUDE.md „KLASA, NIE INSTANCJA" p. 4).
    """
    assert len(set(KODY_ODMOW_ADAPTERA)) == len(KODY_ODMOW_ADAPTERA)
    assert all(kod.startswith("dynamika.") for kod in KODY_ODMOW_ADAPTERA)
    for kod in KODY_ODMOW_ADAPTERA:
        odmowa = OdmowaWejsciaDynamiki(kod, "komunikat")
        assert odmowa.kod == kod
        assert kod in str(odmowa)
    with pytest.raises(AssertionError, match="spoza rejestru"):
        OdmowaWejsciaDynamiki("dynamika.kod_ktorego_nie_ma", "komunikat")


# ---------------------------------------------------------------------------
# Parytet Y-bus: bieg czasowy liczy na TEJ SAMEJ sieci, co rozpływ
# ---------------------------------------------------------------------------


class TestParytetYbus:
    """Macierz admitancyjna adaptera = macierz rozpływu (ta sama migawka).

    To jest warunek, od którego zależy SENS punktu pracy: jeśli macierze się
    rozjadą, rozwiązanie rozpływu przestaje spełniać `Y·V = I(x,V)` i bramka
    równowagi rdzenia odrzuca bieg (albo — gorzej — `eps_init` dobrany „pod
    wynik" przykrywa niespójność). Test jest zarazem PRZYPIĘCIEM długu nazwanego
    w module: impedancja zastępcza łącznika zamkniętego żyje w dwóch miejscach
    (rdzeń rozpływu FROZEN i adapter), więc rozjazd wartości musi wywalić test.
    """

    def _macierze(self, snapshot: dict[str, Any]):
        graph = zbuduj_graf(snapshot)
        wejscie_pf = zloz_wejscie_rozplywu(snapshot, {}, graph=graph)
        pf_input = wejscie_pf.pf_input
        wyspa, _ = build_slack_island(pf_input.graph, pf_input.slack.node_id)
        ybus_pf, indeks_pf, *_ = build_ybus_pu(
            pf_input.graph,
            wyspa,
            pf_input.base_mva,
            pf_input.slack.node_id,
            pf_input.shunts,
            {},
        )
        widok = zloz_widok_sieci(snapshot, graph, base_mva=wejscie_pf.base_mva)
        model = zloz_model_sieci(widok.wezly, widok.galezie, widok.odsprzegi)
        return ybus_pf, indeks_pf, model

    def test_ybus_dynamiki_rowna_ybus_rozplywu(self, snapshot_g16: dict[str, Any]) -> None:
        ybus_pf, indeks_pf, model = self._macierze(snapshot_g16)
        ybus_dyn = model.ybus.toarray()
        assert len(model.identy_wezlow) == len(indeks_pf)
        najwieksza_roznica = 0.0
        for i, ident_i in enumerate(model.identy_wezlow):
            for j, ident_j in enumerate(model.identy_wezlow):
                roznica = abs(
                    ybus_dyn[i, j]
                    - ybus_pf[
                        indeks_pf[ref_to_graph_id(ident_i)], indeks_pf[ref_to_graph_id(ident_j)]
                    ]
                )
                najwieksza_roznica = max(najwieksza_roznica, roznica)
        # Różnica pochodzi WYŁĄCZNIE z kolejności mnożeń bazowych (rozpływ skaluje
        # gałąź ilorazem baz, potem całą macierz bazą szyny bilansującej; adapter
        # mnoży od razu bazą własnej szyny) — jest rzędu błędu maszynowego wobec
        # normy macierzy (~1,6e4 dla tej sieci), nie różnicą modelu.
        assert najwieksza_roznica < 1.0e-9, f"rozjazd Y-bus: {najwieksza_roznica}"

    def test_lacznik_zamkniety_wchodzi_a_otwarty_nie(self, snapshot_g16: dict[str, Any]) -> None:
        widok = zloz_widok_sieci(snapshot_g16, zbuduj_graf(snapshot_g16), base_mva=100.0)
        identy = {galaz.ident for galaz in widok.galezie}
        assert "spr-szyn" in identy, "łącznik ZAMKNIĘTY musi wejść do macierzy (zwarcie szyn)"
        assert "odl-rezerwa" not in identy, "łącznik OTWARTY nie przewodzi — nie ma go w macierzy"
        assert "kab-odplyw" in identy, "kabel w ruchu wchodzi do macierzy"
        assert "kab-rezerwa" not in identy, "gałąź POZA RUCHEM nie wchodzi do macierzy"

    def test_przekladnia_zespolona_transformatora(self, snapshot_g16: dict[str, Any]) -> None:
        """Moduł ≠ 1 (zaczep + przekładnia poza-znamionowa) i kąt ≠ 0 (Dyn11) RAZEM."""
        widok = zloz_widok_sieci(snapshot_g16, zbuduj_graf(snapshot_g16), base_mva=100.0)
        (trafo,) = (galaz for galaz in widok.galezie if galaz.ident == "tr-gpz")
        assert abs(trafo.przekladnia) != pytest.approx(1.0, abs=1.0e-6)
        assert trafo.przekladnia.imag < 0.0, "Dyn11: t = |t|·e^{-jθ}, θ = +30° ⇒ część urojona < 0"

    def test_kabel_niesie_susceptancje_a_transformator_nie(
        self, snapshot_g16: dict[str, Any]
    ) -> None:
        widok = zloz_widok_sieci(snapshot_g16, zbuduj_graf(snapshot_g16), base_mva=100.0)
        po_identach = {galaz.ident: galaz for galaz in widok.galezie}
        assert po_identach["kab-odplyw"].b_poprzeczna_pu > 0.0
        assert po_identach["lin-oze"].b_poprzeczna_pu > 0.0
        assert po_identach["tr-gpz"].b_poprzeczna_pu == 0.0

    def test_bateria_zalaczona_jest_odsprzegiem_a_wylaczona_nie(
        self, snapshot_g16: dict[str, Any]
    ) -> None:
        widok = zloz_widok_sieci(snapshot_g16, zbuduj_graf(snapshot_g16), base_mva=100.0)
        (bateria,) = widok.odsprzegi
        assert bateria.ident == "bat-kompensacja"
        assert bateria.wezel == "b-sn-a"
        assert bateria.g_pu == 0.0
        assert bateria.b_pu == pytest.approx(2.0 / 100.0)
        assert "bat-wylaczona" not in {odsprzeg.ident for odsprzeg in widok.odsprzegi}

    def test_zloz_widok_sieci_odmawia_galezi_do_nieistniejacej_szyny(
        self, snapshot_g16: dict[str, Any]
    ) -> None:
        """Widok sieci SAM odmawia — bramka modelowa nie jest jego jedynym strażnikiem.

        `zloz_widok_sieci` jest funkcją publiczną (woła ją test parytetu Y-bus i
        każdy przyszły konsument widoku), więc cichy skip wewnątrz niej byłby
        defektem osiągalnym z pominięciem `braki_modelu_dynamiki`.
        """
        snapshot = copy.deepcopy(snapshot_g16)
        snapshot["branches"][0]["to_bus_ref"] = "b-nie-ma"
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            zloz_widok_sieci(snapshot, zbuduj_graf(snapshot_g16), base_mva=100.0)
        assert blad.value.kod == KOD_ELEMENT_BEZ_SZYNY

    def test_zloz_widok_sieci_odmawia_transformatora_do_nieistniejacej_szyny(
        self, snapshot_g16: dict[str, Any]
    ) -> None:
        snapshot = copy.deepcopy(snapshot_g16)
        snapshot["transformers"][0]["lv_bus_ref"] = "b-nie-ma"
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            zloz_widok_sieci(snapshot, zbuduj_graf(snapshot_g16), base_mva=100.0)
        assert blad.value.kod == KOD_ELEMENT_BEZ_SZYNY


# ---------------------------------------------------------------------------
# Podział mocy węzła — jeden predykat dla szyny z odbiorem i bez
# ---------------------------------------------------------------------------


class TestPodzialMocyWezla:
    def test_moc_urzadzenia_jest_wstrzykiem_powiekszonym_o_odbiory_szyny(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        """Szyna Z odbiorem (`b-sn-b`) i szyna BEZ odbioru (`b-oze`) — jedna reguła.

        Na szynie z odbiorem moc urządzenia musi być WIĘKSZA od wstrzyku
        wypadkowego dokładnie o moc odbioru; na szynie bez odbioru — równa.
        Dwie niezależne reguły „moc źródła z nastawy" i „moc odbioru z modelu"
        zgadzałyby się tu przypadkiem, a rozjechały przy regulacji napięcia.
        """
        wejscie = zloz(snapshot_g16, opcje(), punkt_g16)
        moce = wejscie.punkt_pracy.moce_zrodel_pu
        assert moce["gen-synchroniczny"] == pytest.approx(
            punkt_g16.wstrzyki_pu["b-sn-b"] + complex(0.4 / 100.0, 0.1 / 100.0)
        )
        assert moce["gen-pv"] == pytest.approx(punkt_g16.wstrzyki_pu["b-oze"])

    def test_bramka_rownowagi_rdzenia_przechodzi_na_punkcie_z_rozplywu(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        """Dowód złożenia: rdzeń PRZYJMUJE punkt pracy jako równowagę DAE.

        Bramka równowagi (`dynamika.inicjalizacja_niezbiezna`) jest niezbywalna —
        jeśli podział mocy albo macierz admitancyjna byłyby niespójne z rozpływem,
        ten bieg zakończyłby się odmową, a nie wynikiem.
        """
        wynik = SilnikDynamiki(wejscie=zloz(snapshot_g16, opcje(), punkt_g16)).uruchom()
        assert wynik.wlasnosci.zbiegl
        inicjalizacja = wynik.slad_white_box["inicjalizacja"]
        assert inicjalizacja["residuum_f"] < NASTAWY["eps_init"]
        assert inicjalizacja["residuum_g"] < NASTAWY["eps_init"]


# ---------------------------------------------------------------------------
# Bieg końca-do-końca na sieci rejestru wzorcowego
# ---------------------------------------------------------------------------


class TestBiegKoncaDoKonca:
    def test_wynik_ma_niepuste_kanaly_zdarzenia_i_metryki(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        wynik = SilnikDynamiki(wejscie=zloz(snapshot_g16, opcje(), punkt_g16)).uruchom()
        klucze = {kanal.klucz for kanal in wynik.kanaly}
        assert "u_pu@b-sn-b" in klucze and "kat_deg@b-sn-b" in klucze
        assert "omega_pu@gen-synchroniczny" in klucze
        assert "p_pu@gen-pv" in klucze and "q_pu@gen-pv" in klucze
        assert wynik.os_czasu_s and all(wynik.probki[klucz] for klucz in klucze)
        assert len(wynik.os_czasu_s) == len(wynik.probki["u_pu@b-sn-b"])
        rodzaje = [(zdarzenie.rodzaj, zdarzenie.ref) for zdarzenie in wynik.zdarzenia_wykonane]
        assert rodzaje == [
            ("zwarcie", "b-sn-b"),
            ("zdjecie_zwarcia", "b-sn-b"),
            ("skok_obciazenia", "odb-odplyw"),
        ]
        metryki = {metryka.klucz for metryka in wynik.metryki}
        assert {"u_min_pu", "t_u_min_s", "omega_max_pu@gen-synchroniczny"} <= metryki

    def test_zapad_napiecia_w_oknie_zwarcia_a_nie_poza_nim(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        """Wyrocznia kierunkowa: napięcie szyny zwarcia zapada W OKNIE zwarcia.

        Nie jest to wyrocznia ilościowa (ta żyje na układzie maszyna–szyna
        sztywna), ale sprawdza ZWIĄZEK między harmonogramem a przebiegiem: gdyby
        adapter zgubił zdarzenie albo podał złą chwilę, minimum napięcia nie
        trafiłoby w okno [t_zwarcia, t_usuniecia].
        """
        wynik = SilnikDynamiki(wejscie=zloz(snapshot_g16, opcje(), punkt_g16)).uruchom()
        szereg = wynik.probki["u_pu@b-sn-b"]
        chwila_minimum = wynik.os_czasu_s[szereg.index(min(szereg))]
        assert 0.1 <= chwila_minimum <= 0.2
        assert min(szereg) < 0.9 * szereg[0], "zwarcie musi obniżyć napięcie szyny"
        assert szereg[-1] > min(szereg), "po zdjęciu zwarcia napięcie musi się odbudować"

    def test_determinizm_ta_sama_piatka_odciskow_ten_sam_wynik(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        """Dwa niezależne biegi z tego samego wejścia — ładunek bit w bit ten sam."""
        from network_model.solvers.dynamika import ladunek_resultset_dynamic_v1

        pierwszy = SilnikDynamiki(wejscie=zloz(snapshot_g16, opcje(), punkt_g16)).uruchom()
        drugi = SilnikDynamiki(wejscie=zloz(snapshot_g16, opcje(), punkt_g16)).uruchom()
        assert pierwszy.tozsamosc == drugi.tozsamosc
        ladunek_a = ladunek_resultset_dynamic_v1(pierwszy, run_id="bieg")
        ladunek_b = ladunek_resultset_dynamic_v1(drugi, run_id="bieg")
        # `czas_obliczen_s` jest pomiarem zegara, nie wynikiem fizyki — poza porównaniem.
        for ladunek in (ladunek_a, ladunek_b):
            ladunek["wlasnosci_biegu"].pop("czas_obliczen_s")
        assert ladunek_a == ladunek_b

    def test_inny_harmonogram_inny_odcisk_harmonogramu(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        """Odcisk harmonogramu ODRÓŻNIA biegi — inaczej determinizm byłby pusty."""
        bazowy = SilnikDynamiki(wejscie=zloz(snapshot_g16, opcje(), punkt_g16)).uruchom()
        inny_scenariusz = copy.deepcopy(SCENARIUSZ)
        inny_scenariusz["zdarzenia"][0]["t_usuniecia_s"] = 0.25
        zmieniony = SilnikDynamiki(
            wejscie=zloz(snapshot_g16, opcje(dynamika=inny_scenariusz), punkt_g16)
        ).uruchom()
        assert bazowy.tozsamosc.odcisk_migawki == zmieniony.tozsamosc.odcisk_migawki
        assert bazowy.tozsamosc.odcisk_harmonogramu != zmieniony.tozsamosc.odcisk_harmonogramu
        assert bazowy.probki["u_pu@b-sn-b"] != zmieniony.probki["u_pu@b-sn-b"]


# ---------------------------------------------------------------------------
# Odmowy: punkt pracy
# ---------------------------------------------------------------------------


class TestOdmowyPunktuPracy:
    def test_bieg_innego_rodzaju(self, snapshot_g16: dict[str, Any]) -> None:
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            punkt_pracy_z_biegu_rozplywu(
                run_id="r1",
                analysis_type="short_circuit_sn",
                status="FINISHED",
                snapshot_hash=HASH_MIGAWKI,
                raw_result={},
                snapshot=snapshot_g16,
                oczekiwany_snapshot_hash=HASH_MIGAWKI,
            )
        assert blad.value.kod == KOD_PUNKT_PRACY_NIE_ROZPLYW

    def test_bieg_niezakonczony(
        self, snapshot_g16: dict[str, Any], rozplyw_g16: CanonicalRun
    ) -> None:
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            punkt_pracy_z_biegu_rozplywu(
                run_id="r1",
                analysis_type="PF",
                status="RUNNING",
                snapshot_hash=HASH_MIGAWKI,
                raw_result=rozplyw_g16.raw_result,
                snapshot=snapshot_g16,
                oczekiwany_snapshot_hash=HASH_MIGAWKI,
            )
        assert blad.value.kod == KOD_PUNKT_PRACY_NIE_ROZPLYW

    def test_inna_migawka(self, snapshot_g16: dict[str, Any], rozplyw_g16: CanonicalRun) -> None:
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            punkt_pracy_z_biegu_rozplywu(
                run_id="r1",
                analysis_type="PF",
                status="FINISHED",
                snapshot_hash="sha256:inna",
                raw_result=rozplyw_g16.raw_result,
                snapshot=snapshot_g16,
                oczekiwany_snapshot_hash=HASH_MIGAWKI,
            )
        assert blad.value.kod == KOD_PUNKT_PRACY_INNA_MIGAWKA

    def test_rozplyw_niezbiezny(
        self, snapshot_g16: dict[str, Any], rozplyw_g16: CanonicalRun
    ) -> None:
        raw = copy.deepcopy(rozplyw_g16.raw_result)
        raw["result_v1"]["converged"] = False
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            punkt_pracy_z_biegu_rozplywu(
                run_id="r1",
                analysis_type="PF",
                status="FINISHED",
                snapshot_hash=HASH_MIGAWKI,
                raw_result=raw,
                snapshot=snapshot_g16,
                oczekiwany_snapshot_hash=HASH_MIGAWKI,
            )
        assert blad.value.kod == KOD_PUNKT_PRACY_NIEPELNY

    def test_wezly_nierozwiazane(
        self, snapshot_g16: dict[str, Any], rozplyw_g16: CanonicalRun
    ) -> None:
        raw = copy.deepcopy(rozplyw_g16.raw_result)
        raw["result_v1"]["unsolved_node_ids"] = [ref_to_graph_id("b-oze")]
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            punkt_pracy_z_biegu_rozplywu(
                run_id="r1",
                analysis_type="PF",
                status="FINISHED",
                snapshot_hash=HASH_MIGAWKI,
                raw_result=raw,
                snapshot=snapshot_g16,
                oczekiwany_snapshot_hash=HASH_MIGAWKI,
            )
        assert blad.value.kod == KOD_PUNKT_PRACY_NIEPELNY

    def test_szyna_bez_napiecia_w_wyniku(
        self, snapshot_g16: dict[str, Any], rozplyw_g16: CanonicalRun
    ) -> None:
        raw = copy.deepcopy(rozplyw_g16.raw_result)
        raw["result_v1"]["bus_results"][0]["v_pu"] = None
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            punkt_pracy_z_biegu_rozplywu(
                run_id="r1",
                analysis_type="PF",
                status="FINISHED",
                snapshot_hash=HASH_MIGAWKI,
                raw_result=raw,
                snapshot=snapshot_g16,
                oczekiwany_snapshot_hash=HASH_MIGAWKI,
            )
        assert blad.value.kod == KOD_PUNKT_PRACY_NIEPELNY

    def test_szyna_migawki_nieobecna_w_wyniku(
        self, snapshot_g16: dict[str, Any], rozplyw_g16: CanonicalRun
    ) -> None:
        raw = copy.deepcopy(rozplyw_g16.raw_result)
        raw["result_v1"]["bus_results"] = raw["result_v1"]["bus_results"][:-1]
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            punkt_pracy_z_biegu_rozplywu(
                run_id="r1",
                analysis_type="PF",
                status="FINISHED",
                snapshot_hash=HASH_MIGAWKI,
                raw_result=raw,
                snapshot=snapshot_g16,
                oczekiwany_snapshot_hash=HASH_MIGAWKI,
            )
        assert blad.value.kod == KOD_PUNKT_PRACY_NIEPELNY


# ---------------------------------------------------------------------------
# Odmowy: nastawy i scenariusz (dane PER BIEG)
# ---------------------------------------------------------------------------


class TestOdmowyOpcjiBiegu:
    def test_brak_calych_nastaw(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        options = opcje()
        del options["nastawy_solvera"]
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            zloz(snapshot_g16, options, punkt_g16)
        assert blad.value.kod == KOD_NASTAWY_BRAK

    @pytest.mark.parametrize("pole", sorted(NASTAWY))
    def test_brak_kazdej_pojedynczej_nastawy(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu, pole: str
    ) -> None:
        """Iloczyn cech: KAŻDE pole nastaw osobno, nie jedno przykładowe."""
        options = opcje()
        del options["nastawy_solvera"][pole]
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            zloz(snapshot_g16, options, punkt_g16)
        assert blad.value.kod == KOD_NASTAWY_BRAK
        assert pole in blad.value.elementy

    def test_nastawa_spoza_kontraktu(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        """Nastawa, której solver nie zna, byłaby kontrolką bez dostawcy (fantom)."""
        options = opcje()
        options["nastawy_solvera"]["wspolczynnik_tlumienia"] = 0.5
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            zloz(snapshot_g16, options, punkt_g16)
        assert blad.value.kod == KOD_NASTAWY_BRAK
        assert "wspolczynnik_tlumienia" in blad.value.elementy

    def test_brak_scenariusza(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        options = opcje()
        del options["dynamika"]
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            zloz(snapshot_g16, options, punkt_g16)
        assert blad.value.kod == KOD_SCENARIUSZ_BRAK

    @pytest.mark.parametrize(
        "zdarzenie",
        [
            {
                "rodzaj": "komenda_regulacji",
                "t_s": 0.2,
                "ref_id": "gen-synchroniczny",
                "nastawa": {"p_mw": 4.0},
            },
            {
                "rodzaj": "synchronizacja",
                "t_s": 0.2,
                "ref_id": "gen-pv",
                "bus_ref": "b-oze",
            },
        ],
        ids=["komenda_regulacji", "synchronizacja"],
    )
    def test_rodzaj_zdarzenia_spoza_zbioru_rdzenia(
        self,
        snapshot_g16: dict[str, Any],
        punkt_g16: PunktPracyRozplywu,
        zdarzenie: dict[str, Any],
    ) -> None:
        """Rodzaj z kontraktu danych, którego rdzeń nie wykonuje — NAZWANA odmowa.

        Ciche pominięcie zamieniłoby scenariusz projektanta w inny scenariusz bez
        jednego śladu; to jest dokładnie ta klasa defektu, którą zakazuje karta.
        """
        scenariusz = copy.deepcopy(SCENARIUSZ)
        scenariusz["zdarzenia"] = [zdarzenie]
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            zloz(snapshot_g16, opcje(dynamika=scenariusz), punkt_g16)
        assert blad.value.kod == KOD_ZDARZENIE_NIEOBSLUGIWANE
        assert zdarzenie["rodzaj"] in blad.value.elementy

    def test_skok_obciazenia_na_wytworcy(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        scenariusz = copy.deepcopy(SCENARIUSZ)
        scenariusz["zdarzenia"] = [
            {
                "rodzaj": "skok_obciazenia",
                "t_s": 0.2,
                "ref_id": "gen-synchroniczny",
                "delta_p_mw": 1.0,
                "delta_q_mvar": 0.0,
            }
        ]
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            zloz(snapshot_g16, opcje(dynamika=scenariusz), punkt_g16)
        assert blad.value.kod == KOD_SKOK_POZA_ODBIOREM

    def test_zdarzenie_poza_horyzontem_odrzuca_kontrakt_scenariusza(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        """Scenariusz przekraczający horyzont nie powstaje — kontrakt go odrzuca.

        Walidację niesie `ScenariuszDynamiczny` (jedno źródło prawdy spójności
        harmonogramu); adapter jej NIE powtarza, więc test pilnuje, że odmowa
        faktycznie tam zachodzi, a nie że adapter ma własną, drugą regułę.
        """
        scenariusz = copy.deepcopy(SCENARIUSZ)
        scenariusz["zdarzenia"][1]["t_s"] = scenariusz["horyzont_s"] + 0.5
        with pytest.raises(ValueError, match="wykracza poza horyzont"):
            zloz(snapshot_g16, opcje(dynamika=scenariusz), punkt_g16)
        # Druga postać tego samego warunku: zdjęcie zwarcia poza horyzontem
        # (scenariusz spójny wewnętrznie, ale wykraczający poza okno biegu).
        zdjecie_poza = copy.deepcopy(SCENARIUSZ)
        zdjecie_poza["zdarzenia"][0]["t_usuniecia_s"] = zdjecie_poza["horyzont_s"] + 0.5
        with pytest.raises(ValueError, match="poza horyzont"):
            zloz(snapshot_g16, opcje(dynamika=zdjecie_poza), punkt_g16)

    def test_zwarcie_niesymetryczne_odmawia_rdzen(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        """Typ zwarcia jest PRZENOSZONY bez zmiany — rdzeń odmawia nazwanym kodem.

        Gdyby adapter zawęził typ do „3F", niesymetria wchodziłaby po cichu jako
        zwarcie trójfazowe, czyli jako inna fizyka niż zadeklarowana.
        """
        scenariusz = copy.deepcopy(SCENARIUSZ)
        scenariusz["zdarzenia"][0]["typ"] = "2F"
        wejscie = zloz(snapshot_g16, opcje(dynamika=scenariusz), punkt_g16)
        with pytest.raises(OdmowaDynamiki) as blad:
            SilnikDynamiki(wejscie=wejscie).uruchom()
        assert blad.value.kod == "dynamika.zwarcie_niesymetryczne_nieobslugiwane"

    def test_zdarzenie_na_nieistniejacym_elemencie_odmawia_rdzen(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        scenariusz = copy.deepcopy(SCENARIUSZ)
        scenariusz["zdarzenia"] = [
            {"rodzaj": "wylaczenie_galezi", "t_s": 0.1, "element_ref": "brak"}
        ]
        wejscie = zloz(snapshot_g16, opcje(dynamika=scenariusz), punkt_g16)
        with pytest.raises(OdmowaDynamiki) as blad:
            SilnikDynamiki(wejscie=wejscie).uruchom()
        assert blad.value.kod == "dynamika.zdarzenie_bez_elementu"


# ---------------------------------------------------------------------------
# Odmowy: warunki MODELOWE (ten sam predykat, co bramka gotowości)
# ---------------------------------------------------------------------------


class TestBrakiModelu:
    def test_siec_wzorcowa_nie_ma_brakow(self, snapshot_g16: dict[str, Any]) -> None:
        assert braki_modelu_dynamiki(EnergyNetworkModel.model_validate(snapshot_g16)) == ()

    def test_wytworca_bez_bloku_dynamiki_takze_bez_rodzaju(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        """Wytwórca BEZ `gen_type` też musi mieć blok dynamiki.

        Bramka sprzed tej karty pytała wyłącznie o DER i maszyny synchroniczne,
        więc wytwórca bez zadeklarowanego rodzaju przechodził jako gotowy, a bieg
        i tak by go odmówił — dwa różne zbiory dla jednego warunku.
        """
        snapshot = copy.deepcopy(snapshot_g16)
        snapshot["generators"].append(
            {
                **copy.deepcopy(snapshot["generators"][0]),
                "id": "6a1d0000-0000-4000-8000-0000000000ff",
                "ref_id": "gen-bez-rodzaju",
                "name": "Wytwórca bez rodzaju",
                "bus_ref": "b-odplyw",
                "gen_type": None,
                "dynamika": None,
            }
        )
        braki = braki_modelu_dynamiki(EnergyNetworkModel.model_validate(snapshot))
        assert [brak.kod for brak in braki] == [KOD_ZRODLO_BEZ_DYNAMIKI]
        assert braki[0].elementy == ("gen-bez-rodzaju",)
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            zloz(snapshot, opcje(), punkt_g16)
        assert blad.value.kod == KOD_ZRODLO_BEZ_DYNAMIKI

    def test_rodzina_bez_modelu_elektrycznego(self, snapshot_g16: dict[str, Any]) -> None:
        """Turbina typu 1/2 (maszyna indukcyjna wprost na sieci) — rodzina bez modelu."""
        snapshot = copy.deepcopy(snapshot_g16)
        snapshot["generators"][1]["dynamika"] = {
            "rodzina": "wiatr_typ_1",
            "proweniencja": {
                "zrodlo": "profil_typowy_normy",
                "odniesienie": "IEC 61400-27-1:2020",
                "data": None,
            },
            "h_calkowite_s": 5.0,
            "sztywnosc_walu_pu": 80.0,
            "tlumienie_walu_pu": 1.5,
            "poslizg_ustalony_pu": 0.02,
            "pitch_tempo_deg_s": 8.0,
            "pitch_min_deg": 0.0,
            "pitch_max_deg": 27.0,
        }
        braki = braki_modelu_dynamiki(EnergyNetworkModel.model_validate(snapshot))
        assert [brak.kod for brak in braki] == [KOD_RODZINA_BEZ_MODELU]
        assert "wiatr_typ_1" in braki[0].elementy[0]

    def test_odbior_zip(self, snapshot_g16: dict[str, Any]) -> None:
        snapshot = copy.deepcopy(snapshot_g16)
        snapshot["loads"][0]["model"] = "zip"
        braki = braki_modelu_dynamiki(EnergyNetworkModel.model_validate(snapshot))
        assert [brak.kod for brak in braki] == [KOD_ODBIOR_ZIP]
        assert braki[0].elementy == ("odb-odplyw",)

    def test_dwa_urzadzenia_na_jednej_szynie(self, snapshot_g16: dict[str, Any]) -> None:
        snapshot = copy.deepcopy(snapshot_g16)
        snapshot["generators"].append(
            {
                **copy.deepcopy(snapshot["generators"][1]),
                "id": "6a1d0000-0000-4000-8000-0000000000fe",
                "ref_id": "gen-pv-2",
                "name": "Druga instalacja PV",
            }
        )
        braki = braki_modelu_dynamiki(EnergyNetworkModel.model_validate(snapshot))
        assert [brak.kod for brak in braki] == [KOD_WIELE_URZADZEN_W_WEZLE]
        assert "b-oze" in braki[0].elementy[0]

    def test_element_na_nieistniejacej_szynie(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        """Wisząca referencja szyny — NAZWANA odmowa, nie wyjątek bez nazwy.

        `enm/mapping.py` pomija taki element przy budowie grafu, więc rozpływ
        policzy się bez niego; bieg czasowy liczyłby wtedy inną sieć niż zapisana.
        Walidator ENM tego stanu nie blokuje (brak reguły dla `Generator.bus_ref`),
        więc jest osiągalny z realnej migawki, a nie tylko teoretycznie.
        """
        snapshot = copy.deepcopy(snapshot_g16)
        snapshot["generators"][1]["bus_ref"] = "b-nie-ma"
        braki = braki_modelu_dynamiki(EnergyNetworkModel.model_validate(snapshot))
        assert [brak.kod for brak in braki] == [KOD_ELEMENT_BEZ_SZYNY]
        assert braki[0].elementy == ("gen-pv -> b-nie-ma",)
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            zloz(snapshot, opcje(), punkt_g16)
        assert blad.value.kod == KOD_ELEMENT_BEZ_SZYNY

    @pytest.mark.parametrize(
        ("kolekcja", "pole"),
        [
            ("branches", "from_bus_ref"),
            ("branches", "to_bus_ref"),
            ("transformers", "hv_bus_ref"),
            ("transformers", "lv_bus_ref"),
            ("shunt_capacitors", "bus_ref"),
            ("loads", "bus_ref"),
            ("sources", "bus_ref"),
        ],
    )
    def test_kazda_wiszaca_referencja_szyny_jest_odmowa(
        self,
        snapshot_g16: dict[str, Any],
        punkt_g16: PunktPracyRozplywu,
        kolekcja: str,
        pole: str,
    ) -> None:
        """KLASA, nie instancja: KAŻDY rodzaj powiązania z szyną, nie jeden przykład.

        `enm/mapping.py` pomija element z wiszącą referencją przy budowie grafu
        (`continue`), więc wcześniejsza wersja adaptera powtarzała ten cichy skip
        dla gałęzi i transformatorów — sieć biegu czasowego różniłaby się wtedy od
        sieci zapisanej bez jednego śladu.
        """
        snapshot = copy.deepcopy(snapshot_g16)
        snapshot[kolekcja][0][pole] = "b-nie-ma"
        enm = EnergyNetworkModel.model_validate(snapshot)
        braki = braki_modelu_dynamiki(enm)
        assert [brak.kod for brak in braki] == [KOD_ELEMENT_BEZ_SZYNY]
        # Bramka wykonawcy działa PRZED budową grafu IR — inaczej dla źródła
        # projektant dostałby komunikat mapowania ENM→graf zamiast kodu biegu.
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            odmow_gdy_braki_modelu(enm)
        assert blad.value.kod == KOD_ELEMENT_BEZ_SZYNY

    def test_parytet_bramki_gotowosci_i_biegu(self, snapshot_g16: dict[str, Any]) -> None:
        """Bramka gotowości i bieg czytają TEN SAM predykat — jeden, nie dwa.

        Test iteruje po KAŻDYM naruszeniu warunku modelowego i sprawdza, że dla
        każdego z nich obie strony (gotowość i adapter) podają TEN SAM kod.
        """
        from application.calculation_readiness.service import CalculationReadinessService

        uszkodzenia: list[tuple[str, dict[str, Any]]] = []

        bez_bloku = copy.deepcopy(snapshot_g16)
        bez_bloku["generators"][0]["dynamika"] = None
        uszkodzenia.append((KOD_ZRODLO_BEZ_DYNAMIKI, bez_bloku))

        zip_odbior = copy.deepcopy(snapshot_g16)
        zip_odbior["loads"][0]["model"] = "zip"
        uszkodzenia.append((KOD_ODBIOR_ZIP, zip_odbior))

        kolizja = copy.deepcopy(snapshot_g16)
        kolizja["generators"][1]["bus_ref"] = "b-sn-b"
        uszkodzenia.append((KOD_WIELE_URZADZEN_W_WEZLE, kolizja))

        wiszaca = copy.deepcopy(snapshot_g16)
        wiszaca["loads"][0]["bus_ref"] = "b-nie-ma"
        uszkodzenia.append((KOD_ELEMENT_BEZ_SZYNY, wiszaca))

        for kod, snapshot in uszkodzenia:
            enm = EnergyNetworkModel.model_validate(snapshot)
            raport = CalculationReadinessService().evaluate_single(
                enm, "dynamika_rms", punkt_pracy_rozplywu=True
            )
            assert raport.status == "blocked", kod
            assert kod in " ".join(raport.missing_fields_pl), kod
            assert braki_modelu_dynamiki(enm)[0].kod == kod


# ---------------------------------------------------------------------------
# B-8 RZECZYWISTE (W6-A par. 10): ENM -> rozplyw -> pf_run_id -> adapter -> RMS
# ---------------------------------------------------------------------------


def test_b8_parytet_chwili_zerowej_na_realnej_sciezce_produktu(
    snapshot_g16: dict[str, Any],
    rozplyw_g16: CanonicalRun,
    punkt_g16: PunktPracyRozplywu,
) -> None:
    """Chwila zerowa biegu czasowego MUSI opisywac ten sam punkt pracy, co rozplyw.

    DLACZEGO TO NIE JEST TO SAMO, CO WYROCZNIA ANALITYCZNA. Test analityczny w
    `test_obserwable.py` porownuje bieg z punktem pracy policzonym recznie z fazorow —
    sprawdza FIZYKE. Ten test przechodzi CALA SCIEZKE PRODUKTU: migawka ENM, realny
    solver rozplywu, `pf_run_id`, odczyt wyniku, adapter, zlozenie wejscia dynamiki,
    silnik. Rozjazd tutaj oznacza defekt w ktorymkolwiek ogniwie — bazie jednostek,
    orientacji galezi, konwencji transformatora, odczycie wyniku — a nie w fizyce.

    ROZLACZNE PRZESTRZENIE NAZW. Rozplyw adresuje elementy IDENTYFIKATOREM GRAFU,
    dynamika — REFERENCJA ENM. Jedynym mostem jest `ref_to_graph_id`; test przechodzi
    przez niego jawnie, zeby zlaczenie nie bylo domyslem czytelnika.

    POKRYCIE G16 (przypadki wymagane przy odbiorze): linia z przeplywem WSTECZNYM
    (`lin-oze`, generacja oddaje moc do sieci), kabel REZYSTANCYJNY z susceptancja
    poprzeczna (`kab-odplyw`, straty czynne i generacja bierna niezerowe), transformator
    z zaczepem POZA znamionowym (`tr-gpz`, `tap_position=2`, `tap_step_percent=1,5`) i z
    PRZESUNIECIEM FAZOWYM grupy `Dyn11`. Sprzeglo szyn (`spr-szyn`) nie ma wiersza w
    wyniku rozplywu, bo tor rozplywu zwija laczniki — i to jest jedyna galaz poza
    porownaniem, nazwana tu wprost, a nie przemilczana.
    """
    wejscie = zloz(
        snapshot_g16,
        opcje(dynamika={"horyzont_s": 0.02, "krok_wyjscia_s": 0.02, "zdarzenia": []}),
        punkt_g16,
    )
    wynik = SilnikDynamiki(wejscie=wejscie).uruchom()
    rezultat = rozplyw_g16.raw_result["result_v1"]

    wezly = {
        ref_to_graph_id(klucz[len("u_pu@") :]): klucz[len("u_pu@") :]
        for klucz in wynik.probki
        if klucz.startswith("u_pu@")
    }
    galezie = {
        ref_to_graph_id(klucz[len("p_od_pu@") :]): klucz[len("p_od_pu@") :]
        for klucz in wynik.probki
        if klucz.startswith("p_od_pu@")
    }

    # Tolerancja NIE jest dobrana do zaobserwowanej rozbieznosci: oba tory licza te sama
    # algebre w tej samej bazie, wiec jedyna dopuszczalna roznica to zaokraglenie
    # podwojnej precyzji spietrzone na kilkunastu dzialaniach — stad 1e-9 wzglednie,
    # cztery rzedy wielkosci nad zmierzonym maksimum (2,6e-12).
    tolerancja_wzgledna = 1.0e-9
    porownane = 0

    for wiersz in rezultat["bus_results"]:
        ref = wezly[wiersz["bus_id"]]
        for pole, kanal in (("v_pu", f"u_pu@{ref}"), ("angle_deg", f"kat_deg@{ref}")):
            oczekiwane = float(wiersz[pole])
            zmierzone = float(wynik.probki[kanal][0])
            assert zmierzone == pytest.approx(
                oczekiwane, rel=tolerancja_wzgledna, abs=1.0e-9
            ), f"szyna {ref}, {pole}"
            porownane += 1

    s_bazowa = wejscie.s_bazowa_mva
    for wiersz in rezultat["branch_results"]:
        ref = galezie[wiersz["branch_id"]]
        for pole, kanal in (
            ("p_from_mw", f"p_od_pu@{ref}"),
            ("q_from_mvar", f"q_od_pu@{ref}"),
            ("p_to_mw", f"p_do_pu@{ref}"),
            ("q_to_mvar", f"q_do_pu@{ref}"),
        ):
            oczekiwane = float(wiersz[pole])
            zmierzone = float(wynik.probki[kanal][0]) * s_bazowa
            assert zmierzone == pytest.approx(
                oczekiwane, rel=tolerancja_wzgledna, abs=1.0e-9
            ), f"galaz {ref}, {pole}"
            porownane += 1

    assert porownane == 22, f"porownano {porownane} wielkosci zamiast 22 — zmienil sie zakres G16"
    # Przeplyw wsteczny, straty czynne i generacja bierna MUSZA byc niezerowe, inaczej
    # test przechodzilby takze dla sieci, w ktorej te przypadki nie wystepuja.
    wiersze = {ref_to_graph_id(galezie[w["branch_id"]]): w for w in rezultat["branch_results"]}
    oze = wiersze[ref_to_graph_id("lin-oze")]
    kabel = wiersze[ref_to_graph_id("kab-odplyw")]
    assert oze["p_from_mw"] < 0.0 < oze["p_to_mw"], "brak przeplywu wstecznego w zakresie B-8"
    assert kabel["p_from_mw"] + kabel["p_to_mw"] > 1.0e-4, "brak strat czynnych w zakresie B-8"
    assert kabel["q_from_mvar"] + kabel["q_to_mvar"] < -1.0e-4, "brak susceptancji w zakresie B-8"
