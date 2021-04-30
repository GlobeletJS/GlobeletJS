export function initEventHandler() {
  // Stores events and listeners. Listeners will be executed even if
  // the event occurred before the listener was added

  const events = {};    // { type1: data1, type2: data2, ... }
  const listeners = {}; // { type1: { id1: func1, id2: func2, ...}, type2: ... }
  var globalID = 0;

  function emitEvent(type, data = "1") {
    events[type] = data;

    let audience = listeners[type];
    if (!audience) return;

    Object.values(audience).forEach(listener => listener(data));
  }

  function addListener(type, listener) {
    if (!listeners[type]) listeners[type] = {};

    let id = ++globalID;
    listeners[type][id] = listener;
    
    if (events[type]) listener(events[type]);
    return id;
  }

  function removeListener(type, id) {
    let audience = listeners[type];
    if (audience) delete audience[id];
  }

  return {
    emitEvent,
    addListener,
    removeListener,
  };
}
