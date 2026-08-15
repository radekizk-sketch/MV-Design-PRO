"""Shared catalog enforcement policy for domain operation API endpoints."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from network_model.catalog.materialization import (
    materialize_catalog_binding,
    validate_catalog_binding,
)
from network_model.catalog.types import CatalogBinding

DEFAULT_CATALOG_VERSION = "2024.1"

# Operations that require catalog binding in their payload
CATALOG_REQUIRED_OPERATIONS: frozenset[str] = frozenset(
    {
        "add_grid_source_sn",
        "add_sn_bay",
        "add_sn_bay_from_catalog",
        "continue_trunk_segment_sn",
        "insert_branch_pole_on_segment_sn",
        "start_branch_segment_sn",
        "insert_zksn_on_segment_sn",
        "insert_station_on_segment_sn",
        "append_station_on_endpoint",
        "add_transformer_sn_nn",
        "add_nn_load",
        "add_converter_source",
        "add_relay",
        "add_ct",
        "add_vt",
        "add_nn_outgoing_field",
        "insert_section_switch_sn",
        "connect_secondary_ring_sn",
    }
)


#: Operacje punktu pośredniego SN — pozycja rozstrzyga się we WŁASNYM katalogu
#: (ZKSN i słupy odgałęźne), poza `CatalogNamespace` i poza materializacją.
#: JEDNO ŹRÓDŁO dla obu miejsc, które ten wyjątek muszą znać: dedykowanej kontroli
#: istnienia pozycji i bramy kanału jawnej referencji.
_OPERACJE_PUNKTU_POSREDNIEGO_SN: frozenset[str] = frozenset(
    {"insert_branch_pole_on_segment_sn", "insert_zksn_on_segment_sn"}
)


@dataclass(frozen=True)
class CatalogPolicyError:
    """Canonical catalog policy error returned by API endpoints."""

    code: str
    message_pl: str
    errors: list[dict[str, str]]


def _binding_from_ref(namespace: str | None, catalog_ref: Any) -> dict[str, Any] | None:
    if not namespace or not isinstance(catalog_ref, str) or not catalog_ref.strip():
        return None
    return {
        "catalog_namespace": namespace,
        "catalog_item_id": catalog_ref.strip(),
        "catalog_item_version": DEFAULT_CATALOG_VERSION,
        "materialize": True,
        "snapshot_mapping_version": "1.0",
    }


def _extract_binding_from_container(
    container: Any,
    *,
    namespace: str | None = None,
    ref_keys: tuple[str, ...] = (),
) -> dict[str, Any] | None:
    if not isinstance(container, dict):
        return None

    binding = container.get("catalog_binding")
    if isinstance(binding, dict):
        return binding

    for key in ref_keys:
        synthesized = _binding_from_ref(namespace, container.get(key))
        if synthesized is not None:
            return synthesized

    return None


def _segment_namespace(segment: Any) -> str | None:
    if not isinstance(segment, dict):
        return None
    segment_kind = segment.get("rodzaj") or segment.get("segment_kind") or segment.get("type")
    if segment_kind in {"KABEL", "KABEL_SN", "cable"}:
        return "KABEL_SN"
    if segment_kind in {"LINIA_NAPOWIETRZNA", "LINIA_SN", "line_overhead"}:
        return "LINIA_SN"
    return None


def _explicit_namespace(payload: dict[str, Any]) -> str | None:
    namespace = payload.get("catalog_namespace")
    if isinstance(namespace, str) and namespace.strip():
        return namespace.strip()
    return None


def _converter_namespace(payload: dict[str, Any]) -> str | None:
    technology = payload.get("source_technology")
    if isinstance(technology, str):
        normalized = technology.strip().upper()
        if normalized == "PV":
            return "ZRODLO_NN_PV"
        if normalized == "BESS":
            return "ZRODLO_NN_BESS"
        if normalized == "FW":
            return "CONVERTER"
    return "CONVERTER"


def _uses_manual_grid_source_equivalent(payload: dict[str, Any]) -> bool:
    source_mode = payload.get("source_mode")
    parameter_source = payload.get("parameter_source")
    if source_mode in {"EKSPERCKI_RECZNY", "MANUAL", "MANUAL_EQUIVALENT"}:
        return True
    if parameter_source == "MANUAL_EQUIVALENT":
        return True
    return isinstance(payload.get("manual_equivalent"), dict)


def _manual_grid_source_equivalent_complete(payload: dict[str, Any]) -> bool:
    manual = payload.get("manual_equivalent")
    if not isinstance(manual, dict):
        return False

    voltage_kv = manual.get("voltage_kv", payload.get("voltage_kv"))
    if not isinstance(voltage_kv, int | float) or float(voltage_kv) <= 0:
        return False

    short_circuit_mode = (
        str(
            manual.get(
                "short_circuit_mode", payload.get("short_circuit_mode", "SHORT_CIRCUIT_POWER")
            )
        )
        .strip()
        .upper()
    )
    if short_circuit_mode == "IMPEDANCE":
        r_ohm = manual.get("r_ohm", payload.get("r_ohm"))
        x_ohm = manual.get("x_ohm", payload.get("x_ohm"))
        return (
            isinstance(r_ohm, int | float)
            and float(r_ohm) >= 0
            and isinstance(x_ohm, int | float)
            and float(x_ohm) > 0
        )

    sk3_mva = manual.get("sk3_mva", payload.get("sk3_mva"))
    rx_ratio = manual.get("rx_ratio", payload.get("rx_ratio"))
    return (
        isinstance(sk3_mva, int | float)
        and float(sk3_mva) > 0
        and isinstance(rx_ratio, int | float)
        and float(rx_ratio) > 0
    )


def extract_catalog_binding(operation: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    """Extract catalog_binding from payload, preferring canonical nested contracts."""

    if operation in {
        "continue_trunk_segment_sn",
        "start_branch_segment_sn",
        "connect_secondary_ring_sn",
    }:
        candidate = _extract_binding_from_container(
            payload.get("segment"),
            namespace=_segment_namespace(payload.get("segment")),
            ref_keys=("catalog_ref",),
        )
        if candidate is not None:
            return candidate

    if operation == "insert_station_on_segment_sn":
        candidate = _extract_binding_from_container(
            payload.get("transformer"),
            namespace="TRAFO_SN_NN",
            ref_keys=("transformer_catalog_ref",),
        )
        if candidate is not None:
            return candidate

    if operation == "append_station_on_endpoint":
        # Ref transformatora czytany DOKŁADNIE tak, jak czyta go operacja
        # domenowa (`transformer_catalog_ref` albo `catalog_ref`) — brama API
        # ma sprawdzać tę samą pozycję katalogową, która trafi do migawki.
        candidate = _extract_binding_from_container(
            payload.get("transformer"),
            namespace="TRAFO_SN_NN",
            ref_keys=("transformer_catalog_ref", "catalog_ref"),
        )
        if candidate is not None:
            return candidate

    if operation == "add_transformer_sn_nn":
        candidate = _extract_binding_from_container(
            payload,
            namespace="TRAFO_SN_NN",
            ref_keys=("transformer_catalog_ref", "catalog_ref"),
        )
        if candidate is not None:
            return candidate

    if operation == "add_grid_source_sn":
        candidate = _extract_binding_from_container(
            payload,
            namespace="ZRODLO_SN",
            ref_keys=("catalog_ref",),
        )
        if candidate is not None:
            return candidate

    if operation == "insert_section_switch_sn":
        candidate = _extract_binding_from_container(
            payload,
            namespace="APARAT_SN",
            ref_keys=("catalog_ref",),
        )
        if candidate is not None:
            return candidate

    # Aparat glowny pola SN: ta sama pozycja katalogu dla obu drog dokladania
    # pola (deklaracja rola+aparat oraz materializacja z katalogu rodzin). Brama
    # kluczujaca po nazwie operacji musi znac OBIE, inaczej ta sama literowka
    # daje raz 422, a raz `HTTP 200` z kodem bledu w tresci.
    if operation in {"add_sn_bay", "add_sn_bay_from_catalog"}:
        candidate = _extract_binding_from_container(
            payload,
            namespace="APARAT_SN",
            ref_keys=("catalog_ref",),
        )
        if candidate is not None:
            return candidate

    if operation == "add_nn_load":
        candidate = _extract_binding_from_container(
            payload.get("load") or payload,
            namespace="OBCIAZENIE",
            ref_keys=("catalog_ref",),
        )
        if candidate is not None:
            return candidate

    if operation == "add_converter_source":
        candidate = _extract_binding_from_container(
            payload,
            namespace=_converter_namespace(payload),
            ref_keys=("catalog_ref",),
        )
        if candidate is not None:
            return candidate

        materialized = payload.get("materialized_params")
        if isinstance(materialized, dict):
            synthesized = _binding_from_ref(
                _converter_namespace(payload),
                materialized.get("catalog_item_id"),
            )
            if synthesized is not None:
                version = materialized.get("catalog_item_version")
                if isinstance(version, str) and version.strip():
                    synthesized["catalog_item_version"] = version.strip()
                return synthesized

    if operation == "add_relay":
        candidate = _extract_binding_from_container(
            payload.get("protection") or payload,
            namespace="ZABEZPIECZENIE",
            ref_keys=("catalog_ref", "catalog_item_id"),
        )
        if candidate is not None:
            return candidate

    if operation == "add_ct":
        candidate = _extract_binding_from_container(
            payload.get("measurement") or payload,
            namespace="CT",
            ref_keys=("catalog_ref", "catalog_item_id"),
        )
        if candidate is not None:
            return candidate

    if operation == "add_vt":
        candidate = _extract_binding_from_container(
            payload.get("measurement") or payload,
            namespace="VT",
            ref_keys=("catalog_ref", "catalog_item_id"),
        )
        if candidate is not None:
            return candidate

    if operation == "add_nn_outgoing_field":
        candidate = _extract_binding_from_container(
            payload,
            namespace="APARAT_NN",
            ref_keys=("catalog_ref",),
        )
        if candidate is not None:
            return candidate

    if operation in _OPERACJE_PUNKTU_POSREDNIEGO_SN:
        candidate = _extract_binding_from_container(
            payload,
            namespace=_explicit_namespace(payload),
            ref_keys=("catalog_ref",),
        )
        if candidate is not None:
            return candidate

    candidate = _extract_binding_from_container(payload)
    if candidate is not None:
        return candidate

    for key in (
        "segment",
        "branch",
        "load",
        "protection",
        "transformer",
        "transformer_spec",
        "measurement",
        "relay_catalog_binding",
    ):
        nested = payload.get(key)
        if key == "relay_catalog_binding" and isinstance(nested, dict):
            return nested
        candidate = _extract_binding_from_container(nested)
        if candidate is not None:
            return candidate

    return _binding_from_ref(_explicit_namespace(payload), payload.get("catalog_ref"))


#: Operacje stacyjne — obie zakładają w JEDNEJ migawce cały podgraf stacji
#: (transformator, aparaty pól, wyposażenie pomiarowo-zabezpieczeniowe, źródło nN).
_STATION_OPERATIONS_WITH_FIELD_EQUIPMENT: frozenset[str] = frozenset(
    {
        "insert_station_on_segment_sn",
        "append_station_on_endpoint",
    }
)

#: Klucz wyposażenia pola → operacja, której bramę katalogową ma przejść.
_FIELD_EQUIPMENT_OPERATIONS: tuple[tuple[str, str], ...] = (
    ("ct", "add_ct"),
    ("vt", "add_vt"),
    ("relay", "add_relay"),
)

#: INWENTARZ BRAMY STACYJNEJ (defekt F) — KAŻDA referencja katalogowa czytana
#: Z PAYLOADU przez operacje stacyjne, wraz z operacją atomową, której bramę
#: katalogową ta referencja MUSI przejść (parytet torów).
#:
#: Karta A ogłosiła „bramę katalogową stacji", ale `extract_catalog_binding`
#: czytał WYŁĄCZNIE ref transformatora. Elementy powstające w TEJ SAMEJ operacji —
#: źródło OZE nN (`nn_block`) i aparat pola SN — deklarowały pochodzenie katalogowe
#: przy nieweryfikowanej pozycji, a moc czynna źródła wchodziła wprost do rozpływu.
#:
#: Ta lista jest KONTRAKTEM: test klasy skanuje `enm/domain_operations.py` i
#: czerwienieje, gdy operacja stacyjna zacznie czytać referencję spoza inwentarza.
STATION_CATALOG_REF_INVENTORY: tuple[tuple[str, str], ...] = (
    ("transformer.transformer_catalog_ref", "add_transformer_sn_nn"),
    ("transformer.catalog_ref", "add_transformer_sn_nn"),
    ("sn_fields[].apparatus_catalog_ref", "add_sn_bay"),
    ("field_apparatus_catalog_ref", "add_sn_bay"),
    ("sn_fields[].equipment.ct", "add_ct"),
    ("sn_fields[].equipment.vt", "add_vt"),
    ("sn_fields[].equipment.relay", "add_relay"),
    ("nn_block.source_converter_catalog_ref", "add_converter_source"),
    ("nn_block.source_protection.device_catalog_ref", "add_relay"),
)

#: Klucze payloadu z referencją katalogową, które operacjom stacyjnym wolno czytać.
#: Zbiór wyprowadzony z inwentarza powyżej — służy testowi klasy do skanu kodu
#: domenowego (`segment.catalog_ref` przy podziale odcinka pochodzi Z MODELU, nie
#: z payloadu, i był bramkowany przy tworzeniu odcinka).
STATION_CATALOG_REF_PAYLOAD_KEYS: frozenset[str] = frozenset(
    {
        "catalog_ref",
        "transformer_catalog_ref",
        "apparatus_catalog_ref",
        "field_apparatus_catalog_ref",
        "source_converter_catalog_ref",
        "device_catalog_ref",
    }
)

#: Klucze o kształcie WIĄZANIA katalogowego dopuszczone w operacjach stacyjnych.
#: Osobny zbiór, bo wiązanie jest drugą drogą wskazania pozycji katalogu i bez
#: niego skan klasy dałoby się obejść, podając `catalog_binding` zamiast
#: `catalog_ref`:
#:   * `catalog_binding` / `catalog_item_id` — kanoniczny kontrakt wiązania
#:     (transformator, wyposażenie pól) — czytany przez `extract_catalog_binding`;
#:   * `catalog_bindings` — INTENCJA zapisywana w `meta` specyfikacji pola/odpływu
#:     nN; z tego klucza operacja stacyjna NIE tworzy elementu (element źródła nN
#:     powstaje z `nn_block.source_converter_catalog_ref`, który brama sprawdza).
#:     Gdyby kiedyś zaczął tworzyć — trzeba go dopisać do inwentarza i bramy.
STATION_CATALOG_BINDING_KEYS: frozenset[str] = frozenset(
    {
        "catalog_binding",
        "catalog_bindings",
        "catalog_item_id",
    }
)

#: Konfiguracja bloku nN → technologia źródła. LUSTRO `_NN_SOURCE_KIND_MAP`
#: operacji domenowej: brak/nieznana konfiguracja albo brak referencji ⇒ operacja
#: NIE tworzy źródła, więc nie ma elementu wiązanego katalogiem i nie ma czego
#: bramkować (lustro warunku domenowego, nie furtka).
_NN_SOURCE_TECHNOLOGY: dict[str, str] = {
    "PV_INVERTER": "PV",
    "BESS_INVERTER": "BESS",
    "FW_INVERTER": "FW",
}


# ---------------------------------------------------------------------------
# INWENTARZ BRAMY KATALOGOWEJ API (dług 1 z V12K-316)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PozycjaBramyApi:
    """Jedna referencja katalogowa czytana Z PAYLOADU przez operację API."""

    operacja: str
    #: Ścieżka w payloadzie (ostatni człon = klucz czytany przez operację).
    sciezka: str
    #: Przestrzeń katalogu, w której referencja musi być rozstrzygalna
    #: (pusta dla pozycji, dla których katalogu NIE MA).
    przestrzen: str
    #: Czy BRAMA API sprawdza ISTNIENIE pozycji (a nie samą obecność referencji).
    bramkowana: bool
    #: Dlaczego — dla pozycji niebramkowanych uzasadnienie MERYTORYCZNE.
    uzasadnienie: str = ""


#: Pseudo-przestrzeń zaczepów: `transformer_tap_changer_catalog_ref` rozstrzyga się
#: w katalogu podobciążeniowych przełączników zaczepów (`get_tap_changer`), który NIE
#: jest kategorią `CatalogNamespace` i nie ma kontraktu materializacji.
PRZESTRZEN_ZACZEPY = "ZACZEPY_TRANSFORMATORA"

#: Pseudo-przestrzeń wiązań DER: `set_der_catalog_bindings` rozstrzyga zabezpieczenie
#: w DWÓCH zbiorach (repozytorium MV + katalog analityczny producentów), więc brama nie
#: może pytać samej materializacji — pyta predykatem operacji domenowej.
PRZESTRZEN_WIAZANIA_DER = "WIAZANIA_DER"

#: PEŁNY INWENTARZ BRAMY API (reguła KLASA, NIE INSTANCJA). Każda referencja
#: katalogowa czytana Z PAYLOADU przez operację, która przechodzi przez
#: `validate_and_materialize_catalog_binding`.
#:
#: DŁUG, KTÓRY TO ZAMYKA (dług 1 z V12K-316). Brama API znała WYŁĄCZNIE „główne"
#: wiązanie operacji (`extract_catalog_binding` zwraca JEDNO). Pozostałe referencje
#: tej samej operacji — aparat pola źródłowego nN, cały tor DER-SN (TR blokowy, kabel
#: SN, aparat pola SN), kompensator, ogranicznik, wiązania DER, transformator WN/SN
#: GPZ, aparat pól liniowych GPZ, zaczepy — odrzucała dopiero warstwa domenowa,
#: meldując `HTTP 200` z kodem błędu w treści. Projektant dostawał więc dla TEJ SAMEJ
#: literówki inny kontrakt odpowiedzi w zależności od tego, KTÓRĄ referencję pomylił.
#:
#: Ta lista jest KONTRAKTEM: test klasy sprawdza, że obejmuje w całości inwentarze
#: warstwy domenowej (`V2_CATALOG_GATE_INVENTORY`, `STATION_CATALOG_REF_INVENTORY`)
#: i że skan obu modułów operacji nie znajduje klucza spoza wyprowadzonych z niej
#: zbiorów.
API_CATALOG_GATE_INVENTORY: tuple[PozycjaBramyApi, ...] = (
    # --- Źródło systemowe GPZ (V1) -----------------------------------------
    PozycjaBramyApi("add_grid_source_sn", "catalog_ref", "ZRODLO_SN", True),
    PozycjaBramyApi("add_grid_source_sn", "catalog_binding", "ZRODLO_SN", True),
    PozycjaBramyApi("add_grid_source_sn", "transformer_catalog_ref", "TRAFO_SN_NN", True),
    PozycjaBramyApi("add_grid_source_sn", "transformer_catalog_binding", "TRAFO_SN_NN", True),
    PozycjaBramyApi(
        "add_grid_source_sn",
        "transformer_tap_changer_catalog_ref",
        PRZESTRZEN_ZACZEPY,
        True,
    ),
    PozycjaBramyApi(
        "add_grid_source_sn", "gpz_line_field_apparatus.catalog_binding", "APARAT_SN", True
    ),
    PozycjaBramyApi(
        "add_grid_source_sn", "gpz_line_field_apparatus.catalog_ref", "APARAT_SN", True
    ),
    # --- Odcinki ciągu SN (V1) ---------------------------------------------
    PozycjaBramyApi("continue_trunk_segment_sn", "segment.catalog_ref", "KABEL_SN|LINIA_SN", True),
    PozycjaBramyApi(
        "continue_trunk_segment_sn", "segment.catalog_binding", "KABEL_SN|LINIA_SN", True
    ),
    PozycjaBramyApi("start_branch_segment_sn", "segment.catalog_ref", "KABEL_SN|LINIA_SN", True),
    PozycjaBramyApi(
        "start_branch_segment_sn", "segment.catalog_binding", "KABEL_SN|LINIA_SN", True
    ),
    PozycjaBramyApi("connect_secondary_ring_sn", "segment.catalog_ref", "KABEL_SN|LINIA_SN", True),
    PozycjaBramyApi(
        "connect_secondary_ring_sn", "segment.catalog_binding", "KABEL_SN|LINIA_SN", True
    ),
    # --- Punkty pośrednie i łącznik sekcyjny SN (V1) ------------------------
    PozycjaBramyApi("insert_branch_pole_on_segment_sn", "catalog_ref", "PUNKT_POSREDNI_SN", True),
    PozycjaBramyApi("insert_zksn_on_segment_sn", "catalog_ref", "PUNKT_POSREDNI_SN", True),
    PozycjaBramyApi("insert_section_switch_sn", "catalog_ref", "APARAT_SN", True),
    PozycjaBramyApi("insert_section_switch_sn", "catalog_binding", "APARAT_SN", True),
    # --- Transformator SN/nN wolnostojący (V1) ------------------------------
    PozycjaBramyApi("add_transformer_sn_nn", "transformer_catalog_ref", "TRAFO_SN_NN", True),
    PozycjaBramyApi("add_transformer_sn_nn", "catalog_ref", "TRAFO_SN_NN", True),
    PozycjaBramyApi(
        "add_transformer_sn_nn",
        "transformer_tap_changer_catalog_ref",
        PRZESTRZEN_ZACZEPY,
        True,
    ),
    # --- Operacje stacyjne (V1) — lustro `STATION_CATALOG_REF_INVENTORY` -----
    PozycjaBramyApi(
        "insert_station_on_segment_sn", "transformer.transformer_catalog_ref", "TRAFO_SN_NN", True
    ),
    PozycjaBramyApi(
        "insert_station_on_segment_sn", "sn_fields[].apparatus_catalog_ref", "APARAT_SN", True
    ),
    PozycjaBramyApi(
        "insert_station_on_segment_sn", "field_apparatus_catalog_ref", "APARAT_SN", True
    ),
    PozycjaBramyApi("insert_station_on_segment_sn", "sn_fields[].equipment.ct", "CT", True),
    PozycjaBramyApi("insert_station_on_segment_sn", "sn_fields[].equipment.vt", "VT", True),
    PozycjaBramyApi(
        "insert_station_on_segment_sn", "sn_fields[].equipment.relay", "ZABEZPIECZENIE", True
    ),
    PozycjaBramyApi(
        "insert_station_on_segment_sn",
        "nn_block.source_converter_catalog_ref",
        "ZRODLO_NN_PV|ZRODLO_NN_BESS|CONVERTER",
        True,
    ),
    PozycjaBramyApi(
        "insert_station_on_segment_sn",
        "nn_block.source_protection.device_catalog_ref",
        "ZABEZPIECZENIE",
        True,
    ),
    PozycjaBramyApi(
        "insert_station_on_segment_sn",
        "transformer.transformer_tap_changer_catalog_ref",
        PRZESTRZEN_ZACZEPY,
        True,
    ),
    PozycjaBramyApi(
        "append_station_on_endpoint", "transformer.transformer_catalog_ref", "TRAFO_SN_NN", True
    ),
    #: `transformer.catalog_ref` czyta WYŁĄCZNIE `append_station_on_endpoint`
    #: (`transformer_catalog_ref or catalog_ref`) — `insert_station_on_segment_sn`
    #: zna sam `transformer_catalog_ref`. Brama jest LUSTREM tej różnicy: dopisanie
    #: pozycji tam, gdzie operacja jej nie czyta, byłoby fikcją inwentarza.
    PozycjaBramyApi("append_station_on_endpoint", "transformer.catalog_ref", "TRAFO_SN_NN", True),
    PozycjaBramyApi(
        "append_station_on_endpoint", "sn_fields[].apparatus_catalog_ref", "APARAT_SN", True
    ),
    PozycjaBramyApi("append_station_on_endpoint", "field_apparatus_catalog_ref", "APARAT_SN", True),
    PozycjaBramyApi("append_station_on_endpoint", "sn_fields[].equipment.ct", "CT", True),
    PozycjaBramyApi("append_station_on_endpoint", "sn_fields[].equipment.vt", "VT", True),
    PozycjaBramyApi(
        "append_station_on_endpoint", "sn_fields[].equipment.relay", "ZABEZPIECZENIE", True
    ),
    PozycjaBramyApi(
        "append_station_on_endpoint",
        "nn_block.source_converter_catalog_ref",
        "ZRODLO_NN_PV|ZRODLO_NN_BESS|CONVERTER",
        True,
    ),
    PozycjaBramyApi(
        "append_station_on_endpoint",
        "nn_block.source_protection.device_catalog_ref",
        "ZABEZPIECZENIE",
        True,
    ),
    PozycjaBramyApi(
        "append_station_on_endpoint",
        "transformer.transformer_tap_changer_catalog_ref",
        PRZESTRZEN_ZACZEPY,
        True,
    ),
    # --- Wyposażenie pól i odbiory (V2) ------------------------------------
    PozycjaBramyApi("add_ct", "catalog_ref", "CT", True),
    PozycjaBramyApi("add_ct", "catalog_binding", "CT", True),
    PozycjaBramyApi("add_vt", "catalog_ref", "VT", True),
    PozycjaBramyApi("add_vt", "catalog_binding", "VT", True),
    PozycjaBramyApi("add_relay", "catalog_ref", "ZABEZPIECZENIE", True),
    PozycjaBramyApi("add_relay", "protection.catalog_item_id", "ZABEZPIECZENIE", True),
    PozycjaBramyApi("add_sn_bay", "catalog_binding", "APARAT_SN", True),
    PozycjaBramyApi("add_sn_bay_from_catalog", "catalog_binding", "APARAT_SN", True),
    PozycjaBramyApi("add_nn_load", "catalog_binding", "OBCIAZENIE", True),
    PozycjaBramyApi(
        "add_nn_outgoing_field",
        "catalog_ref",
        "APARAT_NN",
        True,
        "brama jest tu SUROWSZA od operacji: odpływ/pole źródłowe nN zapisuje samą "
        "specyfikację pola i katalogu nie czyta. Wymóg wiązania zostaje (fail-closed, "
        "kontrakt kreatora nN), a jego istnienie sprawdza ta sama materializacja co "
        "dla aparatu pola — osłabienie byłoby regresją, nie naprawą.",
    ),
    # --- Źródło przekształtnikowe: tor nN i tor DER-SN (V2) ------------------
    PozycjaBramyApi(
        "add_converter_source",
        "catalog_ref",
        "ZRODLO_NN_PV|ZRODLO_NN_BESS|CONVERTER",
        True,
    ),
    PozycjaBramyApi(
        "add_converter_source",
        "materialized_params",
        "",
        False,
        "tabliczka z payloadu NIE JEST referencją katalogową — jest DEKLARACJĄ "
        "weryfikowaną wobec katalogu przez operację domenową (rozbieżność ⇒ "
        "`catalog.nameplate_mismatch`), a końcówka porównuje materializację bramy z "
        "tabliczką zapisaną do migawki (`catalog.gate_result_mismatch`). Nie ma tu "
        "pozycji katalogu, której istnienia można by osobno dowieść.",
    ),
    PozycjaBramyApi("add_converter_source", "source_field.catalog_binding", "APARAT_NN", True),
    PozycjaBramyApi(
        "add_converter_source", "der_topology.block_transformer.catalog_ref", "TRAFO_SN_NN", True
    ),
    PozycjaBramyApi(
        "add_converter_source",
        "der_topology.block_transformer.catalog_binding",
        "TRAFO_SN_NN",
        True,
    ),
    PozycjaBramyApi(
        "add_converter_source",
        "der_topology.mv_field_configuration.cable_catalog_ref",
        "KABEL_SN",
        True,
    ),
    PozycjaBramyApi(
        "add_converter_source",
        "der_topology.mv_field_configuration.cable_catalog_binding",
        "KABEL_SN",
        True,
    ),
    PozycjaBramyApi(
        "add_converter_source",
        "der_topology.mv_field_configuration.apparatus_catalog_binding",
        "APARAT_SN",
        True,
    ),
    # --- Kompensacja, ograniczniki, wiązania DER (V2) -----------------------
    PozycjaBramyApi("add_shunt_compensator_sn", "catalog_binding", "KOMPENSATOR_SN", True),
    PozycjaBramyApi("add_surge_arrester_sn", "catalog_binding", "OGRANICZNIK_SN", True),
    PozycjaBramyApi(
        "set_der_catalog_bindings", "protection_catalog_ref", PRZESTRZEN_WIAZANIA_DER, True
    ),
    PozycjaBramyApi("set_der_catalog_bindings", "ct_catalog_ref", PRZESTRZEN_WIAZANIA_DER, True),
    PozycjaBramyApi("set_der_catalog_bindings", "vt_catalog_ref", PRZESTRZEN_WIAZANIA_DER, True),
    # --- Pozycje, dla których katalogu NIE MA ------------------------------
    PozycjaBramyApi(
        "add_genset_nn",
        "genset_spec",
        "",
        False,
        "agregat prądotwórczy nie ma kategorii w katalogu, więc payload jest jedynym "
        "źródłem tabliczki — i element to przyznaje (bez `catalog_ref`, bez "
        "`source_mode: KATALOG`). Nie istnieje pozycja, wobec której brama mogłaby "
        "cokolwiek zweryfikować; to dług katalogu, nie furtka bramy.",
    ),
    PozycjaBramyApi(
        "add_ups_nn",
        "ups_spec",
        "",
        False,
        "UPS — jak agregat: brak kategorii katalogu, element deklaruje tabliczkę jawnie "
        "ekspercką i nie udaje pochodzenia katalogowego. Bramkowanie wymagałoby "
        "najpierw dostawcy danych katalogowych.",
    ),
    PozycjaBramyApi(
        "assign_catalog_to_element",
        "catalog_item_id",
        "",
        False,
        "przestrzeń katalogu wynika z ELEMENTU modelu (`_infer_catalog_namespace_for_"
        "element`), a kontrakt bramy to `(operacja, payload)` — migawki nie widzi. "
        "Bramkowanie połowiczne (tylko gdy formularz poda `catalog_namespace`) dałoby "
        "predykat zależny od tego, czy klient akurat wysłał pole, czyli dokładnie ten "
        "rozjazd, przed którym broni ta karta. Istnienie sprawdza warstwa domenowa "
        "przy materializacji gałęzi i transformatora; rozszerzenie kontraktu bramy o "
        "migawkę jest osobną kartą.",
    ),
    PozycjaBramyApi(
        "update_element_parameters",
        "catalog_binding",
        "",
        False,
        "jak `assign_catalog_to_element`: przestrzeń pochodzi z elementu w migawce, "
        "której brama nie dostaje. Operacja aktualizuje parametry istniejącego "
        "elementu, a jego wiązanie katalogowe zostało zbramkowane przy tworzeniu.",
    ),
)

#: Klucze payloadu z referencją katalogową dopuszczone w operacjach domenowych.
#: Zbiór WYPROWADZONY z inwentarza (test klasy pilnuje zgodności obu stron oraz
#: tego, że skan obu modułów operacji nie znajduje klucza spoza zbioru).
API_CATALOG_REF_PAYLOAD_KEYS: frozenset[str] = frozenset(
    {
        "catalog_ref",
        "apparatus_catalog_ref",
        "cable_catalog_ref",
        "ct_catalog_ref",
        "device_catalog_ref",
        "field_apparatus_catalog_ref",
        "protection_catalog_ref",
        "source_converter_catalog_ref",
        "transformer_catalog_ref",
        "transformer_tap_changer_catalog_ref",
        "vt_catalog_ref",
        # Klucz ODPOWIEDZI (metadane dziedziczenia katalogu przez połówki odcinka),
        # nie kanał wskazania pozycji — operacja go ZAPISUJE, nigdy z niego nie czyta.
        "source_catalog_ref",
    }
)

#: Klucze o kształcie WIĄZANIA katalogowego dopuszczone w operacjach domenowych.
#: Osobny zbiór, bo wiązanie jest DRUGĄ drogą wskazania pozycji — bez tej połowy
#: skanu dałoby się obejść inwentarz, podając `catalog_binding` zamiast `catalog_ref`.
API_CATALOG_BINDING_KEYS: frozenset[str] = frozenset(
    {
        "catalog_binding",
        "catalog_item_id",
        "catalog_item_version",
        "catalog_namespace",
        "apparatus_catalog_binding",
        "cable_catalog_binding",
        "transformer_catalog_binding",
        # INTENCJA zapisywana w `meta` specyfikacji pola nN — z tego klucza operacja
        # nie tworzy elementu (źródło nN powstaje z `source_converter_catalog_ref`).
        "catalog_bindings",
        # Znacznik migawki („pole czeka na wskazanie aparatu"), nie kanał wskazania.
        "requires_catalog_binding",
    }
)


def _ref_z_wiazania(binding: Any) -> str | None:
    """Identyfikator pozycji z wiązania katalogowego albo ``None``."""
    if not isinstance(binding, dict):
        return None
    return _tekst_referencji(binding.get("catalog_item_id")) or _tekst_referencji(
        binding.get("catalog_ref")
    )


def _przestrzen_z_wiazania(binding: Any, domyslna: str) -> str:
    """Przestrzeń z wiązania, a gdy jej nie podano — przestrzeń pozycji inwentarza."""
    if isinstance(binding, dict):
        namespace = binding.get("catalog_namespace")
        if isinstance(namespace, str) and namespace.strip():
            return namespace.strip()
    return domyslna


def _blad_pozycji_api(
    *,
    przestrzen: str,
    referencja: str,
    opis_pl: str,
) -> CatalogPolicyError | None:
    """Wskazana pozycja katalogowa musi ISTNIEĆ — inaczej 422 `catalog.item_not_found`.

    PARYTET KODU (§2.3 karty): zła referencja daje TEN SAM kod i TEN SAM kształt
    odpowiedzi niezależnie od operacji i przestrzeni katalogu. Wcześniej część
    referencji odrzucała dopiero warstwa domenowa, meldując `HTTP 200` z kodem
    właściwym dla operacji (`shunt.catalog_not_found`, `spd.catalog_not_found`,
    `der_bindings.catalog_ref_unknown`) — inny kontrakt dla tej samej pomyłki.
    """
    if przestrzen == PRZESTRZEN_ZACZEPY:
        from network_model.catalog.audit2_catalogs import get_tap_changer

        if get_tap_changer(referencja) is not None:
            return None
        komunikat = (
            f"Pozycja katalogowa '{referencja}' nie istnieje w katalogu przełączników "
            "zaczepów. Wskaż pozycję istniejącą w katalogu."
        )
        return CatalogPolicyError(
            code="catalog.item_not_found",
            message_pl=f"{opis_pl}: {komunikat}",
            errors=[{"code": "catalog.item_not_found", "message_pl": komunikat}],
        )

    binding_data = _binding_from_ref(przestrzen, referencja)
    if binding_data is None:
        return None
    if validate_catalog_binding(binding_data):
        # Nieznana kategoria katalogu podana w payloadzie — ten sam kontrakt co
        # dla wiązania głównego (brama nie zgaduje kategorii za klienta).
        komunikat = f"Nieznana kategoria katalogu: {przestrzen}"
        return CatalogPolicyError(
            code="catalog.unknown_namespace",
            message_pl=f"{opis_pl}: {komunikat}",
            errors=[{"code": "catalog.unknown_namespace", "message_pl": komunikat}],
        )

    from network_model.catalog.repository import get_default_mv_catalog

    wynik = materialize_catalog_binding(
        CatalogBinding.from_dict(binding_data), get_default_mv_catalog()
    )
    if wynik.success:
        return None
    kod = wynik.error_code or "catalog.materialization_failed"
    komunikat = wynik.error_message_pl or "Błąd materializacji katalogu"
    return CatalogPolicyError(
        code=kod,
        message_pl=f"{opis_pl}: {komunikat}",
        errors=[{"code": kod, "message_pl": komunikat}],
    )


def _referencje_dodatkowe(
    operation: str,
    payload: dict[str, Any],
) -> list[tuple[str, str, str]]:
    """Referencje inwentarza OBECNE w payloadzie: ``(opis_pl, przestrzeń, referencja)``.

    Kolejność odczytu każdej pozycji jest LUSTREM operacji domenowej (jawna
    referencja → identyfikator z wiązania), żeby brama sprawdzała DOKŁADNIE tę
    pozycję, która trafi do migawki. Referencja nieobecna nie jest bramkowana —
    obecność wymuszają `CATALOG_REQUIRED_OPERATIONS` i warstwa domenowa.
    """
    znalezione: list[tuple[str, str, str]] = []

    def _dodaj(opis_pl: str, domyslna_przestrzen: str, ref: Any, binding: Any = None) -> None:
        referencja = _tekst_referencji(ref) or _ref_z_wiazania(binding)
        if referencja is not None:
            znalezione.append(
                (opis_pl, _przestrzen_z_wiazania(binding, domyslna_przestrzen), referencja)
            )

    if operation == "add_grid_source_sn":
        _dodaj(
            "Transformator WN/SN GPZ",
            "TRAFO_SN_NN",
            payload.get("transformer_catalog_ref"),
            payload.get("transformer_catalog_binding"),
        )
        aparat_gpz = payload.get("gpz_line_field_apparatus")
        if isinstance(aparat_gpz, dict):
            # LUSTRO `_normalize_gpz_line_field_apparatus`: wiązanie ma pierwszeństwo,
            # potem `catalog_ref`/`catalog_item_id` na wierzchu bloku.
            _dodaj(
                "Aparat pól liniowych GPZ",
                "APARAT_SN",
                _ref_z_wiazania(aparat_gpz.get("catalog_binding"))
                or aparat_gpz.get("catalog_ref")
                or aparat_gpz.get("catalog_item_id"),
                aparat_gpz.get("catalog_binding"),
            )

    if operation in {"add_grid_source_sn", "add_transformer_sn_nn"}:
        _dodaj(
            "Przełącznik zaczepów transformatora",
            PRZESTRZEN_ZACZEPY,
            payload.get("transformer_tap_changer_catalog_ref"),
        )

    if operation in _STATION_OPERATIONS_WITH_FIELD_EQUIPMENT:
        transformer = payload.get("transformer")
        if isinstance(transformer, dict):
            _dodaj(
                "Przełącznik zaczepów transformatora stacji",
                PRZESTRZEN_ZACZEPY,
                transformer.get("transformer_tap_changer_catalog_ref"),
            )

    if operation == "add_converter_source":
        source_field = payload.get("source_field")
        if isinstance(source_field, dict):
            _dodaj(
                "Aparat pola źródłowego nN",
                "APARAT_NN",
                None,
                source_field.get("catalog_binding"),
            )
        der_topology = payload.get("der_topology")
        if isinstance(der_topology, dict):
            block = der_topology.get("block_transformer")
            if isinstance(block, dict):
                _dodaj(
                    "Transformator blokowy DER",
                    "TRAFO_SN_NN",
                    block.get("catalog_ref"),
                    block.get("catalog_binding"),
                )
            pole_sn = der_topology.get("mv_field_configuration")
            if isinstance(pole_sn, dict):
                _dodaj(
                    "Kabel SN przyłączeniowy DER",
                    "KABEL_SN",
                    pole_sn.get("cable_catalog_ref"),
                    pole_sn.get("cable_catalog_binding"),
                )
                _dodaj(
                    "Aparat pola źródłowego SN",
                    "APARAT_SN",
                    None,
                    pole_sn.get("apparatus_catalog_binding"),
                )

    if operation == "add_shunt_compensator_sn":
        _dodaj(
            "Bateria kondensatorów SN",
            "KOMPENSATOR_SN",
            _ref_z_wiazania(payload.get("catalog_binding"))
            or payload.get("catalog_item_id")
            or payload.get("catalog_ref"),
            payload.get("catalog_binding"),
        )

    if operation == "add_surge_arrester_sn":
        _dodaj(
            "Ogranicznik przepięć SN",
            "OGRANICZNIK_SN",
            _ref_z_wiazania(payload.get("catalog_binding"))
            or payload.get("catalog_item_id")
            or payload.get("catalog_ref"),
            payload.get("catalog_binding"),
        )

    return znalezione


def _blad_wiazan_der(operation: str, payload: dict[str, Any]) -> CatalogPolicyError | None:
    """Wiązania katalogowe wytwórcy — predykat JEDEN, wzięty z operacji domenowej.

    `set_der_catalog_bindings` rozstrzyga zabezpieczenie w DWÓCH zbiorach naraz
    (repozytorium katalogu MV ma 12 wpisów, katalog analityczny producentów — 51,
    i to jego wystawia picker). Brama, która pytałaby samej materializacji,
    odrzucałaby 39 z 51 urządzeń widocznych dla projektanta. Dlatego pyta TĄ SAMĄ
    funkcją, co warstwa domenowa — dwa niezależne predykaty „dziś zgodne" są
    defektem oczekującym na dane brzegowe.
    """
    if operation != "set_der_catalog_bindings":
        return None

    from enm.domain_operations_v2 import DER_BINDING_KEYS, _nieznane_referencje_katalogowe

    wiazania = {klucz: payload[klucz] for klucz in DER_BINDING_KEYS if klucz in payload}
    nieznane = _nieznane_referencje_katalogowe(wiazania)
    if not nieznane:
        return None
    komunikat = (
        "Referencje katalogowe nie istnieją w katalogu: "
        + ", ".join(nieznane)
        + ". Wskaż pozycję istniejącą w katalogu."
    )
    return CatalogPolicyError(
        code="catalog.item_not_found",
        message_pl=f"Wiązania katalogowe wytwórcy: {komunikat}",
        errors=[{"code": "catalog.item_not_found", "message_pl": komunikat}],
    )


def _bez_wiazan(dane: Any) -> Any:
    """Kopia payloadu BEZ wiązań katalogowych — zostaje sam kanał jawnej referencji."""
    if isinstance(dane, dict):
        return {k: _bez_wiazan(v) for k, v in dane.items() if k != "catalog_binding"}
    if isinstance(dane, list):
        return [_bez_wiazan(v) for v in dane]
    return dane


def _blad_kanalu_jawnej_referencji(
    operation: str,
    payload: dict[str, Any],
) -> CatalogPolicyError | None:
    """Gdy payload wskazuje pozycję DWOMA kanałami, brama sprawdza OBA.

    ROZJAZD KOLEJNOŚCI ODCZYTU. `extract_catalog_binding` woli `catalog_binding`,
    a część operacji domenowych czyta NAJPIERW `catalog_ref` (`_require_catalog_ref`
    dla odcinka ciągu, transformatora stacji, TR blokowego DER). Payload niosący
    OBA kanały z RÓŻNYMI pozycjami dawał więc bramę sprawdzającą jedną pozycję,
    a migawkę budowaną z drugiej — czyli dokładnie ten defekt, przed którym broni
    ta karta, tylko o jeden kanał dalej.

    Rozstrzygnięcie: obie wskazane pozycje muszą ISTNIEĆ. Kanał jawnej referencji
    wyprowadzamy TĄ SAMĄ funkcją (`extract_catalog_binding` na payloadzie bez
    wiązań), więc nie powstaje drugi, niezależny predykat. Payload wskazujący dwie
    ISTNIEJĄCE pozycje nie jest tu odrzucany — wybór między nimi należy do operacji
    domenowej i jest deterministyczny.
    """
    if operation not in CATALOG_REQUIRED_OPERATIONS:
        # Operacje spoza tego zbioru mają w inwentarzu WŁASNE pozycje (kompensator,
        # ogranicznik, wiązania DER) sprawdzane wprost, albo są jawnie niebramkowane
        # (przestrzeń wynika z elementu migawki, której brama nie widzi). Rozszerzanie
        # kanału jawnej referencji na nie rozjechałoby się z inwentarzem.
        return None
    if operation in _OPERACJE_PUNKTU_POSREDNIEGO_SN:
        # Punkt pośredni SN ma WŁASNY katalog (poza `CatalogNamespace`), a jego
        # istnienie sprawdza dedykowana kontrola w `validate_and_materialize_
        # catalog_binding`. Obie drogi trafiają tam w tę samą pozycję.
        return None

    glowne = extract_catalog_binding(operation, payload)
    if glowne is None:
        return None
    jawne = extract_catalog_binding(operation, _bez_wiazan(payload))
    if jawne is None:
        return None
    pozycja = jawne.get("catalog_item_id")
    if not isinstance(pozycja, str) or pozycja == glowne.get("catalog_item_id"):
        return None
    przestrzen = jawne.get("catalog_namespace")
    if not isinstance(przestrzen, str) or not przestrzen:
        return None
    return _blad_pozycji_api(
        przestrzen=przestrzen,
        referencja=pozycja,
        opis_pl="Pozycja wskazana jawną referencją katalogową",
    )


def _blad_referencji_inwentarza(
    operation: str,
    payload: dict[str, Any],
) -> CatalogPolicyError | None:
    """Brama zna KAŻDY ref katalogowy, który operacja czyta (dług 1 z V12K-316)."""
    for opis_pl, przestrzen, referencja in _referencje_dodatkowe(operation, payload):
        blad = _blad_pozycji_api(przestrzen=przestrzen, referencja=referencja, opis_pl=opis_pl)
        if blad is not None:
            return blad
    blad_kanalu = _blad_kanalu_jawnej_referencji(operation, payload)
    if blad_kanalu is not None:
        return blad_kanalu
    return _blad_wiazan_der(operation, payload)


def _validate_field_equipment_bindings(
    operation: str,
    payload: dict[str, Any],
) -> CatalogPolicyError | None:
    """B-3: brama katalogowa wyposażenia pól wskazanego w operacji stacyjnej.

    PARYTET TORÓW: CT/VT/zabezpieczenie zakładane W OPERACJI STACYJNEJ przechodzi
    DOKŁADNIE tę samą bramę katalogową co wołane osobno `add_ct`/`add_vt`/
    `add_relay`. Bez tego ta sama pozycja katalogowa byłaby sprawdzana w jednym
    torze, a w drugim nie — czyli tor atomowy byłby furtką omijającą katalog.
    """
    if operation not in _STATION_OPERATIONS_WITH_FIELD_EQUIPMENT:
        return None

    sn_fields = payload.get("sn_fields")
    if not isinstance(sn_fields, list):
        return None

    for index, field in enumerate(sn_fields, start=1):
        if not isinstance(field, dict):
            continue
        equipment = field.get("equipment")
        if not isinstance(equipment, dict):
            continue
        for klucz, nazwa_operacji in _FIELD_EQUIPMENT_OPERATIONS:
            dane = equipment.get(klucz)
            if not isinstance(dane, dict) or not dane:
                continue
            blad, _ = validate_and_materialize_catalog_binding(nazwa_operacji, dane)
            if blad is not None:
                return CatalogPolicyError(
                    code=blad.code,
                    message_pl=f"Pole SN nr {index}: {blad.message_pl}",
                    errors=blad.errors,
                )
    return None


def _tekst_referencji(wartosc: Any) -> str | None:
    """Referencja katalogowa jako niepusty tekst albo ``None``."""
    if isinstance(wartosc, str) and wartosc.strip():
        return wartosc.strip()
    return None


def _blad_z_prefiksem(
    blad: CatalogPolicyError,
    prefiks_pl: str,
) -> CatalogPolicyError:
    """Ten sam kod i te same szczegóły, komunikat wskazuje MIEJSCE w stacji."""
    return CatalogPolicyError(
        code=blad.code,
        message_pl=f"{prefiks_pl}: {blad.message_pl}",
        errors=blad.errors,
    )


def _validate_station_field_apparatus_bindings(
    operation: str,
    payload: dict[str, Any],
) -> CatalogPolicyError | None:
    """Brama katalogowa aparatu pól SN zakładanego w operacji stacyjnej (defekt F).

    PARYTET TORÓW: aparat wskazany w operacji stacyjnej przechodzi DOKŁADNIE tę
    samą bramę co wołany osobno `add_sn_bay` / `insert_section_switch_sn`, gdzie
    ta sama referencja jest odrzucana kodem `catalog.item_not_found`.

    Kolejność odczytu jest LUSTREM `_sn_field_apparatus_catalog_ref`: referencja
    pola → wspólna referencja payloadu. Brak obu ⇒ nie bramkujemy tutaj —
    operacja domenowa zwraca wtedy jawny błąd wskazujący konkretne pole.
    """
    if operation not in _STATION_OPERATIONS_WITH_FIELD_EQUIPMENT:
        return None

    wspolny_ref = _tekst_referencji(payload.get("field_apparatus_catalog_ref"))
    sn_fields = payload.get("sn_fields")
    pola = sn_fields if isinstance(sn_fields, list) else []

    sprawdzone: set[str] = set()
    for index, pole in enumerate(pola, start=1):
        ref = (
            _tekst_referencji(pole.get("apparatus_catalog_ref")) if isinstance(pole, dict) else None
        )
        ref = ref or wspolny_ref
        if ref is None or ref in sprawdzone:
            continue
        sprawdzone.add(ref)
        blad, _ = validate_and_materialize_catalog_binding("add_sn_bay", {"catalog_ref": ref})
        if blad is not None:
            return _blad_z_prefiksem(blad, f"Aparat pola SN nr {index}")

    # Pola domyślne (payload bez `sn_fields`) też dostają aparat — ze wspólnej
    # referencji payloadu; bez tego sprawdzenia zostałaby ona poza bramą.
    if not pola and wspolny_ref is not None and wspolny_ref not in sprawdzone:
        blad, _ = validate_and_materialize_catalog_binding(
            "add_sn_bay", {"catalog_ref": wspolny_ref}
        )
        if blad is not None:
            return _blad_z_prefiksem(blad, "Aparat pól SN stacji")

    return None


def _validate_station_nn_block_bindings(
    operation: str,
    payload: dict[str, Any],
) -> CatalogPolicyError | None:
    """Brama katalogowa bloku nN stacji: falownik OZE + zabezpieczenie źródła (defekt F).

    PARYTET TORÓW: falownik zakładany w operacji stacyjnej przechodzi tę samą bramę
    co `add_converter_source`, a urządzenie zabezpieczeniowe źródła — tę samą co
    `add_relay`. Bez tego generator OZE nN powstawał z `source_mode: KATALOG` przy
    referencji, której w katalogu nie ma, a jego `p_mw` wchodziło do bilansu
    rozpływu jako generacja na szynie nN.
    """
    if operation not in _STATION_OPERATIONS_WITH_FIELD_EQUIPMENT:
        return None

    nn_block = payload.get("nn_block")
    if not isinstance(nn_block, dict):
        return None

    konfiguracja = nn_block.get("nn_configuration")
    technologia = (
        _NN_SOURCE_TECHNOLOGY.get(konfiguracja.strip()) if isinstance(konfiguracja, str) else None
    )
    converter_ref = _tekst_referencji(nn_block.get("source_converter_catalog_ref"))
    if technologia is None or converter_ref is None:
        # Operacja domenowa wychodzi wtedy bez utworzenia źródła — nie powstaje
        # ŻADEN element wiązany katalogiem, więc nie ma czego bramkować (dotyczy
        # to także `source_protection`, którego operacja w ogóle nie czyta).
        return None

    blad, _ = validate_and_materialize_catalog_binding(
        "add_converter_source",
        {"catalog_ref": converter_ref, "source_technology": technologia},
    )
    if blad is not None:
        return _blad_z_prefiksem(blad, "Źródło nN stacji")

    source_protection = nn_block.get("source_protection")
    if isinstance(source_protection, dict):
        protection_ref = _tekst_referencji(source_protection.get("device_catalog_ref"))
        if protection_ref is not None:
            blad, _ = validate_and_materialize_catalog_binding(
                "add_relay", {"catalog_ref": protection_ref}
            )
            if blad is not None:
                return _blad_z_prefiksem(blad, "Zabezpieczenie źródła nN stacji")

    return None


def _append_station_tworzy_transformator(payload: dict[str, Any]) -> bool:
    """Czy `append_station_on_endpoint` w ogóle utworzy transformator?

    Warunek jest LUSTREM warunku operacji domenowej (`if transformer_catalog_ref:`).
    Stacja bez transformatora jest kanoniczna (samo pole liniowe na końcu ciągu) —
    wtedy nie powstaje żaden element wiązany katalogiem TRAFO_SN_NN i nie ma czego
    materializować. Gdy ref JEST podany, brama katalogowa obowiązuje bez wyjątku.
    """
    transformer = payload.get("transformer")
    if not isinstance(transformer, dict):
        return False
    return bool(transformer.get("transformer_catalog_ref") or transformer.get("catalog_ref"))


def _proba_konfiguracji_pola_bez_zapisu(operation: str, payload: dict[str, Any]) -> bool:
    """Próba konfiguracji pola katalogowego, która NICZEGO nie tworzy.

    Wymóg wiązania katalogowego chroni ELEMENT, który operacja zapisuje do
    modelu. `add_sn_bay_from_catalog` w trybie próby nie zapisuje niczego —
    zwraca werdykt zgodności konfiguracji katalogowej (rodzina · pole · blok ·
    jednostka), czyli rozstrzyga krok, który w konfiguratorze POPRZEDZA wybór
    konkretnej pozycji aparatu. Żądanie pozycji aparatu do werdyktu o niczym
    zablokowałoby dokładnie ten krok.

    Wyjątek dotyczy WYŁĄCZNIE braku wiązania: próba, która wiązanie PODAJE,
    przechodzi pełną walidację i materializację jak każde inne żądanie —
    nieistniejąca pozycja kończy się kodem 422 również w trybie próby. To ten
    sam kształt, co wyjątek `append_station_on_endpoint` bez transformatora:
    brama pilnuje elementów, które naprawdę powstają.
    """
    return operation == "add_sn_bay_from_catalog" and bool(payload.get("dry_run"))


def validate_and_materialize_catalog_binding(
    operation: str,
    payload: dict[str, Any],
) -> tuple[CatalogPolicyError | None, dict[str, Any]]:
    """Apply canonical catalog policy (binding + materialization dry-run).

    Returns:
      - CatalogPolicyError when operation must be rejected
      - materialized solver params (dry-run) when binding is valid and resolvable
    """
    # BRAMA STACYJNA (defekt F) — pełny inwentarz referencji katalogowych operacji
    # stacyjnych. Kontrole stoją PRZED wyjściem dla stacji bez transformatora: brak
    # transformatora nie zwalnia aparatu pól ani źródła nN z katalogu.
    equipment_error = _validate_field_equipment_bindings(operation, payload)
    if equipment_error is not None:
        return equipment_error, {}

    apparatus_error = _validate_station_field_apparatus_bindings(operation, payload)
    if apparatus_error is not None:
        return apparatus_error, {}

    nn_block_error = _validate_station_nn_block_bindings(operation, payload)
    if nn_block_error is not None:
        return nn_block_error, {}

    # BRAMA POZOSTAŁYCH REFERENCJI INWENTARZA (dług 1 z V12K-316) — stoi PRZED
    # wyjściem dla operacji spoza `CATALOG_REQUIRED_OPERATIONS`, bo kompensator,
    # ogranicznik i wiązania DER czytają katalog, choć wiązania głównego nie mają.
    inwentarz_error = _blad_referencji_inwentarza(operation, payload)
    if inwentarz_error is not None:
        return inwentarz_error, {}

    if operation not in CATALOG_REQUIRED_OPERATIONS:
        return None, {}

    if operation == "append_station_on_endpoint" and not _append_station_tworzy_transformator(
        payload
    ):
        return None, {}

    if operation == "add_grid_source_sn" and _uses_manual_grid_source_equivalent(payload):
        if _manual_grid_source_equivalent_complete(payload):
            return None, {}
        return (
            CatalogPolicyError(
                code="catalog.ref_required",
                message_pl="Element techniczny wymaga powiązania z katalogiem",
                errors=[
                    {
                        "code": "catalog.ref_required",
                        "message_pl": (
                            "Ręczny odpowiednik GPZ musi być kompletny albo należy podać "
                            "'catalog_binding'."
                        ),
                    }
                ],
            ),
            {},
        )

    binding_data = extract_catalog_binding(operation, payload)
    if binding_data is None:
        if _proba_konfiguracji_pola_bez_zapisu(operation, payload):
            return None, {}
        return (
            CatalogPolicyError(
                code="catalog.ref_required",
                message_pl="Element techniczny wymaga powiązania z katalogiem",
                errors=[
                    {
                        "code": "catalog.ref_required",
                        "message_pl": (
                            f"Operacja '{operation}' wymaga 'catalog_binding' w payload."
                        ),
                    }
                ],
            ),
            {},
        )

    if operation in _OPERACJE_PUNKTU_POSREDNIEGO_SN:
        from network_model.catalog.mv_branch_point_catalog import get_all_branch_point_types

        catalog_ref = binding_data.get("catalog_item_id")
        known_refs = {record.get("id") for record in get_all_branch_point_types()}
        if catalog_ref in known_refs:
            return None, {}
        # PARYTET KODU (§2.3 karty U1): nieistniejąca pozycja daje `catalog.item_not_found`
        # niezależnie od przestrzeni katalogu. Punkt pośredni SN był jedynym miejscem
        # bramy meldującym `catalog.materialization_failed` — a to nie jest awaria
        # materializacji, tylko brak pozycji, dokładnie jak w każdej innej kategorii.
        return (
            CatalogPolicyError(
                code="catalog.item_not_found",
                message_pl="Nie znaleziono pozycji katalogowej punktu pośredniego SN",
                errors=[
                    {
                        "code": "catalog.item_not_found",
                        "message_pl": (
                            f"Pozycja katalogowa '{catalog_ref}' nie istnieje w katalogu "
                            "ZKSN i słupów odgałęźnych SN. Wskaż pozycję istniejącą "
                            "w katalogu."
                        ),
                    }
                ],
            ),
            {},
        )

    binding_errors = validate_catalog_binding(binding_data)
    if binding_errors:
        return (
            CatalogPolicyError(
                code="catalog.ref_required",
                message_pl="Powiązanie katalogowe jest niekompletne lub niepoprawne",
                errors=[
                    {
                        "code": "catalog.ref_required",
                        "message_pl": e.message_pl,
                    }
                    for e in binding_errors
                ],
            ),
            {},
        )

    try:
        binding = CatalogBinding.from_dict(binding_data)
    except Exception:
        return (
            CatalogPolicyError(
                code="catalog.ref_required",
                message_pl="Powiązanie katalogowe ma nieprawidłowy format",
                errors=[
                    {
                        "code": "catalog.ref_required",
                        "message_pl": "Nie można odczytać danych 'catalog_binding'.",
                    }
                ],
            ),
            {},
        )

    from network_model.catalog.repository import get_default_mv_catalog

    catalog = get_default_mv_catalog()
    mat_result = materialize_catalog_binding(binding, catalog)
    if not mat_result.success:
        return (
            CatalogPolicyError(
                code=mat_result.error_code or "catalog.materialization_failed",
                message_pl=mat_result.error_message_pl or "Błąd materializacji katalogu",
                errors=[
                    {
                        "code": mat_result.error_code or "catalog.materialization_failed",
                        "message_pl": mat_result.error_message_pl or "Błąd materializacji katalogu",
                    }
                ],
            ),
            {},
        )

    return None, mat_result.solver_fields
