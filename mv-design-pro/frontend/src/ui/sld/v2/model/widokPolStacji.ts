/**
 * Model widoku pól stacji SN — kontrakt danych adaptera ENM → SLD
 * (`canvas/enmToSldAdapter.ts`), czytany przez kompozycję kanwy v3
 * (`ui/sld/v3/compose/**`, `ui/sld/v3/layout/measure.ts`).
 *
 * GPZ-PARYTET cz. 2 (pkt 4): typy przeniesione z martwego renderera
 * `v2/renderer/MiniBlockRmuRenderer.tsx` (skasowany razem z całym katalogiem
 * `v2/renderer/` — jedynym rendererem SLD jest `SldCanvasV3`). Treść typów bez
 * zmian semantyki; to jest model danych, nie widok.
 */

import type { BayPrimaryDeviceKind, BayPrimaryPlacement } from '../../../../types/enm';
import type { FieldRole } from '../domain/apparatusContracts';


/**
 * F9.2 (SLD_CAD_SPEC_V3 §12.1) — jeden aparat pola, uporządkowany wg fizycznej
 * ścieżki mocy. Projekcja `Bay.primary_devices` (ENM) — patrz
 * `enmToSldAdapter.ts` `projectBayPrimaryDevices()` dla reguł sortowania i
 * STOP-notatki o dostępności danych.
 */
export interface BayPrimaryDeviceView {
  readonly kind: BayPrimaryDeviceKind;
  readonly placement: BayPrimaryPlacement;
  readonly sectionSide?: 'LEFT' | 'CENTER' | 'RIGHT' | null;
  readonly deviceRef: string;
  /** Uproszczony stan (mirror `cbState`/`dsState`/`esState` vocabulary).
   *  `undefined` gdy ENM nie niesie `switch_state` dla tego aparatu. */
  readonly switchState?: 'closed' | 'open' | 'unknown';
  /** F9.9 (SLD_CAD_SPEC_V3 §17.2): `BayPrimaryDevice.linked_ref` — dla
   *  aparatów pomiarowych (CT/VT) wskazuje `Measurement.ref_id` (wzorzec
   *  potwierdzony w `backend/src/application/field_read_model.py:488`).
   *  Fundament dopasowania kotwicy miernika „M" (`compose/protectionMarking.ts`
   *  `resolveMeterAnchor`) — `undefined` gdy ENM nie niesie `linked_ref`. */
  readonly linkedRef?: string;
  /** F10.6 (SLD_CAD_SPEC_V3 §19.1, D1, V12K-035): identyfikator PER-APARAT
   *  jako DANA projektowa (`BayPrimaryDevice.designation`) — ma pierwszeństwo
   *  nad fallbackiem konwencji `apparatusIdentifiers` (`compose/
   *  apparatusSequence.ts`). `undefined` gdy ENM nie niesie tej danej dla
   *  aparatu (render pozostaje przy konwencji, znacznik
   *  `data-designation-source="konwencja"`). */
  readonly designation?: string;
  /** GEOMETRIA-STACJI (§0 pkt 4a): rekord, z którego pochodzi aparat — `'rekord_pola'`
   *  (`Bay.primary_devices`) albo `'galaz_pola'` (gałąź łączeniowa modelu wskazana
   *  w `Bay.equipment_refs`, gdy pole nie niesie `primary_devices`; `deviceRef` = ref gałęzi). */
  readonly pochodzenie?: 'rekord_pola' | 'galaz_pola';
  /** GEOMETRIA-STACJI (§0 pkt 4a): typ aparatu z modelu — `catalog_ref` rekordu albo
   *  gałęzi (`null` = model go nie niesie; brak typu nie jest uzupełniany). */
  readonly typeRef?: string | null;
}

/**
 * F9.9 (SLD_CAD_SPEC_V3 §17.2) — adnotacja zabezpieczeń JEDNEGO pola,
 * projekcja `Bay.protection_codes` + `Bay.protection_ref` →
 * `ProtectionAssignment` (`v2/canvas/enmToSldAdapter.ts`
 * `resolveBayProtectionMarking`). `codes` jest ZAWSZE niepuste (adapter
 * zwraca `undefined` dla całego pola, gdy `Bay.protection_codes` jest puste —
 * §17.2 „brak danych = brak oznaczenia"). `breakerRef`/`ctRef` to SUROWE
 * referencje ENM (`ProtectionAssignment.breaker_ref`/`ct_ref`) — dopasowanie
 * na KONKRETNY aparat NARYSOWANEGO stosu dzieje się w `compose/
 * protectionMarking.ts` (adapter nie zna geometrii/kolejności rysowania).
 */
export interface BayProtectionMarkingView {
  readonly codes: readonly string[];
  readonly breakerRef?: string;
  readonly ctRef?: string;
  /** F10.6 (SLD_CAD_SPEC_V3 §20.2, D5, V12K-036): `ProtectionAssignment.
   *  ct_refs_secondary` — CT dodatkowe strefy różnicowej (87T). `undefined`/
   *  puste = strefa 2×CT NIE jest modelowana (dotychczasowe uproszczenie
   *  §20.2 „obecność transformatora" pozostaje w mocy, `compose/
   *  protectionTopologyValidation.ts`). */
  readonly ctRefsSecondary?: readonly string[];
}

/**
 * F10.4 (SLD_CAD_SPEC_V3 §18.3) — adnotacja JEDNEGO aparatu CT toru głównego:
 * identyfikator (`Measurement.name` — pole engineering-friendly, ODRÓŻNIONE
 * od `ref_id` technicznego, wzorzec identyczny z §19.2 „numer/nazwa linii" —
 * `Cable`/`OverheadLine.name`) + przekładnia sformatowana z `Measurement.
 * rating.ratio_primary`/`ratio_secondary` (np. „300/5" — CZYSTE formatowanie,
 * zero fizyki/zaokrągleń). BEZ-DOMAIN: oba pola źródłowe (`name`, `rating`)
 * JUŻ ISTNIEJĄ w ENM (`backend/src/enm/models.py:455-470`) — układ pomiarowy
 * (3×CT fazowe / Ferranti-I0, `arrangement` niżej) to F10.6 (D3, DOMAIN,
 * `Measurement.ct_arrangement`). Dopasowanie na aparat CT NARYSOWANEGO stosu przez
 * `measurementRef === BayPrimaryDevice.linked_ref` (wzorzec
 * `meteringMeasurementRef`/`resolveMeterAnchor`, `compose/protectionMarking.ts`).
 */
export interface CtRatingAnnotationView {
  readonly measurementRef: string;
  readonly identifier: string;
  readonly ratioText: string;
  /** F10.6 (SLD_CAD_SPEC_V3 §18.3, D3, V12K-036): układ pomiarowy —
   *  `Measurement.ct_arrangement`. `undefined` gdy dana niedostarczona (WHITE
   *  BOX — adnotacja rysuje sam identyfikator+przekładnię bez członu układu,
   *  §18.3 „zero zgadywania"). */
  readonly arrangement?: '3xCT' | 'ferranti';
  /** CTVT-RENDER (CTVT-MODEL/V12K-176): liczba rdzeni CT (osobne uzwojenia
   *  wtórne, tabliczka IEC 61869-2) z `Measurement.ct_cores`. Doklejona jako
   *  DODATKOWY człon etykiety (`ctRatingLabelText`, „… · N rdz.") WYŁĄCZNIE gdy
   *  dana obecna — `undefined` gdy `Measurement.ct_cores` nieobecne (zero zmiany
   *  tekstu/szerokości względem F10.4/F10.6, uczciwy brak). Oś odrębna od
   *  `arrangement`. */
  readonly cores?: number;
  /** W5 (RECENZJA_L2_POLA_WYPOSAZENIE_2026-07 §12–15/uwaga 7 „CT pomiarowy vs
   *  zabezpieczeniowy") — przeznaczenie CT z `Measurement.purpose`. Wariant CT
   *  Z DANYCH, nie z domysłu: `undefined` gdy pomiar nie niesie `purpose`
   *  (uczciwy brak, rejestr braków — §0.2 karty W5). Kanał GEOMETRYCZNIE
   *  NEUTRALNY: przenoszony na `OwnedLabel.ctPurpose` → atrybut DOM
   *  `data-ct-purpose` (audyt), NIE dokładany do tekstu etykiety (zero zmiany
   *  szerokości/kotwic — inwariant W5 „geometria bez dryfu"). */
  readonly purpose?: 'protection' | 'metering' | 'combined';
}

/**
 * CTVT-RENDER (CTVT-MODEL/V12K-176, SLD_CAD_SPEC_V3 §20.2) — adnotacja montażu
 * JEDNEGO aparatu VT toru bocznego: identyfikator (`Measurement.name`, wzorzec
 * `CtRatingAnnotationView`) + typ montażu z `Measurement.vt_mounting`
 * (szynowy/kablowy). Dana producenta/projektowa — WYŁĄCZNIE gdy `vt_mounting`
 * obecne (adapter `resolveBayVtMountings` pomija VT bez tej danej, §20.2 „zero
 * zgadywania"). Dopasowanie na aparat VT NARYSOWANEGO stosu przez
 * `measurementRef === BayPrimaryDevice.linked_ref` (TA SAMA reguła co
 * `resolveMeterAnchor`/`resolveCtRatingAnnotations`). Oś odrębna od
 * `vtArrangements` (open_delta/star = oś 3U0, `protectionTopologyValidation`).
 */
export interface VtMountingAnnotationView {
  readonly measurementRef: string;
  readonly identifier: string;
  readonly mounting: 'bus' | 'cable';
}

export interface MiniBlockBayDescriptor {
  readonly bayRef: string;
  readonly fieldRole: FieldRole;
  readonly designation: string;
  readonly hasMissingRequiredDevice: boolean;
  /** GPZ-PARYTET cz. 2 (pkt 1): `Transformer.ref_id` transformatora TEGO pola —
   *  jedyny transformator migawki wskazany przez pole (`equipment_refs` albo
   *  `meta.transformer_ref`); `undefined`, gdy pole nie wskazuje żadnego albo wskazuje
   *  więcej niż jeden (zero wyboru z domysłu). */
  readonly transformerRef?: string;
  /** GPZ-PARYTET cz. 2 (pkt 1): `Transformer.vector_group` transformatora pola
   *  (`transformerRef`) — źródło oznaczenia uzwojeń glifu `transformer2W` stosu pola
   *  (`symbols/uzwojenia.ts`). `null`/brak = jawny brak grupy na rysunku. */
  readonly transformerVectorGroup?: string | null;
  /** TR2W-BEZ-POLA (§0.C.2 „kotwica topologiczna"): `Bus.ref_id` SEKCJI szyn,
   *  do której to pole jest przyłączone (`Bay.bus_ref` rekordu pola — karta W5-B:
   *  jedyny nośnik pól). To jedyna
   *  informacja, po której rysunek wie, KTÓRE pola stoją na TEJ SAMEJ sekcji
   *  co dany transformator (`Transformer.hv_bus_ref`), więc kolumna
   *  transformatora bez pola trafia w obręb WŁASNEJ sekcji, a nie za ostatnie
   *  pole rozdzielnicy. `undefined` = dana nieprzekazana (stacja
   *  jednosekcyjna z konstrukcji rysunku — cały blok jest jedną sekcją). */
  readonly busRef?: string;
  /** GEOMETRIA-STACJI (Z-03): szyna GŁÓWNA (sekcja) stacji, z której pole jest zasilane —
   *  `busRef`, gdy jest szyną główną, inaczej szyna główna pola, za którego zaciskiem pole
   *  stoi (`ui/shared/szynyStacji.ts szynaGlownaStacji`, lustro backendu; np. pola części
   *  klienckiej za układem pomiarowym energii). `undefined` = sekcja nieustalona. */
  readonly sectionBusRef?: string;
  /** GEOMETRIA-STACJI (§0 pkt 5): pole REZERWOWE (`bay_kind` „rezerwowe" — ten sam
   *  predykat co backend `enm/rodzaj_stacji.py`, `ui/shared/rodzajStacji.ts
   *  czyPoleRezerwowe`) albo WOLNE (pole liniowe, do którego zacisku nie przyłącza się
   *  żaden odcinek modelu — `czyPoleWolne`). `undefined` = pole czynne. */
  readonly reserve?: 'rezerwowe' | 'wolne';
  /** GEOMETRIA-STACJI (§0 pkt 5): NAZWA celu odejścia pola (`Bay.outgoing_destination_ref`
   *  rozwiązany na nazwę stacji/szyny modelu; ref, gdy model nie zna nazwy). */
  readonly destinationName?: string;
  /** K30-63: stan CB (wyłącznika) — pokazuje czerwoną open marker zamiast
   *  domyślnie zielonego closed. 'unknown' → szary z '?'. */
  readonly cbState?: 'closed' | 'open' | 'unknown';
  /** K30-63: stan DS (odłącznika). */
  readonly dsState?: 'closed' | 'open' | 'unknown';
  /** K30-63: stan ES (uziemnika). Default 'open' (rest position). */
  readonly esState?: 'closed' | 'open' | 'unknown';
  /** F9.2 (SLD_CAD_SPEC_V3 §12.1): uporządkowana lista aparatów pola z
   *  `Bay.primary_devices` (ENM), gdy dane niepuste. `undefined` gdy pole nie
   *  niesie `primary_devices` — konwencja-wg-roli (§12.4, fallback rysunkowy)
   *  NIE jest projektowana tutaj (poza zakresem F9.2, patrz F9.3). */
  readonly primaryDevices?: readonly BayPrimaryDeviceView[];
  /** W1c (RECENZJA_MACIERZ_WYPOSAZENIA_2026-07 uwaga 10): identyfikator
   *  KONFIGURACJI pola — stabilny, deterministyczny (backend `config_ref`).
   *  Niesiony do meta sceny (`configId`) przez `compose/station.ts`, żeby render
   *  nie zgadywał wyposażenia z typu pola. `undefined` gdy pole bez szablonu. */
  readonly configId?: string;
  /** F9.9 (SLD_CAD_SPEC_V3 §17.2): adnotacja zabezpieczeń tego pola —
   *  `undefined` gdy `Bay.protection_codes` puste/nieobecne (brak danych =
   *  brak oznaczenia, §17.2 dosłownie). */
  readonly protectionMarking?: BayProtectionMarkingView;
  /** F9.9 (SLD_CAD_SPEC_V3 §17.2): `Measurement.ref_id` pomiaru
   *  `purpose==='metering'` powiązanego z tym polem (`bay_ref`) — `undefined`
   *  gdy brak takiego pomiaru. Dopasowanie na aparat stosu (miernik „M")
   *  przez `linkedRef` w `compose/protectionMarking.ts`. */
  readonly meteringMeasurementRef?: string;
  /** Recenzja NO-GO 2026-07-17 pkt 11: mierzona WIELKOŚĆ miernika — z
   *  `Measurement.measurement_type` pomiaru rozliczeniowego (CT⇒prąd „A",
   *  VT⇒napięcie „V"). Glif miernika pokazuje literę wielkości zamiast
   *  mylącego „M" (odczytywanego jako napęd silnikowy). `undefined` = dana
   *  nieznana, glif zostaje przy „M" + rozstrzygnięcie w legendzie. */
  readonly meteringQuantity?: 'A' | 'V';
  /** F10.4 (SLD_CAD_SPEC_V3 §18.3): adnotacje przekładni CT tego pola —
   *  JEDNA pozycja per aparat CT z `Measurement.rating` obecnym. `undefined`
   *  gdy pole nie niesie żadnego CT z ratingiem (brak danych = brak
   *  oznaczenia, §18.3 dosłownie — zero „z domysłu"). */
  readonly ctRatingAnnotations?: readonly CtRatingAnnotationView[];
  /** F10.6 (SLD_CAD_SPEC_V3 §20.2, D4, V12K-036): `Measurement.
   *  vt_arrangement` WSZYSTKICH VT tego pola (wartości niepuste, deduplikowane).
   *  `undefined`/puste = dana układu VT niedostarczona dla ŻADNEGO VT pola —
   *  `protectionFunctionTopologyGaps` (`compose/protectionTopologyValidation.ts`)
   *  degraduje 67N do dotychczasowego uproszczenia (sama obecność VT). */
  readonly vtArrangements?: readonly ('open_delta' | 'star')[];
  /** CTVT-RENDER (SLD_CAD_SPEC_V3 §20.2, CTVT-MODEL/V12K-176): adnotacje montażu
   *  VT tego pola — JEDNA pozycja per aparat VT z `Measurement.vt_mounting`
   *  obecnym. `undefined` gdy pole nie niesie żadnego VT z montażem (brak danych
   *  = brak oznaczenia, §20.2 — zero „z domysłu"; adapter `resolveBayVtMountings`). */
  readonly vtMountingAnnotations?: readonly VtMountingAnnotationView[];
}
