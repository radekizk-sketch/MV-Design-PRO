"""Most miedzy SYGNALEM gotowosci a KANONICZNYM rejestrem kodow (karta F-K6, V12K-206).

ROZSTRZYGNIECIE ZNALEZISKA Z8 audytu FLOW. Do tej pory w systemie zylo CZTERY rejestry
kodow gotowosci, prawie rozlaczne:

  1. `READINESS_CODES` (`domain/canonical_operations.py`) — kanon tresci: komunikat PL,
     poziom, priorytet, `fix_action_id`, nawigacja naprawcza. Do V12K-204 nie mial
     ZADNEGO konsumenta w czasie dzialania.
  2. `ValidationIssue` walidatora ENM (`enm/validator.py`, kody E001..W040 i kilka
     kropkowanych) — JEDYNY realny dostawca sygnalu do UI, bo tylko walidator zna stan
     modelu. Kodow wspolnych z kanonem: ZERO.
  3. `KNOWN_BLOCKER_CODES` / `_FIX_ACTION_MAP` (`domain/readiness_fix_actions.py`) —
     46 kodow, z ktorych z kanonem pokrywa sie JEDEN (`oze.transformer_required`);
     uzywane wylacznie przez guard pokrycia w CI.
  4. tablica frontu `nnSourceReadinessCodes.ts` — 12 kodow bez emitera w backendzie
     i bez konsumenta produkcyjnego (uzywaly jej tylko testy struktury). Usunieta;
     tresc przeniesiona do kanonu (V12K-206).

PODZIAL ROL, ktory ten modul utrwala:
  * SYGNAL   — co jest niespelnione W TYM modelu: walidator ENM / eligibility.
  * TRESC    — jak to nazwac, jak wazne, gdzie naprawiac: kanon `READINESS_CODES`.
  * AKCJA UI — co otworzyc: `FixAction` (inline w zgloszeniu) + `readiness_fix_actions`.

Most nie zgaduje: odwzorowanie zawiera WYLACZNIE pary o tym samym warunku, a kazdy kod
walidatora bez odpowiednika jest wymieniony z POWODEM. Dopasowanie „po podobnej nazwie"
byloby fabrykacja tresci normatywnej — komunikat kanonu trafia do projektanta jako
instrukcja naprawy, wiec nie moze opisywac innego warunku niz ten, ktory zaszedl.
"""

from __future__ import annotations

from typing import Any

from domain.canonical_operations import READINESS_CODES

# ---------------------------------------------------------------------------
# 1. Odwzorowanie kod walidatora ENM -> kod kanoniczny (TEN SAM warunek)
# ---------------------------------------------------------------------------

ODWZOROWANIE_WALIDATOR_NA_KANON: dict[str, str] = {
    # „Brak zrodla zasilania w modelu sieci" == brak zasilania sieciowego (GPZ).
    "E001": "source.grid_supply_missing",
    # „Galaz nie ma referencji katalogowej" == element obliczeniowy bez katalogu.
    "E009": "catalog.binding_missing",
    # „Stacja przelotowa: pola IN/OUT" == brak wymaganego pola SN stacji.
    "E021": "station.required_field_missing",
    # „Transformator na szynie SN bez pola roli TR" == brak konfiguracji pola
    # transformatorowego (KOMPLETNOSC-POLA-TR — ten sam warunek, jedno zrodlo
    # predykatu `enm/pole_transformatorowe.py`).
    "W041": "transformer.bay_missing",
    # „Magistrala nie ma segmentow" == brak segmentu magistrali.
    "I004": "trunk.segment_missing",
    # „Magistrala pierscieniowa nie ma punktu normalnie otwartego" == wymog NOP.
    "I005": "ring.nop_required",
}

# ---------------------------------------------------------------------------
# 2. Kody walidatora BEZ odpowiednika kanonicznego — z jawnym powodem
# ---------------------------------------------------------------------------
# Powod nie jest ozdoba: mowi, czy brakuje kodu w kanonie (luka tresci), czy warunek
# jest tak szczegolowy, ze kanonicznego odpowiednika miec nie powinien.

KODY_WALIDATORA_BEZ_KANONU: dict[str, str] = {
    "E002": "Kanon nie ma kodu dla braku szyn w modelu (ma kody stacji, nie topologii pustej).",
    "E003": "Kanon nie ma kodu dla wyspy odcietej od zrodla — kryterium topologiczne.",
    "E004": (
        "Kanon ma `station.voltage_missing` (napiecie STACJI), a warunek dotyczy "
        "napiecia SZYNY — inny obiekt, wiec odwzorowanie byloby podmiana tresci."
    ),
    "E005": "Kanon nie ma kodu dla zerowej impedancji galezi.",
    "E006": "Kanon nie ma kodu dla braku napiecia zwarcia transformatora (uk%).",
    "E007": "Kanon nie ma kodu dla niespojnosci stron HV/LV transformatora.",
    "E010": "Kanon nie ma kodu dla nadpisan (overrides) bez podstawy katalogowej.",
    "E020": "Kanon nie ma kodu dla galezi laczacej rozne pasma napieciowe.",
    "E028": "Kanon nie ma kodu dla braku danych DER wymaganych przez walidacje D1.",
    "E029": "Kanon nie ma kodu dla niespojnosci parametrow falownika.",
    "E030": "Kanon nie ma kodu dla braku wskazanego portu polaczenia.",
    "E040": "Kanon nie ma kodow baterii kondensatorow (referencja katalogowa).",
    "E041": "Kanon nie ma kodow baterii kondensatorow (moc bierna).",
    "E042": "Kanon nie ma kodow baterii kondensatorow (napiecie znamionowe).",
    "I001": "Stan lacznika (otwarty) to informacja o topologii, nie brak danych.",
    "I002": (
        "Powtarza warunek E009 na poziomie INFO — jeden warunek ma miec jeden kod "
        "kanoniczny, wiec odwzorowanie idzie przez E009."
    ),
    "I003": "Kanon ma kod braku WYMAGANEGO pola; brak jakichkolwiek pol to inny warunek.",
    "W001": "Kanon nie ma kodu dla braku skladowej zerowej galezi (Z0).",
    "W002": "Kanon nie ma kodu dla braku skladowej zerowej zrodla (Z0).",
    "W003": "Kanon ma `load.power_zero`; brak odbiorow I generatorow to inny warunek.",
    "W004": "Kanon nie ma kodu dla braku grupy polaczen transformatora.",
    "W005": "Referencja do nieistniejacego obiektu to spojnosc modelu, nie gotowosc danych.",
    "W006": "Referencja do nieistniejacego obiektu (pole) — jak W005.",
    "W007": "Kanon nie ma kodu dla liczby galezi w wezle T.",
    "W008": "Referencja do nieistniejacego obiektu (magistrala) — jak W005.",
    "W040": "Kanon nie ma kodow baterii kondensatorow (niezgodnosc napiecia).",
    "bays.earthing_interlock_violation": (
        "Naruszenie blokady uziemnika to stan LACZENIOWY, nie brak danych projektu."
    ),
    "sources.no_short_circuit_params": (
        "Kanon ma `source.sk3_invalid` (wartosc NIEPRAWIDLOWA), a warunek mowi o BRAKU "
        "parametrow — brak i bledna wartosc prowadza do roznych napraw."
    ),
    "sources.sk_ik_voltage_inconsistent": (
        "Kanon nie ma kodu dla niespojnosci Ik''/Sk''/napiecia zrodla."
    ),
    # ------------------------------------------------------------------
    # P0.1 nN (karta P0.1, topologia obwodow nN — `enm/validator.py::_check_nn_topology`).
    # ------------------------------------------------------------------
    "E060": (
        "Kanon nie ma kodu dla ciaglosci zasilania odbioru/generatora nN do zrodla "
        "(kontrola topologiczna grafu przez zamkniete galezie/transformatory) — "
        "analogicznie do E003 (wyspa odcieta od zrodla), rowniez bez kanonu."
    ),
    "E061": (
        "Kanon ma `nn.cable_catalog_missing`, ale ten dotyczy WYLACZNIE kabli i jest "
        "WARNING; E061 obejmuje KAZDA galaz w pasmie nN (kable I aparaty pol) i jest "
        "BLOCKER dla galezi bez pochodzenia migracyjnego — inny zakres obiektu i inna "
        "dotkliwosc, wiec odwzorowanie byloby podmiana tresci."
    ),
    "W061": (
        "Wyjatek E061 dla galezi z automigracji promocji pol nN (degradacja BLOCKER -> "
        "WARNING, `nn_field_specs_promocja.py`) — jak E061, `nn.cable_catalog_missing` "
        "nie pasuje (obejmuje wylacznie kable, nie aparaty pol)."
    ),
    "E062": (
        "Kanon nie ma kodu dla mieszania poziomow napiecia WEWNATRZ pasma nN — E020 "
        "(patrz wyzej) grupuje cale pasmo nN (<1 kV) jako JEDNO pasmo i nie wykrywa "
        "tego warunku."
    ),
    "E063": (
        "Kanon nie ma kodu dla braku deklaracji ukladu uziemienia sieci nN stacji "
        "(meta.nn_earthing_system) wymaganej kryterium SWZ (IEC 60364-4-41)."
    ),
    "E064": (
        "Kanon nie ma kodu dla ProtectionAssignment.breaker_ref wskazujacego galaz, "
        "ktorej nie ma w modelu — spojnosc referencji, nie brak danych projektowych "
        "(jak W005/W006/W008 wyzej)."
    ),
    "W060": (
        "Kanon nie ma kodu dla braku warunkow ulozenia kabla nN "
        "(meta.cable_laying_conditions) — obciazalnosc liczona wg zalozenia "
        "katalogowego, jawne ostrzezenie o zalozeniu, nie brak danych katalogowych."
    ),
    "W062": (
        "Kanon nie ma kodu dla dwoch zrodel/generatorow nN bezposrednio na TEJ SAMEJ "
        "szynie bez sprzegla/logiki SZR miedzy nimi."
    ),
}

# ---------------------------------------------------------------------------
# 3. Kody kanonu ZAREZERWOWANE — bez emitera, z powodem
# ---------------------------------------------------------------------------
# Rezerwacja jest jawna i pilnowana guardem `readiness_consumption_guard.py`:
# kod bez emitera i bez rezerwacji to kod, ktory nigdy nie dotrze do projektanta.

_POWOD_NN = (
    "Tresc przeniesiona z martwej tablicy frontu (V12K-206). Warunek zdefiniowany, "
    "emiter w walidatorze ENM do wpiecia osobna karta walidacji zrodel nN."
)

KODY_KANONU_ZAREZERWOWANE: dict[str, str] = {
    # Karta F-K6: tresc z tablicy frontu przeniesiona do kanonu, emitera nie ma.
    "nn.source.field_missing": _POWOD_NN,
    "nn.source.switch_missing": _POWOD_NN,
    "nn.source.catalog_missing": _POWOD_NN,
    "nn.source.parameters_missing": _POWOD_NN,
    "nn.voltage_missing": _POWOD_NN,
    "pv.control_mode_missing": _POWOD_NN,
    "bess.energy_module_missing": _POWOD_NN,
    "bess.soc_limits_invalid": _POWOD_NN,
    "ups.backup_time_invalid": _POWOD_NN,
    "nn.switch.catalog_ref_missing": _POWOD_NN,
    "nn.measurement.required_missing": _POWOD_NN,
    "genset.fuel_type_missing": _POWOD_NN,
    # KARTA A audytu szczytu 2026-08-01 (V12K-305 pkt 4): jedynym „emiterem" tych
    # szesciu kodow byl `network_model/catalog/readiness_checker.py` — modul MARTWY,
    # ktorego nie wolal zaden modul produkcyjny (jedynymi konsumentami byly testy).
    # Usuniecie martwego modulu odslonilo prawde: droga do projektanta nie wiodla
    # przez ten kod juz wczesniej. Warunki SA sprawdzane — w bramach operacji
    # domenowych i katalogowych, pod ich wlasnymi kodami bledu.
    "source.voltage_invalid": (
        "Brak emitera po usunieciu martwego `readiness_checker` (V12K-305 pkt 4). "
        "Warunek pilnuje operacja `add_grid_source_sn` kodem `source.missing_voltage`."
    ),
    "source.sk3_invalid": (
        "Brak emitera po usunieciu martwego `readiness_checker` (V12K-305 pkt 4). "
        "Moc zwarciowa zrodla pochodzi z materializacji katalogu ZRODLO_SN albo z "
        "recznego odpowiednika, ktorego kompletnosci pilnuje brama katalogowa."
    ),
    "station.voltage_missing": (
        "Brak emitera po usunieciu martwego `readiness_checker` (V12K-305 pkt 4). "
        "Warunek pilnuja operacje stacyjne kodami `station.append.voltage_missing` / "
        "`station.insert.sn_voltage_missing` (i odpowiednikami nN)."
    ),
    "transformer.catalog_missing": (
        "Brak emitera po usunieciu martwego `readiness_checker` (V12K-305 pkt 4). "
        "Wiazanie katalogowe transformatora pilnuje brama katalogowa API "
        "(`CATALOG_REQUIRED_OPERATIONS`) kodami `catalog.ref_required` / "
        "`catalog.item_not_found` — dla obu torow stacyjnych."
    ),
    "trunk.catalog_missing": (
        "Brak emitera po usunieciu martwego `readiness_checker` (V12K-305 pkt 4). "
        "Wiazanie katalogowe segmentu pilnuje brama katalogowa API dla "
        "`continue_trunk_segment_sn` / `start_branch_segment_sn`."
    ),
    "trunk.segment_length_missing": (
        "Brak emitera po usunieciu martwego `readiness_checker` (V12K-305 pkt 4). "
        "Dlugosc segmentu pilnuje operacja domenowa kodem `trunk.dlugosc_missing`."
    ),
    # Kody starsze, ktore rejestr niesie bez emitera w kodzie produkcyjnym.
    "analysis.blocked_by_readiness": (
        "Stan zbiorczy wyliczany przez bramke analiz z pozostalych kodow — nie jest "
        "emitowany jako osobne zgloszenie."
    ),
    "apparatus.nn_catalog_missing": "Brak emitera: walidacja aparatury nN po stronie ENM nierozpoczeta.",
    "apparatus.sn_catalog_missing": "Brak emitera: walidacja aparatury SN po stronie ENM nierozpoczeta.",
    "import.catalog_mapping_required": "Emiter w torze importu — tor nieaktywny w tej wersji.",
    "load.catalog_missing": "Brak emitera: walidacja katalogu odbioru nie zglasza tego kodu.",
    "load.power_zero": "Brak emitera: walidacja mocy odbioru nie zglasza tego kodu.",
    "nn.cable_catalog_missing": "Brak emitera: walidacja kabla nN nie zglasza tego kodu.",
    "nn.main_breaker_missing": "Brak emitera: wymog wylacznika glownego nN nie jest sprawdzany.",
    "oze.bess_no_transformer": "Warunek sprawdzany w kaskadzie D1 pod innym kodem bledu operacji.",
    "oze.nn_bus_required": "Warunek sprawdzany w kaskadzie D1 pod innym kodem bledu operacji.",
    "oze.pv_no_transformer": "Warunek sprawdzany w kaskadzie D1 pod innym kodem bledu operacji.",
    "protection.ct_required": "Brak emitera: wymog CT sprawdzany w kreatorze pola, nie w walidacji ENM.",
    "protection.vt_required": "Brak emitera: wymog VT sprawdzany w kreatorze pola, nie w walidacji ENM.",
    "protection.settings_incomplete": (
        "Zastapiony przez `protection.nominal_current_missing` i "
        "`protection.fault_current_missing` (V12K-189) — te maja emitery."
    ),
    "ring.endpoints_missing": "Brak emitera: warunek sprawdzany przy operacji domykania pierscienia.",
    "ring.nop_required": "Emiter przez odwzorowanie kodu walidatora I005 (nie literal w kodzie).",
    "station.nn_outgoing_min_1": "Brak emitera: liczba odplywow nN nie jest sprawdzana.",
    "station.required_field_missing": "Emiter przez odwzorowanie kodu walidatora E021.",
    "station.type_invalid": "Brak emitera: typ stacji walidowany kontraktem operacji, nie kodem gotowosci.",
    "study_case.missing_base_snapshot": "Brak emitera: warunek pilnowany wyjatkiem warstwy przypadku.",
    "transformer.connection_missing": "Brak emitera: polaczenie transformatora walidowane kontraktem operacji.",
    "trunk.segment_length_invalid": "Brak emitera: dlugosc walidowana kontraktem operacji.",
    "trunk.terminal_missing": "Brak emitera: terminal magistrali walidowany kontraktem operacji.",
    "trunk.segment_missing": "Emiter przez odwzorowanie kodu walidatora I004.",
    "source.grid_supply_missing": "Emiter przez odwzorowanie kodu walidatora E001.",
    "catalog.binding_missing": "Emiter przez odwzorowanie kodu walidatora E009.",
}


# ---------------------------------------------------------------------------
# API mostu
# ---------------------------------------------------------------------------


def kod_kanoniczny(kod_zgloszenia: str) -> str | None:
    """Kod kanoniczny dla kodu zgloszenia (walidator ENM albo juz kanoniczny)."""
    if kod_zgloszenia in READINESS_CODES:
        return kod_zgloszenia
    return ODWZOROWANIE_WALIDATOR_NA_KANON.get(kod_zgloszenia)


def opis_kanoniczny(kod_zgloszenia: str) -> dict[str, Any] | None:
    """Kanoniczna TRESC dla zgloszenia: poziom, priorytet, akcja, nawigacja.

    ``None`` gdy zgloszenie nie ma odpowiednika w kanonie — warstwa prezentacji
    zostaje wtedy przy tresci walidatora, zamiast dostac cudzy komunikat.
    """
    kod = kod_kanoniczny(kod_zgloszenia)
    if kod is None:
        return None
    spec = READINESS_CODES[kod]
    return {
        "canonical_code": spec.code,
        "canonical_level": spec.level.value,
        "canonical_priority": spec.priority,
        "canonical_area": spec.area.value,
        "canonical_message_pl": spec.message_pl,
        "canonical_fix_action_id": spec.fix_action_id,
        "canonical_fix_navigation": spec.fix_navigation,
    }


def kody_bez_emitera(kody_emitowane: set[str]) -> dict[str, str | None]:
    """Kody kanonu bez emitera: kod -> powod rezerwacji (``None`` = brak powodu).

    ``None`` w wartosci znaczy dokladnie „kod nie ma emitera i nikt nie wyjasnil,
    dlaczego" — to jest stan, ktory guard odrzuca.
    """
    braki: dict[str, str | None] = {}
    for kod in sorted(READINESS_CODES):
        if kod in kody_emitowane:
            continue
        braki[kod] = KODY_KANONU_ZAREZERWOWANE.get(kod)
    return braki


def widok_rejestru() -> dict[str, Any]:
    """Kanon + odwzorowanie + jawne luki — jedno zrodlo tresci dla prezentacji."""
    kody = [
        {
            "code": spec.code,
            "area": spec.area.value,
            "level": spec.level.value,
            "priority": spec.priority,
            "message_pl": spec.message_pl,
            "fix_action_id": spec.fix_action_id,
            "fix_navigation": spec.fix_navigation,
            "reserved_reason": KODY_KANONU_ZAREZERWOWANE.get(spec.code),
        }
        for _, spec in sorted(READINESS_CODES.items())
    ]
    return {
        "codes": kody,
        "validator_mapping": dict(sorted(ODWZOROWANIE_WALIDATOR_NA_KANON.items())),
        "validator_without_canonical": dict(sorted(KODY_WALIDATORA_BEZ_KANONU.items())),
        "summary": {
            "codes_total": len(kody),
            "reserved_total": sum(1 for k in kody if k["reserved_reason"] is not None),
            "validator_mapped_total": len(ODWZOROWANIE_WALIDATOR_NA_KANON),
            "validator_without_canonical_total": len(KODY_WALIDATORA_BEZ_KANONU),
        },
    }
