/**
 * ReportProfileSelector — wybór profilu raportu technicznego (Etap 14 z planu).
 *
 * 4 profile per PSE/IRiESD:
 * - OSD (wniosek przyłączeniowy) — komplet danych dla operatora
 * - Wykonawczy (PW — projekt wykonawczy) — szczegółowe rysunki + obliczenia
 * - Audytowy (PR — projekt rzeczywisty) — ślad zmian + uzasadnienia
 * - Pełny techniczny — wszystko
 *
 * Format: PDF lub DOCX. Język: PL (default), EN opcjonalnie.
 * Naming: {ProjectName}_{CaseName}_{Profile}_{Date}.{pdf|docx}
 */

import { useState, useMemo } from 'react';

export type ReportProfile = 'osd' | 'executive' | 'audit' | 'full_technical';
export type DetailLevel = 'minimal' | 'standard' | 'full';
export type ReportFormat = 'pdf' | 'docx';
export type ReportLanguage = 'pl' | 'en';

export interface ReportProfileConfig {
  profile: ReportProfile;
  detailLevel: DetailLevel;
  sections: {
    summary: boolean;
    diagram: boolean;
    parameters: boolean;
    calculations: boolean;
    results: boolean;
    trace: boolean;
    conclusions: boolean;
  };
  format: ReportFormat;
  language: ReportLanguage;
}

const PROFILE_LABELS: Record<ReportProfile, string> = {
  osd: 'OSD (wniosek przyłączeniowy)',
  executive: 'Wykonawczy (PW)',
  audit: 'Audytowy (PR)',
  full_technical: 'Pełny techniczny',
};

const PROFILE_DESCRIPTIONS: Record<ReportProfile, string> = {
  osd: 'Wniosek przyłączeniowy zgodny z PSE/Energa/Tauron/Enea/PGE. Dane operatora + bilans mocy.',
  executive: 'Projekt wykonawczy (PW). Rysunki + obliczenia + nominalia aparatury.',
  audit: 'Projekt rzeczywisty (PR). Ślad zmian + uzasadnienia inżynierskie + wnioski.',
  full_technical: 'Komplet: wszystkie sekcje + szczegółowy ślad obliczeń + protokoły.',
};

const DEFAULT_SECTIONS_PER_PROFILE: Record<ReportProfile, ReportProfileConfig['sections']> = {
  osd: {
    summary: true,
    diagram: true,
    parameters: true,
    calculations: false,
    results: false,
    trace: false,
    conclusions: true,
  },
  executive: {
    summary: true,
    diagram: true,
    parameters: true,
    calculations: true,
    results: true,
    trace: false,
    conclusions: true,
  },
  audit: {
    summary: true,
    diagram: false,
    parameters: true,
    calculations: true,
    results: true,
    trace: true,
    conclusions: true,
  },
  full_technical: {
    summary: true,
    diagram: true,
    parameters: true,
    calculations: true,
    results: true,
    trace: true,
    conclusions: true,
  },
};

interface ReportProfileSelectorProps {
  initialProfile?: ReportProfile;
  projectName: string;
  caseName: string;
  onConfirm: (config: ReportProfileConfig, fileName: string) => void;
  onCancel: () => void;
}

export function ReportProfileSelector({
  initialProfile = 'osd',
  projectName,
  caseName,
  onConfirm,
  onCancel,
}: ReportProfileSelectorProps) {
  const [profile, setProfile] = useState<ReportProfile>(initialProfile);
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('standard');
  const [sections, setSections] = useState(DEFAULT_SECTIONS_PER_PROFILE[initialProfile]);
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [language, setLanguage] = useState<ReportLanguage>('pl');

  const fileName = useMemo(() => {
    const date = new Date().toISOString().slice(0, 10);
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, '_');
    return `${sanitize(projectName)}_${sanitize(caseName)}_${profile}_${date}.${format}`;
  }, [projectName, caseName, profile, format]);

  const handleProfileChange = (newProfile: ReportProfile) => {
    setProfile(newProfile);
    setSections(DEFAULT_SECTIONS_PER_PROFILE[newProfile]);
  };

  const handleConfirm = () => {
    onConfirm(
      { profile, detailLevel, sections, format, language },
      fileName,
    );
  };

  const toggleSection = (key: keyof ReportProfileConfig['sections']) => {
    setSections((s) => ({ ...s, [key]: !s[key] }));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-profile-title"
      className="flex flex-col gap-4 rounded-lg bg-white p-6 shadow-xl"
      data-testid="report-profile-selector"
    >
      <h2 id="report-profile-title" className="text-lg font-semibold text-slate-900">
        Wybierz profil raportu
      </h2>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Profil
          <select
            value={profile}
            onChange={(e) => handleProfileChange(e.target.value as ReportProfile)}
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            data-testid="report-profile-select"
            aria-describedby="report-profile-description"
          >
            {Object.entries(PROFILE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p id="report-profile-description" className="text-xs text-slate-500">
          {PROFILE_DESCRIPTIONS[profile]}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          Poziom szczegółowości
          <select
            value={detailLevel}
            onChange={(e) => setDetailLevel(e.target.value as DetailLevel)}
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
            data-testid="report-detail-select"
            title="Wpływa na liczbę kroków pośrednich i głębokość kalkulacji"
          >
            <option value="minimal">Minimalny</option>
            <option value="standard">Standardowy</option>
            <option value="full">Pełny</option>
          </select>
        </label>
      </div>

      <fieldset className="rounded border border-slate-200 p-3">
        <legend className="px-1 text-sm font-medium text-slate-700">Sekcje opcjonalne</legend>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {(Object.keys(sections) as Array<keyof ReportProfileConfig['sections']>).map((key) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={sections[key]}
                onChange={() => toggleSection(key)}
                data-testid={`section-${key}`}
                title={`Włącz sekcję ${SECTION_LABELS[key]}`}
              />
              <span>{SECTION_LABELS[key]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-slate-700">
          Format
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as ReportFormat)}
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
            data-testid="report-format-select"
            title="PDF dla wniosku OSD, DOCX dla edycji"
          >
            <option value="pdf">PDF</option>
            <option value="docx">DOCX</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Język
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as ReportLanguage)}
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
            data-testid="report-language-select"
            title="PL dla OSD, EN dla raportów eksportowych"
          >
            <option value="pl">Polski</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>

      <div className="rounded bg-slate-100 p-2 text-xs text-slate-700">
        Nazwa pliku:&nbsp;
        <code className="font-mono" data-testid="report-filename-preview">{fileName}</code>
      </div>

      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          data-testid="report-cancel"
        >
          Anuluj
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          data-testid="report-confirm"
        >
          Wygeneruj raport
        </button>
      </div>
    </div>
  );
}

const SECTION_LABELS: Record<keyof ReportProfileConfig['sections'], string> = {
  summary: 'Streszczenie',
  diagram: 'Schemat SLD',
  parameters: 'Parametry sieci',
  calculations: 'Obliczenia',
  results: 'Wyniki',
  trace: 'Ślad obliczeń',
  conclusions: 'Wnioski',
};
