// static/js/virtual/data-processor.js
// Responsibility: Transform hierarchical data into flat structure for virtual scrolling

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// Build composite key for parent lookup
const mainKey = r => `${r.main ?? ''}|${r.destination ?? ''}`;
const peerKey = r => `${r.main ?? ''}|${r.peer ?? ''}|${r.destination ?? ''}`;

// Pre-index rows by parent key → O(n) instead of O(n×m)
function buildPeerIndex(peerRows) {
  const map = new Map();
  const len = peerRows.length;
  for (let i = 0; i < len; i++) {
    const p = peerRows[i];
    const key = mainKey(p);
    let arr = map.get(key);
    if (!arr) { arr = []; map.set(key, arr); }
    arr.push({ row: p, index: i });
  }
  return map;
}

function buildHourlyIndex(hourlyRows) {
  const map = new Map();
  const len = hourlyRows.length;
  for (let i = 0; i < len; i++) {
    const h = hourlyRows[i];
    const key = peerKey(h);
    let arr = map.get(key);
    if (!arr) { arr = []; map.set(key, arr); }
    arr.push({ row: h, index: i });
  }
  return map;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export class VirtualDataProcessor {
  // flatten main/peer/hourly into single array — O(n + m + k) complexity
  static prepareDataForVirtualization(mainRows, peerRows, hourlyRows) {
    // Pre-index peers and hourly for O(1) lookup
    const peersByMain = buildPeerIndex(peerRows);
    const hourlyByPeer = buildHourlyIndex(hourlyRows);

    const result = [];
    const mainLen = mainRows.length;

    for (let mainIdx = 0; mainIdx < mainLen; mainIdx++) {
      const mainRow = mainRows[mainIdx];
      const mainGroupId = `main-${mainIdx}`;

      // Add main row (reuse object, add metadata)
      result.push({ ...mainRow, type: 'main', groupId: mainGroupId, level: 0 });

      // Get related peers from index — O(1) lookup
      const mKey = mainKey(mainRow);
      const relatedPeers = peersByMain.get(mKey) || [];
      const peerLen = relatedPeers.length;

      for (let peerIdx = 0; peerIdx < peerLen; peerIdx++) {
        const { row: peerRow } = relatedPeers[peerIdx];
        const peerGroupId = `peer-${mainIdx}-${peerIdx}`;

        result.push({ ...peerRow, type: 'peer', groupId: peerGroupId, level: 1, parentId: mainGroupId });

        // Get related hourly from index — O(1) lookup
        const pKey = peerKey(peerRow);
        const relatedHours = hourlyByPeer.get(pKey) || [];
        const hourLen = relatedHours.length;

        for (let hourIdx = 0; hourIdx < hourLen; hourIdx++) {
          const { row: hourRow } = relatedHours[hourIdx];
          result.push({
            ...hourRow,
            type: 'hourly',
            groupId: `hour-${mainIdx}-${peerIdx}-${hourIdx}`,
            level: 2,
            parentId: peerGroupId
          });
        }
      }
    }

    return result;
  }

  // filter based on expand/collapse state
  static filterVisibleData(virtualData, expandedGroups = new Set()) {
    return virtualData.filter(item => {
      if (item.level === 0) return true;
      return expandedGroups.has(item.parentId);
    });
  }

  // summary statistics
  static getDataSummary(virtualData) {
    const summary = { total: virtualData.length, main: 0, peer: 0, hourly: 0 };

    for (const item of virtualData) {
      if (item.type === 'main') summary.main++;
      else if (item.type === 'peer') summary.peer++;
      else if (item.type === 'hourly') summary.hourly++;
    }

    return summary;
  }
}

