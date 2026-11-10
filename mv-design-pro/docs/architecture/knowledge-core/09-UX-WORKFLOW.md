# 09. EKC — UX/UI, WORKFLOW UŻYTKOWNIKA, REVIEW, WYNIKI I MIGRACJA PROJEKTÓW

**Charakter:** interfejs docelowy do decyzji, bez implementacji komponentów. Nie tworzyć osobnego duplikatu UI2/referencje; stosować istniejący Shell/Inspector/Search/Results i aktualny model nawigacji.

## 1. Nadrzędna koncepcja

W aplikacji jest jedna przestrzeń „Baza wiedzy” i kontekstowe odwołania „Podstawa”:
- Baza: zarządzanie źródłami, edycjami, rekordami, zmianami, przeglądami i publikacjami;
- Inspektor elementu: odpowiednie wymagania i źródła dla zaznaczonej stacji/pola/urządzenia/odcinka;
- Wynik obliczenia: użyta metoda, parametry, założenia, wydanie normy i odnośnik do wzoru/tabeli;
- Katalog: przy parametrach urządzenia link do karty producenta i właściwych wymagań OSD;
- Projekt: profil operatora, data obowiązywania, wersja wiedzy, odstępstwa i stan zgodności;
- Asystent: odpowiedź językiem naturalnym, bez oddzielnego źródła prawdy.

Preferować hierarchię 2-level: index/search -> detail drawer; dłuższa praca redakcyjna tylko dla review/importer. W bieżącym SLD schemat ma dominować; EKC nie może zajmować połowy canvas na stałe.

## 2. Nawigacja i nazewnictwo PL

Globalny punkt „Baza wiedzy” (ikona neutralnego podręcznika/warstw źródeł, bez dekoracyjnego dashboardu). Zakładki: Dokumenty | Wymagania | Wzory | Tabele | Powiązania | Zmiany | Do zatwierdzenia. Filtry: OSD, rodzina, wydanie, status, zakres SN/nN/GPZ/OZE/linia, data ważności, typ źródła, zatwierdzone/niezatwierdzone, używane w projekcie. Search: swobodne pytanie oraz techniczne tokeny IEC 60909, I''k, κ, CT, Ferranti, R/X, ENEA Z1.

Wyniki mają formę zwartej listy: tytuł, krótki zakres, edition/date, kind, evidence quality, links. Nie pokazywać pełnych tekstów norm, osobno preview uprawniony.

Statusy nie mogą wymuszać jednego „zielonego score”: Zatwierdzone; Do weryfikacji; Nie oceniono; Nie dotyczy; W konflikcie; Nieaktualne źródło; Brak danych; Bez dostępu do dokumentu. Kolory mogą wspierać, lecz semantyka musi być widoczna w tekście i dla screen reader.

## 3. Proces dodawania nowego PDF

### Ekran A — wybór i rejestracja
Obszar: Dodaj plik PDF / Dodaj źródło z URL / Wpisz metadane bez pliku. Pola: dokument family, designation, edition (suggested from file but confirm), publisher, kind, language, issue/effective date, source URL, license owner and entitlement; source hashes and duplicate detection shown only after import. Duplicate binary result does not auto-merge normative editions. If file is protected, display permission confirmation.

### Ekran B — diagnoza jakości
Cards: strony z tekstem / skanowane / bad encoding / obroty / równania / tabele / rysunki / sprawdzenie kompletności; raw count and errors. Example for supplied IEC 2016: 82 PDF pages, scan, requires visual review of equation/table; no automatic label „100% norm verified” on finishing OCR.

### Ekran C — ekstrakcja kandydatów
Table of candidates with type, section, page, confidence, whether visual verification required, possible duplicate record ID, difference vs older edition. Search/filter by high-risk math/table, unresolved note. Auto-labeled candidate, no direct publishing.

### Ekran D — weryfikacja
Side-by-side original PDF page/crop on left (when authorized) and structured data on right. For formula show render and typed variables/units; table show rows, range endpoints and footnotes; requirement show modal semantics, scope predicates, exceptions; live validators not physics solver. Reviewer must explicitly confirm source edition, content, units, applicability, privileges and potential duplicates. A change saves a new revision and records reviewer.

### Ekran E — publikacja
Summary of source coverage (# pages, # records, # verified vs extracted-only, # incomplete), release dependencies, conflicting records, implementation bindings and tests, license; button Publikuj only with approver role and gate pass. Partial source may publish informational cards but not a verified compliance rule.

## 4. Przykład „Pokaż podstawę” z SLD

User clicks station SN/nN:
- inspector shows selected station type and ENM topology attributes, not inferred from drawn icon;
- „Podstawy projektowe”: ENEA Z1 06.2024 if applicable, IEC product standard, manufacturer's specific station kit; each row with status;
- „Kontrole”: count of line bays, one TR bay, rated Ur, short-time withstand, IAC and remote control checks;
- clicking failed/unknown opens exact missing data or source evidence and action in domain form, not generic „zgodność 80%”.
- For unknown station variant, show „Nie oceniono — brak wariantu konstrukcji”, NOT broad 1–4 lines pseudo PASS.
- If old source edition applies, show accepted project lock and optional new edition migration notice separately.

## 5. Przykład „Dlaczego I''k tyle wynosi?”

In short-circuit results:
- result: numeric I''k with units, case MAX/MIN and fault kind, time and reproducibility hash;
- „Założenia”: source Sk''/R/X and voltage factor c including source/assumption classification;
- „Metoda”: edition locked, equation ID and page;
- „Wkłady”: WN equivalent, transformer, lines, generators, inverters, per source if solver supports;
- „Weryfikacja”: source and input checks, missing data, difference from selected standard (e.g. manually entered cmin=0.95 vs 2016 1.00);
- „Historia”: old locked result and preview difference under newer approved release, never auto-overwrite.
Proof can be exported as compact source-referenced section.

## 6. Migracja wiedzy w projekcie

User opens Project Settings -> Podstawa normowa:
- active project lock hash, operator, jurisdiction, effective project date;
- applied documents with editions, corrections, locked source refs, reviewer;
- available newer releases and their *verified* differences;
- impact list by domains and which runs need recompute;
- actions: Porównaj / Pozostaw / Utwórz nową wersję projektu (explicit migration).
Change preview displays: changed table cell, affected parameter, actual calculated result before/after when computed in isolated preview, uncertainty and excluded effects. Approval produces new ENM/case snapshot or versioned norm lock as architecture permits, never silent mutation.
For old project not updated, status „Na podstawie wydania X — dostępne Y”, not generic „błąd projektu”.

## 7. Edycje i dokumenty w pasku wyszukiwania

Search by technical identifier:
IEC 60909-0 -> edition timeline (2016 vs 2026 and PN adoption separately), source availability, verification status.
ENEA SN Z1 -> both 09.2021-2 and 06.2024 with exact dates and impact.
CT 0.2/5P burden -> related 61869, manufacturer product and ENEA drawing, not one invented scalar.
User query “czy mogę zastosować nową stację słupową z kablowym podejściem SN?” -> answer from a verified ENEA card only, with scope new station and section/page; otherwise evidence-only and not definitive. System must show if currently indexed records cover only part of standards.

## 8. Pokrycie norm a wyniki projektu

Coverage bar is allowed for **process completion** only: Registered documents, Indexed, Manually reviewed, Approved records, Implemented rules, Live-used rules; not “normative compliance percentage”. Compliance checklist result per rule. Avoid aggregation that marks an unknown source as part of success denominator.

Rule statuses: Pass, Fail, Unknown data, Not applicable, Conflict, Source inaccessible, Not implemented, Outdated basis. In user summary count each separately; click drills down to element references.

## 9. Interakcje i bezpieczeństwo

Files/URL imports need explicit admin rights. Viewer of public app cannot upload document directly into globally active release. „Pokaż PDF” checks license/ACL; if not permitted show source metadata and instructions for authorized access, not a broken link. Search never previews private normative text to other tenants. Public report may show a citation, not the PDF screenshot. Audit log stores who viewed/downloaded/published source when necessary, but not contents.

Review controls must work and show server confirmation: Zapisz propozycję, Przekaż do weryfikacji, Zatwierdź, Odrzuć, Zbuduj wydanie, Publikuj. Disabled controls need explanation for missing permission/source, no ornamental buttons. Frontend never sets state „published” from local optimistic data before backend confirms.

## 10. Responsywność i dostępność

Desktop engineer: document pane 280–340 px, main result, right evidence inspector optional. Mobile: search and document/result info in stacked cards, evidence crop optional full width only when genuinely useful. Large tables use horizontal scroll and sticky row labels; preserve units. Dark/light complete parity and stable technical diagrams; symbols remain independent of color. Keyboard accessible source navigation, aria descriptions and clear focus.

Rendering math: MathML/LaTeX display from trusted sanitized field, screen-reader alternative with variable glossary. Never send untrusted LaTeX into unrestricted HTML evaluator. Long formulas should wrap/scroll without truncating signs or indices. Decimal comma for Polish display while internally decimal strings canonical; units remain authoritative.

## 11. Determinism and snapshot UI

A snapshot screenshot and exported report must derive from a single atomically versioned case projection: ENM, results, catalog and norm release. Do not compose results from two independent HTTP calls returning different live revisions; use a projection token/run ID. Inactive/working/failed computed state visible, but not SCADA animation. Citation click should not change network selection or solver values. User adjusting normative profile requires deliberate apply action and resulting new lock.

## 12. UX acceptance tests

UX-01 Import scanned IEC: correct 82 page count, OCR uncertainty and form of candidate.
UX-02 Import Dołęga corrupted encoding: warning with manual verification path.
UX-03 Source license restricted: no inline PDF preview and no snippet, metadata if allowed.
UX-04 Rule source edition mismatch: display conflict/warning not success.
UX-05 IEC short circuit result: click c -> version/table row -> exact page.
UX-06 ENEA station unknown variant: missing-data message, no arbitrary passing union.
UX-07 Project migration preview preserves old results and emits new release only on explicit action.
UX-08 Formula long/math symbols readable on mobile and print.
UX-09 Whole UI in Polish engineering language, no false „automatically compliant”.
UX-10 Report and SLD inspector read same release/version via backend projection token.
UX-11 Unauthorized approve button never performs mutation.
UX-12 Search without result says „Nie znaleziono w przeszukanym zasobie”, never „brak takiego przepisu”.
UX-13 Known current standard may show as meta while content not licensed; not „verified requirement”.
UX-14 Two dates: source valid date and project lock effective date visibly distinct.
UX-15 Freshness states source update vs stale computation use different wording and visual semantics.

## 13. Review gate for UI implementation

No UI PR accepted without interaction proofs in actual app, screenshots under light/dark and desktop/mobile, keyboard/accessibility smoke, browser data version consistency and verification that base SLD is unchanged. Displaying a pretty mockup is not proof the knowledge is used in live computation; source trace must be backed by backend IDs and actual result run.
