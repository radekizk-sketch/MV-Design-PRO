import { useEffect, useMemo, useState } from 'react';
import { fetchTransformerTypes, getCatalogErrorMessage } from '../../catalog/api';
import type { TransformerType } from '../../catalog/types';

import { formatPolishValue } from '../../shared/formatPolishValue';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useActiveCaseId } from '../../app-state/store';
import { buildCatalogBinding } from '../../catalog/catalogBinding';
import type { CatalogNamespace } from '../../catalog/types';
import type { EnergyNetworkModel, Source, Substation, Transformer } from '../../../types/enm';
import type { WorkspaceSurfaceDescriptor } from '../types';
import { GpzSectionsEditor } from '../../network-build/cards/GpzSectionsEditor';
import { TabelaPolSn, type SekcjaTabeliPol } from '../../network-build/cards/TabelaPolSn';
import { pasmoNapieciowe, toSamoNapiecieZnamionowe } from '../../../ui2/model/pasmaNapieciowe';
import {
  KOMUNIKAT_STOSUNKU_RX,
  KOMUNIKAT_STOSUNKU_RX_MIN,
  stosunekRxPoprawny,
} from '../../../ui2/model/stosunekRxZrodla';
import { bezLamaniaLiczbyIJednostki, nazwaKatalogowa } from '../../shared/nazwaKatalogowa';

/**
 * Konfigurator GPZ 110/SN (ekran E-10) — JEDYNY edytor GPZ (karta KATALOG-PRZEJECIE-PR,
 * decyzja architekta). Każda kontrolka jest operacją modelu, a wartości są czytane z modelu:
 *  - Identyfikacja: nazwa i oznaczenie stacji GPZ → `update_element_parameters` na stacji
 *    (`name`, `designation`; puste oznaczenie je zdejmuje);
 *  - Zasilanie: S″k, R/X, S″k,min, R/X (MIN) albo R i X sieci zasilającej → `update_element_parameters`
 *    na źródle GPZ — te same pola, które czyta bieg zwarciowy (`enm/zrodlo_zwarcie.py`);
 *    napięcie znamionowe strony WN → `update_gpz_hv_voltage` (szyny WN, szyny połączone z nimi
 *    i równoważnik sieci; uzwojenia transformatorów muszą mieć to napięcie — przy odmowie karta
 *    oferuje typy transformatora 110/SN z katalogu o tym napięciu górnym, zmiana w jednej operacji);
 *  - Transformator 110/SN: typ → `assign_catalog_to_element` (tabliczka z katalogu);
 *  - Sekcje SN: `add/update/delete_gpz_section` przez `GpzSectionsEditor` (nowa sekcja na wolnej
 *    szynie albo na nowej szynie — `create_bus`);
 *  - Pola SN: pola (`Bay`) stacji na szynach sekcji z modelu — dodanie (kreator `add_sn_bay`),
 *    karta pola E-11, usunięcie (`delete_element`), bateria/zespół pola BKR/ZU (`TabelaPolSn`).
 * Do tej karty cały ekran poza transformatorem był stanem formularza bez operacji (nazwa,
 * oznaczenie, operator, lokalizacja, tryb i S″k sieci 110 kV, R/X, liczba sekcji, sprzęgło,
 * system szyn, bilans) — inżynier wpisywał S″k, a zwarcia liczyły z innej wartości. Liczba sekcji
 * i sprzęgła wynikają z listy sekcji i pól sprzęgła (karty „Sekcje SN" i „Pola SN"); system szyn
 * (pojedynczy/podwójny) i lokalizacja nie mają nośnika w modelu sieci (żaden konsument ich nie
 * czyta). Operator sieci jest daną ENM dodawaną kartą GPZ-dane (katalog operatorów NC RfG, profil
 * wymagań dziedziczony przez źródła OZE) — pole „Operator sieci" tej karty podpina jej operację.
 */

type GpzCardId = 'identification' | 'hv-side' | 'transformer' | 'sections' | 'bays';

const CARD_LABELS: Record<GpzCardId, string> = {
  identification: 'Identyfikacja',
  'hv-side': 'Sieć zasilająca',
  transformer: 'Transformator 110/SN',
  sections: 'Sekcje SN',
  bays: 'Pola SN',
};

interface GpzConfiguratorSurfaceProps {
  readonly surface: WorkspaceSurfaceDescriptor;
}

/** Opcja listy transformatorów WN/SN — z KATALOGU backendu (`/api/catalog/transformer-types`),
 * nie z kodu. Do karty KATALOG-PRZEJECIE-PR ekran niósł pięć zaszytych identyfikatorów
 * (`tr-wn-sn-110-15-25mva` i pokrewne), z których żaden nie istniał w katalogu (realne pozycje
 * mają przyrostek grupy połączeń `-yd11`), a etykiety podawały grupy Yyn0/YNyn0, których
 * katalog nie zna. */
export interface OpcjaTransformatoraWn {
  readonly id: string;
  readonly label: string;
  /** Napięcia typu — lista dla transformatora modelu zawiera wyłącznie typy o napięciach jego
   * szyn (backend i tak odmawia innego: `odmowa_napiec_typu_transformatora`). */
  readonly voltageHvKv: number;
  readonly voltageLvKv: number;
}

/** Transformatory sieciowe WN/SN z katalogu (górne napięcie z pasma WN), porządek nazw. */
export function opcjeTransformatorowWn(
  typy: readonly Pick<TransformerType, 'id' | 'name' | 'voltage_hv_kv' | 'voltage_lv_kv'>[],
): OpcjaTransformatoraWn[] {
  return typy
    .filter((typ) => pasmoNapieciowe(typ.voltage_hv_kv) === 'WN')
    .map((typ) => ({ id: typ.id, label: nazwaKatalogowa(typ.name), voltageHvKv: typ.voltage_hv_kv, voltageLvKv: typ.voltage_lv_kv }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pl') || a.id.localeCompare(b.id));
}

/** Typy o napięciach `hvKv`/`lvKv` — ta sama równość danych co backend (`toSamoNapiecieZnamionowe`). */
export function opcjeONapieciach(
  opcje: readonly OpcjaTransformatoraWn[],
  hvKv: number | null | undefined,
  lvKv: number | null | undefined,
): OpcjaTransformatoraWn[] {
  return opcje.filter(
    (o) => toSamoNapiecieZnamionowe(o.voltageHvKv, hvKv) && toSamoNapiecieZnamionowe(o.voltageLvKv, lvKv),
  );
}

/** GPZ modelu dla źródła `gpzRef`: źródło, jego stacja GPZ i transformatory 110/SN stacji
 * (kolejność `transformer_refs`). `istnieje` = w modelu jest takie źródło ze stacją GPZ. */
export interface GpzModelu {
  readonly istnieje: boolean;
  readonly zrodlo: Source | null;
  readonly stacja: Substation | null;
  readonly transformatory: Transformer[];
}

export function gpzModelu(snapshot: EnergyNetworkModel | null, gpzRef: string | null): GpzModelu {
  const brak: GpzModelu = { istnieje: false, zrodlo: null, stacja: null, transformatory: [] };
  if (!snapshot || !gpzRef) return brak;
  const zrodlo = (snapshot.sources ?? []).find((s) => s.ref_id === gpzRef) ?? null;
  const stacja = zrodlo?.substation_ref
    ? (snapshot.substations ?? []).find(
        (st) => st.ref_id === zrodlo.substation_ref && st.station_type === 'gpz',
      ) ?? null
    : null;
  if (!zrodlo || !stacja) return { ...brak, zrodlo };
  const poRefie = new Map((snapshot.transformers ?? []).map((tr) => [tr.ref_id, tr]));
  return {
    istnieje: true,
    zrodlo,
    stacja,
    transformatory: stacja.transformer_refs
      .map((ref) => poRefie.get(ref))
      .filter((tr): tr is Transformer => tr !== undefined),
  };
}

/** Zgodność wstecz nazwy pomocnika testów transformatora (ten sam wynik co `gpzModelu`). */
export function transformatoryGpzZrodla(
  snapshot: EnergyNetworkModel | null,
  gpzRef: string | null,
): { istnieje: boolean; transformatory: Transformer[] } {
  const gpz = gpzModelu(snapshot, gpzRef);
  return { istnieje: gpz.istnieje, transformatory: gpz.transformatory };
}

/** Liczba w formaterze wspólnym: wartości całkowite bez zbędnych zer, ułamkowe do `maks`
 * miejsc (kontrakt prezentacji §10 pkt 7). Brak wartości mówi, czego brakuje (`brak`) —
 * bez gołego „—” (KD6). */
function liczba(wartosc: number | null | undefined, brak: string, jednostka = '', maks = 3): string {
  if (typeof wartosc !== 'number' || !Number.isFinite(wartosc)) return brak;
  let miejsca = 0;
  while (miejsca < maks && Math.abs(wartosc * 10 ** miejsca - Math.round(wartosc * 10 ** miejsca)) > 1e-9) {
    miejsca += 1;
  }
  return bezLamaniaLiczbyIJednostki(
    formatPolishValue(wartosc, { decimals: miejsca, ...(jednostka ? { unit: jednostka } : {}) }),
  );
}

/** Wiersz danych sieci zasilającej: pole źródła, etykieta, jednostka, reguła poprawności. */
interface PoleZasilania {
  readonly klucz: keyof Source & string;
  readonly etykieta: string;
  readonly jednostka: string;
  readonly opcjonalne: boolean;
  readonly poprawne: (v: number) => boolean;
  readonly komunikat: string;
}

const DODATNIA = (v: number) => Number.isFinite(v) && v > 0;

/** Pola sieci zasilającej źródła GPZ — te, które czyta bieg zwarciowy (tryb danych źródła
 * z `enm/zrodlo_zwarcie.py::tryb_danych`: impedancja jawna R+jX ma pierwszeństwo przed S″k). */
export function polaZasilania(zrodlo: Source): PoleZasilania[] {
  const impedancja =
    typeof zrodlo.r_ohm === 'number' && typeof zrodlo.x_ohm === 'number'
    && !(zrodlo.r_ohm === 0 && zrodlo.x_ohm === 0);
  if (impedancja) {
    return [
      { klucz: 'r_ohm', etykieta: 'Rezystancja sieci R_Q', jednostka: 'Ω', opcjonalne: false, poprawne: (v) => Number.isFinite(v) && v >= 0, komunikat: 'Rezystancja R musi być nieujemna.' },
      { klucz: 'x_ohm', etykieta: 'Reaktancja sieci X_Q', jednostka: 'Ω', opcjonalne: false, poprawne: DODATNIA, komunikat: 'Reaktancja X musi być dodatnia.' },
    ];
  }
  const wn = zrodlo.source_side === 'HV_110';
  return [
    { klucz: wn ? 'sk3_hv_mva' : 'sk3_mva', etykieta: wn ? 'Moc zwarciowa S″k (110 kV)' : 'Moc zwarciowa S″k', jednostka: 'MVA', opcjonalne: false, poprawne: DODATNIA, komunikat: 'Moc zwarciowa S″k musi być dodatnia.' },
    { klucz: 'rx_ratio', etykieta: 'Stosunek R/X', jednostka: '', opcjonalne: false, poprawne: stosunekRxPoprawny, komunikat: KOMUNIKAT_STOSUNKU_RX },
    { klucz: 'sk3_min_mva', etykieta: 'Moc zwarciowa S″k,min', jednostka: 'MVA', opcjonalne: true, poprawne: DODATNIA, komunikat: 'Moc zwarciowa S″k,min musi być dodatnia.' },
    { klucz: 'rx_ratio_min', etykieta: 'Stosunek R/X (MIN)', jednostka: '', opcjonalne: true, poprawne: stosunekRxPoprawny, komunikat: KOMUNIKAT_STOSUNKU_RX_MIN },
  ];
}

/**
 * Sekcje GPZ jako sekcje tabeli pól: szyna sekcji, nazwa, sekcja GPZ (kontekst kreatora pola)
 * i łączniki sprzęgieł sekcji z modelu (`left/right_coupler_ref`) — opis sprzęgła składa tabela
 * z modelu (`opisSprzegla`: sekcja po drugiej stronie i stan normalny), nie z nazwy gałęzi.
 */
export function sekcjeTabeliPolGpz(stacja: Substation): SekcjaTabeliPol[] {
  return [...(stacja.gpz_sections ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      busRef: s.bus_ref,
      etykieta: s.name || s.section_id,
      gpzSectionId: s.section_id,
      sprzeglaRefs: [s.left_coupler_ref, s.right_coupler_ref].filter(
        (r): r is string => typeof r === 'string' && r.length > 0,
      ),
    }));
}

const GPZ_DEFAULT_CARD_IDS = new Set<GpzCardId>([
  'identification',
  'hv-side',
  'transformer',
  'sections',
  'bays',
]);

/** Karta W2-B (klasa `ACTION_ROADMAP_HINT_PL`): deep-link na konkretną kartę
 *  E-10 — wzorzec `stationDefaultCard` z `StationConfiguratorSurface.tsx`.
 *  Akcje menu SLD "Pokaż dane zwarciowe źródła" (GPZ) / "Pokaż dane
 *  zwarciowe sekcji" (`show-sc-source`/`show-sc-data`) otwierają kartę sieci zasilającej,
 *  "Dodaj sekcję rozdzielni SN" (`add-section`) — kartę sekcji
 *  (`shared/sldActionExecutor.ts::ACTION_DEFAULT_CARD`). Nieznana/brakująca wartość =
 *  uczciwy domyślny start. */
function gpzDefaultCard(surface: WorkspaceSurfaceDescriptor): GpzCardId {
  const payload = surface.routeState?.payload;
  const defaultCard = payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>).defaultCard
    : null;
  return typeof defaultCard === 'string' && GPZ_DEFAULT_CARD_IDS.has(defaultCard as GpzCardId)
    ? (defaultCard as GpzCardId)
    : 'identification';
}

const TEKST = 'text-[length:var(--mvd-font-size-data)]';

export function GpzConfiguratorSurface(props: GpzConfiguratorSurfaceProps): JSX.Element {
  const { surface } = props;
  const [activeCard, setActiveCard] = useState<GpzCardId>(() => gpzDefaultCard(surface));
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const activeCaseId = useActiveCaseId();
  const gpzRef = surface.entityRef ?? null;
  const gpz = useMemo(() => gpzModelu(snapshot, gpzRef), [snapshot, gpzRef]);
  const [opcjeTransformatora, setOpcjeTransformatora] = useState<OpcjaTransformatoraWn[]>([]);
  /** Napięcie WN, którego zmiany backend odmówił z powodu typu transformatorów — karta oferuje
   *  typy o tym napięciu górnym (zmiana napięcia razem z typem w jednej operacji). */
  const [unDoZmiany, setUnDoZmiany] = useState<number | null>(null);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  const [komunikat, setKomunikat] = useState<{ karta: GpzCardId; tekst: string } | null>(null);

  useEffect(() => {
    let anulowane = false;
    fetchTransformerTypes()
      .then((typy) => {
        if (anulowane) return;
        setOpcjeTransformatora(opcjeTransformatorowWn(typy));
        setBladKatalogu(null);
      })
      .catch((blad: unknown) => {
        if (anulowane) return;
        setOpcjeTransformatora([]);
        setBladKatalogu(getCatalogErrorMessage(blad));
      });
    return () => {
      anulowane = true;
    };
  }, []);

  /** Operacja modelu z karty `karta`; odmowa backendu wraca w komunikacie tej karty. */
  const wykonaj = async (
    karta: GpzCardId,
    nazwa: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> => {
    if (!activeCaseId) {
      setKomunikat({ karta, tekst: 'Zmiana GPZ wymaga aktywnego zakresu obliczeń.' });
      return false;
    }
    setKomunikat(null);
    const odpowiedz = await executeDomainOperation(activeCaseId, nazwa, payload);
    if (!odpowiedz || odpowiedz.error) {
      setKomunikat({ karta, tekst: odpowiedz?.error ?? 'Operacja nie została wykonana.' });
      return false;
    }
    return true;
  };

  const komunikatKarty = (karta: GpzCardId) =>
    komunikat && komunikat.karta === karta ? (
      <p data-testid={`gpz-card-error-${karta}`} className={`${TEKST} text-sygnal-blokada-tusz`}>
        {komunikat.tekst}
      </p>
    ) : null;

  const brakGpz = (
    <p data-testid="gpz-no-model" className={`${TEKST} text-scada-muted`}>
      W modelu nie ma jeszcze tego GPZ. Utwórz GPZ akcją „Dodaj źródło zasilania GPZ” z panelu
      budowy sieci — konfigurator edytuje GPZ istniejący w modelu.
    </p>
  );

  const kompletnosc = useMemo(() => {
    if (!gpz.istnieje || !gpz.zrodlo || !gpz.stacja) return { done: 0, total: 4 };
    const zasilanie = polaZasilania(gpz.zrodlo).filter((p) => !p.opcjonalne);
    const checks = [
      Boolean(gpz.stacja.name?.trim()),
      zasilanie.every((p) => typeof gpz.zrodlo?.[p.klucz] === 'number'),
      gpz.transformatory.every((tr) => Boolean(tr.catalog_ref)),
      (gpz.stacja.gpz_sections ?? []).length > 0,
    ];
    return { done: checks.filter(Boolean).length, total: checks.length };
  }, [gpz]);

  const napiecieSzynyZrodla = useMemo(() => {
    const szyna = (snapshot?.buses ?? []).find((b) => b.ref_id === gpz.zrodlo?.bus_ref);
    return szyna?.voltage_kv ?? null;
  }, [snapshot, gpz.zrodlo]);

  /** Napięcie WN edytowalne wyłącznie przy stronie WN w modelu (równoważnik 110 kV
   *  z transformatorami 110/SN); równoważnik na szynach SN nie ma strony WN. */
  const stronaWnWModelu = gpz.zrodlo?.source_side === 'HV_110' && gpz.stacja !== null;
  const napiecieSn = gpz.transformatory[0]?.ulv_kv ?? null;
  const typyDlaUn = unDoZmiany === null ? [] : opcjeONapieciach(opcjeTransformatora, unDoZmiany, napiecieSn);

  const zmienUn = async (un: number, typ?: string): Promise<boolean> => {
    const ok = await wykonaj('hv-side', 'update_gpz_hv_voltage', {
      substation_ref: gpz.stacja!.ref_id,
      voltage_kv: un,
      ...(typ ? { transformer_catalog_binding: buildCatalogBinding('TRAFO_SN_NN', typ) } : {}),
    });
    setUnDoZmiany(ok || gpz.transformatory.length === 0 ? null : un);
    return ok;
  };

  const nazwaGpz = gpz.stacja?.name || gpz.zrodlo?.name || 'GPZ 110/SN';

  return (
    <div data-testid="gpz-configurator-surface" className="flex h-full w-full flex-col p-3">
      {/* Nazwa w jednym wierszu (długa — ucięta z pełną nazwą w podpowiedzi), podtytuł pod nią:
          układ panelu bocznego 280–420 px i powierzchni szerokiej jest ten sam. */}
      <div data-testid="gpz-naglowek" className="mb-2 min-w-0">
        <h2
          data-testid="gpz-naglowek-nazwa"
          title={nazwaGpz}
          className="truncate whitespace-nowrap text-base font-semibold text-scada-text"
        >
          {nazwaGpz}
        </h2>
        <p data-testid="gpz-naglowek-podtytul" className={`${TEKST} text-scada-muted`}>
          Główny Punkt Zasilający · konfiguracja {kompletnosc.done}/{kompletnosc.total}
        </p>
      </div>

      <nav role="tablist" className="flex shrink-0 flex-wrap border-b border-scada-border">
        {(Object.keys(CARD_LABELS) as GpzCardId[]).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            data-testid={`gpz-card-tab-${id}`}
            data-active={activeCard === id}
            aria-selected={activeCard === id}
            onClick={() => setActiveCard(id)}
            className={
              `whitespace-nowrap px-3 py-1.5 ${TEKST} font-medium `
              + (activeCard === id
                ? 'border-b-2 border-scada-sn text-scada-text'
                : 'border-b-2 border-transparent text-scada-muted hover:text-scada-text')
            }
          >
            {CARD_LABELS[id]}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-auto py-2">
        {activeCard === 'identification' && (
          <div data-testid="gpz-card-content-identification" className="space-y-1">
            {!gpz.stacja ? brakGpz : (
              <dl className={`grid grid-cols-[14rem_1fr] items-center gap-x-3 gap-y-1 ${TEKST}`}>
                <dt className="text-scada-muted">Nazwa GPZ</dt>
                <dd>
                  <PoleTekstowe
                    key={`${gpz.stacja.ref_id}-${gpz.stacja.name}`}
                    testId="gpz-name-input"
                    wartosc={gpz.stacja.name ?? ''}
                    onZatwierdz={(nazwa) =>
                      wykonaj('identification', 'update_element_parameters', {
                        element_ref: gpz.stacja!.ref_id,
                        parameters: { name: nazwa },
                      })}
                  />
                </dd>
                <dt className="text-scada-muted">Oznaczenie</dt>
                <dd>
                  <PoleTekstowe
                    key={`${gpz.stacja.ref_id}-${gpz.stacja.designation ?? ''}`}
                    testId="gpz-designation"
                    wartosc={gpz.stacja.designation ?? ''}
                    puste
                    onZatwierdz={(oznaczenie) =>
                      wykonaj('identification', 'update_element_parameters', {
                        element_ref: gpz.stacja!.ref_id,
                        parameters: { designation: oznaczenie },
                      })}
                  />
                </dd>
              </dl>
            )}
            {komunikatKarty('identification')}
          </div>
        )}

        {activeCard === 'hv-side' && (
          <div data-testid="gpz-card-content-hv-side" className="space-y-1">
            {!gpz.zrodlo ? brakGpz : (
              <table className={`${TEKST}`}>
                <tbody>
                  <tr>
                    <th className="w-56 py-0.5 pr-3 text-left font-normal text-scada-muted">Strona zadania danych</th>
                    <td data-testid="gpz-supply-side" className="text-scada-text" colSpan={2}>
                      {gpz.zrodlo.source_side === 'HV_110'
                        ? 'szyna 110 kV (transformatory 110/SN w modelu)'
                        : 'szyny SN (impedancja transformatorów 110/SN w równoważniku)'}
                    </td>
                  </tr>
                  <tr>
                    <th className="py-0.5 pr-3 text-left font-normal text-scada-muted">
                      Napięcie znamionowe U<sub>n</sub>
                    </th>
                    {stronaWnWModelu ? (
                      <td>
                        <PoleLiczbowe
                          testId="gpz-supply-un"
                          wartosc={napiecieSzynyZrodla}
                          opcjonalne={false}
                          poprawne={(v) => pasmoNapieciowe(v) === 'WN'}
                          komunikat="Napięcie znamionowe strony WN jest wartością z pasma wysokiego napięcia."
                          onBlad={(tekst) => setKomunikat({ karta: 'hv-side', tekst })}
                          onZatwierdz={(v) => (v === null ? Promise.resolve(false) : zmienUn(v))}
                        />
                      </td>
                    ) : (
                      <td data-testid="gpz-supply-un" className="mvd-num text-scada-text">{liczba(napiecieSzynyZrodla, 'szyna źródła bez napięcia w modelu')}</td>
                    )}
                    <td className="pl-1 text-scada-muted">{stronaWnWModelu || napiecieSzynyZrodla !== null ? 'kV' : ''}</td>
                  </tr>
                  {unDoZmiany !== null && (
                    <tr data-testid="gpz-supply-un-typ">
                      <th className="py-0.5 pr-3 text-left font-normal text-scada-muted">
                        Typ transformatora 110/SN dla U<sub>n</sub> = {liczba(unDoZmiany, 'napięcie nieustalone')} kV
                      </th>
                      <td colSpan={2}>
                        {typyDlaUn.length > 0 ? (
                          <select
                            data-testid="gpz-supply-un-typ-select"
                            value=""
                            onChange={(e) => void zmienUn(unDoZmiany, e.target.value)}
                            className="w-full rounded border border-scada-border bg-scada-surface px-1 py-0.5 text-scada-text"
                          >
                            <option value="" disabled>— wybierz typ z katalogu —</option>
                            {typyDlaUn.map((opt) => (
                              <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span data-testid="gpz-supply-un-typ-brak" className="text-scada-muted">
                            Katalog nie ma transformatora o napięciach {liczba(unDoZmiany, 'napięcie nieustalone')}/{liczba(napiecieSn, 'SN nieustalone')} kV.
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                  {polaZasilania(gpz.zrodlo).map((pole) => (
                    <tr key={pole.klucz}>
                      <th className="py-0.5 pr-3 text-left font-normal text-scada-muted">{pole.etykieta}</th>
                      <td>
                        <PoleLiczbowe
                          key={`${pole.klucz}-${String(gpz.zrodlo?.[pole.klucz])}`}
                          testId={`gpz-supply-${pole.klucz}`}
                          wartosc={typeof gpz.zrodlo?.[pole.klucz] === 'number' ? (gpz.zrodlo[pole.klucz] as number) : null}
                          opcjonalne={pole.opcjonalne}
                          poprawne={pole.poprawne}
                          komunikat={pole.komunikat}
                          onBlad={(tekst) => setKomunikat({ karta: 'hv-side', tekst })}
                          onZatwierdz={(v) =>
                            wykonaj('hv-side', 'update_element_parameters', {
                              element_ref: gpz.zrodlo!.ref_id,
                              parameters: { [pole.klucz]: v },
                            })}
                        />
                      </td>
                      <td className="pl-1 text-scada-muted">{pole.jednostka}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {komunikatKarty('hv-side')}
          </div>
        )}

        {activeCard === 'transformer' && (
          <div data-testid="gpz-card-content-transformer" className="space-y-1">
            {!gpz.istnieje && (
              <p data-testid="gpz-transformer-no-gpz" className={`${TEKST} text-scada-muted`}>
                W modelu nie ma jeszcze tego GPZ. Utwórz GPZ (źródło zasilania SN) — typ
                transformatorów 110/SN wybierasz przy jego tworzeniu i tu go później zmieniasz.
              </p>
            )}
            {gpz.istnieje && gpz.transformatory.length === 0 && (
              <p data-testid="gpz-transformer-boundary-sn" className={`${TEKST} text-scada-muted`}>
                GPZ jest zasilany na granicy SN: moc zwarciowa podana po stronie SN zawiera już
                impedancję transformatorów 110/SN, więc nie są one elementami modelu
                obliczeniowego.
              </p>
            )}
            {gpz.transformatory.length > 0 && (
              <table className={`w-full ${TEKST}`}>
                <thead>
                  <tr className="text-left text-scada-muted">
                    <th className="font-normal">Transformator</th>
                    <th className="font-normal">Typ z katalogu</th>
                    <th className="font-normal text-right">S_n [MVA]</th>
                    <th className="font-normal text-right">u_k [%]</th>
                    <th className="font-normal text-right">U_WN/U_SN [kV]</th>
                    <th className="font-normal">Grupa</th>
                  </tr>
                </thead>
                <tbody>
                  {gpz.transformatory.map((transformator) => {
                    const opcje = opcjeONapieciach(opcjeTransformatora, transformator.uhv_kv, transformator.ulv_kv);
                    const wartosc = transformator.catalog_ref ?? '';
                    const opcjeZWartoscia =
                      wartosc && !opcje.some((opcja) => opcja.id === wartosc)
                        ? [...opcje, { id: wartosc, label: 'pozycja katalogu spoza listy 110/SN', voltageHvKv: transformator.uhv_kv, voltageLvKv: transformator.ulv_kv }]
                        : opcje;
                    return (
                      <tr
                        key={transformator.ref_id}
                        data-testid={`gpz-transformer-${transformator.ref_id}`}
                        className="border-t border-scada-border"
                      >
                        <td className="py-0.5 pr-2 text-scada-text">{transformator.name || transformator.ref_id}</td>
                        <td className="pr-2">
                          <select
                            data-testid={`gpz-transformer-select-${transformator.ref_id}`}
                            value={wartosc}
                            onChange={(e) =>
                              void wykonaj('transformer', 'assign_catalog_to_element', {
                                element_ref: transformator.ref_id,
                                catalog_binding: buildCatalogBinding(
                                  (transformator.catalog_namespace as CatalogNamespace | null | undefined) ?? 'TRAFO_SN_NN',
                                  e.target.value,
                                ),
                              })}
                            className="w-full rounded border border-scada-border bg-scada-surface px-1 py-0.5 text-scada-text"
                          >
                            <option value="" disabled>— wybierz z katalogu —</option>
                            {opcjeZWartoscia.map((opt) => (
                              <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        <PlytaTransformatora transformator={transformator} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {bladKatalogu && (
              <p data-testid="gpz-transformer-catalog-error" className={`${TEKST} text-sygnal-blokada-tusz`}>
                Nie udało się pobrać transformatorów z katalogu: {bladKatalogu}
              </p>
            )}
            {komunikatKarty('transformer')}
          </div>
        )}

        {activeCard === 'sections' && (
          <div data-testid="gpz-card-content-sections">
            {gpz.stacja ? <GpzSectionsEditor station={gpz.stacja} /> : brakGpz}
          </div>
        )}

        {activeCard === 'bays' && (
          <div data-testid="gpz-card-content-bays">
            {!gpz.stacja ? brakGpz : (
              <TabelaPolSn
                stationRef={gpz.stacja.ref_id}
                sekcje={sekcjeTabeliPolGpz(gpz.stacja)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PlytaTransformatora({ transformator }: { transformator: Transformer }): JSX.Element {
  // Moc, u_k, przekładnia i grupa połączeń to TABLICZKA pozycji katalogowej elementu modelu
  // (materializacja `assign_catalog_to_element`) — nie pola formularza.
  return (
    <>
      <td data-testid={`gpz-transformer-plate-${transformator.ref_id}`} className="mvd-num text-right text-scada-text">
        {liczba(transformator.sn_mva, 'S_n poza tabliczką', 'MVA')}
      </td>
      <td className="mvd-num text-right text-scada-text">{liczba(transformator.uk_percent, 'u_k poza tabliczką', '%')}</td>
      <td className="mvd-num text-right text-scada-text">
        {liczba(transformator.uhv_kv, 'U_WN poza tabliczką')}/{liczba(transformator.ulv_kv, 'U_SN poza tabliczką')}
      </td>
      <td className="pl-2 text-scada-text">{transformator.vector_group || 'grupa poza tabliczką — wybierz typ z katalogu'}</td>
    </>
  );
}

interface PoleTekstoweProps {
  readonly testId: string;
  readonly wartosc: string;
  /** Puste pole zdejmuje daną (`null` do operacji) — oznaczenie; nazwy nie da się zdjąć. */
  readonly puste?: boolean;
  /** `false` = odmowa operacji: pole wraca do wartości z modelu (komunikat w karcie). */
  readonly onZatwierdz: (wartosc: string | null) => Promise<boolean>;
}

/** Pole tekstowe zatwierdzane Enterem albo opuszczeniem pola — jedna operacja na zmianę. */
function PoleTekstowe({ testId, wartosc, puste = false, onZatwierdz }: PoleTekstoweProps): JSX.Element {
  const [szkic, setSzkic] = useState(wartosc);
  const zatwierdz = () => {
    const nowa = szkic.trim();
    if (nowa === wartosc || (!nowa && !puste)) {
      setSzkic(wartosc);
      return;
    }
    void onZatwierdz(nowa || null).then((ok) => {
      if (!ok) setSzkic(wartosc);
    });
  };
  return (
    <input
      type="text"
      data-testid={testId}
      value={szkic}
      onChange={(e) => setSzkic(e.target.value)}
      onBlur={zatwierdz}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className="w-64 rounded border border-scada-border bg-scada-surface px-2 py-0.5 text-scada-text focus:border-scada-sn focus:outline-none"
    />
  );
}

interface PoleLiczboweProps {
  readonly testId: string;
  readonly wartosc: number | null;
  readonly opcjonalne: boolean;
  readonly poprawne: (v: number) => boolean;
  readonly komunikat: string;
  readonly onBlad: (komunikat: string) => void;
  /** `false` = odmowa operacji: pole wraca do wartości z modelu (komunikat w karcie). */
  readonly onZatwierdz: (wartosc: number | null) => Promise<boolean>;
}

/** Pole liczbowe zatwierdzane Enterem albo opuszczeniem pola. Puste pole czyści daną
 * opcjonalną (scenariusz MIN liczy się wtedy z danych maksymalnych); dana wymagana i wartość
 * niepoprawna nie wychodzą do backendu — komunikat wraca do karty. */
function PoleLiczbowe(props: PoleLiczboweProps): JSX.Element {
  const { testId, wartosc, opcjonalne, poprawne, komunikat, onBlad, onZatwierdz } = props;
  // Zapis polski (przecinek dziesiętny, kontrakt prezentacji §10); wpis przyjmuje przecinek i kropkę.
  const tekst0 = wartosc === null ? '' : String(wartosc).replace('.', ',');
  const [szkic, setSzkic] = useState(tekst0);
  // Wartość z modelu zmieniona poza polem (inna operacja, przeładowanie migawki) → pole ją pokazuje.
  useEffect(() => setSzkic(tekst0), [tekst0]);
  const zapisz = (v: number | null) => {
    void onZatwierdz(v).then((ok) => {
      if (!ok) setSzkic(tekst0);
    });
  };
  const zatwierdz = () => {
    const tekst = szkic.trim().replace(',', '.');
    if (tekst === '') {
      if (wartosc === null) return;
      if (opcjonalne) zapisz(null);
      else {
        onBlad(komunikat);
        setSzkic(tekst0);
      }
      return;
    }
    const liczbaWpisana = Number(tekst);
    if (!poprawne(liczbaWpisana)) {
      onBlad(komunikat);
      setSzkic(tekst0);
      return;
    }
    if (liczbaWpisana !== wartosc) zapisz(liczbaWpisana);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      data-testid={testId}
      value={szkic}
      placeholder={opcjonalne ? 'z danych MAX' : undefined}
      onChange={(e) => setSzkic(e.target.value)}
      onBlur={zatwierdz}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className="mvd-num w-32 rounded border border-scada-border bg-scada-surface px-2 py-0.5 text-right text-scada-text focus:border-scada-sn focus:outline-none"
    />
  );
}

export default GpzConfiguratorSurface;
