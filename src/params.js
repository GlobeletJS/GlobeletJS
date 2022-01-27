import * as yawgl from "yawgl";
import sprite from "../dist/globelet.svg";
import { newElement } from "./dom.js";

export function setParams(userParams) {
  // Get the containing DIV element, and set its CSS class
  const container = (typeof userParams.container === "string")
    ? document.getElementById(userParams.container)
    : userParams.container;
  if (!(container instanceof Element)) fail("missing container element");
  container.classList.add("globelet");
  if (container.clientWidth <= 64 || container.clientHeight <= 64) {
    fail("container must be at least 64x64 pixels");
  }

  // Add Elements for globe interface, svg sprite
  const globeDiv = container.appendChild(newElement("div", "main"));
  globeDiv.insertAdjacentHTML("afterbegin", sprite);

  // Get user-supplied parameters
  const {
    style, mapboxToken,
    width: rawWidth = globeDiv.clientWidth + 512,
    height: rawHeight = globeDiv.clientHeight + 512,
    center = [0.0, 0.0],
    altitude = 20000,
    infobox,
  } = userParams;

  // Get the DIV element for the infobox, if supplied
  const infoDiv = (typeof infobox === "string" && infobox.length)
    ? document.getElementById(infobox)
    : (infobox instanceof Element) ? infobox : null;

  // Force width >= height, and both powers of 2
  const nextPowerOf2 = v => 2 ** Math.ceil(Math.log2(v));
  const height = nextPowerOf2(rawHeight);
  const width = Math.max(nextPowerOf2(rawWidth), height);

  return {
    style, mapboxToken, width, height,
    center, altitude, globeDiv, infoDiv,
  };
}

function fail(message) {
  throw Error("GlobeletJS: " + message);
}
