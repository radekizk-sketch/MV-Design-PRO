/**
 * Testy frameworka kreatorów ui2 (rama + pola) — interakcje przez natywną
 * ścieżkę użytkownika (userEvent), zgodnie z Zero-Debt §5 (bez syntetycznych zdarzeń).
 */

import { useEffect, useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KreatorGotowosc } from '../gotowosc';
import { KreatorRama, KreatorSekcja } from '../KreatorRama';
import { PanelTeorii } from '../panelTeorii';
import {
  jedynaZgodna,
  pierwszyBrak,
  useAktualnoscWskazania,
  useDecyzjeProjektanta,
  useProwadzenie,
} from '../prowadzenie';
import {
  PoleKatalogu,
  PoleLiczbowe,
  PolePrzelacznik,
  PolePrzelacznikBinarny,
  PoleTekstowe,
  PoleWyboru,
} from '../pola';

afterEach(cleanup);

describe('KreatorRama — rama prowadząca', () => {
  function ramaTestowa(nadpisz: Partial<Parameters<typeof KreatorRama>[0]> = {}) {
    return (
      <KreatorRama
        eyebrow="MODEL · TEST"
        tytul="Element testowy"
        cel="Cel ekranu jednym zdaniem."
        odznaka="Nowy"
        akcjaGlowna={{ etykieta: 'Zapisz', onClick: () => {}, testid: 'rama-zapisz' }}
        akcjaAnuluj={{ etykieta: 'Anuluj', onClick: () => {}, testid: 'rama-anuluj' }}
        testid="rama"
        {...nadpisz}
      >
        <KreatorSekcja tytul="Sekcja A">
          <span>zawartość</span>
        </KreatorSekcja>
      </KreatorRama>
    );
  }

  it('renderuje eyebrow, tytuł, cel i odznakę', () => {
    render(ramaTestowa());
    expect(screen.getByText('MODEL · TEST')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Element testowy' })).toBeTruthy();
    expect(screen.getByText('Cel ekranu jednym zdaniem.')).toBeTruthy();
    expect(screen.getByText('Nowy')).toBeTruthy();
  });

  it('akcja główna i anuluj wołają handlery (klik natywny)', async () => {
    const user = userEvent.setup();
    const zapisz = vi.fn();
    const anuluj = vi.fn();
    render(ramaTestowa({
      akcjaGlowna: { etykieta: 'Zapisz', onClick: zapisz, testid: 'rama-zapisz' },
      akcjaAnuluj: { etykieta: 'Anuluj', onClick: anuluj, testid: 'rama-anuluj' },
    }));
    await user.click(screen.getByTestId('rama-zapisz'));
    await user.click(screen.getByTestId('rama-anuluj'));
    expect(zapisz).toHaveBeenCalledOnce();
    expect(anuluj).toHaveBeenCalledOnce();
  });

  // Intencja dawnego testu „blokuje akcję główną gdy zablokowana” w nowym kanonie
  // (kontrakt prowadzenia projektanta): zapis wyszarza WYŁĄCZNIE zamknięta lista blokad,
  // a `data-status` korzenia pochodzi z TEGO SAMEGO pola (predykaty parami).
  it('blokada „ładowanie” wyszarza zapis, nazywa powód i ustawia data-status', () => {
    render(ramaTestowa({ akcjaGlowna: { etykieta: 'Zapisz', onClick: () => {}, testid: 'rama-zapisz', blokada: 'ladowanie' } }));
    expect((screen.getByTestId('rama-zapisz') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('rama')).toHaveAttribute('data-status', 'ladowanie');
    expect(screen.getByTestId('mvd-kreator-blokada').textContent).toMatch(/katalog/i);
  });

  it('blokada „zapis w toku” wyszarza zapis ze statusem „zablokowany”', () => {
    render(ramaTestowa({ akcjaGlowna: { etykieta: 'Zapisz', onClick: () => {}, testid: 'rama-zapisz', blokada: 'zapis_w_toku' } }));
    expect((screen.getByTestId('rama-zapisz') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('rama')).toHaveAttribute('data-status', 'zablokowany');
  });

  it('bez blokady zapis jest klikalny, a świeża rama nie ma żadnego komunikatu ani alertu', () => {
    render(ramaTestowa());
    expect((screen.getByTestId('rama-zapisz') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId('rama')).toHaveAttribute('data-status', 'gotowy');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('mvd-kreator-wskazanie')).toBeNull();
    expect(screen.queryByTestId('mvd-kreator-blokada')).toBeNull();
  });

  it('pokazuje baner błędu globalnego (odmowa operacji z backendu)', () => {
    render(ramaTestowa({ bladGlobalny: 'Błąd zapisu' }));
    expect(screen.getByTestId('mvd-kreator-blad').textContent).toContain('Błąd zapisu');
  });

  it('renderuje pasek kroków i przełącza krok (klik natywny)', async () => {
    const user = userEvent.setup();
    const onKrok = vi.fn();
    render(ramaTestowa({
      kroki: [{ id: 'a', tytul: 'Krok A' }, { id: 'b', tytul: 'Krok B' }],
      krokAktywny: 'a',
      onKrok,
    }));
    await user.click(screen.getByTestId('mvd-kreator-krok-b'));
    expect(onKrok).toHaveBeenCalledWith('b');
  });
});

// ------------------------------------------------- Prowadzenie: BRAK_DO_OPERACJI

/**
 * Kreator testowy z DWOMA krokami; pole „moc” leży na kroku B. Zapis przy braku mocy
 * musi przenieść do kroku B, ustawić fokus na polu i pokazać JEDNO zdanie w stopce.
 */
function KreatorZKrokami({ onZapis }: { onZapis: () => void }) {
  const [krok, setKrok] = useState('a');
  const [moc, setMoc] = useState<number | null>(null);
  const [nazwa, setNazwa] = useState('');
  const prowadzenie = useProwadzenie(setKrok);
  return (
    <KreatorRama
      eyebrow="E"
      tytul="T"
      cel="C"
      kroki={[{ id: 'a', tytul: 'Krok A' }, { id: 'b', tytul: 'Krok B' }]}
      krokAktywny={krok}
      onKrok={setKrok}
      {...prowadzenie.propsRamy}
      akcjaGlowna={{
        etykieta: 'Zapisz',
        testid: 'kz-zapisz',
        onClick: () => {
          const brak = pierwszyBrak([
            moc === null && { komunikat: 'Podaj moc odbioru — bez niej rozpływ nie policzy obciążenia.', krok: 'b', pole: 'kz-moc' },
          ]);
          if (brak) {
            prowadzenie.wskaz(brak);
            return;
          }
          onZapis();
        },
      }}
      akcjaAnuluj={{ etykieta: 'Anuluj', onClick: () => {} }}
      testid="kz"
    >
      {krok === 'a' ? (
        <PoleTekstowe etykieta="Nazwa" wartosc={nazwa} onZmiana={setNazwa} testid="kz-nazwa" />
      ) : (
        <PoleLiczbowe etykieta="Moc" jednostka="kW" wartosc={moc} onZmiana={setMoc} testid="kz-moc" />
      )}
    </KreatorRama>
  );
}

describe('Prowadzenie — BRAK_DO_OPERACJI przy próbie zapisu', () => {
  it('klik „Zapisz” z brakiem: przejście do kroku pola, fokus na polu, jedno zdanie (co, po co)', async () => {
    const user = userEvent.setup();
    const onZapis = vi.fn();
    render(<KreatorZKrokami onZapis={onZapis} />);
    // Świeży kreator: zero sygnałów w toku pracy.
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(screen.getByTestId('kz-zapisz'));
    expect(onZapis).not.toHaveBeenCalled();
    expect(screen.getByTestId('mvd-kreator-krok-b')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('kz-moc')).toHaveFocus();
    const wskazanie = screen.getByTestId('mvd-kreator-wskazanie');
    expect(wskazanie).toHaveAttribute('role', 'alert');
    expect(wskazanie.textContent).toBe('Podaj moc odbioru — bez niej rozpływ nie policzy obciążenia.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    // Koszulka wskazanego pola jest oznaczona (obrys akcentem).
    expect(screen.getByTestId('kz-moc').closest('.mvd-pole')).toHaveAttribute('data-wskazane', 'tak');
  });

  it('wpisanie wartości we wskazane pole zdejmuje wskazanie; ponowny zapis przechodzi', async () => {
    const user = userEvent.setup();
    const onZapis = vi.fn();
    render(<KreatorZKrokami onZapis={onZapis} />);
    await user.click(screen.getByTestId('kz-zapisz'));
    await user.type(screen.getByTestId('kz-moc'), '40');
    expect(screen.queryByTestId('mvd-kreator-wskazanie')).toBeNull();
    await user.click(screen.getByTestId('kz-zapisz'));
    expect(onZapis).toHaveBeenCalledOnce();
  });

  it('zmiana INNEJ kontrolki nie zdejmuje wskazania', async () => {
    const user = userEvent.setup();
    render(<KreatorZKrokami onZapis={() => {}} />);
    await user.click(screen.getByTestId('kz-zapisz'));
    await user.click(screen.getByTestId('mvd-kreator-krok-a'));
    await user.type(screen.getByTestId('kz-nazwa'), 'S1');
    expect(screen.getByTestId('mvd-kreator-wskazanie')).toBeInTheDocument();
  });
});

/**
 * Brak bez kontrolki (np. brakujące pole toru dokładane przyciskiem): wskazanie gaśnie, gdy
 * brak zniknął z bieżącej listy — nie wisi w stopce. Iloczyn: brak {z kontrolką, bez
 * kontrolki} × {rozwiązany, nierozwiązany}.
 */
function KreatorZBrakiemBezPola() {
  const prowadzenie = useProwadzenie();
  const [polaToru, setPolaToru] = useState(0);
  const [nazwa, setNazwa] = useState('');
  const braki = [
    !nazwa && { komunikat: 'Podaj nazwę — trafia na schemat.', pole: 'bp-nazwa' },
    polaToru < 2 && { komunikat: 'Dodaj pola toru — odcinek przechodzi przez ich aparaty.' },
  ].filter((b): b is { komunikat: string; pole?: string } => Boolean(b));
  useAktualnoscWskazania(prowadzenie, braki);
  return (
    <KreatorRama
      eyebrow="E"
      tytul="Brak bez pola"
      cel="c"
      kroki={[{ id: 'a', tytul: 'A' }]}
      krokAktywny="a"
      onKrok={() => {}}
      {...prowadzenie.propsRamy}
      akcjaGlowna={{
        etykieta: 'Zapisz',
        testid: 'bp-zapisz',
        onClick: () => {
          const brak = pierwszyBrak([...braki].reverse());
          if (brak) prowadzenie.wskaz(brak);
        },
      }}
      akcjaAnuluj={{ etykieta: 'Anuluj', onClick: () => {} }}
    >
      <input data-testid="bp-nazwa" value={nazwa} onChange={(e) => setNazwa(e.target.value)} />
      <button type="button" data-testid="bp-dodaj" onClick={() => setPolaToru((n) => n + 1)}>
        Dodaj pole
      </button>
    </KreatorRama>
  );
}

describe('Prowadzenie — wskazanie żyje tylko, dopóki brak istnieje', () => {
  it('brak bez kontrolki: częściowe rozwiązanie zostawia wskazanie, pełne je gasi', async () => {
    const user = userEvent.setup();
    render(<KreatorZBrakiemBezPola />);
    await user.click(screen.getByTestId('bp-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie')).toHaveTextContent('Dodaj pola toru');
    await user.click(screen.getByTestId('bp-dodaj'));
    expect(screen.getByTestId('mvd-kreator-wskazanie')).toHaveTextContent('Dodaj pola toru');
    await user.click(screen.getByTestId('bp-dodaj'));
    expect(screen.queryByTestId('mvd-kreator-wskazanie')).toBeNull();
  });

  it('brak z kontrolką: zmiana innej kontrolki (przycisk) nie gasi, rozwiązanie gasi', async () => {
    const user = userEvent.setup();
    render(<KreatorZBrakiemBezPola />);
    await user.click(screen.getByTestId('bp-dodaj'));
    await user.click(screen.getByTestId('bp-dodaj'));
    await user.click(screen.getByTestId('bp-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie')).toHaveTextContent('Podaj nazwę');
    expect(screen.getByTestId('bp-nazwa')).toHaveFocus();
    await user.click(screen.getByTestId('bp-dodaj'));
    expect(screen.getByTestId('mvd-kreator-wskazanie')).toHaveTextContent('Podaj nazwę');
    await user.type(screen.getByTestId('bp-nazwa'), 'S');
    expect(screen.queryByTestId('mvd-kreator-wskazanie')).toBeNull();
  });
});

describe('Prowadzenie — AUTO_PRZYJETE i panel kontroli', () => {
  // Wartość dobrana automatycznie (z jednoznacznego źródła) stoi w polu jak zwykła wartość —
  // bez etykiety pochodzenia (dyrektywa właściciela 2026-10-15). Automat działa w efekcie i nie
  // nadpisuje pola, które projektant już zmienił; źródło „zmienia się” przyciskiem harnessu.
  function PoleZAutomatem() {
    const [zrodlo, setZrodlo] = useState<number>(15);
    const [v, setV] = useState<number | null>(null);
    const { edytowane, decyzjaProjektanta } = useDecyzjeProjektanta<'u'>();
    useEffect(() => {
      if (!decyzjaProjektanta('u')) setV(zrodlo);
    }, [decyzjaProjektanta, zrodlo]);
    return (
      <>
        <PoleLiczbowe
          etykieta="Napięcie"
          jednostka="kV"
          wartosc={v}
          onZmiana={(x) => {
            setV(x);
            edytowane('u');
          }}
          testid="auto-u"
        />
        <button type="button" data-testid="zmien-zrodlo" onClick={() => setZrodlo(20)}>
          zmień źródło
        </button>
      </>
    );
  }

  it('wartość automatu stoi w polu bez etykiety pochodzenia i podąża za źródłem', async () => {
    const user = userEvent.setup();
    render(<PoleZAutomatem />);
    expect(await screen.findByTestId('auto-u')).toHaveValue(15);
    expect(screen.queryByText(/przyjęto/)).toBeNull();
    await user.click(screen.getByTestId('zmien-zrodlo'));
    expect(screen.getByTestId('auto-u')).toHaveValue(20);
  });

  it('po edycji przez projektanta automat już nie nadpisuje pola', async () => {
    const user = userEvent.setup();
    render(<PoleZAutomatem />);
    await user.clear(screen.getByTestId('auto-u'));
    await user.type(screen.getByTestId('auto-u'), '30');
    await user.click(screen.getByTestId('zmien-zrodlo'));
    expect(screen.getByTestId('auto-u')).toHaveValue(30);
  });

  it('panel kontroli: „do wyboru” neutralny, czerwień wyłącznie dla konfliktu', () => {
    render(
      <KreatorGotowosc
        tytul="Kontrola"
        testid="g"
        wiersze={[
          { etykieta: 'Typ', stan: 'do_wyboru', wartosc: '' },
          { etykieta: 'Szyna', stan: 'ustalone', wartosc: 'S1' },
          { etykieta: 'Aparat', stan: 'konflikt', wartosc: 'Za niskie U_n' },
        ]}
      />,
    );
    const stan = (etykieta: string) =>
      screen.getByTestId(`g-${etykieta}`).querySelector('.mvd-kreator-gotowosc-stan') as HTMLElement;
    expect(stan('Typ')).toHaveAttribute('data-stan', 'do_wyboru');
    expect(stan('Typ').textContent).toBe('Do wyboru');
    expect(stan('Aparat')).toHaveAttribute('data-stan', 'konflikt');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('jedynaZgodna: jedna zgodna → ona; zero albo kilka → brak (wybór projektanta)', () => {
    expect(jedynaZgodna([1, 2, 3], (x) => x === 2)).toBe(2);
    expect(jedynaZgodna([1, 2, 3], (x) => x > 1)).toBeNull();
    expect(jedynaZgodna([1, 2, 3], (x) => x > 5)).toBeNull();
    expect(jedynaZgodna([7])).toBe(7);
  });
});

describe('Pola kreatora — interakcje natywne', () => {
  // `blad` pola = KONFLIKT_TECHNICZNY (widoczny od razu), nie brak wartości.
  it('PoleTekstowe emituje zmianę i pokazuje konflikt przy polu', async () => {
    const user = userEvent.setup();
    const onZmiana = vi.fn();
    render(<PoleTekstowe etykieta="Nazwa" wartosc="" onZmiana={onZmiana} blad="Nazwa zajęta w stacji" testid="pt" />);
    await user.type(screen.getByTestId('pt'), 'X');
    expect(onZmiana).toHaveBeenCalledWith('X');
    expect(screen.getByRole('alert').textContent).toBe('Nazwa zajęta w stacji');
  });

  it('PoleLiczbowe zwraca null dla pustej wartości', async () => {
    const user = userEvent.setup();
    const onZmiana = vi.fn();
    render(<PoleLiczbowe etykieta="Sk3" jednostka="MVA" wartosc={5} onZmiana={onZmiana} testid="pl" />);
    await user.clear(screen.getByTestId('pl'));
    expect(onZmiana).toHaveBeenLastCalledWith(null);
  });

  it('PoleWyboru emituje wybraną opcję', async () => {
    const user = userEvent.setup();
    const onZmiana = vi.fn();
    render(
      <PoleWyboru
        etykieta="Napięcie"
        wartosc="15"
        onZmiana={onZmiana}
        opcje={[{ id: '15', etykieta: '15 kV' }, { id: '20', etykieta: '20 kV' }]}
        testid="pw"
      />,
    );
    await user.selectOptions(screen.getByTestId('pw'), '20');
    expect(onZmiana).toHaveBeenCalledWith('20');
  });

  it('PolePrzelacznik przełącza segment (klik natywny)', async () => {
    const user = userEvent.setup();
    const onZmiana = vi.fn();
    render(
      <PolePrzelacznik
        wartosc="a"
        opcje={[{ id: 'a', etykieta: 'A' }, { id: 'b', etykieta: 'B' }]}
        onZmiana={onZmiana}
        testid="pp"
      />,
    );
    await user.click(screen.getByTestId('pp-b'));
    expect(onZmiana).toHaveBeenCalledWith('b');
  });

  it('PolePrzelacznikBinarny przełącza stan', async () => {
    const user = userEvent.setup();
    const onZmiana = vi.fn();
    render(<PolePrzelacznikBinarny etykieta="Zero" wlaczone={false} onZmiana={onZmiana} testid="pb" />);
    await user.click(screen.getByTestId('pb'));
    expect(onZmiana).toHaveBeenCalledWith(true);
  });

  it('PanelTeorii renderuje teorię, wymóg, podstawę i dzieci (wykres) — rozwijany', async () => {
    const user = userEvent.setup();
    render(
      <PanelTeorii
        tytul="Teoria: test"
        opis="Wyjaśnienie teorii."
        wymog="Wymaganie normy."
        podstawa="Podstawa: norma X."
        testid="pt"
      >
        <svg data-testid="pt-wykres" />
      </PanelTeorii>,
    );
    const panel = screen.getByTestId('pt');
    // Treść jest w DOM (details) — dostępna także zwinięta.
    expect(panel.textContent).toContain('Wyjaśnienie teorii.');
    expect(panel.textContent).toContain('Wymaganie normy.');
    expect(panel.textContent).toContain('Podstawa: norma X.');
    expect(screen.getByTestId('pt-wykres')).toBeInTheDocument();
    // Rozwijalny natywnie (summary).
    expect((panel as HTMLDetailsElement).open).toBe(false);
    await user.click(panel.querySelector('summary') as HTMLElement);
    expect((panel as HTMLDetailsElement).open).toBe(true);
  });

  it('PanelTeorii renderuje wzory $...$ z opisu i wymogu przez KaTeX (math-rendered)', () => {
    // Zasada wywodów KaTeX (2026-07-22): wzór w tekście teorii NIE może być surowym
    // tekstem — TekstZWzorami renderuje segmenty $...$ przez MathInline.
    render(
      <PanelTeorii
        tytul="Teoria: wzory"
        opis={'Moc bierną wiąże $Q = P \\cdot \\tan(\\arccos\\cos\\varphi)$ z mocą czynną.'}
        wymog={'Wytrzymałość cieplna $I_{th} \\ge I_k \\cdot \\sqrt{t_k}$.'}
        testid="pt-wzory"
      />,
    );
    const wzory = screen.getAllByTestId('math-rendered');
    expect(wzory).toHaveLength(2);
    expect(wzory[0].getAttribute('data-latex')).toContain('\\tan(\\arccos\\cos\\varphi)');
    expect(wzory[1].getAttribute('data-latex')).toContain('\\sqrt{t_k}');
    // Surowy zapis LaTeX nie wycieka do tekstu (brak fallbacku <code>).
    expect(screen.queryByTestId('math-fallback')).toBeNull();
  });

  it('pomoc pola renderuje wzory $...$ przez KaTeX (math-rendered)', () => {
    render(
      <PoleLiczbowe
        etykieta="cosφ"
        wartosc={0.95}
        onZmiana={() => undefined}
        pomoc={'Q wylicza backend ($Q = P \\cdot \\tan(\\arccos\\cos\\varphi)$).'}
        testid="pl-pomoc"
      />,
    );
    const wzory = screen.getAllByTestId('math-rendered');
    expect(wzory).toHaveLength(1);
    expect(wzory[0].getAttribute('data-latex')).toContain('\\arccos');
  });

  it('PanelTeorii domyślnieOtwarty startuje rozwinięty; pomija puste bloki', () => {
    render(<PanelTeorii tytul="T" opis="O." domyslnieOtwarty testid="pt2" />);
    const panel = screen.getByTestId('pt2') as HTMLDetailsElement;
    expect(panel.open).toBe(true);
    // Bez wymog/podstawa nie ma tych bloków.
    expect(panel.querySelector('.mvd-teoria-wymog')).toBeNull();
    expect(panel.querySelector('.mvd-teoria-podstawa')).toBeNull();
  });

  it('PoleKatalogu pokazuje uczciwy błąd katalogu', () => {
    render(
      <PoleKatalogu
        etykieta="Typ"
        wartosc={null}
        onZmiana={() => {}}
        opcje={[]}
        status="error"
        placeholder="— wybierz —"
        komunikatBledu="Katalog niedostępny"
        testid="pk"
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('Katalog niedostępny');
  });
});
