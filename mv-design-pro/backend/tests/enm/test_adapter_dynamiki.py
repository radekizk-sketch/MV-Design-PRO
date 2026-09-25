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

import cmath
import copy
import dataclasses
import math
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest
from enm.adapter_dynamiki import (
    KOD_ELEMENT_BEZ_SZYNY,
    KOD_NASTAWY_BRAK,
    KOD_ODBIOR_ZIP,
    KOD_PODZIAL_MOCY_NIESPOJNY,
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
    zalozenia_wejscia,
    zloz_wejscie_dynamiki,
    zloz_widok_sieci,
)
from enm.assembler import czestotliwosc_studium_hz, zbuduj_graf, zloz_wejscie_rozplywu
from enm.canonical_analysis import CanonicalRun, _execute_power_flow
from enm.mapping import ref_to_graph_id
from enm.models import EnergyNetworkModel
from network_model.solvers.dynamika import (
    HarmonogramDynamiki,
    OdmowaDynamiki,
    SilnikDynamiki,
    ZmianaGalezi,
    ZmianaOdsprzegu,
    zloz_model_sieci,
)
from network_model.solvers.power_flow_newton_internal import build_slack_island, build_ybus_pu

from tests.golden.enm_builders.dynamika_rms import build_dynamika_rms_enm
from tests.golden.enm_builders.so1a_pv_magazyn import MAGAZYN_GFM_1000_KW

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
    # Klucz WYMAGANY; `null` dozwolony wyłącznie dla biegu bez detektorów (karta AB-1b.1).
    "tolerancja_lokalizacji_zdarzen_s": None,
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
            "sposob_usuniecia": "samoczynne",
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


def _po_zdarzeniu(wynik: Any, i: int, t_zdarzenia: float) -> bool:
    """Czy próbka `i` opisuje stan PO zdarzeniu w chwili `t_zdarzenia` (strona `P` albo później).

    Chwila zdarzenia ma parę próbek `L`/`P` (karta AB-1b.1 §0 pkt 6), więc o przynależności do
    okna decyduje strona próbki, nie sama chwila.
    """
    t = wynik.os_czasu_s[i]
    return t > t_zdarzenia or (t == t_zdarzenia and wynik.strona_probki[i] == "P")


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

    def test_lacznik_otwarty_i_galaz_poza_ruchem_sa_w_rdzeniu_jako_NIEAKTYWNE(
        self, snapshot_g16: dict[str, Any]
    ) -> None:
        """Przepisany wg karty AB-1b.1 (par. 0 pkt 1) — INTENCJA ZACHOWANA.

        Dawniej: „łącznik otwarty i gałąź poza ruchem nie wchodzą do macierzy" przypięte
        ich NIEOBECNOŚCIĄ w widoku. Nieobecność czyniła je nieosiągalnymi dla zdarzenia
        załączenia (W6-A Z-03). Intencja — element otwarty NIE PRZEWODZI w t = 0 — jest
        teraz przypięta flagą `aktywna_na_starcie=False` (macierz t = 0 bez zmian pilnuje
        `test_ybus_dynamiki_rowna_ybus_rozplywu`), a element jest w widoku.
        """
        widok = zloz_widok_sieci(snapshot_g16, zbuduj_graf(snapshot_g16), base_mva=100.0)
        po_identach = {galaz.ident: galaz for galaz in widok.galezie}
        assert po_identach["spr-szyn"].aktywna_na_starcie is True
        assert po_identach["spr-szyn"].rodzaj == "lacznik"
        assert po_identach["odl-rezerwa"].aktywna_na_starcie is False
        assert po_identach["odl-rezerwa"].rodzaj == "lacznik"
        assert po_identach["kab-odplyw"].aktywna_na_starcie is True
        assert po_identach["kab-odplyw"].rodzaj == "kabel"
        assert po_identach["kab-rezerwa"].aktywna_na_starcie is False
        assert po_identach["lin-oze"].rodzaj == "linia"
        assert po_identach["tr-gpz"].rodzaj == "transformator"

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
        """Przepisany wg karty AB-1b.1 — bateria wyłączona jest odsprzęgiem NIEAKTYWNYM.

        Intencja (bateria wyłączona nie wchodzi do macierzy t = 0) przypięta flagą, a nie
        nieobecnością: nieobecna bateria nie mogła zostać załączona zdarzeniem.
        """
        widok = zloz_widok_sieci(snapshot_g16, zbuduj_graf(snapshot_g16), base_mva=100.0)
        bateria, wylaczona = widok.odsprzegi
        assert bateria.ident == "bat-kompensacja"
        assert bateria.wezel == "b-sn-a"
        assert bateria.g_pu == 0.0
        assert bateria.b_pu == pytest.approx(2.0 / 100.0)
        assert bateria.aktywna_na_starcie is True
        assert wylaczona.ident == "bat-wylaczona"
        assert wylaczona.aktywna_na_starcie is False
        assert wylaczona.b_pu == pytest.approx(1.5 / 100.0)

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
# Aktywność elementów (karta AB-1b.1, P2, twierdzenie D-19)
# ---------------------------------------------------------------------------


def _jako_bezpiecznik(snapshot: dict[str, Any], ref_id: str) -> dict[str, Any]:
    """Ta sama sieć, w której wskazany łącznik jest BEZPIECZNIKIEM (inny typ ENM)."""
    wynik = copy.deepcopy(snapshot)
    for galaz in wynik["branches"]:
        if galaz["ref_id"] == ref_id:
            galaz["type"] = "fuse"
            galaz["rated_current_a"] = 200.0
            galaz["rated_voltage_kv"] = 15.0
    return EnergyNetworkModel.model_validate(wynik).model_dump(mode="json")


def _ze_statusem(snapshot: dict[str, Any], ref_id: str, status: str) -> dict[str, Any]:
    wynik = copy.deepcopy(snapshot)
    for kolekcja in ("branches", "shunt_capacitors"):
        for element in wynik[kolekcja]:
            if element["ref_id"] == ref_id:
                element["status"] = status
    return wynik


class TestAktywnoscElementow:
    """D-19: element nieaktywny w t = 0 i zamknięty zdarzeniem daje macierz ROZPŁYWU
    migawki z tym elementem zamkniętym — wyrocznia niezależna: `build_ybus_pu` (FROZEN).

    Iloczyn cech na sieci G16: łącznik otwarty (odłącznik), bezpiecznik otwarty (ta
    sama gałąź jako `fuse`), kabel poza ruchem, bateria wyłączona. Złożenie po
    zdarzeniu idzie DROGĄ SILNIKA: `zbuduj_harmonogram` → `zastosuj` na stanie
    początkowym → `zloz_model_sieci` ze zbiorami aktywności stanu.
    """

    @staticmethod
    def _macierz_po_zdarzeniu(snapshot: dict[str, Any], zdarzenie: Any) -> Any:
        from network_model.solvers.dynamika.zdarzenia import (
            stan_poczatkowy_scenariusza,
            zastosuj,
            zbuduj_harmonogram,
        )

        widok = zloz_widok_sieci(snapshot, zbuduj_graf(snapshot), base_mva=100.0)
        (wpis,) = zbuduj_harmonogram(
            HarmonogramDynamiki((zdarzenie,)),
            wezly=widok.wezly,
            galezie=widok.galezie,
            odsprzegi=widok.odsprzegi,
            odbiory=widok.odbiory,
            urzadzenia=(),
            s_bazowa_mva=100.0,
            horyzont_s=1.0,
        )
        stan = zastosuj(
            wpis, stan_poczatkowy_scenariusza(widok.galezie, widok.odsprzegi, widok.odbiory)
        )
        return zloz_model_sieci(
            widok.wezly,
            widok.galezie,
            widok.odsprzegi,
            galezie_aktywne=stan.galezie_aktywne,
            odsprzegi_aktywne=stan.odsprzegi_aktywne,
        )

    @pytest.mark.parametrize(
        ("ref_id", "bezpiecznik"),
        [
            ("odl-rezerwa", False),
            ("odl-rezerwa", True),
            ("kab-rezerwa", False),
            ("bat-wylaczona", False),
        ],
        ids=["lacznik", "bezpiecznik", "kabel_poza_ruchem", "bateria"],
    )
    def test_ybus_po_zalaczeniu_rowna_ybus_rozplywu_z_elementem_zamknietym(
        self, snapshot_g16: dict[str, Any], ref_id: str, bezpiecznik: bool
    ) -> None:
        snapshot = _jako_bezpiecznik(snapshot_g16, ref_id) if bezpiecznik else snapshot_g16
        zdarzenie = (
            ZmianaOdsprzegu(0.1, ref_id, True)
            if ref_id.startswith("bat")
            else ZmianaGalezi(0.1, ref_id, True)
        )
        model = self._macierz_po_zdarzeniu(snapshot, zdarzenie)
        ybus_pf, indeks_pf, _ = TestParytetYbus()._macierze(
            _ze_statusem(snapshot, ref_id, "closed")
        )
        ybus_dyn = model.ybus.toarray()
        najwieksza = max(
            abs(
                ybus_dyn[i, j]
                - ybus_pf[indeks_pf[ref_to_graph_id(wi)], indeks_pf[ref_to_graph_id(wj)]]
            )
            for i, wi in enumerate(model.identy_wezlow)
            for j, wj in enumerate(model.identy_wezlow)
        )
        # Ten sam próg i to samo uzasadnienie, co `test_ybus_dynamiki_rowna_ybus_rozplywu`.
        assert najwieksza < 1.0e-9, f"rozjazd Y-bus po załączeniu {ref_id}: {najwieksza}"

    def test_ybus_t0_z_elementami_nieaktywnymi_jest_bitowo_ta_sama(
        self, snapshot_g16: dict[str, Any]
    ) -> None:
        """Elementy nieaktywne w widoku nie zmieniają macierzy t = 0 ani o bit."""
        widok = zloz_widok_sieci(snapshot_g16, zbuduj_graf(snapshot_g16), base_mva=100.0)
        z_nieaktywnymi = zloz_model_sieci(widok.wezly, widok.galezie, widok.odsprzegi)
        bez_nieaktywnych = zloz_model_sieci(
            widok.wezly,
            tuple(g for g in widok.galezie if g.aktywna_na_starcie),
            tuple(o for o in widok.odsprzegi if o.aktywna_na_starcie),
        )
        assert (z_nieaktywnymi.ybus != bez_nieaktywnych.ybus).nnz == 0

    @pytest.mark.parametrize(
        "zdarzenia",
        [
            [{"rodzaj": "zalaczenie_galezi", "t_s": 0.1, "element_ref": "odl-rezerwa"}],
            [
                {"rodzaj": "zalaczenie_galezi", "t_s": 0.1, "element_ref": "odl-rezerwa"},
                {"rodzaj": "wylaczenie_galezi", "t_s": 0.2, "element_ref": "kab-odplyw"},
            ],
            [
                {"rodzaj": "wylaczenie_galezi", "t_s": 0.1, "element_ref": "spr-szyn"},
                {"rodzaj": "zalaczenie_galezi", "t_s": 0.2, "element_ref": "spr-szyn"},
            ],
            [
                {"rodzaj": "wylaczenie_galezi", "t_s": 0.1, "element_ref": "bat-kompensacja"},
                {"rodzaj": "zalaczenie_galezi", "t_s": 0.2, "element_ref": "bat-wylaczona"},
            ],
            [
                {"rodzaj": "odlaczenie_odbioru", "t_s": 0.1, "ref_id": "odb-odplyw"},
                {"rodzaj": "zalaczenie_odbioru", "t_s": 0.2, "ref_id": "odb-odplyw"},
            ],
        ],
        ids=[
            "zamkniecie_lacznika_rezerwowego",
            "zamknij_przed_otwarciem",
            "sprzeglo_otwarte_i_zamkniete",
            "baterie_zdarzeniem_galezi",
            "odbior_odlaczony_i_zalaczony",
        ],
    )
    def test_laczenia_na_sciezce_uzytkownika(
        self,
        snapshot_g16: dict[str, Any],
        punkt_g16: PunktPracyRozplywu,
        zdarzenia: list[dict[str, Any]],
    ) -> None:
        """Rozpływ → adapter → rdzeń: każde łączenie wykonane, zero odmów.

        Pierwszy przypadek jest detektorem mutacji M27 (adapter znów porzuca gałąź
        nieaktywną): porzucony łącznik rezerwowy kończył bieg
        `dynamika.zdarzenie_bez_elementu`.
        """
        scenariusz = {"horyzont_s": 0.3, "krok_wyjscia_s": 0.02, "zdarzenia": zdarzenia}
        wynik = SilnikDynamiki(
            wejscie=zloz(snapshot_g16, opcje(dynamika=scenariusz), punkt_g16)
        ).uruchom()
        oczekiwane = {
            ("wylaczenie_galezi", "bat-kompensacja"): "wylaczenie_odsprzegu",
            ("zalaczenie_galezi", "bat-wylaczona"): "zalaczenie_odsprzegu",
        }
        assert [(z.rodzaj, z.ref) for z in wynik.zdarzenia_wykonane] == [
            (
                oczekiwane.get((z["rodzaj"], z.get("element_ref")), z["rodzaj"]),
                z.get("element_ref", z.get("ref_id")),
            )
            for z in zdarzenia
        ]
        assert wynik.wlasnosci.max_residuum_g < 1e-8

    def test_zdarzenie_laczeniowe_galezi_na_generatorze_odrzuca_walidacja_danych(
        self, snapshot_g16: dict[str, Any]
    ) -> None:
        """Predykat `_refy_zdarzenia` niesie DOZWOLONE kolekcje, nie tylko istnienie refu."""
        from enm.scenariusze import (
            OperatingScenario,
            RodzajScenariusza,
            ScenariuszDynamiczny,
            ScenariuszNieprzystajeError,
            WylaczenieGalezi,
            apply_scenario,
        )

        scenariusz = OperatingScenario(
            scenario_id="aktywnosc",
            name="Łączenie w złej roli",
            kind=RodzajScenariusza.CUSTOM,
            dynamika=ScenariuszDynamiczny(
                horyzont_s=0.3,
                krok_wyjscia_s=0.02,
                zdarzenia=(WylaczenieGalezi(t_s=0.1, element_ref="gen-pv"),),
            ),
        )
        with pytest.raises(ScenariuszNieprzystajeError, match="generators"):
            apply_scenario(EnergyNetworkModel.model_validate(snapshot_g16), scenariusz)


class TestObszarBeznapieciowy:
    """D-16 na ścieżce użytkownika: SZR z przerwą beznapięciową i węzeł martwy od t = 0.

    Karta AB-1b.1 §0 pkt 2. Przed kartą oba scenariusze kończyły się odmową: SZR —
    `dynamika.reinicjalizacja_niezbiezna` z przyczyną `dynamika.wyspa_bez_zrodla`
    (odcinek z odbiorem, bez źródła, w chwili przerwy), węzeł martwy od t = 0 —
    odmową adaptera `dynamika.punkt_pracy_niepelny` (węzły nierozwiązane rozpływu).
    """

    SCENARIUSZ_SZR: dict[str, Any] = {
        "horyzont_s": 0.6,
        "krok_wyjscia_s": 0.02,
        "zdarzenia": [
            {"rodzaj": "wylaczenie_galezi", "t_s": 0.1, "element_ref": "kab-odplyw"},
            {"rodzaj": "odlaczenie_zrodla", "t_s": 0.1, "ref_id": "gen-pv"},
            {"rodzaj": "zalaczenie_galezi", "t_s": 0.4, "element_ref": "odl-rezerwa"},
        ],
    }

    def test_szr_z_przerwa_beznapieciowa(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        wynik = SilnikDynamiki(
            wejscie=zloz(snapshot_g16, opcje(dynamika=self.SCENARIUSZ_SZR), punkt_g16)
        ).uruchom()
        odciecie = [z for z in wynik.zdarzenia_wykonane if z.t_wykonany_s == 0.1]
        zasilenie = [z for z in wynik.zdarzenia_wykonane if z.t_wykonany_s == 0.4]
        assert {z.obszary_odciete for z in odciecie} == {("b-odplyw", "b-oze")}
        assert {z.odbiory_odciete for z in odciecie} == {(("odb-odplyw", complex(0.03, 0.008)),)}
        assert {z.obszary_zasilone_ponownie for z in zasilenie} == {("b-odplyw", "b-oze")}
        for i in range(len(wynik.os_czasu_s)):
            # Okno po STRONIE próbki (karta AB-1b.1 §0 pkt 6): `P` chwili odcięcia i `L`
            # chwili ponownego zasilenia należą do przerwy beznapięciowej.
            if _po_zdarzeniu(wynik, i, 0.1) and not _po_zdarzeniu(wynik, i, 0.4):
                assert wynik.probki["u_pu@b-odplyw"][i] == 0.0
                assert wynik.probki["u_pu@b-oze"][i] == 0.0
                # Brak zatrucia: węzeł żywy zachowuje częstotliwość, gdy obszar ma V = 0.
                assert wynik.probki["jakosc_f@b-sn-a"][i] != 2.0
            elif _po_zdarzeniu(wynik, i, 0.4):
                assert wynik.probki["u_pu@b-odplyw"][i] > 0.8
        from network_model.solvers.dynamika.silnik import (
            ZALOZENIE_OBSZARU_BEZNAPIECIOWEGO,
            ZALOZENIE_STARTU_PONOWNEGO_ZASILENIA,
        )

        assert ZALOZENIE_OBSZARU_BEZNAPIECIOWEGO in wynik.zalozenia
        assert ZALOZENIE_STARTU_PONOWNEGO_ZASILENIA in wynik.zalozenia
        assert wynik.wlasnosci.max_residuum_g < 1e-8

    def test_wezel_martwy_od_t0_zasilany_zamknieciem_lacznika(self) -> None:
        """Odcinek {b-odplyw, b-oze} bez źródła i bez połączenia: rozpływ go nie rozwiązuje,
        rdzeń klasyfikuje go jako beznapięciowy od t = 0, zamknięcie `odl-rezerwa` zasila."""
        snapshot = migawka()
        snapshot["generators"] = [g for g in snapshot["generators"] if g["ref_id"] != "gen-pv"]
        for galaz in snapshot["branches"]:
            if galaz["ref_id"] == "kab-odplyw":
                galaz["status"] = "open"
        bieg = _bieg_rozplywu(snapshot)
        nierozwiazane = set(bieg.raw_result["result_v1"]["unsolved_node_ids"])
        assert nierozwiazane == {ref_to_graph_id("b-odplyw"), ref_to_graph_id("b-oze")}
        scenariusz = {
            "horyzont_s": 0.3,
            "krok_wyjscia_s": 0.02,
            "zdarzenia": [
                {"rodzaj": "zalaczenie_galezi", "t_s": 0.1, "element_ref": "odl-rezerwa"}
            ],
        }
        wynik = SilnikDynamiki(
            wejscie=zloz(snapshot, opcje(dynamika=scenariusz), punkt_pracy(snapshot, bieg))
        ).uruchom()
        assert wynik.slad_white_box["inicjalizacja"]["wezly_beznapieciowe"] == [
            "b-odplyw",
            "b-oze",
        ]
        (zdarzenie,) = wynik.zdarzenia_wykonane
        assert zdarzenie.obszary_zasilone_ponownie == ("b-odplyw", "b-oze")
        # Probka `P` chwili zamkniecia (stan po zdarzeniu); `L` tuz przed nia to jeszcze
        # obszar beznapieciowy, wiec wchodzi do zakresu zer.
        i = next(
            k
            for k, (t, strona) in enumerate(zip(wynik.os_czasu_s, wynik.strona_probki, strict=True))
            if t == 0.1 and strona == "P"
        )
        assert all(u == 0.0 for u in wynik.probki["u_pu@b-odplyw"][:i])
        assert wynik.probki["u_pu@b-odplyw"][-1] > 0.8


class TestZwarcieWLinii:
    """Zwarcie w linii/kablu `x*L` na ścieżce użytkownika (karta AB-1b.1 §0 pkt 5).

    Kontrakt danych: `element_ref` + `polozenie_wzgledne` zamiast `bus_ref`; adapter
    mapuje je na `ZwarcieGalezi`; rdzeń odmawia transformatorowi i łącznikowi (brak
    długości elektrycznej), a walidacja danych odmawia elementowi spoza kolekcji gałęzi.
    """

    @staticmethod
    def _scenariusz(element_ref: str) -> dict[str, Any]:
        return {
            "horyzont_s": 0.3,
            "krok_wyjscia_s": 0.02,
            "zdarzenia": [
                {
                    "rodzaj": "zwarcie",
                    "t_s": 0.1,
                    "element_ref": element_ref,
                    "polozenie_wzgledne": 0.5,
                    "typ": "3F",
                    "r_f_ohm": 0.0,
                    "x_f_ohm": 1.0,
                    "t_usuniecia_s": 0.2,
                    "sposob_usuniecia": "samoczynne",
                }
            ],
        }

    def test_zwarcie_w_kablu_na_sciezce_uzytkownika(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        wynik = SilnikDynamiki(
            wejscie=zloz(snapshot_g16, opcje(dynamika=self._scenariusz("kab-odplyw")), punkt_g16)
        ).uruchom()
        assert [(z.rodzaj, z.ref) for z in wynik.zdarzenia_wykonane] == [
            ("zwarcie_galezi", "kab-odplyw"),
            ("zdjecie_zwarcia_galezi", "kab-odplyw"),
        ]
        prad = wynik.probki["i_zwarcia_pu@kab-odplyw:x=0.5"]
        for i in range(len(wynik.os_czasu_s)):
            if _po_zdarzeniu(wynik, i, 0.1) and not _po_zdarzeniu(wynik, i, 0.2):
                assert prad[i] > 0.0
            else:
                assert prad[i] == 0.0
        assert any("kab-odplyw" in zdanie for zdanie in wynik.zalozenia)

    @pytest.mark.parametrize("element_ref", ["tr-gpz", "spr-szyn"])
    def test_zwarcie_w_transformatorze_albo_laczniku_odmawia_rdzen(
        self,
        snapshot_g16: dict[str, Any],
        punkt_g16: PunktPracyRozplywu,
        element_ref: str,
    ) -> None:
        with pytest.raises(OdmowaDynamiki) as blad:
            SilnikDynamiki(
                wejscie=zloz(snapshot_g16, opcje(dynamika=self._scenariusz(element_ref)), punkt_g16)
            ).uruchom()
        assert blad.value.kod == "dynamika.zwarcie_galezi_nieobslugiwane"
        assert blad.value.szczegoly["galaz"] == element_ref

    @pytest.mark.parametrize("element_ref", ["tr-gpz", "gen-pv", "odb-odplyw"])
    def test_zwarcie_w_elemencie_spoza_galezi_odrzuca_walidacja_danych(
        self, snapshot_g16: dict[str, Any], element_ref: str
    ) -> None:
        """Walidacja danych dopuszcza wyłącznie kolekcję `branches` (linie, kable, łączniki)."""
        from enm.scenariusze import (
            OperatingScenario,
            RodzajScenariusza,
            ScenariuszDynamiczny,
            ScenariuszNieprzystajeError,
            Zwarcie,
            apply_scenario,
        )

        scenariusz = OperatingScenario(
            scenario_id="zwarcie-w-linii",
            name="Zwarcie w złym elemencie",
            kind=RodzajScenariusza.CUSTOM,
            dynamika=ScenariuszDynamiczny(
                horyzont_s=0.3,
                krok_wyjscia_s=0.02,
                zdarzenia=(
                    Zwarcie(
                        t_s=0.1,
                        element_ref=element_ref,
                        polozenie_wzgledne=0.5,
                        typ="3F",
                        r_f_ohm=0.0,
                        x_f_ohm=1.0,
                    ),
                ),
            ),
        )
        with pytest.raises(ScenariuszNieprzystajeError):
            apply_scenario(EnergyNetworkModel.model_validate(snapshot_g16), scenariusz)


# ---------------------------------------------------------------------------
# Podział mocy węzła — jeden predykat dla szyny z odbiorem i bez
# ---------------------------------------------------------------------------


class TestPodzialMocyWezla:
    """Kilku wytworcow na jednej szynie: dana wejsciowa albo nazwana odmowa.

    INWENTARZ KLASY. Wspolny mechanizm dotyczy KAZDEJ szyny z wiecej niz jednym
    urzadzeniem dynamicznym; klasa dzieli sie na cztery przypadki i wszystkie
    cztery sa tu sprawdzone:

    1. jeden wytworca na szynie — cala moc wezla idzie do niego (zachowanie
       sprzed tej karty, przypiete osobno, zeby naprawa go nie ruszyla);
    2. kilku wytworcow, suma mocy z modelu UZGADNIA SIE z wypadkowa szyny —
       kazdy dostaje SWOJA moc;
    3. kilku wytworcow, suma NIE uzgadnia sie — nazwana odmowa;
    4. zrodlo sieciowe razem z wytworca — odmowa MODELOWA (szyna sztywna nie ma
       zadeklarowanej mocy), sprawdzona w `TestBrakiModelu` wyzej.

    Iloczyn cech, na ktorym podzial mogl by sie schowac: RODZINA urzadzenia
    (nadazna vs magazyn — rozne stany poczatkowe z tej samej mocy) x ZNAK mocy
    biernej x UDZIAL w mocy szyny. Przypadek 2 cwiczy wszystkie trzy naraz.
    """

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

    @staticmethod
    def _z_dwoma_wytworcami(
        snapshot_g16: dict[str, Any], *, p_drugiego_mw: float, q_drugiego_mvar: float
    ) -> dict[str, Any]:
        """Szyna `b-oze` dostaje DRUGIEGO wytworcę; moc pierwszego zmniejsza się
        o moc drugiego, więc wypadkowa szyny — a z nią cały rozpływ — zostaje
        bez zmian. Bez tego test mierzyłby dwie rzeczy naraz."""
        snapshot = copy.deepcopy(snapshot_g16)
        pierwszy = snapshot["generators"][1]
        assert pierwszy["ref_id"] == "gen-pv" and pierwszy["bus_ref"] == "b-oze"
        drugi = copy.deepcopy(pierwszy)
        drugi.update(
            {
                "id": "6a1d0000-0000-4000-8000-0000000000fd",
                "ref_id": "gen-magazyn",
                "name": "Magazyn energii przy instalacji PV",
                "gen_type": "bess",
                "p_mw": p_drugiego_mw,
                "q_mvar": q_drugiego_mvar,
                "dynamika": copy.deepcopy(MAGAZYN_GFM_1000_KW),
            }
        )
        pierwszy["p_mw"] = round(pierwszy["p_mw"] - p_drugiego_mw, 12)
        pierwszy["q_mvar"] = round((pierwszy.get("q_mvar") or 0.0) - q_drugiego_mvar, 12)
        snapshot["generators"].append(drugi)
        return snapshot

    def test_dwaj_wytworcy_dostaja_swoje_moce_a_nie_wypadkowa_szyny(
        self, snapshot_g16: dict[str, Any]
    ) -> None:
        """Przypadek 2 — i zarazem test FALSYFIKUJACY: gdyby adapter dawal obu
        urzadzeniom wypadkowa szyny, obie asercje padlyby rownoczesnie."""
        snapshot = self._z_dwoma_wytworcami(snapshot_g16, p_drugiego_mw=0.4, q_drugiego_mvar=-0.05)
        rozplyw = _bieg_rozplywu(snapshot)
        punkt = punkt_pracy(snapshot, rozplyw)
        wejscie = zloz(snapshot, opcje(), punkt)
        moce = wejscie.punkt_pracy.moce_zrodel_pu
        baza = punkt.base_mva
        assert moce["gen-magazyn"] == pytest.approx(complex(0.4 / baza, -0.05 / baza), rel=1e-12)
        assert moce["gen-pv"] == pytest.approx(complex(1.2 / baza, 0.05 / baza), rel=1e-12)
        # Suma odtwarza wypadkowa szyny DOKLADNIE — punkt pracy pozostaje rownowaga
        # ukladu DAE, wiec rdzen nie odmawia inicjalizacji.
        odbior_oze = sum(complex(o.p_pu, o.q_pu) for o in wejscie.odbiory if o.wezel == "b-oze")
        assert moce["gen-magazyn"] + moce["gen-pv"] == pytest.approx(
            punkt.wstrzyki_pu["b-oze"] + odbior_oze, rel=1e-12, abs=1e-15
        )
        # Bieg rusza — czyli podzial jest rownowaga, a nie tylko ladna liczba.
        assert SilnikDynamiki(wejscie=wejscie).uruchom().wlasnosci.zbiegl is True

    def test_podzial_niespojny_z_rozplywem_konczy_sie_nazwana_odmowa(
        self, snapshot_g16: dict[str, Any]
    ) -> None:
        """Przypadek 3: model deklaruje inna sume niz wypadkowa szyny z rozplywu.

        Tu podzial przesuniecia NIE jest wyprowadzalny z zadnej danej — i wtedy
        adapter odmawia, zamiast rozdzielac reszte po uwazaniu.
        """
        snapshot = self._z_dwoma_wytworcami(snapshot_g16, p_drugiego_mw=0.4, q_drugiego_mvar=0.0)
        rozplyw = _bieg_rozplywu(snapshot)
        punkt = punkt_pracy(snapshot, rozplyw)
        # Rozplyw JUZ policzony — dopiero teraz psujemy deklaracje modelu, wiec
        # wypadkowa szyny zostaje ta sama, a suma z modelu przestaje ja odtwarzac.
        snapshot["generators"][-1]["p_mw"] = 0.9
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            zloz(snapshot, opcje(), punkt)
        assert blad.value.kod == KOD_PODZIAL_MOCY_NIESPOJNY
        assert blad.value.elementy == ("gen-magazyn", "gen-pv")

    def test_prog_niespojnosci_pochodzi_z_eps_init_a_nie_z_wlasnej_stalej(
        self, snapshot_g16: dict[str, Any]
    ) -> None:
        """Deklaracja „tolerancja to eps_init" ma PRZYPIETY test.

        Ta sama niespojnosc przechodzi przy luznym `eps_init` i odmawia przy
        ostrym — wiec prog naprawde pochodzi z nastawy biegu, a nie z zaszytej
        liczby, ktora „dzis sie zgadza".
        """
        snapshot = self._z_dwoma_wytworcami(snapshot_g16, p_drugiego_mw=0.4, q_drugiego_mvar=0.0)
        rozplyw = _bieg_rozplywu(snapshot)
        punkt = punkt_pracy(snapshot, rozplyw)
        snapshot["generators"][-1]["p_mw"] = 0.4 + 1.0e-6  # 1e-8 pu mocy => ~1e-8 pu pradu

        luzne = opcje(nastawy_solvera={**NASTAWY, "eps_init": 1.0e-6})
        assert zloz(snapshot, luzne, punkt) is not None

        ostre = opcje(nastawy_solvera={**NASTAWY, "eps_init": 1.0e-12})
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            zloz(snapshot, ostre, punkt)
        assert blad.value.kod == KOD_PODZIAL_MOCY_NIESPOJNY


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
        from network_model.solvers.dynamika import ladunek_resultset_dynamic_v2

        pierwszy = SilnikDynamiki(wejscie=zloz(snapshot_g16, opcje(), punkt_g16)).uruchom()
        drugi = SilnikDynamiki(wejscie=zloz(snapshot_g16, opcje(), punkt_g16)).uruchom()
        assert pierwszy.tozsamosc == drugi.tozsamosc
        ladunek_a = ladunek_resultset_dynamic_v2(pierwszy, run_id="bieg")
        ladunek_b = ladunek_resultset_dynamic_v2(drugi, run_id="bieg")
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
# Karta AB-1b.1 (P6-P8) przez adapter: komenda regulacji, czesciowa utrata, stanowisko
# badawcze, detektory — ta sama sciezka rozplyw -> adapter -> rdzen co bieg uzytkownika
# ---------------------------------------------------------------------------


def _scenariusz(zdarzenia: list[dict[str, Any]], **pola: Any) -> dict[str, Any]:
    return {"horyzont_s": 0.3, "krok_wyjscia_s": 0.02, "zdarzenia": zdarzenia, **pola}


def _indeks(wynik: Any, t_s: float, strona: str) -> int:
    return list(zip(wynik.os_czasu_s, wynik.strona_probki, strict=True)).index((t_s, strona))


class TestKomendaIUtrataCzesciowa:
    """Iloczyn: {maszyna synchroniczna bez regulatorow, przeksztaltnik nadazny} x {P, Q, U}
    x {wykonana, odmowa nazwana rdzenia}; czesciowa utrata {agregat, zrodlo sieciowe}."""

    @pytest.mark.parametrize(
        "ref, nastawa, stan",
        [
            ("gen-synchroniczny", {"p_mw": 4.0}, "p_mechaniczna_pu"),
            ("gen-synchroniczny", {"q_mvar": 2.0}, None),
            ("gen-synchroniczny", {"u_pu": 1.02}, None),
            ("gen-pv", {"p_mw": 1.2}, "p_zadane_pu"),
            ("gen-pv", {"q_mvar": 0.2}, "q_zadane_pu"),
            ("gen-pv", {"u_pu": 1.01}, "u_odniesienia_pu"),
        ],
        ids=["sync_P", "sync_Q_odmowa", "sync_U_odmowa", "pv_P", "pv_Q", "pv_U"],
    )
    def test_komenda_regulacji_przez_adapter(
        self,
        snapshot_g16: dict[str, Any],
        punkt_g16: PunktPracyRozplywu,
        ref: str,
        nastawa: dict[str, float],
        stan: str | None,
    ) -> None:
        scenariusz = _scenariusz(
            [{"rodzaj": "komenda_regulacji", "t_s": 0.1, "ref_id": ref, "nastawa": nastawa}]
        )
        wejscie = zloz(snapshot_g16, opcje(dynamika=scenariusz), punkt_g16)
        if stan is None:
            # Maszyna bez regulatora mocy biernej i ze stalym wzbudzeniem: odmowa rdzenia
            # z powodem z deklaracji klasy — adapter niczego nie podmienia po cichu.
            with pytest.raises(OdmowaDynamiki) as blad:
                SilnikDynamiki(wejscie=wejscie).uruchom()
            assert blad.value.kod == "dynamika.nastawa_nieobslugiwana"
            assert blad.value.szczegoly["urzadzenie"] == ref
            return
        wynik = SilnikDynamiki(wejscie=wejscie).uruchom()
        (zdarzenie,) = wynik.zdarzenia_wykonane
        (przypisanie,) = zdarzenie.przypisania
        assert przypisanie.adres == f"{ref}.{stan}"
        (wielkosc, wartosc) = next(iter(nastawa.items()))
        oczekiwana = wartosc if wielkosc == "u_pu" else wartosc / punkt_g16.base_mva
        assert przypisanie.po == oczekiwana
        assert zdarzenie.delta_x_nieprzypisane_max == 0.0
        assert wynik.probki[f"{stan}@{ref}"][_indeks(wynik, 0.1, "P")] == oczekiwana

    def test_czesciowa_utrata_pv_skaluje_prad_udzialem(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        scenariusz = _scenariusz(
            [
                {
                    "rodzaj": "utrata_czesciowa_zrodla",
                    "t_s": 0.1,
                    "ref_id": "gen-pv",
                    "udzial_pozostaly": 0.6,
                }
            ]
        )
        wynik = SilnikDynamiki(
            wejscie=zloz(snapshot_g16, opcje(dynamika=scenariusz), punkt_g16)
        ).uruchom()

        def prad(i: int) -> float:
            moc = complex(wynik.probki["p_pu@gen-pv"][i], wynik.probki["q_pu@gen-pv"][i])
            return abs(moc) / wynik.probki["u_pu@b-oze"][i]

        i_l, i_p = _indeks(wynik, 0.1, "L"), _indeks(wynik, 0.1, "P")
        assert prad(i_p) / prad(i_l) == pytest.approx(0.6, rel=1e-12)
        (zdarzenie,) = wynik.zdarzenia_wykonane
        assert zdarzenie.rodzaj == "utrata_czesciowa_zrodla"
        assert zdarzenie.delta_x_nieprzypisane_max == 0.0
        # Założenie silnika po PL-ZNAKI jest zapisane ze znakami (`silnik.py`); intencja bez
        # zmian — bieg z częściową utratą niesie jej założenie.
        assert any(zdanie.startswith("Częściowa utrata źródła") for zdanie in wynik.zalozenia)

    def test_czesciowa_utrata_zrodla_sieciowego_to_odmowa_rdzenia(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        scenariusz = _scenariusz(
            [
                {
                    "rodzaj": "utrata_czesciowa_zrodla",
                    "t_s": 0.1,
                    "ref_id": "zrodlo-110",
                    "udzial_pozostaly": 0.5,
                }
            ]
        )
        with pytest.raises(OdmowaDynamiki) as blad:
            SilnikDynamiki(
                wejscie=zloz(snapshot_g16, opcje(dynamika=scenariusz), punkt_g16)
            ).uruchom()
        assert blad.value.kod == "dynamika.udzial_zrodla_niedozwolony"


class TestStanowiskoBadawcze:
    """Iloczyn: impedancja {z_modelu, idealna} x modul {za transformatorem, na szynie
    zrodla (regula reszty)}; tryb stanowiska wyprowadzony, punkt pracy rownowaga."""

    @pytest.mark.parametrize("impedancja", ["z_modelu", "idealna"])
    @pytest.mark.parametrize("modul_na_szynie_zrodla", [False, True], ids=["za_trafo", "na_szynie"])
    def test_profil_stanowiska_przez_adapter(
        self,
        snapshot_g16: dict[str, Any],
        impedancja: str,
        modul_na_szynie_zrodla: bool,
    ) -> None:
        snapshot = copy.deepcopy(snapshot_g16)
        if modul_na_szynie_zrodla:
            snapshot["generators"][1]["bus_ref"] = "b-110"
        punkt = punkt_pracy(snapshot, _bieg_rozplywu(snapshot))
        scenariusz = _scenariusz(
            [],
            stanowisko={
                "zrodlo_ref": "zrodlo-110",
                "impedancja": impedancja,
                "profil": [{"rodzaj": "skok_napiecia", "t_s": 0.1, "u_pu": 0.95}],
            },
        )
        wynik = SilnikDynamiki(wejscie=zloz(snapshot, opcje(dynamika=scenariusz), punkt)).uruchom()
        assert wynik.tryb_scenariusza == "stanowisko"
        assert any(zdanie.startswith("Tryb stanowiska") for zdanie in wynik.zalozenia)
        i_p = _indeks(wynik, 0.1, "P")
        assert wynik.probki["sem_modul_pu@zrodlo-110"][i_p] == 0.95
        if impedancja == "idealna":
            # Zrodlo idealne narzuca napiecie szyny: |V| = |E| w kazdej probce po skoku.
            for i in range(i_p, len(wynik.os_czasu_s)):
                assert wynik.probki["u_pu@b-110"][i] == pytest.approx(0.95, abs=1e-12)
        if modul_na_szynie_zrodla:
            assert any("resztą bilansu" in zdanie for zdanie in zalozenia_wejscia(snapshot))

    def test_bez_stanowiska_tryb_sieci(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        wynik = SilnikDynamiki(
            wejscie=zloz(snapshot_g16, opcje(dynamika=_scenariusz([])), punkt_g16)
        ).uruchom()
        assert wynik.tryb_scenariusza == "siec"
        assert wynik.przekroczenia == ()


class TestDetektory:
    """Iloczyn: przejscie {skokowe w chwili zdarzenia, ciagle z lokalizacja} x kierunek
    {w_dol, w_gore} x wielkosc {|V| szyny, stan maszyny, |I| JAWNEGO zacisku}."""

    def _detektory(self) -> list[dict[str, Any]]:
        return [
            {
                "ident": "u<",
                "wielkosc": {"rodzaj": "modul_napiecia", "bus_ref": "b-sn-b"},
                "prog": 0.8,
                "kierunek": "w_dol",
                "jednorazowy": False,
            },
            {
                # Niejednorazowy: warunek spelniony w t = 0+ pobudza w 0, zapad go kasuje,
                # powrot po zdjeciu zwarcia uzbraja i pobudza drugi raz.
                "ident": "u>",
                "wielkosc": {"rodzaj": "modul_napiecia", "bus_ref": "b-sn-b"},
                "prog": 0.8,
                "kierunek": "w_gore",
                "jednorazowy": False,
            },
            {
                "ident": "omega>",
                "wielkosc": {
                    "rodzaj": "stan_urzadzenia",
                    "ref_id": "gen-synchroniczny",
                    "stan": "omega_pu",
                },
                "prog": 1.0005,
                "kierunek": "w_gore",
                "jednorazowy": True,
            },
            {
                "ident": "i>",
                "wielkosc": {
                    "rodzaj": "modul_pradu_zacisku",
                    "element_ref": "kab-odplyw",
                    "zacisk": "do",
                },
                "prog": 1.0e3,
                "kierunek": "w_gore",
                "jednorazowy": True,
            },
        ]

    def test_przekroczenia_przez_adapter(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        tolerancja = 1e-7
        scenariusz = {**copy.deepcopy(SCENARIUSZ), "detektory": self._detektory()}
        wynik = SilnikDynamiki(
            wejscie=zloz(
                snapshot_g16,
                opcje(
                    dynamika=scenariusz,
                    nastawy_solvera={**NASTAWY, "tolerancja_lokalizacji_zdarzen_s": tolerancja},
                ),
                punkt_g16,
            )
        ).uruchom()
        po_dozorach = {p.dozor: p for p in wynik.przekroczenia}
        chwile = {
            dozor: [
                (p.t_s, p.szerokosc_przedzialu_s) for p in wynik.przekroczenia if p.dozor == dozor
            ]
            for dozor in ("u<", "u>")
        }
        # Skokowe: zwarcie w 0,1 s i zdjecie w 0,2 s — pobudzenie DOKLADNIE w chwili zdarzenia;
        # warunek spelniony od poczatku (|V| > 0,8) pobudza w t = 0.
        assert chwile["u<"] == [(0.1, 0.0)]
        assert chwile["u>"] == [(0.0, 0.0), (0.2, 0.0)]
        assert po_dozorach["u<"].wielkosc == "u_pu@b-sn-b"
        # Ciagle: predkosc maszyny rosnie w trakcie zwarcia — lokalizacja w kroku.
        omega = po_dozorach["omega>"]
        assert 0.1 < omega.t_s < 0.3 and omega.iteracje > 0
        assert omega.szerokosc_przedzialu_s <= tolerancja
        # Prog pradu nieosiagalny — detektor bez pobudzenia (brak rekordu, nie zero).
        assert "i>" not in po_dozorach
        # Detektory bez akcji nie zmieniaja przebiegu: ten sam bieg bez detektorow.
        bez = SilnikDynamiki(wejscie=zloz(snapshot_g16, opcje(), punkt_g16)).uruchom()
        assert [(z.rodzaj, z.t_wykonany_s) for z in bez.zdarzenia_wykonane] == [
            (z.rodzaj, z.t_wykonany_s) for z in wynik.zdarzenia_wykonane
        ]
        assert bez.os_czasu_s == wynik.os_czasu_s
        assert bez.probki == wynik.probki, "detektor bez akcji zmienil trajektorie"

    def test_detektory_bez_tolerancji_lokalizacji_to_odmowa_rdzenia(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        scenariusz = {**copy.deepcopy(SCENARIUSZ), "detektory": self._detektory()[:1]}
        with pytest.raises(OdmowaDynamiki) as blad:
            SilnikDynamiki(
                wejscie=zloz(snapshot_g16, opcje(dynamika=scenariusz), punkt_g16)
            ).uruchom()
        assert blad.value.kod == "dynamika.nastawy_sprzeczne"


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

    def test_wezel_nierozwiazany_ze_zrodlem_to_odmowa_przy_skladaniu_urzadzen(
        self, snapshot_g16: dict[str, Any], rozplyw_g16: CanonicalRun
    ) -> None:
        """Wezel nierozwiazany Z urzadzeniem: odmowa `punkt_pracy_niepelny` z nazwa zrodla.

        PRZEPISANY ŚWIADOMIE (karta AB-1b.1 §0 pkt 2). Dawniej adapter odmawial z gory
        KAZDEMU wezlowi nierozwiazanemu, co czynilo niewykonalnym wezel martwy od t = 0
        (odcinek zasilany dopiero zamknieciem lacznika). Intencja zachowana: wezel
        nierozwiazany, do ktorego jest przylaczone ZRODLO, nadal konczy sie nazwana
        odmowa adaptera (bez napiecia i mocy szyny urzadzenie nie ma stanu
        poczatkowego) — tyle ze w miejscu, w ktorym brak ma skutek, i z nazwa zrodla.
        """
        raw = copy.deepcopy(rozplyw_g16.raw_result)
        raw["result_v1"]["unsolved_node_ids"] = [ref_to_graph_id("b-oze")]
        punkt = punkt_pracy_z_biegu_rozplywu(
            run_id="r1",
            analysis_type="PF",
            status="FINISHED",
            snapshot_hash=HASH_MIGAWKI,
            raw_result=raw,
            snapshot=snapshot_g16,
            oczekiwany_snapshot_hash=HASH_MIGAWKI,
        )
        assert "b-oze" not in punkt.napiecia_pu
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            zloz(snapshot_g16, opcje(), punkt)
        assert blad.value.kod == KOD_PUNKT_PRACY_NIEPELNY
        assert blad.value.elementy == ("gen-pv",)

    def test_wezel_nierozwiazany_bez_zrodla_w_wyspie_zywej_odmawia_rdzen(
        self, snapshot_g16: dict[str, Any], rozplyw_g16: CanonicalRun
    ) -> None:
        """`b-odplyw` (tylko odbior) polaczony z wyspa zywa: brak napiecia to odmowa rdzenia."""
        raw = copy.deepcopy(rozplyw_g16.raw_result)
        raw["result_v1"]["unsolved_node_ids"] = [ref_to_graph_id("b-odplyw")]
        punkt = punkt_pracy_z_biegu_rozplywu(
            run_id="r1",
            analysis_type="PF",
            status="FINISHED",
            snapshot_hash=HASH_MIGAWKI,
            raw_result=raw,
            snapshot=snapshot_g16,
            oczekiwany_snapshot_hash=HASH_MIGAWKI,
        )
        with pytest.raises(OdmowaDynamiki) as blad:
            SilnikDynamiki(zloz(snapshot_g16, opcje(), punkt)).uruchom()
        assert blad.value.kod == "dynamika.punkt_pracy_napiecie_missing"

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

    def test_synchronizacja_spoza_zbioru_rdzenia(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        """Rodzaj z kontraktu danych, którego rdzeń nie wykonuje — NAZWANA odmowa.

        Ciche pominięcie zamieniłoby scenariusz projektanta w inny scenariusz bez
        jednego śladu; to jest dokładnie ta klasa defektu, którą zakazuje karta.
        (Komenda regulacji i częściowa utrata źródła są od karty AB-1b.1 wykonywane —
        `TestKomendaIUtrataCzesciowa`.)
        """
        zdarzenie = {"rodzaj": "synchronizacja", "t_s": 0.2, "ref_id": "gen-pv", "bus_ref": "b-oze"}
        scenariusz = copy.deepcopy(SCENARIUSZ)
        scenariusz["zdarzenia"] = [zdarzenie]
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            zloz(snapshot_g16, opcje(dynamika=scenariusz), punkt_g16)
        assert blad.value.kod == KOD_ZDARZENIE_NIEOBSLUGIWANE
        assert "synchronizacja" in blad.value.elementy

    def test_tolerancja_lokalizacji_null_dozwolona_brak_klucza_nie(
        self, snapshot_g16: dict[str, Any], punkt_g16: PunktPracyRozplywu
    ) -> None:
        """`null` jest decyzja wolajacego (bieg bez detektorow), brak KLUCZA — brakiem pola;
        `null` innej nastawy — takze brakiem pola."""
        assert (
            zloz(snapshot_g16, opcje(), punkt_g16).nastawy.tolerancja_lokalizacji_zdarzen_s is None
        )
        z_wartoscia = opcje(nastawy_solvera={**NASTAWY, "tolerancja_lokalizacji_zdarzen_s": 1e-6})
        assert (
            zloz(snapshot_g16, z_wartoscia, punkt_g16).nastawy.tolerancja_lokalizacji_zdarzen_s
            == 1e-6
        )
        with pytest.raises(OdmowaWejsciaDynamiki) as blad:
            zloz(snapshot_g16, opcje(nastawy_solvera={**NASTAWY, "dt_s": None}), punkt_g16)
        assert blad.value.kod == KOD_NASTAWY_BRAK
        assert blad.value.elementy == ("dt_s",)

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

    def test_zrodlo_sieciowe_razem_z_wytworca_na_jednej_szynie_regula_reszty(
        self, snapshot_g16: dict[str, Any]
    ) -> None:
        """Szyna sztywna + wytworca = REGULA RESZTY (karta AB-1b.1 §0 pkt 11), nie odmowa.

        Przepisane 2026-09-24 z intencja: dawniej odmowa MODELOWA („podzialu nie da sie
        wyprowadzic"); podzial jest jednak rachunkiem rozplywu — wytworca jest wstrzykiem z
        modelu, szyna bilansujaca domyka bilans — wiec wytworca dostaje moc z modelu, a
        zrodlo sieciowe reszte. Punkt pracy jest wtedy rownowaga (bramka rdzenia przechodzi),
        a wynik niesie zalozenie reguly reszty.
        """
        snapshot = copy.deepcopy(snapshot_g16)
        snapshot["generators"][1]["bus_ref"] = "b-110"
        assert braki_modelu_dynamiki(EnergyNetworkModel.model_validate(snapshot)) == ()
        punkt = punkt_pracy(snapshot, _bieg_rozplywu(snapshot))
        wejscie = zloz(snapshot, opcje(), punkt)
        moce = wejscie.punkt_pracy.moce_zrodel_pu
        baza = punkt.base_mva
        assert moce["gen-pv"] == pytest.approx(complex(1.6 / baza, 0.0), abs=1e-15)
        odbiory_szyny = sum(
            complex(odbior.p_pu, odbior.q_pu)
            for odbior in wejscie.odbiory
            if odbior.wezel == "b-110"
        )
        assert moce["zrodlo-110"] == pytest.approx(
            punkt.wstrzyki_pu["b-110"] + odbiory_szyny - moce["gen-pv"], abs=1e-15
        )
        wynik = SilnikDynamiki(
            wejscie=dataclasses.replace(
                wejscie,
                harmonogram=HarmonogramDynamiki(()),
                nastawy=dataclasses.replace(wejscie.nastawy, horyzont_s=0.02, krok_wyjscia_s=0.02),
            )
        ).uruchom()
        assert wynik.os_czasu_s[-1] == 0.02
        assert any("resztą bilansu" in zdanie for zdanie in zalozenia_wejscia(snapshot))

    def test_dwa_zrodla_sieciowe_na_jednej_szynie(self, snapshot_g16: dict[str, Any]) -> None:
        """Reszty bilansu nie da sie podzielic miedzy dwa warunki brzegowe — odmowa MODELOWA."""
        snapshot = copy.deepcopy(snapshot_g16)
        drugie = copy.deepcopy(snapshot["sources"][0])
        drugie["id"] = "6a1d0000-0000-4000-8000-0000000000fd"
        drugie["ref_id"] = "zrodlo-110-b"
        drugie["name"] = "Drugie zrodlo 110 kV"
        snapshot["sources"].append(drugie)
        braki = braki_modelu_dynamiki(EnergyNetworkModel.model_validate(snapshot))
        assert [brak.kod for brak in braki] == [KOD_WIELE_URZADZEN_W_WEZLE]
        assert braki[0].elementy == ("b-110: zrodlo-110, zrodlo-110-b",)

    def test_kilku_wytworcow_na_jednej_szynie_nie_jest_brakiem_modelu(
        self, snapshot_g16: dict[str, Any]
    ) -> None:
        """Dwoch wytworcow na szynie to POPRAWNY model — instalacja PV i magazyn
        w jednym miejscu przylaczenia, kilka falownikow na wspolnej rozdzielnicy.

        `Generator.p_mw`/`q_mvar` sa danymi PER WYTWORCA i to z nich assembler
        zbudowal wstrzyk wezlowy rozplywu, wiec podzial nie jest domyslem. Warunek
        uzgodnienia zalezy od punktu pracy, wiec sprawdza go adapter (patrz
        `TestPodzialMocyWezla`), a nie bramka modelowa.
        """
        snapshot = copy.deepcopy(snapshot_g16)
        snapshot["generators"].append(
            {
                **copy.deepcopy(snapshot["generators"][1]),
                "id": "6a1d0000-0000-4000-8000-0000000000fe",
                "ref_id": "gen-pv-2",
                "name": "Druga instalacja PV",
            }
        )
        assert braki_modelu_dynamiki(EnergyNetworkModel.model_validate(snapshot)) == ()

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
        drugie_zrodlo = copy.deepcopy(kolizja["sources"][0])
        drugie_zrodlo["id"] = "6a1d0000-0000-4000-8000-0000000000fd"
        drugie_zrodlo["ref_id"] = "zrodlo-110-b"
        kolizja["sources"].append(drugie_zrodlo)
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


def test_f14_probka_L_chwili_zerowej_z_fazorami_pradow_zgodna_z_rozplywem(
    snapshot_g16: dict[str, Any],
    rozplyw_g16: CanonicalRun,
    punkt_g16: PunktPracyRozplywu,
) -> None:
    """F-14 w probce `L` zdarzenia w `t = 0` — z MODULEM I KATEM pradow obu zaciskow.

    Zdarzenie w `t = 0` (karta AB-1b.1 §0 pkt 6): probka `L` tej chwili jest punktem pracy
    PRZED zdarzeniem, czyli dokladnie stanem rozplywu. Prad zacisku z wyniku rozplywu to
    `I = conj(S / V)` (moc strony i napiecie wezla tej strony, FROZEN `PowerFlowResultV1`),
    porownany z modulem `i_*_pu@` i katem `i_*_kat_deg@` rdzenia — obie strony kazdej
    galezi, w tym transformator z przesunieciem fazowym grupy i kabel z susceptancja.
    """
    scenariusz = {
        "horyzont_s": 0.02,
        "krok_wyjscia_s": 0.02,
        "zdarzenia": [
            {
                "rodzaj": "zwarcie",
                "t_s": 0.0,
                "bus_ref": "b-sn-b",
                "typ": "3F",
                "r_f_ohm": 0.0,
                "x_f_ohm": 1.0,
                "t_usuniecia_s": 0.01,
                "sposob_usuniecia": "samoczynne",
            }
        ],
    }
    wejscie = zloz(snapshot_g16, opcje(dynamika=scenariusz), punkt_g16)
    wynik = SilnikDynamiki(wejscie=wejscie).uruchom()
    assert wynik.os_czasu_s[:2] == (0.0, 0.0)
    assert wynik.strona_probki[:2] == ("L", "P")
    lewa = 0
    rezultat = rozplyw_g16.raw_result["result_v1"]
    wezly = {
        ref_to_graph_id(k[len("u_pu@") :]): k[len("u_pu@") :]
        for k in wynik.probki
        if k.startswith("u_pu@")
    }
    galezie = {
        ref_to_graph_id(k[len("p_od_pu@") :]): k[len("p_od_pu@") :]
        for k in wynik.probki
        if k.startswith("p_od_pu@")
    }
    napiecia = {
        wiersz["bus_id"]: cmath.rect(wiersz["v_pu"], math.radians(wiersz["angle_deg"]))
        for wiersz in rezultat["bus_results"]
    }
    for bus_id, ref in wezly.items():
        assert wynik.probki[f"u_pu@{ref}"][lewa] == pytest.approx(abs(napiecia[bus_id]), rel=1e-9)
    grafu = zbuduj_graf(snapshot_g16)
    s_bazowa = wejscie.s_bazowa_mva
    porownane = 0
    for wiersz in rezultat["branch_results"]:
        ref = galezie[wiersz["branch_id"]]
        galaz_grafu = grafu.branches[wiersz["branch_id"]]
        for zacisk, wezel, p, q in (
            ("od", galaz_grafu.from_node_id, wiersz["p_from_mw"], wiersz["q_from_mvar"]),
            ("do", galaz_grafu.to_node_id, wiersz["p_to_mw"], wiersz["q_to_mvar"]),
        ):
            prad = (complex(p, q) / s_bazowa / napiecia[wezel]).conjugate()
            assert wynik.probki[f"i_{zacisk}_pu@{ref}"][lewa] == pytest.approx(
                abs(prad), rel=1e-9
            ), (ref, zacisk)
            kat = wynik.probki[f"i_{zacisk}_kat_deg@{ref}"][lewa]
            roznica = (math.radians(kat) - cmath.phase(prad) + math.pi) % (2 * math.pi) - math.pi
            assert abs(roznica) < 1e-8, (ref, zacisk, kat, math.degrees(cmath.phase(prad)))
            porownane += 1
    # Trzy galezie wyniku rozplywu G16 (jak w B-8: sprzeglo szyn zwijane przez tor
    # rozplywu nie ma wiersza) x dwa zaciski.
    assert porownane == 6, f"porownano {porownane} fazorow zamiast 6 — zmienil sie zakres G16"
