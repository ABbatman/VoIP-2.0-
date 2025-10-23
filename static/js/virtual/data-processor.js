// Virtual Data Processor Module - Single Responsibility: Prepare Data for Virtualization
// Localized comments in English as requested

/**
 * Virtual Data Processor
 * Responsibility: Transform hierarchical table data into flat structure for virtual scrolling
 */
export class VirtualDataProcessor {
  
  /**
   * Prepare hierarchical data for virtual scrolling
   * Flattens main/peer/hourly structure into single array
   */
  static prepareDataForVirtualization(mainRows, peerRows, hourlyRows) {
    const virtualData = [];
    
    // Process each main row and its related data
    mainRows.forEach((mainRow, mainIndex) => {
      // Add main row
      virtualData.push({
        ...mainRow,
        type: 'main',
        groupId: `main-${mainIndex}`,
        level: 0
      });
      
      // Find related peer rows
      const relatedPeers = peerRows.filter(peer => 
        peer.main === mainRow.main && peer.destination === mainRow.destination
      );
      
      // Add peer rows
      relatedPeers.forEach((peerRow, peerIndex) => {
        virtualData.push({
          ...peerRow,
          type: 'peer',
          groupId: `peer-${mainIndex}-${peerIndex}`,
          level: 1,
          parentId: `main-${mainIndex}`
        });
        
        // Find related hourly rows
        const relatedHours = hourlyRows.filter(hour =>
          hour.main === peerRow.main && 
          hour.peer === peerRow.peer && 
          hour.destination === peerRow.destination
        );
        
        // Add hourly rows
        relatedHours.forEach((hourRow, hourIndex) => {
          virtualData.push({
            ...hourRow,
            type: 'hourly',
            groupId: `hour-${mainIndex}-${peerIndex}-${hourIndex}`,
            level: 2,
            parentId: `peer-${mainIndex}-${peerIndex}`
          });
        });
      });
    });
    
    console.log(`📊 Data Processor: Prepared ${virtualData.length} virtual rows from ${mainRows.length} main rows`);
    return virtualData;
  }

  /**
   * Filter virtual data based on visibility state
   * Can be extended to handle expand/collapse logic
   */
  static filterVisibleData(virtualData, expandedGroups = new Set()) {
    return virtualData.filter(item => {
      // Main rows are always visible
      if (item.level === 0) return true;
      
      // Peer rows visible if parent main is expanded
      if (item.level === 1) {
        const parentExpanded = expandedGroups.has(item.parentId);
        return parentExpanded;
      }
      
      // Hourly rows visible if parent peer is expanded
      if (item.level === 2) {
        const parentExpanded = expandedGroups.has(item.parentId);
        return parentExpanded;
      }
      
      return true;
    });
  }

  /**
   * Get summary statistics for virtual data
   */
  static getDataSummary(virtualData) {
    const summary = {
      total: virtualData.length,
      main: 0,
      peer: 0,
      hourly: 0
    };

    virtualData.forEach(item => {
      if (item.type === 'main') summary.main++;
      else if (item.type === 'peer') summary.peer++;
      else if (item.type === 'hourly') summary.hourly++;
    });

    return summary;
  }
}

