"""Blok fabryczny RMU jako POLE PIERWSZEJ KLASY — jedno nazewnictwo, trzy operacje.

Karta K-M część 2. Do jej domknięcia wybór bloku fabrycznego jechał DWOMA
nazewnictwami tej samej prawdy:

* kreator stacji wysyłał go jako metadaną `catalog_bindings.factory_configuration`
  wpisu pola — operacja wcięcia w odcinek gubiła ją bez śladu, operacja końca
  ciągu przepisywała ją do `field_spec` jako martwy słownik, którego NIKT nie
  czytał;
* operacja `add_sn_bay_from_catalog` miała `factory_configuration_ref` +
  `factory_unit_index` jako pola pierwszej klasy payloadu, ale wyniku swojego
  rozstrzygnięcia NIE ZAPISYWAŁA — blok widać było wyłącznie w podglądzie trybu
  próby, czyli w odpowiedzi, która niczego nie utrwala.

Skutek zmierzony przed naprawą: zapis stacji z rodziny o torze BLOK_RMU kończył
się twardym błędem `sn.pole_katalogowe_niezgodne` z komunikatem „uzyj operacji
add_sn_bay_from_catalog z factory_configuration_ref i factory_unit_index" —
operacji, której kreator nie woła, przy nazwie pola, której nie wysyłał. Tor
BLOK_RMU kreatora stacji nie miał drogi zapisu.

ILOCZYN CECH (reguła KLASA, NIE INSTANCJA §2) — testy pokrywają:
{wcięcie stacji w odcinek · stacja na końcu ciągu · operacja katalogowa pola}
× {blok zapisany w modelu · numer jednostki rozstrzyga aparaturę · brak bloku =
brak kluczy} × {rodzina blokowa bez bloku = twardy błąd · blok bez numeru =
twardy błąd · numer poza zakresem = twardy błąd} × {jednostki tej samej roli
o RÓŻNEJ aparaturze w jednym bloku}.

PREDYKATY PARAMI (§3): nazwa pola payloadu pochodzi ze STAŁYCH modułu
(`POLE_BLOKU_FABRYCZNEGO`, `POLE_JEDNOSTKI_BLOKU`) — testy budują payload z tych
samych stałych, którymi operacje czytają, więc „co kreator wysyła" i „co
operacja czyta" nie da się rozjechać na drugiej kopii literału. Odrzucenie
pojedynczej celki rodziny blokowej i przyjęcie jej jednostki bloku rozstrzyga
jeden warunek (`tor_konfiguracji` rodziny w `rozwiaz_plan_pola`) — test pary
sprawdza obie strony na TEJ SAMEJ rodzinie.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.domain_operations import (
    POLE_BLOKU_FABRYCZNEGO,
    POLE_JEDNOSTKI_BLOKU,
    execute_domain_operation,
)
from enm.pole_katalogowe import KOD_BLEDU_POLA_KATALOGOWEGO, pole_katalogowe
from network_model.catalog.switchgear import (
    FactoryConfiguration,
    get_factory_configuration,
    list_switchgear_solution_templates_for_manufacturer,
)

CATALOG_APARAT_SN = "sw-cb-abb-vd4-17kv-630a"
CATALOG_TRAFO = "tr-sn-nn-15-04-630kva-dyn11"

#: Rodzina MODULARNA — pole powstaje z pojedynczej celki, bloku NIE MA.
RODZINA_MODULARNA = "ZPUE_WLOSZCZOWA__RELF"
POLE_MODULARNE = "ZPUE_WLOSZCZOWA__RELF__LINE_OUT"

#: Rodzina BLOKOWA i jej pojedyncza celka (wskazanie bez bloku = błąd).
RODZINA_BLOKOWA = "SCHNEIDER__RM6"
POLE_BLOKOWE = "SCHNEIDER__RM6__LINE_OUT"

#: Blok, którego DWIE jednostki mają tę samą funkcję (odpływ liniowy), ale
#: RÓŻNĄ aparaturę toru głównego: „B" to wyłącznik, „I" rozłącznik. Bez numeru
#: jednostki obu pól nie da się od siebie odróżnić — a to są różne wyroby.
BLOK_ROZNE_JEDNOSTKI = "SCHNEIDER__RM6__BI"

#: Wszystkie operacje przenoszące WYBÓR BLOKU projektanta (inwentarz klasy).
OPERACJE_KLASY = ("wciecie", "koniec_ciagu", "operacja_katalogowa")


# ---------------------------------------------------------------------------
# Budowa modeli wejściowych
# ---------------------------------------------------------------------------


def _enm_z_odcinkiem() -> dict[str, Any]:
    return {
        "header": {"name": "blok-fabryczny"},
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


def _blok(configuration_ref: str) -> FactoryConfiguration:
    return get_factory_configuration(configuration_ref)


def _szablon_rodziny_dla_funkcji(family_ref: str, bay_kind: str) -> str:
    kandydaci = sorted(
        szablon.template_ref
        for szablon in list_switchgear_solution_templates_for_manufacturer(None)
        if szablon.switchgear_family_ref == family_ref and szablon.bay_kind == bay_kind
    )
    assert kandydaci, f"katalog rodziny {family_ref} nie ma pola o funkcji {bay_kind}"
    return kandydaci[0]


#: Funkcja katalogowego pola → rola pola w kontrakcie operacji stacyjnej.
_ROLA_DLA_FUNKCJI = {
    "liniowe_doplywowe": "LINIA_IN",
    "liniowe_odplywowe": "LINIA_OUT",
    "transformatorowe": "TRANSFORMATOROWE",
}


def _wpisy_pol_z_bloku(configuration_ref: str) -> list[dict[str, Any]]:
    """Wpisy `sn_fields` w kształcie, który buduje kreator stacji z bloku.

    Numer jednostki (1-based) jedzie na wpisie pola razem z referencją bloku —
    dokładnie tak, jak `polaZBloku` w kreatorze.
    """
    konfiguracja = _blok(configuration_ref)
    wpisy: list[dict[str, Any]] = []
    for numer, jednostka in enumerate(konfiguracja.units, start=1):
        rola = _ROLA_DLA_FUNKCJI.get(jednostka.bay_kind)
        if rola is None:
            continue
        wpisy.append(
            {
                "field_role": rola,
                "switchgear_family_ref": konfiguracja.switchgear_family_ref,
                "bay_template_ref": _szablon_rodziny_dla_funkcji(
                    konfiguracja.switchgear_family_ref, jednostka.bay_kind
                ),
                "apparatus_catalog_ref": CATALOG_APARAT_SN,
                POLE_BLOKU_FABRYCZNEGO: configuration_ref,
                POLE_JEDNOSTKI_BLOKU: numer,
            }
        )
    assert wpisy, f"blok {configuration_ref} nie ma jednostek o rolach kontraktu"
    return wpisy


def _payload_stacji(sn_fields: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "station": {"name": "Stacja", "station_type": "inline", "nn_voltage_kv": 0.4},
        "sn_fields": sn_fields,
        "field_apparatus_catalog_ref": CATALOG_APARAT_SN,
        "transformer": {"create": True, "transformer_catalog_ref": CATALOG_TRAFO},
        "nn_block": {
            "create_nn_bus": True,
            "main_breaker_nn": True,
            "outgoing_feeders_nn_count": 1,
        },
    }


def _stacja_bazowa() -> tuple[dict[str, Any], str]:
    """Stacja bez pól z payloadu + referencja jej szyny SN (dla operacji pola)."""
    odpowiedz = execute_domain_operation(
        _enm_z_odcinkiem(),
        "append_station_on_endpoint",
        {**_payload_stacji([]), "endpoint_bus_ref": "bus-b"},
    )
    assert odpowiedz.get("error") in (None, ""), odpowiedz
    stacja = odpowiedz["snapshot"]["substations"][-1]
    return odpowiedz["snapshot"], stacja["bus_refs"][0]


def _uruchom(operacja: str, sn_fields: list[dict[str, Any]]) -> dict[str, Any]:
    """Uruchom operację klasy z tym samym zestawem wskazań pól."""
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
    if operacja == "operacja_katalogowa":
        snapshot, bus_ref = _stacja_bazowa()
        odpowiedz: dict[str, Any] = {}
        for wpis in sn_fields:
            payload = {"bus_ref": bus_ref}
            for klucz in (POLE_BLOKU_FABRYCZNEGO, POLE_JEDNOSTKI_BLOKU):
                if klucz in wpis:
                    payload[klucz] = wpis[klucz]
            # Kanał katalogowy przyjmuje wskazanie pola rodziny wtedy, gdy nie ma
            # bloku — inaczej rolę i pole rozstrzyga sam blok.
            if POLE_BLOKU_FABRYCZNEGO not in wpis and wpis.get("bay_template_ref"):
                payload["complete_bay_template_ref"] = wpis["bay_template_ref"]
            payload["catalog_binding"] = {
                "catalog_namespace": "APARAT_SN",
                "catalog_item_id": CATALOG_APARAT_SN,
            }
            odpowiedz = execute_domain_operation(snapshot, "add_sn_bay_from_catalog", payload)
            if odpowiedz.get("error"):
                return odpowiedz
            snapshot = odpowiedz["snapshot"]
        return odpowiedz
    raise AssertionError(f"nieznana operacja klasy: {operacja}")


def _pola_z_blokiem(odpowiedz: dict[str, Any]) -> list[dict[str, Any]]:
    """Specyfikacje pól niosące referencję bloku fabrycznego."""
    snapshot = odpowiedz.get("snapshot") or {}
    pola: list[dict[str, Any]] = []
    for stacja in snapshot.get("substations", []):
        for spec in (stacja.get("meta") or {}).get("field_specs", []):
            if spec.get(POLE_BLOKU_FABRYCZNEGO):
                pola.append(spec)
    return pola


def _wszystkie_pola(odpowiedz: dict[str, Any]) -> list[dict[str, Any]]:
    snapshot = odpowiedz.get("snapshot") or {}
    return [
        spec
        for stacja in snapshot.get("substations", [])
        for spec in (stacja.get("meta") or {}).get("field_specs", [])
    ]


# ---------------------------------------------------------------------------
# Klasa: KAŻDA operacja zapisuje wybór bloku pod TĄ SAMĄ nazwą
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("operacja", OPERACJE_KLASY)
def test_kazda_operacja_zapisuje_blok_i_jednostke_pod_ta_sama_nazwa(operacja: str) -> None:
    """Blok i numer jednostki lądują w modelu — jednym nazewnictwem, w każdej operacji."""
    wpisy = _wpisy_pol_z_bloku(BLOK_ROZNE_JEDNOSTKI)
    odpowiedz = _uruchom(operacja, wpisy)

    assert odpowiedz.get("error") in (None, ""), odpowiedz
    pola = _pola_z_blokiem(odpowiedz)
    assert len(pola) == len(wpisy), (
        f"operacja {operacja} zgubila przynaleznosc pol do bloku: " f"{len(pola)} z {len(wpisy)}"
    )
    for spec, wpis in zip(pola, wpisy, strict=True):
        assert spec[POLE_BLOKU_FABRYCZNEGO] == BLOK_ROZNE_JEDNOSTKI
        assert spec[POLE_JEDNOSTKI_BLOKU] == wpis[POLE_JEDNOSTKI_BLOKU]


@pytest.mark.parametrize("operacja", OPERACJE_KLASY)
def test_numer_jednostki_rozstrzyga_aparature_pola(operacja: str) -> None:
    """Dwie jednostki tej samej ROLI, różne wyroby — numer jednostki je rozróżnia.

    Blok B-I ma dwa odpływy liniowe: „B" z wyłącznikiem i „I" z rozłącznikiem.
    Gdyby aparaturę rozstrzygała rola pola (a nie jednostka), oba pola wyszłyby
    identyczne — i model kłamałby o wyrobie, który stoi w rozdzielnicy.
    """
    wpisy = _wpisy_pol_z_bloku(BLOK_ROZNE_JEDNOSTKI)
    odpowiedz = _uruchom(operacja, wpisy)
    assert odpowiedz.get("error") in (None, ""), odpowiedz

    pola = _pola_z_blokiem(odpowiedz)
    assert len(pola) == 2
    role = {str(spec.get("bay_role")) for spec in pola}
    assert len(role) == 1, f"test bez mocy: jednostki maja rozne role {role}"

    aparaty = [tuple(a["kind"] for a in spec.get("primary_devices") or []) for spec in pola]
    assert all(aparaty), f"operacja {operacja} zapisala pole bloku bez aparatow"
    assert aparaty[0] != aparaty[1], (
        "Jednostki B (wylacznik) i I (rozlacznik) tego samego bloku daja "
        f"identyczna aparature {aparaty[0]} — numer jednostki nie rozstrzyga."
    )
    kinds_wszystkie = {kind for tor in aparaty for kind in tor}
    assert "CB" in kinds_wszystkie and "LOAD_SWITCH" in kinds_wszystkie


@pytest.mark.parametrize("operacja", OPERACJE_KLASY)
def test_rodzina_modulowa_nie_dostaje_kluczy_bloku(operacja: str) -> None:
    """Brak bloku = BRAK kluczy w migawce, nie pusty ref.

    Klucze addytywne: pola rodzin modułowych mają migawkę bajtowo taką samą jak
    przed dołożeniem kontraktu bloku.
    """
    wpis = {
        "field_role": "LINIA_OUT",
        "switchgear_family_ref": RODZINA_MODULARNA,
        "bay_template_ref": POLE_MODULARNE,
        "apparatus_catalog_ref": CATALOG_APARAT_SN,
    }
    odpowiedz = _uruchom(operacja, [wpis])
    assert odpowiedz.get("error") in (None, ""), odpowiedz

    pola = _wszystkie_pola(odpowiedz)
    assert pola
    for spec in pola:
        assert POLE_BLOKU_FABRYCZNEGO not in spec
        assert POLE_JEDNOSTKI_BLOKU not in spec


# ---------------------------------------------------------------------------
# Predykaty parami i twarde błędy
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("operacja", OPERACJE_KLASY)
def test_ta_sama_rodzina_odrzucona_celka_przyjeta_jednostka_bloku(operacja: str) -> None:
    """Para: pojedyncza celka rodziny blokowej ODRZUCONA, jednostka bloku PRZYJĘTA.

    Obie strony rozstrzyga `tor_konfiguracji` rodziny — jedno źródło prawdy. Test
    domyka parę na TEJ SAMEJ rodzinie, żeby drugi, niezależny warunek nie mógł
    się przespać na danych brzegowych.
    """
    celka = {
        "field_role": "LINIA_OUT",
        "switchgear_family_ref": RODZINA_BLOKOWA,
        "bay_template_ref": POLE_BLOKOWE,
        "apparatus_catalog_ref": CATALOG_APARAT_SN,
    }
    odrzucone = _uruchom(operacja, [celka])
    assert odrzucone.get("error_code") == KOD_BLEDU_POLA_KATALOGOWEGO, odrzucone
    assert odrzucone.get("snapshot") is None
    assert not odrzucone.get("created")

    przyjete = _uruchom(operacja, _wpisy_pol_z_bloku(BLOK_ROZNE_JEDNOSTKI))
    assert przyjete.get("error") in (None, ""), przyjete

    # Domknięcie pary: odrzucona celka i przyjęty blok to TA SAMA rodzina.
    odrzucone_pole = pole_katalogowe(POLE_BLOKOWE)
    assert odrzucone_pole is not None
    assert odrzucone_pole.switchgear_family_ref == _blok(BLOK_ROZNE_JEDNOSTKI).switchgear_family_ref


@pytest.mark.parametrize("operacja", OPERACJE_KLASY)
def test_blok_bez_numeru_jednostki_konczy_sie_twardym_bledem(operacja: str) -> None:
    """Referencja bloku bez numeru jednostki nie jest wyborem pola."""
    wpis = dict(_wpisy_pol_z_bloku(BLOK_ROZNE_JEDNOSTKI)[0])
    wpis.pop(POLE_JEDNOSTKI_BLOKU)

    odpowiedz = _uruchom(operacja, [wpis])
    assert odpowiedz.get("error_code") == KOD_BLEDU_POLA_KATALOGOWEGO, odpowiedz
    assert "numeru jednostki" in str(odpowiedz.get("error"))
    assert odpowiedz.get("snapshot") is None


@pytest.mark.parametrize("operacja", OPERACJE_KLASY)
@pytest.mark.parametrize("numer", [0, 99, True, "1", None])
def test_numer_jednostki_spoza_zakresu_konczy_sie_twardym_bledem(
    operacja: str, numer: object
) -> None:
    """Numer poza zakresem bloku ani numer nie-liczbowy nie stają się jednostką 1.

    `True` jest tu osobnym przypadkiem, bo `bool` to podklasa `int` — numer
    jednostki „prawda" byłby jednostką pierwszą z domysłu, nie ze wskazania.
    """
    wpis = dict(_wpisy_pol_z_bloku(BLOK_ROZNE_JEDNOSTKI)[0])
    wpis[POLE_JEDNOSTKI_BLOKU] = numer

    odpowiedz = _uruchom(operacja, [wpis])
    assert odpowiedz.get("error_code") == KOD_BLEDU_POLA_KATALOGOWEGO, odpowiedz
    assert odpowiedz.get("snapshot") is None


@pytest.mark.parametrize("operacja", OPERACJE_KLASY)
def test_blok_spoza_katalogu_konczy_sie_twardym_bledem(operacja: str) -> None:
    """Referencja bloku, której katalog nie zna, nie ląduje w modelu po cichu."""
    wpis = dict(_wpisy_pol_z_bloku(BLOK_ROZNE_JEDNOSTKI)[0])
    wpis[POLE_BLOKU_FABRYCZNEGO] = "PRODUCENT__RODZINA__NIE_MA_TAKIEGO"

    odpowiedz = _uruchom(operacja, [wpis])
    assert odpowiedz.get("error_code") == KOD_BLEDU_POLA_KATALOGOWEGO, odpowiedz
    assert odpowiedz.get("snapshot") is None


# ---------------------------------------------------------------------------
# Stara droga USUNIĘTA — pin klasy, nie przykładu
# ---------------------------------------------------------------------------


def test_zadna_operacja_nie_czyta_bloku_z_metadanej_wiazan() -> None:
    """Wybór bloku podany DAWNĄ drogą nie działa — nie ma warstwy zgodności.

    Metadana `catalog_bindings.factory_configuration` została usunięta na amen.
    Payload, który jej użyje, opisuje rodzinę blokową pojedynczą celką — czyli
    wyrób, którego producent nie robi — i kończy się tym samym twardym błędem,
    co każde inne wskazanie bez bloku. Gdyby operacja czytała blok z metadanej,
    ten zapis by przeszedł.
    """
    konfiguracja = _blok(BLOK_ROZNE_JEDNOSTKI)
    wpis = {
        "field_role": "LINIA_OUT",
        "switchgear_family_ref": RODZINA_BLOKOWA,
        "bay_template_ref": POLE_BLOKOWE,
        "apparatus_catalog_ref": CATALOG_APARAT_SN,
        "catalog_bindings": {
            "factory_configuration": {
                "catalog_namespace": "ROZDZIELNICA_SN",
                "catalog_item_id": konfiguracja.configuration_ref,
                "switchgear_family_ref": RODZINA_BLOKOWA,
            }
        },
    }

    for operacja in OPERACJE_KLASY:
        odpowiedz = _uruchom(operacja, [wpis])
        assert odpowiedz.get("error_code") == KOD_BLEDU_POLA_KATALOGOWEGO, (
            f"operacja {operacja} przyjela blok stara droga (metadana wiazan) — "
            "to druga, rownolegla nazwa tej samej prawdy"
        )
