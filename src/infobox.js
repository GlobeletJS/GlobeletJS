import { newElement, newSVG } from "./dom.js";

export function initInfoBox(globeDiv) {
  const container = globeDiv.parentNode;
  const infoDivs = container.getElementsByClassName("infobox");
  if (!infoDivs.length) return { showInfo: () => null, hideInfo: () => null };

  // Construct the parent info slider, insert before user info divs
  const infoSlider = newElement("div", "infoslider");
  container.insertBefore(infoSlider, infoDivs[0]);

  // Construct the info slider header: span for coordinates, close button
  const infoTopBar = infoSlider.appendChild(newElement("div", "infoTopBar"));
  const coords = infoTopBar.appendChild(newElement("span"));
  const infoCloseButton = infoTopBar.appendChild(newElement("button"));
  infoCloseButton.appendChild(newSVG("svg", { "class": "icon stroke" }))
    .appendChild(newSVG("use", { "href": "#close" }));

  infoCloseButton.addEventListener("click", hideInfo);

  // Move the user-supplied infoDivs to slider
  Array.from(infoDivs).forEach(infoSlider.appendChild, infoSlider);

  return { showInfo, hideInfo, infoCloseButton, destroy };

  function showInfo([lon, lat]) {
    coords.innerHTML = lon.toFixed(4) + " " + lat.toFixed(4);
    infoSlider.classList.add("slid");
    globeDiv.classList.add("shifted");
  }

  function hideInfo() {
    infoSlider.classList.remove("slid");
    globeDiv.classList.remove("shifted");
  }

  function destroy() {
    Array.from(infoDivs).forEach(container.appendChild, container);
    infoSlider.remove();
  }
}
