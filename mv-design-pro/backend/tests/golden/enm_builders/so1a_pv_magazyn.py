"""Siec wzorcowa G17 — kanoniczny scenariusz odniesienia SO-1A.

PO CO OSOBNA SIEC. Bramka SO-1A (`docs/plan/FINAL_DYNAMICS_CAPABILITY_FREEZE.md`
§0.1) opisuje DOKLADNIE jeden uklad: *„Instalacja PV 2,75 MW i magazyn energii
pracuja w miejscu przylaczenia. W chwili t = 1 s wystepuje zwarcie na szynie SN.
Zabezpieczenie otwiera wylacznik po 180 ms. Po 1 s nastepuje ponowne zalaczenie.
Zbadaj zachowanie sieci przez 10 s."*

Siec G16 (`dynamika_rms.py`) ma PV 1,6 MW i maszyne synchroniczna — zadnego
magazynu — wiec NIE spelnia tego opisu i nazwanie jej rownowaznikiem byloby
podmiana kryterium po fakcie. Dopisanie magazynu do G16 zmienialoby hash modelu,
na ktorym stoja zlote wyniki rozplywu, zwarc i biegu czasowego G16 — dlatego to
NOWA siec, nie modyfikacja cudzej (ta sama zasada, ktora powolala G16).

CO SIEC CWICZY (iloczyn cech, nie jeden przyklad):

* **PV 2,75 MW** (`gen_type: pv_inverter`, rodzina dynamiki `przeksztaltnikowa_gfl`)
  ORAZ **magazyn energii** (`gen_type: bess`, rodzina `magazyn` z przeksztaltnikiem
  tworzacym siec) — obydwa na TEJ SAMEJ szynie przylaczenia. To jest wymaganie
  SO-1A doslownie, nie substytut.
* **wylacznik jako osobny element** (`type: breaker`) miedzy szyna GPZ a polem
  magistralnym — zdarzenia `wylaczenie_galezi` / `zalaczenie_galezi` trafiaja w
  APARAT, ktory w rzeczywistosci otwiera zabezpieczenie, a nie w kabel.
* **zwarcie na szynie SN** pola magistralnego — instalacja widzi zapad przez
  impedancje sieci, a nie zwarcie na wlasnych zaciskach. Zwarcie jest usuwane
  przez ODCIECIE obu stron (wylacznik pola od GPZ i kabel magistrali od stacji),
  bo w pierscieniu zamknietym jest zasilane z dwoch stron (karta AB-1b.1 §0 pkt 4:
  dawne zdjecie zwarcia na szynie stacji, ktora pierscien nadal zasilal, bylo
  zniknieciem luku pod napieciem, a nie skutkiem dzialania aparatu).
* **magistrala SN pracujaca w pierscieniu zamknietym**: szyna stacji jest zasilana
  z dwoch stron — polem magistralnym przez wylacznik oraz przez miejsce
  przylaczenia OZE. Otwarcie pola przenosi zasilanie stacji na druga strone
  pierscienia (szyna pola zostaje obszarem beznapieciowym), a ponowne zalaczenie
  zamyka pierscien z powrotem.
* transformator 110/15 kV z zaczepem POZA znamionowym i grupa Dyn11 (przekladnia
  ZESPOLONA: modul != 1 i kat != 0 rownoczesnie);
* kabel z niezerowa susceptancja poprzeczna i linia napowietrzna (dwie klasy
  galezi podluznej);
* odbior na szynie GPZ i odbior w stacji magistralnej — podzial mocy, ktory
  zmienia droge zasilania w chwili otwarcia wylacznika.

DLACZEGO PIERSCIEN, A NIE PROMIEN Z WYSPA. Promieniowy wariant tej samej sieci
(stacja zasilana wylacznie przez wylacznik) po jego otwarciu zostawia PODSIEC BEZ
ZRODLA albo — gdy OZE jest za wylacznikiem — WYSPE. Jedno i drugie wymaga
rozpoznania wyspy w trakcie biegu i warunku brzegowego wyspy, czyli zdolnosci
**D11 przypisanej w zamrozeniu do fali W6-B**
(`docs/plan/FINAL_DYNAMICS_CAPABILITY_FREEZE.md` §2 i §5). SO-1A dowodzi
deterministycznego wykonania RMS i zdarzen na fali W6-A, wiec jego uklad nie moze
zalezec od zdolnosci nastepnej fali. Pierscien spelnia opis scenariusza (zwarcie
na szynie SN, otwarcie wylacznika, ponowne zalaczenie, 10 s obserwacji) i jest
dobrze postawiony w KAZDEJ chwili biegu: wszystkie odbiory pozostaja zasilane, a
jedyny odcinek bez zasilania — szyna pola miedzy otwartymi aparatami, bez odbiorow
i bez zrodel — jest obszarem beznapieciowym rdzenia (V = 0, karta AB-1b.1, D-16),
a nie wyspa z praca wyspowa (D11 pelne pozostaje zakresem kolejnej fali).

KLASA WYROCZNI. `REGRESSION_ONLY`: siec z dwoma przeksztaltnikami, odbiorami o
stalej mocy i transformatorem z przesunieciem fazowym nie ma rozwiazania
zamknietego. Wyrocznie ANALITYCZNE rdzenia dynamiki zyja na ukladzie
maszyna–szyna sztywna (`tests/network_model/dynamika/uklady.py`); ta siec dowodzi
WYKONANIA SO-1A — lancucha ENM -> rozplyw -> inicjalizacja -> zdarzenia -> RMS —
a nie fizyki modeli urzadzen.

BILANS MOCY (z danych ponizej, przed stratami): wytwarzanie w miejscu
przylaczenia PV 2,75 MW + magazyn 0,50 MW = 3,25 MW wobec odbioru 4,0 MW na
szynie GPZ i 3,2 MW w stacji magistralnej. Sieci nadrzednej brakuje wiec okolo
3,95 MW — zwykla konfiguracja przylacza OZE w sieci SN, a nie ustawienie dobrane
pod ladny przebieg.
"""

from __future__ import annotations

from typing import Any

from tests.catalog_test_helpers import gpz_source_record

#: Proweniencja parametrow dynamicznych: obie instalacje z profilu typowego normy
#: (kontrakt wymaga proweniencji jawnie — brak pola jest brakiem danej, nie skrotem).
_PROWENIENCJA_FALOWNIKA: dict[str, Any] = {
    "zrodlo": "profil_typowy_normy",
    "odniesienie": "IEEE 1547-2018 §5-8; Rozporzadzenie (UE) 2016/631 (NC RfG) art. 13-21",
    "data": None,
}
_PROWENIENCJA_MAGAZYNU: dict[str, Any] = {
    "zrodlo": "profil_typowy_normy",
    "odniesienie": "IEC 62933-2-1:2017 §5; Rozporzadzenie (UE) 2016/631 (NC RfG) art. 13-15",
    "data": None,
}

#: Przeksztaltnik nadazny instalacji PV 2,75 MW — komplet pol kontraktu
#: `PrzeksztaltnikGFL`. Moc znamionowa 3,0 MVA: 2,75 MW przy cos(fi) = 0,917.
PV_GFL_2750_KW: dict[str, Any] = {
    "rodzina": "przeksztaltnikowa_gfl",
    "proweniencja": _PROWENIENCJA_FALOWNIKA,
    "s_n_mva": 3.0,
    "i_max_pu": 1.2,
    "priorytet_ogranicznika": "bierna",
    "pll_kp": 50.0,
    "pll_ki": 500.0,
    "reg_pradu_kp": 1.0,
    "reg_pradu_ki": 100.0,
    "k_frt": 2.0,
    "prog_frt_pu": 0.9,
    "tp_s": 0.02,
    "tiq_s": 0.02,
    "p_odbudowa_pu_na_s": 1.0,
    "p_odbudowa_opoznienie_s": 0.1,
    "droop_p_f_pu": 0.04,
    "martwa_strefa_f_hz": 0.02,
    "droop_q_u_pu": 0.05,
    "martwa_strefa_u_pu": 0.01,
    "u_min_ciagle_pu": 0.85,
    "u_max_ciagle_pu": 1.1,
}

#: Magazyn energii 1 MW / 2 MWh z przeksztaltnikiem TWORZACYM SIEC (VSM).
#:
#: DLACZEGO GFM, A NIE GFL: magazyn jest w SO-1 „srodkiem zaradczym" (zamrozenie,
#: wiersze C4/E7), a rodzina tworzaca siec jest jedyna, ktora wnosi wlasne
#: odniesienie napieciowe i bezwladnosc wirtualna — czyli to, czym magazyn ma
#: wspierac siec przy zapadzie. Druga instalacja na tej samej szynie jest nadazna
#: (GFL), wiec siec cwiczy OBIE rodziny przeksztaltnikow rownoczesnie.
#:
#: OKNO MOCY: baza = s_n_mva przeksztaltnika = 1,25 MVA. Granice zasobnika
#: +/-1000 kW = +/-0,8 pu, rezerwa na regulacje f zweza okno do +/-0,6 pu
#: = +/-0,75 MW. Punkt pracy 0,50 MW (rozladowanie) lezy wewnatrz.
MAGAZYN_GFM_1000_KW: dict[str, Any] = {
    "rodzina": "magazyn",
    "proweniencja": _PROWENIENCJA_MAGAZYNU,
    "e_n_kwh": 2000.0,
    "p_ladowania_max_kw": 1000.0,
    "p_rozladowania_max_kw": 1000.0,
    "sprawnosc_ladowania": 0.95,
    "sprawnosc_rozladowania": 0.95,
    "soc_min": 0.10,
    "soc_max": 0.95,
    "soc_poczatkowy": 0.55,
    # Martwa strefa 0 Hz — i to NIE jest wygodne zaokraglenie. Przeksztaltnik
    # tworzacy siec WYZNACZA czestotliwosc zamiast na nia odpowiadac, wiec nie ma
    # sygnalu, ktory dalo by sie przepuscic przez strefe nieczulosci; biblioteka
    # urzadzen odmawia takiemu ukladowi (`dynamika.parametry_urzadzenia_sprzeczne`).
    # Martwa strefa jest wlasciwoscia zrodla nadaznego (GFL).
    "regulacja_f": {
        "droop_pu": 0.04,
        "martwa_strefa_hz": 0.0,
        "p_rezerwa_pu": 0.2,
    },
    "przeksztaltnik": {
        "rodzina": "przeksztaltnikowa_gfm",
        "proweniencja": _PROWENIENCJA_MAGAZYNU,
        "s_n_mva": 1.25,
        "tryb": "vsm",
        "mp_pu": 0.02,
        "mq_pu": 0.05,
        "h_wirtualne_s": 4.0,
        "d_wirtualne_pu": 20.0,
        "r_wirtualne_pu": 0.02,
        "x_wirtualne_pu": 0.15,
        "i_max_pu": 1.2,
        "strategia_ograniczenia": "impedancja_wirtualna",
        "tp_s": 0.02,
        "tiq_s": 0.02,
    },
}


def build_so1a_pv_magazyn_enm() -> dict[str, Any]:
    """Migawka ENM sieci G17 — slownik walidujacy sie jako `EnergyNetworkModel`."""
    return {
        "header": {
            "name": "G17 — scenariusz odniesienia SO-1A (PV 2,75 MW + magazyn energii)",
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "7b2e0000-0000-4000-8000-000000000001",
                "ref_id": "b-110",
                "name": "Szyna 110 kV (GPZ)",
                "tags": [],
                "meta": {},
                "voltage_kv": 110.0,
                "phase_system": "3ph",
            },
            {
                "id": "7b2e0000-0000-4000-8000-000000000002",
                "ref_id": "b-sn-gpz",
                "name": "Rozdzielnica SN w GPZ",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
                "phase_system": "3ph",
            },
            {
                "id": "7b2e0000-0000-4000-8000-000000000003",
                "ref_id": "b-pole",
                "name": "Pole magistralne za wylacznikiem",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
                "phase_system": "3ph",
            },
            {
                "id": "7b2e0000-0000-4000-8000-000000000004",
                "ref_id": "b-sn-stacja",
                "name": "Szyna SN stacji magistralnej",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
                "phase_system": "3ph",
            },
            {
                "id": "7b2e0000-0000-4000-8000-000000000005",
                "ref_id": "b-przylacze",
                "name": "Miejsce przylaczenia instalacji PV i magazynu",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
                "phase_system": "3ph",
            },
        ],
        "branches": [
            {
                "id": "7b2e0000-0000-4000-8000-000000000011",
                "ref_id": "wyl-pole",
                "name": "Wylacznik pola magistralnego w GPZ",
                "tags": [],
                "meta": {},
                "type": "breaker",
                "from_bus_ref": "b-sn-gpz",
                "to_bus_ref": "b-pole",
                "status": "closed",
                "catalog_ref": "LACZNIK_SN_TEST",
                "parameter_source": "OVERRIDE",
            },
            {
                "id": "7b2e0000-0000-4000-8000-000000000012",
                "ref_id": "kab-magistrala",
                "name": "Kabel magistralny do stacji przylaczeniowej",
                "tags": [],
                "meta": {},
                "type": "cable",
                "from_bus_ref": "b-pole",
                "to_bus_ref": "b-sn-stacja",
                "status": "closed",
                "length_km": 3.5,
                "r_ohm_per_km": 0.2,
                "x_ohm_per_km": 0.1,
                "b_siemens_per_km": 6.0e-5,
                "catalog_ref": "KABEL_SN_TEST",
                "parameter_source": "OVERRIDE",
            },
            {
                "id": "7b2e0000-0000-4000-8000-000000000013",
                "ref_id": "lin-przylacze",
                "name": "Linia napowietrzna GPZ - miejsce przylaczenia",
                "tags": [],
                "meta": {},
                "type": "line_overhead",
                "from_bus_ref": "b-sn-gpz",
                "to_bus_ref": "b-przylacze",
                "status": "closed",
                "length_km": 4.0,
                "r_ohm_per_km": 0.3,
                "x_ohm_per_km": 0.35,
                "b_siemens_per_km": 3.0e-6,
                "catalog_ref": "LINIA_SN_TEST",
                "parameter_source": "OVERRIDE",
            },
            {
                "id": "7b2e0000-0000-4000-8000-000000000014",
                "ref_id": "kab-domkniecie",
                "name": "Kabel domykajacy pierscien: przylacze - stacja magistralna",
                "tags": [],
                "meta": {},
                "type": "cable",
                "from_bus_ref": "b-przylacze",
                "to_bus_ref": "b-sn-stacja",
                "status": "closed",
                "length_km": 1.5,
                "r_ohm_per_km": 0.2,
                "x_ohm_per_km": 0.1,
                "b_siemens_per_km": 6.0e-5,
                "catalog_ref": "KABEL_SN_TEST",
                "parameter_source": "OVERRIDE",
            },
        ],
        "transformers": [
            {
                "id": "7b2e0000-0000-4000-8000-000000000021",
                "ref_id": "tr-gpz",
                "name": "Transformator GPZ 110/15 kV",
                "tags": [],
                "meta": {},
                "hv_bus_ref": "b-110",
                "lv_bus_ref": "b-sn-gpz",
                "sn_mva": 25.0,
                "uhv_kv": 110.0,
                "ulv_kv": 16.5,
                "uk_percent": 11.0,
                "pk_kw": 120.0,
                "vector_group": "Dyn11",
                "tap_position": 2,
                "tap_min": -8,
                "tap_max": 8,
                "tap_step_percent": 1.5,
                "catalog_ref": "TR_110_15_TEST",
                "parameter_source": "OVERRIDE",
            }
        ],
        "sources": [
            {
                "id": "7b2e0000-0000-4000-8000-000000000031",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="zrodlo-110",
                    name="Siec nadrzedna 110 kV",
                    bus_ref="b-110",
                    voltage_kv=110.0,
                    sk3_mva=2500.0,
                    rx_ratio=0.10,
                ),
            }
        ],
        "loads": [
            {
                "id": "7b2e0000-0000-4000-8000-000000000041",
                "ref_id": "odb-gpz",
                "name": "Odbior pozostalych pol GPZ",
                "tags": [],
                "meta": {},
                "bus_ref": "b-sn-gpz",
                "p_mw": 4.0,
                "q_mvar": 1.2,
                "catalog_ref": "ODBIOR_SN_TEST",
                "parameter_source": "OVERRIDE",
            },
            {
                "id": "7b2e0000-0000-4000-8000-000000000042",
                "ref_id": "odb-stacja",
                "name": "Odbior stacji przylaczeniowej",
                "tags": [],
                "meta": {},
                "bus_ref": "b-sn-stacja",
                "p_mw": 3.2,
                "q_mvar": 0.9,
                "catalog_ref": "ODBIOR_SN_TEST",
                "parameter_source": "OVERRIDE",
            },
        ],
        "generators": [
            {
                "id": "7b2e0000-0000-4000-8000-000000000051",
                "ref_id": "gen-magazyn",
                "name": "Magazyn energii 1 MW / 2 MWh",
                "tags": [],
                "meta": {},
                "bus_ref": "b-przylacze",
                "p_mw": 0.5,
                "q_mvar": 0.0,
                "gen_type": "bess",
                "connection_variant": "DEDICATED_MV_CONNECTION",
                "dynamika": MAGAZYN_GFM_1000_KW,
            },
            {
                "id": "7b2e0000-0000-4000-8000-000000000052",
                "ref_id": "gen-pv",
                "name": "Instalacja PV 2,75 MW",
                "tags": [],
                "meta": {},
                "bus_ref": "b-przylacze",
                "p_mw": 2.75,
                "q_mvar": 0.0,
                "gen_type": "pv_inverter",
                "connection_variant": "DEDICATED_MV_CONNECTION",
                "dynamika": PV_GFL_2750_KW,
            },
        ],
        "switches": [],
        "shunt_capacitors": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [],
    }


__all__ = [
    "MAGAZYN_GFM_1000_KW",
    "PV_GFL_2750_KW",
    "build_so1a_pv_magazyn_enm",
]
