import { newElement, newSVG } from "./dom.js";

export function initInfoBox(globeDiv, infoDiv) {
  const nullFn = () => null;
  if (!infoDiv) return { showInfo: nullFn, hideInfo: nullFn, destroy: nullFn };

  // Construct a slider div, with coords div and close button in a top bar
  const infoSlider = newElement("div", "infoslider");
  globeDiv.parentNode.appendChild(infoSlider);
  const topBar = infoSlider.appendChild(newElement("div", "infoTopBar"));
  const coords = topBar.appendChild(newElement("span"));
  const infoCloseButton = topBar.appendChild(newElement("button"));
  infoCloseButton.appendChild(newSVG("svg", { "class": "icon stroke" }))
    .appendChild(newSVG("use", { "href": "#close" }));
  infoCloseButton.addEventListener("click", hideInfo);

  // Store original position of info div, then wrap it inside the slider div
  const { parentNode, nextSibling } = infoDiv;
  infoSlider.appendChild(infoDiv);
  infoDiv.classList.add("infobox");

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
    // Restore info div to original position
    if (nextSibling) {
      parentNode.insertBefore(infoDiv, nextSibling);
    } else {
      parentNode.appendChild(infoDiv);
    }
    infoSlider.remove();
  }
}
