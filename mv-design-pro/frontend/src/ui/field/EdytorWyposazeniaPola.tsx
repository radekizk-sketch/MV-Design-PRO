/**
 * KARTA W5-C — edytor wyposażenia pola SN (karta pola, ekran E-11).
 *
 * Jedyny dostawca operacji `set_bay_equipment` w interfejsie. Trzy tryby = trzy tryby
 * operacji: „z katalogu" (aparaty z pozycją katalogową — stan MODEL), „z szablonu pola"
 * (aparaty z szablonu — PROPOZYCJA, dane przyjęte z jakością szacowaną, albo MODEL, gdy
 * szablon jest polem katalogowym rodziny z BOM-em), „usuń wyposażenie" (BRAK_DANYCH).
 * Stan danych i dane przyjęte pokazuje z modelu odczytu pola (`equipment_data_state`,
 * `equipment_assumed_data`), a po zapisie — z odpowiedzi operacji (`wyposazenie_pola`).
 * Każda kontrolka mapuje na pole ładunku operacji; reguły doboru ocenia backend, odmowa
 * wraca tu zdaniem z kodem. ZERO fizyki i zero domysłu w UI.
 *
 * Katalog aparatów i szablonów pobierany dopiero po otwarciu edycji („Zmień wyposażenie") —
 * sama karta pola nie odpytuje katalogu, gdy pole nie ma z nim powiązania.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  Bay,
  DanaPrzyjetaWyposazenia,
  EnergyNetworkModel,
  StanDanychWyposazenia,
  WyposazeniePolaOdpowiedz,
} from '../../types/enm';
import { ETYKIETA_PL_ROLI_UZIEMNIKA, ROLE_UZIEMNIKA, type RolaUziemnika } from '../../types/uziemienie';
import {
  fetchCompleteBayTemplates,
  fetchCtTypes,
  fetchMvApparatusTypes,
  fetchSurgeArresterTypes,
  fetchVtTypes,
  getCatalogErrorMessage,
} from '../catalog/api';
import type { CompleteMvBayTemplateSummary } from '../catalog/BayTemplatePicker';
import type { CatalogType, MVApparatusCatalogType } from '../catalog/types';
import { czyLacznik } from '../shared/stanLacznika';
import {
  czyWierszKompletny,
  NAZWA_RODZAJU_APARATU_PL,
  PRZESTRZEN_KATALOGU_APARATU,
  RODZAJE_APARATU_POLA_SN,
  RODZAJE_KATALOGOWE_APARATU,
  RODZAJE_Z_GALEZIA,
  RODZAJE_Z_ROLA_UZIEMIENIA,
  STAN_DANYCH_WYPOSAZENIA_PL,
  UMIEJSCOWIENIA,
  UMIEJSCOWIENIE_PL,
  WIERSZ_PUSTY,
  wierszeZAparatow,
  zbudujPayloadWyposazenia,
  zmienRodzaj,
  type PrzestrzenKatalogu,
  type RodzajAparatuPolaSn,
  type TrybWyposazenia,
  type WierszAparatu,
} from './wyposazeniePola';
import type { DomainOpResponseV1 } from '../../types/enm';

interface PozycjeKatalogu {
  readonly APARAT_SN: readonly MVApparatusCatalogType[];
  readonly CT: readonly CatalogType[];
  readonly VT: readonly CatalogType[];
  readonly OGRANICZNIK_SN: readonly CatalogType[];
}

const KATALOG_PUSTY: PozycjeKatalogu = { APARAT_SN: [], CT: [], VT: [], OGRANICZNIK_SN: [] };

const TRYBY: ReadonlyArray<{ id: TrybWyposazenia; etykieta: string }> = [
  { id: 'katalog', etykieta: 'Z katalogu aparatów' },
  { id: 'szablon', etykieta: 'Z szablonu pola' },
  { id: 'wyczysc', etykieta: 'Usuń wyposażenie' },
];

export interface EdytorWyposazeniaPolaProps {
  readonly bay: Bay;
  readonly snapshot: EnergyNetworkModel | null;
  readonly stanDanych: StanDanychWyposazenia | null;
  readonly danePrzyjete: readonly DanaPrzyjetaWyposazenia[];
  readonly activeCaseId: string | null;
  readonly executeDomainOperation: (
    caseId: string,
    opName: string,
    payload: Record<string, unknown>,
  ) => Promise<DomainOpResponseV1 | null>;
  readonly bladStore?: () => string | null;
}

function pozycjeDlaWiersza(katalog: PozycjeKatalogu, kind: RodzajAparatuPolaSn): readonly CatalogType[] {
  const przestrzen: PrzestrzenKatalogu | null = PRZESTRZEN_KATALOGU_APARATU[kind];
  if (przestrzen === null) return [];
  if (przestrzen !== 'APARAT_SN') return katalog[przestrzen];
  const dozwolone = RODZAJE_KATALOGOWE_APARATU[kind] ?? [];
  return katalog.APARAT_SN.filter((p) => dozwolone.includes(p.device_kind));
}

function wierszeStartowe(bay: Bay): WierszAparatu[] {
  const z = wierszeZAparatow(bay.primary_devices);
  return z.length > 0 ? z : [{ ...WIERSZ_PUSTY }];
}

function ListaDanychPrzyjetych({ dane, testid }: { dane: readonly DanaPrzyjetaWyposazenia[]; testid: string }) {
  if (dane.length === 0) return null;
  return (
    <ul data-testid={testid} className="mt-1 list-disc pl-4 text-[11px] text-scada-muted">
      {dane.map((d, i) => (
        <li key={`${d.nazwa_pl}:${i}`}>
          <span className="font-medium text-scada-text">{d.nazwa_pl}</span> — {d.powod_pl} (jakość:{' '}
          {d.jakosc === 'ESTIMATED' ? 'szacowana' : d.jakosc})
        </li>
      ))}
    </ul>
  );
}

export function EdytorWyposazeniaPola({
  bay,
  snapshot,
  stanDanych,
  danePrzyjete,
  activeCaseId,
  executeDomainOperation,
  bladStore,
}: EdytorWyposazeniaPolaProps): JSX.Element {
  const [tryb, setTryb] = useState<TrybWyposazenia>('katalog');
  const [wiersze, setWiersze] = useState<WierszAparatu[]>(() => wierszeStartowe(bay));
  const [szablonRef, setSzablonRef] = useState('');
  const [katalog, setKatalog] = useState<PozycjeKatalogu>(KATALOG_PUSTY);
  const [szablony, setSzablony] = useState<readonly CompleteMvBayTemplateSummary[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [wynik, setWynik] = useState<WyposazeniePolaOdpowiedz | null>(null);
  const [zapis, setZapis] = useState(false);
  const [otwarty, setOtwarty] = useState(false);

  useEffect(() => {
    if (!otwarty) return undefined;
    let anulowane = false;
    Promise.all([
      fetchMvApparatusTypes(),
      fetchCtTypes(),
      fetchVtTypes(),
      fetchSurgeArresterTypes(),
      fetchCompleteBayTemplates(),
    ])
      .then(([aparaty, ct, vt, ograniczniki, pola]) => {
        if (anulowane) return;
        setKatalog({ APARAT_SN: aparaty, CT: ct, VT: vt, OGRANICZNIK_SN: ograniczniki });
        setSzablony(pola);
      })
      .catch((e: unknown) => {
        if (!anulowane) setBladKatalogu(getCatalogErrorMessage(e));
      });
    return () => {
      anulowane = true;
    };
  }, [otwarty]);

  // Łącznik aparatu pola to gałąź łącznikowa TEGO pola (`Bay.equipment_refs`).
  const lacznikiPola = useMemo(() => {
    const galezie = new Map((snapshot?.branches ?? []).map((b) => [b.ref_id, b]));
    return (bay.equipment_refs ?? [])
      .map((ref) => galezie.get(ref))
      .filter(czyLacznik)
      .sort((a, b) => (a.ref_id < b.ref_id ? -1 : 1));
  }, [bay.equipment_refs, snapshot]);

  // Szablony pola tej samej funkcji (rola pola w modelu) — inne backend odrzuca.
  const szablonyPola = useMemo(
    () => szablony.filter((s) => s.bay_role === bay.bay_role),
    [bay.bay_role, szablony],
  );

  const zmienWiersz = useCallback((indeks: number, zmiana: (w: WierszAparatu) => WierszAparatu) => {
    setWiersze((p) => p.map((w, i) => (i === indeks ? zmiana(w) : w)));
  }, []);

  const gotowy =
    activeCaseId !== null && !zapis && (tryb !== 'katalog' || (wiersze.length > 0 && wiersze.every(czyWierszKompletny)));

  const onZapisz = useCallback(async () => {
    if (!activeCaseId) return;
    setZapis(true);
    setBlad(null);
    setWynik(null);
    try {
      const odpowiedz = await executeDomainOperation(
        activeCaseId,
        'set_bay_equipment',
        zbudujPayloadWyposazenia(bay.ref_id, tryb, wiersze, szablonRef),
      );
      if (!odpowiedz) {
        setBlad(bladStore?.() ?? 'Nie udało się zapisać wyposażenia pola.');
        return;
      }
      if (odpowiedz.error) {
        setBlad(odpowiedz.error);
        return;
      }
      setWynik(odpowiedz.wyposazenie_pola ?? null);
      setOtwarty(false);
    } finally {
      setZapis(false);
    }
  }, [activeCaseId, bay.ref_id, bladStore, executeDomainOperation, szablonRef, tryb, wiersze]);

  const pole = 'rounded border border-scada-border bg-white px-1.5 py-1 text-xs';

  return (
    <section data-testid="wyposazenie-pola" className="border-t border-scada-border p-3 text-xs">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-scada-muted">
        Wyposażenie pola (aparaty pierwotne)
      </h3>
      <p data-testid="wyposazenie-pola-stan" data-stan={stanDanych ?? ''} className="mt-1 text-scada-text">
        {stanDanych ? STAN_DANYCH_WYPOSAZENIA_PL[stanDanych] : 'Stan danych wyposażenia nieznany — brak modelu odczytu pola.'}
      </p>
      <ListaDanychPrzyjetych dane={danePrzyjete} testid="wyposazenie-pola-dane-przyjete" />
      {wynik ? (
        <div data-testid="wyposazenie-pola-wynik" data-stan={wynik.stan_danych} className="mt-1">
          <p>Zapisano. {STAN_DANYCH_WYPOSAZENIA_PL[wynik.stan_danych]}.</p>
          <ListaDanychPrzyjetych dane={wynik.dane_przyjete} testid="wyposazenie-pola-wynik-dane-przyjete" />
        </div>
      ) : null}

      {!otwarty ? (
        <button
          type="button"
          data-testid="wyposazenie-pola-edytuj"
          className="mt-2 rounded border border-scada-accent px-2 py-1 text-scada-accent"
          onClick={() => {
            // Każde otwarcie startuje od BIEŻĄCEGO rekordu pola (po zapisie migawka niesie
            // nowe aparaty) — nigdy od wierszy poprzedniej, zamkniętej edycji.
            setWiersze(wierszeStartowe(bay));
            setTryb('katalog');
            setSzablonRef('');
            setBlad(null);
            setOtwarty(true);
          }}
        >
          Zmień wyposażenie
        </button>
      ) : (
        <>
          <label className="mt-2 flex items-center gap-2">
            <span>Sposób ustawienia</span>
            <select
              data-testid="wyposazenie-pola-tryb"
              className={pole}
              value={tryb}
              onChange={(e) => setTryb(e.target.value as TrybWyposazenia)}
            >
              {TRYBY.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.etykieta}
                </option>
              ))}
            </select>
          </label>
          {bladKatalogu ? (
            <p data-testid="wyposazenie-pola-blad-katalogu" className="mt-1 text-sygnal-uwaga-tusz">
              {bladKatalogu}
            </p>
          ) : null}

          {tryb === 'katalog' ? (
            <div className="mt-2 space-y-2">
              {wiersze.map((w, i) => {
                const pozycje = w.kind ? pozycjeDlaWiersza(katalog, w.kind) : [];
                const maKatalog = w.kind !== '' && PRZESTRZEN_KATALOGU_APARATU[w.kind] !== null;
                return (
                  <div key={i} data-testid={`wyposazenie-pola-aparat-${i}`} className="flex flex-wrap items-center gap-1.5">
                    <select
                      aria-label={`Rodzaj aparatu ${i + 1}`}
                      data-testid={`wyposazenie-pola-aparat-${i}-rodzaj`}
                      className={pole}
                      value={w.kind}
                      onChange={(e) => zmienWiersz(i, (x) => zmienRodzaj(x, e.target.value as RodzajAparatuPolaSn | ''))}
                    >
                      <option value="">— rodzaj aparatu —</option>
                      {RODZAJE_APARATU_POLA_SN.map((k) => (
                        <option key={k} value={k}>
                          {NAZWA_RODZAJU_APARATU_PL[k]}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Umiejscowienie aparatu ${i + 1}`}
                      data-testid={`wyposazenie-pola-aparat-${i}-umiejscowienie`}
                      className={pole}
                      value={w.placement}
                      onChange={(e) => zmienWiersz(i, (x) => ({ ...x, placement: e.target.value as WierszAparatu['placement'] }))}
                    >
                      <option value="">— umiejscowienie w torze —</option>
                      {UMIEJSCOWIENIA.map((u) => (
                        <option key={u} value={u}>
                          {UMIEJSCOWIENIE_PL[u]}
                        </option>
                      ))}
                    </select>
                    {maKatalog ? (
                      <select
                        aria-label={`Pozycja katalogowa aparatu ${i + 1}`}
                        data-testid={`wyposazenie-pola-aparat-${i}-katalog`}
                        className={pole}
                        value={w.catalog_ref}
                        onChange={(e) => zmienWiersz(i, (x) => ({ ...x, catalog_ref: e.target.value }))}
                      >
                        <option value="">— pozycja katalogowa —</option>
                        {pozycje.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : w.kind ? (
                      <span data-testid={`wyposazenie-pola-aparat-${i}-bez-katalogu`} className="text-scada-muted">
                        bez katalogu SN — wartość robocza
                      </span>
                    ) : null}
                    {w.kind && RODZAJE_Z_GALEZIA.includes(w.kind) ? (
                      <select
                        aria-label={`Łącznik modelu aparatu ${i + 1}`}
                        data-testid={`wyposazenie-pola-aparat-${i}-lacznik`}
                        className={pole}
                        value={w.linked_ref}
                        onChange={(e) => zmienWiersz(i, (x) => ({ ...x, linked_ref: e.target.value }))}
                      >
                        <option value="">— łącznik modelu (brak) —</option>
                        {lacznikiPola.map((l) => (
                          <option key={l.ref_id} value={l.ref_id}>
                            {l.name || l.ref_id}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {w.kind && RODZAJE_Z_ROLA_UZIEMIENIA.includes(w.kind) ? (
                      <select
                        aria-label={`Rola uziemienia aparatu ${i + 1}`}
                        data-testid={`wyposazenie-pola-aparat-${i}-uziemienie`}
                        className={pole}
                        value={w.earthing_role}
                        onChange={(e) => zmienWiersz(i, (x) => ({ ...x, earthing_role: e.target.value as RolaUziemnika | '' }))}
                      >
                        <option value="">— rola uziemienia (niezadeklarowana) —</option>
                        {ROLE_UZIEMNIKA.map((r) => (
                          <option key={r} value={r}>
                            {ETYKIETA_PL_ROLI_UZIEMNIKA[r]}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <input
                      aria-label={`Oznaczenie aparatu ${i + 1}`}
                      data-testid={`wyposazenie-pola-aparat-${i}-oznaczenie`}
                      className={`${pole} w-16`}
                      placeholder="np. Q1"
                      value={w.designation}
                      onChange={(e) => zmienWiersz(i, (x) => ({ ...x, designation: e.target.value }))}
                    />
                    <button
                      type="button"
                      data-testid={`wyposazenie-pola-aparat-${i}-usun`}
                      className="text-scada-muted underline"
                      onClick={() => setWiersze((p) => p.filter((_, j) => j !== i))}
                    >
                      Usuń
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                data-testid="wyposazenie-pola-dodaj"
                className="text-scada-accent underline"
                onClick={() => setWiersze((p) => [...p, { ...WIERSZ_PUSTY }])}
              >
                Dodaj aparat
              </button>
            </div>
          ) : null}

          {tryb === 'szablon' ? (
            <label className="mt-2 flex flex-wrap items-center gap-2">
              <span>Szablon pola</span>
              <select
                data-testid="wyposazenie-pola-szablon"
                className={pole}
                value={szablonRef}
                onChange={(e) => setSzablonRef(e.target.value)}
              >
                <option value="">
                  {bay.bay_template_ref
                    ? `— szablon zapisany w polu (${bay.bay_template_ref}) —`
                    : '— pole nie ma szablonu: wskaż szablon —'}
                </option>
                {szablonyPola.map((s) => (
                  <option key={s.template_ref} value={s.template_ref}>
                    {s.template_name_pl ?? s.template_ref}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {tryb === 'wyczysc' ? (
            <p className="mt-2 text-scada-muted">
              Pole zostanie bez aparatów pierwotnych (stan „brak danych"). Łączniki gałęzi pola zostają w modelu.
            </p>
          ) : null}

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              data-testid="wyposazenie-pola-zapisz"
              className="rounded border border-scada-accent px-2 py-1 text-scada-accent disabled:opacity-50"
              disabled={!gotowy}
              onClick={() => void onZapisz()}
            >
              Zapisz wyposażenie
            </button>
            <button
              type="button"
              data-testid="wyposazenie-pola-anuluj"
              className="text-scada-muted underline"
              disabled={zapis}
              onClick={() => {
                setOtwarty(false);
                setBlad(null);
              }}
            >
              Anuluj
            </button>
            {!activeCaseId ? <span className="text-scada-muted">Wybierz aktywny zakres obliczeń.</span> : null}
          </div>
          {blad ? (
            <p data-testid="wyposazenie-pola-blad" role="alert" className="mt-1 text-sygnal-blokada-tusz">
              {blad}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
