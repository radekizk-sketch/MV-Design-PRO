/**
 * PROFILE REFERENCYJNE ENEA — NIENARUSZAJĄCE ENM.
 *
 * Dane zaczerpnięte z oryginalnych standardów ENEA Operator, obowiązujących
 * od 01.01.2025. Nie są danymi katalogowymi konkretnego projektu.
 * Rozdzielnica do 630 kVA i uproszczona do 400 kVA NIE są zamienne.
 *
 * Oddziel fizyczne gabaryty i oszynowanie od symboli jednokreskowych.
 * Rozłącznik 1250/910 A to NASTAWA/ZDOLNOŚĆ APARATU,
 * a prąd znamionowy szyn (910/630 A) jest ODRĘBNYM parametrem.
 */
export interface EneaLvPanelProfile {
  readonly id: 'ENEA_SN_NN_630_2025' | 'ENEA_SN_NN_400_UPROSZCZONA_2025';
  readonly documentTitle: string;
  readonly effectiveDate: '2025-01-01';
  readonly sourceUrl: string;
  readonly sourceClause: string;
  readonly diagramId: 'rys.1' | 'rys.2';
  readonly maxTransformerKva: 630 | 400;
  readonly mainDeviceKind: 'ROZLACZNIK_IZOLACYJNY';
  readonly mainDeviceRatingA: 1250 | 910;
  readonly mainPoles: 3;
  readonly outgoingPositions: 12 | 5;
  readonly outgoingDeviceKind: 'ROZLACZNIK_BEZPIECZNIKOWY_LISTWOWY';
  readonly outgoingFuseSize: '2';
  readonly outgoingSinglePoleOperation: true;
  readonly busRatedCurrentA: 910 | 630;
  readonly busMaterial: 'Cu_Sn';
  readonly busWidthMm: 60 | 40;
  readonly busThicknessMm: 10;
  readonly busPitchMm: 185;
  readonly penBusMaterial: 'Cu_Sn';
  readonly penBusWidthMm: 60 | 40;
  readonly penBusThicknessMm: 10;
  readonly phaseNames: readonly ['L1','L2','L3'];
  readonly penName: 'PEN';
  /** Przekładniki na szynach za łącznikiem głównym — nie przed nim. */
  readonly currentTransformerPlacement: 'ZA_LACZNIKIEM_GLOWNYM';
  readonly currentTransformerRatio: '800:5';
  readonly currentTransformerAccuracy: '0,2s';
  readonly currentTransformerVa: 5;
  readonly currentTransformerFs: 5;
  readonly capacitorCompensation: 'TYLKO_JESLI_WYMAGANA';
  readonly reservePlaces: 'Z_WYMAGANYMI_OSLONAMI';
  readonly optionalFeatures: readonly string[];
  readonly excludedAssumptions: readonly string[];
}
export const ENEA_LV_PROFILES: readonly EneaLvPanelProfile[] = [
 {
  id:'ENEA_SN_NN_630_2025',
  documentTitle:'Stacje elektroenergetyczne średniego napięcia. Zeszyt 1. SN/nn do 630 kVA',
  effectiveDate:'2025-01-01',
  sourceUrl:'https://www.operator.enea.pl/media/683/stacje-elektroenergetyczne-sredniego-napiecia-zeszyt-1-stacje-transformatorowe-kompaktowe',
  sourceClause:'§4.4.1–4.4.13; §4.5; rys.1 (s. 11 PDF), rys.2 (s. 16 PDF)',
  diagramId:'rys.1',maxTransformerKva:630,
  mainDeviceKind:'ROZLACZNIK_IZOLACYJNY',mainDeviceRatingA:1250,mainPoles:3,
  outgoingPositions:12,outgoingDeviceKind:'ROZLACZNIK_BEZPIECZNIKOWY_LISTWOWY',
  outgoingFuseSize:'2',outgoingSinglePoleOperation:true,
  busRatedCurrentA:910,busMaterial:'Cu_Sn',busWidthMm:60,busThicknessMm:10,
  busPitchMm:185,penBusMaterial:'Cu_Sn',penBusWidthMm:60,penBusThicknessMm:10,
  phaseNames:['L1','L2','L3'],penName:'PEN',
  currentTransformerPlacement:'ZA_LACZNIKIEM_GLOWNYM',
  currentTransformerRatio:'800:5',currentTransformerAccuracy:'0,2s',currentTransformerVa:5,currentTransformerFs:5,
  capacitorCompensation:'TYLKO_JESLI_WYMAGANA',reservePlaces:'Z_WYMAGANYMI_OSLONAMI',
  optionalFeatures:['kondensator kompensacji biegu jałowego przez rozłącznik bezpiecznikowy skrzynkowy 00 — warunkowo','szafa AMI i telemechanika — urządzenia pomocnicze, nie odpływy SN/nN'],
  excludedAssumptions:['ACB jako łącznik główny bez danych modelu','sprzęgło dwóch sekcji','mieszanie stacji kompaktowej SN/nN z rozdzielnią GPZ 110 kV/SN']
 },
 {
  id:'ENEA_SN_NN_400_UPROSZCZONA_2025',
  documentTitle:'Stacje elektroenergetyczne średniego napięcia. Zeszyt 2. SN/nn do 400 kVA uproszczone',
  effectiveDate:'2025-01-01',
  sourceUrl:'https://www.operator.enea.pl/media/684/stacje-elektroenergetyczne-sredniego-napiecia-zeszyt-2-stacje-transformatorowe-kompaktowe',
  sourceClause:'§4.4.1–4.4.12; §4.5; rys.1 i rys.2',
  diagramId:'rys.1',maxTransformerKva:400,
  mainDeviceKind:'ROZLACZNIK_IZOLACYJNY',mainDeviceRatingA:910,mainPoles:3,
  outgoingPositions:5,outgoingDeviceKind:'ROZLACZNIK_BEZPIECZNIKOWY_LISTWOWY',
  outgoingFuseSize:'2',outgoingSinglePoleOperation:true,
  busRatedCurrentA:630,busMaterial:'Cu_Sn',busWidthMm:40,busThicknessMm:10,
  busPitchMm:185,penBusMaterial:'Cu_Sn',penBusWidthMm:40,penBusThicknessMm:10,
  phaseNames:['L1','L2','L3'],penName:'PEN',
  currentTransformerPlacement:'ZA_LACZNIKIEM_GLOWNYM',
  currentTransformerRatio:'800:5',currentTransformerAccuracy:'0,2s',currentTransformerVa:5,currentTransformerFs:5,
  capacitorCompensation:'TYLKO_JESLI_WYMAGANA',reservePlaces:'Z_WYMAGANYMI_OSLONAMI',
  optionalFeatures:['kondensator kompensacji biegu jałowego przez rozłącznik bezpiecznikowy skrzynkowy 000 — warunkowo','szafa AMI — obwód pomocniczy'],
  excludedAssumptions:['ACB jako łącznik główny bez danych modelu','sprzęgło dwóch sekcji','12 pól odpływowych układu 630 kVA']
 }
] as const;

export function profileEneaPoId(id:EneaLvPanelProfile['id']): EneaLvPanelProfile {
 const p=ENEA_LV_PROFILES.find(p=>p.id===id);
 if(!p)throw new Error('Nieznany profil standardu ENEA');
 return p;
}

/** Rozróżnienie układu jednokreskowego i rozmieszczenia fizycznego. */
export const ENEA_PRESENTATIONS = ['SCHEMAT_JEDNOKRESKOWY','ROZMIESZCZENIE_APARATURY'] as const;
