import { setParams } from "./params.js";
import { initMap } from "./map.js";
import * as spinningBall from "spinning-ball";
import { initToolTip } from "./tooltip.js";
import { initMarkers } from "./markers.js";
import { initInfoBox } from "./infobox.js";

export function initGlobe(userParams) {
  const params = setParams(userParams);
  const { globeDiv, center, altitude } = params;

  const ball = spinningBall.init({
    display: globeDiv,
    position: [center[0], center[1], altitude],
  });

  return initMap(ball, params)
    .then(map => setup(map, ball, globeDiv));
}

function setup(map, ball, globeDiv) {
  let requestID;
  const markers = initMarkers(ball, globeDiv);
  const toolTip = initToolTip(ball, globeDiv);
  const infoBox = initInfoBox(globeDiv);

  const api = Object.assign({}, map, infoBox, {
    startAnimation: () => { requestID = requestAnimationFrame(animate); },
    stopAnimation: () => cancelAnimationFrame(requestID),
    update,  // For requestAnimationFrame loops managed by the parent program

    cameraPos: ball.cameraPos,
    cursorPos: ball.cursorPos,
    isMoving: ball.camMoving,
    wasTapped: ball.wasTapped,

    addMarker: markers.add,
    removeMarker: markers.remove,

    destroy: () => (map.destroy(), infoBox.destroy(), globeDiv.remove()),
  });

  delete api.draw; // From map.js. We expose the "update" wrapper instead
  return api;

  function animate(time) {
    update(time);
    requestID = requestAnimationFrame(animate);
  }

  function update(time) {
    const moving = ball.update(time * 0.001); // Convert time from ms to seconds

    if (moving || map.mapLoaded() < 1.0) map.draw(ball.cameraPos());
    if (moving) markers.update();
    if (ball.cursorChanged()) toolTip.update();
  }
}
