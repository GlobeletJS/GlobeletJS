export function newElement(tagName, className) {
  const el = document.createElement(tagName);
  if (className !== undefined) el.className = className;
  return el;
}

export function newSVG(tagName, attributes) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", tagName);
  Object.entries(attributes).forEach(([k, v]) => svg.setAttribute(k, v));
  return svg;
}
