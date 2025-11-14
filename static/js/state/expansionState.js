// static/js/state/expansionState.js
// Centralized expansion state for Summary Table (main -> peer -> hour)
// Pure state: no DOM, no chart coupling. English comments as requested.

import { publish } from "./eventBus.js";

// Internal sets hold expanded group identifiers
const _mainExpanded = new Set();
const _peerExpanded = new Set(); // peer-level controls visibility of hour rows

// Build deterministic group IDs (shared across standard and virtual renderers)
// Align with virtual/manager/data-cache.js sanitizeIdPart: keep case, keep dots, replace whitespace with '-', remove disallowed
function sanitize(value) {
  return (value == null ? "" : String(value))
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/gi, '');
}

export function buildMainGroupId(main, destination) {
  return `main-${sanitize(main)}-${sanitize(destination)}`;
}

export function buildPeerGroupId(main, peer, destination) {
  return `peer-${sanitize(main)}-${sanitize(peer)}-${sanitize(destination)}`;
}

// Query API
export function isMainExpanded(id) { return _mainExpanded.has(id); }
export function isPeerExpanded(id) { return _peerExpanded.has(id); }

// Mutators
export function expandMain(id) {
  if (!_mainExpanded.has(id)) {
    _mainExpanded.add(id);
    publish("table:expansionChanged", { level: "main", id, expanded: true });
  }
}
export function collapseMain(id) {
  if (_mainExpanded.delete(id)) {
    // Also collapse all peer groups under this main (by prefix)
    const body = id.startsWith("main-") ? id.slice(5) : id;
    Array.from(_peerExpanded).forEach(pid => {
      if (pid.startsWith(`peer-${body}-`)) _peerExpanded.delete(pid);
    });
    publish("table:expansionChanged", { level: "main", id, expanded: false });
  }
}
export function toggleMain(id) { isMainExpanded(id) ? collapseMain(id) : expandMain(id); }

export function expandPeer(id) {
  if (!_peerExpanded.has(id)) {
    _peerExpanded.add(id);
    publish("table:expansionChanged", { level: "peer", id, expanded: true });
  }
}
export function collapsePeer(id) {
  if (_peerExpanded.delete(id)) {
    publish("table:expansionChanged", { level: "peer", id, expanded: false });
  }
}
export function togglePeer(id) { isPeerExpanded(id) ? collapsePeer(id) : expandPeer(id); }

export function closePeersUnderMain(mainId) {
  const body = mainId.startsWith("main-") ? mainId.slice(5) : mainId;
  let removed = 0;
  Array.from(_peerExpanded).forEach(pid => {
    if (pid.startsWith(`peer-${body}-`)) { _peerExpanded.delete(pid); removed++; }
  });
  if (removed) publish("table:expansionChanged", { level: "peer", id: `peer-${body}-*`, expanded: false });
  return removed;
}

export function expandAllMain(mainIds = []) {
  let changed = 0;
  for (const id of mainIds) { if (!_mainExpanded.has(id)) { _mainExpanded.add(id); changed++; } }
  if (changed) publish("table:expansionChanged", { level: "main", id: "*", expanded: true });
}

export function collapseAll() {
  const hadAny = _mainExpanded.size || _peerExpanded.size;
  _mainExpanded.clear();
  _peerExpanded.clear();
  if (hadAny) publish("table:expansionChanged", { level: "all", id: "*", expanded: false });
}

export function resetExpansionState() { collapseAll(); }

// Proxies used by legacy/virtual manager code (compat facade)
export function getMainSetProxy() {
  const proxy = {
    has: (id) => _mainExpanded.has(id),
    add: (id) => { expandMain(id); },
    delete: (id) => { collapseMain(id); return true; },
    clear: () => { collapseAll(); },
    get size() { return _mainExpanded.size; },
    [Symbol.iterator]: function* () { yield* _mainExpanded.values(); }
  };
  return proxy;
}

export function getPeerSetProxy() {
  const proxy = {
    has: (id) => _peerExpanded.has(id),
    add: (id) => { expandPeer(id); },
    delete: (id) => { collapsePeer(id); return true; },
    clear: () => { collapseAll(); },
    get size() { return _peerExpanded.size; },
    [Symbol.iterator]: function* () { yield* _peerExpanded.values(); }
  };
  return proxy;
}

export function getSnapshot() {
  return {
    main: Array.from(_mainExpanded),
    peer: Array.from(_peerExpanded)
  };
}
