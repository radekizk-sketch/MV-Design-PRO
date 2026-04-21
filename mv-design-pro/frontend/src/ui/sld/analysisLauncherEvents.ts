export const OPEN_SLD_ANALYSIS_LAUNCHER_EVENT = 'open-sld-analysis-launcher';

export function dispatchOpenSldAnalysisLauncherEvent(): void {
  window.dispatchEvent(new CustomEvent(OPEN_SLD_ANALYSIS_LAUNCHER_EVENT));
}
