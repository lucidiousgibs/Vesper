import { usePersistentState } from "./usePersistentState";

const LEGEND_OPEN_KEY = "vesper.map.legendOpen";
const SHOW_SERVICE_ICONS_KEY = "vesper.map.showServiceIcons";
const SHOW_FW_CONTESTED_KEY = "vesper.map.showFwContested";
const SHOW_SOV_KEY = "vesper.map.showSov";
const SHOW_INCURSIONS_KEY = "vesper.map.showIncursions";
const SHOW_DANGER_ZONE_KEY = "vesper.map.showDangerZone";
const SHOW_SCOUT_CONNECTIONS_KEY = "vesper.map.showScoutConnections";
const SHOW_JUMP_BRIDGES_KEY = "vesper.map.showJumpBridges";
const SHOW_ANNOTATIONS_KEY = "vesper.map.showAnnotations";
const SHOW_TERRITORY_KEY = "vesper.map.showTerritory";
const TERRITORY_MODE_KEY = "vesper.map.territoryMode";
const HEAT_MODE_KEY = "vesper.map.heatMode";
const SHOW_CONTACT_TRAILS_KEY = "vesper.map.showContactTrails";
const SHOW_ROUTE_PARTICLES_KEY = "vesper.map.showRouteParticles";
const SHOW_LIKELY_CAMPS_KEY = "vesper.map.showLikelyCamps";
const SHOW_GRID_LABELS_KEY = "vesper.map.showGridLabels";

/** Whether the Map screen's key/legend panel is open, whether the
 * DOTLAN-style service icons show under system names, whether contested
 * faction-warfare systems get their own ring, whether null-sec sovereignty
 * ownership/vulnerability shows, whether active incursions are marked, and
 * which last-hour aggregate the background heat glow reads from. The first
 * two default to on (matching the map's existing out-of-the-box look);
 * every other filter here defaults off/kills - niche filters most sessions
 * don't need lit up by default - persisted so these stick across tab
 * switches instead of resetting every time MapView remounts. */
export function useMapDisplayPrefs() {
  const [legendOpen, setLegendOpen] = usePersistentState<boolean>(LEGEND_OPEN_KEY, true);
  const [showServiceIcons, setShowServiceIcons] = usePersistentState<boolean>(SHOW_SERVICE_ICONS_KEY, true);
  const [showFwContested, setShowFwContested] = usePersistentState<boolean>(SHOW_FW_CONTESTED_KEY, false);
  const [showSov, setShowSov] = usePersistentState<boolean>(SHOW_SOV_KEY, false);
  const [showIncursions, setShowIncursions] = usePersistentState<boolean>(SHOW_INCURSIONS_KEY, false);
  const [showDangerZone, setShowDangerZone] = usePersistentState<boolean>(SHOW_DANGER_ZONE_KEY, false);
  const [showScoutConnections, setShowScoutConnections] = usePersistentState<boolean>(SHOW_SCOUT_CONNECTIONS_KEY, false);
  const [showJumpBridges, setShowJumpBridges] = usePersistentState<boolean>(SHOW_JUMP_BRIDGES_KEY, false);
  const [showAnnotations, setShowAnnotations] = usePersistentState<boolean>(SHOW_ANNOTATIONS_KEY, false);
  const [showTerritory, setShowTerritory] = usePersistentState<boolean>(SHOW_TERRITORY_KEY, false);
  const [territoryMode, setTerritoryMode] = usePersistentState<"sov" | "standings">(TERRITORY_MODE_KEY, "sov");
  const [heatMode, setHeatMode] = usePersistentState<"kills" | "traffic" | "npc">(HEAT_MODE_KEY, "kills");
  // Premium-deck map effects (see the Effects settings for the animation budget
  // they share). Both are on by default because they carry real information
  // (where kills just happened, which way the route runs).
  const [showContactTrails, setShowContactTrails] = usePersistentState<boolean>(SHOW_CONTACT_TRAILS_KEY, true);
  const [showRouteParticles, setShowRouteParticles] = usePersistentState<boolean>(SHOW_ROUTE_PARTICLES_KEY, true);
  const [showLikelyCamps, setShowLikelyCamps] = usePersistentState<boolean>(SHOW_LIKELY_CAMPS_KEY, false);
  const [showGridLabels, setShowGridLabels] = usePersistentState<boolean>(SHOW_GRID_LABELS_KEY, true);

  return {
    legendOpen,
    setLegendOpen,
    showServiceIcons,
    setShowServiceIcons,
    showFwContested,
    setShowFwContested,
    showSov,
    setShowSov,
    showIncursions,
    setShowIncursions,
    showDangerZone,
    setShowDangerZone,
    showScoutConnections,
    setShowScoutConnections,
    showJumpBridges,
    setShowJumpBridges,
    showAnnotations,
    setShowAnnotations,
    showTerritory,
    setShowTerritory,
    territoryMode,
    setTerritoryMode,
    heatMode,
    setHeatMode,
    showContactTrails,
    setShowContactTrails,
    showRouteParticles,
    setShowRouteParticles,
    showLikelyCamps,
    setShowLikelyCamps,
    showGridLabels,
    setShowGridLabels,
  };
}
