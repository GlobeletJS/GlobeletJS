import * as yawgl from 'yawgl';
import { version } from "../package.json";

export function setParams(userParams) {
  const container = document.getElementById(userParams.container);
  const {
    style, mapboxToken,
    svgPath = "https://unpkg.com/globeletjs@" + version + "/dist/globelet.svg",
    width: rawWidth = container.clientWidth + 512,
    height: rawHeight = container.clientHeight + 512,
    toolTip,
    center = [0.0, 0.0],
    altitude = 20000,
  } = userParams;

  // Force width >= height, and both powers of 2
  const nextPowerOf2 = v => 2 ** Math.ceil(Math.log2(v));
  const height = nextPowerOf2(rawHeight);
  const width = Math.max(nextPowerOf2(rawWidth), height);

  // Create a Canvas with a WebGL context
  const canvas = document.createElement('canvas');
  canvas.className = "map";
  container.appendChild(canvas);
  const gl = yawgl.getExtendedContext(canvas);
  const context = yawgl.initContext(gl);

  return {
    style, mapboxToken, svgPath,
    width, height,
    container, context,
    toolTip: document.getElementById(toolTip),
    center, altitude,
  };
}
