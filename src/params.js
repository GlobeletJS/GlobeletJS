import * as yawgl from "yawgl";
import { version } from "../package.json";
import sprite from "../dist/globelet.svg";

export function setParams(userParams) {
  // Get the containing DIV element, and set its CSS class
  const container = (typeof userParams.container === "string")
    ? document.getElementById(userParams.container)
    : userParams.container;
  if (!(container instanceof Element)) fail("missing container element");
  if (container.clientWidth <= 64 || container.clientHeight <= 64) {
    fail("container must be at least 64x64 pixels");
  }
  container.classList.add("globelet");

  // Add Elements for globe interface, svg sprite, status bar, canvas
  const globeDiv = addChild("div", "main", container);
  globeDiv.insertAdjacentHTML("afterbegin", sprite);
  const toolTip = addChild( "div", "status", globeDiv);
  const canvas = addChild("canvas", "map", globeDiv);

  // Get a WebGL context with added yawgl functionality
  const context = yawgl.initContext(canvas);

  // Get user-supplied parameters
  const {
    style, mapboxToken,
    width: rawWidth = globeDiv.clientWidth + 512,
    height: rawHeight = globeDiv.clientHeight + 512,
    center = [0.0, 0.0],
    altitude = 20000,
  } = userParams;

  // Force width >= height, and both powers of 2
  const nextPowerOf2 = v => 2 ** Math.ceil(Math.log2(v));
  const height = nextPowerOf2(rawHeight);
  const width = Math.max(nextPowerOf2(rawWidth), height);

  return { version,
    style, mapboxToken,
    width, height,
    globeDiv, context, toolTip,
    center, altitude,
  };

  function addChild(tagName, className, parentElement) {
    const child = document.createElement(tagName);
    child.className = className;
    return parentElement.appendChild(child);
  }
}

function fail(message) {
  throw Error("GlobeletJS: " + message);
}
