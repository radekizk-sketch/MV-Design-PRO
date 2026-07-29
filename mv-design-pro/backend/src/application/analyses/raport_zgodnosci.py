"""D4 (RECENZJA_DER_SN_DOBORY_2026-07, wymaganie 13): raport zgodności toru DER-SN.

Checklista ✓/⚠/❌ agregująca stan modelu po kreatorze (bez ponownego liczenia fizyki):
  (a) wyniki twardych walidacji doborowych D1 (``enm.der_sn_validation``) — kody i
      komunikaty 1:1, bez parafraz — odtworzone ze ZMATERIALIZOWANEGO toru,
  (b) zgodność zastosowanego doboru z propozycją D2 (odstępstwo = pozycja ⚠, nie błąd),
  (c) status biegu analiz (ukończony/nieudany + kody readiness).

Przy błędzie krytycznym (❌ z D1) raport oznajmia „Nie można wygenerować projektu."
(kanon), ale NIE blokuje — walidacje D1 odrzucają u źródła; raport odzwierciedla stan.

ZERO fizyki: porównania napięć/mocy oraz prąd znamionowy z tabliczki to walidacja
DOBOROWA (nameplate) reużyta z D1, nie obliczenia rozpływu/zwarcia. Determinizm:
stała kolejność pozycji, brak timestampów w treści (metadane niesie magazyn F-E8.3).
"""

from __future__ import annotations

from typing import Any

from application.analyses.der_sn_track import (
    DerSnTrack,
    extract_der_sn_track,
    sum_apparent_power_mva,
    transformer_current_a,
)
from enm.der_sn_validation import (
    build_current_cascade_warnings,
    validate_inverter_lv_voltage,
    validate_sn_voltage,
    validate_transformer_power,
)

# Kanoniczny komunikat błędu krytycznego (RECENZJA_DER_SN_DOBORY_2026-07, wymaganie 13).
KOMUNIKAT_KRYTYCZNY = "Nie można wygenerować projektu."

_STATUS_PASS = "PASS"
_STATUS_WARN = "WARN"
_STATUS_FAIL = "FAIL"


def _as_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _pass(check_id: str, etykieta: str) -> dict[str, Any]:
    return {
        "check_id": check_id,
        "kategoria": "walidacja_D1",
        "status": _STATUS_PASS,
        "code": f"der_sn.ok.{check_id}",
        "message_pl": f"✓ {etykieta}",
    }


def _fail(check_id: str, code: str, message_pl: str) -> dict[str, Any]:
    # Kod i komunikat 1:1 z D1 der_sn_validation (bez parafraz).
    return {
        "check_id": check_id,
        "kategoria": "walidacja_D1",
        "status": _STATUS_FAIL,
        "code": code,
        "message_pl": message_pl,
    }


def _d1_items(track: DerSnTrack) -> list[dict[str, Any]]:
    """Odtwórz twarde walidacje D1 ze zmaterializowanego toru (kody/komunikaty 1:1)."""
    items: list[dict[str, Any]] = []
    tr = track.block_transformer

    # 1. U_AC falownika ↔ strona nN TR blokowego (wymaganie 2).
    inverter_kv = _as_float(track.producer_bus.get("voltage_kv")) if track.producer_bus else None
    block_secondary_kv = _as_float(tr.get("ulv_kv")) if tr else None
    if inverter_kv is not None and block_secondary_kv is not None:
        error = validate_inverter_lv_voltage(inverter_kv, block_secondary_kv)
        items.append(
            _fail("napiecie_falownika", error.code, error.message_pl)
            if error
            else _pass("napiecie_falownika", "Napięcie falownika zgodne ze stroną nN TR blokowego.")
        )

    # 2. Strona SN TR blokowego ↔ napięcie szyny SN przyłączenia (wymaganie 6).
    block_primary_kv = None
    if track.block_hv_bus:
        block_primary_kv = _as_float(track.block_hv_bus.get("voltage_kv"))
    if block_primary_kv is None and tr:
        block_primary_kv = _as_float(tr.get("uhv_kv"))
    sn_bus_kv = _as_float(track.mv_bus.get("voltage_kv")) if track.mv_bus else None
    if block_primary_kv is not None and sn_bus_kv is not None:
        error = validate_sn_voltage(block_primary_kv, sn_bus_kv)
        items.append(
            _fail("napiecie_sn", error.code, error.message_pl)
            if error
            else _pass("napiecie_sn", "Strona SN TR blokowego zgodna z napięciem szyny SN.")
        )

    # 3. Moc TR blokowego ≥ ΣS falowników (wymaganie 5).
    if tr is not None:
        error = validate_transformer_power(
            sum_apparent_power_mva=sum_apparent_power_mva(track),
            transformer_sn_mva=_as_float(tr.get("sn_mva")) or 0.0,
            loadability_pu=None,
            simultaneity_factor=None,
        )
        items.append(
            _fail("moc_transformatora", error.code, error.message_pl)
            if error
            else _pass("moc_transformatora", "Moc transformatora blokowego wystarczająca.")
        )
        # 4. Układ połączeń = parametr modelu z typu katalogowego (wymaganie 7).
        vector_group = tr.get("vector_group")
        if vector_group:
            items.append(
                _pass(
                    "grupa_polaczen",
                    f"Układ połączeń TR blokowego zgodny z typem katalogowym ({vector_group}).",
                )
            )
    return items


def _cascade_items(track: DerSnTrack) -> list[dict[str, Any]]:
    """Ostrzeżenia kaskady prądowej (⚠) odtworzone ze stanu modelu (kody 1:1 z D1).

    Ogniwo prądu znamionowego pola SN nie jest przechowywane liczbowo w modelu —
    gdy aparat ma powiązanie katalogowe, link istnieje (op przeszła u źródła); brak
    powiązania sygnalizujemy jawnym ostrzeżeniem ``kaskada_prad_pole_brak``.
    """
    cable_in_a = None
    if track.mv_cable and isinstance(track.mv_cable.get("rating"), dict):
        cable_in_a = _as_float(track.mv_cable["rating"].get("in_a"))
    apparatus_has_catalog = bool(track.apparatus and track.apparatus.get("catalog_ref"))
    warnings = build_current_cascade_warnings(
        transformer_current_a=transformer_current_a(track),
        cable_ampacity_a=cable_in_a,
        # Link pola zweryfikowany katalogowo → nie zgłaszaj „pole_brak"; wtedy sentinel
        # dodatni wyłącza ogniwo bez fabrykowania konkretnej wartości do porównań kaskady.
        field_rated_current_a=(float("inf") if apparatus_has_catalog else None),
    )
    items: list[dict[str, Any]] = []
    for warning in warnings:
        # Ostrzeżenie „kabel > pole" na sentinelu inf nie powstanie; pomijamy je jawnie.
        if warning.code == "converter.der_sn.kaskada_prad_pole_przekroczony":
            continue
        items.append(
            {
                "check_id": warning.code,
                "kategoria": "kaskada_pradowa",
                "status": _STATUS_WARN,
                "code": warning.code,
                "message_pl": warning.message_pl,
            }
        )
    return items


def _d2_items(d2_deviations: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Pozycje odstępstw od propozycji D2 (⚠). Zgodność ⇒ pozycja PASS."""
    if not d2_deviations:
        return []
    items: list[dict[str, Any]] = []
    for deviation in d2_deviations:
        parametr = str(deviation.get("parametr") or "")
        zastosowano = deviation.get("zastosowano")
        propozycja = deviation.get("propozycja")
        odstepstwo = bool(deviation.get("odstepstwo"))
        if odstepstwo:
            message = (
                f"⚠️ Odstępstwo od propozycji D2 dla „{parametr}”: zastosowano "
                f"{zastosowano}, proponowano {propozycja}."
            )
            status = _STATUS_WARN
        else:
            message = f"✓ Dobór „{parametr}” zgodny z propozycją D2."
            status = _STATUS_PASS
        items.append(
            {
                "check_id": f"d2.{parametr}",
                "kategoria": "zgodnosc_D2",
                "status": status,
                "code": "der_sn.d2.odstepstwo" if odstepstwo else "der_sn.d2.zgodne",
                "message_pl": message,
                "parametr": parametr,
                "zastosowano": zastosowano,
                "propozycja": propozycja,
            }
        )
    return items


def _run_item(run_status: str | None, readiness_codes: list[str] | None) -> dict[str, Any] | None:
    """Pozycja statusu biegu analiz (ukończony/nieudany + kody readiness)."""
    if run_status is None:
        return None
    normalized = str(run_status).upper()
    completed = normalized in {"DONE", "COMPLETED", "SUCCESS", "SUCCEEDED"}
    failed = normalized in {"FAILED", "ERROR"}
    if completed:
        status = _STATUS_PASS
        message = "✓ Bieg analiz (rozpływ + zwarcia) ukończony."
    elif failed:
        status = _STATUS_FAIL
        message = "❌ Bieg analiz nieudany — wyniki niedostępne."
    else:
        status = _STATUS_WARN
        message = f"⚠️ Bieg analiz w toku (status: {run_status})."
    return {
        "check_id": "bieg_analiz",
        "kategoria": "bieg_analiz",
        "status": status,
        "code": f"der_sn.run.{normalized.lower()}",
        "message_pl": message,
        "readiness_codes": list(readiness_codes or []),
    }


def build_compliance_report_from_track(
    track: DerSnTrack,
    *,
    run_status: str | None = None,
    readiness_codes: list[str] | None = None,
    d2_deviations: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Zbuduj raport zgodności z gotowego widoku toru (deterministyczny)."""
    items: list[dict[str, Any]] = []
    items.extend(_d1_items(track))
    items.extend(_cascade_items(track))
    items.extend(_d2_items(d2_deviations))
    run_item = _run_item(run_status, readiness_codes)
    if run_item is not None:
        items.append(run_item)

    liczba_fail = sum(1 for i in items if i["status"] == _STATUS_FAIL)
    liczba_warn = sum(1 for i in items if i["status"] == _STATUS_WARN)
    liczba_pass = sum(1 for i in items if i["status"] == _STATUS_PASS)

    if liczba_fail > 0:
        werdykt = "NIEZGODNY"
        komunikat_krytyczny: str | None = KOMUNIKAT_KRYTYCZNY
    elif liczba_warn > 0:
        werdykt = "ZGODNY_Z_UWAGAMI"
        komunikat_krytyczny = None
    else:
        werdykt = "ZGODNY"
        komunikat_krytyczny = None

    return {
        "wersja": "1.0",
        "source_ref": track.source_ref,
        "source_name": track.source_name,
        "werdykt": werdykt,
        "komunikat_krytyczny": komunikat_krytyczny,
        "pozycje": items,
        "podsumowanie": {
            "pass": liczba_pass,
            "warn": liczba_warn,
            "fail": liczba_fail,
            "razem": len(items),
        },
    }


def build_compliance_report(
    enm: dict[str, Any],
    generator_ref: str | None = None,
    *,
    run_status: str | None = None,
    readiness_codes: list[str] | None = None,
    d2_deviations: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    """Zbuduj raport zgodności toru DER-SN z modelu. ``None`` gdy brak toru DER-SN."""
    track = extract_der_sn_track(enm, generator_ref)
    if track is None:
        return None
    return build_compliance_report_from_track(
        track,
        run_status=run_status,
        readiness_codes=readiness_codes,
        d2_deviations=d2_deviations,
    )
