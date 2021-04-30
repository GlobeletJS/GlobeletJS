import { createDefaultMarker, createDefaultSpot } from "./markers-svg.js";

export function initMarkers(globe, display) {
  const markerList = [];

  return {
    add,
    remove,
    update: () => markerList.forEach(setPosition),
  };

  function add(options) {
    // Create the marker element, if not supplied
    let element = getMarkerElement(options.element, options.type);
    display.appendChild(element);

    // Initialize the marker object
    const marker = {
      element,
      // TODO: bad naming? lonLat includes altitude. Altitude currently unused
      lonLat: new Float64Array([...options.lonLat, options.altitude || 0.0]),
      screenPos: new Float64Array(2),
    };
    // Set the initial position
    setPosition(marker);

    // Add to the list, and return the pointer to the user
    markerList.push(marker);
    return marker;
  }

  function getMarkerElement(userElement, markerType) {
    let elType = userElement ? userElement.nodeName : null;
    return (elType === "DIV" || elType === "IMG" || elType === "SVG")
      ? userElement
      : (markerType === "spot")
      ? createDefaultSpot()
      : createDefaultMarker();
  }

  function remove(marker) {
    let index = markerList.indexOf(marker);
    if (index < 0) return;

    // Remove it from both the DOM and the list
    display.removeChild(marker.element);
    markerList.splice(index, 1);
  }

  function setPosition(marker) {
    // Project coordinates to screen position, using current globe orientation
    var visible = globe.lonLatToScreenXY(marker.screenPos, marker.lonLat);
    // Set CSS visibility
    marker.element.style.display = (visible)
      ? "inline-block"
      : "none";
    // Set CSS position
    marker.element.style.left = marker.screenPos[0] + "px";
    marker.element.style.top = marker.screenPos[1] + "px";
  }
}
