# Pomiar: kreator stacji, inspektor, drzewo, gotowość (UI-09..16, W5-UI-01..03, 09..13)
Ścieżki względem mv-design-pro/. Fakty zmierzone grepem/sed; przypuszczenia oznaczone [P].

## 1. Kreator stacji
- Monolit: frontend/src/ui2/kreatory/stacja/KreatorStacjiSnNn.tsx; katalog stacja/ = 7867 linii (wc). Kroki: tablica KROKI :163-173 (szablon, rodzaj, transformator, pola, pomiar, nn, uziemienie, podglad, zapis). Stan: lokalne useState w komponencie (dane/StacjaFormData, DANE_DOMYSLNE stacjaModel.ts:269), brak store Zustand.
- Podgląd skutków: z BACKENDU — stacjaPodglad.ts:70-86 POST /api/cases/{id}/enm/domain-ops z payload.dry_run=true (ta sama operacja co zapis). Krok „podglad" — tylko przyciskiem (KreatorStacjiSnNn.tsx:2552); auto-odświeżanie (debounce 400 ms, klucz = serializowany payload) WYŁĄCZNIE w kroku 'pola' (:1146-1160, warunek krok !== 'pola' return). Werdykt VALID/INVALID = stan odczytu dry_run (:1127-1134); „INVALID" = każdy błąd HTTP, bez rozbicia przyczyn.
- Podgląd rozdzielnicy aktualizowany przy edycji: PodgladRozdzielnicySn (:2152-2165) rysowany we FRONCIE (podgladRozdzielnicy.ts:390 zbudujPodglad, generatorSldPola.ts) z kart katalogowych — geometria, nie fizyka; tylko w kroku pola.
- Domyślne aparaty (W5-UI-10): FRONT. aparatDomyslnyRoli :705-710 = pierwszy z aparatyDlaPola (stacjaModel.ts:965-975): filtr tylko U_n≥U_SN i device_kind ∈ BAY_PRIMARY_APPARATUS_KINDS_BY_ROLE (backend bay_templates.py:211-219, endpoint catalog.py:661-673), sort rosnąco U_n, I_n, id => wybierany NAJSŁABSZY aparat dowolnego producenta (np. reklozer NOJA OSP — mv_switch_catalog.py:12,537). Brak filtra: rodzina rozdzielnicy/producent, I_r vs prąd pola, zdolność wyłączalna vs Ik, allowed_apparatus_kinds rodziny (switchgear_family.py:164 — 0 użyć w kreatorze, grep). Fallback :708 `?? aparatDomyslny` (lista BEZ zawężenia rolą) i komentarz :311-313 „brak odpowiedzi = pełny katalog" => możliwy aparat niedopuszczalny dla roli. To przyczyna niekompatybilnych domyślnych.
- „FABRYCZNE": BACKEND, apparatus_vocabulary.py:100-107 (status = OPCJA gdy device.optional, inaczej FABRYCZNY); front konfiguratorRozdzielnicy.ts:290-313, KartaWyposazeniaPola.tsx:139, strings.ts:151-153. To status składnika szablonu pola, nie certyfikat kompatybilności.
- Bezpiecznik zamiast wyłącznika (W5-UI-11): reguła backendu bay_templates.py:215 "TR": ["ROZLACZNIK_BEZPIECZNIKOWY","WYLACZNIK"] — tylko rodzaj; brak reguły doboru wkładki do S_n/I_n TR ani zdolności. Selektor = lista rozwijana pozycji APARAT_SN bez porównania parametrów.
- Kontrakt katalogu aparatów: MVApparatusType types.py:2934-2960 (id, name, device_kind, u_n_kv, i_n_a, breaking_capacity_ka, making_capacity_ka, manufacturer, i_th_ka, i_th_duration_s, i_dyn_ka, break_time_s, verification_status, source_reference). BRAK: switchgear_family_ref, source_version. Endpoint GET /api/catalog/mv-apparatus-types catalog.py:231-234 bez parametrów filtra. Rodziny: GET /switchgear-families (:564, filtr manufacturer_ref), /{ref}/factory-configurations (:592), /complete-bay-templates (:626); SwitchgearFamily switchgear_family.py:150-174 (network_voltages_kv, um_classes_kv, rated_current_options, short_time_current_options, allowed_apparatus_kinds, source_version, verified_at, status).
- Tabela pól (UI-13): brak — lista pól to karty wpisów + rysunek; brak komponentu tabeli kolumn rola/aparat/U_r/I_r/Ik (grep 'tabela' w stacja/ nie zwrócił komponentu [nie przeszukano wyczerpująco wszystkich wariantów nazwy]).

## 2. Kreator bez pola TR (W5-UI-09)
- Ostrzeżenia: predykat frontu brakujacePolaToru stacjaModel.ts:745 (lustro backend enm/tor_pola.pola_do_domkniecia; POLA_TORU_WG_TRYBU :720-723), walidacja zapisu stacjaModel.ts:443-450, panel kontroli :1371-1372, sekcja :1970-1990.
- Naprawa: przycisk mvd-kreator-stacja-przywroc-pole-tr → dodajPoleToru :927-942 (lokalnie dokłada wpis z aparatDomyslnyRoli — dziedziczy defekt doboru z pkt 1). W torze BLOK_RMU przycisku brak (:1977-1979) — tylko tekst. Po naprawie dry_run odświeża się tylko jeśli projektant jest w kroku 'pola'.

## 3. Inspektory (UI-14/15)
- Równoległe: ui/inspector (8 plików), ui/property-grid (10), ui2/inspector (12), ui/tech-card (5), ui/enm-inspector (9), ui/results-inspector (8), plus ui/network-build/InspectorEngineeringView.tsx (3409 linii).
- Przy kliknięciu w SLD/drzewo: ui2/legacy/LegacyInspektor.tsx:30-41 — gdy jest selectedElement → InspectorEngineeringView (legacy); ui2 InspectorPanel (AppRoot.tsx:462-473, zakładki inspectorModel.ts:16 wlasciwosci|wyniki|dowod|powiazania) jest TYLKO fallbackiem bez zaznaczenia. EnmInspectorPage w ModelWarsztat.tsx:109 (diagnostyka eksperta). PropertyGridContainer w WlasciwosciModelu.tsx.
- Zapis: InspectorEngineeringView → useSnapshotStore.executeDomainOperation (:2616) z op update_element_parameters (:1299,1583,1637,1907,1999,2056,3001), assign_catalog_to_element (:2786) — operacje domenowe ENM.
- Cofanie: ui/history/HistoryStore.ts — stos komend LOKALNY we froncie (apply/undo ponownie woła applyFn). Jedyny producent komend: PropertyGridMultiEdit.tsx:66,197. UndoRedoButtons zamontowane jako sr-only aria-hidden (LegacyChrome.tsx:79) — niewidoczne. Edycje InspectorEngineeringView NIE trafiają do historii (0 push).
- Zaznaczenie: jeden store ui/selection/store.ts (27 plików tsx go używa) + magistrala ui2 'selekcja' (selectionAdapter.ts — obserwator; emitery: AppRoot, PanelGotowosci, akcjeNaprawcze, ModelWarsztat, KrokDowodu, inspectorAdapter). Dwa mechanizmy, zrodlo niesione tylko przez emitery bezpośrednie.

## 4. Drzewo (W5-UI-12)
- ui2/nav/ContextTree.tsx (344 l.), etykieta :321 <span className="mvd-tree-label"> bez title; ucinanie CSS tree.css:130-133 (overflow hidden, text-overflow ellipsis) — „Stacja …"/„Pole lin…" to obcięcie szerokości panelu, nie skrót danych (dane pełne: rodzaj_stacji_po_drzewo_light.txt). Filtry: treeFilters.ts:43-52 tylko filtrProblemy + trybAktualny — BRAK wyszukiwania tekstowego w drzewie. Synchronizacja: zaznaczonyId → rozwinięcie przodków (:86-113), emisja 'drzewo-kontekstowe' (AppRoot.tsx:83). Etykiety stacji: nav/adapters/topologyTreeAdapter.ts:298-325.

## 5. Gotowość (W5-UI-13)
- ui2/spaces/gotowosc/PanelGotowosci.tsx (301 l.), źródło: useSnapshotStore.readiness (adapters/gotowoscAdapter.ts:15-22) = backend /enm/readiness (api/enm.py:310). Grupowanie po CELU, nie po elemencie: grupowanieCelow.ts:537+ (celDlaKodu).
- „Postęp 100%": heurystyka UI grupowanieCelow.ts:524-528 — 100 gdy blokady==0, nawet przy ostrzeżeniach (zrzut: Ostrzeżenia 2, Postęp 100%). Wprowadza w błąd.
- „Napraw…": akcjeNaprawcze.ts:428-471 — kanon AKCJE_KODOW_KANONU (formularz operacji/przestrzeń/odmowa) albo fix_action emitera → resolveFixActionSurface; wykonanie :498+ emituje selekcję elementu, gdy brak akcji → przejście do 'schemat'. Prowadzi do formularza operacji/elementu, nie do konkretnego parametru (poleFokusu :373 istnieje tylko dla formularzy). [Nie zweryfikowano per kod readiness, które dają 'odmowa'.]

## 6. Operacje domenowe (UI-16)
- Rejestr: enm/rejestr_operacji.py:46 — 52 operacje (pomiar poetry run python, lista OPERACJE_KANONICZNE). Kopiowanie: tylko copy_nn_feeder (nN). BRAK: kopiowania konfiguracji pola SN, edycji grupowej (multi-element update), undo/redo/przywrócenia rewizji. Istnieją: GET /enm/dziennik-zmian (enm.py:196), GET /enm/rewizje/{n} (:228) — tylko odczyt; POST /enm/ops/batch (:950) legacy topology ops, docstring :880 mówi, że /enm/ops jest wyłączona z routera produkcyjnego.

## 7. Testy
- vitest: ui2/kreatory/stacja/__tests__ 8 plików, ui2/inspector/__tests__ 7, ui2/nav/__tests__ 3, ui2/spaces/gotowosc/__tests__ 15, ui/network-build/__tests__ 36, ui/history/__tests__ 4, ui/selection/__tests__ 2.
- e2e: kreator-stacji-max, kreator-stacji-zrzuty, kreator-stacji-pole-tr-screenshot, etykieta-stacji-rodzaj, etykieta-stacji-zrzuty, gotowosc-jedna-prawda, gotowosc-po-biegu, kreatory-ekspert-screenshot.

## Nie sprawdzono
- Czy domain-op stacyjna waliduje aparat vs rodzina/Ik (backend) — nie czytano handlera insert_station_on_segment_sn.
- Treści kroków szablon/rodzaj (W5-UI-01) poza tablicą KROKI; zrzuty kreatora poza gotowością nie oglądane w całości.
