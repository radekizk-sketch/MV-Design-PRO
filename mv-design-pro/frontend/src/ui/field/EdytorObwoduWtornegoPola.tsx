/**
 * Edytor obwodu wtórnego przekładników pola SN (karta pola, ekran E-11).
 *
 * Jedyny dostawca operacji `set_measurement_secondary_circuit` w interfejsie: poprawka
 * obwodu wtórnego CT/VT JUŻ ISTNIEJĄCEGO przekładnika (długość i przekrój przewodu, obciążenia
 * aparatów, moc styków, uzwojenie VT) albo jego usunięcie. Bez tej drogi obwód wpisany w
 * kreatorze stacji byłby zapisem jednokrotnym — błąd długości przewodu dałoby się poprawić
 * tylko usunięciem i ponownym utworzeniem przekładnika. Model edytora: `obwodWtornyPola.ts`.
 * Odmowę operacji pokazuje zdaniem z backendu; ZERO fizyki w UI.
 */
import { useState } from 'react';

import type { DomainOpResponseV1, EnergyNetworkModel, Measurement } from '../../types/enm';
import {
  formularzZPrzekladnika,
  opisObwodu,
  przekladnikiPola,
  UZWOJENIE_VT_PL,
  walidujObwod,
  zbudujPayloadObwodu,
  zbudujPayloadUsunieciaObwodu,
  type FormularzObwodu,
  type UzwojenieVt,
} from './obwodWtornyPola';

export interface EdytorObwoduWtornegoPolaProps {
  readonly bayRef: string;
  readonly snapshot: EnergyNetworkModel | null;
  readonly activeCaseId: string | null;
  readonly executeDomainOperation: (
    caseId: string,
    opName: string,
    payload: Record<string, unknown>,
  ) => Promise<DomainOpResponseV1 | null>;
  readonly bladStore?: () => string | null;
}

const POLE = 'rounded border border-scada-border bg-white px-1.5 py-1 text-xs';

function wartoscLiczbowa(tekst: string): number | null {
  if (!tekst.trim()) return null;
  const v = Number(tekst.replace(',', '.'));
  return Number.isFinite(v) ? v : Number.NaN;
}

function PoleLiczby({
  etykieta,
  jednostka,
  wartosc,
  onZmiana,
  testid,
}: {
  readonly etykieta: string;
  readonly jednostka: string;
  readonly wartosc: number | null;
  readonly onZmiana: (v: number | null) => void;
  readonly testid: string;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span>{etykieta}</span>
      <input
        type="number"
        step="any"
        aria-label={etykieta}
        data-testid={testid}
        className={`${POLE} w-24`}
        value={wartosc === null || Number.isNaN(wartosc) ? '' : String(wartosc)}
        onChange={(e) => onZmiana(wartoscLiczbowa(e.target.value))}
      />
      <span className="text-scada-muted">{jednostka}</span>
    </label>
  );
}

export function EdytorObwoduWtornegoPola({
  bayRef,
  snapshot,
  activeCaseId,
  executeDomainOperation,
  bladStore,
}: EdytorObwoduWtornegoPolaProps): JSX.Element | null {
  const przekladniki = przekladnikiPola(snapshot, bayRef);
  const [edytowany, setEdytowany] = useState<string | null>(null);
  const [formularz, setFormularz] = useState<FormularzObwodu | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [zapis, setZapis] = useState(false);

  if (przekladniki.length === 0) return null;

  const otworz = (m: Measurement) => {
    setEdytowany(m.ref_id);
    setFormularz(formularzZPrzekladnika(m));
    setBlad(null);
  };
  const zamknij = () => {
    setEdytowany(null);
    setFormularz(null);
  };

  const wykonaj = async (payload: Record<string, unknown>) => {
    if (!activeCaseId) return;
    setZapis(true);
    setBlad(null);
    try {
      const odpowiedz = await executeDomainOperation(activeCaseId, 'set_measurement_secondary_circuit', payload);
      if (!odpowiedz) {
        setBlad(bladStore?.() ?? 'Nie udało się zapisać obwodu wtórnego przekładnika.');
        return;
      }
      if (odpowiedz.error) {
        setBlad(odpowiedz.error);
        return;
      }
      zamknij();
    } finally {
      setZapis(false);
    }
  };

  const zmien = (zmiana: Partial<FormularzObwodu>) => setFormularz((p) => (p ? { ...p, ...zmiana } : p));

  return (
    <section data-testid="obwod-wtorny-pola" className="border-t border-scada-border p-3 text-xs">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-scada-muted">
        Obwody wtórne przekładników
      </h3>
      <p className="mt-1 text-scada-muted">
        Przewód od zacisków wtórnych do aparatów i ich pobór mocy — dane bilansu obciążenia
        przekładnika (nasycenie CT, spadek napięcia VT).
      </p>
      <ul className="mt-2 space-y-2">
        {przekladniki.map((m) => {
          const otwarty = edytowany === m.ref_id && formularz !== null;
          const bledy = otwarty ? walidujObwod(formularz) : [];
          return (
            <li key={m.ref_id} data-testid={`obwod-wtorny-${m.ref_id}`} className="rounded border border-scada-border/60 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-scada-text">
                  {m.measurement_type === 'CT' ? 'Przekładnik prądowy' : 'Przekładnik napięciowy'} {m.name || m.ref_id}
                </span>
                {!otwarty ? (
                  <button
                    type="button"
                    data-testid={`obwod-wtorny-${m.ref_id}-edytuj`}
                    className="rounded border border-scada-accent px-2 py-0.5 text-scada-accent"
                    onClick={() => otworz(m)}
                  >
                    Edytuj obwód wtórny
                  </button>
                ) : null}
              </div>
              <p data-testid={`obwod-wtorny-${m.ref_id}-opis`} className="mt-0.5 text-scada-muted">
                {opisObwodu(m)}
              </p>
              {otwarty ? (
                <div className="mt-2 space-y-2" data-testid={`obwod-wtorny-${m.ref_id}-formularz`}>
                  <div className="flex flex-wrap gap-3">
                    <PoleLiczby
                      etykieta="Długość przewodu (w jedną stronę)"
                      jednostka="m"
                      wartosc={formularz.dlugosc_m}
                      onZmiana={(v) => zmien({ dlugosc_m: v })}
                      testid={`obwod-wtorny-${m.ref_id}-dlugosc`}
                    />
                    <PoleLiczby
                      etykieta="Przekrój przewodu"
                      jednostka="mm²"
                      wartosc={formularz.przekroj_mm2}
                      onZmiana={(v) => zmien({ przekroj_mm2: v })}
                      testid={`obwod-wtorny-${m.ref_id}-przekroj`}
                    />
                    <PoleLiczby
                      etykieta="Moc styków i zacisków"
                      jednostka="VA"
                      wartosc={formularz.moc_stykow_va}
                      onZmiana={(v) => zmien({ moc_stykow_va: v })}
                      testid={`obwod-wtorny-${m.ref_id}-styki`}
                    />
                    {m.measurement_type === 'VT' ? (
                      <label className="flex items-center gap-1.5">
                        <span>Uzwojenie</span>
                        <select
                          aria-label="Uzwojenie przekładnika napięciowego"
                          data-testid={`obwod-wtorny-${m.ref_id}-uzwojenie`}
                          className={POLE}
                          value={formularz.vt_uzwojenie ?? ''}
                          onChange={(e) => zmien({ vt_uzwojenie: (e.target.value || null) as UzwojenieVt | null })}
                        >
                          <option value="">— nie wskazano —</option>
                          {(Object.keys(UZWOJENIE_VT_PL) as UzwojenieVt[]).map((u) => (
                            <option key={u} value={u}>
                              {UZWOJENIE_VT_PL[u]}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <div className="text-scada-muted">Aparaty w obwodzie (przekaźnik, licznik, wskaźnik)</div>
                    {formularz.obciazenia.map((w, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-1.5" data-testid={`obwod-wtorny-${m.ref_id}-aparat-${i}`}>
                        <input
                          type="text"
                          aria-label={`Nazwa aparatu ${i + 1}`}
                          data-testid={`obwod-wtorny-${m.ref_id}-aparat-${i}-nazwa`}
                          className={POLE}
                          value={w.nazwa}
                          onChange={(e) =>
                            zmien({ obciazenia: formularz.obciazenia.map((x, j) => (j === i ? { ...x, nazwa: e.target.value } : x)) })
                          }
                        />
                        <PoleLiczby
                          etykieta="Pobór"
                          jednostka="VA"
                          wartosc={w.moc_va}
                          onZmiana={(v) =>
                            zmien({ obciazenia: formularz.obciazenia.map((x, j) => (j === i ? { ...x, moc_va: v } : x)) })
                          }
                          testid={`obwod-wtorny-${m.ref_id}-aparat-${i}-moc`}
                        />
                        <button
                          type="button"
                          data-testid={`obwod-wtorny-${m.ref_id}-aparat-${i}-usun`}
                          className="text-scada-muted underline"
                          onClick={() => zmien({ obciazenia: formularz.obciazenia.filter((_, j) => j !== i) })}
                        >
                          Usuń aparat
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      data-testid={`obwod-wtorny-${m.ref_id}-dodaj-aparat`}
                      className="text-scada-accent underline"
                      onClick={() => zmien({ obciazenia: [...formularz.obciazenia, { nazwa: '', moc_va: null }] })}
                    >
                      Dodaj aparat
                    </button>
                  </div>
                  {bledy.length > 0 ? (
                    <ul data-testid={`obwod-wtorny-${m.ref_id}-bledy`} className="list-disc pl-4 text-sygnal-uwaga-tusz">
                      {bledy.map((b) => (
                        <li key={`${b.pole}:${b.komunikat}`}>{b.komunikat}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-testid={`obwod-wtorny-${m.ref_id}-zapisz`}
                      className="rounded bg-scada-accent px-2 py-1 text-white disabled:opacity-50"
                      disabled={zapis || bledy.length > 0 || !activeCaseId}
                      onClick={() => void wykonaj(zbudujPayloadObwodu(m, formularz))}
                    >
                      Zapisz obwód wtórny
                    </button>
                    {m.obwod_wtorny ? (
                      <button
                        type="button"
                        data-testid={`obwod-wtorny-${m.ref_id}-usun-obwod`}
                        className="rounded border border-scada-border px-2 py-1 disabled:opacity-50"
                        disabled={zapis || !activeCaseId}
                        onClick={() => void wykonaj(zbudujPayloadUsunieciaObwodu(m))}
                      >
                        Usuń obwód wtórny
                      </button>
                    ) : null}
                    <button
                      type="button"
                      data-testid={`obwod-wtorny-${m.ref_id}-anuluj`}
                      className="rounded border border-scada-border px-2 py-1"
                      onClick={zamknij}
                    >
                      Anuluj
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {blad ? (
        <p data-testid="obwod-wtorny-blad" className="mt-2 text-sygnal-uwaga-tusz">
          {blad}
        </p>
      ) : null}
    </section>
  );
}
