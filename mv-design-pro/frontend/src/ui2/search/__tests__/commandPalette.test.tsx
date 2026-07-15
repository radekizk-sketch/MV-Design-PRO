import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette, resetHistoriiWyszukiwania } from '../CommandPalette';
import { SEARCH_STRINGS, brakWynikowLabel, potwierdzTrybLabel } from '../strings';
import type { PozycjaWyszukiwania } from '../searchModel';

function pozycje(): PozycjaWyszukiwania[] {
  return [
    { id: 'a', etykietaPL: 'Model sieci', grupa: 'przestrzenie', akcja: vi.fn() },
    { id: 'b', etykietaPL: 'Zapisz', grupa: 'polecenia', akcja: vi.fn() },
    {
      id: 'c',
      etykietaPL: 'Eksportuj dowód do PDF',
      grupa: 'polecenia',
      trybMin: 'expert',
      akcja: vi.fn(),
    },
    { id: 'd', etykietaPL: 'Transformator T1', grupa: 'obiekty', akcja: vi.fn() },
    { id: 'e', etykietaPL: 'Przykład: GPZ', grupa: 'przyklady', akcja: vi.fn() },
    { id: 'f', etykietaPL: 'Skróty klawiszowe', grupa: 'pomoc', akcja: vi.fn() },
    { id: 'ta', etykietaPL: 'Test Aaa', grupa: 'polecenia', akcja: vi.fn() },
    { id: 'tb', etykietaPL: 'Test Bbb', grupa: 'polecenia', akcja: vi.fn() },
  ];
}

function noop() {
  /* celowo puste — domyślny handler w testach niesprawdzających wywołania */
}

describe('CommandPalette — otwarcie/zamknięcie', () => {
  beforeEach(resetHistoriiWyszukiwania);

  it('nie renderuje niczego, gdy `otwarta` = false', () => {
    render(
      <CommandPalette
        otwarta={false}
        onZamknij={noop}
        pozycje={pozycje()}
        trybAktualny="basic"
        onWykonaj={noop}
        onPrzelaczTryb={noop}
      />,
    );
    expect(screen.queryByTestId('mvd-cmdk-dialog')).not.toBeInTheDocument();
  });

  it('renderuje dialog z rolą, aria-modal i fokusuje pole tekstowe', () => {
    render(
      <CommandPalette
        otwarta
        onZamknij={noop}
        pozycje={pozycje()}
        trybAktualny="basic"
        onWykonaj={noop}
        onPrzelaczTryb={noop}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: SEARCH_STRINGS.polePlaceholder });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('mvd-cmdk-input')).toHaveFocus();
  });

  it('klik na przyciemnione tło (scrim) zamyka dialog', () => {
    const onZamknij = vi.fn();
    render(
      <CommandPalette
        otwarta
        onZamknij={onZamknij}
        pozycje={pozycje()}
        trybAktualny="basic"
        onWykonaj={noop}
        onPrzelaczTryb={noop}
      />,
    );
    fireEvent.click(screen.getByTestId('mvd-cmdk-scrim'));
    expect(onZamknij).toHaveBeenCalledTimes(1);
  });

  it('Esc zamyka dialog bez wywołania onWykonaj', () => {
    const onZamknij = vi.fn();
    const onWykonaj = vi.fn();
    render(
      <CommandPalette
        otwarta
        onZamknij={onZamknij}
        pozycje={pozycje()}
        trybAktualny="basic"
        onWykonaj={onWykonaj}
        onPrzelaczTryb={noop}
      />,
    );
    fireEvent.keyDown(screen.getByTestId('mvd-cmdk-input'), { key: 'Escape' });
    expect(onZamknij).toHaveBeenCalledTimes(1);
    expect(onWykonaj).not.toHaveBeenCalled();
  });
});

describe('CommandPalette — stany', () => {
  beforeEach(resetHistoriiWyszukiwania);

  it('pusta fraza: pokazuje podpowiedź „Zacznij pisać…"', () => {
    render(
      <CommandPalette
        otwarta
        onZamknij={noop}
        pozycje={pozycje()}
        trybAktualny="basic"
        onWykonaj={noop}
        onPrzelaczTryb={noop}
      />,
    );
    expect(screen.getByTestId('mvd-cmdk-hint')).toHaveTextContent(SEARCH_STRINGS.podpowiedzPusta);
  });

  it('brak wyników: pokazuje etykietę „Brak wyników dla „{fraza}""', () => {
    render(
      <CommandPalette
        otwarta
        onZamknij={noop}
        pozycje={pozycje()}
        trybAktualny="basic"
        onWykonaj={noop}
        onPrzelaczTryb={noop}
      />,
    );
    fireEvent.change(screen.getByTestId('mvd-cmdk-input'), { target: { value: 'qqqqqqqqq' } });
    expect(screen.getByTestId('mvd-cmdk-empty')).toHaveTextContent(brakWynikowLabel('qqqqqqqqq'));
  });
});

describe('CommandPalette — filtracja i grupowanie', () => {
  beforeEach(resetHistoriiWyszukiwania);

  it('filtruje na żywo i grupuje wyniki pod nagłówkami PL', () => {
    render(
      <CommandPalette
        otwarta
        onZamknij={noop}
        pozycje={pozycje()}
        trybAktualny="basic"
        onWykonaj={noop}
        onPrzelaczTryb={noop}
      />,
    );
    fireEvent.change(screen.getByTestId('mvd-cmdk-input'), { target: { value: 'zapisz' } });
    expect(screen.getByRole('group', { name: SEARCH_STRINGS.grupaPolecenia })).toBeInTheDocument();
    expect(screen.getByTestId('mvd-cmdk-opcja-b')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-cmdk-opcja-a')).not.toBeInTheDocument();
  });

  it('ARIA: listbox i option obecne w wynikach', () => {
    render(
      <CommandPalette
        otwarta
        onZamknij={noop}
        pozycje={pozycje()}
        trybAktualny="basic"
        onWykonaj={noop}
        onPrzelaczTryb={noop}
      />,
    );
    fireEvent.change(screen.getByTestId('mvd-cmdk-input'), { target: { value: 'zapisz' } });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Zapisz' })).toBeInTheDocument();
  });
});

describe('CommandPalette — nawigacja klawiaturą i wykonanie', () => {
  beforeEach(resetHistoriiWyszukiwania);

  it('↑↓ zmienia aria-selected aktywnej opcji', () => {
    render(
      <CommandPalette
        otwarta
        onZamknij={noop}
        pozycje={pozycje()}
        trybAktualny="basic"
        onWykonaj={noop}
        onPrzelaczTryb={noop}
      />,
    );
    const input = screen.getByTestId('mvd-cmdk-input');
    fireEvent.change(input, { target: { value: 'test' } });

    expect(screen.getByTestId('mvd-cmdk-opcja-ta')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByTestId('mvd-cmdk-opcja-tb')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('mvd-cmdk-opcja-ta')).toHaveAttribute('aria-selected', 'false');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getByTestId('mvd-cmdk-opcja-ta')).toHaveAttribute('aria-selected', 'true');
  });

  it('Enter na pozycji dostępnej w trybie aktualnym woła onWykonaj i zamyka dialog', () => {
    const onWykonaj = vi.fn();
    const onZamknij = vi.fn();
    render(
      <CommandPalette
        otwarta
        onZamknij={onZamknij}
        pozycje={pozycje()}
        trybAktualny="basic"
        onWykonaj={onWykonaj}
        onPrzelaczTryb={noop}
      />,
    );
    const input = screen.getByTestId('mvd-cmdk-input');
    fireEvent.change(input, { target: { value: 'zapisz' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onWykonaj).toHaveBeenCalledTimes(1);
    expect(onWykonaj.mock.calls[0][0]).toMatchObject({ id: 'b' });
    expect(onZamknij).toHaveBeenCalledTimes(1);
  });

  it('klik na opcję wykonuje ją tak samo jak Enter', () => {
    const onWykonaj = vi.fn();
    render(
      <CommandPalette
        otwarta
        onZamknij={noop}
        pozycje={pozycje()}
        trybAktualny="basic"
        onWykonaj={onWykonaj}
        onPrzelaczTryb={noop}
      />,
    );
    fireEvent.change(screen.getByTestId('mvd-cmdk-input'), { target: { value: 'zapisz' } });
    fireEvent.click(screen.getByTestId('mvd-cmdk-opcja-b'));
    expect(onWykonaj).toHaveBeenCalledTimes(1);
  });
});

describe('CommandPalette — przepływ trybu zaawansowania', () => {
  beforeEach(resetHistoriiWyszukiwania);

  it('Enter na pozycji o wyższym trybMin pokazuje wiersz potwierdzenia zamiast wykonania', () => {
    const onWykonaj = vi.fn();
    render(
      <CommandPalette
        otwarta
        onZamknij={noop}
        pozycje={pozycje()}
        trybAktualny="basic"
        onWykonaj={onWykonaj}
        onPrzelaczTryb={noop}
      />,
    );
    const input = screen.getByTestId('mvd-cmdk-input');
    fireEvent.change(input, { target: { value: 'eksportuj' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onWykonaj).not.toHaveBeenCalled();
    expect(screen.getByTestId('mvd-cmdk-potwierdzenie')).toHaveTextContent(potwierdzTrybLabel('expert'));
  });

  it('[Przełącz i otwórz] woła onPrzelaczTryb i onWykonaj, potem zamyka dialog', () => {
    const onWykonaj = vi.fn();
    const onPrzelaczTryb = vi.fn();
    const onZamknij = vi.fn();
    render(
      <CommandPalette
        otwarta
        onZamknij={onZamknij}
        pozycje={pozycje()}
        trybAktualny="basic"
        onWykonaj={onWykonaj}
        onPrzelaczTryb={onPrzelaczTryb}
      />,
    );
    const input = screen.getByTestId('mvd-cmdk-input');
    fireEvent.change(input, { target: { value: 'eksportuj' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByTestId('mvd-cmdk-przelacz'));
    expect(onPrzelaczTryb).toHaveBeenCalledWith('expert');
    expect(onWykonaj).toHaveBeenCalledTimes(1);
    expect(onWykonaj.mock.calls[0][0]).toMatchObject({ id: 'c' });
    expect(onZamknij).toHaveBeenCalledTimes(1);
  });

  it('[Anuluj] chowa potwierdzenie bez wywołania onWykonaj/onPrzelaczTryb', () => {
    const onWykonaj = vi.fn();
    const onPrzelaczTryb = vi.fn();
    const onZamknij = vi.fn();
    render(
      <CommandPalette
        otwarta
        onZamknij={onZamknij}
        pozycje={pozycje()}
        trybAktualny="basic"
        onWykonaj={onWykonaj}
        onPrzelaczTryb={onPrzelaczTryb}
      />,
    );
    const input = screen.getByTestId('mvd-cmdk-input');
    fireEvent.change(input, { target: { value: 'eksportuj' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByTestId('mvd-cmdk-anuluj'));
    expect(screen.queryByTestId('mvd-cmdk-potwierdzenie')).not.toBeInTheDocument();
    expect(onWykonaj).not.toHaveBeenCalled();
    expect(onPrzelaczTryb).not.toHaveBeenCalled();
    expect(onZamknij).not.toHaveBeenCalled();
  });
});

describe('CommandPalette — focus trap', () => {
  beforeEach(resetHistoriiWyszukiwania);

  it('Tab z ostatniego fokusowalnego elementu wraca na pierwszy (cykl w dialogu)', async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette
        otwarta
        onZamknij={noop}
        pozycje={pozycje()}
        trybAktualny="basic"
        onWykonaj={noop}
        onPrzelaczTryb={noop}
      />,
    );
    const input = screen.getByTestId('mvd-cmdk-input');
    fireEvent.change(input, { target: { value: 'eksportuj' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const anuluj = screen.getByTestId('mvd-cmdk-anuluj');
    anuluj.focus();
    expect(anuluj).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
  });
});

function Harness() {
  const [otwarta, setOtwarta] = useState(false);
  return (
    <div>
      <button type="button" data-testid="zewnetrzny-przycisk" onClick={() => setOtwarta(true)}>
        otwórz
      </button>
      <CommandPalette
        otwarta={otwarta}
        onZamknij={() => setOtwarta(false)}
        pozycje={pozycje()}
        trybAktualny="basic"
        onWykonaj={noop}
        onPrzelaczTryb={noop}
      />
    </div>
  );
}

describe('CommandPalette — powrót fokusu po zamknięciu', () => {
  beforeEach(resetHistoriiWyszukiwania);

  it('fokus wraca do elementu sprzed otwarcia dialogu', () => {
    render(<Harness />);
    const przycisk = screen.getByTestId('zewnetrzny-przycisk');
    przycisk.focus();
    fireEvent.click(przycisk);
    expect(screen.getByTestId('mvd-cmdk-input')).toHaveFocus();

    fireEvent.keyDown(screen.getByTestId('mvd-cmdk-input'), { key: 'Escape' });
    expect(przycisk).toHaveFocus();
  });
});

function HistoriaHarness() {
  const [otwarta, setOtwarta] = useState(true);
  return (
    <div>
      <button type="button" data-testid="otworz-ponownie" onClick={() => setOtwarta(true)}>
        otwórz ponownie
      </button>
      <CommandPalette
        otwarta={otwarta}
        onZamknij={() => setOtwarta(false)}
        pozycje={pozycje()}
        trybAktualny="basic"
        onWykonaj={noop}
        onPrzelaczTryb={noop}
      />
    </div>
  );
}

describe('CommandPalette — historia sesji', () => {
  beforeEach(resetHistoriiWyszukiwania);

  it('po wykonaniu pozycji i ponownym otwarciu z pustą frazą pokazuje ją w historii (stan sesji, bez localStorage)', () => {
    render(<HistoriaHarness />);
    const input = screen.getByTestId('mvd-cmdk-input');
    fireEvent.change(input, { target: { value: 'zapisz' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByTestId('mvd-cmdk-dialog')).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0);

    fireEvent.click(screen.getByTestId('otworz-ponownie'));
    expect(screen.getByTestId('mvd-cmdk-hint')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-cmdk-opcja-b')).toHaveTextContent('Zapisz');
  });
});
