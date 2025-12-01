// static/js/virtual/data-processor.js
// Responsibility: Transform hierarchical data into flat structure for virtual scrolling

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function matchesPeer(peer, mainRow) {
  return peer.main === mainRow.main && peer.destination === mainRow.destination;
}

function matchesHour(hour, peerRow) {
  return hour.main === peerRow.main && hour.peer === peerRow.peer && hour.destination === peerRow.destination;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export class VirtualDataProcessor {
  // flatten main/peer/hourly into single array
  static prepareDataForVirtualization(mainRows, peerRows, hourlyRows) {
    const result = [];

    mainRows.forEach((mainRow, mainIdx) => {
      const mainGroupId = `main-${mainIdx}`;
      result.push({ ...mainRow, type: 'main', groupId: mainGroupId, level: 0 });

      const relatedPeers = peerRows.filter(p => matchesPeer(p, mainRow));

      relatedPeers.forEach((peerRow, peerIdx) => {
        const peerGroupId = `peer-${mainIdx}-${peerIdx}`;
        result.push({ ...peerRow, type: 'peer', groupId: peerGroupId, level: 1, parentId: mainGroupId });

        const relatedHours = hourlyRows.filter(h => matchesHour(h, peerRow));

        relatedHours.forEach((hourRow, hourIdx) => {
          result.push({
            ...hourRow,
            type: 'hourly',
            groupId: `hour-${mainIdx}-${peerIdx}-${hourIdx}`,
            level: 2,
            parentId: peerGroupId
          });
        });
      });
    });

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

