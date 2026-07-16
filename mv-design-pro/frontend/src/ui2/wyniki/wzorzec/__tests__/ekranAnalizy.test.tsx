import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { EkranAnalizy } from '../EkranAnalizy';
import { WZORZEC_STRINGS } from '../strings';
import { INSPECTOR_STRINGS, znacznikNieaktualne } from '../../../inspector';
import { propsFixture } from './fixtures';

describe('EkranAnalizy — 4 sekcje z propsów (karta §3 kryterium 1)', () => {
  it('sekcja 1: nagłówek z nazwą analizy PL', () => {
    render(<EkranAnalizy {...propsFixture()} />);
    const naglowek = screen.getByTestId('mvd-wyn-naglowek');
    expect(within(naglowek).getByText('Analiza testowa')).toBeInTheDocument();
  });

  it('sekcja 2: ZAŁOŻENIA (domyślnie rozwinięte, z listą)', () => {
    render(<EkranAnalizy {...propsFixture()} />);
    expect(screen.getByTestId('mvd-wyn-zalozenia')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-wyn-zalozenia-lista')).toBeInTheDocument();
    expect(screen.getByText('Moc bazowa')).toBeInTheDocument();
  });

  it('sekcja 3: TABELA wyników z wierszami', () => {
    render(<EkranAnalizy {...propsFixture()} />);
    expect(screen.getByTestId('mvd-wyn-tabela')).toBeInTheDocument();
    expect(screen.getAllByTestId('mvd-wyn-wiersz')).toHaveLength(3);
  });

  it('sekcja 4: WYKRES renderowany ze slotu, brak slotu → brak sekcji', () => {
    const { rerender } = render(
      <EkranAnalizy {...propsFixture({ wykres: <div data-testid="moj-wykres" /> })} />,
    );
    const sekcja = screen.getByTestId('mvd-wyn-wykres');
    expect(within(sekcja).getByTestId('moj-wykres')).toBeInTheDocument();
    rerender(<EkranAnalizy {...propsFixture()} />);
    expect(screen.queryByTestId('mvd-wyn-wykres')).not.toBeInTheDocument();
  });
});

describe('EkranAnalizy — stany pusty / nieaktualny (karta §3 kryterium 1)', () => {
  it('stan pusty: zero wierszy → komunikat braku wyników', () => {
    render(<EkranAnalizy {...propsFixture({ wiersze: [] })} />);
    expect(screen.getByTestId('mvd-wyn-tabela-pusta')).toHaveTextContent(
      WZORZEC_STRINGS.brakWynikow,
    );
    // Założenia nadal widoczne — kontekst pozostaje częścią ekranu.
    expect(screen.getByTestId('mvd-wyn-zalozenia')).toBeInTheDocument();
  });

  it('stan nieaktualny: rewizjaDanych < rewizjaModelu → FreshnessBadge „nieaktualne" + Przelicz', () => {
    const onPrzelicz = vi.fn();
    render(
      <EkranAnalizy
        {...propsFixture({
          naglowek: { analizaPL: 'Analiza testowa', rewizjaModelu: 5, rewizjaDanych: 3 },
          onPrzelicz,
        })}
      />,
    );
    expect(screen.getByText(znacznikNieaktualne(3, 5))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: INSPECTOR_STRINGS.przelicz })).toBeInTheDocument();
  });

  it('stan aktualny: rewizje równe → znacznik „aktualne" (JEDYNY FreshnessBadge)', () => {
    render(
      <EkranAnalizy
        {...propsFixture({
          naglowek: { analizaPL: 'Analiza testowa', rewizjaModelu: 5, rewizjaDanych: 5 },
        })}
      />,
    );
    expect(screen.getByText(INSPECTOR_STRINGS.aktualne)).toBeInTheDocument();
  });

  it('brak rewizji w nagłówku → brak znacznika świeżości (bez zgadywania)', () => {
    render(<EkranAnalizy {...propsFixture()} />);
    expect(screen.queryByText(INSPECTOR_STRINGS.aktualne)).not.toBeInTheDocument();
  });
});

describe('EkranAnalizy — identyfikatory i akcje (§2.7)', () => {
  it('runId ukryty w trybie podstawowym, widoczny w eksperckim', () => {
    const { rerender } = render(
      <EkranAnalizy
        {...propsFixture({
          naglowek: { analizaPL: 'Analiza testowa', runId: 'run-77' },
          trybZaawansowania: 'basic',
        })}
      />,
    );
    expect(screen.queryByTestId('mvd-wyn-run-id')).not.toBeInTheDocument();
    rerender(
      <EkranAnalizy
        {...propsFixture({
          naglowek: { analizaPL: 'Analiza testowa', runId: 'run-77' },
          trybZaawansowania: 'expert',
        })}
      />,
    );
    expect(screen.getByTestId('mvd-wyn-run-id')).toHaveTextContent('run-77');
  });

  it('onEksport podany → przycisk eksportu woła callback; brak → brak przycisku', () => {
    const onEksport = vi.fn();
    const { rerender } = render(<EkranAnalizy {...propsFixture({ onEksport })} />);
    const przycisk = screen.getByRole('button', { name: WZORZEC_STRINGS.eksport });
    przycisk.click();
    expect(onEksport).toHaveBeenCalledTimes(1);
    rerender(<EkranAnalizy {...propsFixture()} />);
    expect(screen.queryByRole('button', { name: WZORZEC_STRINGS.eksport })).not.toBeInTheDocument();
  });
});
