import { setParams } from "./params.js";
import { initMap } from "./map.js";
import * as spinningBall from "spinning-ball";
import * as satelliteView from "satellite-view";
import { printToolTip } from "./tooltip.js";
import { initMarkers } from "./markers.js";

export function initGlobe(userParams) {
  const params = setParams(userParams);

  return initMap(params)
    .then(map => setup(map, params));
}

function setup(map, params) {
  const { globeDiv, toolTip, center, altitude, context } = params;
  var requestID;

  const ball = spinningBall.init(globeDiv, center, altitude);
  const satView = satelliteView.init({
    context: context,
    globeRadius: ball.radius(),
    map: map.texture,
    flipY: false,
  });
  const markers = initMarkers(ball, globeDiv);

  return {
    mapLoaded: map.loaded,
    select: (layer, dxy) => map.select(layer, ball.cursorPos, dxy),
    showLayer: map.showLayer,
    hideLayer: map.hideLayer,
    getZoom: map.getZoom,

    startAnimation: () => { requestID = requestAnimationFrame(animate); },
    stopAnimation: () => cancelAnimationFrame(requestID),
    update,  // For requestAnimationFrame loops managed by the parent program

    cameraPos: ball.cameraPos,
    cursorPos: ball.cursorPos,
    isMoving: ball.camMoving,
    wasTapped: ball.wasTapped,

    addMarker: markers.add,
    removeMarker: markers.remove,

    destroy: () => (satView.destroy(), globeDiv.remove()),
    breakLoop: 0,
  };

  function animate(time) {
    update(time);
    requestID = requestAnimationFrame(animate);
  }

  function update(time) {
    var moving = ball.update(time * 0.001); // Convert time from ms to seconds

    if (moving || map.loaded() < 1.0) {
      map.draw(ball.cameraPos, ball.radius(), ball.view);
      satView.draw(ball.cameraPos, ball.view.maxRay);
    }

    if (moving) markers.update();
    if (ball.cursorChanged()) printToolTip(toolTip, ball);
  }
}
