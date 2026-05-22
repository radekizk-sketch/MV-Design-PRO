/**
 * Project Archive Dialog — P31
 *
 * Dialog eksportu i importu projektów MV-DESIGN PRO.
 *
 * KANON:
 * - Import/Export = NOT-A-SOLVER
 * - Zero nowych obliczeń
 * - 100% PL
 */

import { useCallback, useState, useRef, type ChangeEvent, type DragEvent } from 'react';
import { clsx } from 'clsx';
import type { ArchiveDialogState, ArchivePreviewResponse, ImportResponse } from './types';
import { downloadProjectArchive, importProject, previewArchive } from './api';

// =============================================================================
// Icons (inline SVG dla prostoty)
// =============================================================================

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
      />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={clsx('animate-spin', className)} fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// =============================================================================
// Props
// =============================================================================

export interface ProjectArchiveDialogProps {
  /** ID projektu (dla eksportu) */
  projectId?: string;
  /** Nazwa projektu (dla eksportu) */
  projectName?: string;
  /** Czy dialog jest otwarty */
  open: boolean;
  /** Tryb początkowy: export lub import */
  initialMode?: 'export' | 'import';
  /** Callback zamknięcia */
  onClose: () => void;
  /** Callback po pomyślnym imporcie */
  onImportSuccess?: (projectId: string) => void;
}

// =============================================================================
// Component
// =============================================================================

export function ProjectArchiveDialog({
  projectId,
  projectName,
  open,
  initialMode = 'export',
  onClose,
  onImportSuccess,
}: ProjectArchiveDialogProps) {
  // Stan
  const [state, setState] = useState<ArchiveDialogState>({
    mode: initialMode,
    loading: false,
    error: null,
    preview: null,
    importResult: null,
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [verifyIntegrity, setVerifyIntegrity] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // =========================================================================
  // Handlers - Export
  // =========================================================================

  const handleExport = useCallback(async () => {
    if (!projectId) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      await downloadProjectArchive(projectId, projectName);
      onClose();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Nieznany błąd eksportu',
      }));
    }
  }, [projectId, projectName, onClose]);

  // =========================================================================
  // Handlers - Import
  // =========================================================================

  const handleFileSelect = useCallback((file: File | null) => {
    setSelectedFile(file);
    setState((prev) => ({ ...prev, preview: null, importResult: null, error: null }));
  }, []);

  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;
      handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith('.zip') || file.name.endsWith('.mvdp.zip'))) {
        handleFileSelect(file);
      } else {
        setState((prev) => ({
          ...prev,
          error: 'Nieprawidłowy format pliku. Oczekiwano .zip lub .mvdp.zip',
        }));
      }
    },
    [handleFileSelect]
  );

  const handlePreview = useCallback(async () => {
    if (!selectedFile) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const preview = await previewArchive(selectedFile);
      setState((prev) => ({ ...prev, loading: false, preview }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Nieznany błąd podglądu',
      }));
    }
  }, [selectedFile]);

  const handleImport = useCallback(async () => {
    if (!selectedFile) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const result = await importProject(selectedFile, {
        newName: newProjectName || undefined,
        verifyIntegrity,
      });

      setState((prev) => ({ ...prev, loading: false, importResult: result }));

      if (result.status === 'SUCCESS' && result.project_id && onImportSuccess) {
        onImportSuccess(result.project_id);
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Nieznany błąd importu',
      }));
    }
  }, [selectedFile, newProjectName, verifyIntegrity, onImportSuccess]);

  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setNewProjectName('');
    setState((prev) => ({
      ...prev,
      preview: null,
      importResult: null,
      error: null,
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleModeSwitch = useCallback((mode: 'export' | 'import') => {
    setState((prev) => ({
      ...prev,
      mode,
      error: null,
      preview: null,
      importResult: null,
    }));
    setSelectedFile(null);
    setNewProjectName('');
  }, []);

  // =========================================================================
  // Render helpers
  // =========================================================================

  if (!open) return null;

  const canExport = projectId && !state.loading;
  const canPreview = selectedFile && !state.loading && !state.preview;
  const canImport = selectedFile && !state.loading;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              {state.mode === 'export' ? 'Eksportuj projekt' : 'Importuj projekt'}
            </h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Mode tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => handleModeSwitch('export')}
              className={clsx(
                'flex-1 px-4 py-3 text-sm font-medium transition-colors',
                state.mode === 'export'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              )}
            >
              <span className="flex items-center justify-center gap-2">
                <DownloadIcon className="w-4 h-4" />
                Eksportuj
              </span>
            </button>
            <button
              onClick={() => handleModeSwitch('import')}
              className={clsx(
                'flex-1 px-4 py-3 text-sm font-medium transition-colors',
                state.mode === 'import'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              )}
            >
              <span className="flex items-center justify-center gap-2">
                <UploadIcon className="w-4 h-4" />
                Importuj
              </span>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[60vh]">
            {/* Error display */}
            {state.error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-700">{state.error}</div>
              </div>
            )}

            {/* Export mode */}
            {state.mode === 'export' && (
              <ExportContent
                projectId={projectId}
                projectName={projectName}
                loading={state.loading}
                canExport={!!canExport}
                onExport={handleExport}
              />
            )}

            {/* Import mode */}
            {state.mode === 'import' && (
              <ImportContent
                selectedFile={selectedFile}
                newProjectName={newProjectName}
                verifyIntegrity={verifyIntegrity}
                preview={state.preview}
                importResult={state.importResult}
                loading={state.loading}
                isDragging={isDragging}
                fileInputRef={fileInputRef}
                canPreview={!!canPreview}
                canImport={!!canImport}
                onFileInputChange={handleFileInputChange}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onNewNameChange={setNewProjectName}
                onVerifyIntegrityChange={setVerifyIntegrity}
                onPreview={handlePreview}
                onImport={handleImport}
                onReset={handleReset}
                onClose={onClose}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// =============================================================================
// Export Content
// =============================================================================

interface ExportContentProps {
  projectId?: string;
  projectName?: string;
  loading: boolean;
  canExport: boolean;
  onExport: () => void;
}

function ExportContent({
  projectId,
  projectName,
  loading,
  canExport,
  onExport,
}: ExportContentProps) {
  return (
    <div className="space-y-6">
      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 mb-2">Eksport projektu</h3>
        <p className="text-sm text-blue-700">
          Eksport zawiera kompletny projekt z modelem sieci, diagramami SLD, przypadkami
          obliczeniowymi, wynikami analiz i dowodami obliczeń.
        </p>
      </div>

      {/* Project info */}
      {projectId && (
        <div className="bg-gray-50 rounded-lg p-4">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Nazwa projektu:</dt>
              <dd className="font-medium text-gray-900">{projectName || 'Bez nazwy'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">ID projektu:</dt>
              <dd className="font-mono text-gray-600">{projectId.substring(0, 8)}...</dd>
            </div>
          </dl>
        </div>
      )}

      {/* No project selected */}
      {!projectId && (
        <div className="text-center py-8 text-gray-500">
          <p>Nie wybrano projektu do eksportu.</p>
        </div>
      )}

      {/* Export button */}
      <button
        onClick={onExport}
        disabled={!canExport}
        className={clsx(
          'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors',
          canExport
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
        )}
      >
        {loading ? (
          <>
            <SpinnerIcon className="w-5 h-5" />
            Eksportowanie...
          </>
        ) : (
          <>
            <DownloadIcon className="w-5 h-5" />
            Eksportuj projekt
          </>
        )}
      </button>
    </div>
  );
}

// =============================================================================
// Import Content
// =============================================================================

interface ImportContentProps {
  selectedFile: File | null;
  newProjectName: string;
  verifyIntegrity: boolean;
  preview: ArchivePreviewResponse | null;
  importResult: ImportResponse | null;
  loading: boolean;
  isDragging: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  canPreview: boolean;
  canImport: boolean;
  onFileInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onNewNameChange: (name: string) => void;
  onVerifyIntegrityChange: (verify: boolean) => void;
  onPreview: () => void;
  onImport: () => void;
  onReset: () => void;
  onClose: () => void;
}

function ImportContent({
  selectedFile,
  newProjectName,
  verifyIntegrity,
  preview,
  importResult,
  loading,
  isDragging,
  fileInputRef,
  canPreview,
  canImport,
  onFileInputChange,
  onDragOver,
  onDragLeave,
  onDrop,
  onNewNameChange,
  onVerifyIntegrityChange,
  onPreview,
  onImport,
  onReset,
  onClose,
}: ImportContentProps) {
  // Import completed successfully
  if (importResult?.status === 'SUCCESS') {
    return (
      <div className="space-y-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <CheckIcon className="w-12 h-12 mx-auto text-green-500 mb-4" />
          <h3 className="font-medium text-green-900 mb-2">Import zakończony pomyślnie</h3>
          <p className="text-sm text-green-700">
            Projekt został zaimportowany z nowym ID: {importResult.project_id?.substring(0, 8)}...
          </p>

          {importResult.warnings.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-left">
              <p className="text-sm font-medium text-yellow-800 mb-1">Ostrzeżenia:</p>
              <ul className="text-sm text-yellow-700 list-disc list-inside">
                {importResult.warnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {importResult.migrated_from_version && (
            <p className="mt-3 text-xs text-green-600">
              Zmigrowano z wersji {importResult.migrated_from_version}
            </p>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
        >
          Zamknij
        </button>
      </div>
    );
  }

  // Import failed
  if (importResult?.status === 'FAILED') {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <XIcon className="w-12 h-12 mx-auto text-red-500 mb-4" />
          <h3 className="font-medium text-red-900 mb-2">Import nie powiódł się</h3>
          <ul className="text-sm text-red-700 list-disc list-inside text-left">
            {importResult.errors.map((error, idx) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
        </div>

        <button
          onClick={onReset}
          className="w-full px-4 py-3 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700"
        >
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={clsx(
          'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : selectedFile
            ? 'border-green-300 bg-green-50'
            : 'border-gray-300 hover:border-gray-400'
        )}
      >
        {selectedFile ? (
          <div className="space-y-2">
            <CheckIcon className="w-10 h-10 mx-auto text-green-500" />
            <p className="font-medium text-gray-900">{selectedFile.name}</p>
            <p className="text-sm text-gray-500">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <button
              onClick={onReset}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Wybierz inny plik
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <UploadIcon className="w-10 h-10 mx-auto text-gray-400" />
            <p className="text-gray-600">
              Przeciągnij archiwum tutaj lub{' '}
              <label className="text-blue-600 hover:text-blue-800 cursor-pointer">
                wybierz plik
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.mvdp.zip"
                  onChange={onFileInputChange}
                  className="hidden"
                />
              </label>
            </p>
            <p className="text-xs text-gray-400">Obsługiwane formaty: .zip, .mvdp.zip</p>
          </div>
        )}
      </div>

      {/* Preview button */}
      {canPreview && (
        <button
          onClick={onPreview}
          disabled={loading}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <SpinnerIcon className="w-4 h-4" />
              Ładowanie podglądu...
            </span>
          ) : (
            'Podgląd zawartości'
          )}
        </button>
      )}

      {/* Preview display */}
      {preview && (
        <PreviewDisplay preview={preview} />
      )}

      {/* Import options */}
      {selectedFile && (
        <div className="space-y-4 bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900">Opcje importu</h4>

          {/* New name */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Nowa nazwa projektu (opcjonalnie)
            </label>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => onNewNameChange(e.target.value)}
              placeholder={preview?.project_name || 'Pozostaw puste dla oryginalnej nazwy'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Verify integrity */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={verifyIntegrity}
              onChange={(e) => onVerifyIntegrityChange(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-gray-700">Weryfikuj integralność archiwum</span>
          </label>
        </div>
      )}

      {/* Import button */}
      <button
        onClick={onImport}
        disabled={!canImport}
        className={clsx(
          'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors',
          canImport
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
        )}
      >
        {loading ? (
          <>
            <SpinnerIcon className="w-5 h-5" />
            Importowanie...
          </>
        ) : (
          <>
            <UploadIcon className="w-5 h-5" />
            Importuj projekt
          </>
        )}
      </button>
    </div>
  );
}

// =============================================================================
// Preview Display
// =============================================================================

interface PreviewDisplayProps {
  preview: ArchivePreviewResponse;
}

function PreviewDisplay({ preview }: PreviewDisplayProps) {
  if (!preview.valid) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-700">{preview.error}</p>
      </div>
    );
  }

  const summary = preview.summary;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
      <div>
        <h4 className="font-medium text-gray-900 mb-2">{preview.project_name}</h4>
        {preview.project_description && (
          <p className="text-sm text-gray-600">{preview.project_description}</p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-gray-500">Wersja schematu:</dt>
          <dd className="font-mono text-gray-900">{preview.schema_version}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Data eksportu:</dt>
          <dd className="text-gray-900">
            {preview.exported_at
              ? new Date(preview.exported_at).toLocaleString('pl-PL')
              : '-'}
          </dd>
        </div>
      </dl>

      {summary && (
        <div className="border-t border-gray-200 pt-4">
          <h5 className="text-sm font-medium text-gray-700 mb-2">Zawartość archiwum:</h5>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Węzły:</dt>
              <dd className="text-gray-900">{summary.nodes_count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Gałęzie:</dt>
              <dd className="text-gray-900">{summary.branches_count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Zasilanie:</dt>
              <dd className="text-gray-900">{summary.sources_count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Obciążenia:</dt>
              <dd className="text-gray-900">{summary.loads_count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Diagramy SLD:</dt>
              <dd className="text-gray-900">{summary.sld_diagrams_count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Przypadki:</dt>
              <dd className="text-gray-900">
                {summary.study_cases_count + summary.operating_cases_count}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Analizy:</dt>
              <dd className="text-gray-900">
                {summary.analysis_runs_count + summary.study_runs_count}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Wyniki:</dt>
              <dd className="text-gray-900">{summary.results_count}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="border-t border-gray-200 pt-3 text-xs text-gray-400">
        Hash archiwum: {preview.archive_hash?.substring(0, 16)}...
      </div>
    </div>
  );
}

export default ProjectArchiveDialog;
