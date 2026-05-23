import { describe, expect, it } from 'vitest';
import {
  validateProjectMetadata,
  describePhase,
  listPhases,
} from '../projectMetadataValidator';

describe('validateProjectMetadata', () => {
  it('valid gdy wszystkie pola wypełnione', () => {
    const r = validateProjectMetadata({
      name: 'GPZ Testowy',
      investor: 'PSE',
      location: 'Warszawa',
      phase: 'PB',
    });
    expect(r.isValid).toBe(true);
  });

  it('puste pola → invalid z indywidualnymi messages', () => {
    const r = validateProjectMetadata({});
    expect(r.isValid).toBe(false);
    expect(r.name.message).toContain('wymagana');
    expect(r.investor.message).toContain('wymagany');
    expect(r.location.message).toContain('wymagana');
    expect(r.phase.message).toContain('wymagana');
  });

  it('nazwa za krótka', () => {
    const r = validateProjectMetadata({
      name: 'a',
      investor: 'PSE',
      location: 'W',
      phase: 'PB',
    });
    expect(r.name.isValid).toBe(false);
    expect(r.name.message).toContain('krótka');
  });

  it('nazwa za długa', () => {
    const r = validateProjectMetadata({
      name: 'a'.repeat(150),
      investor: 'PSE',
      location: 'W',
      phase: 'PB',
    });
    expect(r.name.isValid).toBe(false);
    expect(r.name.message).toContain('długa');
  });

  it('nazwa z niedozwolonymi znakami', () => {
    const r = validateProjectMetadata({
      name: 'GPZ <script>',
      investor: 'PSE',
      location: 'W',
      phase: 'PB',
    });
    expect(r.name.isValid).toBe(false);
  });

  it('dopuszcza polskie znaki w nazwie', () => {
    const r = validateProjectMetadata({
      name: 'GPZ Łódź-Bałuty',
      investor: 'PGE',
      location: 'Łódź',
      phase: 'PB',
    });
    expect(r.name.isValid).toBe(true);
  });

  it('niepoprawna faza', () => {
    const r = validateProjectMetadata({
      name: 'Test',
      investor: 'PSE',
      location: 'W',
      phase: 'XX' as never,
    });
    expect(r.phase.isValid).toBe(false);
  });

  it('phase PK valid', () => {
    const r = validateProjectMetadata({
      name: 'Test',
      investor: 'PSE',
      location: 'W',
      phase: 'PK',
    });
    expect(r.isValid).toBe(true);
  });
});

describe('describePhase', () => {
  it('zwraca PL opis każdej fazy', () => {
    expect(describePhase('PB')).toContain('Projekt Budowlany');
    expect(describePhase('PW')).toContain('Wykonawczy');
    expect(describePhase('PR')).toContain('Rzeczywisty');
    expect(describePhase('PK')).toContain('Końcowy');
  });
});

describe('listPhases', () => {
  it('zwraca 4 fazy', () => {
    expect(listPhases()).toHaveLength(4);
    expect(listPhases()[0].value).toBe('PB');
  });
});
