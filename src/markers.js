export function initMarkers(globe, container) {
  const markerList = [];

  return {
    add,
    remove,
    update: () => markerList.forEach(setPosition),
  };

  function add({ element, type, lonLat, altitude }) {
    const marker = {
      element: getMarkerElement(element, type),
      // TODO: bad naming? lonLat includes altitude. Altitude currently unused
      lonLat: new Float64Array([...lonLat, altitude || 0.0]),
      screenPos: new Float64Array(2),
    };

    container.appendChild(marker.element);
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
    const svgNS = "http://www.w3.org/2000/svg";

    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", type);

    const use = document.createElementNS(svgNS, "use");
    // Reference the relevant sprite from the SVG appended in params.js
    use.setAttribute("href", "#" + type);
    svg.appendChild(use);

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
    const visible = globe.project(marker.screenPos, marker.lonLat);

    Object.assign(marker.element.style, {
      display: (visible) ? "inline-block" : "none",
      left: marker.screenPos[0] + "px",
      top: marker.screenPos[1] + "px",
    });
  }
}
