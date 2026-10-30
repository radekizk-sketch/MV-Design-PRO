"""Testy gotowości analiz specjalistycznych V12.6 (karta B02-BE-TESTY, §3).

`ocen_gotowosc_v126` jest JEDNĄ funkcją zasilającą JEDNOCZEŚNIE ekran
„Analizy specjalistyczne" (`GET …/v126/gotowosc`) i bramkę 422 na uruchomieniu
(`POST …/runs/v126/{rodzaj}`) — reguła KLASA §3 (predykaty parami: warunek
WEJŚCIA i WYJŚCIA z JEDNEGO źródła prawdy). Każda asercja tego pliku pochodzi
z REALNEGO wywołania na złotej sieci (`tests/cgmes/golden_enm.py`, 5 szyn
110/15/15/15/0,4 kV, `gen_sync` + `gen_pv` — `pv_inverter` BEZ karty
katalogowej przekształtnika), nie z przykładu karty — iloczyn cech: rodzaj ×
brak danej × parametr × wartość z modelu.
"""

from __future__ import annotations

import re

import pytest
from application.analyses.v126_gotowosc import (
    BRAK_WEZLOW_PL,
    GOTOWOSC_NIEPOTWIERDZONA,
    GOTOWOSC_POTWIERDZONA,
    GOTOWOSC_WYCOFANA,
    GotowoscAnalizy,
    Warunek,
    czestotliwosc_modelu,
    gotowosc_wszystkich,
    ocen_gotowosc_v126,
    przedmiot_modelu,
    uzupelnij_parametry_z_modelu,
)
from application.analyses.v126_katalog import KATALOG_ANALIZ_V126, nazwa_parametru_pl
from enm.models import (
    DlawikGaszacy,
    EnergyNetworkModel,
    ENMHeader,
    RezystorUziemiajacy,
    ZespolUziemiajacy,
)
from solver_input.v126_contracts import V126AnalysisType, build_v126_input_from_enm

from tests.cgmes.golden_enm import build_golden_enm

#: Wzorzec identyfikatora Pythona z podkreśleniem — DOKŁADNIE ten sam, którego
#: pilnuje `frontend/.../prezentacja.straznik.test.tsx` (reguła „identyfikator
#: z podkreśleniem"). Komunikat gotowości, który go łapie, jest kodem
#: produkcyjnym wyciekłym na ekran projektanta.
_WZORZEC_IDENTYFIKATORA_Z_PODKRESLENIEM = re.compile(r"\b[a-z]{2,}_[a-z][a-z0-9_]*\b")

# ---------------------------------------------------------------------------
# Fixtures sieci
# ---------------------------------------------------------------------------


def _zlota_siec_z_zespolem(wariant: str = "dlawik") -> EnergyNetworkModel:
    """Kopia złotej sieci z zespołem uziemiającym na szynie SN GPZ (`bus_sn_main`).

    Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 1: uziemienie sieci SN opisuje WYŁĄCZNIE zespół
    uziemiający albo punkt neutralny uzwojenia transformatora. Dawny wariant tej funkcji
    deklarował dławik na źródle `src_gpz` stojącym na szynie 110 kV — opis sieci WN udawał
    uziemienie sieci SN (właśnie ten defekt kasuje karta). ``wariant``: ``dlawik``,
    ``rezystor`` albo ``bez_elementu`` (zespół bez elementu w punkcie neutralnym — brak MODELU).
    """
    enm = build_golden_enm().model_copy(deep=True)
    zespol = ZespolUziemiajacy(
        ref_id="zu_gpz", name="Zespół uziemiający GPZ", bus_ref="bus_sn_main"
    )
    if wariant == "dlawik":
        zespol.dlawik = DlawikGaszacy(i_min_a=40.0, i_max_a=400.0, i_nastawy_a=100.0)
    elif wariant == "rezystor":
        zespol.rezystor = RezystorUziemiajacy(r_ohm=43.3)
    enm.zespoly_uziemiajace = [zespol]
    return enm


def _model_bez_szyn() -> EnergyNetworkModel:
    return EnergyNetworkModel(header=ENMHeader(name="model bez węzłów"))


def _model_bez_galezi_trafo_mocy_zwarciowej() -> EnergyNetworkModel:
    """Jedna szyna, brak gałęzi/transformatorów/źródeł -> brak parametrów do propagacji."""
    enm = build_golden_enm()
    return EnergyNetworkModel(header=ENMHeader(name="minimalna"), buses=enm.buses[:1])


# ---------------------------------------------------------------------------
# 1. rodzaj x brak danej: wszystkie 14 rodzajów na złotej sieci, parametry={}
# ---------------------------------------------------------------------------

#: Stan gotowości każdego z 14 rodzajów na ZŁOTEJ SIECI z `parametry={}` —
#: zmierzone REALNYM wywołaniem (karta B02-BE-TESTY §3), nie założone.
_OCZEKIWANE_STANY_ZLOTA_SIEC: dict[V126AnalysisType, str] = {
    V126AnalysisType.POWER_QUALITY_HARMONICS: GOTOWOSC_NIEPOTWIERDZONA,
    V126AnalysisType.SSCI_IMPEDANCE: GOTOWOSC_NIEPOTWIERDZONA,
    V126AnalysisType.VOLTAGE_STABILITY: GOTOWOSC_POTWIERDZONA,
    V126AnalysisType.RELIABILITY_CONTINGENCY: GOTOWOSC_NIEPOTWIERDZONA,
    V126AnalysisType.EARTHING_SAFETY: GOTOWOSC_NIEPOTWIERDZONA,
    V126AnalysisType.INSULATION_COORDINATION: GOTOWOSC_NIEPOTWIERDZONA,
    # Zasada nr 4: wyposażenie przekaźnika jest uwagą, nie blokerem — sposób uziemienia złotej
    # sieci jest w modelu, więc dobór metody biegnie (kryterium funkcji przekaźnika NIE_OCENIONO).
    V126AnalysisType.EARTH_FAULT_DETECTION: GOTOWOSC_POTWIERDZONA,
    V126AnalysisType.TRANSIENT_TRV: GOTOWOSC_NIEPOTWIERDZONA,
    V126AnalysisType.MOTOR_STARTING: GOTOWOSC_NIEPOTWIERDZONA,
    V126AnalysisType.HOSTING_CAPACITY: GOTOWOSC_WYCOFANA,
    V126AnalysisType.OPF_LOSS_LCC: GOTOWOSC_WYCOFANA,
    V126AnalysisType.BENCHMARK_VALIDATION: GOTOWOSC_POTWIERDZONA,
    V126AnalysisType.UNCERTAINTY_SENSITIVITY: GOTOWOSC_POTWIERDZONA,
    V126AnalysisType.NEUTRAL_EARTHING_DESIGN: GOTOWOSC_NIEPOTWIERDZONA,
}


def test_komplet_14_rodzajow_jest_pokryty_przez_tabele_oczekiwan() -> None:
    assert set(_OCZEKIWANE_STANY_ZLOTA_SIEC) == set(V126AnalysisType)


@pytest.mark.parametrize("rodzaj", list(V126AnalysisType), ids=lambda r: r.value)
def test_gotowosc_na_zlotej_sieci_bez_parametrow(rodzaj: V126AnalysisType) -> None:
    enm = build_golden_enm()
    wynik = ocen_gotowosc_v126(enm, rodzaj, {})
    assert wynik.gotowosc in (
        GOTOWOSC_POTWIERDZONA,
        GOTOWOSC_NIEPOTWIERDZONA,
        GOTOWOSC_WYCOFANA,
    )
    assert wynik.gotowosc == _OCZEKIWANE_STANY_ZLOTA_SIEC[rodzaj], (
        f"{rodzaj.value}: oczekiwano {_OCZEKIWANE_STANY_ZLOTA_SIEC[rodzaj]}, "
        f"jest {wynik.gotowosc}; braki={[w.kod for w in wynik.braki]}"
    )
    if rodzaj in (V126AnalysisType.HOSTING_CAPACITY, V126AnalysisType.OPF_LOSS_LCC):
        assert wynik.powod_wycofania_pl is not None and wynik.powod_wycofania_pl.strip()
    else:
        assert wynik.powod_wycofania_pl is None
    if wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA:
        assert wynik.braki, f"{rodzaj.value}: NIEPOTWIERDZONA bez ani jednego braku"
        for brak in wynik.braki:
            assert brak.kod.strip()
            assert brak.opis_pl.strip()
            # Polski komunikat: znak diakrytyczny ORAZ ani jednego znaku spoza
            # zakresu (żadnej ucieczki do angielskiego kodu wprost w zdaniu).
            assert brak.blokujacy is True


def test_zaden_rodzaj_wycofany_poza_hosting_i_opf_nie_jest_wycofany() -> None:
    """`voltage_stability`/`benchmark_validation` są NIEPREZENTOWANE we froncie,
    ale kontraktowo URUCHAMIALNE (dla odtwarzalności) — WYCOFANA jest dokładnie
    dla `hosting_capacity`/`opf_loss_lcc` (410 na POST), nie dla wszystkich
    czterech rodzajów zdjętych z ekranu (karta W3-E)."""
    enm = build_golden_enm()
    wycofane = {
        rodzaj
        for rodzaj in V126AnalysisType
        if ocen_gotowosc_v126(enm, rodzaj, {}).gotowosc == GOTOWOSC_WYCOFANA
    }
    assert wycofane == {V126AnalysisType.HOSTING_CAPACITY, V126AnalysisType.OPF_LOSS_LCC}


# ---------------------------------------------------------------------------
# 2. Jakość energii / harmoniczne (PQ)
# ---------------------------------------------------------------------------


def _zlota_siec_z_karta_pv(klucz_wstrzykniety: dict[int, float] | None) -> EnergyNetworkModel:
    """Kopia złotej sieci, w której `gen_pv` MA kartę przekształtnika (napięcie,
    moc znamionowa, tryb). Złota sieć bazowa nie niesie karty w ogóle, więc ten
    wariant jest potrzebny do rozróżnienia klasy „brak karty" od klasy „karta bez
    widma". Karta AB-H0: karta katalogowa NIE niesie widma (pole skasowane);
    `klucz_wstrzykniety` wkłada klucz skasowanego pola mimo katalogu — żeby pinować,
    że most i gotowość go NIE czytają."""
    enm = build_golden_enm().model_copy(deep=True)
    karta: dict[str, object] = {"un_kv": 0.4, "sn_mva": 2.2, "control_mode": "Q_OF_U"}
    if klucz_wstrzykniety is not None:
        karta["harmonic_spectrum_percent"] = klucz_wstrzykniety
    for gen in enm.generators:
        if gen.ref_id == "gen_pv":
            gen.materialized_params = karta
    return enm


def _zlota_siec_z_drugim_pv_bez_widma() -> EnergyNetworkModel:
    """Złota sieć (`gen_pv` BEZ karty) + drugi przekształtnik `gen_pv2` Z kartą, ale
    bez widma — iloczyn cech „brak karty × karta bez widma" w JEDNYM modelu."""
    enm = build_golden_enm().model_copy(deep=True)
    wzor = next(gen for gen in enm.generators if gen.ref_id == "gen_pv")
    enm.generators.append(
        wzor.model_copy(
            update={
                "ref_id": "gen_pv2",
                "name": "Farma PV 2",
                "bus_ref": "bus_sn_c",
                "materialized_params": {"un_kv": 15.0, "sn_mva": 1.5, "control_mode": "Q_OF_U"},
            }
        )
    )
    return enm


def test_pq_gen_pv_bez_karty_jest_brakiem_karty_nie_widma() -> None:
    """ZWERYFIKOWANE REALNYM WYWOŁANIEM: `gen_pv` w złotej sieci nie ma ŻADNEJ
    karty katalogowej przekształtnika (`materialized_params is None`), więc
    `_oceb_karte_przeksztaltnika` zwraca `converter_card_missing` ZANIM spojrzy
    na widmo. Gotowość NAZYWA tę przyczynę (karta B-02, 2026-09-10) — przed
    naprawą meldowała „brak widma" z kluczem `harmonic_spectra`, a widmo ręczne
    NIE odblokowuje biegu bez mocy znamionowej (prąd bazowy wstrzyknięcia).
    Brak karty NIE ma klucza parametru: formularz go nie usunie."""
    enm = build_golden_enm()
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.POWER_QUALITY_HARMONICS, {})
    kody = {w.kod for w in wynik.warunki}
    assert "generator.converter_card_missing" in kody
    assert "generator.harmonic_spectrum_missing" not in kody
    assert "zrodla.odksztalcajace" not in kody
    brak = next(w for w in wynik.warunki if w.kod == "generator.converter_card_missing")
    assert brak.spelniony is False
    assert brak.elementy == ("gen_pv",)
    assert brak.klucz_parametru is None
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA


def test_pq_widmo_reczne_nie_odblokowuje_gen_pv_bez_karty() -> None:
    """Widmo ręczne dla generatora BEZ karty: most nadal pomija go CAŁKOWICIE
    (`model.harmonic_sources == []`), a gotowość dalej nazywa brak karty — nie
    udaje, że parametr cokolwiek naprawił (predykaty parami z bramką 422)."""
    enm = build_golden_enm()
    parametry = {"harmonic_spectra": {"gen_pv": {"5": 4.0}}}
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.POWER_QUALITY_HARMONICS, parametry)
    model = build_v126_input_from_enm(enm, parameters=parametry)
    assert model.harmonic_sources == []
    assert model.converters == []
    kody = {w.kod for w in wynik.warunki}
    assert "generator.converter_card_missing" in kody
    assert "generator.harmonic_spectrum_missing" not in kody
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA


def test_pq_karta_bez_widma_jest_brakiem_widma_z_kluczem_parametru() -> None:
    """Klasa „karta bez widma": jedyny przypadek, w którym `harmonic_spectra`
    NAPRAWDĘ usuwa brak — dlatego tylko ten warunek niesie klucz parametru."""
    enm = _zlota_siec_z_karta_pv(klucz_wstrzykniety=None)
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.POWER_QUALITY_HARMONICS, {})
    kody = {w.kod for w in wynik.warunki}
    assert "generator.harmonic_spectrum_missing" in kody
    assert "generator.converter_card_missing" not in kody
    brak = next(w for w in wynik.warunki if w.kod == "generator.harmonic_spectrum_missing")
    assert brak.elementy == ("gen_pv",)
    assert brak.klucz_parametru == "harmonic_spectra"
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA


def test_pq_karta_bez_widma_z_widmem_recznym_jest_potwierdzona() -> None:
    """Domknięcie pary predykatów: parametr wskazany kluczem FAKTYCZNIE usuwa
    brak — po podaniu widma ręcznego most buduje źródło harmoniczne, a gotowość
    jest POTWIERDZONA z warunkiem `zrodla.odksztalcajace` spełnionym."""
    enm = _zlota_siec_z_karta_pv(klucz_wstrzykniety=None)
    parametry = {"harmonic_spectra": {"gen_pv": {"5": 4.5, "7": 2.1}}}
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.POWER_QUALITY_HARMONICS, parametry)
    model = build_v126_input_from_enm(enm, parameters=parametry)
    assert [z.source_ref for z in model.harmonic_sources] == ["gen_pv"]
    zrodla = next(w for w in wynik.warunki if w.kod == "zrodla.odksztalcajace")
    assert zrodla.spelniony is True
    assert zrodla.elementy == ("gen_pv",)
    assert wynik.gotowosc == GOTOWOSC_POTWIERDZONA


def test_pq_klucz_widma_wstrzykniety_do_karty_nie_potwierdza_gotowosci() -> None:
    """Przepisany w karcie AB-H0 (dawniej: „karta z widmem katalogowym jest
    potwierdzona bez parametrów"). Pole `ConverterType.harmonic_spectrum_percent`
    skasowane — klucz w karcie elementu może pochodzić wyłącznie z wstrzyknięcia mimo
    katalogu i NIE jest widmem: gotowość melduje brak widma z kluczem parametru, tak
    samo jak bieg (ten sam predykat, `pominiete_zrodla_v126`)."""
    enm = _zlota_siec_z_karta_pv(klucz_wstrzykniety={5: 4.5, 7: 2.1})
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.POWER_QUALITY_HARMONICS, {})
    assert build_v126_input_from_enm(enm).harmonic_sources == []
    brak = next(w for w in wynik.warunki if w.kod == "generator.harmonic_spectrum_missing")
    assert brak.elementy == ("gen_pv",)
    assert brak.klucz_parametru == "harmonic_spectra"
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA


def test_pq_widmo_reczne_czesciowo_bledne_nie_potwierdza_gotowosci() -> None:
    """Gotowość ekranu = bieg: widmo ręczne z jednym błędnym wpisem (rząd 51) jest
    odrzucane W CAŁOŚCI przez most (zero częściowego czyszczenia) — gotowość nie może
    go potwierdzić, a bieg nie dostaje źródła."""
    enm = _zlota_siec_z_karta_pv(klucz_wstrzykniety=None)
    parametry = {"harmonic_spectra": {"gen_pv": {"5": 4.5, "51": 1.0}}}
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.POWER_QUALITY_HARMONICS, parametry)
    assert build_v126_input_from_enm(enm, parameters=parametry).harmonic_sources == []
    brak = next(w for w in wynik.warunki if w.kod == "generator.harmonic_spectrum_missing")
    assert brak.elementy == ("gen_pv",)
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA


def test_pq_brak_karty_i_karta_bez_widma_w_jednym_modelu_sa_dwoma_warunkami() -> None:
    """Iloczyn cech w JEDNYM modelu: `gen_pv` bez karty + `gen_pv2` z kartą bez
    widma → DWA osobne braki, każdy z właściwymi elementami; wyłącznie brak widma
    niesie klucz parametru. Pin deklaracji z kodu: przy pustym
    `model.harmonic_sources` KAŻDY kandydat trafia dokładnie do jednego z dwóch
    warunków (suma elementów = komplet kandydatów, bez powtórzeń)."""
    enm = _zlota_siec_z_drugim_pv_bez_widma()
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.POWER_QUALITY_HARMONICS, {})
    po_kodzie = {w.kod: w for w in wynik.warunki}
    assert po_kodzie["generator.converter_card_missing"].elementy == ("gen_pv",)
    assert po_kodzie["generator.converter_card_missing"].klucz_parametru is None
    assert po_kodzie["generator.harmonic_spectrum_missing"].elementy == ("gen_pv2",)
    assert po_kodzie["generator.harmonic_spectrum_missing"].klucz_parametru == "harmonic_spectra"
    elementy = (
        po_kodzie["generator.converter_card_missing"].elementy
        + po_kodzie["generator.harmonic_spectrum_missing"].elementy
    )
    assert sorted(elementy) == ["gen_pv", "gen_pv2"]
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA


def test_pq_widmo_reczne_dla_gen_pv2_zostawia_gen_pv_bez_karty_jako_uwage() -> None:
    """Po uzupełnieniu widma dla `gen_pv2` bieg ma źródło harmoniczne, a `gen_pv`
    (bez karty) jest POMINIĘTY jako uwaga niebłokująca (`zrodla.pominiete`) —
    bieg przechodzi z nazwanym pominięciem, nie z cichym zerem."""
    enm = _zlota_siec_z_drugim_pv_bez_widma()
    parametry = {"harmonic_spectra": {"gen_pv2": {"5": 3.0}}}
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.POWER_QUALITY_HARMONICS, parametry)
    po_kodzie = {w.kod: w for w in wynik.warunki}
    assert po_kodzie["zrodla.odksztalcajace"].spelniony is True
    assert po_kodzie["zrodla.pominiete"].blokujacy is False
    assert po_kodzie["zrodla.pominiete"].elementy == ("gen_pv",)
    # Opis nazywa pominięty generator nazwą z modelu; identyfikator zostaje w `elementy`
    # (karta #144).
    nazwa_gen_pv = next(g.name for g in enm.generators if g.ref_id == "gen_pv")
    assert nazwa_gen_pv and nazwa_gen_pv in po_kodzie["zrodla.pominiete"].opis_pl
    assert "gen_pv" not in po_kodzie["zrodla.pominiete"].opis_pl
    assert wynik.gotowosc == GOTOWOSC_POTWIERDZONA
    assert [w.kod for w in wynik.uwagi] == ["zrodla.pominiete"]


# ---------------------------------------------------------------------------
# 3. SSCI
# ---------------------------------------------------------------------------


def test_ssci_brak_karty_przeksztaltnika_na_gen_pv() -> None:
    enm = build_golden_enm()
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.SSCI_IMPEDANCE, {})
    brak = next(w for w in wynik.warunki if w.kod == "generator.converter_card_missing")
    assert brak.elementy == ("gen_pv",)
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA


# ---------------------------------------------------------------------------
# 4. Niezawodność / customer_counts (iloczyn cech: wpis poprawny x błędny x mieszany)
# ---------------------------------------------------------------------------


def test_niezawodnosc_bez_customer_counts_jest_niepotwierdzona() -> None:
    enm = build_golden_enm()
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.RELIABILITY_CONTINGENCY, {})
    brak = next(w for w in wynik.warunki if w.kod == "parametr.customer_counts")
    assert brak.spelniony is False
    assert brak.klucz_parametru == "customer_counts"
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA


def test_niezawodnosc_z_poprawnym_wpisem_jest_potwierdzona_bez_fabrykacji() -> None:
    enm = build_golden_enm()
    ref = "bus_sn_c"
    wynik = ocen_gotowosc_v126(
        enm, V126AnalysisType.RELIABILITY_CONTINGENCY, {"customer_counts": {ref: 120}}
    )
    assert wynik.gotowosc == GOTOWOSC_POTWIERDZONA
    warunek = next(w for w in wynik.warunki if w.kod == "parametr.customer_counts")
    assert warunek.spelniony is True
    assert warunek.elementy == (ref,)
    # Zero fabrykacji: `dane_z_modelu` niesie tylko dane FAKTYCZNIE odczytane z
    # modelu (szyny/gałęzie/transformatory/częstotliwość) — żadna pozycja nie
    # wymyśla liczby odbiorców, której model nie niesie.
    nazwy_danych = {d.nazwa_pl for d in wynik.dane_z_modelu}
    assert not any("odbior" in nazwa.lower() for nazwa in nazwy_danych)


@pytest.mark.parametrize(
    "nazwa_przypadku,wpis",
    [
        ("ujemny", {"bus_sn_c": -1}),
        ("float_niecalkowity", {"bus_sn_c": 1.5}),
        ("string", {"bus_sn_c": "x"}),
        ("bool", {"bus_sn_c": True}),
        ("szyna_spoza_modelu", {"NIE-MA-TAKIEJ-SZYNY": 5}),
    ],
)
def test_niezawodnosc_odrzuca_bledny_wpis_customer_counts(nazwa_przypadku: str, wpis: dict) -> None:
    enm = build_golden_enm()
    wynik = ocen_gotowosc_v126(
        enm, V126AnalysisType.RELIABILITY_CONTINGENCY, {"customer_counts": wpis}
    )
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA, nazwa_przypadku
    warunek = next(w for w in wynik.warunki if w.kod == "parametr.customer_counts")
    assert warunek.spelniony is False, nazwa_przypadku
    klucz_wpisu = next(iter(wpis))
    assert klucz_wpisu in warunek.elementy, nazwa_przypadku


def test_niezawodnosc_wpis_bledny_i_poprawny_jednoczesnie_odrzucony_nie_znika() -> None:
    """Iloczyn cech: błędny wpis + poprawny wpis w JEDNYM `customer_counts` —
    odrzucony wpis NIE znika pod poprawnym (żaden ciche pominięcie)."""
    enm = build_golden_enm()
    dobry_ref = "bus_sn_c"
    zly_ref = "NIE-MA-TAKIEJ-SZYNY"
    wynik = ocen_gotowosc_v126(
        enm,
        V126AnalysisType.RELIABILITY_CONTINGENCY,
        {"customer_counts": {dobry_ref: 120, zly_ref: 5}},
    )
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA
    warunek = next(w for w in wynik.warunki if w.kod == "parametr.customer_counts")
    assert warunek.spelniony is False
    assert zly_ref in warunek.elementy


def test_most_ustawia_customer_count_tylko_poprawnym_wpisom_zero_pozostalym() -> None:
    """`build_v126_input_from_enm` — TEN SAM odczyt co gotowość (predykaty parami):
    wpis błędny/spoza modelu NIE PODNOSI wyjątku, tylko zeruje pozostałe szyny."""
    enm = build_golden_enm()
    dobry_ref = "bus_sn_c"
    model = build_v126_input_from_enm(
        enm, parameters={"customer_counts": {dobry_ref: 120, "NIE-MA-TAKIEJ-SZYNY": 5}}
    )
    licznosci = {bus.ref: bus.customer_count for bus in model.buses}
    assert licznosci[dobry_ref] == 120
    assert all(v == 0 for ref, v in licznosci.items() if ref != dobry_ref)


# ---------------------------------------------------------------------------
# 5. Uziom stacji (11 kluczy wymaganych)
# ---------------------------------------------------------------------------

_UZIOM_KOMPLETNY: dict[str, float] = {
    "rho1_ohm_m": 100.0,
    "length_m": 60.0,
    "width_m": 40.0,
    "mesh_spacing_m": 6.0,
    "buried_depth_m": 0.6,
    "rods_total_length_m": 40.0,
    "split_factor": 0.65,
    "fault_current_ka": 10.0,
    "fault_clearing_time_s": 0.5,
    "surface_layer_rho_ohm_m": 2500.0,
    "surface_layer_derating": 0.74,
}


def test_uziom_brak_parametru_wymienia_wszystkie_11_kluczy_po_polsku() -> None:
    """Komunikat cytuje KATALOG (`nazwa_parametru_pl`), nie surowe klucze Pythona
    — `rho1_ohm_m` na ekranie łamałoby `prezentacja.straznik.test.tsx`."""
    enm = build_golden_enm()
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.EARTHING_SAFETY, {})
    warunek = next(w for w in wynik.warunki if w.kod == "parametr.earthing")
    assert warunek.spelniony is False
    for klucz in _UZIOM_KOMPLETNY:
        assert klucz not in warunek.opis_pl, (klucz, warunek.opis_pl)
    assert _WZORZEC_IDENTYFIKATORA_Z_PODKRESLENIEM.search(warunek.opis_pl) is None, warunek.opis_pl
    assert "Rezystywność warstwy górnej gruntu" in warunek.opis_pl
    assert "Długość uziomu kratowego" in warunek.opis_pl
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA


def test_uziom_komplet_11_kluczy_jest_potwierdzony() -> None:
    enm = build_golden_enm()
    wynik = ocen_gotowosc_v126(
        enm, V126AnalysisType.EARTHING_SAFETY, {"earthing": dict(_UZIOM_KOMPLETNY)}
    )
    assert wynik.gotowosc == GOTOWOSC_POTWIERDZONA


@pytest.mark.parametrize("brakujacy_klucz", list(_UZIOM_KOMPLETNY))
def test_uziom_brak_jednego_klucza_wymienia_dokladnie_ta_polska_nazwe(brakujacy_klucz: str) -> None:
    enm = build_golden_enm()
    niekompletny = dict(_UZIOM_KOMPLETNY)
    del niekompletny[brakujacy_klucz]
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.EARTHING_SAFETY, {"earthing": niekompletny})
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA
    warunek = next(w for w in wynik.warunki if w.kod == "parametr.earthing")
    nazwa_pl = nazwa_parametru_pl("earthing_safety", f"earthing.{brakujacy_klucz}")
    # Pozostałe 10 kluczy są kompletne -> komunikat wymienia DOKŁADNIE polską
    # nazwę tego jednego brakującego parametru (nie surowy klucz Pythona).
    assert warunek.opis_pl == f"Brak danych uziomu stacji: {nazwa_pl}"
    assert brakujacy_klucz not in warunek.opis_pl


# ---------------------------------------------------------------------------
# 6. Izolacja
# ---------------------------------------------------------------------------


def test_izolacja_zlota_siec_bez_ogranicznikow_jest_niepotwierdzona() -> None:
    enm = build_golden_enm()
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.INSULATION_COORDINATION, {})
    warunek = next(w for w in wynik.warunki if w.kod == "model.ograniczniki")
    assert warunek.spelniony is False
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA


# ---------------------------------------------------------------------------
# 7. Detekcja zwarć doziemnych / TRV / punkt neutralny — propozycje z modelu
#    (iloczyn cech: obecność uziemienia w modelu x rodzaj x parametr projektanta)
# ---------------------------------------------------------------------------


def _warunek_uziemienia(wynik: GotowoscAnalizy) -> Warunek:
    return next(w for w in wynik.warunki if w.kod == "model.uziemienie_sn")


def test_detekcja_zlota_siec_bez_zespolu_to_siec_izolowana_z_modelu() -> None:
    """Złota sieć: transformator 110/15 kV YNd11 (uzwojenie SN w trójkącie), brak zespołu
    uziemiającego — sieć SN izolowana WYPROWADZONA z modelu (ta sama prawda co składowa
    zerowa). Sposób uziemienia nie jest ani parametrem, ani propozycją."""
    wynik = ocen_gotowosc_v126(build_golden_enm(), V126AnalysisType.EARTH_FAULT_DETECTION, {})
    assert "neutral_grounding" not in wynik.proponowane
    warunek = _warunek_uziemienia(wynik)
    assert warunek.spelniony is True
    assert "izolowan" in warunek.opis_pl
    assert not any(w.kod == "parametr.neutral_grounding" for w in wynik.warunki)


@pytest.mark.parametrize(("wariant", "fraza"), [("dlawik", "dławik"), ("rezystor", "rezystor")])
def test_detekcja_siec_z_zespolem_czyta_wariant_z_modelu(wariant: str, fraza: str) -> None:
    wynik = ocen_gotowosc_v126(
        _zlota_siec_z_zespolem(wariant), V126AnalysisType.EARTH_FAULT_DETECTION, {}
    )
    warunek = _warunek_uziemienia(wynik)
    assert warunek.spelniony is True and fraza in warunek.opis_pl
    dane = {d.nazwa_pl: d.wartosc_pl for d in wynik.dane_z_modelu}
    assert fraza in dane["Uziemienie punktu neutralnego sieci SN"]


@pytest.mark.parametrize(
    ("rodzaj", "blokujacy"),
    [
        (V126AnalysisType.EARTH_FAULT_DETECTION, True),
        (V126AnalysisType.NEUTRAL_EARTHING_DESIGN, True),
        # Napięcie powrotne i prąd załączania liczą się bez uziemienia — ferrorezonans
        # zostaje nieoceniony (solver: `brak_danych`), więc warunek NIEBLOKUJĄCY.
        (V126AnalysisType.TRANSIENT_TRV, False),
    ],
)
def test_zespol_bez_elementu_to_nazwany_brak_modelu(
    rodzaj: V126AnalysisType, blokujacy: bool
) -> None:
    wynik = ocen_gotowosc_v126(_zlota_siec_z_zespolem("bez_elementu"), rodzaj, {})
    warunek = _warunek_uziemienia(wynik)
    assert warunek.spelniony is False
    assert warunek.blokujacy is blokujacy
    assert "Zespół uziemiający GPZ" in warunek.opis_pl


def test_trv_proponuje_breaker_rated_voltage_kv_jako_u_m_sieci_sn() -> None:
    """U_r wyłącznika = U_m sieci SN (IEC 60038 tab. 3–5, IEC 62271-1), nie najwyższe napięcie
    szyny modelu: sieć złota GPZ 110/15 kV → 17,5 kV (dawniej 110 kV — wyłącznik SN oceniany
    obwiednią aparatu WN)."""
    enm = build_golden_enm()
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.TRANSIENT_TRV, {})
    propozycja = wynik.proponowane["breaker_rated_voltage_kv"]
    assert propozycja.wartosc == 17.5
    assert "sieci SN 15 kV" in propozycja.zrodlo_pl
    assert "IEC 60038" in propozycja.zrodlo_pl and "IEC 62271-1" in propozycja.zrodlo_pl
    warunek = {w.kod: w for w in wynik.warunki}["parametr.breaker_rated_voltage_kv"]
    assert warunek.spelniony is True


@pytest.mark.parametrize(
    ("napiecia_kv", "oczekiwane"),
    [((110.0,), 123.0), ((20.0, 0.4), 24.0), ((0.4,), None), ((), None)],
    ids=["tylko-WN", "SN-i-nN", "tylko-nN", "bez-szyn"],
)
def test_trv_propozycja_u_r_iloczyn_pasm(
    napiecia_kv: tuple[float, ...], oczekiwane: float | None
) -> None:
    """Iloczyn: pasma szyn modelu {WN, SN+nN, nN, brak} — U_m z jedynej tabeli
    (``napiecie_najwyzsze_sieci_kv``); nN i model bez szyn → brak propozycji, a warunek
    parametru U_r jest BLOKUJĄCY (solver nie podstawia domyślnego U_r)."""
    from application.analyses.v126_gotowosc import _propozycja_napiecia_wylacznika
    from enm.models import Bus, EnergyNetworkModel, ENMHeader

    enm = EnergyNetworkModel(
        header=ENMHeader(name="TRV"),
        buses=[Bus(ref_id=f"s{i}", name=f"S{i}", voltage_kv=u) for i, u in enumerate(napiecia_kv)],
    )
    propozycja = _propozycja_napiecia_wylacznika(enm)
    assert (None if propozycja is None else propozycja.wartosc) == oczekiwane
    if oczekiwane is None and napiecia_kv:
        wynik = ocen_gotowosc_v126(enm, V126AnalysisType.TRANSIENT_TRV, {})
        warunek = {w.kod: w for w in wynik.warunki}["parametr.breaker_rated_voltage_kv"]
        assert warunek.spelniony is False and warunek.blokujacy is True


def test_neutral_earthing_design_bez_zespolu_to_brak_modelu_nie_propozycja() -> None:
    """§0 pkt 4: brak zespołu uziemiającego w sekcji jest brakiem MODELU, a nie wartością
    proponowaną — projekt dławika/rezystora dotyczy zespołu."""
    wynik = ocen_gotowosc_v126(build_golden_enm(), V126AnalysisType.NEUTRAL_EARTHING_DESIGN, {})
    assert "neutral_earthing_type" not in wynik.proponowane
    warunek = _warunek_uziemienia(wynik)
    assert warunek.spelniony is False and warunek.blokujacy is True
    assert "zamodeluj zespół uziemiający" in warunek.opis_pl
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA


def test_neutral_earthing_design_z_dlawikiem_potwierdzona_bez_parametrow_rezystora() -> None:
    wynik = ocen_gotowosc_v126(
        _zlota_siec_z_zespolem("dlawik"), V126AnalysisType.NEUTRAL_EARTHING_DESIGN, {}
    )
    assert _warunek_uziemienia(wynik).spelniony is True
    assert not any(w.kod.startswith("parametr.ner_") for w in wynik.warunki)
    assert wynik.gotowosc == GOTOWOSC_POTWIERDZONA


def test_neutral_earthing_design_z_rezystorem_czyta_rezystor_modelu() -> None:
    """Schemat rezystorowy z WARIANTU MODELU — ten sam predykat co solver
    (`PROJEKT_UZIEMIENIA_WARIANTU`). Rezystor (R, I_n, t_n) jest daną zespołu w modelu, więc
    gotowość nie żąda „docelowego prądu doziemienia" ani „energii znamionowej" (karta
    UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 4); czas wyłączenia jest uwagą, nie blokadą."""
    enm = _zlota_siec_z_zespolem("rezystor")
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.NEUTRAL_EARTHING_DESIGN, {})
    kody = {w.kod: w for w in wynik.warunki}
    assert {k for k in kody if k.startswith("parametr.")} == {"parametr.ner_clearing_time_s"}
    czas = kody["parametr.ner_clearing_time_s"]
    assert czas.spelniony is False and czas.blokujacy is False
    rezystory = [d for d in wynik.dane_z_modelu if d.nazwa_pl.startswith("Rezystor punktu")]
    assert len(rezystory) == 1 and "R = " in rezystory[0].wartosc_pl
    pelne = ocen_gotowosc_v126(
        enm, V126AnalysisType.NEUTRAL_EARTHING_DESIGN, {"ner_clearing_time_s": 1.0}
    )
    assert {w.kod: w.spelniony for w in pelne.warunki}["parametr.ner_clearing_time_s"] is True
    # Czas wyłączenia nie zmienia gotowości (uwaga, nie blokada) — ta sama lista braków.
    assert pelne.gotowosc == wynik.gotowosc
    assert {w.kod for w in pelne.braki} == {w.kod for w in wynik.braki}


def test_uzupelnij_parametry_wstawia_propozycje_tylko_gdy_brak_wejscia_projektanta() -> None:
    """`uzupelnij_parametry_z_modelu` — iloczyn cech: {obecność propozycji w
    modelu} x {parametr projektanta nieobecny / jawny / zero}. `_obecna` traktuje
    `0`/`False` jako WARTOŚĆ OBECNĄ (projektant wygrywa). Sposób uziemienia sieci SN nie
    jest propozycją w ŻADNYM wariancie modelu (karta UX-04/POLE-ZU §0 pkt 4)."""
    for enm in (build_golden_enm(), _zlota_siec_z_zespolem("dlawik")):
        for rodzaj in V126AnalysisType:
            scalone = uzupelnij_parametry_z_modelu(enm, rodzaj, {})
            assert "neutral_grounding" not in scalone
            assert "neutral_earthing_type" not in scalone

    enm = build_golden_enm()
    scalone = uzupelnij_parametry_z_modelu(enm, V126AnalysisType.TRANSIENT_TRV, {})
    assert scalone["breaker_rated_voltage_kv"] == 17.5

    # Projektant podał 0 (liczbowo "fałszywe", ale OBECNE wg `_obecna`) na polu
    # opcjonalnym (TRV) -> 0 WYGRYWA z propozycją modelu (17,5).
    scalone = uzupelnij_parametry_z_modelu(
        enm, V126AnalysisType.TRANSIENT_TRV, {"breaker_rated_voltage_kv": 0}
    )
    assert scalone["breaker_rated_voltage_kv"] == 0


# ---------------------------------------------------------------------------
# 8. Silniki
# ---------------------------------------------------------------------------

_SILNIK_KOMPLETNY: dict[str, object] = {
    "ref": "M1",
    "bus_ref": "bus_sn_c",
    "rated_kw": 200.0,
    "rated_voltage_kv": 15.0,
    "locked_rotor_multiplier": 6.0,
    "start_power_factor": 0.22,
    "start_time_s": 8.0,
    "allowable_locked_rotor_time_s": 20.0,
    "max_torque_pu": 2.0,
    "critical_slip": 0.2,
    "load_start_torque_pu": 0.6,
}


def test_silniki_brak_jest_niepotwierdzony() -> None:
    enm = build_golden_enm()
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.MOTOR_STARTING, {})
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA
    warunek = next(w for w in wynik.warunki if w.kod == "parametr.motors")
    assert warunek.spelniony is False


def test_silniki_jeden_kompletny_wiersz_jest_potwierdzony() -> None:
    enm = build_golden_enm()
    wynik = ocen_gotowosc_v126(
        enm, V126AnalysisType.MOTOR_STARTING, {"motors": [dict(_SILNIK_KOMPLETNY)]}
    )
    assert wynik.gotowosc == GOTOWOSC_POTWIERDZONA


def test_silniki_wiersz_niekompletny_wymienia_brakujace_pola_po_polsku() -> None:
    """Komunikat cytuje KATALOG (`nazwa_parametru_pl`), nie surowy klucz Pythona
    `rated_kw` — ten sam defekt i ta sama naprawa co uziom (KLASA, nie instancja)."""
    enm = build_golden_enm()
    niekompletny = dict(_SILNIK_KOMPLETNY)
    del niekompletny["rated_kw"]
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.MOTOR_STARTING, {"motors": [niekompletny]})
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA
    warunek = next(w for w in wynik.warunki if w.kod == "parametr.motors")
    assert "rated_kw" not in warunek.opis_pl
    assert _WZORZEC_IDENTYFIKATORA_Z_PODKRESLENIEM.search(warunek.opis_pl) is None, warunek.opis_pl
    # Silnik ZIDENTYFIKOWANY (ref obecny) -> komunikat cytuje jego ref wprost;
    # pole brakujące cytuje polską nazwę z katalogu.
    assert warunek.opis_pl == "Dane silników niekompletne — silnik M1: Moc znamionowa"


def test_silniki_bez_pola_ref_dostaje_etykiete_pozycji_nie_fabrykowany_numer() -> None:
    """Naprawa u źródła (`solver_input_substitute_guard`, karta §7 — znalezisko
    przy weryfikacji, nie w karcie): `indeks + 1` NIE MOŻE udawać `ref`, którego
    projektant nie podał — inaczej komunikat „silnik 1: …" jest nieodróżnialny
    od realnego oznaczenia silnika o nazwie „1". Brak `ref` dostaje jawną
    etykietę pozycji, nie liczbę z powietrza (iloczyn cech: brak `ref` × brak
    innego pola jednocześnie — DRUGI brak nie znika pod etykietą), obie po
    polsku (ten sam defekt klasy co uziom, ta sama naprawa)."""
    enm = build_golden_enm()
    silnik_bez_ref = dict(_SILNIK_KOMPLETNY)
    del silnik_bez_ref["ref"]
    del silnik_bez_ref["rated_kw"]
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.MOTOR_STARTING, {"motors": [silnik_bez_ref]})
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA
    warunek = next(w for w in wynik.warunki if w.kod == "parametr.motors")
    # Etykieta pozycji (nie fabrykowany numer-jako-ref) I obie brakujące pola
    # naraz — DRUGI brak (rated_kw) nie znika pod etykietą pierwszego.
    assert warunek.opis_pl == (
        "Dane silników niekompletne — silnik pozycja 1 (brak pola „Oznaczenie silnika”): "
        "Oznaczenie silnika, Moc znamionowa"
    )
    assert "ref" not in warunek.opis_pl.replace("Oznaczenie silnika", "")
    assert "rated_kw" not in warunek.opis_pl
    assert _WZORZEC_IDENTYFIKATORA_Z_PODKRESLENIEM.search(warunek.opis_pl) is None, warunek.opis_pl


def _fragment_goly(klucz_katalogu: str) -> str:
    """`earthing.rho1_ohm_m` -> `rho1_ohm_m`; `motors[].ref` -> `ref` (ostatni
    segment po kropce/nawiasie — ten sam rozbiór, co `_klucz_bazowy` w teście
    katalogu, ale ostatni segment, nie pierwszy: tu szukamy KOŃCÓWKI klucza,
    którą warunek mógłby wprost wstawić w zdanie)."""
    return re.split(r"[.\[]", klucz_katalogu)[-1].rstrip("]")


def test_zaden_komunikat_niespelnionego_warunku_nie_cytuje_surowego_klucza_katalogu() -> None:
    """KLASA, nie instancja (dyrektywa architekta po znalezisku w uziomie i
    silnikach): iloczyn cech KAŻDY rodzaj katalogu × KAŻDY jego parametr
    `od_uzytkownika` — komunikat warunku NIESPEŁNIONEGO nigdy nie cytuje
    surowego klucza Pythona tego parametru. Iteracja PO KATALOGU
    (`KATALOG_ANALIZ_V126`), nie po przykładzie z karty: rodzaj dopisany w
    przyszłości z nowym parametrem wchodzi do tej kontroli automatycznie."""
    enm = build_golden_enm()
    naruszenia: list[str] = []
    for karta in KATALOG_ANALIZ_V126:
        rodzaj = V126AnalysisType(karta.kod)
        wynik = ocen_gotowosc_v126(enm, rodzaj, {})
        teksty_niespelnionych = [w.opis_pl for w in wynik.warunki if not w.spelniony]
        for parametr in karta.od_uzytkownika:
            fragment = _fragment_goly(parametr.klucz)
            wzorzec = re.compile(r"\b" + re.escape(fragment) + r"\b")
            for tekst in teksty_niespelnionych:
                if wzorzec.search(tekst):
                    naruszenia.append(
                        f"{karta.kod}: klucz {parametr.klucz!r} (fragment {fragment!r}) "
                        f"w komunikacie {tekst!r}"
                    )
    assert naruszenia == [], "\n".join(naruszenia)


# ---------------------------------------------------------------------------
# 8b. Częstotliwość sieci — jedno źródło prawdy (przedmiot_modelu <-> dane_z_modelu)
# ---------------------------------------------------------------------------


def test_czestotliwosc_modelu_honest_none_gdy_zadna_szyna_jej_nie_niesie() -> None:
    enm = build_golden_enm()
    assert czestotliwosc_modelu(enm) is None


def test_czestotliwosc_modelu_realna_gdy_szyna_ja_niesie() -> None:
    enm = build_golden_enm().model_copy(deep=True)
    enm.buses[0].frequency_hz = 50.0
    assert czestotliwosc_modelu(enm) == 50.0


def test_przedmiot_i_dane_z_modelu_zgadzaja_sie_co_do_czestotliwosci_bez_niej() -> None:
    """Test parami (KLASA §3): `przedmiot_modelu` i `_dane_z_modelu` muszą się
    zgadzać, że częstotliwości NIE MA w modelu — przed naprawą pierwsza mówiła
    uczciwie `None`, druga fabrykowała „50 Hz” jako dana odczytana z modelu."""
    enm = build_golden_enm()
    assert przedmiot_modelu(enm)["czestotliwosc_hz"] is None
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.UNCERTAINTY_SENSITIVITY, {})
    dana = next(d for d in wynik.dane_z_modelu if d.nazwa_pl == "Częstotliwość sieci")
    assert dana.wartosc_pl == "brak w modelu — solver przyjmie 50 Hz jako wartość domyślną"
    assert dana.wartosc_pl != "50 Hz"


def test_przedmiot_i_dane_z_modelu_zgadzaja_sie_co_do_czestotliwosci_z_nia() -> None:
    enm = build_golden_enm().model_copy(deep=True)
    enm.buses[0].frequency_hz = 60.0
    assert przedmiot_modelu(enm)["czestotliwosc_hz"] == 60.0
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.UNCERTAINTY_SENSITIVITY, {})
    dana = next(d for d in wynik.dane_z_modelu if d.nazwa_pl == "Częstotliwość sieci")
    assert dana.wartosc_pl == "60 Hz"


# ---------------------------------------------------------------------------
# 9. Niepewność
# ---------------------------------------------------------------------------


def test_niepewnosc_zlota_siec_jest_potwierdzona() -> None:
    enm = build_golden_enm()
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.UNCERTAINTY_SENSITIVITY, {})
    assert wynik.gotowosc == GOTOWOSC_POTWIERDZONA


def test_niepewnosc_siec_bez_galezi_trafo_mocy_zwarciowej_jest_niepotwierdzona() -> None:
    enm = _model_bez_galezi_trafo_mocy_zwarciowej()
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.UNCERTAINTY_SENSITIVITY, {})
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA
    warunek = next(w for w in wynik.warunki if w.kod == "model.parametry_propagacji")
    assert warunek.spelniony is False


# ---------------------------------------------------------------------------
# 10. Wspólny warunek: model bez szyn
# ---------------------------------------------------------------------------


def test_model_bez_szyn_daje_niepotwierdzone_z_dosłownym_komunikatem() -> None:
    enm = _model_bez_szyn()
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.POWER_QUALITY_HARMONICS, {})
    assert wynik.gotowosc == GOTOWOSC_NIEPOTWIERDZONA
    warunek = next(w for w in wynik.warunki if w.kod == "model.wezly")
    assert warunek.opis_pl == BRAK_WEZLOW_PL


# ---------------------------------------------------------------------------
# 11. komunikat_odmowy() i kontrakt to_dict()
# ---------------------------------------------------------------------------


def test_komunikat_odmowy_zawiera_kazdy_kod_braku_i_elementy() -> None:
    enm = build_golden_enm()
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.POWER_QUALITY_HARMONICS, {})
    komunikat = wynik.komunikat_odmowy()
    for brak in wynik.braki:
        assert brak.kod in komunikat
        assert brak.opis_pl in komunikat
        for element in brak.elementy:
            assert element in komunikat


def test_gotowosc_analizy_to_dict_ma_dokladnie_kontraktowe_klucze() -> None:
    enm = build_golden_enm()
    wynik = ocen_gotowosc_v126(enm, V126AnalysisType.MOTOR_STARTING, {})
    d = wynik.to_dict()
    assert set(d.keys()) == {
        "kod",
        "gotowosc",
        "warunki",
        "braki",
        "uwagi",
        "dane_z_modelu",
        "proponowane",
        "powod_wycofania_pl",
    }


# ---------------------------------------------------------------------------
# 12. przedmiot_modelu
# ---------------------------------------------------------------------------


def test_przedmiot_modelu_zlotej_sieci() -> None:
    enm = build_golden_enm()
    przedmiot = przedmiot_modelu(enm)
    assert przedmiot["liczba_szyn"] == 5
    assert przedmiot["poziomy_napiec_kv"] == [0.4, 15.0, 110.0]
    # Nazwa z modelu, nie przepisana ręcznie (karta PL-ZNAKI).
    nazwa_szyny = next(b.name for b in enm.buses if b.ref_id == "bus_hv")
    assert przedmiot["punkt_przylaczenia"] == {
        "ref": "bus_hv",
        "nazwa": nazwa_szyny,
        "zrodlo": "src_gpz",
    }


# ---------------------------------------------------------------------------
# 13. Determinizm
# ---------------------------------------------------------------------------


def test_gotowosc_wszystkich_jest_deterministyczna() -> None:
    enm = build_golden_enm()
    pierwsze = [g.to_dict() for g in gotowosc_wszystkich(enm, {})]
    drugie = [g.to_dict() for g in gotowosc_wszystkich(enm, {})]
    assert pierwsze == drugie


# ---------------------------------------------------------------------------
# 14. §1: parytet listy-wszystkich vs scalania per rodzaj (karta B02-BE-TESTY §1)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "enm_budowniczy",
    [build_golden_enm, _zlota_siec_z_zespolem],
    ids=["zlota_siec", "zlota_siec_z_zespolem_uziemiajacym"],
)
def test_lista_wszystkich_rodzajow_jest_zgodna_z_wynikiem_scalania_per_rodzaj(
    enm_budowniczy,
) -> None:
    """§1: `GET …/v126/gotowosc` bez `analysis_type` (`gotowosc_wszystkich`, BEZ
    jawnego scalania per rodzaj) musi dawać DOKŁADNIE to samo, co scalanie
    (`uzupelnij_parametry_z_modelu`) + ocena pojedynczego rodzaju — czyli
    dokładnie to, co robi GET z `analysis_type` i POST. Sprawdzone na sieci BEZ
    i Z zespołem uziemiającym SN (warunek `model.uziemienie_sn` z obu stron)."""
    enm = enm_budowniczy()
    bez_scalania = gotowosc_wszystkich(enm, {})
    ze_scalaniem = [
        ocen_gotowosc_v126(enm, rodzaj, uzupelnij_parametry_z_modelu(enm, rodzaj, {}))
        for rodzaj in V126AnalysisType
    ]
    for a, b in zip(bez_scalania, ze_scalaniem, strict=True):
        assert a.to_dict() == b.to_dict(), a.kod


@pytest.mark.parametrize("metody", [None, [], ["wattmetric"]], ids=["brak", "pusta", "podane"])
def test_wyposazenie_przekaznika_jest_uwaga_nie_blokerem(metody: list[str] | None) -> None:
    """Zasada nr 4 × stan parametru {brak, pusta lista, podane}: warunek `parametr.relay_methods`
    nigdy nie blokuje biegu; niespełniony jest uwagą z kluczem parametru do uzupełnienia."""
    parametry = {} if metody is None else {"relay_methods": metody}
    wynik = ocen_gotowosc_v126(
        build_golden_enm(), V126AnalysisType.EARTH_FAULT_DETECTION, parametry
    )
    (warunek,) = (w for w in wynik.warunki if w.kod == "parametr.relay_methods")
    assert warunek.blokujacy is False
    assert warunek.spelniony is bool(metody)
    assert warunek.klucz_parametru == "relay_methods"
    assert (warunek in wynik.uwagi) is (not metody)
    assert wynik.gotowosc == GOTOWOSC_POTWIERDZONA
