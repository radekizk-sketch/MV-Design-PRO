/**
 * UI-02b JEDEN-INSPEKTOR — formularz układu PV/BESS/FW w prawym inspektorze.
 *
 * Otwiera go upuszczenie układu z palety kanwy na stację (`useDerDragDrop` →
 * `useKontekstElementuKanwy.ustawSzkicDer`). Zapis: `POST /api/projects/{p}/cases/{c}/generators`
 * przez współdzielony klient `postDerGeneratorConfig`; migawka z odpowiedzi trafia wprost
 * do `useSnapshotStore` (jedna prawda modelu), szkic znika po sukcesie.
 *
 * Przeniesione z dawnej szuflady szczegółów kanwy razem z jej regułami danych:
 *  - typ przekształtnika WYŁĄCZNIE z katalogu backendu (`fetchDerConverterTypes`), filtr
 *    pasma po `un_kv` typu, wybór jawny (pusta pozycja na starcie, pusty wybór blokuje zapis);
 *  - zmiana technologii unieważnia wybrany typ (klucz pary technologia × wariant, ten sam
 *    dla haka katalogu i efektu czyszczącego — predykaty parami);
 *  - moduł NC RfG jest KLASYFIKACJĄ backendu z (moc, napięcie przyłączenia), nie wyborem;
 *    przy zapisie pobierany świeżo dla dokładnie wysyłanych wartości;
 *  - jedyny wariant przyłączenia to strona nN stacji (karta FAB-K): napięcie z realnej szyny
 *    nN stacji, a gdy stacja nie ma jeszcze transformatora — wartość katalogowa 0,4 kV
 *    jawnie oznaczona;
 *  - K6 (Z-16): przyłączenie po stronie SN NIE ma w tym formularzu drugiej ścieżki — przycisk
 *    „Przyłącz po stronie SN…" otwiera pełny kreator źródła (`add_converter_source`) z
 *    preselekcją stacji, technologii, wariantu blokowego i mocy (wzorzec
 *    `ui2/oze/PrzylaczZrodloPrzycisk.tsx`), a szkic znika;
 *  - K6: BESS wymaga pakietu baterii z katalogu `BATERIA_BESS` (`battery_catalog_ref`, sprzęt
 *    oddzielny od przekształtnika) — bez wyboru zapis jest zablokowany;
 *  - K6: tryb regulacji jest widoczny: z karty katalogowej wybranego przekształtnika
 *    (`control_mode`) ze wskazaniem źródła danej; brak w katalogu = „brak danych".
 *
 * Świadomie NIE przeniesiono zakładki „Zabezpieczenia źródła": szkic nie jest jeszcze
 * obiektem modelu, a dawna zakładka czytała przypisania zabezpieczeń STACJI pod nagłówkiem
 * źródła. Nastawy zapisanego źródła pokazuje inspektor generatora.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useForm, type FieldError, type FieldErrors, type Resolver } from 'react-hook-form';
import { z } from 'zod';

import { fetchDerConverterTypes } from '../../catalog/api';
import { fetchBessBatteryTypes, type BessBatteryItem } from '../station-der/derRemoteCatalogs';
import { useNetworkBuildStore } from '../networkBuildStore';
import { trybRegulacjiPl } from '../../sld/shared/kartaTechnicznaElementu';
import { BRAK_PAKIETU_BATERII_PL } from '../../../ui2/kreatory/zrodlo-oze/zrodloOzeModel';
import type { ConverterType } from '../../catalog/types';
import { klasyfikujModulNcRfg } from '../../../ui2/oze/ncrfg/api';
import { OPIS_PASMA_NN, powyzejPasmaNn, wPasmieNn } from '../../../ui2/model/pasmaNapieciowe';
import { useAppStateStore } from '../../app-state';
import { notify } from '../../notifications/store';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { DerPersistenceApiError, postDerGeneratorConfig } from '../../sld/v2/canvas/derPersistenceApi';
import type { DaneElementuKanwy } from '../../sld/shared/daneElementuKanwy';
import { useKontekstElementuKanwy, type RodzajSzkicuDer } from '../../sld/shared/kontekstElementuKanwy';

type WariantPrzylaczeniaDer = 'nn_side';
type ModulNcRfg = 'A' | 'B' | 'C' | 'D';

export interface WartosciFormularzaDer {
  derKind: RodzajSzkicuDer;
  powerMw: number;
  connectionVariant: WariantPrzylaczeniaDer;
  pointVoltageKv: number;
  inverterCatalogRef: string;
  /** K6: pakiet baterii z katalogu `BATERIA_BESS` — wymagany dla BESS, pusty dla PV/FW. */
  batteryCatalogRef: string;
  /** Moduł NC RfG z klasyfikacji backendu; `null` = nieustalony albo poniżej progu. */
  ncRfgModule: ModulNcRfg | null;
}

interface StanKataloguPrzeksztaltnikow {
  readonly status: 'loading' | 'ready' | 'empty' | 'error';
  readonly options: ReadonlyArray<{ value: string; label: string }>;
  /** Rekordy katalogu (tryb regulacji wybranej pozycji z karty katalogowej). */
  readonly rekordy: readonly ConverterType[];
  readonly errorMessage: string | null;
}

const KATALOG_WCZYTYWANY: StanKataloguPrzeksztaltnikow = { status: 'loading', options: [], rekordy: [], errorMessage: null };

function rodzajKatalogu(kind: RodzajSzkicuDer): ConverterType['kind'] {
  return kind === 'FW' ? 'WIND' : kind;
}

/** Etykieta = pola katalogu (nazwa, producent i model, identyfikator) — nigdy literał UI. */
function etykietaPrzeksztaltnika(item: ConverterType): string {
  const name = item.name?.trim();
  if (name) return name;
  const producentModel = [item.manufacturer, item.model].filter(Boolean).join(' ');
  return producentModel || item.id;
}

/** Klucz pary (technologia, wariant) — jedno źródło dla haka katalogu i efektu czyszczącego. */
function kluczKataloguDer(derKind: RodzajSzkicuDer, wariant: WariantPrzylaczeniaDer): string {
  return `${derKind}|${wariant}`;
}

function useKatalogPrzeksztaltnikow(
  derKind: RodzajSzkicuDer,
  wariant: WariantPrzylaczeniaDer,
): StanKataloguPrzeksztaltnikow {
  const klucz = kluczKataloguDer(derKind, wariant);
  const [stan, setStan] = useState<{ klucz: string; wartosc: StanKataloguPrzeksztaltnikow }>({
    klucz,
    wartosc: KATALOG_WCZYTYWANY,
  });
  useEffect(() => {
    let aktywny = true;
    setStan({ klucz, wartosc: KATALOG_WCZYTYWANY });
    const nn = wariant === 'nn_side';
    void fetchDerConverterTypes(rodzajKatalogu(derKind))
      .then((rekordy) => {
        if (!aktywny) return;
        if (!Array.isArray(rekordy)) throw new Error('Backend nie zwrócił listy przekształtników z katalogu.');
        const wPasmie = rekordy.filter((item) => (nn ? wPasmieNn(item.un_kv) : powyzejPasmaNn(item.un_kv)));
        const options = wPasmie.map((item) => ({ value: item.id, label: etykietaPrzeksztaltnika(item) }));
        setStan({
          klucz,
          wartosc: options.length > 0
            ? { status: 'ready', options, rekordy: wPasmie, errorMessage: null }
            : {
                status: 'empty',
                options: [],
                rekordy: [],
                errorMessage: `Katalog nie zawiera przekształtników ${nn ? 'nN' : 'SN'} dla technologii ${derKind}.`,
              },
        });
      })
      .catch((error: unknown) => {
        if (!aktywny) return;
        setStan({
          klucz,
          wartosc: {
            status: 'error',
            options: [],
            rekordy: [],
            errorMessage: error instanceof Error ? error.message : 'Nie udało się pobrać katalogu przekształtników.',
          },
        });
      });
    return () => {
      aktywny = false;
    };
  }, [derKind, wariant, klucz]);
  return stan.klucz === klucz ? stan.wartosc : KATALOG_WCZYTYWANY;
}

interface StanKlasyfikacjiNcRfg {
  readonly status: 'loading' | 'ready' | 'error';
  readonly modul: ModulNcRfg | null;
  readonly powod: string | null;
}

/** Klasyfikacja modułu NC RfG WYŁĄCZNIE z backendu (`GET /api/ncrfg-tests/modul`). */
function useKlasyfikacjaNcRfg(powerMw: number, pointVoltageKv: number): StanKlasyfikacjiNcRfg {
  const [stan, setStan] = useState<StanKlasyfikacjiNcRfg>({ status: 'loading', modul: null, powod: null });
  useEffect(() => {
    if (!(powerMw > 0) || !(pointVoltageKv > 0)) {
      setStan({ status: 'loading', modul: null, powod: null });
      return undefined;
    }
    let aktywny = true;
    setStan({ status: 'loading', modul: null, powod: null });
    void klasyfikujModulNcRfg({ pMaxKw: powerMw * 1000, napiecieKv: pointVoltageKv })
      .then((klasyfikacja) => {
        if (aktywny) setStan({ status: 'ready', modul: klasyfikacja.modul, powod: klasyfikacja.powod_pl });
      })
      .catch(() => {
        if (aktywny) setStan({ status: 'error', modul: null, powod: null });
      });
    return () => {
      aktywny = false;
    };
  }, [powerMw, pointVoltageKv]);
  return stan;
}

const PUSTY_WYBOR_PRZEKSZTALTNIKA = '— wybierz z katalogu —';
const PUSTY_WYBOR_BATERII = '— wybierz pakiet baterii z katalogu —';

interface StanKataloguBaterii {
  readonly status: 'nie_dotyczy' | 'loading' | 'ready' | 'empty' | 'error';
  readonly pozycje: readonly BessBatteryItem[];
}

/** K6: pakiety baterii BESS (`GET /api/catalog/bess-battery-types`) — tylko dla BESS. */
function useKatalogBaterii(derKind: RodzajSzkicuDer): StanKataloguBaterii {
  const [stan, setStan] = useState<StanKataloguBaterii>({ status: 'nie_dotyczy', pozycje: [] });
  useEffect(() => {
    if (derKind !== 'BESS') {
      setStan({ status: 'nie_dotyczy', pozycje: [] });
      return undefined;
    }
    let aktywny = true;
    setStan({ status: 'loading', pozycje: [] });
    void fetchBessBatteryTypes()
      .then((pozycje) => {
        if (aktywny) setStan({ status: pozycje.length > 0 ? 'ready' : 'empty', pozycje });
      })
      .catch(() => {
        if (aktywny) setStan({ status: 'error', pozycje: [] });
      });
    return () => {
      aktywny = false;
    };
  }, [derKind]);
  return stan;
}

function etykietaBaterii(item: BessBatteryItem): string {
  return `${item.name} · ${item.chemistry} · ${item.capacity_kwh.toLocaleString('pl-PL')} kWh · ${item.nominal_voltage_dc_v.toLocaleString('pl-PL')} V DC`;
}

const schematFormularzaDer = z.object({
  derKind: z.enum(['PV', 'BESS', 'FW']),
  powerMw: z.coerce
    .number({ invalid_type_error: 'Podaj moc czynną DER w MW.' })
    .min(0.1, 'Moc czynna DER musi być nie mniejsza niż 0,1 MW.')
    .max(10, 'Moc czynna DER musi być nie większa niż 10 MW.'),
  connectionVariant: z.literal('nn_side'),
  pointVoltageKv: z.coerce.number().positive('Napięcie punktu przyłączenia musi być dodatnie.'),
  inverterCatalogRef: z.string().min(1, 'Wybierz typ przekształtnika z katalogu.'),
  batteryCatalogRef: z.string(),
  ncRfgModule: z.enum(['A', 'B', 'C', 'D']).nullable(),
}).superRefine((value, ctx) => {
  if (!wPasmieNn(value.pointVoltageKv)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['connectionVariant'],
      message: `Wariant nN wymaga punktu przyłączenia w paśmie nN (${OPIS_PASMA_NN}).`,
    });
  }
  if (value.derKind === 'BESS' && value.batteryCatalogRef.trim() === '') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['batteryCatalogRef'], message: BRAK_PAKIETU_BATERII_PL });
  }
});

function bledyZod(error: z.ZodError<WartosciFormularzaDer>): FieldErrors<WartosciFormularzaDer> {
  const errors: FieldErrors<WartosciFormularzaDer> = {};
  for (const issue of error.issues) {
    const pole = issue.path[0] as keyof WartosciFormularzaDer | undefined;
    if (!pole || errors[pole]) continue;
    errors[pole] = { type: issue.code, message: issue.message } as FieldError;
  }
  return errors;
}

const resolverFormularzaDer: Resolver<WartosciFormularzaDer> = async (values) => {
  const parsed = schematFormularzaDer.safeParse(values);
  if (parsed.success) return { values: parsed.data, errors: {} };
  return { values: {}, errors: bledyZod(parsed.error) };
};

/** Napięcie punktu przyłączenia: realna szyna nN stacji; bez niej wartość katalogowa 0,4 kV. */
function napieciePunktu(napiecieSzynyNnKv: number | null | undefined): number {
  return napiecieSzynyNnKv != null && wPasmieNn(napiecieSzynyNnKv) ? napiecieSzynyNnKv : 0.4;
}

function domyslnaMocMw(kind: RodzajSzkicuDer): number {
  return kind === 'FW' ? 2.0 : 0.5;
}

function wartosciDomyslne(derKind: RodzajSzkicuDer, napiecieSzynyNnKv: number | null | undefined): WartosciFormularzaDer {
  return {
    derKind,
    powerMw: domyslnaMocMw(derKind),
    connectionVariant: 'nn_side',
    pointVoltageKv: napieciePunktu(napiecieSzynyNnKv),
    inverterCatalogRef: '',
    batteryCatalogRef: '',
    ncRfgModule: null,
  };
}

/** Kolejność pól formularza — pierwszy błąd w tej kolejności dostaje fokus. */
const KOLEJNOSC_POL: readonly (keyof WartosciFormularzaDer)[] = [
  'derKind',
  'powerMw',
  'connectionVariant',
  'pointVoltageKv',
  'inverterCatalogRef',
  'batteryCatalogRef',
  'ncRfgModule',
];

const ID_POLA: Readonly<Partial<Record<keyof WartosciFormularzaDer, string>>> = {
  derKind: 'inspektor-der-typ',
  powerMw: 'inspektor-der-moc',
  inverterCatalogRef: 'inspektor-der-przeksztaltnik',
  batteryCatalogRef: 'inspektor-der-bateria',
};

function pierwszyBlad(errors: FieldErrors<WartosciFormularzaDer>): string | null {
  for (const pole of KOLEJNOSC_POL) {
    const message = errors[pole]?.message;
    if (message) return message.toString();
  }
  return null;
}

const PRESETY_MOCY_MW: Readonly<Record<RodzajSzkicuDer, readonly number[]>> = {
  PV: [0.1, 0.25, 0.5, 1, 2],
  BESS: [0.05, 0.1, 0.25, 0.5, 1],
  FW: [2, 3, 5, 8, 10],
};

const NAZWA_TECHNOLOGII: Readonly<Record<RodzajSzkicuDer, string>> = {
  PV: 'Układ fotowoltaiczny (PV)',
  BESS: 'Magazyn energii (BESS)',
  FW: 'Farma wiatrowa (FW)',
};

export interface FormularzSzkicuDerProps {
  /** Dane szkicu: stacja docelowa i szyna nN (`buildDaneSzkicuDer`). */
  readonly dane: DaneElementuKanwy;
  readonly derKind: RodzajSzkicuDer;
}

export function FormularzSzkicuDer({ dane, derKind }: FormularzSzkicuDerProps): JSX.Element {
  const activeProjectId = useAppStateStore((state) => state.activeProjectId);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const setSnapshot = useSnapshotStore((state) => state.setSnapshot);
  const wyczyscSzkicDer = useKontekstElementuKanwy((state) => state.wyczyscSzkicDer);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const napiecieSzynyNn = dane.nnSpec?.busVoltageKv;

  const form = useForm<WartosciFormularzaDer>({
    resolver: resolverFormularzaDer,
    mode: 'onChange',
    defaultValues: wartosciDomyslne(derKind, napiecieSzynyNn),
  });
  useEffect(() => {
    form.reset(wartosciDomyslne(derKind, napiecieSzynyNn));
  }, [dane.elementId, derKind, napiecieSzynyNn, form]);

  const wybranyRodzaj = form.watch('derKind');
  const wybranyWariant = form.watch('connectionVariant');
  const moc = form.watch('powerMw');
  const napiecie = form.watch('pointVoltageKv');
  const modul = form.watch('ncRfgModule');
  const katalog = useKatalogPrzeksztaltnikow(wybranyRodzaj, wybranyWariant);
  const katalogBaterii = useKatalogBaterii(wybranyRodzaj);
  const wybranyPrzeksztaltnik = form.watch('inverterCatalogRef');
  const rekordPrzeksztaltnika = katalog.rekordy.find((item) => item.id === wybranyPrzeksztaltnik) ?? null;
  const klasyfikacja = useKlasyfikacjaNcRfg(Number(moc), Number(napiecie));

  useEffect(() => {
    if (klasyfikacja.status !== 'ready') return;
    if (form.getValues('ncRfgModule') === klasyfikacja.modul) return;
    form.setValue('ncRfgModule', klasyfikacja.modul, { shouldValidate: true });
  }, [form, klasyfikacja.modul, klasyfikacja.status]);

  const klucz = kluczKataloguDer(wybranyRodzaj, wybranyWariant);
  const poprzedniKlucz = useRef(klucz);
  useEffect(() => {
    if (poprzedniKlucz.current === klucz) return;
    poprzedniKlucz.current = klucz;
    if (form.getValues('inverterCatalogRef') !== '') {
      form.setValue('inverterCatalogRef', '', { shouldValidate: false });
    }
    // Pakiet baterii dotyczy wyłącznie BESS — zmiana technologii go unieważnia.
    if (form.getValues('batteryCatalogRef') !== '') {
      form.setValue('batteryCatalogRef', '', { shouldValidate: false });
    }
  }, [klucz, form]);

  useEffect(() => {
    if (katalog.status === 'loading') return;
    const biezacy = form.getValues('inverterCatalogRef');
    if (biezacy !== '' && !katalog.options.some((option) => option.value === biezacy)) {
      form.setValue('inverterCatalogRef', '', { shouldValidate: true });
    }
  }, [form, katalog.status, katalog.options]);

  const etykietaStacji = dane.label ?? dane.stationCode ?? 'stacja';

  const zapisz = useCallback(async (values: WartosciFormularzaDer) => {
    if (!activeProjectId || !activeCaseId) {
      notify('Nie można zapisać układu PV/BESS/FW: wybierz aktywny projekt i przypadek.', 'error');
      return;
    }
    if (!dane.elementId) {
      notify('Nie można zapisać układu PV/BESS/FW: brak stacji docelowej w modelu.', 'error');
      return;
    }
    // Moduł NC RfG świeżo z backendu dla DOKŁADNIE wysyłanych (moc, napięcie) — efekt w tle
    // mógł nie zdążyć po ostatniej zmianie mocy; błąd pobrania zostawia ostatnią wartość,
    // którą backend i tak weryfikuje.
    const swiezy = await klasyfikujModulNcRfg({ pMaxKw: values.powerMw * 1000, napiecieKv: values.pointVoltageKv })
      .then((wynik) => ({ ok: true as const, modul: wynik.modul }))
      .catch(() => ({ ok: false as const }));
    try {
      const odpowiedz = await postDerGeneratorConfig(activeProjectId, activeCaseId, {
        station_ref: dane.elementId,
        der_kind: values.derKind,
        power_mw: values.powerMw,
        connection_variant: values.connectionVariant,
        catalog_ref: values.inverterCatalogRef,
        ...(values.derKind === 'BESS' ? { battery_catalog_ref: values.batteryCatalogRef } : {}),
        source_name: `${values.derKind} ${etykietaStacji}`,
        quantity: 1,
        nc_rfg_module: swiezy.ok ? swiezy.modul : values.ncRfgModule,
      });
      setSnapshot(odpowiedz);
      notify(`Zapisano układ ${values.derKind} w stacji ${etykietaStacji}.`, 'success');
      wyczyscSzkicDer();
    } catch (error) {
      const komunikat = error instanceof DerPersistenceApiError || error instanceof Error
        ? error.message
        : 'Nie udało się zapisać układu PV/BESS/FW.';
      notify(komunikat, 'error');
    }
  }, [activeCaseId, activeProjectId, dane.elementId, etykietaStacji, setSnapshot, wyczyscSzkicDer]);

  const naBledach = useCallback((errors: FieldErrors<WartosciFormularzaDer>) => {
    const pole = KOLEJNOSC_POL.find((nazwa) => errors[nazwa] && ID_POLA[nazwa]);
    if (pole) document.getElementById(ID_POLA[pole]!)?.focus();
  }, []);

  // K6 (Z-16): jedyna ścieżka SN — pełny kreator źródła z preselekcją; szkic nN znika.
  const przylaczPoStronieSn = useCallback(() => {
    if (!dane.elementId) return;
    const mocMw = Number(form.getValues('powerMw'));
    openOperationForm('add_converter_source', {
      station_ref: dane.elementId,
      source_technology: form.getValues('derKind'),
      connection_variant: 'block_transformer',
      ...(Number.isFinite(mocMw) && mocMw > 0 ? { power_setpoint_mw: mocMw } : {}),
      source: 'inspektor_szkic_der',
    });
    wyczyscSzkicDer();
  }, [dane.elementId, form, openOperationForm, wyczyscSzkicDer]);

  const blad = pierwszyBlad(form.formState.errors);
  const napiecieZModelu = napiecieSzynyNn != null && wPasmieNn(napiecieSzynyNn);

  return (
    <section
      data-testid="inspektor-der-formularz"
      aria-labelledby="inspektor-der-tytul"
      className="flex flex-col gap-3 border-b px-4 py-3"
      style={{ borderColor: 'var(--mvd-line)', fontSize: 'var(--mvd-font-size-data)', color: 'var(--mvd-ink)' }}
    >
      <h4 id="inspektor-der-tytul" className="font-semibold" style={{ fontSize: 'var(--mvd-font-size-data)' }}>
        Przyłączenie po stronie nN stacji
      </h4>
      <p data-testid="inspektor-der-stacja" style={{ color: 'var(--mvd-muted)' }}>
        Nowy układ PV/BESS/FW w stacji {etykietaStacji}
      </p>

      <div className="mvd-pole">
        <label className="mvd-pole-etykieta" htmlFor="inspektor-der-typ">Technologia</label>
        <select id="inspektor-der-typ" data-testid="inspektor-der-typ" className="mvd-input" {...form.register('derKind')}>
          {(Object.keys(NAZWA_TECHNOLOGII) as RodzajSzkicuDer[]).map((kind) => (
            <option key={kind} value={kind}>{NAZWA_TECHNOLOGII[kind]}</option>
          ))}
        </select>
      </div>

      <div className="mvd-pole">
        <label className="mvd-pole-etykieta" htmlFor="inspektor-der-moc">Moc czynna zadana [MW]</label>
        <input
          id="inspektor-der-moc"
          data-testid="inspektor-der-moc"
          type="number"
          min={0.1}
          max={10}
          step={0.1}
          className="mvd-input mvd-num"
          aria-invalid={form.formState.errors.powerMw ? true : undefined}
          {...form.register('powerMw', { valueAsNumber: true })}
        />
        <div className="flex flex-wrap gap-1" aria-label={`Typowe moce ${wybranyRodzaj}`}>
          {PRESETY_MOCY_MW[wybranyRodzaj].map((mw) => (
            <button
              type="button"
              key={mw}
              className="mvd-btn mvd-num"
              data-testid={`inspektor-der-moc-preset-${Math.round(mw * 1000)}`}
              onClick={() => form.setValue('powerMw', mw, { shouldDirty: true, shouldValidate: true })}
            >
              {mw < 1 ? `${Math.round(mw * 1000)} kW` : `${String(mw).replace('.', ',')} MW`}
            </button>
          ))}
        </div>
      </div>

      <div className="mvd-pole" data-testid="inspektor-der-punkt">
        <span className="mvd-pole-etykieta">Punkt przyłączenia</span>
        <span>Strona nN stacji (za transformatorem SN/nN)</span>
        <span className="mvd-num" data-testid="inspektor-der-napiecie-punktu">
          {Number(napiecie).toLocaleString('pl-PL', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kV
          {napiecieZModelu ? ' — szyna nN stacji z modelu' : ' — wartość katalogowa: stacja bez transformatora w modelu'}
        </span>
        <button
          type="button"
          className="mvd-btn"
          data-testid="inspektor-der-przylacz-sn"
          title="Otwiera kreator źródła po stronie SN (pole SN z aparatem, transformator blokowy, kabel) z tą stacją, technologią i mocą."
          disabled={!dane.elementId}
          onClick={przylaczPoStronieSn}
        >
          Przyłącz po stronie SN…
        </button>
      </div>

      <div className="mvd-pole">
        <label className="mvd-pole-etykieta" htmlFor="inspektor-der-przeksztaltnik">Przekształtnik z katalogu</label>
        {katalog.status === 'loading' && (
          <span data-testid="inspektor-der-przeksztaltnik-ladowanie" style={{ color: 'var(--mvd-muted)' }}>
            Wczytywanie katalogu przekształtników…
          </span>
        )}
        {(katalog.status === 'empty' || katalog.status === 'error') && (
          <span data-testid="inspektor-der-przeksztaltnik-brak" style={{ color: 'var(--mvd-warn)' }}>
            {katalog.errorMessage ?? 'Katalog przekształtników jest niedostępny.'}
          </span>
        )}
        {katalog.status === 'ready' && (
          <select
            id="inspektor-der-przeksztaltnik"
            data-testid="inspektor-der-przeksztaltnik"
            className="mvd-input"
            aria-invalid={form.formState.errors.inverterCatalogRef ? true : undefined}
            {...form.register('inverterCatalogRef')}
          >
            <option value="">{PUSTY_WYBOR_PRZEKSZTALTNIKA}</option>
            {katalog.options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        )}
      </div>

      {wybranyRodzaj === 'BESS' && (
        <div className="mvd-pole">
          <label className="mvd-pole-etykieta" htmlFor="inspektor-der-bateria">Pakiet baterii z katalogu</label>
          {katalogBaterii.status === 'loading' && (
            <span data-testid="inspektor-der-bateria-ladowanie" style={{ color: 'var(--mvd-muted)' }}>
              Wczytywanie katalogu pakietów baterii…
            </span>
          )}
          {(katalogBaterii.status === 'empty' || katalogBaterii.status === 'error') && (
            <span data-testid="inspektor-der-bateria-brak" style={{ color: 'var(--mvd-warn)' }}>
              {katalogBaterii.status === 'empty'
                ? 'Katalog nie zawiera pakietów baterii magazynu — dobierz magazyn w kreatorze źródła.'
                : 'Nie udało się pobrać katalogu pakietów baterii — dobierz magazyn w kreatorze źródła.'}
            </span>
          )}
          {katalogBaterii.status === 'ready' && (
            <select
              id="inspektor-der-bateria"
              data-testid="inspektor-der-bateria"
              className="mvd-input"
              aria-invalid={form.formState.errors.batteryCatalogRef ? true : undefined}
              {...form.register('batteryCatalogRef')}
            >
              <option value="">{PUSTY_WYBOR_BATERII}</option>
              {katalogBaterii.pozycje.map((item) => (
                <option key={item.id} value={item.id}>{etykietaBaterii(item)}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="mvd-pole" data-testid="inspektor-der-regulacja">
        <span className="mvd-pole-etykieta">Tryb regulacji</span>
        <span data-testid="inspektor-der-regulacja-tryb" className={rekordPrzeksztaltnika?.control_mode ? undefined : 'mvd-kt-brak'}>
          {rekordPrzeksztaltnika?.control_mode
            ? trybRegulacjiPl(rekordPrzeksztaltnika.control_mode)
            : rekordPrzeksztaltnika
              ? 'brak danych'
              : 'wybierz przekształtnik z katalogu'}
        </span>
        <span data-testid="inspektor-der-regulacja-zrodlo" style={{ color: 'var(--mvd-muted)' }}>
          {rekordPrzeksztaltnika
            ? `źródło: karta katalogowa przekształtnika ${etykietaPrzeksztaltnika(rekordPrzeksztaltnika)}`
            : 'źródło: karta katalogowa wybranego przekształtnika'}
        </span>
      </div>

      <div className="mvd-pole" data-testid="inspektor-der-ncrfg">
        <span className="mvd-pole-etykieta">Moduł NC RfG (klasyfikacja backendu wg mocy i napięcia przyłączenia)</span>
        <span data-testid="inspektor-der-ncrfg-modul" className="font-semibold">
          {modul !== null ? `Typ ${modul}` : klasyfikacja.status === 'ready' ? 'Poniżej progu istotności' : '—'}
        </span>
        {modul === null && klasyfikacja.status === 'ready' && klasyfikacja.powod && (
          <span data-testid="inspektor-der-ncrfg-powod" style={{ color: 'var(--mvd-muted)' }}>{klasyfikacja.powod}</span>
        )}
        {klasyfikacja.status === 'loading' && (
          <span style={{ color: 'var(--mvd-muted)' }}>Wyznaczanie modułu w backendzie…</span>
        )}
        {klasyfikacja.status === 'error' && (
          <span data-testid="inspektor-der-ncrfg-blad" style={{ color: 'var(--mvd-err)' }}>
            Nie udało się wyznaczyć modułu w backendzie — zapis zweryfikuje go ponownie.
          </span>
        )}
      </div>

      {blad && (
        <p role="alert" data-testid="inspektor-der-blad" style={{ color: 'var(--mvd-err)' }}>{blad}</p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" className="mvd-btn" data-testid="inspektor-der-anuluj" onClick={wyczyscSzkicDer}>
          Anuluj
        </button>
        <button
          type="button"
          className="mvd-btn mvd-btn-primary"
          data-testid="inspektor-der-zapisz"
          disabled={form.formState.isSubmitting}
          onClick={() => void form.handleSubmit(zapisz, naBledach)()}
        >
          Zapisz układ
        </button>
      </div>
    </section>
  );
}
