/*
 * Wspólne elementy okna „Archiwum projektu (ZIP)": wiersz klucz–wartość, lista
 * komunikatów backendu, zapis pobranego pliku i raport wyniku odtworzenia
 * projektu. Raport jest JEDEN dla importu pełnego i importu paczki zmian —
 * obie końcówki zapisują nowy projekt tą samą drogą backendu
 * (`ProjectArchiveService._przywroc_archiwum`) i zwracają ten sam kształt wyniku.
 */

import type { ReactNode } from 'react';

import type { WynikImportu } from './api';
import { ARCHIWUM_STRINGS as T } from './strings';

/** Zapisz treść odpowiedzi jako plik do pobrania (mechanika przeglądarkowa). */
export function zapiszBlob(blob: Blob, nazwa: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nazwa;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Wiersz klucz–wartość podglądu/raportu. */
export function Wiersz({ etykieta, wartosc }: { etykieta: string; wartosc: string }) {
  return (
    <div className="mvd-arch-kv">
      <span className="mvd-arch-kv-k">{etykieta}</span>
      <span className="mvd-arch-kv-v mvd-num">{wartosc}</span>
    </div>
  );
}

/** Lista komunikatów backendu (ostrzeżenia / błędy / elementy bez typu). */
export function ListaKomunikatow({
  tytul,
  pozycje,
  testid,
  wariant,
}: {
  tytul: string;
  pozycje: readonly string[];
  testid: string;
  wariant: 'warn' | 'err';
}) {
  if (pozycje.length === 0) return null;
  return (
    <div className="mvd-arch-komunikaty" data-wariant={wariant} data-testid={testid}>
      <span className="mvd-arch-meta-k">{tytul}</span>
      <ul>
        {pozycje.map((tekst) => (
          <li key={tekst}>{tekst}</li>
        ))}
      </ul>
    </div>
  );
}

/** Zdanie werdyktu dla statusu importu (uczciwie, wprost z odpowiedzi). */
export function werdyktImportu(wynik: WynikImportu): {
  tekst: string;
  wariant: 'ok' | 'warn' | 'err';
} {
  if (wynik.status === 'SUCCESS') return { tekst: T.raportSukces, wariant: 'ok' };
  if (wynik.status === 'PARTIAL') return { tekst: T.raportCzesciowy, wariant: 'warn' };
  if (wynik.status === 'CATALOG_MAPPING_REQUIRED') {
    return { tekst: T.raportBramkaKatalogu, wariant: 'warn' };
  }
  return { tekst: T.raportNiepowodzenie, wariant: 'err' };
}

/**
 * Raport wyniku odtworzenia projektu (import pełny albo paczka zmian).
 * `prefiks` rozróżnia identyfikatory testowe obu ścieżek na jednym ekranie.
 */
export function RaportImportu({
  wynik,
  prefiks,
  onOtworz,
  onPonow,
  children,
}: {
  wynik: WynikImportu;
  prefiks: string;
  onOtworz: () => void;
  onPonow: () => void;
  children?: ReactNode;
}) {
  const werdykt = werdyktImportu(wynik);
  return (
    <div className="mvd-arch-raport" data-wariant={werdykt.wariant} data-testid={`${prefiks}-raport`}>
      <span className="mvd-arch-meta-k">{T.raportTytul}</span>
      <p className="mvd-arch-werdykt" role="status">
        {werdykt.tekst}
      </p>
      {wynik.migrated_from_version || children ? (
        <div className="mvd-arch-kv-siatka">
          {wynik.migrated_from_version ? (
            <Wiersz etykieta={T.raportMigracja} wartosc={wynik.migrated_from_version} />
          ) : null}
          {children}
        </div>
      ) : null}
      <ListaKomunikatow
        tytul={T.raportOstrzezenia}
        pozycje={wynik.warnings}
        testid={`${prefiks}-ostrzezenia`}
        wariant="warn"
      />
      <ListaKomunikatow
        tytul={T.raportBledy}
        pozycje={wynik.errors}
        testid={`${prefiks}-bledy`}
        wariant="err"
      />
      <ListaKomunikatow
        tytul={T.raportBezKatalogu}
        pozycje={wynik.elements_without_catalog ?? []}
        testid={`${prefiks}-bez-katalogu`}
        wariant="warn"
      />
      <div className="mvd-arch-akcje">
        {wynik.project_id ? (
          <button
            type="button"
            className="mvd-btn mvd-btn-primary"
            onClick={onOtworz}
            data-testid={`${prefiks}-otworz`}
          >
            {T.raportOtworz}
          </button>
        ) : null}
        <button type="button" className="mvd-btn" onClick={onPonow} data-testid={`${prefiks}-ponow`}>
          {T.raportPonow}
        </button>
      </div>
      {wynik.project_id ? <p className="mvd-arch-nastepny">{T.raportNastepnyKrok}</p> : null}
    </div>
  );
}
