/**
 * D4 (RECENZJA_DER_SN_DOBORY_2026-07, 12+13+BOM): panel wyników po zapisie kreatora
 * OZE — status auto-biegu (rozpływ + zwarcia), raport zgodności ✓/⚠/❌ (wymaganie 13)
 * i lista materiałowa toru (BOM).
 *
 * Komponent PREZENTACYJNY: wszystkie liczby, werdykty i komunikaty pochodzą 1:1 z
 * backendu (ZERO fizyki w UI). Stany braków są uczciwe (raport/BOM dotyczą toru DER-SN).
 */

import type { RunStatus } from '../../../ui/study-cases/types';
import { KreatorInfo, KreatorSekcja } from '../rama';
import type { ListaMaterialowa, RaportZgodnosci, StatusPozycji } from './podsumowanieApi';
import { PODSUMOWANIE_STRINGS as T } from './strings';

const IKONA_STATUSU: Record<StatusPozycji, string> = {
  PASS: '✓',
  WARN: '⚠️',
  FAIL: '❌',
};

function statusBiegu(status: RunStatus | null): { tekst: string; ton: 'ok' | 'warn' | 'blad' } {
  if (status === 'DONE') return { tekst: T.statusDone, ton: 'ok' };
  if (status === 'FAILED') return { tekst: T.statusFailed, ton: 'blad' };
  if (status === 'RUNNING' || status === 'PENDING') return { tekst: T.statusRunning, ton: 'warn' };
  return { tekst: T.statusPominiety, ton: 'warn' };
}

function werdyktEtykieta(werdykt: RaportZgodnosci['werdykt']): { tekst: string; ton: string } {
  if (werdykt === 'ZGODNY') return { tekst: T.raportZgodny, ton: 'ok' };
  if (werdykt === 'ZGODNY_Z_UWAGAMI') return { tekst: T.raportZUwagami, ton: 'warn' };
  return { tekst: T.raportNiezgodny, ton: 'blad' };
}

function formatujParametry(parametry: Readonly<Record<string, unknown>>): string {
  return Object.entries(parametry)
    .map(([klucz, wartosc]) => `${klucz}: ${String(wartosc)}`)
    .join(' · ');
}

export interface PodsumowanieAutoBiegProps {
  readonly runStatus: RunStatus | null;
  readonly autoBieg: boolean;
  readonly raport: RaportZgodnosci | null;
  readonly bom: ListaMaterialowa | null;
  readonly onOtworzDokumentacje: () => void;
  readonly onZakoncz: () => void;
}

export function PodsumowanieAutoBieg({
  runStatus,
  autoBieg,
  raport,
  bom,
  onOtworzDokumentacje,
  onZakoncz,
}: PodsumowanieAutoBiegProps) {
  const bieg = statusBiegu(autoBieg ? runStatus : null);

  return (
    <div className="mvd-oze-podsumowanie" data-testid="mvd-kreator-oze-podsumowanie">
      <KreatorSekcja tytul={T.statusTytul} testid="mvd-kreator-oze-status-biegu">
        <p className="mvd-oze-status" data-ton={bieg.ton} data-testid="mvd-kreator-oze-status-tekst">
          {bieg.tekst}
        </p>
      </KreatorSekcja>

      <KreatorSekcja tytul={T.raportTytul} testid="mvd-kreator-oze-raport">
        {raport ? (
          <>
            <p
              className="mvd-oze-werdykt"
              data-ton={werdyktEtykieta(raport.werdykt).ton}
              data-testid="mvd-kreator-oze-werdykt"
            >
              {werdyktEtykieta(raport.werdykt).tekst}
            </p>
            {raport.komunikat_krytyczny ? (
              <p className="mvd-oze-krytyczny" data-testid="mvd-kreator-oze-krytyczny">
                {raport.komunikat_krytyczny}
              </p>
            ) : null}
            <p className="mvd-oze-raport-podsum" data-testid="mvd-kreator-oze-raport-podsum">
              {T.raportPodsumowanie(
                raport.podsumowanie.pass,
                raport.podsumowanie.warn,
                raport.podsumowanie.fail,
              )}
            </p>
            <ul className="mvd-oze-checklista" data-testid="mvd-kreator-oze-checklista">
              {raport.pozycje.map((pozycja) => (
                <li
                  key={pozycja.check_id}
                  className="mvd-oze-check"
                  data-status={pozycja.status}
                  data-testid={`mvd-kreator-oze-check-${pozycja.check_id}`}
                >
                  <span className="mvd-oze-check-ikona">{IKONA_STATUSU[pozycja.status]}</span>
                  <span className="mvd-oze-check-tekst">{pozycja.message_pl}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <KreatorInfo>{T.raportBrak}</KreatorInfo>
        )}
      </KreatorSekcja>

      <KreatorSekcja tytul={T.bomTytul} testid="mvd-kreator-oze-bom">
        {bom && bom.pozycje.length > 0 ? (
          <table className="mvd-oze-bom" data-testid="mvd-kreator-oze-bom-tabela">
            <thead>
              <tr>
                <th>{T.bomKolLp}</th>
                <th>{T.bomKolElement}</th>
                <th>{T.bomKolTyp}</th>
                <th>{T.bomKolParametry}</th>
                <th>{T.bomKolIlosc}</th>
              </tr>
            </thead>
            <tbody>
              {bom.pozycje.map((pozycja) => (
                <tr key={pozycja.ref_id ?? `${pozycja.kategoria}-${pozycja.lp}`}>
                  <td>{pozycja.lp}</td>
                  <td>{pozycja.element}</td>
                  <td>{pozycja.catalog_ref ?? '—'}</td>
                  <td>{formatujParametry(pozycja.parametry)}</td>
                  <td>
                    {pozycja.ilosc ?? '—'} {pozycja.jednostka}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <KreatorInfo>{T.bomBrak}</KreatorInfo>
        )}
      </KreatorSekcja>

      <div className="mvd-oze-podsumowanie-akcje">
        <button
          type="button"
          className="mvd-oze-akcja"
          onClick={onOtworzDokumentacje}
          data-testid="mvd-kreator-oze-otworz-dokumentacje"
        >
          {T.otworzDokumentacje}
        </button>
        <button
          type="button"
          className="mvd-oze-akcja mvd-oze-akcja-glowna"
          onClick={onZakoncz}
          data-testid="mvd-kreator-oze-zakoncz"
        >
          {T.zakoncz}
        </button>
      </div>
    </div>
  );
}
