import { newElement } from "./dom.js";
import { initContext } from "yawgl";
import { initReprojection } from "./reproject.js";
import * as tileSetter from "tile-setter";

export function initMap(ball, params) {
  const { width, height, style, mapboxToken, globeDiv } = params;

  const canvas = globeDiv.appendChild(newElement("canvas", "map"));
  const context = initContext(canvas);

  const framebuffer = context.initFramebuffer({ width, height });
  const renderer = initReprojection(ball, context, framebuffer.sampler);

  return tileSetter
    .init({ context, framebuffer, style, mapboxToken, projScale: true })
    .promise.then(map => setup(map, ball, renderer));
}

function setup(map, ball, renderer) {
  let loadStatus = 0;

  return {
    mapLoaded: () => loadStatus,
    select,
    showLayer: (l) => (loadStatus = 0, map.showLayer(l)),
    hideLayer: (l) => (loadStatus = 0, map.hideLayer(l)),
    getZoom: map.getZoom,
    destroy: renderer.destroy,
    update,
  };

  function update(satellitePos) {
    const hNorm = satellitePos[2] / ball.radius();
    const rayTanPerPixel = ball.view.topEdge() * 2 / ball.view.height();
    const dMap = hNorm * rayTanPerPixel * map.projection.scale(satellitePos);

    const k = 1.0 / dMap;
    const zoom = Math.log2(k) - 9;

    map.setCenterZoom(satellitePos, zoom);
    const dzScale = 2 ** (zoom - map.getZoom());
    loadStatus = map.draw({ dzScale });

    renderer.reproject(map, satellitePos);
  }

  function select(layer, radius) {
    return map.select({ layer, point: ball.cursorPos(), radius });
  }
}
