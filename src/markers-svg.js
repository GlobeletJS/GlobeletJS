export function createDefaultMarker() {
  const svg = svgElement("svg");
  svg.setAttribute("class", "marker");

  const use = svgElement("use");
  use.setAttribute("href", "./globelet.svg#marker");
  svg.appendChild(use);

  return svg;
}

export function createDefaultSpot() {
  const svg = svgElement("svg");
  svg.setAttribute("class", "spot");

  const use = svgElement("use");
  use.setAttribute("href", "./globelet.svg#spot");
  svg.appendChild(use);

  return svg;
}

function svgElement(type) {
  const svgNS = "http://www.w3.org/2000/svg";
  return document.createElementNS(svgNS, type);
}
