import { newSVG } from "./dom.js";

export function initMarkers(globe, container) {
  const markerList = [];

  return {
    add,
    remove,
    update: () => markerList.forEach(setPosition),
  };

  function add({ element, type, position }) {
    const [lon, lat, alt = 0.0] = position;
    const marker = {
      element: container.appendChild(getMarkerElement(element, type)),
      position: new Float64Array([lon, lat, alt]),
      screenPos: new Float64Array(2),
    };
    setPosition(marker);

    // Add to the list, and return the pointer to the user
    markerList.push(marker);
    return marker;
  }

  function getMarkerElement(element, type) {
    return (element && ["DIV", "IMG", "SVG"].includes(element.nodeName))
      ? element
      : createSVG(type);
  }

  function createSVG(type = "marker") {
    const svg = newSVG("svg", { "class": type });
    svg.appendChild(newSVG("use", { "href": "#" + type }));
    return svg;
  }

  function remove(marker) {
    const index = markerList.indexOf(marker);
    if (index < 0) return;

    // Remove it from both the DOM and the list
    container.removeChild(marker.element);
    markerList.splice(index, 1);
  }

  function setPosition(marker) {
    const visible = globe.project(marker.screenPos, marker.position);

    Object.assign(marker.element.style, {
      display: (visible) ? "inline-block" : "none",
      left: marker.screenPos[0] + "px",
      top: marker.screenPos[1] + "px",
    });
  }
}
