"""Most miedzy SYGNALEM gotowosci a KANONICZNYM rejestrem kodow (karta F-K6, V12K-206).

ROZSTRZYGNIECIE ZNALEZISKA Z8 audytu FLOW. Do tej pory w systemie zylo CZTERY rejestry
kodow gotowosci, prawie rozlaczne:

  1. `READINESS_CODES` (`domain/canonical_operations.py`) — kanon tresci: komunikat PL,
     poziom, priorytet, nawigacja naprawcza (jedyna REALNA sciezka naprawcza — kasacja
     fantoma bez wykonawcy opisana w `docs/v12xx/REJESTR_KONFLIKTOW.md` V12K-338).
     Do V12K-204 nie mial ZADNEGO konsumenta w czasie dzialania.
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
    # „Zrodlo nie jest podlaczone do istniejacej szyny" == zrodlo bez polaczenia
    # (odbior CV-3.3-B: jedyny dawny emiter kanonu byl w skasowanym torze R2).
    "sources.bus_missing": "source.connection_missing",
    # CV-4.3 K7: „S''kQmin > S''kQmax / I''kQmin > I''kQmax" == dane MIN sprzeczne z MAX.
    "sources.sk_min_exceeds_max": "source.sk_min_inconsistent",
    # Napięcie zadane szyny bilansującej poza pasmem == nieprawidłowa nastawa napięcia.
    "sources.u_set_pu_out_of_range": "source.u_set_pu_out_of_range",
    # „Magistrala pierscieniowa nie ma punktu normalnie otwartego" == wymog NOP.
    "I005": "ring.nop_required",
    # Karta CV-4.1b (A3-04): generator w trybie regulacji napiecia bez nastawy U
    # albo bez granic Q == generator w trybie regulacji napiecia bez kompletnej
    # nastawy (ten sam warunek, `enm/validator.py` -> `domain/canonical_operations.py`).
    "generators.voltage_control_incomplete": "generator.voltage_setpoint_missing",
    # Domkniecie CV-4.1b (odbior): tryb regulacji napiecia bez profilu NC RfG operatora
    # / z profilem nieznanym == brak profilu; profil bez zdolnosci voltage_control ==
    # tryb niedopuszczony (ten sam warunek co bramka kreatora OZE, `enm/validator.py`).
    "generators.voltage_control_profile_missing": "generator.voltage_control_profile_missing",
    "generators.voltage_control_not_permitted": "generator.voltage_control_not_permitted",
    # Karta W3-I (§0.15 karty konwergencji fizyki): „generator przekształtnikowy
    # nie ma referencji katalogowej" == ten sam fakt, który gotowość zwarciowa
    # zgłasza jako `inverter.k_sc_missing` (`application/calculation_readiness/
    # service.py`, ta sama tabela `catalog.governance.wymagalnosc_katalogu`
    # decyduje o obu). Poziomy się różnią (W010 = IMPORTANT: model jako całość
    # pozostaje użyteczny; kanon = BLOCKER: TA konkretna analiza zwarciowa jest
    # zablokowana) — to różna DOTKLIWOŚĆ tego samego faktu na różnych warstwach
    # (walidacja modelu vs gotowość jednej analizy), nie różny warunek; most
    # łączy fakty, nie poziomy.
    "W010": "inverter.k_sc_missing",
    # Karta W5-D: „galaz nie ma skladowej zerowej (Z0)" == brak R0/X0 galezi — ten sam
    # warunek, ktory assembler rozplywu niesymetrycznego zglasza jako odmowe nazwana
    # (`enm/assembler.py::diagnoza_niesymetrii`) i ktory blokuje zwarcia 1F/2F-Z.
    "W001": "branch.zero_sequence_missing",
    # W5-A (jedna reprezentacja uziemienia): transformator SN/nN bez ukladu sieci nN
    # (`lv_earthing_system`) == ten sam fakt, ktory gotowosc petli zwarcia zglasza jako
    # ELIG_FLNN_MISSING_EARTHING_SYSTEM (jeden predykat `enm/uklad_sieci_nn.py`).
    "E063": "transformer.lv_earthing_system_missing",
    # Konfiguracja punktu neutralnego niespojna (rezystor bez R_N, dlawik bez X_N,
    # izolowany ze skonczona Z0) — zrodlo i transformator, jeden predykat.
    "E-W5-01": "earthing.neutral_grounding_inconsistent",
    # Grupa polaczen spoza slownika IEC 60076-1.
    "E-W5-02": "transformer.vector_group_invalid",
    # Uziemienie uzwojenia bez wyprowadzonego punktu neutralnego.
    "E-W5-03": "transformer.neutral_grounding_not_accessible",
    # Uklad uziemienia ekranu kabla inny niz uklad odniesienia katalogowych r0/x0.
    "W-W5-01": "cable.screen_bonding_reference_mismatch",
}

# ---------------------------------------------------------------------------
# 2. Kody walidatora BEZ odpowiednika kanonicznego — z jawnym powodem
# ---------------------------------------------------------------------------
# Powod nie jest ozdoba: mowi, czy brakuje kodu w kanonie (luka tresci), czy warunek
# jest tak szczegolowy, ze kanonicznego odpowiednika miec nie powinien.

KODY_WALIDATORA_BEZ_KANONU: dict[str, str] = {
    "E002": "Kanon nie ma kodu dla braku szyn w modelu (ma kody stacji, nie topologii pustej).",
    "E003": "Kanon nie ma kodu dla wyspy odciętej od źródła — kryterium topologiczne.",
    "E004": (
        "Kanon ma `station.voltage_missing` (napięcie STACJI), a warunek dotyczy "
        "napięcia SZYNY — inny obiekt, więc odwzorowanie byłoby podmianą treści."
    ),
    "E005": "Kanon nie ma kodu dla zerowej impedancji gałęzi.",
    "E006": "Kanon nie ma kodu dla braku napięcia zwarcia transformatora (uk%).",
    "E007": "Kanon nie ma kodu dla niespójności stron HV/LV transformatora.",
    "E010": "Kanon nie ma kodu dla nadpisań (overrides) bez podstawy katalogowej.",
    "E020": "Kanon nie ma kodu dla gałęzi łączącej różne pasma napięciowe.",
    "E028": "Kanon nie ma kodu dla braku danych DER wymaganych przez walidację D1.",
    "E029": "Kanon nie ma kodu dla niespójności parametrów falownika.",
    "E030": "Kanon nie ma kodu dla braku wskazanego portu połączenia.",
    "E040": "Kanon nie ma kodów baterii kondensatorów (referencja katalogowa).",
    "E041": "Kanon nie ma kodów baterii kondensatorów (moc bierna).",
    "E042": "Kanon nie ma kodów baterii kondensatorów (napięcie znamionowe).",
    "I001": "Stan łącznika (otwarty) to informacja o topologii, nie brak danych.",
    "I002": (
        "Powtarza warunek E009 na poziomie INFO — jeden warunek ma mieć jeden kod "
        "kanoniczny, więc odwzorowanie idzie przez E009."
    ),
    "I003": "Kanon ma kod braku WYMAGANEGO pola; brak jakichkolwiek pól to inny warunek.",
    "W002": "Kanon nie ma kodu dla braku składowej zerowej źródła (Z0).",
    "W003": "Kanon ma `load.power_zero`; brak odbiorów I generatorów to inny warunek.",
    "W004": "Kanon nie ma kodu dla braku grupy połączeń transformatora.",
    "W005": "Referencja do nieistniejącego obiektu to spójność modelu, nie gotowość danych.",
    "W006": "Referencja do nieistniejącego obiektu (pole) — jak W005.",
    "W007": "Kanon nie ma kodu dla liczby gałęzi w węźle T.",
    "W008": "Referencja do nieistniejącego obiektu (magistrala) — jak W005.",
    "W009": (
        "Kanon nie ma kodu dla sprzecznej częstotliwości szyny wobec częstotliwości "
        "studium — to spójność modelu, nie brak danych projektu."
    ),
    "W040": "Kanon nie ma kodów baterii kondensatorów (niezgodność napięcia).",
    "bays.earthing_interlock_violation": (
        "Naruszenie blokady uziemnika to stan ŁĄCZENIOWY, nie brak danych projektu."
    ),
    "sources.no_short_circuit_params": (
        "Kanon ma `source.sk3_invalid` (wartość NIEPRAWIDŁOWA), a warunek mówi o BRAKU "
        "parametrów — brak i błędna wartość prowadzą do różnych napraw."
    ),
    "sources.sk_ik_voltage_inconsistent": (
        "Kanon nie ma kodu dla niespójności Ik''/Sk''/napięcia źródła."
    ),
    "sources.sk_min_ik_min_voltage_inconsistent": (
        "Ta sama klasa co `sources.sk_ik_voltage_inconsistent` (CV-4.3 K7, dane MIN): "
        "kanon nie ma kodu dla niespójności Ik''min/Sk''min/napięcia źródła."
    ),
    # ------------------------------------------------------------------
    # P0.1 nN (karta P0.1, topologia obwodow nN — `enm/validator.py::_check_nn_topology`).
    # ------------------------------------------------------------------
    "E060": (
        "Kanon nie ma kodu dla ciągłości zasilania odbioru/generatora nN do źródła "
        "(kontrola topologiczna grafu przez zamknięte gałęzie/transformatory) — "
        "analogicznie do E003 (wyspa odcięta od źródła), również bez kanonu."
    ),
    "E061": (
        "Kanon ma `nn.cable_catalog_missing`, ale ten dotyczy WYŁĄCZNIE kabli i jest "
        "WARNING; E061 obejmuje KAŻDĄ gałąź w paśmie nN (kable I aparaty pól) i jest "
        "BLOCKER dla gałęzi bez pochodzenia migracyjnego — inny zakres obiektu i inna "
        "dotkliwość, więc odwzorowanie byłoby podmianą treści."
    ),
    "W061": (
        "Wyjątek E061 dla gałęzi z automigracji promocji pól nN (degradacja BLOCKER -> "
        "WARNING, `nn_field_specs_promocja.py`) — jak E061, `nn.cable_catalog_missing` "
        "nie pasuje (obejmuje wyłącznie kable, nie aparaty pól)."
    ),
    "E062": (
        "Kanon nie ma kodu dla mieszania poziomów napięcia WEWNĄTRZ pasma nN — E020 "
        "(patrz wyżej) grupuje całe pasmo nN (<1 kV) jako JEDNO pasmo i nie wykrywa "
        "tego warunku."
    ),
    "E064": (
        "Kanon nie ma kodu dla ProtectionAssignment.breaker_ref wskazującego gałąź, "
        "której nie ma w modelu — spójność referencji, nie brak danych projektowych "
        "(jak W005/W006/W008 wyżej)."
    ),
    "W060": (
        "Kanon nie ma kodu dla braku warunków ułożenia kabla nN "
        "(meta.cable_laying_conditions) — obciążalność liczona wg założenia "
        "katalogowego, jawne ostrzeżenie o założeniu, nie brak danych katalogowych."
    ),
    "W062": (
        "Kanon nie ma kodu dla dwóch źródeł/generatorów nN bezpośrednio na TEJ SAMEJ "
        "szynie bez sprzęgła/logiki SZR między nimi."
    ),
}

# ---------------------------------------------------------------------------
# 3. Kody kanonu ZAREZERWOWANE — bez emitera, z powodem
# ---------------------------------------------------------------------------
# Rezerwacja jest jawna i pilnowana guardem `readiness_consumption_guard.py`:
# kod bez emitera i bez rezerwacji to kod, ktory nigdy nie dotrze do projektanta.

_POWOD_NN = (
    "Treść przeniesiona z martwej tablicy frontu (V12K-206). Warunek zdefiniowany, "
    "emiter w walidatorze ENM do wpięcia osobną kartą walidacji źródeł nN."
)

KODY_KANONU_ZAREZERWOWANE: dict[str, str] = {
    # Karta F-K6: tresc z tablicy frontu przeniesiona do kanonu, emitera nie ma.
    "nn.source.field_missing": _POWOD_NN,
    "nn.source.switch_missing": _POWOD_NN,
    "nn.source.catalog_missing": _POWOD_NN,
    "nn.source.parameters_missing": _POWOD_NN,
    "nn.voltage_missing": _POWOD_NN,
    # "pv.control_mode_missing" USUNIETE z rezerwacji (karta FAB-D2, D6):
    # emiter jest teraz w application/calculation_readiness/service.py
    # (`_check_power_flow`) — falownik PV bez `control_mode` w
    # zmaterializowanych parametrach zglasza ten kod jako BLOCKER. Kod ma
    # droge do projektanta, wiec rezerwacja bylaby od tej chwili falszywa
    # (por. `readiness_consumption_guard.py`, niezmiennik (a)).
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
        "Brak emitera po usunięciu martwego `readiness_checker` (V12K-305 pkt 4). "
        "Warunek pilnuje operacja `add_grid_source_sn` kodem `source.missing_voltage`."
    ),
    "source.sk3_invalid": (
        "Brak emitera po usunięciu martwego `readiness_checker` (V12K-305 pkt 4). "
        "Moc zwarciowa źródła pochodzi z materializacji katalogu ZRODLO_SN albo z "
        "ręcznego odpowiednika, którego kompletności pilnuje brama katalogowa."
    ),
    "station.voltage_missing": (
        "Brak emitera po usunięciu martwego `readiness_checker` (V12K-305 pkt 4). "
        "Warunek pilnują operacje stacyjne kodami `station.append.voltage_missing` / "
        "`station.insert.sn_voltage_missing` (i odpowiednikami nN)."
    ),
    "transformer.catalog_missing": (
        "Brak emitera po usunięciu martwego `readiness_checker` (V12K-305 pkt 4). "
        "Wiązanie katalogowe transformatora pilnuje brama katalogowa API "
        "(`CATALOG_REQUIRED_OPERATIONS`) kodami `catalog.ref_required` / "
        "`catalog.item_not_found` — dla obu torów stacyjnych."
    ),
    "trunk.catalog_missing": (
        "Brak emitera po usunięciu martwego `readiness_checker` (V12K-305 pkt 4). "
        "Wiązanie katalogowe segmentu pilnuje brama katalogowa API dla "
        "`continue_trunk_segment_sn` / `start_branch_segment_sn`."
    ),
    "trunk.segment_length_missing": (
        "Brak emitera po usunięciu martwego `readiness_checker` (V12K-305 pkt 4). "
        "Długość segmentu pilnuje operacja domenowa kodem `trunk.dlugosc_missing`."
    ),
    # Karta AB-1a Pakiet L (2026-09-23): jedynym „emiterem" byla bramka
    # `solver_input/provenance.py::osd_card_gate` — bez ani jednego wolajacego w
    # `backend/src` (wylacznie testy; LEGACY_USUNAC B24 inwentarza werdyktow
    # `docs/audit/INWENTARZ_WERDYKTOW_LAKONICZNYCH_2026-09-23.md`), skasowana.
    "oze.card_field_not_accepted": (
        "Brak emitera po kasacji martwej bramki `osd_card_gate` (AB-1a Pakiet L, "
        "LEGACY_USUNAC B24) — żaden tor produkcyjny jej nie wołał, więc kod nie miał "
        "drogi do projektanta. Jakość pól karty falownika (DATASHEET / ESTIMATED / "
        "SYSTEM_DEFAULT) pozostaje jawna w proweniencji karty "
        "(`resolve_card_field_quality_map`)."
    ),
    # Kody starsze, ktore rejestr niesie bez emitera w kodzie produkcyjnym.
    "analysis.blocked_by_readiness": (
        "Stan zbiorczy wyliczany przez bramkę analiz z pozostałych kodów — nie jest "
        "emitowany jako osobne zgłoszenie."
    ),
    "apparatus.nn_catalog_missing": "Brak emitera: walidacja aparatury nN po stronie ENM nierozpoczęta.",
    "apparatus.sn_catalog_missing": "Brak emitera: walidacja aparatury SN po stronie ENM nierozpoczęta.",
    "import.catalog_mapping_required": "Emiter w torze importu — tor nieaktywny w tej wersji.",
    "load.catalog_missing": "Brak emitera: walidacja katalogu odbioru nie zgłasza tego kodu.",
    "load.power_zero": "Brak emitera: walidacja mocy odbioru nie zgłasza tego kodu.",
    "nn.cable_catalog_missing": "Brak emitera: walidacja kabla nN nie zgłasza tego kodu.",
    "nn.main_breaker_missing": "Brak emitera: wymóg wyłącznika głównego nN nie jest sprawdzany.",
    "oze.bess_no_transformer": "Warunek sprawdzany w kaskadzie D1 pod innym kodem błędu operacji.",
    "oze.nn_bus_required": "Warunek sprawdzany w kaskadzie D1 pod innym kodem błędu operacji.",
    "oze.pv_no_transformer": "Warunek sprawdzany w kaskadzie D1 pod innym kodem błędu operacji.",
    "protection.ct_required": "Brak emitera: wymóg CT sprawdzany w kreatorze pola, nie w walidacji ENM.",
    "protection.vt_required": "Brak emitera: wymóg VT sprawdzany w kreatorze pola, nie w walidacji ENM.",
    "protection.settings_incomplete": (
        "Zastąpiony przez `protection.nominal_current_missing` i "
        "`protection.fault_current_missing` (V12K-189) — kasacja W3-C1 (2026-09) "
        "usunęła ICH JEDYNY emiter razem z metodyką V12K-189: skasowany "
        "`application/analyses/protection/overcurrent/calculator.py` definiował "
        "`READINESS_NOMINAL_CURRENT_MISSING`/`READINESS_FAULT_CURRENT_MISSING` i "
        "dopisywał je do WŁASNEJ listy `readiness` (zweryfikowane w historii git na "
        "`a16f8d2b`, linie 17-18/60/70/84 pliku sprzed kasacji) — wyłącznie na "
        "użytek prezentacji tamtej metodyki (`settings_presentation.py`, "
        "`api/protection_overcurrent_settings.py`, oba skasowane razem z nim), bez "
        "połączenia z kanonicznym rejestrem `/api/readiness/registry`. Metodyka "
        "nastaw nadprądowych jest odtąd wyłącznie Hoppel/IRiESD "
        "(`application/protection_settings/`), która nie używa kodów gotowości — "
        "brak danych wejścia kończy się jawnym powodem PL "
        "(`BrakDanychNastawError`), nie kodem kanonu."
    ),
    "protection.nominal_current_missing": (
        "Brak emitera po kasacji V12K-189 (karta W3-C1, 2026-09) — patrz "
        "`protection.settings_incomplete` powyżej: jedynym miejscem, które "
        "kiedykolwiek budowało TEN kod (nie tylko go deklarowało w rejestrze "
        "kanonu), był skasowany `overcurrent/calculator.py`."
    ),
    "protection.fault_current_missing": (
        "Brak emitera po kasacji V12K-189 (karta W3-C1, 2026-09) — jak "
        "`protection.nominal_current_missing` powyżej."
    ),
    "ring.endpoints_missing": "Brak emitera: warunek sprawdzany przy operacji domykania pierścienia.",
    "ring.nop_required": "Emiter przez odwzorowanie kodu walidatora I005 (nie literał w kodzie).",
    "station.nn_outgoing_min_1": "Brak emitera: liczba odpływów nN nie jest sprawdzana.",
    "station.required_field_missing": "Emiter przez odwzorowanie kodu walidatora E021.",
    "station.type_invalid": "Brak emitera: typ stacji walidowany kontraktem operacji, nie kodem gotowości.",
    "study_case.missing_base_snapshot": "Brak emitera: warunek pilnowany wyjątkiem warstwy przypadku.",
    "transformer.connection_missing": "Brak emitera: połączenie transformatora walidowane kontraktem operacji.",
    "trunk.segment_length_invalid": "Brak emitera: długość walidowana kontraktem operacji.",
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
