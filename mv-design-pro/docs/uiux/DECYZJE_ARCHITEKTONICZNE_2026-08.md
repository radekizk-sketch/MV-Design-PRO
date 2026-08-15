# DECYZJE ARCHITEKTONICZNE — odpowiedź na AUDYT Phase A–D (2026-08-13)

Status: WIĄŻĄCE (dyrektywa właściciela 2026-08-13: „wykonaj niezbędne decyzje
architektoniczne i wdrażaj do 100"). Podstawa: `AUDYT MV-DESIGN-PRO Phase A–D`
(załącznik właściciela, badał `main@2026-08-12`; rekoncyliacja z gałęzią nadzoru
2026-08-13 potwierdziła aktualność ustaleń: flaga `USE_LAYOUT_V3` żyje,
`ENM_INSPECTOR_VISIBLE=false`, dwie palety komend, cztery moduły kreatora
stacji, zero śladu N-1 w `application/analyses`).

Nadrzędna diagnoza audytu przyjęta bez zastrzeżeń: fundamenty spec-a ISTNIEJĄ
(jeden model, trace, freshness, readiness, katalog-first); głównym długiem jest
klasa DUPLICATED — dwie powłoki, dwie palety, cztery kreatory.

## Decyzje

**D1 — NAWIGACJA: kanon = 7 przestrzeni ui2 (W-110).** WDROŻONA (fala 10, karta
NAWIGACJA-JEDEN-KANON). Pomiar przy wdrożeniu skorygował diagnozę: rejestr
`areaRegistry` nie był *drugą nawigacją w użyciu* — jego 9 definicji (etykiety,
ikony, tooltipy, testidy `nav-area-*`, skróty Ctrl+1–9) nie miało ANI JEDNEGO
konsumenta produkcyjnego, a skróty Ctrl+1–9 nie były nigdzie obsługiwane. Żywy
był wyłącznie `AreaId` jako klucz panelu kontekstu plus utrwalany, równoległy
stan `activeArea`. Kanon: jedna tabela `ui2/legacy/mostObszarow.TRASY_KANONICZNE`
(trasa → przestrzeń + obszar panelu), zapadka
`scripts/nawigacja_jeden_kanon_guard.py`. Mapowanie 9 obszarów
legacy → 7 przestrzeni przyjęte wprost wg tabeli C.2 audytu. Trasy hash legacy
(`#sld #analysis #variants #switchgear #catalog…`) wygaszane przez
`mostTrasyPrzestrzeni`; `ui/navigation/areaRegistry` przestaje być wejściem.
Moduły ZAB/JEN/RfG/KAT NIE stają się przestrzeniami — są powierzchniami wg C.1.

**D2 — SHELL V3: USUNIĘTY.** WYKONANE (fala 10). Flaga była martwa w całości:
gałąź za nią (`ui/layout/CanonicalLayoutV3.tsx`) skasowano już w `3693c01e`, więc
pozostał sam przełącznik bez odbiorcy. Flaga `USE_LAYOUT_V3` i jej martwa gałąź znikają
na amen (zasada inżynierska nr 1: bez warstw kompatybilności; audyt: klasa
DUPLICATED). Cel „więcej kanwy" został osiągnięty na W-110 kartą K11 (SLD-first).
Ewentualna redukcja chromu 146→76 px = przyszła karta NA W-110, nie równoległa
powłoka za flagą.

**D3 — KREATORY: kanon = `ui2/kreatory`.** Jedyna ścieżka użytkownika.
Kontrakty `station-wizard-v2` (transformer, earthing, interlocking, CT/VT,
protection, powerQuality, SCADA, ncRfg, readinessMatrix) zostają jako
BIBLIOTEKA kontraktów konsumowana przez ui2. `station-configurator`,
`StationTemplateWizard`+`BatchPlanner`: pomiar importerów rozstrzyga —
nieosiągalne wygaszamy, osiągalne przepinamy do ui2 i wygaszamy źródło.

**D4 — PALETA KOMEND: jedna (`ui2/search`).** WYKONANE (fala 10). Inwentarz
komend przy kasacji: duplikat `ui/network-build/CommandPalette` nie miał
konsumenta ani skrótu (Ctrl+Shift+P nieobsługiwany), a jego pozycje menu SLD
rozsyłały zdarzenie bez odbiorcy. Jedyna unikalna zdolność — otwieranie okien
E-XX — przeniesiona do kanonu jako grupa „Ekrany". Komendy unikalne z
`ui/network-build/CommandPalette` przeniesione, duplikat usunięty.

**D5 — PULPIT: mapa procesu + NBA.** Mapa 8 etapów na istniejącej osi E1–E8
(kolejność kroków z karty K4) + JEDNA „Następna najlepsza akcja" wyprowadzona z
istniejącego kontraktu readiness/fixAction. Zakaz nowych klas severity w UI
(audyt pkt I): UI egzekwuje kontrakt backendu.

**D6 — DIALOG SKUTKÓW PRZED ZMIANĄ.** Wzorzec: istniejące
`BatchEditPreviewDialog` + `PanelCoSieZmienilo` (dziś po fakcie). Przewidywanie
skutków wymaga trybu preview/dry-run w domain-ops — jeśli operacje go nie
niosą, rozbudowa ADDYTYWNA po stronie backendu (zero fizyki w UI).

**D7 — DIAGNOZA PRZEBIEGU: z flagi dev do produkcji.** Istniejący
`diagnostics/` engine dostaje powierzchnię „Diagnoza przebiegu" w przestrzeni
Obliczenia (diagnoza braku zbieżności, preflight). `enm-inspector` pozostaje
narzędziem dev.

**D8 — N-1 (enumeracja kontyngencji): NOWA ZDOLNOŚĆ, backend najpierw.**
Warstwa `application/analyses` — ORKIESTRACJA istniejących solverów (wyłączenie
elementu → bieg → macierz skutków: przeciążenia, napięcia, utrata zasilania),
NIE nowy solver; WHITE BOX per przypadek; kontrakt wyniku addytywny; ekran w
Wynikach po domknięciu kontraktu.

**D9 — Z(f) (skan impedancji harmonicznej): PO N-1.** Realna fizyka (model
częstotliwościowy sieci) — projekt warstwy solverowej wg właściwej normy, z
White Box i sanity-bounds; osobna duża karta.

**D10 — ZABEZPIECZENIA-100.** Jedna karta scala: montaż
`protection_coordination` pod `/api` (7 istniejących tras + 2 brakujące
eksporty; decyzja z rejestru: domknąć, nie kasować), TCC interaktywny (drag
nastaw z detekcją kolizji i minimalną korektą — kontrakt na ISTNIEJĄCYM silniku
koordynacji, fizyka w backendzie), wygaszenie martwych końców klienta.

**D11 — Progi RfG wersjonowane (threshold set OSD)** w ustawieniach sieci — P2.

**D12 — 8760 (analiza roczna)** — odroczona decyzją produktową do czasu
domknięcia D8/D9 (koszt duży, zależność od profili; dług nazwany, nie cichy).

**D13 — Role z kolejkami: kontrakt ról zmapowany na istniejące tryby**
(Podstawowy/Rozszerzony/Ekspercki + MODEL_EDIT/RESULT_VIEW). Kolejki per rola
ODROCZONE świadomie (funkcja wielostanowiskowa wymaga decyzji produktowej
właściciela o modelu współpracy) — dług nazwany w rejestrze.

**D14 — Wirtualizacja tabel = wymóg DoD** każdej nowej/dotykanej tabeli wyników.

## Kolejność wdrożenia (fale nadzoru)

1. **Fala 9 (już w biegu równolegle):** MINI-RMU-CAD (podgląd pól do jakości
   CAD) · N-1-BACKEND (D8).
2. **Fala 10:** NAWIGACJA-JEDEN-KANON (D1+D2+D4 w jednej karcie frontowej —
   wspólne pliki powłoki).
3. **Fala 11:** KREATORY-DEDUP (D3) · PULPIT-NBA (D5) · IMPACT-DIALOG (D6) ·
   DIAGNOZA-PRZEBIEGU (D7).
4. **Fala 12:** ZABEZPIECZENIA-100 (D10) · N-1 ekran (dokończenie D8).
5. **Fala 13:** Z(f) (D9) · progi OSD (D11) · UI migracji katalogu · decyzja 8760 (D12).

Luki O.1–O.7 audytu mają właścicieli: O.1→D8, O.2→D9, O.3→D12, O.4→D13,
O.5→D10, O.6→fala 13, O.7→D2 (rozstrzygnięta).
