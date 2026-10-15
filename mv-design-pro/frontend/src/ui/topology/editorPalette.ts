/** Narzędzie kreatora na kanwie. Karta ETYKIETA-STACJI-PRZELOTOWEJ: dawna paleta
 *  `CREATOR_TOOLS`/`EDITOR_OBJECT_TYPES` (m.in. narzędzia „Stacja końcowa/przelotowa/odgałęźna/
 *  sekcyjna” z deklarowanym rodzajem) nie miała konsumenta — skasowana; został typ narzędzia. */
export type CreatorTool =
  | 'select'
  | 'move'
  | 'add_grid_source_sn'
  | 'continue_trunk_segment_sn'
  | 'insert_station_on_segment_sn'
  | 'start_branch_segment_sn'
  | 'connect_secondary_ring_sn'
  | 'set_normal_open_point'
  | 'add_converter_source_pv'
  | 'add_converter_source_bess'
  | 'edit_properties'
  | 'assign_catalog'
  | 'delete_element'
  | null;
