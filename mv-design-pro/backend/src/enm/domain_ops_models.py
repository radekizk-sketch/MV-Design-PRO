"""
Domain Operations Models — modele Pydantic v2 dla systemu operacji domenowych.

Kanoniczne modele envelope'ów, odpowiedzi, payloadów operacji
oraz typów pomocniczych stosowanych w warstwie domenowej ENM.

Wszystkie modele używają Pydantic v2 BaseModel z konfiguracją frozen
(niemutowalność instancji, bezpieczne hashowanie).
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Konfiguracja bazowa — frozen dla wszystkich modeli
# ---------------------------------------------------------------------------


class _FrozenBase(BaseModel):
    """Baza z konfiguracją frozen — niemutowalne instancje."""

    model_config = {"frozen": True}


# ===========================================================================
# 1. ENVELOPE — wspólna koperta wywołania operacji domenowej
# ===========================================================================


class DomainOpPayload(_FrozenBase):
    """Payload operacji domenowej.

    Zawiera kanoniczną nazwę operacji, klucz idempotentności
    oraz właściwe dane (payload) operacji.
    """

    name: str
    """Kanoniczna nazwa operacji (np. 'add_grid_source_sn')."""

    idempotency_key: str
    """Klucz idempotentności — zapewnia jednokrotne wykonanie."""

    payload: dict[str, Any]
    """Dane specyficzne dla danej operacji."""


class DomainOpEnvelope(_FrozenBase):
    """Wspólny envelope wywołania operacji domenowej.

    Identyfikuje projekt, bazowy snapshot modelu
    oraz operację do wykonania.
    """

    project_id: str
    """Identyfikator projektu."""

    snapshot_base_hash: str
    """Hash snapshotu bazowego — zapewnia spójność optimistic concurrency."""

    operation: DomainOpPayload
    """Payload operacji do wykonania."""


# ===========================================================================
# 2. RESPONSE — odpowiedź operacji domenowej
# ===========================================================================


class ReadinessBlocker(_FrozenBase):
    """Blokujący problem gotowości — uniemożliwia wykonanie obliczeń."""

    code: str
    """Kod błędu (np. 'MISSING_SOURCE', 'NO_CATALOG')."""

    severity: Literal["BLOKUJACE"] = "BLOKUJACE"
    """Poziom ważności — zawsze BLOKUJACE."""

    message_pl: str
    """Komunikat w języku polskim."""

    element_ref: str | None = None
    """Opcjonalna referencja do elementu, którego dotyczy problem."""


class ReadinessWarning(_FrozenBase):
    """Ostrzeżenie gotowości — nie blokuje, ale wymaga uwagi."""

    code: str
    """Kod ostrzeżenia (np. 'MISSING_CT', 'SHORT_SEGMENT')."""

    severity: Literal["OSTRZEZENIE"] = "OSTRZEZENIE"
    """Poziom ważności — zawsze OSTRZEZENIE."""

    message_pl: str
    """Komunikat w języku polskim."""

    element_ref: str | None = None
    """Opcjonalna referencja do elementu, którego dotyczy ostrzeżenie."""


class ReadinessInfo(_FrozenBase):
    """Informacja o gotowości modelu do obliczeń.

    Zawiera flagę gotowości oraz listy blokerów i ostrzeżeń.
    """

    ready: bool
    """True jeśli model jest gotowy do obliczeń (brak blokerów)."""

    blockers: list[ReadinessBlocker] = []
    """Lista problemów blokujących obliczenia."""

    warnings: list[ReadinessWarning] = []
    """Lista ostrzeżeń (nie blokują obliczeń)."""


class FixActionItem(_FrozenBase):
    """Deterministyczna sugestia naprawcza dla problemu walidacyjnego.

    Opisuje akcję UI do podjęcia — nie modyfikuje modelu.
    """

    code: str
    """Kod akcji naprawczej (np. 'FIX_MISSING_CATALOG')."""

    action_type: Literal[
        "OPEN_MODAL",
        "NAVIGATE_TO_ELEMENT",
        "SELECT_CATALOG",
        "ADD_MISSING_DEVICE",
    ]
    """Typ akcji UI do wykonania."""

    element_ref: str | None = None
    """Opcjonalna referencja do elementu docelowego."""

    panel: str | None = None
    """Panel UI, który należy otworzyć."""

    step: str | None = None
    """Krok kreatora, do którego należy przejść."""

    focus: str | None = None
    """Pole formularza, na które należy ustawić fokus."""

    message_pl: str = ""
    """Komunikat dla użytkownika w języku polskim."""


class ChangeSet(_FrozenBase):
    """Zestaw zmian wykonanych przez operację domenową.

    Identyfikatory elementów utworzonych, zmodyfikowanych i usuniętych.
    """

    created_element_ids: list[str] = []
    """Identyfikatory nowo utworzonych elementów."""

    updated_element_ids: list[str] = []
    """Identyfikatory zmodyfikowanych elementów."""

    deleted_element_ids: list[str] = []
    """Identyfikatory usuniętych elementów."""


class SelectionHint(_FrozenBase):
    """Podpowiedź dla UI — który element zaznaczyć po operacji."""

    element_id: str | None = None
    """Identyfikator elementu do zaznaczenia."""

    element_type: str | None = None
    """Typ elementu (np. 'bus', 'branch', 'transformer')."""

    zoom_to: bool = True
    """Czy przybliżyć widok do zaznaczonego elementu."""


class AuditEntry(_FrozenBase):
    """Wpis śladu audytowego operacji.

    Każdy krok operacji generuje jeden wpis.
    """

    step: int
    """Numer kroku operacji (1-based)."""

    action: str
    """Opis wykonanej akcji."""

    element_id: str | None = None
    """Opcjonalny identyfikator elementu, na którym wykonano akcję."""

    detail: str = ""
    """Dodatkowe szczegóły (np. wartości parametrów)."""


class DomainEvent(_FrozenBase):
    """Zdarzenie domenowe emitowane przez operację.

    Zdarzenia opisują co się zmieniło w modelu —
    służą do reaktywnej aktualizacji widoków.
    """

    event_seq: int
    """Numer sekwencyjny zdarzenia w ramach operacji."""

    event_type: str
    """Typ zdarzenia (np. 'SEGMENT_SPLIT', 'STATION_CREATED')."""

    element_id: str | None = None
    """Opcjonalny identyfikator elementu, którego dotyczy zdarzenie."""

    detail: str = ""
    """Dodatkowe szczegóły zdarzenia."""


class DomainOpResponse(_FrozenBase):
    """Odpowiedź operacji domenowej.

    Zawiera pełny stan modelu po operacji, widoki logiczne,
    informacje o gotowości, sugestie naprawcze, zmiany,
    ślad audytowy oraz zdarzenia domenowe.
    """

    snapshot: dict[str, Any]
    """Pełny snapshot modelu po wykonaniu operacji."""

    logical_views: dict[str, Any] = {}
    """Widoki logiczne (np. drzewo topologiczne, widok magistrali)."""

    readiness: ReadinessInfo
    """Informacja o gotowości modelu do obliczeń."""

    fix_actions: list[FixActionItem] = []
    """Lista sugestii naprawczych dla wykrytych problemów."""

    changes: ChangeSet
    """Zestaw zmian wykonanych przez operację."""

    selection_hint: SelectionHint | None = None
    """Podpowiedź dla UI — co zaznaczyć po operacji."""

    audit_trail: list[AuditEntry] = []
    """Ślad audytowy — kroki wykonane w ramach operacji."""

    domain_events: list[DomainEvent] = []
    """Zdarzenia domenowe emitowane przez operację."""


# ===========================================================================
# 2b. CatalogBindingPayload — kanoniczne wiązanie katalogowe w payloadach
# ===========================================================================


class CatalogBindingPayload(_FrozenBase):
    """Canonical catalog binding in domain operation payloads.

    Links an element to a specific catalog item version
    with materialization control.
    """

    catalog_namespace: str
    """Namespace katalogu (np. KABEL_SN, TRAFO_SN_NN, APARAT_SN)."""

    catalog_item_id: str
    """Identyfikator pozycji katalogowej."""

    catalog_item_version: str
    """Wersja pozycji katalogowej (obowiązkowa)."""

    materialize: bool = True
    """Czy zmaterializować parametry do Snapshot."""

    snapshot_mapping_version: str = "1.0"
    """Wersja mapowania materializacji."""


# ===========================================================================
# 3. InsertAt — kanoniczny model pozycji wstawienia
# ===========================================================================


class AnchorValue(_FrozenBase):
    """Wartość kotwicząca — pozycja względem istniejącego elementu.

    Używana gdy mode='ANCHOR' w InsertAt.
    """

    anchor_id: str
    """Identyfikator elementu kotwiczącego."""

    offset_m: float
    """Przesunięcie od kotwicy w metrach."""


class InsertAt(_FrozenBase):
    """Kanoniczny model pozycji wstawienia elementu na segmencie.

    Trzy tryby:
    - RATIO: pozycja jako ułamek długości segmentu (0.0–1.0)
    - ODLEGLOSC_OD_POCZATKU_M: odległość od początku segmentu w metrach
    - ANCHOR: pozycja względem istniejącego elementu (AnchorValue)
    """

    mode: Literal["RATIO", "ODLEGLOSC_OD_POCZATKU_M", "ANCHOR"]
    """Tryb określania pozycji wstawienia."""

    value: float | AnchorValue
    """Wartość pozycji — float dla RATIO/ODLEGLOSC, AnchorValue dla ANCHOR."""


# ===========================================================================
# 4. Station Field Models — modele pól stacji SN/nN
# ===========================================================================


class CatalogBindings(_FrozenBase):
    """Powiązania katalogowe pola stacji.

    Referencje do pozycji katalogowych dla linii, łączników,
    przekładników prądowych i napięciowych.
    """

    line_catalog_ref: str | None = None
    """Referencja katalogowa linii/kabla."""

    switch_catalog_ref: str | None = None
    """Referencja katalogowa łącznika."""

    ct_catalog_ref: str | None = None
    """Referencja katalogowa przekładnika prądowego (CT)."""

    vt_catalog_ref: str | None = None
    """Referencja katalogowa przekładnika napięciowego (VT)."""


class SNFieldSpec(_FrozenBase):
    """Specyfikacja pola SN (średniego napięcia).

    Opisuje rolę pola i powiązania katalogowe.
    """

    field_role: Literal[
        "LINIA_IN",
        "LINIA_OUT",
        "LINIA_ODG",
        "TRANSFORMATOROWE",
        "SPRZEGLO",
        "POMIAROWE",
    ]
    """Rola pola SN w rozdzielnicy.

    `POMIAROWE` (pole układu pomiarowo-rozliczeniowego) było w kontrakcie
    pominięte, choć `Bay.bay_role` i read-model pola znały je od dawna —
    dokumentowany kontrakt zaprzeczał modelowi.
    """

    rodzaj_pomiaru: Literal["ROZLICZENIOWY", "KONTROLNY"] | None = None
    """Rodzaj pomiaru pola POMIAROWEGO (kontrakt POMIAR_ROZLICZENIOWY_SN_V1 §5,
    V12K-335 pkt 2) — addytywnie, wyłącznie dla `field_role='POMIAROWE'`:

    - `ROZLICZENIOWY` — układ pomiarowo-rozliczeniowy odbiorcy (granica stron);
      podlega bramie pomiaru w torze tranzytu,
    - `KONTROLNY` — pomiar kontrolny/ruchowy OSD; wolny na każdej drodze.

    Brak deklaracji na drodze budowy stacji ⇒ ROZLICZENIOWY (deklaracja stacji
    z polem POMIAROWYM opisuje przyłącze klienta, §3 reguła 1). Deklaracja na
    polu innej roli ⇒ błąd `sn.rodzaj_pomiaru_poza_polem_pomiarowym`."""

    catalog_bindings: CatalogBindings | None = None
    """Opcjonalne powiązania katalogowe aparatury."""

    apparatus_catalog_ref: str | None = None
    """Aparat pola z katalogu APARAT_SN (B-12) — wskazanie WYMAGANE przez operację
    (albo wspólne `field_apparatus_catalog_ref` payloadu). Operacja nie dobiera
    aparatu samodzielnie: brak wskazania kończy się błędem walidacji."""

    cell_type: (
        Literal[
            "SDC",
            "SDF",
            "CBC",
            "DBC",
            "BRC",
            "SEC",
            "SBC",
            "SMC",
            "SDM_V",
            "SDM_C",
        ]
        | None
    ) = None
    """Typ pola ABB UniSwitch (katalog §4 „Rodzaje pól"). Opcjonalny i addytywny —
    domyślnie None, więc jest wykluczany z deterministycznego odcisku ENM
    (exclude_none). Nie wypełniać na istniejących fixture'ach."""

    equipment: dict[str, Any] | None = None
    """Wyposażenie pomiarowo-zabezpieczeniowe pola (B-3) — addytywne i opcjonalne.

    Klucze `ct`, `vt`, `relay` niosą DOKŁADNIE payload operacji `add_ct`/`add_vt`/
    `add_relay` (bez `bay_ref` — operacja stacyjna dopina referencję utworzonego
    pola). Wskazanie wyposażenia sprawia, że powstaje ono w TEJ SAMEJ operacji i
    migawce co stacja: błąd któregokolwiek elementu kończy całą operację (koniec
    stanu połowicznego „stacja zapisana, wyposażenie częściowe"). Pominięcie pola
    zachowuje dotychczasowe zachowanie — wyposażenie zakładane osobnymi
    operacjami."""


class TransformerSpec(_FrozenBase):
    """Specyfikacja transformatora SN/nN w stacji.

    Opisuje typ, katalog i parametry transformatora.
    """

    create: Literal[True] = True
    """Flaga utworzenia transformatora (zawsze True)."""

    transformer_catalog_ref: str | None = None
    """Referencja do pozycji katalogowej transformatora."""

    model_type: Literal["DWU_UZWOJENIOWY"] = "DWU_UZWOJENIOWY"
    """Typ modelu transformatora."""

    tap_changer_present: bool = False
    """Czy transformator posiada przełącznik zaczepów."""


class NNFeederSpec(_FrozenBase):
    """Specyfikacja odpływu nN (niskiego napięcia).

    Opisuje rolę odpływu oraz powiązania katalogowe.
    """

    feeder_role: Literal[
        "ODPLYW_NN",
        "ODPLYW_REZERWOWY",
        "ZRODLO_NN_PV",
        "ZRODLO_NN_BESS",
    ]
    """Rola odpływu nN."""

    catalog_bindings: CatalogBindings | None = None
    """Opcjonalne powiązania katalogowe odpływu."""


class NNBlockSpec(_FrozenBase):
    """Minimalny blok nN (niskiego napięcia).

    Opisuje konfigurację szyny nN, wyłącznika głównego
    oraz odpływów nN w stacji.
    """

    create_nn_bus: Literal[True] = True
    """Flaga utworzenia szyny nN (zawsze True)."""

    main_breaker_nn: Literal[True] = True
    """Flaga utworzenia wyłącznika głównego nN (zawsze True)."""

    outgoing_feeders_nn_count: int = 1
    """Liczba odpływów nN (>= 1)."""

    outgoing_feeders_nn: list[NNFeederSpec] = []
    """Specyfikacje poszczególnych odpływów nN."""


# ===========================================================================
# 4b. SourceNN Models — modele źródeł w rozdzielni nN
# ===========================================================================


class NNSourceType:
    """Typy źródeł w rozdzielni nN (stałe, nie enum — Pydantic-frozen)."""

    PV_INVERTER = "PV_INVERTER"
    BESS_INVERTER = "BESS_INVERTER"
    FW_INVERTER = "FW_INVERTER"
    GENSET = "GENSET"
    UPS = "UPS"


class NNSwitchSpec(_FrozenBase):
    """Specyfikacja aparatu łączeniowego pola źródłowego nN."""

    switch_kind: Literal["WYLACZNIK", "ROZLACZNIK", "BEZPIECZNIK"]
    """Rodzaj aparatu łączeniowego (PL)."""

    normal_state: Literal["OTWARTY", "ZAMKNIETY"]
    """Stan normalny aparatu — jawnie, bez domyślnego."""

    catalog_ref: str | None = None
    """Referencja katalogowa aparatu (id+wersja) lub None => blocker."""

    catalog_version: str | None = None
    """Wersja pozycji katalogowej."""


class NNSourceFieldSpec(_FrozenBase):
    """Specyfikacja pola źródłowego nN.

    Pole dedykowane źródłu w rozdzielni nN — zawiera aparat łączeniowy
    i port przyłączeniowy źródła.
    """

    source_field_kind: Literal["PV", "BESS", "AGREGAT", "UPS", "FW"]
    """Rodzaj pola źródłowego (PL)."""

    switch_spec: NNSwitchSpec
    """Specyfikacja aparatu łączeniowego pola."""

    voltage_nn_kv: float
    """Napięcie nN (kV) — jawnie, >0, bez domyślnego."""

    field_name: str | None = None
    """Opcjonalna nazwa pola."""

    field_label: str | None = None
    """Opcjonalne oznaczenie pola."""


class GensetSpec(_FrozenBase):
    """Specyfikacja zespołu prądotwórczego (agregatu) w nN."""

    catalog_item_id: str | None = None
    """Identyfikator pozycji katalogowej agregatu."""

    catalog_item_version: str | None = None
    """Wersja pozycji katalogowej."""

    rated_power_kw: float
    """Moc znamionowa (kW) — >0."""

    rated_voltage_kv: float
    """Napięcie znamionowe (kV) — jawnie."""

    power_factor: float
    """Współczynnik mocy — jawnie."""

    operation_mode: Literal[
        "PRACA_CIAGLA",
        "PRACA_AWARYJNA",
        "PRACA_SZCZYTOWA",
        "WYLACZONE",
    ]
    """Tryb pracy — jawnie."""

    fuel_type: Literal["DIESEL", "GAZ", "BIOPALIWO", "INNY"] | None = None
    """Rodzaj paliwa — opcjonalnie."""

    source_name: str | None = None
    source_label: str | None = None


class UPSSpec(_FrozenBase):
    """Specyfikacja zasilacza UPS w nN."""

    catalog_item_id: str | None = None
    """Identyfikator pozycji katalogowej UPS."""

    catalog_item_version: str | None = None
    """Wersja pozycji katalogowej."""

    rated_power_kw: float
    """Moc znamionowa (kW) — >0."""

    backup_time_min: float
    """Czas podtrzymania (min) — >0."""

    operation_mode: Literal[
        "ONLINE",
        "LINE_INTERACTIVE",
        "OFFLINE",
        "WYLACZONE",
    ]
    """Tryb pracy — jawnie."""

    battery_type: Literal["LI_ION", "VRLA", "NICD", "INNY"] | None = None
    """Typ akumulatora — opcjonalnie."""

    source_name: str | None = None
    source_label: str | None = None


class MaterializedSourceParams(_FrozenBase):
    """Zmaterializowane parametry źródła nN z katalogu.

    Stabilne pole w Snapshot — kopia parametrów z katalogu
    w momencie przypięcia.
    """

    catalog_item_id: str
    catalog_item_version: str
    sn_mva: float | None = None
    pmax_mw: float | None = None
    un_kv: float | None = None
    k_sc: float | None = None
    cos_phi_min: float | None = None
    cos_phi_max: float | None = None
    e_kwh: float | None = None


class SourceNN(_FrozenBase):
    """Kanoniczny model źródła w rozdzielni nN.

    Jedyna prawda o źródle w Snapshot — deterministyczne ID,
    powiązania z polem i aparatem, zmaterializowane parametry.
    """

    element_id: str
    """Deterministyczny identyfikator źródła."""

    source_type: Literal["PV_INVERTER", "BESS_INVERTER", "FW_INVERTER", "GENSET", "UPS"]
    """Typ źródła."""

    field_id: str
    """Identyfikator pola nN, do którego jest przypięte."""

    switch_id: str
    """Identyfikator aparatu odłączającego."""

    bus_nn_ref: str
    """Referencja do szyny nN."""

    station_ref: str
    """Referencja do stacji SN/nN."""

    catalog_item_id: str | None = None
    """Identyfikator pozycji katalogowej urządzenia."""

    catalog_item_version: str | None = None
    """Wersja pozycji katalogowej."""

    materialized_params: MaterializedSourceParams | None = None
    """Zmaterializowane parametry z katalogu."""

    operation_mode: str
    """Jawny tryb pracy."""

    constraints: dict[str, Any] = {}
    """Jawne ograniczenia (limit Pmax, Q, SOC, etc.)."""

    readiness_codes: list[str] = []
    """Wyliczane kody gotowości."""

    name: str | None = None
    label: str | None = None
    in_service: bool = True


class StationOptions(_FrozenBase):
    """Opcje tworzenia stacji SN/nN.

    Flagi sterujące automatycznym tworzeniem elementów stacji.
    """

    create_transformer_field: bool = True
    """Czy utworzyć pole transformatorowe."""

    create_default_fields: bool = True
    """Czy utworzyć domyślne pola SN."""

    create_nn_bus: bool = True
    """Czy utworzyć szynę nN."""


# ===========================================================================
# 5. Operation-specific payloads — payloady operacji domenowych
# ===========================================================================


class AddGridSourceSNPayload(_FrozenBase):
    """Payload operacji: add_grid_source_sn.

    Dodaje źródło zasilania sieciowego SN (punkt zasilania z systemu).
    """

    source_name: str | None = None
    """Opcjonalna nazwa źródła zasilania."""

    bus_name: str | None = None
    """Opcjonalna nazwa szyny zasilającej."""

    voltage_kv: float
    """Napięcie znamionowe [kV]."""

    sk3_mva: float | None = None
    """Moc zwarciowa trójfazowa [MVA]."""

    ik3_ka: float | None = None
    """Prąd zwarciowy trójfazowy [kA]."""

    rx_ratio: float | None = None
    """Stosunek R/X impedancji zwarciowej."""

    line_fields_per_section: int | None = None
    """Liczba pól liniowych odpływowych tworzonych na każdej sekcji GPZ."""

    pozycja_widokowa: dict[str, Any] | None = None
    """Pozycja elementu na schemacie jednokreskowym (SLD)."""

    catalog_binding: dict[str, Any] | None = None
    """Kanoniczne powiazanie katalogowe z typem zrodla systemowego."""

    manual_equivalent: dict[str, Any] | None = None
    """Reczna umowa rownowazna dla zrodla GPZ, gdy katalog nie jest uzywany."""


class SegmentSpec(_FrozenBase):
    """Specyfikacja segmentu linii/kabla.

    Opisuje rodzaj, długość i katalog segmentu.
    """

    rodzaj: Literal["KABEL", "LINIA_NAPOWIETRZNA"]
    """Rodzaj segmentu — kabel lub linia napowietrzna."""

    dlugosc_m: float
    """Długość segmentu [m]."""

    catalog_ref: str | None = None
    """Opcjonalna referencja katalogowa."""

    name: str | None = None
    """Opcjonalna nazwa segmentu."""


class ContinueTrunkSegmentSNPayload(_FrozenBase):
    """Payload operacji: continue_trunk_segment_sn.

    Kontynuuje budowę magistrali SN o kolejny segment.
    """

    trunk_id: str
    """Identyfikator magistrali."""

    from_terminal_id: str
    """Identyfikator terminala, od którego kontynuować."""

    segment: SegmentSpec
    """Specyfikacja nowego segmentu."""

    parametry_jawne: dict[str, Any] = {}
    """Jawnie podane parametry elektryczne (tryb EKSPERT)."""

    pozycja_widokowa: dict[str, Any] | None = None
    """Pozycja elementu na schemacie jednokreskowym (SLD)."""


class StationSpec(_FrozenBase):
    """Specyfikacja stacji SN/nN.

    Opisuje typ, rolę, nazwę oraz napięcia stacji.
    """

    station_type: Literal["A", "B", "C", "D", "inline", "branch", "terminal", "sectional"]
    """Typ stacji (A/B/C/D wg klasyfikacji)."""

    station_role: Literal["STACJA_SN_NN"] = "STACJA_SN_NN"
    """Rola stacji — stacja transformatorowa SN/nN."""

    station_name: str | None = None
    """Opcjonalna nazwa stacji."""

    designation: str | None = None
    """Oznaczenie stacji na dokumentacji, np. „ST-15/0,4-01" (B-4). Addytywne."""

    construction_type: (
        Literal["wnetrzowa", "kontenerowa", "slupowa", "prefabrykowana", "inna"] | None
    ) = None
    """Typ konstrukcji stacji (B-5) — parytet z `enm.models.Substation`. Addytywny."""

    sn_voltage_kv: float
    """Napięcie strony SN [kV]."""

    nn_voltage_kv: float
    """Napięcie strony nN [kV]."""


class TrunkRef(_FrozenBase):
    """Referencja do magistrali — kontekst wstawienia stacji.

    Opcjonalnie wskazuje magistralę i terminale
    w kontekście wstawienia stacji na segmencie.
    """

    trunk_id: str | None = None
    """Identyfikator magistrali."""

    terminal_from_id: str | None = None
    """Identyfikator terminala początkowego."""

    terminal_to_id: str | None = None
    """Identyfikator terminala końcowego."""


class InsertStationOnSegmentSNPayload(_FrozenBase):
    """Payload operacji: insert_station_on_segment_sn.

    Wstawia stację transformatorową SN/nN na istniejącym segmencie.
    Segment zostaje rozdzielony, stacja powstaje w punkcie podziału.
    """

    segment_id: str
    """Identyfikator segmentu, na którym wstawiana jest stacja."""

    insert_at: InsertAt
    """Pozycja wstawienia na segmencie."""

    station: StationSpec
    """Specyfikacja tworzonej stacji."""

    sn_fields: list[SNFieldSpec]
    """Lista pól SN rozdzielnicy."""

    field_apparatus_catalog_ref: str | None = None
    """Wspólny aparat pól SN z katalogu APARAT_SN (B-12) — używany, gdy pole nie
    ma własnego `apparatus_catalog_ref`."""

    transformer: TransformerSpec
    """Specyfikacja transformatora SN/nN."""

    nn_block: NNBlockSpec
    """Specyfikacja bloku nN."""

    options: StationOptions
    """Opcje tworzenia stacji."""

    trunk_ref: TrunkRef | None = None
    """Opcjonalna referencja do magistrali."""


class StartBranchSegmentSNPayload(_FrozenBase):
    """Payload operacji: start_branch_segment_sn.

    Rozpoczyna nowe odgałęzienie (branch) od istniejącej szyny.
    """

    from_bus_ref: str
    """Referencja szyny, od której startuje odgałęzienie."""

    from_port: str | None = None
    """Opcjonalny port na szynie źródłowej."""

    segment: SegmentSpec
    """Specyfikacja pierwszego segmentu odgałęzienia."""

    pozycja_widokowa: dict[str, Any] | None = None
    """Pozycja elementu na schemacie jednokreskowym (SLD)."""


class InsertSectionSwitchSNPayload(_FrozenBase):
    """Payload operacji: insert_section_switch_sn.

    Wstawia łącznik sekcyjny (rozłącznik/wyłącznik) na segmencie.
    """

    segment_id: str
    """Identyfikator segmentu, na którym wstawiany jest łącznik."""

    insert_at: InsertAt
    """Pozycja wstawienia na segmencie."""

    switch_type: Literal["ROZLACZNIK", "WYLACZNIK"] = "ROZLACZNIK"
    """Typ łącznika — rozłącznik lub wyłącznik."""

    switch_name: str | None = None
    """Opcjonalna nazwa łącznika."""

    normal_state: Literal["closed", "open"] = "closed"
    """Stan normalny łącznika."""


class ConnectSecondaryRingSNPayload(_FrozenBase):
    """Payload operacji: connect_secondary_ring_sn.

    Łączy dwie szyny segmentem zamykającym pierścień SN.
    """

    from_bus_ref: str
    """Referencja szyny początkowej pierścienia."""

    to_bus_ref: str
    """Referencja szyny końcowej pierścienia."""

    segment: SegmentSpec | None = None
    """Opcjonalna specyfikacja segmentu łączącego."""

    ring_name: str | None = None
    """Opcjonalna nazwa pierścienia."""


class SetNormalOpenPointPayload(_FrozenBase):
    """Payload operacji: set_normal_open_point.

    Ustawia punkt normalnie otwarty (NOP) na łączniku w pierścieniu.
    """

    switch_ref: str
    """Referencja łącznika, który ma być punktem NOP."""

    corridor_ref: str | None = None
    """Opcjonalna referencja magistrali (korytarza)."""


class AddTransformerSNNNPayload(_FrozenBase):
    """Payload operacji: add_transformer_sn_nn.

    Dodaje transformator SN/nN między istniejącymi szynami.
    """

    hv_bus_ref: str
    """Referencja szyny strony górnego napięcia (SN)."""

    lv_bus_ref: str
    """Referencja szyny strony dolnego napięcia (nN)."""

    transformer_catalog_ref: str | None = None
    """Opcjonalna referencja katalogowa transformatora."""

    sn_mva: float | None = None
    """Moc znamionowa [MVA]."""

    uhv_kv: float | None = None
    """Napięcie znamionowe strony górnej [kV]."""

    ulv_kv: float | None = None
    """Napięcie znamionowe strony dolnej [kV]."""

    uk_percent: float | None = None
    """Napięcie zwarcia [%]."""

    pk_kw: float | None = None
    """Straty obciążeniowe [kW]."""

    station_ref: str | None = None
    """Opcjonalna referencja stacji, do której należy transformator."""


class AssignCatalogToElementPayload(_FrozenBase):
    """Payload operacji: assign_catalog_to_element.

    Przypisuje pozycję katalogową do istniejącego elementu modelu.
    """

    element_ref: str
    """Referencja elementu, do którego przypisywany jest katalog."""

    catalog_item_id: str
    """Identyfikator pozycji katalogowej."""

    catalog_item_version: str | None = None
    """Opcjonalna wersja pozycji katalogowej."""


class UpdateElementParametersPayload(_FrozenBase):
    """Payload operacji: update_element_parameters.

    Aktualizuje parametry istniejącego elementu modelu.
    """

    element_ref: str
    """Referencja elementu do aktualizacji."""

    parameters: dict[str, Any]
    """Słownik parametrów do ustawienia."""

    reason: str | None = None
    """Opcjonalny powód zmiany (audyt)."""


# ===========================================================================
# 5b. nN Source Operation Payloads
# ===========================================================================


class AddSnBayPayload(_FrozenBase):
    """Payload: add_sn_bay — dodaje pole SN do istniejącej rozdzielnicy."""

    bus_ref: str
    """Referencja szyny SN, do której przypinane jest pole."""

    station_ref: str | None = None
    """Opcjonalna referencja stacji/GPZ/ZKSN zawierającej szynę."""

    bay_role: Literal["IN", "OUT", "FEEDER", "TR", "COUPLER", "MEASUREMENT", "OZE"] = "FEEDER"
    """Rola pola w kontrakcie ENM."""

    rodzaj_pomiaru: Literal["ROZLICZENIOWY", "KONTROLNY"] | None = None
    """Rodzaj pomiaru — wyłącznie dla `bay_role='MEASUREMENT'` (kontrakt
    POMIAR_ROZLICZENIOWY_SN_V1 §5). Dokładanie pojedynczego pola nie deklaruje
    przyłącza klienta, więc brak deklaracji ⇒ KONTROLNY (ruchowy OSD); status
    ROZLICZENIOWY wymaga deklaracji JAWNEJ i podlega bramie
    `sn.pomiar_w_torze_tranzytu`. Deklaracja na polu innej roli ⇒ błąd
    `sn.rodzaj_pomiaru_poza_polem_pomiarowym`."""

    field_name: str | None = None
    """Opcjonalna nazwa pola."""

    apparatus_kind: Literal["BREAKER", "DISCONNECTOR", "LOAD_SWITCH", "MEASUREMENT"] | None = None
    """Jawny wariant aparatu głównego pola."""

    gpz_section_id: str | None = None
    """Sekcja GPZ, jeśli pole dotyczy konkretnej sekcji."""

    catalog_binding: dict[str, Any] | None = None
    """Kanoniczne powiązanie katalogowe aparatu SN (fallback ekspercki)."""

    # V12K-058 (G-POLE-R): powiązanie pola z szablonem producenta — parytet z kreatorem
    # stacji/GPZ (append_station_on_endpoint, add_grid_source_sn). Refy trafiają na
    # field_spec przez _build_field_spec; protection wywodzi backend z szablonu.
    switchgear_family_ref: str | None = None
    """Rodzina rozdzielnicy producenta (Reference Engine)."""

    bay_template_ref: str | None = None
    """Szablon pola producenta (CompleteMvBayTemplate) dla roli/BayKind."""

    manufacturer_ref: str | None = None
    """Producent (metadana szablonu/rodziny)."""

    protection_ref: str | None = None
    """Referencja zabezpieczenia polowego (gdy jawnie wskazana)."""


class ConverterSourceFieldPayload(_FrozenBase):
    """Minimalny kontrakt pola źródłowego dla kanonicznego add_converter_source."""

    source_field_kind: Literal["PV", "BESS", "FW"]
    field_name: str | None = None
    catalog_binding: dict[str, Any] | None = None


class DerBlockTransformerSpec(_FrozenBase):
    """TR blokowy DER — OSOBNY element modelu (≠ transformator stacji), katalog-first.

    Napięcia toru: strona pierwotna = SN stacji (HV), strona wtórna = wyjście
    falownika/rozdzielni producenta (LV). Katalog TRAFO_SN_NN dostarcza fizykę
    solvera; jawne pola walidują spójność napięć i stanowią bazę materializacji.
    """

    rated_power_mva: float | None = None
    primary_voltage_kv: float | None = None
    secondary_voltage_kv: float | None = None
    uk_percent: float | None = None
    vector_group: str | None = None
    catalog_ref: str | None = None
    catalog_binding: dict[str, Any] | None = None
    loadability_pu: float | None = None
    """Dopuszczalne obciążenie (przeciążalność) TR blokowego [pu]. Brak → domyślnie 1,0
    (konserwatywnie, PN-EN 60076-7). Konsumowane przez walidację mocy TR (D1 wymaganie 5)."""


class DerMvFieldConfigurationSpec(_FrozenBase):
    """Wyposażenie dedykowanego pola źródłowego SN DER (łańcuch W1, katalog-first).

    Każde pole mapuje 1:1 na obecność aparatu pierwotnego pola albo na wymaganą
    funkcję zabezpieczeniową (protection_relay → Bay.protection_codes). Kabel SN
    (odcinek przyłączeniowy TR blokowy → pole SN) materializowany z katalogu kabli.
    """

    switching_device: Literal["CB", "LBS"] = "CB"
    ct: bool = True
    vt: bool = False
    earthing_switch: bool = True
    surge_arrester: bool = False
    protection_relay: bool = True
    cable_head: bool = True
    field_name: str | None = None
    bay_template_ref: str | None = None
    apparatus_catalog_binding: dict[str, Any] | None = None
    cable_catalog_ref: str | None = None
    cable_catalog_binding: dict[str, Any] | None = None
    cable_length_km: float | None = None


class DerTopologyPayload(_FrozenBase):
    """Kontrakt kompletnego toru DER przyłączonego po stronie SN (kanon
    POLECENIE_DER_SN_TOPOLOGIA_2026-07). ADDYTYWNY: brak `der_topology` w payloadzie
    add_converter_source = dotychczasowe zachowanie (wariant A/nn bez zmian).

    connection_level='sn' + has_block_transformer materializuje pełny tor:
    szyna nN producenta → TR blokowy (osobny element) → kabel SN → pole źródłowe SN
    → szyna SN stacji. Zakaz wyprowadzania obecności TR wyłącznie z connection_level.
    """

    connection_level: Literal["nn", "sn"]
    inverter_output_voltage_kv: float | None = None
    has_manufacturer_lv_switchgear: bool = False
    lv_switchgear_variant: Literal[
        "none", "single-bus", "multi-feeder", "combiner", "integrated-skid"
    ] = "none"
    has_block_transformer: bool = False
    block_transformer: DerBlockTransformerSpec | None = None
    has_dedicated_mv_field: bool = False
    mv_field_configuration: DerMvFieldConfigurationSpec | None = None
    mv_bus_ref: str | None = None
    """Szyna SN stacji, do której przypina się dedykowane pole źródłowe SN."""
    connection_method: (
        Literal[
            "der_za_tr_stacji",
            "der_z_tr_blokowym",
            "der_bezposrednio_sn",
            "der_przez_rozdzielnie_producenta",
        ]
        | None
    ) = None
    """D1 wymaganie 9: jawny „sposób przyłączenia" DER. ADDYTYWNY (brak → dotychczasowe
    zachowanie). Mapowany JAWNIE na connection_level/has_block_transformer/
    has_manufacturer_lv_switchgear z walidacją spójności (der_sn_validation)."""
    simultaneity_factor: float | None = None
    """Współczynnik jednoczesności źródeł na wspólnym torze [pu]. Brak → domyślnie 1,0
    (konserwatywnie). Konsumowany przez walidację mocy TR (D1 wymaganie 5)."""


class AddConverterSourcePayload(_FrozenBase):
    """Payload: add_converter_source — kanoniczne źródło przekształtnikowe."""

    source_technology: Literal["PV", "BESS", "FW"]
    connection_variant: Literal["nn_side", "block_transformer"]
    station_ref: str
    bus_nn_ref: str
    placement: Literal["NEW_FIELD", "EXISTING_FIELD"] | None = None
    existing_field_ref: str | None = None
    source_field: ConverterSourceFieldPayload | None = None
    source_name: str | None = None
    quantity: int | None = None
    control_mode: str | None = None
    power_setpoint_mw: float | None = None
    q_min_mvar: float | None = None
    q_max_mvar: float | None = None
    # V12K-063 (G-OZE-B3): nachylenie Q(U) [pu Q na pu U] — wartość rządząca trybem Q_OD_U;
    # bez niej wybór trybu Q(U) był pasywny (phantom). Konsumowany przez kanoniczny PF.
    qu_slope_pu_per_pu: float | None = None
    # V12K-064 (G-OZE-B4): napięciowe pasmo nieczułości charakterystyki Q(U) [pu U] —
    # zakres napięcia, w którym Q=0 (NC RfG). Brak → domyślnie punkt 1.0/1.0 (reakcja
    # natychmiastowa). Konsumowany przez kanoniczny PF falownika (q_from_voltage).
    qu_deadband_low_pu: float | None = None
    qu_deadband_high_pu: float | None = None
    # V12K-062 (G-OZE-B): statyzm P(f)/LFSM [%Pn na %f] — regulacja mocy czynnej od
    # częstotliwości; realnie konsumowany przez kanoniczny PF falownika (lfsm_droop_pct).
    frequency_droop_percent: float | None = None
    # V12K-063: pasmo nieczułości P(f)/LFSM [Hz] (np. 0.2 Hz → LFSM-O od 50.2 Hz).
    lfsm_deadband_hz: float | None = None
    # V12K-087 (G-OZE-B2): jawne deklaracje zdolności FRT (NC RfG) — czy jednostka
    # ma zaprogramowaną charakterystykę przejścia przez zanik (LVRT) i przepięcie
    # (HVRT). Nie da się wyprowadzić z karty katalogowej (envelope Q tylko), więc
    # deklaruje je projektant. Konsumowane przez most zgodności NC RfG
    # (build_der_compliance_from_generator → NcRfgComplianceChecker). Brak → False.
    has_lvrt_curve: bool | None = None
    has_hvrt_curve: bool | None = None
    bess_mode: str | None = None
    soc_min_percent: float | None = None
    soc_max_percent: float | None = None
    blocking_transformer_ref: str | None = None
    catalog_binding: dict[str, Any] | None = None
    materialized_params: dict[str, Any] | None = None
    # W2b-DANE: kompletny tor DER-SN (kanon POLECENIE_DER_SN_TOPOLOGIA_2026-07).
    # ADDYTYWNY — brak pola = dotychczasowe zachowanie (wariant nn/A bez zmian).
    der_topology: DerTopologyPayload | None = None


class AddGensetNNPayload(_FrozenBase):
    """Payload: add_genset_nn — dodaje agregat do rozdzielni nN."""

    bus_nn_ref: str
    station_ref: str
    placement: Literal["NEW_FIELD", "EXISTING_FIELD"]
    existing_field_ref: str | None = None
    source_field: NNSourceFieldSpec | None = None
    genset_spec: GensetSpec


class AddUPSNNPayload(_FrozenBase):
    """Payload: add_ups_nn — dodaje UPS do rozdzielni nN."""

    bus_nn_ref: str
    station_ref: str
    placement: Literal["NEW_FIELD", "EXISTING_FIELD"]
    existing_field_ref: str | None = None
    source_field: NNSourceFieldSpec | None = None
    ups_spec: UPSSpec


class AddNNLoadPayload(_FrozenBase):
    """Payload: add_nn_load — dodaje odbiór do odpływu nN."""

    feeder_ref: str
    """Referencja odpływu nN."""

    bus_nn_ref: str
    """Referencja szyny nN."""

    load_kind: Literal["SKUPIONY", "ROZPROSZONY"]
    """Rodzaj odbioru (PL)."""

    active_power_kw: float
    """Moc czynna (kW) — >=0, jawnie."""

    reactive_power_kvar: float | None = None
    """Moc bierna (kvar) — jawnie."""

    cos_phi: float | None = None
    """Cos φ — jawnie, alternatywa dla mocy biernej."""

    load_profile_ref: str | None = None
    """Opcjonalna referencja do profilu obciążenia."""

    connection_type: Literal["JEDNOFAZOWY", "TROJFAZOWY"]
    """Sposób przyłączenia (PL) — bez domyślnego."""

    load_name: str | None = None
    load_label: str | None = None


# ===========================================================================
# 6. CANONICAL OPERATION NAMES — kanoniczne nazwy operacji
# ===========================================================================


CANONICAL_OPS: set[str] = {
    # V1 — budowa SN
    "add_grid_source_sn",
    "add_sn_bay",
    "continue_trunk_segment_sn",
    "insert_station_on_segment_sn",
    "start_branch_segment_sn",
    "insert_section_switch_sn",
    "connect_secondary_ring_sn",
    "set_normal_open_point",
    "add_transformer_sn_nn",
    "assign_catalog_to_element",
    "update_element_parameters",
    "add_converter_source",
    "add_genset_nn",
    "add_ups_nn",
    "add_nn_load",
    # V2 — ochrona
    "add_ct",
    "add_vt",
    "add_relay",
    "update_relay_settings",
    "link_relay_to_field",
    "calculate_tcc_curve",
    "validate_selectivity",
    # V2 — Study Case
    "create_study_case",
    "set_case_switch_state",
    "set_case_normal_state",
    "set_case_source_mode",
    "set_case_time_profile",
    "run_short_circuit",
    "run_power_flow",
    "run_time_series_power_flow",
    "compare_study_cases",
    # V2 — nN
    "add_nn_outgoing_field",
    "set_source_operating_mode",
    "set_dynamic_profile",
    # V2 — uniwersalne
    "rename_element",
    "set_label",
}
"""Zbiór kanonicznych nazw operacji domenowych."""


DOMAIN_EVENT_TYPES: list[str] = [
    "SEGMENT_SPLIT",
    "CUT_NODE_CREATED",
    "STATION_CREATED",
    "PORTS_CREATED",
    "FIELDS_CREATED_SN",
    "DEVICES_CREATED_SN",
    "TR_CREATED",
    "BUS_NN_CREATED",
    "FIELDS_CREATED_NN",
    "DEVICES_CREATED_NN",
    "RECONNECTED_GRAPH",
    "LOGICAL_VIEWS_UPDATED",
    "SOURCE_CREATED",
    "BUS_CREATED",
    "BRANCH_CREATED",
    "SWITCH_INSERTED",
    "RING_CONNECTED",
    "NOP_SET",
    "TRANSFORMER_CREATED",
    "CATALOG_ASSIGNED",
    "PARAMETERS_UPDATED",
    "NN_SOURCE_FIELD_CREATED",
    "PV_INVERTER_CREATED",
    "BESS_INVERTER_CREATED",
    "FW_INVERTER_CREATED",
    "GENSET_CREATED",
    "UPS_CREATED",
    "NN_LOAD_CREATED",
    "NN_SOURCE_CATALOG_ASSIGNED",
    # V2 — Ochrona
    "CT_CREATED",
    "VT_CREATED",
    "RELAY_CREATED",
    "RELAY_SETTINGS_UPDATED",
    "TCC_CURVE_COMPUTED",
    "SELECTIVITY_VALIDATED",
    # V2 — Study Case
    "STUDY_CASE_CREATED",
    "CASE_STATE_UPDATED",
    "ANALYSIS_RUN_STARTED",
    "ANALYSIS_RUN_COMPLETED",
    "RESULTS_MAPPED",
]
"""Lista dozwolonych typów zdarzeń domenowych."""


# ===========================================================================
# 7. TERMINAL REF — kanoniczny byt „końca magistrali"
# ===========================================================================


class TerminalRef(_FrozenBase):
    """Referecja terminala magistrali/odgałęzienia.

    Opisuje jednoznacznie punkt końcowy magistrali lub odgałęzienia
    wraz z jego statusem (dostępność do dalszej budowy).
    """

    element_id: str
    """Identyfikator elementu (szyny), do którego terminal należy."""

    port_id: str
    """Identyfikator portu na elemencie."""

    trunk_id: str | None = None
    """Identyfikator magistrali (jeśli terminal należy do magistrali)."""

    branch_id: str | None = None
    """Identyfikator odgałęzienia (jeśli terminal należy do odgałęzienia)."""

    status: Literal["OTWARTY", "ZAJETY", "ZAREZERWOWANY_DLA_RINGU"]
    """Status terminala — dostępność do dalszej budowy."""


# ===========================================================================
# 8. LOGICAL VIEWS — widoki logiczne (pochodna Snapshot)
# ===========================================================================


class TrunkViewV1(_FrozenBase):
    """Widok magistrali — pochodna topologii Snapshot."""

    corridor_ref: str
    """Identyfikator magistrali (korytarza)."""

    corridor_type: str
    """Typ magistrali (radial/ring/mixed)."""

    segments: list[str]
    """Uporządkowana lista identyfikatorów segmentów magistrali."""

    no_point_ref: str | None = None
    """Identyfikator punktu normalnie otwartego (NOP), jeśli istnieje."""

    terminals: list[TerminalRef] = []
    """Terminale magistrali (punkty końcowe dostępne do rozbudowy)."""


class BranchViewV1(_FrozenBase):
    """Widok odgałęzienia — pochodna topologii Snapshot."""

    branch_id: str
    """Identyfikator odgałęzienia."""

    from_element_id: str
    """Element źródłowy odgałęzienia."""

    from_port_id: str
    """Port źródłowy odgałęzienia."""

    segments: list[str]
    """Lista identyfikatorów segmentów odgałęzienia."""

    terminals: list[TerminalRef] = []
    """Terminale odgałęzienia (punkty końcowe)."""


class SecondaryConnectorViewV1(_FrozenBase):
    """Widok połączenia wtórnego (pierścień) — pochodna topologii Snapshot."""

    connector_id: str
    """Identyfikator połączenia wtórnego."""

    from_element_id: str
    """Element początkowy pierścienia."""

    to_element_id: str
    """Element końcowy pierścienia."""

    segment_ref: str
    """Identyfikator segmentu zamykającego pierścień."""


class LogicalViewsV1(_FrozenBase):
    """Pełne widoki logiczne — deterministyczna pochodna Snapshot.

    Zawiera uporządkowaną strukturę magistral, odgałęzień,
    połączeń wtórnych i terminali.
    """

    trunks: list[TrunkViewV1] = []
    """Lista magistral z segmentami i terminalami."""

    branches: list[BranchViewV1] = []
    """Lista odgałęzień."""

    secondary_connectors: list[SecondaryConnectorViewV1] = []
    """Lista połączeń wtórnych (pierścienie)."""

    terminals: list[TerminalRef] = []
    """Wszystkie terminale dostępne w sieci (agregat)."""


# ===========================================================================
# 9. MATERIALIZED PARAMS — materializacja parametrów katalogowych
# ===========================================================================


class MaterializedLineParams(_FrozenBase):
    """Zmaterializowane parametry linii/kabla z katalogu."""

    catalog_item_id: str
    """Identyfikator pozycji katalogowej."""

    catalog_item_version: str | None = None
    """Wersja pozycji katalogowej."""

    r_ohm_per_km: float | None = None
    """Rezystancja [Ω/km]."""

    x_ohm_per_km: float | None = None
    """Reaktancja [Ω/km]."""

    i_max_a: float | None = None
    """Prąd maksymalny [A]."""


class MaterializedTransformerParams(_FrozenBase):
    """Zmaterializowane parametry transformatora z katalogu."""

    catalog_item_id: str
    """Identyfikator pozycji katalogowej."""

    catalog_item_version: str | None = None
    """Wersja pozycji katalogowej."""

    u_k_percent: float | None = None
    """Napięcie zwarcia [%]."""

    p0_kw: float | None = None
    """Straty jałowe [kW]."""

    pk_kw: float | None = None
    """Straty obciążeniowe [kW]."""

    s_n_kva: float | None = None
    """Moc znamionowa [kVA]."""


class MaterializedParams(_FrozenBase):
    """Zmaterializowane parametry katalogowe w Snapshot.

    Każde wiązanie katalogowe tworzy kopię parametrów
    w momencie przypisania — aktualizacja katalogu
    nie zmienia istniejących obliczeń.
    """

    lines_sn: dict[str, MaterializedLineParams] = {}
    """Parametry linii SN: segment_id → parametry."""

    transformers_sn_nn: dict[str, MaterializedTransformerParams] = {}
    """Parametry transformatorów SN/nN: transformer_id → parametry."""


# ===========================================================================
# 10. LAYOUT INFO — informacja o układzie geometrycznym
# ===========================================================================


class LayoutInfo(_FrozenBase):
    """Informacja o deterministycznym układzie geometrycznym SLD."""

    layout_hash: str
    """SHA-256 hash układu geometrycznego."""

    layout_version: str = "1.0"
    """Wersja algorytmu układu."""
