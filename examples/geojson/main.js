'use strict';

import { initGlobe } from "../../dist/globelet.bundle.js";

export function main() {
  // Initialize globe and start animation loop
  initGlobe({
    container: 'globe',
    toolTip: 'toolTip',
    style: "./klokantech-basic-style-geojson.json",
    center: [-100, 38.5],
    altitude: 6280,
  }).then(globe => globe.startAnimation());
}
