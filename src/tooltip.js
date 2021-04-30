// Update tooltip text when mouse or scene changes
export function printToolTip(toolTip, ball) {
  // Input toolTip is an HTML element where positions will be printed
  if (!toolTip) return;

  // Print altitude and lon/lat of camera
  toolTip.innerHTML = ball.cameraPos[2].toPrecision(5) + "km " +
    lonLatString(ball.cameraPos[0], ball.cameraPos[1]);

  if ( ball.isOnScene() ) {
    // Add lon/lat of mouse
    toolTip.innerHTML += "<br> Cursor: " + 
      lonLatString(ball.cursorPos[0], ball.cursorPos[1]);
  }
}

function lonLatString(longitude, latitude) {
  // Format lon/lat into degree-minute-second strings
  var string = ( longitude < 0.0 )
    ? degMinSec( Math.abs(longitude) ) + "W"
    : degMinSec(longitude) + "E";

  string += ( latitude < 0.0 )
    ? degMinSec( Math.abs(latitude) ) + "S"
    : degMinSec(latitude) + "N";

  return string;
}

// Convert radians to degrees, minutes, seconds.
// Input MUST be >= 0.0
function degMinSec( radians ) {
  if (radians < 0.0) return null;

  var deg = Math.abs(radians) * 180.0 / Math.PI;
  var min = 60.0 * ( deg - Math.floor(deg) );
  var sec = 60.0 * ( min - Math.floor(min) );  
  deg = Math.floor(deg);
  min = Math.floor(min);
  sec = Math.floor(sec);

  // Combine into fixed-width string
  if ( deg < 10 ) {
    deg = "&nbsp;&nbsp;" + deg;
  } else if ( deg < 100 ) {
    deg = "&nbsp;" + deg;
  }
  min = ( min < 10 ) 
    ? "0" + min
    : min;
  sec = ( sec < 10 )
    ? "0" + sec
    : sec;
  return deg + "&#176;" + min + "'" + sec + '"';
}
