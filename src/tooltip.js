export function printToolTip(toolTip, ball) {
  // Input toolTip is an HTML element where positions will be printed
  if (!toolTip) return;

  // Print altitude and lon/lat of camera
  const cameraPos = ball.cameraPos();
  const alt = cameraPos[2].toPrecision(5);
  toolTip.innerHTML = alt + "km " + lonLatString(...cameraPos);

  if (ball.isOnScene()) {
    toolTip.innerHTML += "<br> Cursor: " + lonLatString(...ball.cursorPos());
  }
}

function lonLatString(longitude, latitude) {
  const ew = (longitude < 0.0) ? "W" : "E";
  const lonString = degMinSec(longitude) + ew;

  const ns = (latitude < 0.0) ? "S" : "N";
  const latString = degMinSec(latitude) + ns;

  return lonString + latString;
}

function degMinSec(degrees) {
  const deg = Math.abs(degrees);
  const min = 60.0 * (deg - Math.floor(deg));
  const sec = 60.0 * (min - Math.floor(min));

  // Combine into fixed-width string
  const iStr = f => Math.floor(f).toString();

  const d = iStr(deg).padStart(3, " ").replace(/ /g, "&nbsp;") + "&#176;";
  const m = iStr(min).padStart(2, "0") + "'";
  const s = iStr(sec).padStart(2, "0") + '"';

  return d + m + s;
}
