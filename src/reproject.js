import * as satelliteView from "satellite-view";

export function initReprojection(ball, context, sampler) {
  const camPos = new Float64Array([0.5, 0.5]);
  const scale = new Float64Array(2);

  const satView = satelliteView.init({
    context,
    map: { sampler, camPos, scale },
    globeRadius: ball.radius(),
    flipY: false,
    units: "degrees",
  });

  function reproject(map, satellitePos) {
    scale.set(map.getScale());
    camPos.set(map.getCamPos());
    context.updateMips(sampler);
    satView.draw(satellitePos, ball.view.maxRay);
  }

  return { reproject, destroy: satView.destroy };
}
