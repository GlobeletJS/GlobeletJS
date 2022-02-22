# Globelet

Lightweight vector maps on a globe

Inspired by [Leaflet][]: a simple, light-weight mapping library, without the 
distortion of flat maps. Show your GIS data in 3D, as it would appear from 
space.

See a [simple interactive example][example] with mountain peaks from 
[Natural Earth][] displayed over the [Basic Style][] from [OpenMapTiles][].

Like Leaflet, we design for *simplicity*, *performance*, and *usability*.

Need lots of features, like 3D buildings? Try [CesiumJS][]. Globelet will only do
a few things, but it will do them well.

[Leaflet]: https://github.com/Leaflet/Leaflet
[example]: https://globeletjs.org/examples/mountains/index.html
[Natural Earth]: https://www.naturalearthdata.com/
[Basic Style]: https://github.com/openmaptiles/maptiler-basic-gl-style
[OpenMapTiles]: https://openmaptiles.org/
[CesiumJS]: https://github.com/AnalyticalGraphicsInc/cesium

![tests](https://github.com/GlobeletJS/GlobeletJS/actions/workflows/node.js.yml/badge.svg)

## How to add GlobeletJS code to your webpage
GlobeletJS is provided as an ESM import. Define your script tag as
`type="module"`, then import the module:
```html
<script type="module">
  import * as globeletjs from "https://unpkg.com/globeletjs@<VERSION>/dist/globelet.js";

  // Add code to initialize a globe here...
  // ...
</script>
```

Or if you prefer, you can use the older-style [IIFE][] bundle:
```html
<script src="https://unpkg.com/globeletjs@<VERSION>/dist/globelet-iife.js">
```

Either bundle will give you a global variable `globeletjs`, which has an 
`initGlobe` method. See the next section for how to use this method.

Make sure to also link to the stylesheet (/dist/globelet.css) in the `<head>`
of your HTML file.
```html
<link 
  rel="stylesheet" 
  type="text/css" 
  href="https://unpkg.com/globeletjs@<VERSION>/dist/globelet.css">
```

[IIFE]: https://developer.mozilla.org/en-US/docs/Glossary/IIFE

## How to initialize a globe
The `globeletjs` object has an `initGlobe` method that can initialize a new 
globe as follows:
```javascript
const params = {
  container: 'globe',
  style: "./klokantech-basic-style-geojson.json",
  center: [-100, 38.5],
  altitude: 6280,
};

const globePromise = globeletjs.initGlobe(params);
```

The `params` object supplied to initGlobe can have the following properties:
- `container` (REQUIRED): An [HTML DIV element][] (or its string [ID][]) where
  the globe will be displayed
- `infobox`: An [HTML DIV element][] (or its string [ID][]) where information
  about a map feature will be displayed. NOTE: if supplied, this element will
  be wrapped inside a sliding pane with a close button. See the API methods
  `showInfo` and `hideInfo` for more information
- `style` (REQUIRED): A link to a [MapLibre style document][Maplibre] 
  describing the map to be rendered. Please see below for some notes about
  [supported map styles](#supported-map-styles).
- `mapboxToken`: Your API token for Mapbox services (if needed)
- `width`: The width of the map that will be projected onto the globe,
  in pixels. Defaults to `container.clientWidth + 512`
- `height`: The height of the map that will be projected onto the globe,
  in pixels. Defaults to `container.clientHeight + 512`
- `center`: The initial geographic position of the camera, given as
  [longitude, latitude] in degrees. Default: [0.0, 0.0]
- `altitude`: The initial altitude of the camera, in kilometers.
  Default: 20000
- `minAltitude`: The minimum altitude of the camera, in kilometers.
  Default: `0.0001 * earthRadius`
- `maxAltitude`: The maximum altitude of the camera, in kilometers.
  Default: `8.0 * earthRadius`
- `minLongitude, minLatitude, maxLongitude, maxLatitude`: Geographic limits on
  camera movement. By default, the globe can be spun and zoomed to any point
  on the planet. Setting these limits will restrict motion to a specified box.
  See [spinning-ball][] documentation for further details

The returned Promise resolves to an API handle, which you can use to interact
with the globe, as described in the next section.

[ID]: https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/id
[HTML DIV element]: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/div
[MapLibre]: https://maplibre.org/maplibre-gl-js-docs/style-spec/

## How to interact with the globe API
The Promise returned by `initGlobe` resolves to an API object, which you can
use to control the globe.

```javascript
globePromise.then(globeAPI => {
  globeAPI.startAnimation();

  // ...etc. Do more things with globeAPI here...
});
```

`globeAPI` exposes the following properties and methods:
- `mapLoaded()`: Returns a fractional number from 0.0 to 1.0 indicating the
  fraction of the tiles needed for the current view that are fully loaded
- `select(layer, dxy)`: Selects map features from the specified layer, within
  pixel distance `dxy` from the current cursor position
- `showLayer(layer)`: Turns on rendering for the specified map layer
- `hideLayer(layer)`: Turns off rendering for the specified map layer
- `getZoom()`: Returns the current zoom level of the map
- `startAnimation()`: Starts animation
- `stopAnimation()`: Stops animation
- `update(time)`: Updates the camera position based on current position and
  velocity and cursor inputs since the last update. Input is a timestamp in
  milliseconds as supplied by [requestAnimationFrame][]. For animation loops
  managed by the parent program
- `cameraPos()`: Returns the camera position as reported by [spinning-ball][] 
- `cursorPos()`: Returns the cursor position as reported by [spinning-ball][]
- `isMoving()`: Returns the value of the camMoving flag in [spinning-ball][]
- `wasTapped()`: Returns the value of the wasTapped flag in [spinning-ball][]
- `addMarker(options)`: Adds a marker to the globe. See markers section below
- `removeMarker(marker)`: Removes a given marker from memory and from the DOM
- `showInfo(coords)`: Reveals a side pane (or bottom pane on mobile) wrapping
  the `infobox` DIV supplied on initialization, and prints the supplied
  coordinates (presumably [lon, lat]) in the top bar. Note: if no `infobox`
  was supplied on init, this method will do nothing
- `hideInfo()`: Hides the infobox pane. This method will automatically be
  called if a user presses the close button on the pane
- `infoCloseButton`: A link to the close button on the info pane. Can be used
  to execute custom scripts when the info pane is closed (e.g., to remove
  markers)
- `destroy()`: Clears memory / removes elements from document

[requestAnimationFrame]: https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame
[spinning-ball]: https://github.com/GlobeletJS/spinning-ball

## How to add and remove markers
A marker can be added to the globe as follows:
```javascript
const marker = globeAPI.addMarker(options);
```

where `options` is an object with the following properties:
- `element`: A link to an HTML Element that will be used to visualize the
  marker position. If not supplied, a default SVG will be used
- `type`: The type of marker. If `type === "spot"`, the marker element will
  default to a circular SVG; otherwise it defaults to a standard placemarker 
  SVG
- `position`: An Array containing longitude and latitude of the desired
  marker position, in degrees, and (optionally) the altitude in kilometers

The returned `marker` object has the following properties:
- `element`: Back-link to the HTML element used to represent the marker
  position
- `position`: A Float64Array containing the longitude and latitude of the marker
  position, in degrees, and its altitude in kilometers
- `screenPos`: A 2-element Array containing the current screen position of the
  marker, in pixels from top left

At each animation frame (or each call to globeAPI.update()), GlobeletJS will 
automatically update `screenPos`, and use it to set the element's displayed 
position via `style.left` and `style.top`.

A marker can be removed from the globe as follows:
```javascript
globeAPI.removeMarker(marker);
```

## Supported map styles
Many features described in the [style specification][MapLibre] are not yet
supported. This is partly by design--GlobeletJS is intended to be an 80/20
map solution, implementing 80% of the specification with 20% as much code as
other software. But we are adding support for more features over time.

The map rendering is delegated to the [tile-setter][] module, which is
limited by some of its dependencies. See the ["un-supported features" list for
tile-stencil][tile-stencil-limitations] and the [tile-gl TODO list][tile-gl-todo]
for an (incomplete) list of what is not supported.

We welcome your feedback on what additional features you would like to see
supported. Or better yet, try adding them yourself! See the
[contributing guidelines](./CONTRIBUTING.md) for how to get started.


[tile-setter]: https://github.com/GlobeletJS/tile-setter
[tile-stencil-limitations]: https://github.com/GlobeletJS/tile-stencil#un-supported-features
[tile-gl-todo]: https://github.com/GlobeletJS/tile-gl#todo
