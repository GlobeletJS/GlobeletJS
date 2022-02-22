import { getWikiData } from "./wiki-api.js";

export function initMountains(globe) {
  const infobox = document.getElementById("infobox");
  let spot, marker;

  globe.infoCloseButton.addEventListener("click", function() {
    if (marker) globe.removeMarker(marker);
    infobox.innerHTML = "";
  });

  return findMountain;

  function findMountain() {
    if (spot) globe.removeMarker(spot);

    const mountain = globe.select("mountains", 12);
    if (mountain) markMountain(mountain);
  }

  function markMountain(mountain) {
    const position = mountain.geometry.coordinates;

    if (globe.wasTapped()) {
      if (marker) globe.removeMarker(marker);
      marker = globe.addMarker({ position, type: "marker" });
      describeMountain(position, mountain.properties);
    } else {
      spot = globe.addMarker({ element: createIcon(), position });
    }
  }

  function describeMountain(position, properties) {
    const { name, elevation, wikidataid } = properties;

    const title = "<h1>" + name + "</h1>";
    const elev = "<p><b>Elevation:</b> " + elevation + "m</p>";
    // const json = "<pre>" + JSON.stringify(properties, null, 2) + "</pre>";

    getWikiData(wikidataid).then(data => {
      const { image, text, sources } = data;

      infobox.innerHTML = title + image + elev + text + sources; // + json;
      globe.showInfo(position);
    });
  }
}

function createIcon() {
  const svg = newSVG("svg", { "class": "mtIcon" });
  svg.appendChild(newSVG("use", { "href": "#mtIcon" }));
  return svg;
}

function newSVG(tagName, attributes) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", tagName);
  Object.entries(attributes).forEach(([k, v]) => svg.setAttribute(k, v));
  return svg;
}
