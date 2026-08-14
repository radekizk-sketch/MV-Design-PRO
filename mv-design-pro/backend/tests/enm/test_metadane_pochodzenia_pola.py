"""Metadane POCHODZENIA pola SN — jeden builder, obie drogi budowy stacji.

Resztka klasy domkniętej kartą bloku fabrycznego. Kreator stacji ui2 wysyła na
KAŻDYM wpisie `sn_fields[]` komplet metadanych pochodzenia pola:

* `bay_kind` — funkcja jednostki w kanonie katalogu rozdzielnic,
* `source_status` — czy pole stoi na rozwiązaniu katalogowym producenta
  (`catalog_solution`), na układzie kanonicznym pakietu (`canonical_fallback`),
  czy karty producenta brakuje (`requires_catalog`),
* `source_refs` — adresy kart katalogowych, z których dana pochodzi.

STAN ZMIERZONY PRZED NAPRAWĄ (skrypt na realnym katalogu, macierz 24 payloadów):
`insert_station_on_segment_sn` gubiła WSZYSTKIE TRZY bez śladu — sześć różnych
payloadów (bez metadanych, z każdym kluczem osobno, z kompletem, z kompletem
i powiązaniami) dawało DOKŁADNIE TEN SAM odcisk migawki pól, w obu torach
rodzin: `c49e6dc7…` dla toru BLOK_RMU i `3ed007af…` dla toru MODULARNEGO.
`append_station_on_endpoint` przenosiła je wszystkie — ale składała
specyfikację pola RĘCZNIE, własnym literałem słownika obok wspólnego buildera,
więc każdy nowy klucz kontraktu trzeba było dokładać w dwóch miejscach naraz
(i za każdym razem jedno zostawało w tyle: `config_id` i aparaty pierwotne
wracały do tej drogi osobnymi naprawami). Dwie drogi, jedno źródło rozjazdu.

ILOCZYN CECH (reguła KLASA, NIE INSTANCJA §2) — testy pokrywają:
{wcięcie stacji w odcinek · stacja na końcu ciągu}
× {każdy klucz metadanych NIESIONY OSOBNO · wszystkie razem · żadnego}
× {tor MODULARNY (pojedyncze celki) · tor BLOK_RMU (jednostki bloku)}
× {wartość pusta = brak deklaracji · pole domykane bez wpisu w payloadzie}.
Każda kombinacja jedzie ŚCIEŻKĄ NATYWNĄ operacji: payload → `execute_domain_
operation` → odczyt z zapisanej migawki. Żadnego wymuszania stanu, żadnego
wołania buildera wprost — gdyby operacja przestała klucz przenosić, test
czerwienieje niezależnie od tego, co builder umie.

PREDYKATY PARAMI (§3): nazwy kluczy po stronie ODCZYTU payloadu i po stronie
ZAPISU migawki pochodzą z JEDNEJ stałej modułu (`POLE_RODZAJU_POLA`,
`POLE_STATUSU_ZRODLA`, `POLE_ZRODEL_DANYCH`), a testy budują payload z tych
samych stałych — druga kopia literału nie ma gdzie powstać. Test parytetu
porównuje WYNIK obu operacji dla tego samego wpisu pola: rozjazd dróg (naprawa
jednej, zapomnienie drugiej) jest czerwony z nazwą kombinacji.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.domain_operations import (
    KLUCZE_BEZWARUNKOWE_POLA_KONCA_CIAGU,
    POLE_BLOKU_FABRYCZNEGO,
    POLE_JEDNOSTKI_BLOKU,
    POLE_POWIAZAN_KATALOGOWYCH,
    POLE_RODZAJU_POLA,
    POLE_STATUSU_ZRODLA,
    POLE_ZRODEL_DANYCH,
    _build_field_spec,
    execute_domain_operation,
)
from network_model.catalog.switchgear import (
    get_factory_configuration,
    list_switchgear_solution_templates_for_manufacturer,
)

CATALOG_APARAT_SN = "sw-cb-abb-vd4-17kv-630a"
CATALOG_TRAFO = "tr-sn-nn-15-04-630kva-dyn11"

#: Rodzina MODULARNA — pole powstaje z pojedynczej celki katalogu.
RODZINA_MODULARNA = "ZPUE_WLOSZCZOWA__RELF"
PRODUCENT_MODULARNY = "ZPUE_WLOSZCZOWA"

#: Blok fabryczny rodziny BLOKOWEJ (rozdzielnica wtórna RM6) — pole powstaje
#: jako JEDNOSTKA bloku, nie jako luźna celka.
BLOK_RMU = "SCHNEIDER__RM6__BI"
PRODUCENT_BLOKOWY = "SCHNEIDER"

#: Obie operacje stacyjne budujące pola z wpisów `sn_fields` kreatora.
OPERACJE_STACYJNE = ("wciecie", "koniec_ciagu")

#: Oba tory konfiguracji rodzin rozdzielnic.
TORY_RODZIN = ("MODULARNY", "BLOK_RMU")

#: Funkcja katalogowego pola → rola pola w kontrakcie operacji stacyjnej.
_ROLA_DLA_FUNKCJI = {
    "liniowe_doplywowe": "LINIA_IN",
    "liniowe_odplywowe": "LINIA_OUT",
    "transformatorowe": "TRANSFORMATOROWE",
}

#: Wartości metadanych używane w testach — po jednej na klucz, rozpoznawalne.
STATUS_ZRODLA = "canonical_fallback"
ZRODLA_DANYCH = ["https://www.se.com/karta-rm6.pdf"]


# ---------------------------------------------------------------------------
# Budowa modelu i payloadów
# ---------------------------------------------------------------------------


def _enm_z_odcinkiem() -> dict[str, Any]:
    return {
        "header": {"name": "metadane-pochodzenia-pola"},
        "buses": [
            {"ref_id": "bus-a", "name": "A", "voltage_kv": 15.0},
            {"ref_id": "bus-b", "name": "B", "voltage_kv": 15.0},
        ],
        "branches": [
            {
                "ref_id": "seg-1",
                "name": "Odcinek",
                "type": "cable",
                "from_bus_ref": "bus-a",
                "to_bus_ref": "bus-b",
                "length_km": 1.0,
                "r_ohm": 0.2,
                "x_ohm": 0.1,
            }
        ],
        "transformers": [],
        "substations": [],
        "corridors": [],
    }


def _szablon_rodziny_dla_funkcji(family_ref: str, bay_kind: str) -> str:
    kandydaci = sorted(
        szablon.template_ref
        for szablon in list_switchgear_solution_templates_for_manufacturer(None)
        if szablon.switchgear_family_ref == family_ref and szablon.bay_kind == bay_kind
    )
    assert kandydaci, f"katalog rodziny {family_ref} nie ma pola o funkcji {bay_kind}"
    return kandydaci[0]


def _wpisy_toru(tor: str) -> list[dict[str, Any]]:
    """Wpisy `sn_fields` BEZ metadanych pochodzenia — baza obu torów rodzin.

    Każdy wpis niesie funkcję jednostki pod kluczem roboczym `_funkcja`, żeby
    warianty metadanych mogły wstawić poprawny `bay_kind` (metadana ma opisywać
    TĘ jednostkę, nie dowolną wartość ze słownika).
    """
    if tor == "MODULARNY":
        return [
            {
                "field_role": _ROLA_DLA_FUNKCJI[funkcja],
                "manufacturer_ref": PRODUCENT_MODULARNY,
                "switchgear_family_ref": RODZINA_MODULARNA,
                "bay_template_ref": _szablon_rodziny_dla_funkcji(RODZINA_MODULARNA, funkcja),
                "apparatus_catalog_ref": CATALOG_APARAT_SN,
                "_funkcja": funkcja,
            }
            for funkcja in ("liniowe_doplywowe", "liniowe_odplywowe", "transformatorowe")
        ]
    konfiguracja = get_factory_configuration(BLOK_RMU)
    wpisy: list[dict[str, Any]] = []
    for numer, jednostka in enumerate(konfiguracja.units, start=1):
        rola = _ROLA_DLA_FUNKCJI.get(jednostka.bay_kind)
        if rola is None:
            continue
        wpisy.append(
            {
                "field_role": rola,
                "manufacturer_ref": PRODUCENT_BLOKOWY,
                "switchgear_family_ref": konfiguracja.switchgear_family_ref,
                "bay_template_ref": _szablon_rodziny_dla_funkcji(
                    konfiguracja.switchgear_family_ref, jednostka.bay_kind
                ),
                "apparatus_catalog_ref": CATALOG_APARAT_SN,
                POLE_BLOKU_FABRYCZNEGO: BLOK_RMU,
                POLE_JEDNOSTKI_BLOKU: numer,
                "_funkcja": jednostka.bay_kind,
            }
        )
    assert wpisy, f"blok {BLOK_RMU} nie ma jednostek o rolach kontraktu"
    return wpisy


def _z_metadanymi(wpisy: list[dict[str, Any]], klucze: tuple[str, ...]) -> list[dict[str, Any]]:
    """Wpisy pól z metadanymi WYŁĄCZNIE pod wskazanymi kluczami."""
    wynik: list[dict[str, Any]] = []
    for wpis in wpisy:
        nowy = {klucz: wartosc for klucz, wartosc in wpis.items() if klucz != "_funkcja"}
        if POLE_RODZAJU_POLA in klucze:
            nowy[POLE_RODZAJU_POLA] = wpis["_funkcja"]
        if POLE_STATUSU_ZRODLA in klucze:
            nowy[POLE_STATUSU_ZRODLA] = STATUS_ZRODLA
        if POLE_ZRODEL_DANYCH in klucze:
            nowy[POLE_ZRODEL_DANYCH] = list(ZRODLA_DANYCH)
        wynik.append(nowy)
    return wynik


def _payload_stacji(sn_fields: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "station": {
            "name": "Stacja",
            "station_type": "inline",
            "nn_voltage_kv": 0.4,
            "switchgear": {
                "manufacturer_ref": PRODUCENT_MODULARNY,
                "switchgear_family_ref": RODZINA_MODULARNA,
            },
        },
        "sn_fields": sn_fields,
        "field_apparatus_catalog_ref": CATALOG_APARAT_SN,
        "transformer": {"create": True, "transformer_catalog_ref": CATALOG_TRAFO},
        "nn_block": {
            "create_nn_bus": True,
            "main_breaker_nn": True,
            "outgoing_feeders_nn_count": 1,
        },
    }


def _uruchom(operacja: str, sn_fields: list[dict[str, Any]]) -> dict[str, Any]:
    """Ścieżka NATYWNA operacji: payload → dyspozytor operacji domenowych."""
    if operacja == "wciecie":
        return execute_domain_operation(
            _enm_z_odcinkiem(),
            "insert_station_on_segment_sn",
            {
                **_payload_stacji(sn_fields),
                "segment_id": "seg-1",
                "insert_at": {"mode": "RATIO", "value": 0.5},
            },
        )
    if operacja == "koniec_ciagu":
        return execute_domain_operation(
            _enm_z_odcinkiem(),
            "append_station_on_endpoint",
            {**_payload_stacji(sn_fields), "endpoint_bus_ref": "bus-b"},
        )
    raise AssertionError(f"nieznana operacja stacyjna: {operacja}")


def _pola_stacji(odpowiedz: dict[str, Any]) -> list[dict[str, Any]]:
    snapshot = odpowiedz.get("snapshot") or {}
    return [
        spec
        for stacja in snapshot.get("substations", [])
        for spec in (stacja.get("meta") or {}).get("field_specs", [])
    ]


def _pola_z_payloadu(
    odpowiedz: dict[str, Any], wpisy: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Pola odpowiadające wpisom payloadu (bez pól domykanych operacji).

    Dopasowanie po REFERENCJI SZABLONU: pole domykane szablonu nie ma
    (`bay_template_ref` jawnie None), więc nie miesza się do porównań metadanych
    niesionych przez payload.
    """
    szablony = {wpis["bay_template_ref"] for wpis in wpisy}
    return [spec for spec in _pola_stacji(odpowiedz) if spec.get("bay_template_ref") in szablony]


# ---------------------------------------------------------------------------
# ILOCZYN: operacja × klucz × tor rodziny
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("operacja", OPERACJE_STACYJNE)
@pytest.mark.parametrize("tor", TORY_RODZIN)
@pytest.mark.parametrize("klucz", [POLE_RODZAJU_POLA, POLE_STATUSU_ZRODLA, POLE_ZRODEL_DANYCH])
def test_kazdy_klucz_metadanych_osobno_dojezdza_do_migawki(
    operacja: str, tor: str, klucz: str
) -> None:
    """Klucz niesiony SAM (bez pozostałych) ląduje w specyfikacji pola.

    Klucz osobno, a nie tylko w komplecie: gdyby operacja przenosiła metadane
    „hurtem" (np. tylko przy obecności `bay_kind`), pojedyncza deklaracja
    kreatora ginęłaby po cichu — a kreator wysyła je niezależnie od siebie
    (szablon bez karty producenta ma status i nie ma referencji źródeł).
    """
    wpisy_bazowe = _wpisy_toru(tor)
    wpisy = _z_metadanymi(wpisy_bazowe, (klucz,))
    odpowiedz = _uruchom(operacja, wpisy)
    assert odpowiedz.get("error") in (None, ""), odpowiedz

    pola = _pola_z_payloadu(odpowiedz, wpisy)
    assert len(pola) == len(
        wpisy
    ), f"{operacja}/{tor}: operacja zapisala {len(pola)} pol z {len(wpisy)} wpisow"
    for spec, wpis in zip(pola, wpisy, strict=True):
        assert spec.get(klucz) == wpis[klucz], (
            f"{operacja}/{tor}: klucz {klucz} nie dojechal do migawki pola "
            f"{spec.get('field_ref')} (jest {spec.get(klucz)!r}, "
            f"payload niosl {wpis[klucz]!r})"
        )

    # Klucze NIENIESIONE przez ten payload nie mogą się pojawić z domysłu.
    pozostale = {POLE_RODZAJU_POLA, POLE_STATUSU_ZRODLA, POLE_ZRODEL_DANYCH} - {klucz}
    for spec in pola:
        for inny in pozostale:
            assert not spec.get(inny), (
                f"{operacja}/{tor}: klucz {inny} pojawil sie bez deklaracji "
                f"payloadu (wartosc {spec.get(inny)!r}) — to domysl, nie dana"
            )


@pytest.mark.parametrize("operacja", OPERACJE_STACYJNE)
@pytest.mark.parametrize("tor", TORY_RODZIN)
def test_komplet_metadanych_dojezdza_do_migawki(operacja: str, tor: str) -> None:
    """Wszystkie klucze naraz — kształt, który realnie wysyła kreator stacji."""
    wpisy_bazowe = _wpisy_toru(tor)
    wpisy = _z_metadanymi(
        wpisy_bazowe, (POLE_RODZAJU_POLA, POLE_STATUSU_ZRODLA, POLE_ZRODEL_DANYCH)
    )
    odpowiedz = _uruchom(operacja, wpisy)
    assert odpowiedz.get("error") in (None, ""), odpowiedz

    pola = _pola_z_payloadu(odpowiedz, wpisy)
    assert len(pola) == len(wpisy)
    for spec, wpis in zip(pola, wpisy, strict=True):
        assert spec.get(POLE_RODZAJU_POLA) == wpis[POLE_RODZAJU_POLA]
        assert spec.get(POLE_STATUSU_ZRODLA) == STATUS_ZRODLA
        assert spec.get(POLE_ZRODEL_DANYCH) == ZRODLA_DANYCH


@pytest.mark.parametrize("tor", TORY_RODZIN)
def test_obie_operacje_zapisuja_te_same_metadane_dla_tego_samego_wpisu(tor: str) -> None:
    """PARYTET DRÓG: ten sam wpis pola → ta sama metadana, obiema drogami.

    Sedno karty: naprawa jednej drogi i zapomnienie drugiej ma być czerwona.
    Porównanie idzie po WARTOŚCIACH z migawek obu operacji, nie po kodzie.
    """
    wpisy = _z_metadanymi(
        _wpisy_toru(tor), (POLE_RODZAJU_POLA, POLE_STATUSU_ZRODLA, POLE_ZRODEL_DANYCH)
    )

    metadane_drog: dict[str, list[dict[str, Any]]] = {}
    for operacja in OPERACJE_STACYJNE:
        odpowiedz = _uruchom(operacja, wpisy)
        assert odpowiedz.get("error") in (None, ""), odpowiedz
        metadane_drog[operacja] = [
            {
                klucz: spec.get(klucz)
                for klucz in (POLE_RODZAJU_POLA, POLE_STATUSU_ZRODLA, POLE_ZRODEL_DANYCH)
            }
            for spec in _pola_z_payloadu(odpowiedz, wpisy)
        ]

    assert metadane_drog["wciecie"] == metadane_drog["koniec_ciagu"], (
        f"tor {tor}: drogi budowy stacji rozjechaly sie na metadanych "
        f"pochodzenia pola: {metadane_drog}"
    )


@pytest.mark.parametrize("tor", TORY_RODZIN)
def test_brak_metadanych_w_payloadzie_nie_daje_zadnej_wartosci(tor: str) -> None:
    """Payload bez metadanych → migawka bez wartości metadanych (obie drogi).

    Klucze są ADDYTYWNE: wcięcie w odcinek nie zapisuje ich w ogóle, stacja
    końca ciągu deklaruje je kształtem swojej migawki (klucz obecny, wartość
    pusta). Żadna z dróg nie ma prawa wstawić wartości z domysłu — status
    źródła zmyślony przez operację byłby proweniencją bez źródła.
    """
    wpisy = _z_metadanymi(_wpisy_toru(tor), ())

    odpowiedz_wciecie = _uruchom("wciecie", wpisy)
    assert odpowiedz_wciecie.get("error") in (None, ""), odpowiedz_wciecie
    for spec in _pola_z_payloadu(odpowiedz_wciecie, wpisy):
        for klucz in (POLE_RODZAJU_POLA, POLE_STATUSU_ZRODLA, POLE_ZRODEL_DANYCH):
            assert (
                klucz not in spec
            ), f"wciecie/{tor}: klucz {klucz} zapisany bez deklaracji payloadu"

    odpowiedz_koniec = _uruchom("koniec_ciagu", wpisy)
    assert odpowiedz_koniec.get("error") in (None, ""), odpowiedz_koniec
    for spec in _pola_z_payloadu(odpowiedz_koniec, wpisy):
        assert spec.get(POLE_RODZAJU_POLA) is None
        assert spec.get(POLE_STATUSU_ZRODLA) is None
        assert spec.get(POLE_ZRODEL_DANYCH) == []


def test_wartosc_pusta_nie_jest_deklaracja_metadanej() -> None:
    """Pusty status i pusta lista źródeł to BRAK deklaracji, nie deklaracja.

    Pusty łańcuch nie jest statusem źródła, a lista bez ani jednego adresu nie
    jest proweniencją — zapisanie ich udawałoby daną tam, gdzie jej nie ma.
    Asercja jest OSTRA (brak klucza albo `None`), bo pusty łańcuch jest fałszywy
    w Pythonie: łagodne `assert not spec.get(...)` przepuściłoby zapis `""`
    i deklaracja żyłaby wyłącznie w docstringu.
    """
    wpisy = _z_metadanymi(_wpisy_toru("MODULARNY"), ())
    for wpis in wpisy:
        wpis[POLE_RODZAJU_POLA] = "   "
        wpis[POLE_STATUSU_ZRODLA] = ""
        wpis[POLE_ZRODEL_DANYCH] = ["  ", ""]

    odpowiedz_wciecie = _uruchom("wciecie", wpisy)
    assert odpowiedz_wciecie.get("error") in (None, ""), odpowiedz_wciecie
    for spec in _pola_z_payloadu(odpowiedz_wciecie, wpisy):
        for klucz in (POLE_RODZAJU_POLA, POLE_STATUSU_ZRODLA, POLE_ZRODEL_DANYCH):
            assert klucz not in spec, (
                f"wciecie: pusta wartosc klucza {klucz} zapisana jako deklaracja "
                f"(jest {spec.get(klucz)!r})"
            )

    # Stacja końca ciągu deklaruje te klucze KSZTAŁTEM migawki, więc znakiem
    # braku jest tu `None`/`[]` — nigdy pusty łańcuch przepisany z payloadu.
    odpowiedz_koniec = _uruchom("koniec_ciagu", wpisy)
    assert odpowiedz_koniec.get("error") in (None, ""), odpowiedz_koniec
    for spec in _pola_z_payloadu(odpowiedz_koniec, wpisy):
        assert spec.get(POLE_RODZAJU_POLA) is None, spec.get(POLE_RODZAJU_POLA)
        assert spec.get(POLE_STATUSU_ZRODLA) is None, spec.get(POLE_STATUSU_ZRODLA)
        assert spec.get(POLE_ZRODEL_DANYCH) == [], spec.get(POLE_ZRODEL_DANYCH)


def test_pole_domykane_konca_ciagu_niesie_rodzaj_i_status_bez_kodow_zabezpieczen() -> None:
    """Pole DOMYKANE (bez wpisu w payloadzie) — kształt zapisu bez fabrykacji.

    Operacja końca ciągu domyka pole dopływowe i transformatorowe, których
    payload nie zadeklarował. Takie pole zna swoją funkcję (`bay_kind`) i status
    źródła (rozwiązanie katalogowe rodziny), ale NIE MA szablonu producenta,
    więc nie ma źródła wymagań zabezpieczeniowych: klucz `protection_codes`
    zostaje NIEOBECNY, bo pusta lista twierdziłaby, że pole nie wymaga żadnej
    funkcji zabezpieczeniowej.
    """
    odpowiedz = _uruchom("koniec_ciagu", [])
    assert odpowiedz.get("error") in (None, ""), odpowiedz

    domykane = [spec for spec in _pola_stacji(odpowiedz) if spec.get("bay_template_ref") is None]
    assert domykane, "operacja nie domknela zadnego pola stacji konca ciagu"
    role = {spec.get("field_role") for spec in domykane}
    assert {"LINIA_IN", "TRANSFORMATOROWE"} <= role, role
    for spec in domykane:
        assert spec.get(POLE_RODZAJU_POLA), f"pole domykane bez funkcji jednostki: {spec}"
        assert spec.get(POLE_STATUSU_ZRODLA) == "catalog_solution"
        assert spec.get(POLE_ZRODEL_DANYCH) == []
        assert "protection_codes" not in spec, (
            "pole domykane nie ma szablonu producenta — pusta lista kodow "
            "zabezpieczen twierdzilaby, ze pole nie wymaga zadnej funkcji"
        )


@pytest.mark.parametrize("tor", TORY_RODZIN)
def test_powiazania_katalogowe_niesie_wylacznie_droga_konca_ciagu(tor: str) -> None:
    """Druga kopia prawdy pierwszej klasy ma DOKŁADNIE JEDNO miejsce zapisu.

    `catalog_bindings.switchgear_template` powiela referencję szablonu,
    producenta, rodzinę i status źródła — dane, które obie operacje niosą już
    jako klucze pierwszej klasy. Kształt migawki stacji końca ciągu przenosi tę
    kopię od dawna (bajtowa niezmienność), ale wcięcie w odcinek jej NIE
    dokłada: rozmnożenie kanału powtórzyłoby dług wyciętego kanału bloku
    fabrycznego. Deklaracja przypięta testem, nie samym komentarzem.
    """
    wpisy = _z_metadanymi(_wpisy_toru(tor), ())
    for wpis in wpisy:
        wpis[POLE_POWIAZAN_KATALOGOWYCH] = {
            "switchgear_template": {
                "catalog_namespace": "ROZDZIELNICA_SN",
                "catalog_item_id": wpis["bay_template_ref"],
            }
        }

    odpowiedz_wciecie = _uruchom("wciecie", wpisy)
    assert odpowiedz_wciecie.get("error") in (None, ""), odpowiedz_wciecie
    for spec in _pola_z_payloadu(odpowiedz_wciecie, wpisy):
        assert POLE_POWIAZAN_KATALOGOWYCH not in spec

    odpowiedz_koniec = _uruchom("koniec_ciagu", wpisy)
    assert odpowiedz_koniec.get("error") in (None, ""), odpowiedz_koniec
    for spec, wpis in zip(_pola_z_payloadu(odpowiedz_koniec, wpisy), wpisy, strict=True):
        assert spec.get(POLE_POWIAZAN_KATALOGOWYCH) == wpis[POLE_POWIAZAN_KATALOGOWYCH]


@pytest.mark.parametrize(
    ("nazwa_argumentu", "klucz_migawki"),
    [("meta", "meta"), ("catalog_bindings", POLE_POWIAZAN_KATALOGOWYCH)],
)
def test_builder_jest_wlascicielem_struktur_zagniezdzonych(
    nazwa_argumentu: str, klucz_migawki: str
) -> None:
    """Builder KOPIUJE każdą strukturę zagnieżdżoną, którą zapisuje w polu.

    Iloczyn cech po WSZYSTKICH zagnieżdżonych wejściach buildera (`meta`
    i `catalog_bindings`) — jedna reguła, nie wyjątek dla jednego argumentu.
    Wołający nie ma trzymać uchwytu do wnętrza zapisanej specyfikacji: inaczej
    zmiana jego słownika po zapisie po cichu zmieniałaby model.

    Test celuje w BUILDER, a nie w ścieżkę operacji, świadomie: operacje budują
    model kopiami (`create_node`/`create_branch` zwracają nowy ENM), więc przez
    ścieżkę natywną ten defekt jest NIEWIDOCZNY — zmierzone. Test „natywny" na
    tę deklarację byłby zielony niezależnie od kodu, czyli fałszywą pewnością.
    """
    zagniezdzone = {"poziom": {"wartosc": "przed"}}
    spec = _build_field_spec(
        field_ref="field/test/1",
        bay_role="IN",
        bus_ref="bus-a",
        **{nazwa_argumentu: zagniezdzone},
        klucze_bezwarunkowe=KLUCZE_BEZWARUNKOWE_POLA_KONCA_CIAGU,
    )
    zagniezdzone["poziom"]["wartosc"] = "po"

    zapisane = spec.get(klucz_migawki) or {}
    assert zapisane["poziom"]["wartosc"] == "przed", (
        f"builder zapisal argument {nazwa_argumentu} PRZEZ REFERENCJE — "
        "wolajacy trzyma uchwyt do wnetrza migawki modelu"
    )
