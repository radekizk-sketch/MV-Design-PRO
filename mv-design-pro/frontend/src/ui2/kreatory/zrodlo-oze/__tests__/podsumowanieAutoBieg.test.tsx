/**
 * D4: testy pomocnika łączenia statusu auto-biegu + panelu podsumowania
 * (raport zgodności ✓/⚠/❌ + BOM). Prezentacja danych backendu 1:1, ZERO fizyki.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PodsumowanieAutoBieg } from '../PodsumowanieAutoBieg';
import { polaczStatusBiegu, type ListaMaterialowa, type RaportZgodnosci } from '../podsumowanieApi';

afterEach(() => cleanup());

describe('polaczStatusBiegu', () => {
  it('pusta lista → null (auto-bieg wyłączony)', () => {
    expect(polaczStatusBiegu([])).toBeNull();
  });
  it('wszystkie DONE → DONE', () => {
    expect(polaczStatusBiegu(['DONE', 'DONE'])).toBe('DONE');
  });
  it('dowolny FAILED → FAILED', () => {
    expect(polaczStatusBiegu(['DONE', 'FAILED'])).toBe('FAILED');
  });
  it('częściowo w toku → RUNNING', () => {
    expect(polaczStatusBiegu(['DONE', 'RUNNING'])).toBe('RUNNING');
  });
});

const RAPORT: RaportZgodnosci = {
  wersja: '1.0',
  source_ref: 'gen-1',
  source_name: 'Blok PV SN',
  werdykt: 'NIEZGODNY',
  komunikat_krytyczny: 'Nie można wygenerować projektu.',
  pozycje: [
    {
      check_id: 'moc_transformatora',
      kategoria: 'walidacja_D1',
      status: 'FAIL',
      code: 'converter.der_sn.moc_transformatora_niewystarczajaca',
      message_pl: '❌ Moc transformatora jest niewystarczająca (ΣS=1 MVA > dopuszczalne 0.1 MVA).',
    },
  ],
  podsumowanie: { pass: 0, warn: 0, fail: 1, razem: 1 },
};

const BOM: ListaMaterialowa = {
  wersja: '1.0',
  source_ref: 'gen-1',
  source_name: 'Blok PV SN',
  pozycje: [
    {
      lp: 1,
      kategoria: 'kabel_sn',
      element: 'Kabel SN przyłączeniowy',
      catalog_ref: 'cable-x',
      ref_id: 'cab-1',
      parametry: { przekroj_mm2: 50, dlugosc_km: 0.05 },
      ilosc: 0.05,
      jednostka: 'km',
    },
  ],
  count: 1,
  braki_ogniw: [],
};

describe('PodsumowanieAutoBieg', () => {
  it('błąd krytyczny D1: werdykt niezgodny + komunikat kanonu + komunikat 1:1', () => {
    render(
      <PodsumowanieAutoBieg
        runStatus="FAILED"
        autoBieg
        raport={RAPORT}
        bom={BOM}
        onOtworzDokumentacje={() => {}}
        onZakoncz={() => {}}
      />,
    );
    expect(screen.getByTestId('mvd-kreator-oze-werdykt')).toHaveTextContent('Projekt niezgodny');
    expect(screen.getByTestId('mvd-kreator-oze-krytyczny')).toHaveTextContent(
      'Nie można wygenerować projektu.',
    );
    expect(screen.getByTestId('mvd-kreator-oze-check-moc_transformatora')).toHaveTextContent(
      '❌ Moc transformatora jest niewystarczająca',
    );
    expect(screen.getByTestId('mvd-kreator-oze-bom-tabela')).toHaveTextContent('Kabel SN przyłączeniowy');
    expect(screen.getByTestId('mvd-kreator-oze-status-tekst')).toHaveTextContent('nieudany');
  });

  it('brak toru DER-SN: uczciwe stany zerowe raportu i BOM', () => {
    render(
      <PodsumowanieAutoBieg
        runStatus="DONE"
        autoBieg
        raport={null}
        bom={null}
        onOtworzDokumentacje={() => {}}
        onZakoncz={() => {}}
      />,
    );
    expect(screen.queryByTestId('mvd-kreator-oze-werdykt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-kreator-oze-bom-tabela')).not.toBeInTheDocument();
  });

  it('akcje: Otwórz Dokumentację i Zakończ wywołują realne callbacki', async () => {
    const otworz = vi.fn();
    const zakoncz = vi.fn();
    render(
      <PodsumowanieAutoBieg
        runStatus="DONE"
        autoBieg
        raport={RAPORT}
        bom={BOM}
        onOtworzDokumentacje={otworz}
        onZakoncz={zakoncz}
      />,
    );
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-otworz-dokumentacje'));
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-zakoncz'));
    expect(otworz).toHaveBeenCalledTimes(1);
    expect(zakoncz).toHaveBeenCalledTimes(1);
  });
});
