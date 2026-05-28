param(
  [Parameter(Mandatory = $false)]
  [ValidatePattern('^[a-z0-9_]+$')]
  [string]$Feature = 'engineering_flow',

  [Parameter(Mandatory = $false)]
  [ValidateRange(30, 1800)]
  [int]$TimeoutSeconds = 300
)

$ErrorActionPreference = 'Stop'

# Run from mv-design-pro repository root.
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$audits = 'docs/audits'
New-Item -ItemType Directory -Force -Path $audits | Out-Null

$claudeCmd = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claudeCmd) {
  throw 'Claude CLI not found. Install/configure claude before running this design review.'
}

$promptPath = Join-Path $audits "CLAUDE_DESIGN_REVIEW_${Feature}_${timestamp}.prompt.md"
$reviewPath = Join-Path $audits "CLAUDE_DESIGN_REVIEW_${Feature}_${timestamp}.md"
$decisionPath = Join-Path $audits "CLAUDE_DESIGN_REVIEW_${Feature}_${timestamp}.decision.md"
$metaPath = Join-Path $audits "CLAUDE_DESIGN_REVIEW_${Feature}_${timestamp}.meta.json"

$prompt = @'
You are reviewing MV-DESIGN-PRO as:
- a senior UX/product designer for engineering software,
- a SCADA/CAD interaction designer,
- a power-network workflow reviewer,
- a usability auditor for tools used by MV network designers.

Scope:
- Review only UI/UX, interaction, SLD readability, LOD, CAD behavior, layout, navigation, and workflow.
- Do not rewrite the product vision.
- Do not impose decorative visual taste.
- Do not invent electrical domain rules.
- Do not change solver physics or protection logic.
- Do not recommend fake simplifications that would break electrical meaning.
- Optimize for clarity, engineering workflow, discoverability, accessibility, consistency, low friction, and reduced operator error.

Context:
- The application is MV-DESIGN-PRO.
- Users are MV network designers, OSD engineers, protection engineers, and report/audit reviewers.
- The SLD must remain electrically meaningful and based on ENM/domain topology.
- The UI must support project creation, GPZ configuration, SN fields, cable/line runs, stations, branches, DER, readiness, calculations, protections, engineering justification, and reports.
- Active UI labels should be Polish and engineering-oriented.
- The default network-building flow should not force arbitrary line lengths.
- A station should normally be placed at the endpoint of the current section and then allow continuing the run from the station.
- Splitting an existing section should be a separate explicit operation with preview, cancel, commit, and audit.

Review tasks:
1. Identify the top UX friction points.
2. Identify ambiguous actions, dead ends, hidden states, confusing labels, overloaded screens, and places where the user must guess the next step.
3. Review whether the SLD communicates the power path clearly enough for an MV network designer.
4. Review whether click, double-click, right-click, hover, and keyboard interactions are predictable.
5. Review whether LOD helps engineering understanding instead of hiding important electrical meaning.
6. Review whether CAD tools such as pan, zoom, grid, snap, port magnets, routing, bend points, labels, and selection are discoverable and safe.
7. Propose 2-3 alternative interaction flows only where they reduce friction or risk.
8. Keep recommendations implementation-aware and testable.
9. Distinguish must-fix issues from optional polish.
10. Identify what must not be changed because it protects domain correctness.

Return exactly these sections:

# Summary of top UX risks

# Must-fix issues

# Suggested flow improvements

# Screen/component-level recommendations

# SLD/CAD/LOD recommendations

# Testable acceptance criteria

# Risks and trade-offs

# What not to change

# Recommended follow-up tests

Keep the review concise but actionable. Avoid vague advice. Every recommendation should be testable or explicitly marked as exploratory.
'@

$prompt | Set-Content -Path $promptPath -Encoding UTF8

$meta = [ordered]@{
  feature = $Feature
  timestamp = $timestamp
  command = 'claude -p <prompt>'
  timeout_seconds = $TimeoutSeconds
  prompt_path = $promptPath
  review_path = $reviewPath
  decision_path = $decisionPath
  cwd = (Get-Location).Path
  claude_path = $claudeCmd.Source
  exit_code = $null
  status = 'started'
  started_at = (Get-Date).ToString('o')
}
$meta | ConvertTo-Json -Depth 5 | Set-Content -Path $metaPath -Encoding UTF8

Write-Output "Running Claude design review for feature: $Feature"
Write-Output "Prompt: $promptPath"
Write-Output "Review: $reviewPath"
Write-Output "Decision log: $decisionPath"

$exitCode = 0
$review = ''
$resolvedPromptPath = (Resolve-Path $promptPath).Path
$job = Start-Job -ScriptBlock {
  param($ClaudePath, $PromptFile)
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [Console]::InputEncoding = $utf8
  [Console]::OutputEncoding = $utf8
  $OutputEncoding = $utf8
  $env:PYTHONIOENCODING = 'utf-8'
  $env:LC_ALL = 'C.UTF-8'
  $promptText = Get-Content -Raw -Path $PromptFile
  try {
    $output = & $ClaudePath -p $promptText 2>&1
    [pscustomobject]@{
      ExitCode = $LASTEXITCODE
      Output = ($output | Out-String)
    }
  } catch {
    [pscustomobject]@{
      ExitCode = 1
      Output = ($_ | Out-String)
    }
  }
} -ArgumentList $claudeCmd.Source, $resolvedPromptPath

try {
  $completed = Wait-Job -Job $job -Timeout $TimeoutSeconds
  if ($null -eq $completed) {
    Stop-Job -Job $job
    $exitCode = -1
    $review = "--- TIMEOUT ---`nClaude review timed out after $TimeoutSeconds seconds."
  } else {
    $jobResult = Receive-Job -Job $job
    if ($jobResult) {
      $exitCode = [int]$jobResult.ExitCode
      $review = [string]$jobResult.Output
    } else {
      $exitCode = 1
      $review = 'Claude job returned no output.'
    }
  }
} finally {
  Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
}
$review | Set-Content -Path $reviewPath -Encoding UTF8

$decision = @"
# Claude Design Review Decision Log — $Feature

Review: $reviewPath
Prompt: $promptPath
Meta: $metaPath

## Accepted

- _Fill after reading the review. Each accepted item must preserve ENM/domain correctness and have a planned test._

## Rejected

- _Fill with reason. Typical reasons: conflicts with ENM/domain rules, violates frozen APIs, adds physics to UI, or duplicates existing canonical behavior._

## Deferred

- _Fill with reason, owner/surface, and required prerequisite._

## Implementation Notes

- Do not implement UI/UX, SLD, LOD, CAD, navigation, or workflow changes unless they are listed in Accepted.
- Claude review is a flow/readability checkpoint, not domain truth. ENM, catalog contracts, solvers, tests, and active V12.xx canon remain authoritative.
"@
$decision | Set-Content -Path $decisionPath -Encoding UTF8

$meta.exit_code = $exitCode
$meta.status = if ($exitCode -eq 0) { 'completed' } else { 'failed' }
$meta.completed_at = (Get-Date).ToString('o')
$meta.output_bytes = ([Text.Encoding]::UTF8.GetByteCount($review))
$meta | ConvertTo-Json -Depth 5 | Set-Content -Path $metaPath -Encoding UTF8

if ($exitCode -ne 0) {
  throw "claude -p failed with exit code $exitCode. Output saved to $reviewPath"
}

Write-Output "Saved $reviewPath"
Write-Output "Saved $decisionPath"
Write-Output "Saved $metaPath"
Write-Output ''
Write-Output 'Next step: fill Accepted / Rejected / Deferred in the decision log before implementation.'
Write-Output ''
Write-Output $review
