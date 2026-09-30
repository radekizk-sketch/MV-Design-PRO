"""
Test parytetu: brama operacji (`CATALOG_REQUIRED_OPERATIONS`, keyed operacją)
<-> tabela wymagalności katalogu (`wymagalnosc_katalogu`, keyed rodzajem) —
karta W3-I (§0.15 karty konwergencji fizyki, 2026-09-09), decyzja §0 pkt 2.

Brama operacji ZOSTAJE kluczowana operacją (kontrakt payloadów jest INNYM
kształtem problemu niż „czy ten rodzaj wymaga katalogu") — ta karta jej NIE
restrukturyzuje. Test poniżej weryfikuje TYLKO, że obie decyzje (brama
operacji i tabela rodzajów) się zgadzają: dla każdej operacji tworzącej
element `wymagalnosc_katalogu(rodzaj).tworzenie is Poziom.BLOCKER` <=>
`operacja in CATALOG_REQUIRED_OPERATIONS`. Rozjazd = czerwony test — chyba że
jest na jawnej, uzasadnionej liście wyjątków (wzorzec
`ROZJAZD_WYMOGU_KATALOGU_ZNANY` już istniejący w
`test_brama_katalogowa_api_inwentarz.py`; ta karta dodaje ANALOGICZNY
mechanizm dla osi tworzenia, nie duplikuje TAMTEGO — tamten zbiór porównuje
backend z frontendem, ten porównuje bramę operacji z tabelą rodzajów).

Mapa operacja -> rodzaj jest WYPROWADZONA z `domain/canonical_operations.py::
CANONICAL_OPERATIONS[...].description_pl` (cytowane przy każdej pozycji) i z
kodu operacji domenowej (`enm/domain_operations_v2.py` / `enm/domain_
operations.py`) — nie zgadywana.
"""

from __future__ import annotations

import pytest
from api.domain_ops_policy import CATALOG_REQUIRED_OPERATIONS
from domain.canonical_operations import CANONICAL_OPERATIONS
from network_model.catalog.governance import Poziom, wymagalnosc_katalogu

# Operacja -> rodzaj TWORZONY (element podstawowy/obowiązkowy tej operacji, w
# nazewnictwie tabeli `wymagalnosc_katalogu`). Komentarz przy każdej pozycji
# cytuje `CANONICAL_OPERATIONS[operacja].description_pl` jako dowód wyprowadzenia.
_OPERACJA_RODZAJ: dict[str, str] = {
    "add_grid_source_sn": "source",  # "Dodanie źródła zasilania sieciowego (GPZ) do sieci SN"
    "add_sn_bay": "switch",  # "Dodanie pola SN do GPZ, stacji, ZKSN albo pola źródłowego"
    "add_sn_bay_from_catalog": "switch",  # "Dodanie pola SN z katalogu rozdzielnic..."
    "continue_trunk_segment_sn": "cable",  # "Kontynuacja segmentu magistrali SN"
    "start_branch_segment_sn": "cable",  # "Rozpoczęcie nowego odgałęzienia od magistrali SN"
    "connect_secondary_ring_sn": "cable",  # "Zamknięcie pierścienia wtórnego"
    "insert_station_on_segment_sn": "transformer",  # "Wstawienie stacji na istniejącym segmencie SN"
    "append_station_on_endpoint": "transformer",  # "Dołączenie stacji na końcu istniejącego ciągu SN"
    "add_transformer_sn_nn": "transformer",  # "Dodanie transformatora SN/nN"
    "add_nn_load": "load",  # "Dodanie obciążenia na szynie nN"
    "add_load_sn": "load",  # "Dodanie odbioru wprost na wskazaną szynę..."
    "add_converter_source": "generator",  # "Dodanie źródła przekształtnikowego PV, BESS lub FW"
    "add_generator_sn": "generator",  # "Dodanie generatora synchronicznego wprost na szynę SN/WN..."
    "add_relay": "protection",  # "Dodanie przekaźnika zabezpieczeniowego"
    "add_ct": "measurement",  # "Dodanie przekładnika prądowego (CT)"
    "add_vt": "measurement",  # "Dodanie przekładnika napięciowego (VT)"
    "insert_section_switch_sn": "switch",  # "Wstawienie łącznika sekcyjnego na segmencie SN"
    "add_nn_cable_segment": "cable",  # "Dodanie odcinka kabla nN..."
    "add_nn_switch_device": "switch",  # "Dodanie aparatu (wyłącznik/rozłącznik/bezpiecznik)..."
    "add_nn_section_coupler": "switch",  # "Dodanie nowej sekcji szyn i sprzęgła w rozdzielnicy nN"
    "add_shunt_compensator_sn": "shunt_capacitor",  # "Dodanie baterii kondensatorów..."
}

# Operacje TWORZĄCE element, świadomie POZA mapą rodzajów — element powstający
# nie ma odpowiednika w 12-elementowej taksonomii `wymagalnosc_katalogu` (własna
# przestrzeń katalogowa poza `CatalogNamespace`, brak kategorii katalogu wcale,
# albo element to kontener/metadana bez fizyki) — nie rozjazd, inny przedmiot.
_OPERACJE_POZA_TAKSONOMIA_RODZAJOW: frozenset[str] = frozenset(
    {
        # Punkt pośredni SN (słup odgałęźny / ZK-SN) rozstrzyga się we WŁASNYM
        # katalogu (PUNKT_POSREDNI_SN), poza CatalogNamespace i poza 12 rodzajami
        # tej tabeli (`api/domain_ops_policy.py::_OPERACJE_PUNKTU_POSREDNIEGO_SN`).
        "insert_branch_pole_on_segment_sn",
        "insert_zksn_on_segment_sn",
        # Agregat/UPS nN nie mają kategorii katalogu wcale (domain_ops_policy.py,
        # PozycjaBramyApi uzasadnienie przy "add_genset_nn"/"add_ups_nn").
        "add_genset_nn",
        "add_ups_nn",
        # Ogranicznik przepięć SN — rodzaj poza 12-elementową taksonomią tej karty
        # (nie jest jednym z: cable/line_overhead/transformer/source/generator/
        # load/switch/breaker/fuse/measurement/protection/shunt_capacitor).
        "add_surge_arrester_sn",
        # Aparat odpływowy nN: katalog materializowany PRZY PROMOCJI wpisu
        # (`enm.migrations.nn_field_specs_promocja`), nie przez tę operację —
        # `api/domain_ops_policy.py` nagłówek modułu, karta NAPRAWA-B.
        "add_nn_outgoing_field",
        # Rozdzielnica nN i sekcja GPZ tworzą `Substation`/metadane stacji —
        # kontener bez fizyki, nie element jednego z 12 rodzajów.
        "add_nn_distribution_board",
        "add_gpz_section",
        # Nie TWORZĄ nowego elementu — działają na już istniejącym.
        "set_der_catalog_bindings",
        "assign_catalog_to_element",
        "update_element_parameters",
    }
)

# Rozjazdy ZNANE i UZASADNIONE między tabelą (`tworzenie == BLOCKER`) a bramą
# operacji (`CATALOG_REQUIRED_OPERATIONS`) — lista ZAMKNIĘTA i JAWNA (wzorzec
# `ROZJAZD_WYMOGU_KATALOGU_ZNANY` w `test_brama_katalogowa_api_inwentarz.py`):
# każda pozycja z OSOBNYM, zmierzonym uzasadnieniem, nowa pozycja wymaga TEGO
# SAMEGO pomiaru, nie ciszy. Karta W3-I (2026-09-09) NIE naprawia tych dwóch —
# naprawa `add_load_sn`/`add_generator_sn` w `CATALOG_REQUIRED_OPERATIONS`
# wymagałaby też zmiany `frontend/.../catalogFirstRules.ts` (dziś BEZ case'ów
# dla obu operacji, zmierzone) i przeglądu kreatorów UI obu operacji — poza
# plikami-kluczami tej karty (`§2` karty konwergencji fizyki). Nazwane tu, nie
# ukryte, żeby architekt mógł zlecić naprawę jako osobną kartę.
_ROZJAZD_TWORZENIE_ZNANY: frozenset[str] = frozenset(
    {
        # `add_load_sn`: katalog OPCJONALNY z rozmysłu — "odbiór nie jest wyrobem
        # katalogowym" (komentarz przy `V2_CATALOG_GATE_INVENTORY` w
        # `enm/domain_operations_v2.py`), tabela go mimo to klasyfikuje jako
        # `load` (tworzenie BLOCKER dla obciążenia nN via `add_nn_load`) — SN i nN
        # to dwie różne, dziś świadomie różne polityki pod jedną nazwą rodzaju.
        "add_load_sn",
        # `add_generator_sn`: katalog OBOWIĄZKOWY, egzekwowany WYŁĄCZNIE przez
        # domenę (`enm/domain_operations_v2.py::add_generator_sn`, kod
        # `generator.catalog_required`, komentarz "K1.2 — element fizyczny, bez
        # wyjątku dla generatorów") — `api/domain_ops_policy.py::validate_and_
        # materialize_catalog_binding` przepuszcza operacje spoza
        # `CATALOG_REQUIRED_OPERATIONS` bez kontroli WCZESNEJ (linia „if operation
        # not in CATALOG_REQUIRED_OPERATIONS: return None, {}”), więc żądanie bez
        # katalogu dostaje dziś kod domenowy zamiast jednolitego `catalog.
        # ref_required` — inny kształt odpowiedzi dla tej samej pomyłki, ale NIE
        # dziura bezpieczeństwa (domena i tak odmawia).
        "add_generator_sn",
    }
)


def test_kazda_operacja_bramy_ma_mapowanie_albo_jest_poza_taksonomia() -> None:
    """Zero milczących operacji w `CATALOG_REQUIRED_OPERATIONS` — każda jest albo
    zmapowana na rodzaj, albo jawnie nazwana jako poza taksonomią tabeli."""
    nieznane = (
        CATALOG_REQUIRED_OPERATIONS - set(_OPERACJA_RODZAJ) - _OPERACJE_POZA_TAKSONOMIA_RODZAJOW
    )
    assert not nieznane, (
        "Operacje w CATALOG_REQUIRED_OPERATIONS bez mapowania na rodzaj ani "
        f"uzasadnienia poza taksonomią: {sorted(nieznane)}"
    )


def test_mapa_operacja_rodzaj_cytuje_rejestr_kanoniczny() -> None:
    """Każda operacja z mapy istnieje w `CANONICAL_OPERATIONS` (rejestr, z
    którego mapa jest wyprowadzona) — literówka w kluczu byłaby cichym
    wyłączeniem operacji z testu parytetu."""
    nieznane = set(_OPERACJA_RODZAJ) - set(CANONICAL_OPERATIONS)
    assert not nieznane, f"Operacje spoza CANONICAL_OPERATIONS: {sorted(nieznane)}"


@pytest.mark.parametrize("operacja,rodzaj", sorted(_OPERACJA_RODZAJ.items()))
def test_parytet_tworzenie_blocker_a_brama_operacji(operacja: str, rodzaj: str) -> None:
    """`wymagalnosc_katalogu(rodzaj).tworzenie is BLOCKER` <=> `operacja in
    CATALOG_REQUIRED_OPERATIONS` — z wyjątkiem jawnie nazwanych rozjazdów."""
    tabela_wymaga = wymagalnosc_katalogu(rodzaj).tworzenie is Poziom.BLOCKER
    w_bramie = operacja in CATALOG_REQUIRED_OPERATIONS

    if operacja in _ROZJAZD_TWORZENIE_ZNANY:
        assert tabela_wymaga and not w_bramie, (
            f"{operacja}: rozjazd na liście wyjątków przestał być rozjazdem "
            "(tabela i brama znów się zgadzają) — usuń pozycję z "
            "_ROZJAZD_TWORZENIE_ZNANY."
        )
        return

    assert tabela_wymaga == w_bramie, (
        f"{operacja} (rodzaj={rodzaj}): tabela mówi tworzenie="
        f"{'BLOCKER' if tabela_wymaga else 'nie-BLOCKER'}, brama operacji "
        f"{'wymaga' if w_bramie else 'NIE wymaga'} katalogu — rozjazd nienazwany. "
        "Dodaj do _ROZJAZD_TWORZENIE_ZNANY z uzasadnieniem ALBO napraw jedną ze "
        "stron."
    )


def test_rozjazd_znany_jest_podzbiorem_mapy_rodzajow() -> None:
    """Wyjątki dotyczą WYŁĄCZNIE operacji z mapy (nie mogą maskować literówki
    ani operacji spoza taksonomii)."""
    assert _ROZJAZD_TWORZENIE_ZNANY <= set(_OPERACJA_RODZAJ)
