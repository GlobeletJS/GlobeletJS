import * as tileSetter from 'tile-setter';

export function initMap(params) {
  const { context, width, height, style, mapboxToken } = params;
  const framebuffer = context.initFramebuffer({ width, height });

  return tileSetter
    .init({ context, framebuffer, style, mapboxToken, units: "radians" })
    .promise.then(api => setup(api, context, framebuffer.sampler))
    .catch(console.log);
}

function setup(api, context, sampler) {
  var loadStatus = 0;

  const texture = {
    sampler,
    camPos: new Float64Array([0.5, 0.5]),
    scale: new Float64Array(2),
    changed: true,
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
    let dMap = camPos[2] / radius *        // Normalize to radius = 1
      view.topEdge() * 2 / view.height() * // ray tangent per pixel
      api.projection.scale(camPos);

    let k = 1.0 / dMap;
    let zoom = Math.log2(k) - 9;

    let changed = api.setCenterZoom(camPos, zoom, 'radians');
    loadStatus = api.draw();

    texture.scale.set(api.getScale());
    texture.camPos.set(api.getCamPos());

    context.updateMips(sampler);
  }

  function select(layer, point, radius) {
    return api.select({ layer, point, radius, units: "radians" });
  }
}
