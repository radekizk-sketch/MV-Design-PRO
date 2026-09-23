"""Wynik inżynierski jako ROZSZERZENIE `OcenaElementu`/`PozycjaWerdyktu` (karta AB-1a D2).

Pokrycie jako iloczyn cech (reguła KLASA, NIE INSTANCJA):
* kontrakt `to_dict` × (pole stare | pole nowe) — stare klucze bez zmian, nowe = `None`;
* podstawa × (jest | brak) × (rendering zgodny | rozjechany) — jedno źródło `norma_pl`;
* źródło pozycji × (bieg PF | bieg SC | model | NC RfG | rodzaj nieznany) — domena;
* test NC RfG × stan dowodowy (deklaracja / bez treści / brak symulacji / limit
  niezweryfikowany / dopuszczalny / brak danych / nie dotyczy) — adapter FROZEN;
* „nigdy wartość zastępcza": brak danej dostawcy → `None` w każdym polu liczbowym.
"""

from __future__ import annotations

import dataclasses

import pytest
from application.analyses.werdykt_projektowy import (
    KRYTERIUM_DOBOR_DER_SN,
    KRYTERIUM_NAPIECIE,
    KRYTERIUM_PRZEWOD_CIEPLNY,
    REJESTR_KRYTERIOW,
    STAN_NIESPRAWDZONE,
    WYNIK_BRAK_PODSTAW,
    WYNIK_NIE_SPELNIA,
    WYNIK_SPELNIA,
    ZRODLO_NIEZWERYFIKOWANE,
    DefinicjaKryterium,
    Niepewnosc,
    OcenaElementu,
    PodstawaNormatywna,
    PozycjaWerdyktu,
    PrzyczynaOgraniczenia,
    PunktKrytyczny,
    StatusModelu,
    ZakresWaznosci,
    _ocena_elementu,
)
from application.ncrfg_compliance.bieg import odpowiedz_biegu_ncrfg
from application.ncrfg_compliance.wynik_inzynierski import (
    wyniki_inzynierskie_biegu,
    z_testu_ncrfg,
)
from catalog.profiles.nc_rfg import load_nc_rfg_profile
from network_model.solvers.ncrfg_ptpiree import (
    NcRfgPtpireeModuleInput,
    NcRfgPtpireeRunRequest,
    NcRfgPtpireeSolver,
)
from solver_input.provenance import FieldQuality
from solver_input.status_modelu import StatusParametrow, StatusRownan

#: Klucze `OcenaElementu.to_dict` SPRZED karty AB-1a (pin: nie znikają, nie zmieniają nazw).
KLUCZE_OCENY_SPRZED_KARTY = (
    "element_id",
    "element_nazwa",
    "element_rodzaj",
    "wynik",
    "wartosc",
    "odniesienie",
    "odniesienie_dolne",
    "odniesienie_ostrzegawcze",
    "jednostka",
    "margines",
    "margines_jednostka",
    "margines_wzor_latex",
    "uwaga_pl",
    "uzasadnienie_pl",
    "wniosek_pl",
    "dowod",
)
KLUCZE_OCENY_NOWE = (
    "punkt_krytyczny",
    "przyczyna",
    "status_modelu",
    "status_wejscia",
    "niepewnosc",
    "zakres_waznosci",
)
#: Klucze `PozycjaWerdyktu.to_dict` SPRZED karty (definicja + pola pozycji).
KLUCZE_POZYCJI_SPRZED_KARTY = (
    "kryterium_id",
    "etap",
    "nazwa_pl",
    "warunek_pl",
    "norma_pl",
    "zrodlo",
    "element_rodzaj",
    "grupa",
    "wielkosc_pl",
    "symbol",
    "jednostka",
    "warunek",
    "symbol_latex",
    "warunek_latex",
    "zakres_oceny",
    "stan",
    "liczba_ocenionych",
    "liczba_naruszen",
    "liczba_niesprawdzonych",
    "liczba_ostrzezen",
    "wiodacy_element_id",
    "wiodacy_opis_pl",
    "powod_kod",
    "powod_pl",
    "run_id",
    "elementy",
)
KLUCZE_POZYCJI_NOWE = ("physics_domain", "podstawa")


def _definicja(kryterium_id: str) -> DefinicjaKryterium:
    return next(d for d in REJESTR_KRYTERIOW if d.kryterium_id == kryterium_id)


# --------------------------------------------------------------------------- #
# Kontrakt `to_dict` — addytywny
# --------------------------------------------------------------------------- #
def test_to_dict_oceny_addytywny_stare_klucze_w_tej_samej_kolejnosci() -> None:
    element = _ocena_elementu(
        _definicja(KRYTERIUM_NAPIECIE),
        element_id="b1",
        element_nazwa="Szyna 1",
        wynik=WYNIK_SPELNIA,
        wartosc=2.0,
        odniesienie=10.0,
        run_id="run-1",
    )
    klucze = list(element.to_dict())
    assert tuple(klucze[: len(KLUCZE_OCENY_SPRZED_KARTY)]) == KLUCZE_OCENY_SPRZED_KARTY
    assert tuple(klucze[len(KLUCZE_OCENY_SPRZED_KARTY) :]) == KLUCZE_OCENY_NOWE
    slownik = element.to_dict()
    # Producenci agregatu nie maja tych danych -> None (brak), nie wartosc zastepcza.
    for klucz in KLUCZE_OCENY_NOWE:
        assert slownik[klucz] is None, klucz
    # Jeden ksztalt dowodu: {run_id, element_id, trace_ref}.
    assert slownik["dowod"] == {
        "run_id": "run-1",
        "element_id": "b1",
        "trace_ref": None,
    }


def test_to_dict_pozycji_addytywny() -> None:
    pozycja = PozycjaWerdyktu(definicja=_definicja(KRYTERIUM_NAPIECIE), stan=STAN_NIESPRAWDZONE)
    klucze = tuple(pozycja.to_dict())
    assert klucze[: len(KLUCZE_POZYCJI_SPRZED_KARTY)] == KLUCZE_POZYCJI_SPRZED_KARTY
    assert klucze[len(KLUCZE_POZYCJI_SPRZED_KARTY) :] == KLUCZE_POZYCJI_NOWE


def test_nowe_pola_serializuja_sie_gdy_dostawca_je_ma() -> None:
    element = dataclasses.replace(
        _ocena_elementu(
            _definicja(KRYTERIUM_NAPIECIE),
            element_id="b1",
            element_nazwa=None,
            wynik=WYNIK_SPELNIA,
        ),
        punkt_krytyczny=PunktKrytyczny(element_ref="b1", wspolrzedna={"t_s": 0.15}),
        przyczyna=PrzyczynaOgraniczenia(
            rodzaj="ogranicznik", ref="g1", opis_pl="Ogranicznik prądu"
        ),
        status_modelu=StatusModelu(StatusRownan.UNVALIDATED, StatusParametrow.KARTA_KATALOGOWA),
        status_wejscia=FieldQuality.ESTIMATED,
        niepewnosc=Niepewnosc(wartosc=0.5, jednostka="%", metoda_pl="propagacja"),
        zakres_waznosci=ZakresWaznosci(
            opis_pl="pasmo", granice={"f_max_hz": 2500.0, "f_min_hz": 50.0}
        ),
    )
    slownik = element.to_dict()
    assert slownik["punkt_krytyczny"] == {
        "element_ref": "b1",
        "wspolrzedna": {"t_s": 0.15},
    }
    assert slownik["przyczyna"]["rodzaj"] == "ogranicznik"
    assert slownik["status_modelu"] == {
        "rownania": "UNVALIDATED",
        "rownania_pl": "rownania_niezwalidowane",
        "parametry": "KARTA_KATALOGOWA",
        "parametry_pl": "karta_techniczna",
    }
    assert slownik["status_wejscia"] == "ESTIMATED"
    assert list(slownik["zakres_waznosci"]["granice"]) == ["f_max_hz", "f_min_hz"]


# --------------------------------------------------------------------------- #
# Nigdy wartość zastępcza
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("wartosc", [None, "12", True])
def test_brak_liczby_dostawcy_to_none_nie_zastepnik(wartosc: object) -> None:
    element = _ocena_elementu(
        _definicja(KRYTERIUM_PRZEWOD_CIEPLNY),
        element_id="l1",
        element_nazwa=None,
        wynik=WYNIK_BRAK_PODSTAW,
        wartosc=wartosc,
        odniesienie=None,
    )
    assert element.wartosc is None
    assert element.odniesienie is None
    assert element.margines is None
    assert element.dowod is None  # bez biegu brak dowodu — nie pusty slownik


# --------------------------------------------------------------------------- #
# Podstawa strukturalna — jedno źródło `norma_pl`
# --------------------------------------------------------------------------- #
def test_podstawa_wymaga_normy_rownej_renderingowi() -> None:
    podstawa = PodstawaNormatywna(
        dokument="PN-EN 50549-2",
        wersja="2019",
        klauzula="4.9",
        zrodlo_status=ZRODLO_NIEZWERYFIKOWANE,
    )
    zgodna = dataclasses.replace(_definicja(KRYTERIUM_NAPIECIE), norma_pl=podstawa.render_pl())
    assert PozycjaWerdyktu(definicja=zgodna, stan=STAN_NIESPRAWDZONE, podstawa=podstawa)
    assert podstawa.render_pl() == "PN-EN 50549-2, wersja 2019, 4.9"
    with pytest.raises(ValueError, match="nie jest renderingiem podstawy"):
        PozycjaWerdyktu(
            definicja=_definicja(KRYTERIUM_NAPIECIE),
            stan=STAN_NIESPRAWDZONE,
            podstawa=podstawa,
        )


def test_podstawa_bez_dokumentu_nie_udaje_dokumentu() -> None:
    podstawa = PodstawaNormatywna(
        dokument=None, wersja=None, klauzula=None, zrodlo_status=ZRODLO_NIEZWERYFIKOWANE
    )
    assert podstawa.render_pl() == "Brak wskazanego dokumentu podstawy wymagania"
    assert podstawa.to_dict()["zrodlo_status"] == "UNVERIFIED_SOURCE"


# --------------------------------------------------------------------------- #
# Domena fizyczna — z rodzaju biegu (szew integracyjny rejestru domen)
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    ("zrodlo", "domena"),
    [
        ("PF", "POWER_FLOW"),
        ("short_circuit_sn", "SHORT_CIRCUIT"),
        ("model", None),
        ("ncrfg_ptpiree", None),
    ],
)
def test_domena_fizyczna_pozycji_z_rodzaju_biegu(zrodlo: str, domena: str | None) -> None:
    definicja = dataclasses.replace(_definicja(KRYTERIUM_DOBOR_DER_SN), zrodlo=zrodlo)
    pozycja = PozycjaWerdyktu(definicja=definicja, stan=STAN_NIESPRAWDZONE)
    assert pozycja.physics_domain == domena
    assert pozycja.to_dict()["physics_domain"] == domena


def test_nieznany_rodzaj_biegu_jest_bledem_nazwanym() -> None:
    definicja = dataclasses.replace(_definicja(KRYTERIUM_NAPIECIE), zrodlo="nieznany_bieg")
    with pytest.raises(ValueError, match="nieznany_bieg"):
        PozycjaWerdyktu(definicja=definicja, stan=STAN_NIESPRAWDZONE).to_dict()


def test_kazde_kryterium_rejestru_ma_domene_albo_jest_z_modelu() -> None:
    for definicja in REJESTR_KRYTERIOW:
        pozycja = PozycjaWerdyktu(definicja=definicja, stan=STAN_NIESPRAWDZONE)
        if definicja.zrodlo == "model":
            assert pozycja.physics_domain is None
        else:
            assert pozycja.physics_domain in {"POWER_FLOW", "SHORT_CIRCUIT"}


# --------------------------------------------------------------------------- #
# Adapter NC RfG — REALNY solver FROZEN, cztery stany dowodowe
# --------------------------------------------------------------------------- #
_MODUL_B: dict = {
    "der_ref": "pv-b",
    "der_name": "PV 2000 kW",
    "operator_id": "enea",
    "p_max_kw": 2000,
    "voltage_kv": 15,
    "certificate_status": "ptpiree_verified",
    "has_lvrt_curve": True,
    "has_hvrt_curve": True,
    "has_pf_droop": True,
    "has_qu_curve": True,
    "has_dynamic_model": True,
    "has_scada_communication": True,
    "has_disturbance_recorder": True,
    "active_power_control_enabled": True,
    "droop_percent": 5,
    "dead_band_hz": 0.2,
    "ramp_rate_pct_per_min": 10,
    "cos_phi_min": 0.95,
    "q_range_pct_pn_min": -0.33,
    "q_range_pct_pn_max": 0.33,
    "reactive_current_gain": 2,
    "p_recovery_time_s": 0.8,
    "harmonic_thdu_percent": 3,
}


def _bieg(modul: dict, *, wymuszone: list[str] | None = None):
    return NcRfgPtpireeSolver().run(
        NcRfgPtpireeRunRequest(
            modules=[NcRfgPtpireeModuleInput(**modul)],
            requested_test_ids=wymuszone or [],
        )
    )


def _pozycja(wynik, test_id: str) -> PozycjaWerdyktu:
    modul = wynik.modules[0]
    test = next(t for t in modul.tests if t.test_id == test_id)
    return z_testu_ncrfg(
        test,
        modul,
        load_nc_rfg_profile(modul.operator_id),
        procedura=wynik.procedure_version,
        slad=wynik.white_box_trace,
    )


def test_adapter_cztery_testy_cztery_nazwane_stany() -> None:
    wynik = _bieg(_MODUL_B, wymuszone=["T01"])
    stany = {}
    for test_id in ("T01", "T10", "T14", "T20"):
        test = next(t for t in wynik.modules[0].tests if t.test_id == test_id)
        assert test.verdict == "pass", test_id  # solver mowi „pass" — adapter nie ufa slepo
        pozycja = _pozycja(wynik, test_id)
        element = pozycja.elementy[0]
        assert element.wynik == WYNIK_BRAK_PODSTAW, test_id
        assert pozycja.stan == STAN_NIESPRAWDZONE
        stany[test_id] = (pozycja.powod_kod, pozycja.powod_pl)
    assert stany["T01"][0] == "ncrfg_ptpiree.frequency_response"
    assert stany["T01"][1] is not None and stany["T01"][1].startswith("Deklaracja wnioskodawcy")
    assert stany["T10"][0] == "ncrfg_ptpiree.test_bez_tresci"
    assert stany["T10"][1] is not None and stany["T10"][1].startswith("Test bez treści")
    assert stany["T14"][0] == "ncrfg_ptpiree.ride_through"
    assert stany["T14"][1] is not None and stany["T14"][1].startswith("Brak symulacji")
    assert stany["T20"][0] == "ncrfg_ptpiree.power_quality_declared"
    assert stany["T20"][1] is not None and stany["T20"][1].startswith("Limit niezweryfikowany")
    assert len({powod for _kod, powod in stany.values()}) == 4


def test_adapter_liczby_wylacznie_ze_sladu_solvera() -> None:
    wynik = _bieg(_MODUL_B)
    t20 = _pozycja(wynik, "T20").elementy[0]
    assert (t20.wartosc, t20.odniesienie, t20.margines) == (3.0, 8.0, 5.0)
    assert t20.jednostka == "%" and t20.margines_jednostka == "pkt proc."
    t16 = _pozycja(wynik, "T16").elementy[0]
    assert (t16.wartosc, t16.odniesienie, t16.margines) == (0.8, 1.0, 0.2)
    # T14: wielkosc „symulowana" nie jest policzona -> brak wartosci i zapasu,
    # ale punkt krytyczny obwiedni (czas) jest znany.
    t14 = _pozycja(wynik, "T14").elementy[0]
    assert t14.wartosc is None and t14.margines is None
    assert t14.punkt_krytyczny is not None and t14.punkt_krytyczny.wspolrzedna == {"t_s": 0.0}
    # T05: granica wyprowadzana w kodzie solvera (nie podana) -> brak odniesienia.
    t05 = _pozycja(wynik, "T05").elementy[0]
    assert t05.wartosc is not None and t05.odniesienie is None and t05.margines is None
    for test_id in ("T20", "T16", "T14", "T05"):
        dowod = _pozycja(wynik, test_id).elementy[0].dowod
        assert dowod is not None and dowod["run_id"] is None and dowod["element_id"] == "pv-b"
        assert str(dowod["trace_ref"]).startswith(f"proof:ncrfg-ptpiree:{test_id}:")


def test_adapter_test_dopuszczalny_dowodowo_spelnia() -> None:
    # T11 (PMIN) — fakt konfiguracyjny z deklaracji: dopuszczalny dowodowo.
    wynik = _bieg(dict(_MODUL_B, p_min_kw=10))
    pozycja = _pozycja(wynik, "T11")
    assert pozycja.elementy[0].wynik == WYNIK_SPELNIA
    assert pozycja.powod_kod is None


def test_adapter_fail_zostaje_nie_spelnia() -> None:
    wynik = _bieg(dict(_MODUL_B, harmonic_thdu_percent=12.0))
    pozycja = _pozycja(wynik, "T20")
    assert pozycja.elementy[0].wynik == WYNIK_NIE_SPELNIA
    assert pozycja.elementy[0].margines == -4.0


def test_adapter_brak_danych_i_nie_dotyczy() -> None:
    wynik = _bieg(dict(_MODUL_B, p_recovery_time_s=None, harmonic_thdu_percent=None))
    t16 = _pozycja(wynik, "T16")
    assert t16.elementy[0].wynik == WYNIK_BRAK_PODSTAW
    assert (t16.elementy[0].wartosc, t16.elementy[0].odniesienie) == (None, None)
    t20 = _pozycja(wynik, "T20")  # bez THD test nie jest wymagany
    assert t20.stan == "NIE_DOTYCZY" and t20.elementy == ()


@pytest.mark.parametrize(
    "modul",
    [
        _MODUL_B,
        dict(_MODUL_B, has_scada_communication=False, has_disturbance_recorder=False),
        dict(_MODUL_B, harmonic_thdu_percent=12.0, p_recovery_time_s=None),
    ],
)
def test_adapter_wymagany_z_jednego_zrodla_z_agregatem_solvera(modul: dict) -> None:
    # Iloczyn cech: required × verdict (pass | fail | no_data | not_required).
    # Solver liczy naruszenia modułu WYŁĄCZNIE dla testów wymaganych; test
    # niewymagany z werdyktem „fail" (T19 bez SCADA) nie może stać się naruszeniem
    # w wyniku inżynierskim — predykat wejścia i agregatu z jednego źródła.
    wynik = _bieg(modul)
    niewymagane_z_werdyktem = 0
    for test in wynik.modules[0].tests:
        pozycja = _pozycja(wynik, test.test_id)
        if not test.required:
            assert pozycja.stan == "NIE_DOTYCZY" and pozycja.elementy == (), test.test_id
            if test.verdict != "not_required":
                niewymagane_z_werdyktem += 1
                assert "poza wymaganiem" in (pozycja.powod_pl or ""), test.test_id
        else:
            assert pozycja.stan != "NIE_DOTYCZY", test.test_id
    naruszenia = sum(
        1 for test in wynik.modules[0].tests if _pozycja(wynik, test.test_id).stan == "NARUSZONE"
    )
    assert naruszenia == wynik.modules[0].fail_count
    if modul is not _MODUL_B:
        assert niewymagane_z_werdyktem > 0 or wynik.modules[0].fail_count > 0


def test_adapter_podstawa_niezweryfikowana_i_jedno_zrodlo_normy_dla_wszystkich_testow() -> None:
    wynik = _bieg(_MODUL_B, wymuszone=["T01", "T18"])
    for test in wynik.modules[0].tests:
        pozycja = _pozycja(wynik, test.test_id)
        assert pozycja.podstawa is not None
        assert pozycja.podstawa.zrodlo_status == "UNVERIFIED_SOURCE"
        assert pozycja.definicja.norma_pl == pozycja.podstawa.render_pl()
        assert pozycja.physics_domain is None
    t20 = _pozycja(wynik, "T20")
    assert t20.podstawa is not None and "stałej silnika" in (t20.podstawa.uwaga_pl or "")


def test_koperta_biegu_niesie_wynik_inzynierski_kazdego_testu() -> None:
    wynik = _bieg(_MODUL_B)
    koperta = odpowiedz_biegu_ncrfg(wynik, [])
    testy = {t.test_id for t in wynik.modules[0].tests}
    assert set(koperta.wynik_inzynierski["pv-b"]) == testy
    assert koperta.wynik_inzynierski == wyniki_inzynierskie_biegu(wynik)
    for pozycja in koperta.wynik_inzynierski["pv-b"].values():
        assert pozycja["podstawa"]["zrodlo_status"] == "UNVERIFIED_SOURCE"


def test_ocena_elementu_nie_jest_trzecim_kontraktem() -> None:
    # Adapter zwraca ISTNIEJACE klasy — ten sam ksztalt co ekran „Ocena techniczna".
    wynik = _bieg(_MODUL_B)
    pozycja = _pozycja(wynik, "T20")
    assert type(pozycja) is PozycjaWerdyktu
    assert all(type(e) is OcenaElementu for e in pozycja.elementy)
    assert (
        tuple(pozycja.to_dict())[: len(KLUCZE_POZYCJI_SPRZED_KARTY)] == KLUCZE_POZYCJI_SPRZED_KARTY
    )
