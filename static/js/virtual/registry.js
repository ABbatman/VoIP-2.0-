// static/js/virtual/registry.js
// Responsibility: VirtualManager singleton registry

let _manager = null;

export const setCurrentManager = vm => { _manager = vm ?? null; };
export const getCurrentManager = () => _manager;
