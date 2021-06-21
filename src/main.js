import { setParams } from "./params.js";
import { initMap } from "./map.js";
import * as spinningBall from 'spinning-ball';
import * as satelliteView from 'satellite-view';
import { initEventHandler } from "./events.js";
import { printToolTip } from "./tooltip.js";
import { initMarkers } from "./markers.js";

export function initGlobe(userParams) {
  const params = setParams(userParams);

  return initMap(params)
    .then(map => setup(map, params))
    .catch(console.log);
}

function setup(map, params) {
  var requestID;

  const ball = spinningBall.init(params.container, params.center, params.altitude);
  const satView = satelliteView.init({
    context: params.context,
    globeRadius: ball.radius(),
    map: map.texture,
    flipY: false,
  });
  const eventHandler = initEventHandler();
  const markers = initMarkers(ball, params.container);

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

    destroy: satView.destroy,
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
    if (ball.cursorChanged()) printToolTip(params.toolTip, ball);
  }
}
