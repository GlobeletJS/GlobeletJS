import * as tileSetter from "tile-setter";

export function initMap(params) {
  const { context, width, height, style, mapboxToken } = params;
  const framebuffer = context.initFramebuffer({ width, height });

  return tileSetter
    .init({ context, framebuffer, style, mapboxToken, units: "radians" })
    .promise.then(api => setup(api, context, framebuffer.sampler));
}

function setup(api, context, sampler) {
  var loadStatus = 0;

  const texture = {
    sampler,
    camPos: new Float64Array([0.5, 0.5]),
    scale: new Float64Array(2),
  };

  return {
    texture,
    loaded: () => loadStatus,
    draw,
    select,
    showLayer: (l) => (loadStatus = 0, api.showLayer(l)),
    hideLayer: (l) => (loadStatus = 0, api.hideLayer(l)),
    getZoom: api.getZoom,
  };

  function draw(camPos, radius, view) {
    const dMap = camPos[2] / radius *        // Normalize to radius = 1
      view.topEdge() * 2 / view.height() * // ray tangent per pixel
      api.projection.scale(camPos);

    const k = 1.0 / dMap;
    const zoom = Math.log2(k) - 9;

    api.setCenterZoom(camPos, zoom);
    loadStatus = api.draw();

    texture.scale.set(api.getScale());
    texture.camPos.set(api.getCamPos());

    context.updateMips(sampler);
  }

  function select(layer, point, radius) {
    return api.select({ layer, point, radius });
  }
}
