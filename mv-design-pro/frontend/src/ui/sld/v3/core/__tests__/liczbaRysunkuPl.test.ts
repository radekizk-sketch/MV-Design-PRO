/**
 * V12K-235: JEDNA konwencja zapisu liczby na rysunku.
 *
 * Znalezisko z oględzin materiału audytowego (V12K-234, kadr szczegółu stacji):
 * w JEDNEJ tabliczce stacji stały obok siebie „Szyna nN · 0.4 kV" (kropka) i
 * „Odbiór ΣP 0,4 MW · ΣQ 0,132 Mvar" (przecinek). Rysunek miał trzy równoległe
 * konwencje, bo etykiety szyn wstawiały liczbę SUROWO, a dwie inne warstwy
 * formatowały ją po polsku — każda własną kopią reguły.
 */

import { describe, expect, it } from 'vitest';

import { liczbaRysunkuPl, measureLabelWidth } from '../text';
import { stationBusbarLabelText, stationLvBusbarLabelText } from '../../layout/measure';
import { formatRatedVoltageKv } from '../../layout/lineLabel';

describe('liczbaRysunkuPl — zapis polski bez zer nieznaczących', () => {
  it('liczba całkowita bez części dziesiętnej', () => {
    expect(liczbaRysunkuPl(15)).toBe('15');
    expect(liczbaRysunkuPl(110)).toBe('110');
    expect(liczbaRysunkuPl(0)).toBe('0');
  });

  it('liczba ułamkowa z PRZECINKIEM, bez zera nieznaczącego', () => {
    expect(liczbaRysunkuPl(0.4)).toBe('0,4');
    expect(liczbaRysunkuPl(10.5)).toBe('10,5');
    expect(liczbaRysunkuPl(9.62)).toBe('9,62');
  });

  it('dwa miejsca dziesiętne, żeby zapis nie gubił cyfry danej', () => {
    // Szyna 0,69 kV (690 V) nie może zostać zapisana jako „0,7 kV" —
    // zaokrąglenie napięcia znamionowego jest zmianą DANEJ, nie zapisu.
    expect(liczbaRysunkuPl(0.69)).toBe('0,69');
    expect(liczbaRysunkuPl(20.25)).toBe('20,25');
  });

  it('usuwa WSZYSTKIE zera nieznaczące, nie jedno (przegląd kodu serii)', () => {
    // POMIAR PRZED NAPRAWĄ (`replace(/0$/, '')` zamiast `/0+$/`): 11.999 → „12,0",
    // 6.0000001 → „6,0", 20.004 → „20,0". Ostatni przypadek jest najgorszy: 0.001
    // renderowało się jako „0,0", czyli wartość NIEZEROWA pokazana z fałszywą
    // precyzją jako zero — rodzina błędów, którą ta seria zamyka.
    expect(liczbaRysunkuPl(11.999)).toBe('12');
    expect(liczbaRysunkuPl(6.0000001)).toBe('6');
    expect(liczbaRysunkuPl(20.004)).toBe('20');
    expect(liczbaRysunkuPl(0.001)).toBe('0');
  });

  it('zero znaczące ZOSTAJE — obcinamy zapis, nie cyfry danej', () => {
    // Kontrola odwrotna: gdyby obcinanie poszło za daleko, „0,05" straciłoby cyfrę.
    expect(liczbaRysunkuPl(0.05)).toBe('0,05');
    expect(liczbaRysunkuPl(10.05)).toBe('10,05');
  });

  it('nie zmienia geometrii: przecinek ma tę samą długość co kropka', () => {
    // Szerokość etykiety liczy się z DŁUGOŚCI tekstu (`measureLabelWidth`),
    // więc zmiana konwencji nie rusza układu ani hashy sceny.
    expect(measureLabelWidth('Szyna nN · 0,4 kV', 't4')).toBe(
      measureLabelWidth('Szyna nN · 0.4 kV', 't4'),
    );
  });
});

describe('etykiety szyn i linii mówią jednym zapisem', () => {
  it('szyna nN ułamkowa ma PRZECINEK (pomiar przed naprawą: „0.4 kV")', () => {
    expect(stationLvBusbarLabelText(0.4)).toBe('Szyna nN · 0,4 kV');
  });

  it('brak danej napięcia zostawia sam opis szyny — bez fabrykowanego zera', () => {
    expect(stationLvBusbarLabelText(null)).toBe('Szyna nN');
    expect(stationBusbarLabelText(undefined)).toBe('Sekcja 1');
  });

  it('sekcja SN i napięcie znamionowe kabla używają tej samej konwencji', () => {
    expect(stationBusbarLabelText(15)).toBe('Sekcja 1 · 15 kV');
    expect(formatRatedVoltageKv(20)).toBe('20 kV');
    expect(formatRatedVoltageKv(10.5)).toBe('10,5 kV');
  });
});
