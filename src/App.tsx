import { lazy, Suspense, useEffect, useLayoutEffect, useState } from "react";
import Sidebar, { NAV_ITEMS } from "./components/Sidebar";
import TopBar from "./components/TopBar";
import MainContent from "./components/MainContent";
import Dashboard from "./components/Dashboard";
import ProximityFlashOverlay from "./components/ProximityFlashOverlay";
import UpdateBanner from "./components/UpdateBanner";
import WhatsNewModal from "./components/WhatsNewModal";
import { useWhatsNew } from "./hooks/useWhatsNew";

// Every other page is lazy-loaded - each one only needs its (often
// substantial, e.g. React Flow for the wormhole finder) code once the user
// actually navigates there, instead of all of it landing in the initial
// startup bundle alongside the shell and Dashboard.
const CharacterDetail = lazy(() => import("./components/CharacterDetail"));
const KillsIntel = lazy(() => import("./components/KillsIntel"));
const MapPage = lazy(() => import("./components/MapPage"));
const MailPage = lazy(() => import("./components/MailPage"));
const WalletMarketPage = lazy(() => import("./components/WalletMarketPage"));
const PlanetaryIndustry = lazy(() => import("./components/PlanetaryIndustry"));
const SettingsPage = lazy(() => import("./components/SettingsPage"));
const CalendarPage = lazy(() => import("./components/CalendarPage"));
const FittingsPage = lazy(() => import("./components/FittingsPage"));
const PathWormholeFinderPage = lazy(() => import("./components/PathWormholeFinderPage"));
const IndustryPage = lazy(() => import("./components/IndustryPage"));
const MiningPage = lazy(() => import("./components/MiningPage"));
const MultiboxPage = lazy(() => import("./components/MultiboxPage"));
import type { SystemSummary } from "./components/SystemKillboard";
import type { CorporationSummary } from "./components/CorporationKillboard";
import type { AllianceSummary } from "./components/AllianceKillboard";
import type { GateSummary } from "./components/GateKillboard";
import type { MarketItemRef } from "./components/MarketBrowser";
import LoginScreen from "./components/LoginScreen";
import { getSession, setActiveCharacter, logoutCharacter, startLogin, type Session } from "./lib/eve";
import { DASHBOARD_SCOPES } from "./lib/scopes";
import { useErrorReporter } from "./hooks/useErrorReporter";
import { useMultiboxAutoDetect } from "./hooks/useMultiboxAutoDetect";
import { CharacterLocationProvider } from "./hooks/useCharacterLocation";
import { ChainAutoMappingEffect } from "./hooks/useChainAutoMapping";
import { SkillQueueWatchEffect } from "./hooks/useSkillQueueWatch";
import { TrackedEntityEventsEffect } from "./hooks/useTrackedEntityEvents";
import { TrackedGateCampWatchEffect } from "./hooks/useTrackedGateCampWatch";
import ToastStack from "./components/ToastStack";
import CommandPalette from "./components/premium/CommandPalette";
import SystemLogPanel from "./components/premium/SystemLogPanel";
import BootSequence from "./components/premium/BootSequence";
import { logEvent } from "./lib/eventLog";
import { useDefaultLandingTab } from "./hooks/useDefaultLandingTab";
import { useEffectsApplier } from "./hooks/useEffects";
import { useTheme } from "./hooks/useTheme";
import { splitFavouriteId } from "./lib/subTabs";
import "./App.css";
// Premium deck themes (Bulkhead/Cold Ballast/Command Deck/Amber Exchange) live entirely
// outside App.css, in their own small stylesheet architecture - never
// capable of altering the six standard themes above. premium-structure.css
// is scoped behind :root[data-theme="x"] selectors since it retrofits
// classes standard themes also use; premium-instruments.css isn't scoped
// the same way, since every class it styles (.annunciator,
// .mechanical-button, .screen-housing, .premium-dashboard*) belongs to
// brand-new components under src/components/premium/ that only ever
// render from behind an isPremiumTheme(theme) check in the first place -
// see that file's own header for why. Tokens first, then the shared
// component language every deck reads those tokens through, then the new
// hardware library + Premium Dashboard, then each deck's own
// distinguishing geometry.
import "./themes/premium/premium-tokens.css";
import "./themes/premium/premium-structure.css";
import "./themes/premium/premium-instruments.css";
import "./themes/premium/bulkhead.css";
import "./themes/premium/cold-ballast.css";
import "./themes/premium/command-deck.css";
import "./themes/premium/amber-exchange.css";
import "./themes/premium/phosphor-green.css";
import "./themes/premium/holographic.css";
import "./themes/premium/premium-tokens-extra.css";
import "./themes/premium/premium-glass.css";
import "./themes/premium/premium-terminal.css";
import "./themes/premium/premium-decks-extra.css";
// The Effects settings as CSS (intensity variables, animation gates, grain). Last, so
// its gates win over the per-deck rules above.
import "./themes/premium/premium-fx.css";
// Signal tiers (feed rows, critical and flood toasts) under a premium deck.
import "./themes/premium/premium-signal.css";

let startLogged = false;
/** Pages opened so far this session, for the first-open panel boot-up. */
const visitedPages = new Set<string>();

function App() {
  const [activeId, setActiveId] = useDefaultLandingTab(NAV_ITEMS[0].id);
  useEffectsApplier();
  useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailCharacterId, setDetailCharacterId] = useState<number | null>(null);
  const [pendingKillmailId, setPendingKillmailId] = useState<number | null>(null);
  const [pendingSystem, setPendingSystem] = useState<SystemSummary | null>(null);
  const [pendingCharacterId, setPendingCharacterId] = useState<number | null>(null);
  const [pendingCorporation, setPendingCorporation] = useState<CorporationSummary | null>(null);
  const [pendingAlliance, setPendingAlliance] = useState<AllianceSummary | null>(null);
  const [pendingGate, setPendingGate] = useState<GateSummary | null>(null);
  const [pendingMarketItem, setPendingMarketItem] = useState<MarketItemRef | null>(null);
  const [pendingFitShipTypeId, setPendingFitShipTypeId] = useState<number | null>(null);
  // Which internal tab is showing on whichever multi-tab page is active, so
  // the TopBar star can favourite that specific tab ("wallet.lpstore") - kept
  // up to date by each multi-tab page's own onActiveTabChange callback, and
  // reset whenever the active page itself changes (see the effect below).
  const [activeSubTab, setActiveSubTab] = useState<string | null>(null);
  // A sub-tab favourite clicked in the Sidebar's Favourites view - handed to
  // whichever page component owns that tab so it can jump straight there,
  // the same one-shot prop pattern initialMarketItem already uses.
  const [pendingSubTab, setPendingSubTab] = useState<string | null>(null);
  const reportError = useErrorReporter();
  // Mounted here (not inside MultiboxPage, which is lazy-loaded and
  // unmounts the moment you leave that tab) so 2+ running EVE clients gets
  // noticed and the floating preview opens regardless of which tab is
  // active - see the hook's own comment for why.
  const [multiboxAutoDetect, setMultiboxAutoDetect] = useMultiboxAutoDetect();
  const whatsNew = useWhatsNew();

  // Whichever sub-tab was active belongs to the PREVIOUS page - clear it the
  // moment the active page itself changes so the TopBar star doesn't briefly
  // favourite the wrong page's tab. If the new page has its own tabs, its
  // onActiveTabChange callback corrects this again immediately.
  useEffect(() => {
    setActiveSubTab(null);
  }, [activeId]);

  // First open of a page this session: stamp a short-lived attribute so a premium deck
  // can stage the page's panels in (see premium-signal.css). A layout effect, so the
  // attribute is on the document before the page's first paint and nothing flashes.
  useLayoutEffect(() => {
    if (visitedPages.has(activeId)) return;
    visitedPages.add(activeId);
    const root = document.documentElement;
    root.dataset.firstOpen = "true";
    const timer = window.setTimeout(() => delete root.dataset.firstOpen, 1000);
    return () => {
      window.clearTimeout(timer);
      delete root.dataset.firstOpen;
    };
  }, [activeId]);

  useEffect(() => {
    refreshSession();
    // Dev builds run effects twice under StrictMode; log the start once.
    if (!startLogged) {
      startLogged = true;
      logEvent("info", "SYS", "VESPER started");
    }
  }, []);

  async function refreshSession() {
    setLoading(true);
    try {
      const next = await getSession();
      setSession(next);
    } catch (err) {
      reportError(String(err));
      // A transient failure here (disk hiccup, momentary lock) shouldn't
      // blank out a session that already loaded successfully - that would
      // force every character through EVE SSO again just to reappear in the
      // switcher, even though their stored tokens were never actually lost.
      // Only fall back to an empty session if we've never loaded one at all.
      setSession((prev) => prev ?? { characters: [], active_character_id: null });
    } finally {
      setLoading(false);
    }
  }

  const active = NAV_ITEMS.find((item) => item.id === activeId) ?? NAV_ITEMS[0];

  // Only the very first load (nothing fetched yet) blanks the whole app -
  // a character switch also flips `loading` briefly, but bouncing the
  // entire shell (sidebar, topbar, overlay) out and back in for that is
  // unnecessarily disruptive: it unmounts ProximityFlashOverlay mid-session,
  // which was causing a spurious red flash on every character click (its
  // effect sees whatever pulseToken already exists on remount and treats it
  // as a brand-new alert). Session is already loaded by then, so there's
  // nothing meaningful for a full loading screen to protect against.
  if (loading && session === null) {
    return <div className="app-loading">Loading...</div>;
  }

  if (!session || session.characters.length === 0) {
    return <LoginScreen onLoggedIn={refreshSession} />;
  }

  function handleSelectNav(id: string) {
    // A Sidebar Favourites row can be a plain page id ("industry") or a
    // composite sub-tab favourite ("industry.production") - split it so a
    // sub-tab favourite lands on the right page AND jumps to the right tab.
    const { pageId, subTabId } = splitFavouriteId(id);
    setActiveId(pageId);
    setPendingSubTab(subTabId);
    if (pageId !== "dashboard") {
      setDetailCharacterId(null);
    }
  }

  async function handleSwitch(id: number) {
    await setActiveCharacter(id);
    const name = session?.characters.find((c) => c.id === id)?.name;
    logEvent("info", "SYS", name ? `Switched active character to ${name}` : "Switched active character");
    refreshSession();
  }

  function handleOpenDetail(id: number) {
    handleSwitch(id);
    setDetailCharacterId(id);
  }

  function handleOpenKillmail(killmailId: number) {
    setPendingKillmailId(killmailId);
    setActiveId("kills");
  }

  function handleOpenSystemKills(system: SystemSummary) {
    setPendingSystem(system);
    setActiveId("kills");
  }

  function handleOpenCharacterKillboard(characterId: number) {
    setPendingCharacterId(characterId);
    setActiveId("kills");
  }

  function handleOpenCorporationKillboard(corporation: CorporationSummary) {
    setPendingCorporation(corporation);
    setActiveId("kills");
  }

  function handleOpenAllianceKillboard(alliance: AllianceSummary) {
    setPendingAlliance(alliance);
    setActiveId("kills");
  }

  function handleOpenGateKillboard(gate: GateSummary) {
    setPendingGate(gate);
    setActiveId("kills");
  }

  function handleGoToMap() {
    setActiveId("map");
  }

  function handleOpenMarketItem(item: MarketItemRef) {
    setPendingMarketItem(item);
    setActiveId("wallet");
  }

  function handleFitShip(shipTypeId: number) {
    setPendingFitShipTypeId(shipTypeId);
    setActiveId("fittings-fleets");
  }

  function handleConsumePendingSubTab() {
    setPendingSubTab(null);
  }

  async function handleAdd() {
    await startLogin(DASHBOARD_SCOPES);
    refreshSession();
  }

  async function handleLogout(id: number) {
    await logoutCharacter(id);
    refreshSession();
  }

  const detailCharacter = session.characters.find((c) => c.id === detailCharacterId);

  return (
    <CharacterLocationProvider characterId={session.active_character_id}>
      <ChainAutoMappingEffect
        characterName={session.characters.find((c) => c.id === session.active_character_id)?.name ?? null}
      />
      <SkillQueueWatchEffect characters={session.characters} />
      <TrackedEntityEventsEffect />
      <TrackedGateCampWatchEffect />
      <div className="shell">
        <ProximityFlashOverlay />
        <UpdateBanner onPreviewUpdate={whatsNew.preview} />
        <WhatsNewModal entry={whatsNew.entry} open={whatsNew.open} onClose={whatsNew.close} />
        <ToastStack />
        <BootSequence
          characterName={session.characters.find((c) => c.id === session.active_character_id)?.name ?? null}
          pilots={session.characters.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portrait_url }))}
          activeId={session.active_character_id}
        />
        <SystemLogPanel />
        <CommandPalette
          characters={session.characters}
          activeCharacterId={session.active_character_id}
          onNavigate={handleSelectNav}
          onOpenSystem={handleOpenSystemKills}
          onSwitchCharacter={handleSwitch}
        />
        <Sidebar activeId={activeId} activeSubTab={activeSubTab} onSelect={handleSelectNav} />
        <TopBar
          title={active.label}
          activeId={activeId}
          session={session}
          onSwitch={handleSwitch}
          onAdd={handleAdd}
          onLogout={handleLogout}
          onOpenKillmail={handleOpenKillmail}
          onOpenWhatsNew={whatsNew.reopen}
        />
        <Suspense fallback={<div className="app-loading">Loading...</div>}>
        {activeId === "dashboard" ? (
          detailCharacter ? (
            <CharacterDetail
              character={detailCharacter}
              characters={session.characters}
              onSwitchCharacter={handleOpenDetail}
              onBack={() => setDetailCharacterId(null)}
              onSelectKill={handleOpenKillmail}
              onSelectCharacter={handleOpenCharacterKillboard}
              onSelectSystem={handleOpenSystemKills}
              onSelectCorporation={handleOpenCorporationKillboard}
              onSelectAlliance={handleOpenAllianceKillboard}
              onReconnect={handleAdd}
            />
          ) : (
            <Dashboard session={session} onOpenDetail={handleOpenDetail} onAdd={handleAdd} />
          )
        ) : activeId === "kills" ? (
          <KillsIntel
            characters={session.characters}
            initialKillmailId={pendingKillmailId}
            onConsumeInitialKillmail={() => setPendingKillmailId(null)}
            initialSystem={pendingSystem}
            onConsumeInitialSystem={() => setPendingSystem(null)}
            initialCharacterId={pendingCharacterId}
            onConsumeInitialCharacter={() => setPendingCharacterId(null)}
            initialCorporation={pendingCorporation}
            onConsumeInitialCorporation={() => setPendingCorporation(null)}
            initialAlliance={pendingAlliance}
            onConsumeInitialAlliance={() => setPendingAlliance(null)}
            initialGate={pendingGate}
            onConsumeInitialGate={() => setPendingGate(null)}
            onGoToMap={handleGoToMap}
            onSelectItem={handleOpenMarketItem}
            initialTab={pendingSubTab}
            onConsumeInitialTab={handleConsumePendingSubTab}
            onActiveTabChange={setActiveSubTab}
          />
        ) : activeId === "map" ? null : activeId === "mail" ? (
          <MailPage characters={session.characters} initialCharacterId={session.active_character_id} />
        ) : activeId === "wallet" ? (
          <WalletMarketPage
            characters={session.characters}
            initialCharacterId={session.active_character_id}
            initialMarketItem={pendingMarketItem}
            onConsumeInitialMarketItem={() => setPendingMarketItem(null)}
            onFitShip={handleFitShip}
            initialTab={pendingSubTab}
            onConsumeInitialTab={handleConsumePendingSubTab}
            onActiveTabChange={setActiveSubTab}
          />
        ) : activeId === "planetary" ? (
          <PlanetaryIndustry
            characters={session.characters}
            initialTab={pendingSubTab}
            onConsumeInitialTab={handleConsumePendingSubTab}
            onActiveTabChange={setActiveSubTab}
          />
        ) : activeId === "settings" ? (
          <SettingsPage session={session} onAdd={handleAdd} onLogout={handleLogout} />
        ) : activeId === "calendar" ? (
          <CalendarPage characters={session.characters} initialCharacterId={session.active_character_id} />
        ) : activeId === "fittings-fleets" ? (
          <FittingsPage
            characters={session.characters}
            initialShipTypeId={pendingFitShipTypeId}
            onConsumeInitialShipTypeId={() => setPendingFitShipTypeId(null)}
            initialTab={pendingSubTab}
            onConsumeInitialTab={handleConsumePendingSubTab}
            onActiveTabChange={setActiveSubTab}
          />
        ) : activeId === "path-wormhole-finder" ? (
          <PathWormholeFinderPage
            activeCharacterId={session.active_character_id}
            activeCharacterName={session.characters.find((c) => c.id === session.active_character_id)?.name ?? null}
            characters={session.characters}
            onSelectSystem={handleOpenSystemKills}
          />
        ) : activeId === "industry" ? (
          <IndustryPage
            initialTab={pendingSubTab}
            onConsumeInitialTab={handleConsumePendingSubTab}
            onActiveTabChange={setActiveSubTab}
          />
        ) : activeId === "mining" ? (
          <MiningPage
            characters={session.characters}
            initialTab={pendingSubTab}
            onConsumeInitialTab={handleConsumePendingSubTab}
            onActiveTabChange={setActiveSubTab}
          />
        ) : activeId === "multiboxing" ? (
          <MultiboxPage autoDetect={multiboxAutoDetect} onAutoDetectChange={setMultiboxAutoDetect} />
        ) : (
          <MainContent icon={active.icon} label={active.label} description={active.description} />
        )}
        </Suspense>
        {/* Mounted unconditionally, right from app start - not gated behind
           a first visit - so the map/heat-map/kill-feed data (and the Map
           page's own per-session state: canvas zoom/pan, etc.) is already
           populated by the time the pilot actually clicks into it, instead
           of only starting to load right then. Kept warm across navigation
           the same way: a persistent sibling that just toggles visibility
           with CSS rather than unmounting when another tab is active. */}
        <div style={{ display: activeId === "map" ? "contents" : "none" }}>
          <Suspense fallback={<div className="app-loading">Loading...</div>}>
            <MapPage
              onSelectKill={handleOpenKillmail}
              onSelectSystem={handleOpenSystemKills}
              onSelectGate={handleOpenGateKillboard}
              onSelectCharacter={handleOpenCharacterKillboard}
              characters={session.characters}
              visible={activeId === "map"}
              initialTab={activeId === "map" ? pendingSubTab : null}
              onConsumeInitialTab={handleConsumePendingSubTab}
              onActiveTabChange={setActiveSubTab}
            />
          </Suspense>
        </div>
      </div>
    </CharacterLocationProvider>
  );
}

export default App;
