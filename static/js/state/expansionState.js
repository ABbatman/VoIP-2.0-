// static/js/state/expansionState.js
// Responsibility: Table row expansion state (main → peer → hour)
import { publish } from './eventBus.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const MAIN_PREFIX = 'main-';
const PEER_PREFIX = 'peer-';
const EVENT = 'table:expansionChanged';

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

const mainExpanded = new Set();
const peerExpanded = new Set();

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function sanitize(value) {
  return (value == null ? '' : String(value))
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/gi, '');
}

function getMainBody(id) {
  return id.startsWith(MAIN_PREFIX) ? id.slice(MAIN_PREFIX.length) : id;
}

function emitChange(level, id, expanded) {
  publish(EVENT, { level, id, expanded });
}

// ─────────────────────────────────────────────────────────────
// ID builders
// ─────────────────────────────────────────────────────────────

export const buildMainGroupId = (main, destination) =>
  `${MAIN_PREFIX}${sanitize(main)}-${sanitize(destination)}`;

export const buildPeerGroupId = (main, peer, destination) =>
  `${PEER_PREFIX}${sanitize(main)}-${sanitize(peer)}-${sanitize(destination)}`;

// ─────────────────────────────────────────────────────────────
// Query API
// ─────────────────────────────────────────────────────────────

export const isMainExpanded = id => mainExpanded.has(id);
export const isPeerExpanded = id => peerExpanded.has(id);

// ─────────────────────────────────────────────────────────────
// Main level mutators
// ─────────────────────────────────────────────────────────────

export function expandMain(id) {
  if (mainExpanded.has(id)) return;
  mainExpanded.add(id);
  emitChange('main', id, true);
}

export function collapseMain(id) {
  if (!mainExpanded.delete(id)) return;

  // collapse all peers under this main
  const body = getMainBody(id);
  const prefix = `${PEER_PREFIX}${body}-`;
  // collect IDs to delete first, then delete (avoid mutation during iteration)
  const toDelete = [];
  for (const pid of peerExpanded) {
    if (pid.startsWith(prefix)) toDelete.push(pid);
  }
  for (let i = 0; i < toDelete.length; i++) {
    peerExpanded.delete(toDelete[i]);
  }

  emitChange('main', id, false);
}

export const toggleMain = id => isMainExpanded(id) ? collapseMain(id) : expandMain(id);

// ─────────────────────────────────────────────────────────────
// Peer level mutators
// ─────────────────────────────────────────────────────────────

export function expandPeer(id) {
  if (peerExpanded.has(id)) return;
  peerExpanded.add(id);
  emitChange('peer', id, true);
}

export function collapsePeer(id) {
  if (!peerExpanded.delete(id)) return;
  emitChange('peer', id, false);
}

export const togglePeer = id => isPeerExpanded(id) ? collapsePeer(id) : expandPeer(id);

// ─────────────────────────────────────────────────────────────
// Bulk operations
// ─────────────────────────────────────────────────────────────

export function closePeersUnderMain(mainId) {
  const body = getMainBody(mainId);
  const prefix = `${PEER_PREFIX}${body}-`;
  // collect IDs to delete first, then delete
  const toDelete = [];
  for (const pid of peerExpanded) {
    if (pid.startsWith(prefix)) toDelete.push(pid);
  }
  const removed = toDelete.length;
  for (let i = 0; i < removed; i++) {
    peerExpanded.delete(toDelete[i]);
  }

  if (removed) emitChange('peer', `${PEER_PREFIX}${body}-*`, false);
  return removed;
}

export function expandAllMain(mainIds = []) {
  let changed = 0;
  const len = mainIds.length;
  for (let i = 0; i < len; i++) {
    const id = mainIds[i];
    if (!mainExpanded.has(id)) { mainExpanded.add(id); changed++; }
  }
  if (changed) emitChange('main', '*', true);
}

export function collapseAll() {
  const hadAny = mainExpanded.size || peerExpanded.size;
  mainExpanded.clear();
  peerExpanded.clear();
  if (hadAny) emitChange('all', '*', false);
}

export const resetExpansionState = collapseAll;

// ─────────────────────────────────────────────────────────────
// Compat proxies (for legacy/virtual manager)
// ─────────────────────────────────────────────────────────────

export function getMainSetProxy() {
  return {
    has: id => mainExpanded.has(id),
    add: id => expandMain(id),
    delete: id => { collapseMain(id); return true; },
    clear: collapseAll,
    get size() { return mainExpanded.size; },
    [Symbol.iterator]: function* () { yield* mainExpanded.values(); }
  };
}

export function getPeerSetProxy() {
  return {
    has: id => peerExpanded.has(id),
    add: id => expandPeer(id),
    delete: id => { collapsePeer(id); return true; },
    clear: collapseAll,
    get size() { return peerExpanded.size; },
    [Symbol.iterator]: function* () { yield* peerExpanded.values(); }
  };
}

// ─────────────────────────────────────────────────────────────
// Snapshot
// ─────────────────────────────────────────────────────────────

export const getSnapshot = () => ({
  main: Array.from(mainExpanded),
  peer: Array.from(peerExpanded)
});
